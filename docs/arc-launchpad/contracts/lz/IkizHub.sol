// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ILzUcNokta2, LzParams2, LzOrigin2 } from "../sepet/HaberciLZ.sol";
import { IERC20S, Adres } from "../sepet/IHaberci.sol";

interface IAdliH {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/// What the hub asks of the one-pool gate: tokens that came back from a
/// non-EVM twin with an order (sell or redeem), carried out at once.
interface IMerkezHub {
    function vekilOf(address token) external view returns (address);
    function hubIstek(address token, uint256 miktar, bytes32 gonderen, bytes calldata istek) external;
}

/// @title IkizHub — every launch token's twins on Solana, Sui and Aptos, through one door on Arc
///
/// LayerZero's Sui and Aptos OApps take one peer per chain, and on Arc every
/// launch token has its own adapter: one non-EVM gate could not listen to
/// all of them. So the twins there go through this single hub, the only
/// peer of the Solana, Sui and Aptos twin gates (arastirma/sepet-v2-tasarim.md).
/// The EVM twin mesh (IkizYayici) is untouched.
///
///   YARAT  the gate creates the token's twin (name, symbol): once per chain,
///          for a token the one-pool gate launched, paid by the caller
///   TASI   out: the tokens are locked here and the gate mints the twin to
///          the recipient; in: the gate burned the twin, the tokens are
///          released here to the recipient — or, when the message carries an
///          order, handed to the one-pool gate, which sells or redeems them
///          in the same call
///
/// Solana is reached directly. Sui and Aptos are not connected to Arc by
/// LayerZero (measured 18 Oct): their messages go through the AktarmaLZ hop
/// on Base, which forwards both ways; from the hop, a message carries the
/// chain it really came from, and only the hop may say so.
///
/// Amounts cross in 6 shared decimals (a non-EVM supply must fit 64 bits);
/// what is locked is always a whole number of shared units. INVARIANT: the
/// tokens locked here equal the twins' total supply on the three chains.
/// No owner after `kilitle`; the gates and the one-pool gate are set once.
contract IkizHub {
    uint8 public constant YARAT = 1;
    uint8 public constant TASI = 2;
    uint256 public constant OLCEK = 1e12;   // 18 local decimals -> 6 shared

    ILzUcNokta2 public immutable ucNokta;
    address public kurucu;
    IMerkezHub public merkez;
    mapping(uint32 => bytes32) public kapi;           // eid -> that chain's twin gate
    mapping(uint32 => bytes) public secenek;          // eid -> LayerZero options there
    /// creating a twin costs more there than a transfer (Solana: the mint and
    /// its metadata account); empty: the same options as a transfer
    mapping(uint32 => bytes) public yaratSecenek;
    /// Sui / Aptos: reached through the hop (its eid and address, set once)
    mapping(uint32 => bool) public aktarmali;
    uint32 public aktarmaEid;
    bytes32 public aktarma;
    mapping(address => mapping(uint32 => bool)) public yaratildi;
    mapping(address => uint256) public kilitli;       // token -> locked here for the non-EVM twins
    bool private _kilit;

    event Yaratildi(address indexed token, uint32 eid);
    event Gitti(address indexed token, uint32 eid, bytes32 alici, uint256 miktar);
    event Geldi(address indexed token, uint32 eid, bytes32 alici, uint256 miktar, bool istekli);

    error SadeceKurucu();
    error ZatenBagli();
    error KapiYok(uint32 eid);
    error BilinmeyenToken();
    error SadeceUcNokta();
    error KotuKaynak();
    error UcretYetersiz(uint256 gerekli, uint256 verilen);
    error Az();
    error TransferOlmadi();
    error IadeOlmadi();
    error Yeniden_();

    modifier kilitli_() {
        if (_kilit) revert Yeniden_();
        _kilit = true;
        _;
        _kilit = false;
    }

    constructor(ILzUcNokta2 _uc) {
        ucNokta = _uc;
        kurucu = msg.sender;
        _uc.setDelegate(msg.sender);
    }

    receive() external payable {}

    /* ---- set once ------------------------------------------------------ */

    function merkezKur(IMerkezHub m) external {
        if (msg.sender != kurucu || address(merkez) != address(0)) revert SadeceKurucu();
        merkez = m;
    }

    function kapiEkle(uint32 eid, bytes32 karsi, bytes calldata s) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        if (kapi[eid] != bytes32(0) || karsi == bytes32(0)) revert ZatenBagli();
        kapi[eid] = karsi;
        secenek[eid] = s;
    }

    /// The hop on Base, once.
    function aktarmaKur(uint32 eid, bytes32 adres) external {
        if (msg.sender != kurucu || aktarma != bytes32(0) || adres == bytes32(0)) revert SadeceKurucu();
        aktarmaEid = eid;
        aktarma = adres;
    }

