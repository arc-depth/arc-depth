"use strict";
/* ===========================================================================
 * genesis-ajan.js — the PULSE GENESIS runtime: observe, verify, learn,
 *                   measure, record, synchronise
 *
 *   node scripts/genesis-ajan.js <komut> [--uygula]
 *
 *   durum      memory and model state on every chain, read only
 *   tohum      write genesis/bilgi-tohum.json facts not yet in memory
 *   basliklar  write the private knowledge's TOPIC TITLES (title + keccak of
 *              the text, never the text) not yet in memory — see
 *              scripts/genesis-bilgi.js; the text is sold by atlas-api.js
 *   oneriler   judge the public inbox by the rules below
 *   ogren      run on-chain learning over every learnable record
 *   olc        measure on-chain loss on genesis/dogrulama.json, record it
 *   yay        relay every record a chain is missing to it
 *   modeller   register GENESIS-0 (mode 1) and the in-browser open model
 *              (mode 3, weights hash read from Hugging Face)
 *   icat       invention engine: run the bench, record results (category 11)
 *   dongu      the evolution loop once: observe → inbox → learn → measure
 *              → compare → record what happened → relay
 *
 * WHERE IT RUNS
 *   Anywhere with Node and the agent key (GENESIS_AJAN_KEY). It is not tied
 *   to the founder's machine: the key is the agent, the state is on chain,
 *   and every step but writing memory (learning, measuring, relaying) is
 *   permissionless — anyone may run those parts with their own gas.
 *
 * INBOX RULES (verification against poisoned input, version 1)
 *   R1  valid UTF-8, 20–1500 bytes
 *   R2  no links, no @handles, and no 0x address that is not one of ARC
 *       PULSE's own deployments (stops scam links and fake contracts)
 *   R3  not already in memory
 *   R4  corroboration: the same text proposed by at least two different
 *       addresses, the first proposal at least 24 hours old
 *   R1–R3 failures are rejected with the rule as reason; a candidate that
 *   passes them but lacks R4 waits. What these rules do NOT do: check that
 *   a claim is true. They make poisoning cost several addresses and a day,
 *   and every acceptance is a public record that can be audited. Truth
 *   checks against chain data are the next module.
 *
 * HONEST LIMITS OF VERSION 1
 *   GENESIS-0 learns by counting (no gradient training); learning cannot
 *   be undone, so a regression is recorded and learning from the inbox is
 *   paused rather than rolled back. GENESIS does not yet write its own
 *   code: modules are proposed by the agent key and go through the
 *   on-chain time lock. Both are stated in memory, not hidden.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes, toUtf8String, AbiCoder, solidityPacked } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const KOMUT = process.argv[2];
const B = (n) => JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8")).abi;
const anahtar = (dosya, ad) => fs.readFileSync(dosya, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m"))[1].trim();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const EV = "arc";                       // where the agent writes; cheapest gas, USDC
const ZINCIRLER = ["arc", "robinhood", "base", "arbitrum", "avalanche", "monad", "bsc"];
const BILGI = 2, OGRENME = 3, GUVENLIK = 7, KESIF = 8, PERFORMANS = 9, ZINCIRDE = 0;
/* lzReceive gas for a relayed batch, from the stored bytes. 15 Oct 2026 the
   first batch of the mainnet relay ran out on every chain (150k + 120k per
   record = 1.11M; Robinhood needed 1,930,171) and the core dropped every
   later batch as a gap. genesis-test measured delivery through the real
   endpoint path: 8 x 400 B = 3,224,665 gas, 8 x 1000 B = 6,677,798,
   8 x 4096 B = 24,139,502 — about 115k per record + 720 per byte. Budget:
   250k + 150k per record + 750 per byte (the test holds it to that). A
   batch is filled until its budget would pass PARTI_GAZ, so no destination
   is asked for more than one block comfortably holds. */
const yayGazi = (adet, bayt) => 250000 + 150000 * adet + 750 * bayt;
const PARTI_GAZ = 6000000;
const secenek = (adet, bayt) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, yayGazi(adet, bayt)]);
/* how many records from `ilk` fit one batch (at least one, at most 8) */
function partiAdedi(boyutlar, ilk, son) {
  let adet = 0, bayt = 0;
  while (ilk + adet < son && adet < 8) {
    const b = boyutlar[ilk + adet] || 0;
    if (adet > 0 && yayGazi(adet + 1, bayt + b) > PARTI_GAZ) break;
    adet++; bayt += b;
  }
  return { adet, bayt };
}

