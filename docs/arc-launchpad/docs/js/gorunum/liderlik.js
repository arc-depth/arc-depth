/* ===========================================================================
 * gorunum/liderlik.js — leaderboards, from the same analytics snapshot
 *
 * Tokens by volume, tokens by the money in their vault, and founders by
 * launches. A trader ranking is NOT shown: a Swap's `sender` is the router
 * contract, not the person, so ranking traders from these logs would mean
 * guessing who stands behind the router. That is said on the page.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, adres } from "../ui.js";
import { para } from "../bicim.js";
import { ozetOku, dolar } from "./analitik.js";

function liste(baslik, satirlar, sutunlar) {
  if (!satirlar.length) return panel(baslik, bos("Nothing to rank yet", "No launch has happened on either chain."));
  const t = el("table", { sinif: "tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["#", ...sutunlar.map((s) => s[0])].map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  satirlar.slice(0, 20).forEach((s, i) => g.append(el("tr", {}, [el("td", { yazi: String(i + 1) }), ...sutunlar.map((c) => c[1](s))])));
  t.append(g);
  return panel(baslik, t);
}

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Leaderboards", "Top tokens and founders across Arc and Robinhood Chain"));

  let o;
  try { o = await ozetOku(); }
  catch (e) {
    kap.append(panel("Leaderboards", bos("Not available", "The analytics file could not be loaded: " + e.message)));
    return kap;
  }

  const tokenler = (o.zincirler || []).flatMap((z) => z.tokenler.map((t) => ({ ...t, etiket: z.etiket })));
  const ad = (t) => el("td", { yazi: (t.sembol || "?") + " · " + t.etiket });

  kap.append(liste("Tokens by volume", [...tokenler].sort((a, b) => dolar(b.hacim) - dolar(a.hacim)),
    [["Token", ad], ["Volume", (t) => el("td", { yazi: para(dolar(t.hacim)) })], ["Trades", (t) => el("td", { yazi: String(t.islem) })]]));

  kap.append(liste("Tokens by vault", [...tokenler].sort((a, b) => dolar(b.kasadaki) - dolar(a.kasadaki)),
    [["Token", ad], ["In vault", (t) => el("td", { yazi: para(dolar(t.kasadaki)) })], ["Vault", (t) => el("td", {}, [adres(t.kasa)])]]));

  const kurucular = {};
  for (const t of tokenler) {
    const k = String(t.kurucu || "").toLowerCase();
    if (!k) continue;
    kurucular[k] = kurucular[k] || { kurucu: t.kurucu, launch: 0, hacim: 0 };
    kurucular[k].launch++;
    kurucular[k].hacim += dolar(t.hacim);
  }
  kap.append(liste("Founders", Object.values(kurucular).sort((a, b) => b.launch - a.launch || b.hacim - a.hacim),
    [["Founder", (f) => el("td", {}, [adres(f.kurucu)])], ["Launches", (f) => el("td", { yazi: String(f.launch) })],
     ["Their tokens' volume", (f) => el("td", { yazi: para(f.hacim) })]]));

  kap.append(not("No trader ranking: a swap's sender on chain is the router contract, not the person, so ranking traders would mean guessing. " +
    "Snapshot written " + new Date(o.olusturuldu).toUTCString() + ".", "bilgi"));
  return kap;
}
