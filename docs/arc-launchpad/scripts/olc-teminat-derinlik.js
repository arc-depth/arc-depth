"use strict";
/* ===========================================================================
 * olc-teminat-derinlik.js — measure the collateral candidates by DEPTH
 *
 *   node scripts/olc-teminat-derinlik.js [--tutar 2000]
 *
 * WHY THIS SCRIPT EXISTS — THE OLD ONE MEASURED THE WRONG UNIVERSE
 *   `olc-teminat-adaylari.js` derived the candidates FROM THE CHAINLINK
 *   FEEDS: pull the feed list first, then look for that feed's asset on
 *   chain. So the gate the user removed was still deciding the suggestion
 *   list.
 *
 *   The consequence was measured: of the 50 suggestions produced that way,
 *   only 21 can absorb a $2,000 conversion. An asset with a feed can have a
 *   thin USDC pool — SHIB's liquidity is not in SHIB/USDC but in SHIB/WETH,
 *   and it was measured: a $2,000 trade moves the price 17.5x. The price
 *   reads correctly, the trade cannot be done.
 *
 * WHY DEPTH IS THE CRITERION
 *   The floor is derived from the pool's MARGINAL price. A trade that
 *   pushes the pool cannot reach that floor and the conversion is refused.
 *   It closes in the safe direction — no money is lost — but it has no
 *   place on a suggestion list: suggesting something that will not work is
 *   worse than suggesting nothing.
 *
 *   This is NOT a proxy quality gate. It does not say "liquidity must be
 *   above this threshold"; it asks "can this amount be converted in this
 *   pool" — that is, it measures the job itself, directly. No threshold, a
 *   job.
 *
 * WHERE THE UNIVERSE COMES FROM
 *   Uniswap's own public token list (free, no key) plus candidates measured
 *   earlier. The two are merged so that no asset found before gets lost as
 *   the universe changes. There is no paid service anywhere in it.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const HEDEF = path.join(KOK, "teminat-derinlik.json");
const ESKI = path.join(KOK, "teminat-adaylari.json");

const arg = (ad) => {
  const i = process.argv.indexOf("--" + ad);
  return i > 0 ? process.argv[i + 1] : null;
};
/* SIZES, NOT ONE SIZE
     The minimum collateral is $20 (ASGARI_TEMINAT = 20e6) but collateral
     GROWS: every trade's tax flows into it, with no ceiling. So a single
     threshold answers the wrong question — "does this work" has no answer
     without "at what size".

     Measured at four sizes, and what gets recorded per asset is the
     LARGEST one that still clears the floor. The page can then say "works
     up to $X" instead of a yes that stops being true as the vault fills. */
const TUTARLAR = (arg("tutar")
  ? [BigInt(Math.round(Number(arg("tutar")) * 1e6))]
  : [20_000_000n, 200_000_000n, 2_000_000_000n, 20_000_000_000n]);
const TUTAR = TUTARLAR[TUTARLAR.length - 1];
const AZAMI_KAYMA_BPS = 300;
const KADEMELER = [100, 500, 3000, 10000];
const ASGARI_KARDINALITE = 2;
const TAVAN = 1 / (1 - AZAMI_KAYMA_BPS / 10_000);

const ZINCIRLER = {
  ethereum: {
    ad: "Ethereum", id: 1, domain: 0,
    rpc: "https://ethereum-rpc.publicnode.com",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"
  },
  base: {
    ad: "Base", id: 8453, domain: 6,
    rpc: "https://base-rpc.publicnode.com",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    v3Fabrika: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"
  },
  arbitrum: {
    ad: "Arbitrum", id: 42161, domain: 3,
    rpc: "https://arbitrum-one-rpc.publicnode.com",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"
  },
  optimism: {
    ad: "Optimism", id: 10, domain: 2,
    rpc: "https://optimism-rpc.publicnode.com",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"
  },
  polygon: {
    ad: "Polygon", id: 137, domain: 7,
    rpc: "https://polygon-bor-rpc.publicnode.com",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"
  },
  avalanche: {
    ad: "Avalanche", id: 43114, domain: 1,
    rpc: "https://avalanche-c-chain-rpc.publicnode.com",
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    v3Fabrika: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD",
    quoter: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F"
  },
  unichain: {
    ad: "Unichain", id: 130, domain: 10,
    rpc: "https://unichain-rpc.publicnode.com",
    usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
    v3Fabrika: "0x1F98400000000000000000000000000000000003",
    /* No quoter address answered here. Left null rather than guessed: a
       guessed address returns nothing or garbage, and either one becomes a
       depth figure nobody can trust. Depth is reported as unmeasured. */
    quoter: null
  }
};

