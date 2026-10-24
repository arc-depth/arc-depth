// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {AlpLocker, IERC20L} from "../AlpLocker.sol";
import {MockERC20} from "./TestRedemption.sol";
import {MockUSDC6} from "./TestOndalik.sol";

/// @notice The governance token's liquidity share, locked, against the real
///         Arc PoolManager.
///
/// WHAT IS ACTUALLY BEING CLAIMED
///   300,000,000 ALP goes into a pool, costs no USDC to open, can be bought
///   and sold, and can never be withdrawn by anyone including us. Three of
///   those four are measurable here; the fourth — that removal reverts — is
///   the hook's own rule and is covered against a stand-in PoolManager.
///
///   The one that would be embarrassing to get wrong is the cost. A
///   one-sided position is free only if the band sits on the side of the
///   price where the ALP lives, and which side that is depends on address
///   order. Backwards, the pool asks for USDC instead — the money this is
///   supposed not to need. So both orderings run, and the USDC the pool
///   took is read off the token contract rather than asserted.
///
/// AND THE PART THAT MAKES IT SELF-FUNDING
///   The pool opens with no USDC in it at all. `runAlim` buys ALP and then
///   reads what the PoolManager holds: the buyer's USDC stays there, as
///   locked as the ALP, and becomes the bid for whoever sells next. That is
///   the whole mechanism by which liquidity accumulates without anybody
///   funding it, so it is worth a measurement rather than a paragraph.
///
/// The hook is address(0) here, as in the other real-PoolManager tests. What
/// cannot be faked is whether v4 accepts the position and what it charges.
contract TestAlpKilit is IUnlockCallback {
    IPoolManager pm;
    address odul = address(0xA0D1);

    struct Sonuc {
        address kilit;
        bool alpSifirinci;
        int24 acilisTick;
        int24 altTick;
        int24 ustTick;
        uint256 konan;          // what kilitle() reported placing
        uint256 havuzAlp;       // ALP the PoolManager took
        uint256 havuzUsdc;      // USDC it took            <-- must be 0
        uint256 kilitAlpKalan;  // ALP left in the locker  <-- must be 0
        bool kilitlendi;
        bool ikinciRed;         // kilitle() cannot run twice
    }

    struct AlimSonuc {
        uint256 havuzUsdcOnce;  // USDC in the pool before anyone buys <-- 0
        uint256 havuzUsdcSonra; // and after one purchase              <-- >0
        uint256 alinanAlp;      // what the buyer got
        uint256 harcananUsdc;
        uint256 kilitBakiye;    // the locker's own USDC               <-- 0
    }

    struct Veri { PoolKey key; bool zeroForOne; uint256 miktar; }

    /// `alpIlk` forces the address ordering so both branches get covered
    /// rather than whichever one the mock deployments happened to give.
    ///
    /// ALP counts in eighteen decimals and the money in six, as deployed.
    /// The previous version used eighteen for both, which is why it could
    /// prove the position took no USDC while the price it took it at was a
    /// million times wrong.
    ///
    /// Two of each are made so that whichever pair of addresses sorts the
    /// requested way can be chosen; the mocks mint on construction and have
    /// no mint function.
    function _kur(bool alpIlk) internal returns (MockERC20 alp, MockUSDC6 usdc) {
        MockERC20 a1 = new MockERC20(2_000_000_000 ether, address(this));
        MockERC20 a2 = new MockERC20(2_000_000_000 ether, address(this));
        MockUSDC6 u1 = new MockUSDC6(10_000_000 * 1e6, address(this));
        MockUSDC6 u2 = new MockUSDC6(10_000_000 * 1e6, address(this));

        /* Pick the combination whose ordering matches what was asked. One of
           the four always does: the two ALP candidates and the two USDC
           candidates cannot all sort the same way. */
        if ((address(a1) < address(u1)) == alpIlk) { alp = a1; usdc = u1; }
        else if ((address(a1) < address(u2)) == alpIlk) { alp = a1; usdc = u2; }
        else if ((address(a2) < address(u1)) == alpIlk) { alp = a2; usdc = u1; }
        else { alp = a2; usdc = u2; }
        require((address(alp) < address(usdc)) == alpIlk, "siralama kurulamadi");
    }

    function _kilitle(MockERC20 alp, MockUSDC6 usdc) internal returns (AlpLocker l) {
        l = new AlpLocker(pm, IHooks(address(0)), IERC20L(address(alp)), address(usdc), odul);
    }

    function run(IPoolManager _pm, bool alpIlk, uint160 sqrtP, int24 alt, int24 ust, uint256 miktar)
        external
        returns (Sonuc memory s)
    {
        pm = _pm;
        (MockERC20 alp, MockUSDC6 usdc) = _kur(alpIlk);
        AlpLocker l = _kilitle(alp, usdc);

        s.kilit = address(l);
        s.alpSifirinci = address(alp) < address(usdc);
        s.acilisTick = TickMath.getTickAtSqrtPrice(sqrtP);
        s.altTick = alt;
        s.ustTick = ust;

        /* The locker places what it holds, so the transfer IS the amount.
           There is no approval and no pull: once the ALP is there, the only
           thing that can be done with it is put it in the pool. */
        alp.transfer(address(l), miktar);
        s.konan = l.kilitle(sqrtP, alt, ust, 0, 60);

        s.havuzAlp = alp.balanceOf(address(pm));
        s.havuzUsdc = usdc.balanceOf(address(pm));
        s.kilitAlpKalan = alp.balanceOf(address(l));
        s.kilitlendi = l.kilitlendi();

        /* Running twice would mean a second position, and a second position
           is a second chance to get the side wrong. */
        alp.transfer(address(l), 1 ether);
        try l.kilitle(sqrtP, alt, ust, 0, 60) { s.ikinciRed = false; }
        catch { s.ikinciRed = true; }
    }

    /// Does a band on the WRONG side get refused, rather than quietly
    /// charged for?
    ///
    /// The caller passes the bad band, rather than this function deriving
    /// one: "wrong side" is relative to the opening price, and a band
    /// computed in here from a rule would only prove the rule agrees with
    /// itself.
    function runKotuBant(IPoolManager _pm, bool alpIlk, uint160 sqrtP, int24 alt, int24 ust, uint256 miktar)
        external
        returns (bool red)
    {
        pm = _pm;
        (MockERC20 alp, MockUSDC6 usdc) = _kur(alpIlk);
        AlpLocker l = _kilitle(alp, usdc);
        alp.transfer(address(l), miktar);
        try l.kilitle(sqrtP, alt, ust, 0, 60) { red = false; }
        catch { red = true; }
        return red;
    }

    /// One purchase, and what it leaves behind.
    function runAlim(
        IPoolManager _pm,
        bool alpIlk,
        uint160 sqrtP,
        int24 alt,
        int24 ust,
        uint256 miktar,
        uint256 harca
    ) external returns (AlimSonuc memory a) {
        pm = _pm;
        (MockERC20 alp, MockUSDC6 usdc) = _kur(alpIlk);
        AlpLocker l = _kilitle(alp, usdc);
        alp.transfer(address(l), miktar);
        l.kilitle(sqrtP, alt, ust, 0, 60);

        bool alpSifirinci = address(alp) < address(usdc);
        a.havuzUsdcOnce = usdc.balanceOf(address(pm));

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(alpSifirinci ? address(alp) : address(usdc)),
            currency1: Currency.wrap(alpSifirinci ? address(usdc) : address(alp)),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        /* Spending USDC to receive ALP: if ALP is currency0 then USDC is
           currency1, so the swap runs one-for-zero. */
        uint256 alpOnce = alp.balanceOf(address(this));
        uint256 usdcOnce = usdc.balanceOf(address(this));
        pm.unlock(abi.encode(Veri(key, !alpSifirinci, harca)));

        a.alinanAlp = alp.balanceOf(address(this)) - alpOnce;
        a.harcananUsdc = usdcOnce - usdc.balanceOf(address(this));
        a.havuzUsdcSonra = usdc.balanceOf(address(pm));
        a.kilitBakiye = usdc.balanceOf(address(l));
        return a;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        Veri memory v = abi.decode(data, (Veri));
        BalanceDelta d = pm.swap(
            v.key,
            SwapParams({
                zeroForOne: v.zeroForOne,
                amountSpecified: -int256(v.miktar),
                sqrtPriceLimitX96: v.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        _ode(v.key.currency0, d.amount0());
        _ode(v.key.currency1, d.amount1());
        return "";
    }

    function _ode(Currency c, int128 d) internal {
        if (d == 0) return;
        if (d < 0) {
            uint256 borc = uint256(uint128(-d));
            pm.sync(c);
            MockERC20(Currency.unwrap(c)).transfer(address(pm), borc);
            pm.settle();
        } else {
            pm.take(c, address(this), uint256(uint128(d)));
        }
    }
}
