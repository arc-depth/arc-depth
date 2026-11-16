/* ===========================================================================
 * gorunum/akis.js — Feed (#/akis), 16 Nov 2026. Owner: "fomo uygulamasını düşün ... ayrı sekmede kur".
 *
 * A social trading feed in the spirit of consumer apps like fomo, without accounts and without holding anyone's money:
 *   Whales      big buys and sells in the hottest pools of each chain, live from the chain (GeckoTerminal trades)
 *   Following   the same, only the wallets you follow — the list lives in THIS browser only (localStorage)
 *   Top wallets the wallets moving the most money in what we scanned, with their buys and sells
 *   ARC PULSE   every trade in our own tokens' pools on Arc
 * Every trade card: who, what, how much, when; "Buy $10 / $25 / $50" opens our buy box (relay.link, 0.5% fee) with
 * that amount, from the user's own wallet. Tap a wallet for its trades and Follow; tap a token for its market.
 * Nothing is sent anywhere or stored by ARC PULSE. Public data only, free endpoints only.
 * =========================================================================== */
import { el, temizle } from "../ui.js";
import { fiyatYaz } from "./portfoy-ust.js";

const STIL = `
.ak { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ak-ust { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.ak-ust h1 { margin: 0; font-size: 22px; }
.ak-ust p { margin: 2px 0 0; color: var(--yazi-3); font-size: 13px; }
.ak-canli { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--yazi-3); }
.ak-canli::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--alis); animation: ak-nabiz 1.6s ease-in-out infinite; }
@keyframes ak-nabiz { 50% { opacity: .35; } }
.ak-sekmeler { display: flex; gap: 18px; border-bottom: 1px solid var(--cizgi); overflow-x: auto; scrollbar-width: none; }
.ak-sekmeler button { background: none; border: 0; color: var(--yazi-3); font: inherit; font-weight: 600; padding: 8px 0 10px; border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; }
.ak-sekmeler button[aria-selected="true"] { color: var(--yazi-1); border-bottom-color: var(--marka); }
.ak-cipler { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.ak-cipler button { flex: none; background: none; border: 1px solid var(--cizgi); color: var(--yazi-2); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.ak-cipler button[aria-pressed="true"] { border-color: var(--marka); background: rgba(124,92,255,.15); color: var(--yazi-1); }
.ak-liste { display: flex; flex-direction: column; gap: 8px; }
.ak-kart { display: grid; grid-template-columns: 40px minmax(0,1fr); gap: 10px; padding: 12px; border: 1px solid var(--cizgi); border-radius: 14px; background: var(--yuzey-1); min-width: 0; }
.ak-kart--yeni { animation: ak-gir .5s ease-out; }
@keyframes ak-gir { from { opacity: 0; transform: translateY(-6px); } }
.ak-av { width: 40px; height: 40px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; }
.ak-ic { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.ak-satir { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0; }
.ak-kim { background: none; border: 0; padding: 0; color: var(--yazi-1); font: inherit; font-weight: 700; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ak-kim .ak-yildiz { color: #f5c542; }
.ak-zaman { color: var(--yazi-3); font-size: 12px; flex: none; }
.ak-ne { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--yazi-2); font-size: 14px; flex-wrap: wrap; }
.ak-ne b.al { color: var(--alis); } .ak-ne b.sat { color: var(--satis); }
.ak-tok { display: inline-flex; align-items: center; gap: 6px; color: var(--yazi-1); font-weight: 700; text-decoration: none; min-width: 0; }
.ak-tok img, .ak-tok i { width: 20px; height: 20px; border-radius: 50%; flex: none; background: var(--yuzey-2); }
.ak-alt { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--yazi-3); }
.ak-al { display: flex; gap: 6px; }
.ak-al button { background: rgba(46,209,138,.12); color: var(--alis); border: 1px solid rgba(46,209,138,.35); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.ak-bos { padding: 28px 12px; text-align: center; color: var(--yazi-3); border: 1px dashed var(--cizgi); border-radius: 14px; }
.ak-bos b { display: block; color: var(--yazi-1); margin-bottom: 4px; }
.ak-tablo { display: flex; flex-direction: column; gap: 6px; }
.ak-cuz { display: grid; grid-template-columns: 36px minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid var(--cizgi); border-radius: 12px; background: var(--yuzey-1); cursor: pointer; color: inherit; text-align: left; font: inherit; width: 100%; }
.ak-cuz .ak-av { width: 36px; height: 36px; }
.ak-cuz small { display: block; color: var(--yazi-3); font-size: 12px; }
.ak-cuz b.ak-hacim { font-family: var(--yazi-tipi-mono); }
.ak-not { font-size: 12px; color: var(--yazi-3); }
.ak-perde { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.6); display: flex; align-items: flex-end; justify-content: center; }
.ak-panel { width: min(560px, 100%); max-height: 86vh; overflow: auto; background: var(--yuzey-0, #0b0b10); border: 1px solid var(--cizgi); border-radius: 18px 18px 0 0; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
@media (min-width: 861px) { .ak-perde { align-items: center; } .ak-panel { border-radius: 18px; } }
.ak-panel-ust { display: flex; gap: 10px; align-items: center; }
.ak-panel-ust .ak-av { width: 48px; height: 48px; }
.ak-panel-ust b { font-size: 17px; word-break: break-all; }
.ak-eylem { display: flex; gap: 8px; flex-wrap: wrap; }
.ak-ozet { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; }
.ak-ozet div { background: var(--yuzey-1); border: 1px solid var(--cizgi); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.ak-ozet span { display: block; font-size: 11px; color: var(--yazi-3); text-transform: uppercase; letter-spacing: .05em; }
.ak-ozet b { font-family: var(--yazi-tipi-mono); }
`;

