// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LaunchToken} from "./LaunchToken.sol";
import {HolderRewards, IERC20Min, ILaunchToken} from "./HolderRewards.sol";
import {EgriLaunch, IEgriToken, IHavuzAcici} from "./EgriLaunch.sol";
import {IERC20H} from "./HavuzAcici.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/// @title EgriFabrika — deploys the token, its rewards and its curve.
/// @notice Split out of EgriLaunchpad for one measured reason: embedding
///         these creation codes put the launchpad at 24,481 bytes against a
///         24,576 limit. Ninety-five bytes of headroom is not a margin, it
///         is a contract that stops being deployable the next time anyone
///         adds a line.
///
///         The pool opener then moved out of here too, for the same reason
///         measured again: with HavuzAcici's 8,557 bytes embedded this came
///         to 24,146. AciciFabrika builds it instead.
///
/// HOLDS NOTHING, DECIDES NOTHING
///   Every parameter arrives from the caller and every address created is
///   returned. The supply is minted here only so it can be forwarded to the
///   curve in the same call; this contract has no function that could move
///   it anywhere else, and no state at all.
///
///   It is also not privileged: anyone may call `kur`. What makes a launch
///   real is being recorded in the launchpad's registry, and only the
///   launchpad can write that. A launch created by calling this directly
///   would have no entry, so its curve could never graduate — `ac` on the
///   launchpad rejects any caller it did not create.
/// WHY A CONTRACT AND NOT A LIBRARY
///   An external library function is reached by DELEGATECALL, and
///   `degismezlik.js` exists to prove this project's contracts contain no
///   DELEGATECALL at all. Linking a library would put one in the launchpad
///   and retire that proof to buy a few hundred bytes. A plain CALL costs
///   more gas and keeps the guarantee.
contract EgriFabrika {
    struct Ayar {
        IERC20H quote;
        IPoolManager poolManager;
        IHooks hook;
        uint256 supply;
        /// What the CURVE is funded with, which is less than supply now
        /// that the ladder takes a share. SANAL_TOKEN has to equal it or
        /// the curve's opening price would describe tokens it does not
        /// hold.
        uint256 egriToken;
        uint256 fantom;
        uint256 esik;
        uint64 holdPeriod;
        uint64 snipeSuresi;
        /// Passed to the curve as its pool opener AND to the opener as its
        /// curve. The launchpad sits between them; see the note in
        /// EgriLaunchpad about why neither can be deployed first.
        address merkez;
        address kurucu;
        /* The launchpad's three fee destinations. Addresses rather than one
           splitter contract so each slice is visible on-chain as its own
           transfer, and so a splitter cannot become a place where money
           waits for somebody to move it. */
        address gelistiriciFonu;
        address likiditeKasasi;
        address isletmeKasasi;
        /// [toplam, kurucu, stake, gelistirici, likidite, isletme, kasa] ppm.
        uint256[7] ucretler;
    }

    error TransferOlmadi();

    function kur(string calldata ad, string calldata sembol, Ayar calldata a)
        external
        returns (address token, address egri, address rewards)
    {
        LaunchToken t = new LaunchToken(ad, sembol, a.supply, address(this));

        /* Rewards pay in the quote asset, so holders are never paid in
           something they then have to sell. The curve holds nearly all of
           supply for most of its life and must not earn on it; it is
           excluded through the second slot, which is why rewards has to
           exist before the curve does. */
        HolderRewards r = new HolderRewards(
            IERC20Min(address(a.quote)), ILaunchToken(address(t)), a.merkez, a.holdPeriod
        );

        EgriLaunch e = new EgriLaunch(
            IEgriToken(address(t)),
            IEgriToken(address(a.quote)),
            a.fantom,
            a.egriToken,           // SANAL_TOKEN == what the curve is funded with
            a.esik,
            IHavuzAcici(a.merkez),
            a.snipeSuresi,
            a.kurucu,              // the token creator's slice, immutable
            address(r),            // the staker slice goes to holder rewards
            a.gelistiriciFonu,
            a.likiditeKasasi,
            a.isletmeKasasi,
            a.ucretler
        );

        r.setSecondExcluded(address(e));

        /* The whole supply goes to the curve. There is no reserved slice to
           open a pool with, because the pool is opened later out of what
           buyers actually paid, and whatever is left unsold at graduation is
           burned rather than kept. */
        if (!t.transfer(address(e), a.egriToken)) revert TransferOlmadi();

        /* The ladder's share goes back to the launchpad, because the ladder
           does not exist yet — it needs the token's address, which only
           came into being a few lines ago. The launchpad forwards it and
           opens the band in the same transaction, so the allocation never
           sits in anybody's wallet. */
        uint256 merdivenPayi = a.supply - a.egriToken;
        if (merdivenPayi > 0 && !t.transfer(a.merkez, merdivenPayi)) revert TransferOlmadi();

        return (address(t), address(e), address(r));
    }
}
