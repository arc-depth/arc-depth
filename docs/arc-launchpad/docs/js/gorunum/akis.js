/* ===========================================================================
 * gorunum/akis.js — Hot tokens (#/akis). 17 Nov 2026, replaces the Feed of 16 Nov (owner: "feed saçma sapan bir şey …
 * fomoya yakın bir şey yapacağız … Feed'in yerine geçsin").
 *
 * One list of tokens worth looking at, across 13 chains (17 Nov: Arc, Elysium, Avalanche, HyperEVM, Sui, Aptos added), that every visitor can trade by hand from their own wallet — and
 * the same list the spot test bot picks from. WHICH TOKENS: scripts/pulse-liste.js, hourly, writes veri/pulse-liste.json:
 * GeckoTerminal trending + new pools, a market floor (liquidity, volume, age) and a safety gate (RugCheck on Solana;
 * GoPlus + honeypot.is on EVM). Tokens that fail are not shown; lesser findings show as a warning on the card.
 * Prices are refreshed live in the browser (GeckoTerminal multi-token call). Tabs: Trending, New, Gainers, Watchlist
 * (the watchlist lives in THIS browser only). Tap a token: its market page with the swap card (pay in USDC or any gas
 * token). Nothing about the visitor is sent anywhere or stored by ARC PULSE.
 * =========================================================================== */
import { el } from "../ui.js";
import { fiyatYaz } from "./portfoy-ust.js";

const ZINCIR = [["", "All chains"], ["arc", "Arc"], ["elysium", "Elysium"], ["solana", "Solana"], ["base", "Base"], ["bsc", "BNB"], ["ethereum", "Ethereum"], ["arbitrum", "Arbitrum"],
  ["avalanche", "Avalanche"], ["monad", "Monad"], ["hyperevm", "HyperEVM"], ["robinhood", "Robinhood"], ["sui", "Sui"], ["aptos", "Aptos"]];
const ZAD = Object.fromEntries(ZINCIR.slice(1));
const GECKO_AG = { arc: "arc", elysium: "elysium", solana: "solana", base: "base", bsc: "bsc", ethereum: "eth", arbitrum: "arbitrum", avalanche: "avax", monad: "monad", hyperevm: "hyperevm", robinhood: "robinhood", sui: "sui-network", aptos: "aptos" };
/* Sui and Aptos tokens: relay does not reach them, so they open on GeckoTerminal instead of our swap card */
const TAKASSIZ = new Set(["sui", "aptos"]);
const IZLE = "arcpulse-izlenen-tokenler";
/* 17 Nov 2026 (owner: "illa GeckoTerminal mi olacak"): live prices from DexScreener (free, no key, ~300 calls a minute,
   30 tokens a call), shaped like GeckoTerminal's multi-token answer so the code that reads it stays the same.
   GeckoTerminal is left for the hourly candles the Time Machines need. Per token: its deepest pair. */
