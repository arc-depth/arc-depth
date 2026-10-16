// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.26;

import {CctpMesaj, IMesajTasiyiciV2, ITokenMesajciV2} from "../nesil2/CctpMesaj.sol";

/// @title TabanKasasi — a floor that travels with its token
///
/// WHAT IT IS
///   One vault per chain per token. The vault holds the chain's dollar and
///   is the only minter of the token here. Any holder redeems here, now,
///   for their share of this vault: never a message to another chain.
///
/// HOW THE FLOOR MOVES
///   A bridge out burns the tokens and burns their share of this vault's
///   dollars through CCTP, in one message, to the twin vault on the other
///   chain. That vault is the message's destinationCaller and receives it
///   itself: the dollars arrive and the tokens are minted in the same
///   transaction. Tokens cannot exist anywhere without their dollars.
///
/// THE RULE
///   taban = kasa / arz, and no function lowers it.
///     redeem      pays a share rounded down
///     bridge out  takes a share rounded down; every fee comes out of it
///     bridge in   mints shares at this chain's floor, rounded down
///   So bridging from a chain with a lower floor cannot dilute this one:
///   the arrival buys in at this chain's price. Whoever bridges pays every
///   fee in fewer tokens, never the holders who stay.
///
/// WHO EARNS, AND FROM WHAT
///   Opening   ACILIS_UCRETI dollars once, at the launch: half to FTHM
///             stakers, half to the protocol.
///   Bridge    KOPRU_BPS of the dollars that move: 40% to FTHM stakers,
///             30% to the launchpad that brought the token, 30% to the
///             protocol.
///   Delivery  a tip the bridger names, paid on arrival to whoever
///             delivered the message. Anyone may deliver; our relayer is
///             one of them and earns only by being there first.
///   FTHM's share goes to this chain's FthmPayi, which carries it to the
///   FTHM stake contract on Arc. Redeem pays no fee: leaving at the floor
///   is the promise and is never taxed.
///
/// WHAT IT DOES NOT DO
///   No owner after `kilitle`. No withdrawal. No price, no pool: the
///   market price above the floor is the pool's business, not the vault's.
///   No fee can be changed: rates are constants, recipients immutable.
///
/// PROTOTYPE: no launchpad; the deployer seeds once and names the twins
/// once, then locks.
contract TabanKasasi {
    using CctpMesaj for bytes;

    /* ---- the token, minted and burned only by this vault ---------- */

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /* ---- fees, fixed ------------------------------------------------ */

    /// $5 in a 6-decimal dollar. A vault on an 18-decimal dollar scales it.
    uint256 public constant ACILIS_UCRETI_6 = 5e6;
    /// 0.10% of the dollars that cross.
    uint256 public constant KOPRU_BPS = 10;
    uint256 public constant FTHM_PAY = 40;        // percent of the bridge fee
    uint256 public constant YONLENDIREN_PAY = 30; // the launchpad's percent
    /// The rest (30%) is the protocol's.

    /* ---- the vault ------------------------------------------------- */

    address public immutable dolar;
    IMesajTasiyiciV2 public immutable mesajTasiyici;
    ITokenMesajciV2 public immutable tokenMesajci;
    uint32 public immutable buDomain;
    uint256 public immutable acilisUcreti;

    address public immutable hazine;       // the protocol
    address public immutable fthmPayi;     // FTHM stakers, through FthmPayi
    address public immutable yonlendiren;  // the launchpad that opened this token

    /// The twin vault on each CCTP domain, as CCTP writes addresses.
    mapping(uint32 => bytes32) public ikiz;
    address public kurucu;

    /// Standard finality: the floor is not worth a reorg.
    uint32 public constant KESINLIK = 2000;

    event Tohum(address indexed alici, uint256 dolar, uint256 jeton, uint256 ucret);
    event Ikiz(uint32 indexed domain, bytes32 kasa);
    event Kilit();
    event Itfa(address indexed sahip, uint256 jeton, uint256 dolar);
    event Ucret(uint256 fthm, uint256 yonlendiren, uint256 hazine);
    event Cikis(address indexed sahip, uint32 indexed hedef, bytes32 alici, uint256 jeton, uint256 dolar, uint256 bahsis);
    event Giris(uint32 indexed kaynak, address indexed alici, uint256 jetonKaynakta, uint256 dolar, uint256 jeton);
    event Bahsis(address indexed teslimEden, uint256 dolar);

    error SadeceKurucu();
    error Kilitli();
    error IkizYok(uint32 domain);
    error Sifir();
    error KotuMesaj();
    error Kilitlendi();
    error BahsisCok();

    uint256 private _kilit = 1;
    modifier kilitli() {
        if (_kilit != 1) revert Kilitlendi();
        _kilit = 2;
        _;
        _kilit = 1;
    }

    constructor(
        string memory ad,
        string memory sembol,
        address dolar_,
        address mt,
        address tm,
        address hazine_,
        address fthmPayi_,
        address yonlendiren_
    ) {
        if (hazine_ == address(0) || fthmPayi_ == address(0) || yonlendiren_ == address(0)) revert Sifir();
        name = ad;
        symbol = sembol;
        dolar = dolar_;
        mesajTasiyici = IMesajTasiyiciV2(mt);
        tokenMesajci = ITokenMesajciV2(tm);
        buDomain = IMesajTasiyiciV2(mt).localDomain();
        uint8 o = IERC20T(dolar_).decimals();
        acilisUcreti = o >= 6 ? ACILIS_UCRETI_6 * 10 ** (o - 6) : ACILIS_UCRETI_6 / 10 ** (6 - o);
        hazine = hazine_;
        fthmPayi = fthmPayi_;
        yonlendiren = yonlendiren_;
        kurucu = msg.sender;
    }

    /* ==================================================================
     * SETUP, ONCE
     * ================================================================== */

    /// The launch: dollars in, tokens out, on one chain only. Pulls
    /// `dolarMiktar` plus the opening fee from the deployer; the
    /// prototype's stand-in for the launchpad.
    function tohumla(address alici, uint256 dolarMiktar, uint256 jetonMiktar) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        if (totalSupply != 0 || dolarMiktar == 0 || jetonMiktar == 0) revert Sifir();
        _cek(dolar, msg.sender, dolarMiktar + acilisUcreti);
        uint256 f = acilisUcreti / 2;
        _gonder(dolar, fthmPayi, f);
        _gonder(dolar, hazine, acilisUcreti - f);
        _bas(alici, jetonMiktar);
        emit Ucret(f, 0, acilisUcreti - f);
        emit Tohum(alici, dolarMiktar, jetonMiktar, acilisUcreti);
    }

    function ikizEkle(uint32 domain, address karsiKasa) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        if (ikiz[domain] != bytes32(0) || karsiKasa == address(0) || domain == buDomain) revert Kilitli();
        ikiz[domain] = CctpMesaj.b32(karsiKasa);
        emit Ikiz(domain, ikiz[domain]);
    }

    /// No owner from here on: the twins are fixed.
    function kilitle() external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        kurucu = address(0);
        emit Kilit();
    }

    /* ==================================================================
     * READING THE FLOOR
     * ================================================================== */

    function kasa() public view returns (uint256) {
        return IERC20T(dolar).balanceOf(address(this));
    }

    /// Dollars (in the dollar's units) behind 1e18 tokens. Zero with no supply.
    function taban() external view returns (uint256) {
        return totalSupply == 0 ? 0 : (kasa() * 1e18) / totalSupply;
    }

    /// What `miktar` tokens redeem for here, now.
    function karsilik(uint256 miktar) public view returns (uint256) {
        return totalSupply == 0 ? 0 : (miktar * kasa()) / totalSupply;
    }

    /// The bridge fee on a share, and what CCTP is asked to carry.
    function kopruBol(uint256 pay) public pure returns (uint256 ucret, uint256 tasinan) {
        ucret = (pay * KOPRU_BPS) / 10_000;
        tasinan = pay - ucret;
    }

    /* ==================================================================
     * REDEEM, LOCAL, IMMEDIATE AND FREE
     * ================================================================== */

    function itfa(uint256 miktar) external kilitli returns (uint256 odeme) {
        odeme = karsilik(miktar);
        if (odeme == 0) revert Sifir();
        _yak(msg.sender, miktar);
        _gonder(dolar, msg.sender, odeme);
        emit Itfa(msg.sender, miktar, odeme);
    }

    /* ==================================================================
     * BRIDGE: THE TOKENS AND THEIR DOLLARS IN ONE CCTP MESSAGE
     * ================================================================== */

    /// Burns `miktar` here and sends their share of this vault, less the
    /// bridge fee, to the twin on `hedef`, which mints for `alici` when it
    /// receives the message. `maxUcret` is the most CCTP may keep and
    /// `bahsis` the tip for whoever delivers; the bridger bears both.
    function kopru(uint256 miktar, uint32 hedef, address alici, uint256 maxUcret, uint256 bahsis)
        external
        kilitli
    {
        bytes32 karsi = ikiz[hedef];
        if (karsi == bytes32(0)) revert IkizYok(hedef);
        uint256 pay = karsilik(miktar);
        if (pay == 0 || alici == address(0)) revert Sifir();
        (uint256 ucret, uint256 tasinan) = kopruBol(pay);
        /* The tip must leave something to mint even after CCTP's fee: a
           message that cannot mint would sit undelivered forever. */
        if (maxUcret >= tasinan || bahsis >= tasinan - maxUcret) revert BahsisCok();

        _yak(msg.sender, miktar);
        _ucretDagit(ucret);
        _onayla(dolar, address(tokenMesajci), tasinan);
        tokenMesajci.depositForBurnWithHook(
            tasinan, hedef, karsi, dolar, karsi, maxUcret, KESINLIK, abi.encode(alici, miktar, bahsis, pay));
        emit Cikis(msg.sender, hedef, CctpMesaj.b32(alici), miktar, tasinan, bahsis);
    }

    /// Anyone may deliver, but only this vault can submit to CCTP (it is
    /// the destinationCaller) and only a twin's burn mints anything. Once
    /// CCTP has accepted the message nothing here reverts for an amount:
    /// a revert would strand the dollars in transit for good.
    function teslimAl(bytes calldata mesaj, bytes calldata imza) external kilitli {
        CctpMesaj.Baslik memory b = mesaj.baslik();
        bytes32 ben = CctpMesaj.b32(address(this));
        if (b.hedefCagiran != ben) revert KotuMesaj();

        bytes calldata g = CctpMesaj.govde(mesaj);
        CctpMesaj.Yakim memory y = g.yakim();
        if (y.mintAlici != ben) revert KotuMesaj();
        /* The burner must be the twin on the chain the message came from.
           Read before minting: a stranger's burn to us reverts whole. */
        bytes32 karsi = ikiz[b.kaynakDomain];
        if (karsi == bytes32(0) || y.mesajGonderen != karsi) revert KotuMesaj();

        /* The floor before the dollars land, so the arrival buys in at it. */
        uint256 kasaOnce = kasa();
        uint256 arzOnce = totalSupply;
        if (!mesajTasiyici.receiveMessage(mesaj, imza)) revert KotuMesaj();
        uint256 gelen = kasa() - kasaOnce;
        if (gelen == 0) revert KotuMesaj();

        /* `pay` is the share the tokens left with, before any fee: the
           count on an empty chain is scaled by what arrived of it. */
        (address alici, uint256 jetonKaynakta, uint256 bahsis, uint256 pay) =
            abi.decode(CctpMesaj.kanca(g), (address, uint256, uint256, uint256));
        if (bahsis >= gelen) bahsis = 0;   // the source checks this; never trust it twice
        if (bahsis > 0) {
            _gonder(dolar, msg.sender, bahsis);
            emit Bahsis(msg.sender, bahsis);
        }
        uint256 net = gelen - bahsis;

        /* An empty (or emptied) chain takes the source's count, scaled by
           the net arrival over the gross share: the bridge fee, CCTP's fee
           and the tip all come out of the bridger's tokens, so the new
           chain opens at the source's floor.
           Otherwise the arrival is priced at this chain's floor. */
        uint256 basilan = (arzOnce == 0 || kasaOnce == 0)
            ? (pay == 0 ? 0 : (jetonKaynakta * net) / pay)
            : (net * arzOnce) / kasaOnce;
        /* Dust that buys no token stays in the vault: it raises the floor. */
        if (basilan > 0) _bas(alici, basilan);
        emit Giris(b.kaynakDomain, alici, jetonKaynakta, net, basilan);
    }

    function _ucretDagit(uint256 ucret) internal {
        if (ucret == 0) return;
        uint256 f = (ucret * FTHM_PAY) / 100;
        uint256 l = (ucret * YONLENDIREN_PAY) / 100;
        _gonder(dolar, fthmPayi, f);
        _gonder(dolar, yonlendiren, l);
        _gonder(dolar, hazine, ucret - f - l);
        emit Ucret(f, l, ucret - f - l);
    }

    /* ==================================================================
     * THE TOKEN
     * ================================================================== */

    function transfer(address to, uint256 v) external returns (bool) {
        _tasi(msg.sender, to, v);
        return true;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        emit Approval(msg.sender, s, v);
        return true;
    }

    function transferFrom(address from, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - v;
        _tasi(from, to, v);
        return true;
    }

    function _tasi(address from, address to, uint256 v) internal {
        balanceOf[from] -= v;
        balanceOf[to] += v;
        emit Transfer(from, to, v);
    }

    function _bas(address to, uint256 v) internal {
        totalSupply += v;
        balanceOf[to] += v;
        emit Transfer(address(0), to, v);
    }

    function _yak(address from, uint256 v) internal {
        balanceOf[from] -= v;
        totalSupply -= v;
        emit Transfer(from, address(0), v);
    }

    /* ---- dollar calls that tolerate tokens returning nothing ------- */

    function _gonder(address t, address to, uint256 v) internal {
        if (v == 0) return;
        (bool ok, bytes memory r) = t.call(abi.encodeWithSelector(IERC20T.transfer.selector, to, v));
        require(ok && (r.length == 0 || abi.decode(r, (bool))), "transfer");
    }

    function _cek(address t, address from, uint256 v) internal {
        (bool ok, bytes memory r) = t.call(abi.encodeWithSelector(IERC20T.transferFrom.selector, from, address(this), v));
        require(ok && (r.length == 0 || abi.decode(r, (bool))), "transferFrom");
    }

    function _onayla(address t, address s, uint256 v) internal {
        (bool ok, bytes memory r) = t.call(abi.encodeWithSelector(IERC20T.approve.selector, s, v));
        require(ok && (r.length == 0 || abi.decode(r, (bool))), "approve");
    }
}

interface IERC20T {
    function balanceOf(address) external view returns (uint256);
    function decimals() external view returns (uint8);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}
