/* ===========================================================================
 * gorunum/hl-kask.js — Pulse HUD: the pre-trade check inside the #/perps/trade order form
 *
 * 15 Nov 2026 (owner approved, "do it"). The idea is the F-35 pilot's helmet: not more data, but the
 * data that matters fused into one view at the moment of the decision. Perp DEXes show price, chart
 * and a form; the numbers a trader needs to judge a position are left to other sites or a calculator.
 * This box puts them next to the order button, updated as the form changes:
 *   1. Holding cost   — funding per day for THIS size and side, and the move needed to cover fees in and out
 *   2. Risk vs. noise — liquidation and stop loss distance measured in typical moves (last 7 days of
 *                       Hyperliquid 1 h candles): "a normal day reaches your liquidation" is a threat cue
 *   3. Size by risk   — "I want to lose at most $X at my stop": the size that does that, fees included
 *   4. Other venues   — the same market's funding on Lighter, Aster, Orderly, dYdX, Paradex
 *                       (veri/perps.json, Perps Radar, refreshed hourly)
 *   5. Fill estimate  — spread, book depth and the average fill of a market order of this size (live l2Book)
 *   6. Crowd          — funding vs. its last 7 days, open interest vs. 24 h ago with the price (veri/perps-oi.json)
 *   7. Clock          — next funding, high-impact US events in the next 48 h (veri/takvim.json)
 * Information only, never a buy / sell call and no predictions: past moves and current rates, labelled
 * as such. Public data only (Hyperliquid info API, our own veri/perps.json); nothing about the visitor
 * is stored or sent anywhere.
 * =========================================================================== */

import { el } from "../ui.js";

const STIL =
  ".hud{border:1px solid var(--cizgi);border-radius:12px;padding:10px 12px;display:grid;gap:8px;font-size:13px;background:var(--yuzey-1)}" +
  ".hud__bas{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700;font-size:13.5px}" +
  ".hud__bas small{font-weight:500;color:var(--yazi-3);font-size:11.5px}" +
  ".hud__k{display:grid;gap:3px;padding-top:8px;border-top:1px solid var(--cizgi)}" +
  ".hud>.yigin>div:first-child>.hud__k{border-top:0;padding-top:0}.hud>.yigin>div:empty{display:none}" +
  ".hud__t{font-size:11.5px;color:var(--yazi-3);text-transform:uppercase;letter-spacing:.04em;font-weight:600}" +
  ".hud__s{display:flex;justify-content:space-between;gap:10px}.hud__s>span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}" +
  ".hud__m{line-height:1.45}.hud__m b{font-variant-numeric:tabular-nums}" +
  ".hud--ok{color:var(--alis)}.hud--uyari{color:#e0a100}.hud--tehlike{color:var(--satis);font-weight:600}" +
  ".hud__r{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}.hud__r .girdi{height:38px;font-size:15px}" +
  ".hud__v{width:100%;border-collapse:collapse;font-size:12.5px}.hud__v td{padding:3px 0;font-variant-numeric:tabular-nums;white-space:nowrap}" +
  ".hud__v td:not(:first-child){text-align:right;padding-left:8px}.hud__v tr.hud__biz td{font-weight:700}" +
  ".hud__v a{color:inherit;text-decoration:underline;text-decoration-color:var(--cizgi)}" +
  ".hud__n{font-size:11.5px;color:var(--yazi-3);line-height:1.4}";

const VENUE_AD = { hyperliquid: "Hyperliquid (here)", lighter: "Lighter", aster: "Aster", orderly: "Orderly", dydx: "dYdX", paradex: "Paradex" };

/* ---- data: volatility from 1 h candles (cached per coin, 15 min) and the Perps Radar file ---- */
const _oyn = new Map();
export function oynaklik(hl, coin) {
  const x = _oyn.get(coin);
  if (x && Date.now() - x.t < 900000) return x.p;
  const p = hl.mumlar(coin, "1h", 7 * 864e5).then((m) => {
    const k = (m || []).map((c) => Number(c.c)).filter((v) => v > 0);
    if (k.length < 48) return null;
    const r = [];
    for (let i = 1; i < k.length; i++) r.push(Math.log(k[i] / k[i - 1]));
    const ort = r.reduce((a, b) => a + b, 0) / r.length;
    const sh = Math.sqrt(r.reduce((a, b) => a + (b - ort) ** 2, 0) / (r.length - 1));
    /* the biggest 24 h drop and rise inside the window, close to close */
    let dusus = 0, yukselis = 0;
    for (let i = 24; i < k.length; i++) { const d = k[i] / k[i - 24] - 1; if (d < dusus) dusus = d; if (d > yukselis) yukselis = d; }
    return { saat: sh, gun: sh * Math.sqrt(24), dusus, yukselis, n: k.length };
  }).catch(() => null);
  _oyn.set(coin, { t: Date.now(), p });
  return p;
}
let _radar = null;
function radar() {
  if (_radar && Date.now() - _radar.t < 600000) return _radar.p;
  const url = new URL("../../veri/perps.json", import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000);
  const p = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  _radar = { t: Date.now(), p };
  return p;
}

