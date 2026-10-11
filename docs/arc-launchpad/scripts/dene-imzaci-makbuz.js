"use strict";
/* Two review findings on the signer, tested against the signer's own code
 * rather than a copy of it: the module body is loaded and the real
 * makbuzBagli / imlecKarari / imleciYaz are called.
 *
 *   1. The receipt was only checked for status. Nothing tied it to the log
 *      being signed — not the block it came from, not the log's presence
 *      inside it. A re-included transaction hands the signer a "succeeded"
 *      receipt from a history the log does not belong to.
 *
 *   2. On a failed canonicality check the loop did `continue` while the
 *      cursor still advanced past that block at the end of the round. The
 *      event was never looked at again and the withdrawal silently never
 *      happened — the quietest of the two, and the more expensive.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const KAYNAK = path.join(__dirname, "..", "kopru", "imzaci.js");
const ham = fs.readFileSync(KAYNAK, "utf8");
const kes = ham.indexOf("(async function main()");
if (kes < 0) { console.log("imzaci.js icinde main() bulunamadi"); process.exit(1); }

/* The module body only. The signer is a script rather than a module, and
   running main() would go to the network. */
const govde = ham.slice(0, kes);
/* A require that resolves from kopru/, so the body finds ./ozet.js —
   the same module the signer and the submitter both use, loaded for real. */
const kopruRequire = require("module").createRequire(KAYNAK);
const kutu = { require: kopruRequire, module: { exports: {} }, exports: {}, console,
               __dirname: path.join(__dirname, "..", "kopru"), process, Buffer };
kutu.global = kutu;
vm.createContext(kutu);
try {
  new vm.Script(govde +
    "\n;this.__d = { makbuzBagli, imlecKarari, imleciYaz, yapilandirmaOku, atlananiYaz };")
    .runInContext(kutu);
} catch (e) {
  console.log("govde yuklenemedi: " + e.message);
  process.exit(1);
}
const { makbuzBagli, imlecKarari, imleciYaz, yapilandirmaOku, atlananiYaz } = kutu.__d;

let gecen = 0, kalan = 0;
const ok = (ad, kosul) => {
  if (kosul) { gecen++; console.log("  OK     " + ad); }
  else { kalan++; console.log("  KALDI  " + ad); }
};

/* ---- 1. the receipt has to be a receipt for THIS log ----------- */
console.log("");
console.log("MAKBUZ, IMZALANACAK LOGA BAGLI MI");

const LOG = {
  transactionHash: "0x" + "11".repeat(32),
  blockHash:       "0x" + "22".repeat(32),
  blockNumber: "0x1000",
  logIndex: "0x3",
  address: "0xAbD31A537E089D8a12b928aF7837C148dE2Bd2de",
  topics: ["0x" + "aa".repeat(32), "0x" + "bb".repeat(32)],
  data: "0x" + "cd".repeat(64)
};
const iyiMakbuz = () => ({
  transactionHash: LOG.transactionHash,
  blockHash: LOG.blockHash,
  status: "0x1",
  logs: [{ logIndex: "0x1", address: LOG.address, topics: LOG.topics, data: "0x00" },
         { logIndex: LOG.logIndex, address: LOG.address, topics: LOG.topics, data: LOG.data }]
});

ok("dogru makbuz, logu iceriyor -> KABUL", makbuzBagli(iyiMakbuz(), LOG) === null);

let m = iyiMakbuz(); m.blockHash = "0x" + "99".repeat(32);
ok("makbuz baska bloktan -> RED (yeniden dahil edilmis islem)",
   makbuzBagli(m, LOG) !== null);

m = iyiMakbuz(); m.transactionHash = "0x" + "99".repeat(32);
ok("makbuz baska islemden -> RED", makbuzBagli(m, LOG) !== null);

m = iyiMakbuz(); m.logs = [m.logs[0]];
ok("log makbuzun icinde yok -> RED", makbuzBagli(m, LOG) !== null);

m = iyiMakbuz(); m.logs[1].data = "0x" + "ce".repeat(64);
ok("ayni indeks, data farkli -> RED", makbuzBagli(m, LOG) !== null);

m = iyiMakbuz(); m.logs[1].topics = [LOG.topics[0]];
ok("konu sayisi farkli -> RED", makbuzBagli(m, LOG) !== null);

m = iyiMakbuz(); m.logs[1].topics = [LOG.topics[0], "0x" + "cc".repeat(32)];
ok("konu degeri farkli -> RED", makbuzBagli(m, LOG) !== null);

m = iyiMakbuz(); m.logs[1].address = "0x0000000000000000000000000000000000000001";
ok("adres farkli -> RED", makbuzBagli(m, LOG) !== null);

m = iyiMakbuz(); m.logs = [];
ok("makbuzda hic log yok -> RED", makbuzBagli(m, LOG) !== null);

