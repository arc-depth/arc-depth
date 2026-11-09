// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20G {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IAcilisG {
    function acilisZamani() external view returns (uint256);
}

interface IStakeG {
    function stakedOf(address who) external view returns (uint256);
}

/// @title Dagitici — airdrop rounds and the weekly tweet rewards, by Merkle root.
///
/// HOW IT IS USED
///   Two of these are deployed: one for the usage airdrop (60,000,000 in a
///   few large rounds) and one for tweet rewards (40,000,000, weekly). Each
///   round's list is computed off chain from public data only — on-chain
///   activity, or posts that carry the wallet's own code — and committed
///   here as a root. Nothing about anyone is stored anywhere but the list
///   of addresses and amounts, which is public by design.
///
/// WHAT THE ROUND-SETTER CANNOT DO
///   `yonetici` posts roots, nothing else. A root is capped (turSiniri), may
///   not come sooner than `aralik` after the previous one, and the sum of
///   all roots can never pass the allocation. So even a compromised key can
///   only misdirect one capped round before it is noticed.
///
/// HALF NOW, HALF FOR HOLDING
///   The first claim pays half. The rest can be taken 30 days later, if the
///   wallet still holds (in hand or staked) at least the first half — the
///   reward is for staying, not for selling the same day. Nothing pays
///   before the pool opens, so tweets during the presale earn tokens that
///   arrive at the opening.
///
/// UNCLAIMED ROUNDS
///   180 days after a round, whatever nobody claimed returns to the
///   allocation for later rounds instead of sitting there forever.
contract Dagitici {
    uint256 public constant TUTMA = 30 days;
    uint256 public constant GERI_KAZANMA = 180 days;

    IERC20G public immutable token;
    IAcilisG public immutable kaynak;
    IStakeG public immutable stake;
    uint256 public immutable havuz;
    uint256 public immutable turSiniri;
    uint256 public immutable aralik;

    address public yonetici;
    uint256 public ayrilan;
    uint256 public sonTurZamani;

    struct Tur {
        bytes32 kok;
        uint64 zaman;
        bool geriAlindi;
        uint256 toplam;
        uint256 odenen;
    }

    Tur[] public turlar;
    mapping(uint256 => mapping(address => uint256)) public alinan;
    mapping(uint256 => mapping(address => uint256)) public ilkTalep;

    event TurAcildi(uint256 indexed tur, bytes32 kok, uint256 toplam);
    event Talep(uint256 indexed tur, address indexed kim, uint256 miktar, bool ikinciYari);
    event GeriKazanildi(uint256 indexed tur, uint256 miktar);
    event YoneticiDegisti(address eski, address yeni);

    error SadeceYonetici();
    error SinirAsildi();
    error Erken();
    error KotuKanit();
    error HenuzYok();
    error TransferOlmadi();

    constructor(
        IERC20G _token,
        IAcilisG _kaynak,
        IStakeG _stake,
        uint256 _havuz,
        uint256 _turSiniri,
        uint256 _aralik,
        address _yonetici
    ) {
        token = _token;
        kaynak = _kaynak;
        stake = _stake;
        havuz = _havuz;
        turSiniri = _turSiniri;
        aralik = _aralik;
        yonetici = _yonetici;
    }

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert SadeceYonetici();
        _;
    }

    function yoneticiDegistir(address yeni) external sadeceYonetici {
        if (yeni == address(0)) revert SadeceYonetici();
        emit YoneticiDegisti(yonetici, yeni);
        yonetici = yeni;
    }

    function turSayisi() external view returns (uint256) {
        return turlar.length;
    }

    function turAc(bytes32 kok, uint256 toplam) external sadeceYonetici returns (uint256 id) {
        if (toplam == 0 || toplam > turSiniri || ayrilan + toplam > havuz) revert SinirAsildi();
        if (turlar.length > 0 && block.timestamp < sonTurZamani + aralik) revert Erken();
        ayrilan += toplam;
        sonTurZamani = block.timestamp;
        id = turlar.length;
        turlar.push(Tur(kok, uint64(block.timestamp), false, toplam, 0));
        emit TurAcildi(id, kok, toplam);
    }

    function yaprak(uint256 t, address kim, uint256 miktar) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(t, kim, miktar))));
    }

    function _dogrula(bytes32[] calldata kanit, bytes32 kok, bytes32 y) internal pure returns (bool) {
        bytes32 h = y;
        for (uint256 i; i < kanit.length; ++i) {
            bytes32 k = kanit[i];
            h = h < k ? keccak256(abi.encode(h, k)) : keccak256(abi.encode(k, h));
        }
        return h == kok;
    }

    /// Claim `kim`'s share of round `t`. Anyone may submit it; the tokens
    /// only ever go to `kim`. The first call pays half, a call 30 days
    /// later pays the rest if `kim` still holds the first half.
    function talep(uint256 t, address kim, uint256 miktar, bytes32[] calldata kanit) external returns (uint256 m) {
        if (kaynak.acilisZamani() == 0) revert HenuzYok();
        Tur storage r = turlar[t];
        if (r.geriAlindi) revert HenuzYok();
        if (!_dogrula(kanit, r.kok, yaprak(t, kim, miktar))) revert KotuKanit();

        uint256 once = alinan[t][kim];
        bool ikinci = once > 0;
        if (!ikinci) {
            m = miktar / 2;
            if (m == 0) m = miktar;
            ilkTalep[t][kim] = block.timestamp;
        } else {
            if (once >= miktar) revert HenuzYok();
            if (block.timestamp < ilkTalep[t][kim] + TUTMA) revert Erken();
            uint256 elde = token.balanceOf(kim);
            if (address(stake) != address(0)) elde += stake.stakedOf(kim);
            if (elde < once) revert HenuzYok();
            m = miktar - once;
        }
        alinan[t][kim] = once + m;
        r.odenen += m;
        if (!token.transfer(kim, m)) revert TransferOlmadi();
        emit Talep(t, kim, m, ikinci);
    }

    /// After 180 days, what round `t` did not pay returns to the allocation.
    function geriKazan(uint256 t) external {
        Tur storage r = turlar[t];
        if (r.geriAlindi || block.timestamp < r.zaman + GERI_KAZANMA) revert Erken();
        r.geriAlindi = true;
        uint256 kalan = r.toplam - r.odenen;
        ayrilan -= kalan;
        emit GeriKazanildi(t, kalan);
    }
}