async function dsMulti(z, adresler) {
  const l = await fetch("https://api.dexscreener.com/tokens/v1/" + z + "/" + adresler.join(",")).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const en = new Map();
  for (const p of Array.isArray(l) ? l : []) {
    const a = String(p.baseToken && p.baseToken.address || ""), liq = Number(p.liquidity && p.liquidity.usd) || 0;
    if (a && (!en.has(a.toLowerCase()) || en.get(a.toLowerCase()).liq < liq)) en.set(a.toLowerCase(), { liq, p });
  }
  return { data: [...en.values()].map(({ liq, p }) => ({ attributes: { address: p.baseToken.address, price_usd: p.priceUsd, total_reserve_in_usd: liq, volume_usd: { h24: p.volume && p.volume.h24 }, market_cap_usd: p.marketCap || p.fdv, image_url: p.info && p.info.imageUrl } })) };
}
const STIL = `
.ht{display:flex;flex-direction:column;gap:12px;min-width:0;max-width:760px;margin:0 auto}
.ht-ust h1{margin:0;font-size:24px}.ht-ust p{margin:4px 0 0;color:var(--yazi-3);font-size:13.5px;line-height:1.45}
.ht-sekme{display:flex;gap:18px;border-bottom:1px solid var(--cizgi);overflow-x:auto;scrollbar-width:none}.ht-sekme::-webkit-scrollbar{display:none}
.ht-sekme button{background:none;border:0;color:var(--yazi-3);font:600 15px var(--yazi-tipi);padding:8px 0 10px;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap}
.ht-sekme button[aria-selected=true]{color:var(--yazi-1);border-bottom-color:var(--marka)}
.ht-arac{display:flex;gap:8px;align-items:center}
.ht-ara{flex:1;min-width:0;height:40px;border-radius:12px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-0);color:var(--yazi-1);padding:0 12px;font:14px var(--yazi-tipi)}
.ht-cip{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.ht-cip::-webkit-scrollbar{display:none}
.ht-cip button{flex:none;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--cizgi-guclu);background:none;color:var(--yazi-2);font:500 13px var(--yazi-tipi);cursor:pointer}
.ht-cip button[aria-pressed=true]{border-color:var(--marka);background:rgba(124,92,255,.15);color:var(--yazi-1)}
.ht-liste{display:flex;flex-direction:column;background:var(--yuzey-1);border:1px solid var(--cizgi);border-radius:16px;overflow:hidden}
.ht-satir{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--cizgi);text-decoration:none;color:inherit}
.ht-satir:last-child{border-bottom:0}.ht-satir:hover{background:var(--yuzey-2)}
.ht-logo{width:44px;height:44px;border-radius:50%;object-fit:cover;background:#2a2a36;display:grid;place-items:center;font:800 13px var(--yazi-tipi);color:#cfcfe0}
.ht-ad{min-width:0}.ht-ad b{font-size:15.5px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden}
.ht-ad small{display:block;font-size:12.5px;color:var(--yazi-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.ht-rozet{flex:none;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px}
.ht-rozet--temiz{background:rgba(46,213,140,.14);color:var(--alis)}.ht-rozet--uyari{background:rgba(245,194,107,.15);color:#f5c26b}.ht-rozet--yok{background:var(--yuzey-2);color:var(--yazi-3)}
.ht-sag{text-align:right;display:flex;align-items:center;gap:10px}
.ht-fiyat b{display:block;font-size:15px;font-variant-numeric:tabular-nums}.ht-fiyat span{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.ht-art{color:var(--alis)}.ht-eks{color:var(--satis)}
.ht-yildiz{background:none;border:0;font-size:18px;cursor:pointer;color:var(--yazi-3);padding:4px}.ht-yildiz[aria-pressed=true]{color:#f5c26b}
.ht-al{height:34px;padding:0 14px;border-radius:999px;border:0;background:var(--alis);color:#04150e;font:700 13.5px var(--yazi-tipi);cursor:pointer}
.ht-not{font-size:12px;color:#f5c26b;margin-top:3px;white-space:normal}
.ht-bos{padding:24px 16px;color:var(--yazi-3);font-size:14px;text-align:center}
.ht-alt{font-size:12px;color:var(--yazi-3);line-height:1.5}
@media (max-width:520px){.ht-al{display:none}.ht-satir{gap:10px;padding:11px 12px}}
`;
const kisa = (x) => !(x > 0) ? "—" : "$" + (x >= 1e9 ? (x / 1e9).toFixed(2) + "B" : x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? (x / 1e3).toFixed(0) + "K" : x.toFixed(0));
const yasYaz = (h) => h < 1 ? "<1h" : h < 48 ? h + "h" : Math.round(h / 24) + "d";

