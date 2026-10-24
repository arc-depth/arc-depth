// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHaberci, IHaberAlici, IERC20S} from "../sepet/IHaberci.sol";

/// A stand-in for Arc's messenger in the v6 Arc vault rehearsal
/// (scripts/denetim-v6-arc.js): it hands the vault an order with dollars, as
/// the real HaberciLZ does after the Defter's local delivery, and records
/// what the vault pays out. Never deployed on mainnet.
contract HaberciSahteArc is IHaberci {
    IERC20S public immutable usdc;
    mapping(bytes32 => uint256) public odenen;

    constructor(IERC20S u) { usdc = u; }

    function zincir() external pure returns (uint32) { return 26; }

    function gonder(uint32, bytes32 alici, bytes calldata, uint256 m) external {
        if (m > 0) usdc.transferFrom(msg.sender, address(this), m);
        odenen[alici] += m;
    }

    function teslim(address hedef, bytes memory veri, uint256 m, bytes32 defter) external {
        if (m > 0) usdc.transfer(hedef, m);
        IHaberAlici(hedef).haberAl(26, defter, veri, m);
    }
}
