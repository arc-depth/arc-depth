// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { MerkezKapi } from "../merkez/MerkezKapi.sol";
import { SepetDefteri } from "../sepet/SepetDefteri.sol";
import { IERC20S } from "../sepet/IHaberci.sol";

interface IYayiciP {
    function ucret(address, uint32[] calldata, bytes calldata) external view returns (uint256);
    function adapterAdresi(address) external view returns (address);
}
interface IHubT {
    function yarat(address, uint32[] calldata, address) external payable;
    function gonder(address, uint32, bytes32, uint256, address) external payable returns (uint256);
}
interface IJetonA { function approve(address, uint256) external returns (bool); function name() external view returns (string memory); function symbol() external view returns (string memory); }
interface IHubP {
    function ucret(uint32, bytes calldata) external view returns (uint256);
    function kilitli(address) external view returns (uint256);
    function yaratildi(address, uint32) external view returns (bool);
}
interface IJetonP { function balanceOf(address) external view returns (uint256); }

/// The joint test launch, rehearsed (scripts/denetim-v2-prova.js): exactly the
/// request the site sends in v2 (docs/js/gorunum/merkez.js), against the
/// wired second generation on Arc mainnet, with LayerZero's real fees.
///   Block 1: the launch: twins on the eight other EVM chains (IkizYayici)
///            and on Solana, Sui, Aptos (IkizHub), the founder paid on Arc.
///   Block 2 (past the snipe window): a buy delivered on Arc, one on Base
///            (LayerZero), one on Sui (the hub, through the Base hop).
contract TestV2Prova {
    IERC20S constant USDC = IERC20S(0x3600000000000000000000000000000000000000);
    address constant FTHM = 0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE;
    uint32 constant ARC = 26;

    struct Sonuc {
        address token; uint256 ikizUcret; uint256 uzakUcret; bool solana; bool sui; bool aptos;
        uint256 arcAlim; uint256 baseAlimKilit; uint256 suiKilit; uint256 kapiDolar; uint256 harcananYerel;
    }

    address public sonToken;
    uint256 public sonIkizUcret;
    uint256 public sonUzakUcret;

    function _b(address a) internal pure returns (bytes32) { return bytes32(uint256(uint160(a))); }
    function _sec(uint128 g) internal pure returns (bytes memory) { return abi.encodePacked(uint16(3), uint8(1), uint16(17), uint8(1), g); }

    function kur(MerkezKapi kapi, IYayiciP yayici, IHubP hub, uint32[] calldata uzak) external returns (address token) {
        USDC.approve(address(kapi), type(uint256).max);
        uint32[] memory ikizler = new uint32[](8);
        (ikizler[0], ikizler[1], ikizler[2], ikizler[3]) = (30416, 30184, 30110, 30101);
        (ikizler[4], ikizler[5], ikizler[6], ikizler[7]) = (30102, 30106, 30390, 30367);
        bytes memory ikizSec = _sec(3_500_000);
        uint256 ikizUcret = (yayici.ucret(FTHM, ikizler, ikizSec) * 13) / 10;
        bytes memory ornek = abi.encode(uint8(1), FTHM, "Prova Ortak", "PROVA");
        uint256 uzakUcret;
        for (uint256 i = 0; i < uzak.length; i++) uzakUcret += hub.ucret(uzak[i], ornek);
        uzakUcret = (uzakUcret * 13) / 10;
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](1);
        k[0] = SepetDefteri.Kalem(ARC, _b(FTHM), 20e6);
        uint256[] memory teklif = new uint256[](1);
        teklif[0] = 1_300_000e18;
        MerkezKapi.LaunchIstegi memory r = MerkezKapi.LaunchIstegi({
            ad: "Prova Ortak", sembol: "PROVA", sepet: k, teklif: teklif, vergiPpm: 20_000, alim: 100e6,
            kurucu: _b(address(this)), kurucuZincir: ARC, kurucuEid: 0, ikizler: ikizler, ikizSecenek: ikizSec,
            ikizUcret: ikizUcret, gonderSecenek: _sec(100_000), iade: address(this), tipler: new string[](1),
            uzakIkizler: uzak, uzakUcret: uzakUcret });
        token = kapi.launch{ value: ikizUcret + uzakUcret + 2e18 }(r);
        (sonToken, sonIkizUcret, sonUzakUcret) = (token, ikizUcret, uzakUcret);
    }

    function isle(MerkezKapi kapi, IYayiciP yayici, IHubP hub) external returns (Sonuc memory s) {
        s.token = sonToken;
        address adapter = yayici.adapterAdresi(s.token);
        (s.ikizUcret, s.uzakUcret) = (sonIkizUcret, sonUzakUcret);
        (s.solana, s.sui, s.aptos) = (hub.yaratildi(s.token, 30168), hub.yaratildi(s.token, 30378), hub.yaratildi(s.token, 30108));
        uint256 y0 = address(this).balance;
        IJetonP t = IJetonP(s.token);
        uint256 b0 = t.balanceOf(address(this));
        kapi.al(s.token, 50e6, 1, 0, _b(address(this)), "", address(this));
        s.arcAlim = t.balanceOf(address(this)) - b0;
        uint256 a0 = t.balanceOf(adapter);
        kapi.al{ value: 2e18 }(s.token, 50e6, 1, 30184, _b(address(this)), _sec(100_000), address(this));
        s.baseAlimKilit = t.balanceOf(adapter) - a0;
        /* the hub's LayerZero fee for a transfer to Sui (through the Base hop), asked, not guessed */
        /* delivered on Sui only when its twin exists there (on demand it is created by the first mover) */
        if (s.sui) {
            uint256 suiUcret = (hub.ucret(30378, abi.encode(uint8(2), s.token, bytes32(uint256(0x5017)), uint256(1))) * 13) / 10;
            kapi.al{ value: suiUcret }(s.token, 50e6, 1, 30378, bytes32(uint256(0x5017)), _sec(100_000), address(this));
        }
        s.suiKilit = hub.kilitli(s.token);
        s.kapiDolar = USDC.balanceOf(address(kapi));
        s.harcananYerel = y0 - address(this).balance;
    }

    function alArc(MerkezKapi kapi) external { kapi.al(sonToken, 50e6, 1, 0, _b(address(this)), "", address(this)); }
    function alBase(MerkezKapi kapi) external { kapi.al{ value: 2e18 }(sonToken, 50e6, 1, 30184, _b(address(this)), _sec(100_000), address(this)); }
    function alSui(MerkezKapi kapi) external { kapi.al{ value: 2e18 }(sonToken, 50e6, 1, 30378, bytes32(uint256(0x5017)), _sec(100_000), address(this)); }

    /// On demand (the site's default): the first holder who moves the token to `eid` creates its twin there, then moves.
    function talepUzerine(IHubP hub, uint32 eid, bytes32 alici, uint256 miktar) external returns (bool once, bool sonra, uint256 kilit) {
        address t = sonToken;
        once = hub.yaratildi(t, eid);
        bytes memory y = abi.encode(uint8(1), t, IJetonA(t).name(), IJetonA(t).symbol());
        IHubT(address(hub)).yarat{ value: (hub.ucret(eid, y) * 13) / 10 }(t, _tek(eid), address(this));
        sonra = hub.yaratildi(t, eid);
        IJetonA(t).approve(address(hub), miktar);
        uint256 u = (hub.ucret(eid, abi.encode(uint8(2), t, alici, miktar / 1e12)) * 13) / 10;
        IHubT(address(hub)).gonder{ value: u }(t, eid, alici, miktar, address(this));
        kilit = hub.kilitli(t);
    }
    function _tek(uint32 e) internal pure returns (uint32[] memory a) { a = new uint32[](1); a[0] = e; }

    receive() external payable {}
}
