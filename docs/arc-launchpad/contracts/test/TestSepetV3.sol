// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { HaberciLZ, ILzUcNokta2, ITokenMesajciLZ } from "../sepet/HaberciLZ.sol";
import { SepetDefteri } from "../sepet/SepetDefteri.sol";
import { SepetKasasi } from "../sepet/SepetKasasi.sol";
import { SepetUcu } from "../sepet/SepetUcu.sol";
import { IHaberci, IHaberAlici, IERC20S, SepetMesaj, Adres } from "../sepet/IHaberci.sol";
import { CikisMesaj } from "../sepet/Cikis.sol";
import { SahteJeton } from "./SahteJeton.sol";
import { ZincirTablosu } from "../lz/ZincirTablosu.sol";
import { IMesajTasiyiciV2 } from "../nesil2/CctpMesaj.sol";

/// A token for the test: free minting, no allowances, and an address it
/// refuses to send to (a blocklist, as some stock and stable tokens have).
contract V3Jeton {
    mapping(address => uint256) public balanceOf;
    address public kara;
    constructor(address _kara) { kara = _kara; }
    function bas(address a, uint256 v) external { balanceOf[a] += v; }
    function approve(address, uint256) external pure returns (bool) { return true; }
    function transfer(address to, uint256 v) external returns (bool) { return _t(msg.sender, to, v); }
    function transferFrom(address f, address to, uint256 v) external returns (bool) { return _t(f, to, v); }
    function _t(address f, address to, uint256 v) internal returns (bool) {
        require(to != kara, "kara liste");
        balanceOf[f] -= v;
        balanceOf[to] += v;
        return true;
    }
}

/// One chain's messenger in an in-memory network of them: an order is
/// delivered at once to its target on the target chain's messenger, a
/// payout is recorded (and handed over, all chains sharing one token here).
contract V3Haberci is IHaberci {
    uint32 public immutable zincir;
    IERC20S public immutable usdc;
    V3Ag public immutable ag;
    mapping(uint32 => mapping(bytes32 => uint256)) public odenen;
    mapping(uint32 => uint8) public sonTur;
    mapping(uint32 => uint256) public sonBoy;
    constructor(uint32 z, IERC20S u, V3Ag a) { zincir = z; usdc = u; ag = a; }
    function ada(uint32 z) external pure returns (bool) { return z == 17; }
    function gonder(uint32 hz, bytes32 hedef, bytes calldata veri, uint256 miktar) external {
        if (miktar > 0) usdc.transferFrom(msg.sender, address(this), miktar);
        if (veri.length == 0) {
            odenen[hz][hedef] += miktar;
            usdc.transfer(Adres.evm(hedef), miktar);
            return;
        }
        sonTur[hz] = uint8(uint256(bytes32(veri[:32])));
        sonBoy[hz] = veri.length;
        V3Haberci karsi = ag.h(hz);
        if (miktar > 0) usdc.transfer(address(karsi), miktar);
        karsi.teslim(zincir, Adres.b32(msg.sender), hedef, veri, miktar);
    }
    function teslim(uint32 kz, bytes32 kaynak, bytes32 hedef, bytes calldata veri, uint256 miktar) external {
        if (miktar > 0) usdc.transfer(Adres.evm(hedef), miktar);
        IHaberAlici(Adres.evm(hedef)).haberAl(kz, kaynak, veri, miktar);
    }
}

contract V3Ag {
    mapping(uint32 => V3Haberci) public h;
    function ekle(V3Haberci x) external { h[x.zincir()] = x; }
}

/// What a Solana / Sui / Aptos vault sees: it records the order's kind.
contract V3UzakKasa is IHaberAlici {
    uint8 public sonTur;
    uint256 public sayi;
    function haberAl(uint32, bytes32, bytes calldata veri, uint256) external {
        sonTur = uint8(uint256(bytes32(veri[:32])));
        sayi++;
    }
}

/// relay.link's open deposit address, as the holder sees it: whatever of
/// the asset lands here, relay's solver pays out as dollars to the recipient
/// on the holder's chain (here at a fixed price, from its own float).
contract V3RelaySim {
    V3Jeton public immutable varlik;
    V3Jeton public immutable dolar;
    address public immutable alici;
    uint256 public immutable fiyat;   // dollars (6 dp) per 1e18 units
    uint256 public islenen;
    constructor(V3Jeton v, V3Jeton d, address a, uint256 f) { varlik = v; dolar = d; alici = a; fiyat = f; }
    function coz() external returns (uint256 odenen) {
        uint256 yeni = varlik.balanceOf(address(this)) - islenen;
        islenen += yeni;
        odenen = (yeni * fiyat) / 1e18;
        dolar.bas(alici, odenen);
    }
}

