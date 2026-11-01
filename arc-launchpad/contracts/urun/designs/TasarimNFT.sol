// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/* ===========================================================================
 * TasarimNFT — "Designs", the designer NFT marketplace of ARC PULSE (Arc)
 *
 * Owner, 1 Nov 2026. A designer launches their own token through MerkezKapi
 * (the same rules as every launch) and records type 8 ("designer") for it in
 * TurKaydi. With that token they publish designs here: digital files and
 * images (T-shirt designs, 3D printer files), every design a 1-of-1 ERC-721.
 *
 * WHAT IS ON CHAIN
 *   Per design: the designer token, the publisher, the content URI (IPFS /
 *   Arweave metadata; the file itself is encrypted client-side and its key is
 *   gated by NFT ownership elsewhere), the exact file hash and a perceptual
 *   fingerprint. No personal data: identity is the wallet.
 *
 * LICENSE
 *   The holder of the NFT holds all usage rights to the design, commercial
 *   included. On transfer the rights move to the new holder; the previous
 *   holder keeps none. Metadata convention: the JSON at tokenURI carries
 *   "license": LISANS_URI and "license_text": LISANS.
 *
 * BUYER PROTECTION (escrow)
 *   While a design's challenge window is open (and emanetAcik, default on),
 *   a sale's payment is held here instead of paid out. After the window, with
 *   no challenge open, anyone releases it to the seller (and the royalty to
 *   the designer): emanetIsle. If the design is burned (challenge upheld or
 *   legal takedown) every held payment goes back to its buyer instead, in the
 *   token the contract holds for it: the designer token (for alUsdc that is
 *   the tokens the buyer's USDC bought). Sales after the window pay at once.
 *   The contract tracks what it owes per token (borcOf); sweep can only take
 *   what is above that.
 *
 * MONEY
 *   Publishing costs ucret1 + ucret2 USDC (default $0.10 + $0.10) paid to two
 *   admin-set wallets, plus an optional refundable designer stake (default 0).
 *   A sale is priced in USDC and paid in the designer's own token, converted
 *   at a TWAP (never the spot price). The whole payment goes to the seller;
 *   on a resale an admin-set royalty (default 0) goes to the designer. The
 *   contract never pays anything itself and keeps no cut.
 *
 * DUPLICATES AND CHALLENGES
 *   A second design with the same file hash or the same perceptual
 *   fingerprint is refused. For near copies there is a challenge window:
 *   anyone may post a USDC bond and point at an earlier design or evidence;
 *   the admin (later the DAO) resolves. Upheld: the copy is burned, the
 *   challenger gets the bond back plus the copy's stake. Rejected: the bond
 *   goes to the designer. The admin may also take a design down at any time
 *   for a legal notice.
 *
 * ADMIN
 *   Every amount, wallet, window and source is settable (owner's order:
 *   nothing locked, keep room to change and fix). The admin cannot move or
 *   take anyone's NFT, listing or payment; caps keep the royalty and the
 *   alUsdc tolerance in sane ranges. Two-step handover, for the DAO governor.
 * =========================================================================== */

interface ITurKaydi {
    function turOf(address token) external view returns (uint8);
    function kurucuOf(address token) external view returns (address);
}

/// USDC (6 decimals) price of 1e18 base units of `token`, time-weighted over
/// `saniye` seconds. Implemented by PulseHook6; a mock in tests.
interface IFiyatKaynagi {
    function twapUsdcPerToken(address token, uint32 saniye) external view returns (uint256);
}

/// Same ABI as Uniswap v4's PoolKey (Currency and IHooks are addresses).
struct HavuzAnahtari {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/// The SwapRouter on Arc (contracts/SwapRouter.sol) the site sells through:
/// exact input, pulls the input from and pays the output to msg.sender.
interface ITakasRouter {
    function swap(HavuzAnahtari calldata key, bool zeroForOne, uint256 amountIn, uint256 minOut)
        external
        payable
        returns (uint256);
}

contract TasarimNFT is ERC721, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant TASARIMCI_TURU = 8;
    uint256 public constant URI_AZAMI = 512;
    uint256 public constant TELIF_AZAMI_BPS = 1000;     // royalty never above 10%
    uint256 public constant TOLERANS_AZAMI_BPS = 5000;  // alUsdc floor never below 50% of TWAP

    string public constant LISANS =
        "The holder of this NFT holds all usage rights to the design, including commercial use. "
        "On transfer all rights pass to the new holder; the previous holder keeps none.";
    string public constant LISANS_URI = "https://arcpulse.app/#/designs/license";

    IERC20 public immutable usdc;

    /* ---- admin settings ---- */
    address public yonetici;
    address public bekleyenYonetici;
    ITurKaydi public turKaydi;
    address public alici1;            // owner wallet
    address public alici2;            // development / marketing wallet
    uint256 public ucret1 = 100_000;  // $0.10
    uint256 public ucret2 = 100_000;  // $0.10
    uint256 public tasarimciTeminati; // stake per new design, default $0
    uint256 public itirazTeminati = 5_000_000; // $5
    uint64 public itirazSuresi = 3 days;
    IFiyatKaynagi public fiyatKaynagi;
    uint32 public twapSaniye = 1800;
    /// Token base units the source price refers to. PulseHook6 reports the USDC
    /// (6 dec) price of 1e30 units: a 6-decimal price of 1e18 units is too coarse
    /// for a cheap token (PROOF, 1 Nov 2026: about 3 units, a 30% step; under
    /// $0.000001 it is 0). Settable with the source.
    uint256 public fiyatBirimi = 1e30;
    uint16 public telifBps;           // resale royalty to the designer, default 0
    ITakasRouter public router;
    uint16 public alUsdcToleransBps = 1000; // swap output may be at most 10% under TWAP value
    bool public durduruldu;
    /// Hold sale payments in escrow while the design's challenge window is open.
    bool public emanetAcik = true;

    struct KancaAyar { bool izinli; uint24 fee; int24 tickSpacing; }
    /// Uniswap v4 hooks whose pools alUsdc may trade (the launch hooks).
    mapping(address => KancaAyar) public kancaAyar;
    /// admin's manual designer -> token link for edge cases
    mapping(address => address) public elleBagliToken;

    /* ---- designs ---- */
    struct Tasarim {
        address token;      // the designer's launch token: payment currency
        address tasarimci;  // the publisher
        uint64 itirazBitis; // challenges accepted until this time
        bytes32 dosyaHash;
        bytes32 algiHash;
        uint256 teminat;    // stake posted at publish, still held
    }
    struct Ilan { address satici; uint256 fiyat; }   // fiyat in USDC (6 dec)
    struct Itiraz { address itirazci; uint256 teminat; uint256 oncekiId; }

    uint256 public sonId;
    mapping(uint256 => Tasarim) public tasarimOf;
    mapping(uint256 => string) private uriOf;
    mapping(uint256 => Ilan) public ilanOf;
    mapping(uint256 => Itiraz) public itirazOf;
    mapping(bytes32 => uint256) public dosyaKaydi; // file hash -> design id
    mapping(bytes32 => uint256) public algiKaydi;  // perceptual fingerprint -> design id

    /* ---- escrow and liabilities ---- */
    struct Emanet { address alici; address satici; uint256 miktar; uint256 telif; }
    mapping(uint256 => Emanet[]) private emanetler;
    mapping(uint256 => uint256) public emanetSira;  // entries before this index are settled
    mapping(uint256 => bool) public iptalOf;        // burned by an upheld challenge or takedown
    /// What the contract owes per token: escrowed payments, stakes, bonds.
    mapping(address => uint256) public borcOf;

    /* ---- events ---- */
    event Yayinlandi(uint256 indexed id, address indexed tasarimci, address indexed token, bytes32 dosyaHash, bytes32 algiHash, string uri, uint256 ucret, uint256 teminat);
    event IlanVerildi(uint256 indexed id, address indexed satici, uint256 fiyat);
    event IlanKalkti(uint256 indexed id);
    event Satildi(uint256 indexed id, address indexed satici, address indexed alici, uint256 fiyat, address token, uint256 tokenMiktari, uint256 telif, bool usdcIle);
    event ItirazEdildi(uint256 indexed id, address indexed itirazci, uint256 oncekiId, string kanitUri, uint256 teminat);
    event ItirazCozuldu(uint256 indexed id, bool kabul, address itirazci, uint256 odenen, address alan);
    event Kaldirildi(uint256 indexed id, string sebep);
    event TeminatIade(uint256 indexed id, address kime, uint256 miktar);
    event AyarDegisti(bytes32 indexed ad, uint256 deger);
    event AdresDegisti(bytes32 indexed ad, address deger);
    event KancaDegisti(address indexed kanca, bool izinli, uint24 fee, int24 tickSpacing);
    event ElleBaglandi(address indexed tasarimci, address token);
    event ParmakIziSerbest(bytes32 dosyaHash, bytes32 algiHash);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);
    event Emanete(uint256 indexed id, uint256 sira, address alici, address satici, uint256 miktar, uint256 telif);
    event EmanetOdendi(uint256 indexed id, uint256 sira, address kime, uint256 miktar, bool iade);
    event Supuruldu(address indexed token, address to, uint256 miktar);

    /* ---- errors ---- */
    error YetkiYok();
    error SifirAdres();
    error KotuDeger();
    error Durduruldu();
    error TasarimciDegil();
    error KopyaDosya(uint256 mevcutId);
    error KopyaAlgi(uint256 mevcutId);
    error Yok();
    error IlanYok();
    error ItirazAcik();
    error ItirazYok();
    error SureBitti();
    error SureBitmedi();
    error FiyatYok();
    error KaymaAsildi(uint256 gereken, uint256 azami);
    error KancaIzinsiz();
    error AzCikti(uint256 gelen, uint256 asgari);
    error EmanetYok();
    error FazlaYok(uint256 serbest);

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
     * PUBLISH
     * ====================================================================== */

    /// May `tasarimci` publish designs paid in `token`?
    function yayinlayabilir(address tasarimci, address token) public view returns (bool) {
        if (tasarimci == address(0) || token == address(0)) return false;
        if (elleBagliToken[tasarimci] == token) return true;
        return turKaydi.turOf(token) == TASARIMCI_TURU && turKaydi.kurucuOf(token) == tasarimci;
    }

    /// Publish one design (one NFT, minted to the designer). `fiyat` > 0 also
    /// lists it for sale at that USDC price. The caller pays ucret1 + ucret2
    /// (+ the stake) in USDC and must have approved it to this contract.
    function yayinla(address token, bytes32 dosyaHash, bytes32 algiHash, string calldata uri, uint256 fiyat)
        external
        nonReentrant
        calisiyor
        returns (uint256 id)
    {
        if (!yayinlayabilir(msg.sender, token)) revert TasarimciDegil();
        if (dosyaHash == bytes32(0) || algiHash == bytes32(0)) revert KotuDeger();
        uint256 n = bytes(uri).length;
        if (n == 0 || n > URI_AZAMI) revert KotuDeger();
        if (dosyaKaydi[dosyaHash] != 0) revert KopyaDosya(dosyaKaydi[dosyaHash]);
        if (algiKaydi[algiHash] != 0) revert KopyaAlgi(algiKaydi[algiHash]);

        id = ++sonId;
        uint256 teminat = tasarimciTeminati;
        dosyaKaydi[dosyaHash] = id;
        algiKaydi[algiHash] = id;
        tasarimOf[id] = Tasarim({
            token: token,
            tasarimci: msg.sender,
            itirazBitis: uint64(block.timestamp) + itirazSuresi,
            dosyaHash: dosyaHash,
            algiHash: algiHash,
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
        emit Yayinlandi(id, msg.sender, token, dosyaHash, algiHash, uri, u1 + u2, teminat);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return uriOf[id];
    }

    /// The designer takes the stake back once the challenge window is over
    /// and no challenge is open.
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
     * SALE: list, buy with the designer token, buy with USDC
     * ====================================================================== */

    function ilanVer(uint256 id, uint256 fiyat) external calisiyor {
        if (ownerOf(id) != msg.sender) revert YetkiYok();
        if (fiyat == 0) revert KotuDeger();
        ilanOf[id] = Ilan(msg.sender, fiyat);
        emit IlanVerildi(id, msg.sender, fiyat);
    }

    function ilanKaldir(uint256 id) external {
        if (ownerOf(id) != msg.sender) revert YetkiYok();
        delete ilanOf[id];
        emit IlanKalkti(id);
    }

    /// Designer tokens worth `fiyat` USDC at the TWAP (rounded up, in favour of the seller).
    /// fiyat * fiyatBirimi cannot overflow for any real price (< 2^256 / 1e40).
    function tokenKarsiligi(address token, uint256 fiyat) public view returns (uint256) {
        if (address(fiyatKaynagi) == address(0)) revert FiyatYok();
        uint256 p = fiyatKaynagi.twapUsdcPerToken(token, twapSaniye);
        if (p == 0) revert FiyatYok();
        return (fiyat * fiyatBirimi + p - 1) / p;
    }

    /// Buy a listed design paying in the designer's token. The buyer approves
    /// the token to this contract; at most `maxToken` is taken.
    function al(uint256 id, uint256 maxToken) external nonReentrant calisiyor returns (uint256 miktar) {
        (address satici, uint256 fiyat, address token, address tasarimci) = _satisHazirla(id);
        miktar = tokenKarsiligi(token, fiyat);
        if (miktar > maxToken) revert KaymaAsildi(miktar, maxToken);
        uint256 telif = _telif(satici, tasarimci, miktar);

        _transfer(satici, msg.sender, id); // clears the listing (see _update)
        if (_emanetli(id)) {
            _emaneteAl(id, token, satici, miktar, telif);
            IERC20(token).safeTransferFrom(msg.sender, address(this), miktar);
        } else {
            IERC20(token).safeTransferFrom(msg.sender, satici, miktar - telif);
            if (telif > 0) IERC20(token).safeTransferFrom(msg.sender, tasarimci, telif);
        }
        emit Satildi(id, satici, msg.sender, fiyat, token, miktar, telif, false);
    }

    /// Buy a listed design paying the USDC price in USDC: the USDC is swapped
    /// into the designer token in the token's own Uniswap v4 launch pool
    /// (through the site's SwapRouter) and the tokens go to the seller. The
    /// output must reach both the buyer's `minToken` and a floor of the TWAP
    /// value minus alUsdcToleransBps, so a manipulated pool cannot shortchange
    /// the seller. `kanca` is the pool's hook and must be allowed by the admin.
    function alUsdc(uint256 id, address kanca, uint256 minToken)
        external
        nonReentrant
        calisiyor
        returns (uint256 miktar)
    {
        (address satici, uint256 fiyat, address token, address tasarimci) = _satisHazirla(id);
        KancaAyar memory k = kancaAyar[kanca];
        if (!k.izinli) revert KancaIzinsiz();
        uint256 taban = tokenKarsiligi(token, fiyat) * (10_000 - alUsdcToleransBps) / 10_000;
        if (minToken > taban) taban = minToken;

        _transfer(satici, msg.sender, id);
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

        uint256 telif = _telif(satici, tasarimci, miktar);
        if (_emanetli(id)) {
            _emaneteAl(id, token, satici, miktar, telif);
        } else {
            IERC20(token).safeTransfer(satici, miktar - telif);
            if (telif > 0) IERC20(token).safeTransfer(tasarimci, telif);
        }
        emit Satildi(id, satici, msg.sender, fiyat, token, miktar, telif, true);
    }

    function _satisHazirla(uint256 id)
        private
        view
        returns (address satici, uint256 fiyat, address token, address tasarimci)
    {
        Ilan memory i = ilanOf[id];
        if (i.fiyat == 0) revert IlanYok();
        if (itirazOf[id].itirazci != address(0)) revert ItirazAcik();
        if (i.satici == msg.sender) revert KotuDeger();
        Tasarim storage t = tasarimOf[id];
        return (i.satici, i.fiyat, t.token, t.tasarimci);
    }

    function _emanetli(uint256 id) private view returns (bool) {
        return emanetAcik && block.timestamp <= tasarimOf[id].itirazBitis;
    }

    function _emaneteAl(uint256 id, address token, address satici, uint256 miktar, uint256 telif) private {
        borcOf[token] += miktar;
        emanetler[id].push(Emanet(msg.sender, satici, miktar, telif));
        emit Emanete(id, emanetler[id].length - 1, msg.sender, satici, miktar, telif);
    }

    /// Settle up to `adet` escrowed payments of design `id`, oldest first.
    /// Anyone may call. Burned design: each goes back to its buyer. Otherwise
    /// only after the challenge window with no challenge open: to the seller,
    /// the royalty to the designer. Returns how many are settled in total.
    function emanetIsle(uint256 id, uint256 adet) external nonReentrant returns (uint256 son) {
        uint256 i = emanetSira[id];
        uint256 n = emanetler[id].length;
        if (i >= n || adet == 0) revert EmanetYok();
        bool iade = iptalOf[id];
        Tasarim storage t = tasarimOf[id];
        if (!iade) {
            if (block.timestamp <= t.itirazBitis) revert SureBitmedi();
            if (itirazOf[id].itirazci != address(0)) revert ItirazAcik();
        }
        son = adet < n - i ? i + adet : n;
        emanetSira[id] = son;
        IERC20 token = IERC20(t.token);
        uint256 toplam;
        for (uint256 j = i; j < son; ++j) {
            Emanet memory e = emanetler[id][j];
            toplam += e.miktar;
        }
        borcOf[address(token)] -= toplam;
        for (; i < son; ++i) {
            Emanet memory e = emanetler[id][i];
            if (iade) {
                token.safeTransfer(e.alici, e.miktar);
                emit EmanetOdendi(id, i, e.alici, e.miktar, true);
            } else {
                token.safeTransfer(e.satici, e.miktar - e.telif);
                if (e.telif > 0) token.safeTransfer(t.tasarimci, e.telif);
                emit EmanetOdendi(id, i, e.satici, e.miktar, false);
            }
        }
    }

    /// Escrow of design `id`: number of entries, how many are settled, and entry `sira`.
    function emanet(uint256 id, uint256 sira) external view returns (uint256 sayi, uint256 islenen, Emanet memory e) {
        sayi = emanetler[id].length;
        islenen = emanetSira[id];
        if (sira < sayi) e = emanetler[id][sira];
    }

    function _telif(address satici, address tasarimci, uint256 miktar) private view returns (uint256) {
        if (satici == tasarimci) return 0;
        return miktar * telifBps / 10_000;
    }

    /// Any movement of the NFT (sale, gift, burn) ends its listing: a listing
    /// belongs to the holder who made it.
    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        from = super._update(to, id, auth);
        if (ilanOf[id].fiyat != 0) {
            delete ilanOf[id];
            emit IlanKalkti(id);
        }
    }

    /* ======================================================================
     * CHALLENGES AND TAKEDOWN
     * ====================================================================== */

    /// Challenge design `id` as a copy of design `oncekiId` (0 if the
    /// evidence is external, then `kanitUri` says where). Posts the bond.
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

    /// Admin (later the DAO) resolves an open challenge. Upheld: the copy is
    /// burned, the challenger gets the bond back plus the design's stake and
    /// the escrowed payments become refundable to their buyers (emanetIsle).
    /// Rejected: the bond goes to the designer.
    function itirazCoz(uint256 id, bool kabul) external nonReentrant sadeceYonetici {
        Itiraz memory i = itirazOf[id];
        if (i.itirazci == address(0)) revert ItirazYok();
        delete itirazOf[id];
        Tasarim storage t = tasarimOf[id];
        address alan;
        uint256 odenen;
        if (kabul) {
            odenen = i.teminat + t.teminat;
            t.teminat = 0;
            alan = i.itirazci;
            iptalOf[id] = true;
            _burn(id);
        } else {
            odenen = i.teminat;
            alan = t.tasarimci;
        }
        borcOf[address(usdc)] -= odenen;
        if (odenen > 0) usdc.safeTransfer(alan, odenen);
        emit ItirazCozuldu(id, kabul, i.itirazci, odenen, alan);
    }

    /// Legal takedown (illegal content, proven copyright claim) at any time.
    /// An open challenge's bond goes back to the challenger, the stake back to
    /// the designer, escrowed payments to their buyers (emanetIsle).
    function kaldir(uint256 id, string calldata sebep) external nonReentrant sadeceYonetici {
        _requireOwned(id);
        Tasarim storage t = tasarimOf[id];
        Itiraz memory i = itirazOf[id];
        delete itirazOf[id];
        uint256 st = t.teminat;
        t.teminat = 0;
        iptalOf[id] = true;
        borcOf[address(usdc)] -= i.teminat + st;
        _burn(id);
        if (i.teminat > 0) usdc.safeTransfer(i.itirazci, i.teminat);
        if (st > 0) usdc.safeTransfer(t.tasarimci, st);
        emit Kaldirildi(id, sebep);
    }

    /* ======================================================================
     * ADMIN SETTINGS
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

    function itirazAyarla(uint64 sure, uint256 teminat) external sadeceYonetici {
        itirazSuresi = sure;
        itirazTeminati = teminat;
        emit AyarDegisti("itirazSuresi", sure);
        emit AyarDegisti("itirazTeminati", teminat);
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

    /// Manual designer -> token link for edge cases (token 0 removes it).
    function elleBagla(address tasarimci, address token) external sadeceYonetici {
        if (tasarimci == address(0)) revert SifirAdres();
        elleBagliToken[tasarimci] = token;
        emit ElleBaglandi(tasarimci, token);
    }

    /// Frees a fingerprint (a mistaken entry, a design burned by mistake).
    function parmakIziSerbest(bytes32 dosyaHash, bytes32 algiHash) external sadeceYonetici {
        if (dosyaHash != bytes32(0)) delete dosyaKaydi[dosyaHash];
        if (algiHash != bytes32(0)) delete algiKaydi[algiHash];
        emit ParmakIziSerbest(dosyaHash, algiHash);
    }

    /// Pauses publishing, listing, buying and new challenges (not delisting,
    /// stake refunds or resolution).
    function emanetAyarla(bool acik) external sadeceYonetici {
        emanetAcik = acik;
        emit AyarDegisti("emanetAcik", acik ? 1 : 0);
    }

    /// Takes tokens sent here by mistake. Never what the contract owes:
    /// escrowed payments, stakes and bonds (borcOf) stay untouched.
    function sweep(IERC20 token, address to, uint256 miktar) external nonReentrant sadeceYonetici {
        if (to == address(0) || address(token) == address(0)) revert SifirAdres();
        uint256 bakiye = token.balanceOf(address(this));
        uint256 borc = borcOf[address(token)];
        uint256 serbest = bakiye > borc ? bakiye - borc : 0;
        if (miktar == 0 || miktar > serbest) revert FazlaYok(serbest);
        token.safeTransfer(to, miktar);
        emit Supuruldu(address(token), to, miktar);
    }

    function durdur(bool d) external sadeceYonetici {
        durduruldu = d;
        emit AyarDegisti("durduruldu", d ? 1 : 0);
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

    /// Design data plus its URI, for the site in one call.
    function tasarim(uint256 id) external view returns (Tasarim memory t, string memory uri, Ilan memory ilan, Itiraz memory itiraz) {
        return (tasarimOf[id], uriOf[id], ilanOf[id], itirazOf[id]);
    }
}
