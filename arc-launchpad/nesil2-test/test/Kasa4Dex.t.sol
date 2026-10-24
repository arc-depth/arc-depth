// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IHaberci, IHaberAlici, IERC20S, SepetMesaj, Adres} from "../src/arc/sepet/IHaberci.sol";
import {SepetKasasi, IV3Fabrika, IV3Havuz} from "../src/arc/sepet4/SepetKasasi.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IERC20D {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function decimals() external view returns (uint8);
}

/// This chain's messenger, as the vault sees it: it hands an order over with
/// its dollars (the real HaberciLZ does the same after LayerZero + CCTP), it
/// records payouts, and its `isle` delivers an order that was waiting for
/// its dollars.
contract Haberci4 is IHaberci {
    uint32 public immutable zincir;
    IERC20S public immutable usdc;
    mapping(bytes32 => uint256) public odenen;
    struct Bekleyen { address hedef; bytes veri; uint256 m; }
    Bekleyen[] public kuyruk;
    constructor(uint32 z, IERC20S u) { zincir = z; usdc = u; }
    function gonder(uint32, bytes32 alici, bytes calldata, uint256 m) external {
        usdc.transferFrom(msg.sender, address(this), m);
        odenen[alici] += m;
    }
    function teslim(address hedef, bytes memory veri, uint256 m, bytes32 defter) external {
        if (m > 0) usdc.transfer(hedef, m);
        IHaberAlici(hedef).haberAl(26, defter, veri, m);
    }
    function beklet(address hedef, bytes memory veri, uint256 m) external { kuyruk.push(Bekleyen(hedef, veri, m)); }
    bytes32 public defterAdi;
    function defterKur(bytes32 d) external { defterAdi = d; }
    function isle() external {
        for (uint256 i = 0; i < kuyruk.length; i++) {
            Bekleyen memory b = kuyruk[i];
            if (b.hedef == address(0)) continue;
            delete kuyruk[i];
            usdc.transfer(b.hedef, b.m);
            IHaberAlici(b.hedef).haberAl(26, defterAdi, b.veri, b.m);
        }
    }
}

/// Moves a Uniswap v3 pool's price, as a sandwicher would.
contract Iten {
    function it(address p, bool zf1, int256 m, address girdi) external {
        IV3Havuz(p).swap(address(this), zf1, m, zf1 ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1, abi.encode(girdi));
    }
    /// Push the price `tick` ticks in the swap's direction (as far as `m` allows).
    function itTick(address p, bool zf1, int256 m, address girdi, int24 tick) external {
        (, int24 t,,,,,) = IV3Havuz(p).slot0();
        IV3Havuz(p).swap(address(this), zf1, m, TickMath.getSqrtPriceAtTick(zf1 ? t - tick : t + tick), abi.encode(girdi));
    }
    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata v) public {
        address g = abi.decode(v, (address));
        IERC20D(g).transfer(msg.sender, uint256(a0 > 0 ? a0 : a1));
    }
    function hyperswapV3SwapCallback(int256 a0, int256 a1, bytes calldata v) external { uniswapV3SwapCallback(a0, a1, v); }
}

