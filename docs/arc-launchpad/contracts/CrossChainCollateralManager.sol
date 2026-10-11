// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CrossChainAccounting} from "./CrossChainAccounting.sol";
import {CrossChainAssetRegistry} from "./CrossChainAssetRegistry.sol";

/// The vault performs the burn. The manager never holds a token.
interface IKopruKasasi {
    /// Burn `miktar` of the quote through CCTP toward `cctpDomain`,
    /// crediting `mintRecipient`.
    ///
    /// The vault re-derives `mintRecipient` from the registry and reverts
    /// if it disagrees. That second check is the point: even a compromised
    /// manager cannot name a destination, because the contract holding the
    /// money refuses to take its word for it.
    function kopruyeGonder(
        uint32 cctpDomain,
        uint256 miktar,
        bytes32 mintRecipient,
        uint256 azamiUcret,
        uint32 kesinlikEsigi,
        bytes calldata kanca
    ) external returns (uint64 cctpNonce);

    function quote() external view returns (address);
    function tokenId() external view returns (uint256);
    function dolasim() external view returns (uint256);
}

/// CCTP v2 calls this on the mint recipient when the burn carried hook
/// data. Signatures taken from Circle's published contract interfaces, not
/// guessed: a hand-written mismatch here means the router's call reverts
/// and the money sits unminted.
interface IMessageHandlerV2 {
    function handleReceiveFinalizedMessage(
        uint32 remoteDomain,
        bytes32 sender,
        uint32 finalityThresholdExecuted,
        bytes calldata messageBody
    ) external returns (bool);

    function handleReceiveUnfinalizedMessage(
        uint32 remoteDomain,
        bytes32 sender,
        uint32 finalityThresholdExecuted,
        bytes calldata messageBody
    ) external returns (bool);
}

