// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PulseFabrika} from "../PulseFabrika.sol";
import {PulseLaunchpad, IQuoteP} from "../PulseLaunchpad.sol";
import {PulseAcici, IERC20P} from "../PulseAcici.sol";
import {KasaFabrika} from "../KasaFabrika.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

interface IERC20L {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

interface IDolasimL {
    function dolasim() external view returns (uint256);
    function hak(address varlik) external view returns (uint256);
}

/// THE FOUNDER HAS TO BE SOMEBODY ELSE
///   The harness launched the token itself first, and the run died with
///   Panic(0x11): the founder's slice is measured as an INCREASE in the
///   founder's balance, and the harness is also the one paying for the
///   swaps — so its balance fell and the subtraction underflowed.
///
///   Not a test artefact. It is the same confusion a real launch would
///   have if the founder and the trader were one account, and separating
///   them is what makes "the founder earned 0,30%" a readable number
///   rather than a net of two unrelated flows.
contract SahteKurucu {
    function launch(
        PulseLaunchpad lp,
        address quote,
        string calldata ad,
        string calldata sembol,
        address hedefVarlik,
        uint256 vergiPpm,
        uint256 alim,
        uint256 teminat
    ) external returns (address token, address kasa) {
        IERC20L(quote).approve(address(lp), type(uint256).max);
        return lp.launch(ad, sembol, hedefVarlik, vergiPpm, alim, teminat);
    }

    /// Hand the launch tokens to the harness so it can trade them. The
    /// founder keeping them would mean the sale test had nothing to sell.
    function gonder(address token, address to, uint256 v) external {
        IERC20L(token).transfer(to, v);
    }
}

/// @title TestPulseLaunch — yeni launch uçtan uca, ve iki kritik bilinmeyen
///
/// İKİ ŞEY BAŞKA HİÇBİR YERDE GÖRÜNMÜYOR
///
/// 1. EXACT-OUTPUT TAKAS ÜCRET ÖDÜYOR MU
///      `EgriHook` exact-output'ta sıfır döndürüyordu, yani bir aggregator
///      "bana tam N token ver" diyerek vergisiz işlem yapabiliyordu. Yeni
///      kanca ücreti GİRDİden alıyor ve bunun v4'te gerçekten işe
///      yaradığını yalnızca ölçüm söyler: `afterSwap`'ın döndürdüğü
///      pozitif delta belirtilmeyen tarafa uygulanıyor ve o taraf
///      exact-output'ta trader'ın BORCU. Akıl yürütmeyle bırakılacak bir
///      yer değil.
///
/// 2. dolasim() HAVUZU DIŞLIYOR MU
///      Eğri kalktığı için satılmamış arz artık havuzda. Kasa dolaşımı
///      `totalSupply - balanceOf(egri) - balanceOf(acici)` diye
///      hesaplıyor ve `egri` yuvasına PoolManager verildi. Yanlış olsa
///      REVERT ETMEZDİ: hak, kimsenin sahip olmadığı ~%97 arzla sulanır
///      ve her iade teminatın küçük bir kesrini öder. Hiçbir tek bakiyede
///      görünmez.
///
///      O yüzden burada satıra güvenilmiyor: dolaşım, gerçekten cüzdanda
///      duran tokenlerle karşılaştırılıyor.
///
/// ADRESLER CREATE2 İLE, NONCE TAHMİNİ YOK
///   Kanca, launchpad'in adresini immutable olarak taşımak zorunda ve
///   launchpad de kancayı — döngü. Proje bunu nonce tahminiyle çözüyordu
///   ve o tahmin dört koşum kaybettirdi. Burada ikisi de sabit tuzla
///   CREATE2 ile kuruluyor, yani adresler tamamen belirli ve betik
///   ikisini de bağımsız olarak hesaplayıp karşılaştırıyor.
contract TestPulseLaunch {
    using PoolIdLibrary for PoolKey;

    struct Sonuc {
        address fabrika;
        address launchpad;
        address token;
        address acici;
        address kasa;
        address kurucu;
        bool tokenSifirinci;

        /* ---- 1. the launch ---- */
        bool launchGecti;
        bytes launchSebep;
        uint256 alim;
        uint256 ucret;
        uint256 net;
        uint256 teminat;
        uint256 kurucuToken;
        uint256 merdiven;
        uint256 arz;

        uint160 havuzSqrtP;
        int24 havuzTick;
        uint160 beklenenSqrtP;
        uint256 kasadakiUsdc;
        uint256 aciciKalanToken;
        uint256 aciciKalanQuote;
        uint256 bildirilenTeklif;

        /* ---- 2. does dolasim exclude the pool ---- */
        uint256 dolasim;
        uint256 cuzdandaki;        // what wallets actually hold
        uint256 havuzdakiToken;    // the unsold ladder
        uint256 hak;

        /* ---- 3. exact-input buy ---- */
        bool giristenGecti;
        uint256 giristenOdenen;
        uint256 giristenAlinan;
        uint256 giristenKurucuArtti;
        uint256 giristenKasaArtti;
        uint256 giristenDerinlikArtti;
        bytes giristenSebep;

        /* ---- 4. exact-OUTPUT buy — the hole ---- */
        bool ciktidanGecti;
        uint256 ciktidanIstenen;
        uint256 ciktidanOdenen;
        uint256 ciktidanKurucuArtti;
        uint256 ciktidanKasaArtti;
        uint256 ciktidanDerinlikArtti;
        bytes ciktidanSebep;

        /* ---- 5. a sale ---- */
        bool satisGecti;
        uint256 satilanToken;
        uint256 satistanAlinan;
        uint256 satistanKasaArtti;
        bytes satisSebep;
    }

    IPoolManager private _pm;
    PoolKey private _key;
    bool private _t0;
    address private _token;

    /* The sinks. Plain addresses so each slice is a visible transfer and
       the measurement can read a balance rather than trust an event. */
    address constant GELISTIRICI = address(uint160(0xDEF1));
    address constant LIKIDITE = address(uint160(0x11F0));
    address constant ISLETME = address(uint160(0x15E7));

    function kos(
        IPoolManager pm,
        address quote,
        IHooks hook,
        KasaFabrika kasaFabrika,
        address kayit,
        address tokenMessenger,
        address mesajTasiyici,
        uint256 alim,
        uint256 teminat,
        uint256 vergiPpm,
        address hedefVarlik
    ) external returns (Sonuc memory s) {
        _pm = pm;

        PulseFabrika f = new PulseFabrika{salt: bytes32(0)}();
        s.fabrika = address(f);

        PulseLaunchpad lp = new PulseLaunchpad{salt: bytes32(0)}(
            IQuoteP(quote), pm, hook, f, kasaFabrika,
            GELISTIRICI, LIKIDITE, ISLETME, kayit, tokenMessenger, mesajTasiyici
        );
        s.launchpad = address(lp);

        s.alim = alim;
        s.teminat = teminat;

        SahteKurucu kurucu = new SahteKurucu();
        s.kurucu = address(kurucu);
        /* The founder pays for its own launch, out of its own balance.
           Transferred rather than approved from here, so the launchpad
           pulls from the founder and the founder is what the register
           records. */
        IERC20L(quote).transfer(address(kurucu), alim + teminat);

        try kurucu.launch(lp, quote, "Arc Pulse", "PULSE", hedefVarlik,
                          vergiPpm, alim, teminat)
            returns (address t, address k)
        {
            s.launchGecti = true;
            s.token = t;
            s.kasa = k;
        } catch (bytes memory e) {
            s.launchGecti = false;
            s.launchSebep = e;
            return s;
        }

        /* The founder's tokens come here so the sale can be measured. The
           founder's QUOTE balance stays untouched, which is what makes the
           0,30% slice readable as a single number. */
        kurucu.gonder(s.token, address(this), IERC20L(s.token).balanceOf(address(kurucu)));

        PulseLaunchpad.Kayit memory kay = lp.launchAt(0);
        s.acici = kay.acici;
        s.kurucuToken = kay.kurucuToken;
        s.net = kay.teklif;
        s.ucret = alim - s.net;
        s.arz = IERC20L(s.token).totalSupply();
        s.merdiven = s.arz - s.kurucuToken;
        _token = s.token;
        _t0 = s.token < quote;
        s.tokenSifirinci = _t0;

        (s.beklenenSqrtP,,) = lp.acilisBandi(s.token);
        _key = lp.havuzAnahtari(s.token);
        (s.havuzSqrtP, s.havuzTick) = _slot0();

        s.kasadakiUsdc = IERC20L(quote).balanceOf(s.kasa);
        s.aciciKalanToken = IERC20L(s.token).balanceOf(s.acici);
        s.aciciKalanQuote = IERC20L(quote).balanceOf(s.acici);
        s.bildirilenTeklif = PulseAcici(s.acici).havuzdakiQuote();

        /* ---- the circulating-supply question ---------------------- */
        s.dolasim = IDolasimL(s.kasa).dolasim();
        s.havuzdakiToken = IERC20L(s.token).balanceOf(address(pm));
        /* What wallets actually hold: everything minus the pool's unsold
           inventory and the ladder contract's unplaced remainder. Computed
           here from balances so it shares no code with the vault. */
        s.cuzdandaki = s.arz - s.havuzdakiToken - s.aciciKalanToken;
        s.hak = IDolasimL(s.kasa).hak(quote);

        /* ---- exact-input buy -------------------------------------- */
        {
            uint256 k0 = IERC20L(quote).balanceOf(kay.kurucu);
            uint256 v0 = IERC20L(quote).balanceOf(s.kasa);
            uint256 d0 = IERC20L(quote).balanceOf(s.acici);
            s.giristenOdenen = s.net / 20;
            try this.takas(int256(-int256(s.giristenOdenen)), true) returns (uint256 alinan, uint256) {
                s.giristenGecti = true;
                s.giristenAlinan = alinan;
            } catch (bytes memory e) { s.giristenSebep = e; }
            s.giristenKurucuArtti = IERC20L(quote).balanceOf(kay.kurucu) - k0;
            s.giristenKasaArtti = IERC20L(quote).balanceOf(s.kasa) - v0;
            s.giristenDerinlikArtti = IERC20L(quote).balanceOf(s.acici) - d0;
        }

        /* ---- exact-OUTPUT buy: the hole --------------------------- */
        {
            uint256 k0 = IERC20L(quote).balanceOf(kay.kurucu);
            uint256 v0 = IERC20L(quote).balanceOf(s.kasa);
            uint256 d0 = IERC20L(quote).balanceOf(s.acici);
            /* BIG ENOUGH THAT THE FEE IS NOT DUST
                 Asked for 1 token first — about $0,0000035 — and a 3% fee
                 of that rounds to zero at six decimals. The tax looked
                 ABSENT when it was only smaller than a cent, which is the
                 kind of false negative that gets a real hole declared
                 fixed. Sized off the bid instead, so every slice lands
                 above the rounding floor. */
            s.ciktidanIstenen = s.giristenAlinan == 0 ? 1_000_000e18 : s.giristenAlinan / 2;
            try this.takas(int256(s.ciktidanIstenen), true) returns (uint256, uint256 odenen) {
                s.ciktidanGecti = true;
                s.ciktidanOdenen = odenen;
            } catch (bytes memory e) { s.ciktidanSebep = e; }
            s.ciktidanKurucuArtti = IERC20L(quote).balanceOf(kay.kurucu) - k0;
            s.ciktidanKasaArtti = IERC20L(quote).balanceOf(s.kasa) - v0;
            s.ciktidanDerinlikArtti = IERC20L(quote).balanceOf(s.acici) - d0;
        }

        /* ---- a sale ---------------------------------------------- */
        {
            uint256 v0 = IERC20L(quote).balanceOf(s.kasa);
            uint256 elde = IERC20L(s.token).balanceOf(address(this));
            s.satilanToken = elde / 4;
            if (s.satilanToken > 0) {
                try this.takas(int256(-int256(s.satilanToken)), false) returns (uint256 alinan, uint256) {
                    s.satisGecti = true;
                    s.satistanAlinan = alinan;
                } catch (bytes memory e) { s.satisSebep = e; }
            }
            s.satistanKasaArtti = IERC20L(quote).balanceOf(s.kasa) - v0;
        }
    }

    /// One swap. `miktar` negative is exact-input, positive is
    /// exact-output. `alim` true spends the quote to get tokens.
    ///
    /// External so a failure can be caught without taking the whole
    /// measurement down — and the two directions are separate arguments
    /// rather than one flag, because `zeroForOne` means opposite things
    /// for the two orderings and this has been got backwards before.
    function takas(int256 miktar, bool alim) external returns (uint256 alinan, uint256 odenen) {
        bytes memory r = _pm.unlock(abi.encode(miktar, alim));
        return abi.decode(r, (uint256, uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (int256 miktar, bool alim) = abi.decode(data, (int256, bool));
        /* Buying means spending the quote. The quote is currency1 when the
           token sorts first, so zeroForOne is false then. Derived from the
           ordering, never hardcoded. */
        bool zeroForOne = alim ? !_t0 : _t0;

        BalanceDelta delta = _pm.swap(
            _key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: miktar,
                sqrtPriceLimitX96: zeroForOne
                    ? TickMath.MIN_SQRT_PRICE + 1
                    : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        int128 d0 = delta.amount0();
        int128 d1 = delta.amount1();
        int128 tokenD = _t0 ? d0 : d1;
        int128 quoteD = _t0 ? d1 : d0;
        _ode(_key.currency0, d0);
        _ode(_key.currency1, d1);

        uint256 a = alim
            ? (tokenD > 0 ? uint256(uint128(tokenD)) : 0)
            : (quoteD > 0 ? uint256(uint128(quoteD)) : 0);
        uint256 o = alim
            ? (quoteD < 0 ? uint256(uint128(-quoteD)) : 0)
            : (tokenD < 0 ? uint256(uint128(-tokenD)) : 0);
        return abi.encode(a, o);
    }

    function _ode(Currency para, int128 delta) internal {
        if (delta > 0) {
            _pm.take(para, address(this), uint256(uint128(delta)));
            return;
        }
        if (delta == 0) return;
        uint256 borc = uint256(uint128(-delta));
        _pm.sync(para);
        IERC20L(Currency.unwrap(para)).transfer(address(_pm), borc);
        _pm.settle();
    }

    function _slot0() internal view returns (uint160, int24) {
        bytes32 slot = keccak256(abi.encode(PoolId.unwrap(_key.toId()), uint256(6)));
        bytes32 raw = _pm.extsload(slot);
        return (uint160(uint256(raw)), int24(uint24(uint256(raw) >> 160)));
    }
}
