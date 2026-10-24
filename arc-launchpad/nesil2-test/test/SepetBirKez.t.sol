// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IHaberci, IERC20S, Adres} from "../src/arc/sepet/IHaberci.sol";
import {SepetDefteri} from "../src/arc/sepet/SepetDefteri.sol";
import {HaberciCctp} from "../src/arc/sepet/HaberciCctp.sol";
import {AdaKapisi, ILzUcNokta, IAdaHaberci} from "../src/arc/sepet/AdaKapisi.sol";
import {IMesajTasiyiciV2, ITokenMesajciV2} from "../src/arc/nesil2/CctpMesaj.sol";
import {Jeton} from "./SepetYardim.sol";

contract BosUcNokta { function setDelegate(address) external {} }

/// Bindings are written once and never changed: before the lock new chains
/// can still be added (Ethereum and Solana go live after the launch), but a
/// chain already bound can never be pointed elsewhere.
contract SepetBirKezTest is Test {
    function test_defter_zinciri_bir_kez_baglar() public {
        Jeton usdc = new Jeton("USDC");
        SepetDefteri d = new SepetDefteri(IHaberci(address(0x1)), IERC20S(address(usdc)));
        d.bagla(6, bytes32(uint256(1)), bytes32(uint256(2)));
        vm.expectRevert(SepetDefteri.ZatenBagli.selector);
        d.bagla(6, bytes32(uint256(1)), bytes32(uint256(3)));
        d.bagla(0, bytes32(uint256(4)), bytes32(uint256(5)));   // a new chain: still allowed
        vm.expectRevert(SepetDefteri.KotuMesaj.selector);
        d.bagla(5, bytes32(uint256(4)), bytes32(0));
        d.kilitle();
        vm.expectRevert(SepetDefteri.SadeceKurucu.selector);
        d.bagla(5, bytes32(uint256(6)), bytes32(uint256(7)));
        assertEq(d.kasa(6), bytes32(uint256(2)), "Base kasasi degismedi");
    }

    function test_haberci_ikizi_bir_kez_ve_cctp_ada_olamaz() public {
        HaberciCctp h = new HaberciCctp(IERC20S(address(new Jeton("USDC"))), IMesajTasiyiciV2(address(0)), ITokenMesajciV2(address(0)), 26);
        h.ikizEkle(6, bytes32(uint256(0xB)));
        vm.expectRevert(HaberciCctp.ZatenBagli.selector);
        h.ikizEkle(6, bytes32(uint256(0xC)));
        vm.expectRevert(HaberciCctp.ZatenBagli.selector);
        h.adaYap(6);                                  // a CCTP chain stays CCTP
        h.adaYap(17);
        vm.expectRevert(HaberciCctp.ZatenBagli.selector);
        h.ikizEkle(17, bytes32(uint256(0xD)));        // an island gets no CCTP twin
        vm.expectRevert(HaberciCctp.ZatenBagli.selector);
        h.ikizEkle(3, bytes32(0));
        assertEq(h.ikiz(6), bytes32(uint256(0xB)));
    }

    function test_ada_kapisi_ikizi_bir_kez() public {
        AdaKapisi k = new AdaKapisi(ILzUcNokta(address(new BosUcNokta())), IAdaHaberci(address(0x1)), IERC20S(address(0x2)));
        k.ikizEkle(17, 30102, bytes32(uint256(0xA)));
        vm.expectRevert(AdaKapisi.ZatenBagli.selector);
        k.ikizEkle(17, 30102, bytes32(uint256(0xB)));
        vm.expectRevert(AdaKapisi.ZatenBagli.selector);
        k.ikizEkle(0, 30102, bytes32(uint256(0xB)));   // the same eid for another chain
        k.ikizEkle(0, 30101, bytes32(uint256(0xC)));   // Ethereum, chain 0
        vm.expectRevert(AdaKapisi.ZatenBagli.selector);
        k.ikizEkle(0, 30109, bytes32(uint256(0xD)));
        assertEq(k.ikiz(17), bytes32(uint256(0xA)));
        assertEq(k.ikiz(0), bytes32(uint256(0xC)));
    }
}
