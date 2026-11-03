// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// The ERC-20 surface used here (Arc USDC at 0x3600…, 6 decimals, and the launched tokens).
interface IERC20L {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address from, address to, uint256 v) external returns (bool);
    function approve(address s, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// The two calls of MerkezKapi (contracts/merkez/v2/MerkezKapi.sol, the v8 and v9 gates) a fill uses.
interface IMerkezKapiL {
    function vekilOf(address token) external view returns (address);
    function al(address token, uint256 girdi, uint256 asgari, uint32 hedefEid, bytes32 alici, bytes calldata secenek, address iade)
        external payable returns (uint256);
    function satArc(address token, uint256 miktar, uint256 asgari, uint32 odemeZincir, bytes32 alici, uint256 maxUcret)
        external returns (uint256);
}

/**
 * @title LimitEmir — ARC PULSE limit orders on Arc, without a server
 * @notice A wallet escrows USDC (a buy order) or a launched token (a sell
 *         order) here with a minimum output and an expiry. The minimum output
 *         IS the limit price: "spend 100 USDC, receive at least 1,000,000
 *         tokens" fills only at 0.0001 USDC per token or better, every pool
 *         fee, tax and this contract's fee and tip included.
 *
 *   - Anyone (a keeper, scripts/limit-bekci.js, or the owner themself) calls
 *     doldur(id) when the pool can pay it. The trade goes through the same
 *     MerkezKapi that launched the token (v8 or v9, chosen at placing and
 *     stored in the order), so it pays the same pool fees as any trade.
 *   - The contract measures what it actually received and reverts unless the
 *     owner gets at least `asgari`. A keeper cannot fill below the limit: a
 *     price pushed against the order in the same block only makes the fill
 *     revert. (A keeper that moves the price can at most take the surplus
 *     ABOVE the limit; the owner always gets the limit or better.)
 *   - The keeper earns `bahsis`, a fixed tip in USDC the owner chose at
 *     placing: at least `asgariBahsis`, at most BAHSIS_AZAMI ($1) and at most
 *     5% of the order's USDC side.
 *   - The owner cancels at any time and gets the deposit back in full (no fee,
 *     no tip). After the expiry anyone may send an unfilled deposit back to
 *     its owner (the same call).
 *   - Platform fee on fills only, `ucretBps` of the order's USDC (default
 *     0.20%, at most UCRET_TAVAN_BPS = 1%), fixed into each order when it is
 *     placed: a later change never touches an open order. It is split like
 *     every ARC PULSE product fee: ARCP buy-and-burn (FthmYakici), the ARCP
 *     DAO developer fund (DevPool), marketing, and the owner's share.
 *
 *   Admin (yonetici, two-step transferable, later the ARCP DAO governor):
 *   the fee (capped), the minimum tip (capped), the split and its wallets.
 *   It cannot move, freeze or redirect any order; `kurtar` can only send what
 *   is here BEYOND every open order's deposit (USDC sent here by mistake).
 *   No list of users is kept beyond the orders themselves (public chain data).
 */
contract LimitEmir {
    uint32 public constant ARC_DOMAIN = 26;              // Circle's domain for Arc: satArc pays here
    uint256 public constant UCRET_TAVAN_BPS = 100;       // fee at most 1.00%
    uint256 public constant BAHSIS_AZAMI = 1e6;          // a tip is at most $1
    uint256 public constant BAHSIS_ORAN_TAVAN_BPS = 500; // and at most 5% of the order's USDC side
    uint256 public constant ASGARI_ALIM = 1e6;           // a buy order escrows at least $1
    uint256 public constant SURE_AZAMI = 365 days;

    uint8 public constant ACIK = 1;
    uint8 public constant DOLDU = 2;
    uint8 public constant IPTAL = 3;

    IERC20L public immutable usdc;
    IMerkezKapiL public immutable kapiV8;
    IMerkezKapiL public immutable kapiV9;

    address public yonetici;
    address public bekleyenYonetici;

    uint16 public ucretBps = 20;          // 0.20%
    uint64 public asgariBahsis = 20_000;  // $0.02

    /* the fee split, in parts of 10,000; the owner's share is the rest */
    address public yakici;        // FthmYakici: buys ARCP with its dollars and burns it
    address public gelistirici;   // DevPool: the ARCP DAO's developer fund
    address public pazarlama;     // marketing
    address public sahip;         // the owner's share
    uint16 public yakimPay = 3000;
    uint16 public gelistiriciPay = 3000;
    uint16 public pazarlamaPay = 2000;

    struct Emir {
        address sahip;       // who placed it, and who receives everything
        uint40 bitis;        // fills only until this time
        uint16 ucretBps;     // the fee in force when it was placed
        uint8 durum;         // 1 open, 2 filled, 3 cancelled / returned
        bool alim;           // true: USDC -> token; false: token -> USDC
        address token;
        uint64 bahsis;       // the keeper's tip, USDC (6 decimals)
        address kapi;        // the MerkezKapi that launched the token
        uint128 girdi;       // escrowed: USDC (buy) or tokens (sell)
        uint128 asgari;      // the least the owner receives: tokens (buy) or USDC (sell), net of everything
    }

    uint256 public emirSayisi;
    mapping(uint256 => Emir) private _emir;
    /// asset -> what open orders hold of it (USDC for buys, each token for sells)
    mapping(address => uint256) public emanet;

    uint256 private _kilit = 1;

    event EmirVerildi(uint256 indexed id, address indexed sahip, address indexed token, bool alim, uint256 girdi, uint256 asgari,
        uint256 bahsis, uint40 bitis, uint16 ucretBps, address kapi);
    event EmirDolduruldu(uint256 indexed id, address indexed sahip, address indexed bekci, uint256 cikti, uint256 iade,
        uint256 ucret, uint256 bahsis);
    event EmirKapandi(uint256 indexed id, address indexed sahip, bool sureDoldu);
    event UcretDagitildi(uint256 yakim, uint256 gelistirici, uint256 pazarlama, uint256 sahip);
    event AyarDegisti(bytes32 indexed ad, uint256 deger);
    event AliciDegisti(bytes32 indexed ad, address alici);
    event Kurtarildi(address indexed varlik, address indexed kime, uint256 miktar);
    event YoneticiOnerildi(address yeni);
    event YoneticiDegisti(address eski, address yeni);

    error YetkiYok();
    error SifirAdres();
    error KotuDeger();
    error BilinmeyenToken();
    error KotuSure();
    error KotuBahsis();
    error AzGirdi();
    error EmirAcikDegil();
    error SuresiDoldu();
    error AzCikti(uint256 cikti, uint256 asgari);
    error TransferOlmadi();
    error Kilitli();

    modifier sadeceYonetici() {
        if (msg.sender != yonetici) revert YetkiYok();
        _;
    }

    modifier kilitli() {
        if (_kilit != 1) revert Kilitli();
        _kilit = 2;
        _;
        _kilit = 1;
    }

    constructor(address usdc_, address kapiV8_, address kapiV9_, address yakici_, address gelistirici_, address pazarlama_,
        address sahip_, address yonetici_)
    {
        if (usdc_ == address(0) || kapiV8_ == address(0) || kapiV9_ == address(0) || yakici_ == address(0) || gelistirici_ == address(0)
            || pazarlama_ == address(0) || sahip_ == address(0) || yonetici_ == address(0)) revert SifirAdres();
        usdc = IERC20L(usdc_);
        kapiV8 = IMerkezKapiL(kapiV8_);
        kapiV9 = IMerkezKapiL(kapiV9_);
        yakici = yakici_;
        gelistirici = gelistirici_;
        pazarlama = pazarlama_;
        sahip = sahip_;
        yonetici = yonetici_;
        emit YoneticiDegisti(address(0), yonetici_);
    }

    /// Arc's native balance is its USDC: a gate's leftover native refund lands here as USDC.
    receive() external payable {}

    /* ------------------------------------------------------------ views */

    function emir(uint256 id) external view returns (Emir memory) {
        return _emir[id];
    }

    /// Orders [bas, bas + adet) (clipped to emirSayisi): what a keeper scans.
    function emirler(uint256 bas, uint256 adet) external view returns (Emir[] memory e) {
        uint256 son = bas + adet > emirSayisi ? emirSayisi : bas + adet;
        if (bas >= son) return e;
        e = new Emir[](son - bas);
        for (uint256 i = bas; i < son; ++i) e[i - bas] = _emir[i];
    }

    /// The gate that launched `token` (v9 first), or zero.
    function kapiOf(address token) public view returns (address) {
        if (kapiV9.vekilOf(token) != address(0)) return address(kapiV9);
        if (kapiV8.vekilOf(token) != address(0)) return address(kapiV8);
        return address(0);
    }

    /// For a sell order: the least the pool must pay for the owner to net `asgari` after fee `bps` and `bahsis`.
    function brutAsgari(uint256 asgari, uint256 bahsis, uint256 bps) public pure returns (uint256) {
        return ((asgari + bahsis) * 10_000 + (10_000 - bps) - 1) / (10_000 - bps);
    }

    /* ------------------------------------------------------------ orders */

    /// Place an order. Buy (`alim`): escrows `girdi` USDC (approved to this contract), fills for at
    /// least `asgari` tokens. Sell: escrows `girdi` tokens, fills for at least `asgari` USDC.
    /// `bahsis`: the keeper's tip in USDC. `bitis`: unix time after which it no longer fills.
    function emirVer(address token, bool alim, uint256 girdi, uint256 asgari, uint256 bahsis, uint256 bitis)
        external kilitli returns (uint256 id)
    {
        if (token == address(0) || token == address(usdc)) revert BilinmeyenToken();
        address kapi = kapiOf(token);
        if (kapi == address(0)) revert BilinmeyenToken();
        if (girdi == 0 || asgari == 0 || girdi > type(uint128).max || asgari > type(uint128).max) revert AzGirdi();
        if (alim && girdi < ASGARI_ALIM) revert AzGirdi();
        if (bitis <= block.timestamp || bitis > block.timestamp + SURE_AZAMI) revert KotuSure();
        uint256 dolarYani = alim ? girdi : asgari;
        if (bahsis < asgariBahsis || bahsis > BAHSIS_AZAMI || bahsis * 10_000 > dolarYani * BAHSIS_ORAN_TAVAN_BPS) revert KotuBahsis();

        address varlik = alim ? address(usdc) : token;
        uint256 once = IERC20L(varlik).balanceOf(address(this));
        if (!IERC20L(varlik).transferFrom(msg.sender, address(this), girdi)) revert TransferOlmadi();
        if (IERC20L(varlik).balanceOf(address(this)) - once != girdi) revert TransferOlmadi();
        emanet[varlik] += girdi;

        id = emirSayisi++;
        uint16 bps = ucretBps;
        _emir[id] = Emir({
            sahip: msg.sender, bitis: uint40(bitis), ucretBps: bps, durum: ACIK, alim: alim, token: token,
            bahsis: uint64(bahsis), kapi: kapi, girdi: uint128(girdi), asgari: uint128(asgari)
        });
        emit EmirVerildi(id, msg.sender, token, alim, girdi, asgari, bahsis, uint40(bitis), bps, kapi);
    }

    /// The owner cancels at any time; after the expiry anyone may call it. The whole deposit goes back to the owner.
    function iptal(uint256 id) external kilitli {
        Emir storage e = _emir[id];
        if (e.durum != ACIK) revert EmirAcikDegil();
        bool sureDoldu = block.timestamp > e.bitis;
        if (msg.sender != e.sahip && !sureDoldu) revert YetkiYok();
        e.durum = IPTAL;
        address varlik = e.alim ? address(usdc) : e.token;
        emanet[varlik] -= e.girdi;
        _gonder(varlik, e.sahip, e.girdi);
        emit EmirKapandi(id, e.sahip, sureDoldu);
    }

    /// Fill order `id` in its pool. Anyone. Reverts unless the owner receives at least `asgari`.
    /// The tip goes to `bahsisAlici` (zero: the caller).
    function doldur(uint256 id, address bahsisAlici) external kilitli returns (uint256 cikti) {
        Emir memory e = _emir[id];
        if (e.durum != ACIK) revert EmirAcikDegil();
        if (block.timestamp > e.bitis) revert SuresiDoldu();
        _emir[id].durum = DOLDU;
        if (bahsisAlici == address(0)) bahsisAlici = msg.sender;

        uint256 ucret;
        uint256 iade;
        if (e.alim) {
            emanet[address(usdc)] -= e.girdi;
            uint256 net = uint256(e.girdi) - e.bahsis;
            ucret = net * e.ucretBps / 10_000;
            uint256 harca = net - ucret;
            uint256 dOnce = usdc.balanceOf(address(this));
            uint256 tOnce = IERC20L(e.token).balanceOf(address(this));
            if (!usdc.approve(e.kapi, harca)) revert TransferOlmadi();
            IMerkezKapiL(e.kapi).al(e.token, harca, e.asgari, 0, bytes32(uint256(uint160(address(this)))), "", address(this));
            if (!usdc.approve(e.kapi, 0)) revert TransferOlmadi();
            cikti = IERC20L(e.token).balanceOf(address(this)) - tOnce;
            if (cikti < e.asgari) revert AzCikti(cikti, e.asgari);
            /* a buy stopped short leaves dollars unspent: the gate sends them back here, they go to the owner */
            uint256 dSonra = usdc.balanceOf(address(this));
            uint256 harcanan = dOnce > dSonra ? dOnce - dSonra : 0;
            iade = harca > harcanan ? harca - harcanan : 0;
            _gonder(e.token, e.sahip, cikti);
            if (iade > 0) _gonder(address(usdc), e.sahip, iade);
        } else {
            emanet[e.token] -= e.girdi;
            uint256 dOnce = usdc.balanceOf(address(this));
            uint256 tOnce = IERC20L(e.token).balanceOf(address(this));
            if (!IERC20L(e.token).approve(e.kapi, e.girdi)) revert TransferOlmadi();
            IMerkezKapiL(e.kapi).satArc(e.token, e.girdi, brutAsgari(e.asgari, e.bahsis, e.ucretBps), ARC_DOMAIN,
                bytes32(uint256(uint160(address(this)))), 0);
            if (!IERC20L(e.token).approve(e.kapi, 0)) revert TransferOlmadi();
            uint256 brut = usdc.balanceOf(address(this)) - dOnce;
            ucret = brut * e.ucretBps / 10_000;
            if (brut < ucret + e.bahsis + e.asgari) revert AzCikti(brut > ucret + e.bahsis ? brut - ucret - e.bahsis : 0, e.asgari);
            cikti = brut - ucret - e.bahsis;
            /* tokens a price limit left unsold come back here, and go back to the owner */
            uint256 tSonra = IERC20L(e.token).balanceOf(address(this));
            uint256 satilan = tOnce > tSonra ? tOnce - tSonra : 0;
            iade = e.girdi > satilan ? e.girdi - satilan : 0;
            _gonder(address(usdc), e.sahip, cikti);
            if (iade > 0) _gonder(e.token, e.sahip, iade);
        }
        _ucretDagit(ucret);
        if (e.bahsis > 0) _gonder(address(usdc), bahsisAlici, e.bahsis);
        emit EmirDolduruldu(id, e.sahip, bahsisAlici, cikti, iade, ucret, e.bahsis);
    }

    /* ----------------------------------------------------------- internal */

    function _ucretDagit(uint256 u) internal {
        if (u == 0) return;
        uint256 y = u * yakimPay / 10_000;
        uint256 g = u * gelistiriciPay / 10_000;
        uint256 p = u * pazarlamaPay / 10_000;
        uint256 s = u - y - g - p;
        if (y > 0) _gonder(address(usdc), yakici, y);
        if (g > 0) _gonder(address(usdc), gelistirici, g);
        if (p > 0) _gonder(address(usdc), pazarlama, p);
        if (s > 0) _gonder(address(usdc), sahip, s);
        emit UcretDagitildi(y, g, p, s);
    }

    function _gonder(address varlik, address kime, uint256 miktar) internal {
        if (!IERC20L(varlik).transfer(kime, miktar)) revert TransferOlmadi();
    }

    /* -------------------------------------------------------------- admin */

    /// The fee for orders placed from now on (open orders keep theirs). At most 1%.
    function ucretAyarla(uint16 bps) external sadeceYonetici {
        if (bps > UCRET_TAVAN_BPS) revert KotuDeger();
        ucretBps = bps;
        emit AyarDegisti("ucretBps", bps);
    }

    /// The least tip an order may offer (keeps keepers paid). At most BAHSIS_AZAMI.
    function asgariBahsisAyarla(uint64 miktar) external sadeceYonetici {
        if (miktar > BAHSIS_AZAMI) revert KotuDeger();
        asgariBahsis = miktar;
        emit AyarDegisti("asgariBahsis", miktar);
    }

    /// The split in parts of 10,000; the owner's share is what is left.
    function paylarAyarla(uint16 yakim, uint16 gelistirici_, uint16 pazarlama_) external sadeceYonetici {
        if (uint256(yakim) + gelistirici_ + pazarlama_ > 10_000) revert KotuDeger();
        yakimPay = yakim;
        gelistiriciPay = gelistirici_;
        pazarlamaPay = pazarlama_;
        emit AyarDegisti("yakimPay", yakim);
        emit AyarDegisti("gelistiriciPay", gelistirici_);
        emit AyarDegisti("pazarlamaPay", pazarlama_);
    }

    function alicilarAyarla(address yakici_, address gelistirici_, address pazarlama_, address sahip_) external sadeceYonetici {
        if (yakici_ == address(0) || gelistirici_ == address(0) || pazarlama_ == address(0) || sahip_ == address(0)) revert SifirAdres();
        yakici = yakici_;
        gelistirici = gelistirici_;
        pazarlama = pazarlama_;
        sahip = sahip_;
        emit AliciDegisti("yakici", yakici_);
        emit AliciDegisti("gelistirici", gelistirici_);
        emit AliciDegisti("pazarlama", pazarlama_);
        emit AliciDegisti("sahip", sahip_);
    }

    /// Sends only what is here beyond every open order's deposit (funds sent here by mistake).
    function kurtar(address varlik, address kime) external sadeceYonetici kilitli {
        if (kime == address(0)) revert SifirAdres();
        uint256 b = IERC20L(varlik).balanceOf(address(this));
        uint256 fazla = b > emanet[varlik] ? b - emanet[varlik] : 0;
        if (fazla == 0) revert KotuDeger();
        _gonder(varlik, kime, fazla);
        emit Kurtarildi(varlik, kime, fazla);
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
