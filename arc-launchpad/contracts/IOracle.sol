// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IOracle — what the vault needs to know about an asset's worth.
/// @notice Returns a VALUE, not a price.
///
/// WHY VALUE AND NOT PRICE
///   A price needs a scale, and a scale needs everybody reading it to agree
///   on the same one. This project has paid for that three times: a floor
///   that read as `1` because 1e18 was not enough for six-decimal
///   collateral over eighteen-decimal tokens; a market cap computed from a
///   1e18-scaled value that silently assumed both sides shared decimals; and
///   300,000,000 tokens placed where nobody can reach them because a shared
///   scale was assumed in a liquidity formula.
///
///   So no price crosses this interface. The caller asks "what is this much
///   of this asset worth, in quote units", and the adapter does every
///   conversion inside itself where the decimals are known.
///
/// FRESHNESS IS THE ADAPTER'S PROBLEM
///   A stale answer is worse than no answer, because it looks like one. An
///   adapter that cannot produce a fresh value MUST revert rather than
///   return an old one — the caller has no way to tell the difference and
///   no business guessing.
interface IOracle {
    /// @param varlik the asset being valued
    /// @param miktar how much of it, in the asset's own raw units
    /// @return quoteMiktari what that is worth, in the quote asset's raw units
    function deger(address varlik, uint256 miktar) external view returns (uint256 quoteMiktari);

    /// Whether this adapter can value `varlik` at all, and freshly, right
    /// now. Separate from `deger` so a registry can ask without having to
    /// catch a revert.
    function degerlenebilir(address varlik) external view returns (bool);
}