/// @title CrossChainCollateralManager — who may move collateral, where to,
///        how much, and what happens when it goes wrong
///
/// WHAT IT DOES NOT DO
///   It holds no tokens. Every movement is performed by the vault, which
///   re-derives the destination itself. So the worst a broken manager can
///   do is refuse to work or ask for a transfer the vault will reject.
///
/// ANYBODY MAY TRIGGER; NOBODY MAY AIM
///   `transferBaslat` is permissionless, because a protocol whose defence
///   only runs when its authors' server is up is a protocol with a single
///   point of failure. What the caller supplies is WHETHER and HOW MUCH.
///   The destination comes from CREATE2 arithmetic over three immutables,
///   so "where" is not an input at any layer.
///
/// THE SEVEN CHECKS
///   Supported chain, derived vault, right token, amount inside the limits,
///   enough unencumbered collateral, cost below the economic threshold, and
///   not already done. Each one exists because its absence is an attack:
///   without the last, a replayed message doubles a credit; without the
///   sixth, a griefer burns the reserve in bridge fees ten dollars at a
///   time.
///
/// WHY THE STATE MACHINE IS EXPLICIT
///   A cross-chain operation is not atomic and pretending otherwise is how
///   funds get lost. Every transfer has an id and exactly one state, and
///   every transition is a named function with a guard. A transfer that
///   fails lands in a state that says so, and the only exit is back to the
///   vault that sent it.
contract CrossChainCollateralManager is IMessageHandlerV2 {
    enum Durum {
        YOK,                 // never created
        OLUSTURULDU,         // CREATED — recorded, nothing burned yet
        GONDERILDI,          // SENT — burned on Arc, in flight
        ULASTI,              // FILLED — remote vault confirmed receipt
        TAKAS_EDILDI,        // SWAPPED — remote vault bought the collateral
        DONUYOR,             // RETURNING — sold remotely, quote in flight back
        TAMAMLANDI,          // COMPLETED
        IADE_BEKLIYOR,       // REFUND_PENDING — failed, funds owed back
        IADE_EDILDI,         // REFUNDED
        KURTARILABILIR_HATA  // FAILED_RECOVERABLE
    }

    struct Transfer {
        Durum durum;
        uint32 cctpDomain;
        address varlik;        // what left Arc (the quote)
        uint256 miktar;
        uint64 cctpNonce;
        uint64 blok;
        address tetikleyen;
    }

    CrossChainAccounting public immutable defter;
    CrossChainAssetRegistry public immutable kayit;
    IKopruKasasi public immutable kasa;
    address public immutable quote;
    uint256 public immutable tokenId;

    /* ---- limits -----------------------------------------------------
       These are the numbers that stop a permissionless trigger from being
       a permissionless drain. Immutable, because a settable limit is an
       admin key wearing a different hat. */

    /// Most of the unencumbered reserve one transfer may move, in bps.
    uint256 public constant ISLEM_TAVANI_BPS = 2_000;        // 20%

    /// Most that may leave across a window, in bps of the reserve measured
    /// at the start of the window.
    uint256 public constant DONEM_TAVANI_BPS = 4_000;        // 40%

    /// Window length. 7200 blocks is ~1.01 hours at Arc's measured
    /// 0.507 s/block — the same window the vault's buyback uses, written
    /// down in blocks for the same reason.
    uint256 public constant DONEM_BLOK = 7_200;

    /// Below this a transfer is refused: bridging small change costs more
    /// in fees than it moves, and letting anyone do it repeatedly is a way
    /// to burn the reserve without ever stealing it.
    uint256 public constant ASGARI_TRANSFER = 100e6;          // $100

    /// Most of the transferred amount that may be spent on bridge fees.
    uint256 public constant AZAMI_UCRET_BPS = 50;             // 0.50%

    /// CCTP finality thresholds. 1000 is Confirmed (seconds, small fee),
    /// 2000 is Finalized (free, slower). Measured from Circle's fee
    /// service: outbound from Arc, both are free.
    uint32 public constant KESINLIK_HIZLI = 1_000;
    uint32 public constant KESINLIK_KESIN = 2_000;

    mapping(bytes32 => Transfer) public transferler;
    bytes32[] public transferIdler;

    /// Replay protection for inbound messages, keyed by what CCTP gives
    /// the handler. A message is processed once, ever.
    mapping(bytes32 => bool) public mesajGorulduMu;

    /// Window accounting for outbound volume.
    uint64 public donemBaslangicBlok;
    uint256 public donemdeCikan;
    uint256 public donemTavani;

    /// The one address allowed to deliver an inbound report.
    ///
    /// In production this is the BRIDGE VAULT, not CCTP. CCTP calls the
    /// hook handler on whoever receives the mint, and that has to be the
    /// vault — the money must land where the money lives, and this
    /// manager holds no tokens by design. The vault proves CCTP
    /// delivered; this contract proves the sender is the derived remote
    /// vault, that the report is new, and that the transition is legal.
    ///
    /// The field used to be called `mesajTasiyici`, which named the wrong
    /// contract entirely. A misleading name on a security-critical
    /// address is how a deployment gets wired to the wrong thing later.
    address public immutable raporlayici;

    error KotuKurulum();
    error ZincirDesteklenmiyor(uint32 domain);
    error AzMiktar(uint256 istenen, uint256 asgari);
    error IslemTavani(uint256 istenen, uint256 tavan);
    error DonemTavani(uint256 istenen, uint256 kalan);
    error YetersizTeminat(uint256 istenen, uint256 var_);
    error TekrarTransfer(bytes32 id);
    error KotuDurum(bytes32 id, Durum simdiki);
    error SadeceTasiyici();
    error MesajTekrari(bytes32 anahtar);
    error KotuGonderen(uint32 domain, bytes32 gonderen);
    error UcretCokYuksek(uint256 ucret, uint256 tavan);

    event TransferOlusturuldu(bytes32 indexed id, uint32 indexed domain, uint256 miktar, address tetikleyen);
    event TransferGonderildi(bytes32 indexed id, uint64 cctpNonce, bytes32 mintRecipient);
    event TransferUlasti(bytes32 indexed id, uint256 miktar);
    event TransferTakasEdildi(bytes32 indexed id, address alinan, uint256 alinanMiktar);
    event TransferDonuyor(bytes32 indexed id, address satilan, uint256 satilanMiktar, uint256 beklenenQuote);
    event TransferTamamlandi(bytes32 indexed id, uint256 donenMiktar);
    event TransferIadeBekliyor(bytes32 indexed id, string sebep);
    event TransferIadeEdildi(bytes32 indexed id, uint256 miktar);

    constructor(
        CrossChainAccounting _defter,
        CrossChainAssetRegistry _kayit,
        IKopruKasasi _kasa,
        address _raporlayici
    ) {
        if (address(_defter) == address(0) || address(_kayit) == address(0)) revert KotuKurulum();
        if (address(_kasa) == address(0) || _raporlayici == address(0)) revert KotuKurulum();
        defter = _defter;
        kayit = _kayit;
        kasa = _kasa;
        raporlayici = _raporlayici;
        quote = _kasa.quote();
        tokenId = _kasa.tokenId();
        if (quote == address(0)) revert KotuKurulum();
    }

    /* ---- the window ------------------------------------------------- */

    function _donemiTazele(uint256 rezerv) private {
        if (block.number >= uint256(donemBaslangicBlok) + DONEM_BLOK) {
            donemBaslangicBlok = uint64(block.number);
            donemdeCikan = 0;
            /* The ceiling is fixed when the window opens. Recomputing it
               from a shrinking balance on every call would let a sequence
               of transfers each pass a smaller test and together exceed the
               limit — the same mistake the vault's buyback window made,
               found there by measurement. */
            donemTavani = (rezerv * DONEM_TAVANI_BPS) / 10_000;
        }
    }

    function donemdeKalan() public view returns (uint256) {
        if (block.number >= uint256(donemBaslangicBlok) + DONEM_BLOK) {
            return type(uint256).max;        // a fresh window
        }
        return donemTavani > donemdeCikan ? donemTavani - donemdeCikan : 0;
    }

    /* ---- outbound --------------------------------------------------- */

    /// Deterministic id, so the same transfer cannot be created twice and
    /// anyone can compute it off chain to check a state.
    function transferIdHesapla(uint32 cctpDomain, uint256 miktar, uint256 sira)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(address(this), tokenId, cctpDomain, miktar, sira));
    }

    /// Move unencumbered quote toward `cctpDomain`.
    ///
    /// Permissionless. The caller supplies the chain and the amount; the
    /// destination is derived, and the vault re-derives it again.
    function transferBaslat(uint32 cctpDomain, uint256 miktar, bool hizli)
        external
        returns (bytes32 id)
    {
        /* 1 — the chain is one this system knows. */
        if (!kayit.destekliMi(cctpDomain)) revert ZincirDesteklenmiyor(cctpDomain);

        /* 2 — worth doing at all. */
        if (miktar < ASGARI_TRANSFER) revert AzMiktar(miktar, ASGARI_TRANSFER);

        /* 3 — enough collateral that is not owed to a redeemer. The ledger
           answers this, not a balance: money in flight is not available and
           money owed is not either. */
        uint256 serbest = defter.harcanabilir(quote);
        if (miktar > serbest) revert YetersizTeminat(miktar, serbest);

        /* 4 — one transfer's share. */
        uint256 tavan = (serbest * ISLEM_TAVANI_BPS) / 10_000;
        if (miktar > tavan) revert IslemTavani(miktar, tavan);

        /* 5 — the window. */
        _donemiTazele(serbest);
        uint256 kalan = donemTavani > donemdeCikan ? donemTavani - donemdeCikan : 0;
        if (miktar > kalan) revert DonemTavani(miktar, kalan);

        /* 6 — not a duplicate. The sequence number is the count of
           transfers already made, so the same (chain, amount) pair can
           legitimately happen twice without colliding. */
        id = transferIdHesapla(cctpDomain, miktar, transferIdler.length);
        if (transferler[id].durum != Durum.YOK) revert TekrarTransfer(id);

        /* 7 — the fee ceiling, so a griefer cannot bleed the reserve
           through bridge costs. */
        uint256 azamiUcret = (miktar * AZAMI_UCRET_BPS) / 10_000;

        transferler[id] = Transfer({
            durum: Durum.OLUSTURULDU,
            cctpDomain: cctpDomain,
            varlik: quote,
            miktar: miktar,
            cctpNonce: 0,
            blok: uint64(block.number),
            tetikleyen: msg.sender
        });
        transferIdler.push(id);
        donemdeCikan += miktar;
        emit TransferOlusturuldu(id, cctpDomain, miktar, msg.sender);

        /* The ledger moves BEFORE the burn. If the burn reverts the whole
           transaction unwinds, and if it succeeds the ledger already says
           the money is in flight — there is no instant where the claim has
           dropped and nothing has been recorded. */
        defter.yolaCikti(quote, miktar, id);

        bytes32 alici = kayit.uzakKasaBytes32(cctpDomain, tokenId);

        /* Hook data tells the remote vault which token the arriving money
           belongs to, atomically with the mint. Without it the remote vault
           would have to be told in a separate message, and a separate
           message is a thing that can arrive late, twice, or never. */
        bytes memory kanca = abi.encode(tokenId, id);

        uint64 nonce = kasa.kopruyeGonder(
            cctpDomain,
            miktar,
            alici,
            azamiUcret,
            hizli ? KESINLIK_HIZLI : KESINLIK_KESIN,
            kanca
        );

        transferler[id].durum = Durum.GONDERILDI;
        transferler[id].cctpNonce = nonce;
        emit TransferGonderildi(id, nonce, alici);
    }

    /* ---- inbound: CCTP's own handler -------------------------------- */

    /// What the bridge vault calls after CCTP delivered a report to it.
    ///
    /// The canonical entry: the two handleReceive* functions below
    /// forward here, so the verification lives in one place whether CCTP
    /// reaches this contract directly or through the vault.
    function uzaktanRapor(uint32 remoteDomain, bytes32 gonderen, bytes calldata govde)
        external
    {
        _isle(remoteDomain, gonderen, 0, govde);
    }

    /// A finalized message. Credited the same way as an unfinalized one,
    /// because the ledger's buckets already encode "not certain yet" and a
    /// second notion of finality on top of them would be two sources of
    /// truth about the same amount.
    function handleReceiveFinalizedMessage(
        uint32 remoteDomain,
        bytes32 gonderen,
        uint32 kesinlik,
        bytes calldata govde
    ) external override returns (bool) {
        _isle(remoteDomain, gonderen, kesinlik, govde);
        return true;
    }

    function handleReceiveUnfinalizedMessage(
        uint32 remoteDomain,
        bytes32 gonderen,
        uint32 kesinlik,
        bytes calldata govde
    ) external override returns (bool) {
        _isle(remoteDomain, gonderen, kesinlik, govde);
        return true;
    }

    /// What a remote vault can tell us. Anything else is rejected rather
    /// than ignored: an unknown report is a bug or an attack, and silently
    /// returning true would hide both.
    enum Rapor { ULASTI, TAKAS, GERI_TAKAS, DONDU, HATA }

    function _isle(
        uint32 remoteDomain,
        bytes32 gonderen,
        uint32,
        bytes calldata govde
    ) private {
        /* Only the vault may deliver, and it only does so after CCTP
           called it. Two hops, each authenticating its own caller. */
        if (msg.sender != raporlayici) revert SadeceTasiyici();

        /* And only from the address this system derives for this token on
           that chain. Not a stored allow-list — a derivation, so a forged
           sender is not expressible rather than merely rejected. */
        if (!kayit.dogruKasaMiBytes32(remoteDomain, tokenId, gonderen)) {
            revert KotuGonderen(remoteDomain, gonderen);
        }

        (Rapor tur, bytes32 id, address varlikA, uint256 miktarA, uint256 miktarB) =
            abi.decode(govde, (Rapor, bytes32, address, uint256, uint256));

        /* Replay: keyed by the domain, the sender and the message body, so
           the same report cannot be delivered twice even if CCTP would
           allow it. */
        bytes32 anahtar = keccak256(abi.encode(remoteDomain, gonderen, govde));
        if (mesajGorulduMu[anahtar]) revert MesajTekrari(anahtar);
        mesajGorulduMu[anahtar] = true;

        Transfer storage t = transferler[id];

        if (tur == Rapor.ULASTI) {
            if (t.durum != Durum.GONDERILDI) revert KotuDurum(id, t.durum);
            defter.uzaktaOnaylandi(t.varlik, miktarA, id);
            t.durum = Durum.ULASTI;
            emit TransferUlasti(id, miktarA);
            return;
        }

        if (tur == Rapor.TAKAS) {
            /* The quote is gone and a different asset is held. Crossing
               assets is why the ledger has a dedicated transition: doing it
               as a retire-then-credit pair is how an amount gets counted
               twice. */
            if (t.durum != Durum.GONDERILDI && t.durum != Durum.ULASTI) {
                revert KotuDurum(id, t.durum);
            }
            if (t.durum == Durum.ULASTI) {
                /* Already moved out of YOLDA by the ULASTI report, so put
                   it back before the cross-asset move, keeping every
                   transition a legal one. */
                defter.donusBasladi(t.varlik, miktarA, id);
            }
            defter.uzaktaTakasOnaylandi(t.varlik, miktarA, varlikA, miktarB, id);
            t.durum = Durum.TAKAS_EDILDI;
            emit TransferTakasEdildi(id, varlikA, miktarB);
            return;
        }

        if (tur == Rapor.GERI_TAKAS) {
            if (t.durum != Durum.TAKAS_EDILDI) revert KotuDurum(id, t.durum);
            defter.uzaktaGeriTakasOnaylandi(varlikA, miktarA, t.varlik, miktarB, id);
            t.durum = Durum.DONUYOR;
            emit TransferDonuyor(id, varlikA, miktarA, miktarB);
            return;
        }

        if (tur == Rapor.DONDU) {
            if (t.durum != Durum.DONUYOR && t.durum != Durum.GONDERILDI) {
                revert KotuDurum(id, t.durum);
            }
            defter.geriDondu(t.varlik, miktarA, id);
            t.durum = Durum.TAMAMLANDI;
            emit TransferTamamlandi(id, miktarA);
            return;
        }

        /* Rapor.HATA — the remote side could not do what it was asked.
           The funds are not written off: they are still in flight or
           remote, and the only exit is a refund to the vault that sent
           them. Marking the state is what lets a keeper find it. */
        t.durum = Durum.IADE_BEKLIYOR;
        emit TransferIadeBekliyor(id, "uzak taraf bildirdi");
    }

    /* ---- refunds ---------------------------------------------------- */

    /// A refund arrived back on Arc for a failed transfer.
    ///
    /// Only reachable from the inbound handler's verified path in practice;
    /// exposed separately so a keeper can close the ledger once the money
    /// is demonstrably back. The amount is bounded by what the transfer
    /// moved, so a bad call cannot credit more than left.
    function iadeKapat(bytes32 id, uint256 miktar) external {
        Transfer storage t = transferler[id];
        if (t.durum != Durum.IADE_BEKLIYOR) revert KotuDurum(id, t.durum);
        if (miktar > t.miktar) revert IslemTavani(miktar, t.miktar);
        defter.yoldaIptal(t.varlik, miktar, id);
        t.durum = Durum.IADE_EDILDI;
        emit TransferIadeEdildi(id, miktar);
    }

    /* ---- reads ------------------------------------------------------ */

    function transferSayisi() external view returns (uint256) {
        return transferIdler.length;
    }

    function durumu(bytes32 id) external view returns (Durum) {
        return transferler[id].durum;
    }

    /// What `transferBaslat` would allow right now, so a caller does not
    /// have to simulate a revert to find out.
    function transferEdilebilir() external view returns (uint256) {
        uint256 serbest = defter.harcanabilir(quote);
        uint256 tavan = (serbest * ISLEM_TAVANI_BPS) / 10_000;
        uint256 kalan = donemdeKalan();
        uint256 en = tavan < serbest ? tavan : serbest;
        if (kalan < en) en = kalan;
        return en < ASGARI_TRANSFER ? 0 : en;
    }
}
