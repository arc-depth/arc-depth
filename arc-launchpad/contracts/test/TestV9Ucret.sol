// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { TestV8Kural } from "./TestV8Kural.sol";
import { IJetonV4 } from "./TestV4Arc.sol";
import { IERC20S } from "../sepet/IHaberci.sol";

interface IHook6T {
    function sahipAlici() external view returns (address);
    function pazarlamaAlici() external view returns (address);
    function twapTick(address token, uint32 saniye) external view returns (int24);
    function twapUsdcPerToken(address token, uint32 saniye) external view returns (uint256);
    function twapUsdcFor(address token, uint32 saniye, uint128 miktar) external view returns (uint256);
    function twapTokenFor(address token, uint32 saniye, uint128 usdc) external view returns (uint256);
    function havuzOf(address token) external view returns (bytes32);
    function poolManager() external view returns (address);
    function gozle(address token) external;
}

interface IPmT {
    function extsload(bytes32 slot) external view returns (bytes32);
}

/// The v9 set (PulseHook6) on the same simulated set as TestV4Arc / TestV8Kural
/// (scripts/denetim-v9-ucret.js): the v8 launch rules unchanged, the 0.20%
/// operations slice paid as 0.10% + 0.10% to two changeable recipients, and
/// the hook's TWAP oracle.
contract TestV9Ucret is TestV8Kural {
    struct Ucret9 {
        uint256 sahip;        // what the owner-share recipient received
        uint256 pazarlama;    // what the marketing recipient received
        uint256 alinan;       // tokens bought / USDC received by this trader
        uint256 odenen;       // USDC paid / tokens sold
        address sahipAdr;
        address pazarlamaAdr;
    }

    function _bakiyeler(IHook6T h) internal view returns (address s, address p, uint256 bs, uint256 bp) {
        s = h.sahipAlici();
        p = h.pazarlamaAlici();
        bs = USDC.balanceOf(s);
        bp = USDC.balanceOf(p);
    }

    /// An exact-input buy of `tutar` USDC on the last launched token.
    function ucretAl(uint256 tutar) public returns (Ucret9 memory r) {
        IHook6T h = IHook6T(hook);
        (address s, address p, uint256 bs, uint256 bp) = _bakiyeler(h);
        uint256 t0 = IJetonV4(token).balanceOf(address(this));
        kapi.al(token, tutar, 1, 0, _b(address(this)), "", address(this));
        r.alinan = IJetonV4(token).balanceOf(address(this)) - t0;
        r.odenen = tutar;
        r.sahip = USDC.balanceOf(s) - bs;
        r.pazarlama = USDC.balanceOf(p) - bp;
        r.sahipAdr = s;
        r.pazarlamaAdr = p;
    }

    /// An exact-input sale of `miktar` tokens, paid here on Arc.
    function ucretSat(uint256 miktar) public returns (Ucret9 memory r) {
        IHook6T h = IHook6T(hook);
        (address s, address p, uint256 bs, uint256 bp) = _bakiyeler(h);
        IJetonV4(token).approve(address(kapi), miktar);
        uint256 u0 = USDC.balanceOf(address(this));
        kapi.satArc(token, miktar, 1, ARC, _b(address(this)), 0);
        r.alinan = USDC.balanceOf(address(this)) - u0;
        r.odenen = miktar;
        r.sahip = USDC.balanceOf(s) - bs;
        r.pazarlama = USDC.balanceOf(p) - bp;
        r.sahipAdr = s;
        r.pazarlamaAdr = p;
    }

    /// Sell everything this contract holds of the last token.
    function hepsiniSat() external returns (Ucret9 memory) {
        return ucretSat(IJetonV4(token).balanceOf(address(this)));
    }

    /// The pool's spot tick (slot0, StateLibrary layout: pools slot 6).
    function spotTick() public view returns (int24 tick) {
        IHook6T h = IHook6T(hook);
        bytes32 yuva = keccak256(abi.encode(h.havuzOf(token), uint256(6)));
        uint256 w = uint256(IPmT(h.poolManager()).extsload(yuva));
        tick = int24(uint24(w >> 160));
    }

    struct Fiyat { int24 twap; int24 spot; uint256 usdcFor1e24; uint256 tokenFor1usd; uint256 usdcPer1e30; }

    function fiyat(uint32 saniye) public view returns (Fiyat memory f) {
        IHook6T h = IHook6T(hook);
        f.twap = h.twapTick(token, saniye);
        f.spot = spotTick();
        f.usdcFor1e24 = h.twapUsdcFor(token, saniye, 1e24);
        f.tokenFor1usd = h.twapTokenFor(token, saniye, 1e6);
        f.usdcPer1e30 = h.twapUsdcPerToken(token, saniye);
    }

    /// An observation for the last token (anyone may call the hook's gozle).
    function gozleT() external {
        IHook6T(hook).gozle(token);
    }

    /// A pump: one large buy, then the 30-minute TWAP read in the same
    /// transaction (the same block). Returns the price before and after.
    function pompala(uint256 tutar, uint32 saniye) external returns (Fiyat memory once, Fiyat memory sonra) {
        once = fiyat(saniye);
        kapi.al(token, tutar, 1, 0, _b(address(this)), "", address(this));
        sonra = fiyat(saniye);
    }
}
