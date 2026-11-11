/* radar.js — launchpad volumes on our thirteen chains, shared by Market (its Launchpads tab) and Warp:
   DefiLlama's Launchpad category, and Elysium's launchpads measured here from its chain records. */
import { ELYSIUM } from "./elysium.js";

const GECKO = "https://api.geckoterminal.com/api/v2";

/* ---- DefiLlama's Launchpad category, with each launchpad's 24 h / 30 d volume broken down by chain ---- */
const LLAMA = "https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
let lpOnbellek = null;
export async function lpVeri() {
  if (lpOnbellek && Date.now() - lpOnbellek.t < 600_000) return lpOnbellek.v;
  const r = await fetch(LLAMA).catch(() => null);
  if (!r || !r.ok) { if (lpOnbellek) return lpOnbellek.v; throw new Error("Launchpad volumes are unavailable right now, try again in a minute."); }
  const j = await r.json();
  const v = (j.protocols || []).filter((p) => p.category === "Launchpad").map((p) => ({
    ad: p.displayName || p.name, logo: p.logo, slug: p.slug, degisim: p.change_1d,
    g24: p.breakdown24h || {}, g30: p.breakdown30d || {},
  }));
  lpOnbellek = { t: Date.now(), v };
  return v;
}
/* the sum of a breakdown ({chain: {protocol: usd}}) over the chains asked */
export const topla = (b, anahtarlar) => anahtarlar.reduce((s, k) => s + Object.values(b[k] || {}).reduce((x, y) => x + Number(y || 0), 0), 0);

/* ---- Elysium launchpads, measured here: the busiest v4 pools (GeckoTerminal), each pool's hook from its
   Initialize record on Elysium's PoolManager, volume summed per hook. Hook names are the ones identified
   from the launchpads' own tokens (e/acc on Ascend, TESTICLES on Montra, VOLTA on Volta). ---- */
const ELY_PM = "0xe2e105d3f7209a9da11f83ccf3e7398a753823f1";
const ELY_INIT = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";   // Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)
export const ELY_HOOK = { "0xe0def4221b9840a610d4e7d55812a79a6431a8ec": "Ascend", "0x6b1216a40b65c83e9c9e18a562c446697b8cf8ec": "Montra", "0x3ab88ddc3cf2a012af88b60828edb4553697e5dc": "Volta" };
let elyOnbellek = null;
export async function elysiumLaunchpadlari() {
  if (elyOnbellek && Date.now() - elyOnbellek.t < 300_000) return elyOnbellek.v;
  const havuz = [];
  for (let s = 1; s <= 3; s++) {
    const r = await fetch(GECKO + "/networks/elysium/pools?sort=h24_volume_usd_desc&page=" + s, { headers: { accept: "application/json" } }).catch(() => null);
    if (!r || !r.ok) { if (havuz.length) break; throw new Error("The market data service is busy, try again in a minute."); }
    const j = await r.json();
    for (const p of j.data || []) if (p.relationships.dex.data.id === "uniswap-v4-elysium") {
      /* GeckoTerminal misprices some young Elysium pools (billions of "volume" from a dozen trades); a pool counts only
         with real activity: 50+ trades in 24 h and an average trade under $20k */
      const a = p.attributes, hacim = Number((a.volume_usd || {}).h24 || 0), tx = (a.transactions?.h24?.buys || 0) + (a.transactions?.h24?.sells || 0);
      if (tx < 50 || hacim / tx > 20000) continue;
      havuz.push({ id: a.address.toLowerCase(), ad: a.name.split(" / ")[0], hacim });
    }
  }
  const r = await fetch(ELYSIUM.rpc, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ address: ELY_PM, fromBlock: "0x0", toBlock: "latest", topics: [ELY_INIT, havuz.map((h) => h.id)] }] }) }).then((x) => x.json());
  if (!r.result) throw new Error("Elysium's chain record did not answer, try again in a minute.");
  const hook = new Map(r.result.map((l) => [l.topics[1].toLowerCase(), ("0x" + l.data.slice(2 + 152, 2 + 192)).toLowerCase()]));
  const g = new Map();
  for (const h of havuz) {
    const k = hook.get(h.id) || "?";
    if (!g.has(k)) g.set(k, { hook: k, ad: /^0x0+$/.test(k) ? "Plain Uniswap v4 pools" : ELY_HOOK[k] || "Unnamed launchpad", hacim: 0, n: 0, ornek: [] });
    const x = g.get(k); x.hacim += h.hacim; x.n++; if (x.ornek.length < 3 && !x.ornek.includes(h.ad)) x.ornek.push(h.ad);
  }
  /* only launchpads we have identified are ranked; unknown hooks and plain pools are not launchpads we can name */
  const v = { havuz: havuz.length, satirlar: [...g.values()].filter((x) => ELY_HOOK[x.hook]).sort((a, b) => b.hacim - a.hacim) };
  elyOnbellek = { t: Date.now(), v };
  return v;
}

