/* ===========================================================================
 * gorunum/teklifler.js — Teklifler ve Oylama
 *
 * BU EKRAN GERÇEKTEN İŞLEM GÖNDERİR
 *   Şartname: *"Sadece görsel DAO ekranı yapma. Gerçek oylama ve teklif
 *   mekanizması oluştur."* Buradaki her düğme zincirdeki canlı Governor'a
 *   `eth_sendTransaction` yapıyor — `propose`, `castVote`, `queue`,
 *   `execute`. Hiçbiri taklit değil.
 *
 * ÇALIŞAMAYACAK HİÇBİR KONTROL BASILMIYOR
 *   Aynı şartnamenin diğer kuralı: *"Çalışmayan özellikleri aktif buton
 *   olarak sunma."* Bu yüzden her düğme, o işlemin O AN geçerli olup
 *   olmadığına göre basılıyor:
 *
 *     teklif formu   yalnızca oy gücü eşiği aşıyorsa
 *     oy düğmeleri   yalnızca teklif Oylamada ve kullanıcı oy vermediyse
 *     kuyruğa al     yalnızca durum Kabul edildi ise
 *     uygula         yalnızca durum Uygulanabilir ise
 *
 *   Ölçüldü: `totalStaked()` sıfır. Yani şu an hiç kimsenin oy gücü yok ve
 *   teklif formu hiç basılmıyor — yerine sebebi yazılıyor. Formu gösterip
 *   işlemi zincire gönderip reddettirmek, kullanıcıya gazını ödetip hiçbir
 *   şey söylememek olurdu.
 *
 * HAM ÇAĞRI ALANI AÇIK VE UYARILI
 *   Governor'ın imzası `propose(string, address, bytes)` — yani bir teklif
 *   herhangi bir çağrıyı ifade edebilir. Bunu arayüzde saklamak, sözleşmeyi
 *   olduğundan daha güvenli göstermek olurdu. Alan var, varsayılan boş
 *   (sinyal teklifi) ve ne olduğu yazılı: kimse o baytları doğrulamıyor.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres, hata } from "../ui.js";
import { oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";
import { YONETISIM, DAO_YETKI, PULSE, EKONOMI, canli } from "../adresler.js";
import { jetonMiktar, tamSayidanSayi, gecenSure, para } from "../bicim.js";

const SIFIR_ADRES = "0x0000000000000000000000000000000000000000";

const DURUM = [
  { ad: "Oylamada", sinif: "etiket--aktif" },
  { ad: "Reddedildi", sinif: "etiket--red" },
  { ad: "Kabul edildi", sinif: "etiket--kabul" },
  { ad: "Kuyrukta", sinif: "etiket--bekle" },
  { ad: "Uygulanabilir", sinif: "etiket--kabul" },
  { ad: "Uygulandı", sinif: "etiket--bitti" },
  { ad: "Süresi geçti", sinif: "etiket--red" },
  { ad: "İptal edildi", sinif: "etiket--red" }
];

/* Governor.State indices, named so a comparison reads as a sentence. */
const OYLAMADA = 0, KABUL = 2, UYGULANABILIR = 4;

function tekli(abi, ad, veri) {
  const c = sonucCoz(abi, ad, veri);
  return c && c.length === 1 ? c[0] : c;
}

/* ---- sending, with the outcome shown rather than swallowed ----------- */

function gonderici(cuzdan, dugme, durumSatiri) {
  return async (veri, aciklama) => {
    dugme.disabled = true;
    const eskiYazi = dugme.textContent;
    dugme.textContent = "Cüzdan bekleniyor…";
    durumSatiri.textContent = "";
    durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
    try {
      const hash = await cuzdan.gonder({ to: YONETISIM.governor, data: veri });
      durumSatiri.className = "yazi yazi--kucuk";
      /* The hash and nothing else. Claiming the proposal "passed" here
         would be claiming something only the chain can say, and it says
         it on the next read. */
      durumSatiri.textContent = aciklama + " gönderildi: " + hash;
      dugme.textContent = "Gönderildi";
      /* Re-read after a few blocks rather than guessing the new state.
         Arc's measured block time is ~0.507 s, so five seconds is several
         blocks. */
      setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), 5000);
    } catch (e) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      /* 4001 is the user declining, which is an answer and not a fault. */
      durumSatiri.textContent = (e && e.code === 4001)
        ? "Cüzdan reddetti."
        : "Gönderilemedi: " + ((e && e.message) || String(e));
      dugme.disabled = false;
      dugme.textContent = eskiYazi;
    }
  };
}

