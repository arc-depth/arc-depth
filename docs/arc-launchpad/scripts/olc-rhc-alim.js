"use strict";
/* ===========================================================================
 * olc-rhc-alim.js — can we actually buy the share, and in which pool?
 *
 *   node scripts/olc-rhc-alim.js
 *   HISSE=0xaf3d... TUTAR=0.0005 node scripts/olc-rhc-alim.js
 *
 * Simulates the buy leg against the real Robinhood Chain PoolManager
 * through eth_call with a state override, so the router runs for real and
 * nothing is sent and no gas is paid.
 *
 * WHY SIMULATE RATHER THAN READ PRICES
 *   A stock token has dozens of ETH pools and most of them are nearly
 *   empty or carry a hook that may refuse us. Reading a pool's declared
 *   price says nothing about what a hundred-dollar order would actually
 *   fill at. Running the swap does, and running it through OUR router
 *   answers the only question that matters: will the contract we deployed
 *   get the tokens out.
 *
 * Every pool the scan recorded is tried and the results are ranked by what
 * came back. The winner is the pool the operator should use.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface, formatUnits, parseUnits } = require("ethers");

const RHC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const ETH = "0x0000000000000000000000000000000000000000";
const AAPL = "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9";

const HISSE = (process.env.HISSE || AAPL).toLowerCase();
const TUTAR = process.env.TUTAR || "0.0005"; // in ether

/* Where the router is placed for the simulation. Any address with no code
 * will do; this one is obviously not a real deployment. */
const ROUTER = "0x00000000000000000000000000000000000000C1";
const CAGIRAN = "0x0000000000000000000000000000000000001234";

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RHC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(e); }
      });
    });
    r.on("error", rej);
    r.setTimeout(45000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

async function rpc(method, params) {
  let bekle = 2000;
  for (let i = 0; ; i++) {
    try { return await ham(method, params); }
    catch (e) {
      const t = String(e.message);
      if (!/rate limit|too many requests|429|503|timeout/i.test(t) || i >= 6) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 20000);
    }
  }
}

const R = new Interface([
  "function al(address,address,uint24,int24,uint256) payable returns (uint256 cikti,uint256 bakiye,uint256 kalanEth)"
]);
const E = new Interface([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
]);

(async function main() {
  /* The harness builds the router with `new`, which is the only way its
   * immutable poolManager gets set. */
  const SR = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestRhcAlim.json"), "utf8"));

  let sembol = "?", ondalik = 18;
  try {
    const r = await rpc("eth_call", [{ to: HISSE, data: E.encodeFunctionData("symbol") }, "latest"]);
    sembol = E.decodeFunctionResult("symbol", r)[0];
  } catch (e) { /* keep the placeholder */ }

  console.log("ALIM BACAGI — GERCEK Robinhood Chain havuzlari");
  console.log("  hisse   " + sembol + "  " + HISSE);
  console.log("  tutar   " + TUTAR + " ETH");
  console.log("  kosum   " + ROUTER + "  (router cagri icinde kuruluyor, gercek havuzlar)");
  console.log("");

  /* Pool keys seen on chain for this token. Read from the scan when it is
   * there, and otherwise the ones measured for AAPL — stated rather than
   * guessed, so a wrong list is visible instead of silent. */
  let anahtarlar = [];
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "rhc-hisseler.json"), "utf8"));
    const h = (j.hisseler || []).find((x) => x.adres.toLowerCase() === HISSE);
    if (h && h.hooksuzAnahtarlar) anahtarlar = h.hooksuzAnahtarlar.map((k) => ({ fee: k.fee, spacing: k.spacing }));
  } catch (e) { /* fall through */ }

  if (!anahtarlar.length) {
    console.log("  (rhc-hisseler.json'da anahtar yok; AAPL icin olculen hooksuz havuzlar deneniyor)");
    anahtarlar = [
      { fee: 800, spacing: 8 }, { fee: 1500, spacing: 15 }, { fee: 2000, spacing: 20 },
      { fee: 2500, spacing: 25 }, { fee: 8000, spacing: 80 }, { fee: 9000, spacing: 90 },
      { fee: 10000, spacing: 200 }, { fee: 30000, spacing: 600 }, { fee: 50000, spacing: 1000 },
      { fee: 50000, spacing: 200 }, { fee: 100000, spacing: 200 }, { fee: 4321, spacing: 60 }
    ];
  }

  const miktar = parseUnits(TUTAR, 18);
  const deger = "0x" + miktar.toString(16);

  const sonuc = [];
  for (const k of anahtarlar) {
    /* Native ETH sorts below every stock token, so it is currency0 and the
     * swap is zeroForOne. */
    const data = R.encodeFunctionData("al", [PM, HISSE, k.fee, k.spacing, miktar]);
    try {
      const r = await rpc("eth_call", [
        { from: CAGIRAN, to: ROUTER, data, gas: "0x3000000", value: deger },
        "latest",
        {
          [ROUTER]: { code: SR.deployedBytecode },
          [CAGIRAN]: { balance: "0x" + (miktar * 10n).toString(16) }
        }
      ]);
      const [out] = R.decodeFunctionResult("al", r);
      sonuc.push({ ...k, out });
      console.log("  fee " + String(k.fee).padStart(7) + "  spacing " + String(k.spacing).padStart(5) +
        "   -> " + Number(formatUnits(out, 18)).toFixed(8) + " " + sembol);
    } catch (e) {
      const m = String(e.message).slice(0, 58);
      console.log("  fee " + String(k.fee).padStart(7) + "  spacing " + String(k.spacing).padStart(5) +
        "   -> " + m);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  sonuc.sort((a, b) => (b.out > a.out ? 1 : -1));
  console.log("");
  if (!sonuc.length) {
    console.log("  HICBIR HAVUZ DOLDURMADI — alim bacagi bu hisse icin calismiyor");
    process.exit(1);
  }
  const en = sonuc[0];
  const adet = Number(formatUnits(en.out, 18));
  console.log("  EN IYI: fee " + en.fee + ", tickSpacing " + en.spacing + ", hooks yok");
  console.log("  " + TUTAR + " ETH -> " + adet.toFixed(8) + " " + sembol);
  console.log("  ima edilen fiyat: " + (Number(TUTAR) / adet).toFixed(8) + " ETH / " + sembol);

  fs.writeFileSync(path.join(__dirname, "..", "rhc-alim.json"), JSON.stringify({
    zaman: new Date().toISOString(), hisse: HISSE, sembol,
    tutarEth: TUTAR, enIyi: { fee: en.fee, spacing: en.spacing, hooks: ETH, cikti: en.out.toString() },
    hepsi: sonuc.map((x) => ({ fee: x.fee, spacing: x.spacing, cikti: x.out.toString() }))
  }, null, 1));
  console.log("  rhc-alim.json yazildi");
})().catch((e) => { console.log("\nHATA: " + e.message); process.exit(1); });
