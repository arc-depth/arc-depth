// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ProvaJeton — a plain token for the basket rehearsal on mainnet
/// @notice Not a product token and never listed: the whole supply is minted
///         to the deployer at construction (no further minting), with the
///         burnFrom the basket's redemption uses. It stands in for a launch
///         token and for basket assets so the rehearsal can exercise every
///         path with real CCTP without buying anything.
contract ProvaJeton {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory ad, string memory sembol, uint256 arz) {
        name = ad;
        symbol = sembol;
        totalSupply = arz;
        balanceOf[msg.sender] = arz;
        emit Transfer(address(0), msg.sender, arz);
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        emit Approval(msg.sender, s, v);
        return true;
    }

    function transfer(address to, uint256 v) external returns (bool) { _tasi(msg.sender, to, v); return true; }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        _harca(f, v);
        _tasi(f, to, v);
        return true;
    }

    function burnFrom(address f, uint256 v) external {
        _harca(f, v);
        balanceOf[f] -= v;
        totalSupply -= v;
        emit Transfer(f, address(0), v);
    }

    function _harca(address f, uint256 v) private {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
    }

    function _tasi(address f, address to, uint256 v) private {
        balanceOf[f] -= v;
        balanceOf[to] += v;
        emit Transfer(f, to, v);
    }
}
