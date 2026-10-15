"use strict";
/* ===========================================================================
 * sui-fthm-bagla.js — FTHM on Sui, reached through Base
 *
 *   NODE_PATH=C:\Users\omen\araclar\suisdk\node_modules node scripts/sui-fthm-bagla.js [--uygula]
 *
 * WHY BASE AND NOT ARC
 *   Measured 14 Oct 2026 on Sui mainnet: LayerZero's Sui executor has no
 *   destination config for Arc (30417, abort 1), and the Sui ULN has no
 *   default config for Arc or Robinhood. It has both for Base, Arbitrum,
 *   Ethereum, BNB, Avalanche, Monad, HyperEVM and Solana. The FTHM twins on
 *   those chains were born with a fixed peer list and no owner, so none of
 *   them can add Sui. What can: a second adapter on Base over the Base twin
 *   (0x933F...). It locks Base FTHM and Sui mints exactly that, the lockbox
 *   rule the Arc adapter already follows:
 *
 *       FTHM supply on Sui == FTHM.balanceOf(Sui gate) on Base
 *
 *   A holder goes Arc -> Base (the mesh) -> Sui (this gate).
 *
 * SUI SIDE (package from sui/fthm-oft, OFT shared object, AdminCap held by
 *   the deployer): peer Base = the gate; enforced lzReceive 100k on Base
 *   (200k + 500k compose for send-and-call); send ULN 5 confirmations,
 *   receive ULN 10, required DVNs LayerZero Labs + Nethermind (Sui addresses
 *   from LayerZero metadata).
 * BASE SIDE: FTHMOFTAdapter over the Base twin; peer Sui = the OApp CallCap
 *   id, which for a Package cap is the package address; the same two DVNs (Base addresses from
 *   ZincirTablosu); enforced lzReceive 5,000 on Sui (LayerZero's figure: Sui
 *   meters storage itself, no value).
 * Ownership is kept until a real transfer has been delivered both ways;
 * then sahipligiYak on Base and the AdminCap goes to 0x0 on Sui.
 * Record: dagitim-sui-fthm.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, ContractFactory, AbiCoder } = require("ethers");
const { Options } = require("@layerzerolabs/lz-v2-utilities");
const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
const { Transaction } = require("@mysten/sui/transactions");
const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
const { SDK, OAppUlnConfigBcs } = require("@layerzerolabs/lz-sui-sdk-v2");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-sui-fthm.json");
const UYGULA = process.argv.includes("--uygula");
const SUI_RPC = process.env.SUI_RPC || "https://sui-rpc.publicnode.com";
const BASE_EID = 30184, SUI_EID = 30378;
const SUI_DVN = ["0x0c12321ebe562b8fb8a74e6d29f144ea199a8f31a4cea3a417ce72477f6dfebb", "0x52aa129049de845353484868d1be6e2df6878b0ed2213d94d3c827309aeae685"]; // Nethermind, LZ Labs (sorted)
const BASE_DVN = ["0x9e059a54699a285714207b43B055483E78FAac25", "0xcd37CA043f8479064e10635020c65FfC005d36f6"];
const BASE = { rpc: "https://mainnet.base.org", ep: "0x1a44076050125825900e736c501f859c50fE728c",
  send: "0xB5320B0B3a13cC860893E2Bd79FCd7e13484Dda2", recv: "0xc70AB6f32772f59fBfc23889Caf4Ba3376C84bAf" };
const ONAY_SUI = 5, ONAY_BASE = 10;
const k = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1)); };
const anahtar = (dosya, ad) => fs.readFileSync(dosya, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m"))[1].trim();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log("SUI <-> BASE FTHM  " + (UYGULA ? "UYGULA" : "KURU") + "   OFT " + k.oft);

  /* ---- Base: the gate ---- */
  const w = new Wallet(anahtar("C:/bot/.env", "TRADER_PRIVATE_KEY"), new JsonRpcProvider(BASE.rpc, 8453, { staticNetwork: true }));
  const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "FTHMOFTAdapter.json"), "utf8"));
  const gonder = async (etiket, tx) => {
    if (!UYGULA) {
      const g = await w.provider.estimateGas({ from: w.address, ...tx }).catch((e) => "? " + (e.shortMessage || e.message).slice(0, 60));
      console.log("  (kuru) " + etiket.padEnd(30) + "gaz " + g); return null;
    }
    const t = await w.sendTransaction(tx);
    let m = null; while (!m) { await bekle(1500); m = await w.provider.getTransactionReceipt(t.hash).catch(() => null); }
    console.log("  " + etiket.padEnd(30) + t.hash + " durum " + m.status);
    if (m.status !== 1) throw new Error(etiket);
    return m;
  };
  if (!k.baseGecit || (await w.provider.getCode(k.baseGecit)).length <= 2) {
    const tx = await new ContractFactory(B.abi, B.bytecode, w).getDeployTransaction(k.baseIkiz, BASE.ep, w.address);
    const m = await gonder("Base Sui gecidi", tx);
    if (!m) { console.log("  (kuru: kalan adimlar gecit olmadan olculemez)"); return; }
    k.baseGecit = m.contractAddress; yaz();
    for (let i = 0; i < 20 && (await w.provider.getCode(k.baseGecit)).length <= 2; i++) await bekle(2000);
  }
  console.log("  Base gecidi " + k.baseGecit);
  const g = new Contract(k.baseGecit, B.abi, w);
  const ep = new Contract(BASE.ep, ["function setConfig(address,address,(uint32,uint32,bytes)[])", "function getConfig(address,address,uint32,uint32) view returns (bytes)"], w);
  const coder = AbiCoder.defaultAbiCoder();
  const ULN = "tuple(uint64,uint8,uint8,uint8,address[],address[])";
  const uB = (n) => coder.encode([ULN], [[n, 2, 0, 0, BASE_DVN, []]]);
  const suiSec = Options.newOptions().addExecutorLzReceiveOption(5000, 0).toHex();
  if ((await g.peers(SUI_EID)).toLowerCase() !== k.oftCap.toLowerCase()) await gonder("Base setPeer(Sui)", await g.setPeer.populateTransaction(SUI_EID, k.oftCap));
  if ((await ep.getConfig(k.baseGecit, BASE.send, SUI_EID, 2)).toLowerCase() !== uB(ONAY_BASE).toLowerCase())
    await gonder("Base DVN gonderim (Sui)", await ep.setConfig.populateTransaction(k.baseGecit, BASE.send, [[SUI_EID, 2, uB(ONAY_BASE)]]));
  if ((await ep.getConfig(k.baseGecit, BASE.recv, SUI_EID, 2)).toLowerCase() !== uB(ONAY_SUI).toLowerCase())
    await gonder("Base DVN alim (Sui)", await ep.setConfig.populateTransaction(k.baseGecit, BASE.recv, [[SUI_EID, 2, uB(ONAY_SUI)]]));
  if ((await g.enforcedOptions(SUI_EID, 1)).toLowerCase() !== suiSec.toLowerCase())
    await gonder("Base zorunlu secenek (Sui)", await g.setEnforcedOptions.populateTransaction([[SUI_EID, 1, suiSec], [SUI_EID, 2, suiSec]]));

  /* ---- Sui: peer, options, ULN ---- */
  const client = new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" });
  const sdk = new SDK({ client });
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(anahtar(path.join(KOK, ".env"), "SUI_PRIVATE_KEY"), "hex"));
  const oapp = sdk.getOApp(k.oftCap);
  const tx = new Transaction();
  const gecitB32 = Uint8Array.from(Buffer.from(k.baseGecit.slice(2).padStart(64, "0"), "hex"));
  const peer = await oapp.getPeer(BASE_EID).catch(() => null);
  if (!peer || Buffer.from(peer).toString("hex") !== Buffer.from(gecitB32).toString("hex")) { await oapp.setPeerMoveCall(tx, BASE_EID, gecitB32); console.log("  Sui setPeer(Base)"); }
  const evm1 = Options.newOptions().addExecutorLzReceiveOption(100000, 0).toBytes();
  const evm2 = Options.newOptions().addExecutorLzReceiveOption(200000, 0).addExecutorComposeOption(0, 500000, 0).toBytes();
  await oapp.setEnforcedOptionsMoveCall(tx, BASE_EID, 1, evm1);
  await oapp.setEnforcedOptionsMoveCall(tx, BASE_EID, 2, evm2);
  const ulnLib = await sdk.getEndpoint().getDefaultSendLibrary(BASE_EID);
  const uS = (n) => OAppUlnConfigBcs.serialize({ use_default_confirmations: false, use_default_required_dvns: false, use_default_optional_dvns: false,
    uln_config: { confirmations: n, required_dvns: SUI_DVN, optional_dvns: [], optional_dvn_threshold: 0 } }).toBytes();
  for (const [tur, onay] of [[2, ONAY_SUI], [3, ONAY_BASE]]) {
    const call = await oapp.setConfigMoveCall(tx, ulnLib, BASE_EID, tur, uS(onay));
    sdk.getUln302().setConfigMoveCall(tx, call);
  }
  console.log("  Sui ULN kutuphanesi " + ulnLib);
  tx.setSender(imzaci.toSuiAddress());
  const sim = await client.dryRunTransactionBlock({ transactionBlock: await tx.build({ client }) });
  console.log("  Sui simulasyon " + sim.effects.status.status + (sim.effects.status.error ? " " + sim.effects.status.error : ""));
  if (sim.effects.status.status !== "success") throw new Error("Sui simulasyon");
  if (UYGULA) {
    const r = await client.signAndExecuteTransaction({ signer: imzaci, transaction: tx, options: { showEffects: true } });
    console.log("  Sui yapilandirma " + r.digest + " " + r.effects.status.status);
    k.suiYapilandirma = r.digest; yaz();
  }

  /* ---- proof: Base -> Sui quotes with the configured DVNs ---- */
  try {
    const q = await g.quoteSend([SUI_EID, "0x" + imzaci.toSuiAddress().slice(2).padStart(64, "0"), 10n ** 18n, 10n ** 18n, "0x", "0x", "0x"], false);
    console.log("  Base -> Sui teklif " + Number(q[0]) / 1e18 + " ETH");
  } catch (e) { console.log("  Base -> Sui teklif HATA " + (e.shortMessage || e.message).slice(0, 120)); }
})().catch((e) => { console.error("HATA " + (e.message || e)); process.exit(1); });
