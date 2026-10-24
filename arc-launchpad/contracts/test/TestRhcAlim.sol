// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapRouter} from "../SwapRouter.sol";

interface IERC20R {
    function balanceOf(address who) external view returns (uint256);
    function symbol() external view returns (string memory);
}

/// @notice The buy leg, run against the real Robinhood Chain PoolManager.
///
/// WHY THE ROUTER IS BUILT HERE RATHER THAN PLACED
///   The first attempt put SwapRouter's deployedBytecode at an address with
///   a state override and every pool reverted. The reason is not the pools:
///   solc leaves immutables unset in `deployedBytecode`, because they are
///   written during construction. A router placed that way has a
///   poolManager of address(0) and cannot do anything at all.
///
///   Constructing it with `new` inside the call sets the immutable the
///   normal way, which is what every other test in this project does and
///   why none of them hit this.
///
/// WHAT A RESULT MEANS
///   A number here is what our own deployed router would get out of that
///   pool for that much ether, right now, including whatever hook the pool
///   carries. A revert means that pool cannot serve us, whatever its
///   advertised price says.
contract TestRhcAlim {
    /// Needed twice over: the router returns unspent native currency to its
    /// caller, and a pool can refund the difference on a partial fill.
    receive() external payable {}

    function al(
        IPoolManager pm,
        address hisse,
        uint24 fee,
        int24 spacing,
        uint256 miktar
    ) external payable returns (uint256 cikti, uint256 bakiye, uint256 kalanEth) {
        SwapRouter r = new SwapRouter(pm);

        /* Native currency is the zero address and sorts below every stock
         * token, so it is currency0 and the swap is zeroForOne. */
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(hisse),
            fee: fee,
            tickSpacing: spacing,
            hooks: IHooks(address(0))
        });

        cikti = r.swap{value: miktar}(key, true, miktar, 0);
        bakiye = IERC20R(hisse).balanceOf(address(this));
        kalanEth = address(this).balance;
    }
}
