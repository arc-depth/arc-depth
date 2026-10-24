// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {TabanKasasi} from "../src/arc/taban/TabanKasasi.sol";
import {FthmPayi} from "../src/arc/taban/FthmPayi.sol";

/* ---- Circle's contracts, called through minimal interfaces ------------ */
interface IMT {
    function initialize(address, address, address, address, address[] calldata, uint256, uint256) external;
    function receiveMessage(bytes calldata, bytes calldata) external returns (bool);
}
interface ITM {
    struct Roles { address owner; address rescuer; address feeRecipient; address denylister; address tokenMinter; address minFeeController; }
    function initialize(Roles calldata, uint256, uint32[] calldata, bytes32[] calldata) external;
    function addRemoteTokenMessenger(uint32, bytes32) external;
    function depositForBurnWithHook(uint256, uint32, bytes32, address, bytes32, uint256, uint32, bytes calldata) external;
}
interface IMinter {
    function addLocalTokenMessenger(address) external;
    function linkTokenPair(address, uint32, bytes32) external;
    function setMaxBurnAmountPerMessage(address, uint256) external;
}
interface IUSDC {
    function mint(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

/// A stranger burning to a vault with a hook that names themselves.
contract Sahte {
    function gonder(ITM tm, IUSDC u, uint32 d, bytes32 kasa, address alici) external {
        u.approve(address(tm), 10e6);
        tm.depositForBurnWithHook(10e6, d, kasa, address(u), kasa, 0, 2000, abi.encode(alici, uint256(1e30), uint256(0), uint256(1)));
    }
}

/// Three chains, each with Circle's real CCTP V2 (MessageTransmitterV2,
/// TokenMessengerV2, TokenMinterV2 behind their proxies), messages signed
/// the way Iris signs them, and one TabanKasasi + FthmPayi per chain.
contract TabanTest is Test {
    uint32 constant ARC = 26;
    uint32 constant BASE = 6;
    uint32 constant ARB = 3;
    uint256 constant ATTESTER_PK = 0xA77E57;
    bytes32 constant MESAJ_OLAYI = keccak256("MessageSent(bytes)");

    struct Alan { IUSDC usdc; IMinter minter; IMT mt; ITM tm; TabanKasasi kasa; FthmPayi fthm; }
    mapping(uint32 => Alan) z;
    uint32[3] domainler = [ARC, BASE, ARB];
    uint256 nonceSayac = 1;
    uint256 ucretSonraki;   // feeExecuted Iris will write on the next message

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address tasiyici = address(0x7A51);    // a relayer delivering messages
    address hazine = address(0x4A2);
    address launchpad = address(0x1A0);    // the launchpad that brought the token
    address stake = address(0x57A);        // FTHM's stake contract on Arc
    address cctpUcret = address(0xFEE);

    function _alan(uint32 domain) internal returns (Alan memory a) {
        address proxyYonetici = address(uint160(0xAD00 + domain));
        a.usdc = IUSDC(deployCode("MockMintBurnToken.sol:MockMintBurnToken"));
        vm.mockCall(address(a.usdc), abi.encodeWithSignature("decimals()"), abi.encode(uint8(6)));
        a.minter = IMinter(deployCode("TokenMinterV2.sol:TokenMinterV2", abi.encode(address(this))));
        address mtImpl = deployCode("MessageTransmitterV2.sol:MessageTransmitterV2", abi.encode(domain, uint32(1)));
        a.mt = IMT(deployCode("AdminUpgradableProxy.sol:AdminUpgradableProxy", abi.encode(mtImpl, proxyYonetici, bytes(""))));
        address[] memory att = new address[](1);
        att[0] = vm.addr(ATTESTER_PK);
        a.mt.initialize(address(this), address(this), address(this), address(this), att, 1, 8192);
        address tmImpl = deployCode("TokenMessengerV2.sol:TokenMessengerV2", abi.encode(address(a.mt), uint32(1)));
        a.tm = ITM(deployCode("AdminUpgradableProxy.sol:AdminUpgradableProxy", abi.encode(tmImpl, proxyYonetici, bytes(""))));
        a.tm.initialize(ITM.Roles(address(this), address(this), cctpUcret, address(this), address(a.minter), address(this)),
            0, new uint32[](0), new bytes32[](0));
        a.minter.addLocalTokenMessenger(address(a.tm));
        a.minter.setMaxBurnAmountPerMessage(address(a.usdc), 1e30);
        a.fthm = new FthmPayi(address(a.usdc), address(a.tm), domain, stake);
        a.kasa = new TabanKasasi("Pulse Test", "PT", address(a.usdc), address(a.mt), address(a.tm),
            hazine, address(a.fthm), launchpad);
    }

    function _b(address x) internal pure returns (bytes32) { return bytes32(uint256(uint160(x))); }

    function setUp() public {
        vm.warp(1_800_000_000);
        vm.roll(25_000_000);
        for (uint256 i = 0; i < 3; i++) z[domainler[i]] = _alan(domainler[i]);
        for (uint256 i = 0; i < 3; i++) {
            for (uint256 j = 0; j < 3; j++) {
                if (i == j) continue;
                Alan storage a = z[domainler[i]];
                Alan storage b = z[domainler[j]];
                a.tm.addRemoteTokenMessenger(domainler[j], _b(address(b.tm)));
                a.minter.linkTokenPair(address(a.usdc), domainler[j], _b(address(b.usdc)));
                a.kasa.ikizEkle(domainler[j], address(b.kasa));
            }
        }
        /* the launch on Arc: $1,000 behind 1,000,000 tokens -> $0.001, plus $5 to open */
        z[ARC].usdc.mint(address(this), 1005e6);
        z[ARC].usdc.approve(address(z[ARC].kasa), 1005e6);
        z[ARC].kasa.tohumla(alice, 1000e6, 1_000_000e18);
        for (uint256 i = 0; i < 3; i++) z[domainler[i]].kasa.kilitle();
    }

    /* ---- the attestation service, as Circle runs it ------------------- */

    function _iris(address mt) internal returns (bytes memory m, bytes memory imza) {
        Vm.Log[] memory l = vm.getRecordedLogs();
        for (uint256 i = l.length; i > 0; i--) {
            if (l[i - 1].emitter == mt && l[i - 1].topics.length > 0 && l[i - 1].topics[0] == MESAJ_OLAYI) {
                m = abi.decode(l[i - 1].data, (bytes));
                break;
            }
        }
        require(m.length > 0, "mesaj yok");
        bytes32 n = bytes32(nonceSayac++);
        assembly { mstore(add(add(m, 32), 12), n) }
        bytes4 f = bytes4(uint32(2000));
        for (uint256 j = 0; j < 4; j++) m[144 + j] = f[j];
        bytes32 u = bytes32(ucretSonraki);
        assembly { mstore(add(add(m, 32), 312), u) }   // body 148 + feeExecuted 164
        ucretSonraki = 0;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_PK, keccak256(m));
        imza = abi.encodePacked(r, s, v);
    }

    /// Bridge and deliver (by the relayer). Returns the tokens minted on arrival.
    function _gec(address kim, uint32 kaynak, uint32 hedef, uint256 miktar, uint256 bahsis) internal returns (uint256) {
        TabanKasasi h = z[hedef].kasa;
        uint256 once = h.balanceOf(kim);
        vm.recordLogs();
        vm.prank(kim);
        z[kaynak].kasa.kopru(miktar, hedef, kim, 1e6, bahsis);
        (bytes memory m, bytes memory a) = _iris(address(z[kaynak].mt));
        vm.prank(tasiyici);
        h.teslimAl(m, a);
        return h.balanceOf(kim) - once;
    }

    function _gec(address kim, uint32 kaynak, uint32 hedef, uint256 miktar) internal returns (uint256) {
        return _gec(kim, kaynak, hedef, miktar, 0);
    }

    /* ==================================================================== */

    function test_acilisUcreti() public view {
        assertEq(z[ARC].kasa.kasa(), 1000e6, "the floor got all of the launch money");
        assertEq(z[ARC].usdc.balanceOf(address(z[ARC].fthm)), 2.5e6, "half the $5 to FTHM");
        assertEq(z[ARC].usdc.balanceOf(hazine), 2.5e6, "half to the protocol");
    }

    function test_kopru_tabaniTasir_ucretBolunur() public {
        uint256 tabanArc = z[ARC].kasa.taban();
        assertEq(tabanArc, 1000, "$0.001 per token, in 1e-6 dollars per 1e18");

        uint256 basilan = _gec(alice, ARC, BASE, 100_000e18);
        /* $100 share: $0.10 fee, $99.90 crosses */
        assertEq(basilan, 99_900e18, "empty chain: the count less the fee");
        assertEq(z[BASE].kasa.kasa(), 99.9e6, "Base vault got $99.90");
        assertEq(z[ARC].kasa.kasa(), 900e6, "Arc vault gave exactly the share");
        assertEq(z[ARC].kasa.taban(), tabanArc, "Arc floor unchanged");
        assertEq(z[BASE].kasa.taban(), tabanArc, "Base floor equals Arc's");

        assertEq(z[ARC].usdc.balanceOf(address(z[ARC].fthm)), 2.5e6 + 0.04e6, "40% to FTHM");
        assertEq(z[ARC].usdc.balanceOf(launchpad), 0.03e6, "30% to the launchpad");
        assertEq(z[ARC].usdc.balanceOf(hazine), 2.5e6 + 0.03e6, "30% to the protocol");

        /* redeem on Base, locally, no message, no fee */
        vm.prank(alice);
        uint256 odeme = z[BASE].kasa.itfa(basilan);
        assertEq(odeme, 99.9e6, "redeemed $99.90 on Base");
    }

    function test_bahsis_teslimEdene() public {
        uint256 basilan = _gec(alice, ARC, BASE, 100_000e18, 0.05e6);
        assertEq(z[BASE].usdc.balanceOf(tasiyici), 0.05e6, "the relayer got its tip on Base");
        assertEq(basilan, 99_850e18, "the tip came out of the bridger's tokens");
        assertEq(z[BASE].kasa.taban(), 1000, "floor unchanged");
    }

    function test_bahsis_mesajiKilitleyemez() public {
        /* a tip that would leave nothing to mint is refused at the source */
        vm.prank(alice);
        vm.expectRevert(TabanKasasi.BahsisCok.selector);
        z[ARC].kasa.kopru(100_000e18, BASE, alice, 1e6, 99e6);
    }

    function test_fthmPayi_araGider() public {
        _gec(alice, ARC, BASE, 300_000e18);
        _gec(alice, BASE, ARB, 100_000e18);   // a fee earned on Base
        uint256 baseFthm = z[BASE].usdc.balanceOf(address(z[BASE].fthm));
        assertGt(baseFthm, 0);

        /* Base -> Arc stake, through CCTP; anyone can sweep and deliver */
        vm.recordLogs();
        z[BASE].fthm.supur(0);
        (bytes memory m, bytes memory a) = _iris(address(z[BASE].mt));
        vm.prank(bob);
        z[ARC].mt.receiveMessage(m, a);
        /* Arc's own share by plain transfer */
        uint256 arcFthm = z[ARC].usdc.balanceOf(address(z[ARC].fthm));
        z[ARC].fthm.supur(0);
        assertEq(z[ARC].usdc.balanceOf(stake), baseFthm + arcFthm, "FTHM stakers got both chains' share on Arc");
    }

    function test_fthmPayi_ucretSiniri() public {
        _gec(alice, ARC, BASE, 300_000e18);
        _gec(alice, BASE, ARB, 100_000e18);
        vm.expectRevert(FthmPayi.UcretCok.selector);
        z[BASE].fthm.supur(1e6);   // more than 1% of the sweep
    }

    function test_ucChain_mesh() public {
        _gec(alice, ARC, BASE, 300_000e18);
        uint256 b = _gec(alice, BASE, ARB, 100_000e18);   // Base -> Arbitrum, no stop at Arc
        assertGt(b, 0);
        assertEq(_toplamDolar(), 1005e6, "no dollar created or lost across three chains");
    }

    function test_ucret_kopruyeDuser() public {
        ucretSonraki = 1e6;   // CCTP keeps $1 of the $99.90
        uint256 basilan = _gec(alice, ARC, BASE, 100_000e18);
        assertEq(basilan, 98_900e18, "the bridger pays every fee in tokens");
        assertEq(z[BASE].kasa.taban(), 1000, "Base floor still $0.001");
        assertEq(z[ARC].kasa.taban(), 1000);
    }

    function test_dusukTaban_yuksegiSeyreltemez() public {
        _gec(alice, ARC, BASE, 100_000e18);
        /* Base's vault deepened: floor $0.002 there, $0.001 on Arc */
        z[BASE].usdc.mint(address(z[BASE].kasa), 99.9e6);
        assertEq(z[BASE].kasa.taban(), 2000);

        vm.prank(alice);
        z[ARC].kasa.transfer(bob, 100_000e18);
        uint256 basilan = _gec(bob, ARC, BASE, 100_000e18);   // $99.90 of backing arrives
        assertEq(basilan, 49_950e18, "arrival buys in at Base's floor");
        assertEq(z[BASE].kasa.taban(), 2000, "Base holders not diluted");

        vm.prank(bob);
        uint256 geri = z[BASE].kasa.itfa(basilan);
        assertLe(geri, 100e6, "the round trip extracts nothing");
    }

    function test_yabanciYakim_reddedilir() public {
        Sahte s = new Sahte();
        z[ARC].usdc.mint(address(s), 10e6);
        vm.recordLogs();
        s.gonder(ITM(address(z[ARC].tm)), z[ARC].usdc, BASE, _b(address(z[BASE].kasa)), bob);
        (bytes memory m, bytes memory a) = _iris(address(z[ARC].mt));
        vm.expectRevert(TabanKasasi.KotuMesaj.selector);
        z[BASE].kasa.teslimAl(m, a);
        assertEq(z[BASE].kasa.totalSupply(), 0, "nothing minted");
    }

    function test_dogrudanTeslim_veTekrar_olmaz() public {
        vm.recordLogs();
        vm.prank(alice);
        z[ARC].kasa.kopru(100_000e18, BASE, alice, 1e6, 0);
        (bytes memory m, bytes memory a) = _iris(address(z[ARC].mt));
        /* only the vault may submit: it is the destinationCaller */
        vm.expectRevert();
        z[BASE].mt.receiveMessage(m, a);
        z[BASE].kasa.teslimAl(m, a);
        vm.expectRevert();
        z[BASE].kasa.teslimAl(m, a);   // nonce already used
        assertEq(z[BASE].kasa.totalSupply(), 99_900e18, "minted once");
    }

    function test_ikizYok_kilit() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TabanKasasi.IkizYok.selector, uint32(5)));
        z[ARC].kasa.kopru(1e18, 5, alice, 0, 0);
        vm.expectRevert(TabanKasasi.SadeceKurucu.selector);
        z[ARC].kasa.ikizEkle(5, address(1));
    }

    /// Every dollar the test minted, wherever it sits now.
    function _toplamDolar() internal view returns (uint256 t) {
        address[7] memory kim = [alice, bob, tasiyici, hazine, launchpad, stake, cctpUcret];
        for (uint256 i = 0; i < 3; i++) {
            Alan storage a = z[domainler[i]];
            t += a.usdc.balanceOf(address(a.kasa)) + a.usdc.balanceOf(address(a.fthm));
            for (uint256 j = 0; j < kim.length; j++) t += a.usdc.balanceOf(kim[j]);
        }
    }

    /// Random bridges (with CCTP fees and tips), redeems and deposits across
    /// three chains: no chain's floor ever goes down, and dollars are conserved.
    function testFuzz_tabanDusmez(uint256[12] memory tohum) public {
        uint256 bagis;
        for (uint256 i = 0; i < tohum.length; i++) {
            uint256 r = tohum[i];
            uint32 k = domainler[r % 3];
            uint32 h = domainler[(r / 3) % 3];
            uint256 tur = (r / 9) % 4;
            TabanKasasi kk = z[k].kasa;
            uint256 bakiye = kk.balanceOf(alice);

            uint256[3] memory once;
            for (uint256 j = 0; j < 3; j++) once[j] = z[domainler[j]].kasa.taban();

            if (tur == 3) {
                uint256 b = (r >> 20) % 50e6;
                z[k].usdc.mint(address(kk), b);
                bagis += b;
            } else if (bakiye > 0) {
                uint256 miktar = 1 + ((r >> 40) % bakiye);
                (, uint256 tasinan) = kk.kopruBol(kk.karsilik(miktar));
                if (tasinan <= 3e6) continue;   // room for maxFee 1e6 and a tip
                if (tur == 2) {
                    vm.prank(alice);
                    kk.itfa(miktar);
                } else if (h != k) {
                    ucretSonraki = tur == 1 ? (r >> 80) % 1e6 : 0;
                    bool bos = z[h].kasa.totalSupply() == 0;
                    uint256 kaynakTaban = kk.taban();
                    _gec(alice, k, h, miktar, (r >> 120) % 1e6);
                    /* a chain opened by this bridge starts at the source's floor */
                    if (bos && z[h].kasa.totalSupply() > 0)
                        assertGe(z[h].kasa.taban() + 1, kaynakTaban, "a new chain opened below the source");
                }
            }
            for (uint256 j = 0; j < 3; j++) {
                TabanKasasi x = z[domainler[j]].kasa;
                if (x.totalSupply() > 0 && once[j] > 0) assertGe(x.taban(), once[j], "a floor went down");
            }
        }
        assertEq(_toplamDolar(), 1005e6 + bagis, "dollars conserved");
    }
}
