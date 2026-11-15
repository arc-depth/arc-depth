/* ===========================================================================
 * gorunum/hl-alarm.js — Pulse alerts (#/perps/alerts, #/perps/alerts?coin=BTC)
 *
 * 15 Nov 2026 (owner approved). Set and manage the alerts that alarm.js watches. Everything stays in
 * this browser (localStorage); there is no server and no account. Alerts fire while ARC PULSE is open
 * in a tab; the page says so plainly.
 * =========================================================================== */

import { el, sayfaUst, panel, not } from "../ui.js";
import * as A from "../alarm.js";

const TUR = {
  fiyat: { ad: "Price", ikon: "💲" }, fon: { ad: "Funding", ikon: "💸" }, hedef: { ad: "Target Radar", ikon: "🎯" },
  olay: { ad: "Economic event", ikon: "🗓️" }, likit: { ad: "My liquidation risk", ikon: "🛡️" },
};
const HEDEF_TUR = { "": "Any condition", fon: "Funding extreme", sikisma: "Squeeze", kirilma: "Breakout", oi: "OI surge", capraz: "Funding gap", bant: "Range edge" };

export async function ciz({ param, cuzdan }) {
  document.title = "Pulse alerts — ARC PULSE";
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Pulse alerts", "Price, funding, Target Radar, economic events and your liquidation risk. Kept in this browser only.", [
    el("a", { sinif: "dugme dugme--sade", attr: { href: "#/perps/targets" }, yazi: "🎯 Target Radar" }),
    el("a", { sinif: "dugme dugme--marka", attr: { href: "#/perps/trade" + (param.get("coin") ? "?coin=" + encodeURIComponent(param.get("coin")) : "") }, yazi: "Trade" })]));
  kap.append(not("Alerts are checked every 30 seconds while ARC PULSE is open in a tab (a background tab is fine). With the site closed, nothing is checked. Nothing about your alerts or your wallet is sent anywhere.", "bilgi"));

  /* markets for the pickers */
  let coinler = ["BTC", "ETH", "SOL"];
  try {
    const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "metaAndAssetCtxs" }) }).then((x) => x.json());
    coinler = r[0].universe.map((u, i) => ({ ad: u.name, v: Number((r[1][i] || {}).dayNtlVlm), sil: u.isDelisted })).filter((x) => !x.sil && x.v > 0).sort((a, b) => b.v - a.v).map((x) => x.ad);
  } catch (e) { /* the short list */ }

  /* permission */
  const izinDurum = el("span", { sinif: "ikincil" });
  const izinCiz = () => { izinDurum.textContent = !("Notification" in window) ? "This browser has no notifications; alerts show as a banner on the page." : Notification.permission === "granted" ? "Browser notifications: on." : Notification.permission === "denied" ? "Browser notifications are blocked for this site; alerts show as a banner on the page. You can allow them in the browser's site settings." : "Browser notifications: not asked yet."; };
  izinCiz();
  const izinDug = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Allow notifications", on: { click: async () => { await A.bildirimIzni(); izinCiz(); } } });

  /* form */
  let tur = "fiyat";
  const turK = el("div", { sinif: "hd-filtre", attr: { style: "display:flex;flex-wrap:wrap;gap:6px" } });
  const coinSec = el("select", { sinif: "girdi", attr: { "aria-label": "Market" } }, coinler.map((c) => el("option", { attr: { value: c }, yazi: c })));
  if (param.get("coin") && coinler.includes(param.get("coin"))) coinSec.value = param.get("coin");
  const yonSec = el("select", { sinif: "girdi", attr: { "aria-label": "Condition" } }, [el("option", { attr: { value: "ust" }, yazi: "goes above" }), el("option", { attr: { value: "alt" }, yazi: "goes below" })]);
  const deger = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", "aria-label": "Value" } });
  const hedefSec = el("select", { sinif: "girdi", attr: { "aria-label": "Condition type" } }, Object.entries(HEDEF_TUR).map(([k, v]) => el("option", { attr: { value: k }, yazi: v })));
  const tekrar = el("input", { attr: { type: "checkbox", id: "al-tekrar" } });
  const ipucu = el("div", { sinif: "ikincil" });
  const alan = el("div", { sinif: "yigin yigin--sik" });
  const durum = el("div", { sinif: "ikincil", attr: { role: "status" } });

  async function onerFiyat() {
    try {
      const m = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "allMids" }) }).then((x) => x.json());
      const p = Number(m[coinSec.value]);
      if (p > 0 && tur === "fiyat") ipucu.textContent = coinSec.value + " now: $" + (p >= 1000 ? Math.round(p).toLocaleString("en-US") : Number(p.toPrecision(5)));
    } catch (e) { /* no hint */ }
  }
  function formCiz() {
    turK.replaceChildren(...Object.entries(TUR).map(([k, x]) => el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", "aria-pressed": String(tur === k), style: tur === k ? "border-color:var(--marka);color:var(--yazi-1)" : "" }, yazi: x.ikon + " " + x.ad, on: { click: () => { tur = k; formCiz(); } } })));
    ipucu.textContent = "";
    const satir = (...x) => el("div", { attr: { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px" } }, x);
    const tekrarSatir = el("label", { sinif: "hl-kutu", attr: { for: "al-tekrar", style: "display:flex;gap:8px;align-items:center;font-size:13.5px" } }, [tekrar, el("span", { yazi: "Repeat (at most once an hour) instead of switching off after it fires" })]);
    if (tur === "fiyat") { deger.placeholder = "Price in USD"; alan.replaceChildren(satir(coinSec, yonSec, deger), tekrarSatir, ipucu); onerFiyat(); }
    else if (tur === "fon") { deger.placeholder = "Hourly funding in %, e.g. 0.01"; alan.replaceChildren(satir(coinSec, yonSec, deger), tekrarSatir, el("div", { sinif: "ikincil", yazi: "Hyperliquid funding is hourly. 0.01%/h ≈ 88% a year. Negative: shorts pay longs." })); }
    else if (tur === "hedef") alan.replaceChildren(satir(hedefSec), el("div", { sinif: "ikincil", yazi: "Fires when a market newly appears on Target Radar (scanned hourly). Conditions, not calls." }));
    else if (tur === "olay") { deger.placeholder = "Minutes before, e.g. 30"; deger.value = deger.value || "30"; alan.replaceChildren(satir(deger), el("div", { sinif: "ikincil", yazi: "High-impact US releases (inflation, jobs, Fed) from the Forex Factory calendar." })); }
    else { deger.placeholder = "Distance in %, e.g. 5"; deger.value = deger.value || "5"; alan.replaceChildren(satir(deger), tekrarSatir, el("div", { sinif: "ikincil", yazi: cuzdan.hesap() ? "Watches the open Hyperliquid positions of the connected wallet; fires when the price is within this distance of a position's liquidation price." : "Connect your wallet first: this watches the open Hyperliquid positions of the connected wallet." })); }
  }
  coinSec.addEventListener("change", () => onerFiyat());
  const ekleDug = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Add alert", on: { click: async () => {
    const v = Number(String(deger.value).replace(/[$,%\s]/g, ""));
    const a = { tur, tekrar: tekrar.checked };
    if (tur === "fiyat" || tur === "fon") { if (!isFinite(v) || (tur === "fiyat" && !(v > 0))) { durum.textContent = "Enter a value."; return; } Object.assign(a, { coin: coinSec.value, yon: yonSec.value, deger: v }); }
    else if (tur === "hedef") Object.assign(a, { kosul: hedefSec.value || null });
    else if (tur === "olay") { if (!(v > 0)) { durum.textContent = "Enter minutes."; return; } a.deger = v; }
    else { if (!(v > 0)) { durum.textContent = "Enter a distance in %."; return; } if (!cuzdan.hesap()) { durum.textContent = "Connect your wallet first."; return; } a.deger = v; }
    if ("Notification" in window && Notification.permission === "default") { await A.bildirimIzni(); izinCiz(); }
    A.ekle(a); durum.textContent = "Alert added."; liste();
  } } });
  formCiz();
  kap.append(panel("New alert", el("div", { sinif: "yigin yigin--sik" }, [turK, alan, el("div", { attr: { style: "display:flex;gap:10px;align-items:center;flex-wrap:wrap" } }, [ekleDug, izinDug, izinDurum]), durum])));

  /* list */
  const govde = el("div", { sinif: "yigin yigin--sik" });
  const tarif = (a) => a.tur === "fiyat" ? a.coin + " price " + (a.yon === "ust" ? "above $" : "below $") + a.deger
    : a.tur === "fon" ? a.coin + " funding " + (a.yon === "ust" ? "above " : "below ") + a.deger + "%/h"
    : a.tur === "hedef" ? "New Target Radar market" + (a.kosul ? " (" + HEDEF_TUR[a.kosul] + ")" : "")
    : a.tur === "olay" ? "US high-impact event " + a.deger + " min before"
    : "My position within " + a.deger + "% of liquidation";
  function liste() {
    const l = A.alarmlar();
    govde.replaceChildren(...(l.length ? l.map((a) => el("div", { attr: { style: "display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid var(--cizgi);border-radius:12px;padding:10px 12px;flex-wrap:wrap" } }, [
      el("div", {}, [el("b", { yazi: (TUR[a.tur] || {}).ikon + " " + tarif(a) }), el("div", { sinif: "ikincil", yazi: (a.aktif ? "Active" : "Off") + (a.tekrar ? " · repeats" : "") + (a.tetik ? " · fired " + a.tetik + "×, last " + new Date(a.son).toLocaleString() : "") })]),
      el("div", { attr: { style: "display:flex;gap:6px" } }, [
        el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: a.aktif ? "Pause" : "Resume", on: { click: () => { A.degistir(a.id, { aktif: !a.aktif }); liste(); } } }),
        el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Delete", on: { click: () => { A.sil(a.id); liste(); } } })]),
    ])) : [el("div", { sinif: "ikincil", yazi: "No alerts yet." })]));
  }
  liste();
  const kes = A.dinle(() => { if (!kap.isConnected) { kes(); return; } liste(); });
  kap.append(panel("Your alerts (this browser)", govde, el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Check now", on: { click: () => A.simdiKontrol() } })));
  return kap;
}
