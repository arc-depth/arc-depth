#[test_only]
module ada_kapisi::kapi_tests;

use ada_kapisi::kapi::{Self, Kapi};
use sui::{coin::{Self, Coin}, test_scenario as ts};

public struct USDC has drop {}

/* the vectors are encoded by ethers (EVM AbiCoder), not by this module */
const M: vector<u8> = x"0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000000000000000000000000000a11ce00000000000000000000000000000000000000000000000000000000000b0b0100000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000002625a00000000000000000000000000000000000000000000000000000000000000000";
const TASI: vector<u8> = x"000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000000000000000000000000000a11ce00000000000000000000000000000000000000000000000000000000000b0b0100000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000002625a00000000000000000000000000000000000000000000000000000000000000000";
const ODENDI: vector<u8> = x"0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000000000000001abababababababababababababababababababababababababababababababab";
const BNB: u32 = 30102;
const HEDEF: address = @0xb0b01;

fun ab(): vector<u8> { let mut a = vector[]; let mut i = 0; while (i < 32) { a.push_back(0xab); i = i + 1; }; a }

#[test]
fun bnb_emri_bekler_doldurulur_tutucu_odenir() {
    let mut sc = ts::begin(@0xa);
    let mut k = kapi::yeni_test(sc.ctx());
    k.isle(BNB, &TASI);
    assert!(k.bekliyor_mu(BNB, 7));
    let odeme = coin::mint_for_testing<USDC>(2_500_000, sc.ctx());
    k.doldur(BNB, M, ab(), odeme);
    assert!(!k.bekliyor_mu(BNB, 7));
    kapi::paylas_test(k);
    sc.next_tx(@0xa);
    let c = sc.take_from_address<Coin<USDC>>(HEDEF);
    assert!(c.value() == 2_500_000);
    ts::return_to_address(HEDEF, c);
    sc.end();
}

#[test]
#[expected_failure(abort_code = kapi::EYanlisMesaj)]
fun ikinci_dolum_reddedilir() {
    let mut sc = ts::begin(@0xa);
    let mut k = kapi::yeni_test(sc.ctx());
    k.isle(BNB, &TASI);
    k.doldur(BNB, M, ab(), coin::mint_for_testing<USDC>(2_500_000, sc.ctx()));
    k.doldur(BNB, M, ab(), coin::mint_for_testing<USDC>(2_500_000, sc.ctx()));
    kapi::paylas_test(k);
    sc.end();
}

#[test]
#[expected_failure(abort_code = kapi::EYanlisTutar)]
fun eksik_odeme_reddedilir() {
    let mut sc = ts::begin(@0xa);
    let mut k = kapi::yeni_test(sc.ctx());
    k.isle(BNB, &TASI);
    k.doldur(BNB, M, ab(), coin::mint_for_testing<USDC>(2_000_000, sc.ctx()));
    kapi::paylas_test(k);
    sc.end();
}

#[test]
#[expected_failure(abort_code = kapi::EYanlisMesaj)]
fun gelmemis_emir_doldurulamaz() {
    let mut sc = ts::begin(@0xa);
    let mut k = kapi::yeni_test(sc.ctx());
    k.doldur(BNB, M, ab(), coin::mint_for_testing<USDC>(2_500_000, sc.ctx()));
    kapi::paylas_test(k);
    sc.end();
}

#[test]
fun makbuz_evm_kodlamasiyla_ayni() {
    assert!(kapi::odendi_mesaji(&vector[7u64], &vector[ab()]) == ODENDI);
}
