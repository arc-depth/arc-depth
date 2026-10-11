// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Does a CONTRACT get to read these feeds, or only an EOA?
///
/// Chainlink's SimpleReadAccessController grants a caller when
/// msg.sender == tx.origin — true for a wallet calling the feed directly,
/// false for every contract. So an eth_call from a wallet can succeed
/// against a feed the oracle contract cannot read at all, and trusting the
/// wallet's answer is how a dead integration ships looking healthy.
contract TestBesleyiciErisim {
    function dene(address[] calldata feedler)
        external
        view
        returns (bool[] memory okudu, int256[] memory cevaplar)
    {
        okudu = new bool[](feedler.length);
        cevaplar = new int256[](feedler.length);
        for (uint256 i = 0; i < feedler.length; i++) {
            (bool ok, bytes memory d) = feedler[i].staticcall(
                abi.encodeWithSignature("latestRoundData()")
            );
            if (ok && d.length >= 160) {
                (, int256 c,,,) = abi.decode(d, (uint80, int256, uint256, uint256, uint80));
                okudu[i] = true;
                cevaplar[i] = c;
            }
        }
    }
}
