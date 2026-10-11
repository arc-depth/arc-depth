"use strict";
/* ===========================================================================
 * denetim-indeks.js — indeksleyici kendi sonucunu ölçebiliyor mu
 *
 *   node scripts/denetim-indeks.js
 *
 * SORU
 *   Bir indeksleyicinin "çalışıyor" demesi hiçbir şey ifade etmez. Doğru
 *   soru şu: türettiği sayı, zincirin söylediği sayıyla aynı mı?
 *
 *   `sahip` tablosu TAMAMEN Transfer olaylarından türetiliyor — hiçbir
 *   yerde `balanceOf` okunmuyor. Dolayısıyla o tabloyu zincirdeki gerçek
 *   `balanceOf` ile karşılaştırmak, indeksleyicinin bağımsız bir sınavı:
 *   tek bir eksik log, tek bir yanlış çözülmüş alan ya da tek bir çift
 *   sayım burada ortaya çıkar.
 *
 * NEDEN BU SINAV GEÇİLEBİLİR OLMAK ZORUNDA DEĞİL
 *   Bir token doğumundan beri EKSİKSİZ indekslenmediyse bakiye yanlış
 *   olur — ve bu bir kusur değil, tarama bitmemiş demektir. O yüzden
 *   denetim iki şeyi ayırıyor:
 *
 *     TAM indekslenmiş token    -> bakiye birebir tutmak ZORUNDA
 *     yarim indekslenmis token  -> atlanıyor, gerekçesiyle
 *
 *   İkisini karıştırmak, bitmemiş bir taramayı bozuk bir indeksleyici gibi
 *   göstermek olurdu — ya da tersi, ki daha kötü.
 *
 * ARZ DA KONTROL EDİLİYOR
 *   Sıfır adresinden gelen ve sıfır adresine giden transferler mint ve burn
 *   demek. Bunların toplamı `totalSupply` etmek zorunda, ve bu bakiye
 *   kontrolünden ayrı bir sınav: biri sahip başına, diğeri bütün üzerinden
 *   yanılabilir.
 * =========================================================================== */
const path = require("path");
const fs = require("fs");

const KOK = path.join(__dirname, "..");
const DB_YOLU = path.join(KOK, "indeksleyici", "veri", "pulse.db");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const ARC = 5042;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(m, p) {
  let gecikme = 1000;
  for (let k = 0; k < 6; k++) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }),
      signal: AbortSignal.timeout(45_000)
    });
    const j = await r.json();
    if (!j.error) return j.result;
    if (!/rate limit|429|exceeded/i.test(j.error.message)) throw new Error(j.error.message);
    await bekle(gecikme); gecikme = Math.min(gecikme * 2, 16_000);
  }
  throw new Error("hiz siniri gecilemedi");
}

