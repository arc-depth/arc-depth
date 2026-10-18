#[test_only]
module sepet::kasa_tests {
    use std::option;
    use std::string;
    use std::signer;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::fungible_asset::{Self, Metadata, MintRef};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use sepet::kasa;

    const APTOS_DOMAIN: u32 = 9;
    const BASE: u32 = 6;

    struct Basim has key { usdc: MintRef, wapt: MintRef, meme: MintRef }

    fun jeton(yaratan: &signer, ad: vector<u8>): (Object<Metadata>, MintRef) {
        let c = object::create_named_object(yaratan, ad);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &c, option::none(), string::utf8(ad), string::utf8(ad), 6, string::utf8(b""), string::utf8(b""));
        (object::object_from_constructor_ref<Metadata>(&c), fungible_asset::generate_mint_ref(&c))
    }

    fun bas(m: &MintRef, kime: address, n: u64) {
        primary_fungible_store::deposit(kime, fungible_asset::mint(m, n));
    }

    fun kur(fw: &signer, yayinci: &signer, arb: &signer): (address, Object<Metadata>, Object<Metadata>, Object<Metadata>) {
        timestamp::set_time_has_started_for_testing(fw);
        timestamp::update_global_time_for_test_secs(1_800_000_000);
        account::create_account_for_test(signer::address_of(yayinci));
        account::create_account_for_test(signer::address_of(arb));
        let (usdc, mu) = jeton(yayinci, b"USDC");
        let (wapt, mw) = jeton(yayinci, b"WAPT");
        let (meme, mm) = jeton(yayinci, b"MEME");
        bas(&mw, signer::address_of(arb), 1_000_000_000_000);
        bas(&mm, signer::address_of(arb), 1_000_000_000_000);
        bas(&mu, signer::address_of(arb), 1_000_000_000_000);
        let k = kasa::kur(yayinci, APTOS_DOMAIN, usdc);
        move_to(yayinci, Basim { usdc: mu, wapt: mw, meme: mm });
        (k, usdc, wapt, meme)
    }

    fun dolar(yayinci: address, n: u64): fungible_asset::FungibleAsset acquires Basim {
        fungible_asset::mint(&borrow_global<Basim>(yayinci).usdc, n)
    }

    fun ileri(s: u64) { timestamp::update_global_time_for_test_secs(timestamp::now_seconds() + s); }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    fun kasa_kimsenin_degil_ve_alim_dolar(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (k, _usdc, wapt, _meme) = kur(fw, yayinci, arb);
        assert!(kasa::sahip(k) == @0xdead, 0);
        kasa::al_emri(k, 1, dolar(@sepet, 4_000_000), wapt, 4_000_000);
        assert!(kasa::istenen(k, 0) == 8_000_000, 1);
        ileri(900);
        assert!(kasa::istenen(k, 0) == 6_000_000, 2);
        ileri(900);
        assert!(kasa::istenen(k, 0) == 4_000_000, 3);
        let once = primary_fungible_store::balance(@0xa2b, _usdc);
        kasa::doldur_alim(arb, k, 0, 4_000_000);
        assert!(primary_fungible_store::balance(@0xa2b, _usdc) - once == 4_000_000, 4);
        assert!(kasa::bakiye(k, 1, object::object_address(&wapt)) == 4_000_000, 5);
        assert!(kasa::dolar_bakiye(k, 1) == 0, 6);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    #[expected_failure(abort_code = kasa::EAz)]
    fun az_teslim_reddedilir(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (k, _u, wapt, _m) = kur(fw, yayinci, arb);
        kasa::al_emri(k, 1, dolar(@sepet, 4_000_000), wapt, 4_000_000);
        kasa::doldur_alim(arb, k, 0, 7_999_999);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    fun itfa_payi_satilir_ve_odenir(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (k, usdc, wapt, _m) = kur(fw, yayinci, arb);
        kasa::al_emri(k, 1, dolar(@sepet, 4_000_000), wapt, 4_000_000);
        ileri(1800);
        kasa::doldur_alim(arb, k, 0, 4_000_000);
        // 10% redeemed, paid on Aptos; then another 10% of what is left, paid on Base
        kasa::sat_emri(k, 1, wapt, 10, 100, true, APTOS_DOMAIN, @0xb0b);
        assert!(kasa::bakiye(k, 1, object::object_address(&wapt)) == 3_600_000, 0);
        kasa::sat_emri(k, 1, wapt, 10, 90, true, BASE, @0xb0b);
        assert!(kasa::bakiye(k, 1, object::object_address(&wapt)) == 3_200_000, 1);
        ileri(1800);
        kasa::doldur_satim(arb, k, 1, 400_000);
        kasa::doldur_satim(arb, k, 2, 400_000);
        assert!(primary_fungible_store::balance(@0xb0b, usdc) == 400_000, 2);
        assert!(kasa::giden_sayisi(k) == 1, 3);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    fun itfa_acik_alimlari_esit_kucultur_ve_launchlar_karismaz(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (k, _u, wapt, _m) = kur(fw, yayinci, arb);
        kasa::al_emri(k, 1, dolar(@sepet, 4_000_000), wapt, 4_000_000);
        kasa::al_emri(k, 1, dolar(@sepet, 12_000_000), wapt, 12_000_000);
        kasa::al_emri(k, 2, dolar(@sepet, 4_000_000), wapt, 4_000_000);
        kasa::sat_emri(k, 1, wapt, 50, 100, true, APTOS_DOMAIN, @0xb0b);
        assert!(kasa::dolar_bakiye(k, 1) == 8_000_000, 0);
        ileri(1800);
        let q1 = kasa::istenen(k, 1);
        kasa::doldur_alim(arb, k, 1, q1 / 2);
        let q0 = kasa::istenen(k, 0);
        kasa::doldur_alim(arb, k, 0, q0 / 2);
        assert!(kasa::dolar_bakiye(k, 1) == 0, 1);
        assert!(kasa::dolar_bakiye(k, 2) == 4_000_000, 2);
        assert!(kasa::bakiye(k, 1, object::object_address(&wapt)) == q1 / 2 + q0 / 2, 3);
    }
}
