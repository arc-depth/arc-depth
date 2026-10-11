"use strict";
/* Deploy TestCollateral on Arc, with the resilient submission path.
 *
 * Same shape as dagit-sarmal.js and for the same reason: the send is the
 * one call that must not be lost, so it goes through the retrying client
 * and the CREATE address is checked first so a landed attempt is never
 * paid for twice.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, getCreateAddress, Transaction } = require("ethers");

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const UYGULA = process.argv.includes("--uygula");

const A = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestCollateral.json"), "utf8"));

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(ARC_RPC);
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

async function rpc(method, params, tries) {
  let bekle = 2000;
  for (let i = 0; ; i++) {
    try { return await ham(method, params); }
    catch (e) {
      if (!/rate limit|429|503|timeout|ECONN/i.test(String(e.message)) || i >= (tries || 10)) throw e;
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
  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);

  const nonce = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
  const beklenen = getCreateAddress({ from: cuzdan.address, nonce });

  console.log("TEST TEMINATI DAGITIMI (Arc)");
  console.log("  cuzdan " + cuzdan.address);
  console.log("  nonce  " + nonce);
  console.log("  adres  " + beklenen);

  const mevcut = await rpc("eth_getCode", [beklenen, "latest"]);
  if (mevcut && mevcut !== "0x") { console.log("  zaten dagitilmis."); return; }

  const gas = BigInt(await rpc("eth_estimateGas", [{ from: cuzdan.address, data: A.bytecode }]));
  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  console.log("  gas    " + Number(gas).toLocaleString("en-US") + "   " +
    (Number(gas * gasPrice) / 1e18).toFixed(5) + " USDC");

  if (!UYGULA) { console.log("\n  kuru calisma. --uygula ile gonderilir"); return; }

  const tx = Transaction.from({
    type: 2, chainId: CHAIN_ID, nonce, data: A.bytecode,
    gasLimit: (gas * 13n) / 10n,
    maxFeePerGas: gasPrice * 2n,
    maxPriorityFeePerGas: gasPrice / 10n
  });
  const imzali = await cuzdan.signTransaction(tx);

  console.log("  gonderiliyor...");
  let hash;
  try { hash = await rpc("eth_sendRawTransaction", [imzali], 12); }
  catch (e) {
    if (/already known|nonce too low/i.test(String(e.message))) hash = Transaction.from(imzali).hash;
    else throw e;
  }
  console.log("  tx " + hash);

  for (let i = 0; i < 40; i++) {
    const rc = await rpc("eth_getTransactionReceipt", [hash]).catch(() => null);
    if (rc) { console.log("  blok " + parseInt(rc.blockNumber, 16) + "   " + (rc.status === "0x1" ? "BASARILI" : "BASARISIZ")); break; }
    await new Promise((r) => setTimeout(r, 3000));
  }

  const kod = await rpc("eth_getCode", [beklenen, "latest"]);
  if (!kod || kod === "0x") { console.log("  KOD YOK"); process.exit(1); }
  console.log("  kod dogrulandi: " + ((kod.length - 2) / 2).toLocaleString("en-US") + " bayt");
  console.log("");
  console.log("  TEST TEMINATI: " + beklenen);
})().catch((e) => { console.log("\nHATA: " + String(e && e.message).slice(0, 160)); process.exit(1); });
