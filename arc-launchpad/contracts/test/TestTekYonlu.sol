// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {MockERC20} from "./TestRedemption.sol";

/// @notice Can a v4 position be funded with the token alone?
///
/// WHY THIS HAS TO BE MEASURED BEFORE ANYTHING IS REWRITTEN
///   The plan is a collateral vault plus locked Uniswap liquidity, and the
///   depositor's money has to stay recoverable. Both can only be true at
///   once if the pool costs the depositor no collateral — which means the
///   liquidity has to sit entirely ABOVE the opening price, so the pool asks
///   for tokens and nothing else.
///
///   That is what concentrated liquidity should do: a range above the
///   current price is all token, a range below is all collateral. Should is
///   not a measurement. If v4 on Arc asks for even a wei of the collateral
///   side, the whole structure is wrong and it is better to find out in an
///   eth_call than after rewriting the launchpad around it.
///
///   Both orderings are checked, because which currency is which depends on
///   address order and the asymmetry is exactly where this would go wrong.
contract TestTekYonlu is IUnlockCallback {
    IPoolManager pm;

    struct Sonuc {
        int256 tokenTalep;        // what the pool wanted of the token
        int256 teminatTalep;      // what it wanted of the collateral
        uint128 likidite;
        int24 altTick;
        int24 ustTick;
        int24 acilisTick;
        bool tokenSifirinci;
    }

    struct Veri {
        PoolKey key;
        int24 lower;
        int24 upper;
        uint128 liq;
    }

    Sonuc s;

    /// `tokenIlk` forces the address ordering so both branches get covered
    /// rather than whichever one the deployment addresses happened to give.
    function run(IPoolManager _pm, bool tokenIlk, uint256 arz, uint160 acilisSqrt)
        external
        returns (Sonuc memory)
    {
        pm = _pm;
        MockERC20 a = new MockERC20(arz, address(this));
        MockERC20 b = new MockERC20(arz, address(this));

        // Pick which of the two is "the token" so that the token ends up on
        // the side the caller asked for.
        address token = (address(a) < address(b)) == tokenIlk ? address(a) : address(b);
        address teminat = token == address(a) ? address(b) : address(a);
        bool tokenSifirinci = token < teminat;
        s.tokenSifirinci = tokenSifirinci;

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(tokenSifirinci ? token : teminat),
            currency1: Currency.wrap(tokenSifirinci ? teminat : token),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        pm.initialize(key, acilisSqrt);
        int24 acilis = TickMath.getTickAtSqrtPrice(acilisSqrt);
        s.acilisTick = acilis;

        /* The band has to be on the side of the price where the TOKEN lives.
           If the token is currency0 its price is currency1-per-currency0, so
           "token is expensive" is a higher tick and the sell-side band sits
           ABOVE the opening tick. If the token is currency1 the price is
           inverted and the same band sits BELOW. Getting this backwards is
           the failure mode worth catching: it would silently ask for
           collateral instead of tokens. */
        int24 bir = 60;
        int24 lower;
        int24 upper;
        if (tokenSifirinci) {
            lower = ((acilis / bir) + 1) * bir;
            upper = lower + bir * 4000;
        } else {
            upper = ((acilis / bir) - 1) * bir;
            lower = upper - bir * 4000;
        }
        s.altTick = lower;
        s.ustTick = upper;

        s.likidite = 1e18;
        pm.unlock(abi.encode(Veri(key, lower, upper, s.likidite)));
        return s;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        Veri memory v = abi.decode(data, (Veri));
        (BalanceDelta delta,) = pm.modifyLiquidity(
            v.key,
            ModifyLiquidityParams({
                tickLower: v.lower,
                tickUpper: v.upper,
                liquidityDelta: int256(uint256(v.liq)),
                salt: bytes32(0)
            }),
            ""
        );

        // Negative means the pool is owed that currency. Recorded as the
        // pool reported it, with no interpretation.
        int256 d0 = int256(delta.amount0());
        int256 d1 = int256(delta.amount1());
        s.tokenTalep = s.tokenSifirinci ? d0 : d1;
        s.teminatTalep = s.tokenSifirinci ? d1 : d0;

        // Settle so the call does not revert on an open delta; the amounts
        // are already recorded.
        _ode(v.key.currency0, delta.amount0());
        _ode(v.key.currency1, delta.amount1());
        return "";
    }

    function _ode(Currency c, int128 d) internal {
        if (d >= 0) return;
        uint256 borc = uint256(uint128(-d));
        pm.sync(c);
        MockERC20(Currency.unwrap(c)).transfer(address(pm), borc);
        pm.settle();
    }
}
