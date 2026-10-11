"use strict";
/* ===========================================================================
 * dagit-yonetisim-yenile.js — replace the Governor, and what is bound to it.
 *
 *   node scripts/dagit-yonetisim-yenile.js
 *   node scripts/dagit-yonetisim-yenile.js --uygula
 *
 * WHY ONLY THESE THREE
 *   The Governor gained `tazele`, which cuts a vote down to the stake still
 *   behind it. That had to be a new deployment, and a new Governor drags two
 *   contracts with it: DevPool and Hazine both hold `governor` as an
 *   immutable, which is the property that makes them worth trusting and also
 *   the reason they cannot be repointed.
 *
 *   Both are empty, so replacing them costs gas and nothing else.
 *
 * WHAT IS DELIBERATELY NOT REPLACED
 *   GovToken, Staking and Vesting stay. Staking holds the whole 600,000,000
 *   emission and has no way to move it out — that is the point of it — so
 *   redeploying would abandon 60% of the supply. Vesting is the same story
 *   with the 5%. The token itself has no mint and cannot be reissued.
 *
 *   This is also why the vote-renting fix had to live in the Governor: the
 *   clean repair is a balance checkpoint inside Staking, and Staking is the
 *   one contract here that can never be replaced.
 *
 * AFTER THIS
 *   dagit.js has to run too. The hook carries the developer pool and the
 *   treasury as immutables, so until it is redeployed the trading fee keeps
 *   going to the previous pair — which the previous Governor can still open,
 *   so nothing is stranded, but there would be two generations collecting.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, getCreateAddress, keccak256 } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const USDC = "0x3600000000000000000000000000000000000000";
const UYGULA = process.argv.includes("--uygula");

const coder = AbiCoder.defaultAbiCoder();
const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));

function ham(method, params) {
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
  let bekle = 1500;
  for (let i = 0; ; i++) {
    try { return await ham(m, p); }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 25000);
    }
  }
}
async function gonder(cuzdan, tx, ad) {
  const imzali = await cuzdan.signTransaction(tx);
  let hash;
  try { hash = await rpc("eth_sendRawTransaction", [imzali]); }
  catch (e) {
    if (!/already known|nonce too low/i.test(String(e.message))) throw e;
    hash = keccak256(imzali);
  }
  console.log("    " + ad + " -> " + hash);
  for (let i = 0; i < 80; i++) {
    let rc = null;
    try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
    if (rc) {
      if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz: " + hash);
      console.log("    blok " + parseInt(rc.blockNumber, 16));
      return hash;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("makbuz gelmedi: " + hash);
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

(async function main() {
  const GY = path.join(__dirname, "..", "dagitim-yonetisim.json");
  const DY = path.join(__dirname, "..", "dagitim.json");
  const G = JSON.parse(fs.readFileSync(GY, "utf8"));
  const D = JSON.parse(fs.readFileSync(DY, "utf8"));
  const ROUTER = D.router || "0x7550058C3F4D8839eBc8AcCB96959Fe69C109581";

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);
  const nonce = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));

  /* The Governor comes first because the other two are built around it. */
  const govAdres = getCreateAddress({ from: cuzdan.address, nonce });
  const govInit = B("Governor").bytecode + coder.encode(
    ["address", "address", "uint256", "uint256", "uint256", "uint256"],
    [G.staking, G.guardian, G.guardianDays, G.votingPeriod, G.timelock, G.gracePeriod]
  ).slice(2);

  const devAdres = getCreateAddress({ from: cuzdan.address, nonce: nonce + 1 });
  const devInit = B("DevPool").bytecode + coder.encode(["address"], [govAdres]).slice(2);

  const hazAdres = getCreateAddress({ from: cuzdan.address, nonce: nonce + 2 });
  const hazInit = B("Hazine").bytecode + coder.encode(
    ["address", "address", "address"], [govAdres, USDC, ROUTER]).slice(2);

  console.log("YONETISIM YENILEME");
  console.log("  degismeyen:");
  console.log("    ALP        " + G.govToken + "   (mint yok, yeniden basilamaz)");
  console.log("    Staking    " + G.staking + "   (600.000.000 emisyon, cikisi yok)");
  console.log("    Vesting    " + G.vesting);
  console.log("  yenilenen:");
  console.log("    Governor   " + G.governor + "  ->  " + govAdres);
  console.log("    DevPool    " + G.devPool + "  ->  " + devAdres);
  console.log("    Hazine     " + (D.hazine || "-") + "  ->  " + hazAdres);
  console.log("");
  console.log("  oylama " + (G.votingPeriod / 86400) + " gun, timelock " + (G.timelock / 86400) +
    " gun, muhlet " + (G.gracePeriod / 86400) + " gun");
  console.log("");

  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const tahmin = async (data) => {
    try { return BigInt(await rpc("eth_estimateGas", [{ from: cuzdan.address, data }])); }
    catch (e) { return 0n; }
  };
  const g1 = await tahmin(govInit), g2 = await tahmin(devInit), g3 = await tahmin(hazInit);
  const usd = (g) => (Number(g * gasPrice) / 1e18).toFixed(5);
  console.log("  Governor  " + Number(g1).toLocaleString("en-US").padStart(9) + " gas   " + usd(g1) + " USDC");
  console.log("  DevPool   " + Number(g2).toLocaleString("en-US").padStart(9) + " gas   " + usd(g2) + " USDC");
  console.log("  Hazine    " + Number(g3).toLocaleString("en-US").padStart(9) + " gas   " + usd(g3) + " USDC");
  console.log("");

  if (!UYGULA) {
    console.log("  kuru calisma: hicbir sey gonderilmedi.");
    console.log("  dagitmak icin --uygula ekle");
    console.log("  sonra: node scripts/dagit.js --uygula   (hook ve launchpad yeni adresleri alsin)");
    return;
  }

  const kodVar = async (a) => { const k = await rpc("eth_getCode", [a, "latest"]); return !!k && k !== "0x"; };

  for (const [ad, adres, init, g, n] of [
    ["Governor", govAdres, govInit, g1, nonce],
    ["DevPool", devAdres, devInit, g2, nonce + 1],
    ["Hazine", hazAdres, hazInit, g3, nonce + 2]
  ]) {
    if (await kodVar(adres)) { console.log("  " + ad + " yerinde, atlandi"); continue; }
    console.log("  " + ad + " gonderiliyor...");
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce: n, data: init,
      gasLimit: g > 0n ? (g * 13n) / 10n : 2500000n, gasPrice, value: 0n
    }, ad);
    if (!(await kodVar(adres))) { console.log("    ADRESTE KOD YOK"); process.exit(1); }
  }

  G.oncekiGovernor = G.governor;
  G.oncekiDevPool = G.devPool;
  G.governor = govAdres;
  G.devPool = devAdres;
  G.zaman = new Date().toISOString();
  fs.writeFileSync(GY, JSON.stringify(G, null, 1));

  /* The treasury is bound to the Governor too, so dagit.js must not reuse
     the old one — clearing it is what tells it to build a fresh one. */
  D.oncekiHazine = D.hazine;
  D.hazine = hazAdres;
  D.devSink = devAdres;
  fs.writeFileSync(DY, JSON.stringify(D, null, 1));

  console.log("");
  console.log("  dagitim-yonetisim.json ve dagitim.json guncellendi");
  console.log("  SIRADA: node scripts/dagit.js --uygula");
  console.log("          hook ve launchpad yeni DevPool/Hazine'yi tasiyacak;");
  console.log("          onlar degismeden ucret eski cifte gitmeye devam eder.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
