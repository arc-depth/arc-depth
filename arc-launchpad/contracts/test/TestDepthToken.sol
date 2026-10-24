// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DepthToken} from "../DepthToken.sol";

contract DepthTutucu {
    function tasi(DepthToken t, address to, uint256 v) external { t.transfer(to, v); }
    function yak(DepthToken t, uint256 v) external { t.burn(v); }
    function onayla(DepthToken t, address s, uint256 v) external { t.approve(s, v); }
}

/// @title TestDepthToken
/// @notice The supply rules, asserted rather than described.
///
/// A fixed supply is only fixed if nothing can add to it and the
/// distribution adds up. Both of those are checked here; the absence of a
/// mint function is checked against the compiled ABI in the runner, because
/// that is a claim about what is *not* in the contract and no call can
/// prove it.
contract TestDepthToken {
    uint256 constant ARZ = 1_000_000_000 ether;
    uint256 constant EGRI = 500_000_000 ether;     // the market slice
    uint256 constant STAKE = 400_000_000 ether;    // thirty years of emission
    uint256 constant KURUCU = 50_000_000 ether;
    uint256 constant VEST = 50_000_000 ether;

    address constant A_EGRI = address(uint160(0xE671));
    address constant A_STAKE = address(uint160(0x57A1));
    address constant A_KURUCU = address(uint160(0x6056));
    address constant A_VEST = address(uint160(0x7E57));

    function _kur() internal returns (DepthToken) {
        return new DepthToken(ARZ, A_EGRI, EGRI, A_STAKE, STAKE, A_KURUCU, KURUCU, A_VEST, VEST);
    }

    struct Dagitim {
        uint256 arz;
        uint256 egri;
        uint256 stake;
        uint256 kurucu;
        uint256 vesting;
        uint256 kontratta;
        bool eksikToplamRed;
        bool fazlaToplamRed;
        bool sifirAdresRed;
        bool egriSifirRed;
    }

    /// Genesis places everything, and a split that does not add up is
    /// refused — tokens silently stuck in the token contract would be
    /// supply nobody could account for.
    function runDagitim() external returns (Dagitim memory d) {
        DepthToken t = _kur();
        d.arz = t.totalSupply();
        d.egri = t.balanceOf(A_EGRI);
        d.stake = t.balanceOf(A_STAKE);
        d.kurucu = t.balanceOf(A_KURUCU);
        d.vesting = t.balanceOf(A_VEST);
        d.kontratta = t.balanceOf(address(t));

        try new DepthToken(ARZ, A_EGRI, EGRI - 1 ether, A_STAKE, STAKE, A_KURUCU, KURUCU, A_VEST, VEST) {
            d.eksikToplamRed = false;
        } catch { d.eksikToplamRed = true; }

        try new DepthToken(ARZ, A_EGRI, EGRI + 1 ether, A_STAKE, STAKE, A_KURUCU, KURUCU, A_VEST, VEST) {
            d.fazlaToplamRed = false;
        } catch { d.fazlaToplamRed = true; }

        try new DepthToken(ARZ, address(0), EGRI, A_STAKE, STAKE, A_KURUCU, KURUCU, A_VEST, VEST) {
            d.sifirAdresRed = false;
        } catch { d.sifirAdresRed = true; }

        /* A curve with no tokens could never sell any, so the launch would
           be dead on arrival in the most literal way. */
        try new DepthToken(ARZ, A_EGRI, 0, A_STAKE, STAKE, A_KURUCU, KURUCU + EGRI, A_VEST, VEST) {
            d.egriSifirRed = false;
        } catch { d.egriSifirRed = true; }
    }

    struct Yakma {
        uint256 arzOnce;
        uint256 arzSonra;
        uint256 bakiyeSonra;
        bool baskasininiYakamaz;
        bool fazlasiniYakamaz;
    }

    /// Burning lowers supply for good, and only your own. 55,555,556 is
    /// what the curve actually burns at graduation under this allocation.
    function runYakma() external returns (Yakma memory y) {
        DepthToken t = new DepthToken(ARZ, address(this), EGRI, A_STAKE, STAKE, A_KURUCU, KURUCU, A_VEST, VEST);
        y.arzOnce = t.totalSupply();

        t.burn(55_555_556 ether);
        y.arzSonra = t.totalSupply();
        y.bakiyeSonra = t.balanceOf(address(this));

        /* There is no function that takes an address, so the only way to
           ask is to try burning more than you hold. */
        DepthTutucu bos = new DepthTutucu();
        try bos.yak(t, 1) { y.baskasininiYakamaz = false; } catch { y.baskasininiYakamaz = true; }

        try t.burn(EGRI) { y.fazlasiniYakamaz = false; } catch { y.fazlasiniYakamaz = true; }
    }

    struct Transfer {
        uint256 gonderilen;
        uint256 varan;
        uint256 arzDegismedi;
        bool sifiraGonderimRed;
        bool izinsizCekimRed;
        uint256 izinliCekim;
    }

    /// Transfer must move exactly what it was told to move. A token that
    /// takes a cut breaks Uniswap v4 accounting, so this is mechanical and
    /// not a matter of taste.
    function runTransfer() external returns (Transfer memory r) {
        DepthToken t = new DepthToken(ARZ, address(this), EGRI, A_STAKE, STAKE, A_KURUCU, KURUCU, A_VEST, VEST);
        DepthTutucu alici = new DepthTutucu();

        r.gonderilen = 1234 ether;
        uint256 arzOnce = t.totalSupply();
        t.transfer(address(alici), r.gonderilen);
        r.varan = t.balanceOf(address(alici));
        r.arzDegismedi = t.totalSupply() == arzOnce ? 1 : 0;

        try t.transfer(address(0), 1) { r.sifiraGonderimRed = false; }
        catch { r.sifiraGonderimRed = true; }

        /* Pulling without an allowance must fail; with one, it must move
           exactly the allowed amount. */
        try t.transferFrom(address(alici), address(this), 1) { r.izinsizCekimRed = false; }
        catch { r.izinsizCekimRed = true; }

        alici.onayla(t, address(this), 500 ether);
        t.transferFrom(address(alici), address(this), 500 ether);
        r.izinliCekim = 500 ether - t.allowance(address(alici), address(this));
    }
}
