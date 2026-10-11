"use strict";
/* ===========================================================================
 * denetim-dagitim.js — is what is on Arc the code that was tested?
 *
 *   node scripts/denetim-dagitim.js
 *
 * WHY
 *   The suite runs against the real Arc PoolManager, but it runs the
 *   contracts through state override — it injects build/*.json bytecode at
 *   an address and calls it. That proves the BUILD is correct. It says
 *   nothing about whether the build is what actually got deployed.
 *
 *   Those are different claims and the gap between them is where a
 *   deployment goes wrong quietly. This run had one: dagit.js passed a
 *   stale six-address constructor list to a three-argument constructor, so
 *   the hook went live with the launchpad's address in its `quote` slot.
 *   Every check the deploy script had passed, because none of them compared
 *   the deployed contract to the compiled one or asked what the immutables
 *   say.
 *
 * WHAT IS COMPARED, AND WHY NOT A PLAIN HASH
 *   Runtime bytecode carries immutables inline, so a deployed contract's
 *   code differs from build/*.json's deployedBytecode at exactly the bytes
 *   holding the immutable values — and nowhere else. So:
 *
 *     1. the lengths must match exactly
 *     2. every byte must match except inside the immutable windows, which
 *        solc reports in `immutableReferences`
 *     3. the immutables are then read through their own getters and
 *        checked against what the deployment intended
 *
 *   A plain keccak comparison would fail on every contract with an
 *   immutable, which is all of them, and a "mostly matches" comparison
 *   would hide a one-byte change in a jump target. This reports the exact
 *   differing offsets and whether each one is accounted for.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";

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
        await new Promise((s) => setTimeout(s, 1200 * (d + 1))); continue;
      }
      throw new Error(j.error.message);
    }
    return j.result;
  }
  throw new Error("rate limit: 6 denemede gecilemedi");
}

const B = (ad) => JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));

/* The three comparison helpers used to live here and now live in
   degismezlik.js, so this audit and denetim-dagitim-pulse.js run the SAME
   comparison. Every hardening comment inside them records a false GREEN
   that got through once — an empty buffer compared against an empty
   buffer, a fractional immutable window, a one-sided metadata mask. A
   second copy would be a second place for all three to come back. */
const { karsilastir, degismezPencereler } = require("./degismezlik.js");

let gecti = 0, kaldi = 0;
const ok = (kosul, ad, not) => {
  if (kosul) { gecti++; console.log("  OK   " + ad + (not ? "   " + not : "")); }
  else { kaldi++; console.log("  KALDI " + ad + (not ? "   " + not : "")); }
};

