// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

interface IAdli {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

address constant DEAD = 0x000000000000000000000000000000000000dEaD;

/// @title IkizAdapter — a launch token's home-chain end
/// @notice Locks the token here while its twin exists on the other chain.
///         Born owned by the factory, which sets the one peer and renounces
///         in the same transaction; the endpoint delegate is 0xdead from
///         construction. Nobody can rewire it afterwards.
///
/// @dev Locked tokens stay inside the vault's `dolasim()` on purpose: they
///      are not unsold inventory, they are held by people on the other
///      chain, who redeem by bringing them back. Excluding them would raise
///      every home-chain holder's claim with money that belongs to the
///      remote holders.
contract IkizAdapter is OFTAdapter {
    constructor(address token, address lzEndpoint)
        OFTAdapter(token, lzEndpoint, DEAD)
        Ownable(msg.sender)
    {}
}

/// @title IkizOFT — a launch token's twin on the other chain
/// @notice Zero supply at birth; minted only by a message from the home
///         adapter, burned on the way back. The peer is fixed in the
///         constructor and the owner is gone before construction ends.
contract IkizOFT is OFT {
    constructor(string memory ad, string memory sembol, uint32 evEid, address evAdapter)
        OFT(ad, sembol, IkizOFTFabrika(msg.sender).endpoint(), DEAD)
        Ownable(msg.sender)
    {
        _setPeer(evEid, bytes32(uint256(uint160(evAdapter))));
        _transferOwnership(address(0));
    }
}

/// @title IkizOFTFabrika — deploys a launch token's twin on the other chain
/// @notice One of two factories, split so that neither carries both
///         contracts' creation code: together they came to 24,466 bytes,
///         110 short of the deploy limit. Constructor argument: the
///         LayerZero endpoint only, which has the same address on Arc and
///         Robinhood, so this factory lands at the same address on both.
///
///         `evAdapter` is supplied by the caller and is part of the twin's
///         init code, so a wrong value — like a wrong name — produces a twin
///         at an address the real home adapter does not trust. There is
///         nothing to check and nothing to spoof.
contract IkizOFTFabrika {
    address public immutable endpoint;

    event KarsidaKuruldu(address indexed evToken, address ikiz, uint32 evEid, address evAdapter);
    error KotuKurulum();

    constructor(address lzEndpoint) {
        if (lzEndpoint == address(0)) revert KotuKurulum();
        endpoint = lzEndpoint;
    }

    function tuz(address evToken, uint32 evEid) public pure returns (bytes32) {
        return keccak256(abi.encode(evToken, evEid));
    }

    function ikizKodHash(string memory ad, string memory sembol, uint32 evEid, address evAdapter)
        public pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(type(IkizOFT).creationCode, abi.encode(ad, sembol, evEid, evAdapter)));
    }

    function karsidaKur(address evToken, uint32 evEid, address evAdapter, string calldata ad, string calldata sembol)
        external returns (address ikizToken)
    {
        ikizToken = address(new IkizOFT{ salt: tuz(evToken, evEid) }(ad, sembol, evEid, evAdapter));
        emit KarsidaKuruldu(evToken, ikizToken, evEid, evAdapter);
    }
}

/// @title IkizFabrika — gives any launch token a twin on the other chain
/// @notice The home-chain half. Deployed at the SAME address on Arc and
///         Robinhood (same bytecode, same arguments: the endpoint and the
///         twin factory, both identical on the two chains). That lets it
///         compute the twin's address before the twin exists, so the
///         adapter is wired at birth and nobody ever holds a key to it.
///
///         Permissionless and needs no launchpad change: the deployed
///         PulseLaunchpad stays exactly as it is.
///
///         Order: `evdeKur` on the home chain, then `karsidaKur` on the
///         other chain's IkizOFTFabrika with the adapter address this
///         returns. Until the twin exists a send is undeliverable and
///         LayerZero holds it.
contract IkizFabrika {
    address public immutable endpoint;
    IkizOFTFabrika public immutable ikizFabrika;

    event EvdeKuruldu(address indexed token, address adapter, uint32 karsiEid, address beklenenIkiz);
    error KotuKurulum();

    constructor(address lzEndpoint, IkizOFTFabrika ikizFabrika_) {
        if (lzEndpoint == address(0) || address(ikizFabrika_) == address(0)) revert KotuKurulum();
        endpoint = lzEndpoint;
        ikizFabrika = ikizFabrika_;
    }

    function _adres(address fabrika, bytes32 t, bytes32 kodHash) private pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), fabrika, t, kodHash)))));
    }

    function adapterAdresi(address evToken, uint32 evEid) public view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(type(IkizAdapter).creationCode, abi.encode(evToken, endpoint)));
        return _adres(address(this), ikizFabrika.tuz(evToken, evEid), h);
    }

    function ikizAdresi(address evToken, uint32 evEid, address evAdapter) public view returns (address) {
        bytes32 h = ikizFabrika.ikizKodHash(IAdli(evToken).name(), IAdli(evToken).symbol(), evEid, evAdapter);
        return _adres(address(ikizFabrika), ikizFabrika.tuz(evToken, evEid), h);
    }

    /// Home chain: lock-side adapter for `token`, already pointing at its
    /// twin on `karsiEid`. `evEid` is THIS chain's endpoint id.
    function evdeKur(address token, uint32 evEid, uint32 karsiEid) external returns (address adapter) {
        adapter = address(new IkizAdapter{ salt: ikizFabrika.tuz(token, evEid) }(token, endpoint));
        address beklenen = ikizAdresi(token, evEid, adapter);
        IkizAdapter(adapter).setPeer(karsiEid, bytes32(uint256(uint160(beklenen))));
        IkizAdapter(adapter).renounceOwnership();
        emit EvdeKuruldu(token, adapter, karsiEid, beklenen);
    }
}
