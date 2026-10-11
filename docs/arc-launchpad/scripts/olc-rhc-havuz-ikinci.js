"use strict";
/* ===========================================================================
 * olc-rhc-havuz-ikinci.js — every ETH pool of every known stock token.
 *
 *   node scripts/olc-rhc-havuz-ikinci.js
 *
 * The discovery scan conflated two different searches and got the second
 * one wrong.
 *
 *   Finding the TOKENS only needs the chain's early blocks: the official
 *   Stock Tokens were listed when it opened, and scanning further buries
 *   them in 22,000 memecoins.
 *
 *   Finding a token's POOLS needs the whole chain, because people keep
 *   opening them. AAPL's best pool — the one that fills a buy 8% better
 *   than any other — sits at block 63.6M, far past where discovery stops.
 *   Using the discovery scan's pool list picked a worse venue and would
 *   have quietly cost every customer the difference.
 *
 * So this is a second pass: for each token already found, a filtered query
 * across the full chain. Filtering on both currencies keeps each query
 * small enough that the node's 10,000-log cap is never near.
 *
 * Updates rhc-hisseler.json in place.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { id, AbiCoder, getAddress } = require("ethers");

const RHC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const ETH = "0x0000000000000000000000000000000000000000";
const ADIM = 10000000;

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
  let bekle = 2000;
  for (let i = 0; ; i++) {
    try { return await ham(method, params); }
    catch (e) {
      const t = String(e.message);
      if (/limit of|spans|exceed|too large/i.test(t)) throw e;
      if (!/rate limit|too many requests|429|503|timeout/i.test(t) || i >= 8) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 25000);
    }
  }
}

(async function main() {
  const P = path.join(__dirname, "..", "rhc-hisseler.json");
  const J = JSON.parse(fs.readFileSync(P, "utf8"));
  const hisseler = J.hisseler || [];
  if (!hisseler.length) { console.log("rhc-hisseler.json bos — once olc-rhc-hisseler.js"); process.exit(1); }

  const head = Number(await rpc("eth_blockNumber", []));
  console.log("TOKEN BASINA TAM ZINCIR HAVUZ TARAMASI");
  console.log("  " + hisseler.length + " hisse, 0 – " + head.toLocaleString("en-US"));
  console.log("");

  const coder = AbiCoder.defaultAbiCoder();
  let toplamYeni = 0;

  for (const h of hisseler) {
    const bulunan = [];
    let eksik = 0;
    for (let alt = 0; alt <= head; alt += ADIM) {
      const ust = Math.min(head, alt + ADIM - 1);
      try {
        const l = await rpc("eth_getLogs", [{
          address: PM,
          topics: [TOPIC, null, pad(ETH), pad(h.adres)],
          fromBlock: "0x" + alt.toString(16), toBlock: "0x" + ust.toString(16)
        }]);
        for (const x of l) {
          const d = coder.decode(["uint24", "int24", "address", "uint160", "int24"], x.data);
          if (d[2] !== ETH) continue;  // hooked pools can refuse us
          bulunan.push({ es: ETH, esAd: "ETH", fee: Number(d[0]), spacing: Number(d[1]), hooks: d[2],
                         blok: parseInt(x.blockNumber, 16) });
        }
      } catch (e) {
        eksik++;
      }
      await new Promise((r) => setTimeout(r, 180));
    }

    /* Keep whatever discovery already had; a pool seen once is real even
     * if a window failed this time. */
    const anahtar = (k) => k.fee + "/" + k.spacing;
    const varolan = new Map((h.hooksuzAnahtarlar || []).map((k) => [anahtar(k), k]));
    for (const k of bulunan) if (!varolan.has(anahtar(k))) varolan.set(anahtar(k), k);
    const once = (h.hooksuzAnahtarlar || []).length;
    h.hooksuzAnahtarlar = [...varolan.values()];
    toplamYeni += h.hooksuzAnahtarlar.length - once;

    console.log("  " + (h.sembol || "?").padEnd(8) +
      String(h.hooksuzAnahtarlar.length).padStart(3) + " hooksuz havuz" +
      (h.hooksuzAnahtarlar.length > once ? "   (+" + (h.hooksuzAnahtarlar.length - once) + " yeni)" : "") +
      (eksik ? "   [" + eksik + " pencere okunamadi]" : ""));
  }

  J.ikinciGecis = { zaman: new Date().toISOString(), sonBlok: head };
  fs.writeFileSync(P, JSON.stringify(J, null, 1));
  console.log("");
  console.log("  toplam " + toplamYeni + " yeni havuz bulundu, rhc-hisseler.json guncellendi");
})().catch((e) => { console.log("\nHATA: " + e.message); process.exit(1); });
