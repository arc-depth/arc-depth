// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// ERC-721 owner lookup (the design's current holder).
interface ISahipli {
    function ownerOf(uint256 id) external view returns (address);
}

/**
 * @title YorumKaydi — ARC PULSE Designs: public comments and reports on Arc
 * @notice Comments on a design (an NFT address + token id) and public reports
 *         about designs, comments or profiles. No fees: everyone pays only
 *         their own gas. ARC PULSE keeps nothing off chain.
 *
 *   - yorumYaz(nft, id, metin, yanit): emits Yorum with the plain text
 *     (1..500 bytes). The TEXT IS NOT STORED; it lives in the event log.
 *     Storage per comment is one 32-byte fingerprint keccak256(author, nft,
 *     id) and one status byte, so the contract can check who may hide it
 *     without keeping the text. `yanit` is an earlier comment id to reply
 *     to (0 = none).
 *   - sil(yorumId, nft, id): the author hides their own comment.
 *   - gizle(yorumId, yazar, nft, id, bool): the design's current holder
 *     (ownerOf) or its designer (tasarimOf(id).tasarimci on TasarimNFT2,
 *     when the NFT contract has it) hides or restores a comment under their
 *     design.
 *   - yoneticiGizle(yorumId, yazar, nft, id, bool): the admin hides or restores an abusive
 *     comment anywhere.
 *   HIDING IS NOT ERASING: a hidden or "deleted" comment is only marked so
 *   (YorumDurumu event + status byte) and pages stop showing it. The text
 *   stays in the chain's history forever, readable by anyone who reads the
 *   raw logs. Do not post anything you may want removed.
 *   Status: 0 shown, 1 deleted by its author (final), 2 hidden by the
 *   design's holder or designer (they may restore it), 3 hidden by the
 *   admin (only the admin may restore it).
 *   - bildir(nft, id, neden, not_): a public report (event only) that a
 *     design is stolen / a copy (1), illegal (2), abusive (3) or other (4),
 *     with a note of at most 280 bytes. A report about a profile uses
 *     nft = the profile's wallet and id = PROFIL (type(uint256).max). Reports
 *     are public on chain: the reporter's wallet is visible.
 *   - Spam without fees: at most `pencereAzami` comments + reports per
 *     wallet in each `pencereSaniye` window (default 10 per 60 s), and the
 *     admin can mute a wallet (sustur).
 *
 *   Admin (yonetici, two-step transferable, later the ARCP DAO governor)
 *   can hide comments, mute wallets and set the rate limit. It cannot
 *   change or erase any comment's text.
 */
