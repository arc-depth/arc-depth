// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ZincirTablosu } from "./ZincirTablosu.sol";
import { IkizFabrikaAg, IkizOFTFabrikaAg } from "./IkizAg.sol";

interface IAdliY {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/// @title IkizYayici — one call makes a launch token exist on every chain
/// @notice A token launched on any of the nine chains gets, from a single
///         transaction on its home chain:
///           - its lock adapter here (IkizFabrikaAg.evdeKur), already wired
///             to the twin address and to two required DVNs on every pathway
///           - a LayerZero message to this same contract on each chosen
///             chain, which places the twin there (IkizOFTFabrikaAg)
///         The twin has the same address on all eight other chains, so a
///         wallet, an explorer or the site can find it without a registry.
///
///         Permissionless: anyone may spread any token — the founder at
///         launch, the site's keeper afterwards, a holder who wants it on
///         one more chain. It cannot be abused into anything: the twin's
///         address is fixed by the home token, its name and symbol and its
///         home adapter, so a message carrying anything else creates a twin
///         nobody's adapter trusts, and nothing is created twice (CREATE2).
///         The caller pays LayerZero; any excess is refunded.
///
/// @dev One address on all nine chains (constructor takes only the twin
///      factory, identical everywhere); peers are itself, DVNs set in the
///      constructor, no owner.
contract IkizYayici is OApp {
    IkizFabrikaAg public immutable ikizFabrika;

    event Yayildi(address indexed token, address adapter, address ikiz, uint32[] hedefler);
    event IkizKuruldu(address indexed evToken, uint32 evEid, address ikiz);
    error UcretYetersiz(uint256 gerekli, uint256 verilen);
    error IadeOlmadi();

    constructor(IkizFabrikaAg ikizFabrika_)
        OApp(ZincirTablosu.burasi().endpoint, address(this))
        Ownable(msg.sender)
    {
        ikizFabrika = ikizFabrika_;
        uint32 burada = ZincirTablosu.burasi().eid;
        for (uint256 i; i < ZincirTablosu.ADET; i++) {
            uint32 e = ZincirTablosu.sira(i).eid;
            if (e != burada) _setPeer(e, bytes32(uint256(uint160(address(this)))));
        }
        ZincirTablosu.dvnYaz(address(this));
        endpoint.setDelegate(0x000000000000000000000000000000000000dEaD);
        _transferOwnership(address(0));
    }

    function _mesaj(address token, address adapter) private view returns (bytes memory) {
        return abi.encode(token, IAdliY(token).name(), IAdliY(token).symbol(), ZincirTablosu.burasi().eid, adapter);
    }

    /// The home adapter of `token` here: existing, or about to be created.
    function adapterAdresi(address token) public view returns (address) {
        return ikizFabrika.adapterAdresi(token);
    }

    /// The twin's address on every other chain.
    function ikizAdresi(address token) public view returns (address) {
        return ikizFabrika.ikizFabrika().ikizAdresi(token, ZincirTablosu.burasi().eid, adapterAdresi(token),
            IAdliY(token).name(), IAdliY(token).symbol());
    }

    /// Total LayerZero fee to reach `hedefler`, with `secenekler` per message.
    function ucret(address token, uint32[] calldata hedefler, bytes calldata secenekler) public view returns (uint256 toplam) {
        bytes memory m = _mesaj(token, adapterAdresi(token));
        for (uint256 i; i < hedefler.length; i++) toplam += _quote(hedefler[i], m, secenekler, false).nativeFee;
    }

    /// Create (if needed) the home adapter, then ask each chain in
    /// `hedefler` to place the twin. `secenekler` must give lzReceive enough
    /// gas for a twin deployment (~3.5M).
    function yay(address token, uint32[] calldata hedefler, bytes calldata secenekler) external payable {
        address adapter = adapterAdresi(token);
        address ikiz;
        if (adapter.code.length == 0) {
            (adapter, ikiz) = ikizFabrika.evdeKur(token);
        } else {
            ikiz = ikizAdresi(token);
        }
        bytes memory m = _mesaj(token, adapter);
        uint256 kalan = msg.value;
        for (uint256 i; i < hedefler.length; i++) {
            MessagingFee memory f = _quote(hedefler[i], m, secenekler, false);
            if (kalan < f.nativeFee) revert UcretYetersiz(f.nativeFee, kalan);
            kalan -= f.nativeFee;
            _lzSend(hedefler[i], m, secenekler, f, payable(msg.sender));
        }
        if (kalan > 0) {
            (bool ok,) = payable(msg.sender).call{ value: kalan }("");
            if (!ok) revert IadeOlmadi();
        }
        emit Yayildi(token, adapter, ikiz, hedefler);
    }

    /// OApp pays each send out of msg.value; the loop above passes each
    /// message its own share instead of the whole value.
    function _payNative(uint256 nativeFee) internal pure override returns (uint256) {
        return nativeFee;
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata m, address, bytes calldata) internal override {
        (address evToken, string memory ad, string memory sembol, uint32 evEid, address evAdapter) =
            abi.decode(m, (address, string, string, uint32, address));
        IkizOFTFabrikaAg ofab = ikizFabrika.ikizFabrika();
        address ikiz = ofab.ikizAdresi(evToken, evEid, evAdapter, ad, sembol);
        /* already here — a second message is harmless */
        if (ikiz.code.length == 0) ofab.karsidaKur(evToken, evEid, evAdapter, ad, sembol);
        emit IkizKuruldu(evToken, evEid, ikiz);
    }
}
