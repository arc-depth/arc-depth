// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IEgriToken {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function burn(uint256 v) external;
}

interface IHavuzAcici {
    /// Open the permanent pool with exactly what it has just been sent.
    function ac(uint256 quoteMiktari, uint256 tokenMiktari) external;
}

/// @title Egri — a bonding curve that needs no capital from the protocol.
/// @notice Buyers' own money is the only real reserve. We put in nothing.
///
/// WHY A CURVE AND NOT A POOL
///   The previous token was given a one-sided Uniswap position at a price
///   somebody picked, and it needed capital we did not have — so it ended up
///   funded out of the founder's own share. A curve removes both problems at
///   once: the opening price comes from a reserve that is priced against but
///   never held, and every real dollar in here arrived from a buyer.
///
///   It also fixes the mistake that cost this project 300,000,000 tokens:
///   permanent liquidity is no longer committed at launch. It waits until
///   the curve has taken in `ESIK`, which is proof that somebody wanted the
///   token. On pump.fun 97-98% of launches never reach that point; under the
///   old design each of those would have locked a pool forever.
///
/// THE ARITHMETIC
///   Constant product against reserves that start out partly notional:
///
///       x = FANTOM + toplanan        quote side
///       y = k / x                    token side
///       k = FANTOM * SANAL_TOKEN     fixed at construction
///
///   The opening price is FANTOM/SANAL_TOKEN, reached without a deposit.
///   `toplanan` is the only piece of state: x follows from it, y follows
///   from x, and the tokens still here follow from the balance. Nothing is
///   stored twice, so nothing can drift out of step.
///
///   x - FANTOM is always exactly the real money collected, so the curve can
///   never pay out more than it took in. That is not a check bolted on; it
///   is the shape of the formula.
///
/// WHAT FANTOM REALLY IS
///   For the protocol's own token it is notional — a number that sets the
///   opening price. For a collateral-backed launch it is the vault's own
///   backing, which makes the curve's opening price equal to the vault's
///   redemption price exactly. Same arithmetic, except the reserve exists.
///   A holder then has two exits that meet at the same floor instead of two
///   prices that need reconciling.
///
/// DECIMALS
///   The quote is USDC with 6 decimals and the token has 18. No scaled price
///   appears anywhere in here: every quantity is a ratio of raw amounts.
///   `k` carries both scales at once and the divisions put them back, which
///   is why `(k * d) / (x * (x + d))` comes out in token units with no
///   conversion constant. Assuming a shared scale is what put 300,000,000
///   tokens somewhere nobody can reach.
contract Egri {
    IEgriToken public immutable token;
    IEgriToken public immutable quote;

    /// The notional quote reserve. Priced against, never held, never paid out.
    uint256 public immutable FANTOM;
    /// The notional token reserve, equal to what this contract was funded with.
    uint256 public immutable SANAL_TOKEN;
    /// Real quote that must arrive before permanent liquidity is committed.
    uint256 public immutable ESIK;
    /// FANTOM * SANAL_TOKEN. Constant for the life of the curve.
    uint256 public immutable K;

    /// Where the permanent pool gets opened once the curve has proven demand.
    IHavuzAcici public immutable havuzAcici;

    /* ---- the fee, and who it reaches ----------------------------------
     * 1% of every trade, which is what pons charges — a number the market
     * has already accepted rather than one invented here. Taken in the
     * quote asset, never in tokens, so nobody is paid in something they
     * then have to sell.
     *
     * The founder slice is transferred at the moment of the trade, to an
     * address fixed at construction. There is no claim to call and no
     * accrual to forget about, and because the address is immutable it
     * cannot be redirected later by anyone, the founder included.
     *
     * The staker slice goes to the Stake contract, where it is credited
     * pro-rata. The remainder stays here and becomes depth in the
     * permanent pool at graduation — so the part nobody takes is the part
     * that makes the market better.
     */
    uint256 public constant UCRET_PPM = 10_000;     // 1.00%
    uint256 public constant KURUCU_PPM = 3_000;     // 0.30%
    uint256 public constant STAKE_PPM = 3_000;      // 0.30%
    // the remaining 0.40% stays, and becomes pool depth

    address public immutable kurucu;
    address public immutable stakeKasasi;

    /// Real quote collected. The only state the price depends on.
    uint256 public toplanan;
    /// Anti-snipe tax, held aside and added to the pool at graduation.
    uint256 public vergi;
    /// Set once, in `mezunEt`.
    bool public mezun;
    /// When the curve opened, for the snipe tax.
    uint64 public immutable acilis;

    /* ---- anti-snipe ---------------------------------------------------
     * A launch's first seconds are worth more to a bot than to anybody
     * else, so the first seconds are priced for bots. 99% of a buy, halving
     * four times a second, gone after five.
     *
     * The tax is NOT revenue. It is held aside and seeds the permanent pool
     * at graduation, so what a sniper pays ends up as depth for the people
     * who bought honestly. Paying it to ourselves would make the tax a
     * reason to want snipers.
     */
    uint256 public constant SNIPE_PPM = 990_000;
    /// Immutable rather than constant for one reason: block.timestamp cannot
    /// be moved inside an eth_call, so with a fixed five seconds no test
    /// could ever reach the untaxed path and the curve arithmetic would go
    /// unchecked. Governor carries its periods the same way, for the same
    /// reason. Production is 5.
    uint64 public immutable SNIPE_SURESI;

    event Alindi(address indexed alici, uint256 odenen, uint256 alinan, uint256 vergi);
    event UcretBolundu(uint256 kurucuya, uint256 stakeye, uint256 havuzaKalan);
    event Satildi(address indexed satici, uint256 verilen, uint256 alinan);
    event Mezun(uint256 havuzQuote, uint256 havuzToken, uint256 yakilan);

    error Sifir();
    error ZatenMezun();
    error HenuzDegil();
    error Kayma();
    error TransferOlmadi();
    error KotuKurulum();

    constructor(
        IEgriToken _token,
        IEgriToken _quote,
        uint256 _fantom,
        uint256 _sanalToken,
        uint256 _esik,
        IHavuzAcici _havuzAcici,
        uint64 _snipeSuresi,
        address _kurucu,
        address _stakeKasasi
    ) {
        if (_fantom == 0 || _sanalToken == 0 || _esik == 0) revert KotuKurulum();
        if (address(_havuzAcici) == address(0)) revert KotuKurulum();
        if (_kurucu == address(0) || _stakeKasasi == address(0)) revert KotuKurulum();
        token = _token;
        quote = _quote;
        FANTOM = _fantom;
        SANAL_TOKEN = _sanalToken;
        ESIK = _esik;
        K = _fantom * _sanalToken;
        havuzAcici = _havuzAcici;
        SNIPE_SURESI = _snipeSuresi;
        kurucu = _kurucu;
        stakeKasasi = _stakeKasasi;
        acilis = uint64(block.timestamp);
    }

    /// The quote side of the curve right now.
    function x() public view returns (uint256) {
        return FANTOM + toplanan;
    }

    /// The token side, derived rather than stored.
    function y() public view returns (uint256) {
        return K / x();
    }

    /// Tokens this curve has handed out, net of any sold back.
    function satilan() public view returns (uint256) {
        uint256 kalan = y();
        return SANAL_TOKEN > kalan ? SANAL_TOKEN - kalan : 0;
    }

    /// What one buy of `d` would receive, before tax. Pure arithmetic:
    /// k/x - k/(x+d), rearranged so one division does the work and the
    /// result rounds down — against the buyer, in the curve's favour.
    function alimKotasi(uint256 d) public view returns (uint256) {
        if (d == 0) return 0;
        uint256 xi = x();
        return (K * d) / (xi * (xi + d));
    }

    /// What selling `tokenIn` would return. x' = k*x / (k + tokenIn*x),
    /// rounded UP so the payout rounds down.
    function satisKotasi(uint256 tokenIn) public view returns (uint256) {
        if (tokenIn == 0) return 0;
        uint256 xi = x();
        uint256 bol = K + tokenIn * xi;
        uint256 pay = K * xi;
        uint256 xs = (pay + bol - 1) / bol;         // ceil
        if (xs < FANTOM) xs = FANTOM;               // the notional part never leaves
        return xi - xs;
    }

    /// The snipe tax, in ppm, `gecen` seconds after the curve opened.
    function snipeOrani(uint256 gecen) public view returns (uint256) {
        if (gecen >= SNIPE_SURESI) return 0;
        return SNIPE_PPM >> (2 * gecen);
    }

    /// Take the fee out of a quote amount and send the two slices that
    /// leave. Returns the total fee and the part that stays here.
    function _ucret(uint256 quoteMiktari) internal returns (uint256 toplamUcret, uint256 kalan) {
        toplamUcret = (quoteMiktari * UCRET_PPM) / 1_000_000;
        if (toplamUcret == 0) return (0, 0);
        uint256 k = (quoteMiktari * KURUCU_PPM) / 1_000_000;
        uint256 st = (quoteMiktari * STAKE_PPM) / 1_000_000;
        kalan = toplamUcret - k - st;
        if (k > 0 && !quote.transfer(kurucu, k)) revert TransferOlmadi();
        if (st > 0 && !quote.transfer(stakeKasasi, st)) revert TransferOlmadi();
        emit UcretBolundu(k, st, kalan);
    }

    /// Buy on the curve.
    function al(uint256 quoteIn, uint256 enAz) external returns (uint256 alinan) {
        if (mezun) revert ZatenMezun();
        if (quoteIn == 0) revert Sifir();

        if (!quote.transferFrom(msg.sender, address(this), quoteIn)) revert TransferOlmadi();

        /* The tax comes off before the curve sees the money, so it does not
           move the price — it only reduces what this buyer receives. */
        uint256 oran = snipeOrani(block.timestamp - acilis);
        uint256 kesilen = (quoteIn * oran) / 1_000_000;
        uint256 net = quoteIn - kesilen;
        if (net == 0) revert Sifir();

        (uint256 ucret, uint256 ucretKalan) = _ucret(net);
        net -= ucret;
        if (net == 0) revert Sifir();

        alinan = alimKotasi(net);
        if (alinan == 0) revert Sifir();
        if (alinan < enAz) revert Kayma();

        toplanan += net;
        vergi += kesilen + ucretKalan;

        if (!token.transfer(msg.sender, alinan)) revert TransferOlmadi();
        emit Alindi(msg.sender, quoteIn, alinan, kesilen);
    }

    /// Sell back to the curve. Available from the first block, in both
    /// directions — a curve that only buys is not a market.
    function sat(uint256 tokenIn, uint256 enAz) external returns (uint256 alinan) {
        if (mezun) revert ZatenMezun();
        if (tokenIn == 0) revert Sifir();

        alinan = satisKotasi(tokenIn);
        if (alinan == 0) revert Sifir();
        if (alinan < enAz) revert Kayma();
        /* Cannot exceed what was collected: x never falls below FANTOM, so
           this holds by construction. Asserted anyway, because a wrong
           rounding direction here would pay out money that is not there. */
        if (alinan > toplanan) revert TransferOlmadi();

        if (!token.transferFrom(msg.sender, address(this), tokenIn)) revert TransferOlmadi();
        /* The curve releases the full quote; the seller receives it less
           the fee, and the slices that leave are paid out of what was just
           released. toplanan falls by the full amount either way, so the
           contract still never owes more than it holds. */
        toplanan -= alinan;
        (uint256 ucret, uint256 ucretKalan) = _ucret(alinan);
        vergi += ucretKalan;
        uint256 odenecek = alinan - ucret;
        if (odenecek == 0) revert Sifir();
        if (!quote.transfer(msg.sender, odenecek)) revert TransferOlmadi();
        emit Satildi(msg.sender, tokenIn, odenecek);
        alinan = odenecek;
    }

    /// Close the curve and commit permanent liquidity.
    ///
    /// Open to anyone once the threshold is met: a graduation that waits on
    /// somebody's goodwill is a graduation that can be withheld.
    ///
    /// The pool opens at the price the curve finished at, not below it. That
    /// takes seeding only as many tokens as the collected quote supports at
    /// that price and burning the remainder. Both pump.fun and pons skip
    /// this and their pools open below the curve's last trade — by exactly
    /// the reserved slice's share, which is a drop every curve buyer eats.
    ///
    /// The burned tokens were never sold, so nobody's holdings pay for it,
    /// and supply falls for good — which raises the share of everyone who
    /// did buy.
    function mezunEt() external {
        if (mezun) revert ZatenMezun();
        if (toplanan < ESIK) revert HenuzDegil();
        mezun = true;

        uint256 kalanToken = token.balanceOf(address(this));
        uint256 havuzQuote = toplanan + vergi;

        /* Closing price is x/y = (FANTOM + toplanan) / kalanToken, so the
           tokens that `havuzQuote` supports at that price are
           havuzQuote * kalanToken / (FANTOM + toplanan). */
        uint256 havuzToken = (havuzQuote * kalanToken) / x();
        if (havuzToken > kalanToken) havuzToken = kalanToken;
        uint256 yakilan = kalanToken - havuzToken;

        toplanan = 0;
        vergi = 0;

        if (yakilan > 0) token.burn(yakilan);
        if (!quote.transfer(address(havuzAcici), havuzQuote)) revert TransferOlmadi();
        if (!token.transfer(address(havuzAcici), havuzToken)) revert TransferOlmadi();
        havuzAcici.ac(havuzQuote, havuzToken);

        emit Mezun(havuzQuote, havuzToken, yakilan);
    }
}
