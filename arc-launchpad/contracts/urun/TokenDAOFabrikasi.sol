// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

/* ===========================================================================
 * TokenDAOFabrikasi / TokenDAO — a launched token's holders run a treasury
 *
 * Owner, 1 Nov 2026: a DAO (TurKaydi type 5) launches like everything else,
 * same rules, same fees. This adds the voting and the shared treasury.
 *
 * VOTING WITHOUT CHECKPOINTS: LOCK TO VOTE
 *   Launch tokens are plain ERC-20 (no ERC20Votes), so a balance read at
 *   vote time could be voted, moved and voted again. Here a holder deposits
 *   tokens to get voting power; a vote counts the deposit at that moment and
 *   the deposit cannot be withdrawn until every proposal the holder voted on
 *   (or made) has finished voting. Moving tokens to a second address to vote
 *   twice is impossible, and so is a flash loan (it cannot be repaid in the
 *   same transaction).
 *
 * PROPOSALS
 *   Up to 10 calls from the treasury (this contract). Voting starts at once
 *   and lasts `oySuresi`; it passes with more yes than no and yes+no+abstain
 *   at least the quorum (a % of total supply, or of the deposits, measured
 *   when the proposal was made). Then `zamanKilidi` passes, then anyone
 *   executes it within 14 days. Execution can never touch the deposits: the
 *   contract must still hold every deposited token afterwards, and a call to
 *   the DAO's own token may only be transfer() (an approve() could pull the
 *   deposits later, outside execution). The DAO can
 *   change its own settings by proposal, within the same bounds.
 *
 * THE TREASURY AND THE LAUNCH
 *   The DAO's address is a CREATE2 address that depends only on (founder,
 *   salt), so a founder can launch with kurucu = that address: the founder
 *   share of tokens and the founder's USDC trading income both land in the
 *   treasury, and it is created after the launch.
 *
 * WHO MAY CREATE IT
 *   The token's founder of record (TurKaydi.kurucuOf), one DAO per token;
 *   or, when the founder of record is the DAO address itself, the founder
 *   whose (address, salt) gives that address. No owner, no admin, no fee.
 * =========================================================================== */

interface ITurKaydiD {
    function kurucuOf(address token) external view returns (address);
    function yazildi(address token) external view returns (bool);
    function yaz(address token, uint8 tur, string calldata bilgi) external;
}

