/* ===========================================================================
 * indikator.js — the classic indicators as textbook signals, and their scorecard on one market
 *
 * 18 Nov 2026 (owner approved the "indicator scorecard"). Same maths as scripts/indikator-tara.js, which scanned
 * 18 indicators on 20 Hyperliquid perps and found none that worked in both halves of ~200 days: which one works
 * depends on what the market is doing. So the site shows, per market, how each one did over the last 30 days and
 * what each one says now. Runs in the browser on 1 h candles; nothing is sent anywhere.
 * =========================================================================== */

/* ---- indicator maths (all causal: value at i uses bars <= i) ---- */
const ema = (x, n) => { const k = 2 / (n + 1), o = []; let e = x[0]; for (let i = 0; i < x.length; i++) { e = i ? x[i] * k + e * (1 - k) : x[0]; o.push(e); } return o; };
const sma = (x, n) => { const o = []; let s = 0; for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= n) s -= x[i - n]; o.push(i >= n - 1 ? s / n : NaN); } return o; };
const sd = (x, n) => { const m = sma(x, n); return x.map((_, i) => { if (i < n - 1) return NaN; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (x[j] - m[i]) ** 2; return Math.sqrt(s / n); }); };
const enYuksek = (x, n, i) => { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, x[j]); return m; };
const enDusuk = (x, n, i) => { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, x[j]); return m; };
function rsi(c, n = 14) { const o = [NaN]; let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; const gg = Math.max(d, 0), ll = Math.max(-d, 0); if (i <= n) { g += gg / n; l += ll / n; o.push(i < n ? NaN : 100 - 100 / (1 + g / (l || 1e-12))); } else { g = (g * (n - 1) + gg) / n; l = (l * (n - 1) + ll) / n; o.push(100 - 100 / (1 + g / (l || 1e-12))); } } return o; }
function atr(h, l, c, n = 14) { const tr = c.map((_, i) => (i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i])); return ema(tr, 2 * n - 1); }
export function adx(h, l, c, n = 14) {
  const pdm = [0], mdm = [0];
  for (let i = 1; i < c.length; i++) { const u = h[i] - h[i - 1], d = l[i - 1] - l[i]; pdm.push(u > d && u > 0 ? u : 0); mdm.push(d > u && d > 0 ? d : 0); }
  const a = atr(h, l, c, n), p = ema(pdm, 2 * n - 1), m = ema(mdm, 2 * n - 1);
  const pdi = p.map((v, i) => (100 * v) / (a[i] || 1e-12)), mdi = m.map((v, i) => (100 * v) / (a[i] || 1e-12));
  const dx = pdi.map((v, i) => (100 * Math.abs(v - mdi[i])) / (v + mdi[i] || 1e-12));
  return { adx: ema(dx, 2 * n - 1), pdi, mdi };
}
function supertrend(h, l, c, n = 10, k = 3) {
  const a = atr(h, l, c, n), yon = [1]; let ust = (h[0] + l[0]) / 2 + k * a[0], alt = (h[0] + l[0]) / 2 - k * a[0];
  for (let i = 1; i < c.length; i++) {
    const m = (h[i] + l[i]) / 2, u = m + k * a[i], d = m - k * a[i];
    ust = u < ust || c[i - 1] > ust ? u : ust; alt = d > alt || c[i - 1] < alt ? d : alt;
    yon.push(yon[i - 1] === 1 ? (c[i] < alt ? -1 : 1) : (c[i] > ust ? 1 : -1));
  }
  return yon;
}