export async function ciz() {
  if (!document.getElementById("ht-stil")) document.head.append(el("style", { attr: { id: "ht-stil" }, yazi: STIL }));
  const kok = el("div", { sinif: "ht" }); kok.dataset.icindekilerYok = "1";
  const guncel = el("span");
  kok.append(el("div", { sinif: "ht-ust" }, [el("h1", { yazi: "Hot tokens" }),
    el("p", {}, ["Tokens moving across 13 chains that passed our safety checks. Buy with USDC or any chain's gas token, from your own wallet. ", guncel])]));
  /* 17 Nov 2026 (owner): the tab is "Hotweet", after Watchlist where the owner marked it — it will hold more than posts
     (e.g. the same movers' wallets on chain) */
  const SEKME = [["trend", "Trending"], ["yeni", "New"], ["yukselen", "Gainers"], ["izlenen", "Watchlist"], ["tweet", "Hotweet"]];
  let sekme = "trend", zincir = "", veri = null;
  /* 17 Nov 2026 (owner: "tek bir tweeti tokenleri uçuran kişilerin tweetlerini takip et"): Tweeted — tokens named in posts
     by accounts whose single post moves prices (scripts/tweet-radar.js -> veri/tweet-tokenler.json). Each card: who, when,
     an excerpt with a link to the post, how the token was matched, and the price change since we first saw it. */
  let tw = null, twYukleniyor = false;
  const ESLESME = { ca: "contract address in the post", cashtag: "$ticker in the post", isim: "named in the post", kelime: "launched after the post, named after it" };
  const ne = (ms) => { const d = (Date.now() - ms) / 60000; return d < 60 ? Math.max(1, Math.round(d)) + "m ago" : d < 1440 ? Math.round(d / 60) + "h ago" : Math.round(d / 1440) + "d ago"; };
  async function tweetYukle() {
    if (twYukleniyor) return; twYukleniyor = true;
    try { tw = await fetch("veri/tweet-tokenler.json?t=" + Math.floor(Date.now() / 60000)).then((r) => r.json()); } catch (e) { tw = { kayitlar: [], hata: true }; }
    /* live prices for the tokens in it (one multi-token call per chain) */
    const gr = {}; for (const k of tw.kayitlar || []) (gr[k.token.z] = gr[k.token.z] || new Map()).set(k.token.a.toLowerCase(), k.token);
    for (const [z, m] of Object.entries(gr)) {
      try {
        const j = await dsMulti(z, [...m.keys()].slice(0, 30));
        for (const d of j.data || []) { const a = d.attributes; const p = Number(a.price_usd); for (const k of tw.kayitlar) if (k.token.z === z && k.token.a.toLowerCase() === String(a.address).toLowerCase() && p > 0) k.token.fiyat = p; }
      } catch (e) { /* keep the price we saw */ }
    }
    twYukleniyor = false; if (sekme === "tweet") ciz_();
  }
  function tweetCiz() {
    if (!tw) { liste.replaceChildren(el("div", { sinif: "ht-bos", yazi: "Loading posts…" })); tweetYukle(); return; }
    let l = (tw.kayitlar || []).slice();
    if (zincir) l = l.filter((k) => k.token.z === zincir);
    const q = ara.value.trim().toLowerCase();
    if (q) l = l.filter((k) => [k.yazar, k.metin, k.token.sembol, k.token.ad, k.token.a].join(" ").toLowerCase().includes(q));
    const ust = tw.okuma === "paused" ? el("div", { sinif: "ht-bos", yazi: "Reading posts is paused right now; the cards below are the latest we saw." }) : "";
    if (!l.length) { liste.replaceChildren(...[ust, el("div", { sinif: "ht-bos", yazi: "No token named in the watched accounts' posts in the last 72 hours. They are checked every few minutes." })].filter(Boolean)); return; }
    liste.replaceChildren(...[ust].filter(Boolean), ...l.slice(0, 60).map((k) => {
      const t = { ...k.token, guvenlik: k.guvenlik, d24: k.token.fiyatIlk > 0 && k.token.fiyat > 0 ? (k.token.fiyat / k.token.fiyatIlk - 1) * 100 : null };
      return el("div", { attr: { style: "border-bottom:1px solid var(--cizgi)" } }, [
        el("div", { attr: { style: "padding:12px 14px 0;font-size:13px;color:var(--yazi-3)" } }, [
          el("a", { attr: { href: "https://x.com/" + k.yazar, target: "_blank", rel: "noopener", style: "color:var(--yazi-1);font-weight:700;text-decoration:none" }, yazi: "@" + k.yazar }),
          " · " + ne(Date.parse(k.zaman)) + " · " + (ESLESME[k.tur] || k.tur) + (k.tur === "kelime" ? " (“" + k.ipucu + "”)" : "") + " · % = since we saw it",
          el("div", { attr: { style: "color:var(--yazi-2);margin-top:4px;line-height:1.4" } }, ["“" + k.metin.replace(/(fuck|shit|bitch|cunt|dick|pussy|bastard|motherf)w*/gi, (w) => w[0] + "***") + (k.metin.length >= 200 ? "…" : "") + "” ", el("a", { attr: { href: k.url, target: "_blank", rel: "noopener" }, yazi: "View post ↗" })])]),
        satir(t)]);
    }));
  }
  /* 17 Nov 2026: the watchlist keeps each token's own card data, so a token that drops off the list stays watched
     (with a live price); kept in this browser only. Older lists held only keys. */
  const izlenen = new Map();
  try { for (const x of JSON.parse(localStorage.getItem(IZLE) || "[]")) { if (typeof x === "string") { const [z, a] = x.split(":"); izlenen.set(x, { z, a, sembol: a.slice(0, 6) }); } else if (x && x.z && x.a) izlenen.set(x.z + ":" + x.a.toLowerCase(), x); } } catch (e) { /* blocked */ }
  const izleKaydet = () => { try { localStorage.setItem(IZLE, JSON.stringify([...izlenen.values()])); } catch (e) { /* blocked */ } };
  const izleKart = (t) => ({ z: t.z, a: t.a, sembol: t.sembol, ad: t.ad, resim: t.resim, havuz: t.havuz, fiyat: t.fiyat });
  const disarida = new Map();   // watched tokens not on the list now: stub rows, prices filled live
  const sekmeBar = el("div", { sinif: "ht-sekme", attr: { role: "tablist" } });
  const cipBar = el("div", { sinif: "ht-cip" });
  const ara = el("input", { sinif: "ht-ara", attr: { type: "search", placeholder: "Search name, symbol or address", "aria-label": "Search tokens" } });
  const liste = el("div", { sinif: "ht-liste" }, [el("div", { sinif: "ht-bos", yazi: "Loading tokens…" })]);
  const alt = el("p", { sinif: "ht-alt" });
  kok.append(sekmeBar, el("div", { sinif: "ht-arac" }, [ara]), cipBar, liste, alt);

  const satir = (t) => {
    const k = t.z + ":" + t.a.toLowerCase();
    const logo = t.resim ? el("img", { sinif: "ht-logo", attr: { src: t.resim, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : el("span", { sinif: "ht-logo", yazi: String(t.sembol || "?").slice(0, 3) });
    if (t.resim) logo.addEventListener("error", () => logo.replaceWith(el("span", { sinif: "ht-logo", yazi: String(t.sembol || "?").slice(0, 3) })));
    const g = t.guvenlik || { durum: "yok", notlar: [] };
    const rozet = el("span", { sinif: "ht-rozet ht-rozet--" + g.durum, attr: { title: g.durum === "temiz" ? "Passed the safety checks (" + (g.kaynak || "") + ")" : g.notlar.join("; ") }, yazi: g.durum === "temiz" ? "✓ checked" : g.durum === "uyari" ? "⚠ note" : "? unchecked" });
    const yildiz = el("button", { sinif: "ht-yildiz", attr: { type: "button", "aria-pressed": String(izlenen.has(k)), "aria-label": "Watch " + t.sembol }, yazi: "★", on: { click: (e) => {
      e.preventDefault(); e.stopPropagation(); izlenen.has(k) ? izlenen.delete(k) : izlenen.set(k, izleKart(t)); izleKaydet(); yildiz.setAttribute("aria-pressed", String(izlenen.has(k))); if (sekme === "izlenen") ciz_(); } } });
    const al = TAKASSIZ.has(t.z) ? "" : el("button", { sinif: "ht-al", attr: { type: "button" }, yazi: "Buy", on: { click: (e) => { e.preventDefault(); e.stopPropagation(); location.hash = "#/terminal?z=" + t.z + "&a=" + t.a + "&yon=al"; } } });
    const d = t.d24;
    const link = TAKASSIZ.has(t.z) ? { href: "https://www.geckoterminal.com/" + GECKO_AG[t.z] + "/pools/" + t.havuz, target: "_blank", rel: "noopener" } : { href: "#/terminal?z=" + t.z + "&a=" + t.a };
    return el("a", { sinif: "ht-satir", attr: link }, [
      logo,
      el("span", { sinif: "ht-ad" }, [el("b", {}, [el("span", { attr: { style: "overflow:hidden;text-overflow:ellipsis" }, yazi: t.sembol }), rozet]),
        el("small", { yazi: ZAD[t.z] + " · MC " + kisa(t.mcap) + " · Liq " + kisa(t.likidite) + " · Vol " + kisa(t.hacim) + (t.yeni ? " · " + yasYaz(t.yasSaat) + " old" : "") + (TAKASSIZ.has(t.z) ? " · chart only, trade in a " + ZAD[t.z] + " wallet" : "") }),
        g.durum === "uyari" ? el("div", { sinif: "ht-not", yazi: "⚠ " + g.notlar.join(" · ") }) : ""]),
      el("span", { sinif: "ht-sag" }, [el("span", { sinif: "ht-fiyat" }, [el("b", { yazi: fiyatYaz(Number(t.fiyat)) }),
        el("span", { sinif: d > 0 ? "ht-art" : d < 0 ? "ht-eks" : "", yazi: d == null ? "—" : (d > 0 ? "+" : "") + d.toFixed(1) + "%" })]), al, yildiz])]);
  };
  function ciz_() {
    sekmeBar.replaceChildren(...SEKME.map(([k, ad]) => el("button", { attr: { type: "button", role: "tab", "aria-selected": String(sekme === k) }, yazi: ad, on: { click: () => { sekme = k; ciz_(); } } })));
    cipBar.replaceChildren(...ZINCIR.map(([k, ad]) => el("button", { attr: { type: "button", "aria-pressed": String(zincir === k) }, yazi: ad, on: { click: () => { zincir = k; ciz_(); } } })));
    if (!veri) return;
    let l = veri.tokenler.slice();
    if (sekme === "tweet") { tweetCiz(); return; }
    if (sekme === "izlenen") {
      /* watched tokens that are not on the list right now come from the watchlist itself */
      const listede = new Set(l.map((t) => t.z + ":" + t.a.toLowerCase()));
      for (const [k, x] of izlenen) if (!listede.has(k)) { if (!disarida.has(k)) disarida.set(k, { ...x, d24: null, guvenlik: { durum: "yok", notlar: ["off the list right now: not rechecked"] } }); l.push(disarida.get(k)); }
    }
    if (zincir) l = l.filter((t) => t.z === zincir);
    const q = ara.value.trim().toLowerCase();
    if (q) l = l.filter((t) => [t.sembol, t.ad, t.a].join(" ").toLowerCase().includes(q));
    if (sekme === "trend") l = l.filter((t) => t.trend != null).sort((a, b) => a.trend - b.trend || b.hacim - a.hacim);
    else if (sekme === "yeni") l = l.filter((t) => t.yeni).sort((a, b) => a.yasSaat - b.yasSaat);
    else if (sekme === "yukselen") l = l.filter((t) => t.d24 > 0).sort((a, b) => b.d24 - a.d24);
    else l = l.filter((t) => izlenen.has(t.z + ":" + t.a.toLowerCase()));
    if (!l.length) {
      liste.replaceChildren(el("div", { sinif: "ht-bos", yazi: sekme === "izlenen" ? "Tap ★ on any token to watch it here (kept in this browser only)." : q ? "No token matches “" + ara.value.trim() + "”." : "No token here right now. New movers are added every 15 minutes." }));
      return;
    }
    liste.replaceChildren(...l.slice(0, 100).map(satir));
  }
  ara.addEventListener("input", ciz_);
  ciz_();

  try {
    veri = await fetch("veri/pulse-liste.json?t=" + Math.floor(Date.now() / 300000)).then((r) => r.json());
    const dk = Math.round((Date.now() - Date.parse(veri.guncel)) / 60000);
    guncel.textContent = "List updated " + (dk < 60 ? dk + " min" : Math.round(dk / 60) + " h") + " ago; prices live.";
    alt.textContent = "How a token gets here: " + veri.kurallar + ". " + veri.engellenen + " tokens failed the checks this hour and are not shown. Checks catch common traps (minting, freezing, honeypots, taxes, a few wallets holding most of the supply), not all of them. Memecoins are risky; not advice. Third-party tokens, not launched or checked by ARC PULSE beyond these tests.";
    ciz_();
  } catch (e) { liste.replaceChildren(el("div", { sinif: "ht-bos", yazi: "The token list could not be loaded. Try again in a minute." })); return kok; }

  /* live prices: GeckoTerminal's multi-token call, 30 tokens a call, a few calls a minute (free limit) */
  const canli = async () => {
    if (!kok.isConnected) return;
    /* watched tokens that are off the list go FIRST (they have no hourly figures at all), then the list by chain */
    const listede = new Set(veri.tokenler.map((t) => t.z + ":" + t.a.toLowerCase()));
    const dis = {};
    for (const [k, x] of izlenen) if (!listede.has(k)) { if (!disarida.has(k)) disarida.set(k, { ...x, d24: null, guvenlik: { durum: "yok", notlar: ["off the list right now: not rechecked"] } }); (dis[x.z] = dis[x.z] || []).push(disarida.get(k)); }
    const gruplar = {};
    for (const t of veri.tokenler) (gruplar[t.z] = gruplar[t.z] || []).push(t);
    for (const [z, l] of [...Object.entries(dis), ...Object.entries(gruplar)]) {
      for (let i = 0; i < l.length; i += 30) {
        if (!kok.isConnected) return;
        try {
          const j = await dsMulti(z, l.slice(i, i + 30).map((t) => t.a));
          for (const d of j.data || []) { const a = d.attributes, t = l.find((x) => x.a.toLowerCase() === String(a.address).toLowerCase()); if (t && Number(a.price_usd) > 0) { const eski = t.fiyat; t.fiyat = Number(a.price_usd); if (t.d24 != null && eski > 0) t.d24 = ((1 + t.d24 / 100) * t.fiyat / eski - 1) * 100;
            if (disarida.has(t.z + ":" + t.a.toLowerCase())) { t.mcap = Number(a.market_cap_usd || a.fdv_usd) || t.mcap; t.likidite = Number(a.total_reserve_in_usd) || t.likidite; t.hacim = Number(a.volume_usd && a.volume_usd.h24) || t.hacim; if (!t.resim && a.image_url && !/missing/.test(a.image_url)) t.resim = a.image_url; } } }
          if (dis[z] === l) ciz_();   // the watched ones show at once
        } catch (e) { /* keep the hourly price */ }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    ciz_();
    setTimeout(canli, 60000);
  };
  setTimeout(canli, 1500);
  return kok;
}
