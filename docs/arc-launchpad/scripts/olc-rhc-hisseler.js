"use strict";
/* ===========================================================================
 * olc-rhc-hisseler.js — which Robinhood Stock Tokens we can actually buy,
 * and where.
 *
 *   node scripts/olc-rhc-hisseler.js
 *
 * The product buys a tokenized share on Robinhood Chain with the
 * customer's money, so the offerable list is not a matter of picking
 * famous tickers. It is whichever shares have an ETH pool deep enough to
 * fill a hundred-dollar order without moving the price.
 *
 * Primary source is Uniswap's own Initialize events: a pool that exists
 * emitted one. Robinhood's documentation renders its table from an
 * on-chain registry and the block explorer sits behind Cloudflare, so
 * neither is a dependency worth having.
 *
 * Depth is read as the PoolManager's balance of the token. In v4 every
 * pool's reserves live in that one contract, so this is the ceiling on
 * what all of a token's pools together could fill — an upper bound,
 * labelled as one.
 *
 * Writes rhc-hisseler.json.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface, id, AbiCoder, getAddress, formatUnits } = require("ethers");

const RHC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const ETH = "0x0000000000000000000000000000000000000000";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const ADIM = 10000000; // the node's ceiling is 10,000,000 blocks per query

/* How far in to look for official listings. Everything past this is
 * overwhelmingly memecoins paired against ether, and including it took
 * the candidate set from a few hundred to 22,345. Override with
 * SON_BLOK=... to widen it. */
const SON_BLOK = Number(process.env.SON_BLOK || 15000000);

/* A known Robinhood Stock Token. Every one of them is a beacon proxy of
 * the same beacon, so their deployed code is identical and a candidate
 * can be identified by code alone — no name call, no registry, nothing
 * anybody can change out from under us. */
const ORNEK_HISSE = "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9"; // AAPL

const TOPIC = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const pad = (a) => "0x" + "0".repeat(24) + a.slice(2).toLowerCase();

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
    r.setTimeout(60000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

async function rpc(method, params) {
  let bekle = 1500;
  for (let i = 0; ; i++) {
    try { return await ham(method, params); }
    catch (e) {
      /* A range complaint is a permanent answer, not a throttle. */
      /* Range and result-count complaints are permanent answers about the
       * query, not throttling. The caller narrows the window. */
      if (/spans|exceed|too large|limit of/i.test(String(e.message))) throw e;
      /* This node says "Too Many Requests" rather than "rate limit", and
       * not matching it meant whole block ranges were skipped as if they
       * were unreadable — losing pools silently. */
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 25000);
    }
  }
}

const erc = new Interface([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)"
]);

async function oku(adr, fn, args = []) {
  const r = await rpc("eth_call", [{ to: adr, data: erc.encodeFunctionData(fn, args) }, "latest"]);
  return erc.decodeFunctionResult(fn, r)[0];
}

