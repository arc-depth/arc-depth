// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { FiyatAgi, DaoElcisiAg, UzakYurutucuAg } from "../lz/AgCekirdek.sol";
import { IkizOFTFabrikaAg, IkizFabrikaAg } from "../lz/IkizAg.sol";
import { ZincirTablosu } from "../lz/ZincirTablosu.sol";
import { ILayerZeroEndpointV2, MessagingFee, MessagingParams } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

interface IDelegeC { function delegates(address) external view returns (address); }

/// @title TestAgCekirdek — the price network and the DAO pair against each chain's REAL endpoint
/// @notice eth_call on each of the nine chains. Builds FiyatAgi, DaoElcisiAg
///         and UzakYurutucuAg and reads back from the real endpoint: two
///         required DVNs on every pathway, peers, dead delegate, no owner —
///         and a real price quote from FiyatAgi and DaoElcisiAg to every other
///         chain.
contract TestAgCekirdek {
    address constant OLU = 0x000000000000000000000000000000000000dEaD;

    struct Sonuc {
        uint32 eid;
        bool sahipsiz; bool delegeOlu;
        uint256 ayarli; uint256 peerli; uint256 fiyatli;
        string hata;
    }

    function _b(address a) private pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    function _ayar(address oapp, ZincirTablosu.Zincir memory b, ZincirTablosu.Zincir memory k) private view returns (bool) {
        ILayerZeroEndpointV2 ep = ILayerZeroEndpointV2(b.endpoint);
        ZincirTablosu.UlnConfig memory ug = abi.decode(ep.getConfig(oapp, b.gonderim, k.eid, 2), (ZincirTablosu.UlnConfig));
        ZincirTablosu.UlnConfig memory ua = abi.decode(ep.getConfig(oapp, b.alim, k.eid, 2), (ZincirTablosu.UlnConfig));
        return ug.confirmations == b.onay && ug.requiredDVNs.length == 2 && ug.requiredDVNs[0] == b.dvn0 && ug.requiredDVNs[1] == b.dvn1
            && ua.confirmations == k.onay && ua.requiredDVNs.length == 2 && ua.requiredDVNs[0] == b.dvn0 && ua.requiredDVNs[1] == b.dvn1;
    }

    function run() external returns (Sonuc memory fa, Sonuc memory de, Sonuc memory uy) {
        ZincirTablosu.Zincir memory b = ZincirTablosu.burasi();
        IkizOFTFabrikaAg ofab = new IkizOFTFabrikaAg();
        IkizFabrikaAg fab = new IkizFabrikaAg(ofab);
        FiyatAgi f = new FiyatAgi(address(this), fab);
        UzakYurutucuAg u = new UzakYurutucuAg(address(0xE1C1));
        DaoElcisiAg d = new DaoElcisiAg(address(this), address(u), 0, address(0));

        fa.eid = de.eid = uy.eid = b.eid;
        fa.sahipsiz = f.owner() == address(0);
        de.sahipsiz = d.owner() == address(0);
        uy.sahipsiz = u.owner() == address(0);
        fa.delegeOlu = IDelegeC(b.endpoint).delegates(address(f)) == OLU;
        de.delegeOlu = IDelegeC(b.endpoint).delegates(address(d)) == OLU;
        uy.delegeOlu = IDelegeC(b.endpoint).delegates(address(u)) == OLU;

        bytes memory sec = hex"00030100110100000000000000000000000000030d40";
        for (uint256 i; i < ZincirTablosu.ADET; i++) {
            ZincirTablosu.Zincir memory k = ZincirTablosu.sira(i);
            if (k.eid == b.eid) continue;
            if (_ayar(address(f), b, k)) fa.ayarli++;
            if (_ayar(address(d), b, k)) de.ayarli++;
            if (_ayar(address(u), b, k)) uy.ayarli++;
            if (f.peers(k.eid) == _b(address(f))) fa.peerli++;
            if (d.peers(k.eid) == _b(address(u))) de.peerli++;
            if (k.eid == 30417 ? u.peers(k.eid) == _b(address(0xE1C1)) : u.peers(k.eid) == bytes32(0)) uy.peerli++;
            /* FiyatAgi's message for a quote: the same shape gonder sends */
            bytes memory m = abi.encode(address(1), "Name", "SYM", address(2), uint160(1 << 96), uint8(6), uint64(1), b.eid);
            try ILayerZeroEndpointV2(b.endpoint).quote(
                _p(k.eid, address(f), m, sec), address(f)) returns (MessagingFee memory q) { if (q.nativeFee > 0) fa.fiyatli++; }
            catch { fa.hata = string.concat(fa.hata, " fiyat:", _s(k.eid)); }
            try d.ucret(k.eid, address(3), hex"1234", sec) returns (MessagingFee memory q) { if (q.nativeFee > 0) de.fiyatli++; }
            catch { de.hata = string.concat(de.hata, " dao:", _s(k.eid)); }
        }
    }

    function _p(uint32 eid, address alici, bytes memory m, bytes memory sec)
        private pure returns (MessagingParams memory)
    {
        return MessagingParams(eid, bytes32(uint256(uint160(alici))), m, sec, false);
    }

    function _s(uint32 x) private pure returns (string memory r) {
        if (x == 0) return "0";
        bytes memory t = new bytes(10); uint256 n;
        while (x > 0) { t[n++] = bytes1(uint8(48 + x % 10)); x /= 10; }
        r = new string(n); bytes memory rb = bytes(r);
        for (uint256 i; i < n; i++) rb[i] = t[n - 1 - i];
    }
}

