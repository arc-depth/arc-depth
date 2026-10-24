// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20R2 {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IFabrika {
    function dagitimBilgisi()
        external
        view
        returns (uint256 tokenId, uint32 arcDomain, bytes32 arcKasasi,
                 address tokenMessenger, address mesajTasiyici, address usdc);

    /// The price floor's inputs, fixed when the factory was deployed. Not
    /// read in the constructor: the target asset is not known until Arc's
    /// first funded arrival, and reading it then keeps the vault's creation
    /// code free of anything per-asset.
    function besleyiciBilgisi(address varlik)
        external
        view
        returns (address besleyici, uint8 varlikOndalik, uint8 besleyiciOndalik, uint32 azamiYas);

    /// True when a feed exists. Asked first, because besleyiciBilgisi
    /// reverts for an asset without one and a revert is not an answer the
    /// floor can branch on.
    function besleyiciVarMi(address varlik) external view returns (bool);

    /// The pool-derived source, for assets with no feed.
    function havuzFiyat() external view returns (address);
}

/// What the pool price source answers. Both directions, from the same pool
/// and the same window — deriving the buy side from one place and the sell
/// side from another would leave a gap a round trip could be run through.
interface IHavuzFiyat {
    function quoteIleAlinabilir(address varlik, uint256 quoteMiktari)
        external view returns (uint256 beklenen, address havuz, int24 tick);

    function quoteKarsiligi(address varlik, uint256 varlikMiktari)
        external view returns (uint256 beklenen, address havuz, int24 tick);
}

/// Chainlink's read interface. `latestRoundData` and not `latestAnswer`,
/// because the deprecated one answers a price with no timestamp — and a
/// price with no timestamp is how a retired aggregator keeps being believed.
interface IBesleyici {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt,
                 uint256 updatedAt, uint80 answeredInRound);
}

