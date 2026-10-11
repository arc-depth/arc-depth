/* ===========================================================================
 * gorunum/guvenlik.js — contract addresses, deployment state, and the
 *                       properties that are actually proven
 *
 * The page a sceptical reader opens first. So it leads with what is NOT
 * deployed, because a security page that buries that is marketing.
 *
 * Everything claimed here is produced by a script in this repository that
 * anybody can run, and each claim says which one. A property asserted
 * without a way to check it does not belong on this page.
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum, adres } from "../ui.js";
import { ikon } from "../ikon.js";
import { PULSE, DIS, ESKI, HEDEFLER, EKONOMI, canli } from "../adresler.js";
import { sonBlok } from "../zincir.js";
import { bloktanSure } from "../bicim.js";

/* Claims, each with the script that establishes it. */
const KANITLAR = [
  {
    baslik: "Kasadan çıkan her transfer msg.sender'a gider",
    yazi: "Teminat kasasında varlık çıkaran tam dört yol var — iade, geri alım ödüncü, " +
          "geri alım ödülü, dönüştürme ödüncü — ve hiçbirinde hedef argümanı yok. " +
          "Rezerv bir köprüye, bir sahibe ya da herhangi bir adrese yönlendirilemez.",
    betik: "scripts/denetim-kasa-cikislari.js"
  },
  {
    baslik: "Sözleşmeler değiştirilemez",
    yazi: "15 sözleşmenin bytecode'u tarandı: DELEGATECALL, SELFDESTRUCT ya da kod " +
          "değiştirecek başka bir opcode yok. Fabrikaların CREATE'i izinli ve hangi " +
          "sözleşmeyi gömdükleri adıyla kayıtlı.",
    betik: "scripts/degismezlik.js"
  },
  {
    baslik: "Eğrinin aritmetiği çatallanmadı",
    yazi: "EgriLaunch, Egri'nin çatalı. Fiyat ve kota fonksiyonlarının dokuzu satır " +
          "satır birebir aynı; farklı olan her satır adlandırılmış bir çatal noktasına " +
          "uymak zorunda, yoksa denetim başarısız oluyor.",
    betik: "scripts/egri-catal-denetimi.js"
  },
  {
    baslik: "Ücret tablosu iki kontratta aynı",
    yazi: "Tablo hem launchpad'de hem kancada yazılı. Betik ikisini karşılaştırıyor ve " +
          "toplamın dilimlere bölündüğünü doğruluyor.",
    betik: "scripts/egri-ucret-denetimi.js"
  },
  {
    baslik: "Ücret gerçek bir satışta yedi adrese doğru dağıldı",
    yazi: "Arc mainnet'te gerçek bir satış yapıldı ve yedi hedefin aldığı pay 1 ppm " +
          "içinde tabloya uydu. Kancanın para tarafı bundan önce her satışta " +
          "taşmayla patlıyordu — bu ölçüm onu buldu.",
    betik: "scripts/olc-geri-alim-canli.js"
  },
  {
    baslik: "Taban gerçek bir çöküşü yakaladı",
    yazi: "Rezerve hiçbir şey eklenmeden, fiyat düşürülerek: geri alım −%94,9'da " +
          "tetiklendi, 2,5 milyon token yakıldı, hak/token yukarı çıktı. Arada satış " +
          "vergisi rezervi kendiliğinden büyüttü.",
    betik: "scripts/olc-geri-alim-canli.js"
  },
  {
    baslik: "Tek blokta rezervin %10'undan fazlası çıkamaz",
    yazi: "Üst üste geri alım denendi. Pencere tavanı diziyi durdurdu ve çıkan toplam " +
          "sınırın altında kaldı. Bu limit ödülü de sayıyor — saymadığı sürece %10 " +
          "sözü %17,07 ile tutmuyordu.",
    betik: "scripts/olc-geri-alim-canli.js"
  },
  {
    baslik: "Mezuniyette hiçbir para ulaşılamaz hale gelmiyor",
    yazi: "Eğri dolunca parası aynı havuzu derinleştiriyor; tokenlerin eşleştiremediği " +
          "fazla teminat kasasına gidiyor. Muhasebe kuruşa kadar kapanıyor. Düzeltmeden " +
          "önce 698.671 USDC açıcıda sonsuza kadar sıkışıyordu.",
    betik: "scripts/olc-mezuniyet.js"
  },
  {
    baslik: "Chainlink besleyicileri sözleşmeden okunabiliyor",
    yazi: "Arc'taki 34 besleyicinin proxy'si bir sözleşme içinden okundu, 34/34 cevap " +
          "verdi. Log taramasıyla bulunan aggregator adresleri bunu sağlamıyordu: " +
          "biri cüzdandan okunup sözleşmeden 'No access' ile reddediyordu.",
    betik: "scripts/olc-besleyiciler.js"
  }
];

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  const blok = await sonBlok();

  kap.append(sayfaUst("Güvenlik ve doğrulama",
    blok ? "Arc blok " + blok.toLocaleString("tr-TR") : "Arc"));

  /* ---- deployment state, first ------------------------------------- */
  const dagitildi = Object.entries(PULSE).filter(([, v]) => canli(v));
  const bekleyen = Object.entries(PULSE).filter(([, v]) => !canli(v));

  kap.append(not(
    bekleyen.length
      ? "Bu modelin sözleşmeleri HENÜZ DAĞITILMADI. " + bekleyen.length +
        " sözleşme zincirde değil, dolayısıyla arayüzde işlem gönderen hiçbir " +
        "düğme aktif değil. Aşağıdaki kanıtların hepsi gerçek Arc mainnet'e " +
        "karşı eth_call ile ölçüldü — dağıtım ayrı bir adım."
      : "Bu modelin sözleşmeleri dağıtıldı.",
    bekleyen.length ? "uyari" : "bilgi"
  ));

  const izgara = el("div", { sinif: "izgara izgara--olcum" });
  izgara.append(olcum("Dağıtılan", String(dagitildi.length), "bu modelden"));
  izgara.append(olcum("Bekleyen", String(bekleyen.length), "dağıtım gerekiyor"));
  izgara.append(olcum("Çağrı tavanı", EKONOMI.islemTavaniBps / 100 + "%", "tek geri alımda harcanabilir"));
  izgara.append(olcum("Pencere tavanı", EKONOMI.donemTavaniBps / 100 + "%",
    bloktanSure(EKONOMI.donemBlok) + " içinde çıkabilen"));
  kap.append(izgara);

  /* ---- addresses ---------------------------------------------------- */
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Sözleşme" }), el("th", { yazi: "Adres" }), el("th", { yazi: "Durum" })
  ])]));
  const govde = el("tbody");

  const ekle = (ad, deger, kaynak) => {
    govde.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Sözleşme" } }, [
        el("strong", { yazi: ad }),
        kaynak ? el("div", { sinif: "ucuncul", yazi: kaynak }) : null
      ]),
      el("td", { attr: { "data-et": "Adres" } },
        [canli(deger) ? adres(deger) : el("span", { sinif: "ucuncul", yazi: "—" })]),
      el("td", { attr: { "data-et": "Durum" } }, [
        canli(deger)
          ? el("span", { sinif: "etiket etiket--alis", yazi: "zincirde" })
          : el("span", { sinif: "etiket etiket--uyari", yazi: "dağıtılmadı" })
      ])
    ]));
  };

  for (const [ad, v] of Object.entries(PULSE)) ekle(ad, v, "bu model");
  ekle("isletme (ücret hedefi)", HEDEFLER.isletme, "düz adres");
  ekle("PoolManager", DIS.poolManager, "Uniswap v4, bizim değil");
  ekle("USDC", DIS.usdc, "Arc yerel — hem teminat hem gas");
  for (const [ad, v] of Object.entries(ESKI)) ekle(ad, v, "önceki nesil");

  tablo.append(govde);
  kap.append(panel([
    el("span", { html: ikon("kilit", "yol-oge__ikon") }),
    el("span", { yazi: "Adresler" })
  ], el("div", { sinif: "tablo-sarmal" }, [tablo]), null, false));

  /* ---- proofs ------------------------------------------------------- */
  const kanitlar = el("div", { sinif: "yigin yigin--sik" });
  for (const k of KANITLAR) {
    kanitlar.append(el("div", { sinif: "jeton-kart" }, [
      el("div", { sinif: "satir satir--arasi" }, [
        el("strong", { yazi: k.baslik }),
        el("span", { sinif: "etiket etiket--alis", yazi: "ölçüldü" })
      ]),
      el("div", { sinif: "ikincil", yazi: k.yazi }),
      el("code", { sinif: "mono ucuncul", yazi: "node " + k.betik })
    ]));
  }
  kap.append(panel("Neyin doğru olduğu ve nasıl kontrol edileceği", kanitlar));

  kap.append(not(
    "Bu sayfadaki her iddianın karşısında onu kuran betik yazıyor. Kontrol " +
    "edilemeyen bir iddia bu sayfaya girmiyor.",
    "bilgi"
  ));

  return kap;
}
