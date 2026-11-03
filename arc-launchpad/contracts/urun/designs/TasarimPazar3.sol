// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/* ===========================================================================
 * TasarimPazar3 — "Designs" market v3: offers, timed auctions, USDC resale,
 *                 designer royalty and co-designer splits (ARC PULSE, Arc)
 *
 * Sits NEXT TO TasarimNFT2 (0xFbE8…FEaa) and changes nothing in it. The NFT
 * contract keeps publishing, fingerprints, copy challenges, the key registry
 * and its own fixed-price sale in the designer token. This contract adds a
 * USDC market on top, using only ERC-721 approval: a holder approves this
 * contract (approve / setApprovalForAll on TasarimNFT2) and it moves the NFT
 * with transferFrom. The license travels with the NFT (TasarimNFT2.LISANS):
 * whoever ends up holding it holds every right; nothing here touches that.
 *
 * WHAT IT DOES
 *   1. Offers: a buyer escrows USDC for a design (teklifVer) with an expiry;
 *      the holder accepts (teklifKabul); the buyer withdraws any time before
 *      that, and anyone returns an expired offer to its buyer.
 *   2. Timed auctions: the holder puts the NFT in custody here with a reserve
 *      price, a minimum bid step and a duration (muzayedeBaslat). A bid in the
 *      last uzatmaPenceresi pushes the end to now + uzatmaSuresi (anti-snipe).
 *      An outbid bidder's USDC is credited to alacakOf and withdrawn with cek
 *      (pull). Anyone settles after the end (muzayedeKapat); no bid returns
 *      the NFT.
 *   3. Resale at a fixed USDC price (ilanVer / satinAl). The holder keeps the
 *      NFT until a buyer pays.
 *   4. Splits: the designer of a design (TasarimNFT2.tasarimOf) records up to
 *      5 payees with basis points (bolusAyarla), optionally locked for good.
 *      A primary sale (seller = designer) pays the seller's share to them; a
 *      resale pays the royalty to them. Rounding dust goes to the first payee.
 *
 * FILE KEY: SAME RULE AS TASARIMNFT2
 *   Design files are encrypted. Every sale here goes to escrow: the NFT sits
 *   in this contract and the payment is held until the seller posts the file
 *   key encrypted to the buyer's key registered in TasarimNFT2 (teslimEt,
 *   within teslimSuresi, or anyone refunds the buyer and the NFT goes back).
 *   The buyer confirms (teslimAldim) or lets anahtarItirazSuresi pass (anyone
 *   releases: serbestBirak), or disputes (anahtarItiraz) for the admin (later
 *   the DAO). Nothing is released while TasarimNFT2 has a copy challenge
 *   open on the design or, when its kopyaPenceresiBekle is on, before the
 *   design's challenge window ends. A design burned by TasarimNFT2 (upheld
 *   copy, takedown) while held here refunds its buyer (yanmisIade).
 *
 * MONEY (all USDC, 6 decimals)
 *   On every sale the platform fee is taken from the price and split four
 *   ways (each in basis points of the price, all four together capped at
 *   UCRET_AZAMI_BPS = 10%):
 *     yakimBps       ARCP buy-and-burn: kept here as yakimBirikimi; yakimYap
 *                    swaps it into ARCP on its Uniswap v4 pool and sends the
 *                    ARCP to 0x…dEaD (admin call, with a minimum out)
 *     gelistirmeBps  developer fund (the ARCP DAO's DevPool)
 *     pazarlamaBps   marketing wallet
 *     sahipBps       the owner's share
 *   plus, on a resale, telifBps to the designer's payees (default 5%, capped
 *   at TELIF_AZAMI_BPS = 10%). Rates are fixed per sale when it starts. Every
 *   payout is credited to alacakOf and withdrawn by the payee (cek) or
 *   pushed to it by anyone (cekFor) — a contract wallet such as the DevPool
 *   needs no code to receive it. toplamBorc is everything this contract owes;
 *   sweep can only take USDC above it.
 *
 * ADMIN
 *   Every rate, wallet, window and the burn route is settable within hard
 *   caps (owner's order: keep room to change and fix). The admin cannot take
 *   escrow, bids, offers or balances; it resolves key disputes (the DAO's
 *   job later) and can pause new listings, offers, auctions and bids (never
 *   withdrawals, refunds or settlement). Two-step handover.
 * =========================================================================== */

interface ITasarimNFT2 {
    function ownerOf(uint256 id) external view returns (address);
    function getApproved(uint256 id) external view returns (address);
    function isApprovedForAll(address sahip, address operator) external view returns (bool);
    function transferFrom(address from, address to, uint256 id) external;
    function anahtarOf(address cuzdan) external view returns (bytes memory);
    function kopyaPenceresiBekle() external view returns (bool);
    function itirazOf(uint256 id) external view returns (address itirazci, uint256 teminat, uint256 oncekiId);
    function tasarimOf(uint256 id)
        external
        view
        returns (
            address token,
            address tasarimci,
            uint64 itirazBitis,
            uint64 yayinBlok,
            bytes32 dosyaHash,
            bytes32 algiHash,
            bytes32 anahtarTaahhut,
            uint256 teminat
        );
}

/// Same ABI as Uniswap v4's PoolKey.
struct HavuzAnahtari3 {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/// contracts/SwapRouter.sol on Arc: exact input, pulls from and pays to msg.sender.
interface ITakasRouter3 {
    function swap(HavuzAnahtari3 calldata key, bool zeroForOne, uint256 amountIn, uint256 minOut)
        external
        payable
        returns (uint256);
}

contract TasarimPazar3 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ---- hard caps ---- */
    uint256 public constant UCRET_AZAMI_BPS = 1000;      // platform fee, all four slices together
    uint256 public constant TELIF_AZAMI_BPS = 1000;      // designer royalty on resales
    uint256 public constant ADIM_AZAMI_BPS = 5000;       // minimum bid step a seller may demand
    uint256 public constant BOLUS_AZAMI = 5;             // payees per design
    uint256 public constant ZARF_AZAMI = 200;            // key envelope bytes (TasarimNFT2.ZARF_AZAMI)
    uint64 public constant SURE_ASGARI = 1 hours;        // delivery / dispute windows
    uint64 public constant SURE_AZAMI = 30 days;
    uint64 public constant MUZAYEDE_AZAMI = 90 days;
    uint64 public constant UZATMA_AZAMI = 1 days;
    uint64 public constant TEKLIF_AZAMI = 365 days;
    address public constant OLU = 0x000000000000000000000000000000000000dEaD;

    IERC20 public immutable usdc;
    ITasarimNFT2 public immutable nft;

    /* ---- admin settings ---- */
    address public yonetici;
    address public bekleyenYonetici;
    address public gelistirmeFonu;
    address public pazarlama;
    address public sahip;
    uint16 public yakimBps = 50;
    uint16 public gelistirmeBps = 50;
    uint16 public pazarlamaBps = 50;
    uint16 public sahipBps = 50;
    uint16 public telifBps = 500;
    uint16 public asgariAdimBps = 500;
    uint64 public uzatmaPenceresi = 10 minutes;
    uint64 public uzatmaSuresi = 10 minutes;
    uint64 public muzayedeAsgari = 15 minutes;
    uint64 public muzayedeAzami = 30 days;
    uint64 public teklifAzamiSure = 90 days;
    uint64 public teslimSuresi = 3 days;
    uint64 public anahtarItirazSuresi = 3 days;
    uint256 public asgariFiyat = 100_000;               // $0.10
    bool public durduruldu;

    /* ---- burn route (ARCP buy-and-burn) ---- */
    ITakasRouter3 public router;
    address public arcp;
    address public arcpKanca;
    uint24 public arcpFee;
    int24 public arcpTickSpacing;
    uint256 public yakimBirikimi;

    /* ---- money owed ---- */
    mapping(address => uint256) public alacakOf;
    uint256 public toplamBorc;

    /* ---- splits ---- */
    struct Pay { address alici; uint16 bps; }
    mapping(uint256 => Pay[]) private _bolus;
    mapping(uint256 => bool) public bolusKilitli;

    /* ---- listings, offers, auctions ---- */
    struct Ilan { address satici; uint256 fiyat; }
    struct Teklif { address alici; uint64 bitis; uint256 tasarimId; uint256 miktar; }
    struct Muzayede {
        address satici;
        uint64 bitis;
        uint16 adimBps;
        uint256 rezerv;
        address enYuksek;
        uint256 teklif;
    }
    mapping(uint256 => Ilan) public ilanOf;
    mapping(uint256 => Teklif) public teklifOf;
    uint256 public sonTeklif;
    mapping(uint256 => Muzayede) public muzayedeOf;

    /* ---- escrow until the key is delivered ----
       durum: 0 none, 1 awaiting delivery, 2 delivered, 3 key disputed, 4 confirmed
       tur:   1 resale listing, 2 accepted offer, 3 auction */
    struct Satis {
        address alici;
        uint8 durum;
        uint8 tur;
        address satici;
        uint64 teslimSonu;
        uint64 itirazSonu;
        uint64 itirazPenceresi;
        uint16 yBps;
        uint16 gBps;
        uint16 pBps;
        uint16 sBps;
        uint16 tBps;
        uint256 fiyat;
        bytes32 aliciAnahtarHash;
        bytes32 zarfHash;
    }
    mapping(uint256 => Satis) public satisOf;

    /* ---- events ---- */
    event IlanVerildi(uint256 indexed id, address indexed satici, uint256 fiyat);
    event IlanKalkti(uint256 indexed id);
    event TeklifVerildi(uint256 indexed teklifId, uint256 indexed id, address indexed alici, uint256 miktar, uint64 bitis);
    event TeklifKalkti(uint256 indexed teklifId, uint256 indexed id, address indexed alici, uint256 iade);
    event TeklifKabul(uint256 indexed teklifId, uint256 indexed id, address indexed satici, address alici, uint256 miktar);
    event MuzayedeBasladi(uint256 indexed id, address indexed satici, uint256 rezerv, uint64 bitis, uint16 adimBps);
    event Pey(uint256 indexed id, address indexed alici, uint256 miktar, uint64 bitis);
    event MuzayedeBitti(uint256 indexed id, address indexed kazanan, uint256 miktar);
    event MuzayedeIptal(uint256 indexed id);
    event Emanete(uint256 indexed id, address indexed satici, address indexed alici, uint256 fiyat, uint8 tur, uint64 teslimSonu);
    event TeslimEdildi(uint256 indexed id, address indexed alici, bytes zarf);
    event TeslimAlindi(uint256 indexed id);
    event AnahtarItirazi(uint256 indexed id, address alici);
    event SatisKapandi(uint256 indexed id, bool saticiyaOdendi, address kime, uint256 fiyat);
    event Dagitildi(uint256 indexed id, address indexed satici, uint256 net, uint256 telif, uint256 yakim, uint256 gelistirme, uint256 pazarlama, uint256 sahip);
    event Alacak(address indexed kime, uint256 indexed id, uint256 miktar);
    event Cekildi(address indexed kime, uint256 miktar);
    event BolusAyarlandi(uint256 indexed id, address[] alicilar, uint16[] bpsler);
    event BolusKilitlendi(uint256 indexed id);
    event YakimYapildi(uint256 usdcMiktari, uint256 arcpMiktari);
    event Supuruldu(address indexed token, address to, uint256 miktar);
    event AyarDegisti(bytes32 indexed ad, uint256 deger);
    event AdresDegisti(bytes32 indexed ad, address deger);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);

    /* ---- errors ---- */
    error YetkiYok();
    error SifirAdres();
    error KotuDeger();
    error Durduruldu();
    error OnayYok();
    error AnahtarYok();
    error IlanYok();
    error TeklifYok();
    error MuzayedeYok();
    error SureBitti();
    error SureBitmedi();
    error AzTeklif(uint256 gereken);
    error FiyatDegisti(uint256 fiyat);
    error KotuDurum(uint8 durum);
    error ItirazAcik();
    error Yakildi();
    error Kilitli();
    error FazlaYok(uint256 serbest);
    error AzCikti(uint256 gelen, uint256 asgari);

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
        ITasarimNFT2 nft_,
        address yonetici_,
        address gelistirmeFonu_,
        address pazarlama_,
        address sahip_,
        ITakasRouter3 router_,
        address arcp_,
        address arcpKanca_,
        uint24 arcpFee_,
        int24 arcpTickSpacing_
    ) {
        if (address(usdc_) == address(0) || address(nft_) == address(0) || yonetici_ == address(0)
            || gelistirmeFonu_ == address(0) || pazarlama_ == address(0) || sahip_ == address(0)) revert SifirAdres();
        usdc = usdc_;
        nft = nft_;
        yonetici = yonetici_;
        gelistirmeFonu = gelistirmeFonu_;
        pazarlama = pazarlama_;
        sahip = sahip_;
        router = router_;
        arcp = arcp_;
        arcpKanca = arcpKanca_;
        arcpFee = arcpFee_;
        arcpTickSpacing = arcpTickSpacing_;
    }

    /* ======================================================================
     * SPLITS
     * ====================================================================== */

    function tasarimciOf(uint256 id) public view returns (address t) {
        (, t,,,,,,) = nft.tasarimOf(id);
    }

    /// The designer records (or replaces) the payees of design `id`. Empty
    /// arrays clear it (everything to the designer). Basis points add to 10,000.
    function bolusAyarla(uint256 id, address[] calldata alicilar, uint16[] calldata bpsler) external {
        if (msg.sender != tasarimciOf(id)) revert YetkiYok();
        if (bolusKilitli[id]) revert Kilitli();
        uint256 n = alicilar.length;
        if (n != bpsler.length || n > BOLUS_AZAMI) revert KotuDeger();
        delete _bolus[id];
        uint256 toplam;
        for (uint256 i; i < n; ++i) {
            address a = alicilar[i];
            if (a == address(0) || a == address(this)) revert SifirAdres();
            if (bpsler[i] == 0) revert KotuDeger();
            for (uint256 j; j < i; ++j) if (alicilar[j] == a) revert KotuDeger();
            toplam += bpsler[i];
            _bolus[id].push(Pay(a, bpsler[i]));
        }
        if (n != 0 && toplam != 10_000) revert KotuDeger();
        emit BolusAyarlandi(id, alicilar, bpsler);
    }

    /// Freeze the split for good (co-designers can rely on it).
    function bolusKilitle(uint256 id) external {
        if (msg.sender != tasarimciOf(id)) revert YetkiYok();
        bolusKilitli[id] = true;
        emit BolusKilitlendi(id);
    }

    function bolus(uint256 id) external view returns (address[] memory alicilar, uint16[] memory bpsler) {
        Pay[] storage b = _bolus[id];
        alicilar = new address[](b.length);
        bpsler = new uint16[](b.length);
        for (uint256 i; i < b.length; ++i) { alicilar[i] = b[i].alici; bpsler[i] = b[i].bps; }
    }

    /// Credits `toplam` to the design's payees (the designer when none);
    /// rounding dust goes to the first payee.
    function _dagit(uint256 id, uint256 toplam, address tasarimci) private {
        if (toplam == 0) return;
        Pay[] storage b = _bolus[id];
        uint256 n = b.length;
        if (n == 0) { _alacak(tasarimci, id, toplam); return; }
        uint256 verilen;
        for (uint256 i = 1; i < n; ++i) {
            uint256 pay = toplam * b[i].bps / 10_000;
            verilen += pay;
            _alacak(b[i].alici, id, pay);
        }
        _alacak(b[0].alici, id, toplam - verilen);
    }

    function _alacak(address kime, uint256 id, uint256 m) private {
        if (m == 0) return;
        alacakOf[kime] += m;
        emit Alacak(kime, id, m);
    }

    /* ======================================================================
     * RESALE AT A FIXED PRICE (the NFT stays with the holder until bought)
     * ====================================================================== */

    function ilanVer(uint256 id, uint256 fiyat) external calisiyor {
        if (nft.ownerOf(id) != msg.sender) revert YetkiYok();
        if (fiyat < asgariFiyat) revert KotuDeger();
        if (!_onayli(msg.sender, id)) revert OnayYok();
        ilanOf[id] = Ilan(msg.sender, fiyat);
        emit IlanVerildi(id, msg.sender, fiyat);
    }

    /// The seller, or anyone once the listing is stale (the NFT moved).
    function ilanKaldir(uint256 id) external {
        Ilan memory i = ilanOf[id];
        if (i.fiyat == 0) revert IlanYok();
        if (msg.sender != i.satici && _sahibi(id) == i.satici) revert YetkiYok();
        delete ilanOf[id];
        emit IlanKalkti(id);
    }

    /// Buy at the listed price (at most `azamiFiyat`); the buyer's key must be
    /// registered in TasarimNFT2. USDC approved to this contract.
    function satinAl(uint256 id, uint256 azamiFiyat) external nonReentrant calisiyor {
        Ilan memory i = ilanOf[id];
        if (i.fiyat == 0) revert IlanYok();
        if (i.fiyat > azamiFiyat) revert FiyatDegisti(i.fiyat);
        if (msg.sender == i.satici) revert KotuDeger();
        if (nft.ownerOf(id) != i.satici) revert IlanYok();
        _anahtarIste(msg.sender);
        delete ilanOf[id];
        emit IlanKalkti(id);
        usdc.safeTransferFrom(msg.sender, address(this), i.fiyat);
        toplamBorc += i.fiyat;
        nft.transferFrom(i.satici, address(this), id);
        _emanetBaslat(id, i.satici, msg.sender, i.fiyat, 1);
    }

    /* ======================================================================
     * OFFERS (USDC escrowed by the buyer)
     * ====================================================================== */

    function teklifVer(uint256 id, uint256 miktar, uint64 sure) external nonReentrant calisiyor returns (uint256 tid) {
        address s = nft.ownerOf(id); // reverts for a burned design
        if (s == msg.sender || s == address(this)) revert KotuDeger(); // not while held here
        if (miktar < asgariFiyat) revert KotuDeger();
        if (sure < 1 hours || sure > teklifAzamiSure) revert KotuDeger();
        _anahtarIste(msg.sender);
        tid = ++sonTeklif;
        uint64 bitis = uint64(block.timestamp) + sure;
        teklifOf[tid] = Teklif(msg.sender, bitis, id, miktar);
        usdc.safeTransferFrom(msg.sender, address(this), miktar);
        toplamBorc += miktar;
        emit TeklifVerildi(tid, id, msg.sender, miktar, bitis);
    }

    /// The buyer withdraws (any time before acceptance); anyone returns an
    /// expired offer to its buyer.
    function teklifGeriCek(uint256 tid) external nonReentrant {
        Teklif memory t = teklifOf[tid];
        if (t.miktar == 0) revert TeklifYok();
        if (msg.sender != t.alici && block.timestamp <= t.bitis) revert YetkiYok();
        delete teklifOf[tid];
        toplamBorc -= t.miktar;
        usdc.safeTransfer(t.alici, t.miktar);
        emit TeklifKalkti(tid, t.tasarimId, t.alici, t.miktar);
    }

    /// The holder accepts an unexpired offer (NFT approved to this contract).
    function teklifKabul(uint256 tid, uint256 asgariMiktar) external nonReentrant {
        Teklif memory t = teklifOf[tid];
        if (t.miktar == 0) revert TeklifYok();
        if (block.timestamp > t.bitis) revert SureBitti();
        if (t.miktar < asgariMiktar) revert FiyatDegisti(t.miktar);
        if (nft.ownerOf(t.tasarimId) != msg.sender || msg.sender == t.alici) revert YetkiYok();
        delete teklifOf[tid];
        if (ilanOf[t.tasarimId].fiyat != 0) { delete ilanOf[t.tasarimId]; emit IlanKalkti(t.tasarimId); }
        emit TeklifKabul(tid, t.tasarimId, msg.sender, t.alici, t.miktar);
        nft.transferFrom(msg.sender, address(this), t.tasarimId);
        _emanetBaslat(t.tasarimId, msg.sender, t.alici, t.miktar, 2);
    }

    /* ======================================================================
     * TIMED AUCTIONS (the NFT in custody here)
     * ====================================================================== */

    function muzayedeBaslat(uint256 id, uint256 rezerv, uint64 sure, uint16 adimBps) external nonReentrant calisiyor {
        if (nft.ownerOf(id) != msg.sender) revert YetkiYok();
        if (rezerv < asgariFiyat) revert KotuDeger();
        if (sure < muzayedeAsgari || sure > muzayedeAzami) revert KotuDeger();
        if (adimBps < asgariAdimBps || adimBps > ADIM_AZAMI_BPS) revert KotuDeger();
        uint64 bitis = uint64(block.timestamp) + sure;
        muzayedeOf[id] = Muzayede(msg.sender, bitis, adimBps, rezerv, address(0), 0);
        if (ilanOf[id].fiyat != 0) { delete ilanOf[id]; emit IlanKalkti(id); }
        emit MuzayedeBasladi(id, msg.sender, rezerv, bitis, adimBps);
        nft.transferFrom(msg.sender, address(this), id);
    }

    /// The lowest bid accepted now.
    function asgariPey(uint256 id) public view returns (uint256) {
        Muzayede storage m = muzayedeOf[id];
        if (m.satici == address(0)) revert MuzayedeYok();
        if (m.enYuksek == address(0)) return m.rezerv;
        uint256 adim = (m.teklif * m.adimBps + 9_999) / 10_000;
        return m.teklif + (adim == 0 ? 1 : adim);
    }

    function pey(uint256 id, uint256 miktar) external nonReentrant calisiyor {
        Muzayede storage m = muzayedeOf[id];
        if (m.satici == address(0)) revert MuzayedeYok();
        if (block.timestamp >= m.bitis) revert SureBitti();
        if (msg.sender == m.satici) revert KotuDeger();
        uint256 gereken = asgariPey(id);
        if (miktar < gereken) revert AzTeklif(gereken);
        _anahtarIste(msg.sender);
        address onceki = m.enYuksek;
        uint256 oncekiMiktar = m.teklif;
        m.enYuksek = msg.sender;
        m.teklif = miktar;
        if (m.bitis - block.timestamp < uzatmaPenceresi) m.bitis = uint64(block.timestamp) + uzatmaSuresi;
        usdc.safeTransferFrom(msg.sender, address(this), miktar);
        toplamBorc += miktar;
        if (onceki != address(0)) _alacak(onceki, id, oncekiMiktar); // outbid: pull with cek
        emit Pey(id, msg.sender, miktar, m.bitis);
    }

    /// The seller, while nobody has bid.
    function muzayedeIptal(uint256 id) external nonReentrant {
        Muzayede memory m = muzayedeOf[id];
        if (m.satici == address(0)) revert MuzayedeYok();
        if (msg.sender != m.satici) revert YetkiYok();
        if (m.enYuksek != address(0)) revert KotuDurum(1);
        delete muzayedeOf[id];
        emit MuzayedeIptal(id);
        if (_bizde(id)) nft.transferFrom(address(this), m.satici, id);
    }

    /// Anyone, after the end: the winner's bid goes to escrow until the key
    /// is delivered; with no bid the NFT goes back.
    function muzayedeKapat(uint256 id) external nonReentrant {
        Muzayede memory m = muzayedeOf[id];
        if (m.satici == address(0)) revert MuzayedeYok();
        if (block.timestamp < m.bitis) revert SureBitmedi();
        delete muzayedeOf[id];
        emit MuzayedeBitti(id, m.enYuksek, m.teklif);
        bool bizde = _bizde(id);
        if (m.enYuksek == address(0)) {
            if (bizde) nft.transferFrom(address(this), m.satici, id);
        } else if (!bizde) {
            _alacak(m.enYuksek, id, m.teklif); // burned by TasarimNFT2 meanwhile
        } else {
            _emanetBaslat(id, m.satici, m.enYuksek, m.teklif, 3);
        }
    }

    /* ======================================================================
     * ESCROW UNTIL THE KEY IS DELIVERED
     * ====================================================================== */

    function _emanetBaslat(uint256 id, address satici, address alici, uint256 fiyat, uint8 tur) private {
        uint64 son = uint64(block.timestamp) + teslimSuresi;
        satisOf[id] = Satis({
            alici: alici,
            durum: 1,
            tur: tur,
            satici: satici,
            teslimSonu: son,
            itirazSonu: 0,
            itirazPenceresi: anahtarItirazSuresi,
            yBps: yakimBps,
            gBps: gelistirmeBps,
            pBps: pazarlamaBps,
            sBps: sahipBps,
            tBps: telifBps,
            fiyat: fiyat,
            aliciAnahtarHash: keccak256(nft.anahtarOf(alici)),
            zarfHash: bytes32(0)
        });
        emit Emanete(id, satici, alici, fiyat, tur, son);
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

    function teslimAldim(uint256 id) external nonReentrant {
        Satis storage s = satisOf[id];
        if (msg.sender != s.alici) revert YetkiYok();
        if (s.durum != 2) revert KotuDurum(s.durum);
        s.durum = 4;
        emit TeslimAlindi(id);
        if (_kopyaEngeli(id) == 0 && _bizde(id)) _ode(id);
    }

    function anahtarItiraz(uint256 id) external {
        Satis storage s = satisOf[id];
        if (msg.sender != s.alici) revert YetkiYok();
        if (s.durum != 2) revert KotuDurum(s.durum);
        if (block.timestamp > s.itirazSonu) revert SureBitti();
        s.durum = 3;
        emit AnahtarItirazi(id, msg.sender);
    }

    /// Anyone: pays out once the buyer confirmed or the dispute window passed.
    function serbestBirak(uint256 id) external nonReentrant {
        Satis storage s = satisOf[id];
        if (s.durum == 2) {
            if (block.timestamp <= s.itirazSonu) revert SureBitmedi();
        } else if (s.durum != 4) {
            revert KotuDurum(s.durum);
        }
        if (!_bizde(id)) revert Yakildi();
        uint8 engel = _kopyaEngeli(id);
        if (engel == 1) revert ItirazAcik();
        if (engel == 2) revert SureBitmedi();
        _ode(id);
    }

    /// Anyone: no key by the deadline; the buyer is refunded, the NFT goes back.
    function iadeEt(uint256 id) external nonReentrant {
        Satis storage s = satisOf[id];
        if (s.durum != 1) revert KotuDurum(s.durum);
        if (block.timestamp <= s.teslimSonu) revert SureBitmedi();
        _iade(id);
    }

    /// Anyone: TasarimNFT2 burned the design while it was held here.
    function yanmisIade(uint256 id) external nonReentrant {
        Satis storage s = satisOf[id];
        if (s.durum == 0) revert KotuDurum(0);
        if (_bizde(id)) revert KotuDeger();
        _iade(id);
    }

    /// Admin (later the DAO): refund the buyer, or side with the seller.
    function anahtarItirazCoz(uint256 id, bool aliciHakli) external nonReentrant sadeceYonetici {
        Satis storage s = satisOf[id];
        if (s.durum != 3) revert KotuDurum(s.durum);
        if (aliciHakli) {
            _iade(id);
        } else {
            s.durum = 4;
            if (_kopyaEngeli(id) == 0 && _bizde(id)) _ode(id);
        }
    }

    /// 0 free, 1 a copy challenge is open, 2 the copy window is still open.
    function _kopyaEngeli(uint256 id) private view returns (uint8) {
        (address itirazci,,) = nft.itirazOf(id);
        if (itirazci != address(0)) return 1;
        (,, uint64 itirazBitis,,,,,) = nft.tasarimOf(id);
        if (nft.kopyaPenceresiBekle() && block.timestamp <= itirazBitis) return 2;
        return 0;
    }

    /// The price split as it would be paid now for (id, satici, fiyat) at the current rates.
    function payHesapla(uint256 id, address satici, uint256 fiyat)
        external
        view
        returns (uint256 net, uint256 telif, uint256 yakim, uint256 gelistirme, uint256 pazarlama_, uint256 sahip_)
    {
        return _paylar(fiyat, satici == tasarimciOf(id), yakimBps, gelistirmeBps, pazarlamaBps, sahipBps, telifBps);
    }

    function _paylar(uint256 fiyat, bool ilkSatis, uint16 y, uint16 g, uint16 p, uint16 s, uint16 t)
        private
        pure
        returns (uint256 net, uint256 telif, uint256 yakim, uint256 gelistirme, uint256 pazarlama_, uint256 sahip_)
    {
        yakim = fiyat * y / 10_000;
        gelistirme = fiyat * g / 10_000;
        pazarlama_ = fiyat * p / 10_000;
        sahip_ = fiyat * s / 10_000;
        telif = ilkSatis ? 0 : fiyat * t / 10_000;
        net = fiyat - yakim - gelistirme - pazarlama_ - sahip_ - telif;
    }

    function _ode(uint256 id) private {
        Satis memory s = satisOf[id];
        delete satisOf[id];
        address tasarimci = tasarimciOf(id);
        bool ilk = s.satici == tasarimci;
        (uint256 net, uint256 telif, uint256 y, uint256 g, uint256 p, uint256 sh) =
            _paylar(s.fiyat, ilk, s.yBps, s.gBps, s.pBps, s.sBps, s.tBps);
        // the whole price moves from escrow to balances owed (toplamBorc unchanged)
        yakimBirikimi += y;
        _alacak(gelistirmeFonu, id, g);
        _alacak(pazarlama, id, p);
        _alacak(sahip, id, sh);
        _dagit(id, telif, tasarimci);
        if (ilk) _dagit(id, net, tasarimci);
        else _alacak(s.satici, id, net);
        emit Dagitildi(id, s.satici, net, telif, y, g, p, sh);
        emit SatisKapandi(id, true, s.satici, s.fiyat);
        nft.transferFrom(address(this), s.alici, id);
    }

    function _iade(uint256 id) private {
        Satis memory s = satisOf[id];
        delete satisOf[id];
        _alacak(s.alici, id, s.fiyat);
        emit SatisKapandi(id, false, s.alici, s.fiyat);
        if (_bizde(id)) nft.transferFrom(address(this), s.satici, id);
    }

    /* ======================================================================
     * WITHDRAWALS (pull)
     * ====================================================================== */

    function cek() external nonReentrant returns (uint256) {
        return _cek(msg.sender);
    }

    /// Anyone pushes a balance to its own owner (wallets that cannot call cek).
    function cekFor(address kime) external nonReentrant returns (uint256) {
        return _cek(kime);
    }

    function _cek(address kime) private returns (uint256 m) {
        m = alacakOf[kime];
        if (m == 0) revert KotuDeger();
        alacakOf[kime] = 0;
        toplamBorc -= m;
        usdc.safeTransfer(kime, m);
        emit Cekildi(kime, m);
    }

    /* ======================================================================
     * ARCP BUY-AND-BURN
     * ====================================================================== */

    /// Swaps `miktar` of the burn pot (0 = all) into ARCP on its pool and
    /// sends the ARCP to 0x…dEaD. Admin only, with a minimum out, so nobody
    /// can sandwich the pot.
    function yakimYap(uint256 miktar, uint256 asgariArcp) external nonReentrant sadeceYonetici returns (uint256 cikan) {
        if (address(router) == address(0) || arcp == address(0)) revert SifirAdres();
        if (miktar == 0) miktar = yakimBirikimi;
        if (miktar == 0 || miktar > yakimBirikimi) revert KotuDeger();
        yakimBirikimi -= miktar;
        toplamBorc -= miktar;
        bool usdcSifirinci = address(usdc) < arcp;
        HavuzAnahtari3 memory key = HavuzAnahtari3({
            currency0: usdcSifirinci ? address(usdc) : arcp,
            currency1: usdcSifirinci ? arcp : address(usdc),
            fee: arcpFee,
            tickSpacing: arcpTickSpacing,
            hooks: arcpKanca
        });
        uint256 once = IERC20(arcp).balanceOf(address(this));
        usdc.forceApprove(address(router), miktar);
        router.swap(key, usdcSifirinci, miktar, asgariArcp);
        usdc.forceApprove(address(router), 0);
        cikan = IERC20(arcp).balanceOf(address(this)) - once;
        if (cikan < asgariArcp) revert AzCikti(cikan, asgariArcp);
        IERC20(arcp).safeTransfer(OLU, cikan);
        emit YakimYapildi(miktar, cikan);
    }

    /* ======================================================================
     * HELPERS
     * ====================================================================== */

    function _onayli(address s, uint256 id) private view returns (bool) {
        return nft.getApproved(id) == address(this) || nft.isApprovedForAll(s, address(this));
    }

    function _sahibi(uint256 id) private view returns (address) {
        try nft.ownerOf(id) returns (address a) { return a; } catch { return address(0); }
    }

    function _bizde(uint256 id) private view returns (bool) {
        return _sahibi(id) == address(this);
    }

    function _anahtarIste(address a) private view {
        if (nft.anahtarOf(a).length == 0) revert AnahtarYok();
    }

    /* ======================================================================
     * ADMIN (every value within a hard cap)
     * ====================================================================== */

    function ucretAyarla(uint16 yakim, uint16 gelistirme, uint16 pazarlama_, uint16 sahip_) external sadeceYonetici {
        if (uint256(yakim) + gelistirme + pazarlama_ + sahip_ > UCRET_AZAMI_BPS) revert KotuDeger();
        yakimBps = yakim;
        gelistirmeBps = gelistirme;
        pazarlamaBps = pazarlama_;
        sahipBps = sahip_;
        emit AyarDegisti("yakimBps", yakim);
        emit AyarDegisti("gelistirmeBps", gelistirme);
        emit AyarDegisti("pazarlamaBps", pazarlama_);
        emit AyarDegisti("sahipBps", sahip_);
    }

    function telifAyarla(uint16 bps) external sadeceYonetici {
        if (bps > TELIF_AZAMI_BPS) revert KotuDeger();
        telifBps = bps;
        emit AyarDegisti("telifBps", bps);
    }

    function cuzdanAyarla(address gelistirme, address pazarlama_, address sahip_) external sadeceYonetici {
        if (gelistirme == address(0) || pazarlama_ == address(0) || sahip_ == address(0)) revert SifirAdres();
        if (gelistirme == address(this) || pazarlama_ == address(this) || sahip_ == address(this)) revert KotuDeger();
        gelistirmeFonu = gelistirme;
        pazarlama = pazarlama_;
        sahip = sahip_;
        emit AdresDegisti("gelistirmeFonu", gelistirme);
        emit AdresDegisti("pazarlama", pazarlama_);
        emit AdresDegisti("sahip", sahip_);
    }

    function muzayedeAyarla(uint16 adimBps, uint64 pencere, uint64 uzatma, uint64 asgari, uint64 azami) external sadeceYonetici {
        if (adimBps == 0 || adimBps > ADIM_AZAMI_BPS) revert KotuDeger();
        if (pencere > UZATMA_AZAMI || uzatma > UZATMA_AZAMI) revert KotuDeger();
        if (asgari < 5 minutes || azami < asgari || azami > MUZAYEDE_AZAMI) revert KotuDeger();
        asgariAdimBps = adimBps;
        uzatmaPenceresi = pencere;
        uzatmaSuresi = uzatma;
        muzayedeAsgari = asgari;
        muzayedeAzami = azami;
        emit AyarDegisti("asgariAdimBps", adimBps);
        emit AyarDegisti("uzatmaPenceresi", pencere);
        emit AyarDegisti("uzatmaSuresi", uzatma);
        emit AyarDegisti("muzayedeAsgari", asgari);
        emit AyarDegisti("muzayedeAzami", azami);
    }

    function teklifAyarla(uint64 azamiSure, uint256 asgariFiyat_) external sadeceYonetici {
        if (azamiSure < 1 hours || azamiSure > TEKLIF_AZAMI) revert KotuDeger();
        if (asgariFiyat_ == 0 || asgariFiyat_ > 1e12) revert KotuDeger();
        teklifAzamiSure = azamiSure;
        asgariFiyat = asgariFiyat_;
        emit AyarDegisti("teklifAzamiSure", azamiSure);
        emit AyarDegisti("asgariFiyat", asgariFiyat_);
    }

    function teslimAyarla(uint64 teslimS, uint64 itirazS) external sadeceYonetici {
        if (teslimS < SURE_ASGARI || teslimS > SURE_AZAMI || itirazS < SURE_ASGARI || itirazS > SURE_AZAMI) revert KotuDeger();
        teslimSuresi = teslimS;
        anahtarItirazSuresi = itirazS;
        emit AyarDegisti("teslimSuresi", teslimS);
        emit AyarDegisti("anahtarItirazSuresi", itirazS);
    }

    function yakimRotasiAyarla(ITakasRouter3 r, address arcp_, address kanca, uint24 fee, int24 tickSpacing) external sadeceYonetici {
        if (address(r) == address(0) || arcp_ == address(0) || arcp_ == address(usdc)) revert SifirAdres();
        router = r;
        arcp = arcp_;
        arcpKanca = kanca;
        arcpFee = fee;
        arcpTickSpacing = tickSpacing;
        emit AdresDegisti("router", address(r));
        emit AdresDegisti("arcp", arcp_);
        emit AdresDegisti("arcpKanca", kanca);
        emit AyarDegisti("arcpFee", fee);
        emit AyarDegisti("arcpTickSpacing", uint256(int256(tickSpacing)));
    }

    function durdur(bool d) external sadeceYonetici {
        durduruldu = d;
        emit AyarDegisti("durduruldu", d ? 1 : 0);
    }

    /// Tokens sent here by mistake; never USDC owed (toplamBorc).
    function sweep(IERC20 token, address to, uint256 miktar) external nonReentrant sadeceYonetici {
        if (to == address(0) || address(token) == address(0)) revert SifirAdres();
        uint256 bakiye = token.balanceOf(address(this));
        uint256 borc = address(token) == address(usdc) ? toplamBorc : 0;
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
