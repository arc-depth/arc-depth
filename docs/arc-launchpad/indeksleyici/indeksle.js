"use strict";
/* ===========================================================================
 * indeksle.js — indeksleyicinin ana döngüsü
 *
 *   node indeksleyici/indeksle.js            # bir tur, bütçe dolana kadar
 *   node indeksleyici/indeksle.js --butce 400
 *   node indeksleyici/indeksle.js --surekli  # bitince baştan, uçtan takip
 *   node indeksleyici/indeksle.js --durum    # hiçbir şey indekslemez, rapor
 *
 * NEDEN BÜTÇELİ ÇALIŞIYOR
 *   Ölçüldü: Arc'ın genel RPC'si `eth_getLogs`'u 9.999 blokla sınırlıyor ve
 *   ayrıca hız sınırı uyguluyor. 25,25 milyon bloklu geçmiş, kaynak başına
 *   2.526 pencere eder. Bu tek oturumda bitecek bir iş değil ve öyleymiş
 *   gibi davranan bir indeksleyici, yarısında ölüp hiçbir şey kaydetmemiş
 *   olur.
 *
 *   O yüzden her tur bir İSTEK BÜTÇESİ harcıyor ve nerede kaldığını
 *   deftere yazıyor. Yüz tur sonra iş biter; her tur kendi başına
 *   anlamlıdır ve hiçbiri diğerinin bitmesini beklemez.
 *
 * NEDEN DOĞUM BLOĞU ARANIYOR
 *   Bir sözleşmenin dağıtımından önceki blokları taramak, bütçenin büyük
 *   kısmını hiç log olmayan aralıklarda harcamak demek. `eth_getCode` ile
 *   ikili arama ~25 istek ediyor ve kaynak başına 2.500 pencereye kadar
 *   tasarruf sağlıyor — bir kez yapılıp deftere yazılıyor.
 *
 * KODU OLMAYAN ADRES REDDEDİLİYOR
 *   Kaynak listesine bir CÜZDAN sızmıştı (işletme adresi) ve bir cüzdan
 *   hiç olay yayınlamaz: onu taramak bütçeyi kesin olarak boşa harcamaktır.
 *   Artık her kaynak ilk görüldüğünde kodu olup olmadığına bakılıyor ve
 *   kodu yoksa atlanıyor — gerekçesiyle, sessizce değil.
 * =========================================================================== */
const defterModulu = require("./defter.js");
const { Zincir, AZAMI_PENCERE } = require("./kaynak.js");
const { Cozucu } = require("./cozucu.js");
const kaynaklar = require("./kaynaklar.js");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const ARC = kaynaklar.ARC;

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf("--" + ad);
  if (i < 0) return varsayilan;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};

const BUTCE = Number(arg("butce", 300));
const SUREKLI = !!arg("surekli", false);
const SADECE_DURUM = !!arg("durum", false);

const U = (n) => Number(n).toLocaleString("en");

/* ---- birth block, by binary search on eth_getCode -------------------- */

async function dogumBulA(z, adres, ust) {
  /* An address with no code at the tip is not a contract: a wallet, or a
     contract that self-destructed. Either way it has no events and
     scanning it is a guaranteed waste of the budget. */
  const simdi = await z.cagir("eth_getCode", [adres, "latest"]);
  if (!simdi || simdi === "0x") return { kodsuz: true };

  let alt = 0, yuksek = ust;
  while (alt < yuksek) {
    const orta = Math.floor((alt + yuksek) / 2);
    const kod = await z.cagir("eth_getCode", [adres, "0x" + orta.toString(16)]);
    if (kod && kod !== "0x") yuksek = orta;
    else alt = orta + 1;
  }
  return { blok: alt };
}

/* ---- one source, one budgeted pass ---------------------------------- */

