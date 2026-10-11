"use strict";
/* ===========================================================================
 * zaman-doldur.js — olayı olan blokların zamanını çek
 *
 *   node indeksleyici/zaman-doldur.js
 *
 * NEDEN AYRI BİR ADIM
 *   `eth_getLogs` blok zamanı döndürmüyor, yalnızca blok numarası. Zaman
 *   `eth_getBlockByNumber` ile ayrıca isteniyor ve bu istek bu RPC'de
 *   pahalı. Dolayısıyla tarama sırasında her blok için zaman çekmek,
 *   bütçeyi ikiye katlamak olurdu.
 *
 *   Bunun yerine: yalnızca OLAYI OLAN bloklar için zaman çekiliyor. 25
 *   milyon blok var ama olayı olan blok sayısı iki haneli — yani bu adım
 *   tarama bittikten sonra bir kaç saniye.
 *
 * NEDEN ZAMAN TAHMİN EDİLMİYOR
 *   Blok süresi ölçüldü (0,507 s/blok) ve "blok numarası × süre" ile zaman
 *   üretmek cazip. Ama o bir tahmin ve bir mumun hangi aralığa düştüğünü
 *   belirliyor — yani grafikte gerçek olmayan bir zaman gösterirdi. Zamanı
 *   olmayan takas, mumsuz kalır ve sayılır; uydurulmuş zamanla mum olmaz.
 * =========================================================================== */
const defterModulu = require("./defter.js");
const { Zincir } = require("./kaynak.js");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const ARC = 5042;

(async () => {
  const db = defterModulu.ac();
  const h = defterModulu.hazirla(db);
  const z = new Zincir(RPC, ARC, { araVer: 250 });

  const eksik = db.prepare(
    "SELECT DISTINCT o.blok FROM olay o " +
    "LEFT JOIN blok b ON b.zincir = o.zincir AND b.numara = o.blok " +
    "WHERE o.zincir = ? AND b.numara IS NULL ORDER BY o.blok"
  ).all(ARC).map((r) => r.blok);

  console.log("BLOK ZAMANI DOLDURMA");
  console.log("  olayi olan ve zamani bilinmeyen blok: " + eksik.length);
  if (eksik.length === 0) {
    console.log("  dolduracak bir sey yok.");
    db.close();
    return;
  }
  console.log("");

  let n = 0;
  for (const b of eksik) {
    try {
      const t = await z.blokZamani(b);
      if (t === null) { console.log("  blok " + b + " bulunamadi"); continue; }
      h.blokYaz.run(ARC, b, t);
      n++;
      console.log("  " + b.toLocaleString("en") + "  ->  " +
        new Date(t * 1000).toISOString().replace("T", " ").slice(0, 19));
    } catch (e) {
      console.log("  blok " + b + " HATA: " + e.message.slice(0, 50));
    }
  }

  const d = z.durum();
  console.log("");
  console.log("  " + n + "/" + eksik.length + " blok zamani yazildi, " +
    d.istek + " istek, " + d.red + " red");
  db.close();
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
