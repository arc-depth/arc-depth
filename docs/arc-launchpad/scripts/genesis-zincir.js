"use strict";
/* ===========================================================================
 * genesis-zincir.js — GENESIS reads the 12 chains directly: current state of
 * a chain, and what an address is, straight from public RPCs (no indexer,
 * no key, nothing paid).
 *
 *   node scripts/genesis-zincir.js durum base solana aptos sui
 *   node scripts/genesis-zincir.js adres <0x… | base58>
 *
 * EVM (9, through zincirler.js saglayici with backup RPCs): latest block, its
 *   age, base fee, block fullness, the cost of a plain transfer in the gas
 *   token; an address: contract or wallet on each chain, native balance and
 *   transaction count, ERC-20 name/symbol/decimals/supply when it is a token.
 * Solana / Aptos / Sui: latest slot / version / checkpoint and the network's
 *   own fee figure; a Solana address: owner program, and for a mint its
 *   supply and whether anyone can still mint or freeze.
 * ARC PULSE's own addresses are never looked up (genesis-koruma.js).
 * =========================================================================== */
const { EVM, saglayici } = require("./zincirler");
const koruma = require("./genesis-koruma");

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const APTOS_API = "https://api.mainnet.aptoslabs.com/v1";
const SUI_RPC = "https://sui-rpc.publicnode.com";

/* every way a question may name a chain */
const TAKMA = {
  arc: ["arc"], robinhood: ["robinhood", "robinhood chain", "rhc"], base: ["base"], arbitrum: ["arbitrum", "arb"],
  ethereum: ["ethereum", "eth mainnet", "mainnet ethereum"], bsc: ["bsc", "bnb", "bnb chain", "binance smart chain", "binance"],
  avalanche: ["avalanche", "avax"], monad: ["monad"], hyperevm: ["hyperevm", "hyperliquid", "hype"],
  solana: ["solana", "sol"], aptos: ["aptos", "apt"], sui: ["sui"],
};
function zincirleriBul(metin, adlar = []) {
  const t = " " + [metin, ...adlar].join(" ").toLowerCase().replace(/[^a-z0-9 ]/g, " ") + " ";
  return Object.keys(TAKMA).filter((k) => TAKMA[k].some((a) => t.includes(" " + a + " ")));
}

const zaman = (ms) => new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms));
const sinirli = (p, ms = 9000) => Promise.race([p, zaman(ms)]);
const simdi = () => new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
const gwei = (w) => (Number(w) / 1e9).toPrecision(3) + " gwei";
async function rpc(url, method, params = []) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(9000), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(method + ": " + j.error.message);
  return j.result;
}

async function evmDurum(k) {
  const z = EVM[k], p = saglayici(k);
  const b = await sinirli(p.getBlock("latest"));
  const yas = Math.max(0, Math.round(Date.now() / 1000 - b.timestamp));
  // some chains (BNB) keep the base fee at 0 and price by gas price instead
  const taban = b.baseFeePerGas ? b.baseFeePerGas : (await sinirli(p.getFeeData())).gasPrice;
  const transfer = Number(taban) * 21000 / 1e18;
  return {
    baslik: z.ad + " chain state now",
    metin: z.ad + " (chain id " + z.chainId + "): latest block " + b.number + ", produced " + yas + " s ago; base fee " + gwei(taban) +
      "; block " + (Number(b.gasUsed) * 100 / Number(b.gasLimit)).toFixed(1) + "% full (" + b.transactions.length + " transactions)" +
      "; a plain " + z.gaz + " transfer (21,000 gas) costs " + transfer.toPrecision(3) + " " + z.gaz + " at this base fee" + (z.gazUsdc ? " (gas is paid in USDC on Arc)" : "") + ".",
    kaynak: z.ad + " RPC, " + simdi(),
  };
}

async function solanaDurum() {
  const [slot, ep, ucret] = await Promise.all([rpc(SOLANA_RPC, "getSlot"), rpc(SOLANA_RPC, "getEpochInfo"), rpc(SOLANA_RPC, "getRecentPrioritizationFees").catch(() => [])]);
  const u = ucret.map((x) => x.prioritizationFee).sort((a, b) => a - b);
  const med = u.length ? u[Math.floor(u.length / 2)] : null;
  return { baslik: "Solana chain state now", metin: "Solana: slot " + slot + ", epoch " + ep.epoch + " (" + (ep.slotIndex * 100 / ep.slotsInEpoch).toFixed(1) + "% through). Base fee 5,000 lamports per signature" +
    (med != null ? "; median recent priority fee " + med + " micro-lamports per compute unit" : "") + ".", kaynak: "Solana RPC, " + simdi() };
}

async function aptosDurum() {
  const [l, g] = await Promise.all([fetch(APTOS_API, { signal: AbortSignal.timeout(9000) }).then((r) => r.json()), fetch(APTOS_API + "/estimate_gas_price", { signal: AbortSignal.timeout(9000) }).then((r) => r.json())]);
  return { baslik: "Aptos chain state now", metin: "Aptos: ledger version " + l.ledger_version + ", block height " + l.block_height + ", epoch " + l.epoch + "; estimated gas unit price " + g.gas_estimate + " octas (prioritized " + g.prioritized_gas_estimate + ").", kaynak: "Aptos fullnode API, " + simdi() };
}

