// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DepthGovernor, IStakeOy} from "../DepthGovernor.sol";
import {Stake, IStakeToken} from "../Stake.sol";
import {MockUSDC6} from "./TestOndalik.sol";
import {EgriMockToken} from "./TestEgriKontrat.sol";

/// Something a vote can actually move, so execution is observable rather
/// than merely reported.
contract Kasa {
    address public immutable yonetim;
    MockUSDC6 public immutable para;
    uint256 public odenen;
    address public sonAlici;
    error SadeceYonetim();

    constructor(address _yonetim, MockUSDC6 _para) { yonetim = _yonetim; para = _para; }

    function ode(address to, uint256 miktar) external {
        if (msg.sender != yonetim) revert SadeceYonetim();
        odenen += miktar;
        sonAlici = to;
        para.transfer(to, miktar);
    }
}

contract Secmen {
    function stake(Stake s, EgriMockToken t, uint256 m) external {
        t.approve(address(s), type(uint256).max);
        s.stake(m);
    }
    function oner(DepthGovernor g, string calldata d, address hedef, bytes calldata veri)
        external returns (uint256) { return g.propose(d, hedef, veri); }
    function oyla(DepthGovernor g, uint256 id, bool lehte) external { g.castVote(id, lehte); }
    function iptal(DepthGovernor g, uint256 id) external { g.cancel(id); }
    function devret(DepthGovernor g) external { g.renounce(); }
}

