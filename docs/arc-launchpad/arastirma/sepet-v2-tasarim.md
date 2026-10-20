# Sepet v2 — bilgisayarsız haberleşme (18 Ekim 2026)

Kullanıcı: "topluluğa bıraktığımızda bizim PC'de çalışan bir şey olmaması lazım".
Kural: her adım ya bir altyapının kendi teslimatçısıyla (Circle forwarding,
LayerZero executor, relay çözücüleri) kendiliğinden olur, ya da o adımdan
çıkarı olan kişinin (ihaleyi dolduran, parasını alan kullanıcı) işlemiyle.
Bizim bekçi yalnız katılımcılardan biri; dursa sistem durmaz.

## Neden v1 yetmiyor
- HaberciCctp her mesajı "hedef çağıran = karşı Haberci" ile yollar → Circle
  forwarding kullanılamaz (destinationCaller desteklemiyor) → her teslimi
  birinin yapması gerekir.
- Solana'ya emir hiç teslim edilemez (çağıran imzalı olmalı, alıcı program).
- BNB/Robinhood'a Circle USDC girmiyor (ada taşıyıcısı = bizim cüzdan).
- Defter ve kasalar Haberci'yi immutable tutar → set yeniden kurulur.

## İki ayrı kanal
1. **Emir kanalı: LayerZero.** Defter → kasa (AL, SAT), giriş → Defter (ITFA).
   Her zincirde bir "Haberci-LZ" OApp'i (EVM sözleşme; Sui/Aptos Move;
   Solana kapı programı). Executor `lzReceive`'i kendiliğinden çalıştırır,
   ücreti gönderen öder. Emir kaydedilir; dolar gelmişse hemen, gelmemişse
   ihaleyi dolduranın işleminde yürütülür.
2. **Dolar kanalı.**
   - Arc, Base, Arbitrum, Ethereum, Avalanche, Monad, HyperEVM, Solana:
     CCTP düz yakım + Circle forwarding hook'u → kasanın adresine
     kendiliğinden basılır (ücret tutardan, `maxFee` Iris'ten).
   - BNB, Robinhood: relay.link AÇIK yatırma adresi (Arc USDC → o zincirin
     USDC'si, alıcı = o kasa). Kurulumda bir kez üretilir, Defter düz
     transferle gönderir. Ücret ~%0,7–0,8.
   - Sui, Aptos: CCTP (forwarding yok) → dolar mesajını ihaleyi dolduran
     teslim eder (teslim + kabul + uygula + doldur tek işlem).

## Ödemeler (kullanıcıya)
- Satış: yeni MerkezKapi (fe08c5e) — Arc'ta düz transfer ya da Circle
  forwarding. Relay yatırma adresi Arc'ta olduğundan BNB/Robinhood da olur.
- İtfa: her kasa sahibin payını **Arc'a** forwarding ile öder (Sui/Aptos
  kasaları forwarding isteyemez → sahip Arc'ta tek tıkla alır). Sahibin Arc
  adresi relay yatırma adresi olabilir (istediği zincir/token).

## Yeni sözleşmeler
- HaberciLZ (EVM, sahipsiz, peer'ler kurulumda, DVN'ler LZ Labs + Nethermind)
- SepetDefteri v2 (emir LZ'den, dolar forwarding/relay adresinden)
- SepetKasasi v2 (emir LZ'den kaydedilir; `uygula` dolar varsa; ödeme forwarding)
- SepetUcu v2 (itfa emri LZ ile Defter'e)
- Move: Sui/Aptos sepet modüllerinde emir girişi LZ kapısından
- Solana: kapı programı (LZ) + pulse_sepet (emirci = kapı PDA'sı)
- TekAdim yardımcıları: teslim + uygula + doldur tek işlem (EVM, Sui PTB, Aptos)

## Sıra
1. HaberciLZ (EVM) + Defter/Kasa/Ucu v2, ana ağ çatallarında test
2. Sui/Aptos emir girişi (LZ) + tek işlem doldurma
3. Solana kapısı
4. 2. nesil ikizler (aynı LZ kapıları)
5. Site: satış/itfa ödeme adresi + Iris ücreti
6. Tek kurulum → kullanıcıyla kontrol → kullanıcının onayıyla launch

## 2. nesil ikizler: Arc'ta tek ikiz merkezi (18 Ekim)
Sorun: LayerZero'nun Sui/Aptos OApp çerçevesinde her eid için TEK peer var;
Arc'ta her tokenin ayrı adaptörü olduğundan EVM dışı tek bir kapı yüzlerce
adaptörden mesaj kabul edemez.
Çözüm: **IkizHub (Arc)** — Solana/Sui/Aptos kapılarının tek peer'i.
- EVM ikiz ağı (IkizYayici, 9 zincir, 67/67) olduğu gibi kalır.
- EVM dışına giden token merkezde KİLİTLENİR, kapıya mesaj gider (token,
  alıcı, miktar); gelen mesaj kilidi açar. Merkezdeki kilitli = EVM dışı
  ikizlerin toplam arzı (değişmez kural).
- Launch: MerkezKapi, merkez üzerinden Solana/Sui/Aptos kapılarına "yarat"
  mesajı (ad, sembol) yollar; kapılar ikizi oluşturur (Aptos FA, Solana mint
  PDA'sı; Sui'de coin tipini şablondan herkes yayınlar, kapı ad/sembol/sıfır
  arzı doğrulayıp kaydeder — kim yayınlarsa yayınlasın eşdeğer).
- Satış/itfa EVM dışından: kapı → merkeze mesaj (bileşik istek) → merkez
  tokeni MerkezKapi'ye verir ve aynı çağrıda satışı/itfayı yürütür.
- Alım EVM dışına: MerkezKapi tokeni merkeze kilitler, kapı alıcıya basar.
