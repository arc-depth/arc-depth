// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Stake, IStakeToken} from "../Stake.sol";
import {MockUSDC6} from "./TestOndalik.sol";
import {EgriMockToken} from "./TestEgriKontrat.sol";

contract Stakeci {
    function stake(Stake s, EgriMockToken t, uint256 m) external {
        t.approve(address(s), type(uint256).max);
        s.stake(m);
    }
    function coz(Stake s, uint256 m) external { s.unstake(m); }
    function al(Stake s) external returns (uint256) { return s.claim(); }
}

/// @title TestStakeOdul
/// @notice Earning and deciding are two different questions, and the test
///         has to show they are answered separately.
///
/// Stake any amount and it earns from the first dollar of fee income. A
/// vote needs 50,000. Those are the user's two rules and they pull in
/// opposite directions, so the interesting cases are a dust staker who
/// earns but cannot vote, and a large staker who arrives after a proposal
/// opened and therefore cannot vote on it either.
///
/// This harness builds Stake with a ZERO emission on purpose, so the USDC
/// reward can be measured on its own and the supply assertion means what it
/// says. The real deployment places 400,000,000 here; the emission has its
/// own section rather than being tangled into these cases.
contract TestStakeOdul {
    uint256 constant ARZ = 1_000_000_000 ether;
    uint256 constant BIR_USDC = 1e6;
    uint256 constant TABAN = 50_000 ether;

    struct Kur {
        Stake s;
        EgriMockToken t;
        MockUSDC6 q;
    }

    function _kur(uint256 usdc) internal returns (Kur memory k) {
        k.t = new EgriMockToken(ARZ, address(this));
        k.q = new MockUSDC6(usdc, address(this));
        k.s = new Stake(IStakeToken(address(k.t)), IStakeToken(address(k.q)), 0, 0);
    }

    function _stakeci(Kur memory k, uint256 token) internal returns (Stakeci c) {
        c = new Stakeci();
        k.t.transfer(address(c), token);
    }

    /* ---------------------------------------------------------------- */

    struct Odul {
        uint256 kucukStake;
        uint256 buyukStake;
        uint256 kucukKazanc;
        uint256 buyukKazanc;
        uint256 dagitilan;
        uint256 arzOnce;
        uint256 arzSonra;
        uint256 kucukOyGucu;
        uint256 buyukOyGucu;
    }

    /// A dust staker earns in proportion and cannot vote. A large staker
    /// earns in proportion and can. Same contract, same call.
    function runOdulVeTaban() external returns (Odul memory o) {
        Kur memory k = _kur(10_000 * BIR_USDC);
        o.arzOnce = k.t.totalSupply();

        /* One wei, and well over the floor. */
        Stakeci kucuk = _stakeci(k, 1);
        Stakeci buyuk = _stakeci(k, 200_000 ether);
        kucuk.stake(k.s, k.t, 1);
        buyuk.stake(k.s, k.t, 200_000 ether);
        o.kucukStake = k.s.stakedOf(address(kucuk));
        o.buyukStake = k.s.stakedOf(address(buyuk));

        /* Fee income arrives by plain transfer — nothing has to call in. */
        k.q.transfer(address(k.s), 1_000 * BIR_USDC);
        o.dagitilan = k.s.dagit();

        o.kucukKazanc = k.s.pending(address(kucuk));
        o.buyukKazanc = k.s.pending(address(buyuk));
        o.kucukOyGucu = k.s.oyGucu(address(kucuk));
        o.buyukOyGucu = k.s.oyGucu(address(buyuk));

        /* The claim is in USDC and the token supply must not have moved. */
        kucuk.al(k.s);
        buyuk.al(k.s);
        o.arzSonra = k.t.totalSupply();
    }

    struct Emisyon {
        uint256 havuzBaslangic;
        uint256 periyotGecti;
        uint256 salinan;
        uint256 kalan;
        uint256 stakeciKazanci;
        uint256 ikinciSalimSifir;
        uint256 stakeYokkenSalinan;
        uint256 stakeYokkenKalan;
        uint256 stakeYokkenPeriyot;
        uint256 sonradanGelenKazanc;
    }

    uint256 constant EMISYON = 400_000_000 ether;
    uint256 constant HAFTA = 7 days;

    /// The schedule at a given number of weeks, by starting the clock that
    /// far in the past.
    function runEmisyon(uint256 hafta) external returns (Emisyon memory e) {
        EgriMockToken t = new EgriMockToken(ARZ, address(this));
        MockUSDC6 q = new MockUSDC6(0, address(this));
        Stake s = new Stake(IStakeToken(address(t)), IStakeToken(address(q)),
                            EMISYON, block.timestamp - hafta * HAFTA);
        t.transfer(address(s), EMISYON);
        e.havuzBaslangic = s.emisyonKalan();

        Stakeci a = new Stakeci();
        t.transfer(address(a), 1_000_000 ether);
        /* stake() calls salim() before the stake is recorded, so nothing is
           released on this call — which is the behaviour that stops the
           first staker from sweeping a backlog. */
        a.stake(s, t, 1_000_000 ether);

        e.periyotGecti = s.periyotGecti();
        /* The weeks that passed before anybody staked were consumed by the
           stake() above — correctly, since there was nobody to pay. So the
           schedule itself is read from the preview, which is the same
           arithmetic without the per-call cap. */
        (e.salinan, e.kalan) = s.planOnizle(hafta);
        e.stakeciKazanci = s.pendingToken(address(a));
        e.ikinciSalimSifir = s.salim();
    }

    /// Nobody staked for a year. The clock has to move and the tokens have
    /// to stay — ALP advanced neither, and the first staker took the lot.
    function runEmisyonStakeYok() external returns (Emisyon memory e) {
        EgriMockToken t = new EgriMockToken(ARZ, address(this));
        MockUSDC6 q = new MockUSDC6(0, address(this));
        Stake s = new Stake(IStakeToken(address(t)), IStakeToken(address(q)),
                            EMISYON, block.timestamp - 52 * HAFTA);
        t.transfer(address(s), EMISYON);

        e.periyotGecti = s.periyotGecti();
        e.stakeYokkenSalinan = s.salim();          // nothing staked
        e.stakeYokkenKalan = s.emisyonKalan();
        e.stakeYokkenPeriyot = s.islenenPeriyot();

        /* Now somebody stakes. There must be no year of emission waiting. */
        Stakeci a = new Stakeci();
        t.transfer(address(a), 1_000_000 ether);
        a.stake(s, t, 1_000_000 ether);
        s.salim();
        e.sonradanGelenKazanc = s.pendingToken(address(a));
    }

    struct Kiralama {
        uint256 oncekiBlokGucu;
        uint256 simdikiGucu;
        uint256 stakeli;
        uint256 toplamOncekiBlok;
        uint256 toplamSimdi;
    }

    /// Renting a vote: stake a fortune, then try to vote on a proposal that
    /// already existed. A snapshot taken before the stake arrived must read
    /// zero for them.
    function runOyKiralanamaz() external returns (Kiralama memory r) {
        Kur memory k = _kur(0);
        Stakeci saldirgan = _stakeci(k, 500_000 ether);
        saldirgan.stake(k.s, k.t, 500_000 ether);

        r.stakeli = k.s.stakedOf(address(saldirgan));
        r.simdikiGucu = k.s.oyGucuAt(address(saldirgan), block.number);
        /* A proposal opened one block before this stake landed. */
        r.oncekiBlokGucu = k.s.oyGucuAt(address(saldirgan), block.number - 1);
        r.toplamSimdi = k.s.toplamAt(block.number);
        r.toplamOncekiBlok = k.s.toplamAt(block.number - 1);
    }

    struct Oran {
        uint256 aKazanc;
        uint256 bKazanc;
        uint256 cKazanc;
        uint256 toplamOdul;
        uint256 sonrakiAKazanc;
        uint256 cozduktenSonraBKazanc;
    }

    /// Pro-rata, and leaving stops the earning rather than clawing it back.
    function runPayOrani() external returns (Oran memory o) {
        Kur memory k = _kur(100_000 * BIR_USDC);
        Stakeci a = _stakeci(k, 100_000 ether);
        Stakeci b = _stakeci(k, 200_000 ether);
        Stakeci c = _stakeci(k, 700_000 ether);
        a.stake(k.s, k.t, 100_000 ether);
        b.stake(k.s, k.t, 200_000 ether);
        c.stake(k.s, k.t, 700_000 ether);

        k.q.transfer(address(k.s), 1_000 * BIR_USDC);
        o.toplamOdul = k.s.dagit();
        o.aKazanc = k.s.pending(address(a));
        o.bKazanc = k.s.pending(address(b));
        o.cKazanc = k.s.pending(address(c));

        /* b leaves, taking what it earned. The next distribution must skip
           it entirely and must not reduce what a and c already had. */
        b.al(k.s);
        b.coz(k.s, 200_000 ether);
        k.q.transfer(address(k.s), 1_000 * BIR_USDC);
        k.s.dagit();
        o.sonrakiAKazanc = k.s.pending(address(a));
        o.cozduktenSonraBKazanc = k.s.pending(address(b));
    }

    struct Kilit {
        bool kilitVar;
        uint256 geriAlinan;
        uint256 cozmeSonrasiOyGucu;
        uint256 cozmeSonrasiKazanc;
        bool fazlaCozmeRed;
    }

    /// No lock and no penalty: everything staked comes back.
    function runKilitYok() external returns (Kilit memory c) {
        Kur memory k = _kur(1_000 * BIR_USDC);
        Stakeci a = _stakeci(k, 60_000 ether);
        a.stake(k.s, k.t, 60_000 ether);

        k.q.transfer(address(k.s), 100 * BIR_USDC);
        k.s.dagit();

        a.coz(k.s, 60_000 ether);
        c.geriAlinan = k.t.balanceOf(address(a));
        c.cozmeSonrasiOyGucu = k.s.oyGucu(address(a));
        /* Unstaking settles the reward, so nothing is left owed. */
        c.cozmeSonrasiKazanc = k.s.pending(address(a));
        c.kilitVar = false;

        try a.coz(k.s, 1) { c.fazlaCozmeRed = false; } catch { c.fazlaCozmeRed = true; }
    }

    struct StakeYok {
        uint256 bekleyenOnce;
        uint256 dagitilanStakeYokken;
        uint256 bekleyenSonra;
        uint256 ilkStakeciKazanci;
    }

    /// Fee income arriving before anybody stakes has to wait rather than
    /// vanish. It then goes to whoever is staked when it is distributed,
    /// which is a real edge and is documented as one.
    function runStakeYokken() external returns (StakeYok memory z) {
        Kur memory k = _kur(1_000 * BIR_USDC);
        k.q.transfer(address(k.s), 500 * BIR_USDC);
        z.bekleyenOnce = k.s.bekleyen();
        z.dagitilanStakeYokken = k.s.dagit();      // nothing staked: credits nobody
        z.bekleyenSonra = k.s.bekleyen();          // still waiting, not lost

        Stakeci a = _stakeci(k, 60_000 ether);
        a.stake(k.s, k.t, 60_000 ether);
        k.s.dagit();
        z.ilkStakeciKazanci = k.s.pending(address(a));
    }
}
