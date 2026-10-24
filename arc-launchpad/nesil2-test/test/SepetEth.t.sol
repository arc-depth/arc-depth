// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IHaberci, IERC20S, Adres} from "../src/arc/sepet/IHaberci.sol";
import {SepetDefteri} from "../src/arc/sepet/SepetDefteri.sol";
import {SepetKasasi} from "../src/arc/sepet/SepetKasasi.sol";
import {SepetUcu} from "../src/arc/sepet/SepetUcu.sol";
import {Jeton, SahteAg, SahteHaberci} from "./SepetYardim.sol";

/// Ethereum mainnet lines: at least $25, and a tax re-buy for them waits
/// until their share reaches $25, so gas never eats the line.
contract SepetEthTest is Test {
    uint32 constant ETH = 0; uint32 constant ARC = 1; uint32 constant BNB = 2;
    uint32[3] Z = [ETH, ARC, BNB];
    Jeton usdc;
    SahteAg ag;
    SepetDefteri defter;
    mapping(uint32 => SahteHaberci) h;
    mapping(uint32 => SepetKasasi) kasa;
    mapping(uint32 => SepetUcu) ucu;
    Jeton weth;
    Jeton warc;
    address launchpad = address(0x1A0);
    address kurucu = address(0xF00D);
    address tutucu = address(0xB0B);
    uint256 constant ARZ = 1_000_000_000e18;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new Jeton("USDC");
        ag = new SahteAg(IERC20S(address(usdc)));
        for (uint256 i = 0; i < 3; i++) { h[Z[i]] = new SahteHaberci(Z[i], ag); ag.ekle(h[Z[i]]); }
        defter = new SepetDefteri(IHaberci(address(h[ARC])), IERC20S(address(usdc)));
        for (uint256 i = 0; i < 3; i++) {
            uint32 z = Z[i];
            kasa[z] = new SepetKasasi(IHaberci(address(h[z])), IERC20S(address(usdc)), ARC, Adres.b32(address(defter)));
            ucu[z] = new SepetUcu(IHaberci(address(h[z])), IERC20S(address(usdc)), ARC, Adres.b32(address(defter)), launchpad);
            defter.bagla(z, Adres.b32(address(ucu[z])), Adres.b32(address(kasa[z])));
        }
        defter.kilitle();
        weth = new Jeton("WETH");
        warc = new Jeton("WARC");
    }

    function _sepet(uint256 eth, uint256 arc) internal view returns (SepetDefteri.Kalem[] memory k, uint256[] memory ref) {
        k = new SepetDefteri.Kalem[](2);
        ref = new uint256[](2);
        k[0] = SepetDefteri.Kalem(ETH, Adres.b32(address(weth)), eth); ref[0] = eth * 1e12;
        k[1] = SepetDefteri.Kalem(ARC, Adres.b32(address(warc)), arc); ref[1] = arc * 1e12;
    }

    function _launch(Jeton token, uint256 eth, uint256 arc) internal returns (uint64) {
        (SepetDefteri.Kalem[] memory k, uint256[] memory ref) = _sepet(eth, arc);
        usdc.bas(launchpad, eth + arc);
        vm.startPrank(launchpad);
        usdc.approve(address(ucu[BNB]), eth + arc);
        ucu[BNB].baslat(address(token), kurucu, ARZ, k, ref);
        vm.stopPrank();
        ag.teslim();
        return defter.idOf(BNB, Adres.b32(address(token)));
    }

    function _vergi(Jeton token, uint256 v) internal {
        usdc.bas(address(this), v);
        usdc.approve(address(ucu[BNB]), v);
        ucu[BNB].vergi(address(token), v);
        ag.teslim();
    }

    function test_ethereum_kalemi_en_az_25_dolar() public {
        (SepetDefteri.Kalem[] memory k, uint256[] memory ref) = _sepet(24e6, 4e6);
        assertFalse(defter.sepetGecerli(BNB, bytes32(uint256(1)), ARZ, k, ref, 28e6), "Ethereum'da 24 dolar yetmez");
        (k, ref) = _sepet(25e6, 4e6);
        assertTrue(defter.sepetGecerli(BNB, bytes32(uint256(1)), ARZ, k, ref, 29e6), "25 dolar olur");
        // other chains keep the $4 minimum
        (k, ref) = _sepet(25e6, 3e6);
        assertFalse(defter.sepetGecerli(BNB, bytes32(uint256(1)), ARZ, k, ref, 28e6));
        // a launch with a $10 Ethereum line is refunded, not lost
        Jeton t = new Jeton("T");
        _launch(t, 10e6, 4e6);
        assertEq(defter.launchSayisi(), 0, "kayit yok");
        assertEq(usdc.balanceOf(kurucu), 14e6, "kurucuya iade");
    }

    function test_ethereum_payi_25_dolara_kadar_bekler() public {
        Jeton t = new Jeton("T");
        uint64 id = _launch(t, 25e6, 75e6);   // weights 1 : 3
        assertEq(kasa[ETH].usdcBakiye(id), 25e6);
        assertEq(kasa[ETH].ihaleSayisi(), 1);
        _vergi(t, 50e6);
        defter.dagit(id);
        ag.teslim();
        assertEq(kasa[ARC].usdcBakiye(id), 75e6 + 37_500_000, "Arc payi hemen");
        assertEq(kasa[ETH].ihaleSayisi(), 1, "Ethereum'a 12,5 dolar icin alim acilmadi");
        assertEq(defter.biriken(id, 0), 12_500_000, "bekliyor");
        _vergi(t, 50e6);
        defter.dagit(id);
        ag.teslim();
        assertEq(defter.biriken(id, 0), 0);
        assertEq(kasa[ETH].usdcBakiye(id), 50e6, "12,5 + 12,5 = 25 dolar tek alimla");
        assertEq(kasa[ETH].ihaleSayisi(), 2);
    }

    function test_itfa_bekleyen_paydan_da_payini_alir() public {
        Jeton t = new Jeton("T");
        uint64 id = _launch(t, 25e6, 75e6);
        _vergi(t, 50e6);
        defter.dagit(id);
        ag.teslim();
        assertEq(defter.biriken(id, 0), 12_500_000);
        // a tenth of the supply redeemed on Arc: a tenth of the waiting $12.5
        t.bas(tutucu, ARZ / 10);
        vm.startPrank(tutucu);
        t.approve(address(ucu[BNB]), type(uint256).max);
        ucu[BNB].itfa(address(t), ARZ / 10, ARC, Adres.b32(tutucu));
        vm.stopPrank();
        ag.teslim();
        // nothing was filled yet, so each vault returns a tenth of its open
        // buy dollars too: Arc 112.5 -> 11.25, Ethereum 25 -> 2.5
        assertEq(usdc.balanceOf(tutucu), 1_250_000 + 11_250_000 + 2_500_000, "bekleyen paydan 1,25 + kasalardan 13,75");
        assertEq(defter.biriken(id, 0), 11_250_000);
    }
}
