"use strict";
/* ===========================================================================
 * olc-depth-havuz.js — the live DEPTH pool, read from the PoolManager.
 *
 *   node scripts/olc-depth-havuz.js
 *
 * THE DECIMAL CONVERSION, WRITTEN DOWN ONCE
 *   USDC sorts below DEPTH, so currency0 is USDC and currency1 is DEPTH,
 *   and v4's price is amount1/amount0 — DEPTH wei per USDC unit. Turning
 *   that into dollars per DEPTH needs the two scales put back:
 *
 *     p            = (sqrtPriceX96 / 2^96)^2      DEPTH wei per USDC unit
 *     $ per DEPTH  = (1 / p) * 1e18 / 1e6         = (1 / p) * 1e12
 *
 *   The first version of this script divided by 1e12 instead of
 *   multiplying, and reported the pool at $1.5e-29 with a market cap of
 *   zero. The pool was right; the check was wrong by 1e24 — the same class
 *   of error that stranded 300,000,000 tokens, this time in the code doing
 *   the verifying. Hence the derivation sitting here in the file.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const coder = AbiCoder.defaultAbiCoder();
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-depth.json"), "utf8"));
const H = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-havuz.json"), "utf8"));
const sel = (s) => id(s).slice(0, 10);
const Q96 = 2n ** 96n;

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
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await hamIstek(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });

(async function main() {
  const oku = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
  const bal = async (t, w) => BigInt(await oku(t,
    sel("balanceOf(address)") + coder.encode(["address"], [w]).slice(2)));

  /* PoolManager keeps pools at slot 6; slot0 holds sqrtPriceX96 in the low
     160 bits and the tick above it, and slot0+3 holds active liquidity. */
  const s0 = keccak256(coder.encode(["bytes32", "uint256"], [H.havuzId, 6]));
  const ham = BigInt(await oku(PM, "0x1e2eaeaf" + s0.slice(2)));
  const likSlot = "0x" + (BigInt(s0) + 3n).toString(16).padStart(64, "0");
  const L = BigInt(await oku(PM, "0x1e2eaeaf" + likSlot.slice(2))) & ((1n << 128n) - 1n);
  const sq = ham & ((1n << 160n) - 1n);
  const tick = Number(BigInt.asIntN(24, (ham >> 160n) & ((1n << 24n) - 1n)));

  const depthSifirinci = D.token.toLowerCase() < D.usdc.toLowerCase();
  const p = (Number(sq) / Number(Q96)) ** 2;
  /* See the header. DEPTH is currency1 here, so invert then rescale. */
  const fiyat = depthSifirinci ? p / 1e12 : (1 / p) * 1e12;

  const arz = BigInt(await oku(D.token, sel("totalSupply()")));
  const mcap = fiyat * (Number(arz) / 1e18);

  /* Reserves of THIS pool, not the PoolManager's whole balance: what the
     opener put in, less nothing, since the position cannot be withdrawn. */
  const havuzToken = BigInt(H.havuzToken || 0);

  console.log("DEPTH / USDC  —  Uniswap v4, Arc");
  console.log("  poolId          " + H.havuzId);
  console.log("  hook            " + H.hook2);
  console.log("  spacing " + H.spacing + "   fee " + H.fee + "   DEPTH = currency" +
    (depthSifirinci ? "0" : "1"));
  console.log("");
  console.log("  tick            " + tick);
  console.log("  fiyat           $" + fiyat.toExponential(4) + " / DEPTH");
  console.log("  piyasa degeri   $" + nf(mcap));
  console.log("  aktif likidite  " + L.toString());
  console.log("");

  /* The curve the price has to agree with. */
  const x = BigInt(await oku(D.egri, sel("x()")));
  const y = BigInt(await oku(D.egri, sel("y()")));
  const egriFiyat = (Number(x) / 1e6) / (Number(y) / 1e18);
  const sapma = ((fiyat / egriFiyat) - 1) * 100;
  console.log("  ANA EGRI ILE TUTARLILIK");
  console.log("    egri fiyati   $" + egriFiyat.toExponential(4) + "   mcap $" + nf(egriFiyat * 1e9));
  console.log("    havuz fiyati  $" + fiyat.toExponential(4) + "   mcap $" + nf(mcap));
  console.log("    fark          %" + sapma.toFixed(2) +
    (Math.abs(sapma) < 5 ? "   tutarli — ayni token, ayni deger" : "   AYRIK — incele"));
  console.log("");

  /* What a buyer actually gets, which is the only honest measure of depth.
     Constant product on the reserves the position holds. */
  const usdcRez = BigInt(H.esik);
  console.log("  BIR ALICI NE ALIR  (sabit carpim, " +
    "$" + nf(Number(usdcRez) / 1e6, 2) + " + " + nf(Number(havuzToken) / 1e18) + " DEPTH)");
  if (havuzToken > 0n) {
    const U = Number(usdcRez) / 1e6, T = Number(havuzToken) / 1e18;
    console.log("    odenen     alinan DEPTH     ortalama fiyat    kayma");
    for (const d of [0.5, 1, 2, 5, 25, 100]) {
      const out = (T * d) / (U + d);
      const ort = d / out;
      console.log("    $" + String(d).padStart(6) + "   " + nf(out).padStart(13) +
        "   $" + ort.toExponential(2).padStart(13) + "   %" + nf((ort / fiyat - 1) * 100).padStart(7));
    }
  }
  console.log("");
  console.log("  ARZ  " + nf(Number(arz) / 1e18) + "   (1 milyardan " +
    nf(1e9 - Number(arz) / 1e18) + " yakildi)");
  console.log("");
  console.log("  Havuz pozisyonu CEKILEMEZ: acicida withdraw yok, hook her");
  console.log("  cikarmayi geri cevirir. Her islemin %0,20'si geri yatiyor ve");
  console.log("  alicinin USDC'si havuzda kaliyor, yani derinlik yalniz artabilir.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
