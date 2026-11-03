// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/* ===========================================================================
 * KoleksiyonKaydi — ARC PULSE Designs: collections and drops on Arc
 *
 * A designer groups their own TasarimNFT2 designs into a named collection
 * (a series) with a cover image and a description, and may schedule a drop:
 * a start time before which the collection's designs are shown with a
 * countdown instead of a Buy button.
 *
 * WHY A SMALL REGISTRY: a design's metadata on TasarimNFT2 is fixed at
 * publish and a ProfilKaydi profile holds 600 bytes of links, so neither can
 * carry a list of collections that changes. This contract stores only the
 * grouping; no money, no NFTs, no fees (gas only).
 *
 *   - olustur(ad, aciklama, kapakUri, baslangic, tasarimlar): a new
 *     collection (name 1..64 bytes, description <= 500, cover link <= 512);
 *     baslangic 0 = no drop, else a start time within a year.
 *   - ekle / cikar: only the designer of each design (tasarimOf on
 *     TasarimNFT2); a design is in at most one collection; at most 200
 *     designs per collection, 50 per call.
 *   - guncelle: name, description, cover; the drop time can change only
 *     until the drop starts (a started drop cannot be hidden again).
 *   - sil: removes the collection and frees its designs.
 *   The contract does not validate links: pages treat every field as
 *   untrusted text.
 *
 * DROPS ARE A PAGE RULE: TasarimNFT2 (already deployed, unchanged) takes a
 * purchase whenever a design is listed. Before the start the Designs pages
 * show the countdown and no Buy button (satistaMi), and the designer should
 * list the designs at or after the start. A buyer calling TasarimNFT2
 * directly could still buy a design listed early; the pages say so.
 *
 * Admin (yonetici, two-step, later the ARCP DAO governor) can only hide an
 * abusive collection (gizle); it cannot edit or delete anyone's collection.
 * =========================================================================== */

interface ITasarimSahibi {
    function tasarimOf(uint256 id) external view returns (
        address token, address tasarimci, uint64 itirazBitis, uint64 yayinBlok,
        bytes32 dosyaHash, bytes32 algiHash, bytes32 anahtarTaahhut, uint256 teminat);
}

