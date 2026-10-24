// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20LK5 {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// PulseLaunchpad5's register entry, field for field (contracts/sepet/PulseLaunchpad5.sol, `Kayit`).
interface IPulseKayitLK5 {
    struct Kayit {
        address token;
        address acici;
        address kasa;
        uint256 teminat;
        address kurucu;
        uint256 kurucuToken;
        uint256 teklif;
        uint256 vergiPpm;
        uint64 zaman;
    }

    function launchCount() external view returns (uint256);
    function launchAt(uint256 i) external view returns (Kayit memory);
}

interface IAciciLK5 {
    function biriktir() external returns (uint128 eklenen);
}

/// @title PulseLikiditeKasasi5 — the 0.50% slice (and half the launch fee),
/// turned into locked depth of a PulseLaunchpad5 pool
///
/// WHY IT REPLACES PulseLikiditeKasasi (found 24 Oct 2026, by simulation)
///   The v4/v5/v6 sets deployed PulseLikiditeKasasi, written for an earlier
///   launchpad whose register entry had ten fields (yonetici, hedefVarlik).
///   PulseLaunchpad5's entry has nine (teminat in their place). `besle`
///   decodes `launchAt` with the old shape, the decoding reverts, and so
///   every `besle` reverted: the slice could go in and never come out —
///   the very failure that contract's own comment warns about. This one
///   reads the entry in PulseLaunchpad5's shape, and a test feeds a live
///   launch through it (scripts/denetim-v7-bakim.js).
///
/// Everything held goes to the pool the caller names (one of this
/// launchpad's own), placed below the price as a bid by the pool's opener;
/// nothing else can move it. No owner. The v7 gate calls it after trades.
contract PulseLikiditeKasasi5 {
    IERC20LK5 public immutable quote;
    IPulseKayitLK5 public immutable launchpad;

    event Beslendi(uint256 indexed launchId, address acici, uint256 miktar, uint128 eklenen);

    error KotuKurulum();
    error BilinmeyenLaunch();
    error BosBakiye();
    error TransferOlmadi();

    constructor(IERC20LK5 _quote, IPulseKayitLK5 _launchpad) {
        if (address(_quote) == address(0) || address(_launchpad) == address(0)) revert KotuKurulum();
        quote = _quote;
        launchpad = _launchpad;
    }

    function bekleyen() external view returns (uint256) {
        return quote.balanceOf(address(this));
    }

    /// Push everything held here into launch `launchId`'s pool (index of
    /// `launchAt`) as locked liquidity. Permissionless: a caller only picks
    /// which of this launchpad's pools gets deeper.
    function besle(uint256 launchId) external returns (uint128 eklenen) {
        if (launchId >= launchpad.launchCount()) revert BilinmeyenLaunch();
        address acici = launchpad.launchAt(launchId).acici;
        if (acici == address(0)) revert BilinmeyenLaunch();
        uint256 miktar = quote.balanceOf(address(this));
        if (miktar == 0) revert BosBakiye();
        if (!quote.transfer(acici, miktar)) revert TransferOlmadi();
        eklenen = IAciciLK5(acici).biriktir();
        emit Beslendi(launchId, acici, miktar, eklenen);
    }
}
