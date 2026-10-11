"use strict";
/* ===========================================================================
 * relayer.js — carries lock and burn notices between the two chains
 *
 *   node relayer/relayer.js                 # dry run: reports, sends nothing
 *   node relayer/relayer.js --uygula        # actually relays
 *   node relayer/relayer.js --bir-tur       # one pass instead of a loop
 *
 * WHAT IT DOES
 *   Robinhood Chain  StockVault.Locked   ->  Arc  WrappedStock.mint
 *   Arc              WrappedStock.Burned ->  Robinhood Chain  StockVault.release
 *
 * WHY THIS PROGRAM IS THE WEAK POINT, STATED PLAINLY
 *   Arc has no general message bridge — LayerZero and CCIP are both absent,
 *   checked on chain — so nothing on Arc can verify that stock was really
 *   locked. This process is the only thing standing between the two sides,
 *   and a dishonest or compromised copy of it could mint claims with nothing
 *   behind them.
 *
 *   Nothing in this file removes that. What it does is make the failure
 *   loud rather than quiet:
 *
 *   - every notice is keyed by the lock or burn id, and an id already used
 *     on the destination chain is refused BY THE CONTRACT, so a replay
 *     cannot be caused by a bug here
 *   - the relayer checks its own work: supply on Arc must equal shares in
 *     the vault, and it REFUSES TO MINT if they already disagree, rather
 *     than compounding a discrepancy it did not cause
 *   - progress is a file, so a crash resumes instead of re-sending
 *   - dry run is the default
 *
 *   scripts/denetim.js is the independent check anyone can run against the
 *   same two numbers. It does not trust this program and neither should you.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   It never chooses a recipient. The destination address travels inside the
 *   event, and the relayer passes it through unchanged. There is no code
 *   path here that can send somebody else's stock somewhere else.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, JsonRpcProvider, Contract, Interface, id: topicId } = require("ethers");

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const RHC_RPC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const ARC_CHAIN = 5042;
const RHC_CHAIN = 4663;

const UYGULA = process.argv.includes("--uygula");
const BIR_TUR = process.argv.includes("--bir-tur");
const ARALIK_MS = Number(process.env.RELAYER_INTERVAL_MS || 30000);
/* Arc rejects wide eth_getLogs ranges with a permanent error, so the window
 * is deliberately small; this was learned the hard way on the other project. */
const PENCERE = Number(process.env.RELAYER_WINDOW || 2000);

const DURUM = process.env.RELAYER_STATE || path.join(__dirname, "durum.json");
const AYAR = process.env.RELAYER_CONFIG || path.join(__dirname, "ayar.json");

const vaultAbi = new Interface([
  "event Locked(address indexed from, address indexed arcRecipient, uint256 amount, uint256 shares)",
  "event Released(bytes32 indexed burnId, address indexed to, uint256 shares, uint256 amount)",
  "function release(bytes32 burnId, address to, uint256 shares) returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function usedBurnId(bytes32) view returns (bool)"
]);
const wrappedAbi = new Interface([
  "event Burned(address indexed from, address indexed stockRecipient, uint256 shares, bytes32 burnId)",
  "event Minted(bytes32 indexed lockId, address indexed to, uint256 shares)",
  "function mint(bytes32 lockId, address to, uint256 shares)",
  "function totalSupply() view returns (uint256)",
  "function usedLockId(bytes32) view returns (bool)"
]);

const log = (...a) => console.log("[relayer " + new Date().toISOString().slice(11, 19) + "]", ...a);

function rpc(url, method, params) {
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
        try {
          const j = JSON.parse(b);
          if (j.error) {
            const e = new Error(j.error.message || "rpc");
            /* Arc's two error classes need opposite handling: a range that is
             * too wide will never succeed, a rate limit always will. */
            e.permanent = /too large|exceed|invalid block range/i.test(e.message);
            e.rateLimited = /rate limit|429|too many/i.test(e.message);
            return rej(e);
          }
          res(j.result);
        } catch (e) { rej(new Error("HTTP " + s.statusCode)); }
      });
    });
    r.on("error", rej);
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

