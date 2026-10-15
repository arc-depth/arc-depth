// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CrossChainAssetRegistry} from "../CrossChainAssetRegistry.sol";
import {CrossChainAccounting} from "../CrossChainAccounting.sol";
import {KopruKasasi2, IKasaFabrika2, IYakilabilirK3} from "./KopruKasasi2.sol";
import {CrossChainCollateralManager2, IKopruKasasi2} from "./CrossChainCollateralManager2.sol";

/// @title YoneticiFabrika2 — builds a token's manager (second generation)
/// Same shape as YoneticiFabrika: no authority, nothing kept. A manager
/// built for a vault that does not name it back is inert.
contract YoneticiFabrika2 {
    event YoneticiKuruldu(address indexed kasa, address yonetici);

    function kur(CrossChainAccounting defter, CrossChainAssetRegistry kayit, address kasa)
        external
        returns (address yonetici)
    {
        yonetici = address(new CrossChainCollateralManager2(defter, kayit, IKopruKasasi2(kasa), kasa));
        emit YoneticiKuruldu(kasa, yonetici);
    }
}

/// @title KasaFabrika2 — builds a token's vault at an address the far side
///        can compute
///
/// WHAT CHANGED FROM KasaFabrika
///   - CREATE2, salt keccak256(tokenId), argument-free creation code: the
///     vault's address is a pure function of this factory, the id and one
///     hash, so a remote vault on another chain names it as the only home
///     its money may return to (RemoteVaultFactory2.evKasasi).
///   - Only the launchpad may build. The first generation was open to
///     anyone because a stray vault was harmless; with a derivable address
///     a stray vault would OCCUPY the address the far side trusts, so the
///     one caller is fixed at construction (the launchpad's address is
///     known before it exists: the deployment uses fixed nonces).
///   - The launch's chosen conversion target (domain + asset) is carried
///     into the vault, where it is immutable.
contract KasaFabrika2 is IKasaFabrika2 {
    YoneticiFabrika2 public immutable yoneticiFabrika;
    address public immutable launchpad;

    mapping(uint256 => address) public kasaOf;
    mapping(uint256 => address) public yoneticiOf;
    uint256 public sayi;

    Parametre private _bekleyen;
    bool private _kuruluyor;

    error ZatenVar(uint256 tokenId);
    error KotuKurulum();
    error SadeceLaunchpad();

    event KasaKuruldu(uint256 indexed tokenId, address kasa, address yonetici, address defter, address token,
                      uint32 hedefDomain, address hedefVarlik);

    constructor(YoneticiFabrika2 _yoneticiFabrika, address _launchpad) {
        if (address(_yoneticiFabrika) == address(0) || _launchpad == address(0)) revert KotuKurulum();
        yoneticiFabrika = _yoneticiFabrika;
        launchpad = _launchpad;
    }

    /// What the vault under construction reads. Outside a construction it
    /// reverts, so the slot is not a general oracle.
    function bekleyen() external view returns (Parametre memory) {
        if (!_kuruluyor) revert KotuKurulum();
        return _bekleyen;
    }

    /// The hash a remote factory needs (RemoteVaultFactory2.evKasaInitHash).
    function kasaInitHash() public pure returns (bytes32) {
        return keccak256(type(KopruKasasi2).creationCode);
    }

    function kasaAdresi(uint256 tokenId) external view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(this), keccak256(abi.encode(tokenId)), kasaInitHash()
        )))));
    }

    function kur(
        CrossChainAssetRegistry kayit,
        address quote,
        uint256 tokenId,
        address tokenMessenger,
        address mesajTasiyici,
        IYakilabilirK3 token,
        address egri,
        address acici,
        uint32 hedefDomain,
        address hedefVarlik
    ) external returns (address kasa, address yonetici) {
        if (msg.sender != launchpad) revert SadeceLaunchpad();
        if (kasaOf[tokenId] != address(0)) revert ZatenVar(tokenId);

        _bekleyen = Parametre(kayit, quote, tokenId, tokenMessenger, mesajTasiyici, token, egri, acici,
                              hedefDomain, hedefVarlik);
        _kuruluyor = true;
        KopruKasasi2 k = new KopruKasasi2{salt: keccak256(abi.encode(tokenId))}();
        _kuruluyor = false;
        delete _bekleyen;

        yonetici = yoneticiFabrika.kur(k.defter(), kayit, address(k));
        k.yoneticiyiAyarla(yonetici);

        kasa = address(k);
        kasaOf[tokenId] = kasa;
        yoneticiOf[tokenId] = yonetici;
        sayi++;
        emit KasaKuruldu(tokenId, kasa, yonetici, address(k.defter()), address(token), hedefDomain, hedefVarlik);
    }
}
