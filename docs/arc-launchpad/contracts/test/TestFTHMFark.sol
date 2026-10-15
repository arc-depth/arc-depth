// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { FiyatElcisi } from "../lz/FiyatElcisi.sol";
import { FTHMFarkHook } from "../lz/FTHMFarkHook.sol";
import { SahteUcNokta } from "./SahteLz.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta, toBalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";

interface IFarkHook {
    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata) external returns (bytes4, int256, uint24);
    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata) external returns (bytes4, int128);
}

/// @notice Stands in for a PoolManager: one slot0 price for every pool
///         (served through extsload, which is what StateLibrary reads), and
///         take() recorded instead of executed. `swap` runs beforeSwap then
///         afterSwap from the manager's address, as v4 does.
contract FarkPM {
    uint160 public sqrtP;
    address public sonAlinanPara;
    address public sonAlici;
    uint256 public sonMiktar;
    uint256 public alimSayisi;

    function fiyatKoy(uint160 s) external { sqrtP = s; }
    function extsload(bytes32) external view returns (bytes32) { return bytes32(uint256(sqrtP)); }

    function take(Currency c, address to, uint256 amount) external {
        sonAlinanPara = Currency.unwrap(c); sonAlici = to; sonMiktar = amount; alimSayisi++;
    }

    function swap(address hook, PoolKey calldata key, bool zeroForOne, int256 amountSpecified, int128 a0, int128 a1)
        external returns (int128 hookDelta)
    {
        SwapParams memory p = SwapParams(zeroForOne, amountSpecified, 0);
        IFarkHook(hook).beforeSwap(address(this), key, p, "");
        (, hookDelta) = IFarkHook(hook).afterSwap(address(this), key, p, toBalanceDelta(a0, a1), "");
    }
}

