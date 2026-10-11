"use strict";
/* ===========================================================================
 * olc-teminat-secimi.js — teminat ekranı gerçekten çalışıyor mu
 *
 *   node scripts/olc-teminat-secimi.js
 *
 * NE ÖLÇÜYOR
 *   Sayfanın teminat seçimi için yaptığı HER ŞEYİ, sayfanın kendi kodunu
 *   çağırarak. `docs/js/teminat.js` bir ES modülü ve burada doğrudan import
 *   ediliyor — yani test edilen şey tarifi değil, kodun kendisi.
 *
 *   Bir tarayıcıda açıp gözle bakmak bunu ölçmez: gözle bakmak "bir şey
 *   göründü" der, bu koşum "gösterilen sayı zincirle aynı" der.
 *
 * NEDEN HEM GEÇMESİ HEM REDDETMESİ ÖLÇÜLÜYOR
 *   Yalnızca çalışan varlıklarla test etmek, her şeye "çalışıyor" diyen bir
 *   ekranı da geçirirdi. O yüzden kümede kasıtlı olarak reddedilmesi
 *   gerekenler var:
 *
 *     PEPE (Base)      havuzu var, likiditesi SIFIR
 *     uydurma adres    Base'de gerçekten bir havuzu var (Uniswap'te herkes
 *                      havuz açabilir) ve o da boş
 *
 *   İkisi de reddedilmek zorunda. Reddetmezse taban, kimsenin işlem
 *   yapamayacağı bir fiyattan hesaplanır.
 *
 * ÖNERİLEN 50 DE ÖLÇÜLÜYOR
 *   Liste `teminat-adaylari.json`'dan üretiliyor ve üretim bozulabilir:
 *   adres kayması, ondalık karışması, zincir eşlemesinin boşalması. O yüzden
 *   listenin kendisi de kontrol ediliyor — ve örneklem zincirden doğrulanıyor.
 * =========================================================================== */
const path = require("path");
const fs = require("fs");

const KOK = path.join(__dirname, "..");
const JS = path.join(KOK, "docs", "js");

/* Deliberately mixed: assets that must pass, and assets that must be
   refused. A suite made only of the former cannot tell a working check
   from one that says yes to everything. */
