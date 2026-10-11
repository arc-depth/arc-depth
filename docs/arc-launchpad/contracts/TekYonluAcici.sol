// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";

interface IERC20T {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title TekYonluAcici — a pool a wallet can actually trade, funded with
///                        tokens alone.
/// @notice One-sided, concentrated, locked. Costs zero dollars to open.
///
/// WHY THIS EXISTS
///   The first pool was full range with $6 in it, and MetaMask quotes
///   -76.96% on a $20 swap against it. Telling people to use the curve
///   instead does not work: nobody calls a contract, they tap swap. So the
///   venue they land on has to be the one that works.
///
///   Two facts make that free. Concentrating the same liquidity into a
///   band multiplies its depth where trading actually happens — what v4
///   ranges are for, and the first pool did not use them. And a position
///   made only of tokens needs no quote asset at all: it sits above the
///   current price and buyers walk up through it, their dollars filling
///   the pool as they go. The side we have none of is the side that is not
///   required.
///
///   Measured against the real Arc PoolManager, 15,000,000 DEPTH in a band
///   reaching 50% above the price: a $20 buy quotes -1.72% instead of
///   -76.92%, and nothing was deposited.
///
/// WHY THE RANGES ARE PICKED PER ASSET
///   A v4 position spanning the current price has to be funded with both
///   assets, so once a single buy moves the price into the band, "send
///   more tokens" stops adding anything. I had written this the simple way
///   and the measurement caught it: on an untouched pool a token-only
///   top-up worked, and after one buy it silently added zero. That would
///   have turned the opening size into a permanent cap decided in an
///   afternoon.
///
///   So each asset goes into the sub-range it can fund by itself — tokens
///   into the part of the band on the token's side of the price, quote into
///   the part on the quote's side. Nothing is wasted matching one against
///   the other, and what is placed sits closer to the price than the whole
///   band would, which makes it deeper rather than shallower.
///
/// THE COST, WHICH IS NOT MONEY
///   Tokens. They are locked here permanently and so is every dollar that
///   arrives for them. The band is also finite: capacity is about the
///   tokens placed times their price times the square root of the band's
///   width, and once buying pushes the price past the top this pool stops
///   quoting buys. `genislet` is the answer to that, and it can only add.
///
/// WHAT CANNOT HAPPEN
///   No withdraw, no owner, no sweep, no upgrade, and the hook's
///   `beforeRemoveLiquidity` reverts for everyone including this contract.
///   `acan` can open the pool once and extend the band; both of those only
///   ever put assets in. There is no function here, callable by anyone,
///   that moves an asset anywhere except into the PoolManager.
contract TekYonluAcici {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    IERC20T public immutable token;
    IERC20T public immutable quote;
    IHooks public immutable hook;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;
    /// Who may open it, and extend it. The curve for a graduation, or the
    /// deployer for a pool seeded straight from a treasury.
    address public immutable acan;
    /// True when the token is currency0. Which sub-range each asset can
    /// fund alone depends on this and nothing else.
    bool public immutable tokenSifirinci;

    bool public acildi;
    PoolId public havuzId;
    uint160 public acilisSqrtPriceX96;
    int24 public altTick;
    int24 public ustTick;
    /// Running total of liquidity placed, across every position. Kept for
    /// reading; the pool is the authority.
    uint128 public likidite;

    event Acildi(PoolId indexed id, uint256 tokenKonan, uint160 sqrtPriceX96,
                 int24 alt, int24 ust, uint128 likidite, uint256 artan);
    event Biriktirildi(int24 alt, int24 ust, uint256 miktar, uint128 eklenen);
    event Genisletildi(int24 eskiKenar, int24 yeniKenar, uint256 miktar, uint128 eklenen);

    error SadeceAcan();
    error ZatenAcildi();
    error HenuzAcilmadi();
    error BosMiktar();
    error KotuBant();
    error NotPoolManager();
    error OdemeOlmadi();

    uint8 private constant MOD_AC = 0;
    uint8 private constant MOD_BIRIKTIR = 1;

    struct Veri {
        uint8 mod;
        PoolKey key;
        uint256 miktar;
        uint160 sqrtP;
        int24 alt;
        int24 ust;
    }

    uint128 private _sonEklenen;

    constructor(
        IPoolManager _poolManager,
        IERC20T _token,
        IERC20T _quote,
        IHooks _hook,
        uint24 _fee,
        int24 _tickSpacing,
        address _acan
    ) {
        poolManager = _poolManager;
        token = _token;
        quote = _quote;
        hook = _hook;
        fee = _fee;
        tickSpacing = _tickSpacing;
        acan = _acan;
        tokenSifirinci = address(_token) < address(_quote);
    }

    /* ---- opening ---------------------------------------------------- */

    /// Open the pool and place every token this contract holds into the
    /// band, once.
    ///
    /// The price and the ticks are computed off chain and passed in so
    /// they can be read and checked before the transaction is sent, rather
    /// than derived somewhere nobody looks. What cannot be left to the
    /// caller is checked here: the band has to sit wholly on the token's
    /// side of the price, or v4 asks for the quote asset instead — which
    /// is exactly the money this is supposed not to need.
    /// @param miktar how much of the balance to place; 0 means all of it.
    ///        The ladder needs this: the whole market allocation is sent
    ///        here at birth and the rungs are placed from it one at a
    ///        time, so the allocation never passes through a wallet on
    ///        its way to being locked.
    function ac(uint160 sqrtPriceX96, int24 alt, int24 ust, uint256 miktar)
        external returns (uint256 konan)
    {
        if (msg.sender != acan) revert SadeceAcan();
        if (acildi) revert ZatenAcildi();
        uint256 bakiye = token.balanceOf(address(this));
        konan = miktar == 0 ? bakiye : miktar;
        if (konan == 0 || konan > bakiye) revert BosMiktar();
        if (ust <= alt) revert KotuBant();

        PoolKey memory key = _anahtar();
        int24 simdiki = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        if (tokenSifirinci) {
            /* token is currency0: its band is ABOVE the price */
            if (alt <= simdiki) revert KotuBant();
        } else {
            /* token is currency1: its band is BELOW the price.
               Equal is allowed and is the best case: a position is active
               over [lower, upper), so at upper it is out of range and
               still funded by the token alone — with no gap between the
               band and the price for a buyer to jump across for free. A
               strict check cost 9 ticks here, which measured as a fixed
               0.09% on every trade no matter how small. */
            if (ust > simdiki) revert KotuBant();
        }

        acildi = true;
        acilisSqrtPriceX96 = sqrtPriceX96;
        altTick = alt;
        ustTick = ust;

        poolManager.initialize(key, sqrtPriceX96);
        havuzId = key.toId();
        poolManager.unlock(abi.encode(Veri(MOD_AC, key, konan, sqrtPriceX96, alt, ust)));

        emit Acildi(havuzId, konan, sqrtPriceX96, alt, ust, likidite,
                    token.balanceOf(address(this)));
    }

    /* ---- growing ---------------------------------------------------- */

    /// Put whatever this contract holds into the pool, each asset into the
    /// sub-range it can fund by itself.
    ///
    /// The hook sends its depth slice here and a buy's fee arrives as
    /// tokens, so without this they would pile up unreachable — which is
    /// what happened to the previous locker and is the shape of mistake
    /// this project keeps paying for.
    ///
    /// Open to anyone, and safe to be: it takes no arguments, so there is
    /// nothing for a caller to choose. The ranges come from the band and
    /// the pool's own price, and everything it places is locked like the
    /// rest.
    function biriktir() external returns (uint128 eklenen) {
        if (!acildi) revert HenuzAcilmadi();
        _sonEklenen = 0;
        poolManager.unlock(abi.encode(
            Veri(MOD_BIRIKTIR, _anahtar(), 0, 0, altTick, ustTick)));
        return _sonEklenen;
    }

    /// Extend the band further out on the token's side, with tokens alone.
    ///
    /// Without this the band is a hard ceiling: when buying pushes the
    /// price past the top the tokens are gone, token-only top-ups have
    /// nowhere left to go, and this pool stops quoting buys. That ceiling
    /// emptied a pool in this project once already, and "open another
    /// pool" would split the token across venues again.
    ///
    /// Restricted to `acan` because it takes a tick, and anyone else could
    /// put this contract's tokens in a range that does no good. What it
    /// cannot do, for `acan` either, is take anything out: it adds a locked
    /// position and moves the band's outer edge, and that is all.
    ///
    /// The new position starts at the old edge OR at the price, whichever
    /// is further onto the token's side. Extending from the old edge alone
    /// looks right and is not: by the time the band is worth extending the
    /// price has usually passed that edge, so the range would straddle the
    /// price, v4 would ask for the quote asset, and the call would revert
    /// on a balance we do not have. The measurement caught exactly that.
    /// @param miktar how much of the balance to place; 0 means all of it.
    function genislet(int24 yeniKenar, uint256 miktar) external returns (uint128 eklenen) {
        if (msg.sender != acan) revert SadeceAcan();
        if (!acildi) revert HenuzAcilmadi();
        uint256 bakiye = token.balanceOf(address(this));
        if (miktar == 0) miktar = bakiye;
        if (miktar == 0 || miktar > bakiye) revert BosMiktar();

        PoolKey memory key = _anahtar();
        (, int24 simdiki) = _slot0(key);
        /* A swap with a loose price limit that outruns the band leaves the
           price pinned at the very edge of the tick range, and from there
           the token's side of the price can be empty or off the grid
           entirely. Clamping both ends means that case comes back as
           KotuBant rather than as arithmetic nobody checked. */
        int24 enAlt = -(((-TickMath.MIN_TICK) / tickSpacing) * tickSpacing);
        int24 enUst = (TickMath.MAX_TICK / tickSpacing) * tickSpacing;
        if (yeniKenar < enAlt || yeniKenar > enUst) revert KotuBant();

        int24 eski;
        int24 alt;
        int24 ust;
        if (tokenSifirinci) {
            /* the token's side is above the price: the band grows at the top */
            eski = ustTick;
            int24 ic = _yukari(simdiki);
            if (ic < eski) ic = eski;
            if (ic > enUst) revert KotuBant();
            if (yeniKenar <= ic) revert KotuBant();
            (alt, ust) = (ic, yeniKenar);
            ustTick = yeniKenar;
        } else {
            /* the token's side is below it: the band grows at the bottom */
            eski = altTick;
            int24 ic = _asagi(simdiki);
            if (ic > eski) ic = eski;
            if (ic < enAlt) revert KotuBant();
            if (yeniKenar >= ic) revert KotuBant();
            (alt, ust) = (yeniKenar, ic);
            altTick = yeniKenar;
        }

        _sonEklenen = 0;
        poolManager.unlock(abi.encode(Veri(MOD_AC, key, miktar, 0, alt, ust)));
        emit Genisletildi(eski, yeniKenar, miktar, _sonEklenen);
        return _sonEklenen;
    }

    /* ---- callback --------------------------------------------------- */

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        Veri memory v = abi.decode(data, (Veri));
        if (v.mod == MOD_BIRIKTIR) return _biriktirIcinde(v);

        /* Opening and extending are the same operation: size a token-only
           position from the amount held, and place it. */
        uint128 l = _ekle(v.key, v.alt, v.ust, v.miktar, tokenSifirinci);
        if (l == 0) revert BosMiktar();
        likidite += l;
        _sonEklenen = l;
        return "";
    }