/// v4 vaults buy and sell in the chain's own Uniswap v3 pools, within ~3% of
/// the pool's 30-minute average, on a fork of Base and of Arbitrum with the
/// real pools. Measured: a $50 buy lands within the limit of the average
/// price; a price pushed past the limit stops the buy and the rest waits;
/// once the price is back anyone finishes it and takes the tip; a two-step
/// route (through WETH) for an asset with no USDC pool; a redemption sells
/// the holder's share for dollars; one whose sale the limit stops hands the
/// rest over in kind.
abstract contract Kasa4DexTaban is Test {
    bytes32 constant DEFTER = bytes32(uint256(0xDEF7E5));
    address constant SAHIP = address(0x5A41B);
    Haberci4 h;
    SepetKasasi k;
    IERC20S usdc;
    address weth;
    IV3Fabrika fabrika;

    function _zincir() internal virtual returns (string memory);
    function _adresler() internal virtual returns (address usdc_, address weth_, address fabrika_, uint32 domain);
    function _ikiAdimAdaylari() internal virtual returns (address[] memory);

    function setUp() public {
        vm.createSelectFork(_zincir());
        (address u, address w, address f, uint32 d) = _adresler();
        usdc = IERC20S(u); weth = w; fabrika = IV3Fabrika(f);
        h = new Haberci4(d, usdc);
        h.defterKur(DEFTER);
        k = new SepetKasasi(IHaberci(address(h)), usdc, 26, DEFTER, fabrika, weth);
    }

    function _al(uint64 l, address v, uint256 m) internal {
        deal(address(usdc), address(h), m);
        h.teslim(address(k), abi.encode(SepetMesaj.AL, l, Adres.b32(v), uint256(1)), m, DEFTER);
    }

    /// Units `m` dollars buy at `p`'s 30-minute average (no fee).
    function _twapBirim(address p, address girdi, address cikti, uint256 m) internal view returns (uint256) {
        uint32[] memory s = new uint32[](2);
        s[0] = 1800;
        (int56[] memory tc,) = IV3Havuz(p).observe(s);
        int24 t = int24((tc[1] - tc[0]) / 1800);
        uint256 sp = TickMath.getSqrtPriceAtTick(t);
        uint256 fiyat = (sp * sp) >> 96;   // token1 per token0, Q96
        return girdi < cikti ? (m * fiyat) >> 96 : (m << 96) / fiyat;
    }

    function _enIyi(address a, address b) internal view returns (address enIyi) {
        uint24[4] memory u = [uint24(100), 500, 3000, 10000];
        uint128 L;
        for (uint256 i = 0; i < 4; i++) {
            address p = fabrika.getPool(a, b, u[i]);
            if (p == address(0)) continue;
            uint128 l = IV3Havuz(p).liquidity();
            if (l > L) { L = l; enIyi = p; }
        }
    }

    function test_alim_twap_icinde() public {
        (bool yol, bool iki, bool simdi) = k.havuzVar(weth);
        assertTrue(yol && !iki && simdi, "USDC/WETH havuzu secilebilir");
        uint256 beklenen = _twapBirim(_enIyi(address(usdc), weth), address(usdc), weth, 50e6);
        _al(1, weth, 50e6);
        uint256 b = k.bakiye(1, weth);
        emit log_named_uint("50 $ ile alinan WETH (wei)", b);
        emit log_named_uint("TWAP'a gore (wei)", beklenen);
        assertGt(b, (beklenen * 965) / 1000, "TWAP'in %3,5'inden kotu degil (ucret dahil)");
        assertEq(k.alimBekleyen(1, weth), 0, "dolarin tamami harcandi");
        assertEq(IERC20D(weth).balanceOf(address(k)), b, "kasadaki WETH = defterdeki");
    }

    function test_sandvic_sinirda_durur_sonra_bahsisle_biter() public {
        address p = _enIyi(address(usdc), weth);
        Iten it = new Iten();
        /* a sandwicher pushes WETH up hard just before the vault's buy */
        uint256 cok = 150_000_000e6;
        deal(address(usdc), address(it), cok);
        it.itTick(p, address(usdc) < weth, int256(cok), address(usdc), 700);
        _al(1, weth, 50e6);
        uint256 bekleyen = k.alimBekleyen(1, weth);
        emit log_named_uint("sinirda bekleyen dolar", bekleyen);
        assertGt(bekleyen, 0, "fiyat sinirin otesinde: dolar bekliyor");
        /* the price comes back (the sandwicher sells), anyone finishes the buy and takes the tip */
        uint256 wethElde = IERC20D(weth).balanceOf(address(it));
        it.itTick(p, weth < address(usdc), int256(wethElde), weth, 700);
        address ben = makeAddr("deneyen");
        vm.prank(ben);
        k.dene(1, weth);
        assertEq(usdc.balanceOf(ben), 50_000, "dene cagirana 0,05 $");
        assertLt(k.alimBekleyen(1, weth), bekleyen, "bekleyen dolar harcandi");
        assertGt(k.bakiye(1, weth), 0);
    }

    function test_iki_adim_weth_uzerinden() public {
        address[] memory a = _ikiAdimAdaylari();
        address v;
        for (uint256 i = 0; i < a.length; i++) {
            address d = _enIyi(address(usdc), a[i]);
            if ((d == address(0) || usdc.balanceOf(d) < 5_000e6) && _enIyi(weth, a[i]) != address(0)) { v = a[i]; break; }
        }
        if (v == address(0)) { emit log("iki adimli aday bulunamadi"); return; }
        (bool yol, bool iki,) = k.havuzVar(v);
        assertTrue(yol && iki, "WETH uzerinden yol");
        _al(2, v, 50e6);
        emit log_named_address("varlik", v);
        emit log_named_uint("alinan birim", k.bakiye(2, v));
        assertGt(k.bakiye(2, v) + k.alimBekleyen(2, v), 0);
        assertLt(k.alimBekleyen(2, v), 50e6, "en az bir kismi alindi");
    }

    function test_itfa_payi_satilir_dolar_odenir() public {
        _al(1, weth, 50e6);
        uint256 b = k.bakiye(1, weth);
        bytes32[] memory v = new bytes32[](1);
        v[0] = Adres.b32(weth);
        /* a tenth of the supply redeemed, paid on another chain */
        h.teslim(address(k), abi.encode(SepetMesaj.SAT, uint64(1), v, uint256(1e26), uint256(1e27), uint32(99), Adres.b32(SAHIP)), 0, DEFTER);
        uint256 odenen = h.odenen(Adres.b32(SAHIP));
        emit log_named_uint("itfa: odenen dolar (6 ond.)", odenen);
        assertEq(k.bakiye(1, weth), b - b / 10, "payin onda biri kasadan cikti");
        assertGt(odenen, (5e6 * 95) / 100, "payin dolari ~5 $ (ucret ve kayma dusuldu)");
        assertEq(IERC20D(weth).balanceOf(SAHIP), 0, "hepsi satildi, ayni birim verilmedi");
    }

    function test_itfa_sinirda_kalan_ayni_verilir() public {
        _al(1, weth, 50e6);
        uint256 b = k.bakiye(1, weth);
        address p = _enIyi(address(usdc), weth);
        Iten it = new Iten();
        /* the price pushed DOWN past the limit: the vault will not sell there */
        uint256 cok = 60_000e18;
        deal(weth, address(it), cok);
        it.itTick(p, weth < address(usdc), int256(cok), weth, 700);
        bytes32[] memory v = new bytes32[](1);
        v[0] = Adres.b32(weth);
        h.teslim(address(k), abi.encode(SepetMesaj.SAT, uint64(1), v, uint256(1e26), uint256(1e27), uint32(99), Adres.b32(SAHIP)), 0, DEFTER);
        assertEq(IERC20D(weth).balanceOf(SAHIP), b / 10, "satilamayan pay sahibin EVM adresine, varligin kendisi");
        assertEq(k.ihaleSayisi(), 0, "ihale acilmadi");
    }

    function test_isleVeAl_bahsis() public {
        deal(address(usdc), address(h), 50e6);
        h.beklet(address(k), abi.encode(SepetMesaj.AL, uint64(1), Adres.b32(weth), uint256(1)), 50e6);
        address ben = makeAddr("yurutucu");
        vm.prank(ben);
        k.isleVeAl();
        assertEq(usdc.balanceOf(ben), 50_000, "bekleyen emri yurutene 0,05 $");
        assertGt(k.bakiye(1, weth), 0, "emir yurudu, WETH alindi");
    }

    function test_yolsuz_varlik_ihaleye() public {
        address yok = address(0xC0FFEE);
        _al(3, yok, 10e6);
        assertEq(k.ihaleSayisi(), 1, "havuzu olmayan varlik: v2 ihalesi");
        assertEq(k.usdcBakiye(3), 10e6);
    }

    function test_takas_geri_cagrisi_yalniz_havuzdan() public {
        vm.expectRevert(SepetKasasi.SadeceHavuz.selector);
        k.uniswapV3SwapCallback(1, 0, abi.encode(address(usdc)));
    }
}

