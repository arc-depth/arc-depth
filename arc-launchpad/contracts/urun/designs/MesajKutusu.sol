// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// The encryption key registry TasarimNFT2 already keeps (anahtarKaydet).
interface IAnahtarKaydi {
    function anahtarOf(address cuzdan) external view returns (bytes memory);
}

/**
 * @title MesajKutusu — ARC PULSE wallet-to-wallet direct messages on Arc
 * @notice Messages are encrypted in the sender's browser to the recipient's
 *         public encryption key; this contract only carries ciphertext.
 *
 *         PRIVACY: the CONTENT is private (only the recipient's key opens it),
 *         but the METADATA is public and permanent on chain: who wrote to
 *         whom, when, how often, and how large each message is. Block lists
 *         and mutes are public too. Do not use it where the fact of contact
 *         itself must stay secret.
 *
 *   - gonder(alici, sifreli): emits Mesaj with the ciphertext (<= 2,000
 *     bytes). Nothing but counters is stored: the messages live in the
 *     event logs. konusmaOf(a, b) is symmetric: keccak256(min, max).
 *   - Recipient key: read from the TasarimNFT2 registry (anahtarKaydi,
 *     admin-settable). A recipient with no key is refused (AliciAnahtariYok)
 *     so nobody sends something that can never be opened. The admin can set
 *     the registry to address(0) to switch the check off.
 *   - The ciphertext is encrypted to the recipient only; a sender who wants
 *     to reread their own messages must include a copy encrypted to their
 *     own key in the same payload (the site's envelope format decides).
 *   - engelle(gonderen, bool): a recipient blocks a sender; their sends revert.
 *   - Spam without fees: at most `pencereAzami` messages per sender in each
 *     `pencereSaniye` window (default 20 per 60 s), and the admin can mute a
 *     wallet for abuse (sustur). No fees; each sender pays their own gas.
 *
 *   Admin (yonetici, two-step transferable, later the ARCP DAO governor) can
 *   mute wallets, set the rate limit and the key registry. It cannot read,
 *   change or delete any message.
 */
contract MesajKutusu {
    uint256 public constant SIFRELI_AZAMI = 2000;

    address public yonetici;
    address public bekleyenYonetici;
    IAnahtarKaydi public anahtarKaydi;
    uint32 public pencereSaniye = 60;
    uint32 public pencereAzami = 20;

    struct Hiz { uint64 pencereBasi; uint32 sayac; }

    mapping(uint256 => uint256) public mesajSayisi;                  // konusma -> messages so far
    mapping(address => uint256) public gonderilenSayisi;             // sender -> messages sent
    mapping(address => uint256) public alinanSayisi;                 // recipient -> messages received
    mapping(address => mapping(address => bool)) public engelli;     // alici -> gonderen -> blocked
    mapping(address => bool) public susturuldu;
    mapping(address => Hiz) public hiz;

    event Mesaj(address indexed gonderen, address indexed alici, uint256 indexed konusma, bytes sifreli, uint64 zaman);
    event Engel(address indexed alici, address indexed gonderen, bool engelli);
    event Susturma(address indexed cuzdan, bool susturuldu);
    event AyarDegisti(bytes32 indexed ad, uint256 deger);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);

    error YetkiYok();
    error SifirAdres();
    error KendineOlmaz();
    error BosMesaj();
    error MesajCokUzun(uint256 uzunluk, uint256 azami);
    error AliciAnahtariYok(address alici);
    error Engellendi();
    error Susturuldu();
    error HizSiniri(uint64 tekrarZamani);
    error KotuDeger();

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert YetkiYok();
        _;
    }

    constructor(address yonetici_, IAnahtarKaydi anahtarKaydi_) {
        if (yonetici_ == address(0)) revert SifirAdres();
        yonetici = yonetici_;
        anahtarKaydi = anahtarKaydi_;
        emit YoneticiDegisti(address(0), yonetici_);
    }

    /// Conversation id of two wallets; the same in both directions.
    function konusmaOf(address a, address b) public pure returns (uint256) {
        (address x, address y) = a < b ? (a, b) : (b, a);
        return uint256(keccak256(abi.encodePacked(x, y)));
    }

    /// Sends `sifreli` (ciphertext for `alici`'s key) as an event.
    function gonder(address alici, bytes calldata sifreli) external returns (uint256 konusma) {
        if (alici == address(0)) revert SifirAdres();
        if (alici == msg.sender) revert KendineOlmaz();
        uint256 n = sifreli.length;
        if (n == 0) revert BosMesaj();
        if (n > SIFRELI_AZAMI) revert MesajCokUzun(n, SIFRELI_AZAMI);
        if (susturuldu[msg.sender]) revert Susturuldu();
        if (engelli[alici][msg.sender]) revert Engellendi();
        IAnahtarKaydi k = anahtarKaydi;
        if (address(k) != address(0) && k.anahtarOf(alici).length == 0) revert AliciAnahtariYok(alici);

        Hiz storage h = hiz[msg.sender];
        uint64 simdi = uint64(block.timestamp);
        if (simdi >= h.pencereBasi + pencereSaniye) {
            h.pencereBasi = simdi;
            h.sayac = 1;
        } else {
            if (h.sayac >= pencereAzami) revert HizSiniri(h.pencereBasi + pencereSaniye);
            unchecked { ++h.sayac; }
        }

        konusma = konusmaOf(msg.sender, alici);
        unchecked {
            ++mesajSayisi[konusma];
            ++gonderilenSayisi[msg.sender];
            ++alinanSayisi[alici];
        }
        emit Mesaj(msg.sender, alici, konusma, sifreli, simdi);
    }

    /// The caller (as recipient) blocks or unblocks `gonderen`.
    function engelle(address gonderen, bool engelle_) external {
        engelli[msg.sender][gonderen] = engelle_;
        emit Engel(msg.sender, gonderen, engelle_);
    }

    /// True if `alici` has an encryption key (or the check is off).
    function anahtariVar(address alici) external view returns (bool) {
        IAnahtarKaydi k = anahtarKaydi;
        return address(k) == address(0) || k.anahtarOf(alici).length != 0;
    }

    /// Whether `gonderen` could send to `alici` right now (0 = yes; otherwise
    /// 1 muted, 2 blocked, 3 no key, 4 rate limited, 5 invalid address).
    function gonderilebilir(address gonderen, address alici) external view returns (uint8) {
        if (alici == address(0) || alici == gonderen) return 5;
        if (susturuldu[gonderen]) return 1;
        if (engelli[alici][gonderen]) return 2;
        IAnahtarKaydi k = anahtarKaydi;
        if (address(k) != address(0) && k.anahtarOf(alici).length == 0) return 3;
        Hiz memory h = hiz[gonderen];
        if (block.timestamp < uint256(h.pencereBasi) + pencereSaniye && h.sayac >= pencereAzami) return 4;
        return 0;
    }

    /* -------------------------------------------------------------- admin */

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

    /// address(0) switches the recipient-key check off.
    function anahtarKaydiAyarla(IAnahtarKaydi k) external sadeceYonetici {
        anahtarKaydi = k;
        emit AyarDegisti("anahtarKaydi", uint256(uint160(address(k))));
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
