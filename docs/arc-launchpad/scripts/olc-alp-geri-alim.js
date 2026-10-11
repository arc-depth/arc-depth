"use strict";
/* ===========================================================================
 * olc-alp-geri-alim.js — what would it cost to buy the founder's locked
 *                        9,369,988 ALP back off the market?
 *
 *   node scripts/olc-alp-geri-alim.js
 *
 * WHY THIS IS A MEASUREMENT AND NOT AN OPINION
 *   The question "top my slice back up from the treasury" has three numbers
 *   in it and all three are knowable: what the treasury holds, what the pool
 *   would charge, and what the price does on the way. Guessing any of them
 *   would be how somebody commits to a plan that turns out to cost a
 *   hundred times what they thought.
 *
 *   The pool is one-sided and bounded: ticks 369480..410430, all of it ALP,
 *   no USDC. Every purchase walks the price toward the band's floor and the
 *   last tokens cost far more than the first, so an average price is
 *   meaningless here. This reports the curve.
 *
 * ORIENTATION
 *   USDC (0x36…) sorts below ALP (0xFe…), so currency0 is USDC and
 *   currency1 is ALP. A token-only position in currency1 sits BELOW the
 *   current price, which is what AlpLocker enforces, and buying ALP walks
 *   sqrtPrice down — zeroForOne, USDC in, ALP out.
 *
 *   With 6-decimal USDC against 18-decimal ALP, nothing here is allowed to
 *   assume a shared scale. That assumption is what locked the 300,000,000
 *   in the first place.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, keccak256 } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const coder = AbiCoder.defaultAbiCoder();

const G = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-yonetisim.json"), "utf8"));
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim.json"), "utf8"));

function ham(method, params) {
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
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 900)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}

/* ---- integer sqrt, so no price goes through a float ----------------- */
function isqrt(n) {
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}
const Q96 = 2n ** 96n;

/* sqrt(1.0001^tick) * 2^96, by squaring in fixed point. The published
   constants would be shorter; this is derived so there is nothing to
   mistype. */
function sqrtAtTick(tick) {
  const neg = tick < 0;
  let t = BigInt(neg ? -tick : tick);
  /* sqrt(1.0001) in Q128, computed once from the integer sqrt of 1.0001<<256 */
  let oran = isqrt((10001n * (1n << 256n)) / 10000n);   // Q128
  let sonuc = 1n << 128n;
  while (t > 0n) {
    if (t & 1n) sonuc = (sonuc * oran) >> 128n;
    oran = (oran * oran) >> 128n;
    t >>= 1n;
  }
  /* Q128 -> Q96 */
  if (neg) return ((1n << 128n) * (1n << 128n) / sonuc) >> 32n;
  return sonuc >> 32n;
}

