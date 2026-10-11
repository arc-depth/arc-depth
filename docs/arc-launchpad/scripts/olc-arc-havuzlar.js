"use strict";
/* ===========================================================================
 * olc-arc-havuzlar.js — index every Uniswap v4 pool on Arc.
 *
 *   node scripts/olc-arc-havuzlar.js
 *   node scripts/olc-arc-havuzlar.js --bastan      # ignore saved progress
 *
 * WHY THIS HAS TO EXIST
 *   To trade a token through v4 you need its PoolKey — the two currencies,
 *   the fee, the tick spacing and the hook. Price sites publish the pool's
 *   id, which is the keccak of that struct and cannot be inverted, so
 *   knowing a token is trading somewhere does not tell you how to trade it.
 *
 *   Guessing was the cheap alternative and it does not work here. The first
 *   real Arc pool this looked at came back with fee 0x800000 — the dynamic
 *   fee flag — a tick spacing of 200 and a hook at 0xf0d631d5. No list of
 *   standard combinations contains that.
 *
 *   So the PoolManager's own Initialize events are the source. They carry
 *   every field, which is the whole point of them.
 *
 * HOW IT COPES WITH THE NODE
 *   Arc refuses a log query spanning more than a few thousand blocks and
 *   says "requested range too large". The window halves on that error and
 *   grows back when queries succeed, so the scan finds the limit rather
 *   than having it written down — a number in a constant is a number that
 *   is wrong after the next node upgrade.
 *
 *   Progress is written continuously. Twenty-two million blocks is half an
 *   hour of requests and a scan that cannot be resumed is a scan that has
 *   to be lucky.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDC = "0x3600000000000000000000000000000000000000";
const SIFIR = "0x0000000000000000000000000000000000000000";
const ILK_BLOK = Number(process.env.ILK_BLOK || 1948056);   // PoolManager's first block
const BASTAN = process.argv.includes("--bastan");

const DURUM = path.join(__dirname, "..", "arc-havuz-durum.json");
const CIKTI = path.join(__dirname, "..", "docs", "havuzlar.json");

const KONU = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const erc = new Interface([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)"
]);

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
    r.setTimeout(45000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

/* Two different refusals that must not be confused.
 *
 * A range error means the window was too wide and the caller should halve
 * it. A rate limit means wait. The first version matched "limit exceeded"
 * for the range case, which also matches "RATE limit exceeded" — so every
 * rate limit was read as a range error, raised immediately, and killed the
 * scan on its first query.
 *
 * Transient is checked first and the range pattern names only the thing it
 * means. */
const gecici = (e) => /rate limit|rate.?limited|too many requests|429|503|timeout|ECONN|socket|EAI_AGAIN/i
  .test(String(e.message));
const aralikHatasi = (e) => !gecici(e) &&
  /range too large|block range|query returned more than|exceed.*blocks|too many results/i
    .test(String(e.message));

/* No attempt limit on a transient error. The endpoint refuses in bursts and
 * a scan of this length will meet that many times; giving up after eight
 * tries meant dying two minutes in with nothing written. A range error is
 * different and is raised at once, because it is the caller's job to make
 * the window smaller. */
async function rpc(method, params) {
  let bekle = 1000;
  for (;;) {
    try {
      const r = await ham(method, params);
      await new Promise((x) => setTimeout(x, 120));   // pace, do not hammer
      return r;
    } catch (e) {
      if (aralikHatasi(e) || !gecici(e)) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 20000);
    }
  }
}

const oku = (d, i) => BigInt("0x" + d.slice(i * 64, (i + 1) * 64));
const adres = (t) => "0x" + t.slice(26);

function durumOku() {
  if (BASTAN) return null;
  try { return JSON.parse(fs.readFileSync(DURUM, "utf8")); } catch (e) { return null; }
}
function durumYaz(d) { fs.writeFileSync(DURUM, JSON.stringify(d, null, 1)); }

