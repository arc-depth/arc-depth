/* ===========================================================================
 * gosterge.js — chart indicators and the "chart state" key (browser and Node: no DOM, no imports)
 *
 * 16 Nov 2026 (owner approved: "grafik ve indikatör analizleri", "ikinci time machine şeklinde koy").
 * Used by the trade page chart and its Chart read panel (gorunum/hl-grafik.js), by scripts/tm-veri.js
 * (the state of every past hour of every market, and what followed) and by Time Machine 2.
 * All on 1 h candles: arrays of close c, high h, low l, volume v (oldest first).
 * =========================================================================== */

export function ema(x, n) {
  const k = 2 / (n + 1), o = new Array(x.length).fill(null);
  let e = null;
  for (let i = 0; i < x.length; i++) { e = e == null ? x[i] : x[i] * k + e * (1 - k); if (i >= n - 1) o[i] = e; }
  return o;
}
export function sma(x, n) {
  const o = new Array(x.length).fill(null); let s = 0;
  for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= n) s -= x[i - n]; if (i >= n - 1) o[i] = s / n; }
  return o;
}
/** Wilder's RSI */
export function rsi(c, n = 14) {
  const o = new Array(c.length).fill(null);
  let ak = 0, dk = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1], a = Math.max(d, 0), b = Math.max(-d, 0);
    if (i <= n) { ak += a / n; dk += b / n; if (i === n) o[i] = dk === 0 ? 100 : 100 - 100 / (1 + ak / dk); continue; }
    ak = (ak * (n - 1) + a) / n; dk = (dk * (n - 1) + b) / n;
    o[i] = dk === 0 ? 100 : 100 - 100 / (1 + ak / dk);
  }
  return o;
}
export function macd(c, a = 12, b = 26, s = 9) {
  const ea = ema(c, a), eb = ema(c, b);
  const m = c.map((_, i) => (ea[i] != null && eb[i] != null ? ea[i] - eb[i] : null));
  const ilk = m.findIndex((x) => x != null);
  const sig = new Array(c.length).fill(null);
  if (ilk >= 0) { const e = ema(m.slice(ilk), s); e.forEach((x, j) => { sig[ilk + j] = x; }); }
  return { macd: m, sinyal: sig, hist: m.map((x, i) => (x != null && sig[i] != null ? x - sig[i] : null)) };
}
export function bollinger(c, n = 20, k = 2) {
  const orta = sma(c, n), ust = new Array(c.length).fill(null), alt = new Array(c.length).fill(null);
  for (let i = n - 1; i < c.length; i++) {
    let s = 0; for (let j = i - n + 1; j <= i; j++) s += (c[j] - orta[i]) ** 2;
    const sd = Math.sqrt(s / n); ust[i] = orta[i] + k * sd; alt[i] = orta[i] - k * sd;
  }
  return { orta, ust, alt };
}
/** VWAP of the last `n` candles at every point (a rolling 24 h VWAP on 1 h candles) */
export function vwap(c, h, l, v, n = 24) {
  const o = new Array(c.length).fill(null);
  for (let i = n - 1; i < c.length; i++) {
    let pv = 0, vv = 0;
    for (let j = i - n + 1; j <= i; j++) { const tp = (h[j] + l[j] + c[j]) / 3; pv += tp * v[j]; vv += v[j]; }
    o[i] = vv > 0 ? pv / vv : null;
  }
  return o;
}
/** swing highs / lows (a candle higher / lower than `k` candles on each side), the nearest ones first */
export function seviyeler(h, l, c, k = 3) {
  const son = c[c.length - 1], dir = [], des = [];
  for (let i = k; i < h.length - k; i++) {
    let tepe = true, dip = true;
    for (let j = 1; j <= k; j++) { if (h[i] < h[i - j] || h[i] < h[i + j]) tepe = false; if (l[i] > l[i - j] || l[i] > l[i + j]) dip = false; }
    if (tepe && h[i] > son) dir.push(h[i]);
    if (dip && l[i] < son) des.push(l[i]);
  }
  return { direnc: [...new Set(dir)].sort((a, b) => a - b).slice(0, 3), destek: [...new Set(des)].sort((a, b) => b - a).slice(0, 3) };
}

/**
 * Every indicator for every candle, plus the chart state key of each candle:
 *   R  RSI(14):          0 <30 · 1 30–45 · 2 45–55 · 3 55–70 · 4 >70
 *   T  trend:            0 down (close < EMA50 and EMA20 < EMA50) · 2 up (both above) · 1 mixed
 *   B  Bollinger %B:     0 below the lower band · 1 lower half · 2 upper half · 3 above the upper band
 *   V  volume:           0 < 0.7× its 24 h average · 1 normal · 2 > 1.5×
 *   M  MACD histogram:   0 negative · 1 positive
 * e.g. "R1T0B1V1M0". null until there is enough history (50 candles).
 */
export function hepsi({ c, h, l, v }) {
  const e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200), r = rsi(c), m = macd(c), bb = bollinger(c), vw = vwap(c, h, l, v), v24 = sma(v, 24);
  const durum = c.map((x, i) => {
    if (i < 50 || r[i] == null || e50[i] == null || bb.ust[i] == null || m.hist[i] == null || !(v24[i] > 0)) return null;
    const R = r[i] < 30 ? 0 : r[i] < 45 ? 1 : r[i] < 55 ? 2 : r[i] < 70 ? 3 : 4;
    const T = x < e50[i] && e20[i] < e50[i] ? 0 : x > e50[i] && e20[i] > e50[i] ? 2 : 1;
    const gen = bb.ust[i] - bb.alt[i], pb = gen > 0 ? (x - bb.alt[i]) / gen : 0.5;
    const B = pb < 0 ? 0 : pb < 0.5 ? 1 : pb <= 1 ? 2 : 3;
    const oran = v[i] / v24[i], V = oran < 0.7 ? 0 : oran > 1.5 ? 2 : 1;
    const M = m.hist[i] < 0 ? 0 : 1;
    return "R" + R + "T" + T + "B" + B + "V" + V + "M" + M;
  });
  return { e20, e50, e200, rsi: r, macd: m, bb, vwap: vw, v24, durum };
}

/** the same key with fewer parts, for when the full key has too few past examples */
export const GEVSET = [(k) => k, (k) => k.slice(0, 6) + k.slice(8), (k) => k.slice(0, 6), (k) => k.slice(0, 4), (k) => k.slice(2, 4)];
export const GEVSET_AD = ["RSI, trend, Bollinger, volume and MACD", "RSI, trend, Bollinger and MACD", "RSI, trend and Bollinger", "RSI and trend", "trend"];

/** plain-English reading of one state key */
export function durumYazi(k) {
  if (!k) return null;
  const R = ["oversold (RSI < 30)", "weak (RSI 30–45)", "neutral (RSI 45–55)", "strong (RSI 55–70)", "overbought (RSI > 70)"][Number(k[1])];
  const T = ["downtrend (below EMA 50, EMA 20 under EMA 50)", "no clear trend", "uptrend (above EMA 50, EMA 20 over EMA 50)"][Number(k[3])];
  const B = ["below the lower Bollinger band", "in the lower half of the Bollinger bands", "in the upper half of the Bollinger bands", "above the upper Bollinger band"][Number(k[5])];
  const V = ["quiet volume", "normal volume", "heavy volume"][Number(k[7])];
  const M = ["MACD below its signal", "MACD above its signal"][Number(k[9])];
  return { R, T, B, V, M };
}
