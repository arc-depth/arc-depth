/* ===========================================================================
 * gorunum/hl-trade.js — Trade Hyperliquid perps here (#/perps/trade, #/perps/trade?coin=BTC)
 *
 * 15 Nov 2026 (owner approved). Reached from Perps Radar (gorunum/perps.js hands this route over).
 * Orders go to Hyperliquid's own order book, signed by the visitor's own wallet (hl.js); funds stay
 * in the visitor's own Hyperliquid account. Nothing about the visitor is stored anywhere: the only
 * thing this page keeps is the risk tick, in this browser's localStorage.
 *
 * Every order carries the ARC PULSE builder code (0.05%, see hl.js for the fee policy and the
 * 40 / 30 / 20 / 10 split). The visitor approves it once and can revoke it from the account panel.
 *
 * v2 (15 Nov 2026): TP/SL with an order (normalTpsl) and on a position (positionTpsl), modify an open
 * limit order, deposit from any EVM chain through relay.link and withdraw to Arbitrum (hl-para.js),
 * fills and funding history (hl-gecmis.js), approximate liquidation price in the preview, account
 * refresh every 10 s while the tab is visible. Main order book only (no HIP-3 markets).
 *
 * Trading key (owner approved 15 Nov 2026): "Enable trading" also creates a key on this device that the
 * main wallet approves once (approveAgent); orders, cancels and leverage are then signed with it, no
 * popup (hl.js). Declining it falls back to signing each action in the wallet.
 *
 * Debug: #/perps/trade?coin=BTC&as=0x... shows that address's account, read-only (no signing).
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum, ayrinti } from "../ui.js";
import * as hl from "../hl.js";
import { paraPaneli } from "./hl-para.js";
import { gecmisPaneli } from "./hl-gecmis.js";

const RISK = "Perpetual futures use leverage and can lose more than you expect quickly. You can lose more than you deposit quickly with leverage. " +
  "ARC PULSE does not run Hyperliquid: orders placed here go to Hyperliquid's order book, signed by your own wallet, and your funds stay in your own Hyperliquid account. Not available where perps are restricted.";
const ONAY_METIN = "ARC PULSE adds a 0.05% fee to each trade you place here, on top of Hyperliquid's fee. You can revoke it anytime.";
const AJAN_METIN = "A trading key is created on this device. It can place and cancel orders for your account but cannot withdraw or transfer funds. You can remove it anytime here or on Hyperliquid.";
const RISK_ANAHTAR = "hl-risk-onay-v1";
const HL_APP = "https://app.hyperliquid.xyz";

const STIL =
  ".hl-ust{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:12px;align-items:end}" +
  ".hl-ust select{width:100%;height:46px;font-size:16px;font-weight:700}" +
  ".hl-olc{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}" +
  ".hl-olc>div{border:1px solid var(--cizgi);border-radius:12px;padding:8px 10px;background:var(--yuzey-1);min-width:0}" +
  ".hl-olc b{display:block;font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hl-olc small{font-size:11.5px;color:var(--yazi-3)}" +
  ".hl-art{color:var(--alis)}.hl-eks{color:var(--satis)}" +
  ".hl-izgara{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr);grid-template-areas:'g f' 'h f';grid-template-rows:auto 1fr;gap:16px;align-items:start}" +
  ".hl-izgara>.hl-g{grid-area:g}.hl-izgara>.hl-f{grid-area:f}.hl-izgara>.hl-h{grid-area:h}" +
  ".hl-izgara [hidden],.hl-grafik [hidden],.hl-para [hidden]{display:none!important}" +
  ".hl-para-izgara{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}.hl-para select{height:44px}" +
  ".hl-grafik{position:relative;height:240px}.hl-grafik canvas{width:100%;height:100%;display:block}" +
  ".hl-grafik__bos{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--yazi-3);font-size:13px}" +
  ".hl-aralik{display:flex;gap:6px}.hl-aralik button[aria-pressed=true],.hl-tur button[aria-pressed=true]{border-color:var(--marka);color:var(--yazi-1);background:var(--marka-zemin,rgba(124,92,255,.12))}" +
  ".hl-sec{display:grid;grid-template-columns:1fr 1fr;gap:8px}.hl-sec button{min-height:42px}" +
  ".hl-yon button[aria-pressed=false]{background:transparent;color:var(--yazi-2);border-color:var(--cizgi)}" +
  ".hl-alan{display:grid;gap:4px}.hl-alan label{font-size:12.5px;color:var(--yazi-3)}.hl-alan .girdi{height:44px;font-size:16px}" +
  ".hl-ipucu{font-size:12.5px;color:var(--yazi-3);font-variant-numeric:tabular-nums}" +
  ".hl-kal{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.hl-kal input[type=range]{width:100%}.hl-kal b{min-width:44px;text-align:right}" +
  ".hl-kutu{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;line-height:1.45}.hl-kutu input{margin-top:3px;width:18px;height:18px;flex:none}" +
  ".hl-ucret{border:1px solid var(--cizgi);border-radius:12px;padding:10px 12px;display:grid;gap:4px;font-size:13px;background:var(--yuzey-1)}" +
  ".hl-ucret div{display:flex;justify-content:space-between;gap:10px}.hl-ucret span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}" +
  ".hl-ucret .hl-top{border-top:1px solid var(--cizgi);padding-top:4px;font-weight:700}" +
  ".hl-onizle{border:1px solid var(--marka);border-radius:14px;padding:12px;display:grid;gap:10px}" +
  ".hl-durum{font-size:13.5px;min-height:1.2em}.hl-durum.hl-eks{font-weight:600}" +
  ".hl-tablo{width:100%;border-collapse:collapse}.hl-tablo th{font-size:12px;color:var(--yazi-3);text-align:left;padding:6px;border-bottom:1px solid var(--cizgi);white-space:nowrap;font-weight:600}" +
  ".hl-tablo td{font-size:13.5px;padding:8px 6px;border-bottom:1px solid var(--cizgi);font-variant-numeric:tabular-nums;white-space:nowrap}.hl-tablo .sayi{text-align:right}" +
  ".hl-sarmal{overflow-x:auto}" +
  ".hl-bag{display:flex;flex-wrap:wrap;gap:8px}" +
  "@media (max-width:900px){.hl-izgara{grid-template-columns:minmax(0,1fr);grid-template-areas:'g' 'f' 'h'}.hl-olc{grid-template-columns:repeat(3,minmax(0,1fr))}}" +
  "@media (max-width:640px){.hl-para-izgara{grid-template-columns:minmax(0,1fr)}.hl-ust{grid-template-columns:minmax(0,1fr)}.hl-olc{grid-template-columns:repeat(2,minmax(0,1fr))}" +
  ".hl-tablo thead{display:none}.hl-tablo,.hl-tablo tbody,.hl-tablo tr,.hl-tablo td{display:block;width:100%}" +
  ".hl-tablo tr{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;padding:10px;border:1px solid var(--cizgi);border-radius:12px;margin-top:8px}" +
  ".hl-tablo td{border:0;padding:0;text-align:left!important;white-space:normal}.hl-tablo td::before{content:attr(data-et);display:block;font-size:11px;color:var(--yazi-3)}" +
  ".hl-tablo td.hl-tam{grid-column:1/-1}.hl-tablo td.hl-tam::before{content:none}.hl-tablo td.hl-tam .dugme{width:100%;min-height:42px}}";

/* ---- formatting ------------------------------------------------------ */
const usd = (x, d = 2) => (x == null || !isFinite(x) ? "–" : (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
function kisaUsd(x) {
  if (x == null || !isFinite(x)) return "–";
  const a = Math.abs(x);
  if (a >= 1e9) return "$" + (x / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (x / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return "$" + (x / 1e3).toFixed(1) + "K";
  return "$" + x.toFixed(0);
}
function fiyat(p) {
  if (p == null || !isFinite(p) || p <= 0) return "–";
  if (p >= 10000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return "$" + p.toLocaleString("en-US", { maximumSignificantDigits: 6 });
  return "$" + p.toLocaleString("en-US", { maximumSignificantDigits: 5 });
}
const yuzde = (x, d = 2) => (x == null || !isFinite(x) ? "–" : (x > 0 ? "+" : "") + x.toFixed(d) + "%");
const isaretSinif = (x) => (x > 0 ? "hl-art" : x < 0 ? "hl-eks" : "");

function riskOnayliMi() { try { return localStorage.getItem(RISK_ANAHTAR) === "1"; } catch (e) { return false; } }
function riskOnayYaz() { try { localStorage.setItem(RISK_ANAHTAR, "1"); } catch (e) { /* storage blocked: asked again next time */ } }

const disBag = (href, yazi, sinif = "dugme dugme--sade dugme--kucuk") => el("a", { sinif, attr: { href, target: "_blank", rel: "noopener noreferrer" }, yazi });

/* ---- the price chart (a small canvas line, no library) --------------- */
function grafikCiz(tuval, mumlar) {
  const r = tuval.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  tuval.width = Math.max(1, Math.round(r.width * dpr)); tuval.height = Math.max(1, Math.round(r.height * dpr));
  const c = tuval.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, r.width, r.height);
  const k = mumlar.map((m) => Number(m.c));
  if (k.length < 2) return;
  const css = getComputedStyle(document.documentElement);
  const renk = (k[k.length - 1] >= k[0] ? css.getPropertyValue("--alis") : css.getPropertyValue("--satis")).trim() || "#7c5cff";
  const yazi = css.getPropertyValue("--yazi-3").trim() || "#888";
  const enAz = Math.min(...mumlar.map((m) => Number(m.l))), enCok = Math.max(...mumlar.map((m) => Number(m.h)));
  const ust = 14, alt = 18, sag = 64, w = r.width - sag, h = r.height - ust - alt;
  const x = (i) => (i / (k.length - 1)) * w;
  const y = (v) => ust + (enCok === enAz ? h / 2 : (1 - (v - enAz) / (enCok - enAz)) * h);
  c.beginPath(); k.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v))));
  c.strokeStyle = renk; c.lineWidth = 2; c.lineJoin = "round"; c.stroke();
  c.lineTo(x(k.length - 1), ust + h); c.lineTo(0, ust + h); c.closePath();
  const g = c.createLinearGradient(0, ust, 0, ust + h); g.addColorStop(0, renk + "40"); g.addColorStop(1, renk + "00");
  c.fillStyle = g; c.fill();
  c.fillStyle = yazi; c.font = "11px system-ui, sans-serif"; c.textAlign = "left";
  c.fillText(fiyat(enCok), w + 6, ust + 4); c.fillText(fiyat(enAz), w + 6, ust + h);
  c.fillStyle = renk; c.font = "bold 11px system-ui, sans-serif"; c.fillText(fiyat(k[k.length - 1]), w + 6, Math.min(ust + h - 12, Math.max(ust + 16, y(k[k.length - 1]) + 4)));
  c.fillStyle = yazi; c.font = "11px system-ui, sans-serif";
  const t0 = new Date(mumlar[0].t), t1 = new Date(mumlar[mumlar.length - 1].t);
  const tz = (d) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  c.fillText(tz(t0) + " UTC", 0, r.height - 4); c.textAlign = "right"; c.fillText(tz(t1), w, r.height - 4);
}

