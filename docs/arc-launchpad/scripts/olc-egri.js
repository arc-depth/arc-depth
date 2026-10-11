"use strict";
/* Curve simulation for EgriLaunchpad, in the contract's own integer
   arithmetic: no floats in the state, same rounding directions, same fee
   and tax order as Egri.sol. Proves the numbers before anything is
   deployed, which is the rule: no live launch without simulation.
 *
 *   x = FANTOM + toplanan            quote side, 6 decimals
 *   y = K / x                        token side, 18 decimals
 *   K = FANTOM * SANAL_TOKEN         fixed
 *   alimKotasi(d) = (K * d) / (x * (x + d))
 *   FDV = x^2 / FANTOM
 */
/* The supply splits down the middle: half into a one-sided Uniswap ladder
   that costs nothing and makes the token routable from the first second,
   half into the curve that always bids. Both open at the same price —
   ACILIS_MCAP over SUPPLY — so there is nothing to arbitrage at birth.

   FANTOM is the ladder's share of the opening value mirrored on the curve's
   side: the curve holds half the supply, so half the opening mcap is what
   makes its price equal the ladder's exactly. */
const SUPPLY = 1_000_000_000n * 10n ** 18n;
const ACILIS_MCAP = 3_500n * 10n ** 6n;
const MERDIVEN_BPS = 5_000n;
const MERDIVEN_TOKEN = (SUPPLY * MERDIVEN_BPS) / 10_000n;
const EGRI_TOKEN = SUPPLY - MERDIVEN_TOKEN;
const FANTOM = ACILIS_MCAP - (ACILIS_MCAP * MERDIVEN_BPS) / 10_000n;
const ESIK   = 6_000n * 10n ** 6n;
const K = FANTOM * EGRI_TOKEN;

/* The launchpad's table, from EgriLaunchpad.sol. Total 2.00%: the first
   percent pays the market, the second pays the people who build and run
   it. 0.40% is accounted for by nobody and stays as pool depth. */
const UCRET_PPM = 20_000n;
const KURUCU_PPM = 3_000n, STAKE_PPM = 3_000n;
const GELISTIRICI_PPM = 3_000n, LIKIDITE_PPM = 5_000n, ISLETME_PPM = 2_000n;
const SNIPE_PPM = 990_000n, SNIPE_SURESI = 5n;
const M = 1_000_000n;

const usd = (v) => (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tok = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 0 });
const fiyat = (x, y) => Number(x) / 1e6 / (Number(y) / 1e18);

function snipeOrani(gecen) { return gecen >= SNIPE_SURESI ? 0n : SNIPE_PPM >> (2n * gecen); }

class Egri {
  constructor() {
    this.toplanan = 0n; this.vergi = 0n; this.dagitilan = 0n;
    this.kurucuAldi = 0n; this.stakeAldi = 0n;
    this.gelistiriciAldi = 0n; this.likiditeAldi = 0n; this.isletmeAldi = 0n;
  }
  x() { return FANTOM + this.toplanan; }
  y() { return K / this.x(); }
  alimKotasi(d) { const x = this.x(); return d === 0n ? 0n : (K * d) / (x * (x + d)); }
  satisKotasi(t) {
    if (t === 0n) return 0n;
    const x = this.x(), bol = K + t * x, pay = K * x;
    let xs = (pay + bol - 1n) / bol;
    if (xs < FANTOM) xs = FANTOM;
    return x - xs;
  }
  ucret(q) {
    const toplam = (q * UCRET_PPM) / M;
    if (toplam === 0n) return [0n, 0n];
    const k = (q * KURUCU_PPM) / M, s = (q * STAKE_PPM) / M;
    const g = (q * GELISTIRICI_PPM) / M, l = (q * LIKIDITE_PPM) / M, i = (q * ISLETME_PPM) / M;
    this.kurucuAldi += k; this.stakeAldi += s;
    this.gelistiriciAldi += g; this.likiditeAldi += l; this.isletmeAldi += i;
    return [toplam, toplam - k - s - g - l - i];
  }
  al(quoteIn, gecen = SNIPE_SURESI) {
    const kesilen = (quoteIn * snipeOrani(gecen)) / M;
    let net = quoteIn - kesilen;
    const [u, kalan] = this.ucret(net);
    net -= u;
    const alinan = this.alimKotasi(net);
    this.toplanan += net; this.vergi += kesilen + kalan; this.dagitilan += alinan;
    return alinan;
  }
  sat(tokenIn) {
    const alinan = this.satisKotasi(tokenIn);
    if (alinan > this.toplanan) throw new Error("odeme > toplanan");
    this.toplanan -= alinan;
    const [u, kalan] = this.ucret(alinan);
    this.vergi += kalan;
    this.dagitilan -= tokenIn;
    return alinan - u;
  }
  /* FDV over the WHOLE supply, which is the number a screen shows, not
     over the curve's share. At toplanan = 0 it is ACILIS_MCAP. */
  fdv() { const x = this.x(); return (x * x * 10_000n) / (FANTOM * (10_000n - MERDIVEN_BPS)); }
}

