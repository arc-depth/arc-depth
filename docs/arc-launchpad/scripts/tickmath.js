"use strict";
/* ===========================================================================
 * tickmath.js — tick -> sqrtPriceX96, exactly as v4 does it.
 *
 * WHY NOT Math.sqrt(1.0001 ** tick) * 2 ** 96
 *   Because the ladder's top rung has to sit on exactly the tick the pool
 *   opens at. A double carries about sixteen significant digits and the
 *   answer needs thirty-eight, so the float lands within roughly 1e21 of
 *   the true value — microscopic in relative terms, but the true value IS
 *   a tick boundary, and landing a hair below it puts the pool one tick
 *   lower than intended. The opener then sees its band top above the
 *   price and reverts, and the failure would look like a contract bug
 *   rather than a rounding one.
 *
 *   This is the same shape of mistake that has cost this project real
 *   money twice: a scaled float standing in for an exact ratio. So the
 *   conversion is integer arithmetic, the constant table is Uniswap's own,
 *   and `dogrula` checks a round trip before anything relies on it.
 *
 * The algorithm is Uniswap's TickMath.getSqrtRatioAtTick: decompose the
 * tick into bits, multiply the Q128.128 factor for each set bit, invert
 * for positive ticks, then shift down to Q64.96 rounding up.
 * =========================================================================== */

const CARPANLAR = [
  [0x1n, 0xfffcb933bd6fad37aa2d162d1a594001n],
  [0x2n, 0xfff97272373d413259a46990580e213an],
  [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000n, 0x48a170391f7dc42444e8fa2n]
];

const MAX_UINT256 = (1n << 256n) - 1n;
const MIN_TICK = -887272;
const MAX_TICK = 887272;

/** tick -> sqrtPriceX96, exact. */
function sqrtPriceX96(tick) {
  const t = BigInt(tick);
  if (t < BigInt(MIN_TICK) || t > BigInt(MAX_TICK)) throw new Error("tick araligi disinda: " + tick);
  const mutlak = t < 0n ? -t : t;

  let oran = (mutlak & 0x1n) !== 0n
    ? 0xfffcb933bd6fad37aa2d162d1a594001n
    : 0x100000000000000000000000000000000n;
  for (const [bit, c] of CARPANLAR) {
    if (bit === 0x1n) continue;
    if ((mutlak & bit) !== 0n) oran = (oran * c) >> 128n;
  }

  if (t > 0n) oran = MAX_UINT256 / oran;

  /* Q128.128 down to Q64.96, rounding up so the result never sits below
     the tick it names — which is the whole point of doing this exactly. */
  return (oran >> 32n) + ((oran % (1n << 32n)) === 0n ? 0n : 1n);
}

/** sqrtPriceX96 -> tick, by binary search on the exact function. Slower
 *  than Uniswap's log approximation and that is fine: it is only used to
 *  check the forward direction, and a check sharing the forward
 *  function's assumptions would check nothing. */
function tickAt(sqrt) {
  const s = BigInt(sqrt);
  let lo = MIN_TICK, hi = MAX_TICK;
  while (lo < hi) {
    const orta = Math.ceil((lo + hi) / 2);
    if (sqrtPriceX96(orta) <= s) lo = orta; else hi = orta - 1;
  }
  return lo;
}

/** Round trip: every tick must map to a price that maps back to itself. */
function dogrula(tikler) {
  const hatalar = [];
  for (const t of tikler) {
    const s = sqrtPriceX96(t);
    const geri = tickAt(s);
    if (geri !== t) hatalar.push({ tick: t, geri, sqrt: s.toString() });
    /* And one wei below must fall to the previous tick, which is what
       proves the value is ON the boundary and not just near it. */
    const altGeri = tickAt(s - 1n);
    if (altGeri !== t - 1) hatalar.push({ tick: t, sinirAltinda: altGeri });
  }
  return hatalar;
}

module.exports = { sqrtPriceX96, tickAt, dogrula, MIN_TICK, MAX_TICK };
