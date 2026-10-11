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
import {TekYonluAcici, IERC20T} from "../TekYonluAcici.sol";
import {MockERC20} from "./TestRedemption.sol";

/// @notice Does a token-only band actually quote a wallet-sized swap well?
///
/// WHY A SPREADSHEET IS NOT ENOUGH HERE
///   The claim is that 30,000,000 DEPTH in a narrow band behaves like a
///   $1,521 reserve, so a $20 buy costs about 2.6% instead of the 76.96%
///   MetaMask shows against the live pool. That number came out of my own
///   arithmetic, and my own arithmetic is what produced the $6 pool in the
///   first place. The way to settle it is to put the position into a real
///   PoolManager, push $20 through it, and divide what comes out.
///
///   The decimals are carried in the raw amounts rather than in the mocks:
///   the PoolManager only ever sees raw integers, so $20 is 20e6 against a
///   position of 30e24, which is the live asymmetry exactly. What the mocks
///   are for is the address ordering, which is forced so the token lands on
///   currency1 like DEPTH does against USDC.
contract TestTekYonluAcici is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    IPoolManager pm;
    TekYonluAcici public acici;
    MockERC20 public token;
    MockERC20 public quote;
    PoolKey key;

    struct Sonuc {
        /* opening */
        int256 quoteTalep;        // what the pool asked of the money side
        int256 tokenTalep;        // and of the token side
        uint128 likidite;
        uint256 artan;            // tokens left over in the opener
        uint160 sqrtAcilis;
        /* the swap that matters */
        uint256 odenen;           // quote raw in
        uint256 alinan;           // token raw out
        uint160 sqrtSonra;
        /* can the position still grow afterwards */
        uint128 biriktirEklenen;
    }

    Sonuc public s;
    uint8 private mod;

    error SiraBulunamadi();

    /// Same measurement, addressed by tick instead of by sqrt price.
    ///
    /// Sweeping opening market caps means naming prices that do not exist
    /// yet, and turning a price into a sqrtPriceX96 in JavaScript costs
    /// precision at exactly the place where a wrong answer would be
    /// invisible. Ticks are integers and v4 converts them exactly, so the
    /// sweep names a tick and the chain does the arithmetic.
    function runTick(
        IPoolManager _pm,
        int24 acilisTick,
        int24 alt,
        int24 ust,
        uint256 tokenMiktari,
        uint256 swapTutari
    ) external returns (Sonuc memory) {
        return this.run(_pm, TickMath.getSqrtPriceAtTick(acilisTick),
                        alt, ust, tokenMiktari, swapTutari);
    }

    /// Open a token-only band and buy through it.
    /// @param acilisSqrt the live price, computed off chain
    /// @param alt the band's lower tick, likewise
    /// @param ust the band's upper tick
    /// @param tokenMiktari what goes into the band
    /// @param swapTutari the buy to measure, in quote raw units
    function run(
        IPoolManager _pm,
        uint160 acilisSqrt,
        int24 alt,
        int24 ust,
        uint256 tokenMiktari,
        uint256 swapTutari
    ) external returns (Sonuc memory) {
        pm = _pm;

        /* Force DEPTH onto currency1, as it is live. Addresses come out of
           CREATE in no useful order, so this just keeps deploying until the
           ordering matches instead of assuming it. */
        token = new MockERC20(tokenMiktari * 2, address(this));
        for (uint256 i = 0; i < 40; i++) {
            MockERC20 q = new MockERC20(swapTutari * 1000 + 1e12, address(this));
            if (address(q) < address(token)) { quote = q; break; }
        }
        if (address(quote) == address(0)) revert SiraBulunamadi();

        acici = new TekYonluAcici(
            _pm, IERC20T(address(token)), IERC20T(address(quote)),
            IHooks(address(0)), 0, 60, address(this)
        );

        key = PoolKey({
            currency0: Currency.wrap(address(quote)),
            currency1: Currency.wrap(address(token)),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        token.transfer(address(acici), tokenMiktari);
        acici.ac(acilisSqrt, alt, ust, 0);

        s.likidite = acici.likidite();
        s.artan = token.balanceOf(address(acici));
        s.sqrtAcilis = acilisSqrt;
        /* What the pool took of each side. Read from the balances rather
           than from the delta, because the question is whether a single
           cent of the money side was needed, and the balance is the thing
           that would be missing. */
        s.quoteTalep = int256(quote.balanceOf(address(pm)));
        s.tokenTalep = int256(token.balanceOf(address(pm)));

        /* The buy. */
        mod = 1;
        pm.unlock(abi.encode(swapTutari));

        /* And whether depth can still be added once the position is live
           and holding both sides — the hook's reinvested slice arrives that
           way, and the previous locker had no path for it at all. */
        quote.transfer(address(acici), swapTutari);
        token.transfer(address(acici), tokenMiktari / 100);
        s.biriktirEklenen = acici.biriktir();

        return s;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        uint256 tutar = abi.decode(data, (uint256));

        /* Exact input: negative amountSpecified. zeroForOne because the
           money is currency0, so this is a buy. No price limit — the point
           is to see where the band puts it. */
        BalanceDelta delta = pm.swap(
            key,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -int256(tutar),
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            ""
        );

        s.odenen = uint256(uint128(-delta.amount0()));
        s.alinan = uint256(uint128(delta.amount1()));

        pm.sync(key.currency0);
        quote.transfer(address(pm), s.odenen);
        pm.settle();
        pm.take(key.currency1, address(this), s.alinan);

        bytes32 slot = keccak256(abi.encode(PoolId.unwrap(key.toId()), uint256(6)));
        s.sqrtSonra = uint160(uint256(pm.extsload(slot)));
        return "";
    }
}
