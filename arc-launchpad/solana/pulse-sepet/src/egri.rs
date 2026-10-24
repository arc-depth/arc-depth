//! The auction curve, shared with the EVM and Move vaults and tested on the
//! host: it halves every YARILANMA, linear in between, never below 1/TABAN_KAT.

pub const BASLANGIC_KAT: u64 = 2;
pub const TABAN_KAT: u64 = 16;
pub const YARILANMA: u64 = 1800;
pub const BEKLEME: u64 = 86_400;

pub fn oran(a: u64, b: u64, c: u64) -> u64 {
    if c == 0 { return 0; }
    ((a as u128 * b as u128) / c as u128) as u64
}

/// What an auction that started at `baslangic`, `gecen` seconds ago, asks.
pub fn istenen(baslangic: u64, gecen: u64) -> u64 {
    let n = gecen / YARILANMA;
    let taban = baslangic / TABAN_KAT;
    if n >= 64 { return taban; }
    let mut q = baslangic >> n;
    q -= oran(q, gecen % YARILANMA, 2 * YARILANMA);
    if q > taban { q } else { taban }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn egri_diger_zincirlerle_ayni() {
        assert_eq!(istenen(8_000, 0), 8_000);
        assert_eq!(istenen(8_000, 900), 6_000);
        assert_eq!(istenen(8_000, 1800), 4_000);
        assert_eq!(istenen(8_000, 10 * 86_400), 500);
        assert_eq!(oran(4, 12, 16), 3);
    }
}
