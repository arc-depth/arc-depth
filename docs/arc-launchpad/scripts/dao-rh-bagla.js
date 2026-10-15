"use strict";
/* ===========================================================================
 * dao-rh-bagla.js — connect Robinhood's developer fund to the Arc DAO, then
 *                   let go of it
 *
 *   node scripts/dao-rh-bagla.js [--uygula]
 *
 * Robinhood's DevPool (0x683D…) answers only to the first-generation
 * UzakYurutucu (0xB0CF…), deployed 14 Oct with the deployer as temporary
 * owner because its Arc peer did not exist yet. That peer now exists:
 * DaoElcisiAg on Arc, which already points its Robinhood route at this
 * executor. This script, on Robinhood:
 *   1. setPeer(Arc) = DaoElcisiAg
 *   2. two required DVNs (LayerZero Labs + Nethermind) both ways, the same
 *      numbers every network OApp uses (Arc 5 confirmations, Robinhood 20)
 *   3. sahipligiYak — delegate to 0xdead, owner to zero; from then on only an
 *      Arc vote can move Robinhood's developer money
 * and on Arc tops DaoElcisiAg up with native USDC for LayerZero fees: the
 * Governor forwards no value, so the messenger pays from its own balance —
 * anyone may add to it, nobody can take it out.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, AbiCoder, zeroPadValue, getAddress, parseEther } = require("ethers");

const KOK = path.join(__dirname, "..");
const AG = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ag.json"), "utf8"));
const RH = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-robinhood.json"), "utf8")).robinhood;
const UYGULA = process.argv.includes("--uygula");
const ELCI = AG.arc.DaoElcisiAg;
const YURUTUCU = RH.uzakYurutucu;
const EP = "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B";
const SEND = "0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", RECV = "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043";
const RH_DVN = ["0x0Ffe02DF012299A370D5dd69298A5826EAcaFdF8", "0xd01ae6905d48315f7bE10C7330aeCF8360Ef5b12"];
const ULN = "tuple(uint64,uint8,uint8,uint8,address[],address[])";
const coder = AbiCoder.defaultAbiCoder();
const uln = (n) => coder.encode([ULN], [[n, 2, 0, 0, RH_DVN, []]]);
const ELCI_BAKIYE = parseEther("2");   // 2 USDC of native gas on Arc

(async () => {
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const rh = new Wallet(pk, new JsonRpcProvider("https://rpc.mainnet.chain.robinhood.com", 4663, { staticNetwork: true }));
  const arc = new Wallet(pk, new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true }));
  const y = new Contract(YURUTUCU, ["function owner() view returns (address)", "function peers(uint32) view returns (bytes32)",
    "function setPeer(uint32,bytes32)", "function sahipligiYak()"], rh);
  const ep = new Contract(EP, ["function getConfig(address,address,uint32,uint32) view returns (bytes)",
    "function setConfig(address,address,(uint32,uint32,bytes)[])"], rh);
  console.log("DAO <-> ROBINHOOD  " + (UYGULA ? "UYGULA" : "KURU") + "   yurutucu " + YURUTUCU + "   elci " + ELCI);
  const sahip = await y.owner();
  const isler = [];
  if (sahip === "0x0000000000000000000000000000000000000000") {
    console.log("  yurutucu zaten sahipsiz");
  } else {
    if ((await y.peers(30417)).toLowerCase() !== zeroPadValue(ELCI, 32).toLowerCase())
      isler.push(["setPeer(Arc) = DaoElcisiAg", await y.setPeer.populateTransaction(30417, zeroPadValue(ELCI, 32))]);
    if ((await ep.getConfig(YURUTUCU, RECV, 30417, 2)).toLowerCase() !== uln(5).toLowerCase())
      isler.push(["DVN alim (Arc'tan, 5 onay)", await ep.setConfig.populateTransaction(YURUTUCU, RECV, [[30417, 2, uln(5)]])]);
    if ((await ep.getConfig(YURUTUCU, SEND, 30417, 2)).toLowerCase() !== uln(20).toLowerCase())
      isler.push(["DVN gonderim (Arc'a, 20 onay)", await ep.setConfig.populateTransaction(YURUTUCU, SEND, [[30417, 2, uln(20)]])]);
    isler.push(["sahipligiYak", await y.sahipligiYak.populateTransaction()]);
  }
  for (const [etiket, tx] of isler) {
    if (!UYGULA) { console.log("  (kuru) " + etiket.padEnd(30) + "gaz " + (await rh.provider.estimateGas({ from: rh.address, ...tx }))); continue; }
    const t = await rh.sendTransaction(tx);
    const m = await t.wait();
    console.log("  " + etiket.padEnd(30) + t.hash + " durum " + m.status);
  }
  const b = await arc.provider.getBalance(ELCI);
  console.log("  DaoElcisiAg bakiyesi " + Number(b) / 1e18 + " USDC");
  if (b < ELCI_BAKIYE) {
    if (!UYGULA) console.log("  (kuru) elciye " + Number(ELCI_BAKIYE - b) / 1e18 + " USDC eklenecek");
    else { const t = await arc.sendTransaction({ to: ELCI, value: ELCI_BAKIYE - b }); await t.wait(); console.log("  elciye USDC eklendi " + t.hash); }
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
