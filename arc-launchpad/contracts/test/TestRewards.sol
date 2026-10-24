// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LaunchToken} from "../LaunchToken.sol";
import {HolderRewards, IERC20Min, ILaunchToken} from "../HolderRewards.sol";
import {MockERC20} from "./TestRedemption.sol";

/// A holder that can act for itself. Rewards are computed from msg.sender's
/// balance, so a test cannot claim "on behalf of" an address — the holder has
/// to be a real account. These stand in for wallets.
contract Holder {
    function claim(HolderRewards hr) external returns (uint256) {
        return hr.claim();
    }

    function send(LaunchToken t, address to, uint256 v) external {
        t.transfer(to, v);
    }
}

/// @notice Exercises the holder reward in one call.
///
/// The hold period is a constructor argument precisely so both branches can
/// be driven here: with zero every account qualifies, which shows the split
/// arithmetic; with a day nothing that just moved qualifies, which is the
/// forfeiting path. Waiting a real day is not an option, and a hard-coded
/// constant would have left that branch untested — which is how untested
/// branches reach production.
contract TestRewards {
    struct Pay {
        uint256 eligibleSupply;
        uint256 aEarned;
        uint256 bEarned;
        uint256 havuzEarned;
        uint256 aPaid;
        uint256 bPaid;
        uint256 kalanOdul;
    }

    address constant HAVUZ = address(0xC1);

    function runUygun(uint256 arz, uint256 odul) external returns (Pay memory p) {
        (LaunchToken tok, MockERC20 rew, HolderRewards hr, Holder a, Holder b) = _kur(arz, odul, 0);

        p.eligibleSupply = hr.eligibleSupply();
        hr.distribute();

        p.aEarned = hr.earned(address(a));
        p.bEarned = hr.earned(address(b));
        p.havuzEarned = hr.earned(HAVUZ);

        p.aPaid = a.claim(hr);
        p.bPaid = b.claim(hr);
        p.kalanOdul = rew.balanceOf(address(hr));
        tok;
    }

    struct Kayip {
        uint256 aPending;     // at stake
        uint256 aEarned;      // zero while the wait is unfinished
        uint256 aPaid;        // claiming early pays nothing
        uint256 ikinciDagitim;// the forfeited slice becomes distributable again
        uint256 bPendingSonra;
    }

    function runUygunsuz(uint256 arz, uint256 odul) external returns (Kayip memory k) {
        (, , HolderRewards hr, Holder a, Holder b) = _kur(arz, odul, 1 days);
        hr.distribute();

        k.aPending = hr.pending(address(a));
        k.aEarned = hr.earned(address(a));
        k.aPaid = a.claim(hr);

        k.ikinciDagitim = hr.distribute();
        k.bPendingSonra = hr.pending(address(b));
    }

    function _kur(uint256 arz, uint256 odul, uint64 holdPeriod)
        internal
        returns (LaunchToken tok, MockERC20 rew, HolderRewards hr, Holder a, Holder b)
    {
        tok = new LaunchToken("Test", "TST", arz, address(this));
        rew = new MockERC20(odul * 10, address(this));
        hr = new HolderRewards(IERC20Min(address(rew)), ILaunchToken(address(tok)), HAVUZ, holdPeriod);
        a = new Holder();
        b = new Holder();

        // 40% to A, 30% to B, 30% locked as "pool" liquidity.
        tok.transfer(address(a), (arz * 40) / 100);
        tok.transfer(address(b), (arz * 30) / 100);
        tok.transfer(HAVUZ, (arz * 30) / 100);

        rew.transfer(address(hr), odul);
    }
}
