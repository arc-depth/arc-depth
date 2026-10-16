"use strict";
/* ===========================================================================
 * genesis-arastirma.js — GENESIS researches on its own, reading only
 *
 *   node scripts/genesis-arastirma.js          run every study, write findings
 *   node scripts/genesis-arastirma.js --kuru   print, write nothing
 *
 * READ ONLY. It sends no transaction, holds no key and spends nothing: it
 * reads public data, turns it into dated findings and files them in
 * GENESIS's private knowledge (ozel/genesis-bilgi/arastirma.json). The
 * titles become public topics; the text is what paying wallets get.
 *
 * STUDIES
 *   1. chain direction — DefiLlama TVL history for every chain ARC PULSE
 *      is on or watches: level, 7- and 30-day change, acceleration, distance
 *      from the peak. The measured form of "the chain itself is a position".
 *   2. dollar flows — the Atlas snapshot (docs/veri/atlas.json): net Circle
 *      CCTP USDC flow per chain in the window, the biggest corridors, and
 *      new pools per chain.
 *   3. new pools — GeckoTerminal's newest pools on all 12 chains: how fast
 *      they open (pools per hour over the window the newest ~100 span),
 *      starting liquidity, the share sharing a symbol with another new pool
 *      (copies). Every pool seen is filed for study 4.
 *   4. what happened to them — pools first seen 24 h or more ago are read
 *      again: the share that lost 90%+ of their liquidity (pulled or
 *      abandoned), by starting-liquidity band. Nobody publishes this per
 *      chain; it needs a memory of yesterday's pools, which this keeps in
 *      ozel/genesis-bilgi/izlenen-havuzlar.json.
 *   5. dollars parked on each chain — DefiLlama stablecoin supply, 7- and
 *      30-day change.
 * Each study writes one finding per day (same id, replaced on re-run); the
 * newest KEEP findings are kept.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const bilgi = require("./genesis-bilgi");

const KOK = path.join(__dirname, "..");
const DOSYA = path.join(bilgi.OZEL, "arastirma.json");
const KURU = process.argv.includes("--kuru");
const KEEP = 60;
const ZINCIRLER = ["Arc", "Robinhood Chain", "Base", "Arbitrum", "Ethereum", "BSC", "Avalanche", "Monad", "Hyperliquid L1", "Solana", "Sui", "Aptos"];
const gun = () => new Date().toISOString().slice(0, 10);
const M = (x) => (x >= 1e9 ? "$" + (x / 1e9).toFixed(2) + "B" : "$" + (x / 1e6).toFixed(1) + "M");
const Y = (x) => (x >= 0 ? "+" : "") + x.toFixed(1) + "%";

async function json(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (r.ok) return await r.json(); } catch (e) { /* retry */ }
    await new Promise((s) => setTimeout(s, 2000 * (i + 1)));
  }
  return null;
}

