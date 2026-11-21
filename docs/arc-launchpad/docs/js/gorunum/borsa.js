/* ===========================================================================
 * gorunum/borsa.js — Trade (#/terminal): looks like an exchange, works like a DEX (16 Nov 2026, owner: "cex gibi
 * görünsün dex gibi çalışsın, uygun dex borsalarından bizim platform işlem yaptırsın, işlem tahtasını saçma sapan kurma")
 *
 * Left: every market on our chains (GeckoTerminal's trending and new pools, gainers, ARC PULSE's own launches), with
 * a chain filter and search. Right: the market picked — price, figures, the pool's chart, its REAL swaps (a DEX has
 * no order book, so none is invented) and a Buy / Sell box. Orders are routed by relay.link through the DEXes that
 * hold the liquidity: buy with the dollars you hold on any chain, sell back to USDC on Arc. ARC PULSE's fee is the
 * Market's 0.5%, shown before signing. Our own one-pool tokens open their own page (#/terminal?t=).
 * Nothing about the visitor is stored; the last market picked is kept in this browser only.
 * =========================================================================== */
import { el } from "../ui.js";
import { cuzdan } from "../cuzdan.js";
import { rpcPost } from "../ag-okur.js";
import { fiyatYaz } from "./portfoy-ust.js";
import * as TV from "../takas-varlik.js";

