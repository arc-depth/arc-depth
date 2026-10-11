"use strict";
/* ===========================================================================
 * olc-acilis-secenekleri.js — what an opening market cap actually buys.
 *
 *   node scripts/olc-acilis-secenekleri.js
 *
 * WHY THIS EXISTS
 *   "Open at a $1,500 market cap" and "the price follows from the money we
 *   put in" are two instructions that set the same number, and only one of
 *   them can be obeyed. With a fixed supply and a fixed number of tokens in
 *   the pool, the opening market cap IS the amount of USDC paired with
 *   them:
 *
 *       price = usdc / poolTokens
 *       mcap  = price * supply   =   usdc * supply / poolTokens
 *
 *   So choosing the market cap chooses the money, and choosing the money
 *   chooses the market cap. There is no third degree of freedom.
 *
 *   That matters because the market cap therefore also chooses the depth,
 *   and depth is what ALP died of: a $1,500 opening produced a book $115
 *   deep, which could not fill a $1000 buyer. This prints the trade-off as
 *   a table instead of leaving it to be discovered after the liquidity is
 *   locked.
 *
 * THE MATH
 *   A two-sided full-range position behaves as x*y=k over the region that
 *   matters here. Buying with d dollars:
 *
 *       tokensOut = T * d / (U + d)
 *       newPrice  = oldPrice * ((U + d) / U)^2
 *
 *   so multiplying the price by m costs U * (sqrt(m) - 1). Every number
 *   below comes from those two lines; nothing is assumed about decimals,
 *   because nothing here is scaled.
 * =========================================================================== */

const ARZ = 1_000_000_000;          // fixed, no mint
const HAVUZ = 300_000_000;          // tokens placed for trading

const n = (x, d = 2) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x) => "$" + n(x, x < 1 ? 6 : 2);

/* The one identity everything follows from. */
const usdcGereken = (mcap) => (mcap * HAVUZ) / ARZ;
const fiyat = (mcap) => mcap / ARZ;

console.log("SABIT: arz " + n(ARZ, 0) + ", mint yok, havuza konan " + n(HAVUZ, 0) + " token");
console.log("");
console.log("  mcap = (havuza konan USDC) x arz / havuzdaki token");
console.log("       = USDC x " + (ARZ / HAVUZ).toFixed(4));
console.log("  yani acilis mcap'ini secmek, konacak parayi secmektir. Ikisi ayni sayi.");
console.log("");

console.log("ACILIS SECENEKLERI");
console.log("");
console.log("  mcap        KOYMAN GEREKEN     token fiyati      $100 alim     $1.000 alim");
console.log("                      USDC                         mcap'i       mcap'i");
console.log("  " + "-".repeat(84));

for (const mcap of [1500, 5000, 15000, 50000, 150000, 500000, 1500000]) {
  const U = usdcGereken(mcap);
  const vur = (d) => mcap * Math.pow((U + d) / U, 2);
  const satir =
    "  " + ("$" + n(mcap, 0)).padEnd(12) +
    ("$" + n(U, 2)).padStart(14) + "   " +
    usd(fiyat(mcap)).padStart(14) + "   " +
    ("$" + n(vur(100), 0)).padStart(12) + "  " +
    ("$" + n(vur(1000), 0)).padStart(14);
  console.log(satir);
}

console.log("");
console.log("  Son iki kolon: o alim fiyati NEREYE tasiyor. Sicrama buyukse");
console.log("  kitap sig demektir — alici parasinin karsiligini alamaz.");
console.log("");

/* The question that killed the last token, asked in advance this time. */
console.log("$1.000'LIK BIR ALICI DOLDURULABILIYOR MU");
console.log("");
for (const mcap of [1500, 15000, 150000, 1500000]) {
  const U = usdcGereken(mcap);
  const T = HAVUZ;
  const alinan = (T * 1000) / (U + 1000);
  const sonFiyat = fiyat(mcap) * Math.pow((U + 1000) / U, 2);
  const odenenOrt = 1000 / alinan;
  const kayma = (odenenOrt / fiyat(mcap) - 1) * 100;
  console.log("  acilis mcap " + ("$" + n(mcap, 0)).padEnd(12) +
    " havuzda " + ("$" + n(U, 2)).padEnd(12));
  console.log("      $1.000 ile alinan      " + n(alinan, 0) + " token" +
    "   (havuzun %" + n((100 * alinan) / T, 1) + "'i)");
  console.log("      odedigi ortalama fiyat " + usd(odenenOrt) +
    "   acilis fiyatinin " + n(odenenOrt / fiyat(mcap), 1) + " kati");
  console.log("      kayma                  %" + n(kayma, 0));
  console.log("      alim sonrasi mcap      $" + n(sonFiyat * ARZ, 0));
  console.log("");
}

console.log("OKUMA");
console.log("  Kayma, alicinin acilis fiyatinin kac kati odedigi. %100 kayma,");
console.log("  1.000 dolarini koyan kisinin ortalama iki kat fiyat odedigi demek.");
console.log("  Saglikli bir kitapta 1.000 dolarlik alim fiyati birkac yuzde oynatir,");
console.log("  katlamaz. Bunu saglayan tek sey havuzdaki USDC — yani acilis mcap'i.");
