"use strict";
/* ===========================================================================
 * kur-sayfa-adres.js — write the deployed addresses into the pages
 *
 *   node scripts/kur-sayfa-adres.js            # show what would change
 *   node scripts/kur-sayfa-adres.js --uygula   # write it
 *
 * WHY THIS EXISTS
 *   docs/app.html and docs/index.html each carried their own copy of the
 *   launchpad and hook addresses, typed in by hand. A redeploy changes both
 *   addresses, and a page left pointing at the previous launchpad does not
 *   fail — it loads, lists the old launches, and quotes from a contract
 *   that is no longer the one the Launch button sends to.
 *
 *   The same class of mistake had just cost a deployment: dagit.js held a
 *   hand-written list of the hook's constructor arguments, the constructor
 *   shrank from six to three, and the hook went live with the launchpad's
 *   address sitting in its `quote` slot. Nothing complained, because extra
 *   constructor calldata is ignored. One copy of a fact, read from where it
 *   is produced, is the only arrangement that cannot drift.
 *
 * WHAT IT CHECKS BEFORE WRITING
 *   That the addresses in dagitim.json actually hold code on Arc, and that
 *   the launchpad points at the hook and the hook back at the launchpad.
 *   Writing an address into a page is publishing it; publishing one that
 *   is wrong is worse than publishing nothing.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";

let no = 1;
async function rpc(yontem, parametreler) {
  /* The public endpoint throttles. A throttled read is not an answer, and
     treating it as one is how an "unreadable" result once got reported as
     a clean one. */
  for (let d = 0; d < 6; d++) {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler })
    });
    const j = await r.json();
    if (j.error) {
      if (/rate limit/i.test(j.error.message || "")) {
        await new Promise((s) => setTimeout(s, 1200 * (d + 1)));
        continue;
      }
      throw new Error(j.error.message);
    }
    return j.result;
  }
  throw new Error("rate limit: 6 denemede gecilemedi");
}

(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim.json"), "utf8"));
  const LP = JSON.parse(fs.readFileSync(path.join(KOK, "build", "Launchpad.json"), "utf8"));
  const HK = JSON.parse(fs.readFileSync(path.join(KOK, "build", "ArcLaunchHook.json"), "utf8"));
  const lI = new Interface(LP.abi), hI = new Interface(HK.abi);

  console.log("SAYFA ADRESLERI");
  console.log("  dagitim.json  " + D.zaman);
  console.log("  launchpad     " + D.launchpad);
  console.log("  hook          " + D.hook);
  console.log("");

  /* ---- is what the file claims actually on the chain? --------------- */
  const cagir = async (ifc, adr, fn) => ifc.decodeFunctionResult(
    fn, await rpc("eth_call", [{ to: adr, data: ifc.encodeFunctionData(fn, []) }, "latest"]))[0];

  let bozuk = 0;
  const kontrol = async (ad, fn) => {
    let v;
    try { v = String(await fn()); } catch (e) { v = "OKUNAMADI: " + e.message.slice(0, 40); }
    return v;
  };

  for (const [ad, adr] of [["launchpad", D.launchpad], ["hook", D.hook]]) {
    const kod = await rpc("eth_getCode", [adr, "latest"]);
    const bayt = kod && kod !== "0x" ? (kod.length - 2) / 2 : 0;
    if (!bayt) { console.log("  " + ad + " adresinde KOD YOK — durduruldu"); process.exit(1); }
    console.log("  " + ad.padEnd(10) + bayt.toLocaleString("en-US") + " bayt");
  }

  const esle = [
    ["lp.hook  -> hook", await kontrol("lp.hook", () => cagir(lI, D.launchpad, "hook")), D.hook],
    ["hook.launchpad -> lp", await kontrol("hook.launchpad", () => cagir(hI, D.hook, "launchpad")), D.launchpad],
    ["hook.quote -> usdc", await kontrol("hook.quote", () => cagir(hI, D.hook, "quote")), D.usdc],
    ["lp.quote   -> usdc", await kontrol("lp.quote", () => cagir(lI, D.launchpad, "quote")), D.usdc]
  ];
  for (const [ad, v, bekle] of esle) {
    const tamam = v.toLowerCase() === String(bekle).toLowerCase();
    if (!tamam) bozuk++;
    console.log("  " + (tamam ? "ok      " : "YANLIS  ") + ad.padEnd(22) + v + (tamam ? "" : "   beklenen " + bekle));
  }
  if (bozuk) {
    console.log("");
    console.log("  BAGLANTI YANLIS: sayfaya yazilmadi.");
    process.exit(1);
  }

  /* ---- rewrite the address block in each page ---------------------- */
  const ALANLAR = {
    launchpad: D.launchpad,
    hook: D.hook,
    poolManager: D.poolManager,
    usdc: D.usdc,
    router: D.router,
    testCol: D.testCol,
    hazine: D.hazine
  };

  let degisti = 0;
  for (const dosya of ["app.html", "index.html"]) {
    const yol = path.join(KOK, "docs", dosya);
    let s = fs.readFileSync(yol, "utf8");
    const once = s;
    const satirlar = [];
    for (const [ad, deger] of Object.entries(ALANLAR)) {
      if (!deger) continue;
      /* Only the declaration inside the A = {...} block, matched by its own
         key so a mention of the same address elsewhere is left alone. */
      const re = new RegExp("(\\b" + ad + ":\\s*)\"0x[0-9a-fA-F]{40}\"", "g");
      const eski = (s.match(re) || []);
      if (!eski.length) continue;
      const yeni = s.replace(re, '$1"' + deger + '"');
      if (yeni !== s) {
        const vardi = eski[0].match(/0x[0-9a-fA-F]{40}/)[0];
        if (vardi.toLowerCase() !== deger.toLowerCase()) satirlar.push("    " + ad + ": " + vardi + " -> " + deger);
        s = yeni;
      }
    }
    /* gecmisLaunchpadlar, where the page keeps the retired ones. They are
       not dead: their launches keep trading on their own pools and
       redeeming at their own vaults, permanently. */
    if (Array.isArray(D.gecmisLaunchpadlar) && /gecmisLaunchpadlar:\s*\[/.test(s)) {
      const liste = D.gecmisLaunchpadlar.map((a) => '    "' + a + '"').join(",\n");
      s = s.replace(/gecmisLaunchpadlar:\s*\[[^\]]*\]/,
        "gecmisLaunchpadlar: [\n" + liste + "\n  ]");
    }
    if (s !== once) {
      degisti++;
      console.log("");
      console.log("  " + dosya + (satirlar.length ? ":" : ": (yalnizca gecmis listesi)"));
      for (const x of satirlar) console.log(x);
      if (UYGULA) fs.writeFileSync(yol, s);
    } else {
      console.log("");
      console.log("  " + dosya + ": degisiklik yok");
    }
  }

  console.log("");
  console.log(UYGULA ? "  yazildi (" + degisti + " dosya)"
                     : "  kuru calisma — yazmak icin: node scripts/kur-sayfa-adres.js --uygula");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
