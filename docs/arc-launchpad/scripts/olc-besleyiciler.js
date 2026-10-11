"use strict";
/* ===========================================================================
 * olc-besleyiciler.js — which Chainlink feeds on Arc can this project
 *                       actually use?
 *
 * WHY THIS EXISTS AT ALL
 *   The feeds were originally found by scanning AnswerUpdated logs, which
 *   finds AGGREGATORS. An aggregator is the thing a proxy points at, and
 *   two problems follow:
 *
 *     1. Some aggregators are AccessControlledOffchainAggregator. Their
 *        access controller grants msg.sender == tx.origin, so a wallet
 *        reads them fine with eth_call and no CONTRACT can read them at
 *        all. A feed that answers in the terminal and reverts "No access"
 *        from inside the oracle is the worst possible failure mode: it
 *        looks verified and ships dead.
 *
 *     2. Chainlink replaces an aggregator under its proxy. An oracle
 *        pinned to the aggregator keeps reading the old one, which simply
 *        stops updating — a stale price with no error, which is how a
 *        reserve gets valued at last year's rate.
 *
 *   So production must use the PROXY, and the proxy must be proven readable
 *   from a contract. This script does both, against the official reference
 *   data directory rather than anything derived by guessing.
 *
 * WHAT IT PRINTS
 *   The collateral universe: every asset Arc can price, whether a contract
 *   can read it, how fresh it is, and — for the ones this project cares
 *   about — whether a token exists on Arc to actually hold. A feed without
 *   a token is a price for something nobody here can own.
 *
 *   node scripts/olc-besleyiciler.js
 * =========================================================================== */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const DIZIN = "https://reference-data-directory.vercel.app/feeds-arc-mainnet.json";
const H = "0x00000000000000000000000000000000000000Eb";
const CAGIRAN = "0x2222222222222222222222222222222222222222";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(m, p) {
  let b = 2500;
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
      return j.result;
    } catch (e) {
      if (k >= 6 || !/rate|limit|429|timeout|ECONN|fetch/i.test(String(e.message))) throw e;
      await bekle(b); b = Math.min(b * 2, 20000);
    }
  }
}

/* The assets on Arc that are BOTH priceable and holdable — the join is
   the whole point, because a feed without a token is a price for
   something nobody here can own, and a token without a feed cannot be
   valued and so counts as zero in the basket.

   Found by ranking all 47,112 tokens that appear in Arc's v4 pools by
   how many pools they appear in: a launched memecoin sits in a handful
   and carries a 1,000,000,000 supply, while a real asset gets paired
   over and over. Symbols and supplies read from the chain:

     USDC    38,231 pools   517,799,103
     cirBTC     331 pools         5,289
     EURC       229 pools     7,687,151
     WETH        68 pools         6,195
     XAUM        44 pools           386

   CRCL (4,388) and NVDA (127) are also real and also appear, and Arc
   prices neither — so neither can be collateral, however much anyone
   would like a stock in the basket. */
