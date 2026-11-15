/* ===========================================================================
 * gorunum/hl-hedef.js — Target Radar (#/perps/targets)
 *
 * 15 Nov 2026 (owner approved). The "radar" of the perps cockpit: every Hyperliquid market with
 * >= $1M daily volume is scanned every hour (scripts/perps-hedef.js -> veri/perps-hedef.json) for
 * unusual conditions: funding at an extreme, a volatility squeeze, a 7-day breakout on volume, an open
 * interest surge, a big funding gap between venues. Each target says WHY it is listed, and what the
 * price did in the 24 h after the same condition over the last 30 days (history, with its count).
 * Never a buy / sell call, no forecasts. "Aim" opens the trade page with Aim assist (hl-fuze.js) for
 * that market and side; nothing is sent until the visitor reviews and signs there.
 * =========================================================================== */

import { el, sayfaUst, panel, not } from "../ui.js";

const RISK = "Conditions, not calls: a listed market is unusual right now, which says nothing certain about where its price goes next. " +
  "Perps use leverage and you can lose more than you expect, fast. History below is the last 30 days only and does not repeat on schedule.";

const TUR = {
  fon: { ad: "Funding extreme", ikon: "💸", aciklama: "One side pays the other far more than usual. Crowded sides sometimes unwind sharply; sometimes the trend just keeps going." },
  sikisma: { ad: "Squeeze", ikon: "🧲", aciklama: "The last day was much calmer than the month. Quiet stretches are often followed by a bigger move, in either direction." },
  kirilma: { ad: "Breakout", ikon: "🚀", aciklama: "Price left its 7-day range with more volume than usual. Some breakouts run, many fall back into the range." },
  oi: { ad: "OI surge", ikon: "🌊", aciklama: "Open interest jumped or dropped in a day: many positions opened or closed." },
  bant: { ad: "Range edge", ikon: "📏", aciklama: "The price is at the bottom or top 15% of its last 24 hours' range (at least 1.2% wide), on a market with a real order book. Ranges often hold, until they break." },
  capraz: { ad: "Funding gap", ikon: "⚖️", aciklama: "The same market's funding differs a lot between venues (each venue has its own fees and rules)." },
};

const STIL =
  ".hd-filtre{display:flex;flex-wrap:wrap;gap:6px}.hd-filtre button[aria-pressed=true]{border-color:var(--marka);color:var(--yazi-1);background:var(--marka-zemin,rgba(124,92,255,.12))}" +
  ".hd-liste{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}" +
  ".hd-kart{border:1px solid var(--cizgi);border-radius:14px;padding:12px;display:grid;gap:8px;background:var(--yuzey-1);min-width:0}" +
  ".hd-ust{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.hd-ust b{font-size:18px}.hd-ust span{font-size:12.5px;color:var(--yazi-3);font-variant-numeric:tabular-nums}" +
  ".hd-k{display:grid;gap:2px;font-size:13px;line-height:1.45}.hd-k strong{font-size:12px;letter-spacing:.03em;text-transform:uppercase}" +
  ".hd-g{font-size:12px;color:var(--yazi-3);line-height:1.4}" +
  ".hd-dug{display:grid;grid-template-columns:1fr 1fr;gap:8px}.hd-dug .dugme{min-height:40px}" +
  ".hd-art{color:var(--alis)}.hd-eks{color:var(--satis)}" +
  ".hd-tablo{width:100%;border-collapse:collapse;font-size:13px}.hd-tablo td,.hd-tablo th{padding:6px;border-bottom:1px solid var(--cizgi);text-align:left;font-variant-numeric:tabular-nums}.hd-tablo th{font-size:12px;color:var(--yazi-3);font-weight:600}" +
  ".hd-sarmal{overflow-x:auto}";

const yz = (x, d = 1) => (x == null || !isFinite(x) ? "–" : (x * 100).toFixed(d) + "%");
const kisaUsd = (x) => (x >= 1e9 ? "$" + (x / 1e9).toFixed(2) + "B" : x >= 1e6 ? "$" + (x / 1e6).toFixed(1) + "M" : "$" + Math.round(x / 1e3) + "K");

function gecmisYazi(tur, yon, G) {
  const g = G && G[tur];
  if (!g || g.n < 10) return null;
  const taban = G.taban;
  let yazi = "Last 30 days, after this condition (" + g.n + " times): the price moved ±" + yz(g.ortHareket) + " on average in the next 24 h" + (taban ? " (any market, any day: ±" + yz(taban.ortHareket) + ")" : "");
  const oran = yon === "yukari" ? g.yukariIse : yon === "asagi" ? g.asagiIse : g.yukari;
  const n = yon === "yukari" ? g.nYukari : yon === "asagi" ? g.nAsagi : g.n;
  if (oran != null && n >= 10) yazi += "; it was higher 24 h later " + Math.round(oran * 100) + "% of the time (" + n + " cases" + (taban ? "; baseline " + Math.round(taban.yukari * 100) + "%" : "") + ").";
  else yazi += ".";
  return yazi;
}