/* 1. chain direction ------------------------------------------------- */
async function zincirYonu() {
  const satirlar = [];
  for (const ad of ZINCIRLER) {
    const h = await json("https://api.llama.fi/v2/historicalChainTvl/" + encodeURIComponent(ad));
    if (!Array.isArray(h) || h.length < 31) { satirlar.push({ ad, hata: true }); continue; }
    const t = h.map((x) => x.tvl), n = t.length - 1;
    const simdi = t[n], d7 = (simdi / t[n - 7] - 1) * 100, d30 = (simdi / t[n - 30] - 1) * 100;
    const onceki7 = (t[n - 7] / t[n - 14] - 1) * 100;
    const zirve = Math.max(...t);
    satirlar.push({ ad, simdi, d7, d30, ivme: d7 - onceki7, zirvede: (simdi / zirve) * 100 });
  }
  const iyi = satirlar.filter((s) => !s.hata).sort((a, b) => b.d7 - a.d7);
  if (iyi.length < 3) return null;
  const yon = (s) => (s.d7 > 2 ? (s.ivme > 0 ? "rising, accelerating" : "rising, slowing") : s.d7 < -2 ? (s.ivme < 0 ? "falling, accelerating" : "falling, slowing") : "flat");
  const metin = "TVL direction by chain on " + gun() + " (DefiLlama daily TVL; 7-day and 30-day change, acceleration = this week's change minus last week's, share of all-time peak). " +
    iyi.map((s) => s.ad + ": " + M(s.simdi) + ", 7d " + Y(s.d7) + ", 30d " + Y(s.d30) + ", " + yon(s) + ", " + s.zirvede.toFixed(0) + "% of peak").join("; ") + ". " +
    "Strongest 7-day direction: " + iyi[0].ad + " (" + Y(iyi[0].d7) + "); weakest: " + iyi[iyi.length - 1].ad + " (" + Y(iyi[iyi.length - 1].d7) + "). " +
    "Direction, not level, is what this measures: a chain climbing from its low carries average picks, a chain draining sinks good ones." +
    (satirlar.some((s) => s.hata) ? " Not read this time: " + satirlar.filter((s) => s.hata).map((s) => s.ad).join(", ") + "." : "");
  return { id: "chain-direction-" + gun(), baslik: "Chain direction on " + gun() + ": TVL trend across " + iyi.length + " chains",
    etiketler: ["tvl", "chain", "direction", "trend", "capital flow", ...iyi.map((s) => s.ad.toLowerCase())], metin, kaynak: "DefiLlama daily chain TVL, read " + new Date().toISOString() };
}

/* GeckoTerminal's public API allows ~30 calls a minute: one call per 2.5 s,
   and a 429 waits and retries */
const GT = "https://api.geckoterminal.com/api/v2";
const GT_AG = { arc: "Arc", robinhood: "Robinhood Chain", base: "Base", arbitrum: "Arbitrum", eth: "Ethereum", bsc: "BNB Chain", avax: "Avalanche",
  monad: "Monad", hyperevm: "HyperEVM", solana: "Solana", "sui-network": "Sui", aptos: "Aptos" };
