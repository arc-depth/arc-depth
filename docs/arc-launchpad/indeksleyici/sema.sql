-- ===========================================================================
-- sema.sql — Arc Pulse indeksleyicisinin şeması
--
-- NEDEN SQLite VE NEDEN PostgreSQL UYUMLU YAZILDI
--   Şartname PostgreSQL diyor; bu makinede PostgreSQL de Docker da kurulu
--   değil ve kurulu bir servis boşta da RAM yiyor. Hafızadaki kural açık:
--   sistem abonelikler kesildiğinde de ayakta kalmalı, o yüzden ücretsiz ve
--   YEREL olan önce gelir. SQLite'ın daemon'u, portu ve boşta maliyeti yok.
--
--   Buna karşılık şema PostgreSQL'e taşınabilir olacak şekilde yazıldı:
--   INTEGER PRIMARY KEY yerine açık anahtarlar, SQLite'a özgü tip oyunu yok,
--   her yerde TEXT/INTEGER/REAL ve zaman damgaları Unix saniyesi. Taşımak
--   bağlantı dizesi değişikliği olmalı, yeniden yazım değil.
--
-- TASARIMIN BELKEMİĞİ: HAM OLAY TABLOSU
--   Türetilmiş her tablo `olay`dan üretiliyor ve `olay`ın
--   (zincir, islem_hash, log_indeksi) üçlüsü UNIQUE. Bu tek kısıt üç şeyi
--   birden veriyor:
--
--     - indeksleyici çöküp yeniden başladığında aynı logu iki kez yazamaz;
--     - bir reorg sonrası aynı aralığı yeniden taramak güvenli;
--     - "aynı dolar iki kez sayılmaz" kuralı, defterde olduğu gibi burada
--       da bir kısıt — dikkat değil.
--
--   Ölçülen kısıt bunu zorunlu kıldı: Arc'ın genel RPC'si eth_getLogs'u
--   sınırlı aralıkla veriyor ve agresif rate-limit uyguluyor (test setleri
--   aynı RPC'yi kullanırken istekler reddediliyor). Yani tam tarama tek
--   seferde bitmez; kesintiden devam etmek olağan hal, istisna değil.
-- ===========================================================================

-- ---- indeksleyicinin kendi durumu ---------------------------------------

-- Nerede kaldık. Kaynak başına, çünkü farklı sözleşmeler farklı bloklarda
-- doğdu ve biri geride kalırken diğeri ilerleyebilir.
CREATE TABLE IF NOT EXISTS imlec (
  kaynak        TEXT PRIMARY KEY,   -- "hook:0x0577..." gibi
  zincir        INTEGER NOT NULL,
  adres         TEXT NOT NULL,
  dogum_blok    INTEGER NOT NULL,   -- bundan önce tarama anlamsız
  son_blok      INTEGER NOT NULL,   -- buraya kadar tarandı (dahil)
  guncellendi   INTEGER NOT NULL
);

-- Her turun ne yaptığı. Bir indeksleyicinin "çalışıyor" demesi yetmez;
-- kendi sonucunu ölçebilmesi gerekiyor.
CREATE TABLE IF NOT EXISTS tur (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  basladi       INTEGER NOT NULL,
  bitti         INTEGER,
  kaynak        TEXT NOT NULL,
  ilk_blok      INTEGER NOT NULL,
  son_blok      INTEGER NOT NULL,
  log_sayisi    INTEGER NOT NULL DEFAULT 0,
  yeni_log      INTEGER NOT NULL DEFAULT 0,   -- UNIQUE'e takılmayanlar
  istek_sayisi  INTEGER NOT NULL DEFAULT 0,
  red_sayisi    INTEGER NOT NULL DEFAULT 0,   -- rate limit / aralık reddi
  hata          TEXT
);

-- ---- ham zincir verisi ---------------------------------------------------

CREATE TABLE IF NOT EXISTS blok (
  zincir        INTEGER NOT NULL,
  numara        INTEGER NOT NULL,
  zaman         INTEGER NOT NULL,
  PRIMARY KEY (zincir, numara)
);

-- Her şeyin kaynağı. Türetilmiş tablolar bundan üretilir ve yalnızca
-- bundan — bir türetilmiş satırın kaynağı gösterilemiyorsa o satır yoktur.
CREATE TABLE IF NOT EXISTS olay (
  zincir        INTEGER NOT NULL,
  islem_hash    TEXT NOT NULL,
  log_indeksi   INTEGER NOT NULL,
  blok          INTEGER NOT NULL,
  adres         TEXT NOT NULL,
  konu0         TEXT NOT NULL,
  konu1         TEXT,
  konu2         TEXT,
  konu3         TEXT,
  veri          TEXT NOT NULL,
  ad            TEXT,               -- çözülebildiyse olay adı
  cozuldu       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (zincir, islem_hash, log_indeksi)
);

CREATE INDEX IF NOT EXISTS olay_blok    ON olay (zincir, blok);
CREATE INDEX IF NOT EXISTS olay_adres   ON olay (zincir, adres, blok);
CREATE INDEX IF NOT EXISTS olay_konu    ON olay (konu0, blok);
CREATE INDEX IF NOT EXISTS olay_cozulen ON olay (cozuldu) WHERE cozuldu = 0;

-- ---- varlıklar -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeton (
  zincir        INTEGER NOT NULL,
  adres         TEXT NOT NULL,
  ad            TEXT,
  simge         TEXT,
  ondalik       INTEGER,
  arz           TEXT,               -- uint256, ondalık dizge olarak
  dogum_blok    INTEGER,
  dogum_zaman   INTEGER,
  egri          TEXT,
  kasa          TEXT,
  hook          TEXT,
  havuz_id      TEXT,
  acici         TEXT,
  kaynak        TEXT,               -- hangi dağıtım kaydından geldi
  PRIMARY KEY (zincir, adres)
);

-- ---- hareketler ----------------------------------------------------------

-- Bir takas. `yon` = 1 alım, -1 satım; yön bir yorum değil, hangi tarafın
-- negatif deltası olduğundan okunuyor.
CREATE TABLE IF NOT EXISTS takas (
  zincir        INTEGER NOT NULL,
  islem_hash    TEXT NOT NULL,
  log_indeksi   INTEGER NOT NULL,
  blok          INTEGER NOT NULL,
  zaman         INTEGER NOT NULL,
  jeton         TEXT NOT NULL,
  hesap         TEXT,
  yon           INTEGER NOT NULL,
  quote_miktar  TEXT NOT NULL,      -- USDC, 6 ondalık
  jeton_miktar  TEXT NOT NULL,
  fiyat         REAL,               -- quote / jeton, görüntü için
  mekan         TEXT,               -- "egri" | "havuz"
  PRIMARY KEY (zincir, islem_hash, log_indeksi)
);

CREATE INDEX IF NOT EXISTS takas_jeton_zaman ON takas (zincir, jeton, zaman);
CREATE INDEX IF NOT EXISTS takas_hesap       ON takas (zincir, hesap, zaman);

CREATE TABLE IF NOT EXISTS iade (
  zincir        INTEGER NOT NULL,
  islem_hash    TEXT NOT NULL,
  log_indeksi   INTEGER NOT NULL,
  blok          INTEGER NOT NULL,
  zaman         INTEGER NOT NULL,
  jeton         TEXT NOT NULL,
  hesap         TEXT NOT NULL,
  yakilan       TEXT NOT NULL,
  hak_edilen    TEXT NOT NULL,
  hemen_odenen  TEXT NOT NULL,
  kuyruga       TEXT NOT NULL,
  PRIMARY KEY (zincir, islem_hash, log_indeksi)
);

CREATE TABLE IF NOT EXISTS talep (
  zincir        INTEGER NOT NULL,
  kasa          TEXT NOT NULL,
  sira          INTEGER NOT NULL,
  hesap         TEXT NOT NULL,
  acilan        TEXT NOT NULL,
  kalan         TEXT NOT NULL,
  acilis_blok   INTEGER NOT NULL,
  kapanis_blok  INTEGER,
  PRIMARY KEY (zincir, kasa, sira)
);

CREATE TABLE IF NOT EXISTS geri_alim (
  zincir        INTEGER NOT NULL,
  islem_hash    TEXT NOT NULL,
  log_indeksi   INTEGER NOT NULL,
  blok          INTEGER NOT NULL,
  zaman         INTEGER NOT NULL,
  jeton         TEXT NOT NULL,
  cagiran       TEXT NOT NULL,
  harcama       TEXT NOT NULL,
  yakilan       TEXT NOT NULL,
  odul          TEXT NOT NULL,
  hak_once      TEXT NOT NULL,
  hak_sonra     TEXT NOT NULL,
  PRIMARY KEY (zincir, islem_hash, log_indeksi)
);

-- Ücretin beş adrese gidip gitmediği, ADRESLER.md'deki ölçülmemiş son
-- satır. İndekslenince o satır ölçülmüş olacak.
CREATE TABLE IF NOT EXISTS ucret (
  zincir        INTEGER NOT NULL,
  islem_hash    TEXT NOT NULL,
  log_indeksi   INTEGER NOT NULL,
  blok          INTEGER NOT NULL,
  zaman         INTEGER NOT NULL,
  jeton         TEXT,
  hedef         TEXT NOT NULL,
  dilim         TEXT NOT NULL,      -- "isletme" | "gelistirici" | ...
  miktar        TEXT NOT NULL,
  PRIMARY KEY (zincir, islem_hash, log_indeksi)
);

-- ---- zincirler arası -----------------------------------------------------

CREATE TABLE IF NOT EXISTS kopru (
  zincir        INTEGER NOT NULL,
  transfer_id   TEXT NOT NULL,
  jeton         TEXT,
  kasa          TEXT NOT NULL,
  hedef_domain  INTEGER NOT NULL,
  miktar        TEXT NOT NULL,
  durum         TEXT NOT NULL,      -- OLUSTURULDU..TAMAMLANDI
  baslangic_blok INTEGER NOT NULL,
  son_blok      INTEGER,
  PRIMARY KEY (zincir, transfer_id)
);

-- ---- mumlar --------------------------------------------------------------

-- Altı aralık. `baslangic` o mumun başlangıç Unix saniyesi ve aralığa
-- bölünebilir, böylece aynı mum iki satır olamaz.
--
-- Mumlar `takas`tan türetiliyor, zincirden ayrıca okunmuyor. Sahte hacim
-- ya da sahte fiyat üretmenin yolu yok: bir mumun arkasında saydığı
-- takaslar durur.
CREATE TABLE IF NOT EXISTS mum (
  zincir        INTEGER NOT NULL,
  jeton         TEXT NOT NULL,
  aralik        INTEGER NOT NULL,   -- saniye: 60,300,900,3600,14400,86400
  baslangic     INTEGER NOT NULL,
  a             REAL NOT NULL,      -- açılış
  y             REAL NOT NULL,      -- yüksek
  d             REAL NOT NULL,      -- düşük
  k             REAL NOT NULL,      -- kapanış
  hacim_quote   TEXT NOT NULL,
  hacim_jeton   TEXT NOT NULL,
  islem         INTEGER NOT NULL,
  PRIMARY KEY (zincir, jeton, aralik, baslangic)
);

CREATE INDEX IF NOT EXISTS mum_sorgu ON mum (zincir, jeton, aralik, baslangic DESC);

-- ---- sahipler ------------------------------------------------------------

-- Transfer olaylarından türetilen bakiye. Zincirden okunan balanceOf ile
-- karşılaştırılabilir olması şart: indeksleyicinin kendi sonucunu
-- ölçebilmesi tam olarak bu demek.
CREATE TABLE IF NOT EXISTS sahip (
  zincir        INTEGER NOT NULL,
  jeton         TEXT NOT NULL,
  adres         TEXT NOT NULL,
  bakiye        TEXT NOT NULL,
  ilk_blok      INTEGER NOT NULL,
  son_blok      INTEGER NOT NULL,
  PRIMARY KEY (zincir, jeton, adres)
);

CREATE INDEX IF NOT EXISTS sahip_siralama ON sahip (zincir, jeton, bakiye DESC);

-- ---- yönetişim -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS teklif (
  zincir        INTEGER NOT NULL,
  governor      TEXT NOT NULL,
  no            INTEGER NOT NULL,
  teklif_eden   TEXT NOT NULL,
  aciklama      TEXT,
  hedef         TEXT,
  veri          TEXT,
  acilis_blok   INTEGER NOT NULL,
  bitis_blok    INTEGER,
  lehte         TEXT NOT NULL DEFAULT '0',
  aleyhte       TEXT NOT NULL DEFAULT '0',
  durum         TEXT,
  PRIMARY KEY (zincir, governor, no)
);

CREATE TABLE IF NOT EXISTS oy (
  zincir        INTEGER NOT NULL,
  governor      TEXT NOT NULL,
  no            INTEGER NOT NULL,
  secmen        TEXT NOT NULL,
  lehte         INTEGER NOT NULL,
  guc           TEXT NOT NULL,
  blok          INTEGER NOT NULL,
  PRIMARY KEY (zincir, governor, no, secmen)
);
