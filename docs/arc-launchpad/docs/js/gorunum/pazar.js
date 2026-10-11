/* ===========================================================================
 * gorunum/pazar.js — geliştirici pazarı: listeleme, satın alma, gelir panosu
 *
 * Geliştiriciler ürün yayınlar, müşteriler USDC ile satın alır, hasılat %80
 * geliştiriciye / %20 platforma gider ve lisans zincirde durur.
 *
 * DAĞITILDI VE BU EKRAN ARTIK ONU OKUYOR
 *   Pazar sözleşmesi Arc ana ağında. Ücret oranı, gelir defteri ve ürün
 *   listesi doğrudan o sözleşmeden okunuyor; sayfada tutulan kopya yok.
 *
 * SIFIRLAR SAHTE DEĞİL, GERÇEK
 *   Bugün hiç ürün yok, hiç satış yok ve defter sıfır. Ekran bunları
 *   olduğu gibi gösteriyor — örnek ürün, örnek hasılat ya da "yakında"
 *   diye bir katalog basmıyor. Boş bir pazarı dolu göstermek, bu projenin
 *   tekrar tekrar kaçındığı tek şey.
 *
 * TUTULAN = 0 BİR SÜS DEĞİL, DENETLENEBİLİR BİR İDDİA
 *   Sözleşme hiç para tutmuyor: ödeme ve bölüşme aynı işlemde oluyor. Bu
 *   yüzden `withdraw`/`sweep`/`rescue` diye bir fonksiyon yok ve
 *   olmadığı için kimse kullanamaz. Panoda `tutulan()` gösteriliyor ki bu
 *   iddia söz olarak kalmasın — herkes her an bakabilsin.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, hata } from "../ui.js";
import { oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";
import { PAZAR, PAZAR_KURAL, EKONOMI, canli } from "../adresler.js";
import { para, ppmYuzde, tamSayidanSayi, gecenSure } from "../bicim.js";

const SIFIR_ADRES = "0x0000000000000000000000000000000000000000";

/* sonucCoz hands back the whole decode Result; a one-value Result is not a
   number, so Number() on it is NaN. */
function tek(tablo, ad, r) {
  if (r == null) return null;
  const c = sonucCoz(tablo, ad, r);
  return c && c.length === 1 ? c[0] : c;
}

