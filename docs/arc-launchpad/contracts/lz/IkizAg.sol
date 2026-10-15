// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ZincirTablosu } from "./ZincirTablosu.sol";

address constant OLU = 0x000000000000000000000000000000000000dEaD;

interface IAdliAg {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/// @title IkizAdapterAg — a launch token's lock on its home chain, wired to all eight other chains
/// @notice Second generation of IkizAdapter. The first one peered with one
///         chain and left DVN config on LayerZero's defaults; this one peers
///         with every chain in ZincirTablosu and writes two required DVNs on
///         every pathway itself, because a default can be LZDeadDVN.
///
///         Born owned by its factory, which calls `kur` in the same
///         transaction and is never the owner again: `kur` burns the
///         delegate and the ownership before it returns.
contract IkizAdapterAg is OFTAdapter {
    constructor(address token)
        OFTAdapter(token, ZincirTablosu.burasi().endpoint, address(this))
        Ownable(msg.sender)
    {}

    function kur(address ikiz) external onlyOwner {
        uint32 burada = ZincirTablosu.burasi().eid;
        for (uint256 i; i < ZincirTablosu.ADET; i++) {
            uint32 e = ZincirTablosu.sira(i).eid;
            if (e != burada) _setPeer(e, bytes32(uint256(uint160(ikiz))));
        }
        ZincirTablosu.dvnYaz(address(this));
        endpoint.setDelegate(OLU);
        _transferOwnership(address(0));
    }
}

/// @title IkizOFTAg — a launch token's twin, the same address on every chain
/// @notice Minted only against tokens locked by the home adapter; burned on
///         the way back. Twins also send to each other directly, so a holder
///         on Base can move to Monad without passing through the home chain.
///         Everything is fixed in the constructor: peers, DVNs, no owner.
contract IkizOFTAg is OFT {
    constructor(string memory ad, string memory sembol, uint32 evEid, address evAdapter)
        OFT(ad, sembol, ZincirTablosu.burasi().endpoint, address(this))
        Ownable(msg.sender)
    {
        uint32 burada = ZincirTablosu.burasi().eid;
        for (uint256 i; i < ZincirTablosu.ADET; i++) {
            uint32 e = ZincirTablosu.sira(i).eid;
            if (e == burada) continue;
            _setPeer(e, bytes32(uint256(uint160(e == evEid ? evAdapter : address(this)))));
        }
        ZincirTablosu.dvnYaz(address(this));
        endpoint.setDelegate(OLU);
        _transferOwnership(address(0));
    }
}

/// @title IkizOFTFabrikaAg — places a twin, at the same address on every chain
/// @notice No constructor arguments, so this factory itself sits at one
///         address on all nine chains (CREATE2 through the Arachnid factory),
///         and so does every twin it makes: the twin's init code is the same
///         everywhere — name, symbol, home eid, home adapter.
contract IkizOFTFabrikaAg {
    event KarsidaKuruldu(address indexed evToken, address ikiz, uint32 evEid, address evAdapter);

    function tuz(address evToken, uint32 evEid) public pure returns (bytes32) {
        return keccak256(abi.encode(evToken, evEid));
    }

    function ikizKodHash(string memory ad, string memory sembol, uint32 evEid, address evAdapter)
        public pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(type(IkizOFTAg).creationCode, abi.encode(ad, sembol, evEid, evAdapter)));
    }

    function ikizAdresi(address evToken, uint32 evEid, address evAdapter, string memory ad, string memory sembol)
        public view returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this),
            tuz(evToken, evEid), ikizKodHash(ad, sembol, evEid, evAdapter))))));
    }

    /// Anyone may call it; a wrong argument makes a twin at an address the
    /// real home adapter does not trust, so there is nothing to spoof.
    function karsidaKur(address evToken, uint32 evEid, address evAdapter, string calldata ad, string calldata sembol)
        external returns (address ikiz)
    {
        ikiz = address(new IkizOFTAg{ salt: tuz(evToken, evEid) }(ad, sembol, evEid, evAdapter));
        emit KarsidaKuruldu(evToken, ikiz, evEid, evAdapter);
    }
}

/// @title IkizFabrikaAg — gives any launch token its lock and its twin address
/// @notice Home-chain half. `evdeKur` creates the adapter, computes the twin's
///         address (identical on all eight other chains) and wires the
///         adapter to it, all in one call and with no key left anywhere.
///         Then `karsidaKur` on each other chain places the twin there.
contract IkizFabrikaAg {
    IkizOFTFabrikaAg public immutable ikizFabrika;

    event EvdeKuruldu(address indexed token, address adapter, address ikiz);

    constructor(IkizOFTFabrikaAg ikizFabrika_) { ikizFabrika = ikizFabrika_; }

    function adapterAdresi(address token) public view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(type(IkizAdapterAg).creationCode, abi.encode(token)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this),
            ikizFabrika.tuz(token, ZincirTablosu.burasi().eid), h)))));
    }

    function evdeKur(address token) external returns (address adapter, address ikiz) {
        uint32 burada = ZincirTablosu.burasi().eid;
        adapter = address(new IkizAdapterAg{ salt: ikizFabrika.tuz(token, burada) }(token));
        ikiz = ikizFabrika.ikizAdresi(token, burada, adapter, IAdliAg(token).name(), IAdliAg(token).symbol());
        IkizAdapterAg(adapter).kur(ikiz);
        emit EvdeKuruldu(token, adapter, ikiz);
    }
}
