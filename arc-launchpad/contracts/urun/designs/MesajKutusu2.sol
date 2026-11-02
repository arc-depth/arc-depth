// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title MesajKutusu2 — ARC PULSE "private box": wallet-to-wallet messages
 *        on Arc with the RECIPIENT hidden
 * @notice Every message goes into ONE shared stream. The contract never sees
 *         or stores the recipient: there is no recipient argument, no
 *         recipient topic and no conversation id. Each reader finds their own
 *         messages in the browser by trial decryption, helped by a short
 *         "view tag" inside the encrypted envelope (the site's envelope v2,
 *         docs/designs/js/mesaj2.js). The contract only carries ciphertext.
 *
 *         PRIVACY, honestly:
 *           - hidden: the content and who a message is for;
 *           - PUBLIC: the sender's wallet (it pays the gas), the time, and the
 *             size of each message (the site pads sizes to 64-byte steps);
 *           - permanent: a deleted or expired message is only hidden by the
 *             apps; its encrypted copy stays in the chain history.
 *
 *   - gonder(sifreli): emits Mesaj(gonderen, id, sifreli, zaman) with
 *     1..2,000 bytes. id = keccak256(abi.encodePacked(gonderen, nonce)),
 *     nonce = the sender's message count before this one (idOf).
 *   - sil(nonce): the sender marks their own message deleted; emits Sil.
 *     Apps hide deleted messages for both sides.
 *   - No recipient check is possible (the recipient is hidden): the site must
 *     check that the recipient has an unlock key (TasarimNFT2.anahtarOf)
 *     before it sends. No recipient block list either: blocking is done in
 *     the reader's app.
 *   - Spam without fees: at most `pencereAzami` messages per sender in each
 *     `pencereSaniye` window (default 20 per 60 s), a 2,000-byte cap, and the
 *     admin can mute a wallet for abuse (sustur). Each sender pays own gas.
 *
 *   Admin (yonetici, two-step transferable, later the ARCP DAO governor) can
 *   mute wallets and set the rate limit. It cannot read, change, delete or
 *   address any message, and it has no fee or fund of any kind.
 */
contract MesajKutusu2 {
    uint256 public constant SIFRELI_AZAMI = 2000;

    address public yonetici;
    address public bekleyenYonetici;
    uint32 public pencereSaniye = 60;
    uint32 public pencereAzami = 20;
    uint256 public toplamMesaj;

    struct Hiz { uint64 pencereBasi; uint32 sayac; }

    mapping(address => uint64) public gonderilenSayisi;   // sender -> messages sent (the next nonce)
    mapping(bytes32 => bool) public silindi;              // message id -> deleted by its sender
    mapping(address => bool) public susturuldu;
    mapping(address => Hiz) public hiz;

    event Mesaj(address indexed gonderen, bytes32 indexed id, bytes sifreli, uint64 zaman);
    event Sil(address indexed gonderen, bytes32 indexed id);
    event Susturma(address indexed cuzdan, bool susturuldu);
    event AyarDegisti(bytes32 indexed ad, uint256 deger);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);

    error YetkiYok();
    error SifirAdres();
    error BosMesaj();
    error MesajCokUzun(uint256 uzunluk, uint256 azami);
    error Susturuldu();
    error HizSiniri(uint64 tekrarZamani);
    error KotuDeger();
    error MesajYok();
    error ZatenSilindi();

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert YetkiYok();
        _;
    }

    constructor(address yonetici_) {
        if (yonetici_ == address(0)) revert SifirAdres();
        yonetici = yonetici_;
        emit YoneticiDegisti(address(0), yonetici_);
    }

    /// Id of `gonderen`'s message number `nonce` (0-based).
    function idOf(address gonderen, uint64 nonce) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(gonderen, nonce));
    }

    /// Posts `sifreli` (an envelope only its recipient and its sender can open) to the shared stream.
    function gonder(bytes calldata sifreli) external returns (bytes32 id) {
        uint256 n = sifreli.length;
        if (n == 0) revert BosMesaj();
        if (n > SIFRELI_AZAMI) revert MesajCokUzun(n, SIFRELI_AZAMI);
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

        uint64 nonce = gonderilenSayisi[msg.sender];
        id = idOf(msg.sender, nonce);
        unchecked {
            gonderilenSayisi[msg.sender] = nonce + 1;
            ++toplamMesaj;
        }
        emit Mesaj(msg.sender, id, sifreli, simdi);
    }

    /// The sender deletes their own message number `nonce`: apps hide it for both sides.
    /// The encrypted copy stays in the chain history (events cannot be erased).
    function sil(uint64 nonce) external {
        if (nonce >= gonderilenSayisi[msg.sender]) revert MesajYok();
        bytes32 id = idOf(msg.sender, nonce);
        if (silindi[id]) revert ZatenSilindi();
        silindi[id] = true;
        emit Sil(msg.sender, id);
    }

    /// Whether `gonderen` could send right now (0 = yes, 1 muted, 4 rate limited).
    function gonderilebilir(address gonderen) external view returns (uint8) {
        if (susturuldu[gonderen]) return 1;
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
