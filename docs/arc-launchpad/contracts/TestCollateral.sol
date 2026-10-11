// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title TestCollateral
/// @notice A free, worthless token so the launchpad can be used before
///         anyone risks money on it.
///
/// WHY THIS EXISTS
///   A launch needs 1,500 units of collateral. Requiring that in something
///   valuable means the first person to try the product is also the first
///   person to fund it, which is a bad order: the mechanism should be
///   demonstrable before it is trusted.
///
///   So this is collateral in every structural sense — the vault holds it,
///   the floor is denominated in it, redemption pays it out — and worth
///   nothing at all. Anyone can mint as much as they like. A launch backed
///   by it behaves exactly like a real one and protects exactly nothing,
///   which is the point: the machinery can be watched running without
///   anybody being asked to believe in it first.
///
/// THE NAME IS A WARNING AND IT IS ON CHAIN
///   Called "Test Collateral (worthless)" so that anyone reading a pool,
///   a vault or a block explorer sees what it is without being told.
contract TestCollateral {
    string public constant name = "Test Collateral (worthless)";
    string public constant symbol = "tCOL";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();

    /// Mint to yourself. No limit, no owner, no fee — if this token were
    /// scarce it would have a price, and a price is exactly what it must not
    /// have.
    function faucet(uint256 amount) external {
        totalSupply += amount;
        balanceOf[msg.sender] += amount;
        emit Transfer(address(0), msg.sender, amount);
    }

    /// Enough for one launch at the 1,500 minimum, plus room to trade.
    function faucetDefault() external {
        uint256 amount = 5000 ether;
        totalSupply += amount;
        balanceOf[msg.sender] += amount;
        emit Transfer(address(0), msg.sender, amount);
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
