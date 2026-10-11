"use strict";
/* ===========================================================================
 * turet.js — ham olaydan anlamlı tabloya
 *
 *   node indeksleyici/turet.js
 *
 * TEK YÖNLÜ BİR BORU
 *   `olay` → `takas` / `ucret` / `sahip` / `iade` / `geri_alim`. Ters yön
 *   yok: türetilmiş bir tabloya elle satır girilmiyor ve girilemiyor.
 *   Dolayısıyla her türetilmiş satırın kaynağı bir işlem hash'i ve bir log
 *   indeksi — "bu sayı nereden geldi" sorusunun cevabı her zaman var.
 *
 *   Bu, şartnamedeki *"Sahte fiyat, grafik, hacim veya holder verisi
 *   gösterme"* kuralının uygulanabilir hali: sahte veri üretmenin yolu
 *   kapalı, çünkü tablo girdi kabul etmiyor.
 *
 * NEDEN ÇÖZÜCÜ İKİ KEZ ÇALIŞIYOR
 *   İndeksleyici logu ham haliyle yazarken bir kez çözüyor (yalnızca olay
 *   ADINI kaydetmek için) ve burada ikinci kez çözüyor (alanları okumak
 *   için). Alanları `olay` tablosuna yazmamak kasıtlı: bir ABI düzeltmesi
 *   geldiğinde yeniden taramak değil, yalnızca yeniden TÜRETMEK gerekiyor —
 *   ve yeniden tarama bu RPC'de saatler, yeniden türetme saniyeler.
 *
 * FİYAT NEREDEN GELİYOR
 *   Olayın kendisinden: `Alindi(alici, odenen, alinan, vergi)` hem ödenen
 *   quote'u hem alınan jetonu taşıyor, yani fiyat bir bölme. Hiçbir yerden
 *   fiyat ÇEKİLMİYOR — ne oracle'dan ne havuzdan. Bir takasın fiyatı, o
 *   takasta gerçekten değişen iki miktarın oranıdır.
 * =========================================================================== */
const defterModulu = require("./defter.js");
const { Cozucu } = require("./cozucu.js");

const ARC = 5042;

/* Which decoded events become which rows. The mapping is explicit and
   short on purpose: an event not listed here is stored raw and derives
   nothing, which is the honest default for an event nobody has decided
   what to do with yet. */
const KURALLAR = {
  /* arc-depth's curve. Measured on chain: a $1.00 buy produced
     65,991.29 DEPTH with zero tax, and the fee split 3,000/3,000/4,000. */
  Alindi: (a) => ({
    tip: "takas", yon: 1,
    quote: a.odenen, jeton: a.alinan, hesap: a.alici, mekan: "egri"
  }),
  Satildi: (a) => ({
    tip: "takas", yon: -1,
    quote: a.alinan, jeton: a.verilen, hesap: a.satici, mekan: "egri"
  }),
  /* The launch curve's three-way split. NOT the Pulse hook's five-way
     split, which has never happened on chain — saying otherwise would be
     closing a row in ADRESLER.md that is still open. */
  UcretBolundu: (a) => ({
    tip: "ucret-uclu",
    dilimler: [
      { dilim: "kurucu", miktar: a.kurucuya },
      { dilim: "stake", miktar: a.stakeye },
      { dilim: "havuz", miktar: a.havuzaKalan }
    ]
  }),
  TokenUcreti: (a) => ({
    tip: "ucret-tekli",
    dilimler: [{ dilim: "derinlik", miktar: a.derinlige }]
  }),
  Transfer: (a) => ({
    tip: "transfer", from: a.from, to: a.to, miktar: a.value
  })
};

const SIFIR = "0x0000000000000000000000000000000000000000";