    function _biriktirIcinde(Veri memory v) internal returns (bytes memory) {
        /* A zero-delta change realises whatever has accrued on the opening
           position. */
        (BalanceDelta kazanc,) = poolManager.modifyLiquidity(
            v.key,
            ModifyLiquidityParams({tickLower: v.alt, tickUpper: v.ust,
                                   liquidityDelta: 0, salt: bytes32(0)}),
            ""
        );
        if (kazanc.amount0() > 0)
            poolManager.take(v.key.currency0, address(this), uint256(uint128(kazanc.amount0())));
        if (kazanc.amount1() > 0)
            poolManager.take(v.key.currency1, address(this), uint256(uint128(kazanc.amount1())));

        (, int24 simdiki) = _slot0(v.key);
        uint128 toplam = 0;

        /* currency0 can fund, alone, only a range entirely above the price;
           currency1 only one entirely below it. So each asset gets the part
           of the band on its own side, snapped to the tick grid away from
           the price so neither range ever straddles it. */
        uint256 b0 = IERC20T(Currency.unwrap(v.key.currency0)).balanceOf(address(this));
        if (b0 > 0) {
            int24 a = _yukari(simdiki);
            if (a < v.alt) a = v.alt;
            if (a < v.ust) toplam += _ekle(v.key, a, v.ust, b0, true);
        }

        uint256 b1 = IERC20T(Currency.unwrap(v.key.currency1)).balanceOf(address(this));
        if (b1 > 0) {
            int24 b = _asagi(simdiki);
            if (b > v.ust) b = v.ust;
            if (b > v.alt) toplam += _ekle(v.key, v.alt, b, b1, false);
        }

        likidite += toplam;
        _sonEklenen = toplam;
        return "";
    }

