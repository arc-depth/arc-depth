// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Test double for YorumKaydi audits: ownerOf + TasarimNFT2's tasarimOf layout.
contract SahteTasarimNFT {
    mapping(uint256 => address) public sahip;
    mapping(uint256 => address) public tasarimci;

    function ayarla(uint256 id, address sahip_, address tasarimci_) external {
        sahip[id] = sahip_;
        tasarimci[id] = tasarimci_;
    }

    function ownerOf(uint256 id) external view returns (address) {
        address s = sahip[id];
        require(s != address(0), "yok");
        return s;
    }

    function tasarimOf(uint256 id) external view returns (address token, address tasarimci_, uint64 itirazBitis, uint64 yayinBlok, bytes32 dosyaHash, bytes32 algiHash, bytes32 anahtarTaahhut, uint256 teminat) {
        return (address(0xdead), tasarimci[id], 0, 0, bytes32(0), bytes32(0), bytes32(0), 0);
    }
}
