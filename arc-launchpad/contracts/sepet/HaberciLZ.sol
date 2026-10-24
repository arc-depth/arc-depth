// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHaberci, IHaberAlici, IERC20S, Adres} from "./IHaberci.sol";
import {IMesajTasiyiciV2} from "../nesil2/CctpMesaj.sol";

/* LayerZero V2 endpoint, as much of it as this contract uses */
struct LzParams2 { uint32 dstEid; bytes32 receiver; bytes message; bytes options; bool payInLzToken; }
struct LzFee2 { uint256 nativeFee; uint256 lzTokenFee; }
struct LzOrigin2 { uint32 srcEid; bytes32 sender; uint64 nonce; }
interface ILzUcNokta2 {
    function send(LzParams2 calldata p, address refundAddress) external payable returns (bytes32 guid, uint64 nonce, LzFee2 memory fee);
    function quote(LzParams2 calldata p, address sender) external view returns (LzFee2 memory);
    function setDelegate(address d) external;
}

/// Dolar6 (contracts/Dolar6.sol): an 18-decimal dollar held 1:1 in 6-decimal units.
interface ISariciLZ { function sar(uint256 birim) external returns (uint256); }

/// Circle's TokenMessengerV2.
interface ITokenMesajciLZ {
    function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken,
        bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external;
    function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken,
        bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes calldata hookData) external;
}

