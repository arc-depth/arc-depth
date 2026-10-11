"use strict";
/* ===========================================================================
 * olc-yeni-token-aritmetigi.js — does the redesign's floor actually hold?
 *
 *   node scripts/olc-yeni-token-aritmetigi.js
 *
 * docs/token-redesign.md claims three things: minting leaves the floor
 * unchanged, redeeming leaves it unchanged, and fees raise it. Those are
 * claims about integer arithmetic with two different decimal scales, and
 * the last design died because exactly that kind of claim was assumed
 * instead of checked.
 *
 * So this runs the arithmetic before any of it is written in Solidity:
 * 6-decimal USDC against an 18-decimal token, division rounding down in
 * both directions, thousands of random operations, asserting after every
 * single one that the floor never fell.
 *
 * It also checks the thing an attacker would try first — mint, wait for a
 * fee, redeem — and the thing a careless implementation gets wrong, which
 * is a round trip that returns more than it cost.
 * =========================================================================== */

let hata = 0;
const ok = (b, ad, not) => {
  console.log((b ? "  PASS " : "  FAIL ") + ad + (not ? "   " + not : ""));
  if (!b) hata++;
};

/* ---- the whole design, as arithmetic -------------------------------- */
const SEED_USDC = 1_000_000n;          // $1 of genesis seed, unredeemable
const BIR_USDC = 1_000_000n;           // 6 decimals
const OLCEK = 1_000_000_000_000n;      // 6 -> 18 decimals, for genesis only

function yeniKasa() {
  return { hazine: 0n, arz: 0n, tohum: 0n };
}

/* floor = hazine/arz, compared as a cross-multiplied fraction so it is
   never materialised as a scaled number — the mistake that cost 300M. */
const tabanDaha = (a, b) => a.hazine * b.arz - b.hazine * a.arz;  // >0 means a > b

function bas(k, usdcIn) {
  if (usdcIn <= 0n) throw new Error("sifir giris");
  let cikan;
  if (k.arz === 0n) {
    /* Genesis fixes a denomination, not a price: one token per USDC. */
    cikan = usdcIn * OLCEK;
  } else {
    cikan = (usdcIn * k.arz) / k.hazine;      // rounds DOWN, in the floor's favour
  }
  if (cikan === 0n) throw new Error("toz giris, sifir token");
  k.hazine += usdcIn;
  k.arz += cikan;
  return cikan;
}

function itfa(k, token) {
  if (token <= 0n) throw new Error("sifir itfa");
  const cekilebilir = k.arz - k.tohum;
  if (token > cekilebilir) throw new Error("tohum itfa edilemez");
  const cikan = (token * k.hazine) / k.arz;   // rounds DOWN, in the floor's favour
  k.hazine -= cikan;
  k.arz -= token;
  return cikan;
}

const ucret = (k, usdc) => { k.hazine += usdc; };

/* ---- genesis -------------------------------------------------------- */
console.log("genesis");
{
  const k = yeniKasa();
  const t = bas(k, SEED_USDC);
  k.tohum = t;
  ok(k.arz === SEED_USDC * OLCEK, "1 USDC -> 1 token", (Number(t) / 1e18) + " token");
  ok(k.hazine === SEED_USDC, "hazine 1 USDC");
  /* The claim per token has to be exactly one dollar's worth at genesis. */
  ok(k.hazine * 10n ** 18n === k.arz * 1n * 10n ** 6n / 1n * 1n,
    "taban = $1,00 / token",
    "$" + (Number(k.hazine) / 1e6 / (Number(k.arz) / 1e18)).toFixed(6));
  let battı = false;
  try { itfa(k, t); } catch (e) { battı = true; }
  ok(battı, "TOHUM ITFA EDILEMIYOR", "arz ve hazine asla sifirlanamaz");
}

/* ---- the three claims ----------------------------------------------- */
console.log("");
console.log("ucuncu kisinin islemleri tabani dusurebiliyor mu");
{
  const k = yeniKasa();
  k.tohum = bas(k, SEED_USDC);

  const once = { hazine: k.hazine, arz: k.arz };
  const t = bas(k, 1000n * BIR_USDC);
  ok(tabanDaha(k, once) === 0n, "BASIM tabani ZERRE degistirmedi",
    (Number(t) / 1e18).toLocaleString("en-US") + " token basildi");

  const once2 = { hazine: k.hazine, arz: k.arz };
  const geri = itfa(k, t / 2n);
  ok(tabanDaha(k, once2) >= 0n, "ITFA tabani dusurmedi",
    "$" + (Number(geri) / 1e6).toFixed(2) + " cikti");

  const once3 = { hazine: k.hazine, arz: k.arz };
  ucret(k, 50n * BIR_USDC);
  ok(tabanDaha(k, once3) > 0n, "UCRET tabani YUKSELTTI",
    "$" + (Number(k.hazine) / 1e6 / (Number(k.arz) / 1e18)).toFixed(8) + " / token");
}

/* ---- a round trip must never pay ------------------------------------ */
console.log("");
console.log("gidis-donus kar ediyor mu");
{
  const k = yeniKasa();
  k.tohum = bas(k, SEED_USDC);
  bas(k, 10_000n * BIR_USDC);
  for (const usd of [1n, 7n, 100n, 2_500n, 50_000n]) {
    const giren = usd * BIR_USDC;
    const t = bas(k, giren);
    const cikan = itfa(k, t);
    ok(cikan <= giren, "$" + usd + " gidis-donus kar ETMIYOR",
      "giren $" + (Number(giren) / 1e6).toFixed(2) + " -> cikan $" + (Number(cikan) / 1e6).toFixed(6));
  }
}