async function rpcRetry(url, method, params) {
  let bekle = 1500;
  for (let i = 0; ; i++) {
    try { return await rpc(url, method, params); }
    catch (e) {
      if (e.permanent || i >= 6) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 20000);
    }
  }
}

function durumOku() {
  try { return JSON.parse(fs.readFileSync(DURUM, "utf8")); }
  catch (e) { return { rhcBlock: 0, arcBlock: 0, islenen: {} }; }
}
function durumYaz(d) {
  const tmp = DURUM + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(d, null, 1));
  fs.renameSync(tmp, DURUM);
}

function ayarOku() {
  try { return JSON.parse(fs.readFileSync(AYAR, "utf8")); }
  catch (e) {
    console.log("ayar dosyasi yok: " + AYAR);
    console.log("");
    console.log("ornek icerik:");
    console.log(JSON.stringify({
      vault: "0x... (Robinhood Chain StockVault)",
      wrapped: "0x... (Arc WrappedStock)",
      vaultStartBlock: 0,
      wrappedStartBlock: 0
    }, null, 1));
    process.exit(1);
  }
}

function ozelAnahtar() {
  if (process.env.RELAYER_PRIVATE_KEY) return process.env.RELAYER_PRIVATE_KEY.trim();
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const f of [path.join("C:", "bot", ".env"), path.join(__dirname, "..", ".env")]) {
    try {
      const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}

async function loglar(url, adres, konu, fromBlock, toBlock) {
  return rpcRetry(url, "eth_getLogs", [{
    address: adres, topics: [konu],
    fromBlock: "0x" + fromBlock.toString(16),
    toBlock: "0x" + toBlock.toString(16)
  }]);
}

/* The relayer refuses to act when the two sides already disagree. It cannot
 * tell whether a discrepancy came from an earlier bug, a different relayer
 * or an attack — and in every one of those cases minting more is wrong. */
async function dengeKontrol(ayar) {
  const pay = BigInt(await rpcRetry(RHC_RPC, "eth_call", [{
    to: ayar.vault, data: vaultAbi.encodeFunctionData("totalShares", [])
  }, "latest"]));
  const arz = BigInt(await rpcRetry(ARC_RPC, "eth_call", [{
    to: ayar.wrapped, data: wrappedAbi.encodeFunctionData("totalSupply", [])
  }, "latest"]));
  return { pay, arz, dengeli: pay === arz };
}

async function tur(ayar, cuzdanlar) {
  const d = durumOku();

  const rhcHead = parseInt(await rpcRetry(RHC_RPC, "eth_blockNumber", []), 16);
  const arcHead = parseInt(await rpcRetry(ARC_RPC, "eth_blockNumber", []), 16);

  const denge = await dengeKontrol(ayar);
  if (!denge.dengeli) {
    log("DURDU: iki taraf uyusmuyor. kasa paylari " + denge.pay + ", sarmal arz " + denge.arz);
    log("  scripts/denetim.js ile inceleyin; bu durumda yeni basim yapilmaz.");
    return;
  }

  /* ---- Robinhood Chain: Locked -> mint on Arc ------------------------- */
  let from = Math.max(d.rhcBlock || ayar.vaultStartBlock || 0, 0) + 1;
  let to = Math.min(from + PENCERE, rhcHead);
  if (to >= from) {
    const konu = topicId("Locked(address,address,uint256,uint256)");
    const ls = await loglar(RHC_RPC, ayar.vault, konu, from, to);
    for (const l of ls) {
      const ev = vaultAbi.parseLog({ topics: l.topics, data: l.data });
      const lockId = l.transactionHash + ":" + parseInt(l.logIndex, 16);
      const key = "mint:" + lockId;
      if (d.islenen[key]) continue;

      /* The contract keys mints by a bytes32 id; the transaction hash is a
       * natural one and is what the vault emitted the lock in. */
      const idBytes = l.transactionHash;
      const zatenVar = await rpcRetry(ARC_RPC, "eth_call", [{
        to: ayar.wrapped, data: wrappedAbi.encodeFunctionData("usedLockId", [idBytes])
      }, "latest"]);
      if (BigInt(zatenVar) !== 0n) { d.islenen[key] = "zaten"; continue; }

      log("KILIT -> BASIM  " + ev.args.shares.toString() + " pay -> " + ev.args.arcRecipient);
      if (!UYGULA) { d.islenen[key] = "kuru"; continue; }

      const w = new Contract(ayar.wrapped, wrappedAbi.fragments, cuzdanlar.arc);
      const tx = await w.mint(idBytes, ev.args.arcRecipient, ev.args.shares);
      const rc = await tx.wait();
      log("  basildi, blok " + rc.blockNumber);
      d.islenen[key] = tx.hash;
    }
    d.rhcBlock = to;
  }

  /* ---- Arc: Burned -> release on Robinhood Chain ---------------------- */
  from = Math.max(d.arcBlock || ayar.wrappedStartBlock || 0, 0) + 1;
  to = Math.min(from + PENCERE, arcHead);
  if (to >= from) {
    const konu = topicId("Burned(address,address,uint256,bytes32)");
    const ls = await loglar(ARC_RPC, ayar.wrapped, konu, from, to);
    for (const l of ls) {
      const ev = wrappedAbi.parseLog({ topics: l.topics, data: l.data });
      const key = "release:" + ev.args.burnId;
      if (d.islenen[key]) continue;

      const zatenVar = await rpcRetry(RHC_RPC, "eth_call", [{
        to: ayar.vault, data: vaultAbi.encodeFunctionData("usedBurnId", [ev.args.burnId])
      }, "latest"]);
      if (BigInt(zatenVar) !== 0n) { d.islenen[key] = "zaten"; continue; }

      log("YAKMA -> SERBEST  " + ev.args.shares.toString() + " pay -> " + ev.args.stockRecipient);
      if (!UYGULA) { d.islenen[key] = "kuru"; continue; }

      const v = new Contract(ayar.vault, vaultAbi.fragments, cuzdanlar.rhc);
      const tx = await v.release(ev.args.burnId, ev.args.stockRecipient, ev.args.shares);
      const rc = await tx.wait();
      log("  serbest birakildi, blok " + rc.blockNumber);
      d.islenen[key] = tx.hash;
    }
    d.arcBlock = to;
  }

  durumYaz(d);
}

(async function main() {
  const ayar = ayarOku();
  log("kip " + (UYGULA ? "UYGULA" : "KURU CALISMA"));
  log("kasa   (RHC) " + ayar.vault);
  log("sarmal (Arc) " + ayar.wrapped);

  let cuzdanlar = {};
  if (UYGULA) {
    const pk = ozelAnahtar();
    if (!pk) { log("RELAYER_PRIVATE_KEY bulunamadi."); process.exit(1); }
    cuzdanlar.arc = new Wallet(pk, new JsonRpcProvider(ARC_RPC, { chainId: ARC_CHAIN, name: "arc" }, { staticNetwork: true }));
    cuzdanlar.rhc = new Wallet(pk, new JsonRpcProvider(RHC_RPC, { chainId: RHC_CHAIN, name: "rhc" }, { staticNetwork: true }));
    log("relayer " + cuzdanlar.arc.address);
  }

  for (;;) {
    try { await tur(ayar, cuzdanlar); }
    catch (e) { log("tur hatasi: " + String(e && e.message).slice(0, 120)); }
    if (BIR_TUR) break;
    await new Promise((r) => setTimeout(r, ARALIK_MS));
  }
})().catch((e) => { console.log("HATA: " + (e && e.message)); process.exit(1); });
