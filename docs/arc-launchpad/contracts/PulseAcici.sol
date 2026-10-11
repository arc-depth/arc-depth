// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";

interface IERC20P {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title PulseAcici — havuzu AÇILIŞ FİYATINDA açar, iki tarafı da gerçek
///
/// NEDEN YENİ BİR AÇICI GEREKTİ
///   `HavuzAcici` fiyatı konan miktarların ORANINDAN türetiyor. Yeni kuralda
///   havuza $98 gerçek USDC ve 972.000.000 token konuyor; o oranın ima ettiği
///   fiyat $0,0000001008, yani açılış fiyatının 35 KATI ALTINDA. Ölçülebilir
///   bir hata değil, kaçınılmaz bir sonuç: oran bir fiyat değil, iki miktarın
///   bölümü.
///
///   Bu yüzden açılış fiyatı burada bir GİRDİ. Hesaplanıp işlem gönderilmeden
///   önce okunabiliyor, türetilmiyor.
///
/// NEDEN TEK BİR POZİSYON DEĞİL, İKİ TANE
///   v4'te fiyatın üstünü KAPSAYAN bir pozisyon iki varlıkla fonlanmak
///   zorunda ve oranı seçme hakkı yok — sizin verdiğiniz iki miktardan
///   küçüğü neyi fonluyorsa o kadar likidite oluyor, kalanı geri dönüyor.
///   Yani "şu kadar USDC ve şu kadar token koy" diyemiyorsunuz.
///
///   O yüzden iki ayrı tek taraflı pozisyon:
///
///     TOKEN  fiyatın ÜSTÜNE    -> merdiven. Alıcılar yukarı yürürken
///                                 dolarları havuzu dolduruyor.
///     USDC   fiyatın ALTINA    -> gerçek teklif. Satanın karşısına
///                                 çıkan para bu.
///
///   Hiçbiri fiyatı kapsamadığı için her biri tek varlıkla tam olarak
///   istenen miktarda fonlanıyor. Bu, projede ölçülmüş iki hatanın da
///   dışında kalan tek şekil: tek yönlü merdiven teklifi hiç tutamadı
///   (havuz deltası $0,00 döndü), fiyatı kapsayan iki taraflı pozisyon ise
///   miktarları kabul etmedi.
///
/// SANAL LİKİDİTE YOK — BU HAVUZDA OLAN HER ŞEY GERÇEK
///   Merdiven gerçek token, teklif gerçek USDC. "Fantom" olan tek şey
///   merdivenin ima ettiği eğri şekli, ki o bir bakiye değil bir
///   YERLEŞTİRME. Arayüzün gösterdiği USDC bu sözleşmenin havuzdaki gerçek
///   bakiyesidir ve `havuzdakiQuote()` onu zincirden okur.
///
/// KİLİTLİ, VE KİMSE ÇEKEMEZ
///   Likiditeyi azaltacak bir fonksiyon yok. `modifyLiquidity` yalnızca
///   pozitif delta ile çağrılıyor ve çağıran adresi hiçbir yere
///   yazılmıyor — yani çekilecek bir sahiplik kaydı da yok. Kurucu da
///   protokol de DAO da çekemez.
contract PulseAcici {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    IERC20P public immutable token;
    IERC20P public immutable quote;
    IHooks public immutable hook;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;
    address public immutable acan;
    bool public immutable tokenSifirinci;

    bool public acildi;
    PoolId public havuzId;
    uint160 public acilisSqrtPriceX96;
    int24 public altTick;
    int24 public ustTick;
    uint128 public likidite;
    /* THE TWO SIDES, COUNTED SEPARATELY
       The total is useless for reading one side back: the quote amount
       is a function of the QUOTE position liquidity over the QUOTE
       position range. Using the sum reported a $98 bid as
       $1.035.625.524.240.113.300.000 — two mistakes compounding, and
       absurd enough to catch, which is the only reason it was caught. */
    uint128 public likiditeTeklif;      // the quote side
    uint128 public likiditeMerdiven;    // the token side
    int24 public teklifAlt;
    int24 public teklifUst;

    event Acildi(
        PoolId havuzId, uint160 sqrtPriceX96, int24 alt, int24 ust,
        uint256 konanToken, uint256 konanQuote, uint128 likidite
    );
    event Biriktirildi(int24 alt, int24 ust, uint256 miktar, uint128 likidite);

    error SadeceAcan();
    error ZatenAcildi();
    error HenuzAcilmadi();
    error BosMiktar();
    error KotuBant();
    error NotPoolManager();
    error OdemeOlmadi();
    error TekTarafKonmadi();

    uint8 private constant MOD_AC = 0;
    uint8 private constant MOD_BIRIKTIR = 1;

    struct Veri {
        uint8 mod;
        PoolKey key;
        uint160 sqrtP;
        int24 alt;
        int24 ust;
    }

    constructor(
        IPoolManager _poolManager,
        IERC20P _token,
        IERC20P _quote,
        IHooks _hook,
        uint24 _fee,
        int24 _tickSpacing,
        address _acan
    ) {
        poolManager = _poolManager;
        token = _token;
        quote = _quote;
        hook = _hook;
        fee = _fee;
        tickSpacing = _tickSpacing;
        acan = _acan;
        tokenSifirinci = address(_token) < address(_quote);
    }

    /* ---- opening ---------------------------------------------------- */

    /// Open the pool at `sqrtPriceX96` and place both balances, each on its
    /// own side of that price.
    ///
    /// @param sqrtPriceX96 the OPENING price, computed from the launch's
    ///        market cap and supply. An input rather than a derivation:
    ///        deriving it from the amounts gives the ratio of two numbers,
    ///        which is not a price.
    /// @param alt  the bid band's lower edge. Below the price.
    /// @param ust  the ladder's upper edge. Above the price.
    ///
    /// Both edges are checked against the price here rather than trusted:
    /// a band that straddles it would ask for the asset this side does not
    /// have, and v4's answer to that is to place nothing — which reads as
    /// a successful open with an empty pool.
    function ac(uint160 sqrtPriceX96, int24 alt, int24 ust) external returns (uint128) {
        if (msg.sender != acan) revert SadeceAcan();
        if (acildi) revert ZatenAcildi();

        uint256 t = token.balanceOf(address(this));
        uint256 q = quote.balanceOf(address(this));
        /* Both sides are required. A launch with no bid is the shape this
           product exists to avoid, and a launch with no ladder has nothing
           to sell. */
        if (t == 0 || q == 0) revert BosMiktar();

        PoolKey memory key = _anahtar();
        int24 simdiki = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        /* Strictly outside on both sides, after snapping. The ladder starts
           at the first tick ABOVE the price and the bid ends at the first
           at or below it, so there is no rung straddling the opening
           price and no gap a buyer can cross for free. */
        if (ust <= _yukari(simdiki)) revert KotuBant();
        if (alt >= _asagi(simdiki)) revert KotuBant();

        acildi = true;
        acilisSqrtPriceX96 = sqrtPriceX96;
        altTick = alt;
        ustTick = ust;

        poolManager.initialize(key, sqrtPriceX96);
        havuzId = key.toId();
        poolManager.unlock(abi.encode(Veri(MOD_AC, key, sqrtPriceX96, alt, ust)));

        emit Acildi(havuzId, sqrtPriceX96, alt, ust,
                    t - token.balanceOf(address(this)),
                    q - quote.balanceOf(address(this)), likidite);
        return likidite;
    }

    /* ---- growing ---------------------------------------------------- */

    /// Put whatever this contract holds into the pool, each asset into the
    /// part of the band on its own side.
    ///
    /// The hook sends its depth slice here and a buy's fee arrives as
    /// tokens, so without this they would pile up unreachable — the shape
    /// of mistake this project has already paid for once.
    ///
    /// Open to anyone and safe to be: it takes no arguments, so a caller
    /// chooses nothing. The ranges come from the stored band and the pool's
    /// own price, and everything it places is locked like the rest.
    function biriktir() external returns (uint128 eklenen) {
        if (!acildi) revert HenuzAcilmadi();
        PoolKey memory key = _anahtar();
        poolManager.unlock(abi.encode(Veri(MOD_BIRIKTIR, key, 0, altTick, ustTick)));
        return _sonEklenen;
    }

    uint128 private _sonEklenen;

    /* ---- what the interface should show ----------------------------- */

    /// The REAL quote this pool's locked position is holding.
    ///
    /// Exists so the interface never has to infer it. "Sanal likidite
    /// gerçek USDC gibi gösterilmeyecek" is a rule about what a screen
    /// says, and a screen can only keep it if there is a number to read.
    /// This is that number: what the position was funded with, net of what
    /// trading has since taken out of it.
    function havuzdakiQuote() external view returns (uint256) {
        if (!acildi || likiditeTeklif == 0) return 0;
        (, int24 simdiki) = _slot0(_anahtar());

        /* THE FORMULA DEPENDS ON WHICH CURRENCY THE QUOTE IS
             amount0 = L * (1/sa - 1/sb)      quote sorts first
             amount1 = L * (sb - sa)          quote sorts second

           Written with one formula first, and it reported a $98 bid as
           $1.035.625.524.240.113.300.000. Two mistakes at once: the
           wrong side formula, applied to the SUM of both positions.
           Neither would have shown in a number that was merely a
           little wrong.

           The live range is clipped to the current price, because the
           part of the bid the market has already walked through is no
           longer quote — it became tokens and belongs to whoever
           bought them. */
        if (tokenSifirinci) {
            /* quote is currency1: its band is BELOW the price */
            int24 ust = _asagi(simdiki);
            if (ust > teklifUst) ust = teklifUst;
            if (ust <= teklifAlt) return 0;
            uint160 sa = TickMath.getSqrtPriceAtTick(teklifAlt);
            uint160 sb = TickMath.getSqrtPriceAtTick(ust);
            return FullMath.mulDiv(uint256(likiditeTeklif), uint256(sb - sa), FixedPoint96.Q96);
        }
        /* quote is currency0: its band is ABOVE the price */
        int24 alt = _yukari(simdiki);
        if (alt < teklifAlt) alt = teklifAlt;
        if (alt >= teklifUst) return 0;
        uint160 sa2 = TickMath.getSqrtPriceAtTick(alt);
        uint160 sb2 = TickMath.getSqrtPriceAtTick(teklifUst);
        uint256 ara = FullMath.mulDiv(uint256(sa2), uint256(sb2), FixedPoint96.Q96);
        if (ara == 0) return 0;
        return FullMath.mulDiv(uint256(likiditeTeklif), uint256(sb2 - sa2), ara);
    }

    /* ---- v4 plumbing ------------------------------------------------ */

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        Veri memory v = abi.decode(data, (Veri));
        return _yerlestirIkiTaraf(v, v.mod == MOD_AC);
    }

