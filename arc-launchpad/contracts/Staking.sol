// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IToken {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title Staking
/// @notice Holds the 60% emission and pays it to whoever is staked.
///
/// THE CURVE, AND HOW IT BECAME A RULE
///   The requirement was "spread over thirty years, but 90% of it out in the
///   first ten". That is a decaying curve, and the decay constant it implies
///   is k = 0.229 per year — a three-year half-life.
///
///   A contract cannot evaluate e^(-kt) cheaply, and it does not need to.
///   Continuous decay is the same thing as releasing a fixed FRACTION of what
///   remains, every period. At one week per period that fraction is
///   1 - e^(-k/52) = 0.44007%, i.e. 4401 parts per million of the remainder.
///
///   Checked against the requirement: 20.50% out after one year, 49.75% after
///   three, 89.91% after ten, 99.90% after thirty. The ten-year figure is the
///   constraint and it lands on it.
///
///   Because each release is a fraction of what is LEFT, the pool can never
///   be overdrawn and the schedule needs no end date — it approaches zero
///   instead of stopping at a cliff.
///
/// WHY STAKING RATHER THAN HOLDING
///   Emission to holders rewards doing nothing and inflates the float. Paying
///   stakers ties the supply up: to receive the emission you must lock the
///   token, which removes it from circulation. The first year's 20.5% would
///   otherwise land straight on the market.
///
/// PULL, NOT PUSH
///   Same accumulator as the holder rewards: a per-token index grows as the
///   emission unlocks, and each staker withdraws their slice. Cost does not
///   grow with the number of stakers.
contract Staking {
    uint256 public constant PERIOD = 7 days;
    /// Fraction of the REMAINING emission released each period, in ppm.
    uint256 public constant RELEASE_PPM = 4401;
    uint256 private constant SCALE = 1e18;

    IToken public immutable token;
    uint256 public immutable startTime;

    uint256 public emissionLeft;     // not yet released
    uint256 public released;         // released into the accumulator
    uint256 public totalStaked;
    uint256 public accPerShare;
    uint256 public lastPeriod;       // periods already processed

    mapping(address => uint256) public stakedOf;
    mapping(address => uint256) public marker;
    mapping(address => uint256) public claimedOf;

    event Staked(address indexed who, uint256 amount);
    event Unstaked(address indexed who, uint256 amount);
    event Claimed(address indexed who, uint256 amount);
    event Released(uint256 amount, uint256 periods, uint256 remaining);

    error NothingStaked();
    error NotEnoughStaked();
    error ZeroAmount();
    error TransferFailed();

    /// `emission` is the balance this contract is expected to hold. It is
    /// recorded rather than read so that tokens sent here later by mistake
    /// are not swept into the schedule.
    /// `start` of zero means "now". It is a parameter so the schedule can
    /// be exercised across decades in a test without waiting decades; a
    /// hard-coded block.timestamp would have made the curve untestable,
    /// and an untested thirty-year schedule is a thirty-year guess.
    constructor(IToken _token, uint256 emission, uint256 start) {
        token = _token;
        emissionLeft = emission;
        startTime = start == 0 ? block.timestamp : start;
    }

    /// Periods elapsed since launch.
    function periodsElapsed() public view returns (uint256) {
        return (block.timestamp - startTime) / PERIOD;
    }

    /// Releases every period that has passed since the last call. Anyone may
    /// call it; it only moves tokens from "locked" to "claimable".
    ///
    /// Applying n periods at once is not the same as n times the single
    /// period amount — each release shrinks the base for the next — so they
    /// are applied one at a time. The loop is bounded by MAX_CATCHUP so that
    /// a contract left alone for years cannot become uncallable.
    uint256 public constant MAX_CATCHUP = 160; // ~3 years of weeks per call

    function release() public returns (uint256 amount) {
        // With nothing staked the clock does not advance. The first
        // version consumed the elapsed periods and then refused to
        // distribute them, which burned a year of emission the moment
        // somebody staked: stake() calls release() before the stake is
        // recorded, so the very first staker triggered exactly that.
        if (totalStaked == 0) return 0;
        uint256 due = periodsElapsed();
        if (due <= lastPeriod) return 0;
        uint256 n = due - lastPeriod;
        if (n > MAX_CATCHUP) n = MAX_CATCHUP;

        uint256 left = emissionLeft;
        for (uint256 i; i < n; ++i) {
            uint256 cut = (left * RELEASE_PPM) / 1_000_000;
            if (cut == 0) break;
            left -= cut;
            amount += cut;
        }
        if (amount == 0) {
            lastPeriod += n;
            return 0;
        }

        emissionLeft = left;
        released += amount;
        lastPeriod += n;

        accPerShare += (amount * SCALE) / totalStaked;

        emit Released(amount, n, emissionLeft);
    }

    function pending(address who) public view returns (uint256) {
        return (stakedOf[who] * (accPerShare - marker[who])) / SCALE;
    }

    function stake(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        release();
        _settle(msg.sender);
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        stakedOf[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (stakedOf[msg.sender] < amount) revert NotEnoughStaked();
        release();
        _settle(msg.sender);
        stakedOf[msg.sender] -= amount;
        totalStaked -= amount;
        if (!token.transfer(msg.sender, amount)) revert TransferFailed();
        emit Unstaked(msg.sender, amount);
    }

    function claim() external returns (uint256 paid) {
        release();
        paid = _settle(msg.sender);
    }

    function _settle(address who) internal returns (uint256 paid) {
        paid = pending(who);
        marker[who] = accPerShare;
        if (paid > 0) {
            claimedOf[who] += paid;
            if (!token.transfer(who, paid)) revert TransferFailed();
            emit Claimed(who, paid);
        }
    }

    /// Voting power is simply what you have locked. Holding without locking
    /// carries no vote: the people steering the protocol should be the ones
    /// who cannot leave the moment the vote goes against them.
    function votingPower(address who) external view returns (uint256) {
        return stakedOf[who];
    }
}