const ayir = (s) => { console.log(""); console.log("=== " + s + " ==="); };

/* 1 — the open */
ayir("ACILIS");
{
  const e = new Egri();
  console.log("  arz                " + tok(SUPPLY) + " token");
  console.log("  merdivene          " + tok(MERDIVEN_TOKEN) + " token  (%" +
              (Number(MERDIVEN_BPS) / 100) + ")");
  console.log("  egriye             " + tok(EGRI_TOKEN) + " token  (%" +
              (100 - Number(MERDIVEN_BPS) / 100) + ")");
  console.log("  GORUNEN LIKIDITE   $" + usd((ACILIS_MCAP * MERDIVEN_BPS) / 10_000n) +
              "   <- merdiven, havuza konan dolar $0");
  console.log("  FANTOM (sanal)     $" + usd(FANTOM) + "   hic tutulmaz, hic odenmez");
  console.log("  acilis fiyati      $" + fiyat(e.x(), e.y()).toExponential(3));
  console.log("  ACILIS MCAP        $" + usd(e.fdv()));
  const merdivenFiyat = Number(ACILIS_MCAP) / 1e6 / (Number(SUPPLY) / 1e18);
  const egriFiyat = fiyat(e.x(), e.y());
  console.log("  merdiven fiyati    $" + merdivenFiyat.toExponential(3));
  console.log("  egri fiyati        $" + egriFiyat.toExponential(3) +
              "   " + (Math.abs(merdivenFiyat - egriFiyat) / merdivenFiyat < 1e-9
                        ? "<- AYNI, arbitraj yok" : "<- FARKLI, ARBITRAJ VAR"));
  console.log("  kurucunun bedava payi: 0 token   (eski model: 600.000.000)");
  console.log("  launch maliyeti    $0 + gaz");
}

/* 2 — what a buy gets, at several sizes, with no snipe tax */
ayir("ALIM TABLOSU (taze egri, snipe vergisi gecmis)");
{
  const satirlar = [];
  for (const d of [10n, 100n, 500n, 1000n, 5000n, 12000n]) {
    const e = new Egri();
    const q = d * 10n ** 6n;
    const alinan = e.al(q);
    satirlar.push({
      "alim": "$" + usd(q),
      "aldigi token": tok(alinan),
      "arzin %": (Number(alinan) / Number(SUPPLY) * 100).toFixed(3) + "%",
      "ortalama fiyat": "$" + (Number(q) / 1e6 / (Number(alinan) / 1e18)).toExponential(3),
      "sonraki fiyat": "$" + fiyat(e.x(), e.y()).toExponential(3),
      "yeni mcap": "$" + usd(e.fdv())
    });
  }
  const k = Object.keys(satirlar[0]);
  const g = k.map((x) => Math.max(x.length, ...satirlar.map((r) => String(r[x]).length)));
  console.log("  " + k.map((x, i) => x.padEnd(g[i])).join(" | "));
  console.log("  " + g.map((w) => "-".repeat(w)).join("-+-"));
  for (const r of satirlar) console.log("  " + k.map((x, i) => String(r[x]).padEnd(g[i])).join(" | "));
}

/* 3 — the snipe tax in its five seconds */
ayir("SNIPE VERGISI — $100 alim, saniye saniye");
for (let s = 0n; s <= SNIPE_SURESI; s++) {
  const e = new Egri();
  const alinan = e.al(100n * 10n ** 6n, s);
  console.log("  " + s + ". saniye  vergi %" + (Number(snipeOrani(s)) / 10000).toFixed(2).padStart(6) +
              "   alinan " + tok(alinan).padStart(14) + " token");
}

