/* ===========================================================================
 * gorunum/warp-token.js — one launch's trading view, used by Trade (#/terminal?t=<token>)
 *
 *   switcher  every launch from ARC PULSE as a chip on top (Warp and our own launchpad), one tap to move
 *             between them however many there are; a filter box once there are more than ten
 *   facts     price, market cap, liquidity, 24 h volume and trades: DexScreener's public API, or GeckoTerminal's
 *             for pools DexScreener has not indexed (our own Arc pools); read by the visitor's browser, nothing
 *             stored, nothing invented ("not indexed yet" when neither has it)
 *   chart     the same source's embedded chart of the token's pool
 *   story     for the Pulse Squad, the mascot's card; otherwise the route it was launched by
 *   trade     Warp tokens: Market's buy box (dollars from any of our EVM chains, relay.link delivers);
 *             our own one-pool tokens: buy, sell or redeem from any chain on their own page
 * =========================================================================== */
import { el, panel, temizle } from "../ui.js";
import { squadOf, squadResim, SQUAD } from "../squad.js";
import { sponsorYeri } from "../sponsor.js";
import { demoMu } from "../launch-kaynak.js";

/* DexScreener's and GeckoTerminal's chain ids where they differ from ours */
const DS = { bsc: "bsc", elysium: "elysium", solana: "solana", base: "base", monad: "monad", robinhood: "robinhood", arc: "arc" };
const GT = { bsc: "bsc", elysium: "elysium", solana: "solana", base: "base", monad: "monad", robinhood: "robinhood", arc: "arc" };
/* chains Market's buy box reaches (relay.link) */
const ALINIR = ["elysium", "base", "bsc", "solana", "monad", "robinhood"];

const STIL = `
.wt-cipler{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:thin}
.wt-cip{display:flex;align-items:center;gap:8px;flex:none;padding:6px 12px 6px 6px;border-radius:999px;border:1px solid var(--cizgi,#2a2f3a);background:var(--yuzey-1,#12141b);color:inherit;text-decoration:none;font-weight:700;font-size:13px}
.wt-cip img,.wt-cip span.b{width:26px;height:26px;border-radius:50%;object-fit:cover;background:#241c48;display:grid;place-items:center;font-size:8px;font-weight:800}
.wt-cip i{font-style:normal;font-size:10px;font-weight:800;opacity:.75;padding:1px 6px;border-radius:999px;background:rgba(127,127,127,.15)}
.wt-cip[aria-current="page"]{border-color:var(--marka,#7c5cff);box-shadow:0 0 0 1px var(--marka,#7c5cff) inset}
.wt-ara{width:100%;max-width:320px;margin-bottom:8px}
.wt-ust{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;border-radius:20px;padding:20px;background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,var(--wt-renk,#7c5cff) 22%,transparent),transparent 60%),var(--yuzey-1,#12141b);border:1px solid var(--cizgi,#2a2f3a)}
.wt-ust img,.wt-ust .b{width:112px;height:112px;object-fit:contain;filter:drop-shadow(0 8px 24px rgba(0,0,0,.4))}
.wt-ust .b{display:grid;place-items:center;border-radius:28px;background:linear-gradient(135deg,#7c5cff,#14b8a6);font-size:26px;font-weight:900;color:#fff}
.wt-ust h2{margin:0;font-size:30px;line-height:1.1}
.wt-ust .k{opacity:.75;margin-top:4px}
.wt-ust .soz{margin-top:10px;font-style:italic;font-weight:700;color:var(--wt-renk,#c6f86b)}
.wt-rozet{display:inline-block;margin-left:8px;font-size:11px;font-weight:800;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:linear-gradient(90deg,#7c5cff,#14b8a6);color:#fff;vertical-align:5px}
.wt-ca{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
.wt-ca code{font-size:12.5px;padding:6px 10px;border-radius:10px;background:rgba(127,127,127,.12);word-break:break-all}
.wt-olc{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.wt-olc div{border-radius:14px;padding:12px;background:var(--yuzey-1,#12141b);border:1px solid var(--cizgi,#2a2f3a)}
.wt-olc span{display:block;font-size:12px;opacity:.7}.wt-olc b{font-size:18px}
.wt-grafik{width:100%;height:520px;border:0;border-radius:14px;background:#0b0d12}
.wt-eylem{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.wt-liste{margin:0;padding-left:18px;line-height:1.7}
@media (max-width:640px){.wt-ust{grid-template-columns:1fr;text-align:center}.wt-ust img,.wt-ust .b{margin:0 auto}.wt-ca{justify-content:center}.wt-grafik{height:420px}}
`;
const stil = () => { if (!document.getElementById("wt-stil")) document.head.append(el("style", { attr: { id: "wt-stil" }, yazi: STIL })); };

