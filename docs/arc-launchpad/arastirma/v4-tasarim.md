# Sepet v4 — tasarım (Solidity tarafı)

23 Ekim 2026. Kullanıcı onayı: "Tamam yap" (yol haritası). İlke: **hiçbir adım bizim PC'mize bağlı değil**; her adımı ya kullanıcının kendi işlemi ya da herhangi biri yapar, başkasının yapması gerekebilecek yerde sabit küçük bir bahşiş vardır.

Ortak test launch'ında (PTEST2, 22 Eki) iki bulgu çıktı; v4 bunları ve yol haritasının geri kalanını çözer:

1. **İtfa geri dönüyordu** (`UcretYetmez(267547, 0)`): Defter itfada teminat satırı olan her zincirin kasasına (boş da olsa) LayerZero emri gönderiyor, ücreti Arc HaberciLZ'nin kendi (boş) bakiyesinden ödüyordu.
2. **Teminat tokenleri alınmıyordu**: kasalar ters Hollanda açık artırması açıyor, dolduran yok.

## Ne değişiyor, ne kalıyor

| Sözleşme | v4 | Not |
|---|---|---|
| HaberciLZ (9 EVM zinciri) | **KALIR** | Bağları, rotaları, ULN ayarları aynen. Ücreti zaten "bakiyesinden" ödüyor; v4'te o bakiyeyi itfa eden, aynı işlemde, tam ücret kadar doldurur. |
| IkizYayici, ikiz OFT'ler | **KALIR** | |
| SepetDefteri | YENİ | ücretli itfa, dolu-kasa kaydı, emir kuyruğu, bahşiş |
| SepetUcu | YENİ | `itfa` ücret + iade adresi alır |
| VergiKovasi | YENİ (launchpad içinde) | eşik yok; hook her işlemde boşaltır |
| PulseHook5 | YENİ (CREATE2) | vergiyi kovaya ödedikten sonra kovayı boşaltmayı dener (gaz sınırlı, hata yutulur) |
| PulseLaunchpad5, PulseLikiditeKasasi | YENİ | ucu/hook adresleri değişti |
| SepetKasasi (9 EVM) | YENİ | Uniswap v3 ile TWAP sınırlı alım/satım; havuz yoksa açık artırma yedek |
| MerkezKapi | YENİ | uzak itfada ücret (compose değeri) Ucu'ya geçer |
| LaunchEmaneti | YENİ | `isle` çağırana bahşiş |
| IkizHub (Arc), AktarmaLZ (Base) | YENİ | `merkez` / `hub` bir kez yazılır; MerkezKapi yeni olduğu için |
| PulseFabrika4, FthmYakici | KALIR | |

## 1. İtfa: ücreti itfa eden öder, yalnız dolu kasalara emir gider

### Ucu girişi (Arc)
```solidity
// v2 imzası korunur: ücretsiz itfa (hiç kasaya varlık gitmemişse yeterli; gerekirse emirler kuyruğa girer)
function itfa(address token, uint256 miktar, uint32 hedefZincir, bytes32 alici) external;
// v4: ucret (6 ondalık USDC, çağırandan transferFrom) emirlerin LayerZero ücreti; artan `iade`ye (Arc) döner
function itfaUcretli(address token, uint256 miktar, uint32 hedefZincir, bytes32 alici, uint256 ucret, address iade) external;
```

### Ucu → Defter mesajı (yalnız Arc içinde, yerel teslim)
`SepetMesaj.ITFA = 4`, v4 biçimi: `abi.encode(uint8 4, bytes32 token, uint256 miktar, uint32 hz, bytes32 alici, address iade)`; mesajla birlikte gelen dolar (`gelen`) **ücret bütçesidir**. Eski 5 alanlı biçim de okunur (iade = 0).

