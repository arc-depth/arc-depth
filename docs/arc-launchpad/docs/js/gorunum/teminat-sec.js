/* ===========================================================================
 * gorunum/teminat-sec.js — teminat seçimi: önerilen 50 ya da kendi CA'n
 *
 * NE GÖSTERİR
 *   Launch yapanın teminat olarak ne seçebileceğini. İki yol var ve ikisi
 *   de eşit:
 *
 *     1. Önerilen 50'den seç     — kısayol
 *     2. Kontrat adresi yapıştır — başka her şey
 *
 *   Liste bir kapı değil. Listede olmamak yasak olmak değil; CA alanı
 *   listedekiyle BİREBİR aynı kontrolü yapıyor.
 *
 * HER SAYI ÖLÇÜLDÜ
 *   Önerilen 50 `teminat-adaylari.json`'dan üretildi, o da zincirden
 *   okunarak. CA kontrolü ise canlı: adres yapıştırıldığı anda yedi zincirde
 *   en derin USDC havuzu aranıyor, likiditesine ve gözlem geçmişine
 *   bakılıyor. Hiçbir servise sorulmuyor, hiçbir şey önbellekten
 *   gösterilmiyor.
 *
 * SAYFA İLE ZİNCİR AYRIŞAMAZ
 *   Buradaki türetme `contracts/HavuzFiyat.sol`'ün zincir üstünde yaptığının
 *   aynısı: kademeleri tara, en likit havuzu bul, fiyatı o havuzun
 *   geçmişinden oku. Ayrışsa, sayfa "çalışıyor" derdi, launch gönderilirdi,
 *   sözleşme reddederdi ve gaz giderdi.
 *
 * "ÇALIŞMIYOR" İKİ FARKLI ŞEY
 *   Likiditesi olmayan bir havuzu bu sistem dolduramaz — o bir hayır.
 *   Gözlem geçmişi açılmamış bir havuzu ise HERKES açabilir, bir kerelik
 *   gaz. İkisini aynı kefeye koymak, düzeltilebilir bir durumu kalıcı bir
 *   ret gibi göstermek olurdu.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres, hata } from "../ui.js";
import { ONERILEN, ZINCIRLER, TEMINAT_OLCUMU, DAGILIM} from "../teminat-listesi.js";
import { tumZincirleriTara, adresMi, ASGARI_KARDINALITE } from "../teminat.js";

/* Liquidity is a Q128 number with no unit anybody reads; what matters is
   relative depth between tiers of the same asset. Shown in short form so a
   column of them can be compared at a glance. */
/* The measured size, written the way a person reads money. */
export function tutarYaz(t) {
  if (!t || t === "0") return "ölçülemedi";
  const n = Number(t) / 1e6;
  return "$" + n.toLocaleString("tr", { maximumFractionDigits: 0 });
}

function derinlik(L) {
  const n = Number(L);
  if (!isFinite(n) || n === 0) return "0";
  const birim = [["e21", 1e21], ["e18", 1e18], ["e15", 1e15], ["e12", 1e12], ["e9", 1e9]];
  for (const [ad, b] of birim) if (n >= b) return (n / b).toFixed(2) + ad;
  return n.toLocaleString("en");
}

export function zincirEtiketi(anahtar) {
  const Z = ZINCIRLER[anahtar];
  return Z ? Z.ad : anahtar;
}

/* ---- the recommended list ------------------------------------------- */

export function oneriTablosu(secildi) {
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "#" }),
    el("th", { yazi: "Varlık" }),
    el("th", { yazi: "Zincir" }),
    el("th", { yazi: "Havuz" }),
    el("th", { yazi: "Şu tutara kadar" }),
    el("th", { yazi: "" })
  ])]));
  const govde = el("tbody");

  ONERILEN.forEach((v, i) => {
    const zincirler = Object.keys(v.zincirler);
    govde.append(el("tr", {}, [
      el("td", { yazi: String(i + 1) }),
      el("td", {}, [
        el("div", {}, [
          el("strong", { yazi: v.simge }),
          el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "  " + v.ad })
        ]),
        el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: v.ondalik + " ondalık" })
      ]),
      el("td", {}, [
        el("div", { yazi: String(zincirler.length) }),
        el("div", {
          sinif: "yazi yazi--kucuk yazi--sessiz",
          yazi: zincirler.map(zincirEtiketi).join(", ")
        })
      ]),
      el("td", { yazi: String(v.havuz) }),
      el("td", {}, [
        el("div", { yazi: tutarYaz(v.azamiTutar) }),
        el("div", { sinif: "yazi yazi--kucuk yazi--sessiz",
          yazi: "ölçülen en büyük" })
      ]),
      el("td", {}, [
        el("button", {
          sinif: "dugme dugme--sessiz",
          attr: { type: "button" },
          yazi: "Seç",
          on: { click: () => secildi(v) }
        })
      ])
    ]));
  });

  tablo.append(govde);
  return tablo;
}

/* ---- the CA field, which checks live -------------------------------- */

