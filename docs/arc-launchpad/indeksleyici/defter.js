"use strict";
/* ===========================================================================
 * defter.js — indeksleyicinin deposu
 *
 * NE YAPAR
 *   Şemayı uygular, hazır ifadeleri tutar ve yazmayı FİKİRSİZ hale getirir:
 *   her yazma ya yeni bir satır oluşturur ya da hiçbir şey yapmaz. Çağıran
 *   "bu daha önce yazılmış mıydı" diye sormaz, çünkü sorması gerekse bir
 *   gün sormayı unutur.
 *
 * NEDEN HER YERDE INSERT OR IGNORE VE NEDEN BU YETERLİ
 *   `olay` tablosunun anahtarı (zincir, islem_hash, log_indeksi). Bir log
 *   zincirde tam olarak bir kez vardır ve bu üçlü onu birebir tanımlar.
 *   Dolayısıyla aynı aralığı yeniden taramak, çöküp devam etmek ya da bir
 *   reorg sonrası geri sarmak güvenli — hiçbiri aynı logu iki kez
 *   yazamaz.
 *
 *   Türetilmiş tablolar da aynı anahtarı taşıyor, o yüzden aynı şey onlar
 *   için de geçerli. Bu, kasadaki `supur()` ile aynı desen: ikinci çağrı
 *   hiçbir şey yapmaz, çünkü yapılacak bir şey kalmamıştır.
 *
 * SAYILAR NEDEN METİN
 *   uint256 JavaScript sayısına sığmaz ve SQLite'ın INTEGER'ı 64 bit.
 *   Ondalık dizge olarak saklanıyor; karşılaştırma gerektiğinde BigInt'e
 *   çevriliyor. REAL olan tek alan `fiyat` ve o yalnızca GÖRÜNTÜ için —
 *   hiçbir hesap ondan türetilmiyor.
 * =========================================================================== */
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const KOK = __dirname;

function ac(dosya) {
  const yol = dosya || path.join(KOK, "veri", "pulse.db");
  fs.mkdirSync(path.dirname(yol), { recursive: true });

  const db = new Database(yol);
  /* WAL: okuyan (API) ile yazan (indeksleyici) aynı anda çalışabilsin.
     Ölçüldü, varsayılmadı — pragma geri okunuyor. */
  const mod = db.pragma("journal_mode = WAL", { simple: true });
  if (mod !== "wal") throw new Error("WAL acilmadi, mod: " + mod);
  /* NORMAL: her yazmada fsync yok. Bir çökmede son birkaç olay kaybolabilir
     ve bu ÖNEMSİZ, çünkü imleç de aynı işlemde yazılıyor — kaybedilen
     aralık yeniden taranır ve idempotentlik onu güvenli kılar. */
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(fs.readFileSync(path.join(KOK, "sema.sql"), "utf8"));
  return db;
}

