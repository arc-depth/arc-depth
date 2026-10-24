// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Launchpad} from "../Launchpad.sol";
import {LaunchQueue, IERC20Q, ILaunchpadQ} from "../LaunchQueue.sol";
import {LaunchToken} from "../LaunchToken.sol";
import {CollateralVault, IERC20} from "../CollateralVault.sol";
import {MockERC20} from "./TestRedemption.sol";
import {MockUSDC6} from "./TestOndalik.sol";

/// Stands in for the customer, so the queue is exercised through a
/// different address than the one running the test. Who holds what at the
/// end is the whole question, and it cannot be asked if everyone is the
/// same account.
contract Musteri {
    /// @param enAz the floor the customer sets on the delivery. The queue
    ///        refuses zero, so every path has to state one.
    function talepEt(
        LaunchQueue q, MockUSDC6 usdc, bytes32 hisse,
        uint256 amount, uint16 poolBps, uint256 enAz
    ) external returns (uint256) {
        usdc.approve(address(q), type(uint256).max);
        return q.talepEt(hisse, amount, poolBps, "Nvidia Kedi", "NVCAT", enAz);
    }

    function iadeAl(LaunchQueue q, uint256 id) external { q.iadeAl(id); }
}

/// The operator. Separate for the same reason: the point of `karsila` is
/// that the operator is reimbursed and never custodian, which is only
/// visible if its balance is its own.
contract Operator {
    function karsila(LaunchQueue q, MockERC20 sarmal, uint256 id, uint256 teminat)
        external
        returns (address, address)
    {
        sarmal.approve(address(q), type(uint256).max);
        return q.karsila(id, teminat);
    }
}

