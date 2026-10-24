// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHaberci, IERC20S, Adres} from "../src/arc/sepet/IHaberci.sol";
import {SepetDefteri} from "../src/arc/sepet/SepetDefteri.sol";
import {SepetKasasi} from "../src/arc/sepet/SepetKasasi.sol";
import {SepetUcu} from "../src/arc/sepet/SepetUcu.sol";
import {VergiKovasi} from "../src/arc/sepet/VergiKovasi.sol";
import {FthmYakici} from "../src/arc/sepet/FthmYakici.sol";
import {PulseLaunchpad5, IQuoteP5} from "../src/arc/sepet/PulseLaunchpad5.sol";
import {PulseFabrika4} from "../src/arc/nesil4/PulseFabrika4.sol";
import {V4Takasci} from "../src/V4Takasci.sol";
import {Jeton, SahteAg, SahteHaberci} from "./SepetYardim.sol";

interface IERC20T5 {
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// A real launch on "Base" (a real v4 PoolManager, PulseHook4, the nesil 4
/// opener) whose basket lives on Base and on Arc, the Defter on Arc, the
/// bridges a queue.
contract Sepet5Test is Test {
    uint32 constant ARC = 26;
    uint32 constant BASE = 6;

    Jeton usdc;
    SahteAg ag;
    SepetDefteri defter;
    mapping(uint32 => SahteHaberci) h;
    mapping(uint32 => SepetKasasi) kasa;
    mapping(uint32 => SepetUcu) ucu;
    mapping(uint32 => Jeton) varlik;
    PoolManager pm;
    PulseLaunchpad5 lp;
    FthmYakici yakici;
    Jeton fthm;
    address hook;
    address kurucu = address(0xF00D);
    address alici = address(0xB0B);
    address arb = address(0xA2B);
    uint256 saat = 1_800_000_000;

    function setUp() public {
        vm.warp(saat);
        usdc = new Jeton("USDC");
        ag = new SahteAg(IERC20S(address(usdc)));
        h[ARC] = new SahteHaberci(ARC, ag); ag.ekle(h[ARC]);
        h[BASE] = new SahteHaberci(BASE, ag); ag.ekle(h[BASE]);
        defter = new SepetDefteri(IHaberci(address(h[ARC])), IERC20S(address(usdc)));

        pm = new PoolManager(address(this));
        address ben = address(this);
        uint64 n0 = vm.getNonce(ben);
        /* fab n0, ucuBase n0+1, lk n0+2, lp n0+3 */
        address lpAdr = vm.computeCreateAddress(ben, n0 + 3);
        hook = address(uint160((uint256(keccak256("hook5")) & ~uint256(0x3FFF)) | 0x2ECC));
        PulseFabrika4 fab = new PulseFabrika4();
        ucu[BASE] = new SepetUcu(IHaberci(address(h[BASE])), IERC20S(address(usdc)), ARC, Adres.b32(address(defter)), lpAdr);
        address lk = deployCode("PulseLikiditeKasasi.sol:PulseLikiditeKasasi", abi.encode(address(usdc), lpAdr));
        lp = new PulseLaunchpad5(IQuoteP5(address(usdc)), IPoolManager(address(pm)), IHooks(hook), fab, ucu[BASE],
            address(0xDE7), lk, address(0x15E7));
        assertEq(address(lp), lpAdr, "launchpad adresi");
        fthm = new Jeton("FTHM");
        // the quote at deployment: $1 buys 1 FTHM
        yakici = new FthmYakici(IERC20S(address(usdc)), IERC20S(address(fthm)), 1e6, 1e18);
        deployCodeTo("PulseHook5.sol:PulseHook5", abi.encode(address(pm), lpAdr, address(usdc), address(0xDE7), lk, address(0x15E7), address(yakici)), hook);

        ucu[ARC] = new SepetUcu(IHaberci(address(h[ARC])), IERC20S(address(usdc)), ARC, Adres.b32(address(defter)), address(0x1A0));
        for (uint256 i = 0; i < 2; i++) {
            uint32 z = i == 0 ? ARC : BASE;
            kasa[z] = new SepetKasasi(IHaberci(address(h[z])), IERC20S(address(usdc)), ARC, Adres.b32(address(defter)));
            defter.bagla(z, Adres.b32(address(ucu[z])), Adres.b32(address(kasa[z])));
            varlik[z] = new Jeton(i == 0 ? "WARC" : "WETH");
            varlik[z].bas(arb, 1e30);
            vm.prank(arb);
            varlik[z].approve(address(kasa[z]), type(uint256).max);
        }
        defter.kilitle();
        usdc.bas(arb, 1_000_000e6);
        vm.prank(arb);
        usdc.approve(address(kasa[BASE]), type(uint256).max);
        vm.prank(arb);
        usdc.approve(address(kasa[ARC]), type(uint256).max);
    }

    function _launch() internal returns (address token, VergiKovasi kova, PoolKey memory key, uint64 id) {
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](2);
        uint256[] memory ref = new uint256[](2);
        k[0] = SepetDefteri.Kalem(ARC, Adres.b32(address(varlik[ARC])), 10e6);  ref[0] = 10e18;
        k[1] = SepetDefteri.Kalem(BASE, Adres.b32(address(varlik[BASE])), 10e6); ref[1] = 10e18;
        usdc.bas(kurucu, 200e6 + 20e6);
        vm.startPrank(kurucu);
        usdc.approve(address(lp), type(uint256).max);
        address kv;
        (token, kv) = lp.launch("Sepet", "SPT", k, ref, 20_000, 200e6);
        vm.stopPrank();
        ag.teslim();
        kova = VergiKovasi(kv);
        key = lp.havuzAnahtari(token);
        id = defter.idOf(BASE, Adres.b32(token));
        saat += 30;
        vm.warp(saat);   // past the snipe window
    }

