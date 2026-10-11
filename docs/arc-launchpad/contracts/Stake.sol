// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IStakeToken {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title Stake — voting rights, and two kinds of reward.
/// @notice Stake any amount to earn. Voting needs 50,000.
///
/// TWO REWARDS, FROM TWO DIFFERENT PLACES
///   USDC, out of the protocol's fee income, which exists only if the
///   protocol earns. And DEPTH, out of a fixed 400,000,000 released over
///   thirty years with a ten-year half-life — a pool that empties and is
///   never topped up, because there is no mint anywhere in this system.
///
/// WHY THE REWARD IS REVENUE AND NOT EMISSION
///   The token this replaces paid 600,000,000 — 60% of everything — on a
///   30-year clock, whether the protocol earned anything or not. About
///   123,000,000 in the first year against roughly 90,000,000 liquid. It
///   could not be undone afterwards, because the contract holding the
///   emission could not be replaced, and it is the single reason that token
///   was not worth holding.
///
///   So there is no emission here and no mint anywhere in this system. The
///   reward is the protocol's own fee income, in USDC, divided among
///   stakers in proportion to what they staked. If the protocol earns
///   nothing, stakers earn nothing — which is honest, and cannot dilute
///   anybody.
///
/// TWO SEPARATE QUESTIONS
///   Earning and deciding are not the same thing. Any amount may be staked
///   and earns from the first dollar. A vote needs `MIN_OY_GUCU`, because
///   both the proposal threshold and the quorum are shares of total staked
///   and without a floor one wei would be the whole electorate while
///   nobody else had staked.
///
/// VOTES CANNOT BE RENTED
///   Voting power is read from a checkpoint taken when a proposal opens,
///   not at the moment of voting. Stake arriving after a proposal exists
///   carries no weight on it, so there is nothing to rent and nobody has
///   to be watching. The previous design could only patch this after the
///   fact, with a function anyone had to remember to call, because
///   checkpoints have to live in the staking contract and that one could
///   not be replaced.
///
/// NO OWNER
///   No admin, no sweep, no upgrade, no pause. `stake`, `unstake`, `claim`
///   and `dagit` are the whole surface, and the first three answer only to
///   whoever is calling them.
contract Stake {
    IStakeToken public immutable token;
    IStakeToken public immutable quote;

    /// The least stake that carries a vote. Earning has no minimum at all.
    /// Constant and unsettable: a floor governance could lower is not one.
    uint256 public constant MIN_OY_GUCU = 50_000 ether;

    uint256 private constant OLCEK = 1e30;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedOf;

    /* ---- the token emission ------------------------------------------
     * 400,000,000 released to stakers over thirty years, halving every
     * ten: 0.1332% of whatever is left, each week.
     *
     * ALP's emission had this exact shape with a three-year half-life,
     * which is why its first year released 123,000,000 against roughly
     * 90,000,000 circulating. Ten years puts the first year at about
     * 26,800,000 against a 383,000,000 float. The total was never the
     * problem.
     *
     * No separate balance is tracked: what this contract holds beyond what
     * stakers deposited IS the emission, so the two can never drift apart.
     */
    uint256 public constant PERIYOT = 7 days;
    /// 0.1332% a week is a ten-year half-life: (1 - 0.001332)^520 = 0.5.
    uint256 public constant SALIM_PPM = 1_332;
    /// About three years of weeks in one call, so a long gap cannot run out
    /// of gas and strand the schedule.
    uint256 public constant MAX_TOPLAMA = 160;

    uint256 public immutable baslangic;
    uint256 public emisyonKalan;
    uint256 public emisyonDagitilan;
    uint256 public islenenPeriyot;

    /// Accumulated reward per staked token, scaled by OLCEK. Separate
    /// accumulators, because one is USDC and the other is the token.
    uint256 public accPerShare;
    uint256 public accPerShareToken;
    mapping(address => uint256) public markerToken;
    mapping(address => uint256) public tokenAlinan;
    mapping(address => uint256) public marker;
    mapping(address => uint256) public claimedOf;
    /// Reward credited but not yet taken out, so unaccounted balance can be
    /// told apart from somebody's unclaimed share.
    uint256 public borclu;

    /// Balance history, for proposal snapshots.
    struct Nokta {
        uint256 blok;
        uint256 miktar;
    }
    mapping(address => Nokta[]) private gecmis;
    Nokta[] private toplamGecmis;

    event Staked(address indexed who, uint256 miktar);
    event Unstaked(address indexed who, uint256 miktar);
    event Claimed(address indexed who, uint256 miktar);
    event Dagitildi(uint256 miktar, uint256 toplamStake);

    error Sifir();
    error Yetersiz();
    error TransferOlmadi();
    error HenuzStakeYok();
    error Gelecek();

    event EmisyonSalindi(uint256 miktar, uint256 periyot, uint256 kalan);
    event TokenAlindi(address indexed who, uint256 miktar);

    /// `_baslangic` of zero means now. It is a parameter for the same
    /// reason Vesting takes one: block.timestamp does not move inside an
    /// eth_call, so a test can only reach week 52 of the schedule by
    /// starting the clock in the past. Production passes zero.
    constructor(IStakeToken _token, IStakeToken _quote, uint256 _emisyon, uint256 _baslangic) {
        token = _token;
        quote = _quote;
        emisyonKalan = _emisyon;
        baslangic = _baslangic == 0 ? block.timestamp : _baslangic;
    }

    function periyotGecti() public view returns (uint256) {
        return (block.timestamp - baslangic) / PERIYOT;
    }

    /// Release the weeks that have passed. Open to anyone, and called by
    /// every stake, unstake and claim, so nobody has to remember.
    ///
    /// When nothing is staked the clock still advances and the tokens stay
    /// in the pool. ALP returned early without advancing it, which let a
    /// backlog build until the first staker's next call swept the lot —
    /// a fix for one bug that created its own mirror image.
    function salim() public returns (uint256 miktar) {
        uint256 gecen = periyotGecti();
        if (gecen <= islenenPeriyot) return 0;
        uint256 adet = gecen - islenenPeriyot;
        if (adet > MAX_TOPLAMA) adet = MAX_TOPLAMA;

        if (totalStaked == 0) {
            /* Nobody to pay. Move the clock, keep the tokens: the schedule
               slides instead of saving up a windfall. */
            islenenPeriyot += adet;
            return 0;
        }

        uint256 kalan = emisyonKalan;
        for (uint256 i; i < adet; ++i) {
            uint256 dilim = (kalan * SALIM_PPM) / 1_000_000;
            if (dilim == 0) break;
            kalan -= dilim;
            miktar += dilim;
        }
        islenenPeriyot += adet;
        if (miktar == 0) return 0;

        emisyonKalan = kalan;
        emisyonDagitilan += miktar;
        accPerShareToken += (miktar * OLCEK) / totalStaked;
        emit EmisyonSalindi(miktar, islenenPeriyot, kalan);
    }

    /// What the schedule would release over `adet` weeks from where the
    /// pool stands now, without the per-call catch-up cap and without
    /// touching anything.
    ///
    /// Two reasons it exists. A half-life is a claim about specific points
    /// on a curve — week 52, week 520, week 1560 — and the only way to
    /// check those in one call is to compute them. And an interface that
    /// wants to show somebody what they are signing up for needs the same
    /// answer.
    function planOnizle(uint256 adet) public view returns (uint256 salinan, uint256 kalan) {
        kalan = emisyonKalan;
        for (uint256 i; i < adet; ++i) {
            uint256 dilim = (kalan * SALIM_PPM) / 1_000_000;
            if (dilim == 0) break;
            kalan -= dilim;
            salinan += dilim;
        }
    }

    /// Token reward owed, which is a different question from the USDC one.
    function pendingToken(address who) public view returns (uint256) {
        return (stakedOf[who] * (accPerShareToken - markerToken[who])) / OLCEK;
    }

    /* ---- rewards ---------------------------------------------------- */

    /// USDC sitting here that has not been credited to anyone yet.
    ///
    /// The fee source just transfers; nothing has to call into this
    /// contract, and nothing can forget to. Whatever arrived is the
    /// difference between the balance and what is already owed.
    function bekleyen() public view returns (uint256) {
        uint256 b = quote.balanceOf(address(this));
        return b > borclu ? b - borclu : 0;
    }

    /// Credit whatever has arrived to the current stakers. Open to anyone:
    /// a distribution that waits on somebody's goodwill can be withheld.
    ///
    /// Fees that arrive while nothing is staked simply wait here until
    /// somebody stakes, and then go to whoever is staked at that moment.
    /// That is a real and deliberate edge: it is bounded by the fee income
    /// earned before the first staker exists, and the alternative — paying
    /// it to nobody — would mean burning the protocol's own revenue.
    function dagit() public returns (uint256 miktar) {
        miktar = bekleyen();
        if (miktar == 0) return 0;
        if (totalStaked == 0) return 0;
        accPerShare += (miktar * OLCEK) / totalStaked;
        borclu += miktar;
        emit Dagitildi(miktar, totalStaked);
    }

    function pending(address who) public view returns (uint256) {
        return (stakedOf[who] * (accPerShare - marker[who])) / OLCEK;
    }

    function claim() external returns (uint256 odenen) {
        dagit();
        salim();
        odenen = _kapat(msg.sender);
    }

    function _kapat(address who) internal returns (uint256 odenen) {
        odenen = pending(who);
        marker[who] = accPerShare;
        if (odenen > 0) {
            claimedOf[who] += odenen;
            borclu -= odenen;
            if (!quote.transfer(who, odenen)) revert TransferOlmadi();
            emit Claimed(who, odenen);
        }
        uint256 tok = pendingToken(who);
        markerToken[who] = accPerShareToken;
        if (tok > 0) {
            tokenAlinan[who] += tok;
            if (!token.transfer(who, tok)) revert TransferOlmadi();
            emit TokenAlindi(who, tok);
        }
    }

    /* ---- stake ------------------------------------------------------ */

    /// No minimum. One wei earns, in proportion.
    function stake(uint256 miktar) external {
        if (miktar == 0) revert Sifir();
        dagit();
        salim();
        _kapat(msg.sender);
        if (!token.transferFrom(msg.sender, address(this), miktar)) revert TransferOlmadi();
        stakedOf[msg.sender] += miktar;
        totalStaked += miktar;
        _yaz(msg.sender);
        emit Staked(msg.sender, miktar);
    }

    /// No lock and no penalty. Leaving costs only the votes on proposals
    /// that have not yet been snapshotted.
    function unstake(uint256 miktar) external {
        if (miktar == 0) revert Sifir();
        if (stakedOf[msg.sender] < miktar) revert Yetersiz();
        dagit();
        salim();
        _kapat(msg.sender);
        stakedOf[msg.sender] -= miktar;
        totalStaked -= miktar;
        _yaz(msg.sender);
        /* The emission pool lives in this same balance, so a withdrawal has
           to be covered by deposits rather than by it. stakedOf is the only
           claim anybody has on the deposited side. */
        if (!token.transfer(msg.sender, miktar)) revert TransferOlmadi();
        emit Unstaked(msg.sender, miktar);
    }

    /* ---- voting ----------------------------------------------------- */

    /// What this address could vote with right now. Zero under the floor —
    /// the stake still earns, it just does not decide.
    function oyGucu(address who) public view returns (uint256) {
        uint256 s = stakedOf[who];
        return s >= MIN_OY_GUCU ? s : 0;
    }

    /// What this address could have voted with at `blok`. This is what a
    /// proposal reads, so stake that arrived after it opened is worth
    /// nothing on it.
    function oyGucuAt(address who, uint256 blok) external view returns (uint256) {
        if (blok > block.number) revert Gelecek();
        uint256 s = _ara(gecmis[who], blok);
        return s >= MIN_OY_GUCU ? s : 0;
    }

    /// Total staked at `blok`, for the quorum. Counts stake under the
    /// floor too: it is staked, it earns, and it is part of the whole the
    /// quorum is measured against.
    function toplamAt(uint256 blok) external view returns (uint256) {
        if (blok > block.number) revert Gelecek();
        return _ara(toplamGecmis, blok);
    }

    function _yaz(address who) internal {
        _ekle(gecmis[who], stakedOf[who]);
        _ekle(toplamGecmis, totalStaked);
    }

    function _ekle(Nokta[] storage d, uint256 miktar) internal {
        uint256 u = d.length;
        /* Several moves in one block collapse into one point, so a
           proposal opened in the same block cannot see a half-applied
           state. */
        if (u > 0 && d[u - 1].blok == block.number) d[u - 1].miktar = miktar;
        else d.push(Nokta({blok: block.number, miktar: miktar}));
    }

    function _ara(Nokta[] storage d, uint256 blok) internal view returns (uint256) {
        uint256 u = d.length;
        if (u == 0) return 0;
        if (d[0].blok > blok) return 0;
        if (d[u - 1].blok <= blok) return d[u - 1].miktar;
        uint256 lo = 0;
        uint256 hi = u - 1;
        while (lo < hi) {
            uint256 orta = (lo + hi + 1) / 2;
            if (d[orta].blok <= blok) lo = orta; else hi = orta - 1;
        }
        return d[lo].miktar;
    }

    function noktaSayisi(address who) external view returns (uint256) {
        return gecmis[who].length;
    }
}
