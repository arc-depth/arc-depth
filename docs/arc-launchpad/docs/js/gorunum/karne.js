/* ===========================================================================
 * gorunum/karne.js — Indicator scorecard panel (perps trade page and Hot tokens token page)
 *
 * 18 Nov 2026 (owner approved). Our scan of 18 classic indicators on 20 Hyperliquid perps (~200 days) found none
 * that worked in both halves: trend signals won while prices rose, mean reversion won while they fell. So instead
 * of one more buy/sell line, this shows for THIS market: what each indicator says right now, and how often it was
 * right here over the last 30 days (direction after 24 h). Computed in the browser from 1 h candles.
 * =========================================================================== */

import { el } from "../ui.js";
import { karne } from "../indikator.js";

const STIL =
  ".ik{display:grid;gap:8px;font-size:13px;min-width:0}.ik>*{min-width:0}" +
  ".ik__simdi{display:grid;gap:6px}.ik__s{display:flex;justify-content:space-between;gap:8px;border:1px solid var(--cizgi);border-radius:10px;padding:7px 10px;flex-wrap:wrap}" +
  ".ik__s b{font-weight:700}.ik__al{color:var(--alis)}.ik__sat{color:var(--satis)}.ik__n{font-size:11.5px;color:var(--yazi-3);line-height:1.4}" +
  ".ik__tablo{overflow-x:auto}.ik table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}" +
  ".ik th{text-align:left;color:var(--yazi-3);font-weight:600;padding:5px 6px;border-bottom:1px solid var(--cizgi);white-space:nowrap}" +
  ".ik td{padding:5px 6px;border-bottom:1px solid var(--cizgi)}.ik td.r,.ik th.r{text-align:right;white-space:nowrap}" +
  ".ik__cubuk{height:6px;border-radius:3px;background:var(--cizgi);overflow:hidden;min-width:44px}.ik__cubuk i{display:block;height:100%}";

const kisa = (ad) => ad.replace(/ \((?:trend|momentum|mean reversion|volume|volume, mean reversion|volatility|time-series momentum)\)$/, "");

