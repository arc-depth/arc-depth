// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IERC20S {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title SwapRouter
/// @notice The smallest thing that can trade a v4 pool from a wallet.
///
/// WHY THIS HAD TO BE WRITTEN
///   Uniswap's own Universal Router is not deployed on Arc — checked at two
///   addresses, neither has code. v4 pools cannot be traded directly either:
///   every operation happens inside a PoolManager.unlock callback, which an
///   externally-owned account cannot provide. Without a router there is no
///   way to buy or sell any of these tokens from a browser, which would
///   make the whole launchpad look finished and be unusable.
///
/// WHAT IT HOLDS
///   Nothing. Funds move caller -> pool and pool -> caller inside one
///   transaction, and the contract's balance is zero before and after. There
///   is no owner, no pause and no sweep, so there is nothing to steal and
///   nobody to steal it: tokens left here by mistake are unrecoverable,
///   which is the honest consequence of having no privileged function.
///
/// SLIPPAGE IS THE CALLER'S
///   `minOut` is enforced here and reverts the whole transaction if the pool
///   returns less. A router that silently accepts any price is how people
///   lose money to a pool that moved between quote and execution.
contract SwapRouter is IUnlockCallback {
    IPoolManager public immutable poolManager;

    error NotPoolManager();
    error TooLittleReceived(uint256 got, uint256 wanted);
    error TransferFailed();
    error NotEnoughValue(uint256 have, uint256 need);

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }

    struct Veri {
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        uint256 minOut;
        address payer;
    }

    /// Exact-input swap. The caller must have approved `amountIn` of the
    /// input currency to this contract — or, when the input is the chain's
    /// native currency, sent it as value.
    ///
    /// NATIVE INPUT IS NOT AN EXTRA
    ///   On Robinhood Chain every Stock Token pool is paired against native
    ///   ether, with currency0 as the zero address. A router that can only
    ///   pull an ERC20 cannot trade any of them, which would leave the
    ///   product unable to buy the very thing it exists to buy. v4 settles
    ///   a native debt by sending value with `settle` instead of syncing
    ///   and transferring, so that is the only difference.
    function swap(PoolKey calldata key, bool zeroForOne, uint256 amountIn, uint256 minOut)
        external
        payable
        returns (uint256 out)
    {
        bytes memory res = poolManager.unlock(
            abi.encode(Veri(key, zeroForOne, amountIn, minOut, msg.sender))
        );
        out = abi.decode(res, (uint256));
    }

    /// The PoolManager refunds native currency here when a swap consumes
    /// less than was sent.
    receive() external payable {}

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        Veri memory v = abi.decode(data, (Veri));

        BalanceDelta delta = poolManager.swap(
            v.key,
            SwapParams({
                zeroForOne: v.zeroForOne,
                amountSpecified: -int256(v.amountIn),
                sqrtPriceLimitX96: v.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        Currency inC = v.zeroForOne ? v.key.currency0 : v.key.currency1;
        Currency outC = v.zeroForOne ? v.key.currency1 : v.key.currency0;
        int128 inD = v.zeroForOne ? delta.amount0() : delta.amount1();
        int128 outD = v.zeroForOne ? delta.amount1() : delta.amount0();

        // Pay what the pool is owed, straight from the caller.
        if (inD < 0) {
            uint256 owed = uint256(uint128(-inD));
            if (Currency.unwrap(inC) == address(0)) {
                // Native: the debt is cleared by the value sent, not by a
                // transfer. sync() is for tokens and would measure nothing.
                if (address(this).balance < owed) revert NotEnoughValue(address(this).balance, owed);
                poolManager.settle{value: owed}();
            } else {
                poolManager.sync(inC);
                if (!IERC20S(Currency.unwrap(inC)).transferFrom(v.payer, address(poolManager), owed)) {
                    revert TransferFailed();
                }
                poolManager.settle();
            }
        }

        uint256 out = outD > 0 ? uint256(uint128(outD)) : 0;
        if (out < v.minOut) revert TooLittleReceived(out, v.minOut);
        if (out > 0) poolManager.take(outC, v.payer, out);

        // Native change goes back. A router that keeps dust is a router
        // that collects it, and this one is supposed to hold nothing.
        uint256 artik = address(this).balance;
        if (artik > 0) {
            (bool ok,) = v.payer.call{value: artik}("");
            if (!ok) revert TransferFailed();
        }

        return abi.encode(out);
    }
}
