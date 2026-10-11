"use strict";
/* Checks the evidence archive without touching a network, so the
 * collateral claim can be examined by someone who trusts neither me nor a
 * throttled endpoint.
 *
 * It uses the signer's own makbuzBagli — the receipt-to-log binding added
 * after review 178 — against real archived receipts rather than fixtures.
 * Everything else is read off the files: whether the manifest hashes still
 * match, whether each receipt belongs to the block it names, whether the
 * Released windows actually tile the vault's whole life with no gaps, and
 * whether the two numbers in the 1:1 claim agree.
 *
 * What this cannot do is prove the archive was fetched honestly. Nothing
 * run locally can. What it does is make every internal inconsistency
 * visible, and leave each item re-fetchable in one call.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const { id: keccakId, getAddress } = require("ethers");

const DIZIN = path.join(__dirname, "..", "kopru", "kanit");
const AYAR = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "relayer", "ayar.json"), "utf8"));
const H = AYAR.hisseler.NVDA;

/* The signer's real binding check, not a copy of it. */
const KAYNAK = path.join(__dirname, "..", "kopru", "imzaci.js");
const ham = fs.readFileSync(KAYNAK, "utf8");
const govde = ham.slice(0, ham.indexOf("(async function main()"));
const kutu = { require: require("module").createRequire(KAYNAK), module: { exports: {} },
               exports: {}, console: { log() {} }, __dirname: path.dirname(KAYNAK),
               process, Buffer };
kutu.global = kutu;
vm.createContext(kutu);
new vm.Script(govde + "\n;this.__d = { makbuzBagli };").runInContext(kutu);
const { makbuzBagli } = kutu.__d;

const MINTED = keccakId("Minted(bytes32,address,uint256)");
const BURNED = keccakId("Burned(address,address,uint256,bytes32)");
const LOCKED = keccakId("Locked(address,address,uint256,uint256)");

let gecen = 0, kalan = 0;
const ok = (ad, kosul, not) => {
  if (kosul) { gecen++; console.log("  OK     " + ad + (not ? "   " + not : "")); }
  else { kalan++; console.log("  KALDI  " + ad + (not ? "   " + not : "")); }
};
const oku = (ad) => JSON.parse(fs.readFileSync(path.join(DIZIN, "nokta", ad + ".json"), "utf8"));
const ond = (x, b) => { const d = 10n ** BigInt(b); return (x / d) + "." + (x % d).toString().padStart(b, "0"); };

console.log("");
console.log("KANIT ARSIVI DOGRULAMASI   (ag yok, sadece dosyalar)");
console.log("  " + DIZIN);

/* ---- 1. the manifest still describes these files ---------------- */
console.log("");
console.log("MANIFEST DOSYALARLA TUTUYOR MU");
const ozet = JSON.parse(fs.readFileSync(path.join(DIZIN, "ozet.json"), "utf8"));
const sweepKayit = ozet.kayitlar.find((k) => k.dosya === "released-rhc.jsonl");
let bozukHash = 0;
for (const k of ozet.kayitlar) {
  const yol = path.join(DIZIN, k.dosya);
  if (!fs.existsSync(yol)) { bozukHash++; console.log("     EKSIK " + k.dosya); continue; }
  const h = crypto.createHash("sha256").update(fs.readFileSync(yol)).digest("hex");
  if (h !== k.sha256) { bozukHash++; console.log("     HASH DEGISMIS " + k.dosya); }
}
ok("butun kayitlarin sha256'si tutuyor", bozukHash === 0,
   ozet.kayitlar.length + " kayit");
ok("manifest basarisiz kayit tasimiyor", ozet.kayitlar.every((k) => k.basarili));
ok("manifest kendi uyarisini tasiyor (arsiv durustluk kaniti degil)",
   typeof ozet.uyari === "string" && ozet.uyari.length > 40);

/* ---- 2. the chains the archive is about ------------------------- */
console.log("");
console.log("ZINCIRLER");
ok("Arc 5042", Number(BigInt(oku("zincir-arc"))) === 5042);
ok("Robinhood 4663", Number(BigInt(oku("zincir-rhc"))) === 4663);