/* ---- a developer payment, composed rather than hand-encoded --------
 *
 * ŞARTNAMENİN BU MADDESİ MEKANİZMA OLARAK VARDI, YOL OLARAK YOKTU
 *   DAO'nun tek yetkisi DevPool'dan ödeme yapmak ve bu artık mümkün:
 *   taban stake edildi, propose() kabul ediliyor. Ama aşağıdaki serbest
 *   form çıplak bir hedef adresi ve çıplak hex çağrı verisi istiyor —
 *   yani bir geliştiriciye ödeme önermek için pay(address,address,
 *   uint256,uint256) çağrısını elle ABI-kodlamak gerekiyordu.
 *
 *   Kullanılabilir olmayan bir yetki, olmayan bir yetkiden yalnızca
 *   kâğıt üzerinde farklı. Bu bölüm o çağrıyı üç alandan kuruyor:
 *   alıcı, miktar, katkı no.
 *
 * KODLUYOR, GÖNDERMİYOR
 *   Üretilen çağrı verisi teklifin içine giriyor. Ödemeyi yapan bu sayfa
 *   değil: teklif geçecek, 2 günlük timelock dolacak ve execute()
 *   Governor adına çağıracak. Düğmenin yazısı bunu söylüyor — "öde"
 *   değil, "teklif ver".
 */