contract Kasa4DexBase is Kasa4DexTaban {
    function _zincir() internal pure override returns (string memory) { return "base"; }
    function _adresler() internal pure override returns (address, address, address, uint32) {
        return (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, 0x4200000000000000000000000000000000000006, 0x33128a8fC17869897dcE68Ed026d694621f6FDfD, 6);
    }
    function _ikiAdimAdaylari() internal pure override returns (address[] memory a) {
        a = new address[](7);
        a[4] = 0x9a26F5433671751C3276a065f57e5a02D2817973;   // KEYCAT
        a[5] = 0xF6e932Ca12afa26665dC4dDE7e27be02A7c02e50;   // MOCHI
        a[6] = 0x768BE13e1680b5ebE0024C42c896E3dB59ec0149;   // SKI
        a[0] = 0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4;   // TOSHI
        a[1] = 0x532f27101965dd16442E59d40670FaF5eBB142E4;   // BRETT
        a[2] = 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed;   // DEGEN
        a[3] = 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b;   // VIRTUAL
    }
}

contract Kasa4DexArbitrum is Kasa4DexTaban {
    function _zincir() internal pure override returns (string memory) { return "arbitrum"; }
    function _adresler() internal pure override returns (address, address, address, uint32) {
        return (0xaf88d065e77c8cC2239327C5EDb3A432268e5831, 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1, 0x1F98431c8aD98523631AE4a59f267346ea31F984, 3);
    }
    function _ikiAdimAdaylari() internal pure override returns (address[] memory a) {
        a = new address[](5);
        a[3] = 0x3d9907F9a368ad0a51Be60f7Da3b97cf940982D8;   // GRAIL
        a[4] = 0x3082CC23568eA640225c2467653dB90e9250AaA0;   // RDNT
        a[0] = 0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a;   // GMX
        a[1] = 0x912CE59144191C1204E64559FE8253a0e49E6548;   // ARB
        a[2] = 0x5979D7b546E38E414F7E9822514be443A4800529;   // wstETH
    }
}

/// HyperEVM has no official Uniswap; HyperSwap V3 is a Uniswap v3 fork. Run
/// the same suite against it before the deployment enables it there.
contract Kasa4DexHyperEvm is Kasa4DexTaban {
    function _zincir() internal pure override returns (string memory) { return "hyperevm"; }
    function _adresler() internal pure override returns (address, address, address, uint32) {
        return (0xb88339CB7199b77E23DB6E890353E22632Ba630f, 0x5555555555555555555555555555555555555555, 0xB1c0fa0B789320044A6F623cFe5eBda9562602E3, 19);
    }
    function _ikiAdimAdaylari() internal pure override returns (address[] memory a) {
        a = new address[](0);
    }
}
