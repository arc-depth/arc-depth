"use strict";
/* ===========================================================================
 * denetim-codex-ucret-cozucu.js
 *   Does Codex's fee-event decoder decode MY contract's real logs?
 *
 *   node scripts/denetim-codex-ucret-cozucu.js
 *
 * WHY THIS AND NOT A NAME COMPARISON
 *   Checking that their topic0 strings equal mine proves we hashed the same
 *   signature. It says nothing about whether the field layout is right —
 *   which argument is indexed, what order the data words are in, whether an
 *   amount is being read out of the right 32 bytes. Those are exactly the
 *   mistakes that produce a confident wrong number, and this project has
 *   made that one before: an int128 re-encoded and re-read came back
 *   sign-extended and reported an opening BUY as a SELL.
 *
 *   So the decoder is fed the real logs from the live launch — a FeeTaken
 *   from the purchase and a Swept from the burn — and what it returns is
 *   compared against the same logs decoded with the contract's own ABI. Two
 *   independent decodings of the same bytes agreeing is a result; one
 *   decoding on its own is a claim.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";

/* The two transactions from the live launch. Passed in rather than
   searched for, because this is a decoder test and a log scan would make
   it a scan test as well. */
const ISLEMLER = {
  alim: process.env.ALIM_TX || "0x2f68aea578a7bec07fc2877ee307bdacdd22f2eca0e14dc2cf993df1c2717942",
  sweep: process.env.SWEEP_TX || "0x5de8cae1ebe63e60c386245f024bf295b51ab23a806b642d2a9ba09b40415138"
};

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

let gecti = 0, kaldi = 0;
const ok = (kosul, ad, not) => {
  if (kosul) { gecti++; console.log("  OK     " + ad + (not ? "   " + not : "")); }
  else { kaldi++; console.log("  KALDI  " + ad + (not ? "   " + not : "")); }
};

(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim.json"), "utf8"));
  const HK = JSON.parse(fs.readFileSync(path.join(KOK, "build", "ArcLaunchHook.json"), "utf8"));
  const hI = new Interface(HK.abi);

  /* Codex's decoder, loaded as the module it is. If it throws on load the
     answer is that, not a silent skip. */
  let decodeFeeEvent;
  try {
    ({ decodeFeeEvent } = require(path.join(KOK, "pulse", "fee-event-decoder.cjs")));
  } catch (e) {
    console.log("  Codex cozucusu yuklenemedi: " + e.message);
    process.exit(1);
  }

  console.log("CODEX UCRET COZUCUSU, GERCEK LOGLARA KARSI");
  console.log("  hook  " + D.hook);
  console.log("");

  /* Which of my events does their decoder claim to know? */
  const benimOlaylar = HK.abi.filter((x) => x.type === "event");
  const bilinen = [], bilinmeyen = [];
  for (const e of benimOlaylar) {
    const topic = hI.getEvent(e.name).topicHash;
    try {
      decodeFeeEvent({ topics: [topic, "0x" + "00".repeat(32), "0x" + "00".repeat(32)], data: "0x" + "00".repeat(64) });
      bilinen.push(e.name);
    } catch (err) {
      if (/UNSUPPORTED|UNKNOWN/i.test(err.message)) bilinmeyen.push(e.name);
      else bilinen.push(e.name);   // known layout, rejected the dummy shape
    }
  }
  console.log("  izlenen olaylar:   " + (bilinen.join(", ") || "yok"));
  console.log("  IZLENMEYEN:        " + (bilinmeyen.join(", ") || "yok"));
  console.log("");

  let toplamLog = 0;
  for (const [ad, tx] of Object.entries(ISLEMLER)) {
    const mk = await rpc("eth_getTransactionReceipt", [tx]);
    if (!mk) { ok(false, ad + " makbuzu alinamadi", tx); continue; }
    const loglar = (mk.logs || []).filter((l) => l.address.toLowerCase() === D.hook.toLowerCase());
    console.log("  " + ad + "  blok " + parseInt(mk.blockNumber, 16) +
      ", hook'tan " + loglar.length + " log");

    for (const log of loglar) {
      toplamLog++;
      /* My own decoding, from the contract's ABI. */
      let benim = null;
      try { benim = hI.parseLog({ topics: log.topics, data: log.data }); } catch (e) { /* not ours */ }
      if (!benim) { ok(false, "    kendi ABI'mle cozulemedi", log.topics[0]); continue; }

      /* Theirs. */
      let onlarin = null, hata = null;
      try { onlarin = decodeFeeEvent(log); } catch (e) { hata = e.message; }
      if (!onlarin) { ok(false, "    " + benim.name + ": Codex cozucusu reddetti", hata); continue; }

      ok(onlarin.name === benim.name || onlarin.eventName === benim.name,
        "    " + benim.name + ": olay adi ayni",
        String(onlarin.name || onlarin.eventName));

      /* Every value, compared as a string so a BigInt and a hex string of
         the same number still agree, and so a mismatch prints both. */
      const alanlar = benim.fragment.inputs.map((i) => i.name);
      const onlarinAlanlar = onlarin.fields || onlarin.args || onlarin.values || onlarin;
      let hepsi = true, detay = [];
      for (let i = 0; i < alanlar.length; i++) {
        const ad2 = alanlar[i];
        const bv = benim.args[i];
        const ov = onlarinAlanlar && (onlarinAlanlar[ad2] !== undefined ? onlarinAlanlar[ad2] : onlarinAlanlar[i]);
        const bs = String(bv).toLowerCase();
        const os = ov === undefined || ov === null ? "(yok)" : String(ov).toLowerCase();
        const esit = bs === os;
        if (!esit) hepsi = false;
        detay.push(ad2 + (esit ? "=" : " FARKLI ") + (esit ? os.slice(0, 22) : bs.slice(0, 22) + " vs " + os.slice(0, 22)));
      }
      ok(hepsi, "    " + benim.name + ": TUM ALANLAR ayni cozuldu", detay.join("  "));
    }
  }

  if (toplamLog === 0) {
    console.log("");
    console.log("  Hic log bulunamadi — islem hash'leri yanlis olabilir. Bu bir");
    console.log("  BASARI DEGIL: cozulecek sey yoksa cozucu hakkinda bir sey");
    console.log("  soylenmiyor.");
    process.exit(1);
  }

  console.log("");
  console.log("  " + gecti + " gecti, " + kaldi + " kaldi  (" + toplamLog + " gercek log)");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
