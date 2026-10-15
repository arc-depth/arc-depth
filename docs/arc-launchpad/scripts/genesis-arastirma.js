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
  const bulgular = [await zincirYonu(), dolarAkisi()].filter(Boolean);
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
