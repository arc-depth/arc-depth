"use strict";
/* ===========================================================================
 * olc-havuz-derinlestir.js — what it costs to make a wallet swap usable.
 *
 *   node scripts/olc-havuz-derinlestir.js
 *
 * THE THING I GOT WRONG
 *   I said the curve solves the slippage, and it does — for somebody
 *   calling the contract. Nobody does that. A buyer opens their wallet,
 *   taps swap, and the wallet routes to the Uniswap pool, which holds $6.
 *   MetaMask shows -76.96% on a $20 trade and the person closes the app.
 *   From the only seat that matters, nothing was fixed.
 *
 * THE MECHANISM THAT EXISTS
 *   HavuzAcici.biriktir() sizes new liquidity from whatever the contract
 *   holds, so USDC and DEPTH sent to it become permanent pool depth — by
 *   anyone, and withdrawable by no one. That is the lever; this prices it.
 *
 * SLIPPAGE IS ONE RATIO
 *   impact ~ trade / money in the pool. Everything below is that.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const H = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-havuz.json"), "utf8"));

const U0 = Number(BigInt(H.esik)) / 1e6;            // $6 in the pool now
const T0 = Number(BigInt(H.havuzToken)) / 1e18;     // 404,082 DEPTH
const FIYAT = U0 / T0;

const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);

/* Uniswap reports price impact as the move from spot to the post-trade
   price, which for constant product is what the wallet is showing. */
const etki = (U, d) => (1 - Math.pow(U / (U + d), 2)) * 100;

console.log("SIMDIKI DURUM — cuzdanin gosterdigi");
console.log("  havuzda " + usd(U0) + ", " + nf(T0) + " DEPTH");
console.log("");
console.log("    swap      etki");
for (const d of [1, 5, 10, 20, 50]) {
  console.log("    " + usd(d, 0).padStart(6) + "   -%" + nf(etki(U0, d), 2).padStart(6) +
    (d === 10 ? "   <- ekranda -%62,59" : d === 20 ? "   <- ekranda -%76,96" : ""));
}
console.log("");
console.log("  Ekrandaki rakamlar hesapla birebir. Sorun cuzdanda degil,");
console.log("  havuzda " + usd(U0) + " olmasinda.");

console.log("");
console.log("HAVUZA PARA EKLENIRSE");
console.log("  biriktir() acicinin elindeki her seyi likiditeye ceviriyor —");
console.log("  gonderen kim olursa olsun, ve kimse geri cekemez.");
console.log("  Eklenen USDC'ye denk DEPTH de gerekiyor (su anki fiyattan).");
console.log("");
console.log("    eklenen    havuz olur   gereken DEPTH    $1 swap   $10 swap   $20 swap");
for (const ek of [20, 100, 250, 500, 1000, 2500]) {
  const U = U0 + ek;
  const gerekenTok = ek / FIYAT;
  console.log("    " + usd(ek, 0).padStart(8) + "   " + usd(U, 0).padStart(10) + "   " +
    nf(gerekenTok).padStart(13) + "   -%" + nf(etki(U, 1), 2).padStart(5) +
    "   -%" + nf(etki(U, 10), 1).padStart(5) + "   -%" + nf(etki(U, 20), 1).padStart(5));
}

console.log("");
console.log("  OKUMA");
console.log("    Cuzdanlar -%5 civarini 'yuksek' diye isaretlemeye baslar,");
console.log("    -%15 ustunu kirmizi yapar. Yani:");
for (const [d, hedef] of [[10, 5], [20, 5], [20, 15]]) {
  /* impact = 1 - (U/(U+d))^2  ->  U = d / (1/sqrt(1-i) - 1) */
  const i = hedef / 100;
  const U = d / (1 / Math.sqrt(1 - i) - 1);
  console.log("      " + usd(d, 0).padStart(5) + "'lik swap -%" + hedef +
    " altinda gorunmesi icin havuzda ~" + usd(U, 0));
}

console.log("");
console.log("DURUST SONUC");
console.log("  Elde " + usd(0.2, 2) + " var, ekranda " + usd(21.49) + " goruluyor.");
console.log("  " + usd(21.49) + "'un tamami konsa havuz " + usd(U0 + 21.49) +
  " olur ve $10'luk swap");
console.log("  hala -%" + nf(etki(U0 + 21.49, 10), 0) + " gosterir. Yani 20 dolar bu sorunu COZMEZ.");
console.log("");
console.log("  Coznek icin ~" + usd(390, 0) + " gerekiyor ($10 swap, -%5 altina).");
console.log("  Bizde o yok. Iki gercek yol var:");
console.log("");
console.log("    1. Ana egri " + usd(15000, 0) + " toplar ve kendi havuzunu o derinlikte");
console.log("       acar. Parayi alicilar koyar, biz koymayiz. Ama alicilarin");
console.log("       egriye ulasmasi icin sayfanin yayinda olmasi sart —");
console.log("       cuzdandan swap onlari " + usd(U0) + "'lik havuza gonderiyor.");
console.log("");
console.log("    2. Havuza para konur. Ne kadar konursa o kadar duzelir ve");
console.log("       geri cikmaz — kalici kilitli.");
console.log("");
console.log("  Ikisi birbirini disklamiyor ama birincisi bedava, ikincisi degil.");
