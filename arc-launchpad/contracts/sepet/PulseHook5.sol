// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
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

/// The launch's tax bucket (VergiKovasi): passes what it holds on to the basket.
interface IKovaH {
    function gonder() external;
    function gonderimVar() external view returns (bool);
}

interface IPulseKayit {
    function havuzKaydi(PoolId id)
        external
        view
        returns (address token, address acici, address kurucu, address kasa, uint256 vergiPpm);
}

/// @title PulseHook5 — PulseHook4 with a 0.20% slice that buys and burns FTHM
///
/// The trade fee is 2.20% instead of 2.00%. The founder's, the developer
/// fund's, the liquidity pot's, operations' and depth's slices are the same
/// as PulseHook4's; the extra 0.20% goes to FthmYakici, which buys FTHM with
/// it by auction and sends every unit to 0xdead.
///
/// What follows is PulseHook4's own header, unchanged.
///
/// PulseHook4 — PulseHook, plus the two things the vault and the
///        launch need from the one contract that sees every trade
///
/// WHAT CHANGED FROM PulseHook (security review 2026-10-16, C-1 H-1 H-2 L-2)
///
/// 1. THE POOL'S OWN TOKEN RESERVE IS COUNTED HERE
///      The vaults measured circulating supply as totalSupply minus the
///      PoolManager's token balance. That balance is not the pool: it is
///      every pool, every ERC-6909 claim and every unsettled credit on the
///      PoolManager, and inside an unlock anyone can take() it out and
///      settle() it back for free. A flash take inflated circulating supply
///      mid-buyback (C-1, drained 85-90% of a vault in the PoC); parking
///      tokens as 6909 claims shrank it for a redemption (H-1).
///
///      The pool's reserve is not something to read, it is something to
///      count. Only the pool's opener can add liquidity and nobody can
///      remove it, so the reserve changes in exactly two ways, and this
///      hook is called for both:
///        afterAddLiquidity  the principal the opener paid in (fees it
///                           collects are not principal and are excluded)
///        afterSwap          the pool's own swap delta, before any hook
///                           delta: what really left or entered the pool
///      A take(), a settle(), a 6909 mint or another pool moves none of
///      these. A real swap does, and a real swap really changes who holds
///      the tokens.
///
/// 2. ONLY THE POOL'S OPENER CAN INITIALIZE IT (H-2)
///      The token's address is predictable before the launch, and v4 lets
///      anyone initialize any PoolKey. One 50k-gas initialize per future
///      address blocked every launch for good. beforeInitialize now accepts
///      only the opener the launchpad registered for that pool, and the
///      launchpad registers it before the opener initializes.
///
/// 3. THE VOLUME SHIELD READS THE NEW CIRCULATING SUPPLY (L-2)
///      It reads kasa.dolasim(), which is now built on (1), so a flash take
///      no longer dilutes the shield away.
///
/// PERMISSIONS: PulseHook's 0xACC plus BEFORE_INITIALIZE (1<<13) and
/// AFTER_ADD_LIQUIDITY (1<<10): the address's low 14 bits are 0x2ECC.
///
/// What follows is PulseHook's own header, unchanged.
///
/// PulseHook — a fee on every buy and sell, whichever way it goes
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
/// 4. THE VOLUME SHIELD, AND NO DRAWDOWN FLAG (v7)
///      `EgriHook`'s per-block SELL VOLUME shield stays: an extra fee on a
///      sale above 0.5% of circulating, paid into the basket. The v5/v6
///      hook also set a "defence open" flag 60% below a pool's peak, but
///      nothing read it; v7 removes it rather than describe a defence that
///      does not act.
contract PulseHook5 {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    IPulseKayit public immutable launchpad;
    address public immutable quote;
    address public immutable gelistiriciFonu;
    address public immutable likiditeKasasi;
    address public immutable isletmeKasasi;
    /// buys FTHM with its slice and burns it (FthmYakici)
    address public immutable fthmYakici;

    /* ---- the rates, all immutable ------------------------------- */

    uint256 public constant FEE_PPM = 22_000;            // 2,20% a trade
    uint256 public constant KURUCU_PPM = 3_000;          // 0,30%
    uint256 public constant GELISTIRICI_PPM = 3_000;     // 0,30%
    uint256 public constant LIKIDITE_PPM = 5_000;        // 0,50%
    uint256 public constant ISLETME_PPM = 2_000;         // 0,20%
    uint256 public constant FTHM_PPM = 2_000;            // 0,20%: FTHM bought and burned
    /* What the four named slices leave: 7_000 of 20_000, so 0,70% of the
       trade. Computed rather than written, so it can never disagree with
       the four above — a hand-written total that drifted from its parts
       is how every sell once reverted with Panic(0x11). */
    uint256 public constant DERINLIK_PPM =
        FEE_PPM - KURUCU_PPM - GELISTIRICI_PPM - LIKIDITE_PPM - ISLETME_PPM - FTHM_PPM;

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

    /* ---- the tax, passed on in the trade (v4, v5) -------------------- */
    /// Gas the bucket gets to pass a trade's tax on to the Defter when that
    /// sends basket lines to their vaults (at most two per call, the Defter's
    /// AZAMI_GONDERIM; the two dearest sends measured ~0.91M with the
    /// booking, 24 Oct; this leaves well over half again).
    uint256 public constant KOVA_GAZ = 2_000_000;
    /// Gas to only book the tax on the lines (nothing reaches $50).
    uint256 public constant KOVA_KUCUK = 400_000;
    /// v5: a trade that does not carry this gas (plus room to finish) reverts
    /// instead of skipping the bucket. v4 skipped it when gas was short, and a
    /// wallet's gas estimate (the least gas that succeeds) is exactly a gas
    /// that skips it: the tax would have waited for a rich trade. The
    /// bucket's own failure is still ignored: the dollars wait for the next
    /// trade and nothing else is held up.
    error KovaGazi(uint256 gerekli);

    struct Pencere {
        uint64 blok;
        uint192 ppm;
    }
    mapping(PoolId => Pencere) public pencere;

    /* ---- no drawdown trigger -------------------------------------
       v7 (24 Oct 2026): the v5/v6 hook tracked each pool's peak and set a
       one-way "defence open" flag 60% below it. Nothing in the set read the
       flag (the buyback it was written for belongs to an earlier
       generation), so every trade paid for two storage writes that did
       nothing, and the docs had to explain a defence that was not there.
       Removed. */

    /// The launch token held by the pool's locked positions, counted from
    /// the principal the opener paid in and every swap's pool delta. The
    /// vault subtracts this, and only this, from total supply.
    mapping(PoolId => uint256) public havuzdakiToken;

    event Ucret(
        PoolId indexed id, bool alim, bool exactInput,
        uint256 kurucu, uint256 gelistirici, uint256 likidite,
        uint256 isletme, uint256 vergi, uint256 derinlik,
        uint256 snipe, uint256 kalkan
    );
    event TokenUcreti(PoolId indexed id, uint256 toplam);
    event SnipeKesildi(PoolId indexed id, uint256 gecen, uint256 oran, uint256 kesilen);

    error NotPoolManager();
    error BilinmeyenHavuz();
    error OnlyAcici();
    error LikiditeKilitli();
    error TransferOlmadi();
    error KotuKurulum();
    error SadeceAcici();

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
        address _isletmeKasasi,
        address _fthmYakici
    ) {
        if (address(_poolManager) == address(0)) revert KotuKurulum();
        if (address(_launchpad) == address(0)) revert KotuKurulum();
        if (_quote == address(0)) revert KotuKurulum();
        if (_gelistiriciFonu == address(0)) revert KotuKurulum();
        if (_likiditeKasasi == address(0)) revert KotuKurulum();
        if (_isletmeKasasi == address(0)) revert KotuKurulum();
        if (_fthmYakici == address(0)) revert KotuKurulum();
        poolManager = _poolManager;
        launchpad = _launchpad;
        quote = _quote;
        gelistiriciFonu = _gelistiriciFonu;
        likiditeKasasi = _likiditeKasasi;
        isletmeKasasi = _isletmeKasasi;
        fthmYakici = _fthmYakici;
    }

    /* ---- the pool can only be born from its own opener ----------- */

    /// v4 lets anyone initialize any PoolKey, including one for a token that
    /// does not exist yet. The launchpad registers the pool (launchIdOfPool)
    /// before its opener calls initialize, so an initialize from anyone else,
    /// or for a pool no launch registered, is refused.
    function beforeInitialize(address sender, PoolKey calldata key, uint160)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        (, address acici,,,) = launchpad.havuzKaydi(key.toId());
        if (acici == address(0) || sender != acici) revert SadeceAcici();
        return IHooks.beforeInitialize.selector;
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

    /// Count the principal the opener just paid in. `delta` is what the
    /// caller owes or receives, principal plus fees the position collected
    /// on the way; only the principal is reserve.
    function afterAddLiquidity(
        address,
        PoolKey calldata key,
        ModifyLiquidityParams calldata,
        BalanceDelta delta,
        BalanceDelta feesAccrued,
        bytes calldata
    )
        external
        onlyPoolManager
        returns (bytes4, BalanceDelta)
    {
        PoolId id = key.toId();
        (address tokenAdr,,,,) = launchpad.havuzKaydi(id);
        BalanceDelta anapara = delta - feesAccrued;
        int128 t = Currency.unwrap(key.currency0) == tokenAdr ? anapara.amount0() : anapara.amount1();
        if (t < 0) havuzdakiToken[id] += uint256(uint128(-t));
        return (IHooks.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
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

        /* The pool's reserve, from the pool's own delta (v4 passes afterSwap
           the swap's delta before any hook delta is applied). Positive means
           the swapper received tokens: they left the pool. Done before the
           early return below, because every swap moves the reserve. */
        {
            int128 rezervDelta = tokenSifirinci ? delta.amount0() : delta.amount1();
            if (rezervDelta > 0) {
                uint256 cikan = uint256(uint128(rezervDelta));
                uint256 r = havuzdakiToken[id];
                havuzdakiToken[id] = r > cikan ? r - cikan : 0;
            } else if (rezervDelta < 0) {
                havuzdakiToken[id] += uint256(uint128(-rezervDelta));
            }
        }

        /* THE OTHER HALF OF THE EXCLUSION. Evaluated from the same two
           facts beforeSwap used, so the two cannot both fire and cannot
           both abstain. */
        if (exactInput && Currency.unwrap(girdi) == quote) {
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
        uint256 f = (protokol * FTHM_PPM) / FEE_PPM;
        /* What the four named slices did not claim — 7_000 of 20_000, so
           0,70% of the trade — plus the dust from four integer divisions,
           plus the snipe, plus anything the caller over-took. Depth,
           because dust that goes nowhere evaporates and dust that goes to
           a wallet is a wallet collecting it. */
        uint256 d = protokol - k - g - l - i - f + snipe + derinlikEk;

        if (k > 0 && !IERC20H(quote).transfer(kurucu, k)) revert TransferOlmadi();
        if (g > 0 && !IERC20H(quote).transfer(gelistiriciFonu, g)) revert TransferOlmadi();
        if (l > 0 && !IERC20H(quote).transfer(likiditeKasasi, l)) revert TransferOlmadi();
        if (i > 0 && !IERC20H(quote).transfer(isletmeKasasi, i)) revert TransferOlmadi();
        if (f > 0 && !IERC20H(quote).transfer(fthmYakici, f)) revert TransferOlmadi();
        if (v > 0 && !IERC20H(quote).transfer(kasa, v)) revert TransferOlmadi();
        if (v > 0) {
            /* the bucket says whether this tax sends basket lines (then the
               dear gas) or only books it; a bucket that cannot answer books */
            (bool ok, bytes memory r) = kasa.staticcall{gas: 150_000}(abi.encodeWithSelector(IKovaH.gonderimVar.selector));
            uint256 g = ok && r.length >= 32 && abi.decode(r, (bool)) ? KOVA_GAZ : KOVA_KUCUK;
            if (gasleft() < g + 250_000) revert KovaGazi(g);
            /* the result is not read: a bucket that cannot pass it on now keeps it */
            (bool gecti,) = kasa.call{gas: g}(abi.encodeWithSelector(IKovaH.gonder.selector));
            gecti;
        }
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
}
