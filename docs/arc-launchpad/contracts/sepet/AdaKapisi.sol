// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20S, Adres} from "./IHaberci.sol";

/// LayerZero V2 endpoint: the two calls this gate makes.
struct LzOrigin { uint32 srcEid; bytes32 sender; uint64 nonce; }
struct LzParams { uint32 dstEid; bytes32 receiver; bytes message; bytes options; bool payInLzToken; }
struct LzFee { uint256 nativeFee; uint256 lzTokenFee; }
struct LzReceipt { bytes32 guid; uint64 nonce; LzFee fee; }

interface ILzUcNokta {
    function send(LzParams calldata p, address refundAddress) external payable returns (LzReceipt memory);
    function quote(LzParams calldata p, address sender) external view returns (LzFee memory);
    function setDelegate(address d) external;
}

/// The Haberci this gate serves: it hands over a delivery and its dollars.
interface IAdaHaberci {
    function adaTeslim(uint32 kaynakZincir, bytes32 kaynak, bytes32 hedef, bytes calldata veri, uint256 miktar) external;
}

/// @title AdaKapisi — the basket system's road to chains without CCTP USDC
///
/// WHY
///   BNB Chain's dollar is Binance-Peg USDC (held as Dolar6), Robinhood's is
///   USDG; Circle mints neither, so CCTP cannot carry them. ARC PULSE's rule
///   for these "islands" (FTHMKapi, 14 Oct 2026): the dollars do not cross,
///   each chain keeps its own. Messages cross over LayerZero, which already
///   runs between all nine EVM chains.
///
/// HOW DOLLARS ARRIVE WITHOUT CROSSING
///   A send of N dollars to an island (or from one) locks the N dollars here,
///   on the sending chain, and sends the order. On the receiving chain the
///   order waits until someone puts N of that chain's dollars in (`doldur`):
///   our relayer, a market maker, anyone. The order is then carried out with
///   those dollars, and a receipt goes back (`bildir`) that releases the
///   locked N to the payer, on the sending chain, in its dollar. One for
///   one, no fee: the payer is simply the one who moved the dollars, by any
///   route of their choosing (relay.link, an exchange), at their own risk.
///
/// WHO IS TRUSTED FOR WHAT
///   Nobody holds anyone's dollars. The locked dollars leave this gate only
///   on a receipt from the twin gate, and the twin sends one only after the
///   payer's dollars have arrived and the order has been carried out with
///   them. LayerZero's DVNs authenticate the twin; the twin per chain is set
///   once and locked. An order nobody pays for waits, its dollars locked,
///   until someone does.
///
/// DELIVERY COST
///   Sending is a separate call (`yolla`, `bildir`) that pays LayerZero's
///   fee from msg.value, so the basket contracts never need gas money. Both
///   take many at once: every order queued for one chain goes in ONE
///   LayerZero message, every receipt owed to one chain in one more, so the
///   fee is shared by all of them. The payer needs no bridge per order
///   either: whoever keeps dollars on both sides pays from the far side and
///   is repaid on this side, and flows in opposite directions cancel out.
///
/// Every chain's dollar here is 6 decimals (USDC, Dolar6, USDG).
contract AdaKapisi {
    uint8 constant TASI = 1;
    uint8 constant ODENDI = 2;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    ILzUcNokta public immutable ucNokta;
    IAdaHaberci public immutable haberci;
    IERC20S public immutable dolar;

    address public kurucu;
    mapping(uint32 => uint32) public eidOf;       // chain -> LayerZero eid
    mapping(uint32 => uint32) public zincirOf;    // LayerZero eid -> chain
    mapping(uint32 => bytes32) public ikiz;       // chain -> its gate
    mapping(uint32 => bool) public eidKullanildi;

    struct Giden { uint32 hedefZincir; bool yollandi; uint256 kilitli; bytes32 ozet; }
    mapping(uint64 => Giden) public giden;
    uint64 public gidenSayisi;

    /// orders waiting for dollars: source chain -> its send id -> message hash
    mapping(uint32 => mapping(uint64 => bytes32)) public bekleyen;
    /// paid orders whose receipt is not sent yet -> who paid (on the source chain)
    mapping(uint32 => mapping(uint64 => bytes32)) public odeyen;

    bool private _kilit;

    event Kuyruk(uint64 indexed id, uint32 indexed hedefZincir, uint256 miktar, bytes mesaj);
    event Yollandi(uint64 indexed id, bytes32 guid);
    event Bekliyor(uint32 indexed kaynakZincir, uint64 indexed id, uint256 miktar, bytes mesaj);
    event Dolduruldu(uint32 indexed kaynakZincir, uint64 indexed id, address indexed doldurucu, bytes32 alacakli);
    event Bildirildi(uint32 indexed kaynakZincir, uint64 indexed id, bytes32 guid);
    event Odendi(uint64 indexed id, address indexed alacakli, uint256 miktar);

    error SadeceKurucu();
    error ZatenBagli();
    error SadeceHaberci();
    error SadeceUcNokta();
    error IkizYok(uint32 zincir);
    error YanlisMesaj();
    error Yollandi_();
    error TransferOlmadi();
    error Yeniden_();

    modifier kilitli() {
        if (_kilit) revert Yeniden_();
        _kilit = true;
        _;
        _kilit = false;
    }

    constructor(ILzUcNokta _ucNokta, IAdaHaberci _haberci, IERC20S _dolar) {
        ucNokta = _ucNokta;
        haberci = _haberci;
        dolar = _dolar;
        kurucu = msg.sender;
        _ucNokta.setDelegate(msg.sender);
    }

    /// Name a chain's LayerZero eid and its gate, once per chain, before `kilitle`.
    function ikizEkle(uint32 zincir, uint32 eid, bytes32 karsi) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        /* once per chain and per eid, never changed */
        if (ikiz[zincir] != bytes32(0) || eidKullanildi[eid] || karsi == bytes32(0) || eid == 0) revert ZatenBagli();
        eidKullanildi[eid] = true;
        eidOf[zincir] = eid;
        zincirOf[eid] = zincir;
        ikiz[zincir] = karsi;
    }

    /// After the DVN configuration: no one can change the twins or the path.
    function kilitle() external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        ucNokta.setDelegate(DEAD);
        kurucu = address(0);
    }

    /* ---- sending side ---------------------------------------------- */

    /// The Haberci queues an order; its `miktar` dollars are already here.
    function gonder(uint32 hedefZincir, bytes32 kaynak, bytes32 hedef, bytes calldata veri, uint256 miktar) external {
        if (msg.sender != address(haberci)) revert SadeceHaberci();
        if (ikiz[hedefZincir] == bytes32(0)) revert IkizYok(hedefZincir);
        uint64 id = gidenSayisi++;
        bytes memory m = abi.encode(TASI, id, kaynak, hedef, veri, miktar);
        giden[id] = Giden(hedefZincir, false, miktar, keccak256(m));
        emit Kuyruk(id, hedefZincir, miktar, m);
    }

    /// Anyone: send queued orders `ids` (their messages as emitted), all for
    /// one chain, in one LayerZero message.
    function yolla(uint64[] calldata ids, bytes[] calldata ms, bytes calldata secenekler) external payable kilitli {
        if (ids.length == 0 || ids.length != ms.length) revert YanlisMesaj();
        uint32 hz = giden[ids[0]].hedefZincir;
        for (uint256 i = 0; i < ids.length; i++) {
            Giden storage g = giden[ids[i]];
            if (g.ozet == bytes32(0) || keccak256(ms[i]) != g.ozet || g.hedefZincir != hz) revert YanlisMesaj();
            if (g.yollandi) revert Yollandi_();
            g.yollandi = true;
        }
        bytes32 guid = _gonder(hz, abi.encode(TASI, ms), secenekler);
        for (uint256 i = 0; i < ids.length; i++) emit Yollandi(ids[i], guid);
    }

    /* ---- receiving side -------------------------------------------- */

    /// Anyone: pay order (`kaynakZincir`, id) in this chain's dollars; the
    /// locked dollars on the source chain become `alacakli`'s.
    function doldur(uint32 kaynakZincir, bytes calldata m, bytes32 alacakli) external kilitli {
        (, uint64 id, bytes32 kaynak, bytes32 hedef, bytes memory veri, uint256 miktar) =
            abi.decode(m, (uint8, uint64, bytes32, bytes32, bytes, uint256));
        if (bekleyen[kaynakZincir][id] != keccak256(m) || alacakli == bytes32(0)) revert YanlisMesaj();
        delete bekleyen[kaynakZincir][id];
        if (miktar > 0) odeyen[kaynakZincir][id] = alacakli;   // nothing is locked at home for a payload
        if (!dolar.transferFrom(msg.sender, address(haberci), miktar)) revert TransferOlmadi();
        haberci.adaTeslim(kaynakZincir, kaynak, hedef, veri, miktar);
        emit Dolduruldu(kaynakZincir, id, msg.sender, alacakli);
    }

    /// Anyone (the payer, usually): send the receipts for paid orders `ids`
    /// of `kaynakZincir`, in one message, releasing their locked dollars.
    function bildir(uint32 kaynakZincir, uint64[] calldata ids, bytes calldata secenekler) external payable kilitli {
        if (ids.length == 0) revert YanlisMesaj();
        bytes32[] memory a = new bytes32[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            a[i] = odeyen[kaynakZincir][ids[i]];
            if (a[i] == bytes32(0)) revert YanlisMesaj();
            delete odeyen[kaynakZincir][ids[i]];
        }
        bytes32 guid = _gonder(kaynakZincir, abi.encode(ODENDI, ids, a), secenekler);
        for (uint256 i = 0; i < ids.length; i++) emit Bildirildi(kaynakZincir, ids[i], guid);
    }

    /// LayerZero's delivery. A revert leaves the message in LayerZero, to retry.
    function lzReceive(LzOrigin calldata o, bytes32, bytes calldata m, address, bytes calldata) external payable kilitli {
        if (msg.sender != address(ucNokta)) revert SadeceUcNokta();
        uint32 kz = zincirOf[o.srcEid];
        if (o.sender == bytes32(0) || o.sender != ikiz[kz] || eidOf[kz] != o.srcEid) revert YanlisMesaj();
        uint8 tur = uint8(uint256(bytes32(m[:32])));
        if (tur == TASI) {
            (, bytes[] memory ms) = abi.decode(m, (uint8, bytes[]));
            for (uint256 i = 0; i < ms.length; i++) _al(kz, ms[i]);
        } else if (tur == ODENDI) {
            (, uint64[] memory ids, bytes32[] memory a) = abi.decode(m, (uint8, uint64[], bytes32[]));
            for (uint256 i = 0; i < ids.length; i++) {
                Giden storage g = giden[ids[i]];
                uint256 n = g.kilitli;
                if (n == 0 || g.hedefZincir != kz) revert YanlisMesaj();
                g.kilitli = 0;
                address kime = Adres.evm(a[i]);
                if (!dolar.transfer(kime, n)) revert TransferOlmadi();
                emit Odendi(ids[i], kime, n);
            }
        } else {
            revert YanlisMesaj();
        }
    }

    /// One order of a batch. Without dollars it runs at once; if it cannot
    /// (its receiver reverts), it waits like any other order and anyone may
    /// run it again with `doldur` (paying 0), so one order never holds up
    /// the rest of its batch.
    function _al(uint32 kz, bytes memory m) internal {
        (, uint64 id, bytes32 kaynak, bytes32 hedef, bytes memory veri, uint256 miktar) =
            abi.decode(m, (uint8, uint64, bytes32, bytes32, bytes, uint256));
        if (miktar == 0) {
            try haberci.adaTeslim(kz, kaynak, hedef, veri, 0) { return; } catch {}
        }
        bekleyen[kz][id] = keccak256(m);
        emit Bekliyor(kz, id, miktar, m);
    }

    /// The endpoint asks before the first message on a path.
    function allowInitializePath(LzOrigin calldata o) external view returns (bool) {
        bytes32 k = ikiz[zincirOf[o.srcEid]];
        return k != bytes32(0) && k == o.sender;
    }

    function nextNonce(uint32, bytes32) external pure returns (uint64) { return 0; }

    function ucret(uint32 hedefZincir, bytes calldata m, bytes calldata secenekler) external view returns (uint256) {
        return ucNokta.quote(LzParams(eidOf[hedefZincir], ikiz[hedefZincir], m, secenekler, false), address(this)).nativeFee;
    }

    function _gonder(uint32 z, bytes memory m, bytes calldata secenekler) internal returns (bytes32) {
        bytes32 karsi = ikiz[z];
        if (karsi == bytes32(0)) revert IkizYok(z);
        return ucNokta.send{value: msg.value}(LzParams(eidOf[z], karsi, m, secenekler, false), msg.sender).guid;
    }
}