/* ---- 3. every receipt belongs to the block it names ------------- */
console.log("");
console.log("MAKBUZLAR ADINI VERDIKLERI BLOGA AIT MI");
const makbuzlar = [
  ["arc", "mint-a", "0x742fbe4294b6ccfe3209dabcf700d8c4c37c1b05135eaaeba36e5e3ac360b7ec"],
  ["arc", "mint-b", "0x67888679bf274c158a3c35fbf2f006f5ba14110b3a1fe3268aa2c35914d85ba9"],
  ["arc", "yakma",  "0x88bd43e93220239ac8ae369252b02deff19cb134cbc165f2015cf28fe4f5a42a"],
  ["rhc", "kilit-a", "0xdd4478ba9b348698c6cf725b5171a5a9a25997128ca55574b58d68b50f7a0c1d"],
  ["rhc", "kilit-b", "0x2872a7fdf04d6d396742ff12507c08fd003657117e631616d078cae06ab7cfde"]
];
const kayitlar = {};
for (const [grup, ad, tx] of makbuzlar) {
  const m = oku("makbuz-" + grup + "-" + ad);
  kayitlar[grup + "-" + ad] = m;
  const blok = oku("blok-" + grup + "-" + parseInt(m.blockNumber, 16));
  ok(grup + "/" + ad + ": makbuz tx hash dogru", m.transactionHash === tx);
  ok(grup + "/" + ad + ": status 0x1", m.status === "0x1");
  ok(grup + "/" + ad + ": makbuz blockHash = blogun hash'i",
     m.blockHash === blok.hash, blok.hash.slice(0, 18));
  ok(grup + "/" + ad + ": blok numarasi tutuyor",
     BigInt(blok.number) === BigInt(m.blockNumber));
  ok(grup + "/" + ad + ": blok parentHash tasiyor (zincire baglanabilir)",
     /^0x[0-9a-f]{64}$/.test(blok.parentHash || ""));
}

/* ---- 4. the signer's own binding check, on real receipts -------- */
console.log("");
console.log("IMZACININ MAKBUZ BAGLAMASI, GERCEK OLAYLAR UZERINDE");
const logBul = (makbuz, konu, adres) => (makbuz.logs || []).find((l) =>
  l.topics[0] === konu && l.address.toLowerCase() === adres.toLowerCase());

for (const [ad, konu, adres] of [
  ["arc-mint-a", MINTED, H.wrapped], ["arc-mint-b", MINTED, H.wrapped],
  ["arc-yakma", BURNED, H.wrapped],
  ["rhc-kilit-a", LOCKED, H.vault], ["rhc-kilit-b", LOCKED, H.vault]]) {
  const m = kayitlar[ad];
  const log = logBul(m, konu, adres);
  if (!log) { ok(ad + ": beklenen olay makbuzda var", false); continue; }
  ok(ad + ": makbuzBagli kabul ediyor", makbuzBagli(m, log) === null);
  /* And the same check must refuse a log claiming another block. */
  const sahte = Object.assign({}, log, { blockHash: "0x" + "99".repeat(32) });
  ok(ad + ": baska blok iddia eden log REDDEDILIYOR", makbuzBagli(m, sahte) !== null);
}

/* ---- 5. the numbers the finding reports ------------------------- */
console.log("");
console.log("BULGUNUN SAYILARI DOSYALARDAN CIKIYOR MU");
const mintMiktar = (ad) => BigInt(logBul(kayitlar[ad], MINTED, H.wrapped).data);
const kilitHisse = (ad) => {
  const d = logBul(kayitlar[ad], LOCKED, H.vault).data.slice(2);
  return BigInt("0x" + d.slice(64, 128));
};
const mintA = mintMiktar("arc-mint-a"), mintB = mintMiktar("arc-mint-b");
const kilitA = kilitHisse("rhc-kilit-a"), kilitB = kilitHisse("rhc-kilit-b");
console.log("  mint A  " + ond(mintA, 18) + "   kilit A " + ond(kilitA, 18));
console.log("  mint B  " + ond(mintB, 18) + "   kilit B " + ond(kilitB, 18));

ok("CIFT A tutuyor: mint = kilit", mintA === kilitA, ond(mintA, 18));
ok("CIFT B TUTMUYOR: mint > kilit", mintB > kilitB,
   "fazla " + ond(mintB - kilitB, 18));
ok("  fazlalik tam olarak CIFT A'nin kilidi", mintB - kilitB === kilitA,
   "eski relayer birikmis bakiyeyi mint etmis");

/* the lock ids the mints named are the Robinhood transactions archived */
ok("mint A'nin lockId'si kilit A'nin tx hash'i",
   logBul(kayitlar["arc-mint-a"], MINTED, H.wrapped).topics[1] ===
     kayitlar["rhc-kilit-a"].transactionHash);
ok("mint B'nin lockId'si kilit B'nin tx hash'i",
   logBul(kayitlar["arc-mint-b"], MINTED, H.wrapped).topics[1] ===
     kayitlar["rhc-kilit-b"].transactionHash);

const yakmaLog = logBul(kayitlar["arc-yakma"], BURNED, H.wrapped);
const yakmaHisse = BigInt("0x" + yakmaLog.data.slice(2, 66));
const burnId = "0x" + yakmaLog.data.slice(66, 130);
ok("yakilan miktar, karsiliksiz mint ile ayni",
   yakmaHisse === mintB - kilitB, ond(yakmaHisse, 18));
console.log("  burnId " + burnId);

