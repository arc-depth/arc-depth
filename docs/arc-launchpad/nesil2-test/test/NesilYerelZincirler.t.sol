// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PulseLaunchpad3} from "../src/arc/nesil3/PulseLaunchpad3.sol";
import {V4Takasci} from "../src/V4Takasci.sol";

interface IERC20Y {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}
interface ITeminatKasasiY {
    function iade(uint256) external returns (uint256[] memory);
}

/// The DEPLOYED local-collateral launchpads (dagitim-nesil3.json), on forks
/// of their chains, with the routes teminat-bul.js found on 14 Oct 2026:
/// launch with $20 collateral converted into the pasted token, buy, sell,
/// redeem (a share of the token and of the dollar taxes).
contract NesilYerelZincirlerTest is Test {
    address kurucu = address(0xF00D);
    address alici = address(0xB0B);

    function _zincir(string memory ad, address varlik, uint24 fee) internal {
        string memory j = vm.readFile("../dagitim-nesil3.json");
        PulseLaunchpad3 lp = PulseLaunchpad3(vm.parseJsonAddress(j, string.concat(".", ad, ".PulseLaunchpad3")));
        address q = vm.parseJsonAddress(j, string.concat(".", ad, ".quote"));
        address pm = vm.parseJsonAddress(j, string.concat(".", ad, ".poolManager"));
        deal(q, kurucu, 1_000e6);
        deal(q, alici, 1_000e6);

        vm.startPrank(kurucu);
        IERC20Y(q).approve(address(lp), type(uint256).max);
        (address token, address kasa) = lp.launch("Yerel", "YRL",
            PulseLaunchpad3.Teminat(varlik, 0, abi.encodePacked(q, fee, varlik), 1), 20_000, 200e6, 20e6);
        vm.stopPrank();
        uint256 tv = IERC20Y(varlik).balanceOf(kasa);
        assertGt(tv, 0, "teminat tokeni kasada");
        emit log_named_uint(string.concat(ad, " kasadaki teminat tokeni (ham)"), tv);

        vm.warp(block.timestamp + 30);
        PoolKey memory key = lp.havuzAnahtari(token);
        bool qs = Currency.unwrap(key.currency0) == q;
        V4Takasci t = new V4Takasci(IPoolManager(pm));
        vm.startPrank(alici);
        IERC20Y(q).approve(address(t), type(uint256).max);
        IERC20Y(token).approve(address(t), type(uint256).max);
        t.takas(key, qs, 50e6);
        t.takas(key, !qs, IERC20Y(token).balanceOf(alici) / 2);
        IERC20Y(token).approve(kasa, type(uint256).max);
        uint256 v0 = IERC20Y(varlik).balanceOf(alici);
        uint256 u0 = IERC20Y(q).balanceOf(alici);
        ITeminatKasasiY(kasa).iade(IERC20Y(token).balanceOf(alici));
        vm.stopPrank();
        assertGt(IERC20Y(varlik).balanceOf(alici) - v0, 0, "itfa: teminat tokeni");
        assertGt(IERC20Y(q).balanceOf(alici) - u0, 0, "itfa: dolar");
    }

    function test_base() public { vm.createSelectFork("base"); _zincir("base", 0x4200000000000000000000000000000000000006, 100); }
    function test_arbitrum() public { vm.createSelectFork("arbitrum"); _zincir("arbitrum", 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1, 100); }
    function test_avalanche() public { vm.createSelectFork("avalanche"); _zincir("avalanche", 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7, 500); }
    function test_robinhood() public { vm.createSelectFork("robinhood"); _zincir("robinhood", 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73, 100); }
    /* forge test --match-test test_monad --fork-url monad */
    function test_monad() public { if (block.chainid != 143) vm.skip(true); _zincir("monad", 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A, 3000); }
}
