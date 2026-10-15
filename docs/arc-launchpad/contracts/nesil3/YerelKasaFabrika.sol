// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TeminatKasasi, IERC20K} from "../TeminatKasasi.sol";
import {IOracle} from "../IOracle.sol";

/// @title FiyatsizOracle — the oracle a single-collateral vault never reads
///
/// TeminatKasasi requires an oracle, and reads it only for assets with a
/// non-zero weight (conversion targets) and for the buyback's display. In a
/// local-collateral launch the pasted token is bought once, at launch, with
/// the founder's own deposit; it is held at weight zero and never converted
/// into again, so no price for it is ever needed — and a pool price that
/// anyone could move in a block would be worse than none.
contract FiyatsizOracle is IOracle {
    function deger(address, uint256) external pure returns (uint256) { return 0; }
    function degerlenebilir(address) external pure returns (bool) { return false; }
}

/// @title YerelKasaFabrika — builds a launch's vault around the token its
///        founder pasted
///
/// The vault is the audited TeminatKasasi, unchanged:
///   basket   [this chain's dollar, the pasted token]
///   weights  [10_000, 0]
/// so trading taxes stay dollars (the dollar is the only conversion target
/// and converting into itself is refused), the pasted token is held, and a
/// redemption pays a pro-rata share of BOTH. If the founder chooses the
/// dollar itself, the basket is the dollar alone.
///
/// Only the launchpad builds, fixed at construction.
contract YerelKasaFabrika {
    address public immutable launchpad;
    IOracle public immutable oracle;

    error SadeceLaunchpad();
    event KasaKuruldu(address indexed token, address kasa, address teminatVarlik);

    constructor(address _launchpad) {
        launchpad = _launchpad;
        oracle = new FiyatsizOracle();
    }

    function kur(address token, address egri, address acici, address quote, address varlik)
        external
        returns (address kasa)
    {
        if (msg.sender != launchpad) revert SadeceLaunchpad();
        address[] memory v;
        uint16[] memory a;
        if (varlik == quote) {
            v = new address[](1); a = new uint16[](1);
            v[0] = quote; a[0] = 10_000;
        } else {
            v = new address[](2); a = new uint16[](2);
            v[0] = quote; a[0] = 10_000;
            v[1] = varlik; a[1] = 0;
        }
        kasa = address(new TeminatKasasi(IERC20K(token), egri, acici, quote, oracle, v, a));
        emit KasaKuruldu(token, kasa, varlik);
    }
}
