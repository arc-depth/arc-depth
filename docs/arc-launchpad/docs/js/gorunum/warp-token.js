/* ===========================================================================
 * gorunum/warp-token.js — one token launched through Warp, on ARC PULSE's own site (#/warp?t=<address>)
 *
 *   switcher  every Warp launch as a chip on top, so moving between them is one tap however many there are
 *   facts     price, market cap, liquidity, 24 h volume and trades: DexScreener's public API, read by the
 *             visitor's browser; nothing is stored, nothing invented (no pair yet = "not indexed yet")
 *   chart     DexScreener's own embedded chart of the token's pool
 *   story     for the Pulse Squad, the mascot's card; for anyone else, what they wrote at launch
 *   buy       Market's buy box: pay in dollars from any of our EVM chains, relay.link delivers the token
 * =========================================================================== */
import { el, sayfaUst, panel, bos, temizle } from "../ui.js";
import { warpLaunchlari } from "../warp-liste.js";
import { squadOf, squadResim } from "../squad.js";

const ZINCIR = { solana: "Solana", elysium: "Elysium", bsc: "BNB Chain", robinhood: "Robinhood", monad: "Monad", base: "Base", arc: "Arc" };
/* DexScreener's chain ids where they differ from ours */
const DS = { bsc: "bsc", elysium: "elysium", solana: "solana", base: "base", monad: "monad", robinhood: "robinhood", arc: "arc" };
/* chains Market's buy box reaches (relay.link) */
const ALINIR = ["elysium", "base", "bsc", "solana", "monad", "robinhood"];

const STIL = `
.wt-cipler{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:thin}
.wt-cip{display:flex;align-items:center;gap:8px;flex:none;padding:6px 12px 6px 6px;border-radius:999px;border:1px solid var(--cizgi,#2a2f3a);background:var(--yuzey-1,#12141b);color:inherit;text-decoration:none;font-weight:700;font-size:13px}
.wt-cip img,.wt-cip span.b{width:26px;height:26px;border-radius:50%;object-fit:cover;background:#241c48}
.wt-cip[aria-current="page"]{border-color:var(--marka,#7c5cff);box-shadow:0 0 0 1px var(--marka,#7c5cff) inset}
.wt-ara{width:100%;max-width:320px;margin-bottom:8px}
.wt-ust{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;border-radius:20px;padding:20px;background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,var(--wt-renk,#7c5cff) 22%,transparent),transparent 60%),var(--yuzey-1,#12141b);border:1px solid var(--cizgi,#2a2f3a)}
.wt-ust img{width:112px;height:112px;object-fit:contain;filter:drop-shadow(0 8px 24px rgba(0,0,0,.4))}
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
@media (max-width:640px){.wt-ust{grid-template-columns:1fr;text-align:center}.wt-ust img{margin:0 auto}.wt-ca{justify-content:center}.wt-grafik{height:420px}}
`;

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

