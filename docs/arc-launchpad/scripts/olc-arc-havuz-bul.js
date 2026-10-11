"use strict";
/* ===========================================================================
 * olc-arc-havuz-bul.js — find the PoolKey for a pool you already know the
 *                        id of, without scanning the chain.
 *
 *   node scripts/olc-arc-havuz-bul.js --dosya dogrula.txt
 *
 * Input lines: <token> <symbol> <poolId> <pairCreatedAtMs>
 *
 * WHY THIS AND NOT THE FULL SCAN
 *   The full scan works and takes hours, and in the meantime an incomplete
 *   index is worse than none: for ARCMAN it picked a pool charging 70.13%,
 *   and after that was excluded it picked a thin one that filled a $0.50
 *   buy forty times below the market price. A token whose real pool has not
 *   been reached yet does not come back "unknown" — it comes back wrong.
 *
 *   But the real pool's id is published. A price site cannot turn that hash
 *   back into a PoolKey, and neither can anyone else, so the id alone is
 *   useless — except that the same site also publishes when the pool was
 *   created. A timestamp is a block, and a block is a few thousand logs.
 *
 *   So: estimate the block from the timestamp, read the Initialize events
 *   around it, and keep the one whose id matches. Twenty requests a token
 *   instead of four thousand windows.
 *
 * WHAT IT CANNOT DO
 *   A pool id of forty hex characters is a Uniswap v3 or v2 pair address,
 *   not a v4 pool. Five of Arc's fifteen busiest tokens trade there and
 *   this router cannot reach them at all. They are reported and skipped —
 *   quietly dropping them would leave somebody wondering why their token
 *   never appears.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const DURUM = path.join(__dirname, "..", "arc-havuz-durum.json");
const KONU = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");

const val = (ad, v) => {
  const i = process.argv.indexOf(ad);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : v;
};
const DOSYA = val("--dosya", null);
const PENCERE = Number(val("--pencere", "5000"));
const MENZIL = Number(val("--menzil", "40000"));   // how far either side to look

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(new Error("HTTP " + s.statusCode)); }
      });
    });
    r.on("error", rej);
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
const gecici = (e) => /rate limit|too many requests|429|503|timeout|ECONN|socket/i.test(String(e.message));
async function rpc(m, p) {
  let bekle = 800;
  for (;;) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 80)); return r; }
    catch (e) {
      if (!gecici(e)) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 15000);
    }
  }
}

const blokZamani = async (b) => {
  const x = await rpc("eth_getBlockByNumber", ["0x" + b.toString(16), false]);
  return x ? Number(BigInt(x.timestamp)) : null;
};

/* Which block was around at a given time. Binary search rather than a
 * block-time constant: a chain's average block time is a thing that was
 * true last month. */
async function blokBul(hedef, son) {
  let lo = 1, hi = son;
  while (lo < hi) {
    const m = Math.floor((lo + hi) / 2);
    const t = await blokZamani(m);
    if (t === null) { lo = m + 1; continue; }
    if (t < hedef) lo = m + 1; else hi = m;
  }
  return lo;
}

const oku = (d, i) => BigInt("0x" + d.slice(i * 64, (i + 1) * 64));
const adres = (t) => "0x" + t.slice(26);

(async function main() {
  if (!DOSYA) { console.log("--dosya <liste> gerekli"); process.exit(1); }
  const d = JSON.parse(fs.readFileSync(DURUM, "utf8"));
  d.havuzlar = d.havuzlar || {};
  d.dogrulanan = d.dogrulanan || {};     // token -> poolId confirmed by a price site

  const son = Number(await rpc("eth_blockNumber", []));
  const satirlar = fs.readFileSync(DOSYA, "utf8").trim().split("\n")
    .map((x) => x.trim().split(/\s+/)).filter((x) => x.length >= 3);

  console.log("HAVUZ ANAHTARI ARAMA");
  console.log("  " + satirlar.length + " token, pencere ±" + MENZIL.toLocaleString("en-US") + " blok");
  console.log("");

  let bulundu = 0, v3 = 0, yok = 0, zatenVar = 0;

  for (const [tok, sem, pair, msStr] of satirlar) {
    if (!pair || pair.length !== 66) {
      console.log("  " + sem.padEnd(9) + "v3/v2 havuzu — bu router v4 disina cikamaz");
      v3++; continue;
    }
    const anahtar = pair.toLowerCase();
    if (d.havuzlar[anahtar] || d.havuzlar[pair]) {
      d.dogrulanan[tok.toLowerCase()] = anahtar;
      console.log("  " + sem.padEnd(9) + "zaten taramada var");
      zatenVar++; continue;
    }
    if (!msStr) { console.log("  " + sem.padEnd(9) + "kurulus zamani verilmemis, atlandi"); yok++; continue; }

    const saniye = Math.floor(Number(msStr) / 1000);
    const tahmin = await blokBul(saniye, son);

    let found = null;
    for (let off = 0; off <= MENZIL && !found; off += PENCERE) {
      /* Outward from the estimate: the block a timestamp maps to is close,
         and the event is usually in the first window. */
      for (const [bas, bit] of [[tahmin + off, tahmin + off + PENCERE],
                                [tahmin - off - PENCERE, tahmin - off]]) {
        if (bit < 1 || bas > son) continue;
        let ls;
        try {
          ls = await rpc("eth_getLogs", [{
            address: PM, topics: [KONU],
            fromBlock: "0x" + Math.max(1, bas).toString(16),
            toBlock: "0x" + Math.min(son, bit).toString(16)
          }]);
        } catch (e) { continue; }
        for (const l of ls) {
          if (String(l.topics[1]).toLowerCase() !== anahtar) continue;
          const data = l.data.slice(2);
          found = {
            id: l.topics[1],
            c0: adres(l.topics[2]).toLowerCase(),
            c1: adres(l.topics[3]).toLowerCase(),
            fee: Number(oku(data, 0)),
            spacing: Number(BigInt.asIntN(24, oku(data, 1))),
            hooks: ("0x" + data.slice(2 * 64 + 24, 3 * 64)).toLowerCase(),
            blok: parseInt(l.blockNumber, 16)
          };
          break;
        }
        if (found) break;
      }
    }

    if (found) {
      d.havuzlar[found.id] = found;
      d.dogrulanan[tok.toLowerCase()] = found.id.toLowerCase();
      console.log("  " + sem.padEnd(9) + "BULUNDU  ucret %" + (found.fee / 10000).toFixed(2) +
        "  spacing=" + found.spacing + "  hook=" + found.hooks.slice(0, 10) +
        "  blok=" + found.blok.toLocaleString("en-US"));
      bulundu++;
    } else {
      console.log("  " + sem.padEnd(9) + "bulunamadi (tahmin blok " + tahmin.toLocaleString("en-US") + ")");
      yok++;
    }
    fs.writeFileSync(DURUM, JSON.stringify(d));
  }

  fs.writeFileSync(DURUM, JSON.stringify(d));
  console.log("");
  console.log("  bulundu " + bulundu + "   zaten vardi " + zatenVar +
    "   bulunamadi " + yok + "   v4 disi " + v3);
  console.log("  dogrulanan toplam: " + Object.keys(d.dogrulanan).length);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
