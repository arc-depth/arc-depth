// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";

interface IERC20H {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title HavuzAcici — turns a graduated curve into a permanent market.
/// @notice Opens a two-sided full-range Uniswap v4 position and locks it.
///
/// WHAT IS DIFFERENT FROM THE LAST TIME
///   The previous lock placed tokens on one side at a price somebody chose,
///   and that price was wrong by a factor of 10^12 because 6-decimal USDC
///   was treated as 18. 300,000,000 tokens are still sitting in a pool
///   nobody will ever trade against.
///
///   Three things changed. The price is not chosen — it is the ratio of the
///   money buyers actually put in to the tokens being placed, computed as a
///   ratio of raw amounts so no shared decimal scale is ever assumed. The
///   position is two-sided, so there is a bid in the pool from the first
///   block rather than a book that can only be bought from. And it only
///   runs at all once the curve has taken in its threshold, so a dead
///   launch never reaches here.
///
/// FULL RANGE, ON PURPOSE
///   The band spans the whole tick space. A narrower band concentrates
///   depth, but it also means the price can leave it — and a locked
///   position whose price has left its band is a book with nothing in it.
///   That already happened once in this project: a 60x ceiling emptied a
///   pool at about $3,500 and trading simply stopped. Full range cannot
///   run out.
///
/// NOTHING COMES BACK OUT
///   There is no withdraw, no owner, no sweep, no upgrade. `ac` runs once
///   and only the curve can call it. The liquidity is in the pool, and the
///   only functions that can touch it afterwards are Uniswap's own swap
///   paths — which is what makes the depth permanent rather than promised.
///
///   One honest consequence: rounding dust left over after the position is
///   sized stays here forever. It is bounded by one unit of each side,
///   because the opening price is derived from the exact ratio of the two
///   amounts, so both sides size to very nearly the same liquidity. The
///   test measures it rather than assuming it.
contract HavuzAcici {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    IERC20H public immutable token;
    IERC20H public immutable quote;
    IHooks public immutable hook;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;

    /// Only this address may open the pool.
    address public immutable egri;

    bool public acildi;
    PoolId public havuzId;
    uint160 public acilisSqrtPriceX96;
    int24 public altTick;
    int24 public ustTick;
    uint128 public likidite;

    event Acildi(
        PoolId indexed id,
        uint256 quoteKonan,
        uint256 tokenKonan,
        uint160 sqrtPriceX96,
        uint128 likidite,
        uint256 artanQuote,
        uint256 artanToken
    );

    error SadeceEgri();
    error ZatenAcildi();
    error BosMiktar();
    error NotPoolManager();
    error OdemeOlmadi();
    error HenuzAcilmadi();
    error BirikecekYok();

    event Biriktirildi(uint256 eklenenQuote, uint256 eklenenToken, uint128 yeniLikidite);

    /// 0 opens the pool, 1 reinvests accrued fees into it.
    uint8 private constant MOD_AC = 0;
    uint8 private constant MOD_BIRIKTIR = 1;

    struct Veri {
        uint8 mod;
        PoolKey key;
        uint256 miktar0;
        uint256 miktar1;
        uint160 sqrtP;
        int24 alt;
        int24 ust;
    }

    constructor(
        IPoolManager _poolManager,
        IERC20H _token,
        IERC20H _quote,
        IHooks _hook,
        uint24 _fee,
        int24 _tickSpacing,
        address _egri
    ) {
        poolManager = _poolManager;
        token = _token;
        quote = _quote;
        hook = _hook;
        fee = _fee;
        tickSpacing = _tickSpacing;
        egri = _egri;
    }

    /// Open the pool with what this contract holds, and never again.
    ///
    /// The arguments are what the curve says it sent; the balances are what
    /// actually arrived. The balances win, because a mismatch between the
    /// two is the kind of thing that should not quietly become a price.
    function ac(uint256, uint256) external {
        if (msg.sender != egri) revert SadeceEgri();
        if (acildi) revert ZatenAcildi();

        uint256 q = quote.balanceOf(address(this));
        uint256 t = token.balanceOf(address(this));
        if (q == 0 || t == 0) revert BosMiktar();

        acildi = true;

        bool tokenSifirinci = address(token) < address(quote);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(tokenSifirinci ? address(token) : address(quote)),
            currency1: Currency.wrap(tokenSifirinci ? address(quote) : address(token)),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: hook
        });

