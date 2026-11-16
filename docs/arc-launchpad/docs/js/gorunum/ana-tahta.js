/* ===========================================================================
 * gorunum/ana-tahta.js — the Home board (16 Nov 2026 redesign, the demo the owner approved)
 *
 * A launch card, then one list with four tabs:
 *   Trending   hottest tokens on our chains right now (GeckoTerminal, the same feed as Market)
 *   New        newest pools on our chains with real liquidity
 *   ARC PULSE  launches made from ARC PULSE (Warp and our own launchpad), demo tokens last
 *   Perps      Hyperliquid's busiest markets
 * Every row: logo, symbol, chain, market cap · age, price, 24 h change, and a lightning quick-buy.
 * No wallet needed to look at any of it; buying asks for one at that moment.
 * =========================================================================== */
import { el } from "../ui.js";
import { fiyatYaz } from "./portfoy-ust.js";

const STIL = `
.at{display:flex;flex-direction:column;gap:14px}
.at-kart{display:flex;align-items:center;gap:14px;padding:16px;border-radius:16px;background:linear-gradient(135deg,#1d1636,#121220);border:1px solid #2c2450;text-decoration:none;color:inherit}
.at-kart b{display:block;font-size:17px}.at-kart small{display:block;font-size:13px;color:var(--yazi-2);margin-top:3px}
.at-kart span.d{margin-left:auto;flex:none;height:38px;padding:0 16px;border-radius:11px;background:#f2f2f5;color:#0b0b10;font-weight:600;font-size:14px;display:grid;place-items:center}
.at-ikili{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
.at-kart--perps{background:linear-gradient(135deg,#10261c,#121218);border-color:#1e3a2d}
.at-kart--perps span.d{background:var(--alis);color:#04150e}
.at-cipler{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}.at-cipler::-webkit-scrollbar{display:none}
.at-cipler button{flex:none;height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--cizgi-guclu);background:transparent;color:var(--yazi-2);font:500 13.5px var(--yazi-tipi);cursor:pointer}
.at-cipler button[aria-pressed=true]{border-color:#3a2f6b;background:#1c1730;color:#e6deff;font-weight:600}
.at-bas{display:flex;justify-content:space-between;font-size:12px;color:var(--yazi-3);padding:0 6px}
.at-liste{display:flex;flex-direction:column}
.at-satir{display:flex;align-items:center;gap:12px;padding:11px 6px;border-bottom:1px solid var(--cizgi);color:inherit;text-decoration:none;cursor:pointer;background:none;border-left:0;border-right:0;border-top:0;font:inherit;text-align:left;width:100%}
.at-satir:hover{background:var(--yuzey-1)}
.at-logo{flex:none;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-weight:700;font-size:12px;color:#0b0b10;overflow:hidden}
.at-logo img{width:100%;height:100%;object-fit:cover}
.at-ad{flex:1;min-width:0}.at-ad strong{font-size:15px}
.at-ad div{font-size:12.5px;color:var(--yazi-3);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.at-z{font-size:11px;color:var(--yazi-3);padding:1px 6px;border:1px solid var(--cizgi-guclu);border-radius:6px;margin-left:6px;font-weight:500}
.at-fiyat{text-align:right;font-variant-numeric:tabular-nums;min-width:80px}.at-fiyat strong{font-size:14.5px}.at-fiyat div{font-size:12.5px;font-weight:600}
.at-al{flex:none;width:38px;height:38px;border-radius:11px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-1);color:var(--alis);display:grid;place-items:center;cursor:pointer;text-decoration:none}
.at-al svg{width:17px;height:17px}
.at-art{color:var(--alis)}.at-eks{color:var(--satis)}
.at-bos{padding:24px 6px;color:var(--yazi-3);font-size:13.5px}
.at-daha{align-self:flex-start}
`;
const RENK = ["#B9A6FF", "#7CE3B4", "#F0C75E", "#7FB6FF", "#D7F98A", "#8EE6D2", "#FF9F6B", "#F7A8D8"];
const renk = (s) => RENK[[...String(s)].reduce((t, c) => t + c.charCodeAt(0), 0) % RENK.length];
const kisa = (x) => x == null || !isFinite(x) || x <= 0 ? "—" : "$" + (x >= 1e9 ? (x / 1e9).toFixed(2) + "B" : x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? (x / 1e3).toFixed(1) + "K" : x.toFixed(0));
const yas = (ms) => { if (!ms) return ""; const s = (Date.now() - ms) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; };
const SIMSEK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';

