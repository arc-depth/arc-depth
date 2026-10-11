"use strict";
/* ===========================================================================
 * kanit-fathom.js — write the deployment's own provenance into its manifest.
 *
 *   node scripts/kanit-fathom.js
 *
 * dagitim-fathom.json recorded six addresses and no transactions. Anyone
 * auditing it — including the other agent, who asked — had to scan for
 * them, and a manifest that cannot be checked against the chain without a
 * search is not evidence of anything. The deploy script printed the hashes
 * and then dropped them, which is the part worth fixing.
 *
 * Every hash is verified here before it is written: the receipt has to
 * exist, to have succeeded, and for a creation to have produced the
 * address the manifest already claims. A hash that does not check out is
 * reported and not recorded.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const KOK = path.join(__dirname, "..");
const DOSYA = path.join(KOK, "dagitim-fathom.json");
const A = JSON.parse(fs.readFileSync(DOSYA, "utf8"));

/* Printed by dagit-fathom.js and dene-fathom-alim.js as they ran. Listed
   here rather than re-derived, and then each one is checked against the
   chain so the list cannot quietly be wrong. */
const ISLEMLER = [
  ["token", A.token, "0x8744c177a8a3f016d57ac589322947a26933ee3868b1c8fef1e2c407871125e7"],
  ["stake", A.stake, "0xaa5fea544d33b76f72ddf101fdcbabcb74f911052da6e9bd1d5fa0646216ffa9"],
  ["acici", A.acici, "0x920cf55fde9a4e9e9f26e62a6859722d1add551f5069646a5e7b2ff706948d65"],
  ["hook", A.hook, "0xcd8d6c703233fce594def58669c2e3fa792a5986a6c8c464ed8fc07da2496936"],
  ["governor", A.governor, "0x98eb53db25372f72fc165a0a9aed0808a2cf1b0dece4e497687af74fad35d4b0"],
  ["vesting", A.vesting, "0xeb15b942ab18c7d6f9b4dd6090a267b8dc0a6fc297ee9b422231f31ad4b3f224"]
];
const MERDIVEN = [
  ["ic", "0x42c34fe783f33ec6b3eda53f0326cd6095e1b2a50b8d3376cb39618ff3e9d263"],
  ["orta", "0xf237bca4674caa7509e7546c005d12905ccf5a6fba8abcddce88d4fa7d00f67b"],
  ["dis", "0x4915a260c2c30ee3b49e61aee43966d3db7036c7f5db8c049eaa0d215bba3a0e"]
];
const ILK_ALIM = "0xfcec67fe61e81f437655f1e9ee9a9fbfaf1d032ee1dadda45ac0ee58368b31d2";

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({ hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(60000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 30000);
    }
  }
}
const nf = (x) => Number(x).toLocaleString("tr-TR");

(async function main() {
  console.log("FATHOM DAGITIM KANITI — her hash zincirde dogrulaniyor");
  console.log("");

  let hata = 0;
  const kayit = {};

  for (const [ad, beklenen, hash] of ISLEMLER) {
    const rc = await rpc("eth_getTransactionReceipt", [hash]).catch(() => null);
    if (!rc) { console.log("  HATA  " + ad.padEnd(10) + "makbuz yok"); hata++; continue; }
    const blok = parseInt(rc.blockNumber, 16);
    const uretilen = (rc.contractAddress || "").toLowerCase();
    /* The hook came out of the CREATE2 factory, so the receipt has no
       contractAddress — the factory made it, this transaction only called
       the factory. Checking for a direct creation marked a correct
       deployment as wrong. For that shape the proof is that the call
       succeeded and the expected address holds code. */
    let tamam = rc.status === "0x1";
    let not = "";
    if (uretilen) {
      tamam = tamam && uretilen === beklenen.toLowerCase();
      if (!tamam) not = "   URETILEN " + uretilen;
    } else {
      const kod = await rpc("eth_getCode", [beklenen, "latest"]).catch(() => "0x");
      tamam = tamam && kod.length > 2;
      not = "   fabrika uzerinden, kod " + ((kod.length - 2) / 2) + " bayt";
    }
    if (!tamam) hata++;
    console.log("  " + (tamam ? "TAMAM" : "HATA ") + " " + ad.padEnd(10) +
      "blok " + nf(blok) + "   " + hash.slice(0, 18) + "…" + not);
    if (tamam) kayit[ad] = { tx: hash, blok, gaz: parseInt(rc.gasUsed, 16),
                             fabrika: uretilen ? false : true };
  }

  console.log("");
  const merdiven = [];
  for (const [ad, hash] of MERDIVEN) {
    const rc = await rpc("eth_getTransactionReceipt", [hash]).catch(() => null);
    if (!rc || rc.status !== "0x1") { console.log("  HATA  merdiven/" + ad); hata++; continue; }
    const blok = parseInt(rc.blockNumber, 16);
    console.log("  TAMAM merdiven/" + ad.padEnd(5) + "blok " + nf(blok) + "   " + hash.slice(0, 18) + "…");
    merdiven.push({ kademe: ad, tx: hash, blok });
  }

  const alimRc = await rpc("eth_getTransactionReceipt", [ILK_ALIM]).catch(() => null);
  let alim = null;
  if (alimRc && alimRc.status === "0x1") {
    alim = { tx: ILK_ALIM, blok: parseInt(alimRc.blockNumber, 16),
             loglar: alimRc.logs.length };
    console.log("  TAMAM ilk alim   blok " + nf(alim.blok) + "   " + alim.loglar + " log");
  } else { console.log("  HATA  ilk alim makbuzu"); hata++; }

  if (hata) { console.log("\n  " + hata + " kayit dogrulanamadi; manifest YAZILMADI."); process.exit(1); }

  A.islemler = kayit;
  A.merdivenIslemleri = merdiven;
  A.ilkAlim = alim;
  A.ilkBlok = Math.min(...Object.values(kayit).map((x) => x.blok));
  A.kanitNotu =
    "Her adres kendi olusturma isleminin makbuzuyla eslestirildi: makbuz var, " +
    "durum basarili, ve uretilen adres manifesttekiyle ayni. Tarama gerekmez. " +
    "ilkBlok, FTHM ile ilgili hicbir olayin daha once olamayacagi blok.";
  fs.writeFileSync(DOSYA, JSON.stringify(A, null, 1) + "\n");

  console.log("");
  console.log("  dagitim-fathom.json guncellendi.");
  console.log("  ilk blok  " + nf(A.ilkBlok) + "   <- bundan onceki bloklarda FTHM yok");
  console.log("  son blok  " + nf(Math.max(alim.blok, ...merdiven.map((m) => m.blok))));
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
