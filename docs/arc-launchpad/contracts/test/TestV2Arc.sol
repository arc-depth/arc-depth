// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { MerkezKapi } from "../merkez/MerkezKapi.sol";
import { SepetDefteri } from "../sepet/SepetDefteri.sol";
import { SepetUcu } from "../sepet/SepetUcu.sol";
import { IERC20S } from "../sepet/IHaberci.sol";

interface IJetonV2 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function totalSupply() external view returns (uint256);
}

/// One eth_call on Arc mainnet against the second generation AS DEPLOYED
/// (scripts/denetim-v2-arc.js): the real MerkezKapi, PulseLaunchpad5 with the
/// ladder without end, PulseHook5, SepetUcu, Defter v2 and HaberciLZ. The only
/// thing not yet on the chain, the Defter's Arc binding (written by
/// `dagit-v2.js bagla`), is given by state override. This contract plays
/// relay.link's executor and the buyers, holding dollars by state override.
///   A launch through the gate; two buys far beyond what the old 2x ladder
///   held (~$4.800); everything sold back on Arc; a redemption burning
///   through SepetUcu and paying the waiting basket dollars.
contract TestV2Arc {
    IERC20S constant USDC = IERC20S(0x3600000000000000000000000000000000000000);
    address constant FTHM = 0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE;
    uint32 constant ARC = 26;

    struct Sonuc {
        address token; uint256 kurucuToken; uint256 havuzToken0;
        uint256 alim1; uint256 alim2; uint256 havuzToken2;
        uint256 satilan; uint256 satisDolar; uint256 konan;
        uint256 bekleyenOnce; uint256 itfaDolar; uint256 arzSonra;
        uint256 kapiDolar;
    }

    function _b(address a) internal pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    address public sonToken;
    uint256 public sonKurucuToken;
    uint256 public sonHavuzToken;

    /// Block 1: the launch. Its trades come in a later block, past the 5-second snipe window.
    function kur(MerkezKapi kapi, address pm) external returns (address token) {
        USDC.approve(address(kapi), type(uint256).max);

        /* a launch: $100 first buy, $20 of FTHM on Arc (waits in the Defter until $50) */
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](1);
        k[0] = SepetDefteri.Kalem(ARC, _b(FTHM), 20e6);
        uint256[] memory teklif = new uint256[](1);
        teklif[0] = 1_300_000e18;
        string[] memory tipler = new string[](1);
        MerkezKapi.LaunchIstegi memory r = MerkezKapi.LaunchIstegi({
            ad: "Sonsuz Prova", sembol: "SPRV", sepet: k, teklif: teklif, vergiPpm: 20_000, alim: 100e6,
            kurucu: _b(address(this)), kurucuZincir: ARC, kurucuEid: 0, ikizler: new uint32[](0), ikizSecenek: "",
            ikizUcret: 0, gonderSecenek: "", iade: address(this), tipler: tipler, uzakIkizler: new uint32[](0), uzakUcret: 0 });
        token = kapi.launch(r);
        sonToken = token;
        sonKurucuToken = IJetonV2(token).balanceOf(address(this));
        sonHavuzToken = IJetonV2(token).balanceOf(pm);
    }

    /// Block 2 (later): the trades and the redemption.
    function isle(MerkezKapi kapi, SepetDefteri defter, SepetUcu ucu, address pm) external returns (Sonuc memory s) {
        s.token = sonToken;
        s.kurucuToken = sonKurucuToken;
        s.havuzToken0 = sonHavuzToken;
        IJetonV2 t = IJetonV2(s.token);

        /* two $10,000 buys delivered on Arc: the old ladder ran out at ~$4.800 */
        uint256 b0 = t.balanceOf(address(this));
        kapi.al(s.token, 10_000e6, 1, 0, _b(address(this)), "", address(this));
        s.alim1 = t.balanceOf(address(this)) - b0;
        kapi.al(s.token, 10_000e6, 1, 0, _b(address(this)), "", address(this));
        s.alim2 = t.balanceOf(address(this)) - b0 - s.alim1;
        s.havuzToken2 = t.balanceOf(pm);
        s.konan = 20_000e6;

        /* everything bought sold back on Arc, paid here */
        s.satilan = s.alim1 + s.alim2;
        t.approve(address(kapi), s.satilan);
        uint256 u0 = USDC.balanceOf(address(this));
        kapi.satArc(s.token, s.satilan, 1, ARC, _b(address(this)), 0);
        s.satisDolar = USDC.balanceOf(address(this)) - u0;

        /* the founder redeems a tenth of the supply's claim from the basket (its dollars still wait in the Defter) */
        uint64 id = defter.idOf(ARC, _b(s.token));
        s.bekleyenOnce = defter.beklemede(id);
        uint256 m = s.kurucuToken / 2;
        t.approve(address(ucu), m);
        uint256 u1 = USDC.balanceOf(address(this));
        ucu.itfa(s.token, m, ARC, _b(address(this)));
        s.itfaDolar = USDC.balanceOf(address(this)) - u1;
        (,, s.arzSonra,,,) = defter.launchlar(id);
        s.kapiDolar = USDC.balanceOf(address(kapi));
    }

    receive() external payable {}
}
