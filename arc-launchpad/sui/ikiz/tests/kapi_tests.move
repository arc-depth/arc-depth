#[test_only]
module ikiz::kapi_tests;

use std::{bcs, string, type_name};
use sui::{coin::{Self, Coin, TreasuryCap}, coin_registry::{Self, Currency}, test_scenario as ts, test_utils};
use ikiz::{kapi::{Self, Kapi}, ptest::PTEST, kotu::KOTU};

const KURUCU: address = @0xa;
const ALICE: address = @0xa11ce;
const TOKEN: address = @0x44ddc45c7a3a8f2a4c2433c19e31b05261778a23;

fun w(v: u256): vector<u8> {
    let mut b = vector[];
    let mut i = 32u64;
    while (i > 0) { i = i - 1; b.push_back((((v >> ((i * 8) as u8)) & 0xff) as u8)); };
    b
}
fun pad(m: &mut vector<u8>) { while (m.length() % 32 != 0) m.push_back(0); }

/// abi.encode(uint8 1, address token, string ad, string sembol)
fun yarat(token: address, ad: vector<u8>, sembol: vector<u8>): vector<u8> {
    let mut m = w(1);
    m.append(bcs::to_bytes(&token));
    m.append(w(128));
    let mut a = w((ad.length() as u256));
    a.append(ad);
    pad(&mut a);
    m.append(w(128 + (a.length() as u256)));
    m.append(a);
    m.append(w((sembol.length() as u256)));
    m.append(sembol);
    pad(&mut m);
    m
}
/// abi.encode(uint8 2, address token, bytes32 alici, uint256 miktar)
fun tasi(token: address, alici: address, miktar: u256): vector<u8> {
    let mut m = w(2);
    m.append(bcs::to_bytes(&token));
    m.append(bcs::to_bytes(&alici));
    m.append(w(miktar));
    m
}

/// What the template does: a coin in the registry, metadata cap deleted, nothing minted.
fun para<T: drop>(otw: T, ondalik: u8, sembol: vector<u8>, ad: vector<u8>, ctx: &mut TxContext): (Currency<T>, TreasuryCap<T>) {
    let (ini, cap) = coin_registry::new_currency_with_otw(otw, ondalik, string::utf8(sembol), string::utf8(ad),
        string::utf8(b""), string::utf8(b""), ctx);
    let (mut c, mcap) = coin_registry::finalize_unwrap_for_testing(ini, ctx);
    c.delete_metadata_cap(mcap);
    (c, cap)
}

fun hazir(sc: &mut ts::Scenario): Kapi {
    let mut k = kapi::yeni_test(sc.ctx());
    k.kur(30184, sc.ctx());
    k.isle(&yarat(TOKEN, b"Pulse Test", b"PTEST1"));
    k
}

#[test]
fun yarat_adi_kaydeder_sablon_kaydolur_tasi_basar() {
    let mut sc = ts::begin(KURUCU);
    let mut k = hazir(&mut sc);
    let a = k.beklenen(TOKEN).destroy_some();
    assert!(a.ad() == string::utf8(b"Pulse Test") && a.sembol() == string::utf8(b"PTEST1"));
    /* a transfer before the coin type: it waits ... */
    assert!(k.tip_sec(&tasi(TOKEN, ALICE, 5)).is_none());
    k.isle(&tasi(TOKEN, ALICE, 5));
    assert!(k.bekleyen_sayisi() == 1);
    let (c, cap) = para(test_utils::create_one_time_witness<PTEST>(), 6, b"PTEST1", b"Pulse Test", sc.ctx());
    k.kaydet(TOKEN, &c, cap);
    assert!(k.beklenen(TOKEN).is_none());
    assert!(k.tip(TOKEN) == option::some(type_name::with_defining_ids<PTEST>()));
    /* ... and anyone delivers it now; a new one goes straight through */
    k.bas<PTEST>(0, sc.ctx());
    assert!(k.bekleyen_sayisi() == 0);
    assert!(k.tip_sec(&tasi(TOKEN, ALICE, 4_000_000)) == option::some(type_name::with_defining_ids<PTEST>()));
    k.isle_tip<PTEST>(&tasi(TOKEN, ALICE, 4_000_000), sc.ctx());
    sc.next_tx(ALICE);
    let c1 = sc.take_from_sender<Coin<PTEST>>();
    let c2 = sc.take_from_sender<Coin<PTEST>>();
    assert!(c1.value() + c2.value() == 4_000_005);
    k.yak_test(TOKEN, c1);
    k.yak_test(TOKEN, c2);
    std::unit_test::destroy(c);
    k.yok_et();
    sc.end();
}

#[test]
fun ikinci_yarat_bir_sey_degistirmez() {
    let mut sc = ts::begin(KURUCU);
    let mut k = hazir(&mut sc);
    k.isle(&yarat(TOKEN, b"Other", b"OTH"));
    assert!(k.beklenen(TOKEN).destroy_some().sembol() == string::utf8(b"PTEST1"));
    k.yok_et();
    sc.end();
}

