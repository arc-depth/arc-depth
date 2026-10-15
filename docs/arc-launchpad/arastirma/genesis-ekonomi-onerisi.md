# PULSE GENESIS — ekonomi

**KARAR (kurucu, 15 Ekim 2026): GENESIS'in bütün gelirlerinin %70'i kurucuya** (platform işletme adresi
0x8918…11D0, sözleşmede değiştirilemez sabit), **%30 büyümeye** (zincirin DAO yönetimli geliştirici fonu).
Uygulandığı yerler: `GenesisHesap` (mutabakatla biten işte ödülün %2'si ücret → %70/%30) ve
`AtlasAbonelik` (her satış anında %70/%30, sözleşmede para kalmaz). Aşağıdaki ilk öneri metni
tarihçe olarak duruyor; içindeki "kodda hiçbir pay yok" cümlesi artık geçerli değil.

## İlk öneri (14 Ekim, karar öncesi)

Şartname §12: "Gelir dağılımı için kendi kendine yeni yüzdeler belirleme. Mevcut kurucu haklarını
değiştirme. Önce mevcut ekonomik yapıyı incele. Yeni gelir kaynakları için önerilerini ayrı olarak sun."

Bu belge o ayrı sunumdur. **Kodda hiçbir GENESIS payı yoktur**: `GenesisHesap` ücret almaz,
`GenesisCekirdek` hiç para tutmaz. Aşağıdakilerin hiçbiri DAO (ya da kurucu) karar vermeden uygulanmaz.

## Mevcut yapı (koddan, değişmedi)

- Launch havuzlarında her işlem %2: kurucu %0,30 · geliştirici fonu %0,30 · likidite kasası %0,50 ·
  işletme %0,20 · havuz derinliği %0,70 (`contracts/PulseHook.sol`).
- Teminat vergisi %1–5, tamamen o tokenin kasasına (`PulseLaunchpad3`).
- Launch ücreti ilk alımın %2'si (`LAUNCH_UCRET_PPM`).
- FTHM, DAO ve staking ayrı; GENESIS hiçbirine dokunmuyor.

## GENESIS'in gelir kaynakları (öneri)

1. **Hesaplama pazarı protokol payı.** `GenesisHesap` bugün ücretsiz. Öneri: DAO bir pay seçerse
   yeni bir pazar sürümü o payı yalnız ödülden (sağlayıcı teminatından değil) alır; pay sabit ve
   sözleşmede değişmez olur. Önerilen aralık DAO'nun seçimine bırakılır: düşük (ör. %1–5) seçenekler
   pazar büyürken sağlayıcıyı kaçırmaz.
2. **API kullanımı.** GENESIS-0 çağrıları zaten herkese açık view; ücretlendirilecek olan, hesaplama
   ağındaki büyük model işleridir (madde 1 ile aynı mekanizma).
3. **Güvenlik hizmeti.** Ekosistem içi sözleşme izleme raporları (dış kullanıcılara yazılım
   geliştirme hizmeti verilmez — şartname §8).
4. **Zincirler arası altyapı.** Hafıza senkronu ve FTHM yolları için ödenen LayerZero ücretlerinin
   üstüne ek yok; öneri, ek ücret konmaması.

## Dağıtım hedefleri (öneri — yüzdeler DAO'nun)

Şartnamedeki altı alıcı: kurucu şirket · GENESIS'in gelişimi · FTHM ekosistemi · geliştiriciler ·
hesaplama sağlayıcıları · güvenlik/araştırma. Öneri, bunların **yüzdelerini değil yöntemini**
belirlemek:

- Gelir tek bir GENESIS hazinesine (sahipsiz, yalnız DAO zaman kilidiyle harcanan) girer.
- DAO bir kez dağıtım tablosu oylar; tablo değişikliği yine oy + zaman kilidi ister.
- Kurucunun mevcut hakları bu tablonun dışında ve dokunulmaz kalır.
- GENESIS'in kendisi tabloyu değiştiremez (korkuluk 5).
