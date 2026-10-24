// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SepetKasasi, IV3Fabrika} from "./SepetKasasi.sol";
import {IHaberci, IERC20S} from "./IHaberci.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// A launchpad whose tokens trade in hooked pools: the pool key it would open for a token.
interface IHavuzAnahtari {
    function havuzAnahtari(address token) external view returns (PoolKey memory);
}

/// @title SepetKasasiArc — the basket vault on Arc, buying and selling in Uniswap v4
///
/// The same ledger, orders, redemption and fallback as SepetKasasi; only the
/// market differs. Arc has Uniswap v4 (one PoolManager) and no v3, and v4
/// pools keep no price history, so the price guard is a reference the vault
/// keeps per pool (as the Sui and Aptos vaults do):
///   - the first touch of a pool records its price and buys nothing;
///   - the reference then follows the pool by at most ADIM_TICK (~1%) per
///     elapsed minute, counted over at most AZAMI_DAKIKA minutes per update,
///     so a price must be held for minutes to drag it;
///   - a trade runs only after OLGUNLUK since the first touch, only while the
///     pool's price is within KAYMA_TICK (~3%) of the reference as it stood
///     BEFORE this update, and with that same bound as the swap's price
///     limit; at most TAVAN dollars per call (a sale: that much value);
///   - what a hookless pool returns must be at least ASGARI_PPM of the
///     reference value (96%); a hooked pool (our launch pools, the FTHM pool)
///     takes its own fee and tax, so there the floor is ASGARI_KANCALI_PPM.
///   Below any bound the dollars wait (`alimBekleyen`), and the next order or
///   anyone's `dene` (tip) tries again; a sale's unsold part goes to the
///   holder's EVM address as the asset, as on the other chains.
///
/// WHICH POOL
///   For an asset, the candidates are: the pools this vault was deployed
///   with (`bilinen`, e.g. FTHM / USDC and its hook), the pool each listed
///   launchpad opens for its own tokens (`launchpadlar`), and the four
///   standard hookless tiers. The initialised one with the most liquidity wins.
///   All of it is fixed at deployment; no owner.
contract SepetKasasiArc is SepetKasasi {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable havuzYoneticisi;

    int24 public constant ADIM_TICK = 100;          // ~1% per minute
    uint256 public constant AZAMI_DAKIKA = 3;       // an update moves at most ~3%
    int24 public constant KAYMA_TICK_V4 = 300;      // ~3%
    uint256 public constant OLGUNLUK = 10 minutes;
    uint256 public constant TAVAN = 2_000e6;        // dollars per call
    uint256 public constant ASGARI_PPM = 960_000;
    uint256 public constant ASGARI_KANCALI_PPM = 900_000;

    struct Referans { int24 tick; uint64 zaman; uint64 ilk; }
    mapping(PoolId => Referans) public referans;

    /// Pools named at deployment, per asset (FTHM and its hooked pool).
    struct Bilinen { uint24 ucret; int24 aralik; address kanca; }
    mapping(address => Bilinen) public bilinen;
    address[] public launchpadlar;

    bool private _v4;

    /// A swap the pool refused or the floor stopped: the pool and the reason (for diagnosis).
    event TakasOlmadi(PoolId indexed havuz, bytes neden);

    error SadeceYonetici();
    error AsgariAlti(uint256 alinan, uint256 verilen, uint256 asgari, uint256 m);
    error Teklif(uint256 giren);

    constructor(IHaberci _haberci, IERC20S _usdc, bytes32 _defter, IPoolManager _pm, address[] memory _launchpadlar,
        address[] memory bVarlik, uint24[] memory bUcret, int24[] memory bAralik, address[] memory bKanca)
        SepetKasasi(_haberci, _usdc, 26, _defter, IV3Fabrika(address(0)), address(0), address(0), 0)
    {
        havuzYoneticisi = _pm;
        launchpadlar = _launchpadlar;
        for (uint256 i = 0; i < bVarlik.length; i++) bilinen[bVarlik[i]] = Bilinen(bUcret[i], bAralik[i], bKanca[i]);
    }

    /* ---- which pool ------------------------------------------------- */

    function _anahtar(address varlik, uint24 ucret, int24 aralik, address kanca) internal view returns (PoolKey memory k) {
        (address a, address b) = varlik < address(usdc) ? (varlik, address(usdc)) : (address(usdc), varlik);
        k = PoolKey(Currency.wrap(a), Currency.wrap(b), ucret, aralik, IHooks(kanca));
    }

    /// The most liquid initialised USDC pool of `varlik`; ok false: none.
    function havuz(address varlik) public view returns (PoolKey memory enIyi, bool ok) {
        if (varlik == address(usdc) || varlik == address(0)) return (enIyi, false);
        uint128 enCok;
        Bilinen memory bl = bilinen[varlik];
        if (bl.aralik != 0) (enIyi, enCok, ok) = _dene(_anahtar(varlik, bl.ucret, bl.aralik, bl.kanca), enIyi, enCok, ok);
        for (uint256 i = 0; i < launchpadlar.length; i++) {
            try IHavuzAnahtari(launchpadlar[i]).havuzAnahtari(varlik) returns (PoolKey memory k) {
                if (Currency.unwrap(k.currency0) == address(0) && Currency.unwrap(k.currency1) == address(0)) continue;
                (address a, address b) = (Currency.unwrap(k.currency0), Currency.unwrap(k.currency1));
                if (!((a == varlik && b == address(usdc)) || (b == varlik && a == address(usdc)))) continue;
                (enIyi, enCok, ok) = _dene(k, enIyi, enCok, ok);
            } catch {}
        }
        uint24[4] memory ucret = [uint24(100), 500, 3000, 10000];
        int24[4] memory aralik = [int24(1), 10, 60, 200];
        for (uint256 i = 0; i < 4; i++) (enIyi, enCok, ok) = _dene(_anahtar(varlik, ucret[i], aralik[i], address(0)), enIyi, enCok, ok);
    }

    function _dene(PoolKey memory k, PoolKey memory enIyi, uint128 enCok, bool ok)
        internal view returns (PoolKey memory, uint128, bool)
    {
        PoolId id = k.toId();
        (uint160 sp,,,) = havuzYoneticisi.getSlot0(id);
        if (sp == 0) return (enIyi, enCok, ok);
        uint128 L = havuzYoneticisi.getLiquidity(id);
        if (!ok || L > enCok) return (k, L, true);
        return (enIyi, enCok, ok);
    }

    function _rotaVar(address varlik) internal view override returns (bool) {
        (, bool ok) = havuz(varlik);
        return ok;
    }

    /* ---- the reference ---------------------------------------------- */

    /// Update the reference of pool `id` toward its price; returns the
    /// reference as it stood before and whether a trade may run now.
    function _referans(PoolId id) internal returns (int24 eski, bool hazir) {
        (uint160 sp, int24 t,,) = havuzYoneticisi.getSlot0(id);
        Referans memory r = referans[id];
        if (r.zaman == 0) {
            referans[id] = Referans(t, uint64(block.timestamp), uint64(block.timestamp));
            return (t, false);
        }
        eski = r.tick;
        uint256 dk = (block.timestamp - r.zaman) / 60;
        if (dk > AZAMI_DAKIKA) dk = AZAMI_DAKIKA;
        int256 izin = int256(dk) * ADIM_TICK;
        int256 fark = int256(t) - int256(r.tick);
        if (fark > izin) fark = izin;
        if (fark < -izin) fark = -izin;
        /* the clock only advances by whole minutes it used */
        if (dk > 0) referans[id] = Referans(int24(int256(r.tick) + fark), r.zaman + uint64(dk * 60), r.ilk);
        int256 sapma = int256(t) - int256(eski);
        hazir = sp != 0 && block.timestamp >= r.ilk + OLGUNLUK && sapma <= KAYMA_TICK_V4 && sapma >= -KAYMA_TICK_V4;
    }

    /// Anyone, once per pool: start its reference (the first buy otherwise does it and waits).
    function referansBaslat(address varlik) external {
        (PoolKey memory k, bool ok) = havuz(varlik);
        if (ok && referans[k.toId()].zaman == 0) _referans(k.toId());
    }

    /* ---- buying and selling ----------------------------------------- */

    function _dexAl(uint64 l, address varlik) internal override {
        uint256 d = alimBekleyen[l][varlik];
        if (d == 0) return;
        if (gasleft() < 2 * TAKAS_GAZ) { emit Bekliyor(l, varlik, d); return; }
        (PoolKey memory k, bool ok) = havuz(varlik);
        if (!ok) return;
        uint256 m = d > TAVAN ? TAVAN : d;
        (uint256 giren, uint256 cikan) = _v4Takas(k, address(usdc), m);
        if (giren == 0) { emit Bekliyor(l, varlik, d); return; }
        alimBekleyen[l][varlik] = d - giren;
        bakiye[l][varlik] += cikan;
        sonFiyat[varlik] = Fiyat(uint128(giren), uint128(cikan));
        emit Alindi(l, varlik, giren, cikan);
        if (d > giren) emit Bekliyor(l, varlik, d - giren);
    }

    function _payiSat(uint64 l, address v, uint256 miktar, uint256 arz, uint32 hz, bytes32 alici)
        internal override returns (uint256 dolar)
    {
        uint256 pay = (bakiye[l][v] * miktar) / arz;
        if (pay == 0) return 0;
        bakiye[l][v] -= pay;
        uint256 satilan;
        if (gasleft() >= 2 * TAKAS_GAZ) {
            (PoolKey memory k, bool ok) = havuz(v);
            if (ok) {
                /* no more than TAVAN dollars' worth per call, at the last price */
                uint256 m = pay;
                Fiyat memory f = sonFiyat[v];
                if (f.varlik > 0) {
                    uint256 tavanBirim = (TAVAN * f.varlik) / f.usdc;
                    if (m > tavanBirim) m = tavanBirim;
                }
                (satilan, dolar) = _v4Takas(k, v, m);
                if (satilan > 0) {
                    if (dolar > 0) sonFiyat[v] = Fiyat(uint128(dolar), uint128(satilan));
                    emit Satildi(l, v, satilan, dolar);
                }
            }
        }
        if (pay > satilan) _artan(l, v, pay - satilan, hz, alici);
    }

    /// Swap `m` of `girdi` in pool `k` within the reference bounds. Never reverts.
    function _v4Takas(PoolKey memory k, address girdi, uint256 m) internal returns (uint256 giren, uint256 cikan) {
        PoolId id = k.toId();
        (int24 ref, bool hazir) = _referans(id);
        if (!hazir) return (0, 0);
        bool sifirdanBire = Currency.unwrap(k.currency0) == girdi;
        int24 sinir = sifirdanBire ? ref - KAYMA_TICK_V4 : ref + KAYMA_TICK_V4;
        if (sinir <= TickMath.MIN_TICK) sinir = TickMath.MIN_TICK + 1;
        if (sinir >= TickMath.MAX_TICK) sinir = TickMath.MAX_TICK - 1;
        /* the least it must return: the reference value of `m`, less the bound and (hooked pools) their fee */
        uint256 refDeger = _deger(ref, m, sifirdanBire);
        uint256 asgari = (refDeger * (address(k.hooks) == address(0) ? ASGARI_PPM : ASGARI_KANCALI_PPM)) / 1_000_000;
        uint160 limit = TickMath.getSqrtPriceAtTick(sinir);
        _v4 = true;
        /* A hooked pool (our launch pools) takes its fee on the amount asked, not on what the price
           limit lets through: a partial fill would pay the fee on all of `m`. So there the swap is
           first tried and undone, to learn how much fits within the limit, and then made for that. */
        if (address(k.hooks) != address(0)) {
            try havuzYoneticisi.unlock(abi.encode(k, sifirdanBire, m, limit, girdi, uint256(0), true)) {} catch (bytes memory r) {
                uint256 sigar = _teklifOku(r);
                if (sigar == 0) { _v4 = false; emit TakasOlmadi(id, r); return (0, 0); }
                if (sigar < m) {
                    /* a little under what fits, so the real swap does not touch the limit */
                    asgari = (asgari * ((sigar * 995) / 1000)) / m;
                    m = (sigar * 995) / 1000;
                }
            }
        }
        /* the floor is checked inside the unlock, so a fill below it is undone, not kept off the books */
        try havuzYoneticisi.unlock(abi.encode(k, sifirdanBire, m, limit, girdi, asgari, false)) returns (bytes memory r) {
            (giren, cikan) = abi.decode(r, (uint256, uint256));
        } catch (bytes memory neden) {
            emit TakasOlmadi(id, neden);
        }
        _v4 = false;
    }

    /// The amount a trial swap reported (0: it failed for another reason).
    function _teklifOku(bytes memory r) internal pure returns (uint256 g) {
        if (r.length != 36) return 0;
        bytes4 sec;
        assembly { sec := mload(add(r, 32)) g := mload(add(r, 36)) }
        if (sec != Teklif.selector) return 0;
    }

    /// The value of `m` units at tick `t`, in the other currency of the pool.
    function _deger(int24 t, uint256 m, bool sifirdanBire) internal pure returns (uint256) {
        uint256 sp = TickMath.getSqrtPriceAtTick(t);
        /* price of currency0 in currency1 = (sp / 2^96)^2, in two steps so nothing overflows */
        if (sifirdanBire) return FullMath.mulDiv(FullMath.mulDiv(m, sp, 1 << 96), sp, 1 << 96);
        return FullMath.mulDiv(FullMath.mulDiv(m, 1 << 96, sp), 1 << 96, sp);
    }

    function unlockCallback(bytes calldata v) external returns (bytes memory) {
        if (msg.sender != address(havuzYoneticisi) || !_v4) revert SadeceYonetici();
        (PoolKey memory k, bool z, uint256 m, uint160 limit, address girdi, uint256 asgari, bool deneme) =
            abi.decode(v, (PoolKey, bool, uint256, uint160, address, uint256, bool));
        uint256 once = IERC20S(girdi).balanceOf(address(this));
        BalanceDelta d = havuzYoneticisi.swap(k, SwapParams(z, -int256(m), limit), "");
        (int128 g, int128 c) = z ? (d.amount0(), d.amount1()) : (d.amount1(), d.amount0());
        (Currency gc, Currency cc) = z ? (k.currency0, k.currency1) : (k.currency1, k.currency0);
        uint256 odenecek = g < 0 ? uint256(uint128(-g)) : 0;
        uint256 alinan = c > 0 ? uint256(uint128(c)) : 0;
        /* the trial: report how much went in, and undo everything */
        if (deneme) revert Teklif(odenecek);
        if (odenecek > 0) {
            havuzYoneticisi.sync(gc);
            if (!IERC20S(Currency.unwrap(gc)).transfer(address(havuzYoneticisi), odenecek)) revert TransferOlmadi();
            havuzYoneticisi.settle();
        }
        /* a partial fill is held to the same rate as the whole: below the floor, the swap is undone */
        if (odenecek > 0 && alinan * m < asgari * odenecek) revert AsgariAlti(alinan, odenecek, asgari, m);
        if (alinan > 0) havuzYoneticisi.take(cc, address(this), alinan);
        /* the swap and a hook may also have left the vault owing or owed nothing else; measured by balance */
        uint256 sonra = IERC20S(girdi).balanceOf(address(this));
        return abi.encode(once - sonra, alinan);
    }

    function havuzVar(address varlik) external view override returns (bool yolVar, bool ikiAdim, bool simdiAlinir) {
        (PoolKey memory k, bool ok) = havuz(varlik);
        if (!ok) return (false, false, false);
        Referans memory r = referans[k.toId()];
        (, int24 t,,) = havuzYoneticisi.getSlot0(k.toId());
        int256 sapma = int256(t) - int256(r.tick);
        bool hazir = r.zaman != 0 && block.timestamp >= r.ilk + OLGUNLUK && sapma <= KAYMA_TICK_V4 && sapma >= -KAYMA_TICK_V4;
        return (true, false, hazir);
    }
}
