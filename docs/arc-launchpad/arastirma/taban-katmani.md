# Taban Katmanı — 12 zincirde token'la birlikte yürüyen teminat

16 Ekim 2026. Durum: tasarım taslağı, kod yok. Kaynaklar en altta.

## 1. Problem

LayerZero mesajı, CCTP doları taşır; bir token'ın *tabanını* (arkasındaki
redeem edilebilir dolar) taşıyan bir şey yok. Bugün ARC PULSE'ta Base'de doğan
bir token'ın kasası yalnız Base'de. Token başka zincire geçerse oradaki sahip
redeem edemez: taban arkada kalır.

## 2. Pazarda ne var (araştırıldı)

| Proje | Ne yapıyor | Eksik olan |
|---|---|---|
| LayerZero **OVault** | Tek merkez (hub) zincirde ERC-4626 kasa; paylar OFT olarak her zincirde. Redeem: pay hub'a gönderilir, kasa öder, para geri yollanır. | Redeem **yerel değil**: her seferinde iki zincirler arası mesaj. Kasa tek zincirde. Hata olursa refund/retry gerekir. Volatil token + taban modeli değil, getiri kasası. |
| **Baseline** (Base, bir kısım EVM) | Token'ın kendi likiditesinde garanti taban fiyatı (BLV), düşürülemez. | Tek zincir. Tabanın köprüyle taşınması belgelenmemiş. |
| **USDT0** | Ethereum'da kilit kutusu (lockbox), diğer zincirlerde burn/mint. | Teminat tek yerde; yerel redeem yok. Stablecoin, taban değil. |

**Sonuç:** "Volatil token + her zincirde **yerel, anında** redeem edilebilen
taban + taban token'la birlikte taşınır" kombinasyonunu yapan bir şey bulamadım.
Bulamamak yokluğun kanıtı değil; ama en yakın iki rakip (OVault, Baseline) bu
iki özelliğin birinden yoksun.

## 3. 12 zincir, CCTP gerçeği (Circle'ın sayfasından, 16 Ekim)

| Zincir | CCTP USDC | Not |
|---|---|---|
| Ethereum, Base, Arbitrum, Solana | ✓ standart + **hızlı** | |
| Arc, Avalanche, Monad, HyperEVM | ✓ standart | |
| Aptos, Sui | ✓ standart | Circle'ın sayfası V1/V2 konusunda kendi içinde çelişkili; teyit gerek |
| **BNB** | ✗ (yalnız USYC) | Bizdeki USDC 18 ondalıklı Binance-peg |
| **Robinhood** | ✗ listede yok | Dolar USDG |

**Düzeltme:** `cok-zincir.md` madde 6 "Robinhood hariç hepsinde CCTP V2"
diyordu; BNB'de USDC için CCTP yok. Düzeltildi.

Yani 12'nin **10'u** CCTP ile birbirine bağlı; BNB ve Robinhood ada.

## 4. Tasarım

### Kural (değişmez)

```
her zincir i:   kasa_i  ≥  arz_i × taban_i
```

"Yoldaki para" terimi yok: aşağıdaki köprü sayesinde gerek kalmıyor.

### 4a. Taban taşıyan köprü (10 CCTP zinciri)

Asıl fikir. Token'ı LayerZero ile, doları ayrıca taşımak yerine **ikisini tek
CCTP mesajında** taşı:

1. Kullanıcı A zincirinde N token'ı köprüye verir. A kasası token'ı yakar ve
   `N × taban_A` USDC'yi CCTP ile B kasasına yakar (burn). Mesajın `hookData`
   alanında: token kimliği, N, alıcı.
2. B kasası mesajın `destinationCaller`'ıdır; mesajı kendisi teslim alır
   (nesil2'nin `teslimAl` deseni, `CctpMesaj.sol` okuyucusu, gerçek Circle
   kontratlarına karşı test edildi 5/5).
3. Aynı işlemde: USDC kasaya basılır, N token alıcıya basılır.

