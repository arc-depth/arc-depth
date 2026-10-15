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
import {SarmalCevirici, IDolar6S, IYerelCeviriciS} from "../src/arc/nesil3/SarmalCevirici.sol";
import {PulseFabrika} from "../src/arc/PulseFabrika.sol";
import {SwapRouter} from "../src/arc/SwapRouter.sol";

interface IERC20B {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}
interface IDolar6B {
    function sar(uint256) external returns (uint256);
}
interface IKasaB {
    function iade(uint256) external returns (uint256[] memory);
}

/// BNB Chain local collateral. The chain's USDC has 18 decimals, so the
/// launch dollar is the deployed Dolar6 wrapper (pUSDC, 0xb233…) and the
/// converter is SarmalCevirici: unwrap, then the unchanged YerelCevirici
/// runs the founder's Uniswap v3 route from the 18-decimal USDC. The
/// launchpad, vault, hook and router are the same bytecode as on the other
/// chains. On a fork of BNB Chain.
contract NesilBnbTest is Test {
    address constant USDC18 = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address constant D6 = 0xb233F129F7255F86d67BDAEA4e8c4f8274Fa70d9;
    address constant PM = 0x28e2Ea090877bF75740558f6BFB36A5ffeE9e9dF;
    address constant R02 = 0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2;
    address constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address kurucu = address(0xF00D);
    address alici = address(0xB0B);

    function _kur() internal returns (PulseLaunchpad3 lp) {
        address ben = address(this);
        uint64 n0 = vm.getNonce(ben);
        /* fab n0, kf n0+1, lk n0+2, cv n0+3, sc n0+4, lp n0+5 */
        address lpAdr = vm.computeCreateAddress(ben, n0 + 5);
        address hook = address(uint160((uint256(keccak256("hook3-bnb")) & ~uint256(0x3FFF)) | 0xACC));
        PulseFabrika fab = new PulseFabrika();
        YerelKasaFabrika kf = new YerelKasaFabrika(lpAdr);
        address lk = deployCode("PulseLikiditeKasasi.sol:PulseLikiditeKasasi", abi.encode(D6, lpAdr));
        YerelCevirici cv = new YerelCevirici(ISwapRouter02C(R02), IPoolManager(PM));
        SarmalCevirici sc = new SarmalCevirici(IDolar6S(D6), IYerelCeviriciS(address(cv)));
        lp = new PulseLaunchpad3(IQuoteP3(D6), IPoolManager(PM), IHooks(hook), fab, kf,
            address(0xDE7), lk, address(0x15E7), YerelCevirici(address(sc)));
        assertEq(address(lp), lpAdr, "launchpad adresi");
        deployCodeTo("PulseHook.sol:PulseHook", abi.encode(PM, lpAdr, D6, address(0xDE7), lk, address(0x15E7)), hook);
    }

    function _dolar6(address kim, uint256 birim) internal {
        deal(USDC18, kim, birim * 1e12);
        vm.startPrank(kim);
        IERC20B(USDC18).approve(D6, type(uint256).max);
        IDolar6B(D6).sar(birim);
        vm.stopPrank();
    }

    function test_bnb_yerel_teminat() public {
        vm.createSelectFork("bsc");
        PulseLaunchpad3 lp = _kur();
        _dolar6(kurucu, 1_000e6);
        _dolar6(alici, 1_000e6);

        /* the founder pastes WBNB; the page found USDC(18)/WBNB on Uniswap v3 */
        vm.startPrank(kurucu);
        IERC20B(D6).approve(address(lp), type(uint256).max);
        address token; address kasa;
        uint24[3] memory ucretler = [uint24(100), 500, 3000];
        for (uint256 i = 0; i < 3 && token == address(0); i++) {
            try lp.launch("Bnb", "BNBT", PulseLaunchpad3.Teminat(WBNB, 0, abi.encodePacked(USDC18, ucretler[i], WBNB), 1),
                20_000, 200e6, 20e6) returns (address t, address k) { token = t; kasa = k; emit log_named_uint("havuz ucreti", ucretler[i]); }
            catch {}
        }
        vm.stopPrank();
        assertTrue(token != address(0), "launch");
        assertGt(IERC20B(WBNB).balanceOf(kasa), 0, "kasa WBNB tutuyor");
        assertEq(IERC20B(D6).balanceOf(kasa), 0, "teminatin tamami cevrildi");
        emit log_named_uint("kasadaki WBNB (wei)", IERC20B(WBNB).balanceOf(kasa));

        /* trading through the app's router; tax arrives in pUSDC */
        vm.warp(block.timestamp + 30);
        PoolKey memory key = lp.havuzAnahtari(token);
        bool qs = Currency.unwrap(key.currency0) == D6;
        SwapRouter r = new SwapRouter(IPoolManager(PM));
        vm.startPrank(alici);
        IERC20B(D6).approve(address(r), type(uint256).max);
        IERC20B(token).approve(address(r), type(uint256).max);
        uint256 alinan = r.swap(key, qs, 50e6, 1);
        r.swap(key, !qs, alinan / 2, 1);
        assertGt(IERC20B(D6).balanceOf(kasa), 0, "vergi kasada");

        /* redemption pays both */
        IERC20B(token).approve(kasa, type(uint256).max);
        uint256 d0 = IERC20B(D6).balanceOf(alici);
        uint256 w0 = IERC20B(WBNB).balanceOf(alici);
        IKasaB(kasa).iade(IERC20B(token).balanceOf(alici));
        vm.stopPrank();
        assertGt(IERC20B(D6).balanceOf(alici) - d0, 0, "itfa pUSDC");
        assertGt(IERC20B(WBNB).balanceOf(alici) - w0, 0, "itfa WBNB");

        /* the USDC itself: unwrapped straight into the vault */
        _dolar6(kurucu, 100e6);
        vm.prank(kurucu);
        (, address k2) = lp.launch("Usdc", "USD18", PulseLaunchpad3.Teminat(USDC18, 0, "", 1), 20_000, 200e6, 20e6);
        assertEq(IERC20B(USDC18).balanceOf(k2), 20e18, "18 ondalikli USDC kasada");
    }

    function test_bnb_kotu_girdi() public {
        vm.createSelectFork("bsc");
        YerelCevirici cv = new YerelCevirici(ISwapRouter02C(R02), IPoolManager(PM));
        SarmalCevirici sc = new SarmalCevirici(IDolar6S(D6), IYerelCeviriciS(address(cv)));
        vm.expectRevert(SarmalCevirici.KotuGirdi.selector);
        sc.cevir(USDC18, WBNB, 1, 0, "", address(this));
    }
}
