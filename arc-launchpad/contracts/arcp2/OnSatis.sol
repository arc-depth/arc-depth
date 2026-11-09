// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20O {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IAciciO {
    function ac(uint160 sqrtPriceX96, int24 alt, int24 ust, uint256 miktar) external returns (uint256);
    function genislet(int24 yeniKenar, uint256 miktar) external returns (uint128);
    function paraKoy(int24 alt, int24 ust) external returns (uint128);
}

/// @title OnSatis — the second ARCP's presale, and the only way its pool opens.
///
/// THE RULES (owner, 9 Nov 2026)
///   250,000,000 ARCP for exactly 15,000 USDC, 10–250 USDC a wallet a
///   round. Rounds are 30 days and run back to back from deployment. A
///   round that does not reach 15,000 is refunded in full and the next one
///   starts by itself; nothing is kept from it.
///
/// THE MONEY NEVER REACHES A WALLET
///   When a round fills, `havuzuKur` — callable by anyone — sends the whole
///   15,000 to the pool opener and places it below the opening price as a
///   bid, then places the ladder above it. The opener can only put assets
///   into the pool and the hook refuses every removal, so from the moment
///   it is paid in, a dollar here can either go back to the buyer who sent
///   it or become locked liquidity. There is no third path and no owner.
///
/// IF OPENING EVER FAILS
///   A filled round that is not opened within KURULUM_MUHLETI is treated
///   as failed and refunded like any other. Without that, a pool that
///   could not open would hold 15,000 dollars nobody could reach.
///
/// THE BUYERS' TOKENS
///   Half when the pool opens, the other half linearly over 30 days. Before
///   the pool exists nobody holds ARCP at all, so nobody can trade or stake
///   ahead of the buyers.
contract OnSatis {
    IERC20O public immutable token;
    IERC20O public immutable usdc;
    IAciciO public immutable acici;

    uint256 public constant HEDEF = 15_000e6;
    uint256 public constant KISI_MIN = 10e6;
    uint256 public constant KISI_MAX = 250e6;
    uint256 public constant TUR_SURESI = 30 days;
    uint256 public constant KURULUM_MUHLETI = 7 days;
    uint256 public constant SERBEST_SURE = 30 days;
    uint256 public constant SATIS_TOKEN = 250_000_000e18;

    uint256 public immutable baslangic;

    /* The opening, fixed at construction so it can be read and checked
       before a single dollar arrives. */
    uint160 public immutable sqrtPriceX96;
    int24 public immutable icAlt;
    int24 public immutable icUst;
    uint256 public immutable icMiktar;
    int24 public immutable ortaKenar;
    uint256 public immutable ortaMiktar;
    int24 public immutable disKenar;
    int24 public immutable paraAlt;
    int24 public immutable paraUst;

    bool public dolu;
    uint256 public dolanTur;
    uint256 public dolmaZamani;
    bool public kuruldu;
    uint256 public acilisZamani;

    mapping(uint256 => uint256) public turToplam;
    mapping(uint256 => mapping(address => uint256)) public katki;
    mapping(uint256 => address[]) private _katilimcilar;
    mapping(uint256 => uint256) public iadeImleci;
    mapping(uint256 => uint256) public iadeEdilen;
    mapping(address => uint256) public alinanToken;

    event Katildi(uint256 indexed tur, address indexed alici, address odeyen, uint256 miktar, uint256 turToplam);
    event Doldu(uint256 indexed tur, uint256 zaman);
    event HavuzKuruldu(uint256 zaman, uint256 dolar);
    event IadeEdildi(uint256 indexed tur, address indexed alici, uint256 miktar);
    event TokenTeslim(address indexed alici, uint256 miktar);

    error Kapali();
    error Sifir();
    error AzMiktar();
    error IadeYok();
    error TransferOlmadi();
    error KurulamazDurum();

    constructor(
        IERC20O _token,
        IERC20O _usdc,
        IAciciO _acici,
        uint160 _sqrtPriceX96,
        int24[6] memory tikler,      // icAlt, icUst, ortaKenar, disKenar, paraAlt, paraUst
        uint256 _icMiktar,
        uint256 _ortaMiktar,
        uint256 _baslangic
    ) {
        token = _token;
        usdc = _usdc;
        acici = _acici;
        sqrtPriceX96 = _sqrtPriceX96;
        icAlt = tikler[0];
        icUst = tikler[1];
        ortaKenar = tikler[2];
        disKenar = tikler[3];
        paraAlt = tikler[4];
        paraUst = tikler[5];
        icMiktar = _icMiktar;
        ortaMiktar = _ortaMiktar;
        baslangic = _baslangic == 0 ? block.timestamp : _baslangic;
    }

    /* ---- rounds ------------------------------------------------------ */

    /// The round running now. Rounds follow each other with no gap, so the
    /// clock alone says which one it is; nobody has to start the next.
    function tur() public view returns (uint256) {
        return (block.timestamp - baslangic) / TUR_SURESI;
    }

    function turBitis(uint256 t) public view returns (uint256) {
        return baslangic + (t + 1) * TUR_SURESI;
    }

    function katilimciSayisi(uint256 t) external view returns (uint256) {
        return _katilimcilar[t].length;
    }

    function katilimci(uint256 t, uint256 i) external view returns (address) {
        return _katilimcilar[t][i];
    }

    /// A filled round that did not open in time.
    function basarisiz() public view returns (bool) {
        return dolu && !kuruldu && block.timestamp > dolmaZamani + KURULUM_MUHLETI;
    }

    /// Whether round `t`'s money goes back.
    function iadeli(uint256 t) public view returns (bool) {
        if (dolu && t == dolanTur) return basarisiz();
        return t < tur();
    }

    /* ---- buying ------------------------------------------------------ */

    function al(uint256 miktar) external returns (uint256) {
        return _al(msg.sender, miktar);
    }

    /// Buy for somebody else: a bridge or relay that delivers dollars on
    /// Arc pays, the buyer named here owns the share and any refund.
    function alAdina(address alici, uint256 miktar) external returns (uint256) {
        if (alici == address(0)) revert Sifir();
        return _al(alici, miktar);
    }

    /// Takes at most what is left in the round and what the wallet may
    /// still add, so the round closes on exactly 15,000 and the last buyer
    /// is never refused for overshooting it.
    function _al(address alici, uint256 miktar) internal returns (uint256 m) {
        if (dolu) revert Kapali();
        uint256 t = tur();
        uint256 kalan = HEDEF - turToplam[t];
        uint256 onceki = katki[t][alici];
        uint256 kisiKalan = KISI_MAX - onceki;
        m = miktar;
        if (m > kalan) m = kalan;
        if (m > kisiKalan) m = kisiKalan;
        if (m == 0) revert Sifir();
        /* the floor, except for the purchase that closes the round */
        if (onceki + m < KISI_MIN && m != kalan) revert AzMiktar();

        if (!usdc.transferFrom(msg.sender, address(this), m)) revert TransferOlmadi();
        if (onceki == 0) _katilimcilar[t].push(alici);
        katki[t][alici] = onceki + m;
        uint256 yeni = turToplam[t] + m;
        turToplam[t] = yeni;
        emit Katildi(t, alici, msg.sender, m, yeni);

        if (yeni == HEDEF) {
            dolu = true;
            dolanTur = t;
            dolmaZamani = block.timestamp;
            emit Doldu(t, block.timestamp);
        }
    }

    /* ---- opening ----------------------------------------------------- */

    /// Open the pool with the round's money. Anyone may call it, once.
    function havuzuKur() external {
        if (!dolu || kuruldu || basarisiz()) revert KurulamazDurum();
        kuruldu = true;
        acilisZamani = block.timestamp;

        /* the ladder first: it is what sets the price */
        acici.ac(sqrtPriceX96, icAlt, icUst, icMiktar);
        acici.genislet(ortaKenar, ortaMiktar);
        acici.genislet(disKenar, 0);
        /* then the dollars, below the opening */
        if (!usdc.transfer(address(acici), HEDEF)) revert TransferOlmadi();
        acici.paraKoy(paraAlt, paraUst);
        emit HavuzKuruldu(block.timestamp, HEDEF);
    }

    /* ---- refunds ----------------------------------------------------- */

    /// Take your own refund for round `t`.
    function iadeAl(uint256 t) external returns (uint256) {
        if (!iadeli(t)) revert IadeYok();
        uint256 m = katki[t][msg.sender];
        if (m == 0) revert IadeYok();
        katki[t][msg.sender] = 0;
        iadeEdilen[t] += m;
        if (!usdc.transfer(msg.sender, m)) revert TransferOlmadi();
        emit IadeEdildi(t, msg.sender, m);
        return m;
    }

    /// Send round `t`'s refunds to the next `adet` buyers. Anyone may call
    /// it; the money can only go to the buyer who sent it. A transfer that
    /// fails (a blocked address) is skipped and stays claimable, so one
    /// bad recipient cannot stop everyone else's refund.
    function iadeGonder(uint256 t, uint256 adet) external returns (uint256 gonderilen) {
        if (!iadeli(t)) revert IadeYok();
        address[] storage liste = _katilimcilar[t];
        uint256 i = iadeImleci[t];
        uint256 son = i + adet;
        if (son > liste.length) son = liste.length;
        for (; i < son; ++i) {
            address a = liste[i];
            uint256 m = katki[t][a];
            if (m == 0) continue;
            katki[t][a] = 0;
            (bool ok, bytes memory r) = address(usdc).call(abi.encodeCall(IERC20O.transfer, (a, m)));
            if (ok && (r.length == 0 || abi.decode(r, (bool)))) {
                iadeEdilen[t] += m;
                gonderilen += m;
                emit IadeEdildi(t, a, m);
            } else {
                katki[t][a] = m;
            }
        }
        iadeImleci[t] = i;
    }

    /* ---- the buyers' ARCP -------------------------------------------- */

    function hak(address a) public view returns (uint256) {
        if (!kuruldu) return 0;
        return (katki[dolanTur][a] * SATIS_TOKEN) / HEDEF;
    }

    /// Unlocked so far: half at the opening, the rest over SERBEST_SURE.
    function serbest(address a) public view returns (uint256) {
        uint256 h = hak(a);
        if (h == 0) return 0;
        uint256 gecen = block.timestamp - acilisZamani;
        if (gecen >= SERBEST_SURE) return h;
        uint256 yari = h / 2;
        return yari + ((h - yari) * gecen) / SERBEST_SURE;
    }

    function alinabilir(address a) public view returns (uint256) {
        uint256 s = serbest(a);
        uint256 al_ = alinanToken[a];
        return s > al_ ? s - al_ : 0;
    }

    /// Deliver `a`'s unlocked ARCP. Anyone may trigger it; it only ever
    /// pays `a`.
    function teslimEt(address a) external returns (uint256 m) {
        m = alinabilir(a);
        if (m == 0) revert Sifir();
        alinanToken[a] += m;
        if (!token.transfer(a, m)) revert TransferOlmadi();
        emit TokenTeslim(a, m);
    }
}