const U = (n) => Number(n).toLocaleString("en");

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => {
    if (!iyi) kotu++;
    console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
  };

  console.log("INDEKS DENETIMI — turetilen sayi zincirle tutuyor mu");
  console.log("");

  if (!fs.existsSync(DB_YOLU)) {
    console.log("ATLANDI — indeks veritabani yok (" + DB_YOLU + ")");
    console.log("");
    console.log("  Once: node indeksleyici/indeksle.js");
    process.exit(75);
  }

  let Database;
  try { Database = require("better-sqlite3"); }
  catch (e) {
    console.log("ATLANDI — better-sqlite3 kurulu degil: npm install better-sqlite3");
    process.exit(75);
  }

  const db = new Database(DB_YOLU, { readonly: true });

  /* ---- 1. the ledger adds up to itself ---------------------------- */
  console.log("1) DEFTER KENDI ICINDE TUTARLI MI");
  {
    const olay = db.prepare("SELECT COUNT(*) n FROM olay WHERE zincir = ?").get(ARC).n;
    const cozulen = db.prepare("SELECT COUNT(*) n FROM olay WHERE zincir = ? AND cozuldu = 1").get(ARC).n;
    const takas = db.prepare("SELECT COUNT(*) n FROM takas WHERE zincir = ?").get(ARC).n;
    const mum = db.prepare("SELECT COUNT(*) n FROM mum WHERE zincir = ?").get(ARC).n;
    const sahip = db.prepare("SELECT COUNT(*) n FROM sahip WHERE zincir = ?").get(ARC).n;

    console.log("     olay " + U(olay) + " (" + U(cozulen) + " cozuldu)   takas " +
      U(takas) + "   mum " + U(mum) + "   sahip " + U(sahip));

    ok(olay > 0, "indekslenmis olay var", U(olay) + " olay");

    /* Every candle must be backed by trades in its own bucket. A candle
       with no trades behind it is a fabricated candle, which is exactly
       what the brief forbids. */
    const dayanaksiz = db.prepare(
      "SELECT COUNT(*) n FROM mum m WHERE NOT EXISTS (" +
      "SELECT 1 FROM takas t WHERE t.zincir = m.zincir AND t.jeton = m.jeton " +
      "AND t.zaman >= m.baslangic AND t.zaman < m.baslangic + m.aralik)"
    ).get().n;
    ok(dayanaksiz === 0,
      "HER MUMUN ARKASINDA GERCEK TAKAS VAR",
      dayanaksiz === 0 ? "dayanaksiz mum yok" : U(dayanaksiz) + " mum uydurma");

    /* And every candle's trade count must equal the trades in its bucket.
       The check above catches a candle with zero trades; this one catches
       a candle that counted the wrong number. */
    const yanlisSayim = db.prepare(
      "SELECT COUNT(*) n FROM mum m WHERE m.islem != (" +
      "SELECT COUNT(*) FROM takas t WHERE t.zincir = m.zincir AND t.jeton = m.jeton " +
      "AND t.zaman >= m.baslangic AND t.zaman < m.baslangic + m.aralik AND t.fiyat > 0)"
    ).get().n;
    ok(yanlisSayim === 0,
      "HER MUMUN ISLEM SAYISI KOVASINDAKI TAKAS SAYISIYLA AYNI",
      yanlisSayim === 0 ? "sapma yok" : U(yanlisSayim) + " mum yanlis sayiyor");

    /* A trade with no timestamp would silently vanish from every chart. */
    const zamansiz = db.prepare(
      "SELECT COUNT(*) n FROM takas t LEFT JOIN blok b " +
      "ON b.zincir = t.zincir AND b.numara = t.blok WHERE b.numara IS NULL"
    ).get().n;
    ok(zamansiz === 0, "zamani bilinmeyen takas yok",
      zamansiz === 0 ? "hepsinin blok zamani var" : U(zamansiz) + " takas zamansiz");
  }

  /* ---- 2. the derived balances against the chain ------------------- */
  console.log("");
  console.log("2) TURETILEN BAKIYE, ZINCIRDEKI balanceOf ILE AYNI MI");
  console.log("   `sahip` tablosu YALNIZCA Transfer olaylarindan tureniyor;");
  console.log("   hicbir yerde balanceOf okunmuyor. Bu yuzden karsilastirma");
  console.log("   bagimsiz bir sinav.");
  console.log("");

  const jetonlar = db.prepare(
    "SELECT DISTINCT jeton FROM sahip WHERE zincir = ?"
  ).all(ARC).map((r) => r.jeton);

  if (jetonlar.length === 0) {
    ok(true, "henuz sahip kaydi yok — karsilastirilacak bir sey yok",
      "tarama ilerledikce bu satir sinava donusur");
  }

  for (const jeton of jetonlar) {
    /* Is this token indexed from its birth? Only then is the balance
       expected to match. The source whose address IS the token carries
       the cursor. */
    const imlec = db.prepare(
      "SELECT * FROM imlec WHERE zincir = ? AND adres = ?"
    ).get(ARC, jeton);

    const tip = Number(BigInt(await rpc("eth_blockNumber", [])));
    const tamMi = imlec && imlec.son_blok >= tip - 10_000;

    const sahipler = db.prepare(
      "SELECT adres, bakiye FROM sahip WHERE zincir = ? AND jeton = ? AND bakiye != '0'"
    ).all(ARC, jeton);

    console.log("   " + jeton + "   " + sahipler.length + " sahip" +
      (tamMi ? "" : "   (tarama ucta DEGIL: son " +
        U(imlec ? imlec.son_blok : 0) + " / uc " + U(tip) + ")"));

    if (!tamMi) {
      console.log("     ATLANDI — bu token dogumundan uca kadar indekslenmedi,");
      console.log("     dolayisiyla bakiyenin tutmasi BEKLENMEZ. Bitmemis bir");
      console.log("     taramayi bozuk bir indeksleyici gibi gostermek yanlis olur.");
      continue;
    }

    let sapan = 0;
    for (const s of sahipler) {
      const veri = "0x70a08231" + s.adres.slice(2).padStart(64, "0");
      const r = await rpc("eth_call", [{ to: jeton, data: veri }, "latest"]);
      const zincirde = BigInt(r);
      const bizde = BigInt(s.bakiye);
      if (zincirde !== bizde) {
        sapan++;
        console.log("     SAPMA " + s.adres + "   bizde " + bizde +
          "   zincirde " + zincirde);
      }
      await bekle(200);
    }
    ok(sapan === 0,
      "TURETILEN BAKIYELER ZINCIRLE BIREBIR AYNI (" + jeton.slice(0, 10) + ")",
      sapan === 0 ? sahipler.length + " sahip, sapma yok"
        : sapan + "/" + sahipler.length + " sahipte sapma");
  }

  /* ---- 3. what the indexer has NOT done, said plainly ------------- */
  console.log("");
  console.log("3) INDEKSLEYICININ YAPMADIGI — aciklanmis");
  const imlecler = db.prepare("SELECT * FROM imlec WHERE zincir = ? ORDER BY kaynak").all(ARC);
  const tip2 = Number(BigInt(await rpc("eth_blockNumber", [])));
  let kalanToplam = 0;
  let uctaOlan = 0;
  for (const i of imlecler) {
    const kalan = Math.max(0, tip2 - i.son_blok);
    kalanToplam += kalan;
    if (kalan < 10_000) uctaOlan++;
  }
  console.log("     " + imlecler.length + " kaynagin " + uctaOlan + " tanesi ucta");
  console.log("     kalan " + U(kalanToplam) + " blok = " +
    U(Math.ceil(kalanToplam / 9999)) + " pencere");
  /* Read from the config, not hardcoded. This line said 25 for a while
     after the scope narrowed to 13, which is the sort of green statement
     that is worse than a red one: it was wrong and nothing failed. */
  let beklenenKaynak = null;
  try {
    beklenenKaynak = require(path.join(KOK, "indeksleyici", "kaynaklar.js")).hepsi().length;
  } catch (e) { /* the config is allowed to be absent */ }
  console.log("     yapilandirmada " + (beklenenKaynak === null ? "?" : beklenenKaynak) +
    " kaynak var, " + imlecler.length + " tanesi baslatildi");
  ok(imlecler.length > 0, "en az bir kaynak baslatildi",
    imlecler.length + "/" + (beklenenKaynak === null ? "?" : beklenenKaynak));

  /* A cursor for an address the config no longer lists means the index
     holds data this system is not responsible for. It happened: the
     indexer was pointed at arc-depth and fathom to prove the pipeline
     worked, which spent a shared rate-limited RPC budget on another
     project's history. Narrowing the config does not remove the rows,
     so the check is for the rows. */
  if (beklenenKaynak !== null) {
    const bizim = new Set(
      require(path.join(KOK, "indeksleyici", "kaynaklar.js")).hepsi()
        .map((x) => x.adres.toLowerCase())
    );
    const yabanci = imlecler.filter((i) => !bizim.has(i.adres.toLowerCase()));
    ok(yabanci.length === 0,
      "INDEKSTE KAPSAM DISI KAYNAK YOK",
      yabanci.length ? yabanci.map((y) => y.kaynak).join(", ")
        : imlecler.length + " imlecin hepsi yapilandirmada");
  }

  /* Pulse's own contracts are not deployed, so the indexer cannot index
     them. Stating it here keeps a future reader from mistaking an empty
     Pulse section for a broken indexer. */
  console.log("");
  console.log("     Pulse'in YENI sozlesmeleri DAGITILMADI (docs/js/adresler.js");
  console.log("     icinde PULSE blogunun tamami null). Bu indeksleyici onlari");
  console.log("     indekslemiyor ve indeksledigini iddia etmiyor.");
  console.log("");
  console.log("     Indeksledigi sey BU PROJENIN zincirde canli olan kismi:");
  console.log("     canli hook, launchpad, kuyruk, hazine, ALP yonetisimi ve");
  console.log("     ESKI blogundaki eski Pulse sozlesmeleri.");
  console.log("");
  console.log("     arc-depth, fathom ve derinlik KAPSAM DISI — kardes");
  console.log("     projeler. Bir sure indekslendiler ve bu bir kapsam");
  console.log("     hatasiydi: boru hattini dogrulamak icin bir kaynak");
  console.log("     yeterdi, baska bir projenin tum gecmisini taramak degil.");

  db.close();
  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
