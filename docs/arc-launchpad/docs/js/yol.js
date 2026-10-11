/* ===========================================================================
 * yol.js — the module registry: what exists, where it lives, and what is
 *          actually behind it
 *
 * Every module in the platform is declared here once, with a `durum` that
 * the router enforces:
 *
 *   "canli"   — there is a contract or a public data source behind this and
 *               the view reads it. Real numbers or an honest empty state.
 *   "dagitim" — the code exists and is tested, but the contract is not
 *               deployed yet. The view explains that and offers no button
 *               that cannot act.
 *   "yapim"   — not built. The route exists so the architecture is visible,
 *               and the view says plainly what is missing and what has to
 *               be true before it can work.
 *
 * WHY DECLARE THE UNBUILT ONES AT ALL
 *   Because the shape of the product is a decision, and hiding the modules
 *   that are not finished makes the finished ones look like the whole plan.
 *   What is NOT acceptable is a route that looks finished and is not — so
 *   `durum` is not decoration: ana.js refuses to render a "yapim" module's
 *   controls, and the rail marks it before anybody clicks.
 *
 *   The brief's rule, kept literally: no fake price, chart, volume or
 *   holder data; nothing that does not work offered as an active button.
 * =========================================================================== */

export const GRUPLAR = [
  { anahtar: "piyasa", ad: "Piyasa" },
  { anahtar: "varlik", ad: "Varlıklarım" },
  { anahtar: "yonetisim", ad: "Yönetişim" },
  { anahtar: "guven", ad: "Güven" }
];

