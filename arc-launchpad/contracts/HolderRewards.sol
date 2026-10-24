// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20Min {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface ILaunchToken {
    function totalSupply() external view returns (uint256);
    function balanceOf(address who) external view returns (uint256);
    function lastBalanceChange(address who) external view returns (uint64);
}

/// @title HolderRewards
/// @notice Pays the 0.15% holder share to accounts that have sat still.
///
/// THE RULE
///   An account earns if its balance has not moved for HOLD_PERIOD. Not "has
///   not sold" — has not moved, in either direction. The reason is in
///   LaunchToken: a v4 hook cannot see who sold, only which router called it,
///   so "who sold" is not a fact the chain makes available. "Whose balance
///   changed" is, and it is the stricter of the two: it also closes the hole
///   where you move tokens to a second wallet, sell from there, and keep
///   collecting on the first.
///
/// HOW IT PAYS
///   Pull, not push. Sending to every holder on every swap would cost gas in
///   proportion to the number of holders and eventually stop fitting in a
///   block. Instead a per-token accumulator grows as fees arrive, and each
///   holder withdraws their slice whenever they like. Cost stays flat no
///   matter how many holders there are.
///
/// WHAT HAPPENS TO AN INELIGIBLE HOLDER'S SLICE
///   It is forfeited, not stored. Claiming while ineligible advances your
///   marker without paying you, so the share stays in this contract and is
///   spread over everyone on the next distribution. This is the whole
///   incentive: moving your balance costs you what had accrued since the last
///   time you claimed.
///
/// EXCLUDED FROM REWARDS
///   The pool's own balance. Those tokens sit in the PoolManager as locked
///   liquidity with no owner to claim for them, so counting them would send a
///   large share of every fee nowhere. Excluding them means the fee lands on
///   actual holders.
contract HolderRewards {
    /// How long a balance must sit still. Fixed at construction rather
    /// than hard-coded: it is a launch parameter, and a constant cannot be
    /// exercised in a test without waiting a real day.
    uint64 public immutable holdPeriod;
    uint256 private constant SCALE = 1e18;

    IERC20Min public immutable rewardToken;
    ILaunchToken public immutable token;
    /// Usually the v4 PoolManager: holds the locked liquidity.
    address public immutable excluded;

    /// The curve, which holds every token that has not been bought yet.
    /// Settable once, by whoever deployed this, then frozen.
    address public excluded2;
    address private immutable setter;

    uint256 public accPerShare;      // reward per eligible token, scaled by SCALE
    uint256 public distributed;      // reward already accounted for
    mapping(address => uint256) public marker; // accPerShare when last settled
    mapping(address => uint256) public claimed;

    event Distributed(uint256 amount, uint256 eligibleSupply, uint256 accPerShare);
    event Claimed(address indexed who, uint256 amount);
    event Forfeited(address indexed who, uint256 amount);

    error NothingNew();
    error NoEligibleSupply();
    error NotSetter();
    error AlreadySet();

    constructor(IERC20Min _rewardToken, ILaunchToken _token, address _excluded, uint64 _holdPeriod) {
        rewardToken = _rewardToken;
        token = _token;
        excluded = _excluded;
        holdPeriod = _holdPeriod;
        setter = msg.sender;
    }

    /// One-time, by the deployer, in the same transaction that created the
    /// curve. There is no way back: a second call reverts whatever it says.
    function setSecondExcluded(address who) external {
        if (msg.sender != setter) revert NotSetter();
        if (excluded2 != address(0)) revert AlreadySet();
        excluded2 = who;
    }

    /// Tokens that can earn: everything except the locked pool liquidity
    /// and whatever the curve has not sold yet.
    function eligibleSupply() public view returns (uint256) {
        uint256 s = token.totalSupply();
        uint256 e = token.balanceOf(excluded);
        address e2 = excluded2;
        if (e2 != address(0)) e += token.balanceOf(e2);
        return s > e ? s - e : 0;
    }

    /// Books whatever reward has arrived since last time. Permissionless:
    /// anyone may call it, and calling it only moves value toward holders.
    function distribute() public returns (uint256 amount) {
        uint256 bal = rewardToken.balanceOf(address(this));
        uint256 accounted = distributed;
        if (bal <= accounted) revert NothingNew();
        amount = bal - accounted;

        uint256 supply = eligibleSupply();
        if (supply == 0) revert NoEligibleSupply();

        distributed = bal;
        accPerShare += (amount * SCALE) / supply;
        emit Distributed(amount, supply, accPerShare);
    }

    function isEligible(address who) public view returns (bool) {
        return block.timestamp >= uint256(token.lastBalanceChange(who)) + holdPeriod;
    }

    /// What `who` would receive right now. Zero while the wait is unfinished —
    /// the amount is not lost yet, it is lost only if they claim early or move
    /// their balance.
    function earned(address who) public view returns (uint256) {
        // The excluded address is left out of eligibleSupply, so it has no
        // share to report. Reporting one anyway would describe a payout
        // that the accounting never set aside.
        if (who == excluded || who == excluded2 || !isEligible(who)) return 0;
        return (token.balanceOf(who) * (accPerShare - marker[who])) / SCALE;
    }

    /// Pending amount regardless of eligibility — what is at stake if the
    /// balance moves before the wait is over.
    function pending(address who) external view returns (uint256) {
        if (who == excluded || who == excluded2) return 0;
        return (token.balanceOf(who) * (accPerShare - marker[who])) / SCALE;
    }

    function claim() external returns (uint256 paid) {
        if (msg.sender == excluded) return 0;
        uint256 raw = (token.balanceOf(msg.sender) * (accPerShare - marker[msg.sender])) / SCALE;
        marker[msg.sender] = accPerShare;

        if (!isEligible(msg.sender)) {
            // Marker advanced, nothing paid: the slice stays here and is
            // redistributed to everyone on the next distribute().
            if (raw > 0) {
                distributed -= raw;
                emit Forfeited(msg.sender, raw);
            }
            return 0;
        }

        if (raw == 0) return 0;
        claimed[msg.sender] += raw;
        rewardToken.transfer(msg.sender, raw);
        emit Claimed(msg.sender, raw);
        return raw;
    }
}