const ESIK_BALINA = 1000;          // a "whale" trade: $1,000 or more
const TAKIP = "arcpulse-takip";    // the follow list, this browser only: [{ a: address, ad: nickname }]
const ZINCIRLER_TARA = ["solana", "base", "bsc", "ethereum", "arc"];
const HAVUZ_BASINA = { solana: 6, base: 5, bsc: 4, ethereum: 3, arc: 8 };

const takipOku = () => { try { const x = JSON.parse(localStorage.getItem(TAKIP) || "[]"); return Array.isArray(x) ? x : []; } catch (e) { return []; } };
const takipYaz = (l) => { try { localStorage.setItem(TAKIP, JSON.stringify(l)); } catch (e) { /* storage blocked: the follow lasts this visit */ } };
const takipte = (a) => takipOku().some((x) => x.a.toLowerCase() === a.toLowerCase());
const kisaAdr = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const adiyla = (a) => { const t = takipOku().find((x) => x.a.toLowerCase() === a.toLowerCase()); return t && t.ad ? t.ad : kisaAdr(a); };
const dolar = (x) => x >= 1e6 ? "$" + (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? "$" + (x / 1e3).toFixed(1) + "K" : "$" + x.toFixed(0);
const once = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? Math.floor(s) + "s" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : Math.floor(s / 86400) + "d"; };
/* a colour avatar from the address (no image service) */
function avatar(a) {
  let h = 7, h2 = 13; for (const c of a) { h = (h * 31 + c.charCodeAt(0)) % 100003; h2 = (h2 * 17 + c.charCodeAt(0)) % 100019; }
  return el("button", { sinif: "ak-av", attr: { type: "button", "aria-label": "Wallet " + kisaAdr(a), style: "background:conic-gradient(from " + (h % 360) + "deg,hsl(" + (h % 360) + ",70%,55%),hsl(" + (h2 % 360) + ",70%,45%),hsl(" + (h % 360) + ",70%,55%))" } });
}
const gezgin = (z, a) => z === "solana" ? "https://solscan.io/account/" + a : z === "base" ? "https://basescan.org/address/" + a : z === "bsc" ? "https://bscscan.com/address/" + a : z === "ethereum" ? "https://etherscan.io/address/" + a : z === "arc" ? "https://arcscan.app/address/" + a : null;