        uint256 m0 = tokenSifirinci ? t : q;
        uint256 m1 = tokenSifirinci ? q : t;

        /* The price is amount1/amount0 in RAW units. No 1e18, no scaling
           constant, nothing that assumes the two sides share a decimal
           count — that assumption is the whole of the 10^12 error. */
        uint160 sqrtP = _sqrtRatioX96(m1, m0);

        int24 alt = _snapUp(TickMath.MIN_TICK);
        int24 ust = _snapDown(TickMath.MAX_TICK);

        acilisSqrtPriceX96 = sqrtP;
        altTick = alt;
        ustTick = ust;

        poolManager.initialize(key, sqrtP);
        havuzId = key.toId();

        poolManager.unlock(abi.encode(Veri(MOD_AC, key, m0, m1, sqrtP, alt, ust)));

        emit Acildi(havuzId, q, t, sqrtP, likidite,
                    quote.balanceOf(address(this)), token.balanceOf(address(this)));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        Veri memory v = abi.decode(data, (Veri));
        if (v.mod == MOD_BIRIKTIR) return _biriktirIcinde(v);

        uint160 sa = TickMath.getSqrtPriceAtTick(v.alt);
        uint160 sb = TickMath.getSqrtPriceAtTick(v.ust);
        uint160 sp = v.sqrtP;

        /* Two-sided, so each side implies a liquidity and the smaller one
           is what both can actually fund:
           amount0 = L * (1/sp - 1/sb)   ->  L = amount0 * sp * sb / (sb - sp)
           amount1 = L * (sp - sa)       ->  L = amount1 / (sp - sa)
           FullMath carries the intermediate in 512 bits; the naive product
           of a token amount and two Q96 roots overflowed uint256 here
           once. */
        uint256 l0 = type(uint256).max;
        if (sb > sp) {
            uint256 ara = FullMath.mulDiv(uint256(sp), uint256(sb), FixedPoint96.Q96);
            l0 = FullMath.mulDiv(v.miktar0, ara, uint256(sb - sp));
        }
        uint256 l1 = type(uint256).max;
        if (sp > sa) {
            l1 = FullMath.mulDiv(v.miktar1, FixedPoint96.Q96, uint256(sp - sa));
        }

