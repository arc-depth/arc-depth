"use strict";
/* ===========================================================================
 * olc-pulse-acici.js — iki taraflı yerleştirme gerçekten iniyor mu
 *
 *   node scripts/olc-pulse-acici.js
 *
 * NEDEN BU ÖLÇÜM ÖNCE GELİYOR
 *   Yeni launchpad'in tamamı tek bir iddianın üstünde: havuz AÇILIŞ
 *   FİYATINDA açılabilir ve her iki taraf da istenen miktarda inebilir.
 *   Önceki nesilde iki şekil denendi, ikisi de olmadı — ve biri sessizce:
 *
 *     tek yönlü merdiven      USDC'nin gidecek yeri yok, delta $0,00,
 *                             açılış BAŞARILI göründü
 *     fiyatı kapsayan pozisyon miktarları kabul etmedi
 *
 *   Bu yüzden burada "açıldı mı" sorulmuyor. Sorulan şey: harness'tan
 *   gerçekten ÇIKTI mı, PoolManager'a GİRDİ mi, fiyat istenen yerde
 *   KALDI mı, ve o likiditeyle işlem YAPILABİLİYOR mu.
 *
 * GERÇEK ARC, GERÇEK PoolManager, SIFIR HARCAMA
 *   Harness `eth_call` durum geçersiz kılmasıyla enjekte ediliyor ve
 *   bakiyesi override'dan geliyor. Zincire tek bayt yazılmıyor.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";

const HARNESS = "0x000000000000000000000000000000000AC1C100";
const CAGIRAN = "0x3333333333333333333333333333333333333333";

const USDC = "0x3600000000000000000000000000000000000000";

const ACILIS_MCAP = 3_500_000_000n;      // $3.500
const ARZ = 10n ** 27n;                  // 1.000.000.000 token, 18 ondalik
const POOL_FEE = 0;
const TICK_SPACING = 60;

/* THE BAND, AND WHY THESE NUMBERS
     A v4 tick is a 1,0001 step, so a price multiple m is ln(m)/ln(1,0001)
     ticks away.

     ladder up   +6.900 ticks  -> 1,0001^6900 = 1.993, yani ~1000 kat.
                 Tokenin fiyati bin katina cikana kadar satilacak token
                 var. Daha genis bir bant ayni tokeni daha ince yayardi.

     bid down    -9.180 ticks  -> 1,0001^-9180 = 0,399, yani %60 dusus.
                 Bu sayi keyfi degil: spec'in savunma tetigi tepeden %60
                 dusus. Teklif bandi tam o noktaya kadar aktif kalsin ki
                 savunma devreye girdiginde havuzun kendi teklifi de
                 hala orada olsun. Daha sig bir bant, savunmanin
                 gerektigi anda teklifin bitmis olmasi demekti. */
const YUKARI_TICK = 6_900;
const ASAGI_TICK = 9_180;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let no = 1;
async function rpc(yontem, parametreler) {
  let son = null;
  for (let d = 0; d < 8; d++) {
    if (d > 0) await bekle(1500 * d);
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler }),
      signal: AbortSignal.timeout(120_000)
    }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
    if (r.result !== undefined) return r.result;
    son = (r.error && r.error.message) || "bilinmeyen";
    if (!/rate limit|too many|timeout|503|502|ECONNRESET|fetch failed/i.test(son)) {
      const e = new Error(son);
      e.data = r.error && r.error.data;
      throw e;
    }
  }
  throw new Error("uc nokta cevap vermedi: " + son);
}

const B = (ad) => JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));

const HATALAR = new Map();
(function yukle() {
  const { id } = require("ethers");
  for (const f of fs.readdirSync(path.join(KOK, "build"))) {
    if (!f.endsWith(".json")) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(KOK, "build", f), "utf8")); } catch (e) { continue; }
    for (const x of (j.abi || [])) {
      if (x.type !== "error") continue;
      HATALAR.set(id(x.name + "(" + (x.inputs || []).map((i) => i.type).join(",") + ")").slice(0, 10), x.name);
    }
  }
})();
const hataAdi = (v) => {
  const s = String(v || "");
  if (!s.startsWith("0x") || s.length < 10) return "veri yok";
  return HATALAR.get(s.slice(0, 10)) || ("bilinmeyen secici " + s.slice(0, 10));
};

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const T = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
const V = (v) => BigInt(v.toString());

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

/* The price a tick stands for, for reporting only. The contract never
   does this in floating point. */
const tickFiyat = (tick, tokenSifirinci) => {
  const ham = Math.pow(1.0001, tick);
  /* raw quote per raw token; a token has 18 decimals and the quote 6, so
     a human price is raw * 1e12 */
  const q = tokenSifirinci ? ham : 1 / ham;
  return q * 1e12;
};

