/* ===========================================================================
 * gorunum/dao.js — Platform DAO
 *
 * NEDEN BU EKRAN GERÇEK
 *   Şartname açık: *"Sadece görsel DAO ekranı yapma. Gerçek oylama ve teklif
 *   mekanizması oluştur."* Bu ekran uydurulmuş bir yönetişim göstermiyor —
 *   zincirde CANLI olan Governor'ı okuyor. Her sayı bir `eth_call`, her
 *   düğme bir işlem.
 *
 *   Platformun geri kalanı dağıtılmadığı için boş durum gösteriyor; DAO ise
 *   dağıtılmış durumda ve hiç kullanılmamış. `proposalCount()` sıfır ve
 *   ekran bunu bir hata gibi değil, olduğu gibi söylüyor: mekanizma var,
 *   kimse henüz teklif vermedi.
 *
 * DAO'NUN NEYE DOKUNABİLDİĞİ BİR TASARIM SORUSU DEĞİL, BİR ÖLÇÜM
 *   `yol.js` bir süre "DAO'nun yetki kümesi henüz cevaplanmadı" diyordu ve
 *   haklıydı. Cevap ölçülerek verildi: `scripts/denetim-dao-erisimi.js`
 *   teminat kasalarını, defteri, ücret tablosunu, eğriyi ve kilitli
 *   likiditeyi tek tek okuyup hiçbirinde yetkili rol ve ayarlayıcı
 *   olmadığını savlıyor. Yani kısıt DAO'nun nazik davranmasına değil, karşı
 *   tarafta çekilecek bir kol olmamasına dayanıyor.
 *
 *   Governor'a bir beyaz liste koymak daha gösterişli görünür ve daha zayıf
 *   olurdu: o liste değiştirilebilir bir durumdur ve onu değiştiren teklif de
 *   bir tekliftir.
 *
 * SÜRELER SANİYE
 *   `Governor.state()` `block.timestamp` ile karşılaştırıyor ve `end`,
 *   `block.timestamp + VOTING_PERIOD`. Bunları blok sayısı sanıp Arc'ın
 *   ölçülmüş 0,507 s/blok değeriyle çevirmek 5 günü 2,54 gün gösterdi — bir
 *   kez. Burada saniye olarak okunuyor.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres, hata } from "../ui.js";
import { oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";
import { YONETISIM, DAO_YETKI } from "../adresler.js";
import { jetonMiktar, tamSayidanSayi, gecenSure } from "../bicim.js";

/* bicim.js `yuzde` prefixes a plus sign, which is right for a change and
   wrong for a parameter: a quorum of "+10.00%" reads as a quorum that
   went up. These are settings, so they are formatted plainly. */
const oran = (bps) => (Number(bps) / 100).toFixed(2) + "%";

/* Governor.State, in order. A number nobody can read is a number that
   invites a guess. */
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

function sureYaz(saniye) {
  const s = Number(saniye);
  if (!isFinite(s) || s <= 0) return "—";
  if (s % 86400 === 0) return s / 86400 + " gün";
  if (s >= 86400) return (s / 86400).toFixed(2) + " gün";
  if (s >= 3600) return (s / 3600).toFixed(1) + " saat";
  return s + " sn";
}

/* ---- the live parameters, read in one batch -------------------------- */

