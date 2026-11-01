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
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

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

/// @title PulseHook6 — PulseHook5 with the operations slice split in two,
///        both recipients changeable, and a TWAP oracle per pool
///
/// WHAT CHANGED FROM PulseHook5 (owner, 1 Nov 2026)
///
/// 1. THE 0.20% OPERATIONS SLICE IS TWO 0.10% SLICES
///      The total stays 2.20% and every other slice is the same constant as
///      in PulseHook5. ISLETME_PPM (2_000) is now SAHIP_PPM (1_000, the
///      owner's share) plus PAZARLAMA_PPM (1_000, development and
///      marketing). PulseHook5 sent the whole 0.20% to an immutable address;
///      here each half goes to a recipient the `yonetici` can change, and
///      the yonetici can hand the role on (for example to the DAO's
///      governor). Nothing is locked, by the owner's order; no recipient and
///      no yonetici can ever be the zero address. The Ucret event keeps its
///      shape: `isletme` is the two halves together.
///
/// 2. A MANIPULATION-RESISTANT PRICE (TWAP), PER POOL
///      A Uniswap v3 style tick accumulator. It is brought up to date at the
///      start of the first swap of every block, in beforeSwap, with the
///      pool's tick as it was BEFORE that swap: the tick that really held
///      since the last update. (afterSwap would be too late: the swap that
///      pumps would already have moved the tick it records.) So a pump
///      inside a block weighs nothing in that block, and one second per
///      second it is left standing after. Every GOZLEM_ARALIK (60 s) or
///      more a snapshot of the accumulator goes into a 48-slot ring per
///      pool, so a full ring spans at least 47 minutes. `twapTick` averages
///      from the newest snapshot at or before (now - saniye) to now: an
///      exact average over a window of at least `saniye`.
///      Gas per swap: the first swap of a block reads and writes the
///      accumulator slot and reads slot0 (roughly 7-8k gas); when a
///      snapshot is due, one ring slot more (about 5k, 22k the first time
///      that slot is used); later swaps in the same block about 2.2k.
///      Anyone may call `gozle(token)` to write an observation.
///
/// What follows is PulseHook5's own header, unchanged.
///
/// PulseHook5 — PulseHook4 with a 0.20% slice that buys and burns FTHM
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
contract PulseHook6 {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;
    IPulseKayit public immutable launchpad;
    address public immutable quote;
    address public immutable gelistiriciFonu;
    address public immutable likiditeKasasi;
    /// buys FTHM with its slice and burns it (FthmYakici)
    address public immutable fthmYakici;

    /* ---- the rates, all immutable ------------------------------- */

    uint256 public constant FEE_PPM = 22_000;            // 2,20% a trade
    uint256 public constant KURUCU_PPM = 3_000;          // 0,30%
    uint256 public constant GELISTIRICI_PPM = 3_000;     // 0,30%
    uint256 public constant LIKIDITE_PPM = 5_000;        // 0,50%
    uint256 public constant SAHIP_PPM = 1_000;           // 0,10%: the owner's share
    uint256 public constant PAZARLAMA_PPM = 1_000;       // 0,10%: development and marketing
    /// PulseHook5's operations slice, now the two above together
    uint256 public constant ISLETME_PPM = SAHIP_PPM + PAZARLAMA_PPM;   // 0,20%
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

    /* ---- the two operations recipients, changeable (v9) ----------- */

    /// receives SAHIP_PPM of every trade
    address public sahipAlici;
    /// receives PAZARLAMA_PPM of every trade
    address public pazarlamaAlici;
    /// may change both recipients and hand this role on; never zero
    address public yonetici;

    event SahipAliciDegisti(address indexed eski, address indexed yeni);
    event PazarlamaAliciDegisti(address indexed eski, address indexed yeni);
    event YoneticiDegisti(address indexed eski, address indexed yeni);

    error SadeceYonetici();
    error SifirAdres();

    /* ---- the oracle (v9) ------------------------------------------ */

    uint256 public constant GOZLEM_SAYISI = 48;
    /// the least time between two snapshots in the ring
    uint32 public constant GOZLEM_ARALIK = 60;

    /// The running accumulator: the sum of tick x seconds since the pool's
    /// first observation, as of `zaman`; `indeks` the newest ring slot,
    /// `dolu` how many ring slots hold a snapshot. One storage slot.
    struct Birikim {
        uint32 zaman;
        int56 tickKum;
        uint8 indeks;
        uint8 dolu;
    }
    struct Gozlem {
        uint32 zaman;
        int56 tickKum;
    }
    mapping(PoolId => Birikim) public birikim;
    mapping(PoolId => Gozlem[GOZLEM_SAYISI]) internal gozlemler;
    /// the launch token's pool, written when its ladder first adds liquidity
    mapping(address => PoolId) public havuzOf;

    error TarihKisa();
    error KotuSure();

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
        address _fthmYakici,
        address _sahipAlici,
        address _pazarlamaAlici,
        address _yonetici
    ) {
        if (address(_poolManager) == address(0)) revert KotuKurulum();
        if (address(_launchpad) == address(0)) revert KotuKurulum();
        if (_quote == address(0)) revert KotuKurulum();
        if (_gelistiriciFonu == address(0)) revert KotuKurulum();
        if (_likiditeKasasi == address(0)) revert KotuKurulum();
        if (_fthmYakici == address(0)) revert KotuKurulum();
        if (_sahipAlici == address(0) || _pazarlamaAlici == address(0) || _yonetici == address(0)) revert KotuKurulum();
        poolManager = _poolManager;
        launchpad = _launchpad;
        quote = _quote;
        gelistiriciFonu = _gelistiriciFonu;
        likiditeKasasi = _likiditeKasasi;
        fthmYakici = _fthmYakici;
        sahipAlici = _sahipAlici;
        pazarlamaAlici = _pazarlamaAlici;
        yonetici = _yonetici;
        emit SahipAliciDegisti(address(0), _sahipAlici);
        emit PazarlamaAliciDegisti(address(0), _pazarlamaAlici);
        emit YoneticiDegisti(address(0), _yonetici);
    }

    /* ---- the recipients: changeable, never zero (v9) -------------- */

    modifier onlyYonetici() {
        if (msg.sender != yonetici) revert SadeceYonetici();
        _;
    }

    function sahipAliciKur(address yeni) external onlyYonetici {
        if (yeni == address(0)) revert SifirAdres();
        emit SahipAliciDegisti(sahipAlici, yeni);
        sahipAlici = yeni;
    }

    function pazarlamaAliciKur(address yeni) external onlyYonetici {
        if (yeni == address(0)) revert SifirAdres();
        emit PazarlamaAliciDegisti(pazarlamaAlici, yeni);
        pazarlamaAlici = yeni;
    }

    /// One step, so a governor can take the role with a single proposal.
    function yoneticiDevret(address yeni) external onlyYonetici {
        if (yeni == address(0)) revert SifirAdres();
        emit YoneticiDegisti(yonetici, yeni);
        yonetici = yeni;
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
        /* the oracle (v9): the token's pool, and its first observation at
           the opening price (the pool is initialized before any liquidity) */
        if (birikim[id].zaman == 0) havuzOf[tokenAdr] = id;
        _gozle(id);
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

        /* The oracle, before this swap moves the price: every swap passes
           here, whichever callback charges its fee (v9). */
        _gozle(id);

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
        /* PulseHook5's one 0.20% slice, as two 0.10% halves (v9) */
        uint256 s = (protokol * SAHIP_PPM) / FEE_PPM;
        uint256 p = (protokol * PAZARLAMA_PPM) / FEE_PPM;
        uint256 i = s + p;
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
        if (s > 0 && !IERC20H(quote).transfer(sahipAlici, s)) revert TransferOlmadi();
        if (p > 0 && !IERC20H(quote).transfer(pazarlamaAlici, p)) revert TransferOlmadi();
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

    /* ---- the oracle (v9) ---------------------------------------- */

    /// Write an observation for `token`'s pool now. Anyone; cheap, and a
    /// no-op if one was already written in this block.
    function gozle(address token) external {
        PoolId id = havuzOf[token];
        if (birikim[id].zaman == 0) revert BilinmeyenHavuz();
        _gozle(id);
    }

    /// Bring the accumulator up to now with the pool's current tick, which
    /// is the tick that held since the last update: every block with a swap
    /// updates at its first swap, before the swap moves the price.
    function _gozle(PoolId id) internal {
        Birikim memory b = birikim[id];
        uint32 simdi = uint32(block.timestamp);
        if (b.zaman == simdi) return;
        (, int24 tick,,) = poolManager.getSlot0(id);
        if (b.zaman == 0) {
            gozlemler[id][0] = Gozlem(simdi, 0);
            birikim[id] = Birikim(simdi, 0, 0, 1);
            return;
        }
        unchecked {
            b.tickKum += int56(tick) * int56(uint56(simdi - b.zaman));
        }
        b.zaman = simdi;
        if (simdi - gozlemler[id][b.indeks].zaman >= GOZLEM_ARALIK) {
            b.indeks = uint8((uint256(b.indeks) + 1) % GOZLEM_SAYISI);
            if (b.dolu < GOZLEM_SAYISI) b.dolu++;
            gozlemler[id][b.indeks] = Gozlem(simdi, b.tickKum);
        }
        birikim[id] = b;
    }

    /// The time-weighted average tick of `token`'s pool over at least the
    /// last `saniye` seconds: from the newest snapshot at or before
    /// now - saniye, to now. Reverts when the history is shorter. Rounded
    /// toward negative infinity, as Uniswap v3's OracleLibrary.
    function twapTick(address token, uint32 saniye) public view returns (int24) {
        if (saniye == 0) revert KotuSure();
        PoolId id = havuzOf[token];
        Birikim memory b = birikim[id];
        if (b.zaman == 0) revert BilinmeyenHavuz();
        uint32 simdi = uint32(block.timestamp);
        if (simdi < saniye) revert TarihKisa();
        uint32 hedef = simdi - saniye;
        (, int24 tick,,) = poolManager.getSlot0(id);
        int56 kumSimdi;
        unchecked { kumSimdi = b.tickKum + int56(tick) * int56(uint56(simdi - b.zaman)); }
        for (uint256 n = 0; n < b.dolu; n++) {
            Gozlem memory g = gozlemler[id][(uint256(b.indeks) + GOZLEM_SAYISI - n) % GOZLEM_SAYISI];
            if (g.zaman <= hedef) {
                int56 fark;
                unchecked { fark = kumSimdi - g.tickKum; }
                int56 sure = int56(uint56(simdi - g.zaman));
                int56 ort = fark / sure;
                if (fark < 0 && fark % sure != 0) ort--;
                return int24(ort);
            }
        }
        revert TarihKisa();
    }

    /// The unit twapUsdcPerToken prices: 1e30 raw units of an 18-decimal
    /// token, i.e. 1e12 (one trillion) whole tokens.
    uint128 public constant FIYAT_BIRIMI = 1e30;

    /// The USDC (6 decimals) worth of FIYAT_BIRIMI = 1e30 raw units of
    /// `token` (1e12 whole tokens, NOT one token) at its TWAP over at least
    /// `saniye` seconds. A launch token is worth millionths of a dollar or
    /// less, so the USDC of one whole token would read 0 to 3 units; 1e12
    /// tokens keep about six more significant digits (a token at
    /// $0.0000035 reads 3_500_000_000_000, i.e. $3.5M per 1e12 tokens).
    /// Divide by 1e30 for the price per raw unit. Either currency order: the
    /// quote sorts first only when the token's address is above it.
    function twapUsdcPerToken(address token, uint32 saniye) external view returns (uint256) {
        return _kote(twapTick(token, saniye), FIYAT_BIRIMI, token < quote);
    }

    /// The USDC (6 decimals) worth of `miktar` units of `token` at its TWAP.
    function twapUsdcFor(address token, uint32 saniye, uint128 miktar) external view returns (uint256) {
        return _kote(twapTick(token, saniye), miktar, token < quote);
    }

    /// The units of `token` worth `usdc` (6 decimals) at its TWAP.
    function twapTokenFor(address token, uint32 saniye, uint128 usdc) external view returns (uint256) {
        return _kote(twapTick(token, saniye), usdc, quote < token);
    }

    /// Uniswap v3 OracleLibrary.getQuoteAtTick: what `miktar` of the base
    /// currency is worth in the other one; `tabanSifirinci` when the base
    /// is currency0 (v4 prices are currency1 per currency0).
    function _kote(int24 tick, uint128 miktar, bool tabanSifirinci) internal pure returns (uint256) {
        uint160 r = TickMath.getSqrtPriceAtTick(tick);
        if (r <= type(uint128).max) {
            uint256 x192 = uint256(r) * r;
            return tabanSifirinci ? FullMath.mulDiv(x192, miktar, 1 << 192) : FullMath.mulDiv(1 << 192, miktar, x192);
        }
        uint256 x128 = FullMath.mulDiv(r, r, 1 << 64);
        return tabanSifirinci ? FullMath.mulDiv(x128, miktar, 1 << 128) : FullMath.mulDiv(1 << 128, miktar, x128);
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
