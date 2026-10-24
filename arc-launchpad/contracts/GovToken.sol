// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title GovToken
/// @notice The protocol's own token. Fixed supply, no sale, no allocation to
///         anyone who did not earn it.
///
/// There is no mint function. The entire supply exists at construction and is
/// handed to the distributor contracts named in the constructor — nothing is
/// retained by the deployer, and nothing can be created later. That is the
/// only way the emission schedule below can be a fact rather than a plan.
contract GovToken {
    string public constant name = "Arc Launchpad";
    string public constant symbol = "ALP";
    uint8 public constant decimals = 18;
    uint256 public constant TOTAL = 1_000_000_000 ether;

    /// 5% free at launch, 5% over twelve months, 30% liquidity and staking
    /// seed, 60% emitted over thirty years. Sums to 100%: there is no
    /// treasury slice hiding the remainder.
    uint256 public constant FREE_BPS = 500;
    uint256 public constant VEST_BPS = 500;
    uint256 public constant LIQUIDITY_BPS = 3000;
    uint256 public constant EMISSION_BPS = 6000;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();
    error BadSplit();

    constructor(address free, address vesting, address liquidity, address emission) {
        uint256 f = (TOTAL * FREE_BPS) / 10000;
        uint256 v = (TOTAL * VEST_BPS) / 10000;
        uint256 l = (TOTAL * LIQUIDITY_BPS) / 10000;
        uint256 e = TOTAL - f - v - l;
        if (e != (TOTAL * EMISSION_BPS) / 10000) revert BadSplit();

        totalSupply = TOTAL;
        // Accumulated, not assigned. If two of these four are the same
        // address — which a deployment script can easily do — plain
        // assignment silently destroys the earlier slice and the balances
        // stop summing to totalSupply.
        balanceOf[free] += f;
        balanceOf[vesting] += v;
        balanceOf[liquidity] += l;
        balanceOf[emission] += e;

        emit Transfer(address(0), free, f);
        emit Transfer(address(0), vesting, v);
        emit Transfer(address(0), liquidity, l);
        emit Transfer(address(0), emission, e);
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
