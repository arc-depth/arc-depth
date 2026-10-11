"use strict";
/* The fee table is written down twice — in EgriLaunchpad, which publishes
 * it, and in EgriHook, which charges it. This proves the two agree.
 *
 * WHY IT IS WRITTEN TWICE AT ALL
 *   The hook could read the launchpad on every swap, and then there would
 *   be one copy. It does not, because a swap would depend on a cross
 *   contract call for its arithmetic. So the duplication is deliberate and
 *   this script is the price of it.
 *
 * WHY A SOURCE CHECK
 *   Both are `constant`, so the numbers are in the source and in the
 *   bytecode as literals. Reading the source is the direct way to compare
 *   them, and it catches an edit before anything is deployed.
 *
 * Fail-closed: a missing file, a missing constant, or a table that does
 * not add up is a failure. A check that quietly finds nothing to compare
 * is the defect this project keeps finding in its own tooling.
 */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..", "contracts");
const ADLAR = ["UCRET_PPM", "KURUCU_PPM", "STAKE_PPM", "GELISTIRICI_PPM", "LIKIDITE_PPM", "ISLETME_PPM"];
/* EgriHook calls the total FEE_PPM; everything else matches by name. */
const ESLER = { UCRET_PPM: "FEE_PPM" };

function sabitler(dosya, haritala) {
  const s = fs.readFileSync(path.join(KOK, dosya), "utf8");
  if (!s.trim()) throw new Error("bos: " + dosya);
  const out = {};
  for (const ad of ADLAR) {
    const aranan = haritala && ESLER[ad] ? ESLER[ad] : ad;
    /* `uint256 public constant NAME = 20_000;` — underscores allowed. */
    const re = new RegExp("constant\\s+" + aranan + "\\s*=\\s*([0-9_]+)\\s*;");
    const m = s.match(re);
    out[ad] = m ? Number(m[1].replace(/_/g, "")) : null;
  }
  return out;
}

function kosul() {
  const lp = sabitler("EgriLaunchpad.sol", false);
  const hk = sabitler("EgriHook.sol", true);
  const satirlar = ADLAR.map((ad) => ({
    ad,
    launchpad: lp[ad],
    hook: hk[ad],
    ayni: lp[ad] !== null && lp[ad] === hk[ad]
  }));
  const dilimler = ADLAR.slice(1);
  const toplamDilim = dilimler.reduce((a, ad) => a + (lp[ad] || 0), 0);
  return {
    satirlar,
    toplam: lp.UCRET_PPM,
    toplamDilim,
    derinlik: (lp.UCRET_PPM || 0) - toplamDilim
  };
}

if (require.main === module) {
  let kotu = 0;
  const r = kosul();

  console.log("EGRI UCRET DENETIMI — EgriLaunchpad ile EgriHook ayni tabloyu mu tasiyor");
  console.log("");
  console.log("  sabit             launchpad     hook");
  for (const x of r.satirlar) {
    if (!x.ayni) kotu++;
    const bir = x.ad === "UCRET_PPM" ? " (hook: FEE_PPM)" : "";
    console.log("  " + (x.ayni ? "OK  " : "KOTU") + "  " + x.ad.padEnd(16) +
      String(x.launchpad).padStart(8) + String(x.hook).padStart(9) + bir);
  }

  console.log("");
  if (r.toplam === null) { kotu++; console.log("  KOTU  toplam ucret okunamadi"); }
  else {
    console.log("  toplam ucret          " + (r.toplam / 10000).toFixed(2) + "%");
    console.log("  adli dilimler         " + (r.toplamDilim / 10000).toFixed(2) + "%");
    console.log("  derinlige kalan       " + (r.derinlik / 10000).toFixed(2) + "%");
    if (r.derinlik <= 0) {
      kotu++;
      console.log("  KOTU  dilimler toplami ucrete esit ya da fazla — derinlige hic kalmiyor");
    }
  }

  console.log("");
  console.log(kotu === 0
    ? "  GECTI — iki kontrat ayni tabloyu tasiyor ve tablo tutuyor."
    : "  BASARISIZ — " + kotu + " sorun.");
  process.exit(kotu === 0 ? 0 : 1);
}

module.exports = { kosul };
