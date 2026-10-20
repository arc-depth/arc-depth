//! The messages the gate reads and writes: the EVM ABI of the Arc contracts
//! (IkizHub, HaberciLZ) and the borsh of LayerZero's Solana interface.
use alloc::vec::Vec;

pub const YARAT: u8 = 1;
pub const TASI: u8 = 2;

/// The 32-byte word `i` of an ABI message.
pub fn kelime(m: &[u8], o: usize) -> Option<&[u8]> { m.get(o..o.checked_add(32)?) }

/// A uint word that must fit u64.
pub fn u64_kelime(m: &[u8], o: usize) -> Option<u64> {
    let w = kelime(m, o)?;
    if w[..24].iter().any(|x| *x != 0) { return None; }
    Some(u64::from_be_bytes(w[24..32].try_into().ok()?))
}

/// The message type (word 0, uint8).
pub fn tur(m: &[u8]) -> Option<u8> {
    let v = u64_kelime(m, 0)?;
    if v > 255 { None } else { Some(v as u8) }
}

/// The token (word 1, an EVM address).
pub fn token(m: &[u8]) -> Option<[u8; 20]> {
    let w = kelime(m, 32)?;
    if w[..12].iter().any(|x| *x != 0) { return None; }
    w[12..32].try_into().ok()
}

/// A dynamic `string`/`bytes` field whose offset word is at `alan`.
pub fn dinamik(m: &[u8], alan: usize) -> Option<&[u8]> {
    let ofs = u64_kelime(m, alan)? as usize;
    let n = u64_kelime(m, ofs)? as usize;
    m.get(ofs.checked_add(32)?..ofs.checked_add(32)?.checked_add(n)?)
}

/// A name or symbol as Metaplex takes it: at most `en` bytes, cut on a
/// character boundary; one that is not UTF-8 (or empty) becomes `yedek`.
pub fn metin(b: &[u8], en: usize, yedek: &[u8]) -> Vec<u8> {
    let mut n = b.len().min(en);
    if b.len() > en {
        while n > 0 && (b[n] & 0xc0) == 0x80 { n -= 1; }
    }
    let s = &b[..n];
    if n == 0 || core::str::from_utf8(s).is_err() { yedek.to_vec() } else { s.to_vec() }
}

/// YARAT abi.encode(uint8 1, address token, string ad, string sembol): (token, name, symbol).
pub fn yarat(m: &[u8]) -> Option<([u8; 20], Vec<u8>, Vec<u8>)> {
    if tur(m)? != YARAT { return None; }
    Some((token(m)?, metin(dinamik(m, 64)?, 32, b"ARC PULSE twin"), metin(dinamik(m, 96)?, 10, b"TWIN")))
}

/// TASI abi.encode(uint8 2, address token, bytes32 alici, uint256 miktar): (token, recipient, amount).
pub fn tasi(m: &[u8]) -> Option<([u8; 20], [u8; 32], u64)> {
    if tur(m)? != TASI { return None; }
    Some((token(m)?, kelime(m, 64)?.try_into().ok()?, u64_kelime(m, 96)?))
}

fn w(v: u64) -> [u8; 32] {
    let mut b = [0u8; 32];
    b[24..].copy_from_slice(&v.to_be_bytes());
    b
}

/// To the Arc hub: abi.encode(uint8 2, address token, bytes32 alici, uint256 miktar, bytes istek).
pub fn giden(token: &[u8; 20], alici: &[u8; 32], miktar: u64, istek: &[u8]) -> Vec<u8> {
    let mut m = Vec::with_capacity(192 + istek.len() + 32);
    m.extend_from_slice(&w(TASI as u64));
    m.extend_from_slice(&[0u8; 12]);
    m.extend_from_slice(token);
    m.extend_from_slice(alici);
    m.extend_from_slice(&w(miktar));
    m.extend_from_slice(&w(160));
    m.extend_from_slice(&w(istek.len() as u64));
    m.extend_from_slice(istek);
    while m.len() % 32 != 0 { m.push(0); }
    m
}

/// LayerZero's LzReceiveParams (borsh): src_eid u32, sender [32], nonce u64,
/// guid [32], message Vec<u8>, extra_data Vec<u8>.
pub struct Alis<'a> { pub src_eid: u32, pub sender: [u8; 32], pub nonce: u64, pub guid: [u8; 32], pub message: &'a [u8] }

pub fn alis(d: &[u8]) -> Option<Alis<'_>> {
    let src_eid = u32::from_le_bytes(d.get(0..4)?.try_into().ok()?);
    let sender: [u8; 32] = d.get(4..36)?.try_into().ok()?;
    let nonce = u64::from_le_bytes(d.get(36..44)?.try_into().ok()?);
    let guid: [u8; 32] = d.get(44..76)?.try_into().ok()?;
    let n = u32::from_le_bytes(d.get(76..80)?.try_into().ok()?) as usize;
    let message = d.get(80..80usize.checked_add(n)?)?;
    Some(Alis { src_eid, sender, nonce, guid, message })
}

/// Endpoint `clear` params (borsh): receiver, src_eid, sender, nonce, guid, message.
pub fn clear_verisi(disc: &[u8; 8], receiver: &[u8; 32], a: &Alis) -> Vec<u8> {
    let mut d = Vec::with_capacity(8 + 32 + 4 + 32 + 8 + 32 + 4 + a.message.len());
    d.extend_from_slice(disc);
    d.extend_from_slice(receiver);
    d.extend_from_slice(&a.src_eid.to_le_bytes());
    d.extend_from_slice(&a.sender);
    d.extend_from_slice(&a.nonce.to_le_bytes());
    d.extend_from_slice(&a.guid);
    d.extend_from_slice(&(a.message.len() as u32).to_le_bytes());
    d.extend_from_slice(a.message);
    d
}