### Defter
```solidity
mapping(uint64 => mapping(uint32 => bool)) public kasaDolu;   // o zincirin kasasına bu launch için dolar/varlık gitti mi
function itfaUcreti(uint64 id, uint256 miktar, uint32 hz, bytes32 alici) external view returns (uint256 ucret6); // sitenin teklifi
struct Emir { uint32 zincir; uint64 id; uint256 bahsis; bool gitti; bytes veri; }
Emir[] public emirler;
function emirGonder(uint256 i) external;          // herkes: ücreti USDC olarak (approve) öder, emri gönderir, bahşişi alır
function emirUcreti(uint256 i) external view returns (uint256 ucret6);
uint256 public constant BAHSIS = 50_000;           // $0,05
```
Akış (`_itfa`):
1. Arz düşer; bekleyen USDC payı (`vp`) hesaplanır.
2. `kasaDolu[id][z]` olan her zincir için **v2 ile aynı SAT emri** kurulur. Ücreti `HaberciLZ.ucret(...)` ile okunur (Sui/Aptos CCTP yolu ve Arc'ın kendi kasası ücretsiz). Gönderilen bütçe yetmezse eksik kısmı **sahibin kendi bekleyen dolar payından** (`vp`) alınır. Ücret karşılanırsa HaberciLZ'ye aktarılır ve emir aynı çağrıda gider; gönderim hata verirse ya da ücret yine karşılanamazsa emir **kuyruğa** girer.
3. Kuyruğa giren her emir için bahşiş ayrılır: önce `vp`'den, yetmezse launch'ın Defter'de bekleyen dolarından (birkaç sent). O an hiç bekleyen dolar yoksa bahşiş, emir gönderilirken o anda bekleyen dolardan alınır.
4. `vp − bahşişler` sahibine ödenir; artan bütçe `iade`ye (yoksa sahibin Arc adresine; o da EVM değilse HaberciLZ'nin ücret bakiyesine) gider.
5. **İtfa uzak bir zincir yüzünden asla geri dönmez.**

### Uzak itfa (ikiz sahibi, MerkezKapi üzerinden)
`lzCompose` ile gelen yerel değer (Arc'ta USDC) itfanın ücret bütçesidir: `itfaEt{value: msg.value}` → `ucu.itfaUcretli(..., ucret = msg.value / 1e12, iade = yedek)`. Site, ikiz zincirinden itfa ederken compose seçeneğine `lzCompose` değeri olarak `itfaUcreti × 1,1` koyar. Solana/Sui/Aptos'tan (`hubIstek`) gelen itfada değer yoktur: emirler kuyruğa girer, bahşişle herkes gönderir.

## 2. Vergi doğrudan Defter'e

`VergiKovasi.gonder()` eşiksiz (bakiye > 0 ise hepsini `SepetUcu.vergi` ile Defter'e yollar, 0 ise sessizce döner). `PulseHook5._paraDagit`, vergiyi kovaya ödedikten sonra:
```solidity
if (v > 0 && gasleft() > KOVA_GAZ + 250_000) kasa.call{gas: KOVA_GAZ}(abi.encodeWithSelector(IKovaH.gonder.selector)); // sonuç yok sayılır
uint256 public constant KOVA_GAZ = 1_500_000;
```
Kova başarısız olursa (gaz, LayerZero) dolar kovada kalır; bir sonraki işlem ya da herhangi biri `gonder()` ile yollar. `dolasim()` aynı (balina kalkanı).

## 3. EVM kasaları: Uniswap v3'ten TWAP sınırlı alım

```solidity
constructor(IHaberci, IERC20S usdc, uint32 defterZincir, bytes32 defter, IV3Fabrika fabrika, address weth)  // fabrika = 0: DEX yok, açık artırma
uint32 public constant PENCERE = 1800;            // 30 dk TWAP
int24  public constant KAYMA_TICK = 300;          // TWAP'tan en fazla ~%3 kötü fiyat
function havuzVar(address varlik) external view returns (bool dogrudan, bool wethUzerinden); // site: bu varlık seçilebilir mi
function dene(uint64 l, address varlik) external;  // herkes: bekleyen alımı yeniden dener; ≥ $1 alınırsa BAHSIS
mapping(uint64 => mapping(address => uint256)) public alimBekleyen;  // satır doları, henüz alınmamış
```
- Havuz seçimi sahipsiz ve her alımda: `fabrika.getPool(usdc, varlik, fee)` (100/500/3000/10000), 30 dk gözlemi okunabilen ve `liquidity()` en yüksek olan. Doğrudan USDC havuzu yoksa WETH üzerinden iki adım.
- Fiyat sınırı: TWAP tick ± `KAYMA_TICK` → `sqrtPriceLimitX96`. Sandviç en fazla ~%3 kötüleştirebilir; sınırda takas durur, kalan dolar `alimBekleyen`de bekler.
- Gözlem geçmişi yoksa kasa `increaseObservationCardinalityNext(60)` çağırır, dolar bekler; sonra herkes `dene`.
- WETH adımında artan WETH launch'ın bakiyesine yazılır ve itfada payı ödenir (kaybolmaz).
- **İtfa (SAT) kasada:** önce bekleyen dolar payı; sonra her varlık payı aynı havuzlarda TWAP sınırlı satılır, dolar `_ode` ile sahibin zincirine. Satılamayan kısım: sahip EVM adresiyse **varlığın kendisi** bu zincirde ona; değilse açık artırmaya (yedek).
- Mesaj biçimleri (AL = 2, SAT = 3) **değişmedi**.
- **Gaz:** Arc HaberciLZ'nin emir seçeneği 600k lzReceive gazı (bir kez yazılmış). Bu, teslim içinde takasa yetmez: kasa 700k'dan az gazla takas denemez (alım doları bekler, itfa payı aynı birimle verilir). Bu yüzden v4 dağıtımı, HaberciLZ henüz kilitli değilken Base, Arbitrum, Avalanche ve HyperEVM için `ozelSecenekKur(domain, 1.600.000 gaz)` yazar (Ethereum 600k kalır: orada gaz pahalı). Dolar emirden sonra gelirse (genelde CCTP daha yavaş) emri `isleVeAl` ile herkes, istediği gazla yürütür ve bahşişi alır.

Zincir başına fabrika (zincirden doğrulandı, `dagit-v2.js v4`):

| Zincir | Uniswap v3 fabrikası | WETH | Not |
|---|---|---|---|
| Base | 0x33128a8fC17869897dcE68Ed026d694621f6FDfD | 0x4200…0006 | |
| Arbitrum | 0x1F98431c8aD98523631AE4a59f267346ea31F984 | 0x82aF…Bab1 | |
| Ethereum | 0x1F98431c8aD98523631AE4a59f267346ea31F984 | 0xC02a…6Cc2 | |
| Avalanche | 0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD | WAVAX 0xB31f…66c7 | |
| BNB | 0 (açık artırma) | | kasanın doları Dolar6 sarmalı; havuzlar ham Binance-Peg USDC ile |
| HyperEVM | 0xB1c0fa0B789320044A6F623cFe5eBda9562602E3 (HyperSwap V3, Uniswap v3 çatalı) | WHYPE 0x5555…5555 | geri çağrı adı `hyperswapV3SwapCallback`; kasa ikisini de karşılar |
| Monad, Robinhood | 0 (açık artırma) | | 23 Eki'de bilinen fabrika adreslerinde kod yok |
| Arc | 0 (açık artırma) | | Arc'ta yalnız v4 havuzları var, TWAP yok |

## 4. Bahşişler (sabit, taşınan değerden)

| Adım | Kim yapar | Bahşiş | Nereden |
|---|---|---|---|
| Kuyruktaki itfa emrini göndermek (`Defter.emirGonder`) | herkes (ücreti öder) | $0,05 | itfa edenin bekleyen payı → launch'ın bekleyen doları → (gönderim anında) bekleyen dolar |
| Varmış bir alım emrini yürütmek (`SepetKasasi.isleVeAl` → HaberciLZ.isle) | herkes | $0,05 | o emrin dolarından (≥ $1,05 ise) |
| Kasada alımı yeniden denemek (`SepetKasasi.dene`) | herkes | $0,05 | alınan satır dolarından (≥ $1 alınırsa) |
| Sui/Aptos launch'ını Arc'ta bitirmek (`LaunchEmaneti.isle`) | herkes | $0,05 | gelen dolardan (launch'tan artan / iade) |

## 5. Solana / Sui / Aptos'un yeni Defter'e bağlanması

Mesaj biçimi değişmedi; değişen yalnız **Defter adresi** ve (Solana kapısı için) **IkizHub adresi**:

- **Sui**: paket aynı. `sepet::haberci::kur<USDC>(8, 26, <v4 Defter>)` → yeni Haberci + Kasa nesnesi; `ikiz_ekle(26, Arc HaberciLZ)`. Arc HaberciLZ'de `ikiz[8]` (Sui yetki kimliği, paket başına sabit) değişmez. İkiz kapısı: `set_peer(30184, <v4 AktarmaLZ>)`.
- **Aptos**: Arc HaberciLZ `ikiz[9]` eski Haberci nesnesine yazılı (tek seferlik) → `pulse_sepet` paket yükseltmesi: Haberci'nin `defter` alanını kurucu bir kez yenileyebilsin (sonra kilit). İkiz kapısı: `set_peer(30184, <v4 AktarmaLZ>)`.
- **Solana**: `pulse-sepet` yükseltmesi (config.defter bir kez yenilenir), `pulse-kapi` yükseltmesi (store.hub → v4 IkizHub). Program kimlikleri, ALT ve Arc'taki bağlar aynı.
- O zincirlere giden AL/SAT emirlerinin bayt düzeni v2 ile birebir aynı (`abi.encode(uint8 2, uint64 id, bytes32 varlik, uint256 ref)` / `abi.encode(uint8 3, uint64 id, bytes32[] varliklar, uint256 miktar, uint256 arz, uint32 oz, bytes32 alici)`).

## Ölçümler (23 Ekim, yerel / çatal, ana ağa işlem yok)

- `scripts/denetim-v4-arc.js` **17/17** — Arc ana ağ durumu, eth_simulateV1, yeni set simülasyonda dağıtılarak: launch, 2.000 $ alım + satış, kovada 0 kaldı (vergi işlemde Defter'e), iki satır $50'yi geçip kasalarına gitti (Base: LayerZero + Circle), ücretli itfa (Base emri 0,2675 $ ile aynı çağrıda), artan marj iade, ücretsiz itfa kuyrukta 0,05 $ bahşişle, yabancı emri gönderip bahşişi aldı, ikiz sahibinin uzak itfası compose değeriyle ücreti ödedi.
- `nesil2-test/test/Kasa4Dex.t.sol` **24/24** — Base, Arbitrum, HyperEVM çatalları, gerçek havuzlar: 50 $ alım TWAP'ın %1'i içinde, fiyat sınırın ötesine itilince alım durdu ve dolar bekledi, fiyat dönünce `dene` ile bitti ve bahşiş ödendi, WETH üzerinden iki adım (Base BRETT, Arbitrum wstETH), itfa payı satıldı ve ~5 $ ödendi, satış sınırda durunca kalan sahibine varlık olarak gitti, `isleVeAl` bahşişi.
- Mevcut denetimler: defter 18/18, merkez-kapi 35/35, haberci-lz 27/27, v2-arc 11/11, v2-prova 9/9, launch-emaneti 15/15, sepet forge takımları 40/40.
- `dagit-v2.js v4` kuru: Arc 20,1M gaz ~0,84 USDC, diğer zincirler kuruşluk (Monad ~0,66 MON).

## v3 çıkışları (Cikis.sol) neden kaldırıldı

v3, sahibin tarayıcısının ürettiği relay yatırma adreslerine birim gönderiyordu; relay yalnız büyük tokenlerde adres veriyor (FTHM/ARB/meme reddedildi). v4'te EVM kasası payı **kendi DEX'inde TWAP sınırlı satıp** doları Circle/relay ile sahibin zincirine yolluyor; satılamayan kısım sahibin EVM adresine varlığın kendisi olarak gidiyor. Böylece tarayıcı adres üretmek zorunda değil, tek yol var, sözleşme küçüldü. `ITFA_CIKIS`/`SAT_CIKIS` (6/7) mesajları hiçbir zaman ana ağa çıkmadı.