    /// Place `miktar` of one asset into [alt, ust], which must sit wholly
    /// on that asset's side of the price.
    function _ekle(PoolKey memory key, int24 alt, int24 ust, uint256 miktar, bool sifirinci)
        internal returns (uint128)
    {
        uint160 sa = TickMath.getSqrtPriceAtTick(alt);
        uint160 sb = TickMath.getSqrtPriceAtTick(ust);
        uint256 l = _tekTaraf(miktar, sa, sb, sifirinci);
        if (l > type(uint128).max) l = type(uint128).max;
        if (l == 0) return 0;
        _yerlestir(key, alt, ust, int256(l));
        emit Biriktirildi(alt, ust, miktar, uint128(l));
        return uint128(l);
    }

    function _yerlestir(PoolKey memory key, int24 alt, int24 ust, int256 l) internal {
        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({tickLower: alt, tickUpper: ust,
                                   liquidityDelta: l, salt: bytes32(0)}),
            ""
        );
        _ode(key.currency0, delta.amount0());
        _ode(key.currency1, delta.amount1());
    }

    /* ---- arithmetic ------------------------------------------------- */

    /// Liquidity that `miktar` of a single asset implies over [sa, sb].
    ///
    /// FullMath carries the intermediate in 512 bits; the naive product of
    /// a token amount and two Q96 roots overflowed uint256 in this project
    /// once, which is why it is not written the short way.
    function _tekTaraf(uint256 miktar, uint160 sa, uint160 sb, bool sifirinci)
        internal pure returns (uint256)
    {
        if (sb <= sa) return 0;
        if (sifirinci) {
            // amount0 = L * (1/sa - 1/sb)
            uint256 ara = FullMath.mulDiv(uint256(sa), uint256(sb), FixedPoint96.Q96);
            return FullMath.mulDiv(miktar, ara, uint256(sb - sa));
        }
        // amount1 = L * (sb - sa)
        return FullMath.mulDiv(miktar, FixedPoint96.Q96, uint256(sb - sa));
    }

    /// The first usable tick strictly above `t`, and the first at or below.
    /// Written with an explicit floor because Solidity truncates toward
    /// zero, so plain division rounds the wrong way for a negative tick —
    /// these pools will not see one, but a silent sign bug inside a locked
    /// contract is not worth saving two lines over.
    function _yukari(int24 t) internal view returns (int24) {
        return (_kat(t) + 1) * tickSpacing;
    }

    function _asagi(int24 t) internal view returns (int24) {
        return _kat(t) * tickSpacing;
    }

    function _kat(int24 t) internal view returns (int24) {
        int24 k = t / tickSpacing;
        if (t < 0 && k * tickSpacing != t) k -= 1;
        return k;
    }

    function _anahtar() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(tokenSifirinci ? address(token) : address(quote)),
            currency1: Currency.wrap(tokenSifirinci ? address(quote) : address(token)),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: hook
        });
    }

    function _slot0(PoolKey memory key) internal view returns (uint160, int24) {
        bytes32 slot = keccak256(abi.encode(PoolId.unwrap(key.toId()), uint256(6)));
        bytes32 raw = poolManager.extsload(slot);
        return (uint160(uint256(raw)), int24(uint24(uint256(raw) >> 160)));
    }

    function _ode(Currency c, int128 d) internal {
        if (d >= 0) return;
        uint256 borc = uint256(uint128(-d));
        poolManager.sync(c);
        if (!IERC20T(Currency.unwrap(c)).transfer(address(poolManager), borc)) revert OdemeOlmadi();
        poolManager.settle();
    }
}
