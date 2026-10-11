/* ===========================================================================
 * gorunum/zincirler.js — multi-chain collateral, as measured
 *
 * This module is marked live, and that needs explaining: nothing
 * cross-chain is BUILT. What is live is the measurement — which routes
 * exist out of Arc, which carry value, which carry only messages, and why
 * the collateral therefore stays on Arc.
 *
 * That is the opposite of the usual "multi-chain" page, and it is the only
 * version that is true. The brief's rule is explicit: a route that is not
 * supported must not be shown as though it works.
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum } from "../ui.js";
import { ikon } from "../ikon.js";
import { TEMINAT_EVRENI } from "../adresler.js";
import { besleyiciFiyat } from "../zincir.js";
import { para } from "../bicim.js";

/* Measured 2026-10-09 from Chainlink's CCIP directory API and by reading
   the contracts on Arc. Each row says what it carries, because "there is a
   lane" and "the lane moves your money" are different claims. */
const CCIP_HATLAR = [
  { ad: "Ethereum", tasir: "LINK, syrupUSDC" },
  { ad: "Base", tasir: "VIRTUAL" },
  { ad: "Polygon", tasir: "yalnızca mesaj" },
  { ad: "Solana", tasir: "PST" },
  { ad: "0G", tasir: "yalnızca mesaj" },
  { ad: "Tempo", tasir: "yalnızca mesaj" }
];

const CCTP_DOMAINLER = [
  "Ethereum", "Avalanche", "OP", "Arbitrum", "Solana", "Base", "Polygon",
  "Sui", "Aptos", "Unichain", "Linea", "Codex", "Sonic", "World", "Sei",
  "XDC", "Ink", "Plume"
];

/* Measured from Circle's fee service, 2026-10-10. `minimumFee` is in
   basis points: 0.325 bps is 0.00325%. Outbound from Arc is free in both
   finality modes, which is unusual and worth showing rather than
   rounding away. */
const HIZ = [
  { yol: "Base → Arc", hizli: "0,325 bps", standart: "ücretsiz" },
  { yol: "Ethereum → Arc", hizli: "0,25 bps", standart: "ücretsiz" },
  { yol: "Solana → Arc", hizli: "0,25 bps", standart: "ücretsiz" },
  { yol: "Polygon → Arc", hizli: "ücretsiz", standart: "ücretsiz" },
  { yol: "Arc → Base", hizli: "ücretsiz", standart: "ücretsiz" },
  { yol: "Arc → Ethereum", hizli: "ücretsiz", standart: "ücretsiz" }
];