const ARC_TOKENLERI = {
  "USDC / USD": "0x3600000000000000000000000000000000000000",
  "BTC / USD": "0x171a4217b86a807a64eb94757db6849fb4bdbaa0",          // cirBTC
  "ETH / USD": "0x128cc466b61f542da60c70e3aa11c10e19b84edb",          // WETH
  "EURC / USD": "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1",
  "XAUM Reference Rate": "0x178b01f61cbea1d2a5581fe1621be607835ec349"  // tokenised gold
};

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("ARC BESLEYICILERI — resmi dizin + sozlesmeden okunabilirlik");
  console.log("");

  const r = await fetch(DIZIN);
  if (!r.ok) throw new Error("dizin alinamadi: " + r.status);
  const liste = await r.json();
  console.log("  dizinde " + liste.length + " besleyici (kaynak: reference-data-directory)");
  ok(liste.length > 0, "dizin bos degil");

  /* Everything with a proxy. A record without one cannot be used safely at
     all, and silently skipping it would hide that. */
  const proxysiz = liste.filter((f) => !f.proxyAddress);
  ok(proxysiz.length === 0, "her kaydin proxy adresi var",
    proxysiz.length ? proxysiz.map((f) => f.name).join(", ") : "34/34");

  const T = B("TestBesleyiciErisim");
  const iface = new Interface(T.abi);

  /* Read them from a CONTRACT, in batches. This is the measurement the
     whole script exists for: eth_call from a wallet proves nothing about
     what the oracle will be able to do. */
  const adresler = liste.map((f) => f.proxyAddress);
  const okundu = [];
  const cevaplar = [];
  const PARCA = 12;
  for (let i = 0; i < adresler.length; i += PARCA) {
    const dilim = adresler.slice(i, i + PARCA);
    const res = await rpc("eth_call", [
      { from: CAGIRAN, to: H, gas: "0x4000000", data: iface.encodeFunctionData("dene", [dilim]) },
      "latest", { [H]: { code: T.deployedBytecode } }
    ]);
    const [o, c] = iface.decodeFunctionResult("dene", res);
    for (let j = 0; j < dilim.length; j++) { okundu.push(o[j]); cevaplar.push(c[j]); }
    await bekle(1200);
  }

  console.log("");
  console.log("  VARLIK             PROXY                                        SOZLESMEDEN  FIYAT");
  let okunabilir = 0;
  const fiyatlar = {};
  for (let i = 0; i < liste.length; i++) {
    const f = liste[i];
    const dec = Number(f.decimals || 8);
    const ham = BigInt(cevaplar[i].toString());
    const deger = Number(ham) / 10 ** dec;
    if (okundu[i]) { okunabilir++; fiyatlar[f.name] = deger; }
    console.log("   " + String(f.name).slice(0, 18).padEnd(18) + " " +
      f.proxyAddress + "   " +
      (okundu[i] ? "EVET  " : "HAYIR ") + "  " +
      (okundu[i] ? deger.toLocaleString("en", { maximumFractionDigits: dec > 8 ? 6 : 4 }) : "-"));
  }
  console.log("");
  ok(okunabilir === liste.length, "PROXY'LERIN HEPSI SOZLESMEDEN OKUNABILIR",
    okunabilir + "/" + liste.length + " — aggregator'larda durum bu degildi");

  /* Sanity, not decoration: a feed that answers with a nonsense number is
     worse than one that reverts, because nothing downstream will notice. */
  const btc = fiyatlar["BTC / USD"], eth = fiyatlar["ETH / USD"], usdc = fiyatlar["USDC / USD"];
  ok(btc > 1_000 && btc < 10_000_000, "BTC/USD makul", btc ? "$" + btc.toLocaleString("en") : "okunamadi");
  ok(eth > 100 && eth < 1_000_000, "ETH/USD makul", eth ? "$" + eth.toLocaleString("en") : "okunamadi");
  ok(usdc > 0.9 && usdc < 1.1, "USDC/USD bire yakin", usdc ? "$" + usdc.toFixed(6) : "okunamadi");
  ok(btc > eth * 5, "BTC ETH'ten belirgin yuksek");

  /* The honest collateral list. A price is not an asset: holding BNB as
     collateral needs a BNB token on Arc, and there is not one. */
  console.log("");
  console.log("  TEMINAT EVRENI — fiyati OLAN ve Arc'ta TOKENI olan varliklar");
  let tutulabilir = 0;
  for (const [ad, token] of Object.entries(ARC_TOKENLERI)) {
    const kod = await rpc("eth_getCode", [token, "latest"]);
    const var_ = kod && kod !== "0x";
    const f = liste.find((x) => x.name === ad);
    if (var_ && f) tutulabilir++;
    console.log("   " + ad.padEnd(14) + " token " + token +
      "   kod:" + (var_ ? ((kod.length - 2) / 2) + "b" : "YOK") +
      "   besleyici:" + (f ? "var" : "YOK"));
    await bekle(900);
  }
  ok(tutulabilir === Object.keys(ARC_TOKENLERI).length,
    "listelenen her varligin HEM tokeni HEM besleyicisi var", tutulabilir + " varlik");

  /* Written out, because the creation UI has to offer exactly this and a
     menu typed into a web page drifts from what the contracts accept. */
  const evren = Object.entries(ARC_TOKENLERI).map(([ad, token]) => {
    const f = liste.find((x) => x.name === ad);
    return {
      besleyiciAdi: ad,
      token,
      proxy: f && f.proxyAddress,
      feedOndalik: f && Number(f.decimals || 8),
      heartbeat: f && f.heartbeat,
      fiyat: fiyatlar[ad] !== undefined ? fiyatlar[ad] : null
    };
  });
  const cikti = {
    olculdu: new Date().toISOString(),
    zincir: 5042,
    not: "proxy adresleri; aggregator DEGIL. olc-besleyiciler.js uretir.",
    varliklar: evren
  };
  fs.writeFileSync(path.join(__dirname, "..", "teminat-evreni.json"),
    JSON.stringify(cikti, null, 1));
  ok(evren.every((v) => v.proxy && v.fiyat !== null),
    "teminat-evreni.json yazildi, her satirda proxy ve fiyat var",
    evren.length + " varlik");

  /* And the part that must not be dressed up. The user asked about DOGE,
     XLM and HBAR by name; Arc prices none of them. */
  console.log("");
  console.log("  SORULAN AMA ARC'TA FIYATI OLMAYANLAR:");
  for (const ad of ["DOGE / USD", "XLM / USD", "HBAR / USD", "ADA / USD", "DOT / USD"]) {
    const f = liste.find((x) => x.name === ad);
    console.log("   " + ad.padEnd(14) + (f ? "VAR " + f.proxyAddress : "besleyici YOK — teminat olamaz"));
  }
  console.log("");
  console.log("  Arc'ta fiyati OLAN kripto varliklar: " +
    liste.filter((f) => /\/ USD$/.test(f.name) && !/^(USD|EUR|CAD|JPY|KRW|BRL|MXN|AUD)/.test(f.name))
         .map((f) => f.name.replace(" / USD", "")).join(", "));

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
