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

interface IERC20L {
    function approve(address s, uint256 v) external returns (bool);
    function balanceOf(address w) external view returns (uint256);
    function transfer(address t, uint256 v) external returns (bool);
}

interface ILaunchpadL {
    function launch(
        string calldata name,
        string calldata symbol,
        address collateralToken,
        uint256 deposit,
        uint256 quoteValue,
        uint256 poolBps
    ) external returns (address token, address vault, address rewards);
    function hook() external view returns (address);
    function quote() external view returns (address);
}

/// @notice Does a launch today actually produce a USDC market on Uniswap?
///
/// WHY THIS CANNOT BE ANSWERED BY READING
///   The source opens the pool against `quote`, which is USDC, and the
///   comments say so. But the last token this project launched has no pool
///   at any fee or spacing — because it came out of an older launchpad
///   whose hook is a different address. "The code says so" and "the last
///   one worked" turned out to be two different claims, and neither
///   answers what happens if somebody launches now.
///
///   So this runs the real deployed launchpad with real collateral inside
///   one eth_call, then reads the pool it opened and pushes a USDC buy and
///   a USDC sell through it. Nothing is sent and no gas is paid; the
///   caller's own collateral balance is what funds it, so nothing is
///   invented either.
contract TestLaunchHavuz is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    struct Sonuc {
        address token;
        address vault;
        bytes32 havuzId;
        bool havuzAcildi;
        uint160 sqrtAcilis;
        uint128 likidite;
        uint256 kurucuTokeni;
        uint256 kasadakiTeminat;
        /* a real USDC buy against the pool the launch just opened */
        uint256 alimOdenen;
        uint256 alimAlinan;
        bool alimOldu;
        /* Where the tokens actually went, and where the price actually
           moved. The first run showed a constant 100x markup with no
           slippage at any size, which is not a thin pool — it is liquidity
           somewhere other than where the price is. These three say which. */
        uint256 pmTokeni;
        int24 tickOnce;
        int24 tickSonra;
    }

    IPoolManager pm;
    PoolKey key;
    Sonuc s;
    address usdc;

    function run(
        address launchpad,
        address teminat,
        uint256 yatirim,
        uint256 quoteValue,
        uint256 poolBps,
        address _pm,
        uint256 alimTutari
    ) external returns (Sonuc memory) {
        pm = IPoolManager(_pm);
        ILaunchpadL lp = ILaunchpadL(launchpad);
        usdc = lp.quote();

        IERC20L(teminat).approve(launchpad, type(uint256).max);
        (s.token, s.vault, ) = lp.launch("Deneme", "DNM", teminat, yatirim, quoteValue, poolBps);

        s.kurucuTokeni = IERC20L(s.token).balanceOf(address(this));
        s.kasadakiTeminat = IERC20L(teminat).balanceOf(s.vault);

        /* The key the launchpad builds: token against USDC, fee 0,
           spacing 60, its own hook. Rebuilt here rather than read from a
           manifest, because a manifest is what was wrong last time. */
        bool tokenIsZero = s.token < usdc;
        key = PoolKey({
            currency0: Currency.wrap(tokenIsZero ? s.token : usdc),
            currency1: Currency.wrap(tokenIsZero ? usdc : s.token),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(lp.hook())
        });
        s.havuzId = PoolId.unwrap(key.toId());

        bytes32 slot = keccak256(abi.encode(s.havuzId, uint256(6)));
        bytes32 raw = pm.extsload(slot);
        s.sqrtAcilis = uint160(uint256(raw));
        s.tickOnce = int24(uint24(uint256(raw) >> 160));
        s.pmTokeni = IERC20L(s.token).balanceOf(address(pm));
        s.havuzAcildi = s.sqrtAcilis > 0;
        s.likidite = uint128(uint256(pm.extsload(bytes32(uint256(slot) + 3))));

        /* And the thing the founder's buyers will actually do. */
        if (s.havuzAcildi && alimTutari > 0 &&
            IERC20L(usdc).balanceOf(address(this)) >= alimTutari) {
            try this.alDis(tokenIsZero, alimTutari) { s.alimOldu = true; }
            catch { s.alimOldu = false; }
            bytes32 r2 = pm.extsload(slot);
            s.tickSonra = int24(uint24(uint256(r2) >> 160));
        }
        return s;
    }

    function alDis(bool tokenIsZero, uint256 tutar) external {
        require(msg.sender == address(this));
        /* Paying USDC in: that is zeroForOne when USDC is currency0, which
           is the case when the token sorted above it. */
        pm.unlock(abi.encode(!tokenIsZero, tutar));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (bool zeroForOne, uint256 tutar) = abi.decode(data, (bool, uint256));
        BalanceDelta d = pm.swap(key, SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(tutar),
            sqrtPriceLimitX96: zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        }), "");

        (Currency cIn, Currency cOut) = zeroForOne
            ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        int128 dIn = zeroForOne ? d.amount0() : d.amount1();
        int128 dOut = zeroForOne ? d.amount1() : d.amount0();
        s.alimOdenen = uint256(uint128(-dIn));
        s.alimAlinan = uint256(uint128(dOut));

        pm.sync(cIn);
        IERC20L(usdc).transfer(address(pm), s.alimOdenen);
        pm.settle();
        if (s.alimAlinan > 0) pm.take(cOut, address(this), s.alimAlinan);
        return "";
    }
}
