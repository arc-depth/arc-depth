"use strict";
/* ===========================================================================
 * olc-cevirme.js — cevir() against Arc's real cirBTC/USDC pool
 *
 * WHY THIS COULD NOT BE A UNIT TEST
 *   Conversion is the ONLY vault operation that accepts an exchange rate.
 *   Redemption is a ratio; a buyback compares the claim against itself.
 *   Neither looks outside the vault, so neither needs a price. Conversion
 *   does, which means the oracle bound is the whole safety property — and a
 *   mock swapper that returns whatever the test asks for would turn every
 *   assertion into a restatement of the test's own arithmetic.
 *
 *   So the borrowed USDC goes through Arc's live v4 pool
 *   0x85ff2b5048d2… (cirBTC/USDC, fee 1500, spacing 15, no hook) and the
 *   result is judged by the live Chainlink BTC feed. Two independent
 *   systems, neither aware of the other, have to agree within 1%.
 *
 * HOW THE MONEY EXISTS
 *   eth_call with a state override. Arc's gas token IS USDC, so a balance
 *   override reads back as an ERC20 balance at 0x3600… — measured earlier:
 *   1000 ether override reads as 1,000.00 USDC.
 *
 * WHAT A GREEN RUN PROVES AND WHAT IT DOES NOT
 *   It proves the plumbing works and that pool and feed agree today, at
 *   these sizes. It does NOT prove the 1% bound is right for every asset:
 *   that number is a policy choice about how much routing loss the vault
 *   will absorb, and the run reports the measured loss so the choice can be
 *   argued with numbers instead of taste.
 * =========================================================================== */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000Ea";
const CAGIRAN = "0x2222222222222222222222222222222222222222";

const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";   // Arc PoolManager
const USDC = "0x3600000000000000000000000000000000000000";
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
/* Chainlink PROXY addresses, from Chainlink's own reference data
   directory. NOT the aggregators an AnswerUpdated log scan finds: an
   aggregator gets retired under its proxy and then answers a stale
   price with no error, and some are access-controlled so that no
   contract can read them at all. All 34 Arc proxies were measured
   readable from a contract — see olc-besleyiciler.js. */
const BTC_FEED = "0xa109B535C70C8Be9995be64Bb6751AcDB27e03De";
/* No USDC feed is registered. Arc's USDC/USD aggregator is
   access-controlled and readable only by an EOA — measured, not assumed:
   a contract staticcall returns "No access" while eth_call from a wallet
   answers. The vault values its own quote at face, so it never needs one. */
const WETH = "0x128cc466b61f542da60c70e3aa11c10e19b84edb";   // in no basket here

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

const T = B("TestCevirme");
const iface = new Interface(T.abi);
const KASA = new Interface(B("TeminatKasasi").abi);

async function cagir(ad, args) {
  const r = await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x6000000", data: iface.encodeFunctionData(ad, args) },
    "latest",
    { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 25n).toString(16) } }
  ]);
  return iface.decodeFunctionResult(ad, r);
}

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BTC = (v) => (Number(v) / 1e8).toFixed(8);
const V = (v) => BigInt(v.toString());

/* Which custom error a revert blob names. Matching on the selector rather
   than the message, because a revert that merely "failed" is the one case a
   test must not accept: the wrong refusal looks identical to the right one. */
