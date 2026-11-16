/* ===========================================================================
 * gorunum/hl-zaman.js — Time Machine panel (inside Aim assist, #/perps/trade)
 *
 * 15 Nov 2026 (owner approved). Runs 10,000 possible futures of the market for the plan Aim assist
 * worked out (entry, stop loss, take profit) with docs/js/tm-motor.js, and shows how many reach the
 * take profit first, the stop loss first, or neither within the chosen horizon. Inputs are prepared
 * hourly by scripts/tm-veri.js (forecast volatility: HAR-RV + options-implied; hour-of-day pattern;
 * US events; liquidation ladders from public Hyperliquid positions). Everything runs in this browser;
 * the plan never leaves it. The model's public track record: veri/tm-skor.json (scripts/tm-kayit.js).
 * Odds of a model, never a promise: the wording says so every time.
 * =========================================================================== */

import { el } from "../ui.js";
import { simule, girdiHazirla, girdiHazirla2 } from "../tm-motor.js";
import { GEVSET, GEVSET_AD, durumYazi } from "../gosterge.js";

const STIL =
  ".tm{display:grid;gap:8px;border-top:1px solid var(--cizgi);padding-top:8px}" +
  ".tm__bas{display:flex;justify-content:space-between;align-items:center;gap:8px}.tm__bas b{font-size:13.5px}" +
  ".tm__ufuk{display:flex;gap:4px}.tm__ufuk button[aria-pressed=true]{border-color:var(--marka);color:var(--yazi-1);background:var(--marka-zemin,rgba(124,92,255,.12))}" +
  ".tm__tuval{position:relative;height:210px;border-radius:10px;background:#0b1020;overflow:hidden}.tm__tuval canvas{width:100%;height:100%;display:block}" +
  ".tm__sayac{position:absolute;left:10px;top:8px;color:#fff;font-weight:800;font-size:22px;font-variant-numeric:tabular-nums;text-shadow:0 1px 6px #000}.tm__sayac small{font-size:12px;font-weight:600;opacity:.8;margin-left:4px}" +
  ".tm__sonuc{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tm__sonuc div{border:1px solid var(--cizgi);border-radius:10px;padding:6px 8px;text-align:center}" +
  ".tm__sonuc b{display:block;font-size:18px;font-variant-numeric:tabular-nums}.tm__sonuc small{font-size:11.5px;color:var(--yazi-3)}" +
  ".tm__m{font-size:12.5px;line-height:1.45}.tm__n{font-size:11.5px;color:var(--yazi-3);line-height:1.4}.tm__u{color:#e0a100}";

