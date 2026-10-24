// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { MerkezKapi, ILaunchpadM, IIkizYayiciM, ITokenMesajciM, ISepetUcuM, IIkizHubM } from "../merkez/MerkezKapi.sol";
import { SepetDefteri } from "../sepet/SepetDefteri.sol";
import { SepetKasasi, IV3Fabrika } from "../sepet/SepetKasasi.sol";
import { SepetUcu } from "../sepet/SepetUcu.sol";
import { PulseLaunchpad5, IQuoteP5 } from "../sepet/PulseLaunchpad5.sol";
import { PulseFabrika4 } from "../nesil4/PulseFabrika4.sol";
import { PulseLikiditeKasasi, IERC20PL, IPulseKayitPL } from "../PulseLikiditeKasasi.sol";
import { IkizHub } from "../lz/IkizHub.sol";
import { ILzUcNokta2 } from "../sepet/HaberciLZ.sol";
import { IHaberci, IERC20S } from "../sepet/IHaberci.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";

interface IJetonV4 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function totalSupply() external view returns (uint256);
}

/// The v4 basket set on Arc, end to end, in a few eth_simulateV1 blocks on
/// Arc mainnet state (scripts/denetim-v4-arc.js). Everything new is deployed
/// here exactly as `dagit-v2.js v4` will deploy it; everything kept is the
/// live contract: HaberciLZ, IkizYayici, PulseFabrika4, FthmYakici, the
/// LayerZero endpoint, Circle's TokenMessengerV2, Uniswap v4's PoolManager.
///   1 kur1   Defter, Arc vault, Ucu, liquidity vault, IkizHub
///   2 kur2   the hook (CREATE2, mined salt), launchpad, gate; Defter bindings
///   3 launch $100 first buy, basket FTHM on Arc $25 + WETH on Base $25
///   4 isle   trades past the snipe window: each trade's tax reaches the
///            Defter in the trade; both lines pass $50 and go to their vaults
///   5 itfa   a redemption paying the quoted fee: the Base order leaves at
///            once, the margin comes back; then one with no fee: the order
///            waits in the queue with its tip
///   6 ucuncu a stranger sends the queued order and takes the tip
///   7 uzak   a twin holder's redemption from another chain (the gate's
///            lzCompose, called as the endpoint) carrying its fee as value
contract TestV4Arc {
    IERC20S constant USDC = IERC20S(0x3600000000000000000000000000000000000000);
    address constant FTHM = 0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE;
    bytes32 constant WETH_BASE = bytes32(uint256(uint160(0x4200000000000000000000000000000000000006)));
    address constant C2 = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    uint32 constant ARC = 26;
    uint32 constant BASE = 6;

    function _b(address a) internal pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    /* the set, kept between blocks */
    SepetDefteri public defter;
    SepetKasasi public kasa;
    SepetUcu public ucu;
    PulseLikiditeKasasi public likidite;
    IkizHub public hub;
    address public hook;
    PulseLaunchpad5 public lp;
    MerkezKapi public kapi;
    address public token;
    uint64 public id;

    struct Adres {
        address haberci; address yayici; address fabrika4; address fthmYakici; address pm; address tm; address ep;
        address devpool; address isletme; address kasaBase;
    }

    function kur1(Adres calldata a) external {
        defter = new SepetDefteri(IHaberci(a.haberci), USDC);
        kasa = new SepetKasasi(IHaberci(a.haberci), USDC, ARC, _b(address(defter)), IV3Fabrika(address(0)), address(0), address(0), 0);
        /* the launchpad is created at this contract's 6th nonce (block 2) */
        address lpTahmin = _create(6);
        ucu = new SepetUcu(IHaberci(a.haberci), USDC, ARC, _b(address(defter)), lpTahmin);
        likidite = new PulseLikiditeKasasi(IERC20PL(address(USDC)), IPulseKayitPL(lpTahmin));
        hub = new IkizHub(ILzUcNokta2(a.ep));
    }

    function kur2(Adres calldata a, bytes calldata hookInit, bytes32 tuz) external returns (address) {
        (bool ok, bytes memory r) = C2.call(abi.encodePacked(tuz, hookInit));
        require(ok && r.length == 20, "hook");
        hook = address(bytes20(r));
        lp = new PulseLaunchpad5(IQuoteP5(address(USDC)), IPoolManager(a.pm), IHooks(hook), PulseFabrika4(a.fabrika4), ucu,
            a.devpool, address(likidite), a.isletme);
        require(address(lp) == _create(6), "lp nonce");
        kapi = new MerkezKapi(ILaunchpadM(address(lp)), IPoolManager(a.pm), IIkizYayiciM(a.yayici), ITokenMesajciM(a.tm), ARC,
            ISepetUcuM(address(ucu)), USDC, a.ep, IIkizHubM(address(hub)));
        defter.bagla(ARC, _b(address(ucu)), _b(address(kasa)));
        defter.bagla(BASE, bytes32(uint256(1)), _b(a.kasaBase));
        return hook;
    }

    function _create(uint256 n) internal view returns (address) {
        bytes memory nn = n < 0x80 ? abi.encodePacked(uint8(n)) : abi.encodePacked(uint8(0x81), uint8(n));
        return address(uint160(uint256(keccak256(abi.encodePacked(uint8(0xd6), uint8(0x94), address(this), nn)))));
    }

    function launch() external returns (address t, uint256 kurucuToken) {
        USDC.approve(address(kapi), type(uint256).max);
        SepetDefteri.Kalem[] memory k = new SepetDefteri.Kalem[](2);
        k[0] = SepetDefteri.Kalem(ARC, _b(FTHM), 25e6);
        k[1] = SepetDefteri.Kalem(BASE, WETH_BASE, 25e6);
        uint256[] memory teklif = new uint256[](2);
        teklif[0] = 1_600_000e18; teklif[1] = 1e16;
        string[] memory tipler = new string[](2);
        MerkezKapi.LaunchIstegi memory r = MerkezKapi.LaunchIstegi({
            ad: "Dort Prova", sembol: "DRT4", sepet: k, teklif: teklif, vergiPpm: 20_000, alim: 100e6,
            kurucu: _b(address(this)), kurucuZincir: ARC, kurucuEid: 0, ikizler: new uint32[](0), ikizSecenek: "",
            ikizUcret: 0, gonderSecenek: "", iade: address(this), tipler: tipler, uzakIkizler: new uint32[](0), uzakUcret: 0 });
        t = kapi.launch(r);
        token = t;
        id = defter.idOf(ARC, _b(t));
        kurucuToken = IJetonV4(t).balanceOf(address(this));
    }

    struct Islem {
        uint256 bekleyenOnce; uint256 alinan; uint256 satisDolar;
        uint256 kova; uint256 bekleyenSonra; bool arcDolu; bool baseDolu;
        uint256 kasaUsdc; uint256 kasaIhale; uint256 haberciUsdc;
    }

    function isle() external returns (Islem memory s) {
        IJetonV4 t = IJetonV4(token);
        s.bekleyenOnce = defter.beklemede(id);
        uint256 b0 = t.balanceOf(address(this));
        kapi.al(token, 2_000e6, 1, 0, _b(address(this)), "", address(this));
        s.alinan = t.balanceOf(address(this)) - b0;
        t.approve(address(kapi), s.alinan);
        uint256 u0 = USDC.balanceOf(address(this));
        kapi.satArc(token, s.alinan, 1, ARC, _b(address(this)), 0);
        s.satisDolar = USDC.balanceOf(address(this)) - u0;
        s.kova = USDC.balanceOf(lp.launchAt(lp.launchCount() - 1).kasa);
        s.bekleyenSonra = defter.beklemede(id);
        s.arcDolu = defter.kasaDolu(id, ARC);
        s.baseDolu = defter.kasaDolu(id, BASE);
        s.kasaUsdc = kasa.usdcBakiye(id);
        s.kasaIhale = kasa.ihaleSayisi();
    }

    struct Itfa {
        uint256 teklif; uint256 iade; uint256 arcPay; uint256 emirOnce; uint256 emirSonra1; uint256 emirSonra2;
        uint256 bahsis; uint256 arzOnce; uint256 arzSonra; uint256 kuyrukUcret;
    }

    function itfa() external returns (Itfa memory s) {
        IJetonV4 t = IJetonV4(token);
        (,, s.arzOnce,,,) = defter.launchlar(id);
        uint256 m = t.balanceOf(address(this)) / 10;
        s.teklif = defter.itfaUcreti(id, m, ARC, _b(address(this)));
        s.emirOnce = defter.emirSayisi();
        t.approve(address(ucu), type(uint256).max);
        USDC.approve(address(ucu), type(uint256).max);
        address iadeAdr = address(0x1ADE);
        uint256 u0 = USDC.balanceOf(address(this));
        uint256 i0 = USDC.balanceOf(iadeAdr);
        uint256 marj = s.teklif / 10 + 1;
        ucu.itfaUcretli(token, m, ARC, _b(address(this)), s.teklif + marj, iadeAdr);
        s.iade = USDC.balanceOf(iadeAdr) - i0;
        /* what this holder received on Arc: the waiting dollars' share and the Arc vault's share, minus the fee sent */
        s.arcPay = USDC.balanceOf(address(this)) + s.teklif + marj - u0;
        s.emirSonra1 = defter.emirSayisi();
        /* a trade's tax waits in the Defter; then the same redemption with no fee: the
           holder's waiting share cannot cover the Base fee, so the order waits, with its tip */
        kapi.al(token, 100e6, 1, 0, _b(address(this)), "", address(this));
        ucu.itfa(token, m, ARC, _b(address(this)));
        s.emirSonra2 = defter.emirSayisi();
        (,, s.bahsis,,) = defter.emirler(s.emirSonra2 - 1);
        s.kuyrukUcret = defter.emirUcreti(s.emirSonra2 - 1);
        (,, s.arzSonra,,,) = defter.launchlar(id);
    }

    /// Hands tokens to the gate as the token's Arc adapter does after a twin
    /// was sent here with a compose (block 7 calls the gate as the endpoint).
    function uzakHazirla(uint256 m) external returns (address adapter) {
        adapter = IIkizYayiciM(address(kapi.ikizYayici())).adapterAdresi(token);
        IJetonV4(token).transfer(address(kapi), m);
    }

    /// After block 7: the queue, the fallback address's dollars, the supply's claim.
    function uzakSonuc(address yedek) external view returns (uint256 emir, uint256 yedekUsdc, uint256 arz, uint256 kapiToken) {
        emir = defter.emirSayisi();
        yedekUsdc = USDC.balanceOf(yedek);
        (,, arz,,,) = defter.launchlar(id);
        kapiToken = IJetonV4(token).balanceOf(address(kapi));
    }

    receive() external payable {}
}

/// A stranger with dollars: sends the queued order and keeps the tip.
contract Yabanci4 {
    IERC20S constant USDC = IERC20S(0x3600000000000000000000000000000000000000);
    /// `net`: what the stranger is up after paying the fee and taking the tip (tip − fee).
    function gonder(SepetDefteri d, uint256 i) external returns (int256 net) {
        int256 u0 = int256(USDC.balanceOf(address(this)));
        USDC.approve(address(d), type(uint256).max);
        d.emirGonder(i);
        net = int256(USDC.balanceOf(address(this))) - u0;
    }
}