(async function main() {
  const slot0 = keccak256(coder.encode(["bytes32", "uint256"], [G.alpPoolId, 6]));
  const bir = await rpc("eth_call", [{
    to: PM,
    data: "0x1e2eaeaf" + slot0.slice(2)     // extsload(bytes32)
  }, "latest"]);
  const likSlot = "0x" + (BigInt(slot0) + 3n).toString(16).padStart(64, "0");
  const iki = await rpc("eth_call", [{ to: PM, data: "0x1e2eaeaf" + likSlot.slice(2) }, "latest"]);

  const ham0 = BigInt(bir);
  const sqrtSimdi = ham0 & ((1n << 160n) - 1n);
  const tickSimdi = BigInt.asIntN(24, (ham0 >> 160n) & ((1n << 24n) - 1n));
  const L = BigInt(iki) & ((1n << 128n) - 1n);

  const sqrtAlt = sqrtAtTick(G.alpBantAlt);
  const sqrtUst = sqrtAtTick(G.alpBantUst);

  /* ALP is currency1, so the price here is ALP-wei per USDC-unit: a price
     going DOWN means ALP getting more expensive. */
  const fiyat = (sq) => {
    const p = (Number(sq) / Number(Q96)) ** 2;      // ALP wei per USDC unit
    const alpPerUsdc = p / 1e12;                     // 1e18 wei / 1e6 units
    return 1 / alpPerUsdc;                           // USDC per ALP
  };
  const mcap = (sq) => fiyat(sq) * 1e9;

  console.log("ALP/USDC HAVUZU — ZINCIRDEN");
  console.log("  poolId          " + G.alpPoolId);
  console.log("  likidite        " + L.toString());
  console.log("  simdiki tick    " + tickSimdi + "   (bant " + G.alpBantAlt + " .. " + G.alpBantUst + ")");
  console.log("  simdiki fiyat   $" + fiyat(sqrtSimdi).toExponential(4) + " / ALP");
  console.log("  piyasa degeri   $" + mcap(sqrtSimdi).toLocaleString("en-US", { maximumFractionDigits: 0 }));
  console.log("");

  if (L === 0n) { console.log("  havuzda likidite yok — olculecek bir sey yok."); return; }

  /* amount1 (ALP) released walking sqrtPrice from a down to b:  L*(a-b)
     amount0 (USDC) required for the same walk:  L*(a-b)/(a*b) in Q96 */
  const alpArasi = (sqA, sqB) => (L * (sqA - sqB)) / Q96;
  const usdcArasi = (sqA, sqB) => (L * (sqA - sqB) * Q96) / (sqA * sqB);

  const kalanAlp = alpArasi(sqrtSimdi, sqrtAlt);
  const hepsiUsdc = usdcArasi(sqrtSimdi, sqrtAlt);

  console.log("  BANTTA KALAN ALP   " + (Number(kalanAlp) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 }));
  console.log("  hepsini almak      $" + (Number(hepsiUsdc) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  console.log("  bant dibindeki fiyat  $" + fiyat(sqrtAlt).toExponential(4) +
    " / ALP   (mcap $" + mcap(sqrtAlt).toLocaleString("en-US", { maximumFractionDigits: 0 }) + ")");
  console.log("");

  /* The curve, because an average price would hide the whole problem. */
  console.log("  NE KADAR ALP        MALIYET        ORTALAMA/ALP     SONRAKI FIYAT    MCAP");
  const hedefler = [100_000, 500_000, 1_000_000, 2_000_000, 4_000_000, 6_000_000, 8_000_000, 9_369_988];
  for (const h of hedefler) {
    const istenen = BigInt(h) * 10n ** 18n;
    if (istenen > kalanAlp) {
      console.log("  " + h.toLocaleString("en-US").padStart(12) + "        bantta bu kadar yok");
      continue;
    }
    /* sqrtB = sqrtA - istenen*Q96/L */
    const sqrtB = sqrtSimdi - (istenen * Q96) / L;
    const maliyet = usdcArasi(sqrtSimdi, sqrtB);
    const usd = Number(maliyet) / 1e6;
    console.log("  " + h.toLocaleString("en-US").padStart(12) +
      "   $" + usd.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(12) +
      "   $" + (usd / h).toExponential(3).padStart(12) +
      "   $" + fiyat(sqrtB).toExponential(3).padStart(12) +
      "   $" + mcap(sqrtB).toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(14));
  }

  /* ---- and what is actually available to spend --------------------- */
  const bakiye = async (who) => BigInt(await rpc("eth_call", [{
    to: D.usdc,
    data: "0x70a08231" + coder.encode(["address"], [who]).slice(2)
  }, "latest"]));
  const haz = await bakiye(D.hazine);
  const dev = await bakiye(G.devPool);

  console.log("");
  console.log("  KASADA OLAN");
  console.log("    Hazine (protokol ucreti)   $" + (Number(haz) / 1e6).toFixed(2));
  console.log("    DevPool (gelistirici)      $" + (Number(dev) / 1e6).toFixed(2));
  console.log("    toplam                     $" + (Number(haz + dev) / 1e6).toFixed(2));
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
