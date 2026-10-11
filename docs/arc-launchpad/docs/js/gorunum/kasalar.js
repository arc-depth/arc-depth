/* ===========================================================================
 * gorunum/kasalar.js — the collateral vaults
 *
 * One row per launch: reserve, claim per token, and the price at which the
 * floor engages. That last number is the point of the whole product and it
 * needs no history — reserve ÷ circulating IS the level below which a
 * buyback becomes possible, readable in two calls.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres } from "../ui.js";
import { ikon } from "../ikon.js";
import { launchListesi, jetonBilgileri, oku, ABI } from "../zincir.js";
import { TEMINAT_EVRENI, EKONOMI, DIS } from "../adresler.js";
import { para, jetonMiktar, tamSayidanSayi, bloktanSure } from "../bicim.js";

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Teminat kasaları", "Her tokenin rezervi ve tabanın devreye girdiği fiyat"));

  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Çağrı tavanı", EKONOMI.islemTavaniBps / 100 + "%", "tek geri alımda harcanabilir"),
    olcum("Pencere tavanı", EKONOMI.donemTavaniBps / 100 + "%", "harcama + ödül"),
    olcum("Pencere", bloktanSure(EKONOMI.donemBlok), EKONOMI.donemBlok + " blok"),
    olcum("Çağıranın payı", EKONOMI.odulPayiBps / 100 + "%", "yakalanan iskontodan")
  ]));

  kap.append(not(
    "Geri alım yalnızca piyasa fiyatı hakkın altındayken mümkün. Üstünde " +
    "sözleşme kendiliğinden reddeder — tetik ayrı bir dedektör değil, " +
    "değişmezin kendisi.",
    "bilgi"
  ));

  const { dagitildiMi, liste } = await launchListesi();

  if (!dagitildiMi) {
    kap.append(panel("Kasalar", bos(
      "Henüz kasa yok",
      "Her launch kendi teminat kasasını oluşturur. Launchpad dağıtılmadığı " +
      "için okunacak kasa da yok."
    )));
    return kap;
  }
  if (!liste.length) {
    kap.append(panel("Kasalar", bos("Kasa yok", "Henüz hiç token çıkarılmamış.")));
    return kap;
  }

  const bilgiler = await jetonBilgileri(liste.map((l) => l.token));
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Token" }),
    el("th", { yazi: "Rezerv" }),
    el("th", { yazi: "Dolaşım" }),
    el("th", { yazi: "Hak / token" }),
    el("th", { yazi: "Taban fiyatı" }),
    el("th", { yazi: "Kasa" })
  ])]));
  const govde = el("tbody");

  for (let i = 0; i < liste.length; i++) {
    const l = liste[i], b = bilgiler[i] || {};
    const [bakiye, hak, dolasim] = await Promise.all([
      oku(l.kasa, ABI.kasa, "bakiye", [DIS.usdc]),
      oku(l.kasa, ABI.kasa, "hak", [DIS.usdc]),
      oku(l.kasa, ABI.kasa, "dolasim")
    ]);

    const rez = bakiye == null ? null : tamSayidanSayi(bakiye, 6);
    const dol = dolasim == null ? null : tamSayidanSayi(dolasim, 18);
    /* reserve / circulating — the level the floor engages at. */
    const taban = rez != null && dol ? rez / dol : null;

    govde.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Token" } }, [
        el("a", { sinif: "jeton", attr: { href: "#/terminal?t=" + l.token } }, [
          el("div", { sinif: "jeton__logo jeton__logo--bos",
            yazi: (b.sembol || "?").slice(0, 3).toUpperCase() }),
          el("div", { sinif: "jeton__yazi" }, [
            el("div", { sinif: "jeton__sembol", yazi: b.sembol || "?" }),
            el("div", { sinif: "jeton__ad", yazi: b.ad || "" })
          ])
        ])
      ]),
      el("td", { sinif: "sayi", attr: { "data-et": "Rezerv" },
        yazi: rez == null ? "—" : para(rez) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Dolaşım" },
        yazi: dol == null ? "—" : jetonMiktar(dol) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Hak / token" },
        yazi: hak == null ? "—" : para(Number(hak) / 1e36) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Taban fiyatı" },
        yazi: taban == null ? "—" : para(taban) }),
      el("td", { attr: { "data-et": "Kasa" } }, [adres(l.kasa)])
    ]));
  }
  tablo.append(govde);

  kap.append(panel([
    el("span", { html: ikon("kalkan", "yol-oge__ikon") }),
    el("span", { yazi: "Kasalar" })
  ], el("div", { sinif: "tablo-sarmal" }, [tablo])));

  kap.append(not(
    "Rezerv yalnızca USDC üzerinden gösteriliyor. Sepette başka varlık " +
    "varsa onların değeri burada toplanmıyor — toplamak için her varlığın " +
    "besleyicisini okumak gerekir ve o sayfa henüz yok. Eksik bir toplam " +
    "göstermek yerine okunan tek kalemi gösteriyoruz.",
    "uyari"
  ));

  return kap;
}