function hataAdi(sebep) {
  if (!sebep || sebep === "0x" || sebep.length < 10) return "(bos)";
  const sel = sebep.slice(0, 10);
  for (const f of Object.values(KASA.fragments)) {
    if (f.type === "error" && KASA.getError(f.name).selector === sel) return f.name;
  }
  try {
    const s = KASA.parseError ? null : null;
  } catch (e) { /* nothing */ }
  // Solidity Error(string)
  if (sel === "0x08c379a0") {
    try {
      const { AbiCoder } = require("ethers");
      return "Error(" + AbiCoder.defaultAbiCoder().decode(["string"], "0x" + sebep.slice(10))[0] + ")";
    } catch (e) { return "Error(?)"; }
  }
  return "bilinmeyen " + sel;
}

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("CEVIRME — gercek Arc havuzu + gercek Chainlink besleyici");
  console.log("  havuz   cirBTC/USDC  fee 1500  spacing 15  hook yok");
  console.log("  yon     USDC (currency1) -> cirBTC (currency0)");
  console.log("");

  /* ---- 1. a fair conversion, three sizes -------------------------- */
  console.log("1) DURUST CEVIRME — havuz ile besleyici anlasmali");
  /* $1,000 is deliberately absent. It does NOT clear the 1% bound on
     today's pool, and section 1b measures where the edge actually is
     rather than asserting a size somebody once guessed. */
  const boylar = [10_000_000n, 100_000_000n, 300_000_000n];   // $10, $100, $300
  let ilk = null;
  for (const harcama of boylar) {
    const besleme = harcama * 5n;      // room, so the weight ceiling is not what binds
    let s;
    try {
      [s] = await cagir("cevirTesti", [PM, BTC_FEED, besleme, harcama, 9_000, 0]);
    } catch (e) {
      ok(false, "cevir " + U(harcama), "revert: " + hataAdi(e.data) + "  " + e.message);
      continue;
    }
    if (!ilk) ilk = s;
    const kayipBps = Number((V(s.oracleDegeri) * 10_000n) / V(harcama)) - 10_000;
    console.log("     harcanan " + U(harcama) +
      "  ->  " + BTC(s.gelen) + " cirBTC" +
      "   oracle " + U(s.oracleDegeri) +
      "   fark " + (kayipBps / 100).toFixed(3) + "%");
    console.log("       havuz kuru " + U(s.havuzKuru) + " / cirBTC    besleyici " + U(s.oracleKuru) + " / cirBTC");
    ok(V(s.gelen) > 0n, "havuzdan cirBTC geldi " + U(harcama), BTC(s.gelen));
    ok(V(s.btcSonra) === V(s.btcOnce) + V(s.gelen), "kasa bakiyesi tam gelen kadar artti " + U(harcama));
    ok(V(s.usdcSonra) === V(s.usdcOnce) - V(harcama), "kasa USDC'si tam harcama kadar dustu " + U(harcama));
    ok(V(s.hakBtcSonra) > V(s.hakBtcOnce), "cirBTC hakki sifirdan yukari cikti " + U(harcama),
      "0 -> " + (Number(s.hakBtcSonra) / 1e36).toExponential(4));
  }

  /* ---- 1b. where does the 1% bound actually bite? ----------------- */
  console.log("");
  console.log("1b) KAPASITE — %1 siniri bugunku havuzda hangi boyda kesiyor");
  {
    /* Binary search on the spend. This is the number that matters
       operationally: a defense engine that tries to convert more than
       this in one call will simply revert, so the engine has to split. */
    let gecen = 0n, kalan = 2_000_000_000n;   // $0 .. $2.000
    let alt = 5_000_000n, ust = kalan;
    for (let adim = 0; adim < 8; adim++) {
      const orta = (alt + ust) / 2n;
      let oldu = false;
      try {
        const [s] = await cagir("cevirTesti", [PM, BTC_FEED, orta * 5n, orta, 9_000, 0]);
        oldu = V(s.gelen) > 0n;
      } catch (e) { oldu = false; }
      if (oldu) { gecen = orta; alt = orta; } else { ust = orta; }
      if (ust - alt < 10_000_000n) break;   // $10 resolution is enough
    }
    console.log("     tek cagrida gecen en buyuk harcama  ~" + U(gecen));
    ok(gecen >= 100_000_000n, "tek cagrida en az $100 cevrilebiliyor",
      "bunun ustu bolunerek cevrilir");
    ok(gecen < 2_000_000_000n, "sinir gercekten bagliyor, her boyu kabul etmiyor",
      "$2.000 gecmedi — %1 kapisi acik degil");
  }
  console.log("");

  /* The basket's valued total must not fall: USDC left and cirBTC arrived,
     and the only gap allowed is the routing loss. This is the property a
     holder cares about — the floor is the basket value per token. */
  if (ilk) {
    const dusus = V(ilk.sepetOnce) - V(ilk.sepetSonra);
    const dususBps = Number((dusus * 10_000n) / V(ilk.sepetOnce));
    console.log("");
    console.log("     sepet degeri " + U(ilk.sepetOnce) + " -> " + U(ilk.sepetSonra) +
      "   dusus " + U(dusus) + " (" + (dususBps / 100).toFixed(3) + "%)");
    ok(dususBps <= 100, "sepet degeri cevirme yuzunden %1'den fazla dusmedi",
      "havuz ucreti 0,15% + kayma");
  }

  /* ---- 2. every refusal ------------------------------------------- */
  console.log("");
  console.log("2) REDLER — her biri DOGRU hatayla");
  const redler = [
    { ad: "sepette olmayan varlik",         args: [10_000_000n, 9_000, 0,    WETH],   bek: "SepetteYok" },
    { ad: "hedef quote'un kendisi",         args: [10_000_000n, 9_000, 0,    USDC],   bek: "SepetteYok" },
    { ad: "agirligi sifir olan varlik",     args: [10_000_000n, 0,     0,    CIRBTC], bek: "AgirlikSifir" },
    { ad: "asgari altinda harcama ($4)",    args: [4_000_000n,  9_000, 0,    CIRBTC], bek: "AzMiktar" },
    { ad: "kotu rota — ciktinin %5'i kesildi", args: [10_000_000n, 9_000, 500,  CIRBTC], bek: "KotuKur" },
    { ad: "hicbir sey getirmeyen borclu",   args: [10_000_000n, 9_000, 10_000, CIRBTC], bek: "SifirMiktar" },
    { ad: "bekleyenden fazla harcama",      args: [10_000_000n, 9_000, 0,    CIRBTC], bek: "YetersizBekleyen", besleme: 5_000_000n }
  ];
  for (const r of redler) {
    const [harcama, yuzde, kes, hedef] = r.args;
    const besleme = r.besleme !== undefined ? r.besleme : harcama * 5n;
    let revertEtti, sebep;
    try {
      [revertEtti, sebep] = await cagir("redTesti",
        [PM, BTC_FEED, besleme, harcama, yuzde, kes, hedef]);
    } catch (e) {
      ok(false, r.ad, "harness revert: " + hataAdi(e.data));
      continue;
    }
    const ad = hataAdi(sebep);
    ok(revertEtti === true && ad === r.bek, r.ad, ad + (ad === r.bek ? "" : "  BEKLENEN " + r.bek));
  }

  /* ---- 3. the weight ceiling actually binds ----------------------- */
  console.log("");
  console.log("3) AGIRLIK TAVANI — ikinci cevirme payi asinca durmali");
  {
    /* cirBTC target 20%, tolerance 5 points -> past 25% of the valued
       basket is refused. $15 of $100 lands at ~15%, under the ceiling;
       a second $15 would reach ~30% and must not happen.
       Sized at $40 instead, the FIRST call overshoots and is refused —
       correct, but it proves nothing about the sequence, which is the
       mistake this test was written with. */
    const [birinciRevert, birinci, ikinciRevert, sebep, payBps] = await cagir("ikiKezTesti",
      [PM, BTC_FEED, 100_000_000n, 15_000_000n, 2_000]);
    ok(birinciRevert === false, "tavanin altinda kalan birinci cevirme gecti");
    console.log("     birinci cevirme " + BTC(birinci) + " cirBTC   sonra cirBTC payi %" +
      (Number(payBps) / 100).toFixed(2) + "   hedef %20 + tolerans 5 puan = tavan %25");
    const ad = hataAdi(sebep);
    ok(Number(payBps) > 1_000 && Number(payBps) <= 2_500,
      "birinci cevirme payi tavanin ALTINDA kaldi", "%" + (Number(payBps) / 100).toFixed(2));
    ok(ikinciRevert === true && ad === "AgirlikAsildi", "ikinci cevirme AgirlikAsildi ile reddedildi", ad);
  }

  /* And the opposite: a conversion that stays inside the target has to be
     allowed, or the ceiling is just a block on all conversion. */
  {
    const [birinciRevert, birinci, ikinciRevert, sebep, payBps] = await cagir("ikiKezTesti",
      [PM, BTC_FEED, 100_000_000n, 20_000_000n, 9_000]);
    ok(birinciRevert === false, "hedef %90: birinci cevirme gecti");
    const ad = hataAdi(sebep);
    console.log("     hedef %90: birinci " + BTC(birinci) + "  pay %" + (Number(payBps) / 100).toFixed(2) +
      "   ikinci " + (ikinciRevert ? "REDDEDILDI " + ad : "gecti"));
    ok(ikinciRevert === false, "tavanin altinda kalan ikinci cevirme gecti",
      "tavan her cevirmeyi engellemiyor");
  }

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => { console.error("HATA", e.message, e.data ? hataAdi(e.data) : ""); process.exit(1); });
