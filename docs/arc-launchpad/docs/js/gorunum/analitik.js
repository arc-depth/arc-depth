/* ===========================================================================
 * gorunum/analitik.js — platform analytics, both chains
 *
 * Reads veri/analitik.json, written by scripts/analitik-ozet.js from chain
 * events: launches from the launchpad, volume from the PoolManager's Swap
 * events on our pools only, fees from the hook's Ucret events with their
 * exact split. The file says which block each chain was read up to, and the
 * page shows that rather than pretending to be live.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres } from "../ui.js";
import { para } from "../bicim.js";

export async function ozetOku() {
  const r = await fetch("veri/analitik.json?t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("analytics file not found");
  return r.json();
}

export const dolar = (ham, ondalik = 6) => Number(BigInt(ham || "0")) / 10 ** ondalik;

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Platform analytics", "Launches, volume, fees and reserves on Arc and Robinhood Chain"));

  let o;
  try { o = await ozetOku(); }
  catch (e) {
    kap.append(panel("Analytics", bos("Not available", "The analytics file could not be loaded: " + e.message)));
    return kap;
  }

  const Z = o.zincirler || [];
  const top = (f) => Z.reduce((t, z) => t + f(z), 0);
  const ucretTop = (z) => ["kurucu", "gelistirici", "likidite", "isletme", "derinlik"].reduce((t, k) => t + dolar(z.ucret[k]), 0);

  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Launches", String(top((z) => z.launch)), "both chains"),
    olcum("Volume", para(top((z) => dolar(z.hacim))), "quote side, our pools only"),
    olcum("Protocol fees", para(top(ucretTop)), "the 2%, all five slices"),
    olcum("To the floors", para(top((z) => dolar(z.ucret.vergi))), "creator taxes into vaults"),
    olcum("In launch vaults", para(top((z) => dolar(z.kasalarda))), "read live at snapshot"),
    olcum("Trades", String(top((z) => z.islem)), "swap events")
  ]));

  const tablo = el("table", { sinif: "tablo" });
  tablo.append(el("thead", {}, [el("tr", {}, ["Chain", "Launches", "Trades", "Volume", "Protocol fees", "To floors", "In vaults", "Read to block"].map((b) => el("th", { yazi: b })))]));
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
  kap.append(panel("By chain", tablo));

  const dilim = el("table", { sinif: "tablo" });
  dilim.append(el("thead", {}, [el("tr", {}, ["Slice", ...Z.map((z) => z.etiket)].map((b) => el("th", { yazi: b })))]));
  const dg = el("tbody");
  for (const [k, ad] of [["derinlik", "Pool depth (0.70%)"], ["likidite", "Protocol liquidity (0.50%)"], ["kurucu", "Token founders (0.30%)"],
                         ["gelistirici", "Developer pool (0.30%)"], ["isletme", "Operations (0.20%)"], ["vergi", "Creator tax → vaults"]]) {
    dg.append(el("tr", {}, [el("td", { yazi: ad }), ...Z.map((z) => el("td", { yazi: para(dolar(z.ucret[k])) }))]));
  }
  dilim.append(dg);
  kap.append(panel("Where the fees went", dilim));

  kap.append(not("Snapshot written " + new Date(o.olusturuldu).toUTCString() +
    ". Every figure is summed from chain events or read with balanceOf; nothing is estimated.", "bilgi"));

  if (!top((z) => z.launch)) {
    kap.append(panel("Launches", bos("No launches yet", "Both launchpads are live and empty. The first launch will appear here after the next snapshot.")));
  }
  return kap;
}
