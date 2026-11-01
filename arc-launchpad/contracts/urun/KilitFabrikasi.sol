// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

/* ===========================================================================
 * KilitFabrikasi / KurucuKilidi — a project founder locks their own share
 *
 * Owner, 1 Nov 2026: a project (TurKaydi type 4) founder may lock the
 * founder share for 3–24 months so holders can trust it. Same launch, same
 * fees, nothing extra: the founder only chooses who receives the founder
 * share.
 *
 * HOW IT FITS THE LAUNCH
 *   MerkezKapi sends the founder tokens to the 32-byte `kurucu` of the
 *   LaunchIstegi (on Arc when kurucuEid = 0) and the founder's KurucuVekili
 *   pays the founder's trading income in USDC to the same `kurucu` (on Arc
 *   when kurucuZincir = Arc). The lock's address is a CREATE2 address that
 *   depends only on (beneficiary, months, cliff, salt), so the site computes
 *   it BEFORE the launch and puts it as `kurucu`. The lock may be deployed
 *   before or after the launch; tokens sent to the address wait there.
 *
 * WHAT IS LOCKED, WHAT IS NOT
 *   Any ERC-20 the lock holds (the founder share, and anything that arrives
 *   later) is released linearly over `ay` months of 30 days from its start,
 *   nothing before the cliff. USDC is never locked: the founder's trading
 *   income passes through, anyone may call usdcGecir().
 *
 * WHEN A TOKEN'S CLOCK STARTS
 *   The first time anyone calls baslat(token) (or a release) while the lock
 *   holds that token; the factory does it at deployment for tokens listed
 *   then. So the start is never before the tokens were there: holders can
 *   check it, and the founder (or the site) starts it right after the launch.
 *
 * WHO CAN DO WHAT
 *   The beneficiary may change their receiving address and write the
 *   token's type in TurKaydi (the lock is the token's founder of record).
 *   Anyone may trigger a release; it always goes to the beneficiary. There
 *   is no owner and no admin: nobody, not the beneficiary and not us, can
 *   take locked tokens out early.
 * =========================================================================== */

interface ITurKaydiK { function yaz(address token, uint8 tur, string calldata bilgi) external; }
interface IKilitFabrikasi {
    function usdc() external view returns (IERC20);
    function turKaydi() external view returns (ITurKaydiK);
}

