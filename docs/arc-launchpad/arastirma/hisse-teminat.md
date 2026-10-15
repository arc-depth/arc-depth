# Hisse teminatı — Robinhood'un kendi hisse tokenleri (C2)

**Tarih:** 2026-10-14 · **Durum:** araştırma tamam, tasarım kararı aşağıda, kod yok

## Ölçülenler

| Ne | Değer | Kaynak |
|---|---|---|
| NVDA | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`, arz 77.845,6, `paused()` false, `uiMultiplier` 1,000775 | zincirden |
| TSLA | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d`, arz 11.196,5, `paused()` false, `uiMultiplier` 1,0 | zincirden |
| AAPL | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9`, arz 12.053,1, `paused()` false, `uiMultiplier` 1,000566 | zincirden |
| Biçim | standart ERC-20, 18 ondalık; sözleşmeler serbestçe tutabilir | docs.robinhood.com |
| Fiyat | her token için Chainlink beslemesi (`latestRoundData`); fiyat çarpanı zaten içeriyor; 24/5 güncellenir | docs.robinhood.com |
| Derinlik | TSLA/USDG Uniswap v4 havuzu ~822 bin $ rezerv, 24 saatte ~149 bin $ hacim | GeckoTerminal |
| Yönetici yetkileri | token sözleşmesinde duraklatma (iki katmanlı: token + oracle), yükseltilebilir yapı, 13 rol, mint/burn | Beosin analizi |
| Hukuk | ABD kişilerine sunulamaz/satılamaz; Kanada, BK, İsviçre için ek kısıtlar | docs.robinhood.com |

Eski wNVDA/wAAPL sarmalının adresleri (`relayer/ayar.json`) bu NVDA ve AAPL
ile aynı; yani sarmaya hiç gerek yoktu, Robinhood'da token zaten burada.

## Tasarım kararı

1. **Taban dolar kalır.** Kasanın garantisi Robinhood'da USDG. Hisse tokeni
   duraklatılabilir ve yükseltilebilir; Robinhood onu dondurursa kasadaki
   hisse hareket edemez. "Sahibi yok, durdurulamaz" garantimiz bu yüzden
   hisse için geçerli DEĞİL. Hisse, Arc'taki dönüştürülmüş kısım gibi
   **sayılmayan üst potansiyel** olarak tutulur; `hak()` ve taban yalnızca
   USDG'dir. Arayüz iki rakamı ayrı gösterir.
2. **Sarma yok, köprü yok.** Hisse tokeni Robinhood'daki kasada yerinde
   durur; eski relayer'ın kasa bakiyesini mint etme hatası (C1) oluşamaz.
3. **Dönüşüm yerel olmalı.** Robinhood'da CCTP yok ve kasanın dönüşüm yolu
   KapaliKayit'ta kapanıyor. Hisse kısmı için kasanın USDG'nin bir payını
   Robinhood'daki Uniswap havuzunda hisseye çeviren yerel bir yolu gerekir
   — dağıtılmış KopruKasasi'nda yok, yeni bir kasa sürümü ister (C4).
   Çalışan Robinhood launchpad'i değişmez; C4 ayrı bir launchpad örneği
   olarak dağıtılır.
4. **Fiyat:** Chainlink beslemesi + bayatlık kontrolü + Robinhood sıralayıcı
   (sequencer) çalışma kontrolü. Piyasa kapalıyken (hafta sonu) fiyat
   güncellenmez; hisse kısmı sayılmadığı için tabanı etkilemez.
5. **ABD dışlama (C3) hisse launch'ından ÖNCE.** Hisse teminatlı launch
   arayüzü ABD, Kanada, BK ve İsviçre kullanıcılarına açılmaz.

## Sırada

- C3: dışlama kuralı (site + hukuk notu).
- C4: yerel dönüşüm yolu olan kasa sürümü — Chainlink besleme adresleri
  docs.chain.link'ten okunacak (`network=robinhood`), sabit yazılmayacak.

## C3 — Dışlama kararı (2026-10-14)

`hukuk-ve-odeme.md` §3b'nin sonucu bağlayıcı: hisse teminatlı bir launch
tokeni, hisse nerede tutulursa tutulsun, kasaya karşı hak taşıdığı için
custodial tokenize menkul kıymet sınıfına düşer; Reg S muafiyeti coğrafi
engelleme + ABD kişisi olmadığı beyanı + **akıllı sözleşme düzeyinde transfer
kısıtı** ister. Launch tokenimiz izinsiz bir Uniswap havuzunda düz bir ERC-20;
o havuz alıcıyı bilemez, transferi kısıtlayamaz. Site uyarısı bu şartı
karşılamaz.

Bu yüzden karar: **hisse teminatlı launch sunulmuyor.** C4 (yerel hisse
dönüşümlü kasa) yazılmayacak; yazılırsa, KYC'li ve transfer kısıtlı ayrı bir
ürün olarak, izinsiz launchpad'den tamamen ayrı tasarlanmalı — bu bir iş ve
hukuk kararı, mühendislik turunun değil.

Sitede yapılan: SSS'ye "Are stock-backed launches available? — No" maddesi
(gerekçesiyle), alt bilgiye "no tokenized-stock products are offered, and
none to persons in the US, Canada, the UK or Switzerland". Uygulamada hisse
teminatlı akış yok (taranarak doğrulandı).
