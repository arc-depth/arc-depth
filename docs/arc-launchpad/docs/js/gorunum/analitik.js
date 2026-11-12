/* ===========================================================================
 * gorunum/analitik.js — platform analytics
 *
 * Live first: the one-pool launchpads on Arc (v8 for every launch, v9 for
 * designer tokens), read from the chain by v2-analitik.js — launches, pool
 * dollars, market cap, and the last 24 hours of the hook's fee events.
 *
 * Then, folded as an archive: the first generation, from
 * veri/analitik.json (written by scripts/analitik-ozet.js from chain
 * events), which says which block each chain was read up to.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum } from "../ui.js";
import { para } from "../bicim.js";
import * as v2a from "../v2-analitik.js";
import { maskotBos, cubuklar, arsiv, ilerleme, dugmeLink } from "./squad.js";

/* the live launchpads, read from Arc (no snapshot file) */
async function v2Paneli(kap) {
  const [V2, V9] = await Promise.all([v2a.v2Ayar(), v2a.v9Ayar()]);
  if (!V2) return;
  const yer = el("div", { sinif: "yigin" }, [el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Reading the launchpads on Arc…" })]);
  kap.append(panel("Live on Arc", yer));
  try {
    /* v8 and v9 (designer tokens): each read from its own launchpad, collateral ledger and hook */
    const [L8, L9] = await Promise.all([v2a.launchlar(V2), V9 ? v2a.launchlar(V9).catch(() => null) : Promise.resolve([])]);
    const L = [...L8, ...(L9 || [])];
    const top = (f) => L.reduce((t, x) => t + (f(x) || 0), 0);
    yer.replaceChildren(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Launches", String(L.length), V9 ? L8.length + " on the main launchpad · " + (L9 ? L9.length : "?") + " designer" : "on the launchpad"),
      olcum("Real dollars in pools", para(top((x) => x.gercekDolar)), "what sellers can be paid from"),
      olcum("Market cap, all tokens", para(top((x) => x.piyasaDegeri)), "price × supply"),
      olcum("Basket dollars waiting", para(top((x) => x.bekleyen)), "held until a basket line reaches $50"),
    ]));
    /* each token's pool dollars, as bars, with a link to its page */
    if (L.length) {
      const sirali = [...L].sort((a, b) => (b.gercekDolar || 0) - (a.gercekDolar || 0));
      yer.append(el("h4", { yazi: "Real dollars in each pool" }), cubuklar(sirali.slice(0, 12).map((x) => ({ ad: (x.sembol || "?") + (x.ad && x.ad !== x.sembol ? " · " + x.ad : ""), deger: x.gercekDolar || 0, metin: para(x.gercekDolar || 0) }))),
        el("div", { sinif: "d4-bos__eylem" }, sirali.slice(0, 6).map((x) => el("a", { sinif: "dugme dugme--sade dugme--kucuk", attr: { href: "#/terminal?t=" + x.token }, yazi: "$" + (x.sembol || "?") + " page" }))));
    }
    const gunKap = el("div", { sinif: "yigin" });
    const gun = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Last 24 hours: reading trades from Arc… 0%" });
    const cubuk = ilerleme();
    gunKap.append(gun, cubuk.kap);
    yer.append(el("h4", { yazi: "Last 24 hours" }), gunKap);
    const pay = V9 && V9.hook ? 0.5 : 1;
    const s = await v2a.sonSaatler(V2, 24, (o) => { gun.textContent = "Last 24 hours: reading trades from Arc… " + Math.round(o * pay * 100) + "%"; cubuk.ayarla(o * pay); });
    const t = { ...s.toplam };
    /* the designer set's hook emits the same fee event: its trades are added in */
    let eksik = "";
    if (V9 && V9.hook) {
      const s9 = await v2a.sonSaatler(V9, 24, (o) => { gun.textContent = "Last 24 hours: reading trades from Arc… " + Math.round((0.5 + o / 2) * 100) + "%"; cubuk.ayarla(0.5 + o / 2); }).catch(() => null);
      if (s9) for (const k of Object.keys(t)) t[k] += s9.toplam[k] || 0;
      else eksik = " (designer tokens could not be read just now)";
    }
    const dilimler = [["To founders (0.30%)", t.kurucu], ["Developer pool (0.30%)", t.gelistirici], ["Protocol liquidity (0.50%)", t.likidite], ["Back into pools (0.70%)", t.derinlik], ["Operations (0.20%)", t.isletme], ["Collateral tax, to baskets", t.vergi]];
    gunKap.replaceChildren(
      el("div", { sinif: "izgara izgara--olcum" }, [
        olcum("Trades, 24h", String(t.islem), "every buy and sell on these pools" + eksik),
        olcum("Volume, 24h", para(t.hacim), "worked back from the 2% fee"),
        olcum("Founders earned, 24h", para(t.kurucu), "0.30% of every trade"),
        olcum("Collateral tax, 24h", para(t.vergi), "to the baskets"),
      ]),
      t.islem ? el("div", { sinif: "yigin yigin--sik" }, [el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Where the fees went in the last 24 hours (the 0.20% that buys and burns ARCP is paid outside this event and not counted here):" }),
        cubuklar(dilimler.map(([ad, v]) => ({ ad, deger: v || 0, metin: para(v || 0) })))])
        : maskotBos("turbo", "No trades in the last 24 hours", "When people trade these tokens, the volume and the fee split appear here as bars.", [dugmeLink("Open Trade", "#/terminal"), dugmeLink("All launches", "#/launches")])
    );
  } catch (e) { yer.replaceChildren(bos("Could not read Arc just now", "The public Arc endpoint did not answer. Reload the page in a minute. (" + e.message + ")")); }
}