/// @notice The customer-facing path: USDC in, meme token out, and the one
///         place where somebody has to be trusted.
///
/// Arc has no general message bridge — checked, not assumed — so a
/// contract on Arc cannot buy a tokenized share on Robinhood Chain by
/// itself. An operator carries the money across. What these tests are for
/// is the boundary of that trust: that the operator is reimbursed rather
/// than entrusted, and that a customer whom nobody serves can walk away
/// with their money without asking anyone.
contract TestQueue {
    bytes32 constant NVDA = bytes32("NVDA");

    /// What the operator delivers: a quantity of wrapped shares, eighteen
    /// decimals. Deliberately unrelated to the USDC figure — the operator
    /// bought what it bought, and nothing downstream may assume the two
    /// numbers match.
    uint256 constant TESLIM = 0.8 ether;
    /* Below TESLIM, so the normal path is unaffected; the under-delivery
       case sets its own floor above what the operator sends. */
    uint256 constant TABAN = 0.5 ether;
    /// Every launch opens here, whatever is behind it: $1,500 for the
    /// whole supply, in six-decimal USDC.
    uint256 constant ACILIS = 1500 * 1e6;

    address constant DEV = address(0xDEAD);
    address constant PROTO = address(0xBEEF);

    struct Kurulum {
        MockUSDC6 usdc;
        MockERC20 sarmal;
        Launchpad lp;
        LaunchQueue q;
        Musteri m;
        Operator o;
        address gov;
    }

    function _kur(IPoolManager pm, uint64 sure, uint256 musteriUsdc)
        internal
        returns (Kurulum memory k)
    {
        return _kur(pm, sure, musteriUsdc, true);
    }

    /// `muaf` decides which of the two contracts charges the entry fee.
    /// Both cases have to work, because the launchpad can only ever waive
    /// one queue address and that waiver has already been spent.
    function _kur(IPoolManager pm, uint64 sure, uint256 musteriUsdc, bool muaf)
        internal
        returns (Kurulum memory k)
    {
        /* Six decimals for the money and eighteen for the share, as
           deployed. A mock that counts the way the chain does is the only
           kind worth having. */
        k.usdc = new MockUSDC6(1_000_000 * 1e6, address(this));
        k.sarmal = new MockERC20(1_000_000 ether, address(this));
        /* The queue delivers the wrapped share as collateral, and launch()
           now requires collateral == quote, so the quote here is the
           wrapped share. In production that coupling is exactly why the
           queue cannot be used with this launchpad — recorded rather than
           papered over. The queue mechanics under test (deadline, refund,
           relisting, floor) are unaffected by which asset it is. */
        k.lp = new Launchpad(pm, IHooks(address(0)), IERC20(address(k.sarmal)), 0, DEV, PROTO);
        k.gov = address(this); // this contract plays governance here
        k.m = new Musteri();
        k.o = new Operator();
        /* Seeded at construction, the way the real deployment is. The
           first version left this empty and reachable only by proposal,
           which meant no stock could be listed for seven days. */
        bytes32[] memory t = new bytes32[](1);
        address[] memory w = new address[](1);
        t[0] = NVDA; w[0] = address(k.sarmal);
        k.q = new LaunchQueue(
            IERC20Q(address(k.usdc)), ILaunchpadQ(address(k.lp)),
            address(k.o), k.gov, DEV, PROTO, sure, t, w
        );
        // Without this the launchpad charges its own 2% on top of the
        // queue`s, which is the defect this test found. With it, the queue
        // charges and the launchpad does not. Exactly one of the two.
        if (muaf) k.lp.setQueue(address(k.q));

        k.usdc.transfer(address(k.m), musteriUsdc);
        k.sarmal.transfer(address(k.o), 10_000 ether); // the operator's float
    }

    struct Sonuc {
        uint256 id;
        uint256 kuyruktakiUsdc;      // held against the open request
        uint256 devAldi;
        uint256 protoAldi;
        uint256 musteriKalanUsdc;
        address token;
        uint256 musteriToken;        // the meme tokens the customer ends up with
        uint256 operatorUsdc;        // the reimbursement
        uint256 operatorSarmal;      // float spent
        uint256 odulUsdc;            // holder slice, once a launch exists
        uint256 kasaTeminat;
        uint256 tabanFiyat;
        uint256 kuyruktaKalan;        // must be zero: nothing stranded
    }

    /// The whole path, once, with the pool manager that is actually on Arc.
    function runTamYol(IPoolManager pm, uint256 usdcAmount, uint16 poolBps)
        external
        returns (Sonuc memory s)
    {
        Kurulum memory k = _kur(pm, 30 minutes, usdcAmount * 2);

        s.id = k.m.talepEt(k.q, k.usdc, NVDA, usdcAmount, poolBps, TABAN);
        s.kuyruktakiUsdc = k.usdc.balanceOf(address(k.q));
        s.devAldi = k.usdc.balanceOf(DEV);
        s.protoAldi = k.usdc.balanceOf(PROTO);
        s.musteriKalanUsdc = k.usdc.balanceOf(address(k.m));

        uint256 fee = (usdcAmount * k.q.ucretPpm()) / 1_000_000;
        uint256 net = usdcAmount - fee;

        address vault;
        (s.token, vault) = k.o.karsila(k.q, k.sarmal, s.id, TESLIM);

        s.musteriToken = LaunchToken(s.token).balanceOf(address(k.m));
        s.operatorUsdc = k.usdc.balanceOf(address(k.o));
        s.operatorSarmal = 10_000 ether - k.sarmal.balanceOf(address(k.o));
        s.kasaTeminat = k.sarmal.balanceOf(vault);
        s.tabanFiyat = CollateralVault(vault).floorPrice();
        s.kuyruktaKalan = k.usdc.balanceOf(address(k.q)) + k.sarmal.balanceOf(address(k.q));

        /* The holder slice should have reached the launch's reward
           contract. It is found by elimination: everything that left the
           queue went somewhere, and this is the only destination left. */
        s.odulUsdc = fee - s.devAldi - s.protoAldi;
    }

    struct MuafSonuc {
        uint256 kuyrukUcreti;      // what the queue took   -> must be 0
        uint256 musteriKalanUsdc;
        uint256 kasaTeminat;       // 98% of what was delivered
        uint256 launchpadUcreti;   // 2%, across the three sinks
        uint256 teslim;            // what the operator delivered
        uint256 musteriToken;
        uint256 operatorUsdc;      // the full reimbursement
        uint256 kuyruktaKalan;
    }

    /// The queue that is NOT the launchpad's waived one — which is what the
    /// replacement queue will be, since setQueue is one-shot and spent.
    ///
    /// The fee then belongs to the launchpad and arrives in the collateral
    /// instead of in USDC. What must not change is its size: 2% of the
    /// deposit, once, split 30/30/40. If both contracts charged, a customer
    /// would pay 3.96%; if neither did, the project would work for free.
    function runMuafDegil(IPoolManager pm, uint256 usdcAmount, uint16 poolBps)
        external
        returns (MuafSonuc memory s)
    {
        Kurulum memory k = _kur(pm, 30 minutes, usdcAmount * 2, false);

        uint256 id = k.m.talepEt(k.q, k.usdc, NVDA, usdcAmount, poolBps, TABAN);

        s.kuyrukUcreti = k.usdc.balanceOf(DEV) + k.usdc.balanceOf(PROTO);
        s.musteriKalanUsdc = k.usdc.balanceOf(address(k.m));

        s.teslim = TESLIM;
        address vault;
        address token;
        (token, vault) = k.o.karsila(k.q, k.sarmal, id, TESLIM);

        s.kasaTeminat = k.sarmal.balanceOf(vault);
        /* Whatever is not in the vault and not with the customer's pool is
           the fee; found by subtraction so the test cannot be fooled by
           reading a number the contract reports about itself. */
        s.launchpadUcreti = s.teslim - s.kasaTeminat;
        s.musteriToken = LaunchToken(token).balanceOf(address(k.m));
        s.operatorUsdc = k.usdc.balanceOf(address(k.o));
        s.kuyruktaKalan = k.usdc.balanceOf(address(k.q)) + k.sarmal.balanceOf(address(k.q));
    }

    /// Nobody delivers. The customer must be able to leave, alone.
    function runIade(IPoolManager pm, uint256 usdcAmount)
        external
        returns (bool erkenRed, uint256 geriAlinan, uint256 beklenen, uint8 durum)
    {
        /* Zero deadline: the window is already shut, which is the only way
           to reach the far side of it inside one call. */
        Kurulum memory k = _kur(pm, 0, usdcAmount * 2);
        uint256 id = k.m.talepEt(k.q, k.usdc, NVDA, usdcAmount, 4000, TABAN);

        uint256 once = k.usdc.balanceOf(address(k.m));
        k.m.iadeAl(k.q, id);
        geriAlinan = k.usdc.balanceOf(address(k.m)) - once;

        uint256 fee = (usdcAmount * k.q.ucretPpm()) / 1_000_000;
        uint256 h = (fee * k.q.HOLDER_SHARE_BPS()) / 10000;
        /* Net plus the holder slice: that slice was set aside for a launch
           that never happened, so keeping it would be charging for work
           not done. */
        beklenen = usdcAmount - fee + h;

        LaunchQueue.Durum d = k.q.durumu(id);
        durum = uint8(d);

        /* And a second refund must not pay twice. */
        try k.m.iadeAl(k.q, id) { erkenRed = false; }
        catch { erkenRed = true; }
    }

    /// The refund is not available while the window is still open.
    function runErkenIadeRed(IPoolManager pm) external returns (bool reddedildi) {
        Kurulum memory k = _kur(pm, 30 minutes, 1000 * 1e6);
        uint256 id = k.m.talepEt(k.q, k.usdc, NVDA, 200 * 1e6, 4000, TABAN);
        try k.m.iadeAl(k.q, id) { reddedildi = false; }
        catch { reddedildi = true; }
    }

    /// Who may do what.
    function runYetkiler(IPoolManager pm)
        external
        returns (
            bool yabanciKarsilayamaz,
            bool yabanciHisseEkleyemez,
            bool bilinmeyenHisseRed,
            bool araligiAsanRed,
            bool teminatsizRed
        )
    {
        Kurulum memory k = _kur(pm, 30 minutes, 5000 * 1e6);
        uint256 id = k.m.talepEt(k.q, k.usdc, NVDA, 200 * 1e6, 4000, TABAN);

        /* This contract is not the operator. */
        try k.q.karsila(id, 0.5 ether) { yabanciKarsilayamaz = false; }
        catch { yabanciKarsilayamaz = true; }

        /* The operator is not governance. */
        try Musteri(address(k.o)).talepEt(k.q, k.usdc, bytes32("FAKE"), 200 * 1e6, 4000, TABAN) {
            bilinmeyenHisseRed = false;
        } catch { bilinmeyenHisseRed = true; }

        OlmayanYonetisim y = new OlmayanYonetisim();
        try y.ekle(k.q, bytes32("XXXX"), address(k.sarmal)) { yabanciHisseEkleyemez = false; }
        catch { yabanciHisseEkleyemez = true; }

        /* Above the launchpad's own maximum. The queue reads that limit
           from the launchpad rather than keeping a copy, so the two cannot
           drift apart. */
        try k.m.talepEt(k.q, k.usdc, NVDA, 4000 * 1e6, 4000, TABAN) { araligiAsanRed = false; }
        catch { araligiAsanRed = true; }

        /* Delivering nothing is not delivering. */
        try k.o.karsila(k.q, k.sarmal, id, 0) { teminatsizRed = false; }
        catch { teminatsizRed = true; }
    }
    /// The customer must be able to leave when their asset is delisted.
    ///
    /// Pinning the asset keeps governance from substituting what is owed,
    /// but it also means the request survives a delisting: karsila reads
    /// the pinned address and never consults the listing. Honouring the
    /// agreement is right; making the customer sit out the full deadline
    /// while their asset is being removed is not. Raised in review after
    /// the pinning fix.
    function runDelistIade(IPoolManager pm)
        external
        returns (bool normaldeErken, bool delistSonrasiGecti, uint256 geriAlinan)
    {
        Kurulum memory k = _kur(pm, 30 minutes, 5000 * 1e6);

        /* Nothing changed: leaving early is still refused, so the pass
           below is the delisting and not a hole in the deadline. */
        uint256 a1 = k.m.talepEt(k.q, k.usdc, NVDA, 200 * 1e6, 4000, TABAN);
        try k.m.iadeAl(k.q, a1) { normaldeErken = false; }
        catch { normaldeErken = true; }

        /* Now governance removes the listing under a paid request. */
        uint256 a2 = k.m.talepEt(k.q, k.usdc, NVDA, 200 * 1e6, 4000, TABAN);
        uint256 once = k.usdc.balanceOf(address(k.m));
        LaunchQueue(k.q).hisseKaldir(NVDA);
        try k.m.iadeAl(k.q, a2) { delistSonrasiGecti = true; }
        catch { delistSonrasiGecti = false; }
        geriAlinan = k.usdc.balanceOf(address(k.m)) - once;
    }

    /// Governance takes the escape back by relisting the original asset.
    ///
    /// The first version checked the listing live, so pointing the ticker
    /// back at the pinned address closed the exit again — handing the
    /// party the escape protects against the power to withdraw it. The
    /// flag is sticky now, and this is what proves it: the customer never
    /// calls iadeAl while the mismatch is visible, only after it has been
    /// put back.
    function runKacisGeriAlinamaz(IPoolManager pm)
        external
        returns (bool cikabildi, uint256 geriAlinan)
    {
        Kurulum memory k = _kur(pm, 30 minutes, 5000 * 1e6);
        uint256 id = k.m.talepEt(k.q, k.usdc, NVDA, 200 * 1e6, 4000, TABAN);

        /* Away, then straight back, with NOBODY acting in between. A live
           check sees a matching listing by the time the customer looks,
           which is exactly how the first attempt at this failed. */
        MockERC20 baska = new MockERC20(1_000 ether, address(this));
        LaunchQueue(k.q).hisseEkle(NVDA, address(baska));
        LaunchQueue(k.q).hisseEkle(NVDA, address(k.sarmal));

        uint256 once = k.usdc.balanceOf(address(k.m));
        try k.m.iadeAl(k.q, id) { cikabildi = true; } catch { cikabildi = false; }
        geriAlinan = k.usdc.balanceOf(address(k.m)) - once;
    }

    /// Governance relists the ticker between the payment and the delivery.
    ///
    /// The floor fix stored a NUMBER but karsila still looked the asset up
    /// again at delivery time, so a relisting would have left the customer
    /// owed the same quantity of something else entirely. Caught in review
    /// after the first fix, which is the honest order to record it in.
    ///
    /// The asset is pinned when they pay. Delivery pulls that one, and the
    /// new listing is irrelevant to a request that predates it.
    function runYenidenListeleme(IPoolManager pm)
        external
        returns (bool eskiVarlikCekildi, uint256 eskiAzaldi, uint256 yeniAzaldi)
    {
        Kurulum memory k = _kur(pm, 30 minutes, 5000 * 1e6);
        uint256 id = k.m.talepEt(k.q, k.usdc, NVDA, 200 * 1e6, 4000, TABAN);

        /* Governance repoints the ticker at a different token, after the
           customer has paid. */
        MockERC20 yeni = new MockERC20(1_000_000 ether, address(this));
        yeni.transfer(address(k.o), 100 ether);
        vm_gov(k, NVDA, address(yeni));

        uint256 eskiOnce = k.sarmal.balanceOf(address(k.o));
        uint256 yeniOnce = yeni.balanceOf(address(k.o));

        /* The operator approves BOTH, so whichever the queue reaches for
           will succeed — the test is which one it reaches for, not whether
           an approval is missing. */
        k.o.karsila(k.q, k.sarmal, id, TESLIM);

        eskiAzaldi = eskiOnce - k.sarmal.balanceOf(address(k.o));
        yeniAzaldi = yeniOnce - yeni.balanceOf(address(k.o));
        eskiVarlikCekildi = (eskiAzaldi == TESLIM && yeniAzaldi == 0);
    }

    /// Governance is a plain address in the queue, so relisting is a call
    /// from it. Kept as a helper so the test above reads as what it is.
    function vm_gov(Kurulum memory k, bytes32 hisse, address sarmal) internal {
        LaunchQueue(k.q).hisseEkle(hisse, sarmal);
    }

    /// The operator delivers less than the customer agreed to.
    ///
    /// This is the one that was missing. karsila checked only that
    /// something arrived, and then reimbursed the operator the customer's
    /// full payment — so delivering one wei against a thousand dollars was
    /// profitable and passed every check. The floor travels with the
    /// request now, and this proves it binds.
    function runAzTeminat(IPoolManager pm)
        external
        returns (bool azReddedildi, bool tamGecti, bool sifirTabanReddedildi)
    {
        Kurulum memory k = _kur(pm, 30 minutes, 5000 * 1e6);
        /* A floor ABOVE what the operator will deliver. */
        uint256 id = k.m.talepEt(k.q, k.usdc, NVDA, 200 * 1e6, 4000, TESLIM * 2);

        try k.o.karsila(k.q, k.sarmal, id, TESLIM) { azReddedildi = false; }
        catch { azReddedildi = true; }

        /* And the same request settles the moment the floor is met, so the
           refusal above is the floor and not something else. */
        try k.o.karsila(k.q, k.sarmal, id, TESLIM * 2) { tamGecti = true; }
        catch { tamGecti = false; }

        /* A request with no floor is refused outright: defaulting it would
           be choosing on the customer's behalf. */
        /* 4000, not 3000: with the pool share fixed the old value would
           make this revert for the WRONG reason and the test would pass
           while proving nothing about the zero floor. */
        try k.m.talepEt(k.q, k.usdc, NVDA, 200 * 1e6, 4000, 0) { sifirTabanReddedildi = false; }
        catch { sifirTabanReddedildi = true; }
    }
}

contract OlmayanYonetisim {
    function ekle(LaunchQueue q, bytes32 h, address s) external { q.hisseEkle(h, s); }

}