Para gelmeden token basılamaz → kural **her an** geçerli. Tampon yok, yarış
yok, çift ödeme yok. Redeem her zaman yerel ve anında.

Bedeli: köprü süresi = CCTP süresi. Hızlı transferli zincirlerde saniyeler,
diğerlerinde kaynak zincirin kesinliği (dakikalar). Token fiyatının tabanın
üstündeki kısmı taşınmaz; o zaten piyasa fiyatı, hedefte havuzda oluşur.

### 4b. Adalar (BNB, Robinhood)

İki seçenek, ikisi de dürüstçe gösterilir:

- **Ada modu (önerilen başlangıç):** Bu zincirlerdeki token'ın tabanı yerel
  kasadan; köprüyle dışarı çıkan token tabansız gitmez, ya hiç gitmez ya da
  takas+köprü ile (LI.FI/relay) dolar taşınır ve token dolar varınca basılır.
  Yavaş ve kur riskli ama kural korunur.
- **Tampon modu (sonra):** Ücretlerden dolan yerel tampon anında öder,
  mutabakat toplu yapılır. Tampon boyu ve depeg riski ayrı çalışma ister.

### 4c. Tabanlar ayrışır mı?

Evet: ücretler hangi zincirde işlem olursa o kasayı derinleştirir
(%0,70 derinlik payı), `taban_i` zincirden zincire farklılaşır. İki yol:

- Her zincirin tabanı ayrı gösterilir ("Base'de $0,0012, Solana'da $0,0011").
  Köprü `taban_A` ile taşır; hedefte ortalama günceller. Basit ve dürüst.
- Periyodik eşitleme: fazla olan kasa CCTP ile eksik olana yollar. Daha güzel,
  daha karmaşık; ikinci aşama.

### 4d. Herkesin bağlanabileceği standart

Kasa + köprü + okuma arayüzü (`tabanOku(token) → (taban, kasa, arz)`) bir
standart olarak açılır. Herhangi bir launchpad bağlanır; kasa açılışı ve köprü
geçişinden küçük ücret. ARC PULSE ilk müşteri.

## 5. Gerçekten zor olanlar

1. **Dört kod tabanı.** EVM (Solidity), Solana (Anchor), Aptos Move, Sui Move.
   Hepsi aynı muhasebeyi tutmalı. Çare: 12 zinciri tarayıp `Σ kasa` ile
   `Σ arz × taban`'ı karşılaştıran bağımsız denetçi; sapma = alarm.
