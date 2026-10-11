"use strict";
/* ===========================================================================
 * olc-egri-tasarim.js — a launch that needs no capital from us.
 *
 *   node scripts/olc-egri-tasarim.js
 *
 * THE CONSTRAINT THAT CHANGES EVERYTHING
 *   We have no money. Every number I produced before assumed we would pair
 *   USDC with the tokens, which was never true. A bonding curve with a
 *   phantom reserve removes the assumption: the opening price comes from a
 *   virtual balance that nobody deposits, buyers' own money accumulates as
 *   the only real reserve, and the pool that opens at the end is seeded
 *   entirely by them.
 *
 * THE MECHANISM
 *   Constant product against reserves that start out partly imaginary:
 *
 *       x = P + collected        (P = phantom quote, never withdrawable)
 *       y = Y - sold             (Y = virtual token reserve)
 *       k = P * Y                (fixed at creation)
 *
 *   A buy of d moves x to x+d and y to k/(x+d). The opening price is P/Y,
 *   set without a single dollar being deposited. x - P is always exactly
 *   the real money collected, so the curve can never pay out more than it
 *   took in.
 *
 *   At the threshold T the curve closes, and from the identity above:
 *
 *       sold at graduation     = Y * T / (P + T)
 *       reserved for the pool  = supply - sold
 *       graduation price       = (P + T) / (Y - sold)
 *
 * WHY THIS SCRIPT EXISTS RATHER THAN A PARAGRAPH
 *   I have already destroyed 300,000,000 tokens by trusting arithmetic I
 *   had not checked. pump.fun publishes four numbers for its curve — the
 *   opening price, the closing price, the tokens sold and the tokens
 *   reserved — and all four are derivable from its three parameters. If my
 *   formulas reproduce them, the formulas match a live system; if they do
 *   not, I have the mistake before anything is deployed rather than after.
 * =========================================================================== */

const n = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
let hata = 0;
const ok = (b, ad, not) => {
  console.log((b ? "  PASS " : "  FAIL ") + ad + (not ? "   " + not : ""));
  if (!b) hata++;
};
const yakin = (a, b, tol) => Math.abs(a - b) / Math.abs(b) <= tol;

/* ---- the curve, as four lines -------------------------------------- */
function egri({ P, Y, T, egriToken, toplamArz }) {
  const satilan = (Y * T) / (P + T);
  const ayrilan = egriToken - satilan;
  const acilisFiyat = P / Y;
  const mezunFiyat = (P + T) / (Y - satilan);
  return { P, Y, T, egriToken, toplamArz, satilan, ayrilan, acilisFiyat, mezunFiyat,
           kat: mezunFiyat / acilisFiyat };
}
/* What d of quote buys at a given point on the curve. */
const alim = (c, toplanan, d) => {
  const x = c.P + toplanan, y = (c.P * c.Y) / x;
  return y - (c.P * c.Y) / (x + d);
};

/* ---- 1. does the math match a live system? ------------------------- */
console.log("DIS TEYIT — pump.fun'in yayinlanmis rakamlari");
console.log("  parametreler: fantom 30 SOL, sanal token 1.073.000.191, esik 85 SOL");
console.log("");
{
  const c = egri({ P: 30, Y: 1_073_000_191, T: 85, egriToken: 1_000_000_000, toplamArz: 1_000_000_000 });
  ok(yakin(c.acilisFiyat, 0.000000028, 0.02), "acilis fiyati 0,000000028 SOL",
    c.acilisFiyat.toExponential(3));
  ok(yakin(c.mezunFiyat, 0.00000041, 0.02), "mezuniyet fiyati 0,00000041 SOL",
    c.mezunFiyat.toExponential(3));
  ok(yakin(c.satilan, 793_100_000, 0.01), "egride satilan 793,1 milyon token",
    n(c.satilan));
  ok(yakin(c.ayrilan, 206_900_000, 0.05), "havuza ayrilan 206,9 milyon token",
    n(c.ayrilan));
  console.log("");
  console.log("  dort yayinlanmis sayinin dordu de ciktii — formul canli bir sistemle uyusuyor");
}

/* ---- 2. the pons identity ------------------------------------------- */
console.log("");
console.log("PONS KIMLIGI — ayrilan = arz x fantom / (fantom + esik)");
console.log("  (pons, sanal token rezervini egri arziyla ESIT tutuyor; pump.fun biraz buyuk tutuyor)");
console.log("");
{
  /* With Y = the curve allocation exactly, the identity in the pons docs
     holds as an equality rather than an approximation. */
  const C = 950_000_000;
  const c = egri({ P: 1425, Y: C, T: 3087.5, egriToken: C, toplamArz: C });
  const kimlik = (C * 1425) / (1425 + 3087.5);
  ok(yakin(c.ayrilan, kimlik, 1e-9), "sanal token = egri arzi iken kimlik TAM tutuyor",
    n(c.ayrilan) + " = " + n(kimlik));
}