export async function ozetOku() {
  const r = await fetch("veri/analitik.json?t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("analytics file not found");
  return r.json();
}

export const dolar = (ham, ondalik = 6) => Number(BigInt(ham || "0")) / 10 ** ondalik;

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Platform analytics", "Launches, volume, fees and reserves, read from the chain"));
  /* the live read can take a while on a busy RPC: the page opens at once and the panel fills in */
  const v2Yer = el("div", { sinif: "yigin" });
  kap.append(v2Yer);
  v2Paneli(v2Yer).catch((e) => v2Yer.replaceChildren(panel("Live on Arc", bos("Could not read", e.message))));

  /* the first generation: folded, as an archive */
  const arsivGovde = el("div", { sinif: "yigin" });
  kap.append(arsiv("First generation (archive)", arsivGovde, "the earlier launchpads, from a snapshot file"));

  let o;
  try { o = await ozetOku(); }
  catch (e) {
    arsivGovde.append(bos("Not available", "The archive file could not be loaded: " + e.message));
    return kap;
  }

  const Z = o.zincirler || [];
  const top = (f) => Z.reduce((t, z) => t + f(z), 0);
  const ucretTop = (z) => ["kurucu", "gelistirici", "likidite", "isletme", "derinlik"].reduce((t, k) => t + dolar(z.ucret[k]), 0);

  arsivGovde.append(
    not("The first generation had a launchpad on each of " + Z.length + " chains. " + (top((z) => z.launch) ? "" : "No token was launched on it: every figure below is zero, and the live launchpads above replaced it.") +
      " Snapshot written " + new Date(o.olusturuldu).toUTCString() + "; every figure is summed from chain events or read with balanceOf.", "bilgi"),
    el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Launches", String(top((z) => z.launch)), Z.length + " chains"),
      olcum("Volume", para(top((z) => dolar(z.hacim))), "our pools only, in dollars"),
      olcum("Protocol fees", para(top(ucretTop)), "the 2%, all five slices"),
      olcum("To collateral vaults", para(top((z) => dolar(z.ucret.vergi))), "creator taxes"),
      olcum("In launch vaults", para(top((z) => dolar(z.kasalarda))), "read at snapshot"),
      olcum("Trades", String(top((z) => z.islem)), "swap events")
    ]));

  const tablo = el("table", { sinif: "tablo" });
  tablo.append(el("thead", {}, [el("tr", {}, ["Chain", "Launches", "Trades", "Volume", "Protocol fees", "To vaults", "In vaults", "Read to block"].map((b) => el("th", { yazi: b })))]));
  const govde = el("tbody");
  for (const z of Z) {
    govde.append(el("tr", {}, [
      el("td", { yazi: z.etiket + " · " + z.para }),
      el("td", { yazi: String(z.launch) }),
      el("td", { yazi: String(z.islem) }),
      el("td", { yazi: para(dolar(z.hacim)) }),
      el("td", { yazi: para(ucretTop(z)) }),
      el("td", { yazi: para(dolar(z.ucret.vergi)) }),
      el("td", { yazi: para(dolar(z.kasalarda)) }),
      el("td", { yazi: String(z.okunanBlok) })
    ]));
  }
  tablo.append(govde);
  arsivGovde.append(el("h4", { yazi: "By chain" }), el("div", { sinif: "tablo-sarmal" }, [tablo]));

  const dilim = el("table", { sinif: "tablo" });
  dilim.append(el("thead", {}, [el("tr", {}, ["Slice", ...Z.map((z) => z.etiket)].map((b) => el("th", { yazi: b })))]));
  const dg = el("tbody");
  for (const [k, ad] of [["derinlik", "Pool depth (0.70%)"], ["likidite", "Protocol liquidity (0.50%)"], ["kurucu", "Token founders (0.30%)"],
                         ["gelistirici", "Developer pool (0.30%)"], ["isletme", "Operations (0.20%)"], ["vergi", "Creator tax → vaults"]]) {
    dg.append(el("tr", {}, [el("td", { yazi: ad }), ...Z.map((z) => el("td", { yazi: para(dolar(z.ucret[k])) }))]));
  }
  dilim.append(dg);
  arsivGovde.append(el("h4", { yazi: "Where the fees went" }), el("div", { sinif: "tablo-sarmal" }, [dilim]));
  if (!top((z) => z.launch)) arsivGovde.append(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "No first-generation launches. New launches go to the live launchpads shown at the top of this page." }));
  return kap;
}
