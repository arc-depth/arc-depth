// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {CrossChainAssetRegistry} from "../src/arc/CrossChainAssetRegistry.sol";
import {CrossChainAccounting} from "../src/arc/CrossChainAccounting.sol";
import {CrossChainAssetRegistry2} from "../src/arc/nesil2/CrossChainAssetRegistry2.sol";
import {KasaFabrika2, YoneticiFabrika2} from "../src/arc/nesil2/KasaFabrika2.sol";
import {KopruKasasi2, IYakilabilirK3} from "../src/arc/nesil2/KopruKasasi2.sol";
import {CrossChainCollateralManager2} from "../src/arc/nesil2/CrossChainCollateralManager2.sol";
import {RemoteVaultFactory2} from "../src/arc/nesil2/RemoteVaultFactory2.sol";
import {RemoteCollateralVault2} from "../src/arc/nesil2/RemoteCollateralVault2.sol";
import {KasaFabrika} from "../src/arc/KasaFabrika.sol";
import {YoneticiFabrika} from "../src/arc/YoneticiFabrika.sol";
import {KopruKasasi, IYakilabilirK} from "../src/arc/KopruKasasi.sol";
import {CrossChainCollateralManager} from "../src/arc/CrossChainCollateralManager.sol";
import {RemoteVaultFactory} from "../src/arc/RemoteVaultFactory.sol";
import {RemoteCollateralVault} from "../src/arc/RemoteCollateralVault.sol";

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

/* ---- test doubles for everything that is not CCTP --------------------- */
contract Jeton {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    function mint(address a, uint256 v) external { balanceOf[a] += v; totalSupply += v; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
    function transfer(address t, uint256 v) external returns (bool) { balanceOf[msg.sender] -= v; balanceOf[t] += v; return true; }
    function burn(uint256 v) external { balanceOf[msg.sender] -= v; totalSupply -= v; }
    function burnFrom(address a, uint256 v) external { allowance[a][msg.sender] -= v; balanceOf[a] -= v; totalSupply -= v; }
}

contract Weth {
    mapping(address => uint256) public balanceOf;
    function mint(address a, uint256 v) external { balanceOf[a] += v; }
    function transfer(address t, uint256 v) external returns (bool) { balanceOf[msg.sender] -= v; balanceOf[t] += v; return true; }
    function approve(address, uint256) external pure returns (bool) { return true; }
}

contract Besleyici {
    int256 public fiyat = 2000e8;
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, fiyat, block.timestamp, block.timestamp, 1);
    }
}

contract HavuzYok {
    function quoteIleAlinabilir(address, uint256) external pure returns (uint256, address, int24) { revert(); }
    function quoteKarsiligi(address, uint256) external pure returns (uint256, address, int24) { revert(); }
}

/// An honest executor on the remote chain: trades at the feed price.
contract Yurutucu {
    IUSDC public usdc;
    Weth public weth;
    constructor(IUSDC u, Weth w) { usdc = u; weth = w; }
    function takasCagrisi(address verilen, uint256 miktar, address, uint256, bytes calldata) external {
        if (verilen == address(usdc)) {
            weth.mint(address(this), (miktar * 1e18) / 2000e6);
            weth.transfer(msg.sender, (miktar * 1e18) / 2000e6);
        } else {
            uint256 q = (miktar * 2000e6) / 1e18;
            usdc.mint(address(this), q);
            usdc.transfer(msg.sender, q);
        }
    }
}

/// An executor that keeps half.
contract Hirsiz {
    Weth public weth;
    constructor(Weth w) { weth = w; }
    function takasCagrisi(address, uint256 miktar, address, uint256, bytes calldata) external {
        weth.mint(msg.sender, (miktar * 1e18) / 4000e6);
    }
}

/// A contract on the home chain that is NOT the token's vault, burning to
/// the remote vault with a FONLA hook — the forged-funding attempt.
contract Sahte {
    function gonder(ITM tm, IUSDC u, uint32 d, bytes32 alici, bytes calldata kanca) external {
        u.approve(address(tm), 1e6);
        tm.depositForBurnWithHook(1e6, d, alici, address(u), alici, 0, 2000, kanca);
    }
}