/* ---- 6. the absence claim, as a property of the file ------------ */
console.log("");
console.log("RELEASED YOKLUGU DOSYADAN OKUNUYOR MU");
const satirlar = fs.readFileSync(path.join(DIZIN, "released-rhc.jsonl"), "utf8")
  .trim().split(/\r?\n/).filter(Boolean).map((s) => JSON.parse(s));
const sonBlok = BigInt(oku("son-blok-rhc"));
let beklenen = BigInt(H.vaultStartBlock);
let bosluk = 0, ortusme = 0, tersAralik = 0, eksik = 0, olay = 0;
for (const p of satirlar) {
  const a = BigInt(p.fromBlock), u = BigInt(p.toBlock);
  /* Gaps and overlaps are different failures and were being counted as
     one number. A gap means blocks nobody looked at, which can hide a
     Released. An overlap means a window was counted twice, which inflates
     coverage without adding any. */
  if (a > beklenen) bosluk++;
  else if (a < beklenen) ortusme++;
  if (u < a) tersAralik++;
  if (p.sonuc === null) eksik++;
  else olay += p.sonuc.length;
  beklenen = u + 1n;
}
const kapsam = beklenen - 1n;
console.log("  " + satirlar.length + " pencere, " + H.vaultStartBlock + " -> " + kapsam +
  "  (" + (kapsam - BigInt(H.vaultStartBlock) + 1n) + " blok)");
ok("pencereler kasanin dagitim blogundan basliyor",
   BigInt(satirlar[0].fromBlock) === BigInt(H.vaultStartBlock));
ok("pencereler arasinda BOSLUK YOK", bosluk === 0);
ok("pencereler ORTUSMUYOR", ortusme === 0);
ok("ters aralik YOK", tersAralik === 0);
ok("okunamayan pencere YOK", eksik === 0);
ok("kapsam, arsivlenen son blok ile bitisik", kapsam >= sonBlok, "son-blok " + sonBlok);

/* The boundary belongs in the manifest as data, not only in prose, and it
   has to agree with the file. */
ok("manifest kapsam sinirini veri olarak tasiyor",
   sweepKayit && sweepKayit.kapsamSonBlok !== undefined);
if (sweepKayit && sweepKayit.kapsamSonBlok !== undefined)
  ok("  manifest siniri dosyanin son penceresiyle tutuyor",
     BigInt(sweepKayit.kapsamSonBlok) <= kapsam,
     "manifest " + sweepKayit.kapsamSonBlok);

ok("HIC Released olayi yok", olay === 0);

/* Stated with its boundary, because the flat sentence is false. The
   archive shows nothing came back out up to this block. A Released after
   it would change the conclusion, and nothing here rules that out —
   re-running arsiv-kopru-kanit.js extends the boundary and keeps the
   windows already recorded. */
ok("yani " + kapsam + " BLOGUNA KADAR yakilan " + ond(yakmaHisse, 18) +
   " hissenin karsiligi kasadan cikmamis",
   olay === 0 && eksik === 0 && bosluk === 0 && ortusme === 0);
if (sweepKayit && sweepKayit.kapsamZamani) {
  const yas = (Date.now() - Date.parse(sweepKayit.kapsamZamani)) / 3600000;
  console.log("  sinir " + sweepKayit.kapsamZamani + " tarihinde cizildi (" +
    yas.toFixed(1) + " saat once)");
  console.log("  Bundan SONRASI icin bu arsiv hicbir sey soylemiyor. Siniri");
  console.log("  ilerletmek: node scripts/arsiv-kopru-kanit.js");
}

/* ---- 7. and the 1:1 that hides both ---------------------------- */
console.log("");
console.log("TOPLAMLARIN TUTMASI IKI KUSURU NASIL SAKLIYOR");
const arz = BigInt(oku("arz-wnvda"));
const kasa = BigInt(oku("kasa-bakiye"));
console.log("  wNVDA arz      " + ond(arz, 18));
console.log("  kasa bakiyesi  " + ond(kasa, 18));
ok("arz = kasa bakiyesi (defter birebir tutuyor)", arz === kasa);
ok("toplam mint eksi yakma = arz", mintA + mintB - yakmaHisse === arz);
ok("toplam kilit = kasa bakiyesi", kilitA + kilitB === kasa);
console.log("  Iki kusur birbirini TAM goturuyor: karsiliksiz mint " +
  ond(mintB - kilitB, 18));
console.log("  ile karsiligi cikmayan yakma " + ond(yakmaHisse, 18) + " esit.");
console.log("  Toplamlari karsilastiran bir denetim buna saglikli der.");

console.log("");
console.log("  " + gecen + " gecti, " + kalan + " kaldi");
console.log("  Hicbir ag cagrisi yapilmadi.");
process.exit(kalan ? 1 : 0);
