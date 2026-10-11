"use strict";
/* ===========================================================================
 * api.js — indeksin salt-okunur HTTP yüzü
 *
 *   node indeksleyici/api.js            # 127.0.0.1:8788
 *   PORT=9000 node indeksleyici/api.js
 *
 * NEDEN express YOK
 *   `node:http` yeterli ve bir bağımlılık daha eklemek, "sistem abonelikler
 *   kesildiğinde de ayakta kalmalı" kuralına karşı küçük ama gereksiz bir
 *   borç. Yönlendirme on satır; bir çatı on megabayt.
 *
 * NEDEN SALT OKUNUR
 *   Hiçbir uç nokta yazmıyor. Veritabanı `readonly` açılıyor, yani bir
 *   hata bile yazamaz. İndekse giren tek yol zincirdir — API'nin bir
 *   satırı değiştirebilmesi, "sahte veri göstermeme" kuralını bir hata
 *   mesafesine indirirdi.
 *
 * NEDEN BOŞ CEVAP BİR HATA DEĞİL
 *   Veri yoksa `{ veri: [], not: "..." }` dönüyor ve `not` neden boş
 *   olduğunu söylüyor. Boş diziyi 404 yapmak ya da sahte bir örnek
 *   döndürmek, arayüzü "bir şeyler göster" diye zorlamanın iki yolu — ve
 *   şartname ikisini de yasaklıyor.
 *
 * ARAYÜZ BURAYA BAĞLANMADAN ÖNCE
 *   Bu API Pulse sözleşmeleri dağıtılmadığı için bugün yalnızca arc-depth
 *   ve fathom verisi döndürür. Arayüzde bir Pulse grafiği göstermek, boş
 *   bir cevabı doldurmak anlamına gelir — o yüzden yol tablosundaki
 *   `durum` alanları değişmiyor.
 * =========================================================================== */
const http = require("http");
const path = require("path");
const fs = require("fs");

const DB_YOLU = path.join(__dirname, "veri", "pulse.db");
const PORT = Number(process.env.PORT || 8788);
const ARC = 5042;
const ARALIKLAR = [60, 300, 900, 3600, 14400, 86400];

let Database;
try { Database = require("better-sqlite3"); }
catch (e) {
  console.error("better-sqlite3 kurulu degil: npm install better-sqlite3");
  process.exit(1);
}
if (!fs.existsSync(DB_YOLU)) {
  console.error("indeks veritabani yok: " + DB_YOLU);
  console.error("once: node indeksleyici/indeksle.js");
  process.exit(1);
}

const db = new Database(DB_YOLU, { readonly: true });

const S = {
  durum: db.prepare("SELECT * FROM imlec WHERE zincir = ? ORDER BY kaynak"),
  olaySayisi: db.prepare("SELECT COUNT(*) n FROM olay WHERE zincir = ?"),
  jetonlar: db.prepare(
    "SELECT t.jeton, COUNT(*) islem, SUM(CAST(t.quote_miktar AS REAL)) hacim, " +
    "MIN(t.zaman) ilk, MAX(t.zaman) son " +
    "FROM takas t WHERE t.zincir = ? GROUP BY t.jeton ORDER BY islem DESC"
  ),
  mum: db.prepare(
    "SELECT baslangic, a, y, d, k, hacim_quote, hacim_jeton, islem FROM mum " +
    "WHERE zincir = ? AND jeton = ? AND aralik = ? ORDER BY baslangic DESC LIMIT ?"
  ),
  takaslar: db.prepare(
    "SELECT islem_hash, blok, zaman, hesap, yon, quote_miktar, jeton_miktar, fiyat, mekan " +
    "FROM takas WHERE zincir = ? AND jeton = ? ORDER BY zaman DESC, log_indeksi DESC LIMIT ?"
  ),
  sahipler: db.prepare(
    "SELECT adres, bakiye FROM sahip WHERE zincir = ? AND jeton = ? AND bakiye != '0' " +
    "ORDER BY CAST(bakiye AS REAL) DESC LIMIT ?"
  ),
  ucret: db.prepare(
    "SELECT dilim, COUNT(*) adet, SUM(CAST(miktar AS REAL)) toplam FROM ucret " +
    "WHERE zincir = ? GROUP BY dilim ORDER BY toplam DESC"
  ),
  portfoy: db.prepare(
    "SELECT jeton, yon, quote_miktar, jeton_miktar, zaman, islem_hash FROM takas " +
    "WHERE zincir = ? AND hesap = ? ORDER BY zaman"
  ),
  liderlik: db.prepare(
    "SELECT hesap, COUNT(*) islem, SUM(CAST(quote_miktar AS REAL)) hacim " +
    "FROM takas WHERE zincir = ? AND hesap != '' GROUP BY hesap " +
    "ORDER BY hacim DESC LIMIT ?"
  ),
  teklifler: db.prepare(
    "SELECT * FROM teklif WHERE zincir = ? ORDER BY no DESC LIMIT ?"
  )
};

