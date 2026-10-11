/* ===========================================================================
 * gorunum/gelistirici.js — Geliştirici Portalı
 *
 * Dış bir geliştiricinin bu sistemde para kazanmasının İKİ yolu var ve
 * ikisi birbirinden bağımsız:
 *
 *   1. PAZAR — kendi ürününü satar. Hasılatın %80'i doğrudan ona gider,
 *      aynı işlemde, aracı bir bakiye olmadan.
 *   2. GELİŞTİRİCİ HAVUZU — her işlemin %0,30'u DevPool'da birikir ve
 *      oradan ödeme yalnızca FTHM DAO'sunun geçen bir teklifiyle çıkar.
 *
 * NİYE İKİSİNİ AYRI ANLATIYORUM
 *   Birincisi kendi kendine çalışıyor: ürünü sat, parayı al. İkincisi bir
 *   oya bağlı ve o oy BUGÜN VERİLEMİYOR — stake edilmiş FTHM sıfır, yani
 *   kimsenin oy gücü yok. Havuz dolmaya devam ediyor ama kimse çekemiyor.
 *
 *   Bu ikisini "geliştirici kazançları" diye tek başlıkta toplamak,
 *   fonlanmamış bir ödülü garanti edilmiş kazanç gibi göstermek olurdu —
 *   kullanıcının açıkça yasakladığı şey tam bu.
 *
 * ZİNCİRDE NE YOK
 *   Ürün bilgisi bir URI'nin arkasında. API anahtarı, gizli uç nokta ya da
 *   müşteri verisi zincire YAZILMIYOR; zincir herkese açık ve geri
 *   alınamaz. Lisans doğrulaması alıcının adresiyle yapılıyor, yani
 *   geliştirici kimseyle sır paylaşmıyor.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, dagitimBekliyor } from "../ui.js";
import { oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";
import { PAZAR, PAZAR_KURAL, PULSE, YONETISIM, EKONOMI, canli } from "../adresler.js";
import { para, jetonMiktar, tamSayidanSayi, ppmYuzde } from "../bicim.js";

const PLATFORM_PPM = 200_000;
/* NOT A SECOND COPY
     This was written here as 3_000. The fee table already lives in
     EKONOMI.dilimler and denetim-sayfa.js asserts every entry of it
     against the deployed hook — a hand-written duplicate here would sit
     outside that check and could drift from the contract without
     anything noticing. */
const GELISTIRICI_PPM = EKONOMI.dilimler.gelistirici;

