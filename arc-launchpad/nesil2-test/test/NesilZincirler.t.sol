// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IERC20Z {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}
interface ILaunchpad2 {
    function launch(string calldata, string calldata, uint32, address, uint256, uint256, uint256) external returns (address, address);
    function havuzAnahtari(address) external view returns (PoolKey memory);
    function quote() external view returns (address);
}
interface IKasa2 {
    function iade(uint256) external returns (uint256, uint256);
    function hak() external view returns (uint256);
    function dolasim() external view returns (uint256);
}

/// A plain v4 swapper: exact input, settles what it owes, takes what it is owed.
contract Takasci is IUnlockCallback {
    IPoolManager public immutable pm;
    constructor(IPoolManager _pm) { pm = _pm; }

    function takas(PoolKey memory key, bool zeroForOne, uint256 girdi) external returns (BalanceDelta d) {
        d = abi.decode(pm.unlock(abi.encode(msg.sender, key, zeroForOne, girdi)), (BalanceDelta));
    }

    function unlockCallback(bytes calldata veri) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        (address kim, PoolKey memory key, bool z, uint256 girdi) = abi.decode(veri, (address, PoolKey, bool, uint256));
        BalanceDelta d = pm.swap(key, SwapParams(z, -int256(girdi), z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
        _kapat(key.currency0, d.amount0(), kim);
        _kapat(key.currency1, d.amount1(), kim);
        return abi.encode(d);
    }

    function _kapat(Currency c, int128 m, address kim) private {
        if (m < 0) {
            pm.sync(c);
            IERC20Z(Currency.unwrap(c)).transferFrom(kim, address(pm), uint256(uint128(-m)));
            pm.settle();
        } else if (m > 0) {
            pm.take(c, kim, uint256(uint128(m)));
        }
    }
}

/// The deployed second-generation launchpads, on forks of their chains:
/// launch, buy, sell and redeem against each chain's real Uniswap v4 and
/// real USDC. Arc is not here: its native USDC moves balances through a
/// precompile revm does not have (measured); Arc's launch path is the same
/// bytecode and was measured 21/21 by olc-pulse-launch.js in generation one.
contract NesilZincirlerTest is Test {
    address kurucu = address(0xF00D);
    address alici = address(0xB0B);

    function _zincir(string memory ad) internal {
        string memory j = vm.readFile("../dagitim-nesil2.json");
        ILaunchpad2 lp = ILaunchpad2(vm.parseJsonAddress(j, string.concat(".ev.", ad, ".PulseLaunchpad2")));
        IPoolManager pm = IPoolManager(vm.parseJsonAddress(j, string.concat(".ev.", ad, ".poolManager")));
        address q = lp.quote();

        deal(q, kurucu, 1_000e6);
        deal(q, alici, 1_000e6);

        /* launch: $200 buy, $100 collateral, dollars kept on this chain */
        vm.startPrank(kurucu);
        IERC20Z(q).approve(address(lp), type(uint256).max);
        (address token, address kasa) = lp.launch("Zincir Test", "ZT", 0, q, 20_000, 200e6, 100e6);
        vm.stopPrank();
        assertTrue(token != address(0) && kasa != address(0), "launch");
        uint256 kurucuToken = IERC20Z(token).balanceOf(kurucu);
        assertGt(kurucuToken, 0, "kurucu tokeni");
        emit log_named_uint(string.concat(ad, " kurucu tokeni (1e18)"), kurucuToken / 1e18);

        vm.warp(block.timestamp + 30);   // past the 5-second snipe window
        PoolKey memory key = lp.havuzAnahtari(token);
        bool quoteSifir = Currency.unwrap(key.currency0) == q;
        Takasci t = new Takasci(pm);

        /* buy $50 */
        vm.startPrank(alici);
        IERC20Z(q).approve(address(t), type(uint256).max);
        IERC20Z(token).approve(address(t), type(uint256).max);
        t.takas(key, quoteSifir, 50e6);
        uint256 alinan = IERC20Z(token).balanceOf(alici);
        assertGt(alinan, 0, "alim");

        /* sell half back */
        uint256 q0 = IERC20Z(q).balanceOf(alici);
        t.takas(key, !quoteSifir, alinan / 2);
        uint256 satistan = IERC20Z(q).balanceOf(alici) - q0;
        assertGt(satistan, 0, "satis");
        emit log_named_uint(string.concat(ad, " 50$ alim, yarisinin satisindan donen (1e6)"), satistan);

        /* redeem the rest at the vault */
        IERC20Z(token).approve(kasa, type(uint256).max);
        uint256 q1 = IERC20Z(q).balanceOf(alici);
        IKasa2(kasa).iade(IERC20Z(token).balanceOf(alici));
        uint256 itfa = IERC20Z(q).balanceOf(alici) - q1;
        assertGt(itfa, 0, "itfa");
        vm.stopPrank();
        emit log_named_uint(string.concat(ad, " kalan yarinin kasadan itfasi (1e6)"), itfa);
    }

    function test_robinhood() public { vm.createSelectFork("robinhood"); _zincir("robinhood"); }
    function test_base() public { vm.createSelectFork("base"); _zincir("base"); }
    function test_arbitrum() public { vm.createSelectFork("arbitrum"); _zincir("arbitrum"); }
    function test_avalanche() public { vm.createSelectFork("avalanche"); _zincir("avalanche"); }
    /* Monad needs its own EVM: forge test --match-test test_monad --fork-url monad */
    function test_monad() public { if (block.chainid != 143) vm.skip(true); _zincir("monad"); }
    function test_hyperevm() public { vm.createSelectFork("hyperevm"); _zincir("hyperevm"); }
}
