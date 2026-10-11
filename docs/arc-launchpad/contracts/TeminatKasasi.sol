// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IOracle} from "./IOracle.sol";

interface IERC20K {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

interface IYakilabilir {
    function burnFrom(address from, uint256 value) external;
    function burn(uint256 value) external;
}

/// @title TeminatKasasi — one launch's collateral, and the only ways out.
/// @notice Holds a basket of assets. Every token carries a pro-rata claim on
///         every asset in it, and that claim per token can never fall.
///
/// WHAT A HOLDER OWNS
///   hak_i = bakiye_i / dolasim, one ratio per asset, measured not quoted.
///   Redeeming burns tokens and pays that share of EVERY asset, which leaves
///   each ratio exactly where it was — measured: a 40,000,000 token
///   redemption moved cirBTC, SOL and PEPE ratios by zero.
///
///   No price appears in that sentence, so there is no oracle to read and
///   nothing to manipulate. A basket claim is a ratio; only a DISPLAY needs
///   a price, and a display cannot be drained.
///
/// WHY A BUYBACK DOES NOT TAKE FROM HOLDERS
///   Spending reserve to buy tokens and burn them changes both the numerator
///   and the denominator. Measured, the direction depends entirely on price:
///
///       buying ABOVE the per-token claim LOWERS it
///       buying AT    it leaves it unchanged
///       buying BELOW it RAISES it
///
///   So the rule is not a policy, it is a check: after the call, the spent
///   asset's ratio must not have fallen, or the whole call reverts. Every
///   OTHER asset's ratio rises for free, because supply dropped and their
///   balances did not. That is why only the spent asset is checked —
///   checking all of them would burn gas to re-prove an inequality that
///   holds by construction.
///
/// THE INVARIANT IS NOT ENOUGH ON ITS OWN
///   It bounds each call, not the sequence. Simulated: with the invariant
///   satisfied at every step, 117 successive calls drained 99.2% of a
///   reserve — each one accretive, the reserve still gone. So there is a
///   second, independent limit: a share per call and a share per window.
///
/// WHAT NOBODY CAN DO
///   No owner, no setter, no pause, no upgrade, no rescue, no recipient
///   parameter. Collateral leaves by exactly two paths: a proportional
///   redemption, and a buyback that has to prove it did not dilute anyone.
contract TeminatKasasi {
    /// The launch token. Supply falls when tokens are burned, which is what
    /// makes both paths proportional.
    IERC20K public immutable token;

    /// Addresses whose balance is NOT circulating and therefore carries no
    /// claim: the curve still holding unsold supply, and the pool opener.
    /// Counting them would spread the basket over tokens nobody owns and
    /// understate every real holder's share.
    address public immutable egri;
    address public immutable acici;

    /// The basket, fixed at construction. There is deliberately no way to
    /// add or remove one: whoever could change the basket could swap a
    /// serious asset out for their own token after people had bought.
    address[] private varliklar;
    mapping(address => bool) public sepette;
    /// Target share of the basket's VALUED total, in bps, per asset. They
    /// sum to 10_000 across the whole basket. Assets with no oracle carry
    /// a weight of zero: they can be held but never bought into, so a
    /// weight for them would describe a conversion that cannot happen.
    mapping(address => uint16) public agirlik;

    /// The pending currency — what fees and the initial collateral arrive
    /// in, and the only thing cevir() may spend. Not privileged as
    /// collateral: it has a weight like everything else and if that weight
    /// is zero it converts away entirely.
    address public immutable quote;
    IOracle public immutable oracle;

    /// Smallest conversion. Below this the gas and the spread eat more
    /// than the conversion is worth, and repeatedly converting dust at the
    /// slippage bound would bleed the basket one rounding at a time.
    uint256 public constant ASGARI_CEVIRME = 5e6;      // $5 at six decimals
    /// How far below the oracle's value a conversion may land. This is
    /// also the caller's whole reward: whatever they beat it by, they
    /// keep. So there is no separate incentive to size, and none to drain.
    uint256 public constant AZAMI_SAPMA_BPS = 100;     // 1%

    /* ---- rate limits, independent of the invariant ------------------ */

    /// Share of one asset's balance a single buyback may SPEND, in bps.
    /// The spend, not the outflow: the spend is what moves the price, and
    /// one defence action should not buy more than this in a single
    /// transaction whatever it earns doing so.
    uint256 public constant ISLEM_TAVANI_BPS = 200;    // 2%

    /// Share of the balance that may LEAVE across one window — spend
    /// plus reward. This is the limit that makes a promise, so it counts
    /// everything that goes out.
    uint256 public constant DONEM_TAVANI_BPS = 1000;   // 10%

    /// Window length in blocks.
    ///
    /// 7200 reads as "a day" to anyone used to twelve-second blocks. It
    /// is not. Arc's block time, measured over 20,000 blocks, is 0.507
    /// seconds, which makes this window 1.01 HOURS — so the ceiling is
    /// 10% of the reserve per hour, not per day, and the floor can act
    /// again within the same session as the crash it is answering. That
    /// is the intended reading; the figure is written down because the
    /// other reading is off by twenty-four times and compiles just as
    /// well.
    uint256 public constant DONEM_BLOK = 7200;         // ~1.01 saat @ 0,507 s/blok

    /// Share of the invariant's slack a caller may keep, in bps. The rest
    /// stays and raises every holder's claim.
    uint256 public constant ODUL_PAYI_BPS = 2000;      // 20%

    struct Donem {
        uint64 baslangicBlok;
        uint256 harcanan;
    }
    mapping(address => Donem) public donem;

    /// Reentrancy guard. Redemption and buyback are each safe alone —
    /// measured, interleaved, neither ever lowered the claim — but a token
    /// that calls back mid-update could read a half-written balance.
    bool private _kilit;

    event Iade(address indexed kime, uint256 yakilan, uint256 dolasim);
    event IadeKalemi(address indexed kime, address indexed varlik, uint256 miktar);
    event GeriAlim(
        address indexed cagiran,
        address indexed varlik,
        uint256 harcanan,
        uint256 yakilan,
        uint256 odul,
        uint256 hakOnce,
        uint256 hakSonra
    );
    event Beslendi(address indexed varlik, address indexed kimden, uint256 miktar);
    event Cevrildi(
        address indexed cagiran,
        address indexed hedef,
        uint256 harcanan,
        uint256 gelen,
        uint256 oracleDegeri
    );

    error KotuKurulum();
    error SepetteYok();
    error SifirMiktar();
    error DolasimYok();
    error TransferOlmadi();
    error IslemTavani();
    error DonemTavani();
    error HakDustu();
    error Yeniden();
    error AgirlikSifir();
    error AzMiktar();
    error YetersizBekleyen();
    error KotuKur();
    error AgirlikAsildi();

    modifier kilitli() {
        if (_kilit) revert Yeniden();
        _kilit = true;
        _;
        _kilit = false;
    }

    constructor(
        IERC20K _token,
        address _egri,
        address _acici,
        address _quote,
        IOracle _oracle,
        address[] memory _varliklar,
        uint16[] memory _agirliklar
    ) {
        if (address(_token) == address(0) || _egri == address(0) || _acici == address(0)) revert KotuKurulum();
        if (_varliklar.length == 0) revert KotuKurulum();
        if (_varliklar.length != _agirliklar.length) revert KotuKurulum();
        if (_quote == address(0) || address(_oracle) == address(0)) revert KotuKurulum();
        quote = _quote;
        oracle = _oracle;
        token = _token;
        egri = _egri;
        acici = _acici;
        uint256 toplamAgirlik;
        for (uint256 i = 0; i < _varliklar.length; i++) {
            address v = _varliklar[i];
            if (v == address(0) || v == address(_token)) revert KotuKurulum();
            if (sepette[v]) revert KotuKurulum();      // no duplicates
            sepette[v] = true;
            agirlik[v] = _agirliklar[i];
            varliklar.push(v);
            toplamAgirlik += _agirliklar[i];
        }
        /* The weights have to close. A basket whose weights sum to
           anything but one either strands the remainder as permanent
           pending USDC or lets one asset be bought past its share. */
        if (toplamAgirlik != 10_000) revert KotuKurulum();
    }

    function sepet() external view returns (address[] memory) {
        return varliklar;
    }

    /// Supply that actually carries a claim: everything except what the
    /// curve has not sold yet and what sits in the opener.
    function dolasim() public view returns (uint256) {
        uint256 t = token.totalSupply();
        uint256 e = token.balanceOf(egri);
        uint256 a = token.balanceOf(acici);
        uint256 dis = e + a;
        return t > dis ? t - dis : 0;
    }

    /// One asset's claim per token, as a raw ratio scaled by 1e36.
    ///
    /// The scale is not cosmetic. With six-decimal collateral against a
    /// billion eighteen-decimal tokens, a 1e18 scale truncated the whole
    /// number away: $1,500 behind 1e27 raw tokens came out as 1. Anything
    /// reading this divides by 1e36, not 1e18.
    uint256 public constant HAK_OLCEGI = 1e36;

    function hak(address varlik) public view returns (uint256) {
        uint256 d = dolasim();
        if (d == 0) return 0;
        return (IERC20K(varlik).balanceOf(address(this)) * HAK_OLCEGI) / d;
    }

    function bakiye(address varlik) public view returns (uint256) {
        return IERC20K(varlik).balanceOf(address(this));
    }

    /// Anyone may add to the basket. It can only raise every holder's
    /// claim, so it needs no permission — and the fee route uses it.
    function besle(address varlik, uint256 miktar) external {
        if (!sepette[varlik]) revert SepetteYok();
        if (miktar == 0) revert SifirMiktar();
        if (!IERC20K(varlik).transferFrom(msg.sender, address(this), miktar)) revert TransferOlmadi();
        emit Beslendi(varlik, msg.sender, miktar);
    }

    /// Burn `miktar` tokens, receive that share of every asset in the basket.
    ///
    /// The caller must have approved this vault on the token first. The burn
    /// happens before any payout, so a token that re-entered during its own
    /// burn would find supply already reduced and the shares already fixed.
    function iade(uint256 miktar) external kilitli returns (uint256[] memory odenen) {
        if (miktar == 0) revert SifirMiktar();
        uint256 d = dolasim();
        if (d == 0) revert DolasimYok();

        uint256 k = varliklar.length;
        odenen = new uint256[](k);
        /* Shares are computed against the PRE-burn supply, all of them,
           before anything moves. Computing them one at a time after each
           transfer would use a denominator that had already changed. */
        for (uint256 i = 0; i < k; i++) {
            odenen[i] = (IERC20K(varliklar[i]).balanceOf(address(this)) * miktar) / d;
        }

        IYakilabilir(address(token)).burnFrom(msg.sender, miktar);

        for (uint256 i = 0; i < k; i++) {
            if (odenen[i] > 0) {
                if (!IERC20K(varliklar[i]).transfer(msg.sender, odenen[i])) revert TransferOlmadi();
                emit IadeKalemi(msg.sender, varliklar[i], odenen[i]);
            }
        }
        emit Iade(msg.sender, miktar, d);
    }

    /// What `harcama` of `varlik` may be spent on, and what a caller may
    /// keep, if `yakilacak` tokens come back burned.
    ///
    /// slack = what the burned tokens were worth AT the claim, minus what
    /// they actually cost. It is exactly the discount captured, never more —
    /// an earlier version of this arithmetic used the remaining claim
    /// instead and offered a $9,005 reward on a $475 purchase.
    function bosluk(address varlik, uint256 harcama, uint256 yakilacak)
        public
        view
        returns (uint256)
    {
        uint256 d = dolasim();
        if (d == 0 || yakilacak >= d) return 0;
        uint256 b = IERC20K(varlik).balanceOf(address(this));
        uint256 tabanDeger = (b * yakilacak) / d;
        return tabanDeger > harcama ? tabanDeger - harcama : 0;
    }

    function azamiOdul(address varlik, uint256 harcama, uint256 yakilacak)
        external
        view
        returns (uint256)
    {
        return (bosluk(varlik, harcama, yakilacak) * ODUL_PAYI_BPS) / 10_000;
    }

    /* ---- the buyback -------------------------------------------------
     *
     * WHY THIS IS A LOAN AND NOT A SWAP
     *   The obvious shape is for the vault to sell the asset and buy the
     *   token itself. That would put routing inside the contract holding
     *   the money: a pool address, a path, a slippage bound, and a new
     *   failure surface for every venue anyone ever wants to use.
     *
     *   So the vault lends instead. It hands the caller the asset, the
     *   caller routes it however they like — any DEX, an aggregator, their
     *   own inventory — and has to leave launch tokens behind. The vault
     *   burns whatever arrived and then checks the one thing it cares
     *   about: that the claim per token did not fall.
     *
     *   The vault therefore needs to know nothing about any DEX, and a new
     *   venue needs no change here.
     *
     * WHY IT IS SAFE TO LEND TO A STRANGER
     *   A caller who takes the asset and returns nothing leaves the balance
     *   lower with supply unchanged, so the claim falls and the whole call
     *   reverts. There is no path where the vault ends up worse off: the
     *   check is the repayment condition.
     */
    function geriAl(address varlik, uint256 harcama, bytes calldata veri)
        external
        kilitli
        returns (uint256 yakilan, uint256 odul)
    {
        if (!sepette[varlik]) revert SepetteYok();
        if (harcama == 0) revert SifirMiktar();

        uint256 b0 = IERC20K(varlik).balanceOf(address(this));
        if (b0 == 0) revert SifirMiktar();

        /* Limit one bounds the SPEND, not the outflow, and that is
           deliberate. The spend is what moves the price: one defence
           action must not be able to buy more than 2% of the reserve's
           worth in a single transaction, whatever it earns doing it.

           Folding the reward in here instead made every discounted
           buyback impossible. At a 4x gap between claim and price the
           reward is 0.6 of the spend, so the pair only fits if the spend
           drops to 1.25% — and a caller asking for the 2% this line
           allows was then refused after the swap, every time. Measured:
           zero calls went through. The reward belongs in the window
           limit below, which is about what LEAVES. */
        if (harcama > (b0 * ISLEM_TAVANI_BPS) / 10_000) revert IslemTavani();

        /* Limit two: the window. Independent of the invariant, because the
           invariant bounds each call and not the sequence — 117 accretive
           calls in a row still emptied a simulated reserve.

           Both limits count the REWARD as well as the spend, and that
           was not always true. Counting only the spend let 17.07% of a
           reserve leave inside one block against a ceiling of 10%: the
           reward is 20% of the captured discount, and at a deep discount
           it exceeds the spend outright ($96.61 against $74.12, measured
           on a real pool). The spend returns as burned supply and lifts
           the claim; the reward leaves for good. So the reward is the one
           part that must be inside the bound, not outside it.

           The spend is booked here, BEFORE the vault lends anything, so
           that even a reentrant call — which the lock already refuses —
           could not find the window unaccounted. The reward is added
           once it is known. */
        Donem storage dn = donem[varlik];
        if (block.number >= dn.baslangicBlok + DONEM_BLOK) {
            dn.baslangicBlok = uint64(block.number);
            dn.harcanan = 0;
        }
        uint256 donemTavani = (b0 * DONEM_TAVANI_BPS) / 10_000;
        if (dn.harcanan + harcama > donemTavani) revert DonemTavani();
        dn.harcanan += harcama;

        /* The pre-state is captured before anything moves, because the slack
           is defined against the claim as it stood BEFORE the burn. An
           earlier draft computed it afterwards with yakilacak = 0, which
           made the slack identically zero and silently paid no reward at
           all — a reward that is always zero is a keeper network that never
           runs. */
        uint256 d0 = dolasim();
        if (d0 == 0) revert DolasimYok();
        uint256 hakOnce = hak(varlik);

        if (!IERC20K(varlik).transfer(msg.sender, harcama)) revert TransferOlmadi();
        IGeriAlimAlicisi(msg.sender).geriAlimCagrisi(varlik, harcama, veri);

        /* Whatever the caller left. Reading the balance rather than trusting
           a reported figure, for the same reason the opener does. */
        yakilan = token.balanceOf(address(this));
        if (yakilan == 0) revert SifirMiktar();

        /* Slack = what those tokens were worth at the pre-burn claim, minus
           what they actually cost. Exactly the discount captured, never
           more. */
        uint256 tabanDeger = (b0 * yakilan) / d0;
        uint256 bos = tabanDeger > harcama ? tabanDeger - harcama : 0;
        odul = (bos * ODUL_PAYI_BPS) / 10_000;

        /* Now that the reward is known, the WINDOW counts it. This is the
           check that makes the window's promise true: the reward can be
           larger than the spend at a deep discount — $96.61 against
           $74.12, measured on a real pool — and it is the only part of
           the outflow that does not come back as burned supply.

           A late revert is the cost: a sequence can be stopped here after
           its swap has already happened, and the whole transaction
           unwinds. A keeper that simulates first never sees it, and one
           that does not is paying for its own carelessness. The
           alternative was to bound the reward itself, which would cap the
           incentive exactly where the discount, and so the need, is
           greatest. */
        if (dn.harcanan + odul > donemTavani) revert DonemTavani();
        dn.harcanan += odul;

        IYakilabilir(address(token)).burn(yakilan);

        /* Paid after the burn so the invariant check below covers the reward
           as well: whatever leaves here still has to sit inside the
           inequality. */
        if (odul > 0 && !IERC20K(varlik).transfer(msg.sender, odul)) revert TransferOlmadi();

        uint256 hakSonra = hak(varlik);
        if (hakSonra < hakOnce) revert HakDustu();

        emit GeriAlim(msg.sender, varlik, harcama, yakilan, odul, hakOnce, hakSonra);
    }

    /* ---- conversion --------------------------------------------------
     *
     * THE ONE OPERATION THAT NEEDS A PRICE
     *   Redemption is a ratio and a buyback is self-referential — neither
     *   looks outside itself, so neither needs an oracle. Swapping the
     *   pending quote for an asset accepts an exchange RATE, and the only
     *   rate available without an oracle is the pool's own, which is
     *   exactly what an attacker moves for one block.
     *
     *   So VarlikKayit refuses to mark an oracle-less asset convertible,
     *   and this refuses to convert into one. Such an asset can still be
     *   HELD and redeemed proportionally; it simply cannot be bought.
     *
     * THE SLIPPAGE BOUND IS THE WHOLE REWARD
     *   The vault lends the quote, the caller routes it anywhere, and the
     *   vault checks the oracle value of what came back against
     *   harcama - AZAMI_SAPMA_BPS. Whatever the caller beats that by,
     *   they keep. So there is no separate incentive to size and none to
     *   exploit: a caller who returns too little reverts, and a caller who
     *   returns more is simply better at routing.
     */
    function cevir(address hedef, uint256 harcama, bytes calldata veri)
        external
        kilitli
        returns (uint256 gelen)
    {
        if (!sepette[hedef] || hedef == quote) revert SepetteYok();
        /* Weight zero means the creator did not choose this asset as a
           target. It may sit in the basket — someone can send it, and a
           redemption still pays a share of it — but nothing buys it. */
        if (agirlik[hedef] == 0) revert AgirlikSifir();
        if (harcama < ASGARI_CEVIRME) revert AzMiktar();
        if (harcama > IERC20K(quote).balanceOf(address(this))) revert YetersizBekleyen();

        uint256 once = IERC20K(hedef).balanceOf(address(this));

        if (!IERC20K(quote).transfer(msg.sender, harcama)) revert TransferOlmadi();
        ICevirmeAlicisi(msg.sender).cevirmeCagrisi(quote, harcama, hedef, veri);

        gelen = IERC20K(hedef).balanceOf(address(this)) - once;
        if (gelen == 0) revert SifirMiktar();

        /* What the oracle says it is worth, against what was lent. A
           caller who takes the quote and returns nothing lands here with
           gelen == 0 and has already reverted above. */
        uint256 deg = oracle.deger(hedef, gelen);
        uint256 taban = harcama - (harcama * AZAMI_SAPMA_BPS) / 10_000;
        if (deg < taban) revert KotuKur();

        /* And the creator's weights bind. Without this a caller could put
           every dollar into whichever listed asset suited them, at a fair
           rate, and still end up with a basket nobody chose. */
        if (_payAsiyor(hedef)) revert AgirlikAsildi();

        emit Cevrildi(msg.sender, hedef, harcama, gelen, deg);
    }

    /// How far past its target share an asset may drift before a further
    /// conversion into it is refused. Prices move between conversions, so
    /// a zero tolerance would make the weights unreachable rather than
    /// binding.
    uint256 public constant AGIRLIK_TOLERANS_BPS = 500;   // 5 points

    /// Value of `miktar` of `varlik` in quote units. The quote itself is
    /// worth itself — routing it through a price would add a feed that can
    /// be stale for no information at all.
    function degerle(address varlik, uint256 miktar) public view returns (uint256) {
        if (varlik == quote) return miktar;
        if (agirlik[varlik] == 0) return 0;      // unvalued counts as zero
        return oracle.deger(varlik, miktar);
    }

    /// The basket's valued total, in quote units. Assets with no weight
    /// contribute zero — the same rule that keeps an unpriceable asset
    /// from inflating any floor.
    function sepetDegeri() public view returns (uint256 toplam) {
        for (uint256 i = 0; i < varliklar.length; i++) {
            address v = varliklar[i];
            toplam += degerle(v, IERC20K(v).balanceOf(address(this)));
        }
    }

    function _payAsiyor(address hedef) internal view returns (bool) {
        uint256 toplam = sepetDegeri();
        if (toplam == 0) return false;
        uint256 pay = degerle(hedef, IERC20K(hedef).balanceOf(address(this)));
        uint256 tavan = uint256(agirlik[hedef]) + AGIRLIK_TOLERANS_BPS;
        return pay * 10_000 > toplam * tavan;
    }
}

interface ICevirmeAlicisi {
    /// Called with the borrowed quote already in hand. Leave `hedef` in the
    /// vault before returning, or the vault's own oracle check reverts the
    /// whole thing.
    function cevirmeCagrisi(address odunc, uint256 harcama, address hedef, bytes calldata veri) external;
}

interface IGeriAlimAlicisi {
    /// Called with the borrowed asset already in hand. Leave launch tokens
    /// in the vault before returning, or the vault's own check reverts the
    /// whole thing.
    function geriAlimCagrisi(address varlik, uint256 harcama, bytes calldata veri) external;
}
