"use strict";
/* ===========================================================================
 * olc-fiyat-baskisi.js — who moves the price, and by how much.
 *
 *   node scripts/olc-fiyat-baskisi.js
 *
 * The question is simple and deserves numbers rather than adjectives: when
 * buying pressure arrives, what happens; when selling pressure arrives,
 * what happens; and who decides. Nobody decides — that is the answer — so
 * this prints the formula's answer at several points instead.
 *
 * Two phases, two different mechanisms, and they must join without a step:
 *   1. the curve, from launch to graduation
 *   2. a locked Uniswap position, after
 *
 * And for a collateral-backed launch there is a third fact: the price has
 * a floor it cannot go under, because the vault will always buy at it.
 * =========================================================================== */

const n = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const ARZ = 1_000_000_000;

/* ---- the curve ----------------------------------------------------- */
const FANTOM = 1350, SANAL = 900_000_000, ESIK = 2700;
const K = FANTOM * SANAL;
const xAt = (toplanan) => FANTOM + toplanan;
const yAt = (toplanan) => K / xAt(toplanan);
const fiyat = (toplanan) => xAt(toplanan) / yAt(toplanan);
const mcap = (toplanan) => fiyat(toplanan) * ARZ;
/* Tokens received for d, and quote received for selling tok. */
const alim = (toplanan, d) => yAt(toplanan) - K / (xAt(toplanan) + d);
const satis = (toplanan, tok) => {
  const x = xAt(toplanan);
  return x - (K * x) / (K + tok * x);
};

console.log("1) EGRI — launch'tan mezuniyete");
console.log("");
console.log("  Fiyat = (fantom + toplanan) / (egride kalan token)");
console.log("  Alim: para girer, token cikar -> ikisi de fiyati YUKARI iter");
console.log("  Satim: token girer, para cikar -> ikisi de fiyati ASAGI iter");
console.log("  Karar veren yok. Formul, net alima gore hareket ediyor.");
console.log("");
console.log("    toplanan      mcap    $100 ALIM sonrasi    $100'lik SATIM sonrasi");
console.log("                          mcap      degisim    mcap      degisim");
for (const t of [0, 250, 500, 1000, 2000, ESIK]) {
  const m0 = mcap(t);
  /* buy */
  const m1 = mcap(t + 100);
  /* sell: how many tokens is $100 worth here, then sell them */
  const tok = 100 / fiyat(t);
  const geri = Math.min(satis(t, tok), t);
  const m2 = mcap(t - geri);
  console.log("    $" + n(t, 2).padStart(8) + "   $" + n(m0).padStart(7) +
    "   $" + n(m1).padStart(7) + "  +%" + n(100 * (m1 / m0 - 1), 1).padStart(5) +
    "   $" + n(m2).padStart(7) + "  -%" + n(100 * (1 - m2 / m0), 1).padStart(5));
}

console.log("");
console.log("  SIMETRIK: ayni egri, iki yon. $100 alim ne kadar yukari iterse,");
console.log("  $100'luk satim neredeyse o kadar asagi iter. Birisi fiyati");
console.log("  'ayarlamiyor' — alanlar ve satanlar birbirine karsi hareket ediyor.");
console.log("");
console.log("  Basta hassas, sonra sakin:");
const bas = 100 * (mcap(100) / mcap(0) - 1);
const son = 100 * (mcap(ESIK) / mcap(ESIK - 100) - 1);
console.log("    ilk $100 fiyati  +%" + n(bas, 1) + " oynatiyor");
console.log("    son  $100 fiyati  +%" + n(son, 1) + " oynatiyor");
console.log("    cunku kitap buyudu: ayni para daha kucuk bir yuzde.");

/* ---- after graduation --------------------------------------------- */
console.log("");
console.log("2) MEZUNIYETTEN SONRA — Uniswap");
console.log("");
const kalan = yAt(ESIK);
const havuzToken = (ESIK * kalan) / xAt(ESIK);
const havuzUsdc = ESIK;
const yakilan = kalan - havuzToken;
const yeniArz = ARZ - yakilan;
console.log("  havuzda   $" + n(havuzUsdc, 2) + " + " + n(havuzToken) + " token");
console.log("  yakilan   " + n(yakilan) + " token -> arz " + n(yeniArz));
console.log("  acilis    $" + (havuzUsdc / havuzToken).toExponential(4) +
  "   = egrinin bitirdigi fiyat, bosluk yok");
