// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHaberci, IHaberAlici, IERC20S, SepetMesaj, Adres} from "./IHaberci.sol";

/// @title SepetDefteri — the ledger on Arc for every basket-backed launch
///
/// A launch on any of the twelve chains registers here: its basket (one to
/// five assets, each on whichever chain it lives on, each at least
/// ASGARI_KALEM dollars) and its supply. From then on the Defter does three
/// things and nothing else:
///   - keeps every basket line's dollars here, as USDC, on that line's own
///     account: the founder's dollars for the line, and the line's share of
///     every trading tax (at the launch's weights) from whichever chain;
///   - the moment a line's account reaches ESIK ($50), sends it all to the
///     vault on that line's chain with the order to buy (user, 18 Oct: "every
///     $50 of USDC buys the collateral token"). It happens inside the call
///     that brought the dollars — no one has to trigger it — and a send that
///     fails leaves the dollars waiting, never the trade. At most
///     AZAMI_GONDERIM lines leave in one call, the fullest first; the rest
///     wait on their accounts (still part of the basket, still redeemable)
///     and leave with the next calls (v5, 24 Oct 2026: five lines crossing
///     $50 in one trade needed more gas than the hook gives the tax, and the
///     tax stayed in the bucket);
///   - turns a burn on any chain into a redemption: each vault that holds
///     something of the launch sells the holder's share and pays them on
///     their chain. The redeemer pays those orders' messenger fees in the same
///     call; an order the fee does not cover (or a chain that cannot be
///     reached now) waits in a queue that anyone may send, for a fixed tip
///     set aside from the holder's own payout. A redemption never reverts
///     because of a remote chain (v4, 23 Oct 2026: v2 paid these fees from
///     the messenger's own balance, which was empty, so every redemption
///     reverted — found by the joint test launch, PTEST2).
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

    uint256 public constant ASGARI_KALEM = 1e6;   // $1 per basket line (5% of the $20 minimum buy)
    uint256 public constant AZAMI_KALEM = 5;
    /// each line's dollars waiting here, as USDC, until they reach ESIK
    mapping(uint64 => mapping(uint256 => uint256)) public biriken;
    uint256 public constant ESIK = 50e6;          // a line buys in $50 lots (or more)
    /// Lines sent to their vaults in one call: two worst-case sends
    /// (LayerZero order + Circle burn, ~0.58M gas each, measured 24 Oct)
    /// fit the gas the hook gives the tax (PulseHook5.KOVA_GAZ) with room.
    uint256 public constant AZAMI_GONDERIM = 2;
    /// A send that failed is not retried by the automatic path for this long
    /// (a chain that cannot be reached would otherwise cost every trade).
    uint256 public constant BEKLEME = 1 hours;
    mapping(uint64 => mapping(uint256 => uint256)) public sonHata;

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

    /// Whether the vault on a chain ever received this launch's dollars: only
    /// those vaults hold anything of it, so only those get a redemption order.
    mapping(uint64 => mapping(uint32 => bool)) public kasaDolu;

    /// A redemption order that could not leave in its redemption's call.
    struct Emir { uint32 zincir; uint64 id; uint256 bahsis; bool gitti; bytes veri; }
    Emir[] public emirler;
    /// What whoever sends a queued order receives, set aside from the
    /// redeemer's waiting dollars ($0.05).
    uint256 public constant BAHSIS = 50_000;

    bool private _kilit;

    event Iade(uint32 indexed zincir, bytes32 indexed token, bytes32 sahip, uint256 dolar);
    event Kayit(uint64 indexed id, uint32 zincir, bytes32 token, uint256 arz, uint256 kalem, uint256 dolar);
    event Gonderildi(uint64 indexed id, uint32 zincir, bytes32 varlik, uint256 dolar);
    event Vergi(uint64 indexed id, uint256 dolar, uint256 bekleyen);
    event Bekletildi(uint64 indexed id, uint32 zincir, uint256 dolar);
    event Itfa(uint64 indexed id, uint256 miktar, uint256 arzOnce, uint32 hedefZincir, bytes32 alici, uint256 vergiPayi);
    event EmirGitti(uint64 indexed id, uint32 zincir, uint256 ucret);
    event EmirBekliyor(uint256 indexed emir, uint64 indexed id, uint32 zincir, uint256 bahsis);
    event EmirGonderildi(uint256 indexed emir, address indexed gonderen, uint256 ucret, uint256 bahsis);

    error SadeceKurucu();
    error ZatenBagli();
    error Kilitli();
    error SadeceHaberci();
    error YetkisizKaynak();
    error KotuSepet();
    error KotuMesaj();
    error BilinmeyenLaunch();
    error Yeniden_();
    /// An island vault pays only an EVM address (on the island): a holder
    /// redeeming a launch with an island line names one.
    error AdaEvmIster(uint32 ada);
    error Gitti();
    error TransferOlmadi();

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
        else if (tur == SepetMesaj.ITFA) _itfa(kaynakZincir, veri, gelen);
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
            biriken[id][i] = k[i].dolar;
        }
        emit Kayit(id, kaynakZincir, token, arz, k.length, toplam);
        _esikleriGonder(id, false, address(0));
    }

    function sepetGecerli(uint32 kaynakZincir, bytes32 token, uint256 arz, Kalem[] memory k, uint256[] memory ref, uint256 gelen)
        public view returns (bool)
    {
        if (k.length == 0 || k.length > AZAMI_KALEM || k.length != ref.length || arz == 0) return false;
        if (idOf[kaynakZincir][token] != 0) return false;
        uint256 toplam;
        for (uint256 i = 0; i < k.length; i++) {
            if (k[i].dolar < ASGARI_KALEM || k[i].varlik == bytes32(0) || ref[i] == 0) return false;
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


    /// Trading tax from any chain: split over the lines at the launch's own
    /// weights, and every line that reaches ESIK buys, in this same call.
    function _vergi(uint32 kaynakZincir, bytes calldata veri, uint256 gelen) internal {
        (, bytes32 token) = abi.decode(veri, (uint8, bytes32));
        uint64 id = idOf[kaynakZincir][token];
        Launch storage L = launchlar[id];
        if (!L.var_) revert BilinmeyenLaunch();
        Kalem[] storage k = kalemler[id];
        uint256 kalan = gelen;
        for (uint256 i = 0; i < k.length; i++) {
            /* the last line takes the rounding, so every dollar is booked */
            uint256 d = i + 1 == k.length ? kalan : (gelen * k[i].dolar) / L.agirlikToplam;
            kalan -= d;
            biriken[id][i] += d;
        }
        emit Vergi(id, gelen, beklemede(id));
        _esikleriGonder(id, false, address(0));
    }

    /// Up to AZAMI_GONDERIM lines of `id` whose account holds ESIK or more,
    /// the fullest first (ties: the lower line): all of each goes to its
    /// vault with the order to buy. The others wait on their accounts and go
    /// with the next calls. A send that cannot go now (a messenger fee it
    /// cannot cover, a chain not reachable yet) leaves the dollars on the
    /// account; nothing above it reverts. The automatic path (`hepsi` false)
    /// skips a line that failed in the last BEKLEME; `bahsisAlan`, when set,
    /// receives BAHSIS out of each line it sends.
    function _esikleriGonder(uint64 id, bool hepsi, address bahsisAlan) internal {
        Kalem[] storage k = kalemler[id];
        uint256 denendi;   // bit i: line i already tried in this call
        for (uint256 n = 0; n < AZAMI_GONDERIM; n++) {
            uint256 sec = type(uint256).max;
            uint256 enCok;
            for (uint256 i = 0; i < k.length; i++) {
                if (denendi & (1 << i) != 0) continue;
                uint256 b = biriken[id][i];
                if (b < ESIK || b <= enCok) continue;
                if (!hepsi && block.timestamp < sonHata[id][i] + BEKLEME) continue;
                sec = i; enCok = b;
            }
            if (sec == type(uint256).max) return;
            denendi |= 1 << sec;
            _satirGonder(id, sec, bahsisAlan);
        }
    }

    function _satirGonder(uint64 id, uint256 i, address bahsisAlan) internal {
        Kalem storage s = kalemler[id][i];
        uint256 d = biriken[id][i];
        biriken[id][i] = 0;
        uint256 bahsis = bahsisAlan != address(0) && d >= ESIK + BAHSIS ? BAHSIS : 0;
        uint256 g = d - bahsis;
        uint256 ref = (teklifler[id][i] * g) / s.dolar;
        usdc.approve(address(haberci), g);
        try haberci.gonder(s.zincir, kasa[s.zincir], abi.encode(SepetMesaj.AL, id, s.varlik, ref), g) {
            kasaDolu[id][s.zincir] = true;
            emit Gonderildi(id, s.zincir, s.varlik, g);
            if (bahsis > 0 && !usdc.transfer(bahsisAlan, bahsis)) revert TransferOlmadi();
        } catch {
            biriken[id][i] = d;
            sonHata[id][i] = block.timestamp;
            usdc.approve(address(haberci), 0);
            emit Bekletildi(id, s.zincir, d);
        }
    }

    /// Anyone: send (up to AZAMI_GONDERIM of) the lines of `id` that hold
    /// ESIK or more, including ones that failed lately. No tip.
    function gonder(uint64 id) external kilitli {
        if (!launchlar[id].var_) revert BilinmeyenLaunch();
        _esikleriGonder(id, true, address(0));
    }

    /// Anyone: the same, and the caller receives BAHSIS ($0.05) out of each
    /// line sent. The automatic path does not need it: every taxed trade
    /// sends what is due (the hook gives it the gas); this is for a launch
    /// whose trading stopped with lines still above ESIK.
    function bekleyenleriGonder(uint64 id) external kilitli {
        if (!launchlar[id].var_) revert BilinmeyenLaunch();
        _esikleriGonder(id, true, msg.sender);
    }

    /// Whether `ek` more tax dollars for the Arc launch `token` would leave a
    /// line at ESIK or more for the automatic path (the launch's bucket asks
    /// for the hook, which then gives the trade's tax the gas to send lines).
    function gonderimVar(bytes32 token, uint256 ek) external view returns (bool) {
        uint64 id = idOf[haberci.zincir()][token];
        Launch storage L = launchlar[id];
        if (!L.var_) return false;
        Kalem[] storage k = kalemler[id];
        uint256 kalan = ek;
        for (uint256 i = 0; i < k.length; i++) {
            uint256 d = i + 1 == k.length ? kalan : (ek * k[i].dolar) / L.agirlikToplam;
            kalan -= d;
            if (biriken[id][i] + d >= ESIK && block.timestamp >= sonHata[id][i] + BEKLEME) return true;
        }
        return false;
    }

    /// Dollars of `id` waiting here, all lines together (USDC, part of the collateral).
    function beklemede(uint64 id) public view returns (uint256 t) {
        uint256 n = kalemler[id].length;
        for (uint256 i = 0; i < n; i++) t += biriken[id][i];
    }

    /// Tokens were burned on `kaynakZincir` for redemption. The waiting
    /// dollars pay their share here at once; each vault that holds something
    /// of the launch gets an order to sell the holder's share there. `gelen`
    /// is the redeemer's budget for those orders' messenger fees; what it
    /// does not need goes back to `iade` on this chain.
    function _itfa(uint32 kaynakZincir, bytes calldata veri, uint256 gelen) internal {
        (, bytes32 token, uint256 miktar, uint32 hz, bytes32 alici) = abi.decode(veri, (uint8, bytes32, uint256, uint32, bytes32));
        address iade;
        if (veri.length >= 192) (,,,,, iade) = abi.decode(veri, (uint8, bytes32, uint256, uint32, bytes32, address));
        /* the launchpad on the chain where the tokens were burned vouches
           for the burn; the token is named by its address there */
        uint64 id = idOf[kaynakZincir][token];
        Launch storage L = launchlar[id];
        if (!L.var_) revert BilinmeyenLaunch();
        uint256 arz = L.arz;
        if (miktar == 0 || miktar > arz) revert KotuMesaj();
        L.arz = arz - miktar;

        Kalem[] storage k = kalemler[id];
        /* an island vault pays only an EVM address: refused before anything moves */
        if (uint256(alici) >> 160 != 0) {
            for (uint256 i = 0; i < k.length; i++) if (kasaDolu[id][k[i].zincir] && _ada(k[i].zincir)) revert AdaEvmIster(k[i].zincir);
        }

        uint256 vp;
        for (uint256 i = 0; i < k.length; i++) {
            uint256 b = biriken[id][i];
            if (b == 0) continue;
            uint256 pay = (b * miktar) / arz;
            biriken[id][i] = b - pay;
            vp += pay;
        }

        /* one order per vault chain that holds something of this launch */
        uint256 butce = gelen;
        uint256 bekleyen;
        for (uint256 i = 0; i < k.length; i++) {
            uint32 z = k[i].zincir;
            if (!kasaDolu[id][z]) continue;
            bool once;
            for (uint256 j = 0; j < i; j++) if (k[j].zincir == z) once = true;
            if (once) continue;
            bytes memory m = _satEmri(id, i, miktar, arz, hz, alici);
            (bool okundu, uint256 u) = _ucret6(z, m);
            /* what the sent fee does not cover, the holder's own waiting dollars pay */
            if (okundu && u > butce && u - butce <= vp) {
                vp -= u - butce;
                butce = u;
            }
            if (okundu && u <= butce) {
                if (u > 0 && !usdc.transfer(address(haberci), u)) revert TransferOlmadi();
                butce -= u;
                /* a fee moved to the messenger and not spent stays there as fee money for the queue */
                try haberci.gonder(z, kasa[z], m, 0) {
                    emit EmirGitti(id, z, u);
                    continue;
                } catch {}
            }
            emirler.push(Emir(z, id, 0, false, m));
            bekleyen++;
        }
        /* the queued orders' tips: from this redemption's own waiting dollars,
           and what those cannot cover from the launch's waiting dollars (a few
           cents of the basket, so that someone always has a reason to send) */
        if (bekleyen > 0) {
            uint256 gerek = BAHSIS * bekleyen;
            uint256 kendi = vp < gerek ? vp : gerek;
            vp -= kendi;
            uint256 ortak = _ortaktanAl(id, gerek - kendi);
            uint256 bahsis = (kendi + ortak) / bekleyen;
            for (uint256 n = emirler.length - bekleyen; n < emirler.length; n++) {
                emirler[n].bahsis = bahsis;
                emit EmirBekliyor(n, id, emirler[n].zincir, bahsis);
            }
        }
        if (vp > 0) _ode(hz, alici, vp);
        if (butce > 0) _iade(iade, hz, alici, butce);
        emit Itfa(id, miktar, arz, hz, alici, vp);
    }

    /// Up to `m` dollars from launch `id`'s waiting dollars, line by line.
    function _ortaktanAl(uint64 id, uint256 m) internal returns (uint256 alinan) {
        uint256 n = kalemler[id].length;
        for (uint256 i = 0; i < n && alinan < m; i++) {
            uint256 b = biriken[id][i];
            uint256 al = b < m - alinan ? b : m - alinan;
            biriken[id][i] = b - al;
            alinan += al;
        }
    }

    /// The v2 SAT order to the vault on line i's chain, naming every asset of
    /// this launch there. Byte for byte the v2 wire format.
    function _satEmri(uint64 id, uint256 i, uint256 miktar, uint256 arz, uint32 hz, bytes32 alici) internal view returns (bytes memory) {
        Kalem[] storage k = kalemler[id];
        uint32 z = k[i].zincir;
        uint256 n;
        for (uint256 j = i; j < k.length; j++) if (k[j].zincir == z) n++;
        bytes32[] memory v = new bytes32[](n);
        n = 0;
        for (uint256 j = i; j < k.length; j++) if (k[j].zincir == z) v[n++] = k[j].varlik;
        /* An island vault (BNB, Robinhood) has no road out but relay's
           fixed deposit addresses: it pays its share on the island itself,
           to the same EVM address. Solana, Sui and Aptos reach islands
           only through Arc: their share for an island holder is paid on
           Arc, to the same EVM address. */
        uint32 oz;
        if (_ada(z)) oz = z;
        else oz = (_evmDisi(z) && _ada(hz)) ? haberci.zincir() : hz;
        return abi.encode(SepetMesaj.SAT, id, v, miktar, arz, oz, alici);
    }

    /// The messenger's fee for an order to `z`, in 6-decimal dollars. A
    /// route that sends no LayerZero message (Sui, Aptos: CCTP) costs 0, and
    /// so does an order to this chain. A messenger that cannot say its route
    /// (a test double) is read as free and the send itself decides; one that
    /// cannot quote a LayerZero route returns false (the order is queued).
    function _ucret6(uint32 z, bytes memory m) internal view returns (bool, uint256) {
        (bool ok, bytes memory r) = address(haberci).staticcall(abi.encodeWithSignature("yol(uint32)", z));
        if (!ok || r.length != 32) return (true, 0);
        uint8 y = abi.decode(r, (uint8));
        if (y == 4 || y == 5 || z == haberci.zincir()) return (true, 0);
        (ok, r) = address(haberci).staticcall(abi.encodeWithSignature("ucret(uint32,bytes32,bytes,uint256)", z, kasa[z], m, uint256(0)));
        if (!ok || r.length != 32) return (false, 0);
        return (true, (abi.decode(r, (uint256)) + 1e12 - 1) / 1e12);
    }

    /// Unused fee budget: to `iade` on this chain; with none, to the holder
    /// if they are an EVM address paid here; otherwise it stays with the
    /// messenger as fee money (it can only ever pay this system's orders).
    function _iade(address iade, uint32 hz, bytes32 alici, uint256 m) internal {
        address a = iade;
        if (a == address(0) && hz == haberci.zincir() && uint256(alici) >> 160 == 0) a = address(uint160(uint256(alici)));
        if (a == address(0)) a = address(haberci);
        if (!usdc.transfer(a, m)) revert TransferOlmadi();
    }

    /// What a redemption of `miktar` of launch `id`, paid to `alici` on `hz`,
    /// costs in messenger fees (6-decimal dollars): the page asks this and
    /// sends it with the burn. Fees move with gas prices: add a margin, the
    /// rest comes back.
    function itfaUcreti(uint64 id, uint256 miktar, uint32 hz, bytes32 alici) external view returns (uint256 t) {
        Launch storage L = launchlar[id];
        if (!L.var_ || miktar == 0 || miktar > L.arz) return 0;
        Kalem[] storage k = kalemler[id];
        for (uint256 i = 0; i < k.length; i++) {
            uint32 z = k[i].zincir;
            if (!kasaDolu[id][z]) continue;
            bool once;
            for (uint256 j = 0; j < i; j++) if (k[j].zincir == z) once = true;
            if (once) continue;
            (, uint256 u) = _ucret6(z, _satEmri(id, i, miktar, L.arz, hz, alici));
            t += u;
        }
    }

    /// What sending queued order `i` costs now (6-decimal dollars).
    function emirUcreti(uint256 i) external view returns (uint256 u) {
        Emir storage e = emirler[i];
        (, u) = _ucret6(e.zincir, e.veri);
    }

    function emirSayisi() external view returns (uint256) { return emirler.length; }

    /// Anyone: send queued order `i`, paying its messenger fee now (USDC
    /// approved here; on Arc that is the native coin's ERC-20 face). The
    /// order's tip goes to the sender. A send that fails reverts the call:
    /// the order stays queued and nothing is spent.
    function emirGonder(uint256 i) external kilitli {
        Emir storage e = emirler[i];
        if (e.gitti) revert Gitti();
        e.gitti = true;
        (bool okundu, uint256 u) = _ucret6(e.zincir, e.veri);
        if (!okundu) revert KotuMesaj();
        if (u > 0 && !usdc.transferFrom(msg.sender, address(haberci), u)) revert TransferOlmadi();
        haberci.gonder(e.zincir, kasa[e.zincir], e.veri, 0);
        /* an order queued when nothing was waiting takes its tip from what waits now */
        uint256 b = e.bahsis > 0 ? e.bahsis : _ortaktanAl(e.id, BAHSIS);
        if (b > 0 && !usdc.transfer(msg.sender, b)) revert TransferOlmadi();
        emit EmirGonderildi(i, msg.sender, u, b);
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