contract TokenDAO is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Ayar {
        uint32 oySuresi;            // seconds of voting
        uint32 zamanKilidi;         // seconds between the end of voting and execution
        uint16 yeterSayiBps;        // quorum, basis points
        bool yeterSayiYatirilandan; // quorum of the deposits (true) or of total supply (false)
        uint16 oneriEsigiBps;       // deposit needed to propose, basis points of total supply
    }

    enum Durum { Yok, Aktif, Reddedildi, Bekliyor, Hazir, Uygulandi, Iptal, SuresiDoldu }

    struct Oneri {
        address oneren;
        uint64 oyBitis;
        uint64 uygulanabilir;   // oyBitis + timelock, fixed when proposed
        bool uygulandi;
        bool iptal;
        uint256 yeterSayi;
        uint256 evet;
        uint256 hayir;
        uint256 cekimser;
        bytes32 eylemHash;
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant UYGULAMA_SURESI = 14 days;
    uint256 public constant AZAMI_EYLEM = 10;
    uint32 public constant ASGARI_OY = 1 days;
    uint32 public constant AZAMI_OY = 30 days;
    uint32 public constant ASGARI_KILIT = 1 hours;
    uint32 public constant AZAMI_KILIT = 30 days;
    uint16 public constant ASGARI_YETER = 100;    // 1%
    uint16 public constant AZAMI_YETER = 5_000;   // 50%
    uint16 public constant AZAMI_ESIK = 500;      // 5%

    address public immutable fabrika;
    IERC20 public token;
    Ayar public ayar;

    uint256 public toplamYatirilan;
    mapping(address => uint256) public yatirilan;
    /// a deposit cannot leave before this time (the end of the last vote it is in)
    mapping(address => uint64) public kilitBitis;

    uint256 public oneriSayisi;
    mapping(uint256 => Oneri) public oneriler;
    mapping(uint256 => mapping(address => bool)) public oyVerdi;

    event Basladi(address indexed token, Ayar ayar);
    event AyarDegisti(Ayar ayar);
    event Yatirildi(address indexed kim, uint256 miktar);
    event Cekildi(address indexed kim, uint256 miktar);
    event OneriYapildi(uint256 indexed id, address indexed oneren, address[] hedefler, uint256[] degerler, bytes[] veriler,
        string aciklama, uint64 oyBitis, uint64 uygulanabilir, uint256 yeterSayi);
    event OyVerildi(uint256 indexed id, address indexed kim, uint8 destek, uint256 agirlik);
    event Uygulandi(uint256 indexed id);
    event IptalEdildi(uint256 indexed id);

    error SadeceFabrika();
    error SadeceDAO();
    error ZatenBasladi();
    error KotuAyar();
    error Az();
    error Kilitli(uint64 bitis);
    error EsikAlti(uint256 yatirilan, uint256 esik);
    error KotuEylem();
    error KotuDurum(Durum d);
    error ZatenOyVerdi();
    error KotuDestek();
    error YetkiYok();
    error YatirilanaDokunuldu();
    error YalnizTransfer(uint256 i);
    error CagriBasarisiz(uint256 i, bytes sebep);

    constructor() { fabrika = msg.sender; }

    receive() external payable {}

    /// Only the factory, once, in the transaction that creates the DAO.
    function baslat(IERC20 token_, Ayar calldata a, ITurKaydiD turKaydi, string calldata bilgi) external {
        if (msg.sender != fabrika) revert SadeceFabrika();
        if (address(token) != address(0)) revert ZatenBasladi();
        _ayarDenetle(a);
        token = token_;
        ayar = a;
        emit Basladi(address(token_), a);
        /* launched with kurucu = this DAO: the DAO is the founder of record and writes type 5 (DAO) */
        if (turKaydi.kurucuOf(address(token_)) == address(this) && !turKaydi.yazildi(address(token_))) {
            try turKaydi.yaz(address(token_), 5, bilgi) {} catch {}
        }
    }

    /// The DAO itself, by proposal: new settings within the same bounds.
    function ayarDegistir(Ayar calldata a) external {
        if (msg.sender != address(this)) revert SadeceDAO();
        _ayarDenetle(a);
        ayar = a;
        emit AyarDegisti(a);
    }

    function _ayarDenetle(Ayar calldata a) internal pure {
        if (a.oySuresi < ASGARI_OY || a.oySuresi > AZAMI_OY) revert KotuAyar();
        if (a.zamanKilidi < ASGARI_KILIT || a.zamanKilidi > AZAMI_KILIT) revert KotuAyar();
        if (a.yeterSayiBps < ASGARI_YETER || a.yeterSayiBps > AZAMI_YETER) revert KotuAyar();
        if (a.oneriEsigiBps > AZAMI_ESIK) revert KotuAyar();
    }

    /* --------------------------------------------------- deposits ---- */

    function yatir(uint256 miktar) external nonReentrant {
        if (miktar == 0) revert Az();
        uint256 once = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), miktar);
        uint256 gelen = token.balanceOf(address(this)) - once;
        yatirilan[msg.sender] += gelen;
        toplamYatirilan += gelen;
        emit Yatirildi(msg.sender, gelen);
    }

    function cek(uint256 miktar) external nonReentrant {
        uint64 b = kilitBitis[msg.sender];
        if (block.timestamp < b) revert Kilitli(b);
        if (miktar == 0 || miktar > yatirilan[msg.sender]) revert Az();
        yatirilan[msg.sender] -= miktar;
        toplamYatirilan -= miktar;
        token.safeTransfer(msg.sender, miktar);
        emit Cekildi(msg.sender, miktar);
    }

    /* -------------------------------------------------- proposals ---- */

    function oneriEsigi() public view returns (uint256 e) {
        e = (token.totalSupply() * ayar.oneriEsigiBps) / BPS;
        if (e == 0) e = 1;
    }

    function eylemHashi(address[] calldata hedefler, uint256[] calldata degerler, bytes[] calldata veriler) public pure returns (bytes32) {
        return keccak256(abi.encode(hedefler, degerler, veriler));
    }

    function oneriVer(address[] calldata hedefler, uint256[] calldata degerler, bytes[] calldata veriler, string calldata aciklama)
        external nonReentrant returns (uint256 id)
    {
        uint256 n = hedefler.length;
        if (n == 0 || n > AZAMI_EYLEM || degerler.length != n || veriler.length != n) revert KotuEylem();
        /* the DAO's own token: only transfer(). An approve() would leave the
           balance whole at execution and let the spender pull the deposits later. */
        for (uint256 i = 0; i < n; i++) {
            if (hedefler[i] == address(token) && (veriler[i].length < 4 || bytes4(veriler[i][:4]) != IERC20.transfer.selector)) revert YalnizTransfer(i);
        }
        uint256 esik = oneriEsigi();
        if (yatirilan[msg.sender] < esik) revert EsikAlti(yatirilan[msg.sender], esik);
        Ayar memory a = ayar;
        uint256 taban = a.yeterSayiYatirilandan ? toplamYatirilan : token.totalSupply();
        uint256 yeter = (taban * a.yeterSayiBps) / BPS;
        if (yeter == 0) yeter = 1;
        uint64 bitis = uint64(block.timestamp + a.oySuresi);
        uint64 uygulanabilir = bitis + a.zamanKilidi;
        id = ++oneriSayisi;
        Oneri storage o = oneriler[id];
        o.oneren = msg.sender;
        o.oyBitis = bitis;
        o.uygulanabilir = uygulanabilir;
        o.yeterSayi = yeter;
        o.eylemHash = eylemHashi(hedefler, degerler, veriler);
        /* the proposer's deposit stays for the vote, like a voter's */
        if (kilitBitis[msg.sender] < bitis) kilitBitis[msg.sender] = bitis;
        emit OneriYapildi(id, msg.sender, hedefler, degerler, veriler, aciklama, bitis, uygulanabilir, yeter);
    }

    function durum(uint256 id) public view returns (Durum) {
        Oneri storage o = oneriler[id];
        if (o.oneren == address(0)) return Durum.Yok;
        if (o.iptal) return Durum.Iptal;
        if (o.uygulandi) return Durum.Uygulandi;
        if (block.timestamp < o.oyBitis) return Durum.Aktif;
        if (o.evet <= o.hayir || o.evet + o.hayir + o.cekimser < o.yeterSayi) return Durum.Reddedildi;
        if (block.timestamp < o.uygulanabilir) return Durum.Bekliyor;
        if (block.timestamp <= o.uygulanabilir + UYGULAMA_SURESI) return Durum.Hazir;
        return Durum.SuresiDoldu;
    }

    /// destek: 0 no, 1 yes, 2 abstain. Weight: the whole deposit now; it stays until voting ends.
    function oyVer(uint256 id, uint8 destek) external nonReentrant {
        Durum d = durum(id);
        if (d != Durum.Aktif) revert KotuDurum(d);
        if (destek > 2) revert KotuDestek();
        if (oyVerdi[id][msg.sender]) revert ZatenOyVerdi();
        uint256 w = yatirilan[msg.sender];
        if (w == 0) revert Az();
        oyVerdi[id][msg.sender] = true;
        Oneri storage o = oneriler[id];
        if (destek == 1) o.evet += w;
        else if (destek == 0) o.hayir += w;
        else o.cekimser += w;
        if (kilitBitis[msg.sender] < o.oyBitis) kilitBitis[msg.sender] = o.oyBitis;
        emit OyVerildi(id, msg.sender, destek, w);
    }

    /// Anyone, once the timelock has passed: the calls, from the treasury.
    function uygula(uint256 id, address[] calldata hedefler, uint256[] calldata degerler, bytes[] calldata veriler)
        external payable nonReentrant
    {
        Durum d = durum(id);
        if (d != Durum.Hazir) revert KotuDurum(d);
        Oneri storage o = oneriler[id];
        if (eylemHashi(hedefler, degerler, veriler) != o.eylemHash) revert KotuEylem();
        o.uygulandi = true;
        for (uint256 i = 0; i < hedefler.length; i++) {
            (bool basarili, bytes memory sebep) = hedefler[i].call{ value: degerler[i] }(veriler[i]);
            if (!basarili) revert CagriBasarisiz(i, sebep);
        }
        if (token.balanceOf(address(this)) < toplamYatirilan) revert YatirilanaDokunuldu();
        emit Uygulandi(id);
    }

    /// The proposer, while voting is open.
    function iptal(uint256 id) external {
        Oneri storage o = oneriler[id];
        if (msg.sender != o.oneren) revert YetkiYok();
        Durum d = durum(id);
        if (d != Durum.Aktif) revert KotuDurum(d);
        o.iptal = true;
        emit IptalEdildi(id);
    }

    /// Treasury holdings of the DAO's own token (what is not a deposit).
    function hazineToken() external view returns (uint256) {
        return token.balanceOf(address(this)) - toplamYatirilan;
    }
}

