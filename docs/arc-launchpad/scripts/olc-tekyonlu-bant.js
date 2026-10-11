"use strict";
/* ===========================================================================
 * olc-tekyonlu-bant.js — a pool a wallet swap can actually use, for $0.
 *
 *   node scripts/olc-tekyonlu-bant.js
 *
 * WHAT I GOT WRONG
 *   I opened a full-range two-sided pool with $6 in it and then told
 *   people to use the curve instead. Nobody uses a curve; they tap swap in
 *   MetaMask, see -76.96%, and close the app. From the buyer's seat
 *   nothing was fixed, and a listed token that looks broken is worse than
 *   an unlisted one.
 *
 * THE TWO THINGS I MISSED
 *   1. Full range spreads liquidity across every price from zero to
 *      infinity. The same assets concentrated into a narrow band give
 *      tens of times the depth where trading actually happens. That is
 *      the whole point of v3/v4 and I did not use it.
 *
 *   2. A token-only position needs NO USDC at all. It sits above the
 *      current price and buyers walk up through it, their dollars filling
 *      the pool as they go. We have 49,500,000 DEPTH and $0.20 — so the
 *      side we are short of is exactly the side that is not required.
 *
 * THE TRADE-OFF, STATED
 *   A tight band is deep but finite: once buying pushes price past the
 *   top, the tokens are gone and the book stops. That is the 60x ceiling
 *   that emptied a pool in this project once before. So the band has to be
 *   wide enough to absorb real volume and tight enough to quote well, and
 *   this prints both numbers for each option instead of picking by feel.
 *
 * THE MATH
 *   For a position with liquidity L over [pa, pb] at price p, the USDC
 *   side behaves like a reserve of L*sqrt(p) — that is what sets slippage.
 *   A token-only position starting at p holds
 *       N = L * (1/sqrt(p) - 1/sqrt(pb))
 *   and absorbs
 *       L * (sqrt(pb) - sqrt(p))
 *   dollars before it runs out. Both follow from the same L.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const H = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-havuz.json"), "utf8"));

const U0 = Number(BigInt(H.esik)) / 1e6;
const T0 = Number(BigInt(H.havuzToken)) / 1e18;
const P = U0 / T0;                       // USDC per DEPTH, the live price

const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);

/* Wallets quote price impact as the move from spot to the post-trade
   price, which against a reserve R of quote is 1 - (R/(R+d))^2. */
const etki = (R, d) => (1 - Math.pow(R / (R + d), 2)) * 100;

/* A token-only band from p up to p*k, holding N tokens. */
function bant(N, k) {
  const sp = Math.sqrt(P), spb = Math.sqrt(P * k);
  const L = N / (1 / sp - 1 / spb);      // liquidity implied by the tokens
  const rezerv = L * sp;                 // the quote-side reserve that sets slippage
  const kapasite = L * (spb - sp);       // dollars it absorbs before the band empties
  return { L, rezerv, kapasite };
}

console.log("SIMDIKI HAVUZ — tam aralik, iki yonlu, " + usd(U0) + " icinde");
console.log("    swap     etki");
for (const d of [1, 10, 20]) console.log("    " + usd(d, 0).padStart(6) + "   -%" + nf(etki(U0, d), 1));
console.log("  Ekranda gorulen -%62,59 ve -%76,96 bunlar.");
console.log("");

console.log("TEK YONLU DAR BANT — sadece DEPTH, SIFIR dolar");
console.log("");
console.log("    token      bant     etkin rezerv   kapasite    $1 swap   $10 swap   $20 swap");
const secenekler = [
  [10_000_000, 1.2], [10_000_000, 1.5], [10_000_000, 2],
  [30_000_000, 1.5], [30_000_000, 2], [30_000_000, 3],
  [45_000_000, 2], [45_000_000, 3], [45_000_000, 5]
];
for (const [N, k] of secenekler) {
  const b = bant(N, k);
  console.log("    " + nf(N / 1e6, 0).padStart(5) + "M   +%" + nf((k - 1) * 100, 0).padStart(4) +
    "   " + usd(b.rezerv, 0).padStart(13) + "   " + usd(b.kapasite, 0).padStart(9) +
    "   -%" + nf(etki(b.rezerv, 1), 2).padStart(5) +
    "   -%" + nf(etki(b.rezerv, 10), 2).padStart(5) +
    "   -%" + nf(etki(b.rezerv, 20), 2).padStart(5));
}

console.log("");
console.log("  OKUMA");
console.log("    'etkin rezerv' havuzda duran para degil — bandin dar olmasindan");
console.log("    dogan sanal derinlik. Kayma ona gore hesaplaniyor, ve gercek.");
console.log("    'kapasite' bandin bitmeden once emebilecegi alim. Bitince");
console.log("    tokenler tukenir ve o havuzda alim durur.");
console.log("");
console.log("    Dar bant: cok derin, cabuk biter. Genis bant: daha az derin,");
console.log("    uzun dayanir. Ikisini de ayni parayla alamayiz.");

/* The one that has to be beaten. */
console.log("");
console.log("KARSILASTIRMA — ayni $20 swap");
console.log("    simdiki havuz        -%" + nf(etki(U0, 20), 1));
{
  const b = bant(30_000_000, 2);
  console.log("    30M token, +%100 bant  -%" + nf(etki(b.rezerv, 20), 2) +
    "   kapasite " + usd(b.kapasite, 0));
  console.log("");
  console.log("    " + nf(b.rezerv / U0, 0) + " kat daha derin, ve bedeli SIFIR dolar.");
  console.log("    Maliyeti token: 30.000.000 DEPTH, kurucu payinin %" +
    nf((30e6 / 49.5e6) * 100, 0) + "'i,");
  console.log("    kalici kilitli. Alinan para da havuzda kalir, cekilemez.");
}

console.log("");
console.log("NE SATILABILIR");
console.log("  Tek yonlu bant baslangicta sadece token tutar, yani ilk anda");
console.log("  satis yapilamaz. Ama her alim havuza dolar birakiyor ve o dolar");
console.log("  satislarin karsiligi oluyor. Yani satis likiditesi, alim geldikce");
console.log("  kendiliginden olusuyor — bizim koymadigimiz parayla.");
console.log("");
console.log("  Bugunku " + usd(U0 + 1.49, 2) + "'lik cikis da yerinde duruyor, kaybolmuyor.");
