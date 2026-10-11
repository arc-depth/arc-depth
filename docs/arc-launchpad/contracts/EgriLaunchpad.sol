// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EgriFabrika} from "./EgriFabrika.sol";
import {AciciFabrika} from "./AciciFabrika.sol";
import {HavuzAcici, IERC20H} from "./HavuzAcici.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {KasaFabrika} from "./KasaFabrika.sol";
import {CrossChainAssetRegistry} from "./CrossChainAssetRegistry.sol";
import {IYakilabilirK} from "./KopruKasasi.sol";

/// Only what the launchpad calls on the vault it just created. The full
/// type is not imported, because importing it would embed its creation code
/// here — which is the 208 bytes over EIP-170 that put the vault behind a
/// factory in the first place.
interface KopruKasasiLite {
    function supur() external returns (uint256);
}
import {EgriLaunch} from "./EgriLaunch.sol";

interface IQuotePara {
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function approve(address s, uint256 v) external returns (bool);
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @title EgriLaunchpad — launches that cost the founder nothing to open.
/// @notice A token, a ladder anyone can trade against, and a curve that
///         always bids. No deposit, no founder allocation, no dollars.
///
/// WHY THIS REPLACES THE DEPOSIT MODEL
///   The old Launchpad asked for collateral up front and handed the founder
///   60% of supply, putting the other 40% into a pool that can never be
///   withdrawn. Measured on the live contract, a $100 launch returned
///   $59.52 at best: $2.00 of fee and $38.48 of backing stranded in the
///   pool. The product says the system takes only the fee. It took 40.5%.
///
///   Nobody deposits here, so nobody can lose a deposit, and the founder
///   gets no free tokens — they buy like everyone else, at the same price,
///   with the same snipe tax.
///
/// WHY BOTH A LADDER AND A CURVE
///   FTHM proved a market can be opened for nothing: 500,000,000 of its
///   billion went into a one-sided Uniswap ladder at a $15,000 opening FDV,
///   showing $7,500 of liquidity with not a dollar in the pool. Measured
///   from its own manifest, the rule is
///
///       displayed liquidity = (supply in the ladder) x (opening mcap)
///
///   What FTHM did not have was a guaranteed bid: a token-only position has
///   nothing to pay a seller with until buyers have paid something in.
///
///   What the curve alone did not have is reach. It is our contract, not a
///   Uniswap pool, so relay.link, aggregators and every DEX front end are
///   blind to it until graduation — and relay is the path people use.
///
///   So the supply splits down the middle. The ladder makes the token
///   tradable and visible from the first second at no cost; the curve holds
///   a bid that can never pay out more than it took in. Both open at the
///   same price, so there is nothing to arbitrage at birth.
///
/// THE CIRCULAR DEPENDENCY, AND WHY THIS CONTRACT SITS IN THE MIDDLE
///   `EgriLaunch` takes its pool opener as an immutable constructor
///   argument, and the ladder takes the only address allowed to open it the
///   same way. Predicting either address is circular, because each
///   initcode would have to contain the other's.
///
///   So this address is given to both. The curve calls `ac` here at
///   graduation; here checks the caller is a curve in the registry and
///   forwards the money to that launch's ladder. Authorisation comes from
///   the registry rather than an immutable address, which is what a
///   long-lived factory can do and a single-launch helper cannot.
///
/// WHAT THIS CONTRACT CANNOT DO
///   There is no owner, no setter, no pause and no withdraw. It holds a
///   launch token only between the factory minting it and the ladder
///   receiving it, and the quote asset only between a graduating curve
///   sending it and the ladder receiving it. Nothing here can move either
///   one anywhere else.
contract EgriLaunchpad {
    using PoolIdLibrary for PoolKey;

    /// Fixed supply. Every launch is a billion tokens.
    uint256 public constant SUPPLY = 1_000_000_000 ether;

    /// Opening market capitalisation, in quote units. Six decimals, so
    /// 3_500e6 is $3,500 — and the opening price is simply this over the
    /// supply, which is what both venues are built around.
    uint256 public constant ACILIS_MCAP = 3_500e6;

    /* The split is not a chosen ratio. It follows from the payment:
     *
     *   havuzToken = likidite / acilisFiyati   paired with the real USDC
     *   egriToken  = SUPPLY - havuzToken       the curve's side
     *   FANTOM     = ACILIS_MCAP - likidite    virtual reserve, reduced by
     *                                          exactly what real money
     *                                          replaced
     *
     * So virtual plus real is always the opening market cap, and the pool
     * and the curve open at the same price with nothing to arbitrage.
     * Measured: 78 real USDC gives 22,285,714 paired tokens, FANTOM 3,422,
     * and both venues price at 3.500000e-6.
     */

    /// Real quote the curve must take in before its collection is folded
    /// into the pool. FDV is x^2 * SUPPLY / (FANTOM * egriToken), which at
    /// a 50/50 split is 2x^2/FANTOM, so 6,000 here graduates at $68,643 —
    /// pump.fun's ~$69k, reached from a $3,500 open instead of their ~$4k.
    uint256 public constant ESIK = 6_000e6;

    uint24 public constant POOL_FEE = 0;      // the hook takes the fee
    int24 public constant TICK_SPACING = 60;

    /* ---- what a launch costs, and where each part goes ---------------
     *
     * A launch used to be free. It is not any more, and the reason is the
     * one thing free could not buy: a pool with a real bid in it. The old
     * ladder was token-only, so until somebody bought there was nothing to
     * sell into — the market existed on one side.
     *
     *   100 USDC  minimum payment
     *     -2      protocol fee, 2%, split like every other protocol slice
     *    -20      collateral, minimum, straight into THIS token's vault
     *    ====
     *     78      paired into the pool as a real bid at the opening price
     *
     * 78 / 0.0000035 = 22,285,714 tokens' worth of bid, which is what the
     * USDC will buy if the price falls through its range. No supply is
     * reserved for it: the bid buys from sellers, so the tokens come from
     * whoever is selling rather than from a locked allocation.
     */
    uint256 public constant ASGARI_ODEME = 100e6;
    uint256 public constant ASGARI_TEMINAT = 20e6;
    /// Launch fee in ppm of the payment. 20_000 = 2.00%, the same rate the
    /// swap fee charges, so there is one number to remember and not two.
    uint256 public constant LAUNCH_UCRET_PPM = 20_000;

    /// The collateral tax a creator may choose, in ppm. 1% to 5%.
    uint256 public constant VERGI_ASGARI_PPM = 10_000;
    uint256 public constant VERGI_AZAMI_PPM = 50_000;
    uint256 public constant VERGI_VARSAYILAN_PPM = 10_000;

    /* THE FEE, IN FULL — 2.00% of every curve trade, in the quote asset.
     *
     * The first percent pays the market: whoever created the token, the
     * people holding it, and the depth of the pool it folds into. The
     * second pays the people who build and operate the launchpad. Listing
     * both halves is the point — a fee hidden inside a spread is the same
     * money taken without saying so.
     *
     *   0.30%  token's creator            immutable, set at launch
     *   0.30%  holder rewards             paid in the quote asset
     *   0.40%  pool depth                 stays, nobody can withdraw it
     *   ----
     *   0.30%  developer fund
     *   0.50%  protocol liquidity
     *   0.20%  operations
     *   ----
     *   2.00%  total
     *
     * Each slice rounds down on its own, so the six can only ever come to
     * at or under the total; the dust stays and becomes pool depth.
     */
    uint256 public constant UCRET_PPM = 20_000;        // 2.00%
    uint256 public constant KURUCU_PPM = 3_000;        // 0.30%
    uint256 public constant STAKE_PPM = 3_000;         // 0.30%
    uint256 public constant GELISTIRICI_PPM = 3_000;   // 0.30%
    uint256 public constant LIKIDITE_PPM = 5_000;      // 0.50%
    uint256 public constant ISLETME_PPM = 2_000;       // 0.20%
    // the remaining 4_000 (0.40%) stays on the curve and becomes pool depth

    address public immutable gelistiriciFonu;
    address public immutable likiditeKasasi;
    address public immutable isletmeKasasi;

    EgriFabrika public immutable fabrika;
    AciciFabrika public immutable aciciFabrika;
    /// The value adapter every vault this launchpad creates will use.
    /* There is deliberately no oracle here any more.
     *
     * It existed to be handed to TeminatKasasi, whose claim was a weighted
     * basket that had to be priced. The new vault computes its claim as the
     * quote over circulating supply, so no feed stands between a holder and
     * what they are owed, and the pointer became dead weight.
     *
     * Left in place it would have been a public getter on a contract that
     * never reads a price — which is the kind of thing a reader reasonably
     * mistakes for a dependency. */

    /* ---- the cross-chain vault's wiring ----------------------------
     *
     * WHY THE VAULT COMES FROM A FACTORY NOW
     *   This contract used to deploy TeminatKasasi inline, and the
     *   comment at that line gave the reason: the basket array would
     *   otherwise have to be plumbed through another contract.
     *
     *   KopruKasasi takes no basket, so that reason is gone — and a
     *   measurement replaced it with the opposite one. Swapping the vault
     *   inline takes this contract from 18,615 bytes to 24,784, against
     *   EIP-170's limit of 24,576. It would have been 208 bytes too large
     *   to deploy, and the only symptom would have been one compile
     *   warning among eleven.
     *
     * WHY NEW TOKENS GET THE CROSS-CHAIN VAULT AND OLD ONES DO NOT
     *   TeminatKasasi keeps serving every token already launched; nothing
     *   about them changes. New launches get KopruKasasi, which is a
     *   complete vault on its own — redemption with its queue, the
     *   buyback floor, the three-bucket ledger — and which CAN move
     *   collateral to another chain without any function taking a
     *   destination.
     *
     * WHAT THE GUARANTEE COVERS NOW
     *   The quote, and only the quote. TeminatKasasi's claim was a
     *   weighted basket priced by an oracle; KopruKasasi's claim is
     *   dollars over circulating supply, with converted collateral held
     *   as upside rather than counted as a promise. That is a narrower
     *   guarantee and a harder one: no price feed stands between a
     *   holder and what they are owed.
     */
    KasaFabrika public immutable kasaFabrika;
    CrossChainAssetRegistry public immutable kayit;
    address public immutable tokenMessenger;
    address public immutable mesajTasiyici;
    IERC20H public immutable quote;
    IPoolManager public immutable poolManager;
    IHooks public immutable hook;
    uint64 public immutable holdPeriod;
    /// Production is 5. Immutable rather than constant for one reason:
    /// `block.timestamp` cannot be moved inside an `eth_call`, so with a
    /// fixed five seconds no test could reach the untaxed path and the
    /// curve arithmetic would go unchecked. `Egri` carries it the same way.
    uint64 public immutable snipeSuresi;

    struct Kayit {
        address token;
        address egri;
        address acici;
        address rewards;
        /// This launch's own collateral vault. Nothing in it is shared with
        /// any other launch; the vault has no address for one.
        address kasa;
        /// This launch's cross-chain manager. It holds no tokens; it is
        /// recorded so a deployment can be audited without replaying the
        /// launch transaction.
        address yonetici;
        /// What the creator wants the collateral converted INTO, if it is
        /// ever moved to another chain. ONE asset, not a weighted basket:
        /// a remote vault's target asset is set on its first funded
        /// arrival and never changes, so a weighted mix cannot be
        /// expressed on the far side. Stored rather than acted on — the
        /// collateral sits in the quote until somebody moves it.
        address hedefVarlik;
        address kurucu;
        /// The collateral tax, chosen once and immutable thereafter.
        uint256 vergiPpm;
        uint64 zaman;
    }

    /// One basket entry: an asset and the share of incoming USDC that gets
    /// converted into it. USDC itself may be an entry — then that share
    /// stays as USDC. It is not privileged, it is only the currency value
    /// arrives in, and its weight may be zero.
    struct SepetKalem {
        address varlik;
        uint16 agirlikBps;
    }

    Kayit[] private kayitlar;
    /// curve => index+1. Zero means "not ours", which is what `ac` checks.
    mapping(address => uint256) public launchIdOfEgri;
    mapping(address => uint256) public launchIdOfToken;
    /* pool id => index+1. The hook is the only reader: it holds a PoolKey
       and needs that launch's ladder, creator and rewards contract, none of
       which it can be constructed with because they differ per launch. */
    mapping(PoolId => uint256) public launchIdOfPool;

    event Launched(
        uint256 indexed id,
        address indexed token,
        address indexed kurucu,
        address egri,
        address acici,
        address rewards,
        string ad,
        string sembol
    );
    event MerdivenAcildi(uint256 indexed id, address indexed token, uint256 konanToken, uint160 sqrtPriceX96);
    event HavuzAcildi2(uint256 indexed id, address indexed token, uint256 usdc, uint256 token_);
    event IlkAlim(uint256 indexed id, address indexed kurucu, uint256 odenen, uint256 alinan);
    event Kuruldu(uint256 indexed id, address kasa, uint256 ucret, uint256 teminat, uint256 likidite, uint256 vergiPpm);
    event HavuzaKatildi(uint256 indexed id, address indexed token, uint256 quoteKonan, uint256 tokenKonan);

    /// What the pool could not pair at graduation, and where it went.
    /// A surplus nobody can see is a surplus nobody checks — and this
    /// one used to be invisible AND unreachable.
    event MezuniyetFazlasi(
        uint256 indexed launchId,
        address indexed token,
        address indexed kasa,
        uint256 fazla
    );

    error KotuKurulum();
    error BosAd();
    error BilinmeyenEgri();
    error TransferOlmadi();
    error YetersizMiktar();
    error OdemeAz();
    error TeminatAz();
    error LikiditeKalmadi();
    error KotuVergi();
    error KotuSepet();

    constructor(
        EgriFabrika _fabrika,
        AciciFabrika _aciciFabrika,
        IERC20H _quote,
        IPoolManager _poolManager,
        IHooks _hook,
        uint64 _holdPeriod,
        uint64 _snipeSuresi,
        address _gelistiriciFonu,
        address _likiditeKasasi,
        address _isletmeKasasi,
        KasaFabrika _kasaFabrika,
        CrossChainAssetRegistry _kayit,
        address _tokenMessenger,
        address _mesajTasiyici
    ) {
        if (address(_fabrika) == address(0)) revert KotuKurulum();
        if (address(_aciciFabrika) == address(0)) revert KotuKurulum();
        if (_gelistiriciFonu == address(0)) revert KotuKurulum();
        if (_likiditeKasasi == address(0)) revert KotuKurulum();
        if (_isletmeKasasi == address(0)) revert KotuKurulum();
        if (address(_quote) == address(0) || address(_poolManager) == address(0)) revert KotuKurulum();
        if (_snipeSuresi == 0) revert KotuKurulum();
        fabrika = _fabrika;
        aciciFabrika = _aciciFabrika;
        quote = _quote;
        poolManager = _poolManager;
        hook = _hook;
        holdPeriod = _holdPeriod;
        snipeSuresi = _snipeSuresi;
        gelistiriciFonu = _gelistiriciFonu;
        likiditeKasasi = _likiditeKasasi;
        isletmeKasasi = _isletmeKasasi;
        if (address(_kasaFabrika) == address(0)) revert KotuKurulum();
        if (address(_kayit) == address(0)) revert KotuKurulum();
        if (_tokenMessenger == address(0) || _mesajTasiyici == address(0)) revert KotuKurulum();
        kasaFabrika = _kasaFabrika;
        kayit = _kayit;
        tokenMessenger = _tokenMessenger;
        mesajTasiyici = _mesajTasiyici;
    }

    /// Tokens paired with `likidite` USDC at the opening price.
    function havuzToken(uint256 likidite) public pure returns (uint256) {
        return (likidite * SUPPLY) / ACILIS_MCAP;
    }

    function egriToken(uint256 likidite) public pure returns (uint256) {
        return SUPPLY - havuzToken(likidite);
    }

    /// The curve's notional quote reserve: the ladder's share of the
    /// opening mcap mirrored on the other side. The curve holds half the
    /// supply, so half the opening value is what makes its price match the
    /// ladder's exactly. Priced against and never paid out, so a launch
    /// still costs nothing.
    function fantom(uint256 likidite) public pure returns (uint256) {
        return ACILIS_MCAP - likidite;
    }

    /// The opening price as a raw ratio: ACILIS_MCAP quote units per SUPPLY
    /// token units. Quoted as a pair rather than a scaled number because a
    /// scaled price has to carry a conversion factor, and a conversion
    /// factor written down once is one that can be written down wrong.
    function acilisFiyati() external pure returns (uint256 quoteBirimi, uint256 tokenBirimi) {
        return (ACILIS_MCAP, SUPPLY);
    }

    /// Displayed liquidity the ladder opens with, in quote units: its share
    /// of supply valued at the opening price. Costs nothing to provide.
    function acilisLikiditesi() external pure returns (uint256) {
        return ACILIS_MCAP;
    }

    /// FDV in quote units once the curve has collected `toplanan`, over the
    /// WHOLE supply rather than the curve's share — which is the number a
    /// screen shows. At zero it is ACILIS_MCAP.
    /// FDV over the WHOLE supply once the curve has collected `toplanan`.
    /// At zero it is ACILIS_MCAP whatever the liquidity split was, because
    /// FANTOM and the curve's token share move together.
    function fdv(uint256 likidite, uint256 toplanan) external pure returns (uint256) {
        uint256 f = fantom(likidite);
        uint256 x = f + toplanan;
        return (x * x * SUPPLY) / (f * egriToken(likidite));
    }

    /// The whole fee table, so a page never has to hardcode it.
    function ucretTablosu()
        external
        pure
        returns (uint256 toplam, uint256 kurucuya, uint256 stakeye,
                 uint256 gelistiriciye, uint256 likiditeye, uint256 isletmeye,
                 uint256 havuzDerinligine)
    {
        return (UCRET_PPM, KURUCU_PPM, STAKE_PPM, GELISTIRICI_PPM,
                LIKIDITE_PPM, ISLETME_PPM,
                UCRET_PPM - KURUCU_PPM - STAKE_PPM - GELISTIRICI_PPM
                          - LIKIDITE_PPM - ISLETME_PPM);
    }

    /// What the hook asks for, by pool. A zero ladder means "not ours",
    /// and the hook refuses to serve such a pool rather than guessing.
    function havuzKaydi(PoolId id)
        external
        view
        returns (
            address token,
            address acici,
            address kurucu,
            address rewards,
            address kasa,
            uint256 vergiPpm
        )
    {
        uint256 i = launchIdOfPool[id];
        if (i == 0) return (address(0), address(0), address(0), address(0), address(0), 0);
        Kayit memory k = kayitlar[i - 1];
        return (k.token, k.acici, k.kurucu, k.rewards, k.kasa, k.vergiPpm);
    }

    /// The pool a launch trades in. Built the same way every reader must
    /// build it, so a caller never has to assemble the key by hand and get
    /// the currency order or the hook field wrong.
    function havuzAnahtari(address token) public view returns (PoolKey memory) {
        bool tokenSifirinci = token < address(quote);
        return PoolKey({
            currency0: Currency.wrap(tokenSifirinci ? token : address(quote)),
            currency1: Currency.wrap(tokenSifirinci ? address(quote) : token),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: hook
        });
    }

    function launchCount() external view returns (uint256) {
        return kayitlar.length;
    }

    function launchAt(uint256 i) external view returns (Kayit memory) {
        return kayitlar[i];
    }

    /// Create a token, its curve, its ladder and its vault, and open a
    /// market that has a real bid in it from the first block.
    ///
    /// @param odeme      total USDC paid, at least ASGARI_ODEME
    /// @param teminat    how much of it goes to this token's vault, at least
    ///                   ASGARI_TEMINAT. More is allowed; the remainder
    ///                   after the fee becomes the pool's bid.
    /// @param sepet      the creator's assets and their conversion weights,
    ///                   which must sum to 10_000 bps
    /// @param vergiPpm   the collateral tax on every trade, 1% to 5%
    /// @param ilkAlim    optional, extra USDC the creator spends buying
    ///                   their own token on the curve in this same
    ///                   transaction. Not free tokens: the same price and
    ///                   the same snipe tax as anybody else pays, and the
    ///                   amount is in the event for buyers to read.
    function launch(
        string calldata ad,
        string calldata sembol,
        SepetKalem[] calldata sepet,
        uint256 vergiPpm,
        uint256 odeme,
        uint256 teminat,
        uint256 ilkAlim
    )
        external
        returns (address token, address egri)
    {
        if (bytes(ad).length == 0 || bytes(sembol).length == 0) revert BosAd();
        if (odeme < ASGARI_ODEME) revert OdemeAz();
        if (teminat < ASGARI_TEMINAT) revert TeminatAz();
        if (vergiPpm < VERGI_ASGARI_PPM || vergiPpm > VERGI_AZAMI_PPM) revert KotuVergi();

        /* The three parts of the payment, settled before anything is
           deployed so a bad split cannot leave half a launch behind. */
        uint256 ucret = (odeme * LAUNCH_UCRET_PPM) / 1_000_000;
        if (odeme <= ucret + teminat) revert LikiditeKalmadi();
        uint256 likidite = odeme - ucret - teminat;

        /* EXACTLY ONE collateral target, and the parameter is still a list.

           The old vault held a weighted basket priced by an oracle. The new
           one holds the quote, and anything it converts into is held by a
           REMOTE vault whose target asset is set on its first funded
           arrival and never changes. One remote vault, one target asset —
           so a weighted mix cannot be expressed on the far side.

           Rejecting a longer list rather than silently using its first
           entry: a creator who asked for 60% WETH and 40% cirBTC and got
           100% WETH would have been given something they did not choose,
           and would have no way to tell. The signature keeps the list so
           that multi-asset support, if the remote side ever gains more
           than one vault per token, needs no change here. */
        if (sepet.length != 1) revert KotuSepet();
        if (sepet[0].varlik == address(0)) revert KotuSepet();
        /* HANGI VARLIK OLABILECEGINE BURADA KARAR VERILMIYOR

           Burada bir izin listesi kontrolu vardi ve kaldirildi. Kullanicinin
           kurali: *"Arc'da dogrulamasi gerekmiyor, sadece calisan tum
           adaylari koy, hatta insanlarin eklemesine de izin ver."*

           Yani launch anindaki tek sart varligin ADRES OLMASI. Calisip
           calismadigi — havuzu var mi, likiditesi var mi, 30 dakikalik
           ortalamasi okunabiliyor mu — donusum aninda uzak kasada
           olculuyor ve tutmazsa islem geri donuyor.

           Kaldirmanin bedeli durustce su: hedefi hic calismayacak bir
           varlik olan bir token launch edilebilir ve bunu launch aninda
           hicbir sey soylemez. Bedel kabul edildi cunku alternatifi
           kurucuda sabit bir liste ve o liste bugun dogmus bir tokeni
           hicbir zaman kabul edemez. Bunun yerine KULLANICI uyarilacagi
           yere tasindi: arayuz CA'yi yapistirir yapistirmaz ayni turetmeyi
           yapip "calisiyor / calismiyor" diyor, ve o olcum zincirden
           geliyor — sozlesmenin kabul edeceginin aynisi.

           Quote her zaman gecerli ve durust varsayilan: "teminat dolar
           olarak kalsin" demek, ki hak talebi zaten dolarla olculuyor. */
        if (sepet[0].agirlikBps != 10_000) revert KotuSepet();
        address hedefVarlik = sepet[0].varlik;

        if (!IQuotePara(address(quote)).transferFrom(msg.sender, address(this), odeme + ilkAlim))
            revert TransferOlmadi();

        address rewards;
        (token, egri, rewards) = fabrika.kur(
            ad,
            sembol,
            EgriFabrika.Ayar({
                quote: quote,
                poolManager: poolManager,
                hook: hook,
                supply: SUPPLY,
                egriToken: egriToken(likidite),
                fantom: fantom(likidite),
                esik: ESIK,
                holdPeriod: holdPeriod,
                snipeSuresi: snipeSuresi,
                merkez: address(this),
                kurucu: msg.sender,
                gelistiriciFonu: gelistiriciFonu,
                likiditeKasasi: likiditeKasasi,
                isletmeKasasi: isletmeKasasi,
                /* The TOTAL is the protocol fee plus this launch's tax. Passing
                   the protocol fee alone left the slices summing to more than
                   the total and the curve rejected its own construction —
                   correctly: a split that does not fit inside the charge
                   would underflow on the first trade. */
                ucretler: [UCRET_PPM + vergiPpm, KURUCU_PPM, STAKE_PPM,
                           GELISTIRICI_PPM, LIKIDITE_PPM, ISLETME_PPM, vergiPpm]
            })
        );

        /* The ladder is built after the token exists, because it needs the
           token's address. The curve needed nothing from it, which is what
           let the circular constructor be broken at all. */
        address acici = aciciFabrika.kur(
            poolManager, IERC20H(token), quote, hook, POOL_FEE, TICK_SPACING, address(this)
        );

        /* The vault and its cross-chain manager, from the factory. The id
           is computed BEFORE the record is pushed, because the vault needs
           it: the remote vault's address is
           CREATE2(remoteFactory, keccak256(tokenId), initCodeHash), so this
           number is what Arc will later derive the far side from. Taking it
           from kayitlar.length after the push would be off by one and every
           derivation would point at an address nobody deploys to. */
        uint256 yeniId = kayitlar.length + 1;
        (address kasa, address yonetici) = kasaFabrika.kur(
            kayit, address(quote), yeniId, tokenMessenger, mesajTasiyici,
            IYakilabilirK(token), egri, acici
        );
        /* The curve could not be constructed with this address — it did not
           exist yet — so it is filled in now, in the same transaction, and
           can never be changed again. */
        EgriLaunch(egri).kasayiAyarla(kasa);

        kayitlar.push(Kayit({
            token: token,
            egri: egri,
            acici: acici,
            rewards: rewards,
            kasa: kasa,
            yonetici: yonetici,
            hedefVarlik: hedefVarlik,
            kurucu: msg.sender,
            vergiPpm: vergiPpm,
            zaman: uint64(block.timestamp)
        }));
        uint256 id = kayitlar.length;
        /* The id the vault was built with has to be the id the record got.
           If these ever disagree, every cross-chain derivation for this
           token is wrong — so it is checked here rather than assumed. */
        if (id != yeniId) revert KotuKurulum();
        launchIdOfEgri[egri] = id;
        launchIdOfToken[token] = id;
        /* Written BEFORE the ladder opens, because opening it adds
           liquidity, which calls back into the hook, which reads this. An
           entry written afterwards would be read before it existed and the
           launch would revert on its own last step. */
        launchIdOfPool[havuzAnahtari(token).toId()] = id;

        emit Launched(id, token, msg.sender, egri, acici, rewards, ad, sembol);

        /* ---- the money, in the same transaction as the launch -------- */

        /* 1. the protocol's 2%, split the way every protocol slice is. */
        _ucretiDagit(ucret);

        /* 2. the collateral, as USDC, into THIS token's vault. The rule is
              that a launch is not finished until it is there — so it
              happens here, inside the launch, and the conversion into the
              creator's chosen assets happens later and separately. A
              conversion that waited on a threshold would otherwise hold the
              launch hostage to gas prices. */
        /* KopruKasasi has no `besle`. Collateral arrives the same way a
           CCTP mint arrives — as a plain transfer that tells the vault
           nothing — and `supur()` is what credits it. One mechanism for
           both, which is why an unsolicited transfer cannot be told apart
           from a launch deposit and does not need to be.

           `supur` is idempotent: it credits the gap between the balance
           and the ledger, so calling it twice does nothing the second
           time. Measured on real Arc: $2,500 credited once, the second
           sweep $0.00. */
        if (!IQuotePara(address(quote)).transfer(kasa, teminat)) revert TransferOlmadi();
        uint256 kredilenen = KopruKasasiLite(kasa).supur();
        if (kredilenen != teminat) revert TransferOlmadi();

        /* 3. the pool: both sides at once, full range, locked for good.
              A one-sided ladder was tried here first and could not hold the
              bid at all — its band sits entirely on the token's side of the
              price, so the USDC had nowhere to go and the pool delta came
              back $0.00. Two-sided is not an improvement on that, it is the
              only shape that works. */
        uint256 havuzPayi = havuzToken(likidite);
        if (!IERC20H(token).transfer(acici, havuzPayi)) revert TransferOlmadi();
        if (!IQuotePara(address(quote)).transfer(acici, likidite)) revert TransferOlmadi();
        HavuzAcici(acici).ac(likidite, havuzPayi);
        emit HavuzAcildi2(id, token, likidite, havuzPayi);

        /* 4. the creator's optional buy, at the same price and tax as
              anybody else. The tokens go to them, not to this contract. */
        if (ilkAlim > 0) {
            IQuotePara(address(quote)).approve(egri, ilkAlim);
            uint256 alinan = EgriLaunch(egri).al(ilkAlim, 0);
            if (!IERC20H(token).transfer(msg.sender, alinan)) revert TransferOlmadi();
            emit IlkAlim(id, msg.sender, ilkAlim, alinan);
        }
    }

    /// The launch fee, split at the same ratios as the protocol's share of
    /// every trade: 30 / 50 / 20. Not a second rule to remember.
    function _ucretiDagit(uint256 ucret) internal {
        uint256 g = (ucret * 3_000) / 10_000;
        uint256 l = (ucret * 5_000) / 10_000;
        uint256 i = ucret - g - l;          // the remainder, so nothing is lost
        IQuotePara q = IQuotePara(address(quote));
        if (g > 0 && !q.transfer(gelistiriciFonu, g)) revert TransferOlmadi();
        if (l > 0 && !q.transfer(likiditeKasasi, l)) revert TransferOlmadi();
        if (i > 0 && !q.transfer(isletmeKasasi, i)) revert TransferOlmadi();
    }


    /// Called by one of our curves at graduation, after it has sent the
    /// quote it collected and the tokens it has left.
    ///
    /// The curve's own name for this is "open the pool", which is what it
    /// did when it owned the venue. Here the pool has existed since the
    /// launch transaction, so the money JOINS it instead: the ladder's
    /// `biriktir` adds both assets to the position already there — tokens
    /// above the price, quote below, each snapped away from it. Opening a
    /// second pool would split the token across two venues, which is the
    /// mistake TekYonluAcici's own comments were written about.
    function ac(uint256 quoteMiktari, uint256) external {
        uint256 id = launchIdOfEgri[msg.sender];
        if (id == 0) revert BilinmeyenEgri();
        Kayit memory k = kayitlar[id - 1];

        /* The token figure is ignored in favour of the balance, because a
           balance is what arrived and an argument is what was claimed. The
           quote figure is NOT: the quote asset is shared by every launch,
           so this contract's balance is not a statement about this one. */
        if (quoteMiktari == 0) revert YetersizMiktar();
        if (quote.balanceOf(address(this)) < quoteMiktari) revert YetersizMiktar();
        uint256 tokenVar = IERC20H(k.token).balanceOf(address(this));

        /* How much of this the tokens can actually pair with. Asked of
           the opener, which owns the arithmetic: a second copy here
           would be two fixed-point calculations that must agree exactly,
           and they would stop agreeing the first time either moved.

           A revert or a zero means "no answer", and no answer means no
           cap — the old behaviour. Graduation is the curve's only exit
           and it must not be possible to fail: a revert in here would
           lock a launch shut with its money inside. */
        uint256 gonderilecek = quoteMiktari;
        uint256 fazla = 0;
        if (k.kasa != address(0)) {
            try HavuzAcici(k.acici).eslesebilirQuote(tokenVar) returns (uint256 tavan) {
                if (tavan > 0 && quoteMiktari > tavan) {
                    fazla = quoteMiktari - tavan;
                    gonderilecek = tavan;
                }
            } catch {
                /* no cap */
            }
        }

        if (!quote.transfer(k.acici, gonderilecek)) revert TransferOlmadi();
        if (tokenVar > 0 && !IERC20H(k.token).transfer(k.acici, tokenVar)) revert TransferOlmadi();

        HavuzAcici(k.acici).biriktir();

        /* The surplus goes to the floor, after the pool has been
           deepened — so if anything above reverts, nothing has been
           routed anywhere. */
        if (fazla > 0 && !quote.transfer(k.kasa, fazla)) revert TransferOlmadi();

        emit HavuzaKatildi(id, k.token, gonderilecek, tokenVar);
        if (fazla > 0) emit MezuniyetFazlasi(id, k.token, k.kasa, fazla);
    }

    // ------------------------------------------------------------ math

    function _sqrtRatioX96(uint256 num, uint256 den) internal pure returns (uint160) {
        uint256 a = _sqrt(num << 96);
        uint256 b = _sqrt(den << 96);
        if (b == 0) b = 1;
        uint256 v = (a << 96) / b;
        if (v < TickMath.MIN_SQRT_PRICE) v = TickMath.MIN_SQRT_PRICE;
        if (v > TickMath.MAX_SQRT_PRICE) v = TickMath.MAX_SQRT_PRICE;
        return uint160(v);
    }

    function _snapDown(int24 tick) internal pure returns (int24) {
        int24 r = tick / TICK_SPACING * TICK_SPACING;
        if (tick < 0 && tick % TICK_SPACING != 0) r -= TICK_SPACING;
        if (r < TickMath.MIN_TICK) r = TickMath.MIN_TICK / TICK_SPACING * TICK_SPACING;
        return r;
    }

    function _snapUp(int24 tick) internal pure returns (int24) {
        int24 r = _snapDown(tick);
        if (r != tick) r += TICK_SPACING;
        if (r > TickMath.MAX_TICK) r = TickMath.MAX_TICK / TICK_SPACING * TICK_SPACING;
        return r;
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
