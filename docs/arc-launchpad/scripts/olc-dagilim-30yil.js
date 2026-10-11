"use strict";
/* ===========================================================================
 * olc-dagilim-30yil.js — the allocation as specified, and what it produces.
 *
 *   node scripts/olc-dagilim-30yil.js
 *
 * THE SPECIFICATION
 *   300,000,000  the market: sold on the curve, then the locked pool
 *   600,000,000  staking rewards, over 30 years, halving
 *   100,000,000  founder: 50,000,000 now, 50,000,000 vesting
 *
 * WHAT THIS IS FOR
 *   Two things in the specification are linked and the link is not
 *   obvious: the staking allocation and the market's depth come out of the
 *   same billion. Giving 600,000,000 to stakers leaves 300,000,000 for the
 *   market, and the money the curve can collect is proportional to what it
 *   has to sell — so the allocation decides the depth. Better to see that
 *   as a number now than to discover it after the pool is locked.
 *
 *   And "30 years with halvings" is a family of schedules, not one. ALP's
 *   was already 30 years with halvings; what killed it was the half-life.
 *   At ~3 years it released about 123,000,000 in the first year against
 *   roughly 90,000,000 circulating. The same total over a longer half-life
 *   is a different token.
 * =========================================================================== */

const ARZ = 1_000_000_000;
const PIYASA = 300_000_000;
const STAKE = 600_000_000;
const KURUCU = 100_000_000;

const n = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });

console.log("DAGILIM");
console.log("  piyasa (egri + havuz)   " + n(PIYASA).padStart(13));
console.log("  stake odulu, 30 yil     " + n(STAKE).padStart(13));
console.log("  kurucu                  " + n(KURUCU).padStart(13) + "   50M serbest + 50M vesting");
console.log("  " + "-".repeat(38));
console.log("  toplam                  " + n(PIYASA + STAKE + KURUCU).padStart(13));
console.log("");

/* ---- 1. what the market slice can collect ------------------------- */
console.log("1) PIYASA DILIMI NE KADAR PARA TOPLAR");
console.log("");
console.log("  Egri, elindeki tokenin bir kismini satar ve kalanini havuza");
console.log("  ayirir. Topladigi para = havuzun derinligi. Ve o para, acilis");
console.log("  mcap'i ile egriye konan token miktarina baglidir:");
console.log("");
console.log("    fantom = acilis fiyati x egri tokeni");
console.log("    esik   = fantom x (egri - ayrilan) / ayrilan");
console.log("");
const egri = (C, mcap, ayrilanPay) => {
  const acilisFiyat = mcap / ARZ;
  const P = acilisFiyat * C;
  const ayrilan = C * ayrilanPay;
  const T = (P * (C - ayrilan)) / ayrilan;
  const kapanis = (P + T) / ayrilan;
  const havuzToken = T / kapanis;
  return { P, T, ayrilan, satilan: C - ayrilan, kapanis, havuzToken,
           yakilan: ayrilan - havuzToken, mezunMcap: kapanis * ARZ };
};

console.log("  acilis mcap   toplanan para   egride satilan   havuza konan   yakilan");
for (const mcap of [1500, 5000, 15000, 50000, 150000]) {
  const e = egri(PIYASA, mcap, 1 / 3);
  console.log("  $" + n(mcap).padStart(9) + "   $" + n(e.T, 2).padStart(12) + "   " +
    n(e.satilan).padStart(14) + "   " + n(e.havuzToken).padStart(12) + "   " + n(e.yakilan).padStart(11));
}
console.log("");
console.log("  BU, SPESIFIKASYONUN SONUCU: 600 milyonu stake'e ayirmak piyasaya");
console.log("  300 milyon birakiyor, o da $1.500 acilista havuzu $900 derinlikte");
console.log("  aciyor. Derinligi buyutmenin tek yolu acilis mcap'ini yukseltmek");
console.log("  ya da stake dilimini kucultmek. Ikisi ayni bilancodan.");

