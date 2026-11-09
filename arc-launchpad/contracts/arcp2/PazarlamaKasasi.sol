// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20P {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IAcilisP {
    function acilisZamani() external view returns (uint256);
}

/// @title PazarlamaKasasi — the 10% for marketing, paid only as locked grants.
///
/// THE RULES (owner, 9 Nov 2026)
///   The tokens go to influencers, a share on the post and the rest
///   unlocking day by day, so a single post followed by a sale makes no
///   sense to anyone. The treasury itself never sells: it has no function
///   that reaches a pool or a router. Tokens leave only as a grant to a
///   named recipient, and everything a recipient unlocks is theirs to keep
///   or sell.
///
/// HOW FAST IT CAN BE SPENT
///   Before the opening and for its first 90 days at most 30% may be
///   committed; the remaining 70% opens linearly over the following 630
///   days (21 months). A bad week cannot pour the whole allocation out.
///
/// WHO DECIDES
///   `yonetici` opens grants and can stop one whose post was deleted — the
///   locked remainder comes back here, what had already unlocked stays the
///   recipient's. Every grant carries a note and is public. Nothing pays
///   before the pool opens, and a grant's clock starts at whichever is
///   later, the grant or the opening.
contract PazarlamaKasasi {
    uint256 public constant ILK_SURE = 90 days;
    uint256 public constant KALAN_SURE = 630 days;
    uint256 public constant ILK_PAY_BPS = 3_000;

    IERC20P public immutable token;
    IAcilisP public immutable kaynak;
    uint256 public immutable toplam;

    address public yonetici;
    uint256 public ayrilan;

    struct Odeme {
        address alici;
        uint64 olusma;
        uint32 sure;          // seconds over which the locked part unlocks
        bool durdu;
        uint256 miktar;
        uint256 pesin;
        uint256 alinan;
    }

    Odeme[] public odemeler;

    event OdemeAcildi(uint256 indexed id, address indexed alici, uint256 miktar, uint256 pesin, uint256 sure, string not_);
    event OdemeDurdu(uint256 indexed id, uint256 kesinlesen, uint256 geriDonen);
    event Cekildi(uint256 indexed id, address indexed alici, uint256 miktar);
    event YoneticiDegisti(address eski, address yeni);

    error SadeceYonetici();
    error SinirAsildi();
    error KotuOdeme();
    error HenuzYok();
    error TransferOlmadi();

    constructor(IERC20P _token, IAcilisP _kaynak, uint256 _toplam, address _yonetici) {
        token = _token;
        kaynak = _kaynak;
        toplam = _toplam;
        yonetici = _yonetici;
    }

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert SadeceYonetici();
        _;
    }

    function yoneticiDegistir(address yeni) external sadeceYonetici {
        if (yeni == address(0)) revert KotuOdeme();
        emit YoneticiDegisti(yonetici, yeni);
        yonetici = yeni;
    }

    /// How much may have been committed by now, in total.
    function sinir() public view returns (uint256) {
        uint256 ilk = (toplam * ILK_PAY_BPS) / 10_000;
        uint256 a = kaynak.acilisZamani();
        if (a == 0 || block.timestamp < a + ILK_SURE) return ilk;
        uint256 g = block.timestamp - a - ILK_SURE;
        if (g >= KALAN_SURE) return toplam;
        return ilk + ((toplam - ilk) * g) / KALAN_SURE;
    }

    function odemeSayisi() external view returns (uint256) {
        return odemeler.length;
    }

    /// Open a grant: `pesinBps` of it on the opening (or now, if open), the
    /// rest unlocking linearly over `gun` days.
    function odemeAc(address alici, uint256 miktar, uint256 pesinBps, uint256 gun, string calldata not_)
        external sadeceYonetici returns (uint256 id)
    {
        if (alici == address(0) || miktar == 0 || pesinBps > 10_000) revert KotuOdeme();
        if (gun == 0 && pesinBps != 10_000) revert KotuOdeme();
        if (gun > 3650) revert KotuOdeme();
        if (ayrilan + miktar > sinir()) revert SinirAsildi();
        ayrilan += miktar;
        id = odemeler.length;
        uint256 pesin = (miktar * pesinBps) / 10_000;
        odemeler.push(Odeme(alici, uint64(block.timestamp), uint32(gun * 1 days), false, miktar, pesin, 0));
        emit OdemeAcildi(id, alici, miktar, pesin, gun, not_);
    }

    /// Unlocked so far for grant `id`.
    function serbest(uint256 id) public view returns (uint256) {
        Odeme storage o = odemeler[id];
        if (o.durdu) return o.miktar;
        uint256 a = kaynak.acilisZamani();
        if (a == 0) return 0;
        uint256 bas = o.olusma > a ? o.olusma : a;
        if (block.timestamp <= bas) return o.pesin;
        uint256 g = block.timestamp - bas;
        if (o.sure == 0 || g >= o.sure) return o.miktar;
        return o.pesin + ((o.miktar - o.pesin) * g) / o.sure;
    }

    /// Pay grant `id` what has unlocked. Anyone may trigger it; it only
    /// pays the grant's recipient.
    function cek(uint256 id) external returns (uint256 m) {
        Odeme storage o = odemeler[id];
        uint256 s = serbest(id);
        m = s > o.alinan ? s - o.alinan : 0;
        if (m == 0) revert HenuzYok();
        o.alinan += m;
        if (!token.transfer(o.alici, m)) revert TransferOlmadi();
        emit Cekildi(id, o.alici, m);
    }

    /// Stop grant `id`: what has unlocked stays the recipient's, the locked
    /// rest returns to the treasury's spendable room.
    function durdur(uint256 id) external sadeceYonetici {
        Odeme storage o = odemeler[id];
        if (o.durdu) revert KotuOdeme();
        uint256 s = serbest(id);
        uint256 geri = o.miktar - s;
        o.durdu = true;
        o.miktar = s;
        ayrilan -= geri;
        emit OdemeDurdu(id, s, geri);
    }
}