contract YorumKaydi {
    uint256 public constant METIN_AZAMI = 500;
    uint256 public constant NOT_AZAMI = 280;
    uint256 public constant PROFIL = type(uint256).max;
    uint8 public constant NEDEN_AZAMI = 4;

    uint8 public constant GORUNUR = 0;
    uint8 public constant YAZAR_SILDI = 1;
    uint8 public constant SAHIP_GIZLEDI = 2;
    uint8 public constant YONETICI_GIZLEDI = 3;

    address public yonetici;
    address public bekleyenYonetici;
    uint32 public pencereSaniye = 60;
    uint32 public pencereAzami = 10;

    struct Hiz { uint64 pencereBasi; uint32 sayac; }

    uint256 public sonYorum;                                          // comment ids start at 1
    mapping(uint256 => bytes32) public izOf;                          // yorumId -> keccak256(yazar, nft, id)
    mapping(uint256 => uint8) public durumOf;                         // yorumId -> status (see above)
    mapping(address => mapping(uint256 => uint256)) public yorumSayisi;   // nft -> id -> comments written
    mapping(address => mapping(uint256 => uint256)) public bildirimSayisi; // nft -> id -> reports
    mapping(address => bool) public susturuldu;
    mapping(address => Hiz) public hiz;

    event Yorum(uint256 indexed yorumId, address indexed nft, uint256 indexed id, address yazar, uint256 yanit, string metin, uint64 zaman);
    event YorumDurumu(uint256 indexed yorumId, address indexed nft, uint256 indexed id, address kim, uint8 durum);
    event Bildirim(address indexed nft, uint256 indexed id, address indexed bildiren, uint8 neden, string not_, uint64 zaman);
    event Susturma(address indexed cuzdan, bool susturuldu);
    event AyarDegisti(bytes32 indexed ad, uint256 deger);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);

    error YetkiYok();
    error SifirAdres();
    error BosMetin();
    error MetinCokUzun(uint256 uzunluk, uint256 azami);
    error NftDegil();
    error YorumYok();
    error YanlisYorum();
    error KotuNeden();
    error Susturuldu();
    error HizSiniri(uint64 tekrarZamani);
    error KotuDeger();
    error Kesin();

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert YetkiYok();
        _;
    }

    constructor(address yonetici_) {
        if (yonetici_ == address(0)) revert SifirAdres();
        yonetici = yonetici_;
        emit YoneticiDegisti(address(0), yonetici_);
    }

    /* ------------------------------------------------------------ comments */

    /// Posts `metin` as a comment on (`nft`, `id`), replying to comment `yanit` (0 = none).
    function yorumYaz(address nft, uint256 id, string calldata metin, uint256 yanit) external returns (uint256 yorumId) {
        if (nft == address(0)) revert SifirAdres();
        if (nft.code.length == 0) revert NftDegil();
        uint256 n = bytes(metin).length;
        if (n == 0) revert BosMetin();
        if (n > METIN_AZAMI) revert MetinCokUzun(n, METIN_AZAMI);
        if (yanit > sonYorum) revert YorumYok();
        _hiz();
        unchecked {
            yorumId = ++sonYorum;
            ++yorumSayisi[nft][id];
        }
        izOf[yorumId] = keccak256(abi.encodePacked(msg.sender, nft, id));
        emit Yorum(yorumId, nft, id, msg.sender, yanit, metin, uint64(block.timestamp));
    }

    /// The author hides their own comment (final; the text stays in the chain history).
    function sil(uint256 yorumId, address nft, uint256 id) external {
        _iz(yorumId, msg.sender, nft, id);
        uint8 d = durumOf[yorumId];
        if (d == YAZAR_SILDI) revert Kesin();
        durumOf[yorumId] = YAZAR_SILDI;
        emit YorumDurumu(yorumId, nft, id, msg.sender, YAZAR_SILDI);
    }

    /// The design's holder or designer hides (`gizli`) or restores a comment under their design.
    function gizle(uint256 yorumId, address yazar, address nft, uint256 id, bool gizli) external {
        _iz(yorumId, yazar, nft, id);
        if (!sahipVeyaTasarimci(msg.sender, nft, id)) revert YetkiYok();
        uint8 d = durumOf[yorumId];
        if (d == YAZAR_SILDI || d == YONETICI_GIZLEDI) revert Kesin();
        uint8 yeni = gizli ? SAHIP_GIZLEDI : GORUNUR;
        durumOf[yorumId] = yeni;
        emit YorumDurumu(yorumId, nft, id, msg.sender, yeni);
    }

    /// True when `kim` holds (`nft`, `id`) now or designed it (TasarimNFT2.tasarimOf).
    function sahipVeyaTasarimci(address kim, address nft, uint256 id) public view returns (bool) {
        if (kim == address(0)) return false;
        try ISahipli(nft).ownerOf(id) returns (address s) { if (s == kim) return true; } catch { /* burned or not an ERC-721 */ }
        /* tasarimOf(uint256) returns (address token, address tasarimci, ...): the designer is the second word */
        (bool ok, bytes memory r) = nft.staticcall(abi.encodeWithSignature("tasarimOf(uint256)", id));
        if (ok && r.length >= 64) {
            address t;
            assembly { t := mload(add(r, 64)) }
            if (t == kim) return true;
        }
        return false;
    }

    /* ------------------------------------------------------------- reports */

    /// A public report about (`nft`, `id`); for a profile nft = the wallet, id = PROFIL.
    function bildir(address nft, uint256 id, uint8 neden, string calldata not_) external {
        if (nft == address(0)) revert SifirAdres();
        if (neden == 0 || neden > NEDEN_AZAMI) revert KotuNeden();
        uint256 n = bytes(not_).length;
        if (n > NOT_AZAMI) revert MetinCokUzun(n, NOT_AZAMI);
        _hiz();
        unchecked { ++bildirimSayisi[nft][id]; }
        emit Bildirim(nft, id, msg.sender, neden, not_, uint64(block.timestamp));
    }

    /* --------------------------------------------------------------- views */

    /// Statuses of many comments at once (0 shown, 1 deleted, 2 hidden by holder/designer, 3 hidden by admin).
    function durumlar(uint256[] calldata idler) external view returns (uint8[] memory out) {
        out = new uint8[](idler.length);
        for (uint256 i; i < idler.length; ++i) out[i] = durumOf[idler[i]];
    }

    /// Whether `kim` could comment or report right now (0 = yes; 1 muted, 2 rate limited).
    function yazabilir(address kim) external view returns (uint8) {
        if (susturuldu[kim]) return 1;
        Hiz memory h = hiz[kim];
        if (block.timestamp < uint256(h.pencereBasi) + pencereSaniye && h.sayac >= pencereAzami) return 2;
        return 0;
    }

    /* ------------------------------------------------------------ internal */

    function _iz(uint256 yorumId, address yazar, address nft, uint256 id) internal view {
        bytes32 iz = izOf[yorumId];
        if (iz == bytes32(0)) revert YorumYok();
        if (iz != keccak256(abi.encodePacked(yazar, nft, id))) {
            if (yazar == msg.sender) revert YetkiYok();
            revert YanlisYorum();
        }
    }

    function _hiz() internal {
        if (susturuldu[msg.sender]) revert Susturuldu();
        Hiz storage h = hiz[msg.sender];
        uint64 simdi = uint64(block.timestamp);
        if (simdi >= h.pencereBasi + pencereSaniye) {
            h.pencereBasi = simdi;
            h.sayac = 1;
        } else {
            if (h.sayac >= pencereAzami) revert HizSiniri(h.pencereBasi + pencereSaniye);
            unchecked { ++h.sayac; }
        }
    }

    /* --------------------------------------------------------------- admin */

    /// Hides (`gizli`) or restores any comment; a comment its author deleted stays deleted.
    /// (`yazar`, `nft`, `id`) are the comment's own, from its Yorum event.
    function yoneticiGizle(uint256 yorumId, address yazar, address nft, uint256 id, bool gizli) external sadeceYonetici {
        _iz(yorumId, yazar, nft, id);
        if (durumOf[yorumId] == YAZAR_SILDI) revert Kesin();
        uint8 yeni = gizli ? YONETICI_GIZLEDI : GORUNUR;
        durumOf[yorumId] = yeni;
        emit YorumDurumu(yorumId, nft, id, msg.sender, yeni);
    }

    function sustur(address cuzdan, bool sustur_) external sadeceYonetici {
        susturuldu[cuzdan] = sustur_;
        emit Susturma(cuzdan, sustur_);
    }

    function hizAyarla(uint32 saniye, uint32 azami) external sadeceYonetici {
        if (saniye == 0 || azami == 0) revert KotuDeger();
        pencereSaniye = saniye;
        pencereAzami = azami;
        emit AyarDegisti("pencereSaniye", saniye);
        emit AyarDegisti("pencereAzami", azami);
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
