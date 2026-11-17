/* ===========================================================================
 * gorunum/spot-zaman.js — Time Machine 1 & 2 for SPOT tokens (Trade page, under the chart)
 *
 * 17 Nov 2026 (owner: "Hyper'deki gibi iki Time Machine … kur"). The same engine as perps (tm-motor.js), fed in this
 * browser from the token's own hourly candles (GeckoTerminal, one call):
 *   Time Machine 1  10,000 futures: forecast volatility (EWMA blended with the last 24 h), fat-tailed shocks drawn in
 *                   blocks — from the token's own past when it has 5+ days, else POOLED from Hot tokens of the same age
 *                   class (veri/spot-tm-havuz.json, scripts/spot-tm-havuz.js). No view on direction.
 *   Time Machine 2  replays what followed past hours whose 1 h chart matched now (RSI, trend, Bollinger, volume, MACD),
 *                   the token's own past or the pooled one; direction comes from those past moves.
 *   Both add a CRASH outcome: the pooled share of hours followed by an 80% fall within 24 h (rugs, dumps) — the one
 *   thing a perps market does not have.
 * Plan: buy now at the live price; stop = 1.5 x the median hourly range of the last 24 h (Tight / Normal / Wide),
 * take profit 2R — the same rule the backtest (scripts/spot-test.js) used. Runs in the browser; nothing is sent.
 * =========================================================================== */
import { el } from "../ui.js";
import { simule } from "../tm-motor.js";
import { hepsi, GEVSET, GEVSET_AD, durumYazi } from "../gosterge.js";

const GECKO = "https://api.geckoterminal.com/api/v2";
const GECKO_AG = { arc: "arc", elysium: "elysium", solana: "solana", base: "base", bsc: "bsc", ethereum: "eth", arbitrum: "arbitrum", avalanche: "avax", monad: "monad", hyperevm: "hyperevm", robinhood: "robinhood" };
const STIL =
  ".stm{display:grid;gap:8px;padding:12px 14px;min-width:0}.stm>*{min-width:0}.stm__bas{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.stm__bas b{font-size:15px}" +
  ".stm__sec{display:flex;gap:6px;flex-wrap:wrap}.stm__sec button{height:30px;padding:0 10px;border-radius:999px;border:1px solid var(--cizgi-guclu);background:none;color:var(--yazi-2);font:600 12.5px var(--yazi-tipi);cursor:pointer}" +
  ".stm__sec button[aria-pressed=true]{border-color:var(--marka);color:var(--yazi-1);background:rgba(124,92,255,.14)}" +
  ".stm__tuval{position:relative;height:200px;border-radius:10px;background:#0b1020;overflow:hidden}.stm__tuval canvas{width:100%;height:100%;display:block}" +
  ".stm__sonuc{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.stm__sonuc div{border:1px solid var(--cizgi);border-radius:10px;padding:6px 4px;text-align:center}" +
  ".stm__sonuc b{display:block;font-size:18px;font-variant-numeric:tabular-nums}.stm__sonuc small{font-size:11px;color:var(--yazi-3);line-height:1.2;display:block}" +
  ".stm__m{font-size:12.5px;line-height:1.45}.stm__n{font-size:11.5px;color:var(--yazi-3);line-height:1.45}.stm__u{color:#e0a100}";