function turet(db, h, cozucu) {
  const satirlar = db.prepare(
    "SELECT * FROM olay WHERE zincir = ? AND cozuldu = 1 ORDER BY blok, log_indeksi"
  ).all(ARC);

  const sayac = { takas: 0, ucret: 0, transfer: 0, atlanan: 0, zamansiz: 0 };
  const bakiye = new Map();   // jeton|adres -> BigInt

  /* Block timestamps. A trade with no timestamp cannot be put in a candle,
     so it is counted and named rather than given a guessed time. */
  const zamanlar = new Map();
  for (const b of db.prepare("SELECT numara, zaman FROM blok WHERE zincir = ?").all(ARC)) {
    zamanlar.set(b.numara, b.zaman);
  }

  const yaz = db.transaction(() => {
    for (const s of satirlar) {
      const kural = KURALLAR[s.ad];
      if (!kural) { sayac.atlanan++; continue; }

      const c = cozucu.coz({
        topics: [s.konu0, s.konu1, s.konu2, s.konu3].filter((x) => x),
        data: s.veri
      });
      if (!c) { sayac.atlanan++; continue; }

      const r = kural(c.alanlar);
      const zaman = zamanlar.get(s.blok);

      if (r.tip === "takas") {
        if (zaman === undefined) { sayac.zamansiz++; continue; }
        const q = BigInt(r.quote), j = BigInt(r.jeton);
        /* Price as a plain ratio of the two amounts that actually moved,
           scaled for the decimal gap: quote has 6, the launch token 18. */
        const fiyat = j > 0n ? (Number(q) / 1e6) / (Number(j) / 1e18) : null;
        h.takasYaz.run({
          zincir: ARC, islem_hash: s.islem_hash, log_indeksi: s.log_indeksi,
          blok: s.blok, zaman, jeton: s.adres, hesap: (r.hesap || "").toLowerCase(),
          yon: r.yon, quote_miktar: q.toString(), jeton_miktar: j.toString(),
          fiyat, mekan: r.mekan
        });
        sayac.takas++;
      } else if (r.tip === "ucret-uclu" || r.tip === "ucret-tekli") {
        if (zaman === undefined) { sayac.zamansiz++; continue; }
        /* One row per slice, so a fee can be summed per destination
           without unpacking anything. The log index is offset by the
           slice number to keep the key unique — three slices share one
           log, and a key collision would silently drop two of them. */
        r.dilimler.forEach((d, i) => {
          if (BigInt(d.miktar) === 0n) return;
          h.ucretYaz.run({
            zincir: ARC, islem_hash: s.islem_hash,
            log_indeksi: s.log_indeksi * 100 + i,
            blok: s.blok, zaman, jeton: s.adres,
            hedef: d.dilim, dilim: d.dilim, miktar: d.miktar
          });
          sayac.ucret++;
        });
      } else if (r.tip === "transfer") {
        const v = BigInt(r.miktar);
        const bul = (adr) => {
          const k = s.adres + "|" + adr.toLowerCase();
          if (!bakiye.has(k)) {
            const mevcut = h.sahipOku.get(ARC, s.adres, adr.toLowerCase());
            bakiye.set(k, mevcut ? BigInt(mevcut.bakiye) : 0n);
          }
          return k;
        };
        if (r.from.toLowerCase() !== SIFIR) {
          const k = bul(r.from);
          bakiye.set(k, bakiye.get(k) - v);
        }
        if (r.to.toLowerCase() !== SIFIR) {
          const k = bul(r.to);
          bakiye.set(k, bakiye.get(k) + v);
        }
        sayac.transfer++;
      }
    }

    for (const [k, v] of bakiye) {
      const [jeton, adres] = k.split("|");
      h.sahipYaz.run({
        zincir: ARC, jeton, adres, bakiye: v.toString(),
        ilk_blok: 0, son_blok: 0
      });
    }
  });

  yaz();
  return { sayac, sahip: bakiye.size, olay: satirlar.length };
}

if (require.main === module) {
  const db = defterModulu.ac();
  const h = defterModulu.hazirla(db);
  const cozucu = new Cozucu();

  console.log("TURETME — ham olaydan anlamli tabloya");
  console.log("");
  const r = turet(db, h, cozucu);
  console.log("  " + r.olay + " cozulmus olay islendi");
  console.log("    takas     " + r.sayac.takas);
  console.log("    ucret     " + r.sayac.ucret + " dilim");
  console.log("    transfer  " + r.sayac.transfer + "  -> " + r.sahip + " sahip bakiyesi");
  if (r.sayac.atlanan) {
    console.log("    atlanan   " + r.sayac.atlanan +
      "  (kurali olmayan olay — ham haliyle duruyor)");
  }
  if (r.sayac.zamansiz) {
    console.log("    ZAMANSIZ  " + r.sayac.zamansiz +
      "  (blok zamani bilinmiyor; tahmin edilmedi, atlandi)");
  }
  db.close();
}

module.exports = { turet, KURALLAR };
