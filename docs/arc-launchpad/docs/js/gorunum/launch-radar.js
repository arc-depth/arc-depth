/* ===========================================================================
 * gorunum/launch-radar.js — Launch Radar (#/launch-radar). 23 Nov 2026, owner: "Launch Radar 13 zincir olacak şekilde".
 *
 * For visitors: new and recently launched tokens on 13 chains and their launchpads, each run through the same five
 * checks (safety, real demand, many wallets, liquidity depth, buyers vs sellers), so anyone can see at a glance which
 * launches have real activity. It never shows ARC PULSE's own trading. Data: veri/launch-radar.json
 * (scripts/launch-radar.js, every 15 min / hourly); prices refreshed live in the browser from DexScreener.
 * The radar: 13 chain sectors, newest tokens nearest the centre, size = 24 h volume, colour = checks passed.
 * Nothing about the visitor is sent anywhere or stored by ARC PULSE. Not advice.
 * =========================================================================== */
import { el } from "../ui.js";
import { fiyatYaz } from "./portfoy-ust.js";

const ZINCIR = [["arc", "Arc"], ["elysium", "Elysium"], ["solana", "Solana"], ["base", "Base"], ["bsc", "BNB"], ["ethereum", "Ethereum"], ["arbitrum", "Arbitrum"],
  ["avalanche", "Avalanche"], ["monad", "Monad"], ["hyperevm", "HyperEVM"], ["robinhood", "Robinhood"], ["sui", "Sui"], ["aptos", "Aptos"]];
