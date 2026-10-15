// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title FTHMOFTAdapter — the Arc end of the FTHM bridge
/// @notice FTHM on Arc is a fixed 1,000,000,000 supply with no mint, so it
///         cannot be burned here and minted there. It is locked in this
///         contract instead, and the Robinhood Chain side mints exactly what
///         is locked. The invariant the whole design rests on:
///
///             FTHMOFT.totalSupply() on Robinhood == FTHM.balanceOf(this) on Arc
///
///         so the two chains together always hold 1,000,000,000 FTHM.
///
/// @dev LayerZero needs an owner while the bridge is being wired: peers,
///      DVNs and executor are set through it. `sahipligiYak` ends that in one
///      call — the endpoint delegate goes to 0xdead and ownership to zero —
///      after which nothing about the bridge can be changed by anyone,
///      including us. That is the project's rule (no owner, no setter) and
///      it is also the cost: a retired DVN cannot be swapped out later.
contract FTHMOFTAdapter is OFTAdapter {
    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    event SahiplikYakildi();

    constructor(address fthm, address lzEndpoint, address kurulumcu)
        OFTAdapter(fthm, lzEndpoint, kurulumcu)
        Ownable(kurulumcu)
    {}

    /// @notice Irreversibly freezes the bridge configuration.
    function sahipligiYak() external onlyOwner {
        endpoint.setDelegate(DEAD);
        renounceOwnership();
        emit SahiplikYakildi();
    }
}
