// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IHaberci — one chain's door to the others
///
/// A message, optionally carrying dollars, to a contract on another chain.
/// Production: LayerZero carries the message, CCTP (or relay.link where
/// Circle does not mint) carries the dollars, and the local Haberci hands
/// both over in one call. Tests: one EVM stands in for every chain and a
/// queue stands in for the bridges.
///
/// The receiver trusts the Haberci for exactly two facts: which chain and
/// which address the message came from. Everything else it checks itself.
///
/// Addresses are 32 bytes everywhere in this system: Sui, Aptos and Solana
/// addresses do not fit a Solidity address. An EVM contract turns a 32-byte
/// address into its own with `Adres.evm`, which refuses one whose top 12
/// bytes are not zero rather than silently cutting it to a different address.
interface IHaberci {
    /// The chain this Haberci lives on (an internal id, not an EVM chainid).
    function zincir() external view returns (uint32);

    /// Send `veri` to `hedef` on chain `hedefZincir`, with `usdc` dollars the
    /// caller has approved to this Haberci. `veri` empty means "just pay
    /// `hedef` the dollars".
    function gonder(uint32 hedefZincir, bytes32 hedef, bytes calldata veri, uint256 usdc) external;
}

/// Implemented by every contract that receives messages. Called only by
/// its own chain's Haberci, after the dollars (if any) have been paid to it.
interface IHaberAlici {
    function haberAl(uint32 kaynakZincir, bytes32 kaynak, bytes calldata veri, uint256 usdc) external;
}

interface IERC20S {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address from, address to, uint256 v) external returns (bool);
    function approve(address s, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

library Adres {
    error EvmDegil(bytes32 b);

    function b32(address a) internal pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    function evm(bytes32 b) internal pure returns (address) {
        if (uint256(b) >> 160 != 0) revert EvmDegil(b);
        return address(uint160(uint256(b)));
    }
}

/// Message kinds, shared by every contract in the basket system.
library SepetMesaj {
    uint8 internal constant KAYIT = 1;   // launchpad -> Defter: a new launch and its basket
    uint8 internal constant AL = 2;      // Defter -> Kasa: buy this asset with these dollars
    uint8 internal constant SAT = 3;     // Defter -> Kasa: sell a holder's share, pay it there
    uint8 internal constant ITFA = 4;    // launchpad -> Defter: tokens were burned for redemption
    uint8 internal constant VERGI = 5;   // launchpad -> Defter: trading tax, in dollars
}