export async function ciz() {
  if (!document.getElementById("ak-stil")) document.head.append(el("style", { attr: { id: "ak-stil" }, yazi: STIL }));
  const V = (await import("./vitrin.js")).borsaYardim;
  const kok = el("div", { sinif: "ak" });
  kok.dataset.icindekilerYok = "1";

  const durumYazi = el("span", { sinif: "ak-canli", yazi: "connecting…" });
  kok.append(el("div", { sinif: "ak-ust" }, [
    el("div", {}, [el("h1", { yazi: "Feed" }), el("p", { yazi: "Who is buying what, live from the chain. Follow wallets and buy the same in one tap — from your own wallet." })]),
    durumYazi]));

  const SEKME = [["balina", "Whales"], ["takip", "Following"], ["en", "Top wallets"], ["biz", "ARC PULSE"]];
  let sekme = "balina", zincir = "";
  const sekmeBar = el("div", { sinif: "ak-sekmeler", attr: { role: "tablist" } });
  const cipBar = el("div", { sinif: "ak-cipler" });
  const liste = el("div", { sinif: "ak-liste" });
  kok.append(sekmeBar, cipBar, liste, el("p", { sinif: "ak-not", yazi: "Trades are read from the hottest pools on each chain (GeckoTerminal, public). Whales = $" + ESIK_BALINA.toLocaleString("en-US") + " or more. Your follow list stays in this browser; ARC PULSE stores nothing. Copying a trade is your own decision: big wallets lose money too." }));

  /* ---- data: trades by pool, merged into one list (newest first) ---- */
  const islemler = new Map();   // tx hash + token -> trade
  const havuzlar = [];          // { z, t } t = token row from V.veri
  let ilkCizim = true;
  const ekle = (z, t, j) => {
    let yeni = 0;
    for (const d of j.data || []) {
      const a = d.attributes; if (!a || !a.tx_from_address) continue;
      const k = a.tx_hash + ":" + t.adres;
      if (islemler.has(k)) continue;
      islemler.set(k, { k, z, t, kim: a.tx_from_address, tur: a.kind, usd: Number(a.volume_in_usd || 0), zaman: Date.parse(a.block_timestamp), tx: a.tx_hash, yeni: !ilkCizim });
      yeni++;
    }
    return yeni;
  };
  const tradeOku = async (z, t) => {
    const zz = V.ZINCIRLER.find((x) => x.k === z);
    const esik = z === "arc" ? 0 : 100;
    const url = "https://api.geckoterminal.com/api/v2/networks/" + zz.gecko + "/pools/" + t.havuz + "/trades?trade_volume_in_usd_greater_than=" + esik;
    /* a busy free service answers 429 (seen by the browser as a failed fetch): wait and ask once more */
    let r = await fetch(url, { headers: { accept: "application/json" } }).catch(() => null);
    if (!r || !r.ok) { await new Promise((x) => setTimeout(x, 4000)); r = await fetch(url, { headers: { accept: "application/json" } }).catch(() => null); }
    if (!r || !r.ok) return 0;
    return ekle(z, t, await r.json());
  };
  const bekle = (ms) => new Promise((x) => setTimeout(x, ms));

  /* ---- drawing ---- */
  const cizSekmeler = () => {
    sekmeBar.replaceChildren(...SEKME.map(([k, ad]) => el("button", { attr: { type: "button", role: "tab", "aria-selected": String(sekme === k) }, yazi: ad + (k === "takip" && takipOku().length ? " · " + takipOku().length : ""), on: { click: () => { sekme = k; cizHepsi(); } } })));
    const zl = [["", "All chains"], ...ZINCIRLER_TARA.map((k) => [k, (V.ZINCIRLER.find((x) => x.k === k) || {}).ad || k])];
    cipBar.hidden = sekme === "biz";
    cipBar.replaceChildren(...zl.map(([k, ad]) => el("button", { attr: { type: "button", "aria-pressed": String(zincir === k) }, yazi: ad, on: { click: () => { zincir = k; cizHepsi(); } } })));
  };
  const suzulmus = () => {
    let l = [...islemler.values()];
    if (sekme === "biz") l = l.filter((x) => x.z === "arc");
    else {
      if (zincir) l = l.filter((x) => x.z === zincir);
      if (sekme === "balina") l = l.filter((x) => x.usd >= ESIK_BALINA);
      if (sekme === "takip") { const s = new Set(takipOku().map((x) => x.a.toLowerCase())); l = l.filter((x) => s.has(x.kim.toLowerCase())); }
    }
    return l.sort((a, b) => b.zaman - a.zaman);
  };
  const tokenLogo = (t) => t.resim ? el("img", { attr: { src: t.resim, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : el("i");
  const islemKarti = (x) => {
    const av = avatar(x.kim); av.addEventListener("click", () => cuzdanPaneli(x.kim));
    const yildiz = takipte(x.kim) ? el("span", { sinif: "ak-yildiz", yazi: " ★" }) : "";
    const zad = (V.ZINCIRLER.find((z) => z.k === x.z) || {}).ad || x.z;
    const kart = el("article", { sinif: "ak-kart" + (x.yeni ? " ak-kart--yeni" : "") }, [av, el("div", { sinif: "ak-ic" }, [
      el("div", { sinif: "ak-satir" }, [el("button", { sinif: "ak-kim", attr: { type: "button" }, on: { click: () => cuzdanPaneli(x.kim) } }, [adiyla(x.kim), yildiz]), el("span", { sinif: "ak-zaman", yazi: once(x.zaman) + " ago" })]),
      el("div", { sinif: "ak-ne" }, [el("b", { sinif: x.tur === "buy" ? "al" : "sat", yazi: (x.tur === "buy" ? "bought " : "sold ") + dolar(x.usd) }), el("span", { yazi: "of" }),
        el("a", { sinif: "ak-tok", attr: { href: x.t.bizim ? "#/terminal?t=" + x.t.adres : "#/terminal?z=" + x.z + "&a=" + x.t.adres } }, [tokenLogo(x.t), "$" + x.t.sembol])]),
      el("div", { sinif: "ak-alt" }, [el("span", { yazi: zad + " · price " + fiyatYaz(Number(x.t.fiyat)) + (x.t.degisim != null ? " · 24h " + (Number(x.t.degisim) >= 0 ? "+" : "") + Number(x.t.degisim).toFixed(1) + "%" : "") }),
        el("div", { sinif: "ak-al" }, [10, 25, 50].map((v) => el("button", { attr: { type: "button", "aria-label": "Buy $" + v + " of " + x.t.sembol }, yazi: "Buy $" + v, on: { click: () => V.alKutusu(x.t, v) } })))]),
    ])]);
    x.yeni = false;
    return kart;
  };
  const enIyiler = () => {
    const m = new Map();
    for (const x of islemler.values()) {
      if (zincir && x.z !== zincir) continue;
      const k = x.kim.toLowerCase(); const v = m.get(k) || { a: x.kim, hacim: 0, al: 0, sat: 0, n: 0, zincirler: new Set(), son: 0 };
      v.hacim += x.usd; v.n++; if (x.tur === "buy") v.al += x.usd; else v.sat += x.usd; v.zincirler.add(x.z); v.son = Math.max(v.son, x.zaman);
      m.set(k, v);
    }
    /* routers and bots trade in every pool: a wallet with 40+ trades in what we scanned is shown last */
    return [...m.values()].sort((a, b) => (a.n > 40) - (b.n > 40) || b.hacim - a.hacim).slice(0, 40);
  };
  const cizHepsi = () => {
    cizSekmeler();
    if (sekme === "en") {
      const l = enIyiler();
      if (!l.length) { liste.replaceChildren(el("div", { sinif: "ak-bos" }, [el("b", { yazi: "Reading trades…" }), "Top wallets appear as trades come in."])); return; }
      liste.replaceChildren(el("div", { sinif: "ak-tablo" }, l.map((v) => {
        const av = avatar(v.a);
        return el("button", { sinif: "ak-cuz", attr: { type: "button" }, on: { click: () => cuzdanPaneli(v.a) } }, [av,
          el("div", { attr: { style: "min-width:0" } }, [el("b", { yazi: adiyla(v.a) + (takipte(v.a) ? " ★" : "") }), el("small", { yazi: v.n + " trades · bought " + dolar(v.al) + " · sold " + dolar(v.sat) + " · " + once(v.son) + " ago" })]),
          el("b", { sinif: "ak-hacim", yazi: dolar(v.hacim) })]);
      })));
      return;
    }
    const l = suzulmus();
    if (!l.length) {
      const bos = sekme === "takip" && !takipOku().length ? [el("b", { yazi: "You follow no one yet" }), "Tap any wallet in Whales or Top wallets, then Follow. Your list stays on this device."]
        : sekme === "takip" ? [el("b", { yazi: "No trades from the wallets you follow yet" }), "They show here the moment they trade in a pool we read."]
        : sekme === "biz" ? [el("b", { yazi: "No trades in ARC PULSE tokens in the last day" }), "Trades in our launches on Arc show here, any size."]
        : [el("b", { yazi: islemler.size ? "No whale trade on this chain yet" : "Reading the chains…" }), islemler.size ? "Big trades show here the moment they happen." : "The first trades appear in a few seconds."];
      liste.replaceChildren(el("div", { sinif: "ak-bos" }, bos)); return;
    }
    liste.replaceChildren(...l.slice(0, 60).map(islemKarti));
  };

  /* ---- a wallet: its trades here, follow / unfollow, nickname, explorer ---- */
  const cuzdanPaneli = (a) => {
    document.querySelectorAll(".ak-perde").forEach((x) => x.remove());
    const kendi = [...islemler.values()].filter((x) => x.kim.toLowerCase() === a.toLowerCase()).sort((p, q) => q.zaman - p.zaman);
    const al = kendi.filter((x) => x.tur === "buy").reduce((s, x) => s + x.usd, 0), sat = kendi.filter((x) => x.tur !== "buy").reduce((s, x) => s + x.usd, 0);
    const perde = el("div", { sinif: "ak-perde", on: { click: (e) => { if (e.target === perde) perde.remove(); } } });
    const takipDugme = el("button", { sinif: "dugme " + (takipte(a) ? "dugme--sade" : "dugme--marka"), attr: { type: "button" }, yazi: takipte(a) ? "Following ✓ (tap to unfollow)" : "Follow", on: { click: () => {
      const l = takipOku();
      if (takipte(a)) takipYaz(l.filter((x) => x.a.toLowerCase() !== a.toLowerCase()));
      else { const ad = (prompt("A name for this wallet (only you see it, optional):", "") || "").trim().slice(0, 24); takipYaz([...l, { a, ad }]); }
      perde.remove(); cizHepsi(); cuzdanPaneli(a);
    } } });
    const zk = kendi[0] ? kendi[0].z : (a.startsWith("0x") ? "base" : "solana");
    const gz = gezgin(zk, a);
    perde.append(el("div", { sinif: "ak-panel", attr: { role: "dialog", "aria-label": "Wallet" } }, [
      el("div", { sinif: "ak-panel-ust" }, [avatar(a), el("div", { attr: { style: "min-width:0" } }, [el("b", { yazi: adiyla(a) }), el("div", { sinif: "ak-not", yazi: a })]),
        el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", style: "margin-left:auto" }, yazi: "✕", on: { click: () => perde.remove() } })]),
      el("div", { sinif: "ak-ozet" }, [el("div", {}, [el("span", { yazi: "Trades seen" }), el("b", { yazi: String(kendi.length) })]), el("div", {}, [el("span", { yazi: "Bought" }), el("b", { yazi: dolar(al) })]), el("div", {}, [el("span", { yazi: "Sold" }), el("b", { yazi: dolar(sat) })])]),
      el("div", { sinif: "ak-eylem" }, [takipDugme, gz ? el("a", { sinif: "dugme dugme--sade", attr: { href: gz, target: "_blank", rel: "noopener noreferrer" }, yazi: "Explorer ↗" }) : "",
        el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Copy address", on: { click: (e) => { navigator.clipboard && navigator.clipboard.writeText(a); e.target.textContent = "Copied ✓"; } } })]),
      el("div", { sinif: "ak-not", yazi: "Trades this wallet made in the pools we read today. Its full history is on the explorer." }),
      el("div", { sinif: "ak-liste" }, kendi.length ? kendi.slice(0, 30).map(islemKarti) : [el("div", { sinif: "ak-bos", yazi: "No trades seen from this wallet yet." })]),
    ]));
    document.body.append(perde);
  };

  /* ---- load: the hottest pools of each chain, one after another (the free service allows ~30 calls a minute) ---- */
  cizHepsi();
  const tara = async () => {
    let okunan = 0;
    for (const z of ZINCIRLER_TARA) {
      if (!kok.isConnected && okunan) return;
      const zz = V.ZINCIRLER.find((x) => x.k === z); if (!zz) continue;
      let rows = [];
      try {
        if (z === "arc") {
          const d = await V.veri(zz); rows = [...d.trend, ...d.yeni].filter((t, i, a) => a.findIndex((x) => x.havuz === t.havuz) === i);
        } else { const d = await V.veri(zz); rows = V.suz(d.trend.filter((t) => t.likidite >= V.ESIK)); }
      } catch (e) { continue; }
      for (const t of rows.slice(0, HAVUZ_BASINA[z] || 4)) {
        if (!havuzlar.some((h) => h.t.havuz === t.havuz)) havuzlar.push({ z, t });
        await tradeOku(z, t); okunan++;
        durumYazi.textContent = "live · " + islemler.size + " trades from " + havuzlar.length + " pools";
        if (kok.isConnected) cizHepsi();
        await bekle(2200);
      }
    }
    ilkCizim = false;
  };
  await Promise.race([tara(), bekle(1500)]);
  /* then keep it live: one pool every few seconds, round-robin, while the page is open */
  (async () => {
    while (ilkCizim) await bekle(1000);
    let i = 0;
    while (true) {
      await bekle(5000);
      if (!kok.isConnected) return;
      if (document.hidden || !havuzlar.length) continue;
      const h = havuzlar[i++ % havuzlar.length];
      const n = await tradeOku(h.z, h.t);
      if (n) { durumYazi.textContent = "live · " + islemler.size + " trades from " + havuzlar.length + " pools"; cizHepsi(); }
    }
  })();
  return kok;
}
