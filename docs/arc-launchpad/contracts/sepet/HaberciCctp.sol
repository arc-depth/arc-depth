// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHaberci, IHaberAlici, IERC20S, Adres} from "./IHaberci.sol";
import {CctpMesaj, IMesajTasiyiciV2, ITokenMesajciV2} from "../nesil2/CctpMesaj.sol";

/// The LayerZero gate to chains without CCTP USDC (AdaKapisi.sol).
interface IAdaKapisi {
    function gonder(uint32 hedefZincir, bytes32 kaynak, bytes32 hedef, bytes calldata veri, uint256 miktar) external;
}

/// TokenMessengerV2's plain burn (no hook), used for chains in split mode.
interface ITokenMesajciV2Duz {
    function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken,
        bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external;
}

/// @title HaberciCctp — the basket system's messages and dollars over CCTP V2
///
/// ONE TRANSPORT FOR BOTH
///   Circle's CCTP V2 carries dollars with a payload (depositForBurnWithHook)
///   and payloads alone (MessageTransmitterV2.sendMessage). So a message and
///   the dollars it speaks of travel as ONE CCTP message and land in ONE
///   transaction: there is no state where the order has arrived and its
///   dollars have not, or the reverse. No second bridge, no reconciliation.
///
/// WHO IS TRUSTED FOR WHAT
///   Chains are named by their CCTP domain. Each Haberci knows its twin on
///   every other domain (`ikiz`, set once, then locked). A message is
///   accepted only if CCTP's attesters signed it, its destinationCaller is
///   this Haberci (so only this contract can submit it) and its sender is
///   the twin on the source domain: the burn's messageSender for dollars,
///   the message sender for a payload alone. The original caller on the
///   source chain rides inside the payload, written by the twin, so the
///   receiver can trust `kaynak` as much as it trusts the twin.
///
/// DELIVERY
///   Anyone may deliver (`teslim`): our relayer, an arbitrageur who wants an
///   auction to open, the founder. If the receiving contract reverts, the
///   whole delivery reverts and the CCTP message stays unused, to be
///   delivered again; the dollars never land anywhere but where they were
///   addressed.
///
/// SPLIT MODE (Sui)
///   On Sui, CCTP mints USDC to the mint recipient as an owned coin and
///   anyone can complete a burn message, so an order riding in a burn's hook
///   could be skipped. For a chain marked `ayri`, the dollars go as a plain
///   burn minted straight to the target object (the Sui vault), and the
///   order goes as a separate payload message to the twin, carrying the
///   dollar amount: abi.encode(kaynak, hedef, veri, miktar). Only the twin
///   package can stamp that message, so the order is carried out there or
///   not at all; the vault funds it once the coin has arrived.
///
/// ISLANDS (BNB, Robinhood)
///   Where Circle mints no USDC, a chain marked `ada` is reached through
///   the AdaKapisi over LayerZero: the dollars stay locked on the sending
///   chain and whoever pays the order in the island's own dollar is repaid
///   from them (see AdaKapisi). On an island itself this same contract runs
///   with no CCTP at all: every other chain is `ada` to it, and its dollar
///   is the island's (Dolar6 on BNB).
///
/// FEES
///   Standard finality (2000), maxFee 0: CCTP's standard transfer carries
///   no fee, so what is burned is what arrives. A receiver still uses the
///   amount that actually arrived, never the amount claimed.
contract HaberciCctp is IHaberci {
    using CctpMesaj for bytes;

    IERC20S public immutable usdc;
    IMesajTasiyiciV2 public immutable mesajTasiyici;
    ITokenMesajciV2 public immutable tokenMesajci;
    uint32 public immutable buDomain;

    uint32 public constant KESINLIK = 2000;

    mapping(uint32 => bytes32) public ikiz;
    /// chains that take dollars and orders as two messages (see above)
    mapping(uint32 => bool) public ayri;
    /// chains reached through the island gate, and the gate (set once)
    mapping(uint32 => bool) public ada;
    IAdaKapisi public adaKapisi;
    address public kurucu;

    bool private _kilit;

    event Gonderildi(uint32 indexed hedefZincir, address indexed kaynak, bytes32 indexed hedef, uint256 usdc);
    event Teslim(uint32 indexed kaynakZincir, bytes32 indexed kaynak, address indexed hedef, uint256 usdc);

    error SadeceKurucu();
    error ZatenBagli();
    error IkizYok(uint32 domain);
    error KotuMesaj();
    error SadeceTasiyici();
    error TransferOlmadi();
    error Yeniden_();

    modifier kilitli() {
        if (_kilit) revert Yeniden_();
        _kilit = true;
        _;
        _kilit = false;
    }

    constructor(IERC20S _usdc, IMesajTasiyiciV2 _mt, ITokenMesajciV2 _tm, uint32 _domain) {
        usdc = _usdc;
        mesajTasiyici = _mt;
        tokenMesajci = _tm;
        buDomain = _domain;
        kurucu = msg.sender;
    }

    function zincir() external view returns (uint32) { return buDomain; }

    /// `karsi` is 32 bytes: the twin may be an Aptos object, a Sui object or
    /// a Solana program address as well as an EVM contract.
    /// Once per chain, never changed; a chain reached through the island
    /// gate cannot also get a CCTP twin. New chains may be added until
    /// `kilitle`, none already set can be pointed elsewhere.
    function ikizEkle(uint32 domain, bytes32 karsi) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        if (ikiz[domain] != bytes32(0) || ada[domain] || karsi == bytes32(0)) revert ZatenBagli();
        ikiz[domain] = karsi;
    }

    function ayriYap(uint32 domain) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        ayri[domain] = true;
    }

    function adaKapisiKur(IAdaKapisi k) external {
        if (msg.sender != kurucu || address(adaKapisi) != address(0)) revert SadeceKurucu();
        adaKapisi = k;
    }

    function adaYap(uint32 domain) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        if (ikiz[domain] != bytes32(0)) revert ZatenBagli();   // a CCTP chain stays CCTP
        ada[domain] = true;
    }

    function kilitle() external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        kurucu = address(0);
    }

    /* ---- sending ---------------------------------------------------- */

    function gonder(uint32 hedefZincir, bytes32 hedef, bytes calldata veri, uint256 miktar) external {
        /* the same chain (the Defter and the Arc vault, for one): no bridge,
           the dollars and the call are handed over at once */
        if (hedefZincir == buDomain) {
            if (miktar > 0 && !usdc.transferFrom(msg.sender, address(this), miktar)) revert TransferOlmadi();
            _ilet(buDomain, Adres.b32(msg.sender), hedef, veri, miktar);
            emit Gonderildi(hedefZincir, msg.sender, hedef, miktar);
            return;
        }
        if (ada[hedefZincir]) {
            if (miktar > 0) {
                if (!usdc.transferFrom(msg.sender, address(this), miktar)) revert TransferOlmadi();
                if (!usdc.transfer(address(adaKapisi), miktar)) revert TransferOlmadi();
            }
            adaKapisi.gonder(hedefZincir, Adres.b32(msg.sender), hedef, veri, miktar);
            emit Gonderildi(hedefZincir, msg.sender, hedef, miktar);
            return;
        }
        bytes32 karsi = ikiz[hedefZincir];
        if (karsi == bytes32(0)) revert IkizYok(hedefZincir);
        if (ayri[hedefZincir]) {
            if (miktar > 0) {
                if (!usdc.transferFrom(msg.sender, address(this), miktar)) revert TransferOlmadi();
                usdc.approve(address(tokenMesajci), miktar);
                /* minted to the target itself; any relayer may deliver */
                ITokenMesajciV2Duz(address(tokenMesajci)).depositForBurn(miktar, hedefZincir, hedef, address(usdc), bytes32(0), 0, KESINLIK);
            }
            if (veri.length > 0) {
                mesajTasiyici.sendMessage(hedefZincir, karsi, karsi, KESINLIK, abi.encode(Adres.b32(msg.sender), hedef, veri, miktar));
            }
            emit Gonderildi(hedefZincir, msg.sender, hedef, miktar);
            return;
        }
        bytes memory yuk = abi.encode(Adres.b32(msg.sender), hedef, veri);
        if (miktar > 0) {
            if (!usdc.transferFrom(msg.sender, address(this), miktar)) revert TransferOlmadi();
            usdc.approve(address(tokenMesajci), miktar);
            tokenMesajci.depositForBurnWithHook(miktar, hedefZincir, karsi, address(usdc), karsi, 0, KESINLIK, yuk);
        } else {
            mesajTasiyici.sendMessage(hedefZincir, karsi, karsi, KESINLIK, yuk);
        }
        emit Gonderildi(hedefZincir, msg.sender, hedef, miktar);
    }

    /* ---- receiving -------------------------------------------------- */

    /// Deliver a CCTP message addressed to this Haberci, with its attestation.
    function teslim(bytes calldata mesaj, bytes calldata imza) external kilitli {
        CctpMesaj.Baslik memory b = mesaj.baslik();
        bytes32 ben = CctpMesaj.b32(address(this));
        if (b.hedefCagiran != ben) revert KotuMesaj();
        bytes32 karsi = ikiz[b.kaynakDomain];
        if (karsi == bytes32(0)) revert IkizYok(b.kaynakDomain);

        if (b.alici == ben) {
            /* a payload alone: CCTP calls handleReceiveFinalizedMessage below,
               which checks the sender and delivers */
            if (!mesajTasiyici.receiveMessage(mesaj, imza)) revert KotuMesaj();
            return;
        }

        /* dollars with a payload: the burn must be our twin's, minted to us */
        bytes calldata g = CctpMesaj.govde(mesaj);
        CctpMesaj.Yakim memory y = g.yakim();
        if (y.mintAlici != ben || y.mesajGonderen != karsi) revert KotuMesaj();
        uint256 once = usdc.balanceOf(address(this));
        if (!mesajTasiyici.receiveMessage(mesaj, imza)) revert KotuMesaj();
        uint256 gelen = usdc.balanceOf(address(this)) - once;
        if (gelen == 0) revert KotuMesaj();
        (bytes32 kaynak, bytes32 hedef, bytes memory veri) = abi.decode(CctpMesaj.kanca(g), (bytes32, bytes32, bytes));
        _ilet(b.kaynakDomain, kaynak, hedef, veri, gelen);
    }

    /// CCTP's call for a payload-only message, made during `teslim`.
    function handleReceiveFinalizedMessage(uint32 kaynakDomain, bytes32 gonderen, uint32, bytes calldata govde)
        external returns (bool)
    {
        if (msg.sender != address(mesajTasiyici)) revert SadeceTasiyici();
        if (!_kilit) revert SadeceTasiyici();   // only inside our own `teslim`
        if (gonderen != ikiz[kaynakDomain] || gonderen == bytes32(0)) revert KotuMesaj();
        (bytes32 kaynak, bytes32 hedef, bytes memory veri) = abi.decode(govde, (bytes32, bytes32, bytes));
        _ilet(kaynakDomain, kaynak, hedef, veri, 0);
        return true;
    }

    /// The island gate's delivery: the payer's dollars are already here.
    function adaTeslim(uint32 kz, bytes32 kaynak, bytes32 hedef, bytes calldata veri, uint256 miktar) external {
        if (msg.sender != address(adaKapisi) || !ada[kz]) revert SadeceTasiyici();
        _ilet(kz, kaynak, hedef, veri, miktar);
    }

    /// Below standard finality is never asked for, so never accepted.
    function handleReceiveUnfinalizedMessage(uint32, bytes32, uint32, bytes calldata) external pure returns (bool) {
        revert KotuMesaj();
    }

    function _ilet(uint32 kz, bytes32 kaynak, bytes32 hedef32, bytes memory veri, uint256 miktar) internal {
        address hedef = Adres.evm(hedef32);
        if (miktar > 0 && !usdc.transfer(hedef, miktar)) revert TransferOlmadi();
        if (veri.length > 0) IHaberAlici(hedef).haberAl(kz, kaynak, veri, miktar);
        emit Teslim(kz, kaynak, hedef, miktar);
    }
}