/// @title TestFTHMFark — Arc price over LayerZero, gap fee on Robinhood
contract TestFTHMFark {
    uint32 constant ARC = 30417;
    uint32 constant RH = 30416;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant FTHM = address(0x1000);   // < USDG, so FTHM is token0 on Robinhood
    address constant KASA = address(0xCA5A);
    uint64 constant YAS = 900;
    uint24 constant TAVAN = 100_000;

    struct Sonuc {
        uint256 refsizUcret; uint256 refsizAlim;
        uint160 ref; uint64 refZaman;
        uint256 alimUcret; address alimPara; address alimKasa; int128 alimDelta;
        uint256 satimAlimSayisiFark;
        uint256 exactOutUcret; address exactOutPara;
        uint256 terstenUcret;
        bool eskiMesajYokSayildi;
        bool sahteReddedildi; bool yabanciHavuzReddedildi; bool pmDisiReddedildi;
    }

    function _b(address a) private pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    function sqrtFiyat(uint256 num, uint256 den) public pure returns (uint160) {
        uint256 x = (num << 192) / den;
        uint256 z = (x + 1) / 2; uint256 y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
        return uint160(y);
    }

    function _key(address hook) private pure returns (PoolKey memory) {
        return PoolKey(Currency.wrap(FTHM), Currency.wrap(USDG), 0, 60, IHooks(hook));
    }

    function _kur(bool arcFthmToken0, uint160 arcFiyat)
        private returns (FarkPM pmRh, FTHMFarkHook hook, FiyatElcisi elci, SahteUcNokta epArc, SahteUcNokta epRh)
    {
        epArc = new SahteUcNokta(ARC);
        epRh = new SahteUcNokta(RH);
        FarkPM pmArc = new FarkPM();
        pmArc.fiyatKoy(arcFiyat);
        pmRh = new FarkPM();
        elci = new FiyatElcisi(address(epArc), address(this), IPoolManager(address(pmArc)), PoolId.wrap(bytes32(uint256(1))), arcFthmToken0, RH);
        hook = new FTHMFarkHook(address(epRh), address(this), IPoolManager(address(pmRh)), FTHM, USDG, KASA, YAS, TAVAN);
        elci.setPeer(RH, _b(address(hook)));
        hook.setPeer(ARC, _b(address(elci)));
    }

    function run() external returns (Sonuc memory s) {
        /* Arc FTHM = 1.25 USD (FTHM token0 there too). Robinhood FTHM = 1.225,
           i.e. 2% cheaper here. */
        (FarkPM pm, FTHMFarkHook hook, FiyatElcisi elci, SahteUcNokta epArc, SahteUcNokta epRh) =
            _kur(true, sqrtFiyat(125, 100));
        pm.fiyatKoy(sqrtFiyat(1225, 1000));
        PoolKey memory key = _key(address(hook));

        /* 0) No reference yet: nothing extra. Buying FTHM = USDG in = oneForZero. */
        pm.swap(address(hook), key, false, -1000e6, 1000e18, -1000e6);
        s.refsizUcret = pm.sonMiktar(); s.refsizAlim = pm.alimSayisi();

        /* 1) The Arc price arrives over LayerZero. */
        elci.gonder("");
        epRh.teslim(epArc, epArc.sonIndeks());
        s.ref = hook.refSqrtP(); s.refZaman = hook.refZaman();

        /* 2) Exact-input BUY on the cheap side: 2% of the FTHM output. */
        s.alimDelta = pm.swap(address(hook), key, false, -1225e6, 1000e18, -1225e6);
        s.alimUcret = pm.sonMiktar(); s.alimPara = pm.sonAlinanPara(); s.alimKasa = pm.sonAlici();

        /* 3) Exact-input SELL on the cheap side pulls prices together: free. */
        uint256 once = pm.alimSayisi();
        pm.swap(address(hook), key, true, -1000e18, -1000e18, 1225e6);
        s.satimAlimSayisiFark = pm.alimSayisi() - once;

        /* 4) Exact-OUTPUT buy: specify 1000 FTHM out, the USDG input is the
           unspecified side and carries the 2%. */
        pm.swap(address(hook), key, false, 1000e18, 1000e18, -1225e6);
        s.exactOutUcret = pm.sonMiktar(); s.exactOutPara = pm.sonAlinanPara();

        /* 5) An older message, even from the real peer, cannot roll it back. */
        uint160 oncekiRef = hook.refSqrtP();
        epRh.sahteTeslim(address(hook), ARC, address(elci), abi.encode(sqrtFiyat(1, 100), uint64(s.refZaman - 1), true));
        s.eskiMesajYokSayildi = hook.refSqrtP() == oncekiRef;

        /* 6) Anyone but the peer is refused. */
        try epRh.sahteTeslim(address(hook), ARC, address(0xBAD), abi.encode(uint160(1), uint64(block.timestamp + 1), true)) {
            s.sahteReddedildi = false;
        } catch { s.sahteReddedildi = true; }

        /* 7) A pool that is not FTHM/USDG on this hook is refused. */
        PoolKey memory yabanci = PoolKey(Currency.wrap(address(0x2000)), Currency.wrap(USDG), 0, 60, IHooks(address(hook)));
        try pm.swap(address(hook), yabanci, false, -1e6, 1e18, -1e6) { s.yabanciHavuzReddedildi = false; }
        catch { s.yabanciHavuzReddedildi = true; }

        /* 8) Only the PoolManager may call the hook. */
        try IFarkHook(address(hook)).beforeSwap(address(this), key, SwapParams(false, -1, 0), "") { s.pmDisiReddedildi = false; }
        catch { s.pmDisiReddedildi = true; }

        /* 9) Arc with FTHM as token1 (raw price 1/1.25 = 0.8): the hook must
           invert it into its own order and charge the same 2%. */
        (FarkPM pm2, FTHMFarkHook hook2, FiyatElcisi elci2, SahteUcNokta epArc2, SahteUcNokta epRh2) =
            _kur(false, sqrtFiyat(80, 100));
        pm2.fiyatKoy(sqrtFiyat(1225, 1000));
        elci2.gonder("");
        epRh2.teslim(epArc2, epArc2.sonIndeks());
        pm2.swap(address(hook2), _key(address(hook2)), false, -1225e6, 1000e18, -1225e6);
        s.terstenUcret = pm2.sonMiktar();
    }
}