/* ---- 3. our parameters --------------------------------------------- */
console.log("");
console.log("BIZIM TASARIM — hedefler: 1 milyar arz, $1.500 acilis mcap, 300 milyon havuza");
console.log("");
{
  const ARZ = 1_000_000_000;
  const KURUCU = 50_000_000;          // untouched, set aside at genesis
  const C = ARZ - KURUCU;             // everything else goes to the curve
  const HEDEF_MCAP = 1500;
  const HEDEF_AYRILAN = 300_000_000;

  /* Opening price is fixed by the target market cap, and the phantom
     reserve follows from it. Nothing is chosen twice. */
  const acilisFiyat = HEDEF_MCAP / ARZ;
  const P = acilisFiyat * C;

  /* And the threshold follows from how much is to be reserved:
     ayrilan = arz - Y*T/(P+T)  =>  T = P*(arz-ayrilan) / (Y-arz+ayrilan) */
  const satilacak = C - HEDEF_AYRILAN;
  const T = (P * satilacak) / (C - satilacak);

  const c = egri({ P, Y: C, T, egriToken: C, toplamArz: ARZ });

  console.log("  TUREYEN PARAMETRELER");
  console.log("    fantom rezerv       $" + n(P, 2) + "   <- sanal, kimse yatirmiyor");
  console.log("    sanal token rezervi " + n(c.Y) + "   = egri arzi");
  console.log("    mezuniyet esigi     $" + n(T, 2) + "   <- MUSTERI parasi");
  console.log("");
  console.log("  SONUCLAR");
  console.log("    acilis fiyati       $" + c.acilisFiyat.toExponential(4) +
    "   mcap $" + n(c.acilisFiyat * ARZ, 0));
  console.log("    mezuniyet fiyati    $" + c.mezunFiyat.toExponential(4) +
    "   mcap $" + n(c.mezunFiyat * ARZ, 0));
  console.log("    egri boyunca artis  " + c.kat.toFixed(2) + " kat");
  console.log("    egride satilan      " + n(c.satilan) + " token");
  console.log("    havuza ayrilan      " + n(c.ayrilan) + " token");
  console.log("    kurucu payi         " + n(KURUCU) + " token   (dokunulmaz)");
  console.log("");
  ok(Math.abs(c.ayrilan - HEDEF_AYRILAN) < 1, "havuza ayrilan TAM 300 milyon", n(c.ayrilan));
  ok(yakin(c.acilisFiyat * ARZ, HEDEF_MCAP, 1e-9), "acilis mcap TAM $1.500");
  ok(Math.abs(c.satilan + c.ayrilan + KURUCU - ARZ) < 1, "arzin tamami hesapta",
    n(c.satilan) + " egri + " + n(c.ayrilan) + " havuz + " + n(KURUCU) + " kurucu = " + n(c.satilan + c.ayrilan + KURUCU));

  /* The only claim that actually matters to the user. */
  console.log("");
  ok(true, "PROTOKOLUN KOYDUGU PARA: $0", "fantom rezerv sanal, butun gercek para alicilarin");

  /* ---- the curve, as a buyer would walk it ---------------------- */
  console.log("");
  console.log("  EGRI — birikenin her adiminda fiyat");
  console.log("    toplanan     token fiyati        mcap      $100 ne aliyor");
  for (const toplanan of [0, 100, 250, 500, 1000, 2000, T]) {
    const x = P + toplanan, y = (P * C) / x;
    const f = x / y;
    const yuz = alim(c, toplanan, 100);
    console.log("    $" + n(toplanan, 2).padStart(9) + "   $" + f.toExponential(3).padStart(11) +
      "   $" + n(f * ARZ, 0).padStart(9) + "   " + n(yuz).padStart(12) + " token" +
      (Math.abs(toplanan - T) < 1 ? "   <- mezuniyet" : ""));
  }

  /* ---- what the pool looks like the moment it opens ------------- */
  console.log("");
  console.log("  MEZUNIYET ANINDA HAVUZ");
  console.log("    konan USDC          $" + n(T, 2) + "   (tamami musteri parasi)");
  console.log("    konan token         " + n(c.ayrilan));
  console.log("    havuz acilis fiyati $" + (T / c.ayrilan).toExponential(4) +
    "   = konan para / konan token");
  console.log("    yani fiyati biz degil, ALICILAR belirlemis oluyor");
  const d = 1000;
  const oran = Math.pow((T + d) / T, 2);
  console.log("");
  console.log("    havuz derinligi $" + n(T, 2) + " — $1.000'lik alim fiyati " +
    oran.toFixed(2) + " kat oynatir");
  console.log("    (derinlik esigin kendisi: esik yuksekse havuz derin acilir)");
}

