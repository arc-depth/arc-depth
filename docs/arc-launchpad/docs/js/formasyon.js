/* ===========================================================================
 * formasyon.js — chart pattern hunter: finds classic patterns on any timeframe and plans the trade
 *
 * 18 Nov 2026 (owner: "a bot that hunts chart patterns, from 1 h up to monthly"). Shared by the backtest
 * (scripts/formasyon-test.js) and the site. Causal: a pattern at bar i only uses pivots already confirmed by i.
 *
 *   pivots      a high (low) is a pivot when it is the highest (lowest) of the W bars on each side; it is known
 *               W bars later. Consecutive same-type pivots keep the more extreme one.
 *   patterns    double top / bottom · head & shoulders / inverse · ascending / descending / symmetrical triangle
 *               · rising / falling wedge · channel · bull / bear flag
 *   trade       on the first close through the neckline / boundary within the pattern's own length:
 *               entry = that close, target = the classic measured move, stop = the pattern's invalidation level
 * =========================================================================== */

export const FORMASYON_AD = {
  ikiliTepe: "Double top", ikiliDip: "Double bottom", obo: "Head and shoulders", tobo: "Inverse head and shoulders",
  yukselenUcgen: "Ascending triangle", alcalanUcgen: "Descending triangle", simetrikUcgen: "Symmetrical triangle",
  yukselenTakoz: "Rising wedge", dusenTakoz: "Falling wedge", kanal: "Channel", bogaBayrak: "Bull flag", ayiBayrak: "Bear flag",
};

function atr(m, n = 14) {
  const o = []; let e = 0;
  for (let i = 0; i < m.length; i++) {
    const tr = i ? Math.max(m[i].h - m[i].l, Math.abs(m[i].h - m[i - 1].c), Math.abs(m[i].l - m[i - 1].c)) : m[i].h - m[i].l;
    e = i ? e + (tr - e) / n : tr; o.push(e);
  }
  return o;
}

/** Pivots of m with half-window W: [{i, f, t:"H"|"L", bilinen}] alternating, `bilinen` = bar where it became known. */
export function pivotlar(m, W = 5) {
  const p = [];
  for (let i = W; i < m.length - W; i++) {
    let h = true, l = true;
    for (let j = i - W; j <= i + W; j++) { if (j === i) continue; if (m[j].h > m[i].h) h = false; if (m[j].l < m[i].l) l = false; }
    for (const [ok, t, f] of [[h, "H", m[i].h], [l, "L", m[i].l]]) {
      if (!ok) continue;
      const son = p[p.length - 1];
      if (son && son.t === t) { if ((t === "H" && f > son.f) || (t === "L" && f < son.f)) p[p.length - 1] = { i, f, t, bilinen: i + W }; }
      else p.push({ i, f, t, bilinen: i + W });
    }
  }
  return p;
}

const cizgi = (a, b) => { const e = (b.f - a.f) / (b.i - a.i); return (x) => a.f + e * (x - a.i); };

