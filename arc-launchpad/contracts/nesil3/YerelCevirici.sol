// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IERC20C {
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// Uniswap SwapRouter02 (deadline-less), deployed on every chain ARC PULSE runs on.
interface ISwapRouter02C {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

/// @title YerelCevirici — turns a launch's dollar collateral into the token
///        its founder pasted, on the launch's own chain
///
/// The founder pastes a contract address; the page finds where that token
/// trades against the chain's dollar (a Uniswap v3 path or a v4 pool),
/// quotes it, and passes the route and a minimum. This contract executes
/// exactly that route and sends every unit of the output to the recipient
/// the launchpad names — the token's vault.
///
/// It holds nothing between calls, has no owner and no setter. The route is
/// caller-supplied, so it is not trusted: the launchpad measures what the
/// vault actually received and reverts below the founder's minimum. A route
/// through a pool with a hostile hook can at worst make the launch revert;
/// it cannot send the output anywhere but the vault.
///
///   tur 0  Uniswap v3 path (tokenIn | fee | ... | tokenOut) via SwapRouter02
///   tur 1  one Uniswap v4 pool: rota = abi.encode(PoolKey)
contract YerelCevirici is IUnlockCallback {
    ISwapRouter02C public immutable router;
    IPoolManager public immutable poolManager;

    error KotuRota();
    error SadecePoolManager();

    constructor(ISwapRouter02C _router, IPoolManager _poolManager) {
        router = _router;
        poolManager = _poolManager;
    }

    /// The caller has already transferred `miktar` of `girdi` here.
    function cevir(address girdi, address cikti, uint256 miktar, uint8 tur, bytes calldata rota, address alici)
        external
        returns (uint256 cikan)
    {
        uint256 once = IERC20C(cikti).balanceOf(alici);
        if (tur == 0) {
            bytes memory yol = rota;
            if (yol.length < 43 || _ilk(yol) != girdi || _son(yol) != cikti) revert KotuRota();
            IERC20C(girdi).approve(address(router), miktar);
            router.exactInput(ISwapRouter02C.ExactInputParams(yol, alici, miktar, 0));
        } else if (tur == 1) {
            PoolKey memory key = abi.decode(rota, (PoolKey));
            address c0 = Currency.unwrap(key.currency0);
            address c1 = Currency.unwrap(key.currency1);
            if (!((c0 == girdi && c1 == cikti) || (c0 == cikti && c1 == girdi))) revert KotuRota();
            poolManager.unlock(abi.encode(key, c0 == girdi, miktar, alici));
        } else {
            revert KotuRota();
        }
        /* nothing may stay here: leftover input goes to the recipient too */
        uint256 kalan = IERC20C(girdi).balanceOf(address(this));
        if (kalan > 0) IERC20C(girdi).transfer(alici, kalan);
        cikan = IERC20C(cikti).balanceOf(alici) - once;
    }

    function unlockCallback(bytes calldata veri) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert SadecePoolManager();
        (PoolKey memory key, bool z, uint256 miktar, address alici) = abi.decode(veri, (PoolKey, bool, uint256, address));
        BalanceDelta d = poolManager.swap(key,
            SwapParams(z, -int256(miktar), z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
        _kapat(key.currency0, d.amount0(), alici);
        _kapat(key.currency1, d.amount1(), alici);
        return "";
    }

    function _kapat(Currency c, int128 m, address alici) private {
        if (m < 0) {
            poolManager.sync(c);
            IERC20C(Currency.unwrap(c)).transfer(address(poolManager), uint256(uint128(-m)));
            poolManager.settle();
        } else if (m > 0) {
            poolManager.take(c, alici, uint256(uint128(m)));
        }
    }

    function _ilk(bytes memory y) private pure returns (address a) {
        assembly { a := shr(96, mload(add(y, 32))) }
    }

    function _son(bytes memory y) private pure returns (address a) {
        uint256 n = y.length;
        assembly { a := shr(96, mload(add(add(y, 32), sub(n, 20)))) }
    }
}