m = iyiMakbuz(); delete m.logs;
ok("makbuzda logs alani yok -> RED, cokmeden", makbuzBagli(m, LOG) !== null);

/* The direction that would have stopped the bridge rather than broken
   it: fail-closed, so nothing gets signed wrongly, but every valid event
   refused on a provider that pads its quantities. */
m = iyiMakbuz(); m.logs[1].logIndex = "0x03";
ok("logIndex 0x03 ile 0x3 -> KABUL (bicim farki kopruyu durdurmaz)",
   makbuzBagli(m, LOG) === null);

m = iyiMakbuz();
m.logs[1].address = LOG.address.toLowerCase();
m.logs[1].topics = LOG.topics.map((t) => "0x" + t.slice(2).toUpperCase());
ok("adres ve konularda harf buyuklugu farki -> KABUL",
   makbuzBagli(m, LOG) === null);

/* ---- 2. the cursor must not step over an unverified block ------ */
console.log("");
console.log("DOGRULANAMAYAN BLOGUN UZERINDEN IMLEC ATLAMASIN");

let d = { sonBlok: 100n, tutulanBlok: null, tutulanTur: 0 };
ok("supheli blok yok -> imlec pencere sonuna gider",
   imlecKarari(d, null, 200n) === 200n);
ok("supheli yok -> tutma durumu temiz", d.tutulanBlok === null && d.tutulanTur === 0);

d = { sonBlok: 100n, tutulanBlok: null, tutulanTur: 0 };
const durdu = imlecKarari(d, 150n, 200n);
ok("blok 150 dogrulanamadi -> imlec 149 oluyor", durdu === 149n);
ok("150 bir dahaki turda YENIDEN taranacak", durdu < 150n);
ok("ilk tutmada sayac 1", d.tutulanTur === 1 && d.tutulanBlok === 150n);

/* The same block again: the count has to grow, otherwise an hours-long
   stall reads like its first round every single time. */
ok("ayni blok yine -> sayac 2", imlecKarari(d, 150n, 260n) === 149n && d.tutulanTur === 2);
ok("ayni blok yine -> sayac 3", imlecKarari(d, 150n, 320n) === 149n && d.tutulanTur === 3);
d.tutulanTur = 9;
imlecKarari(d, 150n, 400n);
ok("onuncu turda yuksek sesli uyari esigine gelindi", d.tutulanTur === 10);

d = { sonBlok: 100n, tutulanBlok: 150n, tutulanTur: 7 };
imlecKarari(d, 170n, 200n);
ok("baska blok tutulunca sayac 1e doner", d.tutulanBlok === 170n && d.tutulanTur === 1);
imlecKarari(d, null, 300n);
ok("supheli kalmayinca tutma durumu temizlenir",
   d.tutulanBlok === null && d.tutulanTur === 0);

/* Stalls, never rewinds. */
d = { sonBlok: 100n, tutulanBlok: null, tutulanTur: 0 };
ok("pencerenin ilk blogu supheli -> imlec yerinde kalir, geri gitmez",
   imlecKarari(d, 101n, 200n) === 100n);

d = { sonBlok: 100n, tutulanBlok: null, tutulanTur: 0 };
ok("imlecin gerisindeki supheli onu geri cekmez",
   imlecKarari(d, 50n, 200n) === 100n);

d = { sonBlok: 100n, tutulanBlok: null, tutulanTur: 0 };
ok("pencere disindaki supheli imleci kisaltmaz",
   imlecKarari(d, 400n, 200n) === 200n);

/* ---- 3. the held state has to survive a restart ---------------- */
console.log("");
console.log("TUTMA DURUMU YENIDEN BASLATMAYI ATLATIYOR MU");

const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "imzaci-dene-"));
const dosya = path.join(dizin, "durum.json");

imleciYaz({ durumDosyasi: dosya }, { sonBlok: 149n, tutulanBlok: 150n, tutulanTur: 4 });
const geri = JSON.parse(fs.readFileSync(dosya, "utf8"));
ok("sonBlok string olarak yazildi", geri.sonBlok === "149");
ok("tutulanBlok diske yazildi", geri.tutulanBlok === "150");
ok("tutulanTur diske yazildi", geri.tutulanTur === 4);
ok("gecici yazim dosyasi birakilmadi", !fs.existsSync(dosya + ".yazim"));
ok("BigInt'e geri cevrilebiliyor",
   BigInt(geri.sonBlok) === 149n && BigInt(geri.tutulanBlok) === 150n);

const acilan = { sonBlok: BigInt(geri.sonBlok),
                 tutulanBlok: BigInt(geri.tutulanBlok),
                 tutulanTur: geri.tutulanTur };
