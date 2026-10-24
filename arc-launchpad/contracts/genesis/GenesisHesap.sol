// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20H {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @title GenesisHesap — GENESIS COMPUTE NETWORK: independent providers run
///        a model, the chain settles on what they agree on, paid in dollars
///
/// COMPUTATION MODE: 2 (computed by independent participants, settled on
/// chain). Be exact about what that means here: the chain does NOT verify
/// the computation cryptographically. It verifies AGREEMENT — k providers,
/// each with dollars at stake, each committing to an output hash before
/// seeing anyone else's, independently reported the same output for the
/// same model and input. That is redundant execution with commit-reveal,
/// not a proof. It is sound when the model's inference is deterministic
/// (pinned weights by hash, pinned runtime, greedy decoding) and when the
/// k providers are not one party; it is not a zero-knowledge or fraud
/// proof, and nothing here claims to be.
///
/// FLOW
///   1. A requester opens a job: model id, input (on chain, ≤ 4 KiB) or its
///      hash, reward in dollars (escrowed here), quorum k (2–5), deadline.
///   2. Staked providers commit keccak(job, outputHash, salt, provider)
///      during the first half of the window (or until 2k commitments).
///   3. They reveal outputHash and salt in the second half.
///   4. Anyone settles after the deadline (or once every committer has
///      revealed). If ≥ k reveals agree on one hash, the reward is split
///      equally among them; every committer that did not reveal, or
///      revealed something else, pays the fixed penalty from stake to the
///      agreeing providers. Without such agreement the requester gets the
///      reward back, and committers that never revealed pay the penalty to
///      the requester.
///   5. Anyone may publish the agreed output bytes; they are accepted only
///      if they hash to the agreed hash.
///
/// MONEY
///   This contract holds requesters' rewards and providers' stakes, and
///   moves them only by the rules above. No owner, no setter, no upgrade.
///   When a job settles with agreement, 2% of the reward is GENESIS's fee
///   (the same rate as a trade on the platform): 70% of it goes straight to
///   the founder (KURUCU), 30% to growth (BUYUME, the chain's DAO-governed
///   developer fund) — the split the founder set on 15 Oct 2026. The other
///   98% is the providers'. A refunded job pays no fee.
contract GenesisHesap {
    IERC20H public immutable dolar;

    uint256 public constant ASGARI_TEMINAT = 5e6;   // 5 dollars, 6 decimals
    uint256 public constant CEZA = 1e6;              // 1 dollar per fault
    uint64 public constant AYRILMA_BEKLEMESI = 1 days;
    uint256 public constant AZAMI_GIRDI = 4096;
    uint256 public constant UCRET_PPM = 20_000;          // 2% of an agreed reward
    uint256 public constant KURUCU_PAYI_PPM = 700_000;   // 70% of the fee

    address public immutable kurucu;
    address public immutable buyume;

    struct Saglayici {
        uint256 teminat;
        uint32 aktif;          // jobs committed to and not yet settled
        uint64 ayrilmaIstegi;
    }

    struct Is {
        address isteyen;
        bytes32 modelId;
        bytes32 girdiHash;
        uint256 odul;
        uint8 k;
        uint64 taahhutSon;
        uint64 acmaSon;
        uint8 durum;           // 1 open, 2 settled-agreed, 3 settled-refunded
        bytes32 sonuc;
        uint16 taahhutSayisi;
        uint16 acmaSayisi;
    }

    mapping(address => Saglayici) public saglayicilar;
    Is[] internal _isler;
    mapping(uint256 => address[]) internal _taahhutcular;
    mapping(uint256 => mapping(address => bytes32)) public muhurler;
    mapping(uint256 => mapping(address => bytes32)) public acilan;
    mapping(bytes32 => bytes) internal _girdiler;
    mapping(uint256 => bytes) public ciktilar;

    event Kaydoldu(address indexed s, uint256 teminat);
    event AyrilmaIstendi(address indexed s, uint64 zaman);
    event Ayrildi(address indexed s, uint256 iade);
    event IsAcildi(uint256 indexed id, address indexed isteyen, bytes32 indexed modelId, bytes32 girdiHash, uint256 odul, uint8 k, uint64 taahhutSon, uint64 acmaSon);
    event Taahhut(uint256 indexed id, address indexed s);
    event Acildi(uint256 indexed id, address indexed s, bytes32 ciktiHash);
    event Sonuclandi(uint256 indexed id, bool mutabakat, bytes32 sonuc, uint256 kazananSayisi);
    event Ceza(uint256 indexed id, address indexed s, uint256 miktar);
    event CiktiYayinlandi(uint256 indexed id, uint256 uzunluk);
    event Ucret(uint256 indexed id, uint256 kurucuya, uint256 buyumeye);

    error Transfer();
    error AzTeminat();
    error AktifIsVar();
    error Erken();
    error KotuIs();
    error KotuSure();
    error KotuK();
    error Kapali();
    error ZatenVar();
    error Muhursuz();
    error MuhurTutmuyor();
    error HashTutmuyor();

    constructor(IERC20H d, address kurucu_, address buyume_) {
        dolar = d;
        kurucu = kurucu_;
        buyume = buyume_;
    }

    /* ---- providers ------------------------------------------------ */

    function kaydol(uint256 miktar) external {
        if (!dolar.transferFrom(msg.sender, address(this), miktar)) revert Transfer();
        Saglayici storage s = saglayicilar[msg.sender];
        s.teminat += miktar;
        s.ayrilmaIstegi = 0;
        if (s.teminat < ASGARI_TEMINAT) revert AzTeminat();
        emit Kaydoldu(msg.sender, s.teminat);
    }

    function ayrilmaIste() external {
        saglayicilar[msg.sender].ayrilmaIstegi = uint64(block.timestamp);
        emit AyrilmaIstendi(msg.sender, uint64(block.timestamp));
    }

    function ayril() external {
        Saglayici storage s = saglayicilar[msg.sender];
        if (s.aktif != 0) revert AktifIsVar();
        if (s.ayrilmaIstegi == 0 || block.timestamp < s.ayrilmaIstegi + AYRILMA_BEKLEMESI) revert Erken();
        uint256 m = s.teminat;
        s.teminat = 0;
        s.ayrilmaIstegi = 0;
        if (!dolar.transfer(msg.sender, m)) revert Transfer();
        emit Ayrildi(msg.sender, m);
    }

    /* ---- jobs ----------------------------------------------------- */

    /// Open a job. `girdiVeri` may be empty (then only `girdiHash` is on chain).
    function isAc(bytes32 modelId, bytes32 girdiHash, bytes calldata girdiVeri, uint256 odul, uint8 k, uint64 sure)
        external
        returns (uint256 id)
    {
        if (k < 2 || k > 5) revert KotuK();
        if (sure < 120 || sure > 7 days) revert KotuSure();
        if (girdiVeri.length > AZAMI_GIRDI) revert KotuIs();
        if (girdiVeri.length != 0) {
            if (keccak256(girdiVeri) != girdiHash) revert HashTutmuyor();
            if (_girdiler[girdiHash].length == 0) _girdiler[girdiHash] = girdiVeri;
        }
        if (odul == 0 || !dolar.transferFrom(msg.sender, address(this), odul)) revert Transfer();
        uint64 simdi = uint64(block.timestamp);
        id = _isler.length;
        _isler.push(Is(msg.sender, modelId, girdiHash, odul, k, simdi + sure / 2, simdi + sure, 1, bytes32(0), 0, 0));
        emit IsAcildi(id, msg.sender, modelId, girdiHash, odul, k, simdi + sure / 2, simdi + sure);
    }

    /// muhur = keccak256(abi.encode(id, ciktiHash, tuz, provider))
    function taahhutEt(uint256 id, bytes32 muhur) external {
        Is storage j = _is(id);
        if (j.durum != 1 || block.timestamp > j.taahhutSon || j.taahhutSayisi >= uint16(j.k) * 2) revert Kapali();
        Saglayici storage s = saglayicilar[msg.sender];
        if (s.teminat < ASGARI_TEMINAT || s.ayrilmaIstegi != 0) revert AzTeminat();
        if (muhurler[id][msg.sender] != bytes32(0)) revert ZatenVar();
        muhurler[id][msg.sender] = muhur;
        _taahhutcular[id].push(msg.sender);
        j.taahhutSayisi++;
        s.aktif++;
        emit Taahhut(id, msg.sender);
    }

    /// Reveal, once the commit window is over or the commit list is full.
    function ac(uint256 id, bytes32 ciktiHash, bytes32 tuz) external {
        Is storage j = _is(id);
        if (j.durum != 1 || block.timestamp > j.acmaSon) revert Kapali();
        if (block.timestamp <= j.taahhutSon && j.taahhutSayisi < uint16(j.k) * 2) revert Erken();
        bytes32 m = muhurler[id][msg.sender];
        if (m == bytes32(0)) revert Muhursuz();
        if (acilan[id][msg.sender] != bytes32(0)) revert ZatenVar();
        if (keccak256(abi.encode(id, ciktiHash, tuz, msg.sender)) != m) revert MuhurTutmuyor();
        acilan[id][msg.sender] = ciktiHash;
        j.acmaSayisi++;
        emit Acildi(id, msg.sender, ciktiHash);
    }

    /// Settle: after the deadline, or as soon as every committer revealed.
    function sonuclandir(uint256 id) external {
        Is storage j = _is(id);
        if (j.durum != 1) revert Kapali();
        if (block.timestamp <= j.acmaSon && (j.acmaSayisi < j.taahhutSayisi || j.taahhutSayisi == 0)) revert Erken();
        address[] storage ts = _taahhutcular[id];

        /* the most-revealed hash */
        bytes32 en;
        uint256 enSayi;
        for (uint256 i; i < ts.length; i++) {
            bytes32 h = acilan[id][ts[i]];
            if (h == bytes32(0)) continue;
            uint256 c;
            for (uint256 q; q < ts.length; q++) if (acilan[id][ts[q]] == h) c++;
            if (c > enSayi) { enSayi = c; en = h; }
        }

        bool mutabakat = enSayi >= j.k;
        j.durum = mutabakat ? 2 : 3;
        j.sonuc = mutabakat ? en : bytes32(0);

        uint256 ucret = mutabakat ? (j.odul * UCRET_PPM) / 1_000_000 : 0;
        uint256 havuz = mutabakat ? j.odul - ucret : 0;
        uint256 iade = mutabakat ? 0 : j.odul;
        for (uint256 i; i < ts.length; i++) {
            address a = ts[i];
            Saglayici storage s = saglayicilar[a];
            s.aktif--;
            bytes32 h = acilan[id][a];
            bool hatali = mutabakat ? h != en : h == bytes32(0);
            if (hatali) {
                uint256 c = s.teminat < CEZA ? s.teminat : CEZA;
                s.teminat -= c;
                if (mutabakat) havuz += c; else iade += c;
                emit Ceza(id, a, c);
            }
        }
        if (mutabakat) {
            uint256 pay = havuz / enSayi;
            uint256 kalan = havuz - pay * enSayi;
            for (uint256 i; i < ts.length; i++) {
                if (acilan[id][ts[i]] == en) {
                    if (!dolar.transfer(ts[i], pay + kalan)) revert Transfer();
                    kalan = 0;
                }
            }
        }
        if (iade != 0 && !dolar.transfer(j.isteyen, iade)) revert Transfer();
        if (ucret != 0) {
            uint256 k = (ucret * KURUCU_PAYI_PPM) / 1_000_000;
            if (!dolar.transfer(kurucu, k) || !dolar.transfer(buyume, ucret - k)) revert Transfer();
            emit Ucret(id, k, ucret - k);
        }
        emit Sonuclandi(id, mutabakat, j.sonuc, mutabakat ? enSayi : 0);
    }

    /// Publish the agreed output bytes; accepted only if they hash to it.
    function ciktiYayinla(uint256 id, bytes calldata cikti) external {
        Is storage j = _is(id);
        if (j.durum != 2) revert Kapali();
        if (keccak256(cikti) != j.sonuc) revert HashTutmuyor();
        if (ciktilar[id].length != 0) revert ZatenVar();
        ciktilar[id] = cikti;
        emit CiktiYayinlandi(id, cikti.length);
    }

    /* ---- reading -------------------------------------------------- */

    function _is(uint256 id) internal view returns (Is storage) {
        if (id >= _isler.length) revert KotuIs();
        return _isler[id];
    }

    function isBilgisi(uint256 id) external view returns (Is memory) { return _is(id); }
    function isSayisi() external view returns (uint256) { return _isler.length; }
    function taahhutculer(uint256 id) external view returns (address[] memory) { return _taahhutcular[id]; }
    function girdi(bytes32 h) external view returns (bytes memory) { return _girdiler[h]; }
}