const GECKO = "https://api.geckoterminal.com/api/v2";
const STIL = `
.bx{display:grid;grid-template-columns:330px minmax(0,1fr) 340px;gap:12px;align-items:start}
.bx-liste,.bx-orta,.bx-sag{min-width:0}
.bx-kart{background:var(--yuzey-1);border:1px solid var(--cizgi);border-radius:14px}
.bx-liste{position:sticky;top:calc(var(--ust-bar) + 10px);display:flex;flex-direction:column;max-height:calc(100vh - var(--ust-bar) - 24px)}
.bx-ara{margin:10px;height:38px;border-radius:10px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-0);color:var(--yazi-1);padding:0 12px;font:14px var(--yazi-tipi)}
.bx-sekme{display:flex;gap:14px;padding:0 12px;border-bottom:1px solid var(--cizgi);overflow-x:auto;scrollbar-width:none}.bx-sekme::-webkit-scrollbar{display:none}
.bx-sekme button{flex:none;background:none;border:0;border-bottom:2px solid transparent;padding:6px 0 9px;color:var(--yazi-3);font:500 13.5px var(--yazi-tipi);cursor:pointer}
.bx-sekme button[aria-selected=true]{color:var(--yazi-1);font-weight:600;border-bottom-color:var(--marka)}
.bx-zincir{display:flex;gap:6px;padding:8px 10px;overflow-x:auto;scrollbar-width:none}.bx-zincir::-webkit-scrollbar{display:none}
.bx-zincir button{flex:none;height:28px;padding:0 10px;border-radius:999px;border:1px solid var(--cizgi-guclu);background:transparent;color:var(--yazi-2);font:500 12px var(--yazi-tipi);cursor:pointer}
.bx-zincir button[aria-pressed=true]{background:#1c1730;border-color:#3a2f6b;color:#e6deff}
.bx-bas{display:grid;grid-template-columns:minmax(0,1fr) 92px 70px;gap:6px;padding:4px 12px;font-size:11px;color:var(--yazi-3)}
.bx-satirlar{overflow:auto;flex:1}
.bx-satir{all:unset;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) 92px 70px;gap:6px;align-items:center;width:100%;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--cizgi)}
.bx-satir:hover,.bx-satir[aria-current=true]{background:var(--yuzey-2)}
.bx-ad{display:flex;align-items:center;gap:8px;min-width:0}.bx-ad img,.bx-ad i{width:26px;height:26px;border-radius:8px;flex:none;object-fit:cover;background:#2a2a36;font-style:normal;font-size:10px;font-weight:700;display:grid;place-items:center;color:#0b0b10}
.bx-ad b{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bx-ad small{display:block;font-size:11px;color:var(--yazi-3)}
.bx-f{text-align:right;font-size:13px;font-variant-numeric:tabular-nums}.bx-d{text-align:right;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
.bx-art{color:var(--alis)}.bx-eks{color:var(--satis)}
.bx-ust{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px}
.bx-ust img,.bx-ust i{width:42px;height:42px;border-radius:12px;object-fit:cover;background:#2a2a36;flex:none;font-style:normal;display:grid;place-items:center;font-weight:800;color:#0b0b10}
.bx-ust h1{font-size:20px;margin:0}.bx-ust .k{font-size:12px;color:var(--yazi-3)}
.bx-fiyat{margin-left:auto;text-align:right}.bx-fiyat b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.bx-fiyat span{font-size:13px;font-weight:600}
.bx-olc{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--cizgi);border-top:1px solid var(--cizgi)}
.bx-olc div{background:var(--yuzey-1);padding:8px 12px}.bx-olc span{display:block;font-size:11px;color:var(--yazi-3)}.bx-olc b{font-size:13.5px;font-variant-numeric:tabular-nums}
.bx-grafik{margin-top:12px;overflow:hidden}.bx-grafik iframe{display:block;width:100%;height:440px;border:0}
.bx-islem{margin-top:12px}.bx-islem h3{font-size:14px;margin:0;padding:10px 14px;border-bottom:1px solid var(--cizgi)}
.bx-is{display:grid;grid-template-columns:52px 46px minmax(0,1fr) 80px 74px;gap:6px;padding:6px 14px;font-size:12.5px;font-variant-numeric:tabular-nums;border-bottom:1px solid var(--cizgi)}
.bx-is span:nth-child(3){color:var(--yazi-3);overflow:hidden;text-overflow:ellipsis}.bx-is span:nth-child(4),.bx-is span:nth-child(5){text-align:right}
.bx-kutu{padding:14px;display:flex;flex-direction:column;gap:10px;position:sticky;top:calc(var(--ust-bar) + 10px)}
.bx-tab{display:grid;grid-template-columns:1fr 1fr;padding:4px;border-radius:12px;background:var(--yuzey-0);border:1px solid var(--cizgi-guclu)}
.bx-tab button{height:38px;border-radius:9px;border:0;background:transparent;color:var(--yazi-2);font:700 14.5px var(--yazi-tipi);cursor:pointer}
.bx-tab button:first-child[aria-selected=true]{background:var(--alis);color:#04150e}.bx-tab button:last-child[aria-selected=true]{background:var(--satis);color:#2a0509}
.bx-et{font-size:12px;color:var(--yazi-3)}
.bx-elde{font-size:13px;color:var(--yazi-2);background:var(--yuzey-2);border-radius:10px;padding:8px 10px}.bx-elde:empty{display:none}.bx-elde b{color:var(--yazi-1);font-family:var(--yazi-tipi-mono)}
.bx-sol{display:flex;flex-direction:column;gap:6px}.bx-sol .dugme{align-self:flex-start}
.bx-kutu select,.bx-kutu input{height:44px;border-radius:11px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-0);color:var(--yazi-1);padding:0 12px;font:15px var(--yazi-tipi);width:100%;box-sizing:border-box}
.bx-kutu input{font-size:20px;font-weight:700}
.bx-cip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.bx-cip button{height:36px;border-radius:9px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-2);color:var(--yazi-1);font:600 13px var(--yazi-tipi);cursor:pointer}
.bx-teklif{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;padding:10px 12px;border-radius:12px;background:var(--yuzey-0);border:1px solid var(--cizgi);font-size:12.5px;font-variant-numeric:tabular-nums}
.bx-teklif span{color:var(--yazi-3)}.bx-teklif b{text-align:right;font-weight:600}.bx-teklif .uyari{grid-column:1/-1;color:#f5c26b}
.bx-ana{height:52px;border-radius:14px;border:0;font:700 16px var(--yazi-tipi);cursor:pointer}.bx-ana--al{background:var(--alis);color:#04150e}.bx-ana--sat{background:var(--satis);color:#2a0509}.bx-ana:disabled{opacity:.6}
.bx-durum{font-size:12.5px;color:var(--yazi-2);min-height:1em}
.bx-not{font-size:11.5px;color:var(--yazi-3);line-height:1.45}
.bx-bos{padding:20px 14px;color:var(--yazi-3);font-size:13px}
.bx-geri{display:none}
.bx-perde{position:fixed;inset:0;z-index:120;background:rgba(5,5,9,.62);display:flex;align-items:flex-end}.bx-perde[hidden]{display:none}
.bx-perde>.bx-sag{display:block!important;width:100%;max-height:88vh;overflow:auto;border-radius:22px 22px 0 0;background:#14141b;border:0;border-top:1px solid var(--cizgi-guclu)}
.bx-dock{display:none}
/* 17 Nov 2026: the swap card (pay / receive, token pickers) */
.tk-kart{background:var(--yuzey-0);border:1px solid var(--cizgi);border-radius:16px;padding:12px 14px}
.tk-kart--al{background:var(--yuzey-2)}
.tk-et{font-size:12.5px;color:var(--yazi-3);margin-bottom:4px}
.tk-sat{display:flex;align-items:center;gap:10px}
.bx-kutu .tk-sat input{flex:1;min-width:0;width:auto;border:0;background:transparent;height:46px;padding:0;font-size:30px;font-weight:700;font-variant-numeric:tabular-nums}
.bx-kutu .tk-sat input:focus{outline:none}
.tk-cikti{flex:1;min-width:0;font-size:30px;font-weight:700;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:46px}
.tk-cip{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 12px 0 6px;border-radius:999px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-1);color:var(--yazi-1);font:700 15px var(--yazi-tipi);cursor:pointer;flex:none;max-width:60%}
.tk-cip:not(.tk-cip--sabit)::after{content:"▾";font-size:11px;opacity:.6}
.tk-cip--sabit{cursor:default}.tk-cip>img,.tk-cip>i{width:28px!important;height:28px!important;border-radius:50%!important}
.tk-cip-ad{display:flex;flex-direction:column;line-height:1.1;text-align:left}.tk-cip-ad small{font-size:10.5px;font-weight:500;color:var(--yazi-3)}
.tk-alt{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:var(--yazi-3);margin-top:2px;min-height:1.2em}
.tk-cevir{align-self:center;margin:-14px 0;position:relative;z-index:1;width:40px;height:40px;border-radius:12px;border:4px solid var(--yuzey-1);background:var(--yuzey-2);color:var(--yazi-1);cursor:pointer;font-size:17px;line-height:1}
@media (max-width:1180px){.bx{grid-template-columns:300px minmax(0,1fr)}.bx-sag{grid-column:2}.bx-kutu{position:static}}
@media (max-width:860px){
  .bx{grid-template-columns:minmax(0,1fr)}.bx-sag{grid-column:auto}
  .bx[data-gorunum=liste] .bx-orta,.bx[data-gorunum=liste] .bx-sag{display:none}
  .bx[data-gorunum=token] .bx-liste{display:none}
  .bx-liste{position:static;max-height:none}
  .bx-geri{display:inline-flex}
  .bx-olc{grid-template-columns:repeat(2,minmax(0,1fr))}
  .bx-grafik iframe{height:330px}
  .bx[data-gorunum=token] .bx-orta ~ .bx-sag{display:none}
  .bx-kutu{position:static;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))}
  .bx-dock{display:grid;grid-template-columns:1fr 1fr;gap:10px;position:fixed;left:0;right:0;bottom:calc(var(--alt-bar) + env(safe-area-inset-bottom,0px));z-index:50;padding:10px 16px;background:rgba(11,11,16,.96);border-top:1px solid var(--cizgi)}
  .bx-dock[hidden]{display:none}
  .bx-dock button{height:50px;border-radius:14px;border:0;font:700 16px var(--yazi-tipi)}
  .bx-orta{padding-bottom:80px}
}
`;
const kisa = (x) => x == null || !isFinite(x) || x <= 0 ? "—" : "$" + (x >= 1e9 ? (x / 1e9).toFixed(2) + "B" : x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? (x / 1e3).toFixed(1) + "K" : x.toFixed(0));
const yuzde = (d) => d == null || !isFinite(d) ? el("span", { yazi: "—" }) : el("span", { sinif: d > 0 ? "bx-art" : d < 0 ? "bx-eks" : "", yazi: (d > 0 ? "+" : "") + Number(d).toFixed(1) + "%" });
const logo = (t, cls) => { if (t.resim) { const i = el("img", { attr: { src: t.resim, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }); i.addEventListener("error", () => i.replaceWith(el("i", { yazi: String(t.sembol || "?").slice(0, 3) }))); return i; } return el("i", { attr: { style: "background:#b9a6ff" }, yazi: String(t.sembol || "?").slice(0, 3) }); };
const once = (ms) => { const s = (Date.now() - ms) / 1000; return s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; };

export async function ciz({ param }) {
  const V = (await import("./vitrin.js")).borsaYardim;
  if (!document.getElementById("vt-stil")) document.head.append(el("style", { attr: { id: "vt-stil" }, yazi: V.STIL }));
  if (!document.getElementById("bx-stil")) document.head.append(el("style", { attr: { id: "bx-stil" }, yazi: STIL }));
  const kok = el("div", { sinif: "bx", veri: { gorunum: "liste", icindekilerYok: "1" } });
  /* 21 Nov 2026: the page needs a heading for screen readers and search; the board itself shows none */
  kok.append(el("h1", { sinif: "gizli-okunur", yazi: "Trade tokens on 13 chains" }));

  /* ---------------- left: markets ---------------- */
  const ara = el("input", { sinif: "bx-ara", attr: { type: "search", placeholder: "Search token or paste address", "aria-label": "Search markets" } });
  const sekmeBar = el("div", { sinif: "bx-sekme", attr: { role: "tablist" } });
  const zincirBar = el("div", { sinif: "bx-zincir" });
  const satirlar = el("div", { sinif: "bx-satirlar" });
  const liste = el("aside", { sinif: "bx-liste bx-kart" }, [ara, sekmeBar, zincirBar, el("div", { sinif: "bx-bas" }, [el("span", { yazi: "Market" }), el("span", { attr: { style: "text-align:right" }, yazi: "Price" }), el("span", { attr: { style: "text-align:right" }, yazi: "24h" })]), satirlar]);
  const SEKME = [["trend", "Trending"], ["yeni", "New"], ["yukselen", "Gainers"], ["biz", "ARC PULSE"]];
  let sekme = "trend", zincir = "", secili = null, piyasa = { trend: [], yeni: [] }, bizim = null;
  const bxDock = el("div", { sinif: "bx-dock", attr: { hidden: true } });

  /* 16 Nov 2026 (owner: "hani nerde trendler" — Base showed 1 token, New was empty): the list held only the global
     page-1 trending/new pools (~20, most new ones below the liquidity floor), and a chain chip just filtered that.
     Now each chain's own trending + new pools are loaded (when its chip is picked, and the big chains in the
     background for "All chains"), and merged without duplicates. */
  const zv = {};
  const birlestir = (...ler) => ler.flat().filter((t, i, a) => t && a.findIndex((x) => x.zincir.k === t.zincir.k && x.adres.toLowerCase() === t.adres.toLowerCase()) === i);
  const zincirYukle = async (k) => {
    if (zv[k]) return; zv[k] = { yukleniyor: true, trend: [], yeni: [] };
    const z = V.ZINCIRLER.find((x) => x.k === k);
    try { const d = await V.veri(z); zv[k] = { trend: V.suz(d.trend.filter((t) => t.likidite >= V.ESIK)), yeni: V.suz(d.yeni.filter((t) => t.likidite >= V.ESIK_YENI)) }; }
    catch (e) { zv[k] = { hata: true, trend: [], yeni: [] }; setTimeout(() => { delete zv[k]; }, 60000); }
    listeCiz();
  };
  const kaynakListe = (tur) => {
    const ek = Object.values(zv).flatMap((x) => x[tur] || []);
    const l = birlestir(piyasa[tur], ek);
    if (tur === "yeni") return l.sort((a, b) => Date.parse(b.kuruldu || 0) - Date.parse(a.kuruldu || 0));
    return [...birlestir(piyasa.trend), ...birlestir(ek).filter((t) => !piyasa.trend.includes(t)).sort((a, b) => Number(b.hacim) - Number(a.hacim))].filter((t, i, a) => a.indexOf(t) === i);
  };
  const listeCiz = () => {
    sekmeBar.replaceChildren(...SEKME.map(([k, ad]) => el("button", { attr: { type: "button", role: "tab", "aria-selected": String(sekme === k) }, yazi: ad, on: { click: () => { sekme = k; listeCiz(); if (k === "biz" && !bizim) bizimYukle(); } } })));
    zincirBar.replaceChildren(...[["", "All chains"], ...V.ZINCIRLER.map((z) => [z.k, z.ad])].map(([k, ad]) => el("button", { attr: { type: "button", "aria-pressed": String(zincir === k) }, yazi: ad, on: { click: () => { zincir = k; listeCiz(); if (k) zincirYukle(k); } } })));
    let l = sekme === "trend" ? kaynakListe("trend") : sekme === "yeni" ? kaynakListe("yeni") : sekme === "yukselen" ? [...kaynakListe("trend"), ...kaynakListe("yeni")].filter((t, i, a) => a.findIndex((x) => x.adres === t.adres) === i && Number(t.degisim) > 0).sort((a, b) => Number(b.degisim) - Number(a.degisim)) : (bizim || []);
    if (zincir) l = l.filter((t) => t.zincir && t.zincir.k === zincir);
    const q = ara.value.trim().toLowerCase();
    if (q) l = l.filter((t) => [t.sembol, t.ad, t.adres].join(" ").toLowerCase().includes(q));
    if (!l.length) {
      const zad = zincir ? (V.ZINCIRLER.find((x) => x.k === zincir) || {}).ad : "";
      const yaz = sekme === "biz" ? (bizim ? "No ARC PULSE launch matches." : "Loading ARC PULSE launches…")
        : q ? "No market matches “" + ara.value.trim() + "”."
        : zincir && zv[zincir] && zv[zincir].yukleniyor ? "Loading " + zad + " markets…"
        : zincir && zv[zincir] && zv[zincir].hata ? "The market data service is busy. Pick " + zad + " again in a minute."
        : zincir ? "No " + zad + " market with enough liquidity right now (pools under $" + (sekme === "yeni" ? V.ESIK_YENI : V.ESIK).toLocaleString("en-US") + " are hidden for your safety)."
        : piyasa.trend.length || piyasa.yeni.length ? "Loading more markets…" : "Loading markets…";
      satirlar.replaceChildren(el("div", { sinif: "bx-bos", yazi: yaz })); return;
    }
    satirlar.replaceChildren(...l.slice(0, 80).map((t) => el("button", { sinif: "bx-satir", attr: { type: "button", "aria-current": String(!!secili && secili.adres === t.adres) }, on: { click: () => sec(t) } }, [
      el("span", { sinif: "bx-ad" }, [logo(t), el("span", { attr: { style: "min-width:0" } }, [el("b", { yazi: t.sembol }), el("small", { yazi: (t.zincir ? t.zincir.ad : "") + " · Vol " + kisa(Number(t.hacim)) })])]),
      el("span", { sinif: "bx-f", yazi: fiyatYaz(Number(t.fiyat)) }),
      el("span", { sinif: "bx-d" }, [yuzde(t.degisim == null ? null : Number(t.degisim))])])));
  };
  ara.addEventListener("input", listeCiz);
  const bizimYukle = async () => {
    try {
      const [t, lk] = await Promise.all([import("./terminal.js"), import("../launch-kaynak.js")]);
      const K = await lk.launchKaynagi();
      const rows = lk.demoSonda(K.satirlar);
      const v = await t.launchPiyasa(rows).catch(() => ({}));
      bizim = rows.map((s) => { const m = v[String(s.token).toLowerCase()] || {}; return { bizim: true, s, adres: s.token, sembol: s.sembol || s.ad || "?", ad: s.ad, zincir: V.ZINCIRLER.find((z) => z.k === s.zk) || { k: s.zk, ad: s.zincir }, fiyat: m.fiyat, degisim: m.deg, hacim: m.hacim, fdv: m.mcap, resim: s.gorsel || m.resim }; });
    } catch (e) { bizim = []; }
    listeCiz();
  };

  /* ---------------- middle: the market ---------------- */
  const orta = el("section", { sinif: "bx-orta" });
  /* ---------------- right: buy / sell ---------------- */
  const sag = el("aside", { sinif: "bx-sag bx-kart" });
  kok.append(liste, orta, sag);

  let islemZaman = null;
  function sec(t) {
    if (t.bizim) { location.hash = "#/terminal?t=" + encodeURIComponent(t.adres); return; }
    secili = t; kok.dataset.gorunum = "token"; kok.dataset.sayfa = "";
    try { localStorage.setItem("arcpulse-borsa-son", JSON.stringify({ z: t.zincir.k, a: t.adres })); } catch (e) { /* storage blocked */ }
    try { history.replaceState(null, "", "#/terminal?z=" + t.zincir.k + "&a=" + t.adres); } catch (e) { /* not allowed */ }
    listeCiz(); ortaCiz(); kutuCiz("al");
    bxDock.hidden = false;
    window.scrollTo({ top: 0 });
  }

  function ortaCiz() {
    const t = secili;
    const geri = el("button", { sinif: "dugme dugme--sade dugme--kucuk bx-geri", attr: { type: "button" }, yazi: "← Markets", on: { click: () => { kok.dataset.gorunum = "liste"; kok.dataset.sayfa = ""; bxDock.hidden = true; } } });
    const islemler = el("div", {}, [el("div", { sinif: "bx-bos", yazi: "Loading the pool's swaps…" })]);
    /* 17 Nov 2026 (owner: "öyle bir düğme yok"): a device-only Solana account shows its link offer ON the page, not only
       inside the Buy/Sell sheet */
    let bagUyari = "";
    try {
      if (t.zincir.k === "solana" && localStorage.getItem("arcpulse-sol-cihaz") && localStorage.getItem("arcpulse-sol-tasindi") !== "1") {
        bagUyari = el("div", { sinif: "bx-kart", attr: { style: "padding:12px 14px;margin-bottom:10px;border-color:var(--marka,#7c5cff)" } }, [
          el("div", { attr: { style: "font-weight:600;margin-bottom:4px" }, yazi: "Your Solana tokens are on this phone only" }),
          el("div", { sinif: "k", attr: { style: "margin-bottom:8px" }, yazi: "Link them to your wallet once: then the same wallet opens them on any phone, nothing to back up." }),
          el("button", { sinif: "dugme dugme--marka dugme--kucuk", attr: { type: "button" }, yazi: "Link to my wallet", on: { click: async () => {
            /* point the box back at the device account so its "Link to my wallet" step shows, whatever was stored since */
            try { const m = await import("../solana-ikiz.js"); const a = await m.cihazAdresi();
              localStorage.setItem("arcpulse-sol-adres", a); localStorage.setItem("arcpulse-sol-adres-cihaz", "1"); localStorage.setItem("arcpulse-sol-tur", "cihaz"); } catch (e) { /* blocked */ }
            if (!cuzdan.hesap()) { try { await cuzdan.bagla(); } catch (e) { return; } }
            kutuCiz("sat"); if (window.matchMedia("(max-width: 860px)").matches) sayfaAc(); } } })]);
      }
    } catch (e) { /* storage blocked */ }
    /* 17 Nov 2026 (owner sold GTA6, the USDC stayed in the phone's Solana account): USDC sitting in the device Solana
       account gets a one-tap "Move to Arc" card (no ARC PULSE fee: it is the visitor's own money moving) */
    const usdcKart = el("div");
    try {
      if (t.zincir.k === "solana" && localStorage.getItem("arcpulse-sol-cihaz")) (async () => {
        const m = await import("../solana-ikiz.js"); const dev = await m.cihazAdresi();
        const ham = BigInt(await m.splBakiye(dev, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") || 0);
        if (ham < 1000000n) return;
        const yaz = el("div", { sinif: "k", attr: { style: "margin-top:6px" } });
        const dug = el("button", { sinif: "dugme dugme--marka dugme--kucuk", attr: { type: "button" }, yazi: "Move to Arc", on: { click: async () => {
          dug.disabled = true;
          try {
            if (!cuzdan.hesap()) await cuzdan.bagla();
            const sb = await fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [dev] }) }).then((r) => r.json());
            if (((sb.result && sb.result.value) || 0) < 1500000) throw new Error("this Solana account has too little SOL for the network fee");
            yaz.textContent = "Finding the route…";
            const q = await fetch(V.RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: dev, recipient: cuzdan.hesap(), originChainId: 792703809, destinationChainId: 5042, originCurrency: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", destinationCurrency: "0x3600000000000000000000000000000000000000", amount: ham.toString(), tradeType: "EXACT_INPUT", refundTo: dev }) }).then((r) => r.json());
            if (!q.steps || !q.steps.length) throw new Error(q.message || "no route right now");
            yaz.textContent = "Sending ≈ " + Number(q.details.currencyOut.amountFormatted).toFixed(2) + " USDC to Arc…";
            for (const a of q.steps) for (const it of a.items || []) { if (a.kind !== "transaction") continue; await m.cihazRelayAdimi(it.data); }
            yaz.textContent = "Sent ✓ ≈ " + Number(q.details.currencyOut.amountFormatted).toFixed(2) + " USDC arrives on Arc at " + cuzdan.hesap().slice(0, 6) + "…, usually within a minute.";
            dug.remove();
          } catch (e) { yaz.textContent = "Not moved: " + ((e && (e.shortMessage || e.message)) || e) + ". Your USDC is safe where it is."; dug.disabled = false; }
        } } });
        usdcKart.replaceWith(el("div", { sinif: "bx-kart", attr: { style: "padding:12px 14px;margin-bottom:10px;border-color:var(--marka,#7c5cff)" } }, [
          el("div", { attr: { style: "font-weight:600;margin-bottom:4px" }, yazi: (Number(ham) / 1e6).toFixed(2) + " USDC is in your ARC PULSE Solana account" }),
          el("div", { sinif: "k", attr: { style: "margin-bottom:8px" }, yazi: "Move it to Arc as USDC, to your connected wallet. No ARC PULSE fee; Solana's network fee is paid from this account." }), dug, yaz]));
      })().catch(() => {});
    } catch (e) { /* storage blocked */ }
    const tmYer = el("div");
    import("./spot-zaman.js").then((M) => { if (secili === t) tmYer.replaceWith(M.spotZamanMakinesi({ t: { ...t, z: t.zincir && t.zincir.k }, fiyat: (x) => fiyatYaz(Number(x)) }).kutu); }).catch(() => {});
    /* 18 Nov 2026: indicator scorecard of this token, from the same hourly history the Time Machine reads */
    const karneYer = el("div");
    /* 18 Nov 2026: Pattern Hunter on this token (gorunum/formasyon-panel.js), from the same hourly history */
    const formasyonYer = el("div");
    Promise.all([import("./spot-zaman.js"), import("./formasyon-panel.js")]).then(([Z, P]) => { if (secili !== t) return; const tt = { ...t, z: t.zincir && t.zincir.k }; formasyonYer.replaceWith(P.formasyonPaneli({ ad: () => t.sembol, mumGetir: async () => { const m = await Z.mumlar(tt); return m ? m.map((x) => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })) : null; } }).kutu); }).catch(() => {});
    Promise.all([import("./spot-zaman.js"), import("./karne.js")]).then(([Z, K]) => { if (secili !== t) return; const tt = { ...t, z: t.zincir && t.zincir.k }; karneYer.replaceWith(K.karnePaneli({ ad: () => t.sembol, mumGetir: async () => { const m = await Z.mumlar(tt); return m ? m.map((x) => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })) : null; } }).kutu); }).catch(() => {});
    orta.replaceChildren(
      geri, usdcKart, bagUyari,
      el("div", { sinif: "bx-kart" }, [
        el("div", { sinif: "bx-ust" }, [logo(t), el("div", { attr: { style: "min-width:0" } }, [el("h1", { yazi: t.sembol }), el("div", { sinif: "k", yazi: (t.ad && t.ad !== t.sembol ? t.ad + " · " : "") + t.zincir.ad + (t.dex ? " · " + t.dex : "") + " · " + t.adres.slice(0, 6) + "…" + t.adres.slice(-4) })]),
          el("div", { sinif: "bx-fiyat" }, [el("b", { yazi: fiyatYaz(Number(t.fiyat)) }), yuzde(t.degisim == null ? null : Number(t.degisim))])]),
        el("div", { sinif: "bx-olc" }, [["Market cap", kisa(Number(t.fdv))], ["Liquidity", kisa(Number(t.likidite))], ["24h volume", kisa(Number(t.hacim))], ["24h trades", t.islem ? String(t.islem) : "—"]].map(([a, b]) => el("div", {}, [el("span", { yazi: a }), el("b", { yazi: b })])))]),
      el("div", { sinif: "bx-kart bx-grafik" }, [el("iframe", { attr: { src: "https://www.geckoterminal.com/" + t.zincir.gecko + "/pools/" + t.havuz + "?embed=1&info=0&swaps=0&grayscale=0&light_chart=0", title: t.sembol + " chart", referrerpolicy: "no-referrer", loading: "lazy" } })]),
      tmYer,   /* 17 Nov 2026: the spot Time Machines (gorunum/spot-zaman.js), under the chart */
      karneYer,
      formasyonYer,
      el("div", { sinif: "bx-kart bx-islem" }, [el("h3", { yazi: "Latest swaps in this pool" }), islemler]),
      el("p", { sinif: "bx-not", attr: { style: "margin:10px 2px" }, yazi: "A DEX has no order book: these are the pool's real swaps, from GeckoTerminal. Third-party token — not launched or checked by ARC PULSE. Memecoins are risky." }));
    clearInterval(islemZaman);
    const yukle = async () => {
      if (!orta.isConnected || secili !== t) { clearInterval(islemZaman); return; }
      try {
        const j = await fetch(GECKO + "/networks/" + t.zincir.gecko + "/pools/" + t.havuz + "/trades", { headers: { accept: "application/json" } }).then((r) => r.json());
        const l = (j.data || []).slice(0, 30).map((x) => x.attributes);
        if (!l.length) { islemler.replaceChildren(el("div", { sinif: "bx-bos", yazi: "No swaps returned right now." })); return; }
        islemler.replaceChildren(el("div", { sinif: "bx-is", attr: { style: "color:var(--yazi-3);font-size:11px" } }, ["Age", "Side", "Wallet", "Value", "Price"].map((x) => el("span", { yazi: x }))),
          ...l.map((a) => { const al = a.kind === "buy"; const px = al ? Number(a.price_to_in_usd) : Number(a.price_from_in_usd);
            return el("div", { sinif: "bx-is" }, [el("span", { yazi: once(Date.parse(a.block_timestamp)) }), el("span", { sinif: al ? "bx-art" : "bx-eks", yazi: al ? "Buy" : "Sell" }),
              el("span", { yazi: (a.tx_from_address || "").slice(0, 6) + "…" + (a.tx_from_address || "").slice(-4) }), el("span", { yazi: "$" + Number(a.volume_in_usd).toLocaleString("en-US", { maximumFractionDigits: 0 }) }), el("span", { yazi: fiyatYaz(px) })]); }));
      } catch (e) { islemler.replaceChildren(el("div", { sinif: "bx-bos", yazi: "Swaps could not be loaded right now." })); }
    };
    yukle(); islemZaman = setInterval(yukle, 45000);   // 17 Nov: was 20 s; saves the free data limit for the Time Machine
  }

  /* the Buy / Sell box: relay.link quotes through the DEXes with the liquidity; the wallet signs */
  const bakiye = {};
  async function dolarBakiyeleri() {
    const k = cuzdan.hesap(); if (!k) return;
    const zaman = (p) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("t")), 8000))]);
    await Promise.all(V.evmler().map(async (a) => { try { const r = await zaman(rpcPost(a, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: a.dolar, data: "0x70a08231" + k.toLowerCase().slice(2).padStart(64, "0") }, "latest"] })); bakiye[a.anahtar] = r && r.result && r.result !== "0x" ? Number(BigInt(r.result) / 10n ** BigInt(a.anahtar === "bsc" ? 12 : 0)) / 1e6 : 0; } catch (e) { /* unknown */ } }));
  }
  async function tokenBakiyesi(t) {
    const k = cuzdan.hesap(); const ag = V.evmler().find((a) => a.id === t.zincir.relay);
    if (!k || !ag) return null;
    try { const r = await rpcPost(ag, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: t.adres, data: "0x70a08231" + k.toLowerCase().slice(2).padStart(64, "0") }, "latest"] }); return r && r.result && r.result !== "0x" ? BigInt(r.result) : 0n; } catch (e) { return null; }
  }

  let _solM = null;
  /* 17 Nov 2026 (owner: "USDC ile ödeyeceğiz, USDC ile alacağız, ama isteyen istediği gas tokeniyle alıp satacak, tıpkı
     resimdeki gibi, ama yollar doğru olmalı"): the box is a swap card — "You pay" (amount + token picker: every chain's
     USDC and gas token) over "You receive" (the market's token; on Sell, a picker of the same assets). Routes are relay.link
     quotes; the cost line uses the POOL's price (GeckoTerminal), not relay's rounded USD figure (17 Nov: relay rounds
     tiny prices to 6 decimals — BONK showed a fake 17% loss on buy and a fake 17% gain on sell). */
  const VL = TV.varliklar(V.evmler());
  const vBul = (k) => VL.find((x) => x.k === k) || null;
  const vb = {}, vf = {};   // raw balances, USD prices, by asset key
  function kutuCiz(taraf) {
    const t = secili;
    const tokenAg = V.evmler().find((a) => a.id === t.zincir.relay);
    const tabAl = el("button", { attr: { type: "button", "aria-selected": String(taraf === "al") }, yazi: "Buy" });
    const tabSat = el("button", { attr: { type: "button", "aria-selected": String(taraf === "sat") }, yazi: "Sell" });
    tabAl.addEventListener("click", () => kutuCiz("al")); tabSat.addEventListener("click", () => kutuCiz("sat"));
    const teklifK = el("div", { sinif: "bx-teklif" }, [el("span", { yazi: "Enter an amount" }), el("b")]);
    const durum = el("div", { sinif: "bx-durum", attr: { role: "status" } });
    const ana = el("button", { sinif: "bx-ana " + (taraf === "al" ? "bx-ana--al" : "bx-ana--sat"), attr: { type: "button" }, yazi: cuzdan.hesap() ? (taraf === "al" ? "Buy " : "Sell ") + t.sembol : "Connect wallet" });
    const kapat = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", style: "align-self:flex-end" }, yazi: "Close", on: { click: () => sayfaKapat() } });
    let son = null, sayac = 0, girdi, tokHam = null, ondalik = Number(t.karar || (t.zincir.k === "solana" ? 6 : 18));
    const sol = t.zincir.k === "solana";
    const SOL_ANAHTAR = "arcpulse-sol-adres";
    const solGecerli = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(a || "").trim());
    const solAdres = () => { if (_solM && _solM.solanaCuzdan.hesap()) return _solM.solanaCuzdan.hesap(); try { const a = localStorage.getItem(SOL_ANAHTAR); return solGecerli(a) ? a : null; } catch (e) { return null; } };
    const elde = el("div", { sinif: "bx-elde", yazi: "" });
    const SOL_USDC = TV.SOL_USDC, SOL_AG = TV.SOL_AG;
    const cihazMi = () => { try { return localStorage.getItem("arcpulse-sol-adres-cihaz") === "1"; } catch (e) { return false; } };
    /* the pay asset (Buy) and the receive asset (Sell): the last pick on this browser, else the best dollar balance */
    const varsayilanOde = () => {
      const s = vBul(TV.sonSecim("ode")); if (s) return s;
      const simdiki = cuzdan.zincirId() ? V.evmler().find((a) => a.id === parseInt(cuzdan.zincirId(), 16)) : null;
      if (simdiki && bakiye[simdiki.anahtar] >= 10) return vBul(simdiki.anahtar + ":dolar");
      const enIyi = Object.entries(bakiye).sort((x, y) => y[1] - x[1])[0];
      return vBul((enIyi && enIyi[1] >= 1 ? enIyi[0] : "arc") + ":dolar") || vBul("arc:dolar");
    };
    let odeme = varsayilanOde();
    let alinan = vBul(TV.sonSecim("al")) || vBul(sol && !(cuzdan.hesap() && cihazMi()) ? "solana:dolar" : "arc:dolar");
    const eldeYaz = async () => {
      if (sol) {
        const a = solAdres();
        if (!a) { elde.textContent = "Add your Solana address to see what you hold."; tokHam = null; return; }
        elde.textContent = "Reading your " + t.sembol + " on Solana…";
        try {
          const m = _solM || (_solM = await import("../solana-ikiz.js"));
          const [h, u] = await Promise.all([m.splBakiye(a, t.adres), m.splBakiye(a, SOL_USDC).catch(() => null)]);
          tokHam = h;
          if (u != null) {
            bakiye.solana = Number(u) / 1e6;
            /* the visitor holds dollars on Solana but none where the box pointed: pay from Solana (unless they picked) */
            if (taraf === "al" && !TV.sonSecim("ode") && odeme.dolar && !(bakiye[odeme.ag.anahtar] >= 1) && bakiye.solana >= 1) { odeme = vBul("solana:dolar"); odemeCiz(); yeniden(); }
          }
        } catch (e) { tokHam = null; elde.textContent = "Could not read your Solana balance."; return; }
      } else {
        if (!cuzdan.hesap()) { elde.textContent = "Connect your wallet to see what you hold."; tokHam = null; return; }
        elde.textContent = "Reading your " + t.sembol + " on " + t.zincir.ad + "…";
        tokHam = await tokenBakiyesi(t);
        if (tokHam == null) { elde.textContent = ""; return; }
      }
      const adet = Number(tokHam) / 10 ** ondalik;
      if (adet > 0) import("../cuzdan-varlik.js").then((M) => M.hatirla({ z: t.zincir.k, a: t.adres, s: t.sembol, d: ondalik, g: t.resim })).catch(() => {});
      elde.replaceChildren("You hold ", el("b", { yazi: adet.toLocaleString("en-US", { maximumFractionDigits: adet >= 1 ? 2 : 6 }) + " " + t.sembol }),
        Number(t.fiyat) > 0 ? " ≈ $" + (adet * Number(t.fiyat)).toFixed(2) : "", " on " + t.zincir.ad);
      if (taraf === "al") alBakiye.textContent = "Balance " + adet.toLocaleString("en-US", { maximumFractionDigits: adet >= 1 ? 2 : 6 }) + " · " + t.zincir.ad;
      if (taraf === "sat") bakiyeYaz.textContent = "Balance " + adet.toLocaleString("en-US", { maximumFractionDigits: adet >= 1 ? 2 : 6 });
    };
    /* 16 Nov 2026 (owner: "kullanıcı hangi ağda olursa olsun sadece Buy basmalı"; decision: a device account): a visitor
       with no Solana address of their own gets one made on this phone the first time a Solana token is quoted, and the
       box just says where the tokens go, with a backup button. Their own address can still be typed instead. */
    const cihazHazirla = async () => {
      const m = _solM || (_solM = await import("../solana-ikiz.js"));
      /* first choice (16 Nov 2026, owner: nothing may be lost): the account linked to the EVM wallet by one free signature;
         the device-only account is the fallback when the wallet does not answer that signature */
      let a = null;
      if (cuzdan.hesap()) {
        durum.textContent = "One free signature in your wallet opens your Solana account (moves nothing; the same wallet always opens the same account)…";
        try { a = (await Promise.race([m.bagliHesap(cuzdan.hesap(), (x) => cuzdan.imzala(x)), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 45000))])).adres; durum.textContent = ""; }
        catch (e) { durum.textContent = ""; a = null; }
      }
      if (a) { try { localStorage.setItem(SOL_ANAHTAR, a); localStorage.setItem("arcpulse-sol-adres-cihaz", "1"); localStorage.setItem("arcpulse-sol-tur", "bagli"); } catch (e) { /* blocked */ } return a; }
      a = await m.cihazAdresi(); try { localStorage.setItem(SOL_ANAHTAR, a); localStorage.setItem("arcpulse-sol-adres-cihaz", "1"); localStorage.setItem("arcpulse-sol-tur", "cihaz"); } catch (e) { /* blocked */ }
      return a;
    };
    /* SOL for Solana's network fee, $0.50, paid from an EVM asset (USDC or that chain's gas token) */
    const yarimDolarHam = async (v) => { if (v.dolar) return V.dolarHam(v.ag, 0.5); const p = vf[v.k] || await TV.fiyat(v); if (!p) throw new Error("no price for " + v.sembol); return TV.hamYap((0.5 / p).toFixed(v.ondalik), v.ondalik); };
    const solUcretiGonder = async (v, sa) => {
      const g = await fetch(V.RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: cuzdan.hesap(), recipient: sa, originChainId: v.ag.id, destinationChainId: 792703809, originCurrency: v.adres, destinationCurrency: TV.SOL_YEREL, amount: (await yarimDolarHam(v)).toString(), tradeType: "EXACT_INPUT", refundTo: cuzdan.hesap() }) }).then((r) => r.json());
      if (!g.steps || !g.steps.length) throw new Error("The SOL route is unavailable right now (" + (g.message || "no route") + "). Try again in a minute.");
      for (const a2 of g.steps) for (const i2 of a2.items || []) { if (a2.kind !== "transaction") continue; const h2 = await cuzdan.agdaGonder(v.ag, { to: i2.data.to, data: i2.data.data, value: "0x" + BigInt(i2.data.value || 0).toString(16) }); await V.makbuz(v.ag, h2); }
    };
    const enIyiDolar = () => { const ag0 = V.evmler().filter((x) => bakiye[x.anahtar] >= 0.6).sort((x, y) => bakiye[y.anahtar] - bakiye[x.anahtar])[0]; return ag0 ? vBul(ag0.anahtar + ":dolar") : null; };
    const solBakiyeBekle = async (sa, en, yaz) => {
      for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 3000)); if (yaz) durum.textContent = yaz + " (" + ((i + 1) * 3) + "s)"; const b2 = await fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [sa] }) }).then((r) => r.json()).catch(() => null); if (b2 && b2.result && b2.result.value >= en) return true; }
      return false;
    };
    const solBakiye = (a) => fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [a] }) }).then((r) => r.json()).then((j) => (j.result && j.result.value) || 0);
    const solSatir = () => {
      if (!sol && !(taraf === "sat" && alinan && alinan.ag === SOL_AG)) return "";
      if (!solAdres() || cihazMi()) {
        const yedekDug = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Back up", on: { click: async () => {
          const m = _solM || (_solM = await import("../solana-ikiz.js"));
          if (!confirm("Your Solana account's secret key will show on screen. Write it down or import it into Phantom / Solflare. Anyone who sees it can take the tokens. Show it?")) return;
          const k = await m.cihazYedek(); prompt("Your Solana account's secret key (copy it, keep it private):", k); } } });
        const kendi = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Use my own Solana address", on: { click: () => {
          try { localStorage.removeItem("arcpulse-sol-adres-cihaz"); localStorage.removeItem(SOL_ANAHTAR); } catch (e) { /* blocked */ } kutuCiz(taraf); } } });
        let bagli = false; try { bagli = localStorage.getItem("arcpulse-sol-tur") === "bagli" && !!solAdres(); } catch (e) { /* blocked */ }
        const ne = sol ? t.sembol : alinan.sembol;
        if (bagli || (!solAdres() && cuzdan.hesap())) return el("div", { sinif: "bx-elde" }, ["Your ", ne, " goes to your ARC PULSE Solana account linked to your wallet", solAdres() ? " (" + solAdres().slice(0, 4) + "…" + solAdres().slice(-4) + ")" : "", ". The same wallet opens it on any phone: nothing to back up. ", el("div", { attr: { style: "margin-top:6px" } }, [kendi])]);
        /* an older device-only account: one tap links it to the wallet (moves its tokens; then nothing depends on this phone) */
        const bagla = cuzdan.hesap() && solAdres() ? el("button", { sinif: "dugme dugme--marka dugme--kucuk", attr: { type: "button" }, yazi: "Link to my wallet (nothing to back up)", on: { click: async () => {
          bagla.disabled = true;
          try {
            const m = _solM || (_solM = await import("../solana-ikiz.js"));
            durum.textContent = "One free signature in your wallet opens your wallet-linked Solana account…";
            const hedef = (await m.bagliHesap(cuzdan.hesap(), (x) => cuzdan.imzala(x))).adres;
            const kaynakAdr = solAdres();
            if ((await solBakiye(kaynakAdr)) < 1000000) {
              /* 17 Nov 2026: the balances may not be read yet when the box was opened from the page card: read them first */
              let v0 = enIyiDolar(); if (!v0) { durum.textContent = "Reading your balances…"; await dolarBakiyeleri(); v0 = enIyiDolar(); }
              if (!v0) throw new Error("Moving needs about $0.50 of SOL for Solana's fee, and no chain in your wallet has $0.60 of USDC.");
              durum.textContent = "$0.50 of SOL for Solana's fee (once). Confirm in your wallet…";
              await solUcretiGonder(v0, kaynakAdr);
              await solBakiyeBekle(kaynakAdr, 1000000, "Waiting for the SOL on Solana…");
              if ((await solBakiye(kaynakAdr).catch(() => 0)) < 1000000) throw new Error("The SOL for the fee has not arrived yet. Wait a minute and tap Link again (no second signature needed).");
            }
            const M = await import("../cuzdan-varlik.js");
            const mintler = [...new Set([...(sol ? [t.adres] : []), ...M.hatirlanan().filter((x) => x.z === "solana").map((x) => x.a)])];
            await m.cihazdanBagliyaTasi(hedef, mintler, (x) => { durum.textContent = x; });
            try { localStorage.setItem(SOL_ANAHTAR, hedef); localStorage.setItem("arcpulse-sol-tur", "bagli"); localStorage.setItem("arcpulse-sol-tasindi", "1"); } catch (e) { /* blocked */ }
            durum.textContent = "Done ✓ your Solana tokens are in the account linked to your wallet (" + hedef.slice(0, 4) + "…" + hedef.slice(-4) + ").";
            kutuCiz(taraf);
          } catch (e) { durum.textContent = "Not linked yet: " + ((e && (e.shortMessage || e.message)) || "unknown error") + " — your tokens are still safe in the old account."; durum.scrollIntoView({ block: "center" }); bagla.disabled = false; }
        } } }) : "";
        /* 17 Nov 2026 (owner: "dışarıdan gelen kullanıcı o linki bilmez, otomatik yapmalı"): the move starts by itself the
           first time the trade box is on screen — the visitor only answers the wallet's prompts. Once per page load. */
        if (bagla && !window.__arcpulseOtoTasi) setTimeout(() => {
          if (!window.__arcpulseOtoTasi && bagla.isConnected && bagla.offsetParent && !bagla.disabled) { window.__arcpulseOtoTasi = true; bagla.click(); }
        }, 600);
        return el("div", { sinif: "bx-elde" }, ["Your ", ne, " goes to your ARC PULSE Solana account on this phone", solAdres() ? " (" + solAdres().slice(0, 4) + "…" + solAdres().slice(-4) + ")" : "", ". Back it up once: without a backup, clearing this browser loses it. ", el("div", { attr: { style: "display:flex;gap:6px;margin-top:6px;flex-wrap:wrap" } }, [bagla, yedekDug, kendi])]);
      }
      const giris = el("input", { attr: { placeholder: "Your Solana address (where tokens go)", autocomplete: "off", spellcheck: "false", "aria-label": "Your Solana address" } });
      giris.value = solAdres() || "";
      giris.addEventListener("input", () => { const a = giris.value.trim(); if (solGecerli(a)) { try { localStorage.setItem(SOL_ANAHTAR, a); } catch (e) { /* blocked */ } eldeYaz(); yeniden(); } });
      const bag = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Connect Solana wallet", on: { click: async () => {
        try { const m = _solM || (_solM = await import("../solana-ikiz.js")); const a = await m.solanaCuzdan.baglan(); giris.value = a; try { localStorage.setItem(SOL_ANAHTAR, a); } catch (e) { /* blocked */ } eldeYaz(); yeniden(); }
        catch (e) { durum.textContent = (e && e.message) || "No Solana wallet found."; } } } });
      /* a phone wallet paired before Solana was asked for: one reconnect brings its Solana account in */
      const yb = cuzdan.wcMi && cuzdan.wcMi() && !cuzdan.wcSolanaAdresi() && !solAdres() ? el("button", { sinif: "dugme dugme--marka dugme--kucuk", attr: { type: "button" }, yazi: "Use my wallet's Solana account (reconnect once)", on: { click: async () => {
        try { await cuzdan.wcYenidenBagla(); if (cuzdan.wcSolanaAdresi()) { kutuCiz(taraf); } else { yb.replaceWith(el("div", { sinif: "bx-elde", yazi: "Your wallet did not share its Solana account over this link. In MetaMask: tap the account name → pick your Solana account → copy the address, then paste it in the box above (once; this phone remembers it)." })); } } catch (e) { durum.textContent = (e && e.message) || "Could not reconnect."; } } } }) : "";
      return el("div", { sinif: "bx-sol" }, [el("label", { sinif: "bx-et", yazi: "Solana address (kept on this device only)" }), giris, yb, bag]);
    };

    /* ---- the swap card ---- */
    const usdYaz = el("span"), bakiyeYaz = el("span"), alBakiye = el("span"), cikti = el("div", { sinif: "tk-cikti", yazi: "0" }), ciktiUsd = el("span");
    const odemeCip = el("button", { sinif: "tk-cip", attr: { type: "button", "aria-label": "Choose what you pay with" } });
    const alinanCip = el("button", { sinif: "tk-cip", attr: { type: "button", "aria-label": "Choose what you receive" } });
    const tokenCip = el("span", { sinif: "tk-cip tk-cip--sabit" }, [logo(t), el("span", { yazi: t.sembol })]);
    const cipIcerik = (v) => [TV.ikon(v, 28), el("span", { sinif: "tk-cip-ad" }, [el("b", { yazi: v.sembol }), el("small", { yazi: v.ag.ad })])];
    const odemeCiz = () => {
      odemeCip.replaceChildren(...cipIcerik(odeme));
      const b = vb[odeme.k];
      const p = vf[odeme.k];
      bakiyeYaz.textContent = b == null ? (cuzdan.hesap() ? "Reading balance…" : "") : "Balance " + TV.sayiYaz(b, odeme.ondalik) + (p != null && b > 0n ? " ($" + (Number(b) / 10 ** odeme.ondalik * p).toFixed(2) + ")" : "");
    };
    /* 17 Nov 2026 (owner: "bakiyeleri de göstersin"): the receive side shows what you already hold of it too */
    const alinanCiz = () => { alinanCip.replaceChildren(...cipIcerik(alinan)); const b = vb[alinan.k]; alBakiye.textContent = b == null ? (alinan.ag === SOL_AG ? "to your Solana account" : "to your wallet") : "Balance " + TV.sayiYaz(b, alinan.ondalik) + " · " + alinan.ag.ad; };
    const usdGuncelle = () => {
      if (taraf === "al") { const p = vf[odeme.k]; const n = Number(girdi.value); usdYaz.textContent = p != null && n > 0 ? "≈ $" + (n * p).toFixed(2) : ""; }
      else { const n = Number(girdi.value), p = Number(t.fiyat); usdYaz.textContent = p > 0 && n > 0 ? "≈ $" + (n * p).toFixed(2) : ""; }
    };
    /* balances + prices of every asset, for the picker and the chip */
    const varlikOku = async () => {
      const e = cuzdan.hesap(), s = solAdres();
      await Promise.all(VL.map(async (v) => { const [b, p] = await Promise.all([TV.bakiye(v, e, s), TV.fiyat(v)]); if (b != null) vb[v.k] = b; if (p != null) vf[v.k] = p; }));
      if (secAcik) secAcik.yenile();
      odemeCiz(); if (taraf === "sat") alinanCiz(); usdGuncelle();
    };
    let secAcik = null;
    odemeCip.addEventListener("click", () => {
      secAcik = TV.secici({ baslik: "Pay with", liste: VL, bakiyeler: vb, fiyatlar: vf, secili: odeme, sec: async (v) => {
        /* keep the same dollar value when the asset changes: 10 USDC must not become 10 ETH */
        const eskiUsd = Number(girdi.value) * (vf[odeme.k] || (odeme.dolar ? 1 : 0));
        odeme = v; TV.secimKaydet("ode", v.k); odemeCiz(); secAcik = null;
        const p = vf[v.k] || await TV.fiyat(v); if (p) vf[v.k] = p;
        if (eskiUsd > 0 && p) girdi.value = String(Number((eskiUsd / p).toPrecision(v.dolar ? 6 : 4)));
        usdGuncelle(); yeniden();
      } });
    });
    alinanCip.addEventListener("click", () => {
      secAcik = TV.secici({ baslik: "Receive", liste: VL, bakiyeler: vb, fiyatlar: vf, secili: alinan, sec: (v) => { alinan = v; TV.secimKaydet("al", v.k); secAcik = null; kutuCiz("sat"); } });
    });

    const teklifSatir = (a, b) => [el("span", { yazi: a }), el("b", { yazi: b })];
    async function teklif() {
      const bu = ++sayac; son = null;
      const kim = cuzdan.hesap() || V.UCRET_ALICI;
      let govde, girisUsd = null;
      if (taraf === "al") {
        const v = odeme, ham = TV.hamYap(girdi.value, v.ondalik);
        if (!(ham > 0n)) { teklifK.replaceChildren(...teklifSatir("Enter an amount", "")); cikti.textContent = "0"; ciktiUsd.textContent = ""; return; }
        const p = vf[v.k] != null ? vf[v.k] : await TV.fiyat(v); if (p != null) vf[v.k] = p;
        girisUsd = p != null ? Number(ham) / 10 ** v.ondalik * p : null;
        if (girisUsd != null && girisUsd < 1) { teklifK.replaceChildren(...teklifSatir("At least $1", "")); return; }
        let alici = sol ? solAdres() : kim;
        if (sol && !alici) { try { alici = await cihazHazirla(); eldeYaz(); } catch (e) { teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "This browser cannot make a Solana account (" + ((e && e.message) || e) + "). Type a Solana address above." })); return; } }
        const odeyen = v.ag === SOL_AG ? solAdres() : kim;
        if (v.ag === SOL_AG && !odeyen) { teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "Connect your Solana wallet above to pay from Solana." })); return; }
        govde = { user: odeyen, recipient: alici, originChainId: v.ag.id, destinationChainId: t.zincir.relay, originCurrency: v.adres, destinationCurrency: t.adres, amount: ham.toString(), tradeType: "EXACT_INPUT", refundTo: odeyen, appFees: [{ recipient: V.UCRET_ALICI, fee: V.UCRET_BPS }] };
      } else {
        if (!tokenAg && !sol) { teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "Selling " + t.zincir.ad + " tokens from here is not available yet." })); return; }
        const adet = Number(girdi.value);
        if (!(adet > 0)) { teklifK.replaceChildren(...teklifSatir("Enter how many to sell", "")); cikti.textContent = "0"; ciktiUsd.textContent = ""; return; }
        if (Number(t.fiyat) > 0) girisUsd = adet * Number(t.fiyat);
        const ham = TV.hamYap(girdi.value, ondalik);
        let alici = alinan.ag === SOL_AG ? solAdres() : kim;
        if (alinan.ag === SOL_AG && !alici) { try { alici = await cihazHazirla(); } catch (e) { teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "Add a Solana address to receive on Solana." })); return; } }
        const kaynakAdr = sol ? solAdres() : kim;
        if (sol && !kaynakAdr) { teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "Connect your Solana wallet above to sell." })); return; }
        govde = { user: kaynakAdr, recipient: alici, originChainId: sol ? 792703809 : t.zincir.relay, destinationChainId: alinan.ag.id, originCurrency: t.adres, destinationCurrency: alinan.adres, amount: ham.toString(), tradeType: "EXACT_INPUT", refundTo: kaynakAdr, appFees: [{ recipient: V.UCRET_ALICI, fee: V.UCRET_BPS }] };
      }
      teklifK.replaceChildren(...teklifSatir("Finding the best route…", ""));
      try {
        const q = await fetch(V.RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
        if (bu !== sayac) return;
        if (!q.details) {
          let neden = q.message || "no route";
          if (taraf === "al" && vb[odeme.k] != null && vb[odeme.k] < TV.hamYap(girdi.value, odeme.ondalik)) neden = "you have " + TV.sayiYaz(vb[odeme.k], odeme.ondalik) + " " + odeme.sembol + " on " + odeme.ag.ad + ".";
          teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "No route right now: " + neden })); cikti.textContent = "—"; return;
        }
        son = q; const d = q.details, f = q.fees || {};
        const outN = Number(d.currencyOut.amountFormatted);
        /* the value out: by the POOL's price for the market token, by $1 / relay's price for USDC and gas tokens */
        let cikisUsd;
        if (taraf === "al") cikisUsd = Number(t.fiyat) > 0 ? outN * Number(t.fiyat) : Number(d.currencyOut.amountUsd);
        else { const p = vf[alinan.k] != null ? vf[alinan.k] : await TV.fiyat(alinan); cikisUsd = p != null ? outN * p : Number(d.currencyOut.amountUsd); }
        if (girisUsd == null) girisUsd = Number(d.currencyIn.amountUsd);
        const kayip = girisUsd > 0 ? 1 - cikisUsd / girisUsd : null;
        cikti.textContent = outN.toLocaleString("en-US", { maximumFractionDigits: outN >= 1000 ? 0 : outN >= 1 ? 4 : 8 });
        ciktiUsd.textContent = cikisUsd > 0 ? "≈ $" + cikisUsd.toFixed(2) : "";
        const yetersiz = taraf === "al" && vb[odeme.k] != null && vb[odeme.k] < TV.hamYap(girdi.value, odeme.ondalik);
        teklifK.replaceChildren(
          ...teklifSatir("You pay", Number(d.currencyIn.amountFormatted).toLocaleString("en-US", { maximumFractionDigits: 6 }) + " " + d.currencyIn.currency.symbol + " on " + (taraf === "al" ? odeme.ag.ad : t.zincir.ad)),
          ...teklifSatir("You get", "≈ " + cikti.textContent + " " + d.currencyOut.currency.symbol + " on " + (taraf === "al" ? t.zincir.ad : alinan.ag.ad)),
          ...teklifSatir("Route", V.rotaYazi(q, t)),
          ...teklifSatir("Route + gas", "$" + (Number((f.relayer && f.relayer.amountUsd) || 0) + Number((f.gas && f.gas.amountUsd) || 0)).toFixed(3)),
          ...teklifSatir("ARC PULSE fee (0.5%)", "$" + (girisUsd * 0.005).toFixed(3)),
          ...(kayip != null ? teklifSatir("Total cost (price impact + fees)", (kayip * 100).toFixed(1) + "%") : []),
          kayip != null && kayip > 0.05 ? el("span", { sinif: "uyari", yazi: "High cost for this size: " + (kayip * 100).toFixed(1) + "%. A bridge to " + (taraf === "al" ? t.zincir.ad : alinan.ag.ad) + " has a fixed fee — a larger amount, or paying on the same chain, costs less." }) : el("span"),
          yetersiz ? el("span", { sinif: "uyari", yazi: "You have " + TV.sayiYaz(vb[odeme.k], odeme.ondalik) + " " + odeme.sembol + " on " + odeme.ag.ad + ": not enough." }) : el("span"));
      } catch (e) { if (bu === sayac) teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "Route service unavailable, try again." })); }
    }
    let gec = null; const yeniden = () => { clearTimeout(gec); gec = setTimeout(teklif, 400); };

    const govde = [el("div", { sinif: "bx-tab", attr: { role: "tablist" } }, [tabAl, tabSat])];
    const cevir = el("button", { sinif: "tk-cevir", attr: { type: "button", "aria-label": taraf === "al" ? "Switch to sell" : "Switch to buy" }, yazi: "↓", on: { click: () => kutuCiz(taraf === "al" ? "sat" : "al") } });
    girdi = el("input", { attr: { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0", "aria-label": taraf === "al" ? "Amount to pay" : "Tokens to sell" } });
    girdi.addEventListener("input", () => { girdi.value = girdi.value.replace(",", ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"); usdGuncelle(); yeniden(); });
    const yuzdeCip = (p) => el("button", { attr: { type: "button" }, yazi: p === 100 ? "Max" : p + "%", on: { click: async () => {
      if (taraf === "al") {
        if (vb[odeme.k] == null) { durum.textContent = cuzdan.hesap() ? "Reading your balance…" : "Connect your wallet to use your balance."; await varlikOku(); durum.textContent = ""; if (vb[odeme.k] == null) return; }
        let x = (vb[odeme.k] * BigInt(p)) / 100n;
        const kalan = TV.hamYap(String(TV.yedek(odeme)), odeme.ondalik);   // gas the visitor still needs on that chain
        if (p === 100 && kalan > 0n) x = x > kalan ? x - kalan : 0n;
        girdi.value = TV.sayiYaz(x, odeme.ondalik, odeme.ondalik).replace(/,/g, "");
        if (p === 100 && kalan > 0n) durum.textContent = "Max keeps " + TV.yedek(odeme) + " " + odeme.sembol + " for the network fee.";
      } else {
        if (tokHam == null) return;
        const x = (tokHam * BigInt(p)) / 100n; girdi.value = String(Number(x / 10n ** BigInt(Math.max(0, ondalik - 6))) / 1e6);
      }
      usdGuncelle(); yeniden();
    } } });
    if (taraf === "al") {
      girdi.value = odeme.dolar ? "10" : "";
      alBakiye.textContent = "on " + t.zincir.ad;
      govde.push(solSatir(), elde,
        el("div", { sinif: "tk-kart" }, [el("div", { sinif: "tk-et", yazi: "You pay" }), el("div", { sinif: "tk-sat" }, [girdi, odemeCip]), el("div", { sinif: "tk-alt" }, [usdYaz, bakiyeYaz])]),
        cevir,
        el("div", { sinif: "tk-kart tk-kart--al" }, [el("div", { sinif: "tk-et", yazi: "You receive" }), el("div", { sinif: "tk-sat" }, [cikti, tokenCip]), el("div", { sinif: "tk-alt" }, [ciktiUsd, alBakiye])]),
        el("div", { sinif: "bx-cip" }, [25, 50, 75, 100].map(yuzdeCip)));
      odemeCiz();
    } else {
      govde.push(solSatir(), elde,
        el("div", { sinif: "tk-kart" }, [el("div", { sinif: "tk-et", yazi: "You sell" }), el("div", { sinif: "tk-sat" }, [girdi, tokenCip]), el("div", { sinif: "tk-alt" }, [usdYaz, bakiyeYaz])]),
        cevir,
        el("div", { sinif: "tk-kart tk-kart--al" }, [el("div", { sinif: "tk-et", yazi: "You receive" }), el("div", { sinif: "tk-sat" }, [cikti, alinanCip]), el("div", { sinif: "tk-alt" }, [ciktiUsd, alBakiye])]),
        el("div", { sinif: "bx-cip" }, [25, 50, 75, 100].map(yuzdeCip)));
      alinanCiz();
    }
    eldeYaz();
    varlikOku();
    ana.addEventListener("click", async () => {
      if (ana._m) return; ana._m = true; ana.disabled = true;
      try {
        const solYalniz = (sol && taraf === "sat" && alinan.ag === SOL_AG) || (taraf === "al" && odeme.ag === SOL_AG);
        if (!cuzdan.hesap() && !solYalniz) { await cuzdan.bagla(); await dolarBakiyeleri(); kutuCiz(taraf); return; }
        if ((sol && taraf === "sat") || (taraf === "al" && odeme.ag === SOL_AG)) {
          const m = _solM || (_solM = await import("../solana-ikiz.js"));
          if (!m.solanaCuzdan.hesap()) { durum.textContent = "Connect your Solana wallet…"; await m.solanaCuzdan.baglan(); }
          /* the device account pays its own Solana fee: when it has no SOL (the first buy's top-up was skipped), add $0.50
             of SOL from the EVM wallet first — one confirm, once */
          if (taraf === "sat" && cihazMi() && cuzdan.hesap()) {
            const sa = solAdres();
            if ((await solBakiye(sa).catch(() => null)) < 1000000) {
              const v0 = enIyiDolar();
              if (!v0) throw new Error("Your Solana account needs about $0.50 of SOL for the network fee, and no chain in your wallet has $0.60 of USDC to send it.");
              durum.textContent = "First: $0.50 of SOL to your Solana account for the network fee (once). Confirm in your wallet…";
              await solUcretiGonder(v0, sa);
              await solBakiyeBekle(sa, 1000000, "Waiting for the SOL on Solana…");
            }
          }
          await teklif();
          const q = son; if (!q) { durum.textContent = "No route to send."; return; }
          for (const adim of q.steps) for (const it of adim.items || []) {
            if (adim.kind !== "transaction") continue;
            durum.textContent = "Confirm in your Solana wallet…";
            await m.relayAdimi(it.data);
          }
          if (taraf === "al") import("../cuzdan-varlik.js").then((M) => M.hatirla({ z: t.zincir.k, a: t.adres, s: t.sembol, d: ondalik, g: t.resim })).catch(() => {});
          durum.textContent = taraf === "al" ? "Paid ✓ " + t.sembol + " arrives on " + t.zincir.ad + ", usually within a minute." : "Sold ✓ " + alinan.sembol + " arrives on " + alinan.ag.ad + (alinan.ag === SOL_AG ? " in your Solana account" : " at " + (cuzdan.hesap() || "").slice(0, 6) + "…") + ", usually within a minute.";
          setTimeout(() => { eldeYaz(); varlikOku(); }, 15000);
          return;
        }
        await teklif();
        const q = son; if (!q) { durum.textContent = "No route to send."; return; }
        const ag = taraf === "al" ? odeme.ag : tokenAg;
        for (const adim of q.steps) for (const it of adim.items || []) {
          if (adim.kind !== "transaction") continue;
          durum.textContent = (adim.id === "approve" ? "Approve " : "Confirm ") + "in your wallet…";
          const d = it.data;
          const h = await cuzdan.agdaGonder(ag, { to: d.to, data: d.data, value: "0x" + BigInt(d.value || 0).toString(16) });
          if ((await V.makbuz(ag, h)) !== 1) throw new Error("Reverted: " + h);
        }
        /* a Solana token bought into the device account: $0.50 of SOL for its future sell fees, paid with the same asset */
        if (sol && taraf === "al" && cihazMi() && odeme.ag !== SOL_AG) {
          try {
            const sa = solAdres();
            if ((await solBakiye(sa)) < 3000000) {   // under 0.003 SOL
              durum.textContent = "One more confirm: $0.50 of SOL to your Solana account, for its future sell fees (first time only)…";
              await solUcretiGonder(odeme, sa);
            }
          } catch (e) { /* the buy went through; the SOL for fees can be added later */ }
        }
        if (taraf === "al") import("../cuzdan-varlik.js").then((M) => M.hatirla({ z: t.zincir.k, a: t.adres, s: t.sembol, d: ondalik, g: t.resim })).catch(() => {});
        durum.textContent = taraf === "al" ? "Paid ✓ " + t.sembol + " arrives on " + t.zincir.ad + (sol ? " at " + solAdres().slice(0, 6) + "…" : "") + ", usually within a minute." : "Sold ✓ " + alinan.sembol + " arrives on " + alinan.ag.ad + ", usually within a minute.";
        setTimeout(() => { dolarBakiyeleri().then(() => {}); eldeYaz(); varlikOku(); }, 20000);
      } catch (e) { durum.textContent = (e && (e.shortMessage || e.message)) || "Could not send."; }
      finally { ana._m = false; ana.disabled = false; }
    });
    sag.replaceChildren(el("div", { sinif: "bx-kutu" }, [kapat, ...govde, teklifK, ana, durum,
      el("div", { sinif: "bx-not", yazi: "Pay or receive in USDC or any chain's gas token. Routed by relay.link through the DEXes holding the liquidity. Your wallet signs; ARC PULSE never holds your funds. 0.5% ARC PULSE fee." })]));
    kapat.style.display = window.matchMedia("(max-width: 860px)").matches ? "" : "none";
    teklif();
  }

  /* phone: sticky Buy / Sell open the box as a sheet on <body>; closing puts it back */
  const perde = el("div", { sinif: "bx-perde", attr: { hidden: true, role: "dialog", "aria-label": "Buy or sell" } });
  const yer = document.createComment("trade box");
  const sayfaAc = () => { if (!yer.parentNode) sag.replaceWith(yer); perde.append(sag); perde.hidden = false; };
  const sayfaKapat = () => { if (yer.parentNode) yer.replaceWith(sag); perde.hidden = true; };
  perde.addEventListener("click", (e) => { if (e.target === perde) sayfaKapat(); });
  const dAl = el("button", { attr: { type: "button", style: "background:var(--alis);color:#04150e" }, yazi: "Buy" });
  const dSat = el("button", { attr: { type: "button", style: "background:var(--satis);color:#2a0509" }, yazi: "Sell" });
  dAl.addEventListener("click", () => { kutuCiz("al"); sayfaAc(); });
  dSat.addEventListener("click", () => { kutuCiz("sat"); sayfaAc(); });
  bxDock.append(dAl, dSat);
  let deneme = 0;
  const tak = () => { if (kok.isConnected) { document.querySelectorAll(".bx-dock, .bx-perde").forEach((x) => x.remove()); document.body.append(perde, bxDock); const sok = () => setTimeout(() => { if (!kok.isConnected && !perde.contains(sag)) { bxDock.remove(); perde.remove(); window.removeEventListener("hashchange", sok); } else if (!kok.isConnected) { perde.remove(); bxDock.remove(); } }, 0); window.addEventListener("hashchange", sok); } else if (++deneme < 100) setTimeout(tak, 100); };
  tak();

  /* load */
  orta.append(el("div", { sinif: "bx-kart bx-bos", yazi: "Pick a market on the left." }));
  listeCiz();
  dolarBakiyeleri();
  /* 17 Nov 2026 (owner: a Hot tokens tap "throws me somewhere unrelated"): a token linked from Hot tokens opens AT ONCE from
     our own list (veri/pulse-liste.json: pool, price, liquidity), before the slow trending lists — those are many calls to
     the free data service, and when it was busy the token lookup failed and the phone fell back to the market list. */
  const yonSat = param && param.get("yon") === "sat", yonAl = param && param.get("yon") === "al";   // 17 Nov: Hot tokens' Buy
  const za = param && param.get("z"), aa = param && param.get("a");
  let hizli = null;
  if (za && aa) {
    try {
      const L = await fetch(new URL("../../veri/pulse-liste.json", import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000)).then((r) => (r.ok ? r.json() : null));
      const h = L && (L.tokenler || []).find((x) => x.z === za && x.a.toLowerCase() === aa.toLowerCase()), z = h && V.ZINCIRLER.find((x) => x.k === za);
      if (h && z && h.havuz) hizli = { zincir: z, adres: h.a, sembol: h.sembol, ad: h.ad || h.sembol, karar: h.karar, resim: h.resim, fiyat: h.fiyat, fdv: h.mcap, hacim: h.hacim, degisim: h.d24, islem: h.islem, likidite: h.likidite, havuz: h.havuz, dex: h.dex || "", kuruldu: h.kuruldu };
    } catch (e) { /* fall back to the lookup below */ }
    if (hizli) {
      /* select it once the page is on screen (the pool's swaps only load for an attached page) */
      { let n = 0; const b = () => { if (kok.isConnected) { sec(hizli); if (yonSat || yonAl) { kutuCiz(yonSat ? "sat" : "al"); if (window.matchMedia("(max-width: 860px)").matches) sayfaAc(); } } else if (++n < 100) setTimeout(b, 100); }; b(); }
      /* our list is up to an hour old: read the pool's live figures now (price, liquidity, 24 h change), so the chart
         header, the swap card's cost line and the Time Machines' plan all use today's price (17 Nov: BLOB showed a 16%
         "cost" that was only an hour-old price) */
      /* DexScreener (17 Nov): plenty of free calls, so this never competes with the chart's and Time Machine's */
      fetch("https://api.dexscreener.com/latest/dex/pairs/" + hizli.zincir.k + "/" + hizli.havuz).then((r) => r.json()).then((j) => {
        const p = j && (j.pairs || [])[0]; if (!p || !(Number(p.priceUsd) > 0)) return;
        const c = { fiyat: Number(p.priceUsd), likidite: Number(p.liquidity && p.liquidity.usd) || hizli.likidite, hacim: Number(p.volume && p.volume.h24) || hizli.hacim, degisim: p.priceChange ? Number(p.priceChange.h24) : hizli.degisim, fdv: Number(p.marketCap || p.fdv) || hizli.fdv, islem: p.txns && p.txns.h24 ? p.txns.h24.buys + p.txns.h24.sells : hizli.islem };
        Object.assign(hizli, c);
        if (secili === hizli) ortaCiz();
      }).catch(() => {});
      /* the page shows now; the market lists fill in behind it */
      (async () => {
        try { const d = await V.veri(null); piyasa = { trend: V.suz(d.trend.filter((t) => t.likidite >= V.ESIK)), yeni: V.suz(d.yeni.filter((t) => t.likidite >= V.ESIK_YENI)) }; } catch (e) { /* the token is open anyway */ }
        listeCiz();   // (17 Nov: the per-chain lists are not loaded here — they ate the free limit the Time Machine needs)
      })();
      return kok;
    }
  }
  try {
    const d = await V.veri(null);
    piyasa = { trend: V.suz(d.trend.filter((t) => t.likidite >= V.ESIK)), yeni: V.suz(d.yeni.filter((t) => t.likidite >= V.ESIK_YENI)) };
  } catch (e) { satirlar.replaceChildren(el("div", { sinif: "bx-bos", yazi: "The market data service is busy. Try again in a minute." })); }
  listeCiz();
  /* the big chains' own lists, one after another (the free data service allows ~30 calls a minute) */
  (async () => { for (const k of ["base", "solana", "bsc", "ethereum"]) { if (!kok.isConnected && zv.solana) break; await zincirYukle(k); await new Promise((x) => setTimeout(x, 4000)); } })();
  /* the market from the link (?z=&a=), or the last one picked on this device, or the top trending one (desktop) */
  let ilk = null;
  const tum = [...piyasa.trend, ...piyasa.yeni];
  if (za && aa) ilk = tum.find((t) => t.zincir.k === za && t.adres.toLowerCase() === aa.toLowerCase());
  /* 16 Nov 2026: a token linked from Feed (or anywhere) that is not in the lists: read its own pools */
  if (za && aa && !ilk) {
    const z = V.ZINCIRLER.find((x) => x.k === za);
    if (z) { const l = await V.gecko("/networks/" + z.gecko + "/tokens/" + aa + "/pools?include=base_token,network&page=1").catch(() => []); ilk = l.find((t) => t.adres.toLowerCase() === aa.toLowerCase()) || null; }
  }
  if (!ilk) { try { const s = JSON.parse(localStorage.getItem("arcpulse-borsa-son") || "null"); if (s) ilk = tum.find((t) => t.zincir.k === s.z && t.adres.toLowerCase() === s.a.toLowerCase()); } catch (e) { /* none */ } }
  const ekrandaSec = (t) => { let n = 0; const b = () => { if (kok.isConnected) { sec(t); if ((yonSat || yonAl) && t === ilk) { kutuCiz(yonSat ? "sat" : "al"); if (window.matchMedia("(max-width: 860px)").matches) sayfaAc(); } } else if (++n < 100) setTimeout(b, 100); }; b(); };
  if (ilk && (za || !window.matchMedia("(max-width: 860px)").matches)) ekrandaSec(ilk);
  else if (!window.matchMedia("(max-width: 860px)").matches && piyasa.trend[0]) ekrandaSec(piyasa.trend[0]);
  return kok;
}
