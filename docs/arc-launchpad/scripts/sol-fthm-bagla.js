"use strict";
/* ===========================================================================
 * sol-fthm-bagla.js — wire FTHM on Solana to FTHM on Arc, both ways
 *
 *   NODE_PATH=C:\Users\omen\araclar\sol\node_modules node scripts/sol-fthm-bagla.js [--uygula]
 *
 * Solana is reached through Arc. The FTHM twins on the eight EVM chains were
 * born with their peer list fixed and no owner, so they cannot add Solana;
 * the Arc FTHMOFTAdapter is still owned and can. A holder on Base goes
 * Base -> Arc -> Solana.
 *
 * SOLANA SIDE (OFT Store on the immutable Paxos OFT program, sol-fthm.js)
 *   initConfig(Arc)      send/receive library accounts + ULN config accounts
 *   setPeer(Arc)         peer = Arc FTHMOFTAdapter, enforced options, nonce
 *   enforced options     lzReceive 100k gas on Arc (200k + 500k compose for
 *                        a transfer that sells on arrival)
 *   ULN send / receive   required DVNs LayerZero Labs + Nethermind (Solana
 *                        addresses from LayerZero metadata); 32 confirmations
 *                        for messages leaving Solana, 5 for messages from Arc
 * ARC SIDE (FTHMOFTAdapter, owned by the deployer)
 *   setPeer(Solana) = the OFT Store; the same two DVNs; enforced lzReceive of
 *   200k compute units plus 2,039,280 lamports — the rent of the recipient's
 *   SPL token account, which the executor pays on arrival.
 * Every Solana transaction is simulated before it is sent.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Connection, Keypair, PublicKey, Transaction } = require("@solana/web3.js");
const { OFT } = require("@layerzerolabs/ua-devtools-solana");
const { deserializeTransactionMessage } = require("@layerzerolabs/devtools-solana");
const { Options } = require("@layerzerolabs/lz-v2-utilities");
const { SetConfigType } = require("@layerzerolabs/lz-solana-sdk-v2");
const { JsonRpcProvider, Wallet, Contract, AbiCoder, zeroPadValue, getAddress, solidityPacked, hexlify } = require("ethers");

const KOK = path.join(__dirname, "..");
const SOL = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sol-fthm.json"), "utf8"));
const UYGULA = process.argv.includes("--uygula");
const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const ARC_EID = 30417, SOL_EID = 30168;
const ADAPTER = "0x6e591AfAf47A0Ff6aB26a4F5c077De7715C34bf0";
const SOL_ULN = "7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH";
const SOL_DVN = ["4VDjp6XQaxoZf5RGwiPU9NR1EXSZn2TP4ATMmiSzLfhb", "GPjyWr8vCotGuFubDpTxDxy9Vj1ZeEN4F2dwRmFiaGab"]; // LZ Labs, Nethermind
const ONAY_SOL = 32, ONAY_ARC = 5;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function anahtar(ad) {
  const m = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m"));
  if (!m) throw new Error(ad + " yok");
  return m[1].trim();
}

(async () => {
  const baglanti = new Connection(RPC, "confirmed");
  const imzaci = Keypair.fromSeed(Buffer.from(anahtar("SOLANA_PRIVATE_KEY"), "hex"));
  const magaza = SOL.oftStore;
  console.log("SOLANA <-> ARC FTHM  " + (UYGULA ? "UYGULA" : "KURU") + "   magaza " + magaza + "   yonetici " + imzaci.publicKey.toBase58());
  const sdk = new OFT(baglanti, { eid: SOL_EID, address: magaza }, imzaci.publicKey, new PublicKey(SOL.program));

  const gonderSol = async (etiket, omni) => {
    const liste = (Array.isArray(omni) ? omni : [omni]).filter(Boolean);
    if (!liste.length) { console.log("  " + etiket.padEnd(30) + "tamam (islem gerekmiyor)"); return; }
    for (const o of liste) {
      const tx = deserializeTransactionMessage(o.data);
      tx.recentBlockhash = (await baglanti.getLatestBlockhash("confirmed")).blockhash;
      tx.feePayer = imzaci.publicKey;
      tx.sign(imzaci);
      const sim = await baglanti.simulateTransaction(tx);
      if (sim.value.err) {
        console.log("  " + etiket.padEnd(30) + "SIMULASYON HATA " + JSON.stringify(sim.value.err));
        console.log((sim.value.logs || []).slice(-10).join("\n"));
        throw new Error(etiket);
      }
      if (!UYGULA) { console.log("  " + etiket.padEnd(30) + "(kuru) simulasyon ok, CU " + sim.value.unitsConsumed); continue; }
      const imza = await baglanti.sendRawTransaction(tx.serialize());
      await baglanti.confirmTransaction(imza, "confirmed");
      console.log("  " + etiket.padEnd(30) + "https://solscan.io/tx/" + imza);
      await bekle(1500);
    }
  };

  /* ---- Solana side ---- */
  await gonderSol("initConfig(Arc)", await sdk.initConfig(ARC_EID));
  if (!UYGULA && !(await sdk.sendConfigIsInitialized(ARC_EID))) {
    console.log("  (kuru: kalan Solana adimlari initConfig hesaplari olusmadan simule edilemez)");
  } else {
    const peer = await sdk.getPeer(ARC_EID).catch(() => null);
    if (!peer || peer.toLowerCase() !== ADAPTER.toLowerCase()) await gonderSol("setPeer(Arc)", await sdk.setPeer(ARC_EID, ADAPTER));
    else console.log("  setPeer(Arc)".padEnd(32) + "tamam");
    const evm1 = Options.newOptions().addExecutorLzReceiveOption(100000, 0).toHex();
    const evm2 = Options.newOptions().addExecutorLzReceiveOption(200000, 0).addExecutorComposeOption(0, 500000, 0).toHex();
    await gonderSol("zorunlu gaz (Arc)", await sdk.setEnforcedOptions([
      { eid: ARC_EID, option: { msgType: 1, options: evm1 } },
      { eid: ARC_EID, option: { msgType: 2, options: evm2 } },
    ]));
    const ep = await sdk.getEndpointSDK();
    const uln = (onay) => ({ confirmations: BigInt(onay), requiredDVNs: SOL_DVN, requiredDVNCount: 2, optionalDVNs: [], optionalDVNCount: 0, optionalDVNThreshold: 0 });
    await gonderSol("DVN gonderim+alim (Arc)", await ep.setConfig(magaza, SOL_ULN, [
      { eid: ARC_EID, configType: SetConfigType.SEND_ULN, config: uln(ONAY_SOL) },
      { eid: ARC_EID, configType: SetConfigType.RECEIVE_ULN, config: uln(ONAY_ARC) },
    ]));
  }

  /* ---- Arc side ---- */
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const p = new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true });
  const w = new Wallet(pk, p);
  const adp = new Contract(ADAPTER, ["function peers(uint32) view returns (bytes32)", "function setPeer(uint32,bytes32)",
    "function setEnforcedOptions((uint32,uint16,bytes)[])", "function enforcedOptions(uint32,uint16) view returns (bytes)"], w);
  const ep = new Contract("0x6F475642a6e85809B1c36Fa62763669b1b48DD5B", ["function setConfig(address,address,(uint32,uint32,bytes)[])",
    "function getConfig(address,address,uint32,uint32) view returns (bytes)"], w);
  const coder = AbiCoder.defaultAbiCoder();
  const ULN = "tuple(uint64,uint8,uint8,uint8,address[],address[])";
  const arcDvn = ["0x9E0E95Ede70F680f74480b510FF9f45C70e3da80", "0xa2447e5B58D357c49Bf74B50B14421e6A100e525"];
  const uArc = (n) => coder.encode([ULN], [[n, 2, 0, 0, arcDvn, []]]);
  const magazaB32 = hexlify(new PublicKey(magaza).toBytes());
  const solSec = Options.newOptions().addExecutorLzReceiveOption(200000, 2039280).toHex();
  const isler = [];
  if ((await adp.peers(SOL_EID)).toLowerCase() !== magazaB32.toLowerCase()) isler.push(["Arc setPeer(Solana)", await adp.setPeer.populateTransaction(SOL_EID, magazaB32)]);
  const g = await ep.getConfig(ADAPTER, "0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", SOL_EID, 2);
  const a = await ep.getConfig(ADAPTER, "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043", SOL_EID, 2);
  if (g.toLowerCase() !== uArc(ONAY_ARC).toLowerCase()) isler.push(["Arc DVN gonderim (Solana)", await ep.setConfig.populateTransaction(ADAPTER, "0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", [[SOL_EID, 2, uArc(ONAY_ARC)]])]);
  if (a.toLowerCase() !== uArc(ONAY_SOL).toLowerCase()) isler.push(["Arc DVN alim (Solana)", await ep.setConfig.populateTransaction(ADAPTER, "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043", [[SOL_EID, 2, uArc(ONAY_SOL)]])]);
  if ((await adp.enforcedOptions(SOL_EID, 1)).toLowerCase() !== solSec.toLowerCase())
    isler.push(["Arc zorunlu secenek (Solana)", await adp.setEnforcedOptions.populateTransaction([[SOL_EID, 1, solSec], [SOL_EID, 2, solSec]])]);
  for (const [etiket, tx] of isler) {
    if (!UYGULA) { console.log("  " + etiket.padEnd(30) + "(kuru) gaz " + (await p.estimateGas({ from: w.address, ...tx }))); continue; }
    const t = await w.sendTransaction(tx);
    const m = await t.wait();
    console.log("  " + etiket.padEnd(30) + t.hash + " durum " + m.status);
  }
  if (!isler.length) console.log("  Arc tarafi tamam");
})().catch((e) => { console.error("HATA " + (e.message || e)); process.exit(1); });
