// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { BeforeSwapDelta, BeforeSwapDeltaLibrary } from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { FarkUcreti } from "./FarkUcreti.sol";
import { IEvFiyati } from "./IkizHavuz.sol";

/// @title FarkHookAg — an FTHM pool on any chain, priced against Arc
/// @notice Generation two of FTHMFarkHook. The Arc price no longer arrives
///         at the hook itself: FiyatAgi, one address on all nine chains,
///         receives it and files it under this chain's FTHM address, and the
///         hook reads it there. So the hook is not an OApp, has no owner and
///         nothing to configure — its constructor is everything.
///
///         Arc is the anchor. Two non-Arc pools are never compared to each
///         other, only each to Arc, and that is enough: a loop that buys on
///         chain X and sells on chain Y pays the X-to-Arc gap if X is below
///         Arc and the Y-to-Arc gap if Y is above it, and whatever is left is
///         a loss to the arbitrageur.
///
/// @dev Permission bits 0xC4: beforeSwap, afterSwap, afterSwapReturnDelta.
contract FarkHookAg {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint256 private constant Q192 = 1 << 192;

    IPoolManager public immutable havuzYoneticisi;
    address public immutable fthm;
    address public immutable para;
    address public immutable kasa;
    IEvFiyati public immutable fiyatAgi;
    uint64 public immutable azamiYas;
    uint24 public immutable tavanPpm;

    uint24 transient bekleyenPpm;

    event FarkUcretiAlindi(PoolId indexed havuz, address para, uint256 miktar, uint24 ppm);
    error NotPoolManager();
    error BilinmeyenHavuz();

    modifier onlyPoolManager() {
        if (msg.sender != address(havuzYoneticisi)) revert NotPoolManager();
        _;
    }

    constructor(IPoolManager pm, address fthm_, address para_, address kasa_, IEvFiyati fiyatAgi_, uint64 azamiYas_, uint24 tavanPpm_) {
        havuzYoneticisi = pm;
        fthm = fthm_;
        para = para_;
        kasa = kasa_;
        fiyatAgi = fiyatAgi_;
        azamiYas = azamiYas_;
        tavanPpm = tavanPpm_;
    }

    function _bizimHavuz(PoolKey calldata key) private view returns (bool fthmToken0) {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (!((c0 == fthm && c1 == para) || (c0 == para && c1 == fthm))) revert BilinmeyenHavuz();
        if (address(key.hooks) != address(this)) revert BilinmeyenHavuz();
        return c0 == fthm;
    }

    /// The Arc price in this pool's order, and when it was read on Arc.
    function referans(bool fthmToken0) public view returns (uint160 s, uint64 z) {
        (s, z) = fiyatAgi.evFiyati(fthm);
        if (s != 0 && !fthmToken0) s = uint160(Q192 / s);
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata p, bytes calldata)
        external onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24)
    {
        bool fthmToken0 = _bizimHavuz(key);
        (uint160 yerel,,,) = havuzYoneticisi.getSlot0(key.toId());
        (uint160 ref, uint64 z) = referans(fthmToken0);
        bool fthmAliniyor = fthmToken0 ? !p.zeroForOne : p.zeroForOne;
        bekleyenPpm = FarkUcreti.hesapla(yerel, ref, fthmToken0, fthmAliniyor, z, uint64(block.timestamp), azamiYas, tavanPpm);
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata p, BalanceDelta delta, bytes calldata)
        external onlyPoolManager returns (bytes4, int128)
    {
        _bizimHavuz(key);
        uint24 ppm = bekleyenPpm;
        bekleyenPpm = 0;
        if (ppm == 0) return (IHooks.afterSwap.selector, 0);
        /* the unspecified side: the output of exact-input, the input of
           exact-output — so an exact-output router does not dodge it */
        bool exactInput = p.amountSpecified < 0;
        bool belirtilmeyen0 = exactInput ? !p.zeroForOne : p.zeroForOne;
        int128 m = belirtilmeyen0 ? delta.amount0() : delta.amount1();
        uint256 taban = m >= 0 ? uint256(uint128(m)) : uint256(uint128(-m));
        uint256 u = (taban * ppm) / 1_000_000;
        if (u == 0) return (IHooks.afterSwap.selector, 0);
        Currency c = belirtilmeyen0 ? key.currency0 : key.currency1;
        havuzYoneticisi.take(c, kasa, u);
        emit FarkUcretiAlindi(key.toId(), Currency.unwrap(c), u, ppm);
        return (IHooks.afterSwap.selector, int128(uint128(u)));
    }
}