async function kaynakTara(db, h, z, cozucu, kaynak, tip, butce) {
  let imlec = h.imlecOku.get(kaynak.kaynak);
  if (!imlec) {
    /* First sight. Find the birth block before spending anything on
       windows — it is the difference between 2,526 windows and a handful. */
    const d = await dogumBulA(z, kaynak.adres, tip);
    if (d.kodsuz) {
      console.log("  ATLANDI  " + kaynak.kaynak.padEnd(22) +
        "adreste kod yok — cuzdan ya da yok edilmis sozlesme");
      return { atlandi: true };
    }
    h.imlecKur.run(kaynak.kaynak, kaynak.zincir, kaynak.adres, d.blok,
      d.blok - 1, Math.floor(Date.now() / 1000));
    imlec = h.imlecOku.get(kaynak.kaynak);
    console.log("  dogum     " + kaynak.kaynak.padEnd(22) + "blok " + U(d.blok));
  }

  if (imlec.son_blok >= tip) return { bitti: true, pencere: 0, log: 0, yeni: 0 };

  const turId = h.turBasla.run(Math.floor(Date.now() / 1000), kaynak.kaynak,
    imlec.son_blok + 1, tip).lastInsertRowid;

  let pencere = 0, toplamLog = 0, toplamYeni = 0, hata = null;
  const istek0 = z.istek;

  try {
    let p = imlec.son_blok + 1;
    while (p <= tip && pencere < butce) {
      const ucu = Math.min(p + AZAMI_PENCERE, tip);
      const loglar = await z.loglar([kaynak.adres], p, ucu);

      /* The events AND the cursor move in one transaction. A crash can
         therefore never leave the cursor ahead of the data it claims. */
      const yaz = db.transaction((loglar2, ilk2, son2) => {
        let yeni = 0;
        for (const l of loglar2) {
          const c = cozucu.coz(l);
          const r = h.olayYaz.run(
            kaynak.zincir,
            l.transactionHash,
            Number(BigInt(l.logIndex)),
            Number(BigInt(l.blockNumber)),
            (l.address || "").toLowerCase(),
            (l.topics[0] || "").toLowerCase(),
            l.topics[1] || null,
            l.topics[2] || null,
            l.topics[3] || null,
            l.data || "0x",
            c ? c.ad : null,
            c ? 1 : 0
          );
          if (r.changes) yeni++;
        }
        h.imlecIlerlet.run(son2, Math.floor(Date.now() / 1000), kaynak.kaynak, son2);
        return yeni;
      });

      const yeni = yaz(loglar, p, ucu);
      toplamLog += loglar.length;
      toplamYeni += yeni;
      pencere++;
      p = ucu + 1;
    }
  } catch (e) {
    hata = e.message;
  }

  h.turBitir.run(Math.floor(Date.now() / 1000), toplamLog, toplamYeni,
    z.istek - istek0, z.red, hata, turId);

  return { pencere, log: toplamLog, yeni: toplamYeni, hata };
}

/* ---- status, which is the thing that makes this measurable ----------- */