/* 4 — graduation */
ayir("MEZUNIYET");
{
  const e = new Egri();
  let alim = 0n, adet = 0n;
  while (e.toplanan < ESIK) { e.al(100n * 10n ** 6n); alim += 100n * 10n ** 6n; adet++; }
  const kalanToken = EGRI_TOKEN - e.dagitilan;
  const havuzQuote = e.toplanan + e.vergi;
  let havuzToken = (havuzQuote * kalanToken) / e.x();
  if (havuzToken > kalanToken) havuzToken = kalanToken;
  const yakilan = kalanToken - havuzToken;
  console.log("  " + adet + " x $100 alim = $" + usd(alim) + " brut");
  console.log("  esige ulasan toplanan      $" + usd(e.toplanan) + "   (esik $" + usd(ESIK) + ")");
  console.log("  MEZUNIYET FDV              $" + usd(e.fdv()));
  console.log("  tokenin kurucusuna         $" + usd(e.kurucuAldi) + "   (%0,30)");
  console.log("  holder odullerine          $" + usd(e.stakeAldi) + "   (%0,30)");
  console.log("  GELISTIRICI FONUNA         $" + usd(e.gelistiriciAldi) + "   (%0,30)");
  console.log("  PROTOKOL LIKIDITESINE      $" + usd(e.likiditeAldi) + "   (%0,50)");
  console.log("  ISLETMEYE                  $" + usd(e.isletmeAldi) + "   (%0,20)");
  const bizeToplam = e.gelistiriciAldi + e.likiditeAldi + e.isletmeAldi;
  console.log("  -> BIZE TOPLAM             $" + usd(bizeToplam) + "   (%1,00)");
  const hepsi = e.kurucuAldi + e.stakeAldi + bizeToplam + havuzQuote;
  console.log("  MUHASEBE: " + usd(hepsi) + " / " + usd(alim) + "  " +
              (hepsi === alim ? "TAM KAPANIYOR" : "FARK " + usd(alim - hepsi)));
  console.log("  havuza konan para          $" + usd(havuzQuote) + "   <- hepsi alicilarin parasi");
  console.log("  havuza konan token         " + tok(havuzToken));
  console.log("  YAKILAN token              " + tok(yakilan) + "   (satilmamis, kimsenin payindan degil)");
  console.log("  mezuniyet sonrasi arz      " + tok(SUPPLY - yakilan));
  console.log("  (merdivendeki " + tok(MERDIVEN_TOKEN) + " token hic dokunulmadi)");
  console.log("  havuz acilis fiyati        $" + (Number(havuzQuote) / 1e6 / (Number(havuzToken) / 1e18)).toExponential(3));
  console.log("  egrinin son fiyati         $" + fiyat(e.x(), e.y()).toExponential(3) + "   <- esit olmali, altinda degil");
}

/* 5 — the invariant that matters: the curve can never owe more than it holds */
ayir("DEGISMEZ: EGRI ALDIGINDAN FAZLASINI ODEYEMEZ");
{
  let kotu = 0, tur = 0;
  for (let i = 0; i < 400; i++) {
    const e = new Egri();
    let elde = 0n;
    for (let j = 0; j < 12; j++) {
      const d = BigInt(1 + Math.floor(Math.random() * 3000)) * 10n ** 6n;
      elde += e.al(d);
      if (elde > 0n && Math.random() < 0.45) {
        const sat = elde / BigInt(1 + Math.floor(Math.random() * 4));
        if (sat > 0n) {
          try { e.sat(sat); elde -= sat; } catch (err) { kotu++; }
        }
      }
      tur++;
      if (e.toplanan < 0n) kotu++;
      if (e.x() < FANTOM) kotu++;
    }
  }
  console.log("  " + tur + " rastgele alim/satim turu");
  console.log("  x < FANTOM olan tur        : 0 bekleniyor -> " + kotu);
  console.log("  odeme > toplanan olan tur  : yukaridaki sayiya dahil");
  console.log(kotu === 0 ? "  GECTI — notional kisim hic cikmadi, odeme hic asmadi"
                         : "  BASARISIZ — " + kotu + " ihlal");
}

/* 6 — the old model against the new, on the same $100 */
ayir("$100 ILE NE OLUYOR — ESKI vs YENI");
{
  const e = new Egri();
  const alinan = e.al(100n * 10n ** 6n);
  const satisGeri = e.satisKotasi(alinan);
  const [u] = (() => { const k = (satisGeri * UCRET_PPM) / M; return [k]; })();
  console.log("  ESKI (yatirim modeli)");
  console.log("    yatirir $100 -> 600.000.000 token, geri alabilecegi $59,52   kesinti %40,5");
  console.log("  YENI (egri)");
  console.log("    launch $0 + gaz, bedava token 0");
  console.log("    $100 alim -> " + tok(alinan) + " token");
  console.log("    hemen geri satarsa -> $" + usd(satisGeri - u) + "   kayip yalnizca cift ucret + yuvarlama");
}