/** `mumGetir()` -> Promise of [{t,o,h,l,c,v}] hourly candles (oldest first) or null; `ad()` -> market name. */
export function karnePaneli({ mumGetir, ad }) {
  if (!document.getElementById("ik-stil")) document.head.append(el("style", { attr: { id: "ik-stil" }, yazi: STIL }));
  const govde = el("div", { sinif: "ik" }, [el("div", { sinif: "ik__n", yazi: "Open to score the indicators on this market." })]);
  let sonAd = null, calisiyor = false;
  async function hesapla() {
    const simdiAd = ad();
    if (calisiyor || simdiAd === sonAd) return;
    calisiyor = true; sonAd = simdiAd;
    govde.replaceChildren(el("div", { sinif: "ik__n", yazi: "Scoring 18 indicators on " + simdiAd + "'s last 30 days…" }));
    try {
      const m = await mumGetir();
      const k = karne(m);
      if (!k) { govde.replaceChildren(el("div", { sinif: "ik__n", yazi: simdiAd + " does not have enough hourly history yet (needs about 11 days)." })); return; }
      const yuz = (x) => (x == null ? "–" : Math.round(x * 100) + "%");
      const bps = (x) => (x == null ? "–" : (x >= 0 ? "+" : "") + (x / 100).toFixed(2) + "%");
      /* what is signalling now, best record first */
      const simdi = k.satir.filter((x) => x.simdi && x.n >= 10).sort((a, b) => b.ortBps - a.ortBps);
      const lehte = simdi.filter((x) => x.ortBps > 0 && x.isabet > 0.5);
      const sinyal = (x) => el("div", { sinif: "ik__s" }, [
        el("span", {}, [el("b", { sinif: x.simdi > 0 ? "ik__al" : "ik__sat", yazi: x.simdi > 0 ? "LONG " : "SHORT " }), kisa(x.ad)]),
        el("span", { sinif: "ik__n", yazi: "here, last " + k.gun + " days: right " + yuz(x.isabet) + " of " + x.n + " times, avg " + bps(x.ortBps) + " in 24 h" })]);
      const uzun = simdi.filter((x) => x.simdi > 0).length, kisaN = simdi.filter((x) => x.simdi < 0).length;
      const ozet = !simdi.length ? "No indicator is signalling on " + simdiAd + " right now."
        : uzun + " indicator" + (uzun === 1 ? "" : "s") + " say long, " + kisaN + " say short right now. " +
          (lehte.length ? "The ones that have been working here lately: " + lehte.slice(0, 3).map((x) => kisa(x.ad) + " (" + (x.simdi > 0 ? "long" : "short") + ")").join(", ") + "." : "None of them has a good record on this market lately.");
      const tablo = el("table", {}, [
        el("thead", {}, [el("tr", {}, [el("th", { yazi: "Indicator" }), el("th", { yazi: "Now" }), el("th", { sinif: "r", yazi: "Right" }), el("th", { yazi: "" }), el("th", { sinif: "r", yazi: "Avg 24 h" }), el("th", { sinif: "r", yazi: "Signals" })])]),
        el("tbody", {}, k.satir.filter((x) => x.n).sort((a, b) => b.ortBps - a.ortBps).map((x) => el("tr", {}, [
          el("td", { yazi: kisa(x.ad) }),
          el("td", { sinif: x.simdi > 0 ? "ik__al" : x.simdi < 0 ? "ik__sat" : "", yazi: x.simdi > 0 ? "long" : x.simdi < 0 ? "short" : "–" }),
          el("td", { sinif: "r", yazi: yuz(x.isabet) }),
          el("td", {}, [el("div", { sinif: "ik__cubuk" }, [el("i", { attr: { style: "width:" + Math.round((x.isabet || 0) * 100) + "%;background:" + (x.ortBps > 0 ? "var(--alis)" : "var(--satis)") } })])]),
          el("td", { sinif: "r " + (x.ortBps > 0 ? "ik__al" : "ik__sat"), yazi: bps(x.ortBps) }),
          el("td", { sinif: "r", yazi: String(x.n) })]))),
      ]);
      govde.replaceChildren(...[
        el("div", { sinif: "ik__n", attr: { style: "border-left:2px solid var(--marka);padding-left:8px;color:var(--yazi-2)" }, yazi: "📝 " + ozet }),
        /* the four with the best record here; the rest are in the table */
        simdi.length ? el("div", { sinif: "ik__simdi" }, simdi.slice(0, 4).map(sinyal)) : null,
        el("div", { sinif: "ik__tablo" }, [tablo]),
        el("div", { sinif: "ik__n", yazi: "How to read it: \"Right\" = how often the price moved the indicator's way over the next 24 h when it signalled on " + simdiAd + " in the last " + k.gun + " days. The coin itself moved " + bps(k.tabanBps) + " per 24 h on average in that time, so a short or long bias can look good just because of that." }),
        el("div", { sinif: "ik__n", yazi: "Why a scorecard and not one more indicator: we tested 18 classic indicators on 20 Hyperliquid markets over ~200 days and none worked in both halves. Trend signals won while prices rose; mean reversion (RSI, Bollinger, MFI) won while they fell. What works changes with the market, so check it here before you trust one. Hourly signals overlap, so the counts look bigger than they are. Not advice." }),
      ].filter(Boolean));
    } catch (e) {
      sonAd = null;
      govde.replaceChildren(el("div", { sinif: "ik__n", yazi: "The price history could not be read right now. Close and open this again in a minute." }));
    } finally { calisiyor = false; }
  }
  const kutu = el("details", { sinif: "ayrinti" }, [el("summary", { yazi: "📊 Indicator scorecard · what 18 indicators say now, and how they did here in the last 30 days" }), el("div", { sinif: "ayrinti__govde" }, [govde])]);
  kutu.addEventListener("toggle", () => { if (kutu.open) hesapla(); });
  return { kutu, yenile: () => { sonAd = null; if (kutu.open) hesapla(); } };
}
