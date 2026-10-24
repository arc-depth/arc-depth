// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20D {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title DevPool
/// @notice Where the outside-developer slice of every fee accumulates, and
///         the only way it ever leaves.
///
/// WHY IT IS A CONTRACT AND NOT AN ADDRESS
///   The fee splits three ways: holders, outside developers, us. The first
///   deployment pointed the developer slice at our own wallet and labelled
///   it temporary, which is not a weaker version of the design — it is the
///   design abandoned. Two of the three slices would have arrived at the
///   same key. Anyone evaluating whether this project is really open to
///   outside work would check exactly that and stop reading.
///
///   So the slice lands here instead, and here has no owner. There is no
///   admin, no pause, no upgrade and no rescue function. The single way out
///   is `pay`, and `pay` answers only to the governor.
///
/// HOW A DEVELOPER ACTUALLY GETS PAID
///   1. They do the work and call `register` with a link to it — a pull
///      request, a commit, an audit, a front end. That costs nothing but
///      gas and puts a permanent, ordered record on chain.
///   2. Someone with enough stake proposes a payment in the Governor,
///      naming this contract, the token, the recipient and the amount, and
///      quoting the contribution id.
///   3. The proposal is voted on for five days, waits out the timelock, and
///      then anyone can execute it. The money moves here.
///
///   The register step is not a permission system. Nobody approves it and
///   nothing checks it. It exists so a payment proposal can point at
///   something specific rather than a name, and so the record of who built
///   what does not depend on a repository that someone else controls.
///
/// THE BOOTSTRAP PROBLEM, STATED RATHER THAN HIDDEN
///   Governance votes with staked governance tokens. Until those are
///   distributed there is nobody to pass a proposal, so the fee arrives and
///   sits. Nothing is lost — the balance only grows, and no key exists that
///   could take it — but the pool is genuinely unspendable until the token
///   is in circulation. That is the honest cost of having no backdoor.
contract DevPool {
    /// The only caller that can move anything. Immutable: a pool whose
    /// spender can be repointed is a pool with an owner.
    address public immutable governor;

    uint256 public contributionCount;

    /// Per recipient, per token, cumulative. Kept in storage rather than
    /// left to event indexing so the answer to "what has this address been
    /// paid" is available on chain to any other contract.
    mapping(address => mapping(address => uint256)) public paid;

    event Contributed(uint256 indexed id, address indexed who, string uri);
    event Paid(address indexed token, address indexed to, uint256 amount, uint256 contributionId);

    error NotGovernor();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();

    constructor(address _governor) {
        if (_governor == address(0)) revert ZeroAddress();
        governor = _governor;
    }

    function held(IERC20D token) external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// Record a piece of work. Permissionless and unjudged by design; the
    /// judgement happens in the vote.
    function register(string calldata uri) external returns (uint256 id) {
        id = contributionCount++;
        emit Contributed(id, msg.sender, uri);
    }

    /// Pay a developer. Reachable only through a proposal that passed, sat
    /// out the timelock and was then executed.
    ///
    /// `contributionId` is carried through to the event so the payment and
    /// the work it is for stay attached to each other in the log. It is not
    /// validated: a payment may legitimately precede a registration, or
    /// cover several, and a contract that rejected a payment over a
    /// bookkeeping reference would be a contract that can refuse a vote.
    function pay(IERC20D token, address to, uint256 amount, uint256 contributionId) external {
        if (msg.sender != governor) revert NotGovernor();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        paid[to][address(token)] += amount;
        if (!token.transfer(to, amount)) revert TransferFailed();
        emit Paid(address(token), to, amount, contributionId);
    }
}
