/* ===========================================================================
 * ag-okur.js — read any launch chain, not just Arc
 *
 * zincir.js talks to Arc alone (its transport is pinned to Arc's RPC). The
 * local-collateral launchpad (PulseLaunchpad3) is on six chains, so the
 * screens that list, price and redeem launches read each chain through
 * this module: one batched JSON-RPC transport per chain, the launchpad's
 * own records, the pool key the launchpad itself reports (never rebuilt
 * from constants), and the vault's two holdings.
 *
 * A chain that does not answer drops out of the result with its name in
 * `hatalar`; the screen says which chain is missing rather than showing a
 * shorter list as if it were complete.
 * =========================================================================== */
import { Interface, AbiCoder, keccak256, concat, zeroPadValue, toBeHex } from "../vendor/ethers.min.js";
import { AGLAR } from "./aglar.js";

const kod = AbiCoder.defaultAbiCoder();
let sayac = 1;

export const ABI3 = {
  launchpad: [
    "function launchCount() view returns (uint256)",
    "function launchAt(uint256) view returns ((address token, address acici, address kasa, address hedefVarlik, uint256 teminatMiktari, address kurucu, uint256 kurucuToken, uint256 teklif, uint256 vergiPpm, uint64 zaman))",
    "function havuzAnahtari(address) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))"
  ],
  kasa: [
    "function hak(address) view returns (uint256)",
    "function bakiye(address) view returns (uint256)",
    "function dolasim() view returns (uint256)",
    "function iade(uint256) returns (uint256[])"
  ],
  erc20: [
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)"
  ],
  router: [
    "function swap((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, bool zeroForOne, uint256 amountIn, uint256 minOut) payable returns (uint256)"
  ],
  extsload: ["function extsload(bytes32) view returns (bytes32)"]
};

export const launchAglari = () => AGLAR.filter((a) => a.nesil === 3);
export const agBul = (anahtar) => AGLAR.find((a) => a.anahtar === anahtar) || null;

/* Backup public RPCs, tried in order when the main one refuses. Arc's own
   RPC answers 429 as soon as a page reads several things at once (15 Oct
   2026: the GENESIS page showed Arc as "could not read" after five
   retries); both backups returned chain id 5042 with open CORS. */
const YEDEK = {
  /* the same list as scripts/zincirler.js YEDEK_RPC; every entry answered
     eth_chainId with its chain's id and allowed browser CORS on 16 Oct 2026 */
  arc: ["https://arc-mainnet.drpc.org", "https://arc-rpc.publicnode.com"],
  robinhood: ["https://robinhood.drpc.org", "https://robinhood-rpc.publicnode.com", "https://robinhood-mainnet.drpc.org"],
  base: ["https://base-rpc.publicnode.com", "https://base.drpc.org", "https://mainnet.base.org"],
  arbitrum: ["https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org", "https://arb1.arbitrum.io/rpc"],
  ethereum: ["https://eth.drpc.org"],
  bsc: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
  avalanche: ["https://avalanche.drpc.org", "https://api.avax.network/ext/bc/C/rpc"],
  monad: ["https://monad.drpc.org", "https://monad-mainnet.drpc.org"],
  hyperevm: ["https://hyperliquid.drpc.org"],
};
const sinirli = (j) => (Array.isArray(j) ? j : [j]).some((x) => x && x.error && (x.error.code === -32005 || /rate limit/i.test(x.error.message || "")));

/** One JSON-RPC request (single or batch) to a chain, falling over to its
    backup RPCs on an HTTP error, a network error or a rate-limit answer. */
export async function rpcPost(ag, govde) {
  let son = null;
  for (const url of [ag.rpc, ...(YEDEK[ag.anahtar] || [])]) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) });
      if (!r.ok) { son = new Error(ag.ad + " RPC " + r.status); continue; }
      const j = await r.json();
      if (sinirli(j)) { son = new Error(ag.ad + " RPC rate limited"); continue; }
      return j;
    } catch (e) { son = e; }
  }
  throw son || new Error(ag.ad + " RPC did not answer");
}