/** the strip of every Warp launch; `secili` is highlighted. Shared with Trade. */
export function warpCipleri(launchlar, secili = null) {
  if (!document.getElementById("wt-stil")) document.head.append(el("style", { attr: { id: "wt-stil" }, yazi: STIL }));
  const cip = (x) => {
    const m = squadOf(x.token);
    const res = x.gorsel || (m ? squadResim(m) : null);
    return el("a", { sinif: "wt-cip", attr: { href: "#/warp?t=" + x.token, "aria-current": secili && x.token.toLowerCase() === secili.toLowerCase() ? "page" : null, title: (x.ad || "") + " · " + x.lp + " · " + (ZINCIR[x.zincir] || x.zincir) } },
      [res ? el("img", { attr: { src: res, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : el("span", { sinif: "b" }), "$" + (x.sembol || x.ad || x.token.slice(0, 6))]);
  };
  const serit = el("div", { sinif: "wt-cipler" }, launchlar.map(cip));
  if (launchlar.length <= 10) return serit;
  /* many launches: a filter box above the strip */
  const ara = el("input", { sinif: "girdi wt-ara", attr: { placeholder: "Find a Warp token by name or ticker", autocomplete: "off" } });
  ara.addEventListener("input", () => {
    const q = ara.value.trim().toLowerCase();
    temizle(serit).append(...launchlar.filter((x) => !q || (x.ad || "").toLowerCase().includes(q) || (x.sembol || "").toLowerCase().includes(q) || x.token.toLowerCase() === q).map(cip));
  });
  return el("div", {}, [ara, serit]);
}

async function dsCifti(zincir, token) {
  const r = await fetch("https://api.dexscreener.com/tokens/v1/" + (DS[zincir] || zincir) + "/" + token).then((x) => x.json()).catch(() => []);
  return (Array.isArray(r) ? r : []).sort((a, b) => Number((b.liquidity || {}).usd || 0) - Number((a.liquidity || {}).usd || 0))[0] || null;
}

export async function ciz({ param }) {
  if (!document.getElementById("wt-stil")) document.head.append(el("style", { attr: { id: "wt-stil" }, yazi: STIL }));
  const istenen = (param.get("t") || "").trim();
  const kap = el("div", { sinif: "yigin" });
  const launchlar = await warpLaunchlari();
  const x = launchlar.find((l) => l.token.toLowerCase() === istenen.toLowerCase());
  kap.append(sayfaUst("Launched with Warp", "Every token launched through Warp, with its chart, on ARC PULSE"));
  if (launchlar.length) kap.append(warpCipleri(launchlar, istenen));
  if (!x) {
    kap.append(bos("Not a Warp launch", "This address is not on the Warp list. Pick a token above, or open Warp to launch one.", el("a", { sinif: "dugme dugme--marka", attr: { href: "#/warp" }, yazi: "Open Warp" })));
    return kap;
  }
  const m = squadOf(x.token);
  const zad = ZINCIR[x.zincir] || x.zincir;
  const resim = x.gorsel || (m ? squadResim(m) : null);

  /* ---- who it is ---- */
  const kopyala = el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Copy CA" });
  kopyala.addEventListener("click", async () => { try { await navigator.clipboard.writeText(x.token); kopyala.textContent = "Copied ✓"; } catch { kopyala.textContent = "Select and copy"; } setTimeout(() => (kopyala.textContent = "Copy CA"), 1800); });
  kap.append(el("div", { sinif: "wt-ust", attr: { style: m && m.renk ? "--wt-renk:" + m.renk : "" } }, [
    resim ? el("img", { attr: { src: resim, alt: x.ad || "", referrerpolicy: "no-referrer" } }) : el("div"),
    el("div", {}, [
      el("h2", {}, [x.ad || x.sembol, m ? el("span", { sinif: "wt-rozet", yazi: "Pulse Squad" }) : null]),
      el("div", { sinif: "k", yazi: "$" + (x.sembol || "?") + " · " + zad + " · launched on " + x.lp + " through Warp · " + new Date(x.zaman).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) }),
      m && m.kisilik ? el("div", { attr: { style: "margin-top:8px" }, yazi: m.kisilik }) : null,
      m && m.soz ? el("div", { sinif: "soz", yazi: "“" + m.soz + "”" }) : null,
      el("div", { sinif: "wt-ca" }, [el("code", { yazi: "CA " + x.token }), kopyala]),
    ]),
  ]));

  /* ---- live facts and the buy button (filled when DexScreener answers) ---- */
  const olc = el("div", { sinif: "wt-olc" }, [el("div", {}, [el("span", { yazi: "Price" }), el("b", { yazi: "…" })])]);
  const eylem = el("div", { sinif: "wt-eylem" });
  const grafikYer = el("div", {}, [el("div", { sinif: "vt-alt", yazi: "Loading the chart…" })]);
  kap.append(panel("Market", el("div", {}, [olc, eylem])));
  kap.append(panel("Chart", grafikYer));

  const alDugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Buy $" + (x.sembol || "") + " from any chain" });
  const disLink = el("a", { sinif: "dugme dugme--sade", attr: { href: x.link, target: "_blank", rel: "noopener noreferrer" }, yazi: "Trade on " + x.lp + " ↗" });
  eylem.append(...(ALINIR.includes(x.zincir) ? [alDugme] : []), disLink, m && m.x ? el("a", { sinif: "dugme dugme--sade", attr: { href: m.x, target: "_blank", rel: "noopener noreferrer" }, yazi: "Launch post on X ↗" }) : null);

  let cift = null;
  const doldur = async () => {
    cift = await dsCifti(x.zincir, x.token);
    if (!cift) {
      temizle(olc).append(el("div", {}, [el("span", { yazi: "Market data" }), el("b", { attr: { style: "font-size:14px" }, yazi: "Not indexed yet" })]));
      temizle(grafikYer).append(el("div", { sinif: "vt-alt", yazi: "The chart appears once DexScreener has indexed the pool, usually within minutes of the first trades." }));
      return;
    }
    const t24 = (cift.txns || {}).h24 || {};
    let deg = (cift.priceChange || {}).h24;
    if (deg != null && Math.abs(deg) < 0.05) deg = 0;
    const k = (a, b, renk) => el("div", {}, [el("span", { yazi: a }), el("b", { attr: renk ? { style: "color:" + renk } : {}, yazi: b })]);
    temizle(olc).append(
      k("Price", para(cift.priceUsd)), k("Market cap", para(cift.marketCap || cift.fdv)), k("Liquidity", para((cift.liquidity || {}).usd)),
      k("24h volume", para((cift.volume || {}).h24)), k("24h change", deg == null ? "—" : (deg > 0 ? "+" : "") + Number(deg).toFixed(1) + "%", deg > 0 ? "#22c55e" : deg < 0 ? "#ef4444" : null),
      k("24h trades", (t24.buys || 0) + " buys · " + (t24.sells || 0) + " sells"));
    if (!grafikYer.querySelector("iframe")) temizle(grafikYer).append(
      el("iframe", { sinif: "wt-grafik", attr: { src: "https://dexscreener.com/" + (DS[x.zincir] || x.zincir) + "/" + cift.pairAddress + "?embed=1&theme=dark&info=0&trades=1", title: (x.ad || "") + " chart", loading: "lazy", referrerpolicy: "no-referrer" } }),
      el("div", { sinif: "vt-alt", attr: { style: "margin-top:6px;opacity:.7" } }, ["Chart by DexScreener · ", el("a", { attr: { href: cift.url, target: "_blank", rel: "noopener noreferrer" }, yazi: "open full chart ↗" })]));
  };
  alDugme.addEventListener("click", async () => {
    const v = await import("./vitrin.js");
    v.tokenAl({ zincir: x.zincir, adres: x.token, sembol: x.sembol || "", ad: x.ad || "", resim: resim ? new URL(resim, location.href).href : null,
      fiyat: cift && cift.priceUsd, fdv: cift && (cift.marketCap || cift.fdv), hacim: cift && (cift.volume || {}).h24, degisim: cift && (cift.priceChange || {}).h24 != null && Math.abs(cift.priceChange.h24) >= 0.05 ? cift.priceChange.h24 : 0,
      likidite: cift && (cift.liquidity || {}).usd, havuz: cift ? cift.pairAddress : "", kuruldu: x.zaman });
  });
  doldur();
  const yenile = setInterval(() => { if (!kap.isConnected) return clearInterval(yenile); doldur(); }, 60000);

  /* ---- what it is ---- */
  if (m && m.olgular) kap.append(panel("About " + x.ad, el("div", {}, [
    el("ul", { sinif: "wt-liste" }, m.olgular.map((o) => el("li", { yazi: o }))),
    el("p", { sinif: "vt-alt", attr: { style: "opacity:.8" }, yazi: x.ad + " is one of the Pulse Squad: ARC PULSE's mascot memecoins, one per chain. It is not ARCP and promises nothing; its trading fees fund the platform. Memecoins are risky: buy only what you can afford to lose." }),
    el("a", { attr: { href: "#/warp" }, yazi: "Meet the whole squad on Warp →" }),
  ])));
  else kap.append(panel("About", el("p", { sinif: "vt-alt", yazi: "Launched by its creator through Warp on " + x.lp + ". ARC PULSE does not hold or control this token. Memecoins are risky: check the chart and who holds the supply before you buy." })));
  return kap;
}
