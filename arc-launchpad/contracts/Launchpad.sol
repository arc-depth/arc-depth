// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Vesting, IERC20V} from "./Vesting.sol";
import {TeminatKarnesi} from "./TeminatKarnesi.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";

import {LaunchToken} from "./LaunchToken.sol";
import {CollateralVault, IERC20, IBurnable} from "./CollateralVault.sol";
import {HolderRewards, IERC20Min, ILaunchToken} from "./HolderRewards.sol";

interface IApprove {
    function approve(address spender, uint256 value) external returns (bool);
}

/// @title Launchpad
/// @notice Turns a deposit of collateral into a finished, locked launch.
///
/// WHAT ONE CALL PRODUCES
///   - a fixed-supply token, all of it accounted for from the first block
///   - a vault holding COLLATERAL_BPS of the deposit, redeemable forever
///   - a v4 pool whose hook forbids liquidity removal
///   - liquidity concentrated in [floor, CEILING_MULTIPLE x floor]
///   - a position owned by this contract that can never be withdrawn
///
/// WHY THE RANGE IS NOT FULL-WIDTH
///   The price cannot go below the floor — anyone can buy there and redeem
///   for more — so liquidity spread beneath the floor would never trade. It
///   is capital doing nothing. Concentrating the same money into the band
///   where trading actually happens makes the pool roughly 2.4x deeper for
///   free, which is the difference between a 1,500 dollar launch being
///   usable and being a slippage trap.
///
/// WHY THE FOUNDER CANNOT RUG
///   They never hold the liquidity. The position is created by this contract,
///   and the hook reverts every removal, including ours. The founder's own
///   tokens are theirs to sell — but selling cannot take anything from other
///   holders, because the pool stays and the vault keeps paying out.
///
/// NOTHING HERE IS UPGRADEABLE AND NOTHING HAS AN OWNER.
contract Launchpad is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    /// Share of the deposit that becomes collateral. The rest becomes
    /// liquidity. Chosen at 60/40: below this the floor gets thin, above it
    /// the pool gets too shallow to trade and too little supply reaches the
    /// market.
    uint256 public constant COLLATERAL_BPS = 6000;

    /// Opening price as a multiple of the floor, and the top of the
    /// liquidity band.
    ///
    /// Swept against the real pool math rather than picked, twice. The
    /// first sweep balanced three things — a buyer's downside, slippage,
    /// and how much supply the founder keeps — and landed on 2x / 6x.
    ///
    /// That was wrong, and measuring the founder's side is what showed it.
    /// A founder cannot realise the paper value of their stake: selling
    /// pushes the price down the same band, so what they can actually get
    /// out is bounded by the collateral the band holds. At 2x / 6x that
    /// bound is +4% against a -57% worst case, and it does not improve
    /// however much buying arrives — the ceiling stops the price. The
    /// identical ceiling caps a buyer at 3x. Both sides were being offered
    /// a bet with no payoff.
    ///
    /// At 3x / 60x, per 100 units of deposit:
    ///
    ///                       2x / 6x        3x / 60x
    ///   founder keeps        51.9%          59.2%
    ///   founder worst        -57%           -48%
    ///   founder best          +4%          +251%
    ///   breaks even at        $94            $60
    ///   buyer worst          -50%           -67%
    ///   buyer best             3x            20x
    ///   slippage, 10% buy    15.2%          22.2%
    ///
    /// The two costs are real and are the reason this is a trade and not a
    /// free improvement: opening further above the floor means a buyer at
    /// the open has further to fall, and it thins the position, because the
    /// same collateral has to span a wider gap between the open and the
    /// floor. 67% is still a floor — a rug is 100% — and the headroom that
    /// buys is what makes the token worth holding.
    ///
    /// The ceiling is not a wall. As price approaches it holders take
    /// profit, and their selling puts tokens back into the pool.
    /* Where the market opens is no longer a multiple of anything. See
       `acilisMcap`. */

    /// No longer the top of the liquidity band — that runs to the end of
    /// the tick range so the price has nowhere it has to stop. Kept only as
    /// the reference multiple the interface quotes a launch's reach
    /// against.
    uint256 public constant CEILING_MULTIPLE = 60;

    /// The pool's share of supply. FIXED AT 40%.
    ///
    /// It used to be the founder's choice from 5% to 70%,
    /// and 5% was the problem: it let a launch open with 95% of supply
    /// sitting liquid above a market one twentieth its size. The depth a
    /// buyer meets and the overhang above them were both left to whoever
    /// launched.
    ///
    /// Fixing the share does not fix the market's size. 40% of supply is
    /// priced by the opening price, which comes from the deposit, so the
    /// pool's depth in dollars still scales with how much went in — which
    /// is the part that should vary.
    ///
    /// Kept as a range rather than a bare constant so the argument stays
    /// in the signature and a wrong value reverts loudly instead of being
    /// quietly ignored.
    uint256 public constant MIN_POOL_BPS = 4000;  // 40%
    uint256 public constant MAX_POOL_BPS = 4000;  // 40%

    /// How the founder's remaining 60% is paid: 70% at once, 30% on a
    /// schedule they cannot cancel, redirect or accelerate.
    ///
    /// All of it used to transfer out liquid inside the launch
    /// transaction. Together with the old 5% pool floor that let a founder
    /// hold 95% of supply and sell it into whatever buyers deposited — the
    /// one rug vector this architecture had not closed.
    uint256 public constant FOUNDER_FREE_BPS = 7000;  // 70% of the founder's share
    uint256 public constant FOUNDER_VEST_BPS = 3000;  // 30%, vested

    uint256 public constant SUPPLY = 1_000_000_000 ether;
    /// There is deliberately no deposit range here.
    ///
    /// It used to be 100–1500, which is a sentence about dollars
    /// written in units of the collateral token. That is only the same
    /// thing while the collateral is worth about a dollar, and the
    /// collateral this product exists for is a tokenized share: at $242
    /// a share, a customer's $100 is 0.41 of one and the check rejected
    /// it for being under a hundred.
    ///
    /// The range lives in LaunchQueue, in USDC, where the customer
    /// actually pays. What is left here is the only limit this contract
    /// can state without knowing what the collateral is worth: there
    /// has to be some.
    /// Fee on the deposit, charged once, split in the house proportions
    /// (30% holders / 30% outside developers / 40% protocol). This is the
    /// only part of a deposit that does not stay the depositor's.
    uint256 public constant LAUNCH_FEE_PPM = 20000;      // 2.00%, quote collateral
    /// A launch whose collateral is not the quote asset needs its sell-side
    /// fee converted for the rest of its life — a price read and a spread
    /// to whoever does the converting, on every sweep, forever. That is a
    /// real cost and it is charged to the launch that creates it rather
    /// than spread over the ones that do not.
    uint256 public constant LAUNCH_FEE_PPM_DIGER = 30000; // 3.00%, anything else

    /// Which of the two applies to this collateral.
    function ucretPpm(address collateralToken) public view returns (uint256) {
        return collateralToken == address(quote) ? LAUNCH_FEE_PPM : LAUNCH_FEE_PPM_DIGER;
    }

    uint24 public constant POOL_FEE = 0; // all fees are taken by the hook
    int24 public constant TICK_SPACING = 60;

    IPoolManager public immutable poolManager;
    IHooks public immutable hook;
    uint64 public immutable holdPeriod;

    /// What every launch pool is priced in, and what holders are paid in.
    ///
    /// Not a per-launch argument: a launchpad whose pools are quoted in
    /// different currencies is a launchpad with no common price, and an
    /// argument is one more thing a caller can get wrong. One money, named
    /// once, at deployment.
    ///
    /// It is deliberately NOT the collateral. The collateral is a wrapped
    /// share and belongs in the vault, where it backs the floor and carries
    /// the stock's price into it. Quoting the market in it as well meant a
    /// buyer had to find wNVDA before they could buy anything — and 0.0127
    /// wNVDA existed.
    IERC20 public immutable quote;

    /// Where the non-holder slices of every fee go. Fixed at deployment,
    /// so there is no address here that anybody can repoint later.
    /// How much of the launch fee reaches the floor. The rest is the
    /// protocol's, and there is no third destination.
    uint256 public constant FEE_TO_FLOOR_BPS = 6000;

    /// Declared and published so it can be checked that it receives
    /// nothing. It used to take 30% of every launch fee into a contract
    /// whose only exit was a vote nobody can call.
    address public immutable devSink;
    address public immutable protocolSink;

    /// The customer-facing queue, which charges the launch fee itself in
    /// USDC before it ever gets here. A launch arriving from it has
    /// already paid, and charging again would turn a stated 2% into
    /// 3.96% — which is what happened, and what the queue's own test
    /// caught.
    ///
    /// Set once and then frozen. It cannot be a constructor argument
    /// because the queue needs this contract's address and this contract
    /// needs the queue's, and both are deployed by the same account. The
    /// privilege it grants is narrow and worth naming: whoever deploys
    /// this picks one address that pays no launch fee, once, and can
    /// never change it or add another.
    address public queue;
    address private immutable queueSetter;


    struct Launch {
        address token;
        address vault;
        address rewards;
        address founder;
        uint256 collateral;
        uint256 liquidity;
    }

    Launch[] public launches;
    mapping(address => uint256) public launchIdOf; // token => index+1

    /// pool -> the three contracts that launch created. The hook serves every
    /// pool and cannot hold per-launch state of its own, so it reads these.
    mapping(PoolId => address) public rewardsOfPool;
    mapping(PoolId => address) public vaultOfPool;
    mapping(PoolId => address) public tokenOfPool;

    /// Where each launch locked the vested part of its founder share, so a
    /// buyer can read the schedule instead of taking our word for it.
    mapping(address => address) public founderVestingOf;

    /// The grader. Deployed by this contract so its launchpad is this
    /// address and nothing else can file a grade — a grade for a launch
    /// that never happened would be noise somebody could point at.
    TeminatKarnesi public immutable karne;

    event Launched(
        uint256 indexed id,
        address indexed token,
        address indexed founder,
        address vault,
        address rewards,
        uint256 collateral,
        uint256 liquidity
    );

    error DepositTooSmall();
    error CollateralMustBeQuote();
    error BadPoolShare();
    error NotQueueSetter();
    error QueueAlreadySet();
    error NotPoolManager();
    error TransferFailed();

    constructor(
        IPoolManager _poolManager,
        IHooks _hook,
        IERC20 _quote,
        uint64 _holdPeriod,
        address _devSink,
        address _protocolSink
    ) {
        poolManager = _poolManager;
        hook = _hook;
        quote = _quote;
        /* Deployed here so its launchpad is this address: nothing else
           can file a grade. */
        karne = new TeminatKarnesi(address(this), address(_quote));
        holdPeriod = _holdPeriod;
        devSink = _devSink;
        protocolSink = _protocolSink;
        queueSetter = msg.sender;
    }

    /// One-time, by the deployer. There is no way back and no second call.
    function setQueue(address q) external {
        if (msg.sender != queueSetter) revert NotQueueSetter();
        if (queue != address(0)) revert QueueAlreadySet();
        queue = q;
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    /// Everything a launch needs, in one transaction.
    ///
    /// `poolBps` is how much of the supply the founder commits to the
    /// locked pool. It is the only number here with a trade-off in it,
    /// and it belongs to the founder rather than to us:
    ///
    ///   every unit of collateral deposited, less the fee, goes to the
    ///   vault and backs the floor. The founder keeps every token that
    ///   does not go into the pool, and can burn those for their share
    ///   of the vault at any time. So of a deposit of 100, with a 2 fee
    ///   and 30% of supply committed, 68.60 is recoverable immediately
    ///   and the rest is working as a market that cannot be withdrawn.
    ///
    /// THE POOL COSTS THE FOUNDER NO COLLATERAL
    ///   Its liquidity sits entirely on the far side of the opening
    ///   price, so v4 asks for tokens and nothing else. Measured against
    ///   the real Arc PoolManager in both currency orderings: collateral
    ///   demanded, zero. That is what makes the deposit recoverable at
    ///   all — the first version of this function spent 40% of it on
    ///   liquidity, which no one can ever take back out.
    ///
    ///   Buying happens in the pool, in USDC, above the floor. Selling
    ///   happens either in the pool, for USDC, or at the vault, at the
    ///   floor, in collateral — and the vault is always open. Once the
    ///   price has risen the pool holds USDC below it too, so it becomes a
    ///   bid of its own.
    ///
    /// `quoteValue` is what the customer paid for this collateral. It is
    /// the only number here that nobody chose, which is exactly why the
    /// market opens at it: the pool starts at the collateral's own value
    /// over the supply — the floor — and every price after that is settled
    /// by trading.
    ///
    /// No oracle. The queue knows the figure because the customer handed it
    /// over half a minute earlier.
    function launch(
        string calldata name,
        string calldata symbol,
        IERC20 collateralToken,
        uint256 deposit,
        uint256 quoteValue,
        uint256 poolBps
    ) external returns (address token, address vault, address rewards) {
        if (deposit == 0) revert DepositTooSmall();
        if (quoteValue == 0) revert DepositTooSmall();
        if (poolBps < MIN_POOL_BPS || poolBps > MAX_POOL_BPS) revert BadPoolShare();

        /* FORMERLY: the collateral had to be the asset the pool quotes in.

           This was going to be an allowlist of four — USDC, cirBTC, EURC,
           WETH — so a founder could pick a floor that rises with an asset.
           It cannot be, and the reason is the fee design rather than a
           preference.

           On a sell the hook's fee arrives as the quote currency. It
           reaches the floor by being transferred into the vault, and the
           vault's backing() counts only its own collateral. With cirBTC
           collateral the dollars cannot enter: sweepFloor refuses them,
           correctly, and they sit in the hook forever. Every sale would
           quietly strand its fee.

           Two ways out, neither built: swap the dollars to the collateral
           inside sweepFloor (one Arc pool, same chain, but a predictable
           forced swap is free money for searchers), or let anyone deliver
           the collateral and take the dollars at an on-chain price. Both
           are real designs; neither is tested, so neither ships.

           One of them is built now — ArcLaunchHook.tabanaDonustur, where
           whoever delivers the collateral takes the money and keeps a 2%
           spread — so the fee has a route whatever the collateral is and
           the restriction is gone. What remains of it is the price: a
           launch whose collateral is not the quote carries that conversion
           for life, so it pays a higher launch fee. See ucretPpm.

           The collateral is not checked against a list. It is GRADED, and
           the grade is filed next to the launch. See TeminatKarnesi for
           why a list cannot be written honestly. */

        if (!collateralToken.transferFrom(msg.sender, address(this), deposit)) revert TransferFailed();

        // Nothing for a launch that already paid upstream.
        uint256 fee = msg.sender == queue
            ? 0
            : (deposit * ucretPpm(address(collateralToken))) / 1_000_000;
        uint256 net = deposit - fee;

        LaunchToken t = new LaunchToken(name, symbol, SUPPLY, address(this));
        CollateralVault v = new CollateralVault(collateralToken, IBurnable(address(t)));
        /* Paid in the quote currency, not the collateral. The queue
           already sent this contract's holder slice in USDC, and a rewards
           contract denominated in wrapped shares could never have paid it
           out. A holder reward nobody can claim is not a reward. */
        HolderRewards r = new HolderRewards(
            IERC20Min(address(quote)), ILaunchToken(address(t)), address(poolManager), holdPeriod
        );

        // Every unit of it. The vault is the only place customer money
        // goes, and the only place it can come back from.
        if (!collateralToken.transfer(address(v), net)) revert TransferFailed();
        _payFee(collateralToken, address(v), fee);

        uint256 poolTokens = (SUPPLY * poolBps) / 10000;

        /* The market opens at what actually reached the vault, which is
           what the floor is measured against. Opening at the gross would
           price it above its own backing by the fee. */
        uint256 quoteNet = fee == 0 ? quoteValue : (quoteValue * net) / deposit;

        pendingVault = address(v);
        pendingRewards = address(r);
        _openPool(t, quoteNet, poolTokens);
        pendingVault = address(0);
        pendingRewards = address(0);

        /* Whatever the pool did not take belongs to the founder and is
           their claim on the vault — but it does not all leave at once.
           70% transfers now; 30% goes into a Vesting contract with the
           founder as an immutable beneficiary.

           The vesting contract has no cancel, no clawback, no way to
           change the beneficiary and no owner, so this is not custody of
           the founder's tokens by us — nobody can take them, including
           us. It only decides when they arrive.

           The point is what a buyer can check before buying: how much of
           supply could be sold into them today. Without this the answer
           was all of it. */
        uint256 kalan = t.balanceOf(address(this));
        address kilit;
        if (kalan > 0) {
            uint256 vestlenecek = (kalan * FOUNDER_VEST_BPS) / 10000;
            uint256 serbest = kalan - vestlenecek;
            if (vestlenecek > 0) {
                Vesting kv = new Vesting(IERC20V(address(t)), msg.sender, vestlenecek, 0);
                kilit = address(kv);
                if (!t.transfer(kilit, vestlenecek)) revert TransferFailed();
            }
            if (serbest > 0 && !t.transfer(msg.sender, serbest)) revert TransferFailed();
        }
        founderVestingOf[address(t)] = kilit;

        /* Measured once, here, and never editable. What a buyer needs is
           what was true when the launch was made — not what the collateral
           looks like after somebody has had time to tidy it. */
        karne.yaz(address(t), address(collateralToken));

        launches.push(Launch(address(t), address(v), address(r), msg.sender, net, poolTokens));
        launchIdOf[address(t)] = launches.length;

        emit Launched(launches.length - 1, address(t), msg.sender, address(v), address(r), net, poolTokens);
        return (address(t), address(v), address(r));
    }

    /// The launch fee, split in the house proportions: 30% to holders, 30%
    /// to the outside-developer pool, 40% to the protocol.
    ///
    /// This fee arrives as collateral, and holders are paid in USDC, so the
    /// holder slice goes to the VAULT instead of to the rewards contract.
    /// It reaches the same people by the only route that works in that
    /// currency: more collateral behind the same supply is a higher floor
    /// for every holder, permanently, and it cannot be claimed early or
    /// missed.
    ///
    /// A queued launch pays nothing here — the queue took the fee in USDC
    /// and paid the holder slice in USDC — so this runs only for a founder
    /// who came straight to this contract with collateral in hand.
    /// SIXTY PER CENT TO THE FLOOR, FORTY TO THE PROTOCOL.
    ///
    /// This used to be a three-way split: 30% floor, 30% to an outside
    /// developer pool, 40% protocol. The developer slice was stranded, not
    /// spent. DevPool.pay requires msg.sender == governor, that governor
    /// votes with a token that was abandoned, and nothing is staked — so
    /// nothing can ever be proposed and nothing can ever come out. Thirty
    /// per cent of every launch fee was being burned into a contract
    /// nobody can open, which is worse than either paying it out or not
    /// charging it.
    ///
    /// The protocol's 40% is unchanged, because the protocol has to earn
    /// something and this is the right place for it: revenue from the
    /// launch fee rather than from trading. A protocol paid out of its own
    /// pools' swaps is a protocol with a reason to want churn.
    ///
    /// The other 60% goes where the trading fee goes, and for the same
    /// reason — more collateral behind the same supply is a higher floor
    /// for every holder, permanently, and it cannot be claimed early or
    /// missed. devSink stays declared and published so anyone can check
    /// that it receives nothing.
    function _payFee(IERC20 collateralToken, address vaultAddr, uint256 fee) internal {
        if (fee == 0) return;
        uint256 h = (fee * FEE_TO_FLOOR_BPS) / 10000;
        uint256 p = fee - h; // the protocol absorbs the rounding dust
        if (h > 0 && !collateralToken.transfer(vaultAddr, h)) revert TransferFailed();
        if (p > 0 && !collateralToken.transfer(protocolSink, p)) revert TransferFailed();
    }

    /// What a deposit and a pool share would produce, without sending
    /// anything. The interface quotes from this rather than from a copy
    /// of the arithmetic that can drift out of step with the contract.
    function quoteLaunch(uint256 deposit, uint256 poolBps)
        external
        pure
        returns (
            uint256 fee,
            uint256 toVault,
            uint256 floorPrice,
            uint256 openPrice,
            uint256 poolTokens,
            uint256 founderTokens,
            uint256 recoverable
        )
    {
        fee = (deposit * LAUNCH_FEE_PPM) / 1_000_000;
        /* The holder slice of this fee goes to the vault, not out of the
           door: see _payFee. So what backs the floor is the deposit less
           only the two slices that actually leave. */
        /* The same share _payFee sends, read from the same constant. It
           was written out as 3000 here and as 3000 there, which is two
           copies of one number: change one and the screen quotes a floor
           the launch will not produce. */
        toVault = deposit - fee + (fee * FEE_TO_FLOOR_BPS) / 10000;
        /* Same scale as CollateralVault.FLOOR_SCALE, and it has to stay
           the same: this is a quote for a number the vault will report
           later, and two scales for one figure is a quote that disagrees
           with reality. 1e18 truncated six-decimal collateral to a
           single digit. */
        floorPrice = (toVault * 1e36) / SUPPLY;
        /* The market opens at the floor, so there is one price here, not
           two. Quoted in collateral units like the floor it equals. */
        openPrice = floorPrice;
        poolTokens = (SUPPLY * poolBps) / 10000;
        founderTokens = SUPPLY - poolTokens;
        /* What the founder can redeem AT LAUNCH, which is no longer their
           whole share: 30% of it goes into a Vesting contract and cannot
           be burned until it unlocks. Quoting the full amount would
           promise them money a third of which is not theirs to take yet —
           the screen reads this number and a founder would plan against
           it. The locked part is still theirs and still recoverable, just
           later, which is what the lock is for. */
        uint256 serbestPay = (founderTokens * FOUNDER_FREE_BPS) / 10000;
        recoverable = (toVault * serbestPay) / SUPPLY;
    }

    // ------------------------------------------------------------ internals

    /// Set by launch() immediately before _openPool, consumed there. Transient
    /// by convention: holding them in storage avoids another stack slot in a
    /// function that is already at the limit.
    address private pendingVault;
    address private pendingRewards;

    struct OpenData {
        PoolKey key;
        bool tokenIsZero;
        uint256 poolTokens;
        int24 tickLower;
        int24 tickUpper;
        uint160 sqrtPriceX96;
    }

    /// Open the pool and place the founder's tokens in it, with no
    /// collateral at all.
    ///
    /// The band sits entirely on the far side of the opening price, which
    /// is what makes the position one-sided. Which side that is depends on
    /// the currency ordering and is the easiest thing here to get
    /// backwards: if the token is currency0 the pool price is
    /// collateral-per-token and rises with the tick, so the sell side is
    /// ABOVE the current tick; if the token is currency1 the price is
    /// inverted and the same band sits BELOW it. Getting it wrong would
    /// not fail loudly — it would quietly ask for collateral, which is
    /// precisely the money that has to stay recoverable.
    ///
    /// Both orderings are measured against the real PoolManager in
    /// scripts/olc-tekyonlu.js; collateral demanded is zero in each.
    function _openPool(LaunchToken t, uint256 quoteValue, uint256 poolTokens) internal {
        /* Every price here is a ratio of raw amounts: the whole supply is
           worth `acilisMcap` at the open, and the band runs from there up
           to sixty times that.

           Nothing is scaled by 1e18. The pool is eighteen decimals against
           six, so a scaled price would have to carry a conversion factor,
           and a conversion factor written down once is a conversion factor
           that can be written down wrong. */
        uint256 acilisPay = quoteValue;   // quote side
        uint256 acilisBol = SUPPLY;        // token side

        bool tokenIsZero = address(t) < address(quote);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(tokenIsZero ? address(t) : address(quote)),
            currency1: Currency.wrap(tokenIsZero ? address(quote) : address(t)),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: hook
        });

        /* v4's price is currency1 per currency0, so the ratio is taken one
           way round or the other depending on where the token sorted. */
        uint160 sqrtPriceX96 = tokenIsZero
            ? _sqrtRatioX96(acilisPay, acilisBol)
            : _sqrtRatioX96(acilisBol, acilisPay);
        poolManager.initialize(key, sqrtPriceX96);

        PoolId pid = key.toId();
        tokenOfPool[pid] = address(t);
        vaultOfPool[pid] = pendingVault;
        rewardsOfPool[pid] = pendingRewards;

        /* The band starts just past the opening price and runs to the end
           of the tick range. There is no ceiling: whatever anyone pays,
           there is always some token left to sell, so the price can keep
           rising and the chart never stops.

           The previous version stopped at sixty times the opening, which
           took about $3,500 of buying to exhaust — after which the pool held
           no tokens at all and nobody could buy at any price. Removing the
           top costs roughly 13% of the position's density, because for a
           token-only position the top enters the liquidity only as
           1/sqrt(Pb), and 1/sqrt(60) is 0.129. */
        int24 cur = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        int24 tickLower;
        int24 tickUpper;
        if (tokenIsZero) {
            tickLower = _snapUp(cur + 1);
            tickUpper = _snapDown(TickMath.MAX_TICK);
            if (tickUpper <= tickLower) tickUpper = tickLower + TICK_SPACING;
        } else {
            tickUpper = _snapDown(cur - 1);
            tickLower = _snapUp(TickMath.MIN_TICK);
            if (tickLower >= tickUpper) tickLower = tickUpper - TICK_SPACING;
        }

        poolManager.unlock(
            abi.encode(OpenData(key, tokenIsZero, poolTokens, tickLower, tickUpper, sqrtPriceX96))
        );
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        OpenData memory d = abi.decode(data, (OpenData));

        uint128 liq = _liquidityFor(d);

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            d.key,
            ModifyLiquidityParams({
                tickLower: d.tickLower,
                tickUpper: d.tickUpper,
                liquidityDelta: int256(uint256(liq)),
                salt: bytes32(0)
            }),
            ""
        );

        _pay(d.key.currency0, delta.amount0());
        _pay(d.key.currency1, delta.amount1());
        return "";
    }

    /// Settles whatever the pool is owed for the position just created.
    function _pay(Currency currency, int128 amount) internal {
        if (amount >= 0) return; // nothing owed
        uint256 owed = uint256(uint128(-amount));
        poolManager.sync(currency);
        IERC20(Currency.unwrap(currency)).transfer(address(poolManager), owed);
        poolManager.settle();
    }

    // ------------------------------------------------------------ math

    /// Largest liquidity both sides of the deposit can support in the chosen
    /// band. Takes the smaller of the two, so neither leg is overdrawn.
    ///
    /// FullMath.mulDiv is not decoration here. The first version multiplied
    /// before dividing and overflowed on the very first real launch: with a
    /// token priced around 1e-6 the amounts and the sqrt prices are both
    /// large, and amount0 * sqrtP * sqrtB reached ~3.7e78 against a uint256
    /// ceiling of 1.16e77. mulDiv carries the intermediate in 512 bits, which
    /// is exactly the case it exists for.
    /// Size the position from the TOKEN side.
    ///
    /// The first version sized it from the collateral side, because the
    /// deposit was what the position had to consume. Now the position
    /// consumes no collateral at all, and the quantity that is fixed is
    /// the number of tokens the founder chose to commit. So that is what
    /// the liquidity is derived from, by inverting the amount formula for
    /// a range that lies wholly on one side of the price.
    ///
    /// FullMath.mulDiv is not decoration. The naive product of a token
    /// amount and two Q96 square roots reaches about 3.7e78 against a
    /// uint256 ceiling of 1.16e77 — it overflowed in exactly this
    /// calculation once already. mulDiv carries the intermediate in 512
    /// bits.
    function _liquidityFor(OpenData memory d) internal pure returns (uint128) {
        uint160 sa = TickMath.getSqrtPriceAtTick(d.tickLower);
        uint160 sb = TickMath.getSqrtPriceAtTick(d.tickUpper);
        if (sb <= sa) return 0;

        uint256 l;
        if (d.tokenIsZero) {
            // token is currency0, band above the price:
            //   amount0 = L * (sb - sa) / (sa * sb) * Q96
            uint256 ara = FullMath.mulDiv(uint256(sa), uint256(sb), FixedPoint96.Q96);
            l = FullMath.mulDiv(d.poolTokens, ara, uint256(sb - sa));
        } else {
            // token is currency1, band below the price:
            //   amount1 = L * (sb - sa) / Q96
            l = FullMath.mulDiv(d.poolTokens, FixedPoint96.Q96, uint256(sb - sa));
        }

        if (l > type(uint128).max) l = type(uint128).max;
        return uint128(l);
    }

    /// sqrt(num/den) in Q64.96, from raw amounts.
    ///
    /// The shape matters. sqrt(num * 2^192 / den) is the obvious form and it
    /// overflows: with the token as currency1 and a minimum deposit, that
    /// numerator reaches about 6e84 against a uint256 ceiling of 1.16e77.
    /// Splitting the shift across the root keeps every intermediate under
    /// 1e56 for any input this contract accepts.
    ///
    ///   sqrt(num << 96) = sqrt(num) * 2^48, exactly
    ///   that << 96, over sqrt(den) * 2^48  =  sqrt(num/den) * 2^96
    function _sqrtRatioX96(uint256 num, uint256 den) internal pure returns (uint160) {
        uint256 a = _sqrt(num << 96);
        uint256 b = _sqrt(den << 96);
        if (b == 0) b = 1;
        uint256 v = (a << 96) / b;
        if (v < TickMath.MIN_SQRT_PRICE) v = TickMath.MIN_SQRT_PRICE;
        if (v > TickMath.MAX_SQRT_PRICE) v = TickMath.MAX_SQRT_PRICE;
        return uint160(v);
    }

    function _tickAtRatio(uint256 num, uint256 den) internal pure returns (int24) {
        return TickMath.getTickAtSqrtPrice(_sqrtRatioX96(num, den));
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
