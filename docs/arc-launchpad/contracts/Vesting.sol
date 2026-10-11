// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20V {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title Vesting
/// @notice The 5% that unlocks over twelve months, one twelfth at a time.
///
/// WHY MONTHLY STEPS RATHER THAN PER-SECOND
///   A per-second stream looks smoother and is worse here. The point of this
///   slice is to be visible: anyone watching should be able to say "one
///   twelfth became available today" without integrating a curve. Twelve
///   discrete steps are also twelve things that can be checked against the
///   schedule, rather than one number nobody verifies.
///
/// NO CLIFF, NO REVOCATION, NO OWNER
///   There is no function to cancel this, change the beneficiary or claw
///   anything back. A revocable vest is not a vest; it is a promise with a
///   switch, and the switch is the thing everyone ends up arguing about.
///
/// IF NOBODY CLAIMS, NOTHING HAPPENS
///   Unclaimed months accumulate. There is no expiry and no forfeiture —
///   this is an allocation, not a reward for attention.
contract Vesting {
    uint256 public constant MONTHS = 12;
    uint256 public constant MONTH = 30 days;

    IERC20V public immutable token;
    address public immutable beneficiary;
    uint256 public immutable start;
    uint256 public immutable total;

    uint256 public claimed;

    event Claimed(uint256 amount, uint256 monthsUnlocked);

    error NothingDue();
    error TransferFailed();

    /// `_start` of zero means now. It is a parameter for the same reason the
    /// staking schedule takes one: twelve months cannot be exercised in a
    /// test otherwise, and an untested release schedule is a guess.
    constructor(IERC20V _token, address _beneficiary, uint256 _total, uint256 _start) {
        token = _token;
        beneficiary = _beneficiary;
        total = _total;
        start = _start == 0 ? block.timestamp : _start;
    }

    /// Whole months elapsed, capped at twelve.
    function monthsUnlocked() public view returns (uint256) {
        uint256 m = (block.timestamp - start) / MONTH;
        return m > MONTHS ? MONTHS : m;
    }

    /// Total released so far by the schedule, claimed or not.
    function unlocked() public view returns (uint256) {
        return (total * monthsUnlocked()) / MONTHS;
    }

    function claimable() public view returns (uint256) {
        uint256 u = unlocked();
        return u > claimed ? u - claimed : 0;
    }

    /// Permissionless: anyone may trigger it, but the tokens can only go to
    /// the beneficiary fixed at construction. There is no recipient argument
    /// to point somewhere else.
    function claim() external returns (uint256 amount) {
        amount = claimable();
        if (amount == 0) revert NothingDue();
        claimed += amount;
        if (!token.transfer(beneficiary, amount)) revert TransferFailed();
        emit Claimed(amount, monthsUnlocked());
    }
}