    /// A chain reached through the hop: `s` are the options toward the hop,
    /// carrying the native value its second hop needs.
    function aktarmaliKapiEkle(uint32 eid, bytes32 karsi, bytes calldata s) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        if (kapi[eid] != bytes32(0) || karsi == bytes32(0)) revert ZatenBagli();
        kapi[eid] = karsi;
        secenek[eid] = s;
        aktarmali[eid] = true;
    }

    function yaratSecenekKur(uint32 eid, bytes calldata s) external {
        if (msg.sender != kurucu || yaratSecenek[eid].length != 0 || s.length == 0) revert SadeceKurucu();
        yaratSecenek[eid] = s;
    }

    function kilitle() external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        kurucu = address(0);
        ucNokta.setDelegate(0x000000000000000000000000000000000000dEaD);
    }

    /* ---- out ----------------------------------------------------------- */

    /// Anyone, paying LayerZero: the token's twin on each chain in `eidler`.
    function yarat(address token, uint32[] calldata eidler, address iade) external payable kilitli_ {
        if (merkez.vekilOf(token) == address(0)) revert BilinmeyenToken();
        bytes memory m = abi.encode(YARAT, token, IAdliH(token).name(), IAdliH(token).symbol());
        uint256 harcanan;
        for (uint256 i = 0; i < eidler.length; i++) {
            uint32 e = eidler[i];
            if (yaratildi[token][e]) continue;
            harcanan += _gonder(e, m, msg.value - harcanan, true);
            yaratildi[token][e] = true;
            emit Yaratildi(token, e);
        }
        _iade(iade);
    }

    /// Anyone: lock `miktar` of `token` (taken from the caller) and have the
    /// gate on `eid` mint the twin to `alici` (32 bytes, that chain's address).
    function gonder(address token, uint32 eid, bytes32 alici, uint256 miktar, address iade) external payable kilitli_ returns (uint256 giden) {
        if (!yaratildi[token][eid]) revert BilinmeyenToken();
        uint256 sd = miktar / OLCEK;
        if (sd == 0) revert Az();
        giden = sd * OLCEK;
        if (!IERC20S(token).transferFrom(msg.sender, address(this), giden)) revert TransferOlmadi();
        kilitli[token] += giden;
        _gonder(eid, abi.encode(TASI, token, alici, sd), msg.value, false);
        emit Gitti(token, eid, alici, giden);
        _iade(iade);
    }

    /// What LayerZero asks for a message `m` to `eid` (through the hop where it goes so).
    function ucret(uint32 eid, bytes calldata m) external view returns (uint256) {
        return ucNokta.quote(_param(eid, m, uint8(m[31]) == YARAT), address(this)).nativeFee;
    }

    function _param(uint32 eid, bytes memory m, bool yaratma) internal view returns (LzParams2 memory) {
        bytes32 k = kapi[eid];
        if (k == bytes32(0)) revert KapiYok(eid);
        bytes memory o = yaratma && yaratSecenek[eid].length > 0 ? yaratSecenek[eid] : secenek[eid];
        return aktarmali[eid] ? LzParams2(aktarmaEid, aktarma, abi.encode(eid, m), o, false) : LzParams2(eid, k, m, o, false);
    }

    function _gonder(uint32 eid, bytes memory m, uint256 eldeki, bool yaratma) internal returns (uint256 u) {
        LzParams2 memory p = _param(eid, m, yaratma);
        u = ucNokta.quote(p, address(this)).nativeFee;
        if (u > eldeki) revert UcretYetersiz(u, eldeki);
        ucNokta.send{ value: u }(p, address(this));
    }

    function _iade(address iade) internal {
        uint256 b = address(this).balance;
        if (b > 0) {
            (bool ok,) = payable(iade).call{ value: b }("");
            if (!ok) revert IadeOlmadi();
        }
    }

    /* ---- in ------------------------------------------------------------ */

    /// A gate burned twins: abi.encode(TASI, token, bytes32 alici, uint256 miktarSD, bytes istek).
    /// With no order the tokens go to `alici` on Arc; with one they go to the
    /// one-pool gate, which carries it out (or hands them to the seller's
    /// fallback) in this same call.
    function lzReceive(LzOrigin2 calldata o, bytes32, bytes calldata m, address, bytes calldata) external payable kilitli_ {
        if (msg.sender != address(ucNokta)) revert SadeceUcNokta();
        uint32 kaynak;
        bytes memory ic;
        if (o.srcEid == aktarmaEid && o.sender == aktarma && aktarma != bytes32(0)) {
            (kaynak, ic) = abi.decode(m, (uint32, bytes));
            if (!aktarmali[kaynak]) revert KotuKaynak();
        } else {
            if (aktarmali[o.srcEid] || kapi[o.srcEid] != o.sender || o.sender == bytes32(0)) revert KotuKaynak();
            (kaynak, ic) = (o.srcEid, m);
        }
        (uint8 tur, address token, bytes32 alici, uint256 sd, bytes memory istek) = abi.decode(ic, (uint8, address, bytes32, uint256, bytes));
        if (tur != TASI) revert KotuKaynak();
        uint256 v = sd * OLCEK;
        kilitli[token] -= v;   // more than was ever locked cannot come back
        if (istek.length == 0) {
            if (!IERC20S(token).transfer(Adres.evm(alici), v)) revert TransferOlmadi();
        } else {
            if (!IERC20S(token).transfer(address(merkez), v)) revert TransferOlmadi();
            merkez.hubIstek(token, v, alici, istek);
        }
        emit Geldi(token, kaynak, alici, v, istek.length > 0);
    }

    function allowInitializePath(LzOrigin2 calldata o) external view returns (bool) {
        if (o.srcEid == aktarmaEid && o.sender == aktarma && aktarma != bytes32(0)) return true;
        return !aktarmali[o.srcEid] && kapi[o.srcEid] == o.sender && o.sender != bytes32(0);
    }
    function nextNonce(uint32, bytes32) external pure returns (uint64) { return 0; }
}
