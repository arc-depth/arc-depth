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
      if (t.zincir.k === "solana" && localStorage.getItem("arcpulse-sol-adres-cihaz") === "1" && localStorage.getItem("arcpulse-sol-tur") !== "bagli" && localStorage.getItem("arcpulse-sol-cihaz")) {
        bagUyari = el("div", { sinif: "bx-kart", attr: { style: "padding:12px 14px;margin-bottom:10px;border-color:var(--marka,#7c5cff)" } }, [
          el("div", { attr: { style: "font-weight:600;margin-bottom:4px" }, yazi: "Your Solana tokens are on this phone only" }),
          el("div", { sinif: "k", attr: { style: "margin-bottom:8px" }, yazi: "Link them to your wallet once: then the same wallet opens them on any phone, nothing to back up." }),
          el("button", { sinif: "dugme dugme--marka dugme--kucuk", attr: { type: "button" }, yazi: "Link to my wallet", on: { click: () => { kutuCiz("sat"); if (window.matchMedia("(max-width: 860px)").matches) sayfaAc(); } } })]);
      }
    } catch (e) { /* storage blocked */ }
    orta.replaceChildren(
      geri, bagUyari,
      el("div", { sinif: "bx-kart" }, [
        el("div", { sinif: "bx-ust" }, [logo(t), el("div", { attr: { style: "min-width:0" } }, [el("h1", { yazi: t.sembol }), el("div", { sinif: "k", yazi: (t.ad && t.ad !== t.sembol ? t.ad + " · " : "") + t.zincir.ad + (t.dex ? " · " + t.dex : "") + " · " + t.adres.slice(0, 6) + "…" + t.adres.slice(-4) })]),
          el("div", { sinif: "bx-fiyat" }, [el("b", { yazi: fiyatYaz(Number(t.fiyat)) }), yuzde(t.degisim == null ? null : Number(t.degisim))])]),
        el("div", { sinif: "bx-olc" }, [["Market cap", kisa(Number(t.fdv))], ["Liquidity", kisa(Number(t.likidite))], ["24h volume", kisa(Number(t.hacim))], ["24h trades", t.islem ? String(t.islem) : "—"]].map(([a, b]) => el("div", {}, [el("span", { yazi: a }), el("b", { yazi: b })])))]),
      el("div", { sinif: "bx-kart bx-grafik" }, [el("iframe", { attr: { src: "https://www.geckoterminal.com/" + t.zincir.gecko + "/pools/" + t.havuz + "?embed=1&info=0&swaps=0&grayscale=0&light_chart=0", title: t.sembol + " chart", referrerpolicy: "no-referrer", loading: "lazy" } })]),
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
    yukle(); islemZaman = setInterval(yukle, 20000);
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
    let son = null, sayac = 0, girdi, kaynak = null, tokHam = null, ondalik = Number(t.karar || (t.zincir.k === "solana" ? 6 : 18));
    /* 16 Nov 2026 (owner: "cüzdan bakiyesini ve kaç token olduğunu yazmıyor"): what you hold of this token shows on both
       tabs; Solana tokens get a Solana address (connected Solana wallet, or typed and kept on this device), buy straight
       to it, and sell with a Solana wallet (Phantom, Solflare…) through relay.link. */
    const sol = t.zincir.k === "solana";
    const SOL_ANAHTAR = "arcpulse-sol-adres";
    const solGecerli = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(a || "").trim());
    const solAdres = () => { if (_solM && _solM.solanaCuzdan.hesap()) return _solM.solanaCuzdan.hesap(); try { const a = localStorage.getItem(SOL_ANAHTAR); return solGecerli(a) ? a : null; } catch (e) { return null; } };
    const elde = el("div", { sinif: "bx-elde", yazi: "" });
    /* 16 Nov 2026 (owner: "solanada usdc var"): Solana tokens trade against USDC on Solana too — pay from it, and
       receive the sale in it (same wallet, no bridge). Signed by the Solana wallet. */
    const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const SOL_AG = { anahtar: "solana", ad: "Solana", id: 792703809, dolar: SOL_USDC, dolarSembol: "USDC" };
    const kaynakAg = () => (kaynak && kaynak.value === "solana" ? SOL_AG : V.evmler().find((a) => a.anahtar === (kaynak ? kaynak.value : "arc")));
    let alim = null;   // the sell's receive-to select (Solana tokens)
    const eldeYaz = async () => {
      if (sol) {
        const a = solAdres();
        if (!a) { elde.textContent = "Add your Solana address to see what you hold."; tokHam = null; return; }
        elde.textContent = "Reading your " + t.sembol + " on Solana…";
        try {
          const m = _solM || (_solM = await import("../solana-ikiz.js"));
          const [h, u] = await Promise.all([m.splBakiye(a, t.adres), m.splBakiye(a, SOL_USDC).catch(() => null)]);
          tokHam = h;
          if (u != null) { bakiye.solana = Number(u) / 1e6; if (kaynak) { const o = [...kaynak.options].find((x) => x.value === "solana"); if (o) o.textContent = "Solana · USDC · $" + bakiye.solana.toFixed(2); if (bakiye.solana >= 1 && !(bakiye[kaynak.value] >= 1)) { kaynak.value = "solana"; yeniden(); } } }
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
    const cihazMi = () => { try { return localStorage.getItem("arcpulse-sol-adres-cihaz") === "1"; } catch (e) { return false; } };
    const solSatir = () => {
      if (!sol) return "";
      if (!solAdres() || cihazMi()) {
        const yedekDug = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Back up", on: { click: async () => {
          const m = _solM || (_solM = await import("../solana-ikiz.js"));
          if (!confirm("Your Solana account's secret key will show on screen. Write it down or import it into Phantom / Solflare. Anyone who sees it can take the tokens. Show it?")) return;
          const k = await m.cihazYedek(); prompt("Your Solana account's secret key (copy it, keep it private):", k); } } });
        const kendi = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Use my own Solana address", on: { click: () => {
          try { localStorage.removeItem("arcpulse-sol-adres-cihaz"); localStorage.removeItem(SOL_ANAHTAR); } catch (e) { /* blocked */ } kutuCiz(taraf); } } });
        let bagli = false; try { bagli = localStorage.getItem("arcpulse-sol-tur") === "bagli" && !!solAdres(); } catch (e) { /* blocked */ }
        if (bagli || (!solAdres() && cuzdan.hesap())) return el("div", { sinif: "bx-elde" }, ["Your ", t.sembol, " goes to your ARC PULSE Solana account linked to your wallet", solAdres() ? " (" + solAdres().slice(0, 4) + "…" + solAdres().slice(-4) + ")" : "", ". The same wallet opens it on any phone: nothing to back up. ", el("div", { attr: { style: "margin-top:6px" } }, [kendi])]);
        /* an older device-only account: one tap links it to the wallet (moves its tokens; then nothing depends on this phone) */
        const bagla = cuzdan.hesap() && solAdres() ? el("button", { sinif: "dugme dugme--marka dugme--kucuk", attr: { type: "button" }, yazi: "Link to my wallet (nothing to back up)", on: { click: async () => {
          bagla.disabled = true;
          try {
            const m = _solM || (_solM = await import("../solana-ikiz.js"));
            durum.textContent = "One free signature in your wallet opens your wallet-linked Solana account…";
            const hedef = (await m.bagliHesap(cuzdan.hesap(), (x) => cuzdan.imzala(x))).adres;
            const kaynakAdr = solAdres();
            const bk = await fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [kaynakAdr] }) }).then((r) => r.json());
            if (((bk.result && bk.result.value) || 0) < 1000000) {
              const ag0 = V.evmler().filter((x) => bakiye[x.anahtar] >= 0.6).sort((x, y) => bakiye[y.anahtar] - bakiye[x.anahtar])[0];
              if (!ag0) throw new Error("Moving needs about $0.50 of SOL for Solana's fee, and no chain in your wallet has $0.60 of USDC.");
              durum.textContent = "$0.50 of SOL for Solana's fee (once). Confirm in your wallet…";
              const g = await fetch(V.RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: cuzdan.hesap(), recipient: kaynakAdr, originChainId: ag0.id, destinationChainId: 792703809, originCurrency: ag0.dolar, destinationCurrency: "11111111111111111111111111111111", amount: V.dolarHam(ag0, 0.5).toString(), tradeType: "EXACT_INPUT", refundTo: cuzdan.hesap() }) }).then((r) => r.json());
              for (const a2 of g.steps || []) for (const i2 of a2.items || []) { if (a2.kind !== "transaction") continue; const h2 = await cuzdan.agdaGonder(ag0, { to: i2.data.to, data: i2.data.data, value: "0x" + BigInt(i2.data.value || 0).toString(16) }); await V.makbuz(ag0, h2); }
              for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 3000)); durum.textContent = "Waiting for the SOL on Solana… (" + ((i + 1) * 3) + "s)"; const b2 = await fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [kaynakAdr] }) }).then((r) => r.json()).catch(() => null); if (b2 && b2.result && b2.result.value >= 1000000) break; }
            }
            const M = await import("../cuzdan-varlik.js");
            const mintler = [...new Set([t.adres, ...M.hatirlanan().filter((x) => x.z === "solana").map((x) => x.a)])];
            await m.cihazdanBagliyaTasi(hedef, mintler, (x) => { durum.textContent = x; });
            try { localStorage.setItem(SOL_ANAHTAR, hedef); localStorage.setItem("arcpulse-sol-tur", "bagli"); } catch (e) { /* blocked */ }
            durum.textContent = "Done ✓ your Solana tokens are in the account linked to your wallet (" + hedef.slice(0, 4) + "…" + hedef.slice(-4) + ").";
            kutuCiz(taraf);
          } catch (e) { durum.textContent = (e && (e.shortMessage || e.message)) || "Could not link."; bagla.disabled = false; }
        } } }) : "";
        return el("div", { sinif: "bx-elde" }, ["Your ", t.sembol, " goes to your ARC PULSE Solana account on this phone", solAdres() ? " (" + solAdres().slice(0, 4) + "…" + solAdres().slice(-4) + ")" : "", ". Back it up once: without a backup, clearing this browser loses it. ", el("div", { attr: { style: "display:flex;gap:6px;margin-top:6px;flex-wrap:wrap" } }, [bagla, yedekDug, kendi])]);
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

    const teklifSatir = (a, b) => [el("span", { yazi: a }), el("b", { yazi: b })];
    async function teklif() {
      const bu = ++sayac; son = null;
      const kim = cuzdan.hesap() || V.UCRET_ALICI;
      let govde;
      if (taraf === "al") {
        const usd = Number(girdi.value), ag = kaynakAg();
        if (!(usd >= 1)) { teklifK.replaceChildren(...teklifSatir("At least $1", "")); return; }
        let alici = sol ? solAdres() : kim;
        if (sol && !alici) { try { alici = await cihazHazirla(); eldeYaz(); } catch (e) { teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "This browser cannot make a Solana account (" + ((e && e.message) || e) + "). Type a Solana address above." })); return; } }
        const odeyen = ag === SOL_AG ? solAdres() : kim;
        if (ag === SOL_AG && !odeyen) { teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "Connect your Solana wallet above to pay from Solana." })); return; }
        govde = { user: odeyen, recipient: alici, originChainId: ag.id, destinationChainId: t.zincir.relay, originCurrency: ag.dolar, destinationCurrency: t.adres, amount: (ag === SOL_AG ? BigInt(Math.round(usd * 1e6)) : V.dolarHam(ag, usd)).toString(), tradeType: "EXACT_INPUT", refundTo: odeyen, appFees: [{ recipient: V.UCRET_ALICI, fee: V.UCRET_BPS }] };
      } else {
        if (!tokenAg && !sol) { teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "Selling " + t.zincir.ad + " tokens from here is not available yet." })); return; }
        const adet = Number(girdi.value);
        if (!(adet > 0)) { teklifK.replaceChildren(...teklifSatir("Enter how many to sell", "")); return; }
        if (sol) {
          const sa = solAdres();
          if (!sa) { teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "Connect your Solana wallet above to sell." })); return; }
          const hamS = BigInt(Math.floor(adet * 10 ** Math.min(ondalik, 6))) * 10n ** BigInt(Math.max(0, ondalik - 6));
          const solaGel = !alim || alim.value === "solana";
          govde = { user: sa, recipient: solaGel ? sa : (cuzdan.hesap() || V.UCRET_ALICI), originChainId: 792703809, destinationChainId: solaGel ? 792703809 : 5042, originCurrency: t.adres, destinationCurrency: solaGel ? SOL_USDC : "0x3600000000000000000000000000000000000000", amount: hamS.toString(), tradeType: "EXACT_INPUT", refundTo: sa, appFees: [{ recipient: V.UCRET_ALICI, fee: V.UCRET_BPS }] };
        } else {
        const ham = BigInt(Math.floor(adet * 1e6)) * 10n ** BigInt(Math.max(0, ondalik - 6));
        govde = { user: kim, recipient: kim, originChainId: t.zincir.relay, destinationChainId: 5042, originCurrency: t.adres, destinationCurrency: "0x3600000000000000000000000000000000000000", amount: ham.toString(), tradeType: "EXACT_INPUT", refundTo: kim, appFees: [{ recipient: V.UCRET_ALICI, fee: V.UCRET_BPS }] };
        }
      }
      teklifK.replaceChildren(...teklifSatir("Finding the best route…", ""));
      try {
        const q = await fetch(V.RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
        if (bu !== sayac) return;
        if (!q.details) {
          let neden = q.message || "no route";
          if (taraf === "al") { const ag = kaynakAg(), var_ = bakiye[ag.anahtar]; if (var_ != null && var_ < Number(girdi.value)) neden = "You have $" + var_.toFixed(2) + " on " + ag.ad + "."; }
          teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "No route right now: " + neden })); return;
        }
        son = q; const d = q.details, f = q.fees || {};
        const ag = taraf === "al" ? kaynakAg() : (tokenAg || SOL_AG);
        teklifK.replaceChildren(
          ...teklifSatir("You pay", Number(d.currencyIn.amountFormatted).toLocaleString("en-US", { maximumFractionDigits: 4 }) + " " + d.currencyIn.currency.symbol + " on " + ag.ad),
          ...teklifSatir("You get", "≈ " + Number(d.currencyOut.amountFormatted).toLocaleString("en-US", { maximumFractionDigits: 4 }) + " " + d.currencyOut.currency.symbol + (taraf === "al" ? " on " + t.zincir.ad : sol && (!alim || alim.value === "solana") ? " on Solana" : " on Arc")),
          ...teklifSatir("Worth", "$" + Number(d.currencyOut.amountUsd).toFixed(2)),
          ...teklifSatir("Route", V.rotaYazi(q, t)),
          ...teklifSatir("Route + gas", "$" + (Number((f.relayer && f.relayer.amountUsd) || 0) + Number((f.gas && f.gas.amountUsd) || 0)).toFixed(3)),
          ...teklifSatir("ARC PULSE fee (0.5%)", "$" + Number((f.app && f.app.amountUsd) || 0).toFixed(3)),
          taraf === "al" && bakiye[ag.anahtar] != null && bakiye[ag.anahtar] < Number(girdi.value) ? el("span", { sinif: "uyari", yazi: "You have $" + bakiye[ag.anahtar].toFixed(2) + " on " + ag.ad + ": not enough." }) : el("span"));
      } catch (e) { if (bu === sayac) teklifK.replaceChildren(el("span", { sinif: "uyari", yazi: "Route service unavailable, try again." })); }
    }
    let gec = null; const yeniden = () => { clearTimeout(gec); gec = setTimeout(teklif, 400); };

    const govde = [el("div", { sinif: "bx-tab", attr: { role: "tablist" } }, [tabAl, tabSat])];
    if (taraf === "al") {
      kaynak = el("select", { attr: { "aria-label": "Pay from" } }, [...(sol ? [SOL_AG] : []), ...V.evmler()].map((a) => el("option", { attr: { value: a.anahtar }, yazi: a.ad + " · " + (a.dolarSembol || "USDC") + (bakiye[a.anahtar] != null ? " · $" + bakiye[a.anahtar].toFixed(2) : "") })));
      const enIyi = Object.entries(bakiye).sort((x, y) => y[1] - x[1])[0];
      kaynak.value = enIyi && enIyi[1] >= 1 ? enIyi[0] : "arc";
      /* 16 Nov 2026 (owner: "işlem açmak için ağ değiştirmesin"): pay from the network the wallet is already on when it
         holds enough there ($10, the default amount) — then no network switch is asked at all */
      { const simdiki = cuzdan.zincirId() ? V.evmler().find((a) => a.id === parseInt(cuzdan.zincirId(), 16)) : null;
        if (simdiki && bakiye[simdiki.anahtar] >= 10) kaynak.value = simdiki.anahtar; }
      girdi = el("input", { attr: { type: "number", inputmode: "decimal", min: "1", step: "1", value: "10", "aria-label": "Amount in USD" } });
      govde.push(solSatir(), elde, el("label", { sinif: "bx-et", yazi: "Pay from (your balance)" }), kaynak, el("label", { sinif: "bx-et", yazi: "Amount (USD)" }), girdi,
        el("div", { sinif: "bx-cip" }, [10, 25, 50, 100].map((v) => el("button", { attr: { type: "button" }, yazi: "$" + v, on: { click: () => { girdi.value = String(v); yeniden(); } } }))));
      kaynak.addEventListener("change", yeniden);
    } else {
      girdi = el("input", { attr: { type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "0", "aria-label": "Tokens to sell" } });
      govde.push(solSatir(), el("label", { sinif: "bx-et", yazi: "Amount to sell (" + t.sembol + " on " + t.zincir.ad + ")" }), girdi, elde,
        el("div", { sinif: "bx-cip" }, [25, 50, 75, 100].map((p) => el("button", { attr: { type: "button" }, yazi: p + "%", on: { click: () => { if (tokHam == null) return; const x = (tokHam * BigInt(p)) / 100n; girdi.value = String(Number(x / 10n ** BigInt(Math.max(0, ondalik - 6))) / 1e6); yeniden(); } } }))),
        sol ? (alim = el("select", { attr: { "aria-label": "Receive" } }, [el("option", { attr: { value: "solana" }, yazi: "Receive USDC on Solana (same wallet)" }), el("option", { attr: { value: "arc" }, yazi: "Receive USDC on Arc (your EVM address)" })])) : "",
        sol ? "" : el("div", { sinif: "bx-not", yazi: "You receive USDC on Arc, at your same address." }));
      if (alim) alim.addEventListener("change", yeniden);
    }
    eldeYaz();
    girdi.addEventListener("input", yeniden);
    ana.addEventListener("click", async () => {
      if (ana._m) return; ana._m = true; ana.disabled = true;
      try {
        const solYalniz = (sol && taraf === "sat" && (!alim || alim.value === "solana")) || (taraf === "al" && kaynak && kaynak.value === "solana");
        if (!cuzdan.hesap() && !solYalniz) { await cuzdan.bagla(); await dolarBakiyeleri(); kutuCiz(taraf); return; }
        if ((sol && taraf === "sat") || (taraf === "al" && kaynak && kaynak.value === "solana")) {
          const m = _solM || (_solM = await import("../solana-ikiz.js"));
          if (!m.solanaCuzdan.hesap()) { durum.textContent = "Connect your Solana wallet…"; await m.solanaCuzdan.baglan(); }
          /* the device account pays its own Solana fee: when it has no SOL (the first buy's top-up was skipped), add $0.50
             of SOL from the EVM wallet first — one confirm, once */
          if (taraf === "sat" && cihazMi() && cuzdan.hesap()) {
            const sa = solAdres();
            const bk = await fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [sa] }) }).then((r) => r.json()).catch(() => null);
            if (bk && ((bk.result && bk.result.value) || 0) < 1000000) {
              const ag0 = V.evmler().filter((x) => bakiye[x.anahtar] >= 0.6).sort((x, y) => bakiye[y.anahtar] - bakiye[x.anahtar])[0];
              if (!ag0) throw new Error("Your Solana account needs about $0.50 of SOL for the network fee, and no chain in your wallet has $0.60 of USDC to send it.");
              durum.textContent = "First: $0.50 of SOL to your Solana account for the network fee (once). Confirm in your wallet…";
              const g = await fetch(V.RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: cuzdan.hesap(), recipient: sa, originChainId: ag0.id, destinationChainId: 792703809, originCurrency: ag0.dolar, destinationCurrency: "11111111111111111111111111111111", amount: V.dolarHam(ag0, 0.5).toString(), tradeType: "EXACT_INPUT", refundTo: cuzdan.hesap() }) }).then((r) => r.json());
              if (!g.steps) throw new Error("Could not send SOL for the fee: " + (g.message || "no route"));
              for (const a2 of g.steps) for (const i2 of a2.items || []) { if (a2.kind !== "transaction") continue; const h2 = await cuzdan.agdaGonder(ag0, { to: i2.data.to, data: i2.data.data, value: "0x" + BigInt(i2.data.value || 0).toString(16) }); await V.makbuz(ag0, h2); }
              for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 3000)); const b2 = await fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [sa] }) }).then((r) => r.json()).catch(() => null); durum.textContent = "Waiting for the SOL on Solana… (" + ((i + 1) * 3) + "s)"; if (b2 && b2.result && b2.result.value >= 1000000) break; }
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
        durum.textContent = taraf === "al" ? "Paid ✓ " + t.sembol + " arrives in your Solana wallet, usually within a minute." : (!alim || alim.value === "solana") ? "Sold ✓ USDC arrives in your Solana wallet, usually within a minute." : "Sold ✓ USDC arrives on Arc at " + cuzdan.hesap().slice(0, 6) + "…, usually within a minute.";
          setTimeout(() => { eldeYaz(); }, 15000);
          return;
        }
        await teklif();
        const q = son; if (!q) { durum.textContent = "No route to send."; return; }
        const ag = taraf === "al" ? kaynakAg() : tokenAg;
        for (const adim of q.steps) for (const it of adim.items || []) {
          if (adim.kind !== "transaction") continue;
          durum.textContent = (adim.id === "approve" ? "Approve " : "Confirm ") + "in your wallet…";
          const d = it.data;
          const h = await cuzdan.agdaGonder(ag, { to: d.to, data: d.data, value: "0x" + BigInt(d.value || 0).toString(16) });
          if ((await V.makbuz(ag, h)) !== 1) throw new Error("Reverted: " + h);
        }
        if (sol && taraf === "al" && cihazMi() && ag !== SOL_AG) {
          try {
            const sa = solAdres();
            const bk = await fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [sa] }) }).then((r) => r.json());
            if (((bk.result && bk.result.value) || 0) < 3000000) {   // under 0.003 SOL
              durum.textContent = "One more confirm: $0.50 of SOL to your Solana account, for its future sell fees (first time only)…";
              const g = await fetch(V.RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: cuzdan.hesap(), recipient: sa, originChainId: ag.id, destinationChainId: 792703809, originCurrency: ag.dolar, destinationCurrency: "11111111111111111111111111111111", amount: V.dolarHam(ag, 0.5).toString(), tradeType: "EXACT_INPUT", refundTo: cuzdan.hesap() }) }).then((r) => r.json());
              for (const a2 of g.steps || []) for (const i2 of a2.items || []) { if (a2.kind !== "transaction") continue; const h2 = await cuzdan.agdaGonder(ag, { to: i2.data.to, data: i2.data.data, value: "0x" + BigInt(i2.data.value || 0).toString(16) }); await V.makbuz(ag, h2); }
            }
          } catch (e) { /* the buy went through; the SOL for fees can be added later */ }
        }
        if (taraf === "al") import("../cuzdan-varlik.js").then((M) => M.hatirla({ z: t.zincir.k, a: t.adres, s: t.sembol, d: ondalik, g: t.resim })).catch(() => {});
        durum.textContent = taraf === "al" ? "Paid ✓ " + t.sembol + " arrives on " + t.zincir.ad + (sol ? " at " + solAdres().slice(0, 6) + "…" : "") + ", usually within a minute." : "Sold ✓ USDC arrives on Arc, usually within a minute.";
        setTimeout(() => { dolarBakiyeleri().then(() => {}); eldeYaz(); }, 20000);
      } catch (e) { durum.textContent = (e && (e.shortMessage || e.message)) || "Could not send."; }
      finally { ana._m = false; ana.disabled = false; }
    });
    sag.replaceChildren(el("div", { sinif: "bx-kutu" }, [kapat, ...govde, teklifK, ana, durum,
      el("div", { sinif: "bx-not", yazi: "Routed by relay.link through the DEXes holding the liquidity. Your wallet signs; ARC PULSE never holds your funds. 0.5% ARC PULSE fee." })]));
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
  try {
    const d = await V.veri(null);
    piyasa = { trend: V.suz(d.trend.filter((t) => t.likidite >= V.ESIK)), yeni: V.suz(d.yeni.filter((t) => t.likidite >= V.ESIK_YENI)) };
  } catch (e) { satirlar.replaceChildren(el("div", { sinif: "bx-bos", yazi: "The market data service is busy. Try again in a minute." })); }
  listeCiz();
  /* the big chains' own lists, one after another (the free data service allows ~30 calls a minute) */
  (async () => { for (const k of ["base", "solana", "bsc", "ethereum"]) { if (!kok.isConnected && zv.solana) break; await zincirYukle(k); await new Promise((x) => setTimeout(x, 4000)); } })();
  /* the market from the link (?z=&a=), or the last one picked on this device, or the top trending one (desktop) */
  const za = param && param.get("z"), aa = param && param.get("a");
  let ilk = null;
  const tum = [...piyasa.trend, ...piyasa.yeni];
  if (za && aa) ilk = tum.find((t) => t.zincir.k === za && t.adres.toLowerCase() === aa.toLowerCase());
  /* 16 Nov 2026: a token linked from Feed (or anywhere) that is not in the lists: read its own pools */
  if (za && aa && !ilk) {
    const z = V.ZINCIRLER.find((x) => x.k === za);
    if (z) { const l = await V.gecko("/networks/" + z.gecko + "/tokens/" + aa + "/pools?include=base_token,network&page=1").catch(() => []); ilk = l.find((t) => t.adres.toLowerCase() === aa.toLowerCase()) || null; }
  }
  const yonSat = param && param.get("yon") === "sat";
  if (!ilk) { try { const s = JSON.parse(localStorage.getItem("arcpulse-borsa-son") || "null"); if (s) ilk = tum.find((t) => t.zincir.k === s.z && t.adres.toLowerCase() === s.a.toLowerCase()); } catch (e) { /* none */ } }
  const ekrandaSec = (t) => { let n = 0; const b = () => { if (kok.isConnected) { sec(t); if (yonSat && t === ilk) { kutuCiz("sat"); if (window.matchMedia("(max-width: 860px)").matches) sayfaAc(); } } else if (++n < 100) setTimeout(b, 100); }; b(); };
  if (ilk && (za || !window.matchMedia("(max-width: 860px)").matches)) ekrandaSec(ilk);
  else if (!window.matchMedia("(max-width: 860px)").matches && piyasa.trend[0]) ekrandaSec(piyasa.trend[0]);
  return kok;
}