export function caAlani(secildi) {
  const girdi = el("input", {
    sinif: "girdi",
    attr: { type: "text", placeholder: "0x… kontrat adresi", spellcheck: "false" }
  });
  const dugme = el("button", {
    sinif: "dugme dugme--marka",
    attr: { type: "button" },
    yazi: "Kontrol et"
  });
  const sonuc = el("div", { sinif: "yigin yigin--sik" });

  async function kontrol() {
    const ca = girdi.value.trim();
    sonuc.replaceChildren();

    if (!adresMi(ca)) {
      sonuc.append(not(
        "Bu bir kontrat adresi değil. Kırk onaltılık haneli, 0x ile başlayan " +
        "bir adres olmalı.",
        "uyari"
      ));
      return;
    }

    dugme.disabled = true;
    dugme.textContent = "Zincirler taranıyor…";
    sonuc.append(el("div", {
      sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: Object.keys(ZINCIRLER).length + " zincirde en derin USDC havuzu aranıyor…"
    }));

    let r;
    try {
      r = await tumZincirleriTara(ca);
    } catch (e) {
      sonuc.replaceChildren(hata("Tarama başarısız", (e && e.message) || String(e)));
      dugme.disabled = false;
      dugme.textContent = "Kontrol et";
      return;
    }

    dugme.disabled = false;
    dugme.textContent = "Kontrol et";
    sonuc.replaceChildren();

    /* Identity first: twenty bytes look like any other twenty bytes, and
       the symbol is the only way somebody can tell they pasted what they
       meant to paste. */
    sonuc.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Sembol", r.kimlik.simge || "okunamadı",
        r.kimlik.simge ? null : "bu adres bir ERC20 gibi cevap vermiyor"),
      olcum("Ondalık", r.kimlik.ondalik == null ? "—" : String(r.kimlik.ondalik), null),
      olcum("Sonuç", r.calisiyor ? "Çalışıyor" : "Çalışmıyor", r.ozet)
    ]));

    /* Every chain, including the ones that said no — a result that only
       lists the chains that worked cannot be checked by the reader. */
    const tablo = el("table", { sinif: "tablo tablo--kart" });
    tablo.append(el("thead", {}, [el("tr", {}, [
      el("th", { yazi: "Zincir" }),
      el("th", { yazi: "Durum" }),
      el("th", { yazi: "Kademe" }),
      el("th", { yazi: "Derinlik" }),
      el("th", { yazi: "Gözlem" }),
      el("th", { yazi: "Havuz" })
    ])]));
    const govde = el("tbody");

    for (const s of r.sonuclar) {
      if (s.hata) {
        govde.append(el("tr", {}, [
          el("td", { yazi: s.ad || s.zincir }),
          el("td", { attr: { colspan: 5 } }, [
            el("span", {
              sinif: "yazi yazi--kucuk yazi--sessiz",
              yazi: "okunamadı: " + s.hata
            })
          ])
        ]));
        continue;
      }
      const d = s.enDerin;
      govde.append(el("tr", {}, [
        el("td", { yazi: s.ad }),
        el("td", {}, [
          s.calisiyor
            ? el("span", { sinif: "etiket etiket--kabul", yazi: "Çalışıyor" })
            : el("span", {
              sinif: "etiket " + (s.duzeltilebilir ? "etiket--bekle" : "etiket--red"),
              yazi: s.duzeltilebilir ? "Henüz değil" : "Hayır"
            }),
          s.sebep
            ? el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: s.sebep })
            : null
        ]),
        el("td", { yazi: d ? String(d.kademe) : "—" }),
        el("td", { yazi: d ? derinlik(d.likidite) : "—" }),
        el("td", { yazi: d ? String(d.kardinalite) : "—" }),
        el("td", {}, [d ? adres(d.havuz) : el("span", { yazi: "—" })])
      ]));
    }
    tablo.append(govde);
    sonuc.append(tablo);

    if (r.duzeltilebilir.length) {
      sonuc.append(not(
        "“Henüz değil” kalıcı bir ret değil: o havuzun gözlem geçmişi " +
        "açılmamış. Uniswap'te bunu HERKES açabilir — bir kerelik gaz, " +
        "izin gerekmez. Açıldıktan sonra bu varlık teminat olarak " +
        "kullanılabilir. (Gereken asgari gözlem: " + ASGARI_KARDINALITE + ")",
        "bilgi"
      ));
    }
    if (!r.calisiyor && !r.duzeltilebilir.length) {
      sonuc.append(not(
        "Bu adres için hiçbir zincirde likiditesi olan USDC havuzu yok. " +
        "Teminatın oraya girip çıkabilmesi gerekiyor, yani bu sistemin " +
        "dolduramayacağı bir eksik. Havuzu olan bir adres gerekiyor.",
        "uyari"
      ));
    }

    if (r.calisiyor) {
      sonuc.append(el("div", { sinif: "satir satir--arali" }, [
        el("button", {
          sinif: "dugme dugme--marka",
          attr: { type: "button" },
          yazi: r.kimlik.simge
            ? r.kimlik.simge + " teminatını seç"
            : "Bu adresi teminat seç",
          on: {
            click: () => secildi({
              simge: r.kimlik.simge || ca.slice(0, 10),
              ad: r.kimlik.simge || "kontrat adresi",
              ondalik: r.kimlik.ondalik ?? 18,
              havuz: r.calisan.reduce((a, s) => a + s.havuzSayisi, 0),
              zincirler: Object.fromEntries(r.calisan.map((s) => [
                s.zincir, { token: ca, havuz: s.havuzSayisi }
              ])),
              caIle: true
            })
          }
        })
      ]));
    }
  }

  dugme.addEventListener("click", kontrol);
  girdi.addEventListener("keydown", (ev) => { if (ev.key === "Enter") kontrol(); });

  return el("div", { sinif: "yigin yigin--sik" }, [
    el("p", {
      sinif: "yazi yazi--sessiz",
      yazi: "Listede olmayan bir token kullanmak için kontrat adresini " +
        "yapıştır. Aynı kontrol yapılır: yedi zincirde en derin USDC havuzu " +
        "bulunur, likiditesine ve gözlem geçmişine bakılır. Hangi kademede " +
        "işlem göreceğini sen seçmezsin — en likit olan bulunur."
    }),
    el("div", { sinif: "satir satir--arali" }, [girdi, dugme]),
    sonuc
  ]);
}