    function _al(PoolKey memory key, address kim, uint256 dolar) internal {
        V4Takasci t = new V4Takasci(IPoolManager(address(pm)));
        usdc.bas(kim, dolar);
        vm.startPrank(kim);
        usdc.approve(address(t), type(uint256).max);
        t.takas(key, Currency.unwrap(key.currency0) == address(usdc), dolar);
        vm.stopPrank();
    }

    function _sat(PoolKey memory key, address token, address kim, uint256 miktar) internal {
        V4Takasci t = new V4Takasci(IPoolManager(address(pm)));
        vm.startPrank(kim);
        IERC20T5(token).approve(address(t), type(uint256).max);
        t.takas(key, Currency.unwrap(key.currency0) == token, miktar);
        vm.stopPrank();
    }

    function test_launch_sepete_baglanir_ve_havuz_acilir() public {
        (address token, VergiKovasi kova,, uint64 id) = _launch();
        assertEq(id, 1, "Defter'de kayitli");
        assertEq(kasa[ARC].usdcBakiye(id), 10e6, "Arc kasasi 10 dolar");
        assertEq(kasa[BASE].usdcBakiye(id), 10e6, "Base kasasi 10 dolar");
        assertEq(IERC20T5(token).totalSupply(), 1_000_000_000e18);
        assertGt(IERC20T5(token).balanceOf(kurucu), 0, "kurucu ilk alimin tokenlerini aldi");
        assertEq(kova.dolasim(), IERC20T5(token).balanceOf(kurucu), "dolasim = cuzdanlar");
        (,, uint256 arz,,,) = defter.launchlar(id);
        assertEq(arz, 1_000_000_000e18);
    }

    function test_islem_vergisi_kovadan_sepete_gider() public {
        (address token, VergiKovasi kova, PoolKey memory key, uint64 id) = _launch();
        _al(key, alici, 300e6);
        _sat(key, token, alici, IERC20T5(token).balanceOf(alici) / 2);
        uint256 v = usdc.balanceOf(address(kova));
        assertGt(v, 0, "vergi kovada");
        if (v < 10e6) {
            vm.expectRevert(VergiKovasi.EsikAltinda.selector);
            kova.gonder();
            _al(key, alici, 400e6);
            v = usdc.balanceOf(address(kova));
        }
        kova.gonder();
        ag.teslim();
        (,,,, uint256 bekleyen,) = defter.launchlar(id);
        assertEq(bekleyen, v, "vergi Defter'de bekliyor");
        assertEq(usdc.balanceOf(address(kova)), 0);
        emit log_named_uint("Defter'e giden vergi (1e6)", v);
    }

