// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

interface IERC20E {
    function transfer(address to, uint256 v) external returns (bool);
}

/// What the hook has to be told about a pool, by the launchpad that made it.
/// Circulating supply, for sizing a trade against the token rather than
/// against the pool. Pool depth is what an attacker can change in one
/// block by adding liquidity; circulating supply is not.
interface IDolasim {
    function dolasim() external view returns (uint256);
}

interface IEgriKayit {
    function havuzKaydi(PoolId id)
        external
        view
        returns (
            address token,
            address acici,
            address kurucu,
            address rewards,
            address kasa,
            uint256 vergiPpm
        );
}

/// @title EgriHook — the fee on every launch's pool, paid out as it is taken.
/// @notice 2.00% a trade on the money side, split six ways and transferred
///         during the swap. On the token side, all of it becomes depth.
///
/// WHY NEITHER EXISTING HOOK WOULD DO
///   `ArcLaunchHook` refuses liquidity from anybody but the one address it
///   was constructed with. The ladder is a different contract for every
///   launch, so every launch would have reverted while opening — that is
///   not a fee problem, it is the market failing to exist. It also reads
///   `vaultOfPool` from its launchpad, which the curve launchpad has no
///   vault to answer with.
///
///   `DepthHook` is the right shape — it transfers during the swap, with no
///   bucket for anyone to claim from later — but its founder, its staking
///   contract and its opener are immutables, because DEPTH is one token. A
///   launchpad has a different founder, rewards contract and ladder for
///   every launch, so those three have to come from the registry, per pool.
///
/// WHY THE TOKEN SIDE IS NOT SPLIT
///   Taken straight from DepthHook, because the reasoning is the same and
///   it is easy to get wrong: paying the creator or the holders in the
///   launch token pays them in something they then have to sell, and the
///   rewards contract distributes the quote asset — launch tokens sent
///   there would simply be stuck. So a token-side fee goes entirely into
///   depth. Every buy makes the book permanently deeper; every sell also
///   pays the creator, the holders and the protocol. Nothing is dropped in
///   either case.
///
/// LIQUIDITY IS LOCKED, AND NOT ONLY BY THIS
///   Adds are refused from anybody but that pool's own ladder, so no
///   outsider can put liquidity in and then discover they cannot take it
///   out. Removals revert for everyone, always. The ladder has no withdraw
///   function either, so this is the second lock rather than the only one.
///
/// ONE HOOK FOR EVERY LAUNCH
///   A hook is part of the pool key, so it cannot be added or changed after
///   a pool opens, and its address has to carry v4's permission bits — which
///   means mining a salt. Neither is something a launch transaction can do,
///   so this is deployed once and shared, and everything launch-specific is
///   looked up rather than baked in.
contract EgriHook {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    /// The launchpad, used as the registry. Pools it does not know are not
    /// served: an unknown pool has no ladder to pay and no creator to pay.
    IEgriKayit public immutable launchpad;
    /// USDC. Which side of a swap counts as money is decided by this.
    address public immutable quote;

    /* The three launchpad-wide destinations. These are the same for every
       launch, so unlike the creator and the rewards contract they can be
       immutable here — and immutable is the stronger answer, because it
       means no registry lookup stands between a fee and where it goes. */
    address public immutable gelistiriciFonu;
    address public immutable likiditeKasasi;
    address public immutable isletmeKasasi;

    /* THE FEE, IN FULL — 2.00%, and the same table EgriLaunchpad publishes.
     * Constants rather than reads, so a swap never depends on a lookup for
     * its arithmetic; scripts/egri-ucret-denetimi.js pins the two together
     * so they cannot drift apart.
     *
     *   0.30%  token's creator
     *   0.30%  holder rewards
     *   0.40%  depth                     back into the pool
     *   0.30%  developer fund
     *   0.50%  protocol liquidity
     *   0.20%  operations
     *
     * PLUS the launch's own collateral tax, 1% to 5%, chosen by its creator
     * and read from the registry rather than fixed here — it differs per
     * launch, so it cannot be a constant. It is the only slice that stays
     * with the token instead of reaching the protocol, and the trader pays
     * both together in one charge.
     */
    uint256 public constant FEE_PPM = 20_000;          // 2.00%
    uint256 public constant KURUCU_PPM = 3_000;
    uint256 public constant STAKE_PPM = 3_000;
    uint256 public constant GELISTIRICI_PPM = 3_000;
    uint256 public constant LIKIDITE_PPM = 5_000;
    uint256 public constant ISLETME_PPM = 2_000;
    // the remaining 4_000 (0.40%) is reinvested as depth

    /* ---- whale shield ----------------------------------------------
     *
     * Size is measured in ppm of CIRCULATING supply, accumulated per
     * pool per block. Below the threshold the shield is invisible; above
     * it, the extra rate equals the excess, capped.
     *
     *     0.5% of circulating in a block  ->  no extra
     *     1.0%                            ->  0.5% extra
     *     2.0%                            ->  1.5% extra
     *     3.5% and beyond                 ->  3.0% extra (the cap)
     *
     * The cap exists so the shield can never confiscate: the worst total
     * a trade can pay is 2% protocol + 5% maximum collateral tax + 3%
     * shield = 10%, which is steep and is still a market rather than a
     * trap. Without a cap a large enough trade would face a fee near
     * 100%, which is not a deterrent but a seizure.
     */
    uint256 public constant KALKAN_ESIK_PPM = 5_000;     // 0.50% of circulating
    uint256 public constant KALKAN_TAVAN_PPM = 30_000;   // 3.00% extra, at most

    /// Block number and that block's accumulated size, packed into one
    /// slot: the shield writes on every swap and two slots would double
    /// the cost of trading to save nothing.
    struct Pencere {
        uint64 blok;
        uint192 ppm;
    }
    mapping(PoolId => Pencere) public pencere;

    event ParaUcreti(
        PoolId indexed id,
        uint256 kurucuya,
        uint256 stakeye,
        uint256 gelistiriciye,
        uint256 likiditeye,
        uint256 isletmeye,
        uint256 kasaya,
        uint256 derinlige,
        uint256 kalkana
    );
    event TokenUcreti(PoolId indexed id, uint256 derinlige);
    /// Emitted whenever the shield charged anything, with the figure that
    /// triggered it. A shield nobody can see firing is a shield nobody
    /// can check.
    event KalkanCalisti(
        PoolId indexed id,
        uint256 blokPpm,        // cumulative size this block, ppm of circulating
        uint256 ekPpm,          // the extra rate applied
        uint256 miktar          // and what that came to
    );

    error OnlyPoolManager();
    error OnlyAcici();
    error LikiditeKilitli();
    error TransferOlmadi();
    error BilinmeyenHavuz();
    error KotuKurulum();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        _;
    }

    constructor(
        IPoolManager _poolManager,
        IEgriKayit _launchpad,
        address _quote,
        address _gelistiriciFonu,
        address _likiditeKasasi,
        address _isletmeKasasi
    ) {
        if (address(_poolManager) == address(0) || address(_launchpad) == address(0)) revert KotuKurulum();
        if (_quote == address(0)) revert KotuKurulum();
        if (_gelistiriciFonu == address(0) || _likiditeKasasi == address(0)) revert KotuKurulum();
        if (_isletmeKasasi == address(0)) revert KotuKurulum();
        poolManager = _poolManager;
        launchpad = _launchpad;
        quote = _quote;
        gelistiriciFonu = _gelistiriciFonu;
        likiditeKasasi = _likiditeKasasi;
        isletmeKasasi = _isletmeKasasi;
    }

    /* ---- locks ------------------------------------------------------ */

    function beforeAddLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        /* Only that pool's own ladder, so nobody else can add liquidity
           they would then be unable to remove. */
        (, address acici,,,,) = launchpad.havuzKaydi(key.toId());
        if (acici == address(0)) revert BilinmeyenHavuz();
        if (sender != acici) revert OnlyAcici();
        return IHooks.beforeAddLiquidity.selector;
    }

    /// Removals revert. A zero delta is not a removal and is allowed.
    ///
    /// WHY THE EXCEPTION IS NECESSARY AND WHY IT IS SAFE
    ///   v4 routes `modifyLiquidity` to this hook whenever the delta is not
    ///   positive — so delta == 0 arrives here too. And a zero delta is how
    ///   a position realises the fees it has accrued: the ladder's
    ///   `biriktir` does exactly that before re-adding them as more locked
    ///   liquidity.
    ///
    ///   Rejecting zero therefore did not lock liquidity harder, it broke
    ///   the one function that makes the pool deeper. Found by running a
    ///   launch against the real PoolManager: it reverted with
    ///   WrappedError(hook, beforeRemoveLiquidity, <empty>) on its own last
    ///   step, and no amount of reading the code would have shown it.
    ///
    ///   Allowing it cannot withdraw anything. A zero delta leaves the
    ///   position's liquidity untouched by definition, and the fees it
    ///   realises belong to the caller's OWN position — v4 keys positions by
    ///   (owner, lower, upper, salt), so a stranger calling this collects
    ///   from a position they do not have, which is nothing.
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

    /* ---- the whale shield ------------------------------------------- */

    /// The extra rate this trade owes, and the running total it joins.
    ///
    /// `tokenMiktari` is the size of a SALE, in launch tokens. Purchases
    /// pass zero and are never charged: a purchase raises the price and
    /// adds quote to the pool, so it does not threaten the floor, and
    /// charging it hit the buyback robot — the floor's own defence —
    /// at the cap while sending the money to depth instead of the floor.
    ///
    /// Measured against circulating supply, not pool depth. Depth is
    /// something an attacker can inflate in the same block by adding
    /// liquidity, and a shield keyed to it would be switched off by the
    /// very size it exists to catch.
    function _kalkan(PoolId id, address kasa, uint256 tokenMiktari)
        internal
        returns (uint256 ekPpm, uint256 blokPpm)
    {
        if (kasa == address(0) || tokenMiktari == 0) return (0, 0);

        /* Circulating supply through a bounded staticcall. The vault is
           this project's own contract and its dolasim() cannot revert,
           but afterSwap reverting means the pool cannot trade at all —
           so a failure here has to mean NO SHIELD, never a dead market.
           Being lenient on an impossible error is cheaper than being
           strict on one that would halt every trade. */
        (bool ok, bytes memory ret) = kasa.staticcall(
            abi.encodeWithSelector(IDolasim.dolasim.selector)
        );
        if (!ok || ret.length < 32) return (0, 0);
        uint256 dolasim = abi.decode(ret, (uint256));
        if (dolasim == 0) return (0, 0);

        /* ppm of circulating. Multiplied first: a trade smaller than a
           millionth of supply must round to zero, not to a division that
           truncated before it meant anything. */
        uint256 pay = (tokenMiktari * 1_000_000) / dolasim;

        Pencere memory w = pencere[id];
        uint256 onceki = w.blok == uint64(block.number) ? uint256(w.ppm) : 0;
        blokPpm = onceki + pay;
        /* uint192 holds 6.3e57; ppm of a supply cannot approach it, and
           clamping rather than reverting keeps the promise that this
           function cannot stop a trade. */
        if (blokPpm > type(uint192).max) blokPpm = type(uint192).max;
        pencere[id] = Pencere({blok: uint64(block.number), ppm: uint192(blokPpm)});

        if (blokPpm <= KALKAN_ESIK_PPM) return (0, blokPpm);
        ekPpm = blokPpm - KALKAN_ESIK_PPM;
        if (ekPpm > KALKAN_TAVAN_PPM) ekPpm = KALKAN_TAVAN_PPM;
    }

    /// How many launch tokens this swap SOLD into the pool, or zero if it
    /// was a purchase.
    ///
    /// `delta` is the swapper's, so a negative token side means the
    /// swapper handed tokens over — a sale. Read from the delta rather
    /// than from params because an exact-output swap never states its
    /// input, and the token can be currency0 or currency1 depending on
    /// how the two addresses happened to sort.
    function _satisBoyu(PoolKey calldata key, BalanceDelta delta, address token)
        internal
        pure
        returns (uint256)
    {
        int128 d = Currency.unwrap(key.currency0) == token ? delta.amount0() : delta.amount1();
        if (d >= 0) return 0;                  // a purchase, or nothing moved
        return uint256(uint128(-d));
    }

    /* ---- the fee ---------------------------------------------------- */

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        /* The unspecified side is the one the trader did not fix, and the
           only side v4 lets a hook adjust without rewriting the trade. */
        bool exactInput = params.amountSpecified < 0;
        (Currency feeCurrency, int128 unspecified) = exactInput
            ? (params.zeroForOne ? key.currency1 : key.currency0,
               params.zeroForOne ? delta.amount1() : delta.amount0())
            : (params.zeroForOne ? key.currency0 : key.currency1,
               params.zeroForOne ? delta.amount0() : delta.amount1());

        /* Only a positive delta is value leaving the pool towards the
           trader, and only that can carry a fee.

           Exact-output swaps therefore pay nothing here, which is a
           deliberate difference from ArcLaunchHook: that hook charges them
           by minting a 6909 claim, because its fee accrues into a bucket
           that is swept later. This one pays out during the swap, so it
           needs a real balance it can transfer, and a claim is not one.
           Charging the input side instead would take money the trader
           already committed and change the price they were quoted. */
        if (unspecified <= 0) return (IHooks.afterSwap.selector, 0);

        uint256 out = uint256(uint128(unspecified));

        /* The registry is read BEFORE the fee is sized, because the tax
           rate is part of the size. It used to be read afterwards, which
           compiled right up until the tax was added and then referred to a
           variable that did not exist yet. */
        PoolId id = key.toId();
        (address tokenAdr, address acici, address kurucu, address rewards, address kasa, uint256 vergiPpm) =
            launchpad.havuzKaydi(id);
        if (acici == address(0)) revert BilinmeyenHavuz();

        /* The protocol's 2% and this launch's collateral tax, sized
           SEPARATELY and then added. They are shares of different
           quantities: the five protocol slices below are fractions of
           FEE_PPM, while the tax is a fraction of the trade. The trader
           still pays once — `toplam` is the single amount taken.

           Sizing the slices against the combined figure instead made
           them claim 80% of protocol+tax rather than 80% of the
           protocol's own 2%, so `toplam - slices - tax` underflowed and
           EVERY sell reverted with Panic(0x11). Not an edge case: the
           slices took 0.8 of toplam and the tax took
           vergi/(20_000+vergi), which exceeds 1 for any vergi above
           5_000 — and the launchpad's minimum is 10_000. No permitted
           tax rate could have worked.

           It survived because no test had ever put a swap through this
           hook. The launch test opens a pool and stops; the fee audit
           pins the TABLE, not the arithmetic. The first real sale found
           it immediately. */
        uint256 protokol = (out * FEE_PPM) / 1_000_000;
        /* The tax, sized off the trade and not off the protocol's fee.
           It is the only slice whose size the creator picked, and the
           only one that stays with the token rather than reaching the
           protocol. */
        uint256 v = (out * vergiPpm) / 1_000_000;

        /* And the whale shield, which is a third rate on the same output
           and is sized before anything leaves the pool because what it
           charges is part of the single amount taken. */
        (uint256 ekPpm, uint256 blokPpm) = _kalkan(id, kasa, _satisBoyu(key, delta, tokenAdr));
        uint256 kalkan = (out * ekPpm) / 1_000_000;

        uint256 toplam = protokol + v + kalkan;
        if (toplam == 0) return (IHooks.afterSwap.selector, 0);
        if (kalkan > 0) emit KalkanCalisti(id, blokPpm, ekPpm, kalkan);

        /* Claim it out of the pool before deciding where it goes. `toplam`
           is both what leaves the pool and what v4 is told about; taking
           one without reporting the other would credit somebody with
           tokens the hook never pulled. */
        poolManager.take(feeCurrency, address(this), toplam);
        address para = Currency.unwrap(feeCurrency);

        if (para == quote) {
            /* Money. Split six ways, paid now. The remainder of the integer
               divisions goes to depth rather than being dropped, so nothing
               evaporates and the dust ends up somewhere nobody can take it
               out of. */
            uint256 k = (protokol * KURUCU_PPM) / FEE_PPM;
            uint256 st = (protokol * STAKE_PPM) / FEE_PPM;
            uint256 g = (protokol * GELISTIRICI_PPM) / FEE_PPM;
            uint256 l = (protokol * LIKIDITE_PPM) / FEE_PPM;
            uint256 i = (protokol * ISLETME_PPM) / FEE_PPM;
            /* What the five named slices did not claim — 4_000 of 20_000,
               so 0.40% of the trade — plus the dust from five integer
               divisions. Depth, because dust that goes nowhere evaporates
               and dust that goes to a wallet is a wallet collecting it.
               Subtracted from the PROTOCOL's share only: the tax is not
               the protocol's to distribute. */
            uint256 d = protokol - k - st - g - l - i;
            /* The shield's share rides with the vault's. A sale is what
               pushes the floor down, so the money a large sale pays goes
               to the floor — not to the protocol, which is why no slice
               of it is split off anywhere else.

               This branch is the ONLY one a shield charge can reach. A
               fee is charged only on an exact-input swap, so the fee
               currency is always the output; the shield fires only on a
               sale, whose output is the quote. The token-side branch
               below therefore never carries one. */
            v += kalkan;
            if (k > 0 && !IERC20E(para).transfer(kurucu, k)) revert TransferOlmadi();
            if (st > 0 && !IERC20E(para).transfer(rewards, st)) revert TransferOlmadi();
            if (g > 0 && !IERC20E(para).transfer(gelistiriciFonu, g)) revert TransferOlmadi();
            if (l > 0 && !IERC20E(para).transfer(likiditeKasasi, l)) revert TransferOlmadi();
            if (i > 0 && !IERC20E(para).transfer(isletmeKasasi, i)) revert TransferOlmadi();
            /* The tax, straight to this launch's vault. It arrives as the
               quote asset and stays there until a conversion moves it —
               there is no separate collector, because a second contract
               holding the same money is a second place it can be stuck. */
            if (v > 0 && !IERC20E(para).transfer(kasa, v)) revert TransferOlmadi();
            if (d > 0 && !IERC20E(para).transfer(acici, d)) revert TransferOlmadi();
            emit ParaUcreti(id, k, st, g, l, i, v, d, kalkan);
        } else {
            /* Tokens. Paying the creator or the holders in the launch token
               would be paying them in something they must sell, and the
               rewards contract distributes the quote asset — launch tokens
               sent there would be stuck. So all of it becomes depth. */
            if (!IERC20E(para).transfer(acici, toplam)) revert TransferOlmadi();
            emit TokenUcreti(id, toplam);
        }

        return (IHooks.afterSwap.selector, int128(uint128(toplam)));
    }

    /* ---- the permissions v4 asks about ------------------------------ */

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        return IHooks.beforeInitialize.selector;
    }
    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        return IHooks.afterInitialize.selector;
    }
    function afterAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata,
                               BalanceDelta, BalanceDelta, bytes calldata)
        external pure returns (bytes4, BalanceDelta)
    {
        return (IHooks.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }
    function afterRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata,
                                  BalanceDelta, BalanceDelta, bytes calldata)
        external pure returns (bytes4, BalanceDelta)
    {
        return (IHooks.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }
    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external pure returns (bytes4, BeforeSwapDelta, uint24)
    {
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }
    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external pure returns (bytes4)
    {
        return IHooks.beforeDonate.selector;
    }
    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external pure returns (bytes4)
    {
        return IHooks.afterDonate.selector;
    }
}
