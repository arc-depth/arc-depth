// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title FTHMOFT — the Robinhood Chain end of the FTHM bridge
/// @notice Starts with zero supply. FTHM exists here only because the same
///         amount was locked in FTHMOFTAdapter on Arc, and it is burned when
///         it goes back. There is no mint function other than the bridge
///         receive path, and that path only accepts messages from the peer
///         set at wiring time.
///
/// @dev Same ownership rule as the adapter: configured, then frozen with
///      `sahipligiYak`.
contract FTHMOFT is OFT {
    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    event SahiplikYakildi();

    constructor(address lzEndpoint, address kurulumcu)
        OFT("Fathom", "FTHM", lzEndpoint, kurulumcu)
        Ownable(kurulumcu)
    {}

    /// @notice Irreversibly freezes the bridge configuration.
    function sahipligiYak() external onlyOwner {
        endpoint.setDelegate(DEAD);
        renounceOwnership();
        emit SahiplikYakildi();
    }
}
