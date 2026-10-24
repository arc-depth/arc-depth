// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IHaberci, IERC20S, SepetMesaj, Adres} from "../src/arc/sepet/IHaberci.sol";
import {SepetDefteri} from "../src/arc/sepet/SepetDefteri.sol";
import {SepetKasasi} from "../src/arc/sepet/SepetKasasi.sol";
import {SepetUcu} from "../src/arc/sepet/SepetUcu.sol";
import {HaberciCctp} from "../src/arc/sepet/HaberciCctp.sol";
import {IMesajTasiyiciV2, ITokenMesajciV2} from "../src/arc/nesil2/CctpMesaj.sol";
import {AdaKapisi, ILzUcNokta, IAdaHaberci, LzOrigin, LzParams, LzFee, LzReceipt} from "../src/arc/sepet/AdaKapisi.sol";
import {IAdaKapisi} from "../src/arc/sepet/HaberciCctp.sol";

/// One LayerZero endpoint for every chain in this EVM: `send` queues,
/// `teslim` delivers in order the way the executor would, from the endpoint.
contract SahteLz {
    struct P { uint32 src; bytes32 gonderen; bytes32 alici; bytes m; }
    P[] public q;
    uint256 public sira;
    mapping(address => uint32) public eidOf;
    function kaydet(address oapp, uint32 eid) external { eidOf[oapp] = eid; }
    function setDelegate(address) external {}
    function quote(LzParams calldata, address) external pure returns (LzFee memory f) { return f; }
    function send(LzParams calldata p, address) external payable returns (LzReceipt memory r) {
        q.push(P(eidOf[msg.sender], bytes32(uint256(uint160(msg.sender))), p.receiver, p.message));
        r.guid = keccak256(abi.encode(q.length));
        r.nonce = uint64(q.length);
    }
    function teslim() external returns (uint256 k) {
        while (sira < q.length) {
            P memory x = q[sira++];
            AdaKapisi(address(uint160(uint256(x.alici)))).lzReceive(LzOrigin(x.src, x.gonderen, uint64(sira)), bytes32(0), x.m, address(this), "");
            k++;
        }
    }
}