const SIFIR = "0x0000000000000000000000000000000000000000";
const pad = (a) => a.slice(2).toLowerCase().padStart(64, "0");
const say = (h) => (h && h !== "0x" ? BigInt("0x" + h.slice(2, 66)) : 0n);

/* ---- transport: batched, chunked, retried -------------------------- */

const PARCA = 60;
let istek = 0;

async function tekToplu(rpc, cagrilar) {
  const govde = cagrilar.map((c, i) => ({
    jsonrpc: "2.0", id: i + 1, method: "eth_call",
    params: [{ to: c.to, data: c.data }, "latest"]
  }));
  const r = await fetch(rpc, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(govde), signal: AbortSignal.timeout(60_000)
  });
  if (!r.ok) throw new Error("RPC " + r.status);
  const j = await r.json();
  const liste = Array.isArray(j) ? j : [j];
  const esle = new Map(liste.map((x) => [x.id, x]));
  return govde.map((g) => {
    const c = esle.get(g.id);
    return c && !c.error ? c.result : null;
  });
}

/* A rate-limited batch comes back as a failure for EVERY call in it, which
   would read as "none of these assets work". Chunking plus retries turns
   that back into "ask again". */
async function toplu(rpc, cagrilar) {
  const cikti = [];
  for (let i = 0; i < cagrilar.length; i += PARCA) {
    const dilim = cagrilar.slice(i, i + PARCA);
    let sonuc = null;
    for (let deneme = 0; deneme < 3 && !sonuc; deneme++) {
      try {
        istek++;
        sonuc = await tekToplu(rpc, dilim);
      } catch (e) {
        if (deneme === 2) sonuc = dilim.map(() => null);
        else await new Promise((r) => setTimeout(r, 800 * (deneme + 1)));
      }
    }
    cikti.push(...sonuc);
  }
  return cikti;
}

/* ---- the universe -------------------------------------------------- */

const LISTELER = [
  "https://tokens.uniswap.org",
  "https://raw.githubusercontent.com/Uniswap/default-token-list/main/build/uniswap-default.tokenlist.json"
];

async function evren() {
  const varliklar = new Map();

  for (const u of LISTELER) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) continue;
      const j = await r.json();
      let eklenen = 0;
      for (const t of (j.tokens || [])) {
        const z = Object.entries(ZINCIRLER).find(([, Z]) => Z.id === t.chainId);
        if (!z) continue;
        const k = z[0] + ":" + String(t.address).toLowerCase();
        if (!varliklar.has(k)) {
          varliklar.set(k, {
            zincir: z[0], token: t.address, simge: t.symbol,
            ad: t.name, ondalik: t.decimals
          });
          eklenen++;
        }
      }
      if (eklenen > 0) {
        console.log("  liste  " + u.replace(/^https:\/\//, "").slice(0, 48) +
          "   " + eklenen + " varlik");
        break;
      }
    } catch (e) { /* next list */ }
  }

  /* Everything the old measurement already found, so changing where the
     universe comes from cannot silently drop an asset that worked. */
  if (fs.existsSync(ESKI)) {
    const j = JSON.parse(fs.readFileSync(ESKI, "utf8"));
    let eklenen = 0;
    for (const z of j.zincirler) {
      if (!ZINCIRLER[z.zincir]) continue;
      for (const a of z.adaylar) {
        const k = z.zincir + ":" + String(a.token).toLowerCase();
        if (!varliklar.has(k)) {
          varliklar.set(k, {
            zincir: z.zincir, token: a.token, simge: a.simge,
            ad: a.ad || a.simge, ondalik: a.ondalik
          });
          eklenen++;
        }
      }
    }
    if (eklenen) console.log("  eski olcumden devralinan: " + eklenen);
  }

  return [...varliklar.values()];
}

/* ---- the measurement ----------------------------------------------- */

