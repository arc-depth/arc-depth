// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";

interface IERC20L {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title AlpLocker
/// @notice Puts the governance token's liquidity share into a Uniswap pool
///         that nobody — including us — can ever take it out of.
///
/// WHAT IT IS FOR
///   ALP's supply is 5% free, 5% vested monthly, 30% liquidity and 60%
///   emitted to stakers over thirty years. Three of those four were
///   already enforced by a contract. The liquidity 30% was not: it sat in
///   a wallet, and "set aside for liquidity" was a sentence rather than a
///   fact anybody could check.
///
///   This makes it a fact. The 300,000,000 goes into a pool whose hook
///   reverts every removal, so from the moment it is placed it can be
///   bought and sold but never withdrawn.
///
/// IT COSTS NO USDC, AND FILLS ITSELF
///   The position is one-sided: all ALP, in a band entirely on the far
///   side of the opening price, which Uniswap v4 accepts without asking
///   for a single unit of the other currency. Measured against the real
///   PoolManager before any of this was written.
///
///   So the pool opens with no USDC in it at all. Every purchase puts USDC
///   in, and that USDC is as locked as the ALP was — it becomes the bid
///   for whoever sells next. The liquidity accumulates by being used, and
///   nobody has to fund it.
///
/// WHY A SEPARATE CONTRACT
///   The launch hook only lets the launchpad add liquidity, and the
///   launchpad only ever creates new tokens. ALP already exists. So it
///   gets its own hook instance pointed at this contract, with the same
///   locking behaviour and the same fee split.
///
/// WHAT IT CANNOT DO
///   There is no withdraw, no sweep, no owner and no upgrade. `kilitle`
///   runs once and can never run again. After it has run, the only
///   function left that changes anything is on Uniswap's side, and the
///   hook refuses the one that matters.
contract AlpLocker is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    IHooks public immutable hook;
    IERC20L public immutable alp;
    address public immutable usdc;

    /// Where the holder slice of every fee goes. ALP holders who have not
    /// moved their balance for the hold period earn it, in USDC.
    address public immutable rewards;

    bool public kilitlendi;
    PoolId public havuzId;

    /// The hook reads these three for every pool it serves.
    mapping(PoolId => address) public rewardsOfPool;
    mapping(PoolId => address) public vaultOfPool;
    mapping(PoolId => address) public tokenOfPool;

    event Kilitlendi(PoolId indexed id, uint256 alpMiktari, uint160 sqrtPriceX96, int24 altTick, int24 ustTick);

    error ZatenKilitli();
    error NotPoolManager();
    error BosMiktar();
    error KotuBant();

    struct Veri {
        PoolKey key;
        uint256 alpMiktari;
        int24 altTick;
        int24 ustTick;
        bool alpSifirinci;
    }

    constructor(IPoolManager _poolManager, IHooks _hook, IERC20L _alp, address _usdc, address _rewards) {
        poolManager = _poolManager;
        hook = _hook;
        alp = _alp;
        usdc = _usdc;
        rewards = _rewards;
    }

    /// Open the pool and place every ALP this contract holds into it.
    ///
    /// Runs once. The ticks and the opening price are computed off chain
    /// and passed in so they can be read and checked before the
    /// transaction is sent, rather than being derived somewhere nobody
    /// looks; what cannot be left to the caller is checked here.
    ///
    /// `alpSifirinci` is not a convenience: which currency is which
    /// follows from address order, and the band has to sit on the side of
    /// the price where the ALP lives. Get it backwards and v4 asks for
    /// USDC instead — which is exactly the money this is supposed not to
    /// need.
    function kilitle(uint160 sqrtPriceX96, int24 altTick, int24 ustTick, uint24 fee, int24 tickSpacing)
        external
        returns (uint256 konan)
    {
        if (kilitlendi) revert ZatenKilitli();
        konan = alp.balanceOf(address(this));
        if (konan == 0) revert BosMiktar();
        if (ustTick <= altTick) revert KotuBant();

        bool alpSifirinci = address(alp) < usdc;
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(alpSifirinci ? address(alp) : usdc),
            currency1: Currency.wrap(alpSifirinci ? usdc : address(alp)),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: hook
        });

        /* The band must be wholly on the ALP side of the price, or the
           position asks for USDC. */
        int24 simdiki = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        if (alpSifirinci) {
            if (altTick <= simdiki) revert KotuBant();   // ALP is currency0: its band is above
        } else {
            if (ustTick >= simdiki) revert KotuBant();   // ALP is currency1: its band is below
        }

        kilitlendi = true;

        poolManager.initialize(key, sqrtPriceX96);
        PoolId id = key.toId();
        havuzId = id;
        tokenOfPool[id] = address(alp);
        rewardsOfPool[id] = rewards;
        /* No vault exists for ALP — there is nothing to redeem against —
           so the slice that would have raised a floor goes to holders
           instead. Sending it somewhere this contract could never spend
           would be burning USDC and calling it a reserve. */
        vaultOfPool[id] = rewards;

        poolManager.unlock(abi.encode(Veri(key, konan, altTick, ustTick, alpSifirinci)));

        emit Kilitlendi(id, konan, sqrtPriceX96, altTick, ustTick);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        Veri memory v = abi.decode(data, (Veri));

        uint160 sa = TickMath.getSqrtPriceAtTick(v.altTick);
        uint160 sb = TickMath.getSqrtPriceAtTick(v.ustTick);

        /* Size from the ALP side: the amount is what this contract holds,
           and the liquidity is whatever that implies. FullMath carries the
           intermediate in 512 bits — the naive product of a token amount
           and two Q96 roots overflowed uint256 in this project once. */
        uint256 l;
        if (v.alpSifirinci) {
            // ALP is currency0, band above the price
            uint256 ara = FullMath.mulDiv(uint256(sa), uint256(sb), FixedPoint96.Q96);
            l = FullMath.mulDiv(v.alpMiktari, ara, uint256(sb - sa));
        } else {
            // ALP is currency1, band below the price
            l = FullMath.mulDiv(v.alpMiktari, FixedPoint96.Q96, uint256(sb - sa));
        }
        if (l > type(uint128).max) l = type(uint128).max;

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            v.key,
            ModifyLiquidityParams({
                tickLower: v.altTick,
                tickUpper: v.ustTick,
                liquidityDelta: int256(l),
                salt: bytes32(0)
            }),
            ""
        );

        _ode(v.key.currency0, delta.amount0());
        _ode(v.key.currency1, delta.amount1());
        return "";
    }

    function _ode(Currency c, int128 d) internal {
        if (d >= 0) return;
        uint256 borc = uint256(uint128(-d));
        poolManager.sync(c);
        if (!IERC20L(Currency.unwrap(c)).transfer(address(poolManager), borc)) revert BosMiktar();
        poolManager.settle();
    }
}