const ZAD = Object.fromEntries(ZINCIR);
const GECKO_AG = { arc: "arc", elysium: "elysium", solana: "solana", base: "base", bsc: "bsc", ethereum: "eth", arbitrum: "arbitrum", avalanche: "avax", monad: "monad", hyperevm: "hyperevm", robinhood: "robinhood", sui: "sui-network", aptos: "aptos" };
const TAKASSIZ = new Set(["sui", "aptos"]);
const EVRE = { curve: "On curve", new: "New · <1h", today: "Today", week: "This week" };
const KONTROL = ["guvenlik", "talep", "genislik", "derinlik", "denge"];
const STIL = `
.lr{display:flex;flex-direction:column;gap:14px;min-width:0;max-width:1100px;margin:0 auto}
.lr-ust h1{margin:0;font-size:26px;letter-spacing:-.01em}.lr-ust p{margin:4px 0 0;color:var(--yazi-3);font-size:13.5px;line-height:1.5;max-width:760px}
.lr-canli{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--alis);font-weight:600}.lr-canli::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--alis);box-shadow:0 0 8px var(--alis);animation:lrNabiz 1.4s infinite}
@keyframes lrNabiz{50%{opacity:.3}}
.lr-cip{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.lr-cip::-webkit-scrollbar{display:none}
.lr-cip button{flex:none;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--cizgi-guclu);background:none;color:var(--yazi-2);font:500 13px var(--yazi-tipi);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.lr-cip button[aria-pressed=true]{border-color:var(--marka);background:rgba(124,92,255,.15);color:var(--yazi-1)}
.lr-cip small{color:var(--yazi-3);font-size:11.5px}
.lr-ust-izgara{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px}
.lr-kutu{background:var(--yuzey-1);border:1px solid var(--cizgi);border-radius:16px;padding:14px;min-width:0}
.lr-kutu h2{margin:0 0 10px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--yazi-3);font-weight:700;display:flex;justify-content:space-between;gap:8px}
.lr-radar{position:relative;background:radial-gradient(circle at 50% 50%,#10162a 0,#07090f 70%);border-radius:12px;overflow:hidden}
.lr-radar canvas{display:block;width:100%;height:440px;cursor:crosshair}
.lr-ipucu{position:absolute;pointer-events:none;background:rgba(10,12,20,.94);border:1px solid var(--cizgi-guclu);border-radius:10px;padding:8px 10px;font-size:12px;color:var(--yazi-1);max-width:220px;display:none;z-index:2}
.lr-ozet{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
.lr-ozet div{background:var(--yuzey-0);border:1px solid var(--cizgi);border-radius:12px;padding:8px 10px}.lr-ozet b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.lr-ozet span{font-size:11.5px;color:var(--yazi-3)}
.lr-lp{width:100%;border-collapse:collapse;font-size:13px}.lr-lp th{text-align:left;color:var(--yazi-3);font-weight:600;font-size:11.5px;padding:6px 6px;border-bottom:1px solid var(--cizgi)}
.lr-lp td{padding:7px 6px;border-bottom:1px solid var(--cizgi);font-variant-numeric:tabular-nums}.lr-lp tr:last-child td{border-bottom:0}.lr-lp tr{cursor:pointer}.lr-lp tr:hover td{background:var(--yuzey-2)}
.lr-lp td:first-child{font-weight:600}.lr-lp small{color:var(--yazi-3)}
.lr-sekme{display:flex;gap:18px;border-bottom:1px solid var(--cizgi);overflow-x:auto;scrollbar-width:none}.lr-sekme::-webkit-scrollbar{display:none}
.lr-sekme button{background:none;border:0;color:var(--yazi-3);font:600 15px var(--yazi-tipi);padding:8px 0 10px;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap}
.lr-sekme button[aria-selected=true]{color:var(--yazi-1);border-bottom-color:var(--marka)}
.lr-arac{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.lr-ara{flex:1;min-width:180px;height:40px;border-radius:12px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-0);color:var(--yazi-1);padding:0 12px;font:14px var(--yazi-tipi)}
.lr-sec{height:40px;border-radius:12px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-0);color:var(--yazi-1);padding:0 10px;font:14px var(--yazi-tipi)}
.lr-liste{display:flex;flex-direction:column;background:var(--yuzey-1);border:1px solid var(--cizgi);border-radius:16px;overflow:hidden}
.lr-kart{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:start;padding:12px 14px;border-bottom:1px solid var(--cizgi);color:inherit;text-decoration:none}
.lr-kart:last-child{border-bottom:0}.lr-kart:hover{background:var(--yuzey-2)}.lr-kart.lr-vurgu{background:rgba(124,92,255,.12)}
.lr-logo{width:44px;height:44px;border-radius:50%;object-fit:cover;background:#2a2a36;display:grid;place-items:center;font:800 13px var(--yazi-tipi);color:#cfcfe0}
.lr-ad{min-width:0}.lr-ad b{font-size:15.5px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden}
.lr-ad small{display:block;font-size:12.5px;color:var(--yazi-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.lr-etiket{flex:none;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;background:var(--yuzey-2);color:var(--yazi-2)}
.lr-etiket--curve{background:rgba(245,194,107,.15);color:#f5c26b}.lr-etiket--new{background:rgba(51,225,255,.14);color:#33e1ff}.lr-etiket--today{background:rgba(124,92,255,.16);color:#b9a6ff}
.lr-kontrol{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
.lr-k{font-size:11.5px;border-radius:8px;padding:2px 7px;white-space:nowrap;border:1px solid var(--cizgi-guclu);color:var(--yazi-3);cursor:help;background:none;font-family:var(--yazi-tipi)}
.lr-k--ok{border-color:rgba(46,209,138,.45);color:var(--alis);background:rgba(46,209,138,.08)}.lr-k--no{border-color:rgba(255,107,122,.4);color:var(--satis);background:rgba(255,107,122,.07)}.lr-k--warn{border-color:rgba(245,194,107,.45);color:#f5c26b;background:rgba(245,194,107,.08)}
.lr-detay{grid-column:2/-1;font-size:12.5px;color:var(--yazi-2);line-height:1.55;display:none}.lr-kart[data-acik="1"] .lr-detay{display:block}
.lr-sag{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.lr-fiyat b{display:block;font-size:15px;font-variant-numeric:tabular-nums}.lr-fiyat span{font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
.lr-art{color:var(--alis)}.lr-eks{color:var(--satis)}
.lr-al{height:32px;padding:0 14px;border-radius:999px;border:0;background:var(--alis);color:#04150e;font:700 13px var(--yazi-tipi);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.lr-al--gri{background:var(--yuzey-2);color:var(--yazi-1)}
.lr-bos{padding:24px 16px;color:var(--yazi-3);font-size:14px;text-align:center}
.lr-alt{font-size:12px;color:var(--yazi-3);line-height:1.6}
.lr-alt b{color:var(--yazi-2)}
@media (max-width:860px){.lr-ust-izgara{grid-template-columns:1fr}.lr-radar canvas{height:360px}.lr-ozet{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.lr-kart{grid-template-columns:40px minmax(0,1fr);gap:10px;padding:11px 12px}.lr-logo{width:40px;height:40px}.lr-sag{grid-column:2;flex-direction:row;align-items:center;justify-content:space-between;text-align:left}.lr-fiyat{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.lr-al{display:inline-flex;height:30px}.lr-k{font-size:11px;padding:1px 6px}}
`;
const kisa = (x) => !(x > 0) ? "—" : "$" + (x >= 1e9 ? (x / 1e9).toFixed(2) + "B" : x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? (x / 1e3).toFixed(0) + "K" : x.toFixed(0));
const yasYaz = (h) => h == null ? "" : h < 1 ? Math.max(1, Math.round(h * 60)) + "m" : h < 48 ? Math.round(h) + "h" : Math.round(h / 24) + "d";
const yuzde = (x) => x == null || !Number.isFinite(x) ? "—" : (x > 0 ? "+" : "") + x.toFixed(1) + "%";