function durumYaz(db, h, tip) {
  const imlecler = h.imlecHepsi.all();
  console.log("");
  console.log("  KAYNAK                  DOGUM        ISLENEN      KALAN    %");
  let toplamKalan = 0, toplamIs = 0;
  for (const i of imlecler) {
    const is = tip - i.dogum_blok + 1;
    const islenen = Math.max(0, i.son_blok - i.dogum_blok + 1);
    const kalan = Math.max(0, tip - i.son_blok);
    toplamKalan += kalan; toplamIs += is;
    const yuzde = is > 0 ? ((islenen / is) * 100) : 100;
    console.log("  " + i.kaynak.padEnd(22) +
      U(i.dogum_blok).padStart(10) + U(islenen).padStart(13) +
      U(kalan).padStart(11) + ("  " + yuzde.toFixed(1)).padStart(7));
  }
  const n = h.olaySayisi.get(ARC).n;
  console.log("");
  console.log("  " + imlecler.length + " kaynak, " + U(n) + " olay yazildi");
  console.log("  kalan " + U(toplamKalan) + " blok = " +
    U(Math.ceil(toplamKalan / AZAMI_PENCERE)) + " pencere");
  if (toplamIs > 0) {
    console.log("  tamamlanma %" + (((toplamIs - toplamKalan) / toplamIs) * 100).toFixed(2));
  }

  const dagilim = h.olayKonuDagilimi.all(ARC);
  if (dagilim.length) {
    console.log("");
    console.log("  EN COK GOReulEN OLAYLAR:");
    for (const d of dagilim.slice(0, 12)) {
      console.log("   " + U(d.n).padStart(8) + "  " + (d.ad || "<cozulemedi " + d.konu0.slice(0, 12) + ">"));
    }
    const cozulemeyen = dagilim.filter((d) => !d.ad).reduce((a, b) => a + b.n, 0);
    if (cozulemeyen) {
      console.log("");
      console.log("   cozulemeyen " + U(cozulemeyen) + " log — silinmedi, ham " +
        "haliyle duruyor; buyuk bir yigin esleme geride kaldi demektir");
    }
  }
  return toplamKalan;
}

/* ---- main ------------------------------------------------------------ */

(async () => {
  const db = defterModulu.ac();
  const h = defterModulu.hazirla(db);
  const z = new Zincir(RPC, ARC, { araVer: 300 });
  const cozucu = new Cozucu();
  const o = cozucu.ozet();

  console.log("ARC PULSE INDEKSLEYICI");
  console.log("  RPC        " + RPC);
  console.log("  pencere    " + U(AZAMI_PENCERE) + " blok (olculmus sinir: 10.000 reddediliyor)");
  console.log("  cozucu     " + o.olaySayisi + " olay imzasi, " + o.sozlesmeSayisi + " sozlesme");
  if (o.cakisma.length) console.log("  CAKISMA    " + o.cakisma.length + " topic0 iki imzaya dusuyor");

  const tip = await z.blokNo();
  console.log("  uc         blok " + U(tip));

  if (SADECE_DURUM) {
    durumYaz(db, h, tip);
    db.close();
    return;
  }

  const liste = kaynaklar.hepsi();
  console.log("  kaynak     " + liste.length);
  console.log("  butce      " + BUTCE + " pencere/tur" + (SUREKLI ? "  (surekli)" : ""));
  console.log("");

  let tur = 0;
  do {
    tur++;
    /* The budget is split across sources that still have work, so one
       source with a deep history cannot starve the others. A source that
       is already at the tip gives its share back. */
    const kalanlar = liste.filter((k) => {
      const i = h.imlecOku.get(k.kaynak);
      return !i || i.son_blok < tip;
    });
    if (kalanlar.length === 0) {
      console.log("  butun kaynaklar ucta.");
      break;
    }
    const pay = Math.max(1, Math.floor(BUTCE / kalanlar.length));

    let turPencere = 0;
    for (const k of kalanlar) {
      const r = await kaynakTara(db, h, z, cozucu, k, tip, pay);
      if (r.atlandi || r.bitti) continue;
      turPencere += r.pencere;
      const d = z.durum();
      console.log("  " + (r.hata ? "HATA " : "     ") + k.kaynak.padEnd(22) +
        String(r.pencere).padStart(4) + " pencere  " +
        String(r.log).padStart(6) + " log  " +
        String(r.yeni).padStart(6) + " yeni" +
        (r.hata ? "   " + r.hata.slice(0, 50) : "") +
        "   [istek " + d.istek + " red " + d.red + "]");
    }
    if (turPencere === 0) break;
  } while (SUREKLI);

  const kalan = durumYaz(db, h, tip);
  console.log("");
  const d = z.durum();
  console.log("  bu oturumda " + d.istek + " istek, " + d.red + " red");
  if (kalan > 0) {
    console.log("  BITMEDI — ayni komutu yeniden calistirmak kaldigi yerden devam eder.");
  }
  db.close();
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
