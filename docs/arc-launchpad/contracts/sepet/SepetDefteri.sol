// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHaberci, IHaberAlici, IERC20S, SepetMesaj, Adres} from "./IHaberci.sol";

/// @title SepetDefteri — the ledger on Arc for every basket-backed launch
///
/// A launch on any of the twelve chains registers here: its basket (one to
/// five assets, each on whichever chain it lives on, each at least
/// ASGARI_KALEM dollars) and its supply. From then on the Defter does three
/// things and nothing else:
///   - sends each basket line's dollars to the vault on that line's chain,
///     with the order to buy;
///   - collects trading tax from every chain and, every ESIK dollars, spends
///     it on the basket at the launch's own weights;
///   - turns a burn on any chain into a redemption: each vault sells the
///     holder's share and pays them on their chain.
///
/// THE SHARE
///   A token is a claim on 1 / arz of the basket, where arz is the supply
///   minus every token burned for redemption on any chain. Burns reach the
///   Defter as messages, so arz is exact; it moves only by a burn, and a
///   burn of one's own tokens can only raise everyone else's share. Pool
///   inventory carries a claim too; it stays in the basket for whoever
///   redeems later.
///
/// WHO MAY TALK TO IT
///   One launchpad per chain and one vault per chain, fixed by `bagla` and
///   then locked forever with `kilitle`. After that there is no owner.
contract SepetDefteri is IHaberAlici {
    IHaberci public immutable haberci;
    IERC20S public immutable usdc;

    uint256 public constant ASGARI_KALEM = 4e6;   // $4 per basket line
    /// Ethereum mainnet (CCTP domain 0): buying into a vault there costs a
    /// few dollars of gas, so a line there is at least $25, and its share of
    /// a tax re-buy waits until it reaches $25 too.
    uint32 public constant ETHEREUM = 0;
    uint256 public constant ASGARI_ETHEREUM = 25e6;
    uint256 public constant AZAMI_KALEM = 5;
    /// a launch's Ethereum line's share of re-buys, waiting to reach $25
    mapping(uint64 => mapping(uint256 => uint256)) public biriken;
    uint256 public constant ESIK = 50e6;          // re-buy every $50 of tax

    /// The launchpad (also the burner) and the basket vault on each chain.
    mapping(uint32 => bytes32) public launchpad;
    mapping(uint32 => bytes32) public kasa;
    address public kurucu;

    struct Kalem {
        uint32 zincir;
        bytes32 varlik;      // the asset on its own chain: an EVM token, a Sui coin type's hash, an Aptos metadata, a Solana mint
        uint256 dolar;       // what the founder put on this line: also its weight
    }
    struct Launch {
        uint32 zincir;       // where it was launched
        bytes32 token;       // the token's address on that chain
        uint256 arz;         // supply still carrying a claim
        uint256 agirlikToplam;
        uint256 vergi;       // tax dollars waiting for the next re-buy
        bool var_;
    }
    mapping(uint64 => Launch) public launchlar;
    /// (chain, token) => launch id: how a launchpad names a launch it
    /// cannot know the id of.
    mapping(uint32 => mapping(bytes32 => uint64)) public idOf;
    mapping(uint64 => Kalem[]) internal kalemler;
    /// The founder's quote per line: units its dollars bought at launch.
    /// A re-buy that comes before the vault has ever filled this asset
    /// still has a price to start from: without it the auction would open
    /// asking next to nothing for real dollars.
    mapping(uint64 => uint256[]) internal teklifler;
    uint64 public launchSayisi;

    bool private _kilit;

    event Iade(uint32 indexed zincir, bytes32 indexed token, bytes32 sahip, uint256 dolar);
    event Kayit(uint64 indexed id, uint32 zincir, bytes32 token, uint256 arz, uint256 kalem, uint256 dolar);
    event Gonderildi(uint64 indexed id, uint32 zincir, bytes32 varlik, uint256 dolar);
    event Vergi(uint64 indexed id, uint256 dolar, uint256 bekleyen);
    event Dagitildi(uint64 indexed id, uint256 dolar);
    event Itfa(uint64 indexed id, uint256 miktar, uint256 arzOnce, uint32 hedefZincir, bytes32 alici, uint256 vergiPayi);

    error SadeceKurucu();
    error ZatenBagli();
    error Kilitli();
    error SadeceHaberci();
    error YetkisizKaynak();
    error KotuSepet();
    error KotuMesaj();
    error BilinmeyenLaunch();
    error EsikAltinda();
    error Yeniden_();

    modifier kilitli() {
        if (_kilit) revert Yeniden_();
        _kilit = true;
        _;
        _kilit = false;
    }

    constructor(IHaberci _haberci, IERC20S _usdc) {
        haberci = _haberci;
        usdc = _usdc;
        kurucu = msg.sender;
    }

    /* ---- wiring, once ---------------------------------------------- */

    /// Bind a chain's entry and vault: once per chain, never changed. Until
    /// `kilitle` new chains can still be added (a chain whose contracts go
    /// live later), but no chain already bound can be pointed elsewhere.
    function bagla(uint32 zincir, bytes32 _launchpad, bytes32 _kasa) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        if (kasa[zincir] != bytes32(0) || launchpad[zincir] != bytes32(0)) revert ZatenBagli();
        if (_kasa == bytes32(0) || _launchpad == bytes32(0)) revert KotuMesaj();
        launchpad[zincir] = _launchpad;
        kasa[zincir] = _kasa;
    }

    function kilitle() external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        kurucu = address(0);
    }

    /* ---- messages --------------------------------------------------- */

    function haberAl(uint32 kaynakZincir, bytes32 kaynak, bytes calldata veri, uint256 gelen) external kilitli {
        if (msg.sender != address(haberci)) revert SadeceHaberci();
        if (kaynak == bytes32(0) || launchpad[kaynakZincir] != kaynak) revert YetkisizKaynak();
        uint8 tur = uint8(uint256(bytes32(veri[:32])));
        if (tur == SepetMesaj.KAYIT) _kayit(kaynakZincir, veri, gelen);
        else if (tur == SepetMesaj.ITFA) _itfa(kaynakZincir, veri);
        else if (tur == SepetMesaj.VERGI) _vergi(kaynakZincir, veri, gelen);
        else revert KotuMesaj();
    }

    /// A new launch. `gelen` dollars arrived with the message and must be
    /// exactly the sum of the basket lines. A basket the Defter cannot take
    /// (a chain with no vault, a duplicate line, a token already registered)
    /// does not revert: the dollars would be stranded in transit. They go
    /// back to the founder on the chain they came from.
    function _kayit(uint32 kaynakZincir, bytes calldata veri, uint256 gelen) internal {
        (, bytes32 token, bytes32 sahip, uint256 arz, Kalem[] memory k, uint256[] memory ref) =
            abi.decode(veri, (uint8, bytes32, bytes32, uint256, Kalem[], uint256[]));
        if (!sepetGecerli(kaynakZincir, token, arz, k, ref, gelen)) {
            _ode(kaynakZincir, sahip, gelen);
            emit Iade(kaynakZincir, token, sahip, gelen);
            return;
        }
        uint256 toplam = gelen;

        uint64 id = ++launchSayisi;
        idOf[kaynakZincir][token] = id;
        launchlar[id] = Launch(kaynakZincir, token, arz, toplam, 0, true);
        for (uint256 i = 0; i < k.length; i++) {
            kalemler[id].push(k[i]);
            teklifler[id].push(ref[i]);
            _alGonder(id, k[i], k[i].dolar, ref[i]);
        }
        emit Kayit(id, kaynakZincir, token, arz, k.length, toplam);
    }

    function sepetGecerli(uint32 kaynakZincir, bytes32 token, uint256 arz, Kalem[] memory k, uint256[] memory ref, uint256 gelen)
        public view returns (bool)
    {
        if (k.length == 0 || k.length > AZAMI_KALEM || k.length != ref.length || arz == 0) return false;
        if (idOf[kaynakZincir][token] != 0) return false;
        uint256 toplam;
        for (uint256 i = 0; i < k.length; i++) {
            if (k[i].dolar < ASGARI_KALEM || k[i].varlik == bytes32(0) || ref[i] == 0) return false;
            if (k[i].zincir == ETHEREUM && k[i].dolar < ASGARI_ETHEREUM) return false;
            if (kasa[k[i].zincir] == bytes32(0)) return false;
            for (uint256 j = 0; j < i; j++) {
                if (k[j].zincir == k[i].zincir && k[j].varlik == k[i].varlik) return false;
            }
            toplam += k[i].dolar;
        }
        return toplam == gelen;
    }

    function _ode(uint32 hz, bytes32 alici, uint256 miktar) internal {
        if (miktar == 0) return;
        if (hz == haberci.zincir()) {
            usdc.transfer(Adres.evm(alici), miktar);
        } else {
            usdc.approve(address(haberci), miktar);
            haberci.gonder(hz, alici, "", miktar);
        }
    }

    function _alGonder(uint64 id, Kalem memory k, uint256 dolar, uint256 ref) internal {
        usdc.approve(address(haberci), dolar);
        haberci.gonder(k.zincir, kasa[k.zincir], abi.encode(SepetMesaj.AL, id, k.varlik, ref), dolar);
        emit Gonderildi(id, k.zincir, k.varlik, dolar);
    }

    /// Trading tax from any chain. It waits here until ESIK.
    function _vergi(uint32 kaynakZincir, bytes calldata veri, uint256 gelen) internal {
        (, bytes32 token) = abi.decode(veri, (uint8, bytes32));
        uint64 id = idOf[kaynakZincir][token];
        Launch storage L = launchlar[id];
        if (!L.var_) revert BilinmeyenLaunch();
        L.vergi += gelen;
        emit Vergi(id, gelen, L.vergi);
    }

    /// Anyone, once a launch's waiting tax reaches ESIK: spend it all on the
    /// basket, each line getting its founder's weight.
    function dagit(uint64 id) external kilitli {
        Launch storage L = launchlar[id];
        if (!L.var_) revert BilinmeyenLaunch();
        uint256 v = L.vergi;
        if (v < ESIK) revert EsikAltinda();
        L.vergi = 0;
        Kalem[] storage k = kalemler[id];
        uint256 kalan = v;
        for (uint256 i = 0; i < k.length; i++) {
            /* the last line takes the rounding, so every dollar is spent */
            uint256 d = i + 1 == k.length ? kalan : (v * k[i].dolar) / L.agirlikToplam;
            kalan -= d;
            if (k[i].zincir == ETHEREUM) {
                /* below $25 the gas would eat the line's share: it waits */
                d += biriken[id][i];
                if (d < ASGARI_ETHEREUM) { biriken[id][i] = d; continue; }
                biriken[id][i] = 0;
            }
            if (d > 0) _alGonder(id, k[i], d, (teklifler[id][i] * d) / k[i].dolar);
        }
        emit Dagitildi(id, v);
    }

    /// Tokens were burned on `kaynakZincir` for redemption. Each vault in
    /// the basket sells this share; the waiting tax pays its share here.
    function _itfa(uint32 kaynakZincir, bytes calldata veri) internal {
        (, bytes32 token, uint256 miktar, uint32 hz, bytes32 alici) = abi.decode(veri, (uint8, bytes32, uint256, uint32, bytes32));
        /* the launchpad on the chain where the tokens were burned vouches
           for the burn; the token is named by its address there */
        uint64 id = idOf[kaynakZincir][token];
        Launch storage L = launchlar[id];
        if (!L.var_) revert BilinmeyenLaunch();
        uint256 arz = L.arz;
        if (miktar == 0 || miktar > arz) revert KotuMesaj();
        L.arz = arz - miktar;

        uint256 vp = (L.vergi * miktar) / arz;
        L.vergi -= vp;
        Kalem[] storage kk = kalemler[id];
        for (uint256 i = 0; i < kk.length; i++) {
            uint256 b = biriken[id][i];
            if (b == 0) continue;
            uint256 pay = (b * miktar) / arz;
            biriken[id][i] = b - pay;
            vp += pay;
        }
        if (vp > 0) _ode(hz, alici, vp);

        /* one order per vault chain, naming every asset of this launch there */
        Kalem[] storage k = kalemler[id];
        for (uint256 i = 0; i < k.length; i++) {
            bool once;
            for (uint256 j = 0; j < i; j++) if (k[j].zincir == k[i].zincir) once = true;
            if (once) continue;
            uint256 n;
            for (uint256 j = i; j < k.length; j++) if (k[j].zincir == k[i].zincir) n++;
            bytes32[] memory v = new bytes32[](n);
            n = 0;
            for (uint256 j = i; j < k.length; j++) if (k[j].zincir == k[i].zincir) v[n++] = k[j].varlik;
            /* Solana, Sui and Aptos reach islands (BNB, Robinhood) only through
               Arc: their share for an island holder is paid on Arc, to the same
               EVM address */
            uint32 oz = (_evmDisi(k[i].zincir) && _ada(hz)) ? haberci.zincir() : hz;
            haberci.gonder(k[i].zincir, kasa[k[i].zincir], abi.encode(SepetMesaj.SAT, id, v, miktar, arz, oz, alici), 0);
        }
        emit Itfa(id, miktar, arz, hz, alici, vp);
    }

    function sepet(uint64 id) external view returns (Kalem[] memory) { return kalemler[id]; }

    /// CCTP domains of the chains whose vaults are not EVM contracts.
    function _evmDisi(uint32 z) internal pure returns (bool) { return z == 5 || z == 8 || z == 9; }

    /// Whether the Haberci reaches `z` through the island gate (HaberciCctp.ada).
    function _ada(uint32 z) internal view returns (bool) {
        (bool ok, bytes memory r) = address(haberci).staticcall(abi.encodeWithSignature("ada(uint32)", z));
        return ok && r.length == 32 && abi.decode(r, (bool));
    }
}
