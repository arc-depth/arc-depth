"use strict";
/* ===========================================================================
 * olc-rhc-havuzlar.js — which Robinhood Stock Tokens actually have a pool,
 * and against what.
 *
 *   node scripts/olc-rhc-havuzlar.js
 *
 * WHY THIS IS A MEASUREMENT AND NOT A LIST
 *   The product buys a tokenized stock on Robinhood Chain with the
 *   customer's money. Which stocks it can offer is therefore not a matter
 *   of picking famous tickers: it is whichever ones have a pool deep enough
 *   to fill a 98-unit order without moving the price absurdly.
 *
 *   Robinhood's own documentation renders its contract table from an
 *   on-chain registry and the block explorer sits behind Cloudflare, so
 *   neither is a dependency worth having. Uniswap's own Initialize events
 *   are the primary source: a pool that exists emitted one.
 *
 * WHAT IT PRINTS
 *   Every pool whose key contains a Robinhood Stock Token, the other
 *   currency, and the stock side's balance held by the PoolManager — which
 *   is the honest proxy for depth, since v4 holds all pool reserves in one
 *   contract.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface, id, AbiCoder, getAddress, formatUnits } = require("ethers");

const RHC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // same address as on Arc
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

/* v4: Initialize(id, currency0, currency1, fee, tickSpacing, hooks, sqrtPriceX96, tick) */
const INIT_TOPIC = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RHC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(e); }
      });
    });
    r.on("error", rej);
    r.setTimeout(40000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

async function rpc(method, params) {
  let bekle = 1500;
  for (let i = 0; ; i++) {
    try { return await ham(method, params); }
    catch (e) {
      const t = String(e.message);
      /* A range that is too large is a permanent answer, not a throttle:
         retrying it wastes the budget. Caller halves the window instead. */
      if (/too large|range|limit exceeded.*block/i.test(t)) throw e;
      if (!/rate limit|429|503|timeout/i.test(t) || i >= 6) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 15000);
    }
  }
}

const erc20 = new Interface([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)"
]);

