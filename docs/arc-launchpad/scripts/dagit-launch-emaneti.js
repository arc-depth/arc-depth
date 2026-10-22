"use strict";
/* ===========================================================================
 * dagit-launch-emaneti.js — deploy LaunchEmaneti on Arc (Sui / Aptos launches)
 *
 *   node scripts/dagit-launch-emaneti.js            # dry: simulate only, nothing sent
 *   node scripts/dagit-launch-emaneti.js --uygula   # deploy (the user's own command)
 *
 * LaunchEmaneti(MessageTransmitterV2, TokenMessengerV2, MerkezKapi, USDC, 26):
 * MerkezKapi is read from dagitim-v2.json, Circle's two contracts are checked
 * on chain (local domain 26, the messenger's transmitter) before anything.
 * No wiring follows: the contract has no owner and nothing to set. After the
 * deploy its address is added to dagitim-v2.json (zincir.arc.LaunchEmaneti)
 * and to docs/veri/sepet-v2.json (emanet), which turns the Sui / Aptos launch
 * on in the site.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, ContractFactory, Contract } = require("ethers");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const MT = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";   // Circle MessageTransmitterV2 on Arc
const TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";   // Circle TokenMessengerV2 on Arc
const USDC = "0x3600000000000000000000000000000000000000";
const DAGITIM = path.join(KOK, "dagitim-v2.json");
const SITE = path.join(KOK, "docs", "veri", "sepet-v2.json");

(async () => {
  const p = new JsonRpcProvider(RPC, 5042, { staticNetwork: true });
  const d = JSON.parse(fs.readFileSync(DAGITIM, "utf8"));
  const kapi = d.zincir.arc.MerkezKapi;
  if (!kapi) throw new Error("dagitim-v2.json has no MerkezKapi");
  if (d.zincir.arc.LaunchEmaneti) { console.log("zaten dagitildi: " + d.zincir.arc.LaunchEmaneti); return; }
  const mt = new Contract(MT, ["function localDomain() view returns (uint32)"], p);
  const tm = new Contract(TM, ["function localMessageTransmitter() view returns (address)"], p);
  if (Number(await mt.localDomain()) !== 26) throw new Error("MessageTransmitterV2 is not domain 26");
  if ((await tm.localMessageTransmitter()).toLowerCase() !== MT.toLowerCase()) throw new Error("TokenMessengerV2 points elsewhere");
  if ((await p.getCode(kapi)) === "0x") throw new Error("no code at MerkezKapi " + kapi);
  const A = JSON.parse(fs.readFileSync(path.join(KOK, "build", "LaunchEmaneti.json"), "utf8"));
  const f = new ContractFactory(A.abi, A.bytecode);
  const tx = await f.getDeployTransaction(MT, TM, kapi, USDC, 26);
  console.log("LaunchEmaneti  MerkezKapi " + kapi + (UYGULA ? "" : "  (KURU: gonderim yok)"));
  /* the constructor run on Arc state: the runtime code it returns must be the build's */
  const kod = await p.call({ data: tx.data });
  const bekl = A.deployedBytecode.toLowerCase();
  const esit = kod.length === bekl.length;   // immutables differ in value, not in length
  console.log("  kurulum simulasyonu: " + (esit ? "tamam" : "HATA") + " (" + (kod.length - 2) / 2 + " bayt)");
  if (!esit) { process.exitCode = 1; return; }
  const gaz = await p.estimateGas({ data: tx.data });
  console.log("  gaz tahmini: " + gaz.toString());
  if (!UYGULA) { console.log("  --uygula ile gonderilir."); return; }

  const anahtar = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const w = new Wallet(anahtar, p);
  const c = await new ContractFactory(A.abi, A.bytecode, w).deploy(MT, TM, kapi, USDC, 26);
  await c.waitForDeployment();
  const adres = await c.getAddress();
  console.log("  dagitildi: " + adres + "  tx " + c.deploymentTransaction().hash);
  const e = new Contract(adres, A.abi, p);
  const dogru = (await e.kapi()) === kapi && (await e.iletici()) === MT && (await e.tokenMesajci()) === TM && Number(await e.buZincir()) === 26;
  console.log("  okundu: " + (dogru ? "kapi, iletici, mesajci, zincir dogru" : "HATA"));
  if (!dogru) { process.exitCode = 1; return; }
  const d2 = JSON.parse(fs.readFileSync(DAGITIM, "utf8"));
  d2.zincir.arc.LaunchEmaneti = adres;
  fs.writeFileSync(DAGITIM, JSON.stringify(d2, null, 1));
  const s = JSON.parse(fs.readFileSync(SITE, "utf8"));
  s.emanet = adres;
  fs.writeFileSync(SITE, JSON.stringify(s, null, 1));
  console.log("  dagitim-v2.json ve docs/veri/sepet-v2.json guncellendi");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exitCode = 1; });