/// @title TestDepthGovernor
/// @notice Propose, wait, execute — and the limits on each.
///
/// The previous governor needed a repair called `tazele` because voting
/// power was read at the moment of voting. It is gone, and its absence is
/// asserted against the compiled ABI: if the snapshot is doing its job,
/// there is nothing to refresh.
contract TestDepthGovernor {
    uint256 constant ARZ = 1_000_000_000 ether;
    uint256 constant BIR_USDC = 1e6;
    address constant GELISTIRICI = address(uint160(0xDEF1));

    struct Kurulum {
        Stake s;
        DepthGovernor g;
        EgriMockToken t;
        MockUSDC6 q;
        Kasa k;
    }

    /// Zero delays so one call can reach past the timelock; zero lookback
    /// so checkpoints written in this block are visible.
    function _kur(uint256 usdc, address nobetci) internal returns (Kurulum memory c) {
        c.t = new EgriMockToken(ARZ, address(this));
        c.q = new MockUSDC6(usdc, address(this));
        c.s = new Stake(IStakeToken(address(c.t)), IStakeToken(address(c.q)), 0, 0);
        c.g = new DepthGovernor(IStakeOy(address(c.s)), nobetci, 365, 0, 0, 0, 0);
        c.k = new Kasa(address(c.g), c.q);
    }

    function _secmen(Kurulum memory c, uint256 token) internal returns (Secmen v) {
        v = new Secmen();
        c.t.transfer(address(v), token);
    }

    /* ---------------------------------------------------------------- */

    struct Akis {
        uint256 id;
        uint8 durumGecti;
        bool siradanOnceRed;
        uint8 durumHazir;
        uint256 odenen;
        address alici;
        uint8 durumSonra;
        bool ciftUygulamaRed;
        bool yabanciUygulayabildi;
    }

    /// The whole path, and the one thing that must be open to everyone:
    /// execution. A decision that passed and waited should not need
    /// anybody's permission to land.
    function runAkis(uint256 odeme) external returns (Akis memory a) {
        Kurulum memory c = _kur(10_000 * BIR_USDC, address(0));
        c.q.transfer(address(c.k), 5_000 * BIR_USDC);

        Secmen v = _secmen(c, 1_000_000 ether);
        v.stake(c.s, c.t, 1_000_000 ether);

        bytes memory veri = abi.encodeWithSelector(Kasa.ode.selector, GELISTIRICI, odeme);
        a.id = v.oner(c.g, "gelistiriciye odeme", address(c.k), veri);
        v.oyla(c.g, a.id, true);
        a.durumGecti = uint8(c.g.state(a.id));

        try c.g.execute(a.id) { a.siradanOnceRed = false; } catch { a.siradanOnceRed = true; }

        c.g.queue(a.id);
        a.durumHazir = uint8(c.g.state(a.id));

        /* Executed by this contract, which staked nothing and never voted. */
        c.g.execute(a.id);
        a.yabanciUygulayabildi = true;
        a.odenen = c.k.odenen();
        a.alici = c.k.sonAlici();
        a.durumSonra = uint8(c.g.state(a.id));

        try c.g.execute(a.id) { a.ciftUygulamaRed = false; } catch { a.ciftUygulamaRed = true; }
    }

    struct Taban {
        bool tabanAltiOneriRed;
        bool tabanAltiOyRed;
        uint256 tabanAltiStake;
        uint256 tabanAltiKazanc;
        uint256 toplamStake;
    }

    /// The seam again, from the governor's side: stake under 50,000 earns
    /// and is counted in the quorum's denominator, but cannot propose or
    /// vote.
    function runTaban() external returns (Taban memory t) {
        Kurulum memory c = _kur(10_000 * BIR_USDC, address(0));
        Secmen buyuk = _secmen(c, 1_000_000 ether);
        Secmen kucuk = _secmen(c, 40_000 ether);          // under the floor
        buyuk.stake(c.s, c.t, 1_000_000 ether);
        kucuk.stake(c.s, c.t, 40_000 ether);

        t.tabanAltiStake = c.s.stakedOf(address(kucuk));
        t.toplamStake = c.s.totalStaked();

        try kucuk.oner(c.g, "taban alti", address(0), "") { t.tabanAltiOneriRed = false; }
        catch { t.tabanAltiOneriRed = true; }

        uint256 id = buyuk.oner(c.g, "gercek oneri", address(0), "");
        try kucuk.oyla(c.g, id, true) { t.tabanAltiOyRed = false; }
        catch { t.tabanAltiOyRed = true; }

        /* But it earns. */
        c.q.transfer(address(c.s), 1_000 * BIR_USDC);
        c.s.dagit();
        t.tabanAltiKazanc = c.s.pending(address(kucuk));
    }

    struct Ilgisizlik {
        uint8 azLehteDurum;
        uint8 cokLehteDurum;
        uint8 aleyhteCogunlukDurum;
        uint256 yeterSayi;
    }

    /// Quorum counts FOR votes only, so not turning up defeats a proposal
    /// instead of letting it through.
    function runIlgisizlik() external returns (Ilgisizlik memory o) {
        /* 1,000,000 staked in total; quorum is 10% = 100,000. */
        Kurulum memory c = _kur(0, address(0));
        Secmen az = _secmen(c, 60_000 ether);       // over the floor, under quorum
        Secmen cok = _secmen(c, 500_000 ether);
        Secmen sessiz = _secmen(c, 440_000 ether);  // never votes
        az.stake(c.s, c.t, 60_000 ether);
        cok.stake(c.s, c.t, 500_000 ether);
        sessiz.stake(c.s, c.t, 440_000 ether);
        o.yeterSayi = (c.s.totalStaked() * 1000) / 10000;

        uint256 id1 = cok.oner(c.g, "az lehte", address(0), "");
        az.oyla(c.g, id1, true);                     // 60,000 FOR, under 100,000
        o.azLehteDurum = uint8(c.g.state(id1));

        uint256 id2 = cok.oner(c.g, "cok lehte", address(0), "");
        cok.oyla(c.g, id2, true);                    // 500,000 FOR
        o.cokLehteDurum = uint8(c.g.state(id2));

        uint256 id3 = cok.oner(c.g, "aleyhte cogunluk", address(0), "");
        az.oyla(c.g, id3, true);
        cok.oyla(c.g, id3, false);
        o.aleyhteCogunlukDurum = uint8(c.g.state(id3));
    }

    struct Nobetci {
        bool aktif;
        bool nobetciOneremez;
        bool yabanciIptalRed;
        uint8 iptalDurum;
        bool iptalSonrasiUygulamaRed;
        bool devirSonrasiIptalRed;
    }

    /// The guardian can stop a proposal and can do nothing else.
    function runNobetci() external returns (Nobetci memory n) {
        Secmen nobetci = new Secmen();
        Kurulum memory c = _kur(0, address(nobetci));
        Secmen v = _secmen(c, 1_000_000 ether);
        v.stake(c.s, c.t, 1_000_000 ether);
        n.aktif = c.g.guardianActive();

        /* No stake, so no question — the veto is not a seat at the table. */
        try nobetci.oner(c.g, "nobetci onerisi", address(0), "") { n.nobetciOneremez = false; }
        catch { n.nobetciOneremez = true; }

        uint256 id = v.oner(c.g, "oneri", address(0), "");
        v.oyla(c.g, id, true);

        /* Anybody else trying to cancel must fail. */
        Secmen yabanci = new Secmen();
        try yabanci.iptal(c.g, id) { n.yabanciIptalRed = false; } catch { n.yabanciIptalRed = true; }

        nobetci.iptal(c.g, id);
        n.iptalDurum = uint8(c.g.state(id));
        try c.g.execute(id) { n.iptalSonrasiUygulamaRed = false; }
        catch { n.iptalSonrasiUygulamaRed = true; }

        /* And once given up, it does not come back. */
        uint256 id2 = v.oner(c.g, "ikinci oneri", address(0), "");
        nobetci.devret(c.g);
        try nobetci.iptal(c.g, id2) { n.devirSonrasiIptalRed = false; }
        catch { n.devirSonrasiIptalRed = true; }
    }
}
