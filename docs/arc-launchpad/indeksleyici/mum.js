"use strict";
/* ===========================================================================
 * mum.js — OHLCV, altı aralıkta
 *
 *   node indeksleyici/mum.js            # eksik mumlari kur
 *   node indeksleyici/mum.js --yeniden  # hepsini bastan kur
 *
 * MUMLAR TÜRETİLMİŞ VERİDİR, ÖLÇÜM DEĞİL
 *   Hiçbir mum zincirden okunmuyor. Hepsi `takas` tablosundan üretiliyor ve
 *   `takas` da `olay`dan. Yani bir mumun arkasında, onu oluşturan takasların
 *   işlem hash'leri durur: "bu hacim nereden geldi" sorusunun cevabı her
 *   zaman gösterilebilir.
 *
 *   Bu, şartnamedeki *"Sahte fiyat, grafik, hacim veya holder verisi
 *   gösterme"* kuralının uygulanabilir hali. Sahte bir mum üretmenin yolu
 *   yok, çünkü mum tablosu girdi almıyor — türetiliyor.
 *
 * NEDEN MUM YOKSA MUM YOK
 *   Hiç işlem olmayan bir aralık için mum ÜRETİLMİYOR. Bir çok grafik
 *   kütüphanesi boşluğu sevmez ve "son kapanışı taşıyan" sahte mumlar
 *   eklemek yaygın bir alışkanlık. O mumlar olmamış bir işlem gösterir ve
 *   hacmi sıfır olsa bile fiyat çizgisini gerçek olmayan bir süreklilikle
 *   doldurur. Boşluğu arayüz çizer; defter uydurmaz.
 *
 * AÇILIŞ FİYATI ÖNCEKİ KAPANIŞ DEĞİL
 *   Bir mumun açılışı, O ARALIKTAKİ ilk takasın fiyatı. Önceki mumun
 *   kapanışını açılış saymak, aralıklar arasında hiç gerçekleşmemiş bir
 *   fiyat hareketi uydurmak olur.
 * =========================================================================== */
const defterModulu = require("./defter.js");

/* Six intervals, in seconds. 1d is 86,400 and not "a calendar day": a
   calendar day needs a timezone, a timezone is a policy, and a chart that
   silently uses the server's timezone shows different candles to different
   people. */
const ARALIKLAR = [60, 300, 900, 3_600, 14_400, 86_400];

const ARC = 5042;

function kova(zaman, aralik) {
  return Math.floor(zaman / aralik) * aralik;
}

/// Build candles for one token at one interval, from its trades.
///
/// The whole series is rebuilt rather than appended to. That is not
/// laziness: an appended series needs to know which candle was last
/// complete, and getting that wrong leaves a permanently half-counted
/// candle in the middle of the chart. Rebuilding is cheap because the
/// trades are local, and it is idempotent by construction.
function kur(db, h, jeton, aralik, ilkZaman, sonZaman) {
  const takaslar = h.takasAralik.all(ARC, jeton, ilkZaman, sonZaman + 1);
  if (takaslar.length === 0) return 0;

  const gruplar = new Map();
  for (const t of takaslar) {
    if (t.fiyat === null || !isFinite(t.fiyat) || t.fiyat <= 0) continue;
    const b = kova(t.zaman, aralik);
    let g = gruplar.get(b);
    if (!g) {
      g = {
        a: t.fiyat, y: t.fiyat, d: t.fiyat, k: t.fiyat,
        hq: 0n, hj: 0n, n: 0
      };
      gruplar.set(b, g);
    }
    /* Open stays the FIRST trade's price: the query is ordered by
       (zaman, log_indeksi), so the first one seen is the first one that
       happened, including within a single block. */
    if (t.fiyat > g.y) g.y = t.fiyat;
    if (t.fiyat < g.d) g.d = t.fiyat;
    g.k = t.fiyat;
    g.hq += BigInt(t.quote_miktar);
    g.hj += BigInt(t.jeton_miktar);
    g.n++;
  }

  const yaz = db.transaction(() => {
    let n = 0;
    for (const [baslangic, g] of gruplar) {
      h.mumYaz.run({
        zincir: ARC, jeton, aralik, baslangic,
        a: g.a, y: g.y, d: g.d, k: g.k,
        hacim_quote: g.hq.toString(),
        hacim_jeton: g.hj.toString(),
        islem: g.n
      });
      n++;
    }
    return n;
  });
  return yaz();
}

function hepsiniKur(db, h, opts) {
  const jetonlar = h.takasJetonlari.all(ARC).map((r) => r.jeton);
  const sonuc = [];
  for (const j of jetonlar) {
    const satir = { jeton: j, aralik: {} };
    for (const a of ARALIKLAR) {
      satir.aralik[a] = kur(db, h, j, a, 0, 2_000_000_000);
    }
    sonuc.push(satir);
  }
  return sonuc;
}

if (require.main === module) {
  const db = defterModulu.ac();
  const h = defterModulu.hazirla(db);

  console.log("MUM URETICISI");
  console.log("  aralikler: " + ARALIKLAR.map((a) =>
    a < 3600 ? a / 60 + "d" : a < 86400 ? a / 3600 + "s" : a / 86400 + "g"
  ).join(", "));
  console.log("");

  const sonuc = hepsiniKur(db, h, {});
  if (sonuc.length === 0) {
    console.log("  Hic takas kaydi yok, dolayisiyla hic mum yok.");
    console.log("");
    console.log("  Bu bir hata degil: `takas` tablosu `olay`dan tureniyor ve");
    console.log("  indeksleyici henuz takas olayi gormedi. Bos bir grafik,");
    console.log("  uydurulmus bir grafikten iyidir — ve bu satir, hangisinin");
    console.log("  dogru oldugunu soyleyen sey.");
  } else {
    for (const s of sonuc) {
      const toplam = Object.values(s.aralik).reduce((a, b) => a + b, 0);
      console.log("  " + s.jeton + "   " + toplam + " mum   " +
        ARALIKLAR.map((a) => s.aralik[a]).join("/"));
    }
  }
  db.close();
}

module.exports = { ARALIKLAR, kur, hepsiniKur, kova };
