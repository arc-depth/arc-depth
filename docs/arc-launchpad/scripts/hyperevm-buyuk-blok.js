"use strict";
/* ===========================================================================
 * hyperevm-buyuk-blok.js — let the deployer deploy large contracts on HyperEVM
 *
 *   node scripts/hyperevm-buyuk-blok.js            # reads state only
 *   node scripts/hyperevm-buyuk-blok.js --uygula
 *
 * HyperEVM alternates small blocks (2M gas, every second) and big blocks
 * (30M gas, every minute). Every contract in the network core is 1.3-4.1M
 * gas, so on small blocks they cannot land at all. An address is moved to big
 * blocks by the HyperCore action {"type":"evmUserModify","usingBigBlocks":true}
 * (Hyperliquid docs, "Dual-block architecture"), and "like any action, this
 * requires an existing Core user to send". An EOA becomes a Core user by
 * receiving a Core asset; sending native HYPE on HyperEVM to the system
 * address 0x2222…2222 credits it as spot HYPE on Core.
 *
 * Signing is Hyperliquid's L1-action scheme: connectionId = keccak256(
 * msgpack(action) || nonce as 8 bytes || 0x00), then EIP-712 over
 * Agent{source:"a", connectionId} in domain {name:"Exchange", version:"1",
 * chainId:1337, verifyingContract:0x0}.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, keccak256, concat, toBeHex, zeroPadValue, Signature } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = "https://rpc.hyperliquid.xyz/evm";
const API = "https://api.hyperliquid.xyz";
const SISTEM = "0x2222222222222222222222222222222222222222";
const UYGULA = process.argv.includes("--uygula");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const f of [path.join("C:", "bot", ".env"), path.join(KOK, ".env")]) {
    try { const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m); if (m) return m[1].trim(); } catch (e) { /* next */ }
  }
  return null;
}

/* msgpack for the one shape needed: a map of short strings to strings/bools,
   keys in insertion order (the order Hyperliquid's own SDK serialises). */
function msgpack(o) {
  const parca = [Uint8Array.from([0x80 | Object.keys(o).length])];
  const str = (s) => { const b = Buffer.from(s, "utf8"); if (b.length > 31) throw new Error("uzun"); return Buffer.concat([Buffer.from([0xa0 | b.length]), b]); };
  for (const [k, v] of Object.entries(o)) {
    parca.push(str(k));
    if (typeof v === "boolean") parca.push(Uint8Array.from([v ? 0xc3 : 0xc2]));
    else parca.push(str(v));
  }
  return Buffer.concat(parca.map((x) => Buffer.from(x)));
}

async function coreDurum(adres) {
  const r = await fetch(API + "/info", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "spotClearinghouseState", user: adres }) }).then((x) => x.json());
  return r;
}

(async () => {
  const w = new Wallet(ozelAnahtar(), new JsonRpcProvider(RPC, 999, { staticNetwork: true }));
  const evm = await w.provider.getBalance(w.address);
  let core = await coreDurum(w.address);
  const hype = (core.balances || []).find((b) => b.coin === "HYPE");
  console.log("HyperEVM " + (Number(evm) / 1e18).toFixed(6) + " HYPE   Core bakiyeleri: " + JSON.stringify(core.balances || []));

  if (!hype || Number(hype.total) === 0) {
    console.log("Core kullanicisi degil: 0.002 HYPE sistem adresine gonderilecek");
    if (UYGULA) {
      const t = await w.sendTransaction({ to: SISTEM, value: 2n * 10n ** 15n });
      await t.wait();
      console.log("  gonderildi " + t.hash);
      for (let i = 0; i < 40; i++) {
        await bekle(3000);
        core = await coreDurum(w.address);
        if ((core.balances || []).some((b) => b.coin === "HYPE" && Number(b.total) > 0)) break;
      }
      console.log("  Core: " + JSON.stringify(core.balances || []));
    }
  }

  const action = { type: "evmUserModify", usingBigBlocks: true };
  const nonce = Date.now();
  const connectionId = keccak256(concat([msgpack(action), zeroPadValue(toBeHex(nonce), 8), "0x00"]));
  const sig = await w.signTypedData(
    { name: "Exchange", version: "1", chainId: 1337, verifyingContract: "0x0000000000000000000000000000000000000000" },
    { Agent: [{ name: "source", type: "string" }, { name: "connectionId", type: "bytes32" }] },
    { source: "a", connectionId });
  const s = Signature.from(sig);
  const govde = { action, nonce, signature: { r: s.r, s: s.s, v: s.v }, vaultAddress: null };
  if (!UYGULA) { console.log("kuru: imza hazir, gonderilmedi"); return; }
  const r = await fetch(API + "/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
  console.log("evmUserModify: " + JSON.stringify(r));
  const d = await fetch(API + "/info", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "userRole", user: w.address }) }).then((x) => x.json()).catch(() => ({}));
  console.log("rol: " + JSON.stringify(d));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
