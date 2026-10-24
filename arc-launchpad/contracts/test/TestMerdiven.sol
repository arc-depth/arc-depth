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
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TekYonluAcici, IERC20T} from "../TekYonluAcici.sol";
import {MockERC20} from "./TestRedemption.sol";

/// @notice What a buyer's wallet will print, against the whole ladder.
///
/// WHY THE WHOLE LADDER AND NOT ONE RUNG
///   The inner rung alone quotes -0.04% on $20, and it would be easy to
///   put that number in front of someone and stop. But the inner rung
///   holds $4,887 of capacity; anything larger walks straight through it
///   into the thinner rungs above, and the honest answer for a $5,000 or
///   a $20,000 buyer depends entirely on what is up there. A figure taken
///   from the first rung and quoted for every size would be a lie by
///   selection.
///
///   So this builds the real thing — three one-sided rungs placed through
///   ac() and genislet(), the same calls production would make, in the
///   same order — and then pushes one buy of a given size through the
///   real Arc PoolManager and reports what came back.
///
///   The fee is zero here and the hook is absent, so these are the pool's
///   own numbers. Production adds 0.5% on top, and that has to be said
///   out loud next to them rather than folded in quietly.
contract TestMerdiven is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    IPoolManager pm;
    TekYonluAcici public acici;
    MockERC20 public token;
    MockERC20 public quote;
    PoolKey key;

    struct Sonuc {
        uint160 acilisSqrt;
        uint128 likiditeIc;
        uint128 likiditeOrta;
        uint128 likiditeDis;
        uint256 quoteTalep;      // must stay zero: no money was put in
        uint256 odenen;
        uint256 alinan;
        uint160 sqrtSonra;
        uint256 aciciArtan;
    }

    Sonuc public s;
    error SiraBulunamadi();

    /// @param acilisTick the opening, on the tick grid; the inner rung's
    ///        top sits on this same tick so there is no gap above it
    /// @param ic,orta,dis the three rungs' outer edges, in ticks
    /// @param tIc,tOrta,tDis how many tokens go into each
    /// @param swapTutari the buy to measure, in quote raw units
    function run(
        IPoolManager _pm,
        int24 acilisTick,
        int24 ic,
        int24 orta,
        int24 dis,
        uint256 tIc,
        uint256 tOrta,
        uint256 tDis,
        uint256 swapTutari
    ) external returns (Sonuc memory) {
        pm = _pm;

        token = new MockERC20((tIc + tOrta + tDis) * 2, address(this));
        for (uint256 i = 0; i < 40; i++) {
            MockERC20 q = new MockERC20(swapTutari * 100 + 1e12, address(this));
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

        s.acilisSqrt = TickMath.getSqrtPriceAtTick(acilisTick);

        /* Rung by rung, exactly as production would: send the tokens for
           one rung, place it, repeat. Nothing is ever sent back. */
        token.transfer(address(acici), tIc);
        acici.ac(s.acilisSqrt, ic, acilisTick, 0);
        s.likiditeIc = acici.likidite();

        token.transfer(address(acici), tOrta);
        s.likiditeOrta = acici.genislet(orta, 0);

        token.transfer(address(acici), tDis);
        s.likiditeDis = acici.genislet(dis, 0);

        /* Not a single unit of the quote asset may have been required. If
           any was, the ladder is not one-sided and the whole premise —
           that this costs no money — is wrong. */
        s.quoteTalep = quote.balanceOf(address(pm));
        s.aciciArtan = token.balanceOf(address(acici));

        pm.unlock(abi.encode(swapTutari));
        return s;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        uint256 tutar = abi.decode(data, (uint256));
        BalanceDelta d = pm.swap(key, SwapParams({
            zeroForOne: true, amountSpecified: -int256(tutar),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1 }), "");
        s.odenen = uint256(uint128(-d.amount0()));
        s.alinan = uint256(uint128(d.amount1()));
        pm.sync(key.currency0);
        quote.transfer(address(pm), s.odenen);
        pm.settle();
        pm.take(key.currency1, address(this), s.alinan);
        /* Where the price ended. Declared in the struct from the start and
           then never written, so the rung column read as -infinity and
           printed nonsense for every row. */
        (s.sqrtSonra, ) = (uint160(0), 0);
        bytes32 slot = keccak256(abi.encode(PoolId.unwrap(key.toId()), uint256(6)));
        s.sqrtSonra = uint160(uint256(pm.extsload(slot)));
        return "";
    }
}
