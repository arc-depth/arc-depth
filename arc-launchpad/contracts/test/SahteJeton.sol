// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice A launch token with the two things a vault needs: `burnFrom` for
///         a redemption and `burn` for a buyback.
///
/// In its own file so that importing it does not drag a whole test harness
/// into another one — which it did, and took TestKopruUctanUca from 18KB to
/// 32KB for the sake of one 1KB contract.
///
/// Allowance is deliberately not modelled. The approval path is the token's
/// business, and these suites measure the vault.
contract SahteJeton {
    string public name = "Sahte Jeton";
    string public symbol = "SAHTE";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    constructor(uint256 arz, address kime) {
        totalSupply = arz;
        balanceOf[kime] = arz;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function burn(uint256 v) external {
        balanceOf[msg.sender] -= v;
        totalSupply -= v;
    }

    function burnFrom(address who, uint256 v) external {
        balanceOf[who] -= v;
        totalSupply -= v;
    }
}
