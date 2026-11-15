/* ===========================================================================
 * gorunum/perps.js — Perps Radar (#/perps)
 *
 * Read-only comparison of perpetual-futures DEXes, from veri/perps.json
 * (written hourly by scripts/perps-radar.js from each venue's public API).
 * For each coin: every venue listing it, sorted by 24 h volume, so a visitor
 * sees where the volume is; plus a venue leaderboard. The radar itself is
 * read-only: a "Trade on" link opens the venue's own site. 15 Nov 2026:
 * Hyperliquid can also be traded here (#/perps/trade, gorunum/hl-trade.js,
 * the visitor's own wallet signs; ARC PULSE builder fee 0.05%).
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum, ayrinti } from "../ui.js";
import { maskotBos } from "./squad.js";

const SAYFA = 30;
const RISK = "Perpetual futures use leverage and can lose more than you expect quickly. ARC PULSE does not run these exchanges; trades happen on the venue you open. Not available where perps are restricted.";

const STIL =
  ".pr-ust{display:flex;align-items:center;gap:14px}.pr-ust img{width:84px;height:84px;flex:none}" +
  ".pr-ust p{margin:0;font-size:14px;line-height:1.5;color:var(--yazi-2)}" +
  ".pr-tablo td,.pr-tablo th{font-size:14px}.pr-tablo td.sayi,.pr-tablo th.sayi{text-align:right;white-space:nowrap}" +
  ".pr-pay{display:block;height:4px;border-radius:4px;background:var(--marka,#7c5cff);margin-top:6px;min-width:2px}" +
  ".pr-ara{width:100%;height:44px;font-size:16px}" +
  ".pr-liste{display:grid;gap:8px}" +
  ".pr-coin{border:1px solid var(--cizgi);border-radius:14px;background:var(--yuzey-1);min-width:0}" +
  ".pr-coin[open]{border-color:var(--marka-cizgi,var(--cizgi))}" +
  ".pr-coin>summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:44px minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.4fr) 18px;gap:10px;align-items:center;padding:12px 14px;min-height:52px}" +
  ".pr-coin>summary::-webkit-details-marker{display:none}" +
  ".pr-coin>summary::after{content:'▾';color:var(--yazi-3);transition:transform .15s}.pr-coin[open]>summary::after{transform:rotate(180deg)}" +
  ".pr-sira{color:var(--yazi-3);font-size:13px;font-variant-numeric:tabular-nums}" +
  ".pr-ad{font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
  ".pr-ad small{display:block;font-weight:400;font-size:12px;color:var(--yazi-3)}" +
  ".pr-hacim{font-variant-numeric:tabular-nums;font-weight:600;text-align:right}.pr-hacim small{display:block;font-weight:400;font-size:12px;color:var(--yazi-3)}" +
  ".pr-en{font-size:13px;color:var(--yazi-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}" +
  ".pr-govde{padding:0 14px 14px;overflow-x:auto}" +
  ".pr-govde table{width:100%;border-collapse:collapse}.pr-govde th{font-size:12px;font-weight:600;color:var(--yazi-3);text-align:left;padding:6px 8px;border-bottom:1px solid var(--cizgi);white-space:nowrap}" +
  ".pr-govde td{font-size:14px;padding:9px 8px;border-bottom:1px solid var(--cizgi);vertical-align:middle;font-variant-numeric:tabular-nums}" +
  ".pr-govde tr:last-child td{border-bottom:0}.pr-govde .sayi{text-align:right;white-space:nowrap}" +
  ".pr-en-cok td{background:var(--marka-zemin,rgba(124,92,255,.10))}" +
  ".pr-git{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:6px 12px;border-radius:10px;border:1px solid var(--cizgi);color:var(--yazi-1);font-size:13px;font-weight:600;white-space:nowrap;text-decoration:none}" +
  ".pr-git:hover{border-color:var(--marka,#7c5cff);color:var(--yazi-1)}" +
  ".pr-not{font-size:12px;color:var(--yazi-3);margin-top:8px}" +
  ".pr-yok{padding:14px;color:var(--yazi-3)}" +
  "@media (max-width:760px){.pr-tablo tbody tr{grid-template-columns:minmax(0,1fr)}.pr-tablo tbody td:first-child{display:block}}" +
  "@media (max-width:640px){.pr-ust img{width:64px;height:64px}" +
  ".pr-coin>summary{grid-template-columns:30px minmax(0,1fr) auto 14px;row-gap:2px;padding:10px 12px}.pr-en{grid-column:2/4;text-align:left;font-size:12.5px}" +
  ".pr-coin>summary::after{grid-row:1;grid-column:4}" +
  ".pr-govde{padding:0 10px 10px}.pr-govde thead{display:none}.pr-govde table,.pr-govde tbody,.pr-govde tr,.pr-govde td{display:block;width:100%}" +
  ".pr-govde tr{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;padding:10px;border:1px solid var(--cizgi);border-radius:12px;margin-top:8px}" +
  ".pr-govde td{border:0;padding:0;text-align:left!important;font-size:13.5px}.pr-govde td::before{content:attr(data-et);display:block;font-size:11px;color:var(--yazi-3)}" +
  ".pr-govde td.pr-v,.pr-govde td.pr-d{grid-column:1/-1}.pr-govde td.pr-v::before,.pr-govde td.pr-d::before{content:none}.pr-git{width:100%;min-height:42px}" +
  ".pr-en-cok td{background:none}.pr-en-cok{background:var(--marka-zemin,rgba(124,92,255,.10))}}";

const zamanYaz = (iso) => { const d = new Date(iso); return d.getUTCDate() + " " + d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) + ", " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + " UTC"; };
function dolar(x) {
  if (x == null) return "–";
  const a = Math.abs(x);
  if (a >= 1e9) return "$" + (x / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (x / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
  if (a >= 1e3) return "$" + (x / 1e3).toFixed(a >= 1e5 ? 0 : 1) + "K";
  return "$" + Math.round(x);
}
function fiyat(p) {
  if (!p) return "–";
  if (p >= 1000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return "$" + Number(p.toPrecision(4)).toString();
}
const fon = (f) => (f == null ? "–" : (f > 0 ? "+" : "") + f.toFixed(4) + "%");
const kaldirac = (l) => (l ? l + "×" : "–");

async function veriOku() {
  const url = new URL("../../veri/perps.json", import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000);
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function tradeLink(V, e, coin) {
  const m = V[e.v];
  if (!m) return null;
  if (e.v === "hyperliquid") {
    const s = e.s || coin;
    return el("span", { attr: { style: "display:inline-flex;gap:6px;flex-wrap:wrap" } }, [
      el("a", { sinif: "pr-git dugme--marka", attr: { href: "#/perps/trade?coin=" + encodeURIComponent(s), style: "background:var(--marka);border-color:var(--marka);color:#fff" }, yazi: "Trade here" }),
      el("a", { sinif: "pr-git", attr: { href: m.url.replace("{s}", encodeURIComponent(s)), target: "_blank", rel: "noopener noreferrer" }, yazi: "Hyperliquid ↗" })]);
  }
  if (m.genel) return el("a", { sinif: "pr-git", attr: { href: m.url, target: "_blank", rel: "noopener noreferrer", title: "Orderly is an order book shared by many front ends" }, yazi: "Find an Orderly app ↗" });
  const href = m.url.replace("{s}", encodeURIComponent(e.s || coin));
  return el("a", { sinif: "pr-git", attr: { href, target: "_blank", rel: "noopener noreferrer" }, yazi: "Trade on " + m.ad + " ↗" });
}

function mekanTablosu(veri) {
  const V = veri.venues || {};
  const liste = Object.entries(V).filter(([, m]) => m.vol > 0 || m.hata).sort((a, b) => b[1].vol - a[1].vol);
  const toplam = liste.reduce((t, [, m]) => t + (m.vol || 0), 0) || 1;
  const t = el("table", { sinif: "tablo tablo--kart pr-tablo" });
  t.append(el("thead", {}, [el("tr", {}, [el("th", { yazi: "Venue" }), el("th", { sinif: "sayi", yazi: "24h volume" }), el("th", { sinif: "sayi", yazi: "Open interest" }), el("th", { sinif: "sayi", yazi: "Markets" })])]));
  t.append(el("tbody", {}, liste.map(([k, m], i) => el("tr", {}, [
    el("td", {}, [el("strong", { yazi: "#" + (i + 1) + " " + m.ad }),
      m.hata ? el("span", { sinif: "etiket etiket--uyari", attr: { style: "margin-left:6px" }, yazi: "Not updated this hour" }) : null,
      el("span", { sinif: "pr-pay", attr: { style: "width:" + Math.max(1, Math.round((m.vol / toplam) * 100)) + "%" } })]),
    el("td", { sinif: "sayi", attr: { "data-et": "24h volume" }, yazi: dolar(m.vol) + " · " + (m.vol / toplam < 0.01 ? (m.vol ? "<1" : "0") : Math.round((m.vol / toplam) * 100)) + "%" }),
    el("td", { sinif: "sayi", attr: { "data-et": "Open interest" }, yazi: dolar(m.oi) }),
    el("td", { sinif: "sayi", attr: { "data-et": "Markets" }, yazi: String(m.n || 0) }),
  ]))));
  return el("div", { sinif: "tablo-sarmal" }, [t]);
}

function coinSatiri(veri, x, sira) {
  const V = veri.venues || {};
  const ust = x.ve[0];
  const d = el("details", { sinif: "pr-coin", veri: { c: x.c.toLowerCase() } });
  const binlik = x.ve.some((e) => e.m > 1);
  d.append(el("summary", {}, [
    el("span", { sinif: "pr-sira", yazi: "#" + sira }),
    el("span", { sinif: "pr-ad" }, [x.c, el("small", { yazi: x.ve.length + " venue" + (x.ve.length === 1 ? "" : "s") })]),
    el("span", { sinif: "pr-hacim" }, [dolar(x.vol), el("small", { yazi: "24h volume" })]),
    el("span", { sinif: "pr-en", yazi: "Most volume: " + ((V[ust.v] || {}).ad || ust.v) + " (" + Math.round((ust.vol / (x.vol || 1)) * 100) + "%)" }),
  ]));
  let cizildi = false;
  const ciz = () => {
    if (cizildi) return;
    cizildi = true;
    const t = el("table");
    t.append(el("thead", {}, [el("tr", {}, ["Venue", "24h volume", "Open interest", "Funding (8h)", "Max leverage", "Price", ""].map((b, i) => el("th", { sinif: i && i < 6 ? "sayi" : "", yazi: b })))]));
    t.append(el("tbody", {}, x.ve.map((e, i) => el("tr", { sinif: i === 0 ? "pr-en-cok" : "" }, [
      el("td", { sinif: "pr-v" }, [el("strong", { yazi: (V[e.v] || {}).ad || e.v }),
        i === 0 ? el("span", { sinif: "etiket etiket--alis", attr: { style: "margin-left:6px" }, yazi: "Most volume" }) : null]),
      el("td", { sinif: "sayi", attr: { "data-et": "24h volume" }, yazi: dolar(e.vol) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Open interest" }, yazi: dolar(e.oi) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Funding (8h)" }, yazi: fon(e.f) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Max leverage" }, yazi: kaldirac(e.l) }),
      el("td", { sinif: "sayi", attr: { "data-et": e.m > 1 ? "Price (per " + e.m.toLocaleString("en-US") + ")" : "Price" }, yazi: fiyat(e.p) }),
      el("td", { sinif: "pr-d" }, [tradeLink(V, e, x.c)]),
    ]))));
    d.append(el("div", { sinif: "pr-govde" }, [t,
      binlik ? el("div", { sinif: "pr-not", yazi: "Some venues list " + x.c + " as a 1000x contract (one contract = 1000 " + x.c + ", e.g. k" + x.c + " or 1000" + x.c + "); its price is for that bundle." }) : null]));
  };
  d.addEventListener("toggle", () => { if (d.open) ciz(); });
  return d;
}

export async function ciz(ctx = {}) {
  if (ctx.param && ctx.param.get("alt") === "trade") return (await import("./hl-trade.js")).ciz(ctx);
  if (ctx.param && ctx.param.get("alt") === "targets") return (await import("./hl-hedef.js")).ciz(ctx);
  if (!document.getElementById("pr-stil")) document.head.append(el("style", { attr: { id: "pr-stil" }, yazi: STIL }));
  const kap = el("div", { sinif: "yigin" });
  const turbo = el("img", { attr: { src: new URL("../../img/squad/turbo.svg", import.meta.url).href, alt: "", width: "84", height: "84", loading: "lazy" } });
  kap.append(sayfaUst("Perps Radar", "Where the volume is, across perp DEXes. Updated hourly.", [
    el("a", { sinif: "dugme dugme--sade", attr: { href: "#/perps/targets" }, yazi: "🎯 Target Radar" }),
    el("a", { sinif: "dugme dugme--marka", attr: { href: "#/perps/trade" }, yazi: "Trade Hyperliquid perps here" })]));

  let veri;
  try { veri = await veriOku(); }
  catch (e) {
    kap.append(panel("Venues", maskotBos("turbo", "The radar is not published yet", "The perps file is written every hour. Please check back soon.")));
    kap.append(not(RISK, "uyari"));
    return kap;
  }

  const coins = veri.coins || [];
  const V = veri.venues || {};
  const calisan = Object.values(V).filter((m) => m.vol > 0 && !m.hata);
  const toplam = calisan.reduce((t, m) => t + m.vol, 0);

  kap.append(el("div", { sinif: "pr-ust" }, [turbo, el("p", {}, [
    "For every coin, each perp DEX that lists it, sorted by 24h volume: more volume usually means more liquidity. ",
    el("strong", { yazi: "The radar is read-only." }), " No wallet is needed to compare; a link opens the venue's own site. Hyperliquid can also be traded from this site with your own wallet (",
    el("a", { attr: { href: "#/perps/trade" }, yazi: "Trade here" }), ").",
  ])]));
  kap.append(not(RISK, "uyari"));

  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("24h volume, all venues", dolar(toplam)),
    olcum("Venues", String(calisan.length)),
    olcum("Coins listed", String(coins.length), "with at least " + dolar((veri.birim || {}).esik || 100000) + " 24h volume"),
    olcum("Last updated", veri.guncellendi ? zamanYaz(veri.guncellendi) : "–", "every hour"),
  ]));

  kap.append(panel("Venue leaderboard · 24h volume", mekanTablosu(veri)));

  /* coins: search + list, venues inside each */
  const ara = el("input", { sinif: "girdi pr-ara", attr: { type: "search", placeholder: "Search a coin: BTC, PEPE, HYPE…", "aria-label": "Search a coin", autocomplete: "off", spellcheck: "false" } });
  const liste = el("div", { sinif: "pr-liste" });
  const yok = el("div", { sinif: "pr-yok", attr: { hidden: true }, yazi: "No coin matches. Only coins with at least $100K of 24h perp volume are listed." });
  const dugme = el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Show more" });
  const satirlar = new Map();
  const satir = (x, i) => { if (!satirlar.has(x.c)) satirlar.set(x.c, coinSatiri(veri, x, i + 1)); return satirlar.get(x.c); };
  let gosterilen = SAYFA;
  const yenile = () => {
    const q = ara.value.trim().toUpperCase().replace(/^\$/, "");
    const eslesen = q ? coins.map((x, i) => [x, i]).filter(([x]) => x.c.includes(q)).sort((a, b) => (b[0].c === q) - (a[0].c === q)) : coins.map((x, i) => [x, i]);
    const goster = eslesen.slice(0, q ? 60 : gosterilen);
    liste.replaceChildren(...goster.map(([x, i]) => satir(x, i)));
    if (q && goster.length === 1 || (q && goster[0] && goster[0][0].c === q)) { const d = satir(goster[0][0], goster[0][1]); if (!d.open) d.open = true; }
    yok.hidden = goster.length > 0;
    dugme.style.display = !q && gosterilen < coins.length ? "" : "none";
  };
  ara.addEventListener("input", yenile);
  dugme.addEventListener("click", () => { gosterilen += SAYFA; yenile(); });
  yenile();
  if (!ara.value && coins[0]) satir(coins[0], 0).open = true;

  kap.append(panel("Coins · where each one trades most", el("div", { sinif: "yigin yigin--sik" }, [
    ara,
    el("div", { sinif: "ucuncul", yazi: "Tap a coin to see every venue that lists it, the one with the most volume first. Funding is shown per 8 hours on every venue (hourly rates × 8), positive when longs pay shorts." }),
    liste, yok, dugme,
  ])));

  const hatali = Object.entries(V).filter(([, m]) => m.hata).map(([, m]) => m.ad);
  kap.append(panel("About this data", el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "ikincil", yazi: "Data from each venue's public API; may be delayed. Volumes are each venue's own 24h figure in US dollars; open interest is in dollars at the mark price. Max leverage is the venue's highest for that market (larger positions usually get less); a dash means the venue does not publish it openly." }),
    hatali.length ? not(hatali.join(", ") + " could not be read this hour; " + (hatali.length === 1 ? "it is" : "they are") + " left out of the totals until the next update.", "bilgi") : null,
    ayrinti("Which venues are included?", el("div", { sinif: "ikincil", yazi: Object.values(V).map((m) => m.ad).join(", ") + ". Orderly is an order book shared by many front-end apps, so it has no single trade page." })),
  ])));
  return kap;
}
