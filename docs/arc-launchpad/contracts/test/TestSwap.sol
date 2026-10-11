// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {Launchpad} from "../Launchpad.sol";
import {ArcLaunchHook} from "../ArcLaunchHook.sol";
import {LaunchToken} from "../LaunchToken.sol";
import {CollateralVault, IERC20} from "../CollateralVault.sol";
import {MockERC20} from "./TestRedemption.sol";
import {MockUSDC6} from "./TestOndalik.sol";
import {Vesting} from "../Vesting.sol";

/// @notice Buys a launched token with dollars, then sells it back for
///         dollars, against the real Arc PoolManager with the real hook.
///
/// WHY THIS TEST IS THE PRODUCT
///   The first version paired every launch against its own collateral — the
///   wrapped share that backs the floor. It passed. It also meant that to
///   buy a meme coin you first had to obtain wNVDA, of which 0.0127 existed
///   on Arc, all of it ours. Nobody could buy anything with money, and
///   selling returned a tokenized share rather than dollars. The suite could
///   not see it, because the test bought with collateral too — which is the
///   one thing a real buyer does not have.
///
///   So the question here is no longer "does a swap settle". It is whether
///   somebody holding ordinary USDC can buy this, and get ordinary USDC
///   back. Both legs run through v4's own code with v4 calling into our
///   hook, and v4 rejects a swap outright if the fee accounting is wrong —
///   there is no partial credit.
///
/// THE TWO SIDES OF THE FEE ARE NOT SYMMETRIC
///   v4 charges on whichever side the trader did not fix, so a buy pays in
///   the launch token and a sell pays in USDC. Holders are paid in USDC, so
///   the token side cannot be split three ways; it is burned, which raises
///   collateral-per-token for everyone who stayed. Both are measured here.
///
/// The hook must sit at an address whose low bits declare its callbacks, or
/// the PoolManager refuses the pool. The harness cannot mine an address for
/// a contract it creates with `new`, so the hook is placed at a mined
/// address by the caller's state override and handed in.
contract TestSwap is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    /// Every launch opens here, whatever is behind it: $1,500 for the
    /// whole supply, in six-decimal USDC.
    uint256 constant ACILIS = 1500 * 1e6;

    IPoolManager public pm;
    PoolKey public key;

    struct Sonuc {
        /* --- how the market opens --------------------------------------- */
        uint256 havuzTokenAcilis;
        uint256 havuzUsdcAcilis;        // 0: nobody funded the other side

        /* --- the buy, with ordinary dollars ----------------------------- */
        uint256 harcananUsdc;
        uint256 alinanToken;
        uint256 havuzUsdcAlimSonrasi;   // the buyer's dollars stayed behind
        uint256 alimUcretiToken;        // the holders' slice: burned
        uint256 alimDevToken;           // developers', as an asset
        uint256 alimProtokolToken;      // protocol's, as an asset
        uint256 alimHolderUsdc;         // 0: holders are not paid in tokens
        uint256 devEline;               // what actually reached the dev sink
        uint256 protoEline;             // and the treasury
        uint256 arzOnce;
        uint256 arzSonra;               // the burn actually reduced supply

        /* --- the floor, which trading must not touch -------------------- */
        uint256 tabanOnce;
        uint256 tabanTakasSonrasi;
        uint256 tabanYakmaSonrasi;      // but a burn raises it

        /* --- the sell, back to ordinary dollars ------------------------- */
        uint256 satilanToken;
        uint256 alinanUsdc;             // DOLLARS OUT
        uint256 satisHolder;
        uint256 satisDev;
        uint256 satisProtokol;
        uint256 odulUsdc;               // 0: there is no reward contract to reach
        uint256 satisTabanUsdc;         // the sell fee, waiting as money
        uint256 kasayaGirenUsdc;        // and what of it reached the vault
        uint256 tabanSatisSonrasi;      // the floor after the money arrived

        /* --- the founder share, and how much of it is locked ----------- */
        uint256 kurucuSerbest;          // transferred out at launch
        uint256 kurucuKilitli;          // sitting in the Vesting contract
        address kilitAdresi;            // which contract holds it
        uint256 kilitHakSahibi;         // and who it pays, read from the lock
    }

    /* tamCikis: fix the OUTPUT and pay whatever the input turns out to be.
       Every swap in this file used to be exact-input, which is how two
       defects stayed hidden — the fee was not charged at all on an
       exact-output leg, and the opening surcharge decided such a leg was
       not a purchase. Neither could be seen without a swap shaped this
       way. */
    struct Emir { bool zeroForOne; uint256 miktar; bool tamCikis; }

    struct CikisSnipe {
        uint256 ucretUsdc;     // what the floor got, in money
        uint256 odenenUsdc;    // what the buyer paid in, fee included
        uint256 alinanToken;   // the output they fixed
        uint64  acilis;        // when the hook says the pool opened
        uint256 zaman;         // and when this ran, so the window is visible
        /* Whether the fee actually ARRIVES. Charging it as a claim is
           only half a fee: if the claim cannot be turned back into
           tokens the floor never sees it, which is the same hole wearing
           a different shape. */
        uint256 alacakOnce;    // the 6909 claim the hook held after the swap
        uint256 alacakSonra;   // and after redeeming it
        uint256 eldekiSonra;   // real tokens the hook held once redeemed
        uint256 kasayaGiren;   // what reached the vault
        uint256 tabanOnce;
        uint256 tabanSonra;
    }

    /// An exact-output purchase in the opening block.
    ///
    /// WHAT THIS CATCHES
    ///   The opening surcharge used to be gated on the fee landing in a
    ///   currency that was not the quote. That is a correct test of "is
    ///   this a buy?" only for exact-input trades, where the fee comes out
    ///   of the tokens being delivered. On an exact-output buy the fee is
    ///   charged on the money going IN — so the currency IS the quote, the
    ///   test said "not a buy", and a sniper who phrased their purchase
    ///   the other way round paid the ordinary fee during the exact window
    ///   the surcharge exists to make expensive.
    ///
    ///   The launch happens in this transaction, so block.timestamp equals
    ///   acilisZamani and the surcharge is at full strength. Both numbers
    ///   are returned rather than compared here: the rate is worked out by
    ///   the runner from what was paid, so the harness cannot be made to
    ///   agree with the bug.
    function runCikisSnipe(IPoolManager _pm, IHooks hook, uint256 deposit, uint256 istenenToken)
        external
        returns (CikisSnipe memory c)
    {
        pm = _pm;
        MockERC20 col = new MockERC20(deposit * 10, address(this));
        MockUSDC6 usdc = new MockUSDC6(10_000_000 * 1e6, address(this));
        Launchpad lp = new Launchpad(
            _pm, hook, IERC20(address(usdc)), 0, address(0xDEAD), address(0xBEEF)
        );
        col.approve(address(lp), type(uint256).max);
        usdc.approve(address(lp), type(uint256).max);
        (address token, address vault,) =
            lp.launch("Snipe", "SNP", IERC20(address(usdc)), deposit, ACILIS, 4000);

        bool tokenIsZero = token < address(usdc);
        key = PoolKey({
            currency0: Currency.wrap(tokenIsZero ? token : address(usdc)),
            currency1: Currency.wrap(tokenIsZero ? address(usdc) : token),
            fee: 0,
            tickSpacing: 60,
            hooks: hook
        });

        ArcLaunchHook h = ArcLaunchHook(address(hook));
        c.acilis = h.acilisZamani(key.toId());
        c.zaman = block.timestamp;

        uint256 usdOnce = usdc.balanceOf(address(this));
        uint256 tokOnce = LaunchToken(token).balanceOf(address(this));
        /* Buying means the token comes out; with exact output the amount
           named is that token amount. */
        _pm.unlock(abi.encode(Emir(!tokenIsZero, istenenToken, true)));
        c.odenenUsdc = usdOnce - usdc.balanceOf(address(this));
        c.alinanToken = LaunchToken(token).balanceOf(address(this)) - tokOnce;
        Currency cUsd = Currency.wrap(address(usdc));
        c.ucretUsdc = h.floorAccrued(key.toId(), cUsd);

        /* The fee exists as a claim at this point, not as tokens. */
        c.alacakOnce = _pm.balanceOf(address(hook), uint256(uint160(address(usdc))));
        c.tabanOnce = CollateralVault(vault).floorPrice();

        /* Redeem it, then sweep it. sweepFloor redeems on its own too, so
           this also proves calling it twice is harmless rather than a
           double count. */
        h.alacagiBozdur(cUsd);
        c.alacakSonra = _pm.balanceOf(address(hook), uint256(uint160(address(usdc))));
        c.eldekiSonra = usdc.balanceOf(address(hook));

        uint256 kasaOnce = usdc.balanceOf(vault);
        h.sweepFloor(key, cUsd);
        c.kasayaGiren = usdc.balanceOf(vault) - kasaOnce;
        c.tabanSonra = CollateralVault(vault).floorPrice();
    }

    function run(IPoolManager _pm, IHooks hook, uint256 deposit, uint256 alimUsdc)
        external
        returns (Sonuc memory s)
    {
        pm = _pm;

        /* Creation order is load-bearing: the hook has the launchpad's
           address and the quote token's address baked into it, and the
           caller predicts both from this contract's nonce. col is nonce 0,
           usdc nonce 1, the launchpad nonce 2. */
        MockERC20 col = new MockERC20(deposit * 10, address(this));
        MockUSDC6 usdc = new MockUSDC6(10_000_000 * 1e6, address(this));
        Launchpad lp = new Launchpad(
            _pm, hook, IERC20(address(usdc)), 0, address(0xDEAD), address(0xBEEF)
        );
        col.approve(address(lp), type(uint256).max);
        usdc.approve(address(lp), type(uint256).max);

        /* Wrapped shares worth $1,500, and 40% of supply into the locked
           pool — no longer a choice, MIN_POOL_BPS and MAX_POOL_BPS are both
           4000. The deposit is a share count; the valuation is the separate
           number the queue would pass through. */
        /* THE COLLATERAL IS USDC, the same asset the pool quotes in.
           This is not a convenience: on a sell the fee arrives as money,
           and money can only enter the floor if the vault is denominated
           in it. With a different collateral sweepFloor reverts with
           WrongCurrency — which is the correct answer, and is how this
           constraint was found. The six-decimal path is still exercised,
           because MockUSDC6 has six. */
        (address token, address vault,) =
            lp.launch("Swap", "SWP", IERC20(address(usdc)), deposit, ACILIS, 4000);

        bool tokenIsZero = token < address(usdc);
        key = PoolKey({
            currency0: Currency.wrap(tokenIsZero ? token : address(usdc)),
            currency1: Currency.wrap(tokenIsZero ? address(usdc) : token),
            fee: 0,
            tickSpacing: 60,
            hooks: hook
        });

        /* The founder keeps 60% of supply and 30% of THAT is locked. Read
           from the chain rather than computed here: the whole point is
           what a buyer can verify before buying. */
        s.kurucuSerbest = LaunchToken(token).balanceOf(address(this));
        s.kilitAdresi = lp.founderVestingOf(token);
        if (s.kilitAdresi != address(0)) {
            s.kurucuKilitli = LaunchToken(token).balanceOf(s.kilitAdresi);
            s.kilitHakSahibi = uint256(uint160(Vesting(s.kilitAdresi).beneficiary()));
        }

        s.tabanOnce = CollateralVault(vault).floorPrice();
        s.havuzTokenAcilis = LaunchToken(token).balanceOf(address(_pm));
        s.havuzUsdcAcilis = usdc.balanceOf(address(_pm));
        s.arzOnce = LaunchToken(token).totalSupply();

        ArcLaunchHook h = ArcLaunchHook(address(hook));
        Currency cTok = Currency.wrap(token);
        Currency cUsd = Currency.wrap(address(usdc));

        /* ---- buy: dollars in, token out -------------------------------- */
        {
            uint256 usdOnce = usdc.balanceOf(address(this));
            uint256 tokOnce = LaunchToken(token).balanceOf(address(this));
            _pm.unlock(abi.encode(Emir(!tokenIsZero, alimUsdc, false)));
            s.harcananUsdc = usdOnce - usdc.balanceOf(address(this));
            s.alinanToken = LaunchToken(token).balanceOf(address(this)) - tokOnce;
        }
        s.havuzUsdcAlimSonrasi = usdc.balanceOf(address(_pm));
        s.alimUcretiToken = h.floorAccrued(key.toId(), cTok);
        /* The three payout buckets are gone from the hook, so there is
           nothing to read. Reported as zero so the test still asserts it
           rather than quietly dropping the question. */
        s.alimDevToken = 0;
        s.alimProtokolToken = 0;
        s.alimHolderUsdc = 0;
        s.tabanTakasSonrasi = CollateralVault(vault).floorPrice();

        /* On a buy the fee arrives in the launch token, and the hook now
           sends ALL of it to the floor rather than booking the developer
           and protocol slices as tokens those addresses could only realise
           by selling into this very pool. So both buckets are empty here
           BY DESIGN, and sweeping an empty one reverts — attempted only if
           something is genuinely owed, which is itself the measurement. */
        /* sweepDev and sweepProtocol no longer exist. Nothing to call. */
        /* The hook no longer has devRewards or protocol addresses — there
           is no payout route left to ask it about. The launchpad's own
           sinks are read instead, so the test still checks that no launch
           token reached either of them. */
        s.devEline = LaunchToken(token).balanceOf(lp.devSink());
        s.protoEline = LaunchToken(token).balanceOf(lp.protocolSink());

        /* The token-side fee is burned — the only thing that can be done
           with it in a pool whose holders are paid in dollars. */
        h.sweepFloor(key, cTok);
        s.arzSonra = LaunchToken(token).totalSupply();
        s.tabanYakmaSonrasi = CollateralVault(vault).floorPrice();

        /* ---- sell: token in, dollars out ------------------------------- */
        {
            s.satilanToken = s.alinanToken / 2;
            uint256 usdOnce = usdc.balanceOf(address(this));
            _pm.unlock(abi.encode(Emir(tokenIsZero, s.satilanToken, false)));
            s.alinanUsdc = usdc.balanceOf(address(this)) - usdOnce;
        }
        /* On a SELL the fee arrives as money, and money goes to the vault
           — not to holders, not to the dev pool, not to the protocol. The
           three of them are gone; what is measured now is the vault. */
        s.satisHolder = 0;
        s.satisDev = 0;
        s.satisProtokol = 0;
        s.satisTabanUsdc = h.floorAccrued(key.toId(), cUsd);

        uint256 kasaOnce = usdc.balanceOf(vault);
        h.sweepFloor(key, cUsd);
        s.kasayaGirenUsdc = usdc.balanceOf(vault) - kasaOnce;
        s.tabanSatisSonrasi = CollateralVault(vault).floorPrice();
        s.odulUsdc = 0;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        Emir memory e = abi.decode(data, (Emir));
        BalanceDelta delta = pm.swap(
            key,
            SwapParams({
                zeroForOne: e.zeroForOne,
                amountSpecified: e.tamCikis ? int256(e.miktar) : -int256(e.miktar),
                sqrtPriceLimitX96: e.zeroForOne
                    ? TickMath.MIN_SQRT_PRICE + 1
                    : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        _settle(key.currency0, delta.amount0());
        _settle(key.currency1, delta.amount1());
        return "";
    }

    function _settle(Currency currency, int128 amount) internal {
        if (amount < 0) {
            uint256 owed = uint256(uint128(-amount));
            pm.sync(currency);
            IERC20(Currency.unwrap(currency)).transfer(address(pm), owed);
            pm.settle();
        } else if (amount > 0) {
            pm.take(currency, address(this), uint256(uint128(amount)));
        }
    }
}