const IZLEME = path.join(bilgi.OZEL, "izlenen-havuzlar.json");
const SAYFA = 5;   // 5 pages x 20 = the newest 100 pools per chain
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));
let sonGt = 0;
async function gt(yol) {
  for (let i = 0; i < 6; i++) {
    await uyu(Math.max(0, sonGt + 2500 - Date.now()));
    sonGt = Date.now();
    const r = await fetch(GT + yol, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (r && r.ok) return r.json();
    if (r && r.status === 404) return null;
    await uyu(15000 * (i + 1));
  }
  return null;
}
const medyan = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
const usd0 = (x) => "$" + Math.round(x).toLocaleString("en-US");
const izlemeOku = () => { try { return JSON.parse(fs.readFileSync(IZLEME, "utf8")); } catch (e) { return { havuzlar: [] }; } };

/* 3. new pools ------------------------------------------------------- */
async function yeniHavuzlar(izleme) {
  const satir = [];
  for (const [ag, ad] of Object.entries(GT_AG)) {
    const havuzlar = [];
    for (let s = 1; s <= SAYFA; s++) {
      const j = await gt("/networks/" + ag + "/new_pools?page=" + s);
      if (!j || !j.data || !j.data.length) break;
      havuzlar.push(...j.data.map((d) => ({ adres: d.attributes.address, sembol: (d.attributes.name || "").split(" / ")[0].trim().toUpperCase(),
        olusma: Date.parse(d.attributes.pool_created_at), rez: Number(d.attributes.reserve_in_usd || 0) })));
    }
    if (havuzlar.length < 10) { satir.push({ ad, hata: true }); continue; }
    const t = havuzlar.map((h) => h.olusma).filter(Boolean);
    const saat = Math.max(0.05, (Math.max(...t) - Math.min(...t)) / 3600e3);
    const say = new Map();
    for (const h of havuzlar) say.set(h.sembol, (say.get(h.sembol) || 0) + 1);
    const kopya = havuzlar.filter((h) => say.get(h.sembol) > 1).length / havuzlar.length * 100;
    const rez = havuzlar.map((h) => h.rez);
    satir.push({ ad, n: havuzlar.length, saat, hiz: havuzlar.length / saat, medyan: medyan(rez), az: rez.filter((x) => x < 1000).length / rez.length * 100, kopya });
    const bilinen = new Set(izleme.havuzlar.map((h) => h.ag + ":" + h.adres));
    for (const h of havuzlar) if (!bilinen.has(ag + ":" + h.adres)) izleme.havuzlar.push({ ag, ...h, kesif: Date.now() });
  }
  const iyi = satir.filter((x) => !x.hata).sort((a, b) => b.hiz - a.hiz);
  if (iyi.length < 3) return null;
  const metin = "New liquidity pools by chain on " + gun() + " (GeckoTerminal's newest pools per chain; the rate is the newest " + SAYFA * 20 +
    " pools divided by the hours they span, so busy chains are measured over minutes and quiet ones over days). " +
    iyi.map((x) => x.ad + ": " + x.hiz.toFixed(x.hiz < 1 ? 2 : 1) + " pools/hour (" + x.n + " over " + x.saat.toFixed(1) + " h), median starting liquidity " + usd0(x.medyan) +
      ", " + x.az.toFixed(0) + "% under $1,000, " + x.kopya.toFixed(0) + "% share a symbol with another new pool").join("; ") + ". " +
    "Busiest: " + iyi[0].ad + "; quietest: " + iyi[iyi.length - 1].ad + ". A high share under $1,000 with many repeated symbols is a field of throwaway launches; " +
    "what happens to these pools a day later is measured separately." + (satir.some((x) => x.hata) ? " Not read this time: " + satir.filter((x) => x.hata).map((x) => x.ad).join(", ") + "." : "");
  return { id: "new-pools-" + gun(), baslik: "New pools on 12 chains, " + gun() + ": how fast they open, how thin, how many copies",
    etiketler: ["new pools", "launches", "memecoin", "copycat", "liquidity", "launch rate", ...iyi.map((x) => x.ad.toLowerCase())], metin, kaynak: "GeckoTerminal new pools, read " + new Date().toISOString() };
}

/* 4. what happened to them ------------------------------------------- */
async function havuzAkibeti(izleme) {
  const olgun = izleme.havuzlar.filter((h) => !h.sonuc && h.olusma && Date.now() - h.olusma >= 24 * 3600e3 && h.rez > 0);
  const agaGore = new Map();
  for (const h of olgun) { if (!agaGore.has(h.ag)) agaGore.set(h.ag, []); agaGore.get(h.ag).push(h); }
  for (const [ag, liste] of agaGore) {
    for (let i = 0; i < liste.length; i += 30) {
      const parca = liste.slice(i, i + 30);
      const j = await gt("/networks/" + ag + "/pools/multi/" + parca.map((h) => h.adres).join(","));
      if (!j) continue;   // a failed read is retried next run, not counted as a rug
      const simdi = new Map((j.data || []).map((d) => [d.attributes.address.toLowerCase(), Number(d.attributes.reserve_in_usd || 0)]));
      for (const h of parca) { const r = simdi.has(h.adres.toLowerCase()) ? simdi.get(h.adres.toLowerCase()) : 0; h.sonuc = { rez: r, oran: r / h.rez, okundu: Date.now() }; }
    }
  }
  // the report covers every pool judged in the last day
  const bant = (x) => (x < 1000 ? "under $1k" : x < 10000 ? "$1k-10k" : "over $10k");
  const satir = [];
  for (const [ag, ad] of Object.entries(GT_AG)) {
    const l = izleme.havuzlar.filter((h) => h.ag === ag && h.sonuc && Date.now() - h.sonuc.okundu < 24 * 3600e3);
    if (l.length < 20) continue;
    const coktu = (x) => x.sonuc.oran < 0.1;
    const bantlar = ["under $1k", "$1k-10k", "over $10k"].map((b) => {
      const k = l.filter((h) => bant(h.rez) === b);
      return k.length >= 5 ? b + " " + (k.filter(coktu).length / k.length * 100).toFixed(0) + "% (n=" + k.length + ")" : null;
    }).filter(Boolean);
    satir.push({ ad, n: l.length, coktu: l.filter(coktu).length / l.length * 100, tuttu: l.filter((h) => h.sonuc.oran >= 0.5).length / l.length * 100, bantlar });
  }
  // forget pools judged more than three days ago
  izleme.havuzlar = izleme.havuzlar.filter((h) => !h.sonuc || Date.now() - h.sonuc.okundu < 3 * 24 * 3600e3);
  if (!satir.length) return null;
  satir.sort((a, b) => b.coktu - a.coktu);
  const metin = "What happened to new pools one day later, by chain (pools first seen by GENESIS's new-pool scan, read again 24 h or more after they opened; " +
    "'lost' = liquidity down 90% or more, pulled or abandoned; 'kept' = at least half the starting liquidity still there). " +
    satir.map((x) => x.ad + ": " + x.coktu.toFixed(0) + "% lost, " + x.tuttu.toFixed(0) + "% kept (n=" + x.n + ")" + (x.bantlar.length ? "; lost by starting liquidity: " + x.bantlar.join(", ") : "")).join(". ") + ". " +
    "Starting liquidity is the attacker's cost: compare the bands before trusting a fresh pool. Samples are the newest pools at scan time, not every pool of the day.";
  return { id: "pool-fate-" + gun(), baslik: "New pools 24 h later, " + gun() + ": the share that lost 90% of liquidity, per chain",
    etiketler: ["rug", "rug rate", "abandoned", "liquidity pulled", "survival", "new pools", "memecoin", ...satir.map((x) => x.ad.toLowerCase())], metin, kaynak: "GeckoTerminal pools read twice, 24 h apart, " + new Date().toISOString() };
}

/* 5. dollars parked on each chain ------------------------------------ */
async function stablecoinArzi() {
  const satir = [];
  for (const ad of ZINCIRLER) {
    const h = await json("https://stablecoins.llama.fi/stablecoincharts/" + encodeURIComponent(ad));
    if (!Array.isArray(h) || h.length < 31) { satir.push({ ad, hata: true }); continue; }
    const v = h.map((x) => (x.totalCirculatingUSD && x.totalCirculatingUSD.peggedUSD) || 0), n = v.length - 1;
    satir.push({ ad, simdi: v[n], d7: (v[n] / v[n - 7] - 1) * 100, d30: (v[n] / v[n - 30] - 1) * 100 });
  }
  const iyi = satir.filter((x) => !x.hata).sort((a, b) => b.d7 - a.d7);
  if (iyi.length < 3) return null;
  const metin = "Stablecoins parked on each chain on " + gun() + " (DefiLlama circulating USD stablecoins): " +
    iyi.map((x) => x.ad + " " + M(x.simdi) + ", 7d " + Y(x.d7) + ", 30d " + Y(x.d30)).join("; ") + ". " +
    "Growing stablecoin supply is dollars arriving and waiting to be spent on that chain; it moves before TVL and volume do. " +
    "Fastest 7-day growth: " + iyi[0].ad + "; fastest outflow: " + iyi[iyi.length - 1].ad + "." +
    (satir.some((x) => x.hata) ? " Not read: " + satir.filter((x) => x.hata).map((x) => x.ad).join(", ") + "." : "");
  return { id: "stablecoins-" + gun(), baslik: "Stablecoins parked on 12 chains, " + gun() + ": where dollars are arriving",
    etiketler: ["stablecoin", "usdc", "usdt", "supply", "dollars", "capital flow", ...iyi.map((x) => x.ad.toLowerCase())], metin, kaynak: "DefiLlama stablecoins, read " + new Date().toISOString() };
}

/* 2. dollar flows ---------------------------------------------------- */
function dolarAkisi() {
  let a;
  try { a = JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "atlas.json"), "utf8")); } catch (e) { return null; }
  const ad = new Map(a.dugumler.map((d) => [d.id, d.ad]));
  const net = new Map(), koridor = [];
  for (const k of a.kenarlar.filter((x) => x.tur === "cctp")) {
    net.set(k.hedef, (net.get(k.hedef) || 0) + k.miktar);
    net.set(k.kaynak, (net.get(k.kaynak) || 0) - k.miktar);
    koridor.push(k);
  }
  if (!koridor.length) return null;
  const dk = Math.round((a.pencereSaniye || 900) / 60);
  const sirali = [...net.entries()].sort((x, y) => y[1] - x[1]);
  const usd = (x) => "$" + Math.round(Math.abs(x)).toLocaleString("en-US");
  const yeni = a.dugumler.filter((d) => d.yeniHavuz > 0).sort((x, y) => y.yeniHavuz - x.yeniHavuz);
  const metin = "Net Circle CCTP USDC flow by chain in the " + dk + "-minute window ending " + a.zaman + " (burns on the source chain, mints on the destination, read from the events). " +
    "Net in: " + sirali.filter((x) => x[1] > 0).map((x) => (ad.get(x[0]) || x[0]) + " " + usd(x[1])).join(", ") + ". " +
    "Net out: " + sirali.filter((x) => x[1] < 0).map((x) => (ad.get(x[0]) || x[0]) + " " + usd(x[1])).join(", ") + ". " +
    "Largest corridors: " + koridor.sort((x, y) => y.miktar - x.miktar).slice(0, 5).map((k) => (ad.get(k.kaynak) || k.kaynak) + " -> " + (ad.get(k.hedef) || k.hedef) + " " + usd(k.miktar) + " in " + k.adet + " transfers").join("; ") + ". " +
    (yeni.length ? "New Uniswap pools in the window: " + yeni.map((d) => d.ad + " " + d.yeniHavuz).join(", ") + ". " : "") +
    "One window is a snapshot, not a trend: compare several before calling a direction.";
  const saat = a.zaman.slice(0, 13).replace("T", " ") + "h";
  return { id: "dollar-flows-" + gun(), baslik: "Where dollars moved between chains, " + saat + " UTC (CCTP net flows)",
    etiketler: ["usdc", "cctp", "flows", "bridge", "capital flow", "new pools", "where money goes"], metin, kaynak: "GENESIS ATLAS snapshot " + a.zaman };
}

