"use strict";
/* ===========================================================================
 * olc-evren.js — does the collateral menu build against the contracts?
 *
 * teminat-evreni.json is produced by olc-besleyiciler.js and says five
 * assets on Arc are both priceable and holdable. That is a claim about the
 * chain. Whether ChainlinkOracle and TeminatKasasi will accept those five
 * TOGETHER is a different claim, and this is the script that settles it —
 * so the file and the contracts cannot drift apart without something
 * failing.
 *
 * Reading the menu from the JSON rather than retyping it is the point: a
 * list the UI uses and a list the tests use that are typed separately are
 * two lists, and they will disagree eventually.
 *
 *   node scripts/olc-evren.js
 * =========================================================================== */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000Ec";
const CAGIRAN = "0x2222222222222222222222222222222222222222";
const USDC = "0x3600000000000000000000000000000000000000";

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

const { isim: hataAdi } = require("./revert-coz");
const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("TEMINAT EVRENI — menunun sozlesmelerle kurulabildigi");
  console.log("");

  const yol = path.join(__dirname, "..", "teminat-evreni.json");
  if (!fs.existsSync(yol)) {
    console.log("  teminat-evreni.json yok — once: node scripts/olc-besleyiciler.js");
    process.exit(1);
  }
  const e = JSON.parse(fs.readFileSync(yol, "utf8"));
  ok(e.varliklar.length === 5, "dosyada bes varlik var", e.varliklar.length + " varlik");
  ok(e.zincir === 5042, "dosya Arc icin", String(e.zincir));

  /* The quote has to be in the basket; the vault's pending asset is the
     thing conversions spend. */
  const quoteVar = e.varliklar.some((v) => v.token.toLowerCase() === USDC.toLowerCase());
  ok(quoteVar, "quote (USDC) sepette");

  /* Weights that close and are deliberately uneven, so a bug that only
     works for equal shares shows. USDC keeps the largest share because it
     is what a conversion spends. */
  const agirliklar = [4_000, 2_500, 1_500, 1_000, 1_000];
  ok(agirliklar.reduce((a, b) => a + b, 0) === 10_000, "agirliklar 10.000'e kapaniyor");

  const T = B("TestEvren");
  const iface = new Interface(T.abi);
  const tokenlar = e.varliklar.map((v) => v.token);
  const feedler = e.varliklar.map((v) => v.proxy);

  let s;
  try {
    const r = await rpc("eth_call", [
      { from: CAGIRAN, to: H, gas: "0x4000000",
        data: iface.encodeFunctionData("run", [USDC, tokenlar, feedler, agirliklar]) },
      "latest", { [H]: { code: T.deployedBytecode } }
    ]);
    [s] = iface.decodeFunctionResult("run", r);
  } catch (err) {
    console.log("");
    ok(false, "BES VARLIKLI ORACLE VE KASA KURULDU", "revert: " + hataAdi(err.data) + "  " + err.message);
    console.log("");
    console.log(kotu + " KOTU");
    process.exit(1);
  }

  console.log("");
  ok(s.kasaKuruldu === true, "BES VARLIKLI ORACLE VE KASA KURULDU",
    "oracle " + s.oracle + "  kasa " + s.kasa);

  console.log("");
  console.log("  VARLIK                ONDALIK  BESLEYICI  1 BIRIM DEGERI      YAYINLANAN");
  for (let i = 0; i < 5; i++) {
    const v = e.varliklar[i];
    const zincirde = Number(s.birBirimDegeri[i]) / 1e6;
    const yayin = v.fiyat;
    console.log("   " + v.besleyiciAdi.slice(0, 20).padEnd(20) + "  " +
      String(s.varlikOndalik[i]).padStart(5) + "  " +
      String(s.feedOndalik[i]).padStart(7) + "  " +
      ("$" + zincirde.toLocaleString("en", { maximumFractionDigits: 2 })).padStart(16) + "   " +
      ("$" + yayin.toLocaleString("en", { maximumFractionDigits: 2 })).padStart(14));

    /* The published price and the on-chain value of one unit have to agree.
       They are computed from the same feed answer by different code —
       the directory's price by Chainlink, the unit value by
       ChainlinkOracle's four-scale expression — so agreement is a real
       check on the arithmetic and not a tautology.

       1% of tolerance, because the feed can tick between the two reads. */
    const fark = yayin > 0 ? Math.abs(zincirde - yayin) / yayin : 1;
    ok(fark < 0.01, v.besleyiciAdi + " 1 birim degeri yayinlanan fiyatla ayni",
      "fark %" + (fark * 100).toFixed(4));
    ok(s.degerlenebilir[i] === true, v.besleyiciAdi + " degerlenebilir (besleyici taze)");
  }

  /* The scale trap, stated as an assertion. XAUM's feed is 18 decimals
     where the others are 8, and the token scales differ too. If the
     expression mixed them up, gold would price at 1e-10 of its value or
     1e10 times it, and either is unmissable at this check. */
  const xaum = e.varliklar.findIndex((v) => /XAUM/.test(v.besleyiciAdi));
  if (xaum >= 0) {
    ok(Number(s.feedOndalik[xaum]) === 18,
      "XAUM besleyicisi gercekten 18 ondalikli — digerleri 8",
      "dort ayri olcek ayni ifadede bulusuyor");
    const g = Number(s.birBirimDegeri[xaum]) / 1e6;
    ok(g > 1_000 && g < 20_000, "bir birim altin makul bir dolar degeri veriyor",
      "$" + g.toLocaleString("en", { maximumFractionDigits: 2 }));
  }

  ok(BigInt(s.sepetDegeri.toString()) === 0n,
    "BOS SEPET TAM OLARAK SIFIR DEGERINDE",
    "tutmadigi degeri bildiren bir sepet en kotu hata olurdu");

  console.log("");
  console.log("  Bu menu arayuzun teklif edecegi listedir ve elle yazilmaz:");
  console.log("  teminat-evreni.json'u olc-besleyiciler.js uretir, bu betik dogrular.");
  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
