// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {CrossChainAssetRegistry} from "../src/arc/CrossChainAssetRegistry.sol";
import {CrossChainAccounting} from "../src/arc/CrossChainAccounting.sol";
import {CrossChainAssetRegistry2} from "../src/arc/nesil2/CrossChainAssetRegistry2.sol";
import {KasaFabrika2, YoneticiFabrika2} from "../src/arc/nesil2/KasaFabrika2.sol";
import {KopruKasasi2} from "../src/arc/nesil2/KopruKasasi2.sol";
import {CrossChainCollateralManager2} from "../src/arc/nesil2/CrossChainCollateralManager2.sol";
import {RemoteVaultFactory2} from "../src/arc/nesil2/RemoteVaultFactory2.sol";
import {RemoteCollateralVault2} from "../src/arc/nesil2/RemoteCollateralVault2.sol";
import {PulseLaunchpad2, IQuoteP2} from "../src/arc/nesil2/PulseLaunchpad2.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PulseFabrika} from "../src/arc/PulseFabrika.sol";
import {PulseLikiditeKasasi} from "../src/arc/PulseLikiditeKasasi.sol";
import {TakasYurutucu, ISwapRouter02Y} from "../src/arc/nesil2/TakasYurutucu.sol";

interface IERC20C {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function totalSupply() external view returns (uint256);
}
interface IMTC {
    function attesterManager() external view returns (address);
    function enableAttester(address) external;
    function setSignatureThreshold(uint256) external;
    function receiveMessage(bytes calldata, bytes calldata) external returns (bool);
}
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256);
}

/// The executor a keeper would run on the remote chain: routes the vault's
/// loan through Arbitrum's real Uniswap v3 USDC/WETH 0.05% pool.
contract BaseYurutucu {
    ISwapRouter02 constant R = ISwapRouter02(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45);   // Arbitrum SwapRouter02
    function takasCagrisi(address verilen, uint256 miktar, address alinan, uint256 asgari, bytes calldata) external {
        IERC20C(verilen).approve(address(R), miktar);
        R.exactInputSingle(ISwapRouter02.ExactInputSingleParams(verilen, alinan, 500, msg.sender, miktar, asgari, 0));
    }
}

/// Second generation, end to end, on forks of Base and Arbitrum mainnet: a real
/// launch on Base Uniswap v4, Circle deployed CCTP V2 on both chains
/// (only the attester set is swapped for a test key, via the attester
/// manager own role), real swaps on Arbitrum. Nothing is sent to mainnet.
contract HavuzCevapsiz {
    function quoteIleAlinabilir(address, uint256) external pure returns (uint256, address, int24) { revert(); }
    function quoteKarsiligi(address, uint256) external pure returns (uint256, address, int24) { revert(); }
}