/* ---- the attack the delay exists for -------------------------------- */
console.log("");
console.log("ucret yagmasi — 24 saatlik gecikmenin varlik sebebi");
{
  const k = yeniKasa();
  k.tohum = bas(k, SEED_USDC);
  bas(k, 1_000n * BIR_USDC);          // honest holders

  const giren = 100_000n * BIR_USDC;  // a large position, placed deliberately
  const t = bas(k, giren);
  ucret(k, 30n * BIR_USDC);           // the biggest single fee: 2% of a $1,500 launch
  const cikan = itfa(k, t);
  const kar = Number(cikan - giren) / 1e6;
  ok(kar > 0, "gecikme OLMADAN saldiri KARLI",
    "$" + kar.toFixed(2) + " — $" + (Number(giren) / 1e6).toLocaleString("en-US") + " riske atarak");
  ok(kar < 30, "  ama kar tek ucret olayiyla sinirli",
    "ucretin %" + ((100 * kar) / 30).toFixed(1) + "'i");
  console.log("    -> 24 saat bekleme zorunlulugu bunu bir gunluk risk haline getiriyor");
}

/* ---- thousands of random operations -------------------------------- */
console.log("");
console.log("rastgele 20.000 islem — taban bir kez bile dustu mu");
{
  const k = yeniKasa();
  k.tohum = bas(k, SEED_USDC);
  /* A deterministic generator, so a failure can be reproduced. */
  let s = 42n;
  const rnd = (n) => { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return s % n; };

  let basim = 0, itfaS = 0, ucretS = 0, reddedilen = 0;
  let endusuk = null, sahipler = [];

  for (let i = 0; i < 20000; i++) {
    const once = { hazine: k.hazine, arz: k.arz };
    const secim = rnd(100n);
    try {
      if (secim < 45n) {
        const t = bas(k, 1n + rnd(5_000n * BIR_USDC));
        sahipler.push(t); basim++;
      } else if (secim < 85n && sahipler.length) {
        const j = Number(rnd(BigInt(sahipler.length)));
        const t = sahipler[j];
        const kismi = t / (1n + rnd(4n));
        if (kismi > 0n) { itfa(k, kismi); sahipler[j] = t - kismi; itfaS++; }
        if (sahipler[j] === 0n) sahipler.splice(j, 1);
      } else {
        ucret(k, 1n + rnd(100n * BIR_USDC)); ucretS++;
      }
    } catch (e) { reddedilen++; continue; }

    if (tabanDaha(k, once) < 0n) {
      ok(false, "TABAN DUSTU, islem " + i, "secim=" + secim);
      break;
    }
    const t = Number(k.hazine) / 1e6 / (Number(k.arz) / 1e18);
    if (endusuk === null || t < endusuk) endusuk = t;
  }
  ok(hata === 0, "20.000 islemin HICBIRI tabani dusurmedi",
    basim + " basim, " + itfaS + " itfa, " + ucretS + " ucret, " + reddedilen + " reddedildi");
  const son = Number(k.hazine) / 1e6 / (Number(k.arz) / 1e18);
  ok(son >= 1, "taban baslangictaki $1'in altina hic inmedi",
    "son taban $" + son.toFixed(6) + ", gorulen en dusuk $" + endusuk.toFixed(6));
  console.log("    son hazine $" + (Number(k.hazine) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 }) +
    "   arz " + (Number(k.arz) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 }));
}

/* ---- and the mistake that killed ALP -------------------------------- */
console.log("");
console.log("6 ve 18 ondalik bir arada");
{
  const k = yeniKasa();
  k.tohum = bas(k, SEED_USDC);
  const t = bas(k, BIR_USDC);
  ok(Number(t) / 1e18 === 1, "$1 tam 1 token aliyor", (Number(t) / 1e18).toString());
  ucret(k, 999_999n * BIR_USDC);              // the treasury grows a millionfold

  /* What $1 should buy is a question with one answer — the floor — so the
     expectation is derived from the floor rather than written down. The
     first version of this check hardcoded 1e-6 and failed, because it
     forgot the genesis seed is part of the supply. Deriving it removes the
     chance to be wrong about that twice. */
  const hazineOnce = k.hazine, arzOnce = k.arz;
  const t2 = bas(k, BIR_USDC);
  const beklenen = (BIR_USDC * arzOnce) / hazineOnce;
  ok(t2 === beklenen, "hazine 1.000.000 kat buyuyunce $1 tam tabandan aliyor",
    (Number(t2) / 1e18).toExponential(6) + " token, taban $" +
    (Number(hazineOnce) / 1e6 / (Number(arzOnce) / 1e18)).toLocaleString("en-US", { maximumFractionDigits: 2 }));

  /* And the dollar has to come back out, which is the only property that
     matters to whoever paid it. */
  const geri = (t2 * hazineOnce) / arzOnce;
  ok(geri <= BIR_USDC && geri >= BIR_USDC - 2n,
    "  ve odedigi dolar ayni tabandan geri cikiyor",
    "$" + (Number(geri) / 1e6).toFixed(6) + " (yuvarlama " + (BIR_USDC - geri) + " wei)");
  /* The ALP failure in one line: a 1e18-scaled price here would have been
     out by 1e12 and nobody would have noticed until the tokens were gone. */
  const yanlis = (BIR_USDC * 10n ** 18n) / (k.hazine * 10n ** 18n / k.arz);
  ok(yanlis === t2, "oran matematigi olcekli fiyatla ayni sonucu veriyor",
    "burada ayni; ALP'yi olduren olcegin ayni OLMAMASIYDI");
}

console.log("");
console.log(hata ? hata + " KONTROL BASARISIZ" : "tum kontroller gecti");
process.exit(hata ? 1 : 0);
