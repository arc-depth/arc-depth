"use strict";
/* ===========================================================================
 * genesis-canli.js — GENESIS researches what its knowledge does not cover:
 * a specific token, contract, protocol or chain, looked up live in free,
 * keyless public data at question time.
 *
 *   node scripts/genesis-canli.js <term or address> [...]
 *
 * SOURCES (public, no key, nothing paid):
 *   DexScreener  /latest/dex/search, /latest/dex/tokens/<address>
 *                pairs: chain, dex, price, liquidity, 24h volume and trades,
 *                creation time; several contracts under one symbol are
 *                reported as copies, the first created first
 *   DefiLlama    /protocols (cached 6 h), /v2/chains: TVL and its change
 * Only the looked-up term leaves this machine; no bot data, wallet or
 * position is ever part of a query.
 * =========================================================================== */
const path = require("path");
const fs = require("fs");
const koruma = require("./genesis-koruma");

const ONBELLEK = path.join(__dirname, "..", "ozel", "genesis-bilgi", "llama-protocols.json");
const SAAT = 3600e3;

async function getJson(url, ms = 15000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}

const usd = (x) => {
  const n = Number(x);
  if (!isFinite(n)) return "n/a";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + (n >= 1 ? n.toFixed(2) : n.toPrecision(3));
};
const yuzde = (x) => (x == null || !isFinite(x) ? "n/a" : (x >= 0 ? "+" : "") + Number(x).toFixed(1) + "%");
const tarih = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "unknown");
const simdi = () => new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

const ADRES = /\b0x[0-9a-fA-F]{40}\b|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const adresler = (s) => [...new Set(String(s).match(ADRES) || [])].filter((a) => a.startsWith("0x") || /[0-9]/.test(a));

function ciftSatiri(p) {
  const t = p.txns && p.txns.h24 ? p.txns.h24.buys + " buys / " + p.txns.h24.sells + " sells" : "n/a";
  return p.baseToken.symbol.slice(0, 20) + "/" + (p.quoteToken.symbol || "").slice(0, 12) + " on " + p.chainId + " (" + p.dexId + ")" +
    ": price " + usd(p.priceUsd) + ", liquidity " + usd(p.liquidity && p.liquidity.usd) + ", 24h volume " + usd(p.volume && p.volume.h24) +
    ", 24h trades " + t + ", 24h price " + yuzde(p.priceChange && p.priceChange.h24) +
    (p.fdv ? ", FDV " + usd(p.fdv) : "") + ", pool created " + tarih(p.pairCreatedAt) + ", token " + p.baseToken.address;
}

/* pairs of one token, deepest first */
function tokenOzeti(baslik, ciftler, kaynak) {
  const s = ciftler.slice().sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
  const metin = s.slice(0, 4).map(ciftSatiri).join("\n") + (s.length > 4 ? "\n(" + (s.length - 4) + " more pools)" : "");
  return { baslik, metin, kaynak };
}

async function adresAra(a) {
  const d = await getJson("https://api.dexscreener.com/latest/dex/tokens/" + a);
  const c = (d.pairs || []).filter((p) => p.baseToken.address.toLowerCase() === a.toLowerCase() || p.quoteToken.address.toLowerCase() === a.toLowerCase());
  if (!c.length) return [{ baslik: "Contract " + a, metin: "No trading pool for this contract is listed on DexScreener.", kaynak: "DexScreener, " + simdi() }];
  return [tokenOzeti("Live market data for contract " + a, c, "DexScreener, " + simdi())];
}