const DENEMELER = [
  { ad: "WETH", ca: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    bekle: true, donusur: true, simge: "WETH" },
  /* SHIB is here for the SPLIT, not for the pass. Its price reads
     perfectly and its $2,000 conversion pushes 17.5x, because its
     liquidity is in SHIB/WETH rather than SHIB/USDC. If the two verdicts
     ever collapse into one, this row is what notices. */
  { ad: "SHIB", ca: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
    bekle: true, donusur: false, simge: "SHIB" },
  { ad: "DEGEN", ca: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
    bekle: true, donusur: false, simge: "DEGEN" },
  {
    ad: "PEPE (Base, bos havuz)",
    ca: "0xB4fDe59a779991bfB6a52253B51947828b982be3",
    bekle: false, simge: "PEPE",
    neden: "havuzu var ama likiditesi sifir — observe() yine fiyat donduruyor"
  },
  {
    ad: "uydurma adres",
    ca: "0x1111111111111111111111111111111111111111",
    bekle: false, simge: null,
    neden: "Base'de gercekten bir havuzu var ve o da bos"
  }
];

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  console.log("TEMINAT SECIMI — ekranin kendi kodu, gercek zincirlere karsi");
  console.log("");

  /* The page's own modules, imported rather than reimplemented. */
  let T, L;
  try {
    T = await import("file:///" + path.join(JS, "teminat.js").replace(/\\/g, "/"));
    L = await import("file:///" + path.join(JS, "teminat-listesi.js").replace(/\\/g, "/"));
  } catch (e) {
    console.log("HATA — sayfa modulleri yuklenemedi: " + e.message);
    process.exit(1);
  }

  /* ---- 1. the generated list --------------------------------------- */
  console.log("1) ONERILEN LISTE");
  console.log("     " + L.ONERILEN.length + " varlik, " +
    Object.keys(L.ZINCIRLER).length + " zincir, olculdu " +
    String(L.TEMINAT_OLCUMU).slice(0, 10));

  ok(L.ONERILEN.length === 50, "liste tam 50 varlik", L.ONERILEN.length + " kayit");

  const kotuKayit = L.ONERILEN.filter((v) =>
    !v.simge || !v.ondalik || v.ondalik < 2 || v.ondalik > 24 ||
    !v.zincirler || Object.keys(v.zincirler).length === 0 ||
    !v.azamiTutar || v.azamiTutar === "0");
  ok(kotuKayit.length === 0,
    "her kayitta simge, ondalik, zincir VE olculmus donusum tutari var",
    kotuKayit.length ? kotuKayit.map((v) => v.simge || "?").join(",") : "50/50");

  /* The whole point of regenerating the list: every recommended asset must
     actually convert at some size. The previous list was built from
     Chainlink feeds and 29 of its 50 could not convert $2,000 at all. */
  const siralama = L.ONERILEN.map((v) => BigInt(v.azamiTutar));
  const siraliMi = siralama.every((t, i) => i === 0 || siralama[i - 1] >= t);
  ok(siraliMi,
    "LISTE KALDIRDIGI BUYUKLUGE GORE SIRALI",
    "ilk " + (Number(siralama[0]) / 1e6).toLocaleString("en") +
      ", son " + (Number(siralama[siralama.length - 1]) / 1e6).toLocaleString("en"));

  console.log("     dagilim: " + L.DAGILIM.map((d) =>
    "$" + (Number(d.tutar) / 1e6).toLocaleString("en") + " -> " + d.adet).join("   "));
  ok(L.DAGILIM.length > 0 && L.DAGILIM[0].adet > 0,
    "dagilim bos degil",
    L.DAGILIM.length + " basamak");

  const kotuAdres = [];
  for (const v of L.ONERILEN) {
    for (const [z, d] of Object.entries(v.zincirler)) {
      if (!T.adresMi(d.token)) kotuAdres.push(v.simge + "@" + z);
      if (!L.ZINCIRLER[z]) kotuAdres.push(v.simge + ": bilinmeyen zincir " + z);
    }
  }
  ok(kotuAdres.length === 0,
    "her zincir kaydinda gecerli adres ve bilinen zincir var",
    kotuAdres.length ? kotuAdres.slice(0, 4).join(", ") : "hepsi gecerli");

  /* An address repeated across two chains has two opposite causes:
     either the generator collapsed two rows, or the token genuinely lives
     at the same address on both. The second is common and legitimate —
     OP-Stack predeploys (WETH at 0x4200..0006) and CREATE2 vanity
     deployments (cbBTC, AUSD) land on identical addresses by construction.

     So this cannot be decided by reading the list. It is decided by asking
     each chain whether a contract is really there and whether it reports
     the same symbol. A collapsed row fails that; a real multi-chain
     deployment passes it. */
  const paylasan = L.ONERILEN.filter((v) => {
    const a = Object.values(v.zincirler).map((d) => d.token.toLowerCase());
    return new Set(a).size !== a.length;
  });
  console.log("     " + paylasan.length + " varlik ayni adresi birden fazla zincirde kullaniyor: " +
    (paylasan.map((v) => v.simge).join(", ") || "yok"));

  for (const v of paylasan) {
    const sayac = {};
    for (const d of Object.values(v.zincirler)) {
      const k = d.token.toLowerCase();
      sayac[k] = (sayac[k] || 0) + 1;
    }
    for (const [adres, n] of Object.entries(sayac)) {
      if (n < 2) continue;
      const zincirler = Object.entries(v.zincirler)
        .filter(([, d]) => d.token.toLowerCase() === adres)
        .map(([z]) => z);

      const kimlikler = [];
      for (const z of zincirler) {
        const k = await T.jetonKimligi(v.zincirler[z].token, [z]);
        kimlikler.push({ z, simge: k.simge, ondalik: k.ondalik });
      }
      console.log("       " + v.simge.padEnd(7) + adres.slice(0, 10) + "..  " +
        kimlikler.map((k) => k.z + "=" + (k.simge || "yok") +
          "/" + (k.ondalik == null ? "?" : k.ondalik)).join("  "));

      const hepsiVar = kimlikler.every((k) => k.simge);
      const hepsiAyni = new Set(kimlikler.map((k) => k.simge + "/" + k.ondalik)).size === 1;
      ok(hepsiVar && hepsiAyni,
        v.simge + ": AYNI ADRES " + zincirler.length + " ZINCIRDE DE GERCEKTEN AYNI JETON",
        hepsiVar
          ? (hepsiAyni ? "hepsi " + kimlikler[0].simge + ", ondalik " + kimlikler[0].ondalik
                       : "SEMBOLLER AYRISIYOR — uretici satiri kopyalamis olabilir")
          : "bir zincirde kontrat yok — uretici satiri kopyalamis");
    }
  }

  /* ---- 2. a sample of the list, verified on chain ------------------- */
  console.log("");
  console.log("2) LISTENIN ORNEKLEMI ZINCIRDE DOGRULANIYOR");
  const ornek = [L.ONERILEN[0], L.ONERILEN[1], L.ONERILEN[Math.floor(L.ONERILEN.length / 2)]];
  for (const v of ornek) {
    const [zincir, d] = Object.entries(v.zincirler)[0];
    const r = await T.zinciriTara(zincir, d.token);
    if (r.hata) { ok(false, v.simge + "@" + zincir + ": RPC", r.hata.slice(0, 50)); continue; }
    console.log("     " + v.simge.padEnd(8) + zincir.padEnd(11) +
      (r.calisiyor ? "calisiyor" : "calismiyor: " + r.sebep) +
      (r.enDerin ? "   kademe " + r.enDerin.kademe +
        "  kardinalite " + r.enDerin.kardinalite : ""));
    ok(r.calisiyor === true,
      v.simge + " listedeki adresiyle " + zincir + " uzerinde calisiyor",
      r.calisiyor ? "likidite " + r.enDerin.likidite.toString() : r.sebep);
  }

  /* ---- 3. the CA path, both directions ----------------------------- */
  console.log("");
  console.log("3) CA YOLU — gecmesi gerekenler VE reddedilmesi gerekenler");
  for (const d of DENEMELER) {
    let r;
    try {
      r = await T.tumZincirleriTara(d.ca);
    } catch (e) {
      ok(false, d.ad + ": tarama dondu", e.message.slice(0, 50));
      continue;
    }

    console.log("");
    console.log("     " + d.ad);
    console.log("       sembol " + (r.kimlik.simge || "okunamadi") +
      "   ondalik " + (r.kimlik.ondalik == null ? "?" : r.kimlik.ondalik));
    console.log("       sonuc  " + (r.calisiyor ? "CALISIYOR" : "CALISMIYOR") + " — " + r.ozet);
    for (const s of r.calisan) {
      console.log("         " + s.ad.padEnd(11) + "kademe " + String(s.enDerin.kademe).padStart(5) +
        "  derinlik " + s.enDerin.likidite.toString().padStart(22) +
        "  gozlem " + s.enDerin.kardinalite);
    }

    ok(r.calisiyor === d.bekle,
      d.ad + ": FIYATI " + (d.bekle ? "OLCULEBILIYOR" : "OLCULEMIYOR"),
      d.bekle
        ? r.calisan.length + " zincirde"
        : (d.neden || "") + (r.calisiyor ? "  — GECTI, ki gecmemeliydi" : ""));

    if (d.bekle) {
      /* Two separate questions, measured separately on purpose. SHIB
         reads a correct price and cannot convert $2,000 — collapsing the
         two would make the page say "works" about a refused conversion. */
      console.log("       donusum " + (r.donusturulebilir
        ? "$" + (Number(T.OLCUM_TUTARI) / 1e6).toLocaleString("en") +
          " icin GECER (" + r.derin.length + " zincir)"
        : "$" + (Number(T.OLCUM_TUTARI) / 1e6).toLocaleString("en") +
          " icin GECMEZ"));
      for (const c of r.calisan) {
        console.log("         " + c.ad.padEnd(11) +
          (c.ittirme == null ? "ittirme olculemedi" : c.ittirme.toFixed(2) + " kat") +
          "   " + c.derinlikNotu);
      }
      ok(d.donusur === undefined || r.donusturulebilir === d.donusur,
        d.ad + ": DONUSUM VERDIKTI OLCUME UYUYOR",
        d.donusur === undefined ? "beklenti belirtilmedi"
          : (d.donusur ? "gecmesi bekleniyordu" : "gecmemesi bekleniyordu") +
            ", sonuc " + (r.donusturulebilir ? "gecti" : "gecmedi"));
    }

    if (d.simge) {
      ok(r.kimlik.simge === d.simge,
        d.ad + ": sembol zincirden okundu",
        (r.kimlik.simge || "okunamadi") + " — yapistirilan adresin ne oldugunu " +
          "soyleyen tek sey bu");
    }

    if (d.bekle) {
      /* The deepest pool must be the deepest, not merely a pool. */
      for (const s of r.calisan) {
        const enBuyuk = s.havuzlar.reduce((a, b) => (b.likidite > a.likidite ? b : a));
        ok(s.enDerin.havuz === enBuyuk.havuz,
          d.ad + "@" + s.zincir + ": SECILEN HAVUZ GERCEKTEN EN DERIN",
          s.havuzSayisi + " havuz tarandi, kademe " + s.enDerin.kademe + " secildi");
        ok(s.enDerin.kardinalite >= T.ASGARI_KARDINALITE,
          d.ad + "@" + s.zincir + ": gozlem gecmisi yeterli",
          "kardinalite " + s.enDerin.kardinalite + " >= " + T.ASGARI_KARDINALITE);
      }
    }
  }

  /* ---- 4. the page and the contract must not drift ---------------- */
  console.log("");
  console.log("4) SAYFA ILE SOZLESME AYNI SEYI MI YAPIYOR");
  const sol = fs.readFileSync(path.join(KOK, "contracts", "HavuzFiyat.sol"), "utf8");
  const sayfa = fs.readFileSync(path.join(JS, "teminat.js"), "utf8");

  /* Same fee tiers, same minimum cardinality. A page that scanned three
     tiers while the contract scanned four would show a depth the chain
     would not agree with. */
  const solKademe = ["100", "500", "3000", "10000"].every((k) =>
    new RegExp("return\\s+" + k + ";").test(sol));
  ok(solKademe, "sozlesme dort kanonik kademeyi tariyor");
  const sayfaKademe = /KADEMELER/.test(sayfa) && L.KADEMELER.join(",") === "100,500,3000,10000";
  ok(sayfaKademe, "sayfa ayni dort kademeyi tariyor", L.KADEMELER.join(", "));

  const solKard = /ASGARI_KARDINALITE\s*=\s*2/.test(sol);
  ok(solKard && T.ASGARI_KARDINALITE === 2,
    "ASGARI KARDINALITE IKI TARAFTA AYNI",
    "sozlesme " + (solKard ? "2" : "?") + " / sayfa " + T.ASGARI_KARDINALITE);

  ok(/liquidity\(\)/.test(sol) && /liquidity/.test(sayfa),
    "iki taraf da likiditeyi okuyor — havuz varligi yeterli sayilmiyor");

  console.log("");
  console.log("  Hicbir adres kullanicidan alinmadi: CA'dan havuz turetildi,");
  console.log("  kademe taranarak bulundu, fiyat o havuzun kendi gecmisinden");
  console.log("  okunuyor. Besleyici adresi diye bir girdi yok.");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
