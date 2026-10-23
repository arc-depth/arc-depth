// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { HaberciLZ, ILzUcNokta2, ITokenMesajciLZ, LzOrigin2, LzParams2, LzFee2 } from "../sepet/HaberciLZ.sol";
import { SepetKasasi, IV3Fabrika } from "../sepet/SepetKasasi.sol";
import { IHaberci, IHaberAlici, IERC20S, SepetMesaj } from "../sepet/IHaberci.sol";
import { ZincirTablosu } from "../lz/ZincirTablosu.sol";
import { IMesajTasiyiciV2 } from "../nesil2/CctpMesaj.sol";
import { Dolar6, IERC20D6 } from "../Dolar6.sol";

/// Runs in one eth_call on Arc mainnet state (scripts/denetim-haberci-lz.js):
/// Arc's real LayerZero endpoint and DVNs, Circle's real TokenMessengerV2.
///   GONDERIM  a HaberciLZ bound to the real endpoint: an order with dollars
///             to Base (Circle forwarding), to BNB (relay deposit address)
///             and to a DUZ chain; an order without dollars needs the fee
///             balance; payouts go straight to the payee.
///   ALIM      a HaberciLZ whose endpoint is this contract (so it can deliver
///             as LayerZero's executor would): order before dollars waits and
///             runs on `isle`; dollars before order run at once; a fee taken
///             on the way still runs; a wrong source or eid is refused; the
///             real SepetKasasi code opens its auction from such an order.
contract TestHaberciLZ {
    IERC20S constant USDC = IERC20S(0x3600000000000000000000000000000000000000);
    ITokenMesajciLZ constant TM = ITokenMesajciLZ(0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d);
    IMesajTasiyiciV2 constant MT = IMesajTasiyiciV2(0x81D40F21F12A8F0E3252Bccb954D722d4c464B64);
    address constant FTHM = 0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE;
    uint32 constant ARC = 26;
    uint32 constant BASE = 6;
    uint32 constant AVAX = 1;
    uint32 constant BNB = 17;
    address constant RELAY_ADRESI = address(0x1234567890AbcdEF1234567890aBcdef12345678);

    struct Sonuc {
        bool sarmaBekledi; uint256 ucretOzel; bool ozelIkinciRed; bool sarmaTeslim; uint256 sarmaAlinan; uint256 sarmaArtik;
        bool baseGitti; uint256 baseKalan; bool relayGitti; uint256 relayAldi; bool duzGitti;
        bool ucretsizRed; bool ucretliGitti; bool odemeBase; uint256 odemeBnbArcta;
        bool emirBekledi; bool isleTeslim; uint256 aliciAldi1; bool once_dolar; uint256 aliciAldi2;
        bool eksikUcretle; uint256 aliciAldi3; bool erkenBekler;
        bool yabanciRed; bool eidRed; bool sadeceUcNokta;
        uint256 kasaIhale; uint256 kasaDolar; bool suiGitti; bool aptosGitti; bool aptosDolarsiz; uint256 cctpKalan; uint256 gazAl; uint256 gazSat; uint256 ucret600; uint256 ucret250; uint256 ucret150;
    }

    uint256 public alinan;
    uint256 public mesajSayisi;

    function _b(address a) internal pure returns (bytes32) { return bytes32(uint256(uint160(a))); }
    function _sec(uint128 gaz) internal pure returns (bytes memory) { return abi.encodePacked(uint16(3), uint8(1), uint16(17), uint8(1), gaz); }

    /* this contract as a receiver (IHaberAlici) */
    function haberAl(uint32, bytes32, bytes calldata, uint256 usdc) external { alinan += usdc; mesajSayisi++; }
    /* and as the receiving HaberciLZ's endpoint */
    function setDelegate(address) external {}

    function run() external returns (Sonuc memory s) {
        _gonderim(s);
        _alim(s);
        _sarma(s);
    }

    /// BNB: relay delivers Binance-Peg USDC (18 decimals); the vault's dollar
    /// is Dolar6. The order waits until the delivery, wrapped, covers it.
    function _sarma(Sonuc memory s) internal {
        Peg18 peg = new Peg18();
        Dolar6 d6 = new Dolar6(IERC20D6(address(peg)), "Dolar6", "D6");
        HaberciLZ h = new HaberciLZ(IERC20S(address(d6)), ILzUcNokta2(address(this)), ITokenMesajciLZ(address(0)),
            IMesajTasiyiciV2(address(0)), 17, ARC, false, IERC20S(address(peg)));
        h.ikizEkle(ARC, 30417, _b(address(0xA2C)));
        uint256 m0 = mesajSayisi;
        uint256 a0 = alinan;
        h.lzReceive(LzOrigin2(30417, _b(address(0xA2C)), 1), bytes32(0),
            abi.encode(_b(address(0xDEF)), _b(address(this)), abi.encode(uint256(10)), uint256(10e6), uint256(9.7e6)), address(0), "");
        s.sarmaBekledi = mesajSayisi == m0;
        peg.mint(address(h), 9.92e18 + 123);   // what relay delivered, 0.8% taken, and dust under a unit
        h.isle();
        s.sarmaTeslim = mesajSayisi == m0 + 1;
        s.sarmaAlinan = alinan - a0;
        s.sarmaArtik = peg.balanceOf(address(h));
    }

    function _gonderim(Sonuc memory s) internal {
        ZincirTablosu.Zincir memory z = ZincirTablosu.burasi();
        HaberciLZ h = new HaberciLZ(USDC, ILzUcNokta2(z.endpoint), TM, MT, ARC, ARC, true, IERC20S(address(0)));
        ZincirTablosu.dvnYaz(address(h));   // the deployer is the delegate until kilitle
        h.ikizEkle(BASE, 30184, _b(address(0xBA5E)));
        h.ikizEkle(BNB, 30102, _b(address(0xB0B0)));
        h.ikizEkle(AVAX, 30106, _b(address(0xA7A7)));
        h.yolKur(BASE, h.YONLENDIR(), address(0), 150_000, bytes32(0));
        h.yolKur(BNB, h.RELAY(), RELAY_ADRESI, 0, bytes32(0));
        h.yolKur(AVAX, h.DUZ(), address(0), 0, bytes32(0));
        h.ikizEkle(8, 30378, bytes32(uint256(0x5011)));     // Sui: the package's CCTP auth identity
        h.ikizEkle(9, 30108, bytes32(uint256(0xA9105)));    // Aptos: its Haberci
        h.yolKur(8, h.SUI_CCTP(), address(0), 0, bytes32(0));
        h.yolKur(9, h.APTOS_CCTP(), address(0), 0, bytes32(0));
        h.secenekKur(_sec(600_000));
        bytes memory al0 = abi.encode(SepetMesaj.AL, uint64(1), _b(FTHM), uint256(1e18));
        s.ucret600 = h.ucret(BASE, _b(address(0xCA5A)), al0, 4e6);
        s.ucret250 = ILzUcNokta2(z.endpoint).quote(LzParams2(30184, _b(address(0xBA5E)), abi.encode(bytes32(0), _b(address(0xCA5A)), al0, uint256(4e6), uint256(4e6)), _sec(250_000), false), address(h)).nativeFee;
        s.ucret150 = ILzUcNokta2(z.endpoint).quote(LzParams2(30184, _b(address(0xBA5E)), abi.encode(bytes32(0), _b(address(0xCA5A)), al0, uint256(4e6), uint256(4e6)), _sec(150_000), false), address(h)).nativeFee;
        /* a chain with its own options: Base set to 150k, its quote follows them */
        h.ozelSecenekKur(BASE, _sec(150_000));
        s.ucretOzel = h.ucret(BASE, _b(address(0xCA5A)), al0, 4e6);
        try h.ozelSecenekKur(BASE, _sec(300_000)) { } catch { s.ozelIkinciRed = true; }
        USDC.approve(address(h), type(uint256).max);
        bytes memory al = abi.encode(SepetMesaj.AL, uint64(1), _b(FTHM), uint256(1e18));

        /* an order with $4 to Base: the fee comes out of the $4, the rest is burned with forwarding */
        try h.gonder(BASE, _b(address(0xCA5A)), al, 4e6) { s.baseGitti = true; } catch { }
        s.baseKalan = USDC.balanceOf(address(h));
        /* to BNB: a plain transfer to the relay deposit address */
        uint256 r0 = USDC.balanceOf(RELAY_ADRESI);
        try h.gonder(BNB, _b(address(0xCA5B)), al, 4e6) { s.relayGitti = true; } catch { }
        s.relayAldi = USDC.balanceOf(RELAY_ADRESI) - r0;
        /* to a chain Circle does not forward to: a plain burn */
        try h.gonder(AVAX, _b(address(0xCA5C)), al, 4e6) { s.duzGitti = true; } catch { }
        /* an order without dollars (a redemption) needs the fee balance */
        bytes memory sat = abi.encode(SepetMesaj.SAT, uint64(1), new bytes32[](0), uint256(1), uint256(2), BASE, _b(address(0xA11CE)));
        try h.gonder(BASE, _b(address(0xCA5A)), sat, 0) { } catch { s.ucretsizRed = true; }
        USDC.transfer(address(h), 2e6);
        try h.gonder(BASE, _b(address(0xCA5A)), sat, 0) { s.ucretliGitti = true; } catch { }
        /* orders to Sui and Aptos: CCTP, the v1 wire format (LayerZero does not connect Arc to them) */
        try h.gonder(8, bytes32(uint256(0x5A5A)), al, 4e6) { s.suiGitti = true; } catch { }
        try h.gonder(9, bytes32(uint256(0xA5A5)), al, 4e6) { s.aptosGitti = true; } catch { }
        try h.gonder(9, bytes32(uint256(0xA5A5)), sat, 0) { s.aptosDolarsiz = true; } catch { }
        s.cctpKalan = USDC.balanceOf(address(h));
        /* payouts: straight to the payee; an island payee is paid on Arc, same address */
        uint256 o0 = USDC.balanceOf(address(h));
        try h.gonder(BASE, _b(address(0xA11CE)), "", 3e6) { s.odemeBase = USDC.balanceOf(address(h)) == o0; } catch { }
        uint256 a0 = USDC.balanceOf(address(0xB0B));
        h.gonder(BNB, _b(address(0xB0B)), "", 3e6);
        s.odemeBnbArcta = USDC.balanceOf(address(0xB0B)) - a0;
    }

    function _alim(Sonuc memory s) internal {
        /* the receiving side, with this contract standing in for the endpoint */
        HaberciLZ h = new HaberciLZ(USDC, ILzUcNokta2(address(this)), TM, MT, BASE, ARC, false, IERC20S(address(0)));
        h.ikizEkle(ARC, 30417, _b(address(0xA2C)));
        bytes32 ben = _b(address(this));
        LzOrigin2 memory o = LzOrigin2(30417, _b(address(0xA2C)), 1);

        /* order before its dollars: it waits, then runs on isle */
        h.lzReceive(o, bytes32(0), abi.encode(_b(address(0xDEF)), ben, abi.encode(uint256(7)), uint256(4e6), uint256(3.9e6)), address(0), "");
        s.emirBekledi = mesajSayisi == 0 && h.ilkAcik() == 0;
        USDC.transfer(address(h), 3.95e6);   // what Circle's forwarding minted, its fee taken
        h.isle();
        s.isleTeslim = mesajSayisi == 1;
        s.aliciAldi1 = alinan;

        /* dollars first: the order runs inside lzReceive */
        USDC.transfer(address(h), 5e6);
        h.lzReceive(o, bytes32(0), abi.encode(_b(address(0xDEF)), ben, abi.encode(uint256(8)), uint256(5e6), uint256(4.9e6)), address(0), "");
        s.once_dolar = mesajSayisi == 2;
        s.aliciAldi2 = alinan - s.aliciAldi1;

        /* less than its least: it keeps waiting */
        h.lzReceive(o, bytes32(0), abi.encode(_b(address(0xDEF)), ben, abi.encode(uint256(9)), uint256(5e6), uint256(4.9e6)), address(0), "");
        USDC.transfer(address(h), 1e6);
        h.isle();
        s.erkenBekler = mesajSayisi == 2;
        USDC.transfer(address(h), 3.95e6);
        h.isle();
        s.eksikUcretle = mesajSayisi == 3;
        s.aliciAldi3 = alinan - s.aliciAldi1 - s.aliciAldi2;

        /* refused: another sender on the right eid; Ethereum\x27s domain 0 with an unregistered eid; not the endpoint */
        try h.lzReceive(LzOrigin2(30417, _b(address(0xBAD)), 2), bytes32(0), abi.encode(bytes32(0), ben, "", uint256(0), uint256(0)), address(0), "") { } catch { s.yabanciRed = true; }
        try h.lzReceive(LzOrigin2(30999, _b(address(0xA2C)), 2), bytes32(0), abi.encode(bytes32(0), ben, "", uint256(0), uint256(0)), address(0), "") { } catch { s.eidRed = true; }
        try this.disaridan(h) { } catch { s.sadeceUcNokta = true; }

        /* the real vault code takes such an order and opens its buy auction */
        SepetKasasi k = new SepetKasasi(IHaberci(address(h)), USDC, ARC, _b(address(0xDEF)), IV3Fabrika(address(0)), address(0));
        USDC.transfer(address(h), 4e6);
        uint256 g0 = gasleft();
        h.lzReceive(o, bytes32(0), abi.encode(_b(address(0xDEF)), _b(address(k)),
            abi.encode(SepetMesaj.AL, uint64(1), _b(FTHM), uint256(500_000e18)), uint256(4e6), uint256(3.9e6)), address(0), "");
        s.gazAl = g0 - gasleft();
        s.kasaIhale = k.ihaleSayisi();
        /* a redemption order to the same vault (no dollars, one asset): the other shape a vault receives */
        uint256 g1 = gasleft();
        bytes32[] memory v = new bytes32[](1); v[0] = _b(FTHM);
        try h.lzReceive(o, bytes32(0), abi.encode(_b(address(0xDEF)), _b(address(k)),
            abi.encode(SepetMesaj.SAT, uint64(1), v, uint256(1e18), uint256(10e18), ARC, _b(address(0xA11CE))), uint256(0), uint256(0)), address(0), "") { } catch { }
        s.gazSat = g1 - gasleft();
        s.kasaDolar = k.usdcBakiye(1);
    }

    function disaridan(HaberciLZ h) external {
        Yabanci y = new Yabanci();
        y.dene(h);
    }

    receive() external payable {}
}

contract Peg18 {
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address a, uint256 v) external { balanceOf[a] += v; }
    function approve(address sp, uint256 v) external returns (bool) { allowance[msg.sender][sp] = v; return true; }
    function transfer(address to, uint256 v) external returns (bool) { balanceOf[msg.sender] -= v; balanceOf[to] += v; return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        allowance[f][msg.sender] -= v; balanceOf[f] -= v; balanceOf[to] += v; return true;
    }
}

contract Yabanci {
    function dene(HaberciLZ h) external {
        h.lzReceive(LzOrigin2(30417, bytes32(uint256(uint160(address(0xA2C)))), 3), bytes32(0), abi.encode(bytes32(0), bytes32(0), "", uint256(0), uint256(0)), address(0), "");
    }
}
