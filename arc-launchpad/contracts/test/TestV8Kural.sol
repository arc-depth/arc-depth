// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { TestV4Arc, IJetonV4 } from "./TestV4Arc.sol";
import { MerkezKapi } from "../merkez/MerkezKapi.sol";
import { SepetDefteri } from "../sepet/SepetDefteri.sol";

/// The v8 launch rules (owner, 31 Oct 2026) on the same simulated set as
/// TestV4Arc (scripts/denetim-v8-kural.js): first buy $20–$500, each basket
/// line at least 5% of the buy, and a $20 launch's pool that never runs out.
contract TestV8Kural is TestV4Arc {
    uint256 public sayac;

    /// One launch attempt with a two-line basket; false when the set refuses it.
    function dene(uint256 alim, uint256 d0, uint256 d1) external returns (bool ok, address t, uint256 kurucuToken) {
        USDC.approve(address(kapi), type(uint256).max);
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](2);
        k[0] = SepetDefteri.Kalem(ARC, _b(FTHM), d0);
        k[1] = SepetDefteri.Kalem(BASE, WETH_BASE, d1);
        uint256[] memory teklif = new uint256[](2);
        teklif[0] = 65_000e18 * d0 / 1e6; teklif[1] = 3e14 * d1 / 1e6;
        sayac++;
        MerkezKapi.LaunchIstegi memory r = MerkezKapi.LaunchIstegi({
            ad: "Kural Prova", sembol: string(abi.encodePacked("KRL", bytes1(uint8(64 + sayac)))), sepet: k, teklif: teklif,
            vergiPpm: 20_000, alim: alim, kurucu: _b(address(this)), kurucuZincir: ARC, kurucuEid: 0,
            ikizler: new uint32[](0), ikizSecenek: "", ikizUcret: 0, gonderSecenek: "", iade: address(this),
            tipler: new string[](2), uzakIkizler: new uint32[](0), uzakUcret: 0 });
        try kapi.launch(r) returns (address yeni) {
            ok = true; t = yeni;
            kurucuToken = IJetonV4(yeni).balanceOf(address(this));
            token = yeni;
        } catch { ok = false; }
    }

    /// Ever larger buys on the last launched token: each must go through and return tokens.
    function buyukAlimlar(uint256[] calldata tutarlar) external returns (uint256[] memory alinan) {
        alinan = new uint256[](tutarlar.length);
        IJetonV4 t = IJetonV4(token);
        for (uint256 i = 0; i < tutarlar.length; i++) {
            uint256 b0 = t.balanceOf(address(this));
            kapi.al(token, tutarlar[i], 1, 0, _b(address(this)), "", address(this));
            alinan[i] = t.balanceOf(address(this)) - b0;
        }
    }
}