interface IMT2 {
    function initialize(address, address, address, address, address[] calldata, uint256, uint256) external;
    function receiveMessage(bytes calldata, bytes calldata) external returns (bool);
}
interface ITM2 {
    struct Roles { address owner; address rescuer; address feeRecipient; address denylister; address tokenMinter; address minFeeController; }
    function initialize(Roles calldata, uint256, uint32[] calldata, bytes32[] calldata) external;
    function addRemoteTokenMessenger(uint32, bytes32) external;
    function depositForBurnWithHook(uint256, uint32, bytes32, address, bytes32, uint256, uint32, bytes calldata) external;
}
interface IMinter2 {
    function addLocalTokenMessenger(address) external;
    function linkTokenPair(address, uint32, bytes32) external;
    function setMaxBurnAmountPerMessage(address, uint256) external;
}
interface IUSDC2 {
    function mint(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

contract Varlik {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function bas(address k, uint256 v) external { balanceOf[k] += v; totalSupply += v; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
    function transfer(address to, uint256 v) external returns (bool) { balanceOf[msg.sender] -= v; balanceOf[to] += v; return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        if (allowance[f][msg.sender] != type(uint256).max) allowance[f][msg.sender] -= v;
        balanceOf[f] -= v; balanceOf[to] += v; return true;
    }
    function burnFrom(address f, uint256 v) external {
        if (allowance[f][msg.sender] != type(uint256).max) allowance[f][msg.sender] -= v;
        balanceOf[f] -= v; totalSupply -= v;
    }
}

/// A stranger burning dollars to a Haberci with a payload of its choosing.
contract SahteYakan {
    function yak(ITM2 tm, IUSDC2 u, uint32 d, bytes32 haberci, address hedef, bytes calldata veri) external {
        u.approve(address(tm), 5e6);
        tm.depositForBurnWithHook(5e6, d, haberci, address(u), haberci, 0, 2000, abi.encode(bytes32(uint256(uint160(address(this)))), bytes32(uint256(uint160(hedef))), veri));
    }
}

/// The basket system on three chains, each with Circle's real CCTP V2,
/// messages attested the way Iris attests them and delivered by a relayer.
contract SepetCctpTest is Test {
    uint32 constant ARC = 26;
    uint32 constant BASE = 6;
    uint32 constant ARB = 3;
    uint32 constant SUI = 8;
    uint32 constant BNB = 17;                                // an island: no CCTP USDC
    bytes32 constant KUYRUK = keccak256("Kuyruk(uint64,uint32,uint256,bytes)");
    bytes32 constant BEKLIYOR = keccak256("Bekliyor(uint32,uint64,uint256,bytes)");
    SahteLz lz;
    uint256 lzMesaj;
    mapping(uint32 => AdaKapisi) kapi;
    uint32[4] H = [ARC, BASE, ARB, BNB];
    bytes32 constant SUI_TM = bytes32(uint256(0x5e1));      // Sui's TokenMessengerMinter, as CCTP names it
    bytes32 constant SUI_USDC = bytes32(uint256(0x5e2));
    bytes32 constant SUI_YETKI = bytes32(uint256(0x5e3));   // the Sui package's auth identifier
    bytes32 constant SUI_KASA = bytes32(uint256(0x5e4));    // the Sui vault object
    bytes[] disari;
    uint256 constant ATTESTER_PK = 0xA77E57;
    bytes32 constant MESAJ_OLAYI = keccak256("MessageSent(bytes)");
    uint256 constant ARZ = 1_000_000_000e18;

    struct Alan { IUSDC2 usdc; IMinter2 minter; IMT2 mt; ITM2 tm; HaberciCctp h; SepetKasasi kasa; SepetUcu ucu; Varlik varlik; }
    mapping(uint32 => Alan) z;
    uint32[3] D = [ARC, BASE, ARB];
    SepetDefteri defter;
    uint256 nonceSayac = 1;
    uint256 saat = 1_800_000_000;

    address launchpad = address(0x1A0);
    address kurucu = address(0xF00D);
    address tutucu = address(0xB0B);
    address arb = address(0xA2B);
    address tasiyici = address(0x7A51);
    address doldurucu = address(0xD01D);

    function _b(address x) internal pure returns (bytes32) { return bytes32(uint256(uint160(x))); }

    function _alan(uint32 domain) internal returns (Alan memory a) {
        address py = address(uint160(0xAD00 + domain));
        a.usdc = IUSDC2(deployCode("MockMintBurnToken.sol:MockMintBurnToken"));
        vm.mockCall(address(a.usdc), abi.encodeWithSignature("decimals()"), abi.encode(uint8(6)));
        a.minter = IMinter2(deployCode("TokenMinterV2.sol:TokenMinterV2", abi.encode(address(this))));
        address mtImpl = deployCode("MessageTransmitterV2.sol:MessageTransmitterV2", abi.encode(domain, uint32(1)));
        a.mt = IMT2(deployCode("AdminUpgradableProxy.sol:AdminUpgradableProxy", abi.encode(mtImpl, py, bytes(""))));
        address[] memory att = new address[](1);
        att[0] = vm.addr(ATTESTER_PK);
        a.mt.initialize(address(this), address(this), address(this), address(this), att, 1, 8192);
        address tmImpl = deployCode("TokenMessengerV2.sol:TokenMessengerV2", abi.encode(address(a.mt), uint32(1)));
        a.tm = ITM2(deployCode("AdminUpgradableProxy.sol:AdminUpgradableProxy", abi.encode(tmImpl, py, bytes(""))));
        a.tm.initialize(ITM2.Roles(address(this), address(this), address(0xFEE), address(this), address(a.minter), address(this)),
            0, new uint32[](0), new bytes32[](0));
        a.minter.addLocalTokenMessenger(address(a.tm));
        a.minter.setMaxBurnAmountPerMessage(address(a.usdc), 1e30);
        a.h = new HaberciCctp(IERC20S(address(a.usdc)), IMesajTasiyiciV2(address(a.mt)), ITokenMesajciV2(address(a.tm)), domain);
        a.varlik = new Varlik();
    }

    /// BNB: its own dollar (Dolar6 in production), no CCTP, the same Haberci.
    function _ada(uint32 domain) internal returns (Alan memory a) {
        a.usdc = IUSDC2(deployCode("MockMintBurnToken.sol:MockMintBurnToken"));
        a.h = new HaberciCctp(IERC20S(address(a.usdc)), IMesajTasiyiciV2(address(0)), ITokenMesajciV2(address(0)), domain);
        a.varlik = new Varlik();
    }

    function setUp() public {
        vm.warp(saat);
        vm.roll(25_000_000);
        for (uint256 i = 0; i < 3; i++) z[D[i]] = _alan(D[i]);
        z[BNB] = _ada(BNB);
        /* the island gates: every chain reaches BNB over LayerZero, BNB reaches all */
        lz = new SahteLz();
        for (uint256 i = 0; i < 4; i++) {
            kapi[H[i]] = new AdaKapisi(ILzUcNokta(address(lz)), IAdaHaberci(address(z[H[i]].h)), IERC20S(address(z[H[i]].usdc)));
            lz.kaydet(address(kapi[H[i]]), 40000 + H[i]);
            z[H[i]].h.adaKapisiKur(IAdaKapisi(address(kapi[H[i]])));
        }
        for (uint256 i = 0; i < 4; i++) for (uint256 j = 0; j < 4; j++) {
            if (i == j || (H[i] != BNB && H[j] != BNB)) continue;
            kapi[H[i]].ikizEkle(H[j], 40000 + H[j], _b(address(kapi[H[j]])));
            z[H[i]].h.adaYap(H[j]);
        }
        for (uint256 i = 0; i < 4; i++) kapi[H[i]].kilitle();
        for (uint256 i = 0; i < 3; i++) for (uint256 j = 0; j < 3; j++) {
            if (i == j) continue;
            Alan storage a = z[D[i]];
            Alan storage b = z[D[j]];
            a.tm.addRemoteTokenMessenger(D[j], _b(address(b.tm)));
            a.minter.linkTokenPair(address(a.usdc), D[j], _b(address(b.usdc)));
            a.h.ikizEkle(D[j], _b(address(b.h)));
        }
        /* Sui, seen from the EVM side: its token messenger and dollar, the twin
           Haberci is the Sui package's auth identifier, and it takes dollars
           and orders as two messages */
        for (uint256 i = 0; i < 3; i++) {
            z[D[i]].tm.addRemoteTokenMessenger(SUI, SUI_TM);
            z[D[i]].minter.linkTokenPair(address(z[D[i]].usdc), SUI, SUI_USDC);
            z[D[i]].h.ikizEkle(SUI, SUI_YETKI);
        }
        z[ARC].h.ayriYap(SUI);
        defter = new SepetDefteri(IHaberci(address(z[ARC].h)), IERC20S(address(z[ARC].usdc)));
        for (uint256 i = 0; i < 3; i++) {
            Alan storage a = z[D[i]];
            a.kasa = new SepetKasasi(IHaberci(address(a.h)), IERC20S(address(a.usdc)), ARC, Adres.b32(address(defter)));
            a.ucu = new SepetUcu(IHaberci(address(a.h)), IERC20S(address(a.usdc)), ARC, Adres.b32(address(defter)), launchpad);
            defter.bagla(D[i], Adres.b32(address(a.ucu)), Adres.b32(address(a.kasa)));
            if (i == 0) defter.bagla(SUI, bytes32(uint256(0x5e5)), SUI_KASA);
            if (i == 0) {
                Alan storage n = z[BNB];
                n.kasa = new SepetKasasi(IHaberci(address(n.h)), IERC20S(address(n.usdc)), ARC, Adres.b32(address(defter)));
                n.ucu = new SepetUcu(IHaberci(address(n.h)), IERC20S(address(n.usdc)), ARC, Adres.b32(address(defter)), launchpad);
                defter.bagla(BNB, Adres.b32(address(n.ucu)), Adres.b32(address(n.kasa)));
                n.h.kilitle();
                n.varlik.bas(arb, 1e30);
                n.usdc.mint(arb, 1_000_000e6);
                vm.startPrank(arb);
                n.varlik.approve(address(n.kasa), type(uint256).max);
                n.usdc.approve(address(n.kasa), type(uint256).max);
                vm.stopPrank();
            }
            a.h.kilitle();
            // the arbitrageur on every chain
            a.varlik.bas(arb, 1e30);
            a.usdc.mint(arb, 1_000_000e6);
            vm.startPrank(arb);
            a.varlik.approve(address(a.kasa), type(uint256).max);
            a.usdc.approve(address(a.kasa), type(uint256).max);
            vm.stopPrank();
        }
        defter.kilitle();
        for (uint256 i = 0; i < 4; i++) z[H[i]].usdc.mint(doldurucu, 1_000e6);
        vm.recordLogs();
    }

    /* ---- Iris and the relayer -------------------------------------- */

    /// Sign every CCTP message emitted since the last call and deliver each
    /// to the Haberci of its destination; repeat until nothing is left.
    function _aktar() internal returns (uint256 teslimEdilen) {
        for (uint256 tur = 0; tur < 20; tur++) {
            Vm.Log[] memory l = vm.getRecordedLogs();
            bytes[] memory ms = new bytes[](l.length);
            uint256 n;
            uint256 ada;
            for (uint256 i = 0; i < l.length; i++) {
                if (l[i].topics.length == 0) continue;
                if (l[i].topics[0] == MESAJ_OLAYI) ms[n++] = abi.decode(l[i].data, (bytes));
                else if (l[i].topics[0] == KUYRUK) {
                    (, bytes memory m) = abi.decode(l[i].data, (uint256, bytes));
                    _ekle(gidenler, l[i].emitter, uint32(uint256(l[i].topics[2])), uint64(uint256(l[i].topics[1])), m);
                    ada++;
                } else if (l[i].topics[0] == BEKLIYOR) {
                    // the filler pays from its own dollars on this chain: no bridge per order
                    (uint256 miktar, bytes memory m) = abi.decode(l[i].data, (uint256, bytes));
                    uint32 kz = uint32(uint256(l[i].topics[1]));
                    AdaKapisi k = AdaKapisi(l[i].emitter);
                    vm.startPrank(doldurucu);
                    IUSDC2(address(k.dolar())).approve(address(k), miktar);
                    k.doldur(kz, m, _b(doldurucu));
                    vm.stopPrank();
                    if (miktar > 0) _ekle(makbuzlar, l[i].emitter, kz, uint64(uint256(l[i].topics[2])), "");
                    ada++;
                }
            }
            // one LayerZero message per gate and chain: the queued orders, then the receipts
            _toplu(gidenler, true);
            _toplu(makbuzlar, false);
            ada += lz.teslim();
            if (n == 0 && ada == 0) return teslimEdilen;
            for (uint256 i = 0; i < n; i++) {
                (bytes memory m, bytes memory imza) = _imzala(ms[i]);
                uint32 hedef = uint32(bytes4(_dilim(m, 8, 4)));
                if (hedef == SUI) { disari.push(m); continue; }
                vm.prank(tasiyici);
                z[hedef].h.teslim(m, imza);
                teslimEdilen++;
            }
        }
    }

    struct Is { address kapi; uint32 zincir; uint64 id; bytes m; }
    Is[] gidenler;
    Is[] makbuzlar;

    function _ekle(Is[] storage a, address k, uint32 z_, uint64 id, bytes memory m) internal { a.push(Is(k, z_, id, m)); }

    /// Send everything in `a` grouped by (gate, chain), one call per group.
    function _toplu(Is[] storage a, bool yollaMi) internal {
        while (a.length > 0) {
            address k = a[0].kapi;
            uint32 z_ = a[0].zincir;
            uint256 n;
            for (uint256 i = 0; i < a.length; i++) if (a[i].kapi == k && a[i].zincir == z_) n++;
            uint64[] memory ids = new uint64[](n);
            bytes[] memory ms = new bytes[](n);
            n = 0;
            for (uint256 i = a.length; i > 0; i--) {
                if (a[i - 1].kapi != k || a[i - 1].zincir != z_) continue;
                ids[n] = a[i - 1].id;
                ms[n++] = a[i - 1].m;
                a[i - 1] = a[a.length - 1];
                a.pop();
            }
            lzMesaj++;
            if (yollaMi) AdaKapisi(k).yolla(ids, ms, "");
            else {
                vm.prank(doldurucu);
                AdaKapisi(k).bildir(z_, ids, "");
            }
        }
    }

    function _dilim(bytes memory m, uint256 i, uint256 n) internal pure returns (bytes memory r) {
        r = new bytes(n);
        for (uint256 j = 0; j < n; j++) r[j] = m[i + j];
    }

    function _imzala(bytes memory m) internal returns (bytes memory, bytes memory imza) {
        bytes32 nn = bytes32(nonceSayac++);
        assembly { mstore(add(add(m, 32), 12), nn) }
        bytes4 f = bytes4(uint32(2000));
        for (uint256 j = 0; j < 4; j++) m[144 + j] = f[j];
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_PK, keccak256(m));
        imza = abi.encodePacked(r, s, v);
        return (m, imza);
    }

    function _doldur(uint256 bekle) internal {
        saat += bekle;
        vm.warp(saat);
        for (uint256 i = 0; i < 4; i++) {
            SepetKasasi k = z[H[i]].kasa;
            for (uint256 id = 0; id < k.ihaleSayisi(); id++) {
                (,,,,,,,, bool bitti) = k.ihaleler(id);
                if (bitti) continue;
                uint256 ist = k.istenen(id);
                vm.prank(arb);
                k.doldur(id, ist);
            }
        }
        _aktar();
    }

    /// A launch on Base: $4 of each chain's asset, quoted at 1 unit per dollar.
    function _launch(Varlik token) internal returns (uint64 id) {
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](3);
        uint256[] memory ref = new uint256[](3);
        for (uint256 i = 0; i < 3; i++) { k[i] = SepetDefteri.Kalem(D[i], Adres.b32(address(z[D[i]].varlik)), 4e6); ref[i] = 4e18; }
        z[BASE].usdc.mint(launchpad, 12e6);
        vm.startPrank(launchpad);
        z[BASE].usdc.approve(address(z[BASE].ucu), 12e6);
        z[BASE].ucu.baslat(address(token), kurucu, ARZ, k, ref);
        vm.stopPrank();
        _aktar();
        id = defter.idOf(BASE, Adres.b32(address(token)));
    }

    /* ==================================================================== */

    function test_launch_gercek_cctp_ile_uc_zincire_dagilir() public {
        uint64 id = _launch(new Varlik());
        assertEq(id, 1, "Defter kaydi Arc'ta");
        for (uint256 i = 0; i < 3; i++) {
            assertEq(z[D[i]].kasa.usdcBakiye(id), 4e6, "4 dolar her zincirin kasasinda");
            assertEq(z[D[i]].kasa.ihaleSayisi(), 1);
        }
        _doldur(30 minutes);
        for (uint256 i = 0; i < 3; i++) assertEq(z[D[i]].kasa.bakiye(id, address(z[D[i]].varlik)), 4e18);
    }

    function test_vergi_ve_itfa_zincirler_arasi() public {
        Varlik token = new Varlik();
        uint64 id = _launch(token);
        _doldur(30 minutes);
        // $60 of tax from Base -> Arc -> $20 to each chain
        z[BASE].usdc.mint(address(this), 60e6);
        z[BASE].usdc.approve(address(z[BASE].ucu), 60e6);
        z[BASE].ucu.vergi(address(token), 60e6);
        _aktar();
        defter.dagit(id);
        _aktar();
        for (uint256 i = 0; i < 3; i++) assertEq(z[D[i]].kasa.usdcBakiye(id), 20e6, "her kasaya 20 dolar");
        _doldur(30 minutes);   // 20 more units each
        // the holder burns half the supply on Base, paid on Arbitrum
        token.bas(tutucu, ARZ / 2);
        vm.startPrank(tutucu);
        token.approve(address(z[BASE].ucu), type(uint256).max);
        z[BASE].ucu.itfa(address(token), ARZ / 2, ARB, Adres.b32(tutucu));
        vm.stopPrank();
        _aktar();
        for (uint256 i = 0; i < 3; i++) assertEq(z[D[i]].kasa.bakiye(id, address(z[D[i]].varlik)), 12e18, "24 birimin yarisi satista");
        _doldur(30 minutes);   // each sale: 12 units at $1 = $12
        assertEq(z[ARB].usdc.balanceOf(tutucu), 36e6, "uc kasadan 12'ser dolar, Arbitrum'da");
    }

    function test_yabancinin_yakimi_reddedilir() public {
        _launch(new Varlik());
        SahteYakan s = new SahteYakan();
        z[BASE].usdc.mint(address(s), 5e6);
        bytes memory veri = abi.encode(SepetMesaj.SAT, uint64(1), new bytes32[](0), uint256(1), uint256(1), BASE, Adres.b32(address(s)));
        s.yak(z[BASE].tm, z[BASE].usdc, ARC, _b(address(z[ARC].h)), address(z[ARC].kasa), veri);
        Vm.Log[] memory l = vm.getRecordedLogs();
        bytes memory m;
        for (uint256 i = 0; i < l.length; i++) if (l[i].topics.length > 0 && l[i].topics[0] == MESAJ_OLAYI) m = abi.decode(l[i].data, (bytes));
        (bytes memory mm, bytes memory imza) = _imzala(m);
        vm.expectRevert(HaberciCctp.KotuMesaj.selector);
        z[ARC].h.teslim(mm, imza);
    }

    function test_mesaj_ikinci_kez_teslim_edilemez_ve_yalniz_haberci_sunar() public {
        z[BASE].usdc.mint(launchpad, 12e6);
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](3);
        uint256[] memory ref = new uint256[](3);
        for (uint256 i = 0; i < 3; i++) { k[i] = SepetDefteri.Kalem(D[i], Adres.b32(address(z[D[i]].varlik)), 4e6); ref[i] = 4e18; }
        vm.startPrank(launchpad);
        z[BASE].usdc.approve(address(z[BASE].ucu), 12e6);
        z[BASE].ucu.baslat(address(new Varlik()), kurucu, ARZ, k, ref);
        vm.stopPrank();
        Vm.Log[] memory l = vm.getRecordedLogs();
        bytes memory m;
        for (uint256 i = 0; i < l.length; i++) if (l[i].topics.length > 0 && l[i].topics[0] == MESAJ_OLAYI) m = abi.decode(l[i].data, (bytes));
        (bytes memory mm, bytes memory imza) = _imzala(m);
        // someone else submitting straight to CCTP: the destinationCaller is the Haberci
        vm.expectRevert();
        z[ARC].mt.receiveMessage(mm, imza);
        z[ARC].h.teslim(mm, imza);
        assertEq(defter.launchSayisi(), 1);
        vm.expectRevert();
        z[ARC].h.teslim(mm, imza);
    }

