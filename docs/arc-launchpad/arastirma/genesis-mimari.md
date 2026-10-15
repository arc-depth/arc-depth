# PULSE GENESIS — mimari, gerçek durum ve yol haritası

Şartname: `arastirma/genesis-sartname.md` (kullanıcının 14 Ekim 2026 metni, kelimesi kelimesine).

## 1. Başlangıçta gerçek durum (kaynak koddan)

GENESIS'ten önce depoda yapay zekâya ait hiçbir bileşen yoktu: `contracts/`, `docs/js/`
ve `scripts/` içinde dil modeli, hafıza ya da hesaplama pazarı yok. Olanlar ve GENESIS'in
yeniden kullandığı yapı taşları:

- `contracts/lz/ZincirTablosu.sol` — 9 EVM zincirinin LayerZero tablosu bytecode içinde;
  aynı bytecode her zincirde aynı adrese iner, iki DVN (LZ Labs + Nethermind) yapılandırması
  doğumda yazılır. GENESIS çekirdeği bu deseni aynen kullanır.
- Sahipsiz OApp deseni (`AgCekirdek.sol`): eşler kendisi, delege ve sahip doğumda yakılır.
- FTHM, DAO, staking, kurucu payları, kasalar: **dokunulmadı**. GENESIS hiçbirini çağırmaz.

## 2. Bileşenler ve hesaplama modu (şartname §4'teki üç durum ayrı tutuldu)

| Bileşen | Dosya | Mod | Ne anlama geliyor |
|---|---|---|---|
| Kimlik, hafıza, model/modül kaydı | `contracts/genesis/GenesisCekirdek.sol` | zincirde | Kayıtlar zincirde; zincirler arası LayerZero ile taşınır, alıcı hash zincirini yeniden hesaplar |
| GENESIS-0 dil modeli | `contracts/genesis/GenesisDil.sol` | **1 — tamamen zincirde** | Öğrenme bir işlem (parametreler = sayımlar, zincir deposunda); üretim ve ölçüm view çağrısı |
| Hesaplama ağı | `contracts/genesis/GenesisHesap.sol` + `scripts/genesis-saglayici.js` | **2 — bağımsız katılımcı, zincirde mutabakat** | Kriptografik kanıt DEĞİL: k bağımsız, teminatlı sağlayıcının taahhüt-açma ile aynı çıktı hash'inde buluşması |
| Tarayıcıdaki açık model | `docs/js/gorunum/genesis.js` | **3 — dışarıda hesap, zincirde hash** | Qwen2.5-0.5B-Instruct (Apache-2.0) ziyaretçinin cihazında; ağırlık sha256'sı hafızaya model kaydı olarak yazılır. GENESIS'in kendi modeli değildir, sayfa bunu söyler |
| Ajan döngüsü | `scripts/genesis-ajan.js` | zincir dışı yürütücü, zincirde kayıt | Gözlem → öneri kutusu → öğrenme → ölçüm → kayıt → senkron. Ajan anahtarı dışında her adım izinsiz |

## 3. Hafıza (şartname §7)

- 12 kategori sözleşmede sabit (1 konuşma … 12 zincir entegrasyonu); 100+ yapılandırılmış kayıtlar
  (ajan, model, modül, modül iptali) her zincirde aynı biçimde kayıt defterlerine uygulanır.
- **Zincirde saklanan / yalnız hash** ayrımı her kayıtta `saklama` alanında: ZINCIRDE ise bayt
  (≤ 4 KiB) her zincirin deposunda; SADECE_HASH ise yalnız keccak256.
- **Konuşmalar yalnız hash** — sözleşme kategori 1'i başka türlü kabul etmez. Sohbet sayfası hiçbir
  şeyi kaydetmez; "hafızaya öner" açık, imzalı ve kamusal tek yoldur.
- Bütünlük: her köken zincirin kayıtları hash zinciri; `hafizaKoku()` bütün kökenlerin başlarını
  bağlar → iki zincir aynı hafızayı taşıyorsa kökleri aynıdır (sayfa "Memory in sync" bunu okur).
- Tek otorite yok: her zincir kendi kaydını yazar; bir zincirin durması yalnız kendi kayıtlarının
  yayılmasını geciktirir. Alıcı tekrarı atlar, boşlukta durur, uyuşmazlığı olay olarak bildirir —
  asla revert etmez (revert LayerZero yolunu kilitlerdi).

## 4. Öğrenme (şartname §6) — "kaydetmek eğitmek değildir"

- GENESIS-0'ın parametreleri gerçekten güncellenir: `ogren()` doğrulanmış (kategori 2, zincirde)
  kaydın baytlarını trigram/bigram/unigram sayımlarına ekler. Günlükler, ölçümler, konuşmalar
  eğitim metni değildir (sözleşme reddeder).
- Ölçüm zincirde: `kayip(metin)` milibit/bayt (8000 = rastgele). Ayrılmış doğrulama metni
  (`genesis/dogrulama.json`) hiçbir zaman öğrenilmez; her turdan sonra kayıp kategori 9 olarak
  hafızaya yazılır. Gerileme olursa kategori 7 (güvenlik) kaydı düşülür ve öneri kutusundan
  öğrenme durur.
- Zehirlenmeye karşı kurallar (`genesis-ajan.js`, sürüm 1): R1 boyut/UTF-8, R2 bağlantı, @etiket ve
  bilinmeyen 0x adresi yok, R3 tekrar yok, R4 aynı metin iki farklı adresten ve ilk öneri ≥ 24 saat.
  Bu kurallar bir iddianın **doğruluğunu** kontrol etmez; zehirlemeyi pahalı ve denetlenebilir yapar.
  Zincir verisine karşı doğruluk kontrolü sonraki modüldür.
