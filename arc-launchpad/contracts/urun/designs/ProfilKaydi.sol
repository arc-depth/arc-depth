// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title ProfilKaydi — ARC PULSE "Designs" profiles and social graph on Arc
 * @notice Identity is the wallet. Everything here is public and on chain; the
 *         platform keeps nothing off chain. Each wallet pays its own gas, and
 *         there are no fees.
 *
 *   - Profile: profilYaz(ad, bio, avatarUri, baglantilarJson), latest version
 *     in storage (profilOf returns it in one call), every write also emitted.
 *     Caps: ad <= 48 bytes, bio <= 300, avatar <= 200, links JSON <= 600.
 *     The contract does NOT validate the JSON or the URI: the site must treat
 *     every field as untrusted text (escape it, allow only https:/ipfs: URIs).
 *   - Handle: kullaniciAdiAl(handle), lowercase [a-z0-9_], 3–20 bytes, one per
 *     wallet, first come first served. Taking a new handle releases the old
 *     one; kullaniciAdiBirak() releases it.
 *   - Follow graph: takipEt / takiptenCik, counts per wallet, no self-follow.
 *   - Likes: begen / begeniGeriAl on (nft, id), a count per item and a flag
 *     per wallet.
 *
 *   Admin (yonetici, two-step transferable, later the ARCP DAO governor) can
 *   only moderate: gizle(wallet, bool) flags a profile as hidden (legal or
 *   abuse reports; the site honours it, the data stays on chain), and
 *   kullaniciAdiGeriAl(handle, to) takes a handle back from an impersonator
 *   or abuser (freeing it or giving it to the rightful wallet). The admin
 *   cannot write, change or delete anyone's profile, follows or likes.
 */
