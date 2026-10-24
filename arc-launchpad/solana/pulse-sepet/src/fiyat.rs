//! Price math for the vault's DEX path (v4): Raydium CLMM pools, their own
//! time-weighted average tick, and fixed-point helpers. No floats, no heap;
//! built for the host too so it is tested against values computed apart
//! (scripts' BigInt arithmetic, a dumped mainnet observation account).
//!
//! Prices are Raydium's: sqrt(token1 raw per token0 raw) in Q64.64; a tick
//! is a factor of 1.0001 in price, so sqrt(1.0001) in sqrt price.

/// sqrt(1.0001)^(2^k) in Q64.64, k = 0..10 (computed with 200-bit integers)
const R_UST: [u128; 11] = [18447666387855959850, 18448588748116922571, 18450433606991734263, 18454123878217468680, 18461506635090006701,
    18476281010653910144, 18505865242158250041, 18565175891880433522, 18684368066214940582, 18925053041275764671, 19415764168677886926];
/// sqrt(1.0001)^-(2^k) in Q64.64
const R_UST_TERS: [u128; 11] = [18445821805675392311, 18444899583751176498, 18443055278223354162, 18439367220385604838, 18431993317065449817,
    18417254355718160513, 18387811781193591352, 18329067761203520168, 18212142134806087854, 17980523815641551639, 17526086738831147013];

/// The largest tick distance `tick_kaydir` takes (2^11 - 1).
pub const EN_BUYUK_KAYMA: i32 = 2047;

/// a * b as 256 bits: (high, low)
pub fn carp_tam(a: u128, b: u128) -> (u128, u128) {
    let m = u64::MAX as u128;
    let (a0, a1, b0, b1) = (a & m, a >> 64, b & m, b >> 64);
    let p00 = a0 * b0;
    let p01 = a0 * b1;
    let p10 = a1 * b0;
    let p11 = a1 * b1;
    let orta = (p00 >> 64) + (p01 & m) + (p10 & m);
    let lo = (p00 & m) | (orta << 64);
    let hi = p11 + (p01 >> 64) + (p10 >> 64) + (orta >> 64);
    (hi, lo)
}

/// (a * b) >> 64, or None if it does not fit 128 bits
pub fn carp_kaydir64(a: u128, b: u128) -> Option<u128> {
    let (hi, lo) = carp_tam(a, b);
    if hi >> 64 != 0 { return None; }
    Some((hi << 64) | (lo >> 64))
}

/// a * b / d (rounded down), or None if d is 0 or the quotient does not fit
pub fn carp_bol(a: u128, b: u128, d: u128) -> Option<u128> {
    if d == 0 { return None; }
    let (hi, lo) = carp_tam(a, b);
    if hi >= d { return None; }
    let mut kalan = hi;
    let mut q: u128 = 0;
    let mut i = 128;
    while i > 0 {
        i -= 1;
        let tasan = kalan >> 127;
        kalan = (kalan << 1) | ((lo >> i) & 1);
        q <<= 1;
        if tasan == 1 || kalan >= d {
            kalan = kalan.wrapping_sub(d);
            q |= 1;
        }
    }
    Some(q)
}

/// `s` moved by `delta` ticks: s * sqrt(1.0001)^delta.
pub fn tick_kaydir(s: u128, delta: i32) -> Option<u128> {
    if delta.unsigned_abs() > EN_BUYUK_KAYMA as u32 { return None; }
    let n = delta.unsigned_abs();
    let tablo = if delta >= 0 { &R_UST } else { &R_UST_TERS };
    let mut v = s;
    let mut k = 0;
    while k < 11 {
        if n & (1 << k) != 0 { v = carp_kaydir64(v, tablo[k])?; }
        k += 1;
    }
    Some(v)
}

/// Units of the other token that `girdi` of the pool's token0 (`sifirdan`)
/// or token1 is worth at sqrt price `s`, before fees.
///   token0 -> token1: girdi * s^2 / 2^128
///   token1 -> token0: girdi * 2^128 / s^2
pub fn karsilik(girdi: u64, s: u128, sifirdan: bool) -> Option<u128> {
    if s == 0 { return None; }
    if sifirdan {
        let x = carp_kaydir64(girdi as u128, s)?;
        carp_kaydir64(x, s)
    } else {
        let x = carp_bol(girdi as u128, 1u128 << 64, s)?;
        carp_bol(x, 1u128 << 64, s)
    }
}

/* ---- Raydium CLMM accounts -------------------------------------------- */

/// PoolState (Raydium CLMM), the fields the vault reads.
pub struct Havuz {
    pub amm_config: [u8; 32],
    pub mint0: [u8; 32],
    pub mint1: [u8; 32],
    pub vault0: [u8; 32],
    pub vault1: [u8; 32],
    pub gozlem: [u8; 32],
    pub likidite: u128,
    pub sqrt: u128,
    pub tick: i32,
}

pub const HAVUZ_DISK: [u8; 8] = [247, 237, 227, 245, 215, 195, 222, 70];
pub const GOZLEM_DISK: [u8; 8] = [122, 174, 197, 53, 129, 9, 165, 132];

