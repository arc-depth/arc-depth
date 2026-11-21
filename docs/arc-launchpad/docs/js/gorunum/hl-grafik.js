/* ===========================================================================
 * gorunum/hl-grafik.js — the trade page chart (candles + indicators) and its Chart read panel
 *
 * 16 Nov 2026 (owner approved: "grafik ve indikatör analizleri"). TradingView's open-source
 * Lightweight Charts (Apache-2.0, our own copy in vendor/, loaded only on this page).
 *   chart        candles (15m / 1h / 4h / 1d), EMA 20 / 50 / 200, Bollinger (20, 2), 24 h VWAP, volume;
 *                RSI(14) and MACD(12, 26, 9) panes; nearest support / resistance (swing lows / highs);
 *                large liquidation clusters of public positions (veri/tm/<coin>.json); the Aim assist plan
 *                (entry, stop, target) when there is one ("hl-plan" event)
 *   Chart read   the 1 h chart state in words (gosterge.js) and what followed the same state across all
 *                markets in the last 60 days (veri/tm/index.json durum): history, never a call
 * =========================================================================== */

import { el } from "../ui.js";
import * as G from "../gosterge.js";

const STIL =
  ".gk{position:relative;height:430px}.gk__bos{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--yazi-3);font-size:13px}" +
  ".gk__ust{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.gk__ust button[aria-pressed=true]{border-color:var(--marka);color:var(--yazi-1);background:var(--marka-zemin,rgba(124,92,255,.12))}" +
  ".gk__acik{display:flex;flex-wrap:wrap;gap:10px;font-size:11.5px;color:var(--yazi-3)}.gk__acik i{display:inline-block;width:14px;height:3px;border-radius:2px;vertical-align:middle;margin-right:4px}" +
  ".go{border:1px solid var(--cizgi);border-radius:12px;padding:10px 12px;display:grid;gap:6px;font-size:13px;background:var(--yuzey-1)}" +
  ".go__bas{display:flex;justify-content:space-between;gap:8px;font-weight:700}.go__bas small{font-weight:500;color:var(--yazi-3)}" +
  ".go__g{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:6px}.go__g div{border:1px solid var(--cizgi);border-radius:10px;padding:6px 8px}" +
  ".go__g small{display:block;font-size:11px;color:var(--yazi-3)}.go__g b{font-size:13px}" +
  ".go__m{line-height:1.45}.go__n{font-size:11.5px;color:var(--yazi-3);line-height:1.4}" +
  "@media (max-width:640px){.gk{height:380px}}";

const ARALIK = [{ ad: "15m", i: "15m", ms: 2 * 864e5 }, { ad: "1h", i: "1h", ms: 10 * 864e5 }, { ad: "4h", i: "4h", ms: 45 * 864e5 }, { ad: "1d", i: "1d", ms: 300 * 864e5 }];
const RENK = { e20: "#f5c542", e50: "#5aa9ff", e200: "#c77dff", bb: "rgba(160,170,200,.55)", vwap: "#2ee59d" };
let _lw = null;
const lw = () => _lw || (_lw = import(new URL("../../vendor/lightweight-charts.mjs", import.meta.url).href));
const _veri = new Map();
const dosya = (ad) => { const x = _veri.get(ad); if (x && Date.now() - x.t < 600000) return x.p; const p = fetch(new URL("../../veri/" + ad, import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000)).then((r) => (r.ok ? r.json() : null)).catch(() => null); _veri.set(ad, { t: Date.now(), p }); return p; };