async function parametreler() {
  const g = YONETISIM.governor;
  /* MIN_OY_GUCU AND staking() ARE NOT ON THIS GOVERNOR
       Both were read from the Governor here. On DepthGovernor the floor
       lives on the Stake and the getter is stake(), so these two calls
       returned nothing and the screen would have printed "—" for a
       number that exists one contract over. */
  const adlar = [
    "proposalCount", "PROPOSAL_THRESHOLD_BPS", "QUORUM_BPS",
    "VOTING_PERIOD", "TIMELOCK", "GRACE_PERIOD",
    "guardianActive", "guardianExpiry", "guardian", "stake"
  ];
  const sonuclar = await cokluCagri(adlar.map((ad) => ({
    method: "eth_call",
    params: [{ to: g, data: cagriVerisi(ABI.governor, ad) }, "latest"]
  })));

  /* The proposal floor, from the contract that actually holds it. */
  const taban = await cokluCagri([{
    method: "eth_call",
    params: [{ to: YONETISIM.staking,
      data: cagriVerisi(ABI.staking, "MIN_OY_GUCU") }, "latest"]
  }]);

  /* sonucCoz returns the whole decode Result. `oku()` unwraps a single
     value before handing it back; a raw sonucCoz does not, so Number()
     on a one-element Result is NaN and every parameter would render as
     an em dash. Unwrapped here, once. */
  const cikti = {};
  adlar.forEach((ad, i) => {
    const r = sonuclar[i];
    const c = r == null ? null : sonucCoz(ABI.governor, ad, r);
    cikti[ad] = c && c.length === 1 ? c[0] : c;
  });
  const t = taban[0] == null
    ? null : sonucCoz(ABI.staking, "MIN_OY_GUCU", taban[0]);
  cikti.MIN_OY_GUCU = t && t.length === 1 ? t[0] : t;
  return cikti;
}

/* The concentration line, as a function so the wording lives in one
   place and cannot drift between the empty and the active case. */
function gucVgovde(kap, kurucuPay, yuzde, toplam) {
  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Kurucuda stake", jetonMiktar(kurucuPay) + " FTHM",
      "açılışı mümkün kılan taban"),
    olcum("Oy gücünün payı", yuzde.toFixed(1) + "%",
      "tek adreste duran kısım")
  ]));
  if (yuzde > 50) {
    kap.append(not(
      "Oy gücünün %" + yuzde.toFixed(1) + "'i tek adreste. Bu haliyle " +
      "DAO tek adresli: teklif eşiğini de kotayı da o adres yalnız " +
      "geçebilir. Kararları yavaşlatan şey oy dağılımı değil, 5 günlük oy " +
      "süresi, 2 günlük timelock ve 2027'ye kadar yalnızca İPTAL edebilen " +
      "guardian. DAO'nun tek yetkisi geliştirici havuzundan ödeme yapmak; " +
      "teminat, kilitli likidite, ücretler ve açılış fiyatı erişilemez.",
      "uyari"
    ));
  } else {
    kap.append(not(
      "Oy gücünün %" + yuzde.toFixed(1) + "'i kurucuda, kalanı başka " +
      "adreslerde. Stake arttıkça bu pay erir.",
      "bilgi"
    ));
  }
}

