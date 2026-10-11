"use strict";
/* ===========================================================================
 * kaynaklar.js — ne indekslenecek
 *
 * NEREDEN GELİYOR
 *   Adresler elle yazılmıyor; depodaki dağıtım kayıtlarından (`dagitim*.json`)
 *   okunuyor. Elle tutulan bir liste, birisi yeni bir şey dağıttığı ilk gün
 *   eskiyen bir listedir — ve eskidiğinde indeksleyici hiçbir şey söylemeden
 *   eksik indeksler.
 *
 * KAPSAM: YALNIZCA BU PROJE
 *   arc-depth, fathom ve derinlik KARDEŞ PROJELER. İlk sürümde onları da
 *   indeksliyordum ve bu bir kapsam hatasıydı: gerekçem "Pulse dağıtılmadı,
 *   boru hattını doğrulayacak veri yok" idi, ama doğrulama için BİR kaynak
 *   yeterdi — başka bir projenin tüm geçmişini taramak değil. Üstelik o
 *   tarama, paylaşılan ve hız sınırlı RPC bütçesini bize ait olmayan veriye
 *   harcıyordu.
 *
 *   Artık yalnızca bu projenin sözleşmeleri var:
 *
 *     dagitim.json            canlı hook, launchpad, kuyruk, router, hazine
 *     dagitim-yonetisim.json  ALP yönetişimi (govToken adı "Arc Launchpad")
 *     docs/js/adresler.js     PULSE ve ESKI blokları
 *
 * BUGÜN NE VAR, NE YOK — AÇIKÇA
 *   PULSE bloğunun tamamı null, yani Pulse'ın yeni sözleşmeleri henüz
 *   dağıtılmadı. İndeksleyici bugün onları indekslemiyor ve indekslediğini
 *   iddia etmiyor. İndekslediği şey, bu projenin ZİNCİRDE CANLI olan
 *   kısmı: hook, launchpad, kuyruk ve yönetişim.
 *
 *   Pulse dağıtıldığında eklenecek şey bir yapılandırma satırı, bir yeniden
 *   yazım değil. Büyüme mekanizması tasarımın parçası; dar kapsamla kurup
 *   "sonra düşünürüz" demek bu projede kabul edilmiyor.
 *
 * DOĞUM BLOĞU NEDEN ÖNEMLİ
 *   Bir sözleşmenin dağıtıldığı bloktan öncesini taramak 2.526 pencerenin
 *   büyük kısmını boşa harcamak demek. Doğum bloğu bilinmiyorsa `null`
 *   kalıyor ve ilk turda zincirden aranıyor (ikili arama, `eth_getCode`
 *   ile) — bir kez bulunup deftere yazılıyor.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const ARC = 5042;

/* The deployment records, and which keys in each are contracts worth
   watching. A key that is not listed is not indexed — the launchpad's
   `usdc` pointer is an address but not a source of our events. */
const KAYITLAR = [
  {
    dosya: "dagitim.json",
    ad: "launchpad",
    alanlar: {
      hook: "canli hook — ucret dilimleri ve Whale Shield burada",
      launchpad: "launch'lari acan sozlesme",
      queue: "launch kuyrugu — hisse menusu kuratorlugu",
      router: "takas yonlendirici",
      hazine: "hazine"
    }
  },
  /* dagitim-depth.json, dagitim-fathom.json and dagitim-derinlik.json are
     deliberately absent. They are sibling projects; their events are not
     this system's to index, and scanning them spent a shared rate-limited
     RPC budget on data nobody here asked for. */
  {
    dosya: "dagitim-yonetisim.json",
    ad: "yonetisim",
    alanlar: {
      governor: "ALP yonetisimi — teklifler ve oylar",
      govToken: "ALP",
      staking: "oy gucunun kaynagi",
      devPool: "gelistirici fonu — DAO'nun asil isi",
      alpLocker: "ALP likiditesinin kilidi",
      vesting: "vesting"
    }
  }
];

/* Pulse's own contracts, read from the page's address file.
 *
 * ONLY THE BLOCKS THAT ARE OURS
 *   The first version of this took every `name: "0x..."` in the file and
 *   got 13 sources, of which 12 were wrong: Uniswap v4's PoolManager
 *   (shared by every pool on Arc), USDC, the four collateral tokens,
 *   their four Chainlink feeds, and — worst — `isletme`, which is a
 *   WALLET and emits nothing at all.
 *
 *   Indexing those would have spent the whole request budget on data
 *   that is not ours and, in the PoolManager's case, on every unrelated
 *   pool on the chain. So the extraction is keyed by BLOCK NAME:
 *
 *     PULSE   ours, not deployed yet (every entry is null today)
 *     ESKI    ours, deployed earlier
 *
 *   DIS, HEDEFLER and TEMINAT_EVRENI are deliberately skipped: external
 *   contracts, payout wallets and the collateral universe respectively.
 *   None of them emits an event this system owns.
 */
function _blok(s, ad) {
  const i = s.indexOf("export const " + ad + " =");
  if (i < 0) return "";
  const bas = s.indexOf("{", i);
  if (bas < 0) return "";
  let derinlik = 0;
  for (let k = bas; k < s.length; k++) {
    if (s[k] === "{") derinlik++;
    else if (s[k] === "}") { derinlik--; if (derinlik === 0) return s.slice(bas, k + 1); }
  }
  return "";
}

function pulseKaynaklari() {
  const yol = path.join(KOK, "docs", "js", "adresler.js");
  if (!fs.existsSync(yol)) return [];
  const s = fs.readFileSync(yol, "utf8");
  const out = [];
  /* The file is an ES module, so it is parsed rather than imported: a
     require() of a module with `export` throws. Matching only
     `name: "0x..."` means a null entry cannot be picked up by accident,
     which is what keeps an undeployed contract out of the list. */
  for (const [blok, etiket] of [["PULSE", "Pulse"], ["ESKI", "eski Pulse"]]) {
    const govde = _blok(s, blok);
    for (const m of govde.matchAll(/(\w+)\s*:\s*"(0x[0-9a-fA-F]{40})"/g)) {
      out.push({
        kaynak: "pulse:" + m[1],
        zincir: ARC,
        adres: m[2].toLowerCase(),
        dogum_blok: null,
        neden: etiket + ": " + m[1]
      });
    }
  }
  return out;
}

function hepsi() {
  const out = [];
  const gorulen = new Set();

  for (const k of KAYITLAR) {
    const yol = path.join(KOK, k.dosya);
    if (!fs.existsSync(yol)) continue;
    const j = JSON.parse(fs.readFileSync(yol, "utf8"));
    for (const [alan, neden] of Object.entries(k.alanlar)) {
      const a = j[alan];
      if (typeof a !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(a)) continue;
      const adres = a.toLowerCase();
      /* The same address appears in more than one record — DEPTH's token
         is in three of them. Indexing it three times would triple the
         request budget for no new data. */
      if (gorulen.has(adres)) continue;
      gorulen.add(adres);
      out.push({
        kaynak: k.ad + ":" + alan,
        zincir: ARC,
        adres,
        dogum_blok: j[alan + "Blok"] || j.blok || null,
        neden
      });
    }
  }

  for (const p of pulseKaynaklari()) {
    if (gorulen.has(p.adres)) continue;
    gorulen.add(p.adres);
    out.push(p);
  }

  return out;
}

module.exports = { hepsi, ARC };
