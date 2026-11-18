/* ===========================================================================
 * gorunum/formasyon.js — Pattern Hunter (#/perps/patterns)
 *
 * 18 Nov 2026 (owner: "a bot that hunts chart patterns from 1 h to monthly; do all of it"). Shows the live scan
 * of scripts/formasyon-tara.js (veri/formasyon.json, every 2 h: 50 most traded Hyperliquid perps × 1 h, 4 h, 1 d,
 * 1 w, 1 M): fresh breakouts with entry / target / stop, and patterns still forming with the levels to watch.
 * Every card carries its pattern's backtest on its timeframe (rapor/formasyon: 21 coins, Binance history since
 * 2017 + Hyperliquid, first 70% vs last 30%): on 1 d several patterns made money in both halves; on 1 h / 4 h
 * the average was about zero before fees — the page says so on each card.
 * =========================================================================== */

import { el, sayfaUst, panel, not } from "../ui.js";

const STIL =
  ".fh-filtre{display:flex;gap:6px;flex-wrap:wrap}.fh-filtre button[aria-pressed=true]{border-color:var(--marka);color:var(--yazi-1);background:var(--marka-zemin,rgba(124,92,255,.12))}" +
  ".fh-liste{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}" +
  ".fh-kart{border:1px solid var(--cizgi);border-radius:14px;padding:10px 12px;display:grid;gap:8px;min-width:0}" +
  ".fh-ust{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}.fh-ust b{font-size:16px}" +
  ".fh-cip{font-size:11.5px;padding:2px 8px;border-radius:999px;border:1px solid var(--cizgi);white-space:nowrap}.fh-al{color:var(--alis);border-color:var(--alis)}.fh-sat{color:var(--satis);border-color:var(--satis)}.fh-bek{color:#e0a100;border-color:#e0a100}" +
  ".fh-tuval{height:170px;border-radius:10px;overflow:hidden;background:#0a1226}.fh-tuval canvas{width:100%;height:100%;display:block}" +
  ".fh-sev{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:12px;font-variant-numeric:tabular-nums}.fh-sev div{border:1px solid var(--cizgi);border-radius:8px;padding:4px 6px}.fh-sev small{display:block;color:var(--yazi-3);font-size:11px}" +
  ".fh-k{font-size:12px;line-height:1.45;color:var(--yazi-2)}.fh-iyi{border-left:2px solid var(--alis);padding-left:8px}.fh-zayif{border-left:2px solid var(--yazi-3);padding-left:8px}" +
  ".fh-dug{display:flex;gap:6px}.fh-dug a{flex:1}.fh-n{font-size:11.5px;color:var(--yazi-3);line-height:1.45}";

const ZD_AD = { "1h": "1 hour", "4h": "4 hours", "1d": "Daily", "1w": "Weekly", "1M": "Monthly" };
const fiyat = (v) => (v == null ? "–" : "$" + (v >= 1000 ? Math.round(v).toLocaleString("en-US") : v >= 1 ? v.toFixed(v >= 100 ? 2 : 3) : Number(v).toPrecision(4)));

/* the backtest in one line, and whether it is an edge (positive in both halves and > +0.1 R overall with n >= 30) */
function karneYazi(f) {
  const k = f.karne;
  if (!k || !k.tum) return { iyi: false, yazi: "No backtest for this pattern on this timeframe yet." };
  const r = (x) => (x ? (x.ortR >= 0 ? "+" : "") + x.ortR + "R" : "–");
  const iyi = k.tum.n >= 30 && k.tasarim && k.test && k.tasarim.ortR > 0 && k.test.ortR > 0 && k.tum.ortR >= 0.1;
  const az = k.tum.n < 30;
  const bas = "Backtest, " + f.ad.toLowerCase() + " on " + ZD_AD[f.zd].toLowerCase() + " charts: " + k.tum.n + " breakouts since 2017, target first " + Math.round(k.tum.hedef * 100) + "%, stop first " + Math.round(k.tum.stop * 100) + "%, average " + r(k.tum) + " (older 70%: " + r(k.tasarim) + ", recent 30%: " + r(k.test) + ").";
  const son = iyi ? " It made money in both periods." : az ? " Too few cases to judge." : " No reliable edge: treat it as a level to watch, not a signal.";
  return { iyi, yazi: bas + son };
}

