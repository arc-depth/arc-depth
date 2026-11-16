/* ===========================================================================
 * gorunum/hl-kitap.js — order book and recent trades beside the chart (16 Nov 2026 redesign, approved demo screen 9)
 *
 * Hyperliquid's public l2Book (10 levels a side) and recentTrades for the market on screen, refreshed every 2.5 s
 * while the panel is on screen and the tab visible. A price in the book is a button: it puts that price into the
 * order form's limit field. Nothing is stored.
 * =========================================================================== */
import { el, panel } from "../ui.js";

const STIL = `
.kt{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-variant-numeric:tabular-nums}
.kt-sekme{display:flex;gap:14px;border-bottom:1px solid var(--cizgi)}
.kt-sekme button{background:none;border:0;border-bottom:2px solid transparent;padding:0 0 7px;color:var(--yazi-3);font:500 13px var(--yazi-tipi);cursor:pointer}
.kt-sekme button[aria-selected=true]{color:var(--yazi-1);font-weight:600;border-bottom-color:var(--marka)}
.kt-bas{display:grid;grid-template-columns:1fr 1fr;color:var(--yazi-3);font-size:11px;padding:0 4px}.kt-bas span:last-child{text-align:right}
.kt-sat{all:unset;box-sizing:border-box;display:grid;grid-template-columns:1fr 1fr;padding:2.5px 4px;cursor:pointer;width:100%;border-radius:4px}
.kt-sat:hover{background:var(--yuzey-2)}.kt-sat span:last-child{text-align:right;color:var(--yazi-2)}
.kt-orta{display:flex;justify-content:space-between;align-items:baseline;padding:6px 4px;border-top:1px solid var(--cizgi);border-bottom:1px solid var(--cizgi)}
.kt-orta b{font-size:15px}.kt-orta small{color:var(--yazi-3)}
.kt-is{display:grid;grid-template-columns:1fr 1fr 52px;padding:2.5px 4px}.kt-is span:nth-child(2){text-align:right;color:var(--yazi-2)}.kt-is span:last-child{text-align:right;color:var(--yazi-3)}
`;

/** `P()` the market on screen, `fiyat(x)` the page's price format, `sec(px)` puts a price into the form */
export function kitapPaneli({ hl, P, fiyat, sec }) {
  if (!document.getElementById("kt-stil")) document.head.append(el("style", { attr: { id: "kt-stil" }, yazi: STIL }));
  let sekme = "kitap", son = null, sonIs = null;
  const govde = el("div", { sinif: "kt" });
  const kutu = panel("Order book", govde);
  const ciz = () => {
    const sekmeler = el("div", { sinif: "kt-sekme", attr: { role: "tablist" } }, [["kitap", "Book"], ["is", "Trades"]].map(([k, ad]) =>
      el("button", { attr: { type: "button", role: "tab", "aria-selected": String(sekme === k) }, yazi: ad, on: { click: () => { sekme = k; ciz(); yukle(); } } })));
    if (sekme === "kitap") {
      if (!son) { govde.replaceChildren(sekmeler, el("div", { sinif: "ikincil", yazi: "Loading…" })); return; }
      const [alis, satis] = son.levels;
      const a = (satis || []).slice(0, 10), b = (alis || []).slice(0, 10);
      const enCok = Math.max(...a.concat(b).map((x) => Number(x.sz)), 1e-9);
      const satir = (x, renk, zemin) => {
        const w = Math.round(Number(x.sz) / enCok * 100);
        const s = el("button", { sinif: "kt-sat", attr: { type: "button", title: "Use " + x.px + " as the limit price", style: "background:linear-gradient(270deg," + zemin + " " + w + "%,transparent " + w + "%)" } }, [
          el("span", { attr: { style: "color:" + renk }, yazi: fiyat(Number(x.px)) }), el("span", { yazi: Number(x.sz).toLocaleString("en-US", { maximumFractionDigits: 4 }) })]);
        s.addEventListener("click", () => sec(Number(x.px)));
        return s;
      };
      const iyiA = a[0] ? Number(a[0].px) : null, iyiB = b[0] ? Number(b[0].px) : null;
      const yayilma = iyiA && iyiB ? ((iyiA - iyiB) / ((iyiA + iyiB) / 2) * 100).toFixed(3) + "%" : "—";
      govde.replaceChildren(sekmeler, el("div", { sinif: "kt-bas" }, [el("span", { yazi: "Price" }), el("span", { yazi: "Size (" + P().ad + ")" })]),
        ...a.slice().reverse().map((x) => satir(x, "var(--satis)", "rgba(255,107,122,.13)")),
        el("div", { sinif: "kt-orta" }, [el("b", { yazi: iyiA && iyiB ? fiyat((iyiA + iyiB) / 2) : "—" }), el("small", { yazi: "spread " + yayilma })]),
        ...b.map((x) => satir(x, "var(--alis)", "rgba(46,209,138,.13)")));
    } else {
      if (!sonIs) { govde.replaceChildren(sekmeler, el("div", { sinif: "ikincil", yazi: "Loading…" })); return; }
      govde.replaceChildren(sekmeler, el("div", { sinif: "kt-bas", attr: { style: "grid-template-columns:1fr 1fr 52px" } }, [el("span", { yazi: "Price" }), el("span", { attr: { style: "text-align:right" }, yazi: "Size" }), el("span", { attr: { style: "text-align:right" }, yazi: "Time" })]),
        ...sonIs.slice(0, 22).map((t) => el("div", { sinif: "kt-is" }, [
          el("span", { attr: { style: "color:" + (t.side === "B" ? "var(--alis)" : "var(--satis)") }, yazi: fiyat(Number(t.px)) }),
          el("span", { yazi: Number(t.sz).toLocaleString("en-US", { maximumFractionDigits: 4 }) }),
          el("span", { yazi: new Date(t.time).toLocaleTimeString("en-GB", { hour12: false }) })])));
    }
  };
  let calisiyor = false, coin = null;
  const yukle = async () => {
    if (calisiyor) return; calisiyor = true;
    try {
      const c = P().ad;
      if (c !== coin) { coin = c; son = null; sonIs = null; ciz(); }
      if (sekme === "kitap") son = await hl.bilgi({ type: "l2Book", coin: c });
      else sonIs = await hl.bilgi({ type: "recentTrades", coin: c });
      if (P().ad === c) ciz();
    } catch (e) { /* next round */ }
    calisiyor = false;
  };
  const zamanlayici = setInterval(() => {
    if (!kutu.isConnected) { if (coin) clearInterval(zamanlayici); return; }
    if (document.visibilityState === "visible") yukle();
  }, 2500);
  ciz(); yukle();
  return { panel: kutu, yenile: () => { coin = null; yukle(); } };
}
