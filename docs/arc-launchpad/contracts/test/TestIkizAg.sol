// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IkizAdapterAg, IkizOFTAg, IkizOFTFabrikaAg, IkizFabrikaAg } from "../lz/IkizAg.sol";
import { ZincirTablosu } from "../lz/ZincirTablosu.sol";
import { KopruJeton } from "./SahteLz.sol";
import { SendParam, MessagingFee } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

interface IDelege { function delegates(address) external view returns (address); }

/// @title TestIkizAg — the twin generation, against the REAL LayerZero endpoint of whichever chain runs it
/// @notice Run with eth_call on each of the nine chains. On each it builds a
///         home adapter for a test token and a twin homed elsewhere, then reads
///         back from the real endpoint: the DVN config each wrote for every
///         pathway, its peers, its delegate, its owner — and asks the real
///         endpoint to price a send to every other chain, which only succeeds
///         when both DVNs and the executor serve that pathway.
contract TestIkizAg {
    address constant OLU = 0x000000000000000000000000000000000000dEaD;

    struct Hat { uint32 eid; bool adapterAyar; bool ikizAyar; bool adapterPeer; bool ikizPeer; uint256 adapterUcret; uint256 ikizUcret; string hata; }
    struct Sonuc {
        uint256 chainId; uint32 eid;
        address adapter; address ikiz; address beklenenIkiz;
        bool adapterSahipsiz; bool ikizSahipsiz; bool adapterDelegeOlu; bool ikizDelegeOlu;
        Hat[] hatlar;
    }

    function _b(address a) private pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    function _ayarDogru(address oapp, ZincirTablosu.Zincir memory b, ZincirTablosu.Zincir memory k) private view returns (bool) {
        ILayerZeroEndpointV2 ep = ILayerZeroEndpointV2(b.endpoint);
        bytes memory g = ep.getConfig(oapp, b.gonderim, k.eid, 2);
        bytes memory a = ep.getConfig(oapp, b.alim, k.eid, 2);
        ZincirTablosu.UlnConfig memory ug = abi.decode(g, (ZincirTablosu.UlnConfig));
        ZincirTablosu.UlnConfig memory ua = abi.decode(a, (ZincirTablosu.UlnConfig));
        return ug.confirmations == b.onay && ug.requiredDVNCount == 2 && ug.requiredDVNs[0] == b.dvn0 && ug.requiredDVNs[1] == b.dvn1
            && ua.confirmations == k.onay && ua.requiredDVNCount == 2 && ua.requiredDVNs[0] == b.dvn0 && ua.requiredDVNs[1] == b.dvn1;
    }

    function run() external returns (Sonuc memory s) {
        ZincirTablosu.Zincir memory b = ZincirTablosu.burasi();
        s.chainId = block.chainid;
        s.eid = b.eid;

        KopruJeton token = new KopruJeton(1_000_000e18, address(this));
        IkizOFTFabrikaAg ofab = new IkizOFTFabrikaAg();
        IkizFabrikaAg fab = new IkizFabrikaAg(ofab);
        (s.adapter, s.ikiz) = fab.evdeKur(address(token));

        /* A twin living here, homed on another chain (Arc, or Robinhood when this is Arc). */
        uint32 evEid = b.eid == 30417 ? 30416 : 30417;
        address sahteEvAdapter = address(0xADA9);
        address ikizBurada = ofab.karsidaKur(address(0x70CE), evEid, sahteEvAdapter, "Twin", "TWN");
        s.beklenenIkiz = ofab.ikizAdresi(address(0x70CE), evEid, sahteEvAdapter, "Twin", "TWN");

        s.adapterSahipsiz = IkizAdapterAg(s.adapter).owner() == address(0);
        s.ikizSahipsiz = IkizOFTAg(ikizBurada).owner() == address(0);
        s.adapterDelegeOlu = IDelege(b.endpoint).delegates(s.adapter) == OLU;
        s.ikizDelegeOlu = IDelege(b.endpoint).delegates(ikizBurada) == OLU;

        token.approve(s.adapter, type(uint256).max);
        s.hatlar = new Hat[](ZincirTablosu.ADET - 1);
        uint256 j;
        for (uint256 i; i < ZincirTablosu.ADET; i++) {
            ZincirTablosu.Zincir memory k = ZincirTablosu.sira(i);
            if (k.eid == b.eid) continue;
            Hat memory h = s.hatlar[j++];
            h.eid = k.eid;
            h.adapterAyar = _ayarDogru(s.adapter, b, k);
            h.ikizAyar = _ayarDogru(ikizBurada, b, k);
            h.adapterPeer = IkizAdapterAg(s.adapter).peers(k.eid) == _b(s.ikiz);
            h.ikizPeer = IkizOFTAg(ikizBurada).peers(k.eid) == _b(k.eid == evEid ? sahteEvAdapter : ikizBurada);
            SendParam memory p = SendParam(k.eid, _b(address(0xB0B)), 1e18, 0, hex"00030100110100000000000000000000000000030d40", "", "");
            try IkizAdapterAg(s.adapter).quoteSend(p, false) returns (MessagingFee memory f) { h.adapterUcret = f.nativeFee; }
            catch Error(string memory r) { h.hata = r; } catch { h.hata = "adapter quote reverted"; }
            try IkizOFTAg(ikizBurada).quoteSend(p, false) returns (MessagingFee memory f) { h.ikizUcret = f.nativeFee; }
            catch Error(string memory r) { h.hata = string.concat(h.hata, " / ", r); } catch { h.hata = string.concat(h.hata, " / twin quote reverted"); }
        }
    }
}
