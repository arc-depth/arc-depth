// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { LaunchEmaneti, LaunchIstegiL, KalemL, IMesajIletici2, ITokenMesajci2, IMerkezKapiL, IERC20L } from "../merkez/LaunchEmaneti.sol";

interface IVekilT { function vekilOf(address) external view returns (address); }

/// Circle's MessageTransmitterV2 played for the test (the only stand-in):
/// it checks the destination caller and the nonce as Circle's does, then
/// "mints" the burn's amount less the fee executed to the mint recipient
/// out of dollars it holds. Everything else is Arc mainnet state.
contract SahteIletici {
    IERC20L constant USDC = IERC20L(0x3600000000000000000000000000000000000000);
    mapping(bytes32 => bool) public kullanildi;

    function receiveMessage(bytes calldata m, bytes calldata) external returns (bool) {
        bytes32 cagiran = bytes32(m[108:140]);
        require(cagiran == bytes32(0) || cagiran == bytes32(uint256(uint160(msg.sender))), "caller");
        bytes32 nonce = bytes32(m[12:44]);
        require(!kullanildi[nonce], "nonce");
        kullanildi[nonce] = true;
        bytes calldata g = m[148:];
        address alici = address(uint160(uint256(bytes32(g[36:68]))));
        uint256 miktar = uint256(bytes32(g[68:100])) - uint256(bytes32(g[164:196]));
        require(USDC.transfer(alici, miktar), "mint");
        return true;
    }
}

