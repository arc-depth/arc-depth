// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ZincirTablosu } from "../lz/ZincirTablosu.sol";

/// @title GenesisCekirdek — PULSE GENESIS's identity, memory, model and
///        module registry, one logical record across every chain
///
/// ONE IDENTITY ON EVERY CHAIN
///   The same bytecode with the same constructor argument deploys to the
///   same address on all nine EVM chains (ZincirTablosu is inside the
///   bytecode). Every copy is a LayerZero peer of every other, with the
///   two-DVN configuration written at birth, and then gives up its owner
///   and delegate: nobody, the founder included, can repoint a peer or
///   change a DVN afterwards.
///
/// ONE MEMORY, NO SINGLE AUTHORITY
///   Records are written on whichever chain the agent is on. Each origin
///   chain keeps its own append-only, hash-chained sequence; a record is
///   (origin, sequence) and its hash commits to everything before it from
///   that origin. Any chain can relay any sequence it holds to any other
///   (`yay`, permissionless, the caller pays LayerZero), and the receiver
///   recomputes the hash chain, so a record means the same thing on every
///   chain that has it. No chain is the master: a chain that is down only
///   delays its own records, and the rest keep writing. `hafizaKoku()`
///   commits to all origins' heads, so two chains that have synced report
///   the same root.
///
/// STORED ON CHAIN vs HASH ONLY
///   Every record says which it is (`saklama`): ZINCIRDE = the bytes are in
///   this contract's storage on every chain that has the record;
///   SADECE_HASH = only their keccak256 is here, the bytes are elsewhere.
///   Conversations (category 1) can only be SADECE_HASH: a private chat is
///   never published by the memory itself.
///
/// WHAT IS NOT HERE
///   No token, no balance, no approval, no call into any other contract of
///   ARC PULSE. Nothing GENESIS records here can move a user's funds, touch
///   a collateral vault or a redemption, or change a bridge — the
///   guardrails in KORKULUK_METNI hold by construction, not by promise.
///   Native value sent with `yay` pays LayerZero; the excess is refunded by
///   the endpoint to the caller.
///
/// AGENTS AND TIME LOCKS
///   Writes to memory come from the agent set (the GENESIS runtime keys).
///   Changing that set, or activating a module, is a record like any other
///   and only takes effect after a delay counted from the record's origin
///   timestamp — 7 days for agents and critical modules, 2 days for routine
///   modules — executed by anyone on each chain. The delay is what lets
///   every chain see the change before it applies.
///   Anyone may submit a candidate record (`oner`); it becomes memory only
///   when an agent accepts it. That is the gate against poisoned input.
contract GenesisCekirdek is OApp {
    address internal constant OLU = 0x000000000000000000000000000000000000dEaD;

    string public constant AD = "PULSE GENESIS";
    string public constant KORKULUK_METNI =
        "1. GENESIS never moves user funds without the user's own signature. "
        "2. GENESIS cannot change collateral, vaults, redemption rights or bridge verification; this contract holds no token and calls no other contract. "
        "3. Immutable contracts are never assumed to be secretly changeable. "
        "4. Private conversations are stored as hashes only. "
        "5. Revenue shares are never set by GENESIS itself; the founder's existing rights are untouched. "
        "6. Agent changes and critical modules wait 7 days, routine modules 2 days, before they apply. "
        "7. Every component states whether it computes on chain, off chain with on-chain agreement, or off chain with a hash on chain.";
    bytes32 public immutable KORKULUKLAR;
    bytes32 public immutable KIMLIK;

    uint64 public constant AJAN_GECIKME = 7 days;
    uint64 public constant KRITIK_GECIKME = 7 days;
    uint64 public constant RUTIN_GECIKME = 2 days;
    uint256 public constant AZAMI_VERI = 4096;

    /* memory categories 1..12, as in the GENESIS specification */
    uint8 public constant KONUSMA = 1;
    uint8 public constant BILGI = 2;
    uint8 public constant OGRENME = 3;
    uint8 public constant PARAMETRE = 4;
    uint8 public constant SURUM = 5;
    uint8 public constant YAZILIM = 6;
    uint8 public constant GUVENLIK = 7;
    uint8 public constant KESIF = 8;
    uint8 public constant PERFORMANS = 9;
    uint8 public constant EKONOMI = 10;
    uint8 public constant ALGORITMA = 11;
    uint8 public constant ZINCIR = 12;
    /* structured records, applied to the registries on every chain */
    uint8 public constant T_AJAN = 100;
    uint8 public constant T_MODEL = 101;
    uint8 public constant T_MODUL = 102;
    uint8 public constant T_MODUL_IPTAL = 103;

    uint8 public constant ZINCIRDE = 0;
    uint8 public constant SADECE_HASH = 1;

    /* model computation modes, the three the specification keeps apart */
    uint8 public constant MOD_ZINCIRDE = 1;       // computed entirely on chain
    uint8 public constant MOD_MUTABAKAT = 2;      // computed by independent providers, agreed on chain
    uint8 public constant MOD_HASH = 3;           // computed off chain, only a hash on chain

    struct Kayit {
        uint8 tur;
        uint8 saklama;
        address yazar;
        uint64 zaman;
        bytes32 icerikHash;
        bytes32 zincirHash;
    }

    struct Model {
        bytes32 id;
        bytes32 ebeveyn;
        bytes32 agirlikHash;
        bytes32 mimariHash;
        bytes32 metrikHash;
        uint8 mod;
        address adres;     // the on-chain model, for MOD_ZINCIRDE
        string uri;
    }

    struct Modul {
        bytes32 kodHash;
        bytes32 testHash;
        address adres;
        bool kritik;
        uint64 hazir;
        uint8 durum;       // 1 proposed, 2 active, 3 cancelled
        bytes32 ad;
    }

    struct AjanOnerisi {
        address ajan;
        bool ekle;
        uint64 hazir;
        bool uygulandi;
    }

    struct Oneri {
        address gonderen;
        uint8 tur;
        uint64 zaman;
        bytes32 icerikHash;
        uint8 durum;       // 1 pending, 2 accepted, 3 rejected
    }

    struct Tasima {
        uint8 tur;
        uint8 saklama;
        address yazar;
        uint64 zaman;
        bytes32 icerikHash;
        bytes veri;
    }

    uint32 public immutable buradakiEid;

    mapping(uint32 => Kayit[]) private _kayitlar;
    mapping(uint32 => bytes32) public bas;
    mapping(bytes32 => bytes) private _veri;

    mapping(address => bool) public ajan;
    uint256 public ajanSayisi;
    mapping(bytes32 => AjanOnerisi) public ajanOnerileri;

    mapping(bytes32 => Model) private _modeller;
    bytes32[] public modelListesi;
    mapping(bytes32 => Modul) public moduller;
    bytes32[] public modulListesi;

    Oneri[] public oneriler;

    event Yazildi(uint32 indexed kaynak, uint64 indexed sira, uint8 indexed tur, uint8 saklama, address yazar, bytes32 icerikHash, bytes32 zincirHash);
    event Yayildi(uint32 indexed hedef, uint32 indexed kaynak, uint64 ilk, uint256 adet, bytes32 guid);
    event Alindi(uint32 indexed kaynak, uint64 ilk, uint256 eklenen);
    event Bosluk(uint32 indexed kaynak, uint64 beklenen, uint64 gelen);
    event Celiski(uint32 indexed kaynak, uint64 sira);
    event AjanDegisti(address indexed ajan, bool ekle);
    event ModelKaydedildi(bytes32 indexed id, uint8 mod, address adres);
    event ModulDurumu(bytes32 indexed id, uint8 durum, uint64 hazir);
    event OneriGeldi(uint256 indexed id, address indexed gonderen, uint8 tur, bytes32 icerikHash);
    event OneriKarari(uint256 indexed id, bool kabul, bytes32 sebep);

    error SadeceAjan();
    error KotuTur();
    error KotuSaklama();
    error HashTutmuyor();
    error VeriBuyuk();
    error Erken();
    error Bilinmiyor();
    error SonAjan();
    error ZatenUygulandi();

    modifier sadeceAjan() {
        if (!ajan[msg.sender]) revert SadeceAjan();
        _;
    }

    constructor(address ilkAjan)
        OApp(ZincirTablosu.burasi().endpoint, address(this))
        Ownable(msg.sender)
    {
        buradakiEid = ZincirTablosu.burasi().eid;
        KORKULUKLAR = keccak256(bytes(KORKULUK_METNI));
        KIMLIK = keccak256(abi.encode(AD, ilkAjan, KORKULUKLAR));
        ajan[ilkAjan] = true;
        ajanSayisi = 1;
        emit AjanDegisti(ilkAjan, true);
        for (uint256 i; i < ZincirTablosu.ADET; i++) {
            uint32 e = ZincirTablosu.sira(i).eid;
            if (e != buradakiEid) _setPeer(e, bytes32(uint256(uint160(address(this)))));
        }
        ZincirTablosu.dvnYaz(address(this));
        endpoint.setDelegate(OLU);
        _transferOwnership(address(0));
    }

    /* ---- writing memory ------------------------------------------- */

    /// A memory record in categories 1..12, written here and relayable
    /// everywhere. ZINCIRDE carries the bytes (≤ 4 KiB, hash checked);
    /// SADECE_HASH carries none. Conversations are hash-only.
    function yaz(uint8 tur, uint8 saklama, bytes32 icerikHash, bytes calldata v)
        external
        sadeceAjan
        returns (uint64)
    {
        if (tur < KONUSMA || tur > ZINCIR) revert KotuTur();
        if (tur == KONUSMA && saklama != SADECE_HASH) revert KotuSaklama();
        return _yerelYaz(tur, saklama, icerikHash, v);
    }

    /// Register a model version. Its mode says where it computes.
    function modelKaydet(Model calldata m) external sadeceAjan returns (uint64) {
        if (m.mod < MOD_ZINCIRDE || m.mod > MOD_HASH || m.id == bytes32(0)) revert KotuTur();
        bytes memory v = abi.encode(m);
        return _yerelYaz(T_MODEL, ZINCIRDE, keccak256(v), v);
    }

    /// Propose a module. Active after 2 days (7 if critical), on every chain.
    function modulOner(bytes32 ad, bytes32 kodHash, bytes32 testHash, address adres, bool kritik)
        external
        sadeceAjan
        returns (uint64)
    {
        bytes memory v = abi.encode(ad, kodHash, testHash, adres, kritik);
        return _yerelYaz(T_MODUL, ZINCIRDE, keccak256(v), v);
    }

    /// Cancel a proposed or active module, everywhere.
    function modulIptal(bytes32 id) external sadeceAjan returns (uint64) {
        bytes memory v = abi.encode(id);
        return _yerelYaz(T_MODUL_IPTAL, ZINCIRDE, keccak256(v), v);
    }

    /// Propose adding or removing an agent. Applies after 7 days.
    function ajanOner(address a, bool ekle) external sadeceAjan returns (uint64) {
        bytes memory v = abi.encode(a, ekle);
        return _yerelYaz(T_AJAN, ZINCIRDE, keccak256(v), v);
    }

    /* ---- the public inbox ----------------------------------------- */

    /// Anyone may offer a record for memory. It stays a candidate here
    /// until an agent accepts it; candidates are never relayed.
    function oner(uint8 tur, bytes calldata v) external returns (uint256 id) {
        if (tur < BILGI || tur > ZINCIR) revert KotuTur();
        if (v.length == 0 || v.length > AZAMI_VERI) revert VeriBuyuk();
        bytes32 h = keccak256(v);
        if (_veri[h].length == 0) _veri[h] = v;
        id = oneriler.length;
        oneriler.push(Oneri(msg.sender, tur, uint64(block.timestamp), h, 1));
        emit OneriGeldi(id, msg.sender, tur, h);
    }

    function kabul(uint256 id) external sadeceAjan returns (uint64) {
        Oneri storage o = oneriler[id];
        if (o.durum != 1) revert ZatenUygulandi();
        o.durum = 2;
        emit OneriKarari(id, true, bytes32(0));
        return _yerelYaz(o.tur, ZINCIRDE, o.icerikHash, _veri[o.icerikHash]);
    }

    function ret(uint256 id, bytes32 sebep) external sadeceAjan {
        Oneri storage o = oneriler[id];
        if (o.durum != 1) revert ZatenUygulandi();
        o.durum = 3;
        emit OneriKarari(id, false, sebep);
    }

    /* ---- time-locked execution, by anyone, on each chain ---------- */

    function ajanUygula(bytes32 id) external {
        AjanOnerisi storage a = ajanOnerileri[id];
        if (a.hazir == 0) revert Bilinmiyor();
        if (a.uygulandi) revert ZatenUygulandi();
        if (block.timestamp < a.hazir) revert Erken();
        a.uygulandi = true;
        if (a.ekle) {
            if (!ajan[a.ajan]) { ajan[a.ajan] = true; ajanSayisi++; }
        } else if (ajan[a.ajan]) {
            if (ajanSayisi == 1) revert SonAjan();
            ajan[a.ajan] = false;
            ajanSayisi--;
        }
        emit AjanDegisti(a.ajan, a.ekle);
    }

    function modulEtkinlestir(bytes32 id) external {
        Modul storage m = moduller[id];
        if (m.durum != 1) revert Bilinmiyor();
        if (block.timestamp < m.hazir) revert Erken();
        m.durum = 2;
        emit ModulDurumu(id, 2, m.hazir);
    }

    /* ---- synchronisation ------------------------------------------ */

    /// Relay records [ilk, ilk+adet) of origin `kaynak` to chain `hedef`.
    /// Anyone may call; the caller pays LayerZero (msg.value, excess
    /// refunded). `secenekler` must give the destination enough gas.
    function yay(uint32 hedef, uint32 kaynak, uint64 ilk, uint256 adet, bytes calldata secenekler)
        external
        payable
        returns (bytes32 guid)
    {
        bytes memory m = _paket(kaynak, ilk, adet);
        guid = _lzSend(hedef, m, secenekler, MessagingFee(msg.value, 0), payable(msg.sender)).guid;
        emit Yayildi(hedef, kaynak, ilk, adet, guid);
    }

    function yayUcreti(uint32 hedef, uint32 kaynak, uint64 ilk, uint256 adet, bytes calldata secenekler)
        external
        view
        returns (MessagingFee memory)
    {
        return _quote(hedef, _paket(kaynak, ilk, adet), secenekler, false);
    }

    function _paket(uint32 kaynak, uint64 ilk, uint256 adet) internal view returns (bytes memory) {
        Kayit[] storage ks = _kayitlar[kaynak];
        if (adet == 0 || ilk + adet > ks.length) revert Bilinmiyor();
        Tasima[] memory t = new Tasima[](adet);
        for (uint256 i; i < adet; i++) {
            Kayit storage k = ks[ilk + i];
            t[i] = Tasima(k.tur, k.saklama, k.yazar, k.zaman, k.icerikHash,
                k.saklama == ZINCIRDE ? _veri[k.icerikHash] : bytes(""));
        }
        return abi.encode(kaynak, ilk, t);
    }

    /// A batch from a peer. Never reverts on content — a revert would block
    /// the pathway — it skips what it already has, stops at a gap or a
    /// mismatch, and reports both.
    function _lzReceive(Origin calldata, bytes32, bytes calldata m, address, bytes calldata) internal override {
        (uint32 kaynak, uint64 ilk, Tasima[] memory t) = abi.decode(m, (uint32, uint64, Tasima[]));
        if (kaynak == buradakiEid) return;
        uint64 beklenen = uint64(_kayitlar[kaynak].length);
        if (ilk > beklenen) { emit Bosluk(kaynak, beklenen, ilk); return; }
        uint256 eklenen;
        for (uint256 i; i < t.length; i++) {
            uint64 sira = ilk + uint64(i);
            if (sira < beklenen) {
                if (_kayitlar[kaynak][sira].icerikHash != t[i].icerikHash) emit Celiski(kaynak, sira);
                continue;
            }
            if (t[i].saklama == ZINCIRDE && keccak256(t[i].veri) != t[i].icerikHash) { emit Celiski(kaynak, sira); break; }
            _ekle(kaynak, t[i].tur, t[i].saklama, t[i].yazar, t[i].zaman, t[i].icerikHash, t[i].veri);
            eklenen++;
        }
        emit Alindi(kaynak, ilk, eklenen);
    }

    /* ---- internals ------------------------------------------------ */

    function _yerelYaz(uint8 tur, uint8 saklama, bytes32 h, bytes memory v) internal returns (uint64) {
        if (saklama == ZINCIRDE) {
            if (v.length > AZAMI_VERI) revert VeriBuyuk();
            if (keccak256(v) != h) revert HashTutmuyor();
        } else if (saklama == SADECE_HASH) {
            if (v.length != 0) revert KotuSaklama();
        } else {
            revert KotuSaklama();
        }
        return _ekle(buradakiEid, tur, saklama, msg.sender, uint64(block.timestamp), h, v);
    }

    function _ekle(uint32 kaynak, uint8 tur, uint8 saklama, address yazar, uint64 zaman, bytes32 h, bytes memory v)
        internal
        returns (uint64 sira)
    {
        Kayit[] storage ks = _kayitlar[kaynak];
        sira = uint64(ks.length);
        bytes32 z = keccak256(abi.encode(bas[kaynak], kaynak, sira, tur, saklama, yazar, zaman, h));
        ks.push(Kayit(tur, saklama, yazar, zaman, h, z));
        bas[kaynak] = z;
        if (saklama == ZINCIRDE && _veri[h].length == 0 && v.length != 0) _veri[h] = v;
        emit Yazildi(kaynak, sira, tur, saklama, yazar, h, z);
        if (tur >= T_AJAN) _uygula(tur, zaman, z, v);
    }

    function _uygula(uint8 tur, uint64 zaman, bytes32 z, bytes memory v) internal {
        if (tur == T_AJAN) {
            (address a, bool ekle) = abi.decode(v, (address, bool));
            ajanOnerileri[z] = AjanOnerisi(a, ekle, zaman + AJAN_GECIKME, false);
        } else if (tur == T_MODEL) {
            Model memory m = abi.decode(v, (Model));
            if (_modeller[m.id].id == bytes32(0)) modelListesi.push(m.id);
            _modeller[m.id] = m;
            emit ModelKaydedildi(m.id, m.mod, m.adres);
        } else if (tur == T_MODUL) {
            (bytes32 ad, bytes32 kh, bytes32 th, address adres, bool kritik) =
                abi.decode(v, (bytes32, bytes32, bytes32, address, bool));
            uint64 hazir = zaman + (kritik ? KRITIK_GECIKME : RUTIN_GECIKME);
            moduller[z] = Modul(kh, th, adres, kritik, hazir, 1, ad);
            modulListesi.push(z);
            emit ModulDurumu(z, 1, hazir);
        } else if (tur == T_MODUL_IPTAL) {
            bytes32 id = abi.decode(v, (bytes32));
            if (moduller[id].durum != 0) {
                moduller[id].durum = 3;
                emit ModulDurumu(id, 3, moduller[id].hazir);
            }
        }
    }

    /* ---- reading -------------------------------------------------- */

    function kayitSayisi(uint32 kaynak) external view returns (uint256) {
        return _kayitlar[kaynak].length;
    }

    function kayit(uint32 kaynak, uint64 sira) external view returns (Kayit memory) {
        return _kayitlar[kaynak][sira];
    }

    /// The bytes of a ZINCIRDE record or a candidate (empty for SADECE_HASH).
    function veri(bytes32 icerikHash) external view returns (bytes memory) {
        return _veri[icerikHash];
    }

    function kayitVeri(uint32 kaynak, uint64 sira) external view returns (Kayit memory k, bytes memory v) {
        k = _kayitlar[kaynak][sira];
        v = k.saklama == ZINCIRDE ? _veri[k.icerikHash] : bytes("");
    }

    function model(bytes32 id) external view returns (Model memory) {
        return _modeller[id];
    }

    function modelSayisi() external view returns (uint256) { return modelListesi.length; }
    function modulSayisi() external view returns (uint256) { return modulListesi.length; }
    function oneriSayisi() external view returns (uint256) { return oneriler.length; }

    /// One root over every origin's (eid, length, head), in table order:
    /// equal on two chains exactly when they hold the same memory.
    function hafizaKoku() external view returns (bytes32 kok) {
        for (uint256 i; i < ZincirTablosu.ADET; i++) {
            uint32 e = ZincirTablosu.sira(i).eid;
            kok = keccak256(abi.encode(kok, e, _kayitlar[e].length, bas[e]));
        }
    }
}
