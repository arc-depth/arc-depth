//! PulseSwap arithmetic, the same rules as aptos/pulse-swap and
//! sui/pulse-swap. Pure functions, no Solana types, so they are tested with
//! a plain `cargo test` and shared by the on-chain program.

pub const PPM: u128 = 1_000_000;
/// 0.30%, left in the pool for liquidity providers
pub const LP_FEE_PPM: u128 = 3_000;
/// 0.10% of the dollar side of every swap
pub const PROTOCOL_FEE_PPM: u128 = 1_000;
/// 5% of the protocol fee can only become FTHM
pub const FTHM_SHARE_PPM: u128 = 50_000;
/// a swap vouches for collateral only in a pool this old...
pub const MIN_POOL_AGE_SECS: i64 = 86_400;
/// ...whose dollar side holds this many times the dollars swapped
pub const DEPTH_MULTIPLE: u64 = 10;
/// the first deposit's shares that nobody owns, so a pool never empties
pub const MIN_SHARES_LOCKED: u64 = 1_000;

#[derive(Debug, PartialEq, Eq)]
pub enum MathError {
    Zero,
    Overflow,
    NotEnoughShares,
}

/// x*y=k output after the LP fee stays in the pool
pub fn quote(reserve_in: u64, reserve_out: u64, amount_in: u64) -> Result<u64, MathError> {
    if amount_in == 0 || reserve_in == 0 || reserve_out == 0 {
        return Err(MathError::Zero);
    }
    let in_after = amount_in as u128 * (PPM - LP_FEE_PPM) / PPM;
    let out = reserve_out as u128 * in_after / (reserve_in as u128 + in_after);
    u64::try_from(out).map_err(|_| MathError::Overflow)
}

/// (fee to the FTHM bucket, fee to the platform) for a dollar amount
pub fn protocol_fee(dollars: u64) -> (u64, u64) {
    let fee = (dollars as u128 * PROTOCOL_FEE_PPM / PPM) as u64;
    let fthm = (fee as u128 * FTHM_SHARE_PPM / PPM) as u64;
    (fthm, fee - fthm)
}

fn isqrt(x: u128) -> u128 {
    if x == 0 {
        return 0;
    }
    let mut z = x;
    let mut y = (x + 1) / 2;
    while y < z {
        z = y;
        y = (x / y + y) / 2;
    }
    z
}

/// shares for the opener: sqrt(t*d) minus the locked dust.
/// returns (shares to the opener, total shares after)
pub fn first_shares(token: u64, dollars: u64) -> Result<(u64, u64), MathError> {
    let s = isqrt(token as u128 * dollars as u128);
    let s = u64::try_from(s).map_err(|_| MathError::Overflow)?;
    if s <= MIN_SHARES_LOCKED {
        return Err(MathError::Zero);
    }
    Ok((s - MIN_SHARES_LOCKED, s))
}

/// shares for a later deposit: the smaller of the two proportions
pub fn added_shares(token_in: u64, dollars_in: u64, reserve_t: u64, reserve_d: u64, total: u64) -> Result<u64, MathError> {
    if reserve_t == 0 || reserve_d == 0 {
        return Err(MathError::Zero);
    }
    let a = token_in as u128 * total as u128 / reserve_t as u128;
    let b = dollars_in as u128 * total as u128 / reserve_d as u128;
    let m = a.min(b);
    if m == 0 {
        return Err(MathError::Zero);
    }
    u64::try_from(m).map_err(|_| MathError::Overflow)
}

/// (token out, dollars out) for burning `shares`
pub fn removed(shares: u64, held: u64, reserve_t: u64, reserve_d: u64, total: u64) -> Result<(u64, u64), MathError> {
    if shares == 0 || shares > held || total == 0 {
        return Err(MathError::NotEnoughShares);
    }
    let t = (reserve_t as u128 * shares as u128 / total as u128) as u64;
    let d = (reserve_d as u128 * shares as u128 / total as u128) as u64;
    Ok((t, d))
}

/// may a swap of `dollars` in this pool vouch for collateral?
pub fn counts_as_collateral(now: i64, created_at: i64, dollar_reserve: u64, dollars: u64) -> bool {
    now >= created_at + MIN_POOL_AGE_SECS && dollar_reserve as u128 >= dollars as u128 * DEPTH_MULTIPLE as u128
}

#[cfg(test)]
mod tests {
    use super::*;
    const USD: u64 = 1_000_000;

    #[test]
    fn quote_matches_the_move_pools() {
        // the same case as the Sui test: 100 USD in (after the 0.10% fee) against 1000/1000
        let (f, p) = protocol_fee(100 * USD);
        assert_eq!(f + p, 100_000);
        assert_eq!(f, 5_000);
        let out = quote(1000 * USD, 1000 * USD, 100 * USD - 100_000).unwrap();
        // 1000 * 99.6003 / 1099.6003
        assert_eq!(out, 90_578_640);
    }

    #[test]
    fn a_round_trip_loses_the_fees() {
        let out = quote(500 * USD, 1000 * USD, 50 * USD).unwrap();
        let back = quote(1000 * USD - out, 500 * USD + 50 * USD, out).unwrap();
        assert!(back < 50 * USD && back > 49 * USD);
    }

    #[test]
    fn zero_is_refused() {
        assert_eq!(quote(0, 1, 1), Err(MathError::Zero));
        assert_eq!(quote(1, 1, 0), Err(MathError::Zero));
        assert_eq!(first_shares(10, 10), Err(MathError::Zero));
    }

    #[test]
    fn shares_round_trip() {
        let (mine, total) = first_shares(1000 * USD, 1000 * USD).unwrap();
        assert_eq!(total, 1000 * USD);
        assert_eq!(mine, 1000 * USD - MIN_SHARES_LOCKED);
        let (t, d) = removed(mine, mine, 1000 * USD, 1000 * USD, total).unwrap();
        assert_eq!(t, 1000 * USD - 1000);
        assert_eq!(d, 1000 * USD - 1000);
        assert_eq!(removed(mine + 1, mine, 1, 1, total), Err(MathError::NotEnoughShares));
        assert_eq!(added_shares(100, 200, 1000, 1000, 1000).unwrap(), 100);
    }

    #[test]
    fn collateral_needs_a_day_and_ten_times_depth() {
        assert!(counts_as_collateral(86_400, 0, 250 * USD, 25 * USD));
        assert!(!counts_as_collateral(86_399, 0, 250 * USD, 25 * USD));
        assert!(!counts_as_collateral(86_400, 0, 249 * USD, 25 * USD));
    }
}