/* ---- the screen ------------------------------------------------------ */

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst(
    "Platform DAO",
    "Zincirde canlı yönetişim — teklif, oy, timelock ve uygulama"
  ));

  let p;
  try {
    p = await parametreler();
  } catch (e) {
    kap.append(hata(
      "Yönetişim okunamadı",
      "Governor " + YONETISIM.governor + " adresinde ve okunamadı: " + e.message
    ));
    return kap;
  }

  if (p.proposalCount == null) {
    kap.append(hata(
      "Yönetişim cevap vermiyor",
      "Governor adresi " + YONETISIM.governor + " ama `proposalCount()` " +
      "okunamadı. Ekran uydurma bir durum göstermek yerine duruyor."
    ));
    return kap;
  }

  /* ---- 1. what this DAO actually is ------------------------------- */

  const sayi = Number(p.proposalCount);

  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Teklif eşiği", oran(p.PROPOSAL_THRESHOLD_BPS), "stake edilmiş arzın"),
    olcum("Kota", oran(p.QUORUM_BPS), "teklif açıldığındaki stake toplamına göre"),
    olcum("Oy süresi", sureYaz(p.VOTING_PERIOD), "saniye, blok değil"),
    olcum("Timelock", sureYaz(p.TIMELOCK), "kabulden uygulamaya"),
    olcum("Uygulama penceresi", sureYaz(p.GRACE_PERIOD), "sonra süresi geçer"),
    /* FTHM, not ALP. Governance moved; a screen still saying ALP would
       be naming a token that no longer decides anything. */
    olcum("Asgari oy gücü", p.MIN_OY_GUCU == null
      ? "okunamadı"
      : jetonMiktar(tamSayidanSayi(p.MIN_OY_GUCU, 18)) + " FTHM",
      "teklif verebilmek için")
  ]));

  kap.append(not(
    "Bu DAO zincirde canlı ve bugüne kadar " + sayi + " teklif aldı. " +
    (sayi === 0
      ? "Sıfır olması bir kusur değil: mekanizma duruyor, kimse henüz " +
        "teklif vermedi."
      : ""),
    sayi === 0 ? "bilgi" : ""
  ));

  /* ---- 2. the guardian, named rather than hidden ------------------- */

  if (p.guardianActive === true) {
    const bitis = Number(p.guardianExpiry) * 1000;
    kap.append(panel("Guardian", el("div", { sinif: "yigin yigin--sik" }, [
      el("p", {
        sinif: "yazi yazi--sessiz",
        yazi: "Guardian bir tekliği İPTAL edebilir, başka hiçbir şey yapamaz: " +
          "teklif veremez, oy ağırlığı yoktur, bir teklifi geçiremez ve bir " +
          "parayı yönlendiremez. Yetkisi tek yönlü ve süreli."
      }),
      el("div", { sinif: "izgara izgara--olcum" }, [
        olcum("Adres", adres(p.guardian), "iptal yetkisi"),
        olcum("Bitiş", new Date(bitis).toISOString().slice(0, 10),
          bitis > Date.now()
            ? gecenSure(bitis - Date.now()) + " kaldı"
            : "süresi doldu"),
        olcum("Durum", bitis > Date.now() ? "Aktif" : "Sona erdi",
          "renounce() ile erken bırakılabilir")
      ])
    ])));
  }

  /* ---- 3. voting power, which is staked and not held --------------- */

  let stakeToplam = null;
  try {
    stakeToplam = await oku(YONETISIM.staking, ABI.staking, "totalStaked");
  } catch (e) { /* reported below */ }

  const gucGovde = el("div", { sinif: "yigin yigin--sik" });
  gucGovde.append(el("p", {
    sinif: "yazi yazi--sessiz",
    yazi: "Oy gücü FTHM tutmaktan değil STAKE etmekten geliyor, ve bir teklif " +
      "açıldığında toplamın anlık görüntüsü alınıyor. Yani kota, o anda var " +
      "olan stake'e göre ölçülüyor — oylamanın ortasında şişirilebilen bir " +
      "toplama göre değil."
  }));
  /* HOW MUCH OF THE VOTING POWER IS IN ONE PLACE
       The total alone can read as healthy when it is one wallet. The set
       of stakers cannot be enumerated from a getter, but the founder
       allocation can be looked up directly, and that is the share that
       decides whether this is a DAO or one address with a five day delay.

       Activation is deliberately the floor — 50.000 FTHM of a 50.066.437
       balance — so this number starts honest and falls as others stake.
       Printing the total without it would have been the comfortable
       version of the same data. */
  let kurucuStake = null;
  try {
    kurucuStake = await oku(YONETISIM.staking, ABI.staking,
      "stakedOf", [YONETISIM.kurucu]);
  } catch (e) { kurucuStake = null; }

  if (stakeToplam == null) {
    gucGovde.append(not("Stake sözleşmesi okunamadı: " + YONETISIM.staking, "uyari"));
  } else {
    const t = tamSayidanSayi(stakeToplam, 18);
    /* The floor comes from a second contract now, so it can be missing
       on its own. Treating a failed read as zero would quietly lower the
       threshold on screen. */
    const asgari = p.MIN_OY_GUCU == null
      ? null : tamSayidanSayi(p.MIN_OY_GUCU, 18);
    const esik = asgari == null
      ? null : Math.max(t * Number(p.PROPOSAL_THRESHOLD_BPS) / 10_000, asgari);
    gucGovde.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Toplam stake", jetonMiktar(t) + " FTHM", "oy gücünün tamamı"),
      olcum("Kota eşiği",
        jetonMiktar(t * Number(p.QUORUM_BPS) / 10_000) + " FTHM",
        "bir teklifin geçmesi için gereken LEHTE oy"),
      olcum("Teklif eşiği", esik == null ? "okunamadı" : jetonMiktar(esik) + " FTHM",
        "stake oranı ile asgarinin büyüğü")
    ]));

    /* THE STATE NOBODY WOULD GUESS FROM THE PARAMETERS.

       Measured on chain: totalStaked is 0. So every address has zero
       voting power, and MIN_OY_GUCU is a floor nobody
       clears. The DAO is deployed, answering, and cannot be used by
       anyone until somebody stakes.

       That floor is also what stops a zero-stake takeover: with nothing
       staked the percentage threshold resolves to zero and the quorum
       does too, so a single wei of stake would otherwise be able to
       propose AND pass. The absolute minimum is what makes the empty
       state safe rather than wide open.

       Saying this plainly rather than rendering a proposal form that
       cannot succeed: the brief forbids presenting a feature that does
       not work as a live control. */
    if (t > 0 && kurucuStake != null) {
      const k = tamSayidanSayi(kurucuStake, 18);
      const pay = t > 0 ? (k / t) * 100 : 0;
      gucVgovde(gucGovde, k, pay, t);
    }

    if (t === 0 && asgari != null) {
      gucGovde.append(not(
        "Hiç FTHM stake edilmemiş, yani şu an hiç kimsenin oy gücü yok ve " +
        "kimse teklif veremez: asgari " + jetonMiktar(asgari) + " FTHM ve " +
        "herkesin gücü sıfır. DAO dağıtılmış ve cevap veriyor; eksik olan " +
        "stake.",
        "uyari"
      ));
      gucGovde.append(not(
        "Bu asgari aynı zamanda boş durumu güvenli tutan şey: stake sıfırken " +
        "yüzde eşiği de kota da sıfıra iniyor, yani mutlak bir taban olmasa " +
        "tek bir wei stake hem teklif verip hem geçirebilirdi.",
        "bilgi"
      ));
    }
  }
  kap.append(panel("Oy gücü", gucGovde));

  /* ---- 4. the permitted set, as measured --------------------------- */

  const yetkiGovde = el("div", { sinif: "yigin yigin--sik" });
  yetkiGovde.append(el("p", {
    sinif: "yazi yazi--sessiz",
    yazi: "Governor'ın teklif imzası propose(string, address, bytes) — yani " +
      "bir teklif herhangi bir adrese herhangi bir çağrıyı İFADE edebilir. " +
      "Onu tutan şey Governor'ın içindeki bir liste değil, hedef " +
      "sözleşmelerde çekilecek bir kol olmaması. İfade edilebilir olmak " +
      "geçerli olmak değildir: yetkisi olmayan bir çağrı döner."
  }));

  const iki = el("div", { sinif: "izgara izgara--iki" });

  const yapabilir = el("ul", { sinif: "liste liste--isaretli" });
  for (const x of DAO_YETKI.yapabilir) {
    yapabilir.append(el("li", {}, [
      el("strong", { yazi: x.ne }),
      el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "  " + x.nerede })
    ]));
  }
  iki.append(panel("Karar verebilir", yapabilir));

  const yapamaz = el("ul", { sinif: "liste liste--capraz" });
  for (const x of DAO_YETKI.yapamaz) {
    yapamaz.append(el("li", {}, [
      el("strong", { yazi: x.ne }),
      el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "  " + x.neden })
    ]));
  }
  iki.append(panel("Dokunamaz", yapamaz));
  yetkiGovde.append(iki);

  yetkiGovde.append(not(
    "Bu ayrım bir politika değil, bir ölçüm: scripts/denetim-dao-erisimi.js " +
    "o altı sözleşmeyi tek tek okuyup hiçbirinde yetkili rol ve ayarlayıcı " +
    "olmadığını savlıyor. Birisi bir kasaya ayarlayıcı eklerse o denetim " +
    "kırmızı yanar.",
    "bilgi"
  ));

  /* The residual risk inside the permitted set. Stated, not buried. */
  yetkiGovde.append(not(DAO_YETKI.artikRisk, "uyari"));

  kap.append(panel("DAO neye karar verebilir", yetkiGovde));

  /* ---- 5. the proposals themselves -------------------------------- */

  if (sayi === 0) {
    kap.append(panel("Teklifler", bos(
      "Henüz teklif yok",
      "Governor " + sayi + " teklif kaydetmiş. Teklif vermek ve oy kullanmak " +
      "için Teklifler ve Oylama ekranına geçin — oradaki her düğme zincire " +
      "gerçek bir işlem gönderir.",
      el("a", {
        sinif: "dugme dugme--marka",
        attr: { href: "#/teklifler" },
        yazi: "Teklifler ve Oylama"
      })
    )));
    return kap;
  }

  /* Newest first, and at most the last ten here — the full list and the
     voting controls live on the proposals screen. */
  const basla = Math.max(1, sayi - 9);
  const idler = [];
  for (let i = sayi; i >= basla; i--) idler.push(i);

  const ham = await cokluCagri(idler.flatMap((id) => ([
    { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "proposals", [id]) }, "latest"] },
    { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "state", [id]) }, "latest"] },
    { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "forVotesOf", [id]) }, "latest"] },
    { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "againstVotesOf", [id]) }, "latest"] }
  ])));
  const tek = (ad, r) => {
    if (r == null) return null;
    const c = sonucCoz(ABI.governor, ad, r);
    return c && c.length === 1 ? c[0] : c;
  };
  const oylar = idler.map((_, k) => ({
    lehte: tek("forVotesOf", ham[k * 4 + 2]),
    aleyhte: tek("againstVotesOf", ham[k * 4 + 3])
  }));

  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "#" }),
    el("th", { yazi: "Açıklama" }),
    el("th", { yazi: "Durum" }),
    el("th", { yazi: "Lehte" }),
    el("th", { yazi: "Aleyhte" }),
    el("th", { yazi: "Hedef" })
  ])]));
  const govde = el("tbody");

  idler.forEach((id, k) => {
    const pr = ham[k * 4] == null ? null : sonucCoz(ABI.governor, "proposals", ham[k * 4]);
    const dr = ham[k * 4 + 1] == null ? null : sonucCoz(ABI.governor, "state", ham[k * 4 + 1]);
    if (!pr) return;

    const d = dr == null ? null : DURUM[Number(dr)];
    /* BY NAME, BECAUSE THE INDEX MOVED
         DepthGovernor's Proposal has a sixth uint — snapshotTotal —
         sitting where forVotes used to be. pr[7] on this governor is
         the staked supply at the snapshot, so the old indices would
         have shown an unsupported proposal as unanimously backed.
         forVotesOf/againstVotesOf cannot drift by one. */
    const lehte = oylar[k] && oylar[k].lehte != null
      ? tamSayidanSayi(oylar[k].lehte, 18) : null;
    const aleyhte = oylar[k] && oylar[k].aleyhte != null
      ? tamSayidanSayi(oylar[k].aleyhte, 18) : null;

    govde.append(el("tr", {}, [
      el("td", { yazi: String(id) }),
      el("td", {}, [
        el("div", { yazi: pr[3] || "(açıklama yok)" }),
        el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" }, [adres(pr[0])])
      ]),
      el("td", {}, [d
        ? el("span", { sinif: "etiket " + d.sinif, yazi: d.ad })
        : el("span", { sinif: "yazi yazi--sessiz", yazi: "okunamadı" })]),
      el("td", { yazi: lehte == null ? "okunamadı" : jetonMiktar(lehte) }),
      el("td", { yazi: aleyhte == null ? "okunamadı" : jetonMiktar(aleyhte) }),
      el("td", {}, [
        /* A zero target is a signal proposal: a question put on the record
           with no call behind it. Those still vote and still pass, and
           executing one only marks it. Saying "—" would hide the
           difference between that and a proposal that moves money. */
        pr[1] && pr[1] !== "0x0000000000000000000000000000000000000000"
          ? adres(pr[1])
          : el("span", { sinif: "yazi yazi--sessiz", yazi: "sinyal (çağrı yok)" })
      ])
    ]));
  });

  tablo.append(govde);
  kap.append(panel("Son teklifler", tablo, el("a", {
    sinif: "dugme dugme--sessiz",
    attr: { href: "#/teklifler" },
    yazi: "Hepsi ve oylama"
  }), true));

  return kap;
}
