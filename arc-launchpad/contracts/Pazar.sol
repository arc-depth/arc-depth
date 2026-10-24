// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20P {
    function transferFrom(address from, address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title Pazar — the ARC PULSE developer marketplace
///
/// Developers publish products, customers pay in USDC, and the revenue
/// splits 80% to the developer and 20% to the platform. The licence lives
/// on chain and anyone can verify it.
///
/// THIS CONTRACT HOLDS NO MONEY — AND THAT IS A GUARANTEE, NOT A CHOICE
///   `satinAl` pulls USDC from the buyer and sends it to two destinations
///   in the same transaction: the developer and the operations wallet. The
///   contract's balance never grows.
///
///   The consequence: with no money to withdraw there is no need for a
///   `withdraw`, `sweep` or `rescue` function — and because there is
///   none, nobody can use one. "Protocol funds cannot be moved to someone's
///   own wallet" is not a promise here, it is the shape of the thing.
///   Holding a pool and then saying "only this address may withdraw" would
///   require trusting that address.
///
///   There is no `kurtar` either. A token sent here by mistake stays here.
///   That costs little; the alternative is a function that can send any
///   token to any address.
///
/// WHAT IS NOT ON CHAIN
///   Product details (description, images, download location) are not on
///   chain; only a `uri` is. An API key, a private endpoint or customer
///   data is NOT written here: the chain is public and cannot be undone.
///   Licence checks go through `lisansliMi()`, so a developer never has to
///   share a secret — the buyer's address is enough.
///
/// ROUNDING FAVOURS THE DEVELOPER
///   platform = price * 20%, developer = price - platform. So the cent that
///   does not divide evenly stays with the developer, not the platform.
///   Choosing the other direction would be a quiet tax handing the platform
///   one extra unit on every sale.
///
/// CLOSING A PRODUCT DOES NOT REVOKE A SOLD LICENCE
///   `kapat` only stops NEW sales. Taking back a licence already sold would
///   be taking a product away from somebody who paid for it; a developer can
///   withdraw the listing but not the history.
contract Pazar {
    /// The unit of payment. On Arc the gas token IS USDC, but this is the
    /// ERC20 side of it.
    IERC20P public immutable quote;

    /// Where the platform's share goes. Immutable: a share address that can
    /// be repointed means somebody who can repoint it.
    address public immutable isletme;

    /// 20%. A constant: the "fees cannot change" rule holds here too, and a
    /// setter would raise the question of who owns that setter.
    uint256 public constant PLATFORM_PPM = 200_000;

    /// When a one-off purchase ends. The uint64 ceiling rather than a
    /// separate "forever" flag, so every comparison stays the same shape.
    uint64 public constant SURESIZ = type(uint64).max;

    struct Gelistirici {
        bool kayitli;
        uint64 zaman;
        string uri;
    }

    struct Urun {
        address gelistirici;
        /// USDC, 6 decimals. Zero is allowed: a free product is a valid
        /// listing, and the platform's share of that sale is zero too.
        uint256 fiyat;
        /// 0 means one-off (a licence that never expires); anything else is
        /// the subscription period.
        uint64 periyot;
        bool acik;
        string uri;
        uint256 satis;
        uint256 hasilat;
    }

    mapping(address => Gelistirici) public gelistirici;
    Urun[] public urunler;
    mapping(address => uint256[]) internal _gelistiriciUrun;

    /// Product -> buyer -> when the licence ends. 0 means no licence.
    mapping(uint256 => mapping(address => uint64)) public lisansBitis;

    /// Reputation only from someone who paid. 0 means no rating given.
    mapping(uint256 => mapping(address => uint8)) public puan;
    mapping(uint256 => uint256) public puanToplam;
    mapping(uint256 => uint256) public puanSayisi;

    /// The ledger the dashboards read. It could be derived from events, but
    /// a dashboard has to answer "what have I earned" in one call.
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

    /* ---- registration ------------------------------------------------ */

    /// Permissionless. An approval gate would need somebody to do the
    /// approving, and the point of this marketplace is that an outside
    /// developer can start on their own. The quality gate is not
    /// registration but reputation and sales count.
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

    /* ---- products ----------------------------------------------------- */

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

    /// Price and description can change; the period cannot.
    ///
    /// Changing the period would change the meaning of subscriptions
    /// already sold: if a product bought as monthly became yearly, what
    /// the customer holds would become unclear. Anyone wanting a different
    /// period opens a new product.
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

    /* ---- buying -------------------------------------------------------- */

    /// Payment and the split happen in one transaction. This contract holds
    /// no balance in between.
    function satinAl(uint256 id) external returns (uint64 bitis) {
        if (id >= urunler.length) revert BilinmeyenUrun();
        Urun storage u = urunler[id];
        if (!u.acik) revert UrunKapali();

        uint256 fiyat = u.fiyat;
        uint256 platform = (fiyat * PLATFORM_PPM) / 1_000_000;
        /* Remainder to the developer, deliberately. */
        uint256 dev = fiyat - platform;

        /* Licence length: if the existing licence is still valid the new
           period is added ON TOP of it. Starting from now would punish a
           customer who renews early by discarding their remaining time. */
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

    /* ---- licence verification ------------------------------------------ */

    /// The question an SDK asks. No secret is shared: the buyer's address
    /// is enough.
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

    /// Only a licence holder can rate, and only once.
    ///
    /// A rating that can be edited leaves the door open for a developer to
    /// ask a customer to "fix your rating". And letting someone who never
    /// paid rate would turn reputation into a free ballot box.
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

    /// The average rating to a hundredth, without decimals: 487 means 4.87.
    /// With no ratings it returns 0, and that means "no ratings" rather than
    /// "rated zero" — the interface has to tell those apart.
    function ortalamaPuan(uint256 id) external view returns (uint256 yuzlu, uint256 adet) {
        adet = puanSayisi[id];
        yuzlu = adet == 0 ? 0 : (puanToplam[id] * 100) / adet;
    }

    /// This contract's balance. By design it should always be 0; it exists
    /// so that claim can be checked, not to fill a dashboard.
    function tutulan() external view returns (uint256) {
        return quote.balanceOf(address(this));
    }
}
