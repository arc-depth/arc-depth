// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { GenesisCekirdek } from "@genesis/GenesisCekirdek.sol";
import { GenesisDil, IGenesisCekirdekD } from "@genesis/GenesisDil.sol";
import { GenesisHesap, IERC20H } from "@genesis/GenesisHesap.sol";
import { AtlasAbonelik, IERC20A } from "@genesis/AtlasAbonelik.sol";

interface IERC20T {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// PULSE GENESIS on a fork of Base: the real LayerZero endpoint, real USDC.
/// A message from the Arbitrum copy is delivered the way the endpoint
/// delivers it (lzReceive from the endpoint, sender = the peer).
contract GenesisTest is Test {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    uint32 constant ARB = 30110;
    address ajan = address(0xA9E);
    address kotu = address(0xBAD);
    address constant KURUCU = 0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0;
    address constant BUYUME = address(0xB0E);
    GenesisCekirdek c;
    GenesisDil d;

    function setUp() public {
        vm.createSelectFork("base");
        c = new GenesisCekirdek(ajan);
        d = new GenesisDil(IGenesisCekirdekD(address(c)));
    }

    function _metin(string memory s) internal pure returns (bytes memory) { return bytes(s); }

    /* ---- identity and ownership ------------------------------------ */

    function test_sahipsiz_ve_esler() public view {
        assertEq(c.owner(), address(0), "sahip yok");
        assertEq(c.peers(ARB), bytes32(uint256(uint160(address(c)))), "esi kendisi");
        assertEq(c.peers(30184), bytes32(0), "kendine es degil");
        assertEq(c.KORKULUKLAR(), keccak256(bytes(c.KORKULUK_METNI())));
        assertTrue(c.ajan(ajan));
    }

    /* ---- memory ------------------------------------------------------ */

    function test_yazma_kurallari() public {
        bytes memory v = _metin("Arc uses USDC as its gas token.");
        vm.prank(kotu);
        vm.expectRevert(GenesisCekirdek.SadeceAjan.selector);
        c.yaz(2, 0, keccak256(v), v);

        vm.startPrank(ajan);
        vm.expectRevert(GenesisCekirdek.HashTutmuyor.selector);
        c.yaz(2, 0, bytes32(uint256(1)), v);
        /* conversations are hash-only */
        vm.expectRevert(GenesisCekirdek.KotuSaklama.selector);
        c.yaz(1, 0, keccak256(v), v);
        c.yaz(1, 1, keccak256(v), "");
        c.yaz(2, 0, keccak256(v), v);
        vm.stopPrank();

        assertEq(c.kayitSayisi(30184), 2);
        (GenesisCekirdek.Kayit memory k, bytes memory g) = c.kayitVeri(30184, 1);
        assertEq(g, v, "zincirde saklanan veri");
        (, bytes memory g0) = c.kayitVeri(30184, 0);
        assertEq(g0.length, 0, "konusma yalniz hash");
        assertEq(k.zincirHash, c.bas(30184));
    }

    function test_oneri_kapisi() public {
        bytes memory v = _metin("Redemption is pro rata, at any time.");
        vm.prank(kotu);
        uint256 id = c.oner(2, v);
        assertEq(c.kayitSayisi(30184), 0, "oneri hafiza degil");
        vm.prank(ajan);
        c.kabul(id);
        assertEq(c.kayitSayisi(30184), 1);
        vm.prank(kotu);
        uint256 id2 = c.oner(2, _metin("FTHM supply is infinite."));
        vm.prank(ajan);
        c.ret(id2, "yanlis");
        assertEq(c.kayitSayisi(30184), 1, "reddedilen girmez");
    }

    /* ---- synchronisation -------------------------------------------- */

    function _arbdan(uint64 ilk, GenesisCekirdek.Tasima[] memory t) internal {
        bytes memory m = abi.encode(ARB, ilk, t);
        vm.prank(address(c.endpoint()));
        c.lzReceive(Origin(ARB, bytes32(uint256(uint160(address(c)))), 1), bytes32(uint256(7)), m, address(0), "");
    }

    function test_senkron_ve_kok() public {
        GenesisCekirdek.Tasima[] memory t = new GenesisCekirdek.Tasima[](2);
        t[0] = GenesisCekirdek.Tasima(2, 0, ajan, 1000, keccak256("a"), "a");
        t[1] = GenesisCekirdek.Tasima(9, 1, ajan, 1001, keccak256("b"), "");
        _arbdan(0, t);
        assertEq(c.kayitSayisi(ARB), 2);
        bytes32 bas1 = c.bas(ARB);
        /* the same hash chain an Arbitrum copy computes */
        bytes32 z0 = keccak256(abi.encode(bytes32(0), ARB, uint64(0), uint8(2), uint8(0), ajan, uint64(1000), keccak256("a")));
        bytes32 z1 = keccak256(abi.encode(z0, ARB, uint64(1), uint8(9), uint8(1), ajan, uint64(1001), keccak256("b")));
        assertEq(bas1, z1, "zincir hash'i");

        /* a duplicate is skipped, a gap is reported, not a revert */
        bytes32 kok = c.hafizaKoku();
        _arbdan(0, t);
        assertEq(c.kayitSayisi(ARB), 2);
        _arbdan(5, t);
        assertEq(c.kayitSayisi(ARB), 2);
        assertEq(c.hafizaKoku(), kok);

        /* a mismatched payload stops the batch */
        GenesisCekirdek.Tasima[] memory bozuk = new GenesisCekirdek.Tasima[](1);
        bozuk[0] = GenesisCekirdek.Tasima(2, 0, ajan, 1002, keccak256("c"), "x");
        _arbdan(2, bozuk);
        assertEq(c.kayitSayisi(ARB), 2, "bozuk veri girmez");
    }

    function test_yabanci_gonderen_reddedilir() public {
        GenesisCekirdek.Tasima[] memory t = new GenesisCekirdek.Tasima[](1);
        t[0] = GenesisCekirdek.Tasima(2, 0, ajan, 1, keccak256("a"), "a");
        vm.prank(address(c.endpoint()));
        vm.expectRevert();
        c.lzReceive(Origin(ARB, bytes32(uint256(uint160(kotu))), 1), bytes32(0), abi.encode(ARB, uint64(0), t), address(0), "");
    }

    function test_yay_ucreti_ve_gonderim() public {
        bytes memory v = _metin("hello");
        vm.prank(ajan);
        c.yaz(2, 0, keccak256(v), v);
        bytes memory sec = hex"00030100110100000000000000000000000000030d40";   // lzReceive 200k
        uint256 f = c.yayUcreti(ARB, 30184, 0, 1, sec).nativeFee;
        assertGt(f, 0, "LayerZero ucret veriyor");
        vm.deal(address(this), 1 ether);
        c.yay{value: f}(ARB, 30184, 0, 1, sec);
    }

    /* ---- time locks --------------------------------------------------- */

    function test_ajan_zaman_kilidi() public {
        uint256 t0 = block.timestamp;
        vm.prank(ajan);
        c.ajanOner(kotu, true);
        bytes32 id = c.bas(30184);
        vm.expectRevert(GenesisCekirdek.Erken.selector);
        c.ajanUygula(id);
        vm.warp(t0 + 7 days);
        c.ajanUygula(id);
        assertTrue(c.ajan(kotu));
        /* the last agent cannot be removed */
        vm.prank(ajan);
        c.ajanOner(kotu, false);
        bytes32 id2 = c.bas(30184);
        vm.prank(kotu);
        c.ajanOner(ajan, false);
        bytes32 id3 = c.bas(30184);
        vm.warp(t0 + 14 days);
        c.ajanUygula(id2);
        vm.expectRevert(GenesisCekirdek.SonAjan.selector);
        c.ajanUygula(id3);
    }

    function test_modul_ve_model() public {
        vm.startPrank(ajan);
        c.modulOner("ogrenme-dongusu", keccak256("kod"), keccak256("test"), address(0), false);
        bytes32 rutin = c.bas(30184);
        c.modulOner("kritik", keccak256("kod2"), keccak256("test2"), address(0), true);
        bytes32 kritik = c.bas(30184);
        c.modelKaydet(GenesisCekirdek.Model("GENESIS-0", bytes32(0), bytes32(0), keccak256("trigram"), bytes32(0), 1, address(d), ""));
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
        c.modulEtkinlestir(rutin);
        vm.expectRevert(GenesisCekirdek.Erken.selector);
        c.modulEtkinlestir(kritik);
        vm.prank(ajan);
        c.modulIptal(kritik);
        vm.warp(block.timestamp + 7 days);
        vm.expectRevert(GenesisCekirdek.Bilinmiyor.selector);
        c.modulEtkinlestir(kritik);
        assertEq(c.model("GENESIS-0").adres, address(d));
        assertEq(c.modelSayisi(), 1);
    }

    /* ---- the on-chain language model --------------------------------- */

    function test_dil_ogrenir_ve_uretir() public {
        bytes memory korpus = _metin(
            "ARC PULSE is a memecoin launchpad on Arc. Every token gets a collateral vault. "
            "Any holder can redeem against the vault at any time. Every trade pays a tax into the vault. "
            "Arc uses USDC as gas. ARC PULSE runs on many chains. Every token gets a collateral vault.");
        string memory test = "Every token gets a collateral vault.";
        uint256 once = d.kayip(bytes(test));
        assertEq(once, 8000, "ogrenmeden once tekduze: 8 bit/bayt");

        vm.prank(ajan);
        c.yaz(2, 0, keccak256(korpus), korpus);
        /* learned in chunks, by anyone */
        bool tamam;
        while (!tamam) tamam = d.ogren(30184, 0, 100);
        vm.expectRevert(GenesisDil.ZatenOgrenildi.selector);
        d.ogren(30184, 0, 100);

        uint256 sonra = d.kayip(bytes(test));
        emit log_named_uint("kayip once (mbit/bayt)", once);
        emit log_named_uint("kayip sonra (mbit/bayt)", sonra);
        assertLt(sonra, 2000, "ogrendikten sonra kayip dortte birin altina dustu");

        bytes memory u = d.uret(bytes("Every tok"), 40, 0, false);
        emit log_named_string("uretim", string(u));
        assertEq(u, d.uret(bytes("Every tok"), 40, 0, false), "ayni girdi ayni cikti");
        assertEq(string(u), "en gets a collatery token gets a collate", "zincirde uretim (trigram, en olasi bayt)");
        bytes memory o = d.uret(bytes("ARC "), 60, 42, true);
        emit log_named_string("ornekleme", string(o));
        assertEq(o, d.uret(bytes("ARC "), 60, 42, true), "ornekleme de tohuma gore belirli");

        (uint256 ks,, bytes32 oz) = d.durum();
        assertEq(ks, 1);
        assertEq(uint256(oz), uint256(keccak256(abi.encode(c.kayit(30184, 0).zincirHash))));
    }

    function test_dil_yalniz_dogrulanmisi_ogrenir() public {
        vm.prank(ajan);
        c.yaz(9, 1, keccak256("x"), "");
        vm.expectRevert(GenesisDil.OgrenilemezTur.selector);
        d.ogren(30184, 0, 100);
        vm.prank(ajan);
        c.yaz(2, 1, keccak256("y"), "");
        vm.expectRevert(GenesisDil.ZincirdeDegil.selector);
        d.ogren(30184, 1, 0);
    }

    /* ---- the compute network ----------------------------------------- */

    function _hesap() internal returns (GenesisHesap h, address[3] memory s, address isteyen) {
        h = new GenesisHesap(IERC20H(USDC), KURUCU, BUYUME);
        s = [address(0x51), address(0x52), address(0x53)];
        isteyen = address(0x15);
        deal(USDC, isteyen, 100e6);
        vm.prank(isteyen);
        IERC20T(USDC).approve(address(h), type(uint256).max);
        for (uint256 i; i < 3; i++) {
            deal(USDC, s[i], 10e6);
            vm.startPrank(s[i]);
            IERC20T(USDC).approve(address(h), type(uint256).max);
            h.kaydol(10e6);
            vm.stopPrank();
        }
    }

    function _muhur(uint256 id, bytes32 c_, bytes32 tuz, address a) internal pure returns (bytes32) {
        return keccak256(abi.encode(id, c_, tuz, a));
    }

    function test_hesap_mutabakat_ve_ceza() public {
        (GenesisHesap h, address[3] memory s, address isteyen) = _hesap();
        uint256 kb = IERC20T(USDC).balanceOf(KURUCU);
        bytes memory girdi = "What is the gas token on Arc?";
        vm.prank(isteyen);
        uint256 id = h.isAc("GENESIS-0", keccak256(girdi), girdi, 6e6, 2, 600);
        bytes32 dogru = keccak256("USDC");
        bytes32 yanlis = keccak256("ETH");
        vm.prank(s[0]); h.taahhutEt(id, _muhur(id, dogru, "t0", s[0]));
        vm.prank(s[1]); h.taahhutEt(id, _muhur(id, dogru, "t1", s[1]));
        vm.prank(s[2]); h.taahhutEt(id, _muhur(id, yanlis, "t2", s[2]));
        /* no reveal during the commit window */
        vm.prank(s[0]);
        vm.expectRevert(GenesisHesap.Erken.selector);
        h.ac(id, dogru, "t0");
        vm.warp(block.timestamp + 301);
        /* a reveal that does not match the seal */
        vm.prank(s[2]);
        vm.expectRevert(GenesisHesap.MuhurTutmuyor.selector);
        h.ac(id, dogru, "t2");
        vm.prank(s[0]); h.ac(id, dogru, "t0");
        vm.prank(s[1]); h.ac(id, dogru, "t1");
        vm.prank(s[2]); h.ac(id, yanlis, "t2");
        h.sonuclandir(id);

        assertEq(h.isBilgisi(id).sonuc, dogru, "mutabakat");
        /* 2% fee off the 6 reward: 70% founder, 30% growth; the providers
           split the other 5.88 plus the dissenter's 1 penalty */
        assertEq(IERC20T(USDC).balanceOf(BUYUME), 0.036e6, "buyume payi");
        assertEq(IERC20T(USDC).balanceOf(s[0]), 3.44e6);
        assertEq(IERC20T(USDC).balanceOf(s[1]), 3.44e6);
        (uint256 t2,,) = h.saglayicilar(s[2]);
        assertEq(t2, 9e6, "ayrisan ceza oder");
        assertEq(IERC20T(USDC).balanceOf(KURUCU) - kb, 0.084e6, "kurucu payi");
        h.ciktiYayinla(id, "USDC");
        assertEq(h.ciktilar(id), bytes("USDC"));
        vm.expectRevert(GenesisHesap.HashTutmuyor.selector);
        h.ciktiYayinla(id, "ETH");
    }

    function test_hesap_mutabakat_yoksa_iade() public {
        (GenesisHesap h, address[3] memory s, address isteyen) = _hesap();
        uint256 k0 = IERC20T(USDC).balanceOf(KURUCU);
        vm.prank(isteyen);
        uint256 t0 = block.timestamp;
        uint256 id = h.isAc("m", keccak256("in"), "", 6e6, 2, 600);
        vm.prank(s[0]); h.taahhutEt(id, _muhur(id, keccak256("a"), "x", s[0]));
        vm.prank(s[1]); h.taahhutEt(id, _muhur(id, keccak256("b"), "y", s[1]));
        vm.prank(s[2]); h.taahhutEt(id, _muhur(id, keccak256("a"), "z", s[2]));
        vm.warp(t0 + 301);
        vm.prank(s[0]); h.ac(id, keccak256("a"), "x");
        vm.prank(s[1]); h.ac(id, keccak256("b"), "y");
        /* s[2] never reveals */
        vm.warp(t0 + 602);
        h.sonuclandir(id);
        assertEq(h.isBilgisi(id).durum, 3, "iade");
        /* reward back + penalty of the silent committer */
        assertEq(IERC20T(USDC).balanceOf(isteyen), 100e6 + 1e6);
        (uint256 t2,,) = h.saglayicilar(s[2]);
        assertEq(t2, 9e6);
        (uint256 t1,,) = h.saglayicilar(s[1]);
        assertEq(t1, 10e6, "mutabakat yoksa ayrisan cezalanmaz");
        assertEq(IERC20T(USDC).balanceOf(KURUCU), k0, "iadede ucret yok");
    }

    function test_hesap_ayrilma() public {
        (GenesisHesap h, address[3] memory s,) = _hesap();
        vm.startPrank(s[0]);
        h.ayrilmaIste();
        vm.expectRevert(GenesisHesap.Erken.selector);
        h.ayril();
        vm.warp(block.timestamp + 1 days);
        h.ayril();
        vm.stopPrank();
        assertEq(IERC20T(USDC).balanceOf(s[0]), 10e6);
    }

    /* ---- ATLAS API sales ----------------------------------------------- */

    function test_atlas_satis_ve_bolusum() public {
        address dao = address(0xDA0);
        AtlasAbonelik a = new AtlasAbonelik(IERC20A(USDC), KURUCU, BUYUME, dao);
        address musteri = address(0xC05);
        deal(USDC, musteri, 1_000e6);
        uint256 k0 = IERC20T(USDC).balanceOf(KURUCU);
        vm.startPrank(musteri);
        IERC20T(USDC).approve(address(a), type(uint256).max);
        a.satinAl(0, musteri);               // call pack, 10 dollars
        a.satinAl(1, musteri);               // monthly, 49 dollars
        vm.stopPrank();
        assertEq(IERC20T(USDC).balanceOf(KURUCU) - k0, 41.3e6, "kurucu %70");
        assertEq(IERC20T(USDC).balanceOf(BUYUME), 17.7e6, "buyume %30");
        assertEq(IERC20T(USDC).balanceOf(address(a)), 0, "sozlesmede para kalmaz");
        (uint64 c, bool abone, uint8 sv, uint64 bitis) = a.erisim(musteri);
        assertEq(c, 10_000);
        assertTrue(abone);
        assertEq(sv, 1);
        assertEq(bitis, uint64(block.timestamp) + 30 days);

        /* a running plan is extended, not restarted; enterprise raises the level */
        uint256 t0 = block.timestamp;
        vm.warp(t0 + 10 days);
        vm.prank(musteri);
        a.satinAl(2, musteri);
        (, , sv, bitis) = a.erisim(musteri);
        assertEq(sv, 2);
        assertEq(bitis, uint64(t0) + 60 days);
        /* lapsed: back to no access */
        vm.warp(t0 + 61 days);
        (, abone, sv, ) = a.erisim(musteri);
        assertFalse(abone);
        assertEq(sv, 0);

        /* prices: the DAO only */
        vm.expectRevert(AtlasAbonelik.SadeceDao.selector);
        a.paketAyarla(0, 1, 0, 1, true, "cheap");
        vm.prank(dao);
        a.paketAyarla(0, 20e6, 0, 10_000, false, "closed");
        vm.prank(musteri);
        vm.expectRevert(AtlasAbonelik.KapaliPaket.selector);
        a.satinAl(0, musteri);
    }
}