export async function ciz({ kayit, cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  /* hesap() BIR FONKSIYON, OZELLIK DEGIL
       Bu satir once "cuzdan.hesap ? cuzdan.hesap : null" diye yazilmisti:
       fonksiyonun KENDISI atanmis oluyordu ve bir fonksiyon her zaman
       truthy. Sonuc, cuzdan bagli olmasa bile ekranin bagliymis gibi
       davranmasiydi — gonderemeyecegi bir formu basar ve "kazancini"
       okumaya calisirdi. Diger gorunumlerin hepsi cuzdan.hesap() diye
       cagiriyor. */
  const hesap = cuzdan ? cuzdan.hesap() : null;

  kap.append(sayfaUst(
    "Geliştirici Portalı",
    "Ürün sat ya da katkı yap — iki yol, iki ayrı kaynak"
  ));

  /* ---- 1. the two routes, side by side ---------------------------- */
  kap.append(panel("İki kazanç yolu", el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Pazar satışı", ppmYuzde(1_000_000 - PLATFORM_PPM),
        "satış başına, aynı işlemde sana"),
      olcum("Geliştirici havuzu", ppmYuzde(GELISTIRICI_PPM),
        "her işlemden, DAO kararıyla dağıtılır")
    ]),
    not(
      "Pazar satışı kendi kendine çalışıyor: ürünü satarsın, para aynı " +
      "işlemde cüzdanına geçer, arada kimse tutmaz. Geliştirici havuzu " +
      "ise bir oya bağlı — ve o oy şu anda verilemiyor. Aşağıda neden " +
      "yazıyor.",
      "bilgi"
    )
  ])));

  /* ---- 2. the dev pool, with its real state ----------------------- */
  const havuzGovde = el("div", { sinif: "yigin yigin--sik" });

  if (!canli(PULSE.devPool)) {
    havuzGovde.append(not("Geliştirici havuzu henüz zincirde değil.", "uyari"));
  } else {
    /* The balance and the voting power that would be needed to spend it. */
    let tutulan = null, stakeli = null, taban = null;
    try {
      const ham = await cokluCagri([
        { method: "eth_call", params: [{ to: EKONOMI.quote,
          data: cagriVerisi(ABI.erc20, "balanceOf", [PULSE.devPool]) }, "latest"] },
        { method: "eth_call", params: [{ to: YONETISIM.staking,
          data: cagriVerisi(ABI.staking, "totalStaked") }, "latest"] },
        { method: "eth_call", params: [{ to: YONETISIM.staking,
          data: cagriVerisi(ABI.staking, "MIN_OY_GUCU") }, "latest"] }
      ]);
      const tek = (tablo, ad, r) => {
        if (r == null) return null;
        const c = sonucCoz(tablo, ad, r);
        return c && c.length === 1 ? c[0] : c;
      };
      tutulan = tek(ABI.erc20, "balanceOf", ham[0]);
      stakeli = tek(ABI.staking, "totalStaked", ham[1]);
      taban = tek(ABI.staking, "MIN_OY_GUCU", ham[2]);
    } catch (e) { /* reported below */ }

    havuzGovde.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Havuzda biriken",
        tutulan == null ? "okunamadı" : para(tamSayidanSayi(tutulan, 6)),
        "her işlemin %0,30'u"),
      olcum("Stake edilmiş FTHM",
        stakeli == null ? "okunamadı" : jetonMiktar(tamSayidanSayi(stakeli, 18)),
        "oy gücünün tamamı"),
      olcum("Teklif tabanı",
        taban == null ? "okunamadı" : jetonMiktar(tamSayidanSayi(taban, 18)) + " FTHM",
        "teklif verebilmek için en az")
    ]));

    /* THE HONEST PART, AND IT IS THE WHOLE POINT
         A portal that lists a pool balance and a "claim" button would be
         promising money that cannot move. The pool can only pay through a
         passed proposal, and with nothing staked no proposal can even be
         opened. */
    const bos0 = stakeli != null && BigInt(stakeli) === 0n;
    havuzGovde.append(not(
      bos0
        ? "Bu havuzdan ödeme yalnızca FTHM DAO'sunun geçen bir teklifiyle " +
          "çıkıyor ve ŞU AN hiç FTHM stake edilmemiş — yani kimsenin oy " +
          "gücü yok ve kimse teklif veremiyor. Havuz dolmaya devam ediyor, " +
          "ama ne DAO ne biz oradan para çekebiliyoruz. Burada bir 'talep " +
          "et' düğmesi yok çünkü basılacak bir şey yok."
        : "Bu havuzdan ödeme yalnızca FTHM DAO'sunun geçen bir teklifiyle " +
          "çıkıyor: %1 teklif eşiği, %10 kota, 5 gün oy, 2 gün timelock. " +
          "Katkını kaydettirebilirsin ama ödeme bir oya bağlı.",
      bos0 ? "uyari" : "bilgi"
    ));

    havuzGovde.append(not(
      "Havuzun yetkilisi FTHM Governor'ı ve bu adres değiştirilemez. " +
      "Önceki geliştirici fonunun tahsiscisi işletme cüzdanıydı ve o da " +
      "değiştirilemezdi — yani DAO ona hiç dokunamıyordu. Havuz tam bu " +
      "yüzden yenilendi.",
      "bilgi"
    ));
  }
  /* ---- 2b. THE ONE THING THAT ACTUALLY WORKS TODAY ----------------
       register() is permissionless and the DevPool is deployed, so a
       developer can put a contribution on chain right now. That is a
       RECORD, not a payment, and the wording has to keep those apart:
       recording work does not fund it, and pretending otherwise would be
       exactly the "unfunded reward shown as guaranteed earnings" the
       brief forbids.

       It is still worth having. When the DAO can vote, the proposal that
       pays somebody references a contribution id, and that id has to
       exist first. */
  if (canli(PULSE.devPool)) {
    const katkiGovde = el("div", { sinif: "yigin yigin--sik" });
    let sayi = null;
    try {
      sayi = await oku(PULSE.devPool, ABI.devPool, "contributionCount");
    } catch (e) { sayi = null; }

    katkiGovde.append(el("p", {
      sinif: "yazi yazi--sessiz",
      yazi: "Yaptığın işi zincire kaydedebilirsin: bir bağlantı (PR, " +
        "depo, rapor) ver, kaydı herkes görür ve bir id alır. Bu bir " +
        "ÖDEME DEĞİL — ödeme ancak DAO'nun geçen bir teklifiyle olur ve " +
        "o teklif bu id'ye atıfta bulunur."
    }));
    katkiGovde.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Kayıtlı katkı", sayi == null ? "okunamadı" : String(Number(sayi)),
        "bugüne kadar"),
      olcum("Kayıt yetkisi", "herkes", "izinsiz: yargı oyda veriliyor")
    ]));

    const uriGirdi = el("input", {
      sinif: "girdi",
      attr: { type: "text", placeholder: "https://github.com/... veya ipfs://...",
        maxlength: "300" }
    });
    const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
    const dugme = el("button", {
      sinif: "dugme dugme--marka",
      yazi: "KATKIYI KAYDET",
      attr: { type: "button" }
    });

    dugme.addEventListener("click", async () => {
      const uri = (uriGirdi.value || "").trim();
      if (!uri) {
        durumSatiri.className = "yazi yazi--kucuk yazi--hata";
        durumSatiri.textContent = "Bir bağlantı gir.";
        return;
      }
      if (!hesap) {
        durumSatiri.className = "yazi yazi--kucuk yazi--hata";
        durumSatiri.textContent = "Cüzdan bağlı değil.";
        return;
      }
      try {
        durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
        durumSatiri.textContent = "Gönderiliyor…";
        const hash = await cuzdan.gonder({
          to: PULSE.devPool,
          data: cagriVerisi(ABI.devPoolYaz, "register", [uri])
        });
        durumSatiri.className = "yazi yazi--kucuk";
        /* The hash and nothing else: whether it landed is the chain's to
           say, and it says so on the next read. */
        durumSatiri.textContent = "Gönderildi: " + hash;
      } catch (e) {
        durumSatiri.className = "yazi yazi--kucuk yazi--hata";
        durumSatiri.textContent = (e && e.message) || "İşlem gönderilemedi.";
      }
    });

    katkiGovde.append(el("div", { sinif: "alan" }, [
      el("label", { sinif: "alan__etiket", yazi: "Katkı bağlantısı" }),
      uriGirdi
    ]));
    if (hesap) {
      katkiGovde.append(dugme);
    } else {
      katkiGovde.append(not(
        "Kaydetmek için cüzdanı bağla. Sayfa kendi başına hiçbir şey " +
        "göndermiyor.", "bilgi"));
    }
    katkiGovde.append(durumSatiri);
    katkiGovde.append(not(
      "Kaydettiğin bağlantı herkese açık ve geri alınamaz. Gizli bir " +
      "depo adresi, anahtar ya da müşteri verisi YAZMA.", "uyari"));

    kap.append(panel("Katkını kaydet", katkiGovde));
  }

  kap.append(panel("Geliştirici havuzu", havuzGovde));

  /* ---- 3. the marketplace side ------------------------------------
   *
   * DAĞITILDI, ARTIK FORMLAR GERÇEK
   *   Bu bölüm "dağıtım bekliyor" diyordu ve doğruydu. Pazar artık Arc
   *   ana ağında, bu yüzden kayıt ve yayın formları gerçek işlem
   *   gönderiyor.
   *
   *   Kayıt izinsiz: onay kapısı koymak onaylayacak birini gerektirirdi.
   *   Kalite kapısı kayıt değil — satış sayısı ve yalnızca ödemiş
   *   müşterilerin verebildiği puan.
   */
  if (!canli(PAZAR.pazar)) {
    kap.append(panel("Pazarda ürün yayınla", dagitimBekliyor(kayit)));
  } else {
    /* Is this wallet registered? Everything else depends on it, and the
       contract refuses urunEkle() without it. */
    let kayitli = null;
    if (hesap) {
      try {
        const r = await cokluCagri([{
          method: "eth_call",
          params: [{ to: PAZAR.pazar,
            data: cagriVerisi(ABI.pazar, "gelistirici", [hesap]) }, "latest"]
        }]);
        const d = r[0] == null
          ? null : sonucCoz(ABI.pazar, "gelistirici", r[0]);
        kayitli = d ? d[0] === true : null;
      } catch (e) { kayitli = null; }
    }

    const durum1 = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
    const kayitGovde = el("div", { sinif: "yigin yigin--sik" });

    if (!hesap) {
      kayitGovde.append(bos(
        "Cüzdan bağlı değil",
        "Kaydolmak için cüzdanı bağla. Sayfa kendi başına hiçbir şey " +
        "göndermiyor."
      ));
    } else if (kayitli === null) {
      kayitGovde.append(not(
        "Kayıt durumu okunamadı. Zincirin ne dediği bilinmeden form " +
        "basmak, geri dönecek bir işlem göndermeye davet olurdu.", "uyari"));
    } else if (kayitli === true) {
      kayitGovde.append(not("Bu cüzdan kayıtlı. Ürün yayınlayabilirsin.",
        "bilgi"));
    } else {
      const profilGirdi = el("input", {
        sinif: "girdi",
        attr: { type: "text", maxlength: "300",
          placeholder: "https://… veya ipfs://… — kim olduğun, ne yaptığın" }
      });
      const kayitDugme = el("button", {
        sinif: "dugme dugme--marka", yazi: "KAYDOL", attr: { type: "button" }
      });
      kayitDugme.addEventListener("click", async () => {
        const uri = (profilGirdi.value || "").trim();
        /* The contract reverts on an empty uri; saying so here is clearer
           than letting the chain answer with a selector. */
        if (!uri) {
          durum1.className = "yazi yazi--kucuk yazi--hata";
          durum1.textContent = "Profil bağlantısı boş olamaz.";
          return;
        }
        try {
          durum1.className = "yazi yazi--kucuk yazi--sessiz";
          durum1.textContent = "Gönderiliyor…";
          const h = await cuzdan.gonder({
            to: PAZAR.pazar,
            data: cagriVerisi(ABI.pazarYaz, "kaydol", [uri])
          });
          durum1.className = "yazi yazi--kucuk";
          durum1.textContent = "Gönderildi: " + h;
        } catch (e) {
          durum1.className = "yazi yazi--kucuk yazi--hata";
          durum1.textContent = (e && e.message) || "İşlem gönderilemedi.";
        }
      });
      kayitGovde.append(el("div", { sinif: "alan" }, [
        el("label", { sinif: "alan__etiket", yazi: "Profil bağlantısı" }),
        profilGirdi
      ]));
      kayitGovde.append(kayitDugme);
      kayitGovde.append(not(
        "Yazdığın bağlantı herkese açık ve geri alınamaz. API anahtarı, " +
        "gizli uç nokta ya da müşteri verisi YAZMA — zincir herkese açık.",
        "uyari"));
    }
    kayitGovde.append(durum1);
    kap.append(panel("Geliştirici kaydı", kayitGovde));

    /* ---- publishing, only when it can succeed --------------------- */
    const yayinGovde = el("div", { sinif: "yigin yigin--sik" });
    if (kayitli !== true) {
      yayinGovde.append(not(
        hesap
          ? "Ürün yayınlamak için önce kaydolman gerekiyor; sözleşme " +
            "kayıtsız bir adresten urunEkle() kabul etmiyor. Çalışmayacak " +
            "bir form basmıyorum."
          : "Ürün yayınlamak için cüzdanı bağla ve kaydol.",
        "bilgi"));
    } else {
      const adGirdi = el("input", {
        sinif: "girdi",
        attr: { type: "text", maxlength: "300",
          placeholder: "https://… veya ipfs://… — ürün bilgisi" }
      });
      const fiyatGirdi = el("input", {
        sinif: "girdi",
        attr: { type: "number", min: "0", step: "0.01", placeholder: "25.00" }
      });
      const periyotGirdi = el("select", { sinif: "girdi" });
      for (const [etiket, sn] of [
        ["Bir defalık — süresiz lisans", "0"],
        ["Aylık abonelik (30 gün)", String(30 * 86400)],
        ["Yıllık abonelik (365 gün)", String(365 * 86400)]
      ]) {
        periyotGirdi.append(el("option", { yazi: etiket, attr: { value: sn } }));
      }
      const durum2 = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
      const yayinDugme = el("button", {
        sinif: "dugme dugme--marka", yazi: "ÜRÜNÜ YAYINLA",
        attr: { type: "button" }
      });
      yayinDugme.addEventListener("click", async () => {
        const uri = (adGirdi.value || "").trim();
        const f = Number(fiyatGirdi.value);
        if (!uri) {
          durum2.className = "yazi yazi--kucuk yazi--hata";
          durum2.textContent = "Ürün bağlantısı boş olamaz.";
          return;
        }
        if (!Number.isFinite(f) || f < 0) {
          durum2.className = "yazi yazi--kucuk yazi--hata";
          durum2.textContent = "Fiyat sıfır ya da pozitif bir sayı olmalı.";
          return;
        }
        try {
          durum2.className = "yazi yazi--kucuk yazi--sessiz";
          durum2.textContent = "Gönderiliyor…";
          /* Six decimals, because the quote has six. Rounded rather than
             truncated so a form showing 25 does not send 24,999999. */
          const fiyat = BigInt(Math.round(f * 1e6));
          const periyot = BigInt(periyotGirdi.value || "0");
          const h = await cuzdan.gonder({
            to: PAZAR.pazar,
            data: cagriVerisi(ABI.pazarYaz, "urunEkle", [fiyat, periyot, uri])
          });
          durum2.className = "yazi yazi--kucuk";
          durum2.textContent = "Gönderildi: " + h;
        } catch (e) {
          durum2.className = "yazi yazi--kucuk yazi--hata";
          durum2.textContent = (e && e.message) || "İşlem gönderilemedi.";
        }
      });

      yayinGovde.append(el("div", { sinif: "alan" }, [
        el("label", { sinif: "alan__etiket", yazi: "Ürün bağlantısı" }),
        adGirdi
      ]));
      yayinGovde.append(el("div", { sinif: "alan" }, [
        el("label", { sinif: "alan__etiket", yazi: "Fiyat (USDC)" }),
        fiyatGirdi
      ]));
      yayinGovde.append(el("div", { sinif: "alan" }, [
        el("label", { sinif: "alan__etiket", yazi: "Satış şekli" }),
        periyotGirdi
      ]));
      yayinGovde.append(yayinDugme);
      yayinGovde.append(durum2);
      yayinGovde.append(not(
        "Satış şekli sonradan DEĞİŞTİRİLEMEZ. Aylık diye alınmış bir " +
        "aboneliği yıllığa çevirmek, müşterinin elindeki lisansın ne " +
        "olduğunu sonradan değiştirmek olurdu; farklı bir periyot isteyen " +
        "yeni bir ürün açar. Fiyat ve açıklama değişebilir.", "bilgi"));
      yayinGovde.append(not(
        "Ürünü satıştan çekebilirsin ama SATILMIŞ LİSANSI geri alamazsın " +
        "— parasını ödemiş birinin ürününü elinden almak olurdu.", "bilgi"));
    }
    kap.append(panel("Pazarda ürün yayınla", yayinGovde));
  }

  /* ---- 4. earnings, from the contract's own ledger ----------------- */
  const kazancGovde = el("div", { sinif: "yigin yigin--sik" });
  if (!hesap) {
    kazancGovde.append(bos(
      "Cüzdan bağlı değil",
      "Kazanç cüzdan adresine göre okunuyor."
    ));
  } else if (!canli(PAZAR.pazar)) {
    kazancGovde.append(not("Pazar dağıtılmadığı için okunacak bir defter " +
      "yok.", "bilgi"));
  } else {
    let kazanc = null;
    try {
      kazanc = await oku(PAZAR.pazar, ABI.pazar, "gelistiriciKazanci", [hesap]);
    } catch (e) { kazanc = null; }
    kazancGovde.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Pazardan kazandığın",
        kazanc == null ? "okunamadı" : para(tamSayidanSayi(kazanc, 6)),
        "satışların %" + (PAZAR_KURAL.gelistiriciPpm / 10_000) + "'i")
    ]));
    /* The distinction the brief insists on: this number is money that
       ALREADY moved, not a promise. */
    kazancGovde.append(not(
      kazanc != null && BigInt(kazanc) === 0n
        ? "Henüz satış yok. Bu sıfır gerçek — pazar yeni dağıtıldı."
        : "Bu tutar ZATEN cüzdanına geçmiş paranın toplamı; talep " +
          "edilecek bir bakiye değil. Pazar satışında ödeme aynı işlemde " +
          "yapılıyor, arada kimse tutmuyor.",
      "bilgi"));
    kazancGovde.append(not(
      "Geliştirici havuzu bundan AYRI ve oraya bakan sayı yukarıda. O " +
      "havuzdaki para bir oya bağlı; bu ikisini tek başlıkta toplamak, " +
      "fonlanmamış bir ödülü kazanç gibi göstermek olurdu.", "uyari"));
  }
  kap.append(panel("Kazancım", kazancGovde));

  return kap;
}
