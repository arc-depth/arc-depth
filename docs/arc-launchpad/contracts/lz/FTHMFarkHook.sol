// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OApp, Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
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

/// @title FTHMFarkHook — the Robinhood FTHM/USDG pool, priced against Arc
/// @notice Holds the last Arc FTHM price, carried here by FiyatElcisi over
///         LayerZero, and charges any swap that would capture the gap
///         between the two pools exactly that gap (FarkUcreti). The fee
///         goes to `kasa`, the FTHM floor vault on this chain, so the
///         difference lands under the floor instead of with an arbitrageur.
///
///         Why only this side: the Arc pool's hook cannot be changed, and it
///         does not have to be. A loop that exploits the gap has to buy here
///         when this side is cheap or sell here when it is dear, and both of
///         those are the direction charged.
///
/// @dev Hook permissions: beforeSwap, afterSwap, afterSwapReturnDelta
///      (address low bits 0xC4). beforeSwap reads the PRE-swap price and
///      parks the rate in transient storage; afterSwap charges it on the
///      unspecified side, which covers exact-input and exact-output alike.
///
///      References only move forward in time: a delayed older message
///      cannot roll the price back.
contract FTHMFarkHook is OApp {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 private constant Q192 = 1 << 192;

    IPoolManager public immutable havuzYoneticisi;
    address public immutable fthm;
    address public immutable usdg;
    address public immutable kasa;
    uint64 public immutable azamiYas;
    uint24 public immutable tavanPpm;

    uint160 public refSqrtP;
    uint64 public refZaman;

    uint24 transient bekleyenPpm;

    event ReferansGuncellendi(uint160 sqrtPriceX96, uint64 zaman);
    event FarkUcretiAlindi(PoolId indexed havuz, address para, uint256 miktar, uint24 ppm);
    event SahiplikYakildi();

    error NotPoolManager();
    error BilinmeyenHavuz();

    modifier onlyPoolManager() {
        if (msg.sender != address(havuzYoneticisi)) revert NotPoolManager();
        _;
    }

    constructor(
        address lzEndpoint,
        address kurulumcu,
        IPoolManager havuzYoneticisi_,
        address fthm_,
        address usdg_,
        address kasa_,
        uint64 azamiYas_,
        uint24 tavanPpm_
    ) OApp(lzEndpoint, kurulumcu) Ownable(kurulumcu) {
        havuzYoneticisi = havuzYoneticisi_;
        fthm = fthm_;
        usdg = usdg_;
        kasa = kasa_;
        azamiYas = azamiYas_;
        tavanPpm = tavanPpm_;
    }

    function sahipligiYak() external onlyOwner {
        endpoint.setDelegate(DEAD);
        renounceOwnership();
        emit SahiplikYakildi();
    }

    /* ------------------------------------------------------------ LZ in */

    function _lzReceive(Origin calldata, bytes32, bytes calldata m, address, bytes calldata) internal override {
        (uint160 arcSqrtP, uint64 zaman, bool arcFthmToken0) = abi.decode(m, (uint160, uint64, bool));
        if (zaman <= refZaman) return;
        /* Store the price in THIS pool's token order. If FTHM sits on the
           other side here, the sqrt price inverts: sqrt(1/p) = 2^96 / sqrt(p)
           in X96, i.e. 2^192 / sqrtPriceX96. */
        bool buradaToken0 = fthm < usdg;
        uint160 s = arcFthmToken0 == buradaToken0 ? arcSqrtP : uint160(Q192 / arcSqrtP);
        refSqrtP = s;
        refZaman = zaman;
        emit ReferansGuncellendi(s, zaman);
    }

    /* ---------------------------------------------------------- hooks */

    function _bizimHavuz(PoolKey calldata key) private view returns (bool fthmToken0) {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (!((c0 == fthm && c1 == usdg) || (c0 == usdg && c1 == fthm))) revert BilinmeyenHavuz();
        if (address(key.hooks) != address(this)) revert BilinmeyenHavuz();
        return c0 == fthm;
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata p, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        bool fthmToken0 = _bizimHavuz(key);
        (uint160 yerel,,,) = havuzYoneticisi.getSlot0(key.toId());
        /* FTHM is bought when the input is USDG. */
        bool fthmAliniyor = fthmToken0 ? !p.zeroForOne : p.zeroForOne;
        bekleyenPpm = FarkUcreti.hesapla(
            yerel, refSqrtP, fthmToken0, fthmAliniyor, refZaman, uint64(block.timestamp), azamiYas, tavanPpm
        );
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata p, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        _bizimHavuz(key);
        uint24 ppm = bekleyenPpm;
        bekleyenPpm = 0;
        if (ppm == 0) return (IHooks.afterSwap.selector, 0);

        /* The unspecified side — the only one afterSwap may move:
             exact-input  -> the output
             exact-output -> the input
           Charging it covers both, so an exact-output router is not a way
           around the fee. */
        bool exactInput = p.amountSpecified < 0;
        bool belirtilmeyen0 = exactInput ? !p.zeroForOne : p.zeroForOne;
        int128 m = belirtilmeyen0 ? delta.amount0() : delta.amount1();
        uint256 taban = m >= 0 ? uint256(uint128(m)) : uint256(uint128(-m));
        uint256 ucret = (taban * ppm) / 1_000_000;
        if (ucret == 0) return (IHooks.afterSwap.selector, 0);

        Currency para = belirtilmeyen0 ? key.currency0 : key.currency1;
        havuzYoneticisi.take(para, kasa, ucret);
        emit FarkUcretiAlindi(key.toId(), Currency.unwrap(para), ucret, ppm);
        return (IHooks.afterSwap.selector, int128(uint128(ucret)));
    }
}
