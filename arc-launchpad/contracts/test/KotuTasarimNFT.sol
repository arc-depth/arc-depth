// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Test double for the TasarimPazar3 audit: a hostile NFT that tries to
/// re-enter the market from inside transferFrom. Every re-entry attempt is
/// recorded; the audit expects all of them to fail (ReentrancyGuard).
contract KotuTasarimNFT {
    mapping(uint256 => address) public sahip;
    address public pazar;
    uint256 public deneme;
    uint256 public basarili;
    bytes4 public sonHata;

    function ayarla(uint256 id, address s, address pazar_) external {
        sahip[id] = s;
        pazar = pazar_;
    }

    function ownerOf(uint256 id) external view returns (address) {
        address s = sahip[id];
        require(s != address(0), "yok");
        return s;
    }

    function getApproved(uint256) external view returns (address) { return pazar; }
    function isApprovedForAll(address, address) external pure returns (bool) { return true; }
    function anahtarOf(address) external pure returns (bytes memory) { return hex"02aa"; }
    function kopyaPenceresiBekle() external pure returns (bool) { return false; }
    function itirazOf(uint256) external pure returns (address, uint256, uint256) { return (address(0), 0, 0); }

    function tasarimOf(uint256) external view returns (address, address, uint64, uint64, bytes32, bytes32, bytes32, uint256) {
        return (address(0xdead), address(this), 0, 0, bytes32(0), bytes32(0), bytes32(0), 0);
    }

    function transferFrom(address, address to, uint256 id) external {
        sahip[id] = to;
        _dene(abi.encodeWithSignature("cek()"));
        _dene(abi.encodeWithSignature("cekFor(address)", address(this)));
        _dene(abi.encodeWithSignature("satinAl(uint256,uint256)", id, type(uint256).max));
        _dene(abi.encodeWithSignature("muzayedeKapat(uint256)", id));
        _dene(abi.encodeWithSignature("serbestBirak(uint256)", id));
        _dene(abi.encodeWithSignature("iadeEt(uint256)", id));
        _dene(abi.encodeWithSignature("teklifGeriCek(uint256)", uint256(1)));
    }

    function _dene(bytes memory veri) private {
        deneme++;
        (bool ok, bytes memory r) = pazar.call(veri);
        if (ok) basarili++;
        else if (r.length >= 4) sonHata = bytes4(r);
    }
}
