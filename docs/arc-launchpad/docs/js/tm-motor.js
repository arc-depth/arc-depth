/* ===========================================================================
 * tm-motor.js — the Time Machine simulation engine (browser and Node: no DOM, no imports)
 *
 * 15 Nov 2026 (owner approved). Design: rapor/reports/Geleceğe dönük Time Machine.md.
 * For a planned trade (entry, take profit, stop loss, horizon) it runs N possible futures of the
 * price, hour by hour, and counts which comes first: TP, SL or neither before the horizon.
 *
 * Forward-looking, not a replay of the past:
 *   - the volatility each path starts from is a FORECAST for the coming hours: a HAR-RV realised-vol
 *     forecast blended with options-implied volatility (net of the usual options premium), both
 *     prepared hourly by scripts/tm-veri.js
 *   - an hour-of-day pattern and scheduled events (US CPI, FOMC...) raise or lower each hour's volatility
 *   - volatility clusters inside each path (EWMA), so a big move makes the next hours wilder
 *   - the shape of the moves (fat tails, jumps) comes from the coin's own recent shocks, standardised
 *     by the volatility at the time and drawn in blocks (filtered historical simulation)
 *   - liquidation clusters read from Hyperliquid's public positions: when a path pushes the price
 *     through a cluster, the forced orders push it further (square-root impact, a few rounds)
 *   - between two hourly points, a touch of TP / SL is tested with a Brownian bridge, so quick
 *     wicks are not missed
 * Zero drift: the engine never assumes a direction. It is a model with limits, not a forecast of
 * the price; scripts/tm-kayit.js scores it publicly against what really happened.
 * =========================================================================== */

