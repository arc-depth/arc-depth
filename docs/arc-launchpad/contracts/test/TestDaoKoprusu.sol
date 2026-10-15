// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { DaoElcisi, UzakYurutucu } from "../lz/DaoKoprusu.sol";
import { GelistiriciFonu, IERC20G } from "../GelistiriciFonu.sol";
import { KopruJeton, SahteUcNokta } from "./SahteLz.sol";

/// @title TestDaoKoprusu — an Arc DAO decision moving Robinhood revenue
/// @notice This harness plays the Arc Governor (it is the elci's `dao`).
///         KopruJeton stands in for USDG. The Robinhood GelistiriciFonu is
///         the unchanged contract deployed on Arc.
contract TestDaoKoprusu {
    uint32 constant ARC = 30417;
    uint32 constant RH = 30416;

    struct Sonuc {
        bool yabanciGonderemedi;
        uint256 devBakiye; uint256 dagitilmamis;
        bool dogrudanTahsisReddedildi;
        bool sahteGonderenReddedildi;
        bool fazlaTahsisTeslimiDustu; uint256 fazlaSonrasiBakiye;
        uint256 devTalep;
        bool sahipYok;
    }

    function _b(address a) private pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    function run() external returns (Sonuc memory s) {
        SahteUcNokta epArc = new SahteUcNokta(ARC);
        SahteUcNokta epRh = new SahteUcNokta(RH);
        DaoElcisi elci = new DaoElcisi(address(epArc), address(this), address(this), RH);
        UzakYurutucu yur = new UzakYurutucu(address(epRh), address(this));
        elci.setPeer(RH, _b(address(yur)));
        yur.setPeer(ARC, _b(address(elci)));

        KopruJeton usdg = new KopruJeton(1_000_000e6, address(this));
        GelistiriciFonu fon = new GelistiriciFonu(IERC20G(address(usdg)), address(yur));
        usdg.transfer(address(fon), 1000e6);       // Robinhood fee income arriving
        address dev = address(0xDE7);

        /* 1) Only the DAO may speak. */
        Yabanci y = new Yabanci();
        s.yabanciGonderemedi = !y.dene(elci, address(fon));

        /* 2) A voted grant of 300 USDG on Robinhood. */
        elci.gonder(address(fon), abi.encodeCall(GelistiriciFonu.tahsis, (dev, 300e6)), "");
        epRh.teslim(epArc, epArc.sonIndeks());
        s.devBakiye = fon.bakiye(dev);
        s.dagitilmamis = fon.dagitilmamis();

        /* 3) Nobody can grant directly, not even the harness. */
        try fon.tahsis(dev, 1e6) { s.dogrudanTahsisReddedildi = false; } catch { s.dogrudanTahsisReddedildi = true; }

        /* 4) A message from anyone but the elci is refused. */
        try epRh.sahteTeslim(address(yur), ARC, address(0xBAD),
            abi.encode(address(fon), abi.encodeCall(GelistiriciFonu.tahsis, (address(0xBAD), 700e6))))
        { s.sahteGonderenReddedildi = false; } catch { s.sahteGonderenReddedildi = true; }

        /* 5) A grant beyond the free balance fails at delivery — retryable,
              nothing half-done. */
        elci.gonder(address(fon), abi.encodeCall(GelistiriciFonu.tahsis, (dev, 5000e6)), "");
        try epRh.teslim(epArc, epArc.sonIndeks()) { s.fazlaTahsisTeslimiDustu = false; }
        catch { s.fazlaTahsisTeslimiDustu = true; }
        s.fazlaSonrasiBakiye = fon.bakiye(dev);

        /* 6) The developer withdraws on Robinhood themselves. */
        Gelistirici g = new Gelistirici();
        elci.gonder(address(fon), abi.encodeCall(GelistiriciFonu.tahsis, (address(g), 100e6)), "");
        epRh.teslim(epArc, epArc.sonIndeks());
        s.devTalep = g.al(fon);

        /* 7) Frozen. */
        elci.sahipligiYak();
        yur.sahipligiYak();
        s.sahipYok = elci.owner() == address(0) && yur.owner() == address(0);
    }
}

contract Yabanci {
    function dene(DaoElcisi e, address fon) external returns (bool) {
        try e.gonder(fon, "", "") { return true; } catch { return false; }
    }
}

contract Gelistirici {
    function al(GelistiriciFonu f) external returns (uint256) { return f.talep(); }
}