const _dosya = new Map();
function oku(ad) {
  const x = _dosya.get(ad);
  if (x && Date.now() - x.t < 600000) return x.p;
  const p = fetch(new URL("../../veri/" + ad, import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  _dosya.set(ad, { t: Date.now(), p });
  return p;
}

/** `plan()` returns { coin, giris, tp, sl, alis } or null; `fiyat` formats a price. */
export function zamanMakinesi({ plan, fiyat }) {
  if (!document.getElementById("tm-stil")) document.head.append(el("style", { attr: { id: "tm-stil" }, yazi: STIL }));
  let ufuk = 24, mod = 1;   // 1: forward model (no direction) · 2: chart setups (replays what followed similar charts)
  const tuval = el("canvas", { attr: { role: "img", "aria-label": "Simulated price paths" } });
  const sayac = el("div", { sinif: "tm__sayac" });
  const sonuc = el("div", { sinif: "tm__sonuc" });
  const metin = el("div", { sinif: "yigin yigin--sik" });
  const ufukK = el("div", { sinif: "tm__ufuk" });
  const modK = el("div", { sinif: "tm__ufuk", attr: { style: "display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;min-width:0" } });
  const aciklama = el("div", { sinif: "tm__n" });
  const calistir = el("button", { sinif: "dugme dugme--marka dugme--tam", attr: { type: "button" }, yazi: "🔮 Run the Time Machine (10,000 futures)" });
  const kutu = el("div", { sinif: "tm" }, [
    el("div", { sinif: "tm__bas" }, [el("b", { yazi: "🔮 Time Machine 1 & 2" }), ufukK]),
    modK, aciklama,
    calistir,
    el("div", { sinif: "tm__tuval", attr: { hidden: true } }, [tuval, sayac]),
    sonuc, metin,
  ]);
  const ufukCiz = () => ufukK.replaceChildren(...[4, 24, 72].map((h) => el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", "aria-pressed": String(h === ufuk) }, yazi: h + "h", on: { click: () => { ufuk = h; ufukCiz(); } } })));
  ufukCiz();
  const ACIK = {
    1: "Time Machine 1 · forward model: 10,000 possible futures from this market's forecast volatility, options pricing, scheduled events and liquidation levels. It takes no view on direction.",
    2: "Time Machine 2 · chart setups: finds the past hours of this market whose 1 h chart looked like now (RSI, trend, Bollinger, volume, MACD) and replays what really followed, scaled to today's volatility, 10,000 times. Direction comes from those past moves.",
  };
  const modCiz = () => { modK.replaceChildren(...[[1, "Time Machine 1 · Forward model"], [2, "Time Machine 2 · Chart setups 📈"]].map(([k, ad]) => el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", "aria-pressed": String(mod === k), style: "flex:1 1 140px;min-width:0;white-space:normal" }, yazi: ad, on: { click: () => { mod = k; modCiz(); } } }))); aciklama.textContent = ACIK[mod]; };
  modCiz();

  let anim = 0;
  function ciz(r, giris, tp, sl, ilerleme) {
    const k = tuval.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    tuval.width = Math.max(1, Math.round(k.width * dpr)); tuval.height = Math.max(1, Math.round(k.height * dpr));
    const c = tuval.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = k.width, h = k.height, ust = 26, alt = 14;
    const xs = [r.xTp, r.xSl].filter((x) => x != null);
    let lo = Math.min(...xs, 0), hi = Math.max(...xs, 0);
    for (const y of r.yollar) for (const v of y.y) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const pad = (hi - lo) * 0.06 || 0.01; lo -= pad; hi += pad;
    const Y = (v) => ust + (1 - (v - lo) / (hi - lo)) * (h - ust - alt);
    const X = (t) => 8 + (t / ufuk) * (w - 16);
    const css = getComputedStyle(document.documentElement);
    const yesil = css.getPropertyValue("--alis").trim() || "#2bd38b", kirmizi = css.getPropertyValue("--satis").trim() || "#ff6b5a";
    c.lineWidth = 1;
    const adet = Math.floor(r.yollar.length * ilerleme);
    for (let i = 0; i < adet; i++) {
      const y = r.yollar[i];
      c.strokeStyle = y.s === "tp" ? yesil : y.s === "sl" ? kirmizi : "#8b93b5";
      c.globalAlpha = y.s === "-" ? 0.35 : 0.5;
      c.beginPath();
      for (let t = 0; t < y.y.length; t++) { const px = X(t), py = Y(y.y[t]); if (t) c.lineTo(px, py); else c.moveTo(px, py); }
      c.stroke();
    }
    c.globalAlpha = 1; c.setLineDash([6, 5]); c.lineWidth = 1.5; c.font = "600 11px system-ui,sans-serif";
    const cizgi = (v, renk, ad) => { if (v == null) return; c.strokeStyle = renk; c.beginPath(); c.moveTo(0, Y(v)); c.lineTo(w, Y(v)); c.stroke(); c.fillStyle = renk; c.fillText(ad, w - 110, Y(v) + (v > 0 ? -4 : 12)); };
    cizgi(r.xTp, yesil, "TAKE PROFIT " + fiyat(tp)); cizgi(r.xSl, kirmizi, "STOP " + fiyat(sl));
    c.setLineDash([]);
  }

  calistir.addEventListener("click", async () => {
    const pl = plan();
    if (!pl) { metin.replaceChildren(el("div", { sinif: "tm__m tm__u", yazi: "Set up a plan in Aim assist first (amount, stop distance, take profit)." })); return; }
    calistir.disabled = true; calistir.textContent = "Loading this market's forward inputs…";
    const [D, I, S] = await Promise.all([oku("tm/" + pl.coin + ".json"), oku("tm/index.json"), oku("tm-skor.json")]);
    if (!D || !D.artik) { calistir.disabled = false; calistir.textContent = "🔮 Run the Time Machine (10,000 futures)"; metin.replaceChildren(el("div", { sinif: "tm__m tm__u", yazi: "The Time Machine covers markets with at least $1M daily volume; " + pl.coin + " has no forward inputs yet." })); return; }
    calistir.textContent = "Simulating 10,000 futures…";
    await new Promise((r) => setTimeout(r, 30));
    /* the long and short cases are mirror images: for a short, TP is below and SL above */
    const sec = { giris: pl.giris, tp: pl.tp, sl: pl.sl, saat: ufuk, n: 10000, ornek: 180 };
    const g2 = girdiHazirla2(D, I, sec, GEVSET);
    if (mod === 2 && !g2) { calistir.disabled = false; calistir.textContent = "🔮 Run the Time Machine (10,000 futures)"; metin.replaceChildren(el("div", { sinif: "tm__m tm__u", yazi: "Time Machine 2 needs this market's chart history; it is not ready yet for " + pl.coin + ". Use Time Machine 1." })); return; }
    const bir = simule(girdiHazirla(D, I, mod === 1 ? sec : { ...sec, n: 5000, ornek: 0 }));
    const iki = g2 ? simule(mod === 2 ? g2 : { ...g2, n: 5000, ornek: 0 }) : null;
    const tam = mod === 2 ? iki : bir, diger = mod === 2 ? bir : iki;
    const sade = simule(girdiHazirla(D, I, { giris: pl.giris, tp: pl.tp, sl: pl.sl, saat: ufuk, n: 10000, ornek: 0, katman: { iv: false, mevsim: false, olay: false, likit: false } }));
    /* where the price could be after the horizon, ignoring the plan (no TP / SL stopping the paths) */
    const serbest = mod === 2 && g2 ? simule({ ...g2, tp: null, sl: null, n: 5000, ornek: 0 }) : simule(girdiHazirla(D, I, { giris: pl.giris, tp: null, sl: null, saat: ufuk, n: 5000, ornek: 0 }));
    calistir.disabled = false; calistir.textContent = "🔮 Run again";
    kutu.querySelector(".tm__tuval").hidden = false;
    /* draw the paths in over ~1.2 s while the counter runs up */
    cancelAnimationFrame(anim);
    const bas = performance.now();
    const kare = (z) => {
      const i = Math.min(1, (z - bas) / 1200);
      ciz(tam, pl.giris, pl.tp, pl.sl, i);
      sayac.replaceChildren(Math.round(i * 10000).toLocaleString("en-US"), el("small", { yazi: "futures · " + ufuk + "h" }));
      if (i < 1) anim = requestAnimationFrame(kare);
    };
    anim = requestAnimationFrame(kare);
    const yz = (x) => Math.round((x / tam.n) * 100);
    sonuc.replaceChildren(
      el("div", {}, [el("b", { sinif: "hl-art", yazi: yz(tam.tp) + "" }), el("small", { yazi: "of 100 hit take profit first" })]),
      el("div", {}, [el("b", { sinif: "hl-eks", yazi: yz(tam.sl) + "" }), el("small", { yazi: "of 100 hit the stop first" })]),
      el("div", {}, [el("b", { yazi: yz(tam.hic) + "" }), el("small", { yazi: "of 100 neither in " + ufuk + "h" })]));
    /* what went in */
    const yil = (s) => Math.round(s * Math.sqrt(8760) * 100) + "%";
    const katlar = [];
    katlar.push("Volatility forecast for the coming hours: " + yil(D.sigma) + " a year (realised-vol forecast " + yil(D.parca.har) + (D.parca.iv ? ", options-implied " + yil(D.parca.iv) + " via " + D.parca.ivKaynak : "") + ").");
    const olay = (I && I.olaylar || []).filter((o) => { const z = Date.parse(o.t); return z > Date.now() - 3600e3 && z < Date.now() + ufuk * 3600e3; });
    if (olay.length) katlar.push("Scheduled inside the horizon: " + olay.slice(0, 3).map((o) => "US " + o.ad).join(", ") + " (volatility raised around each).");
    if (D.likit) {
      const top = (a) => (a || []).reduce((s, l) => s + l[1], 0);
      katlar.push("Liquidation levels of large public positions within ±30%: longs $" + Math.round(top(D.likit.uzun) / 1e6) + "M below, shorts $" + Math.round(top(D.likit.kisa) / 1e6) + "M above; when a future runs through them, forced orders push it further" + (tam.kademe ? " (" + tam.kademe.toLocaleString("en-US") + " such pushes across the 10,000 runs)." : "."));
    }
    if (D.bayrak === "thin") katlar.push("⚠ Thin market: open interest is large next to the order book. Real moves can be far wilder than any model.");
    const fark = Math.round(((tam.tp - sade.tp) / tam.n) * 100);
    const uc = (r) => Math.round((r.tp / r.n) * 100) + " / " + Math.round((r.sl / r.n) * 100) + " / " + Math.round((r.hic / r.n) * 100);
    const iki2 = [];
    if (mod === 2 && g2) {
      const y = durumYazi(D.simdiDurum) || {};
      /* moments next to each other are one episode: count starts at least 6 h apart */
      let olay = 0, onceki = -1e9; for (const k of g2.eslesme ? g2.analog.baslar : []) { if (k - onceki >= 6) olay++; onceki = k; }
      iki2.push(el("div", { sinif: "tm__m", yazi: "Chart now (1 h): " + [y.T, y.R, y.B, y.V, y.M].filter(Boolean).join(", ") + "." }));
      iki2.push(el("div", { sinif: "tm__m", yazi: "Matched on " + GEVSET_AD[g2.eslesme.seviye] + ": " + g2.eslesme.n + " past hours of " + pl.coin + " in the last 60 days (about " + olay + " separate episodes). Every future replays what followed one of them." }));
      if (olay < 8) iki2.push(el("div", { sinif: "tm__m tm__u", yazi: "Few separate episodes: treat this as a handful of past stories, not as odds." }));
      iki2.push(el("div", { sinif: "tm__n", yazi: "Those 60 days were one kind of market (mostly falling). Past chart setups do not have to repeat." }));
    }
    metin.replaceChildren(...[
      /* replaceChildren would print a null as the text "null" */ ...iki2,
      diger ? el("div", { sinif: "tm__m", yazi: (mod === 2 ? "Time Machine 1 (forward model, no direction)" : "Time Machine 2 (chart setups)") + " gives the same plan " + uc(diger) + " (TP first / stop first / neither)." }) : null,
      el("div", { sinif: "tm__m", yazi: "Where the price ends after " + ufuk + "h if nothing closes the trade (middle 90% of futures): " + fiyat(serbest.aralik.p05) + " – " + fiyat(serbest.aralik.p95) + " (half of them between " + fiyat(serbest.aralik.p25) + " and " + fiyat(serbest.aralik.p75) + ")." }),
      ...katlar.map((k) => el("div", { sinif: "tm__m", yazi: k })),
      mod === 2 ? null : el("div", { sinif: "tm__n", yazi: "Without the forward-looking layers (past volatility only) the same plan gives " + Math.round((sade.tp / sade.n) * 100) + " / " + Math.round((sade.sl / sade.n) * 100) + " / " + Math.round((sade.hic / sade.n) * 100) + (fark ? " — the forward inputs move take-profit-first by " + (fark > 0 ? "+" : "") + fark + "." : ".") }),
      el("div", { sinif: "tm__n", yazi: trackRecord(S) }),
      el("div", { sinif: "tm__n", yazi: (mod === 2 ? "Replays of past moves after similar charts, not a forecast and not advice." : "Odds from a model of possible futures, not a forecast of the price and not advice. The model has no view on direction.") + " News it cannot see can change everything. Runs in your browser; your plan is not sent anywhere." })].filter(Boolean));
  });
  return { kutu };
}

function trackRecord(S) {
  const k = S && S.kurulum && S.kurulum["1:1"];
  if (!S || !k || !k.n) return "Track record: the model writes down fixed predictions every 4 hours before the outcome is known and scores them after 24 h (veri/tm-skor.json). Scores appear once the first predictions are resolved.";
  return "Track record so far (" + S.sonuclanan + " resolved fixed predictions): Brier score " + k.brierModel + " vs " + k.brierTaban + " for past-volatility-only (lower is better)" + (k.beceri > 0 ? ", " + Math.round(k.beceri * 100) + "% better." : ", not better yet.");
}
