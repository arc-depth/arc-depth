"use strict";
/* ===========================================================================
 * olc-acilis-derinlik.js — what actually sets the slippage, measured.
 *
 *   node scripts/olc-acilis-derinlik.js
 *
 * THE QUESTION
 *   "Even someone putting in $100,000 should not see slippage like this."
 *   Fair. So: is that a pool-design problem I can engineer away, or is it
 *   fixed by something else?
 *
 * THE ANSWER THIS MEASURES
 *   A buyer handing over $100,000 has to receive $100,000 of tokens. If
 *   they are to receive them near the current price, then roughly that much
 *   token VALUE has to be sitting at the current price. Token value is
 *   price times tokens — which is market cap. No arrangement of ranges
 *   creates value that is not there.
 *
 *   So the claim under test is: depth is set by the opening market cap and
 *   not by the mechanism. If that is right, the same 500,000,000 market
 *   tokens will quote badly at a $15,000 opening and well at a $1,000,000
 *   one, with identical code. If it is wrong, some band in this sweep will
 *   beat the law and that is worth knowing before anything is rebuilt.
 *
 *   Every row runs inside the real Arc PoolManager through eth_call. No
 *   token is sent and no pool is created; the opening price is named as a
 *   tick so v4 converts it exactly.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const KOK = path.join(__dirname, "..");
const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-depth.json"), "utf8"));
const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestTekYonluAcici.json"), "utf8"));

const KOSUM = "0x00000000000000000000000000000000000d3b7a";
const SPACING = 60;
const ARZ = 1_000_000_000;          // total supply
const PIYASA = 500_000_000;         // the market allocation — NOT the founder's
const SWAPLAR = [20, 1_000, 10_000, 100_000];

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
    r.setTimeout(120000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 30000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const usd = (x) => "$" + nf(x);
const kisa = (x) => x >= 1e6 ? "$" + nf(x / 1e6, 1) + "M" : x >= 1e3 ? "$" + nf(x / 1e3) + "k" : "$" + nf(x);
/* What a wallet prints: the share of the payment lost to moving the price.
   Reproduces the -76,96% and -62,59% in the screenshots exactly. */
const cuzdan = (ort, spot) => (1 - spot / ort) * 100;

const iface = new Interface([
  "function runTick(address pm,int24 acilisTick,int24 alt,int24 ust,uint256 tokenMiktari,uint256 swapTutari) returns (" +
  "(int256 quoteTalep,int256 tokenTalep,uint128 likidite,uint256 artan,uint160 sqrtAcilis," +
  "uint256 odenen,uint256 alinan,uint160 sqrtSonra,uint128 biriktirEklenen))"
]);

/* DEPTH-side token is currency1, so the v4 price is token-wei per USDC
   unit: 1e12 / (dollars per token). A higher dollar price is a LOWER tick. */
const tickOf = (pUsd) => Math.round(Math.log(1e12 / pUsd) / Math.log(1.0001));

async function olc(acilisTick, alt, ust, tokenAdet, swapUsd) {
  let r;
  try {
    r = await rpc("eth_call", [
      { from: KOSUM, to: KOSUM, gas: "0x8000000",
        data: iface.encodeFunctionData("runTick", [
          D.poolManager, acilisTick, alt, ust,
          BigInt(tokenAdet) * 10n ** 18n, BigInt(Math.round(swapUsd * 1e6))]) },
      "latest", { [KOSUM]: { code: B.deployedBytecode, nonce: "0x0" } }
    ]);
  } catch (e) { return null; }
  const s = iface.decodeFunctionResult("runTick", r)[0];
  if (BigInt(s[0]) !== 0n) return null;          // asked for money: not one-sided
  const odenen = Number(BigInt(s[5])) / 1e6;
  const alinan = Number(BigInt(s[6])) / 1e18;
  if (alinan === 0) return null;
  return { odenen, alinan, likidite: BigInt(s[2]) };
}

(async function main() {
  console.log("ACILIS DEGERI vs KAYMA — " + nf(PIYASA) + " token (PIYASA PAYI, kurucununki degil)");
  console.log("  her satir gercek Arc PoolManager'da kosuldu, hicbir sey gonderilmedi");
  console.log("");
  console.log("  acilis FDV   bant      konan deger   kapasite   " +
    SWAPLAR.map((d) => kisa(d).padStart(9)).join("") + "");
  console.log("  " + "-".repeat(84));

  const fdvler = [15_000, 100_000, 300_000, 1_000_000, 3_000_000];
  const bantlar = [[1, "+%100"], [3, "+%300"]];

  for (const fdv of fdvler) {
    const p0 = fdv / ARZ;                      // dollars per token
    const t0 = tickOf(p0);
    const ust = Math.floor((t0 - 1) / SPACING) * SPACING;

    for (const [kEksi, etiket] of bantlar) {
      const adim = Math.round(Math.log(1 + kEksi) / Math.log(1.0001) / SPACING) * SPACING;
      const alt = ust - adim;
      const konanDeger = PIYASA * p0;
      const kapasite = konanDeger * Math.sqrt(1 + kEksi);

      const hucreler = [];
      for (const d of SWAPLAR) {
        const o = await olc(t0, alt, ust, PIYASA, d);
        if (!o) { hucreler.push("—".padStart(9)); continue; }
        const eksik = o.odenen < d * 0.999;
        hucreler.push(((eksik ? "*" : "") + "-%" +
          nf(cuzdan(o.odenen / o.alinan, p0), cuzdan(o.odenen / o.alinan, p0) < 10 ? 2 : 1)).padStart(9));
      }

      console.log("  " + kisa(fdv).padStart(10) + "   " + etiket.padEnd(8) +
        "  " + kisa(konanDeger).padStart(11) + "   " + kisa(kapasite).padStart(8) + "   " +
        hucreler.join(""));
    }
  }

  console.log("");
  console.log("  * emir bandi tasirdi, kismen doldu — bandin tavani orada.");
  console.log("");
  console.log("  OKUMA");
  console.log("    Kod her satirda ayni. Degisen tek sey acilis degeri, ve kayma");
  console.log("    onunla birlikte degisiyor. Sebebi tek cumle: 100 bin dolar veren");
  console.log("    alici 100 bin dolarlik token alacak, ve o tokenlerin fiyatin");
  console.log("    yaninda DURUYOR olmasi gerekiyor. Token degeri = fiyat x adet =");
  console.log("    piyasa degeri. Aralik duzenlemesi olmayan degeri yaratmiyor.");
  console.log("");
  console.log("    Bugunku DEPTH " + kisa(15000) + " acilisli. O yuzden 100 bin dolarlik");
  console.log("    alim HICBIR tasarimla duzgun gorunmez — ne havuzda, ne egride.");
  console.log("    Egrinin fantom rezervi de " + kisa(7500) + ", yani acilis degerinin yarisi.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