export const YOLLAR = [
  /* ---- market ----------------------------------------------------- */
  {
    yol: "kesfet",
    ad: "Keşfet",
    kisa: "Keşfet",
    grup: "piyasa",
    ikon: "pusula",
    durum: "canli",
    ozet: "Trend, yeni çıkan, en yüksek hacim, en çok yükselen ve yeni mezun olan tokenler.",
    /* Reads the launchpad registry for the token list and the PoolManager
       for prices. With no launchpad deployed the list is genuinely empty,
       and that is what it shows. */
    kaynak: "launchpad kaydı + Uniswap v4 havuzları",
    sekme: true
  },
  {
    yol: "olustur",
    ad: "Token Oluştur",
    kisa: "Oluştur",
    grup: "piyasa",
    ikon: "arti",
    /* CANLI, VE BU DA OLCULDU
         This said "dagitim" — deployment pending — while PulseLaunchpad
         was live, the form had a working submit and the page audit
         confirmed the address against the on-chain record. A working
         feature marked as not-yet-deployed is the same defect as a dead
         one marked live, pointed the other way: it tells a founder the
         thing they came for does not exist yet.

         kaynak also still named EgriLaunchpad, which is retired. */
    durum: "canli",
    ozet: "İsim, sembol, teminat varlığı, vergi oranı ve kurucu ilk alımı.",
    kaynak: "PulseLaunchpad.launch()",
    /* The form is real and the payment breakdown is computed from the
       contract's own constants, so it can be filled in and checked. It
       cannot be SUBMITTED until the launchpad exists. */
    gerekli: "EgriLaunchpad ve EgriHook dağıtılmalı; kanca adresi 0xa44 ile bitecek şekilde kazılmalı",
    sekme: true
  },
  {
    yol: "terminal",
    ad: "İşlem Terminali",
    kisa: "İşlem",
    grup: "piyasa",
    ikon: "mum",
    durum: "canli",
    ozet: "Mum grafiği, işlem geçmişi, al/sat paneli, holder dağılımı, teminat rezervi ve geri alım geçmişi.",
    kaynak: "v4 Swap olayları + KopruKasasi + PulseHook olayları",
    sekme: true,
    gizliRay: true          /* reached from a token, not from the rail */
  },
  {
    yol: "teminat",
    ad: "Teminat Seçimi",
    grup: "piyasa",
    ikon: "kasa",
    /* CANLI. Onerilen 50 olcumden uretildi; CA alani ise canli olarak yedi
       zincirde en derin USDC havuzunu ariyor. Hicbiri dagitim beklemiyor:
       okunan sey Uniswap, bizim sozlesmelerimiz degil. */
    durum: "canli",
    ozet: "Önerilen 50 varlık ya da kendi kontrat adresin — ikisi de aynı kontrolden geçer."
  },
  {
    yol: "kasalar",
    ad: "Teminat Kasaları",
    grup: "piyasa",
    ikon: "kalkan",
    durum: "canli",
    ozet: "Her tokenin rezervi, token başına hakkı, tabanın devreye girdiği fiyat ve geri alım geçmişi.",
    kaynak: "KopruKasasi.hak() / bakiye() / dolasim()"
  },
  {
    yol: "analitik",
    ad: "Platform Analitiği",
    grup: "piyasa",
    ikon: "grafik",
    durum: "yapim",
    ozet: "Toplam hacim, launch sayısı, toplanan ücretler, rezervlerin toplam büyüklüğü.",
    gerekli: "Olay indeksleyici. Bu sayılar zincirde tek bir çağrıyla okunamıyor; Swap ve ücret olaylarını blok blok toplayan bir servis gerekiyor ve o servis henüz yok.",
    eksik: [
      "EgriHook'un ParaUcreti ve TokenUcreti olaylarını toplayan indeksleyici",
      "Zaman serisi deposu (toplamları her istekte yeniden hesaplamak RPC kotasını bitirir)"
    ]
  },

  /* ---- holdings --------------------------------------------------- */
  {
    yol: "portfoy",
    ad: "Portföy",
    kisa: "Portföy",
    grup: "varlik",
    ikon: "cuzdan",
    durum: "canli",
    ozet: "Bağlı cüzdanın token bakiyeleri ve her birinin teminat hakkı.",
    kaynak: "balanceOf + KopruKasasi.hak()",
    sekme: true
  },
  {
    yol: "kar-zarar",
    ad: "Kâr / Zarar",
    grup: "varlik",
    ikon: "terazi",
    durum: "yapim",
    ozet: "Pozisyon maliyeti, gerçekleşen ve gerçekleşmeyen kâr/zarar.",
    gerekli: "Maliyet esası, cüzdanın geçmiş işlemlerinden çıkarılmak zorunda. Bu, indeksleyici olmadan yapılamaz — ve tahmine dayalı bir maliyet göstermek, yanlış bir kâr göstermek demektir.",
    eksik: [
      "Cüzdan bazlı Swap olayı indeksleyici",
      "Transferle gelen tokenin maliyetini nasıl sayacağımıza dair karar (hediye mi, alım mı)"
    ]
  },
  /* HOLDER ODULLERI KALDIRILDI — ve iki ayri yanlis beyandi
       Kullanici holder odulunu iptal etti ("Holder ödülü vermicez"), ama
       bu modul durum "dagitim" ile duruyordu: yani iptal edilmis bir
       ozellik "yolda" olarak gosteriliyordu.

       Ikinci ve daha kotusu, ozeti su diyordu: "Her islemin %0,30'u token
       sahiplerine dagitiliyor." O dilim artik GELISTIRICI HAVUZUNA
       gidiyor ve DevPool'dan yalnizca FTHM DAO'su cikarabiliyor. Yani
       sayfa, paranin nereye gittigi hakkinda yanlis sey soyluyordu.

       Modul kaldirildi; gorunum dosyasi da silindi, cunku birakilan bir
       gorunum bir sonraki yonlendirici duzenlemesinde geri baglanabilir. */

  /* ---- developer ecosystem ---------------------------------------- */
  {
    yol: "pazar",
    ad: "Geliştirici Pazarı",
    kisa: "Pazar",
    grup: "piyasa",
    ikon: "terazi",
    /* CANLI: Pazar Arc ana aginda ve bu ekran onu okuyor. Urun sayisi,
       ucret orani ve gelir defteri dogrudan sozlesmeden geliyor; sifirlar
       gercek. */
    durum: "canli",
    ozet: "Dış geliştiricilerin ürünleri; ödeme USDC, hasılatın %80'i geliştiriciye.",
    kaynak: "Pazar.urunler() / ortalamaPuan() / lisans() / platformKazanci()"
  },
  {
    yol: "gelistirici",
    ad: "Geliştirici Portalı",
    kisa: "Geliştirici",
    grup: "varlik",
    ikon: "dis",
    /* Live: the developer-pool half reads the deployed DevPool and the
       deployed FTHM stake today, and tells the truth about why that
       money cannot move yet. Only the marketplace half is pending. */
    durum: "canli",
    ozet: "İki kazanç yolu: pazarda ürün satmak ve geliştirici havuzundan DAO kararıyla ödeme.",
    kaynak: "DevPool bakiyesi + Stake.totalStaked() + Pazar defteri"
  },

  /* ---- governance -------------------------------------------------- */
  {
    yol: "dao",
    ad: "Platform DAO",
    grup: "yonetisim",
    ikon: "meclis",
    /* CANLI. Bu kayıt uzun süre "yapim" idi ve gerekçesi doğruydu: DAO'nun
       NEYE karar verebileceği cevaplanmadan ekran yapmak, hiçbir şeye
       bağlanmayan bir form olurdu.

       İki şey değişti ve ikisi de ölçüm:

       1. Yönetişim sözleşmesi YAZILMAMIŞ değil, DAĞITILMIŞ.
          0x20d2E53172D2BD4b010E90fa6ce8f09972343CeB üzerinde propose,
          castVote, queue, execute, timelock, kota ve guardian var ve
          hepsi cevap veriyor. proposalCount() sıfır — hiç kullanılmamış,
          bozuk değil.

       2. Yetki kümesi artık bir tasarım sorusu değil, bir ölçüm:
          scripts/denetim-dao-erisimi.js teminat kasalarını, defteri,
          ücret tablosunu, eğriyi ve kilitli likiditeyi tek tek okuyup
          hiçbirinde yetkili rol ve ayarlayıcı olmadığını savlıyor. Geriye
          kalan izinli küme iki konu: geliştirici fonu dağıtımı ve launch
          menüsü küratörlüğü — ikisi de zincirde Governor'ı yetkili sayan
          sözleşmelerden okunuyor. */
    durum: "canli",
    ozet: "Zincirde canlı yönetişim: teklif, oy, timelock ve uygulama.",
    sekme: true
  },
  {
    yol: "teklifler",
    ad: "Teklifler ve Oylama",
    grup: "yonetisim",
    ikon: "oy",
    /* CANLI ve gerçekten işlem gönderiyor: propose, castVote, queue,
       execute. Her düğme o işlemin O AN geçerli olup olmadığına göre
       basılıyor — ölçüldü, totalStaked() sıfır olduğu için teklif formu
       şu an hiç basılmıyor ve yerine sebebi yazılıyor. Formu gösterip
       işlemi zincirde reddettirmek, kullanıcıya gazını ödetip hiçbir şey
       söylememek olurdu. */
    durum: "canli",
    ozet: "Teklif ver, oy kullan, kuyruğa al, uygula — hepsi zincirde."
  },
  {
    yol: "topluluk-dao",
    ad: "Token DAO'ları",
    grup: "yonetisim",
    ikon: "insanlar",
    durum: "yapim",
    ozet: "Her tokenin kendi topluluk yönetişimi, platform DAO'sundan ayrı.",
    gerekli: "Platform DAO'suyla aynı sorun, bir de fazlası: bir token DAO'su kendi kasasına ya da vergisine dokunamaz — ikisi de kasıtlı olarak değiştirilemez. Yetki kümesi ayrıca tanımlanmalı.",
    eksik: ["Token başına yönetişim sözleşmesi", "Topluluğun gerçekten karar verebileceği konular"]
  },
  {
    yol: "topluluk",
    ad: "Topluluk Sayfaları",
    grup: "yonetisim",
    ikon: "sohbet",
    durum: "yapim",
    ozet: "Token başına topluluk sayfası, bağlantılar ve duyurular.",
    gerekli: "Zincir dışı içerik deposu. Zincire yazılmayan bir metnin nerede durduğu ve kimin değiştirebildiği cevaplanmalı.",
    eksik: ["İçerik deposu", "Kimin yazabileceğine dair yetki kuralı", "Kötüye kullanım politikası"]
  },
  {
    yol: "liderlik",
    ad: "Liderlik Tablosu",
    grup: "yonetisim",
    ikon: "kupa",
    durum: "yapim",
    ozet: "En iyi kurucular, en iyi işlemciler, en çok geri alım tetikleyenler.",
    gerekli: "İndeksleyici. Sıralama, geçmiş işlemlerin toplamıdır ve o toplam bir yerde tutulmadan her sayfa açılışında hesaplanamaz.",
    eksik: ["Olay indeksleyici", "Sıralama ölçütünün manipüle edilemez tanımı"]
  },

  /* ---- trust ------------------------------------------------------- */
  {
    yol: "kalkan",
    ad: "Whale Shield",
    grup: "guven",
    ikon: "kalkan-artis",
    durum: "canli",
    ozet: "Blok başına birikimli satış eşiği, uygulanan ek oran ve kalkanın kasaya aktardığı tutar.",
    /* The event is SavunmaAcildi on this hook; KalkanCalisti was the
       previous generation's name and no such event exists to listen for. */
    kaynak: "PulseHook.pencere() + SavunmaAcildi / SnipeKesildi olayları"
  },
  {
    yol: "zincirler",
    ad: "Çok Zincirli Teminat",
    grup: "guven",
    ikon: "zincir",
    durum: "canli",
    ozet: "Teminat olabilen varlıklar, hangi köprüyle Arc'a geldikleri ve hangi rotaların gerçekten açık olduğu.",
    /* This one is live precisely because the honest answer is a
       measurement: which routes exist, which do not, and which carry what. */
    /* Chainlink is no longer a gate — the user removed the requirement
       that a collateral target have a feed ("sadece çalışan tüm adayları
       koy"). A feed is still consulted where one exists, as the stricter
       of the two prices, but it does not decide what may be collateral. */
    kaynak: "CCTP v2 zincir okuması + CrossChainAssetRegistry"
  },
  {
    yol: "guvenlik",
    ad: "Güvenlik ve Doğrulama",
    grup: "guven",
    ikon: "kilit",
    durum: "canli",
    ozet: "Sözleşme adresleri, opcode taraması, kasadan çıkış yolları ve koşan denetimlerin sonucu.",
    kaynak: "ADRESLER.md + denetim betiklerinin çıktısı"
  },
  {
    yol: "dokuman",
    ad: "Dokümantasyon",
    grup: "guven",
    ikon: "kitap",
    durum: "canli",
    ozet: "Sistem nasıl çalışıyor: launch, ücretler, taban, kalkan, mezuniyet.",
    kaynak: "ölçülmüş sayılar"
  }
];

export const SEKME_YOLLARI = ["kesfet", "terminal", "portfoy", "daha"];

export function yolBul(ad) {
  return YOLLAR.find((y) => y.yol === ad) || null;
}

export function grubunYollari(grup) {
  return YOLLAR.filter((y) => y.grup === grup && !y.gizliRay);
}

/** How many modules are in each state — the honest headline for /hakkinda. */
export function durumSayimi() {
  const s = { canli: 0, dagitim: 0, yapim: 0 };
  for (const y of YOLLAR) s[y.durum] = (s[y.durum] || 0) + 1;
  return s;
}
