// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PulseLaunchpad3} from "../src/arc/nesil3/PulseLaunchpad3.sol";
import {SwapRouter} from "../src/arc/SwapRouter.sol";

/// Uniswap V4Quoter — the page quotes with it before every trade.
interface IV4QuoterR {
    struct P { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }
    function quoteExactInputSingle(P memory params) external returns (uint256 amountOut, uint256 gasEstimate);
}

interface IERC20R {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// The app's trade path on every launch chain: the audited SwapRouter
/// (unchanged), deployed fresh on a fork, buying and selling a token
/// launched by the DEPLOYED PulseLaunchpad3 — with the minimum enforced.
contract NesilRouterTest is Test {
    address kurucu = address(0xF00D);
    address alici = address(0xB0B);

    function _zincir(string memory ad, address quoter) internal {
        string memory j = vm.readFile("../dagitim-nesil3.json");
        PulseLaunchpad3 lp = PulseLaunchpad3(vm.parseJsonAddress(j, string.concat(".", ad, ".PulseLaunchpad3")));
        address q = vm.parseJsonAddress(j, string.concat(".", ad, ".quote"));
        address pm = vm.parseJsonAddress(j, string.concat(".", ad, ".poolManager"));
        deal(q, kurucu, 1_000e6);
        deal(q, alici, 1_000e6);
        vm.startPrank(kurucu);
        IERC20R(q).approve(address(lp), type(uint256).max);
        (address token,) = lp.launch("Rota", "RTA", PulseLaunchpad3.Teminat(q, 0, "", 0), 20_000, 200e6, 20e6);
        vm.stopPrank();
        vm.warp(block.timestamp + 30);

        PoolKey memory key = lp.havuzAnahtari(token);
        bool qs = Currency.unwrap(key.currency0) == q;
        SwapRouter r = new SwapRouter(IPoolManager(pm));
        vm.startPrank(alici);
        IERC20R(q).approve(address(r), type(uint256).max);
        IERC20R(token).approve(address(r), type(uint256).max);
        (uint256 teklif,) = IV4QuoterR(quoter).quoteExactInputSingle(IV4QuoterR.P(key, qs, 25e6, ""));
        uint256 alinan = r.swap(key, qs, 25e6, (teklif * 97) / 100);
        assertEq(alinan, teklif, "alim = quoter teklifi");
        assertEq(IERC20R(token).balanceOf(alici), alinan, "alim");
        vm.expectRevert();
        r.swap(key, !qs, alinan / 2, type(uint128).max);   // minimum not met
        uint256 u0 = IERC20R(q).balanceOf(alici);
        (uint256 teklif2,) = IV4QuoterR(quoter).quoteExactInputSingle(IV4QuoterR.P(key, !qs, uint128(alinan / 2), ""));
        uint256 donen = r.swap(key, !qs, alinan / 2, (teklif2 * 97) / 100);
        assertEq(donen, teklif2, "satis = quoter teklifi");
        vm.stopPrank();
        assertEq(IERC20R(q).balanceOf(alici) - u0, donen, "satis");
        assertEq(IERC20R(q).balanceOf(address(r)) + IERC20R(token).balanceOf(address(r)), 0, "router bos");
        emit log_named_uint(string.concat(ad, " 25 USD alim -> satilan yarinin dolari (ham)"), donen);
    }

    function test_base() public { vm.createSelectFork("base"); _zincir("base", 0x0d5e0F971ED27FBfF6c2837bf31316121532048D); }
    function test_arbitrum() public { vm.createSelectFork("arbitrum"); _zincir("arbitrum", 0x3972C00f7ed4885e145823eb7C655375d275A1C5); }
    function test_avalanche() public { vm.createSelectFork("avalanche"); _zincir("avalanche", 0xbE40675BB704506a3c2Ccfb762DCFd1e979845C2); }
    function test_robinhood() public { vm.createSelectFork("robinhood"); _zincir("robinhood", 0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94); }
    function test_monad() public { if (block.chainid != 143) vm.skip(true); _zincir("monad", 0xa222Dd357A9076d1091Ed6Aa2e16C9742dD26891); }
}
