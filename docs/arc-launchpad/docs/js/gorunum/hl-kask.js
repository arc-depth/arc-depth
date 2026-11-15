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
 *   4. Other venues   — the same market's funding and price on Lighter, Aster, Orderly, dYdX, Paradex
 *                       (veri/perps.json, Perps Radar, refreshed hourly)
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
  ".hud>.yigin>div:first-child>.hud__k{border-top:0;padding-top:0}" +
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
function oynaklik(hl, coin) {
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
  const yuva = [el("div"), el("div"), el("div")];
  let riskKume = null;
  let son = null, sira = 0;
  riskGirdi.addEventListener("input", () => son && ciz(son));

  const yz = (x, d = 2) => (x == null || !isFinite(x) ? "–" : (x * 100).toFixed(d) + "%");
  const s = (a, b, sinif = "") => el("div", { sinif: "hud__s" }, [el("span", { yazi: a }), el("span", { sinif, yazi: b })]);
  const kume = (baslik, ...icerik) => el("div", { sinif: "hud__k" }, [el("div", { sinif: "hud__t", yazi: baslik }), ...icerik.filter(Boolean)]);
  const m = (parcalar, sinif = "") => el("div", { sinif: "hud__m " + sinif }, parcalar.map((p) => (typeof p === "string" ? p : el("b", { yazi: p.b }))));

  async function ciz({ P, t, H }) {
    const no = ++sira;
    const [o, r] = await Promise.all([oynaklik(hl, P.ad), radar()]);
    if (no !== sira) return;   // a newer draw started
    const ref = t && t.ref > 0 ? t.ref : (P.mid || P.mark);
    const alis = t ? t.alis : true;
    const deger = t && t.gercekUsd > 0 ? t.gercekUsd : null;
    const alici = t && t.alici != null ? t.alici : (H ? H.alici : 0.00045);
    const yapici = t && t.yapici != null ? t.yapici : (H ? H.yapici : 0.00015);
    const parcalar = [];   // [holding, risk, venues]

    /* 1. holding cost */
    const fonSaat = Number(P.fon) || 0;                       // hourly rate, positive: longs pay shorts
    const odersin = alis ? fonSaat > 0 : fonSaat < 0;
    const gunluk = deger ? deger * Math.abs(fonSaat) * 24 : null;
    const giris = t && t.limit ? yapici : alici;
    const gidisDonus = giris + alici + 2 * hl.BUILDER_ORAN;    // in (maker if a limit rests) + market out, both with our fee
    const baPx = ref * (alis ? 1 + gidisDonus : 1 - gidisDonus);
    parcalar.push(kume("Holding cost",
      s("Funding now (hourly)", (fonSaat >= 0 ? "longs pay shorts " : "shorts pay longs ") + yz(Math.abs(fonSaat), 4)),
      s(deger ? "This " + (alis ? "long" : "short") + " " + (fonSaat === 0 ? "pays" : odersin ? "pays" : "receives") + " per day" : "Per $1,000 per day", fonSaat === 0 ? "$0" : (odersin ? "≈ " : "≈ +") + usd(gunluk != null ? gunluk : 1000 * Math.abs(fonSaat) * 24, 4), odersin ? "hud--uyari" : "hud--ok"),
      s("Break-even after fees in and out", yz(gidisDonus, 3) + " → " + fiyat(baPx)),
      el("div", { sinif: "hud__n", yazi: "Funding changes every hour; this uses the current rate. Fees: Hyperliquid's for your tier + ARC PULSE 0.05%, each way" + (t && t.limit ? " (maker in if the limit rests)." : ".") }),
    ));

    /* 2. risk vs. normal moves */
    if (!o) parcalar.push(null);
    if (o) {
      const satirlar = [s("Typical move (last 7 days)", "±" + yz(o.saat) + " / hour · ±" + yz(o.gun) + " / day")];
      const kotu = alis ? o.dusus : o.yukselis;               // the worst 24 h move against this side in the window
      satirlar.push(s("Worst 24 h move against a " + (alis ? "long" : "short"), yz(kotu)));
      /* no wallet connected: the page has no account value, so show the liquidation as if isolated */
      let liq = t && t.liq > 0 ? t.liq : null, izoleVarsayim = false;
      if (!liq && !H && t && deger && !t.azalt) { liq = hl.liqTahmin({ px: ref, boyut: Number(t.boyut), alis, kal: t.kal, capraz: false, hesapDegeri: deger / t.kal, maxKal: P.maxKal }); izoleVarsayim = liq > 0; }
      if (liq > 0) {
        const mesafe = Math.abs(liq - ref) / ref, kat = mesafe / o.gun;
        const tur = kat < 1 || mesafe <= Math.abs(kotu) ? "hud--tehlike" : kat < 2 ? "hud--uyari" : "hud--ok";
        satirlar.push(m(["Liquidation ≈ ", { b: fiyat(liq) }, ", " + yz(mesafe) + " away = ", { b: kat.toFixed(1) + "×" }, " a typical day's move" + (izoleVarsayim ? " (as isolated; connect a wallet for your account)" : "") + ". " +
          (tur === "hud--tehlike" ? (mesafe <= Math.abs(kotu) ? "A move like the worst day of the last week would liquidate it." : "A normal day's move can reach it.") : tur === "hud--uyari" ? "A bigger-than-usual day can reach it." : "Outside the moves of a normal day.")], tur));
      } else if (H && t && !t.azalt && deger) satirlar.push(m(["No liquidation price at this size and leverage (the account covers it)."], "hud--ok"));
      if (t && t.sl > 0) {
        const d = Math.abs(t.sl - ref) / ref, kat = d / o.saat;
        const tur = kat < 1 ? "hud--tehlike" : kat < 2 ? "hud--uyari" : "hud--ok";
        satirlar.push(m(["Stop loss ", { b: yz(d) }, " away = ", { b: kat.toFixed(1) + "×" }, " a typical hour. " +
          (tur === "hud--tehlike" ? "Inside normal hourly noise: it may be hit without a real trend change." : tur === "hud--uyari" ? "Close to normal noise." : "Outside normal hourly noise.")], tur));
      }
      parcalar.push(kume("Risk vs. normal moves", ...satirlar,
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
      parcalar.push(kume("Same market elsewhere", ozet, tablo,
        el("div", { sinif: "hud__n", yazi: "Funding per 8 h (negative: shorts pay longs). Other venues from Perps Radar" + (yas != null ? ", " + yas + " min ago" : "") + "; their fees and rules differ. Hyperliquid here is live." })));
    }

    if (parcalar.length < 3) parcalar.push(null);
    if (!govde.childNodes.length) govde.append(yuva[0], yuva[1], riskKume, yuva[2]);
    parcalar.forEach((p, i) => yuva[i].replaceChildren(...(p ? [p] : [])));
  }

  return {
    kutu,
    guncelle(x) { son = x; ciz(x).catch(() => { /* the form works without the HUD */ }); },
  };
}
