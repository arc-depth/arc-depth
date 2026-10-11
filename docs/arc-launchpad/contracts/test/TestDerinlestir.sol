// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {TekYonluAcici, IERC20T} from "../TekYonluAcici.sol";
import {MockERC20} from "./TestRedemption.sol";

/// @notice Can the pool be made deeper after it is open, with tokens alone?
///
/// WHY THIS DECIDES THE SIZE OF THE FIRST COMMITMENT
///   The band is being opened with 15,000,000 DEPTH rather than 45,000,000,
///   and the whole reason that is defensible is the claim that more can be
///   added later: `biriktir` takes whatever the opener holds and turns it
///   into liquidity on the same position, so depth and capacity can be
///   raised without a new pool and without anyone's permission.
///
///   If that claim is wrong, then 15,000,000 is not a careful first step,
///   it is a permanent cap I talked myself into — and the right number
///   would have to be decided once, up front, with no second chance. So it
///   gets measured before the irreversible transaction, not after.
///
///   Three states, because they behave differently and only one of them is
///   the easy case:
///     1. untouched, token-only  — the top-up as it would normally happen
///     2. mid-band, after a buy  — the position holds both sides
///     3. exhausted, token-only  — the ceiling. Must add nothing, and
///        must not revert, because a function that reverts here would
///        strand every later top-up too.
contract TestDerinlestir is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    IPoolManager pm;
    TekYonluAcici public acici;
    MockERC20 public token;
    MockERC20 public quote;
    PoolKey key;

    struct Sonuc {
        uint128 ilkLikidite;
        /* 1: top-up while untouched */
        uint128 ekTokenSadece;
        uint128 likiditeSonra;
        /* 2: top-up after a buy has moved price into the band */
        uint256 alimOdenen;
        uint256 alimAlinan;
        uint128 ekKarisik;
        /* 3: the band emptied, then a token-only top-up */
        uint256 bosaltOdenen;       // what the pool took of a deliberately oversized buy
        uint128 ekBosalmis;
        bool bosalmisRevert;
        /* 4: the ceiling lifted — the band extended on the token's side */
        uint128 ekGenislet;
        bool genisletRevert;
        uint256 genisletSonrasiAlinan;
        /* what a measured swap costs before and after step 1 */
        uint256 oncesiAlinan;
        uint256 sonrasiAlinan;
        uint256 ortaAlinan;         // mid-band, after step 2
    }

    Sonuc public s;
    uint256 private olcumTutari;

    error SiraBulunamadi();

    /// `durak` stops after that step, so a revert can be bisected from
    /// outside instead of guessed at. 0 means run everything.
    uint8 public durak;

    function run(
        IPoolManager _pm,
        uint160 acilisSqrt,
        int24 alt,
        int24 ust,
        uint256 tokenMiktari,
        uint256 olcumSwap,
        uint8 _durak
    ) external returns (Sonuc memory) {
        durak = _durak;
        pm = _pm;
        olcumTutari = olcumSwap;

        token = new MockERC20(tokenMiktari * 10, address(this));
        for (uint256 i = 0; i < 40; i++) {
            MockERC20 q = new MockERC20(1e15, address(this));
            if (address(q) < address(token)) { quote = q; break; }
        }
        if (address(quote) == address(0)) revert SiraBulunamadi();

        acici = new TekYonluAcici(
            _pm, IERC20T(address(token)), IERC20T(address(quote)),
            IHooks(address(0)), 0, 60, address(this)
        );
        key = PoolKey({
            currency0: Currency.wrap(address(quote)),
            currency1: Currency.wrap(address(token)),
            fee: 0, tickSpacing: 60, hooks: IHooks(address(0))
        });

        token.transfer(address(acici), tokenMiktari);
        acici.ac(acilisSqrt, alt, ust, 0);
        s.ilkLikidite = acici.likidite();

        /* What the measurement swap returns at the opening depth. Taken
           first so the comparison afterwards is against a real number from
           the same pool rather than against the formula. */
        s.oncesiAlinan = _olc();

        /* 1. token-only top-up, position untouched. */
        token.transfer(address(acici), tokenMiktari);
        s.ekTokenSadece = acici.biriktir();
        s.likiditeSonra = acici.likidite();
        s.sonrasiAlinan = _olc();
        if (durak == 1) return s;

        /* 2. a buy moves price into the band, then top up with tokens
              alone — the case that silently added nothing before the
              per-asset ranges were written. */
        (s.alimOdenen, s.alimAlinan) = _al(olcumSwap * 4);
        token.transfer(address(acici), tokenMiktari);
        s.ekKarisik = acici.biriktir();
        s.ortaAlinan = _olc();
        if (durak == 2) return s;

        /* 3. empty the band with an oversized buy, then try again. Here a
              token-only top-up genuinely has nowhere to go: the price is
              past the band and the token's side of it is gone. The thing
              that must not happen is a revert, which would strand every
              later top-up as well.

              The buy stops at the band's own lower edge. Without a limit
              v4 drags the price to the bottom of the entire tick range —
              a state no router would ask for, and one that made this step
              test the wrong thing: the tick space running out rather than
              the band running out. */
        sinir = TickMath.getSqrtPriceAtTick(alt);
        (s.bosaltOdenen,) = _al(1e13);
        sinir = 0;
        token.transfer(address(acici), tokenMiktari / 10);
        try acici.biriktir() returns (uint128 e) { s.ekBosalmis = e; }
        catch { s.bosalmisRevert = true; }
        if (durak == 3) return s;

        /* 4. and the way out of that: extend the band on the token's side.
              DEPTH is currency1 here, so its side is lower in ticks and
              higher in dollars, which is the direction price just went. */
        try acici.genislet(alt - 4080, 0) returns (uint128 e) { s.ekGenislet = e; }
        catch { s.genisletRevert = true; }
        if (durak == 4) return s;
        s.genisletSonrasiAlinan = _olc();

        return s;
    }

    /* A measurement buy, immediately undone, so it does not move the state
       the next step is measuring. */
    function _olc() internal returns (uint256) {
        mod = 3;
        pm.unlock(abi.encode(olcumTutari));
        return gecici;
    }

    function _al(uint256 tutar) internal returns (uint256, uint256) {
        mod = 1;
        pm.unlock(abi.encode(tutar));
        return (geciciOdenen, gecici);
    }

    uint8 private mod;
    uint256 private gecici;
    uint256 private geciciOdenen;
    /// 0 means no limit; otherwise the buy stops there.
    uint160 private sinir;

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        uint256 tutar = abi.decode(data, (uint256));
        uint8 m = mod;

        BalanceDelta delta = pm.swap(
            key,
            SwapParams({ zeroForOne: true, amountSpecified: -int256(tutar),
                         sqrtPriceLimitX96: sinir == 0 ? TickMath.MIN_SQRT_PRICE + 1 : sinir }),
            ""
        );
        uint256 odenen = uint256(uint128(-delta.amount0()));
        uint256 alinan = uint256(uint128(delta.amount1()));

        if (m == 3) {
            /* A pool with no liquidity left on the buy side fills nothing,
               and v4 rejects a swap of zero, so there is nothing to undo
               and nothing to settle. Returning zero says "quoted no fill",
               which is the honest answer and the one the exhausted-band
               step needs. */
            if (alinan == 0) { gecici = 0; return ""; }
            /* Sell it straight back so the pool is where it was. Not exactly
               — fee is zero here but rounding is not, so the caller must
               treat this as a quote and nothing more. */
            BalanceDelta geri = pm.swap(
                key,
                SwapParams({ zeroForOne: false, amountSpecified: -int256(alinan),
                             sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1 }),
                ""
            );
            int128 d0 = delta.amount0() + geri.amount0();
            int128 d1 = delta.amount1() + geri.amount1();
            if (d0 < 0) { pm.sync(key.currency0); quote.transfer(address(pm), uint256(uint128(-d0))); pm.settle(); }
            else if (d0 > 0) pm.take(key.currency0, address(this), uint256(uint128(d0)));
            if (d1 < 0) { pm.sync(key.currency1); token.transfer(address(pm), uint256(uint128(-d1))); pm.settle(); }
            else if (d1 > 0) pm.take(key.currency1, address(this), uint256(uint128(d1)));
            gecici = alinan;
            return "";
        }

        pm.sync(key.currency0);
        quote.transfer(address(pm), odenen);
        pm.settle();
        pm.take(key.currency1, address(this), alinan);
        gecici = alinan;
        geciciOdenen = odenen;
        return "";
    }
}
