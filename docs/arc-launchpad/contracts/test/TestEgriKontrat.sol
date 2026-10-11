// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Egri, IEgriToken, IHavuzAcici} from "../Egri.sol";
import {MockUSDC6} from "./TestOndalik.sol";

/// An 18-decimal token with a burn, which is all the curve needs.
contract EgriMockToken {
    string public name = "Mock";
    string public symbol = "MCK";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint256 supply, address to) {
        totalSupply = supply;
        balanceOf[to] = supply;
    }
    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v; balanceOf[to] += v; return true;
    }
    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v; return true;
    }
    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        balanceOf[f] -= v; balanceOf[t] += v; return true;
    }
    function burn(uint256 v) external {
        balanceOf[msg.sender] -= v; totalSupply -= v;
    }
}

/// Records what it was handed, so graduation can be checked rather than
/// trusted. The real one opens a locked Uniswap position.
contract MockHavuzAcici is IHavuzAcici {
    uint256 public quoteAlinan;
    uint256 public tokenAlinan;
    uint256 public cagriSayisi;
    function ac(uint256 q, uint256 t) external {
        quoteAlinan = q; tokenAlinan = t; cagriSayisi++;
    }
}

/// A participant, because everything follows msg.sender.
contract EgriAlici {
    function al(Egri e, MockUSDC6 q, uint256 miktar, uint256 enAz) external returns (uint256) {
        q.approve(address(e), type(uint256).max);
        return e.al(miktar, enAz);
    }
    function sat(Egri e, EgriMockToken t, uint256 miktar, uint256 enAz) external returns (uint256) {
        t.approve(address(e), type(uint256).max);
        return e.sat(miktar, enAz);
    }
}

