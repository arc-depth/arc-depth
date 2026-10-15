// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title KapaliKayit — the asset registry for a chain with no CCTP
/// @notice On Arc the vault can send collateral to a remote vault on
///         Ethereum or Base over CCTP, and CrossChainAssetRegistry says
///         where. Robinhood Chain has no CCTP (Circle lists no domain for
///         it), so a vault there has nowhere to send to. This answers every
///         registry question with "no": `destekliMi` is false, so the
///         vault's send path stops at its first check, and there is no
///         remote vault to name.
///
///         Redemption and buyback do not touch the registry and work
///         exactly as on Arc. What is closed is only the cross-chain
///         conversion path, and it is closed in code rather than by an
///         empty list that someone might later fill.
///
/// @dev Same call surface the vault and its manager use:
///      destekliMi, uzakKasaBytes32, dogruKasaMiBytes32.
contract KapaliKayit {
    error ZincirYok(uint32 cctpDomain);

    function destekliMi(uint32) external pure returns (bool) {
        return false;
    }

    function uzakKasaBytes32(uint32 cctpDomain, uint256) external pure returns (bytes32) {
        revert ZincirYok(cctpDomain);
    }

    function dogruKasaMiBytes32(uint32, uint256, bytes32) external pure returns (bool) {
        return false;
    }
}
