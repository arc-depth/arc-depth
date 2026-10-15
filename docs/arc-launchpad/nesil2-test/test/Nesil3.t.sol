// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PulseLaunchpad3, IQuoteP3} from "../src/arc/nesil3/PulseLaunchpad3.sol";
import {YerelKasaFabrika} from "../src/arc/nesil3/YerelKasaFabrika.sol";
import {YerelCevirici, ISwapRouter02C} from "../src/arc/nesil3/YerelCevirici.sol";
import {PulseFabrika} from "../src/arc/PulseFabrika.sol";
import {V4Takasci} from "../src/V4Takasci.sol";

interface IERC20N {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}
interface ITeminatKasasi {
    function iade(uint256) external returns (uint256[] memory);
    function sepet() external view returns (address[] memory);
}

/// Local collateral: the founder pastes a token's address, the launch
/// converts the $20+ collateral into it through a real Uniswap v3 pool on
/// the launch's own chain, the vault holds it, taxes arrive in dollars, and
/// a redemption pays a share of both. On forks of Base and Arbitrum.
contract Nesil3Test is Test {
    address kurucu = address(0xF00D);
    address alici = address(0xB0B);

    struct Z {
        string ad;
        address usdc;
        address pm;
        address router;
        address varlik;
        uint24 fee;
    }

    function _kur(Z memory z) internal returns (PulseLaunchpad3 lp) {
        address ben = address(this);
        uint64 n0 = vm.getNonce(ben);
        /* fab n0, kf n0+1, lk n0+2, cv n0+3, lp n0+4 */
        address lpAdr = vm.computeCreateAddress(ben, n0 + 4);
        address hook = address(uint160((uint256(keccak256(abi.encode("hook3", z.ad))) & ~uint256(0x3FFF)) | 0xACC));
        PulseFabrika fab = new PulseFabrika();
        YerelKasaFabrika kf = new YerelKasaFabrika(lpAdr);
        address lk = deployCode("PulseLikiditeKasasi.sol:PulseLikiditeKasasi", abi.encode(z.usdc, lpAdr));
        YerelCevirici cv = new YerelCevirici(ISwapRouter02C(z.router), IPoolManager(z.pm));
        lp = new PulseLaunchpad3(IQuoteP3(z.usdc), IPoolManager(z.pm), IHooks(hook), fab, kf,
            address(0xDE7), lk, address(0x15E7), cv);
        assertEq(address(lp), lpAdr, "launchpad adresi");
        deployCodeTo("PulseHook.sol:PulseHook", abi.encode(z.pm, lpAdr, z.usdc, address(0xDE7), lk, address(0x15E7)), hook);
    }

    function _tam(Z memory z) internal {
        PulseLaunchpad3 lp = _kur(z);
        deal(z.usdc, kurucu, 1_000e6);
        deal(z.usdc, alici, 1_000e6);

        /* the founder pastes z.varlik; the page found the v3 pool USDC/varlik */
        bytes memory yol = abi.encodePacked(z.usdc, z.fee, z.varlik);
        vm.startPrank(kurucu);
        IERC20N(z.usdc).approve(address(lp), type(uint256).max);
        (address token, address kasa) = lp.launch("Yerel Teminat", "YT",
            PulseLaunchpad3.Teminat(z.varlik, 0, yol, 1), 20_000, 200e6, 20e6);
        vm.stopPrank();
        uint256 teminatVarlik = IERC20N(z.varlik).balanceOf(kasa);
        assertGt(teminatVarlik, 0, "kasa yapistirilan tokeni tutuyor");
        assertEq(IERC20N(z.usdc).balanceOf(kasa), 0, "teminatin tamami cevrildi");
        emit log_named_uint(string.concat(z.ad, " kasadaki teminat tokeni (ham birim)"), teminatVarlik);

        /* trading: taxes arrive in dollars */
        vm.warp(block.timestamp + 30);
        PoolKey memory key = lp.havuzAnahtari(token);
        bool quoteSifir = Currency.unwrap(key.currency0) == z.usdc;
        V4Takasci t = new V4Takasci(IPoolManager(z.pm));
        vm.startPrank(alici);
        IERC20N(z.usdc).approve(address(t), type(uint256).max);
        IERC20N(token).approve(address(t), type(uint256).max);
        t.takas(key, quoteSifir, 50e6);
        uint256 alinan = IERC20N(token).balanceOf(alici);
        t.takas(key, !quoteSifir, alinan / 2);
        uint256 vergi = IERC20N(z.usdc).balanceOf(kasa);
        assertGt(vergi, 0, "vergi dolar olarak kasada");

        /* redemption pays a share of BOTH */
        IERC20N(token).approve(kasa, type(uint256).max);
        uint256 u0 = IERC20N(z.usdc).balanceOf(alici);
        uint256 v0 = IERC20N(z.varlik).balanceOf(alici);
        ITeminatKasasi(kasa).iade(IERC20N(token).balanceOf(alici));
        uint256 du = IERC20N(z.usdc).balanceOf(alici) - u0;
        uint256 dv = IERC20N(z.varlik).balanceOf(alici) - v0;
        vm.stopPrank();
        assertGt(dv, 0, "itfa teminat tokeninden pay odedi");
        assertGt(du, 0, "itfa dolardan pay odedi");
        emit log_named_uint(string.concat(z.ad, " itfa: teminat tokeni (ham)"), dv);
        emit log_named_uint(string.concat(z.ad, " itfa: USDC (1e6)"), du);
    }

    function _savunma(Z memory z) internal {
        PulseLaunchpad3 lp = _kur(z);
        deal(z.usdc, kurucu, 1_000e6);
        bytes memory yol = abi.encodePacked(z.usdc, z.fee, z.varlik);
        vm.startPrank(kurucu);
        IERC20N(z.usdc).approve(address(lp), type(uint256).max);
        /* a minimum above what the pool gives: the launch refuses */
        vm.expectRevert();
        lp.launch("Asgari", "AS", PulseLaunchpad3.Teminat(z.varlik, 0, yol, type(uint128).max), 20_000, 200e6, 20e6);
        /* a route that does not start at the dollar: refused */
        vm.expectRevert();
        lp.launch("Rota", "RT", PulseLaunchpad3.Teminat(z.varlik, 0, abi.encodePacked(z.varlik, z.fee, z.usdc), 1), 20_000, 200e6, 20e6);
        /* the dollar itself: no conversion, the vault holds dollars */
        (, address kasa) = lp.launch("Dolar", "DL", PulseLaunchpad3.Teminat(z.usdc, 0, "", 0), 20_000, 200e6, 20e6);
        vm.stopPrank();
        assertEq(IERC20N(z.usdc).balanceOf(kasa), 20e6, "dolar teminat");
    }

    function _base() internal pure returns (Z memory) {
        return Z("base", 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, 0x498581fF718922c3f8e6A244956aF099B2652b2b,
            0x2626664c2603336E57B271c5C0b26F421741e481, 0x4200000000000000000000000000000000000006, 500);
    }
    function _arb() internal pure returns (Z memory) {
        return Z("arbitrum", 0xaf88d065e77c8cC2239327C5EDb3A432268e5831, 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32,
            0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45, 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1, 500);
    }

    function test_base_weth() public { vm.createSelectFork("base"); _tam(_base()); }
    function test_arbitrum_weth() public { vm.createSelectFork("arbitrum"); _tam(_arb()); }
    function test_base_savunma() public { vm.createSelectFork("base"); _savunma(_base()); }
}
