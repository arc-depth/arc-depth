# Para almak ve hisse teminatı — resmi kaynaklardan

*2026-10-08. Hepsi birincil kaynaklardan ya da birincil kaynağı aktaran hukuk
firması analizlerinden. Ben avukat değilim ve bu hukuki tavsiye değil; aşağıda
kuralların ne dediğini ve hangi yolların açık kaldığını çıkardım. Yıldızlı iki
madde için gerçekten avukat gerekiyor ve nedenini yazdım.*

---

## 1 · "İhraç etmiyoruz, alıp teminata koyuyoruz" — bu argüman kapalı

SEC personeli **28 Ocak 2026**'da tokenize menkul kıymetler üzerine ortak bir
bildiri yayımladı ve tam olarak bizim durumumuzu — **ihraççı olmayan üçüncü
tarafın** bir hisseyi alıp kendi tokenini çıkarmasını — iki alt modele ayırdı:

| Model | Tanım | Sonuç |
|---|---|---|
| **Custodial token** | Üçüncü taraf gerçek hisseyi saklar, onun üzerine hak veren token çıkarır. Bildiri buna *"tokenized security entitlement"* diyor. | Menkul kıymet. Dijital ambalaj, sahipliği dolaylı olarak veriyor. |
| **Synthetic token** | Dayanağı tutmadan fiyatını izleyen token. | **Security-based swap** olabilir. |

Ve bildirinin kendi ifadesi: ***"tokenization creates no regulatory
loopholes"*** — tokenizasyon sınıflandırmayı değiştirmiyor, mevcut menkul
kıymet mevzuatı zincirde de aynen geçerli.

**Bizim launchpad tokenimiz hangisi?** Kasadan sarılmış hisseye karşı geri alım
hakkı veriyor. Yani üçüncü tarafın tuttuğu hisse üzerinde dolaylı hak —
tanımı birebir **custodial token**. İhraççı olmamamız bunu değiştirmiyor;
bildiri zaten ihraççı olmayanı ayrı bir kategori olarak ele alıp "yine tabi"
diyor.

Synthetic tarafın sonucu daha ağır: ***"security-based swaps cannot be offered
or sold to retail investors in the U.S."*** ve *"eligible contract participant"*
olmayanlara **kayıt + kayıtlı ulusal borsa** olmadan **hiç** satılamıyor.

### Üstüne Robinhood'un kendi kısıtı

Robinhood Chain stock token dokümanı:

> *"Stock Tokens are not registered under U.S. securities laws and may not be
> offered, sold, or delivered, **directly or indirectly**, in the United States
> or to, or for the account or benefit of, U.S. persons."*

**"Directly or indirectly"** kritik. Sarılmış tokeni bir ABD kişisine satmak,
hisseyi dolaylı olarak teslim etmek demek — SEC mevzuatından bağımsız olarak
Robinhood'un kendi şartını da ihlal eder.

### Teknik tarafı doğruladım: zincirde kısıt YOK

Aramada "onaylı cüzdan kaydı dışındaki adreslere transfer bloklanıyor" iddiası
çıktı. Robinhood Chain'deki NVDA tokeninde (`0xd0601CE1…`) bunu zincirde test
ettim — bakiyesi olan kasadan dört farklı hedefe `transfer` simülasyonu:

```
hic kullanilmamis EOA   GECTI
baska rastgele EOA      GECTI
bir kontrat adresi      GECTI
kendi kendine           GECTI
```

Allowlist/blacklist/KYC seçicisi de yok. Yani **mekanik serbest, kısıt
hukuki.** Bu önemli: teknik olarak mümkün olması izin verildiği anlamına
gelmiyor, ve "kod bırakıyor" bir savunma değil.

---

## 2 · USDC ile ödeme — mobil uygulamada mümkün değil

Apple App Review Guidelines **3.1.1**, kelimesi kelimesine:

> *"Apps may not use their own mechanisms to unlock content or functionality,
> such as license keys, augmented reality markers, QR codes, **cryptocurrencies
> and cryptocurrency wallets**, etc."*

Yani "USDC öde, uygulamada özellik açılsın" **doğrudan yasak**. Dolambaçlı yol
aramaya gerek yok, madde kriptoyu adıyla sayıyor.

