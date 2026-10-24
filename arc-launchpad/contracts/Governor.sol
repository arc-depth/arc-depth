// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IStakingVotes {
    function votingPower(address who) external view returns (uint256);
    function totalStaked() external view returns (uint256);
}

/// @title Governor
/// @notice Where the staked token decides something, and the decision then
///         happens by itself.
///
/// WHAT CHANGED AND WHY
///   The first version recorded votes and stopped. Its `markExecuted` set a
///   flag and emitted an event; no proposal could move a single unit of
///   anything. That is a comment pretending to be a mechanism: it reads
///   like governance to someone skimming, and an outside developer told
///   their share would be decided by a vote would discover, the first time
///   they tried to be paid, that the vote has no hands.
///
///   A proposal now carries a target and calldata, and executing it makes
///   that call. The developer pool answers only to this contract, so the
///   path from "the vote passed" to "the money moved" is on chain and needs
///   nobody's cooperation.
///
/// WHAT IT GOVERNS, AND WHAT IT STILL CANNOT
///   Nothing already deployed and immutable. The hook, every vault, every
///   curve and every launch have no function a vote could call; that is a
///   property of their code, not a promise made here. What this reaches is
///   what is genuinely open: the developer pool, the protocol treasury, and
///   the parameters of a FUTURE launchpad version.
///
///   Saying it plainly matters. A governor that looks like it controls a
///   vault invites people to believe a vote could drain one.
///
/// THE FOUR DELAYS, AND WHAT EACH IS FOR
///   - Proposal threshold, 1% of stake. A floor on what it costs to put a
///     question to everybody.
///   - Voting period, 5 days. Long enough that a borrowed position would
///     have to stay borrowed across it.
///   - Timelock, 2 days after success. The one that was missing. Between a
///     decision and its effect there has to be a window in which anyone who
///     disagrees can act: unstake, exit, publish, raise the alarm. Without
///     it, the first anybody hears of a payment is the transfer itself.
///   - Grace period, 14 days. A proposal nobody bothered to execute expires
///     instead of staying loaded indefinitely. A vote taken under one set of
///     circumstances should not still be executable a year later.
///
/// VOTING POWER IS SNAPSHOTTED AT PROPOSAL TIME
///   Power is read when the proposal is created, not when the ballot is
///   cast. Otherwise the cheapest attack is to borrow the token, vote and
///   return it in the same block: the vote costs nothing and the voter
///   carries none of the consequences.
///
/// QUORUM AND THE DO-NOTHING DEFAULT
///   A proposal passes only if FOR exceeds AGAINST and the FOR side alone
///   reaches 10% of everything staked. Apathy defeats a proposal rather
///   than passing it, which is the right default for a protocol whose main
///   virtue is that it mostly cannot be changed.
///
/// STAKING IS OPEN, DECIDING IS NOT
///   Anybody may stake any amount and earn from the emission; Staking has
///   no minimum and keeps none. A vote needs MIN_OY_GUCU staked. The two
///   used to be the same question, and because the proposal threshold and
///   the quorum are both shares of total staked, that made one wei a
///   hundred percent of the vote for as long as nobody else had staked.
///
///   Quorum is still 10% of total staked, and total staked counts stake
///   that cannot vote. So many small stakers raise the bar without raising
///   the votes able to clear it. Counting only eligible stake would need
///   Staking to track it, and Staking cannot be replaced — it holds the
///   whole 600,000,000 emission. The effect is that indifference defeats
///   proposals more easily, which is this design's existing bias, but it
///   is a real cost rather than a free win.
///
/// THE GUARDIAN CAN ONLY SAY NO
///   While the token is barely distributed, whoever stakes first holds most
///   of the voting power, and the thresholds above are fractions of a very
///   small number. The guardian exists for that window and is deliberately
///   the weakest possible instrument: it can cancel a proposal and nothing
///   else. It cannot propose, cannot vote, cannot execute and cannot change
///   a parameter. It can give itself up for good with `renounce`, and
///   whether or not it does, it stops working at `guardianExpiry` — a date
///   fixed at deployment that nobody, governance included, can move.
contract Governor {
    /// Fixed at deployment and never settable afterwards. Immutable rather
    /// than constant only so that a test can reach the far side of the
    /// timelock inside a single call; production values are 5 / 2 / 14
    /// days and are readable here by anyone.
    uint256 public immutable VOTING_PERIOD;
    uint256 public immutable TIMELOCK;
    uint256 public immutable GRACE_PERIOD;
    /// FOR votes must reach this fraction of total staked, in basis points.
    uint256 public constant QUORUM_BPS = 1000; // 10%
    uint256 public constant PROPOSAL_THRESHOLD_BPS = 100; // 1%

    /// The least stake that carries a vote.
    ///
    /// Staking itself has no minimum and keeps none: anybody may stake any
    /// amount and earn from the emission. This is only about who decides.
    /// Without a floor the two were the same question, and since both the
    /// proposal threshold and the quorum are shares of total staked, one
    /// wei was a hundred percent of the vote while nobody else had staked.
    ///
    /// Constant and unsettable on purpose. There is no upgrade path in this
    /// design, and a floor governance could lower is not a floor.
    uint256 public constant MIN_OY_GUCU = 50_000 ether;

    IStakingVotes public immutable staking;

    /// After this timestamp the guardian is inert whatever its address says.
    uint256 public immutable guardianExpiry;
    address public guardian;

    enum State { Active, Defeated, Succeeded, Queued, Ready, Executed, Expired, Cancelled }

    struct Proposal {
        address proposer;
        /// Zero for a signal proposal: a question put on the record with no
        /// call behind it. Those still vote and still pass; executing one
        /// only marks it, which is what the old contract did for everything.
        address target;
        bytes data;
        string description;
        uint256 end;
        uint256 eta;            // 0 until queued
        uint256 snapshotTotal;
        uint256 forVotes;
        uint256 againstVotes;
        bool executed;
        bool cancelled;
    }

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => uint256)) public powerAt;
    /// Which way each voter went, so a weight that has to be cut is taken
    /// off the right side of the tally.
    mapping(uint256 => mapping(address => bool)) public oyYonu;

    event Proposed(uint256 indexed id, address indexed proposer, address target, string description, uint256 end);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event Tazelendi(uint256 indexed id, address indexed voter, uint256 eski, uint256 yeni);
    event Queued(uint256 indexed id, uint256 eta);
    event Executed(uint256 indexed id, address target, bytes data);
    event Cancelled(uint256 indexed id, address by);
    event GuardianRenounced();

    error BelowThreshold();
    error NotActive();
    error AlreadyVoted();
    error NoPower();
    /// Staked, but under MIN_OY_GUCU — enough to earn, not enough to decide.
    error YetersizOyGucu();
    error NotSucceeded();
    error NotReady();
    error NotCancellable();
    error NotGuardian();
    error GuardianOver();
    error CallFailed();

    constructor(
        IStakingVotes _staking,
        address _guardian,
        uint256 _guardianDays,
        uint256 _votingPeriod,
        uint256 _timelock,
        uint256 _gracePeriod
    ) {
        staking = _staking;
        guardian = _guardian;
        guardianExpiry = block.timestamp + _guardianDays * 1 days;
        VOTING_PERIOD = _votingPeriod;
        TIMELOCK = _timelock;
        GRACE_PERIOD = _gracePeriod;
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    /// Put a question, optionally with a call behind it.
    function propose(string calldata description, address target, bytes calldata data)
        external
        returns (uint256 id)
    {
        uint256 total = staking.totalStaked();
        uint256 power = staking.votingPower(msg.sender);
        /* The same floor as voting. With little staked, 1% of the total is
           far below 50,000, which would let somebody open a proposal they
           are not allowed to vote on. */
        if (power < MIN_OY_GUCU) revert YetersizOyGucu();
        if (total == 0 || power * 10000 < total * PROPOSAL_THRESHOLD_BPS) revert BelowThreshold();

        id = proposals.length;
        proposals.push(Proposal({
            proposer: msg.sender,
            target: target,
            data: data,
            description: description,
            end: block.timestamp + VOTING_PERIOD,
            eta: 0,
            snapshotTotal: total,
            forVotes: 0,
            againstVotes: 0,
            executed: false,
            cancelled: false
        }));
        emit Proposed(id, msg.sender, target, description, block.timestamp + VOTING_PERIOD);
    }

    /// Weight is whatever the voter has staked the first time they are seen
    /// for this proposal, recorded then and reused.
    /// The window is checked here rather than through `state()`, and
    /// inclusively: a ballot is accepted up to and including `end`, while
    /// `state()` stops reporting Active strictly before it.
    ///
    /// That leaves one second in which a vote can still be cast on a
    /// proposal `state()` already calls Succeeded, and it is harmless
    /// because `state()` is recomputed from the stored tallies every time
    /// it is asked. A proposal queued in that second still cannot execute
    /// unless it is genuinely Succeeded two days later, by which point the
    /// tallies are final. The alternative — making both bounds strict —
    /// would mean no test could ever both vote on a proposal and see it
    /// resolve, since `block.timestamp` cannot be moved inside a call.
    function castVote(uint256 id, bool support) external returns (uint256 weight) {
        Proposal storage p = proposals[id];
        if (block.timestamp > p.end || p.cancelled || p.executed) revert NotActive();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();

        weight = staking.votingPower(msg.sender);
        if (weight == 0) revert NoPower();
        if (weight < MIN_OY_GUCU) revert YetersizOyGucu();

        hasVoted[id][msg.sender] = true;
        powerAt[id][msg.sender] = weight;
        oyYonu[id][msg.sender] = support;
        if (support) p.forVotes += weight; else p.againstVotes += weight;

        emit Voted(id, msg.sender, support, weight);
    }

    /// Cut a vote down to the stake still behind it.
    ///
    /// Voting power is read when the vote is cast and nothing stops the
    /// voter withdrawing a block later, so a decision could be rented:
    /// stake, vote, unstake, having risked nothing. A snapshot at proposal
    /// time would be the clean fix and is unavailable — it needs
    /// checkpoints inside Staking, and Staking cannot be replaced without
    /// abandoning the 600,000,000 it holds.
    ///
    /// So a vote is provisional until the proposal is executed. Anyone may
    /// call this, for any voter, through the voting period and the whole of
    /// the timelock; if the voter holds less than they were credited, the
    /// difference comes off the tally. Keeping a vote now means keeping the
    /// stake.
    ///
    /// Permissionless on purpose. The person with a reason to check is
    /// whoever the proposal would cost, and requiring anybody's permission
    /// to point out that a vote is no longer funded would be a strange
    /// thing to require.
    function tazele(uint256 id, address secmen) external returns (uint256 dusen) {
        Proposal storage p = proposals[id];
        if (p.executed || p.cancelled) revert NotActive();

        uint256 kayitli = powerAt[id][secmen];
        if (kayitli == 0) return 0;

        /* Falling under the floor does not leave a smaller vote, it leaves
           no vote: the remaining stake was never enough to cast one.
           Trimming instead would let a voter keep a say they could not have
           acquired at that size. */
        uint256 simdi = staking.votingPower(secmen);
        uint256 gecerli = simdi >= MIN_OY_GUCU ? simdi : 0;
        if (gecerli >= kayitli) return 0;

        dusen = kayitli - gecerli;
        powerAt[id][secmen] = gecerli;
        if (oyYonu[id][secmen]) p.forVotes -= dusen; else p.againstVotes -= dusen;

        emit Tazelendi(id, secmen, kayitli, gecerli);
    }

    /// The running tally, which lives inside a struct with a dozen other
    /// fields and is otherwise unreadable from outside.
    function forVotesOf(uint256 id) external view returns (uint256) { return proposals[id].forVotes; }
    function againstVotesOf(uint256 id) external view returns (uint256) { return proposals[id].againstVotes; }

    function state(uint256 id) public view returns (State) {
        Proposal storage p = proposals[id];
        if (p.cancelled) return State.Cancelled;
        if (p.executed) return State.Executed;
        if (block.timestamp < p.end) return State.Active;

        bool quorum = p.forVotes * 10000 >= p.snapshotTotal * QUORUM_BPS;
        if (!(quorum && p.forVotes > p.againstVotes)) return State.Defeated;

        if (p.eta == 0) return State.Succeeded;
        if (block.timestamp < p.eta) return State.Queued;
        if (block.timestamp <= p.eta + GRACE_PERIOD) return State.Ready;
        return State.Expired;
    }

    /// Start the timelock. Open to anyone: a passed proposal should not wait
    /// on the goodwill of whoever happens to hold a privilege.
    function queue(uint256 id) external returns (uint256 eta) {
        if (state(id) != State.Succeeded) revert NotSucceeded();
        // From the proposal's own deadline, not from now: the schedule
        // should follow from the proposal rather than from how quickly
        // somebody got round to calling this.
        eta = proposals[id].end + TIMELOCK;
        proposals[id].eta = eta;
        emit Queued(id, eta);
    }

    /// Make the call. Also open to anyone, for the same reason.
    function execute(uint256 id) external {
        if (state(id) != State.Ready) revert NotReady();
        Proposal storage p = proposals[id];
        p.executed = true;

        if (p.target != address(0)) {
            (bool ok, bytes memory ret) = p.target.call(p.data);
            if (!ok) {
                // Surface the callee's own revert rather than a generic
                // failure: a payment that bounced because the pool was
                // short should say so.
                if (ret.length > 0) {
                    assembly { revert(add(ret, 0x20), mload(ret)) }
                }
                revert CallFailed();
            }
        }
        emit Executed(id, p.target, p.data);
    }

    /// The proposer may withdraw their own question while it is still open.
    /// The guardian may stop one at any point before it has executed, until
    /// the guardian expires. Neither can do anything else.
    function cancel(uint256 id) external {
        State s = state(id);
        bool open = s == State.Active || s == State.Succeeded || s == State.Queued || s == State.Ready;
        if (!open) revert NotCancellable();

        if (msg.sender == proposals[id].proposer) {
            if (s != State.Active) revert NotCancellable();
        } else if (msg.sender == guardian && guardian != address(0)) {
            if (block.timestamp > guardianExpiry) revert GuardianOver();
        } else {
            revert NotGuardian();
        }

        proposals[id].cancelled = true;
        emit Cancelled(id, msg.sender);
    }

    /// Irreversible. There is no setter and no way back.
    function renounce() external {
        if (msg.sender != guardian) revert NotGuardian();
        guardian = address(0);
        emit GuardianRenounced();
    }

    /// True while the veto is still a real thing, so a front end can say so
    /// instead of leaving people to read a timestamp.
    function guardianActive() external view returns (bool) {
        return guardian != address(0) && block.timestamp <= guardianExpiry;
    }
}
