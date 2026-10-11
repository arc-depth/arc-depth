/* ===========================================================================
 * gorunum/kalkan.js — the whale shield, and what it can and cannot do
 *
 * The honest part matters more than the numbers: mandatory order splitting
 * is impossible on a permissionless pool, so the shield prices size rather
 * than forbidding it. A page that implies otherwise would be selling a
 * protection that does not exist.
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum, bos } from "../ui.js";
import { ikon } from "../ikon.js";
import { EKONOMI, PULSE, canli } from "../adresler.js";
import { ppmYuzde } from "../bicim.js";
import { oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";

/* Measured: eight slices in one transaction, each individually under the
   threshold, and the rate climbed anyway. */
const OLCUM = [
  { dilim: 1, birikmis: 0.303, oran: 1.030 },
  { dilim: 2, birikmis: 0.606, oran: 1.141 },
  { dilim: 3, birikmis: 0.910, oran: 1.459 },
  { dilim: 4, birikmis: 1.213, oran: 1.778 },
  { dilim: 5, birikmis: 1.516, oran: 2.100 },
  { dilim: 6, birikmis: 1.819, oran: 2.423 },
  { dilim: 7, birikmis: 2.122, oran: 2.749 },
  { dilim: 8, birikmis: 2.426, oran: 3.077 }
];

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Whale Shield", "Büyük satışın maliyeti, tabana yazılır"));

  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Eşik", ppmYuzde(EKONOMI.kalkanEsikPpm), "dolaşımın payı, blok başına"),
    olcum("Ek oran tavanı", ppmYuzde(EKONOMI.kalkanTavanPpm), "en fazla"),
    olcum("Nereye", "teminat kasası", "protokole hiç pay yok"),
    olcum("Yön", "yalnızca satış", "alım muaf")
  ]));

  kap.append(panel("Nasıl çalışıyor", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "Satılan token miktarı, dolaşımdaki arzın yüzdesi olarak ölçülüyor ve " +
        "havuz başına, blok başına birikiyor. Eşiğin altında kalkan görünmez; " +
        "üstünde ek oran aşan miktara eşit oluyor ve tavanda duruyor." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Ölçü havuz derinliği değil dolaşımdaki arz. Derinlik, saldırganın " +
        "aynı blokta likidite ekleyerek büyütebileceği bir sayı — ona bağlı " +
        "bir kalkan, yakalaması gereken boyut tarafından kapatılabilirdi." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Alım muaf, çünkü alım fiyatı yükseltir ve havuza para koyar; tabanı " +
        "tehdit etmez. Alımı da vergilendirmek tabanı savunan geri alım " +
        "robotunu tavanda yakalıyor ve parayı tabana değil derinliğe " +
        "yönlendiriyordu." })
    ])
  ]));

  /* ---- the split-trade measurement ---------------------------------- */
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Dilim" }),
    el("th", { yazi: "Birikmiş boyut" }),
    el("th", { yazi: "Ödenen oran" })
  ])]));
  const govde = el("tbody");
  for (const o of OLCUM) {
    govde.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Dilim" }, yazi: String(o.dilim) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Birikmiş boyut" },
        yazi: "%" + o.birikmis.toFixed(3).replace(".", ",") }),
      el("td", { sinif: "sayi", attr: { "data-et": "Ödenen oran" },
        yazi: "%" + o.oran.toFixed(3).replace(".", ",") })
    ]));
  }
  tablo.append(govde);

  kap.append(panel([
    el("span", { html: ikon("kalkan-artis", "yol-oge__ikon") }),
    el("span", { yazi: "Bölme saldırısı denendi" })
  ], [
    el("div", { sinif: "ikincil", attr: { style: "margin-bottom:12px" }, yazi:
      "Tek işlem içinde sekiz satış, her biri tek başına eşiğin altında. " +
      "İşlem başına bir eşik hiçbirini yakalamazdı." }),
    el("div", { sinif: "tablo-sarmal" }, [tablo]),
    el("div", { sinif: "ikincil", attr: { style: "margin-top:12px" }, yazi:
      "Oran %1,03'ten %3,08'e çıktı ve hiç düşmedi. Pencere gerçekten " +
      "birikiyor." })
  ]));

  kap.append(not(
    "Yapamadığımız şey: zorunlu emir bölme imkânsız. Havuz izinsiz — herkes " +
    "herhangi bir sözleşmeden, herhangi sayıda adresten geçebilir ve Uniswap " +
    "v4 kancaya 'bu on takas aynı kişiden' bilgisini vermiyor. Sert bir " +
    "işlem tavanı tavan değil, döngü olur. Kalkan boyutu yasaklamıyor, " +
    "fiyatlandırıyor. Bloklar arası bölme hâlâ işliyor ve bu kasıtlı: " +
    "çıkış serbest, anında çıkış değil.",
    "uyari"
  ));

  /* ---- live window state --------------------------------------------
   *
   * THIS PANEL DISAPPEARED THE DAY THE HOOK WENT LIVE
   *   It had one branch — "the hook is not on chain" — and nothing else.
   *   So once PULSE.hook became a real address the condition went false
   *   and the section rendered NOTHING: a screen that had promised a
   *   live window silently stopped having one, and no audit noticed
   *   because the page still passed every check it had.
   *
   *   A "not deployed yet" placeholder is honest while it is true and
   *   becomes a hole the moment it stops being true.
   *
   * WHAT IS ACTUALLY READABLE
   *   The shield's numbers are constants on the hook, so they can be
   *   read and shown as the deployed contract's own values rather than
   *   copies. The per-pool window needs a pool, and `pencere()` is keyed
   *   by PoolId — so with no launches yet there is genuinely no window
   *   to read, and that is stated instead of being left blank. */
  {
    const govde = el("div", { sinif: "yigin yigin--sik" });

    if (!canli(PULSE.hook)) {
      govde.append(bos(
        "Kanca zincirde değil",
        "Kalkanın o anki pencere durumu kancadan okunuyor. Kanca " +
        "dağıtılmadığı için okunacak bir pencere yok."
      ));
    } else {
      const adlar = ["KALKAN_ESIK_PPM", "KALKAN_TAVAN_PPM",
        "SNIPE_PPM", "SNIPE_SURESI"];
      const ham = await cokluCagri(adlar.map((ad) => ({
        method: "eth_call",
        params: [{ to: PULSE.hook, data: cagriVerisi(ABI.kanca, ad) }, "latest"]
      })));
      /* sonucCoz hands back the whole decode Result; a one-value Result
         is not a number, so Number() on it is NaN. Unwrapped here —
         zincir.js exports no single-value helper and inventing an import
         for one is how a module stops resolving. */
      const v = {};
      adlar.forEach((ad, i) => {
        const c = ham[i] == null ? null : sonucCoz(ABI.kanca, ad, ham[i]);
        v[ad] = c && c.length === 1 ? c[0] : c;
      });

      const okunamayan = adlar.filter((ad) => v[ad] == null);
      if (okunamayan.length) {
        /* Not silently blank, and not a fabricated number either. */
        govde.append(not(
          "Kancanın kalkan sabitleri okunamadı (" + okunamayan.join(", ") +
          "). Ekran burada uydurma bir değer göstermiyor.", "uyari"));
      } else {
        const pct = (x) => (Number(x) / 10_000).toFixed(2) + "%";
        govde.append(el("div", { sinif: "izgara izgara--olcum" }, [
          olcum("Kalkan eşiği", pct(v.KALKAN_ESIK_PPM),
            "bu orandan küçük satışlar kalkana girmiyor"),
          olcum("Kalkan tavanı", pct(v.KALKAN_TAVAN_PPM),
            "en fazla bu kadar kesiliyor"),
          olcum("Snipe oranı", pct(v.SNIPE_PPM),
            "açılış anında, her blokta dörde bölünerek"),
          olcum("Snipe süresi", String(Number(v.SNIPE_SURESI)) + " blok",
            "sonrasında sıfırlanıyor")
        ]));
        govde.append(not(
          "Bu dört sayı sayfada tutulan kopyalar değil — dağıtılmış " +
          "kancadan, " + PULSE.hook + " adresinden okundu.", "bilgi"));
      }

      /* The per-pool window needs a pool. */
      const sayi = await oku(PULSE.launchpad, ABI.launchpad, "launchCount");
      if (sayi == null) {
        govde.append(not(
          "Launch sayısı okunamadı, o yüzden hangi havuzun penceresinin " +
          "okunacağı da bilinmiyor.", "uyari"));
      } else if (Number(sayi) === 0) {
        govde.append(not(
          "Henüz hiç launch yok, yani okunacak bir havuz penceresi de yok. " +
          "Pencere havuz kimliğine göre tutuluyor (pencere(poolId)); havuz " +
          "olmadan boş bir tablo basmak, var olmayan bir durumu varmış " +
          "gibi göstermek olurdu.", "bilgi"));
      } else {
        govde.append(not(
          Number(sayi) + " launch var. Havuz penceresi her havuz için " +
          "ayrı tutuluyor ve ilgili token'ın sayfasından okunuyor.", "bilgi"));
      }
    }

    kap.append(panel("Canlı pencere", govde));
  }

  return kap;
}
