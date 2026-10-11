// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LaunchToken} from "./LaunchToken.sol";
import {PulseAcici, IERC20P} from "./PulseAcici.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

interface IERC20F {
    function transfer(address to, uint256 v) external returns (bool);
}

/// @title PulseFabrika — a launch's token and its pool opener
///
/// WHY A SEPARATE FACTORY
///   If the launchpad had to carry the creation code for both of these it
///   would reach 94% of EIP-170: launchpad 10,327 bytes, token 2,853,
///   opener 10,008. This project hit that limit once, and a combined
///   factory measured 23,007 bytes. The split is not a preference but a
///   measured necessity.
///
/// HOW IT DIFFERS FROM EGRIFABRIKA: NO CURVE, NO REWARD
///   `EgriFabrika` produced three things — the token, the curve and
///   HolderRewards. Two of them are gone:
///
///   THE CURVE went because there is no separate market any more. The
///     curve held its own price and the pool opened at graduation; the
///     same token had two prices, and at graduation the pool's price
///     returned to the opening level.
///
///   THE REWARD went because holder rewards will not be paid. Its 0.30%
///     goes to pool depth: locked, unwithdrawable by anyone, and the one
///     place that serves every holder. Sent to a wallet it would be a
///     wallet collecting money; sent nowhere it would evaporate.
///
///   What is left over: `LaunchToken.lastBalanceChange` is no longer read
///   by anything. The token was left alone rather than forked — the
///   `burnFrom` the vault needs is on it and the token is measured; trying
///   an untested new token on the money path costs more than two warm
///   SSTOREs per transfer.
///
/// THE WHOLE SUPPLY GOES TO THE LAUNCHPAD
///   The launchpad does the splitting: the founder's share to their
///   wallet, the rest to the ladder. It is not split here because the
///   founder's share depends on the net payment and the net payment is
///   not known here — if it were, the same number would be computed in
///   two places, which means two numbers that can drift apart.
contract PulseFabrika {
    error TransferOlmadi();

    struct Ayar {
        IERC20P quote;
        IPoolManager poolManager;
        IHooks hook;
        uint256 supply;
        uint24 poolFee;
        int24 tickSpacing;
        /// The launchpad. It receives the whole supply and is the only
        /// address the opener will take an `ac` call from.
        address merkez;
    }

    function kur(string calldata ad, string calldata sembol, Ayar calldata a)
        external
        returns (address token, address acici)
    {
        LaunchToken t = new LaunchToken(ad, sembol, a.supply, address(this));

        PulseAcici p = new PulseAcici(
            a.poolManager,
            IERC20P(address(t)),
            a.quote,
            a.hook,
            a.poolFee,
            a.tickSpacing,
            a.merkez
        );

        /* The whole supply to the launchpad, which splits it in the same
           transaction. It never sits in anybody's wallet: the launchpad
           has no function that moves a token balance except inside
           `launch`. */
        if (!IERC20F(address(t)).transfer(a.merkez, a.supply)) revert TransferOlmadi();

        return (address(t), address(p));
    }
}