/** Many eth_calls on one chain, one request; null where a call failed. */
export async function cokluOku(ag, cagrilar) {
  if (!cagrilar.length) return [];
  const govde = cagrilar.map(([to, abi, ad, args]) => ({
    jsonrpc: "2.0", id: sayac++, method: "eth_call",
    params: [{ to, data: new Interface(abi).encodeFunctionData(ad, args || []) }, "latest"]
  }));
  const j = await rpcPost(ag, govde);
  const esle = new Map((Array.isArray(j) ? j : [j]).map((x) => [x.id, x]));
  return govde.map((g, i) => {
    const c = esle.get(g.id);
    if (!c || c.error || !c.result || c.result === "0x") return null;
    try {
      const d = new Interface(cagrilar[i][1]).decodeFunctionResult(cagrilar[i][2], c.result);
      return d.length === 1 ? d[0] : d;
    } catch (e) { return null; }
  });
}

/** Every launch of one chain's local-collateral launchpad. */
export async function agLaunchlari(ag) {
  const [n] = await cokluOku(ag, [[ag.launchpad, ABI3.launchpad, "launchCount"]]);
  if (n == null) throw new Error(ag.ad + ": launchCount did not answer");
  const sayi = Number(n);
  if (!sayi) return [];
  const kayitlar = await cokluOku(ag, Array.from({ length: sayi }, (_, i) => [ag.launchpad, ABI3.launchpad, "launchAt", [i]]));
  const liste = kayitlar.map((k, i) => k && {
    ag: ag.anahtar, id: i, token: k.token, acici: k.acici, kasa: k.kasa,
    hedefVarlik: k.hedefVarlik, teminatMiktari: k.teminatMiktari, kurucu: k.kurucu,
    kurucuToken: k.kurucuToken, vergiPpm: Number(k.vergiPpm), zaman: Number(k.zaman)
  }).filter(Boolean);
  /* symbols and decimals of each token and of its collateral, one batch */
  const b = await cokluOku(ag, liste.flatMap((l) => [
    [l.token, ABI3.erc20, "symbol"], [l.token, ABI3.erc20, "name"],
    [l.hedefVarlik, ABI3.erc20, "symbol"], [l.hedefVarlik, ABI3.erc20, "decimals"]
  ]));
  liste.forEach((l, i) => {
    l.sembol = b[i * 4] || "?"; l.ad = b[i * 4 + 1] || "";
    l.teminatSembol = b[i * 4 + 2] || "?";
    l.teminatOndalik = b[i * 4 + 3] == null ? 18 : Number(b[i * 4 + 3]);
  });
  return liste;
}

/** All chains at once. { liste, hatalar } — a silent chain is named. */
export async function tumLaunchlar() {
  const aglar = launchAglari();
  const sonuc = await Promise.allSettled(aglar.map(agLaunchlari));
  const liste = [], hatalar = [];
  sonuc.forEach((s, i) => s.status === "fulfilled" ? liste.push(...s.value) : hatalar.push(aglar[i].ad));
  liste.sort((a, b) => b.zaman - a.zaman);
  return { liste, hatalar };
}

/** sqrtPriceX96 of a v4 pool, from the PoolManager's storage (slot 6). */
export async function havuzFiyatiAg(ag, key) {
  const id = keccak256(kod.encode(["address", "address", "uint24", "int24", "address"],
    [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
  const yuva = keccak256(concat([id, zeroPadValue(toBeHex(6), 32)]));
  const [v] = await cokluOku(ag, [[ag.poolManager, ABI3.extsload, "extsload", [yuva]]]);
  if (v == null) return null;
  const s = BigInt(v) & ((1n << 160n) - 1n);
  return s === 0n ? null : s;
}

/** The token's price in the chain's dollar (6 decimals on every launch chain). */
export function fiyat(sqrtP, tokenSifirinci) {
  if (sqrtP == null) return null;
  const p = Number(sqrtP) / 2 ** 96;
  const oran = p * p;
  return (tokenSifirinci ? oran : 1 / oran) * 1e12;
}

export const kasif = (ag, a) => ag.kasif + "/address/" + a;
