"use strict";
/* ===========================================================================
 * olc-bant-secimi.js — pick the band by measuring it, not by feel.
 *
 *   node scripts/olc-bant-secimi.js
 *
 * There are two numbers in tension and only one pot of tokens to buy them
 * with. A tight band quotes beautifully and runs out fast. A wide band
 * survives real volume and quotes worse. More tokens improve both and cost
 * more of the founder's free holding, permanently.
 *
 * So every option below is run through the REAL Arc PoolManager — the same
 * harness as dene-tekyonlu.js, one eth_call per row, nothing sent — and the
 * table reports what the swap actually returned at each size plus how much
 * buying the band can absorb before it empties. Choosing from this is a
 * judgement; choosing without it would be the same guesswork that put $6 in
 * a full-range pool.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, Interface, keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const coder = AbiCoder.defaultAbiCoder();
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-depth.json"), "utf8"));
const H = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-havuz.json"), "utf8"));
const B = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestTekYonluAcici.json"), "utf8"));

const KOSUM = "0x00000000000000000000000000000000000d3b7a";
const SPACING = 60n;
const Q96 = 2n ** 96n;
const SWAPLAR = [10, 20, 100, 500];

function hamIstek(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(e); }
      });
    });
    r.on("error", rej);
    r.setTimeout(90000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await hamIstek(m, p); await new Promise((x) => setTimeout(x, 500)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 6) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 0) => "$" + nf(x, d);
/* The share of the payment lost to moving the price, which is what a wallet
   puts on the screen: the live pool gives 76.9% on $20 and 62.5% on $10
   against the -76.96% and -62.59% the screenshots showed. */
const cuzdan = (ort, spot) => (1 - spot / ort) * 100;

const iface = new Interface([
  "function run(address pm,uint160 acilisSqrt,int24 alt,int24 ust,uint256 tokenMiktari,uint256 swapTutari) returns (" +
  "(int256 quoteTalep,int256 tokenTalep,uint128 likidite,uint256 artan,uint160 sqrtAcilis," +
  "uint256 odenen,uint256 alinan,uint160 sqrtSonra,uint128 biriktirEklenen))"
]);

(async function main() {
  const slot = keccak256(coder.encode(["bytes32", "uint256"], [H.havuzId, 6]));
  const raw = BigInt(await rpc("eth_call", [{
    to: D.poolManager, data: id("extsload(bytes32)").slice(0, 10) + slot.slice(2)
  }, "latest"]));
  const sqrtCanli = raw & ((1n << 160n) - 1n);
  const pV4 = (Number(sqrtCanli) / Number(Q96)) ** 2;
  const fiyat = (1 / pV4) * 1e12;
  const tickCanli = Math.floor(Math.log(pV4) / Math.log(1.0001));
  const ust = BigInt(Math.floor((tickCanli - 1) / 60)) * SPACING;

  const U = Number(BigInt(H.esik)) / 1e6;
  const T = Number(BigInt(H.havuzToken)) / 1e18;
  const KURUCU_SERBEST = 49_627_550;     // what the founder wallet actually holds

  console.log("BANT SECIMI — her satir GERCEK Arc PoolManager'da kosuldu");
  console.log("  canli fiyat $" + fiyat.toExponential(5) + " / DEPTH, tick " + tickCanli);
  console.log("");
  console.log("  Kiyas: su andaki " + usd(U) + "'lik tam aralik havuz");
  console.log("    " + SWAPLAR.map((d) =>
    usd(d) + " -%" + nf(cuzdan(d / ((T * d) / (U + d)), U / T), 1)).join("   "));
  console.log("");
  console.log("  token   bant          kapasite   " +
    SWAPLAR.map((d) => (usd(d) + " swap").padStart(10)).join("") + "   payin %");
  console.log("  " + "-".repeat(78));

  const secenekler = [
    [10, 50], [10, 100], [20, 100], [30, 100], [30, 200], [45, 200], [45, 400]
  ];

  for (const [tokenM, bantYuzde] of secenekler) {
    const adim = BigInt(Math.round(Math.log(1 + bantYuzde / 100) / Math.log(1.0001) / 60)) * SPACING;
    const alt = ust - adim;
    const tokenHam = BigInt(tokenM) * 10n ** 24n;

    const satir = [];
    let kapasite = 0;
    for (const d of SWAPLAR) {
      let r;
      try {
        r = await rpc("eth_call", [
          { from: KOSUM, to: KOSUM, gas: "0x5000000",
            data: iface.encodeFunctionData("run",
              [D.poolManager, sqrtCanli, alt, ust, tokenHam, BigInt(Math.round(d * 1e6))]) },
          "latest", { [KOSUM]: { code: B.deployedBytecode, nonce: "0x0" } }
        ]);
      } catch (e) { satir.push("REVERT".padStart(10)); continue; }
      const s = iface.decodeFunctionResult("run", r)[0];
      if (BigInt(s[0]) !== 0n) { satir.push("PARA!".padStart(10)); continue; }

      const odenen = Number(BigInt(s[5])) / 1e6;
      const alinan = Number(BigInt(s[6])) / 1e18;
      /* A swap bigger than the band fills only part of the order; that is
         the ceiling showing up as a short fill, and it has to be visible
         rather than averaged away. */
      const eksik = odenen < d * 0.999;
      satir.push(((eksik ? "*" : "") + "-%" + nf(cuzdan(odenen / alinan, fiyat), 2)).padStart(10));

      if (!kapasite) {
        const L = Number(BigInt(s[2]));
        const sa = Math.sqrt(1.0001 ** Number(alt)), sb = Math.sqrt(1.0001 ** Number(ust));
        kapasite = (L * (1 / sa - 1 / sb)) / 1e6;
      }
    }
    console.log("  " + (nf(tokenM) + "M").padStart(5) + "   +%" + nf(bantYuzde).padEnd(10) +
      usd(kapasite).padStart(8) + "   " + satir.join("") +
      "   %" + nf((tokenM * 1e6 / KURUCU_SERBEST) * 100, 0));
  }

  console.log("");
  console.log("  OKUMA");
  console.log("    * isareti: emir bandi tasirdi, kismen doldu. Bandin tavani");
  console.log("      orada gorunuyor — o tutarda alim gelirse havuz susar.");
  console.log("    'kapasite' bant bitene kadar emdigi para. O para havuzda");
  console.log("      kalir ve satislarin karsiligi olur; biz koymuyoruz.");
  console.log("    'payin %' kurucu cuzdanindaki " + nf(KURUCU_SERBEST) + " serbest DEPTH'in");
  console.log("      ne kadarinin KALICI kilitlenecegi. Geri donusu yok.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
