/* ===========================================================================
 * gorunum/radar.js — the Radar tab (#/radar, #/radar?tab=perp). 23 Nov 2026, owner: "trade yerine radar yaz, tradenin
 * içeriğini bozma … orda launch ve perp radar kısımları olsun". The phone's bottom bar slot that said Trade now says
 * Radar and opens this page: Launch Radar (new tokens on 13 chains) and Perp Radar (Hyperliquid perps by published
 * rules) under one switch. Trade itself is unchanged and stays in the top bar, More and every Trade button.
 * =========================================================================== */
import { el } from "../ui.js";

const SEKME = [["launch", "🚀 Launch Radar", "New tokens on 13 chains"], ["perp", "📡 Perp Radar", "Hyperliquid perps by the book"]];
const STIL = `
.rd-sec{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:1100px;margin:0 auto 14px;width:100%}
.rd-sec a{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:14px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-1);color:var(--yazi-2);text-decoration:none}
.rd-sec a b{font-size:15.5px;color:var(--yazi-1)}.rd-sec a small{font-size:12px;color:var(--yazi-3)}
.rd-sec a[aria-current=true]{border-color:var(--marka);background:rgba(124,92,255,.14);box-shadow:0 0 0 1px var(--marka) inset}
`;

export async function ciz({ param } = {}) {
  if (!document.getElementById("rd-stil")) document.head.append(el("style", { attr: { id: "rd-stil" }, yazi: STIL }));
  const sekme = param && param.get("tab") === "perp" ? "perp" : "launch";
  const kok = el("div", {}); kok.dataset.icindekilerYok = "1";
  kok.append(el("nav", { sinif: "rd-sec", attr: { "aria-label": "Radar" } }, SEKME.map(([k, a, alt]) => el("a", { attr: { href: "#/radar" + (k === "perp" ? "?tab=perp" : ""), "aria-current": String(sekme === k) } }, [el("b", { yazi: a }), el("small", { yazi: alt })]))));
  const m = sekme === "perp" ? await import("./perp-radar.js") : await import("./launch-radar.js");
  kok.append(await m.ciz({ param }));
  return kok;
}
