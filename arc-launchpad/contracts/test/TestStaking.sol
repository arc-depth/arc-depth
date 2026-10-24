// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GovToken} from "../GovToken.sol";
import {Staking, IToken} from "../Staking.sol";

/// A staker that can act for itself, since rewards follow msg.sender.
contract Staker {
    function approveAndStake(GovToken t, Staking s, uint256 amount) external {
        t.approve(address(s), type(uint256).max);
        s.stake(amount);
    }

    function claim(Staking s) external returns (uint256) {
        return s.claim();
    }

    function unstake(Staking s, uint256 amount) external {
        s.unstake(amount);
    }
}

/// @notice Exercises the thirty-year emission and the staking split.
///
/// The schedule is the one thing here that cannot be checked by reading it:
/// "90% in the first ten years" is a claim about a loop running 520 times.
/// Backdating the start lets those decades run inside a single eth_call, so
/// the curve is measured rather than asserted.
contract TestStaking {
    struct Dagilim {
        uint256 toplam;
        uint256 serbest;
        uint256 vesting;
        uint256 likidite;
        uint256 emisyon;
    }

    function runDagilim() external returns (Dagilim memory d) {
        address f = address(0xF1);
        address v = address(0xF2);
        address l = address(0xF3);
        address e = address(0xF4);
        GovToken t = new GovToken(f, v, l, e);
        d.toplam = t.totalSupply();
        d.serbest = t.balanceOf(f);
        d.vesting = t.balanceOf(v);
        d.likidite = t.balanceOf(l);
        d.emisyon = t.balanceOf(e);
    }

    /// Cumulative emission after `yil` years, as a fraction of the pool.
    /// Returns parts per million so the caller sees exact integers.
    function runEgri(uint256 yil) external returns (uint256 cikanPpm, uint256 kalan) {
        // This contract takes the liquidity slice too, so there is still
        // something left to stake after the emission has been handed over.
        GovToken t = new GovToken(address(0xE1), address(0xE2), address(this), address(this));
        uint256 emission = (t.totalSupply() * 60) / 100;

        Staking s = new Staking(IToken(address(t)), emission, block.timestamp - yil * 365 days);
        t.transfer(address(s), emission);

        // Something must be staked or the release waits by design.
        Staker a = new Staker();
        t.transfer(address(a), 1 ether);
        a.approveAndStake(t, s, 1 ether);

        // MAX_CATCHUP bounds each call, so a long backdate needs several.
        for (uint256 i; i < 12; ++i) {
            s.release();
        }

        kalan = s.emissionLeft();
        cikanPpm = ((emission - kalan) * 1_000_000) / emission;
    }

    struct Paylasim {
        uint256 aPay;
        uint256 bPay;
        uint256 toplamDagitilan;
        uint256 bosRelease;   // nothing staked: must stay locked
    }

    function runPaylasim() external returns (Paylasim memory p) {
        GovToken t = new GovToken(address(0xE1), address(0xE2), address(this), address(this));
        // liquidity + emission both land here; emission alone is 60%.
        uint256 emission = (t.totalSupply() * 60) / 100;

        Staking s = new Staking(IToken(address(t)), emission, block.timestamp - 52 weeks);
        t.transfer(address(s), emission);

        // Before anyone stakes, a release must not hand the pool to the first
        // staker who shows up.
        p.bosRelease = s.release();

        Staker a = new Staker();
        Staker b = new Staker();
        t.transfer(address(a), 300 ether);
        t.transfer(address(b), 100 ether);
        a.approveAndStake(t, s, 300 ether);
        b.approveAndStake(t, s, 100 ether);

        // Now let a year of releases land on the staked balances.
        for (uint256 i; i < 4; ++i) {
            s.release();
        }

        p.aPay = a.claim(s);
        p.bPay = b.claim(s);
        p.toplamDagitilan = p.aPay + p.bPay;
    }
}