### Ama link-out açık, ve ABD'de bedava

**3.1.1(a)**:

> *"These entitlements are **not required** for developers to include buttons,
> external links, or other calls to action in their **United States storefront**
> apps."*

Epic v. Apple sonrası ABD mağazasında kendi checkout'una link verebiliyorsun,
başvuru yok, **Apple payı şu an %0**. AB'de DMA kapsamında *StoreKit External
Purchase Link Entitlement* var (yeni kullanıcıların ilk 6 ayı için acquisition
fee + %5 Core Technology Commission). Kore'de benzeri var. **Diğer
mağazalarda link-out dahi yasak.**

Not: ABD'deki %0 kalıcı değil — Yargıtay davayı **Haziran 2026**'da almaya
karar verdi. Pencere, yerleşik kural değil.

### Ve bazı özellikler uygulamaya hiç giremez

**3.1.5(iv)**:

> *"Apps facilitating Initial Coin Offerings, cryptocurrency futures trading,
> and other **crypto-securities or quasi-securities** trading must come from
> established banks, securities firms, futures commission merchants, or other
> approved financial institutions."*

Hisse teminatlı token en iyi okumayla *"quasi-securities"*. Yani launchpad'i
mobil uygulamanın içine koymak, **lisanslı bir finans kurumu olmayı**
gerektiriyor.

**5.1.1(ix)**: düzenlenmiş alanlar (kripto borsaları dahil) **tüzel kişi**
tarafından sunulmalı, bireysel geliştirici tarafından değil.

**3.2.1(viii)**: finansal işlem/yatırım uygulamaları hizmeti veren kurum
tarafından sunulmalı ve **sunulduğu her yerde lisanslı** olmalı.