/* small fast seeded PRNG (mulberry32) */
export function rastgele(tohum) {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * p: {
 *   giris      entry price
 *   tp, sl     take profit / stop loss prices (either may be null: then only the other counts)
 *   saat       horizon in hours (integer)
 *   sigma      hourly volatility forecast for the next hour (log-return st. dev.)
 *   carpan     optional array, one multiplier per hour of the horizon (hour-of-day pattern × events)
 *   artik      standardised past shocks (numbers ~ N(0,1) with fat tails), oldest first
 *   blok       block length for drawing shocks (default 6)
 *   lambda     EWMA decay for volatility inside a path (default 0.94)
 *   likit      optional { uzun: [[price, usd]...], kisa: [[price, usd]...] } liquidation levels
 *              (longs are liquidated when the price falls to them, shorts when it rises)
 *   etki       optional { Y, gunSigma, gunHacim, h } square-root impact: Δln p = Y·σ_day·sqrt(h·Q/V_day)
 *   n          number of paths (default 10000)
 *   ornek      how many paths to keep for drawing (default 160)
 *   tohum      seed (default: time based)
 * }
 * returns { n, tp, sl, hic, tpSaat[], slSaat[], yollar: [{ s: "tp"|"sl"|"-", y: Float32Array }], ... }
 */
export function simule(p) {
  const N = p.n || 10000, T = Math.max(1, Math.round(p.saat)), B = p.blok || 6, L = p.lambda == null ? 0.94 : p.lambda;
  const R = rastgele(p.tohum == null ? (Date.now() & 0xffffffff) : p.tohum);
  const art = p.artik && p.artik.length > B * 4 ? p.artik : null;
  const x0 = 0;
  const ust = p.tp != null && p.sl != null ? Math.max(p.tp, p.sl) : (p.tp != null ? p.tp : p.sl);
  const xTp = p.tp != null ? Math.log(p.tp / p.giris) : null, xSl = p.sl != null ? Math.log(p.sl / p.giris) : null;
  const car = p.carpan || null;
  /* liquidation ladders as log distances from the entry, nearest first */
  const asagi = p.likit && p.likit.uzun ? p.likit.uzun.filter((l) => l[0] < p.giris && l[1] > 0).map((l) => [Math.log(l[0] / p.giris), l[1]]).sort((a, b) => b[0] - a[0]) : [];
  const yukari = p.likit && p.likit.kisa ? p.likit.kisa.filter((l) => l[0] > p.giris && l[1] > 0).map((l) => [Math.log(l[0] / p.giris), l[1]]).sort((a, b) => a[0] - b[0]) : [];
  const E = p.etki && p.etki.gunHacim > 0 ? p.etki : null;
  const darbe = (q) => (E ? E.Y * E.gunSigma * Math.sqrt((E.h * q) / E.gunHacim) : 0);
  /* a normal draw for when there is no shock pool */
  const normal = () => { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  /* Brownian bridge: probability that a step from a to b with variance s2 touched level c (same side) */
  const kopru = (a, b, c, s2) => ((a - c) * (b - c) <= 0 ? 1 : Math.exp((-2 * (a - c) * (b - c)) / s2));

  const ORNEK = Math.min(N, p.ornek == null ? 160 : p.ornek);
  const yollar = [];
  let nTp = 0, nSl = 0, nHic = 0, kademe = 0;
  const tpSaat = new Array(T).fill(0), slSaat = new Array(T).fill(0);
  const sonlar = new Float64Array(N);
  const s0 = p.sigma * p.sigma;
  for (let i = 0; i < N; i++) {
    let x = x0, v = s0, bj = 0, bk = 0, sonuc = "-", ai = asagi.length ? 0 : -1, yi = yukari.length ? 0 : -1;
    let blokBas = art ? Math.floor(R() * (art.length - B)) : 0;
    /* Time Machine 2: start from the hour after a past moment with a similar chart, and replay what followed */
    let ai2 = p.analog && p.analog.baslar.length ? p.analog.baslar[Math.floor(R() * p.analog.baslar.length)] + 1 : -1;
    const yol = i < ORNEK ? new Float32Array(T + 1) : null;
    if (yol) yol[0] = 0;
    let t = 0;
    for (; t < T; t++) {
      let z;
      if (ai2 >= 0 && ai2 < art.length) { z = art[ai2] + p.analog.ekle; ai2++; }
      else {
        ai2 = -1;
        if (bk === B) { bk = 0; blokBas = art ? Math.floor(R() * (art.length - B)) : 0; }
        z = art ? art[blokBas + bk] : normal();
        bk++;
      }
      const m = car ? (car[t] || 1) : 1;
      const sig = Math.sqrt(v) * m;
      let r = sig * z;
      let y = x + r;
      /* liquidation cascade: a level crossed adds forced flow in the same direction, a few rounds */
      if (E) {
        for (let tur = 0; tur < 5; tur++) {
          let q = 0;
          if (y < x && ai >= 0) while (ai < asagi.length && asagi[ai][0] >= y) { q += asagi[ai][1]; ai++; }
          if (y > x && yi >= 0) while (yi < yukari.length && yukari[yi][0] <= y) { q += yukari[yi][1]; yi++; }
          if (q <= 0) break;
          const d = darbe(q);
          y += y < x ? -d : d;
          kademe++;
        }
        if (ai >= asagi.length) ai = -1;
        if (yi >= yukari.length) yi = -1;
      }
      const s2 = Math.max(sig * sig, 1e-12);
      /* which barrier was touched in this hour (bridge for touches between the two hourly points) */
      const pTp = xTp == null ? 0 : kopru(x, y, xTp, s2), pSl = xSl == null ? 0 : kopru(x, y, xSl, s2);
      const hTp = pTp > 0 && R() < pTp, hSl = pSl > 0 && R() < pSl;
      if (hTp || hSl) {
        sonuc = hTp && hSl ? (R() < pTp / (pTp + pSl) ? "tp" : "sl") : hTp ? "tp" : "sl";
        x = sonuc === "tp" ? xTp : xSl;
        if (yol) yol[t + 1] = x;
        t++;
        break;
      }
      /* volatility inside the path follows its own shocks */
      v = L * v + (1 - L) * ((y - x) * (y - x)) / (m * m || 1);
      x = y;
      if (yol) yol[t + 1] = x;
    }
    if (sonuc === "tp") { nTp++; tpSaat[t - 1]++; } else if (sonuc === "sl") { nSl++; slSaat[t - 1]++; } else nHic++;
    sonlar[i] = x;
    if (yol) yollar.push({ s: sonuc, y: yol.subarray(0, Math.max(2, t + 1)) });
  }
  const sirali = Array.from(sonlar).sort((a, b) => a - b);
  const yuzdelik = (q) => p.giris * Math.exp(sirali[Math.floor(q * (N - 1))]);
  return { n: N, tp: nTp, sl: nSl, hic: nHic, tpSaat, slSaat, yollar, kademe, xTp, xSl, ust,
    aralik: { p05: yuzdelik(0.05), p25: yuzdelik(0.25), p50: yuzdelik(0.5), p75: yuzdelik(0.75), p95: yuzdelik(0.95) } };
}

/** The per-hour multipliers for a horizon starting now: hour-of-day pattern × scheduled events. */
export function carpanlar({ saat, mevsim, olaylar, simdi = Date.now(), olayCarpan = 2 }) {
  const c = [];
  for (let i = 0; i < saat; i++) {
    const bas = simdi + i * 3600e3, bit = bas + 3600e3;
    let m = mevsim && mevsim.length === 24 ? mevsim[new Date(bas).getUTCHours()] : 1;
    /* an event from 1 h before to 30 min after raises the volatility of the hours it touches */
    if (olaylar) for (const o of olaylar) { const z = Date.parse(o.t); if (z - 3600e3 < bit && z + 1800e3 > bas) { m *= olayCarpan; break; } }
    c.push(m);
  }
  return c;
}

/**
 * Everything the engine needs for one market, from its hourly file (veri/tm/<COIN>.json) and the
 * index (veri/tm/index.json). Shared by the page and by scripts/tm-kayit.js, so the published track
 * record scores exactly what visitors see. katman: which forward layers are on
 * ({ iv, mevsim, olay, likit } — all true by default; all false = the plain baseline).
 */
export function girdiHazirla(D, I, { giris, tp, sl, saat, n, tohum, ornek, katman = {} }) {
  const k = { iv: true, mevsim: true, olay: true, likit: true, ...katman };
  const sigma = k.iv ? D.sigma : (D.parca && D.parca.har) || D.sigma;
  const carpan = carpanlar({ saat, mevsim: k.mevsim ? I && I.mevsim : null, olaylar: k.olay ? I && I.olaylar : null });
  const gunSigma = sigma * Math.sqrt(24);
  return { giris, tp, sl, saat, n, tohum, ornek, sigma, carpan, artik: D.artik,
    likit: k.likit ? D.likit : null,
    etki: k.likit && D.likit && D.gunHacim > 0 ? { Y: 0.5, gunSigma, gunHacim: D.gunHacim, h: 0.5 } : null };
}

/**
 * Time Machine 2 inputs: the same forward model, but every future starts from the hour after a past moment
 * of this market whose chart state matched today's (gosterge.js hepsi().durum), and replays the moves that
 * really followed (with their drift), scaled to today's volatility. The match loosens step by step
 * (gevset: list of key reducers, loosest last) until at least `enAz` past moments are found.
 * Returns null when the market has no chart states yet.
 */
export function girdiHazirla2(D, I, secenek, gevset, enAz = 20) {
  if (!D.durum || !D.durum.length || !D.simdiDurum) return null;
  const T = Math.max(1, Math.round(secenek.saat));
  for (let s2 = 0; s2 < gevset.length; s2++) {
    const hedef = gevset[s2](D.simdiDurum);
    const baslar = [];
    for (let k = 0; k < D.durum.length - 1; k++) if (D.durum[k] && gevset[s2](D.durum[k]) === hedef) baslar.push(k);
    /* prefer moments with the whole horizon after them */
    const tam = baslar.filter((k) => k + T < D.artik.length);
    const l = tam.length >= enAz ? tam : baslar;
    if (l.length >= enAz || s2 === gevset.length - 1) {
      if (!l.length) return null;
      return { ...girdiHazirla(D, I, secenek), analog: { baslar: l, ekle: D.zOrt || 0 }, eslesme: { seviye: s2, anahtar: hedef, n: l.length } };
    }
  }
  return null;
}