contract TokenDAOFabrikasi {
    ITurKaydiD public immutable turKaydi;
    bytes32 public immutable kodHash;

    mapping(address => address) public daoOf;    // token -> DAO
    mapping(address => address) public tokenOf;  // DAO -> token

    event DAOKuruldu(address indexed token, address indexed dao, address indexed kurucu, bytes32 tuz);
    error SifirAdres();
    error ZatenVar(address dao);
    error YetkiYok();

    constructor(ITurKaydiD turKaydi_) {
        if (address(turKaydi_) == address(0)) revert SifirAdres();
        turKaydi = turKaydi_;
        kodHash = keccak256(type(TokenDAO).creationCode);
    }

    function tuzOf(address kurucu, bytes32 tuz) public pure returns (bytes32) {
        return keccak256(abi.encode(kurucu, tuz));
    }

    /// The DAO's address before it exists: put it as `kurucu` in the launch
    /// to send the founder share and the founder's income to the treasury.
    function adresHesapla(address kurucu, bytes32 tuz) public view returns (address) {
        return Create2.computeAddress(tuzOf(kurucu, tuz), kodHash);
    }

    function kur(IERC20 token, bytes32 tuz, TokenDAO.Ayar calldata ayar, string calldata bilgi) external returns (address dao) {
        if (daoOf[address(token)] != address(0)) revert ZatenVar(daoOf[address(token)]);
        address k = turKaydi.kurucuOf(address(token));
        if (k == address(0) || (k != msg.sender && k != adresHesapla(msg.sender, tuz))) revert YetkiYok();
        dao = address(new TokenDAO{ salt: tuzOf(msg.sender, tuz) }());
        daoOf[address(token)] = dao;
        tokenOf[dao] = address(token);
        TokenDAO(payable(dao)).baslat(token, ayar, turKaydi, bilgi);
        emit DAOKuruldu(address(token), dao, msg.sender, tuz);
    }
}