/* our hourly files (scripts/perps-baglam.js): Hyperliquid OI history and high-impact US events */
const _dosya = new Map();
function dosya(ad, ms) {
  const x = _dosya.get(ad);
  if (x && Date.now() - x.t < ms) return x.p;
  const url = new URL("../../veri/" + ad, import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000);
  const p = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  _dosya.set(ad, { t: Date.now(), p });
  return p;
}
/* Hyperliquid funding history of the last 7 days (hourly rates), cached per coin for 15 min */
const _fon = new Map();
function fonGecmis(hl, coin) {
  const x = _fon.get(coin);
  if (x && Date.now() - x.t < 900000) return x.p;
  const p = hl.bilgi({ type: "fundingHistory", coin, startTime: Date.now() - 7 * 864e5 }).then((l) => (l || []).map((y) => Number(y.fundingRate)).filter(isFinite)).catch(() => null);
  _fon.set(coin, { t: Date.now(), p });
  return p;
}
/* the order book (20 levels a side), at most every 4 s */
const _kitap = new Map();
function kitap(hl, coin) {
  const x = _kitap.get(coin);
  if (x && Date.now() - x.t < 4000) return x.p;
  const p = hl.bilgi({ type: "l2Book", coin }).then((k) => ({ alis: (k.levels[0] || []).map((l) => [Number(l.px), Number(l.sz)]), satis: (k.levels[1] || []).map((l) => [Number(l.px), Number(l.sz)]) })).catch(() => null);
  _kitap.set(coin, { t: Date.now(), p });
  return p;
}
const sure = (ms) => { const d = Math.round(ms / 60000); return d < 60 ? d + " min" : (Math.floor(d / 60) + " h " + (d % 60 ? (d % 60) + " min" : "")).trim(); };

/**
 * The Pulse HUD box. `araclar` = { hl, usd, fiyat, boyutKoy(usd) } from the trade page.
 * guncelle({ P, t, H }) redraws it from the market P, the form's current draft t and the account H.
 */
