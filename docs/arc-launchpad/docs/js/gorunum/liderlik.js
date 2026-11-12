/* ===========================================================================
 * gorunum/liderlik.js — leaderboards, from the same analytics snapshot
 *
 * Tokens by volume, tokens by the money in their vault, and founders by
 * launches. A trader ranking is NOT shown: a Swap's `sender` is the router
 * contract, not the person, so ranking traders from these logs would mean
 * guessing who stands behind the router. That is said on the page.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, adres } from "../ui.js";
import { maskotBos, dugmeLink, arsiv } from "./squad.js";
import { para } from "../bicim.js";
import { ozetOku, dolar } from "./analitik.js";
import * as v2a from "../v2-analitik.js";
import { zincirSiralari } from "./liderlik-zincir.js";

const ZAD = { 26: "Arc", 6: "Base", 3: "Arbitrum", 0: "Ethereum", 1: "Avalanche", 15: "Monad", 19: "HyperEVM", 17: "BNB", 35: "Robinhood", 5: "Solana", 8: "Sui", 9: "Aptos" };

/* ARC PULSE's own wallet (operations / team): its launches are protocol demos, and it is named as such */
const EKIP = "0x89189c84dc95d0520aeec9c8cf3ba5b9d42611d0";
const demoMu = (t) => /(^|[^a-z])(test|proof)([^a-z]|$)/i.test(String(t.ad || "") + " " + String(t.sembol || ""));

/* the live launchpads on Arc: v8 (every launch) and v9 (designer tokens) */
async function v2Siralar(kap) {
  const [V2, V9] = await Promise.all([v2a.v2Ayar(), v2a.v9Ayar()]);
  if (!V2) return;
  let L;
  try {
    const [L8, L9] = await Promise.all([v2a.launchlar(V2), V9 ? v2a.launchlar(V9).catch(() => []) : Promise.resolve([])]);
    L = [...L8, ...L9];
  } catch (e) { kap.append(panel("Tokens", bos("Could not read Arc just now", "Reload the page in a minute. (" + e.message + ")"))); return; }
  const ad = (t) => el("td", {}, [el("a", { attr: { href: "#/terminal?t=" + t.token }, yazi: (t.sembol || "?") + " · " + (t.ad || "") }),
    demoMu(t) ? el("span", { sinif: "etiket", attr: { style: "margin-left:6px", title: "Launched by ARC PULSE to test the launchpad" }, yazi: "Demo" }) : null]);
  const bosY = ["Every token launched on ARC PULSE's own launchpad is ranked here.", [dugmeLink("Create a token", "#/olustur", true), dugmeLink("All launches", "#/launches")]];
  kap.append(liste("Tokens by market cap", [...L].sort((a, b) => (b.piyasaDegeri || 0) - (a.piyasaDegeri || 0)),
    [["Token", ad], ["Market cap", (t) => el("td", { yazi: para(t.piyasaDegeri || 0) })], ["Real dollars in pool", (t) => el("td", { yazi: para(t.gercekDolar || 0) })]], ...bosY, "goldie"));
  kap.append(liste("Tokens by basket dollars", [...L].sort((a, b) => (b.teminat + b.bekleyen) - (a.teminat + a.bekleyen)),
    [["Token", ad], ["Basket at launch", (t) => el("td", { yazi: para(t.teminat) })], ["Waiting to be bought", (t) => el("td", { yazi: para(t.bekleyen) })]], ...bosY, "pebble"));
  const K = {};
  for (const t of L) {
    const k = String(t.kurucu || t.vekil).toLowerCase();
    (K[k] ||= { kurucu: t.kurucu ? "0x" + t.kurucu.slice(26) : t.vekil, zincir: t.kurucuZincir, launch: 0, pd: 0 });
    K[k].launch++; K[k].pd += t.piyasaDegeri || 0;
  }
  kap.append(liste("Founders", Object.values(K).sort((a, b) => b.launch - a.launch || b.pd - a.pd),
    [["Founder", (f) => el("td", {}, [adres(f.kurucu), String(f.kurucu).toLowerCase() === EKIP ? el("span", { sinif: "etiket", attr: { style: "margin-left:6px" }, yazi: "ARC PULSE team" }) : null])], ["Paid on", (f) => el("td", { yazi: ZAD[f.zincir] || "?" })],
     ["Launches", (f) => el("td", { yazi: String(f.launch) })], ["Their tokens' market cap", (f) => el("td", { yazi: para(f.pd) })]],
    "Founders rank here by how many tokens they launched.", [dugmeLink("Create a token", "#/olustur", true)], "bolt"));
}