/* ---- 2. the halving schedule ------------------------------------- */
console.log("");
console.log("2) 30 YIL, YARILANMALARLA — yarilanma suresi her seyi degistiriyor");
console.log("");
/* Weekly release of a fixed fraction of what is left: smooth decay with no
   cliffs, which is what ALP did. The only parameter is the half-life. */
const HAFTA = 52;
const planla = (yarilanmaYil) => {
  const r = 1 - Math.pow(0.5, 1 / (yarilanmaYil * HAFTA));
  let kalan = STAKE;
  const yillik = [];
  for (let y = 0; y < 30; y++) {
    let cikan = 0;
    for (let w = 0; w < HAFTA; w++) { const c = kalan * r; kalan -= c; cikan += c; }
    yillik.push(cikan);
  }
  return { r, yillik, kalan, dagitilan: STAKE - kalan };
};

console.log("  yarilanma   haftalik oran   1. yil   5. yil   10. yil   30 yilda dagitilan");
for (const h of [3, 5, 10, 15]) {
  const p = planla(h);
  console.log("  " + (h + " yil").padStart(9) + "   %" + (p.r * 100).toFixed(4).padStart(10) +
    "   " + n(p.yillik[0] / 1e6, 1).padStart(6) + "M  " + n(p.yillik[4] / 1e6, 1).padStart(6) + "M  " +
    n(p.yillik[9] / 1e6, 1).padStart(7) + "M   " + n((p.dagitilan / STAKE) * 100, 1).padStart(8) + "%");
}
console.log("");
console.log("  ALP'nin yarilanmasi ~3 yildi: ilk yil 123M, o siradaki dolasim ~90M.");
console.log("  Ayni 600 milyon, 10 yillik yarilanmayla ilk yil 40M civari.");

/* ---- 3. what the dilution actually looks like -------------------- */
console.log("");
console.log("3) SEYRELTME — emisyon neye karsi olculuyor");
console.log("");
const e15 = egri(PIYASA, 1500, 1 / 3);
/* Circulating at the end of the curve: what buyers bought, plus the
   founder's free slice. The pool and the burn are not float. */
const dolasim0 = e15.satilan + 50_000_000;
console.log("  Mezuniyet aninda dolasim: " + n(dolasim0) +
  "   (" + n(e15.satilan) + " alici + 50.000.000 kurucu serbest)");
console.log("");
console.log("  yarilanma   1. yil emisyon   dolasima gore   5 yil sonunda dolasim");
for (const h of [3, 5, 10, 15]) {
  const p = planla(h);
  const bes = p.yillik.slice(0, 5).reduce((a, b) => a + b, 0);
  console.log("  " + (h + " yil").padStart(9) + "   " + n(p.yillik[0] / 1e6, 1).padStart(13) + "M   " +
    ("+%" + n((p.yillik[0] / dolasim0) * 100, 0)).padStart(13) + "   " +
    n(dolasim0 + bes).padStart(20));
}
console.log("");
console.log("  Emisyon yalniz STAKE EDENLERE gidiyor — yani arzi kilitleyenlere.");
console.log("  Ve ALP'de oldugu gibi, kimse stake etmezse saat ilerlemiyor.");
console.log("  Yine de bu gercek bir seyreltme; bedava versiyonu yok.");

console.log("");
console.log("ONERI");
console.log("  Yarilanma 10 yil. 30 yilda %87,5 dagitilir, 3 yarilanma gorur,");
console.log("  ilk yil ~40M — ALP'nin ucte birinden az. 'Otuz yil, yarilanmali'");
console.log("  sartini karsiliyor ve ilk yili oldurmuyor.");
console.log("");
console.log("  Acilis mcap'i icin: $1.500 kalirsa havuz $900 derinlikte acilir");
console.log("  ve $1.000'lik bir alici doldurulamaz. Piyasa dilimi 300 milyonda");
console.log("  sabitse, acilisi yukseltmek gerekiyor — $15.000 acilis $9.000");
console.log("  derinlik verir. Bu senin karari; sayilar yukarida.");
