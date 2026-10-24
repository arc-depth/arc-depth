// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IERC20O {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}
interface ILaunchpad2O {
    function launch(string calldata, string calldata, uint32, address, uint256, uint256, uint256) external returns (address, address);
    function havuzAnahtari(address) external view returns (PoolKey memory);
}
interface IKasa2O {
    function iade(uint256) external returns (uint256, uint256);
}

/// Placed by state override at an address that holds native USDC on Arc,
/// and run with one eth_call against Arc's own node: the deployed
/// PulseLaunchpad2's launch, a buy and a sell in the real v4 pool, and a
/// redemption. Forge cannot fork Arc (its native USDC moves balances through
/// a precompile revm lacks); Arc's node has the precompile. Nothing is sent.
contract ArcOlcer is IUnlockCallback {
    struct Sonuc {
        address token;
        address kasa;
        uint256 kurucuToken;
        uint256 alinan;
        uint256 satistan;
        uint256 itfa;
    }

    function olc(ILaunchpad2O lp, IPoolManager pm, address q) external returns (Sonuc memory s) {
        IERC20O(q).approve(address(lp), type(uint256).max);
        (s.token, s.kasa) = lp.launch("Arc Olcum", "AO", 0, q, 20_000, 200e6, 100e6);
        s.kurucuToken = IERC20O(s.token).balanceOf(address(this));
        PoolKey memory key = lp.havuzAnahtari(s.token);
        bool quoteSifir = Currency.unwrap(key.currency0) == q;

        /* the same block as the launch: the snipe tax is at its peak, which
           only makes the trade expensive; what is measured is that it
           does not revert */
        uint256 t0 = IERC20O(s.token).balanceOf(address(this));
        pm.unlock(abi.encode(key, quoteSifir, uint256(50e6)));
        s.alinan = IERC20O(s.token).balanceOf(address(this)) - t0;

        uint256 q0 = IERC20O(q).balanceOf(address(this));
        pm.unlock(abi.encode(key, !quoteSifir, s.alinan));
        s.satistan = IERC20O(q).balanceOf(address(this)) - q0;

        IERC20O(s.token).approve(s.kasa, type(uint256).max);
        uint256 q1 = IERC20O(q).balanceOf(address(this));
        IKasa2O(s.kasa).iade(s.kurucuToken / 10);
        s.itfa = IERC20O(q).balanceOf(address(this)) - q1;
    }

    function unlockCallback(bytes calldata veri) external returns (bytes memory) {
        IPoolManager pm = IPoolManager(msg.sender);
        (PoolKey memory key, bool z, uint256 girdi) = abi.decode(veri, (PoolKey, bool, uint256));
        BalanceDelta d = pm.swap(key, SwapParams(z, -int256(girdi), z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
        _kapat(pm, key.currency0, d.amount0());
        _kapat(pm, key.currency1, d.amount1());
        return "";
    }

    function _kapat(IPoolManager pm, Currency c, int128 m) private {
        if (m < 0) {
            pm.sync(c);
            IERC20O(Currency.unwrap(c)).transfer(address(pm), uint256(uint128(-m)));
            pm.settle();
        } else if (m > 0) {
            pm.take(c, address(this), uint256(uint128(m)));
        }
    }
}