function satir({ href, tik, resim, ad, zincir, alt, fiyat, deg, alHref, alTik }) {
  const logo = el("span", { sinif: "at-logo", attr: { style: "background:" + renk(ad) } }, [String(ad).slice(0, 3).toUpperCase()]);
  if (resim) { const i = el("img", { attr: { src: resim, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }); i.addEventListener("error", () => i.remove()); logo.replaceChildren(i); }
  const d = deg == null || !isFinite(deg) ? null : Number(deg);
  const ic = [logo,
    el("span", { sinif: "at-ad" }, [el("strong", { yazi: ad }), zincir ? el("span", { sinif: "at-z", yazi: zincir }) : null, el("div", { yazi: alt })]),
    el("span", { sinif: "at-fiyat" }, [el("strong", { yazi: fiyat }), el("div", { sinif: d > 0 ? "at-art" : d < 0 ? "at-eks" : "", attr: d ? {} : { style: "color:var(--yazi-3)" }, yazi: d == null ? "—" : (d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d).toFixed(1) + "%" })])];
  const al = alHref ? el("a", { sinif: "at-al", attr: { href: alHref, "aria-label": "Buy " + ad }, html: SIMSEK })
    : alTik ? el("button", { sinif: "at-al", attr: { type: "button", "aria-label": "Buy " + ad }, html: SIMSEK }) : null;
  if (al && alTik) al.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); alTik(); });
  if (al && alHref) al.addEventListener("click", (e) => e.stopPropagation());
  const kok = href ? el("a", { sinif: "at-satir", attr: { href } }, ic) : el("button", { sinif: "at-satir", attr: { type: "button" } }, ic);
  if (tik) kok.addEventListener("click", tik);
  return el("div", { attr: { style: "display:flex;align-items:center;gap:8px" } }, [kok, al]);
}

