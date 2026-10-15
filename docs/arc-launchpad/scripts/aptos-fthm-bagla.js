"use strict";
/* ===========================================================================
 * aptos-fthm-bagla.js — FTHM on Aptos, through the same Base gate as Sui
 *
 *   NODE_PATH="C:/Users/omen/araclar/aptossdk/node_modules;C:/Users/omen/araclar/sol/node_modules" \
 *     node scripts/aptos-fthm-bagla.js [--uygula]
 *
 * Measured 14 Oct 2026 on Aptos mainnet (uln_302 router_calls): Arc (30417)
 * and Robinhood (30422) are not supported send or receive eids; Base and
 * the other seven chains are. So Aptos joins the Base gate already serving
 * Sui (FTHMOFTAdapter over the Base twin, 0xFb99…). One lockbox, two
 * spokes:
 *
 *     supply on Sui + supply on Aptos == FTHM.balanceOf(gate) on Base
 *
 * APTOS SIDE: package aptos/fthm-oft (LayerZero's oft_fa, unmodified),
 *   published at the deployer account.
 *   initialize   Fathom / FTHM, 8 local decimals, 6 shared
 *   set_peer     Base = the gate
 *   enforced     lzReceive 100k on Base (200k + 500k compose, send-and-call)
 *   ULN          required LayerZero Labs (0xf3f0…) + Nethermind (0x07ad…),
 *                current per LayerZero metadata (the 0xdf8f/0x7aae entries
 *                are deprecated); 260 confirmations out of Aptos (the
 *                pathway default), 10 in from Base
 *   then irrevocably_disable_blocklist and permanently_disable_fungible_
 *   store_freezing: the admin can never freeze or blocklist a holder.
 * BASE SIDE: gate setPeer(Aptos) = the package address, the two Base DVNs,
 *   10 out / 260 in, enforced lzReceive 5,000 on Aptos (LayerZero example).
 * Record: dagitim-aptos-fthm.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, AbiCoder } = require("ethers");
const { Options } = require("@layerzerolabs/lz-v2-utilities");
const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-aptos-fthm.json");
const SUI = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sui-fthm.json"), "utf8"));
const UYGULA = process.argv.includes("--uygula");
const BASE_EID = 30184, APTOS_EID = 30108;
const ULN = "0xc33752e0220faf79e45385dd73fb28d681dcd9f1569a1480725507c1f3c3aba9";
const APT_DVN = ["0x07ad47ea4f858e7189d2c6e7327f166993e8f884386db9564d732bcff63fe4ff", "0xf3f0a412626edba5ddd3613d91109b241893873ac5479ade231cf0b3130572b5"]; // Nethermind, LZ Labs
const BASE_DVN = ["0x9e059a54699a285714207b43B055483E78FAac25", "0xcd37CA043f8479064e10635020c65FfC005d36f6"];
const BASE = { rpc: "https://mainnet.base.org", ep: "0x1a44076050125825900e736c501f859c50fE728c",
  send: "0xB5320B0B3a13cC860893E2Bd79FCd7e13484Dda2", recv: "0xc70AB6f32772f59fBfc23889Caf4Ba3376C84bAf" };
const ONAY_APT = 260, ONAY_BASE = 10;
const anahtar = (dosya, ad) => fs.readFileSync(dosya, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m"))[1].trim();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (b) => "0x" + Buffer.from(b).toString("hex");

/* uln_302 configs_uln::append_uln_config, big-endian */
function ulnAptos(onay) {
  const b = [];
  const u64 = Buffer.alloc(8); u64.writeBigUInt64BE(BigInt(onay)); b.push(u64);
  b.push(Buffer.from([0, APT_DVN.length]));
  for (const d of APT_DVN) b.push(Buffer.from(d.slice(2), "hex"));
  b.push(Buffer.from([0, 0, 0, 0]));   // no optional DVNs, no defaults
  return Buffer.concat(b);
}