function hazirla(db) {
  const h = {
    imlecOku: db.prepare("SELECT * FROM imlec WHERE kaynak = ?"),
    imlecKur: db.prepare(
      "INSERT INTO imlec (kaynak, zincir, adres, dogum_blok, son_blok, guncellendi) " +
      "VALUES (?,?,?,?,?,?) ON CONFLICT(kaynak) DO NOTHING"
    ),
    imlecIlerlet: db.prepare(
      "UPDATE imlec SET son_blok = ?, guncellendi = ? WHERE kaynak = ? AND son_blok < ?"
    ),
    imlecHepsi: db.prepare("SELECT * FROM imlec ORDER BY kaynak"),

    turBasla: db.prepare(
      "INSERT INTO tur (basladi, kaynak, ilk_blok, son_blok) VALUES (?,?,?,?)"
    ),
    turBitir: db.prepare(
      "UPDATE tur SET bitti = ?, log_sayisi = ?, yeni_log = ?, istek_sayisi = ?, " +
      "red_sayisi = ?, hata = ? WHERE id = ?"
    ),

    blokYaz: db.prepare(
      "INSERT INTO blok (zincir, numara, zaman) VALUES (?,?,?) " +
      "ON CONFLICT(zincir, numara) DO NOTHING"
    ),
    blokOku: db.prepare("SELECT zaman FROM blok WHERE zincir = ? AND numara = ?"),

    olayYaz: db.prepare(
      "INSERT INTO olay (zincir, islem_hash, log_indeksi, blok, adres, " +
      "konu0, konu1, konu2, konu3, veri, ad, cozuldu) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) " +
      "ON CONFLICT(zincir, islem_hash, log_indeksi) DO NOTHING"
    ),
    olaySayisi: db.prepare("SELECT COUNT(*) n FROM olay WHERE zincir = ?"),
    olayAdrese: db.prepare(
      "SELECT COUNT(*) n FROM olay WHERE zincir = ? AND adres = ?"
    ),
    olayKonuDagilimi: db.prepare(
      "SELECT konu0, ad, COUNT(*) n FROM olay WHERE zincir = ? GROUP BY konu0, ad ORDER BY n DESC"
    ),

    jetonYaz: db.prepare(
      "INSERT INTO jeton (zincir, adres, ad, simge, ondalik, arz, dogum_blok, " +
      "dogum_zaman, egri, kasa, hook, havuz_id, acici, kaynak) " +
      "VALUES (@zincir,@adres,@ad,@simge,@ondalik,@arz,@dogum_blok,@dogum_zaman," +
      "@egri,@kasa,@hook,@havuz_id,@acici,@kaynak) " +
      "ON CONFLICT(zincir, adres) DO UPDATE SET " +
      "ad=COALESCE(excluded.ad, jeton.ad), simge=COALESCE(excluded.simge, jeton.simge), " +
      "ondalik=COALESCE(excluded.ondalik, jeton.ondalik), arz=COALESCE(excluded.arz, jeton.arz), " +
      "egri=COALESCE(excluded.egri, jeton.egri), kasa=COALESCE(excluded.kasa, jeton.kasa), " +
      "hook=COALESCE(excluded.hook, jeton.hook), havuz_id=COALESCE(excluded.havuz_id, jeton.havuz_id), " +
      "acici=COALESCE(excluded.acici, jeton.acici)"
    ),
    jetonHepsi: db.prepare("SELECT * FROM jeton WHERE zincir = ? ORDER BY dogum_blok"),

    takasYaz: db.prepare(
      "INSERT INTO takas (zincir, islem_hash, log_indeksi, blok, zaman, jeton, " +
      "hesap, yon, quote_miktar, jeton_miktar, fiyat, mekan) " +
      "VALUES (@zincir,@islem_hash,@log_indeksi,@blok,@zaman,@jeton,@hesap,@yon," +
      "@quote_miktar,@jeton_miktar,@fiyat,@mekan) " +
      "ON CONFLICT(zincir, islem_hash, log_indeksi) DO NOTHING"
    ),
    takasAralik: db.prepare(
      "SELECT * FROM takas WHERE zincir = ? AND jeton = ? AND zaman >= ? AND zaman < ? " +
      "ORDER BY zaman, log_indeksi"
    ),
    takasJetonlari: db.prepare(
      "SELECT DISTINCT jeton FROM takas WHERE zincir = ?"
    ),

    ucretYaz: db.prepare(
      "INSERT INTO ucret (zincir, islem_hash, log_indeksi, blok, zaman, jeton, " +
      "hedef, dilim, miktar) VALUES (@zincir,@islem_hash,@log_indeksi,@blok,@zaman," +
      "@jeton,@hedef,@dilim,@miktar) " +
      "ON CONFLICT(zincir, islem_hash, log_indeksi) DO NOTHING"
    ),

    sahipOku: db.prepare("SELECT * FROM sahip WHERE zincir = ? AND jeton = ? AND adres = ?"),
    sahipYaz: db.prepare(
      "INSERT INTO sahip (zincir, jeton, adres, bakiye, ilk_blok, son_blok) " +
      "VALUES (@zincir,@jeton,@adres,@bakiye,@ilk_blok,@son_blok) " +
      "ON CONFLICT(zincir, jeton, adres) DO UPDATE SET " +
      "bakiye = excluded.bakiye, son_blok = excluded.son_blok"
    ),
    sahipSirala: db.prepare(
      "SELECT adres, bakiye FROM sahip WHERE zincir = ? AND jeton = ? AND bakiye != '0' " +
      "ORDER BY CAST(bakiye AS REAL) DESC LIMIT ?"
    ),

    mumYaz: db.prepare(
      "INSERT INTO mum (zincir, jeton, aralik, baslangic, a, y, d, k, " +
      "hacim_quote, hacim_jeton, islem) " +
      "VALUES (@zincir,@jeton,@aralik,@baslangic,@a,@y,@d,@k,@hacim_quote,@hacim_jeton,@islem) " +
      "ON CONFLICT(zincir, jeton, aralik, baslangic) DO UPDATE SET " +
      "a=excluded.a, y=excluded.y, d=excluded.d, k=excluded.k, " +
      "hacim_quote=excluded.hacim_quote, hacim_jeton=excluded.hacim_jeton, islem=excluded.islem"
    ),
    mumOku: db.prepare(
      "SELECT * FROM mum WHERE zincir = ? AND jeton = ? AND aralik = ? " +
      "ORDER BY baslangic DESC LIMIT ?"
    ),

    teklifYaz: db.prepare(
      "INSERT INTO teklif (zincir, governor, no, teklif_eden, aciklama, hedef, veri, " +
      "acilis_blok, bitis_blok, lehte, aleyhte, durum) " +
      "VALUES (@zincir,@governor,@no,@teklif_eden,@aciklama,@hedef,@veri," +
      "@acilis_blok,@bitis_blok,@lehte,@aleyhte,@durum) " +
      "ON CONFLICT(zincir, governor, no) DO UPDATE SET " +
      "lehte=excluded.lehte, aleyhte=excluded.aleyhte, durum=excluded.durum"
    ),
    oyYaz: db.prepare(
      "INSERT INTO oy (zincir, governor, no, secmen, lehte, guc, blok) " +
      "VALUES (@zincir,@governor,@no,@secmen,@lehte,@guc,@blok) " +
      "ON CONFLICT(zincir, governor, no, secmen) DO NOTHING"
    ),
    teklifHepsi: db.prepare(
      "SELECT * FROM teklif WHERE zincir = ? AND governor = ? ORDER BY no DESC"
    )
  };
  return h;
}

/* A write that must either all land or none of it. Used for one scan
   window: the events AND the cursor move together, so a crash can never
   leave the cursor ahead of the data it claims to have read. */
function islem(db, fn) {
  return db.transaction(fn);
}

module.exports = { ac, hazirla, islem };
