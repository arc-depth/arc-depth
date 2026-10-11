// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

interface IERC20H {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address spender, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface ISwapRouterH {
    function swap(PoolKey calldata key, bool zeroForOne, uint256 amountIn, uint256 minOut)
        external
        payable
        returns (uint256 out);
}

/// @title Hazine
/// @notice Where the protocol's and the developers' share of a trading fee
///         accumulates when it arrives as a token rather than as money, and
///         the only place either can be turned back into money.
///
/// WHY IT EXISTS
///   Uniswap v4 charges the fee on whichever side of a swap the trader did
///   not fix, so a purchase pays in the launched token and a sale pays in
///   USDC. The sale side is already money. The purchase side used to be
///   burned in full, which was tidy and meant the protocol earned nothing
///   from the half of all volume that is people buying.
///
///   Now the holders' slice is still burned — that is the floor, and it is
///   the promise this product is built on — and the other two slices come
///   here instead. They are assets, not income, until somebody sells them,
///   and selling them is a decision rather than a reflex.
///
/// WHAT IT CANNOT DO
///   Nothing leaves except through the governor, which is the timelocked
///   vote: five days of voting, two days of delay, and then anyone may
///   execute. There is no owner, no sweep, no upgrade and no emergency
///   path. An address that could move these assets without a vote would
///   make the word "treasury" decorative.
///
///   The practical consequence is worth stating plainly: until enough ALP
///   is staked for a vote to reach quorum, nothing can leave this contract
///   at all. Assets accumulate and wait. That is the intended behaviour of
///   something described as locked, and it is exactly why the holders'
///   slice is burned instead of kept here — a floor that depends on a
///   future vote is not a floor.
///
/// SELLING
///   `sat` swaps a held token for the quote currency through the router
///   this contract was deployed against, which is fixed. The pool, the size
///   and the worst acceptable price are all named in the proposal, so what
///   the vote approves is one trade rather than permission to trade.
contract Hazine {
    /// The timelocked vote. Immutable: a treasury whose controller can be
    /// repointed is a treasury with an owner.
    address public immutable governor;

    /// What selling is allowed to produce. Held so a proposal cannot
    /// quietly swap one asset for another of its choosing.
    address public immutable quote;

    /// Fixed for the same reason. A proposal naming a router of its own
    /// making would gain nothing — `gonder` can already move anything —
    /// but a call that looks like theft is worth making impossible rather
    /// than merely pointless.
    ISwapRouterH public immutable router;

    event Satildi(address indexed token, uint256 verilen, uint256 alinan);
    event Gonderildi(address indexed token, address indexed to, uint256 miktar);

    error OnlyGovernor();
    error TransferFailed();
    error WrongQuote();

    modifier yalnizYonetisim() {
        if (msg.sender != governor) revert OnlyGovernor();
        _;
    }

    constructor(address _governor, address _quote, ISwapRouterH _router) {
        governor = _governor;
        quote = _quote;
        router = _router;
    }

    /// Sell a held token for the quote currency, at a price the proposal
    /// had to state.
    ///
    /// `enAz` is not optional in practice: zero is a vote to accept any
    /// price at all, and the pools these assets come from are thin by
    /// construction. It is left to the proposal rather than enforced here,
    /// because the right floor depends on which pool is being traded and
    /// only the proposal knows that.
    function sat(PoolKey calldata key, bool zeroForOne, uint256 miktar, uint256 enAz)
        external
        yalnizYonetisim
        returns (uint256 alinan)
    {
        address veriliyor = Currency.unwrap(zeroForOne ? key.currency0 : key.currency1);
        address aliniyor = Currency.unwrap(zeroForOne ? key.currency1 : key.currency0);

        /* The direction has to be checked, not trusted. A proposal with
           `zeroForOne` the wrong way round would sell the treasury's USDC
           for more of the token it is trying to get rid of, and the vote
           that approved it would have read as a sale. */
        if (aliniyor != quote) revert WrongQuote();

        if (!IERC20H(veriliyor).approve(address(router), miktar)) revert TransferFailed();
        alinan = router.swap(key, zeroForOne, miktar, enAz);
        /* No standing allowance is left behind: the router is trusted for
           the length of one call, not permanently. */
        IERC20H(veriliyor).approve(address(router), 0);

        emit Satildi(veriliyor, miktar, alinan);
    }

    /// Move an asset out. The one exit, and it is the vote.
    function gonder(address token, address to, uint256 miktar) external yalnizYonetisim {
        if (!IERC20H(token).transfer(to, miktar)) revert TransferFailed();
        emit Gonderildi(token, to, miktar);
    }

    function bakiye(address token) external view returns (uint256) {
        return IERC20H(token).balanceOf(address(this));
    }
}
