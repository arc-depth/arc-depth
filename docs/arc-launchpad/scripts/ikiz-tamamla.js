"use strict";
/* ===========================================================================
 * ikiz-tamamla.js — finish LayerZero twin messages the executor could not
 *
 *   node scripts/ikiz-tamamla.js <Arc tx hash>            dry: what is pending, gas each needs
 *   node scripts/ikiz-tamamla.js <Arc tx hash> --uygula   deliver them (user command)
 *
 * A message whose lzReceive reverted at the executor (e.g. out of gas) stays
 * verified at the destination endpoint; EndpointV2.lzReceive is open to
 * anyone, with any gas. This reads the messages of an Arc transaction from
 * LayerZero Scan, checks each is still pending at its endpoint
 * (inboundPayloadHash non-zero), estimates the gas and delivers it from the
 * deployer, paying only that chain's gas.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, zeroPadValue } = require("ethers");

const KOK = path.join(__dirname, "..");
const TX = process.argv[2];
const UYGULA = process.argv.includes("--uygula");
if (!/^0x[0-9a-fA-F]{64}$/.test(TX || "")) { console.error("kullanim: ikiz-tamamla.js <Arc tx hash> [--uygula]"); process.exit(1); }
const EP = {};
for (const m of fs.readFileSync(path.join(KOK, "contracts", "lz", "ZincirTablosu.sol"), "utf8").matchAll(/Zincir\((\d+), (\d+), (0x[0-9a-fA-F]{40})/g))
  EP[Number(m[2])] = [Number(m[1]), m[3]];
const RPC = { 8453: "https://mainnet.base.org", 42161: "https://arb1.arbitrum.io/rpc", 56: "https://bsc-dataseed.bnbchain.org",
  43114: "https://api.avax.network/ext/bc/C/rpc", 999: "https://rpc.hyperliquid.xyz/evm", 143: "https://rpc.monad.xyz",
  4663: "https://rpc.mainnet.chain.robinhood.com", 1: "https://ethereum-rpc.publicnode.com" };
const ABI = ["function lzReceive((uint32,bytes32,uint64),address,bytes32,bytes,bytes) payable",
  "function inboundPayloadHash(address,uint32,bytes32,uint64) view returns (bytes32)"];
const anahtar = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();

(async () => {
  const j = await fetch("https://scan.layerzero-api.com/v1/messages/tx/" + TX).then((x) => x.json());
  console.log("IKIZ TAMAMLA  " + (UYGULA ? "UYGULA" : "KURU") + "  " + TX + "  " + (j.data || []).length + " mesaj");
  for (const m of j.data || []) {
    const eid = m.pathway.dstEid;
    if (!EP[eid] || !RPC[EP[eid][0]]) { console.log("  " + eid + " bilinmeyen zincir, atlandi"); continue; }
    const [id, ep] = EP[eid];
    const p = new JsonRpcProvider(RPC[id], id, { staticNetwork: true });
    const e = new Contract(ep, ABI, new Wallet(anahtar, p));
    const alici = m.pathway.receiver.address, gonderen = zeroPadValue(m.pathway.sender.address, 32);
    const durum = m.status.name.padEnd(10);
    const h = await e.inboundPayloadHash(alici, m.pathway.srcEid, gonderen, m.pathway.nonce);
    if (/^0x0+$/.test(h)) { console.log("  " + eid + " " + durum + "teslim edilmis (uc noktada bekleyen yok)"); continue; }
    const arg = [[m.pathway.srcEid, gonderen, m.pathway.nonce], alici, m.guid, m.source.tx.payload, "0x"];
    let gaz;
    try { gaz = await e.lzReceive.estimateGas(...arg); } catch (x) { console.log("  " + eid + " " + durum + "simulasyon geri dondu: " + (x.shortMessage || x.message).slice(0, 120)); process.exitCode = 1; continue; }
    const limit = (gaz * 125n) / 100n;
    if (!UYGULA) { console.log("  " + eid + " " + durum + "bekliyor, gaz " + gaz + " (limit " + limit + ")"); continue; }
    /* HyperEVM: this deployer is on big blocks, with their own legacy price */
    const ek = id === 999 ? { type: 0, gasPrice: (BigInt(await p.send("eth_bigBlockGasPrice", [])) * 12n) / 10n } : {};
    const t = await e.lzReceive(...arg, { gasLimit: limit, ...ek });
    const r = await t.wait();
    console.log("  " + eid + " " + (r.status === 1 ? "TESLIM " : "GERI DONDU ") + t.hash + "  gaz " + r.gasUsed);
    if (r.status !== 1) process.exitCode = 1;
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