/** Candidate patterns whose last pivot is the newest pivot known at bar `k` (p = pivots known so far). */
function adaylar(p, A) {
  const o = [];
  const n = p.length;
  if (n < 3) return o;
  const son = p.slice(-6);
  const P = (j) => son[son.length - j];   // P(1) newest
  /* double top / bottom: X1, Y, X2 with X1 ≈ X2 */
  {
    const [a, b, c] = [P(3), P(2), P(1)];
    if (a && b && c && a.t === c.t) {
      const boy = Math.abs((a.f + c.f) / 2 - b.f), esit = Math.abs(a.f - c.f) <= 0.15 * boy;
      if (esit && boy >= 3 * A && c.i - a.i >= 8) {
        if (a.t === "H") o.push({ tur: "ikiliTepe", yon: -1, boyun: () => b.f, boy, stop: Math.max(a.f, c.f), bas: a.i, son: c.i, noktalar: [a, b, c] });
        else o.push({ tur: "ikiliDip", yon: 1, boyun: () => b.f, boy, stop: Math.min(a.f, c.f), bas: a.i, son: c.i, noktalar: [a, b, c] });
      }
    }
  }
  /* head and shoulders: S1, N1, H, N2, S2 */
  if (son.length >= 5) {
    const [s1, n1, h, n2, s2] = [P(5), P(4), P(3), P(2), P(1)];
    if (s1.t === h.t && h.t === s2.t) {
      const ust = h.t === "H";
      const boyun = cizgi(n1, n2), boy = Math.abs(h.f - boyun(h.i));
      const kafa = ust ? h.f > Math.max(s1.f, s2.f) + 0.1 * boy : h.f < Math.min(s1.f, s2.f) - 0.1 * boy;
      const omuz = Math.abs(s1.f - s2.f) <= 0.3 * boy;
      if (kafa && omuz && boy >= 3 * A) o.push({ tur: ust ? "obo" : "tobo", yon: ust ? -1 : 1, boyun, boy, stop: s2.f, bas: s1.i, son: s2.i, noktalar: [s1, n1, h, n2, s2] });
    }
  }
  /* triangles, wedges, channels: lines through the last two highs and the last two lows */
  if (son.length >= 4) {
    const H = son.filter((x) => x.t === "H").slice(-2), L = son.filter((x) => x.t === "L").slice(-2);
    if (H.length === 2 && L.length === 2) {
      const ust = cizgi(H[0], H[1]), alt = cizgi(L[0], L[1]);
      const bas = Math.min(H[0].i, L[0].i), sonI = Math.max(H[1].i, L[1].i);
      const genis0 = ust(bas) - alt(bas), genis1 = ust(sonI) - alt(sonI);
      if (genis0 > 0 && genis1 > 0 && sonI - bas >= 10 && genis0 >= 3 * A) {
        const ref = (H[0].f + L[0].f) / 2, uz = sonI - bas;
        const eU = ((H[1].f - H[0].f) / (H[1].i - H[0].i)) * uz / genis0, eL = ((L[1].f - L[0].f) / (L[1].i - L[0].i)) * uz / genis0;   // slope over the pattern, in pattern heights
        const duz = (e) => Math.abs(e) < 0.15, daral = genis1 < genis0 * 0.8;
        let tur = null;
        if (duz(eU) && eL > 0.2 && daral) tur = "yukselenUcgen";
        else if (duz(eL) && eU < -0.2 && daral) tur = "alcalanUcgen";
        else if (eU < -0.15 && eL > 0.15 && daral) tur = "simetrikUcgen";
        else if (eU > 0.15 && eL > eU + 0.1 && daral) tur = "yukselenTakoz";
        else if (eL < -0.15 && eU < eL - 0.1 && daral) tur = "dusenTakoz";
        else if (Math.abs(eU - eL) < 0.15 && !duz(eU)) tur = "kanal";
        if (tur) o.push({ tur, yon: 0, ust, alt, boy: genis0, bas, son: sonI, noktalar: [...H, ...L].sort((x, y) => x.i - y.i), ref });
      }
    }
  }
  return o;
}

/**
 * Scan candles m = [{t,o,h,l,c,v}] (oldest first). Returns the patterns that broke out, each with its trade:
 * { tur, ad, yon (1 long / -1 short), kirilim (bar), giris, hedef, stop, bas, son, noktalar }.
 * `canli: true` also returns patterns still forming at the last bar (kirilim: null, with the levels to watch).
 */
