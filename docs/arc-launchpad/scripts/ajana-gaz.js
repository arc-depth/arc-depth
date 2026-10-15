"use strict";
/* ===========================================================================
 * ajana-gaz.js — top up the GENESIS agent's gas on Arc from the bot wallet
 *
 *   node scripts/ajana-gaz.js <usdc> [--uygula]
 *
 * The founder's instruction (15 Oct 2026): the agent's gas comes from the
 * bot/operations wallet. Sends native USDC (Arc's gas token) to the GENESIS
 * agent address, which writes memory records. Capped at 5 USDC per call so
 * a typo cannot drain the wallet. Without --uygula it only prints balances.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, parseEther, formatEther } = require("ethers");

const KOK = path.join(__dirname, "..");
const TAVAN = 5;
const anahtar = (dosya, ad) => fs.readFileSync(dosya, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m"))[1].trim();

(async () => {
  const miktar = Number(process.argv[2]);
  if (!(miktar > 0) || miktar > TAVAN) throw new Error("miktar 0 ile " + TAVAN + " USDC arasinda olmali");
  const p = new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true });
  const w = new Wallet(anahtar("C:/bot/.env", "TRADER_PRIVATE_KEY"), p);
  const ajan = new Wallet(anahtar(path.join(KOK, ".env"), "GENESIS_AJAN_KEY")).address;
  console.log("bot cuzdani " + w.address + "  " + formatEther(await p.getBalance(w.address)) + " USDC");
  console.log("ajan        " + ajan + "  " + formatEther(await p.getBalance(ajan)) + " USDC");
  if (!process.argv.includes("--uygula")) return console.log("(kuru) " + miktar + " USDC gonderilecek");
  const t = await w.sendTransaction({ to: ajan, value: parseEther(String(miktar)) });
  const m = await t.wait();
  if (m.status !== 1) throw new Error("basarisiz " + t.hash);
  console.log("gonderildi " + miktar + " USDC  tx " + t.hash);
  console.log("ajan simdi " + formatEther(await p.getBalance(ajan)) + " USDC");
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
