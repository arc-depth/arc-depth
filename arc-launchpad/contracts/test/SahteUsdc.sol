// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice A 6-decimal ERC20 with approve/transferFrom and a free mint, put
///         in place of Arc's USDC on an anvil fork: anvil cannot execute the
///         real one (transfer reverts, measured 17 Oct 2026). Its mappings
///         start at slot 100 so they cannot meet the real contract's storage.
contract SahteUsdc {
    uint256[100] private _bos;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function decimals() external pure returns (uint8) { return 6; }
    function symbol() external pure returns (string memory) { return "USDC"; }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
        totalSupply += v;
        emit Transfer(address(0), to, v);
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        emit Approval(msg.sender, s, v);
        return true;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _tasi(msg.sender, to, v);
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) {
            require(a >= v, "izin");
            allowance[f][msg.sender] = a - v;
        }
        _tasi(f, to, v);
        return true;
    }

    function _tasi(address f, address to, uint256 v) internal {
        require(balanceOf[f] >= v, "bakiye");
        balanceOf[f] -= v;
        balanceOf[to] += v;
        emit Transfer(f, to, v);
    }
}