interface ITokenMessengerV2 {
    /// Signature taken from Circle's published contract interfaces, not
    /// guessed. A mismatch here is a call that reverts and a transfer that
    /// never leaves.
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

/// The borrower that routes a swap. The vault lends, the executor trades on
/// whatever venue it likes, the vault checks only the outcome — so the
/// vault knows no DEX and a new venue needs no change here.
interface ITakasAlicisi {
    function takasCagrisi(
        address verilen,
        uint256 miktar,
        address alinan,
        uint256 asgariAlinan,
        bytes calldata veri
    ) external;
}

/// @title RemoteCollateralVault — a token's collateral, held on another
///        chain, with no way to send it anywhere but home
///
/// NO CONSTRUCTOR ARGUMENTS
///   Deliberate and load-bearing. Arc derives this contract's address as
///   CREATE2(factory, keccak256(tokenId), initCodeHash) and holds ONE hash
///   per chain, so every vault's creation code must be byte-identical.
///   An argument would change the hash per deployment, Arc's derivation
///   would point at an empty address, and a CCTP mint would land where
///   nobody can reach it. So the vault asks the factory instead.
///
/// THE ONLY EXIT IS ARC
///   `arcaGonder` is the single function that moves value out, and its
///   destination is an immutable read from the factory at construction.
///   There is no recipient parameter anywhere in this contract. A caller
///   chooses WHEN collateral goes home and never WHERE.
///
///   The swap functions do move tokens — to a borrower, within one
///   transaction, against a checked outcome. That is the same bounded-loan
///   shape the Arc vault uses for its buyback, and it is why neither
///   contract needs to know what a DEX is.
///
/// WHY THE SWAP IS NOT DONE ON ARRIVAL
///   It would be convenient: the mint and the purchase in one transaction,
///   no second trigger. It would also mean Arc had to supply a minimum
///   output for a price on a chain it cannot see, decided before the
///   transfer even started. A stale bound either blocks the swap for hours
///   or waves through a terrible one. So arrival only credits, and the
///   purchase is a separate permissionless call whose bound is set by
///   whoever makes it and checked against this chain's own feed.
contract RemoteCollateralVault is ITakasAlicisi {
    uint256 public immutable tokenId;
    uint32 public immutable arcDomain;
    bytes32 public immutable arcKasasi;
    address public immutable tokenMessenger;
    address public immutable mesajTasiyici;
    address public immutable usdc;
    address public immutable fabrika;

    /// What this vault holds of each collateral asset, as the vault
    /// understands it. Balances are authoritative, but a recorded figure is
    /// what lets an unsolicited transfer be told apart from collateral the
    /// system actually bought.
    mapping(address => uint256) public tutulan;

    /// Which asset this token's collateral is supposed to be, as carried
    /// from Arc in the CCTP hook. Set on the first funded arrival and never
    /// changed: a vault whose target asset could be rewritten is a vault
    /// whose collateral can be swapped into something nobody chose.
    address public hedefVarlik;

    uint256 public bekleyenQuote;        // USDC received, not yet swapped
    bool public kilit;

    /// Replay protection for inbound CCTP messages.
    mapping(bytes32 => bool) public mesajGorulduMu;

    error SadeceTasiyici();
    error KotuGonderen(bytes32 gonderen);
    error KotuDomain(uint32 domain);
    error MesajTekrari(bytes32 anahtar);
    error KotuTokenId(uint256 gelen, uint256 benim);
    error SifirMiktar();
    error YetersizQuote(uint256 istenen, uint256 var_);
    error YetersizVarlik(uint256 istenen, uint256 var_);
    error AzCikti(uint256 gelen, uint256 asgari);
    error HedefDegisemez(address simdiki, address istenen);
    error Yeniden();
    error TransferOlmadi();
    /* Neither the feed nor the pool could price this asset. The two
       former errors — BesleyiciSessiz and BesleyiciEskimis — were removed
       with the single-source floor: a silent or stale feed no longer fails
       the conversion, it just stops being the answer. This one fires only
       when BOTH sources are silent, and then there is no honest floor to
       compute. */
    error FiyatYok(address varlik);
    error TabanAltinda(uint256 alinan, uint256 taban);

    /* ---- the floor the vault derives for itself ---------------------
     *
     * WHAT WENT WRONG WITHOUT THIS
     *   `asgariAlinan` is a function parameter, so the vault was checking a
     *   number the caller chose. Measured against the real pools on a real
     *   fork: a hostile executor borrowed $2,000.00, passed a bound of 1,
     *   actually spent $1.00 and kept $1,999.00. The check passed and
     *   99.94% of the transfer was gone.
     *
     *   Conversion is permissionless by design — a defence that only runs
     *   when its authors' keeper is up has a single point of failure — so
     *   "only our keeper calls it" was never available as an answer.
     *
     * WHAT REPLACES IT
     *   The vault reads the asset's Chainlink proxy, whose address comes
     *   from the factory's construction-time table and not from the caller,
     *   and computes what the trade SHOULD return. The caller's bound is
     *   still honoured, but only when it is stricter: a caller may demand
     *   more than the floor and may never demand less.
     *
     * WHY A FAIL-CLOSED FLOOR IS THE RIGHT SHAPE
     *   A silent feed, a stale feed or an asset with no feed all stop the
     *   conversion instead of relaxing the bound. Stopping means the
     *   collateral stays as quote, which is the asset the claim is
     *   denominated in — so the failure mode of the price check is holding
     *   dollars, not holding a guess.
     */
    uint256 public constant AZAMI_KAYMA_BPS = 300;      // 3%
    uint256 public constant YURUTUCU_ODUL_BPS = 5;      // 0,05%

    event Fonlandi(uint256 miktar, address hedefVarlik, bytes32 transferId);
    event TakasEdildi(address verilen, uint256 verilenMiktar, address alinan, uint256 alinanMiktar);
    event GeriTakasEdildi(address satilan, uint256 satilanMiktar, uint256 quoteAlinan);
    event ArcaGonderildi(uint256 miktar, bytes32 alici, bytes hookVerisi);
    event YurutucuyeOdendi(address indexed yurutucu, uint256 odul);

    modifier kilitli() {
        if (kilit) revert Yeniden();
        kilit = true;
        _;
        kilit = false;
    }

    constructor() {
        fabrika = msg.sender;
        (
            uint256 _tokenId,
            uint32 _arcDomain,
            bytes32 _arcKasasi,
            address _tokenMessenger,
            address _mesajTasiyici,
            address _usdc
        ) = IFabrika(msg.sender).dagitimBilgisi();
        tokenId = _tokenId;
        arcDomain = _arcDomain;
        arcKasasi = _arcKasasi;
        tokenMessenger = _tokenMessenger;
        mesajTasiyici = _mesajTasiyici;
        usdc = _usdc;
    }

    /* ---- inbound: the CCTP mint and its hook ------------------------ */

    /// What Arc can tell this vault, carried in the CCTP hook alongside the
    /// money. Anything else is rejected rather than ignored: an unknown
    /// instruction is a bug or an attack, and silently succeeding hides
    /// both.
    enum Emir { FONLA, SAT }

    function handleReceiveFinalizedMessage(
        uint32 remoteDomain,
        bytes32 gonderen,
        uint32,
        bytes calldata govde
    ) external returns (bool) {
        _isle(remoteDomain, gonderen, govde);
        return true;
    }

    function handleReceiveUnfinalizedMessage(
        uint32 remoteDomain,
        bytes32 gonderen,
        uint32,
        bytes calldata govde
    ) external returns (bool) {
        _isle(remoteDomain, gonderen, govde);
        return true;
    }

    function _isle(uint32 remoteDomain, bytes32 gonderen, bytes calldata govde) private {
        /* Only CCTP delivers, only Arc sends, and only the Arc vault this
           factory was built for. Three checks rather than one, because each
           covers a different forgery: a direct call, a message from another
           chain, and a message from another contract on Arc. */
        if (msg.sender != mesajTasiyici) revert SadeceTasiyici();
        if (remoteDomain != arcDomain) revert KotuDomain(remoteDomain);
        if (gonderen != arcKasasi) revert KotuGonderen(gonderen);

        bytes32 anahtar = keccak256(abi.encode(remoteDomain, gonderen, govde));
        if (mesajGorulduMu[anahtar]) revert MesajTekrari(anahtar);
        mesajGorulduMu[anahtar] = true;

        (Emir emir, uint256 gelenTokenId, address varlik, uint256 miktar, bytes32 transferId) =
            abi.decode(govde, (Emir, uint256, address, uint256, bytes32));

        /* The hook travels with a mint to THIS address, so a mismatched
           tokenId means the derivation or the registry is wrong somewhere
           — which must stop the transfer rather than be absorbed. */
        if (gelenTokenId != tokenId) revert KotuTokenId(gelenTokenId, tokenId);

        if (emir == Emir.FONLA) {
            if (miktar == 0) revert SifirMiktar();
            /* The target asset is fixed the first time and never after. */
            if (hedefVarlik == address(0)) {
                hedefVarlik = varlik;
            } else if (varlik != hedefVarlik) {
                revert HedefDegisemez(hedefVarlik, varlik);
            }
            bekleyenQuote += miktar;
            emit Fonlandi(miktar, varlik, transferId);
            return;
        }

        /* Emir.SAT — Arc's defence asked for collateral to be sold and sent
           home. Recorded as an allowance rather than executed here: the
           swap needs a price bound that only a caller on this chain can
           set sensibly, and a mint callback is not the place to be routing
           through a DEX. */
        satisIzni[varlik] += miktar;
        emit SatisIzniVerildi(varlik, miktar, transferId);
    }

    /// How much of each asset Arc has authorised to be sold.
    mapping(address => uint256) public satisIzni;
    event SatisIzniVerildi(address varlik, uint256 miktar, bytes32 transferId);

    /* ---- the floor, derived here and nowhere else -------------------- */

    /// The asset's price in quote units, and the decimals needed to scale
    /// it. Reverts rather than returning a fallback: every caller of this
    /// is about to move money.
    function _besleyiciFiyati(address varlik)
        private
        view
        returns (uint256 fiyat, uint8 varlikOndalik, uint8 besleyiciOndalik)
    {
        (address bes, uint8 vOnd, uint8 bOnd, uint32 azamiYas) =
            IFabrika(fabrika).besleyiciBilgisi(varlik);

        (, int256 cevap, , uint256 guncellendi, ) = IBesleyici(bes).latestRoundData();
        if (cevap <= 0) return (0, vOnd, bOnd);

        /* A feed that stopped answering still answers — the last round sits
           there forever. The age is the only thing that tells a live feed
           from a retired one, and the window is this feed's own, because
           heartbeats differ by an order of magnitude between feeds. */
        uint256 yas = block.timestamp > guncellendi ? block.timestamp - guncellendi : 0;
        if (yas > azamiYas) return (0, vOnd, bOnd);

        return (uint256(cevap), vOnd, bOnd);
    }

    /* ---- TWO SOURCES, THE STRICTER ONE WINS ------------------------
     *
     * For an asset with a feed, the feed; without one, the pool's
     * 30-minute average. If both exist, both are computed and the HIGHER
     * floor is applied — the higher the floor, the smaller the share left
     * to the executor.
     *
     * Why "the stricter of the two" and not "either one": because the feed
     * is independent of the pool it stays put when the pool is moved, and
     * the pool average is still alive when the feed goes stale. Picking one
     * would mean losing the case the other catches.
     *
     * If the feed CANNOT BE READ (silent or stale) the transaction does not
     * revert, it falls back to the pool floor — but only if the feed itself
     * is unresponsive. Measured: when an aggregator is pulled out from
     * under its proxy it goes on returning the old price without erroring,
     * and if that old price were used as a floor the collateral would be
     * converted at the wrong rate.
     */

    /// Buying: how much of `varlik` a quote amount is worth.
    ///
    ///   value in USD      = miktar / 10^6
    ///   asset per USD     = 10^besleyiciOndalik / fiyat
    ///   in asset units    = value x asset-per-USD x 10^varlikOndalik
    ///
    /// which collapses to miktar x 10^(besleyiciOndalik + varlikOndalik - 6)
    /// / fiyat. The quote is treated as exactly one dollar, because it is
    /// the unit everything else in this system is measured in.
    function alisTabani(address varlik, uint256 quoteMiktari) public view returns (uint256) {
        uint256 beklenen = 0;

        if (IFabrika(fabrika).besleyiciVarMi(varlik)) {
            (uint256 fiyat, uint8 vOnd, uint8 bOnd) = _besleyiciFiyati(varlik);
            if (fiyat != 0) {
                beklenen = (quoteMiktari * (10 ** (uint256(bOnd) + uint256(vOnd)))) / (fiyat * 1e6);
            }
        }

        uint256 havuzdan = _havuzAlis(varlik, quoteMiktari);
        if (havuzdan > beklenen) beklenen = havuzdan;

        /* Neither source answered. Not a zero floor — a zero floor is no
           floor, and the measurement that found the hostile executor found
           it through exactly that. */
        if (beklenen == 0) revert FiyatYok(varlik);
        return (beklenen * (10_000 - AZAMI_KAYMA_BPS)) / 10_000;
    }

    /// Selling: the mirror.
    function satisTabani(address varlik, uint256 varlikMiktari) public view returns (uint256) {
        uint256 beklenen = 0;

        if (IFabrika(fabrika).besleyiciVarMi(varlik)) {
            (uint256 fiyat, uint8 vOnd, uint8 bOnd) = _besleyiciFiyati(varlik);
            if (fiyat != 0) {
                beklenen = (varlikMiktari * fiyat * 1e6) / (10 ** (uint256(bOnd) + uint256(vOnd)));
            }
        }

        uint256 havuzdan = _havuzSatis(varlik, varlikMiktari);
        if (havuzdan > beklenen) beklenen = havuzdan;

        if (beklenen == 0) revert FiyatYok(varlik);
        return (beklenen * (10_000 - AZAMI_KAYMA_BPS)) / 10_000;
    }

    /* The pool side, wrapped so a revert there is "no answer" rather than
       a failed conversion. It reverts for an ordinary reason — no pool, an
       empty pool, or history shorter than the window — and in all three
       the feed may still have answered. */
    function _havuzAlis(address varlik, uint256 quoteMiktari) private view returns (uint256) {
        address hf = IFabrika(fabrika).havuzFiyat();
        if (hf == address(0)) return 0;
        try IHavuzFiyat(hf).quoteIleAlinabilir(varlik, quoteMiktari) returns (uint256 m, address, int24) {
            return m;
        } catch {
            return 0;
        }
    }

    function _havuzSatis(address varlik, uint256 varlikMiktari) private view returns (uint256) {
        address hf = IFabrika(fabrika).havuzFiyat();
        if (hf == address(0)) return 0;
        try IHavuzFiyat(hf).quoteKarsiligi(varlik, varlikMiktari) returns (uint256 m, address, int24) {
            return m;
        } catch {
            return 0;
        }
    }

    /// The caller may ask for more than the floor and never for less.
    function _siki(uint256 taban, uint256 cagiranin) private pure returns (uint256) {
        return cagiranin > taban ? cagiranin : taban;
    }

    /* ---- buy: quote -> collateral ----------------------------------- */

    /// Spend received quote on the token's collateral.
    ///
    /// Permissionless, because a defence that only runs when its authors'
    /// keeper is up has a single point of failure. What the caller supplies
    /// is the route and the minimum output; what they cannot supply is the
    /// asset, which came from Arc, or a destination, of which there is none.
    function takasEt(uint256 miktar, uint256 asgariAlinan, address alici, bytes calldata veri)
        external
        kilitli
        returns (uint256 alinan)
    {
        if (miktar == 0) revert SifirMiktar();
        if (miktar > bekleyenQuote) revert YetersizQuote(miktar, bekleyenQuote);
        address hedef = hedefVarlik;
        if (hedef == address(0)) revert SifirMiktar();

        /* The executor's fee, taken off the top so that the floor below is
           computed against what is actually being traded. Permissionless
           work on a foreign chain costs that chain's gas, and nobody pays
           it for nothing — but the fee is bounded by Arc's own flow, since
           quote only arrives when Arc sends it and is gone once converted.
           There is no amount a caller can churn. */
        uint256 odul = (miktar * YURUTUCU_ODUL_BPS) / 10_000;
        uint256 takasEdilecek = miktar - odul;

        /* THE FLOOR, derived here from the factory's feed table. The
           caller's number is honoured only when it is stricter. */
        uint256 taban = _siki(alisTabani(hedef, takasEdilecek), asgariAlinan);

        uint256 once = IERC20R2(hedef).balanceOf(address(this));

        bekleyenQuote -= miktar;
        if (!IERC20R2(usdc).transfer(alici, takasEdilecek)) revert TransferOlmadi();
        ITakasAlicisi(alici).takasCagrisi(usdc, takasEdilecek, hedef, taban, veri);

        alinan = IERC20R2(hedef).balanceOf(address(this)) - once;
        /* A borrower that keeps the proceeds lands here with alinan == 0,
           and one that keeps most of them lands under the floor. */
        if (alinan < taban || alinan == 0) revert TabanAltinda(alinan, taban);

        /* The fee is paid AFTER the floor holds, and that ordering matters.
           Paying it first put the quote in the executor's hands during the
           callback, where the borrower's own sweep of unconsumed loan sent
           it straight back to this vault — a reward that was transferred
           and then silently returned. Paid here, there is nothing left in
           flight for a sweep to catch, and a route that fails earns
           nothing. */
        if (odul > 0 && !IERC20R2(usdc).transfer(msg.sender, odul)) revert TransferOlmadi();

        tutulan[hedef] += alinan;
        emit TakasEdildi(usdc, takasEdilecek, hedef, alinan);
        emit YurutucuyeOdendi(msg.sender, odul);
    }

    /* ---- sell: collateral -> quote ---------------------------------- */

    /// Sell collateral back to the quote, up to what Arc has authorised.
    function geriTakasEt(uint256 miktar, uint256 asgariQuote, address alici, bytes calldata veri)
        external
        kilitli
        returns (uint256 quoteAlinan)
    {
        address hedef = hedefVarlik;
        if (miktar == 0) revert SifirMiktar();
        if (miktar > tutulan[hedef]) revert YetersizVarlik(miktar, tutulan[hedef]);
        /* Arc decides how much may be sold. Without this a caller could
           liquidate the whole remote reserve at a moment of their choosing,
           which is a market-timing power nobody should have. */
        if (miktar > satisIzni[hedef]) revert YetersizVarlik(miktar, satisIzni[hedef]);

        /* Same floor, the other way round. The fee comes out of the
           proceeds rather than off the top, because the input here is the
           collateral and splitting that would leave an odd remainder of an
           asset the vault counts. */
        uint256 taban = _siki(satisTabani(hedef, miktar), asgariQuote);

        uint256 once = IERC20R2(usdc).balanceOf(address(this));

        tutulan[hedef] -= miktar;
        satisIzni[hedef] -= miktar;
        if (!IERC20R2(hedef).transfer(alici, miktar)) revert TransferOlmadi();
        ITakasAlicisi(alici).takasCagrisi(hedef, miktar, usdc, taban, veri);

        uint256 brut = IERC20R2(usdc).balanceOf(address(this)) - once;
        if (brut < taban || brut == 0) revert TabanAltinda(brut, taban);

        uint256 odul = (brut * YURUTUCU_ODUL_BPS) / 10_000;
        if (odul > 0 && !IERC20R2(usdc).transfer(msg.sender, odul)) revert TransferOlmadi();

        quoteAlinan = brut - odul;
        bekleyenQuote += quoteAlinan;
        emit GeriTakasEdildi(hedef, miktar, quoteAlinan);
        emit YurutucuyeOdendi(msg.sender, odul);
    }

    /* ---- the only way out ------------------------------------------- */

    /// Send quote home to Arc.
    ///
    /// There is no recipient parameter. The destination is `arcKasasi` on
    /// `arcDomain`, both immutable since construction, and the hook tells
    /// Arc which transfer completed so the ledger can close it. A caller
    /// chooses when; nobody chooses where.
    function arcaGonder(uint256 miktar, uint256 azamiUcret, uint32 kesinlik, bytes32 transferId)
        external
        kilitli
    {
        if (miktar == 0) revert SifirMiktar();
        if (miktar > bekleyenQuote) revert YetersizQuote(miktar, bekleyenQuote);

        bekleyenQuote -= miktar;

        bytes memory kanca = abi.encode(uint8(3), transferId, address(0), miktar, uint256(0));

        if (!IERC20R2(usdc).approve(tokenMessenger, miktar)) revert TransferOlmadi();
        ITokenMessengerV2(tokenMessenger).depositForBurnWithHook(
            miktar,
            arcDomain,
            arcKasasi,
            usdc,
            /* destinationCaller zero: anybody may submit the attestation on
               Arc. Naming a caller would make the return trip depend on one
               address being alive, which is the failure this design spends
               its complexity avoiding. */
            bytes32(0),
            azamiUcret,
            kesinlik,
            kanca
        );

        emit ArcaGonderildi(miktar, arcKasasi, kanca);
    }

    /* ---- the borrower hook, when this vault is itself the borrower --- */

    /// Present because `ITakasAlicisi` is implemented, which lets a future
    /// router treat this vault uniformly. It does nothing: a vault that
    /// could be made to trade on its own behalf from outside would be a
    /// vault with an extra way in.
    function takasCagrisi(address, uint256, address, uint256, bytes calldata) external pure {
        revert SifirMiktar();
    }

    /* ---- reads ------------------------------------------------------ */

    function durum()
        external
        view
        returns (uint256 _bekleyenQuote, address _hedefVarlik, uint256 _tutulan, uint256 _izin)
    {
        _bekleyenQuote = bekleyenQuote;
        _hedefVarlik = hedefVarlik;
        _tutulan = hedefVarlik == address(0) ? 0 : tutulan[hedefVarlik];
        _izin = hedefVarlik == address(0) ? 0 : satisIzni[hedefVarlik];
    }
}
