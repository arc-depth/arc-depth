"use strict";
/* ===========================================================================
 * dene-kayma.js — buy on the main curve and measure what the slippage
 *                 actually was, against what was quoted.
 *
 *   node scripts/dene-kayma.js --tutar 1
 *   node scripts/dene-kayma.js --tutar 1 --uygula
 *
 * The claim was that the curve's phantom reserve keeps slippage near zero
 * without anybody funding it. A quote is not proof of that — a quote is
 * the same contract doing the same arithmetic. What settles it is paying
 * real money, reading the balance that arrives, and dividing.
 *
 * The same trade in the $6 pool is priced alongside, from the pool's own
 * reserves, so the comparison is between two measured numbers rather than
 * between a measurement and a claim.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, id, keccak256 } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const UYGULA = process.argv.includes("--uygula");
const val = (ad, d) => { const i = process.argv.indexOf(ad); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TUTAR = Number(val("--tutar", "1"));

const coder = AbiCoder.defaultAbiCoder();
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-depth.json"), "utf8"));
const H = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-havuz.json"), "utf8"));
const sel = (s) => id(s).slice(0, 10);

function hamIstek(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
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
    r.setTimeout(40000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await hamIstek(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}
function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const p of [path.join("C:", "bot", ".env"), path.join(__dirname, "..", ".env")]) {
    try {
      const m = fs.readFileSync(p, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });

(async function main() {
  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);
  const BEN = cuzdan.address;
  const oku = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
  const bal = async (t, w) => BigInt(await oku(t,
    sel("balanceOf(address)") + coder.encode(["address"], [w]).slice(2)));

  const giris = BigInt(Math.round(TUTAR * 1e6));

  /* ---- before ---------------------------------------------------- */
  const x0 = BigInt(await oku(D.egri, sel("x()")));
  const y0 = BigInt(await oku(D.egri, sel("y()")));
  const ucretPpm = BigInt(await oku(D.egri, sel("UCRET_PPM()")));
  const anlik = (Number(x0) / 1e6) / (Number(y0) / 1e18);
  const net = giris - (giris * ucretPpm) / 1_000_000n;
  const kota = BigInt(await oku(D.egri,
    sel("alimKotasi(uint256)") + coder.encode(["uint256"], [net]).slice(2)));
  const tok0 = await bal(D.token, BEN);

  /* The same trade in the pool, from its reserves. */
  const U = Number(BigInt(H.esik)) / 1e6;
  const T = Number(BigInt(H.havuzToken)) / 1e18;
  const havuzAlinan = (T * TUTAR) / (U + TUTAR);
  const havuzOrt = TUTAR / havuzAlinan;
  const havuzFiyat = U / T;

  console.log("KAYMA TESTI — ana egride " + nf(TUTAR, 2) + " dolar");
  console.log("");
  console.log("  ONCE");
  console.log("    egrinin boleni (x)   $" + nf(Number(x0) / 1e6, 2));
  console.log("    anlik fiyat          $" + anlik.toExponential(4));
  console.log("    ucret %" + (Number(ucretPpm) / 10000).toFixed(2) +
    " dusulunce egriye giren  $" + nf(Number(net) / 1e6, 6));
  console.log("    kota                 " + nf(Number(kota) / 1e18) + " DEPTH");
  console.log("");

  if (!UYGULA) {
    console.log("  kuru calisma. --uygula ekle");
    return;
  }

  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  let nonce = Number(await rpc("eth_getTransactionCount", [BEN, "latest"]));
  const g = BigInt(await rpc("eth_estimateGas",
    [{ from: BEN, to: D.egri, data: sel("al(uint256,uint256)") +
       coder.encode(["uint256", "uint256"], [giris, 0]).slice(2) }]));
  const imzali = await cuzdan.signTransaction({
    chainId: CHAIN_ID, nonce, to: D.egri,
    data: sel("al(uint256,uint256)") + coder.encode(["uint256", "uint256"], [giris, 0]).slice(2),
    gasLimit: (g * 13n) / 10n, gasPrice, value: 0n
  });
  let hash;
  try { hash = await rpc("eth_sendRawTransaction", [imzali]); }
  catch (e) {
    if (!/already known|nonce too low/i.test(String(e.message))) throw e;
    hash = keccak256(imzali);
  }
  console.log("  alim -> " + hash);
  for (let i = 0; i < 90; i++) {
    let rc = null;
    try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* poll */ }
    if (rc) {
      if (rc.status !== "0x1") throw new Error("zincirde basarisiz: " + hash);
      console.log("    blok " + parseInt(rc.blockNumber, 16) + ", gaz " + nf(parseInt(rc.gasUsed, 16)));
      break;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  /* ---- after ----------------------------------------------------- */
  const tok1 = await bal(D.token, BEN);
  const x1 = BigInt(await oku(D.egri, sel("x()")));
  const y1 = BigInt(await oku(D.egri, sel("y()")));
  const alinan = Number(tok1 - tok0) / 1e18;
  const sonrakiFiyat = (Number(x1) / 1e6) / (Number(y1) / 1e18);

  /* What was actually paid per token, including the 1% fee — which is what
     the buyer experiences, so it is what gets reported. */
  const ortalama = TUTAR / alinan;
  const kaymaUcretli = (ortalama / anlik - 1) * 100;
  /* And the curve's own slippage, with the fee taken out, so the two
     effects are not confused with each other. */
  const netOrt = (Number(net) / 1e6) / alinan;
  const kaymaSaf = (netOrt / anlik - 1) * 100;

  console.log("");
  console.log("  SONUC — zincirden, odenen gercek para");
  console.log("    odenen               $" + nf(TUTAR, 6));
  console.log("    GELEN DEPTH          " + nf(alinan));
  console.log("    kota                 " + nf(Number(kota) / 1e18) +
    (Math.abs(alinan - Number(kota) / 1e18) < 1 ? "   kota TUTTU" : "   KOTADAN SAPTI"));
  console.log("");
  console.log("    anlik fiyat (once)   $" + anlik.toExponential(4));
  console.log("    odenen ortalama      $" + ortalama.toExponential(4));
  console.log("    fiyat (sonra)        $" + sonrakiFiyat.toExponential(4));
  console.log("");
  console.log("    KAYMA (ucret haric)  %" + kaymaSaf.toFixed(4) + "   <- egrinin kendisi");
  console.log("    ucret                %" + (Number(ucretPpm) / 10000).toFixed(2) +
    "   (%0,30 kurucu, %0,30 stake, %0,40 havuz)");
  console.log("    toplam maliyet       %" + kaymaUcretli.toFixed(4) + "   <- alicinin gordugu");
  console.log("");
  console.log("  AYNI " + nf(TUTAR, 2) + " DOLAR $" + nf(U, 2) + "'LIK HAVUZDA OLSAYDI");
  console.log("    gelen DEPTH          " + nf(havuzAlinan));
  console.log("    odenen ortalama      $" + havuzOrt.toExponential(4));
  console.log("    kayma                %" + nf((havuzOrt / havuzFiyat - 1) * 100, 1));
  console.log("");
  console.log("    egri " + nf(alinan / havuzAlinan, 2) + " kat daha fazla token veriyor.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