function adresler() {
  const s = fs.readFileSync(path.join(KOK, "docs", "js", "genesis-adres.js"), "utf8");
  return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
}

async function israr(f) {
  for (let d = 0; ; d++) {
    try { return await f(); }
    catch (e) {
      const m = (e.shortMessage || e.message || "") + JSON.stringify(e.info || {});
      if (d > 7 || !/rate|limit|timeout|503|502|429|ECONNRESET|fetch failed|coalesce/i.test(m)) throw e;
      await bekle(2500 * (d + 1));
    }
  }
}

function baglam(ad) {
  const g = adresler();
  const z = EVM[ad];
  const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
  const w = new Wallet(anahtar(path.join(KOK, ".env"), "GENESIS_AJAN_KEY"), p);
  return { ad, z, p, w, c: new Contract(g.cekirdek, B("GenesisCekirdek"), w), d: new Contract(g.dil, B("GenesisDil"), w) };
}

async function canli(b) {
  return (await israr(() => b.p.getCode(b.c.target))).length > 2;
}

async function tx(b, etiket, f) {
  if (!UYGULA) { console.log("   (kuru) " + etiket); return null; }
  const t = await israr(f);
  let m = null; while (!m) { await bekle(1500); m = await israr(() => b.p.getTransactionReceipt(t.hash)); }
  console.log("   " + etiket.padEnd(30) + t.hash + (m.status === 1 ? "" : "  BASARISIZ"));
  if (m.status !== 1) throw new Error(etiket);
  return m;
}

