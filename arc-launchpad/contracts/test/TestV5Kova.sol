// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { TestV4Arc } from "./TestV4Arc.sol";
import { MerkezKapi } from "../merkez/MerkezKapi.sol";
import { SepetDefteri } from "../sepet/SepetDefteri.sol";
import { IERC20S } from "../sepet/IHaberci.sol";

/// v5 (24 Oct 2026): the set of TestV4Arc with the v5 Defter and hook, bound
/// to the live v4 vaults' addresses on Arbitrum, Solana, Sui and Aptos as
/// well, so a launch may carry any mix of up to five lines
/// (scripts/denetim-v5-kova.js). Trades come from an outside address so their
/// gas is the transaction's own.
contract TestV5Kova is TestV4Arc {
    function baglaEk(uint32[] calldata z, bytes32[] calldata k) external {
        for (uint256 i = 0; i < z.length; i++) defter.bagla(z[i], bytes32(uint256(1)), k[i]);
    }

    function launchSatir(SepetDefteri.Kalem[] calldata k, uint256[] calldata teklif, string[] calldata tipler)
        external returns (address t)
    {
        IERC20S(0x3600000000000000000000000000000000000000).approve(address(kapi), type(uint256).max);
        MerkezKapi.LaunchIstegi memory r = MerkezKapi.LaunchIstegi({
            ad: "Bes Prova", sembol: "BES5", sepet: k, teklif: teklif, vergiPpm: 20_000, alim: 100e6,
            kurucu: _b(address(this)), kurucuZincir: 26, kurucuEid: 0, ikizler: new uint32[](0), ikizSecenek: "",
            ikizUcret: 0, gonderSecenek: "", iade: address(this), tipler: tipler, uzakIkizler: new uint32[](0), uzakUcret: 0 });
        t = kapi.launch(r);
        token = t;
        id = defter.idOf(26, _b(t));
    }

    /// The bucket's dollars, each line's account and whether its vault got dollars.
    function durum(uint32[] calldata z) external view returns (uint256 kova, uint256[] memory satir, bool[] memory dolu) {
        kova = IERC20S(0x3600000000000000000000000000000000000000).balanceOf(lp.launchAt(lp.launchCount() - 1).kasa);
        satir = new uint256[](z.length);
        dolu = new bool[](z.length);
        for (uint256 i = 0; i < z.length; i++) { satir[i] = defter.biriken(id, i); dolu[i] = defter.kasaDolu(id, z[i]); }
    }
}
