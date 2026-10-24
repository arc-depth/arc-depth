// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { FiyatAgi, ILaunchpadC } from "../lz/AgCekirdek.sol";
import { IkizOFTFabrikaAg, IkizFabrikaAg, IkizOFTAg } from "../lz/IkizAg.sol";
import { KapiAg } from "../lz/KapiAg.sol";
import { FarkHookAg } from "../lz/FarkHookAg.sol";
import { IEvFiyati } from "../lz/IkizHavuz.sol";
import { TekYonluAcici, IERC20T } from "../TekYonluAcici.sol";
import { IOFT } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { OFTMsgCodec } from "@layerzerolabs/oft-evm/contracts/libs/OFTMsgCodec.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";
import {
    MessagingParams, MessagingReceipt, MessagingFee, Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

/// A plain ERC-20 with chosen decimals: 6 like USDC on most chains, 18 like USDC on BNB.
contract DolarK {
    uint8 public immutable decimals;
    string public name = "Dollar"; string public symbol = "USD";
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    constructor(uint8 d, uint256 arz, address kime) { decimals = d; totalSupply = arz; balanceOf[kime] = arz; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
    function transfer(address to, uint256 v) external returns (bool) { balanceOf[msg.sender] -= v; balanceOf[to] += v; return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        allowance[f][msg.sender] -= v; balanceOf[f] -= v; balanceOf[to] += v; return true;
    }
}

/// @title TestAgMantik — the network's message logic, run AS the endpoint
/// @notice Called with eth_call on Arc with this code placed at the real
///         LayerZero endpoint address (and its storage cleared), so every
///         contract that looks the endpoint up in ZincirTablosu talks to this
///         harness: it accepts config, records sends, and delivers messages
///         and composes with msg.sender == endpoint, as the executor would.
///         Uniswap v4 is the real PoolManager on Arc.
contract TestAgMantik {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    uint32 constant BASE = 30184;
    uint32 constant ARB = 30110;
    address constant EV_TOKEN = address(0xF7F7);
    address constant EV_ADAPTER = address(0xADA0);
    address constant KASA = address(0xCA5A);
    address constant ALICI = address(0xB0B);

    /* ------------------------------------------------ endpoint, as seen by OApps */
    MessagingParams[] public gidenler;
    struct Bileske { address to; bytes32 guid; bytes message; address from; }
    Bileske[] public bileskeler;
    uint64 private sayac;

    function setDelegate(address) external {}
    function setConfig(address, address, SetConfigParam[] calldata) external {}
    function quote(MessagingParams calldata, address) external pure returns (MessagingFee memory f) { return f; }
    function send(MessagingParams calldata p, address) external payable returns (MessagingReceipt memory r) {
        gidenler.push(p);
        r.guid = keccak256(abi.encode(++sayac));
        r.nonce = sayac;
    }
    function sendCompose(address to, bytes32 guid, uint16, bytes calldata message) external {
        bileskeler.push(Bileske(to, guid, message, msg.sender));
    }

    function _b(address a) private pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    /* ------------------------------------------------ results */
    struct Sonuc {
        uint160 gonderilenS; uint160 kayitliS; bool yeniden18e; bool eskiYokSayildi; bool yabanciReddedildi;
        uint256 ucretli; uint256 ucretsizBayat; uint256 alimGiren; uint256 alimCikan; uint160 refS; uint160 yerelS; bool fthm0;
        uint256 aliciPara; bool kapiBos;
        uint32 gidenHedef; bytes32 gidenAlici; address gidenComposeAlici; uint256 gidenComposeAsgari;
        uint32 alGidenHedef; bytes32 alGidenAlici;
        bool ikinciKurReddedildi; bool gidenPeerIkiz; bool alComposeYok; address kapiAdresi;
    }

    FiyatAgi f; IkizOFTAg ikiz; DolarK dolar; KapiAg kapi; FarkHookAg hook; PoolKey key;

    function sqrtFiyat(uint256 num, uint256 den) public pure returns (uint160) {
        uint256 x = (num << 192) / den;
        uint256 z = (x + 1) / 2; uint256 y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
        return uint160(y);
    }

    function _ofta(address kime, uint256 miktar, bytes memory compose) private {
        /* sendTo | amountSD | [composeFrom | composeMsg] — composeFrom is
           part of `compose` here, as the sending chain's OFT writes it */
        bytes memory m = abi.encodePacked(_b(kime), uint64(miktar / 1e12), compose);
        IkizOFTAg(ikiz).lzReceive(Origin(BASE, _b(EV_ADAPTER), ++sayac), keccak256(abi.encode("g", sayac)), m, address(this), "");
    }

    function _fiyatMesaji(uint160 s, uint8 ond, uint64 z) private pure returns (bytes memory) {
        return abi.encode(EV_TOKEN, "Fathom", "FTHM", EV_ADAPTER, s, ond, z, BASE);
    }

    function _takas(address girdi, uint256 miktar) private returns (uint256) {
        return abi.decode(PM.unlock(abi.encode(girdi, miktar)), (uint256));
    }

    function unlockCallback(bytes calldata v) external returns (bytes memory) {
        (address girdi, uint256 miktar) = abi.decode(v, (address, uint256));
        bool z = Currency.unwrap(key.currency0) == girdi;
        BalanceDelta d = PM.swap(key, SwapParams(z, -int256(miktar), z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
        (int128 g, int128 c) = z ? (d.amount0(), d.amount1()) : (d.amount1(), d.amount0());
        Currency gc = z ? key.currency0 : key.currency1;
        Currency cc = z ? key.currency1 : key.currency0;
        PM.sync(gc);
        DolarK(Currency.unwrap(gc)).transfer(address(PM), uint256(uint128(-g)));
        PM.settle();
        PM.take(cc, address(this), uint256(uint128(c)));
        return abi.encode(uint256(uint128(c)));
    }

    function _hook(IEvFiyati ref, address acici) private returns (FarkHookAg h) {
        bytes memory init = abi.encodePacked(type(FarkHookAg).creationCode,
            abi.encode(PM, address(ikiz), address(dolar), KASA, ref, uint64(3600), uint24(500_000)));
        bytes32 hash = keccak256(init);
        for (uint256 i; ; i++) {
            address a = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(i), hash)))));
            if (uint160(a) & 0x3FFF == 0xC4) {
                h = new FarkHookAg{ salt: bytes32(i) }(PM, address(ikiz), address(dolar), KASA, ref, 3600, 500_000);
                acici;
                return h;
            }
        }
    }

    /// Dollars per FTHM in the pool, as (token-as-currency0) sqrt in raw units.
    function _tokenBasina() private view returns (uint160) {
        (uint160 sp,,,) = PM.getSlot0(key.toId());
        return Currency.unwrap(key.currency0) == address(ikiz) ? sp : uint160((uint256(1) << 192) / sp);
    }

    function run() external returns (Sonuc memory s) {
        IkizOFTFabrikaAg ofab = new IkizOFTFabrikaAg();
        IkizFabrikaAg fab = new IkizFabrikaAg(ofab);
        f = new FiyatAgi(address(this), fab);
        dolar = new DolarK(18, 10_000_000e18, address(this));     // this chain behaves like BNB: 18-dp dollar
        PoolKey memory bos;
        f.kur(PM, ILaunchpadC(address(0)), 18, address(0), address(0), bos);
        try f.kur(PM, ILaunchpadC(address(0)), 6, address(0), address(0), bos) { } catch { s.ikinciKurReddedildi = true; }

        /* FTHM's twin here, homed on "Base" (eid 30184) behind EV_ADAPTER */
        ikiz = IkizOFTAg(ofab.karsidaKur(EV_TOKEN, BASE, EV_ADAPTER, "Fathom", "FTHM"));

        /* 1) a price arrives from a 6-dp chain and is filed in 18-dp terms.
              1 FTHM = $0.00002: in 6-dp raw that is 2e-5 * 1e6 / 1e18 = 2e-17. */
        s.gonderilenS = sqrtFiyat(2, 1e17);
        Origin memory o = Origin(BASE, _b(address(f)), 1);
        f.lzReceive(o, bytes32(uint256(1)), _fiyatMesaji(s.gonderilenS, 6, uint64(block.timestamp)), address(this), "");
        (s.kayitliS,) = f.evFiyati(address(ikiz));
        s.yeniden18e = s.kayitliS == uint160(uint256(s.gonderilenS) * 1e6);
        f.lzReceive(Origin(BASE, _b(address(f)), 2), bytes32(uint256(2)), _fiyatMesaji(1, 6, uint64(block.timestamp) - 10), address(this), "");
        (uint160 sonra,) = f.evFiyati(address(ikiz));
        s.eskiYokSayildi = sonra == s.kayitliS;
        try f.lzReceive(Origin(BASE, _b(address(0xBAD)), 3), bytes32(uint256(3)), _fiyatMesaji(5, 6, uint64(block.timestamp) + 1), address(this), "") { }
        catch { s.yabanciReddedildi = true; }

        /* 2) the FTHM pool here: twin minted from the home adapter, a ladder at
              a price 3% BELOW the home price, the gap hook reading FiyatAgi */
        _ofta(address(this), 200_000_000e18, "");
        TekYonluAcici a;
        hook = _hook(IEvFiyati(address(f)), address(0));
        a = new TekYonluAcici(PM, IERC20T(address(ikiz)), IERC20T(address(dolar)), IHooks(address(hook)), 0, 60, address(this));
        ikiz.transfer(address(a), 100_000_000e18);
        bool f0 = address(ikiz) < address(dolar);
        s.fthm0 = f0;
        /* local price 0.97 x home: dollars-per-token raw = 2e-5 * 0.97 (18 dp both) */
        uint160 p = f0 ? sqrtFiyat(194, 10_000_000) : sqrtFiyat(10_000_000, 194);
        int24 t = TickMath.getTickAtSqrtPrice(p);
        int24 k = t >= 0 ? (t / 60) * 60 : ((t - 59) / 60) * 60;
        if (f0) a.ac(p, k + 60, k + 60 + 120_000, 0); else a.ac(p, k - 120_000, k, 0);
        (address c0, address c1) = f0 ? (address(ikiz), address(dolar)) : (address(dolar), address(ikiz));
        key = PoolKey(Currency.wrap(c0), Currency.wrap(c1), 0, 60, IHooks(address(hook)));

        /* buy 10 dollars of FTHM where it is 3% cheap: pays the gap */
        s.refS = s.kayitliS;
        s.yerelS = _tokenBasina();
        s.alimGiren = 10e18;
        s.alimCikan = _takas(address(dolar), s.alimGiren);
        s.ucretli = ikiz.balanceOf(KASA) + dolar.balanceOf(KASA);

        /* a stale reference (older than an hour) charges nothing */
        f.lzReceive(Origin(BASE, _b(address(f)), 4), bytes32(uint256(4)), _fiyatMesaji(s.gonderilenS, 6, uint64(block.timestamp) + 1), address(this), "");
        uint256 once = ikiz.balanceOf(KASA) + dolar.balanceOf(KASA);
        /* move the clock: re-file the price as two hours old by sending an
           older timestamp is impossible (only forward), so measure staleness
           through the hook directly */
        (uint160 rs, uint64 rz) = hook.referans(f0);
        s.ucretsizBayat = (rz + 3600 < block.timestamp || rs == 0) ? 1 : 0;
        once;

        /* 3) the gate: kur, a compose arriving, a sale out, a buy out */
        kapi = new KapiAg(address(this));
        kapi.kur(PM, address(this), IOFT(address(ikiz)), address(dolar), 0, 60, IHooks(address(hook)));
        bytes memory istek = abi.encodePacked(_b(address(0xCAFE)), abi.encode(ALICI, uint256(1)));
        _ofta(address(kapi), 1_000_000e18, istek);
        Bileske memory bk = bileskeler[bileskeler.length - 1];
        kapi.lzCompose(bk.from, bk.guid, bk.message, address(this), "");
        s.aliciPara = dolar.balanceOf(ALICI);
        s.kapiBos = ikiz.balanceOf(address(kapi)) == 0 && dolar.balanceOf(address(kapi)) == 0;

        ikiz.approve(address(kapi), type(uint256).max);
        kapi.satKarsida(ARB, 5_000e18, 7, ALICI, "");
        s.kapiAdresi = address(kapi);
        MessagingParams memory g = gidenler[gidenler.length - 1];
        s.gidenHedef = g.dstEid;
        s.gidenPeerIkiz = g.receiver == _b(address(ikiz));
        bytes memory cm;
        (s.gidenAlici,, cm) = _ayir(g.message);
        (s.gidenComposeAlici, s.gidenComposeAsgari) = abi.decode(cm, (address, uint256));

        dolar.approve(address(kapi), type(uint256).max);
        kapi.alVeGonder(ARB, 20e18, 1, ALICI, "");
        g = gidenler[gidenler.length - 1];
        s.alGidenHedef = g.dstEid;
        bytes memory alCompose;
        (s.alGidenAlici,, alCompose) = _ayir(g.message);
        s.alComposeYok = alCompose.length == 0 && g.receiver == _b(address(ikiz));
    }

    /// OFT message: sendTo(32) | amountSD(8) | composeFrom(32) | composeMsg
    function _ayir(bytes memory m) private pure returns (bytes32 kime, uint64 sd, bytes memory compose) {
        assembly { kime := mload(add(m, 32)) }
        sd = uint64(bytes8(_dilim(m, 32, 8)));
        if (m.length > 40) compose = _dilim(m, 72, m.length - 72);
    }

    function _dilim(bytes memory m, uint256 bas, uint256 n) private pure returns (bytes memory r) {
        r = new bytes(n);
        for (uint256 i; i < n; i++) r[i] = m[bas + i];
    }
}
