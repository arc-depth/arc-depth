// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CrossChainAccounting} from "./CrossChainAccounting.sol";
import {CrossChainAssetRegistry} from "./CrossChainAssetRegistry.sol";
import {CrossChainCollateralManager, IKopruKasasi} from "./CrossChainCollateralManager.sol";

/// @title YoneticiFabrika — builds the cross-chain manager, nothing else
///
/// WHY A SEPARATE FACTORY FOR ONE `new`
///   Because one factory holding both pieces of creation code came to
///   23,007 bytes — 94% of EIP-170. Measured, not estimated. The limit was
///   not crossed, which is exactly the situation in which it is cheapest to
///   fix: the next feature is what crosses it, and by then the fix costs a
///   redeployment.
///
///   Split, the two are 15,079 and 8,000-odd bytes. Neither is near
///   anything.
///
/// IT HAS NO AUTHORITY AND KEEPS NONE
///   No owner, no setter, no record it can act on. Anybody may call `kur`,
///   and a manager built for a vault that does not name it back is inert —
///   KopruKasasi accepts exactly one manager and only from the factory that
///   built it. So a hostile caller can spend gas creating a contract nobody
///   will ever point at, and nothing else.
contract YoneticiFabrika {
    event YoneticiKuruldu(address indexed kasa, address yonetici);

    function kur(
        CrossChainAccounting defter,
        CrossChainAssetRegistry kayit,
        address kasa
    ) external returns (address yonetici) {
        /* `raporlayici` is the vault itself: CCTP delivers the mint to
           whoever holds the money, and the vault relays what it received.
           Naming anything else here would mean trusting a third party to
           say what arrived. */
        CrossChainCollateralManager y = new CrossChainCollateralManager(
            defter, kayit, IKopruKasasi(kasa), kasa
        );
        yonetici = address(y);
        emit YoneticiKuruldu(kasa, yonetici);
    }
}
