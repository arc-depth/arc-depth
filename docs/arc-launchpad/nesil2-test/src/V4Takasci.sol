// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IERC20T {
    function transferFrom(address, address, uint256) external returns (bool);
}

/// A plain v4 swapper: exact input, settles what it owes, takes what it is owed.
contract V4Takasci is IUnlockCallback {
    IPoolManager public immutable pm;
    constructor(IPoolManager _pm) { pm = _pm; }

    function takas(PoolKey memory key, bool zeroForOne, uint256 girdi) external returns (BalanceDelta d) {
        d = abi.decode(pm.unlock(abi.encode(msg.sender, key, zeroForOne, girdi)), (BalanceDelta));
    }

    function unlockCallback(bytes calldata veri) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        (address kim, PoolKey memory key, bool z, uint256 girdi) = abi.decode(veri, (address, PoolKey, bool, uint256));
        BalanceDelta d = pm.swap(key, SwapParams(z, -int256(girdi), z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
        _kapat(key.currency0, d.amount0(), kim);
        _kapat(key.currency1, d.amount1(), kim);
        return abi.encode(d);
    }

    function _kapat(Currency c, int128 m, address kim) private {
        if (m < 0) {
            pm.sync(c);
            IERC20T(Currency.unwrap(c)).transferFrom(kim, address(pm), uint256(uint128(-m)));
            pm.settle();
        } else if (m > 0) {
            pm.take(c, kim, uint256(uint128(m)));
        }
    }
}

