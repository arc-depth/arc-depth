// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CrossChainAccounting} from "./CrossChainAccounting.sol";
import {CrossChainAssetRegistry} from "./CrossChainAssetRegistry.sol";

interface IERC20K2 {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface ITokenMessengerK {
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external;
}

interface IYakilabilirK {
    function burn(uint256 v) external;
    function burnFrom(address who, uint256 v) external;
    function totalSupply() external view returns (uint256);
}

interface IGeriAlimAliciK {
    function geriAlimCagrisi(address varlik, uint256 harcama, bytes calldata veri) external;
}

interface IYonetici {
    /// The manager's own verification happens inside. This vault only
    /// proves that CCTP delivered the message; the manager proves that the
    /// sender is the derived remote vault, that the report is new, and that
    /// the state transition is legal.
    function uzaktanRapor(uint32 remoteDomain, bytes32 gonderen, bytes calldata govde) external;
}

/// @title KopruKasasi — the Arc-side contract that holds cross-chain
///        collateral and is the only thing that can move it
///
/// WHAT THIS IS
///   The complete vault for a token whose reserve may live on more than one
///   chain. It holds the quote, owns the ledger, performs the real CCTP
///   burn, relays inbound reports to the manager, pays redemptions, and
///   runs the buyback floor. Redemption and buyback are HERE and not in a
///   companion contract on purpose: two contracts holding collateral for
///   one token would split the claim, which is worse than having no
///   cross-chain at all.
///
///   TeminatKasasi is untouched and keeps serving the tokens already using
///   it. A token uses one vault or the other, never both.
///
/// WHAT THE GUARANTEE COVERS, AND WHAT IT DOES NOT
///   The guarantee is the QUOTE. `hak()` is the quote's economic reserve
///   over circulating supply, and a redeemer is always paid their full
///   share of it — immediately if the money is here, and through the queue
///   if it is in flight.
///
///   Collateral that has been CONVERTED abroad — the USDC that became PEPE
///   on Ethereum — is not part of that number and never was. The ledger
///   keys every asset separately for exactly this reason: unverified
///   market value does not join the guaranteed dollar base. So the sleeve
///   is upside for holders, not a promise to redeemers, and nobody is
///   short-changed by its absence because it was never counted for anyone.
///   The interface must show the two figures separately, and saying
///   otherwise would be the "fake price" the brief forbids.
///
/// WHY ASYNCHRONOUS REDEMPTION IS NEUTRAL AND NOT A HAIRCUT
///   A redeemer burning `d` of `D` tokens is owed `w = d·E/D`, where E is
///   the economic reserve. The debt is written at the instant of the burn,
///   so afterwards the claim is
///
///       (E − w) / (D − d)  =  (E − d·E/D) / (D − d)  =  E / D
///
///   exactly unchanged. Integer truncation rounds `w` down, which leaves
///   the residual with the holders who stayed — the safe direction. So a
///   queued redemption costs the remaining holders nothing and costs the
///   redeemer nothing but time, and that is a property of the arithmetic
///   rather than a hope. It is asserted in the suite, not just here.
///
/// WHY THE MINT RECIPIENT IS THIS CONTRACT AND NOT THE MANAGER
///   CCTP calls the hook handler on whoever receives the mint. The money
///   must land where the money lives, so the return leg names this vault
///   and the handler is here. The manager holds no tokens by design, so it
///   cannot be the recipient — and routing the mint through it would give
///   it custody for the sake of tidier layering.
///
/// THE DESTINATION IS DERIVED TWICE
///   The manager derives it from the registry and passes it; this contract
///   derives it again and reverts on a mismatch. That second derivation is
///   the point of the whole arrangement: a compromised or buggy manager
///   cannot aim the reserve anywhere, because the contract that moves the
///   money does not take the destination on trust.
contract KopruKasasi {
    CrossChainAccounting public immutable defter;
    CrossChainAssetRegistry public immutable kayit;
    address public immutable quote;
    uint256 public immutable tokenId;
    address public immutable tokenMessenger;
    address public immutable mesajTasiyici;

    /// The launch token, and the two places its supply does not yet carry a
    /// claim: what the curve has not sold and what sits in the opener.
    IYakilabilirK public immutable token;
    address public immutable egri;
    address public immutable acici;

    /* ---- the buyback's two limits, identical to TeminatKasasi -------
     *
     * The values are the same numbers for the same measured reasons, and
     * `denetim-geri-alim-esligi.js` fails if the two ever drift. A copied
     * constant that nobody compares is how the fee table agreed with
     * itself for weeks while the arithmetic underflowed.
     *
     * The DENOMINATOR differs, and that is deliberate. TeminatKasasi sizes
     * both limits against its token balance, because its whole reserve is
     * local. Here the limits are sized against what is SPENDABLE, which is
     * strictly smaller whenever part of the reserve is abroad. Sizing them
     * against the economic reserve instead would let a token with 80% of
     * its reserve on another chain spend every local dollar it had inside
     * one window while appearing to obey a 10% ceiling.
     */
    uint256 public constant ISLEM_TAVANI_BPS = 200;   // 2% of spendable, per call
    uint256 public constant DONEM_TAVANI_BPS = 1000;  // 10% of spendable, per window
    uint256 public constant DONEM_BLOK = 7200;        // ~1.01 saat @ 0,507 s/blok
    uint256 public constant ODUL_PAYI_BPS = 2000;     // 20% of captured slack

    struct Donem {
        uint64 baslangicBlok;
        uint256 harcanan;
        /* The ceiling is frozen when the window opens. Recomputing it from
           a shrinking base each call is how a sequence passes a smaller
           test every time and drains more than the ceiling promised. */
        uint256 tavan;
    }
    Donem public donem;

    /// Settable once, by the deployer, while empty. The manager needs this
    /// vault's address and this vault needs the manager's, and the same
    /// circularity between the curve and its vault was solved the same way.
    address public yonetici;
    address private immutable _kuran;

    bool private kilit;

    error KotuKurulum();
    error SadeceYonetici();
    error SadeceTasiyici();
    error YanlisAlici(bytes32 verilen, bytes32 turetilen);
    error ZincirDesteklenmiyor(uint32 domain);
    error SifirMiktar();
    error YetersizBakiye(uint256 istenen, uint256 var_);
    error TransferOlmadi();
    error Yeniden();

    event YoneticiAyarlandi(address yonetici);
    event Kopruye(uint32 indexed domain, uint256 miktar, bytes32 alici, uint256 azamiUcret, uint32 kesinlik);
    event Supuruldu(uint256 miktar);
    event RaporIletildi(uint32 remoteDomain, bytes32 gonderen);

    modifier kilitli() {
        if (kilit) revert Yeniden();
        kilit = true;
        _;
        kilit = false;
    }

    constructor(
        CrossChainAssetRegistry _kayit,
        address _quote,
        uint256 _tokenId,
        address _tokenMessenger,
        address _mesajTasiyici,
        IYakilabilirK _token,
        address _egri,
        address _acici
    ) {
        if (address(_kayit) == address(0) || _quote == address(0)) revert KotuKurulum();
        if (_tokenMessenger == address(0) || _mesajTasiyici == address(0)) revert KotuKurulum();
        if (address(_token) == address(0) || _egri == address(0) || _acici == address(0)) {
            revert KotuKurulum();
        }
        token = _token;
        egri = _egri;
        acici = _acici;
        kayit = _kayit;
        quote = _quote;
        tokenId = _tokenId;
        tokenMessenger = _tokenMessenger;
        mesajTasiyici = _mesajTasiyici;
        _kuran = msg.sender;
        /* The ledger is created here so its owner is unambiguously this
           vault. Passing one in would mean trusting that its `kasa` is
           really us. */
        defter = new CrossChainAccounting(address(this));
    }

    function yoneticiyiAyarla(address _yonetici) external {
        if (msg.sender != _kuran) revert KotuKurulum();
        if (yonetici != address(0) || _yonetici == address(0)) revert KotuKurulum();
        yonetici = _yonetici;
        defter.yoneticiyiAyarla(_yonetici);
        emit YoneticiAyarlandi(_yonetici);
    }

    /* ---- what the manager reads ------------------------------------- */

    /// Supply that actually carries a claim: everything except what the
    /// curve has not sold yet and what sits in the opener. Same definition
    /// as TeminatKasasi, because a second definition of circulating supply
    /// is a second claim.
    function dolasim() public view returns (uint256) {
        uint256 t = token.totalSupply();
        uint256 dis = IERC20K2(address(token)).balanceOf(egri)
                    + IERC20K2(address(token)).balanceOf(acici);
        return t > dis ? t - dis : 0;
    }

    /// The guaranteed quote claim per token, scaled by 1e36.
    ///
    /// Counts quote that is HERE but not yet booked, because the vault
    /// really does hold it: the hook's collateral tax arrives as a plain
    /// transfer and is credited by the next sweep. Reading the ledger
    /// alone would report a claim lower than the one a redeemer calling
    /// in the same block would actually be paid — the view and the payout
    /// have to be the same number or one of them is lying.
    function hak() public view returns (uint256) {
        uint256 d = dolasim();
        if (d == 0) return 0;
        (, uint256 kredilenmemis) =
            defter.tutarliMi(quote, IERC20K2(quote).balanceOf(address(this)));
        return ((defter.ekonomik(quote) + kredilenmemis) * defter.HAK_OLCEGI()) / d;
    }

    /* ---- the sweep: cross-chain inflow needs no new code ------------ */

    /// Credit quote that arrived without being announced.
    ///
    /// A CCTP mint calls nothing when it carries no hook, and an ordinary
    /// transfer calls nothing either. Measured on the existing vault: an
    /// unsolicited $250 raised the balance, the claim and the basket value
    /// by exactly $250 — because that vault counted its balance. This one
    /// keeps a ledger instead, so the balance has to be swept into it.
    ///
    /// Permissionless, and it can only ever credit: the amount is the gap
    /// between the real balance and what the ledger already knows, so
    /// calling it twice in a row does nothing the second time.
    function supur() external kilitli returns (uint256 kredilenen) {
        return _supur();
    }

    /* ---- WHY EVERY MONEY PATH SWEEPS FIRST -------------------------
     *
     * The hook sends this token's collateral tax here with a PLAIN
     * TRANSFER. A transfer calls nothing, so the balance rises and the
     * ledger does not know. The old vault read `balanceOf` and saw the
     * tax immediately; this one reads the ledger and would not see it
     * until somebody called `supur`.
     *
     * Measured: in the crash scenario the reserve reached $25.42 of real
     * USDC while the ledger still said $20.00, and every buyback was
     * refused by the per-call ceiling — 2% of a figure that was $5.42
     * short. The defence was disabled by money it already held.
     *
     * Nothing was lost and that is the point: it would have shipped
     * quietly, with the claim understating the reserve by exactly the tax
     * collected since the last sweep, and holders short by that much for
     * as long as nobody swept.
     *
     * So every path that pays, spends or quotes sweeps first. It is
     * idempotent — the amount is the gap between the balance and the
     * ledger — so a sweep that has nothing to do costs one balance read.
     */
    function _supur() private returns (uint256 kredilenen) {
        uint256 gercekBakiye = IERC20K2(quote).balanceOf(address(this));
        (, uint256 kredilenmemis) = defter.tutarliMi(quote, gercekBakiye);
        if (kredilenmemis == 0) return 0;
        defter.girdi(quote, kredilenmemis);
        kredilenen = kredilenmemis;
        emit Supuruldu(kredilenen);
    }

    /* ---- outbound: the real CCTP burn ------------------------------- */

    /// Burn quote toward `cctpDomain`, crediting the remote vault.
    ///
    /// Only the manager may ask, and even then the destination it supplies
    /// is checked against this contract's own derivation. The manager
    /// decides whether and how much; nobody decides where.
    function kopruyeGonder(
        uint32 cctpDomain,
        uint256 miktar,
        bytes32 mintRecipient,
        uint256 azamiUcret,
        uint32 kesinlikEsigi,
        bytes calldata kanca
    ) external kilitli returns (uint64) {
        if (msg.sender != yonetici) revert SadeceYonetici();
        if (miktar == 0) revert SifirMiktar();
        if (!kayit.destekliMi(cctpDomain)) revert ZincirDesteklenmiyor(cctpDomain);

        /* THE SECOND DERIVATION. */
        bytes32 turetilen = kayit.uzakKasaBytes32(cctpDomain, tokenId);
        if (mintRecipient != turetilen) revert YanlisAlici(mintRecipient, turetilen);

        uint256 gercekBakiye = IERC20K2(quote).balanceOf(address(this));
        if (miktar > gercekBakiye) revert YetersizBakiye(miktar, gercekBakiye);

        /* Approve exactly this transfer. An unlimited allowance on a
           contract that holds a reserve is a standing liability for no
           benefit. */
        if (!IERC20K2(quote).approve(tokenMessenger, miktar)) revert TransferOlmadi();

        ITokenMessengerK(tokenMessenger).depositForBurnWithHook(
            miktar,
            cctpDomain,
            turetilen,
            quote,
            /* destinationCaller zero: anybody may submit the attestation on
               the far side. Naming one would make the transfer depend on a
               single address staying alive. */
            bytes32(0),
            azamiUcret,
            kesinlikEsigi,
            kanca
        );

        emit Kopruye(cctpDomain, miktar, turetilen, azamiUcret, kesinlikEsigi);

        /* CCTP v2 does not return a nonce from depositForBurn — the
           identifier lives in the emitted message. Zero is returned
           honestly rather than inventing a number the caller might rely
           on; the transfer is tracked by the manager's own id, which is
           what the hook carries. */
        return 0;
    }

    /* ---- inbound: CCTP delivers here, the manager verifies ---------- */

    function handleReceiveFinalizedMessage(
        uint32 remoteDomain,
        bytes32 gonderen,
        uint32,
        bytes calldata govde
    ) external returns (bool) {
        _ilet(remoteDomain, gonderen, govde);
        return true;
    }

    function handleReceiveUnfinalizedMessage(
        uint32 remoteDomain,
        bytes32 gonderen,
        uint32,
        bytes calldata govde
    ) external returns (bool) {
        _ilet(remoteDomain, gonderen, govde);
        return true;
    }

    /// This contract proves one thing only: that CCTP delivered the
    /// message. Who sent it, whether it is new and whether the transition
    /// is legal are the manager's checks, and keeping them there means
    /// there is one place to audit them rather than two.
    function _ilet(uint32 remoteDomain, bytes32 gonderen, bytes calldata govde) private {
        if (msg.sender != mesajTasiyici) revert SadeceTasiyici();
        emit RaporIletildi(remoteDomain, gonderen);
        IYonetici(yonetici).uzaktanRapor(remoteDomain, gonderen, govde);
    }

    /* ==================================================================
     * REDEMPTION, SYNCHRONOUS WHEN IT CAN BE AND QUEUED WHEN IT CANNOT
     * ================================================================== */

    /// One redeemer's unpaid remainder, in quote, fixed at the burn.
    ///
    /// A fixed amount and not a share: the share was already taken out of
    /// the pool by the debt entry, so leaving the ticket as a fraction
    /// would let it move with a pool it is no longer part of.
    struct Talep {
        address kime;
        uint256 kalan;
        uint64 blok;
    }

    /// Strict FIFO. `kuyrukOde` settles from the head and nowhere else, so
    /// a later redeemer cannot be paid ahead of an earlier one just by
    /// calling at the right moment. The alternative — settle any ticket by
    /// id — is a queue in name only.
    Talep[] public kuyruk;
    uint256 public siraBasi;

    error KuyrukBos();
    error DolasimYok();
    error IslemTavani();
    error DonemTavani();
    error HakDustu();
    error YanlisVarlik(address verilen, address quote);

    event Iade(address indexed kime, uint256 yakilan, uint256 hakEdilen, uint256 odenen, uint256 kuyruga);
    event TalepOdendi(uint256 indexed sira, address indexed kime, uint256 miktar, uint256 kalan);
    event GeriAlim(address indexed kime, uint256 harcama, uint256 yakilan, uint256 odul, uint256 hakOnce, uint256 hakSonra);
    event Beslendi(address indexed kimden, uint256 miktar);

    /// Burn `miktar` tokens and take that share of the quote reserve.
    ///
    /// Paid now to the extent the money is on Arc, queued for the rest. The
    /// caller must have approved this vault on the token first.
    function iade(uint256 miktar)
        external
        kilitli
        returns (uint256 odenen, uint256 kuyruga)
    {
        if (miktar == 0) revert SifirMiktar();
        /* Any tax that arrived since the last sweep belongs to the claim
           this redeemer is about to be paid out of. */
        _supur();
        uint256 d0 = dolasim();
        if (d0 == 0) revert DolasimYok();

        /* What is free BEFORE this redemption books its own debt. Using the
           raw MUSAIT instead would let this redeemer be paid with money
           already owed to somebody ahead of them in the queue. */
        uint256 serbest = defter.harcanabilir(quote);

        /* The entitlement, against the pre-burn state. */
        uint256 hakEdilen = (defter.ekonomik(quote) * miktar) / d0;
        if (hakEdilen == 0) revert SifirMiktar();

        /* Burn first, then book. Supply is already reduced if the token
           were to re-enter during its own burn, and the debt entry lands in
           the same transaction, so there is no instant at which supply has
           fallen without the matching liability existing. */
        IYakilabilirK(address(token)).burnFrom(msg.sender, miktar);
        defter.borcYaz(quote, hakEdilen);

        odenen = hakEdilen < serbest ? hakEdilen : serbest;
        if (odenen > 0) {
            /* Closes the debt and removes the money in one ledger entry, so
               the two can never disagree. */
            defter.borcKapat(quote, odenen);
            if (!IERC20K2(quote).transfer(msg.sender, odenen)) revert TransferOlmadi();
        }

        kuyruga = hakEdilen - odenen;
        if (kuyruga > 0) {
            kuyruk.push(Talep({kime: msg.sender, kalan: kuyruga, blok: uint64(block.number)}));
        }

        emit Iade(msg.sender, miktar, hakEdilen, odenen, kuyruga);
    }

    /// Settle the head of the queue, as far as the money on Arc allows.
    ///
    /// Permissionless and needs no reward: the redeemer calls it for
    /// themselves, and anybody else calling it only pays gas to hand
    /// somebody their own money. Partial payment is allowed and leaves the
    /// remainder at the head — refusing to pay $900 of a $1,000 ticket
    /// until the last dollar lands would be worse for the redeemer.
    function kuyrukOde(uint256 azamiAdim) external kilitli returns (uint256 odenen) {
        if (siraBasi >= kuyruk.length) revert KuyrukBos();
        /* A ticket waiting on money that is already here, uncredited, is
           a redeemer kept waiting by bookkeeping. */
        _supur();
        uint256 adim = azamiAdim == 0 ? 1 : azamiAdim;

        for (uint256 i = 0; i < adim && siraBasi < kuyruk.length; i++) {
            Talep storage t = kuyruk[siraBasi];
            /* The head may draw on all of MUSAIT. It is first in line, so
               the other tickets' debts are behind it, not ahead. */
            uint256 var_ = defter.kova(quote).musait;
            if (var_ == 0) break;

            uint256 bu = t.kalan < var_ ? t.kalan : var_;
            t.kalan -= bu;
            defter.borcKapat(quote, bu);
            if (!IERC20K2(quote).transfer(t.kime, bu)) revert TransferOlmadi();
            odenen += bu;

            emit TalepOdendi(siraBasi, t.kime, bu, t.kalan);
            if (t.kalan == 0) siraBasi++;
            else break;   // ran out of money, not out of queue
        }
    }

    function bekleyenTalep() external view returns (uint256 adet, uint256 toplam) {
        for (uint256 i = siraBasi; i < kuyruk.length; i++) {
            adet++;
            toplam += kuyruk[i].kalan;
        }
    }

    /* ==================================================================
     * THE BUYBACK FLOOR, ON THE LEDGER
     *
     * Same bounded-loan shape as TeminatKasasi: the vault lends, the
     * caller routes anywhere, the vault checks only that the claim per
     * token did not fall. What is different is where the money comes
     * from — `defter.harca` refuses anything owed to the queue, so the
     * defence can never be funded out of a redeemer's money.
     * ================================================================== */

    function bosluk(uint256 harcama, uint256 yakilacak) public view returns (uint256) {
        uint256 d = dolasim();
        if (d == 0 || yakilacak >= d) return 0;
        uint256 tabanDeger = (defter.ekonomik(quote) * yakilacak) / d;
        return tabanDeger > harcama ? tabanDeger - harcama : 0;
    }

    function geriAl(uint256 harcama, bytes calldata veri)
        public
        kilitli
        returns (uint256 yakilan, uint256 odul)
    {
        if (harcama == 0) revert SifirMiktar();
        /* Before the ceilings are computed, not after: they are fractions
           of what is spendable, and an uncredited balance makes both of
           them smaller than the reserve justifies. */
        _supur();

        uint256 serbest = defter.harcanabilir(quote);
        if (serbest == 0) revert SifirMiktar();

        /* Limit one bounds the SPEND, because the spend is what moves the
           price. The reward is deliberately outside it: folding it in here
           made every discounted buyback impossible on the existing vault —
           measured, zero calls went through. */
        if (harcama > (serbest * ISLEM_TAVANI_BPS) / 10_000) revert IslemTavani();

        /* Limit two bounds the whole window's OUTFLOW, reward included.
           The spend comes back as burned supply and lifts the claim; the
           reward leaves for good, and at a deep discount it can exceed the
           spend outright ($96.61 against $74.12, measured on a real pool).
           So it is the one part that must be inside the bound. */
        Donem storage dn = donem;
        if (block.number >= dn.baslangicBlok + DONEM_BLOK) {
            dn.baslangicBlok = uint64(block.number);
            dn.harcanan = 0;
            dn.tavan = (serbest * DONEM_TAVANI_BPS) / 10_000;
        }
        if (dn.harcanan + harcama > dn.tavan) revert DonemTavani();
        dn.harcanan += harcama;

        uint256 d0 = dolasim();
        if (d0 == 0) revert DolasimYok();
        uint256 ekonomik0 = defter.ekonomik(quote);
        uint256 hakOnce = hak();

        /* The ledger is debited before the money moves, so a reentrant
           call — which the lock already refuses — could not find it
           unbooked. */
        defter.harca(quote, harcama);
        if (!IERC20K2(quote).transfer(msg.sender, harcama)) revert TransferOlmadi();
        IGeriAlimAliciK(msg.sender).geriAlimCagrisi(quote, harcama, veri);

        /* Whatever the caller left, read rather than reported. */
        yakilan = IERC20K2(address(token)).balanceOf(address(this));
        if (yakilan == 0) revert SifirMiktar();

        uint256 tabanDeger = (ekonomik0 * yakilan) / d0;
        uint256 bos = tabanDeger > harcama ? tabanDeger - harcama : 0;
        odul = (bos * ODUL_PAYI_BPS) / 10_000;

        if (dn.harcanan + odul > dn.tavan) revert DonemTavani();
        dn.harcanan += odul;

        IYakilabilirK(address(token)).burn(yakilan);

        if (odul > 0) {
            defter.harca(quote, odul);
            if (!IERC20K2(quote).transfer(msg.sender, odul)) revert TransferOlmadi();
        }

        uint256 hakSonra = hak();
        if (hakSonra < hakOnce) revert HakDustu();

        emit GeriAlim(msg.sender, harcama, yakilan, odul, hakOnce, hakSonra);
    }

    /* ==================================================================
     * TeminatKasasi ILE AYNI YUZEY
     *
     * WHY THESE THREE EXIST
     *   TeminatKasasi takes the asset as an argument, because its reserve
     *   was a weighted basket. This vault holds one asset, so the argument
     *   carries no information — and dropping it would have broken every
     *   caller written against the old vault: GeriAlimRobotu, the page,
     *   and two measured suites.
     *
     *   So the argument stays and is CHECKED. A caller that passes the
     *   wrong asset gets YanlisVarlik rather than being quietly served the
     *   quote. Ignoring it would be worse than dropping it: a keeper
     *   asking about cirBTC and being told about USDC would act on an
     *   answer to a question it did not ask.
     *
     * WHAT THIS BUYS
     *   One vault interface. A robot, a page or an audit written for
     *   either vault works with both — which is also what lets
     *   denetim-geri-alim-esligi.js compare the two arithmetics line by
     *   line instead of trusting that they match.
     */

    function _quoteMu(address varlik) private view {
        if (varlik != quote) revert YanlisVarlik(varlik, quote);
    }

    /// The claim per token for `varlik`, which must be the quote.
    function hak(address varlik) external view returns (uint256) {
        _quoteMu(varlik);
        return hak();
    }

    /// Add collateral. Permissionless, because it can only raise every
    /// holder's claim — same reasoning as the old vault, and the launch's
    /// own deposit comes through here.
    function besle(address varlik, uint256 miktar) external kilitli {
        _quoteMu(varlik);
        if (miktar == 0) revert SifirMiktar();
        if (!IERC20K2(quote).transferFrom(msg.sender, address(this), miktar)) {
            revert TransferOlmadi();
        }
        defter.girdi(quote, miktar);
        emit Beslendi(msg.sender, miktar);
    }

    /// The buyback, with the old vault's signature.
    function geriAl(address varlik, uint256 harcama, bytes calldata veri)
        external
        returns (uint256 yakilan, uint256 odul)
    {
        _quoteMu(varlik);
        return geriAl(harcama, veri);
    }

    /// The captured discount, with the old vault's signature.
    ///
    /// GeriAlimRobotu reads this before deciding whether a buyback is
    /// worth the gas. Its absence was not a compile error and not a
    /// revert string: a call to a function a contract does not have lands
    /// on a fallback, and with no fallback it reverts with NO DATA AT ALL.
    ///
    /// That empty revert is indistinguishable from the one a wrong nonce
    /// produces, and it cost a round of looking at the wrong thing. Both
    /// of the old vault's argument-taking reads are here now for that
    /// reason, not for tidiness.
    function bosluk(address varlik, uint256 harcama, uint256 yakilacak)
        external
        view
        returns (uint256)
    {
        _quoteMu(varlik);
        return bosluk(harcama, yakilacak);
    }

    /// What this vault holds of `varlik`, which must be the quote.
    function bakiye(address varlik) external view returns (uint256) {
        _quoteMu(varlik);
        return IERC20K2(quote).balanceOf(address(this));
    }

    /* ---- reads ------------------------------------------------------ */

    function bakiye() external view returns (uint256) {
        return IERC20K2(quote).balanceOf(address(this));
    }

    function musait() external view returns (uint256) {
        return defter.harcanabilir(quote);
    }

    function ekonomik() external view returns (uint256) {
        return defter.ekonomik(quote);
    }
}