const medyan = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
let _havuz = null;
const havuzOku = () => (_havuz = _havuz || fetch(new URL("../../veri/spot-tm-havuz.json", import.meta.url).href + "?t=" + Math.floor(Date.now() / 3600e3)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
const _mum = new Map();
function mumlar(t) {
  const k = t.z + ":" + t.havuz, x = _mum.get(k);
  if (x && Date.now() - x.t < 300000) return x.p;
  const p = fetch(GECKO + "/networks/" + GECKO_AG[t.z] + "/pools/" + t.havuz + "/ohlcv/hour?aggregate=1&limit=1000&currency=usd", { headers: { accept: "application/json" } })
    .then((r) => r.json()).then((j) => (j.data.attributes.ohlcv_list || []).map((y) => [y[0] * 1000, +y[1], +y[2], +y[3], +y[4], +y[5]]).sort((a, b) => a[0] - b[0])).catch(() => null);
  _mum.set(k, { t: Date.now(), p });
  return p;
}

/** Everything the engine needs, from the token's candles and the pool. */
export function spotGirdi(m, H) {
  const r = [], z = [], durumOwn = [];
  let v = null;
  const ind = m.length >= 51 ? hepsi({ c: m.map((x) => x[4]), h: m.map((x) => x[2]), l: m.map((x) => x[3]), v: m.map((x) => x[5]) }) : null;
  for (let i = 1; i < m.length; i++) {
    if (!(m[i - 1][4] > 0 && m[i][4] > 0)) continue;
    const q = Math.log(m[i][4] / m[i - 1][4]); r.push(q);
    if (v == null) { v = q * q || 1e-4; continue; }
    z.push(Math.max(-12, Math.min(12, q / Math.sqrt(v)))); durumOwn.push(ind && ind.durum[i] ? ind.durum[i] : "");
    v = 0.94 * v + 0.06 * q * q;
  }
  const son24 = r.slice(-24), rv24 = son24.length ? Math.sqrt(son24.reduce((a, b) => a + b * b, 0) / son24.length) : null;
  const sinifAd = m.length < 72 ? "genc" : "eski", S = H && H.sinif && H.sinif[sinifAd];
  /* hourly volatility forecast: the token's own EWMA blended with its last 24 h; a very young token leans on the pool */
  let sigma = v != null && rv24 != null ? Math.sqrt(0.5 * v + 0.5 * rv24 * rv24) : (S && S.sigmaMedyan) || 0.05;
  if (r.length < 12 && S && S.sigmaMedyan) sigma = Math.sqrt(0.5 * sigma * sigma + 0.5 * S.sigmaMedyan * S.sigmaMedyan);
  const kendi = z.length >= 120;   // 5 days of its own shocks
  const ort = kendi ? z.reduce((a, b) => a + b, 0) / z.length : 0;
  const artik = kendi ? z.map((x) => x - ort) : S ? S.artik : null;
  const durum = kendi ? durumOwn : S ? S.durum : null;
  return { sigma, artik, durum, zOrt: kendi ? ort : S ? S.zOrt : 0, simdiDurum: ind ? ind.durum[ind.durum.length - 1] : null, kaynak: kendi ? "own" : "pool", sinif: sinifAd, cokus24: S ? S.cokus24 : null, saat: m.length,
    stop: Math.min(0.25, Math.max(0.06, 1.5 * medyan(m.slice(-24).map((x) => (x[2] - x[3]) / (x[1] || x[4]))))) };
}
/** Time Machine 2's analog starts: past hours whose state matches now, loosening the match until there are enough. */
export function spotAnalog(D, saat, enAz = 20) {
  if (!D.simdiDurum || !D.durum) return null;
  for (let s2 = 0; s2 < GEVSET.length; s2++) {
    const hedef = GEVSET[s2](D.simdiDurum), l = [];
    for (let k = 0; k < D.durum.length - 1; k++) if (D.durum[k] && GEVSET[s2](D.durum[k]) === hedef && k + saat < D.artik.length) l.push(k);
    if (l.length >= enAz || s2 === GEVSET.length - 1) return l.length ? { baslar: l, ekle: D.zOrt || 0, seviye: s2 } : null;
  }
  return null;
}

/** The panel. `t` is the market row of the Trade page ({ z, havuz, fiyat, sembol }); `fiyat` formats a price. */
export function spotZamanMakinesi({ t, fiyat }) {
  if (!document.getElementById("stm-stil")) document.head.append(el("style", { attr: { id: "stm-stil" }, yazi: STIL }));
  let ufuk = 24, mod = 1, gen = 1;
  const tuval = el("canvas", { attr: { role: "img", "aria-label": "Simulated price paths" } });
  const sonuc = el("div", { sinif: "stm__sonuc" }), metin = el("div", { attr: { style: "display:grid;gap:6px" } }), aciklama = el("div", { sinif: "stm__n" });
  const modK = el("div", { sinif: "stm__sec" }), ufukK = el("div", { sinif: "stm__sec" }), genK = el("div", { sinif: "stm__sec" });
  const calistir = el("button", { sinif: "dugme dugme--marka dugme--tam", attr: { type: "button" }, yazi: "🔮 Run the Time Machine (10,000 futures)" });
  const kutu = el("div", { sinif: "bx-kart stm", attr: { style: "margin-top:12px" } }, [
    el("div", { sinif: "stm__bas" }, [el("b", { yazi: "🔮 Time Machine 1 & 2" }), ufukK]), modK, aciklama,
    el("div", { attr: { style: "display:flex;align-items:center;gap:8px;flex-wrap:wrap" } }, [el("span", { sinif: "stm__n", yazi: "Plan: buy now, take profit at 2× the stop. Stop:" }), genK]),
    calistir, el("div", { sinif: "stm__tuval", attr: { hidden: true } }, [tuval]), sonuc, metin]);
  const ACIK = {
    1: "Time Machine 1 · forward model: 10,000 possible futures from this token's forecast volatility and fat-tailed moves (its own past, or similar tokens' when it is young). No view on direction.",
    2: "Time Machine 2 · chart setups: finds past hours whose 1 h chart looked like now (RSI, trend, Bollinger, volume, MACD) and replays what really followed, 10,000 times. Direction comes from those past moves.",
  };
  const ciz2 = () => {
    modK.replaceChildren(...[[1, "Time Machine 1 · Forward model"], [2, "Time Machine 2 · Chart setups 📈"]].map(([k, ad]) => el("button", { attr: { type: "button", "aria-pressed": String(mod === k) }, yazi: ad, on: { click: () => { mod = k; ciz2(); } } })));
    ufukK.replaceChildren(...[4, 24].map((h) => el("button", { attr: { type: "button", "aria-pressed": String(ufuk === h) }, yazi: h + "h", on: { click: () => { ufuk = h; ciz2(); } } })));
    genK.replaceChildren(...[[0.67, "Tight"], [1, "Normal"], [1.5, "Wide"]].map(([k, ad]) => el("button", { attr: { type: "button", "aria-pressed": String(gen === k) }, yazi: ad, on: { click: () => { gen = k; ciz2(); } } })));
    aciklama.textContent = ACIK[mod];
  };
  ciz2();
  let anim = 0;
  function ciz(r, ilerleme) {
    const k = tuval.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    tuval.width = Math.max(1, Math.round(k.width * dpr)); tuval.height = Math.max(1, Math.round(k.height * dpr));
    const c = tuval.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = k.width, h = k.height;
    let lo = Math.min(r.xSl, 0), hi = Math.max(r.xTp, 0);
    for (const y of r.yollar) for (const v of y.y) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const pad = (hi - lo) * 0.06 || 0.01; lo -= pad; hi += pad;
    const Y = (v) => 10 + (1 - (v - lo) / (hi - lo)) * (h - 22), X = (q) => 8 + (q / ufuk) * (w - 16);
    const css = getComputedStyle(document.documentElement), yesil = css.getPropertyValue("--alis").trim() || "#2bd38b", kirmizi = css.getPropertyValue("--satis").trim() || "#ff6b5a";
    c.lineWidth = 1;
    for (let i = 0; i < Math.floor(r.yollar.length * ilerleme); i++) {
      const y = r.yollar[i]; c.strokeStyle = y.s === "tp" ? yesil : y.s === "sl" ? kirmizi : "#8b93b5"; c.globalAlpha = y.s === "-" ? 0.35 : 0.5;
      c.beginPath(); for (let q = 0; q < y.y.length; q++) { const px = X(q), py = Y(y.y[q]); if (q) c.lineTo(px, py); else c.moveTo(px, py); } c.stroke();
    }
    c.globalAlpha = 1; c.setLineDash([6, 5]); c.lineWidth = 1.5;
    for (const [v, renk] of [[r.xTp, yesil], [r.xSl, kirmizi]]) { c.strokeStyle = renk; c.beginPath(); c.moveTo(0, Y(v)); c.lineTo(w, Y(v)); c.stroke(); }
    c.setLineDash([]);
  }
  calistir.addEventListener("click", async () => {
    calistir.disabled = true; calistir.textContent = "Reading this token's hourly history…";
    const [m, H] = await Promise.all([mumlar(t), havuzOku()]);
    const bitir = (yazi) => { calistir.disabled = false; calistir.textContent = "🔮 Run the Time Machine (10,000 futures)"; if (yazi) metin.replaceChildren(el("div", { sinif: "stm__m stm__u", yazi })); };
    if (!m) return bitir("This token's price history could not be read right now (the free data service may be busy). Try again in a minute.");
    if (m.length < 6) return bitir("This token's pool has too little hourly history yet (needs 6 hours).");
    const D = spotGirdi(m, H);
    if (!D.artik) return bitir("The pooled inputs could not be loaded. Try again in a minute.");
    const giris = Number(t.fiyat) > 0 ? Number(t.fiyat) : m[m.length - 1][4];
    const stop = Math.min(0.4, D.stop * gen), sl = giris * (1 - stop), tp = giris * (1 + 2 * stop);
    const an = spotAnalog(D, ufuk);
    if (mod === 2 && !an) return bitir("Time Machine 2 needs a readable 1 h chart: this token has " + D.saat + " hours (needs 51). Use Time Machine 1.");
    calistir.textContent = "Simulating 10,000 futures…"; await new Promise((x) => setTimeout(x, 30));
    const temel = { giris, tp, sl, saat: ufuk, sigma: D.sigma, artik: D.artik };
    const bir = simule({ ...temel, n: mod === 1 ? 10000 : 5000, ornek: mod === 1 ? 180 : 0 });
    const iki = an ? simule({ ...temel, analog: an, n: mod === 2 ? 10000 : 5000, ornek: mod === 2 ? 180 : 0 }) : null;
    const tam = mod === 2 ? iki : bir, diger = mod === 2 ? bir : iki;
    const serbest = simule({ ...temel, tp: null, sl: null, analog: mod === 2 ? an : null, n: 5000, ornek: 0 });
    /* the crash outcome: the pooled 24 h rate, scaled to the horizon; the rest share the model's odds */
    const pC = D.cokus24 != null ? Math.min(0.9, 1 - Math.pow(1 - D.cokus24, ufuk / 24)) : 0;
    const yz = (x) => Math.round((x / tam.n) * (1 - pC) * 100);
    bitir(); calistir.textContent = "🔮 Run again";
    kutu.querySelector(".stm__tuval").hidden = false;
    cancelAnimationFrame(anim); const bas = performance.now();
    const kare = (q) => { const i = Math.min(1, (q - bas) / 1200); ciz(tam, i); if (i < 1) anim = requestAnimationFrame(kare); };
    anim = requestAnimationFrame(kare);
    sonuc.replaceChildren(
      el("div", {}, [el("b", { sinif: "bx-art", yazi: String(yz(tam.tp)) }), el("small", { yazi: "of 100 hit take profit first" })]),
      el("div", {}, [el("b", { sinif: "bx-eks", yazi: String(yz(tam.sl)) }), el("small", { yazi: "of 100 hit the stop first" })]),
      el("div", {}, [el("b", { yazi: String(yz(tam.hic)) }), el("small", { yazi: "of 100 neither in " + ufuk + "h" })]),
      el("div", {}, [el("b", { attr: { style: "color:#e0a100" }, yazi: pC > 0 && pC < 0.005 ? "<1" : String(Math.round(pC * 100)) }), el("small", { yazi: "of 100 crash (−80%)" })]));
    const uc = (r) => Math.round((r.tp / r.n) * 100) + " / " + Math.round((r.sl / r.n) * 100) + " / " + Math.round((r.hic / r.n) * 100);
    const satir = [];
    satir.push(el("div", { sinif: "stm__m", yazi: "Plan: buy at " + fiyat(giris) + ", stop " + fiyat(sl) + " (−" + (stop * 100).toFixed(1) + "%), take profit " + fiyat(tp) + " (+" + (2 * stop * 100).toFixed(1) + "%)." }));
    if (mod === 2 && an) {
      const y = durumYazi(D.simdiDurum) || {};
      satir.push(el("div", { sinif: "stm__m", yazi: "Chart now (1 h): " + [y.T, y.R, y.B, y.V, y.M].filter(Boolean).join(", ") + "." }));
      satir.push(el("div", { sinif: "stm__m", yazi: "Matched on " + GEVSET_AD[an.seviye] + ": " + an.baslar.length + " past hours " + (D.kaynak === "own" ? "of " + (t.sembol || "this token") : "of Hot tokens of the same age (" + (D.sinif === "genc" ? "under 3 days" : "3 days or older") + ")") + "." }));
    }
    if (diger) satir.push(el("div", { sinif: "stm__m", yazi: (mod === 2 ? "Time Machine 1" : "Time Machine 2") + " gives the same plan " + uc(diger) + " (TP first / stop first / neither, before the crash share)." }));
    satir.push(el("div", { sinif: "stm__m", yazi: "Where the price ends after " + ufuk + "h if nothing closes the trade (middle 90% of futures): " + fiyat(serbest.aralik.p05) + " – " + fiyat(serbest.aralik.p95) + "." }));
    satir.push(el("div", { sinif: "stm__m", yazi: "Volatility forecast: " + (D.sigma * 100).toFixed(1) + "% an hour. Moves drawn from " + (D.kaynak === "own" ? "this token's own " + D.saat + " hours" : "Hot tokens of the same age (this one has " + D.saat + " hours of its own)") + "." }));
    satir.push(el("div", { sinif: "stm__n", yazi: "Crash share: from tokens still listed only — tokens that already died are missing, so the real risk is higher. These odds assume you hold for up to " + ufuk + " h." }));
    satir.push(el("div", { sinif: "stm__n", yazi: "Odds from a model, not a forecast and not advice. Memecoins can go to zero in minutes. Runs in your browser; nothing is sent." }));
    metin.replaceChildren(...satir);
  });
  return { kutu };
}