contract Nesil2Test is Test {
    uint32 constant EV = 26;
    uint32 constant UZAK = 6;
    uint256 constant ATTESTER_PK = 0xA77E57;
    bytes32 constant MESAJ_OLAYI = keccak256("MessageSent(bytes)");

    struct Alan { IUSDC usdc; IMinter minter; IMT mt; ITM tm; }
    Alan ev;
    Alan uzak;
    uint256 nonceSayac = 1;

    KasaFabrika2 kf;
    CrossChainAssetRegistry2 kayit;
    RemoteVaultFactory2 uf;
    Weth weth;
    Besleyici bes;
    Yurutucu yurutucu;
    Jeton jeton;
    KopruKasasi2 kasa;
    CrossChainCollateralManager2 yon;
    CrossChainAccounting defter;
    RemoteCollateralVault2 uzakKasa;

    address alice = address(0xA11CE);
    address egri = address(0xE6);
    address acici = address(0xAC);

    function _alan(uint32 domain) internal returns (Alan memory a) {
        address proxyYonetici = address(uint160(0xAD00 + domain));
        a.usdc = IUSDC(deployCode("MockMintBurnToken.sol:MockMintBurnToken"));
        a.minter = IMinter(deployCode("TokenMinterV2.sol:TokenMinterV2", abi.encode(address(this))));
        address mtImpl = deployCode("MessageTransmitterV2.sol:MessageTransmitterV2", abi.encode(domain, uint32(1)));
        a.mt = IMT(deployCode("AdminUpgradableProxy.sol:AdminUpgradableProxy", abi.encode(mtImpl, proxyYonetici, bytes(""))));
        address[] memory att = new address[](1);
        att[0] = vm.addr(ATTESTER_PK);
        a.mt.initialize(address(this), address(this), address(this), address(this), att, 1, 8192);
        address tmImpl = deployCode("TokenMessengerV2.sol:TokenMessengerV2", abi.encode(address(a.mt), uint32(1)));
        a.tm = ITM(deployCode("AdminUpgradableProxy.sol:AdminUpgradableProxy", abi.encode(tmImpl, proxyYonetici, bytes(""))));
        a.tm.initialize(ITM.Roles(address(this), address(this), address(this), address(this), address(a.minter), address(this)),
            0, new uint32[](0), new bytes32[](0));
        a.minter.addLocalTokenMessenger(address(a.tm));
        a.minter.setMaxBurnAmountPerMessage(address(a.usdc), 1e30);
    }

    function _b(address x) internal pure returns (bytes32) { return bytes32(uint256(uint160(x))); }

    function setUp() public {
        vm.warp(1_800_000_000);
        vm.roll(25_000_000);   // a real chain height; the transfer window opens at block >= 7200
        ev = _alan(EV);
        uzak = _alan(UZAK);
        ev.tm.addRemoteTokenMessenger(UZAK, _b(address(uzak.tm)));
        uzak.tm.addRemoteTokenMessenger(EV, _b(address(ev.tm)));
        ev.minter.linkTokenPair(address(ev.usdc), UZAK, _b(address(uzak.usdc)));
        uzak.minter.linkTokenPair(address(uzak.usdc), EV, _b(address(ev.usdc)));

        /* home: the vault factory, launchpad role played by this test */
        kf = new KasaFabrika2(new YoneticiFabrika2(), address(this));
        /* remote: feeds, the vault factory bound to the home factory */
        weth = new Weth();
        bes = new Besleyici();
        RemoteVaultFactory2.Besleyici[] memory b = new RemoteVaultFactory2.Besleyici[](1);
        b[0] = RemoteVaultFactory2.Besleyici(address(weth), address(bes), 18, 8, 3600);
        uf = new RemoteVaultFactory2(EV, address(kf), kf.kasaInitHash(), address(uzak.tm), address(uzak.mt),
            address(uzak.usdc), address(new HavuzYok()), b);
        /* home registry: one remote chain */
        CrossChainAssetRegistry2.Zincir[] memory z = new CrossChainAssetRegistry2.Zincir[](1);
        z[0] = CrossChainAssetRegistry2.Zincir(UZAK, 8453, address(uf), uf.initKodHash(), address(uzak.usdc), "uzak");
        kayit = new CrossChainAssetRegistry2(EV, z);

        jeton = new Jeton();
        jeton.mint(alice, 1000e18);
        (address k, address y) = kf.kur(CrossChainAssetRegistry(address(kayit)), address(ev.usdc), 1,
            address(ev.tm), address(ev.mt), IYakilabilirK3(address(jeton)), egri, acici, UZAK, address(weth));
        kasa = KopruKasasi2(k);
        yon = CrossChainCollateralManager2(y);
        defter = kasa.defter();
        assertEq(k, kf.kasaAdresi(1), "kasa CREATE2 adresinde");
        assertEq(uf.evKasasi(1), k, "uzak fabrika ev kasasini ayni turetiyor");

        ev.usdc.mint(k, 1000e6);
        kasa.supur();
        uzakKasa = RemoteCollateralVault2(uf.kasaKur(1));
        assertEq(address(uzakKasa), kayit.uzakKasa(UZAK, 1), "uzak kasa kayitin turettigi adreste");
        yurutucu = new Yurutucu(uzak.usdc, weth);
    }

    /* ---- the attestation service, as Circle runs it ------------------- */

    /// The message the last action emitted from `mt`, with the nonce and
    /// executed finality filled in the way Iris fills them, signed by the
    /// attester. Returns (message, attestation).
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_PK, keccak256(m));
        imza = abi.encodePacked(r, s, v);
    }

    function _kova(address v) internal view returns (CrossChainAccounting.Kova memory) { return defter.kova(v); }

    /// Home -> remote, delivered, reported back. Returns the transfer id.
    function _gonderVeUlas(uint256 miktar) internal returns (bytes32 id) {
        vm.recordLogs();
        id = yon.transferBaslat(miktar);
        (bytes memory m, bytes memory a) = _iris(address(ev.mt));
        vm.recordLogs();
        uzakKasa.teslimAl(m, a);
        (bytes memory r, bytes memory ra) = _iris(address(uzak.mt));
        kasa.teslimAl(r, ra);
    }

    /* ==================================================================== */

    function test_tamTur_donusturme_ve_geri_donus() public {
        /* 1. out: 200 of 1000 */
        vm.recordLogs();
        bytes32 id = yon.transferBaslat(200e6);
        assertEq(_kova(address(ev.usdc)).yolda, 200e6, "yolda 200");
        (bytes memory m, bytes memory a) = _iris(address(ev.mt));

        /* CCTP itself would mint without running anything, if anyone could
           submit: they cannot, the remote vault is the destinationCaller. */
        vm.expectRevert();
        uzak.mt.receiveMessage(m, a);

        /* 2. the remote vault submits it, books it, reports ULASTI */
        vm.recordLogs();
        uzakKasa.teslimAl(m, a);
        assertEq(uzak.usdc.balanceOf(address(uzakKasa)), 200e6, "uzakta 200 basildi");
        (uint256 pq,,,) = uzakKasa.pozisyon(id);
        assertEq(pq, 200e6, "pozisyon 200");
        (bytes memory r, bytes memory ra) = _iris(address(uzak.mt));
        kasa.teslimAl(r, ra);
        assertEq(uint8(yon.durumu(id)), uint8(CrossChainCollateralManager2.Durum.ULASTI), "ULASTI");
        assertEq(_kova(address(ev.usdc)).uzak, 200e6, "defterde uzak 200");
        assertEq(defter.ekonomik(address(ev.usdc)), 1000e6, "hak degismedi");

        /* 3. the swap, reported TAKAS */
        vm.recordLogs();
        uzakKasa.takasEt(id, 0, address(yurutucu), "");
        (r, ra) = _iris(address(uzak.mt));
        kasa.teslimAl(r, ra);
        assertEq(uint8(yon.durumu(id)), uint8(CrossChainCollateralManager2.Durum.TAKAS_EDILDI), "TAKAS_EDILDI");
        uint256 wethAlinan = weth.balanceOf(address(uzakKasa));
        assertGt(wethAlinan, 0, "weth alindi");
        assertEq(_kova(address(weth)).uzak, wethAlinan, "defterde weth uzak");
        assertEq(defter.ekonomik(address(ev.usdc)), 800e6, "dolar hakki 800 (kol sayilmaz)");

        /* 4. no recall while the dollars here cover the position */
        vm.expectRevert(CrossChainCollateralManager2.KuyrukYok.selector);
        yon.geriCagir(id);

        /* 5. redemptions draw the dollars below the position's size */
        vm.startPrank(alice);
        jeton.approve(address(kasa), type(uint256).max);
        kasa.iade(900e18);
        vm.stopPrank();
        assertLt(defter.harcanabilir(address(ev.usdc)), 200e6, "harcanabilir 200'un altinda");

        /* 6. recall -> SAT -> sell -> GERI_TAKAS -> home -> DONDU */
        vm.recordLogs();
        yon.geriCagir(id);
        (m, a) = _iris(address(ev.mt));
        uzakKasa.teslimAl(m, a);
        vm.recordLogs();
        uzakKasa.geriTakasEt(id, 0, address(yurutucu), "");
        (r, ra) = _iris(address(uzak.mt));
        vm.recordLogs();
        uzakKasa.arcaGonder(id);
        (bytes memory d, bytes memory da) = _iris(address(uzak.mt));

        /* out of order: the money before the report it depends on */
        vm.expectRevert();
        kasa.teslimAl(d, da);
        kasa.teslimAl(r, ra);      // GERI_TAKAS
        assertEq(uint8(yon.durumu(id)), uint8(CrossChainCollateralManager2.Durum.DONUYOR), "DONUYOR");
        uint256 once = ev.usdc.balanceOf(address(kasa));
        kasa.teslimAl(d, da);      // DONDU, now accepted
        uint256 donen = ev.usdc.balanceOf(address(kasa)) - once;
        assertGt(donen, 199e6, "~200 dondu");
        assertEq(uint8(yon.durumu(id)), uint8(CrossChainCollateralManager2.Durum.TAMAMLANDI), "TAMAMLANDI");

        /* the ledger and the balance agree to the unit */
        CrossChainAccounting.Kova memory k = _kova(address(ev.usdc));
        assertEq(k.yolda, 0, "yolda 0");
        assertEq(k.uzak, 0, "uzak 0");
        assertEq(_kova(address(weth)).uzak, 0, "weth uzak 0");
        assertEq(ev.usdc.balanceOf(address(kasa)), k.musait, "bakiye == musait");
        assertEq(uzak.usdc.balanceOf(address(uzakKasa)), 0, "uzak kasada para kalmadi");
        assertEq(weth.balanceOf(address(uzakKasa)), 0, "uzak kasada weth kalmadi");
    }

    function test_donusturulmemis_geri_cagirma_kuyrukla() public {
        bytes32 id = _gonderVeUlas(200e6);
        /* a redeemer wants more than is here: 1000 claim, 800 here */
        vm.startPrank(alice);
        jeton.approve(address(kasa), type(uint256).max);
        (uint256 odenen, uint256 kuyruga) = kasa.iade(900e18);
        vm.stopPrank();
        assertEq(odenen, 800e6, "800 hemen");
        assertEq(kuyruga, 100e6, "100 kuyrukta");

        vm.recordLogs();
        yon.geriCagir(id);
        (bytes memory m, bytes memory a) = _iris(address(ev.mt));
        vm.recordLogs();
        uzakKasa.teslimAl(m, a);                    // DONUS reported
        (bytes memory r, bytes memory ra) = _iris(address(uzak.mt));
        vm.recordLogs();
        uzakKasa.arcaGonder(id);
        (bytes memory d, bytes memory da) = _iris(address(uzak.mt));
        kasa.teslimAl(r, ra);
        kasa.teslimAl(d, da);
        assertEq(uint8(yon.durumu(id)), uint8(CrossChainCollateralManager2.Durum.TAMAMLANDI), "TAMAMLANDI");

        uint256 once = ev.usdc.balanceOf(alice);
        kasa.kuyrukOde(1);
        assertEq(ev.usdc.balanceOf(alice) - once, 100e6, "kuyruk odendi");
        CrossChainAccounting.Kova memory k = _kova(address(ev.usdc));
        assertEq(k.borc, 0, "borc kapandi");
        assertEq(ev.usdc.balanceOf(address(kasa)), k.musait, "bakiye == musait");
    }

    function test_sahte_fonlama_reddedilir() public {
        Sahte s = new Sahte();
        ev.usdc.mint(address(s), 1e6);
        bytes32 alici = _b(address(uzakKasa));
        vm.recordLogs();
        s.gonder(ev.tm, ev.usdc, UZAK, alici, abi.encode(uint8(0), uint256(1), address(weth), uint256(1e6), bytes32("x")));
        (bytes memory m, bytes memory a) = _iris(address(ev.mt));
        vm.expectRevert(abi.encodeWithSelector(RemoteCollateralVault2.KotuGonderen.selector, _b(address(s))));
        uzakKasa.teslimAl(m, a);
        assertEq(uzak.usdc.balanceOf(address(uzakKasa)), 0, "hicbir sey basilmadi");
    }

    function test_hedef_kurulumda_sabit() public {
        assertEq(kasa.hedefDomain(), UZAK);
        assertEq(kasa.hedefVarlik(), address(weth));
        /* only the launchpad builds vaults: a squatter cannot occupy the
           derived address the remote side trusts */
        vm.prank(address(0xBAD));
        vm.expectRevert(KasaFabrika2.SadeceLaunchpad.selector);
        kf.kur(CrossChainAssetRegistry(address(kayit)), address(ev.usdc), 2, address(ev.tm), address(ev.mt),
            IYakilabilirK3(address(jeton)), egri, acici, UZAK, address(weth));
    }

    function test_geri_cagirma_iki_kez_zararsiz() public {
        bytes32 id = _gonderVeUlas(200e6);
        vm.startPrank(alice);
        jeton.approve(address(kasa), type(uint256).max);
        kasa.iade(900e18);
        vm.stopPrank();
        vm.recordLogs();
        yon.geriCagir(id);
        (bytes memory m1, bytes memory a1) = _iris(address(ev.mt));
        vm.recordLogs();
        yon.geriCagir(id);
        (bytes memory m2, bytes memory a2) = _iris(address(ev.mt));
        uzakKasa.teslimAl(m1, a1);
        uzakKasa.teslimAl(m2, a2);   // finds nothing left, does not revert
        (, , uint256 donecek,) = uzakKasa.pozisyon(id);
        assertEq(donecek, 200e6, "bir kez ayrildi");
    }

    function test_dusmanca_yurutucu_tabana_takilir() public {
        bytes32 id = _gonderVeUlas(200e6);
        Hirsiz h = new Hirsiz(weth);
        vm.expectRevert();
        uzakKasa.takasEt(id, 0, address(h), "");
        (uint256 pq,,,) = uzakKasa.pozisyon(id);
        assertEq(pq, 200e6, "pozisyon yerinde");
    }

    /// The first generation against the same real CCTP: the mint lands in
    /// the remote vault and nothing can ever book or move it.
    function test_birinci_nesil_kusuru_olculur() public {
        RemoteVaultFactory.Besleyici[] memory b = new RemoteVaultFactory.Besleyici[](1);
        b[0] = RemoteVaultFactory.Besleyici(address(weth), address(bes), 18, 8, 3600);
        KasaFabrika kf1 = new KasaFabrika(new YoneticiFabrika());
        RemoteVaultFactory uf1 = new RemoteVaultFactory(EV, _b(address(kf1)), address(uzak.tm), address(uzak.mt),
            address(uzak.usdc), address(new HavuzYok()), b);
        CrossChainAssetRegistry.Zincir[] memory z = new CrossChainAssetRegistry.Zincir[](1);
        z[0] = CrossChainAssetRegistry.Zincir(UZAK, 8453, address(uf1), uf1.initKodHash(), address(uzak.usdc), "uzak");
        CrossChainAssetRegistry kayit1 = new CrossChainAssetRegistry(z);
        (address k1, address y1) = kf1.kur(kayit1, address(ev.usdc), 1, address(ev.tm), address(ev.mt),
            IYakilabilirK(address(jeton)), egri, acici);
        ev.usdc.mint(k1, 1000e6);
        KopruKasasi(k1).supur();
        RemoteCollateralVault uv1 = RemoteCollateralVault(uf1.kasaKur(1));

        vm.recordLogs();
        bytes32 id = CrossChainCollateralManager(y1).transferBaslat(UZAK, 200e6, false);
        (bytes memory m, bytes memory a) = _iris(address(ev.mt));
        /* destinationCaller is zero, so anyone submits — and CCTP mints */
        uzak.mt.receiveMessage(m, a);
        assertEq(uzak.usdc.balanceOf(address(uv1)), 200e6, "para uzak kasada");
        assertEq(uv1.bekleyenQuote(), 0, "ama kasa haberdar degil");
        vm.expectRevert();
        uv1.takasEt(200e6, 0, address(yurutucu), "");
        vm.expectRevert();
        uv1.arcaGonder(200e6, 0, 2000, id);
        /* and the home ledger keeps counting it in the holders' claim */
        assertEq(KopruKasasi(k1).defter().kova(address(ev.usdc)).yolda, 200e6, "evde yolda sayiliyor");
        assertEq(uint8(CrossChainCollateralManager(y1).durumu(id)), uint8(CrossChainCollateralManager.Durum.GONDERILDI), "sonsuza dek GONDERILDI");
    }
}