function odemeTeklifi(cuzdan, havuzBakiye) {
  const alici = el("input", {
    sinif: "girdi",
    attr: { type: "text", placeholder: "0x… geliştiricinin adresi" }
  });
  const miktar = el("input", {
    sinif: "girdi",
    attr: { type: "number", min: "0", step: "0.01", placeholder: "500.00" }
  });
  const katkiNo = el("input", {
    sinif: "girdi",
    attr: { type: "number", min: "0", step: "1", placeholder: "0" }
  });
  const neden = el("textarea", {
    sinif: "girdi girdi--alan",
    attr: { rows: 2,
      placeholder: "Ne için ödeniyor? Bu metin zincire yazılır." }
  });

  const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const dugme = el("button", {
    sinif: "dugme dugme--marka", attr: { type: "button" },
    yazi: "ÖDEME TEKLİFİ VER"
  });
  const gonder = gonderici(cuzdan, dugme, durumSatiri);

  dugme.addEventListener("click", () => {
    const a = (alici.value || "").trim();
    const m = Number(miktar.value);
    const k = Number(katkiNo.value);
    const n = (neden.value || "").trim();

    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent = "Alıcı bir adres değil.";
      return;
    }
    if (a === SIFIR_ADRES) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent =
        "Sıfır adres olamaz — sözleşme ZeroAddress ile reddediyor.";
      return;
    }
    if (!Number.isFinite(m) || m <= 0) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent =
        "Miktar sıfırdan büyük olmalı — sözleşme ZeroAmount ile reddediyor.";
      return;
    }
    if (!Number.isInteger(k) || k < 0) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent = "Katkı no tam sayı olmalı (yoksa 0 yaz).";
      return;
    }
    if (!n) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent =
        "Açıklama boş olamaz: zincire yazılan tek okunabilir şey o.";
      return;
    }

    /* Six decimals, because the quote has six. Rounded rather than
       truncated so a form showing 500 does not propose 499,999999. */
    const ham = BigInt(Math.round(m * 1e6));

    /* Not a block, a warning: the pool fills with every trade, so an
       amount above today's balance may well be payable by the time the
       vote and the timelock are done. Refusing it here would be the page
       deciding something the chain decides later. */
    if (havuzBakiye != null && ham > BigInt(havuzBakiye)) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent =
        "Uyarı: havuzda şu an " + para(tamSayidanSayi(havuzBakiye, 6)) +
        " var, teklif " + para(m) + " istiyor. Teklif verilebilir ama " +
        "uygulandığı anda bakiye yetmezse işlem döner. Yine göndermek " +
        "için düğmeye bir daha bas.";
      /* The second press goes through: the warning is shown once. */
      if (!dugme.dataset.uyarildi) { dugme.dataset.uyarildi = "1"; return; }
    }

    const veri = cagriVerisi(ABI.devPoolTeklif, "pay",
      [EKONOMI.quote, a, ham, BigInt(k)]);
    /* gonderici ZATEN kodlanmis governor cagrisini aliyor, uc parca
       degil. Teklifin kendisi burada kuruluyor: propose(aciklama, hedef,
       cagriVerisi). */
    gonder(
      cagriVerisi(ABI.governor, "propose", [n, PULSE.devPool, veri]),
      "Odeme teklifi");
  });

  const kap = el("div", { sinif: "yigin yigin--sik" });
  kap.append(el("p", {
    sinif: "yazi yazi--sessiz",
    yazi: "DAO'nun tek yetkisi bu: geliştirici havuzundan USDC ödemek. " +
      "Aşağıdaki alanlar pay() çağrısını kuruyor; ödemeyi bu sayfa " +
      "yapmıyor — teklif geçecek, 2 günlük timelock dolacak, sonra " +
      "execute() Governor adına çağıracak."
  }));
  if (havuzBakiye != null) {
    kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Havuzda", para(tamSayidanSayi(havuzBakiye, 6)),
        "DevPool'un USDC bakiyesi"),
      olcum("Hedef", "DevPool", PULSE.devPool)
    ]));
  }
  for (const [etiket, girdi] of [
    ["Geliştiricinin adresi", alici],
    ["Miktar (USDC)", miktar],
    ["Katkı no (DevPool.register'dan)", katkiNo],
    ["Ne için", neden]
  ]) {
    kap.append(el("div", { sinif: "alan" }, [
      el("label", { sinif: "alan__etiket", yazi: etiket }), girdi
    ]));
  }
  kap.append(dugme);
  kap.append(durumSatiri);
  kap.append(not(
    "Katkı no zorunlu değil ve doğrulanmıyor: bir ödeme meşru olarak " +
    "kayıttan önce gelebilir ya da birkaç katkıyı kapsayabilir. " +
    "Sözleşme bir muhasebe referansı yüzünden bir oyu reddetmiyor.",
    "bilgi"));
  return kap;
}

/* ---- the proposal form ---------------------------------------------- */

function teklifFormu(cuzdan) {
  const aciklama = el("textarea", {
    sinif: "girdi girdi--alan",
    attr: { rows: 3, placeholder: "Teklifin ne olduğunu yaz. Bu metin zincire yazılır." }
  });
  const hedef = el("input", {
    sinif: "girdi",
    attr: { type: "text", placeholder: "0x… (boş bırakılırsa sinyal teklifi)" }
  });
  const veri = el("input", {
    sinif: "girdi",
    attr: { type: "text", placeholder: "0x… çağrı verisi (boş bırakılabilir)" }
  });

  const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const dugme = el("button", {
    sinif: "dugme dugme--marka",
    attr: { type: "button" },
    yazi: "Teklifi gönder"
  });
  const gonder = gonderici(cuzdan, dugme, durumSatiri);

  dugme.addEventListener("click", () => {
    const a = aciklama.value.trim();
    if (!a) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent = "Açıklama boş olamaz: zincire yazılan tek şey o.";
      return;
    }
    const h = hedef.value.trim() || SIFIR_ADRES;
    if (!/^0x[0-9a-fA-F]{40}$/.test(h)) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent = "Hedef bir adres değil. Boş bırakmak sinyal teklifi demek.";
      return;
    }
    const d = veri.value.trim() || "0x";
    if (!/^0x([0-9a-fA-F]{2})*$/.test(d)) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent = "Çağrı verisi 0x ile başlayan çift sayıda onaltılık olmalı.";
      return;
    }
    if (h !== SIFIR_ADRES && d === "0x") {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent =
        "Hedef verilmiş ama çağrı verisi boş. Bu teklif geçse bile hedefe " +
        "boş bir çağrı yapar. Sinyal teklifi istiyorsan hedefi boş bırak.";
      return;
    }
    gonder(cagriVerisi(ABI.governor, "propose", [a, h, d]), "Teklif");
  });

  return el("div", { sinif: "yigin yigin--sik" }, [
    el("label", { sinif: "etiket-girdi", yazi: "Açıklama" }),
    aciklama,
    el("label", { sinif: "etiket-girdi", yazi: "Hedef sözleşme (isteğe bağlı)" }),
    hedef,
    el("label", { sinif: "etiket-girdi", yazi: "Çağrı verisi (isteğe bağlı)" }),
    veri,
    not(
      "Hedef ve çağrı verisi boş bırakılırsa bu bir SİNYAL teklifi olur: " +
      "kayda geçer, oylanır, geçebilir ama hiçbir şey çağırmaz. Dolu " +
      "bırakılırsa teklif geçtiğinde o çağrı aynen yapılır ve o baytları " +
      "kimse doğrulamıyor — ne bu sayfa ne sözleşme.",
      "uyari"
    ),
    el("div", { sinif: "satir satir--arali" }, [dugme]),
    durumSatiri
  ]);
}

