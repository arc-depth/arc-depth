"use strict";
/* ===========================================================================
 * dagit-yonetisim.js — the governance stack
 *
 *   node scripts/dagit-yonetisim.js                 # prices it, sends nothing
 *   node scripts/dagit-yonetisim.js --uygula
 *
 * Deploys, in this order and for these reasons:
 *
 *   GovToken   the whole supply, minted once, split 5 / 5 / 30 / 60
 *   Staking    holds the 60% and releases it over thirty years
 *   Vesting    holds the 5% and releases it over twelve months
 *   Governor   votes, with a timelock, and executes what passes
 *   DevPool    where the outside-developer fee slice lands
 *
 * WHY THIS IS A SEPARATE SCRIPT
 *   The launchpad needs the DevPool's address, because that is where the
 *   developer slice of every fee goes. Putting all eight contracts in one
 *   script would mean one failed transaction leaves a half-built system
 *   whose predicted addresses no longer line up. This half can be deployed
 *   once and then referred to: it writes dagitim-yonetisim.json, and
 *   dagit.js reads the DevPool address from it.
 *
 * THE CIRCULAR DEPENDENCIES, AND HOW THEY ARE BROKEN
 *   GovToken has to name the contracts that receive the vesting and
 *   emission slices, and both of those have to name the token. Nothing can
 *   go first in the obvious way.
 *
 *   Plain CREATE settles it: a contract deployed by an account lands at
 *   keccak(rlp(sender, nonce)), which depends on the sender and their
 *   transaction count and on nothing else — not on the code and not on the
 *   constructor arguments. So all five addresses are computed before
 *   anything is sent, and each contract is built around addresses that do
 *   not exist yet.
 *
 * THE GUARDIAN
 *   The Governor is deployed with a veto-only guardian, set to the
 *   deploying wallet for one year. It can cancel a proposal and it can do
 *   nothing else: it cannot propose, vote, execute or change a parameter.
 *   It exists because until the token is distributed, whoever stakes first
 *   holds nearly all the voting power, and 10% of a very small number is
 *   not a quorum in any meaningful sense. It can be given up early and
 *   irreversibly with renounce(), and it stops working on its expiry date
 *   whatever anyone does.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, getCreateAddress, keccak256 } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const UYGULA = process.argv.includes("--uygula");

const coder = AbiCoder.defaultAbiCoder();
const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));

const TOPLAM = 1_000_000_000n * 10n ** 18n;
const VEST = (TOPLAM * 500n) / 10000n;       // 5%
const EMISYON = (TOPLAM * 6000n) / 10000n;   // 60%
const NOBETCI_GUN = 365;
const OY_SURESI = 5 * 24 * 60 * 60;
const TIMELOCK = 2 * 24 * 60 * 60;
const MUHLET = 14 * 24 * 60 * 60;

function rpcHam(method, params) {
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
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

/* The endpoint throttles, and ethers has no retry — the same cause has
 * killed four scripts in this repo. Everything goes through here. */
async function rpc(method, params) {
  let bekle = 1500;
  for (let i = 0; ; i++) {
    try { return await rpcHam(method, params); }
    catch (e) {
      if (!/rate limit|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 20000);
    }
  }
}

