"use strict";
/* ===========================================================================
 * olc-arc-zenginlestir.js — pick each token's real pool, and name it.
 *
 *   node scripts/olc-arc-zenginlestir.js                  # one bounded pass
 *   node scripts/olc-arc-zenginlestir.js --butce 4000
 *
 * WHY
 *   The scan records every pool the PoolManager has opened. Choosing which
 *   one a token actually trades in was left to recency, and recency is
 *   wrong:
 *
 *     ARCANUS  newest pool, block 24189299   liquidity 0
 *              real pool,   block 23612996   liquidity 1.9e15
 *     ARCMAN   newest pool, block 24324084   liquidity 6.7e11
 *              real pool,   block 24189038   liquidity 8.1e12
 *
 *   Routing ARCANUS through its newest pool sends a trade into an empty
 *   book. The pool with the most liquidity is the one people are using, and
 *   the PoolManager will say how much each has.
 *
 *   The same pass reads symbols and decimals. The scanner had a budget of
 *   twenty names per checkpoint so it would not spend its time on them, and
 *   the result was three thousand tokens called "?".
 *
 * BOUNDED AND RESUMABLE
 *   Every result is cached in the progress file, and each run stops after a
 *   fixed number of requests. So this is a thing you run a few times rather
 *   than a job that has to survive for twenty minutes, and nothing is lost
 *   if it is interrupted.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, Interface, keccak256 } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDC = "0x3600000000000000000000000000000000000000".toLowerCase();
const SIFIR = "0x0000000000000000000000000000000000000000";
const POOLS_SLOT = 6n;

const val = (ad, v) => {
  const i = process.argv.indexOf(ad);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : v;
};
const BUTCE = Number(val("--butce", "2500"));
const SINIR = Number(process.env.SINIR || 1200);
/* Addresses to look at before anything else. Spending the budget newest
   first put four hundred fresh tokens in the index and left out ARCMAN,
   ASTOCK and ARCANUS — the ones with real liquidity, which are older. What
   is liquid cannot be known before it is read, so the order comes from
   outside: a list of the chain's busiest tokens. */
const ONCE = val("--once", null);
/* The highest pool fee worth offering, in hundredths of a basis point.
   100000 is 10%: real Arc pools run from 0.01% to about 5%, and ARCMAN's
   deepest pool charges 70.13%, which is not a market. */
const UCRET_TAVANI = Number(process.env.UCRET_TAVANI || 100000);

const DURUM = path.join(__dirname, "..", "arc-havuz-durum.json");
const CIKTI = path.join(__dirname, "..", "docs", "havuzlar.json");

const coder = AbiCoder.defaultAbiCoder();
const pmI = new Interface(["function extsload(bytes32) view returns (bytes32)"]);
const erc = new Interface([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)"
]);

let istek = 0;

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
async function rpc(method, params) {
  let bekle = 800;
  for (;;) {
    try { const r = await ham(method, params); istek++; await new Promise((x) => setTimeout(x, 80)); return r; }
    catch (e) {
      if (!gecici(e)) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 15000);
    }
  }
}

/* The pool's active liquidity, out of the PoolManager's own storage. Pools
 * live at slot 6 and liquidity is the fourth word of a pool's state. */
async function likidite(id) {
  const durum = keccak256(coder.encode(["bytes32", "uint256"], [id, POOLS_SLOT]));
  const slot = "0x" + (BigInt(durum) + 3n).toString(16).padStart(64, "0");
  return BigInt(await rpc("eth_call", [{ to: PM, data: pmI.encodeFunctionData("extsload", [slot]) }, "latest"]));
}