Google tarafı (Codex'in topladığı): tokenize dijital varlık satışı ya da
kazanç sağlaması **Financial Features** beyanı gerektiriyor; ticaretten kazanç
beklentisi tanıtılamaz/özendirilemez.

---

## 3 · Çözüm: üç katmanı ayır

Tek bir ürün olarak hepsi birbirini kilitliyor. Ayrıldığında üçü de çalışıyor.

### Katman A — Web. Mağaza kuralı yok.

Apple ve Google'ın bir web sitesi üzerinde **hiçbir yetkisi yok**. Tam ürün —
launchpad, router, zeka paneli — web'de durur ve **ödeme USDC ile alınır.**
"Gelir USDC olacak" şartı burada eksiksiz karşılanıyor. Mobil uygulama sadece
buraya link verir (ABD mağazasında bedava, AB'de entitlement ile).

### Katman B — Mobil uygulama = sadece okuma.

Zeka/analiz, grafik, kanıt görüntüleyici. İşlem yok, cüzdan imzası yok,
kripto ile kilit açma yok. Abonelik ya IAP ile ya da ABD mağazasında link-out
ile. Böylece 3.1.5(iv) ve 3.2.1(viii) hiç devreye girmiyor — çünkü uygulama
ticaret yapmıyor, bilgi gösteriyor.

### Katman C — Hisse teminatı ayrı ve sonraya.

Burası tek gerçek hukuki duvar. İki şey yapılabilir:

**C1 — Launchpad'i USDC teminatıyla çalıştır.** Kodda **zaten mümkün**:
`Launchpad.launch()` teminat olarak *herhangi* bir ERC-20 alıyor, hisse
zorunluluğu yok. Zorunluluk yalnızca kuyrukta (`talepEt` listeli `hisse`
istiyor), ve kuyruk sadece bir kolaylık yolu — "senin için hisseyi alıp
sarıyoruz" adımı. O adım atlandığında:

- müşteri USDC yatırır, taban USDC olur
- geri alım hakkı USDC'ye karşı olur
- **dayanak menkul kıymet kalmadığı için custodial token analizi düşer**
- mekanizmanın geri kalanı aynen durur: taban, kilitli tek yönlü havuz,
  Uniswap'ta USDC ile al-sat, kurucunun yatırdığı kadar token almasi

Yani *"hisse destekli"* iddiası gider, **ürün gitmez.**

**C2 — Hisse teminatını koru, ABD kişilerini gerçekten dışla.** Robinhood
kendi ürününü ABD kişilerine sunmuyor; biz de sunmayacağız. Ama "dolaylı
olarak da" ifadesi yüzünden bu, sitede bir uyarı yazısıyla olmaz — coğrafi
engelleme + KYC + izinli havuz gerekir, ki o da "herkes Uniswap'ta alır satar"
özelliğini öldürür.

---

## 3b · "Hisseyi Robinhood'da tutsak?" — saklama yeri belirleyici değil

Soru mantıklı ama sınıflandırma **hissenin nerede durduğuna** değil, **tokenin
hangi hakkı taşıdığına** bakıyor. Üç varyantın hepsi aynı yere çıkıyor:

| Hisse nerede | Token ne veriyor | Sonuç |
|---|---|---|
| Bizim Arc kasamızda (şimdiki) | sarılmış hisseye geri alım hakkı | **custodial** → menkul kıymet |
| Robinhood Chain'de kasada, Arc'a sarmadan | yine o kasaya karşı hak | **custodial** → aynı |
| Robinhood hesabında, zincire hiç çıkmadan | hak yok, sadece fiyat takibi | **synthetic** → security-based swap |

Ve üçüncüsü **daha kötü**: security-based swap ABD'de perakendeye kayıt +
kayıtlı borsa olmadan **hiç** satılamıyor. Yani hisseyi Robinhood'da bırakmak
bizi kötü kutudan daha kötü kutuya taşıma riski taşıyor, iyileştirmiyor.

### Ama sorunun işaret ettiği gerçek mekanizma var: Regulation S

Robinhood kendi ürününü zaten böyle çalıştırıyor — ABD'de kayıtlı değil, ABD
kişilerine sunulmuyor. Aynı duruşu biz de alabiliriz. Reg S'in şartları:

1. satışın **offshore transaction** olması
2. ABD'de **directed selling efforts** yapılmaması
3. **distribution compliance period** kısıtlarına uyulması

Ve tokenize menkul kıymet için pratikte istenenler:

- coğrafi engelleme ve IP taraması
- alıcıdan **sözleşmeyle ABD kişisi olmadığı beyanı**
- ve kritik olan: **akıllı sözleşme düzeyinde transfer kısıtı** — uyum süresi
  boyunca ABD işaretli cüzdanlara transferin engellenmesi

### Asıl takas burada, ve net

Üçüncü madde bizim tasarımımızla **doğrudan çelişiyor.** Launch tokenimiz düz
bir ERC-20 ve izinsiz bir Uniswap havuzunda duruyor; o havuz kimin aldığını
bilemez, transferi kısıtlayamaz. Kaynaklardan birinin kendi ifadesiyle: *bu
kısıtlar, tokenizasyonun sağlamak istediği izinsiz ticaretle uzlaştırılması
zor.*

> **Hisse teminatı ile izinsiz Uniswap ticareti aynı tokende olamaz.**
> Reg S kısıtlı token istiyor; izinsiz havuz kısıt kabul etmiyor. Biri seçilmeli.

### Bu da üçüncü bir yapı açıyor: hisse, halkın hakkı olmadan

Tokenin menkul kıymet olmasının sebebi **halka hisse üzerinde hak vermesi.**
O hak kaldırılırsa dayanak analizi düşer. Yani:

- launch eden hisseyi **kendi teminatı / rug karşıtı bonosu** olarak kilitler
- **halka satılan tokenin o hisse üzerinde geri alım hakkı YOKTUR**
- taban varsa USDC cinsindendir
- hisse, kurucunun cildini oyuna koyduğunun kanıtı olarak durur

Böylece havuz izinsiz kalır, hisse resimde kalır, token menkul kıymet olmaz.
**Bedeli:** alıcıya *"bu token hisseyle destekli"* denemez — çünkü desteklenmiyor,
o hisse onun değil. Store rehberlerinin uyardığı şey tam bu: *"sarılmış hisseyi
meme diye adlandırıp muaf sayma."* Yani bu yapı ancak **dürüst anlatılırsa**
çalışır: *"kurucu şu kadar hisse kilitledi, senin tabanın USDC."*

### İzlenmeye değer bir not

a16z'nin SEC'e önerdiği **DEX safe harbor** taslağı, insan aracısı olmayan,
kimsenin tek taraflı değiştirme yetkisi bulunmayan ve kullanıcı fonunu hiç
tutmayan sistemleri borsa kaydı dışında sayıyor. Bizim hook'umuz bu tanıma
şaşırtıcı ölçüde uyuyor — test takımı doğruluyor: `owner` yok, `setFee` yok,
`sweep`/`rescue`/`withdraw`/`upgrade` yok, likidite kurucu dahil kimse
tarafından çekilemiyor. **Ama bu bir öneri, kural değil.** Takip edilir, üzerine
ürün kurulmaz.

---

## 3c · "Hak vermiyoruz" — kod veriyor. Ama BTC/ETH fikri sorunu çözüyor.

### Önce düzeltme: geri alım hakkı halkta ve test edilmiş

`CollateralVault.redeem()` **herkese açık**, kurucuya kısıtlı değil:

```solidity
function redeem(uint256 amount) external returns (uint256 payout) {
    uint256 supply = token.totalSupply();
    payout = (backing() * amount) / supply;
    token.burnFrom(msg.sender, amount);
    collateral.transfer(msg.sender, payout);
```

Test takımı da bunu iddia ediyor:

```
PASS taban = teminat / arz
PASS %10 yakan teminatin %10'unu aldi
PASS %40 yakan orantili aldi
PASS herkes cikarsa teminatin tamami odeniyor
```

Yani tokeni alan **herkes** yakıp teminattan payını alıyor. "Sadece rug
kırılmasın diye tutuyoruz" doğru değil — teminat aynı zamanda halkın
çekebileceği bir havuz, ve tabanın *hiç düşmemesinin* sebebi de bu. Dayanak
hisse olduğunda bu, SEC bildirisinin *custodial token* tanımının birebir
kendisi.

### Ama teminat menkul kıymet değilse, aynı hak sorun değil

Custodial token analizi **dayanağın menkul kıymet olmasına** dayanıyor. BTC ve
ETH menkul kıymet değil. Aynı mimari, aynı geri alım hakkı, aynı taban — sadece
teminat değişiyor ve hukuki duvar kalkıyor.

**Ve ikisi Arc'ta hazır, köprü gerekmiyor:**

| | adres | basamak | arz | havuz | kısıt seçicisi |
|---|---|---|---|---|---|
| **cirBTC** (Circle Wrapped Bitcoin) | `0x171a4217b86a807a64eb94757db6849fb4bdbaa0` | 8 | 5.240,70 | **331** | yok |
| **WETH** (Wrapped Ether) | `0x128cc466b61f542da60c70e3aa11c10e19b84edb` | 18 | 6.135,79 | 68 | yok |
| **EURC** (Circle Euro) | `0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1` | — | — | 229 | — |

cirBTC, USDC'den sonra Arc'ta **en çok eşleşen token**. İkisinde de allowlist,
blacklist, freeze, pause seçicisi yok — düz ERC-20.

### Kodun hazır olduğu ve olmadığı yerler

**Hazır:** `redeem` ve `backing` saf oran matematiği —
`payout = backing × amount / supply` — yani **8 basamaklı cirBTC ile sorunsuz**
çalışır, hiçbir değişiklik gerekmez. `Launchpad.launch()` de teminat olarak
herhangi bir ERC-20 alıyor.

**Dikkat:** `floorPrice()` "teminat / token, 1e18 ölçekli" döndürüyor, yani
**teminat biriminde**, dolar değil. 8 basamaklı teminatta gösterim katmanı
basamağı bilmek zorunda. Sayfanın ABI'sinde `decimals()` zaten var.

**Gereken:** `launch()`, açılış havuz fiyatını kurmak için `quoteValue` (teminatın
USDC değeri) istiyor. BTC teminatta bu bir fiyat kaynağı demek — ve üçüncü
tarafa gerek yok, **Arc'ın kendi havuzundan** türetiliyor. Doğruladım: 18
kayıtlı cirBTC/USDC havuzundan en derini (`0x85ff2b5048d2`, fee 1500, likidite
3.355.778.680) **1 BTC = $82.811,66** veriyor.

> Bir not: ilk hesabımda `$0` çıktı çünkü currency sıralamasını varsaydım.
> v4'te currency0 adresi küçük olan ve `0x171a…` < `0x3600…`, yani **cirBTC
> currency0, USDC currency1** — ben tersini yazmıştım. Aynı sınıf hata bu
> projede daha önce derinlik formülünde de olmuştu (`L/sqrtP` yerine `L·sqrtP`).
> Sıralama varsayılmaz, okunur.

### BNB'yi eklemeyelim

SEC, Binance davasını **29 Mayıs 2025**'te *with prejudice* düşürdü, yani
yeniden açılamaz. Bölge mahkemesi ayrıca BNB'nin **ikincil piyasa
satışlarının** Howey testini karşıladığına dair yeterli olgu bulunmadığına
karar verdi — ki ikincil piyasadan BNB alıp teminata koymak için bu olumlu.
Ama ilk dağıtıma dair iddialar MTD aşamasında yeterli görülmüştü ve SEC
düşürmenin *"diğer kripto davalarındaki görüşünü yansıtmadığını"* ayrıca
belirtti.

Sonuç: BNB'nin durumu sandığımdan iyi ama **BTC ve ETH kadar net değil**, Arc'ta
en çok eşleşenler arasında da yok. Belirsizliği karşılığında hiçbir şey
kazandırmıyor. Üçüncü bir teminat isteniyorsa **EURC** çok daha güvenli: Circle
ihraçlı euro stablecoin, 229 havuz, menkul kıymet tartışması sıfır.

---

## 3d · Üçüncü yol, açık hâliyle: hisse kurucunun bonosu

Token menkul kıymet, çünkü **halka hisse üzerinde hak veriyor.** Hak kalkarsa
analiz düşer. Üçüncü yol bu: hisse kalır, hak kalkar.

### Kodda hazır, yeni sözleşme gerekmiyor

`Vesting.sol` tam olarak bu bonodur:

```solidity
function claim() external returns (uint256 amount) {
    amount = claimable();
    if (amount == 0) revert NothingDue();
    claimed += amount;
    token.transfer(beneficiary, amount);
```

`beneficiary` **immutable**. `claim()` herkes tarafından çağrılabilir ama parayı
**her zaman kurucuya** öder. Ve dosyada `rescue`, `sweep`, `withdraw`,
`onlyOwner`, `setBeneficiary` **hiç yok** — sayım sıfır. Yani:

- kurucu hisseyi kilitler, aylık dilimlerle kendine açılır
- halk hiçbir koşulda alamaz → hisse üzerinde **hiçbir hakkı yok**
- herkes `token`, `beneficiary`, `total`, `start`, `unlocked()` okuyup
  kilidi zincirden doğrulayabilir
- kimse iptal edemez, yön değiştiremez, geri çağıramaz

### Ama bedeli net: bu tabanı KORUMAZ

Burada dürüst olmak gerekiyor. "Hisseyi tabanı korumak için tutuyoruz"
denildiğinde iki şey isteniyor ve ikisi aynı anda olmuyor:

| İstenen | Gereken | Sonuç |
|---|---|---|
| **Taban koruması** | varlık halk tarafından **çekilebilir** olmalı | çekilebilir hisse = custodial token = menkul kıymet |
| **Hisse resimde kalsın** | varlık halk tarafından **çekilemez** olmalı | çekilemez hisse tabanı desteklemez, sadece *taahhüt sinyali* olur |

Yani çekilemeyen bir hisse kilidi rug'a karşı **itibar teminatı**dır — "bu kişi
şu kadar sermayeyi şu kadar süre bağladı, zincirden gör" — taban değil.

### Sentez: ikisini birlikte yap

İkisi farklı katman olduğunda istediğin her şey oluyor:

- **Halkın tabanı: cirBTC** (çekilebilir, ve BTC ile birlikte yükselir)
- **Kurucunun bonosu: hisse, `Vesting` içinde kilitli** (çekilemez, görünür,
  rug karşıtı sinyal)
- **Havuz izinsiz kalır**, Uniswap'ta USDC ile al-sat aynen sürer
- **Tokenize menkul kıymet analizi hiç devreye girmez**

Kaybedilen tek şey *"tabanın hisseyle destekli"* cümlesi — çünkü desteklenmiyor.
Doğru cümle: **"tabanın cirBTC, kurucu ayrıca şu kadar hisse kilitledi."**

### Ve şunu net söylemem gerekiyor: "hukuken sıkıntı yok" diyemem

Teminatı değiştirmek **tokenize menkul kıymet analizini** kaldırıyor. Bu somut
bir kazanç. Ama her token için ayrı duran bir soru kalıyor: tokenin kendisi
**yatırım sözleşmesi (Howey)** gibi mi duruyor?

Ve bunun cevabı teminattan çok **ne vaat ettiğimize** bağlı. Sitede "paran
büyür", "şu kadar kazanç", "fiyat şuraya gider" yazarsa, teminat ne olursa olsun
sorun oradan doğar. Bizim lehimize olan şeyler:

- hook değiştirilemez: `owner` yok, `setFee` yok, `sweep`/`rescue`/`withdraw`/
  `upgrade` yok — test takımı doğruluyor
- likidite kurucu dahil kimse tarafından çekilemez
- taban mekanik: `backing / supply`, kimsenin çabasına bağlı değil

Aleyhimize olacak tek şey **pazarlama dili.** Kod tarafı temiz tutulup metin
kazanç vaat ederse, menkul kıymeti metin yaratır.

---

## 4 · Sırayla ne yapılmalı

| # | İş | Kim |
|---|---|---|
| 1 | Launchpad'i **cirBTC / WETH / USDC teminatlı** yola çevir; hisse kuyruğu devre dışı (kod hazır) | ben |
| 2 | Web'i ödeme noktası yap; USDC checkout + yetkilendirme (entitlement) doğrulaması ödeme sağlayıcısından **ayrı** tutulmalı | ben |
| 3 | Mobil uygulamayı sadece-okuma kapsamına sabitle; işlem yollarını derlemeden çıkar | ben + Codex |
| 4 | **Tüzel kişi kur** — 5.1.1(ix) bireysel geliştiriciye kapalı, hangi ülke olursa | ★ sen |
| 5 | **Hedef ülke listesi + ABD kişisi dışlama politikası** | ★ sen + avukat |
| 6 | Hisse teminatlı ürünü C2 olarak ayrı dosyala; avukat görüşü gelene kadar yayına girmez | sen |

★ = bunlar bende çözülmez. 4 ve 5 olmadan mağaza süreci hiç başlamıyor, ve
5 olmadan hisse teminatlı ürün yayına **alınmamalı**.

---

## Kaynaklar

- SEC personel bildirisi analizi (A&O Shearman): https://www.aoshearman.com/en/insights/ao-shearman-on-fintech-and-digital-assets/sec-staff-statement-on-tokenized-securities-new-plumbing-same-rules
- SEC Market Structure Subcommittee tokenizasyon önerisi: https://www.sec.gov/files/recommendation-market-structure-subcommittee-tokenization-equity-securities-022626.pdf
- Cooley, tokenize menkul kıymetler bildirisi: https://www.cooley.com/news/insight/2026/2026-02-04-statement-on-tokenized-securities
- Robinhood Chain stock token dokümanı: https://docs.robinhood.com/chain/stock-tokens/
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play finansal özellikler: https://support.google.com/googleplay/android-developer/answer/13607354
- Reg S ve tokenize ihraçlar: https://www.jdsupra.com/post/fileServer.aspx?fName=ccef1640-5708-4073-b7d1-af272a101f98.pdf
- Reg S / MiFID II ve ABD sorusu: https://coinpaprika.com/education/who-can-buy-tokenized-stocks/
- Tokenize menkul kıymetlerde hukuki düğümler (Skadden): https://www.skadden.com/insights/publications/2026/04/tokenized-securities
- a16z DEX safe harbor önerisi: https://www.techflowpost.com/en-US/article/34207
- Zincir üstü doğrulama: bu depoda `kanit-yonetisim/`, `kanit-fathom/`, ve NVDA
  transfer simülasyonu (yukarıda)
