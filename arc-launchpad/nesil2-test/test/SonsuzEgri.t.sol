// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {IHaberci, IERC20S, Adres} from "../src/arc/sepet/IHaberci.sol";
import {SepetDefteri} from "../src/arc/sepet/SepetDefteri.sol";
import {SepetKasasi} from "../src/arc/sepet/SepetKasasi.sol";
import {SepetUcu} from "../src/arc/sepet/SepetUcu.sol";
import {FthmYakici} from "../src/arc/sepet/FthmYakici.sol";
import {PulseLaunchpad5, IQuoteP5} from "../src/arc/sepet/PulseLaunchpad5.sol";
import {PulseFabrika4} from "../src/arc/nesil4/PulseFabrika4.sol";
import {V4Takasci} from "../src/V4Takasci.sol";
import {Jeton, SahteAg, SahteHaberci} from "./SepetYardim.sol";

interface IERC20E {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// The ladder without end (19 Oct 2026): a real v4 PoolManager, PulseHook5,
/// the nesil 4 opener and PulseLaunchpad5 as it will be deployed. The token
/// must never run out, the price must follow x·y=k with the virtual dollar
/// reserve the contract states, and sellers can never take more dollars
/// than buyers put in. Run for both orderings of token and dollar, because
/// the ladder's direction in tick space flips with them.
abstract contract SonsuzEgriTaban is Test {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint32 constant ARC = 26;
    Jeton usdc;
    SahteAg ag;
    SepetDefteri defter;
    SahteHaberci h;
    SepetKasasi kasa;
    SepetUcu ucu;
    Jeton varlik;
    PoolManager pm;
    PulseLaunchpad5 lp;
    address hook;
    address kurucu = address(0xF00D);
    uint256 saat = 1_800_000_000;

    /// where the dollar sits: below or above any launch token's address
    function dolarAdresi() internal pure virtual returns (address);

    function setUp() public {
        vm.warp(saat);
        deployCodeTo("SepetYardim.sol:Jeton", abi.encode("USDC"), dolarAdresi());
        usdc = Jeton(dolarAdresi());
        ag = new SahteAg(IERC20S(address(usdc)));
        h = new SahteHaberci(ARC, ag); ag.ekle(h);
        defter = new SepetDefteri(IHaberci(address(h)), IERC20S(address(usdc)));
        pm = new PoolManager(address(this));
        /* the PoolManager is a singleton: on Arc it holds every pool's dollars (2,87M USDC, 19 Oct).
           PulseHook5 takes its fee in beforeSwap, before the buyer settles, so a fresh PoolManager
           holding only this pool's 98 $ would refuse any first buy above ~2.300 $. */
        usdc.bas(address(pm), 10_000_000e6);
        address ben = address(this);
        uint64 n0 = vm.getNonce(ben);
        /* fab n0, ucu n0+1, lk n0+2, lp n0+3 */
        address lpAdr = vm.computeCreateAddress(ben, n0 + 3);
        hook = address(uint160((uint256(keccak256("hook5-sonsuz")) & ~uint256(0x3FFF)) | 0x2ECC));
        PulseFabrika4 fab = new PulseFabrika4();
        ucu = new SepetUcu(IHaberci(address(h)), IERC20S(address(usdc)), ARC, Adres.b32(address(defter)), lpAdr);
        address lk = deployCode("PulseLikiditeKasasi.sol:PulseLikiditeKasasi", abi.encode(address(usdc), lpAdr));
        lp = new PulseLaunchpad5(IQuoteP5(address(usdc)), IPoolManager(address(pm)), IHooks(hook), fab, ucu, address(0xDE7), lk, address(0x15E7));
        assertEq(address(lp), lpAdr, "launchpad adresi");
        Jeton fthm = new Jeton("FTHM");
        FthmYakici yakici = new FthmYakici(IERC20S(address(usdc)), IERC20S(address(fthm)), 1e6, 1e18);
        deployCodeTo("PulseHook5.sol:PulseHook5", abi.encode(address(pm), lpAdr, address(usdc), address(0xDE7), lk, address(0x15E7), address(yakici)), hook);
        kasa = new SepetKasasi(IHaberci(address(h)), IERC20S(address(usdc)), ARC, Adres.b32(address(defter)));
        defter.bagla(ARC, Adres.b32(address(ucu)), Adres.b32(address(kasa)));
        varlik = new Jeton("WARC");
        defter.kilitle();
    }

    function _launch(uint256 alim) internal returns (address token, PoolKey memory key, uint256 merdiven) {
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](1);
        uint256[] memory ref = new uint256[](1);
        k[0] = SepetDefteri.Kalem(ARC, Adres.b32(address(varlik)), 20e6);  ref[0] = 20e18;
        usdc.bas(kurucu, alim + 20e6);
        vm.startPrank(kurucu);
        usdc.approve(address(lp), type(uint256).max);
        (token,) = lp.launch("Sonsuz", "SNS", k, ref, 20_000, alim);
        vm.stopPrank();
        ag.teslim();
        key = lp.havuzAnahtari(token);
        merdiven = IERC20E(token).balanceOf(address(pm));
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
        IERC20E(token).approve(address(t), type(uint256).max);
        t.takas(key, Currency.unwrap(key.currency0) == token, miktar);
        vm.stopPrank();
    }

    /// dollars (6 dp) per whole token (18 dp), scaled by 1e18
    function _fiyat(PoolKey memory key, address token) internal view returns (uint256) {
        (uint160 sp,,,) = IPoolManager(address(pm)).getSlot0(key.toId());
        uint256 p = (uint256(sp) * uint256(sp)) >> 96;                  // currency1 per currency0, x2^96
        if (Currency.unwrap(key.currency0) == token) return (p * 1e30) >> 96;   // usdc raw per token raw ×1e18 ×1e12
        return (uint256(1) << 96) * 1e30 / p;
    }

