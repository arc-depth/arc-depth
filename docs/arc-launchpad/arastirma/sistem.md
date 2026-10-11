# Sistem — somut hâli

*Her parça `arastirma/hukuk-ve-odeme.md` içindeki doğrulanmış bulgulardan
türetildi. Üç karar sana bırakıldı ve işaretlendi.*

---

## Kritik yoldan düşen iki şey

Bunu başta söylemek lazım çünkü planı küçültüyor:

**Köprü artık kritik yolda değil.** cirBTC ve WETH **Arc'ta hazır** — Circle
ihraçlı, düz ERC-20, kısıt seçicisi yok. Kendi köprümüzü yazmaya, üç imzacı
adresi beklemeye, L1 finality bağlaması kurmaya **gerek kalmıyor.** Köprü kodu
duruyor ama ürün onu beklemiyor.

**Hisse kuyruğu da kritik yolda değil.** Kuyruğun tek işi "USDC'ni alıp senin
için hisse alıp sarayım"dı. Teminat cirBTC/USDC olduğunda müşteri zaten
doğrudan yatırabiliyor. Yani donmuş yönetişim ve karşılıksız wNVDA/wAAPL
sorunu **ana yoldan çıkıyor** — hâlâ temizlenmeli ama ürünü bekletmiyor.

---

## Katman 1 — Launch

```
kurucu                                                        halk
  │                                                             │
  │ 1. teminat yatırır (USDC varsayılan / cirBTC / WETH)         │
  ▼                                                             │
CollateralVault ──────────── TABAN = backing / supply ──────────▶│ redeem()
  │                          hiç düşmez, orantılı                │ herkese açık
  │                                                              │
  │ 2. arz 1.000.000.000 sabit                                   │
  ├── %X kilitli havuza ──▶ Uniswap v4, tek yönlü, USDC ────────▶│ al / sat
  │                         kimse çekemez (hook kapatıyor)       │ izinsiz
  │                                                              │
  └── kalan kurucuya ──┬── %A serbest                            │
                       └── %B VESTING ◀── YENİ, şu an yok        │
```

**Teminat seçenekleri**

| Varlık | Adres | Basamak | Durum |
|---|---|---|---|
| USDC | `0x3600…0000` | 6 | **varsayılan** — taban zaten USDC cinsinden, fiyat kaynağı gerekmez, tamamen güvensiz-çalışır |
| cirBTC | `0x171a4217b86a807a64eb94757db6849fb4bdbaa0` | 8 | taban BTC ile yükselir; açılışta bir kez fiyat gerekir |
| WETH | `0x128cc466b61f542da60c70e3aa11c10e19b84edb` | 18 | aynı |
| EURC | `0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1` | — | euro cinsinden taban isteyene |

Kasa matematiği basamaktan bağımsız (`payout = backing × amount / supply`), yani
8 basamaklı cirBTC **kod değişikliği olmadan** çalışıyor.

**Açılış fiyatı — dürüst uyarı.** `launch()` havuzu açmak için teminatın USDC
değerini istiyor. USDC teminatta bu zaten belli, oracle yok, hiç kimseye
güvenmek gerekmiyor. cirBTC/WETH'te **açılış anında bir kez** fiyat gerekiyor;
Arc'ın kendi havuzundan türetiliyor (en derin cirBTC/USDC havuzu `0x85ff2b5048d2`
→ 1 BTC = $82.811,66). Yanlış girilirse havuz tabanın üstünde ya da altında
açılır; altında açılırsa anında arbitraj olur, üstünde açılırsa alıcı tabanın
üstünde alır. Herkes satın almadan önce kontrol edebilir, ama **bu tek nokta
güvensiz-çalışır değil** ve öyle anlatılmamalı.

**Ücret** — 0,5%, hook'ta sabit, değiştirilemez:
- **alımda** (ücret token olarak gelir) → **tamamı tabana**, kimse satmak
  zorunda kalacağı bir şeyle ödenmiyor *(bu turda düzeltildi)*
- **satışta** (ücret USDC olarak gelir) → tutucu %0,15 / geliştirici %0,15 /
  protokol %0,20

**Zaten kapalı olan kapılar** — test takımı doğruluyor:
likidite kurucu dahil kimse tarafından çekilemez · hook'ta `owner`/`setFee`/
`sweep`/`rescue`/`withdraw`/`upgrade` yok · geri alım orantılı, token başına
taban düşmez · arz sabit.

