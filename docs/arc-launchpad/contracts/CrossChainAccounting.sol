// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title CrossChainAccounting — the ledger that lets a vault own what it
///        does not hold
///
/// WHY THIS CONTRACT EXISTS
///   Measured on the current vault: move 60% of a $100 reserve toward
///   another chain and a holder redeeming at that moment is paid $2.00
///   instead of $5.00. Not late — SHORT, and permanently. The loss tracked
///   the bridged fraction exactly, which is what proves it was an
///   accounting gap rather than a market effect.
///
///   The gap is that `hak()` was `balanceOf / circulating` and nothing
///   else, so value the vault owned but did not hold was invisible. This
///   ledger makes it visible, in three buckets that an amount belongs to
///   exactly one of:
///
///     MUSAIT     on Arc, payable this second
///     YOLDA      burned here, not yet confirmed there
///     UZAK       confirmed held by a verified remote vault
///
/// WHY COUNTING `YOLDA` IS A FACT AND NOT A TRUST ASSUMPTION
///   This is the load-bearing question, because counting value that is not
///   here is exactly how a protocol lies about its reserves.
///
///   It is sound here for a narrow reason: the burn happened on THIS chain,
///   in a call this contract made, so the amount is first-hand knowledge
///   rather than a report. And CCTP fixes `mintRecipient` at burn time, so
///   the only address that can ever receive the mint is the remote vault
///   this system computed. Anyone may submit the attestation — the funds
///   are not at anybody's discretion. What is uncertain is WHEN, not
///   WHETHER, and timing is what the buckets are for.
///
///   If that stopped being true — if a bridge could redirect or destroy an
///   in-flight amount — then `YOLDA` would have to be written down to zero
///   and this design would be wrong. So the property is named here rather
///   than assumed.
///
/// AND WHY A REDEEMER IS NOT PAID OUT OF `YOLDA`
///   The claim counts it; the payout cannot. So a redemption during flight
///   pays what is here and records the remainder as a DEBT against the
///   asset. That debt then does two things, both necessary:
///
///     - it is subtracted from the claim, so the holders who stayed do not
///       see their claim inflated by value already promised to somebody who
///       left;
///     - it is subtracted from what a buyback may spend, so the defence
///       cannot spend money that is owed.
///
///   A liability that only reduced one of those two would be a way to pay
///   the same dollar twice.
///
/// THIS CONTRACT MOVES NOTHING
///   It holds no tokens and makes no transfers. It is a ledger the vault
///   owns and writes through, which is why it can be reasoned about and
///   tested without a bridge, a pool or a chain.
contract CrossChainAccounting {
    /* The claim is reported at 1e36 so a memecoin's per-token share does
       not round to zero: a $20 reserve over a billion tokens is 2e-11, and
       at 1e18 scale that is 20,000,000 — fine — but a reserve of a few
       cents over the same supply would not be. 1e36 costs nothing and
       removes the question. */
    uint256 public constant HAK_OLCEGI = 1e36;

    /// The vault that owns this ledger. Immutable, set at construction.
    /// Not an owner: there is no function to change it, and the vault
    /// itself has no owner either.
    address public immutable kasa;

    /// The cross-chain manager, which writes the transitions the vault
    /// does not: in flight, remote, swapped, returning.
    ///
    /// It cannot be a constructor argument, because the manager needs this
    /// ledger's address and this ledger would need the manager's. The same
    /// circularity appeared between the curve and its vault and was solved
    /// the same way: a pointer the owner sets ONCE and nobody can set
    /// again. One precedent, one pattern, one thing to audit.
    address public yonetici;

    struct Kova {
        uint256 musait;     // on Arc, payable now
        uint256 yolda;      // burned here, not yet confirmed there
        uint256 uzak;       // confirmed held remotely
        uint256 borc;       // owed to redeemers who have already burned
    }

    /// asset => buckets
    mapping(address => Kova) private _kova;

    /// Assets this ledger has ever seen, so totals can be summed without
    /// the caller having to remember the list.
    address[] public varliklar;
    mapping(address => bool) public kayitli;

    error SadeceKasa();
    error YetersizMusait(uint256 istenen, uint256 var_);
    error YetersizYolda(uint256 istenen, uint256 var_);
    error YetersizUzak(uint256 istenen, uint256 var_);
    error SifirMiktar();
    error BorcAsiyor(uint256 istenen, uint256 borc);

    event Girdi(address indexed varlik, uint256 miktar);
    event YolaCikti(address indexed varlik, uint256 miktar, bytes32 indexed transferId);
    event UzaktaOnaylandi(address indexed varlik, uint256 miktar, bytes32 indexed transferId);
    event DonusBasladi(address indexed varlik, uint256 miktar, bytes32 indexed transferId);
    event UzaktaTakasOnaylandi(
        address indexed verilen,
        uint256 verilenMiktar,
        address indexed alinan,
        uint256 alinanMiktar,
        bytes32 indexed transferId
    );
    event GeriDondu(address indexed varlik, uint256 miktar, bytes32 indexed transferId);
    event YoldaIptal(address indexed varlik, uint256 miktar, bytes32 indexed transferId);
    event BorcYazildi(address indexed varlik, uint256 miktar);
    event BorcKapandi(address indexed varlik, uint256 miktar);
    event Harcandi(address indexed varlik, uint256 miktar);
    event YoneticiAyarlandi(address yonetici);

    /// The vault only. Local events: money arriving, being paid out,
    /// being spent, a debt opening or closing.
    modifier sadeceKasa() {
        if (msg.sender != kasa) revert SadeceKasa();
        _;
    }

    /// The vault or the manager. The cross-chain transitions, which the
    /// vault may also drive directly — a transfer it initiates itself is
    /// the same ledger movement as one the manager initiates.
    modifier kasaYaDaYonetici() {
        if (msg.sender != kasa && msg.sender != yonetici) revert SadeceKasa();
        _;
    }

    /// Settable once, by the vault, while empty.
    function yoneticiyiAyarla(address _yonetici) external {
        if (msg.sender != kasa) revert SadeceKasa();
        if (yonetici != address(0) || _yonetici == address(0)) revert SadeceKasa();
        yonetici = _yonetici;
        emit YoneticiAyarlandi(_yonetici);
    }

    constructor(address _kasa) {
        if (_kasa == address(0)) revert SadeceKasa();
        kasa = _kasa;
    }

    /* ---- reads ------------------------------------------------------ */

    function kova(address varlik) external view returns (Kova memory) {
        return _kova[varlik];
    }

    function varlikSayisi() external view returns (uint256) {
        return varliklar.length;
    }

    /// Everything the token economically owns of this asset, net of what is
    /// already promised to redeemers.
    ///
    /// This is the number a claim is computed from, and the reason a
    /// transfer to another chain no longer moves it: an amount leaving
    /// MUSAIT arrives in YOLDA, and the sum is unchanged.
    function ekonomik(address varlik) public view returns (uint256) {
        Kova storage k = _kova[varlik];
        uint256 brut = k.musait + k.yolda + k.uzak;
        return brut > k.borc ? brut - k.borc : 0;
    }

    /// What can actually be paid out or spent right now. Only MUSAIT, and
    /// only the part of it that is not owed.
    function harcanabilir(address varlik) public view returns (uint256) {
        Kova storage k = _kova[varlik];
        return k.musait > k.borc ? k.musait - k.borc : 0;
    }

    /// The claim per token, scaled by HAK_OLCEGI.
    ///
    /// `dolasim` is passed in rather than read, because circulating supply
    /// is the token's business and this ledger has no opinion about which
    /// balances count as issued.
    function hak(address varlik, uint256 dolasim) external view returns (uint256) {
        if (dolasim == 0) return 0;
        return (ekonomik(varlik) * HAK_OLCEGI) / dolasim;
    }

    /* ---- writes: only the vault, and only valid transitions --------- */

    function _tani(address varlik) private {
        if (!kayitli[varlik]) {
            kayitli[varlik] = true;
            varliklar.push(varlik);
        }
    }

    /// Collateral arrived on Arc — a launch deposit, a trading tax, a whale
    /// shield charge, a graduation surplus, or an unsolicited transfer from
    /// any of CCTP's 25 domains. All of those are the same event from here:
    /// MUSAIT grew.
    function girdi(address varlik, uint256 miktar) external sadeceKasa {
        if (miktar == 0) revert SifirMiktar();
        _tani(varlik);
        _kova[varlik].musait += miktar;
        emit Girdi(varlik, miktar);
    }

    /// A cross-chain transfer has been initiated: the amount is no longer
    /// here and is not yet there.
    ///
    /// The claim does not move. That is the whole point of this function
    /// existing instead of a plain subtraction.
    function yolaCikti(address varlik, uint256 miktar, bytes32 transferId)
        external
        kasaYaDaYonetici
    {
        if (miktar == 0) revert SifirMiktar();
        Kova storage k = _kova[varlik];
        /* Only unencumbered MUSAIT may be sent. Sending money that is owed
           to a redeemer would make the debt unpayable. */
        uint256 serbest = harcanabilir(varlik);
        if (miktar > serbest) revert YetersizMusait(miktar, serbest);
        k.musait -= miktar;
        k.yolda += miktar;
        emit YolaCikti(varlik, miktar, transferId);
    }

    /// The remote vault's receipt has been verified.
    function uzaktaOnaylandi(address varlik, uint256 miktar, bytes32 transferId)
        external
        kasaYaDaYonetici
    {
        if (miktar == 0) revert SifirMiktar();
        Kova storage k = _kova[varlik];
        if (miktar > k.yolda) revert YetersizYolda(miktar, k.yolda);
        k.yolda -= miktar;
        k.uzak += miktar;
        emit UzaktaOnaylandi(varlik, miktar, transferId);
    }

    /// The remote vault received the quote and bought the collateral.
    ///
    /// This is the transition the feature exists for, and it crosses
    /// assets: the USDC that left Arc is gone, and what is held remotely
    /// is a different token. Every other transition stays inside one
    /// asset, so without this the manager would have to retire the USDC
    /// and credit the collateral in two separate calls — and two calls is
    /// how an amount gets counted twice.
    ///
    /// WHY THE INCOMING SIDE IS NOT WORTH WHAT THE OUTGOING SIDE WAS
    ///   It would be convenient to carry the dollar figure across. It
    ///   would also be false: the moment USDC becomes PEPE, the amount is
    ///   a quantity of PEPE and its dollar value is whatever PEPE is
    ///   worth. The ledger is keyed by asset precisely so this cannot be
    ///   fudged — the collateral lands in its OWN bucket and is valued by
    ///   its own feed, and an asset with no feed is worth zero.
    ///   Unverified market value never joins the guaranteed dollar base.
    function uzaktaTakasOnaylandi(
        address verilen,
        uint256 verilenMiktar,
        address alinan,
        uint256 alinanMiktar,
        bytes32 transferId
    ) external kasaYaDaYonetici {
        if (verilenMiktar == 0 || alinanMiktar == 0) revert SifirMiktar();
        Kova storage v = _kova[verilen];
        /* The spent side must have been in flight. A swap cannot be
           confirmed against money the ledger never sent. */
        if (verilenMiktar > v.yolda) revert YetersizYolda(verilenMiktar, v.yolda);
        v.yolda -= verilenMiktar;

        _tani(alinan);
        _kova[alinan].uzak += alinanMiktar;

        emit UzaktaTakasOnaylandi(verilen, verilenMiktar, alinan, alinanMiktar, transferId);
    }

    /// The remote vault sold the collateral back to the quote.
    ///
    /// The mirror of the above: the collateral leaves REMOTE and the quote
    /// enters IN_TRANSIT, because it is on its way back and not yet here.
    function uzaktaGeriTakasOnaylandi(
        address satilan,
        uint256 satilanMiktar,
        address alinan,
        uint256 alinanMiktar,
        bytes32 transferId
    ) external kasaYaDaYonetici {
        if (satilanMiktar == 0 || alinanMiktar == 0) revert SifirMiktar();
        Kova storage sv = _kova[satilan];
        if (satilanMiktar > sv.uzak) revert YetersizUzak(satilanMiktar, sv.uzak);
        sv.uzak -= satilanMiktar;

        _tani(alinan);
        _kova[alinan].yolda += alinanMiktar;

        emit UzaktaTakasOnaylandi(satilan, satilanMiktar, alinan, alinanMiktar, transferId);
    }

    /// The remote vault has been instructed to sell and send back.
    function donusBasladi(address varlik, uint256 miktar, bytes32 transferId)
        external
        kasaYaDaYonetici
    {
        if (miktar == 0) revert SifirMiktar();
        Kova storage k = _kova[varlik];
        if (miktar > k.uzak) revert YetersizUzak(miktar, k.uzak);
        k.uzak -= miktar;
        k.yolda += miktar;
        emit DonusBasladi(varlik, miktar, transferId);
    }

    /// Funds arrived back on Arc.
    function geriDondu(address varlik, uint256 miktar, bytes32 transferId)
        external
        kasaYaDaYonetici
    {
        if (miktar == 0) revert SifirMiktar();
        Kova storage k = _kova[varlik];
        if (miktar > k.yolda) revert YetersizYolda(miktar, k.yolda);
        k.yolda -= miktar;
        k.musait += miktar;
        emit GeriDondu(varlik, miktar, transferId);
    }

    /// A bridge transfer failed and the funds were returned to the source.
    ///
    /// Separate from `geriDondu` only in the event it emits: the ledger
    /// movement is identical, and conflating them would make a failure
    /// indistinguishable from a completed round trip in the log.
    function yoldaIptal(address varlik, uint256 miktar, bytes32 transferId)
        external
        kasaYaDaYonetici
    {
        if (miktar == 0) revert SifirMiktar();
        Kova storage k = _kova[varlik];
        if (miktar > k.yolda) revert YetersizYolda(miktar, k.yolda);
        k.yolda -= miktar;
        k.musait += miktar;
        emit YoldaIptal(varlik, miktar, transferId);
    }

    /// A redeemer's unpaid remainder becomes a debt against this asset.
    ///
    /// It reduces the claim AND what a buyback may spend, because the money
    /// is spoken for. Reducing only one of the two would be a way to pay
    /// the same dollar twice.
    function borcYaz(address varlik, uint256 miktar) external sadeceKasa {
        if (miktar == 0) revert SifirMiktar();
        _tani(varlik);
        _kova[varlik].borc += miktar;
        emit BorcYazildi(varlik, miktar);
    }

    /// A debt was paid.
    function borcKapat(address varlik, uint256 miktar) external sadeceKasa {
        Kova storage k = _kova[varlik];
        if (miktar == 0) revert SifirMiktar();
        if (miktar > k.borc) revert BorcAsiyor(miktar, k.borc);
        if (miktar > k.musait) revert YetersizMusait(miktar, k.musait);
        k.borc -= miktar;
        k.musait -= miktar;
        emit BorcKapandi(varlik, miktar);
    }

    /// The vault paid or spent available collateral: a redemption's
    /// immediate portion, a buyback, a keeper reward, a conversion loan.
    function harca(address varlik, uint256 miktar) external sadeceKasa {
        if (miktar == 0) revert SifirMiktar();
        uint256 serbest = harcanabilir(varlik);
        if (miktar > serbest) revert YetersizMusait(miktar, serbest);
        _kova[varlik].musait -= miktar;
        emit Harcandi(varlik, miktar);
    }

    /* ---- the invariant, as a view ----------------------------------- */

    /// Does this asset's ledger still add up against a real balance?
    ///
    /// MUSAIT is the only bucket backed by tokens on this chain, so the
    /// vault's balance must be at least MUSAIT. More is allowed and is not
    /// an error: an unsolicited transfer lands in the balance before the
    /// vault has credited it, and that gap is exactly what a sweep closes.
    function tutarliMi(address varlik, uint256 kasaBakiyesi)
        external
        view
        returns (bool tutarli, uint256 kredilenmemis)
    {
        uint256 m = _kova[varlik].musait;
        tutarli = kasaBakiyesi >= m;
        kredilenmemis = kasaBakiyesi > m ? kasaBakiyesi - m : 0;
    }
}