(async () => {
  const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
  const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1)); };
  const aptos = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const hesap = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(anahtar(path.join(KOK, ".env"), "APTOS_PRIVATE_KEY")) });
  const P = hesap.accountAddress.toString();
  Object.assign(k, { paket: P, baseGecit: SUI.baseGecit, ondalik: 8, paylasilanOndalik: 6 });
  console.log("APTOS <-> BASE FTHM  " + (UYGULA ? "UYGULA" : "KURU") + "   paket " + P + "   gecit " + SUI.baseGecit);

  const goruntu = async (f, args = []) => aptos.view({ payload: { function: P + "::" + f, functionArguments: args } }).catch(() => null);
  const calistir = async (etiket, f, args) => {
    const tx = await aptos.transaction.build.simple({ sender: hesap.accountAddress, data: { function: P + "::" + f, functionArguments: args } });
    const [sim] = await aptos.transaction.simulate.simple({ signerPublicKey: hesap.publicKey, transaction: tx });
    if (!sim.success) throw new Error(etiket + " simulasyon: " + sim.vm_status);
    if (!UYGULA) { console.log("  (kuru) " + etiket.padEnd(34) + "gaz " + sim.gas_used); return; }
    const g = await aptos.signAndSubmitTransaction({ signer: hesap, transaction: tx });
    const r = await aptos.waitForTransaction({ transactionHash: g.hash });
    console.log("  " + etiket.padEnd(34) + g.hash + " " + r.vm_status);
    if (!r.success) throw new Error(etiket);
    (k.tx = k.tx || {})[etiket] = g.hash; yaz();
  };

  /* ---- Aptos ---- */
  const sembol = await goruntu("oft_fa::metadata").then(async (m) => m ? (await aptos.getFungibleAssetMetadataByAssetType({ assetType: m[0].inner }).catch(() => null)) : null);
  if (!sembol || sembol.symbol !== "FTHM") {
    await calistir("initialize", "oft_fa::initialize", [Array.from(Buffer.from("Fathom")), Array.from(Buffer.from("FTHM")), [], Array.from(Buffer.from("https://arc-depth.github.io/arc-depth/launchpad/")), 6, 8]);
  } else console.log("  initialize".padEnd(36) + "tamam");
  const gecit32 = Buffer.from(SUI.baseGecit.slice(2).toLowerCase().padStart(64, "0"), "hex");
  await calistir("set_peer(Base)", "oapp_core::set_peer", [BASE_EID, Array.from(gecit32)]);
  const evm1 = Options.newOptions().addExecutorLzReceiveOption(100000, 0).toBytes();
  const evm2 = Options.newOptions().addExecutorLzReceiveOption(200000, 0).addExecutorComposeOption(0, 500000, 0).toBytes();
  await calistir("enforced 1 (Base)", "oapp_core::set_enforced_options", [BASE_EID, 1, Array.from(evm1)]);
  await calistir("enforced 2 (Base)", "oapp_core::set_enforced_options", [BASE_EID, 2, Array.from(evm2)]);
  /* set_config is checked against the endpoint delegate, not the admin */
  await calistir("set_delegate", "oapp_core::set_delegate", [P]);
  await calistir("ULN gonderim (Base)", "oapp_core::set_config", [ULN, BASE_EID, 2, Array.from(ulnAptos(ONAY_APT))]);
  await calistir("ULN alim (Base)", "oapp_core::set_config", [ULN, BASE_EID, 3, Array.from(ulnAptos(ONAY_BASE))]);
  for (const f of ["irrevocably_disable_blocklist", "permanently_disable_fungible_store_freezing"]) {
    try { await calistir(f, "oft_fa::" + f, []); } catch (e) { console.log("  " + f.padEnd(34) + "atlandi: " + e.message.slice(0, 80)); }
  }

  /* ---- Base gate ---- */
  const w = new Wallet(anahtar("C:/bot/.env", "TRADER_PRIVATE_KEY"), new JsonRpcProvider(BASE.rpc, 8453, { staticNetwork: true }));
  const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "FTHMOFTAdapter.json"), "utf8"));
  const g = new Contract(SUI.baseGecit, B.abi, w);
  const ep = new Contract(BASE.ep, ["function setConfig(address,address,(uint32,uint32,bytes)[])", "function getConfig(address,address,uint32,uint32) view returns (bytes)"], w);
  const coder = AbiCoder.defaultAbiCoder();
  const uB = (n) => coder.encode(["tuple(uint64,uint8,uint8,uint8,address[],address[])"], [[n, 2, 0, 0, BASE_DVN, []]]);
  const aptSec = Options.newOptions().addExecutorLzReceiveOption(5000, 0).toHex();
  const P32 = "0x" + P.slice(2).padStart(64, "0");
  const gonder = async (etiket, tx) => {
    if (!UYGULA) { console.log("  (kuru) " + etiket.padEnd(34) + "gaz " + (await w.provider.estimateGas({ from: w.address, ...tx }).catch((e) => "? " + (e.shortMessage || e.message).slice(0, 60)))); return; }
    const t = await w.sendTransaction(tx);
    let m = null; while (!m) { await bekle(1500); m = await w.provider.getTransactionReceipt(t.hash).catch(() => null); }
    console.log("  " + etiket.padEnd(34) + t.hash + " durum " + m.status);
    if (m.status !== 1) throw new Error(etiket);
  };
  if ((await g.peers(APTOS_EID)).toLowerCase() !== P32.toLowerCase()) await gonder("Base setPeer(Aptos)", await g.setPeer.populateTransaction(APTOS_EID, P32));
  if ((await ep.getConfig(SUI.baseGecit, BASE.send, APTOS_EID, 2)).toLowerCase() !== uB(ONAY_BASE).toLowerCase())
    await gonder("Base DVN gonderim (Aptos)", await ep.setConfig.populateTransaction(SUI.baseGecit, BASE.send, [[APTOS_EID, 2, uB(ONAY_BASE)]]));
  if ((await ep.getConfig(SUI.baseGecit, BASE.recv, APTOS_EID, 2)).toLowerCase() !== uB(ONAY_APT).toLowerCase())
    await gonder("Base DVN alim (Aptos)", await ep.setConfig.populateTransaction(SUI.baseGecit, BASE.recv, [[APTOS_EID, 2, uB(ONAY_APT)]]));
  if ((await g.enforcedOptions(APTOS_EID, 1)).toLowerCase() !== aptSec.toLowerCase())
    await gonder("Base zorunlu secenek (Aptos)", await g.setEnforcedOptions.populateTransaction([[APTOS_EID, 1, aptSec], [APTOS_EID, 2, aptSec]]));
  try {
    const q = await g.quoteSend([APTOS_EID, P32, 10n ** 18n, 10n ** 18n, "0x", "0x", "0x"], false);
    console.log("  Base -> Aptos teklif " + Number(q[0]) / 1e18 + " ETH");
  } catch (e) { console.log("  Base -> Aptos teklif HATA " + (e.shortMessage || e.message).slice(0, 120)); }
  yaz();
})().catch((e) => { console.error("HATA " + (e.message || e)); process.exit(1); });