/* ---- one proposal, with only the controls that can act -------------- */

function teklifKarti(id, pr, durumNo, hesap, oyVerdi, gucu, cuzdan, oy) {
  const d = durumNo == null ? null : DURUM[Number(durumNo)];
  /* EVERY INDEX HERE MOVED BY ONE — AND ONE CHANGED UNITS
       The ALP governor's Proposal had five uints; FTHM's DepthGovernor
       has six, because anBlok (the block weights are read at) comes
       first. So on the new governor:

         pr[4]  anBlok         was end      — a BLOCK NUMBER, and
                                              Number(pr[4]) * 1000 would
                                              have rendered it as a date
         pr[5]  end            was eta
         pr[6]  eta            was snapshotTotal
         pr[7]  snapshotTotal  was forVotes
         pr[8]  forVotes       was againstVotes

       Nothing would have thrown. The screen would have shown a deadline
       in the wrong millennium, quorum measured against the wrong total,
       and the FOR count taken from the staked supply.

       The two vote counts come from named getters now; an index can
       drift again when a struct changes, a name cannot. */
  const lehte = oy.lehte == null ? null : tamSayidanSayi(oy.lehte, 18);
  const aleyhte = oy.aleyhte == null ? null : tamSayidanSayi(oy.aleyhte, 18);
  const toplamAnlik = tamSayidanSayi(pr[7], 18);
  const bitis = Number(pr[5]) * 1000;
  const eta = Number(pr[6]) * 1000;

  const govde = el("div", { sinif: "yigin yigin--sik" });

  govde.append(el("p", { yazi: pr[3] || "(açıklama yok)" }));

  govde.append(el("div", { sinif: "izgara izgara--olcum" }, [
    /* A failed read is not zero votes. Printing 0 would tell someone
       deciding how to vote that a proposal has no support when the
       truth is that the count did not arrive. */
    olcum("Lehte", lehte == null ? "okunamadı" : jetonMiktar(lehte) + " FTHM",
      lehte != null && toplamAnlik > 0
        ? (lehte / toplamAnlik * 100).toFixed(2) + "% anlık toplamın" : null),
    olcum("Aleyhte", aleyhte == null ? "okunamadı" : jetonMiktar(aleyhte) + " FTHM", null),
    olcum("Anlık toplam", jetonMiktar(toplamAnlik) + " FTHM", "teklif açıldığındaki stake"),
    olcum("Oylama bitişi", new Date(bitis).toISOString().slice(0, 16).replace("T", " "),
      bitis > Date.now() ? gecenSure(bitis - Date.now()) + " kaldı" : "bitti"),
    eta > 0
      ? olcum("Uygulanabilir", new Date(eta).toISOString().slice(0, 16).replace("T", " "),
        eta > Date.now() ? gecenSure(eta - Date.now()) + " kaldı" : "şimdi")
      : null,
    olcum("Teklif eden", adres(pr[0]), null)
  ].filter(Boolean)));

  govde.append(el("div", { sinif: "satir satir--arali" }, [
    pr[1] && pr[1] !== SIFIR_ADRES
      ? el("span", { sinif: "yazi yazi--kucuk" }, ["Hedef: ", adres(pr[1])])
      : el("span", {
        sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "Sinyal teklifi — çağrı yok, uygulanması yalnızca işaretler"
      })
  ]));

  const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const eylemler = el("div", { sinif: "satir satir--arali" });

  /* Only the action the state actually allows. A disabled button with a
     tooltip would still be a button for something that cannot happen. */
  if (durumNo != null && Number(durumNo) === OYLAMADA) {
    if (!hesap) {
      eylemler.append(el("span", {
        sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "Oy vermek için cüzdanı bağla."
      }));
    } else if (oyVerdi) {
      eylemler.append(el("span", {
        sinif: "etiket etiket--bitti",
        yazi: "Oy kullandın"
      }));
    } else if (!gucu || gucu === 0) {
      eylemler.append(el("span", {
        sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "Oy gücün sıfır — oy gücü FTHM stake etmekten geliyor."
      }));
    } else {
      for (const [yazi, lehteMi, sinif] of [
        ["Lehte oy ver", true, "dugme dugme--marka"],
        ["Aleyhte oy ver", false, "dugme"]
      ]) {
        const b = el("button", { sinif, attr: { type: "button" }, yazi });
        const g = gonderici(cuzdan, b, durumSatiri);
        b.addEventListener("click", () =>
          g(cagriVerisi(ABI.governor, "castVote", [id, lehteMi]),
            lehteMi ? "Lehte oy" : "Aleyhte oy"));
        eylemler.append(b);
      }
      eylemler.append(el("span", {
        sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "Ağırlığın: " + jetonMiktar(gucu) + " FTHM"
      }));
    }
  } else if (durumNo != null && Number(durumNo) === KABUL) {
    const b = el("button", {
      sinif: "dugme dugme--marka", attr: { type: "button" },
      yazi: "Kuyruğa al"
    });
    const g = gonderici(cuzdan, b, durumSatiri);
    b.addEventListener("click", () => g(cagriVerisi(ABI.governor, "queue", [id]), "Kuyruğa alma"));
    if (hesap) eylemler.append(b);
    eylemler.append(el("span", {
      sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: hesap
        ? "Kuyruğa alındıktan sonra timelock başlar."
        : "Kuyruğa almak için cüzdanı bağla. Bunu herkes yapabilir."
    }));
  } else if (durumNo != null && Number(durumNo) === UYGULANABILIR) {
    const b = el("button", {
      sinif: "dugme dugme--marka", attr: { type: "button" },
      yazi: "Uygula"
    });
    const g = gonderici(cuzdan, b, durumSatiri);
    b.addEventListener("click", () => g(cagriVerisi(ABI.governor, "execute", [id]), "Uygulama"));
    if (hesap) eylemler.append(b);
    eylemler.append(el("span", {
      sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: hesap
        ? "Uygulamak herkese açık — teklifi geçiren kişi olmak gerekmiyor."
        : "Uygulamak için cüzdanı bağla. Bunu herkes yapabilir."
    }));
  }

  if (eylemler.childNodes.length) govde.append(eylemler);
  govde.append(durumSatiri);

  const bas = el("div", { sinif: "satir satir--arali" }, [
    el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "#" + id }),
    d ? el("span", { sinif: "etiket " + d.sinif, yazi: d.ad }) : null
  ].filter(Boolean));

  return panel("Teklif #" + id, govde, bas);
}