function hizTablosu() {
  const t = el("table", { sinif: "tablo tablo--kart" });
  t.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Yol" }),
    el("th", { yazi: "Hızlı (~saniyeler)" }),
    el("th", { yazi: "Standart" })
  ])]));
  const g = el("tbody");
  for (const h of HIZ) {
    g.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Yol" }, yazi: h.yol }),
      el("td", { sinif: "sayi", attr: { "data-et": "Hızlı" }, yazi: h.hizli }),
      el("td", { sinif: "sayi", attr: { "data-et": "Standart" }, yazi: h.standart })
    ]));
  }
  t.append(g);
  return t;
}

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Çok zincirli teminat",
    "Hangi rotalar gerçekten açık, hangileri değil"));

  kap.append(not(
    "Teminat GİRİŞİ 25 zincirden açık ve bugün çalışıyor. ÇIKIŞ yok ve " +
    "yapılmayacak: kasadan varlık çıkaran dört yolun hepsi msg.sender'a " +
    "ödüyor, hiçbirinde hedef argümanı yok. Başka zincire teminat " +
    "göndermek çağıranın hedef verdiği bir fonksiyon gerektirir ve o " +
    "fonksiyonun adı ne olursa olsun withdraw'dır. Ayrıca CCTP kaynakta " +
    "yakıp hedefte bastığı için arada kasanın bakiyesi düşmüş olur — " +
    "Fast Transfer o pencereyi saniyelere indiriyor ama sıfıra " +
    "indirmiyor, ve hak her an tam olmak zorunda.",
    "uyari"
  ));

  /* ---- what can be collateral, with live prices -------------------- */
  const fiyatlar = await Promise.all(TEMINAT_EVRENI.map((t) => besleyiciFiyat(t.besleyici, 8)));
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Varlık" }), el("th", { yazi: "Fiyat" }),
    el("th", { yazi: "Ondalık" }), el("th", { yazi: "Besleyici" })
  ])]));
  const govde = el("tbody");
  for (let i = 0; i < TEMINAT_EVRENI.length; i++) {
    const t = TEMINAT_EVRENI[i], f = fiyatlar[i];
    govde.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Varlık" } }, [
        el("strong", { yazi: t.sembol }),
        el("div", { sinif: "ucuncul", yazi: t.ad })
      ]),
      el("td", { sinif: "sayi", attr: { "data-et": "Fiyat" },
        yazi: f ? para(f.fiyat, { kisalt: f.fiyat > 1000 }) : "okunamadı" }),
      el("td", { sinif: "sayi", attr: { "data-et": "Ondalık" }, yazi: String(t.ondalik) }),
      el("td", { attr: { "data-et": "Besleyici" } },
        [el("span", { sinif: "mono ucuncul", yazi: t.besleyiciAdi })])
    ]));
  }
  tablo.append(govde);
  kap.append(panel([
    el("span", { html: ikon("kalkan", "yol-oge__ikon") }),
    el("span", { yazi: "Teminat olabilen varlıklar" })
  ], el("div", { sinif: "tablo-sarmal" }, [tablo])));

  kap.append(panel("Karşılık doğrulaması", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "Sarmalanmış bir teminat varlığının karşılığı olup olmadığı ayrı " +
        "bir sorudur. cirBTC'nin Arc'ta Chainlink Proof-of-Reserve " +
        "besleyicisi var ve ölçüldü: 6.170,82 BTC rezerve karşı 5.297,68 " +
        "cirBTC arzı — %16,48 fazla karşılık, yani açık yok." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Beş teminat varlığından yalnızca cirBTC'de böyle bir besleyici " +
        "var. Sözleşmede zorunluluk haline getirilmedi: tek varlığa özel " +
        "kural, \"bütün teminat varlıkları aynı kurallarla işler\" " +
        "tasarımını bozardı. Bilgi olarak burada duruyor." })
    ])
  ]));

  kap.append(not(
    "DOGE, XLM, HBAR, ADA ve DOT Arc'ta fiyatlanmıyor — Chainlink " +
    "besleyicisi yok, dolayısıyla teminat olamazlar. Fiyatı olup Arc'ta " +
    "tokeni doğrulanmamış varlıklar da listede yok: fiyat bir varlık değil.",
    "bilgi"
  ));

  /* ---- the routes --------------------------------------------------- */
  const izgara = el("div", { sinif: "izgara izgara--olcum" });
  izgara.append(olcum("CCIP hattı", String(CCIP_HATLAR.length), "Arc'tan çıkan, iki yönlü"));
  izgara.append(olcum("CCIP + USDC", "yok", "hiçbir hat USDC taşımıyor"));
  izgara.append(olcum("CCTP domain", "26", "Arc'ın kendi domain kimliği"));
  izgara.append(olcum("CCTP bağlantısı", "~" + CCTP_DOMAINLER.length, "native USDC yakma/basma"));
  kap.append(izgara);

  const hatlar = el("div", { sinif: "yigin yigin--sik" });
  for (const h of CCIP_HATLAR) {
    const mesajMi = h.tasir === "yalnızca mesaj";
    hatlar.append(el("div", { sinif: "satir satir--arasi" }, [
      el("strong", { yazi: "Arc ↔ " + h.ad }),
      el("span", { sinif: "etiket " + (mesajMi ? "" : "etiket--bilgi"), yazi: h.tasir })
    ]));
  }
  kap.append(panel("CCIP — mesaj hattı, değer hattı değil", [
    hatlar,
    el("div", { sinif: "ikincil", attr: { style: "margin-top:12px" }, yazi:
      "Router 0xB797…3A18, zincirde 10.761 bayt kod. Ücret LINK ya da USDC " +
      "ile ödenebiliyor. Ama hatların taşıdığı token listesi ölçüldü ve " +
      "USDC hiçbirinde yok — yani CCIP bu projede teminat taşıyamaz." })
  ]));

  kap.append(panel("CCTP v2 — USDC'nin tek gerçek yolu", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "TokenMessengerV2, MessageTransmitterV2 ve TokenMinterV2 Arc'ta " +
        "dağıtılmış ve localDomain() 26 cevap veriyor. Circle'ın kendi " +
        "yakma/basma yolu — üçüncü taraf köprü riski yok." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Arc'ın token eşleştirme olayları tarandı: CCTP burada TEK bir " +
        "token basabiliyor, USDC, ve 25 ayrı zincirden. Başka hiçbir varlık " +
        "eşleştirilmemiş. Circle'ın \"CCTP for non-USDC\" ürünü var ama " +
        "ihraççının mint yetkisi vermesini gerektiriyor ve Arc'ta kurulu değil." })
    ]),
    el("div", { sinif: "satir", attr: { style: "margin-top:12px" } },
      CCTP_DOMAINLER.map((d) => el("span", { sinif: "etiket", yazi: d }))),
    el("div", { sinif: "tablo-sarmal", attr: { style: "margin-top:16px" } }, [hizTablosu()])
  ]));

  /* The finding the whole design rests on, and the one that reverses the
     usual conclusion: inflow is already live. */
  kap.append(panel("Zincirler arası teminat GİRİŞİ — bugün çalışıyor", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "CCTP bir mint yaparken hiçbir şey çağırmaz — parayı alıcısına basar. " +
        "Kasa da mevduat takip etmiyor, BAKİYESİNİ sayıyor. İkisi birleşince: " +
        "25 zincirden herhangi birinden bir kasanın adresine gönderilen USDC, " +
        "sıfır yeni kodla o tokenin tabanına ekleniyor." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Ölçüldü: besle() hiç çağrılmadan gönderilen 250 dolar kasanın " +
        "bakiyesini, hak/token değerini ve sepet değerini tam 250 dolar " +
        "artırdı. Yeni güven varsayımı da yok, çünkü kasa bu yolda kimseye " +
        "bir şey göndermiyor." })
    ]),
    el("div", { sinif: "not not--uyari", attr: { style: "margin-top:12px" }, yazi:
      "Yalnızca o kasanın SEPETİNDEKİ varlık için geçerli. Sepette " +
      "olmayan bir varlık kasaya gönderilirse iade onu dağıtmaz ve sepet " +
      "değeri onu saymaz — orada kalır ve çıkarılamaz." })
  ]));

  kap.append(panel("Arc ↔ Robinhood Chain", [
    el("div", { sinif: "ikincil", yazi:
      "İkisi de CCIP'de (Arc 5042, RHC 4663) ama aralarında doğrudan hat " +
      "yok. Buna karşılık Ethereum üzerinden dört bacağın da, Base " +
      "üzerinden dört bacağın da yapılandırılmış olduğu ölçüldü — yani iki " +
      "hopla güvenilmeyen bir mesaj yolu bugün mevcut." }),
    el("div", { sinif: "not", attr: { style: "margin-top:12px" }, yazi:
      "Kurulmadı. Koşmadığımız bir rotayı çalışıyor gibi göstermiyoruz." })
  ]));

  return kap;
}
