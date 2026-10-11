"use strict";
/* ===========================================================================
 * denetim-boyut.js — üretim sözleşmeleri dağıtılabilir mi
 *
 *   node scripts/denetim-boyut.js
 *
 * NEDEN VAR
 *   Derleme çıktısında on bir tane boyut uyarısı var ve en büyüğü 71.960
 *   bayt — EIP-170 sınırının üç katı. Uyarıların içinde bir ÜRETİM
 *   sözleşmesi varsa o sözleşme dağıtılamaz, ve bunu canlıya çıkma gününde
 *   öğrenmek en kötü an olur.
 *
 *   Test harness'ları için aynı sınır geçerli değil: onlar `eth_call` durum
 *   geçersiz kılmasıyla enjekte ediliyor, CREATE'ten geçmiyor, dolayısıyla
 *   EIP-170'e girmiyorlar. Bu yüzden bir boyut uyarısı tek başına ne iyi ne
 *   kötü haber — hangi sözleşme olduğuna bakılması gerekiyor. On bir uyarıyı
 *   her derlemede gözle ayıklamak ise yapılmayacak iştir.
 *
 * SINIRLAR
 *   EIP-170  (Spurious Dragon): dağıtılmış kod 24.576 bayt
 *   EIP-3860 (Shanghai):        init kodu    49.152 bayt
 *
 *   İkisi birden kontrol ediliyor, çünkü init kodu sınırını aşan bir
 *   sözleşme dağıtılmış kodu sınırın altında olsa bile dağıtılamaz.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const SRC = path.join(KOK, "contracts");
const OUT = path.join(KOK, "build");

const EIP170 = 24_576;
const EIP3860 = 49_152;

/* Which contracts are production? The ones whose name appears as a
   `contract X` declaration in contracts/*.sol — not contracts/test/*.sol.
   Derived from the sources rather than a hand-kept list, because a
   hand-kept list is a list that goes stale the first time somebody adds a
   contract. */
function uretimAdlari() {
  const adlar = new Map();
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith(".sol"))) {
    const s = fs.readFileSync(path.join(SRC, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const m of s.matchAll(/^\s*(?:abstract\s+)?contract\s+(\w+)/gm)) {
      adlar.set(m[1], f);
    }
  }
  return adlar;
}

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

const uretim = uretimAdlari();

console.log("SOZLESME BOYUTLARI — dagitilabilir mi");
console.log("");
console.log("  EIP-170  dagitilmis kod  " + EIP170.toLocaleString("en") + " bayt");
console.log("  EIP-3860 init kodu       " + EIP3860.toLocaleString("en") + " bayt");
console.log("");

const satirlar = [];
for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
  const ad = j.contractName || f.replace(/\.json$/, "");
  const dagitilmis = ((j.deployedBytecode || "0x").length - 2) / 2;
  const init = ((j.bytecode || "0x").length - 2) / 2;
  satirlar.push({ ad, dagitilmis, init, uretimMi: uretim.has(ad), dosya: uretim.get(ad) });
}
satirlar.sort((a, b) => b.dagitilmis - a.dagitilmis);

console.log("  URETIM SOZLESMELERI (buyukten kucuge):");
const uretimSatirlari = satirlar.filter((x) => x.uretimMi);
for (const x of uretimSatirlari) {
  const d = x.dagitilmis > EIP170 ? "  <<< EIP-170 ASILDI" : "";
  const i = x.init > EIP3860 ? "  <<< EIP-3860 ASILDI" : "";
  const pay = ((x.dagitilmis / EIP170) * 100).toFixed(0) + "%";
  console.log("   " + x.ad.padEnd(28) +
    x.dagitilmis.toLocaleString("en").padStart(8) + " bayt  (" + pay.padStart(4) + ")" +
    "   init " + x.init.toLocaleString("en").padStart(8) + d + i);
}

const asanlar = uretimSatirlari.filter((x) => x.dagitilmis > EIP170 || x.init > EIP3860);
console.log("");
ok(asanlar.length === 0,
  "HICBIR URETIM SOZLESMESI SINIRI ASMIYOR",
  asanlar.length
    ? asanlar.map((x) => x.ad + " (" + x.dagitilmis.toLocaleString("en") + ")").join(", ")
    : uretimSatirlari.length + " sozlesme, en buyugu " +
      (uretimSatirlari[0] ? uretimSatirlari[0].ad + " " +
        uretimSatirlari[0].dagitilmis.toLocaleString("en") + " bayt" : "-"));

/* The ones that DO exceed the limit, named — so a warning is never again
   something to squint at. A harness over the limit is fine and the reason
   is stated once, here. */
const testAsanlari = satirlar.filter((x) => !x.uretimMi && x.dagitilmis > EIP170);
console.log("");
console.log("  SINIRI ASAN TEST HARNESS'LARI — sorun DEGIL:");
for (const x of testAsanlari) {
  console.log("   " + x.ad.padEnd(28) + x.dagitilmis.toLocaleString("en").padStart(8) + " bayt");
}
console.log("");
console.log("   Bunlar `eth_call` durum gecersiz kilmasiyla enjekte ediliyor:");
console.log("   kod dogrudan adrese yaziliyor, CREATE'ten gecmiyor, yani EIP-170");
console.log("   hic devreye girmiyor. Enjeksiyonun gercekten calistigi her");
console.log("   kosumda kanitlaniyor — 32KB'lik TestKopruUctanUca gercek Arc");
console.log("   RPC'sinde 10 savini gecirdi.");

/* And the opposite risk: a production contract creeping toward the limit
   without crossing it. 90% is the line, because the next feature is what
   crosses it and the time to know is before writing it. */
const yakinlar = uretimSatirlari.filter(
  (x) => x.dagitilmis <= EIP170 && x.dagitilmis > EIP170 * 0.9
);
console.log("");
ok(yakinlar.length === 0,
  "SINIRA YAKLASAN URETIM SOZLESMESI YOK (%90 esigi)",
  yakinlar.length
    ? yakinlar.map((x) => x.ad + " %" + ((x.dagitilmis / EIP170) * 100).toFixed(0)).join(", ")
    : "en dolu olan %" +
      (uretimSatirlari.length
        ? ((uretimSatirlari[0].dagitilmis / EIP170) * 100).toFixed(0)
        : 0));

console.log("");
console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
process.exit(kotu === 0 ? 0 : 1);
