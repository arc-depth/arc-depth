// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title DavetOdemesi — ARC PULSE referral rewards on Arc
 * @notice Pays referrers a share of the PLATFORM's cut of what the wallets
 *         they invited (DavetKaydi) paid in fees. It is never an extra
 *         charge on anyone: the deployed launch and trade contracts cannot
 *         be changed, so their fees go out exactly as before and the
 *         platform side (development fund / marketing) sends this contract
 *         USDC from what it received.
 *
 * HOW AN AMOUNT IS FIXED
 *   Every input is public chain data: the DavetKaydi bindings, the
 *   MerkezKapi buys / sells / launches, the Designs publishes and USDC
 *   buys, and this contract's own OranDegisti history. A published,
 *   deterministic program (docs/js/davet-hesap.js, the same file the site
 *   runs) turns them into each referrer's CUMULATIVE reward up to block
 *   `sonBlok` and a Merkle root of (referrer, cumulative amount). The admin
 *   publishes the root with kokYayinla. Anyone can recompute it from the
 *   chain and compare; the site does exactly that before it offers a claim.
 *   A new root waits `beklemeSaniye` before it can be claimed against, and
 *   the admin can cancel a root while it waits.
 *
 * RULES THE CONTRACT ENFORCES
 *   - The rate (oranBps, share of the platform's cut) is capped at
 *     ORAN_TAVAN_BPS (30%); every change is an OranDegisti event with its
 *     block, and activity from that block on uses the new rate.
 *   - A root's total can never exceed what this contract holds plus what it
 *     already paid: every published amount is funded before it is claimable.
 *   - Roots only move forward (later sonBlok, cumulative total not lower).
 *   - talep pays (cumulative amount - already paid) to the referrer and
 *     nowhere else; anyone may send the transaction for them.
 *   - The admin can take back only USDC that no published root owes.
 *   - The admin cannot change bindings, amounts already claimable, or
 *     where a referrer's reward goes.
 *
 *   Rewards depend on the platform funding this contract; nothing here is
 *   a promise of any amount.
 */
contract DavetOdemesi is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant ORAN_TAVAN_BPS = 3_000;      // at most 30% of the platform's cut
    uint32 public constant BEKLEME_TAVAN = 7 days;

    IERC20 public immutable usdc;
    /// the DavetKaydi whose bindings the amounts use (informational)
    address public immutable kayit;

    address public yonetici;
    address public bekleyenYonetici;
    uint16 public oranBps;
    uint32 public beklemeSaniye;

    struct Kok {
        bytes32 kok;
        uint64 sonBlok;      // activity up to and including this block
        uint64 gecerli;      // claimable from this time
        uint128 toplam;      // sum of every referrer's cumulative amount
    }
    /// the newest root (may still be waiting)
    Kok public guncel;
    /// the root before it, claimable while `guncel` waits
    Kok public onceki;
    uint256 public kokSayisi;

    mapping(address => uint256) public odenen;
    uint256 public toplamOdenen;

    event Fonlandi(address indexed kim, uint256 miktar);
    event KokYayinlandi(uint256 indexed no, bytes32 kok, uint64 sonBlok, uint128 toplam, uint64 gecerli, bytes32 veriHash);
    event KokIptal(uint256 indexed no, bytes32 kok);
    event Odendi(address indexed hesap, uint256 miktar, uint256 toplamHak);
    event OranDegisti(uint16 eski, uint16 yeni, uint64 blok);
    event BeklemeDegisti(uint32 saniye);
    event FazlaCekildi(address indexed kime, uint256 miktar);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);

    error YetkiYok();
    error SifirAdres();
    error KotuDeger();
    error GeriGidemez();
    error Karsiliksiz(uint256 toplam, uint256 karsilik);
    error BekleyenYok();
    error KotuKanit();
    error AlacakYok();
    error KokAsildi();

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert YetkiYok();
        _;
    }

    constructor(IERC20 usdc_, address kayit_, address yonetici_, uint16 oranBps_, uint32 beklemeSaniye_) {
        if (address(usdc_) == address(0) || kayit_ == address(0) || yonetici_ == address(0)) revert SifirAdres();
        if (oranBps_ > ORAN_TAVAN_BPS || beklemeSaniye_ > BEKLEME_TAVAN) revert KotuDeger();
        usdc = usdc_;
        kayit = kayit_;
        yonetici = yonetici_;
        oranBps = oranBps_;
        beklemeSaniye = beklemeSaniye_;
        emit YoneticiDegisti(address(0), yonetici_);
        emit OranDegisti(0, oranBps_, uint64(block.number));
        emit BeklemeDegisti(beklemeSaniye_);
    }

    /* ------------------------------------------------------------ funding */

    /// Move `miktar` USDC from the caller into the reward pot (approve first).
    function fonla(uint256 miktar) external {
        if (miktar == 0) revert KotuDeger();
        usdc.safeTransferFrom(msg.sender, address(this), miktar);
        emit Fonlandi(msg.sender, miktar);
    }

    /* -------------------------------------------------------------- roots */

    /// The root claims are checked against now.
    function etkinKok() public view returns (Kok memory) {
        return guncel.gecerli <= block.timestamp ? guncel : onceki;
    }

    /// What published roots still owe (the larger total, minus what was paid).
    function borc() public view returns (uint256) {
        uint256 t = guncel.toplam > onceki.toplam ? guncel.toplam : onceki.toplam;
        return t > toplamOdenen ? t - toplamOdenen : 0;
    }

    /// Publish the root of every referrer's cumulative reward up to `sonBlok`.
    /// `veriHash` = keccak256 of the published leaf list, for anyone to match.
    function kokYayinla(bytes32 kok, uint64 sonBlok, uint128 toplam, bytes32 veriHash) external sadeceYonetici {
        if (kok == bytes32(0) || sonBlok >= block.number) revert KotuDeger();
        bool guncelGecerli = guncel.gecerli <= block.timestamp;
        Kok memory taban = guncelGecerli ? guncel : onceki;
        if (sonBlok <= taban.sonBlok || toplam < taban.toplam) revert GeriGidemez();
        uint256 karsilik = toplamOdenen + usdc.balanceOf(address(this));
        if (toplam > karsilik) revert Karsiliksiz(toplam, karsilik);
        if (guncelGecerli) onceki = guncel;
        uint64 g = uint64(block.timestamp) + beklemeSaniye;
        guncel = Kok(kok, sonBlok, g, toplam);
        unchecked { ++kokSayisi; }
        emit KokYayinlandi(kokSayisi, kok, sonBlok, toplam, g, veriHash);
    }

    /// Cancel the newest root while it still waits; the one before stays.
    function kokIptal() external sadeceYonetici {
        if (guncel.gecerli <= block.timestamp) revert BekleyenYok();
        emit KokIptal(kokSayisi, guncel.kok);
        guncel = onceki;
    }

    /* ------------------------------------------------------------- claims */

    /// The leaf for (`hesap`, `toplamHak`): OpenZeppelin StandardMerkleTree, (address, uint256).
    function yaprak(address hesap, uint256 toplamHak) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(hesap, toplamHak))));
    }

    /// How much `talep` would pay `hesap` now (0 when the proof does not match).
    function talepEdilebilir(address hesap, uint256 toplamHak, bytes32[] calldata kanit) external view returns (uint256) {
        Kok memory k = etkinKok();
        if (k.kok == bytes32(0) || !MerkleProof.verifyCalldata(kanit, k.kok, yaprak(hesap, toplamHak))) return 0;
        uint256 o = odenen[hesap];
        return toplamHak > o ? toplamHak - o : 0;
    }

    /// Pay `hesap` its cumulative reward `toplamHak` minus what it was paid. Anyone may call.
    function talep(address hesap, uint256 toplamHak, bytes32[] calldata kanit) external nonReentrant returns (uint256 miktar) {
        Kok memory k = etkinKok();
        if (k.kok == bytes32(0) || !MerkleProof.verifyCalldata(kanit, k.kok, yaprak(hesap, toplamHak))) revert KotuKanit();
        uint256 o = odenen[hesap];
        if (toplamHak <= o) revert AlacakYok();
        miktar = toplamHak - o;
        if (toplamOdenen + miktar > k.toplam) revert KokAsildi();
        odenen[hesap] = toplamHak;
        toplamOdenen += miktar;
        usdc.safeTransfer(hesap, miktar);
        emit Odendi(hesap, miktar, toplamHak);
    }

    /* -------------------------------------------------------------- admin */

    function oranAyarla(uint16 bps) external sadeceYonetici {
        if (bps > ORAN_TAVAN_BPS) revert KotuDeger();
        emit OranDegisti(oranBps, bps, uint64(block.number));
        oranBps = bps;
    }

    function beklemeAyarla(uint32 saniye) external sadeceYonetici {
        if (saniye > BEKLEME_TAVAN) revert KotuDeger();
        beklemeSaniye = saniye;
        emit BeklemeDegisti(saniye);
    }

    /// Take back USDC that no published root owes.
    function fazlaCek(address kime, uint256 miktar) external sadeceYonetici nonReentrant {
        if (kime == address(0)) revert SifirAdres();
        uint256 b = usdc.balanceOf(address(this));
        uint256 serbest = b > borc() ? b - borc() : 0;
        if (miktar == 0 || miktar > serbest) revert KotuDeger();
        usdc.safeTransfer(kime, miktar);
        emit FazlaCekildi(kime, miktar);
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
