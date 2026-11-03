// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/* ===========================================================================
 * SiparisKaydi — ARC PULSE Designs: commissions ("hire a designer") on Arc
 *
 * A client posts a job: a brief (text or a link, in the event only), a budget
 * in USDC held here in escrow, and a delivery deadline. The job is open to
 * anyone or addressed to one designer.
 *
 * FLOW
 *   1. isAc: the client escrows the budget. Open job: designers apply
 *      (basvur, a short note in the event) and the client picks one (sec).
 *      Addressed job: only that designer may take it (kabulEt).
 *   2. teslimEt: the chosen designer delivers before the deadline: a file
 *      link and/or hash, and optionally a design NFT of theirs on
 *      TasarimNFT2 (the designer publishes it there first, the usual way,
 *      then approves this contract; it waits here in escrow) plus the file
 *      key encrypted to the client's registered key (the "envelope", as on
 *      TasarimNFT2; anahtarGonder posts one later). TasarimNFT2 mints only to
 *      the publishing designer, so this contract cannot mint for the client:
 *      the delivered NFT is a normal Designs NFT carrying the Designs
 *      license, moved to the client on payment.
 *   3. onayla: the client approves; the designer is paid the budget minus
 *      the platform fee and the NFT goes to the client. Or the client asks
 *      for changes (revizyonIste, at most revizyonHakki times; any NFT goes
 *      back to the designer). If the client stays silent for the review
 *      window, anyone may release the payment (talepEt).
 *   Refunds: the client cancels an open job before picking anyone (iptalEt);
 *   a picked designer may step back (birak, the job reopens); no delivery by
 *   the deadline refunds the client (iadeAl).
 *   Disputes: either side opens one while the job is in progress or under
 *   review (itirazEt). The arbiter (hakem: the bot wallet now, the DAO
 *   later) splits the escrow (itirazCoz: the designer's share in basis
 *   points, the fee only on that share; the NFT to the client or back).
 *
 * FEES
 *   Only on what the designer is paid: ucretBps (default 2.5%, hard cap 10%),
 *   snapshotted per job when it is posted, so a later change never touches
 *   an open job. The fee is split by the platform rule: ARCP buy-and-burn
 *   (kept here, swapped for ARCP and sent to 0x…dEaD by yakimYap), dev fund,
 *   marketing wallet and the owner's share (default 25% each; the owner's
 *   share takes the rounding). Rates, wallets, windows and the arbiter are
 *   admin-settable within the caps. Posting, applying and delivering cost
 *   only gas.
 *
 * WHAT THE ADMIN CANNOT DO
 *   Move any escrow except by resolving a dispute (the arbiter) or burning
 *   the burn share; sweep can only take USDC above what the open jobs and
 *   the burn share hold. Pausing stops new jobs and applications only;
 *   every path that pays or refunds stays open. Two-step handover.
 *
 * Nothing about anyone is stored off chain; identity is the wallet.
 * =========================================================================== */

interface ITasarimNFT {
    function tasarimOf(uint256 id) external view returns (
        address token, address tasarimci, uint64 itirazBitis, uint64 yayinBlok,
        bytes32 dosyaHash, bytes32 algiHash, bytes32 anahtarTaahhut, uint256 teminat);
    function transferFrom(address from, address to, uint256 id) external;
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

contract SiparisKaydi is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ---- job states ---- */
    uint8 public constant ACIK = 1;      // open: applications / waiting for the addressed designer
    uint8 public constant ATANDI = 2;    // a designer is working
    uint8 public constant TESLIM = 3;    // delivered, under review
    uint8 public constant ITIRAZ = 4;    // disputed, waiting for the arbiter
    uint8 public constant ODENDI = 5;    // paid to the designer
    uint8 public constant IPTAL = 6;     // refunded to the client
    uint8 public constant BOLUNDU = 7;   // split by the arbiter

