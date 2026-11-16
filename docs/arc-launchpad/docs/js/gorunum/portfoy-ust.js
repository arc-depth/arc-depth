/* ===========================================================================
 * gorunum/portfoy-ust.js — the top of the Portfolio (16 Nov 2026 redesign, the demo the owner approved)
 *
 * Total value, today's P&L, a value chart (1D / 1W / 1M / All), quick actions, and three tabs:
 * Tokens (Arc one-pool tokens + Hyperliquid spot coins, each row opens its buy / sell screen),
 * Perps (open positions with TP / SL and Close) and Activity (recent Hyperliquid fills).
 * Everything is read live for the connected address; nothing is stored. "Hide balances" is a
 * per-device convenience kept in this browser only.
 * =========================================================================== */
import { el } from "../ui.js";

const STIL = `
.pf{display:flex;flex-direction:column;gap:14px}
.pf-ust{display:flex;align-items:center;gap:10px}
.pf-ust h1{font:700 22px/1.2 var(--yazi-tipi);margin:0;flex:1}
.pf-ikon{width:38px;height:38px;border-radius:11px;border:1px solid var(--cizgi-guclu);background:transparent;color:var(--yazi-2);display:inline-grid;place-items:center;cursor:pointer}
.pf-ikon:hover{color:var(--yazi-1)}
.pf-ikon svg{width:18px;height:18px}
.pf-kahraman{display:grid;grid-template-columns:minmax(0,1fr);gap:4px}
.pf-et{font-size:12.5px;color:var(--yazi-3)}
.pf-toplam{font-size:38px;font-weight:700;letter-spacing:-1px;line-height:1.1;font-variant-numeric:tabular-nums}
.pf-degisim{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.pf-grafik{height:110px;margin-top:6px}
.pf-grafik svg{width:100%;height:100%;display:block}
.pf-aralik{display:flex;gap:6px}
.pf-aralik button{height:30px;padding:0 11px;border-radius:8px;border:0;background:transparent;color:var(--yazi-3);font:500 12.5px var(--yazi-tipi);cursor:pointer}
.pf-aralik button[aria-pressed=true]{background:var(--yuzey-3);color:var(--yazi-1);font-weight:600}
.pf-eylem{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.pf-eylem a{display:flex;flex-direction:column;align-items:center;gap:6px;padding:11px 0;border-radius:14px;border:1px solid var(--cizgi);background:var(--yuzey-1);color:var(--yazi-1);text-decoration:none;font-size:12.5px;font-weight:600}
.pf-eylem a span{width:36px;height:36px;border-radius:11px;background:var(--marka-zemin);color:#cfc2ff;display:grid;place-items:center}
.pf-eylem svg{width:18px;height:18px}
.pf-sekme{display:flex;gap:20px;border-bottom:1px solid var(--cizgi)}
.pf-sekme button{background:none;border:0;padding:0 0 10px;color:var(--yazi-3);font:500 14.5px var(--yazi-tipi);cursor:pointer;border-bottom:2px solid transparent}
.pf-sekme button[aria-selected=true]{color:var(--yazi-1);font-weight:600;border-bottom-color:var(--marka)}
.pf-satir{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid var(--cizgi);color:inherit;text-decoration:none}
.pf-satir:hover{background:var(--yuzey-1)}
.pf-logo{position:relative;flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-weight:700;font-size:12px;color:#0b0b10}
.pf-logo i{position:absolute;right:-5px;bottom:-5px;font-style:normal;font-size:9px;font-weight:600;padding:1px 4px;border-radius:5px;background:var(--yuzey-3);color:var(--yazi-2);border:1px solid var(--yuzey-0)}
.pf-ad{flex:1;min-width:0}.pf-ad strong{font-size:15px}.pf-ad div{font-size:12.5px;color:var(--yazi-3);font-variant-numeric:tabular-nums}
.pf-deger{text-align:right;font-variant-numeric:tabular-nums}.pf-deger strong{font-size:15px}.pf-deger div{font-size:12.5px;font-weight:600}
.pf-kart{padding:13px;border-radius:14px;background:var(--yuzey-1);border:1px solid var(--cizgi);display:flex;flex-direction:column;gap:9px}
.pf-kart__ust{display:flex;align-items:center;gap:8px}
.pf-kart__izgara{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;font-size:12px;color:var(--yazi-3);font-variant-numeric:tabular-nums}
.pf-kart__izgara b{display:block;color:var(--yazi-1);font-weight:500;font-size:13px}
.pf-cip{font-size:11.5px;padding:3px 7px;border-radius:6px;font-weight:600;font-variant-numeric:tabular-nums}
.pf-art{color:var(--alis)}.pf-eks{color:var(--satis)}
.pf-bos{padding:22px 4px;color:var(--yazi-3);font-size:13.5px}
.pf-gizli .pf-gizle{filter:blur(9px);user-select:none}
@media (min-width:861px){.pf-ikiz{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:28px;align-items:start}}
`;

