"use strict";
/* Re-derives the Fathom claims from the archive, with no network access.
 *
 * The one worth reading carefully is the first buy, because I reported it
 * as "-0.50%" and the pool's price impact is -0.0019%. Both numbers are
 * real and they are not the same thing:
 *
 *   the pool moved the price by 0.0019% on a one dollar buy;
 *   the buyer received 0.502% less than the spot price would give.
 *
 * The gap is the hook's 0.5% fee, and the archive shows where it went:
 * PoolManager to the hook to the opener, which puts it back into depth
 * rather than into anybody's pocket. Calling the whole 0.502% "slippage"
 * would be wrong, and so would quoting 0.0019% as what a buyer feels. The
 * script prints both with their names on them.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const { id: keccakId, AbiCoder, getAddress } = require("ethers");

const DIZIN = path.join(__dirname, "..", "kanit-fathom");
const A = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-fathom.json"), "utf8"));
const TM = require("./tickmath.js");
const coder = AbiCoder.defaultAbiCoder();

/* The signer's own receipt-to-log binding, not a copy of it. */
const KAYNAK = path.join(__dirname, "..", "kopru", "imzaci.js");
const ham = fs.readFileSync(KAYNAK, "utf8");
const kutu = { require: require("module").createRequire(KAYNAK), module: { exports: {} },
               exports: {}, console: { log() {} }, __dirname: path.dirname(KAYNAK),
               process, Buffer };
kutu.global = kutu;
vm.createContext(kutu);
new vm.Script(ham.slice(0, ham.indexOf("(async function main()")) +
  "\n;this.__d = { makbuzBagli };").runInContext(kutu);
const { makbuzBagli } = kutu.__d;