/* ---- the screen ------------------------------------------------------ */

export async function ciz({ param }) {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst(
    "Teminat seçimi",
    "Önerilen " + ONERILEN.length + " varlık, ya da kendi kontrat adresin"
  ));

  const secim = el("div");
  const secildi = (v) => {
    secim.replaceChildren(panel("Seçilen teminat", el("div", { sinif: "yigin yigin--sik" }, [
      el("div", { sinif: "izgara izgara--olcum" }, [
        olcum("Varlık", v.simge, v.ad),
        olcum("Ondalık", String(v.ondalik), null),
        olcum("Zincir", String(Object.keys(v.zincirler).length),
          Object.keys(v.zincirler).map(zincirEtiketi).join(", ")),
        olcum("Havuz", String(v.havuz), "tüm kademeler"),
        olcum("Dönüşüm", tutarYaz(v.azamiTutar), "ölçülen en büyük tutar")
      ]),
      v.caIle
        ? not("Bu varlık önerilen listeden değil, kontrat adresiyle seçildi — " +
          "ve aynı kontrolü geçti.", "bilgi")
        : null,
      el("a", {
        sinif: "dugme dugme--marka",
        attr: { href: "#/olustur?teminat=" + encodeURIComponent(Object.values(v.zincirler)[0].token) },
        yazi: "Bu teminatla token oluştur"
      })
    ].filter(Boolean))));
    secim.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  kap.append(not(
    "Teminat bir token ya da coin. Hepsinin özellikleri aynı — hiçbirinin " +
    "özel durumu yok, meme coin de dahil. Aşağıdaki " + ONERILEN.length +
    " varlık bir KISAYOL, kapı değil: listede olmayan her çalışan token " +
    "kontrat adresiyle seçilebilir.",
    "bilgi"
  ));

  kap.append(secim);

  kap.append(panel("Kendi tokenini kullan", caAlani(secildi)));

  kap.append(panel(
    "Önerilen " + ONERILEN.length,
    oneriTablosu(secildi),
    el("span", {
      sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: "ölçüldü " + String(TEMINAT_OLCUMU).slice(0, 10)
    }),
    true
  ));

  kap.append(not(
    "Sıralama ölçüme göre: her varlık dört tutarda ($20 / $200 / $2.000 / " +
    "$20.000) gerçekten dönüştürülebiliyor mu diye Uniswap'in kendi " +
    "kotasına soruldu ve kaldırdığı EN BÜYÜK tutarla sıralandı. " +
    DAGILIM.map((d) => tutarYaz(d.tutar) + " için " + d.adet).join(", ") +
    " varlık. Piyasa değeri ya da likidite tabanı gibi vekil ölçütler " +
    "kullanılmadı — sorulan şey bir eşik değil, doğrudan yapılacak işin " +
    "kendisi.",
    ""
  ));

  kap.append(not(
    "Neden tek bir \"çalışıyor\" yok: fiyatın ölçülebilmesi, o havuzda " +
    "işlem yapılabileceği anlamına gelmiyor. SHIB'in fiyatı %0,00 tutarlı " +
    "okunuyor ama $2.000'lık işlem fiyatı 17,5 kat ittiriyor, çünkü " +
    "likiditesi SHIB/USDC'de değil SHIB/WETH'te. Taban marjinal fiyattan " +
    "türetildiği için böyle bir dönüşüm reddedilir — para kaybolmaz, işlem " +
    "olmaz. Asgari teminat $20 ama teminat her işlemin vergisiyle büyüyor, " +
    "o yüzden \"hangi büyüklüğe kadar\" sorusunun cevabı listede yazılı.",
    "uyari"
  ));

  return kap;
}