async function suiDurum() {
  const [c, g] = await Promise.all([rpc(SUI_RPC, "sui_getLatestCheckpointSequenceNumber"), rpc(SUI_RPC, "suix_getReferenceGasPrice")]);
  return { baslik: "Sui chain state now", metin: "Sui: latest checkpoint " + c + "; reference gas price " + g + " MIST.", kaynak: "Sui RPC, " + simdi() };
}

async function durum(k) {
  if (EVM[k]) return evmDurum(k);
  return { solana: solanaDurum, aptos: aptosDurum, sui: suiDurum }[k]();
}

const ERC20 = ["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)"];

async function evmAdres(a, zincirler) {
  const { Contract, formatUnits, formatEther } = require("ethers");
  const satir = await Promise.allSettled(zincirler.map(async (k) => {
    const p = saglayici(k), z = EVM[k];
    const [kod, bakiye, nonce] = await sinirli(Promise.all([p.getCode(a), p.getBalance(a), p.getTransactionCount(a)]));
    if (kod === "0x" && bakiye === 0n && nonce === 0) return null;
    if (kod === "0x") return z.ad + ": wallet, " + formatEther(bakiye) + " " + z.gaz + ", " + nonce + " transactions sent";
    const c = new Contract(a, ERC20, p);
    const t = await sinirli(Promise.all([c.name(), c.symbol(), c.decimals(), c.totalSupply()]), 6000).catch(() => null);
    return z.ad + ": contract (" + ((kod.length - 2) / 2) + " bytes)" + (t ? ", ERC-20 " + t[0] + " (" + t[1] + "), " + t[2] + " decimals, total supply " + formatUnits(t[3], t[2]) : "");
  }));
  const var_ = satir.filter((x) => x.status === "fulfilled" && x.value).map((x) => x.value);
  return { baslik: "Address " + a + " on the EVM chains", metin: var_.length ? var_.join("\n") : "No code, balance or transactions on any of the " + zincirler.length + " EVM chains checked.", kaynak: "chain RPCs, " + simdi() };
}

async function solanaAdres(a) {
  const r = await rpc(SOLANA_RPC, "getAccountInfo", [a, { encoding: "jsonParsed" }]);
  if (!r || !r.value) return { baslik: "Solana address " + a, metin: "No account exists at this address on Solana.", kaynak: "Solana RPC, " + simdi() };
  const v = r.value, d = v.data && v.data.parsed;
  let m = "Solana account owned by program " + v.owner + ", " + (v.lamports / 1e9) + " SOL" + (v.executable ? ", an executable program" : "");
  if (d && d.type === "mint") {
    const i = d.info;
    m = "Solana token mint: supply " + (Number(i.supply) / 10 ** i.decimals) + " (" + i.decimals + " decimals); mint authority " + (i.mintAuthority ? i.mintAuthority + " (more can be minted)" : "none (supply is final)") +
      "; freeze authority " + (i.freezeAuthority ? i.freezeAuthority + " (holders can be frozen)" : "none") + ".";
  } else if (d && d.type === "account") m = "Solana token account for mint " + d.info.mint + ", owner " + d.info.owner + ", balance " + d.info.tokenAmount.uiAmountString + ".";
  return { baslik: "Solana address " + a, metin: m, kaynak: "Solana RPC, " + simdi() };
}

/* chains named in the question + addresses in it -> live entries */
async function arastir(soru, adlar = []) {
  const isler = [];
  const adresler = [...new Set(String(soru).match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || [])].filter((a) => !koruma.kendiMi(a)).slice(0, 2);
  const zincirler = zincirleriBul(soru, adlar);
  const evmZ = zincirler.filter((k) => EVM[k]);
  for (const a of adresler) {
    if (a.startsWith("0x")) isler.push(evmAdres(a, evmZ.length ? evmZ : Object.keys(EVM)));
    else if (/[0-9]/.test(a)) isler.push(solanaAdres(a));
  }
  if (!adresler.length) for (const k of zincirler.slice(0, 4)) isler.push(durum(k));
  const r = await Promise.allSettled(isler.map((x) => sinirli(x, 15000)));
  return r.filter((x) => x.status === "fulfilled" && x.value).map((x) => x.value);
}

module.exports = { arastir, zincirleriBul, durum };

if (require.main === module) {
  const [k, ...rest] = process.argv.slice(2);
  const is = k === "durum" ? Promise.all(rest.map(durum)) : k === "adres" ? arastir(rest.join(" ")) : Promise.reject(new Error("kullanim: durum <zincir..> | adres <adres>"));
  is.then((r) => { for (const x of r) console.log("## " + x.baslik + "\n" + x.metin + "\n(" + x.kaynak + ")\n"); }).catch((e) => { console.error(e.message); process.exit(1); });
}
