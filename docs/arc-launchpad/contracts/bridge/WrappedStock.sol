// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {KopruKanit} from "./KopruKanit.sol";

/// @title WrappedStock  (deploys on Arc)
/// @notice The claim on stock locked in the vault on Robinhood Chain.
///
/// One unit here is one SHARE of that vault, not one unit of stock. The
/// distinction matters the day the issuer applies a split: the stock in the
/// vault changes, the shares do not, and this token keeps meaning exactly
/// what it meant yesterday — a fixed slice of whatever is in there.
///
/// WHO CAN MINT, STATED PLAINLY
///   It used to be one relayer, with no check on the lock it claimed to be
///   answering. One key could mint any amount to any address, and the only
///   thing standing against it was that somebody might later compare the
///   two chains and notice.
///
///   A mint now needs a notice signed by M of N signers with the recipient
///   and the share count inside the signature, plus per-transaction and
///   per-window caps. Submission is permissionless: holding the signatures
///   is the authority, carrying them is not.
///
///   Arc still has no general message bridge — LayerZero and CCIP are both
///   absent, checked on chain — so the lock cannot be verified from this
///   side. M of N signers attesting to it is smaller trust than one, and
///   bounded; it is not proof.
///
///   What still holds: mintedTotal and burnedTotal are public and
///   monotonic, the vault's share count is public on the other chain, the
///   two must be equal, and scripts/denetim.js compares them.
///
/// MINTING CANNOT BE REPLAYED
///   Each mint names the lock it answers. A lock id can only be used once,
///   which removes the most common failure of a relayed bridge: the same
///   deposit notice delivered twice.
contract WrappedStock is KopruKanit {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    uint256 public mintedTotal;
    uint256 public burnedTotal;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(bytes32 => bool) public usedLockId;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Minted(bytes32 indexed lockId, address indexed to, uint256 shares);
    event Burned(address indexed from, address indexed stockRecipient, uint256 shares, bytes32 burnId);

    error AlreadyUsed();
    error ZeroAmount();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(
        string memory _name,
        string memory _symbol,
        address[] memory _imzacilar,
        uint256 _esik,
        uint256 _kaynakZincir,
        uint256 _islemTavani,
        uint256 _pencere,
        uint256 _pencereTavani
    ) KopruKanit(_imzacilar, _esik, _kaynakZincir, _islemTavani, _pencere, _pencereTavani) {
        name = _name;
        symbol = _symbol;
    }

    /// Anyone may submit; only the signatures carry authority.
    function mint(bytes32 lockId, address to, uint256 shares, bytes[] calldata imzalar) external {
        if (shares == 0) revert ZeroAmount();

        /* Verifies the signatures over exactly (lockId, to, shares), marks
           the id used and charges the caps. */
        _kanitla(lockId, to, shares, imzalar);
        usedLockId[lockId] = true;
        totalSupply += shares;
        mintedTotal += shares;
        balanceOf[to] += shares;

        emit Minted(lockId, to, shares);
        emit Transfer(address(0), to, shares);
    }

    /// Burn shares and ask for the stock to be released on Robinhood Chain.
    ///
    /// The burn id is derived from the chain, the burner and a running count,
    /// so it is unique without needing a registry and the vault can refuse a
    /// repeat.
    function burn(uint256 shares, address stockRecipient) external returns (bytes32 burnId) {
        if (shares == 0) revert ZeroAmount();
        uint256 b = balanceOf[msg.sender];
        if (b < shares) revert InsufficientBalance();

        unchecked {
            balanceOf[msg.sender] = b - shares;
            totalSupply -= shares;
        }
        burnedTotal += shares;

        burnId = keccak256(abi.encode(block.chainid, address(this), msg.sender, burnedTotal, shares));

        emit Transfer(msg.sender, address(0), shares);
        emit Burned(msg.sender, stockRecipient, shares, burnId);
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        emit Approval(msg.sender, s, v);
        return true;
    }

    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) {
            if (a < v) revert InsufficientAllowance();
            unchecked { allowance[f][msg.sender] = a - v; }
        }
        _move(f, t, v);
        return true;
    }

    function _move(address f, address t, uint256 v) internal {
        uint256 b = balanceOf[f];
        if (b < v) revert InsufficientBalance();
        unchecked {
            balanceOf[f] = b - v;
            balanceOf[t] += v;
        }
        emit Transfer(f, t, v);
    }
}