/// @title HaberciLZ — the basket's messenger, with nothing to relay by hand
///
/// The same interface as HaberciCctp (`zincir`, `gonder`; receivers get
/// `haberAl`), so the Defter, the vaults and the chain entry run unchanged.
/// What changes is how a message travels, so that no machine of ours has to
/// carry anything (arastirma/sepet-v2-tasarim.md):
///
///   ORDERS travel over LayerZero to the twin HaberciLZ. LayerZero's
///   executor runs `lzReceive` by itself; the fee is paid here, in the
///   sending transaction. Only Arc sends orders, and on Arc the native token
///   is USDC, so the fee comes out of USDC: out of the order's own dollars
///   when it carries some, otherwise out of the fee balance this contract
///   holds (anyone may top it up, a redemption tops it up for its own
///   orders).
///
///   DOLLARS travel by the route set once per chain:
///     YONLENDIR  a plain CCTP burn with Circle's forwarding hook: Circle
///                mints it on the destination by itself (Arc, Base, Arbitrum,
///                Ethereum, Avalanche, Monad, HyperEVM, Solana)
///     RELAY      a plain transfer to a relay.link open deposit address made
///                once for this chain and this receiver: relay's solvers
///                deliver it (BNB, Robinhood, where Circle mints no USDC)
///     DUZ        a plain CCTP burn with no forwarding (Sui, Aptos, where
///                Circle does not forward): whoever wants the order carried
///                out (the auction's filler) completes it
///
///   SUI_CCTP / APTOS_CCTP  LayerZero does not connect Arc to Sui or Aptos
///                (Arc's endpoint: isSupportedEid false, measured 18 Oct), so
///                orders there travel as CCTP messages, exactly as the v1
///                Haberci sent them and as the v1 Move packages take them
///                (both proven on mainnet with PTEST1): Sui in split mode (a
///                plain burn to the vault object + a payload to the package's
///                auth identity), Aptos as a burn with hook to its Haberci.
///                No one forwards these: the auction's filler delivers them.
///
///   An order with dollars waits on arrival until its dollars are here, then
///   anyone carries it out (`isle`); one arriving after its dollars is
///   carried out at once, inside `lzReceive`. Fees taken on the way (Circle's
///   forwarding, relay's) make the arrival a little less than was sent: the
///   message says the least it may be (`beklenen`), and what arrived is what
///   the receiver gets.
///
///   A PAYOUT (no order, only dollars to an address) never waits here: it
///   goes straight to the payee by the chain's route, and to a chain this
///   contract has no direct route to (an island, from a chain other than
///   Arc) it goes to the same address on Arc instead.
contract HaberciLZ is IHaberci {
    uint8 public constant YONLENDIR = 1;
    uint8 public constant RELAY = 2;
    uint8 public constant DUZ = 3;
    uint8 public constant SUI_CCTP = 4;
    uint8 public constant APTOS_CCTP = 5;
    uint32 public constant KESINLIK = 2000;
    /// "cctp-forward" then zeros: Circle's forwarding request, version 0
    bytes public constant ILET = hex"636374702d666f72776172640000000000000000000000000000000000000000";

    IERC20S public immutable usdc;
    ILzUcNokta2 public immutable ucNokta;
    ITokenMesajciLZ public immutable tokenMesajci;
    IMesajTasiyiciV2 public immutable mesajTasiyici;
    uint32 public immutable buDomain;
    uint32 public immutable arcDomain;
    /// on Arc the native coin is USDC, so LayerZero fees are paid from it
    bool public immutable yerelUsdc;
    /// BNB: relay delivers Binance-Peg USDC (18 decimals) and the vault's
    /// dollar (`usdc`) is the Dolar6 wrapping it; what arrives is wrapped
    /// before it is counted. Zero elsewhere.
    IERC20S public immutable ham;

    address public kurucu;
    mapping(uint32 => uint32) public eidOf;        // CCTP domain -> LayerZero eid
    mapping(uint32 => uint32) public zincirOf;     // LayerZero eid -> CCTP domain
    mapping(uint32 => bytes32) public ikiz;        // the twin HaberciLZ (or Move / Solana gate) per chain
    mapping(uint32 => uint8) public yol;           // how dollars reach a chain
    mapping(uint32 => address) public relayAdresi; // RELAY: the deposit address, on this chain, for that chain
    mapping(uint32 => uint256) public ustUcret;    // YONLENDIR: Circle's forwarding fee cap for that chain
    /// where an order's dollars are minted on that chain, when not the twin
    /// itself (Solana: the vault's dollar token account, CCTP mints to one)
    mapping(uint32 => bytes32) public dolarAlici;
    bytes public secenek;                          // LayerZero options for an order (lzReceive gas)
    /// a chain whose orders need other options (Solana: compute units and
    /// lamports for the accounts an order opens there)
    mapping(uint32 => bytes) public ozelSecenek;

    struct Bekleyen { uint32 kz; bytes32 kaynak; bytes32 hedef; uint256 miktar; uint256 beklenen; bool yapildi; bytes veri; }
    Bekleyen[] public bekleyenler;
    uint256 public ilkAcik;                        // the oldest order not yet carried out
    bool private _kilit;

    event Gonderildi(uint32 indexed hedefZincir, address indexed kaynak, bytes32 indexed hedef, uint256 usdc);
    event Odendi(uint32 indexed hedefZincir, bytes32 indexed alici, uint256 usdc, uint8 yol);
    event Bekliyor(uint256 indexed id, uint32 kaynakZincir, uint256 miktar, uint256 beklenen);
    event Teslim(uint32 indexed kaynakZincir, bytes32 indexed kaynak, address indexed hedef, uint256 usdc);

    error SadeceKurucu();
    error ZatenBagli();
    error IkizYok(uint32 domain);
    error YolYok(uint32 domain);
    error SadeceUcNokta();
    error KotuKaynak();
    error UcretYetmez(uint256 gerekli, uint256 eldeki);
    error TransferOlmadi();
    error HenuzDegil();
    error Yeniden_();

    modifier kilitli() {
        if (_kilit) revert Yeniden_();
        _kilit = true;
        _;
        _kilit = false;
    }

    constructor(IERC20S _usdc, ILzUcNokta2 _uc, ITokenMesajciLZ _tm, IMesajTasiyiciV2 _mt, uint32 _domain, uint32 _arc, bool _yerelUsdc, IERC20S _ham) {
        mesajTasiyici = _mt;
        usdc = _usdc;
        ucNokta = _uc;
        tokenMesajci = _tm;
        buDomain = _domain;
        arcDomain = _arc;
        yerelUsdc = _yerelUsdc;
        ham = _ham;
        kurucu = msg.sender;
        _uc.setDelegate(msg.sender);   // the deployer writes DVN configs until kilitle
    }

    receive() external payable {}

    function zincir() external view returns (uint32) { return buDomain; }

    /// The Defter asks this for chains whose holders it must pay on Arc instead.
    function ada(uint32 z) external view returns (bool) { return yol[z] == RELAY; }

    /* ---- set once per chain, then locked ------------------------------- */

    function ikizEkle(uint32 domain, uint32 eid, bytes32 karsi) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        if (ikiz[domain] != bytes32(0) || zincirOf[eid] != 0 || karsi == bytes32(0) || eid == 0) revert ZatenBagli();
        ikiz[domain] = karsi;
        eidOf[domain] = eid;
        zincirOf[eid] = domain;
    }

    function yolKur(uint32 domain, uint8 y, address relay, uint256 ucretSiniri, bytes32 dolarAlici_) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        if (yol[domain] != 0 || y == 0 || y > APTOS_CCTP || (y == RELAY) != (relay != address(0))) revert ZatenBagli();
        yol[domain] = y;
        relayAdresi[domain] = relay;
        ustUcret[domain] = ucretSiniri;
        dolarAlici[domain] = dolarAlici_;
    }

    function secenekKur(bytes calldata s) external {
        if (msg.sender != kurucu || secenek.length != 0) revert SadeceKurucu();
        secenek = s;
    }

    function ozelSecenekKur(uint32 domain, bytes calldata s) external {
        if (msg.sender != kurucu || ozelSecenek[domain].length != 0 || s.length == 0) revert SadeceKurucu();
        ozelSecenek[domain] = s;
    }

    function _secenek(uint32 hz) internal view returns (bytes memory) {
        bytes memory o = ozelSecenek[hz];
        return o.length > 0 ? o : secenek;
    }

    function kilitle() external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        kurucu = address(0);
        ucNokta.setDelegate(0x000000000000000000000000000000000000dEaD);
    }

    /* ---- sending ------------------------------------------------------- */

    /// The IHaberci entry. A payout (empty `veri`) goes straight to `hedef`;
    /// an order goes to the twin over LayerZero with its dollars by the
    /// chain's route.
    /// Not locked, as in HaberciCctp: a delivery on this chain may call back in
    /// (the Defter, receiving a launch, sends its lines at once). It touches no
    /// queue state; the receiving side is the one that is locked.
    function gonder(uint32 hz, bytes32 hedef, bytes calldata veri, uint256 miktar) external {
        if (miktar > 0 && !usdc.transferFrom(msg.sender, address(this), miktar)) revert TransferOlmadi();
        if (hz == buDomain) {
            _ilet(buDomain, Adres.b32(msg.sender), hedef, veri, miktar);
            emit Gonderildi(hz, msg.sender, hedef, miktar);
            return;
        }
        if (veri.length == 0) { _ode(hz, hedef, miktar); emit Gonderildi(hz, msg.sender, hedef, miktar); return; }

        bytes32 karsi = ikiz[hz];
        if (karsi == bytes32(0)) revert IkizYok(hz);
        if (yol[hz] == SUI_CCTP || yol[hz] == APTOS_CCTP) {
            _cctpEmri(hz, karsi, hedef, veri, miktar);
            emit Gonderildi(hz, msg.sender, hedef, miktar);
            return;
        }
        LzParams2 memory p = LzParams2(eidOf[hz], karsi, "", _secenek(hz), false);
        /* quote with the final message length; the amounts inside do not change the fee */
        p.message = abi.encode(Adres.b32(msg.sender), hedef, veri, miktar, miktar);
        uint256 lzUcret = ucNokta.quote(p, address(this)).nativeFee;
        /* the native fee has 18 decimals, the USDC token 6: the same dollars, rounded up */
        uint256 ucret6 = (lzUcret + 1e12 - 1) / 1e12;
        uint256 gidecek = miktar;
        if (miktar > 0) {
            /* the order pays its own messenger out of its dollars */
            if (ucret6 >= miktar) revert UcretYetmez(ucret6, miktar);
            gidecek = miktar - ucret6;
            bytes32 da = dolarAlici[hz];
            uint256 beklenen = _dolarGonder(hz, da == bytes32(0) ? karsi : da, gidecek);
            p.message = abi.encode(Adres.b32(msg.sender), hedef, veri, gidecek, beklenen);
        } else {
            uint256 serbest = _serbest();
            if (serbest < ucret6) revert UcretYetmez(ucret6, serbest);
        }
        _ucretOde(lzUcret);
        ucNokta.send{value: lzUcret}(p, address(this));
        emit Gonderildi(hz, msg.sender, hedef, gidecek);
    }

    /// An order to Sui or Aptos over CCTP (the v1 wire format).
    function _cctpEmri(uint32 hz, bytes32 karsi, bytes32 hedef, bytes calldata veri, uint256 miktar) internal {
        if (yol[hz] == SUI_CCTP) {
            /* split: the dollars minted straight to the vault object, the order to the package's auth identity */
            if (miktar > 0) _yak(hz, hedef, miktar, 0, false);
            mesajTasiyici.sendMessage(hz, karsi, karsi, KESINLIK, abi.encode(Adres.b32(msg.sender), hedef, veri, miktar));
        } else {
            /* Aptos: the dollars and the order in one burn with hook, minted to and delivered by its Haberci */
            bytes memory yuk = abi.encode(Adres.b32(msg.sender), hedef, veri);
            if (miktar > 0) {
                if (!usdc.approve(address(tokenMesajci), miktar)) revert TransferOlmadi();
                tokenMesajci.depositForBurnWithHook(miktar, hz, karsi, address(usdc), karsi, 0, KESINLIK, yuk);
            } else {
                mesajTasiyici.sendMessage(hz, karsi, karsi, KESINLIK, yuk);
            }
        }
    }

    /// What LayerZero would charge for an order of this shape to `hz`.
    function ucret(uint32 hz, bytes32 hedef, bytes calldata veri, uint256 miktar) external view returns (uint256) {
        return ucNokta.quote(LzParams2(eidOf[hz], ikiz[hz], abi.encode(bytes32(0), hedef, veri, miktar, miktar), _secenek(hz), false), address(this)).nativeFee;
    }

    /// Dollars to the twin by the chain's route; returns the least that will arrive.
    function _dolarGonder(uint32 hz, bytes32 karsi, uint256 m) internal returns (uint256 beklenen) {
        uint8 y = yol[hz];
        if (y == YONLENDIR) {
            uint256 sinir = _sinir(hz, m);
            _yak(hz, karsi, m, sinir, true);
            return m - sinir;
        }
        if (y == RELAY) {
            if (!usdc.transfer(relayAdresi[hz], m)) revert TransferOlmadi();
            return (m * 97) / 100;   // relay's fee measured at ~0.8%; 3% leaves room
        }
        if (y == DUZ) { _yak(hz, karsi, m, 0, false); return m; }
        revert YolYok(hz);
    }

    /// A payout to `alici` on `hz`.
    function _ode(uint32 hz, bytes32 alici, uint256 m) internal {
        if (m == 0) return;
        uint8 y = yol[hz];
        if (y == YONLENDIR) { _yak(hz, alici, m, _sinir(hz, m), true); emit Odendi(hz, alici, m, y); return; }
        if (y == DUZ || y == SUI_CCTP || y == APTOS_CCTP) { _yak(hz, alici, m, 0, false); emit Odendi(hz, alici, m, y); return; }
        /* no direct route (an island): the same address on Arc */
        if (buDomain == arcDomain) {
            if (!usdc.transfer(Adres.evm(alici), m)) revert TransferOlmadi();
        } else {
            _yak(arcDomain, alici, m, _sinir(arcDomain, m), true);
        }
        emit Odendi(arcDomain, alici, m, 0);
    }

    function _sinir(uint32 hz, uint256 m) internal view returns (uint256 s) {
        s = ustUcret[hz];
        if (s > m / 10) s = m / 10;   // never more than a tenth of what is sent
    }

    function _yak(uint32 hz, bytes32 alici, uint256 m, uint256 maxUcret, bool ilet) internal {
        if (!usdc.approve(address(tokenMesajci), m)) revert TransferOlmadi();
        /* the hook variant refuses empty hook data: a plain burn goes through depositForBurn */
        if (ilet) tokenMesajci.depositForBurnWithHook(m, hz, alici, address(usdc), bytes32(0), maxUcret, KESINLIK, ILET);
        else tokenMesajci.depositForBurn(m, hz, alici, address(usdc), bytes32(0), maxUcret, KESINLIK);
    }

    /// On Arc the USDC balance is the native balance: nothing to convert.
    /// Elsewhere this contract never sends orders, so it never pays.
    function _ucretOde(uint256 u) internal view {
        if (!yerelUsdc && u > 0) revert UcretYetmez(u, 0);
        if (address(this).balance < u) revert UcretYetmez(u, address(this).balance);
    }

    /// The fee balance. Orders only leave Arc, and no order ever waits on
    /// Arc, so every dollar this holds there is fee money.
    function _serbest() internal view returns (uint256) { return usdc.balanceOf(address(this)); }

    /* ---- receiving ----------------------------------------------------- */

    function lzReceive(LzOrigin2 calldata o, bytes32, bytes calldata m, address, bytes calldata) external payable kilitli {
        if (msg.sender != address(ucNokta)) revert SadeceUcNokta();
        uint32 kz = zincirOf[o.srcEid];
        /* the eid must be the one registered for that chain (domain 0, Ethereum, is also the unset value) */
        if (eidOf[kz] != o.srcEid || ikiz[kz] != o.sender || o.sender == bytes32(0)) revert KotuKaynak();
        (bytes32 kaynak, bytes32 hedef, bytes memory veri, uint256 miktar, uint256 beklenen) =
            abi.decode(m, (bytes32, bytes32, bytes, uint256, uint256));
        if (miktar == 0) { _ilet(kz, kaynak, hedef, veri, 0); return; }
        bekleyenler.push(Bekleyen(kz, kaynak, hedef, miktar, beklenen, false, veri));
        emit Bekliyor(bekleyenler.length - 1, kz, miktar, beklenen);
        _sirayiIsle();
    }

    /// Anyone: carry out the waiting orders whose dollars have arrived, in
    /// order. An auction's filler calls this to start the auction.
    function isle() external kilitli { _sirayiIsle(); }

    function _sirayiIsle() internal {
        _sar();
        uint256 b = usdc.balanceOf(address(this));
        uint256 i = ilkAcik;
        while (i < bekleyenler.length) {
            Bekleyen storage q = bekleyenler[i];
            if (b < q.beklenen) break;   // its dollars are still on their way
            uint256 v = q.miktar < b ? q.miktar : b;
            q.yapildi = true;
            b -= v;
            i++;
            _ilet(q.kz, q.kaynak, q.hedef, q.veri, v);
        }
        ilkAcik = i;
    }

    /// BNB: the 18-decimal dollars relay delivered, wrapped into the vault's dollar.
    function _sar() internal {
        if (address(ham) == address(0)) return;
        uint256 n = ham.balanceOf(address(this)) / 1e12;
        if (n == 0) return;
        if (!ham.approve(address(usdc), n * 1e12)) revert TransferOlmadi();
        ISariciLZ(address(usdc)).sar(n);
    }

    function _ilet(uint32 kz, bytes32 kaynak, bytes32 hedef32, bytes memory veri, uint256 miktar) internal {
        address hedef = Adres.evm(hedef32);
        if (miktar > 0 && !usdc.transfer(hedef, miktar)) revert TransferOlmadi();
        if (veri.length > 0) IHaberAlici(hedef).haberAl(kz, kaynak, veri, miktar);
        emit Teslim(kz, kaynak, hedef, miktar);
    }

    /* LayerZero OApp surface */
    function allowInitializePath(LzOrigin2 calldata o) external view returns (bool) {
        uint32 kz = zincirOf[o.srcEid];
        return eidOf[kz] == o.srcEid && ikiz[kz] == o.sender && o.sender != bytes32(0);
    }
    function nextNonce(uint32, bytes32) external pure returns (uint64) { return 0; }
}