2. **CCTP'nin Move/Solana tarafında `destinationCaller` + `hookData`.**
   **Teyit edildi (16 Ekim, Circle'ın kaynak kodundan):** üçünde de V2 var.
   - Aptos (`circlefin/aptos-cctp`, `message_transmitter_v2`):
     `receive_message(caller: &signer, …)` `destination_caller == caller`
     ister ve `Receipt` sıcak patatesi döner; `prepare_mint` /
     `complete_mint` aynı işlemde. `deposit_for_burn(…, hook_data)` var.
     Kasa, nesne imzacısıyla (ExtendRef) destinationCaller olur.
   - Sui (`circlefin/sui-cctp`, `message_transmitter_v2`):
     `receive_message_with_package_auth<Auth>` — paket destinationCaller
     olarak atanır, `Auth` tanığıyla teslim alır; Receipt → stamp →
     complete, hepsi tek işlemde.
   - Solana (`solana-cctp-contracts/programs/v2`): `receive_message`
     `caller: Signer` ister ve destinationCaller ile karşılaştırır; programın
     PDA'sı CPI ile imzalar. `deposit_for_burn_with_hook` var.
   Yani 4a modeli 10 zincirin hepsinde kurulabilir.
3. **Hızlı transferin ücreti.** Hızlı CCTP ücretli; küçük köprülerde maliyeti
   kim öder (kullanıcı, öneri).
4. **İlk taban.** Taban, launch anındaki dolardan doğar; düşük taban = zayıf
   pazarlama cümlesi. Ekonomi modeli ayrı.

## 6. Nesil2 ile farkı

Nesil2 zincirler arası teminattı ama başka bir şeydi: kasa parasını *başka
zincirdeki bir hedef varlığa yatırmak* için CCTP ile yolluyordu (rapor, geri
çağırma, pozisyon). Nesil3'te bunun yerine teminat yerelde dönüştürülüyor.
Neden bırakıldığı commit'lerde yazmıyor. Buradaki tasarım ondan **mesaj okuma
ve teslim alma** parçalarını alır (`CctpMesaj`, `teslimAl`), yatırım
mantığını almaz.

## 7. Prototip (16 Ekim) — `contracts/taban/TabanKasasi.sol`

Tek kontrat: kasa + token (token'ı yalnız kasa basar/yakar). `itfa` yerel
redeem, `kopru` token yakar + payını `depositForBurnWithHook` ile ikize
yollar, `teslimAl` ikizden gelen mesajı kendisi alır ve aynı işlemde basar.
`kilitle` sonrası sahip yok.

**Tasarımda bir düzeltme:** 4c'deki "tabanlar ayrışır" sorunu ilk taslakta
saldırıya açıktı: düşük tabanlı zincirden yüksek tabanlıya 1:1 köprüleyip
redeem eden, yüksek tabandaki sahiplerden para çekerdi. Prototipte varış,
**hedef zincirin tabanından** basılıyor (ERC-4626 pay mantığı): taban
farklıysa token sayısı değişir, değer korunur. CCTP ücreti de köprüleyenin
token'ından düşer. Böylece kural tek cümle: **hiçbir işlem hiçbir zincirin
tabanını düşüremez.**

**Test** (`nesil2-test/test/Taban.t.sol`): 3 zincir (Arc, Base, Arbitrum),
her birinde Circle'ın gerçek CCTP V2 kontratları, Iris gibi imzalanmış
mesajlar. 8/8 geçti:
- köprü tabanı taşır, hedefte yerel redeem; Base → Arbitrum doğrudan (ağ)
- 3 zincirde dolar ve token korunur
- CCTP ücreti köprüleyene düşer, taban sabit
- düşük taban yükseği seyreltemez; gidiş-dönüş para çıkaramaz
- yabancı yakım reddedilir; CCTP'ye doğrudan teslim ve tekrar olmaz
- fuzz (256 rastgele 12 adımlık dizi: köprü, ücret, redeem, bağış):
  hiçbir taban düşmez, dolar korunur

**Mutasyon kontrolü:** kontrata bilerek 4 hata kondu (1:1 basım, gönderen
kontrolü yok, redeem yukarı yuvarlama, köprü 1 birim fazla) — 4'ü de en az
bir testi kırdı. Testler gerçekten yakalıyor.

Harcama yok, ana ağa bir şey dağıtılmadı.

## 7b. Gelir ve FTHM payı (16 Ekim, kullanıcı onayı: "önerin olsun")

Oranlar kontratta sabit, alıcılar değiştirilemez:

| Kalem | Tutar | FTHM stake edenler | Token'ı getiren launchpad | Protokol (hazine) |
|---|---|---|---|---|
| Açılış | $5, bir kez | %50 | — | %50 |
| Köprü | taşınan doların %0,10'u | %40 | %30 | %30 |
| Teslimat bahşişi | köprüleyen belirler | — | — | mesajı teslim eden (bizim relayer dahil herkes) |
| Redeem | **ücretsiz** | | | |

- Her ücret köprüleyenin token'ından düşer; kalan sahiplerin tabanı düşmez.
- **FTHM yolu:** her zincirde `FthmPayi`. `supur()` bakiyeyi Arc'taki FTHM
  Stake kontratına (`0xAbD3…d2de`, quote = Arc USDC) yollar: Arc'ta düz
  transfer, diğer zincirlerde CCTP yakımı (mint alıcısı Stake). Stake gelen
  USDC'yi `dagit()` ile stake edenlere dağıtır — mevcut kontrat, değişiklik
  yok. Sahibi yok, başka hedefe gidemez, CCTP ücreti en çok %1.
- Bahşiş kaynakta sınırlanır: mesajın basacak bir şey bırakmaması
  imkânsız (aksi halde para yolda kalırdı).
- **Lisans:** `contracts/taban/` BUSL-1.1 (Licensor ARC PULSE, Change Date
  2030-10-16 ya da ilk yayından 4 yıl, sonra GPL-2.0-or-later).

**Test:** 13/13 (fuzz dahil). Yazarken bulunan hata: boş zincire ilk köprüde
köprü ücreti token sayısına yansımıyordu, yeni zincir tabanı kaynaktan
%0,1 düşük açılıyordu. Düzeltildi (`hookData` brüt payı taşıyor); fuzz'a
"yeni zincir kaynağın tabanından açılır" kontrolü eklendi ve eski hata geri
konunca fuzz onu yakalıyor. Ek mutasyonlar (FTHM payı sıfır, redeem'e ücret)
de yakalandı.

## 8. Sonraki adımlar (öneri)

1. Base ↔ Arbitrum ana ağda küçük tutarla ($2–3) tek gidiş-dönüş
   (**kullanıcı onayıyla**; Iris gerçek imzası, gerçek CCTP).
2. Üretim kasası: nesil3 `TeminatKasasi` vergileri + launchpad bağlantısı.
3. Solana (Anchor), sonra Aptos ve Sui Move.
4. 12 zinciri tarayan bağımsız denetçi (`Σ kasa`, her `taban_i`).

## Kaynaklar

- Circle CCTP desteklenen zincirler: https://developers.circle.com/cctp/cctp-supported-blockchains
- LayerZero OVault: https://docs.layerzero.network/v2/concepts/applications/ovault-standard
- LayerZero OVault duyurusu: https://layerzero.network/blog/introducing-ovault-any-vault-accessible-everywhere
- Baseline SSS: https://www.baseline.markets/faq
- USDT0 açıklaması: https://crypto.news/what-is-usdt0/
- Kendi kodumuz: `contracts/nesil2/CctpMesaj.sol`, `KopruKasasi2.sol`, commit 98f46d1, 7e6a672

## 9. Ana ağ denemesi (16 Ekim 2026) — Base ↔ Arbitrum, GEÇTİ

`scripts/taban-ana-ag.js`, kayıt `dagitim-taban.json`. Gerçek Circle CCTP V2,
gerçek Iris imzası, kasalar kilitli (sahipsiz).

| adım | sonuç | işlem |
|---|---|---|
| Arc → Base 5 USDC (CCTP) | geldi | explorer.arc.io/tx/0x231cccccccec… |
| Base + Arbitrum kasa, ikiz, kilit | sahipsiz | basescan 0xa455…, arbiscan 0xe4fa… |
| Tohum $1 / 1M PFT + $5 açılış | $2,5 FTHM, $2,5 hazine | basescan 0x6fd4… |
| Base → Arbitrum 500k PFT | $0,4995 + 499.500 PFT tek mesajda; taban eşit | basescan 0x0333…, arbiscan 0xe563… |
| Arbitrum'da yerel redeem 99.900 PFT | $0,0999 anında | arbiscan 0x07d2… |
| Arbitrum → Base 399.600 PFT | 399.201 PFT basıldı (ücret düşülmüş) | arbiscan 0xcf8a…, basescan 0x3491… |
| Base'de redeem hepsi | kasa ve arz 0 | basescan 0x1de9… |
| FTHM payı Base → Arc stake | Stake USDC 0,005593 → 2,505793 | basescan 0x4eb6…, explorer.arc.io 0x8459… |

Öğrenilenler: yedekli RPC aynı işlemi iki sağlayıcıya yayınlıyor, ikincisi
"Nonce already used" dönüyor — işlem gitmiş olur, durum zincirden okunmalı;
okuma gecikmeli sağlayıcıdan gelirse "basılan 0" görünebilir. Base ve
Arbitrum'un standart CCTP onayı ~15–20 dk, Arc'ınki 10 sn.
