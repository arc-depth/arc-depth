// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PulseAcici} from "./PulseAcici.sol";

interface IERC20PL {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IPulseKayitPL {
    struct Kayit {
        address token;
        address acici;
        address kasa;
        address yonetici;
        address hedefVarlik;
        address kurucu;
        uint256 kurucuToken;
        uint256 teklif;
        uint256 vergiPpm;
        uint64 zaman;
    }

    function launchCount() external view returns (uint256);
    function launchAt(uint256 i) external view returns (Kayit memory);
}

/// @title PulseLikiditeKasasi — the 0.50% slice, turned into locked depth
///
/// WHY A NEW ONE WAS NEEDED — AND IT WAS FOUND BY MEASUREMENT
///   The previous generation's `LikiditeKasasi` is on chain, and the new
///   generation was going to treat it as shared infrastructure and use it.
///   It cannot:
///
///     launchpad.launchIdOfToken(token)   ->  DOES NOT EXIST on the new one
///     launchpad.launchAt(i)              ->  a different return shape
///
///   Measured: called with a new-generation token address, it refused with
///   `BilinmeyenToken`. So the 0.50% the hook sends there on every trade
///   would go in and NEVER COME OUT — small per trade, but accumulating
///   forever.
///
///   Nothing would have reverted. The swaps would have kept working and the
///   money would have grown in an unreachable balance; this is exactly the
///   shape this project's comments warn about again and again.
///
/// BY ID, NOT BY TOKEN
///   The old one read a mapping from token to id. The new one takes the
///   launch id directly, because the new launchpad does not keep that
///   mapping, and reading something it does not keep would make this vault
///   brittle again. The id is bounded by `launchCount()`; an invented id
///   cannot be read.
///
/// HOW MUCH GOES IS NOT DECIDED
///   Everything held goes. A partial feed would be a decision, and a
///   decision needs somebody to be trusted with it. The caller only picks
///   WHICH market gets deeper — not whether the money leaves, and not where
///   else it could go, because there is nowhere else.
contract PulseLikiditeKasasi {
    IERC20PL public immutable quote;
    IPulseKayitPL public immutable launchpad;

    event Beslendi(uint256 indexed launchId, address acici, uint256 miktar, uint128 eklenen);

    error KotuKurulum();
    error BilinmeyenLaunch();
    error BosBakiye();
    error TransferOlmadi();

    constructor(IERC20PL _quote, IPulseKayitPL _launchpad) {
        if (address(_quote) == address(0) || address(_launchpad) == address(0)) {
            revert KotuKurulum();
        }
        quote = _quote;
        launchpad = _launchpad;
    }

    function bekleyen() external view returns (uint256) {
        return quote.balanceOf(address(this));
    }

    /// Push everything held here into launch `launchId`'s pool as locked
    /// liquidity.
    ///
    /// Permissionless, and safe to be: there is nothing for a caller to
    /// choose except which of this protocol's own pools gets deeper, and
    /// every destination is a ladder whose liquidity can never be removed.
    function besle(uint256 launchId) external returns (uint128 eklenen) {
        if (launchId >= launchpad.launchCount()) revert BilinmeyenLaunch();
        IPulseKayitPL.Kayit memory k = launchpad.launchAt(launchId);
        if (k.acici == address(0)) revert BilinmeyenLaunch();

        uint256 miktar = quote.balanceOf(address(this));
        if (miktar == 0) revert BosBakiye();

        if (!quote.transfer(k.acici, miktar)) revert TransferOlmadi();
        /* `biriktir` places whichever assets the ladder holds on their own
           side of the price. Quote alone lands below it, which is exactly
           where a bid belongs: this slice buys the book a floor to lean on
           rather than more tokens to sell. */
        eklenen = PulseAcici(k.acici).biriktir();
        emit Beslendi(launchId, k.acici, miktar, eklenen);
    }
}
