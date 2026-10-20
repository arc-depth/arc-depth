// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PulseFabrika4} from "../nesil4/PulseFabrika4.sol";
import {PulseAcici4, IERC20P4} from "../nesil4/PulseAcici4.sol";
import {VergiKovasi, ISepetUcuV, IHavuzRezerviV} from "./VergiKovasi.sol";
import {SepetUcu} from "./SepetUcu.sol";
import {SepetDefteri} from "./SepetDefteri.sol";
import {IERC20S} from "./IHaberci.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IQuoteP5 {
    function approve(address spender, uint256 v) external returns (bool);
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address from, address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title PulseLaunchpad5 — nesil 4's launch, backed by a basket on any chains
///
/// The token, the pool, the hook (PulseHook4), the founder's buy and the fee
/// split are nesil 4's, unchanged. What backs the token is not a local vault:
/// it is a basket of one to five assets on any chains, $4 a line at least,
/// held by the SepetKasasi of each line's chain and recorded by the
/// SepetDefteri on Arc. The collateral dollars go to this chain's SepetUcu
/// in the launch transaction; the hook pays every trade's collateral tax into
/// a VergiKovasi for the token, which sends it to the basket in lots; holders
/// redeem through SepetUcu.itfa, on this chain or any other.
///
/// What follows is PulseLaunchpad4's own header, unchanged.
///
/// PulseLaunchpad4 — PulseLaunchpad3 wired to TeminatKasasi4 and
///        PulseHook4
///
/// The launch, the pool, the fee split and the pasted-token collateral are
/// nesil 3's, unchanged. Two things differ:
///   - each vault is told its pool, so circulating supply is the pool's
///     counted reserve (PulseHook4) and not the PoolManager's balance
///     (security review 2026-10-16, C-1 and H-1);
///   - the pool is registered before the opener initializes it, and
///     PulseHook4 accepts an initialize only from that opener (H-2);
///   - the opener is PulseAcici4, whose biriktir() can actually run.
///
/// What follows is PulseLaunchpad3's own header, unchanged.
///
/// PulseLaunchpad — the founder buys first, the market is Uniswap
///        from the first block
///
/// THREE STRUCTURAL DIFFERENCES FROM THE PREVIOUS GENERATION
///
/// 1. NO CURVE, SO NO TWO PRICES
///      In the previous generation the curve held its own market and the
///      pool opened at graduation. The same token had two prices, and at
///      graduation the pool's price started from the opening level — so
///      every bit of price movement accumulated on the curve was reset.
///      Now the market is Uniswap v4 from the first block and there is
///      nothing to reset.
///
/// 2. THE FOUNDER GETS WHAT THEY PAID FOR
///      Previously the founder received zero tokens and the whole payment
///      became pool liquidity. Now the ENTIRE net payment after the fee
///      turns into tokens at the opening price and goes to the founder's
///      wallet.
///
///      It is not free, and that is measurable: at the opening price the
///      whole supply is worth ACILIS_MCAP, and the founder's share is
///      worth exactly what they paid net. Measured across five payments,
///      the difference was 0 raw units.
///
/// 3. NO SLIPPAGE, BECAUSE THERE IS NO SWAP
///      The founder's tokens do not leave the pool through a swap — they
///      go straight to their wallet, their net USDC is placed in the pool
///      as a real bid, and the pool is started at the opening price.
///      Since the price never moves there is neither slippage nor a snipe
///      tax. The exemption is not a special case but a consequence: there
///      is no swap to exempt.
///
/// THE OPENING PRICE IS ONE OF TWO CONSTANTS
///   ACILIS_MCAP and SUPPLY are both constants, so the opening price
///   depends only on how the token's address sorts — exactly two
///   values. Both are written out here as whole integers, and
///   `olc-pulse-launch.js` recomputes them from the mcap and the
///   supply independently and compares.
///
///   The price is not computed because there is nothing to compute;
///   the TICK is, because going from `sqrtP` to a tick carries
///   rounding. A hand-written tick drifted by one unit against the
///   measurement — harmless while the band is 6,900 ticks wide, but
///   "harmless" is where silent errors begin.
/// LOCAL COLLATERAL (nesil 3): the same launch, pool, hook and fee split as
/// PulseLaunchpad2, with a different answer to "what backs the token".
///
/// The founder pastes the contract address of ANY token on this chain. The
/// page finds where it trades against this chain's dollar (a Uniswap v3
/// path or a v4 pool) and quotes it; the launch converts the founder's
/// collateral deposit (at least $20) into that token through exactly that
/// route, in the same transaction, and refuses if the vault receives less
/// than the founder's minimum. The vault is the audited TeminatKasasi:
/// it holds the token and the dollar, every trade's tax arrives in dollars
/// and stays dollars, and a redemption pays a pro-rata share of both.
///
/// Converted once, by the founder, with the founder's own money: there is no
/// later permissionless conversion whose price someone could move. If the
/// founder pastes the dollar itself, nothing is converted.
contract PulseLaunchpad5 {
    using PoolIdLibrary for PoolKey;

    /* ---- the token ---------------------------------------------- */

    uint256 public constant SUPPLY = 1_000_000_000e18;
    uint256 public constant ACILIS_MCAP = 3_500e6;

    /* ---- what a launch costs ----------------------------------- */

    /// The founder's buy. A floor because a market needs a bid, and a
    /// CEILING because the buy is the founder's share of supply: at the
    /// maximum it is 14,00% and above that the limit would stop funding a
    /// bid and start handing the market to one wallet.
    uint256 public constant ASGARI_ALIM = 100e6;
    uint256 public constant AZAMI_ALIM = 500e6;

    /// Separate from the buy, and the token holders' money rather than the
    /// founder's. No ceiling: more collateral is only ever better for
    /// holders, and the founder cannot take it back.
    uint256 public constant ASGARI_TEMINAT = 20e6;

    uint256 public constant LAUNCH_UCRET_PPM = 20_000;      // 2,00%

    /* ---- what every trade costs -------------------------------- */

    uint256 public constant UCRET_PPM = 22_000;             // 2,20% total (PulseHook5)
    uint256 public constant KURUCU_PPM = 3_000;             // 0,30%
    uint256 public constant GELISTIRICI_PPM = 3_000;        // 0,30%
    uint256 public constant LIKIDITE_PPM = 5_000;           // 0,50%
    uint256 public constant ISLETME_PPM = 2_000;            // 0,20%
    uint256 public constant FTHM_PPM = 2_000;               // 0,20%: FTHM bought and burned
    /* HOLDER REWARDS ARE GONE, AND THEIR SHARE GOES TO DEPTH
         The previous generation paid 0,30% to holders who had not moved
         for 24 hours. That is removed, and the share is not removed with
         it: the total stays 2,00% and the 0,30% joins depth, taking it
         from 0,40% to 0,70%.

         Depth rather than a wallet, for two reasons. A wallet that
         collects a slice is a wallet somebody has to be trusted with,
         and this system has none. And depth is the only place that pays
         every holder at once without paying anybody: it is locked, it
         cannot be withdrawn by the founder or the protocol or the DAO,
         and what it buys is a market that moves less when somebody
         sells. */
    uint256 public constant DERINLIK_PPM =
        UCRET_PPM - KURUCU_PPM - GELISTIRICI_PPM - LIKIDITE_PPM - ISLETME_PPM - FTHM_PPM;   // 0,70%

    /// The collateral tax, chosen once at launch and never changeable.
    uint256 public constant VERGI_ASGARI_PPM = 10_000;      // 1%
    uint256 public constant VERGI_AZAMI_PPM = 50_000;       // 5%
    uint256 public constant VERGI_VARSAYILAN_PPM = 10_000;  // 1%

    /* ---- the pool ---------------------------------------------- */

    uint24 public constant POOL_FEE = 0;
    int24 public constant TICK_SPACING = 60;

    /* THE BAND, IN TICKS, AND WHY THESE TWO NUMBERS
         A tick is a 1,0001 step, so a price multiple m sits
         ln(m)/ln(1,0001) ticks away.

         THE LADDER (19 Oct 2026): from the opening price to the last
           usable tick (TickMath.maxUsableTick(60) = 887.220), one-sided.
           The token never runs out: price follows x·y=k with a virtual
           dollar reserve of (ladder tokens × opening price), the same
           economy the Aptos and Sui pools already run. The earlier band,
           MERDIVEN_TICK 6.900 (1,0001^6900 = 1,99), held the whole
           ladder inside one doubling: measured on Arc mainnet (PTEST1)
           ~$4.800 of buys took every token and later buys were refused.

         TEKLIF_TICK    9.180  ->  1,0001^-9180 = 0,399, a 60,1% fall.
           Not a round number and not arbitrary: the defence fires at a
           60% drawdown from the peak, and the pool's own bid has to
           still be live at the moment the defence is needed. A shallower
           band would mean the bid had already been consumed by the time
           the collateral was supposed to step in.

         Both are measured against the real PoolManager in
         olc-pulse-acici.js, including the direction — which FLIPS with
         the token's address ordering and was silently backwards on the
         first run. */
    /// the ladder's far edge: the last tick a 60-spacing position may use
    int24 public constant MERDIVEN_UC_TICK = 887_220;
    int24 public constant TEKLIF_TICK = 9_180;

    /* THE TWO POSSIBLE OPENING PRICES
         sqrt(ACILIS_MCAP / SUPPLY) * 2^96 when the token sorts first, and
         the inverse when it sorts second. Integers rather than a runtime
         square root: both inputs are constants, so there are exactly two
         answers and a loop computing one of them every launch is a loop
         that can be wrong.

         Verified independently in the measurement script, which derives
         them from ACILIS_MCAP and SUPPLY and compares. */
    uint160 public constant ACILIS_SQRTP_TOKEN0 = 148222319756011721493;
    uint160 public constant ACILIS_SQRTP_TOKEN1 = 42349234216003348998117907259291130311;

    /* ---- wiring ------------------------------------------------ */

    IQuoteP5 public immutable quote;
    IPoolManager public immutable poolManager;
    IHooks public immutable hook;
    PulseFabrika4 public immutable fabrika;
    SepetUcu public immutable ucu;
    address public immutable gelistiriciFonu;
    address public immutable likiditeKasasi;
    address public immutable isletmeKasasi;
    /* Reused from the deployed generation rather than redeployed: the
       registry fixes its chain set at construction and the one on chain
       already points at the real remote factories on Ethereum and Base,
       verified byte for byte. A second registry would be a second answer
       to where a token's collateral goes. */

    /* ---- the register ------------------------------------------ */

    struct Kayit {
        address token;
        address acici;
        address kasa;
        uint256 teminat;          // dollars sent to the basket
        address kurucu;
        uint256 kurucuToken;
        uint256 teklif;
        uint256 vergiPpm;
        uint64 zaman;
    }

    Kayit[] private kayitlar;

    mapping(PoolId => uint256) public launchIdOfPool;

    event Launched(
        uint256 indexed id, address indexed token, address indexed kurucu,
        address acici, address kasa, string ad, string sembol
    );
    event IlkAlim(uint256 indexed id, address kurucu, uint256 odenen,
                  uint256 ucret, uint256 net, uint256 alinanToken);
    event Kuruldu(uint256 indexed id, address kova, uint256 teminat,
                  uint256 kalem, uint256 vergiPpm);
    event HavuzAcildi(uint256 indexed id, PoolId havuzId, uint160 sqrtPriceX96,
                      int24 alt, int24 ust, uint256 merdiven, uint256 teklif);

    error KotuKurulum();
    error BosAd();
    error AlimAz();
    error AlimCok();
    error TeminatAz();
    error KotuVergi();
    error KotuHedef();
    error TransferOlmadi();
    error KotuId();

    constructor(
        IQuoteP5 _quote,
        IPoolManager _poolManager,
        IHooks _hook,
        PulseFabrika4 _fabrika,
        SepetUcu _ucu,
        address _gelistiriciFonu,
        address _likiditeKasasi,
        address _isletmeKasasi
    ) {
        if (address(_quote) == address(0)) revert KotuKurulum();
        if (address(_poolManager) == address(0)) revert KotuKurulum();
        if (address(_hook) == address(0)) revert KotuKurulum();
        if (address(_fabrika) == address(0)) revert KotuKurulum();
        if (address(_ucu) == address(0)) revert KotuKurulum();
        if (_gelistiriciFonu == address(0)) revert KotuKurulum();
        if (_likiditeKasasi == address(0)) revert KotuKurulum();
        if (_isletmeKasasi == address(0)) revert KotuKurulum();
        quote = _quote;
        poolManager = _poolManager;
        hook = _hook;
        fabrika = _fabrika;
        ucu = _ucu;
        gelistiriciFonu = _gelistiriciFonu;
        likiditeKasasi = _likiditeKasasi;
        isletmeKasasi = _isletmeKasasi;
    }

    /* ---- the only entry point ---------------------------------- */

    /// Create a token, buy the founder's share at the opening price, open a
    /// Uniswap v4 pool with a real bid in it, and fund the token's vault.
    ///
    /// @param alim         the founder's payment, ASGARI_ALIM..AZAMI_ALIM.
    ///                     The fee comes off it and ALL the rest becomes
    ///                     tokens in the founder's wallet.
    /// @param sepet        1 to 5 lines (chain, asset, dollars >= $4) on any
    ///                     chains; their sum is the collateral, paid with the
    ///                     buy and sent to the basket. The assets are the
    ///                     founder's choice.
    /// @param teklif       the page's quote per line: units its dollars buy
    ///                     now, where each line's first auction starts from.
    /// @param vergiPpm     the collateral tax on every trade, 1%..5%,
    ///                     chosen once and never changeable.
    function launch(
        string calldata ad,
        string calldata sembol,
        SepetDefteri.Kalem[] calldata sepet,
        uint256[] calldata teklif,
        uint256 vergiPpm,
        uint256 alim
    )
        external
        returns (address token, address kasa)
    {
        if (bytes(ad).length == 0 || bytes(sembol).length == 0) revert BosAd();
        if (alim < ASGARI_ALIM) revert AlimAz();
        if (alim > AZAMI_ALIM) revert AlimCok();
        if (vergiPpm < VERGI_ASGARI_PPM || vergiPpm > VERGI_AZAMI_PPM) revert KotuVergi();
        uint256 teminat;
        for (uint256 i = 0; i < sepet.length; i++) teminat += sepet[i].dolar;
        if (teminat < ASGARI_TEMINAT) revert TeminatAz();

        uint256 ucret = (alim * LAUNCH_UCRET_PPM) / 1_000_000;
        uint256 net = alim - ucret;
        /* The founder's share, from the contract's own opening price.
           ONE formula, used here and nowhere else — a second one would be
           a second price that could drift from this. */
        uint256 kurucuToken = (net * SUPPLY) / ACILIS_MCAP;
        /* Every launch must leave a ladder. At the maximum buy the
           founder takes 14,00%, so this cannot trigger today; asserted
           because it is the invariant the ceiling exists to keep, and a
           future ceiling change would otherwise break it silently. */
        if (kurucuToken == 0 || kurucuToken >= SUPPLY) revert AlimCok();
        uint256 merdiven = SUPPLY - kurucuToken;

        /* The money comes in first. Both amounts in one pull, so a launch
           cannot half-happen with the collateral missing. */
        if (!quote.transferFrom(msg.sender, address(this), alim + teminat)) {
            revert TransferOlmadi();
        }

        /* The id is computed BEFORE the push and checked after, because
           the opener and the vault both have to be told which launch they
           belong to and a mismatch there is permanent. */
        uint256 id = kayitlar.length + 1;

        (address t, address acici) = fabrika.kur(ad, sembol, PulseFabrika4.Ayar({
            quote: IERC20P4(address(quote)),
            poolManager: poolManager,
            hook: hook,
            supply: SUPPLY,
            poolFee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            merkez: address(this)
        }));

        /* The tax bucket answers the hook's circulating-supply question
           from the pool's counted reserve, so it is built knowing its pool. */
        PoolKey memory key = havuzAnahtari(t);
        address k = address(new VergiKovasi(IERC20S(address(quote)), ISepetUcuV(address(ucu)), t,
            IHavuzRezerviV(address(hook)), PoolId.unwrap(key.toId()), acici));

        kayitlar.push(Kayit({
            token: t,
            acici: acici,
            kasa: k,
            teminat: teminat,
            kurucu: msg.sender,
            kurucuToken: kurucuToken,
            teklif: net,
            vergiPpm: vergiPpm,
            zaman: uint64(block.timestamp)
        }));
        if (kayitlar.length != id) revert KotuId();

        /* Registered before the opener initializes: PulseHook4 refuses an
           initialize for a pool that is not registered, or from anyone but
           its opener. */
        launchIdOfPool[key.toId()] = id;

        emit Launched(id, t, msg.sender, acici, k, ad, sembol);

        /* ---- 1. the fee, split three ways ------------------------- */
        _ucretiDagit(ucret);

        /* ---- 2. the collateral, to the basket --------------------- */
        /* The entry pulls exactly the lines' sum from here, checks the
           basket's shape and sends it to the Defter; a basket the Defter
           cannot take comes back to the founder on this chain. */
        if (!quote.approve(address(ucu), teminat)) revert TransferOlmadi();
        ucu.baslat(t, msg.sender, SUPPLY, sepet, teklif);
        emit Kuruldu(id, k, teminat, sepet.length, vergiPpm);

        /* ---- 3. the founder's tokens, to the founder -------------- */
        /* Not a swap. They go from this contract to the wallet that paid
           for them, so no price moves and there is nothing for a snipe
           tax to apply to. */
        if (!IERC20P4(t).transfer(msg.sender, kurucuToken)) revert TransferOlmadi();
        emit IlkAlim(id, msg.sender, alim, ucret, net, kurucuToken);

        /* ---- 4. the pool, both sides real ------------------------ */
        if (!IERC20P4(t).transfer(acici, merdiven)) revert TransferOlmadi();
        if (!quote.transfer(acici, net)) revert TransferOlmadi();

        (uint160 sqrtP, int24 alt, int24 ust) = acilisBandi(t);
        PulseAcici4(acici).ac(sqrtP, alt, ust);
        emit HavuzAcildi(id, key.toId(), sqrtP, alt, ust, merdiven, net);

        return (t, k);
    }

    /* ---- the opening price and band ---------------------------- */

    /// The opening price and the two band edges for `token`.
    ///
    /// Public so it can be read before a launch is sent, and so the
    /// measurement can compare it against a derivation that shares no code
    /// with it.
    function acilisBandi(address token)
        public
        view
        returns (uint160 sqrtP, int24 alt, int24 ust)
    {
        bool tokenSifirinci = token < address(quote);
        sqrtP = tokenSifirinci ? ACILIS_SQRTP_TOKEN0 : ACILIS_SQRTP_TOKEN1;

        /* The tick from the price, not a constant. A hand-written tick
           differed from the chain's by one unit — harmless inside a 6.900
           tick band, and "harmless" is where silent errors start. */
        int24 t = TickMath.getTickAtSqrtPrice(sqrtP);
        int24 taban = (t / TICK_SPACING) * TICK_SPACING;
        if (t < 0 && taban != t) taban -= TICK_SPACING;

        /* THE DIRECTION FLIPS WITH THE ORDERING
             A v4 price is currency1/currency0 always, so a HIGHER tick
             means the token is dearer when it sorts first and CHEAPER
             when it sorts second. Measured: written one way for both, the
             ladder reached 2,5x instead of 2x and the bid covered 50%
             instead of 60% — and nothing reverted. */
        if (tokenSifirinci) {
            ust = MERDIVEN_UC_TICK;           // ladder: dearer, without end
            alt = taban - TEKLIF_TICK;        // bid: cheaper
        } else {
            ust = taban + TEKLIF_TICK;        // bid is UP in tick space here
            alt = -MERDIVEN_UC_TICK;          // ladder is DOWN, without end
        }
    }

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

    /* ---- what the hook reads ----------------------------------- */

    /// Everything the hook needs to charge a trade, in one call.
    ///
    /// `rewards` is gone from this tuple because holder rewards are gone.
    /// A zero placeholder was the alternative and would have been worse:
    /// a hook reading a zero address and transferring to it burns the
    /// slice silently.
    function havuzKaydi(PoolId id)
        external
        view
        returns (address token, address acici, address kurucu, address kasa, uint256 vergiPpm)
    {
        uint256 i = launchIdOfPool[id];
        if (i == 0) return (address(0), address(0), address(0), address(0), 0);
        Kayit memory k = kayitlar[i - 1];
        return (k.token, k.acici, k.kurucu, k.kasa, k.vergiPpm);
    }

    function launchCount() external view returns (uint256) {
        return kayitlar.length;
    }

    function launchAt(uint256 i) external view returns (Kayit memory) {
        return kayitlar[i];
    }

    /* ---- the launch fee ---------------------------------------- */

    /// Split at the same ratios as the protocol's share of every trade:
    /// 30 / 50 / 20 across developer, liquidity and operations. Not a
    /// second rule to remember, and the founder's own slice is absent on
    /// purpose — a launch has no counterparty to earn from.
    function _ucretiDagit(uint256 ucret) internal {
        uint256 g = (ucret * 3_000) / 10_000;
        uint256 l = (ucret * 5_000) / 10_000;
        uint256 i = ucret - g - l;          // the remainder, so nothing is lost
        if (g > 0 && !quote.transfer(gelistiriciFonu, g)) revert TransferOlmadi();
        if (l > 0 && !quote.transfer(likiditeKasasi, l)) revert TransferOlmadi();
        if (i > 0 && !quote.transfer(isletmeKasasi, i)) revert TransferOlmadi();
    }
}