contract KoleksiyonKaydi {
    uint256 public constant AD_AZAMI = 64;
    uint256 public constant ACIKLAMA_AZAMI = 500;
    uint256 public constant KAPAK_AZAMI = 512;
    uint256 public constant TOPLU_AZAMI = 50;
    uint256 public constant TASARIM_AZAMI = 200;
    uint64 public constant DROP_AZAMI = 365 days;

    ITasarimSahibi public immutable nft;
    address public yonetici;
    address public bekleyenYonetici;

    struct Koleksiyon {
        address tasarimci;
        uint64 baslangic;    // drop start (0 = none)
        uint64 olusturma;
        uint32 adet;
        bool silindi;
        bool gizli;          // hidden by the moderator
        string ad;
        string aciklama;
        string kapakUri;
    }

    uint256 public sonKoleksiyon;
    mapping(uint256 => Koleksiyon) private _k;
    mapping(uint256 => uint256[]) private _tasarimlar;
    mapping(uint256 => uint256) public koleksiyonOf;      // design id -> collection id (0 = none)
    mapping(uint256 => uint256) private _sira;            // design id -> index + 1 in its collection
    mapping(address => uint256[]) private _tasarimcinin;  // designer -> collection ids (deleted ones too)

    event KoleksiyonYazildi(uint256 indexed id, address indexed tasarimci, string ad, string aciklama, string kapakUri, uint64 baslangic, bool yeni);
    event TasarimEklendi(uint256 indexed koleksiyon, uint256 indexed tasarim);
    event TasarimCikarildi(uint256 indexed koleksiyon, uint256 indexed tasarim);
    event KoleksiyonSilindi(uint256 indexed id);
    event Gizlendi(uint256 indexed id, bool gizli);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);

    error YetkiYok();
    error SifirAdres();
    error KotuDeger();
    error CokUzun(uint8 alan);       // 0 name, 1 description, 2 cover
    error KoleksiyonYok();
    error TasarimciDegil(uint256 tasarim);
    error BaskaKoleksiyonda(uint256 tasarim, uint256 koleksiyon);
    error BuKoleksiyondaDegil(uint256 tasarim);
    error CokFazla();
    error DropBasladi();

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert YetkiYok();
        _;
    }

    constructor(ITasarimSahibi nft_, address yonetici_) {
        if (address(nft_) == address(0) || yonetici_ == address(0)) revert SifirAdres();
        nft = nft_;
        yonetici = yonetici_;
        emit YoneticiDegisti(address(0), yonetici_);
    }

    /* ---------------------------------------------------------------- write */

    function olustur(string calldata ad, string calldata aciklama, string calldata kapakUri, uint64 baslangic, uint256[] calldata tasarimlar)
        external
        returns (uint256 id)
    {
        _metin(ad, aciklama, kapakUri);
        if (baslangic != 0) _dropZamani(baslangic);
        id = ++sonKoleksiyon;
        Koleksiyon storage k = _k[id];
        k.tasarimci = msg.sender;
        k.baslangic = baslangic;
        k.olusturma = uint64(block.timestamp);
        k.ad = ad;
        k.aciklama = aciklama;
        k.kapakUri = kapakUri;
        _tasarimcinin[msg.sender].push(id);
        emit KoleksiyonYazildi(id, msg.sender, ad, aciklama, kapakUri, baslangic, true);
        if (tasarimlar.length > 0) _ekle(id, tasarimlar);
    }

    function guncelle(uint256 id, string calldata ad, string calldata aciklama, string calldata kapakUri, uint64 baslangic) external {
        Koleksiyon storage k = _sahibi(id);
        _metin(ad, aciklama, kapakUri);
        if (baslangic != k.baslangic) {
            if (k.baslangic != 0 && block.timestamp >= k.baslangic) revert DropBasladi();
            if (baslangic != 0) _dropZamani(baslangic);
            k.baslangic = baslangic;
        }
        k.ad = ad;
        k.aciklama = aciklama;
        k.kapakUri = kapakUri;
        emit KoleksiyonYazildi(id, msg.sender, ad, aciklama, kapakUri, k.baslangic, false);
    }

    function ekle(uint256 id, uint256[] calldata tasarimlar) external {
        _sahibi(id);
        _ekle(id, tasarimlar);
    }

    function cikar(uint256 id, uint256[] calldata tasarimlar) external {
        _sahibi(id);
        if (tasarimlar.length == 0 || tasarimlar.length > TOPLU_AZAMI) revert CokFazla();
        for (uint256 i; i < tasarimlar.length; ++i) {
            uint256 t = tasarimlar[i];
            if (koleksiyonOf[t] != id) revert BuKoleksiyondaDegil(t);
            _cikar(id, t);
        }
    }

    function sil(uint256 id) external {
        _sahibi(id);
        uint256[] storage l = _tasarimlar[id];
        while (l.length > 0) _cikar(id, l[l.length - 1]);
        _k[id].silindi = true;
        emit KoleksiyonSilindi(id);
    }

    /* ---------------------------------------------------------------- internals */

    function _sahibi(uint256 id) private view returns (Koleksiyon storage k) {
        k = _k[id];
        if (k.tasarimci == address(0) || k.silindi) revert KoleksiyonYok();
        if (k.tasarimci != msg.sender) revert YetkiYok();
    }

    function _metin(string calldata ad, string calldata aciklama, string calldata kapakUri) private pure {
        uint256 n = bytes(ad).length;
        if (n == 0 || n > AD_AZAMI) revert CokUzun(0);
        if (bytes(aciklama).length > ACIKLAMA_AZAMI) revert CokUzun(1);
        if (bytes(kapakUri).length > KAPAK_AZAMI) revert CokUzun(2);
    }

    function _dropZamani(uint64 b) private view {
        if (b < block.timestamp || b > block.timestamp + DROP_AZAMI) revert KotuDeger();
    }

    function _ekle(uint256 id, uint256[] calldata tasarimlar) private {
        uint256 n = tasarimlar.length;
        if (n == 0 || n > TOPLU_AZAMI) revert CokFazla();
        uint256[] storage l = _tasarimlar[id];
        if (l.length + n > TASARIM_AZAMI) revert CokFazla();
        for (uint256 i; i < n; ++i) {
            uint256 t = tasarimlar[i];
            (, address tasarimci,,,,,,) = nft.tasarimOf(t);
            if (tasarimci == address(0) || tasarimci != msg.sender) revert TasarimciDegil(t);
            uint256 eski = koleksiyonOf[t];
            if (eski != 0) revert BaskaKoleksiyonda(t, eski);
            l.push(t);
            _sira[t] = l.length;
            koleksiyonOf[t] = id;
            emit TasarimEklendi(id, t);
        }
        _k[id].adet = uint32(l.length);
    }

    function _cikar(uint256 id, uint256 t) private {
        uint256[] storage l = _tasarimlar[id];
        uint256 i = _sira[t] - 1;
        uint256 son = l[l.length - 1];
        l[i] = son;
        _sira[son] = i + 1;
        l.pop();
        delete _sira[t];
        delete koleksiyonOf[t];
        _k[id].adet = uint32(l.length);
        emit TasarimCikarildi(id, t);
    }

    /* ---------------------------------------------------------------- views */

    function koleksiyon(uint256 id) external view returns (Koleksiyon memory k, uint256[] memory tasarimlar) {
        return (_k[id], _tasarimlar[id]);
    }

    /// Many collections at once (without their design lists).
    function koleksiyonlar(uint256[] calldata idler) external view returns (Koleksiyon[] memory out) {
        out = new Koleksiyon[](idler.length);
        for (uint256 i; i < idler.length; ++i) out[i] = _k[idler[i]];
    }

    function tasarimcininKoleksiyonlari(address tasarimci) external view returns (uint256[] memory) {
        return _tasarimcinin[tasarimci];
    }

    /// Whether the pages may offer design `t` for sale now: not in a live
    /// collection, or its collection's drop has started.
    function satistaMi(uint256 t) public view returns (bool) {
        uint256 id = koleksiyonOf[t];
        if (id == 0) return true;
        uint64 b = _k[id].baslangic;
        return b == 0 || block.timestamp >= b;
    }

    /// For each design: its collection (0 = none) and that collection's drop start (0 = none).
    function dropBilgisi(uint256[] calldata tasarimlar) external view returns (uint256[] memory koleksiyonlar_, uint64[] memory baslangiclar) {
        koleksiyonlar_ = new uint256[](tasarimlar.length);
        baslangiclar = new uint64[](tasarimlar.length);
        for (uint256 i; i < tasarimlar.length; ++i) {
            uint256 id = koleksiyonOf[tasarimlar[i]];
            koleksiyonlar_[i] = id;
            if (id != 0) baslangiclar[i] = _k[id].baslangic;
        }
    }

    /* ---------------------------------------------------------------- admin */

    function gizle(uint256 id, bool g) external sadeceYonetici {
        if (_k[id].tasarimci == address(0)) revert KoleksiyonYok();
        _k[id].gizli = g;
        emit Gizlendi(id, g);
    }

    function yoneticiDevret(address yeni) external sadeceYonetici {
        if (yeni == address(0)) revert SifirAdres();
        bekleyenYonetici = yeni;
        emit YoneticiOnerildi(yeni);
    }

    function yoneticiligiKabul() external {
        if (msg.sender != bekleyenYonetici) revert YetkiYok();
        emit YoneticiDegisti(yonetici, msg.sender);
        yonetici = msg.sender;
        bekleyenYonetici = address(0);
    }
}