async function zinciriOlc(anahtar, adaylar) {
  const Z = ZINCIRLER[anahtar];

  /* 1 — every canonical tier of every candidate */
  const havuzHam = await toplu(Z.rpc, adaylar.flatMap((a) =>
    KADEMELER.map((k) => ({
      to: Z.v3Fabrika,
      data: "0x1698ee82" + pad(a.token) + pad(Z.usdc) + k.toString(16).padStart(64, "0")
    }))));

  const havuzlu = [];
  adaylar.forEach((a, i) => {
    const havuzlar = [];
    KADEMELER.forEach((k, j) => {
      const h = havuzHam[i * KADEMELER.length + j];
      if (!h || h === "0x") return;
      const adres = "0x" + h.slice(26);
      if (adres.toLowerCase() === SIFIR) return;
      havuzlar.push({ kademe: k, havuz: adres });
    });
    if (havuzlar.length) havuzlu.push({ ...a, havuzlar });
  });

  /* 2 — liquidity, marginal price and observation history per pool */
  const okuma = await toplu(Z.rpc, havuzlu.flatMap((a) =>
    a.havuzlar.flatMap((h) => ([
      { to: h.havuz, data: "0x1a686502" },   // liquidity()
      { to: h.havuz, data: "0x3850c7bd" },   // slot0()
      { to: h.havuz, data: "0x0dfe1681" }    // token0()
    ]))));

  let o = 0;
  for (const a of havuzlu) {
    for (const h of a.havuzlar) {
      const L = okuma[o++], s0 = okuma[o++], t0 = okuma[o++];
      h.likidite = say(L);
      h.sqrtX96 = s0 && s0 !== "0x" ? BigInt("0x" + s0.slice(2, 66)) : 0n;
      h.kardinalite = 0;
      if (s0 && s0 !== "0x" && s0.length >= 2 + 64 * 4) {
        try {
          h.kardinalite = Number(BigInt("0x" + s0.slice(2 + 64 * 3, 2 + 64 * 4)));
        } catch (e) { /* stays 0 */ }
      }
      h.varlikSifirinci = !!t0 && t0 !== "0x" &&
        ("0x" + t0.slice(26)).toLowerCase() === a.token.toLowerCase();
    }
    a.enDerin = a.havuzlar.reduce((x, y) => (y.likidite > x.likidite ? y : x));
    a.olculebilir = a.enDerin.likidite > 0n && a.enDerin.kardinalite >= ASGARI_KARDINALITE;
    a.sebep = a.enDerin.likidite === 0n
      ? "en derin havuzun likiditesi sifir"
      : (a.enDerin.kardinalite < ASGARI_KARDINALITE ? "gozlem gecmisi yok" : "");
    a.ittirme = null;
  }

  /* 3 — the question that decides, asked at every size.
       One pass per size rather than one per asset: a batch of 60 costs the
       same round trip whether it holds one asset or sixty. */
  const olculebilir = havuzlu.filter((a) => a.olculebilir);
  for (const a of olculebilir) a.boyutlar = {};

  if (Z.quoter && olculebilir.length) {
    for (const tutar of TUTARLAR) {
      const kotalar = await toplu(Z.rpc, olculebilir.map((a) => ({
        to: Z.quoter,
        /* Every member of the struct is static, so it encodes inline — no
           offset word. Measured both ways: with the offset it reverts. */
        data: "0xc6a5026a" + pad(Z.usdc) + pad(a.token) +
          tutar.toString(16).padStart(64, "0") +
          a.enDerin.kademe.toString(16).padStart(64, "0") + "".padStart(64, "0")
      })));

      olculebilir.forEach((a, i) => {
        const gercek = say(kotalar[i]);
        if (gercek === 0n || a.enDerin.sqrtX96 === 0n) return;
        const oran = (Number(a.enDerin.sqrtX96) / 2 ** 96) ** 2;
        const hamFiyat = a.enDerin.varlikSifirinci ? oran : 1 / oran;
        const marjinal = Number(tutar) / hamFiyat;
        if (!(marjinal > 0) || !Number.isFinite(marjinal)) return;
        const it = marjinal / Number(gercek);
        a.boyutlar[String(tutar)] = Number(it.toFixed(4));
        /* The largest size that still clears the floor. Recorded as it
           goes up, so the last one to pass is what remains. */
        if (it <= TAVAN) a.azamiTutar = tutar.toString();
        /* The headline figure stays the push at the reference size, so
           the ranking is comparable across assets. */
        if (tutar === TUTAR) a.ittirme = Number(it.toFixed(4));
      });
    }
  }

  for (const a of havuzlu) {
    /* "Works" now means: clears the floor at SOME size. An asset that
       handles $20 but not $20,000 is usable — just not for a vault that
       big — and calling it broken would hide 25 working assets. */
    a.donusturulebilir = a.olculebilir && !!a.azamiTutar;
  }

  return havuzlu;
}

