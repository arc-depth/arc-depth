"use strict";
/* ===========================================================================
 * analitik-ozet.js — platform analytics on both chains, as a static file
 *
 *   node scripts/analitik-ozet.js        # incremental; writes docs/veri/analitik.json
 *
 * The site is static (GitHub Pages), so a local API cannot serve the public.
 * This walks the chain instead and writes one JSON file the pages read, with
 * the block each chain was read up to. Nothing in it is estimated:
 *
 *   launches      PulseLaunchpad Launched / HavuzAcildi / IlkAlim events
 *   volume        Uniswap v4 PoolManager Swap events, filtered to OUR pool
 *                 ids, quote side only (USDC on Arc, USDG on Robinhood)
 *   fees          PulseHook Ucret events — the exact split, per trade
 *   vaults/funds  balanceOf, read live at the end of the run
 *
 * Incremental: the cursor and the running sums live in
 * rapor/analitik-imlec.json, so each run reads only new blocks. Windows are
 * 5,000 blocks on Arc (its RPC rejects wider) and 100,000 on Robinhood.
 *
 * Trader rankings are deliberately absent: a Swap's `sender` is the router
 * contract, not the person, so "top trader" cannot be read from these logs
 * without guessing. Founder and token rankings can, and are.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface, AbiCoder, id: topic } = require("ethers");

const KOK = path.join(__dirname, "..");
const IMLEC = path.join(KOK, "rapor", "analitik-imlec.json");
const CIKTI = path.join(KOK, "docs", "veri", "analitik.json");
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const LP = new Interface(B("PulseLaunchpad").abi);
const HK = new Interface(B("PulseHook").abi);
const ERC = new Interface(["function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)", "function name() view returns (string)"]);
const coder = AbiCoder.defaultAbiCoder();
const SWAP = topic("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const p2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse2.json"), "utf8")).arc;
const rh = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-robinhood.json"), "utf8")).robinhood;
const ZINCIRLER = [
  { ad: "arc", etiket: "Arc", para: "USDC", rpc: process.env.ARC_RPC || "https://rpc.mainnet.arc.io", pencere: 5000, ara: 900,
    launchpad: p2.launchpad, hook: p2.hook, pm: p2.poolManager, quote: p2.quote, devPool: p2.devPool, likidite: p2.likiditeKasasi },
  { ad: "robinhood", etiket: "Robinhood", para: "USDG", rpc: "https://rpc.mainnet.chain.robinhood.com", pencere: 100000, ara: 200,
    launchpad: rh.launchpad, hook: rh.hook, pm: rh.poolManager, quote: rh.quote, devPool: rh.devPool, likidite: rh.likiditeKasasi,
    dagitimZamani: JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-robinhood-plan.json"), "utf8")).dagitimZamani },
];

/* The seven chains added on 14 Oct 2026 (dagitim-ag.json). Their launchpads
   went out from 06:30 UTC that morning; 06:00 UTC is used as the birth
   estimate on every one — scanning half an hour of empty blocks costs
   nothing, starting after a launch would silently miss it. Windows are
   sized to what each public RPC accepts for eth_getLogs. */
{
  const AGK = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ag.json"), "utf8"));
  const { EVM } = require("./zincirler");
  const PENCERE = { base: 100, arbitrum: 5000, ethereum: 1000, bsc: 1000, avalanche: 2000, monad: 100, hyperevm: 1000 };
  for (const ad of Object.keys(PENCERE)) {
    const r = AGK[ad], z = EVM[ad];
    if (!r || !r.PulseLaunchpad) continue;
    /* Free RPCs that answer eth_getLogs (measured 14 Oct 2026): Base's own
       rate-limits, drpc allows 100 blocks; BNB's dataseed refuses logs,
       publicnode serves recent ranges. */
    const ANALITIK_RPC = { base: "https://base.drpc.org", bsc: "https://bsc-rpc.publicnode.com", ethereum: "https://rpc.mevblocker.io" };
    ZINCIRLER.push({ ad, etiket: z.ad, para: z.dolar.sembol, rpc: ANALITIK_RPC[ad] || z.rpc, pencere: PENCERE[ad], ara: 250,
      launchpad: r.PulseLaunchpad, hook: r.PulseHook, pm: r.poolManager, quote: r.quote, devPool: r.DevPool,
      likidite: r.PulseLikiditeKasasi, dagitimZamani: "2026-10-14T06:00:00Z" });
  }
}

