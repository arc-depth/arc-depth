/* ===========================================================================
 * gorunum/hl-gecmis.js — "History" on #/perps/trade (15 Nov 2026, v2): fills and funding payments
 *
 * Public Hyperliquid reads for the visitor's address: userFills (the latest 2000, shown 20 at a time)
 * and userFunding (7 days at a time, "Older" reads the 7 days before). Read when the tab is opened and
 * on "Refresh"; nothing is stored.
 * =========================================================================== */

import { el, panel, sekmeler } from "../ui.js";
import * as hl from "../hl.js";

const SAYFA = 20, HAFTA = 7 * 864e5;
const zaman = (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
const usd = (x, d = 2) => (x == null || !isFinite(x) ? "–" : (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fiyat = (p) => (!(p > 0) ? "–" : "$" + p.toLocaleString("en-US", { maximumSignificantDigits: 6 }));
const isaret = (x) => (x > 0 ? "hl-art" : x < 0 ? "hl-eks" : "");

function tablo(basliklar, satirlar) {
  const t = el("table", { sinif: "hl-tablo" });
  t.append(el("thead", {}, [el("tr", {}, basliklar.map((b, i) => el("th", { sinif: i > 1 ? "sayi" : "", yazi: b })))]));
  t.append(el("tbody", {}, satirlar));
  return el("div", { sinif: "hl-sarmal" }, [t]);
}

export function gecmisPaneli({ kim }) {
  const govde = el("div", { sinif: "yigin yigin--sik" });
  let sekme = "dolgu";
  let dolgular = null, dolguGoster = SAYFA;
  let fonlar = null, fonBas = Date.now() - HAFTA;

  async function ciz(yeniden = false) {
    govde.replaceChildren(el("div", { sinif: "ikincil", yazi: "Reading from Hyperliquid…" }));
    try {
      if (sekme === "dolgu") {
        if (!dolgular || yeniden) { dolgular = await hl.dolgularOku(kim); dolguGoster = SAYFA; }
        if (!dolgular.length) { govde.replaceChildren(el("div", { sinif: "ikincil", yazi: "No fills yet." })); return; }
        const s = dolgular.slice(0, dolguGoster).map((f) => el("tr", {}, [
          el("td", { attr: { "data-et": "Time" }, yazi: zaman(f.time) }),
          el("td", { attr: { "data-et": "Market" } }, [el("strong", { yazi: f.coin }), " ", el("span", { sinif: f.side === "B" ? "hl-art" : "hl-eks", yazi: f.dir || (f.side === "B" ? "Buy" : "Sell") })]),
          el("td", { sinif: "sayi", attr: { "data-et": "Price" }, yazi: fiyat(Number(f.px)) }),
          el("td", { sinif: "sayi", attr: { "data-et": "Size" }, yazi: f.sz }),
          el("td", { sinif: "sayi", attr: { "data-et": "Fee" }, yazi: usd(Number(f.fee), 4) + (f.builderFee ? " (incl. builder " + usd(Number(f.builderFee), 4) + ")" : "") }),
          el("td", { sinif: "sayi " + isaret(Number(f.closedPnl)), attr: { "data-et": "Closed PnL" }, yazi: Number(f.closedPnl) ? usd(Number(f.closedPnl)) : "–" }),
        ]));
        const daha = dolguGoster < dolgular.length ? el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Show more", on: { click: () => { dolguGoster += SAYFA; ciz(); } } }) : null;
        govde.replaceChildren(tablo(["Time", "Market", "Price", "Size", "Fee", "Closed PnL"], s), el("div", { sinif: "hl-ipucu", yazi: "Showing " + Math.min(dolguGoster, dolgular.length) + " of the latest " + dolgular.length + " fills (Hyperliquid keeps the latest 2000 here)." }), daha);
      } else {
        if (!fonlar || yeniden) { fonBas = Date.now() - HAFTA; fonlar = await hl.fonlamaOku(kim, fonBas, Date.now()); }
        const s = fonlar.map((f) => {
          const d = f.delta || {};
          return el("tr", {}, [
            el("td", { attr: { "data-et": "Time" }, yazi: zaman(f.time) }),
            el("td", { attr: { "data-et": "Market" } }, [el("strong", { yazi: d.coin || "–" }), " ", el("span", { sinif: "hl-ipucu", yazi: d.szi ? "size " + d.szi : "" })]),
            el("td", { sinif: "sayi " + isaret(Number(d.usdc)), attr: { "data-et": "Payment" }, yazi: usd(Number(d.usdc), 4) }),
            el("td", { sinif: "sayi", attr: { "data-et": "Rate (1h)" }, yazi: d.fundingRate != null ? (Number(d.fundingRate) * 100).toFixed(4) + "%" : "–" }),
          ]);
        });
        const toplam = fonlar.reduce((t, f) => t + Number((f.delta || {}).usdc || 0), 0);
        const eski = el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Older (7 days before " + zaman(fonBas).replace(/, \d\d:\d\d UTC$/, "") + ")", on: { click: async (ev) => {
          ev.target.disabled = true;
          try { const bit = fonBas; fonBas -= HAFTA; fonlar = fonlar.concat(await hl.fonlamaOku(kim, fonBas, bit)); } catch (e) { /* shown as is */ }
          ciz();
        } } });
        govde.replaceChildren(
          fonlar.length ? tablo(["Time", "Market", "Payment", "Rate (1h)"], s) : el("div", { sinif: "ikincil", yazi: "No funding payments since " + zaman(fonBas) + "." }),
          el("div", { sinif: "hl-ipucu", yazi: "Since " + zaman(fonBas) + ": " + usd(toplam, 4) + " in total. Negative = you paid, positive = you received." }), eski);
      }
    } catch (e) { govde.replaceChildren(el("div", { sinif: "ikincil", yazi: "Could not read the history from Hyperliquid: " + ((e && e.message) || e) })); }
  }

  const tazele = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Refresh", on: { click: () => ciz(true) } });
  const p = panel("History", el("div", { sinif: "yigin yigin--sik" }, [
    sekmeler([{ anahtar: "dolgu", ad: "Fills" }, { anahtar: "fon", ad: "Funding" }], sekme, (k) => { sekme = k; ciz(); }),
    govde]), tazele);
  p.classList.add("hl-gecmis");
  /* read when the panel first scrolls into view */
  const gozcu = new IntersectionObserver((g) => { if (g.some((x) => x.isIntersecting)) { gozcu.disconnect(); ciz(); } });
  gozcu.observe(p);
  govde.append(el("div", { sinif: "ikincil", yazi: "Scroll here to load your fills and funding." }));
  return p;
}
