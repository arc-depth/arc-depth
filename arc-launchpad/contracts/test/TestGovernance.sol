// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Vesting, IERC20V} from "../Vesting.sol";
import {Governor, IStakingVotes} from "../Governor.sol";
import {DevPool, IERC20D} from "../DevPool.sol";
import {MockERC20} from "./TestRedemption.sol";

/// Stands in for Staking so voting weights can be set directly. Governance
/// is being tested here, not the staking accounting — that has its own
/// suite, and coupling the two would make a failure in either look like a
/// failure in both.
contract MockVotes {
    mapping(address => uint256) public votingPower;
    uint256 public totalStaked;

    function setPower(address who, uint256 p) external {
        totalStaked = totalStaked + p - votingPower[who];
        votingPower[who] = p;
    }
}

/// A participant that acts for itself, since everything follows msg.sender.
contract Voter {
    function propose(Governor g, string calldata d, address target, bytes calldata data)
        external
        returns (uint256)
    {
        return g.propose(d, target, data);
    }

    function vote(Governor g, uint256 id, bool support) external returns (uint256) {
        return g.castVote(id, support);
    }

    function queue(Governor g, uint256 id) external returns (uint256) {
        return g.queue(id);
    }

    function execute(Governor g, uint256 id) external {
        g.execute(id);
    }

    function cancel(Governor g, uint256 id) external {
        g.cancel(id);
    }

    function renounce(Governor g) external {
        g.renounce();
    }
}