/// Endpoint `send` params (borsh): dst_eid, receiver, message, options, native_fee, lz_token_fee.
pub fn send_verisi(disc: &[u8; 8], dst_eid: u32, receiver: &[u8; 32], message: &[u8], options: &[u8], native_fee: u64) -> Vec<u8> {
    let mut d = Vec::with_capacity(8 + 4 + 32 + 8 + message.len() + options.len() + 16);
    d.extend_from_slice(disc);
    d.extend_from_slice(&dst_eid.to_le_bytes());
    d.extend_from_slice(receiver);
    d.extend_from_slice(&(message.len() as u32).to_le_bytes());
    d.extend_from_slice(message);
    d.extend_from_slice(&(options.len() as u32).to_le_bytes());
    d.extend_from_slice(options);
    d.extend_from_slice(&native_fee.to_le_bytes());
    d.extend_from_slice(&0u64.to_le_bytes());
    d
}

/// One LzAccount (borsh): pubkey, is_signer, is_writable.
pub fn hesap(v: &mut Vec<u8>, adres: &[u8; 32], imzaci: bool, yazilir: bool) {
    v.extend_from_slice(adres);
    v.push(imzaci as u8);
    v.push(yazilir as u8);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn yarat_mesaji(token: [u8; 20], ad: &[u8], sembol: &[u8]) -> Vec<u8> {
        let pad = |b: &[u8]| { let mut v = w(b.len() as u64).to_vec(); v.extend_from_slice(b); while v.len() % 32 != 0 { v.push(0); } v };
        let a = pad(ad);
        let mut m = w(1).to_vec();
        m.extend_from_slice(&[0u8; 12]); m.extend_from_slice(&token);
        m.extend_from_slice(&w(128)); m.extend_from_slice(&w(128 + a.len() as u64));
        m.extend(a); m.extend(pad(sembol));
        m
    }

    #[test]
    fn yarat_ad_ve_sembolu_metaplex_sinirinda_okur() {
        let t = [0x44u8; 20];
        let (tk, ad, sm) = yarat(&yarat_mesaji(t, b"Pulse Test", b"PTEST1")).unwrap();
        assert_eq!((tk, &ad[..], &sm[..]), (t, &b"Pulse Test"[..], &b"PTEST1"[..]));
        // 31 ASCII bytes then a 2-byte character: the cut at 32 falls inside it
        let mut uzun = b"abcdefghijklmnopqrstuvwxyz01234".to_vec();
        uzun.extend_from_slice("ü".as_bytes());
        let (_, ad, sm) = yarat(&yarat_mesaji(t, &uzun, b"SEMBOLSEMBOL")).unwrap();
        assert_eq!(&ad[..], b"abcdefghijklmnopqrstuvwxyz01234");
        assert_eq!(&sm[..], b"SEMBOLSEMB");
        let (_, ad, sm) = yarat(&yarat_mesaji(t, &[0xff], b"")).unwrap();
        assert_eq!((&ad[..], &sm[..]), (&b"ARC PULSE twin"[..], &b"TWIN"[..]));
    }

    #[test]
    fn tasi_okunur_buyuk_miktar_ve_yabanci_tur_reddedilir() {
        let mut m = w(2).to_vec();
        m.extend_from_slice(&[0u8; 12]); m.extend_from_slice(&[7u8; 20]);
        m.extend_from_slice(&[9u8; 32]); m.extend_from_slice(&w(4_000_000));
        assert_eq!(tasi(&m), Some(([7u8; 20], [9u8; 32], 4_000_000)));
        assert!(yarat(&m).is_none());
        let mut buyuk = m.clone();
        buyuk[96] = 1;
        assert!(tasi(&buyuk).is_none(), "u64'e sigmayan miktar");
        let mut kotu_adres = m.clone();
        kotu_adres[32] = 1;
        assert!(tasi(&kotu_adres).is_none(), "20 bayti asan adres");
    }

    #[test]
    fn giden_evm_abi_ile_birebir() {
        let m = giden(&[0x44; 20], &[0xa7; 32], 3_000_000, &[1, 2, 3, 4, 5]);
        assert_eq!(m.len(), 7 * 32);
        assert_eq!(u64_kelime(&m, 0), Some(2));
        assert_eq!(token(&m), Some([0x44; 20]));
        assert_eq!(&m[64..96], &[0xa7; 32]);
        assert_eq!(u64_kelime(&m, 96), Some(3_000_000));
        assert_eq!(dinamik(&m, 128), Some(&[1u8, 2, 3, 4, 5][..]));
        assert!(m[197..].iter().all(|x| *x == 0));
        assert_eq!(giden(&[0x44; 20], &[0xa7; 32], 1, &[]).len(), 6 * 32);
    }

    #[test]
    fn lz_receive_params_borsh() {
        let mut d = 30417u32.to_le_bytes().to_vec();
        d.extend([3u8; 32]); d.extend(7u64.to_le_bytes()); d.extend([5u8; 32]);
        d.extend(3u32.to_le_bytes()); d.extend([1, 2, 3]); d.extend(0u32.to_le_bytes());
        let a = alis(&d).unwrap();
        assert_eq!((a.src_eid, a.sender, a.nonce, a.guid, a.message), (30417, [3u8; 32], 7, [5u8; 32], &[1u8, 2, 3][..]));
        let c = clear_verisi(&[9; 8], &[4; 32], &a);
        assert_eq!(c.len(), 8 + 32 + 4 + 32 + 8 + 32 + 4 + 3);
        assert!(alis(&d[..79]).is_none());
    }
}