export function sinyaller(m) {
  const c = m.map((x) => x.c), h = m.map((x) => x.h), l = m.map((x) => x.l), v = m.map((x) => x.v);
  const e20 = ema(c, 20), e50 = ema(c, 50), s200 = sma(c, 200), r = rsi(c), mac = ema(c, 12).map((x, i) => x - ema(c, 26)[i]);
  const e12 = ema(c, 12), e26 = ema(c, 26), macdL = e12.map((x, i) => x - e26[i]), sig = ema(macdL, 9), hist = macdL.map((x, i) => x - sig[i]);
  const bm = sma(c, 20), bs = sd(c, 20), A = adx(h, l, c), st = supertrend(h, l, c), at = atr(h, l, c, 20);
  const tp = c.map((x, i) => (x + h[i] + l[i]) / 3), tpm = sma(tp, 20);
  const md = tp.map((_, i) => { if (i < 19) return NaN; let s = 0; for (let j = i - 19; j <= i; j++) s += Math.abs(tp[j] - tpm[i]); return s / 20; });
  let obv = 0; const obvs = c.map((x, i) => (obv += i ? Math.sign(x - c[i - 1]) * v[i] : 0)); const obvE = ema(obvs, 20);
  const mf = tp.map((x, i) => x * v[i]);
  const k20 = ema(c, 20), kel = at.map((x) => 1.5 * x);
  const S = {};
  const ekle = (ad, aile, f) => { S[ad] = { aile, s: c.map((_, i) => (i < 210 ? 0 : f(i))) }; };
  ekle("EMA 20/50 cross (trend)", "trend", (i) => Math.sign(e20[i] - e50[i]));
  ekle("Price vs SMA 200 (trend)", "trend", (i) => Math.sign(c[i] - s200[i]));
  ekle("MACD histogram (momentum)", "momentum", (i) => Math.sign(hist[i]));
  ekle("RSI 14 > 50 (momentum)", "momentum", (i) => Math.sign(r[i] - 50));
  ekle("RSI 14 30/70 (mean reversion)", "mean reversion", (i) => (r[i] < 30 ? 1 : r[i] > 70 ? -1 : 0));
  ekle("Stochastic 14 20/80 (mean reversion)", "mean reversion", (i) => { const hi = enYuksek(h, 14, i), lo = enDusuk(l, 14, i), k = (100 * (c[i] - lo)) / (hi - lo || 1e-12); return k < 20 ? 1 : k > 80 ? -1 : 0; });
  ekle("Bollinger outside band (mean reversion)", "mean reversion", (i) => (c[i] < bm[i] - 2 * bs[i] ? 1 : c[i] > bm[i] + 2 * bs[i] ? -1 : 0));
  ekle("Bollinger breakout (momentum)", "momentum", (i) => (c[i] > bm[i] + 2 * bs[i] ? 1 : c[i] < bm[i] - 2 * bs[i] ? -1 : 0));
  ekle("Donchian 20 breakout (trend)", "trend", (i) => (c[i] >= enYuksek(h, 20, i - 1) ? 1 : c[i] <= enDusuk(l, 20, i - 1) ? -1 : 0));
  ekle("ADX > 25 with DI direction (trend)", "trend", (i) => (A.adx[i] > 25 ? Math.sign(A.pdi[i] - A.mdi[i]) : 0));
  ekle("CCI 20 ±100 (mean reversion)", "mean reversion", (i) => { const x = (tp[i] - tpm[i]) / (0.015 * md[i] || 1e-12); return x < -100 ? 1 : x > 100 ? -1 : 0; });
  ekle("Supertrend 10,3 (trend)", "trend", (i) => st[i]);
  ekle("OBV vs its EMA 20 (volume)", "volume", (i) => Math.sign(obvs[i] - obvE[i]));
  ekle("VWAP 24 h (volume)", "volume", (i) => { let pv = 0, vv = 0; for (let j = i - 23; j <= i; j++) { pv += tp[j] * v[j]; vv += v[j]; } return Math.sign(c[i] - pv / (vv || 1e-12)); });
  ekle("MFI 14 20/80 (volume, mean reversion)", "volume", (i) => { let p = 0, n = 0; for (let j = i - 13; j <= i; j++) { if (tp[j] > tp[j - 1]) p += mf[j]; else n += mf[j]; } const x = 100 - 100 / (1 + p / (n || 1e-12)); return x < 20 ? 1 : x > 80 ? -1 : 0; });
  ekle("Keltner squeeze release (volatility)", "volatility", (i) => { const sik = (j) => bm[j] + 2 * bs[j] < k20[j] + kel[j] && bm[j] - 2 * bs[j] > k20[j] - kel[j]; return sik(i - 1) && !sik(i) ? Math.sign(c[i] - bm[i]) : 0; });
  ekle("24 h return (time-series momentum)", "momentum", (i) => Math.sign(c[i] - c[i - 24]));
  ekle("24 h return reversal (mean reversion)", "mean reversion", (i) => -Math.sign(c[i] - c[i - 24]));
  return S;
}


/** m = [{t,o,h,l,c,v}] hourly, oldest first. Scores each indicator over the last gun days on what followed in ufuk hours. */
export function karne(m, { gun = 30, ufuk = 24 } = {}) {
  if (!m || m.length < 260) return null;
  const S = sinyaller(m);
  const son = m.length - 1, bitis = son - ufuk, bas = Math.max(210, bitis - gun * 24);
  if (bitis - bas < 72) return null;
  const satir = Object.entries(S).map(([ad, x]) => {
    const g = [];
    for (let i = bas; i <= bitis; i++) { const s = x.s[i]; if (s) g.push(s * Math.log(m[i + ufuk].c / m[i].c)); }
    const ort = g.length ? g.reduce((p, q) => p + q, 0) / g.length : null;
    return { ad, aile: x.aile, n: g.length, isabet: g.length ? g.filter((v) => v > 0).length / g.length : null, ortBps: ort == null ? null : ort * 1e4, simdi: x.s[son] };
  });
  let t = 0; for (let i = bas; i <= bitis; i++) t += Math.log(m[i + ufuk].c / m[i].c);
  return { satir, gun: Math.round((bitis - bas) / 24), ufuk, tabanBps: (t / (bitis - bas + 1)) * 1e4 };
}
