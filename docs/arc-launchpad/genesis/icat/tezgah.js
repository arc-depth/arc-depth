"use strict";
/* ===========================================================================
 * genesis/icat/tezgah.js — GENESIS INVENTION ENGINE: the test bench
 *
 *   node genesis/icat/tezgah.js [deney] [--tohumlar 20]
 *     deney: karsilastirma | duvar-tarama | panik
 *
 * Liquidity designs are raced against the same seeded order flow and
 * measured on what a design is for. Everything here is a simulation; the
 * bench deploys nothing and touches no contract.
 *
 * DESIGNS
 *   CP        constant product x·y = k, full range, seeded with dollars X0
 *             and tokens at the opening price (the usual memecoin pool)
 *   MERDIVEN  ARC PULSE today, simplified: a ladder of tokens sold upward
 *             in N steps from the opening price (each step one price, like
 *             a narrow v4 range); a dollar bid just below the open; and the
 *             token's vault, fed by the collateral tax on every trade,
 *             redeeming any token at floor = vault / circulating.
 *             A seller sells to the pool while the pool pays more (after
 *             tax) than the floor, and redeems the rest at the floor.
 *   DUVAR     candidate: MERDIVEN, plus a share of the vault's dollars
 *             standing as a bid at floor × (1 + band). It buys from sellers
 *             before they reach the floor and burns what it buys.
 *             The trade-off is exact and the bench measures it: each token
 *             the wall buys pays the seller band × floor more than the
 *             floor, and that premium comes out of the claim of everyone
 *             still holding — the floor dips by (band × floor × t) /
 *             (circulating − t). The wall is bounded by its share, so the
 *             dip is bounded too.
 *
 * MEASURES
 *   geriDonus    dollars traders took out ÷ dollars they put in
 *   enKotuEtki   largest single-trade price move
 *   sonTaban     floor after the flow; tabanDususu: worst floor fall
 *   panikCikis   in a crash (every holder sells), dollars per token the
 *                last seller gets, ÷ the floor before the crash
 *   sermaye      dollars a design needs at the start
 * Results: genesis/icat/sonuclar/<deney>.json; Proof of Invention for the
 * candidate: genesis/icat/sonuclar/DUVAR-proof-of-invention.md.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const SONUC = path.join(__dirname, "sonuclar");
const arg = (ad, v) => { const i = process.argv.indexOf(ad); return i > 0 ? process.argv[i + 1] : v; };

/* seeded PRNG (mulberry32): the same seed gives the same flow to every design */
function prng(tohum) {
  let a = tohum >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const ARZ = 1e9;               // tokens in every launch
const ACILIS = 3500 / ARZ;     // dollars per token at the open
const ILK_ALIM = 200;          // the founder's first buy, dollars
const KURUCU_TOKEN = (ILK_ALIM * 0.98) / ACILIS;

/* ---- CP --------------------------------------------------------------- */
function CP({ X0 = 500, vergi = 0 } = {}) {
  let x = X0, y = X0 / ACILIS, dolasan = KURUCU_TOKEN;
  return {
    ad: "CP", sermaye: X0,
    al(d) { const k = x * y; const y2 = k / (x + d); const t = y - y2; x += d; y = y2; dolasan += t; return t; },
    sat(t) { const k = x * y; const x2 = k / (y + t); const d = x - x2; y += t; x = x2; dolasan -= t; return d; },
    fiyat: () => x / y, taban: () => 0, kasa: () => 0, dolasim: () => dolasan
  };
}

/* ---- MERDIVEN (and DUVAR on top of it) -------------------------------- */
function MERDIVEN({ N = 400, carpan = 1.02, teklif = 50, teklifIndirim = 0.05, kasa0 = 20, vergi = 0.03, duvarPayi = 0, bant = 0 } = {}) {
  const kap = (0.86 * ARZ) / N;
  const fiyatlar = Array.from({ length: N }, (_, i) => ACILIS * Math.pow(carpan, i));
  const satilan = new Array(N).fill(0);    // tokens sold out of each step (their dollars sit there)
  let ust = 0;                              // lowest step with tokens left
  let teklifDolar = teklif;
  const teklifFiyat = ACILIS * (1 - teklifIndirim);
  let kasa = kasa0, dolasan = KURUCU_TOKEN, son = ACILIS;
  let duvar = duvarPayi > 0 ? kasa * duvarPayi : 0;   // dollars standing in the wall (part of kasa)
  const taban = () => (dolasan > 0 ? kasa / dolasan : 0);

  const o = {
    ad: duvarPayi > 0 ? "DUVAR" : "MERDIVEN",
    sermaye: teklif + kasa0,
    al(d) {
      kasa += d * vergi;
      if (duvarPayi > 0) duvar = kasa * duvarPayi;
      let net = d * (1 - vergi), t = 0;
      while (net > 1e-12 && ust < N) {
        const kalanTok = kap - satilan[ust];
        const s = Math.min(kalanTok, net / fiyatlar[ust]);
        satilan[ust] += s; net -= s * fiyatlar[ust]; t += s; son = fiyatlar[ust];
        if (satilan[ust] >= kap - 1e-9) ust++;
      }
      dolasan += t;
      return t;
    },
    sat(t) {
      let kalan = t, brut = 0, itfa = 0;
      /* 1. the pool, while it pays (after tax) more than the floor and the wall */
      let i = Math.min(ust, N - 1);
      while (kalan > 1e-12 && i >= 0) {
        if (satilan[i] <= 0) { i--; continue; }
        const net = fiyatlar[i] * (1 - vergi);
        const alternatif = Math.max(taban(), duvar > 0 ? taban() * (1 + bant) : 0);
        if (net <= alternatif) break;
        const s = Math.min(satilan[i], kalan);
        satilan[i] -= s; kalan -= s; brut += s * fiyatlar[i]; son = fiyatlar[i];
        if (i < ust) ust = i;
        i--;
      }
      /* 2. the fixed bid below the open */
      if (kalan > 0 && teklifDolar > 0 && teklifFiyat * (1 - vergi) > Math.max(taban(), duvar > 0 ? taban() * (1 + bant) : 0)) {
        const s = Math.min(kalan, teklifDolar / teklifFiyat);
        teklifDolar -= s * teklifFiyat; brut += s * teklifFiyat; kalan -= s; son = teklifFiyat;
      }
      const vergiDolar = brut * vergi;
      kasa += vergiDolar;
      dolasan -= t - kalan;                     // sold back to the pool
      let eline = brut - vergiDolar;
      /* 3. the wall (DUVAR only): pays floor × (1 + band), burns */
      if (kalan > 0 && duvar > 0) {
        const p = taban() * (1 + bant);
        const s = Math.min(kalan, duvar / p);
        duvar -= s * p; kasa -= s * p; dolasan -= s; kalan -= s; eline += s * p;
      }
      /* 4. redeem the rest at the floor, burns */
      if (kalan > 0) { const f = taban(); kasa -= kalan * f; dolasan -= kalan; itfa = kalan * f; eline += itfa; kalan = 0; }
      return eline;
    },
    fiyat: () => son, taban, kasa: () => kasa, dolasim: () => dolasan
  };
  return o;
}

const DUVAR = (opt = {}) => MERDIVEN({ duvarPayi: 0.3, bant: 0.05, ...opt });

/* ---- flows ------------------------------------------------------------ */
function akis(tohum, adim, ortalama, alimEgilimi = 0.55) {
  const r = prng(tohum);
  return Array.from({ length: adim }, () => {
    const buyuk = r() < 0.05;
    return { yon: r() < alimEgilimi ? "al" : "sat", boy: ortalama * (buyuk ? 10 : 1) * (0.2 + 1.6 * r()) };
  });
}

function kos(t, olaylar, { panik = false } = {}) {
  const cuzdan = [];               // each trader's tokens and dollars in
  let girdi = 0, cikti = 0, enKotuEtki = 0, enDusukTaban = Infinity, ilkTaban = null;
  for (const o of olaylar) {
    const p0 = t.fiyat();
    if (o.yon === "al") { const tok = t.al(o.boy); cuzdan.push(tok); girdi += o.boy; }
    else if (cuzdan.length) {
      const i = Math.floor((o.boy * 7919) % cuzdan.length);   // a holder chosen by the flow
      const tok = cuzdan[i]; cuzdan.splice(i, 1);
      cikti += t.sat(tok);
    }
    const p1 = t.fiyat();
    if (p0 > 0) enKotuEtki = Math.max(enKotuEtki, Math.abs(p1 - p0) / p0);
    if (t.taban() > 0) { if (ilkTaban == null) ilkTaban = t.taban(); enDusukTaban = Math.min(enDusukTaban, t.taban()); }
  }
  const tabanOnce = t.taban();
  let panikCikis = null;
  if (panik) {
    /* everyone sells, one after another; the last seller's dollars per token */
    let son = null;
    for (const tok of cuzdan) { if (tok <= 0) continue; const d = t.sat(tok); cikti += d; son = d / tok; }
    panikCikis = tabanOnce > 0 && son != null ? son / tabanOnce : null;
  }
  return { tasarim: t.ad, sermaye: t.sermaye, girdi, cikti, geriDonus: girdi ? cikti / girdi : null, enKotuEtki,
    sonTaban: t.taban(), tabanOnce, tabanDususu: ilkTaban ? 1 - enDusukTaban / Math.max(...[ilkTaban, enDusukTaban]) : 0, panikCikis, kasa: t.kasa() };
}

const ortalama = (l, f) => { const v = l.map(f).filter((x) => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

/* ---- experiments ------------------------------------------------------ */
const DENEYLER = {
  karsilastirma(tohumlar) {
    const satir = {};
    for (let s = 1; s <= tohumlar; s++) {
      const o = akis(s, 400, 50);
      for (const t of [CP(), MERDIVEN(), DUVAR()]) (satir[t.ad] = satir[t.ad] || []).push(kos(t, o, { panik: true }));
    }
    return Object.entries(satir).map(([ad, l]) => ({ tasarim: ad, sermaye: l[0].sermaye, geriDonus: ortalama(l, (x) => x.geriDonus),
      enKotuEtki: ortalama(l, (x) => x.enKotuEtki), panikCikis: ortalama(l, (x) => x.panikCikis), sonTaban: ortalama(l, (x) => x.sonTaban), kasa: ortalama(l, (x) => x.kasa) }));
  },
  "duvar-tarama"(tohumlar) {
    const out = [];
    for (const pay of [0.1, 0.3, 0.5]) for (const bant of [0.02, 0.05, 0.1]) {
      const l = [], ref = [];
      for (let s = 1; s <= tohumlar; s++) {
        const o = akis(s, 400, 50);
        l.push(kos(DUVAR({ duvarPayi: pay, bant }), o, { panik: true }));
        ref.push(kos(MERDIVEN(), o, { panik: true }));
      }
      out.push({ duvarPayi: pay, bant, geriDonus: ortalama(l, (x) => x.geriDonus), geriDonusMerdiven: ortalama(ref, (x) => x.geriDonus),
        panikCikis: ortalama(l, (x) => x.panikCikis), panikCikisMerdiven: ortalama(ref, (x) => x.panikCikis),
        sonTaban: ortalama(l, (x) => x.sonTaban), sonTabanMerdiven: ortalama(ref, (x) => x.sonTaban) });
    }
    return out;
  },
  panik(tohumlar) {
    /* a stress: a pump (buyers lean 80%), then the crash */
    const satir = {};
    for (let s = 1; s <= tohumlar; s++) {
      const o = akis(s, 300, 80, 0.8);
      for (const t of [CP(), MERDIVEN(), DUVAR()]) (satir[t.ad] = satir[t.ad] || []).push(kos(t, o, { panik: true }));
    }
    return Object.entries(satir).map(([ad, l]) => ({ tasarim: ad, geriDonus: ortalama(l, (x) => x.geriDonus), panikCikis: ortalama(l, (x) => x.panikCikis), sonTaban: ortalama(l, (x) => x.sonTaban) }));
  }
};

function hukum(merd, duv, d) {
  const getiri = Math.max(...d.map((x) => x.geriDonus - x.geriDonusMerdiven));
  const cikisKaybi = Math.min(...d.map((x) => x.panikCikis / x.panikCikisMerdiven - 1));
  const tabanKaybi = Math.min(...d.map((x) => x.sonTaban / x.sonTabanMerdiven - 1));
  const etkiAyni = Math.abs(duv.enKotuEtki - merd.enKotuEtki) < 1e-9;
  const benimse = getiri > 0.005 && cikisKaybi > -0.01;
  return (benimse ? "**ADOPT for further work.** " : "**NOT ADOPTED.** ") +
    "Best gain in trader return over today's design across the sweep: " + (getiri * 100).toFixed(3) + " percentage points; " +
    "crash exit for the last seller changes by " + (cikisKaybi * 100).toFixed(2) + "% and the final floor by " + (tabanKaybi * 100).toFixed(2) + "% at the worst setting. " +
    (etkiAyni ? "The worst single-trade price move is unchanged — the wall does not reduce price impact. " : "") +
    "Reading: the wall moves value from holders who stay to sellers who leave; it does not create any. Recorded as a failed method so later research does not repeat it.";
}

function kanitBelgesi(k, d) {
  const merd = k.find((x) => x.tasarim === "MERDIVEN"), duv = k.find((x) => x.tasarim === "DUVAR");
  const enIyi = [...d].sort((a, b) => (b.panikCikis - b.panikCikisMerdiven) - (a.panikCikis - a.panikCikisMerdiven))[0];
  const yuzde = (x) => (x * 100).toFixed(2) + "%";
  return `# Proof of Invention — DUVAR (floor-anchored wall)

Status: **simulation only**. Nothing deployed, no contract changed. Generated by \`genesis/icat/tezgah.js\` on ${new Date().toISOString()}.

## Problem
In a collateral-backed launch the vault pays every holder the floor (vault ÷ circulating) at any time, but its dollars do nothing above the floor: a seller who wants out is offered either the pool (often far above the floor, thin) or the floor itself. Idle reserve, and a cliff between the two.

## Mechanism
A share of the vault's dollars stands as a bid at floor × (1 + band). Sellers hit it before falling to the floor; the tokens it buys are burned.

## Mathematical model
For a wall purchase of t tokens at p = f·(1+b), with vault K and circulating D (f = K/D):
f' = (K − t·f·(1+b)) / (D − t) = f − (b·f·t)/(D − t).
The seller gains b·f per token over redeeming; the remaining holders' floor falls by exactly that premium spread over D − t. The wall is capped at share s of K, so total premium paid ≤ s·K·b/(1+b).

## Source code
\`genesis/icat/tezgah.js\` — designs CP, MERDIVEN, DUVAR; seeded flows; measures.

## Simulation results (mean of ${process.argv.includes("--tohumlar") ? arg("--tohumlar") : 20} seeded flows)
| design | start capital | trader return | worst single-trade move | crash: last seller ÷ pre-crash floor | final floor |
|---|---|---|---|---|---|
${k.map((x) => `| ${x.tasarim} | $${x.sermaye} | ${yuzde(x.geriDonus)} | ${yuzde(x.enKotuEtki)} | ${x.panikCikis == null ? "— (no floor)" : x.panikCikis.toFixed(3)} | ${x.sonTaban.toExponential(3)} |`).join("\n")}

Parameter sweep (wall share × band) — best by crash exit gain: share ${enIyi.duvarPayi}, band ${yuzde(enIyi.bant)}:
crash exit ${enIyi.panikCikis.toFixed(3)} vs ${enIyi.panikCikisMerdiven.toFixed(3)} without the wall; final floor ${enIyi.sonTaban.toExponential(3)} vs ${enIyi.sonTabanMerdiven.toExponential(3)}.

## Verdict (computed from the numbers above)
${hukum(merd, duv, d)}

## Comparison with existing technology
CP has no floor at all (a crash goes to zero). MERDIVEN (ARC PULSE today) guarantees the floor. DUVAR trades a bounded part of the floor for a better exit above it. Whether that trade is worth it is a design choice; these numbers price it.

## Security risks
- A wall at floor × (1+b) is a known price: an attacker who can push the floor up (by redeeming cheap tokens? no — redeeming lowers nothing; by donating to the vault) could farm the premium. Bounded by s·K·b/(1+b) per refill.
- Any on-chain version must read the floor in the same transaction it pays it, or be manipulable within a block.

## Capital requirements
None beyond the vault: the wall is a share of dollars already there.

## Real-use advantage
Measured above; small when the pool is deep, larger in a crash where the pool's bid is gone.

## Novelty research
**NOT VERIFIED — no prior-art search has been done.** Protocol-owned bids and buy-and-burn are long-standing ideas; nothing here claims this is new.
`;
}

if (require.main === module) {
  const deney = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "karsilastirma";
  const tohumlar = Number(arg("--tohumlar", "20"));
  fs.mkdirSync(SONUC, { recursive: true });
  const sonuc = DENEYLER[deney](tohumlar);
  fs.writeFileSync(path.join(SONUC, deney + ".json"), JSON.stringify({ deney, tohumlar, zaman: new Date().toISOString(), sonuc }, null, 1));
  console.table(sonuc);
  if (deney === "karsilastirma") {
    const d = DENEYLER["duvar-tarama"](tohumlar);
    fs.writeFileSync(path.join(SONUC, "duvar-tarama.json"), JSON.stringify({ deney: "duvar-tarama", tohumlar, sonuc: d }, null, 1));
    fs.writeFileSync(path.join(SONUC, "DUVAR-proof-of-invention.md"), kanitBelgesi(sonuc, d));
    console.log("proof of invention: genesis/icat/sonuclar/DUVAR-proof-of-invention.md");
  }
}

module.exports = { prng, CP, MERDIVEN, DUVAR, akis, kos, DENEYLER };
