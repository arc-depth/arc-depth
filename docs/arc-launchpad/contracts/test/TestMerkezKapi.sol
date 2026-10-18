// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { MerkezKapi, KurucuVekili, ILaunchpadM, IIkizYayiciM, IHaberciM, ISepetUcuM } from "../merkez/MerkezKapi.sol";
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
    IHaberciM constant HABERCI = IHaberciM(0xf374AD6031FFcF45afedf74a0f7a1E62FD31FB04);
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

    struct Sonuc {
        address token; address vekil; address adapter; bool adapterKodu; bool adapterKayitli;
        uint256 kurucuToken; uint256 adapterKilitli; uint256 kapiUsdcLaunch;
        uint256 bobToken; uint256 baseAlinan; uint256 adapterSonra;
        uint256 aliceUsdc; uint256 kapiUsdcSat; bool baseOdemeGitti;
        uint256 yedekToken; uint256 arzOnce; uint256 arzItfa;
        bool sahteUcNokta; bool sahteAdapter; bool satDisaridan;
        uint256 vekilGelir; uint256 kurucuAldi;
        uint256 kapiNativeSon;
        uint256 arcSatAlice; bool arcSatBaseBos; bool satArcYabanci; uint256 arcItfa; bool ethOdendi; bool rhOdendi;
    }

    function _b(address a) internal pure returns (bytes32) { return bytes32(uint256(uint160(a))); }
    function _sec(uint128 gaz) internal pure returns (bytes memory) { return abi.encodePacked(uint16(3), uint8(1), uint16(17), uint8(1), gaz); }

    function run() external returns (Sonuc memory s) {
        MerkezKapi kapi = new MerkezKapi(LP, PM, YAYICI, HABERCI, UCU, USDC, address(this));
        USDC.approve(address(kapi), type(uint256).max);

        /* A) a launch as relay would make it: basket of FTHM on Arc + WETH on Base, founder paid on Arc, tokens to Base */
        MerkezKapi.LaunchIstegi memory r;
        r.ad = "Merkez Prova"; r.sembol = "MPROVA";
        r.sepet = new SepetDefteri.Kalem[](2);
        r.sepet[0] = SepetDefteri.Kalem(ARC, _b(FTHM), 10e6);
        r.sepet[1] = SepetDefteri.Kalem(BASE, BASE_WETH, 10e6);
        r.teklif = new uint256[](2);
        r.teklif[0] = 600_000e18; r.teklif[1] = 4e15;
        r.vergiPpm = 20_000; r.alim = 100e6;
        r.kurucu = _b(KURUCU); r.kurucuZincir = ARC; r.kurucuEid = BASE_EID;
        r.ikizler = new uint32[](2); r.ikizler[0] = BASE_EID; r.ikizler[1] = ARB_EID;
        r.ikizSecenek = _sec(3_500_000);
        r.gonderSecenek = _sec(100_000);
        r.iade = address(this);
        r.ikizUcret = 30e18;     // generous; the excess comes back
        address token = kapi.launch{ value: 60e18 }(r);
        s.token = token;
        s.vekil = kapi.vekilOf(token);
        s.adapter = YAYICI.adapterAdresi(token);
        s.adapterKodu = s.adapter.code.length > 0;
        s.adapterKayitli = kapi.tokenOfAdapter(s.adapter) == token;
        s.kurucuToken = 0;
        s.adapterKilitli = IERC20S(token).balanceOf(s.adapter);   // the founder's tokens, locked for Base
        s.kapiUsdcLaunch = USDC.balanceOf(address(kapi));

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
        kapi.lzCompose(s.adapter, bytes32(0), _compose(BASE_EID, BOB, satilan, abi.encode(uint8(0), ARC, _b(ALICE), uint256(1), YEDEK)), address(0), "");
        s.aliceUsdc = USDC.balanceOf(ALICE) - aliceOnce;
        /* paid on Base: the dollars leave through the Haberci (CCTP burn) */
        uint256 kalan = s.bobToken - satilan;
        _bobdanKapiya(token, address(kapi), kalan / 2);
        kapi.lzCompose(s.adapter, bytes32(0), _compose(BASE_EID, BOB, kalan / 2, abi.encode(uint8(0), BASE, _b(ALICE), uint256(1), YEDEK)), address(0), "");
        s.kapiUsdcSat = USDC.balanceOf(address(kapi));
        s.baseOdemeGitti = s.kapiUsdcSat == 0;

        /* D) a minimum the pool cannot meet: the tokens go to the fallback, not stranded */
        uint256 parca = kalan / 4;
        _bobdanKapiya(token, address(kapi), parca);
        kapi.lzCompose(s.adapter, bytes32(0), _compose(BASE_EID, BOB, parca, abi.encode(uint8(0), ARC, _b(ALICE), type(uint256).max, YEDEK)), address(0), "");
        s.yedekToken = IERC20S(token).balanceOf(YEDEK);

        /* E) redemption from another chain: burned through the chain entry */
        uint256 son = IERC20S(token).balanceOf(BOB);
        s.arzOnce = IArzT(token).totalSupply();
        _bobdanKapiya(token, address(kapi), son);
        kapi.lzCompose(s.adapter, bytes32(0), _compose(BASE_EID, BOB, son, abi.encode(uint8(1), BASE, _b(ALICE), uint256(0), YEDEK)), address(0), "");
        s.arzItfa = s.arzOnce - IArzT(token).totalSupply();

        /* F) authority */
        try MerkezKapi(payable(address(kapi))).sat(token, 1, 0, ARC, _b(ALICE)) { } catch { s.satDisaridan = true; }
        try this.disaridanCompose(kapi, s.adapter) { } catch { s.sahteUcNokta = true; }
        try kapi.lzCompose(address(0xBAD), bytes32(0), _compose(BASE_EID, BOB, 1, ""), address(0), "") { } catch { s.sahteAdapter = true; }

        /* H) held on Arc: satArc (next gate version) and a redemption straight through SepetUcu */
        _arcTarafi(kapi, token, s);

        /* G) the founder's trading income, passed on */
        s.vekilGelir = USDC.balanceOf(s.vekil);
        uint256 k0 = USDC.balanceOf(KURUCU);
        if (s.vekilGelir > 0) KurucuVekili(s.vekil).ilet();
        s.kurucuAldi = USDC.balanceOf(KURUCU) - k0;
        s.kapiNativeSon = address(kapi).balance;
    }

    function _arcTarafi(MerkezKapi kapi, address token, Sonuc memory s) internal {
        kapi.al(token, 40e6, 1, 0, _b(address(this)), "", address(this));
        uint256 elde = IERC20S(token).balanceOf(address(this));
        IERC20S(token).approve(address(kapi), elde);
        uint256 a0 = USDC.balanceOf(ALICE);
        kapi.satArc(token, elde / 3, 1, ARC, _b(ALICE));
        s.arcSatAlice = USDC.balanceOf(ALICE) - a0;
        kapi.satArc(token, elde / 3, 1, BASE, _b(ALICE));
        s.arcSatBaseBos = USDC.balanceOf(address(kapi)) == 0 && IERC20S(token).balanceOf(address(kapi)) == 0;
        /* Ethereum (0) and Robinhood (35): their Habercis since 18 Oct; the dollars leave through CCTP */
        kapi.satArc(token, elde / 12, 1, 0, _b(ALICE));
        s.ethOdendi = USDC.balanceOf(address(kapi)) == 0;
        /* Robinhood (35): Circle has no route into it yet, so the sale reverts whole and nothing is lost */
        try kapi.satArc(token, elde / 12, 1, 35, _b(ALICE)) { } catch { s.rhOdendi = USDC.balanceOf(address(kapi)) == 0 && IERC20S(token).balanceOf(address(kapi)) == 0; }
        try kapi.satArc(address(USDC), 1, 0, ARC, _b(ALICE)) { } catch { s.satArcYabanci = true; }
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

    receive() external payable {}
}


contract Yabanci {
    function dene(MerkezKapi kapi, address adapter) external {
        kapi.lzCompose(adapter, bytes32(0), OFTComposeMsgCodec.encode(1, 30184, 1, abi.encodePacked(bytes32(0), bytes(""))), address(0), "");
    }
}