- Testte ölçülen: 260 baytlık metinden sonra kayıp 8000 → 1180 mbit/bayt; öğrenme ~65k gaz/bayt.

## 5. Evrim motoru (şartname §9)

- Döngü `genesis-ajan.js dongu`: gözlemle → öneri kutusu → ölç → öğren → ölç → karşılaştır →
  kaydet → yay. Her tur kendi sonucunu hafızaya yazar.
- Modül etkinleştirme zincirde zaman kilitli: rutin 2 gün, kritik 7 gün; iptal her zincire yayılır;
  etkinleştirme her zincirde herkesçe yapılır. Ajan değişikliği 7 gün; son ajan çıkarılamaz.
- Değişmez korkuluklar `KORKULUK_METNI` sabitinde ve **yapı gereği doğru**: çekirdek hiçbir token
  tutmaz, hiçbir ARC PULSE sözleşmesini çağırmaz; kasa, itfa, köprü doğrulaması GENESIS'in
  erişiminde değil.
- **Sürüm 1'in açık sınırı:** GENESIS henüz kendi kodunu yazmıyor. Modüller ajan anahtarıyla
  önerilir ve zaman kilidinden geçer. Kod üretimi, hesaplama ağında çalışan bir kod modeline bağlıdır
  (yol haritası 3).

## 6. Hesaplama ağı (şartname §10)

- `GenesisHesap`: USDC (BNB'de pUSDC) emanet, sağlayıcı teminatı (asgari 5 $), taahhüt-açma, k=2..5
  mutabakat, ayrışana/sessize 1 $ ceza, mutabakat yoksa iade. Sahip yok, ücret yok, ayar yok.
- Sağlayıcı yazılımı `genesis-saglayici.js`: herkes kendi anahtarı ve teminatıyla çalıştırır.
  Şu an GENESIS-0 işlerini çalıştırır (çıktı belirlenimci). Büyük açık modeller için çalışma ortamı
  sabitlenmiş (ağırlık hash'i + runtime sürümü + greedy decoding) sağlayıcı eklentileri yol haritasında.
- Kurucu GPU almaz: kapasite, teminat yatıran bağımsız sağlayıcılardan gelir.

## 7. Dağıtım

- `scripts/dagit-genesis.js`: çekirdek ve dil modeli CREATE2 ile 7 zincirde aynı adrese
  (Arc, Robinhood, Base, Arbitrum, Avalanche, Monad, BNB), hesaplama pazarı zincir başına.
  Kuru çalışmada gaz ölçüldü: çekirdek ~6,0M, dil ~1,3M, pazar ~1,6M gaz.
- Ethereum: gaz parası yok, adres aynı kalacak. HyperEVM: küçük bloklar 3M gaz, çekirdek 6M ister →
  büyük blok modu gerekir. Solana/Sui/Aptos: aynı kimlik için Move/Rust program yazılmalı
  (aşağıda) — **henüz yok**, sayfa da yok demiyor, 7 zincir diyor.

## 8. Yol haritası (öncelik sırası)

1. Ana ağ dağıtımı, tohum bilgi, GENESIS-0 öğrenmesi, model kayıtları, ilk senkron.
2. Doğruluk modülü: zincir verisine dayanan iddiaları (adres, sabit, bakiye) ajanın kendisi okuyup
   doğrulasın; R4 yerine kanıtlı kabul.
3. Hesaplama ağında açık bir kod/dil modeli (sabitlenmiş ONNX + greedy) → GENESIS'in modül kodu
   önermesi; önerilen kod test hash'iyle birlikte zaman kilidine girer.
4. GENESIS-1: hesaplama ağında eğitilen küçük sinir ağı; ağırlık hash'i ve eğitim verisi kökü
   hafızada (mod 2), çıkarımı yine ağda.
5. Solana / Sui / Aptos eşleri (aynı hafıza mesaj biçimi), Ethereum, HyperEVM.
6. Ekonomi: `arastirma/genesis-ekonomi-onerisi.md` — DAO kararı olmadan hiçbir pay kodda yok.

## 9. Ölçümler (14 Ekim 2026)

- Foundry çatal testleri (Base, gerçek LayerZero uç noktası ve USDC): `genesis-test/` 13/13 GEÇTİ —
  sahipsizlik, eş kısıtı, hafıza kuralları, öneri kapısı, senkron (hash zinciri, tekrar, boşluk,
  bozuk veri), gerçek LayerZero ücretiyle gönderim, ajan/modül zaman kilitleri, GENESIS-0 öğrenme
  (kayıp 8000 → 1180 mbit/bayt) ve belirlenimci üretim, hesaplama pazarında mutabakat/ceza/iade/çekilme.
- Yerel anvil çatalında uçtan uca (ana ağ yok): CREATE2 ile çekirdek + dil kuruldu, 16 tohum bilgi
  yazıldı, zincirde öğrenme yapıldı (ayrılmış metinde kayıp 3026 → 2595 mbit/bayt), sayfanın kendi
  yardımcıları 16 bilgiyi zincirden okudu; "What is the gas token on Arc?" → doğru kayıt 1. sırada,
  "how much is the launch fee" → doğru kayıt 1. sırada (idf ağırlıklı arama).
- GENESIS-0 üretimi şu an kaba (trigram); sayfa bunu "small trigram model, still learning" diye etiketler.
- Ana ağ dağıtımı (`node scripts/dagit-genesis.js --uygula`) izin katmanında reddedildi; adresler
  belirlenimci (`docs/js/genesis-adres.js`), sayfa zincirde kodu görünce kendiliğinden canlanır.