(async () => {
  console.log("TEMINAT ADAYLARI — OLCUT DERINLIK");
  console.log("  tutar $" + (Number(TUTAR) / 1e6).toLocaleString("en") +
    "   taban toleransi %" + AZAMI_KAYMA_BPS / 100 +
    "   yani " + TAVAN.toFixed(3) + " kata kadar ittirme gecer");
  console.log("");

  const hepsi = await evren();
  console.log("  evren " + hepsi.length + " varlik-zincir cifti  (" +
    new Set(hepsi.map((a) => a.simge)).size + " ayri sembol)");
  console.log("");

  const cikti = {
    olculdu: new Date().toISOString(),
    tutar: TUTAR.toString(),
    azamiKaymaBps: AZAMI_KAYMA_BPS,
    not: "Olcut: bu tutar bu havuzda donusturulebiliyor mu. Likidite tabani " +
      "ya da piyasa degeri gibi vekil kalite kapisi kullanilmadi.",
    zincirler: []
  };

  for (const [anahtar, Z] of Object.entries(ZINCIRLER)) {
    const adaylar = hepsi.filter((a) => a.zincir === anahtar);
    if (!adaylar.length) continue;
    process.stdout.write("  " + Z.ad.padEnd(11) + String(adaylar.length).padStart(4) + " aday ... ");
    const olculen = await zinciriOlc(anahtar, adaylar);
    const olc = olculen.filter((a) => a.olculebilir).length;
    const don = olculen.filter((a) => a.donusturulebilir).length;
    console.log("havuzu olan " + String(olculen.length).padStart(3) +
      "   fiyati olculebilen " + String(olc).padStart(3) +
      "   donusturulebilen " + (Z.quoter ? don : "olculemedi"));
    cikti.zincirler.push({
      zincir: anahtar, ad: Z.ad, domain: Z.domain, usdc: Z.usdc,
      v3Fabrika: Z.v3Fabrika, quoter: Z.quoter,
      adaylar: olculen.map((a) => ({
        simge: a.simge, ad: a.ad, token: a.token, ondalik: a.ondalik,
        kademe: a.enDerin.kademe, havuz: a.enDerin.havuz,
        likidite: a.enDerin.likidite.toString(),
        kardinalite: a.enDerin.kardinalite,
        havuzSayisi: a.havuzlar.length,
        olculebilir: a.olculebilir, sebep: a.sebep,
        ittirme: a.ittirme == null ? null : Number(a.ittirme),
        boyutlar: a.boyutlar || null,
        azamiTutar: a.azamiTutar || null,
        donusturulebilir: a.donusturulebilir
      }))
    });
  }

  fs.writeFileSync(HEDEF, JSON.stringify(cikti, null, 1));

  /* One row per symbol: the chain where it converts best. */
  const enIyi = new Map();
  for (const z of cikti.zincirler) {
    for (const a of z.adaylar) {
      if (!a.donusturulebilir) continue;
      const v = enIyi.get(a.simge);
      const buyuk = BigInt(a.azamiTutar || 0);
      if (!v || buyuk > BigInt(v.azamiTutar || 0)) {
        enIyi.set(a.simge, { ...a, zincir: z.zincir });
      }
    }
  }
  const sirali = [...enIyi.values()].sort((x, y) => {
    const d = Number(BigInt(y.azamiTutar || 0) - BigInt(x.azamiTutar || 0));
    return d || (x.ittirme || 0) - (y.ittirme || 0);
  });

  console.log("");
  console.log("  " + path.relative(KOK, HEDEF) + "   (" + istek + " RPC istegi)");
  console.log("");
  console.log("  DONUSTURULEBILEN AYRI SEMBOL: " + sirali.length);
  console.log("");
  for (const t of [...TUTARLAR].reverse()) {
    const bu = sirali.filter((a) => a.azamiTutar === t.toString());
    const veUstu = sirali.filter((a) => BigInt(a.azamiTutar || 0) >= t);
    console.log("  $" + (Number(t) / 1e6).toLocaleString("en").padStart(7) +
      " kadar: " + String(veUstu.length).padStart(3) + " sembol" +
      (bu.length ? "      tam burada duran: " + bu.map((a) => a.simge).join(" ") : ""));
  }
  console.log("");
  console.log("  Siralama: once hangi buyuklugu kaldirdigi, sonra ittirmesi.");
  console.log("  Hicbir esik yok — olculen sey dogrudan yapilacak isin kendisi:");
  console.log("  bu tutar bu havuzda donusturulebiliyor mu.");
  process.exit(0);
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
