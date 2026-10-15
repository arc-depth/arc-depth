# FTHM iki zincirde: Arc'ta USDC, Robinhood'da USDG

**Tarih:** 2026-10-12 · **Durum:** tasarım, dağıtılmadı

## İstenen

FTHM hem Arc'ta (USDC ile) hem Robinhood Chain'de (USDG ile) işlem görsün,
iki zincir arasında taşınabilsin, kullanıcıya tek havuz gibi görünsün ve iki
fiyat arasındaki fark dışarıya arbitraj fırsatı vermesin.

## Ölçülenler (2026-10-12)

| Ne | Değer | Kaynak |
|---|---|---|
| Robinhood Chain 24 saat DEX hacmi | ~574 M $ | DefiLlama |
| Arc 24 saat DEX hacmi | ~30 M $ (7 günde -%56) | DefiLlama |
| CCTP Arc'ta | **var**, domain 26 | developers.circle.com |
| CCTP Robinhood'da | **yok** | aynı liste |
| USDG Robinhood'da | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 696,4 M arz | zincirden `totalSupply` |
| USDG Arc'ta | **yok** (Paxos 7 ağ listeliyor, Arc değil) | docs.paxos.com |
| LayerZero EndpointV2 Arc | `0x6f47…dd5b`, eid **30417**, 24.005 bayt kod | metadata API + `eth_getCode` |
| LayerZero EndpointV2 Robinhood | `0x6f47…dd5b`, eid **30416**, 24.005 bayt kod | aynı |

Sonuç: **dolar zincirler arası taşınamaz** (USDC'nin Robinhood'a CCTP yolu,
USDG'nin Arc'a hiçbir yolu yok). **FTHM taşınabilir**, LayerZero iki uçta da
canlı. Tasarım bu iki gerçeğe göre kurulu: her zincir kendi dolarını tutar,
yalnızca FTHM gezer.

## Mimari

### 1. FTHM köprüsü — LayerZero OFT

- **Arc:** FTHM'de mint yok (1.662 baytlık değişmez kontrat). Bu yüzden
  `FTHMOFTAdapter` kilitle/çöz yapar: Robinhood'a giden FTHM Arc'ta kilitlenir.
- **Robinhood:** `FTHM` OFT kontratı yalnızca köprüden gelen mesajla basar,
  geri giderken yakar.
- **Değişmez kural:** Robinhood'daki FTHM arzı = Arc'ta kilitli FTHM. Toplam
  arz 1 milyarda kalır, iki zincirde birden.
- **Sahip sorunu:** OFT'nin yapılandırması (peer, DVN, yürütücü) bir sahip
  ister. Yapılandırma bitince sahiplik `0x…dEaD`'e yakılır; projenin "sahip
  yok, setter yok" ilkesi korunur. Bedeli: yapılandırma bir daha değişmez.
- **Güvenlik:** zorunlu DVN'ler en az iki bağımsız doğrulayıcı (LayerZero Labs
  + bir ikinci sağlayıcı), ikisi de imzalamadan mesaj geçmez. Tek bir
  doğrulayıcı = tek anahtar = projenin reddettiği şey (`kopru/KARAR.md`).

### 2. İki havuz, tek fiyat

- **Arc:** mevcut FTHM/USDC havuzu.
- **Robinhood:** yeni FTHM/USDG Uniswap v4 havuzu + hook.

**Fizik:** iki ayrı zincirdeki iki havuzun fiyatı her an birebir eşit olamaz;
zincirler arası mesaj saniyeler sürer. "Fark hiç olmasın" mümkün değil.
Mümkün olan: **farktan dışarıdaki kimse kazanmasın.**

Çözüm — **fark ücreti:** her iki hook, diğer zincirin son fiyatını
(LayerZero mesajıyla taşınan) referans tutar. Bir işlem iki fiyatı
birbirinden uzaklaştırıyorsa ya da aradaki farktan yararlanıyorsa, hook
dinamik ücreti **tam o fark kadar** yükseltir. Arbitrajcının kârı sıfıra
iner; fark ücret olarak kasaya, yani tabana gider. Fiyatı yakınsatan yöndeki
işlemler normal ücret öder.

### 3. Tek havuz görüntüsü

Site ve yönlendirici iki havuzun derinliğini toplayıp tek fiyat ve tek
derinlik gösterir; alım satımı hangi zincir daha iyi fiyat veriyorsa oradan,
gerekirse bölerek yapar. Kullanıcı iki havuz görmez.

### 4. Ortak taban

FTHM tabanı = (Arc'taki USDC + Robinhood'daki USDG) / dolaşımdaki FTHM.
İki dolar da 1:1 itfa edilen, düzenlenmiş stabil coin (Circle, Paxos). Bir
zincirde yakılan FTHM o zincirin dolarından pay alır.

## Açık riskler

1. **USDC/USDG ayrışması:** iki stabil coin teoride 1:1 ama ihraççıları
   farklı. Biri ayrışırsa iki tabanın değeri ayrılır.
2. **Referans fiyat gecikmesi:** fark ücreti, mesaj gecikmesi kadar eski bir
   fiyata bakar. Hızlı hareketlerde fark ücreti fazla ya da eksik kesebilir.
3. **Sahipliği yakmak geri alınamaz:** LayerZero bir DVN'i emekliye ayırırsa
   köprü yapılandırması güncellenemez.
4. **FTHM havuz derinliği:** Arc havuzunda bugün gerçek çıkış derinliği ~4 $.
   Robinhood havuzu açılırken iki tarafına da gerçek dolar konmalı; yalnızca
   token koymak aynı hatayı tekrarlar.

## Aşamalar

1. **OFT köprüsü:** `FTHMOFTAdapter` (Arc) + `FTHM` OFT (Robinhood), yerel
   testler, testnet (Arc eid 40434 ↔ Robinhood eid 40451) gidiş-dönüş.
2. **Robinhood havuzu + fark ücreti hook'u**, testnet.
3. **Tek havuz yönlendiricisi ve site görünümü.**
4. **Ana ağ dağıtımı** — kullanıcı onayıyla.
