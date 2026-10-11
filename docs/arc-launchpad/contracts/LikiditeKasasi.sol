// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TekYonluAcici, IERC20T} from "./TekYonluAcici.sol";

interface ILaunchKayit {
    function launchIdOfToken(address token) external view returns (uint256);
    function launchAt(uint256 i)
        external
        view
        returns (address token, address egri, address acici, address rewards, address kurucu, uint64 zaman);
}

/// @title LikiditeKasasi — the 0.50% slice, turned into depth automatically.
/// @notice Holds the protocol's liquidity share and can do exactly one thing
///         with it: push it into a launch's pool as locked liquidity.
///
/// WHY A CONTRACT AND NOT A WALLET
///   The fee table sends 0.50% of every trade here, and the point of that
///   slice is to make the markets deeper. Measured earlier in this project:
///   a $3,500 opening market cap means a $1,000 buy moves the price 64%,
///   and the ONLY thing that changes is more money in the pool. Raising the
///   opening cap would flatten the curve but kill the reason to be early,
///   so depth has to come from somewhere else — and this slice is that
///   somewhere.
///
///   Sent to an ordinary wallet instead, it would sit there. Money that
///   needs a person to remember to move it is money that does not compound,
///   and a wallet with the funds in it is also a wallet that can spend them
///   on something else. So there is no withdraw here, for anybody, ever.
///
/// ANYONE MAY CALL `besle`
///   It takes a token address and nothing else, so there is nothing for a
///   caller to choose and no reason to restrict them. Everything it places
///   is locked by the ladder and by the hook, exactly like the launch's own
///   liquidity. A caller spends their gas to make somebody else's market
///   deeper, which is a transaction worth leaving open.
///
/// WHAT IT CANNOT DO
///   No owner, no setter, no withdraw, no approve. It cannot move the quote
///   asset anywhere except into the ladder of a launch its registry knows,
///   and the ladder has no withdraw either.
contract LikiditeKasasi {
    IERC20T public immutable quote;
    ILaunchKayit public immutable launchpad;

    event Beslendi(address indexed token, address indexed acici, uint256 miktar, uint128 eklenenLikidite);

    error KotuKurulum();
    error BilinmeyenToken();
    error BosBakiye();
    error TransferOlmadi();

    constructor(IERC20T _quote, ILaunchKayit _launchpad) {
        if (address(_quote) == address(0) || address(_launchpad) == address(0)) revert KotuKurulum();
        quote = _quote;
        launchpad = _launchpad;
    }

    /// How much is waiting to be put to work.
    function bekleyen() external view returns (uint256) {
        return quote.balanceOf(address(this));
    }

    /// Push everything held here into `token`'s pool as locked liquidity.
    ///
    /// The whole balance goes, not a chosen amount: a partial feed would be
    /// a decision, and a decision needs somebody trusted to make it. The
    /// quote asset is shared across launches, so whoever calls this decides
    /// WHICH market gets deeper — but not whether the money leaves, and not
    /// where else it could go, because there is nowhere else.
    function besle(address token) external returns (uint128 eklenen) {
        uint256 id = launchpad.launchIdOfToken(token);
        if (id == 0) revert BilinmeyenToken();
        (, , address acici, , , ) = launchpad.launchAt(id - 1);
        if (acici == address(0)) revert BilinmeyenToken();

        uint256 miktar = quote.balanceOf(address(this));
        if (miktar == 0) revert BosBakiye();

        if (!quote.transfer(acici, miktar)) revert TransferOlmadi();
        /* `biriktir` places whichever assets the ladder holds on their own
           side of the price. Quote alone lands below it, which is exactly
           where a bid belongs: this slice buys the book a floor to lean on
           rather than more tokens to sell. */
        eklenen = TekYonluAcici(acici).biriktir();
        emit Beslendi(token, acici, miktar, eklenen);
    }
}
