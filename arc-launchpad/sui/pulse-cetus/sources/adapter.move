/// Cetus adapter for ARC PULSE "paste any token as collateral" on Sui.
///
/// The founder's collateral dollars (C) are swapped into the pasted token (K)
/// through a Cetus CLMM pool with flash_swap / repay_flash_swap, inside the
/// same transaction as the launch. The receipt it returns records the dollars
/// the pool actually took (swap_pay_amount), so launch_backed's 20-dollar
/// minimum is checked against a real swap, not a number the founder typed.
/// Dollars the pool did not take (a price limit reached) are returned to the
/// caller as a second coin. Registered once in the launchpad's Config by its witness type.
module pulse_cetus::adapter {
    use sui::balance;
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use cetus_clmm::config::GlobalConfig;
    use cetus_clmm::pool::{Self, Pool};
    use pulse::launchpad::{Self, Config, Converted};

    const ESlippage: u64 = 1;
    const EZeroIn: u64 = 2;

    /// Cetus tick math bounds (cetus_clmm::tick_math)
    const MIN_SQRT_PRICE_X64: u128 = 4295048016;
    const MAX_SQRT_PRICE_X64: u128 = 79226673515401279992447579055;

    /// Only this module can make one; the launchpad accepts receipts only
    /// from the type registered in its Config.
    public struct Witness has drop {}

    /// The dollar is the pool's coin A: swap A -> B.
    public fun convert_a2b<C, K>(
        cfg: &Config, cetus: &GlobalConfig, pool: &mut Pool<C, K>, dollars: Coin<C>, min_out: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): (Converted<C, K>, Coin<C>) {
        let amount = dollars.value();
        assert!(amount > 0, EZeroIn);
        let (zero_a, out_b, receipt) = pool::flash_swap<C, K>(cetus, pool, true, true, amount, MIN_SQRT_PRICE_X64, clock);
        let pay = pool::swap_pay_amount(&receipt);
        let mut d = dollars.into_balance();
        pool::repay_flash_swap<C, K>(cetus, pool, d.split(pay), balance::zero(), receipt);
        zero_a.destroy_zero();
        assert!(out_b.value() >= min_out && out_b.value() > 0, ESlippage);
        (launchpad::converted<C, K, Witness>(cfg, Witness {}, coin::from_balance(out_b, ctx), pay), coin::from_balance(d, ctx))
    }

    /// The dollar is the pool's coin B: swap B -> A.
    public fun convert_b2a<C, K>(
        cfg: &Config, cetus: &GlobalConfig, pool: &mut Pool<K, C>, dollars: Coin<C>, min_out: u64,
        clock: &Clock, ctx: &mut TxContext,
    ): (Converted<C, K>, Coin<C>) {
        let amount = dollars.value();
        assert!(amount > 0, EZeroIn);
        let (out_a, zero_b, receipt) = pool::flash_swap<K, C>(cetus, pool, false, true, amount, MAX_SQRT_PRICE_X64, clock);
        let pay = pool::swap_pay_amount(&receipt);
        let mut d = dollars.into_balance();
        pool::repay_flash_swap<K, C>(cetus, pool, balance::zero(), d.split(pay), receipt);
        zero_b.destroy_zero();
        assert!(out_a.value() >= min_out && out_a.value() > 0, ESlippage);
        (launchpad::converted<C, K, Witness>(cfg, Witness {}, coin::from_balance(out_a, ctx), pay), coin::from_balance(d, ctx))
    }
}