(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim.json"), "utf8"));
  console.log("DAGITIM DENETIMI");
  console.log("  rpc        " + RPC);
  console.log("  dagitim    " + D.zaman);
  console.log("");

  /* WHICH CHAIN. Pinning reads to a block number says nothing about
     which chain that number is on; an RPC pointed somewhere else would
     answer every call and the report would describe the wrong network. */
  const zincirId = parseInt(await rpc("eth_chainId", []), 16);
  ok(zincirId === D.chainId, "zincir " + D.chainId + " (dagitim.json ile ayni)",
    "okunan " + zincirId);
  if (zincirId !== D.chainId) {
    console.log("");
    console.log("  YANLIS ZINCIR — denetim durduruldu.");
    process.exit(1);
  }

  const blok = await rpc("eth_blockNumber", []);
  /* The hash of the pinned block, read now and read again at the end. If
     it changes, the reads either side of the change describe two
     different chain states and must not be reported as one. */
  const blokBasi = (await rpc("eth_getBlockByNumber", [blok, false]) || {}).hash;
  console.log("  blok " + parseInt(blok, 16) + " (okumalar buraya sabitlendi)");
  console.log("  hash " + String(blokBasi).slice(0, 18) + "…");
  console.log("");

  /* ---- 1. is the deployed code the compiled code? ------------------ */
  const hedefler = [
    { ad: "ArcLaunchHook", adres: D.hook },
    { ad: "Launchpad", adres: D.launchpad }
  ];

  /* The grader was deployed by the launchpad's own constructor, so its
     address is read from the launchpad rather than from the file — a file
     entry could be stale, the chain cannot. */
  /* THE GRADER IS A REQUIRED TARGET, NOT AN OPTIONAL ONE.

     This used to catch and log. If the read failed, TeminatKarnesi fell
     out of the target list, its getters and its opcode scan never ran,
     and the script still exited with kaldi = 0 — a pass. That is the
     defect this whole session has been chasing in other people's code:
     UNREADABLE IS NOT CLEAN. A target the audit is supposed to check and
     could not reach is a failed audit, not a shorter one. */
  const lI = new Interface(B("Launchpad").abi);
  let karneAdres = null;
  try {
    karneAdres = lI.decodeFunctionResult("karne", await rpc("eth_call",
      [{ to: D.launchpad, data: lI.encodeFunctionData("karne", []) }, blok]))[0];
  } catch (e) {
    ok(false, "karne adresi OKUNAMADI — denetim eksik kaldi", e.message.slice(0, 60));
  }
  if (karneAdres && karneAdres !== "0x0000000000000000000000000000000000000000") {
    hedefler.push({ ad: "TeminatKarnesi", adres: karneAdres });
  } else if (karneAdres) {
    ok(false, "karne adresi SIFIR — launchpad kendi karnesini kurmamis", String(karneAdres));
  }

  for (const h of hedefler) {
    const y = B(h.ad);
    const zincir = await rpc("eth_getCode", [h.adres, blok]);
    const p = degismezPencereler(y);
    let r;
    try { r = karsilastir(y.deployedBytecode, zincir, p); }
    catch (e) { ok(false, h.ad + " KARSILASTIRILAMADI", e.message); continue; }
    if (r.uzunlukFarki) {
      ok(false, h.ad + " ZINCIRDEKI KOD DERLENENLE AYNI BOYUTTA DEGIL",
        r.uzunlukFarki[0] + " vs " + r.uzunlukFarki[1] + " bayt");
      continue;
    }
    ok(r.hesapsiz.length === 0,
      h.ad + " CALISAN KOD = DERLENEN KOD",
      r.uzunluk.toLocaleString("en-US") + " bayt, " + r.hesapli.length +
      " bayt degismez degeri (" + r.pencereSayisi + " pencere), " +
      (r.hesapsiz.length ? "HESAPSIZ FARK: " + r.hesapsiz.slice(0, 8).join(",") : "hesapsiz fark yok"));
    /* Reported whether or not it differs, so "same source" is a stated
       result and not an absence of output. */
    /* The mask is only trustworthy when both sides agreed; when it was not
       applied, say so, because then any difference there is already in
       hesapsiz and the check above has failed on it. */
    ok(true, "  " + h.ad + " kaynak revizyonu",
      !r.metaMaskeUygulandi
        ? "metadata maskesi UYGULANMADI (" + r.metaMaskeNedeni + ") — " +
          "bu bolgedeki her fark GERCEK sayildi"
        : r.metaFark.length === 0
          ? "metadata ayni — dagitilan, bu kaynaktan derlendi"
          : r.metaFark.length + " bayt metadata farki: CALISAN KOD AYNI, kaynak " +
            "revizyonu FARKLI (yorum/bicim degisikligi dagitimdan sonra yapilmis)");
  }

  /* ---- 2. do the immutables say what the deployment intended? ------ */
  console.log("");
  const hI = new Interface(B("ArcLaunchHook").abi);
  const tI = new Interface(B("TeminatKarnesi").abi);
  const al = async (ifc, adres, fn) => String(ifc.decodeFunctionResult(
    fn, await rpc("eth_call", [{ to: adres, data: ifc.encodeFunctionData(fn, []) }, blok]))[0]);

  const bekle = [
    ["hook.poolManager", hI, D.hook, "poolManager", D.poolManager],
    ["hook.launchpad", hI, D.hook, "launchpad", D.launchpad],
    ["hook.quote", hI, D.hook, "quote", D.usdc],
    ["lp.hook", lI, D.launchpad, "hook", D.hook],
    ["lp.quote", lI, D.launchpad, "quote", D.usdc],
    ["lp.poolManager", lI, D.launchpad, "poolManager", D.poolManager],
    ["lp.protocolSink", lI, D.launchpad, "protocolSink", D.protocolSink],
    ["lp.devSink", lI, D.launchpad, "devSink", "0x0000000000000000000000000000000000000000"]
  ];
  if (karneAdres) {
    bekle.push(["karne.launchpad", tI, karneAdres, "launchpad", D.launchpad]);
    bekle.push(["karne.gercekPara", tI, karneAdres, "gercekPara", D.usdc]);
  }
  for (const [ad, ifc, adres, fn, hedef] of bekle) {
    let v; try { v = await al(ifc, adres, fn); } catch (e) { v = "OKUNAMADI"; }
    ok(v.toLowerCase() === String(hedef).toLowerCase(), ad, v);
  }

  /* ---- 3. the hook's address has to declare its callbacks --------- */
  console.log("");
  const bitler = parseInt(D.hook.slice(-4), 16) & 0x3fff;
  ok(bitler === 0xa44, "hook adresi callback'lerini bildiriyor",
    "0x" + bitler.toString(16) + " — beforeAddLiquidity, beforeRemoveLiquidity, afterSwap, afterSwapReturnDelta");

  /* ---- 4. no privileged call is left ----------------------------- */
  console.log("");
  let kuyruk = null;
  try { kuyruk = await al(lI, D.launchpad, "queue"); } catch (e) { /* reported */ }
  ok(kuyruk && kuyruk.toLowerCase() === "0x000000000000000000000000000000000000dead",
    "setQueue YAKILDI — son ayricalikli fonksiyon kapandi",
    String(kuyruk) + "  (queue != 0 oldugu icin setQueue artik QueueAlreadySet atiyor)");

  /* And the ABI half of the same claim: nothing with a key in it. */
  for (const ad of ["Launchpad", "ArcLaunchHook", "CollateralVault", "TeminatKarnesi"]) {
    const abi = B(ad).abi.filter((f) => f.type === "function");
    const kacis = abi.filter((f) => /^(owner|transferOwnership|renounce|setAdmin|pause|unpause|upgrade|initialize|rescue|sweepTo|withdraw)/i.test(f.name || ""));
    ok(kacis.length === 0, ad + " ABI'sinde sahip/duraklatma/yukseltme/cekme YOK",
      kacis.length ? kacis.map((f) => f.name).join(", ") : abi.length + " fonksiyon tarandi");
  }

  /* ---- 5. and the bytecode half ---------------------------------- */
  console.log("");
  const { denetle, OPCODES } = require("./degismezlik.js");
  for (const h of hedefler) {
    const zincir = await rpc("eth_getCode", [h.adres, blok]);
    const gomulu = h.ad === "Launchpad"
      ? ["LaunchToken", "CollateralVault", "Vesting", "TeminatKarnesi"].map((g) => ({ ad: g, kod: B(g).bytecode }))
      : [];
    const d = denetle(zincir, gomulu, OPCODES);
    const kotu = d.gercek.filter((f) => !(h.ad === "Launchpad" && f.ad === "CREATE"));
    ok(kotu.length === 0,
      h.ad + " ZINCIRDE DE DEGISTIRILEMEZ",
      kotu.length ? kotu.map((f) => f.ad + "@" + f.ofset).join(", ")
        : d.komut.toLocaleString("en-US") + " komut tarandi, yukseltme komutu yok");
  }

  /* Re-read the pinned block. Everything above was answered at that
     height; if the chain reorganised under it, the answers are not all
     from the same state and saying "22 gecti" would be describing a
     history that no longer exists. */
  {
    const blokSonu = (await rpc("eth_getBlockByNumber", [blok, false]) || {}).hash;
    ok(blokBasi && blokSonu && blokBasi === blokSonu,
      "sabitlenen blok denetim boyunca DEGISMEDI",
      blokBasi === blokSonu ? String(blokBasi).slice(0, 18) + "…"
        : "REORG: " + String(blokBasi).slice(0, 14) + "… -> " + String(blokSonu).slice(0, 14) + "…");
  }

  console.log("");
  console.log("  " + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
