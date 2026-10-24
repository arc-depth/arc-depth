// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IBurnable {
    function totalSupply() external view returns (uint256);
    function burnFrom(address from, uint256 value) external;
}

/// @title CollateralVault
/// @notice Holds a launch's collateral. Has no key.
///
/// THE ONE RULE
///   Collateral leaves only by burning tokens, and only in proportion:
///
///       payout = collateral * amount / totalSupply
///
///   Because the burn reduces supply and the payout reduces collateral by the
///   same proportion, the ratio is unchanged for everyone who stayed. A holder
///   leaving does not move the floor. That is the whole mechanism, and it is
///   two lines of arithmetic rather than a policy anybody has to honour.
///
/// WHAT IS NOT HERE, ON PURPOSE
///   No owner. No admin. No pause. No upgrade. No rescue function, no sweep,
///   no "emergency withdraw", no recipient parameter anywhere. There is
///   exactly one path out of this contract and it costs tokens.
///
///   A rescue function is the usual way a vault like this gets emptied — it
///   is written for honest reasons and then used, or stolen, for dishonest
///   ones. Leaving it out means a mistake can strand value here permanently.
///   That is a real cost and it is the right trade: a vault that someone can
///   empty is not collateral, it is a promise.
///
/// WHY THE FLOOR HOLDS IN THE MARKET
///   The pool price cannot stay below collateral-per-token, because anyone can
///   buy there and redeem here for more. Nobody has to defend the floor; it
///   pays to defend it. Redemption is deliberately free of any fee, so that
///   arbitrage is not blunted — a fee on the exit would let the price sit
///   below the floor by the size of the fee.
contract CollateralVault {
    IERC20 public immutable collateral;
    IBurnable public immutable token;

    event Redeemed(address indexed who, uint256 tokensBurned, uint256 collateralPaid);
    event Funded(address indexed from, uint256 amount);

    error NothingToRedeem();
    error NoSupply();
    error PayoutIsZero();
    error TransferFailed();

    constructor(IERC20 _collateral, IBurnable _token) {
        collateral = _collateral;
        token = _token;
    }

    /// Collateral currently backing the supply.
    function backing() public view returns (uint256) {
        return collateral.balanceOf(address(this));
    }

    /// Collateral per token, scaled by 1e36. This is the floor price.
    ///
    /// The scale was 1e18 and that was not enough. With six-decimal
    /// collateral against a billion eighteen-decimal tokens the division
    /// truncated to almost nothing: $1,500 behind 1e27 raw tokens came out
    /// as 1500e6 * 1e18 / 1e27 = 1, so the floor read as 1 and a burn
    /// could not move it. The number was not slightly imprecise, it had
    /// lost every digit it was supposed to carry.
    ///
    /// redeem() was never affected — it is a pure ratio of backing to
    /// supply and carries no scale — so nobody was ever paid the wrong
    /// amount. What was broken was the number used to SHOW the floor and
    /// to check it had not fallen, which is how a test caught it rather
    /// than a user.
    ///
    /// 1e36 holds both ends: 18-decimal collateral stays exact and
    /// 6-decimal collateral keeps eighteen significant digits. Anything
    /// reading this must divide by 1e36, not 1e18.
    uint256 public constant FLOOR_SCALE = 1e36;

    function floorPrice() external view returns (uint256) {
        uint256 supply = token.totalSupply();
        if (supply == 0) return 0;
        return (backing() * FLOOR_SCALE) / supply;
    }

    /// Burn `amount` tokens, receive the matching share of collateral.
    ///
    /// The caller must have approved this vault on the token first. The burn
    /// happens before the payout, so a token that tried to re-enter during
    /// its own burn would find the supply already reduced and the payout
    /// already computed.
    function redeem(uint256 amount) external returns (uint256 payout) {
        if (amount == 0) revert NothingToRedeem();

        uint256 supply = token.totalSupply();
        if (supply == 0) revert NoSupply();

        payout = (backing() * amount) / supply;
        if (payout == 0) revert PayoutIsZero();

        token.burnFrom(msg.sender, amount);
        if (!collateral.transfer(msg.sender, payout)) revert TransferFailed();

        emit Redeemed(msg.sender, amount, payout);
    }

    /// Anyone may add collateral. This only raises the floor for every holder,
    /// so it needs no permission — and the fee split sends a share of every
    /// swap back through here.
    function fund(uint256 amount) external {
        if (!collateral.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Funded(msg.sender, amount);
    }
}
