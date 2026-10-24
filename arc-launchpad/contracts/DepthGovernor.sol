// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IStakeOy {
    function oyGucuAt(address who, uint256 blok) external view returns (uint256);
    function toplamAt(uint256 blok) external view returns (uint256);
    function MIN_OY_GUCU() external view returns (uint256);
}

/// @title DepthGovernor — propose, wait, execute. Nothing else.
/// @notice Voting weight comes from a snapshot taken when the proposal
///         opens, so a vote cannot be bought after the question is asked.
///
/// WHAT CHANGED FROM THE LAST ONE
///   The previous governor read voting power at the moment of voting, and
///   unstaking was instant, so a decision could be carried entirely by
///   stake that left in the next block. It was patched with `tazele` — a
///   function anyone could call to cut a vote down to the stake still
///   behind it — which worked but was optimistic: somebody had to be
///   watching.
///
///   The clean fix is a snapshot at proposal time, and it was unavailable
///   then because checkpoints have to live in the staking contract and that
///   one held the whole emission and could not be replaced. The new Stake
///   keeps them, so the fix is available and `tazele` is gone. Stake
///   arriving after a proposal opened is worth nothing on it. There is
///   nothing to rent and nobody has to watch.
///
/// THE FLOOR IS IN THE STAKE CONTRACT
///   50,000 is checked there, not here, because it is one rule and should
///   live in one place: `oyGucuAt` returns zero under the floor. Earning
///   has no minimum — that stake is still counted in `toplamAt`, because it
///   is staked and it is part of the whole the quorum is measured against.
///
/// WHAT A VOTE CAN DO
///   One call, to one address, with bytes fixed when the proposal opened.
///   It cannot reach the locked liquidity, the vaults, the floors or any
///   token already minted, because none of those contracts have a function
///   that would let it — that is a property of them, not a permission
///   withheld here.
///
/// THE GUARDIAN CAN ONLY SAY NO
///   Early on, whoever stakes most decides, and the thresholds are
///   fractions of a small number. The guardian exists for that window and
///   is the weakest instrument available: it can cancel a proposal and
///   nothing else. It cannot propose, vote, execute or change a parameter.
///   It can give itself up for good, and either way it stops working at
///   `guardianExpiry`, a date fixed at deployment that nobody can move.
contract DepthGovernor {
    IStakeOy public immutable stake;

    /// Immutable rather than constant only so a test can reach the far side
    /// of the timelock inside one call; production is 5 / 2 / 14 days and
    /// anyone can read them here.
    uint256 public immutable VOTING_PERIOD;
    uint256 public immutable TIMELOCK;
    uint256 public immutable GRACE_PERIOD;
    /// How far back the weight snapshot reaches. Production is 1, so stake
    /// must have been in place for a block before it can raise or decide a
    /// question — staking and proposing in one transaction is not a thing.
    /// Immutable for the same reason the periods are: block.number does not
    /// move inside an eth_call, so with a hard-coded 1 every checkpoint a
    /// test writes would sit outside the snapshot and no proposal could
    /// ever be opened. The anti-renting property itself is checked in the
    /// Stake tests, where the checkpoint lives.
    uint256 public immutable ANLIK_GERI;

    /// FOR votes must reach this fraction of the snapshot's total staked.
    uint256 public constant QUORUM_BPS = 1000;        // 10%
    uint256 public constant PROPOSAL_THRESHOLD_BPS = 100; // 1%

    uint256 public immutable guardianExpiry;
    address public guardian;

    enum State { Active, Defeated, Succeeded, Queued, Ready, Executed, Expired, Cancelled }

    struct Proposal {
        address proposer;
        /// Zero for a signal proposal: a question put on the record with no
        /// call behind it. Those still vote and still pass; executing one
        /// only marks it.
        address target;
        bytes data;
        string description;
        /// The block weights are read at. Fixed when the proposal opens.
        uint256 anBlok;
        uint256 end;
        uint256 eta;
        uint256 snapshotTotal;
        uint256 forVotes;
        uint256 againstVotes;
        bool executed;
        bool cancelled;
    }

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => uint256)) public powerAt;

    event Proposed(uint256 indexed id, address indexed proposer, address target,
                   string description, uint256 anBlok, uint256 end);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event Queued(uint256 indexed id, uint256 eta);
    event Executed(uint256 indexed id, address target, bytes data);
    event Cancelled(uint256 indexed id, address by);
    event GuardianRenounced();

    error BelowThreshold();
    error YetersizOyGucu();
    error NotActive();
    error AlreadyVoted();
    error NotSucceeded();
    error NotReady();
    error NotCancellable();
    error NotGuardian();
    error GuardianOver();
    error CallFailed();
    error NoSnapshot();

    constructor(
        IStakeOy _stake,
        address _guardian,
        uint256 _guardianDays,
        uint256 _votingPeriod,
        uint256 _timelock,
        uint256 _gracePeriod,
        uint256 _anlikGeri
    ) {
        stake = _stake;
        guardian = _guardian;
        guardianExpiry = block.timestamp + _guardianDays * 1 days;
        VOTING_PERIOD = _votingPeriod;
        TIMELOCK = _timelock;
        GRACE_PERIOD = _gracePeriod;
        ANLIK_GERI = _anlikGeri;
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    /// Open a question. The snapshot block is the previous one, so the
    /// proposer cannot stake and propose in the same transaction and have
    /// that stake count.
    function propose(string calldata description, address target, bytes calldata data)
        external
        returns (uint256 id)
    {
        if (block.number < ANLIK_GERI) revert NoSnapshot();
        uint256 an = block.number - ANLIK_GERI;

        uint256 total = stake.toplamAt(an);
        uint256 power = stake.oyGucuAt(msg.sender, an);
        /* Under the floor `oyGucuAt` already returns zero, so this
           distinguishes "you hold nothing that votes" from "you hold some
           but not 1% of it". */
        if (power == 0) revert YetersizOyGucu();
        if (total == 0 || power * 10000 < total * PROPOSAL_THRESHOLD_BPS) revert BelowThreshold();

        id = proposals.length;
        proposals.push(Proposal({
            proposer: msg.sender,
            target: target,
            data: data,
            description: description,
            anBlok: an,
            end: block.timestamp + VOTING_PERIOD,
            eta: 0,
            snapshotTotal: total,
            forVotes: 0,
            againstVotes: 0,
            executed: false,
            cancelled: false
        }));
        emit Proposed(id, msg.sender, target, description, an, block.timestamp + VOTING_PERIOD);
    }

    /// Vote with whatever was staked when the question was asked.
    function castVote(uint256 id, bool support) external returns (uint256 weight) {
        Proposal storage p = proposals[id];
        if (block.timestamp > p.end || p.cancelled || p.executed) revert NotActive();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();

        weight = stake.oyGucuAt(msg.sender, p.anBlok);
        if (weight == 0) revert YetersizOyGucu();

        hasVoted[id][msg.sender] = true;
        powerAt[id][msg.sender] = weight;
        if (support) p.forVotes += weight; else p.againstVotes += weight;
        emit Voted(id, msg.sender, support, weight);
    }

    function forVotesOf(uint256 id) external view returns (uint256) { return proposals[id].forVotes; }
    function againstVotesOf(uint256 id) external view returns (uint256) { return proposals[id].againstVotes; }

    function state(uint256 id) public view returns (State) {
        Proposal storage p = proposals[id];
        if (p.cancelled) return State.Cancelled;
        if (p.executed) return State.Executed;
        if (block.timestamp < p.end) return State.Active;

        /* Quorum counts FOR votes only, so indifference defeats a proposal
           rather than passing it. */
        bool quorum = p.forVotes * 10000 >= p.snapshotTotal * QUORUM_BPS;
        if (!(quorum && p.forVotes > p.againstVotes)) return State.Defeated;

        if (p.eta == 0) return State.Succeeded;
        if (block.timestamp < p.eta) return State.Queued;
        if (block.timestamp <= p.eta + GRACE_PERIOD) return State.Ready;
        return State.Expired;
    }

    /// Start the timelock. Open to anyone: a passed proposal should not
    /// wait on whoever happens to hold a privilege.
    function queue(uint256 id) external returns (uint256 eta) {
        if (state(id) != State.Succeeded) revert NotSucceeded();
        eta = block.timestamp + TIMELOCK;
        proposals[id].eta = eta;
        emit Queued(id, eta);
    }

    /// Do the thing. Also open to anyone, including whoever the payment is
    /// for — a decision that has passed and waited should not need
    /// anybody's goodwill to land.
    function execute(uint256 id) external {
        if (state(id) != State.Ready) revert NotReady();
        Proposal storage p = proposals[id];
        p.executed = true;
        if (p.target != address(0)) {
            (bool ok, ) = p.target.call(p.data);
            if (!ok) revert CallFailed();
        }
        emit Executed(id, p.target, p.data);
    }

    /// The guardian's only power, and only while it has one.
    function cancel(uint256 id) external {
        if (msg.sender != guardian) revert NotGuardian();
        if (block.timestamp > guardianExpiry) revert GuardianOver();
        Proposal storage p = proposals[id];
        if (p.executed || p.cancelled) revert NotCancellable();
        p.cancelled = true;
        emit Cancelled(id, msg.sender);
    }

    /// Give it up early. There is no way back.
    function renounce() external {
        if (msg.sender != guardian) revert NotGuardian();
        guardian = address(0);
        emit GuardianRenounced();
    }

    function guardianActive() external view returns (bool) {
        return guardian != address(0) && block.timestamp <= guardianExpiry;
    }
}