function cizim(tuval, f) {
  const k = tuval.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  tuval.width = Math.max(1, Math.round(k.width * dpr)); tuval.height = Math.max(1, Math.round(k.height * dpr));
  const c = tuval.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = k.width, h = k.height, sag = 6, ust = 8, alt = 8;
  const m = f.mum; if (!m || !m.length) return;
  let lo = Infinity, hi = -Infinity;
  for (const x of m) { lo = Math.min(lo, x[3]); hi = Math.max(hi, x[2]); }
  for (const v of [f.hedef, f.stop, f.giris]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = (hi - lo) * 0.05 || hi * 0.01; lo -= pad; hi += pad;
  const ekBar = f.durum === "kirildi" ? Math.max(6, Math.round(m.length * 0.25)) : 3;   // room on the right for the target
  const adim = (w - sag - 4) / (m.length + ekBar);
  const X = (i) => 4 + (i + 0.5) * adim, Y = (v) => ust + (1 - (v - lo) / (hi - lo)) * (h - ust - alt);
  const ti = (t) => { let b = 0; for (let i = 0; i < m.length; i++) if (m[i][0] <= t) b = i; return b; };
  const css = getComputedStyle(document.documentElement);
  const yesil = css.getPropertyValue("--alis").trim() || "#2bd38b", kirmizi = css.getPropertyValue("--satis").trim() || "#ff6b5a";
  c.fillStyle = "#0a1226"; c.fillRect(0, 0, w, h);
  m.forEach((x, i) => {
    const renk = x[4] >= x[1] ? yesil : kirmizi; c.strokeStyle = renk; c.fillStyle = renk; c.globalAlpha = 0.85;
    c.beginPath(); c.moveTo(X(i), Y(x[2])); c.lineTo(X(i), Y(x[3])); c.stroke();
    const y1 = Y(Math.max(x[1], x[4])), y2 = Y(Math.min(x[1], x[4])); c.fillRect(X(i) - adim * 0.32, y1, adim * 0.64, Math.max(1, y2 - y1));
  });
  c.globalAlpha = 1;
  /* the pattern: its pivots joined, and its lines extended */
  const n = (f.noktalar || []).map((p) => ({ i: ti(p[0]), f: p[1], t: p[2] }));
  c.strokeStyle = "#ffc94a"; c.lineWidth = 2; c.shadowColor = "#ffc94a"; c.shadowBlur = 8;
  if (n.length) { c.beginPath(); n.forEach((p, j) => (j ? c.lineTo(X(p.i), Y(p.f)) : c.moveTo(X(p.i), Y(p.f)))); c.stroke(); }
  c.shadowBlur = 0;
  const hat = (a, b, renk) => { if (!a || !b) return; const e = (b.f - a.f) / (b.i - a.i || 1), son = m.length - 1 + ekBar; c.strokeStyle = renk; c.lineWidth = 1.3; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(X(a.i), Y(a.f)); c.lineTo(X(son), Y(a.f + e * (son - a.i))); c.stroke(); c.setLineDash([]); };
  const H = n.filter((p) => p.t === "H"), L = n.filter((p) => p.t === "L");
  if (/Ucgen|Takoz|kanal/.test(f.tur)) { hat(H[H.length - 2], H[H.length - 1], "#38e1ff"); hat(L[L.length - 2], L[L.length - 1], "#38e1ff"); }
  if (/ikili|obo/.test(f.tur)) { const boy = f.tur.startsWith("ikili") ? n[1] : null; if (boy) hat(boy, { i: boy.i + 1, f: boy.f }, "#38e1ff"); if (n.length === 5) hat(n[1], n[3], "#38e1ff"); }
  /* plan levels after the breakout */
  c.font = "600 10px system-ui,sans-serif";
  const seviye = (v, renk, ad) => { if (v == null) return; const y = Y(v); c.strokeStyle = renk; c.lineWidth = 1.2; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(X(m.length - 1 - 3), y); c.lineTo(w - sag, y); c.stroke(); c.setLineDash([]); c.fillStyle = renk; c.fillText(ad, w - sag - 44, y - 3); };
  if (f.durum === "kirildi") { seviye(f.hedef, yesil, "TARGET"); seviye(f.stop, kirmizi, "STOP"); seviye(f.giris, "#ffffff", "ENTRY"); }
  c.fillStyle = "rgba(255,255,255,.5)"; c.fillText(f.coin + " · " + f.zd, 8, 14);
}

function kart(f) {
  const tuval = el("canvas", { attr: { role: "img", "aria-label": f.ad + " on " + f.coin + " " + f.zd } });
  const kn = karneYazi(f);
  const kirildi = f.durum === "kirildi";
  const cip = kirildi ? el("span", { sinif: "fh-cip " + (f.yon > 0 ? "fh-al" : "fh-sat"), yazi: "Breakout " + (f.yon > 0 ? "▲ long" : "▼ short") }) : el("span", { sinif: "fh-cip fh-bek", yazi: "Forming · watch" });
  const zaman = new Date(f.t).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const sev = kirildi
    ? el("div", { sinif: "fh-sev" }, [el("div", {}, [el("small", { yazi: "Entry (close)" }), fiyat(f.giris)]), el("div", {}, [el("small", { yazi: "Target" }), fiyat(f.hedef)]), el("div", {}, [el("small", { yazi: "Stop" }), fiyat(f.stop)])])
    : el("div", { sinif: "fh-sev" }, f.seviyeler && f.seviyeler.boyun != null
      ? [el("div", {}, [el("small", { yazi: "Neckline" }), fiyat(f.seviyeler.boyun)]), el("div", {}, [el("small", { yazi: "Price now" }), fiyat(f.fiyat)]), el("div", {}, [el("small", { yazi: "Breaks" }), f.yon > 0 ? "up" : "down"])]
      : [el("div", {}, [el("small", { yazi: "Upper line" }), fiyat(f.seviyeler && f.seviyeler.ust)]), el("div", {}, [el("small", { yazi: "Price now" }), fiyat(f.fiyat)]), el("div", {}, [el("small", { yazi: "Lower line" }), fiyat(f.seviyeler && f.seviyeler.alt)])]);
  const yon = kirildi ? (f.yon > 0 ? "long" : "short") : null;
  const k = el("div", { sinif: "fh-kart" }, [
    el("div", { sinif: "fh-ust" }, [el("b", { yazi: f.coin }), el("span", { sinif: "fh-n", yazi: f.ad + " · " + ZD_AD[f.zd] }), cip]),
    el("div", { sinif: "fh-tuval" }, [tuval]),
    sev,
    el("div", { sinif: "fh-k " + (kn.iyi ? "fh-iyi" : "fh-zayif"), yazi: (kn.iyi ? "✅ " : "ℹ️ ") + kn.yazi }),
    el("div", { sinif: "fh-n", yazi: (kirildi ? "Broke out on the bar of " : "Seen at ") + zaman + (f.kaynak === "binance" ? " · long history from Binance" : "") }),
    el("div", { sinif: "fh-dug" }, [
      el("a", { sinif: "dugme dugme--alis dugme--kucuk", attr: { href: "#/perps/trade?coin=" + encodeURIComponent(f.coin) + "&aim=long" }, yazi: yon === "long" ? "Aim long ★" : "Aim long" }),
      el("a", { sinif: "dugme dugme--satis dugme--kucuk", attr: { href: "#/perps/trade?coin=" + encodeURIComponent(f.coin) + "&aim=short" }, yazi: yon === "short" ? "Aim short ★" : "Aim short" })]),
  ]);
  requestAnimationFrame(() => cizim(tuval, f));
  return k;
}

export async function ciz() {
  if (!document.getElementById("fh-stil")) document.head.append(el("style", { attr: { id: "fh-stil" }, yazi: STIL }));
  document.title = "Pattern Hunter — ARC PULSE";
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Pattern Hunter", "Classic chart patterns found on the 50 most traded Hyperliquid markets, from 1 hour to monthly charts, every 2 hours. Each card shows how that pattern did in the past.", [
    el("a", { sinif: "dugme dugme--sade", attr: { href: "#/perps/targets" }, yazi: "🎯 Target Radar" }),
    el("a", { sinif: "dugme dugme--marka", attr: { href: "#/perps/trade" }, yazi: "Trade" })]));
  let v = null;
  try { const r = await fetch(new URL("../../veri/formasyon.json", import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000)); if (r.ok) v = await r.json(); } catch (e) { /* below */ }
  if (!v || !Array.isArray(v.formasyonlar)) { kap.append(panel("Patterns", not("The scan is not published yet; it runs every 2 hours.", "bilgi"))); return kap; }
  kap.append(not("What we found testing 12 patterns on 21 coins since 2017: on daily charts several patterns (descending triangle, falling wedge, head and shoulders and its inverse, symmetrical triangle, channel breaks) reached more than they lost in both the older and the recent part of the data. On 1 h and 4 h charts the average was about zero before fees. Weekly and monthly patterns are rare, so their record is thin. Patterns are odds, not promises; nothing here is advice.", "bilgi"));
  let zd = "hepsi", durum = "hepsi";
  const filtre = el("div", { sinif: "fh-filtre" }), filtre2 = el("div", { sinif: "fh-filtre" }), liste = el("div", { sinif: "fh-liste" });
  const say = (z, d) => v.formasyonlar.filter((f) => (z === "hepsi" || f.zd === z) && (d === "hepsi" || f.durum === d)).length;
  const ciz2 = () => {
    filtre.replaceChildren(...[["hepsi", "All"], ["1d", "Daily ✅"], ["1w", "Weekly"], ["1M", "Monthly"], ["4h", "4 hours"], ["1h", "1 hour"]].map(([k, ad]) => el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", "aria-pressed": String(zd === k) }, yazi: ad + " (" + say(k, durum) + ")", on: { click: () => { zd = k; ciz2(); } } })));
    filtre2.replaceChildren(...[["hepsi", "Breakouts and forming"], ["kirildi", "Fresh breakouts"], ["olusuyor", "Forming"]].map(([k, ad]) => el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", "aria-pressed": String(durum === k) }, yazi: ad + " (" + say(zd, k) + ")", on: { click: () => { durum = k; ciz2(); } } })));
    const l = v.formasyonlar.filter((f) => (zd === "hepsi" || f.zd === zd) && (durum === "hepsi" || f.durum === durum));
    liste.replaceChildren(...(l.length ? l.slice(0, 60).map(kart) : [el("div", { sinif: "ikincil", yazi: "No pattern of this kind right now." })]));
  };
  ciz2();
  const yas = Math.max(0, Math.round((Date.now() - Date.parse(v.guncel)) / 60000));
  kap.append(panel("Patterns now", el("div", { sinif: "yigin yigin--sik" }, [filtre, filtre2,
    el("div", { sinif: "fh-n", yazi: v.coinSayisi + " markets scanned " + (yas < 120 ? yas + " min" : Math.round(yas / 60) + " h") + " ago. A breakout is a close through the pattern's line; the target is the classic measured move, the stop is where the pattern is proven wrong. ★ marks the pattern's side. Aim opens the trade page; nothing is sent until you review and sign." }),
    liste])));
  return kap;
}