export function anaTahta() {
  if (!document.getElementById("at-stil")) document.head.append(el("style", { attr: { id: "at-stil" }, yazi: STIL }));
  const kok = el("section", { sinif: "at", attr: { "aria-label": "Markets" } });
  kok.append(el("div", { sinif: "at-ikili" }, [
    el("a", { sinif: "at-kart", attr: { href: "#/olustur" } }, [el("div", {}, [el("b", { yazi: "Launch on any chain in 60s" }), el("small", { yazi: "One pool on Arc · the same price on 13 chains" })]), el("span", { sinif: "d", yazi: "Create" })]),
    el("a", { sinif: "at-kart at-kart--perps", attr: { href: "#/perps/trade" } }, [el("div", {}, [el("b", { yazi: "Trade Hyperliquid perps" }), el("small", { yazi: "Size by risk · see the odds before you trade" })]), el("span", { sinif: "d", yazi: "Perps" })]),
  ]));

  const SEKME = [["trend", "Trending"], ["yeni", "New"], ["biz", "ARC PULSE"], ["perps", "Perps"]];
  let sekme = "trend";
  const cipler = el("div", { sinif: "at-cipler", attr: { role: "group", "aria-label": "List" } });
  const bas = el("div", { sinif: "at-bas" });
  const liste = el("div", { sinif: "at-liste", attr: { "aria-live": "polite" } });
  const daha = el("a", { sinif: "dugme dugme--sade dugme--kucuk at-daha" });
  kok.append(cipler, bas, liste, daha);

  const onbellek = {};
  const yukle = {
    trend: async () => { const v = await import("./vitrin.js"); return v.trendListe(15); },
    yeni: async () => { const v = await import("./vitrin.js"); return v.trendListe(15); },
    biz: async () => {
      const [t, lk] = await Promise.all([import("./terminal.js"), import("../launch-kaynak.js")]);
      const K = await lk.launchKaynagi();
      const rows = lk.demoSonda(K.satirlar).slice(0, 15);
      const v = await t.launchPiyasa(rows).catch(() => ({}));
      return rows.map((s) => ({ s, v: v[String(s.token).toLowerCase()] }));
    },
    perps: async () => { const hl = await import("../hl.js"); return (await hl.piyasalar()).sort((a, b) => b.hacim - a.hacim).slice(0, 15); },
  };
  const ciz = () => {
    cipler.replaceChildren(...SEKME.map(([k, ad]) => { const b = el("button", { attr: { type: "button", "aria-pressed": String(sekme === k) }, yazi: ad }); b.addEventListener("click", () => { sekme = k; ciz(); }); return b; }));
    bas.replaceChildren(el("span", { yazi: sekme === "perps" ? "Market · 24h volume" : "Token · market cap · age" }), el("span", { yazi: "Price · 24h" }));
    const DAHA = { trend: ["#/vitrin", "All trending tokens in Market →"], yeni: ["#/vitrin", "More new tokens in Market →"], biz: ["#/terminal", "Every ARC PULSE launch →"], perps: ["#/perps/targets", "Scan every market in Target Radar →"] };
    daha.setAttribute("href", DAHA[sekme][0]); daha.textContent = DAHA[sekme][1];
    const k = sekme;
    if (!onbellek[k]) { liste.replaceChildren(el("div", { sinif: "at-bos", yazi: "Loading…" })); onbellek[k] = yukle[k]().catch((e) => ({ hata: (e && e.message) || String(e) })); }
    onbellek[k].then((d) => { if (sekme !== k) return; doldur(k, d); });
  };
  function doldur(k, d) {
    if (d && d.hata) { liste.replaceChildren(el("div", { sinif: "at-bos", yazi: "Could not load this list right now. Try again in a minute." })); delete onbellek[k]; return; }
    let rows = [];
    if (k === "trend" || k === "yeni") {
      const l = k === "trend" ? d.trend : d.yeni;
      rows = l.map((t) => satir({ tik: () => d.al(t), resim: t.resim, ad: t.sembol, zincir: t.zincir.ad, alt: "MC " + kisa(Number(t.fdv)) + (t.kuruldu ? " · " + yas(Date.parse(t.kuruldu)) : ""), fiyat: fiyatYaz(Number(t.fiyat)), deg: t.degisim == null ? null : Number(t.degisim), alTik: () => d.al(t) }));
    } else if (k === "biz") {
      rows = d.map(({ s, v }) => satir({ href: "#/terminal?t=" + encodeURIComponent(s.token), resim: s.gorsel || (v && v.resim), ad: s.sembol || s.ad || "?", zincir: s.zincir, alt: "MC " + kisa(v && v.mcap) + (s.zaman ? " · " + yas(s.zaman * 1000) : "") + (s.demo ? " · demo" : ""), fiyat: v ? fiyatYaz(Number(v.fiyat)) : "—", deg: v && v.deg != null ? Number(v.deg) : null, alHref: s.git || "#/terminal?t=" + encodeURIComponent(s.token) }));
    } else {
      rows = d.map((p) => satir({ href: "#/perps/trade?coin=" + encodeURIComponent(p.ad), ad: p.ad, zincir: p.maxKal + "×", alt: "Vol " + kisa(p.hacim) + " · OI " + kisa(p.oi), fiyat: fiyatYaz(p.mark), deg: p.dun > 0 ? (p.mark / p.dun - 1) * 100 : null, alHref: "#/perps/trade?coin=" + encodeURIComponent(p.ad) }));
    }
    liste.replaceChildren(...(rows.length ? rows : [el("div", { sinif: "at-bos", yazi: "Nothing here right now." })]));
  }
  ciz();
  return kok;
}
