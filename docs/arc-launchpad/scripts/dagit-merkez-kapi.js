"use strict";
/* ===========================================================================
 * dagit-merkez-kapi.js — MerkezKapi on Arc (the one pool's door for every chain)
 *
 *   node scripts/dagit-merkez-kapi.js            dry: address, gas, checks
 *   node scripts/dagit-merkez-kapi.js --uygula   deploy (user command only)
 *
 * Constructor, all fixed: PulseLaunchpad5 (Arc), PoolManager, IkizYayici,
 * the Arc HaberciCctp, the Arc SepetUcu, USDC, the LayerZero endpoint.
 * No owner, nothing to configure after. Measured first on Arc mainnet
 * state by scripts/denetim-merkez-kapi.js. Record: dagitim-sepet.json (merkez).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, ContractFactory } = require("ethers");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const KAYIT = path.join(KOK, "dagitim-sepet.json");
const kayit = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
const a = kayit.zincir.arc;
const ARGS = [a.PulseLaunchpad5, "0x8366a39CC670B4001A1121B8F6A443A643e40951", "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9",
  a.HaberciCctp, a.SepetUcu, "0x3600000000000000000000000000000000000000", "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B"];

(async () => {
  const p = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });
  const w = new Wallet(fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim(), p);
  const art = JSON.parse(fs.readFileSync(path.join(KOK, "build", "MerkezKapi.json"), "utf8"));
  const f = new ContractFactory(art.abi, art.bytecode, w);
  console.log("MERKEZ KAPI  " + (UYGULA ? "UYGULA" : "KURU") + "  dagitici " + w.address + "  bakiye " + Number(await p.getBalance(w.address)) / 1e18 + " USDC");
  if (kayit.merkez && kayit.merkez.MerkezKapi && (await p.getCode(kayit.merkez.MerkezKapi)).length > 2) { console.log("  zaten kurulu " + kayit.merkez.MerkezKapi); return; }
  const tx = await f.getDeployTransaction(...ARGS);
  const gaz = await p.estimateGas({ from: w.address, data: tx.data });
  const fiyat = (await p.getFeeData()).maxFeePerGas;
  console.log("  argumanlar " + ARGS.join(", "));
  console.log("  gaz " + gaz + "  ~" + (Number(gaz * fiyat) / 1e18).toFixed(4) + " USDC");
  if (!UYGULA) return;
  const c = await f.deploy(...ARGS);
  await c.waitForDeployment();
  kayit.merkez = { MerkezKapi: await c.getAddress(), tx: c.deploymentTransaction().hash, zaman: new Date().toISOString() };
  fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1));
  console.log("  MerkezKapi " + kayit.merkez.MerkezKapi + "  " + kayit.merkez.tx);
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exitCode = 1; });