**Açık olan tek kapı ve kapatılması gereken:** kurucu payı şu an
`t.transfer(msg.sender, kalan)` ile **tamamı anında likit** gidiyor, ve
`MIN_POOL_BPS = 500` yüzünden arzın %95'i likit olabiliyor. Havuz tek yönlü
olduğu için kurucu ancak **alıcıların koyduğu USDC kadarını** çekebilir — boş
havuzda dump bir şey getirmez — ama para girdikçe alabilir. Klasik rug ve
tasarımda onu durduran bir şey yok.

---

## Katman 2 — Hisse, isteğe bağlı üst katman

Hisse **tabanın parçası değil.** `Vesting.sol` içinde kurucunun kendi bonosu:

```solidity
function claim() external returns (uint256 amount) {
    token.transfer(beneficiary, amount);   // beneficiary IMMUTABLE
```

Dosyada `rescue`/`sweep`/`withdraw`/`onlyOwner`/`setBeneficiary` **sıfır tane.**
Halk hiçbir koşulda alamaz → hisse üzerinde hiçbir hakkı yok → menkul kıymet
analizi devreye girmez. Herkes `token`/`beneficiary`/`total`/`unlocked()` okuyup
doğrular.

**Ekranda yazılacak cümle:** *"tabanın cirBTC, kurucu ayrıca 0,8 NVDA kilitledi
— zincirden gör."*
**Yazılmayacak cümle:** *"bu token hisseyle destekli."* Çünkü desteklenmiyor.

### Daha iyi varyant: hisse → borç → USDC taban

Robinhood'un kendi dokümanının önerdiği senaryo:

> *"Deposit NVDA as collateral on a lending market and borrow USDG — liquidity
> without selling"*

```
kurucu NVDA yatırır → USDC borçlanır → USDC kasaya girer → TABAN USDC
halkın hakkı USDC'de · kurucunun hissesi kendi borcunun teminatı
```

Hisse gerçek ekonomik iş yapıyor (satmadan tabanı finanse ediyor), halk menkul
kıymet almıyor. **Eksik parça:** Robinhood Chain'de kullanılabilir bir ödünç
piyasası. Araştırılacak.

---

## Katman 3 — Gelir

**Web'de, USDC ile.** Apple ve Google'ın bir web sitesi üzerinde yetkisi yok.
Mobil uygulama **sadece okuma** — işlem yok, cüzdan imzası yok, kripto ile
kilit açma yok (Apple 3.1.1 kriptoyu adıyla yasaklıyor). Abonelik ya IAP ile ya
ABD mağazasında link-out ile (şu an %0 komisyon, Haziran 2026'da Yargıtay'a
gidiyor).

Gelir kalemleri: launch ücreti %2 · takas ücreti %0,5'in protokol dilimi ·
ARC PULSE aboneliği.

---

## ★ Senin vermen gereken üç karar

**1 · Kurucu payı vesting oranı ve süresi.** Rug kapısını kapatan tek şey bu.
FTHM'de kendi payımın yarısını vesting'e koymuştum (50M/50M). Önerim: kurucu
payının **%20'si serbest, %80'i 6 ay** — operasyon için nakit bırakır, dump'ı
engeller. Sayıyı sen söyle.

**2 · `MIN_POOL_BPS` %5 kalsın mı.** %5 havuzda demek %95 likit pay demek. Piyasa
ince kalır ve üstünde büyük bir gölge durur. Önerim **%20'ye çıkarmak**. Bedeli:
kurucunun geri alabileceği teminat payı azalır.

**3 · Hisse katmanı şimdi mi sonra mı.** Katman 1 bugün çalışır. Hisse bonosu
(Katman 2) pazarlama değeri olan bir ek. Ödünç varyantı araştırma ister.
Hisseyi halka hak verecek şekilde kullanmak avukat ister ve **o gelene kadar
yayına girmez.**

---

## Ne zaman ne yapılabilir

| | iş | engel |
|---|---|---|
| **bugün** | Katman 1'i USDC teminatlı uçtan uca kur ve test et | yok |
| **bugün** | kurucu payı vesting'ini `launch()`'a ekle | karar 1 |
| **bugün** | cirBTC/WETH teminat yolunu ekle + fiyat türetme | yok |
| **bugün** | kuyruk ekranını ve iade metnini bu yapıya göre güncelle | yok |
| **yakın** | web ödeme noktası, USDC checkout | yok |
| **yakın** | mobil uygulamayı sadece-okumaya sabitle | Android SDK / macOS |
| **bekliyor** | mağaza süreci | tüzel kişi (★) |
| **bekliyor** | hisse teminatlı ürün | avukat (★) |
| **düştü** | köprü, hisse kuyruğu | kritik yolda değil |