/** `ortam` = { hl, P(), fiyat } ; returns { panel element parts: govde, aralikDug, okuma }, yukle() */
export function grafikPaneli({ hl, P, fiyat }) {
  if (!document.getElementById("gk-stil")) document.head.append(el("style", { attr: { id: "gk-stil" }, yazi: STIL }));
  let aralik = ARALIK[1], chart = null, seriler = null, cizgiler = [], planCizgi = [], plan = null, sira = 0;
  const kutu = el("div", { sinif: "gk" });
  const bos = el("div", { sinif: "gk__bos", yazi: "Loading the chart…" });
  kutu.append(bos);
  const aralikDug = el("div", { sinif: "gk__ust" });
  const okuma = el("div", { sinif: "go" });
  const acik = el("div", { sinif: "gk__acik" }, [
    ...[["EMA 20", RENK.e20], ["EMA 50", RENK.e50], ["EMA 200", RENK.e200], ["Bollinger", RENK.bb], ["VWAP 24h", RENK.vwap]].map(([a, r]) => el("span", {}, [el("i", { attr: { style: "background:" + r } }), a])),
    el("span", {}, [el("i", { attr: { style: "background:#ff8a65" } }), "liquidations"]), el("span", {}, [el("i", { attr: { style: "background:#9aa3b8" } }), "support / resistance"])]);
  const aralikCiz = () => aralikDug.replaceChildren(...ARALIK.map((a) => el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", "aria-pressed": String(a === aralik) }, yazi: a.ad, on: { click: () => { aralik = a; aralikCiz(); yukle(); } } })));
  aralikCiz();

  async function kur() {
    if (chart) return;
    const L = await lw();
    const css = getComputedStyle(document.documentElement);
    const yazi = css.getPropertyValue("--yazi-3").trim() || "#8a90a6", cizgi = css.getPropertyValue("--cizgi").trim() || "#262a36";
    chart = L.createChart(kutu, { autoSize: true, layout: { background: { type: L.ColorType.Solid, color: "transparent" }, textColor: yazi, fontSize: 11, panes: { separatorColor: cizgi } },
      grid: { vertLines: { color: "rgba(128,128,128,.08)" }, horzLines: { color: "rgba(128,128,128,.08)" } }, rightPriceScale: { borderColor: cizgi }, timeScale: { borderColor: cizgi, timeVisible: true }, crosshair: { mode: L.CrosshairMode.Normal } });
    const yesil = css.getPropertyValue("--alis").trim() || "#2bd38b", kirmizi = css.getPropertyValue("--satis").trim() || "#ff6b5a";
    const cizgiSeri = (renk, pane = 0, ek = {}) => chart.addSeries(L.LineSeries, { color: renk, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...ek }, pane);
    seriler = {
      mum: chart.addSeries(L.CandlestickSeries, { upColor: yesil, downColor: kirmizi, wickUpColor: yesil, wickDownColor: kirmizi, borderVisible: false }, 0),
      hacim: chart.addSeries(L.HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "hacim", lastValueVisible: false, priceLineVisible: false }, 0),
      e20: cizgiSeri(RENK.e20), e50: cizgiSeri(RENK.e50), e200: cizgiSeri(RENK.e200, 0, { lineWidth: 2 }),
      bbU: cizgiSeri(RENK.bb, 0, { lineStyle: L.LineStyle.Dotted }), bbA: cizgiSeri(RENK.bb, 0, { lineStyle: L.LineStyle.Dotted }), vwap: cizgiSeri(RENK.vwap, 0, { lineStyle: L.LineStyle.Dashed }),
      rsi: cizgiSeri("#c9b8ff", 1, { lastValueVisible: true }),
      macd: cizgiSeri("#5aa9ff", 2), sinyal: cizgiSeri("#f5c542", 2), hist: chart.addSeries(L.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 2),
    };
    chart.priceScale("hacim").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    seriler.rsi.createPriceLine({ price: 70, color: "rgba(255,107,90,.5)", lineWidth: 1, lineStyle: L.LineStyle.Dashed, axisLabelVisible: false });
    seriler.rsi.createPriceLine({ price: 30, color: "rgba(43,211,139,.5)", lineWidth: 1, lineStyle: L.LineStyle.Dashed, axisLabelVisible: false });
    seriler.L = L;
  }

  function yatay(fiyatX, renk, baslik, stil) {
    return seriler.mum.createPriceLine({ price: fiyatX, color: renk, lineWidth: 1, lineStyle: stil, axisLabelVisible: true, title: baslik });
  }
  function planCiz() {
    if (!seriler) return;
    planCizgi.forEach((c) => seriler.mum.removePriceLine(c)); planCizgi = [];
    if (!plan) return;
    const L = seriler.L;
    if (plan.giris) planCizgi.push(yatay(plan.giris, "#cfd3e6", "entry", L.LineStyle.Solid));
    if (plan.sl) planCizgi.push(yatay(plan.sl, "#ff6b5a", "stop", L.LineStyle.Dashed));
    if (plan.tp) planCizgi.push(yatay(plan.tp, "#2bd38b", "target", L.LineStyle.Dashed));
  }
  window.addEventListener("hl-plan", (e) => { if (e.detail && e.detail.coin === P().ad) { plan = e.detail; planCiz(); seviyeAyikla(); } });
  /* 21 Nov 2026: a trade plan drawn after the levels hides the levels that would stack on its labels */
  function seviyeAyikla() {
    if (!seriler || !plan) return;
    const p = [plan.giris, plan.sl, plan.tp].filter((x) => x > 0);
    cizgiler = cizgiler.filter((x) => { const f = x.options().price; if (p.some((q) => Math.abs(f / q - 1) < 0.004)) { seriler.mum.removePriceLine(x); return false; } return true; });
  }

  async function yukle() {
    const no = ++sira, coin = P().ad, ar = aralik;
    bos.hidden = false; bos.textContent = "Loading the chart…";
    try {
      await kur();
      /* the chart's own interval, plus 1 h candles for the Chart read (the state key is defined on 1 h) */
      const [m, m1, D, I] = await Promise.all([hl.mumlar(coin, ar.i, ar.ms), ar.i === "1h" ? null : hl.mumlar(coin, "1h", 10 * 864e5), dosya("tm/" + coin + ".json"), dosya("tm/index.json")]);
      if (no !== sira) return;
      const mm = (m || []).map((x) => ({ t: Math.floor(x.t / 1000), o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v }));
      if (mm.length < 2) { bos.textContent = "No price history for this market."; return; }
      bos.hidden = true;
      const c = mm.map((x) => x.c), h = mm.map((x) => x.h), l = mm.map((x) => x.l), v = mm.map((x) => x.v);
      const ind = G.hepsi({ c, h, l, v });
      const seri = (a) => mm.map((x, i) => (a[i] == null ? { time: x.t } : { time: x.t, value: a[i] }));
      seriler.mum.setData(mm.map((x) => ({ time: x.t, open: x.o, high: x.h, low: x.l, close: x.c })));
      seriler.hacim.setData(mm.map((x) => ({ time: x.t, value: x.v, color: x.c >= x.o ? "rgba(43,211,139,.35)" : "rgba(255,107,90,.35)" })));
      seriler.e20.setData(seri(ind.e20)); seriler.e50.setData(seri(ind.e50)); seriler.e200.setData(seri(ind.e200));
      seriler.bbU.setData(seri(ind.bb.ust)); seriler.bbA.setData(seri(ind.bb.alt)); seriler.vwap.setData(seri(ind.vwap));
      seriler.rsi.setData(seri(ind.rsi));
      seriler.macd.setData(seri(ind.macd.macd)); seriler.sinyal.setData(seri(ind.macd.sinyal));
      seriler.hist.setData(mm.map((x, i) => (ind.macd.hist[i] == null ? { time: x.t } : { time: x.t, value: ind.macd.hist[i], color: ind.macd.hist[i] >= 0 ? "rgba(43,211,139,.6)" : "rgba(255,107,90,.6)" })));
      /* horizontal levels: nearest support / resistance and the biggest liquidation clusters near the price */
      cizgiler.forEach((x) => seriler.mum.removePriceLine(x)); cizgiler = [];
      const L = seriler.L, son = c[c.length - 1];
      const sv = G.seviyeler(h, l, c);
      /* 21 Nov 2026: a level closer than 0.4% to the price, the trade plan or another level is skipped, so the axis labels never stack */
      const tutulan = [son, plan && plan.giris, plan && plan.sl, plan && plan.tp].filter((x) => x > 0);
      const bosta = (p) => !tutulan.some((q) => Math.abs(p / q - 1) < 0.004) && tutulan.push(p);
      sv.destek.slice(0, 2).filter(bosta).forEach((p) => cizgiler.push(yatay(p, "#9aa3b8", "support", L.LineStyle.SparseDotted)));
      sv.direnc.slice(0, 2).filter(bosta).forEach((p) => cizgiler.push(yatay(p, "#9aa3b8", "resistance", L.LineStyle.SparseDotted)));
      if (D && D.likit) {
        const buyuk = (a, ad) => (a || []).filter((x) => Math.abs(x[0] / son - 1) <= 0.12).sort((x, y) => y[1] - x[1]).filter((x) => bosta(x[0])).slice(0, 2)
          .forEach((x) => cizgiler.push(yatay(x[0], "#ff8a65", ad + " liq. $" + (x[1] >= 1e6 ? (x[1] / 1e6).toFixed(1) + "M" : Math.round(x[1] / 1e3) + "K"), L.LineStyle.Dotted)));
        buyuk(D.likit.uzun, "long"); buyuk(D.likit.kisa, "short");
      }
      planCiz();
      /* price pane 3 parts, RSI and MACD 1 part each */
      try { const pn = chart.panes(); if (pn[0]) pn[0].setStretchFactor(3); if (pn[1]) pn[1].setStretchFactor(1); if (pn[2]) pn[2].setStretchFactor(1); } catch (e) { /* older API */ }
      chart.timeScale().fitContent();
      /* Chart read on 1 h */
      const k1 = ar.i === "1h" ? mm : (m1 || []).map((x) => ({ t: x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v }));
      okumaCiz(k1, I, D);
    } catch (e) { bos.hidden = false; bos.textContent = "The chart could not be loaded."; }
  }

  function okumaCiz(k, I, D) {
    if (!k || k.length < 60) { okuma.replaceChildren(el("div", { sinif: "go__n", yazi: "Not enough 1 h history for a chart read." })); return; }
    /* the last candle is still forming: read the last closed one */
    const kap = k.slice(0, -1);
    const c = kap.map((x) => x.c), h = kap.map((x) => x.h), l = kap.map((x) => x.l), v = kap.map((x) => x.v);
    const ind = G.hepsi({ c, h, l, v }), i = c.length - 1, son = c[i];
    const anahtar = ind.durum[i], y = G.durumYazi(anahtar);
    const kutu2 = (a, b) => el("div", {}, [el("small", { yazi: a }), el("b", { yazi: b })]);
    const yuz = (x) => (x == null ? "–" : (x > 0 ? "+" : "") + (x * 100).toFixed(1) + "%");
    const sv = G.seviyeler(h, l, c);
    const hacimK = ind.v24[i] > 0 ? v[i] / ind.v24[i] : null;
    const satirlar = [el("div", { sinif: "go__g" }, [
      kutu2("Trend (1h)", y ? y.T.split(" (")[0] : "–"),
      kutu2("RSI 14", ind.rsi[i] != null ? ind.rsi[i].toFixed(0) + " · " + (y ? y.R.split(" (")[0] : "") : "–"),
      kutu2("MACD", ind.macd.hist[i] != null ? (ind.macd.hist[i] >= 0 ? "above signal" : "below signal") : "–"),
      kutu2("Bollinger", y ? y.B.replace(" of the Bollinger bands", "").replace(" Bollinger band", "") : "–"),
      kutu2("Volume", hacimK != null ? hacimK.toFixed(1) + "× 24h avg" : "–"),
      kutu2("vs VWAP 24h", ind.vwap[i] ? yuz(son / ind.vwap[i] - 1) : "–"),
      kutu2("Support", sv.destek[0] ? fiyat(sv.destek[0]) + " (" + yuz(sv.destek[0] / son - 1) + ")" : "–"),
      kutu2("Resistance", sv.direnc[0] ? fiyat(sv.direnc[0]) + " (" + yuz(sv.direnc[0] / son - 1) + ")" : "–"),
    ])];
    if (y) satirlar.push(el("div", { sinif: "go__m", yazi: "Right now: " + y.T + ", " + y.R + ", " + y.B + ", " + y.V + ", " + y.M + "." }));
    /* history of the same state, all markets, last 60 days (loosest match with at least 100 cases) */
    if (anahtar && I && I.durum) {
      let st = null, sev = 0;
      for (let s = 0; s < G.GEVSET.length; s++) { const x = I.durum[G.GEVSET[s](anahtar)]; if (x && x[0] >= 100) { st = x; sev = s; break; } }
      const taban = I.durumTaban;
      if (st) satirlar.push(el("div", { sinif: "go__m", yazi: "Across " + (I.piyasalar ? I.piyasalar.length : "all") + " markets in the last 60 days, after the same " + G.GEVSET_AD[sev] + " (" + st[0].toLocaleString("en-US") + " times), the price was higher 24 h later " + Math.round(st[1] * 100) + "% of the time" + (taban ? " (any hour: " + Math.round(taban[1] * 100) + "%)" : "") + "; average 24 h move " + yuz(Math.exp(st[2]) - 1) + "." }));
    }
    satirlar.push(el("div", { sinif: "go__n", yazi: "Indicators on Hyperliquid's 1 h candles (last closed hour). The history is one 60-day stretch of one kind of market; it describes what followed, it does not say what will follow. Not advice." }));
    okuma.replaceChildren(el("div", { sinif: "go__bas" }, [el("span", { yazi: "📈 Chart read" }), el("small", { yazi: "1 h · info, not advice" })]), ...satirlar);
  }

  const govde = el("div", { sinif: "yigin yigin--sik" }, [kutu, acik, okuma, el("div", { sinif: "go__n", yazi: "Hyperliquid's own candles; chart by TradingView Lightweight Charts™. Liquidation lines: large public Hyperliquid positions (hourly)." })]);
  return { govde, aralikDug, yukle };
}
