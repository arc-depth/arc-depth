// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IHaberci, IHaberAlici, IERC20S, SepetMesaj, Adres} from "../src/arc/sepet/IHaberci.sol";
import {SepetDefteri} from "../src/arc/sepet/SepetDefteri.sol";
import {SepetKasasi} from "../src/arc/sepet/SepetKasasi.sol";
import {SepetUcu} from "../src/arc/sepet/SepetUcu.sol";
import {Jeton, SahteAg, SahteHaberci} from "./SepetYardim.sol";

/// Sends whatever it is told, from a chain, as itself: a stranger.
contract Yabanci {
    function gonder(IHaberci h, uint32 z, address hedef, bytes calldata veri) external { h.gonder(z, Adres.b32(hedef), veri, 0); }
}

contract SepetTest is Test {
    uint32 constant ARC = 1; uint32 constant BNB = 2; uint32 constant SOL = 3; uint32 constant BASE = 4; uint32 constant RH = 5;
    uint32[5] Z = [ARC, BNB, SOL, BASE, RH];

    Jeton usdc;
    SahteAg ag;
    SepetDefteri defter;
    mapping(uint32 => SahteHaberci) h;
    mapping(uint32 => SepetKasasi) kasa;
    mapping(uint32 => SepetUcu) ucu;
    Jeton[5] varlik;          // one asset per chain: WARC, WBNB, WSOL, MEME, TSLA
    address launchpad = address(0x1A0);
    address kurucu = address(0xF00D);
    address tutucu = address(0xB0B);
    address arb = address(0xA2B);
    uint256 constant ARZ = 1_000_000_000e18;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new Jeton("USDC");
        ag = new SahteAg(IERC20S(address(usdc)));
        for (uint256 i = 0; i < 5; i++) { h[Z[i]] = new SahteHaberci(Z[i], ag); ag.ekle(h[Z[i]]); }
        defter = new SepetDefteri(IHaberci(address(h[ARC])), IERC20S(address(usdc)));
        string[5] memory ad = ["WARC", "WBNB", "WSOL", "MEME", "TSLA"];
        for (uint256 i = 0; i < 5; i++) {
            uint32 z = Z[i];
            kasa[z] = new SepetKasasi(IHaberci(address(h[z])), IERC20S(address(usdc)), ARC, Adres.b32(address(defter)));
            ucu[z] = new SepetUcu(IHaberci(address(h[z])), IERC20S(address(usdc)), ARC, Adres.b32(address(defter)), launchpad);
            defter.bagla(z, Adres.b32(address(ucu[z])), Adres.b32(address(kasa[z])));
            varlik[i] = new Jeton(ad[i]);
        }
        defter.kilitle();
        // the arbitrageur holds every asset and dollars, and approves every vault
        usdc.bas(arb, 1_000_000e6);
        for (uint256 i = 0; i < 5; i++) {
            varlik[i].bas(arb, 1e30);
            vm.startPrank(arb);
            for (uint256 j = 0; j < 5; j++) varlik[i].approve(address(kasa[Z[j]]), type(uint256).max);
            vm.stopPrank();
        }
        vm.startPrank(arb);
        for (uint256 j = 0; j < 5; j++) usdc.approve(address(kasa[Z[j]]), type(uint256).max);
        vm.stopPrank();
    }

    /// A launch on BNB, basket of five lines on five chains, $4 each. Quotes:
    /// 1 unit = $1 for every asset (1e18 units per 1e6 dollars).
    function _launch(Jeton token) internal returns (uint64 id) {
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](5);
        uint256[] memory ref = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) { k[i] = SepetDefteri.Kalem(Z[i], Adres.b32(address(varlik[i])), 4e6); ref[i] = 4e18; }
        usdc.bas(launchpad, 20e6);
        vm.startPrank(launchpad);
        usdc.approve(address(ucu[BNB]), 20e6);
        ucu[BNB].baslat(address(token), kurucu, ARZ, k, ref);
        vm.stopPrank();
        ag.teslim();
        id = defter.idOf(BNB, Adres.b32(address(token)));
    }

    uint256 saat = 1_800_000_000;
    function _hepsiniDoldur(uint256 bekle) internal {
        saat += bekle;
        vm.warp(saat);
        for (uint256 i = 0; i < 5; i++) {
            SepetKasasi k = kasa[Z[i]];
            for (uint256 id = 0; id < k.ihaleSayisi(); id++) {
                (,,,,,,,, bool bitti) = k.ihaleler(id);
                if (bitti) continue;
                uint256 ist = k.istenen(id);
                vm.prank(arb);
                k.doldur(id, ist);
            }
        }
        ag.teslim();
    }

    function test_launch_bes_zincire_dagilir_ve_acik_artirmayla_dolar() public {
        Jeton token = new Jeton("PULSE");
        uint64 id = _launch(token);
        assertEq(id, 1);
        for (uint256 i = 0; i < 5; i++) {
            assertEq(kasa[Z[i]].ihaleSayisi(), 1, "her kasada bir alim");
            assertEq(kasa[Z[i]].usdcBakiye(id), 4e6, "4 dolar kasada");
            // at once it asks 2x the quote: 8 units for $4
            assertEq(kasa[Z[i]].istenen(0), 8e18);
        }
        // a filler who comes after one halving delivers the 4 units the quote names
        _hepsiniDoldur(30 minutes);
        for (uint256 i = 0; i < 5; i++) {
            assertEq(kasa[Z[i]].bakiye(id, address(varlik[i])), 4e18, "kasa 4 birim tutuyor");
            assertEq(kasa[Z[i]].usdcBakiye(id), 0, "dolar harcandi");
        }
    }

    function test_kotu_sepet_reddedilir_ya_da_iade_edilir() public {
        Jeton token = new Jeton("BAD");
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](6);
        uint256[] memory ref = new uint256[](6);
        for (uint256 i = 0; i < 6; i++) { k[i] = SepetDefteri.Kalem(Z[i % 5], Adres.b32(address(varlik[i % 5])), 4e6); ref[i] = 1; }
        usdc.bas(launchpad, 100e6);
        vm.startPrank(launchpad);
        usdc.approve(address(ucu[BNB]), type(uint256).max);
        vm.expectRevert(SepetUcu.KotuSepet.selector);
        ucu[BNB].baslat(address(token), kurucu, ARZ, k, ref);
        // $3.99 on a line
        SepetDefteri.Kalem[] memory k1 = new SepetDefteri.Kalem[](1);
        uint256[] memory r1 = new uint256[](1);
        k1[0] = SepetDefteri.Kalem(SOL, Adres.b32(address(varlik[2])), 3_990_000); r1[0] = 1;
        vm.expectRevert(SepetUcu.KotuSepet.selector);
        ucu[BNB].baslat(address(token), kurucu, ARZ, k1, r1);
        // a chain with no vault passes the entry, so the Defter refunds the founder on BNB
        k1[0] = SepetDefteri.Kalem(99, Adres.b32(address(varlik[2])), 4e6);
        ucu[BNB].baslat(address(token), kurucu, ARZ, k1, r1);
        vm.stopPrank();
        // only the launchpad may register
        address x = address(new Jeton("X"));
        vm.expectRevert(SepetUcu.SadeceLaunchpad.selector);
        ucu[BNB].baslat(x, kurucu, ARZ, k1, r1);
        ag.teslim();
        assertEq(defter.launchSayisi(), 0, "kayit yok");
        assertEq(usdc.balanceOf(kurucu), 4e6, "kurucuya iade");
    }

    function test_acik_artirma_zamanla_duser_ve_tabanda_durur() public {
        _launch(new Jeton("T"));
        SepetKasasi k = kasa[SOL];
        uint256 t0 = 1_800_000_000;
        assertEq(k.istenen(0), 8e18);
        vm.warp(t0 + 15 minutes);
        assertEq(k.istenen(0), 6e18, "yarim yarilanmada 3/4");
        vm.warp(t0 + 30 minutes);
        assertEq(k.istenen(0), 4e18, "bir yarilanmada yari");
        vm.warp(t0 + 10 days);
        assertEq(k.istenen(0), 8e18 / 16, "tabanda durur");
        // less than asked is refused
        vm.prank(arb);
        vm.expectRevert(SepetKasasi.Az.selector);
        k.doldur(0, 8e18 / 16 - 1);
        // restarts from the floor after resting there a day
        k.yenidenBaslat(0);
        assertEq(k.istenen(0), 8e18 / 16);
        vm.warp(t0 + 10 days + 30 minutes);
        assertEq(k.istenen(0), 8e18 / 32, "tabandan devam eder");
    }

    function test_erken_doldurmak_pahalidir() public {
        uint64 id = _launch(new Jeton("T"));
        SepetKasasi k = kasa[BASE];
        uint256 ist = k.istenen(0);
        vm.prank(arb);
        k.doldur(0, ist);
        assertEq(k.bakiye(id, address(varlik[3])), 8e18, "ilk saniyede 2 kati verdi");
    }

    function test_vergi_esikte_agirlikla_dagitilir() public {
        Jeton token = new Jeton("T");
        uint64 id = _launch(token);
        _hepsiniDoldur(30 minutes);
        usdc.bas(address(this), 60e6);
        usdc.approve(address(ucu[BNB]), 60e6);
        ucu[BNB].vergi(address(token), 30e6);
        ag.teslim();
        vm.expectRevert(SepetDefteri.EsikAltinda.selector);
        defter.dagit(id);
        ucu[BNB].vergi(address(token), 30e6);
        ag.teslim();
        defter.dagit(id);
        ag.teslim();
        for (uint256 i = 0; i < 5; i++) {
            assertEq(kasa[Z[i]].usdcBakiye(id), 12e6, "60 / 5 = 12 dolar");
            // the re-buy starts from the last fill: $4 bought 4 units, so 12 units wanted x2
            assertEq(kasa[Z[i]].istenen(1), 24e18);
        }
    }

    function test_itfa_payi_her_kasadan_satilir_ve_tutucunun_zincirinde_odenir() public {
        Jeton token = new Jeton("T");
        uint64 id = _launch(token);
        _hepsiniDoldur(30 minutes);       // each vault: 4 units bought for $4
        // 25 dollars of tax wait in the Defter (under the threshold)
        usdc.bas(address(this), 25e6);
        usdc.approve(address(ucu[BNB]), 25e6);
        ucu[BNB].vergi(address(token), 25e6);
        ag.teslim();
        // the holder owns 10% of supply and redeems it, paid on BNB
        token.bas(tutucu, ARZ / 10);
        vm.startPrank(tutucu);
        token.approve(address(ucu[BNB]), type(uint256).max);
        ucu[BNB].itfa(address(token), ARZ / 10, BNB, Adres.b32(tutucu));
        vm.stopPrank();
        ag.teslim();
        assertEq(usdc.balanceOf(tutucu), 2_500_000, "bekleyen verginin %10'u hemen");
        (,, uint256 arz,,,) = defter.launchlar(id);
        assertEq(arz, ARZ - ARZ / 10);
        for (uint256 i = 0; i < 5; i++) {
            assertEq(kasa[Z[i]].bakiye(id, address(varlik[i])), 3.6e18, "%10 satisa cikti");
            assertEq(kasa[Z[i]].ihaleSayisi(), 2);
        }
        // sells start at 2x the last price: 0.4 units for $0.80; one halving later $0.40
        _hepsiniDoldur(30 minutes);
        assertEq(usdc.balanceOf(tutucu), 2_500_000 + 5 * 400_000, "her kasadan 0.40 dolar");
    }

    function test_launchlar_birbirine_karismaz() public {
        Jeton a = new Jeton("A");
        Jeton b = new Jeton("B");
        uint64 ia = _launch(a);
        _hepsiniDoldur(30 minutes);
        uint64 ib = _launch(b);
        _hepsiniDoldur(30 minutes);
        a.bas(tutucu, ARZ);
        vm.startPrank(tutucu);
        a.approve(address(ucu[BNB]), type(uint256).max);
        ucu[BNB].itfa(address(a), ARZ, BNB, Adres.b32(tutucu));
        vm.stopPrank();
        ag.teslim();
        for (uint256 i = 0; i < 5; i++) {
            assertEq(kasa[Z[i]].bakiye(ia, address(varlik[i])), 0, "A tamamen itfa");
            assertEq(kasa[Z[i]].bakiye(ib, address(varlik[i])), 4e18, "B dokunulmadi");
        }
    }

    function test_kasaya_yalniz_defter_emir_verir() public {
        _launch(new Jeton("T"));
        Yabanci y = new Yabanci();
        bytes memory sahte = abi.encode(SepetMesaj.SAT, uint64(1), new bytes32[](0), uint256(1), uint256(1), BNB, Adres.b32(address(y)));
        y.gonder(IHaberci(address(h[ARC])), SOL, address(kasa[SOL]), sahte);
        vm.expectRevert(SepetKasasi.SadeceDefter.selector);
        ag.teslim();
    }

    function test_deftere_yalniz_zincir_girisleri_yazar() public {
        _launch(new Jeton("T"));
        Yabanci y = new Yabanci();
        bytes memory sahte = abi.encode(SepetMesaj.ITFA, Adres.b32(address(0x1)), uint256(1), BNB, Adres.b32(address(y)));
        y.gonder(IHaberci(address(h[BNB])), ARC, address(defter), sahte);
        vm.expectRevert(SepetDefteri.YetkisizKaynak.selector);
        ag.teslim();
    }

    /// A redemption that lands while two buy auctions are open halves both,
    /// whichever fills first: the basket keeps its weights.
    function test_itfa_acik_alimlari_esit_kucultur() public {
        Jeton token = new Jeton("T");
        uint64 id = _launch(token);                   // auction 0: $4 per vault, left open
        usdc.bas(address(this), 60e6);
        usdc.approve(address(ucu[BNB]), 60e6);
        ucu[BNB].vergi(address(token), 60e6);
        ag.teslim();
        defter.dagit(id);
        ag.teslim();                                  // auction 1: $12 per vault, open
        token.bas(tutucu, ARZ / 2);
        vm.startPrank(tutucu);
        token.approve(address(ucu[BNB]), type(uint256).max);
        ucu[BNB].itfa(address(token), ARZ / 2, BNB, Adres.b32(tutucu));
        vm.stopPrank();
        ag.teslim();
        assertEq(usdc.balanceOf(tutucu), 5 * 8e6, "her kasadan 16 dolarin yarisi");
        SepetKasasi k = kasa[SOL];
        saat += 30 minutes;
        vm.warp(saat);
        uint256 a1 = k.istenen(1);
        uint256 a0 = k.istenen(0);
        vm.startPrank(arb);
        k.doldur(1, a1 / 2);                          // the $12 auction now spends $6
        k.doldur(0, a0 / 2);                          // the $4 auction now spends $2
        vm.stopPrank();
        assertEq(k.usdcBakiye(id), 0, "hepsi harcandi, artik yok");
        assertEq(k.bakiye(id, address(varlik[2])), a1 / 2 + a0 / 2);
    }
}
