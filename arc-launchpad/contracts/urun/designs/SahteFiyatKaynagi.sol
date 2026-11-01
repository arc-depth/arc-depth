// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Test double for IFiyatKaynagi (scripts/designs-denetim.js): the price is
/// whatever was set, so a test can put it at the pool's real price or move it.
/// Never deployed on mainnet.
contract SahteFiyatKaynagi {
    mapping(address => uint256) public fiyat;

    function ayarla(address token, uint256 usdcPerToken) external {
        fiyat[token] = usdcPerToken;
    }

    function twapUsdcPerToken(address token, uint32 saniye) external view returns (uint256) {
        require(saniye > 0, "saniye");
        return fiyat[token];
    }
}
