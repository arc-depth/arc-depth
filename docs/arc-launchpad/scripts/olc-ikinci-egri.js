"use strict";
/* ===========================================================================
 * olc-ikinci-egri.js — the phantom reserve is the lever; what is left of it
 *                      now that one curve is already deployed.
 *
 *   node scripts/olc-ikinci-egri.js
 *
 * THE LEVER, AND WHAT I DID WITH IT
 *   The phantom reserve sets the opening price, and the threshold follows
 *   from it:
 *
 *     fantom = acilisFiyat * egriToken
 *     esik   = fantom * (egriToken - ayrilan) / ayrilan
 *
 *   With the reserve set to a third of the curve, esik works out to exactly
 *   the opening market cap. So choosing a $15,000 opening chose a $15,000
 *   threshold. I argued that from depth — a thinner book cannot fill the
 *   first serious buyer — and did not weigh hard enough that $15,000 of
 *   buying has to arrive before any of it happens.
 *
 * WHAT IS STILL MOVABLE
 *   Nothing on the deployed curve: FANTOM and ESIK are immutable, which is
 *   the property that makes them worth trusting. The lever only exists for
 *   a curve that does not exist yet, and a second curve needs tokens — and
 *   the only unlocked tokens are the founder's.
 *
 *   So this prices the option rather than recommending it, including the
 *   part that counts against it: a second venue for the same token is
 *   postmortem mistake #10, and the only thing that makes it tolerable is
 *   opening it at the price the first one is already at.
 * =========================================================================== */

const ARC_ARZ = 1_000_000_000;
const n = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });

/* The deployed curve, for reference. */
const MEVCUT = { C: 500_000_000, fantom: 7_500, esik: 15_000, toplanan: 0.49 };
const MEVCUT_FIYAT = 1.5002e-5;

const egri = (C, fiyat, ayrilanPay) => {
  const P = fiyat * C;
  const ayrilan = C * ayrilanPay;
  const T = (P * (C - ayrilan)) / ayrilan;
  const kapanis = (P + T) / ayrilan;
  const havuzToken = T / kapanis;
  return { P, T, ayrilan, satilan: C - ayrilan, havuzToken,
           yakilan: ayrilan - havuzToken, mezunMcap: kapanis * ARC_ARZ };
};

console.log("DAGITILMIS EGRI");
console.log("  egride           " + n(MEVCUT.C) + " DEPTH");
console.log("  fantom           $" + n(MEVCUT.fantom) + "   IMMUTABLE");
console.log("  esik             $" + n(MEVCUT.esik) + "   IMMUTABLE");
console.log("  toplanan         $" + MEVCUT.toplanan.toFixed(2));
console.log("  eksik            $" + n(MEVCUT.esik - MEVCUT.toplanan, 2));
console.log("");
console.log("  Bu egride oynatacak hicbir sey yok. Kaldirac yalniz henuz");
console.log("  var olmayan bir egri icin duruyor.");
console.log("");

console.log("IKINCI BIR EGRI — kurucunun 50.000.000'uyla");
console.log("");
console.log("  Ayni fiyattan acilmasi SART: baska bir fiyat, ayni token icin");
console.log("  iki ayri deger demek olur ve her fiyat sitesi birini yanlis");
console.log("  gosterir. ALP'de tam bu oldu.");
console.log("");
console.log("    egriye konan   fantom      ESIK      mezuniyet mcap   havuz derinligi");
for (const C of [10_000_000, 25_000_000, 50_000_000]) {
  const e = egri(C, MEVCUT_FIYAT, 1 / 3);
  console.log("    " + n(C).padStart(12) + "   $" + n(e.P).padStart(7) +
    "   $" + n(e.T).padStart(7) + "   $" + n(e.mezunMcap).padStart(13) +
    "   $" + n(e.T).padStart(13));
}
console.log("");
console.log("  Esik, konan token miktariyla dogru orantili. 50 milyon koymak");
console.log("  $1.500'luk bir esik demek — elde $7 varken bu da uzak, ama");
console.log("  $15.000'in onda biri.");
console.log("");

console.log("DAHA KUCUK BIR ESIK ICIN NE GEREKIYOR");
console.log("");
console.log("  Esigi dusurmenin iki yolu var ve ikisi de bir seyi feda ediyor:");
console.log("");
console.log("    1. Daha az token koymak -> esik duser, ama mezun olan havuza");
console.log("       giren token de duser, yani piyasa daha kucuk olur.");
console.log("    2. Daha dusuk fiyattan acmak -> esik duser, ama o zaman ayni");
console.log("       token iki ayri fiyattan satiliyor olur. Bu kabul edilemez.");
console.log("");
console.log("    esik    gereken token (ayni fiyattan)   mezun havuz tokeni");
for (const hedefEsik of [100, 250, 500, 1_000, 1_500]) {
  /* esik = fiyat * C * 2  (with a third reserved), so C = esik / (2*fiyat) */
  const C = hedefEsik / (2 * MEVCUT_FIYAT);
  const e = egri(C, MEVCUT_FIYAT, 1 / 3);
  console.log("    $" + n(hedefEsik).padStart(5) + "   " + n(C).padStart(26) +
    "   " + n(e.havuzToken).padStart(19));
}
console.log("");

console.log("DURUST DEGERLENDIRME");
console.log("  Elde $7,34 var. Yukaridaki esiklerin EN KUCUGU bile $100 ve o da");
console.log("  13,3 milyon token gerektiriyor — yani kurucu payindan.");
console.log("");
console.log("  Yani kaldirac gercek ama bugun cozmuyor: sorun esigin buyuklugu");
console.html = 0;
console.log("  degil, elde para olmamasi. $100'luk bir esik bile $100 alim");
console.log("  bekliyor.");
console.log("");
console.log("  UC SECENEK");
console.log("    A. Mevcut egri calissin, alici gelsin. $15.000 pump.fun'in");
console.log("       esigiyle ayni mertebede ve oraya varan binlerce token var.");
console.log("       Maliyeti: beklemek. Kurucu payindan hicbir sey cikmaz.");
console.log("");
console.log("    B. Ikinci egri, kurucunun tokeniyle, ayni fiyattan, kucuk");
console.log("       esikle. Daha hizli mezun olur ve DexScreener'a daha cabuk");
console.log("       girer. Maliyeti: kurucu payindan token, ve ayni token icin");
console.log("       iki satis yeri — birincisi 500 milyonuyla orada durmaya");
console.log("       devam eder.");
console.log("");
console.log("    C. Hicbir sey. Egri duruyor, fiyat duruyor, kimse zarar");
console.log("       gormuyor.");
