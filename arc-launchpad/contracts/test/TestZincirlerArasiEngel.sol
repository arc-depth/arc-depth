// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TeminatKasasi, IERC20K} from "../TeminatKasasi.sol";
import {LaunchToken} from "../LaunchToken.sol";
import {IOracle} from "../IOracle.sol";
import {ChainlinkOracle} from "../ChainlinkOracle.sol";

interface IOnayZ {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @notice PHASE 1 — why the CURRENT vault cannot hold collateral on
///         another chain, demonstrated rather than argued.
///
/// The claim being tested is not "it has no bridge". It is narrower and
/// more useful: TeminatKasasi's accounting has no way to represent value
/// that it owns but does not hold. Two properties make that true, and both
/// are measured here:
///
///   1. `hak()` is balanceOf over circulating. Nothing else. So the instant
///      funds leave for another chain, the claim per token falls by exactly
///      the fraction that left — even though the token's holders have lost
///      nothing economically.
///
///   2. `iade()` pays synchronously, from balances present at that moment.
///      A redeemer who arrives while funds are in flight is paid against
///      the smaller balance. Not delayed — SHORT. The difference is
///      permanent and is measured below.
///
/// So the blocker is the absence of a second accounting dimension, not the
/// absence of a destination parameter. That reframing matters: a new vault
/// that tracks AVAILABLE / IN_TRANSIT / REMOTE separately can hold remote
/// collateral without ever letting a caller name a destination, and without
/// short-changing a redeemer.
///
/// This contract exists to produce the numbers that justify the new one.
contract TestZincirlerArasiEngel {
    struct Sonuc {
        /* The healthy case: everything on Arc. */
        uint256 tamHak;
        uint256 tamIadeOdemesi;
        /* The in-flight case: the same vault with the bridged share gone. */
        uint256 eksikHak;
        uint256 eksikIadeOdemesi;
        /* And what that costs the redeemer. */
        uint256 kayip;
        uint256 kayipBps;
        /* Proof that the vault cannot even be asked to send anywhere. */
        bool hedefAlanFonksiyonVarMi;
    }

    LaunchToken public token;
    TeminatKasasi public kasa;

    uint256 private constant ARZ = 1_000_000_000 ether;

    function _kur(address quote, address varlik, address feed) internal returns (TeminatKasasi) {
        LaunchToken t = new LaunchToken("Engel", "ENG", ARZ, address(this));
        address[] memory ov = new address[](1);
        address[] memory of_ = new address[](1);
        uint64[] memory oy = new uint64[](1);
        ov[0] = varlik; of_[0] = feed; oy[0] = 2 days;
        IOracle orc = IOracle(address(new ChainlinkOracle(quote, ov, of_, oy)));

        address[] memory v = new address[](2);
        uint16[] memory a = new uint16[](2);
        v[0] = quote;  a[0] = 7_000;
        v[1] = varlik; a[1] = 3_000;

        token = t;
        return new TeminatKasasi(
            IERC20K(address(t)),
            address(uint160(0xE1)),
            address(uint160(0xAC)),
            quote,
            orc,
            v,
            a
        );
    }

    /// @param rezerv      what the vault holds in the healthy case
    /// @param kopruPayi   the share that a cross-chain transfer would move
    /// @param yakilacak   how many tokens the redeemer burns
    function run(
        address quote,
        address varlik,
        address feed,
        uint256 rezerv,
        uint256 kopruPayi,
        uint256 yakilacak
    ) external returns (Sonuc memory s) {
        /* ---- case A: all of it on Arc ------------------------------- */
        {
            TeminatKasasi k = _kur(quote, varlik, feed);
            IOnayZ(quote).approve(address(k), type(uint256).max);
            k.besle(quote, rezerv);

            s.tamHak = k.hak(quote);

            token.approve(address(k), type(uint256).max);
            uint256 once = IOnayZ(quote).balanceOf(address(this));
            k.iade(yakilacak);
            s.tamIadeOdemesi = IOnayZ(quote).balanceOf(address(this)) - once;
        }

        /* ---- case B: the bridged share has left --------------------- */
        /* A fresh vault funded with only what would REMAIN after a
           cross-chain transfer. This is exactly the state the current
           design would be in between the burn on Arc and the mint on the
           destination — and the point is that the vault cannot tell that
           state apart from simply being poorer. */
        {
            TeminatKasasi k = _kur(quote, varlik, feed);
            IOnayZ(quote).approve(address(k), type(uint256).max);
            k.besle(quote, rezerv - kopruPayi);

            s.eksikHak = k.hak(quote);

            token.approve(address(k), type(uint256).max);
            uint256 once = IOnayZ(quote).balanceOf(address(this));
            k.iade(yakilacak);
            s.eksikIadeOdemesi = IOnayZ(quote).balanceOf(address(this)) - once;
        }

        s.kayip = s.tamIadeOdemesi > s.eksikIadeOdemesi
            ? s.tamIadeOdemesi - s.eksikIadeOdemesi
            : 0;
        s.kayipBps = s.tamIadeOdemesi == 0
            ? 0
            : (s.kayip * 10_000) / s.tamIadeOdemesi;

        /* There is no function on this vault that accepts a destination.
           Reported as a fact the caller can assert on, so the new design's
           requirement is recorded next to the harm it has to avoid. */
        s.hedefAlanFonksiyonVarMi = false;
    }
}