(async function main() {
  console.log("ROBINHOOD CHAIN — ALINABILIR HISSELER");
  console.log("  rpc " + RHC);
  console.log("");

  const zincirBasi = Number(await rpc("eth_blockNumber", []));
  const head = Math.min(zincirBasi, SON_BLOK);
  console.log("  zincir " + zincirBasi.toLocaleString("en-US") + " blokta");
  console.log("  taranan aralik 0 – " + head.toLocaleString("en-US") + "  (resmi listelemeler burada)");

  const ornekKod = await rpc("eth_getCode", [ORNEK_HISSE, "latest"]);
  console.log("  ornek hisse kodu " + ((ornekKod.length - 2) / 2) + " bayt");

  const coder = AbiCoder.defaultAbiCoder();
  const aday = new Map(); // token -> { esler:Set, havuz:n, ornekAnahtar }

  /* ETH and WETH both sort below every stock token's address, so in each
   * pair the stock is currency1. Filtering on currency0 keeps the queries
   * small and precise. */
  for (const [esAd, es] of [["ETH", ETH], ["WETH", WETH]]) {
    let n = 0;
    let pencere = ADIM;
    let alt = 0;
    while (alt <= head) {
      const ust = Math.min(head, alt + pencere - 1);
      let l;
      try {
        l = await rpc("eth_getLogs", [{
          address: PM, topics: [TOPIC, null, pad(es)],
          fromBlock: "0x" + alt.toString(16), toBlock: "0x" + ust.toString(16)
        }]);
      } catch (err) {
        /* The node caps a query at 10,000 logs. That is not a gap in the
         * chain, it is a window that is too wide — so narrow it rather
         * than skip the blocks, which would silently lose pools. */
        if (/limit of|spans|exceed|too large/i.test(String(err.message)) && pencere > 2000) {
          pencere = Math.floor(pencere / 4);
          continue;
        }
        console.log("    " + alt + "-" + ust + " okunamadi: " + String(err.message).slice(0, 70));
        alt = ust + 1;
        continue;
      }
      n += l.length;
      {
        for (const x of l) {
          const tok = getAddress("0x" + x.topics[3].slice(26));
          const d = coder.decode(["uint24", "int24", "address", "uint160", "int24"], x.data);
          if (!aday.has(tok)) aday.set(tok, { esler: new Set(), havuz: 0, anahtarlar: [] });
          const e = aday.get(tok);
          e.esler.add(esAd);
          e.havuz++;
          /* Only hookless pools are worth recording: a hook can refuse our
           * swap for reasons we cannot see from here. */
          if (d[2] === ETH) {
            e.anahtarlar.push({ es, esAd, fee: Number(d[0]), spacing: Number(d[1]), hooks: d[2] });
          }
        }
      }
      /* Room to grow again once past a dense stretch. */
      if (l.length < 4000 && pencere < ADIM) pencere = Math.min(ADIM, pencere * 2);
      alt = ust + 1;
      process.stderr.write("\r  " + esAd + "  blok " + ust.toLocaleString("en-US") +
        "   " + n + " havuz, " + aday.size + " token   ");
      await new Promise((r) => setTimeout(r, 120));
    }
    process.stderr.write("\n");
    console.log("  " + esAd + " ciftli havuz: " + n + "   ayri token: " + aday.size);
  }

  console.log("");
  console.log("  " + aday.size + " aday, kodlari karsilastiriliyor...");

  const hisseler = [];
  let bakilan = 0;
  for (const [tok, e] of aday) {
    bakilan++;
    /* Code first: one call, and it eliminates almost everything. */
    let kod;
    try { kod = await rpc("eth_getCode", [tok, "latest"]); }
    catch (err) { continue; }
    if (kod !== ornekKod) continue;

    let ad = "", sembol = "", ondalik = 18;
    try { ad = await oku(tok, "name"); } catch (err) { continue; }
    if (!/Robinhood Token/i.test(ad)) continue;
    try { sembol = await oku(tok, "symbol"); } catch (err) { sembol = "?"; }
    try { ondalik = Number(await oku(tok, "decimals")); } catch (err) { /* 18 */ }
    let bakiye = null;
    try { bakiye = await oku(tok, "balanceOf", [PM]); } catch (err) { /* unknown */ }
    hisseler.push({
      sembol, ad, adres: tok, ondalik,
      havuzSayisi: e.havuz,
      esler: [...e.esler],
      hooksuzAnahtarlar: e.anahtarlar.filter((k) => k.hooks === ETH),
      pmBakiye: bakiye === null ? null : bakiye.toString()
    });
    await new Promise((r) => setTimeout(r, 120));
  }

  hisseler.sort((a, b) => {
    const x = a.pmBakiye === null ? 0 : Number(formatUnits(a.pmBakiye, a.ondalik));
    const y = b.pmBakiye === null ? 0 : Number(formatUnits(b.pmBakiye, b.ondalik));
    return y - x;
  });

  console.log("  " + bakilan + " adaydan " + hisseler.length + " tanesi Robinhood hisse tokeni");
  console.log("");
  console.log("  sembol    havuz  hooksuz  PoolManager bakiyesi (adet)");
  console.log("  ------    -----  -------  ---------------------------");
  for (const h of hisseler.slice(0, 30)) {
    const b = h.pmBakiye === null ? "okunamadi"
      : Number(formatUnits(h.pmBakiye, h.ondalik)).toLocaleString("en-US", { maximumFractionDigits: 2 });
    console.log("  " + (h.sembol || "?").padEnd(9) + String(h.havuzSayisi).padStart(4) + "   " +
      String(h.hooksuzAnahtarlar.length).padStart(5) + "    " + b);
  }

  fs.writeFileSync(path.join(__dirname, "..", "rhc-hisseler.json"), JSON.stringify({
    zaman: new Date().toISOString(), sonBlok: head,
    poolManager: PM, eth: ETH, weth: WETH, hisseler
  }, null, 1));
  console.log("");
  console.log("  rhc-hisseler.json yazildi (" + hisseler.length + " hisse)");
})().catch((e) => { console.log("\nHATA: " + e.message); process.exit(1); });
