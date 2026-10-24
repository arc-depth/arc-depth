// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHaberci, IHaberAlici, IERC20S, SepetMesaj, Adres} from "./IHaberci.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// Uniswap v3, as much of it as the vault uses: the factory to find a pool,
/// the pool's own oracle and swap. No router: the vault pays the pool in the
/// swap callback itself.
interface IV3Fabrika {
    function getPool(address a, address b, uint24 fee) external view returns (address);
}

interface IV3Havuz {
    function liquidity() external view returns (uint128);
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool);
    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory, uint160[] memory);
    function increaseObservationCardinalityNext(uint16 n) external;
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data)
        external returns (int256 amount0, int256 amount1);
}

/// Dolar6 (BNB): the vault's dollar is a 6-decimal wrap of Binance-Peg USDC
/// (18 decimals), which is what the pools hold.
interface ISarici6 {
    function sar(uint256 birim) external returns (uint256);
    function coz(uint256 birim) external returns (uint256);
}

/// The chain's HaberciLZ: carries out the orders whose dollars have arrived.
interface IHaberciIsle {
    function isle() external;
}

/// @title SepetKasasi — the basket assets that live on this chain
///
/// One per chain. It holds, for every launch whose basket names an asset on
/// this chain, that launch's units of it, in its own ledger: a launch's
/// money can never pay another launch, and nothing outside the ledger
/// (an airdrop, a donation, a flash balance) counts toward anyone's share.
///
/// HOW IT BUYS AND SELLS (v4, 23 Oct 2026; v6, 24 Oct: every chain)
///   v6: Uniswap v3 and its forks with the same pool interface (PancakeSwap
///   v3 on BNB: five fee tiers incl. 2500, its own callback name and a
///   slot0 that is read raw because its fee field is wider; HyperSwap V3 on
///   HyperEVM; Uniswap v3 on Monad and Robinhood). Where the vault's dollar
///   is a wrap of the pools' dollar (`ham`, BNB: Dolar6 over Binance-Peg
///   USDC) it unwraps before a buy and wraps what a sale brings. Arc's vault
///   is SepetKasasiArc (Uniswap v4, a slowly moving reference price).
///   Where this chain has Uniswap v3 (`fabrika` set at deployment), the
///   vault swaps on arrival, in the same call that brings the dollars:
///     - the pool is found at swap time, ownerless: the USDC/asset pool of
///       the four fee tiers with the most in-range liquidity, or, without
///       one, two steps through the chain's wrapped native coin (`weth`);
///     - the price may be at most KAYMA_TICK (~3%) worse than the pool's own
///       PENCERE (30 minute) time-weighted average, enforced as the swap's
///       price limit. A sandwich can cost at most that; past it the swap
///       stops and the rest of the dollars wait (`alimBekleyen`) for the
///       next delivery or for anyone's `dene`, which pays a fixed tip;
///     - a pool too young for a 30 minute average gets its oracle grown here
///       (increaseObservationCardinalityNext) and the dollars wait.
///   A redemption sells the holder's share the same way and pays dollars;
///   what the price limit leaves unsold goes to the holder's own EVM
///   address on this chain as the asset itself.
///   v2 ran reverse Dutch auctions only, and nobody filled them (PTEST2,
///   22 Oct). They remain, unchanged, as the fallback: an asset with no
///   Uniswap v3 route here, a chain with none (fabrika = 0), and an unsold
///   share owed to an address that is not an EVM one.
///
/// THE AUCTION (fallback)
///   buy   it offers `usdc` dollars for at least Q(t) units of the asset
///   sell  it offers `miktar` units for at least P(t) dollars
///   Q and P start at BASLANGIC_KAT times the last price this vault traded
///   at (or the founder's quote, for the first buy) and halve every
///   YARILANMA, never below 1 / TABAN_KAT of the start; one resting there
///   for BEKLEME restarts from it.
///
/// WHAT LEAVES, AND HOW
///   Only a redemption ordered by the Defter, and the tips above. No owner,
///   no pause, no withdrawal, no sweep.
contract SepetKasasi is IHaberAlici {
    IHaberci public immutable haberci;
    IERC20S public immutable usdc;
    uint32 public immutable defterZincir;
    bytes32 public immutable defter;
    /// Uniswap v3 on this chain (zero: none, auctions only) and the wrapped
    /// native coin the two-step route goes through.
    IV3Fabrika public immutable fabrika;
    address public immutable weth;
    /// The dollar the pools hold: `usdc` itself, or (BNB) the token `usdc`
    /// wraps, `olcek` of its smallest units per smallest unit of `usdc`.
    address public immutable ham;
    uint256 public immutable olcek;

    uint256 public constant BASLANGIC_KAT = 2;
    uint256 public constant TABAN_KAT = 16;
    uint256 public constant YARILANMA = 30 minutes;
    uint256 public constant BEKLEME = 1 days;

    uint32 public constant PENCERE = 1800;
    int24 public constant KAYMA_TICK = 300;
    uint16 public constant GOZLEM = 60;
    /// What whoever pushes a launch's dollars into the pool, or carries its
    /// arrived order out, receives from those dollars ($0.05), and the least
    /// a push must move to earn it ($1).
    uint256 public constant BAHSIS = 50_000;
    uint256 public constant BAHSIS_ESIK = 1_000_000;
    /// Gas a pool swap (with its route search) is given room for. An order
    /// delivered with less (LayerZero's lzReceive runs with a fixed budget,
    /// 600k from Arc) does not try: a buy's dollars wait for `dene` / the
    /// next delivery, a redemption's share goes to the holder in kind.
    uint256 public constant TAKAS_GAZ = 350_000;
    /// A direct USDC pool holding less than this many dollars is passed over
    /// for the route through weth when that exists: an all-but-empty pool
    /// would stop every buy at the price limit after a few cents.
    uint256 public constant DERINLIK = 5_000e6;

    /* ---- the ledger: launch => asset => units ---------------------- */
    mapping(uint64 => mapping(address => uint256)) public bakiye;
    /// Dollars a launch holds here that sit in its buy auctions (fallback).
    /// A redemption takes its share of them directly.
    mapping(uint64 => uint256) public usdcBakiye;
    /// The dollars a launch's open buy auctions were opened with (see v2).
    mapping(uint64 => uint256) public taahhut;
    /// Dollars a launch holds here for an asset with a Uniswap route that the
    /// price limit (or a young oracle) has not let spend yet.
    mapping(uint64 => mapping(address => uint256)) public alimBekleyen;

    /// The last price this vault traded at, per asset: so many dollars, so many units.
    struct Fiyat { uint128 usdc; uint128 varlik; }
    mapping(address => Fiyat) public sonFiyat;

    uint8 internal constant ALIM = 1;
    uint8 internal constant SATIM = 2;

    struct Ihale {
        uint8 tur;
        uint64 launchId;
        address varlik;
        uint256 verilen;     // ALIM: dollars offered; SATIM: units offered
        uint256 baslangic;   // ALIM: Q0 units wanted; SATIM: P0 dollars wanted
        uint64 baslama;
        uint32 hedefZincir;  // SATIM: where the holder is paid
        bytes32 alici;       // SATIM: the holder, on their chain
        bool bitti;
    }
    Ihale[] public ihaleler;

    bool private _kilit;
    /// the pool a swap of ours is running in: the only caller its callback trusts
    address private _havuz;
    /// set while `isleVeAl` drives the messenger: tips owed to its caller
    bool private _tetik;
    uint256 private _tetikBahsis;

    event Ilan(uint256 indexed id, uint8 tur, uint64 indexed launchId, address indexed varlik, uint256 verilen, uint256 baslangic);
    event Doldu(uint256 indexed id, address indexed dolduran, uint256 verilen, uint256 alinan);
    event Yeniden(uint256 indexed id, uint256 baslangic);
    event Alindi(uint64 indexed launchId, address indexed varlik, uint256 dolar, uint256 birim);
    event Satildi(uint64 indexed launchId, address indexed varlik, uint256 birim, uint256 dolar);
    event Bekliyor(uint64 indexed launchId, address indexed varlik, uint256 dolar);
    event Verildi(uint64 indexed launchId, address indexed varlik, address indexed alici, uint256 birim);
    event Bahsis(address indexed alan, uint256 dolar);

    error SadeceHaberci();
    error SadeceDefter();
    error KotuMesaj();
    error Bitti();
    error Az();
    error Erken();
    error Sifir();
    error TransferOlmadi();
    error Yeniden_();
    error SadeceHavuz();

    modifier kilitli() {
        if (_kilit) revert Yeniden_();
        _kilit = true;
        _;
        _kilit = false;
    }

    constructor(IHaberci _haberci, IERC20S _usdc, uint32 _defterZincir, bytes32 _defter, IV3Fabrika _fabrika, address _weth,
        address _ham, uint256 _olcek)
    {
        haberci = _haberci;
        usdc = _usdc;
        defterZincir = _defterZincir;
        defter = _defter;
        fabrika = _fabrika;
        weth = _weth;
        ham = _ham == address(0) ? address(_usdc) : _ham;
        olcek = _ham == address(0) ? 1 : _olcek;
    }

    /* ---- orders, from the Defter only ------------------------------ */

    function haberAl(uint32 kaynakZincir, bytes32 kaynak, bytes calldata veri, uint256 gelen) external kilitli {
        if (msg.sender != address(haberci)) revert SadeceHaberci();
        if (kaynakZincir != defterZincir || kaynak != defter) revert SadeceDefter();
        uint8 tur = uint8(uint256(bytes32(veri[:32])));
        if (tur == SepetMesaj.AL) {
            (, uint64 l, bytes32 varlik32, uint256 refVarlik) = abi.decode(veri, (uint8, uint64, bytes32, uint256));
            if (gelen == 0) revert Sifir();
            /* whoever drove the messenger to carry this out (isleVeAl) earns the tip, from these dollars */
            if (_tetik && gelen >= BAHSIS_ESIK + BAHSIS) {
                gelen -= BAHSIS;
                _tetikBahsis += BAHSIS;
            }
            address varlik = Adres.evm(varlik32);
            if (!_rotaVar(varlik)) {
                /* no Uniswap route here: the v2 auction */
                usdcBakiye[l] += gelen;
                taahhut[l] += gelen;
                _alimIlani(l, varlik, gelen, refVarlik);
            } else {
                alimBekleyen[l][varlik] += gelen;
                _dexAl(l, varlik);
            }
        } else if (tur == SepetMesaj.SAT) {
            (, uint64 l, bytes32[] memory varliklar, uint256 miktar, uint256 arz, uint32 hz, bytes32 alici) =
                abi.decode(veri, (uint8, uint64, bytes32[], uint256, uint256, uint32, bytes32));
            _satisEmri(l, varliklar, miktar, arz, hz, alici);
        } else {
            revert KotuMesaj();
        }
    }

    /// Anyone: have this chain's messenger carry out the orders whose
    /// dollars have arrived (an order usually lands before its CCTP dollars,
    /// and then waits there). Each buy order carried out pays the caller
    /// BAHSIS from its own dollars.
    function isleVeAl() external {
        if (_tetik) revert Yeniden_();
        _tetik = true;
        IHaberciIsle(address(haberci)).isle();
        uint256 b = _tetikBahsis;
        _tetikBahsis = 0;
        _tetik = false;
        if (b > 0) {
            if (!usdc.transfer(msg.sender, b)) revert TransferOlmadi();
            emit Bahsis(msg.sender, b);
        }
    }

    /// Anyone: spend launch `l`'s waiting dollars for `varlik` in its pool
    /// now (after the price came back inside the limit, or the pool's oracle
    /// grew old enough). Pays BAHSIS to the caller when at least
    /// BAHSIS_ESIK dollars were spent.
    function dene(uint64 l, address varlik) external kilitli {
        uint256 once = alimBekleyen[l][varlik];
        if (once < BAHSIS_ESIK + BAHSIS) { _dexAl(l, varlik); return; }
        alimBekleyen[l][varlik] = once - BAHSIS;
        _dexAl(l, varlik);
        if (once - BAHSIS - alimBekleyen[l][varlik] >= BAHSIS_ESIK) {
            if (!usdc.transfer(msg.sender, BAHSIS)) revert TransferOlmadi();
            emit Bahsis(msg.sender, BAHSIS);
        } else {
            alimBekleyen[l][varlik] += BAHSIS;
        }
    }

    function _alimIlani(uint64 l, address varlik, uint256 dolar, uint256 refVarlik) internal {
        /* the expected units for these dollars: the last trade's price,
           or the founder's quote when this vault has never traded it */
        Fiyat memory f = sonFiyat[varlik];
        uint256 beklenen = f.usdc > 0 ? (dolar * f.varlik) / f.usdc : refVarlik;
        if (beklenen == 0) beklenen = 1;
        _ilan(ALIM, l, varlik, dolar, beklenen * BASLANGIC_KAT, 0, bytes32(0));
    }

    /// Is there a pool route for `varlik` here (else: the auction fallback).
    function _rotaVar(address varlik) internal view virtual returns (bool) {
        (address h1,) = _yol(varlik);
        return h1 != address(0);
    }

    /// Spend launch `l`'s waiting dollars for `varlik` along its route, within
    /// the price limit. A two-step route's leftover middle coin stays the
    /// launch's (bakiye[l][weth]) and is paid out in redemptions.
    function _dexAl(uint64 l, address varlik) internal virtual {
        uint256 d = alimBekleyen[l][varlik];
        if (d == 0) return;
        if (gasleft() < 2 * TAKAS_GAZ) {
            emit Bekliyor(l, varlik, d);
            return;
        }
        (address h1, address h2) = _yol(varlik);
        if (h1 == address(0)) return;
        uint256 hm = _hamaCevir(d);
        uint256 giren;
        uint256 cikan;
        if (h2 == address(0)) {
            (giren, cikan) = _takas(h1, ham, varlik, hm);
        } else {
            uint256 ara;
            (giren, ara) = _takas(h1, ham, weth, hm);
            uint256 ara2;
            if (ara > 0) (ara2, cikan) = _takas(h2, weth, varlik, ara);
            if (ara > ara2) bakiye[l][weth] += ara - ara2;
        }
        /* what the swap did not take goes back into the vault's dollar */
        uint256 harcanan = d - _usdcyeCevir(hm - giren);
        if (giren == 0) {
            emit Bekliyor(l, varlik, d);
            return;
        }
        alimBekleyen[l][varlik] = d - harcanan;
        bakiye[l][varlik] += cikan;
        if (cikan > 0) sonFiyat[varlik] = Fiyat(uint128(harcanan), uint128(cikan));
        emit Alindi(l, varlik, harcanan, cikan);
        if (d > harcanan) emit Bekliyor(l, varlik, d - harcanan);
    }

    /// The vault's dollars `d` as the pools' dollar (BNB: unwrapped).
    function _hamaCevir(uint256 d) internal returns (uint256) {
        if (ham == address(usdc) || d == 0) return d;
        ISarici6(address(usdc)).coz(d);
        return d * olcek;
    }

    /// The pools' dollar `m` back into the vault's dollar (BNB: wrapped; less
    /// than one smallest unit of it stays here as dust). Returns the units.
    function _usdcyeCevir(uint256 m) internal returns (uint256) {
        if (ham == address(usdc) || m == 0) return m;
        uint256 n = m / olcek;
        if (n == 0) return 0;
        IERC20S(ham).approve(address(usdc), n * olcek);
        ISarici6(address(usdc)).sar(n);
        return n;
    }

    /// A holder burned `miktar` of `arz`: their share of the launch's dollars
    /// here is paid at once, and their share of every asset this launch holds
    /// here is sold in its pool (within the price limit) and paid as dollars;
    /// what is not sold goes to their EVM address here as the asset, or up
    /// for auction when they have none.
    function _satisEmri(uint64 l, bytes32[] memory varliklar, uint256 miktar, uint256 arz, uint32 hz, bytes32 alici) internal {
        if (arz == 0 || miktar == 0 || miktar > arz) revert KotuMesaj();
        uint256 d = (usdcBakiye[l] * miktar) / arz;
        usdcBakiye[l] -= d;
        bool wethAnildi;
        for (uint256 i = 0; i < varliklar.length; i++) {
            address v = Adres.evm(varliklar[i]);
            if (v == weth) wethAnildi = true;
            uint256 ab = (alimBekleyen[l][v] * miktar) / arz;
            alimBekleyen[l][v] -= ab;
            d += ab;
            d += _payiSat(l, v, miktar, arz, hz, alici);
        }
        /* the middle coin a two-step buy left over is the launch's too */
        if (weth != address(0) && !wethAnildi) d += _payiSat(l, weth, miktar, arz, hz, alici);
        if (d > 0) _ode(hz, alici, d);
    }

    /// The holder's share of `v`: sold for dollars (returned), the rest handed over or auctioned.
    function _payiSat(uint64 l, address v, uint256 miktar, uint256 arz, uint32 hz, bytes32 alici) internal virtual returns (uint256 dolar) {
        uint256 pay = (bakiye[l][v] * miktar) / arz;
        if (pay == 0) return 0;
        bakiye[l][v] -= pay;
        uint256 satilan;
        (address h1, address h2) = gasleft() < 2 * TAKAS_GAZ ? (address(0), address(0)) : _yol(v);
        if (h1 != address(0)) {
            if (h2 == address(0)) {
                (satilan, dolar) = _takas(h1, v, ham, pay);
            } else {
                uint256 ara;
                (satilan, ara) = _takas(h1, v, weth, pay);
                uint256 ara2;
                if (ara > 0) (ara2, dolar) = _takas(h2, weth, ham, ara);
                if (ara > ara2) _artan(l, weth, ara - ara2, hz, alici);
            }
            dolar = _usdcyeCevir(dolar);
            if (satilan > 0) {
                if (dolar > 0) sonFiyat[v] = Fiyat(uint128(dolar), uint128(satilan));
                emit Satildi(l, v, satilan, dolar);
            }
        }
        if (pay > satilan) _artan(l, v, pay - satilan, hz, alici);
    }

    /// Units of the holder's share that could not be sold now: to the
    /// holder's EVM address on this chain (the same key holds it here), or,
    /// for an address that is not EVM or a token that will not send there,
    /// up for the v2 auction (paid to them on their chain when filled).
    function _artan(uint64 l, address v, uint256 m, uint32 hz, bytes32 alici) internal {
        if (uint256(alici) >> 160 == 0 && alici != bytes32(0)) {
            address a = address(uint160(uint256(alici)));
            uint256 once = IERC20S(v).balanceOf(address(this));
            (bool ok,) = v.call(abi.encodeWithSelector(IERC20S.transfer.selector, a, m));
            if (ok && IERC20S(v).balanceOf(address(this)) < once) {
                emit Verildi(l, v, a, m);
                return;
            }
        }
        Fiyat memory f = sonFiyat[v];
        uint256 beklenen = f.varlik > 0 ? (m * f.usdc) / f.varlik : 0;
        if (beklenen == 0) beklenen = 1;
        _ilan(SATIM, l, v, m, beklenen * BASLANGIC_KAT, hz, alici);
    }

    function _ilan(uint8 tur, uint64 l, address varlik, uint256 verilen, uint256 baslangic, uint32 hz, bytes32 alici) internal {
        ihaleler.push(Ihale(tur, l, varlik, verilen, baslangic, uint64(block.timestamp), hz, alici, false));
        emit Ilan(ihaleler.length - 1, tur, l, varlik, verilen, baslangic);
    }

    /* ---- Uniswap v3 ------------------------------------------------- */

    /// The route between USDC and `varlik`: the direct pool when it holds
    /// DERINLIK dollars, else two pools through weth, else the thin direct
    /// pool. Each pool is the most liquid of the four fee tiers; zero: no route.
    function _yol(address varlik) internal view returns (address h1, address h2) {
        if (address(fabrika) == address(0) || varlik == address(usdc) || varlik == ham) return (address(0), address(0));
        h1 = _enIyi(ham, varlik);
        if (weth == address(0) || varlik == weth) return (h1, address(0));
        if (h1 != address(0) && IERC20S(ham).balanceOf(h1) >= DERINLIK * olcek) return (h1, address(0));
        address a = _enIyi(ham, weth);
        address b = _enIyi(weth, varlik);
        if (a == address(0) || b == address(0)) return (h1, address(0));
        return (a, b);
    }

    function _enIyi(address a, address b) internal view returns (address enIyi) {
        /* Uniswap's four tiers and PancakeSwap's 2500 (a tier a factory lacks returns no pool) */
        uint24[5] memory ucretler = [uint24(100), 500, 2500, 3000, 10000];
        uint128 enCok;
        for (uint256 i = 0; i < 5; i++) {
            address p = fabrika.getPool(a, b, ucretler[i]);
            if (p == address(0) || p.code.length == 0) continue;
            uint128 L = IV3Havuz(p).liquidity();
            if (L > enCok) { enCok = L; enIyi = p; }
        }
    }

    /// The pool's PENCERE-second time-weighted tick; false when its oracle
    /// does not reach that far back.
    function _twap(address p) internal view returns (int24, bool) {
        uint32[] memory s = new uint32[](2);
        s[0] = PENCERE;
        try IV3Havuz(p).observe(s) returns (int56[] memory tc, uint160[] memory) {
            int56 fark = tc[1] - tc[0];
            int56 n = int56(uint56(PENCERE));
            int24 t = int24(fark / n);
            if (fark < 0 && fark % n != 0) t--;
            return (t, true);
        } catch {
            return (0, false);
        }
    }

    /// Swap `m` of `girdi` for `cikti` in pool `p`, no worse than KAYMA_TICK
    /// past its time-weighted price. Returns what went in and what arrived
    /// (measured by balance). Never reverts.
    function _takas(address p, address girdi, address cikti, uint256 m) internal returns (uint256 giren, uint256 cikan) {
        (int24 tw, bool okundu) = _twap(p);
        if (!okundu) {
            /* too young an oracle: grow it, the dollars wait */
            try IV3Havuz(p).increaseObservationCardinalityNext(GOZLEM) {} catch {}
            return (0, 0);
        }
        bool sifirdanBire = girdi < cikti;
        int24 sinir = sifirdanBire ? tw - KAYMA_TICK : tw + KAYMA_TICK;
        if (sinir <= TickMath.MIN_TICK) sinir = TickMath.MIN_TICK + 1;
        if (sinir >= TickMath.MAX_TICK) sinir = TickMath.MAX_TICK - 1;
        uint160 sp = TickMath.getSqrtPriceAtTick(sinir);
        uint160 simdi = _fiyat(p);
        if (simdi == 0) return (0, 0);
        /* already past the limit: nothing to do now */
        if (sifirdanBire ? simdi <= sp : simdi >= sp) return (0, 0);
        uint256 once = IERC20S(cikti).balanceOf(address(this));
        _havuz = p;
        try IV3Havuz(p).swap(address(this), sifirdanBire, int256(m), sp, abi.encode(girdi)) returns (int256 a0, int256 a1) {
            int256 g = sifirdanBire ? a0 : a1;
            if (g > 0) giren = uint256(g);
        } catch {}
        _havuz = address(0);
        if (giren > 0) cikan = IERC20S(cikti).balanceOf(address(this)) - once;
    }

    /// The pool's sqrt price, read from the first word of slot0: PancakeSwap v3's
    /// slot0 has a uint32 fee field where Uniswap's has uint8, so it is not
    /// decoded as a whole.
    function _fiyat(address p) internal view returns (uint160 sp) {
        (bool ok, bytes memory r) = p.staticcall(abi.encodeWithSelector(IV3Havuz.slot0.selector));
        if (!ok || r.length < 32) return 0;
        sp = uint160(uint256(bytes32(r)));
    }

    /// Uniswap v3 asks for what the swap owes: only the pool we are swapping in.
    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata veri) external { _borcOde(a0, a1, veri); }

    /// The same, as HyperSwap V3 (HyperEVM's Uniswap v3 fork) names it.
    function hyperswapV3SwapCallback(int256 a0, int256 a1, bytes calldata veri) external { _borcOde(a0, a1, veri); }

    /// The same, as PancakeSwap v3 (BNB) names it.
    function pancakeV3SwapCallback(int256 a0, int256 a1, bytes calldata veri) external { _borcOde(a0, a1, veri); }

    function _borcOde(int256 a0, int256 a1, bytes calldata veri) internal {
        if (msg.sender != _havuz || _havuz == address(0)) revert SadeceHavuz();
        address girdi = abi.decode(veri, (address));
        uint256 borc = uint256(a0 > 0 ? a0 : a1);
        if (!IERC20S(girdi).transfer(msg.sender, borc)) revert TransferOlmadi();
    }

    /// For the page: can an asset be chosen for this chain's basket line,
    /// and can it be bought right now (the pools' oracles reach 30 minutes)?
    function havuzVar(address varlik) external view virtual returns (bool yolVar, bool ikiAdim, bool simdiAlinir) {
        (address h1, address h2) = _yol(varlik);
        if (h1 == address(0)) return (false, false, false);
        (, bool o1) = _twap(h1);
        bool o2 = true;
        if (h2 != address(0)) (, o2) = _twap(h2);
        return (true, h2 != address(0), o1 && o2);
    }

    /* ---- the auction (fallback) ------------------------------------- */

    /// What auction `id` asks for right now: units for a buy, dollars for a
    /// sell. Halves every YARILANMA, linear in between, never below the floor.
    function istenen(uint256 id) public view returns (uint256) {
        Ihale memory h = ihaleler[id];
        uint256 gecen = block.timestamp - h.baslama;
        uint256 n = gecen / YARILANMA;
        uint256 taban = h.baslangic / TABAN_KAT;
        if (n >= 64) return taban;
        uint256 q = h.baslangic >> n;
        q -= (q * (gecen % YARILANMA)) / (2 * YARILANMA);
        return q > taban ? q : taban;
    }

    /// Fill auction `id`. A buy: deliver at least `istenen` units of the
    /// asset (approved to this vault), receive the dollars. A sell: pay at
    /// least `istenen` dollars, receive the units; the dollars go to the
    /// holder. `teklif` is what the filler offers, and is what moves.
    function doldur(uint256 id, uint256 teklif) external kilitli {
        Ihale storage h = ihaleler[id];
        if (h.bitti) revert Bitti();
        uint256 ist = istenen(id);
        if (h.tur == ALIM) {
            /* a redemption may have paid out part of these dollars since
               the auction opened: spend this auction's proportional part of
               what is still the launch's, and ask proportionally less */
            uint256 t = taahhut[h.launchId];
            uint256 harca = (h.verilen * usdcBakiye[h.launchId]) / t;
            taahhut[h.launchId] = t - h.verilen;
            if (harca == 0) revert Sifir();
            uint256 gerek = (ist * harca) / h.verilen;
            if (teklif < gerek || teklif == 0) revert Az();
            h.bitti = true;
            uint256 once = IERC20S(h.varlik).balanceOf(address(this));
            if (!IERC20S(h.varlik).transferFrom(msg.sender, address(this), teklif)) revert TransferOlmadi();
            /* credit what arrived, not what was claimed */
            uint256 gelen = IERC20S(h.varlik).balanceOf(address(this)) - once;
            if (gelen < gerek) revert Az();
            usdcBakiye[h.launchId] -= harca;
            bakiye[h.launchId][h.varlik] += gelen;
            sonFiyat[h.varlik] = Fiyat(uint128(harca), uint128(gelen));
            if (!usdc.transfer(msg.sender, harca)) revert TransferOlmadi();
            emit Doldu(id, msg.sender, harca, gelen);
        } else {
            if (teklif < ist || teklif == 0) revert Az();
            h.bitti = true;
            if (!usdc.transferFrom(msg.sender, address(this), teklif)) revert TransferOlmadi();
            sonFiyat[h.varlik] = Fiyat(uint128(teklif), uint128(h.verilen));
            if (!IERC20S(h.varlik).transfer(msg.sender, h.verilen)) revert TransferOlmadi();
            _ode(h.hedefZincir, h.alici, teklif);
            emit Doldu(id, msg.sender, h.verilen, teklif);
        }
    }

    /// An auction resting on its floor for BEKLEME restarts from there, so
    /// an asset that moved more than TABAN_KAT can still be traded.
    function yenidenBaslat(uint256 id) external {
        Ihale storage h = ihaleler[id];
        if (h.bitti) revert Bitti();
        uint256 tabanaVaris = YARILANMA * 4;   // 2^4 = TABAN_KAT
        if (block.timestamp < h.baslama + tabanaVaris + BEKLEME) revert Erken();
        h.baslangic = h.baslangic / TABAN_KAT;
        if (h.baslangic == 0) h.baslangic = 1;
        h.baslama = uint64(block.timestamp);
        emit Yeniden(id, h.baslangic);
    }

    function ihaleSayisi() external view returns (uint256) { return ihaleler.length; }

    /* ---- paying a holder, here or on their chain -------------------- */

    function _ode(uint32 hz, bytes32 alici, uint256 miktar) internal {
        if (hz == haberci.zincir()) {
            if (!usdc.transfer(Adres.evm(alici), miktar)) revert TransferOlmadi();
        } else {
            usdc.approve(address(haberci), miktar);
            haberci.gonder(hz, alici, "", miktar);
        }
    }
}
