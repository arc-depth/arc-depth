"use strict";
/* ===========================================================================
 * dene-tekyonlu.js — push a real $20 through a token-only band and divide.
 *
 *   node scripts/dene-tekyonlu.js
 *   node scripts/dene-tekyonlu.js --token 30 --bant 100 --swap 20
 *
 * WHAT IS BEING SETTLED
 *   MetaMask quotes -76.96% on a $20 buy against the live pool, because
 *   that pool is full range with $6 in it. The fix I claim costs no money:
 *   concentrate tokens alone into a band above the price, so the pool asks
 *   for the side we have and buyers' own dollars become the depth.
 *
 *   The 2.6% I predicted is my arithmetic, and my arithmetic is also what
 *   produced the $6 pool. So this runs TekYonluAcici inside the REAL Arc
 *   PoolManager through eth_call with a state override — real v4 code, real
 *   tick math, nothing sent, no gas — and reports what the swap returned
 *   rather than what the formula said.
 *
 * THE PRICE IS NOT CHOSEN
 *   The band opens at the live pool's own sqrtPriceX96, read from chain. A
 *   new pool at a different price would just be an arbitrage invitation,
 *   and the token-only side has no money in it to defend with.
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

const val = (ad, d) => { const i = process.argv.indexOf(ad); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TOKEN_M = Number(val("--token", "30"));          // million DEPTH into the band
const BANT = Number(val("--bant", "100"));             // band top, % above the price
const SWAP = Number(val("--swap", "20"));              // the buy to measure, dollars

const KOSUM = "0x00000000000000000000000000000000000d3b7a";
const SPACING = 60n;

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
    try { const r = await hamIstek(m, p); await new Promise((x) => setTimeout(x, 600)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 6) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}

const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);

/* Integer tick -> sqrtPriceX96, and back, both exactly as v4 does it, so
   the numbers printed here are the numbers the pool will see. Float powers
   are fine for picking a tick and are not used for anything settled. */
const Q96 = 2n ** 96n;
const tickOf = (sqrtX96) => {
  /* price = (sqrt/2^96)^2 ; tick = log(price)/log(1.0001) */
  const p = (Number(sqrtX96) / Number(Q96)) ** 2;
  return Math.floor(Math.log(p) / Math.log(1.0001));
};