/// @title TestEgriKontrat
/// @notice The curve's money math, checked before anything is deployed.
///
/// The last token died because arithmetic was assumed instead of measured.
/// Two things must hold here: the curve can never pay out money it did not
/// take in, and 6-decimal quote against an 18-decimal token produces the
/// price the design claims. Both are checked at the boundaries rather than
/// at a comfortable point in the middle.
contract TestEgriKontrat {
    uint256 constant ARZ = 1_000_000_000 ether;
    uint256 constant KURUCU = 100_000_000 ether;
    uint256 constant EGRI_TOKEN = ARZ - KURUCU;          // 900,000,000
    uint256 constant FANTOM = 1350 * 1e6;                // $1,350, 6 decimals
    uint256 constant ESIK = 2700 * 1e6;                  // $2,700
    uint256 constant BIR_USDC = 1e6;
    address constant KURUCU_ADRES = address(uint160(0xB07));
    address constant STAKE_ADRES = address(uint160(0x57A1));

    struct Kurulum {
        Egri e;
        MockUSDC6 q;
        EgriMockToken t;
        MockHavuzAcici h;
    }

    function _kur(uint256 paraMiktari) internal returns (Kurulum memory k) {
        return _kurSnipe(paraMiktari, 0);
    }

    function _kurSnipe(uint256 paraMiktari, uint64 snipeSuresi) internal returns (Kurulum memory k) {
        k.q = new MockUSDC6(paraMiktari, address(this));
        k.t = new EgriMockToken(ARZ, address(this));
        k.h = new MockHavuzAcici();
        k.e = new Egri(IEgriToken(address(k.t)), IEgriToken(address(k.q)),
                       FANTOM, EGRI_TOKEN, ESIK, IHavuzAcici(address(k.h)), snipeSuresi,
                       KURUCU_ADRES, STAKE_ADRES);
        /* The curve is funded with exactly its notional token reserve. */
        k.t.transfer(address(k.e), EGRI_TOKEN);
    }

    function _alici(Kurulum memory k, uint256 para) internal returns (EgriAlici a) {
        a = new EgriAlici();
        k.q.transfer(address(a), para);
    }

    /* ---------------------------------------------------------------- */

    struct Acilis {
        uint256 baslangicX;
        uint256 baslangicY;
        uint256 birDolarToken;
        uint256 egriQuoteBakiyesi;
        uint256 toplananIlk;
        uint256 mcapMikro;
    }

    /// The opening price is FANTOM/SANAL_TOKEN with nobody having deposited
    /// anything. That is the whole point: no capital from us.
    function runAcilis() external returns (Acilis memory o) {
        Kurulum memory k = _kur(100_000 * BIR_USDC);
        o.baslangicX = k.e.x();
        o.baslangicY = k.e.y();
        o.birDolarToken = k.e.alimKotasi(BIR_USDC);
        o.egriQuoteBakiyesi = k.q.balanceOf(address(k.e));
        o.toplananIlk = k.e.toplanan();
        /* mcap = (x / y) * ARZ, scaled to millionths so no fractional price
           is ever materialised. */
        o.mcapMikro = (k.e.x() * ARZ) / k.e.y();
    }

    struct Denge {
        uint256 odenen;
        uint256 alinan;
        uint256 geriAlinan;
        uint256 toplananSonra;
        uint256 egriQuote;
        uint256 dokumAlinan;
        uint256 dokumSonrasiToplanan;
        uint256 dokumSonrasiQuote;
        bool fantomKorundu;
    }

    /// A round trip must never return more than it cost, and the curve must
    /// never hold less quote than it owes.
    function runGidisDonus(uint256 miktar) external returns (Denge memory d) {
        Kurulum memory k = _kur(1_000_000 * BIR_USDC);
        EgriAlici a = _alici(k, miktar * 2);

        d.odenen = miktar;
        d.alinan = a.al(k.e, k.q, miktar, 0);
        d.geriAlinan = a.sat(k.e, k.t, d.alinan, 0);
        d.toplananSonra = k.e.toplanan();
        d.egriQuote = k.q.balanceOf(address(k.e));

        /* Dumping far more than the curve ever sold must not drain more
           than it holds. It is allowed to take everything collected — that
           is what a two-way curve does — but not a wei beyond it. */
        k.t.transfer(address(a), 1_000_000 ether);
        uint256 oncekiQuote = k.q.balanceOf(address(k.e));
        d.dokumAlinan = a.sat(k.e, k.t, 1_000_000 ether, 0);
        d.dokumSonrasiToplanan = k.e.toplanan();
        d.dokumSonrasiQuote = k.q.balanceOf(address(k.e));
        d.fantomKorundu = d.dokumAlinan <= oncekiQuote;
    }

    struct Mezuniyet {
        uint256 toplanan;
        uint256 vergi;
        bool esikAltiRed;
        uint256 havuzQuote;
        uint256 havuzToken;
        uint256 yakilan;
        uint256 kapanisPay;        // FANTOM + toplanan
        uint256 kapanisBolen;      // tokens still in the curve
        uint256 arzSonra;
        bool ciftMezunRed;
        bool mezunSonrasiAlimRed;
        uint256 aciciCagri;
    }

    /// Graduation: the pool opens at the price the curve finished at, the
    /// excess burns, and it happens exactly once.
    function runMezuniyet() external returns (Mezuniyet memory m) {
        Kurulum memory k = _kur(1_000_000 * BIR_USDC);
        EgriAlici a = _alici(k, 10_000 * BIR_USDC);

        /* Below the threshold nothing may be committed permanently — the
           repair for the 300,000,000 that was locked before anyone wanted
           the token. */
        a.al(k.e, k.q, 500 * BIR_USDC, 0);
        try k.e.mezunEt() { m.esikAltiRed = false; } catch { m.esikAltiRed = true; }

        a.al(k.e, k.q, 2_300 * BIR_USDC, 0);
        m.toplanan = k.e.toplanan();
        m.vergi = k.e.vergi();
        m.kapanisPay = k.e.x();
        m.kapanisBolen = k.t.balanceOf(address(k.e));

        k.e.mezunEt();
        m.havuzQuote = k.h.quoteAlinan();
        m.havuzToken = k.h.tokenAlinan();
        m.aciciCagri = k.h.cagriSayisi();
        m.yakilan = m.kapanisBolen - m.havuzToken;
        m.arzSonra = k.t.totalSupply();

        try k.e.mezunEt() { m.ciftMezunRed = false; } catch { m.ciftMezunRed = true; }
        try a.al(k.e, k.q, BIR_USDC, 0) { m.mezunSonrasiAlimRed = false; }
        catch { m.mezunSonrasiAlimRed = true; }
    }

    struct Snipe {
        uint256 oran0;
        uint256 oran1;
        uint256 oran2;
        uint256 oran5;
        uint256 sniperToken;
        uint256 vergiBirikti;
        uint256 ayniTutarKotasi;
    }

    /// The opening seconds are priced for bots, and what a bot pays becomes
    /// pool depth at graduation rather than revenue for us.
    function runSnipe() external returns (Snipe memory s) {
        Kurulum memory k = _kurSnipe(1_000_000 * BIR_USDC, 5);
        s.oran0 = k.e.snipeOrani(0);
        s.oran1 = k.e.snipeOrani(1);
        s.oran2 = k.e.snipeOrani(2);
        s.oran5 = k.e.snipeOrani(5);

        /* Inside one call only the opening second exists, so this buy is
           taxed at the maximum. */
        EgriAlici sniper = _alici(k, 1_000 * BIR_USDC);
        s.sniperToken = sniper.al(k.e, k.q, 1_000 * BIR_USDC, 0);
        s.vergiBirikti = k.e.vergi();
        /* What the same money would get untaxed, from where the curve now
           sits — barely moved, because the taxed part never entered it. */
        s.ayniTutarKotasi = k.e.alimKotasi(1_000 * BIR_USDC);
    }

    struct Ucret {
        uint256 kurucuAlimSonrasi;
        uint256 stakeAlimSonrasi;
        uint256 kurucuSatisSonrasi;
        uint256 stakeSatisSonrasi;
        uint256 vergiBirikti;
        uint256 egriBakiyesi;
        uint256 toplanan;
        uint256 aliciEline;
        uint256 saticiEline;
    }

    /// The founder's slice, on both sides of the trade, without anybody
    /// calling a claim. 1% total: 0.30 founder, 0.30 stakers, 0.40 stays
    /// and becomes pool depth.
    function runUcret() external returns (Ucret memory u) {
        Kurulum memory k = _kur(1_000_000 * BIR_USDC);
        EgriAlici a = _alici(k, 10_000 * BIR_USDC);

        uint256 alindi = a.al(k.e, k.q, 1_000 * BIR_USDC, 0);
        u.aliciEline = alindi;
        u.kurucuAlimSonrasi = k.q.balanceOf(KURUCU_ADRES);
        u.stakeAlimSonrasi = k.q.balanceOf(STAKE_ADRES);

        u.saticiEline = a.sat(k.e, k.t, alindi / 2, 0);
        u.kurucuSatisSonrasi = k.q.balanceOf(KURUCU_ADRES);
        u.stakeSatisSonrasi = k.q.balanceOf(STAKE_ADRES);

        u.vergiBirikti = k.e.vergi();
        u.egriBakiyesi = k.q.balanceOf(address(k.e));
        u.toplanan = k.e.toplanan();
    }

    struct Tukenme {
        uint256 adimlar;
        uint256 sonToplanan;
        uint256 sonEgriBakiyesi;
        bool degismezTutuldu;
        bool fiyatHepYukseldi;
    }

    /// Thirty buys and sells against a moving price. The curve must never
    /// owe more quote than it holds, at any step.
    function runTukenme() external returns (Tukenme memory t) {
        Kurulum memory k = _kur(10_000_000 * BIR_USDC);
        EgriAlici a = _alici(k, 5_000_000 * BIR_USDC);
        t.degismezTutuldu = true;
        t.fiyatHepYukseldi = true;
        uint256 oncekiX = k.e.x();

        for (uint256 i = 0; i < 30; i++) {
            uint256 miktar = (i + 1) * 50 * BIR_USDC;
            uint256 alindi = a.al(k.e, k.q, miktar, 0);
            if (alindi > 3) a.sat(k.e, k.t, alindi / 3, 0);
            t.adimlar++;
            uint256 tp = k.e.toplanan();
            if (k.q.balanceOf(address(k.e)) < tp) t.degismezTutuldu = false;
            if (k.e.x() <= oncekiX) t.fiyatHepYukseldi = false;
            oncekiX = k.e.x();
        }
        t.sonToplanan = k.e.toplanan();
        t.sonEgriBakiyesi = k.q.balanceOf(address(k.e));
    }
}