fn d32(b: &[u8], o: usize) -> Option<[u8; 32]> { b.get(o..o + 32)?.try_into().ok() }
fn u128_le(b: &[u8], o: usize) -> Option<u128> { Some(u128::from_le_bytes(b.get(o..o + 16)?.try_into().ok()?)) }

/// disc 8, bump 1, amm_config 32, owner 32, mint0, mint1, vault0, vault1,
/// observation_key, decimals 2, tick_spacing u16, liquidity u128,
/// sqrt_price_x64 u128, tick_current i32
pub fn havuz_oku(b: &[u8]) -> Option<Havuz> {
    if b.len() < 273 || b[..8] != HAVUZ_DISK { return None; }
    Some(Havuz { amm_config: d32(b, 9)?, mint0: d32(b, 73)?, mint1: d32(b, 105)?, vault0: d32(b, 137)?, vault1: d32(b, 169)?,
        gozlem: d32(b, 201)?, likidite: u128_le(b, 237)?, sqrt: u128_le(b, 253)?, tick: i32::from_le_bytes(b.get(269..273)?.try_into().ok()?) })
}

const GOZLEM_SAYI: usize = 100;
const GOZLEM_BAS: usize = 8 + 1 + 8 + 2 + 32;
const GOZLEM_BOY: usize = 4 + 8 + 32;

/// The pool's time-weighted average tick from its ObservationState
/// (disc 8, initialized 1, recent_epoch 8, observation_index u16, pool_id 32,
/// 100 x (block_timestamp u32, tick_cumulative i64, padding 32)).
/// Uses the newest observation and the newest one at least `pencere`
/// seconds older; if the ring is shorter than that, its oldest, provided it
/// spans at least `en_az` seconds. The cumulative only counts time a tick
/// held, so a price moved and moved back inside one transaction adds nothing.
/// Returns (average tick, seconds spanned, newest timestamp).
pub fn twap(b: &[u8], havuz: &[u8; 32], pencere: u32, en_az: u32) -> Option<(i32, u32, u32)> {
    if b.len() < GOZLEM_BAS + GOZLEM_SAYI * GOZLEM_BOY || b[..8] != GOZLEM_DISK || b[8] != 1 { return None; }
    if b.get(19..51)? != havuz { return None; }
    let idx = u16::from_le_bytes([b[17], b[18]]) as usize;
    if idx >= GOZLEM_SAYI { return None; }
    let oku = |i: usize| -> (u32, i64) {
        let o = GOZLEM_BAS + i * GOZLEM_BOY;
        (u32::from_le_bytes(b[o..o + 4].try_into().unwrap()), i64::from_le_bytes(b[o + 4..o + 12].try_into().unwrap()))
    };
    let (ts_n, tc_n) = oku(idx);
    if ts_n == 0 { return None; }
    let mut secilen: Option<(u32, i64)> = None;
    let mut en_eski: Option<(u32, i64)> = None;
    let mut k = 1;
    while k < GOZLEM_SAYI {
        let (ts, tc) = oku((idx + GOZLEM_SAYI - k) % GOZLEM_SAYI);
        if ts == 0 || ts >= ts_n { break; }
        en_eski = Some((ts, tc));
        if ts_n - ts >= pencere { secilen = Some((ts, tc)); break; }
        k += 1;
    }
    let (ts_e, tc_e) = secilen.or(en_eski)?;
    let sure = ts_n - ts_e;
    if sure < en_az { return None; }
    let ort = (tc_n - tc_e).div_euclid(sure as i64);
    if ort > i32::MAX as i64 || ort < i32::MIN as i64 { return None; }
    Some((ort as i32, sure, ts_n))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn carpim_ve_bolum() {
        assert_eq!(carp_tam(u128::MAX, u128::MAX), (u128::MAX - 1, 1));
        assert_eq!(carp_kaydir64(3u128 << 64, 5u128 << 64), Some(15u128 << 64));
        assert_eq!(carp_bol(u128::MAX, 7, 7), Some(u128::MAX));
        assert_eq!(carp_bol(1u128 << 127, 4, 2), None);
        assert_eq!(carp_bol(10, 10, 3), Some(33));
    }

    #[test]
    fn tick_kaydirma_kuvvetle_ayni() {
        /* r^300 computed apart with 200-bit integers (scripts' BigInt): within a few units of 2^-64 (each step floors) */
        let v = tick_kaydir(1u128 << 64, 300).unwrap();
        assert!(v <= 18725516865638445767 && 18725516865638445767 - v < 16, "{}", v);
        let ileri = tick_kaydir(1u128 << 64, 300).unwrap();
        let geri = tick_kaydir(ileri, -300).unwrap();
        assert!((geri as i128 - (1i128 << 64)).abs() < 1000);
        assert_eq!(tick_kaydir(1u128 << 64, 0), Some(1u128 << 64));
        assert_eq!(tick_kaydir(1u128 << 64, 3000), None);
    }

    #[test]
    fn karsilik_iki_yon() {
        /* sqrt price 2^64 * 2 means price 4: 1,000 of token0 is 4,000 of token1 and back */
        let s = 2u128 << 64;
        assert_eq!(karsilik(1_000, s, true), Some(4_000));
        assert_eq!(karsilik(4_000, s, false), Some(1_000));
    }
}