async function kayitlar(b, eid) {
  const n = Number(await israr(() => b.c.kayitSayisi(eid)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const [k, v] = await israr(() => b.c.kayitVeri(eid, i));
    out.push({ eid, sira: i, tur: Number(k.tur), saklama: Number(k.saklama), icerikHash: k.icerikHash, zincirHash: k.zincirHash, veri: v });
  }
  return out;
}

async function tumKayitlar(b) {
  const out = [];
  for (const ad of ZINCIRLER) out.push(...(await kayitlar(b, EVM[ad].eid)));
  return out;
}

/* ---- commands ------------------------------------------------------- */

async function durum() {
  for (const ad of ZINCIRLER) {
    const b = baglam(ad);
    try {
      if (!(await canli(b))) { console.log(ad.padEnd(10) + " zincirde degil"); continue; }
      const sayilar = [];
      for (const a of ZINCIRLER) sayilar.push(a + ":" + (await israr(() => b.c.kayitSayisi(EVM[a].eid))));
      const kok = await israr(() => b.c.hafizaKoku());
      const [ks, bs] = await israr(() => b.d.durum());
      console.log(ad.padEnd(10) + " kok " + kok.slice(0, 14) + "  kayit " + sayilar.join(" ") + "  GENESIS-0: " + ks + " kayit, " + bs + " bayt");
    } catch (e) { console.log(ad.padEnd(10) + " okunamadi: " + (e.shortMessage || e.message).slice(0, 60)); }
  }
}

async function tohum() {
  const b = baglam(EV);
  if (!(await canli(b))) throw new Error("cekirdek " + EV + " uzerinde yok");
  const mevcut = new Set((await tumKayitlar(b)).map((k) => k.icerikHash));
  const { bilgiler } = JSON.parse(fs.readFileSync(path.join(KOK, "genesis", "bilgi-tohum.json"), "utf8"));
  let yazilan = 0;
  for (const f of bilgiler) {
    const metin = f.metin + " Source: " + f.kaynak;
    const v = toUtf8Bytes(metin);
    const h = keccak256(v);
    if (mevcut.has(h)) continue;
    await tx(b, "bilgi " + metin.slice(0, 24), () => b.c.yaz(BILGI, ZINCIRDE, h, v));
    yazilan++;
  }
  console.log("tohum: " + yazilan + " yeni bilgi" + (UYGULA ? "" : " (kuru)"));
  return yazilan;
}

async function basliklar() {
  const bilgi = require("./genesis-bilgi");
  const r = bilgi.kontrol();
  if (r.hatalar.length) throw new Error("bilgi tabani gizlilik denetiminden gecmedi: " + r.hatalar.join("; "));
  const b = baglam(EV);
  if (!(await canli(b))) throw new Error("cekirdek " + EV + " uzerinde yok");
  const mevcut = new Set((await tumKayitlar(b)).map((k) => k.icerikHash));
  let yazilan = 0;
  for (const m of bilgi.hepsi()) {
    const { v, h } = bilgi.zincirKaydi(m);
    if (mevcut.has(h)) continue;
    const tur = m.dosya === "arastirma.json" ? KESIF : BILGI;
    await tx(b, "baslik " + m.baslik.slice(0, 30), () => b.c.yaz(tur, ZINCIRDE, h, v));
    yazilan++;
  }
  console.log("basliklar: " + yazilan + " yeni konu basligi" + (UYGULA ? "" : " (kuru)"));
  return yazilan;
}

function kuralR1R2(metin, bilinen) {
  const bayt = Buffer.byteLength(metin, "utf8");
  if (bayt < 20 || bayt > 1500) return "R1 boyut";
  if (/https?:\/\/|www\.|\.(com|io|xyz|org|net)\b/i.test(metin)) return "R2 baglanti";
  if (/(^|\s)@\w/.test(metin)) return "R2 hesap etiketi";
  for (const a of metin.match(/0x[0-9a-fA-F]{40}/g) || []) if (!bilinen.has(a.toLowerCase())) return "R2 bilinmeyen adres";
  return null;
}

function bilinenAdresler() {
  const set = new Set();
  const topla = (o) => { if (!o) return; if (typeof o === "string" && /^0x[0-9a-fA-F]{40}$/.test(o)) set.add(o.toLowerCase()); else if (typeof o === "object") Object.values(o).forEach(topla); };
  for (const f of fs.readdirSync(KOK)) if (/^dagitim-.*\.json$/.test(f)) { try { topla(JSON.parse(fs.readFileSync(path.join(KOK, f), "utf8"))); } catch (e) { /* skip */ } }
  return set;
}

async function oneriler() {
  const b = baglam(EV);
  if (!(await canli(b))) throw new Error("cekirdek yok");
  const n = Number(await israr(() => b.c.oneriSayisi()));
  const mevcut = new Set((await tumKayitlar(b)).map((k) => k.icerikHash));
  const bilinen = bilinenAdresler();
  const liste = [];
  for (let i = 0; i < n; i++) {
    const o = await israr(() => b.c.oneriler(i));
    liste.push({ id: i, gonderen: o.gonderen, tur: Number(o.tur), zaman: Number(o.zaman), h: o.icerikHash, durum: Number(o.durum) });
  }
  const simdi = Math.floor(Date.now() / 1000);
  let kabul = 0, ret = 0, bekleyen = 0;
  for (const o of liste.filter((x) => x.durum === 1)) {
    const v = await israr(() => b.c.veri(o.h));
    let metin;
    try { metin = toUtf8String(v); } catch (e) { metin = null; }
    const sebep = metin == null ? "R1 utf8" : mevcut.has(o.h) ? "R3 zaten hafizada" : kuralR1R2(metin, bilinen);
    if (sebep) {
      await tx(b, "ret #" + o.id + " " + sebep, () => b.c.ret(o.id, keccak256(toUtf8Bytes(sebep))));
      ret++;
      continue;
    }
    const ayni = liste.filter((x) => x.h === o.h);
    const kisiler = new Set(ayni.map((x) => x.gonderen.toLowerCase()));
    const ilk = Math.min(...ayni.map((x) => x.zaman));
    if (kisiler.size >= 2 && simdi - ilk >= 86400) {
      await tx(b, "kabul #" + o.id, () => b.c.kabul(o.id));
      mevcut.add(o.h);
      kabul++;
      for (const x of ayni) if (x.id !== o.id && x.durum === 1) x.durum = 9;   // the others are now duplicates
    } else bekleyen++;
  }
  console.log("oneriler: " + kabul + " kabul, " + ret + " ret, " + bekleyen + " bekliyor (R4)");
  return { kabul, ret, bekleyen };
}

async function ogren(ad = EV, parca = 200) {
  const b = baglam(ad);
  if (!(await canli(b))) throw new Error("cekirdek yok: " + ad);
  let n = 0;
  for (const k of await tumKayitlar(b)) {
    if (k.tur !== BILGI || k.saklama !== ZINCIRDE) continue;
    if (await israr(() => b.d.bitti(k.zincirHash))) continue;
    let tamam = false;
    while (!tamam) {
      await tx(b, "ogren " + k.eid + "/" + k.sira, () => b.d.ogren(k.eid, k.sira, parca));
      if (!UYGULA) break;
      tamam = await israr(() => b.d.bitti(k.zincirHash));
    }
    n++;
  }
  console.log("ogren (" + ad + "): " + n + " kayit");
  return n;
}

async function olc(kaydet = true) {
  const b = baglam(EV);
  const { metinler } = JSON.parse(fs.readFileSync(path.join(KOK, "genesis", "dogrulama.json"), "utf8"));
  let top = 0, bayt = 0;
  for (const m of metinler) {
    const v = toUtf8Bytes(m);
    top += Number(await israr(() => b.d.kayip(v))) * v.length;
    bayt += v.length;
  }
  const kayip = Math.round(top / bayt);
  const [ks, bs] = await israr(() => b.d.durum());
  const olcum = { model: "GENESIS-0", kayip_mbit_bayt: kayip, dogrulama_bayt: bayt, ogrenilen_kayit: Number(ks), ogrenilen_bayt: Number(bs), zaman: new Date().toISOString() };
  console.log("olc: " + JSON.stringify(olcum));
  if (kaydet) {
    const v = toUtf8Bytes(JSON.stringify(olcum));
    await tx(b, "performans kaydi", () => b.c.yaz(PERFORMANS, ZINCIRDE, keccak256(v), v));
  }
  return olcum;
}

/* The receiving core accepts a batch only when it starts at its current
 * count; LayerZero executes unordered, so a later batch that lands first is
 * dropped (15 Oct: 22 batches sent at once, most past the first per chain
 * were lost though DELIVERED). So one batch per (target, origin) is in
 * flight at a time: send it, wait until the target's count moves, repeat. */
async function yay() {
  const kaynak = baglam(EV);
  const evSayilari = {}, boyutlar = {};
  for (const a of ZINCIRLER) {
    evSayilari[a] = Number(await israr(() => kaynak.c.kayitSayisi(EVM[a].eid)));
    boyutlar[a] = evSayilari[a] ? (await kayitlar(kaynak, EVM[a].eid)).map((k) => (k.veri && k.veri.length > 2 ? (k.veri.length - 2) / 2 : 0)) : [];
  }
  const hedefler = [];
  for (const hedef of ZINCIRLER.filter((a) => a !== EV)) {
    const h = baglam(hedef);
    if (!(await canli(h))) { console.log("yay " + hedef + ": zincirde degil"); continue; }
    hedefler.push([hedef, h]);
  }
  for (let tur = 0; tur < 50; tur++) {
    const yolda = [];
    for (const [hedef, h] of hedefler) {
      for (const ori of ZINCIRLER) {
        const eid = EVM[ori].eid;
        if (ori === hedef) continue;
        const ilk = Number(await israr(() => h.c.kayitSayisi(eid)));
        if (ilk >= evSayilari[ori]) continue;
        const { adet, bayt } = partiAdedi(boyutlar[ori], ilk, evSayilari[ori]);
        const opt = secenek(adet, bayt);
        const f = await israr(() => kaynak.c.yayUcreti(EVM[hedef].eid, eid, ilk, adet, opt));
        await tx(kaynak, "yay " + ori + "->" + hedef + " " + ilk + "+" + adet, () => kaynak.c.yay(EVM[hedef].eid, eid, ilk, adet, opt, { value: f.nativeFee }));
        yolda.push({ h, hedef, eid, ilk });
      }
    }
    if (!yolda.length) { console.log("yay: her zincir esit"); return; }
    if (!UYGULA) { console.log("(kuru) ilk tur yukarida; sonraki turlar teslimden sonra gider"); return; }
    /* wait up to 10 minutes for every batch of this round to land */
    for (let i = 0; i < 60 && yolda.length; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      for (let j = yolda.length - 1; j >= 0; j--) {
        const y = yolda[j];
        if (Number(await israr(() => y.h.c.kayitSayisi(y.eid))) > y.ilk) yolda.splice(j, 1);
      }
    }
    if (yolda.length) throw new Error("teslim gelmedi: " + yolda.map((y) => y.hedef + " " + y.ilk).join(", "));
  }
}

async function modeller() {
  const b = baglam(EV);
  const g = adresler();
  const coder = AbiCoder.defaultAbiCoder();
  const id0 = keccak256(toUtf8Bytes("GENESIS-0"));
  const mevcut0 = await israr(() => b.c.model(id0));
  if (mevcut0.id === "0x" + "0".repeat(64)) {
    const mimari = keccak256(toUtf8Bytes("byte-level interpolated trigram, counts as parameters, contracts/genesis/GenesisDil.sol"));
    await tx(b, "model GENESIS-0 (mod 1)", () => b.c.modelKaydet([id0, "0x" + "0".repeat(64), "0x" + "0".repeat(64), mimari, "0x" + "0".repeat(64), 1, g.dil, "onchain:GenesisDil"]));
  } else console.log("GENESIS-0 kayitli");
  /* the in-browser open model, mode 3: weights hash from the publisher */
  const depo = "onnx-community/Qwen2.5-0.5B-Instruct", dosya = "onnx/model_q4f16.onnx";
  const id1 = keccak256(toUtf8Bytes(depo + "/" + dosya));
  const mevcut1 = await israr(() => b.c.model(id1));
  if (mevcut1.id !== "0x" + "0".repeat(64)) { console.log(depo + " kayitli"); return; }
  const agac = await fetch("https://huggingface.co/api/models/" + depo + "/tree/main/onnx").then((r) => r.json());
  const f = agac.find((x) => x.path === dosya);
  if (!f || !f.lfs) throw new Error("agirlik ozeti okunamadi");
  const agirlik = "0x" + f.lfs.oid;     // sha256 of the weights file, as published
  const mimari = keccak256(toUtf8Bytes("Qwen2.5-0.5B-Instruct, Apache-2.0, ONNX q4f16, transformers.js in the browser"));
  console.log("   " + depo + " sha256 " + f.lfs.oid + " (" + f.lfs.size + " bayt)");
  await tx(b, "model Qwen2.5-0.5B (mod 3)", () => b.c.modelKaydet([id1, "0x" + "0".repeat(64), agirlik, mimari, "0x" + "0".repeat(64), 3, "0x" + "0".repeat(40), "hf:" + depo + "/" + dosya]));
}

async function dongu() {
  console.log("== GOZLEMLE");
  await durum();
  console.log("== ONERILER");
  const o = await oneriler();
  console.log("== OLC (once)");
  const once = await olc(false);
  console.log("== OGREN");
  const n = await ogren();
  let sonra = once;
  if (n > 0 && UYGULA) {
    console.log("== OLC (sonra)");
    sonra = await olc(true);
  }
  const ozet = { dongu: new Date().toISOString(), oneri: o, ogrenilen_kayit: n, kayip_once: once.kayip_mbit_bayt, kayip_sonra: sonra.kayip_mbit_bayt };
  const b = baglam(EV);
  const v = toUtf8Bytes(JSON.stringify(ozet));
  if (sonra.kayip_mbit_bayt > once.kayip_mbit_bayt) {
    /* learning made the model worse on held-out text: record it, and stop
       taking inbox records until a person or a new module looks at it */
    console.log("GERILEME: " + once.kayip_mbit_bayt + " -> " + sonra.kayip_mbit_bayt);
    await tx(b, "guvenlik: ogrenme gerilemesi", () => b.c.yaz(GUVENLIK, ZINCIRDE, keccak256(v), v));
  } else if (n > 0) {
    await tx(b, "ogrenme kaydi", () => b.c.yaz(OGRENME, ZINCIRDE, keccak256(v), v));
  }
  console.log("== YAY");
  await yay();
  console.log(JSON.stringify(ozet));
}

/* INVENTION ENGINE (genesis/icat/): runs the bench and, once the core is on
   chain, records each experiment as category 11 (algorithm). Activated only
   after GENESIS is deployed, as the founder asked. */
async function icat() {
  const { DENEYLER } = require("../genesis/icat/tezgah.js");
  const b = baglam(EV);
  const canliMi = await canli(b);
  for (const ad of ["karsilastirma", "duvar-tarama", "panik"]) {
    const sonuc = DENEYLER[ad](20);
    const v = toUtf8Bytes(JSON.stringify({ icat: ad, zaman: new Date().toISOString(), tohumlar: 20, sonuc }).slice(0, 4000));
    if (!canliMi) { console.log("icat " + ad + ": " + sonuc.length + " satir (cekirdek zincirde degil, hafizaya yazilmadi)"); continue; }
    await tx(b, "icat " + ad, () => b.c.yaz(11, ZINCIRDE, keccak256(v), v));
  }
}

const KOMUTLAR = { icat, durum, tohum, basliklar, oneriler, ogren: () => ogren(), olc: () => olc(UYGULA), yay, modeller, dongu };
(KOMUTLAR[KOMUT] || (async () => console.log("komut: " + Object.keys(KOMUTLAR).join(" | "))))()
  .catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