    /* ---- hard caps ---- */
    uint16 public constant UCRET_AZAMI_BPS = 1000;          // fee at most 10%
    uint64 public constant INCELEME_EN_AZ = 1 hours;
    uint64 public constant INCELEME_AZAMI = 30 days;
    uint64 public constant SURE_EN_AZ = 1 hours;            // deadline at least this far ahead
    uint64 public constant SURE_AZAMI = 365 days;
    uint256 public constant ASGARI_BUTCE_AZAMI = 1_000e6;   // the minimum budget can be set up to $1,000
    uint8 public constant REVIZYON_AZAMI = 10;
    uint256 public constant BRIEF_AZAMI = 2000;
    uint256 public constant NOT_AZAMI = 500;
    uint256 public constant URI_AZAMI = 512;
    uint256 public constant ZARF_AZAMI = 200;
    address public constant YAKIM_ADRESI = 0x000000000000000000000000000000000000dEaD;

    IERC20 public immutable usdc;
    ITasarimNFT public immutable nft;

    /* ---- admin settings ---- */
    address public yonetici;
    address public bekleyenYonetici;
    address public hakem;
    address public gelistirici;
    address public pazarlama;
    address public sahip;
    uint16 public ucretBps = 250;
    uint16 public yakimPay = 2500;
    uint16 public gelistiriciPay = 2500;
    uint16 public pazarlamaPay = 2500;
    uint16 public sahipPay = 2500;
    uint64 public incelemeSuresi = 3 days;
    uint8 public revizyonHakki = 3;
    bool public durduruldu;
    uint256 public asgariButce = 1e6;

    /* ARCP buy-and-burn: the USDC/ARCP pool on Arc */
    ITakasRouter public router;
    address public arcp;
    address public arcpKanca;
    uint24 public arcpFee;
    int24 public arcpSpacing;

    /* ---- accounting ---- */
    uint256 public emanetToplam;   // budgets of jobs still open, in progress, under review or disputed
    uint256 public yakimBakiye;    // the burn share waiting for yakimYap

    struct Is {
        address musteri;
        uint64 son;               // delivery deadline
        uint8 durum;
        uint8 revizyon;           // changes asked so far
        uint8 revizyonHakki;      // snapshot
        uint16 ucretBps;          // snapshot
        address hedef;            // addressed designer (0 = open to anyone)
        uint64 incelemeSuresi;    // snapshot
        address tasarimci;        // picked designer
        uint64 teslimZamani;
        uint32 basvuruSayisi;
        uint256 butce;
        uint256 nftId;            // TasarimNFT2 design held here (0 = none)
        bytes32 teslimHash;
    }

    uint256 public sonIs;
    mapping(uint256 => Is) public isOf;
    mapping(uint256 => mapping(address => bool)) public basvurdu;