contract ProfilKaydi {
    uint256 public constant AD_AZAMI = 48;
    uint256 public constant BIO_AZAMI = 300;
    uint256 public constant AVATAR_AZAMI = 200;
    uint256 public constant BAGLANTI_AZAMI = 600;
    uint256 public constant KULLANICI_ADI_EN_AZ = 3;
    uint256 public constant KULLANICI_ADI_AZAMI = 20;

    struct Profil {
        string ad;
        string bio;
        string avatarUri;
        string baglantilarJson;
        uint64 guncellendi;
    }

    address public yonetici;
    address public bekleyenYonetici;

    mapping(address => Profil) private _profil;
    mapping(address => bool) public gizli;

    mapping(bytes32 => address) private _adSahibi;       // keccak256(handle) -> wallet
    mapping(address => string) public kullaniciAdiOf;    // wallet -> handle ("" = none)

    mapping(address => mapping(address => bool)) private _takip;  // takipci -> hedef
    mapping(address => uint256) public takipciSayisi;
    mapping(address => uint256) public takipSayisi;

    mapping(bytes32 => uint256) private _begeniSayisi;              // keccak256(nft, id)
    mapping(address => mapping(bytes32 => bool)) private _begendi;

    event ProfilGuncellendi(address indexed cuzdan, string ad, string bio, string avatarUri, string baglantilarJson);
    event ProfilSilindi(address indexed cuzdan);
    event KullaniciAdiAlindi(address indexed cuzdan, bytes32 indexed adHash, string kullaniciAdi);
    event KullaniciAdiBirakildi(address indexed cuzdan, bytes32 indexed adHash, string kullaniciAdi);
    event KullaniciAdiGeriAlindi(bytes32 indexed adHash, string kullaniciAdi, address indexed eski, address indexed yeni);
    event Takip(address indexed takipci, address indexed hedef, bool takipte);
    event Begeni(address indexed cuzdan, address indexed nft, uint256 indexed id, bool begendi);
    event Gizlendi(address indexed cuzdan, bool gizli);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);

    error YetkiYok();
    error SifirAdres();
    error CokUzun(uint8 alan);        // 0 ad, 1 bio, 2 avatar, 3 links
    error KullaniciAdiGecersiz();     // length or characters
    error KullaniciAdiAlinmis();
    error KullaniciAdiYok();
    error KendiniTakipEdemez();
    error ZatenTakipte();
    error TakipteDegil();
    error ZatenBegenildi();
    error Begenilmemis();

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert YetkiYok();
        _;
    }

    constructor(address yonetici_) {
        if (yonetici_ == address(0)) revert SifirAdres();
        yonetici = yonetici_;
        emit YoneticiDegisti(address(0), yonetici_);
    }

    /* ------------------------------------------------------------ profile */

    /// Writes the caller's profile (all four fields replace the old ones).
    function profilYaz(string calldata ad, string calldata bio, string calldata avatarUri, string calldata baglantilarJson) external {
        if (bytes(ad).length > AD_AZAMI) revert CokUzun(0);
        if (bytes(bio).length > BIO_AZAMI) revert CokUzun(1);
        if (bytes(avatarUri).length > AVATAR_AZAMI) revert CokUzun(2);
        if (bytes(baglantilarJson).length > BAGLANTI_AZAMI) revert CokUzun(3);
        Profil storage p = _profil[msg.sender];
        p.ad = ad;
        p.bio = bio;
        p.avatarUri = avatarUri;
        p.baglantilarJson = baglantilarJson;
        p.guncellendi = uint64(block.timestamp);
        emit ProfilGuncellendi(msg.sender, ad, bio, avatarUri, baglantilarJson);
    }

    /// Clears the caller's stored profile (past events stay in the chain history).
    function profilSil() external {
        delete _profil[msg.sender];
        emit ProfilSilindi(msg.sender);
    }

    /* ------------------------------------------------------------- handle */

    /// Takes `kullaniciAdi` (lowercase a-z, 0-9, _; 3–20 bytes) for the caller.
    /// A handle the caller already holds is released in the same call.
    function kullaniciAdiAl(string calldata kullaniciAdi) external {
        bytes memory b = bytes(kullaniciAdi);
        if (b.length < KULLANICI_ADI_EN_AZ || b.length > KULLANICI_ADI_AZAMI) revert KullaniciAdiGecersiz();
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (!((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f)) revert KullaniciAdiGecersiz();
        }
        bytes32 h = keccak256(b);
        if (_adSahibi[h] != address(0)) revert KullaniciAdiAlinmis();
        _birak(msg.sender);
        _adSahibi[h] = msg.sender;
        kullaniciAdiOf[msg.sender] = kullaniciAdi;
        emit KullaniciAdiAlindi(msg.sender, h, kullaniciAdi);
    }

    /// Releases the caller's handle so anyone can take it.
    function kullaniciAdiBirak() external {
        if (bytes(kullaniciAdiOf[msg.sender]).length == 0) revert KullaniciAdiYok();
        _birak(msg.sender);
    }

    function _birak(address cuzdan) private {
        string memory eski = kullaniciAdiOf[cuzdan];
        if (bytes(eski).length == 0) return;
        bytes32 h = keccak256(bytes(eski));
        delete _adSahibi[h];
        delete kullaniciAdiOf[cuzdan];
        emit KullaniciAdiBirakildi(cuzdan, h, eski);
    }

    /* ------------------------------------------------------------- follow */

    function takipEt(address hedef) external {
        if (hedef == address(0)) revert SifirAdres();
        if (hedef == msg.sender) revert KendiniTakipEdemez();
        if (_takip[msg.sender][hedef]) revert ZatenTakipte();
        _takip[msg.sender][hedef] = true;
        unchecked { ++takipSayisi[msg.sender]; ++takipciSayisi[hedef]; }
        emit Takip(msg.sender, hedef, true);
    }

    function takiptenCik(address hedef) external {
        if (!_takip[msg.sender][hedef]) revert TakipteDegil();
        _takip[msg.sender][hedef] = false;
        unchecked { --takipSayisi[msg.sender]; --takipciSayisi[hedef]; }
        emit Takip(msg.sender, hedef, false);
    }

    /* -------------------------------------------------------------- likes */

    function begen(address nft, uint256 id) external {
        if (nft == address(0)) revert SifirAdres();
        bytes32 k = _oge(nft, id);
        if (_begendi[msg.sender][k]) revert ZatenBegenildi();
        _begendi[msg.sender][k] = true;
        unchecked { ++_begeniSayisi[k]; }
        emit Begeni(msg.sender, nft, id, true);
    }

    function begeniGeriAl(address nft, uint256 id) external {
        bytes32 k = _oge(nft, id);
        if (!_begendi[msg.sender][k]) revert Begenilmemis();
        _begendi[msg.sender][k] = false;
        unchecked { --_begeniSayisi[k]; }
        emit Begeni(msg.sender, nft, id, false);
    }

    function _oge(address nft, uint256 id) private pure returns (bytes32) {
        return keccak256(abi.encode(nft, id));
    }

    /* -------------------------------------------------------------- views */

    /// The current profile in one call. `gizli` true: the site shows nothing
    /// of it (the data itself stays readable on chain).
    function profilOf(address cuzdan) external view returns (
        string memory ad,
        string memory bio,
        string memory avatarUri,
        string memory baglantilarJson,
        string memory kullaniciAdi,
        uint64 guncellendi,
        bool gizli_,
        uint256 takipci,
        uint256 takip
    ) {
        Profil storage p = _profil[cuzdan];
        return (p.ad, p.bio, p.avatarUri, p.baglantilarJson, kullaniciAdiOf[cuzdan], p.guncellendi,
            gizli[cuzdan], takipciSayisi[cuzdan], takipSayisi[cuzdan]);
    }

    /// The wallet holding `kullaniciAdi` (address(0) if free).
    function sahibiOf(string calldata kullaniciAdi) external view returns (address) {
        return _adSahibi[keccak256(bytes(kullaniciAdi))];
    }

    function isFollowing(address takipci, address hedef) external view returns (bool) {
        return _takip[takipci][hedef];
    }

    function begeniSayisi(address nft, uint256 id) external view returns (uint256) {
        return _begeniSayisi[_oge(nft, id)];
    }

    function hasLiked(address cuzdan, address nft, uint256 id) external view returns (bool) {
        return _begendi[cuzdan][_oge(nft, id)];
    }

    /* --------------------------------------------------------- moderation */

    /// Hides (or unhides) a wallet's profile on the site. Changes nothing else.
    function gizle(address cuzdan, bool gizle_) external sadeceYonetici {
        gizli[cuzdan] = gizle_;
        emit Gizlendi(cuzdan, gizle_);
    }

    /// Takes a handle back (impersonation, abuse). `yeni` = address(0) frees
    /// it; otherwise it goes to `yeni` (whose previous handle is released).
    function kullaniciAdiGeriAl(string calldata kullaniciAdi, address yeni) external sadeceYonetici {
        bytes32 h = keccak256(bytes(kullaniciAdi));
        address eski = _adSahibi[h];
        if (eski == address(0)) revert KullaniciAdiYok();
        delete _adSahibi[h];
        delete kullaniciAdiOf[eski];
        if (yeni != address(0)) {
            _birak(yeni);
            _adSahibi[h] = yeni;
            kullaniciAdiOf[yeni] = kullaniciAdi;
        }
        emit KullaniciAdiGeriAlindi(h, kullaniciAdi, eski, yeni);
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