contract NesilCatalTest is Test {
    /* home: Base (domain 6, Uniswap v4); remote: Arbitrum (domain 3).
       Arc itself cannot be forked faithfully: its native USDC moves balances
       through a precompile (0x1800..00) that revm does not have. */
    uint32 constant ARC = 6;
    uint32 constant BASE = 3;
    address constant MT = 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64;
    address constant TM = 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d;
    address constant ARC_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;      // home dollar: Base USDC
    address constant ARC_PM = 0x498581fF718922c3f8e6A244956aF099B2652b2b;        // Base v4 PoolManager
    address constant BASE_USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;     // remote dollar: Arbitrum USDC
    address constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;          // Arbitrum WETH
    address constant ETH_USD = 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612;       // Chainlink ETH/USD, Arbitrum
    address constant HAVUZ_FIYAT = 0x00000000000000000000000000000000000BeeF0;   // no pool source: etched, always "no answer"
    uint256 constant PK = 0xC0FFEE;
    bytes32 constant OLAY = keccak256("MessageSent(bytes)");
    bytes32 constant TUZ = keccak256("arc-pulse nesil2 base");

    uint256 arcF;
    uint256 baseF;
    uint256 nonceTohum = uint256(keccak256("catal"));

    KasaFabrika2 kf;
    PulseLaunchpad2 lp;
    RemoteVaultFactory2 uf;
    address kurucu = address(0xF0F0);

    function _attesterKur() internal {
        IMTC mt = IMTC(MT);
        vm.startPrank(mt.attesterManager());
        mt.enableAttester(vm.addr(PK));
        mt.setSignatureThreshold(1);
        vm.stopPrank();
    }

    /// The last MessageSent of the selected fork's transmitter at index
    /// `kacinci` from the end, completed and signed as Iris would.
    function _iris(Vm.Log[] memory l, uint256 kacinci) internal returns (bytes memory m, bytes memory imza) {
        uint256 bulunan;
        for (uint256 i = l.length; i > 0; i--) {
            if (l[i - 1].emitter == MT && l[i - 1].topics[0] == OLAY) {
                if (bulunan == kacinci) { m = abi.decode(l[i - 1].data, (bytes)); break; }
                bulunan++;
            }
        }
        require(m.length > 0, "mesaj yok");
        bytes32 n = keccak256(abi.encode(nonceTohum++));
        assembly { mstore(add(add(m, 32), 12), n) }
        bytes4 f = bytes4(uint32(2000));
        for (uint256 j = 0; j < 4; j++) m[144 + j] = f[j];
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK, keccak256(m));
        imza = abi.encodePacked(r, s, v);
    }

    function _ufArgs(address _kf) internal pure returns (bytes memory) {
        RemoteVaultFactory2.Besleyici[] memory b = new RemoteVaultFactory2.Besleyici[](1);
        b[0] = RemoteVaultFactory2.Besleyici(WETH, ETH_USD, 18, 8, 7200);
        return abi.encode(ARC, _kf, keccak256(type(KopruKasasi2).creationCode), TM, MT, BASE_USDC, HAVUZ_FIYAT, b);
    }

    function setUp() public {
        arcF = vm.createFork("base");
        baseF = vm.createFork("arbitrum");
    }

    function test_base_arbitrum_tam_tur() public {
        /* ================= Arc: the launch stack ================= */
        vm.selectFork(arcF);
        _attesterKur();
        address ben = address(this);
        uint64 n0 = vm.getNonce(ben);
        /* order: yf n0, kayit n0+1, kf n0+2, fab n0+3, lk n0+4, lp n0+5 */
        address kfAdr = vm.computeCreateAddress(ben, n0 + 2);
        address lpAdr = vm.computeCreateAddress(ben, n0 + 5);
        address hook = address(uint160((uint256(keccak256("pulse-hook-nesil2")) & ~uint256(0x3FFF)) | 0xACC));
        bytes32 ufHash = keccak256(abi.encodePacked(type(RemoteVaultFactory2).creationCode, _ufArgs(kfAdr)));
        address ufAdr = vm.computeCreate2Address(TUZ, ufHash, ben);

        YoneticiFabrika2 yf = new YoneticiFabrika2();
        CrossChainAssetRegistry2.Zincir[] memory z = new CrossChainAssetRegistry2.Zincir[](1);
        z[0] = CrossChainAssetRegistry2.Zincir(BASE, 42161, ufAdr, keccak256(type(RemoteCollateralVault2).creationCode), BASE_USDC, "base");
        CrossChainAssetRegistry2 kayit = new CrossChainAssetRegistry2(ARC, z);
        kf = new KasaFabrika2(yf, lpAdr);
        assertEq(address(kf), kfAdr, "kf tahmin edilen adreste");
        PulseFabrika fab = new PulseFabrika();
        PulseLikiditeKasasi lk = PulseLikiditeKasasi(deployCode("PulseLikiditeKasasi.sol:PulseLikiditeKasasi", abi.encode(ARC_USDC, lpAdr)));
        address devPool = address(0xDE7);
        lp = new PulseLaunchpad2(
            IQuoteP2(ARC_USDC), IPoolManager(ARC_PM), IHooks(hook),
            fab, kf, devPool, address(lk), address(0x15E7), address(kayit), TM, MT);
        assertEq(address(lp), lpAdr, "launchpad tahmin edilen adreste");
        deployCodeTo("PulseHook.sol:PulseHook", abi.encode(ARC_PM, lpAdr, ARC_USDC, devPool, address(lk), address(0x15E7)), hook);

        /* ================= Arc: a launch whose collateral targets WETH on Base ================= */
        deal(ARC_USDC, kurucu, 2000e6);
        vm.startPrank(kurucu);
        IERC20C(ARC_USDC).approve(address(lp), type(uint256).max);
        (address token, address kasaAdr) = lp.launch("Catal Test", "CTL", BASE, WETH, 20_000, 200e6, 600e6);
        vm.stopPrank();
        KopruKasasi2 kasa = KopruKasasi2(kasaAdr);
        CrossChainCollateralManager2 yon = CrossChainCollateralManager2(kf.yoneticiOf(1));
        CrossChainAccounting defter = kasa.defter();
        assertEq(kasaAdr, kf.kasaAdresi(1), "kasa CREATE2 adresinde");
        assertEq(kasa.hedefDomain(), BASE);
        assertEq(defter.ekonomik(ARC_USDC), 600e6, "teminat 600");

        vm.recordLogs();
        bytes32 id = yon.transferBaslat(120e6);
        (bytes memory m1, bytes memory a1) = _iris(vm.getRecordedLogs(), 0);

        /* ================= Base: the remote factory, delivery, a real swap ================= */
        vm.selectFork(baseF);
        _attesterKur();
        vm.etch(HAVUZ_FIYAT, type(HavuzCevapsiz).runtimeCode);
        uf = new RemoteVaultFactory2{salt: TUZ}(ARC, kfAdr, keccak256(type(KopruKasasi2).creationCode), TM, MT, BASE_USDC, HAVUZ_FIYAT,
            _besleyiciler());
        assertEq(address(uf), ufAdr, "uzak fabrika Arc'in turettigi adreste");
        assertEq(uf.evKasasi(1), kasaAdr, "ev kasasi ayni turetiliyor");
        RemoteCollateralVault2 uk = RemoteCollateralVault2(uf.kasaKur(1));

        vm.recordLogs();
        uk.teslimAl(m1, a1);
        assertEq(IERC20C(BASE_USDC).balanceOf(address(uk)), 120e6, "Base'de gercek USDC basildi");
        /* the production executor, with a real Uniswap v3 path */
        TakasYurutucu yr = new TakasYurutucu(ISwapRouter02Y(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45));
        uk.takasEt(id, 0, address(yr), abi.encode(abi.encodePacked(BASE_USDC, uint24(500), WETH)));
        uint256 weth = IERC20C(WETH).balanceOf(address(uk));
        assertGt(weth, 0, "gercek havuzdan WETH alindi");
        Vm.Log[] memory lb = vm.getRecordedLogs();
        (bytes memory rTakas, bytes memory aTakas) = _iris(lb, 0);
        (bytes memory rUlasti, bytes memory aUlasti) = _iris(lb, 1);

        /* ================= Arc: reports land, the founder redeems ================= */
        vm.selectFork(arcF);
        kasa.teslimAl(rUlasti, aUlasti);
        kasa.teslimAl(rTakas, aTakas);
        assertEq(uint8(yon.durumu(id)), uint8(CrossChainCollateralManager2.Durum.TAKAS_EDILDI), "TAKAS_EDILDI");
        assertEq(defter.kova(WETH).uzak, weth, "defterde WETH");
        assertEq(defter.ekonomik(ARC_USDC), 480e6, "dolar hakki 480");

        uint256 kurucuToken = IERC20C(token).balanceOf(kurucu);
        vm.startPrank(kurucu);
        IERC20C(token).approve(kasaAdr, type(uint256).max);
        kasa.iade(kurucuToken * 9 / 10);
        vm.stopPrank();
        assertLt(defter.harcanabilir(ARC_USDC), 120e6, "harcanabilir pozisyonun altina dustu");

        vm.recordLogs();
        yon.geriCagir(id);
        (bytes memory mSat, bytes memory aSat) = _iris(vm.getRecordedLogs(), 0);

        /* ================= Base: sell on the real pool, send home ================= */
        vm.selectFork(baseF);
        vm.recordLogs();
        uk.teslimAl(mSat, aSat);
        uk.geriTakasEt(id, 0, address(yr), abi.encode(abi.encodePacked(WETH, uint24(500), BASE_USDC)));
        uk.arcaGonder(id);
        lb = vm.getRecordedLogs();
        (bytes memory mDondu, bytes memory aDondu) = _iris(lb, 0);
        (bytes memory mGeri, bytes memory aGeri) = _iris(lb, 1);
        assertEq(IERC20C(BASE_USDC).balanceOf(address(uk)), 0, "uzak kasada USDC kalmadi");
        assertEq(IERC20C(WETH).balanceOf(address(uk)), 0, "uzak kasada WETH kalmadi");

        /* ================= Arc: the money comes home ================= */
        vm.selectFork(arcF);
        kasa.teslimAl(mGeri, aGeri);
        uint256 once = IERC20C(ARC_USDC).balanceOf(kasaAdr);
        kasa.teslimAl(mDondu, aDondu);
        uint256 donen = IERC20C(ARC_USDC).balanceOf(kasaAdr) - once;
        emit log_named_uint("eve donen USDC (6 ondalik)", donen);
        assertGt(donen, 110e6, "~120 dondu (iki takas kaymasi dusuldu)");
        assertEq(uint8(yon.durumu(id)), uint8(CrossChainCollateralManager2.Durum.TAMAMLANDI), "TAMAMLANDI");
        CrossChainAccounting.Kova memory k = defter.kova(ARC_USDC);
        assertEq(k.yolda + k.uzak, 0, "yolda/uzak bos");
        assertEq(defter.kova(WETH).uzak, 0, "WETH defterden cikti");
        assertEq(IERC20C(ARC_USDC).balanceOf(kasaAdr), k.musait, "bakiye == musait");
    }

    function _besleyiciler() internal pure returns (RemoteVaultFactory2.Besleyici[] memory b) {
        b = new RemoteVaultFactory2.Besleyici[](1);
        b[0] = RemoteVaultFactory2.Besleyici(WETH, ETH_USD, 18, 8, 7200);
    }
}