export function kaskPaneli({ hl, usd, fiyat, boyutKoy }) {
  if (!document.getElementById("hud-stil")) document.head.append(el("style", { attr: { id: "hud-stil" }, yazi: STIL }));
  const govde = el("div", { sinif: "yigin yigin--sik" });
  const kutu = el("div", { sinif: "hud", attr: { "aria-label": "Pulse HUD, pre-trade check" } }, [
    el("div", { sinif: "hud__bas" }, [el("span", { yazi: "Pulse HUD · pre-trade check" }), el("small", { yazi: "info, not advice" })]),
    govde,
  ]);
  const riskGirdi = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "Max loss at your stop, e.g. 20", "aria-label": "Max loss in USD at the stop loss" } });
  const riskDug = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", disabled: true }, yazi: "Use size" });
  const riskSonuc = el("div", { sinif: "hud__m" });
  let oneri = null;
  riskDug.addEventListener("click", () => { if (oneri > 0) boyutKoy(oneri); });
  /* fixed slots: the risk input is never moved, so typing in it is not interrupted by a redraw */
  const yuva = { tutma: el("div"), dolum: el("div"), risk: el("div"), kalabalik: el("div"), saat: el("div"), diger: el("div") };
  let riskKume = null;
  let son = null, sira = 0;
  riskGirdi.addEventListener("input", () => son && ciz(son));

  const yz = (x, d = 2) => (x == null || !isFinite(x) ? "–" : (x * 100).toFixed(d) + "%");
  const s = (a, b, sinif = "") => el("div", { sinif: "hud__s" }, [el("span", { yazi: a }), el("span", { sinif, yazi: b })]);
  const kume = (baslik, ...icerik) => el("div", { sinif: "hud__k" }, [el("div", { sinif: "hud__t", yazi: baslik }), ...icerik.filter(Boolean)]);
  const m = (parcalar, sinif = "") => el("div", { sinif: "hud__m " + sinif }, parcalar.map((p) => (typeof p === "string" ? p : el("b", { yazi: p.b }))));

  async function ciz({ P, t, H }) {
    const no = ++sira;
    const [o, r, fg, oiD, tk, kb] = await Promise.all([oynaklik(hl, P.ad), radar(), fonGecmis(hl, P.ad), dosya("perps-oi.json", 600000), dosya("takvim.json", 1800000), kitap(hl, P.ad)]);
    if (no !== sira) return;   // a newer draw started
    const ref = t && t.ref > 0 ? t.ref : (P.mid || P.mark);
    const alis = t ? t.alis : true;
    const deger = t && t.gercekUsd > 0 ? t.gercekUsd : null;
    const alici = t && t.alici != null ? t.alici : (H ? H.alici : 0.00045);
    const yapici = t && t.yapici != null ? t.yapici : (H ? H.yapici : 0.00015);
    const koy = {};   // slot name -> its group (or nothing)

    /* 1. holding cost */
    const fonSaat = Number(P.fon) || 0;                       // hourly rate, positive: longs pay shorts
    const odersin = alis ? fonSaat > 0 : fonSaat < 0;
    const gunluk = deger ? deger * Math.abs(fonSaat) * 24 : null;
    const giris = t && t.limit ? yapici : alici;
    const gidisDonus = giris + alici + 2 * hl.BUILDER_ORAN;    // in (maker if a limit rests) + market out, both with our fee
    const baPx = ref * (alis ? 1 + gidisDonus : 1 - gidisDonus);
    koy.tutma = (kume("Holding cost",
      s("Funding now (hourly)", (fonSaat >= 0 ? "longs pay shorts " : "shorts pay longs ") + yz(Math.abs(fonSaat), 4)),
      s(deger ? "This " + (alis ? "long" : "short") + " " + (fonSaat === 0 ? "pays" : odersin ? "pays" : "receives") + " per day" : "Per $1,000 per day", fonSaat === 0 ? "$0" : (odersin ? "≈ " : "≈ +") + usd(gunluk != null ? gunluk : 1000 * Math.abs(fonSaat) * 24, 4), odersin ? "hud--uyari" : "hud--ok"),
      s("Break-even after fees in and out", yz(gidisDonus, 3) + " → " + fiyat(baPx)),
      el("div", { sinif: "hud__n", yazi: "Funding changes every hour; this uses the current rate. Fees: Hyperliquid's for your tier + ARC PULSE 0.05%, each way" + (t && t.limit ? " (maker in if the limit rests)." : ".") }),
    ));

    /* 2. risk vs. normal moves */
    if (o) {
      const satirlar = [s("Typical move (last 7 days)", "±" + yz(o.saat) + " / hour · ±" + yz(o.gun) + " / day")];
      const kotu = alis ? o.dusus : o.yukselis;               // the worst 24 h move against this side in the window
      satirlar.push(s("Worst 24 h move against a " + (alis ? "long" : "short"), yz(kotu)));
      /* no wallet connected: the page has no account value, so show the liquidation as if isolated */
      let liq = t && t.liq > 0 ? t.liq : null, izoleVarsayim = false;
      if (!liq && !H && t && deger && !t.azalt) { liq = hl.liqTahmin({ px: ref, boyut: Number(t.boyut), alis, kal: t.kal, capraz: false, hesapDegeri: deger / t.kal, maxKal: P.maxKal }); izoleVarsayim = liq > 0; }
      if (liq > 0) {
        const mesafe = Math.abs(liq - ref) / ref, kat = mesafe / o.gun;
        let tur = kat < 1 || mesafe <= Math.abs(kotu) ? "hud--tehlike" : kat < 2 ? "hud--uyari" : "hud--ok";
        /* a stop loss between the price and the liquidation closes the position first */
        const slOnce = t && t.sl > 0 && (alis ? t.sl > liq : t.sl < liq);
        if (slOnce && tur === "hud--tehlike") tur = "hud--uyari";
        satirlar.push(m(["Liquidation ≈ ", { b: fiyat(liq) }, ", " + yz(mesafe) + " away = ", { b: kat.toFixed(1) + "×" }, " a typical day's move" + (izoleVarsayim ? " (as isolated; connect a wallet for your account)" : "") + ". " +
          (tur === "hud--tehlike" ? (mesafe <= Math.abs(kotu) ? "A move like the worst day of the last week would liquidate it." : "A normal day's move can reach it.") : tur === "hud--uyari" ? "A bigger-than-usual day can reach it." : "Outside the moves of a normal day.") + (slOnce ? " Your stop loss (" + fiyat(t.sl) + ") comes first." : "")], tur));
      } else if (H && t && !t.azalt && deger) satirlar.push(m(["No liquidation price at this size and leverage (the account covers it)."], "hud--ok"));
      if (t && t.sl > 0) {
        const d = Math.abs(t.sl - ref) / ref, kat = d / o.saat;
        const tur = kat < 1 ? "hud--tehlike" : kat < 2 ? "hud--uyari" : "hud--ok";
        satirlar.push(m(["Stop loss ", { b: yz(d) }, " away = ", { b: kat.toFixed(1) + "×" }, " a typical hour. " +
          (tur === "hud--tehlike" ? "Inside normal hourly noise: it may be hit without a real trend change." : tur === "hud--uyari" ? "Close to normal noise." : "Outside normal hourly noise.")], tur));
      }
      koy.risk = (kume("Risk vs. normal moves", ...satirlar,
        el("div", { sinif: "hud__n", yazi: "From Hyperliquid's 1 h closes over the last 7 days (" + o.n + " candles). Past moves, not a forecast." })));
    }

    /* 3. size by risk */
    const maks = Number(String(riskGirdi.value || "").replace(/[$,\s]/g, ""));
    oneri = null; riskDug.disabled = true;
    if (t && t.sl > 0) {
      const d = Math.abs(t.sl - ref) / ref;
      /* a stop loss fills as a market order: count its slippage loosely as one more taker fee */
      const kayip = d + giris + alici + 2 * hl.BUILDER_ORAN + alici;
      if (maks > 0) {
        oneri = Math.floor((maks / kayip) * 100) / 100;
        const ust = H ? H.cekilebilir * (t.kal || 1) : null;
        riskSonuc.replaceChildren(...m(["To lose at most ", { b: usd(maks) }, " if the stop at " + fiyat(t.sl) + " fills, the size is about ", { b: usd(oneri) },
          (ust != null && oneri > ust ? " (more than your margin allows at " + t.kal + "×: " + usd(ust) + ")" : "") + ". Fees included."]).childNodes);
        riskDug.disabled = !(oneri >= hl.EN_AZ_USD);
        if (oneri < hl.EN_AZ_USD) riskSonuc.append(" Below Hyperliquid's $" + hl.EN_AZ_USD + " minimum.");
      } else riskSonuc.textContent = "Enter the most you are willing to lose; the size is worked out from your stop loss (" + fiyat(t.sl) + ", " + yz(d) + " away).";
    } else riskSonuc.textContent = "Add a stop loss above (Add take profit / stop loss), then enter the most you are willing to lose.";
    if (!riskKume) riskKume = kume("Size by risk", el("div", { sinif: "hud__r" }, [riskGirdi, riskDug]), riskSonuc);

    /* 4. the same market on other venues */
    const c = r && (r.coins || []).find((x) => x.c === P.ad);
    if (c && c.ve && c.ve.length > 1) {
      const hlF = fonSaat * 8 * 100;                           // the live rate here, % per 8 h like the file
      const ss = c.ve.map((v) => ({ ...v, f: v.v === "hyperliquid" ? hlF : v.f, p: v.v === "hyperliquid" ? (P.mid || P.mark) : v.p })).filter((v) => v.f != null);
      /* cheapest for this side: a long wants the lowest funding, a short the highest */
      const sirali = ss.slice().sort((a, b) => (alis ? a.f - b.f : b.f - a.f));
      const en = sirali[0];
      const fark = en && en.v !== "hyperliquid" ? Math.abs(en.f - hlF) / 100 / 8 * 24 : 0;   // per day, as a fraction
      const tablo = el("table", { sinif: "hud__v" }, [el("tbody", {}, sirali.map((v) => {
        const tpl = r.venues && r.venues[v.v] && r.venues[v.v].url;
        const ad = VENUE_AD[v.v] || v.v;
        return el("tr", { sinif: v.v === "hyperliquid" ? "hud__biz" : "" }, [
          el("td", {}, [tpl && v.v !== "hyperliquid" ? el("a", { attr: { href: tpl.replace("{s}", encodeURIComponent(v.s || c.c)), target: "_blank", rel: "noopener noreferrer" }, yazi: ad }) : ad]),
          el("td", { yazi: (v.f > 0 ? "+" : "") + v.f.toFixed(4) + "%/8h" }),
        ]);
      }))]);
      const ozet = en && en.v !== "hyperliquid" && deger && fark * deger >= 0.01
        ? m(["For a " + (alis ? "long" : "short") + ", funding is lowest-cost on ", { b: VENUE_AD[en.v] || en.v }, " right now: about ", { b: usd(fark * deger, 2) }, " a day less at this size than here."])
        : m([en && en.v === "hyperliquid" ? "Hyperliquid has the lowest-cost funding for a " + (alis ? "long" : "short") + " right now." : "Funding is close across venues right now."], en && en.v === "hyperliquid" ? "hud--ok" : "");
      const yas = r.guncellendi ? Math.max(0, Math.round((Date.now() - Date.parse(r.guncellendi)) / 60000)) : null;
      koy.diger = (kume("Same market elsewhere", ozet, tablo,
        el("div", { sinif: "hud__n", yazi: "Funding per 8 h (negative: shorts pay longs). Other venues from Perps Radar" + (yas != null ? ", " + yas + " min ago" : "") + "; their fees and rules differ. Hyperliquid here is live." })));
    }

    /* 5. fill estimate: walk the book for a market order of this size */
    const mid = P.mid || P.mark;
    if (kb && kb.alis.length && kb.satis.length) {
      const taraf = alis ? kb.satis : kb.alis;
      const yayilma = (kb.satis[0][0] - kb.alis[0][0]) / mid;
      const derinlik = taraf.filter(([px]) => Math.abs(px / mid - 1) <= 0.001).reduce((a, [px, sz]) => a + px * sz, 0);
      const satirlar = [s("Spread", yz(yayilma, 3)), s("Book within 0.1% on the " + (alis ? "ask" : "bid") + " side", usd(derinlik, 0))];
      if (deger && !(t && t.limit)) {
        let kalan = deger, adet = 0, harcanan = 0;
        for (const [px, sz] of taraf) { const al = Math.min(kalan, px * sz); adet += al / px; harcanan += al; kalan -= al; if (kalan <= 1e-9) break; }
        if (kalan > 1e-6) satirlar.push(m(["This size is bigger than the visible book (20 levels, " + usd(harcanan, 0) + "): expect real slippage; a limit order or a smaller size may fill better."], "hud--tehlike"));
        else {
          const ort = harcanan / adet, kayma = Math.abs(ort / mid - 1);
          satirlar.push(m(["A market " + (alis ? "buy" : "sell") + " of " + usd(deger, 0) + " fills around ", { b: fiyat(ort) }, " = ", { b: yz(kayma, 3) }, " from the mid" + (kayma > 0.002 ? ": a limit order may fill better." : ".")], kayma > 0.005 ? "hud--tehlike" : kayma > 0.002 ? "hud--uyari" : "hud--ok"));
        }
      } else if (t && t.limit) satirlar.push(m(["A limit order that rests on the book has no slippage (and pays the lower maker fee)."], "hud--ok"));
      koy.dolum = kume("Fill estimate", ...satirlar, el("div", { sinif: "hud__n", yazi: "From Hyperliquid's live order book just now; it changes every second." }));
    }

    /* 6. crowd: funding vs. the last 7 days, open interest vs. 24 h ago */
    {
      const satirlar = [];
      if (fg && fg.length >= 24) {
        const ort = fg.reduce((a, b) => a + b, 0) / fg.length;
        const yuzdelik = fg.filter((x) => x < fonSaat).length / fg.length;
        let yazi, tur = "";
        if (yuzdelik >= 0.8 && fonSaat > 0) { yazi = "Funding is higher than " + Math.round(yuzdelik * 100) + "% of the last 7 days: longs are paying more than usual (the long side is busy)."; tur = alis ? "hud--uyari" : ""; }
        else if (yuzdelik <= 0.2) { yazi = "Funding is lower than " + Math.round((1 - yuzdelik) * 100) + "% of the last 7 days" + (fonSaat < 0 ? ": shorts are paying longs (the short side is busy)." : ": the long side is quieter than usual."); tur = !alis && fonSaat < 0 ? "hud--uyari" : ""; }
        else yazi = "Funding is in its usual range for the last 7 days.";
        satirlar.push(s("Funding 7-day average (hourly)", yz(ort, 4)), m([yazi], tur));
      }
      const seri = oiD && oiD.c && oiD.c[P.ad];
      const simdiOi = P.mark > 0 ? P.oi / P.mark : null;
      let onceIdx = -1;
      if (seri && oiD.t) for (let i = 0; i < oiD.t.length; i++) if (oiD.t[i] <= Date.now() - 23.5 * 3600e3 && seri[i]) onceIdx = i;
      if (onceIdx >= 0 && simdiOi > 0) {
        const oiDeg = simdiOi / seri[onceIdx][0] - 1, fiyDeg = P.dun > 0 ? P.mark / P.dun - 1 : 0;
        const saatOnce = Math.round((Date.now() - oiD.t[onceIdx]) / 3600e3);
        let yorum;
        if (Math.abs(oiDeg) < 0.02) yorum = "Open interest is about flat: no big wave of positions opening or closing.";
        else if (oiDeg > 0) yorum = fiyDeg >= 0 ? "New positions are opening while the price rises: mostly longs entering." : "New positions are opening while the price falls: mostly shorts entering.";
        else yorum = fiyDeg >= 0 ? "Positions are closing while the price rises: mostly shorts leaving." : "Positions are closing while the price falls: mostly longs leaving.";
        satirlar.push(s("Open interest vs. " + saatOnce + " h ago", (oiDeg > 0 ? "+" : "") + yz(oiDeg, 1) + " · price " + (fiyDeg > 0 ? "+" : "") + yz(fiyDeg, 1)), m([yorum]));
      } else {
        const saatler = oiD && oiD.t ? oiD.t.length : 0;
        satirlar.push(s("Open interest now", usd(P.oi, 0)), el("div", { sinif: "hud__n", yazi: "The 24 h open interest change appears once there is a day of hourly readings (" + Math.min(saatler, 24) + " of 24 so far)." }));
      }
      koy.kalabalik = kume("Crowd", ...satirlar, el("div", { sinif: "hud__n", yazi: "Hyperliquid funding history and open interest. Describes what traders did, not what the price will do." }));
    }

    /* 7. clock: the next funding and high-impact US events */
    {
      const simdi = Date.now();
      const sonraki = Math.ceil(simdi / 3600e3) * 3600e3;
      const satirlar = [s("Next funding payment", "in " + sure(sonraki - simdi) + " (hourly)")];
      const olay = tk && Array.isArray(tk.olaylar) ? tk.olaylar.map((x) => ({ ...x, z: Date.parse(x.t) })).filter((x) => x.z > simdi - 3600e3 && x.z < simdi + 48 * 3600e3).sort((a, b) => a.z - b.z)
        /* releases at the same minute (e.g. retail sales and core retail sales) are one line */
        .reduce((l, x) => { const o = l[l.length - 1]; if (o && o.z === x.z) o.ad += " / " + x.ad; else l.push({ ...x }); return l; }, []) : null;
      if (olay && olay.length) {
        for (const x of olay.slice(0, 3)) {
          const once = x.z <= simdi, yakin = !once && x.z - simdi < 3 * 3600e3;
          const saatYazi = new Date(x.z).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" });
          satirlar.push(m(["US ", { b: x.ad }, once ? " was released " + sure(simdi - x.z) + " ago: prices can still be moving." : " in " + sure(x.z - simdi) + " (" + saatYazi + ")" + (yakin ? ": prices often jump around these releases, so stops and liquidations get hit more." : ".")], once || yakin ? "hud--uyari" : ""));
        }
      } else if (olay) satirlar.push(m(["No high-impact US economic event in the next 48 hours."], "hud--ok"));
      koy.saat = kume("Clock", ...satirlar, olay ? el("div", { sinif: "hud__n", yazi: "High-impact US events (inflation, jobs, Fed) from the Forex Factory calendar, in your local time." }) : null);
    }

    if (!govde.childNodes.length) govde.append(yuva.tutma, yuva.dolum, yuva.risk, yuva.kalabalik, yuva.saat, riskKume, yuva.diger);
    for (const [ad, y] of Object.entries(yuva)) y.replaceChildren(...(koy[ad] ? [koy[ad]] : []));
  }

  return {
    kutu,
    guncelle(x) { son = x; ciz(x).catch(() => { /* the form works without the HUD */ }); },
  };
}