    /* ---- events ---- */
    event IsAcildi(uint256 indexed id, address indexed musteri, address indexed hedef, uint256 butce, uint64 son, uint16 ucretBps, uint64 incelemeSuresi, string brief);
    event Basvuru(uint256 indexed id, address indexed tasarimci, string not_);
    event Atandi(uint256 indexed id, address indexed tasarimci);
    event Birakti(uint256 indexed id, address indexed tasarimci);
    event SureUzatildi(uint256 indexed id, uint64 son);
    event Teslim(uint256 indexed id, address indexed tasarimci, uint256 indexed nftId, string uri, bytes32 dosyaHash, bytes zarf, uint8 revizyon);
    event AnahtarGonderildi(uint256 indexed id, address indexed musteri, bytes zarf);
    event RevizyonIstendi(uint256 indexed id, uint8 revizyon, uint64 son, string not_);
    event ItirazAcildi(uint256 indexed id, address indexed kim, string not_);
    event Odendi(uint256 indexed id, address indexed tasarimci, uint256 tasarimciya, uint256 ucret, bool otomatik);
    event Iptal(uint256 indexed id, address indexed musteri, uint256 iade, uint8 sebep);   // 1 cancelled while open, 2 no delivery by the deadline
    event ItirazCozuldu(uint256 indexed id, uint16 tasarimciBps, uint256 tasarimciya, uint256 musteriye, uint256 ucret, bool nftMusteriye);
    event UcretDagitildi(uint256 indexed id, uint256 yakim, uint256 gelistirici, uint256 pazarlama, uint256 sahip);
    event NftDevredildi(uint256 indexed id, uint256 indexed nftId, address kime, bool basarili);
    event Yakildi(uint256 usdc, uint256 arcp);
    event Supuruldu(address indexed token, address to, uint256 miktar);
    event AyarDegisti(bytes32 indexed ad, uint256 deger);
    event AdresDegisti(bytes32 indexed ad, address deger);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);

    /* ---- errors ---- */
    error YetkiYok();
    error SifirAdres();
    error KotuDeger();
    error KotuDurum(uint8 durum);
    error Durduruldu();
    error ButceAz(uint256 asgari);
    error CokUzun();
    error SureBitti();
    error SureBitmedi();
    error BasvuruYok();
    error ZatenBasvurdu();
    error HedefliIs();
    error TasarimciDegil();
    error RevizyonHakkiBitti();
    error AzCikti(uint256 cikan, uint256 asgari);

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert YetkiYok();
        _;
    }

    constructor(
        IERC20 usdc_,
        ITasarimNFT nft_,
        address yonetici_,
        address hakem_,
        address gelistirici_,
        address pazarlama_,
        address sahip_,
        ITakasRouter router_,
        address arcp_,
        address arcpKanca_,
        uint24 arcpFee_,
        int24 arcpSpacing_
    ) {
        if (address(usdc_) == address(0) || address(nft_) == address(0) || yonetici_ == address(0) || hakem_ == address(0)
            || gelistirici_ == address(0) || pazarlama_ == address(0) || sahip_ == address(0)
            || address(router_) == address(0) || arcp_ == address(0)) revert SifirAdres();
        usdc = usdc_;
        nft = nft_;
        yonetici = yonetici_;
        hakem = hakem_;
        gelistirici = gelistirici_;
        pazarlama = pazarlama_;
        sahip = sahip_;
        router = router_;
        arcp = arcp_;
        arcpKanca = arcpKanca_;
        arcpFee = arcpFee_;
        arcpSpacing = arcpSpacing_;
        emit YoneticiDegisti(address(0), yonetici_);
    }

    /* ======================================================================
     * CLIENT: POST, PICK, EXTEND, CANCEL
     * ====================================================================== */

    /// Post a job and escrow `butce` USDC (approve this contract first).
    /// `hedef` = one designer it is addressed to, or 0 for anyone.
    function isAc(string calldata brief, uint256 butce, uint64 son, address hedef)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (durduruldu) revert Durduruldu();
        uint256 n = bytes(brief).length;
        if (n == 0 || n > BRIEF_AZAMI) revert CokUzun();
        if (butce == 0 || butce < asgariButce) revert ButceAz(asgariButce);
        if (son < block.timestamp + SURE_EN_AZ || son > block.timestamp + SURE_AZAMI) revert KotuDeger();
        if (hedef == msg.sender) revert KotuDeger();

        id = ++sonIs;
        Is storage j = isOf[id];
        j.musteri = msg.sender;
        j.son = son;
        j.durum = ACIK;
        j.revizyonHakki = revizyonHakki;
        j.ucretBps = ucretBps;
        j.hedef = hedef;
        j.incelemeSuresi = incelemeSuresi;
        j.butce = butce;
        emanetToplam += butce;
        usdc.safeTransferFrom(msg.sender, address(this), butce);
        emit IsAcildi(id, msg.sender, hedef, butce, son, j.ucretBps, j.incelemeSuresi, brief);
    }

    /// Pick one of the designers who applied to an open job.
    function sec(uint256 id, address tasarimci) external {
        Is storage j = isOf[id];
        if (msg.sender != j.musteri) revert YetkiYok();
        if (j.durum != ACIK) revert KotuDurum(j.durum);
        if (block.timestamp > j.son) revert SureBitti();
        if (!basvurdu[id][tasarimci]) revert BasvuruYok();
        j.durum = ATANDI;
        j.tasarimci = tasarimci;
        emit Atandi(id, tasarimci);
    }

    /// Move the deadline later (open or in progress).
    function sureUzat(uint256 id, uint64 yeniSon) external {
        Is storage j = isOf[id];
        if (msg.sender != j.musteri) revert YetkiYok();
        if (j.durum != ACIK && j.durum != ATANDI) revert KotuDurum(j.durum);
        if (yeniSon <= j.son || yeniSon > block.timestamp + SURE_AZAMI) revert KotuDeger();
        j.son = yeniSon;
        emit SureUzatildi(id, yeniSon);
    }

    /// Cancel before anyone was picked: the whole budget comes back.
    function iptalEt(uint256 id) external nonReentrant {
        Is storage j = isOf[id];
        if (msg.sender != j.musteri) revert YetkiYok();
        if (j.durum != ACIK) revert KotuDurum(j.durum);
        _iade(id, 1);
    }

    /// No delivery by the deadline: the whole budget comes back.
    function iadeAl(uint256 id) external nonReentrant {
        Is storage j = isOf[id];
        if (msg.sender != j.musteri) revert YetkiYok();
        if (j.durum != ATANDI) revert KotuDurum(j.durum);
        if (block.timestamp <= j.son) revert SureBitmedi();
        _iade(id, 2);
    }

    /* ======================================================================
     * DESIGNER: APPLY, TAKE, STEP BACK, DELIVER
     * ====================================================================== */

    /// Apply to an open job with a short note (portfolio link, price, time).
    function basvur(uint256 id, string calldata not_) external {
        if (durduruldu) revert Durduruldu();
        Is storage j = isOf[id];
        if (j.durum != ACIK) revert KotuDurum(j.durum);
        if (j.hedef != address(0)) revert HedefliIs();
        if (msg.sender == j.musteri) revert KotuDeger();
        if (block.timestamp > j.son) revert SureBitti();
        if (bytes(not_).length > NOT_AZAMI) revert CokUzun();
        if (basvurdu[id][msg.sender]) revert ZatenBasvurdu();
        basvurdu[id][msg.sender] = true;
        unchecked { ++j.basvuruSayisi; }
        emit Basvuru(id, msg.sender, not_);
    }

    /// The addressed designer takes the job.
    function kabulEt(uint256 id) external {
        Is storage j = isOf[id];
        if (j.durum != ACIK) revert KotuDurum(j.durum);
        if (j.hedef == address(0) || msg.sender != j.hedef) revert YetkiYok();
        if (block.timestamp > j.son) revert SureBitti();
        j.durum = ATANDI;
        j.tasarimci = msg.sender;
        emit Atandi(id, msg.sender);
    }

    /// The picked designer steps back before delivering: the job reopens.
    function birak(uint256 id) external {
        Is storage j = isOf[id];
        if (j.durum != ATANDI) revert KotuDurum(j.durum);
        if (msg.sender != j.tasarimci) revert YetkiYok();
        j.durum = ACIK;
        j.tasarimci = address(0);
        basvurdu[id][msg.sender] = false;
        emit Birakti(id, msg.sender);
    }

    /// Deliver before the deadline: a file link and/or hash, optionally a
    /// TasarimNFT2 design of the caller's (approved to this contract first)
    /// and the file key encrypted to the client's registered key.
    function teslimEt(uint256 id, string calldata uri, bytes32 dosyaHash, uint256 nftId, bytes calldata zarf)
        external
        nonReentrant
    {
        Is storage j = isOf[id];
        if (msg.sender != j.tasarimci) revert YetkiYok();
        if (j.durum != ATANDI) revert KotuDurum(j.durum);
        if (block.timestamp > j.son) revert SureBitti();
        uint256 n = bytes(uri).length;
        if (n > URI_AZAMI || zarf.length > ZARF_AZAMI) revert CokUzun();
        if (n == 0 && dosyaHash == bytes32(0) && nftId == 0) revert KotuDeger();
        if (nftId != 0) {
            (, address t,,,,,,) = nft.tasarimOf(nftId);
            if (t != msg.sender) revert TasarimciDegil();
            nft.transferFrom(msg.sender, address(this), nftId);
        }
        j.durum = TESLIM;
        j.teslimZamani = uint64(block.timestamp);
        j.nftId = nftId;
        j.teslimHash = dosyaHash;
        emit Teslim(id, msg.sender, nftId, uri, dosyaHash, zarf, j.revizyon);
    }

    /// Post (or re-post) the file key encrypted to the client's key, any time after a delivery.
    function anahtarGonder(uint256 id, bytes calldata zarf) external {
        Is storage j = isOf[id];
        if (msg.sender != j.tasarimci) revert YetkiYok();
        uint8 d = j.durum;
        if (d != TESLIM && d != ITIRAZ && d != ODENDI && d != BOLUNDU) revert KotuDurum(d);
        if (zarf.length == 0 || zarf.length > ZARF_AZAMI) revert CokUzun();
        emit AnahtarGonderildi(id, j.musteri, zarf);
    }

    /* ======================================================================
     * REVIEW: APPROVE, ASK FOR CHANGES, RELEASE AFTER THE WINDOW
     * ====================================================================== */

    function onayla(uint256 id) external nonReentrant {
        Is storage j = isOf[id];
        if (msg.sender != j.musteri) revert YetkiYok();
        if (j.durum != TESLIM) revert KotuDurum(j.durum);
        _tamOde(id, false);
    }

    /// Anyone, once the review window has passed without an answer.
    function talepEt(uint256 id) external nonReentrant {
        Is storage j = isOf[id];
        if (j.durum != TESLIM) revert KotuDurum(j.durum);
        if (block.timestamp <= uint256(j.teslimZamani) + j.incelemeSuresi) revert SureBitmedi();
        _tamOde(id, true);
    }

    /// Ask for changes within the review window; any delivered NFT goes back
    /// to the designer and the deadline is at least one review window away.
    function revizyonIste(uint256 id, string calldata not_) external nonReentrant {
        Is storage j = isOf[id];
        if (msg.sender != j.musteri) revert YetkiYok();
        if (j.durum != TESLIM) revert KotuDurum(j.durum);
        if (block.timestamp > uint256(j.teslimZamani) + j.incelemeSuresi) revert SureBitti();
        if (j.revizyon >= j.revizyonHakki) revert RevizyonHakkiBitti();
        if (bytes(not_).length > NOT_AZAMI) revert CokUzun();
        unchecked { ++j.revizyon; }
        uint64 enAz = uint64(block.timestamp) + j.incelemeSuresi;
        if (j.son < enAz) j.son = enAz;
        j.durum = ATANDI;
        uint256 nId = j.nftId;
        j.nftId = 0;
        j.teslimHash = bytes32(0);
        j.teslimZamani = 0;
        emit RevizyonIstendi(id, j.revizyon, j.son, not_);
        if (nId != 0) _nftGonder(id, nId, j.tasarimci);
    }

    /* ======================================================================
     * DISPUTES
     * ====================================================================== */

    /// Client or designer: while the work is in progress (before the
    /// deadline) or within the review window.
    function itirazEt(uint256 id, string calldata not_) external {
        Is storage j = isOf[id];
        if (msg.sender != j.musteri && msg.sender != j.tasarimci) revert YetkiYok();
        if (bytes(not_).length > NOT_AZAMI) revert CokUzun();
        if (j.durum == ATANDI) {
            if (block.timestamp > j.son) revert SureBitti();
        } else if (j.durum == TESLIM) {
            if (block.timestamp > uint256(j.teslimZamani) + j.incelemeSuresi) revert SureBitti();
        } else {
            revert KotuDurum(j.durum);
        }
        j.durum = ITIRAZ;
        emit ItirazAcildi(id, msg.sender, not_);
    }

    /// The arbiter splits the escrow: `tasarimciBps` of the budget to the
    /// designer (the fee only on that part), the rest back to the client; any
    /// delivered NFT to the client (`nftMusteriye`) or back to the designer.
    function itirazCoz(uint256 id, uint16 tasarimciBps, bool nftMusteriye) external nonReentrant {
        if (msg.sender != hakem) revert YetkiYok();
        Is storage j = isOf[id];
        if (j.durum != ITIRAZ) revert KotuDurum(j.durum);
        if (tasarimciBps > 10_000) revert KotuDeger();
        j.durum = BOLUNDU;
        uint256 butce = j.butce;
        uint256 pay = butce * tasarimciBps / 10_000;
        uint256 ucret = pay * j.ucretBps / 10_000;
        emanetToplam -= butce;
        if (pay - ucret > 0) usdc.safeTransfer(j.tasarimci, pay - ucret);
        if (butce - pay > 0) usdc.safeTransfer(j.musteri, butce - pay);
        _ucretDagit(id, ucret);
        emit ItirazCozuldu(id, tasarimciBps, pay - ucret, butce - pay, ucret, nftMusteriye);
        uint256 nId = j.nftId;
        if (nId != 0) _nftGonder(id, nId, nftMusteriye ? j.musteri : j.tasarimci);
    }

    /* ======================================================================
     * MONEY
     * ====================================================================== */

    function _tamOde(uint256 id, bool otomatik) private {
        Is storage j = isOf[id];
        j.durum = ODENDI;
        uint256 butce = j.butce;
        uint256 ucret = butce * j.ucretBps / 10_000;
        emanetToplam -= butce;
        usdc.safeTransfer(j.tasarimci, butce - ucret);
        _ucretDagit(id, ucret);
        emit Odendi(id, j.tasarimci, butce - ucret, ucret, otomatik);
        uint256 nId = j.nftId;
        if (nId != 0) _nftGonder(id, nId, j.musteri);
    }

    function _iade(uint256 id, uint8 sebep) private {
        Is storage j = isOf[id];
        j.durum = IPTAL;
        uint256 butce = j.butce;
        emanetToplam -= butce;
        usdc.safeTransfer(j.musteri, butce);
        emit Iptal(id, j.musteri, butce, sebep);
    }

    /// The platform rule: burn share kept for yakimYap, the rest paid out now.
    function _ucretDagit(uint256 id, uint256 ucret) private {
        if (ucret == 0) return;
        uint256 y = ucret * yakimPay / 10_000;
        uint256 g = ucret * gelistiriciPay / 10_000;
        uint256 p = ucret * pazarlamaPay / 10_000;
        uint256 s = ucret - y - g - p;
        yakimBakiye += y;
        if (g > 0) usdc.safeTransfer(gelistirici, g);
        if (p > 0) usdc.safeTransfer(pazarlama, p);
        if (s > 0) usdc.safeTransfer(sahip, s);
        emit UcretDagitildi(id, y, g, p, s);
    }

    /// A burned or taken-down design cannot move: the job still settles.
    function _nftGonder(uint256 id, uint256 nId, address kime) private {
        bool ok;
        try nft.transferFrom(address(this), kime, nId) { ok = true; } catch { ok = false; }
        emit NftDevredildi(id, nId, kime, ok);
    }

    /// Admin (later the DAO): swap `miktar` of the burn share (0 = all) for
    /// ARCP in the USDC/ARCP pool and send it to 0x…dEaD.
    function yakimYap(uint256 miktar, uint256 minArcp) external nonReentrant sadeceYonetici returns (uint256 cikan) {
        uint256 m = miktar == 0 ? yakimBakiye : miktar;
        if (m == 0 || m > yakimBakiye) revert KotuDeger();
        yakimBakiye -= m;
        address a = arcp;
        bool usdcSifirinci = address(usdc) < a;
        HavuzAnahtari memory key = HavuzAnahtari({
            currency0: usdcSifirinci ? address(usdc) : a,
            currency1: usdcSifirinci ? a : address(usdc),
            fee: arcpFee,
            tickSpacing: arcpSpacing,
            hooks: arcpKanca
        });
        uint256 once = IERC20(a).balanceOf(address(this));
        usdc.forceApprove(address(router), m);
        router.swap(key, usdcSifirinci, m, minArcp);
        usdc.forceApprove(address(router), 0);
        cikan = IERC20(a).balanceOf(address(this)) - once;
        if (cikan < minArcp || cikan == 0) revert AzCikti(cikan, minArcp);
        IERC20(a).safeTransfer(YAKIM_ADRESI, cikan);
        emit Yakildi(m, cikan);
    }

    /* ======================================================================
     * VIEWS
     * ====================================================================== */

    function isler(uint256[] calldata idler) external view returns (Is[] memory out) {
        out = new Is[](idler.length);
        for (uint256 i; i < idler.length; ++i) out[i] = isOf[idler[i]];
    }

    /// When the review window of a delivered job ends (0 when not under review).
    function incelemeSonu(uint256 id) external view returns (uint256) {
        Is storage j = isOf[id];
        return j.durum == TESLIM ? uint256(j.teslimZamani) + j.incelemeSuresi : 0;
    }

    /// The designer's net and the fee for a budget at today's rate.
    function ucretHesapla(uint256 butce) external view returns (uint256 tasarimciya, uint256 ucret) {
        ucret = butce * ucretBps / 10_000;
        tasarimciya = butce - ucret;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /* ======================================================================
     * ADMIN (caps are constants)
     * ====================================================================== */

    function ucretAyarla(uint16 bps) external sadeceYonetici {
        if (bps > UCRET_AZAMI_BPS) revert KotuDeger();
        ucretBps = bps;
        emit AyarDegisti("ucretBps", bps);
    }

    function paylariAyarla(uint16 yakim, uint16 gelistirici_, uint16 pazarlama_, uint16 sahip_) external sadeceYonetici {
        if (uint256(yakim) + gelistirici_ + pazarlama_ + sahip_ != 10_000) revert KotuDeger();
        yakimPay = yakim;
        gelistiriciPay = gelistirici_;
        pazarlamaPay = pazarlama_;
        sahipPay = sahip_;
        emit AyarDegisti("yakimPay", yakim);
        emit AyarDegisti("gelistiriciPay", gelistirici_);
        emit AyarDegisti("pazarlamaPay", pazarlama_);
        emit AyarDegisti("sahipPay", sahip_);
    }

    function cuzdanlariAyarla(address gelistirici_, address pazarlama_, address sahip_) external sadeceYonetici {
        if (gelistirici_ == address(0) || pazarlama_ == address(0) || sahip_ == address(0)) revert SifirAdres();
        gelistirici = gelistirici_;
        pazarlama = pazarlama_;
        sahip = sahip_;
        emit AdresDegisti("gelistirici", gelistirici_);
        emit AdresDegisti("pazarlama", pazarlama_);
        emit AdresDegisti("sahip", sahip_);
    }

    function hakemAyarla(address h) external sadeceYonetici {
        if (h == address(0)) revert SifirAdres();
        hakem = h;
        emit AdresDegisti("hakem", h);
    }

    function sureAyarla(uint64 inceleme) external sadeceYonetici {
        if (inceleme < INCELEME_EN_AZ || inceleme > INCELEME_AZAMI) revert KotuDeger();
        incelemeSuresi = inceleme;
        emit AyarDegisti("incelemeSuresi", inceleme);
    }

    function asgariButceAyarla(uint256 m) external sadeceYonetici {
        if (m > ASGARI_BUTCE_AZAMI) revert KotuDeger();
        asgariButce = m;
        emit AyarDegisti("asgariButce", m);
    }

    function revizyonAyarla(uint8 n) external sadeceYonetici {
        if (n > REVIZYON_AZAMI) revert KotuDeger();
        revizyonHakki = n;
        emit AyarDegisti("revizyonHakki", n);
    }

    function yakimHavuzuAyarla(ITakasRouter r, address arcp_, address kanca, uint24 fee, int24 spacing) external sadeceYonetici {
        if (address(r) == address(0) || arcp_ == address(0)) revert SifirAdres();
        router = r;
        arcp = arcp_;
        arcpKanca = kanca;
        arcpFee = fee;
        arcpSpacing = spacing;
        emit AdresDegisti("router", address(r));
        emit AdresDegisti("arcp", arcp_);
        emit AdresDegisti("arcpKanca", kanca);
    }

    function durdur(bool d) external sadeceYonetici {
        durduruldu = d;
        emit AyarDegisti("durduruldu", d ? 1 : 0);
    }

    /// Only what nobody is owed: USDC above the escrow and the burn share; any other token.
    function sweep(IERC20 token, address to, uint256 miktar) external nonReentrant sadeceYonetici {
        if (to == address(0)) revert SifirAdres();
        if (address(token) == address(usdc)) {
            uint256 serbest = usdc.balanceOf(address(this)) - emanetToplam - yakimBakiye;
            if (miktar > serbest) revert KotuDeger();
        }
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
