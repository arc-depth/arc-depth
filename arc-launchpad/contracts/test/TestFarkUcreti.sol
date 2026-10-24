// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { FarkUcreti } from "../lz/FarkUcreti.sol";

/// @notice Exposes FarkUcreti for the audit script. sqrt prices are built
///         from a ratio so each case states the price gap it means.
contract TestFarkUcreti {
    uint160 constant BAZ = 79228162514264337593543950336; // sqrtPriceX96 of 1.0

    function hesapla(uint160 y, uint160 r, bool t0, bool al, uint64 rz, uint64 s, uint64 yas, uint24 tavan)
        external pure returns (uint24)
    {
        return FarkUcreti.hesapla(y, r, t0, al, rz, s, yas, tavan);
    }

    /// sqrtPriceX96 for price = num/den, by integer sqrt on the X192 value.
    function sqrtFiyat(uint256 num, uint256 den) public pure returns (uint160) {
        uint256 x = (num << 192) / den;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
        return uint160(y);
    }
}
