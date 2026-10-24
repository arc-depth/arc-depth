// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {HavuzAcici, IERC20H} from "./HavuzAcici.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/// @title AciciFabrika — deploys one launch's pool opener.
/// @notice Separated from EgriFabrika on a measurement, not a preference.
///         With an opener's creation code embedded there, the factory came
///         to 24,146 bytes against a 24,576 limit. Four hundred bytes is
///         not a margin. Apart they both have room for the next change.
///
/// WHY HavuzAcici AND NOT TekYonluAcici
///   This said the opposite until a launch was run against the real
///   PoolManager. The one-sided opener cannot hold a bid: its band is
///   [MIN_TICK, price], entirely on the token's side, and `biriktir`
///   clamps the quote's range into that band — where there is no room
///   above the price. The 78 USDC of real liquidity went nowhere and the
///   pool's balance delta came back $0.00.
///
///   A two-sided, full-range, locked position is not an improvement on
///   that. It is the only shape that holds both sides at once, which is
///   what pairing real USDC with tokens means.
///
/// NOT PRIVILEGED
///   Anyone may call `kur`. An opener created outside a launch is inert:
///   it will only act for the `acan` it was given, and holds nothing until
///   somebody sends it both assets.
contract AciciFabrika {
    function kur(
        IPoolManager poolManager,
        IERC20H token,
        IERC20H quote,
        IHooks hook,
        uint24 poolFee,
        int24 tickSpacing,
        address acan
    ) external returns (address acici) {
        return address(new HavuzAcici(poolManager, token, quote, hook, poolFee, tickSpacing, acan));
    }
}
