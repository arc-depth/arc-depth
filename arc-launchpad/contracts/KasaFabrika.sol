// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CrossChainAssetRegistry} from "./CrossChainAssetRegistry.sol";
import {KopruKasasi, IYakilabilirK} from "./KopruKasasi.sol";
import {YoneticiFabrika} from "./YoneticiFabrika.sol";

/// @title KasaFabrika — builds a launch's vault and wires it to its manager
///
/// WHY THIS EXISTS AT ALL
///   EgriLaunchpad used to deploy the vault inline, and its comment gave
///   the reason: the basket array would otherwise have to be plumbed
///   through another contract. KopruKasasi takes no basket, so that reason
///   is gone — and a measurement replaced it with the opposite one.
///
///   Measured before changing anything: swapping TeminatKasasi for
///   KopruKasasi inline takes EgriLaunchpad from 18,615 bytes to 24,784.
///   EIP-170's limit is 24,576. The launchpad would have been 208 bytes too
///   large to deploy, and the only symptom would have been one compile
///   warning among eleven.
///
/// WHY THE MANAGER COMES FROM ANOTHER FACTORY
///   Holding both pieces of creation code here measured 23,007 bytes — 94%
///   of the limit. Not over it, which is precisely when it is cheap to fix.
///   The manager moved to YoneticiFabrika and this contract dropped to a
///   size with room in it.
///
/// WHY THE MANAGER IS WIRED IN THE SAME TRANSACTION
///   KopruKasasi.yoneticiyiAyarla is callable only by whoever constructed
///   the vault, which is this factory, and only once. Two ways to handle
///   that:
///
///     a) keep a setter here and call it later
///     b) wire it during `kur` and never need one
///
///   (b), because (a) leaves a standing authority over every vault this
///   factory ever made, and whoever held it could point a vault's
///   cross-chain transitions at a manager of their own — which is how a
///   ledger gets told that money is REMOTE when it is not, inflating the
///   claim. After `kur` returns this factory has no power over anything it
///   built: no owner, no setter, no way back in.
///
/// WHY THE VAULT WORKS WITH NO REMOTE CHAIN SET UP
///   KopruKasasi is a complete vault on its own: redemption with its queue,
///   the buyback floor, the three-bucket ledger. Bridging is an extra
///   capability, not a dependency. And the remote vault's address is
///   COMPUTED — CREATE2(factory, keccak256(tokenId), initCodeHash) — so the
///   far side can be deployed later at an address Arc already knows.
///   Nothing here waits on another chain.
contract KasaFabrika {
    /// The manager's factory. Immutable: a settable one would be a way to
    /// substitute what every future vault gets wired to.
    YoneticiFabrika public immutable yoneticiFabrika;

    /// Every vault this factory has built, by the launch id it belongs to.
    /// Not authority — a record, so a deployment can be audited without
    /// replaying the launch transaction.
    mapping(uint256 => address) public kasaOf;
    mapping(uint256 => address) public yoneticiOf;
    uint256 public sayi;

    error ZatenVar(uint256 tokenId);
    error KotuKurulum();

    event KasaKuruldu(
        uint256 indexed tokenId,
        address kasa,
        address yonetici,
        address defter,
        address token
    );

    constructor(YoneticiFabrika _yoneticiFabrika) {
        if (address(_yoneticiFabrika) == address(0)) revert KotuKurulum();
        yoneticiFabrika = _yoneticiFabrika;
    }

    /// Build `tokenId`'s vault, its manager, and the one link between them.
    ///
    /// Permissionless by omission rather than by design: there is nothing
    /// here to protect. The caller supplies the token's own addresses, and a
    /// caller who supplies someone else's gets a vault that holds nothing
    /// and that no launch points at. The launchpad is the only party with a
    /// reason to call it.
    function kur(
        CrossChainAssetRegistry kayit,
        address quote,
        uint256 tokenId,
        address tokenMessenger,
        address mesajTasiyici,
        IYakilabilirK token,
        address egri,
        address acici
    ) external returns (address kasa, address yonetici) {
        if (kasaOf[tokenId] != address(0)) revert ZatenVar(tokenId);
        if (address(kayit) == address(0) || quote == address(0)) revert KotuKurulum();

        KopruKasasi k = new KopruKasasi(
            kayit, quote, tokenId, tokenMessenger, mesajTasiyici, token, egri, acici
        );

        /* The manager needs the vault's ledger and the vault; the vault
           needs the manager. The circle closes here, in one transaction,
           which is the only moment this factory has the authority to close
           it. */
        yonetici = yoneticiFabrika.kur(k.defter(), kayit, address(k));
        k.yoneticiyiAyarla(yonetici);

        kasa = address(k);
        kasaOf[tokenId] = kasa;
        yoneticiOf[tokenId] = yonetici;
        sayi++;

        emit KasaKuruldu(tokenId, kasa, yonetici, address(k.defter()), address(token));
    }
}