async function gonder(cuzdan, tx, ad) {
  const imzali = await cuzdan.signTransaction(tx);
  let hash;
  try {
    hash = await rpc("eth_sendRawTransaction", [imzali]);
  } catch (e) {
    if (!/already known|nonce too low/i.test(String(e.message))) throw e;
    hash = keccak256(imzali);
    console.log("    (zaten dugumde)");
  }
  console.log("    " + ad + " -> " + hash);
  for (let i = 0; i < 80; i++) {
    let rc = null;
    try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
    if (rc) {
      if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz");
      console.log("    blok " + parseInt(rc.blockNumber, 16));
      return;
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
  console.log("ARC LAUNCHPAD — YONETISIM YIGINI");
  console.log("  rpc  " + RPC);
  console.log("  kip  " + (UYGULA ? "UYGULA (gercek islem)" : "KURU CALISMA"));
  console.log("");

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);
  const nonce = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
  const bakiye = BigInt(await rpc("eth_getBalance", [cuzdan.address, "latest"]));

  console.log("  cuzdan  " + cuzdan.address);
  console.log("  bakiye  " + (Number(bakiye) / 1e18).toFixed(6) + " USDC");
  console.log("  nonce   " + nonce);
  console.log("");

  const ad = (k) => getCreateAddress({ from: cuzdan.address, nonce: nonce + k });
  const A = { token: ad(0), staking: ad(1), vesting: ad(2), governor: ad(3), devPool: ad(4) };

  console.log("  adresler onceden hesaplandi:");
  for (const [k, v] of Object.entries(A)) console.log("    " + k.padEnd(9) + " " + v);
  console.log("");

  /* The free 5% and the 30% liquidity-and-stake seed go to the deploying
     wallet, which is where they have to start; the vesting 5% and the
     emission 60% go to contracts that release them on a schedule nobody
     can alter. */
  const planlar = [
    ["GovToken", B("GovToken").bytecode + coder.encode(
      ["address", "address", "address", "address"],
      [cuzdan.address, A.vesting, cuzdan.address, A.staking]).slice(2)],
    ["Staking", B("Staking").bytecode + coder.encode(
      ["address", "uint256", "uint256"], [A.token, EMISYON, 0]).slice(2)],
    ["Vesting", B("Vesting").bytecode + coder.encode(
      ["address", "address", "uint256", "uint256"],
      [A.token, cuzdan.address, VEST, Math.floor(Date.now() / 1000)]).slice(2)],
    ["Governor", B("Governor").bytecode + coder.encode(
      ["address", "address", "uint256", "uint256", "uint256", "uint256"],
      [A.staking, cuzdan.address, NOBETCI_GUN, OY_SURESI, TIMELOCK, MUHLET]).slice(2)],
    ["DevPool", B("DevPool").bytecode + coder.encode(["address"], [A.governor]).slice(2)]
  ];

  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const adresler = Object.values(A);
  const usd = (g) => (Number(g * gasPrice) / 1e18).toFixed(5);

  let toplam = 0n;
  const gasler = [];
  for (let i = 0; i < planlar.length; i++) {
    const kod = await rpc("eth_getCode", [adresler[i], "latest"]);
    const var_ = !!kod && kod !== "0x";
    let g = 0n;
    if (!var_) {
      try { g = BigInt(await rpc("eth_estimateGas", [{ from: cuzdan.address, data: planlar[i][1] }])); }
      catch (e) { g = 0n; }
    }
    gasler.push({ var: var_, gas: g });
    toplam += g;
    console.log("  " + planlar[i][0].padEnd(9) + " " +
      (var_ ? "zaten yerinde" : Number(g).toLocaleString("en-US").padStart(10) + " gas   " + usd(g) + " USDC"));
  }
  console.log("  " + "".padEnd(10) + "----------");
  console.log("  TOPLAM    " + Number(toplam).toLocaleString("en-US").padStart(10) + " gas   " + usd(toplam) + " USDC");
  console.log("");
  console.log("  dagilim   %5 serbest -> cuzdan");
  console.log("            %5 vesting -> Vesting (12 ay)");
  console.log("            %30 likidite+stake -> cuzdan");
  console.log("            %60 emisyon -> Staking (30 yil)");
  console.log("  nobetci   " + cuzdan.address + "   (yalnizca VETO, " + NOBETCI_GUN + " gun, devredilebilir)");
  console.log("  oylama    " + (OY_SURESI / 86400) + " gun oy + " + (TIMELOCK / 86400) +
    " gun timelock + " + (MUHLET / 86400) + " gun muhlet");
  console.log("");

  if (!UYGULA) {
    console.log("  kuru calisma: hicbir sey gonderilmedi.");
    console.log("  dagitmak icin: node scripts/dagit-yonetisim.js --uygula");
    return;
  }

  for (let i = 0; i < planlar.length; i++) {
    const [isim, data] = planlar[i];
    if (gasler[i].var) { console.log("  " + isim + " yerinde, atlandi"); continue; }
    if (gasler[i].gas === 0n) { console.log("  " + isim + " gas tahmini alinamadi — durduruldu"); process.exit(1); }
    console.log("  " + isim + " gonderiliyor...");
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce: nonce + i, data,
      gasLimit: (gasler[i].gas * 13n) / 10n, gasPrice, value: 0n
    }, isim);
    const kod = await rpc("eth_getCode", [adresler[i], "latest"]);
    if (!kod || kod === "0x") { console.log("    ADRESTE KOD YOK — durduruldu"); process.exit(1); }
    console.log("    " + adresler[i] + "   " + ((kod.length - 2) / 2).toLocaleString("en-US") + " bayt");
  }

  const cikti = {
    zincir: "arc", chainId: CHAIN_ID,
    govToken: A.token, staking: A.staking, vesting: A.vesting,
    governor: A.governor, devPool: A.devPool,
    guardian: cuzdan.address, guardianDays: NOBETCI_GUN,
    votingPeriod: OY_SURESI, timelock: TIMELOCK, gracePeriod: MUHLET,
    zaman: new Date().toISOString()
  };
  fs.writeFileSync(path.join(__dirname, "..", "dagitim-yonetisim.json"), JSON.stringify(cikti, null, 1));
  console.log("");
  console.log("  dagitim-yonetisim.json yazildi");
  console.log("  TAMAM — dagit.js artik gelistirici payini DevPool'a yonlendirecek");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