async function dsMulti(z, adresler) {
  const l = await fetch("https://api.dexscreener.com/tokens/v1/" + z + "/" + adresler.join(",")).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const en = new Map();
  for (const p of Array.isArray(l) ? l : []) { const a = String(p.baseToken && p.baseToken.address || "").toLowerCase(), liq = Number(p.liquidity && p.liquidity.usd) || 0; if (a && (!en.has(a) || en.get(a).liq < liq)) en.set(a, { liq, p }); }
  return en;
}

export async function ciz() {
  if (!document.getElementById("lr-stil")) document.head.append(el("style", { attr: { id: "lr-stil" }, yazi: STIL }));
  const kok = el("div", { sinif: "lr" }); kok.dataset.icindekilerYok = "1";
  const guncel = el("span", { sinif: "lr-canli", yazi: "Live" });
  kok.append(el("div", { sinif: "lr-ust" }, [el("h1", { yazi: "Launch Radar" }),
    el("p", {}, ["New and recently launched tokens on 13 chains and their launchpads, each run through the same five checks: safety, real demand, many wallets, liquidity depth, buyers vs sellers. ", guncel])]));

  let veri = null, zincir = "", lp = "", sekme = "hepsi", sirala = "hacim", acik = null, vurgu = null;
  const zCip = el("div", { sinif: "lr-cip", attr: { "aria-label": "Chains" } });
  const radarKap = el("div", { sinif: "lr-radar" }), tuval = el("canvas", { attr: { "aria-label": "Radar of new tokens across 13 chains" } }), ipucu = el("div", { sinif: "lr-ipucu" });
  radarKap.append(tuval, ipucu);
  const ozet = el("div", { sinif: "lr-ozet" });
  const lpTablo = el("table", { sinif: "lr-lp" });
  kok.append(zCip, el("div", { sinif: "lr-ust-izgara" }, [
    el("div", { sinif: "lr-kutu" }, [el("h2", {}, [el("span", { yazi: "The radar" }), el("span", { attr: { style: "text-transform:none;letter-spacing:0;font-weight:500" }, yazi: "newest at the centre · size = volume · colour = checks passed" })]), radarKap, ozet]),
    el("div", { sinif: "lr-kutu" }, [el("h2", {}, [el("span", { yazi: "Launchpads" }), el("span", { attr: { style: "text-transform:none;letter-spacing:0;font-weight:500" }, yazi: "tap one to filter" })]), el("div", { attr: { style: "max-height:520px;overflow:auto" } }, [lpTablo])])]));
  const sekmeBar = el("div", { sinif: "lr-sekme", attr: { role: "tablist" } });
  const ara = el("input", { sinif: "lr-ara", attr: { type: "search", placeholder: "Search name, symbol or address", "aria-label": "Search tokens" } });
  const siraSec = el("select", { sinif: "lr-sec", attr: { "aria-label": "Sort" } }, [["hacim", "Most volume"], ["kontrol", "Most checks passed"], ["yeni", "Newest"], ["d1", "Biggest 1h move"], ["alici", "Most buyers (1h)"]].map(([k, a]) => el("option", { attr: { value: k }, yazi: a })));
  const liste = el("div", { sinif: "lr-liste" }, [el("div", { sinif: "lr-bos", yazi: "Loading the radar…" })]);
  const alt = el("p", { sinif: "lr-alt" });
  kok.append(sekmeBar, el("div", { sinif: "lr-arac" }, [ara, siraSec]), liste, alt);

  const SEKME = [["hepsi", "All"], ["guclu", "All checks passed"], ["new", "New · <1h"], ["curve", "On curve"], ["today", "Today"], ["week", "This week"]];
  const filtreli = () => {
    if (!veri) return [];
    let l = veri.tokenler.slice();
    if (zincir) l = l.filter((t) => t.z === zincir);
    if (lp) l = l.filter((t) => t.lp === lp);
    if (sekme === "guclu") l = l.filter((t) => t.bilinen >= 3 && t.gecen === t.bilinen);
    else if (sekme !== "hepsi") l = l.filter((t) => t.evre === sekme);
    const q = ara.value.trim().toLowerCase();
    if (q) l = l.filter((t) => [t.sembol, t.ad, t.a, t.lp].join(" ").toLowerCase().includes(q));
    const s = { hacim: (a, b) => (b.hacim || 0) - (a.hacim || 0), kontrol: (a, b) => b.gecen - a.gecen || (b.hacim || 0) - (a.hacim || 0), yeni: (a, b) => (a.yasSaat ?? 1e9) - (b.yasSaat ?? 1e9), d1: (a, b) => Math.abs(b.d1 || 0) - Math.abs(a.d1 || 0), alici: (a, b) => (b.alici1 || 0) - (a.alici1 || 0) }[sirala];
    return l.sort(s);
  };
  const kart = (t) => {
    const logo = t.resim ? el("img", { sinif: "lr-logo", attr: { src: t.resim, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : el("span", { sinif: "lr-logo", yazi: String(t.sembol || "?").slice(0, 3) });
    if (t.resim) logo.addEventListener("error", () => logo.replaceWith(el("span", { sinif: "lr-logo", yazi: String(t.sembol || "?").slice(0, 3) })));
    const ad = veri.kontrolAd || {};
    const pil = KONTROL.map((k) => { const c = t.kontrol[k] || { s: "na" }; return el("span", { sinif: "lr-k" + (c.s === "ok" ? " lr-k--ok" : c.s === "no" ? " lr-k--no" : c.s === "warn" ? " lr-k--warn" : ""), attr: { title: (ad[k] || k) + ": " + (c.not || "") }, yazi: (c.s === "ok" ? "✓ " : c.s === "no" ? "✕ " : c.s === "warn" ? "⚠ " : "? ") + (ad[k] || k) }); });
    const detay = el("div", { sinif: "lr-detay" }, [
      ...KONTROL.map((k) => { const c = t.kontrol[k] || { s: "na", not: "" }; return el("div", {}, [el("b", { yazi: (ad[k] || k) + ": " }), (c.s === "ok" ? "passes — " : c.s === "no" ? "fails — " : c.s === "warn" ? "warning — " : "unknown — ") + (c.not || "")]); }),
      el("div", { attr: { style: "margin-top:6px;color:var(--yazi-3)" } }, ["Liq " + kisa(t.likidite) + " · MC " + kisa(t.mcap) + " · Vol 24h " + kisa(t.hacim) + " · 5m " + yuzde(t.d5) + " · 6h " + yuzde(t.d6) + (t.alici1 != null ? " · " + t.alici1 + " buyers / " + (t.satici1 ?? "?") + " sellers in 1h" : "") + " · found via " + (t.kaynak || []).join(", ") + " · ",
        el("a", { attr: { href: "https://www.geckoterminal.com/" + GECKO_AG[t.z] + "/pools/" + t.havuz, target: "_blank", rel: "noopener" }, yazi: "chart ↗" })])]);
    const trade = TAKASSIZ.has(t.z) ? el("a", { sinif: "lr-al lr-al--gri", attr: { href: "https://www.geckoterminal.com/" + GECKO_AG[t.z] + "/pools/" + t.havuz, target: "_blank", rel: "noopener" }, yazi: "Chart" })
      : el("a", { sinif: "lr-al", attr: { href: "#/terminal?z=" + t.z + "&a=" + t.a }, yazi: "Trade" });
    trade.addEventListener("click", (e) => e.stopPropagation());
    const k = el("div", { sinif: "lr-kart" + (vurgu === t.z + ":" + t.a ? " lr-vurgu" : ""), attr: { role: "button", tabindex: "0", "data-acik": acik === t.z + ":" + t.a ? "1" : "0" } }, [
      logo,
      el("div", { sinif: "lr-ad" }, [el("b", {}, [el("span", { attr: { style: "overflow:hidden;text-overflow:ellipsis" }, yazi: t.sembol }), el("span", { sinif: "lr-etiket lr-etiket--" + t.evre, yazi: EVRE[t.evre] })]),
        el("small", { yazi: ZAD[t.z] + " · " + t.lp + (t.yasSaat != null ? " · " + yasYaz(t.yasSaat) + " old" : "") + " · Liq " + kisa(t.likidite) + " · Vol " + kisa(t.hacim) }),
        el("div", { sinif: "lr-kontrol" }, pil)]),
      el("div", { sinif: "lr-sag" }, [el("div", { sinif: "lr-fiyat" }, [el("b", { yazi: fiyatYaz(Number(t.fiyat)) }), el("span", { sinif: t.d1 > 0 ? "lr-art" : t.d1 < 0 ? "lr-eks" : "", yazi: "1h " + yuzde(t.d1) }), " ",
        el("span", { sinif: t.d24 > 0 ? "lr-art" : t.d24 < 0 ? "lr-eks" : "", yazi: "24h " + yuzde(t.d24) })]), trade]),
      detay]);
    const ac = () => { acik = acik === t.z + ":" + t.a ? null : t.z + ":" + t.a; k.dataset.acik = acik === t.z + ":" + t.a ? "1" : "0"; };
    k.addEventListener("click", ac); k.addEventListener("keydown", (e) => { if (e.key === "Enter") ac(); });
    k.id = "lr-" + t.z + "-" + t.a;
    return k;
  };
  function ciz_() {
    if (!veri) return;
    const say = (z) => veri.tokenler.filter((t) => !z || t.z === z).length;
    zCip.replaceChildren(...[["", "All 13 chains"], ...ZINCIR].map(([k, a]) => el("button", { attr: { type: "button", "aria-pressed": String(zincir === k) }, on: { click: () => { zincir = k; lp = ""; ciz_(); } } }, [a, el("small", { yazi: String(say(k)) })])));
    sekmeBar.replaceChildren(...SEKME.map(([k, a]) => el("button", { attr: { type: "button", role: "tab", "aria-selected": String(sekme === k) }, yazi: a, on: { click: () => { sekme = k; ciz_(); } } })));
    /* launchpad table (for the chosen chain) */
    const lps = {};
    for (const [kk, n] of Object.entries(veri.gorulen || {})) { const [ad, z] = kk.split("|"); if (zincir && z !== zincir) continue; const e = lps[ad] || (lps[ad] = { ad, z: new Set(), n: 0, y: 0, g: 0, d: [], s: 0 }); e.z.add(z); e.s += n; }
    for (const t of veri.tokenler.filter((x) => !zincir || x.z === zincir)) { const e = lps[t.lp] || (lps[t.lp] = { ad: t.lp, z: new Set(), n: 0, y: 0, g: 0, d: [], s: 0 }); e.z.add(t.z); e.n++; if (t.yasSaat != null && t.yasSaat < 24) e.y++; if (t.bilinen >= 3 && t.gecen === t.bilinen) e.g++; if (Number.isFinite(t.d24)) e.d.push(t.d24); }
    const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    lpTablo.replaceChildren(el("thead", {}, [el("tr", {}, ["Launchpad", "Seen", "Active", "All ✓", "Median 24h"].map((h) => el("th", { yazi: h })))]),
      el("tbody", {}, Object.values(lps).sort((a, b) => b.n - a.n || b.s - a.s).map((e) => { const m = med(e.d); const tr = el("tr", { attr: { style: lp === e.ad ? "background:rgba(124,92,255,.14)" : "" } }, [
        el("td", {}, [e.ad, el("br"), el("small", { yazi: [...e.z].map((z) => ZAD[z]).join(", ") })]), el("td", { attr: { title: "launches seen this week, dead pools included" }, yazi: String(Math.max(e.s, e.n)) }), el("td", { attr: { title: "still trading: ≥ $5K liquidity and volume" }, yazi: String(e.n) }), el("td", { attr: { style: "color:var(--alis)" }, yazi: String(e.g) }),
        el("td", { sinif: m > 0 ? "lr-art" : m < 0 ? "lr-eks" : "", yazi: yuzde(m) })]); tr.addEventListener("click", () => { lp = lp === e.ad ? "" : e.ad; ciz_(); }); return tr; })));
    const l = filtreli();
    const tum = veri.tokenler.filter((t) => !zincir || t.z === zincir);
    ozet.replaceChildren(...[[tum.length, "tokens on the radar"], [tum.filter((t) => t.yasSaat != null && t.yasSaat < 1).length, "launched in the last hour"], [tum.filter((t) => t.bilinen >= 3 && t.gecen === t.bilinen).length, "pass every check"], [veri.engellenen, "failed safety, hidden"]].map(([n, a]) => el("div", {}, [el("b", { yazi: String(n) }), el("span", { yazi: a })])));
    if (!l.length) { liste.replaceChildren(el("div", { sinif: "lr-bos", yazi: ara.value.trim() ? "No token matches “" + ara.value.trim() + "”." : "Nothing here right now. The radar refreshes every 15 minutes." })); return; }
    liste.replaceChildren(...l.slice(0, 120).map(kart));
  }
  ara.addEventListener("input", ciz_); siraSec.addEventListener("change", () => { sirala = siraSec.value; ciz_(); });

  /* ---- the radar canvas: 13 chain sectors, radius = age (log), sweep synced to the data refresh ---- */
  const ctx = tuval.getContext("2d"); let noktalar = [], sw = 0;
  const parla = new Map();
  function boyut() { const r = devicePixelRatio || 1; tuval.width = tuval.clientWidth * r; tuval.height = tuval.clientHeight * r; ctx.setTransform(r, 0, 0, r, 0, 0); }
  boyut(); addEventListener("resize", boyut);
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
  function radarCiz() {
    if (!kok.isConnected) return;
    if (tuval.clientWidth && tuval.width !== Math.round(tuval.clientWidth * (devicePixelRatio || 1))) boyut();   // sized once the page is attached
    const W = tuval.clientWidth, H = tuval.clientHeight, cx = W / 2, cy = H / 2, R = Math.min(W, H) * (W < 500 ? 0.38 : 0.45);
    if (!W) { requestAnimationFrame(radarCiz); return; }
    ctx.fillStyle = "rgba(7,9,15,.32)"; ctx.fillRect(0, 0, W, H);
    const dil = (Math.PI * 2) / 13;
    ctx.lineWidth = 1; ctx.font = "10px Inter, sans-serif";
    /* age rings: 1h, 6h, 24h */
    const rr = (h) => R * (0.08 + 0.92 * Math.min(1, Math.log10(1 + Math.max(0, h ?? 48) * 2) / Math.log10(1 + 48 * 2)));
    for (const [h, a] of [[1, "1h"], [6, "6h"], [24, "24h"]]) { ctx.strokeStyle = "rgba(124,92,255,.22)"; ctx.beginPath(); ctx.arc(cx, cy, rr(h), 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(185,166,255,.55)"; ctx.fillText(a, cx + 3, cy - rr(h) - 3); }
    ZINCIR.forEach(([z, ad], i) => {
      const a0 = -Math.PI / 2 + i * dil;
      ctx.strokeStyle = zincir === z ? "rgba(124,92,255,.6)" : "rgba(120,130,170,.14)"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); ctx.stroke();
      const am = a0 + dil / 2; ctx.fillStyle = zincir === z ? "#fff" : "rgba(200,205,230,.7)"; ctx.textAlign = "center"; ctx.fillText(ad, cx + Math.cos(am) * (R + 10), cy + Math.sin(am) * (R + 10) + 3); ctx.textAlign = "left";
    });
    sw = (sw + 0.012) % (Math.PI * 2);
    const g = ctx.createConicGradient ? ctx.createConicGradient(sw - 0.7 - Math.PI / 2 + Math.PI / 2, cx, cy) : null;
    if (g) { g.addColorStop(0, "rgba(124,92,255,0)"); g.addColorStop(0.11, "rgba(124,92,255,.22)"); g.addColorStop(0.111, "rgba(124,92,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill(); }
    ctx.strokeStyle = "rgba(185,166,255,.9)"; ctx.lineWidth = 1.5; ctx.shadowColor = "#7c5cff"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sw) * R, cy + Math.sin(sw) * R); ctx.stroke(); ctx.shadowBlur = 0;
    noktalar = [];
    if (veri) {
      const l = veri.tokenler.filter((t) => (!lp || t.lp === lp));
      const vmax = Math.max(1, ...l.map((t) => t.hacim || 0));
      for (const t of l) {
        const i = ZINCIR.findIndex(([z]) => z === t.z); if (i < 0) continue;
        const a = -Math.PI / 2 + i * dil + dil * (0.1 + 0.8 * hash(t.a)), r = rr(t.yasSaat), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        const k = t.z + ":" + t.a; let f = ((sw - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); if (f < 0.05) parla.set(k, 1);
        const p = parla.get(k) || 0; parla.set(k, p * 0.965);
        const oran = t.bilinen ? t.gecen / t.bilinen : 0, renk = oran >= 1 ? "46,209,138" : oran >= 0.6 ? "245,194,107" : "255,107,122";
        const sol = zincir && t.z !== zincir;
        const boy = 2 + Math.sqrt((t.hacim || 0) / vmax) * 11;
        ctx.globalAlpha = sol ? 0.15 : 1;
        ctx.fillStyle = "rgba(" + renk + "," + (0.45 + 0.55 * p) + ")";
        if (p > 0.2 || vurgu === k) { ctx.shadowColor = "rgb(" + renk + ")"; ctx.shadowBlur = 14 * Math.max(p, vurgu === k ? 1 : 0); }
        ctx.beginPath(); ctx.arc(x, y, boy * (1 + 0.4 * p), 0, 7); ctx.fill(); ctx.shadowBlur = 0;
        if (t.evre === "curve" || t.evre === "new") { ctx.strokeStyle = t.evre === "curve" ? "#f5c26b" : "#33e1ff"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, boy + 3, 0, 7); ctx.stroke(); }
        if (vurgu === k) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, boy + 7, 0, 7); ctx.stroke(); }
        if (!sol && (p > 0.55 || vurgu === k || boy > 9)) { ctx.fillStyle = "#e8e6ff"; ctx.font = "10.5px Inter, sans-serif"; ctx.fillText(t.sembol, x + boy + 4, y + 3); }
        ctx.globalAlpha = 1;
        if (!sol) noktalar.push({ x, y, r: boy + 4, t });
      }
    }
    requestAnimationFrame(radarCiz);
  }
  const bul = (e) => { const b = tuval.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; let en = null, d = 1e9; for (const n of noktalar) { const dd = Math.hypot(n.x - x, n.y - y); if (dd < Math.max(10, n.r) && dd < d) { d = dd; en = n; } } return { en, x, y }; };
  tuval.addEventListener("mousemove", (e) => { const { en, x, y } = bul(e); if (!en) { ipucu.style.display = "none"; return; } const t = en.t;
    ipucu.replaceChildren(el("b", { yazi: t.sembol + " · " + ZAD[t.z] }), el("div", { attr: { style: "color:var(--yazi-3)" }, yazi: t.lp + " · " + EVRE[t.evre] + (t.yasSaat != null ? " · " + yasYaz(t.yasSaat) : "") }), el("div", { yazi: "1h " + yuzde(t.d1) + " · Vol " + kisa(t.hacim) + " · " + t.gecen + "/" + t.bilinen + " checks" }));
    ipucu.style.display = "block"; ipucu.style.left = Math.min(x + 12, tuval.clientWidth - 230) + "px"; ipucu.style.top = (y + 12) + "px"; });
  tuval.addEventListener("mouseleave", () => { ipucu.style.display = "none"; });
  tuval.addEventListener("click", (e) => { const { en } = bul(e); if (!en) return; const t = en.t; vurgu = acik = t.z + ":" + t.a; sekme = "hepsi"; ara.value = ""; if (zincir && zincir !== t.z) zincir = t.z; ciz_(); const k = document.getElementById("lr-" + t.z + "-" + t.a); if (k) k.scrollIntoView({ behavior: "smooth", block: "center" }); });
  requestAnimationFrame(radarCiz);

  /* ---- data + live prices ---- */
  /* ages are computed here from each pool's creation time, so they stay right between scans */
  const yaslar = () => { if (veri) for (const t of veri.tokenler) if (t.kuruldu) { t.yasSaat = (Date.now() - Date.parse(t.kuruldu)) / 3600e3; if (t.evre !== "curve") t.evre = t.yasSaat < 1 ? "new" : t.yasSaat < 24 ? "today" : "week"; } };
  async function yukle() {
    try {
      veri = await fetch("veri/launch-radar.json?t=" + Math.floor(Date.now() / 120000)).then((r) => r.json());
      yaslar();
      const dk = Math.round((Date.now() - Date.parse(veri.guncel)) / 60000);
      guncel.textContent = "Live · scan " + (dk < 1 ? "just now" : dk < 60 ? dk + " min ago" : Math.round(dk / 60) + " h ago") + " · prices update every minute";
      const ac = veri.kontrolAciklama || {}, ad = veri.kontrolAd || {};
      alt.replaceChildren(el("b", { yazi: "How the radar works. " }), veri.kurallar + " ",
        ...KONTROL.map((k) => el("span", {}, [el("b", { yazi: (ad[k] || k) + ": " }), (ac[k] || "") + " "])),
        "Launchpads are read from the token address or the pool's venue (e.g. pump.fun addresses end in “pump”); pools that do not match a known launchpad show as “Direct pool”. Passing every check does not make a token safe or a good buy: these checks catch common traps and fake activity, not all of them. Memecoins are very risky; not advice.");
      ciz_();
    } catch (e) { if (!veri) liste.replaceChildren(el("div", { sinif: "lr-bos", yazi: "The radar could not be loaded. Try again in a minute." })); }
  }
  await yukle();
  const canli = async () => {
    if (!kok.isConnected || !veri) return;
    const gor = filtreli().slice(0, 90), gr = {};
    for (const t of gor) (gr[t.z] = gr[t.z] || []).push(t);
    for (const [z, l] of Object.entries(gr)) for (let i = 0; i < l.length; i += 30) {
      if (!kok.isConnected) return;
      const m = await dsMulti(z, l.slice(i, i + 30).map((t) => t.a));
      for (const t of l.slice(i, i + 30)) { const x = m.get(t.a.toLowerCase()); if (!x) continue; const p = x.p; t.fiyat = Number(p.priceUsd) || t.fiyat; if (p.priceChange) { if (Number.isFinite(p.priceChange.h1)) t.d1 = p.priceChange.h1; if (Number.isFinite(p.priceChange.h24)) t.d24 = p.priceChange.h24; if (Number.isFinite(p.priceChange.m5)) t.d5 = p.priceChange.m5; } t.likidite = x.liq || t.likidite; t.hacim = Number(p.volume && p.volume.h24) || t.hacim; }
      await new Promise((r) => setTimeout(r, 350));
    }
    yaslar(); ciz_();
    setTimeout(canli, 60000);
  };
  setTimeout(canli, 2000);
  setInterval(() => { if (kok.isConnected) yukle(); }, 5 * 60000);
  return kok;
}
