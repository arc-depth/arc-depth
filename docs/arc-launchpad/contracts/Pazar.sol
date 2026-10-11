// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20P {
    function transferFrom(address from, address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title Pazar — ARC PULSE geliştirici pazarı
///
/// Geliştiriciler ürün yayınlar, müşteriler USDC ile satın alır, hasılat
/// %80 geliştiriciye / %20 platforma ayrılır. Lisans zincirde durur ve
/// herkes doğrulayabilir.
///
/// BU SÖZLEŞME HİÇ PARA TUTMUYOR — VE BU BİR TERCİH DEĞİL, BİR GARANTİ
///   `satinAl` alıcıdan çekilen USDC'yi aynı işlemde iki hedefe gönderiyor:
///   geliştiriciye ve işletmeye. Sözleşmenin bakiyesi hiçbir zaman artmıyor.
///
///   Bunun sonucu şu: çekilecek bir para olmadığı için `withdraw`, `sweep`,
///   `rescue` gibi bir fonksiyona gerek yok — ve olmadığı için kimse
///   kullanamaz. "Protokol fonları kendi cüzdanına çekilemez" kuralı burada
///   bir söz değil, yapının kendisi. Bir havuz tutup sonra "yalnızca şu
///   adres çekebilir" demek, o adrese güvenmeyi gerektirirdi.
///
///   `kurtar` diye bir fonksiyon da yok. Yanlışlıkla buraya gönderilen bir
///   token burada kalır. Bunun bedeli küçük, alternatifi ise her tokeni
///   herhangi bir adrese gönderebilen bir fonksiyon olurdu.
///
/// ZİNCİRDE NE YOK
///   Ürün bilgisi (açıklama, görsel, indirme adresi) zincirde değil; yalnızca
///   bir `uri` duruyor. API anahtarı, gizli uç nokta ya da müşteri verisi
///   buraya YAZILMAZ: zincir herkese açık ve geri alınamaz. Lisans
///   doğrulaması `lisansliMi()` ile yapılır, yani geliştirici bir sırrı
///   paylaşmak zorunda kalmıyor — alıcının adresi yeterli.
///
/// YUVARLAMA GELİŞTİRİCİNİN LEHİNE
///   platform = fiyat * %20, geliştirici = fiyat - platform. Yani tam
///   bölünmeyen kuruş platforma değil geliştiriciye kalıyor. Ters yönü
///   seçmek, her satışta platforma bir birim fazla veren sessiz bir vergi
///   olurdu.
///
/// KAPATMAK SATILMIŞ LİSANSI İPTAL ETMİYOR
///   `kapat` yalnızca YENİ satışı durduruyor. Satılmış bir lisansı geri
///   almak, parasını ödemiş birinin elinden ürünü almak olurdu; geliştirici
///   ürünü listeden çekebilir ama geçmişi çekemez.
contract Pazar {
    /// Ödeme birimi. Arc'ta gas token'ın kendisi USDC ama bu ERC20 tarafı.
    IERC20P public immutable quote;

    /// Platform payının gittiği adres. Immutable: yönlendirilebilen bir pay
    /// adresi, yönlendirebilen biri demek.
    address public immutable isletme;

    /// %20. Sabit: "değiştirilemez ücret" kuralı burada da geçerli, ve bir
    /// setter olsaydı o setter'a kimin sahip olduğu sorusu doğardı.
    uint256 public constant PLATFORM_PPM = 200_000;

    /// Bir defalık satın almanın bitişi. Sonsuz yerine uint64 tavanı:
    /// karşılaştırmalar tek tip kalıyor.
    uint64 public constant SURESIZ = type(uint64).max;

    struct Gelistirici {
        bool kayitli;
        uint64 zaman;
        string uri;
    }

    struct Urun {
        address gelistirici;
        /// USDC, 6 ondalık. 0 serbest bırakılıyor: ücretsiz bir ürün geçerli
        /// bir listelemedir ve o satışta platform payı da sıfırdır.
        uint256 fiyat;
        /// 0 ise bir defalık (süresiz lisans), değilse abonelik süresi.
        uint64 periyot;
        bool acik;
        string uri;
        uint256 satis;
        uint256 hasilat;
    }

    mapping(address => Gelistirici) public gelistirici;
    Urun[] public urunler;
    mapping(address => uint256[]) internal _gelistiriciUrun;

    /// Ürün -> alıcı -> lisansın bittiği an. 0 hiç lisans yok demek.
    mapping(uint256 => mapping(address => uint64)) public lisansBitis;

    /// İtibar yalnızca ödemiş olandan. 0 puan verilmemiş demek.
    mapping(uint256 => mapping(address => uint8)) public puan;
    mapping(uint256 => uint256) public puanToplam;
    mapping(uint256 => uint256) public puanSayisi;

    /// Panolar için defter. Olaylardan da çıkarılabilirdi ama bir panonun
    /// "ne kazandım" sorusuna bir çağrıyla cevap vermesi gerekiyor.
    mapping(address => uint256) public gelistiriciKazanci;
    uint256 public platformKazanci;
    uint256 public toplamHasilat;

    event Kaydoldu(address indexed gelistirici, string uri);
    event ProfilGuncellendi(address indexed gelistirici, string uri);
    event UrunEklendi(uint256 indexed id, address indexed gelistirici, uint256 fiyat, uint64 periyot, string uri);
    event UrunGuncellendi(uint256 indexed id, uint256 fiyat, bool acik, string uri);
    event SatinAlindi(
        uint256 indexed id,
        address indexed alici,
        uint256 odenen,
        uint256 gelistiriciPayi,
        uint256 platformPayi,
        uint64 bitis
    );
    event Puanlandi(uint256 indexed id, address indexed veren, uint8 puan);

    error KotuKurulum();
    error KayitliDegil();
    error ZatenKayitli();
    error BilinmeyenUrun();
    error SadeceSahibi();
    error UrunKapali();
    error TransferOlmadi();
    error LisansYok();
    error ZatenPuanladi();
    error KotuPuan();
    error BosUri();

    constructor(IERC20P _quote, address _isletme) {
        if (address(_quote) == address(0) || _isletme == address(0)) {
            revert KotuKurulum();
        }
        quote = _quote;
        isletme = _isletme;
    }

    /* ---- kayıt ------------------------------------------------------- */

    /// İzinsiz. Bir onay kapısı koymak, onaylayacak birini gerektirirdi ve
    /// bu pazarın amacı dış geliştiricinin kendi başına başlayabilmesi.
    /// Kalite kapısı kayıt değil, itibar ve satış sayısı.
    function kaydol(string calldata uri) external {
        if (gelistirici[msg.sender].kayitli) revert ZatenKayitli();
        if (bytes(uri).length == 0) revert BosUri();
        gelistirici[msg.sender] = Gelistirici({
            kayitli: true,
            zaman: uint64(block.timestamp),
            uri: uri
        });
        emit Kaydoldu(msg.sender, uri);
    }

    function profilGuncelle(string calldata uri) external {
        if (!gelistirici[msg.sender].kayitli) revert KayitliDegil();
        if (bytes(uri).length == 0) revert BosUri();
        gelistirici[msg.sender].uri = uri;
        emit ProfilGuncellendi(msg.sender, uri);
    }

    /* ---- ürün -------------------------------------------------------- */

    function urunEkle(uint256 fiyat, uint64 periyot, string calldata uri)
        external
        returns (uint256 id)
    {
        if (!gelistirici[msg.sender].kayitli) revert KayitliDegil();
        if (bytes(uri).length == 0) revert BosUri();
        id = urunler.length;
        urunler.push(Urun({
            gelistirici: msg.sender,
            fiyat: fiyat,
            periyot: periyot,
            acik: true,
            uri: uri,
            satis: 0,
            hasilat: 0
        }));
        _gelistiriciUrun[msg.sender].push(id);
        emit UrunEklendi(id, msg.sender, fiyat, periyot, uri);
    }

    /// Fiyat ve açıklama değişebilir; periyot değişemez.
    ///
    /// Periyodu değiştirmek, satılmış aboneliklerin anlamını sonradan
    /// değiştirmek olurdu: aylık diye alınan bir ürün yıllığa çevrilirse
    /// müşterinin elindeki lisansın ne olduğu belirsizleşir. Yeni bir
    /// periyot isteyen yeni bir ürün açar.
    function urunGuncelle(uint256 id, uint256 fiyat, bool acik, string calldata uri)
        external
    {
        if (id >= urunler.length) revert BilinmeyenUrun();
        Urun storage u = urunler[id];
        if (u.gelistirici != msg.sender) revert SadeceSahibi();
        if (bytes(uri).length == 0) revert BosUri();
        u.fiyat = fiyat;
        u.acik = acik;
        u.uri = uri;
        emit UrunGuncellendi(id, fiyat, acik, uri);
    }

    /* ---- satın alma -------------------------------------------------- */

    /// Ödeme ve bölüşme aynı işlemde. Bu sözleşme arada bakiye tutmuyor.
    function satinAl(uint256 id) external returns (uint64 bitis) {
        if (id >= urunler.length) revert BilinmeyenUrun();
        Urun storage u = urunler[id];
        if (!u.acik) revert UrunKapali();

        uint256 fiyat = u.fiyat;
        uint256 platform = (fiyat * PLATFORM_PPM) / 1_000_000;
        /* Remainder to the developer, deliberately. */
        uint256 dev = fiyat - platform;

        /* Lisans süresi: mevcut lisans hâlâ geçerliyse ÜZERİNE ekleniyor.
           Şimdiden başlatmak, erken yenileyen müşteriyi cezalandırmak
           olurdu — kalan süresini kaybederdi. */
        if (u.periyot == 0) {
            bitis = SURESIZ;
        } else {
            uint64 simdi = uint64(block.timestamp);
            uint64 mevcut = lisansBitis[id][msg.sender];
            uint64 taban = mevcut > simdi ? mevcut : simdi;
            bitis = taban + u.periyot;
        }

        /* Effects before interactions. */
        lisansBitis[id][msg.sender] = bitis;
        u.satis += 1;
        u.hasilat += fiyat;
        gelistiriciKazanci[u.gelistirici] += dev;
        platformKazanci += platform;
        toplamHasilat += fiyat;

        if (dev > 0 && !quote.transferFrom(msg.sender, u.gelistirici, dev)) {
            revert TransferOlmadi();
        }
        if (platform > 0 && !quote.transferFrom(msg.sender, isletme, platform)) {
            revert TransferOlmadi();
        }

        emit SatinAlindi(id, msg.sender, fiyat, dev, platform, bitis);
    }

    /* ---- lisans doğrulama -------------------------------------------- */

    /// SDK'nın sorduğu soru. Bir sır paylaşılmıyor: alıcının adresi yeterli.
    function lisansliMi(uint256 id, address kim) external view returns (bool) {
        return lisansBitis[id][kim] > block.timestamp;
    }

    function lisans(uint256 id, address kim)
        external
        view
        returns (bool gecerli, uint64 bitis, bool suresiz)
    {
        bitis = lisansBitis[id][kim];
        suresiz = bitis == SURESIZ;
        gecerli = bitis > block.timestamp;
    }

    /* ---- itibar ------------------------------------------------------ */

    /// Yalnızca lisansı olan puanlayabilir ve bir kez.
    ///
    /// Değiştirilebilir bir puan, geliştiricinin müşteriye "puanını düzelt"
    /// demesine açık kapı olurdu. Ödememiş birinin puanlaması ise itibarı
    /// ücretsiz bir oy sandığına çevirirdi.
    function puanla(uint256 id, uint8 p) external {
        if (id >= urunler.length) revert BilinmeyenUrun();
        if (p < 1 || p > 5) revert KotuPuan();
        if (lisansBitis[id][msg.sender] == 0) revert LisansYok();
        if (puan[id][msg.sender] != 0) revert ZatenPuanladi();
        puan[id][msg.sender] = p;
        puanToplam[id] += p;
        puanSayisi[id] += 1;
        emit Puanlandi(id, msg.sender, p);
    }

    /* ---- okumalar ---------------------------------------------------- */

    function urunSayisi() external view returns (uint256) {
        return urunler.length;
    }

    function urunAt(uint256 id) external view returns (Urun memory) {
        if (id >= urunler.length) revert BilinmeyenUrun();
        return urunler[id];
    }

    function gelistiriciUrunleri(address kim) external view returns (uint256[] memory) {
        return _gelistiriciUrun[kim];
    }

    /// Ortalama puanı yüzde biri hassasiyetle, ondalık olmadan: 487 = 4,87.
    /// Hiç puan yoksa 0 dönüyor ve bu "sıfır puan" değil "puan yok" demek —
    /// arayüzün ikisini ayırması gerekiyor.
    function ortalamaPuan(uint256 id) external view returns (uint256 yuzlu, uint256 adet) {
        adet = puanSayisi[id];
        yuzlu = adet == 0 ? 0 : (puanToplam[id] * 100) / adet;
    }

    /// Bu sözleşmenin bakiyesi. Tasarım gereği her zaman 0 olmalı; bir panoya
    /// konulması için değil, bunu kontrol edilebilir kılmak için var.
    function tutulan() external view returns (uint256) {
        return quote.balanceOf(address(this));
    }
}