const RENK = ["#B9A6FF", "#7CE3B4", "#F0C75E", "#7FB6FF", "#D7F98A", "#8EE6D2", "#FF9F6B", "#F7A8D8"];
const renk = (s) => RENK[[...String(s)].reduce((t, c) => t + c.charCodeAt(0), 0) % RENK.length];
const usd = (x) => x == null || !isFinite(x) ? "—" : "$" + (Math.abs(x) >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 0 }) : Math.abs(x) >= 0.01 ? x.toFixed(2) : x.toPrecision(2));
const isaretli = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + usd(Math.abs(x));
/* tiny prices as $0.0₅351 (subscript count of zeros), as on every pro trading screen */
const ALT = "₀₁₂₃₄₅₆₇₈₉";
export const fiyatYaz = (x) => {
  if (x == null || !isFinite(x)) return "—";
  if (x >= 1000) return "$" + x.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (x >= 1) return "$" + x.toFixed(2);
  if (x >= 0.001) return "$" + x.toPrecision(4).replace(/0+$/, "");
  const s = x.toFixed(20).slice(2), sifir = s.match(/^0*/)[0].length;
  return "$0.0" + String(sifir).split("").map((d) => ALT[d]).join("") + s.slice(sifir, sifir + 3);
};
const miktarYaz = (x) => x >= 1e9 ? (x / 1e9).toFixed(2) + "B" : x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? (x / 1e3).toFixed(1) + "K" : x >= 1 ? x.toFixed(2) : x.toPrecision(3);
const svg = (d, ek = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${ek}><path d="${d}"/></svg>`;
const GIZ = "arcpulse-pf-gizli";

/** the Portfolio's top: hero, chart, actions, tabs. `tekHavuzTutulan` and `hlKapat` come from portfoy.js. */
export function portfoyUst(hesap, { tekHavuzTutulan, hlKapat }) {
  if (!document.getElementById("pf-stil")) document.head.append(el("style", { attr: { id: "pf-stil" }, yazi: STIL }));
  const kok = el("section", { sinif: "pf", attr: { "aria-label": "Portfolio" } });
  let gizli = false; try { gizli = localStorage.getItem(GIZ) === "1"; } catch (e) { /* storage blocked */ }
  kok.classList.toggle("pf-gizli", gizli);

  const gozDug = el("button", { sinif: "pf-ikon", attr: { type: "button", "aria-label": "Hide balances", "aria-pressed": String(gizli) }, html: svg("M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6") });
  gozDug.addEventListener("click", () => { gizli = !gizli; kok.classList.toggle("pf-gizli", gizli); gozDug.setAttribute("aria-pressed", String(gizli)); try { localStorage.setItem(GIZ, gizli ? "1" : "0"); } catch (e) { /* storage blocked */ } });
  kok.append(el("div", { sinif: "pf-ust" }, [el("h1", { yazi: "Portfolio" }),
    el("span", { sinif: "mono", attr: { style: "font-size:12.5px;color:var(--yazi-3)" }, yazi: hesap.slice(0, 6) + "…" + hesap.slice(-4) }), gozDug,
    el("a", { sinif: "pf-ikon", attr: { href: "#/perps/alerts", "aria-label": "Alerts" }, html: svg("M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0") })]));

  /* hero */
  const toplam = el("div", { sinif: "pf-toplam pf-gizle", yazi: "…" });
  const degisim = el("div", { sinif: "pf-degisim pf-gizle" });
  const toplamEt = el("div", { sinif: "pf-et", yazi: "Total · every chain + Hyperliquid" });
  const grafik = el("div", { sinif: "pf-grafik pf-gizle" });
  const aralik = el("div", { sinif: "pf-aralik", attr: { role: "group", "aria-label": "Chart range" } });
  const ARALIK = [["day", "1D"], ["week", "1W"], ["month", "1M"], ["allTime", "All"]];
  let secili = "day";
  const sol = el("div", { sinif: "pf-kahraman" }, [toplamEt, toplam, degisim, grafik, aralik]);

  /* quick actions: only what the site really does */
  const eylem = el("div", { sinif: "pf-eylem" }, [
    ["#/perps/trade", "Deposit", "M12 4v12M6 10l6 6 6-6M5 20h14"],
    ["#/terminal", "Buy", "M12 5v14M5 12h14"],
    ["#/perps/trade", "Perps", "M3 17l5-5 4 4 8-9M15 7h5v5"],
    ["#/olustur", "Launch", "M5 19l14-14M9 5h10v10"],
  ].map(([href, ad, d]) => el("a", { attr: { href } }, [el("span", { html: svg(d) }), ad])));

  /* tabs */
  const SEKME = [["tok", "Tokens"], ["poz", "Perps"], ["akt", "Activity"]];
  let sekme = "tok";
  const sekmeBar = el("div", { sinif: "pf-sekme", attr: { role: "tablist" } });
  const govde = el("div", { attr: { role: "tabpanel" } }, [el("div", { sinif: "pf-bos", yazi: "Reading your wallet…" })]);
  kok.append(el("div", { sinif: "pf-ikiz" }, [el("div", { sinif: "yigin" }, [sol, eylem]), el("div", {}, [sekmeBar, govde])]));

  let V = null, T = null, F = null, hata = null, W = null;   // W: the wallets' holdings on every chain (js/cuzdan-varlik.js)
  const sekmeCiz = () => {
    sekmeBar.replaceChildren(...SEKME.map(([k, ad]) => {
      const n = k === "poz" && V ? " (" + V.pozisyonlar.length + ")" : "";
      const b = el("button", { attr: { type: "button", role: "tab", "aria-selected": String(sekme === k) }, yazi: ad + n });
      b.addEventListener("click", () => { sekme = k; sekmeCiz(); govdeCiz(); if (k === "akt" && !F) fillOku(); });
      return b;
    }));
  };
  const satir = ({ href, ini, zincir, ad, alt, deger, kz, kzYuzde }) => el(href ? "a" : "div", { sinif: "pf-satir", attr: href ? { href } : {} }, [
    el("span", { sinif: "pf-logo", attr: { style: "background:" + renk(ad) } }, [ini, zincir ? el("i", { yazi: zincir }) : null]),
    el("span", { sinif: "pf-ad" }, [el("strong", { yazi: ad }), el("div", { sinif: "pf-gizle", yazi: alt })]),
    el("span", { sinif: "pf-deger" }, [el("strong", { sinif: "pf-gizle", yazi: deger }),
      el("div", { sinif: kz > 0 ? "pf-art" : kz < 0 ? "pf-eks" : "", attr: { style: kz ? "" : "color:var(--yazi-3)" }, yazi: kz == null ? "—" : isaretli(kz) + (kzYuzde != null ? " (" + (kzYuzde > 0 ? "+" : "") + kzYuzde.toFixed(1) + "%)" : "") })]),
  ]);
  function govdeCiz() {
    if (sekme === "tok") {
      const satirlar = [];
      /* 16 Nov 2026: every chain at once — dollars, tokens bought here (EVM and Solana), SOL; the network the wallet is on does not matter */
      for (const x of W || []) satirlar.push(satir({ href: x.href, ini: (x.sembol || "?").slice(0, 4).toUpperCase(), zincir: x.zincir, ad: x.sembol, alt: miktarYaz(x.miktar) + (x.fiyat != null && !x.dolar ? " · " + fiyatYaz(x.fiyat) : "") + " · " + x.zincir, deger: x.deger != null ? usd(x.deger) : "—", kz: null }));
      for (const x of T || []) satirlar.push(satir({ href: "#/terminal?t=" + x.token, ini: (x.sembol || "?").slice(0, 3).toUpperCase(), zincir: "Arc", ad: x.sembol || "?", alt: miktarYaz(x.miktar) + " · " + fiyatYaz(x.fiyat), deger: usd(x.deger), kz: null }));
      for (const x of V ? V.spotlar : []) {
        const kz = x.coin !== "USDC" && x.maliyet > 0 && x.deger != null ? x.deger - x.maliyet : null;
        satirlar.push(satir({ href: null, ini: x.coin.slice(0, 4), zincir: "HL", ad: x.coin, alt: miktarYaz(x.miktar) + " · " + fiyatYaz(x.fiyat), deger: usd(x.deger), kz, kzYuzde: kz != null ? kz / x.maliyet * 100 : null }));
      }
      if (V && V.perpDeger > 0.005) satirlar.push(satir({ href: "#/perps/trade", ini: "HL", zincir: "Perps", ad: "Hyperliquid perps", alt: V.pozisyonlar.length + " position" + (V.pozisyonlar.length === 1 ? "" : "s") + " · account value", deger: usd(V.perpDeger), kz: V.pozisyonlar.reduce((t, p) => t + Number(p.unrealizedPnl), 0) }));
      govde.replaceChildren(...(satirlar.length ? satirlar : [el("div", { sinif: "pf-bos" }, [T == null || V == null ? "Reading your wallet…" : "No tokens yet. ", T != null && V != null ? el("a", { attr: { href: "#/terminal" }, yazi: "Find one to buy →" }) : null])]));
      return;
    }
    if (sekme === "poz") {
      if (hata && !V) { govde.replaceChildren(el("div", { sinif: "pf-bos", yazi: "Could not read Hyperliquid: " + hata })); return; }
      if (!V) { govde.replaceChildren(el("div", { sinif: "pf-bos", yazi: "Reading Hyperliquid…" })); return; }
      if (!V.pozisyonlar.length) { govde.replaceChildren(el("div", { sinif: "pf-bos" }, ["No open perp positions. ", el("a", { attr: { href: "#/perps/trade" }, yazi: "Open Perps →" })])); return; }
      govde.replaceChildren(el("div", { sinif: "yigin yigin--sik", attr: { style: "padding-top:12px" } }, V.pozisyonlar.map((p) => {
        const szi = Number(p.szi), uzun = szi > 0, pnl = Number(p.unrealizedPnl), roe = Number(p.returnOnEquity) * 100;
        const tet = V.emirler.filter((o) => o.coin === p.coin && o.isTrigger && o.reduceOnly);
        const tp = tet.filter((o) => /Take Profit/i.test(o.orderType)).map((o) => fiyatYaz(Number(o.triggerPx))).join(", ");
        const sl = tet.filter((o) => /Stop/i.test(o.orderType)).map((o) => fiyatYaz(Number(o.triggerPx))).join(", ");
        const durum = el("div", { attr: { role: "status", style: "font-size:12.5px" } });
        const kapat = el("button", { sinif: "dugme dugme--kucuk", attr: { type: "button", style: "margin-left:auto;background:var(--satis-zemin);color:#ff9aa5;border-color:var(--satis-cizgi)" }, yazi: "Close" });
        kapat.addEventListener("click", async () => {
          if (kapat.dataset.onay !== "1") { kapat.dataset.onay = "1"; kapat.textContent = "Confirm close"; durum.textContent = "Close " + Math.abs(szi) + " " + p.coin + " at market (at most 1% from " + fiyatYaz(p.mark) + "). Fees: Hyperliquid taker + ARC PULSE 0.05%."; return; }
          kapat.disabled = true; durum.textContent = "Sending… your wallet may ask you to sign";
          try { durum.textContent = await hlKapat(hesap, p); durum.className = "pf-art"; setTimeout(yenile, 2500); }
          catch (e) { durum.replaceChildren((e && e.message) || String(e)); durum.className = "pf-eks"; if (e && e.git) durum.append(" ", el("a", { attr: { href: "#/perps/trade?coin=" + encodeURIComponent(p.coin) }, yazi: "Open Perps →" })); kapat.disabled = false; kapat.dataset.onay = ""; kapat.textContent = "Close"; }
        });
        return el("article", { sinif: "pf-kart" }, [
          el("div", { sinif: "pf-kart__ust" }, [el("strong", { yazi: p.coin }),
            el("span", { sinif: "pf-cip", attr: { style: uzun ? "background:var(--alis-zemin);color:#7ce3b4" : "background:var(--satis-zemin);color:#ff9aa5" }, yazi: (uzun ? "Long " : "Short ") + (p.leverage ? p.leverage.value + "×" : "") }),
            p.dex ? el("span", { sinif: "pf-cip", attr: { style: "background:var(--yuzey-3);color:var(--yazi-2)" }, yazi: p.dex }) : null,
            el("span", { sinif: "pf-gizle " + (pnl >= 0 ? "pf-art" : "pf-eks"), attr: { style: "margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums" }, yazi: isaretli(pnl) + " (" + (roe > 0 ? "+" : "") + roe.toFixed(1) + "%)" })]),
          el("div", { sinif: "pf-kart__izgara" }, [
            el("div", {}, ["Size", el("b", { sinif: "pf-gizle", yazi: usd(Math.abs(Number(p.positionValue))) })]),
            el("div", {}, ["Entry → mark", el("b", { yazi: fiyatYaz(Number(p.entryPx)) + " → " + fiyatYaz(p.mark) })]),
            el("div", {}, ["Liq.", el("b", { yazi: p.liquidationPx ? fiyatYaz(Number(p.liquidationPx)) : "—" })])]),
          el("div", { sinif: "pf-kart__ust", attr: { style: "flex-wrap:wrap" } }, [
            el("span", { sinif: "pf-cip", attr: { style: "background:var(--alis-zemin);color:#7ce3b4" }, yazi: "TP " + (tp || "—") }),
            el("span", { sinif: "pf-cip", attr: { style: "background:var(--satis-zemin);color:#ff9aa5" }, yazi: "SL " + (sl || "—") }),
            p.dex ? null : el("a", { sinif: "dugme dugme--sade dugme--kucuk", attr: { href: "#/perps/trade?coin=" + encodeURIComponent(p.coin), style: "margin-left:auto" }, yazi: "Edit" }),
            p.dex ? null : kapat]),
          durum]);
      })));
      return;
    }
    /* activity: Hyperliquid fills, newest first */
    if (!F) { govde.replaceChildren(el("div", { sinif: "pf-bos", yazi: "Reading your recent trades…" })); return; }
    if (!F.length) { govde.replaceChildren(el("div", { sinif: "pf-bos", yazi: "No Hyperliquid trades at this address yet." })); return; }
    govde.replaceChildren(...F.slice(0, 40).map((f) => {
      const al = f.side === "B", kz = Number(f.closedPnl);
      const ne = (f.dir || (al ? "Buy" : "Sell")) + " " + f.sz + " " + f.coin;
      const zaman = new Date(f.time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
      return el("div", { sinif: "pf-satir" }, [
        el("span", { sinif: "pf-logo", attr: { style: "background:" + (al ? "#7ce3b4" : "#ff9aa5") } }, [al ? "B" : "S"]),
        el("span", { sinif: "pf-ad" }, [el("strong", { attr: { style: "font-size:14px" }, yazi: ne }), el("div", { yazi: zaman + " · at " + fiyatYaz(Number(f.px)) })]),
        el("span", { sinif: "pf-deger" }, [el("strong", { sinif: "pf-gizle", attr: { style: "font-size:14px" }, yazi: usd(Number(f.px) * Number(f.sz)) }),
          el("div", { sinif: kz > 0 ? "pf-art" : kz < 0 ? "pf-eks" : "", attr: { style: kz ? "" : "color:var(--yazi-3)" }, yazi: kz ? isaretli(kz) : "open" })]),
      ]);
    }));
  }
  const fillOku = async () => { try { const hl = await import("../hl.js"); F = await hl.dolgularOku(hesap); } catch (e) { F = []; } if (sekme === "akt") govdeCiz(); };

  function kahramanCiz() {
    const tokDeger = (T || []).reduce((t, x) => t + (x.deger || 0), 0) + (W || []).reduce((t, x) => t + (x.deger || 0), 0);
    const hlDeger = V ? V.perpDeger + V.spotDeger : 0;
    toplam.textContent = V || T ? usd(hlDeger + tokDeger) : "…";
    const g = V && V.kz[secili];
    const ADI = { day: "today", week: "this week", month: "this month", allTime: "all time" };
    degisim.className = "pf-degisim pf-gizle " + (g > 0 ? "pf-art" : g < 0 ? "pf-eks" : "");
    degisim.replaceChildren(g == null ? "" : isaretli(g), el("span", { attr: { style: "color:var(--yazi-3);font-weight:400" }, yazi: g == null ? "" : " Hyperliquid P&L " + ADI[secili] }));
    /* the chart: Hyperliquid account value over the chosen range */
    const nok = V && V.deger[secili] || [];
    if (nok.length > 1) {
      const xs = nok.map((p) => p[0]), ys = nok.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), dy = y1 - y0 || 1;
      const yol = nok.map(([x, y], i) => (i ? "L" : "M") + ((x - x0) / (x1 - x0 || 1) * 600).toFixed(1) + " " + (100 - (y - y0) / dy * 88 - 6).toFixed(1)).join(" ");
      const yuk = ys[ys.length - 1] >= ys[0], c = yuk ? "#9e86ff" : "#ff6b7a";
      grafik.innerHTML = `<svg viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="pfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".32"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><path d="${yol} L600 100 L0 100Z" fill="url(#pfg)"/><path d="${yol}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
    } else grafik.innerHTML = "";
    aralik.replaceChildren(...ARALIK.map(([k, ad]) => { const b = el("button", { attr: { type: "button", "aria-pressed": String(secili === k) }, yazi: ad }); b.addEventListener("click", () => { secili = k; kahramanCiz(); }); return b; }));
  }

  const yenile = async () => {
    if (!kok.isConnected && V) return;   // the page was left
    try { const hl = await import("../hl.js"); V = await hl.tumVarliklar(hesap); hata = null; } catch (e) { hata = (e && e.message) || String(e); }
    kahramanCiz(); sekmeCiz(); govdeCiz();
    if (kok.isConnected) setTimeout(yenile, 15000);
  };
  const cuzdanOku = async () => {
    try { const M = await import("../cuzdan-varlik.js"); let sol = M.solAdresi(); try { const S = await import("../solana-ikiz.js"); sol = S.solanaCuzdan.hesap() || sol; } catch (e) { /* no Solana module */ }
      W = await M.varliklar(hesap, sol); } catch (e) { W = W || []; }
    kahramanCiz(); govdeCiz();
    if (kok.isConnected) setTimeout(cuzdanOku, 60000);
  };
  setTimeout(cuzdanOku, 0);
  tekHavuzTutulan(hesap).then((l) => { T = l; }).catch(() => { T = []; }).then(() => { kahramanCiz(); sekmeCiz(); govdeCiz(); });
  kahramanCiz(); sekmeCiz(); setTimeout(yenile, 0);
  return kok;
}