(async function main() {
  const son = Number(await rpc("eth_blockNumber", []));
  /* Backwards from the head. The pools worth trading are the recent ones,
     so the index is useful after the first window rather than after twenty
     million blocks, and stopping early costs only the oldest pools. */
  const d = durumOku() || { ust: son, havuzlar: {} };
  if (d.ust === undefined) { d.ust = son; }

  console.log("ARC HAVUZ TARAMASI   (yeniden eskiye)");
  console.log("  PoolManager  " + PM);
  console.log("  bastan       " + d.ust.toLocaleString("en-US") +
    (d.ust < son ? "   (kaldigi yerden)" : ""));
  console.log("  en eski      " + ILK_BLOK.toLocaleString("en-US"));
  console.log("  kalan        " + Math.max(0, d.ust - ILK_BLOK).toLocaleString("en-US") + " blok");
  console.log("  not: index her 25 pencerede yeniden yaziliyor — istedigin an durdurabilirsin");
  console.log("");

  let pencere = 5000;
  let sayac = 0;
  const basla = Date.now();

  while (d.ust > ILK_BLOK) {
    const bit = d.ust;
    const bas = Math.max(ILK_BLOK, bit - pencere);
    let ls;
    try {
      ls = await rpc("eth_getLogs", [{
        address: PM, topics: [KONU],
        fromBlock: "0x" + bas.toString(16), toBlock: "0x" + bit.toString(16)
      }]);
    } catch (e) {
      if (aralikHatasi(e) && pencere > 100) { pencere = Math.floor(pencere / 2); continue; }
      /* Structural, not transient — rpc() waits out everything else
         indefinitely. The progress is saved, so stopping costs the next run
         nothing but the current window. */
      console.log("\nDURDU: " + e.message);
      durumYaz(d);
      await yaz(d, son);
      process.exit(1);
    }

    for (const l of ls) {
      const data = l.data.slice(2);
      const havuz = {
        id: l.topics[1],
        c0: adres(l.topics[2]).toLowerCase(),
        c1: adres(l.topics[3]).toLowerCase(),
        fee: Number(oku(data, 0)),
        spacing: Number(BigInt.asIntN(24, oku(data, 1))),
        hooks: ("0x" + data.slice(2 * 64 + 24, 3 * 64)).toLowerCase(),
        blok: parseInt(l.blockNumber, 16)
      };
      d.havuzlar[havuz.id] = havuz;
    }

    d.ust = bas - 1;
    sayac++;
    if (sayac % 25 === 0) {
      durumYaz(d);
      await yaz(d, son);   /* usable at every step, not only at the end */
      const ilerleme = (100 * (son - bas)) / (son - ILK_BLOK);
      process.stdout.write("\r  %" + ilerleme.toFixed(1) + "   blok " +
        bas.toLocaleString("en-US") + "   havuz " +
        Object.keys(d.havuzlar).length.toLocaleString("en-US") +
        "   pencere " + pencere + "    ");
    }
    /* Grow back after a clean run: the limit the node applies is not always
       the one it applied a minute ago. */
    if (sayac % 50 === 0 && pencere < 5000) pencere = Math.min(5000, pencere * 2);
  }

  durumYaz(d);
  console.log("");
  console.log("");
  console.log("  tarama bitti: " + Object.keys(d.havuzlar).length.toLocaleString("en-US") + " havuz");
  await yaz(d, son, 100000);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });

/* Build docs/havuzlar.json out of whatever has been found so far.
 *
 * Callable at any point in the scan, which is the reason the name lookups
 * are capped: the cost of a write has to stay flat however many tokens have
 * accumulated, or the scan spends its time rewriting the file instead of
 * reading the chain. Names already found are kept in the progress file, so
 * an interrupted scan does not lose them.
 */