#[test]
fun ad_ve_sembol_paranin_kabul_edecegi_bicime_gelir() {
    let mut sc = ts::begin(KURUCU);
    let mut k = kapi::yeni_test(sc.ctx());
    k.kur(30184, sc.ctx());
    let mut ad = b"abcdefghijklmnopqrstuvwxyz01234";
    ad.append(x"c3bc");
    k.isle(&yarat(TOKEN, ad, x"50c3bc4c534553454d424f4c"));   // "P", u-umlaut, "LSESEMBOL"
    let a = k.beklenen(TOKEN).destroy_some();
    assert!(a.ad() == string::utf8(b"abcdefghijklmnopqrstuvwxyz01234"));
    assert!(a.sembol() == string::utf8(b"PLSESEMBOL"));
    k.yok_et();
    sc.end();
}

#[test, expected_failure(abort_code = kapi::EAdTutmuyor)]
fun baska_adla_yapilan_para_kaydolmaz() {
    let mut sc = ts::begin(KURUCU);
    let mut k = hazir(&mut sc);
    let (c, cap) = para(test_utils::create_one_time_witness<PTEST>(), 6, b"PTEST2", b"Pulse Test", sc.ctx());
    k.kaydet(TOKEN, &c, cap);
    abort 0
}

#[test, expected_failure(abort_code = kapi::EOndalik)]
fun baska_ondalikli_para_kaydolmaz() {
    let mut sc = ts::begin(KURUCU);
    let mut k = hazir(&mut sc);
    let (c, cap) = para(test_utils::create_one_time_witness<PTEST>(), 9, b"PTEST1", b"Pulse Test", sc.ctx());
    k.kaydet(TOKEN, &c, cap);
    abort 0
}

#[test, expected_failure(abort_code = kapi::EArzVar)]
fun onceden_basilmis_para_kaydolmaz() {
    let mut sc = ts::begin(KURUCU);
    let mut k = hazir(&mut sc);
    let (c, mut cap) = para(test_utils::create_one_time_witness<PTEST>(), 6, b"PTEST1", b"Pulse Test", sc.ctx());
    let kendine = coin::mint(&mut cap, 1, sc.ctx());
    transfer::public_transfer(kendine, KURUCU);
    k.kaydet(TOKEN, &c, cap);
    abort 0
}

#[test, expected_failure(abort_code = kapi::EDenetimli)]
fun dondurulabilen_para_kaydolmaz() {
    let mut sc = ts::begin(KURUCU);
    let mut k = hazir(&mut sc);
    let ctx = sc.ctx();
    let (mut ini, cap) = coin_registry::new_currency_with_otw(test_utils::create_one_time_witness<KOTU>(), 6,
        string::utf8(b"PTEST1"), string::utf8(b"Pulse Test"), string::utf8(b""), string::utf8(b""), ctx);
    let deny = ini.make_regulated(false, ctx);
    transfer::public_transfer(deny, KURUCU);
    let (mut c, mcap) = coin_registry::finalize_unwrap_for_testing(ini, ctx);
    c.delete_metadata_cap(mcap);
    k.kaydet(TOKEN, &c, cap);
    abort 0
}

#[test, expected_failure(abort_code = kapi::EUstVeriAcik)]
fun adi_degistirilebilen_para_kaydolmaz() {
    let mut sc = ts::begin(KURUCU);
    let mut k = hazir(&mut sc);
    let ctx = sc.ctx();
    let (ini, cap) = coin_registry::new_currency_with_otw(test_utils::create_one_time_witness<PTEST>(), 6,
        string::utf8(b"PTEST1"), string::utf8(b"Pulse Test"), string::utf8(b""), string::utf8(b""), ctx);
    let (c, mcap) = coin_registry::finalize_unwrap_for_testing(ini, ctx);
    transfer::public_transfer(mcap, KURUCU);
    k.kaydet(TOKEN, &c, cap);
    abort 0
}

#[test, expected_failure(abort_code = kapi::EBeklenmiyor)]
fun yaratilmamis_token_icin_kayit_olmaz() {
    let mut sc = ts::begin(KURUCU);
    let mut k = kapi::yeni_test(sc.ctx());
    k.kur(30184, sc.ctx());
    let (c, cap) = para(test_utils::create_one_time_witness<PTEST>(), 6, b"PTEST1", b"Pulse Test", sc.ctx());
    k.kaydet(TOKEN, &c, cap);
    abort 0
}

#[test, expected_failure(abort_code = kapi::ETipYanlis)]
fun yanlis_tiple_basilamaz() {
    let mut sc = ts::begin(KURUCU);
    let mut k = hazir(&mut sc);
    let (c, cap) = para(test_utils::create_one_time_witness<PTEST>(), 6, b"PTEST1", b"Pulse Test", sc.ctx());
    k.kaydet(TOKEN, &c, cap);
    k.isle_tip<KOTU>(&tasi(TOKEN, ALICE, 1), sc.ctx());
    abort 0
}

#[test]
fun giden_mesaj_merkezin_cozdugu_bicimde() {
    let alici = bcs::to_bytes(&@0xa7c0);
    let istek = x"0102030405";
    let mut b = w(2);
    b.append(bcs::to_bytes(&TOKEN));
    b.append(alici);
    b.append(w(3_000_000));
    b.append(w(160));
    b.append(w(5));
    b.append(istek);
    pad(&mut b);
    assert!(kapi::giden_test(TOKEN, alici, 3_000_000, istek) == b);
}
