// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IkizFabrika, IkizOFTFabrika, IkizAdapter, IkizOFT } from "../lz/IkizFabrika.sol";
import { KopruJeton } from "./SahteLz.sol";
import { SendParam } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {
    MessagingParams, MessagingReceipt, MessagingFee, Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

interface IAlici2 {
    function lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata) external payable;
}

/// @notice One endpoint serving both chains in one EVM. In production the
///         endpoint (and the factory) sit at the same address on Arc and
///         Robinhood; a single EVM cannot hold two contracts at one address,
///         so this keeps which chain each OApp lives on and stamps
///         messages with the sender's chain. Delivery refuses a receiver
///         that is not on the destination chain.
contract CiftUcNokta {
    mapping(address => uint32) public zincir;
    mapping(address => address) public delegates;
    struct Bekleyen { uint32 dstEid; bytes32 receiver; address sender; bytes message; uint64 nonce; }
    Bekleyen[] public kuyruk;
    uint64 private sayac;

    function ata(address oapp, uint32 eid) external { zincir[oapp] = eid; }
    function setDelegate(address d) external { delegates[msg.sender] = d; }
    function quote(MessagingParams calldata, address) external pure returns (MessagingFee memory f) { return f; }

    function send(MessagingParams calldata p, address) external payable returns (MessagingReceipt memory r) {
        sayac++;
        kuyruk.push(Bekleyen(p.dstEid, p.receiver, msg.sender, p.message, sayac));
        r.guid = keccak256(abi.encode(msg.sender, sayac));
        r.nonce = sayac;
    }

    function son() external view returns (uint256) { return kuyruk.length - 1; }

    /// Delivers a message as if `gonderen` on chain `srcEid` had sent it.
    function sahteTeslim(address alici, uint32 srcEid, address gonderen, bytes calldata m) external {
        Origin memory o = Origin(srcEid, bytes32(uint256(uint160(gonderen))), 999);
        IAlici2(alici).lzReceive(o, bytes32(0), m, address(this), "");
    }

    function teslim(uint256 i) external {
        Bekleyen memory b = kuyruk[i];
        address alici = address(uint160(uint256(b.receiver)));
        require(zincir[alici] == b.dstEid, "alici o zincirde degil");
        Origin memory o = Origin(zincir[b.sender], bytes32(uint256(uint160(b.sender))), b.nonce);
        IAlici2(alici).lzReceive(o, bytes32(i), b.message, address(this), "");
    }
}

/// @title TestIkiz — a launch token gets a twin on the other chain
contract TestIkiz {
    uint32 constant ARC = 30417;
    uint32 constant RH = 30416;

    struct Sonuc {
        bool ikizBeklenenAdreste;
        bool adapterIkizeBagli; bool ikizAdapteraBagli;
        bool sahipYok; bool setPeerReddedildi;
        uint256 kilitli1; uint256 ikizArz1; uint256 rhAlici1;
        uint256 kilitli2; uint256 ikizArz2; uint256 arcAlici2;
        bool sahteIkizFarkliAdreste; bool sahteIkizMesajiReddedildi;
        bool ikinciKurulumReddedildi;
        string ikizAd; string ikizSembol; uint8 ikizOndalik;
    }

    function _b(address a) private pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    function run() external returns (Sonuc memory s) {
        CiftUcNokta ep = new CiftUcNokta();
        IkizOFTFabrika fo = new IkizOFTFabrika(address(ep));
        IkizFabrika f = new IkizFabrika(address(ep), fo);
        KopruJeton token = new KopruJeton(1_000_000_000e18, address(this));

        address adapter = f.adapterAdresi(address(token), ARC);
        address ikiz = f.ikizAdresi(address(token), ARC, adapter);
        ep.ata(adapter, ARC);
        ep.ata(ikiz, RH);

        require(f.evdeKur(address(token), ARC, RH) == adapter, "adapter adresi");
        s.ikizBeklenenAdreste = fo.karsidaKur(address(token), ARC, adapter, token.name(), token.symbol()) == ikiz;

        s.adapterIkizeBagli = IkizAdapter(adapter).peers(RH) == _b(ikiz);
        s.ikizAdapteraBagli = IkizOFT(ikiz).peers(ARC) == _b(adapter);
        s.sahipYok = IkizAdapter(adapter).owner() == address(0) && IkizOFT(ikiz).owner() == address(0);
        try IkizAdapter(adapter).setPeer(RH, _b(address(0xBAD))) { s.setPeerReddedildi = false; }
        catch { s.setPeerReddedildi = true; }
        s.ikizAd = IkizOFT(ikiz).name();
        s.ikizSembol = IkizOFT(ikiz).symbol();
        s.ikizOndalik = IkizOFT(ikiz).decimals();

        /* Arc -> Robinhood 1000, to a holder and to this harness. */
        token.approve(adapter, type(uint256).max);
        IkizAdapter(adapter).send(SendParam(RH, _b(address(0xB0B)), 1000e18, 1000e18, "", "", ""), MessagingFee(0, 0), address(this));
        ep.teslim(ep.son());
        IkizAdapter(adapter).send(SendParam(RH, _b(address(this)), 500e18, 500e18, "", "", ""), MessagingFee(0, 0), address(this));
        ep.teslim(ep.son());
        s.kilitli1 = token.balanceOf(adapter);
        s.ikizArz1 = IkizOFT(ikiz).totalSupply();
        s.rhAlici1 = IkizOFT(ikiz).balanceOf(address(0xB0B));

        /* Robinhood -> Arc 400 back. */
        IkizOFT(ikiz).send(SendParam(ARC, _b(address(0xA11CE)), 400e18, 400e18, "", "", ""), MessagingFee(0, 0), address(this));
        ep.teslim(ep.son());
        s.kilitli2 = token.balanceOf(adapter);
        s.ikizArz2 = IkizOFT(ikiz).totalSupply();
        s.arcAlici2 = token.balanceOf(address(0xA11CE));

        /* A twin deployed under another name lands elsewhere, and the
           adapter does not accept what it sends. */
        address sahte = fo.karsidaKur(address(token), ARC, adapter, "Fake", "FAKE");
        s.sahteIkizFarkliAdreste = sahte != ikiz;
        ep.ata(sahte, RH);
        /* A mint-style message claiming to come from the fake twin: the
           adapter must refuse to unlock for it. */
        bytes memory m = abi.encodePacked(_b(address(0xBAD)), uint64(1_000_000e6));
        try ep.sahteTeslim(adapter, RH, sahte, m) { s.sahteIkizMesajiReddedildi = false; }
        catch { s.sahteIkizMesajiReddedildi = true; }

        /* The same twin cannot be created twice. */
        try f.evdeKur(address(token), ARC, RH) { s.ikinciKurulumReddedildi = false; }
        catch { s.ikinciKurulumReddedildi = true; }
    }
}
