// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

interface IERC20D2 {
    function transfer(address to, uint256 v) external returns (bool);
}

/// @title DepthHook — the fee on DEPTH's own pool, paid out as it is taken.
/// @notice 0.50% a trade: 0.15 founder, 0.15 stakers, 0.20 back into depth.
///
/// WHY THIS EXISTS AT ALL
///   Uniswap's own fee goes to the liquidity provider, and the provider
///   here is a position nobody can withdraw from. `HavuzAcici.biriktir()`
///   can turn that into permanent depth but it cannot pay anybody. Routing
///   a slice to the founder and to stakers needs a hook, and the hook is
///   part of the pool key — so it cannot be added after the pool opens. It
///   is now or never, which is why it is here before anything is deployed.
///
/// NO BUCKETS, NO CLAIM
///   The launchpad's hook books fees into accrual buckets that somebody
///   later claims. This one transfers during the swap, to addresses fixed
///   at construction. There is nothing to remember to call and nothing to
///   accumulate unnoticed, and because the addresses are immutable nobody
///   can redirect the money afterwards — the founder included.
///
/// THE TWO DIRECTIONS ARE NOT SYMMETRIC, AND THAT IS DELIBERATE
///   v4 lets a hook adjust only the unspecified side of a swap, which is
///   whatever the trader did not pin down. On a sell that is USDC, so the
///   fee is money and splits three ways. On a buy it is DEPTH, and paying
///   the founder or the stakers in DEPTH would be paying them in something
///   they then have to sell — and the staking contract distributes USDC, so
///   DEPTH sent there would simply be stuck.
///
///   So a buy's fee goes entirely into depth instead: it is handed to the
///   pool opener, and `biriktir()` puts it back in as liquidity. Every buy
///   makes the book permanently deeper; every sell also pays the founder
///   and the stakers. Nothing is dropped in either case.
///
/// LIQUIDITY IS LOCKED, AND NOT ONLY BY THIS
///   Adds are refused from anybody but the pool opener, so no outsider can
///   put liquidity in and then discover they cannot take it out. Removals
///   revert for everyone, always. The opener has no withdraw function
///   either, so this is the second lock rather than the only one.
contract DepthHook {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    /// The only address allowed to add liquidity, and where a buy's fee goes.
    address public immutable havuzAcici;
    address public immutable kurucu;
    address public immutable stakeKasasi;
    /// USDC. Which side of a swap counts as money is decided by this.
    address public immutable quote;

    uint256 public constant FEE_PPM = 5_000;        // 0.50%
    uint256 public constant KURUCU_PPM = 1_500;     // 0.15%
    uint256 public constant STAKE_PPM = 1_500;      // 0.15%
    // the remaining 0.20% is reinvested as depth

    event ParaUcreti(uint256 kurucuya, uint256 stakeye, uint256 derinlige);
    event TokenUcreti(uint256 derinlige);

    error OnlyPoolManager();
    error OnlyAcici();
    error LikiditeKilitli();
    error TransferOlmadi();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        _;
    }

    constructor(
        IPoolManager _poolManager,
        address _havuzAcici,
        address _kurucu,
        address _stakeKasasi,
        address _quote
    ) {
        poolManager = _poolManager;
        havuzAcici = _havuzAcici;
        kurucu = _kurucu;
        stakeKasasi = _stakeKasasi;
        quote = _quote;
    }

    /* ---- locks ------------------------------------------------------ */

    function beforeAddLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        /* Only the opener, so nobody else can add liquidity they would
           then be unable to remove. */
        if (sender != havuzAcici) revert OnlyAcici();
        return IHooks.beforeAddLiquidity.selector;
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        revert LikiditeKilitli();
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
           trader, and only that can carry a fee. */
        if (unspecified <= 0) return (IHooks.afterSwap.selector, 0);

        uint256 out = uint256(uint128(unspecified));
        uint256 toplam = (out * FEE_PPM) / 1_000_000;
        if (toplam == 0) return (IHooks.afterSwap.selector, 0);

        /* Claim it out of the pool before deciding where it goes. `toplam`
           is both what leaves the pool and what v4 is told about; taking
           one without reporting the other would credit somebody with
           tokens the hook never pulled. */
        poolManager.take(feeCurrency, address(this), toplam);
        address para = Currency.unwrap(feeCurrency);

        if (para == quote) {
            /* Money. Split three ways, paid now. The remainder of the
               integer divisions goes to depth rather than being dropped,
               so nothing evaporates. */
            uint256 k = (toplam * KURUCU_PPM) / FEE_PPM;
            uint256 st = (toplam * STAKE_PPM) / FEE_PPM;
            uint256 d = toplam - k - st;
            if (k > 0 && !IERC20D2(para).transfer(kurucu, k)) revert TransferOlmadi();
            if (st > 0 && !IERC20D2(para).transfer(stakeKasasi, st)) revert TransferOlmadi();
            if (d > 0 && !IERC20D2(para).transfer(havuzAcici, d)) revert TransferOlmadi();
            emit ParaUcreti(k, st, d);
        } else {
            /* Tokens. Paying the founder or the stakers in DEPTH would be
               paying them in something they must sell, and the staking
               contract distributes USDC — DEPTH sent there would be stuck.
               So all of it becomes depth. */
            if (!IERC20D2(para).transfer(havuzAcici, toplam)) revert TransferOlmadi();
            emit TokenUcreti(toplam);
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
