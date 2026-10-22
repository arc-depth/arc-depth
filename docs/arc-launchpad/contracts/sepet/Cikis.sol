// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Message kinds of the third generation (v3): a redemption that names where
/// each line's units go. In their own file so IHaberci.sol, which every
/// deployed messenger was built from, stays byte for byte as it was.
library CikisMesaj {
    /// launchpad -> Defter: tokens were burned; one exit per basket line
    /// (abi: uint8, bytes32 token, uint256 miktar, uint32 hz, bytes32 alici, bytes32[] cikislar)
    uint8 internal constant ITFA_CIKIS = 6;
    /// Defter -> EVM Kasa: sell a holder's share, but hand each asset whose
    /// exit is named straight to that exit
    /// (abi: uint8, uint64 id, bytes32[] varliklar, uint256 miktar, uint256 arz, uint32 hz, bytes32 alici, bytes32[] cikislar)
    uint8 internal constant SAT_CIKIS = 7;
}
