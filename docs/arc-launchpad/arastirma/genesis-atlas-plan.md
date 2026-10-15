# GENESIS ATLAS + İCAT MOTORU — plan ve gerçek durum

Kullanıcı metni (14 Ekim 2026 gece): GENESIS ATLAS (blockchain haritası, navigasyon, otonom keşif,
bağımsız veri, FTHM staking ile manuel erişim, USDC ile API satışı) ve AUTONOMOUS LAUNCHPAD
INVENTION ENGINE. Kural: ayrı yapay zekâ ya da token yok; GENESIS'in yeni yeteneği; çalışan hiçbir
şeye dokunulmaz; İcat Motoru mevcut kurulum tamamlandıktan sonra devreye girer.

## Önce gerçek durum (koddan)

- **Staking seviyeleri:** canlı `Stake` (Arc, 0xAbD3…d2de) iki seviye tanır, başka seviye yok:
  (1) **staker** — herhangi bir miktar, emisyondan kazanır; (2) **oy seviyesi** — `MIN_OY_GUCU`
  = 50.000 FTHM, değiştirilemez sabit. Atlas yeni seviye uydurmaz: gelişmiş harita ve GENESIS'e
  Atlas araştırması **staker** seviyesiyle açılır (stakedOf > 0). Manuel araştırma ek ücret istemez.
- **DAO:** Arc'taki `Governor` (0x1084…8D95) oy + zaman kilidiyle kendi çağrısını yürütür. Atlas
  API gelirinin nereye gideceği ve fiyatlar DAO'nundur; kodda DAO dışında kimse çekemez/değiştiremez.
- **Veri kaynağı:** yalnız herkese açık RPC'ler (zaten kullanılanlar) ve açık veri listeleri
  (chainid.network, LayerZero metadata API, Circle CCTP alan listesi). Ücretli veri API'si yok.
- **Barındırma sınırı:** site GitHub Pages (statik). Ücretli API'nin çalışacağı halka açık bir sunucu
  bugün yok; sunucu kodu yazılır ve yerelde çalışır, yayına almak bir barındırma kararıdır.

## ATLAS bileşenleri

| Parça | Dosya | Ne yapar |
|---|---|---|
| İndeksleyici | `scripts/atlas-indeks.js` | Her zincirden doğrudan: blok, gaz, yerel USDC arzı, CCTP V2 yakımları (zincirler arası dolar akışı, kaynak→hedef), LayerZero uç nokta mesajları (hedefe göre), Uniswap v4 yeni havuzları. Anlık görüntü + geçmiş. |
| Keşif ve analiz | aynı betik | Açık zincir listesinden yeni ağ keşfi; önceki görüntüye göre akış sıçraması, yeni havuz dalgası; analiz yöntemleri geçmiş üzerinde sınanır, en iyisi seçilir. Keşifler GENESIS hafızasına kategori 8 olarak yazılır (çekirdek zincirdeyken). |
| Harita | `docs/js/gorunum/atlas.js` (GENESIS sayfasında) | Kanvas: zincirler düğüm, köprüler kenar, akışlar hareketli parçacık; yakınlaştırma/kaydırma, arama, filtre, geçmiş kaydırıcı, düğüme tıkla → ayrıntı + "GENESIS'e araştırt". Temel görünüm herkese, gelişmiş katmanlar staker'a. |
| Navigasyon | aynı sayfa | Kaynak zincir/varlık → hedef: CCTP V2 (standart/hızlı), relay.link (ücretsiz açık API), FTHM kapısı; ücret, süre, risk karşılaştırması; kullanıcı imzasıyla mevcut altyapıdan yürütme. |
| API satışı | `contracts/genesis/AtlasAbonelik.sol`, `scripts/atlas-api.js`, sayfada belge | USDC ile kullanım paketi / aylık abonelik / kurumsal; API anahtarı = cüzdan imzası (sızacak gizli anahtar yok); sunucu ödemeyi zincirden okur. FTHM staking istenmez. Gelir sözleşmede, yalnız DAO çeker. |

## İCAT MOTORU

- `genesis/icat/` — simülasyon ve stres testi tezgâhı: AMM/likidite tasarımları aynı işlem akışları
  ve fiyat yollarıyla yarıştırılır (kayma, sermaye verimliliği, LP sonucu, teminat tabanı).
- Her deney bir **Proof of Invention** belgesi üretir: problem, mekanizma, model, kod, simülasyon,
  karşılaştırma, riskler, sermaye, avantaj, **yenilik araştırması** (literatür taraması yapılmadan
  "ilk" denmez; alan boş bırakılır ve öyle yazılır).
- Üretime giden yol: yalnız prototip + test; mevcut kontratlara, kasalara, fonlara dokunmaz.
  Entegrasyon için güvenlik testi + bağımsız denetim + açık onay gerekir (şartname §6).
- **Devreye alma:** GENESIS çekirdeği zincire çıktıktan sonra (kullanıcının talimatı). O zamana kadar
  tezgâh yerelde çalışır, sonuçlar `genesis/icat/sonuclar/` altında; çekirdek canlanınca kategori 11
  (algoritma) kayıtları olarak hafızaya yazılır.