    function test_itfa_yakar_ve_iki_zincirden_oder() public {
        (address token,,, uint64 id) = _launch();
        saat += 30 minutes;
        vm.warp(saat);
        for (uint256 i = 0; i < 2; i++) {
            SepetKasasi k = kasa[i == 0 ? ARC : BASE];
            uint256 ist = k.istenen(0);
            vm.prank(arb);
            k.doldur(0, ist);
        }
        ag.teslim();
        // the founder redeems all their tokens on Base
        uint256 m = IERC20T5(token).balanceOf(kurucu);
        vm.startPrank(kurucu);
        IERC20T5(token).approve(address(ucu[BASE]), m);
        ucu[BASE].itfa(token, m, BASE, Adres.b32(kurucu));
        vm.stopPrank();
        ag.teslim();
        assertEq(IERC20T5(token).balanceOf(kurucu), 0, "yakildi");
        (,, uint256 arz,,,) = defter.launchlar(id);
        assertEq(arz, 1_000_000_000e18 - m, "arz yakim kadar dustu");
        uint256 u0 = usdc.balanceOf(kurucu);
        saat += 30 minutes;
        vm.warp(saat);
        for (uint256 i = 0; i < 2; i++) {
            SepetKasasi k = kasa[i == 0 ? ARC : BASE];
            uint256 ist = k.istenen(1);
            vm.prank(arb);
            k.doldur(1, ist);
        }
        ag.teslim();
        uint256 beklenen = (2 * 10e6 * m) / 1_000_000_000e18;
        assertApproxEqAbs(usdc.balanceOf(kurucu) - u0, beklenen, 2, "sepetteki payi, iki zincirden");
        emit log_named_uint("kurucunun itfasi (1e6)", usdc.balanceOf(kurucu) - u0);
    }

    /// The trade fee is 2.20%: 0.30 founder, 0.30 developer fund, 0.50
    /// liquidity pot, 0.20 operations, 0.20 FTHM burn, 0.70 depth; the FTHM
    /// slice is auctioned for FTHM and the FTHM goes to 0xdead.
    function test_islem_ucreti_yuzde_2_2_ve_fthm_yakilir() public {
        (, , PoolKey memory key,) = _launch();
        uint256 g0 = usdc.balanceOf(address(0xDE7));
        uint256 i0 = usdc.balanceOf(address(0x15E7));
        _al(key, alici, 1_000e6);
        uint256 protokol = (1_000e6 * 22_000) / 1_000_000;
        assertEq(protokol, 22e6, "yuzde 2,2 = 22 dolar");
        assertEq(usdc.balanceOf(address(0xDE7)) - g0, (protokol * 3_000) / 22_000, "gelistirici 0,30");
        assertEq(usdc.balanceOf(address(0x15E7)) - i0, (protokol * 2_000) / 22_000, "isletme 0,20");
        assertEq(usdc.balanceOf(address(yakici)), (protokol * 2_000) / 22_000, "FTHM yakimi 0,20 = 2 dolar");
        _al(key, alici, 4_000e6);
        yakici.ilan();
        uint256 d = yakici.verilen();
        assertEq(d, 10e6, "5.000 dolarlik islemden 10 dolar");
        saat += 30 minutes;
        vm.warp(saat);
        uint256 ist = yakici.istenen();
        assertEq(ist, 10e18, "bir yarilanmada 1 dolar = 1 FTHM");
        fthm.bas(arb, ist);
        vm.startPrank(arb);
        fthm.approve(address(yakici), ist);
        yakici.doldur(ist);
        vm.stopPrank();
        assertEq(fthm.balanceOf(yakici.OLU()), 10e18, "10 FTHM yakildi");
        assertEq(usdc.balanceOf(arb), 1_000_000e6 + 10e6, "dolduran 10 dolari aldi");
    }
}
