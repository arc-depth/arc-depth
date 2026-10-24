// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {PulseIsim, IERC20I} from "../src/arc/isim/PulseIsim.sol";
import {Jeton} from "./SepetYardim.sol";

contract SembolluJeton {
    string public symbol;
    constructor(string memory s) { symbol = s; }
}

/// The register entry of PulseLaunchpad2 (founder in word 6), copied field for field.
contract Launchpad2Gibi {
    struct Kayit { address token; address acici; address kasa; address yonetici; address hedefVarlik; uint32 hedefDomain;
        address kurucu; uint256 kurucuToken; uint256 teklif; uint256 vergiPpm; uint64 zaman; }
    Kayit[] k;
    function ekle(address token, address kurucu) external { k.push(Kayit(token, address(1), address(2), address(3), address(4), 6, kurucu, 1, 2, 3, 4)); }
    function launchAt(uint256 i) external view returns (Kayit memory) { return k[i]; }
}

/// PulseLaunchpad3 / 4 (founder in word 5).
contract Launchpad3Gibi {
    struct Kayit { address token; address acici; address kasa; address hedefVarlik; uint256 teminatMiktari;
        address kurucu; uint256 kurucuToken; uint256 teklif; uint256 vergiPpm; uint64 zaman; }
    Kayit[] k;
    function ekle(address token, address kurucu) external { k.push(Kayit(token, address(1), address(2), address(3), 5, kurucu, 1, 2, 3, 4)); }
    function launchAt(uint256 i) external view returns (Kayit memory) { return k[i]; }
}

contract PulseIsimTest is Test {
    Jeton usdc;
    PulseIsim isim;
    Launchpad2Gibi lp2;
    Launchpad3Gibi lp3;
    address hazine = address(0x4A2);
    address fthm = address(0xF7);
    address ali = address(0xA11);
    address kurucu = address(0xF00D);

    function setUp() public {
        usdc = new Jeton("USDC");
        lp2 = new Launchpad2Gibi();
        lp3 = new Launchpad3Gibi();
        PulseIsim.Launchpad[] memory l = new PulseIsim.Launchpad[](2);
        l[0] = PulseIsim.Launchpad(address(lp2), 6);
        l[1] = PulseIsim.Launchpad(address(lp3), 5);
        isim = new PulseIsim(IERC20I(address(usdc)), hazine, fthm, l);
        usdc.bas(ali, 10e6);
        vm.prank(ali);
        usdc.approve(address(isim), type(uint256).max);
    }

    function test_kayit_ucreti_yuzde_bes_fthm() public {
        vm.prank(ali);
        isim.kaydet("ali", ali);
        assertEq(isim.coz("ali"), ali);
        assertEq(isim.sahibi("ali"), ali);
        assertEq(usdc.balanceOf(fthm), 50_000, "0,05 dolar FTHM'ye");
        assertEq(usdc.balanceOf(hazine), 950_000, "0,95 dolar hazineye");
        assertEq(usdc.balanceOf(ali), 9e6);
    }

    function test_gecersiz_ve_alinmis_ad_reddedilir() public {
        string[6] memory kotu = ["", "Ali", "-ali", "ali-", "a.b", "abcdefghijabcdefghijabcdefghijabc"];
        for (uint256 i = 0; i < kotu.length; i++) {
            vm.prank(ali);
            vm.expectRevert(PulseIsim.GecersizAd.selector);
            isim.kaydet(kotu[i], ali);
        }
        vm.prank(ali);
        isim.kaydet("a-1", ali);
        vm.prank(ali);
        vm.expectRevert(PulseIsim.AlinmisAd.selector);
        isim.kaydet("a-1", ali);
        assertEq(usdc.balanceOf(ali), 9e6, "reddedilenden ucret alinmaz");
    }

    function test_launch_tokeni_kendi_sembolunu_kurucusuyla_alir() public {
        SembolluJeton t = new SembolluJeton("PEPE");
        lp3.ekle(address(t), kurucu);
        string memory ad = isim.tokenAdi(address(lp3), 0);   // anyone may call
        assertEq(ad, "pepe");
        assertEq(isim.coz("pepe"), address(t), "token'a isaret eder");
        assertEq(isim.sahibi("pepe"), kurucu, "kurucunun");
        assertEq(usdc.balanceOf(hazine), 0, "ucretsiz");
        vm.expectRevert(PulseIsim.ZatenAdlandi.selector);
        isim.tokenAdi(address(lp3), 0);
        // nesil2 layout: founder in word 6
        SembolluJeton t2 = new SembolluJeton("Moon$Cat!");
        lp2.ekle(address(t2), address(0xBEEF));
        assertEq(isim.tokenAdi(address(lp2), 0), "mooncat");
        assertEq(isim.sahibi("mooncat"), address(0xBEEF));
    }

    function test_alinmis_sembol_launch_numarasiyla() public {
        vm.prank(ali);
        isim.kaydet("pepe", ali);
        lp3.ekle(address(new SembolluJeton("x")), kurucu);
        lp3.ekle(address(new SembolluJeton("pepe")), kurucu);
        assertEq(isim.tokenAdi(address(lp3), 1), "pepe-1");
        assertEq(isim.sahibi("pepe"), ali, "onceki sahibi korunur");
        // a symbol with nothing usable
        lp3.ekle(address(new SembolluJeton(unicode"🐸")), kurucu);
        assertEq(isim.tokenAdi(address(lp3), 2), "token");
    }

    function test_tanimsiz_launchpad_ve_olmayan_launch() public {
        Launchpad3Gibi sahte = new Launchpad3Gibi();
        sahte.ekle(address(new SembolluJeton("pepe")), ali);
        vm.expectRevert(PulseIsim.TanimsizLaunchpad.selector);
        isim.tokenAdi(address(sahte), 0);
        vm.expectRevert(PulseIsim.TanimsizLaunchpad.selector);
        isim.tokenAdi(address(lp3), 7);
        assertEq(isim.coz("pepe"), address(0));
    }

    function test_hedef_devir_ve_birincil_ad() public {
        vm.prank(ali);
        isim.kaydet("ali", ali);
        vm.expectRevert(PulseIsim.SadeceSahip.selector);
        isim.hedefle("ali", address(this));
        vm.prank(ali);
        isim.birincilYap("ali");
        assertEq(isim.adi(ali), "ali");
        vm.expectRevert(PulseIsim.HedefDegil.selector);
        isim.birincilYap("ali");
        vm.prank(ali);
        isim.hedefle("ali", address(0xCAFE));
        assertEq(isim.adi(ali), "", "artik ali'ye isaret etmiyor");
        vm.prank(ali);
        isim.devret("ali", address(0xCAFE));
        assertEq(isim.sahibi("ali"), address(0xCAFE));
        vm.prank(ali);
        vm.expectRevert(PulseIsim.SadeceSahip.selector);
        isim.hedefle("ali", ali);
    }
}