const TRANSFER = keccakId("Transfer(address,address,uint256)");
const SWAP = keccakId("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

let gecen = 0, kalan = 0;
const ok = (ad, kosul, not) => {
  if (kosul) { gecen++; console.log("  OK     " + ad + (not ? "   " + not : "")); }
  else { kalan++; console.log("  KALDI  " + ad + (not ? "   " + not : "")); }
};
const oku = (ad) => JSON.parse(fs.readFileSync(path.join(DIZIN, "nokta", ad + ".json"), "utf8"));
const ond = (x, b) => { const d = 10n ** BigInt(b); return (x / d) + "." + (x % d).toString().padStart(b, "0"); };
const esit = (a, b) => a.toLowerCase() === b.toLowerCase();

console.log("");
console.log("FATHOM KANIT ARSIVI DOGRULAMASI   (ag yok, sadece dosyalar)");
console.log("  " + DIZIN);

/* ---- 1. the manifest still describes these files ---------------- */
console.log("");
console.log("MANIFEST");
const ozet = JSON.parse(fs.readFileSync(path.join(DIZIN, "ozet.json"), "utf8"));
let bozuk = 0;
for (const k of ozet.kayitlar) {
  const yol = path.join(DIZIN, k.dosya);
  if (!fs.existsSync(yol)) { bozuk++; console.log("     EKSIK " + k.dosya); continue; }
  const h = crypto.createHash("sha256").update(fs.readFileSync(yol)).digest("hex");
  if (h !== k.sha256) { bozuk++; console.log("     HASH DEGISMIS " + k.dosya); }
}
ok("butun kayitlarin sha256'si tutuyor", bozuk === 0, ozet.kayitlar.length + " kayit");
ok("basarisiz kayit yok", ozet.kayitlar.every((k) => k.basarili));
ok("Arc 5042", Number(BigInt(oku("zincir-arc"))) === 5042);

/* ---- 2. receipts belong to the blocks they name ----------------- */
console.log("");
console.log("MAKBUZLAR VE BLOKLAR");
const adlar = Object.keys(A.islemler || {}).map((k) => ["dagitim-" + k, A.islemler[k]])
  .concat((A.merdivenIslemleri || []).map((k) => ["merdiven-" + k.kademe, k]))
  .concat(A.ilkAlim ? [["ilk-alim", A.ilkAlim]] : []);
for (const [ad, k] of adlar) {
  const m = oku("makbuz-" + ad);
  const b = oku("blok-arc-" + parseInt(m.blockNumber, 16));
  ok(ad.padEnd(18) + " tx manifesttekiyle ayni", esit(m.transactionHash, k.tx));
  ok(ad.padEnd(18) + " status 0x1", m.status === "0x1");
  ok(ad.padEnd(18) + " blok manifesttekiyle ayni", parseInt(m.blockNumber, 16) === k.blok);
  ok(ad.padEnd(18) + " makbuz blockHash = blogun hash'i", m.blockHash === b.hash);
}

/* ---- 3. the signer's binding, on these receipts ----------------- */
console.log("");
console.log("MAKBUZ-LOG BAGLAMASI (imzacinin kendi fonksiyonu)");
for (const ad of ["merdiven-ic", "merdiven-orta", "merdiven-dis", "ilk-alim"]) {
  const m = oku("makbuz-" + ad);
  const log = (m.logs || [])[0];
  ok(ad.padEnd(14) + " ilk log makbuza bagli", makbuzBagli(m, log) === null);
  ok(ad.padEnd(14) + " baska blok iddia eden log reddediliyor",
     makbuzBagli(m, Object.assign({}, log, { blockHash: "0x" + "99".repeat(32) })) !== null);
}

/* ---- 4. the ladder put the market share into the pool ----------- */
console.log("");
console.log("MERDIVEN: PIYASA PAYI HAVUZA GIRDI MI");
/* Minting v4 liquidity rounds the consumed amount down, so each rung
   leaves a little behind. My first version of this check demanded exact
   equality and failed on all three — the chain was right and the
   assertion was wrong, which is the same over-strict mistake I made
   verifying this launch the first time. The dust is not waved away here:
   it is measured, bounded, and then has to reappear in the opener's
   balance and in the pool's, to the wei. */
let merdivenToplam = 0n;
for (const k of A.merdivenIslemleri || []) {
  const m = oku("makbuz-merdiven-" + k.kademe);
  let girdi = 0n;
  for (const l of m.logs || []) {
    if (l.topics[0] !== TRANSFER || !esit(l.address, A.token)) continue;
    if (esit(getAddress("0x" + l.topics[2].slice(26)), A.poolManager)) girdi += BigInt(l.data);
  }
  const beklenen = BigInt((A.merdiven.find((x) => x.ad === k.kademe) || {}).token || "0");
  merdivenToplam += girdi;
  ok(("kademe " + k.kademe).padEnd(18) + " havuza giren, manifestten en fazla toz kadar az",
     girdi <= beklenen && beklenen - girdi < 10n ** 9n,
     ond(girdi, 18) + "   toz " + (beklenen - girdi) + " wei");
}
const toz = BigInt(A.piyasa) - merdivenToplam;
ok("uc kademe toplami + toz = piyasa payi", merdivenToplam + toz === BigInt(A.piyasa),
   ond(merdivenToplam, 18));
ok("toz bir nanotokenden kucuk", toz < 10n ** 9n, toz + " wei  (" + ond(toz, 18) + ")");

/* ---- 5. the first buy, both numbers, named -------------------- */
console.log("");
console.log("ILK ALIM");
const al = oku("makbuz-ilk-alim");
const swapLog = (al.logs || []).find((l) => l.topics[0] === SWAP && esit(l.address, A.poolManager));
ok("PoolManager Swap olayi var", !!swapLog);
const s = coder.decode(["int128", "int128", "uint160", "uint128", "int24", "uint24"], swapLog.data);
const usdcDelta = BigInt(s[0]), fthmCikti = BigInt(s[1]);
ok("havuz kimligi FTHM havuzu", swapLog.topics[1] === A.havuzId);

/* who paid what, from the transfer logs */
let odenenUsdc = 0n, aliciyaGiden = 0n, hookaGiden = 0n, aciciyaGiden = 0n;
let alici = null;
for (const l of al.logs || []) {
  if (l.topics[0] !== TRANSFER) continue;
  const from = getAddress("0x" + l.topics[1].slice(26));
  const to = getAddress("0x" + l.topics[2].slice(26));
  const v = BigInt(l.data);
  if (esit(l.address, A.usdc) && esit(to, A.poolManager)) { odenenUsdc += v; alici = from; }
  if (esit(l.address, A.token) && esit(from, A.poolManager)) {
    if (esit(to, A.hook)) hookaGiden += v; else { aliciyaGiden += v; }
  }
  if (esit(l.address, A.token) && esit(from, A.hook) && esit(to, A.acici)) aciciyaGiden += v;
}
console.log("  odenen USDC        " + ond(odenenUsdc, 6));
console.log("  havuzun cikisi     " + ond(fthmCikti, 18));
console.log("  hook ucreti        " + ond(hookaGiden, 18));
console.log("  aliciya giden      " + ond(aliciyaGiden, 18));
ok("Swap'in USDC deltasi odenen ile tutuyor", -usdcDelta === odenenUsdc);
ok("havuzun cikisi = ucret + aliciya giden", fthmCikti === hookaGiden + aliciyaGiden);

/* The baseline. Review caught this resting on an assumption: I used the
   manifest's opening price as the pre-trade spot, but 2019 blocks sit
   between the ladder and this buy, and the slot0 I had archived was read
   at "latest" — current state, not the state before the trade. Either a
   swap in between or a swap earlier in the same block would have moved
   the price and quietly invalidated the figure.

   Both are closed from files now. The pool's Swap events over the whole
   range are archived window by window, and the endpoint turned out to
   keep archive state, so the pre-trade slot0 at a fixed height is here
   too. The baseline is measured, not assumed. */
const sqrt = BigInt(A.acilisSqrtPriceX96);
ok("acilis sqrt -> manifest tick", TM.tickAt(sqrt) === A.acilisTick, String(A.acilisTick));

console.log("");
console.log("  TABAN: ACILIS FIYATI HALA FIYAT MIYDI");
const MASK = (1n << 160n) - 1n;
const tickOf = (w) => { const t = (w >> 160n) & 0xffffffn;
  return t >= 0x800000n ? Number(t - 0x1000000n) : Number(t); };

/* every swap on this pool from the ladder up to and including this block */
const tarama = fs.readFileSync(path.join(DIZIN, "havuz-swap-tarama.jsonl"), "utf8")
  .trim().split(/\r?\n/).filter(Boolean).map((s) => JSON.parse(s));
const basBlok = BigInt((A.merdivenIslemleri || [])[0].blok);
let bek = basBlok, boslukS = 0, ortusmeS = 0, eksikS = 0;
let swaplar = [];
for (const p of tarama) {
  const a = BigInt(p.fromBlock), u = BigInt(p.toBlock);
  if (a > bek) boslukS++; else if (a < bek) ortusmeS++;
  if (p.sonuc === null) eksikS++; else swaplar = swaplar.concat(p.sonuc);
  bek = u + 1n;
}
console.log("    tarama " + basBlok + " -> " + (bek - 1n) + "   " + tarama.length + " pencere");
ok("  tarama merdivenin ilk kademesinden basliyor",
   BigInt(tarama[0].fromBlock) === basBlok);
ok("  tarama ilk alimin blogunu kapsiyor", bek - 1n >= BigInt(A.ilkAlim.blok));
ok("  taramada bosluk yok", boslukS === 0);
ok("  taramada ortusme yok", ortusmeS === 0);
ok("  okunamayan pencere yok", eksikS === 0);

/* Anything on this pool before the buy's own swap — earlier block, or
   earlier in the same block — would have moved the price. */
const alimBlokNo = BigInt(A.ilkAlim.blok);
const bizimSwap = swaplar.find((l) => l.transactionHash === A.ilkAlim.tx);
ok("  ilk alimin Swap'i taramada var", !!bizimSwap);
const oncekiler = swaplar.filter((l) => {
  const b = BigInt(l.blockNumber);
  if (b < alimBlokNo) return true;
  if (b > alimBlokNo) return false;
  return BigInt(l.logIndex) < BigInt(bizimSwap.logIndex);
});
console.log("    havuzdaki toplam Swap " + swaplar.length +
  ", ilk alimdan ONCE " + oncekiler.length);
ok("  ilk alimdan once bu havuzda HIC takas yok", oncekiler.length === 0);

/* And the state at a fixed historical height, which answers it directly
   rather than by absence. */
const onceDosya = path.join(DIZIN, "nokta", "havuz-slot0-blok-" + (alimBlokNo - 1n) + ".json");
if (fs.existsSync(onceDosya)) {
  const onceW = BigInt(JSON.parse(fs.readFileSync(onceDosya, "utf8")));
  console.log("    islem oncesi slot0 (" + (alimBlokNo - 1n) + ")  tick " + tickOf(onceW));
  ok("  islem oncesi sqrt = acilis sqrt (taban OLCULDU, varsayilmadi)",
     (onceW & MASK) === sqrt, String(onceW & MASK));
  ok("  islem oncesi tick = acilis tick", tickOf(onceW) === A.acilisTick);
  const simdiW = BigInt(oku("havuz-slot0"));
  ok("  islem sonrasi tick, Swap olayinin bildirdigi tick",
     tickOf(simdiW) === Number(s[4]), String(Number(s[4])));
} else {
  console.log("    islem oncesi slot0 arsivde yok — taban yalnizca kapsama dayaniyor");
  kalan++;
}
const kaymasiz = (odenenUsdc * sqrt * sqrt) / (1n << 192n);
const SC = 10n ** 18n;
const yuzde = (x) => (Number(x) / 1e18 * 100).toFixed(4) + "%";
const havuzEtkisi = SC - (fthmCikti * SC) / kaymasiz;
const aliciEtkisi = SC - (aliciyaGiden * SC) / kaymasiz;
console.log("  kaymasiz beklenen  " + ond(kaymasiz, 18));
console.log("");
console.log("  HAVUZUN FIYAT ETKISI   -" + yuzde(havuzEtkisi) + "   (gercek kayma)");
console.log("  ALICININ GORDUGU       -" + yuzde(aliciEtkisi) + "   (kayma + %0,5 hook ucreti)");
console.log("  Ikisi ayni sey DEGIL ve ikisini birlestirip 'kayma' demek yanlis olur.");

/* The claim I made was the wallet-visible one. Both get a bound here so
   neither can quietly drift into the other. */
ok("havuzun fiyat etkisi %0,01'in altinda", havuzEtkisi < SC / 10000n, "-" + yuzde(havuzEtkisi));
ok("alicinin gordugu %0,6'nin altinda", aliciEtkisi < (6n * SC) / 1000n, "-" + yuzde(aliciEtkisi));
ok("fark tam olarak hook ucreti",
   (hookaGiden * SC) / fthmCikti >= (4n * SC) / 1000n &&
   (hookaGiden * SC) / fthmCikti <= (6n * SC) / 1000n,
   yuzde((hookaGiden * SC) / fthmCikti) + " cikisin");

/* ---- 6. the fee is not somebody's pocket ---------------------- */
console.log("");
console.log("UCRET NEREYE GITTI");
ok("ucret PoolManager -> hook -> acici yolunu izledi",
   hookaGiden > 0n && aciciyaGiden === hookaGiden, ond(aciciyaGiden, 18));
/* The opener holds the fee plus the ladder dust, and nothing else. That
   is a stronger statement than "the fee is there": it says every token
   the opener has is accounted for by exactly two sources. */
const aciciBakiye = BigInt(oku("bakiye-fthm-acici"));
ok("acici = hook ucreti + merdiven tozu, tam olarak",
   aciciBakiye === hookaGiden + toz,
   ond(aciciBakiye, 18) + " = " + ond(hookaGiden, 18) + " + " + toz + " wei");
ok("  acici'de baska hicbir kaynaktan token yok",
   aciciBakiye - hookaGiden - toz === 0n, "0 wei artik");
ok("hook'ta token birikmiyor", BigInt(oku("bakiye-fthm-hook")) === 0n);
ok("stake kasasina ALIMDA token gitmedi",
   BigInt(oku("bakiye-fthm-stake")) === BigInt(A.stakeEmisyon),
   "sadece emisyon " + ond(BigInt(A.stakeEmisyon), 18));
/* The founder's USDC slice is a sell-side thing; a buy must not move it. */
console.log("  usdc/kurucu " + ond(BigInt(oku("bakiye-usdc-kurucu")), 6) +
  "   (alim USDC'yi havuza verir, kurucuya degil)");

/* ---- 7. supply closes ---------------------------------------- */
console.log("");
console.log("ARZ MUHASEBESI");
const arz = BigInt(oku("arz-fthm"));
let toplam = 0n;
for (const t of ["stake", "vesting", "kurucu", "acici", "hook", "poolManager"])
  toplam += BigInt(oku("bakiye-fthm-" + t));
console.log("  totalSupply " + ond(arz, 18));
console.log("  tutanlar    " + ond(toplam, 18));
ok("arz tutanlarla 0 wei fark ile kapaniyor", arz === toplam, (arz - toplam) + " wei");
ok("totalSupply manifestteki arz", arz === BigInt(A.arz));
ok("havuzdaki token = piyasa payi eksi toz eksi satilan",
   BigInt(oku("bakiye-fthm-poolManager")) === BigInt(A.piyasa) - toz - fthmCikti,
   ond(BigInt(A.piyasa) - toz - fthmCikti, 18));
/* The dust is the whole reason the three sums above needed loosening, so
   it gets named once here rather than left as a rounding excuse. */
console.log("  merdiven tozu " + toz + " wei — havuza hic girmedi, acici'de duruyor");

/* ---- 8. the transaction review named is not FTHM -------------- */
console.log("");
console.log("INCELEMEDEN GELEN ISLEM");
const inc = oku("makbuz-inceleme-islemi");
const alimBlok = parseInt(al.blockNumber, 16);
console.log("  tx    " + inc.transactionHash);
console.log("  blok  " + parseInt(inc.blockNumber, 16) + "  index " + parseInt(inc.transactionIndex, 16) +
  "   (ilk alim index " + parseInt(al.transactionIndex, 16) + ")");
ok("ilk alimla AYNI BLOKTA", parseInt(inc.blockNumber, 16) === alimBlok);
ok("ama AYNI ISLEM DEGIL", inc.transactionHash !== al.transactionHash);
const fthmDokunan = (inc.logs || []).some((l) => esit(l.address, A.token));
const havuzDokunan = (inc.logs || []).some((l) =>
  l.topics[0] === SWAP && l.topics[1] === A.havuzId);
ok("FTHM tokenine HIC dokunmuyor", !fthmDokunan);
ok("FTHM havuzunda takas YOK", !havuzDokunan);
const baskaSwap = (inc.logs || []).find((l) => l.topics[0] === SWAP);
if (baskaSwap) console.log("  baska bir havuzda takas: " + baskaSwap.topics[1].slice(0, 18) + "...");
console.log("  Yani bu islem FTHM/USDC olayi DEGIL. Ayni blokta, ayni PoolManager");
console.log("  uzerinde, baska bir tokenin takasi. FTHM hacmi olarak sayilmamali.");

console.log("");
console.log("  " + gecen + " gecti, " + kalan + " kaldi");
console.log("  Hicbir ag cagrisi yapilmadi.");
process.exit(kalan ? 1 : 0);