async function sembolAra(terim) {
  const d = await getJson("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(terim));
  const t = terim.toLowerCase().replace(/^\$/, "");
  const eslesen = (d.pairs || []).filter((p) => p.baseToken.symbol.toLowerCase() === t || p.baseToken.name.toLowerCase() === t);
  if (!eslesen.length) return [];
  // one symbol, many contracts: report the copies, the first created first
  const tokenler = new Map();
  for (const p of eslesen) {
    const k = p.chainId + ":" + p.baseToken.address.toLowerCase();
    if (!tokenler.has(k)) tokenler.set(k, []);
    tokenler.get(k).push(p);
  }
  const ilk = (c) => Math.min(...c.map((p) => p.pairCreatedAt || Infinity));
  const derin = (c) => c.reduce((s, p) => s + ((p.liquidity && p.liquidity.usd) || 0), 0);
  const sirali = [...tokenler.values()].sort((a, b) => derin(b) - derin(a));
  const out = [tokenOzeti("Live market data for " + terim + (sirali.length > 1 ? " (deepest of " + sirali.length + " contracts)" : ""), sirali[0], "DexScreener search, " + simdi())];
  if (sirali.length > 1) {
    const zaman = [...tokenler.values()].sort((a, b) => ilk(a) - ilk(b));
    out.push({
      baslik: "Contracts using the name " + terim,
      metin: sirali.length + " different contracts trade under '" + terim + "' in this search sample. Earliest pools first:\n" +
        zaman.slice(0, 6).map((c) => "- " + c[0].chainId + " " + c[0].baseToken.address + ": first pool " + tarih(ilk(c)) + ", liquidity " + usd(derin(c))).join("\n"),
      kaynak: "DexScreener search, " + simdi(),
    });
  }
  return out;
}

async function protokoller() {
  try { if (Date.now() - fs.statSync(ONBELLEK).mtimeMs < 6 * SAAT) return JSON.parse(fs.readFileSync(ONBELLEK, "utf8")); } catch (e) { /* refetch */ }
  const ham = await getJson("https://api.llama.fi/protocols", 40000);
  const kisa = ham.map((p) => ({ name: p.name, symbol: p.symbol, category: p.category, chains: p.chains, tvl: p.tvl, c1: p.change_1d, c7: p.change_7d, mcap: p.mcap }));
  fs.mkdirSync(path.dirname(ONBELLEK), { recursive: true });
  fs.writeFileSync(ONBELLEK, JSON.stringify(kisa));
  return kisa;
}

async function protokolAra(terim) {
  const t = terim.toLowerCase();
  const p = (await protokoller()).filter((x) => x.name.toLowerCase() === t || (x.symbol && x.symbol.toLowerCase() === t) || x.name.toLowerCase().startsWith(t + " "));
  return p.sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).slice(0, 3).map((x) => ({
    baslik: "DeFi protocol " + x.name,
    metin: x.name + " (" + x.category + "): TVL " + usd(x.tvl) + ", 1-day " + yuzde(x.c1) + ", 7-day " + yuzde(x.c7) +
      (x.mcap ? ", market cap " + usd(x.mcap) : "") + ". Chains: " + (x.chains || []).slice(0, 12).join(", ") + ((x.chains || []).length > 12 ? " and " + (x.chains.length - 12) + " more" : "") + ".",
    kaynak: "DefiLlama, " + simdi(),
  }));
}

async function zincirAra(terim) {
  const t = terim.toLowerCase();
  const z = (await getJson("https://api.llama.fi/v2/chains")).find((x) => x.name.toLowerCase() === t || (x.tokenSymbol && x.tokenSymbol.toLowerCase() === t));
  if (!z) return [];
  return [{ baslik: "Chain " + z.name, metin: z.name + " total DeFi TVL " + usd(z.tvl) + (z.tokenSymbol ? ", native token " + z.tokenSymbol : "") + ".", kaynak: "DefiLlama, " + simdi() }];
}

/* a chain from our registry (zincirler.js key) -> its DefiLlama TVL */
const LLAMA_AD = { bsc: "BSC", hyperevm: "Hyperliquid L1", robinhood: "Robinhood Chain", ethereum: "Ethereum" };
async function zincirTvl(k) {
  for (const ad of [LLAMA_AD[k], k].filter(Boolean)) { const r = await zincirAra(ad); if (r.length) return r; }
  return [];
}

/* terms: names the model pulled out of the question; addresses are found
   here. Every source is tried, a failing one is skipped, never invented. */
async function arastir(soru, terimler = []) {
  const isler = [];
  // ARC PULSE's own addresses are never looked up (genesis-koruma.js)
  for (const a of adresler(soru).filter((x) => !koruma.kendiMi(x)).slice(0, 3)) isler.push(adresAra(a));
  for (const t of [...new Set(terimler.map((x) => x.trim()).filter((x) => x.length >= 2 && x.length <= 40 && !koruma.kendiMi(x)))].slice(0, 4)) {
    isler.push(zincirAra(t), protokolAra(t), sembolAra(t));
  }
  const r = await Promise.allSettled(isler);
  return r.filter((x) => x.status === "fulfilled").flatMap((x) => x.value).slice(0, 8);
}

module.exports = { arastir, adresler, zincirTvl };

if (require.main === module) {
  arastir(process.argv.slice(2).join(" "), process.argv.slice(2)).then((r) => {
    if (!r.length) return console.log("(canli veri bulunamadi)");
    for (const x of r) console.log("## " + x.baslik + "\n" + x.metin + "\n(" + x.kaynak + ")\n");
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