/* Second generation (dagitim-nesil2.json): on the seven chains that have it,
   the app launches only through PulseLaunchpad2, and none of the
   first-generation launchpads there was ever used (launchCount 0, read 14
   Oct 2026). So those chains are read from the new launchpad. Its events are
   the first generation's, byte for byte (Launched, HavuzAcildi, IlkAlim). */
{
  const N2P = path.join(KOK, "dagitim-nesil2.json");
  if (fs.existsSync(N2P)) {
    const N2 = JSON.parse(fs.readFileSync(N2P, "utf8"));
    for (const z of ZINCIRLER) {
      const r = N2.ev[z.ad];
      if (!r || !r.PulseLaunchpad2) continue;
      Object.assign(z, { launchpad: r.PulseLaunchpad2, hook: r.PulseHook, quote: r.quote, devPool: r.DevPool,
        likidite: r.PulseLikiditeKasasi, para: "USDC", dagitimZamani: r.zaman, nesil: 2 });
    }
  }
}

/* Local collateral (dagitim-nesil3.json): where it exists, it is the
   launchpad the app sends launches to, so it is the one read. Same events. */
{
  const N3P = path.join(KOK, "dagitim-nesil3.json");
  if (fs.existsSync(N3P)) {
    const N3 = JSON.parse(fs.readFileSync(N3P, "utf8"));
    for (const z of ZINCIRLER) {
      const r = N3[z.ad];
      if (!r || !r.PulseLaunchpad3) continue;
      Object.assign(z, { launchpad: r.PulseLaunchpad3, hook: r.PulseHook, quote: r.quote, devPool: r.DevPool,
        likidite: r.PulseLikiditeKasasi, para: z.ad === "robinhood" ? "USDG" : "USDC", dagitimZamani: r.zaman, nesil: 3 });
    }
  }
}

/* Retries rotate through the chain's backup RPCs (zincirler.js YEDEK_RPC);
   the log-capable RPC chosen above stays first, so a backup is only asked
   after it has refused. */
