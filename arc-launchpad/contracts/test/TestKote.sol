// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IERC20Q {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @notice Quote a real swap against a real, already-deployed pool.
///
/// WHY THIS IS NEEDED AFTER EVERYTHING ELSE
///   The Fathom pool opened exactly as planned, and then reading it back
///   showed ACTIVE LIQUIDITY ZERO. That is not a mistake in the ladder: a
///   v4 position is live over [lower, upper) and a token-only rung has to
///   sit at or below the price, so at the opening tick it is by definition
///   not yet active. The first buy crosses into it.
///
///   But "by definition" is the kind of sentence that precedes a broken
///   pool. Routers and price sites that read slot0 liquidity will see
///   zero, and whether a wallet can actually fill against this pool is a
///   question about the real contracts, not about my reasoning. So this
///   runs the swap against the deployed pool through eth_call, paying with
///   a balance the caller really has, and reports what came back.
///
///   It is placed at an address that already holds the quote asset by
///   state override, so no balance is invented and no transaction is sent.
contract TestKote is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    struct Sonuc {
        uint160 sqrtOnce;
        int24 tickOnce;
        uint128 likiditeOnce;
        uint256 odenen;
        uint256 alinan;
        uint160 sqrtSonra;
        int24 tickSonra;
        uint128 likiditeSonra;
        uint256 havuzdakiPara;      // quote the pool holds after the buy
    }

    IPoolManager pm;
    PoolKey key;
    Sonuc s;

    function kote(
        IPoolManager _pm,
        address quote,
        address token,
        uint24 fee,
        int24 spacing,
        address hook,
        uint256 tutar
    ) external returns (Sonuc memory) {
        pm = _pm;
        bool tokenSifirinci = token < quote;
        key = PoolKey({
            currency0: Currency.wrap(tokenSifirinci ? token : quote),
            currency1: Currency.wrap(tokenSifirinci ? quote : token),
            fee: fee,
            tickSpacing: spacing,
            hooks: IHooks(hook)
        });

        (s.sqrtOnce, s.tickOnce, s.likiditeOnce) = _durum();
        pm.unlock(abi.encode(tutar, tokenSifirinci, quote, token));
        (s.sqrtSonra, s.tickSonra, s.likiditeSonra) = _durum();
        s.havuzdakiPara = IERC20Q(quote).balanceOf(address(_pm));
        return s;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (uint256 tutar, bool tokenSifirinci, address quote, address token) =
            abi.decode(data, (uint256, bool, address, address));

        /* Buying the token means paying the quote in. Which direction that
           is depends on the address ordering, and getting it backwards
           would quote a sell and look like a broken pool. */
        bool zeroForOne = !tokenSifirinci;
        BalanceDelta d = pm.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(tutar),
                sqrtPriceLimitX96: zeroForOne
                    ? TickMath.MIN_SQRT_PRICE + 1
                    : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        (Currency cIn, Currency cOut) = zeroForOne
            ? (key.currency0, key.currency1)
            : (key.currency1, key.currency0);
        int128 dIn = zeroForOne ? d.amount0() : d.amount1();
        int128 dOut = zeroForOne ? d.amount1() : d.amount0();

        s.odenen = uint256(uint128(-dIn));
        s.alinan = uint256(uint128(dOut));

        pm.sync(cIn);
        IERC20Q(quote).transfer(address(pm), s.odenen);
        pm.settle();
        if (s.alinan > 0) pm.take(cOut, address(this), s.alinan);
        token;   // silence unused
        return "";
    }

    function _durum() internal view returns (uint160, int24, uint128) {
        bytes32 slot = keccak256(abi.encode(PoolId.unwrap(key.toId()), uint256(6)));
        bytes32 raw = pm.extsload(slot);
        bytes32 likSlot = bytes32(uint256(slot) + 3);
        uint128 lik = uint128(uint256(pm.extsload(likSlot)));
        return (uint160(uint256(raw)), int24(uint24(uint256(raw) >> 160)), lik);
    }
}