const para = (x) => {
  const n = Number(x);
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  if (n >= 1) return "$" + n.toFixed(2);
  if (n >= 0.0001) return "$" + n.toPrecision(3);
  const sifir = Math.floor(-Math.log10(n));
  return "$0.0" + String(sifir).split("").map((c) => "₀₁₂₃₄₅₆₇₈₉"[c]).join("") + Math.round(n * 10 ** (sifir + 3)).toString().slice(0, 3);
};
const resimOf = (x) => { const m = squadOf(x.token); return x.gorsel || (m ? squadResim(m) : null); };

/** the strip of launches; `secili` is highlighted. `rows` are tumLaunchlar() rows (or Warp list rows). */
export function launchCipleri(rows, secili = null) {
  stil();
  const cip = (x) => {
    const res = resimOf(x);
    return el("a", { sinif: "wt-cip", attr: { href: x.link || "#/terminal?t=" + x.token, "aria-current": secili && String(x.token).toLowerCase() === String(secili).toLowerCase() ? "page" : null, title: (x.ad || "") + " · " + x.lp + " · " + (x.zincir || "") } },
      [res ? el("img", { attr: { src: res, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : el("span", { sinif: "b", yazi: String(x.sembol || "?").slice(0, 4).toUpperCase() }),
        "$" + (x.sembol || x.ad || String(x.token).slice(0, 6)), el("i", { yazi: x.tur === "warp" ? "Warp" : x.zincir || "ARC PULSE" })]);
  };
  const serit = el("div", { sinif: "wt-cipler" }, rows.map(cip));
  if (rows.length <= 10) return serit;
  const ara = el("input", { sinif: "girdi wt-ara", attr: { placeholder: "Find a token by name, ticker or chain", autocomplete: "off" } });
  ara.addEventListener("input", () => {
    const q = ara.value.trim().toLowerCase();
    temizle(serit).append(...rows.filter((x) => !q || [x.ad, x.sembol, x.zincir, x.lp].some((v) => String(v || "").toLowerCase().includes(q)) || String(x.token).toLowerCase() === q).map(cip));
  });
  return el("div", {}, [ara, serit]);
}
/* kept for older callers */
export const warpCipleri = (rows, secili) => launchCipleri(rows, secili);

/* the token's market: DexScreener first, GeckoTerminal for pools it has not indexed; one shape for both */
async function piyasa(zk, token) {
  const ds = await fetch("https://api.dexscreener.com/tokens/v1/" + (DS[zk] || zk) + "/" + token).then((x) => x.json()).catch(() => []);
  const c = (Array.isArray(ds) ? ds : []).sort((a, b) => Number((b.liquidity || {}).usd || 0) - Number((a.liquidity || {}).usd || 0))[0];
  if (c) return { fiyat: c.priceUsd, mcap: c.marketCap || c.fdv, lik: (c.liquidity || {}).usd, hacim: (c.volume || {}).h24, deg: (c.priceChange || {}).h24,
    al: ((c.txns || {}).h24 || {}).buys || 0, sat: ((c.txns || {}).h24 || {}).sells || 0, havuz: c.pairAddress, url: c.url, kaynak: "DexScreener",
    gomu: "https://dexscreener.com/" + (DS[zk] || zk) + "/" + c.pairAddress + "?embed=1&theme=dark&info=0&trades=1" };
  if (!GT[zk]) return null;
  const g = await fetch("https://api.geckoterminal.com/api/v2/networks/" + GT[zk] + "/tokens/" + token + "/pools", { headers: { accept: "application/json" } }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const p = g && (g.data || []).sort((a, b) => Number(b.attributes.reserve_in_usd || 0) - Number(a.attributes.reserve_in_usd || 0))[0];
  if (!p) return null;
  const a = p.attributes, t = (a.transactions && a.transactions.h24) || {};
  return { fiyat: a.base_token_price_usd, mcap: a.market_cap_usd || a.fdv_usd, lik: a.reserve_in_usd, hacim: a.volume_usd && a.volume_usd.h24, deg: a.price_change_percentage && Number(a.price_change_percentage.h24),
    al: t.buys || 0, sat: t.sells || 0, havuz: a.address, url: "https://www.geckoterminal.com/" + GT[zk] + "/pools/" + a.address, kaynak: "GeckoTerminal",
    gomu: "https://www.geckoterminal.com/" + GT[zk] + "/pools/" + a.address + "?embed=1&info=0&swaps=1&grayscale=0&light_chart=0" };
}

/** one launch's trading view (header, market, chart, about), for a tumLaunchlar() row */
/* 16 Nov 2026 redesign (approved demo, screens 2, 5 and 8): one screen per token. Desktop: header, figures and chart on
   the left, the trade box and "your position" on the right. Phone: the same column, a sticky Buy / Sell bar, and the
   trade box in a bottom sheet. Arc one-pool tokens trade in place (gorunum/merkez.js ?gomu=1, the same handlers as
   before); Warp tokens keep Market's buy box and their own launchpad's link. */
const TK_STIL = `
.tk2{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:20px;align-items:start}
.tk2-sol{display:flex;flex-direction:column;gap:14px;min-width:0}
.tk2-sag{display:flex;flex-direction:column;gap:12px;position:sticky;top:calc(var(--ust-bar) + 12px)}
.tk2-bas{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.tk2-logo{width:52px;height:52px;border-radius:15px;object-fit:cover;flex:none;display:grid;place-items:center;font-weight:800;color:#0b0b10;background:#7ce3b4}
.tk2-ad{min-width:0;flex:1}.tk2-ad h1{font-size:22px;margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tk2-ad .k{font-size:12.5px;color:var(--yazi-3);margin-top:2px}
.tk2-ca{all:unset;cursor:pointer;font-size:12.5px;color:var(--yazi-3);font-family:var(--yazi-tipi-mono)}.tk2-ca:hover{color:var(--yazi-1)}
.tk2-fiyat{text-align:right}.tk2-fiyat b{display:block;font-size:30px;letter-spacing:-.5px;font-variant-numeric:tabular-nums}.tk2-fiyat span{font-size:13.5px;font-weight:600}
.tk2-olc{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.tk2-olc>div{padding:9px 11px;border-radius:12px;background:var(--yuzey-1);border:1px solid var(--cizgi);min-width:0}
.tk2-olc span{display:block;font-size:11.5px;color:var(--yazi-3)}.tk2-olc b{font-size:14.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.tk2-grafik{border-radius:14px;overflow:hidden;border:1px solid var(--cizgi);background:var(--yuzey-1)}
.tk2-grafik iframe{display:block;width:100%;height:520px;border:0}
.tk2-kutu{padding:16px;border-radius:18px;background:var(--yuzey-1);border:1px solid var(--cizgi-guclu)}
.tk2-poz{padding:14px;border-radius:16px;background:linear-gradient(135deg,#10261c,var(--yuzey-1));border:1px solid #1e3a2d}
.tk2-poz small{font-size:12px;color:#a6cdb9}.tk2-poz b{display:block;font-size:22px;margin-top:4px;font-variant-numeric:tabular-nums}.tk2-poz div{font-size:12.5px;color:#8fb5a2;font-variant-numeric:tabular-nums}
.tk2-dock{display:none}
.tk2-perde{position:fixed;inset:0;z-index:120;background:rgba(5,5,9,.62);display:flex;align-items:flex-end}
.tk2-perde[hidden]{display:none}
.tk2-sayfa{width:100%;max-height:88vh;overflow:auto;background:#14141b;border-top:1px solid var(--cizgi-guclu);border-radius:24px 24px 0 0;padding:10px 16px calc(18px + env(safe-area-inset-bottom,0px))}
.tk2-tutamak{width:40px;height:5px;border-radius:3px;background:#34343f;margin:0 auto 12px}
.tk2-kapat{all:unset;cursor:pointer;float:right;width:34px;height:34px;border-radius:10px;background:var(--yuzey-3);display:grid;place-items:center;color:var(--yazi-2)}
@media (max-width:980px){.tk2{grid-template-columns:minmax(0,1fr)}.tk2-sag{position:static}.tk2-olc{grid-template-columns:repeat(2,minmax(0,1fr))}.tk2-fiyat{text-align:left;width:100%}.tk2-grafik iframe{height:380px}}
@media (max-width:860px){
  .tk2-sag .tk2-kutu{display:none}
  .tk2-dock{display:grid;grid-template-columns:1fr 1fr;gap:10px;position:fixed;left:0;right:0;bottom:calc(var(--alt-bar) + env(safe-area-inset-bottom,0px));z-index:50;padding:10px 16px;background:rgba(11,11,16,.96);border-top:1px solid var(--cizgi)}
  .tk2-dock button,.tk2-dock a{height:50px;border-radius:14px;border:0;font:700 16px var(--yazi-tipi);display:grid;place-items:center;text-decoration:none;cursor:pointer}
  .tk2{padding-bottom:80px}
}
`;

export function tokenDetay(x) {
  stil();
  if (!document.getElementById("tk2-stil")) document.head.append(el("style", { attr: { id: "tk2-stil" }, yazi: TK_STIL }));
  const kap = el("div", { sinif: "yigin" });
  const m = squadOf(x.token);
  const resim = resimOf(x);
  const warp = x.tur === "warp";
  const arcBiz = !warp && x.zk === "arc";
  const sol = el("div", { sinif: "tk2-sol" }), sag = el("aside", { sinif: "tk2-sag" });
  const izgara = el("div", { sinif: "tk2" }, [sol, sag]);
  kap.dataset.icindekilerYok = "1";
  kap.append(izgara);

  /* header: logo, name, chain, CA; live price on the right */
  const ca = el("button", { sinif: "tk2-ca", attr: { type: "button", title: "Copy the contract address" }, yazi: "CA " + x.token.slice(0, 6) + "…" + x.token.slice(-4) + " · copy" });
  ca.addEventListener("click", async () => { try { await navigator.clipboard.writeText(x.token); ca.textContent = "Copied ✓"; } catch { ca.textContent = x.token; } setTimeout(() => (ca.textContent = "CA " + x.token.slice(0, 6) + "…" + x.token.slice(-4) + " · copy"), 1800); });
  const fiyatB = el("b", { yazi: "…" }), degS = el("span");
  sol.append(el("div", { sinif: "tk2-bas", attr: { style: m && m.renk ? "--wt-renk:" + m.renk : "" } }, [
    resim ? el("img", { sinif: "tk2-logo", attr: { src: resim, alt: "", referrerpolicy: "no-referrer" } }) : el("div", { sinif: "tk2-logo", yazi: String(x.sembol || "?").slice(0, 3).toUpperCase() }),
    el("div", { sinif: "tk2-ad" }, [
      el("h1", {}, [x.sembol ? "$" + x.sembol : x.ad || "?", m ? el("span", { sinif: "wt-rozet", yazi: "Pulse Squad" }) : null, demoMu(x) ? el("span", { sinif: "rozet-demo", yazi: "Demo" }) : null]),
      el("div", { sinif: "k", yazi: (x.ad && x.ad !== x.sembol ? x.ad + " · " : "") + x.zincir + " · " + (warp ? "launched on " + x.lp + " through Warp" : x.lp) + (x.zaman ? " · " + new Date(x.zaman * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "") }),
      ca]),
    el("div", { sinif: "tk2-fiyat" }, [fiyatB, degS])]));
  if (m && (m.kisilik || m.soz)) sol.append(el("div", { sinif: "ikincil" }, [m.kisilik || "", m.soz ? el("div", { sinif: "soz", yazi: "“" + m.soz + "”" }) : null]));

  const olc = el("div", { sinif: "tk2-olc" });
  const grafikYer = el("div", { sinif: "tk2-grafik" }, [el("div", { sinif: "vt-alt", attr: { style: "padding:18px" }, yazi: "Loading the chart…" })]);
  sol.append(olc, grafikYer);

  let v = null;
  /* ---- trading ---- */
  const kutu = el("div", { sinif: "tk2-kutu" }, [el("div", { sinif: "vt-alt", yazi: "Loading the trade box…" })]);
  const poz = el("div", { sinif: "tk2-poz", attr: { hidden: true } });
  sag.append(kutu, poz);
  const warpAl = async () => {
    const vt = await import("./vitrin.js");
    vt.tokenAl({ zincir: x.zk, adres: x.token, sembol: x.sembol || "", ad: x.ad || "", resim: resim ? new URL(resim, location.href).href : null,
      fiyat: v && v.fiyat, fdv: v && v.mcap, hacim: v && v.hacim, degisim: v && v.deg != null && Math.abs(v.deg) >= 0.05 ? v.deg : 0,
      likidite: v && v.lik, havuz: v ? v.havuz : "", kuruldu: x.zaman ? new Date(x.zaman * 1000).toISOString() : null });
  };
  let isKutusu = null;
  if (arcBiz) {
    import("./merkez.js").then((mk) => mk.ciz({ param: new URLSearchParams("t=" + x.token + "&gomu=1"), kayit: { yol: "merkez" } }))
      .then((k) => { isKutusu = k; if (!perde.hidden) sayfaIc.append(k); else kutu.replaceChildren(k); })
      .catch((e) => kutu.replaceChildren(el("a", { sinif: "dugme dugme--marka", attr: { href: "#/merkez?t=" + x.token }, yazi: "Buy, sell or redeem →" }), el("div", { sinif: "vt-alt", yazi: (e && e.message) || "" })));
  } else {
    const ic = [];
    if (warp && ALINIR.includes(x.zk)) { const b = el("button", { sinif: "tb-ana tb-ana--al", attr: { type: "button", style: "height:54px;border-radius:15px;border:0;width:100%;font:700 16px var(--yazi-tipi);background:var(--alis);color:#04150e;cursor:pointer" }, yazi: "Buy $" + (x.sembol || "") + " from any chain" }); b.addEventListener("click", warpAl); ic.push(b); }
    if (x.dis) ic.push(el("a", { sinif: "dugme dugme--sade", attr: { href: x.dis, target: "_blank", rel: "noopener noreferrer", style: "width:100%;justify-content:center" }, yazi: "Trade on " + x.lp + " ↗" }));
    if (!warp && x.zk !== "arc") ic.push(el("a", { sinif: "dugme dugme--marka", attr: { href: x.git || "#/merkez?t=" + x.token }, yazi: "Trade on " + x.zincir + " →" }));
    if (m && m.x) ic.push(el("a", { sinif: "dugme dugme--sade", attr: { href: m.x, target: "_blank", rel: "noopener noreferrer" }, yazi: "Launch post on X ↗" }));
    kutu.replaceChildren(el("div", { sinif: "yigin" }, ic));
  }
  /* phone: sticky Buy / Sell, the trade box in a bottom sheet */
  const sayfaIc = el("div");
  const kapat = el("button", { sinif: "tk2-kapat", attr: { type: "button", "aria-label": "Close" }, yazi: "✕" });
  const perde = el("div", { sinif: "tk2-perde", attr: { hidden: true, role: "dialog", "aria-label": "Trade " + (x.sembol || "") } }, [el("div", { sinif: "tk2-sayfa" }, [kapat, el("div", { sinif: "tk2-tutamak" }), sayfaIc])]);
  const sayfaKapat = () => { perde.hidden = true; if (isKutusu) kutu.replaceChildren(isKutusu); };
  kapat.addEventListener("click", sayfaKapat);
  perde.addEventListener("click", (e) => { if (e.target === perde) sayfaKapat(); });
  const sayfaAc = (taraf) => {
    if (!arcBiz) { warpAl(); return; }
    if (isKutusu) { sayfaIc.replaceChildren(isKutusu); const b = isKutusu.querySelectorAll(".tb-sekme button")[taraf === "sat" ? 1 : 0]; if (b) b.click(); }
    perde.hidden = false;
  };
  const dock = el("div", { sinif: "tk2-dock" });
  if (arcBiz || (warp && ALINIR.includes(x.zk))) {
    const al = el("button", { attr: { type: "button", style: "background:var(--alis);color:#04150e" }, yazi: "Buy" });
    al.addEventListener("click", () => sayfaAc("al"));
    dock.append(al);
    if (arcBiz) { const sat = el("button", { attr: { type: "button", style: "background:var(--yuzey-3);color:var(--yazi-1);border:1px solid var(--cizgi-guclu)" }, yazi: "Sell" }); sat.addEventListener("click", () => sayfaAc("sat")); dock.append(sat); }
    else if (x.dis) dock.append(el("a", { attr: { href: x.dis, target: "_blank", rel: "noopener noreferrer", style: "background:var(--yuzey-3);color:var(--yazi-1);border:1px solid var(--cizgi-guclu)" }, yazi: "Sell ↗" }));
    if (dock.children.length === 1) dock.style.gridTemplateColumns = "1fr";
    /* fixed layers live on <body>: the page entrance animation (a transform) would otherwise trap them in the content */
    /* only once this page is on screen (a stale redraw must not leave its bar on top), replacing an older one */
    let deneme = 0;
    const tak = () => { if (kap.isConnected) { document.querySelectorAll(".tk2-dock, .tk2-perde").forEach((x) => x.remove()); document.body.append(dock, perde); } else if (++deneme < 100) setTimeout(tak, 100); };
    tak();
    const sok = () => { if (!kap.isConnected) { dock.remove(); perde.remove(); window.removeEventListener("hashchange", sok); } };
    window.addEventListener("hashchange", () => setTimeout(sok, 0));
  }

  /* your position: what this wallet holds of an Arc token, at the pool price (no cost basis is guessed) */
  const pozOku = async () => {
    if (!arcBiz) return;
    try {
      const { cuzdan } = await import("../cuzdan.js");
      const ben = cuzdan.hesap(); if (!ben) return;
      const { YedekliOkur } = await import("../yedekli-okur.js");
      const { Contract } = await import("../../vendor/ethers.min.js");
      const b = Number(await new Contract(x.token, ["function balanceOf(address) view returns (uint256)"], new YedekliOkur()).balanceOf(ben)) / 1e18;
      if (!(b > 0)) { poz.hidden = true; return; }
      const deger = v && v.fiyat ? b * Number(v.fiyat) : null;
      const k = b >= 1e6 ? (b / 1e6).toFixed(2) + "M" : b >= 1e3 ? (b / 1e3).toFixed(1) + "K" : b.toFixed(2);
      poz.replaceChildren(el("small", { yazi: "Your position on Arc" }), el("b", { yazi: deger != null ? para(deger) : k }), el("div", { yazi: k + " " + (x.sembol || "") + (deger != null ? " · at the pool price" : "") }));
      poz.hidden = false;
    } catch (e) { /* nothing to show */ }
  };

  const k = (a, b) => el("div", {}, [el("span", { yazi: a }), el("b", { yazi: b })]);
  const doldur = async () => {
    v = await piyasa(x.zk, x.token).catch(() => null);
    if (!v) {
      fiyatB.textContent = "—";
      temizle(olc).append(k("Market data", "Not indexed yet"));
      temizle(grafikYer).append(el("div", { sinif: "vt-alt", attr: { style: "padding:18px" }, yazi: "The chart appears once the pool is indexed by DexScreener or GeckoTerminal, usually within minutes of the first trades." }));
      pozOku();
      return;
    }
    let deg = v.deg; if (deg != null && !isNaN(deg) && Math.abs(deg) < 0.05) deg = 0;
    fiyatB.textContent = para(v.fiyat);
    degS.textContent = deg == null || isNaN(deg) ? "" : (deg > 0 ? "+" : "") + Number(deg).toFixed(1) + "% · 24h";
    degS.style.color = deg > 0 ? "var(--alis)" : deg < 0 ? "var(--satis)" : "var(--yazi-3)";
    temizle(olc).append(k("Market cap", para(v.mcap)), k("Liquidity", para(v.lik)), k("24h volume", para(v.hacim)), k("24h trades", v.al + " / " + v.sat));
    if (!grafikYer.querySelector("iframe")) temizle(grafikYer).append(
      el("iframe", { attr: { src: v.gomu, title: (x.ad || "") + " chart", referrerpolicy: "no-referrer", allow: "clipboard-write", allowfullscreen: "" } }),
      el("div", { sinif: "vt-alt", attr: { style: "padding:6px 10px;opacity:.7" } }, ["Chart by " + v.kaynak + " · ", el("a", { attr: { href: v.url, target: "_blank", rel: "noopener noreferrer" }, yazi: "open full chart ↗" })]));
    pozOku();
  };
  doldur();
  const yenile = setInterval(() => { if (!kap.isConnected) { clearInterval(yenile); perde.remove(); return; } doldur(); }, 60000);

  if (m && m.olgular) sol.append(panel("About " + x.ad, el("div", {}, [
    el("ul", { sinif: "wt-liste" }, m.olgular.map((o) => el("li", { yazi: o }))),
    el("p", { sinif: "vt-alt", attr: { style: "opacity:.8" }, yazi: x.ad + " is one of the Pulse Squad: ARC PULSE's mascot memecoins, one per chain. It is not ARCP and promises nothing; its trading fees fund the platform. Memecoins are risky: buy only what you can afford to lose." }),
    el("a", { attr: { href: "#/warp" }, yazi: "Meet the whole squad on Warp →" }),
  ])));
  else if (warp) sol.append(panel("About", el("p", { sinif: "vt-alt", yazi: "Launched by its creator through Warp on " + x.lp + ". ARC PULSE does not hold or control this token. Memecoins are risky: check the chart and who holds the supply before you buy." })));
  else sol.append(panel("About", el("p", { sinif: "vt-alt", yazi: x.zk === "arc"
    ? "Launched on ARC PULSE's own launchpad: one pool on Arc with the same price on every chain, liquidity locked from the first block, and a collateral basket behind it that holders can redeem against. Memecoins are risky: buy only what you can afford to lose."
    : "Launched on ARC PULSE's Move launchpad on " + x.zincir + ", traded against its own vault there." })));
  /* a protocol demo token says so where people read about it */
  if (demoMu(x)) sol.append(el("p", { sinif: "vt-alt" }, [el("span", { sinif: "rozet-demo", yazi: "Demo" }), " A protocol demo token: launched by ARC PULSE to prove the contracts work on mainnet. It is not a project and nobody promotes it."]));
  /* a booked cross-promo: below About, away from the buy box; never on a Pulse Squad page (no mascot next to a sponsor) */
  if (!m) sol.append(sponsorYeri("token", "row", (k) => el("section", { sinif: "sponsor-bolum", attr: { "aria-label": "Sponsored" } }, [k])));
  return kap;
}

/** #/warp?t=<token>: the same view, inside Trade */
export async function ciz({ param }) {
  return (await import("./terminal.js")).ciz({ param });
}

/** A spotlight card for the newest live Pulse Squad mascot, with its live price, for Discover and Market. */
export function squadSpot() {
  stil();
  if (!document.getElementById("ws-stil")) document.head.append(el("style", { attr: { id: "ws-stil" }, yazi: `
.ws{display:flex;gap:16px;align-items:center;padding:16px;border-radius:18px;text-decoration:none;color:inherit;border:1px solid color-mix(in srgb,var(--ws,#c6f86b) 50%,transparent);background:radial-gradient(120% 160% at 0% 0%,color-mix(in srgb,var(--ws,#c6f86b) 20%,transparent),transparent 60%),var(--yuzey-1,#12141b)}
.ws:hover{border-color:var(--ws,#c6f86b)}
.ws img{width:76px;height:76px;object-fit:contain;flex:none}
.ws .g{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.ws small{font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--ws,#c6f86b)}
.ws b{font-size:19px}.ws .s{opacity:.8;font-size:13.5px}
.ws .r{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;opacity:.9}
.ws .c{flex:none;padding:10px 16px;border-radius:999px;background:var(--ws,#c6f86b);color:#10140a;font-weight:800;font-size:14px}
@media (max-width:640px){.ws{flex-wrap:wrap}.ws .c{width:100%;text-align:center}}` }));
  const m = [...SQUAD].reverse().find((x) => x.token);
  if (!m) return null;
  const rakam = el("div", { sinif: "r" }, [el("span", { yazi: "Loading price…" })]);
  const kart = el("a", { sinif: "ws", attr: { href: "#/terminal?t=" + m.token, style: "--ws:" + (m.renk || "#c6f86b") } }, [
    el("img", { attr: { src: squadResim(m), alt: m.ad + ", the Pulse Squad's " + m.zincir + " mascot" } }),
    el("div", { sinif: "g" }, [el("small", { yazi: "LIVE · PULSE SQUAD · " + m.zincir.toUpperCase() }), el("b", { yazi: m.ad + " is live on " + m.zincir }),
      el("div", { sinif: "s", yazi: "“" + m.soz + "” Launched through Warp on " + m.lp + "." }), rakam]),
    el("span", { sinif: "c", yazi: "Chart & buy →" }),
  ]);
  piyasa(m.zincir.toLowerCase(), m.token).then((c) => {
    const ca = el("span", { yazi: "CA " + m.token.slice(0, 6) + "…" + m.token.slice(-4) });
    if (!c) { temizle(rakam).append(ca); return; }
    temizle(rakam).append(el("span", { yazi: "Price " + para(c.fiyat) }), el("span", { yazi: "Market cap " + para(c.mcap) }), el("span", { yazi: "24h volume " + para(c.hacim) }), ca);
  }).catch(() => {});
  return kart;
}