const belek = new Map();
async function tokenBilgi(adr) {
  if (belek.has(adr)) return belek.get(adr);
  const out = { adres: adr, sembol: "?", ad: "", ondalik: 18 };
  if (adr === "0x0000000000000000000000000000000000000000") {
    out.sembol = "ETH"; out.ad = "native";
  } else {
    for (const [fn, alan] of [["symbol", "sembol"], ["name", "ad"], ["decimals", "ondalik"]]) {
      try {
        const r = await rpc("eth_call", [{ to: adr, data: erc20.encodeFunctionData(fn) }, "latest"]);
        out[alan] = erc20.decodeFunctionResult(fn, r)[0];
        if (alan === "ondalik") out.ondalik = Number(out.ondalik);
      } catch (e) { /* leave the default */ }
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  belek.set(adr, out);
  return out;
}

/* Walk back from the head in windows, halving on a range complaint. */
async function olaylar(bas, son) {
  const out = [];
  let pencere = 100000;
  let ust = son;
  while (ust > bas) {
    const alt = Math.max(bas, ust - pencere + 1);
    try {
      const l = await rpc("eth_getLogs", [{
        address: PM, topics: [INIT_TOPIC],
        fromBlock: "0x" + alt.toString(16), toBlock: "0x" + ust.toString(16)
      }]);
      out.push(...l);
      process.stderr.write("\r  blok " + alt + "–" + ust + "   " + out.length + " havuz bulundu   ");
      ust = alt - 1;
    } catch (e) {
      if (pencere <= 1000) { process.stderr.write("\n  " + alt + " civarinda okunamadi, atlandi\n"); ust = alt - 1; pencere = 100000; continue; }
      pencere = Math.floor(pencere / 4);
    }
  }
  process.stderr.write("\n");
  return out;
}

(async function main() {
  console.log("ROBINHOOD CHAIN — HISSE TOKENI HAVUZLARI");
  console.log("  rpc          " + RHC);
  console.log("  PoolManager  " + PM);
  console.log("");

  const head = Number(await rpc("eth_blockNumber", []));
  /* The chain makes a block every ~100 ms, so a day is ~864,000 blocks.
     Pools are initialised once and never again, so going back far enough
     to catch the launch window matters more than recency. */
  const GERI = Number(process.env.GERI || 4000000);
  const bas = Math.max(0, head - GERI);
  console.log("  bas blok " + bas + "   son blok " + head + "   (" + GERI.toLocaleString("en-US") + " blok)");

  const logs = await olaylar(bas, head);
  console.log("  " + logs.length + " havuz olayi\n");

  const coder = AbiCoder.defaultAbiCoder();
  const havuzlar = [];
  for (const l of logs) {
    try {
      /* id, currency0, currency1 are indexed; the rest is in data. */
      const c0 = getAddress("0x" + l.topics[1].slice(26));
      const c1 = getAddress("0x" + l.topics[2].slice(26));
      const [fee, spacing, hooks] = coder.decode(["uint24", "int24", "address"], "0x" + l.data.slice(2, 2 + 64 * 3));
      havuzlar.push({ id: l.topics[0], c0, c1, fee: Number(fee), spacing: Number(spacing), hooks });
    } catch (e) { /* a malformed log is not worth the run */ }
  }

  /* Which currencies appear at all. */
  const adresler = new Set();
  for (const h of havuzlar) { adresler.add(h.c0); adresler.add(h.c1); }
  console.log("  " + adresler.size + " ayri para birimi, bilgileri okunuyor...\n");

  for (const a of adresler) await tokenBilgi(a);

  const hisseMi = (t) => /Robinhood Token/i.test(t.ad || "");
  const ilgili = havuzlar.filter((h) => hisseMi(belek.get(h.c0)) || hisseMi(belek.get(h.c1)));

  console.log("  hisse tokeni iceren havuz: " + ilgili.length + " / " + havuzlar.length);
  console.log("");

  /* Depth: the PoolManager holds every pool's reserves, so a stock's
     balance there is the ceiling on what all its pools together can fill.
     It is an upper bound, not a per-pool figure, and is labelled as such. */
  const stoklar = new Map();
  for (const h of ilgili) {
    const s = hisseMi(belek.get(h.c0)) ? belek.get(h.c0) : belek.get(h.c1);
    const diger = hisseMi(belek.get(h.c0)) ? belek.get(h.c1) : belek.get(h.c0);
    if (!stoklar.has(s.adres)) stoklar.set(s.adres, { t: s, esler: new Set(), havuz: 0, bakiye: null });
    const e = stoklar.get(s.adres);
    e.esler.add(diger.sembol);
    e.havuz++;
  }

  for (const [adr, e] of stoklar) {
    try {
      const r = await rpc("eth_call", [{ to: adr, data: erc20.encodeFunctionData("balanceOf", [PM]) }, "latest"]);
      e.bakiye = erc20.decodeFunctionResult("balanceOf", r)[0];
    } catch (err) { /* reported as unknown */ }
    await new Promise((r) => setTimeout(r, 150));
  }

  const sirali = [...stoklar.values()].sort((a, b) =>
    Number(b.bakiye || 0n) - Number(a.bakiye || 0n));

  console.log("  sembol    havuz  esler                 PoolManager'daki bakiye (ust sinir)");
  console.log("  ------    -----  --------------------  ----------------------------------");
  for (const e of sirali.slice(0, 30)) {
    console.log("  " + (e.t.sembol || "?").padEnd(9) +
      String(e.havuz).padStart(4) + "   " +
      [...e.esler].join(",").slice(0, 20).padEnd(21) +
      (e.bakiye === null ? "okunamadi" : Number(formatUnits(e.bakiye, e.t.ondalik)).toLocaleString("en-US", { maximumFractionDigits: 2 })));
  }

  const cikti = sirali.map((e) => ({
    sembol: e.t.sembol, adres: e.t.adres, ad: e.t.ad,
    havuzSayisi: e.havuz, esler: [...e.esler],
    poolManagerBakiye: e.bakiye === null ? null : e.bakiye.toString()
  }));
  fs.writeFileSync(path.join(__dirname, "..", "rhc-hisseler.json"),
    JSON.stringify({ zaman: new Date().toISOString(), basBlok: bas, sonBlok: head,
      usdg: USDG, weth: WETH, poolManager: PM, hisseler: cikti }, null, 1));
  console.log("");
  console.log("  rhc-hisseler.json yazildi (" + cikti.length + " hisse)");
})().catch((e) => { console.log("\nHATA: " + e.message); process.exit(1); });