const rpcSirasi = (z) => [z.rpc, ...((require("./zincirler").EVM[z.ad] || {}).yedekler || [])].filter((u, i, a) => a.indexOf(u) === i);
async function rpc(z, m, p) {
  const sira = rpcSirasi(z);
  for (let d = 0; d < 8; d++) {
    const r = await fetch(sira[d % sira.length], { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
    if (r.result !== undefined) return r.result;
    const msg = JSON.stringify(r.error || {});
    if (!/rate limit|request limit|limit reached|too many|timeout|503|502|429|fetch failed|ECONN/i.test(msg)) throw new Error(z.ad + " " + m + ": " + msg.slice(0, 160));
    await bekle(1500 * (d + 1));
  }
  throw new Error(z.ad + " " + m + ": cevap yok");
}
const cagir = async (z, to, iface, fn, args = []) => iface.decodeFunctionResult(fn, await rpc(z, "eth_call", [{ to, data: iface.encodeFunctionData(fn, args) }, "latest"]));

/* The launchpad's birth block, by binary search on eth_getCode, so the very
   first run does not scan years of empty history. Found once, then cached. */
async function dogum(z, adres) {
  /* Robinhood's public RPC serves no historical state, so getCode at an
     old block fails. There the birth block is estimated from the recorded
     deployment time and the measured block rate, minus an hour of margin:
     scanning a few thousand extra empty blocks costs nothing, starting
     after the birth would silently miss events. */
  if (z.dagitimZamani) {
    const tepe = parseInt(await rpc(z, "eth_blockNumber", []), 16);
    const t1 = parseInt((await rpc(z, "eth_getBlockByNumber", ["0x" + tepe.toString(16), false])).timestamp, 16);
    const t0 = parseInt((await rpc(z, "eth_getBlockByNumber", ["0x" + (tepe - 100000).toString(16), false])).timestamp, 16);
    const hiz = 100000 / Math.max(1, t1 - t0);
    const geri = (t1 - Math.floor(new Date(z.dagitimZamani).getTime() / 1000) + 3600) * hiz;
    return Math.max(0, Math.floor(tepe - geri));
  }
  let lo = 0, hi = parseInt(await rpc(z, "eth_blockNumber", []), 16);
  while (lo < hi) {
    const m = Math.floor((lo + hi) / 2);
    const k = await rpc(z, "eth_getCode", [adres, "0x" + m.toString(16)]);
    if (k && k !== "0x") hi = m; else lo = m + 1;
  }
  return lo;
}

async function loglar(z, filtre, bas, son) {
  const out = [];
  for (let b = bas; b <= son; b += z.pencere) {
    out.push(...await rpc(z, "eth_getLogs", [{ ...filtre, fromBlock: "0x" + b.toString(16), toBlock: "0x" + Math.min(b + z.pencere - 1, son).toString(16) }]));
    await bekle(z.ara);
  }
  return out;
}

function bos() {
  return { sonBlok: null, launchlar: {}, havuzlar: {}, ucret: { kurucu: "0", gelistirici: "0", likidite: "0", isletme: "0", vergi: "0", derinlik: "0", snipe: "0", kalkan: "0" }, islem: 0 };
}

(async () => {
  const imlec = fs.existsSync(IMLEC) ? JSON.parse(fs.readFileSync(IMLEC, "utf8")) : {};
  const cikti = { olusturuldu: new Date().toISOString(), kaynak: "zincir — scripts/analitik-ozet.js", zincirler: [] };

  for (const z of ZINCIRLER) {
    const d = imlec[z.ad] && imlec[z.ad].launchpad === z.launchpad ? imlec[z.ad] : { launchpad: z.launchpad, ...bos() };
    if (d.dogum == null) {
      /* A launchpad that has never launched has no events to find in its
         past, and launchCount() says so exactly. Starting at today's block
         then needs no archive access — which several free RPCs refuse
         (publicnode on BNB calls 30,000 blocks back "archive"). */
      const n = Number(BigInt(await rpc(z, "eth_call", [{ to: z.launchpad, data: "0x27cca59f" }, "latest"]).catch(() => "0x1")));
      d.dogum = n === 0 ? parseInt(await rpc(z, "eth_blockNumber", []), 16) : await dogum(z, z.launchpad);
    }
    const tepe = parseInt(await rpc(z, "eth_blockNumber", []), 16);
    let bas = d.sonBlok == null ? d.dogum : d.sonBlok + 1;
    /* Still no launch since the cursor was set: nothing in the gap can be
       ours (launchCount says so), so skip to today rather than ask a free
       RPC for a range it calls archive. */
    if (Object.keys(d.launchlar).length === 0 && bas < tepe) {
      const n0 = Number(BigInt(await rpc(z, "eth_call", [{ to: z.launchpad, data: "0x27cca59f" }, "latest"]).catch(() => "0x1")));
      if (n0 === 0) bas = tepe;
    }
    console.log(z.etiket.padEnd(10) + "bloklar " + bas + " .. " + tepe);

    if (bas <= tepe) {
      /* launches first, so their pools are known before the swap scan */
      for (const l of await loglar(z, { address: z.launchpad }, bas, tepe)) {
        let e; try { e = LP.parseLog(l); } catch { continue; }
        if (!e) continue;
        const idx = e.args.id.toString();
        d.launchlar[idx] = d.launchlar[idx] || { id: idx };
        const L = d.launchlar[idx];
        if (e.name === "Launched") Object.assign(L, { token: e.args.token, kurucu: e.args.kurucu, kasa: e.args.kasa, ad: e.args.ad, sembol: e.args.sembol, blok: parseInt(l.blockNumber, 16) });
        if (e.name === "HavuzAcildi") { L.havuz = e.args.havuzId; d.havuzlar[e.args.havuzId.toLowerCase()] = idx; }
        if (e.name === "IlkAlim") Object.assign(L, { ilkAlim: e.args.odenen.toString(), launchUcreti: e.args.ucret.toString() });
        if (e.name === "Kuruldu") Object.assign(L, { teminat: e.args.teminat.toString(), vergiPpm: e.args.vergiPpm.toString() });
      }
      for (const l of await loglar(z, { address: z.hook }, bas, tepe)) {
        let e; try { e = HK.parseLog(l); } catch { continue; }
        if (!e || e.name !== "Ucret") continue;
        for (const k of Object.keys(d.ucret)) d.ucret[k] = (BigInt(d.ucret[k]) + BigInt(e.args[k])).toString();
        const L = d.launchlar[d.havuzlar[e.args.id.toLowerCase()]];
        if (L) L.ucretToplam = (BigInt(L.ucretToplam || 0) + BigInt(e.args.vergi) + BigInt(e.args.kurucu) + BigInt(e.args.gelistirici)
          + BigInt(e.args.likidite) + BigInt(e.args.isletme) + BigInt(e.args.derinlik)).toString();
      }
      /* Swaps: one filter per pool id, so the scan never touches anyone
         else's pool on the shared PoolManager. */
      for (const [hid, idx] of Object.entries(d.havuzlar)) {
        const L = d.launchlar[idx];
        const quoteSifir = z.quote.toLowerCase() < String(L.token).toLowerCase();
        for (const l of await loglar(z, { address: z.pm, topics: [SWAP, hid] }, bas, tepe)) {
          const [a0, a1] = coder.decode(["int128", "int128", "uint160", "uint128", "int24", "uint24"], l.data);
          const q = quoteSifir ? a0 : a1;
          L.hacim = (BigInt(L.hacim || 0) + (q < 0n ? -q : q)).toString();
          L.islem = (L.islem || 0) + 1;
          d.islem++;
        }
      }
      d.sonBlok = tepe;
    }

    /* live balances, read now */
    const bak = async (adres) => (await cagir(z, z.quote, ERC, "balanceOf", [adres]))[0];
    let kasaToplam = 0n, hacimToplam = 0n;
    const tokenler = [];
    for (const L of Object.values(d.launchlar)) {
      const kasa = L.kasa ? await bak(L.kasa) : 0n;
      kasaToplam += kasa;
      hacimToplam += BigInt(L.hacim || 0);
      tokenler.push({ id: L.id, zincir: z.ad, sembol: L.sembol, ad: L.ad, token: L.token, kurucu: L.kurucu, kasa: L.kasa,
        kasadaki: kasa.toString(), hacim: L.hacim || "0", islem: L.islem || 0, ucret: L.ucretToplam || "0", blok: L.blok });
    }
    const fonlar = (await bak(z.devPool)) + (await bak(z.likidite));
    cikti.zincirler.push({
      ad: z.ad, etiket: z.etiket, para: z.para, ondalik: 6, okunanBlok: d.sonBlok,
      launch: Object.keys(d.launchlar).length, islem: d.islem,
      hacim: hacimToplam.toString(), kasalarda: kasaToplam.toString(), protokolFonlari: fonlar.toString(),
      ucret: d.ucret, tokenler,
    });
    imlec[z.ad] = d;
    console.log(z.etiket.padEnd(10) + "launch " + Object.keys(d.launchlar).length + ", islem " + d.islem + ", hacim " + hacimToplam + ", kasalarda " + kasaToplam);
  }

  fs.mkdirSync(path.dirname(IMLEC), { recursive: true });
  fs.writeFileSync(IMLEC, JSON.stringify(imlec, null, 1));
  fs.mkdirSync(path.dirname(CIKTI), { recursive: true });
  fs.writeFileSync(CIKTI, JSON.stringify(cikti, null, 1));
  console.log(path.relative(KOK, CIKTI));
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