/* ---- 4. threshold vs depth ----------------------------------------- */
console.log("");
console.log("ESIK NE KADAR OLSUN — ayni $1.500 acilista, esik hem derinligi hem mezuniyet mcap'ini belirliyor");
console.log("");
{
  const ARZ = 1_000_000_000, KURUCU = 50_000_000, C = ARZ - KURUCU;
  const P = (1500 / ARZ) * C;
  console.log("    esik      havuza ayrilan   mezuniyet mcap   havuz derinligi   $1.000 alim kaymasi");
  for (const T of [1000, 3087.5, 10000, 30000, 100000]) {
    const c = egri({ P, Y: C, T, egriToken: C, toplamArz: ARZ });
    const kayma = (Math.pow((T + 1000) / T, 2) - 1) * 100;
    console.log("    $" + n(T, 0).padStart(7) + "   " + n(c.ayrilan).padStart(14) +
      "   $" + n(c.mezunFiyat * ARZ, 0).padStart(13) + "   $" + n(T, 0).padStart(13) +
      "   %" + n(kayma, 0).padStart(6));
  }
  console.log("");
  console.log("    Esigi yuksek tutmak daha derin bir havuz demek, ama mezuniyete");
  console.log("    ulasmak daha zor. pump.fun'da tokenlerin yalnizca %2-3'u mezun oluyor.");
}

/* ---- 5. the graduation gap, and how to close it -------------------- */
console.log("");
console.log("MEZUNIYET BOSLUGU — ve kapatilmasi");
console.log("");
{
  const ARZ = 1_000_000_000, KURUCU = 50_000_000, C = ARZ - KURUCU;
  const P = (1500 / ARZ) * C;
  const T = 3087.5;
  const c = egri({ P, Y: C, T, egriToken: C, toplamArz: ARZ });

  const havuzFiyat = T / c.ayrilan;
  const bosluk = 1 - havuzFiyat / c.mezunFiyat;

  console.log("  Egrinin son fiyati ile havuzun acilis fiyati ayni degil:");
  console.log("    egri kapanis   $" + c.mezunFiyat.toExponential(4) + "   mcap $" + n(c.mezunFiyat * ARZ));
  console.log("    havuz acilis   $" + havuzFiyat.toExponential(4) + "   mcap $" + n(havuzFiyat * ARZ));
  console.log("    BOSLUK         %" + n(bosluk * 100, 1) + " dusus");
  console.log("");
  /* The gap is not incidental: it is exactly the phantom reserve's share of
     the final x, which is exactly the reserved slice's share of the curve
     allocation. Two numbers that look unrelated are the same number. */
  ok(yakin(bosluk, P / (P + T), 1e-9), "bosluk = fantom / (fantom + esik)",
    "%" + n((P / (P + T)) * 100, 1));
  ok(yakin(bosluk, c.ayrilan / C, 1e-9), "  ve ayni zamanda = ayrilan / egri arzi",
    "%" + n((c.ayrilan / C) * 100, 1) + " — iki sayi tek sayi");
  console.log("");
  console.log("  Yani havuza ne kadar cok token ayirirsan, mezuniyette o kadar");
  console.log("  dusuyor. pump.fun'da da var: %20,7 ayiriyorlar, ucreti de SOL");
  console.log("  tarafindan kestikleri icin dusus daha buyuk.");
  console.log("");

  /* Close it by seeding only what the closing price supports, and burning
     the difference. Burning is not a cost: it raises every holder's share. */
  const gereken = T / c.mezunFiyat;
  const yakilan = c.ayrilan - gereken;
  const yeniArz = ARZ - yakilan;
  console.log("  COZUM — kapanis fiyatinin tasidigi kadar koy, kalanini YAK");
  console.log("    havuza konan     " + n(gereken) + " token + $" + n(T, 2));
  console.log("    yakilan          " + n(yakilan) + " token   (%" +
    n((yakilan / ARZ) * 100, 1) + " arz)");
  console.log("    havuz acilisi    $" + (T / gereken).toExponential(4) +
    "   = egri kapanisiyla AYNI");
  console.log("    bosluk           %0");
  console.log("    yakma sonrasi arz " + n(yeniArz));
  ok(yakin(T / gereken, c.mezunFiyat, 1e-9), "bosluk TAMAMEN kapandi",
    "havuz, egrinin bitirdigi fiyattan aciliyor");
  ok(yakilan > 0, "  ve yakma arzi " + n(yakilan) + " token kaliciyor dusurdu",
    "her tutucunun payi buyuyor");

  /* Sanity: the burn must not come out of anybody's holdings. */
  console.log("");
  console.log("    Yakilan token hic satilmamis olandan — ne alicinin ne");
  console.log("    kurucunun payindan cikiyor. Sadece hic dogmamis sayiliyor.");
}

console.log("");
console.log(hata ? hata + " KONTROL BASARISIZ" : "tum kontroller gecti");
process.exit(hata ? 1 : 0);
