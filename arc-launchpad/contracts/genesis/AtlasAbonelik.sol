// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20A {
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @title AtlasAbonelik — buying access to the GENESIS ATLAS API, in dollars
///
/// WHAT IS SOLD
///   Atlas data (chain map, capital flows, discoveries, routes) through the
///   API server (scripts/atlas-api.js). Three package types, as the spec
///   asks: a pay-per-use call pack, a monthly subscription, an enterprise
///   plan. No FTHM stake is required of API customers.
///
/// THE KEY IS THE WALLET
///   There is no secret API key to leak or rotate. A customer signs each
///   request with the wallet that paid; the server recovers the address and
///   reads this contract for what it bought. Call packs are counted by the
///   server against `cagriHakki` (the server meters, the chain records what
///   was paid for).
///
/// MONEY
///   Nothing is held here. Every purchase is split at once: 70% to the
///   founder (KURUCU, the platform operations address — the share the
///   founder set on 15 Oct 2026), 30% to growth (BUYUME, the DAO-governed
///   developer fund). Both are immutable.
///
/// PRICES
///   The opening prices are set at deployment; after that only the Arc DAO
///   (Governor, after a vote and its time lock) can change a price, open a
///   new package or close one. Nobody else — not GENESIS, not the deployer.
contract AtlasAbonelik {
    IERC20A public immutable dolar;
    address public immutable kurucu;
    address public immutable buyume;
    address public immutable dao;

    uint256 public constant KURUCU_PAYI_PPM = 700_000;

    struct Paket {
        uint256 fiyat;     // dollars, 6 decimals
        uint32 gun;        // subscription days (0 = a call pack)
        uint64 cagri;      // calls included (0 = unmetered within the plan's rate limit)
        bool acik;
        string ad;
    }

    struct Hesap {
        uint64 cagriHakki;
        uint64 abonelikBitis;
        uint8 seviye;      // the highest package id with time left
    }

    Paket[] public paketler;
    mapping(address => Hesap) public hesaplar;

    event PaketAyarlandi(uint256 indexed id, uint256 fiyat, uint32 gun, uint64 cagri, bool acik, string ad);
    event SatinAlindi(address indexed alici, uint256 indexed paket, uint256 fiyat, uint64 cagriHakki, uint64 abonelikBitis);

    error SadeceDao();
    error KapaliPaket();
    error Transfer();

    constructor(IERC20A d, address kurucu_, address buyume_, address dao_) {
        dolar = d;
        kurucu = kurucu_;
        buyume = buyume_;
        dao = dao_;
        _ayarla(type(uint256).max, 10e6, 0, 10_000, true, "Call pack: 10,000 calls");
        _ayarla(type(uint256).max, 49e6, 30, 0, true, "Monthly: 30 days, standard rate limit");
        _ayarla(type(uint256).max, 499e6, 30, 0, true, "Enterprise: 30 days, high rate limit, full history");
    }

    /// Buy package `id` for `alici` (the paying wallet may buy for another).
    function satinAl(uint256 id, address alici) external {
        Paket storage p = paketler[id];
        if (!p.acik) revert KapaliPaket();
        uint256 k = (p.fiyat * KURUCU_PAYI_PPM) / 1_000_000;
        if (!dolar.transferFrom(msg.sender, kurucu, k)) revert Transfer();
        if (!dolar.transferFrom(msg.sender, buyume, p.fiyat - k)) revert Transfer();
        Hesap storage h = hesaplar[alici];
        h.cagriHakki += p.cagri;
        if (p.gun != 0) {
            bool suruyor = h.abonelikBitis > block.timestamp;
            /* a running plan keeps the higher level; a lapsed one starts over */
            if (!suruyor || id > h.seviye) h.seviye = uint8(id);
            h.abonelikBitis = (suruyor ? h.abonelikBitis : uint64(block.timestamp)) + uint64(p.gun) * 1 days;
        }
        emit SatinAlindi(alici, id, p.fiyat, h.cagriHakki, h.abonelikBitis);
    }

    /// The Arc DAO only: change a package (id < count) or add one (id ≥ count).
    function paketAyarla(uint256 id, uint256 fiyat, uint32 gun, uint64 cagri, bool acik, string calldata ad) external {
        if (msg.sender != dao) revert SadeceDao();
        _ayarla(id, fiyat, gun, cagri, acik, ad);
    }

    function _ayarla(uint256 id, uint256 fiyat, uint32 gun, uint64 cagri, bool acik, string memory ad) internal {
        if (id >= paketler.length) { paketler.push(Paket(fiyat, gun, cagri, acik, ad)); id = paketler.length - 1; }
        else paketler[id] = Paket(fiyat, gun, cagri, acik, ad);
        emit PaketAyarlandi(id, fiyat, gun, cagri, acik, ad);
    }

    function paketSayisi() external view returns (uint256) { return paketler.length; }

    /// What a wallet may use now: calls left to the pack, and whether a
    /// subscription (and which level) is running.
    function erisim(address a) external view returns (uint64 cagriHakki, bool abone, uint8 seviye, uint64 bitis) {
        Hesap memory h = hesaplar[a];
        abone = h.abonelikBitis > block.timestamp;
        return (h.cagriHakki, abone, abone ? h.seviye : 0, h.abonelikBitis);
    }
}