console.log("");
console.log("  Buradan sonra fiyati UNISWAP belirliyor. Ayni carpim kurali,");
console.log("  ama artik kitap herkese acik: isteyen likidite ekler, isteyen");
console.log("  cikarir. Bizim koydugumuz pozisyon KILITLI, yani cekilemez —");
console.log("  derinlik sadece artabilir.");
console.log("");
console.log("    alim        fiyat kac kat    yeni mcap");
const U = havuzUsdc, T = havuzToken;
const acilisMcap = (U / T) * yeniArz;
for (const d of [100, 500, 1000, 5000, 20000]) {
  const kat = Math.pow((U + d) / U, 2);
  console.log("    $" + n(d).padStart(7) + "   " + kat.toFixed(2).padStart(10) + " kat" +
    "   $" + n(acilisMcap * kat).padStart(12));
}
console.log("");
console.log("    satim       fiyat kac kat    yeni mcap");
for (const d of [100, 500, 1000, 2000]) {
  /* selling tokens worth d at the current price */
  const tok = d / (U / T);
  const kat = Math.pow(T / (T + tok), 2);
  console.log("    $" + n(d).padStart(7) + "   " + kat.toFixed(2).padStart(10) + " kat" +
    "   $" + n(acilisMcap * kat).padStart(12));
}

/* ---- a collateral-backed launch ----------------------------------- */
console.log("");
console.log("3) MUSTERI LAUNCH'I — ustelik bir TABANI var");
console.log("");
const YAT = 1000, UCRET = 20;
const kasa = YAT - UCRET + (UCRET * 3000) / 10000;
const taban = kasa / ARZ;
const EGRI_T = 300_000_000;
const P2 = taban * EGRI_T;
const K2 = P2 * EGRI_T;
const ESIK2 = (P2 * (EGRI_T - 100_000_000)) / 100_000_000;
const f2 = (tp) => (P2 + tp) / (K2 / (P2 + tp));

console.log("  musteri $" + n(YAT, 2) + " yatirdi -> kasada $" + n(kasa, 2) + " gercek hisse");
console.log("  TABAN   $" + taban.toExponential(4) + " / token   = kasa / arz");
console.log("  egri bu tabandan aciliyor — uydurma fiyat yok");
console.log("");
console.log("    toplanan      mcap        taban mcap    tabanin kac kati");
for (const t of [0, 100, 300, ESIK2]) {
  const m = f2(t) * ARZ;
  console.log("    $" + n(t, 2).padStart(8) + "   $" + n(m).padStart(8) +
    "   $" + n(taban * ARZ).padStart(9) + "   " + (m / (taban * ARZ)).toFixed(2).padStart(8) + " kat");
}
console.log("");
console.log("  SATIM BASKISINDA NE OLUYOR");
console.log("    Egride satis fiyati asagi iter — ama en dibi TABAN.");
console.log("    Herkes her tokeni geri satsa, toplanan sifirlanir ve fiyat");
console.log("    tam $" + taban.toExponential(4) + "'a, yani kasanin itfa fiyatina gelir.");
console.log("    Daha asagi inemez: formulde x asla fantomun altina dusmuyor.");
console.log("");
console.log("    Mezuniyetten sonra Uniswap fiyati tabanin ALTINA inebilir,");
console.log("    ama orada durmaz: ucuza alip kasaya itfa etmek kar olur, o");
console.log("    yuzden arbitraj tabana geri iter. Mekanik degil ekonomik");
console.log("    taban — ve kasa kalici oldugu icin suresiz.");
console.log("");
console.log("  BIR MEME COIN'DEN FARKI");
console.log("    pump.fun tokeninin dibi sifir. Bunun dibi kasadaki gercek");
console.log("    hisse. Fiyat $" + taban.toExponential(2) + " ile sinirsiz arasinda");
console.log("    hareket ediyor, ve alt sinir bizim sozumuz degil, kontratin");
console.log("    icinde duran bir hisse.");
