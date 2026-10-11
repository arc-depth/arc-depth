# Köprü dağıtılmıyor

**Tarih:** 2026-10-08
**Durum:** kapatıldı, dağıtılmadı

## Karar

`kopru/` altındaki imzacı ve gönderici **dağıtılmayacak**. Üç imzacı anahtarı
üretilmeyecek.

## Neden

Köprünün tek işi şu: Robinhood Chain'deki `StockVault` üzerinde bir `Locked`
olayını izlemek ve Arc'taki `WrappedStock` kontratına mint bildirimi imzalamak
(ters yönde `release`). Yani köprü **hisse hattının kendisi**.

Hisse hattı üründen çıkarıldı:

- `docs/app.html` köprü ve yönetişim görünümleri silindi, kuyruk yolu kaldırıldı
- `docs/index.html` yeniden yazıldı; hisse ve eski yönetişim tokeni geçmiyor
- Yeni launchpad `0x46E14d98a0597B4D65259F24608625f58d68e2C0` dağıtıldı ve
  `setQueue` `0x…dEaD` adresine yakıldı — kuyruk üzerinden ücretsiz launch yolu
  kalıcı olarak kapandı

Dağıtılmayan bir şeyin anahtarı da olmaz. İstenen şey "ulaşılması imkânsız olsun,
dokunulmasın" idi; bunun en güçlü biçimi anahtarı erişilemez saklamak değil,
**hiç üretmemek**. Bu sistemde artık hiçbir ayrıcalıklı çağrı yok: sahip yok,
setter yok, duraklatma yok, yükseltme yok. Köprü dağıtılsa, anahtar taşıyan tek
şey o olurdu.

## Üç anahtarı tek makinede üretmek neden 2-of-3 değildir

İmzacı yapılandırması bunu kendi içinde söylüyor:

> `imzaDizini` — "Iki imzaci AYRI makinelerde calismali; ayni makinede iki surec
> calistirmak esigi suse cevirir."

Üç anahtar da aynı diskte duruyorsa, o diske erişen üçünü de kullanır. Eşik 2
yazar, gerçekte 1 olur. Kostüm giymiş bir 1-of-1, dürüst bir 1-of-1'den daha
kötüdür, çünkü okuyan kişi korunduğunu sanır.

## Eski hisse yolunun bugünkü durumu (ölçülmüş, blok 24916896 sonrası)

| Ne | Değer |
|---|---|
| Eski launchpad `0x2506…Ba22` → `launchCount` | **0** |
| Eski kuyruk `0x98C2…0860` → `talepSayisi` | **0** |
| Eski kuyruk → `hisseSayisi` | 2 (wNVDA, wAAPL hâlâ listede) |
| Eski kuyruk → `operator` | `0x8918…11D0` (bizim cüzdan) |

Hiçbir yerde hiç launch yapılmamış. Kuyruktaki bir istek ancak `karsila` ile
tokene dönüşür ve `karsila`yı yalnızca operatör çağırabilir. Operatör çağırmazsa
istek `iadeAl` ile geri döner — o fonksiyon izin istemez, müşteri kendi parasını
kendi çeker. Yani eski yol **bizim bir işlem göndermemiz olmadan hiçbir şey
üretemez**, ve göndermeyeceğiz.

Bunun bir sonucu var: kuyruğun teminat listesindeki iki karşılıksız sarmalın
(bkz. `wnvda-karsiliksiz-teminat`) listeden düşürülmesi **sitenin yayına
girmesinin önünde bir engel değil**. Site kuyruğu hiç göstermiyor, yeni
launchpad kuyruğa kapalı, ve eski yol atıl. Düşürme işlemi hâlâ yapılabilir ama
artık aciliyeti yok ve ölü yönetişime bağlı olduğu için kolay da değil.

## Bu karar geri alınırsa ne gerekir

1. Üç imzacı adresi **üç ayrı makineden**, sahipleri tarafından üretilir. Bu
   depodaki hiçbir betik anahtar üretmez ve üretmemeli.
2. `kopru/yapilandirma.json` gerçek kontrat adresleriyle doldurulur. İmzacı artık
   sıfır adresi reddediyor — örnek dosya alanları bilerek sıfır bırakıyor ve
   yarı dolu bir yapılandırma sessizce geçemez.
3. `finalitePolitikasi` kararı verilir. `sadece-derinlik` riski yazılı olarak
   kabul etmek demektir: 64 sequencer bloğu altında kalmış bir olay, L1'e hiç
   gönderilmemiş ya da farklı gönderilmiş bir partiye ait olabilir. `l1-parti`
   gerçek bağlamadır ve **henüz yazılmadı**; imzacı o değerle çalışmayı reddeder.
4. Hisse hattının hukuki durumu yeniden değerlendirilir
   (`arastirma/hukuk-ve-odeme.md`): SEC'in 28 Ocak 2026 personel açıklaması
   üçüncü taraf sarmalları ikiye ayırıyor ve sentetik olanlar "ABD'deki bireysel
   yatırımcılara teklif edilemez veya satılamaz" diyor.
