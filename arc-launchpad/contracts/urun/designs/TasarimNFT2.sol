// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/* ===========================================================================
 * TasarimNFT2 — "Designs" v2: the designer NFT marketplace of ARC PULSE (Arc)
 *
 * v1 (TasarimNFT) left the file key to the seller's goodwill. Owner, 1 Nov
 * 2026: delivering the key is the condition of getting paid, on chain.
 *
 * A designer launches their own token through MerkezKapi and records type 8
 * ("designer") in TurKaydi2. They publish 1-of-1 designs (digital files,
 * images) here, committing keccak256(fileKey) at publish (anahtarTaahhut).
 *
 * KEY DELIVERY, ENFORCED
 *   Every wallet publishes an encryption public key once (anahtarKaydet;
 *   the site derives it from a wallet signature). Buying needs one. Every
 *   sale, first or resale, token or alUsdc, goes to escrow: the NFT moves to
 *   the buyer but is frozen, the payment stays here.
 *     1. The seller posts the file key encrypted to the buyer's key
 *        (teslimEt; the envelope is in the event, its hash on chain) within
 *        teslimSuresi (default 3 days), or anyone refunds the buyer and the
 *        NFT goes back to the seller (iadeEt).
 *     2. The buyer confirms (teslimAldim) or lets anahtarItirazSuresi
 *        (default 3 days) pass; then anyone releases the payment to the
 *        seller and the royalty to the designer (serbestBirak). Or the
 *        buyer disputes in that window (anahtarItiraz: "the key doesn't
 *        work") and the admin (later the DAO) refunds the buyer or pays the
 *        seller.
 *   Copy challenges combine with this: no payment is released while a copy
 *   challenge is open or (kopyaPenceresiBekle, default on) before the
 *   design's challenge window ends; an upheld copy or a takedown refunds the
 *   buyer from escrow and burns the design.
 *
 * FINGERPRINTS AND FRONT-RUNNING
 *   A second design with the same file hash or perceptual fingerprint is
 *   refused. Publishing reveals the hashes in the mempool, so there is an
 *   optional commit-reveal: taahhutEt(keccak256(abi.encode(sender, dosyaHash,
 *   algiHash, tuz))), then yayinlaAcik within taahhutBlok blocks. A design
 *   holding one of those hashes that was published AFTER the commit block
 *   is a front-runner's: it is burned (its buyer refunded, its stake to the
 *   revealer) and the fingerprint goes to the revealer. Plain yayinla stays.
 *
 * LICENSE
 *   The holder of the NFT holds all usage rights to the design, commercial
 *   included; on transfer they pass to the new holder and the previous holder
 *   keeps none. Metadata: "license": LISANS_URI, "license_text": LISANS.
 *
 * MONEY
 *   Publish: ucret1 + ucret2 USDC (default $0.10 + $0.10) plus an optional
 *   refundable stake. Sales priced in USDC, paid in the designer token at the
 *   TWAP (fiyatBirimi 1e30: PulseHook6 prices 1e30 units), the whole amount
 *   to the seller, an optional royalty (default 0) to the designer on
 *   resales. The contract keeps no cut; borcOf tracks what it owes per token
 *   and sweep can only take what is above that.
 *
 * ADMIN
 *   Every amount, wallet, window and source is settable (owner's order:
 *   nothing locked). The admin cannot take anyone's NFT or escrow except by
 *   resolving a dispute or a challenge, which is exactly the DAO's job.
 *   Two-step handover.
 * =========================================================================== */

interface ITurKaydi {
    function turOf(address token) external view returns (uint8);
    function kurucuOf(address token) external view returns (address);
}

/// USDC (6 decimals) price of `fiyatBirimi` base units of `token`, time-weighted
/// over `saniye` seconds (PulseHook6: 1e30 units).
interface IFiyatKaynagi {
    function twapUsdcPerToken(address token, uint32 saniye) external view returns (uint256);
}

/// Same ABI as Uniswap v4's PoolKey.
struct HavuzAnahtari {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/// contracts/SwapRouter.sol on Arc: exact input, pulls from and pays to msg.sender.
interface ITakasRouter {
    function swap(HavuzAnahtari calldata key, bool zeroForOne, uint256 amountIn, uint256 minOut)
        external
        payable
        returns (uint256);
}

contract TasarimNFT2 is ERC721, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant TASARIMCI_TURU = 8;
    uint256 public constant URI_AZAMI = 512;
    uint256 public constant ANAHTAR_AZAMI = 100;
    uint256 public constant ZARF_AZAMI = 200;
    uint256 public constant TELIF_AZAMI_BPS = 1000;
    uint256 public constant TOLERANS_AZAMI_BPS = 5000;

