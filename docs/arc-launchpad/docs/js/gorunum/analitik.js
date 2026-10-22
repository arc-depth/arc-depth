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
import * as v2a from "../v2-analitik.js";

/* the second generation, read live from Arc (no snapshot file) */
async function v2Paneli(kap) {
  const V2 = await v2a.v2Ayar();
  if (!V2) return;
  const yer = el("div", { sinif: "yigin" }, [el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Reading the second generation from Arc…" })]);
  kap.append(panel("One pool on Arc (second generation, live)", yer));
  try {
    const L = await v2a.launchlar(V2);
    const top = (f) => L.reduce((t, x) => t + (f(x) || 0), 0);
    yer.replaceChildren(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Launches", String(L.length), "the v2 registry on Arc"),
      olcum("Real dollars in pools", para(top((x) => x.gercekDolar)), "what sellers can be paid from"),
      olcum("Market cap, all tokens", para(top((x) => x.piyasaDegeri)), "price × supply"),
      olcum("Basket dollars waiting", para(top((x) => x.bekleyen)), "in the Defter until a line reaches $50"),
    ]));
    const gun = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Last 24 hours: reading the hook's fee events…" });
    yer.append(gun);
    const s = await v2a.sonSaatler(V2, 24, (o) => { gun.textContent = "Last 24 hours: reading the hook's fee events… " + Math.round(o * 100) + "%"; });
    const t = s.toplam;
    gun.replaceWith(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Trades, 24h", String(t.islem), "hook fee events"),
      olcum("Volume, 24h", para(t.hacim), "the 2% divided back"),
      olcum("Founders, 24h", para(t.kurucu), "0.30%"),
      olcum("Pool depth, 24h", para(t.derinlik), "0.70% back into pools"),
      olcum("Collateral tax, 24h", para(t.vergi), "to the baskets"),
    ]));
  } catch (e) { yer.replaceChildren(bos("Could not read", e.message)); }
}

export async function ozetOku() {
  const r = await fetch("veri/analitik.json?t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("analytics file not found");
  return r.json();
}

export const dolar = (ham, ondalik = 6) => Number(BigInt(ham || "0")) / 10 ** ondalik;

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Platform analytics", "Launches, volume, fees and reserves"));
  await v2Paneli(kap);
  kap.append(el("h3", { yazi: "First generation (snapshot)" }));

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