contract TestGovernance {
    address constant GELISTIRICI = address(0xD00D);

    /// Vesting releases one twelfth per month and stops at twelve.
    function runVesting(uint256 ayGecti) external returns (uint256 acilan, uint256 cekilen, uint256 ay) {
        MockERC20 t = new MockERC20(1200 ether, address(this));
        Vesting v = new Vesting(IERC20V(address(t)), address(0xBEEF), 1200 ether,
            block.timestamp - ayGecti * 30 days);
        t.transfer(address(v), 1200 ether);

        ay = v.monthsUnlocked();
        acilan = v.unlocked();
        if (v.claimable() > 0) cekilen = v.claim();
    }

    /// Production delays. Used wherever the test does not need to reach the
    /// far side of one, so that the real numbers are exercised too.
    function _gercek(MockVotes votes, address guardian) internal returns (Governor) {
        return new Governor(IStakingVotes(address(votes)), guardian, 365, 5 days, 2 days, 14 days);
    }

    /// Zero delays. block.timestamp cannot be moved inside an eth_call, so
    /// this is the only way the path beyond the timelock gets tested at all.
    function _hizli(MockVotes votes, address guardian) internal returns (Governor) {
        return new Governor(IStakingVotes(address(votes)), guardian, 365, 0, 0, 0);
    }

    /// A weight comfortably over Governor.MIN_OY_GUCU. Every test here
    /// needs one now: under the floor there is no vote to test.
    uint256 internal constant OY = 100_000 ether;

    struct Oylama {
        uint256 id;
        uint256 lehte;
        uint256 aleyhte;
        uint8 durumAktif;
        bool esikAltiReddedildi;
        bool cifteOyReddedildi;
        bool guctenYoksunReddedildi;
    }

    /// A proposal needs 1% to raise, 10% FOR to pass, and more FOR than
    /// AGAINST. Apathy must defeat it.
    function runOylama(uint256 lehteGuc, uint256 aleyhteGuc) external returns (Oylama memory o) {
        MockVotes votes = new MockVotes();
        Governor g = _gercek(votes, address(0));

        Voter a = new Voter();
        Voter b = new Voter();
        Voter kucuk = new Voter();
        Voter bos = new Voter();
        Voter sessiz = new Voter();

        votes.setPower(address(a), lehteGuc);
        votes.setPower(address(b), aleyhteGuc);
        /* This used to be 1 wei, which the voting floor would now reject —
           and the 1% proposal threshold would stop being tested at all.
           So: over the floor, but under 1% of the total. That needs a total
           above 5,000,000 for 1% to exceed the floor, which is what the
           silent stake below is for. It never votes. */
        votes.setPower(address(sessiz), 10_000_000 ether);
        votes.setPower(address(kucuk), 60_000 ether);

        try kucuk.propose(g, "cok kucuk", address(0), "") { o.esikAltiReddedildi = false; }
        catch { o.esikAltiReddedildi = true; }

        o.id = a.propose(g, "gelistirici payi X adresine", address(0), "");
        o.durumAktif = uint8(g.state(o.id));

        a.vote(g, o.id, true);
        if (aleyhteGuc > 0) b.vote(g, o.id, false);

        try a.vote(g, o.id, true) { o.cifteOyReddedildi = false; }
        catch { o.cifteOyReddedildi = true; }

        try bos.vote(g, o.id, true) { o.guctenYoksunReddedildi = false; }
        catch { o.guctenYoksunReddedildi = true; }

        (,,,,,, uint256 f, uint256 ag,,) = _oku(g, o.id);
        o.lehte = f;
        o.aleyhte = ag;
    }

    /// `proposals` returns eleven components and most are not wanted here.
    /// Pulling the read into one place keeps the destructuring from being
    /// copied, which is how it silently went wrong the last time the struct
    /// grew a field.
    function _oku(Governor g, uint256 id)
        internal
        view
        returns (
            address proposer, address target, uint256 end, uint256 eta,
            uint256 snapshot, uint256 unused, uint256 f, uint256 ag,
            bool executed, bool cancelled
        )
    {
        bytes memory d;
        string memory s;
        (proposer, target, d, s, end, eta, snapshot, f, ag, executed, cancelled) = g.proposals(id);
        d; s;
        unused = 0;
    }

    /// Same vote, but judged as if the window had closed.
    function runSonuc(uint256 lehteGuc, uint256 aleyhteGuc, uint256 digerStake)
        external
        returns (uint8 durum, uint256 lehte, uint256 aleyhte)
    {
        MockVotes votes = new MockVotes();
        Governor g = _hizli(votes, address(0));
        Voter a = new Voter();
        Voter b = new Voter();
        Voter pasif = new Voter();

        votes.setPower(address(a), lehteGuc);
        votes.setPower(address(b), aleyhteGuc);
        votes.setPower(address(pasif), digerStake); // stakes but never votes

        uint256 id = a.propose(g, "test", address(0), "");
        a.vote(g, id, true);
        if (aleyhteGuc > 0) b.vote(g, id, false);

        /* With a zero voting period the window is already shut, so this is
           the contract's own verdict rather than one recomputed by the
           test. The previous version of this test did the arithmetic
           itself, which meant the state machine was never actually run. */
        durum = uint8(g.state(id));
        lehte = aleyhte = 0;
        (,,,,,, lehte, aleyhte,,) = _oku(g, id);
    }

    struct Uygulama {
        uint8 durumGecti;        // after the window closes
        bool siradanOnceRed;     // execute before queue must fail
        uint256 eta;
        uint8 durumHazir;
        uint256 odenen;          // what the developer received
        uint256 kayitliOdeme;    // DevPool.paid
        uint256 havuzKalan;
        uint8 durumSonra;
        bool ciftUygulamaRed;
        uint256 katkiId;
    }

    /// The whole path, end to end: a developer records their work, a vote
    /// passes, the timelock is respected, and the money actually moves.
    function runUygulama(uint256 havuz, uint256 odeme) external returns (Uygulama memory u) {
        MockVotes votes = new MockVotes();
        Governor g = _hizli(votes, address(0));
        DevPool pool = new DevPool(address(g));
        MockERC20 col = new MockERC20(havuz, address(this));
        col.transfer(address(pool), havuz);

        // The developer registers what they built. Permissionless.
        u.katkiId = pool.register("https://example.invalid/pull/1");

        Voter a = new Voter();
        votes.setPower(address(a), OY);

        bytes memory data = abi.encodeWithSelector(
            DevPool.pay.selector, IERC20D(address(col)), GELISTIRICI, odeme, u.katkiId
        );
        uint256 id = a.propose(g, "gelistiriciye odeme", address(pool), data);
        a.vote(g, id, true);

        u.durumGecti = uint8(g.state(id)); // Succeeded == 2

        // Executing before the timelock has even been started must fail.
        try a.execute(g, id) { u.siradanOnceRed = false; }
        catch { u.siradanOnceRed = true; }

        u.eta = a.queue(g, id);
        u.durumHazir = uint8(g.state(id)); // Ready == 4

        a.execute(g, id);

        u.odenen = col.balanceOf(GELISTIRICI);
        u.kayitliOdeme = pool.paid(GELISTIRICI, address(col));
        u.havuzKalan = col.balanceOf(address(pool));
        u.durumSonra = uint8(g.state(id)); // Executed == 5

        try a.execute(g, id) { u.ciftUygulamaRed = false; }
        catch { u.ciftUygulamaRed = true; }
    }

    struct Kiralama {
        uint256 lehteOncesi;      // the tally while the stake was still there
        uint8 durumOncesi;        // and what the proposal counted as
        uint256 lehteSonrasi;     // after the voter withdrew and anyone refreshed
        uint8 durumSonrasi;
        uint256 dusen;            // what tazele took off
        uint256 durustOncesi;     // an honest voter's weight, before
        uint256 durustSonrasi;    // and after a refresh touched them
    }

    /// Renting a decision: stake, vote, unstake, having risked nothing.
    ///
    /// Voting power is read when the vote is cast, so until this the whole
    /// of a proposal could be carried by stake that left in the next block.
    /// The attack is run here rather than described, because the repair is
    /// only worth having if the thing it repairs can be shown.
    function runOyKiralama() external returns (Kiralama memory k) {
        MockVotes votes = new MockVotes();
        Governor g = _hizli(votes, address(0));
        DevPool pool = new DevPool(address(g));
        MockERC20 col = new MockERC20(1000, address(this));
        col.transfer(address(pool), 1000);

        Voter saldirgan = new Voter();
        Voter durust = new Voter();

        /* The attacker holds most of the stake while voting; the honest
           voter a tenth of it and keeps it. Both are over the voting floor,
           or neither could cast the vote this is about. */
        votes.setPower(address(saldirgan), 9 * OY);
        votes.setPower(address(durust), OY);

        bytes memory data = abi.encodeWithSelector(
            DevPool.pay.selector, IERC20D(address(col)), GELISTIRICI, uint256(500), uint256(0)
        );
        uint256 id = saldirgan.propose(g, "kiralanmis oy", address(pool), data);
        saldirgan.vote(g, id, true);
        durust.vote(g, id, false);

        k.lehteOncesi = g.forVotesOf(id);
        k.durumOncesi = uint8(g.state(id));
        k.durustOncesi = g.powerAt(id, address(durust));

        /* And out again, the moment the vote is in. */
        votes.setPower(address(saldirgan), 0);

        /* Anybody, for anybody. */
        k.dusen = g.tazele(id, address(saldirgan));
        g.tazele(id, address(durust));

        k.lehteSonrasi = g.forVotesOf(id);
        k.durumSonrasi = uint8(g.state(id));
        k.durustSonrasi = g.powerAt(id, address(durust));
    }

    struct Taban {
        uint256 taban;             // what the contract says the floor is
        bool tamTabanOyVerdi;      // exactly the floor is enough
        uint256 tamTabanAgirlik;   // and counted for its full weight
        bool birEksikOyRed;        // one wei under is not
        bool birEksikOneriRed;     // and cannot open a proposal either
        uint256 dusenTabanAlti;    // what tazele took off
        uint256 lehteSonrasi;
        uint256 kalanStake;        // the stake is still staked, still earning
    }

    /// The line between earning and deciding.
    ///
    /// Staking has no minimum and keeps none — anybody may stake anything
    /// and collect from the emission. A vote needs MIN_OY_GUCU. This checks
    /// the boundary rather than a value comfortably on one side of it,
    /// because an off-by-one in a threshold is the whole threshold.
    function runOyTabani() external returns (Taban memory t) {
        MockVotes votes = new MockVotes();
        Governor g = _hizli(votes, address(0));
        t.taban = g.MIN_OY_GUCU();

        Voter tam = new Voter();     // exactly the floor
        Voter eksik = new Voter();   // one wei under it
        Voter buyuk = new Voter();   // raises the question

        votes.setPower(address(buyuk), 20 * OY);
        votes.setPower(address(tam), t.taban);
        votes.setPower(address(eksik), t.taban - 1);

        uint256 id = buyuk.propose(g, "taban", address(0), "");

        try tam.vote(g, id, true) { t.tamTabanOyVerdi = true; }
        catch { t.tamTabanOyVerdi = false; }
        t.tamTabanAgirlik = g.powerAt(id, address(tam));

        try eksik.vote(g, id, true) { t.birEksikOyRed = false; }
        catch { t.birEksikOyRed = true; }

        try eksik.propose(g, "bir eksik", address(0), "") { t.birEksikOneriRed = false; }
        catch { t.birEksikOneriRed = true; }

        /* Dropping under the floor does not leave a smaller vote. The
           remaining stake was never enough to cast one, so trimming to it
           would hand the voter a say they could not have bought. */
        votes.setPower(address(tam), t.taban - 1);
        t.dusenTabanAlti = g.tazele(id, address(tam));
        t.lehteSonrasi = g.forVotesOf(id);
        /* And the stake is untouched — it keeps earning. Losing a vote is
           not a penalty on the savings. */
        t.kalanStake = votes.votingPower(address(tam));
    }

    /// The timelock has to actually hold. Same proposal, real two-day lock:
    /// it passes, it queues, and it still cannot be executed.
    function runTimelockTutuyor() external returns (uint8 durum, uint256 eta, bool uygulamaRed) {
        MockVotes votes = new MockVotes();
        Governor g = new Governor(IStakingVotes(address(votes)), address(0), 365, 0, 2 days, 14 days);
        DevPool pool = new DevPool(address(g));
        MockERC20 col = new MockERC20(1000 ether, address(this));
        col.transfer(address(pool), 1000 ether);

        Voter a = new Voter();
        votes.setPower(address(a), OY);
        bytes memory data = abi.encodeWithSelector(
            DevPool.pay.selector, IERC20D(address(col)), GELISTIRICI, 10 ether, 0
        );
        uint256 id = a.propose(g, "odeme", address(pool), data);
        a.vote(g, id, true);
        eta = a.queue(g, id);
        durum = uint8(g.state(id)); // Queued == 3, not Ready

        try a.execute(g, id) { uygulamaRed = false; }
        catch { uygulamaRed = true; }
    }

    struct Veto {
        bool nobetciIptalEtti;
        uint8 durumIptal;
        bool yabanciIptalRed;
        bool nobetciOneriRed;
        bool iptalSonrasiUygulamaRed;
        bool devirSonrasiIptalRed;
        bool nobetciAktif;
    }

    /// The guardian can stop a proposal and can do nothing else.
    function runVeto() external returns (Veto memory v) {
        MockVotes votes = new MockVotes();
        Voter nobetci = new Voter();
        Voter a = new Voter();
        Voter yabanci = new Voter();
        Governor g = _hizli(votes, address(nobetci));

        votes.setPower(address(a), OY);
        v.nobetciAktif = g.guardianActive();

        // A guardian with no stake cannot put a question at all.
        try nobetci.propose(g, "nobetci onerisi", address(0), "") { v.nobetciOneriRed = false; }
        catch { v.nobetciOneriRed = true; }

        uint256 id = a.propose(g, "iptal edilecek", address(0), "");
        a.vote(g, id, true);

        // Someone who is neither proposer nor guardian cannot cancel.
        try yabanci.cancel(g, id) { v.yabanciIptalRed = false; }
        catch { v.yabanciIptalRed = true; }

        nobetci.cancel(g, id);
        v.nobetciIptalEtti = true;
        v.durumIptal = uint8(g.state(id)); // Cancelled == 7

        try a.execute(g, id) { v.iptalSonrasiUygulamaRed = false; }
        catch { v.iptalSonrasiUygulamaRed = true; }

        // Handing the veto back is final.
        nobetci.renounce(g);
        uint256 id2 = a.propose(g, "ikinci", address(0), "");
        try nobetci.cancel(g, id2) { v.devirSonrasiIptalRed = false; }
        catch { v.devirSonrasiIptalRed = true; }
    }

    /// Two failure shapes that matter: a call that reverts inside the
    /// target, and a proposal with no call behind it.
    function runKenarlar(uint256 havuz)
        external
        returns (bool kotuCagriRed, uint8 sinyalDurum, uint256 sinyalHavuz, uint256 kayitSayisi)
    {
        MockVotes votes = new MockVotes();
        Governor g = _hizli(votes, address(0));
        DevPool pool = new DevPool(address(g));
        MockERC20 col = new MockERC20(havuz, address(this));
        col.transfer(address(pool), havuz);

        Voter a = new Voter();
        votes.setPower(address(a), OY);

        // More than the pool holds. The vote passes; the payment cannot.
        bytes memory kotu = abi.encodeWithSelector(
            DevPool.pay.selector, IERC20D(address(col)), GELISTIRICI, havuz + 1 ether, 0
        );
        uint256 id = a.propose(g, "fazla odeme", address(pool), kotu);
        a.vote(g, id, true);
        a.queue(g, id);
        try a.execute(g, id) { kotuCagriRed = false; }
        catch { kotuCagriRed = true; }
        sinyalHavuz = col.balanceOf(address(pool)); // untouched

        // A signal proposal: no target, nothing called, still a decision.
        uint256 id2 = a.propose(g, "sadece gorus", address(0), "");
        a.vote(g, id2, true);
        a.queue(g, id2);
        a.execute(g, id2);
        sinyalDurum = uint8(g.state(id2)); // Executed == 5

        pool.register("a");
        pool.register("b");
        kayitSayisi = pool.contributionCount();
    }
}