async function yaz(d, son, isimButcesi) {
  d.isimler = d.isimler || {};
  const butce = isimButcesi === undefined ? 20 : isimButcesi;

  /* Only pools against money: a pair of two unknown tokens is not something
     this interface can quote or route. */
  const paraliklar = Object.values(d.havuzlar).filter((h) =>
    h.c0 === USDC.toLowerCase() || h.c1 === USDC.toLowerCase() ||
    h.c0 === SIFIR || h.c1 === SIFIR);

  /* A token can have several pools. The newest is the one most likely to be
     where it actually trades. */
  const tokenler = new Map();
  for (const h of paraliklar) {
    const para = (h.c0 === USDC.toLowerCase() || h.c0 === SIFIR) ? h.c0 : h.c1;
    const tok = para === h.c0 ? h.c1 : h.c0;
    if (tok === USDC.toLowerCase() || tok === SIFIR) continue;
    const v = tokenler.get(tok);
    if (!v || h.blok > v.blok) tokenler.set(tok, { ...h, para, tok });
  }

  /* Newest first, so the budget goes to what someone is most likely to be
     looking for right now. */
  const sirali = [...tokenler.values()].sort((a, b) => b.blok - a.blok);

  /* Capped before it is written. Arc opens about a thousand pools every
     hundred thousand blocks, so the whole history runs to several megabytes
     — not something to send to a phone on mobile data. The newest are the
     ones being traded; the rest stay in the local progress file. */
  const SINIR = Number(process.env.SINIR || 3000);
  const kisa = sirali.slice(0, SINIR);

  let kalan = butce;
  for (const h of kisa) {
    if (d.isimler[h.tok]) continue;
    if (kalan-- <= 0) break;
    let sembol = null, ad = null, ondalik = 18;
    try {
      const r1 = await rpc("eth_call", [{ to: h.tok, data: erc.encodeFunctionData("symbol") }, "latest"]);
      sembol = erc.decodeFunctionResult("symbol", r1)[0];
      const r2 = await rpc("eth_call", [{ to: h.tok, data: erc.encodeFunctionData("decimals") }, "latest"]);
      ondalik = Number(erc.decodeFunctionResult("decimals", r2)[0]);
      const r3 = await rpc("eth_call", [{ to: h.tok, data: erc.encodeFunctionData("name") }, "latest"]);
      ad = erc.decodeFunctionResult("name", r3)[0];
    } catch (e) { /* a token that will not say its name is still tradeable */ }
    d.isimler[h.tok] = { sembol: sembol || "?", ad: ad || "", ondalik };
  }

  /* Positional rows and a table of distinct hooks.
     The keyed form came to 930 KB for three thousand tokens, most of it
     the same eight key names and the same hook addresses written out over
     and over — a launchpad's tokens all share one hook. This is half the
     size and carries the same information; the page expands it on load. */
  const hooklar = [];
  const hookNo = (h) => {
    let i = hooklar.indexOf(h);
    if (i < 0) { i = hooklar.length; hooklar.push(h); }
    return i;
  };
  const cikti = kisa.map((h) => {
    const i = d.isimler[h.tok] || { sembol: "?", ad: "", ondalik: 18 };
    return [
      h.tok, i.sembol, i.ad === i.sembol ? "" : i.ad, i.ondalik,
      h.para === USDC.toLowerCase() ? 0 : 1,
      h.fee, h.spacing, hookNo(h.hooks)
    ];
  });

  fs.mkdirSync(path.dirname(CIKTI), { recursive: true });
  fs.writeFileSync(CIKTI, JSON.stringify({
    zincir: "arc", poolManager: PM, usdc: USDC, sifir: SIFIR,
    blok: son, tarandi: d.ust, toplam: sirali.length, zaman: new Date().toISOString(),
    /* [adres, sembol, ad, ondalik, para(0=usdc,1=yerel), fee, spacing, hookNo] */
    alanlar: ["token", "sembol", "ad", "ondalik", "para", "fee", "spacing", "hook"],
    hooklar,
    tokenler: cikti
  }));
  durumYaz(d);
  return cikti.length;
}
