"use strict";
/* ===========================================================================
 * olc-fiyat-egrisi.js — what the price does as people buy.
 *
 *   node scripts/olc-fiyat-egrisi.js
 *   node scripts/olc-fiyat-egrisi.js --havuz 3000 --yatirim 500
 *
 * The design says a launch opens at a $1,500 market cap, that 30% of the
 * supply sits in a band reaching sixty times that, and that the buyers'
 * money stays in the pool as the bid for whoever sells next. Those are
 * claims about a curve. This draws it from measurements, against the real
 * Arc PoolManager, through eth_call — no transaction, no gas.
 *
 * WHAT TO READ IN THE OUTPUT
 *   The market cap column is the whole point: it says what each additional
 *   dollar does to the price, and it is steep at the start for the same
 *   reason any thin book is. The USDC column is the one people forget —
 *   that money cannot be withdrawn by anybody, so it is the floor under the
 *   market price, rising on its own as the thing gets used.
 *
 * The 0.50% fee is not applied here. It comes off the output after the
 * swap, so it changes what a buyer receives and not the price path: take
 * half a percent off every token figure.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface, AbiCoder } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const YABANCI = "0x2222222222222222222222222222222222222222";
const H = "0x00000000000000000000000000000000000000E9";

const arg = (ad, v) => {
  const i = process.argv.indexOf(ad);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : v;
};
const HAVUZ_BPS = BigInt(arg("--havuz", "3000"));
const YATIRIM = Number(arg("--yatirim", "500"));   // dollars of collateral

const ARZ = 10n ** 9n * 10n ** 18n;
const coder = AbiCoder.defaultAbiCoder();

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
    r.setTimeout(60000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let bekle = 2000;
  for (let i = 0; ; i++) {
    try { return await ham(m, p); }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 30000);
    }
  }
}

/* The market price, from the pool's own sqrtPriceX96, scaled against the
   opening — which is known exactly, because every launch opens at $1,500.

   Dividing total spend by total tokens would give the buyer's AVERAGE cost
   instead, which after a walk up a curve sits far below where the price
   actually is. Whether a higher sqrtPrice means a higher token price
   depends on the address ordering, which the harness reports. */
let ACILIS_MCAP = 1500;
/* CEILING_MULTIPLE on the launchpad: the band stops sixty times up. */
const TAVAN_KAT = 60;
const spotMcap = (sqrtP, acilis, tokenSifirinci) => {
  const oran = Number(sqrtP) / Number(acilis);
  const kat = tokenSifirinci ? oran * oran : 1 / (oran * oran);
  return ACILIS_MCAP * kat;
};

(async function main() {
  const E = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestEgri.json"), "utf8"));
  const iface = new Interface(E.abi);

  /* Cumulative steps, chosen to show both ends: the first few dollars and
     the point where the band runs out. */
  const dolar = (process.env.MERDIVEN || "10,40,50,100,300,500,1000,1500,2500")
    .split(",").map((x) => Number(x.trim()));
  const alimlar = dolar.map((d) => BigInt(d) * 1000000n);

  const teminat = BigInt(Math.round(YATIRIM)) * 10n ** 18n;

  console.log("FIYAT EGRISI  (gercek Arc PoolManager, eth_call — islem yok)");
  console.log("  arz            1.000.000.000");
  console.log("  havuzdaki pay  %" + (Number(HAVUZ_BPS) / 100).toFixed(0));
  console.log("  acilis         tabanin kendisi — secilmiyor, musterinin odedigi para");
  console.log("  teminat        " + YATIRIM + " birim  (tabani belirler, acilisi degil)");
  console.log("");

  const degerUsdc = BigInt(Math.round(YATIRIM)) * 1000000n;
  const veri = iface.encodeFunctionData("run", [PM, teminat, degerUsdc, HAVUZ_BPS, alimlar]);
  const r = await rpc("eth_call", [
    { from: YABANCI, to: H, data: veri, gas: "0x10000000" },
    "latest",
    { [H]: { code: E.deployedBytecode } }
  ]);
  const [adimlar, acilisSqrtP, tabanFiyat, tokenSifirinci] =
    iface.decodeFunctionResult("run", r);

  const tabanMcap = (Number(BigInt(tabanFiyat)) / 1e18) * 1e9;
  ACILIS_MCAP = tabanMcap;   /* the pool opens at the floor now */
  console.log("  taban          $" + tabanMcap.toFixed(2) +
    " piyasa degeri   (kasadan her an geri alinabilir)");
  console.log("");

  console.log("  toplam alim   PIYASA DEGERI   alinan token    son dilim fiyati   havuzdaki USDC   kalan token");
  console.log("  " + "-".repeat(104));

  let oncekiHarcanan = 0n, oncekiAlinan = 0n;
  for (let i = 0; i < adimlar.length; i++) {
    const a = adimlar[i];
    const harcanan = BigInt(a.harcanan), alinan = BigInt(a.alinan);
    const bos = BigInt(a.havuzToken) < 10n ** 12n;
    /* With nothing left to sell the pool price runs to the limit tick, which
       is not a valuation — the last real one is the top of the band. */
    const mcap = bos ? ACILIS_MCAP * TAVAN_KAT
                     : spotMcap(BigInt(a.sqrtP), BigInt(acilisSqrtP), tokenSifirinci);

    /* Marginal, not average: what this slice cost, which is the number that
       tells you what the next dollar will do. */
    const dHarc = harcanan - oncekiHarcanan, dAl = alinan - oncekiAlinan;
    const dilimFiyat = dAl > 0n ? (Number(dHarc) / 1e6) / (Number(dAl) / 1e18) : 0;
    oncekiHarcanan = harcanan; oncekiAlinan = alinan;

    const bitti = a.doldu || bos;
    console.log(
      "  $" + (Number(harcanan) / 1e6).toLocaleString("en-US").padEnd(13) +
      ((bos ? "$" + mcap.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " (tavan)"
            : "$" + mcap.toLocaleString("en-US", { maximumFractionDigits: 0 }))).padEnd(17) +
      (Number(alinan) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(14) + "   " +
      ("$" + dilimFiyat.toExponential(2)).padStart(12) + "   " +
      ("$" + (Number(a.havuzUsdc) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })).padStart(14) + "   " +
      (Number(a.havuzToken) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(13) +
      (bitti ? "   <- BANT BITTI" : "")
    );
    if (bitti) break;
  }

  console.log("");
  const son = adimlar[adimlar.length - 1];
  console.log("  Not: piyasa degeri ANLIK fiyattan — toplam harcamanin toplam tokene");
  console.log("       bolumu degil. O ikincisi alicinin ortalama maliyeti olur ve");
  console.log("       egrinin sonunda cok daha dusuk cikar.");
  console.log("  Not: ucret bu tabloda yok. Hook cikistan %0,50 keser, yani alinan");
  console.log("       token sutunundan yarim puan dus. Fiyat yolu degismez.");
  console.log("  Not: havuzdaki USDC kilitli. Kimse cekemez — satmak isteyenin");
  console.log("       karsi tarafi odur ve alim geldikce kendi kendine buyur.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