    string public constant LISANS =
        "The holder of this NFT holds all usage rights to the design, including commercial use. "
        "On transfer all rights pass to the new holder; the previous holder keeps none.";
    string public constant LISANS_URI = "https://arcpulse.app/#/designs/license";

    IERC20 public immutable usdc;

    /* ---- admin settings ---- */
    address public yonetici;
    address public bekleyenYonetici;
    ITurKaydi public turKaydi;
    address public alici1;
    address public alici2;
    uint256 public ucret1 = 100_000;
    uint256 public ucret2 = 100_000;
    uint256 public tasarimciTeminati;
    uint256 public itirazTeminati = 5_000_000;
    uint64 public itirazSuresi = 3 days;          // copy challenges
    uint64 public teslimSuresi = 3 days;          // seller must deliver the key
    uint64 public anahtarItirazSuresi = 3 days;   // buyer may dispute the key
    uint64 public taahhutBlok = 1800;             // commit-reveal: reveal within this many blocks
    IFiyatKaynagi public fiyatKaynagi;
    uint32 public twapSaniye = 1800;
    uint256 public fiyatBirimi = 1e30;
    uint16 public telifBps;
    ITakasRouter public router;
    uint16 public alUsdcToleransBps = 1000;
    bool public durduruldu;
    bool public kopyaPenceresiBekle = true;

    struct KancaAyar { bool izinli; uint24 fee; int24 tickSpacing; }
    mapping(address => KancaAyar) public kancaAyar;
    mapping(address => address) public elleBagliToken;

    /* ---- keys ---- */
    mapping(address => bytes) public anahtarOf;

    /* ---- designs ---- */
    struct Tasarim {
        address token;
        address tasarimci;
        uint64 itirazBitis;
        uint64 yayinBlok;
        bytes32 dosyaHash;
        bytes32 algiHash;
        bytes32 anahtarTaahhut; // keccak256(fileKey)
        uint256 teminat;
    }
    struct Ilan { address satici; uint256 fiyat; }
    struct Itiraz { address itirazci; uint256 teminat; uint256 oncekiId; }

    /// 0 none, 1 awaiting delivery, 2 delivered, 3 key disputed, 4 confirmed
    struct Satis {
        address alici;
        uint8 durum;
        address satici;
        uint64 teslimSonu;      // delivery deadline
        uint64 itirazSonu;      // end of the buyer's dispute window, set at delivery
        uint64 itirazPenceresi; // snapshot of anahtarItirazSuresi
        uint256 miktar;         // designer tokens held
        uint256 telif;
        bytes32 aliciAnahtarHash;
        bytes32 zarfHash;
    }

    uint256 public sonId;
    mapping(uint256 => Tasarim) public tasarimOf;
    mapping(uint256 => string) private uriOf;
    mapping(uint256 => Ilan) public ilanOf;
    mapping(uint256 => Itiraz) public itirazOf;
    mapping(uint256 => Satis) public satisOf;
    mapping(bytes32 => uint256) public dosyaKaydi;
    mapping(bytes32 => uint256) public algiKaydi;
    mapping(address => mapping(bytes32 => uint256)) public taahhutOf; // sender -> commitment -> block
    mapping(address => uint256) public borcOf;

