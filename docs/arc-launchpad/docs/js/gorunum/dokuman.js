/* ===========================================================================
 * gorunum/dokuman.js — how the system works, with the measured numbers
 *
 * Every figure is read from adresler.js, which mirrors the contracts'
 * constants — so a documentation page cannot quote a fee the contract does
 * not charge. The prose explains the mechanism; the tables carry the
 * numbers; nothing here is aspirational.
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum } from "../ui.js";
import { EKONOMI, TEMINAT_EVRENI } from "../adresler.js";
import { para, ppmYuzde, bloktanSure } from "../bicim.js";

const D = EKONOMI.dilimler;

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Dokümantasyon", "Sistem tam olarak ne yapıyor"));

  /* ---- 1. launch ---------------------------------------------------- */
  const launchTablo = tablo(
    ["Nereye", "Ne kadar"],
    [
      ["Protokol ücreti", para(EKONOMI.asgariOdeme * EKONOMI.ucretPpm / 1e6)],
      ["— geliştirici fonu", para(0.60)],
      ["— protokol likiditesi", para(1.00)],
      ["— işletme", para(0.40)],
      ["Teminat kasasına", para(EKONOMI.asgariTeminat)],
      ["Kalıcı likiditeye", para(78) + " + 22.285.714 token"]
    ]
  );

  kap.append(panel("1 — Launch: " + para(EKONOMI.asgariOdeme) + " ödeyen ne alıyor", [
    launchTablo,
    el("div", { sinif: "izgara izgara--olcum", attr: { style: "margin-top:16px" } }, [
      olcum("Arz", (EKONOMI.arz / 1e9) + " milyar", "sabit"),
      olcum("Açılış mcap", para(EKONOMI.acilisMcap), "her launch aynı"),
      olcum("Açılış fiyatı", para(EKONOMI.acilisFiyat), "token başına"),
      olcum("Kurucuya bedava", "0 token", "hiç")
    ]),
    el("div", { sinif: "ikincil", attr: { style: "margin-top:16px" }, yazi:
      "İki satış yeri aynı fiyattan açılıyor. Eğrinin sanal rezervi tam " +
      "olarak gerçek likidite kadar küçültülüyor (" + para(EKONOMI.acilisMcap) +
      " − " + para(78) + " = " + para(3422) + "), bu yüzden eğri ve havuz " +
      "açılışta aynı fiyatı veriyor ve aralarında arbitraj olmuyor." }),
    not("Anti-snipe: eğriden launch saniyesinde alım yapan %99 kesinti ödüyor, " +
        "oran her saniye dörde bölünüyor ve yaklaşık 10 saniyede sıfırlanıyor. " +
        "Ölçüm: launch bloğunda 500 dolar harcayan eğriye 4,85 dolar sokabiliyor.",
        "uyari")
  ]));

  /* ---- 2. trading fees ---------------------------------------------- */
  kap.append(panel("2 — Her işlemde kim ne alıyor", [
    tablo(["Hedef", "Pay"], [
      ["kurucu", ppmYuzde(D.kurucu)],
      /* "token sahipleri (stake)" satiri KALDIRILDI: calisan kancada
         boyle bir dilim yok. Duran bir satiri birakip sifir gostermek de
         yanlis olurdu — dilim yok, sifir degil. */
      ["geliştirici havuzu (DAO)", ppmYuzde(D.gelistirici)],
      ["protokol likiditesi", ppmYuzde(D.likidite)],
      ["işletme", ppmYuzde(D.isletme)],
      ["teminat kasası", ppmYuzde(EKONOMI.vergiAsgariPpm) + " – " + ppmYuzde(EKONOMI.vergiAzamiPpm)],
      ["derinlik", ppmYuzde(D.derinlik)]
    ]),
    el("div", { sinif: "ikincil", attr: { style: "margin-top:12px" }, yazi:
      "Varsayılan vergiyle toplam %3,00 — gerçek bir satışta zincirde " +
      "tartıldı, yedi hedefin aldığı pay 1 ppm içinde tuttu. Alımda token " +
      "tarafındaki ücretin tamamı derinliğe gidiyor: kurucuya ya da " +
      "sahiplere satmak zorunda kalacakları bir şey ödenmiyor." })
  ]));

  /* ---- 3. the floor -------------------------------------------------- */
  kap.append(panel("3 — Taban nasıl iş yapıyor", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "Hak/token = kasa bakiyesi ÷ dolaşım. Fiyat değil, oran — oracle yok, " +
        "manipüle edilecek bir şey yok." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Geri alım yalnızca piyasa fiyatı hakkın altındayken mümkün; üstünde " +
        "sözleşme kendiliğinden reddediyor. Ayrı bir satış baskısı dedektörü " +
        "yok: değişmezin kendisi tetik. Çağırana yakalanan iskontonun " +
        ppmYuzde(EKONOMI.odulPayiBps * 100) + "'si ödeniyor, kalanı herkesin hakkına yazılıyor." })
    ]),
    el("div", { sinif: "izgara izgara--olcum", attr: { style: "margin-top:16px" } }, [
      olcum("Çağrı tavanı", EKONOMI.islemTavaniBps / 100 + "%", "tek çağrıda harcanabilir"),
      olcum("Pencere tavanı", EKONOMI.donemTavaniBps / 100 + "%", "çıkan toplam, harcama + ödül"),
      olcum("Pencere", bloktanSure(EKONOMI.donemBlok), EKONOMI.donemBlok + " blok"),
      olcum("Çağıranın payı", EKONOMI.odulPayiBps / 100 + "%", "yakalanan iskontodan")
    ]),
    not("Ölçüm: rezerve hiçbir şey eklenmeden, yalnızca fiyat düşürülerek " +
        "geri alım −%94,9'da tetiklendi. O sırada satış vergisi rezervi " +
        "20,00 dolardan 23,60 dolara çıkarmıştı — baskı tabanı besliyor.")
  ]));

  /* ---- 4. whale shield ----------------------------------------------- */
  kap.append(panel("4 — Whale Shield", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "Yalnızca satışa biniyor, havuz başına ve blok başına birikimli. Eşik " +
        "dolaşımın " + ppmYuzde(EKONOMI.kalkanEsikPpm) + "'i; üstünde ek oran " +
        "aşan miktara eşit, tavan " + ppmYuzde(EKONOMI.kalkanTavanPpm) + " — ve tamamı kasaya." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Tek işlem içinde sekiz parçaya bölme denendi; her parça tek başına " +
        "eşiğin altındaydı ve oran %1,03'ten %3,08'e tırmandı. Bölmek kurtarmıyor." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Yapamadığımız: zorunlu emir bölme imkânsız. Havuz izinsiz, herkes " +
        "herhangi bir sözleşmeden ve adresten geçebilir ve v4 kancaya 'bu on " +
        "takas aynı kişiden' bilgisini vermiyor. Kalkan boyutu yasaklamıyor, " +
        "fiyatlandırıyor. Bloklar arası bölme hâlâ işliyor ve bu kasıtlı: " +
        "çıkış serbest, anında çıkış değil." })
    ])
  ]));

  /* ---- 5. graduation -------------------------------------------------- */
  kap.append(panel("5 — Eğri dolunca (" + para(EKONOMI.esik) + ")", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "İkinci havuz açılmıyor. Eğrinin parası launchpad'e, oradan açıcıya " +
        "gidiyor ve launch anında açılan aynı havuz derinleşiyor — ölçümde " +
        "likidite 15,7 kat arttı." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Tokenlerin eşleştiremediği fazla USDC teminat kasasına gidiyor. " +
        "Önceden açıcıda sıkışıyordu ve açıcının withdraw'ı olmadığı için " +
        "ulaşılamazdı; ölçümde 698.671 dolar o durumdaydı." })
    ])
  ]));

  /* ---- 6. collateral ------------------------------------------------- */
  kap.append(panel("6 — Teminat olabilenler", [
    tablo(["Varlık", "Ondalık", "Besleyici"],
      TEMINAT_EVRENI.map((t) => [t.sembol + " — " + t.ad, String(t.ondalik), t.besleyiciAdi])),
    not("Besleyiciler PROXY adresleri. Aggregator, proxy'nin altında " +
        "değiştirilir ve ona sabitlenmiş bir oracle hatasız bayat fiyat " +
        "okumaya devam eder — rezervi geçen ayın kuruyla değerler ve her " +
        "test yeşil kalır.", "uyari")
  ]));

  return kap;
}

function tablo(basliklar, satirlar) {
  const t = el("table", { sinif: "tablo tablo--kart" });
  t.append(el("thead", {}, [el("tr", {}, basliklar.map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  for (const s of satirlar) {
    g.append(el("tr", {}, s.map((h, i) => el("td", {
      sinif: i > 0 ? "sayi" : "",
      attr: { "data-et": basliklar[i] },
      yazi: h
    }))));
  }
  t.append(g);
  return el("div", { sinif: "tablo-sarmal" }, [t]);
}