/* ---- the view -------------------------------------------------------- */
export async function ciz({ param, cuzdan }) {
  if (!document.getElementById("hl-stil")) document.head.append(el("style", { attr: { id: "hl-stil" }, yazi: STIL }));
  document.title = "Trade Hyperliquid perps — ARC PULSE";
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Trade Hyperliquid perps", "Hyperliquid's order book, from your own wallet. Your funds stay in your Hyperliquid account.", [
    el("a", { sinif: "dugme dugme--sade", attr: { href: "#/perps" }, yazi: "Perps Radar" })]));
  kap.append(not(RISK, "uyari"));

  let piyasalar;
  try { piyasalar = await hl.piyasalar(); }
  catch (e) {
    kap.append(panel("Markets", el("div", { sinif: "yigin yigin--sik" }, [
      not("Hyperliquid's market data could not be read right now (" + ((e && e.message) || e) + "). Please try again in a minute.", "uyari"),
      disBag(HL_APP + "/trade", "Open Hyperliquid ↗", "dugme dugme--sade")])));
    return kap;
  }
  piyasalar.sort((a, b) => b.hacim - a.hacim);
  const adIle = new Map(piyasalar.map((p) => [p.ad, p]));
  const istenen = (param.get("coin") || "").trim();
  let P = adIle.get(istenen) || [...adIle.values()].find((p) => p.ad.toUpperCase() === istenen.toUpperCase()) || adIle.get("BTC") || piyasalar[0];

  /* who: the connected wallet, or a read-only debug address */
  const asParam = (param.get("as") || "").trim();
  const salt = /^0x[0-9a-fA-F]{40}$/.test(asParam);
  const kim = salt ? asParam.toLowerCase() : (cuzdan.hesap() || null);
  let H = null;           // account data (hl.hesapOku)
  let ajan = null;        // this device's trading key (ethers Wallet), see hl.js
  let ajanDurum = "bilinmiyor";   // "gecerli" once Hyperliquid lists it as an agent of kim, "yok" when there is none
  let ajanReddedildi = false;     // declined in the wallet: sign each action in the wallet instead
  const ajanHazir = () => !!ajan && ajanDurum === "gecerli";
  const imzaci = () => (ajanHazir() ? ajan : null);
  const hazirMi = () => H && H.onay >= hl.BUILDER_F && (ajanHazir() || ajanReddedildi);
  let K = null;           // activeAssetData for (kim, P)
  let hesapHata = null;

  /* ---- market header ---- */
  const secim = el("select", { sinif: "girdi", attr: { "aria-label": "Market" } }, piyasalar.map((p) => el("option", { attr: { value: p.ad }, yazi: p.ad + "-USD · " + kisaUsd(p.hacim) })));
  secim.value = P.ad;
  const olcler = el("div", { sinif: "hl-olc" });
  const olcCiz = () => {
    const deg = P.dun > 0 ? (P.mark / P.dun - 1) * 100 : null;
    const kutu = (etiket, deger, sinif = "") => el("div", {}, [el("small", { yazi: etiket }), el("b", { sinif, yazi: deger })]);
    olcler.replaceChildren(
      kutu("Mark price", fiyat(P.mark)),
      kutu("24h change", yuzde(deg), isaretSinif(deg)),
      kutu("24h volume", kisaUsd(P.hacim)),
      kutu("Funding (1h)", yuzde(P.fon * 100, 4), isaretSinif(P.fon)),
      kutu("Open interest", kisaUsd(P.oi)),
      kutu("Max leverage", P.maxKal + "×" + (P.yalnizIzole ? " iso" : "")));
  };
  olcCiz();
  kap.append(el("div", { sinif: "hl-ust" }, [el("div", { sinif: "hl-alan" }, [el("label", { yazi: "Market" }), secim]), olcler]));

  /* ---- chart ---- */
  const ARALIK = [{ ad: "24h", i: "15m", ms: 864e5 }, { ad: "7d", i: "1h", ms: 7 * 864e5 }, { ad: "30d", i: "4h", ms: 30 * 864e5 }];
  let aralik = ARALIK[0];
  const tuval = el("canvas", { attr: { role: "img", "aria-label": "Price chart" } });
  const grafikBos = el("div", { sinif: "hl-grafik__bos", yazi: "Loading the chart…" });
  const aralikDug = el("div", { sinif: "hl-aralik" });
  let sonMumlar = [];
  const grafikYukle = async () => {
    const coin = P.ad, ar = aralik;
    grafikBos.hidden = false; grafikBos.textContent = "Loading the chart…";
    try {
      const m = await hl.mumlar(coin, ar.i, ar.ms);
      if (coin !== P.ad || ar !== aralik) return;
      sonMumlar = m || [];
      grafikBos.hidden = sonMumlar.length > 1;
      if (sonMumlar.length < 2) grafikBos.textContent = "No price history for this market.";
      grafikCiz(tuval, sonMumlar);
    } catch (e) { grafikBos.textContent = "The chart could not be loaded."; }
  };
  const aralikCiz = () => aralikDug.replaceChildren(...ARALIK.map((a) => el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", "aria-pressed": String(a === aralik) }, yazi: a.ad, on: { click: () => { aralik = a; aralikCiz(); grafikYukle(); } } })));
  aralikCiz();
  const grafikKutu = el("div", { sinif: "hl-grafik" }, [tuval, grafikBos]);
  const grafikPanel = panel(["Price · ", el("span", { yazi: P.ad + "-USD" })], el("div", { sinif: "yigin yigin--sik" }, [grafikKutu,
    el("div", { sinif: "hl-ipucu", yazi: "Hyperliquid's own candles (close prices). Data may be delayed." })]), aralikDug);
  const grafikBaslik = grafikPanel.querySelector(".panel__baslik span");

  /* ---- order form ---- */
  const durum = el("div", { sinif: "hl-durum", attr: { role: "status", "aria-live": "polite" } });
  const durumYaz = (yazi, tur = "") => { durum.textContent = yazi || ""; durum.className = "hl-durum" + (tur === "hata" ? " hl-eks" : tur === "ok" ? " hl-art" : ""); };
  const zincirNotu = el("div", { attr: { hidden: true } });
  let yon = "alis", tur = "piyasa";
  const yonDug = el("div", { sinif: "hl-sec hl-yon" });
  const turDug = el("div", { sinif: "hl-sec hl-tur" });
  const limitGirdi = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "Limit price (USD)", "aria-label": "Limit price in USD" } });
  const limitAlan = el("div", { sinif: "hl-alan", attr: { hidden: true } }, [el("label", { yazi: "Limit price (USD)" }), limitGirdi]);
  const tutarGirdi = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "e.g. 20", "aria-label": "Order size in USD" } });
  const tutarIpucu = el("div", { sinif: "hl-ipucu" });
  const kalGirdi = el("input", { attr: { type: "range", min: "1", max: String(P.maxKal), step: "1", value: String(Math.min(5, P.maxKal)), "aria-label": "Leverage" } });
  const kalYazi = el("b");
  const modSec = el("select", { sinif: "girdi", attr: { "aria-label": "Margin mode", style: "height:40px" } }, [el("option", { attr: { value: "cross" }, yazi: "Cross" }), el("option", { attr: { value: "isolated" }, yazi: "Isolated" })]);
  const kalIpucu = el("div", { sinif: "hl-ipucu" });
  const azaltKutu = el("input", { attr: { type: "checkbox", id: "hl-azalt" } });
  const tpslKutu = el("input", { attr: { type: "checkbox", id: "hl-tpsl" } });
  const tpGirdi = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "Take profit price (optional)", "aria-label": "Take profit price" } });
  const slGirdi = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "Stop loss price (optional)", "aria-label": "Stop loss price" } });
  const tpslAlan = el("div", { sinif: "hl-alan", attr: { hidden: true } }, [el("label", { yazi: "Take profit / stop loss (market orders when the mark price reaches them)" }), tpGirdi, slGirdi]);
  const tpslSatir = el("label", { sinif: "hl-kutu", attr: { for: "hl-tpsl" } }, [tpslKutu, el("span", { yazi: "Add take profit / stop loss" })]);
  tpslKutu.addEventListener("change", () => { tpslAlan.hidden = !tpslKutu.checked; formGuncelle(); });
  const riskKutu = el("input", { attr: { type: "checkbox", id: "hl-risk" } });
  const riskSatir = el("label", { sinif: "hl-kutu", attr: { for: "hl-risk" } }, [riskKutu, el("span", { yazi: "I'm not a US person or in a restricted region, and I understand perps are high risk." })]);
  const ucretKutu = el("div", { sinif: "hl-ucret" });
  const anaDugme = el("button", { sinif: "dugme dugme--marka dugme--tam dugme--buyuk", attr: { type: "button" } });
  const onayAciklama = el("div", { sinif: "ikincil", attr: { hidden: true }, yazi: ONAY_METIN });
  const yatirKutu = el("div", { attr: { hidden: true } });
  const onizle = el("div", { sinif: "hl-onizle", attr: { hidden: true } });

  const yonCiz = () => yonDug.replaceChildren(
    el("button", { sinif: "dugme dugme--alis", attr: { type: "button", "aria-pressed": String(yon === "alis") }, yazi: "Long", on: { click: () => { yon = "alis"; yonCiz(); formGuncelle(); } } }),
    el("button", { sinif: "dugme dugme--satis", attr: { type: "button", "aria-pressed": String(yon === "satis") }, yazi: "Short", on: { click: () => { yon = "satis"; yonCiz(); formGuncelle(); } } }));
  const turCiz = () => turDug.replaceChildren(...[["piyasa", "Market"], ["limit", "Limit"]].map(([k, ad]) => el("button", { sinif: "dugme dugme--sade", attr: { type: "button", "aria-pressed": String(tur === k) }, yazi: ad, on: { click: () => { tur = k; turCiz(); limitAlan.hidden = tur !== "limit"; if (tur === "limit" && !limitGirdi.value) limitGirdi.value = hl.fiyatYaz(P.mid || P.mark, P.szDec); formGuncelle(); } } })));
  yonCiz(); turCiz();

  const sayi = (s) => { const x = Number(String(s || "").replace(/[$,\s]/g, "")); return isFinite(x) ? x : NaN; };
  /* the order the form describes right now, or a reason it cannot be placed */
  function taslak() {
    const notional = sayi(tutarGirdi.value);
    const kal = Math.max(1, Math.min(P.maxKal, Math.round(Number(kalGirdi.value) || 1)));
    const capraz = !P.yalnizIzole && modSec.value === "cross";
    const ref = tur === "limit" ? sayi(limitGirdi.value) : (P.mid || P.mark);
    const t = { notional, kal, capraz, ref, alis: yon === "alis", azalt: azaltKutu.checked, limit: tur === "limit" };
    if (!(notional > 0)) return { ...t, neden: "Enter the order size in USD." };
    if (!(ref > 0)) return { ...t, neden: "Enter a limit price." };
    if (t.limit) t.ref = Number(hl.fiyatYaz(ref, P.szDec));   // the price exactly as it will be sent
    t.boyut = hl.boyutYaz(notional / ref, P.szDec);
    if (!(Number(t.boyut) > 0)) return { ...t, neden: "That is smaller than the smallest " + P.ad + " size." };
    t.gercekUsd = Number(t.boyut) * ref;
    if (t.gercekUsd < hl.EN_AZ_USD) return { ...t, neden: "Hyperliquid's minimum order is $" + hl.EN_AZ_USD + " (after rounding the size down to " + P.ad + "'s size step, this is " + usd(t.gercekUsd) + ")." };
    t.teminat = t.gercekUsd / kal;
    const alici = H ? H.alici : 0.00045, yapici = H ? H.yapici : 0.00015;
    t.hlUcret = t.gercekUsd * alici; t.hlYapici = t.gercekUsd * yapici; t.biz = t.gercekUsd * hl.BUILDER_ORAN;
    t.alici = alici; t.yapici = yapici;
    if (H && !H.birlesik && !t.azalt && t.teminat > H.cekilebilir + 1e-9) return { ...t, neden: "Not enough free margin: this needs about " + usd(t.teminat) + ", you have " + usd(H.cekilebilir) + " available." };
    /* optional TP / SL (not with reduce-only): triggers on the mark price, on the right side of the entry */
    if (tpslKutu.checked && !t.azalt) {
      const tp = tpGirdi.value.trim() ? sayi(tpGirdi.value) : null, sl = slGirdi.value.trim() ? sayi(slGirdi.value) : null;
      if (tp != null && !(tp > 0)) return { ...t, neden: "The take profit price is not a number." };
      if (sl != null && !(sl > 0)) return { ...t, neden: "The stop loss price is not a number." };
      if (tp != null && (t.alis ? tp <= t.ref : tp >= t.ref)) return { ...t, neden: "Take profit must be " + (t.alis ? "above" : "below") + " the entry price (" + fiyat(t.ref) + ") for a " + (t.alis ? "long." : "short.") };
      if (sl != null && (t.alis ? sl >= t.ref : sl <= t.ref)) return { ...t, neden: "Stop loss must be " + (t.alis ? "below" : "above") + " the entry price (" + fiyat(t.ref) + ") for a " + (t.alis ? "long." : "short.") };
      t.tp = tp != null ? Number(hl.fiyatYaz(tp, P.szDec)) : null;
      t.sl = sl != null ? Number(hl.fiyatYaz(sl, P.szDec)) : null;
    }
    t.liq = t.azalt || !H ? null : hl.liqTahmin({ px: t.ref, boyut: Number(t.boyut), alis: t.alis, kal, capraz, hesapDegeri: H.deger, maxKal: P.maxKal });
    if (t.sl != null && t.liq != null && (t.alis ? t.sl <= t.liq : t.sl >= t.liq)) return { ...t, neden: "The stop loss is past the approximate liquidation price (" + fiyat(t.liq) + "); the position would be liquidated first." };
    return t;
  }

  function ucretCiz(t) {
    if (!(t.gercekUsd > 0)) { ucretKutu.replaceChildren(el("div", {}, [el("span", { yazi: "Fees are shown here before you confirm." })])); return; }
    const satir = (a, b, sinif = "") => el("div", { sinif }, [el("span", { yazi: a }), el("span", { yazi: b })]);
    const hlSatir = t.limit
      ? satir("Hyperliquid fee (" + (t.yapici * 100).toFixed(3) + "% if it rests, " + (t.alici * 100).toFixed(3) + "% if it fills at once)", "up to " + usd(t.hlUcret, 4))
      : satir("Hyperliquid fee, est. (" + (t.alici * 100).toFixed(3) + "% taker)", usd(t.hlUcret, 4));
    ucretKutu.replaceChildren(
      satir("Order value", usd(t.gercekUsd) + " · " + t.boyut + " " + P.ad),
      satir("Margin used (" + t.kal + "× " + (t.capraz ? "cross" : "isolated") + ")", usd(t.teminat)),
      hlSatir,
      satir("ARC PULSE fee (0.05%)", usd(t.biz, 4)),
      satir("Total fees" + (t.limit ? ", at most" : ", est."), usd(t.hlUcret + t.biz, 4), "hl-top"));
  }

  function formGuncelle() {
    onizle.hidden = true;
    const kal = Math.round(Number(kalGirdi.value) || 1);
    kalYazi.textContent = kal + "×";
    if (P.yalnizIzole) { modSec.value = "isolated"; modSec.disabled = true; } else modSec.disabled = false;
    const simdiki = K && K.leverage ? K.leverage.value + "× " + K.leverage.type : null;
    kalIpucu.textContent = "Up to " + P.maxKal + "× on " + P.ad + (P.yalnizIzole ? " (isolated only)" : "") + ". Bigger positions get less." + (simdiki ? " Your " + P.ad + " setting now: " + simdiki + "." : "");
    const t = taslak();
    tutarIpucu.textContent = t.boyut && Number(t.boyut) > 0 ? "≈ " + t.boyut + " " + P.ad + (t.teminat ? " · margin ≈ " + usd(t.teminat) : "") : (H ? "Available: " + usd(H.cekilebilir) : "Size is in US dollars of " + P.ad + ".");
    ucretCiz(t);
    riskSatir.hidden = riskOnayliMi();
    tpslSatir.hidden = azaltKutu.checked; tpslAlan.hidden = azaltKutu.checked || !tpslKutu.checked;
    onayAciklama.hidden = true; yatirKutu.hidden = true;
    anaDugme.disabled = false;
    if (salt) { anaDugme.textContent = "Read-only view (no trading)"; anaDugme.disabled = true; return; }
    if (!kim) { anaDugme.textContent = "Connect wallet to trade"; return; }
    if (!H) { anaDugme.textContent = hesapHata ? "Account could not be read" : "Reading your Hyperliquid account…"; anaDugme.disabled = true; return; }
    const bos = H.deger <= 0 && !H.pozisyonlar.length && !(H.birlesik && H.spotUsdc > 0);
    if (bos) { yatirKutu.hidden = false; anaDugme.textContent = "Deposit USDC to trade"; anaDugme.disabled = true; return; }
    if (!hazirMi()) {
      onayAciklama.hidden = false;
      onayAciklama.textContent = [!(H.onay >= hl.BUILDER_F) ? ONAY_METIN : null, !ajanHazir() && !ajanReddedildi ? AJAN_METIN : null].filter(Boolean).join(" ");
      anaDugme.textContent = "Enable trading on ARC PULSE"; return;
    }
    anaDugme.textContent = "Review " + (t.alis ? "Long" : "Short") + " " + t.kal + "× " + P.ad;
  }

  [tutarGirdi, limitGirdi, tpGirdi, slGirdi].forEach((g) => g.addEventListener("input", formGuncelle));
  [kalGirdi].forEach((g) => g.addEventListener("input", formGuncelle));
  [modSec, azaltKutu].forEach((g) => g.addEventListener("change", formGuncelle));
  riskKutu.addEventListener("change", () => { durumYaz(""); });

  /* a wallet that will not sign for Hyperliquid's chain id: say so once, plainly */
  function hataGoster(e) {
    if (e && e.code === "IMZA_ZINCIR") {
      zincirNotu.hidden = false;
      ajanReddedildi = false; formGuncelle();
      zincirNotu.replaceChildren(not("Your wallet signs only for the network it is on, and Hyperliquid order signatures use Hyperliquid's own signing ID (1337), so this wallet refused. Nothing was sent. Press Enable trading to create a trading key on this device (then orders need no wallet signature), or trade the same market on Hyperliquid's own site.", "uyari"),
        el("div", { sinif: "hl-bag", attr: { style: "margin-top:8px" } }, [disBag(HL_APP + "/trade/" + encodeURIComponent(P.ad), "Open " + P.ad + " on Hyperliquid ↗")]));
      durumYaz("");
      return;
    }
    if (e && e.code === "AJAN_YOK") { hl.ajanSil(kim); ajan = null; ajanDurum = "yok"; formGuncelle(); }
    durumYaz((e && e.message) || String(e), "hata");
  }

  async function onayla() {
    anaDugme.disabled = true;
    try {
      if (!(H.onay >= hl.BUILDER_F)) {
        durumYaz("Confirm the one-time fee approval in your wallet (a signature: no transaction, no gas)…");
        await hl.builderOnayla();
        H.onay = hl.BUILDER_F;
      }
      if (!ajanHazir() && !ajanReddedildi) {
        durumYaz("Confirm the trading key for this device in your wallet (a signature: no transaction, no gas)…");
        try { ajan = await hl.ajanOnayla(kim); ajanDurum = "gecerli"; }
        catch (e) {
          if (!(e && e.code === "RED")) throw e;
          ajanReddedildi = true;
        }
      }
      if (ajanReddedildi) durumYaz("No trading key: each order will be signed in your wallet instead. Some wallets (MetaMask among them) refuse those signatures.");
      else durumYaz("Trading on ARC PULSE is enabled. Orders are signed with this device's trading key: no wallet popup per order.", "ok");
      await hesapYukle();
    } catch (e) { hataGoster(e); }
    formGuncelle();
  }

  function incele() {
    if (!riskOnayliMi() && !riskKutu.checked) { durumYaz("Please read the risk note and tick the box first.", "hata"); riskKutu.focus(); return; }
    const t = taslak();
    if (t.neden) { durumYaz(t.neden, "hata"); return; }
    durumYaz("");
    const kalDegisir = !t.azalt && !(K && K.leverage && K.leverage.value === t.kal && (K.leverage.type === "cross") === t.capraz);
    const satir = (a, b) => el("div", { sinif: "hl-ucret__s", attr: { style: "display:flex;justify-content:space-between;gap:10px" } }, [el("span", { yazi: a }), el("strong", { yazi: b })]);
    const gonderDug = el("button", { sinif: "dugme dugme--tam " + (t.alis ? "dugme--alis" : "dugme--satis"), attr: { type: "button" }, yazi: "Sign and place order" });
    const vazgec = el("button", { sinif: "dugme dugme--sade dugme--tam", attr: { type: "button" }, yazi: "Edit", on: { click: () => { onizle.hidden = true; } } });
    onizle.replaceChildren(...[
      el("strong", { yazi: (t.alis ? "Long " : "Short ") + t.boyut + " " + P.ad + (t.azalt ? " (reduce only)" : "") }),
      satir("Type", t.limit ? "Limit at " + fiyat(t.ref) + " (stays on the book until filled or cancelled)" : "Market (fills now, at most " + (hl.KAYMA * 100) + "% from " + fiyat(t.ref) + ")"),
      satir("Order value", usd(t.gercekUsd)),
      satir("Leverage", t.kal + "× " + (t.capraz ? "cross" : "isolated")),
      t.azalt ? null : satir("Liquidation price (approx.)", t.liq ? fiyat(t.liq) : "none at this size"),
      t.tp != null ? satir("Take profit", "at " + fiyat(t.tp) + " (market, reduce only)") : null,
      t.sl != null ? satir("Stop loss", "at " + fiyat(t.sl) + " (market, reduce only)") : null,
      satir("Hyperliquid fee" + (t.limit ? ", at most" : ", est."), usd(t.hlUcret, 4)),
      satir("ARC PULSE fee (0.05%)", usd(t.biz, 4)),
      kalDegisir ? not((imzaci() ? "Two actions are sent, signed with this device's trading key" : "Your wallet will ask for two signatures") + ": first to set " + P.ad + " to " + t.kal + "× " + (t.capraz ? "cross" : "isolated") + ", then the order.", "bilgi") : null,
      el("div", { sinif: "hl-sec" }, [vazgec, gonderDug])].filter(Boolean));
    onizle.hidden = false;
    gonderDug.addEventListener("click", async () => {
      if (riskKutu.checked) riskOnayYaz();
      gonderDug.disabled = true; vazgec.disabled = true;
      try {
        if (kalDegisir) {
          durumYaz(imzaci() ? "Step 1 of 2: setting the leverage…" : "Step 1 of 2: confirm the leverage setting in your wallet…");
          await hl.l1Gonder(hl.kaldiracEylemi(P.i, t.capraz, t.kal), imzaci());
          K = await hl.kaldiracOku(kim, P.ad);
        }
        /* the size is exactly the one in the preview; a market order is priced from a fresh mid */
        let px = t.ref;
        const boyut = t.boyut;
        if (!t.limit) {
          const mids = await hl.ortaFiyatlar();
          const mid = Number(mids[P.ad]) || P.mark;
          px = mid * (t.alis ? 1 + hl.KAYMA : 1 - hl.KAYMA);
        }
        const satirlar = [{ a: P.i, alis: t.alis, px: hl.fiyatYaz(px, P.szDec), sz: boyut, azalt: t.azalt, tif: t.limit ? "Gtc" : "Ioc" }];
        /* TP then SL, each the opposite side, reduce only, same size (Hyperliquid's normalTpsl grouping) */
        if (t.tp != null) satirlar.push({ a: P.i, alis: !t.alis, px: hl.tetikLimit(t.tp, !t.alis, P.szDec), sz: boyut, azalt: true, tetik: { px: hl.fiyatYaz(t.tp, P.szDec), tpsl: "tp" } });
        if (t.sl != null) satirlar.push({ a: P.i, alis: !t.alis, px: hl.tetikLimit(t.sl, !t.alis, P.szDec), sz: boyut, azalt: true, tetik: { px: hl.fiyatYaz(t.sl, P.szDec), tpsl: "sl" } });
        const eylem = hl.emirlerEylemi(satirlar, satirlar.length > 1 ? "normalTpsl" : "na");
        durumYaz((kalDegisir ? "Step 2 of 2: " : "") + (imzaci() ? "placing the order…" : "confirm the order in your wallet…"));
        const yanit = await hl.l1Gonder(eylem, imzaci());
        durumYaz(hl.emirSonucu(yanit, P.ad), "ok");
        onizle.hidden = true;
        tutarGirdi.value = ""; tpGirdi.value = ""; slGirdi.value = "";
        await hesapYukle();
      } catch (e) { hataGoster(e); gonderDug.disabled = false; vazgec.disabled = false; }
      formGuncelle();
      if (!durum.classList.contains("hl-art")) onizle.hidden = false;
    });
  }

  anaDugme.addEventListener("click", async () => {
    zincirNotu.hidden = true;
    if (salt) return;
    if (!kim) { try { await cuzdan.bagla(); } catch (e) { if (e && e.code !== "CUZDAN_YOK") durumYaz((e && e.message) || String(e), "hata"); } return; }
    if (!H) return;
    if (!hazirMi()) { await onayla(); return; }
    incele();
  });

  yatirKutu.append(el("div", { sinif: "yigin yigin--sik" }, [
    not("Your Hyperliquid account has no USDC yet. Trading here uses USDC in your own Hyperliquid account, at the same address as this wallet.", "bilgi"),
    el("div", { sinif: "hl-bag" }, [el("button", { sinif: "dugme dugme--marka dugme--kucuk", attr: { type: "button" }, yazi: "Deposit here", on: { click: () => { const p = kap.querySelector(".hl-para"); if (p) p.scrollIntoView({ behavior: "smooth", block: "start" }); } } }), disBag(HL_APP + "/portfolio", "Deposit on Hyperliquid ↗")]),
    el("div", { sinif: "hl-ipucu", yazi: "Deposit here from Arc, Arbitrum, Base and other chains (through relay.link, to your own address), or use Hyperliquid's own deposit. Already have USDC in your Hyperliquid spot balance? Move it to perps on Hyperliquid (Portfolio, Perps ⇄ Spot)." }),
  ]));

  const formPanel = panel("Place an order", el("div", { sinif: "yigin yigin--sik" }, [
    yonDug, turDug, limitAlan,
    el("div", { sinif: "hl-alan" }, [el("label", { yazi: "Size (USD)" }), tutarGirdi, tutarIpucu]),
    el("div", { sinif: "hl-alan" }, [el("label", { yazi: "Leverage" }), el("div", { sinif: "hl-kal" }, [kalGirdi, kalYazi]), el("div", { sinif: "hl-kal" }, [modSec, el("span")]), kalIpucu]),
    el("label", { sinif: "hl-kutu", attr: { for: "hl-azalt" } }, [azaltKutu, el("span", { yazi: "Reduce only (only makes an open position smaller)" })]),
    tpslSatir, tpslAlan,
    ucretKutu, riskSatir, yatirKutu, onayAciklama, anaDugme, onizle, durum, zincirNotu,
    ayrinti("How does this work?", el("div", { sinif: "ikincil", yazi: "Your wallet signs each order (a signature, not a transaction: no gas). The order goes straight to Hyperliquid, which matches it, holds your margin and settles it. A market order is sent as an immediate-or-cancel limit " + (hl.KAYMA * 100) + "% through the current price, the way Hyperliquid's own app does it. The first time, you approve ARC PULSE's 0.05% fee once and create a trading key for this device. Take profit / stop loss are market orders that Hyperliquid sends when the mark price reaches them (up to 10% slippage), reduce only. The liquidation price shown before you confirm is an approximation from Hyperliquid's formula; Hyperliquid's own figure is in the Positions table once the position is open." })),
  ]));

  /* ---- account panel ---- */
  const hesapGovde = el("div", { sinif: "yigin yigin--sik" });
  const hesapPanel = panel(salt ? "Account (read-only view)" : "Your Hyperliquid account", hesapGovde);

  function satirOnay(hedef, metin, eylem, dugmeYazi, dugmeSinif, cuzdanla = false, alanlar = null) {
    /* an inline confirm under a table: one sentence, Confirm / Keep */
    const kutu = el("div", { sinif: "hl-onizle" });
    const evet = el("button", { sinif: "dugme " + dugmeSinif, attr: { type: "button" }, yazi: dugmeYazi });
    const hayir = el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Keep", on: { click: () => kutu.remove() } });
    const d = el("div", { sinif: "hl-durum", attr: { role: "status" } });
    kutu.append(el("div", { yazi: metin }), alanlar, el("div", { sinif: "hl-sec" }, [hayir, evet]), d);
    evet.addEventListener("click", async () => {
      evet.disabled = true; hayir.disabled = true; d.textContent = cuzdanla || !imzaci() ? "Confirm in your wallet…" : "Sending…"; d.className = "hl-durum";
      try {
        const sonucYazi = await eylem();
        d.textContent = sonucYazi; d.className = "hl-durum hl-art";
        durumYaz(sonucYazi, "ok");   /* also in the form: the account panel redraws a moment later */
        setTimeout(() => { kutu.remove(); hesapYukle(); }, 1500);
      }
      catch (e) {
        if (e && (e.code === "IMZA_ZINCIR" || e.code === "AJAN_YOK")) hataGoster(e);
        d.textContent = (e && e.message) || String(e); d.className = "hl-durum hl-eks"; evet.disabled = false; hayir.disabled = false;
      }
    });
    hedef.querySelectorAll(".hl-onizle").forEach((x) => x.remove());
    hedef.append(kutu);
  }

  function hesapCiz() {
    if (!kim) {
      hesapGovde.replaceChildren(el("div", { sinif: "ikincil", yazi: "Connect your wallet to see your Hyperliquid balance, positions and orders here. Your Hyperliquid account is the same address as your wallet." }),
        el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Connect wallet", on: { click: () => cuzdan.bagla().catch(() => {}) } }));
      return;
    }
    if (hesapHata && !H) { hesapGovde.replaceChildren(not("Your Hyperliquid account could not be read: " + hesapHata, "uyari")); return; }
    if (!H) { hesapGovde.replaceChildren(el("div", { sinif: "ikincil", yazi: "Reading your Hyperliquid account…" })); return; }
    const kalemler = [
      el("div", { sinif: "izgara izgara--olcum" }, [
        olcum("Account value", usd(H.deger)), olcum("Available to trade or withdraw", usd(H.cekilebilir)), olcum("Margin in use", usd(H.teminat)),
        H.spotUsdc > 0.009 ? olcum("Spot USDC", usd(H.spotUsdc), "separate from perps") : null]),
    ];
    if (salt) kalemler.unshift(not("Read-only view of " + kim + ". Nothing can be signed in this view.", "bilgi"));

    /* positions */
    const pozKap = el("div", { sinif: "yigin yigin--sik" });
    if (!H.pozisyonlar.length) pozKap.append(el("div", { sinif: "ikincil", yazi: "No open positions." }));
    else {
      const t = el("table", { sinif: "hl-tablo" });
      t.append(el("thead", {}, [el("tr", {}, ["Market", "Size", "Entry", "Mark", "Unrealized PnL", "Liq. price", ""].map((b, i) => el("th", { sinif: i > 1 && i < 6 ? "sayi" : "", yazi: b })))]));
      t.append(el("tbody", {}, H.pozisyonlar.map((p) => {
        const m = adIle.get(p.coin);
        const szi = Number(p.szi), uzun = szi > 0;
        const mark = m ? m.mark : Math.abs(Number(p.positionValue) / szi);
        const pnl = Number(p.unrealizedPnl), roe = Number(p.returnOnEquity) * 100;
        const kapat = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Close" });
        kapat.addEventListener("click", () => {
          if (salt) return;
          if (!m) { durumYaz("This market is not on Hyperliquid's main list; close it on Hyperliquid.", "hata"); return; }
          if (!hazirMi()) { satirOnay(pozKap, "Closing here is an order placed from ARC PULSE, so trading has to be enabled here first. " + (H.onay >= hl.BUILDER_F ? "" : ONAY_METIN + " ") + (ajanHazir() || ajanReddedildi ? "" : AJAN_METIN), async () => { await onayla(); if (!hazirMi()) throw new Error(durum.textContent || "Trading is not enabled."); return "Trading on ARC PULSE is enabled. Press Close again."; }, "Enable trading on ARC PULSE", "dugme--marka", true); return; }
          const deger = Math.abs(szi) * mark;
          const ucret = deger * (H.alici + hl.BUILDER_ORAN);
          satirOnay(pozKap, "Close " + Math.abs(szi) + " " + p.coin + " " + (uzun ? "long" : "short") + " at market (at most " + (hl.KAYMA * 100) + "% from " + fiyat(mark) + "). Fees: Hyperliquid ≈ " + usd(deger * H.alici, 4) + " + ARC PULSE 0.05% ≈ " + usd(deger * hl.BUILDER_ORAN, 4) + " (≈ " + usd(ucret, 4) + ").", async () => {
            const mids = await hl.ortaFiyatlar();
            const mid = Number(mids[p.coin]) || mark;
            const px = mid * (uzun ? 1 - hl.KAYMA : 1 + hl.KAYMA);
            const y = await hl.l1Gonder(hl.emirEylemi({ a: m.i, alis: !uzun, px: hl.fiyatYaz(px, m.szDec), sz: hl.boyutYaz(Math.abs(szi), m.szDec), azalt: true, tif: "Ioc" }), imzaci());
            return hl.emirSonucu(y, p.coin);
          }, "Confirm close", uzun ? "dugme--satis" : "dugme--alis");
        });
        const tpslDug = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "TP/SL" });
        tpslDug.addEventListener("click", () => {
          if (salt || !m) return;
          if (!hazirMi()) { durumYaz("Enable trading on ARC PULSE first (order form).", "hata"); return; }
          const varOlan = H.emirler.filter((o) => o.coin === p.coin && o.isTrigger);
          const tpG = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", placeholder: "Take profit price", "aria-label": "Position take profit price" } });
          const slG = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", placeholder: "Stop loss price", "aria-label": "Position stop loss price" } });
          const alan = el("div", { sinif: "yigin yigin--sik" }, [tpG, slG, varOlan.length ? el("div", { sinif: "hl-ipucu", yazi: "Already set: " + varOlan.map((o) => o.orderType + " at " + fiyat(Number(o.triggerPx))).join(", ") + ". These new ones are added; cancel old ones in Open orders." }) : null]);
          satirOnay(pozKap, "Take profit / stop loss for the whole " + p.coin + " " + (uzun ? "long" : "short") + " (" + Math.abs(szi) + ", mark " + fiyat(mark) + ", liq. " + (p.liquidationPx ? fiyat(Number(p.liquidationPx)) : "–") + "). Market orders when the mark reaches the price, reduce only. Fees as for a close: Hyperliquid's + ARC PULSE 0.05%.", async () => {
            const tp = tpG.value.trim() ? sayi(tpG.value) : null, sl = slG.value.trim() ? sayi(slG.value) : null;
            if (tp == null && sl == null) throw new Error("Enter a take profit or a stop loss price.");
            if (tp != null && !(uzun ? tp > mark : tp < mark && tp > 0)) throw new Error("Take profit must be " + (uzun ? "above" : "below") + " the mark price (" + fiyat(mark) + ").");
            if (sl != null && !(uzun ? sl < mark && sl > 0 : sl > mark)) throw new Error("Stop loss must be " + (uzun ? "below" : "above") + " the mark price (" + fiyat(mark) + ").");
            const sz = hl.boyutYaz(Math.abs(szi), m.szDec);
            const satirlar = [];
            if (tp != null) satirlar.push({ a: m.i, alis: !uzun, px: hl.tetikLimit(tp, !uzun, m.szDec), sz, azalt: true, tetik: { px: hl.fiyatYaz(tp, m.szDec), tpsl: "tp" } });
            if (sl != null) satirlar.push({ a: m.i, alis: !uzun, px: hl.tetikLimit(sl, !uzun, m.szDec), sz, azalt: true, tetik: { px: hl.fiyatYaz(sl, m.szDec), tpsl: "sl" } });
            const y = await hl.l1Gonder(hl.emirlerEylemi(satirlar, "positionTpsl"), imzaci());
            const hata = ((y && y.data && y.data.statuses) || []).find((x) => x && x.error);
            if (hata) throw new Error("Hyperliquid: " + hata.error);
            return "TP/SL set on " + p.coin + ".";
          }, "Set TP/SL", "dugme--marka", false, alan);
        });
        return el("tr", {}, [
          el("td", { attr: { "data-et": "Market" } }, [el("strong", { yazi: p.coin }), " ", el("span", { sinif: "etiket " + (uzun ? "etiket--alis" : "etiket--satis"), yazi: (uzun ? "Long " : "Short ") + (p.leverage ? p.leverage.value + "×" : "") })]),
          el("td", { attr: { "data-et": "Size" }, yazi: Math.abs(szi) + " (" + usd(Math.abs(Number(p.positionValue))) + ")" }),
          el("td", { sinif: "sayi", attr: { "data-et": "Entry" }, yazi: fiyat(Number(p.entryPx)) }),
          el("td", { sinif: "sayi", attr: { "data-et": "Mark" }, yazi: fiyat(mark) }),
          el("td", { sinif: "sayi " + isaretSinif(pnl), attr: { "data-et": "Unrealized PnL" }, yazi: usd(pnl) + " (" + yuzde(roe, 1) + ")" }),
          el("td", { sinif: "sayi", attr: { "data-et": "Liq. price" }, yazi: p.liquidationPx ? fiyat(Number(p.liquidationPx)) : "–" }),
          el("td", { sinif: "hl-tam" }, salt ? [] : [el("span", { attr: { style: "display:inline-flex;gap:6px" } }, [tpslDug, kapat])]),
        ]);
      })));
      pozKap.prepend(el("div", { sinif: "hl-sarmal" }, [t]));
    }
    kalemler.push(el("h3", { sinif: "panel__baslik", attr: { style: "margin:6px 0 0;font-size:14px" }, yazi: "Positions" }), pozKap);

    /* open orders */
    const emKap = el("div", { sinif: "yigin yigin--sik" });
    if (!H.emirler.length) emKap.append(el("div", { sinif: "ikincil", yazi: "No open orders." }));
    else {
      const t = el("table", { sinif: "hl-tablo" });
      t.append(el("thead", {}, [el("tr", {}, ["Market", "Side", "Price", "Size", ""].map((b, i) => el("th", { sinif: i > 1 && i < 4 ? "sayi" : "", yazi: b })))]));
      t.append(el("tbody", {}, H.emirler.map((o) => {
        const m = adIle.get(o.coin);
        const iptal = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Cancel" });
        iptal.addEventListener("click", () => {
          if (salt || !m) return;
          satirOnay(emKap, "Cancel this " + o.coin + " " + (o.side === "B" ? "buy" : "sell") + " order for " + o.sz + " at " + fiyat(Number(o.limitPx)) + "? (A signature, no fee.)", async () => {
            const y = await hl.l1Gonder(hl.iptalEylemi(m.i, o.oid), imzaci());
            const st = y && y.data && y.data.statuses && y.data.statuses[0];
            if (st && st.error) throw new Error("Hyperliquid: " + st.error);
            return "Order cancelled.";
          }, "Cancel order", "dugme--satis");
        });
        const duzenle = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Edit" });
        duzenle.addEventListener("click", () => {
          if (salt || !m) return;
          if (!hazirMi()) { durumYaz("Enable trading on ARC PULSE first (order form).", "hata"); return; }
          const pxG = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", value: o.limitPx, "aria-label": "New limit price" } });
          const szG = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", value: o.sz, "aria-label": "New size in " + o.coin } });
          const alan = el("div", { sinif: "yigin yigin--sik" }, [el("label", { sinif: "hl-ipucu", yazi: "Limit price (USD)" }), pxG, el("label", { sinif: "hl-ipucu", yazi: "Size (" + o.coin + ")" }), szG]);
          satirOnay(emKap, "Change this " + o.coin + " " + (o.side === "B" ? "buy" : "sell") + " limit order (now " + o.sz + " at " + fiyat(Number(o.limitPx)) + ").", async () => {
            const px = sayi(pxG.value), sz = sayi(szG.value);
            if (!(px > 0) || !(sz > 0)) throw new Error("Enter a price and a size.");
            const szYaz = hl.boyutYaz(sz, m.szDec);
            if (Number(szYaz) * px < hl.EN_AZ_USD) throw new Error("Hyperliquid's minimum order is $" + hl.EN_AZ_USD + ".");
            const y = await hl.l1Gonder(hl.duzenleEylemi(o.oid, { a: m.i, alis: o.side === "B", px: hl.fiyatYaz(px, m.szDec), sz: szYaz, azalt: !!o.reduceOnly, tif: o.tif === "Alo" ? "Alo" : "Gtc" }), imzaci());
            const st = y && y.data && y.data.statuses && y.data.statuses[0];
            if (st && st.error) throw new Error("Hyperliquid: " + st.error);
            return "Order changed.";
          }, "Change order", "dugme--marka", false, alan);
        });
        const limitMi = !o.isTrigger && (!o.orderType || o.orderType === "Limit");
        return el("tr", {}, [
          el("td", { attr: { "data-et": "Market" } }, [el("strong", { yazi: o.coin }), o.reduceOnly ? el("span", { sinif: "etiket", attr: { style: "margin-left:6px" }, yazi: "reduce only" }) : null]),
          el("td", { attr: { "data-et": "Side" }, sinif: o.side === "B" ? "hl-art" : "hl-eks", yazi: (o.side === "B" ? "Buy" : "Sell") + (o.orderType && o.orderType !== "Limit" ? " · " + o.orderType : "") }),
          el("td", { sinif: "sayi", attr: { "data-et": "Price" }, yazi: o.isTrigger ? "trigger " + fiyat(Number(o.triggerPx)) : fiyat(Number(o.limitPx)) }),
          el("td", { sinif: "sayi", attr: { "data-et": "Size" }, yazi: o.sz }),
          el("td", { sinif: "hl-tam" }, salt || !m ? [] : [el("span", { attr: { style: "display:inline-flex;gap:6px" } }, [limitMi ? duzenle : null, iptal].filter(Boolean))]),
        ]);
      })));
      emKap.prepend(el("div", { sinif: "hl-sarmal" }, [t]));
    }
    kalemler.push(el("h3", { sinif: "panel__baslik", attr: { style: "margin:6px 0 0;font-size:14px" }, yazi: "Open orders" }), emKap);

    /* money in and out, and the fee approval */
    const onayli = H.onay >= hl.BUILDER_F;
    const onayKap = el("div", { sinif: "yigin yigin--sik" });
    onayKap.append(el("div", { sinif: "hl-ipucu", yazi: onayli ? "ARC PULSE fee approved: up to 0.05% per trade placed here." : "ARC PULSE fee not approved yet: you approve it once before your first order here." }));
    if (onayli && !salt) onayKap.append(el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", style: "justify-self:start" }, yazi: "Revoke the ARC PULSE fee approval", on: { click: () => satirOnay(onayKap, "Revoke the approval? Orders from ARC PULSE then stop until you approve again. Orders you place on Hyperliquid's own site are not affected.", async () => { await hl.builderOnayla("0%"); return "Approval revoked."; }, "Revoke", "dugme--satis", true) } }));
    if (!salt) {
      onayKap.append(el("div", { sinif: "hl-ipucu", yazi: ajanHazir() ? "Trading key on this device: " + ajan.address.slice(0, 8) + "…" + ajan.address.slice(-6) + " (can place and cancel orders, cannot withdraw or transfer)." : ajanReddedildi ? "No trading key on this device: each order is signed in your wallet." : "No trading key on this device yet." }));
      if (ajanHazir()) onayKap.append(el("div", { sinif: "hl-bag" }, [
        el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Forget this device", on: { click: () => satirOnay(onayKap, "Delete this device's trading key? Orders here then need Enable trading again. The key stays listed on Hyperliquid's API page until it is replaced or removed there; without the key nobody can use it.", async () => { hl.ajanSil(kim); ajan = null; ajanDurum = "yok"; return "Trading key deleted from this device."; }, "Forget this device", "dugme--satis") } }),
        disBag(HL_APP + "/API", "Agents on Hyperliquid ↗")]));
    }
    kalemler.push(onayKap);
    hesapGovde.replaceChildren(...kalemler);
  }

  async function hesapYukle() {
    if (!kim) { hesapCiz(); formGuncelle(); return; }
    try {
      const coin = P.ad;
      const [h, k] = await Promise.all([hl.hesapOku(kim), hl.kaldiracOku(kim, coin)]);
      H = h; hesapHata = null;
      /* this device's trading key: checked against Hyperliquid's agent list once per page */
      if (!salt && ajanDurum !== "gecerli") {
        if (!ajan) ajan = hl.ajanOku(kim);
        if (!ajan) ajanDurum = "yok";
        else {
          const ok = await hl.ajanGecerliMi(kim, ajan).catch(() => null);
          if (ok === true) ajanDurum = "gecerli";
          else if (ok === false) { hl.ajanSil(kim); ajan = null; ajanDurum = "yok"; }   // expired or replaced: ask again
        }
      }
      if (coin === P.ad) {
        K = k;
        if (K && K.leverage && !kalOynandi) { kalGirdi.value = String(Math.min(P.maxKal, K.leverage.value)); if (!P.yalnizIzole) modSec.value = K.leverage.type === "isolated" ? "isolated" : "cross"; }
      }
    } catch (e) { hesapHata = (e && e.message) || String(e); }
    /* an open inline box (confirm, TP/SL, edit) or a focused input is not thrown away by a refresh */
    if (!hesapGovde.querySelector(".hl-onizle") && !hesapGovde.contains(document.activeElement)) hesapCiz();
    formGuncelle();
    if (para) para.guncelle(H);
  }
  let para = null;
  let kalOynandi = false;
  kalGirdi.addEventListener("input", () => { kalOynandi = true; });
  modSec.addEventListener("change", () => { kalOynandi = true; });

  /* switching market: no reload, the address bar follows */
  secim.addEventListener("change", () => {
    const yeni = adIle.get(secim.value);
    if (!yeni) return;
    P = yeni; K = null; kalOynandi = false;
    kalGirdi.max = String(P.maxKal); kalGirdi.value = String(Math.min(5, P.maxKal));
    limitGirdi.value = tur === "limit" ? hl.fiyatYaz(P.mid || P.mark, P.szDec) : "";
    grafikBaslik.textContent = P.ad + "-USD";
    zincirNotu.hidden = true; durumYaz("");
    try { history.replaceState(null, "", "#/perps/trade?coin=" + encodeURIComponent(P.ad) + (salt ? "&as=" + kim : "")); } catch (e) { /* not allowed: the hash stays */ }
    olcCiz(); grafikYukle(); formGuncelle();
    if (kim) hl.kaldiracOku(kim, P.ad).then((k) => { if (P === yeni) { K = k; if (K && K.leverage) { kalGirdi.value = String(Math.min(P.maxKal, K.leverage.value)); if (!P.yalnizIzole) modSec.value = K.leverage.type === "isolated" ? "isolated" : "cross"; } formGuncelle(); } });
  });

  grafikPanel.classList.add("hl-g"); formPanel.classList.add("hl-f"); hesapPanel.classList.add("hl-h");
  kap.append(el("div", { sinif: "hl-izgara" }, [grafikPanel, formPanel, hesapPanel]));
  if (kim && !salt) { para = paraPaneli({ kim, cuzdan, hesapYukle: () => hesapYukle() }); kap.append(para.panel); }
  if (kim) kap.append(gecmisPaneli({ kim }));
  kap.append(panel("About trading here", el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "ikincil", yazi: "ARC PULSE is a front end: Hyperliquid runs the order book, the margin, liquidations and settlement. Your orders and positions are the same ones you see on Hyperliquid's own app. " + ONAY_METIN }),
    el("div", { sinif: "ikincil", yazi: "Prices, funding and volume come from Hyperliquid's public API and may be delayed. Funding is Hyperliquid's hourly rate; positive means longs pay shorts." }),
    el("div", { sinif: "hl-bag" }, [disBag(HL_APP + "/trade/" + encodeURIComponent(P.ad), "Hyperliquid app ↗"), disBag("https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes", "Builder codes (Hyperliquid docs) ↗")]),
  ])));

  formGuncelle(); hesapCiz();
  requestAnimationFrame(() => grafikYukle());
  hesapYukle();

  /* keep prices and the account fresh while this page is open and visible */
  const yenile = setInterval(async () => {
    if (!kap.isConnected) { clearInterval(yenile); window.removeEventListener("resize", boyut); return; }
    if (document.visibilityState !== "visible") return;
    try {
      const yeni = await hl.piyasalar();
      for (const p of yeni) { const e = adIle.get(p.ad); if (e) Object.assign(e, { mark: p.mark, mid: p.mid, dun: p.dun, hacim: p.hacim, fon: p.fon, oi: p.oi }); }
      olcCiz(); if (onizle.hidden) formGuncelle();
    } catch (e) { /* next round */ }
    if (kim && onizle.hidden) hesapYukle();
  }, 10000);
  const boyut = () => { if (sonMumlar.length > 1) grafikCiz(tuval, sonMumlar); };
  window.addEventListener("resize", boyut);
  return kap;
}