function liste(baslik, satirlar, sutunlar, bosYazi = "Nothing to rank yet.", eylemler = [], maskot = 0) {
  if (!satirlar.length) return panel(baslik, maskotBos(maskot, "Nobody here yet", bosYazi, eylemler));
  const t = el("table", { sinif: "tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["#", ...sutunlar.map((s) => s[0])].map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  satirlar.slice(0, 20).forEach((s, i) => g.append(el("tr", {}, [el("td", { yazi: String(i + 1) }), ...sutunlar.map((c) => c[1](s))])));
  t.append(g);
  return panel(baslik, el("div", { sinif: "tablo-sarmal" }, [t]));
}

/* a plain table for the archive (no mascot, no panel) */
function arsivTablosu(baslik, satirlar, sutunlar) {
  if (!satirlar.length) return el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: baslik + ": nothing to rank (no first-generation launch)." });
  const t = el("table", { sinif: "tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["#", ...sutunlar.map((s) => s[0])].map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  satirlar.slice(0, 20).forEach((s, i) => g.append(el("tr", {}, [el("td", { yazi: String(i + 1) }), ...sutunlar.map((c) => c[1](s))])));
  t.append(g);
  return el("div", { sinif: "yigin yigin--sik" }, [el("h4", { yazi: baslik }), el("div", { sinif: "tablo-sarmal" }, [t])]);
}

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Leaderboards", "Top traders, launchers, designers, referrers, tokens and founders"));
  await zincirSiralari(kap);
  await v2Siralar(kap);

  const arsivGovde = el("div", { sinif: "yigin" });
  kap.append(arsiv("First generation (archive)", arsivGovde, "the earlier launchpads, from a snapshot file"));
  let o;
  try { o = await ozetOku(); }
  catch (e) {
    arsivGovde.append(bos("Not available", "The archive file could not be loaded: " + e.message));
    return kap;
  }

  const tokenler = (o.zincirler || []).flatMap((z) => z.tokenler.map((t) => ({ ...t, etiket: z.etiket })));
  const ad = (t) => el("td", { yazi: (t.sembol || "?") + " · " + t.etiket });
  const kurucular = {};
  for (const t of tokenler) {
    const k = String(t.kurucu || "").toLowerCase();
    if (!k) continue;
    kurucular[k] = kurucular[k] || { kurucu: t.kurucu, launch: 0, hacim: 0 };
    kurucular[k].launch++;
    kurucular[k].hacim += dolar(t.hacim);
  }
  arsivGovde.append(
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: tokenler.length ? "The first-generation launchpads, read from a snapshot." : "No token was launched on the first-generation launchpads; the live boards above replaced them." }),
    arsivTablosu("Tokens by volume", [...tokenler].sort((a, b) => dolar(b.hacim) - dolar(a.hacim)),
      [["Token", ad], ["Volume", (t) => el("td", { yazi: para(dolar(t.hacim)) })], ["Trades", (t) => el("td", { yazi: String(t.islem) })]]),
    arsivTablosu("Tokens by vault", [...tokenler].sort((a, b) => dolar(b.kasadaki) - dolar(a.kasadaki)),
      [["Token", ad], ["In vault", (t) => el("td", { yazi: para(dolar(t.kasadaki)) })], ["Vault", (t) => el("td", {}, [adres(t.kasa)])]]),
    arsivTablosu("Founders", Object.values(kurucular).sort((a, b) => b.launch - a.launch || b.hacim - a.hacim),
      [["Founder", (f) => el("td", {}, [adres(f.kurucu)])], ["Launches", (f) => el("td", { yazi: String(f.launch) })],
       ["Their tokens' volume", (f) => el("td", { yazi: para(f.hacim) })]]),
    not("No trader ranking in this snapshot: a swap's sender on chain is the router contract, not the person (the live trader ranking above uses the wallet the ARC PULSE gate delivered to). " +
      "Snapshot written " + new Date(o.olusturuldu).toUTCString() + ".", "bilgi"));
  return kap;
}