/* Cost basis, FIFO. Not an average: an average basis reports a profit on a
   position the holder has not actually closed at that price, and the whole
   point of a P&L line is that it corresponds to something that happened. */
function portfoyHesapla(satirlar) {
  const pozisyon = new Map();   // jeton -> { lotlar: [{adet, maliyet}], gerceklesen }
  for (const t of satirlar) {
    let p = pozisyon.get(t.jeton);
    if (!p) { p = { lotlar: [], gerceklesen: 0n, alinan: 0n, satilan: 0n }; pozisyon.set(t.jeton, p); }
    const adet = BigInt(t.jeton_miktar);
    const quote = BigInt(t.quote_miktar);

    if (t.yon === 1) {
      p.lotlar.push({ adet, maliyet: quote });
      p.alinan += adet;
    } else {
      p.satilan += adet;
      let kalan = adet, maliyet = 0n;
      while (kalan > 0n && p.lotlar.length) {
        const lot = p.lotlar[0];
        if (lot.adet <= kalan) {
          maliyet += lot.maliyet;
          kalan -= lot.adet;
          p.lotlar.shift();
        } else {
          /* Partial lot: the cost comes out in the same proportion as the
             quantity, which is the only split that leaves the remaining
             lot's basis unchanged. */
          const pay = (lot.maliyet * kalan) / lot.adet;
          maliyet += pay;
          lot.maliyet -= pay;
          lot.adet -= kalan;
          kalan = 0n;
        }
      }
      /* Realised = what came in minus what those units cost. If the
         holder sold more than we have lots for, the missing basis is
         zero — and `eksikMaliyet` says so rather than inflating profit. */
      p.gerceklesen += quote - maliyet;
      if (kalan > 0n) p.eksikMaliyet = (p.eksikMaliyet || 0n) + kalan;
    }
  }

  const out = [];
  for (const [jeton, p] of pozisyon) {
    const acikAdet = p.lotlar.reduce((a, l) => a + l.adet, 0n);
    const acikMaliyet = p.lotlar.reduce((a, l) => a + l.maliyet, 0n);
    out.push({
      jeton,
      acikAdet: acikAdet.toString(),
      acikMaliyet: acikMaliyet.toString(),
      gerceklesen: p.gerceklesen.toString(),
      alinan: p.alinan.toString(),
      satilan: p.satilan.toString(),
      eksikMaliyet: (p.eksikMaliyet || 0n).toString()
    });
  }
  return out;
}

/* ---- routes ---------------------------------------------------------- */

function yolla(res, kod, govde) {
  const s = JSON.stringify(govde, null, 1);
  res.writeHead(kod, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    /* The page is served from a file or another origin in development. */
    "access-control-allow-origin": "*"
  });
  res.end(s);
}