    /// Place every balance this contract holds, each asset into the part of
    /// the band on its own side of the CURRENT price.
    ///
    /// One function for both opening and growing, because they are the same
    /// operation: at opening the current price is the opening price and the
    /// balances are the launch's; later the price has moved and the
    /// balances are the fees. Writing them twice would be two places for
    /// the side logic to drift, and the side logic is the whole of it.
    function _yerlestirIkiTaraf(Veri memory v, bool acilis) internal returns (bytes memory) {
        (, int24 simdiki) = acilis
            ? (uint160(0), TickMath.getTickAtSqrtPrice(v.sqrtP))
            : _slot0(v.key);

        if (!acilis) {
            /* Realise whatever the position has accrued, so the fees it
               earned go back in with everything else. A zero-delta change
               is what makes v4 pay them out. */
            (BalanceDelta kazanc,) = poolManager.modifyLiquidity(
                v.key,
                ModifyLiquidityParams({tickLower: v.alt, tickUpper: v.ust,
                                       liquidityDelta: 0, salt: bytes32(0)}),
                ""
            );
            if (kazanc.amount0() > 0)
                poolManager.take(v.key.currency0, address(this), uint256(uint128(kazanc.amount0())));
            if (kazanc.amount1() > 0)
                poolManager.take(v.key.currency1, address(this), uint256(uint128(kazanc.amount1())));
        }

        uint128 toplam = 0;

        /* currency0 can fund, alone, only a range entirely ABOVE the price;
           currency1 only one entirely below it. */
        uint256 b0 = IERC20P(Currency.unwrap(v.key.currency0)).balanceOf(address(this));
        if (b0 > 0) {
            int24 a = _yukari(simdiki);
            if (a < v.alt) a = v.alt;
            if (a < v.ust) {
                uint128 l = _ekle(v.key, a, v.ust, b0, true);
                toplam += l;
                /* currency0 is the quote exactly when the token sorts
                   SECOND. Decided by the ordering, not by which band is
                   which: the band direction flips with the ordering and
                   the currency identity does not. */
                if (tokenSifirinci) { likiditeMerdiven += l; }
                else { likiditeTeklif += l; teklifAlt = a; teklifUst = v.ust; }
            }
        }

        uint256 b1 = IERC20P(Currency.unwrap(v.key.currency1)).balanceOf(address(this));
        if (b1 > 0) {
            int24 b = _asagi(simdiki);
            if (b > v.ust) b = v.ust;
            if (b > v.alt) {
                uint128 l = _ekle(v.key, v.alt, b, b1, false);
                toplam += l;
                if (tokenSifirinci) { likiditeTeklif += l; teklifAlt = v.alt; teklifUst = b; }
                else { likiditeMerdiven += l; }
            }
        }

        /* At opening BOTH sides must have landed. Measured on the previous
           generation: a one-sided attempt returned a $0.00 delta and the
           open still looked successful, so the pool went live with no bid
           in it. Refusing here makes that unreachable rather than
           unlikely. */
        if (acilis) {
            if (b0 == 0 || b1 == 0 || toplam == 0) revert TekTarafKonmadi();
        }

        likidite += toplam;
        _sonEklenen = toplam;
        return "";
    }

