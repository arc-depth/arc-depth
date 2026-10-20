// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { HaberciLZ, ILzUcNokta2, ITokenMesajciLZ } from "../sepet/HaberciLZ.sol";
import { SepetDefteri } from "../sepet/SepetDefteri.sol";
import { SepetKasasi } from "../sepet/SepetKasasi.sol";
import { IHaberci, IERC20S, SepetMesaj } from "../sepet/IHaberci.sol";
import { ZincirTablosu } from "../lz/ZincirTablosu.sol";
import { IMesajTasiyiciV2 } from "../nesil2/CctpMesaj.sol";

/// One eth_call on Arc mainnet state (scripts/denetim-defter-v2.js): the
/// basket ledger's $50 rule (user, 18 Oct) with the new messenger, Arc's
/// real LayerZero endpoint and Circle's TokenMessengerV2.
///   A launch's lines wait as USDC on their own accounts; tax is split at
///   the launch's weights; a line that reaches $50 buys at once, inside the
///   call that brought the dollars (its Arc vault opens an auction; its Base
///   line leaves over LayerZero with its dollars by Circle forwarding); a
///   line whose chain cannot be reached keeps its dollars and the tax does
///   not revert; a redemption takes its share of the waiting USDC.
contract TestDefterV2 {
    IERC20S constant USDC = IERC20S(0x3600000000000000000000000000000000000000);
    ITokenMesajciLZ constant TM = ITokenMesajciLZ(0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d);
    IMesajTasiyiciV2 constant MT = IMesajTasiyiciV2(0x81D40F21F12A8F0E3252Bccb954D722d4c464B64);
    address constant FTHM = 0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE;
    bytes32 constant WETH_BASE = bytes32(uint256(uint160(0x4200000000000000000000000000000000000006)));
    bytes32 constant AVAX_TOKEN = bytes32(uint256(0xA7A7));
    uint32 constant ARC = 26;
    uint32 constant BASE = 6;
    uint32 constant AVAX = 1;
    uint32 constant BNB = 17;

    struct Sonuc {
        uint256 kayitArc; uint256 kayitBase; uint256 kayitAvax; uint256 ihaleKayit; bool hicGitmedi;
        uint256 vergi1Arc; uint256 vergi1Base; uint256 ihaleVergi1;
        uint256 arcGitti; bool baseGitti; uint256 baseKalan; uint256 ihaleVergi2; uint256 haberciKalan;
        uint256 avaxBekliyor; bool vergiDonmedi;
        uint256 itfaPay; uint256 beklemedeSonra; bool adaSolanaRed; bool adaEvmGitti;
    }

    function _b(address a) internal pure returns (bytes32) { return bytes32(uint256(uint160(a))); }
    function _sec(uint128 gaz) internal pure returns (bytes memory) { return abi.encodePacked(uint16(3), uint8(1), uint16(17), uint8(1), gaz); }

    function run() external returns (Sonuc memory s) {
        ZincirTablosu.Zincir memory z = ZincirTablosu.burasi();
        HaberciLZ h = new HaberciLZ(USDC, ILzUcNokta2(z.endpoint), TM, MT, ARC, ARC, true, IERC20S(address(0)));
        ZincirTablosu.dvnYaz(address(h));
        h.ikizEkle(BASE, 30184, _b(address(0xBA5E)));
        h.yolKur(BASE, h.YONLENDIR(), address(0), 150_000, bytes32(0));
        h.secenekKur(_sec(600_000));
        /* Avalanche is bound in the Defter but the messenger has no route to it: a line there cannot go */
        SepetDefteri d = new SepetDefteri(IHaberci(address(h)), USDC);
        SepetKasasi kArc = new SepetKasasi(IHaberci(address(h)), USDC, ARC, _b(address(d)));
        d.bagla(ARC, _b(address(this)), _b(address(kArc)));      // this contract plays the launchpad on Arc
        d.bagla(BASE, _b(address(0xB1)), _b(address(0xCA5A)));
        d.bagla(AVAX, _b(address(0xA1)), _b(address(0xCA5C)));
        USDC.approve(address(h), type(uint256).max);

        /* a launch: $8 FTHM on Arc, $8 WETH on Base, $4 on Avalanche (weights 8:8:4) */
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](3);
        k[0] = SepetDefteri.Kalem(ARC, _b(FTHM), 8e6);
        k[1] = SepetDefteri.Kalem(BASE, WETH_BASE, 8e6);
        k[2] = SepetDefteri.Kalem(AVAX, AVAX_TOKEN, 4e6);
        uint256[] memory ref = new uint256[](3);
        ref[0] = 530_000e18; ref[1] = 33e14; ref[2] = 1e18;
        bytes32 token = _b(address(0x7E57));
        h.gonder(ARC, _b(address(d)), abi.encode(SepetMesaj.KAYIT, token, _b(address(0x5A41B)), uint256(1e27), k, ref), 20e6);
        s.kayitArc = d.biriken(1, 0); s.kayitBase = d.biriken(1, 1); s.kayitAvax = d.biriken(1, 2);
        s.ihaleKayit = kArc.ihaleSayisi();
        s.hicGitmedi = USDC.balanceOf(address(d)) == 20e6;

        /* $50 of tax: 20 + 20 + 10 — every line still under $50, nothing goes */
        h.gonder(ARC, _b(address(d)), abi.encode(SepetMesaj.VERGI, token), 50e6);
        s.vergi1Arc = d.biriken(1, 0); s.vergi1Base = d.biriken(1, 1);
        s.ihaleVergi1 = kArc.ihaleSayisi();

        /* $60 more: Arc and Base pass $50 and buy in this same call; Avalanche passes $50 but cannot go */
        uint256 h0 = USDC.balanceOf(address(h));
        h.gonder(ARC, _b(address(d)), abi.encode(SepetMesaj.VERGI, token), 60e6);
        s.vergiDonmedi = true;
        s.arcGitti = kArc.usdcBakiye(1);
        s.ihaleVergi2 = kArc.ihaleSayisi();
        s.baseKalan = d.biriken(1, 1);
        s.baseGitti = s.baseKalan == 0;
        s.haberciKalan = USDC.balanceOf(address(h)) - h0;
        /* $150 more: Avalanche's share (20%) takes it past $50, but no route reaches it: it stays */
        h.gonder(ARC, _b(address(d)), abi.encode(SepetMesaj.VERGI, token), 150e6);
        s.avaxBekliyor = d.biriken(1, 2);

        /* a redemption (second launch, chains all reachable): a tenth of the supply takes a
           tenth of the waiting USDC; its orders to the vaults pay LayerZero from the fee balance */
        SepetDefteri.Kalem[] memory k2 = new SepetDefteri.Kalem[](2);
        k2[0] = SepetDefteri.Kalem(ARC, _b(FTHM), 10e6);
        k2[1] = SepetDefteri.Kalem(BASE, WETH_BASE, 10e6);
        uint256[] memory ref2 = new uint256[](2);
        ref2[0] = 660_000e18; ref2[1] = 41e14;
        bytes32 token2 = _b(address(0x7E58));
        h.gonder(ARC, _b(address(d)), abi.encode(SepetMesaj.KAYIT, token2, _b(address(0x5A41B)), uint256(1e27), k2, ref2), 20e6);
        USDC.transfer(address(h), 2e6);   // the fee balance a redemption tops up
        uint256 b0 = USDC.balanceOf(address(0xA11CE));
        uint256 once = d.beklemede(2);
        h.gonder(ARC, _b(address(d)), abi.encode(SepetMesaj.ITFA, token2, uint256(1e26), ARC, _b(address(0xA11CE))), 0);
        s.itfaPay = USDC.balanceOf(address(0xA11CE)) - b0;
        s.beklemedeSonra = once - d.beklemede(2);
        _ada(h, d, s);
    }

    /// A launch with a BNB line (an island: dollars by a relay deposit address).
    /// Redeeming it to a Solana address is refused at once (the island could
    /// not pay it); to an EVM address its BNB order goes out.
    function _ada(HaberciLZ h, SepetDefteri d, Sonuc memory s) internal {
        h.ikizEkle(BNB, 30102, _b(address(0xB0B)));
        h.yolKur(BNB, h.RELAY(), address(0xDE905), 0, bytes32(0));
        d.bagla(BNB, _b(address(0xB2)), _b(address(0xCA5B)));
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](2);
        k[0] = SepetDefteri.Kalem(ARC, _b(FTHM), 10e6);
        k[1] = SepetDefteri.Kalem(BNB, _b(address(0xBB4C)), 10e6);
        uint256[] memory ref = new uint256[](2);
        ref[0] = 660_000e18; ref[1] = 1e16;
        bytes32 token = _b(address(0x7E59));
        h.gonder(ARC, _b(address(d)), abi.encode(SepetMesaj.KAYIT, token, _b(address(0x5A41B)), uint256(1e27), k, ref), 20e6);
        USDC.transfer(address(h), 2e6);
        bytes32 solana = keccak256("a Solana holder");
        try h.gonder(ARC, _b(address(d)), abi.encode(SepetMesaj.ITFA, token, uint256(1e25), uint32(5), solana), 0) { }
        catch (bytes memory e) { s.adaSolanaRed = bytes4(e) == SepetDefteri.AdaEvmIster.selector; }
        h.gonder(ARC, _b(address(d)), abi.encode(SepetMesaj.ITFA, token, uint256(1e25), BASE, _b(address(0xA11CE))), 0);
        s.adaEvmGitti = true;
    }

    receive() external payable {}
}
