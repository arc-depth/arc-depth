// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IkizYayici } from "../lz/IkizYayici.sol";
import { IkizOFTFabrikaAg, IkizFabrikaAg, IkizAdapterAg } from "../lz/IkizAg.sol";
import { ZincirTablosu } from "../lz/ZincirTablosu.sol";
import { KopruJeton } from "./SahteLz.sol";
import { Origin, MessagingParams, MessagingReceipt, MessagingFee } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";

/// @title TestIkizYayici — sending side, against each chain's REAL endpoint
/// @notice eth_call on each chain with a native balance given to this
///         harness. Spreads a fresh token to all eight other chains through
///         the real endpoint: the real DVNs and executor are paid, and what
///         is left comes back.
contract TestIkizYayici {
    struct Sonuc { uint32 eid; uint256 ucret; uint256 harcanan; bool adapterVar; address ikiz; uint256 hedef; bool sahipsiz; }

    receive() external payable {}

    function run() external returns (Sonuc memory s) {
        ZincirTablosu.Zincir memory b = ZincirTablosu.burasi();
        s.eid = b.eid;
        KopruJeton token = new KopruJeton(1_000_000e18, address(this));
        IkizOFTFabrikaAg ofab = new IkizOFTFabrikaAg();
        IkizFabrikaAg fab = new IkizFabrikaAg(ofab);
        IkizYayici y = new IkizYayici(fab);
        s.sahipsiz = y.owner() == address(0);

        uint32[] memory h = new uint32[](ZincirTablosu.ADET - 1);
        uint256 j;
        for (uint256 i; i < ZincirTablosu.ADET; i++) {
            uint32 e = ZincirTablosu.sira(i).eid;
            if (e != b.eid) h[j++] = e;
        }
        s.hedef = h.length;
        /* lzReceive gas for a twin deployment on the other side */
        bytes memory sec = hex"0003010011010000000000000000000000000042c1d8";
        s.ucret = y.ucret(address(token), h, sec);
        uint256 once = address(this).balance;
        y.yay{ value: s.ucret + 1 ether / 1000 }(address(token), h, sec);
        s.harcanan = once - address(this).balance;
        s.adapterVar = y.adapterAdresi(address(token)).code.length > 0;
        s.ikiz = y.ikizAdresi(address(token));
    }
}

/// @title TestIkizYayiciAlim — receiving side, run AS the endpoint on Arc
/// @notice Placed at the real endpoint address with cleared storage, so the
///         spreader built here talks to this harness. Delivers a spread
///         message as the executor would and reads back the twin.
contract TestIkizYayiciAlim {
    function setDelegate(address) external {}
    function setConfig(address, address, SetConfigParam[] calldata) external {}
    function quote(MessagingParams calldata, address) external pure returns (MessagingFee memory f) { return f; }
    function send(MessagingParams calldata, address) external payable returns (MessagingReceipt memory r) { return r; }

    struct Sonuc { address beklenen; bool kuruldu; bool ikinciZararsiz; bool yabanciReddedildi; uint256 ikizArz; string ikizAd; }

    function run() external returns (Sonuc memory s) {
        IkizOFTFabrikaAg ofab = new IkizOFTFabrikaAg();
        IkizFabrikaAg fab = new IkizFabrikaAg(ofab);
        IkizYayici y = new IkizYayici(fab);
        uint32 base = 30184;
        address evToken = address(0x70CE);
        address evAdapter = address(0xADA9);
        bytes memory m = abi.encode(evToken, "Pulse Cat", "PCAT", base, evAdapter);
        s.beklenen = ofab.ikizAdresi(evToken, base, evAdapter, "Pulse Cat", "PCAT");
        bytes32 self = bytes32(uint256(uint160(address(y))));
        y.lzReceive(Origin(base, self, 1), bytes32(uint256(1)), m, address(this), "");
        s.kuruldu = s.beklenen.code.length > 0;
        if (s.kuruldu) { s.ikizArz = KopruJeton(s.beklenen).totalSupply(); s.ikizAd = KopruJeton(s.beklenen).name(); }
        try y.lzReceive(Origin(base, self, 2), bytes32(uint256(2)), m, address(this), "") { s.ikinciZararsiz = true; } catch { }
        try y.lzReceive(Origin(base, bytes32(uint256(0xBAD)), 3), bytes32(uint256(3)), m, address(this), "") { } catch { s.yabanciReddedildi = true; }
    }
}
