module cetus_clmm::pool;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use cetus_clmm::config::GlobalConfig;

const Q64: u256 = 18446744073709551616;
const MILYON: u256 = 1_000_000;

public struct Pool<phantom CoinTypeA, phantom CoinTypeB> has key, store {
    id: UID,
    a: Balance<CoinTypeA>,
    b: Balance<CoinTypeB>,
    sqrt: u128,
    likidite: u128,
    ucret_ppm: u64,
}

public struct FlashSwapReceipt<phantom CoinTypeA, phantom CoinTypeB> { a2b: bool, odenecek: u64 }

/// Exact input only in this stand-in. a2b: A in, the price (sqrt of B per A,
/// Q64) falls to at most `sqrt_price_limit`; else B in, it rises. Stops at the
/// limit: the receipt then asks for less than `amount`.
public fun flash_swap<CoinTypeA, CoinTypeB>(
    _config: &GlobalConfig, pool: &mut Pool<CoinTypeA, CoinTypeB>, a2b: bool, by_amount_in: bool, amount: u64,
    sqrt_price_limit: u128, _clock: &Clock,
): (Balance<CoinTypeA>, Balance<CoinTypeB>, FlashSwapReceipt<CoinTypeA, CoinTypeB>) {
    assert!(by_amount_in, 1);
    let l = pool.likidite as u256;
    let s = pool.sqrt as u256;
    let sl = sqrt_price_limit as u256;
    let f = pool.ucret_ppm as u256;
    let istek = (amount as u256) * (MILYON - f) / MILYON;
    if (a2b) {
        assert!(sl < s, 2);
        let tavan = l * Q64 * (s - sl) / (s * sl);
        let (net, yeni) = if (istek >= tavan) (tavan, sl) else (istek, l * Q64 * s / (l * Q64 + istek * s));
        let odenecek = if (net == istek) amount else (((net * MILYON + MILYON - f - 1) / (MILYON - f)) as u64);
        let cikan = (l * (s - yeni) / Q64) as u64;
        pool.sqrt = yeni as u128;
        (balance::zero(), pool.b.split(cikan), FlashSwapReceipt { a2b, odenecek })
    } else {
        assert!(sl > s, 2);
        let tavan = l * (sl - s) / Q64;
        let (net, yeni) = if (istek >= tavan) (tavan, sl) else (istek, s + istek * Q64 / l);
        let odenecek = if (net == istek) amount else (((net * MILYON + MILYON - f - 1) / (MILYON - f)) as u64);
        let cikan = (l * Q64 * (yeni - s) / (s * yeni)) as u64;
        pool.sqrt = yeni as u128;
        (pool.a.split(cikan), balance::zero(), FlashSwapReceipt { a2b, odenecek })
    }
}

public fun repay_flash_swap<CoinTypeA, CoinTypeB>(
    _config: &GlobalConfig, pool: &mut Pool<CoinTypeA, CoinTypeB>, coin_a: Balance<CoinTypeA>, coin_b: Balance<CoinTypeB>,
    receipt: FlashSwapReceipt<CoinTypeA, CoinTypeB>,
) {
    let FlashSwapReceipt { a2b, odenecek } = receipt;
    if (a2b) { assert!(coin_a.value() == odenecek && coin_b.value() == 0, 3) } else { assert!(coin_b.value() == odenecek && coin_a.value() == 0, 3) };
    pool.a.join(coin_a);
    pool.b.join(coin_b);
}

public fun swap_pay_amount<CoinTypeA, CoinTypeB>(receipt: &FlashSwapReceipt<CoinTypeA, CoinTypeB>): u64 { receipt.odenecek }
public fun current_sqrt_price<CoinTypeA, CoinTypeB>(pool: &Pool<CoinTypeA, CoinTypeB>): u128 { pool.sqrt }
public fun liquidity<CoinTypeA, CoinTypeB>(pool: &Pool<CoinTypeA, CoinTypeB>): u128 { pool.likidite }

/// stand-in only: a pool with both reserves, at `sqrt`, liquidity `likidite`.
public fun yeni_test<CoinTypeA, CoinTypeB>(a: Balance<CoinTypeA>, b: Balance<CoinTypeB>, sqrt: u128, likidite: u128, ucret_ppm: u64, ctx: &mut TxContext): Pool<CoinTypeA, CoinTypeB> {
    Pool { id: object::new(ctx), a, b, sqrt, likidite, ucret_ppm }
}
/// stand-in only: the price pushed, as a large swap would leave it.
public fun fiyat_test<CoinTypeA, CoinTypeB>(pool: &mut Pool<CoinTypeA, CoinTypeB>, sqrt: u128) { pool.sqrt = sqrt }
