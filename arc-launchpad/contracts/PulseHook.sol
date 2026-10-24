// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta}
    from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

interface IERC20H {
    function transfer(address to, uint256 v) external returns (bool);
}

interface IDolasimH {
    function dolasim() external view returns (uint256);
}

interface IPulseKayit {
    function havuzKaydi(PoolId id)
        external
        view
        returns (address token, address acici, address kurucu, address kasa, uint256 vergiPpm);
}

/// @title PulseHook — a fee on every buy and sell, whichever way it goes
///
/// FOUR DIFFERENCES FROM EGRIHOOK
///
/// 1. EXACT-OUTPUT SWAPS PAY TOO — THIS WAS THE REAL HOLE
///      `EgriHook` only takes a fee while the UNSPECIFIED side is
///      positive:
///
///      On an exact-input swap the unspecified side is the output and it
///      is positive, so the fee is taken. On an exact-OUTPUT swap the
///      unspecified side is the INPUT and it is negative — the trader
///      owes it — and that line returns zero. So an aggregator saying
///      "give me exactly 1,000 tokens" PAYS NO TAX AT ALL.
///
///      Item 7 of the spec is aimed at exactly this: "the same fees are
///      taken whether the user trades directly on Uniswap or through an
///      aggregator."
///
///      How it is closed: on exact-output the fee comes out of the
///      INPUT. The trader gets exactly the output they asked for and pays
///      a little more for it — which is how every taxed token behaves,
///      and the alternative would be trimming the output, which would
///      break the promise of "exactly N tokens".
///
/// 2. NO HOLDER REWARD
///      Six slices became five and that 0.30% went to depth: 0.40% ->
///      0.70%. The 2% total did not change. Sent to a wallet it would be
///      a wallet collecting money; sent nowhere it would evaporate.
///
/// 3. THE SNIPE TAX NOW LIVES IN THE POOL
///      In the previous generation the snipe was on the curve, and the
///      curve is gone. Here it applies for the first 5 seconds from the
///      pool's opening, at a falling rate, and to BUYS ONLY.
///
///      The founder's first buy is exempt automatically — because it is
///      not a swap. The launchpad sends the tokens straight to the
///      wallet without touching the pool, so this hook never sees it.
///      The exemption is not a special case but a consequence; and the
///      rule that it "does not carry into later trades" holds by itself,
///      because there is no flag to carry.
///
/// 4. A 60% DRAWDOWN FROM THE PEAK OPENS THE DEFENCE
///      `EgriHook`'s shield was a per-block SELL VOLUME shield — an extra
///      fee on a sale above 0.5% of circulating. Leaving that protection
///      in place was right, but the spec asks for something else: the
///      collateral stepping in on a 60% drawdown from the peak.
///
///      They are not the same thing and both are here. The volume shield
///      makes a large sale in one block expensive; the drawdown trigger
///      opens the buyback during a sustained collapse. One defends
///      speed, the other defends depth.
contract PulseHook {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    IPulseKayit public immutable launchpad;
    address public immutable quote;
    address public immutable gelistiriciFonu;
    address public immutable likiditeKasasi;
    address public immutable isletmeKasasi;

    /* ---- the rates, all immutable ------------------------------- */

    uint256 public constant FEE_PPM = 20_000;            // 2,00% a trade
    uint256 public constant KURUCU_PPM = 3_000;          // 0,30%
    uint256 public constant GELISTIRICI_PPM = 3_000;     // 0,30%
    uint256 public constant LIKIDITE_PPM = 5_000;        // 0,50%
    uint256 public constant ISLETME_PPM = 2_000;         // 0,20%
    /* What the four named slices leave: 7_000 of 20_000, so 0,70% of the
       trade. Computed rather than written, so it can never disagree with
       the four above — a hand-written total that drifted from its parts
       is how every sell once reverted with Panic(0x11). */
    uint256 public constant DERINLIK_PPM =
        FEE_PPM - KURUCU_PPM - GELISTIRICI_PPM - LIKIDITE_PPM - ISLETME_PPM;

    /* ---- anti-snipe --------------------------------------------- */

    /// 99,00% in the pool's own opening second, quartering every second.
    /// Measured on the previous generation's curve: 990_000 >> (2*t) gives
    /// 99,00 / 24,75 / 6,19 / 1,55 / 0,39 / 0 percent.
    uint256 public constant SNIPE_PPM = 990_000;
    uint64 public constant SNIPE_SURESI = 5;

    /// When each pool opened, recorded the first time its ladder adds
    /// liquidity. Not taken from the launchpad: the launch and the open
    /// are the same transaction, so this is the same number, and reading
    /// it here means the hook does not depend on a second contract
    /// answering correctly about time.
    mapping(PoolId => uint64) public acilis;

    /* ---- the volume shield (kept from EgriHook) ----------------- */

    uint256 public constant KALKAN_ESIK_PPM = 5_000;     // 0,50% of circulating
    uint256 public constant KALKAN_TAVAN_PPM = 30_000;   // 3,00% extra, capped

    struct Pencere {
        uint64 blok;
        uint192 ppm;
    }
    mapping(PoolId => Pencere) public pencere;

    /* ---- the drawdown trigger ----------------------------------- */

    /// The best price this pool has ever printed, as sqrtPriceX96 ADJUSTED
    /// so that larger always means a dearer token.
    ///
    /// WHY ADJUSTED AND NOT RAW
    ///   A v4 price is currency1/currency0, so a higher sqrtP means the
    ///   token is DEARER when it sorts first and CHEAPER when it sorts
    ///   second. Storing the raw value and comparing with `>` would track
    ///   the peak on one ordering and the TROUGH on the other — and
    ///   nothing would revert. The band direction made exactly this
    ///   mistake one measurement earlier.
    mapping(PoolId => uint160) public zirve;

    /// 60% off the peak, expressed in sqrt terms: a price multiple m is a
    /// sqrt multiple sqrt(m), and sqrt(0,40) = 0,632455...
    /// Written as a ratio out of 1e6 so the comparison stays integral.
    uint256 public constant DUSUS_SQRT_BPS = 632_455;     // sqrt(0,40) * 1e6
    uint256 public constant DUSUS_BOLEN = 1_000_000;

    /// True once this pool has fallen 60% from its peak. One-way on
    /// purpose: a recovery should not switch the defence off mid-way, and
    /// a flag that flickers with the price is a flag an attacker can
    /// flicker.
    mapping(PoolId => bool) public savunmaAcik;

    event Ucret(
        PoolId indexed id, bool alim, bool exactInput,
        uint256 kurucu, uint256 gelistirici, uint256 likidite,
        uint256 isletme, uint256 vergi, uint256 derinlik,
        uint256 snipe, uint256 kalkan
    );
    event TokenUcreti(PoolId indexed id, uint256 toplam);
    event SnipeKesildi(PoolId indexed id, uint256 gecen, uint256 oran, uint256 kesilen);
    event SavunmaAcildi(PoolId indexed id, uint160 zirve, uint160 simdiki);

    error NotPoolManager();
    error BilinmeyenHavuz();
    error OnlyAcici();
    error LikiditeKilitli();
    error TransferOlmadi();
    error KotuKurulum();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    constructor(
        IPoolManager _poolManager,
        IPulseKayit _launchpad,
        address _quote,
        address _gelistiriciFonu,
        address _likiditeKasasi,
        address _isletmeKasasi
    ) {
        if (address(_poolManager) == address(0)) revert KotuKurulum();
        if (address(_launchpad) == address(0)) revert KotuKurulum();
        if (_quote == address(0)) revert KotuKurulum();
        if (_gelistiriciFonu == address(0)) revert KotuKurulum();
        if (_likiditeKasasi == address(0)) revert KotuKurulum();
        if (_isletmeKasasi == address(0)) revert KotuKurulum();
        poolManager = _poolManager;
        launchpad = _launchpad;
        quote = _quote;
        gelistiriciFonu = _gelistiriciFonu;
        likiditeKasasi = _likiditeKasasi;
        isletmeKasasi = _isletmeKasasi;
    }

    /* ---- liquidity: only the ladder, and never out -------------- */

    function beforeAddLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4)
    {
        PoolId id = key.toId();
        (, address acici,,,) = launchpad.havuzKaydi(id);
        if (acici == address(0)) revert BilinmeyenHavuz();
        /* Only that pool's own ladder, so nobody else can add liquidity
           they would then be unable to remove. */
        if (sender != acici) revert OnlyAcici();

        /* The pool's opening time, written once. The launch and the open
           are one transaction, so this is the launch's timestamp — and
           recording it here rather than reading it from the launchpad
           means the anti-snipe window does not depend on a second
           contract answering correctly about time. */
        if (acilis[id] == 0) acilis[id] = uint64(block.timestamp);
        return IHooks.beforeAddLiquidity.selector;
    }

    /// Removals revert. A zero delta is not a removal and is allowed.
    ///
    /// v4 routes `modifyLiquidity` here whenever the delta is not
    /// positive, so delta == 0 arrives too — and a zero delta is how a
    /// position realises accrued fees, which is exactly what the ladder's
    /// `biriktir` does before re-adding them as more locked liquidity.
    /// Rejecting zero did not lock liquidity harder; it broke the one
    /// function that makes the pool deeper, and it took a run against the
    /// real PoolManager to find.
    ///
    /// Allowing it cannot withdraw anything: v4 keys positions by
    /// (owner, lower, upper, salt), so a stranger calling this collects
    /// from a position they do not have.
    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata params,
        bytes calldata
    )
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (params.liquidityDelta != 0) revert LikiditeKilitli();
        return IHooks.beforeRemoveLiquidity.selector;
    }

    /* ---- the fee, on whichever leg carries the quote ------------- */

    /// Charge the fee on the INPUT when the input is the quote.
    ///
    /// WHY THIS CALLBACK HAD TO BE ADDED
    ///   `afterSwap` can only move the UNSPECIFIED side — that is v4's
    ///   rule, not a choice. On an exact-input BUY the unspecified side is
    ///   the token coming out, so the fee could only be taken in TOKENS,
    ///   and the token branch sends everything to depth. Measured: an
    ///   exact-input buy put $0,000000 into the vault.
    ///
    ///   That breaks the collateral system on half the volume, because an
    ///   exact-input buy is what an ordinary buyer does. The spec is
    ///   explicit that the tax accumulates as USDC in the token's own
    ///   vault, and tokens routed to depth are neither.
    ///
    ///   `beforeSwap` can move the SPECIFIED side, which on an exact-input
    ///   swap is the input. So the quote is skimmed before the swap sees
    ///   it: the trader spends what they said, slightly less of it reaches
    ///   the curve, and the difference is the fee — in the asset the vault
    ///   actually holds.
    ///
    /// NO DOUBLE CHARGE, AND NOT BECAUSE OF A FLAG
    ///   "Ayni ucretin iki kez kesilmesini engelle." A storage flag or a
    ///   transient marker would work and both can be got wrong. Instead
    ///   the two callbacks are mutually exclusive BY CONSTRUCTION, on a
    ///   condition each can evaluate alone:
    ///
    ///     beforeSwap charges  <=>  exact-input AND input is the quote
    ///     afterSwap  charges  <=>  anything else
    ///
    ///   Neither reads state the other wrote, so there is no ordering to
    ///   get wrong and nothing to reset.
    function beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata
    )
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        (, address acici, address kurucu, address kasa, uint256 vergiPpm) =
            launchpad.havuzKaydi(id);
        if (acici == address(0)) revert BilinmeyenHavuz();

        bool exactInput = params.amountSpecified < 0;
        Currency girdi = params.zeroForOne ? key.currency0 : key.currency1;
        if (!exactInput || Currency.unwrap(girdi) != quote) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        /* Spending the quote is buying the token, so this leg is always a
           purchase and the anti-snipe window applies. The volume shield
           does not: it defends the floor against sales. */
        uint256 taban = uint256(-params.amountSpecified);
        (uint256 protokol, uint256 v, uint256 snipe, uint256 toplam) =
            _ucretler(id, taban, true, vergiPpm, kasa, 0);
        if (toplam == 0) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        poolManager.take(girdi, address(this), toplam);
        _paraDagit(id, true, true, protokol, v, snipe, 0, kurucu, kasa, acici);

        /* Positive on the specified side. v4 does
           `amountToSwap += hookDeltaSpecified` and amountToSwap is
           negative for an exact-input swap, so a positive delta REDUCES
           what is swapped by exactly this much — and credits the hook the
           same, which is what the take above draws on. */
        return (
            IHooks.beforeSwap.selector,
            toBeforeSwapDelta(int128(int256(toplam)), 0),
            0
        );
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    )
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        PoolId id = key.toId();
        (address tokenAdr, address acici, address kurucu, address kasa, uint256 vergiPpm) =
            launchpad.havuzKaydi(id);
        if (acici == address(0)) revert BilinmeyenHavuz();

        bool tokenSifirinci = Currency.unwrap(key.currency0) == tokenAdr;
        bool exactInput = params.amountSpecified < 0;
        Currency girdi = params.zeroForOne ? key.currency0 : key.currency1;

        /* THE OTHER HALF OF THE EXCLUSION. Evaluated from the same two
           facts beforeSwap used, so the two cannot both fire and cannot
           both abstain. The peak is still updated: the drawdown trigger
           has to see every trade, charged here or not. */
        if (exactInput && Currency.unwrap(girdi) == quote) {
            _zirveGuncelle(id, key, tokenSifirinci);
            return (IHooks.afterSwap.selector, 0);
        }

        /* A BUY is the token leaving the pool towards the trader, which is
           a positive delta on the token's side. Read from the delta rather
           than from zeroForOne: the flag means opposite things for the two
           orderings and this does not. */
        int128 tokenDelta = tokenSifirinci ? delta.amount0() : delta.amount1();
        bool alim = tokenDelta > 0;

        /* The unspecified side, the only one afterSwap may move:
             exact-input  -> the OUTPUT, positive
             exact-output -> the INPUT, negative
           Both are charged. The previous hook returned zero for the
           second, which let an exact-output router trade tax free. */
        (Currency ucretParasi, int128 belirtilmeyen) = exactInput
            ? (params.zeroForOne ? key.currency1 : key.currency0,
               params.zeroForOne ? delta.amount1() : delta.amount0())
            : (params.zeroForOne ? key.currency0 : key.currency1,
               params.zeroForOne ? delta.amount0() : delta.amount1());

        uint256 taban = belirtilmeyen >= 0
            ? uint256(uint128(belirtilmeyen))
            : uint256(uint128(-belirtilmeyen));

        _zirveGuncelle(id, key, tokenSifirinci);
        if (taban == 0) return (IHooks.afterSwap.selector, 0);

        uint256 satisBoyu = (!alim && tokenDelta < 0) ? uint256(uint128(-tokenDelta)) : 0;
        (uint256 protokol, uint256 v, uint256 snipe, uint256 toplam) =
            _ucretler(id, taban, alim, vergiPpm, kasa, satisBoyu);
        if (toplam == 0) return (IHooks.afterSwap.selector, 0);

        poolManager.take(ucretParasi, address(this), toplam);

        if (Currency.unwrap(ucretParasi) == quote) {
            _paraDagit(id, alim, exactInput, protokol, v, snipe,
                       toplam - protokol - v - snipe, kurucu, kasa, acici);
        } else {
            /* Tokens. Paying the founder in the launch token pays them in
               something they must sell, and the vault's claim is
               denominated in the quote — its own launch token would not be
               collateral, it would be circular. So all of it becomes
               depth. */
            if (!IERC20H(Currency.unwrap(ucretParasi)).transfer(acici, toplam)) {
                revert TransferOlmadi();
            }
            emit TokenUcreti(id, toplam);
        }

        return (IHooks.afterSwap.selector, int128(uint128(toplam)));
    }

    /* ---- one place the rates are applied ------------------------ */

    /// The three charges and their total, for a trade of `taban`.
    ///
    /// ONE FUNCTION, TWO CALLERS, ON PURPOSE
    ///   beforeSwap and afterSwap both need this and writing it twice
    ///   would be two rate tables that can drift. This project has
    ///   already paid for a total that disagreed with its parts: every
    ///   sell reverted with Panic(0x11).
    ///
    /// THE ORDER IS THE WHOLE OF IT
    ///   Snipe comes off FIRST and everything else is a fraction of the
    ///   remainder. Sized off the same base instead, an opening-second buy
    ///   owed 99% + 2% + 1% = 102%, the clamp cut it to 100%, and the
    ///   buyer received ZERO tokens for $4,90. A trade that takes
    ///   everything and returns nothing is not a tax.
    ///
    ///   The previous generation's curve already had it right:
    ///     kesilen = quoteIn * oran ; net = quoteIn - kesilen ;
    ///     ucret = _ucret(net)
    function _ucretler(
        PoolId id,
        uint256 taban,
        bool alim,
        uint256 vergiPpm,
        address kasa,
        uint256 satisBoyu
    )
        internal
        returns (uint256 protokol, uint256 v, uint256 snipe, uint256 toplam)
    {
        if (alim) {
            uint64 basladi = acilis[id];
            if (basladi != 0) {
                uint256 gecen = block.timestamp > basladi ? block.timestamp - basladi : 0;
                uint256 oran = _snipeOrani(gecen);
                if (oran > 0) {
                    snipe = (taban * oran) / 1_000_000;
                    emit SnipeKesildi(id, gecen, oran, snipe);
                }
            }
        }

        uint256 kalan = taban - snipe;
        protokol = (kalan * FEE_PPM) / 1_000_000;
        /* A fraction of the trade, not of the protocol's fee. The creator
           picked this one and it is the only slice that stays with the
           token instead of reaching the protocol. */
        v = (kalan * vergiPpm) / 1_000_000;

        if (!alim && satisBoyu > 0) {
            (uint256 ekPpm,) = _kalkan(id, kasa, satisBoyu);
            /* The shield rides with the vault's share: a sale is what
               pushes the floor down, so what a large sale pays goes to the
               floor rather than to the protocol. */
            v += (kalan * ekPpm) / 1_000_000;
        }

        toplam = snipe + protokol + v;
        /* Cannot bind any more — the three sum to at most
           snipe + (taban - snipe) * 10% — but kept so a future rate change
           fails closed instead of taking more than the trade moved. */
        if (toplam > taban) {
            uint256 fazla = toplam - taban;
            toplam = taban;
            if (protokol >= fazla) {
                protokol -= fazla;
            } else {
                fazla -= protokol;
                protokol = 0;
                v = v >= fazla ? v - fazla : 0;
            }
        }
    }

    /// Pay out the quote-denominated charges. `derinlikEk` is whatever the
    /// caller took beyond the three named amounts, which only the
    /// afterSwap path can have.
    function _paraDagit(
        PoolId id,
        bool alim,
        bool exactInput,
        uint256 protokol,
        uint256 v,
        uint256 snipe,
        uint256 derinlikEk,
        address kurucu,
        address kasa,
        address acici
    ) internal {
        uint256 k = (protokol * KURUCU_PPM) / FEE_PPM;
        uint256 g = (protokol * GELISTIRICI_PPM) / FEE_PPM;
        uint256 l = (protokol * LIKIDITE_PPM) / FEE_PPM;
        uint256 i = (protokol * ISLETME_PPM) / FEE_PPM;
        /* What the four named slices did not claim — 7_000 of 20_000, so
           0,70% of the trade — plus the dust from four integer divisions,
           plus the snipe, plus anything the caller over-took. Depth,
           because dust that goes nowhere evaporates and dust that goes to
           a wallet is a wallet collecting it. */
        uint256 d = protokol - k - g - l - i + snipe + derinlikEk;

        if (k > 0 && !IERC20H(quote).transfer(kurucu, k)) revert TransferOlmadi();
        if (g > 0 && !IERC20H(quote).transfer(gelistiriciFonu, g)) revert TransferOlmadi();
        if (l > 0 && !IERC20H(quote).transfer(likiditeKasasi, l)) revert TransferOlmadi();
        if (i > 0 && !IERC20H(quote).transfer(isletmeKasasi, i)) revert TransferOlmadi();
        if (v > 0 && !IERC20H(quote).transfer(kasa, v)) revert TransferOlmadi();
        if (d > 0 && !IERC20H(quote).transfer(acici, d)) revert TransferOlmadi();
        emit Ucret(id, alim, exactInput, k, g, l, i, v, d, snipe, 0);
    }

    /* ---- the schedules ------------------------------------------ */

    /// 990_000 ppm quartering every second, zero from SNIPE_SURESI on.
    function _snipeOrani(uint256 gecen) public pure returns (uint256) {
        if (gecen >= SNIPE_SURESI) return 0;
        return SNIPE_PPM >> (2 * gecen);
    }

    function _kalkan(PoolId id, address kasa, uint256 tokenMiktari)
        internal
        returns (uint256 ekPpm, uint256 blokPpm)
    {
        if (kasa == address(0) || tokenMiktari == 0) return (0, 0);

        /* Circulating supply through a bounded staticcall. afterSwap
           reverting means the pool cannot trade at all, so a failure here
           has to mean NO SHIELD and never a dead market. */
        (bool ok, bytes memory ret) = kasa.staticcall(
            abi.encodeWithSelector(IDolasimH.dolasim.selector)
        );
        if (!ok || ret.length < 32) return (0, 0);
        uint256 dolasim = abi.decode(ret, (uint256));
        if (dolasim == 0) return (0, 0);

        uint256 pay = (tokenMiktari * 1_000_000) / dolasim;
        Pencere memory w = pencere[id];
        uint256 onceki = w.blok == uint64(block.number) ? uint256(w.ppm) : 0;
        blokPpm = onceki + pay;
        if (blokPpm > type(uint192).max) blokPpm = type(uint192).max;
        pencere[id] = Pencere({blok: uint64(block.number), ppm: uint192(blokPpm)});

        if (blokPpm <= KALKAN_ESIK_PPM) return (0, blokPpm);
        ekPpm = blokPpm - KALKAN_ESIK_PPM;
        if (ekPpm > KALKAN_TAVAN_PPM) ekPpm = KALKAN_TAVAN_PPM;
    }

    /* ---- the drawdown ------------------------------------------- */

    /// Track the peak and open the defence 60% below it.
    ///
    /// The comparison is done on an ADJUSTED root so that bigger always
    /// means a dearer token. Storing the raw sqrtP and comparing with `>`
    /// would follow the peak on one ordering and the trough on the other,
    /// and nothing would revert — the same trap the band direction fell
    /// into one measurement earlier.
    function _zirveGuncelle(PoolId id, PoolKey calldata key, bool tokenSifirinci) internal {
        (uint160 sp,) = _slot0(key);
        if (sp == 0) return;
        /* Dearer-is-larger. When the token sorts second the raw root is
           token-per-quote, so its RECIPROCAL rises with the token's
           price; inverted in Q96 so the stored value keeps full range. */
        uint160 olcut = tokenSifirinci ? sp : uint160((uint256(1) << 192) / uint256(sp));
        if (olcut == 0) return;

        uint160 z = zirve[id];
        if (olcut > z) {
            zirve[id] = olcut;
            return;
        }
        if (z == 0 || savunmaAcik[id]) return;
        /* 60% off in price is sqrt(0,40) off in root terms. */
        if (uint256(olcut) * DUSUS_BOLEN <= uint256(z) * DUSUS_SQRT_BPS) {
            savunmaAcik[id] = true;
            emit SavunmaAcildi(id, z, olcut);
        }
    }

    /// Whether this pool's collateral defence is open, for the vault and
    /// the buyback to read. A view rather than a callback: the hook must
    /// never be able to fail a swap because something downstream did.
    function savunmaDurumu(PoolId id)
        external
        view
        returns (bool acik, uint160 zirveOlcut)
    {
        return (savunmaAcik[id], zirve[id]);
    }

    function _slot0(PoolKey calldata key) internal view returns (uint160, int24) {
        bytes32 slot = keccak256(abi.encode(PoolId.unwrap(key.toId()), uint256(6)));
        bytes32 raw = poolManager.extsload(slot);
        return (uint160(uint256(raw)), int24(uint24(uint256(raw) >> 160)));
    }
}