    /* ---- events ---- */
    event AnahtarKaydedildi(address indexed cuzdan, bytes anahtar);
    event Taahhut(address indexed kim, bytes32 taahhut, uint256 blok);
    event Yayinlandi(uint256 indexed id, address indexed tasarimci, address indexed token, bytes32 dosyaHash, bytes32 algiHash, bytes32 anahtarTaahhut, string uri, uint256 ucret, uint256 teminat);
    event OnuAlindi(uint256 indexed yeniId, uint256 indexed eskiId);
    event IlanVerildi(uint256 indexed id, address indexed satici, uint256 fiyat);
    event IlanKalkti(uint256 indexed id);
    event Satildi(uint256 indexed id, address indexed satici, address indexed alici, uint256 fiyat, address token, uint256 tokenMiktari, uint256 telif, bool usdcIle);
    event TeslimEdildi(uint256 indexed id, address indexed alici, bytes zarf);
    event TeslimAlindi(uint256 indexed id);
    event AnahtarItirazi(uint256 indexed id, address alici);
    event SatisKapandi(uint256 indexed id, bool saticiyaOdendi, address kime, uint256 miktar);
    event ItirazEdildi(uint256 indexed id, address indexed itirazci, uint256 oncekiId, string kanitUri, uint256 teminat);
    event ItirazCozuldu(uint256 indexed id, bool kabul, address itirazci, uint256 odenen, address alan);
    event Kaldirildi(uint256 indexed id, string sebep);
    event TeminatIade(uint256 indexed id, address kime, uint256 miktar);
    event Supuruldu(address indexed token, address to, uint256 miktar);
    event AyarDegisti(bytes32 indexed ad, uint256 deger);
    event AdresDegisti(bytes32 indexed ad, address deger);
    event KancaDegisti(address indexed kanca, bool izinli, uint24 fee, int24 tickSpacing);
    event ElleBaglandi(address indexed tasarimci, address token);
    event ParmakIziSerbest(bytes32 dosyaHash, bytes32 algiHash);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);

    /* ---- errors ---- */
    error YetkiYok();
    error SifirAdres();
    error KotuDeger();
    error Durduruldu();
    error TasarimciDegil();
    error KopyaDosya(uint256 mevcutId);
    error KopyaAlgi(uint256 mevcutId);
    error IlanYok();
    error ItirazAcik();
    error ItirazYok();
    error SureBitti();
    error SureBitmedi();
    error FiyatYok();
    error KaymaAsildi(uint256 gereken, uint256 azami);
    error KancaIzinsiz();
    error AzCikti(uint256 gelen, uint256 asgari);
    error FazlaYok(uint256 serbest);
    error AnahtarYok();
    error KotuDurum(uint8 durum);
    error Kilitli();
    error TaahhutYok();

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert YetkiYok();
        _;
    }

    modifier calisiyor() {
        if (durduruldu) revert Durduruldu();
        _;
    }

    constructor(
        IERC20 usdc_,
        ITurKaydi turKaydi_,
        address yonetici_,
        address alici1_,
        address alici2_,
        ITakasRouter router_
    ) ERC721("ARC PULSE Designs", "DESIGN") {
        if (address(usdc_) == address(0) || address(turKaydi_) == address(0) || yonetici_ == address(0)
            || alici1_ == address(0) || alici2_ == address(0) || address(router_) == address(0)) revert SifirAdres();
        usdc = usdc_;
        turKaydi = turKaydi_;
        yonetici = yonetici_;
        alici1 = alici1_;
        alici2 = alici2_;
        router = router_;
    }

    /* ======================================================================
     * KEYS
     * ====================================================================== */

    /// Publish (or replace) this wallet's encryption public key. A sale
    /// remembers the hash of the key it was made with, so replacing it later
    /// does not change what an open sale's envelope must be encrypted to.
    function anahtarKaydet(bytes calldata anahtar) public {
        if (anahtar.length == 0 || anahtar.length > ANAHTAR_AZAMI) revert KotuDeger();
        anahtarOf[msg.sender] = anahtar;
        emit AnahtarKaydedildi(msg.sender, anahtar);
    }

    /* ======================================================================
     * PUBLISH
     * ====================================================================== */

    function yayinlayabilir(address tasarimci, address token) public view returns (bool) {
        if (tasarimci == address(0) || token == address(0)) return false;
        if (elleBagliToken[tasarimci] == token) return true;
        return turKaydi.turOf(token) == TASARIMCI_TURU && turKaydi.kurucuOf(token) == tasarimci;
    }

    /// Publish one design in the open (its hashes are visible in the mempool).
    function yayinla(
        address token,
        bytes32 dosyaHash,
        bytes32 algiHash,
        bytes32 anahtarTaahhut,
        string calldata uri,
        uint256 fiyat
    ) external nonReentrant calisiyor returns (uint256) {
        if (dosyaKaydi[dosyaHash] != 0) revert KopyaDosya(dosyaKaydi[dosyaHash]);
        if (algiKaydi[algiHash] != 0) revert KopyaAlgi(algiKaydi[algiHash]);
        return _yayinla(token, dosyaHash, algiHash, anahtarTaahhut, uri, fiyat);
    }

    /// Commit to a publish without showing its hashes:
    /// taahhut = keccak256(abi.encode(msg.sender, dosyaHash, algiHash, tuz)).
    function taahhutEt(bytes32 taahhut) external calisiyor {
        if (taahhut == bytes32(0)) revert KotuDeger();
        taahhutOf[msg.sender][taahhut] = block.number;
        emit Taahhut(msg.sender, taahhut, block.number);
    }

    /// Reveal a commitment from an earlier block (within taahhutBlok blocks)
    /// and publish. A design holding one of these hashes that was published
    /// after the commit block is a front-runner's and is burned.
    function yayinlaAcik(
        address token,
        bytes32 dosyaHash,
        bytes32 algiHash,
        bytes32 anahtarTaahhut,
        string calldata uri,
        uint256 fiyat,
        bytes32 tuz
    ) external nonReentrant calisiyor returns (uint256 id) {
        bytes32 c = keccak256(abi.encode(msg.sender, dosyaHash, algiHash, tuz));
        uint256 b = taahhutOf[msg.sender][c];
        if (b == 0 || block.number <= b || block.number > b + taahhutBlok) revert TaahhutYok();
        delete taahhutOf[msg.sender][c];
        uint256 e1 = dosyaKaydi[dosyaHash];
        uint256 e2 = algiKaydi[algiHash];
        if (e1 != 0 && tasarimOf[e1].yayinBlok <= b) revert KopyaDosya(e1);
        if (e2 != 0 && tasarimOf[e2].yayinBlok <= b) revert KopyaAlgi(e2);
        id = _yayinla(token, dosyaHash, algiHash, anahtarTaahhut, uri, fiyat);
        if (e1 != 0) _onuAlinan(e1, id);
        if (e2 != 0 && e2 != e1) _onuAlinan(e2, id);
    }

    function _onuAlinan(uint256 eski, uint256 yeni) private {
        Tasarim storage t = tasarimOf[eski];
        /* the front-runner's other fingerprint is released too, unless the
           new design now holds it */
        if (dosyaKaydi[t.dosyaHash] == eski) delete dosyaKaydi[t.dosyaHash];
        if (algiKaydi[t.algiHash] == eski) delete algiKaydi[t.algiHash];
        if (_ownerOf(eski) != address(0)) _yak(eski, msg.sender);
        emit OnuAlindi(yeni, eski);
    }

    function _yayinla(
        address token,
        bytes32 dosyaHash,
        bytes32 algiHash,
        bytes32 anahtarTaahhut,
        string calldata uri,
        uint256 fiyat
    ) private returns (uint256 id) {
        if (!yayinlayabilir(msg.sender, token)) revert TasarimciDegil();
        if (dosyaHash == bytes32(0) || algiHash == bytes32(0) || anahtarTaahhut == bytes32(0)) revert KotuDeger();
        uint256 n = bytes(uri).length;
        if (n == 0 || n > URI_AZAMI) revert KotuDeger();

        id = ++sonId;
        uint256 teminat = tasarimciTeminati;
        dosyaKaydi[dosyaHash] = id;
        algiKaydi[algiHash] = id;
        tasarimOf[id] = Tasarim({
            token: token,
            tasarimci: msg.sender,
            itirazBitis: uint64(block.timestamp) + itirazSuresi,
            yayinBlok: uint64(block.number),
            dosyaHash: dosyaHash,
            algiHash: algiHash,
            anahtarTaahhut: anahtarTaahhut,
            teminat: teminat
        });
        uriOf[id] = uri;
        _mint(msg.sender, id);
        if (fiyat > 0) {
            ilanOf[id] = Ilan(msg.sender, fiyat);
            emit IlanVerildi(id, msg.sender, fiyat);
        }

        uint256 u1 = ucret1;
        uint256 u2 = ucret2;
        if (u1 > 0) usdc.safeTransferFrom(msg.sender, alici1, u1);
        if (u2 > 0) usdc.safeTransferFrom(msg.sender, alici2, u2);
        if (teminat > 0) {
            borcOf[address(usdc)] += teminat;
            usdc.safeTransferFrom(msg.sender, address(this), teminat);
        }
        emit Yayinlandi(id, msg.sender, token, dosyaHash, algiHash, anahtarTaahhut, uri, u1 + u2, teminat);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return uriOf[id];
    }

    function teminatGeriAl(uint256 id) external nonReentrant {
        Tasarim storage t = tasarimOf[id];
        if (msg.sender != t.tasarimci) revert YetkiYok();
        if (block.timestamp <= t.itirazBitis) revert SureBitmedi();
        if (itirazOf[id].itirazci != address(0)) revert ItirazAcik();
        uint256 m = t.teminat;
        if (m == 0) revert KotuDeger();
        t.teminat = 0;
        borcOf[address(usdc)] -= m;
        usdc.safeTransfer(msg.sender, m);
        emit TeminatIade(id, msg.sender, m);
    }

    /* ======================================================================
     * SALE: every sale goes to escrow until the key is delivered
     * ====================================================================== */

    function ilanVer(uint256 id, uint256 fiyat) external calisiyor {
        if (ownerOf(id) != msg.sender) revert YetkiYok();
        if (satisOf[id].durum != 0) revert Kilitli();
        if (fiyat == 0) revert KotuDeger();
        ilanOf[id] = Ilan(msg.sender, fiyat);
        emit IlanVerildi(id, msg.sender, fiyat);
    }

    function ilanKaldir(uint256 id) external {
        if (ownerOf(id) != msg.sender) revert YetkiYok();
        delete ilanOf[id];
        emit IlanKalkti(id);
    }

    function tokenKarsiligi(address token, uint256 fiyat) public view returns (uint256) {
        if (address(fiyatKaynagi) == address(0)) revert FiyatYok();
        uint256 p = fiyatKaynagi.twapUsdcPerToken(token, twapSaniye);
        if (p == 0) revert FiyatYok();
        return (fiyat * fiyatBirimi + p - 1) / p;
    }

    /// Buy paying in the designer token (approved to this contract), at most
    /// `maxToken`. `anahtar` registers the buyer's key in the same call (empty:
    /// the registered one is used).
    function al(uint256 id, uint256 maxToken, bytes calldata anahtar)
        external
        nonReentrant
        calisiyor
        returns (uint256 miktar)
    {
        (address satici, uint256 fiyat, address token, address tasarimci) = _satisHazirla(id, anahtar);
        miktar = tokenKarsiligi(token, fiyat);
        if (miktar > maxToken) revert KaymaAsildi(miktar, maxToken);
        _emaneteAl(id, token, satici, tasarimci, miktar);
        IERC20(token).safeTransferFrom(msg.sender, address(this), miktar);
        emit Satildi(id, satici, msg.sender, fiyat, token, miktar, satisOf[id].telif, false);
    }

    /// Buy paying the USDC price in USDC, swapped into the designer token in
    /// its launch pool (hook allowed by the admin); the output must reach the
    /// buyer's `minToken` and the TWAP value minus alUsdcToleransBps. The
    /// tokens are held in escrow like any other sale; a refund pays them back.
    function alUsdc(uint256 id, address kanca, uint256 minToken, bytes calldata anahtar)
        external
        nonReentrant
        calisiyor
        returns (uint256 miktar)
    {
        (address satici, uint256 fiyat, address token, address tasarimci) = _satisHazirla(id, anahtar);
        KancaAyar memory k = kancaAyar[kanca];
        if (!k.izinli) revert KancaIzinsiz();
        uint256 taban = tokenKarsiligi(token, fiyat) * (10_000 - alUsdcToleransBps) / 10_000;
        if (minToken > taban) taban = minToken;

        usdc.safeTransferFrom(msg.sender, address(this), fiyat);
        bool usdcSifirinci = address(usdc) < token;
        HavuzAnahtari memory key = HavuzAnahtari({
            currency0: usdcSifirinci ? address(usdc) : token,
            currency1: usdcSifirinci ? token : address(usdc),
            fee: k.fee,
            tickSpacing: k.tickSpacing,
            hooks: kanca
        });
        uint256 once = IERC20(token).balanceOf(address(this));
        usdc.forceApprove(address(router), fiyat);
        router.swap(key, usdcSifirinci, fiyat, taban);
        usdc.forceApprove(address(router), 0);
        miktar = IERC20(token).balanceOf(address(this)) - once;
        if (miktar < taban) revert AzCikti(miktar, taban);
        _emaneteAl(id, token, satici, tasarimci, miktar);
        emit Satildi(id, satici, msg.sender, fiyat, token, miktar, satisOf[id].telif, true);
    }

    function _satisHazirla(uint256 id, bytes calldata anahtar)
        private
        returns (address satici, uint256 fiyat, address token, address tasarimci)
    {
        Ilan memory i = ilanOf[id];
        if (i.fiyat == 0) revert IlanYok();
        if (itirazOf[id].itirazci != address(0)) revert ItirazAcik();
        if (i.satici == msg.sender) revert KotuDeger();
        if (anahtar.length != 0) anahtarKaydet(anahtar);
        else if (anahtarOf[msg.sender].length == 0) revert AnahtarYok();
        Tasarim storage t = tasarimOf[id];
        return (i.satici, i.fiyat, t.token, t.tasarimci);
    }

    /// The NFT moves to the buyer, frozen; the payment is held.
    function _emaneteAl(uint256 id, address token, address satici, address tasarimci, uint256 miktar) private {
        uint256 telif = satici == tasarimci ? 0 : miktar * telifBps / 10_000;
        _transfer(satici, msg.sender, id); // clears the listing (see _update)
        satisOf[id] = Satis({
            alici: msg.sender,
            durum: 1,
            satici: satici,
            teslimSonu: uint64(block.timestamp) + teslimSuresi,
            itirazSonu: 0,
            itirazPenceresi: anahtarItirazSuresi,
            miktar: miktar,
            telif: telif,
            aliciAnahtarHash: keccak256(anahtarOf[msg.sender]),
            zarfHash: bytes32(0)
        });
        borcOf[token] += miktar;
    }

    /// The seller posts the file key encrypted to the buyer's key.
    function teslimEt(uint256 id, bytes calldata zarf) external {
        Satis storage s = satisOf[id];
        if (msg.sender != s.satici) revert YetkiYok();
        if (s.durum != 1) revert KotuDurum(s.durum);
        if (zarf.length == 0 || zarf.length > ZARF_AZAMI) revert KotuDeger();
        s.durum = 2;
        s.zarfHash = keccak256(zarf);
        s.itirazSonu = uint64(block.timestamp) + s.itirazPenceresi;
        emit TeslimEdildi(id, s.alici, zarf);
    }

    /// The buyer confirms the key works; pays the seller at once when nothing
    /// else holds the payment.
    function teslimAldim(uint256 id) external nonReentrant {
        Satis storage s = satisOf[id];
        if (msg.sender != s.alici) revert YetkiYok();
        if (s.durum != 2) revert KotuDurum(s.durum);
        s.durum = 4;
        emit TeslimAlindi(id);
        if (_kopyaEngeli(id) == 0) _saticiyaOde(id);
    }

    /// The buyer says the key does not work: frozen for the admin.
    function anahtarItiraz(uint256 id) external {
        Satis storage s = satisOf[id];
        if (msg.sender != s.alici) revert YetkiYok();
        if (s.durum != 2) revert KotuDurum(s.durum);
        if (block.timestamp > s.itirazSonu) revert SureBitti();
        s.durum = 3;
        emit AnahtarItirazi(id, msg.sender);
    }

    /// Anyone: pays the seller once the buyer confirmed or the dispute window
    /// passed, with no copy challenge holding it.
    function serbestBirak(uint256 id) external nonReentrant {
        Satis storage s = satisOf[id];
        if (s.durum == 2) {
            if (block.timestamp <= s.itirazSonu) revert SureBitmedi();
        } else if (s.durum != 4) {
            revert KotuDurum(s.durum);
        }
        uint8 engel = _kopyaEngeli(id);
        if (engel == 1) revert ItirazAcik();
        if (engel == 2) revert SureBitmedi();
        _saticiyaOde(id);
    }

    /// Anyone: no key delivered by the deadline, so the buyer is refunded and
    /// the NFT goes back to the seller.
    function iadeEt(uint256 id) external nonReentrant {
        Satis storage s = satisOf[id];
        if (s.durum != 1) revert KotuDurum(s.durum);
        if (block.timestamp <= s.teslimSonu) revert SureBitmedi();
        _aliciyaIade(id, true);
    }

    /// Admin (later the DAO) resolves a key dispute: refund the buyer (the NFT
    /// goes back to the seller) or side with the seller (paid now, or as soon
    /// as no copy challenge holds it).
    function anahtarItirazCoz(uint256 id, bool aliciHakli) external nonReentrant sadeceYonetici {
        Satis storage s = satisOf[id];
        if (s.durum != 3) revert KotuDurum(s.durum);
        if (aliciHakli) {
            _aliciyaIade(id, true);
        } else {
            s.durum = 4;
            if (_kopyaEngeli(id) == 0) _saticiyaOde(id);
        }
    }

    /// 0 free, 1 a copy challenge is open, 2 the copy window is still open.
    function _kopyaEngeli(uint256 id) private view returns (uint8) {
        if (itirazOf[id].itirazci != address(0)) return 1;
        if (kopyaPenceresiBekle && block.timestamp <= tasarimOf[id].itirazBitis) return 2;
        return 0;
    }

    function _saticiyaOde(uint256 id) private {
        Satis memory s = satisOf[id];
        Tasarim storage t = tasarimOf[id];
        delete satisOf[id];
        borcOf[t.token] -= s.miktar;
        IERC20(t.token).safeTransfer(s.satici, s.miktar - s.telif);
        if (s.telif > 0) IERC20(t.token).safeTransfer(t.tasarimci, s.telif);
        emit SatisKapandi(id, true, s.satici, s.miktar);
    }

    /// Refund the buyer; `geriVer` moves the NFT back to the seller (false
    /// when the design is about to be burned).
    function _aliciyaIade(uint256 id, bool geriVer) private {
        Satis memory s = satisOf[id];
        address token = tasarimOf[id].token;
        delete satisOf[id];
        if (geriVer) _transfer(s.alici, s.satici, id);
        borcOf[token] -= s.miktar;
        IERC20(token).safeTransfer(s.alici, s.miktar);
        emit SatisKapandi(id, false, s.alici, s.miktar);
    }

    /// Movement ends a listing; a design in an open sale cannot be moved by
    /// its holder (only by this contract: refund or burn).
    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        if (auth != address(0) && satisOf[id].durum != 0) revert Kilitli();
        from = super._update(to, id, auth);
        if (ilanOf[id].fiyat != 0) {
            delete ilanOf[id];
            emit IlanKalkti(id);
        }
    }

    /* ======================================================================
     * COPY CHALLENGES AND TAKEDOWN
     * ====================================================================== */

    function itirazEt(uint256 id, uint256 oncekiId, string calldata kanitUri) external nonReentrant calisiyor {
        _requireOwned(id);
        if (block.timestamp > tasarimOf[id].itirazBitis) revert SureBitti();
        if (itirazOf[id].itirazci != address(0)) revert ItirazAcik();
        if (oncekiId == 0 ? bytes(kanitUri).length == 0 : oncekiId >= id) revert KotuDeger();
        if (bytes(kanitUri).length > URI_AZAMI) revert KotuDeger();
        uint256 b = itirazTeminati;
        itirazOf[id] = Itiraz(msg.sender, b, oncekiId);
        if (b > 0) {
            borcOf[address(usdc)] += b;
            usdc.safeTransferFrom(msg.sender, address(this), b);
        }
        emit ItirazEdildi(id, msg.sender, oncekiId, kanitUri, b);
    }

    /// Upheld: burned, the open sale's buyer refunded, the challenger gets the
    /// bond back plus the stake. Rejected: the bond goes to the designer.
    function itirazCoz(uint256 id, bool kabul) external nonReentrant sadeceYonetici {
        Itiraz memory i = itirazOf[id];
        if (i.itirazci == address(0)) revert ItirazYok();
        if (kabul) {
            _yak(id, i.itirazci); // pays the bond and the stake to the challenger
            emit ItirazCozuldu(id, true, i.itirazci, i.teminat, i.itirazci);
        } else {
            delete itirazOf[id];
            address alan = tasarimOf[id].tasarimci;
            borcOf[address(usdc)] -= i.teminat;
            if (i.teminat > 0) usdc.safeTransfer(alan, i.teminat);
            emit ItirazCozuldu(id, false, i.itirazci, i.teminat, alan);
        }
    }

    /// Legal takedown at any time: the open sale's buyer and an open
    /// challenger are refunded, the stake goes back to the designer.
    function kaldir(uint256 id, string calldata sebep) external nonReentrant sadeceYonetici {
        _requireOwned(id);
        _yak(id, tasarimOf[id].tasarimci);
        emit Kaldirildi(id, sebep);
    }

    /// Burns a design: refunds an open sale's buyer, returns an open copy
    /// challenge's bond to its challenger and pays the stake to `teminatAlici`.
    function _yak(uint256 id, address teminatAlici) private {
        if (satisOf[id].durum != 0) _aliciyaIade(id, false);
        Itiraz memory i = itirazOf[id];
        delete itirazOf[id];
        Tasarim storage t = tasarimOf[id];
        uint256 st = t.teminat;
        t.teminat = 0;
        borcOf[address(usdc)] -= i.teminat + st;
        _burn(id);
        if (i.teminat > 0) usdc.safeTransfer(i.itirazci, i.teminat);
        if (st > 0) usdc.safeTransfer(teminatAlici, st);
    }

    /* ======================================================================
     * ADMIN
     * ====================================================================== */

    function ucretAyarla(uint256 u1, uint256 u2) external sadeceYonetici {
        ucret1 = u1;
        ucret2 = u2;
        emit AyarDegisti("ucret1", u1);
        emit AyarDegisti("ucret2", u2);
    }

    function alicilariAyarla(address a1, address a2) external sadeceYonetici {
        if (a1 == address(0) || a2 == address(0)) revert SifirAdres();
        alici1 = a1;
        alici2 = a2;
        emit AdresDegisti("alici1", a1);
        emit AdresDegisti("alici2", a2);
    }

    function fiyatKaynagiAyarla(IFiyatKaynagi k, uint32 saniye, uint256 birim) external sadeceYonetici {
        if (address(k) == address(0)) revert SifirAdres();
        if (saniye == 0 || birim == 0 || birim > 1e40) revert KotuDeger();
        fiyatKaynagi = k;
        twapSaniye = saniye;
        fiyatBirimi = birim;
        emit AdresDegisti("fiyatKaynagi", address(k));
        emit AyarDegisti("twapSaniye", saniye);
        emit AyarDegisti("fiyatBirimi", birim);
    }

    /// Copy-challenge window and bond, key-delivery deadline, key-dispute window.
    function sureAyarla(uint64 itirazS, uint256 itirazT, uint64 teslimS, uint64 anahtarItirazS) external sadeceYonetici {
        if (teslimS == 0 || anahtarItirazS == 0) revert KotuDeger();
        itirazSuresi = itirazS;
        itirazTeminati = itirazT;
        teslimSuresi = teslimS;
        anahtarItirazSuresi = anahtarItirazS;
        emit AyarDegisti("itirazSuresi", itirazS);
        emit AyarDegisti("itirazTeminati", itirazT);
        emit AyarDegisti("teslimSuresi", teslimS);
        emit AyarDegisti("anahtarItirazSuresi", anahtarItirazS);
    }

    function tasarimciTeminatiAyarla(uint256 m) external sadeceYonetici {
        tasarimciTeminati = m;
        emit AyarDegisti("tasarimciTeminati", m);
    }

    function telifAyarla(uint16 bps) external sadeceYonetici {
        if (bps > TELIF_AZAMI_BPS) revert KotuDeger();
        telifBps = bps;
        emit AyarDegisti("telifBps", bps);
    }

    function routerAyarla(ITakasRouter r, uint16 toleransBps) external sadeceYonetici {
        if (address(r) == address(0)) revert SifirAdres();
        if (toleransBps > TOLERANS_AZAMI_BPS) revert KotuDeger();
        router = r;
        alUsdcToleransBps = toleransBps;
        emit AdresDegisti("router", address(r));
        emit AyarDegisti("alUsdcToleransBps", toleransBps);
    }

    function kancaAyarla(address kanca, bool izinli, uint24 fee, int24 tickSpacing) external sadeceYonetici {
        if (kanca == address(0)) revert SifirAdres();
        kancaAyar[kanca] = KancaAyar(izinli, fee, tickSpacing);
        emit KancaDegisti(kanca, izinli, fee, tickSpacing);
    }

    function turKaydiAyarla(ITurKaydi t) external sadeceYonetici {
        if (address(t) == address(0)) revert SifirAdres();
        turKaydi = t;
        emit AdresDegisti("turKaydi", address(t));
    }

    function elleBagla(address tasarimci, address token) external sadeceYonetici {
        if (tasarimci == address(0)) revert SifirAdres();
        elleBagliToken[tasarimci] = token;
        emit ElleBaglandi(tasarimci, token);
    }

    function parmakIziSerbest(bytes32 dosyaHash, bytes32 algiHash) external sadeceYonetici {
        if (dosyaHash != bytes32(0)) delete dosyaKaydi[dosyaHash];
        if (algiHash != bytes32(0)) delete algiKaydi[algiHash];
        emit ParmakIziSerbest(dosyaHash, algiHash);
    }

    /// Pause, wait-for-the-copy-window switch, commit-reveal window (blocks).
    function isleyisAyarla(bool durdur, bool kopyaBekle, uint64 taahhutB) external sadeceYonetici {
        if (taahhutB == 0) revert KotuDeger();
        durduruldu = durdur;
        kopyaPenceresiBekle = kopyaBekle;
        taahhutBlok = taahhutB;
        emit AyarDegisti("durduruldu", durdur ? 1 : 0);
        emit AyarDegisti("kopyaPenceresiBekle", kopyaBekle ? 1 : 0);
        emit AyarDegisti("taahhutBlok", taahhutB);
    }

    /// Tokens sent here by mistake; never escrow, stakes or bonds (borcOf).
    function sweep(IERC20 token, address to, uint256 miktar) external nonReentrant sadeceYonetici {
        if (to == address(0) || address(token) == address(0)) revert SifirAdres();
        uint256 bakiye = token.balanceOf(address(this));
        uint256 borc = borcOf[address(token)];
        uint256 serbest = bakiye > borc ? bakiye - borc : 0;
        if (miktar == 0 || miktar > serbest) revert FazlaYok(serbest);
        token.safeTransfer(to, miktar);
        emit Supuruldu(address(token), to, miktar);
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