imlecKarari(acilan, 150n, 300n);
ok("yeniden baslatmadan sonra sayac 5ten devam ediyor", acilan.tutulanTur === 5);

imleciYaz({ durumDosyasi: dosya }, { sonBlok: 300n, tutulanBlok: null, tutulanTur: 0 });
const temiz = JSON.parse(fs.readFileSync(dosya, "utf8"));
ok("tutma bitince null yaziliyor", temiz.tutulanBlok === null && temiz.tutulanTur === 0);
fs.rmSync(dizin, { recursive: true, force: true });

/* ---- 4. the finality gate has to fail CLOSED ------------------- */
console.log("");
console.log("FINALITE KAPISI KAPANARAK MI HATA VERIYOR");

const polDizin = fs.mkdtempSync(path.join(os.tmpdir(), "imzaci-pol-"));
const ORNEK = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "kopru", "ornek-yapilandirma.json"), "utf8"));
ORNEK.kaynakKontrat = "0x0000000000000000000000000000000000000001";
ORNEK.hedefKontrat = "0x0000000000000000000000000000000000000002";

const politika = (deger) => {
  const y = JSON.parse(JSON.stringify(ORNEK));
  if (deger === undefined) delete y.finalitePolitikasi;
  else y.finalitePolitikasi = deger;
  const yol = path.join(polDizin, "y.json");
  fs.writeFileSync(yol, JSON.stringify(y));
  try { return { kabul: yapilandirmaOku(yol) }; }
  catch (e) { return { red: e.message }; }
};

ok("alan hic yok -> RED", !!politika(undefined).red);
ok("taninmayan deger -> RED", !!politika("her-sey-yolunda").red);
ok("l1-parti uygulanmadi -> RED", !!politika("l1-parti").red);

/* The ones that were getting through. `in` walks the prototype chain, so
   these three passed the first check and then found a function instead of
   null on the second and were accepted. A gate that exists to fail closed
   was failing open on words everybody already has. */
for (const ad of ["toString", "constructor", "__proto__", "valueOf", "hasOwnProperty"])
  ok("prototip adi '" + ad + "' -> RED", !!politika(ad).red);

/* And types that are not strings at all. */
ok("sayi -> RED", !!politika(0).red);
ok("bos dizi -> RED", !!politika([]).red);
ok("nesne -> RED", !!politika({}).red);

const kabul = politika("sadece-derinlik");
ok("sadece-derinlik -> KABUL", !!kabul.kabul);
ok("  ve notu bir metin, fonksiyon degil",
   typeof (kabul.kabul && kabul.kabul.finaliteNotu) === "string");
ok("ornek yapilandirma gercekten gecerli bir politika tasiyor",
   ORNEK.finalitePolitikasi === "sadece-derinlik");
fs.rmSync(polDizin, { recursive: true, force: true });

/* ---- 5. a notice passed over has to be written down ------------ */
console.log("");
console.log("ATLANAN BILDIRIM KAYBOLMUYOR MU");

const atlDizin = fs.mkdtempSync(path.join(os.tmpdir(), "imzaci-atl-"));
const olayId = "0x" + "7f".repeat(32);
atlananiYaz({ imzaDizini: atlDizin, ad: "imzaci-1", kaynakZincir: 4663 },
  LOG, { olayId, alici: LOG.address, miktar: 123456789n }, "islem tavani asildi");
const atlYol = path.join(atlDizin, "atlanan", olayId.slice(2, 18) + ".imzaci-1.json");
ok("atlanan bildirim diske yazildi", fs.existsSync(atlYol));
if (fs.existsSync(atlYol)) {
  const k = JSON.parse(fs.readFileSync(atlYol, "utf8"));
  ok("  olayId kayitli", k.olayId === olayId);
  ok("  miktar kayitli", k.miktar === "123456789");
  ok("  sebep kayitli", /tavani/.test(k.sebep || ""));
  ok("  kaynak tx ve blok kayitli, yeniden oynatilabilir",
     k.kaynakTx === LOG.transactionHash &&
     k.kaynakBlokHash === LOG.blockHash &&
     k.logIndex === 3);
}
/* If it cannot be recorded, it must not be passed over silently. */
let patladi = false;
try {
  atlananiYaz({ imzaDizini: path.join(atlDizin, "yok", "\0gecersiz"), ad: "x", kaynakZincir: 1 },
    LOG, { olayId, alici: LOG.address, miktar: 1n }, "deneme");
} catch (e) { patladi = /kaydedilemedi/.test(e.message); }
ok("kaydedilemiyorsa sessizce gecilmiyor, hata atiyor", patladi);
fs.rmSync(atlDizin, { recursive: true, force: true });

console.log("");
console.log("  " + gecen + " gecti, " + kalan + " kaldi");
process.exit(kalan ? 1 : 0);
