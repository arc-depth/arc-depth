// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

interface IArcLaunchHook {
    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        returns (bytes4, int128);
    /* holderAccrued, devAccrued and protocolAccrued are gone from the hook
       along with the sweeps that paid them. One bucket is left because
       there is one destination. */
    function floorAccrued(PoolId, Currency) external view returns (uint256);
}

/// @notice Stands in for the PoolManager so the fee arithmetic can be exercised.
///
/// The hook only accepts calls from its pool manager and calls `take` back on
/// it, so there is no way to test afterSwap from the outside — something has to
/// occupy that role. This does, and nothing else: `take` records the request
/// instead of moving funds, because what is being tested is which currency the
/// hook charges and how much, not the settlement that v4 already handles.
///
/// It also runs the call and reads the buckets in ONE transaction. eth_call
/// discards state, so measuring a write and then reading it back in a second
/// call would always report zero.
contract TestPoolManager {
    using PoolIdLibrary for PoolKey;

    Currency public lastTakeCurrency;
    address public lastTakeTo;
    uint256 public lastTakeAmount;
    uint256 public takeCount;

    function take(Currency currency, address to, uint256 amount) external {
        lastTakeCurrency = currency;
        lastTakeTo = to;
        lastTakeAmount = amount;
        takeCount++;
    }

    /* The claim side. take() and mint() are not interchangeable and the
       harness has to tell them apart: take moves real tokens out of the
       manager's balance, mint only credits a claim. The hook uses take
       for a fee charged on the side leaving the pool and mint for one
       charged on the side coming in, which has not been paid yet — so a
       harness that recorded both as "taken" would hide the distinction
       this exists to make. */
    Currency public lastMintCurrency;
    address public lastMintTo;
    uint256 public lastMintAmount;
    uint256 public mintCount;

    function mint(address to, uint256 id, uint256 amount) external {
        lastMintCurrency = Currency.wrap(address(uint160(id)));
        lastMintTo = to;
        lastMintAmount = amount;
        mintCount++;
    }

    /* No claim is ever outstanding here, so alacagiBozdur is a no-op and
       never tries to unlock a manager that cannot be unlocked. */
    function balanceOf(address, uint256) external pure returns (uint256) {
        return 0;
    }

    struct Sonuc {
        int128 hookDelta;
        uint256 holder;
        uint256 dev;
        uint256 protocolPay;
        uint256 liquidity;
        uint256 taken;
        address takenTo;
        address takenCurrency;
        uint256 minted;
        address mintedTo;
        address mintedCurrency;
        uint256 takeSayisi;
        uint256 mintSayisi;
    }

    /// Drives one afterSwap and reports everything it produced.
    function calistir(
        IArcLaunchHook hook,
        PoolKey calldata key,
        bool zeroForOne,
        int256 amountSpecified,
        int128 amount0,
        int128 amount1
    ) external returns (Sonuc memory s) {
        SwapParams memory p =
            SwapParams({zeroForOne: zeroForOne, amountSpecified: amountSpecified, sqrtPriceLimitX96: 0});

        (, s.hookDelta) = hook.afterSwap(address(this), key, p, toBalanceDelta(amount0, amount1), "");

        PoolId id = key.toId();
        Currency c = lastTakeCurrency;
        /* Kept in the struct so the test can assert they are ZERO rather
           than simply stop looking at them — a field that disappears from
           a harness is a claim nobody checks any more. */
        s.holder = 0;
        s.dev = 0;
        s.protocolPay = 0;
        s.liquidity = hook.floorAccrued(id, c);
        s.taken = lastTakeAmount;
        s.takenTo = lastTakeTo;
        s.takenCurrency = Currency.unwrap(c);
        s.minted = lastMintAmount;
        s.mintedTo = lastMintTo;
        s.mintedCurrency = Currency.unwrap(lastMintCurrency);
        s.takeSayisi = takeCount;
        s.mintSayisi = mintCount;
        /* The bucket is read under whichever currency actually carried the
           fee, so an exact-output swap reports its own bucket and not an
           empty one belonging to the take path. */
        if (mintCount > 0 && takeCount == 0) s.liquidity = hook.floorAccrued(id, lastMintCurrency);
    }
}
