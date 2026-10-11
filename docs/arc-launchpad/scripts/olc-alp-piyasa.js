"use strict";
/* ===========================================================================
 * olc-alp-piyasa.js — ALP's two pools, and what a buyer can actually buy.
 *
 *   node scripts/olc-alp-piyasa.js
 *
 * THE QUESTION THIS ANSWERS
 *   "When somebody buys $1000 of ALP, does it come out of the 300,000,000?"
 *   It does not, and the reason is worth having written down rather than
 *   re-derived: the 300,000,000 is in a different pool, at a different fee
 *   tier and tick spacing, priced at $1,500,000 per token by the decimals
 *   mistake that put it there. Its book is shut. Nobody will ever buy from
 *   it, and nothing can ever be sold into it either, because it holds no
 *   USDC to pay anyone with.
 *
 *   So every purchase lands in the second pool — and that is where the real
 *   finding is. The second pool's entire inventory is worth about a hundred
 *   dollars. A $1000 buyer cannot be filled: they would take every token in
 *   the book and the rest of their money would have nothing to buy.
 *
 * WHY THE DEPTH IS THAT SMALL
 *   It is not the number of tokens, it is the price they were placed at.
 *   10,000,000 ALP at a $1,500 market cap on a 1,000,000,000 supply is
 *   $0.0000015 a token — about fifteen dollars of value. The band stretches
 *   that to roughly a hundred. Ten times the tokens would still be a
 *   hundred-dollar book; ten times the opening price would be a
 *   thousand-dollar one.
 *
 * ORIENTATION
 *   USDC (0x36…) sorts below ALP (0xFe…), so currency0 is USDC and
 *   currency1 is ALP. A token-only position in currency1 sits below the
 *   current price, and buying ALP walks sqrtPrice down. USDC has 6 decimals
 *   and ALP has 18; nothing here assumes a shared scale.
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
const ARZ = 1e9;

/* The first lock is an older build with no havuzId(), so its pool is
   recorded here from the manifest it was deployed with. */
const HAVUZLAR = [
  { ad: "kilit #1 — 300.000.000", kilit: "0x1d0e7843b88C9ba39BB6A04765c89619C34Ef942",
    id: "0x0275384507fc670672c4df902e0ba39901824232213a218102270c0084d9d266",
    alt: 93120, ust: 134100, spacing: 60,
    not: "yanlis ondalik varsayimiyla acildi" },
  { ad: "kilit #2 — 10.000.000", kilit: G.alpLocker, id: G.alpPoolId,
    alt: G.alpBantAlt, ust: G.alpBantUst, spacing: G.alpPoolSpacing,
    not: "sitenin ve router'in kullandigi havuz" }
];

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

function isqrt(n) { if (n < 2n) return n; let x = n, y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; }
const Q96 = 2n ** 96n;
function sqrtAtTick(t0) {
  const neg = t0 < 0; let t = BigInt(neg ? -t0 : t0);
  let o = isqrt((10001n * (1n << 256n)) / 10000n), s = 1n << 128n;
  while (t > 0n) { if (t & 1n) s = (s * o) >> 128n; o = (o * o) >> 128n; t >>= 1n; }
  return neg ? (((1n << 128n) * (1n << 128n) / s) >> 32n) : (s >> 32n);
}
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });

