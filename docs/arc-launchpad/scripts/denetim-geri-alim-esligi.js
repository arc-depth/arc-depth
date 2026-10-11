"use strict";
/* ===========================================================================
 * denetim-geri-alim-esligi.js — iki kasanın geri alım sabitleri ve
 *                               aritmetiği hâlâ aynı mı
 *
 *   node scripts/denetim-geri-alim-esligi.js
 *
 * NEDEN VAR
 *   KopruKasasi geri alım tabanını TeminatKasasi'ndan kopyaladı: aynı iki
 *   tavan, aynı ödül payı, aynı pencere. Kopyalanan ve kimsenin
 *   karşılaştırmadığı bir sabit, ücret tablosunun haftalarca kendisiyle
 *   uyuşurken aritmetiğin her satışta taşmasının tam olarak yoludur. O
 *   sefer kaçıran şey, tabloyu karşılaştıran ama ARİTMETİĞİ hiç
 *   çalıştırmayan bir denetimdi.
 *
 *   Bu yüzden burada iki şey birden kontrol ediliyor: sayılar eşit mi, ve
 *   her sabit gerçekten kullanılıyor mu. Kullanılmayan bir sabit, uyuşan
 *   ama hiçbir şey yapmayan bir sayıdır.
 *
 * NE KONTROL EDİLMİYOR
 *   Tavanların DAYANAĞI kasıtlı olarak farklı: TeminatKasasi token
 *   bakiyesini, KopruKasasi harcanabilir tutarı ölçek alıyor. Rezervin bir
 *   kısmı başka zincirdeyken ikincisi daha sıkıdır ve bu tercih
 *   KopruKasasi'nde gerekçesiyle yazılı. Burada o fark bir ihlal değil,
 *   beklenen bir ayrım olarak listelenmiştir.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const oku = (n) => fs.readFileSync(path.join(KOK, "contracts", n), "utf8");

/* Constants that must be identical in both vaults. */
const SABITLER = [
  { ad: "ISLEM_TAVANI_BPS", neden: "tek cagrinin fiyat etkisi siniri" },
  { ad: "DONEM_TAVANI_BPS", neden: "bir pencerede cikabilecek toplam" },
  { ad: "DONEM_BLOK", neden: "pencerenin uzunlugu" },
  { ad: "ODUL_PAYI_BPS", neden: "yakalanan iskontonun bekciye kalan payi" }
];

/* Properties of the arithmetic that must hold in both, as source shapes.
   Not a substitute for the suites that run it — a complement: these catch
   a line being deleted, the suites catch it being wrong. */
const SEKILLER = [
  {
    ad: "odul pencereye SAYILIYOR",
    neden: "odul disari cikip geri gelmeyen tek parca; eski kasada " +
           "sayilmadigi icin %10 vaadine karsi %17,07 cikti",
    kalip: /harcanan \+ odul > /
  },
  {
    ad: "odul tek-cagri tavanina SAYILMIYOR",
    neden: "sayildiginda her iskontolu geri alim imkansizlasti — olculdu, " +
           "sifir cagri gecti",
    kalip: /harcama > \((?:b0|serbest) \* ISLEM_TAVANI_BPS\) \/ 10_000/
  },
  {
    ad: "bosluk yakma ONCESI hak uzerinden",
    neden: "sonradan hesaplanan bosluk kimlikten sifir cikar ve odul hep " +
           "sifir olur, yani hic calismayan bir bekci agi",
    kalip: /tabanDeger > harcama \? tabanDeger - harcama : 0/
  },
  {
    ad: "hak dusemez",
    neden: "borc verme deseninin geri odeme kosulu bu tek satir",
    kalip: /if \(hakSonra < hakOnce\) revert HakDustu\(\)/
  },
  {
    ad: "yakilan RAPOR EDILMIYOR, OLCULUYOR",
    neden: "cagiranin soyledigi sayiya guvenmek, hic jeton birakmadan " +
           "odul almanin yoludur",
    kalip: /yakilan = .*balanceOf\(address\(this\)\)/
  }
];

const KASALAR = [
  { ad: "TeminatKasasi", kaynak: oku("TeminatKasasi.sol") },
  { ad: "KopruKasasi", kaynak: oku("KopruKasasi.sol") }
];

function sabitDegeri(kaynak, ad) {
  const m = kaynak.match(
    new RegExp("constant\\s+" + ad + "\\s*=\\s*([0-9_]+)")
  );
  return m ? m[1].replace(/_/g, "") : null;
}

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

console.log("GERI ALIM ESLIGI — TeminatKasasi ile KopruKasasi");
console.log("");

console.log("1) SABITLER AYNI SAYI MI");
for (const s of SABITLER) {
  const degerler = KASALAR.map((k) => sabitDegeri(k.kaynak, s.ad));
  const yok = degerler.some((d) => d === null);
  if (yok) {
    ok(false, s.ad + " iki kasada da bulunamadi",
      KASALAR.map((k, i) => k.ad + "=" + (degerler[i] ?? "YOK")).join("  "));
    continue;
  }
  ok(degerler[0] === degerler[1], s.ad + " esit",
    degerler[0] + "  (" + s.neden + ")");
}

console.log("");
console.log("2) SABITLER GERCEKTEN KULLANILIYOR MU");
/* A constant that matches and is never read is a number that agrees with
   itself and does nothing. */
for (const s of SABITLER) {
  for (const k of KASALAR) {
    /* Count uses OUTSIDE the declaration line. */
    const kullanim = (k.kaynak.match(new RegExp(s.ad, "g")) || []).length;
    ok(kullanim >= 2, s.ad + " " + k.ad + " icinde kullaniliyor",
      kullanim - 1 + " kullanim");
  }
}

console.log("");
console.log("3) ARITMETIGIN SEKLI IKI KASADA DA DURUYOR MU");
for (const sek of SEKILLER) {
  for (const k of KASALAR) {
    const var_ = sek.kalip.test(k.kaynak);
    ok(var_, sek.ad + " — " + k.ad, var_ ? "" : sek.neden);
  }
}

console.log("");
console.log("4) KASITLI AYRIM — tavanlarin dayanagi");
{
  const t = /\(b0 \* ISLEM_TAVANI_BPS\)/.test(KASALAR[0].kaynak);
  const k = /\(serbest \* ISLEM_TAVANI_BPS\)/.test(KASALAR[1].kaynak);
  console.log("     TeminatKasasi  token bakiyesi (b0) uzerinden");
  console.log("     KopruKasasi    harcanabilir (serbest) uzerinden");
  ok(t, "TeminatKasasi hala bakiye uzerinden olcuyor");
  ok(k, "KopruKasasi hala harcanabilir uzerinden olcuyor",
    "rezervin %80'i baska zincirdeyken bu daha SIKI — tersi, %10 tavani " +
      "gosterirken butun yerel parayi harcamaya izin verirdi");
}

console.log("");
console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
process.exit(kotu === 0 ? 0 : 1);