(async function main() {
  /* ---- the live price, from the live pool -------------------------- */
  const slot = keccak256(coder.encode(["bytes32", "uint256"], [H.havuzId, 6]));
  const raw = BigInt(await rpc("eth_call", [{
    to: D.poolManager,
    data: id("extsload(bytes32)").slice(0, 10) + slot.slice(2)
  }, "latest"]));
  const sqrtCanli = raw & ((1n << 160n) - 1n);
  const tickCanli = tickOf(sqrtCanli);

  /* DEPTH is currency1, so the pool's price is DEPTH-wei per USDC-unit and
     the dollar price is its reciprocal scaled by the decimal gap. Written
     out because I got this inverted once and declared a working pool dead. */
  const pV4 = (Number(sqrtCanli) / Number(Q96)) ** 2;
  const fiyat = (1 / pV4) * 1e12;

  /* ---- the band ---------------------------------------------------- */
  /* Token-only means wholly on DEPTH's side of the price. DEPTH is
     currency1, so that side is BELOW the current tick, and a higher dollar
     price is a lower tick. The top of the band in dollars is therefore its
     LOWER tick. */
  /* --hizala opens the pool exactly on a tick boundary and puts the
     band top on that same tick, so there is no empty gap above the band.
     For a new token the opening price is ours to choose, so the alignment
     is free; matching an existing pool it would shift the price by up to
     0.6% and is not. */
  const HIZALA = process.argv.includes("--hizala");
  const ust = HIZALA ? BigInt(Math.round(tickCanli / 60)) * SPACING
    : (BigInt(Math.floor((tickCanli - 1) / 60)) * SPACING);
  /* --tam is the v2 shape: one position covering every price above the
     current one, which is what "let Uniswap spread it" actually means in
     v4. No ladder to choose and no ceiling to hit, at the cost of depth.
     A percentage cannot express it — e^127 overflows a float — so the tick
     is named directly. */
  const TAM = process.argv.includes("--tam");
  const EN_ALT = -887220n;                       // MIN_TICK snapped to spacing 60
  const adim = TAM ? ust - EN_ALT
    : BigInt(Math.round(Math.log(1 + BANT / 100) / Math.log(1.0001) / 60)) * SPACING;
  const alt = ust - adim;
  const bantUst = TAM ? Infinity : fiyat * (1.0001 ** Number(ust - alt));

  const tokenHam = BigInt(Math.round(TOKEN_M * 1e6)) * 10n ** 18n;
  const swapHam = BigInt(Math.round(SWAP * 1e6));

  console.log("TEK YONLU BANT — GERCEK Arc PoolManager, eth_call, hicbir sey gonderilmiyor");
  console.log("");
  console.log("  CANLI HAVUZ (degismiyor, kilitli)");
  console.log("    havuzId      " + H.havuzId);
  console.log("    sqrtPriceX96 " + sqrtCanli);
  console.log("    tick         " + tickCanli);
  console.log("    fiyat        $" + fiyat.toExponential(5) + " / DEPTH");
  console.log("    icindeki     " + usd(Number(BigInt(H.esik)) / 1e6));
  console.log("");
  console.log("  ACILACAK BANT");
  console.log("    token        " + nf(TOKEN_M) + ".000.000 DEPTH");
  console.log("    ticks        [" + alt + ", " + ust + "]   (" + (adim / SPACING) + " adim)");
  console.log("    fiyat araligi $" + fiyat.toExponential(4) + "  ->  $" + bantUst.toExponential(4) +
    "   (+%" + nf((bantUst / fiyat - 1) * 100, 0) + ")");
  console.log("    olculecek swap " + usd(SWAP, 2));
  console.log("");

  /* ---- run it ------------------------------------------------------ */
  const cikti = "(int256 quoteTalep,int256 tokenTalep,uint128 likidite,uint256 artan," +
    "uint160 sqrtAcilis,uint256 odenen,uint256 alinan,uint160 sqrtSonra,uint128 biriktirEklenen)";
  const iface = new Interface([
    "function run(address pm,uint160 acilisSqrt,int24 alt,int24 ust,uint256 tokenMiktari,uint256 swapTutari) returns (" + cikti + ")",
    "function runTick(address pm,int24 acilisTick,int24 alt,int24 ust,uint256 tokenMiktari,uint256 swapTutari) returns (" + cikti + ")"
  ]);
  /* --hizala names the opening as a tick so the band top and the price
     land on the SAME tick with no gap between them. Converting a price to
     sqrtPriceX96 in JavaScript loses the last digits and would put the
     opening a hair off, quietly restoring the gap this removes. */
  const fn = HIZALA ? "runTick" : "run";
  const data = iface.encodeFunctionData(fn, [
    D.poolManager, HIZALA ? Number(ust) : sqrtCanli, alt, ust, tokenHam, swapHam
  ]);

  let r;
  try {
    r = await rpc("eth_call", [
      { from: KOSUM, to: KOSUM, data, gas: "0x5000000" },
      "latest",
      { [KOSUM]: { code: B.deployedBytecode, nonce: "0x0" } }
    ]);
  } catch (e) {
    console.log("  CAGRI REVERT ETTI: " + e.message);
    console.log("");
    console.log("  Bu iyi haber degil ama kotu haberin dogru yeri burasi —");
    console.log("  zincire hicbir sey gitmedi ve bedeli sifir.");
    process.exit(1);
  }

  const s = iface.decodeFunctionResult(fn, r)[0];
  const quoteTalep = BigInt(s[0]);
  const likidite = BigInt(s[2]);
  const artan = BigInt(s[3]);
  const odenen = BigInt(s[5]);
  const alinan = BigInt(s[6]);
  const sqrtSonra = BigInt(s[7]);
  const biriktir = BigInt(s[8]);

  console.log("  ACILIS — zincirdeki v4 kodunun verdigi");
  console.log("    havuzun istedigi PARA    " + quoteTalep +
    (quoteTalep === 0n ? "   <- SIFIR. Tek kurus USDC gerekmedi." : "   <- PARA ISTEDI, tasarim yanlis"));
  console.log("    havuzun aldigi TOKEN     " + nf(Number(s[1]) / 1e18) + " DEPTH");
  console.log("    likidite                 " + likidite);
  console.log("    acicida kalan            " + nf(Number(artan) / 1e18, 6) + " DEPTH");
  console.log("");

  if (quoteTalep !== 0n) { console.log("  Burada duruyorum."); process.exit(1); }

  /* ---- the measurement --------------------------------------------- */
  /* The impact has to be measured against the price this pool opened at,
     not the live pool's — --hizala shifts the opening by up to half a tick
     spacing, and charging that shift as slippage would be measuring our
     own rounding. */
  const acilisFiyat = HIZALA
    ? (1 / ((Number(BigInt(s[4])) / Number(Q96)) ** 2)) * 1e12
    : fiyat;
  const odenenUsd = Number(odenen) / 1e6;
  const alinanTok = Number(alinan) / 1e18;
  const ortalama = odenenUsd / alinanTok;
  /* The number a wallet puts on the screen is the share of the payment
     lost to moving the price: 1 - spot/average. Checked against the two
     screenshots before being used here — the live pool gives 76.9% on $20
     and 62.5% on $10, against the -76.96% and -62.59% MetaMask showed. An
     earlier script of mine used 1-(U/(U+d))^2, which gives 94.7% and 72.2%
     and reproduces neither, so it was measuring something else. */
  const cuzdanEtkisi = (ort, spot) => (1 - spot / ort) * 100;
  const etki = cuzdanEtkisi(ortalama, acilisFiyat);
  const pSonra = (Number(sqrtSonra) / Number(Q96)) ** 2;
  const fiyatSonra = (1 / pSonra) * 1e12;

  /* The same trade against the live pool, from its own reserves. */
  const U = Number(BigInt(H.esik)) / 1e6;
  const T = Number(BigInt(H.havuzToken)) / 1e18;
  const havuzAlinan = (T * SWAP) / (U + SWAP);
  const havuzEtki = cuzdanEtkisi(SWAP / havuzAlinan, U / T);

  console.log("  " + usd(SWAP, 2) + " ALIM — zincirde kosmus swap");
  console.log("    odenen                   " + usd(odenenUsd, 6));
  console.log("    GELEN DEPTH              " + nf(alinanTok));
  console.log("    odenen ortalama fiyat    $" + ortalama.toExponential(5));
  console.log("    spot (once / sonra)      $" + fiyat.toExponential(5) +
    "  ->  $" + fiyatSonra.toExponential(5));
  console.log("");
  console.log("    CUZDANIN GOSTERECEGI     -%" + etki.toFixed(2));
  console.log("    ayni swap canli havuzda  -%" + nf(havuzEtki, 2) +
    "   (ekrandaki -%76,96 / -%62,59 bu formulle birebir)");
  console.log("");
  console.log("    " + nf(alinanTok / havuzAlinan, 1) + " kat daha fazla DEPTH, ve bedeli SIFIR dolar.");
  console.log("");
  console.log("  SONRASINDA DERINLIK EKLENEBILIYOR MU");
  console.log("    biriktir() eklenen likidite  " + biriktir +
    (biriktir > 0n ? "   <- calisiyor" : "   <- EKLEMEDI"));
  console.log("    Hook'un %0,20'lik dilimi ve gelen her bagis bu yoldan");
  console.log("    kalici derinlige donuyor; eski kilitte bu yol yoktu.");

  /* ---- the ceiling, stated ----------------------------------------- */
  const sa = Math.sqrt(1.0001 ** Number(alt));
  const sb = Math.sqrt(1.0001 ** Number(ust));
  /* In v4 units liquidity * (sqrt(upper) - sqrt(lower)) is the currency1
     the band holds; the money it can absorb is the currency0 side, which
     is L * (1/sa - 1/sb). */
  const kapasite = (Number(likidite) * (1 / sa - 1 / sb)) / 1e6;
  console.log("");
  console.log("  TAVAN — susmadan soyluyorum");
  console.log("    bu bant " + usd(kapasite, 0) + " alim emer; bitince fiyat bandin");
  console.log("    ustune cikar ve BU havuz alim vermez. Ayni tavan bu projede");
  console.log("    bir havuzu bir kere bosaltti.");
  console.log("    O noktada: ya ana egri (" + usd(Number(BigInt(D.esik)) / 1e6, 0) +
    " esikli) mezun olup kendi derin");
  console.log("    havuzunu acar, ya da biriken parayla bant yukari genisletilir.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