    function _b32at(bytes memory m, uint256 o) internal pure returns (bytes32 r) { assembly { r := mload(add(add(m, 32), o)) } }

    /// A basket line on Sui: the dollars go as a plain burn minted to the Sui
    /// vault, the order as a separate message to the Sui package carrying
    /// the amount, so the order cannot be skipped by whoever completes the burn.
    function test_sui_kalemi_iki_mesajla_gider() public {
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](2);
        uint256[] memory ref = new uint256[](2);
        k[0] = SepetDefteri.Kalem(BASE, Adres.b32(address(z[BASE].varlik)), 4e6); ref[0] = 4e18;
        k[1] = SepetDefteri.Kalem(SUI, bytes32(uint256(0xc017)), 4e6); ref[1] = 4e9;
        z[BASE].usdc.mint(launchpad, 8e6);
        vm.startPrank(launchpad);
        z[BASE].usdc.approve(address(z[BASE].ucu), 8e6);
        z[BASE].ucu.baslat(address(new Varlik()), kurucu, ARZ, k, ref);
        vm.stopPrank();
        _aktar();
        assertEq(disari.length, 2, "Sui'ye iki mesaj");
        bytes memory yakim = disari[0];
        bytes memory emir = disari[1];
        // the burn: recipient the token messenger, any caller, minted to the Sui vault, $4, no hook
        assertEq(_b32at(yakim, 76), SUI_TM, "yakim Sui TMM'ye");
        assertEq(_b32at(yakim, 108), bytes32(0), "herkes teslim edebilir");
        assertEq(_b32at(yakim, 148 + 36), SUI_KASA, "basim Sui kasasina");
        assertEq(uint256(_b32at(yakim, 148 + 68)), 4e6, "4 dolar");
        assertEq(yakim.length, 148 + 228, "kanca yok");
        // the order: to the Sui package itself, only it may submit it
        assertEq(_b32at(emir, 76), SUI_YETKI, "emir Sui paketine");
        assertEq(_b32at(emir, 108), SUI_YETKI, "yalniz Sui paketi sunar");
        bytes memory govde = _dilim(emir, 148, emir.length - 148);
        (bytes32 kaynak, bytes32 hedef, bytes memory veri, uint256 miktar) = abi.decode(govde, (bytes32, bytes32, bytes, uint256));
        assertEq(kaynak, Adres.b32(address(defter)), "kaynak Defter");
        assertEq(hedef, SUI_KASA, "hedef Sui kasasi");
        assertEq(miktar, 4e6, "emir dolar tutarini tasir");
        (uint8 tur, uint64 id, bytes32 varlik, uint256 r) = abi.decode(veri, (uint8, uint64, bytes32, uint256));
        assertEq(tur, SepetMesaj.AL);
        assertEq(id, 1);
        assertEq(varlik, bytes32(uint256(0xc017)), "Sui coin tipinin kimligi");
        assertEq(r, 4e9);
    }

    /* ---- BNB, the island ------------------------------------------- */

    /// A launch from BNB, paid in BNB's own dollar, basket on all four chains.
    function _bnbLaunch(Varlik token) internal returns (uint64 id) {
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](4);
        uint256[] memory ref = new uint256[](4);
        for (uint256 i = 0; i < 4; i++) { k[i] = SepetDefteri.Kalem(H[i], Adres.b32(address(z[H[i]].varlik)), 4e6); ref[i] = 4e18; }
        z[BNB].usdc.mint(launchpad, 16e6);
        vm.startPrank(launchpad);
        z[BNB].usdc.approve(address(z[BNB].ucu), 16e6);
        z[BNB].ucu.baslat(address(token), kurucu, ARZ, k, ref);
        vm.stopPrank();
        _aktar();
        id = defter.idOf(BNB, Adres.b32(address(token)));
    }

    function _bakiyeler() internal view returns (uint256[4] memory b) {
        for (uint256 i = 0; i < 4; i++) b[i] = z[H[i]].usdc.balanceOf(doldurucu);
    }

    function test_bnb_launch_dolar_kopruden_gecmeden_dort_zincire_dagilir() public {
        uint256[4] memory once = _bakiyeler();
        uint64 id = _bnbLaunch(new Varlik());
        assertEq(id, 1, "BNB'den launch Arc'taki Defter'de");
        for (uint256 i = 0; i < 4; i++) {
            assertEq(z[H[i]].kasa.usdcBakiye(id), 4e6, "her kasada 4 dolar, BNB dahil");
            assertEq(z[H[i]].kasa.ihaleSayisi(), 1);
        }
        // the 16 BNB-dollars stayed on BNB and repaid the filler; the filler
        // paid 16 on Arc and got 4 back there for BNB's line
        uint256[4] memory sonra = _bakiyeler();
        assertEq(once[0] - sonra[0], 12e6, "doldurucu Arc'ta 16 odedi, 4 geri aldi");
        assertEq(sonra[3] - once[3], 12e6, "BNB'de 16 aldi, 4 odedi");
        assertEq(z[BNB].usdc.balanceOf(address(kapi[BNB])), 0, "BNB kapisinda kilitli dolar kalmadi");
        assertEq(z[ARC].usdc.balanceOf(address(kapi[ARC])), 0, "Arc kapisinda da");
        _doldur(30 minutes);
        for (uint256 i = 0; i < 4; i++) assertEq(z[H[i]].kasa.bakiye(id, address(z[H[i]].varlik)), 4e18);
    }

    function test_itfa_bnb_tutucuya_bnb_dolariyla_odenir() public {
        Varlik token = new Varlik();
        uint64 id = _launch(token);           // the Base launch: Arc, Base, Arbitrum
        _doldur(30 minutes);
        token.bas(tutucu, ARZ / 2);
        vm.startPrank(tutucu);
        token.approve(address(z[BASE].ucu), type(uint256).max);
        z[BASE].ucu.itfa(address(token), ARZ / 2, BNB, Adres.b32(tutucu));
        vm.stopPrank();
        _aktar();
        uint256[4] memory once = _bakiyeler();
        _doldur(30 minutes);                   // each sale: 2 units at $1
        assertEq(z[BNB].usdc.balanceOf(tutucu), 6e6, "uc kasadan 2'ser dolar, BNB'de, BNB dolariyla");
        uint256[4] memory sonra = _bakiyeler();
        assertEq(once[3] - sonra[3], 6e6, "doldurucu BNB'de 6 odedi");
        uint256 geri = (sonra[0] - once[0]) + (sonra[1] - once[1]) + (sonra[2] - once[2]);
        assertEq(geri, 6e6, "ve 6'yi kaynak zincirlerde geri aldi");
        assertEq(id, 1);
    }

    function test_ada_kapisi_yalniz_ikizden_ve_uc_noktadan_alir() public {
        LzOrigin memory o = LzOrigin(40000 + ARC, _b(address(kapi[ARC])), 1);
        bytes32[] memory al = new bytes32[](1);
        al[0] = _b(address(this));
        bytes memory m = abi.encode(uint8(2), _id(0), al);
        vm.expectRevert(AdaKapisi.SadeceUcNokta.selector);
        kapi[BNB].lzReceive(o, bytes32(0), m, address(0), "");
        vm.startPrank(address(lz));
        vm.expectRevert(AdaKapisi.YanlisMesaj.selector);
        kapi[BNB].lzReceive(LzOrigin(40000 + ARC, _b(address(0xBAD)), 1), bytes32(0), m, address(0), "");
        vm.expectRevert(AdaKapisi.YanlisMesaj.selector);   // a receipt for a send that was never locked
        kapi[BNB].lzReceive(o, bytes32(0), m, address(0), "");
        vm.stopPrank();
        // only the gate hands deliveries to the Haberci
        vm.expectRevert(HaberciCctp.SadeceTasiyici.selector);
        z[BNB].h.adaTeslim(ARC, bytes32(0), _b(address(z[BNB].kasa)), "", 0);
        // two CCTP chains never talk through the gate
        assertEq(kapi[BASE].ikiz(ARB), bytes32(0));
        assertFalse(z[BASE].h.ada(ARB));
    }

    function test_kilitli_dolar_bir_kez_odenir_sahte_dolum_reddedilir() public {
        z[BNB].usdc.mint(launchpad, 16e6);
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](4);
        uint256[] memory ref = new uint256[](4);
        for (uint256 i = 0; i < 4; i++) { k[i] = SepetDefteri.Kalem(H[i], Adres.b32(address(z[H[i]].varlik)), 4e6); ref[i] = 4e18; }
        vm.startPrank(launchpad);
        z[BNB].usdc.approve(address(z[BNB].ucu), 16e6);
        z[BNB].ucu.baslat(address(new Varlik()), kurucu, ARZ, k, ref);
        vm.stopPrank();
        assertEq(z[BNB].usdc.balanceOf(address(kapi[BNB])), 16e6, "BNB'de kilitli");
        Vm.Log[] memory l = vm.getRecordedLogs();
        bytes memory m;
        for (uint256 i = 0; i < l.length; i++) if (l[i].topics.length > 0 && l[i].topics[0] == KUYRUK) (, m) = abi.decode(l[i].data, (uint256, bytes));
        vm.expectRevert(AdaKapisi.YanlisMesaj.selector);
        kapi[BNB].yolla(_id(0), _m(bytes.concat(m, hex"00")), "");
        kapi[BNB].yolla(_id(0), _m(m), "");
        vm.expectRevert(AdaKapisi.Yollandi_.selector);
        kapi[BNB].yolla(_id(0), _m(m), "");
        lz.teslim();
        // a forged order (more dollars than were locked) is not payable
        (, uint64 gid, bytes32 kaynak, bytes32 hedef, bytes memory veri,) = abi.decode(m, (uint8, uint64, bytes32, bytes32, bytes, uint256));
        bytes memory sahte = abi.encode(uint8(1), gid, kaynak, hedef, veri, uint256(1e6));
        vm.startPrank(doldurucu);
        z[ARC].usdc.approve(address(kapi[ARC]), type(uint256).max);
        vm.expectRevert(AdaKapisi.YanlisMesaj.selector);
        kapi[ARC].doldur(BNB, sahte, _b(doldurucu));
        kapi[ARC].doldur(BNB, m, _b(doldurucu));
        vm.expectRevert(AdaKapisi.YanlisMesaj.selector);
        kapi[ARC].doldur(BNB, m, _b(doldurucu));
        kapi[ARC].bildir(BNB, _id(gid), "");
        vm.expectRevert(AdaKapisi.YanlisMesaj.selector);
        kapi[ARC].bildir(BNB, _id(gid), "");
        vm.stopPrank();
        uint256 once = z[BNB].usdc.balanceOf(doldurucu);
        lz.teslim();
        assertEq(z[BNB].usdc.balanceOf(doldurucu) - once, 16e6, "kilitli 16 dolar doldurucuya");
        // a replayed receipt pays nothing more
        vm.prank(address(lz));
        vm.expectRevert(AdaKapisi.YanlisMesaj.selector);
        bytes32[] memory al = new bytes32[](1);
        al[0] = _b(doldurucu);
        kapi[BNB].lzReceive(LzOrigin(40000 + ARC, _b(address(kapi[ARC])), 9), bytes32(0), abi.encode(uint8(2), _id(gid), al), address(0), "");
        assertEq(defter.launchSayisi(), 1, "kayit Arc'ta");
    }

    /// Sui cannot reach BNB: its share for a BNB holder is paid on Arc, to
    /// the same EVM address; the EVM vaults pay on BNB.
    function test_sui_payi_bnb_tutucusuna_arcta_odenir() public {
        Varlik token = new Varlik();
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](2);
        uint256[] memory ref = new uint256[](2);
        k[0] = SepetDefteri.Kalem(BASE, Adres.b32(address(z[BASE].varlik)), 4e6); ref[0] = 4e18;
        k[1] = SepetDefteri.Kalem(SUI, bytes32(uint256(0xc017)), 4e6); ref[1] = 4e9;
        z[BASE].usdc.mint(launchpad, 8e6);
        vm.startPrank(launchpad);
        z[BASE].usdc.approve(address(z[BASE].ucu), 8e6);
        z[BASE].ucu.baslat(address(token), kurucu, ARZ, k, ref);
        vm.stopPrank();
        _aktar();
        token.bas(tutucu, ARZ / 4);
        vm.startPrank(tutucu);
        token.approve(address(z[BASE].ucu), type(uint256).max);
        z[BASE].ucu.itfa(address(token), ARZ / 4, BNB, Adres.b32(tutucu));
        vm.stopPrank();
        _aktar();
        bytes memory emir = disari[disari.length - 1];
        (,, bytes memory veri,) = abi.decode(_dilim(emir, 148, emir.length - 148), (bytes32, bytes32, bytes, uint256));
        (uint8 tur,,,,, uint32 hz, bytes32 alici) = abi.decode(veri, (uint8, uint64, bytes32[], uint256, uint256, uint32, bytes32));
        assertEq(tur, SepetMesaj.SAT);
        assertEq(hz, ARC, "Sui payi Arc'ta");
        assertEq(alici, Adres.b32(tutucu), "ayni adrese");
    }

    function _id(uint64 x) internal pure returns (uint64[] memory a) { a = new uint64[](1); a[0] = x; }
    function _m(bytes memory x) internal pure returns (bytes[] memory a) { a = new bytes[](1); a[0] = x; }

    /// A BNB launch: orders and receipts batched per chain, so ten launches
    /// in one go need no more LayerZero messages than one.
    function test_bnb_launch_az_lz_mesajiyla() public {
        uint256 once = lzMesaj;
        _bnbLaunch(new Varlik());
        uint256 tek = lzMesaj - once;
        once = lzMesaj;
        for (uint256 i = 0; i < 10; i++) {
            SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](1);
            uint256[] memory ref = new uint256[](1);
            k[0] = SepetDefteri.Kalem(BNB, Adres.b32(address(z[BNB].varlik)), 4e6); ref[0] = 4e18;
            z[BNB].usdc.mint(launchpad, 4e6);
            vm.startPrank(launchpad);
            z[BNB].usdc.approve(address(z[BNB].ucu), 4e6);
            z[BNB].ucu.baslat(address(new Varlik()), kurucu, ARZ, k, ref);
            vm.stopPrank();
        }
        _aktar();
        assertEq(defter.launchSayisi(), 11);
        assertLe(lzMesaj - once, tek, "on launch, bir launch'tan fazla mesaj istemez");
        emit log_named_uint("bir launch LZ mesaji", tek);
        emit log_named_uint("on launch LZ mesaji", lzMesaj - once);
    }

    /// The filler keeps dollars on both sides and never bridges per order:
    /// it pays on the far side and is repaid one for one at home.
    function test_doldurucu_kopru_kullanmadan_netlesir() public {
        uint256[4] memory once = _bakiyeler();
        Varlik token = new Varlik();
        uint64 id = _bnbLaunch(token);
        _doldur(30 minutes);
        token.bas(tutucu, ARZ / 4);
        vm.startPrank(tutucu);
        token.approve(address(z[BNB].ucu), type(uint256).max);
        z[BNB].ucu.itfa(address(token), ARZ / 4, BNB, Adres.b32(tutucu));
        vm.stopPrank();
        _aktar();
        _doldur(30 minutes);
        assertEq(z[BNB].usdc.balanceOf(tutucu), 4e6, "dort kasadan 1'er dolar, BNB'de");
        uint256[4] memory sonra = _bakiyeler();
        assertEq(sonra[0] + sonra[1] + sonra[2] + sonra[3], once[0] + once[1] + once[2] + once[3],
            "doldurucu ne kazandi ne kaybetti: 1'e 1, koprusuz");
        assertEq(id, 1);
    }
}