/// Runs in one eth_call on Arc mainnet state (scripts/denetim-launch-emaneti.js):
/// the live MerkezKapi (v2), PulseLaunchpad5, Defter and Circle's TokenMessengerV2.
contract TestLaunchEmaneti {
    IMerkezKapiL constant KAPI = IMerkezKapiL(0x6740E27634E1E83E0562AD2fFdBcEB3C0958aeE9);
    ITokenMesajci2 constant TM = ITokenMesajci2(0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d);
    IERC20L constant USDC = IERC20L(0x3600000000000000000000000000000000000000);
    address constant FTHM = 0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE;
    bytes32 constant BASE_WETH = bytes32(uint256(uint160(0x4200000000000000000000000000000000000006)));
    address constant KURUCU = address(0xF00D);
    address constant IADE = address(0x1ADE);
    bytes32 constant SUI_GONDEREN = bytes32(uint256(0x5011));
    uint32 constant SUI = 8;

    struct Sonuc {
        address token; address vekil; uint256 kurucuToken; uint256 iadeA; uint256 emanetSonA;
        uint256 iadeB; bool launchYokB;
        uint256 emanetSonC; uint256 arzOnceC; uint256 arzSonraC;
        bool yanlisCagiranRed; bool tekrarRed; bool cozDisaridanRed; bool yanlisAliciRed;
        uint256 iadeF; address tokenF;
        uint256 iadeTopluluk;
    }

    SahteIletici mt;
    LaunchEmaneti em;
    uint256 nonce;

    function _istek(uint256 alim) internal pure returns (LaunchIstegiL memory r) {
        r.ad = "Emanet Prova"; r.sembol = "EMNT";
        r.sepet = new KalemL[](2);
        r.sepet[0] = KalemL(26, bytes32(uint256(uint160(FTHM))), 10e6);
        r.sepet[1] = KalemL(6, BASE_WETH, 10e6);
        r.teklif = new uint256[](2);
        r.teklif[0] = 650_000e18; r.teklif[1] = 3e15;
        r.tipler = new string[](2);
        r.vergiPpm = 20_000; r.alim = alim;
        r.kurucu = bytes32(uint256(uint160(KURUCU))); r.kurucuZincir = 26; r.kurucuEid = 0;
        r.ikizler = new uint32[](0);
        r.uzakIkizler = new uint32[](0);
        r.iade = address(0xDEAD);   // replaced by the contract with itself
    }

    /// A CCTP v2 message as Circle would deliver it: header (148 bytes) + burn body (228 bytes) + hook.
    function _mesaj(address cagiran, address alici, uint256 miktar, uint256 ucret, bytes memory kanca) internal returns (bytes memory) {
        nonce++;
        bytes memory baslik = abi.encodePacked(uint32(1), SUI, uint32(26), bytes32(nonce), bytes32(uint256(0x7311)),
            bytes32(uint256(uint160(address(0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d)))), bytes32(uint256(uint160(cagiran))), uint32(2000), uint32(2000));
        bytes memory govde = abi.encodePacked(uint32(1), bytes32(uint256(0xdba3)), bytes32(uint256(uint160(alici))), miktar, SUI_GONDEREN,
            uint256(0), ucret, uint256(0));
        return abi.encodePacked(baslik, govde, kanca);
    }

    function run() external returns (Sonuc memory s) {
        mt = new SahteIletici();
        require(USDC.transfer(address(mt), 1_000e6), "fund");
        em = new LaunchEmaneti(IMesajIletici2(address(mt)), TM, KAPI, USDC, 26);

        /* A) $122 burned on Sui ($1 Circle fee): $100 first buy + $20 basket, $1 of LayerZero value unused -> back to IADE */
        bytes memory m = _mesaj(address(em), address(em), 122e6, 1e6, abi.encode(_istek(100e6), IADE));
        s.token = em.isle(m, "");
        s.vekil = IVekilT(address(KAPI)).vekilOf(s.token);
        s.kurucuToken = IERC20L(s.token).balanceOf(KURUCU);
        s.iadeA = USDC.balanceOf(IADE);
        s.emanetSonA = USDC.balanceOf(address(em)) + address(em).balance;

        /* B) not enough for the launch it asks for: all of it back to IADE, no launch */
        uint256 once = USDC.balanceOf(IADE);
        bytes memory mB = _mesaj(address(em), address(em), 50e6, 0, abi.encode(_istek(100e6), IADE));
        address t = em.isle(mB, "");
        s.launchYokB = t == address(0);
        s.iadeB = USDC.balanceOf(IADE) - once;

        /* C) hook data that is not a launch: burned back to the sender on Sui through Circle's real TokenMessengerV2 */
        (bool okArz, bytes memory arz) = address(USDC).staticcall(abi.encodeWithSignature("totalSupply()"));
        if (okArz) s.arzOnceC = abi.decode(arz, (uint256));
        em.isle(_mesaj(address(em), address(em), 7e6, 0, hex"1234"), "");
        s.emanetSonC = USDC.balanceOf(address(em));
        (okArz, arz) = address(USDC).staticcall(abi.encodeWithSignature("totalSupply()"));
        if (okArz) s.arzSonraC = abi.decode(arz, (uint256));

        /* D) authority */
        try em.isle(_mesaj(address(0xBAD), address(em), 5e6, 0, abi.encode(_istek(100e6), IADE)), "") { } catch { s.yanlisCagiranRed = true; }
        try em.isle(_mesaj(address(em), address(0xBAD), 5e6, 0, abi.encode(_istek(100e6), IADE)), "") { } catch { s.yanlisAliciRed = true; }
        try em.isle(mB, "") { } catch { s.tekrarRed = true; }   // the same message again
        try em.coz(abi.encode(_istek(100e6), IADE)) { } catch { s.cozDisaridanRed = true; }

        /* F) a launch the gate refuses (a basket line without its name list): everything back to IADE */
        LaunchIstegiL memory kotu = _istek(100e6);
        kotu.tipler = new string[](1);
        once = USDC.balanceOf(IADE);
        s.tokenF = em.isle(_mesaj(address(em), address(em), 130e6, 0, abi.encode(kotu, IADE)), "");
        s.iadeF = USDC.balanceOf(IADE) - once;
        s.iadeTopluluk = USDC.balanceOf(address(em));
    }

    receive() external payable {}
}