        uint256 l = l0 < l1 ? l0 : l1;
        if (l > type(uint128).max) l = type(uint128).max;
        if (l == 0) revert BosMiktar();
        likidite = uint128(l);

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            v.key,
            ModifyLiquidityParams({
                tickLower: v.alt,
                tickUpper: v.ust,
                liquidityDelta: int256(l),
                salt: bytes32(0)
            }),
            ""
        );

        _ode(v.key.currency0, delta.amount0());
        _ode(v.key.currency1, delta.amount1());
        return "";
    }

    /// Collect the trading fees this locked position has earned and put
    /// them straight back in as liquidity.
    ///
    /// WHY THIS HAD TO EXIST BEFORE THE FEE COULD BE NONZERO
    ///   A locked full-range position earns LP fees, and v4 does not add
    ///   them to active liquidity on its own — they sit as an accrued
    ///   credit until somebody collects. With no way to collect, a nonzero
    ///   fee would quietly strand a growing pile, which is exactly what
    ///   happened to AlpLocker and is the shape of mistake this project
    ///   keeps paying for.
    ///
    ///   With this, the fee becomes the opposite: every trade makes the
    ///   book permanently deeper, and still nothing can leave. The token is
    ///   named after the property, so it ought to be literally true.
    ///
    /// Open to anyone. Nothing can be extracted by calling it — the only
    /// transfers it can make are to the PoolManager — so there is no reason
    /// to ask permission and a good reason not to need any.
    /// How much quote `tokenMiktari` can be paired against at the pool's
    /// CURRENT price, over this contract's band. Zero means "cannot be
    /// answered", not "nothing" — the caller has to treat it that way.
    ///
    /// WHY ANYONE ASKS
    ///   biriktir() adds two-sided liquidity and is bounded by the
    ///   scarcer side; whatever the other side cannot match simply stays
    ///   in this contract. That is harmless for dust and not harmless at
    ///   all for the anti-snipe tax, which arrives at graduation and can
    ///   be orders of magnitude larger than the remaining tokens can
    ///   pair. Measured once: $698,671.30 of quote left here against zero
    ///   tokens, and biriktir() returns immediately when either side is
    ///   zero, so calling it again forever changes nothing. This contract
    ///   has no withdraw — correctly — so that money was unreachable.
    ///
    ///   So the launchpad asks this before sending, caps what it sends,
    ///   and routes the surplus to the collateral vault instead.
    ///
    /// IT MUST NOT BE THE PRICE THE CURVE CLOSED AT
    ///   The curve's closing price and the pool's price are different
    ///   numbers — buying from the curve never moved the pool — and the
    ///   liquidity is added at the POOL's. Sizing against the curve's
    ///   would leave most of the gap in place.
    function eslesebilirQuote(uint256 tokenMiktari) external view returns (uint256) {
        if (!acildi || tokenMiktari == 0) return 0;

        PoolKey memory key = _anahtar();
        (uint160 sp,,,) = _slot0(key);
        if (sp == 0) return 0;
        uint160 sa = TickMath.getSqrtPriceAtTick(altTick);
        uint160 sb = TickMath.getSqrtPriceAtTick(ustTick);
        /* Outside the band only one side is used at all, so there is no
           pairing ratio to report and no cap to apply. */
        if (sp <= sa || sp >= sb) return 0;

        bool tokenSifirinci = address(token) < address(quote);
        uint256 ara = FullMath.mulDiv(uint256(sp), uint256(sb), FixedPoint96.Q96);
        if (ara == 0) return 0;

        /* The same l0/l1 relations _biriktirIcinde uses, solved the other
           way: find the liquidity the token side funds, then the quote
           that funds exactly that much. */
        if (tokenSifirinci) {
            uint256 l = FullMath.mulDiv(tokenMiktari, ara, uint256(sb - sp));
            return FullMath.mulDiv(l, uint256(sp - sa), FixedPoint96.Q96);
        }
        uint256 l2 = FullMath.mulDiv(tokenMiktari, FixedPoint96.Q96, uint256(sp - sa));
        return FullMath.mulDiv(l2, uint256(sb - sp), ara);
    }

    /// The pool key, in one place. It was written out three times and a
    /// fourth copy is a fourth chance to get the currency order wrong.
    function _anahtar() internal view returns (PoolKey memory) {
        bool tokenSifirinci = address(token) < address(quote);
        return PoolKey({
            currency0: Currency.wrap(tokenSifirinci ? address(token) : address(quote)),
            currency1: Currency.wrap(tokenSifirinci ? address(quote) : address(token)),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: hook
        });
    }

    function biriktir() external returns (uint128 eklenen) {
        if (!acildi) revert HenuzAcilmadi();
        PoolKey memory key = _anahtar();
        poolManager.unlock(abi.encode(Veri(MOD_BIRIKTIR, key, 0, 0, 0, altTick, ustTick)));
        return _sonEklenen;
    }

    uint128 private _sonEklenen;

    function _biriktirIcinde(Veri memory v) internal returns (bytes memory) {
        /* A zero-delta change realises whatever has accrued. */
        (BalanceDelta kazanc,) = poolManager.modifyLiquidity(
            v.key,
            ModifyLiquidityParams({tickLower: v.alt, tickUpper: v.ust, liquidityDelta: 0, salt: bytes32(0)}),
            ""
        );
        /* Pull the credit into this contract so it joins any dust left from
           previous rounds; it has nowhere else to go. */
        if (kazanc.amount0() > 0) poolManager.take(v.key.currency0, address(this), uint256(uint128(kazanc.amount0())));
        if (kazanc.amount1() > 0) poolManager.take(v.key.currency1, address(this), uint256(uint128(kazanc.amount1())));

        uint256 b0 = IERC20H(Currency.unwrap(v.key.currency0)).balanceOf(address(this));
        uint256 b1 = IERC20H(Currency.unwrap(v.key.currency1)).balanceOf(address(this));
        if (b0 == 0 || b1 == 0) { _sonEklenen = 0; return ""; }

        (uint160 sp,,,) = _slot0(v.key);
        uint160 sa = TickMath.getSqrtPriceAtTick(v.alt);
        uint160 sb = TickMath.getSqrtPriceAtTick(v.ust);

        uint256 l0 = type(uint256).max;
        if (sb > sp) {
            uint256 ara = FullMath.mulDiv(uint256(sp), uint256(sb), FixedPoint96.Q96);
            l0 = FullMath.mulDiv(b0, ara, uint256(sb - sp));
        }
        uint256 l1 = type(uint256).max;
        if (sp > sa) l1 = FullMath.mulDiv(b1, FixedPoint96.Q96, uint256(sp - sa));
        uint256 l = l0 < l1 ? l0 : l1;
        if (l > type(uint128).max) l = type(uint128).max;
        if (l == 0) { _sonEklenen = 0; return ""; }

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            v.key,
            ModifyLiquidityParams({tickLower: v.alt, tickUpper: v.ust, liquidityDelta: int256(l), salt: bytes32(0)}),
            ""
        );
        _ode(v.key.currency0, delta.amount0());
        _ode(v.key.currency1, delta.amount1());

        likidite += uint128(l);
        _sonEklenen = uint128(l);
        emit Biriktirildi(b0, b1, likidite);
        return "";
    }

    function _slot0(PoolKey memory key) internal view returns (uint160, int24, uint24, uint24) {
        /* extsload rather than a library import: the pool slot layout is
           already relied on by the measurement scripts and this keeps the
           dependency surface the same. */
        bytes32 slot = keccak256(abi.encode(PoolId.unwrap(key.toId()), uint256(6)));
        bytes32 raw = poolManager.extsload(slot);
        uint160 sp = uint160(uint256(raw));
        int24 tick = int24(uint24(uint256(raw) >> 160));
        return (sp, tick, 0, 0);
    }

    function _ode(Currency c, int128 d) internal {
        if (d >= 0) return;
        uint256 borc = uint256(uint128(-d));
        poolManager.sync(c);
        if (!IERC20H(Currency.unwrap(c)).transfer(address(poolManager), borc)) revert OdemeOlmadi();
        poolManager.settle();
    }

    /* ---- ratio arithmetic, split so nothing nears the ceiling ------- */

    function _sqrtRatioX96(uint256 num, uint256 den) internal pure returns (uint160) {
        uint256 a = _sqrt(num << 96);
        uint256 b = _sqrt(den << 96);
        if (b == 0) b = 1;
        uint256 v = (a << 96) / b;
        if (v < TickMath.MIN_SQRT_PRICE) v = TickMath.MIN_SQRT_PRICE;
        if (v > TickMath.MAX_SQRT_PRICE) v = TickMath.MAX_SQRT_PRICE;
        return uint160(v);
    }

    function _snapDown(int24 tick) internal view returns (int24) {
        int24 r = tick / tickSpacing * tickSpacing;
        if (tick < 0 && tick % tickSpacing != 0) r -= tickSpacing;
        if (r < TickMath.MIN_TICK) r = TickMath.MIN_TICK / tickSpacing * tickSpacing;
        return r;
    }

    function _snapUp(int24 tick) internal view returns (int24) {
        int24 r = _snapDown(tick);
        if (r != tick) r += tickSpacing;
        if (r > TickMath.MAX_TICK) r = TickMath.MAX_TICK / tickSpacing * tickSpacing;
        return r;
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
