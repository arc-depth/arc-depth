// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { AktarmaLZ } from "../lz/AktarmaLZ.sol";
import { ZincirTablosu } from "../lz/ZincirTablosu.sol";
import { ILzUcNokta2, LzParams2, LzFee2, LzOrigin2 } from "../sepet/HaberciLZ.sol";

/// One eth_call on Base mainnet state (scripts/denetim-aktarma-lz.js).
///   MANTIK  the hop with this contract as its endpoint: Arc hub -> Sui gate,
///           Sui gate -> Arc hub (source chain added), strangers refused
///   UCRET   Base's real LayerZero endpoint quoting the second hop to Sui,
///           Aptos and Arc (what the first hop must carry as native value)
contract TestAktarmaLZ {
    address constant BASE_EP = 0x1a44076050125825900e736c501f859c50fE728c;
    uint32 constant ARC = 30417;
    uint32 constant SUI = 30378;
    uint32 constant APTOS = 30108;
    bytes32 constant HUB = bytes32(uint256(0xA2C11B));
    bytes32 constant SUI_KAPI = bytes32(uint256(0x5017));

    struct Sonuc {
        bool arcdanSuiye; bool suidenArca; bool yabanciRed; bool arcYabanciRed; bool kapisizRed; bool ucretsizRed;
        uint256 ucretSui; uint256 ucretAptos; uint256 ucretArc; bool suiDestek; bool aptosDestek;
    }

    uint32 public sonEid;
    address oapp;
    bytes32 public sonOzet;

    function _sec(uint128 gaz) internal pure returns (bytes memory) { return abi.encodePacked(uint16(3), uint8(1), uint16(17), uint8(1), gaz); }

    /* this contract as the hop's endpoint */
    function setDelegate(address) external {}
    function quote(LzParams2 calldata, address) external pure returns (LzFee2 memory) { return LzFee2(0.0001 ether, 0); }
    function send(LzParams2 calldata p, address) external payable returns (bytes32, uint64, LzFee2 memory) {
        sonEid = p.dstEid;
        sonOzet = keccak256(p.message);
        return (bytes32(0), 0, LzFee2(msg.value, 0));
    }

    function run() external returns (Sonuc memory s) {
        _mantik(s);
        _ucret(s);
    }

    function _mantik(Sonuc memory s) internal {
        AktarmaLZ a = new AktarmaLZ(ILzUcNokta2(address(this)));
        a.hubKur(ARC, HUB, _sec(600_000));
        a.kapiEkle(SUI, SUI_KAPI, _sec(300_000));
        bytes memory ic = abi.encode(uint8(2), address(0x7E57), bytes32(uint256(0x50CE)), uint256(1e6), bytes(""));

        /* no balance: the second hop cannot be paid, the message stays for a retry with value */
        try a.lzReceive(LzOrigin2(ARC, HUB, 1), bytes32(0), abi.encode(SUI, ic), address(0), "") { } catch { s.ucretsizRed = true; }
        payable(address(a)).transfer(0.01 ether);

        a.lzReceive(LzOrigin2(ARC, HUB, 1), bytes32(0), abi.encode(SUI, ic), address(0), "");
        s.arcdanSuiye = sonEid == SUI && sonOzet == keccak256(ic);
        a.lzReceive(LzOrigin2(SUI, SUI_KAPI, 1), bytes32(0), ic, address(0), "");
        s.suidenArca = sonEid == ARC && sonOzet == keccak256(abi.encode(SUI, ic));
        try a.lzReceive(LzOrigin2(SUI, bytes32(uint256(0xBAD)), 2), bytes32(0), ic, address(0), "") { } catch { s.yabanciRed = true; }
        try a.lzReceive(LzOrigin2(ARC, bytes32(uint256(0xBAD)), 2), bytes32(0), abi.encode(SUI, ic), address(0), "") { } catch { s.arcYabanciRed = true; }
        try a.lzReceive(LzOrigin2(ARC, HUB, 2), bytes32(0), abi.encode(APTOS, ic), address(0), "") { } catch { s.kapisizRed = true; }
    }

    function _ucret(Sonuc memory s) internal {
        /* a hop on the real endpoint, its DVNs written as the deployment will (LayerZero Labs + Nethermind) */
        AktarmaLZ g = new AktarmaLZ(ILzUcNokta2(BASE_EP));
        ZincirTablosu.uzakDvnYaz(address(g), SUI, 3);
        ZincirTablosu.uzakDvnYaz(address(g), APTOS, 3);
        ZincirTablosu.dvnYaz(address(g));
        oapp = address(g);
        s.suiDestek = IDestek(BASE_EP).isSupportedEid(SUI);
        s.aptosDestek = IDestek(BASE_EP).isSupportedEid(APTOS);
        bytes memory ic = abi.encode(uint8(2), address(0x7E57), bytes32(uint256(0x50CE)), uint256(1e6), bytes(""));
        s.ucretSui = _q(SUI, SUI_KAPI, ic, _sec(300_000));
        s.ucretAptos = _q(APTOS, SUI_KAPI, ic, _sec(300_000));
        s.ucretArc = _q(ARC, HUB, abi.encode(SUI, ic), _sec(600_000));
    }

    function _q(uint32 eid, bytes32 alici, bytes memory m, bytes memory o) internal view returns (uint256) {
        return ILzUcNokta2(BASE_EP).quote(LzParams2(eid, alici, m, o, false), oapp).nativeFee;
    }

    receive() external payable {}
}

interface IDestek { function isSupportedEid(uint32) external view returns (bool); }