export async function ciz({ kayit, cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  const hesap = cuzdan ? cuzdan.hesap() : null;

  kap.append(sayfaUst(
    "Geliştirici Pazarı",
    "Dış geliştiricilerin ürünleri; ödeme USDC, hasılatın %" +
    (PAZAR_KURAL.gelistiriciPpm / 10_000) + "'i geliştiriciye"
  ));

  if (!canli(PAZAR.pazar)) {
    kap.append(hata(
      "Pazar adresi tanımlı değil",
      "Bu ekran dağıtılmış bir Pazar sözleşmesi olmadan hiçbir şey " +
      "göstermiyor. Uydurma bir katalog basmak yerine burada duruyor."
    ));
    return kap;
  }

  /* ---- 1. the split, read from the contract ----------------------- */
  const adlar = ["PLATFORM_PPM", "urunSayisi", "platformKazanci",
    "toplamHasilat", "tutulan"];
  const ham = await cokluCagri(adlar.map((ad) => ({
    method: "eth_call",
    params: [{ to: PAZAR.pazar, data: cagriVerisi(ABI.pazar, ad) }, "latest"]
  })));
  const v = {};
  adlar.forEach((ad, i) => { v[ad] = tek(ABI.pazar, ad, ham[i]); });

  if (v.urunSayisi == null) {
    kap.append(hata(
      "Pazar okunamadı",
      "Sözleşme " + PAZAR.pazar + " adresinde ama `urunSayisi()` cevap " +
      "vermedi. Ekran uydurma bir durum göstermiyor."
    ));
    return kap;
  }

  const zincirPpm = v.PLATFORM_PPM == null ? null : Number(v.PLATFORM_PPM);
  kap.append(panel("Nasıl çalışıyor", el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Geliştirici payı",
        zincirPpm == null ? "okunamadı" : ppmYuzde(1_000_000 - zincirPpm),
        "her satıştan, aynı işlemde"),
      olcum("Platform payı",
        zincirPpm == null ? "okunamadı" : ppmYuzde(zincirPpm), "ARC PULSE"),
      olcum("Ödeme birimi", "USDC", "Arc üzerinde"),
      olcum("Lisans", "zincirde", "herkes doğrulayabilir")
    ]),
    /* The page's own copy of the rate is compared against the contract's,
       here and in the audit. Two numbers that should agree are worth
       showing disagreeing. */
    zincirPpm != null && zincirPpm !== PAZAR_KURAL.platformPpm
      ? not("Sayfadaki oran (" + ppmYuzde(PAZAR_KURAL.platformPpm) +
            ") ile sözleşmedeki oran (" + ppmYuzde(zincirPpm) +
            ") AYNI DEĞİL. Sözleşmedeki geçerlidir.", "uyari")
      : not(
        "Bu oran sayfada tutulan bir kopya değil — " + PAZAR.pazar +
        " adresinden okundu. Sözleşmede sabit, yani bir setter'ı yok ve " +
        "değiştirilemez.", "bilgi"),
    not(
      "Ödeme ve bölüşme aynı işlemde oluyor: sözleşme arada para " +
      "TUTMUYOR. Çekilecek bir bakiye olmadığı için withdraw, sweep ya " +
      "da rescue gibi bir fonksiyon yok — ve olmadığı için kimse " +
      "kullanamaz. Tam bölünmeyen kuruş da platforma değil " +
      "GELİŞTİRİCİYE kalıyor.", "bilgi")
  ])));

  /* ---- 2. the revenue book, including the zero that matters ------- */
  kap.append(panel("Gelir panosu", el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Toplam hasılat",
        v.toplamHasilat == null ? "okunamadı"
          : para(tamSayidanSayi(v.toplamHasilat, 6)), "bugüne kadar"),
      olcum("Platform payı (ARC PULSE)",
        v.platformKazanci == null ? "okunamadı"
          : para(tamSayidanSayi(v.platformKazanci, 6)), "%" +
          (zincirPpm == null ? "?" : zincirPpm / 10_000) + " dilimin toplamı"),
      olcum("Geliştiricilere giden",
        v.toplamHasilat == null || v.platformKazanci == null ? "okunamadı"
          : para(tamSayidanSayi(v.toplamHasilat, 6) -
                 tamSayidanSayi(v.platformKazanci, 6)),
        "hasılat eksi platform payı"),
      olcum("Sözleşmede tutulan",
        v.tutulan == null ? "okunamadı" : para(tamSayidanSayi(v.tutulan, 6)),
        "tasarım gereği her zaman sıfır")
    ]),
    v.tutulan != null && BigInt(v.tutulan) !== 0n
      ? not("SÖZLEŞMEDE PARA DURUYOR. Bu olmamalı: ödeme ve bölüşme aynı " +
            "işlemde yapılıyor ve çekme fonksiyonu yok. Bir token " +
            "yanlışlıkla buraya gönderilmiş olabilir.", "uyari")
      : not("Sözleşmenin bakiyesi sıfır — 'hiç para tutmuyor' bir söz " +
            "değil, her an bakılabilen bir sayı.", "bilgi"),
    v.toplamHasilat != null && BigInt(v.toplamHasilat) === 0n
      ? not("Henüz hiç satış olmadı. Sıfırlar gerçek: pazar yeni " +
            "dağıtıldı ve kimse ürün yayınlamadı.", "bilgi")
      : null
  ].filter(Boolean))));

  /* ---- 3. the listing -------------------------------------------- */
  const sayi = Number(v.urunSayisi);
  if (sayi === 0) {
    kap.append(panel("Ürünler", bos(
      "Henüz hiç ürün yok",
      "Sözleşme dağıtıldı ve cevap veriyor; kimse henüz ürün yayınlamadı. " +
      "Yayınlamak Geliştirici Portalı'ndan, izin almadan yapılıyor.",
      el("a", {
        sinif: "dugme dugme--marka", yazi: "Geliştirici Portalı",
        attr: { href: "#/gelistirici" }
      })
    )));
    return kap;
  }

  /* Newest first, capped: a listing that grows without bound turns one
     screen into hundreds of calls. */
  const idler = [];
  for (let i = sayi - 1; i >= Math.max(0, sayi - 20); i--) idler.push(i);

  const adim = hesap ? 3 : 2;
  const istekler = idler.flatMap((id) => {
    const temel = [
      { method: "eth_call", params: [{ to: PAZAR.pazar,
        data: cagriVerisi(ABI.pazar, "urunler", [id]) }, "latest"] },
      { method: "eth_call", params: [{ to: PAZAR.pazar,
        data: cagriVerisi(ABI.pazar, "ortalamaPuan", [id]) }, "latest"] }
    ];
    if (hesap) {
      temel.push({ method: "eth_call", params: [{ to: PAZAR.pazar,
        data: cagriVerisi(ABI.pazar, "lisans", [id, hesap]) }, "latest"] });
    }
    return temel;
  });
  const satirlar = await cokluCagri(istekler);

  const liste = el("div", { sinif: "yigin" });
  idler.forEach((id, k) => {
    const u = satirlar[k * adim] == null
      ? null : sonucCoz(ABI.pazar, "urunler", satirlar[k * adim]);
    const puan = satirlar[k * adim + 1] == null
      ? null : sonucCoz(ABI.pazar, "ortalamaPuan", satirlar[k * adim + 1]);
    const lis = hesap && satirlar[k * adim + 2] != null
      ? sonucCoz(ABI.pazar, "lisans", satirlar[k * adim + 2]) : null;

    if (!u) {
      liste.append(panel("Ürün #" + id, not(
        "Bu ürün okunamadı. Uydurma bir içerik göstermek yerine boş " +
        "bırakıldı.", "uyari")));
      return;
    }

    const gelistirici = u[0];
    const fiyat = tamSayidanSayi(u[1], 6);
    const periyot = Number(u[2]);
    const acik = u[3];
    const uri = u[4] || "";
    const satis = Number(u[5]);
    const hasilat = tamSayidanSayi(u[6], 6);

    const govde = el("div", { sinif: "yigin yigin--sik" });
    govde.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Fiyat", fiyat === 0 ? "ücretsiz" : para(fiyat),
        periyot === 0 ? "bir defalık, süresiz lisans"
          : "her " + gecenSure(periyot * 1000) + " için"),
      olcum("Satış", String(satis), "bugüne kadar"),
      olcum("Hasılat", para(hasilat), "brüt"),
      olcum("Puan",
        puan && Number(puan[1]) > 0
          ? (Number(puan[0]) / 100).toFixed(2) + " / 5"
          : "puan yok",
        puan ? Number(puan[1]) + " oy" : null)
    ]));

    /* The URI is shown as text, never as a clickable link: this string is
       written by anyone who registers, and turning a stranger's string
       into a link the page invites you to click is how a marketplace
       becomes a phishing surface. */
    govde.append(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" }, [
      el("span", { yazi: "Bilgi: " }),
      el("code", { yazi: uri.slice(0, 160) || "(boş)" })
    ]));
    govde.append(not(
      "Bu bağlantı geliştiricinin yazdığı metindir, sayfa onu tıklanır " +
      "yapmıyor ve doğrulamıyor. Açmadan önce kendin kontrol et.", "uyari"));

    if (!acik) {
      govde.append(not("Bu ürün satışa kapalı. Daha önce alınmış " +
        "lisanslar geçerliliğini koruyor — kapatmak satılmış lisansı " +
        "iptal etmiyor.", "bilgi"));
    }

    if (lis && lis[0] === true) {
      govde.append(not(
        lis[2] === true
          ? "Bu üründe süresiz lisansın var."
          : "Lisansın var, bitiş " + new Date(Number(lis[1]) * 1000)
              .toLocaleString("tr-TR") + ".",
        "bilgi"));
    }

    const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });

    if (acik && hesap) {
      const dugme = el("button", {
        sinif: "dugme dugme--marka",
        yazi: fiyat === 0 ? "ÜCRETSİZ AL" : "SATIN AL — " + para(fiyat),
        attr: { type: "button" }
      });
      dugme.addEventListener("click", async () => {
        try {
          const miktar = BigInt(u[1]);
          if (miktar > 0n) {
            durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
            durumSatiri.textContent = "USDC izni isteniyor…";
            /* Exactly this purchase, not an unlimited allowance: a
               standing allowance on a contract that moves money is a
               liability for no benefit. */
            await cuzdan.gonder({
              to: EKONOMI.quote,
              data: cagriVerisi(ABI.erc20Yaz, "approve", [PAZAR.pazar, miktar])
            });
          }
          durumSatiri.textContent = "Satın alma gönderiliyor…";
          const h = await cuzdan.gonder({
            to: PAZAR.pazar,
            data: cagriVerisi(ABI.pazarYaz, "satinAl", [id])
          });
          durumSatiri.className = "yazi yazi--kucuk";
          /* The hash and nothing else: whether it landed is the chain's
             to say, and it says so on the next read. */
          durumSatiri.textContent = "Gönderildi: " + h;
        } catch (e) {
          durumSatiri.className = "yazi yazi--kucuk yazi--hata";
          durumSatiri.textContent = (e && e.message) || "İşlem gönderilemedi.";
        }
      });
      govde.append(dugme);
    } else if (acik && !hesap) {
      govde.append(not("Satın almak için cüzdanı bağla. Sayfa kendi " +
        "başına hiçbir şey göndermiyor.", "bilgi"));
    }
    govde.append(durumSatiri);

    govde.append(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: "Geliştirici: " + gelistirici }));

    liste.append(panel("Ürün #" + id, govde));
  });

  kap.append(panel("Ürünler", liste));
  if (sayi > 20) {
    kap.append(not("En yeni 20 ürün gösteriliyor (toplam " + sayi + "). " +
      "Tamamını listelemek yüzlerce çağrı demek olurdu.", "bilgi"));
  }
  return kap;
}