const YOLLAR = [
  {
    desen: /^\/durum$/,
    isle: () => {
      const im = S.durum.all(ARC);
      const olay = S.olaySayisi.get(ARC).n;
      const kalan = im.reduce((a, i) => a + Math.max(0, 0), 0);
      return {
        zincir: ARC,
        kaynak: im.length,
        olay,
        kaynaklar: im.map((i) => ({
          kaynak: i.kaynak, adres: i.adres,
          dogum: i.dogum_blok, son: i.son_blok,
          guncellendi: i.guncellendi
        })),
        not: olay === 0
          ? "Henuz hic olay indekslenmedi. Bu bir hata degil: tarama bu RPC'de 9.999 bloklu pencerelerle ilerliyor."
          : null
      };
    }
  },
  {
    desen: /^\/jetonlar$/,
    isle: () => {
      const j = S.jetonlar.all(ARC);
      return {
        veri: j,
        not: j.length === 0
          ? "Hic takas kaydi yok, dolayisiyla listelenecek jeton yok. Pulse sozlesmeleri dagitilmadi; indekslenen sey arc-depth ve fathom."
          : null
      };
    }
  },
  {
    desen: /^\/mum\/(0x[0-9a-fA-F]{40})$/,
    isle: (m, q) => {
      const aralik = Number(q.get("aralik") || 3600);
      if (!ARALIKLAR.includes(aralik)) {
        return { hata: "aralik su altidan biri olmali: " + ARALIKLAR.join(",") };
      }
      const limit = Math.min(Number(q.get("limit") || 500), 5000);
      const mumlar = S.mum.all(ARC, m[1].toLowerCase(), aralik, limit).reverse();
      return {
        jeton: m[1].toLowerCase(), aralik, veri: mumlar,
        /* No gap filling, deliberately. A candle that carries the previous
           close shows a price that nobody traded at. */
        not: mumlar.length === 0
          ? "Bu jeton icin bu aralikta mum yok."
          : "Bosluklar DOLDURULMADI: islem olmayan araliga mum uretilmiyor."
      };
    }
  },
  {
    desen: /^\/takas\/(0x[0-9a-fA-F]{40})$/,
    isle: (m, q) => {
      const limit = Math.min(Number(q.get("limit") || 100), 1000);
      return { jeton: m[1].toLowerCase(), veri: S.takaslar.all(ARC, m[1].toLowerCase(), limit) };
    }
  },
  {
    desen: /^\/sahip\/(0x[0-9a-fA-F]{40})$/,
    isle: (m, q) => {
      const limit = Math.min(Number(q.get("limit") || 100), 1000);
      const s = S.sahipler.all(ARC, m[1].toLowerCase(), limit);
      return {
        jeton: m[1].toLowerCase(), veri: s,
        not: "Bakiyeler Transfer olaylarindan TURETILDI; balanceOf okunmadi. " +
          "scripts/denetim-indeks.js bu sayilari zincirle karsilastirir."
      };
    }
  },
  {
    desen: /^\/ucret$/,
    isle: () => {
      const u = S.ucret.all(ARC);
      return {
        veri: u,
        not: "Bunlar launch EGRISININ uc dilimli ucreti (kurucu/stake/havuz). " +
          "Pulse hook'unun BES adresli bolunmesi zincirde hic gerceklesmedi; " +
          "ADRESLER.md'deki o satir hala olculmemis."
      };
    }
  },
  {
    desen: /^\/portfoy\/(0x[0-9a-fA-F]{40})$/,
    isle: (m) => {
      const satirlar = S.portfoy.all(ARC, m[1].toLowerCase());
      return {
        hesap: m[1].toLowerCase(),
        islem: satirlar.length,
        veri: portfoyHesapla(satirlar),
        not: "Maliyet esasi FIFO. Acik pozisyonun DEGERI verilmiyor: degerlemek " +
          "bir fiyat secmek demek ve o fiyat bir olcum degil bir tercih olurdu."
      };
    }
  },
  {
    desen: /^\/liderlik$/,
    isle: (m, q) => {
      const limit = Math.min(Number(q.get("limit") || 50), 500);
      const l = S.liderlik.all(ARC, limit);
      return {
        veri: l,
        not: "Siralama GERCEKLESMIS hacme gore. Kar/zarar siralamasi acik " +
          "pozisyonlari degerlemeyi gerektirir ve o bir fiyat tercihi olur."
      };
    }
  },
  {
    desen: /^\/teklif$/,
    isle: (m, q) => {
      const limit = Math.min(Number(q.get("limit") || 50), 500);
      const t = S.teklifler.all(ARC, limit);
      return {
        veri: t,
        not: t.length === 0
          ? "Hic teklif yok. Canli Governor'da proposalCount() = 0 olarak olculdu: " +
            "DAO zincirde duruyor ama hic kullanilmadi."
          : null
      };
    }
  }
];

const sunucu = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, "http://localhost"); }
  catch (e) { return yolla(res, 400, { hata: "kotu URL" }); }

  if (req.method !== "GET") return yolla(res, 405, { hata: "yalnizca GET" });

  for (const y of YOLLAR) {
    const m = u.pathname.match(y.desen);
    if (m) {
      try {
        return yolla(res, 200, y.isle(m, u.searchParams));
      } catch (e) {
        return yolla(res, 500, { hata: e.message });
      }
    }
  }

  yolla(res, 404, {
    hata: "bilinmeyen yol",
    yollar: [
      "/durum", "/jetonlar", "/ucret", "/liderlik", "/teklif",
      "/mum/0x...?aralik=3600&limit=500", "/takas/0x...", "/sahip/0x...",
      "/portfoy/0x..."
    ]
  });
});

sunucu.listen(PORT, "127.0.0.1", () => {
  console.log("INDEKS API  http://127.0.0.1:" + PORT);
  console.log("  salt okunur: veritabani readonly acildi, hicbir uc nokta yazmiyor");
  console.log("");
  for (const y of YOLLAR) console.log("  " + String(y.desen).replace(/^\/\^|\$\/$/g, ""));
});