export async function ciz() {
  if (!document.getElementById("hd-stil")) document.head.append(el("style", { attr: { id: "hd-stil" }, yazi: STIL }));
  document.title = "Target Radar — ARC PULSE";
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Target Radar", "Unusual conditions across Hyperliquid's markets, scanned every hour. Each one says why it is listed.", [
    el("a", { sinif: "dugme dugme--sade", attr: { href: "#/perps/alerts" }, yazi: "🔔 Alerts" }),
    el("a", { sinif: "dugme dugme--sade", attr: { href: "#/perps" }, yazi: "Perps Radar" }),
    el("a", { sinif: "dugme dugme--marka", attr: { href: "#/perps/trade" }, yazi: "Trade" })]));
  kap.append(not(RISK, "uyari"));

  let v = null;
  try {
    const r = await fetch(new URL("../../veri/perps-hedef.json", import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000));
    if (r.ok) v = await r.json();
  } catch (e) { /* below */ }
  if (!v || !Array.isArray(v.hedefler)) { kap.append(panel("Targets", not("The scan is not published yet; it runs every hour. Please check back soon.", "bilgi"))); return kap; }

  let secili = "hepsi";
  const filtre = el("div", { sinif: "hd-filtre" });
  const liste = el("div", { sinif: "hd-liste" });
  const sayac = (t) => v.hedefler.filter((h) => h.kosul.some((k) => k.tur === t)).length;
  const filtreCiz = () => filtre.replaceChildren(...[["hepsi", "All (" + v.hedefler.length + ")"], ...Object.entries(TUR).map(([k, x]) => [k, x.ikon + " " + x.ad + " (" + sayac(k) + ")"])]
    .map(([k, ad]) => el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", "aria-pressed": String(secili === k) }, yazi: ad, on: { click: () => { secili = k; filtreCiz(); listeCiz(); } } })));

  function kart(h) {
    const kosullar = h.kosul.filter((k) => secili === "hepsi" || k.tur === secili);
    return el("div", { sinif: "hd-kart" }, [
      el("div", { sinif: "hd-ust" }, [el("b", { yazi: h.c }), el("span", {}, [el("span", { sinif: h.d24 >= 0 ? "hd-art" : "hd-eks", yazi: (h.d24 > 0 ? "+" : "") + yz(h.d24) + " 24h" }), " · " + kisaUsd(h.hacim) + " vol"])]),
      ...kosullar.map((k) => el("div", { sinif: "hd-k" }, [
        el("strong", { yazi: (TUR[k.tur] || {}).ikon + " " + ((TUR[k.tur] || {}).ad || k.tur) }),
        el("span", { yazi: k.yazi.charAt(0).toUpperCase() + k.yazi.slice(1) + "." }),
        gecmisYazi(k.tur, k.yon, v.gecmis) ? el("span", { sinif: "hd-g", yazi: gecmisYazi(k.tur, k.yon, v.gecmis) }) : null,
      ])),
      el("div", { sinif: "hd-dug" }, [
        el("a", { sinif: "dugme dugme--alis", attr: { href: "#/perps/trade?coin=" + encodeURIComponent(h.c) + "&aim=long" }, yazi: "Aim long" }),
        el("a", { sinif: "dugme dugme--satis", attr: { href: "#/perps/trade?coin=" + encodeURIComponent(h.c) + "&aim=short" }, yazi: "Aim short" })]),
    ]);
  }
  function listeCiz() {
    const l = v.hedefler.filter((h) => secili === "hepsi" || h.kosul.some((k) => k.tur === secili));
    liste.replaceChildren(...(l.length ? l.slice(0, 60).map(kart) : [el("div", { sinif: "ikincil", yazi: "Nothing unusual of this kind right now." })]));
  }
  filtreCiz(); listeCiz();
  const yas = Math.max(0, Math.round((Date.now() - Date.parse(v.guncellendi)) / 60000));
  kap.append(panel("Targets now", el("div", { sinif: "yigin yigin--sik" }, [filtre,
    el("div", { sinif: "hd-g", yazi: v.taranan + " markets scanned " + yas + " min ago. Sorted by how strong the conditions are. Aim opens the trade page with Aim assist; nothing is sent until you review and sign." }),
    liste])));

  /* what each condition means, and its 30-day record */
  const G = v.gecmis || {};
  kap.append(panel("What each condition means", el("div", { sinif: "yigin yigin--sik" }, [
    ...Object.entries(TUR).map(([k, x]) => el("div", { sinif: "hd-k" }, [el("strong", { yazi: x.ikon + " " + x.ad }), el("span", { yazi: x.aciklama })])),
    el("div", { sinif: "hd-sarmal" }, [el("table", { sinif: "hd-tablo" }, [
      el("thead", {}, [el("tr", {}, ["Condition", "Times (30 d)", "Avg move next 24 h", "Median move", "Higher 24 h later"].map((x) => el("th", { yazi: x })))]),
      el("tbody", {}, [...["fon", "sikisma", "kirilma", "bant"].filter((k) => G[k]).map((k) => el("tr", {}, [
        el("td", { yazi: TUR[k].ad }), el("td", { yazi: String(G[k].n) }), el("td", { yazi: "±" + yz(G[k].ortHareket) }), el("td", { yazi: "±" + yz(G[k].medyanHareket) }), el("td", { yazi: Math.round(G[k].yukari * 100) + "%" })])),
        G.taban ? el("tr", {}, [el("td", { yazi: "Baseline: any market, any day" }), el("td", { yazi: String(G.taban.n) }), el("td", { yazi: "±" + yz(G.taban.ortHareket) }), el("td", { yazi: "±" + yz(G.taban.medyanHareket) }), el("td", { yazi: Math.round(G.taban.yukari * 100) + "%" })]) : null]),
    ])]),
    el("div", { sinif: "hd-g", yazi: "The same rule run over the last 30 days of every scanned market, at most once per market per day, and the price 24 h later. A short window in one kind of market: treat it as context, not as odds." }),
  ])));
  return kap;
}
