"use strict";
/* ===========================================================================
 * dagit-sarmal.js — deploy WrappedStock on Arc, resiliently
 *
 *   node scripts/dagit-sarmal.js --kasa 0x... [--uygula]
 *
 * WHY A SEPARATE SCRIPT
 *   The combined bridge script failed twice on the Arc leg, both times
 *   inside eth_sendRawTransaction with a rate limit. The retry logic in that
 *   script wraps its own RPC helper, but the actual send went through
 *   ethers' provider, which has none — so the one call that must not be lost
 *   was the one call with no protection.
 *
 *   This signs locally and submits the raw transaction through the same
 *   retrying client used everywhere else, then polls for the receipt the
 *   same way. Nothing about the transaction changes; only who is allowed to
 *   give up on it.
 *
 *   It also refuses to send twice: the address a CREATE lands on is fixed by
 *   sender and nonce, so it checks that address first and reports success
 *   instead of paying again if a previous attempt actually landed.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, getCreateAddress, Transaction } = require("ethers");

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const RHC_RPC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = 5042;

const arg = process.argv.slice(2);
const val = (f, d) => { const i = arg.indexOf(f); return i >= 0 ? arg[i + 1] : d; };
const UYGULA = arg.includes("--uygula");
const KASA = val("--kasa", "");
const AD = val("--ad", "Wrapped AAPL");
const SEMBOL = val("--sembol", "wAAPL");
const STOCK = val("--stock", "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9");

const coder = AbiCoder.defaultAbiCoder();
const W = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "WrappedStock.json"), "utf8"));

function ham(url, method, params) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(new Error("HTTP " + s.statusCode)); }
      });
    });
    r.on("error", rej);
    r.setTimeout(40000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

async function rpc(url, method, params, tries) {
  let bekle = 2000;
  const max = tries || 10;
  for (let i = 0; ; i++) {
    try { return await ham(url, method, params); }
    catch (e) {
      const gecici = /rate limit|429|503|timeout|ECONN/i.test(String(e.message));
      if (!gecici || i >= max) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 25000);
    }
  }
}

function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const f of [path.join("C:", "bot", ".env"), path.join(__dirname, "..", ".env")]) {
    try {
      const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}

(async function main() {
  if (!KASA) { console.log("kullanim: node scripts/dagit-sarmal.js --kasa 0x... [--uygula]"); process.exit(1); }

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);

  const nonce = Number(await rpc(ARC_RPC, "eth_getTransactionCount", [cuzdan.address, "latest"]));
  const beklenen = getCreateAddress({ from: cuzdan.address, nonce });

  console.log("SARMAL DAGITIMI (Arc)");
  console.log("  cuzdan   " + cuzdan.address);
  console.log("  nonce    " + nonce);
  console.log("  adres    " + beklenen + "   (bu nonce ile olusacak)");
  console.log("  kasa     " + KASA + "   (Robinhood Chain)");
  console.log("");

  const mevcut = await rpc(ARC_RPC, "eth_getCode", [beklenen, "latest"]);
  if (mevcut && mevcut !== "0x") {
    console.log("  bu adreste zaten kod var — onceki deneme tutmus.");
    yaz(KASA, beklenen);
    return;
  }

  const args = coder.encode(["string", "string", "address"], [AD, SEMBOL, cuzdan.address]).slice(2);
  const data = W.bytecode + args;

  const gas = BigInt(await rpc(ARC_RPC, "eth_estimateGas", [{ from: cuzdan.address, data }]));
  const gasPrice = BigInt(await rpc(ARC_RPC, "eth_gasPrice", []));
  console.log("  gas      " + Number(gas).toLocaleString("en-US") + "   " +
    (Number(gas * gasPrice) / 1e18).toFixed(5) + " USDC");

  if (!UYGULA) { console.log("\n  kuru calisma. gondermek icin --uygula"); return; }

  const tx = Transaction.from({
    type: 2, chainId: CHAIN_ID, nonce, data,
    gasLimit: (gas * 13n) / 10n,
    maxFeePerGas: gasPrice * 2n,
    maxPriorityFeePerGas: gasPrice / 10n
  });
  const imzali = await cuzdan.signTransaction(tx);

  console.log("  gonderiliyor...");
  let hash;
  try {
    hash = await rpc(ARC_RPC, "eth_sendRawTransaction", [imzali], 12);
  } catch (e) {
    /* "already known" means it reached the mempool on an earlier attempt;
     * that is a success report wearing an error's clothes. */
    if (/already known|known transaction|nonce too low/i.test(String(e.message))) {
      console.log("  (islem zaten gonderilmis: " + String(e.message).slice(0, 50) + ")");
      hash = Transaction.from(imzali).hash;
    } else throw e;
  }
  console.log("  tx " + hash);

  for (let i = 0; i < 40; i++) {
    const rc = await rpc(ARC_RPC, "eth_getTransactionReceipt", [hash]).catch(() => null);
    if (rc) {
      console.log("  blok " + parseInt(rc.blockNumber, 16) + "   durum " + (rc.status === "0x1" ? "BASARILI" : "BASARISIZ"));
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  const kod = await rpc(ARC_RPC, "eth_getCode", [beklenen, "latest"]);
  if (!kod || kod === "0x") { console.log("  ADRESTE KOD YOK — dagitim tutmadi."); process.exit(1); }
  console.log("  kod dogrulandi: " + ((kod.length - 2) / 2).toLocaleString("en-US") + " bayt");
  yaz(KASA, beklenen);
})().catch((e) => { console.log("\nHATA: " + (e && e.message).slice(0, 200)); process.exit(1); });

async function yaz(kasa, sarmal) {
  const arcHead = parseInt(await rpc(ARC_RPC, "eth_blockNumber", []), 16);
  const rhcHead = parseInt(await rpc(RHC_RPC, "eth_blockNumber", []), 16);
  const ayar = {
    vault: kasa, wrapped: sarmal, stock: STOCK,
    relayer: new Wallet(ozelAnahtar()).address,
    vaultStartBlock: rhcHead, wrappedStartBlock: arcHead,
    zaman: new Date().toISOString()
  };
  fs.mkdirSync(path.join(__dirname, "..", "relayer"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "relayer", "ayar.json"), JSON.stringify(ayar, null, 1));
  console.log("");
  console.log("  relayer/ayar.json yazildi");
  console.log("  denetim: node scripts/denetim.js " + kasa + " " + sarmal);
}