export function tara(m, { W = 5, canli = false } = {}) {
  const A = atr(m), p = pivotlar(m, W);
  const sonuc = [], gorulen = new Set();
  let kp = 0;   // pivots known so far
  const izle = [];   // candidates waiting for a breakout
  for (let k = 0; k < m.length; k++) {
    let yeni = false;
    while (kp < p.length && p[kp].bilinen <= k) { kp++; yeni = true; }
    if (yeni) for (const a of adaylar(p.slice(0, kp), A[k])) {
      const anahtar = a.tur + ":" + a.son;
      if (!gorulen.has(anahtar)) { gorulen.add(anahtar); izle.push({ ...a, bekle: k + Math.max(10, 2 * (a.son - a.bas)) }); }
    }
    /* breakouts: a close through the level, within the pattern's own length */
    for (let j = izle.length - 1; j >= 0; j--) {
      const a = izle[j];
      if (k > a.bekle) { izle.splice(j, 1); continue; }
      const c = m[k].c;
      let yon = 0, seviye = null;
      if (a.boyun) { const b = a.boyun(k); if ((a.yon < 0 && c < b) || (a.yon > 0 && c > b)) { yon = a.yon; seviye = b; } }
      else { const u = a.ust(k), l = a.alt(k); if (c > u) { yon = 1; seviye = u; } else if (c < l) { yon = -1; seviye = l; } }
      if (!yon) continue;
      izle.splice(j, 1);
      const giris = c;
      const hedef = giris + yon * a.boy;
      const stop = a.boyun ? a.stop : yon > 0 ? Math.min(a.alt(k), ...a.noktalar.filter((x) => x.t === "L").map((x) => x.f)) : Math.max(a.ust(k), ...a.noktalar.filter((x) => x.t === "H").map((x) => x.f));
      if ((stop - giris) * yon >= 0) continue;   // invalid: stop on the wrong side
      sonuc.push({ tur: a.tur, ad: FORMASYON_AD[a.tur], yon, kirilim: k, giris, hedef, stop, seviye, bas: a.bas, son: a.son, noktalar: a.noktalar });
    }
  }
  /* flags: a fast pole (≥ 4 ATR within ≤ 12 bars) then a tight pause (≤ 50% retrace, 3-20 bars), then a break the pole's way */
  for (let k = 20; k < m.length; k++) {
    for (const yon of [1, -1]) {
      for (let durak = 3; durak <= 20; durak++) {
        const pTepe = k - 1 - durak;   // pole end
        if (pTepe < 13) break;
        const uc = yon > 0 ? m[pTepe].h : m[pTepe].l;
        let dipI = pTepe - 1;
        for (let j = pTepe - 1; j >= pTepe - 12; j--) if (yon > 0 ? m[j].l < m[dipI].l : m[j].h > m[dipI].h) dipI = j;
        const kok = yon > 0 ? m[dipI].l : m[dipI].h, boy = Math.abs(uc - kok);
        if (boy < 4 * A[pTepe]) continue;
        let ic = true, ext = yon > 0 ? Infinity : -Infinity, ust = -Infinity;
        for (let j = pTepe + 1; j < k; j++) {
          if (yon > 0) { ext = Math.min(ext, m[j].l); ust = Math.max(ust, m[j].h); if (m[j].l < uc - 0.5 * boy || m[j].h > uc) ic = false; }
          else { ext = Math.max(ext, m[j].h); ust = Math.min(ust === -Infinity ? Infinity : ust, m[j].l); if (m[j].h > uc + 0.5 * boy || m[j].l < uc) ic = false; }
        }
        if (!ic) continue;
        const kir = yon > 0 ? m[k].c > uc : m[k].c < uc;
        if (!kir) continue;
        const anahtar = (yon > 0 ? "bogaBayrak" : "ayiBayrak") + ":" + pTepe;
        if (gorulen.has(anahtar)) continue;
        gorulen.add(anahtar);
        const giris = m[k].c;
        sonuc.push({ tur: yon > 0 ? "bogaBayrak" : "ayiBayrak", ad: FORMASYON_AD[yon > 0 ? "bogaBayrak" : "ayiBayrak"], yon, kirilim: k, giris, hedef: giris + yon * boy, stop: ext, seviye: uc, bas: dipI, son: k - 1, noktalar: [] });
        break;
      }
    }
  }
  sonuc.sort((a, b) => a.kirilim - b.kirilim);
  if (canli) for (const a of izle) sonuc.push({ tur: a.tur, ad: FORMASYON_AD[a.tur], yon: a.yon, kirilim: null, bas: a.bas, son: a.son, noktalar: a.noktalar, seviyeler: a.boyun ? { boyun: a.boyun(m.length - 1) } : { ust: a.ust(m.length - 1), alt: a.alt(m.length - 1) }, boy: a.boy });
  return sonuc;
}

/** What happened after a breakout: target first, stop first, or neither within `en` bars. R = result / stop distance. */
export function sonucu(m, f, en) {
  const risk = Math.abs(f.giris - f.stop), odul = Math.abs(f.hedef - f.giris);
  for (let k = f.kirilim + 1; k < Math.min(m.length, f.kirilim + 1 + en); k++) {
    const vurStop = f.yon > 0 ? m[k].l <= f.stop : m[k].h >= f.stop;
    const vurHedef = f.yon > 0 ? m[k].h >= f.hedef : m[k].l <= f.hedef;
    if (vurStop) return { s: "stop", R: -1, bar: k - f.kirilim };   // both in one bar: counted as the stop (cautious)
    if (vurHedef) return { s: "hedef", R: odul / risk, bar: k - f.kirilim };
  }
  const son = Math.min(m.length - 1, f.kirilim + en);
  if (son <= f.kirilim) return null;
  return { s: "sure", R: ((m[son].c - f.giris) * f.yon) / risk, bar: son - f.kirilim };
}
