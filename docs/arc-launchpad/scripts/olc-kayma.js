"use strict";
/* ===========================================================================
 * olc-kayma.js — why the slippage is what it is, and what makes it fall.
 *
 *   node scripts/olc-kayma.js
 *
 * SLIPPAGE IS ONE RATIO
 *   A constant-product pool holds U of money and T of tokens, and a trade
 *   of size d moves the price by ((U+d)/U)^2. So the only thing that
 *   decides slippage is d/U — the trade against the money in the pool.
 *   Nothing about the token, the supply or the market cap enters it.
 *
 *     kayma ~ 2d/U   for small d
 *
 *   With $6 in the pool, a $1 trade is a sixth of it. That is the whole
 *   explanation; there is no inefficiency to fix, it is the shape of the
 *   curve at that size.
 *
 * WHAT CLOSES IT
 *   A buyer's USDC stays in the pool. So net buying raises U dollar for
 *   dollar, and the pool deepens exactly as fast as money arrives. The
 *   hook's 0.20% reinvestment also adds, but it is small: $50,000 of volume
 *   to add $100 of depth. Buying is the mechanism; the fee is a rounding
 *   error next to it.
 *
 *   And selling does the reverse. It is NET buying that matters.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const H = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-havuz.json"), "utf8"));
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-depth.json"), "utf8"));

const U0 = Number(BigInt(H.esik)) / 1e6;              // $6 in the pool
const T0 = Number(BigInt(H.havuzToken)) / 1e18;       // 404,082 DEPTH
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);

/* Average price paid for a buy of d, against reserves (U, T). */
const ortFiyat = (U, T, d) => d / ((T * d) / (U + d));
const spot = (U, T) => U / T;
const kayma = (U, T, d) => (ortFiyat(U, T, d) / spot(U, T) - 1) * 100;

console.log("NEDEN BU KADAR");
console.log("");
console.log("  Kayma tek bir orana bagli: islem buyuklugu / havuzdaki para.");
console.log("  Havuzda " + usd(U0) + " var. $1'lik islem onun altida biri.");
console.log("  Token sayisi, arz, piyasa degeri — hicbiri bu hesaba girmiyor.");
console.log("");
console.log("    islem    havuzun yuzdesi   kayma");
for (const d of [0.1, 0.5, 1, 2, 5, 25, 100]) {
  console.log("    " + usd(d, 2).padStart(7) + "   %" + nf((d / U0) * 100, 1).padStart(14) +
    "   %" + nf(kayma(U0, T0, d), 1).padStart(7));
}
console.log("");
console.log("  Yani duzeltilecek bir verimsizlik yok — egrinin bu boyuttaki");
console.log("  sekli bu. Ayni islem daha derin bir havuzda ayni egriyle");
console.log("  neredeyse hic oynatmaz.");

console.log("");
console.log("NE ZAMAN DENGELENIR");
console.log("");
console.log("  Alicinin USDC'si havuzda KALIYOR. Yani net alim, havuzdaki");
console.log("  parayi dolar dolarina buyutuyor:");
console.log("");
console.log("    havuzdaki para   $1 islemde   $10 islemde   $100 islemde   $1.000 islemde");
for (const U of [6, 50, 100, 500, 1_000, 5_000, 10_000, 50_000]) {
  /* Tokens fall as money enters, which is what keeps the price honest; the
     product is preserved, so T scales as k/U with k fixed at the opening
     ratio. Using the opening price keeps the comparison about depth alone. */
  const T = (U0 * T0) / U;
  const sat = (d) => "%" + nf(kayma(U, T, d), 1);
  console.log("    " + usd(U, 0).padStart(14) + "   " + sat(1).padStart(10) + "   " +
    sat(10).padStart(11) + "   " + sat(100).padStart(12) + "   " + sat(1000).padStart(14));
}

console.log("");
console.log("  OKUMA");
console.log("    %2'nin altinda kayma pratikte 'normal' sayilir. Ona ulasmak icin:");
for (const [d, hedef] of [[10, 0.02], [100, 0.02], [1000, 0.02]]) {
  /* kayma ~ 2d/U  ->  U ~ 2d/hedef */
  const gereken = (2 * d) / hedef;
  console.log("      " + usd(d, 0).padStart(7) + "'lik islem icin havuzda ~" +
    usd(gereken, 0) + " olmasi gerekiyor");
}
console.log("");
console.log("    Bugun " + usd(U0) + " var. Yani " + usd(10_000 - U0, 0) +
  " net alim, $100'luk islemleri");
console.log("    %2 kaymaya indirir. O para havuzdan cikmaz — kilitli.");
console.log("");
console.log("  IKI MEKANIZMA, BIRI KUCUK");
console.log("    1. Her alimin USDC'si havuzda kaliyor      -> dolar dolarina");
console.log("    2. Hook her islemin %0,20'sini geri yatiriyor -> $50.000 hacim");
console.log("       basina ~$100 derinlik");
console.log("");
console.log("    Birincisi mekanizma, ikincisi yuvarlama. Ve SATIS tersini");
console.log("    yapiyor: havuzdan para cikariyor. Onemli olan NET alim.");

console.log("");
console.log("ANA EGRI MEZUN OLDUGUNDA NE OLUR");
console.log("");
const anaEsik = Number(BigInt(D.esik)) / 1e6;
console.log("  Ana egri " + usd(anaEsik, 0) + " topladiginda kendi kalici havuzunu");
console.log("  aciyor — " + usd(anaEsik, 0) + " derinlikle. O havuzda $100'luk islem");
{
  /* The main curve's pool: $15,000 against the tokens the closing price
     supports. Depth is what matters here, so the ratio is enough. */
  const U = anaEsik, T = (U0 * T0) / U;
  console.log("  %" + nf(kayma(U, T, 100), 2) + " kayma ile gecer — yani sorun orada bitiyor.");
}
console.log("");
console.log("  Dikkat: o zaman DEPTH'in IKI Uniswap havuzu olur, farkli");
console.log("  fiyatlarda. Aralarindaki arbitraj kucuk havuzun derinligiyle");
console.log("  sinirli, yani " + usd(U0) + " — birisi onu alir ve kucuk havuzun");
console.log("  fiyati buyugune esitlenir. Kendiliginden duzelen ve " + usd(U0) +
  " ile");
console.log("  sinirli bir sey, ama bilerek yazilmasi gereken bir sey.");
