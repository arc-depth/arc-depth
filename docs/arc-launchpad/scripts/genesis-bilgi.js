"use strict";
/* ===========================================================================
 * genesis-bilgi.js — GENESIS's private knowledge: titles public, text paid
 *
 *   node scripts/genesis-bilgi.js kontrol     validate every entry, privacy filter
 *   node scripts/genesis-bilgi.js basliklar   the public topic list + content hashes
 *   node scripts/genesis-bilgi.js ara "<q>"   which topics a question would pull
 *
 * WHERE THINGS LIVE
 *   ozel/genesis-bilgi/bilgi.json       curated lessons (git-ignored)
 *   ozel/genesis-bilgi/arastirma.json   findings written by genesis-arastirma.js
 *   ozel/genesis-bilgi/kavramlar.json   technical library: how the technology works
 *   On chain: only { title, id, keccak256(text) } per topic, so anyone can
 *   see WHAT GENESIS knows and later prove the text was not changed, but
 *   the text itself is only served to paying wallets (atlas-api.js).
 *
 * PRIVACY FILTER (an entry that trips it is refused, not trimmed)
 *   - no EVM addresses, no 32-byte hex (keys, hashes of our own txs)
 *   - no local paths or bot file names
 *   - no wording about our own balances, positions, PnL or wallets
 *   The trading bot's own operation never enters: only market knowledge.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { keccak256, toUtf8Bytes } = require("ethers");

const KOK = path.join(__dirname, "..");
const OZEL = path.join(KOK, "ozel", "genesis-bilgi");
const DOSYALAR = ["bilgi.json", "arastirma.json", "kavramlar.json"];

const YASAK = [
  [/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/, "contains an address"],
  [/0x[0-9a-fA-F]{64}/, "contains a 32-byte hex value"],
  [/[A-Za-z]:\\|\/Users\/|\.jsonl?\b|\.js\b|\.db\b/, "contains a local path or file name"],
  [/\b(our|my) (wallet|balance|position|positions|pnl|portfolio|vault|treasury)\b/i, "talks about our own funds"],
  [/\b(bakiye|pozisyon|cüzdanımız|kasamız|private key|seed phrase|mnemonic)\b/i, "talks about our own funds or keys"],
];

function gizlilik(m) {
  const metin = [m.baslik, m.metin, (m.etiketler || []).join(" "), m.kaynak].join(" \n ");
  for (const [re, neden] of YASAK) if (re.test(metin)) return neden;
  return null;
}

function hepsi() {
  const out = [];
  for (const f of DOSYALAR) {
    const p = path.join(OZEL, f);
    if (!fs.existsSync(p)) continue;
    for (const m of JSON.parse(fs.readFileSync(p, "utf8")).bilgiler || []) out.push({ ...m, dosya: f });
  }
  return out;
}

/* what goes on chain for one topic: the title and a commitment to the text */
const icerikHash = (m) => keccak256(toUtf8Bytes(m.metin));
function zincirKaydi(m) {
  const v = toUtf8Bytes(JSON.stringify({ v: 1, id: m.id, t: m.baslik, h: icerikHash(m) }));
  return { v, h: keccak256(v) };
}

function kontrol() {
  const ms = hepsi(), hatalar = [], idler = new Set();
  for (const m of ms) {
    if (!m.id || !m.baslik || !m.metin) hatalar.push((m.id || "?") + ": id, baslik and metin are required");
    if (idler.has(m.id)) hatalar.push(m.id + ": duplicate id");
    idler.add(m.id);
    if (m.baslik && m.baslik.length > 120) hatalar.push(m.id + ": title over 120 characters");
    const g = gizlilik(m);
    if (g) hatalar.push(m.id + ": PRIVACY — " + g);
  }
  return { adet: ms.length, hatalar };
}

/* ---- retrieval: tf-idf over title, tags and text ------------------- */
const DURAK = new Set("a an the is are was were be it its of on in to for and or but if how what which who why when do does did can could should would will i you we they this that these those with from at by as me my your our there here so not no yes about into than then any some all".split(" "));
const kelimeler = (s) => (s.toLowerCase().match(/[a-z0-9çğıöşü$%.]+/g) || []).map((w) => w.replace(/\.$/, "")).filter((w) => w.length > 1 && !DURAK.has(w));
/* below ESIK a topic is noise: measured 15 Oct 2026, related questions
   score 0.8-4.5, unrelated ones (weather, football, price predictions)
   0-0.32 */
const ESIK = 0.5;
function ara(soru, k = 4) {
  const ms = hepsi().filter((m) => !gizlilik(m));
  const belgeler = ms.map((m) => {
    const w = [...kelimeler(m.baslik), ...kelimeler(m.baslik), ...kelimeler((m.etiketler || []).join(" ")), ...kelimeler((m.etiketler || []).join(" ")), ...kelimeler(m.metin)];
    const tf = new Map(); for (const x of w) tf.set(x, (tf.get(x) || 0) + 1);
    return { m, tf, n: w.length };
  });
  const df = new Map();
  for (const b of belgeler) for (const x of b.tf.keys()) df.set(x, (df.get(x) || 0) + 1);
  const q = [...new Set(kelimeler(soru))];
  return belgeler.map((b) => {
    let s = 0;
    for (const x of q) if (b.tf.has(x)) s += (b.tf.get(x) / Math.sqrt(b.n)) * Math.log(1 + belgeler.length / df.get(x));
    return { m: b.m, puan: s };
  }).filter((x) => x.puan >= ESIK).sort((a, b) => b.puan - a.puan).slice(0, k);
}

const basliklar = () => hepsi().filter((m) => !gizlilik(m)).map((m) => ({ id: m.id, baslik: m.baslik, icerikHash: icerikHash(m), kaynak: m.dosya === "arastirma.json" ? "research" : m.dosya === "kavramlar.json" ? "concept" : "lesson" }));

module.exports = { hepsi, gizlilik, kontrol, ara, basliklar, zincirKaydi, icerikHash, OZEL };

if (require.main === module) {
  const k = process.argv[2];
  if (k === "kontrol") {
    const r = kontrol();
    console.log(r.adet + " kayit, " + r.hatalar.length + " hata");
    r.hatalar.forEach((h) => console.log("  KOTU  " + h));
    process.exit(r.hatalar.length ? 1 : 0);
  } else if (k === "basliklar") {
    for (const b of basliklar()) console.log(b.icerikHash.slice(0, 12) + "  " + b.baslik);
  } else if (k === "ara") {
    for (const r of ara(process.argv.slice(3).join(" "))) console.log(r.puan.toFixed(3) + "  " + r.m.baslik);
  } else console.log("kullanim: kontrol | basliklar | ara <soru>");
}
