"use strict";
/* ===========================================================================
 * dagit-router-ag.js — the audited SwapRouter (contracts/SwapRouter.sol,
 *                      unchanged) on every chain with a local-collateral
 *                      launchpad, so the app can trade a launch's v4 pool
 *
 *   node scripts/dagit-router-ag.js [zincir,...] [--uygula]
 *
 * Ownerless, holds nothing, minimum enforced (fork test
 * nesil2-test/test/NesilRouter.t.sol on the deployed launchpads). The
 * constructor takes the chain's PoolManager from dagitim-nesil3.json.
 * Record: dagitim-nesil3.json, key "SwapRouter" per chain. Idempotent.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, ContractFactory } = require("ethers");
const { EVM } = require("./zincirler");

const KAYIT = path.join(__dirname, "..", "dagitim-nesil3.json");
const UYGULA = process.argv.includes("--uygula");
const SECIM = (process.argv.slice(2).find((a) => !a.startsWith("--")) || "").split(",").filter(Boolean);
const A = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "SwapRouter.json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const k = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  for (const ad of (SECIM.length ? SECIM : Object.keys(k).filter((x) => k[x].PulseLaunchpad3 && x !== "robinhoodUsdc"))) {
    const z = EVM[ad], r = k[ad];
    const w = new Wallet(pk, new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true }));
    if (r.SwapRouter && (await w.provider.getCode(r.SwapRouter)) !== "0x") { console.log(ad.padEnd(10) + " var " + r.SwapRouter); continue; }
    const f = new ContractFactory(A.abi, A.bytecode, w);
    const tx = await f.getDeployTransaction(r.poolManager);
    const gas = await w.provider.estimateGas({ ...tx, from: w.address });
    const fd = await w.provider.getFeeData();
    const bak = await w.provider.getBalance(w.address);
    console.log(ad.padEnd(10) + " gaz " + gas + "  ~" + (Number(gas * (fd.maxFeePerGas || fd.gasPrice)) / 1e18).toPrecision(3) + " " + z.gaz +
      "  bakiye " + (Number(bak) / 1e18).toPrecision(4));
    if (!UYGULA) continue;
    const c = await f.deploy(r.poolManager, { gasLimit: (gas * 13n) / 10n });
    const h = c.deploymentTransaction().hash;
    let m = null; while (!m) { await bekle(2000); m = await w.provider.getTransactionReceipt(h).catch(() => null); }
    if (m.status !== 1) throw new Error(ad + " dagitim basarisiz " + h);
    r.SwapRouter = m.contractAddress;
    fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1));
    console.log("           SwapRouter " + m.contractAddress + "  tx " + h);
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
