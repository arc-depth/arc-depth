// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { FTHMOFTAdapter } from "../lz/FTHMOFTAdapter.sol";
import { FTHMOFT } from "../lz/FTHMOFT.sol";
import { FTHMKapi } from "../lz/FTHMKapi.sol";
import { FTHMFarkHook } from "../lz/FTHMFarkHook.sol";
import { FiyatElcisi } from "../lz/FiyatElcisi.sol";
import { TekYonluAcici, IERC20T } from "../TekYonluAcici.sol";
import { IOFT, SendParam } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { MessagingFee } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { KopruJeton, SahteUcNokta } from "./SahteLz.sol";

/// @title TestFTHMKapi — one FTHM market over two chains, on the real PoolManager
/// @notice Arc (eid 30417) and Robinhood (eid 30416) side by side against two
///         queued endpoints that also deliver OFT composes. Both FTHM pools
///         sit on the live Uniswap v4 PoolManager, opened by the unchanged
///         TekYonluAcici as single-sided ladders the way the Arc pool was;
///         the Robinhood pool carries the real FTHMFarkHook, its price fed
///         by the real FiyatElcisi.
contract TestFTHMKapi {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    uint32 constant ARC = 30417;
    uint32 constant RH = 30416;
    address constant KASA = address(0xCA5A);
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant CAROL = address(0xCA201);
    address constant DAVE = address(0xDA7E);

    struct Sonuc {
        uint256 aAlinan; uint256 aAliceRh; bool aKapiBos; bool aArzEsit;
        uint256 bBobUsdg; bool bKapiBos; bool bArzEsit;
        uint256 cDaveFthm; uint256 cDaveUsdg; bool cKapiBos;
        uint256 dCarolUsdc; bool dKapiBos; bool dArzEsit;
        bool eSahteFrom; bool eSahteUcNokta; bool eSatDisaridan; bool eIkinciBag;
        uint256 fGeriDonen; bool fKapiBos;
        uint256 gUcretOnce; uint256 gKasa; uint256 gRhGiren; uint256 gRhCikan;
        uint160 gArcSqrtP; bool gArcFthm0; uint160 gRhSqrtP; bool gRhFthm0;
        uint256 arzSon; uint256 kilitliSon;
    }

    KopruJeton fthm; KopruJeton usdc; KopruJeton usdg;
    SahteUcNokta epArc; SahteUcNokta epRh;
    FTHMOFTAdapter adapter; FTHMOFT oft;
    FTHMKapi kapiArc; FTHMKapi kapiRh;
    PoolKey keyArc; PoolKey keyRh;
    FTHMFarkHook hook; FiyatElcisi elci;

    function _b(address a) private pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    function sqrtFiyat(uint256 num, uint256 den) public pure returns (uint160) {
        uint256 x = (num << 192) / den;
        uint256 z = (x + 1) / 2; uint256 y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
        return uint160(y);
    }

    /* 1 FTHM = 0.00002 dollars on both chains (both test tokens 18 dp). */
    function _fiyat(bool fthm0) private pure returns (uint160) {
        return fthm0 ? sqrtFiyat(2, 100_000) : sqrtFiyat(100_000, 2);
    }

    /// A single-sided FTHM ladder at the starting price, like the Arc pool.
    function _merdiven(address token, address para, IHooks h, uint256 miktar, bool kopruyle)
        private returns (PoolKey memory key)
    {
        TekYonluAcici a = new TekYonluAcici(PM, IERC20T(token), IERC20T(para), h, 0, 60, address(this));
        if (kopruyle) {
            adapter.send(SendParam(RH, _b(address(a)), miktar, miktar, "", "", ""), MessagingFee(0, 0), address(this));
            epRh.teslim(epArc, epArc.sonIndeks());
        } else {
            fthm.transfer(address(a), miktar);
        }
        bool f0 = token < para;
        uint160 p = _fiyat(f0);
        int24 t = TickMath.getTickAtSqrtPrice(p);
        int24 k = t >= 0 ? (t / 60) * 60 : ((t - 59) / 60) * 60;
        if (f0) a.ac(p, k + 60, k + 60 + 120_000, 0);
        else a.ac(p, k - 120_000, k, 0);
        (address c0, address c1) = f0 ? (token, para) : (para, token);
        key = PoolKey(Currency.wrap(c0), Currency.wrap(c1), 0, 60, h);
    }

    /* ---- a plain exact-input swap for the harness ---- */
    function _takas(PoolKey memory key, address girdi, uint256 miktar) private returns (uint256) {
        return abi.decode(PM.unlock(abi.encode(key, girdi, miktar)), (uint256));
    }

    function unlockCallback(bytes calldata v) external returns (bytes memory) {
        (PoolKey memory key, address girdi, uint256 miktar) = abi.decode(v, (PoolKey, address, uint256));
        bool z = Currency.unwrap(key.currency0) == girdi;
        BalanceDelta d = PM.swap(key, SwapParams(z, -int256(miktar),
            z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
        (int128 g, int128 c) = z ? (d.amount0(), d.amount1()) : (d.amount1(), d.amount0());
        Currency gc = z ? key.currency0 : key.currency1;
        Currency cc = z ? key.currency1 : key.currency0;
        PM.sync(gc);
        KopruJeton(Currency.unwrap(gc)).transfer(address(PM), uint256(uint128(-g)));
        PM.settle();
        PM.take(cc, address(this), uint256(uint128(c)));
        return abi.encode(uint256(uint128(c)));
    }

    function _hookKur() private returns (FTHMFarkHook h) {
        bytes memory init = abi.encodePacked(type(FTHMFarkHook).creationCode,
            abi.encode(address(epRh), address(this), PM, address(oft), address(usdg), KASA, uint64(3600), uint24(100_000)));
        bytes32 hash = keccak256(init);
        for (uint256 i; ; i++) {
            address a = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(i), hash)))));
            if (uint160(a) & 0x3FFF == 0xC4) {
                h = new FTHMFarkHook{ salt: bytes32(i) }(address(epRh), address(this), PM, address(oft), address(usdg), KASA, 3600, 100_000);
                require(address(h) == a, "hook adresi");
                return h;
            }
        }
    }

    /// Dollars per FTHM, 1e18-scaled, from the pool's own price.
    function _dolar(PoolKey memory key, address token) private view returns (uint256) {
        (uint160 sp,,,) = PM.getSlot0(key.toId());
        uint256 q = (uint256(sp) * uint256(sp)) >> 96;
        return Currency.unwrap(key.currency0) == token ? (q * 1e18) >> 96 : (uint256(1e18) << 96) / q;
    }

    function _kapiBos(FTHMKapi k) private view returns (bool) {
        return KopruJeton(k.fthm()).balanceOf(address(k)) == 0 && KopruJeton(k.para()).balanceOf(address(k)) == 0;
    }

    function _arzEsit() private view returns (bool) { return oft.totalSupply() == fthm.balanceOf(address(adapter)); }

    function run() external returns (Sonuc memory s) {
        epArc = new SahteUcNokta(ARC);
        epRh = new SahteUcNokta(RH);
        fthm = new KopruJeton(1_000_000_000e18, address(this));
        usdc = new KopruJeton(10_000_000e18, address(this));
        usdg = new KopruJeton(10_000_000e18, address(this));
        adapter = new FTHMOFTAdapter(address(fthm), address(epArc), address(this));
        oft = new FTHMOFT(address(epRh), address(this));
        adapter.setPeer(RH, _b(address(oft)));
        oft.setPeer(ARC, _b(address(adapter)));
        fthm.approve(address(adapter), type(uint256).max);

        hook = _hookKur();
        keyArc = _merdiven(address(fthm), address(usdc), IHooks(address(0)), 300_000_000e18, false);
        keyRh = _merdiven(address(oft), address(usdg), IHooks(address(hook)), 100_000_000e18, true);

        elci = new FiyatElcisi(address(epArc), address(this), PM, keyArc.toId(), Currency.unwrap(keyArc.currency0) == address(fthm), RH);
        elci.setPeer(RH, _b(address(hook)));
        hook.setPeer(ARC, _b(address(elci)));

        kapiArc = new FTHMKapi(PM, address(epArc), IOFT(address(adapter)), address(usdc), 0, 60, IHooks(address(0)), RH, address(this));
        kapiRh = new FTHMKapi(PM, address(epRh), IOFT(address(oft)), address(usdg), 0, 60, IHooks(address(hook)), ARC, address(this));
        kapiArc.karsiyiBagla(address(kapiRh));
        kapiRh.karsiyiBagla(address(kapiArc));

        /* dollars into both pools, so sellers have something to sell into */
        _takas(keyArc, address(usdc), 1_000e18);
        _takas(keyRh, address(usdg), 1_000e18);

        /* A) buy on Arc with USDC, receive on Robinhood */
        usdc.approve(address(kapiArc), type(uint256).max);
        s.aAlinan = kapiArc.alVeGonder(100e18, 1, ALICE, "");
        epRh.teslim(epArc, epArc.sonIndeks());
        s.aAliceRh = oft.balanceOf(ALICE);
        s.aKapiBos = _kapiBos(kapiArc) && _kapiBos(kapiRh);
        s.aArzEsit = _arzEsit();

        /* B) FTHM on Arc, sold in the Robinhood pool, USDG to bob there */
        fthm.approve(address(kapiArc), type(uint256).max);
        kapiArc.satKarsida(1_000_000e18, 1, BOB, "");
        epRh.teslim(epArc, epArc.sonIndeks());
        epRh.composeTeslim(epRh.bileskeSayisi() - 1);
        s.bBobUsdg = usdg.balanceOf(BOB);
        s.bKapiBos = _kapiBos(kapiArc) && _kapiBos(kapiRh);
        s.bArzEsit = _arzEsit();

        /* C) same, with a minimum the pool cannot meet: dave gets the FTHM */
        kapiArc.satKarsida(1_000_000e18, type(uint256).max, DAVE, "");
        epRh.teslim(epArc, epArc.sonIndeks());
        epRh.composeTeslim(epRh.bileskeSayisi() - 1);
        s.cDaveFthm = oft.balanceOf(DAVE);
        s.cDaveUsdg = usdg.balanceOf(DAVE);
        s.cKapiBos = _kapiBos(kapiRh);

        /* D) FTHM on Robinhood, sold in the Arc pool, USDC to carol on Arc */
        oft.approve(address(kapiRh), type(uint256).max);
        kapiRh.satKarsida(1_000_000e18, 1, CAROL, "");
        epArc.teslim(epRh, epRh.sonIndeks());
        epArc.composeTeslim(epArc.bileskeSayisi() - 1);
        s.dCarolUsdc = usdc.balanceOf(CAROL);
        s.dKapiBos = _kapiBos(kapiArc) && _kapiBos(kapiRh);
        s.dArzEsit = _arzEsit();

        /* E) who may call what */
        bytes memory m = abi.encodePacked(uint64(1), ARC, uint256(1e18), _b(address(this)), abi.encode(BOB, uint256(0)));
        try epRh.sahteCompose(address(kapiRh), address(0xBAD), m) { } catch { s.eSahteFrom = true; }
        try kapiRh.lzCompose(address(oft), bytes32(0), m, address(0), "") { } catch { s.eSahteUcNokta = true; }
        try kapiRh.sat(1e18, address(this), 0) { } catch { s.eSatDisaridan = true; }
        try kapiRh.karsiyiBagla(address(0xBAD)) { } catch { s.eIkinciBag = true; }

        /* F) a payload that is not (alici, asgari): FTHM back to its sender */
        uint256 once = oft.balanceOf(address(this));
        adapter.send(SendParam(RH, _b(address(kapiRh)), 500e18, 500e18, "", hex"010203", ""), MessagingFee(0, 0), address(this));
        epRh.teslim(epArc, epArc.sonIndeks());
        epRh.composeTeslim(epRh.bileskeSayisi() - 1);
        s.fGeriDonen = oft.balanceOf(address(this)) - once;
        s.fKapiBos = _kapiBos(kapiRh);

        /* G) Arc price pushed up, the price carried over, a cheap buy on
              Robinhood pays the gap to the vault */
        s.gUcretOnce = oft.balanceOf(KASA) + usdg.balanceOf(KASA);
        /* push Arc 3-8% above Robinhood: inside the fee cap, as a real gap would be */
        while (_dolar(keyArc, address(fthm)) * 100 < _dolar(keyRh, address(oft)) * 103) _takas(keyArc, address(usdc), 10e18);
        elci.gonder("");
        epRh.teslim(epArc, epArc.sonIndeks());
        (s.gRhSqrtP,,,) = PM.getSlot0(keyRh.toId());
        s.gRhGiren = 100e18;
        s.gRhCikan = _takas(keyRh, address(usdg), s.gRhGiren);
        s.gKasa = oft.balanceOf(KASA) + usdg.balanceOf(KASA);
        (s.gArcSqrtP,,,) = PM.getSlot0(keyArc.toId());
        s.gArcFthm0 = Currency.unwrap(keyArc.currency0) == address(fthm);
        s.gRhFthm0 = Currency.unwrap(keyRh.currency0) == address(oft);

        s.arzSon = oft.totalSupply();
        s.kilitliSon = fthm.balanceOf(address(adapter));
    }
}