/* ---- the screen ------------------------------------------------------ */

export async function ciz({ cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  const hesap = cuzdan.hesap();
  kap.append(sayfaUst(
    "Teklifler ve oylama",
    "Canlı Governor — her düğme zincire gerçek bir işlem gönderir"
  ));

  /* ---- parameters and the caller's standing --------------------- */
  /* MIN_OY_GUCU IS ON THE STAKE, NOT THE GOVERNOR
       Reading it from the Governor returned nothing on this stack, which
       would have made the proposal threshold collapse to the percentage
       alone — lower than the contract enforces, shown to someone
       deciding whether they can propose. */
  const temelAdlar = ["proposalCount", "PROPOSAL_THRESHOLD_BPS", "QUORUM_BPS"];
  const temel = await cokluCagri(temelAdlar.map((ad) => ({
    method: "eth_call",
    params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, ad) }, "latest"]
  })));
  const P = {};
  temelAdlar.forEach((ad, i) => {
    P[ad] = temel[i] == null ? null : tekli(ABI.governor, ad, temel[i]);
  });

  if (P.proposalCount == null) {
    kap.append(hata(
      "Yönetişim okunamadı",
      "Governor " + YONETISIM.governor + " adresinde ama `proposalCount()` " +
      "cevap vermedi. Ekran uydurma bir durum göstermiyor."
    ));
    return kap;
  }

  const stakeToplam = await oku(YONETISIM.staking, ABI.staking, "totalStaked");
  const toplam = stakeToplam == null ? null : tamSayidanSayi(stakeToplam, 18);
  const asgariHam = await oku(YONETISIM.staking, ABI.staking, "MIN_OY_GUCU");
  const asgari = asgariHam == null ? null : tamSayidanSayi(asgariHam, 18);
  const esik = toplam == null || asgari == null
    ? null
    : Math.max(toplam * Number(P.PROPOSAL_THRESHOLD_BPS) / 10_000, asgari);

  let gucu = null;
  if (hesap) {
    const g = await oku(YONETISIM.staking, ABI.staking, "oyGucu", [hesap]);
    gucu = g == null ? null : tamSayidanSayi(g, 18);
  }

  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Teklif sayısı", String(Number(P.proposalCount)), "bugüne kadar"),
    olcum("Teklif eşiği", esik == null ? "—" : jetonMiktar(esik) + " FTHM",
      "stake oranı ile asgarinin büyüğü"),
    olcum("Senin oy gücün",
      hesap ? (gucu == null ? "—" : jetonMiktar(gucu) + " FTHM") : "cüzdan bağlı değil",
      hesap ? "stake edilmiş FTHM" : null)
  ]));

  /* ---- the form, and only if it can succeed --------------------- */
  if (!hesap) {
    kap.append(panel("Teklif ver", bos(
      "Cüzdan bağlı değil",
      "Teklif vermek ve oy kullanmak için cüzdanı bağla. Sayfa kendi " +
      "başına hiçbir şey göndermez.",
      el("button", {
        sinif: "dugme dugme--marka", attr: { type: "button" },
        yazi: "Cüzdan bağla",
        on: { click: () => document.getElementById("cuzdan-dugme").click() }
      })
    )));
  } else if (!cuzdan.zincirdeMi()) {
    kap.append(panel("Teklif ver", bos(
      "Cüzdan Arc ağında değil",
      "Governor Arc üzerinde. Ağı değiştirmen gerekiyor.",
      el("button", {
        sinif: "dugme dugme--marka", attr: { type: "button" },
        yazi: "Arc ağına geç",
        on: { click: () => cuzdan.arcaGec().catch(() => {}) }
      })
    )));
  } else if (gucu == null || esik == null) {
    kap.append(panel("Teklif ver", not(
      "Oy gücü okunamadı, o yüzden teklif formu basılmıyor: geçersiz bir " +
      "işlemi zincire gönderip gazını ödetmek yerine durulması daha doğru.",
      "uyari"
    )));
  } else if (gucu < esik) {
    /* The measured state today: nothing is staked, so this is everyone. */
    kap.append(panel("Teklif ver", not(
      "Oy gücün " + jetonMiktar(gucu) + " FTHM, teklif eşiği " +
      jetonMiktar(esik) + " FTHM. Form basılmıyor çünkü gönderilen işlem " +
      "zincirde reddedilirdi — düğmeyi gösterip gazını ödetmek bilgi değil, " +
      "maliyet olurdu." +
      (toplam === 0
        ? " Şu an HİÇ FTHM stake edilmemiş, yani bu herkes için geçerli: " +
          "DAO dağıtılmış ve çalışıyor, eksik olan stake."
        : ""),
      "uyari"
    )));
  } else {
    /* ODEME TEKLIFI ONCE, SERBEST FORM SONRA
         DAO nun tek yetkisi DevPool dan odeme yapmak, yani teklif
         verenlerin neredeyse tamamı bunu yapacak. Serbest formu one
         koymak, herkesi pay() cagrisini elle ABI-kodlamaya davet etmek
         olurdu — mekanizma var ama kullanilamaz olurdu. */
    let havuzBakiye = null;
    if (canli(PULSE.devPool)) {
      try {
        havuzBakiye = await oku(EKONOMI.quote, ABI.erc20, "balanceOf",
          [PULSE.devPool]);
      } catch (e) { havuzBakiye = null; }
    }
    kap.append(panel("Geliştiriciye ödeme teklifi",
      odemeTeklifi(cuzdan, havuzBakiye)));
    kap.append(panel("Serbest teklif — ileri seviye", teklifFormu(cuzdan)));
  }

  /* ---- what a proposal may ask for ----------------------------- */
  kap.append(panel("Neye karar verilebilir", el("div", { sinif: "yigin yigin--sik" }, [
    el("ul", { sinif: "liste liste--isaretli" },
      DAO_YETKI.yapabilir.map((x) => el("li", {}, [
        el("strong", { yazi: x.ne }),
        el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "  " + x.nerede })
      ]))),
    not(
      "Bunun dışındaki bir teklif de VERİLEBİLİR — Governor'ın imzası her " +
      "çağrıyı ifade eder. Ama hedef sözleşmelerde çekilecek bir kol " +
      "olmadığı için geçse bile çağrı döner. Ayrıntı Platform DAO ekranında.",
      "bilgi"
    )
  ])));

  /* ---- the proposals ------------------------------------------- */
  const sayi = Number(P.proposalCount);
  if (sayi === 0) {
    kap.append(panel("Teklifler", bos(
      "Henüz hiç teklif yok",
      "Governor sıfır teklif kaydetmiş. Bu bir hata değil: sözleşme " +
      "dağıtılmış ve cevap veriyor, kimse henüz teklif vermedi."
    )));
    return kap;
  }

  const idler = [];
  for (let i = sayi; i >= 1; i--) idler.push(i);

  const istekler = idler.flatMap((id) => {
    const temelIki = [
      { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "proposals", [id]) }, "latest"] },
      { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "state", [id]) }, "latest"] },
      { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "forVotesOf", [id]) }, "latest"] },
      { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "againstVotesOf", [id]) }, "latest"] }
    ];
    if (hesap) {
      temelIki.push({
        method: "eth_call",
        params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "hasVoted", [id, hesap]) }, "latest"]
      });
    }
    return temelIki;
  });
  const adim = hesap ? 5 : 4;
  const ham = await cokluCagri(istekler);

  const liste = el("div", { sinif: "yigin" });
  idler.forEach((id, k) => {
    const pr = ham[k * adim] == null ? null : sonucCoz(ABI.governor, "proposals", ham[k * adim]);
    const dr = ham[k * adim + 1] == null ? null : tekli(ABI.governor, "state", ham[k * adim + 1]);
    const oy = {
      lehte: ham[k * adim + 2] == null
        ? null : tekli(ABI.governor, "forVotesOf", ham[k * adim + 2]),
      aleyhte: ham[k * adim + 3] == null
        ? null : tekli(ABI.governor, "againstVotesOf", ham[k * adim + 3])
    };
    const ov = hesap && ham[k * adim + 4] != null
      ? tekli(ABI.governor, "hasVoted", ham[k * adim + 4])
      : false;
    if (!pr) {
      liste.append(panel("Teklif #" + id, not(
        "Bu teklif okunamadı. Uydurma bir içerik göstermek yerine " +
        "boş bırakıldı.", "uyari"
      )));
      return;
    }
    liste.append(teklifKarti(id, pr, dr, hesap, ov, gucu, cuzdan, oy));
  });

  kap.append(liste);
  return kap;
}