    function _ekle(PoolKey memory key, int24 alt, int24 ust, uint256 miktar, bool sifirinci)
        internal returns (uint128)
    {
        uint160 sa = TickMath.getSqrtPriceAtTick(alt);
        uint160 sb = TickMath.getSqrtPriceAtTick(ust);
        uint256 l = _tekTaraf(miktar, sa, sb, sifirinci);
        if (l > type(uint128).max) l = type(uint128).max;
        if (l == 0) return 0;

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({tickLower: alt, tickUpper: ust,
                                   liquidityDelta: int256(l), salt: bytes32(0)}),
            ""
        );
        _ode(key.currency0, delta.amount0());
        _ode(key.currency1, delta.amount1());
        emit Biriktirildi(alt, ust, miktar, uint128(l));
        return uint128(l);
    }

    /// Liquidity that `miktar` of a single asset implies over [sa, sb].
    ///
    /// FullMath carries the intermediate in 512 bits; the naive product of
    /// a token amount and two Q96 roots overflowed uint256 in this project
    /// once, which is why it is not written the short way.
    function _tekTaraf(uint256 miktar, uint160 sa, uint160 sb, bool sifirinci)
        internal pure returns (uint256)
    {
        if (sb <= sa) return 0;
        if (sifirinci) {
            // amount0 = L * (1/sa - 1/sb)
            uint256 ara = FullMath.mulDiv(uint256(sa), uint256(sb), FixedPoint96.Q96);
            return FullMath.mulDiv(miktar, ara, uint256(sb - sa));
        }
        // amount1 = L * (sb - sa)
        return FullMath.mulDiv(miktar, FixedPoint96.Q96, uint256(sb - sa));
    }

    function _ode(Currency para, int128 delta) internal {
        if (delta >= 0) return;
        uint256 borc = uint256(uint128(-delta));
        poolManager.sync(para);
        if (!IERC20P(Currency.unwrap(para)).transfer(address(poolManager), borc)) {
            revert OdemeOlmadi();
        }
        poolManager.settle();
    }

    /// The first usable tick strictly above `t`, and the first at or below.
    /// Written with an explicit floor because Solidity truncates toward
    /// zero, so plain division rounds the wrong way for a negative tick —
    /// and these pools DO see one: at $0.0000035 a token against a
    /// six-decimal quote the opening tick is deeply negative.
    function _yukari(int24 t) internal view returns (int24) {
        return (_kat(t) + 1) * tickSpacing;
    }

    function _asagi(int24 t) internal view returns (int24) {
        return _kat(t) * tickSpacing;
    }

    function _kat(int24 t) internal view returns (int24) {
        int24 k = t / tickSpacing;
        if (t < 0 && k * tickSpacing != t) k -= 1;
        return k;
    }

    function _anahtar() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(tokenSifirinci ? address(token) : address(quote)),
            currency1: Currency.wrap(tokenSifirinci ? address(quote) : address(token)),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: hook
        });
    }

    function _slot0(PoolKey memory key) internal view returns (uint160, int24) {
        bytes32 slot = keccak256(abi.encode(PoolId.unwrap(key.toId()), uint256(6)));
        bytes32 raw = poolManager.extsload(slot);
        return (uint160(uint256(raw)), int24(uint24(uint256(raw) >> 160)));
    }
}
