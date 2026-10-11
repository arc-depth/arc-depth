"use strict";
/* ===========================================================================
 * ucret-kanit-gercek.js — real fee evidence for Codex's observation pipeline
 *
 *   node scripts/ucret-kanit-gercek.js            # builds and validates it
 *   node scripts/ucret-kanit-gercek.js --yaz      # also writes the fixture
 *
 * WHY
 *   Codex built the fee observation pipeline — meaning, decoder, receipt
 *   binding, set dedupe, reorg guards, CLI — and recorded its own limit
 *   honestly: feeEventObservationValidation says
 *   SYNTHETIC_RECEIPT_BINDING_VALIDATED, and feeReceiptArchiveInventory
 *   says the local search found no real archive. Both were true when they
 *   wrote them: the hook had never charged a fee, because nothing had ever
 *   been launched.
 *
 *   It has now. The live launch produced a FeeTaken on the purchase and a
 *   Swept on the burn, both on Arc, both with real receipts. This turns
 *   them into the shape their pipeline takes and runs their own CLI over
 *   it, so the synthetic validation can be replaced by a real one.
 *
 * WHAT IS NOT CLAIMED
 *   Their classifier is emphatic that event names are not receipts and
 *   that lifecycle stages must not be summed as income, and it is right:
 *   FeeTaken, AlacakYazildi, AlacakBozduruldu and Swept are four reports
 *   about the SAME money moving, and adding them would count one fee four
 *   times. This script therefore builds evidence and asserts nothing about
 *   revenue.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const YAZ = process.argv.includes("--yaz");

const ISLEMLER = [
  process.env.ALIM_TX || "0x2f68aea578a7bec07fc2877ee307bdacdd22f2eca0e14dc2cf993df1c2717942",
  process.env.SWEEP_TX || "0x5de8cae1ebe63e60c386245f024bf295b51ab23a806b642d2a9ba09b40415138"
];

let no = 1;
async function rpc(yontem, parametreler) {
  for (let d = 0; d < 6; d++) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler })
    });
    const j = await r.json();
    if (j.error) {
      if (/rate limit/i.test(j.error.message || "")) {
        await new Promise((s) => setTimeout(s, 1300 * (d + 1))); continue;
      }
      throw new Error(j.error.message);
    }
    return j.result;
  }
  throw new Error("rate limit");
}

(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim.json"), "utf8"));
  const HK = JSON.parse(fs.readFileSync(path.join(KOK, "build", "ArcLaunchHook.json"), "utf8"));
  const hI = new Interface(HK.abi);

  const bas = parseInt(await rpc("eth_blockNumber", []), 16);
  const simdi = new Date().toISOString();

  console.log("GERCEK UCRET KANITI");
  console.log("  hook  " + D.hook);
  console.log("  bas   " + bas);
  console.log("");

  const gozlemler = [];
  for (const tx of ISLEMLER) {
    const mk = await rpc("eth_getTransactionReceipt", [tx]);
    if (!mk) { console.log("  makbuz alinamadi: " + tx); continue; }
    /* The canonical block hash is read from the chain SEPARATELY rather
       than copied out of the receipt. Taking it from the receipt would
       make the reorg guard compare a value with itself. */
    const blok = await rpc("eth_getBlockByNumber", [mk.blockNumber, false]);
    for (const log of (mk.logs || [])) {
      if (log.address.toLowerCase() !== D.hook.toLowerCase()) continue;
      let cozulen = null;
      try { cozulen = hI.parseLog({ topics: log.topics, data: log.data }); } catch (e) { continue; }
      gozlemler.push({
        log,
        receipt: mk,
        expectedAddress: D.hook,
        expectedTopic: log.topics[0],
        /* The gate wants DECIMAL STRINGS, not numbers: its uint test is
           typeof v === "string" first. Passing 5042 as a number got
           INVALID_CHAIN_OR_DEPTH, which was my payload being wrong and
           not their gate being strict — and the gate is right to check,
           because a chain id that arrives as a number from one source
           and a string from another is a comparison waiting to pass by
           accident. */
        chainId: String(D.chainId),
        expectedChainId: String(D.chainId),
        headNumber: String(bas),
        minimumDepth: "1",
        canonicalBlockHash: blok.hash,
        source: "arc-rpc:" + RPC,
        availableAt: simdi,
        /* For a human reading the fixture. The pipeline decodes the log
           itself and does not take these on trust. */
        _olay: cozulen.name,
        _derinlik: bas - parseInt(log.blockNumber, 16)
      });
      console.log("  " + cozulen.name.padEnd(18) + "blok " + parseInt(log.blockNumber, 16) +
        "  derinlik " + (bas - parseInt(log.blockNumber, 16)) +
        "  log " + parseInt(log.logIndex, 16));
    }
  }

  if (!gozlemler.length) { console.log("\n  hic olay bulunamadi — kanit uretilmedi."); process.exit(1); }

  const paket = { asOf: simdi, observations: gozlemler };

  /* ---- run THEIR pipeline over it --------------------------------- */
  console.log("");
  console.log("  Codex'in hattina veriliyor:");
  const { feeObservationSet } = require(path.join(KOK, "pulse", "fee-observation-set.cjs"));
  const sonuc = feeObservationSet(gozlemler, simdi);
  console.log("    status            " + sonuc.status);
  if (sonuc.status !== "RECEIPT_BOUND_FEE_SET") {
    console.log("    reason            " + sonuc.reason);
    console.log("");
    console.log("  KABUL EDILMEDI. Kanit yaziliyor ki sebebi incelenebilsin.");
  } else {
    console.log("    gozlem sayisi     " + sonuc.observations.length);
    console.log("    tekrar            " + sonuc.duplicateCount);
    console.log("    protocolRevenue   " + sonuc.protocolRevenue + "   <- iddia etmiyor, dogrusu bu");
    console.log("    coverageComplete  " + sonuc.coverageComplete);
    console.log("    finalityVerified  " + sonuc.finalityVerified);
    for (const g of sonuc.observations) {
      const e = g.event;
      console.log("    - " + (e.name || e.eventName) + "  eventId " + g.normalized.eventId.slice(0, 18) + "..");
    }
  }

  if (YAZ) {
    const yol = path.join(KOK, "pulse", "data", "fee-observations-real.json");
    fs.mkdirSync(path.dirname(yol), { recursive: true });
    fs.writeFileSync(yol, JSON.stringify(paket, null, 1));
    console.log("");
    console.log("  yazildi: pulse/data/fee-observations-real.json");
    console.log("  Codex kendi CLI'si ile dogrulayabilir:");
    console.log("    node pulse/preview-fee-observations.cjs < pulse/data/fee-observations-real.json");
  } else {
    console.log("");
    console.log("  yazmak icin: node scripts/ucret-kanit-gercek.js --yaz");
  }
  process.exit(sonuc.status === "RECEIPT_BOUND_FEE_SET" ? 0 : 1);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
