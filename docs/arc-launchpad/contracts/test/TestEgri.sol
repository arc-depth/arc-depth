// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {Launchpad} from "../Launchpad.sol";
import {CollateralVault, IERC20} from "../CollateralVault.sol";
import {LaunchToken} from "../LaunchToken.sol";
import {MockERC20} from "./TestRedemption.sol";
import {MockUSDC6} from "./TestOndalik.sol";

/// @notice What the price actually does as people buy.
///
/// The design says a launch opens at a $1,500 market cap with 30% of the
/// supply in a band reaching sixty times that, and that the buyers' money
/// stays in the pool as the bid for whoever sells next. Those are claims
/// about a curve, and a curve is the kind of thing that should be drawn
/// from measurements rather than described.
///
/// So this runs a real launch against the real Arc PoolManager and then
/// buys, in steps, reading the price out of the pool after each one. What
/// comes back is the ladder: how much it costs to move the market cap from
/// where it opens to anywhere else, how many tokens that buys, and how much
/// USDC has accumulated underneath as a bid by the time it gets there.
///
/// The hook is address(0) here. The 0.50% fee is taken from the output
/// AFTER the swap, so it changes what a buyer receives and not the price
/// path; leaving it out keeps the curve the curve, and the fee is a flat
/// half a percent off every figure in the token column.
contract TestEgri is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    IPoolManager pm;
    PoolKey key;

    struct Adim {
        uint256 harcanan;      // cumulative USDC spent
        uint256 alinan;        // cumulative tokens received
        uint256 havuzUsdc;     // what is sitting in the pool as the bid
        uint256 havuzToken;    // what is left to sell
        uint160 sqrtP;         // the price, after
        bool doldu;            // the band ran out: nothing left to sell
    }

    function run(IPoolManager _pm, uint256 deposit, uint256 degerUsdc, uint256 poolBps, uint256[] calldata alimlar)
        external
        returns (Adim[] memory adimlar, uint160 acilisSqrtP, uint256 tabanFiyat, bool tokenSifirinci)
    {
        pm = _pm;
        MockERC20 col = new MockERC20(deposit * 10, address(this));
        MockUSDC6 usdc = new MockUSDC6(100_000_000 * 1e6, address(this));
        Launchpad lp = new Launchpad(
            /* This test measures depth in DOLLARS and buys with USDC, so
               USDC is both the quote and the collateral — launch() now
               requires them to match. */
            _pm, IHooks(address(0)), IERC20(address(usdc)), 0,
            address(0xDEAD), address(0xBEEF)
        );
        col.approve(address(lp), type(uint256).max);
        usdc.approve(address(lp), type(uint256).max);

        (address token, address vault,) =
            lp.launch("Egri", "EGR", IERC20(address(usdc)), deposit, degerUsdc, poolBps);
        tabanFiyat = CollateralVault(vault).floorPrice();

        bool tokenIsZero = token < address(usdc);
        tokenSifirinci = tokenIsZero;
        key = PoolKey({
            currency0: Currency.wrap(tokenIsZero ? token : address(usdc)),
            currency1: Currency.wrap(tokenIsZero ? address(usdc) : token),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        acilisSqrtP = _fiyat();

        uint256 usdcBas = usdc.balanceOf(address(this));
        uint256 tokBas = LaunchToken(token).balanceOf(address(this));

        adimlar = new Adim[](alimlar.length);
        for (uint256 i = 0; i < alimlar.length; i++) {
            /* Spending USDC: it is currency0 exactly when the token is not.
               Once the band is empty v4 refuses the next swap, which is the
               measurement rather than a failure, so it is caught. */
            bool doldu = false;
            try this.al(!tokenIsZero, alimlar[i]) {} catch { doldu = true; }

            adimlar[i] = Adim({
                harcanan: usdcBas - usdc.balanceOf(address(this)),
                alinan: LaunchToken(token).balanceOf(address(this)) - tokBas,
                havuzUsdc: usdc.balanceOf(address(_pm)),
                havuzToken: LaunchToken(token).balanceOf(address(_pm)),
                sqrtP: _fiyat(),
                doldu: doldu
            });

            if (doldu) {
                Adim[] memory kisa = new Adim[](i + 1);
                for (uint256 j = 0; j <= i; j++) kisa[j] = adimlar[j];
                return (kisa, acilisSqrtP, tabanFiyat, tokenIsZero);
            }
        }
    }

    /// External so the swap can be tried and its revert caught: a plain
    /// internal call cannot be wrapped in try/catch.
    function al(bool zeroForOne, uint256 miktar) external {
        require(msg.sender == address(this));
        pm.unlock(abi.encode(zeroForOne, miktar));
    }

    /// Read out of the PoolManager's own storage: pools live at slot 6 and
    /// slot0 holds sqrtPriceX96 in its low 160 bits.
    function _fiyat() internal view returns (uint160) {
        bytes32 durum = keccak256(abi.encode(PoolId.unwrap(key.toId()), uint256(6)));
        return uint160(uint256(pm.extsload(durum)));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (bool zeroForOne, uint256 miktar) = abi.decode(data, (bool, uint256));
        BalanceDelta d = pm.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(miktar),
                sqrtPriceLimitX96: zeroForOne
                    ? TickMath.MIN_SQRT_PRICE + 1
                    : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        _ode(key.currency0, d.amount0());
        _ode(key.currency1, d.amount1());
        return "";
    }

    function _ode(Currency c, int128 d) internal {
        if (d == 0) return;
        if (d < 0) {
            uint256 borc = uint256(uint128(-d));
            pm.sync(c);
            MockERC20(Currency.unwrap(c)).transfer(address(pm), borc);
            pm.settle();
        } else {
            pm.take(c, address(this), uint256(uint128(d)));
        }
    }
}