    function test_acilis_bandi_uca_kadar_ve_yonu_dogru() public {
        (address token, PoolKey memory key,) = _launch(100e6);
        (, int24 alt, int24 ust) = lp.acilisBandi(token);
        bool tokenSifirinci = Currency.unwrap(key.currency0) == token;
        if (tokenSifirinci) assertEq(ust, int24(887_220), "merdiven yukari, uca kadar");
        else assertEq(alt, -int24(887_220), "merdiven asagi (tick uzayinda), uca kadar");
        emit log_named_int("alt", alt);
        emit log_named_int("ust", ust);
    }

    function test_yuz_bin_dolarlik_alimlar_tokeni_tuketmez() public {
        (address token, PoolKey memory key, uint256 merdiven) = _launch(100e6);
        uint256 p0 = _fiyat(key, token);
        uint256 V0 = (merdiven * lp.ACILIS_MCAP()) / lp.SUPPLY();
        uint256 u0 = usdc.balanceOf(address(pm));
        _al(key, address(0xA1), 100_000e6);
        uint256 a1 = IERC20E(token).balanceOf(address(0xA1));
        assertGt(a1, 0, "ilk 100.000 $ token aldi");
        _al(key, address(0xA2), 100_000e6);
        uint256 a2 = IERC20E(token).balanceOf(address(0xA2));
        assertGt(a2, 0, "ikinci 100.000 $ da token aldi");
        assertLt(a2, a1, "ikinci alim daha pahali");
        /* x·y=k: what remains is merdiven · V0 / (V0 + X), never zero */
        uint256 X = usdc.balanceOf(address(pm)) - u0;
        uint256 kalan = IERC20E(token).balanceOf(address(pm));
        assertGt(kalan, 0, "havuzda hala token var");
        assertApproxEqRel(kalan, (merdiven * V0) / (V0 + X), 0.01e18, "kalan token x*y=k ile ayni (%1)");
        emit log_named_uint("200k $ sonra havuzda kalan (token)", kalan / 1e18);
        uint256 p1 = _fiyat(key, token);
        assertGt(p1, p0 * 1000, "fiyat 1000 katin ustune cikabildi");
        emit log_named_uint("ilk 100k $ ile alinan (token)", a1 / 1e18);
        emit log_named_uint("ikinci 100k $ ile alinan (token)", a2 / 1e18);
        emit log_named_uint("fiyat carpani", p1 / p0);
    }

    function test_fiyat_xyk_egrisini_izler() public {
        (address token, PoolKey memory key, uint256 merdiven) = _launch(100e6);
        uint256 p0 = _fiyat(key, token);
        /* the virtual dollar reserve the contract states: ladder tokens × opening price */
        uint256 V0 = (merdiven * lp.ACILIS_MCAP()) / lp.SUPPLY();
        uint256 u0 = usdc.balanceOf(address(pm));
        _al(key, address(0xB1), 3_000e6);
        uint256 X = usdc.balanceOf(address(pm)) - u0;   // the dollars that stayed in the pool
        uint256 p1 = _fiyat(key, token);
        /* x·y=k: p1/p0 = ((V0 + X) / V0)^2 */
        uint256 beklenen = (p0 * (V0 + X) * (V0 + X)) / (V0 * V0);
        assertApproxEqRel(p1, beklenen, 0.005e18, "fiyat x*y=k ile ayni (%0,5)");
        emit log_named_uint("sanal dolar rezervi V0 (1e6)", V0);
        emit log_named_uint("havuzda kalan dolar X (1e6)", X);
        emit log_named_uint("fiyat carpani x1000", (p1 * 1000) / p0);
    }

    function test_herkes_satar_odenen_konan_dolari_asmaz() public {
        (address token, PoolKey memory key,) = _launch(100e6);
        uint256 p0 = _fiyat(key, token);
        uint256 u0 = usdc.balanceOf(address(pm));
        uint256[5] memory tutar = [uint256(100e6), 1_000e6, 200e6, 5_000e6, 50e6];
        uint256 konan;
        for (uint256 i = 0; i < 5; i++) { _al(key, address(uint160(0xC0 + i)), tutar[i]); konan += tutar[i]; }
        uint256 alinan;
        for (uint256 i = 0; i < 5; i++) {
            address k = address(uint160(0xC0 + i));
            uint256 once = usdc.balanceOf(k);
            _sat(key, token, k, IERC20E(token).balanceOf(k));
            alinan += usdc.balanceOf(k) - once;
        }
        assertLt(alinan, konan, "saticilarin aldigi, alicilarin koydugundan az (ucretler)");
        assertGe(usdc.balanceOf(address(pm)), u0 - 1, "havuzun kurucu bandi bozulmadi");
        uint256 p1 = _fiyat(key, token);
        assertApproxEqRel(p1, p0, 0.01e18, "fiyat acilisa dondu");
        emit log_named_uint("alicilarin koydugu (1e6)", konan);
        emit log_named_uint("saticilarin aldigi (1e6)", alinan);
    }
}

contract SonsuzEgriDolarAltta is SonsuzEgriTaban {
    function dolarAdresi() internal pure override returns (address) { return address(0x0000000000000000000000000000000000001111); }
}

contract SonsuzEgriDolarUstte is SonsuzEgriTaban {
    function dolarAdresi() internal pure override returns (address) { return address(0xFFFFFfFfFffffFFfFFffFFFffFfFffFfFFFffFF0); }
}