/// The v3 redemption (auction-free exits), two ways, in one eth_call:
///   A. an in-memory five-chain network (Arc, Base, BNB island, Solana) with
///      the real Defter, Kasa and Ucu code: a holder names an exit per line;
///      exits are honoured on EVM vaults, ignored for Solana, refused
///      gracefully (auction) for a blocked or non-EVM exit, and a redemption
///      without exits behaves exactly as v2.
///   B. on Arc mainnet state with the real HaberciLZ, Arc's USDC and its
///      LayerZero endpoint: the Arc line's units leave to a deposit address
///      and the Base line's v3 order leaves over LayerZero.
contract TestSepetV3 {
    uint32 constant ARC = 26;
    uint32 constant BASE = 6;
    uint32 constant BNB = 17;
    uint32 constant SOL = 5;

    struct Sonuc {
        /* A */
        bool alimlarDoldu;
        uint256 arcCikis; uint256 arcBeklenen; uint256 arcIhaleOnce; uint256 arcIhaleSonra;
        uint256 baseIhaleOnce; uint256 baseIhaleSonra; uint256 aynisi; uint256 aynisiBeklenen;
        uint256 bnbCikis; uint8 baseTur; uint8 bnbTur; uint8 solTur; uint256 solSayi;
        uint256 relayOdedi;
        bool karaIhaleyeDondu; uint256 karaIhale; bool evmDisiIhale; bool yanlisSayiEski;
        bool eskiItfaEski; uint256 eskiIhaleArtis;
        bool defterUyumlu; bool kasaUyumlu; bool baskaLaunchSaglam;
        uint256 gazEski; uint256 gazCikisli;
        bool ucuBosRed; bool ucuFazlaRed;
        /* B */
        uint256 bArcCikis; uint256 bArcBeklenen; bool bBaseGitti; uint256 bIhale; uint256 bDolar;
    }

    function _b(address a) internal pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    V3Ag ag;
    V3Jeton dolar;
    SepetDefteri d;
    SepetUcu ucu;
    SepetKasasi kArc; SepetKasasi kBase; SepetKasasi kBnb;
    V3UzakKasa kSol;
    V3Jeton aArc; V3Jeton aBase; V3Jeton bBase; V3Jeton aBnb;
    bytes32 constant SOL_MINT = keccak256("a Solana mint");
    address constant KARA = address(0xB10C);
    address constant HOLDER = address(0x40D3);

    function run() external returns (Sonuc memory s) {
        _kur();
        SahteJeton t1 = _launch(1);
        s.alimlarDoldu = kArc.bakiye(1, address(aArc)) == 100e18 && kBase.bakiye(1, address(aBase)) == 100e18
            && kBase.bakiye(1, address(bBase)) == 100e18 && kBnb.bakiye(1, address(aBnb)) == 100e18;
        /* a second launch holding the same Arc asset: its units must not move */
        _launch(2);

        /* the holder redeems 10%, paid on Base: Arc line to a relay deposit
           address, Base WETH-like line to auction (no exit), Base second line
           in kind to the holder's own address, BNB line to a deposit address,
           Solana line's exit ignored (Solana's vault reads only the old order) */
        V3RelaySim relay = new V3RelaySim(aArc, dolar, HOLDER, 2e6);
        bytes32[] memory c = new bytes32[](5);
        c[0] = _b(address(relay)); c[1] = bytes32(0); c[2] = _b(HOLDER); c[3] = _b(address(0xDE90B)); c[4] = keccak256("a Solana deposit");
        s.arcIhaleOnce = kArc.ihaleSayisi(); s.baseIhaleOnce = kBase.ihaleSayisi();
        uint256 g0 = gasleft();
        ucu.itfaCikis(address(t1), 1e26, BASE, _b(HOLDER), c);
        s.gazCikisli = g0 - gasleft();
        s.arcCikis = aArc.balanceOf(address(relay)); s.arcBeklenen = 10e18;
        s.arcIhaleSonra = kArc.ihaleSayisi(); s.baseIhaleSonra = kBase.ihaleSayisi();
        s.aynisi = bBase.balanceOf(HOLDER); s.aynisiBeklenen = 10e18;
        s.bnbCikis = aBnb.balanceOf(address(0xDE90B));
        V3Haberci hArc = ag.h(ARC);
        s.baseTur = hArc.sonTur(BASE); s.bnbTur = hArc.sonTur(BNB); s.solTur = kSol.sonTur(); s.solSayi = kSol.sayi();
        s.relayOdedi = relay.coz();

        /* a blocked exit and a non-EVM exit: those lines go to auction, nothing reverts */
        bytes32[] memory c2 = new bytes32[](5);
        c2[0] = keccak256("not an EVM address"); c2[2] = _b(KARA);
        uint256 ia = kArc.ihaleSayisi(); uint256 ib = kBase.ihaleSayisi();
        ucu.itfaCikis(address(t1), 1e26, BASE, _b(HOLDER), c2);
        s.evmDisiIhale = kArc.ihaleSayisi() == ia + 1;
        s.karaIhale = kBase.ihaleSayisi() - ib;
        s.karaIhaleyeDondu = s.karaIhale == 2 && aBase.balanceOf(KARA) == 0 && bBase.balanceOf(KARA) == 0;

        /* exits of the wrong count: ignored, the v2 order goes everywhere */
        bytes32[] memory c3 = new bytes32[](2);
        c3[0] = _b(HOLDER); c3[1] = _b(HOLDER);
        uint256 h0 = aArc.balanceOf(HOLDER);
        ucu.itfaCikis(address(t1), 1e26, BASE, _b(HOLDER), c3);
        s.yanlisSayiEski = hArc.sonTur(BASE) == SepetMesaj.SAT && hArc.sonTur(BNB) == SepetMesaj.SAT && aArc.balanceOf(HOLDER) == h0;

        /* the v2 entry, unchanged: every line to auction */
        ia = kArc.ihaleSayisi();
        g0 = gasleft();
        ucu.itfa(address(t1), 1e26, BASE, _b(HOLDER));
        s.gazEski = g0 - gasleft();
        s.eskiIhaleArtis = kArc.ihaleSayisi() - ia;
        s.eskiItfaEski = hArc.sonTur(BASE) == SepetMesaj.SAT && s.eskiIhaleArtis == 1;

        /* the ledger: what each vault holds is exactly what its ledger says */
        s.kasaUyumlu = aArc.balanceOf(address(kArc)) == kArc.bakiye(1, address(aArc)) + kArc.bakiye(2, address(aArc)) + _ihaledeki(kArc, address(aArc))
            && bBase.balanceOf(address(kBase)) == kBase.bakiye(1, address(bBase)) + kBase.bakiye(2, address(bBase)) + _ihaledeki(kBase, address(bBase));
        s.baskaLaunchSaglam = kArc.bakiye(2, address(aArc)) == 200e18 && kBase.bakiye(2, address(bBase)) == 200e18;
        (,, uint256 arz,,,) = d.launchlar(1);
        s.defterUyumlu = arz == 1e27 - 4e26;

        try ucu.itfaCikis(address(t1), 1, BASE, _b(HOLDER), new bytes32[](0)) { } catch (bytes memory e) { s.ucuBosRed = bytes4(e) == SepetUcu.KotuSepet.selector; }
        try ucu.itfaCikis(address(t1), 1, BASE, _b(HOLDER), new bytes32[](6)) { } catch (bytes memory e) { s.ucuFazlaRed = bytes4(e) == SepetUcu.KotuSepet.selector; }

        _arc(s);
    }

    /// Units still for sale in a vault's open sell auctions of `v`.
    function _ihaledeki(SepetKasasi k, address v) internal view returns (uint256 t) {
        uint256 n = k.ihaleSayisi();
        for (uint256 i = 0; i < n; i++) {
            (uint8 tur,, address varlik, uint256 verilen,,,,, bool bitti) = k.ihaleler(i);
            if (tur == 2 && varlik == v && !bitti) t += verilen;
        }
    }

    function _kur() internal {
        ag = new V3Ag();
        dolar = new V3Jeton(address(0));
        uint32[4] memory zz = [ARC, BASE, BNB, SOL];
        for (uint256 i = 0; i < 4; i++) ag.ekle(new V3Haberci(zz[i], IERC20S(address(dolar)), ag));
        d = new SepetDefteri(IHaberci(address(ag.h(ARC))), IERC20S(address(dolar)));
        kArc = new SepetKasasi(IHaberci(address(ag.h(ARC))), IERC20S(address(dolar)), ARC, _b(address(d)));
        kBase = new SepetKasasi(IHaberci(address(ag.h(BASE))), IERC20S(address(dolar)), ARC, _b(address(d)));
        kBnb = new SepetKasasi(IHaberci(address(ag.h(BNB))), IERC20S(address(dolar)), ARC, _b(address(d)));
        kSol = new V3UzakKasa();
        ucu = new SepetUcu(IHaberci(address(ag.h(ARC))), IERC20S(address(dolar)), ARC, _b(address(d)), address(this));
        d.bagla(ARC, _b(address(ucu)), _b(address(kArc)));
        d.bagla(BASE, _b(address(0xB1)), _b(address(kBase)));
        d.bagla(BNB, _b(address(0xB2)), _b(address(kBnb)));
        d.bagla(SOL, _b(address(0x501)), _b(address(kSol)));
        aArc = new V3Jeton(address(0)); aBase = new V3Jeton(KARA); bBase = new V3Jeton(KARA); aBnb = new V3Jeton(address(0));
        dolar.bas(address(this), 10_000e6);
        dolar.approve(address(ucu), type(uint256).max);
    }

    /// A launch with five $50 lines (Arc, Base x2, BNB, Solana); each EVM
    /// line's buy auction is filled at once with 100 units.
    function _launch(uint256 n) internal returns (SahteJeton t) {
        t = new SahteJeton(1e27, address(this));
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](5);
        k[0] = SepetDefteri.Kalem(ARC, _b(address(aArc)), 50e6);
        k[1] = SepetDefteri.Kalem(BASE, _b(address(aBase)), 50e6);
        k[2] = SepetDefteri.Kalem(BASE, _b(address(bBase)), 50e6);
        k[3] = SepetDefteri.Kalem(BNB, _b(address(aBnb)), 50e6);
        k[4] = SepetDefteri.Kalem(SOL, SOL_MINT, 50e6);
        uint256[] memory ref = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) ref[i] = 50e18;
        ucu.baslat(address(t), address(this), 1e27, k, ref);
        _doldur(kArc, aArc, n); _doldur(kBase, aBase, n); _doldur(kBase, bBase, n); _doldur(kBnb, aBnb, n);
    }

    function _doldur(SepetKasasi k, V3Jeton v, uint256 launchId) internal {
        uint256 m = k.ihaleSayisi();
        for (uint256 i = 0; i < m; i++) {
            (uint8 tur, uint64 l, address varlik,,,,,, bool bitti) = k.ihaleler(i);
            if (tur != 1 || bitti || l != launchId || varlik != address(v)) continue;
            /* the second launch's auction starts from the first fill's price (twice 100 units): filled at its start */
            uint256 q = launchId == 1 ? 100e18 : k.istenen(i);
            v.bas(address(this), q);
            k.doldur(i, q);
        }
    }

    /* ---- B: Arc mainnet state, the real messenger ------------------------ */

    IERC20S constant USDC = IERC20S(0x3600000000000000000000000000000000000000);
    ITokenMesajciLZ constant TM = ITokenMesajciLZ(0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d);
    IMesajTasiyiciV2 constant MT = IMesajTasiyiciV2(0x81D40F21F12A8F0E3252Bccb954D722d4c464B64);

    function _sec(uint128 gaz) internal pure returns (bytes memory) { return abi.encodePacked(uint16(3), uint8(1), uint16(17), uint8(1), gaz); }

    function _arc(Sonuc memory s) internal {
        if (block.chainid != 5042) return;
        ZincirTablosu.Zincir memory z = ZincirTablosu.burasi();
        HaberciLZ h = new HaberciLZ(USDC, ILzUcNokta2(z.endpoint), TM, MT, ARC, ARC, true, IERC20S(address(0)));
        ZincirTablosu.dvnYaz(address(h));
        h.ikizEkle(BASE, 30184, _b(address(0xBA5E)));
        h.yolKur(BASE, h.YONLENDIR(), address(0), 150_000, bytes32(0));
        h.secenekKur(_sec(600_000));
        SepetDefteri dd = new SepetDefteri(IHaberci(address(h)), USDC);
        SepetKasasi ka = new SepetKasasi(IHaberci(address(h)), USDC, ARC, _b(address(dd)));
        SepetUcu u = new SepetUcu(IHaberci(address(h)), USDC, ARC, _b(address(dd)), address(this));
        dd.bagla(ARC, _b(address(u)), _b(address(ka)));
        dd.bagla(BASE, _b(address(0xB1)), _b(address(0xCA5A)));
        V3Jeton v = new V3Jeton(address(0));
        SahteJeton t = new SahteJeton(1e27, address(this));
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](2);
        k[0] = SepetDefteri.Kalem(ARC, _b(address(v)), 50e6);
        k[1] = SepetDefteri.Kalem(BASE, _b(0x4200000000000000000000000000000000000006), 50e6);
        uint256[] memory ref = new uint256[](2);
        ref[0] = 50e18; ref[1] = 2e16;
        USDC.approve(address(u), 100e6);
        u.baslat(address(t), address(this), 1e27, k, ref);
        v.bas(address(this), 100e18);
        ka.doldur(0, 100e18);
        USDC.transfer(address(h), 2e6);   // the fee balance a redemption tops up
        bytes32[] memory c = new bytes32[](2);
        c[0] = _b(address(0xDE905A)); c[1] = _b(address(0xDE905B));
        u.itfaCikis(address(t), 1e26, BASE, _b(HOLDER), c);
        s.bArcCikis = v.balanceOf(address(0xDE905A)); s.bArcBeklenen = 10e18;
        s.bIhale = ka.ihaleSayisi();
        s.bBaseGitti = true;
        s.bDolar = USDC.balanceOf(address(h));
    }

    receive() external payable {}
}