contract KurucuKilidi {
    using SafeERC20 for IERC20;

    uint256 public constant AY = 30 days;
    uint8 public constant ASGARI_AY = 3;
    uint8 public constant AZAMI_AY = 24;

    address public immutable fabrika;
    IERC20 public immutable usdc;
    ITurKaydiK public immutable turKaydi;
    /// total months, and months before anything is released
    uint8 public immutable ay;
    uint8 public immutable ucurumAy;
    uint64 public immutable kurulus;

    address public lehtar;
    mapping(address => uint64) public baslangicOf;
    mapping(address => uint256) public serbestOf;

    struct Takvim {
        uint64 baslangic;     // 0: not started yet
        uint64 ucurumBitis;
        uint64 bitis;
        uint256 toplam;       // held + released
        uint256 serbest;      // released so far
        uint256 cekilebilir;  // releasable now
        uint256 kilitli;      // held and not releasable now
    }

    event Basladi(address indexed token, uint64 zaman, uint256 bakiye);
    event SerbestBirakildi(address indexed token, address indexed lehtar, uint256 miktar);
    event UsdcGecti(address indexed lehtar, uint256 miktar);
    event LehtarDegisti(address eski, address yeni);

    error KotuSure();
    error SifirAdres();
    error YetkiYok();

    constructor(address lehtar_, uint8 ay_, uint8 ucurumAy_) {
        if (lehtar_ == address(0)) revert SifirAdres();
        if (ay_ < ASGARI_AY || ay_ > AZAMI_AY || ucurumAy_ > ay_) revert KotuSure();
        fabrika = msg.sender;
        usdc = IKilitFabrikasi(msg.sender).usdc();
        turKaydi = IKilitFabrikasi(msg.sender).turKaydi();
        ay = ay_;
        ucurumAy = ucurumAy_;
        kurulus = uint64(block.timestamp);
        lehtar = lehtar_;
    }

    /* ------------------------------------------------------- views ---- */

    /// What has vested of `token` by time `t` (held + released, linear after the cliff).
    function hakEdilen(address token, uint64 t) public view returns (uint256) {
        uint64 b = baslangicOf[token];
        if (b == 0 || t < b + uint256(ucurumAy) * AY) return 0;
        uint256 toplam = IERC20(token).balanceOf(address(this)) + serbestOf[token];
        uint256 sure = uint256(ay) * AY;
        if (t >= b + sure) return toplam;
        return (toplam * (t - b)) / sure;
    }

    function cekilebilir(address token) public view returns (uint256) {
        if (token == address(usdc)) return usdc.balanceOf(address(this));
        return hakEdilen(token, uint64(block.timestamp)) - serbestOf[token];
    }

    function kilitli(address token) public view returns (uint256) {
        if (token == address(usdc)) return 0;
        return IERC20(token).balanceOf(address(this)) - cekilebilir(token);
    }

    function takvim(address token) external view returns (Takvim memory k) {
        k.baslangic = baslangicOf[token];
        if (k.baslangic != 0) {
            k.ucurumBitis = uint64(k.baslangic + uint256(ucurumAy) * AY);
            k.bitis = uint64(k.baslangic + uint256(ay) * AY);
        }
        k.serbest = serbestOf[token];
        k.toplam = IERC20(token).balanceOf(address(this)) + k.serbest;
        k.cekilebilir = cekilebilir(token);
        k.kilitli = kilitli(token);
    }

    /* ----------------------------------------------------- actions ---- */

    /// Anyone: starts `token`'s clock now, if the lock holds it and it has not started.
    function baslat(address token) public returns (uint64) {
        uint64 b = baslangicOf[token];
        if (b != 0 || token == address(usdc)) return b;
        uint256 bakiye = IERC20(token).balanceOf(address(this));
        if (bakiye == 0) return 0;
        b = uint64(block.timestamp);
        baslangicOf[token] = b;
        emit Basladi(token, b, bakiye);
        return b;
    }

    /// Anyone: what has vested of `token` goes to the beneficiary.
    function serbestBirak(address token) external returns (uint256 m) {
        if (token == address(usdc)) return usdcGecir();
        baslat(token);
        m = cekilebilir(token);
        if (m == 0) return 0;
        serbestOf[token] += m;
        address l = lehtar;
        IERC20(token).safeTransfer(l, m);
        emit SerbestBirakildi(token, l, m);
    }

    /// Anyone: the founder's USDC income is never locked; it goes straight on.
    function usdcGecir() public returns (uint256 m) {
        m = usdc.balanceOf(address(this));
        if (m == 0) return 0;
        address l = lehtar;
        usdc.safeTransfer(l, m);
        emit UsdcGecti(l, m);
    }

    function lehtarDegistir(address yeni) external {
        if (msg.sender != lehtar) revert YetkiYok();
        if (yeni == address(0) || yeni == address(this)) revert SifirAdres();
        emit LehtarDegisti(lehtar, yeni);
        lehtar = yeni;
    }

    /// The lock is the founder of record (TurKaydi.kurucuOf), so the
    /// beneficiary writes the token's type and description through it.
    function turYaz(address token, uint8 tur, string calldata bilgi) external {
        if (msg.sender != lehtar) revert YetkiYok();
        turKaydi.yaz(token, tur, bilgi);
    }
}

contract KilitFabrikasi {
    IERC20 public immutable usdc;
    ITurKaydiK public immutable turKaydi;

    mapping(address => bool) public kilitMi;

    event KilitKuruldu(address indexed kilit, address indexed lehtar, uint8 ay, uint8 ucurumAy, bytes32 tuz);
    error SifirAdres();

    constructor(IERC20 usdc_, ITurKaydiK turKaydi_) {
        if (address(usdc_) == address(0) || address(turKaydi_) == address(0)) revert SifirAdres();
        usdc = usdc_;
        turKaydi = turKaydi_;
    }

    function tuzOf(address lehtar, uint8 ay, uint8 ucurumAy, bytes32 tuz) public pure returns (bytes32) {
        return keccak256(abi.encode(lehtar, ay, ucurumAy, tuz));
    }

    /// The lock's address before it exists: put it as `kurucu` in the launch.
    function adresHesapla(address lehtar, uint8 ay, uint8 ucurumAy, bytes32 tuz) public view returns (address) {
        bytes32 kod = keccak256(abi.encodePacked(type(KurucuKilidi).creationCode, abi.encode(lehtar, ay, ucurumAy)));
        return Create2.computeAddress(tuzOf(lehtar, ay, ucurumAy, tuz), kod);
    }

    /// Anyone may deploy a lock (its terms are fixed by its address); the
    /// clocks of `tokenlar` already held start now.
    function kur(address lehtar, uint8 ay, uint8 ucurumAy, bytes32 tuz, address[] calldata tokenlar) external returns (address kilit) {
        kilit = address(new KurucuKilidi{ salt: tuzOf(lehtar, ay, ucurumAy, tuz) }(lehtar, ay, ucurumAy));
        kilitMi[kilit] = true;
        emit KilitKuruldu(kilit, lehtar, ay, ucurumAy, tuz);
        for (uint256 i = 0; i < tokenlar.length; i++) KurucuKilidi(kilit).baslat(tokenlar[i]);
    }
}
