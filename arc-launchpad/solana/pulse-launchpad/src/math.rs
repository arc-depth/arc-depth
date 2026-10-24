//! Launchpad arithmetic, the same rules as aptos/pulse-launchpad and
//! sui/pulse-launchpad (and the EVM PulseLaunchpad3 + PulseHook + vault).
//! Pure functions, no Solana types: tested with a plain `cargo test`.

pub const PPM: u64 = 1_000_000;
pub const MIN_COLLATERAL_DOLLARS: u64 = 20;
pub const OPENING_MCAP_DOLLARS: u64 = 3_500;
pub const MIN_FIRST_BUY_DOLLARS: u64 = 100;
pub const MAX_FIRST_BUY_DOLLARS: u64 = 500;
/// 2.00% of the first buy
pub const LAUNCH_FEE_PPM: u64 = 20_000;
/// trade fee 2%: 0.30% founder, 0.70% stays in the pool, 1.00% platform
pub const FOUNDER_PPM: u64 = 3_000;
pub const DEPTH_PPM: u64 = 7_000;
pub const PLATFORM_PPM: u64 = 10_000;
/// collateral tax, chosen at launch: 1%..5%
pub const TAX_MIN_PPM: u64 = 10_000;
pub const TAX_MAX_PPM: u64 = 50_000;
/// anti-snipe on buys: 99% in the opening second, quartering every second
pub const SNIPE_PPM: u64 = 990_000;
pub const SNIPE_SECONDS: i64 = 5;
/// volume shield: selling more than 0.50% of circulating in one slot pays
/// the excess, up to 3.00%, as extra tax to the vault
pub const SHIELD_THRESHOLD_PPM: u64 = 5_000;
pub const SHIELD_CAP_PPM: u64 = 30_000;

/// a pasted token counts as collateral only when the PulseSwap pool it is
/// bought in is a day old and holds ten times the dollars swapped (the same
/// rule as pulse-swap math::counts_as_collateral and the Move adapters)
pub const MIN_POOL_AGE_SECS: i64 = 86_400;
pub const DEPTH_MULTIPLE: u64 = 10;
pub fn seasoned(now: i64, created_at: i64, dollar_reserve: u64, dollars: u64) -> bool {
    now >= created_at + MIN_POOL_AGE_SECS && dollar_reserve as u128 >= dollars as u128 * DEPTH_MULTIPLE as u128
}

pub fn mul_ppm(x: u64, ppm: u64) -> u64 { (x as u128 * ppm as u128 / PPM as u128) as u64 }

/// 990000 >> (2 * seconds since open), zero from SNIPE_SECONDS on
pub fn snipe_ppm_at(elapsed: i64) -> u64 {
    if elapsed >= SNIPE_SECONDS { 0 } else { SNIPE_PPM >> (2 * elapsed.max(0)) as u32 }
}

/// tokens out for `x` dollars into a pool of `t` tokens and `y` dollars
/// (real + virtual)
pub fn buy_out(t: u64, y: u64, x: u64) -> u64 { (t as u128 * x as u128 / (y as u128 + x as u128)) as u64 }

/// dollars out for `tokens_in`, never more than the real dollars: the
/// virtual reserve is never paid out
pub fn sell_gross(t: u64, real: u64, virt: u64, tokens_in: u64) -> u64 {
    let y = real as u128 + virt as u128;
    let g = (y * tokens_in as u128 / (t as u128 + tokens_in as u128)) as u64;
    g.min(real)
}

/// how a traded dollar amount is split; `rest` goes on to the pool (buy)
/// or to the seller (sell)
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub struct Split { pub founder: u64, pub platform: u64, pub depth: u64, pub tax: u64, pub rest: u64 }

pub fn route(amount: u64, tax_ppm: u64) -> Split {
    let founder = mul_ppm(amount, FOUNDER_PPM);
    let platform = mul_ppm(amount, PLATFORM_PPM);
    let depth = mul_ppm(amount, DEPTH_PPM);
    let tax = mul_ppm(amount, tax_ppm);
    Split { founder, platform, depth, tax, rest: amount - founder - platform - depth - tax }
}