(async function main() {
  const d = JSON.parse(fs.readFileSync(DURUM, "utf8"));
  d.isimler = d.isimler || {};
  d.likidite = d.likidite || {};       // poolId -> liquidity, as a string

  /* Only pools against money. A pair of two unknown tokens is not something
     this interface can quote or route. */
  const paraliklar = Object.values(d.havuzlar).filter((h) =>
    h.c0 === USDC || h.c1 === USDC || h.c0 === SIFIR || h.c1 === SIFIR);

  const gruplar = new Map();
  for (const h of paraliklar) {
    const para = (h.c0 === USDC || h.c0 === SIFIR) ? h.c0 : h.c1;
    const tok = para === h.c0 ? h.c1 : h.c0;
    if (tok === USDC || tok === SIFIR) continue;
    if (!gruplar.has(tok)) gruplar.set(tok, []);
    gruplar.get(tok).push({ ...h, para, tok });
  }

  /* Newest first only to decide what to spend the budget on; what gets
     chosen within a token is decided by liquidity, not by age. */
  let oncelikli = [];
  if (ONCE) {
    try {
      oncelikli = fs.readFileSync(ONCE, "utf8").split(/[^0-9a-zA-Zx]+/)
        .map((x) => x.trim().toLowerCase()).filter((x) => /^0x[0-9a-f]{40}$/.test(x));
    } catch (e) { console.log("  oncelik dosyasi okunamadi: " + e.message); }
  }
  const oncelikSet = new Set(oncelikli);

  const sirali = [...gruplar.entries()].sort((a, b) => {
    const ao = oncelikSet.has(a[0]) ? 1 : 0, bo = oncelikSet.has(b[0]) ? 1 : 0;
    if (ao !== bo) return bo - ao;
    return Math.max(...b[1].map((x) => x.blok)) - Math.max(...a[1].map((x) => x.blok));
  });
  if (oncelikSet.size) {
    const var_ = [...oncelikSet].filter((x) => gruplar.has(x)).length;
    console.log("  oncelik listesi  " + oncelikSet.size + " adres, " + var_ + " tanesi taramada var");
  }

  console.log("ARC HAVUZ ZENGINLESTIRME");
  console.log("  taranmis havuz   " + Object.keys(d.havuzlar).length.toLocaleString("en-US"));
  console.log("  parali token     " + gruplar.size.toLocaleString("en-US"));
  console.log("  bu kosuda butce  " + BUTCE.toLocaleString("en-US") + " istek");
  console.log("");

  let bakilan = 0;
  for (const [tok, havuzlar] of sirali) {
    if (istek >= BUTCE) break;

    /* All of a token's pools or none of them. Stopping half way leaves the
       next write choosing among whichever happened to be read, and a trap
       with a measured balance beats a real pool with none. */
    const eksik = havuzlar.filter((h) => d.likidite[h.id] === undefined).length;
    if (eksik && istek + eksik > BUTCE) break;
    for (const h of havuzlar) {
      if (d.likidite[h.id] !== undefined) continue;
      try { d.likidite[h.id] = (await likidite(h.id)).toString(); }
      catch (e) { d.likidite[h.id] = "0"; }
    }

    if (!d.isimler[tok] && istek < BUTCE) {
      let sembol = null, ad = null, ondalik = 18;
      try {
        sembol = erc.decodeFunctionResult("symbol",
          await rpc("eth_call", [{ to: tok, data: erc.encodeFunctionData("symbol") }, "latest"]))[0];
        ondalik = Number(erc.decodeFunctionResult("decimals",
          await rpc("eth_call", [{ to: tok, data: erc.encodeFunctionData("decimals") }, "latest"]))[0]);
        ad = erc.decodeFunctionResult("name",
          await rpc("eth_call", [{ to: tok, data: erc.encodeFunctionData("name") }, "latest"]))[0];
      } catch (e) { /* a token that will not say its name is still tradeable */ }
      d.isimler[tok] = { sembol: sembol || "?", ad: ad || "", ondalik };
    }

    bakilan++;
    if (bakilan % 25 === 0) {
      fs.writeFileSync(DURUM, JSON.stringify(d));
      process.stdout.write("\r  " + bakilan + " token   " + istek + "/" + BUTCE + " istek    ");
    }
  }
  fs.writeFileSync(DURUM, JSON.stringify(d));
  console.log("");

  /* ---- write the index: live pools only, best first ------------------- */
  const dogrulanan = d.dogrulanan || {};
  const satirlar = [];
  let yarim = 0, tuzak = 0, dogru = 0;
  for (const [tok, havuzlar] of gruplar) {
    /* Confirmed by a price site: use that pool and nothing else. Liquidity
       and fee heuristics exist only for tokens nobody has confirmed, and
       both have already picked badly. */
    const onay = dogrulanan[tok];
    if (onay) {
      const h = havuzlar.find((x) => x.id.toLowerCase() === String(onay).toLowerCase());
      if (h) {
        const i = d.isimler[tok] || { sembol: "?", ad: "", ondalik: 18 };
        satirlar.push({ h, i, lik: 1n, onayli: 1 });
        dogru++;
        continue;
      }
    }

    /* Never judge a token on pools that were not all measured. */
    if (havuzlar.some((h) => d.likidite[h.id] === undefined)) { yarim++; continue; }

    const uygun = havuzlar.filter((h) => h.fee <= UCRET_TAVANI);
    if (uygun.length < havuzlar.length) tuzak++;

    let enIyi = null, enCok = 0n;
    for (const h of uygun) {
      const l = BigInt(d.likidite[h.id]);
      if (l > enCok) { enCok = l; enIyi = h; }
    }
    /* A token whose every eligible pool is empty cannot be traded, and
       listing it would send somebody into a book with nothing in it. */
    if (!enIyi || enCok === 0n) continue;
    const i = d.isimler[tok] || { sembol: "?", ad: "", ondalik: 18 };
    satirlar.push({ h: enIyi, i, lik: enCok, onayli: 0 });
  }
  console.log("  olculmemis havuzu olan, atlanan   " + yarim.toLocaleString("en-US"));
  console.log("  ucret tavanini asan havuzu olan   " + tuzak.toLocaleString("en-US"));
  console.log("  fiyat sitesince DOGRULANAN        " + dogru.toLocaleString("en-US"));

  /* Confirmed first: those are the ones the app will offer. */
  satirlar.sort((a, b) => (b.onayli - a.onayli) || (b.lik > a.lik ? 1 : b.lik < a.lik ? -1 : 0));
  const kisa = satirlar.slice(0, SINIR);

  const hooklar = [];
  const hookNo = (x) => { let i = hooklar.indexOf(x); if (i < 0) { i = hooklar.length; hooklar.push(x); } return i; };
  const cikti = kisa.map(({ h, i, onayli }) => [
    h.tok, i.sembol, i.ad === i.sembol ? "" : i.ad, i.ondalik,
    h.para === USDC ? 0 : 1, h.fee, h.spacing, hookNo(h.hooks), onayli || 0
  ]);

  fs.writeFileSync(CIKTI, JSON.stringify({
    zincir: "arc", poolManager: PM, usdc: USDC, sifir: SIFIR,
    blok: d.ust, tarandi: d.ust, toplam: satirlar.length,
    zaman: new Date().toISOString(),
    alanlar: ["token", "sembol", "ad", "ondalik", "para", "fee", "spacing", "hook", "onayli"],
    hooklar, tokenler: cikti
  }));

  const isimli = kisa.filter((x) => x.i.sembol !== "?").length;
  console.log("  canli havuzu olan token  " + satirlar.length.toLocaleString("en-US"));
  console.log("  indekse yazilan          " + kisa.length.toLocaleString("en-US") +
    "   (" + isimli + " tanesi isimli)");
  console.log("  dosya                    " + (fs.statSync(CIKTI).size / 1024).toFixed(0) + " KB");
  console.log("");
  console.log("  butce bitmediyse tekrar calistir — kaldigi yerden devam eder.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
