/* ===========================================================================
 * gorunum/hl-islemler.js — closed trades, one row each (16 Nov 2026, owner: "ne poz açtığın belli ne kapattığın ne
 * kazandığın ... belli değil")
 *
 * From Hyperliquid's own fills of the connected address (the latest 2000): every round trip per market, from flat to
 * flat. Entry and exit are the size-weighted average prices of the opening and closing fills; P&L is Hyperliquid's
 * closedPnl summed, fees are what each fill paid (Hyperliquid's and the builder's), net = P&L − fees. Funding is not
 * in a trade's row (it is on the Funding tab). Nothing is stored.
 * =========================================================================== */
import { el } from "../ui.js";

/** fills (any order) -> closed round trips, newest first, plus the one still open per market (not returned) */
export function islemlereBol(dolgular) {
  const sira = [...dolgular].sort((a, b) => a.time - b.time || (a.tid || 0) - (b.tid || 0));
  const acik = {}, bitti = [];
  for (const f of sira) {
    const sz = Number(f.sz) * (f.side === "B" ? 1 : -1);
    let a = acik[f.coin];
    if (!a) a = acik[f.coin] = { coin: f.coin, yon: sz > 0 ? "Long" : "Short", acilis: f.time, kapanis: null, poz: 0, girisN: 0, girisV: 0, cikisN: 0, cikisV: 0, pnl: 0, ucret: 0, adet: 0 };
    const kapatma = /Close/.test(f.dir || "") || (a.poz !== 0 && Math.sign(sz) !== Math.sign(a.poz));
    if (kapatma) { a.cikisN += Math.abs(sz); a.cikisV += Math.abs(sz) * Number(f.px); a.kapanis = f.time; }
    else { a.girisN += Math.abs(sz); a.girisV += Math.abs(sz) * Number(f.px); }
    a.pnl += Number(f.closedPnl || 0); a.ucret += Number(f.fee || 0); a.adet++;
    a.poz = Math.round((a.poz + sz) * 1e8) / 1e8;
    if (a.poz === 0) { bitti.push({ ...a, giris: a.girisN ? a.girisV / a.girisN : null, cikis: a.cikisN ? a.cikisV / a.cikisN : null, net: a.pnl - a.ucret }); delete acik[f.coin]; }
  }
  return bitti.reverse();
}

const usd = (x) => (x < 0 ? "−$" : "$") + Math.abs(x).toFixed(Math.abs(x) >= 100 ? 0 : 2);
const isaretli = (x) => (x > 0 ? "+" : "") + usd(x);
const fiyat = (x) => x == null ? "—" : x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 1 }) : x >= 1 ? String(Number(x.toFixed(4))) : x.toPrecision(4);
const sure = (ms) => { const d = ms / 60000; return d < 60 ? Math.max(1, Math.round(d)) + "m" : d < 1440 ? (d / 60).toFixed(1) + "h" : (d / 1440).toFixed(1) + "d"; };
const zaman = (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** the Closed trades tab: summary line + one row per round trip */
export function kapananGorunum(islemler) {
  if (!islemler.length) return el("div", { sinif: "ikincil", yazi: "No closed trades yet at this address (Hyperliquid keeps the latest 2000 fills here)." });
  const net = islemler.reduce((t, x) => t + x.net, 0), kazanan = islemler.filter((x) => x.net > 0).length, ucret = islemler.reduce((t, x) => t + x.ucret, 0);
  const ozet = el("div", { sinif: "hl-isl-ozet" }, [
    el("div", {}, [el("span", { yazi: "Net P&L" }), el("b", { sinif: net > 0 ? "hl-art" : net < 0 ? "hl-eks" : "", yazi: isaretli(net) })]),
    el("div", {}, [el("span", { yazi: "Trades" }), el("b", { yazi: String(islemler.length) })]),
    el("div", {}, [el("span", { yazi: "Win rate" }), el("b", { yazi: Math.round(kazanan / islemler.length * 100) + "% (" + kazanan + "/" + islemler.length + ")" })]),
    el("div", {}, [el("span", { yazi: "Fees paid" }), el("b", { yazi: usd(ucret) })]),
  ]);
  const t = el("table", { sinif: "hl-tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["Closed", "Market", "Entry → exit", "Held", "P&L", "Fees", "Net"].map((b, i) => el("th", { sinif: i > 1 ? "sayi" : "", yazi: b })))]));
  t.append(el("tbody", {}, islemler.slice(0, 100).map((x) => el("tr", {}, [
    el("td", { attr: { "data-et": "Closed" }, yazi: zaman(x.kapanis) }),
    el("td", { attr: { "data-et": "Market" } }, [el("strong", { yazi: x.coin }), " ", el("span", { sinif: "etiket " + (x.yon === "Long" ? "etiket--alis" : "etiket--satis"), yazi: x.yon })]),
    el("td", { sinif: "sayi", attr: { "data-et": "Entry → exit" }, yazi: fiyat(x.giris) + " → " + fiyat(x.cikis) }),
    el("td", { sinif: "sayi", attr: { "data-et": "Held" }, yazi: sure(x.kapanis - x.acilis) }),
    el("td", { sinif: "sayi " + (x.pnl > 0 ? "hl-art" : x.pnl < 0 ? "hl-eks" : ""), attr: { "data-et": "P&L" }, yazi: isaretli(x.pnl) }),
    el("td", { sinif: "sayi", attr: { "data-et": "Fees" }, yazi: usd(x.ucret) }),
    el("td", { sinif: "sayi " + (x.net > 0 ? "hl-art" : x.net < 0 ? "hl-eks" : ""), attr: { "data-et": "Net" } }, [el("strong", { yazi: isaretli(x.net) })]),
  ]))));
  return el("div", { sinif: "yigin yigin--sik" }, [ozet, el("div", { sinif: "hl-sarmal" }, [t]),
    el("div", { sinif: "hl-ipucu", yazi: "P&L is Hyperliquid's own closed P&L; Net subtracts the trading fees (Hyperliquid's and ARC PULSE's). Funding is on the Funding tab." })]);
}

/** the Funding tab: last 7 days, total and per payment */
export function fonlamaGorunum(fonlar) {
  if (!fonlar.length) return el("div", { sinif: "ikincil", yazi: "No funding payments in the last 7 days." });
  const top = fonlar.reduce((t, f) => t + Number((f.delta || {}).usdc || 0), 0);
  const t = el("table", { sinif: "hl-tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["Time", "Market", "Payment"].map((b, i) => el("th", { sinif: i === 2 ? "sayi" : "", yazi: b })))]));
  t.append(el("tbody", {}, fonlar.slice(0, 100).map((f) => { const d = f.delta || {}, u = Number(d.usdc || 0); return el("tr", {}, [
    el("td", { attr: { "data-et": "Time" }, yazi: zaman(f.time) }), el("td", { attr: { "data-et": "Market" }, yazi: d.coin || "—" }),
    el("td", { sinif: "sayi " + (u > 0 ? "hl-art" : u < 0 ? "hl-eks" : ""), attr: { "data-et": "Payment" }, yazi: (u > 0 ? "+" : u < 0 ? "−" : "") + "$" + Math.abs(u).toFixed(4) })]); })));
  return el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "hl-isl-ozet" }, [el("div", {}, [el("span", { yazi: "Funding, 7 days" }), el("b", { sinif: top > 0 ? "hl-art" : top < 0 ? "hl-eks" : "", yazi: (top > 0 ? "+" : top < 0 ? "−" : "") + "$" + Math.abs(top).toFixed(2) })])]),
    el("div", { sinif: "hl-sarmal" }, [t])]);
}