(async function main() {
  const durumlar = [];
  for (const h of HAVUZLAR) {
    const s0 = keccak256(coder.encode(["bytes32", "uint256"], [h.id, 6]));
    const a = BigInt(await rpc("eth_call", [{ to: PM, data: "0x1e2eaeaf" + s0.slice(2) }, "latest"]));
    const ls = "0x" + (BigInt(s0) + 3n).toString(16).padStart(64, "0");
    const L = BigInt(await rpc("eth_call", [{ to: PM, data: "0x1e2eaeaf" + ls.slice(2) }, "latest"])) & ((1n << 128n) - 1n);
    const sq = a & ((1n << 160n) - 1n);
    const tick = Number(BigInt.asIntN(24, (a >> 160n) & ((1n << 24n) - 1n)));
    const sA = sqrtAtTick(h.alt);
    const alp = L > 0n && sq > sA ? (L * (sq - sA)) / Q96 : 0n;
    const usdc = L > 0n && sq > sA ? (L * (sq - sA) * Q96) / (sq * sA) : 0n;
    const fiyat = 1 / (((Number(sq) / Number(Q96)) ** 2) / 1e12);
    durumlar.push({ ...h, sq, tick, L, sA, alp, usdc, fiyat });
  }

  console.log("ALP'NIN IKI HAVUZU — zincirden okundu");
  console.log("");
  for (const p of durumlar) {
    console.log("  " + p.ad + "        " + p.not);
    console.log("    havuz            " + p.id.slice(0, 18) + "…   spacing " + p.spacing);
    console.log("    tick             " + p.tick + "   (bant " + p.alt + " .. " + p.ust + ")");
    console.log("    fiyat            $" + p.fiyat.toExponential(4) + " / ALP");
    console.log("    piyasa degeri    $" + (p.fiyat * ARZ).toExponential(4));
    console.log("    satin alinabilir " + (p.L === 0n
      ? "0 — aktif likidite yok, kitap kapali"
      : nf(Number(p.alp) / 1e18) + " ALP"));
    console.log("    kitabin tamami   $" + nf(Number(p.usdc) / 1e6, 2));
    console.log("");
  }

  const canli = durumlar.reduce((a, b) => (b.usdc > a.usdc ? b : a));
  const derinlik = Number(canli.usdc) / 1e6;

  console.log("  BIR ALICI NE ALABILIR");
  console.log("  Her alim " + canli.ad.split("—")[0].trim() + " havuzuna gidiyor; digerinin kitabi kapali.");
  console.log("");
  console.log("    ODENEN      ALINAN ALP        DOLAN KISIM   KALAN PARA");
  for (const usd of [1, 10, 50, 115, 250, 1000]) {
    const istenen = BigInt(Math.round(usd * 1e6));
    if (istenen >= canli.usdc) {
      const dolan = derinlik;
      console.log("    $" + String(usd).padStart(6) + "   " +
        nf(Number(canli.alp) / 1e18).padStart(12) + " ALP   " +
        ("$" + nf(dolan, 2)).padStart(12) + "   " +
        ("$" + nf(usd - dolan, 2)).padStart(11) + "  <- kitap bitti, gerisi ALINAMAZ");
      continue;
    }
    /* Walking sqrtPrice down by the USDC put in:
       sqrtB = L*sqrtA / (L + usdc*sqrtA/Q96) */
    const pay = canli.L * canli.sq;
    const bol = canli.L + (istenen * canli.sq) / Q96;
    const sqB = pay / bol;
    const alinan = (canli.L * (canli.sq - sqB)) / Q96;
    console.log("    $" + String(usd).padStart(6) + "   " +
      nf(Number(alinan) / 1e18).padStart(12) + " ALP   " +
      ("$" + nf(usd, 2)).padStart(12) + "   " + "$0.00".padStart(11));
  }

  console.log("");
  console.log("  TESHIS");
  console.log("    Piyasanin tamami $" + nf(derinlik, 2) + ". Sorun token sayisi degil,");
  console.log("    konuldugu fiyat: 1.000.000.000 arzda $1.500 piyasa degeri demek");
  console.log("    token basina $0,0000015 — 10.000.000 token ~$15 eder.");
  console.log("    10 kat token yine yuz dolarlik kitap olur; 10 kat fiyat");
  console.log("    bin dolarlik kitap olur.");

  const bakiye = async (w) => BigInt(await rpc("eth_call", [{
    to: D.usdc, data: "0x70a08231" + coder.encode(["address"], [w]).slice(2) }, "latest"]));
  const haz = await bakiye(D.hazine);
  const dev = await bakiye(G.devPool);
  console.log("");
  console.log("    Hazine  $" + nf(Number(haz) / 1e6, 2) + "      DevPool  $" + nf(Number(dev) / 1e6, 2));
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