/// (share of circulating sold in this slot so far, extra tax ppm)
pub fn shield(prev_slot: u64, prev_ppm: u64, slot: u64, tokens_in: u64, circulating: u64) -> (u64, u64) {
    let share = if circulating == 0 { 0 } else { (tokens_in as u128 * PPM as u128 / circulating as u128) as u64 };
    let block = if prev_slot == slot { prev_ppm + share } else { share };
    let extra = block.saturating_sub(SHIELD_THRESHOLD_PPM).min(SHIELD_CAP_PPM);
    (block, extra)
}

/// the holder's share of a balance for burning `amount` of `circulating`
pub fn pro_rata(balance: u64, amount: u64, circulating: u64) -> u64 {
    if circulating == 0 { 0 } else { (balance as u128 * amount as u128 / circulating as u128) as u64 }
}

pub fn launch_ok(unit: u64, collateral: u64, first_buy: u64, tax_ppm: u64) -> bool {
    collateral >= MIN_COLLATERAL_DOLLARS * unit
        && first_buy >= MIN_FIRST_BUY_DOLLARS * unit
        && first_buy <= MAX_FIRST_BUY_DOLLARS * unit
        && (TAX_MIN_PPM..=TAX_MAX_PPM).contains(&tax_ppm)
}

#[cfg(test)]
mod tests {
    use super::*;
    const USD: u64 = 1_000_000;
    const SUPPLY: u64 = 1_000_000_000_000_000; // 1e9 tokens, 6 decimals

    #[test]
    fn the_opening_buy_matches_aptos_and_sui_devnet() {
        // 100 USD first buy: 2 USD launch fee, 98 USD bid against 3,500 virtual
        let fee = mul_ppm(100 * USD, LAUNCH_FEE_PPM);
        assert_eq!(fee, 2 * USD);
        let out = buy_out(SUPPLY, OPENING_MCAP_DOLLARS * USD, 100 * USD - fee);
        assert_eq!(out, 27_237_354_085_603); // 27,237,354.085603 on both devnets
    }

    #[test]
    fn a_buy_pays_two_percent_and_the_tax() {
        let s = route(50 * USD, TAX_MIN_PPM);
        assert_eq!(s.founder + s.platform + s.depth, USD);
        assert_eq!(s.tax, 500_000);
        assert_eq!(s.rest, 48_500_000);
    }

    #[test]
    fn snipe_quarters_every_second() {
        assert_eq!(snipe_ppm_at(0), 990_000);
        assert_eq!(snipe_ppm_at(1), 247_500);
        assert_eq!(snipe_ppm_at(4), 3_867);
        assert_eq!(snipe_ppm_at(5), 0);
    }

    #[test]
    fn the_shield_adds_up_within_a_slot_and_is_capped() {
        assert_eq!(shield(0, 0, 7, 4, 1000), (4_000, 0));
        assert_eq!(shield(7, 4_000, 7, 4, 1000), (8_000, 3_000));
        assert_eq!(shield(7, 8_000, 8, 4, 1000), (4_000, 0)); // new slot resets
        assert_eq!(shield(0, 0, 1, 500, 1000).1, SHIELD_CAP_PPM);
    }

    #[test]
    fn a_sell_never_takes_the_virtual_dollars() {
        assert_eq!(sell_gross(SUPPLY / 2, 10 * USD, 3500 * USD, SUPPLY / 2), 10 * USD);
        let g = sell_gross(SUPPLY, 100 * USD, 3500 * USD, SUPPLY / 1000);
        assert!(g < 4 * USD);
    }

    #[test]
    fn launch_limits() {
        assert!(launch_ok(USD, 20 * USD, 100 * USD, 10_000));
        assert!(!launch_ok(USD, 20 * USD - 1, 100 * USD, 10_000));
        assert!(!launch_ok(USD, 20 * USD, 501 * USD, 10_000));
        assert!(!launch_ok(USD, 20 * USD, 100 * USD, 50_001));
        assert_eq!(pro_rata(20 * USD, 1, 10), 2 * USD);
    }

    #[test]
    fn a_pasted_token_needs_a_day_old_pool_ten_times_deep() {
        assert!(seasoned(86_400, 0, 250 * USD, 25 * USD));
        assert!(!seasoned(86_399, 0, 250 * USD, 25 * USD));
        assert!(!seasoned(86_400, 0, 249 * USD, 25 * USD));
    }
}
