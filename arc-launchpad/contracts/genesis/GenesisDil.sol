// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice What GenesisDil reads from the GENESIS core.
interface IGenesisCekirdekD {
    struct Kayit {
        uint8 tur;
        uint8 saklama;
        address yazar;
        uint64 zaman;
        bytes32 icerikHash;
        bytes32 zincirHash;
    }
    function kayitVeri(uint32 kaynak, uint64 sira) external view returns (Kayit memory k, bytes memory v);
}

/// @title GenesisDil — GENESIS-0, a language model that learns and speaks
///        entirely on chain
///
/// COMPUTATION MODE: 1 (entirely on chain). Both learning and inference run
/// in the EVM: learning is a transaction that updates the model's
/// parameters in this contract's storage; generation and evaluation are
/// view calls anyone can run against any node. Nothing is computed off
/// chain and nothing is trusted from outside.
///
/// WHAT THE MODEL IS
///   A byte-level interpolated trigram model. Bytes, not words, so every
///   language written in UTF-8 is in vocabulary (Turkish, Chinese, code).
///   The parameters are counts: c(a,b,x) for byte x after bytes a,b, with
///   bigram and unigram counts beneath them. Generation backs off from
///   trigram to bigram to unigram; evaluation interpolates all three with
///   fixed weights and add-one smoothing, so no byte has probability zero.
///   It is small on purpose — the first model that can be honestly called
///   GENESIS's own because every parameter is public and every update is
///   a verified transaction. Its capacity is not a ceiling: later model
///   versions are registered in the core next to it.
///
/// WHAT IT LEARNS FROM
///   Only records in the GENESIS core of category 2 (verified knowledge)
///   stored ON CHAIN — i.e. text an agent accepted into memory. Learning
///   logs, measurements and conversations are never training text. Anyone may run the learning (it is gas, not permission);
///   no one can feed it text that memory has not accepted. Long records are
///   learned in chunks; a record is learned exactly once.
///
/// ONE MODEL ON EVERY CHAIN
///   Counts are a sum, so the order in which records are learned does not
///   change them. `durum()` reports the set of fully learned records as a
///   commutative accumulator: two chains that have learned the same
///   records report the same state, whatever order they learned them in.
contract GenesisDil {
    IGenesisCekirdekD public immutable cekirdek;

    uint8 internal constant BILGI = 2;
    uint8 internal constant ZINCIRDE = 0;
    uint256 public constant AZAMI_PARCA = 256;

    /* the parameters */
    mapping(uint24 => uint32) public uc;        // (a<<16)|(b<<8)|x
    mapping(uint16 => uint32) public ucToplam;  // (a<<8)|b
    mapping(uint16 => bytes) internal _ucSonraki;
    mapping(uint16 => uint32) public iki;       // (b<<8)|x
    mapping(uint8 => uint32) public ikiToplam;
    mapping(uint8 => bytes) internal _ikiSonraki;
    mapping(uint8 => uint32) public tek;
    uint32 public tekToplam;
    bytes internal _tekSonraki;

    /* learning progress per record (keyed by its chained hash) */
    mapping(bytes32 => uint32) public ilerleme;   // bytes learned so far
    mapping(bytes32 => bool) public bitti;

    uint256 public ogrenilenKayit;
    uint256 public ogrenilenBayt;
    uint256 public akumulator;                    // sum of keccak(record) over learned records

    event Ogrendi(uint32 indexed kaynak, uint64 indexed sira, bytes32 zincirHash, uint32 baslangic, uint32 uzunluk, bool tamam);

    error OgrenilemezTur();
    error ZincirdeDegil();
    error ZatenOgrenildi();
    error Bos();

    constructor(IGenesisCekirdekD c) {
        cekirdek = c;
    }

    /// Learn up to `parca` (≤ AZAMI_PARCA) more bytes of memory record
    /// (kaynak, sira). About 65k gas a byte; pick `parca` to fit the block.
    /// The context of the first byte of each chunk is the two bytes before
    /// it in the same record, so chunking never changes the result.
    function ogren(uint32 kaynak, uint64 sira, uint256 parca) external returns (bool tamam) {
        (IGenesisCekirdekD.Kayit memory k, bytes memory v) = cekirdek.kayitVeri(kaynak, sira);
        if (k.tur != BILGI) revert OgrenilemezTur();
        if (k.saklama != ZINCIRDE) revert ZincirdeDegil();
        if (v.length == 0) revert Bos();
        bytes32 z = k.zincirHash;
        if (bitti[z]) revert ZatenOgrenildi();
        uint256 bas = ilerleme[z];
        if (parca == 0 || parca > AZAMI_PARCA) parca = AZAMI_PARCA;
        uint256 son = bas + parca;
        if (son > v.length) son = v.length;
        for (uint256 i = bas; i < son; i++) {
            uint8 a = i >= 2 ? uint8(v[i - 2]) : 0;
            uint8 b = i >= 1 ? uint8(v[i - 1]) : 0;
            _say(a, b, uint8(v[i]));
        }
        ilerleme[z] = uint32(son);
        ogrenilenBayt += son - bas;
        tamam = son == v.length;
        if (tamam) {
            bitti[z] = true;
            ogrenilenKayit++;
            unchecked { akumulator += uint256(keccak256(abi.encode(z))); }
        }
        emit Ogrendi(kaynak, sira, z, uint32(bas), uint32(son - bas), tamam);
    }

    function _say(uint8 a, uint8 b, uint8 x) internal {
        uint16 bag3 = (uint16(a) << 8) | b;
        uint24 a3 = (uint24(bag3) << 8) | x;
        if (uc[a3] == 0) _ucSonraki[bag3].push(bytes1(x));
        uc[a3]++;
        ucToplam[bag3]++;
        uint16 a2 = (uint16(b) << 8) | x;
        if (iki[a2] == 0) _ikiSonraki[b].push(bytes1(x));
        iki[a2]++;
        ikiToplam[b]++;
        if (tek[x] == 0) _tekSonraki.push(bytes1(x));
        tek[x]++;
        tekToplam++;
    }

    /* ---- inference, entirely on chain (view) ---------------------- */

    /// Continue `tohum` by `n` bytes. Deterministic for a given `cekirdekSayi`
    /// (the sampling seed): anyone re-running it gets the same text.
    /// ornekle = false: always the most likely byte; true: sample by counts.
    function uret(bytes calldata tohum, uint256 n, uint256 cekirdekSayi, bool ornekle)
        external
        view
        returns (bytes memory cikti)
    {
        cikti = new bytes(n);
        uint8 a = tohum.length >= 2 ? uint8(tohum[tohum.length - 2]) : 0;
        uint8 b = tohum.length >= 1 ? uint8(tohum[tohum.length - 1]) : 0;
        if (tekToplam == 0) return new bytes(0);
        for (uint256 i; i < n; i++) {
            uint8 x = _sonraki(a, b, ornekle ? uint256(keccak256(abi.encode(cekirdekSayi, i))) : type(uint256).max);
            cikti[i] = bytes1(x);
            a = b;
            b = x;
        }
    }

    function _sonraki(uint8 a, uint8 b, uint256 r) internal view returns (uint8) {
        uint16 bag3 = (uint16(a) << 8) | b;
        uint32 t = ucToplam[bag3];
        if (t != 0) return _sec(_ucSonraki[bag3], t, r, 3, bag3);
        t = ikiToplam[b];
        if (t != 0) return _sec(_ikiSonraki[b], t, r, 2, b);
        return _sec(_tekSonraki, tekToplam, r, 1, 0);
    }

    /// r == max: the most frequent continuation (ties: first seen).
    function _sec(bytes storage aday, uint32 toplam, uint256 r, uint8 derece, uint16 bag)
        internal
        view
        returns (uint8 en)
    {
        uint256 n = aday.length;
        if (r == type(uint256).max) {
            uint32 enSayi;
            for (uint256 i; i < n; i++) {
                uint8 x = uint8(aday[i]);
                uint32 s = _sayim(derece, bag, x);
                if (s > enSayi) { enSayi = s; en = x; }
            }
            return en;
        }
        uint256 hedef = r % toplam;
        uint256 kum;
        for (uint256 i; i < n; i++) {
            uint8 x = uint8(aday[i]);
            kum += _sayim(derece, bag, x);
            if (hedef < kum) return x;
        }
        return uint8(aday[n - 1]);
    }

    function _sayim(uint8 derece, uint16 bag, uint8 x) internal view returns (uint32) {
        if (derece == 3) return uc[(uint24(bag) << 8) | x];
        if (derece == 2) return iki[(uint16(uint8(bag)) << 8) | x];
        return tek[x];
    }

    /* ---- evaluation, entirely on chain (view) --------------------- */

    /// Cross-entropy of `metin` under the model, in milli-bits per byte
    /// (lower is better; 8000 = no better than uniform over 256 bytes).
    /// p = (6·p3 + 3·p2 + p1) / (weights of the levels whose context was seen);
/// p3, p2 are maximum-likelihood, p1 is add-one smoothed over 256 bytes.
    /// log2 by fixed-point binary logarithm, 1e-3 bit precision.
    function kayip(bytes calldata metin) external view returns (uint256 milibitBayt) {
        if (metin.length == 0) return 0;
        uint256 toplam;
        uint8 a;
        uint8 b;
        for (uint256 i; i < metin.length; i++) {
            uint8 x = uint8(metin[i]);
            uint16 bag3 = (uint16(a) << 8) | b;
            /* a mixture of three distributions, probabilities scaled by 1e18:
               the trigram and bigram levels use their counts as they are and
               join only where their context has been seen; the unigram level
               is add-one smoothed, so the mixture never gives a byte zero */
            uint256 p1 = ((uint256(tek[x]) + 1) * 1e18) / (uint256(tekToplam) + 256);
            uint256 pay = p1;
            uint256 agirlik = 1;
            uint256 t3 = ucToplam[bag3];
            if (t3 != 0) { pay += (6 * uint256(uc[(uint24(bag3) << 8) | x]) * 1e18) / t3; agirlik += 6; }
            uint256 t2 = ikiToplam[b];
            if (t2 != 0) { pay += (3 * uint256(iki[(uint16(b) << 8) | x]) * 1e18) / t2; agirlik += 3; }
            uint256 p = pay / agirlik;
            toplam += _eksiLog2Mili(p);
            a = b;
            b = x;
        }
        return toplam / metin.length;
    }

    /// -log2(p / 1e18) in milli-bits, for 0 < p <= 1e18.
    function _eksiLog2Mili(uint256 p) internal pure returns (uint256) {
        /* integer part: shift p up until it reaches [0.5, 1) of 1e18 */
        uint256 tam;
        uint256 y = p;
        while (y < 5e17) { y *= 2; tam++; }
        /* now y in [0.5e18, 1e18): -log2(y) in (0, 1]; compute log2(1e18/y)
           by repeated squaring on x = 1e18*1e18/y in [1e18, 2e18) */
        uint256 x = (1e36) / y;
        uint256 kesir;
        uint256 bit = 5e17;   // 2^-1 bit, scaled by 1e18
        for (uint256 i; i < 40; i++) {
            x = (x * x) / 1e18;
            if (x >= 2e18) { x /= 2; kesir += bit; }
            bit /= 2;
        }
        /* to milli-bits, rounded */
        return tam * 1000 + (kesir + 5e14) / 1e15;
    }

    /* ---- reading -------------------------------------------------- */

    /// The model state, equal on two chains that learned the same records.
    function durum() external view returns (uint256 kayitSayisi, uint256 baytSayisi, bytes32 ozet) {
        return (ogrenilenKayit, ogrenilenBayt, bytes32(akumulator));
    }

    function adaylar3(uint8 a, uint8 b) external view returns (bytes memory) {
        return _ucSonraki[(uint16(a) << 8) | b];
    }
}
