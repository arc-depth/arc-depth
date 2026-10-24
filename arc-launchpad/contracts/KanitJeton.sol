// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title KanitJeton — a token that exists only to prove delivery
/// @notice Used once, to show with on-chain receipts that the network's
///         messages arrive: spread to another chain by IkizYayici, then
///         bridged there and back. Its name says what it is so nobody takes
///         it for a launch. Fixed supply, all to the deployer, no owner.
contract KanitJeton {
    string public constant name = "ARC PULSE delivery proof";
    string public constant symbol = "APPROOF";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        totalSupply = 1_000e18;
        balanceOf[msg.sender] = 1_000e18;
        emit Transfer(address(0), msg.sender, 1_000e18);
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        emit Approval(msg.sender, s, v);
        return true;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        emit Transfer(msg.sender, to, v);
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        if (allowance[f][msg.sender] != type(uint256).max) allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[to] += v;
        emit Transfer(f, to, v);
        return true;
    }
}
