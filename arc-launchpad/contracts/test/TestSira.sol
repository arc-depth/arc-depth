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
import {TekYonluAcici, IERC20T} from "../TekYonluAcici.sol";
import {MockERC20} from "./TestRedemption.sol";

/// @notice Who gets what, in order, when nobody deposited any money.
///
/// THE QUESTION BEING ANSWERED
///   "We lock the liquidity. The first buyer sells and gets their money
///   back. Others buy and the price rises. Someone selling after the first
///   buyer gets less. Is that possible without putting liquidity in?"
///
///   It is, and the way to show it is not a diagram. Three buyers go in one
///   after another and then come out in the same order, through the real
///   Arc PoolManager, against a band funded with tokens and zero dollars.
///   What each one paid and what each one got back is recorded, so the
///   answer is their actual profit and loss rather than my description of
///   it.
///
///   The step before all of it matters just as much: a sell attempted
///   BEFORE anybody has bought. A pool holding no quote asset has nothing
///   to pay a seller with, and that has to be visible here rather than
///   discovered by a holder.
contract TestSira is IUnlockCallback {
    IPoolManager pm;
    TekYonluAcici public acici;
    MockERC20 public token;
    MockERC20 public quote;
    PoolKey key;

    struct Kisi {
        uint256 odedi;        // quote raw in
        uint256 aldi;         // token raw out
        uint256 geriAldi;     // quote raw back on the way out
    }

    struct Sonuc {
        uint128 likidite;
        /* before anyone has bought */
        uint256 ilkSatisDenemesi;   // quote a seller could get at t=0
        bool ilkSatisRevert;
        /* three buyers, in order, then out in the same order */
        Kisi a;
        Kisi b;
        Kisi c;
        /* what the pool actually holds along the way */
        uint256 havuzParaAlimlardanSonra;
        uint256 havuzParaHepsiCikinca;
    }

    Sonuc public s;
    error SiraBulunamadi();

    function run(
        IPoolManager _pm,
        uint160 acilisSqrt,
        int24 alt,
        int24 ust,
        uint256 tokenMiktari,
        uint256 tutar
    ) external returns (Sonuc memory) {
        pm = _pm;

        token = new MockERC20(tokenMiktari * 2, address(this));
        for (uint256 i = 0; i < 40; i++) {
            MockERC20 q = new MockERC20(tutar * 1000 + 1e12, address(this));
            if (address(q) < address(token)) { quote = q; break; }
        }
        if (address(quote) == address(0)) revert SiraBulunamadi();

        acici = new TekYonluAcici(_pm, IERC20T(address(token)), IERC20T(address(quote)),
                                  IHooks(address(0)), 0, 60, address(this));
        key = PoolKey({
            currency0: Currency.wrap(address(quote)),
            currency1: Currency.wrap(address(token)),
            fee: 0, tickSpacing: 60, hooks: IHooks(address(0))
        });

        token.transfer(address(acici), tokenMiktari);
        acici.ac(acilisSqrt, alt, ust, 0);
        s.likidite = acici.likidite();

        /* Can anyone sell before a single dollar has come in? */
        try this.satDis(tokenMiktari / 1000) returns (uint256 cikan) { s.ilkSatisDenemesi = cikan; }
        catch { s.ilkSatisRevert = true; }

        /* In: A, then B, then C. */
        (s.a.odedi, s.a.aldi) = _al(tutar);
        (s.b.odedi, s.b.aldi) = _al(tutar);
        (s.c.odedi, s.c.aldi) = _al(tutar);
        s.havuzParaAlimlardanSonra = quote.balanceOf(address(pm));

        /* Out, in the same order they came in. */
        s.a.geriAldi = _sat(s.a.aldi);
        s.b.geriAldi = _sat(s.b.aldi);
        s.c.geriAldi = _sat(s.c.aldi);
        s.havuzParaHepsiCikinca = quote.balanceOf(address(pm));

        return s;
    }

    /// External so the caller can try/catch it: a sell into a pool with no
    /// quote asset is allowed to fail, and failing is the answer.
    function satDis(uint256 miktar) external returns (uint256) {
        require(msg.sender == address(this));
        return _sat(miktar);
    }

    uint8 private mod;
    uint256 private gA;
    uint256 private gB;

    function _al(uint256 tutar) internal returns (uint256, uint256) {
        mod = 1;
        pm.unlock(abi.encode(tutar));
        return (gA, gB);
    }

    function _sat(uint256 miktar) internal returns (uint256) {
        mod = 2;
        pm.unlock(abi.encode(miktar));
        return gA;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        uint256 tutar = abi.decode(data, (uint256));
        if (mod == 1) {
            BalanceDelta d = pm.swap(key, SwapParams({
                zeroForOne: true, amountSpecified: -int256(tutar),
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1 }), "");
            gA = uint256(uint128(-d.amount0()));
            gB = uint256(uint128(d.amount1()));
            pm.sync(key.currency0);
            quote.transfer(address(pm), gA);
            pm.settle();
            pm.take(key.currency1, address(this), gB);
        } else {
            BalanceDelta d = pm.swap(key, SwapParams({
                zeroForOne: false, amountSpecified: -int256(tutar),
                sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1 }), "");
            uint256 verilen = uint256(uint128(-d.amount1()));
            gA = uint256(uint128(d.amount0()));
            pm.sync(key.currency1);
            token.transfer(address(pm), verilen);
            pm.settle();
            if (gA > 0) pm.take(key.currency0, address(this), gA);
        }
        return "";
    }
}
