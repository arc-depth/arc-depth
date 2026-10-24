// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";

import { IkizHub, IMerkezHub } from "../lz/IkizHub.sol";
import { ILzUcNokta2, LzParams2, LzFee2, LzOrigin2 } from "../sepet/HaberciLZ.sol";
import { IFthmYakiciM, MerkezKapi, IIkizHubM, KurucuVekili, ILaunchpadM, IIkizYayiciM, ITokenMesajciM, ISepetUcuM, Odeme } from "../merkez/MerkezKapi.sol";
import { SepetDefteri } from "../sepet/SepetDefteri.sol";
import { IERC20S } from "../sepet/IHaberci.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";

interface IArzT { function totalSupply() external view returns (uint256); }

interface IYayiciUcret {
    function ucret(address token, uint32[] calldata hedefler, bytes calldata secenekler) external view returns (uint256);
}
interface IOftUcret {
    struct SendParamT { uint32 dstEid; bytes32 to; uint256 amountLD; uint256 minAmountLD; bytes extraOptions; bytes composeMsg; bytes oftCmd; }
    struct FeeT { uint256 nativeFee; uint256 lzTokenFee; }
    function quoteSend(SendParamT calldata p, bool payInLz) external view returns (FeeT memory);
}

/// Runs in one eth_call on Arc mainnet state (scripts/denetim-merkez-kapi.js):
/// the real PulseLaunchpad5, PoolManager, Defter, Haberci, IkizYayici and
/// LayerZero endpoint. This contract stands in for relay.link's executor
/// (it holds the dollars and calls the gate) and, for the sale path only,
/// for the endpoint delivering a compose (the gate is built with this
/// contract as its endpoint; nothing else about the endpoint is faked).
contract TestMerkezKapi {
    ILaunchpadM constant LP = ILaunchpadM(0x52e600c8259ca44D9837B7b9E6BA1faee4bC040d);
    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    IIkizYayiciM constant YAYICI = IIkizYayiciM(0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9);
    ITokenMesajciM constant TM = ITokenMesajciM(0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d);   // Circle TokenMessengerV2 on Arc
    ISepetUcuM constant UCU = ISepetUcuM(0x7B695AAd76507CB1080d38E03b743CbDd02F9d4e);
    IERC20S constant USDC = IERC20S(0x3600000000000000000000000000000000000000);
    address constant FTHM = 0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE;
    bytes32 constant BASE_WETH = bytes32(uint256(uint160(0x4200000000000000000000000000000000000006)));
    uint32 constant ARC = 26;
    uint32 constant BASE = 6;
    uint32 constant BASE_EID = 30184;
    uint32 constant ARB_EID = 30110;
    address constant KURUCU = address(0xF00D);
    address constant BOB = address(0xB0B);
    address constant ALICE = address(0xA11CE);
    address constant YEDEK = address(0xBEEF);
    uint32 constant SUI_EID = 30378;
    bytes32 constant AKTARMA = bytes32(uint256(0xBA5E1));   // the hop on Base
    string constant SUI_TIP = "0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

    struct Sonuc {
        address token; address vekil; address adapter; bool adapterKodu; bool adapterKayitli;
        uint256 kurucuToken; uint256 adapterKilitli; uint256 kapiUsdcLaunch;
        uint256 bobToken; uint256 baseAlinan; uint256 adapterSonra;
        uint256 aliceUsdc; uint256 kapiUsdcSat; bool baseOdemeGitti;
        uint256 yedekToken; uint256 arzOnce; uint256 arzItfa;
        bool sahteUcNokta; bool sahteAdapter; bool satDisaridan;
        uint256 vekilGelir; uint256 kurucuAldi;
        uint256 kapiNativeSon;
        bool hubYaratti; uint256 hubKilitli; uint256 hubMesaj; uint256 hubSatisAlice; uint256 hubKilitSonra; bool hubYabanciRed; uint32 hubSonEid; bool hubDogrudanRed; bool hubYaratSecenek; bool hubTasiSecenek;
        uint256 arcSatAlice; bool arcSatBaseBos; bool satArcYabanci; uint256 arcItfa; bool ethOdendi; bool rhOdendi; bool tipYanlisRed; bool solOdendi; bool ucretRed;
    }

    function _b(address a) internal pure returns (bytes32) { return bytes32(uint256(uint160(a))); }
    function _sec(uint128 gaz) internal pure returns (bytes memory) { return abi.encodePacked(uint16(3), uint8(1), uint16(17), uint8(1), gaz); }

    function run() external returns (Sonuc memory s) {
        /* the twin hub for Solana/Sui/Aptos, its endpoint played by this contract (it records the sends) */
        IkizHub hub = new IkizHub(ILzUcNokta2(address(this)));
        hub.aktarmaKur(BASE_EID, AKTARMA);
        hub.aktarmaliKapiEkle(SUI_EID, _b(address(0x5017)), _sec(300_000));
        hub.yaratSecenekKur(SUI_EID, _sec(500_000));
        MerkezKapi kapi = new MerkezKapi(LP, PM, YAYICI, TM, ARC, UCU, USDC, address(this), IIkizHubM(address(hub)), PoolKey(Currency.wrap(0x3600000000000000000000000000000000000000), Currency.wrap(0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE), 0, 60, IHooks(0x72fd3c2eE8A499E97D87e2a642B7DFd908D58A44)), IFthmYakiciM(0x4D78b78A49a9AdDdfA9Be56d5F1bc33591452ff2));
        hub.merkezKur(IMerkezHub(address(kapi)));
        USDC.approve(address(kapi), type(uint256).max);

        /* A) a launch as relay would make it: basket of FTHM on Arc + WETH on Base, founder paid on Arc, tokens to Base */
        MerkezKapi.LaunchIstegi memory r;
        r.ad = "Merkez Prova"; r.sembol = "MPROVA";
        r.sepet = new SepetDefteri.Kalem[](3);
        r.sepet[0] = SepetDefteri.Kalem(ARC, _b(FTHM), 8e6);
        r.sepet[1] = SepetDefteri.Kalem(BASE, BASE_WETH, 8e6);
        r.sepet[2] = SepetDefteri.Kalem(8, keccak256(bytes(SUI_TIP)), 4e6);   // SUI on Sui, named by its coin type
        r.teklif = new uint256[](3);
        r.teklif[0] = 480_000e18; r.teklif[1] = 32e14; r.teklif[2] = 4_080_000_000;
        r.tipler = new string[](3);
        r.tipler[2] = "0x2::sui::SUI";   // not the normalized form: refused
        try kapi.launch{ value: 60e18 }(r) { } catch { s.tipYanlisRed = true; }
        r.tipler[2] = SUI_TIP;
        r.vergiPpm = 20_000; r.alim = 100e6;
        r.kurucu = _b(KURUCU); r.kurucuZincir = ARC; r.kurucuEid = BASE_EID;
        r.ikizler = new uint32[](2); r.ikizler[0] = BASE_EID; r.ikizler[1] = ARB_EID;
        r.ikizSecenek = _sec(3_500_000);
        r.gonderSecenek = _sec(100_000);
        r.iade = address(this);
        r.ikizUcret = 30e18;     // generous; the excess comes back
        r.uzakIkizler = new uint32[](1); r.uzakIkizler[0] = SUI_EID;
        r.uzakUcret = 1e18;
        address token = kapi.launch{ value: 60e18 }(r);
        yaratSecenekGitti = sonSecenek;   // the hub sent YARAT to Sui with its own options
        s.token = token;
        s.vekil = kapi.vekilOf(token);
        s.adapter = YAYICI.adapterAdresi(token);
        s.adapterKodu = s.adapter.code.length > 0;
        s.adapterKayitli = kapi.tokenOfAdapter(s.adapter) == token;
        s.kurucuToken = 0;
        s.adapterKilitli = IERC20S(token).balanceOf(s.adapter);   // the founder's tokens, locked for Base
        s.kapiUsdcLaunch = USDC.balanceOf(address(kapi));
        _hub(kapi, hub, token, s);

        /* B) buy $50 delivered on Arc to Bob; buy $20 delivered on Base */
        kapi.al(token, 50e6, 1, 0, _b(BOB), "", address(this));
        s.bobToken = IERC20S(token).balanceOf(BOB);
        uint256 once = IERC20S(token).balanceOf(s.adapter);
        kapi.al{ value: 5e18 }(token, 20e6, 1, BASE_EID, _b(ALICE), _sec(100_000), address(this));
        s.adapterSonra = IERC20S(token).balanceOf(s.adapter);
        s.baseAlinan = s.adapterSonra - once;

        /* C) a sale arriving from another chain: Bob's tokens credited to the gate, the endpoint delivers the compose */
        uint256 satilan = s.bobToken / 2;
        _bobdanKapiya(token, address(kapi), satilan);
        uint256 aliceOnce = USDC.balanceOf(ALICE);
        kapi.lzCompose(s.adapter, bytes32(0), _compose(BASE_EID, BOB, satilan, abi.encode(uint8(0), ARC, _b(ALICE), uint256(1), YEDEK, uint256(0))), address(0), "");
        s.aliceUsdc = USDC.balanceOf(ALICE) - aliceOnce;
        /* paid on Base: the dollars leave through the Haberci (CCTP burn) */
        uint256 kalan = s.bobToken - satilan;
        _bobdanKapiya(token, address(kapi), kalan / 2);
        kapi.lzCompose(s.adapter, bytes32(0), _compose(BASE_EID, BOB, kalan / 2, abi.encode(uint8(0), BASE, _b(ALICE), uint256(1), YEDEK, uint256(80_000))), address(0), "");
        s.kapiUsdcSat = USDC.balanceOf(address(kapi));
        s.baseOdemeGitti = s.kapiUsdcSat == 0;

        /* D) a minimum the pool cannot meet: the tokens go to the fallback, not stranded */
        uint256 parca = kalan / 4;
        _bobdanKapiya(token, address(kapi), parca);
        kapi.lzCompose(s.adapter, bytes32(0), _compose(BASE_EID, BOB, parca, abi.encode(uint8(0), ARC, _b(ALICE), type(uint256).max, YEDEK, uint256(0))), address(0), "");
        s.yedekToken = IERC20S(token).balanceOf(YEDEK);

        /* E) redemption from another chain: burned through the chain entry */
        uint256 son = IERC20S(token).balanceOf(BOB);
        s.arzOnce = IArzT(token).totalSupply();
        _bobdanKapiya(token, address(kapi), son);
        kapi.lzCompose(s.adapter, bytes32(0), _compose(BASE_EID, BOB, son, abi.encode(uint8(1), BASE, _b(ALICE), uint256(0), YEDEK, uint256(0))), address(0), "");
        s.arzItfa = s.arzOnce - IArzT(token).totalSupply();

        /* F) authority */
        try MerkezKapi(payable(address(kapi))).sat(token, 1, 0, ARC, _b(ALICE), 0) { } catch { s.satDisaridan = true; }
        try this.disaridanCompose(kapi, s.adapter) { } catch { s.sahteUcNokta = true; }
        try kapi.lzCompose(address(0xBAD), bytes32(0), _compose(BASE_EID, BOB, 1, ""), address(0), "") { } catch { s.sahteAdapter = true; }

        /* H) held on Arc: satArc (next gate version) and a redemption straight through SepetUcu */
        _arcTarafi(kapi, token, s);

        /* G) the founder's trading income, passed on */
        s.vekilGelir = USDC.balanceOf(s.vekil);
        uint256 k0 = USDC.balanceOf(KURUCU);
        if (s.vekilGelir > 0) KurucuVekili(s.vekil).ilet(0);
        s.kurucuAldi = USDC.balanceOf(KURUCU) - k0;
        s.kapiNativeSon = address(kapi).balance;
    }

    function _arcTarafi(MerkezKapi kapi, address token, Sonuc memory s) internal {
        kapi.al(token, 40e6, 1, 0, _b(address(this)), "", address(this));
        uint256 elde = IERC20S(token).balanceOf(address(this));
        IERC20S(token).approve(address(kapi), elde);
        uint256 a0 = USDC.balanceOf(ALICE);
        kapi.satArc(token, elde / 3, 1, ARC, _b(ALICE), 0);
        s.arcSatAlice = USDC.balanceOf(ALICE) - a0;
        kapi.satArc(token, elde / 3, 1, BASE, _b(ALICE), 80_000);   // Circle forwarding fee cap (Iris: ~0.054)
        s.arcSatBaseBos = USDC.balanceOf(address(kapi)) == 0 && IERC20S(token).balanceOf(address(kapi)) == 0;
        /* every sale here runs in the launch's own second, under the snipe tax, so the payout
           primitive itself is measured with a harness: $5 to Ethereum, Solana and Robinhood */
        OdemeDeneme od = new OdemeDeneme();
        USDC.transfer(address(od), 20e6);
        try od.ode(TM, USDC, ARC, 0, _b(ALICE), 5e6, 1_400_000) { s.ethOdendi = USDC.balanceOf(address(od)) == 15e6; } catch { }
        try od.ode(TM, USDC, ARC, 5, bytes32(uint256(0xA11CE)), 5e6, 200_000) { s.solOdendi = USDC.balanceOf(address(od)) == 10e6; } catch { }
        try od.ode(TM, USDC, ARC, 6, _b(ALICE), 5e6, 5e6) { } catch { s.ucretRed = USDC.balanceOf(address(od)) == 10e6; }
        /* Robinhood (35): Circle has no route into it yet, so the sale reverts whole and nothing is lost */
        try od.ode(TM, USDC, ARC, 35, _b(ALICE), 5e6, 100_000) { } catch { }
        try kapi.satArc(token, elde / 12, 1, 35, _b(ALICE), 100_000) { } catch { s.rhOdendi = USDC.balanceOf(address(kapi)) == 0 && IERC20S(token).balanceOf(address(kapi)) == 0; }
        try kapi.satArc(address(USDC), 1, 0, ARC, _b(ALICE), 0) { } catch { s.satArcYabanci = true; }
        uint256 arz0 = IArzT(token).totalSupply();
        uint256 kalan = IERC20S(token).balanceOf(address(this));
        IERC20S(token).approve(address(UCU), kalan);
        UCU.itfa(token, kalan, BASE, _b(ALICE));
        s.arcItfa = arz0 - IArzT(token).totalSupply();
    }

    /// Called through `this` so that msg.sender is not the gate's endpoint.
    function disaridanCompose(MerkezKapi kapi, address adapter) external {
        Yabanci y = new Yabanci();
        y.dene(kapi, adapter);
    }

    /// Stands in for the token's Arc adapter crediting the gate after a
    /// twin was sent from another chain: the test buys that amount on Arc
    /// for itself (Bob has no code to move his own) and hands it over.
    function _bobdanKapiya(address token, address kapi, uint256 miktar) internal { _al(token, kapi, miktar); }

    /// Bob holds tokens but has no code; the test re-buys the same amount for
    /// the gate instead of moving Bob's: what reaches the gate is what an
    /// adapter would credit.
    function _al(address token, address kapi, uint256 miktar) internal {
        uint256 b = IERC20S(token).balanceOf(address(this));
        if (b < miktar) {
            MerkezKapi(payable(kapi)).al(token, 200e6, 1, 0, _b(address(this)), "", address(this));
        }
        IERC20S(token).transfer(kapi, miktar);
    }

    function _compose(uint32 srcEid, address from, uint256 miktar, bytes memory yuk) internal pure returns (bytes memory) {
        return OFTComposeMsgCodec.encode(1, srcEid, miktar, abi.encodePacked(bytes32(uint256(uint160(from))), yuk));
    }

    /* ---- this contract as the hub's LayerZero endpoint ---- */
    uint256 public hubSayac;
    uint32 public sonEid;
    bytes32 public sonSecenek;
    bytes32 public yaratSecenekGitti;
    function setDelegate(address) external {}
    function quote(LzParams2 calldata, address) external pure returns (LzFee2 memory) { return LzFee2(0.2e18, 0); }
    function send(LzParams2 calldata p, address) external payable returns (bytes32, uint64, LzFee2 memory) {
        hubSayac++;
        sonEid = p.dstEid;
        sonSecenek = keccak256(p.options);
        return (bytes32(hubSayac), uint64(hubSayac), LzFee2(msg.value, 0));
    }

    /// Twins on Sui: created at launch, bought to Sui (locked in the hub), sold back from Sui with an order.
    function _hub(MerkezKapi kapi, IkizHub hub, address token, Sonuc memory s) internal {
        s.hubYaratti = hub.yaratildi(token, SUI_EID);
        s.hubYaratSecenek = yaratSecenekGitti == keccak256(_sec(500_000));
        uint256 m0 = hubSayac;
        kapi.al{ value: 1e18 }(token, 20e6, 1, SUI_EID, _b(address(0x50CE)), _sec(300_000), address(this));
        s.hubKilitli = hub.kilitli(token);
        s.hubMesaj = hubSayac - m0;
        s.hubSonEid = sonEid;
        s.hubTasiSecenek = sonSecenek == keccak256(_sec(300_000));
        /* back from Sui: the gate burned the twins, the hub hands them to the gate with a SAT order paid on Arc */
        uint256 sd = s.hubKilitli / 1e12 / 2;
        uint256 a0 = USDC.balanceOf(ALICE);
        bytes memory ic = abi.encode(uint8(2), token, _b(address(0x50CE)), sd, abi.encode(uint8(0), ARC, _b(ALICE), uint256(1), YEDEK, uint256(0)));
        /* straight from the Sui eid: refused, Sui comes only through the hop */
        try hub.lzReceive(LzOrigin2(SUI_EID, _b(address(0x5017)), 1), bytes32(0), ic, address(0), "") { } catch { s.hubDogrudanRed = true; }
        hub.lzReceive(LzOrigin2(BASE_EID, AKTARMA, 1), bytes32(0), abi.encode(SUI_EID, ic), address(0), "");
        s.hubSatisAlice = USDC.balanceOf(ALICE) - a0;
        s.hubKilitSonra = hub.kilitli(token);
        try hub.lzReceive(LzOrigin2(BASE_EID, _b(address(0xBAD)), 2), bytes32(0),
            abi.encode(SUI_EID, abi.encode(uint8(2), token, _b(ALICE), uint256(1), bytes(""))), address(0), "") { } catch { s.hubYabanciRed = true; }
    }

    receive() external payable {}
}


/// Calls the gate's payout primitive directly (the sales in the test are too small, see above).
contract OdemeDeneme {
    function ode(ITokenMesajciM tm, IERC20S usdc, uint32 bu, uint32 zincir, bytes32 alici, uint256 miktar, uint256 maxUcret) external {
        Odeme.ode(tm, usdc, bu, zincir, alici, miktar, maxUcret);
    }
}

contract Yabanci {
    function dene(MerkezKapi kapi, address adapter) external {
        kapi.lzCompose(adapter, bytes32(0), OFTComposeMsgCodec.encode(1, 30184, 1, abi.encodePacked(bytes32(0), bytes(""))), address(0), "");
    }
}