(async () => {
  const plan = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse.json"), "utf8"));
  const PM = plan.arc.poolManager;

  const Y = B("TestPulseAcici");
  const iface = new Interface(Y.abi);

  console.log("PULSE ACICI — iki tarafli yerlestirme, gercek Arc PoolManager");
  console.log("  rpc          " + RPC);
  console.log("  poolManager  " + PM);
  console.log("  harness      " + HARNESS + "   (enjekte, hicbir sey dagitilmiyor)");
  console.log("");

  const satirlar = [];
  /* The two ends of the new rule: the minimum and maximum founder buy,
     net of the 2% fee. Both, because the bid's size is the only thing
     that differs between them and the bid is what was failing before. */
  for (const [odeme, net] of [[100_000_000n, 98_000_000n], [500_000_000n, 490_000_000n]]) {
    console.log("================================================================");
    console.log(" ODEME " + U(odeme) + "   NET TEKLIF " + U(net));
    console.log("================================================================");

    const veri = iface.encodeFunctionData("kos",
      [PM, USDC, POOL_FEE, TICK_SPACING, ACILIS_MCAP, ARZ, net, YUKARI_TICK, ASAGI_TICK]);

    let s;
    try {
      const ham = await rpc("eth_call", [
        { from: CAGIRAN, to: HARNESS, gas: "0x10000000", data: veri }, "latest",
        { [HARNESS]: {
          code: Y.deployedBytecode,
          /* Native balance IS the USDC balance on Arc — same money, 18
             decimals natively and 6 through the ERC20 view, measured at
             a ratio of exactly 1e12. One line funds the gas and the bid. */
          balance: "0x" + (100_000n * 10n ** 18n).toString(16)
        } }]);
      [s] = iface.decodeFunctionResult("kos", ham);
    } catch (e) {
      console.log("  ACILIS REVERT ETTI: " + e.message.slice(0, 100));
      if (e.data) console.log("  revert: " + hataAdi(e.data));
      kotu++;
      continue;
    }

    const t0 = s.tokenSifirinci;
    console.log("  token        " + s.token + (t0 ? "   (currency0)" : "   (currency1)"));
    console.log("  acici        " + s.acici);
    console.log("");
    console.log("  ISTENEN");
    console.log("     acilis tick   " + s.istenenTick +
      "   fiyat $" + tickFiyat(Number(s.istenenTick), t0).toFixed(9));
    console.log("     bant          [" + s.alt + " , " + s.ust + "]  (tick)");
    /* Reported in TOKEN-PRICE terms, because tick terms flip with the
       ordering and a reader cannot be expected to flip them in their
       head — the first run printed the bid where the ladder was. */
    const acilisF = tickFiyat(Number(s.istenenTick), t0);
    const fAlt = tickFiyat(Number(s.alt), t0), fUst = tickFiyat(Number(s.ust), t0);
    const merdivenF = Math.max(fAlt, fUst), teklifF = Math.min(fAlt, fUst);
    console.log("       merdiven tepe $" + merdivenF.toFixed(9) +
      "   (" + (merdivenF / acilisF).toFixed(0) + " kat yukari)");
    console.log("       teklif taban  $" + teklifF.toFixed(9) +
      "   (%" + ((1 - teklifF / acilisF) * 100).toFixed(1) + " dususe kadar)");
    console.log("     konan token   " + T(s.konulanToken));
    console.log("     konan quote   " + U(s.konulanQuote));

    console.log("");
    console.log("  HAVUZ NE DIYOR");
    console.log("     tick          " + s.havuzTick + "   (istenen " + s.istenenTick + ")");
    console.log("     likidite      " + V(s.likidite).toLocaleString("en"));
    console.log("     aciciida kalan token " + T(s.aciciKalanToken));
    console.log("     aciciida kalan quote " + U(s.aciciKalanQuote));
    console.log("     PoolManager'da token " + T(s.pmToken));
    console.log("     PoolManager'da quote " + U(s.pmQuote));
    console.log("     bildirilen teklif    " + U(s.bildirilenQuote));

    /* 1 — the price is where it was asked to be. Not derived from the
       amounts: the ratio of $98 to 972M tokens implies a price 35x below
       the opening one, which is exactly the failure this opener exists to
       avoid. */
    ok(Number(s.havuzTick) === Number(s.istenenTick),
      "HAVUZ ACILIS FIYATINDA ACILDI",
      "tick " + s.havuzTick + " — miktarlarin oranindan turetilmedi, " +
        "girdi olarak verildi");

    /* 2 — BOTH sides left the harness. The one assertion the previous
       generation did not have: a side that did not move is a side that
       did not go in, and the opener returned success anyway. */
    const tokenGitti = V(s.konulanToken) - V(s.aciciKalanToken);
    const quoteGitti = V(s.konulanQuote) - V(s.aciciKalanQuote);
    console.log("");
    console.log("     havuza giren token   " + T(tokenGitti) +
      "   (%" + (Number(tokenGitti * 10_000n / V(s.konulanToken)) / 100).toFixed(2) + ")");
    console.log("     havuza giren quote   " + U(quoteGitti) +
      "   (%" + (Number(quoteGitti * 10_000n / V(s.konulanQuote)) / 100).toFixed(2) + ")");

    ok(tokenGitti > 0n, "MERDIVEN TARAFI HAVUZA GIRDI", T(tokenGitti) + " token");
    ok(quoteGitti > 0n,
      "TEKLIF TARAFI HAVUZA GIRDI",
      U(quoteGitti) + " — onceki nesilde tam burada $0,00 donuyordu ve " +
        "acilis basarili goruruyordu");

    /* The bid should land essentially in full: it is one-sided over a
       range entirely below the price, so nothing forces a ratio on it.
       A large shortfall means the band is wrong, not that v4 refused. */
    const teklifOran = Number(quoteGitti) / Number(V(s.konulanQuote));
    ok(teklifOran > 0.99,
      "TEKLIFIN TAMAMI INDI",
      "%" + (teklifOran * 100).toFixed(2) + " — tek tarafli bir bantta " +
        "oran zorlanmadigi icin tamaminin inmesi gerekiyor");

    /* 3 — and the PoolManager is actually holding it. The opener's own
       accounting could be right while the money never moved. */
    ok(V(s.pmQuote) >= quoteGitti,
      "PoolManager TEKLIFI GERCEKTEN TUTUYOR",
      U(s.pmQuote) + " >= " + U(quoteGitti) + " — acicinin defterinden " +
        "degil USDC sozlesmesinden okundu");

    /* 4 — what the interface will show must be the real figure. "Sanal
       likidite gerçek USDC gibi gösterilmeyecek" is only keepable if
       there is a true number to read. */
    const bildirilen = V(s.bildirilenQuote);
    const sapma = bildirilen > quoteGitti
      ? Number(bildirilen - quoteGitti) / Number(quoteGitti)
      : Number(quoteGitti - bildirilen) / Number(quoteGitti);
    ok(sapma < 0.02,
      "BILDIRILEN TEKLIF, GERCEKTEN GIRENLE AYNI",
      U(bildirilen) + " vs " + U(quoteGitti) + "   sapma %" +
        (sapma * 100).toFixed(2) + " — arayuz bu sayiyi gosterecek, " +
        "sanal bir seyi gercek gibi gosteremesin");

    /* 5 — the venue works. Placement can look right and still be
       untradeable, which is the exact shape of the previous failure. */
    console.log("");
    console.log("     alim " + U(s.alimOdenen) + " -> " +
      (s.alimGecti ? T(s.alimAlinan) + " token" : "REDDEDILDI"));
    if (!s.alimGecti) console.log("       revert: " + hataAdi(s.alimSebep));
    if (s.alimGecti) {
      const oncekiFiyat = tickFiyat(Number(s.havuzTick), t0);
      console.log("       fiyat sonrasi  sqrtP " + V(s.alimSonrasiSqrtP) +
        (V(s.alimSonrasiSqrtP) !== V(s.havuzSqrtP) ? "   (HAREKET ETTI)" : "   (hareketsiz)"));
      const birim = Number(s.alimOdenen) / 1e6 / (Number(s.alimAlinan) / 1e18);
      console.log("       odenen birim fiyat $" + birim.toFixed(9) +
        "   acilis $" + oncekiFiyat.toFixed(9) +
        "   ittirme " + (birim / oncekiFiyat).toFixed(4) + " kat");
      satirlar.push({ odeme, ittirme: birim / oncekiFiyat });
    }
    ok(s.alimGecti === true, "YERLESEN LIKIDITEYLE ALIM YAPILABILIYOR",
      s.alimGecti ? T(s.alimAlinan) + " token alindi" : hataAdi(s.alimSebep));
    ok(V(s.alimAlinan) > 0n, "alan taraf gercekten token aldi");

    /* The price must MOVE on a buy. A buy that does not move the price is
       a buy against something that is not a curve — and the spec's own
       rule is that buys raise the price. */
    ok(V(s.alimSonrasiSqrtP) !== V(s.havuzSqrtP),
      "ALIM FIYATI HAREKET ETTIRDI",
      "hareketsiz kalsa havuz bir piyasa degil bir sabit fiyat tezgahi olurdu");

    console.log("");
  }

  if (satirlar.length === 2) {
    console.log("================================================================");
    console.log(" TEKLIF BUYUDUKCE ITTIRME AZALIYOR MU");
    console.log("================================================================");
    for (const r of satirlar) {
      console.log("  " + U(r.odeme).padStart(8) + " odeme -> ayni oranli alimda " +
        r.ittirme.toFixed(4) + " kat ittirme");
    }
    /* The whole reason the maximum payment exists: a bigger bid should
       buy a better market, not a higher price. Both buys are a tenth of
       their own bid, so the push should be the same shape — what differs
       is the dollar depth behind it. */
    console.log("");
    console.log("  Iki alim da kendi teklifinin onda biri, o yuzden ittirmenin");
    console.log("  BENZER olmasi dogru sonuc: daha buyuk odeme daha yuksek fiyat");
    console.log("  satin almiyor, ayni fiyatta daha DERIN bir piyasa satin aliyor.");
  }

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) console.error("  revert: " + hataAdi(e.data));
  process.exit(1);
});