(async () => {
  const izleme = izlemeOku();
  const bulgular = [await zincirYonu(), dolarAkisi(), await stablecoinArzi(), await havuzAkibeti(izleme), await yeniHavuzlar(izleme)].filter(Boolean);
  if (!KURU) { fs.mkdirSync(bilgi.OZEL, { recursive: true }); fs.writeFileSync(IZLEME, JSON.stringify(izleme)); }
  console.log("izlenen havuz: " + izleme.havuzlar.length + " (" + izleme.havuzlar.filter((h) => h.sonuc).length + " sonuclandi)");
  const mevcut = fs.existsSync(DOSYA) ? JSON.parse(fs.readFileSync(DOSYA, "utf8")) : { surum: 1, bilgiler: [] };
  for (const b of bulgular) {
    const g = bilgi.gizlilik(b);
    console.log((g ? "RED  " + g + "  " : "OK   ") + b.baslik + "\n     " + b.metin.slice(0, 220) + "…");
    if (g || KURU) continue;
    mevcut.bilgiler = mevcut.bilgiler.filter((x) => x.id !== b.id);
    mevcut.bilgiler.push({ ...b, tarih: new Date().toISOString() });
  }
  if (!KURU) {
    mevcut.bilgiler = mevcut.bilgiler.slice(-KEEP);
    fs.mkdirSync(bilgi.OZEL, { recursive: true });
    fs.writeFileSync(DOSYA, JSON.stringify(mevcut, null, 1));
    console.log("\n" + bulgular.length + " bulgu yazildi -> " + DOSYA + " (" + mevcut.bilgiler.length + " arastirma kaydi)");
  }
})();
