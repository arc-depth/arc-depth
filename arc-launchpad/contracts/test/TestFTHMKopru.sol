// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { FTHMOFTAdapter } from "../lz/FTHMOFTAdapter.sol";
import { FTHMOFT } from "../lz/FTHMOFT.sol";
import { SendParam } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { MessagingFee } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { KopruJeton, SahteUcNokta } from "./SahteLz.sol";

/// @title TestFTHMKopru — the FTHM bridge, both chains, one call
/// @notice Runs Arc (eid 30417) and Robinhood (eid 30416) side by side
///         against two queued endpoints and measures the one invariant that
///         matters: Robinhood supply equals what is locked on Arc, through
///         a trip out, a partial trip back, dust and a forged message.
contract TestFTHMKopru {
    uint32 constant ARC = 30417;
    uint32 constant RH = 30416;

    struct Sonuc {
        uint256 kilitli1; uint256 rhArz1; uint256 rhAlici1;
        uint256 kilitli2; uint256 rhArz2; uint256 arcAlici2;
        uint256 tozGonderilen; uint256 tozKalan;
        bool sahteReddedildi;
        bool sahipYok; bool setPeerReddedildi;
        uint8 rhOndalik;
    }

    function _b(address a) private pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    function run() external returns (Sonuc memory s) {
        SahteUcNokta epArc = new SahteUcNokta(ARC);
        SahteUcNokta epRh = new SahteUcNokta(RH);

        KopruJeton fthm = new KopruJeton(1_000_000_000e18, address(this));
        FTHMOFTAdapter adapter = new FTHMOFTAdapter(address(fthm), address(epArc), address(this));
        FTHMOFT oft = new FTHMOFT(address(epRh), address(this));

        adapter.setPeer(RH, _b(address(oft)));
        oft.setPeer(ARC, _b(address(adapter)));
        s.rhOndalik = oft.decimals();

        address aliciRh = address(0xB0B);
        address aliciArc = address(0xA11CE);

        /* 1) Arc -> Robinhood: 400 FTHM */
        fthm.approve(address(adapter), type(uint256).max);
        adapter.send(SendParam(RH, _b(aliciRh), 400e18, 400e18, "", "", ""), MessagingFee(0, 0), address(this));
        epRh.teslim(epArc, epArc.sonIndeks());
        s.kilitli1 = fthm.balanceOf(address(adapter));
        s.rhArz1 = oft.totalSupply();
        s.rhAlici1 = oft.balanceOf(aliciRh);

        /* 2) Robinhood -> Arc: 150 FTHM back. The OFT sends from msg.sender,
         *    so the Robinhood holder here is this harness: mint it some first
         *    by bridging to itself. */
        adapter.send(SendParam(RH, _b(address(this)), 200e18, 200e18, "", "", ""), MessagingFee(0, 0), address(this));
        epRh.teslim(epArc, epArc.sonIndeks());
        oft.send(SendParam(ARC, _b(aliciArc), 150e18, 150e18, "", "", ""), MessagingFee(0, 0), address(this));
        epArc.teslim(epRh, epRh.sonIndeks());
        s.kilitli2 = fthm.balanceOf(address(adapter));
        s.rhArz2 = oft.totalSupply();
        s.arcAlici2 = fthm.balanceOf(aliciArc);

        /* 3) Dust: shared decimals are 6, so anything below 1e12 wei cannot
         *    cross and must stay with the sender, not vanish. */
        uint256 once = fthm.balanceOf(address(this));
        uint256 tozlu = 1e18 + 123;
        adapter.send(SendParam(RH, _b(aliciRh), tozlu, 1e18, "", "", ""), MessagingFee(0, 0), address(this));
        epRh.teslim(epArc, epArc.sonIndeks());
        s.tozGonderilen = once - fthm.balanceOf(address(this));
        s.tozKalan = tozlu - s.tozGonderilen;

        /* 4) A message from anyone but the configured peer is refused. */
        bytes memory sahteMesaj = abi.encodePacked(_b(address(0xBAD)), uint64(1_000_000e6));
        try epRh.sahteTeslim(address(oft), ARC, address(0xBAD), sahteMesaj) {
            s.sahteReddedildi = false;
        } catch {
            s.sahteReddedildi = true;
        }

        /* 5) Freeze: no owner afterwards, and the peer cannot be changed. */
        adapter.sahipligiYak();
        oft.sahipligiYak();
        s.sahipYok = adapter.owner() == address(0) && oft.owner() == address(0);
        try adapter.setPeer(RH, _b(address(0xBAD))) { s.setPeerReddedildi = false; } catch { s.setPeerReddedildi = true; }
    }
}
