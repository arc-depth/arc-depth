// v4: an auction filled from a Hyperion pool (the stand-in in ../hyperion-dex:
// one range, constant liquidity, a fee, a price limit), bounded by the
// vault's own reference price.
#[test_only]
module sepet::takas_tests {
    use std::option;
    use std::string;
    use std::signer;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::fungible_asset::{Self, Metadata, MintRef};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use dex::pool_v3::{Self, LiquidityPoolV3};
    use sepet::haberci;
    use sepet::kasa;

    const APTOS_DOMAIN: u32 = 9;
    const Q64: u128 = 18446744073709551616;
    const SAHIP: address = @0x5a;

    struct Basim has key { usdc: MintRef, varlik: MintRef }

    fun jeton(yaratan: &signer, ad: vector<u8>): (Object<Metadata>, MintRef) {
        let c = object::create_named_object(yaratan, ad);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &c, option::none(), string::utf8(ad), string::utf8(ad), 6, string::utf8(b""), string::utf8(b""));
        (object::object_from_constructor_ref<Metadata>(&c), fungible_asset::generate_mint_ref(&c))
    }

    /// The receiver and its vault; a pool with the dollar as token A (`dolar_a`) or B, at sqrt 2 (Q64).
    fun kur(fw: &signer, yayinci: &signer, arb: &signer, dolar_a: bool, sqrt: u128): (address, address, Object<Metadata>, Object<Metadata>, Object<LiquidityPoolV3>) {
        timestamp::set_time_has_started_for_testing(fw);
        timestamp::update_global_time_for_test_secs(1_800_000_000);
        account::create_account_for_test(signer::address_of(yayinci));
        account::create_account_for_test(signer::address_of(arb));
        let (usdc, mu) = jeton(yayinci, b"USDC");
        let (varlik, mv) = jeton(yayinci, b"VARLIK");
        let h = haberci::kur_ic(yayinci, APTOS_DOMAIN, usdc, 26, @0xde);
        let k = haberci::kasa_adresi(h);
        let p = if (dolar_a) pool_v3::yeni_test(yayinci, usdc, varlik, sqrt, 1_000_000_000_000_000, 2500)
                else pool_v3::yeni_test(yayinci, varlik, usdc, sqrt, 1_000_000_000_000_000, 2500);
        pool_v3::yatir_test(p, fungible_asset::mint(&mu, 1_000_000_000_000));
        pool_v3::yatir_test(p, fungible_asset::mint(&mv, 1_000_000_000_000_000));
        move_to(yayinci, Basim { usdc: mu, varlik: mv });
        (h, k, usdc, varlik, p)
    }

    fun alim(k: address, varlik: Object<Metadata>, dolar: u64) acquires Basim {
        kasa::al_emri(k, 1, fungible_asset::mint(&borrow_global<Basim>(@sepet).usdc, dolar), varlik, 1);
    }

    fun ileri(s: u64) { timestamp::update_global_time_for_test_secs(timestamp::now_seconds() + s); }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    fun havuzdan_alim_dolar_a_bahsisle(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (h, k, usdc, varlik, p) = kur(fw, yayinci, arb, true, 2 * Q64);
        alim(k, varlik, 50_000_000);
        haberci::liste_ekle(yayinci, h, object::object_address(&varlik), object::object_address(&p), 1_000_000_000);
        kasa::takas_al(arb, k, 0);
        assert!(primary_fungible_store::balance(@0xa2b, usdc) == 50_000, 0);
        let birim = kasa::bakiye(k, 1, object::object_address(&varlik));
        assert!(birim > 199_000_000 && birim <= 199_300_500, birim);
        assert!(kasa::dolar_bakiye(k, 1) == 0, 1);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    fun havuzdan_alim_dolar_b(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (h, k, _usdc, varlik, p) = kur(fw, yayinci, arb, false, 2 * Q64);
        alim(k, varlik, 50_000_000);
        haberci::liste_ekle(yayinci, h, object::object_address(&varlik), object::object_address(&p), 1_000_000_000);
        kasa::takas_al(arb, k, 0);
        let birim = kasa::bakiye(k, 1, object::object_address(&varlik));
        assert!(birim > 12_440_000 && birim <= 12_490_000, birim);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    #[expected_failure(abort_code = 12, location = sepet::kasa)]
    fun referanstan_uzak_fiyatta_takas_yok(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (h, k, _usdc, varlik, p) = kur(fw, yayinci, arb, true, 2 * Q64);
        alim(k, varlik, 50_000_000);
        haberci::liste_ekle(yayinci, h, object::object_address(&varlik), object::object_address(&p), 1_000_000_000);
        pool_v3::fiyat_test(p, 2 * Q64 / 100 * 102);
        kasa::takas_al(arb, k, 0);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    fun referans_dakikada_ancak_biraz_yuruyebilir(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (h, k, _usdc, varlik, p) = kur(fw, yayinci, arb, true, 2 * Q64);
        alim(k, varlik, 50_000_000);
        let va = object::object_address(&varlik);
        haberci::liste_ekle(yayinci, h, va, object::object_address(&p), 1_000_000_000);
        pool_v3::fiyat_test(p, 2 * Q64 / 100 * 105);
        ileri(60);
        kasa::izle(k, va);
        let (_, _, r1, _, _) = kasa::liste(k, va);
        assert!(r1 == ((2 * (Q64 as u256) * 10050 / 10000) as u128), 1);
        ileri(600);
        kasa::izle(k, va);
        let (_, _, r2, _, _) = kasa::liste(k, va);
        assert!(r2 == 2 * Q64 / 100 * 105, 2);
        kasa::takas_al(arb, k, 0);
        let birim = kasa::bakiye(k, 1, va);
        assert!(birim > 219_000_000 && birim < 220_500_000, birim);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    fun tavan_kismi_doldurur_kalan_bekler(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (h, k, _usdc, varlik, p) = kur(fw, yayinci, arb, true, 2 * Q64);
        alim(k, varlik, 50_000_000);
        haberci::liste_ekle(yayinci, h, object::object_address(&varlik), object::object_address(&p), 20_000_000);
        kasa::takas_al(arb, k, 0);
        assert!(kasa::dolar_bakiye(k, 1) == 29_950_000, kasa::dolar_bakiye(k, 1));
        kasa::takas_al(arb, k, 0);
        kasa::takas_al(arb, k, 0);
        assert!(kasa::dolar_bakiye(k, 1) < 1_000_000, kasa::dolar_bakiye(k, 1));
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    fun itfada_pay_havuza_satilir_sahibe_odenir(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (h, k, usdc, varlik, p) = kur(fw, yayinci, arb, true, 2 * Q64);
        alim(k, varlik, 50_000_000);
        let va = object::object_address(&varlik);
        haberci::liste_ekle(yayinci, h, va, object::object_address(&p), 1_000_000_000);
        kasa::takas_al(arb, k, 0);
        let birim = kasa::bakiye(k, 1, va);
        kasa::sat_emri(k, 1, varlik, 1, 2, true, APTOS_DOMAIN, SAHIP);
        kasa::takas_sat(arb, k, 1);
        let odeme = primary_fungible_store::balance(SAHIP, usdc);
        assert!(odeme > 24_600_000 && odeme < 24_900_000, odeme);
        assert!(kasa::bakiye(k, 1, va) == birim - birim / 2, 1);
        assert!(primary_fungible_store::balance(@0xa2b, usdc) == 100_000, 2);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    fun itfa_dolar_b_havuzunda_baska_zincire(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (h, k, _usdc, varlik, p) = kur(fw, yayinci, arb, false, 2 * Q64);
        alim(k, varlik, 50_000_000);
        haberci::liste_ekle(yayinci, h, object::object_address(&varlik), object::object_address(&p), 1_000_000_000);
        kasa::takas_al(arb, k, 0);
        kasa::sat_emri(k, 1, varlik, 1, 1, true, 6, @0xba5e);
        kasa::takas_sat(arb, k, 1);
        assert!(kasa::giden_sayisi(k) == 1, 0);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    #[expected_failure(abort_code = 1, location = sepet::haberci)]
    fun kilitten_sonra_liste_yok(fw: &signer, yayinci: &signer, arb: &signer) {
        let (h, _k, _usdc, varlik, p) = kur(fw, yayinci, arb, true, 2 * Q64);
        haberci::kilitle(yayinci, h);
        haberci::liste_ekle(yayinci, h, object::object_address(&varlik), object::object_address(&p), 1_000_000_000);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    #[expected_failure(abort_code = 10, location = sepet::kasa)]
    fun listede_olmayan_varlik_takas_edilmez(fw: &signer, yayinci: &signer, arb: &signer) acquires Basim {
        let (_h, k, _usdc, varlik, _p) = kur(fw, yayinci, arb, true, 2 * Q64);
        alim(k, varlik, 50_000_000);
        kasa::takas_al(arb, k, 0);
    }

    /// v5: the Defter moves as often as needed until the lock
    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    fun defter_kilide_kadar_tekrar_degisir(fw: &signer, yayinci: &signer, arb: &signer) {
        let (h, _k, _usdc, _varlik, _p) = kur(fw, yayinci, arb, true, 2 * Q64);
        haberci::defter_degistir(yayinci, h, @0x44);
        assert!(haberci::defter_adresi(h) == @0x44, 1);
        haberci::defter_degistir(yayinci, h, @0x55);
        assert!(haberci::defter_adresi(h) == @0x55, 2);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    #[expected_failure(abort_code = 1, location = sepet::haberci)]
    fun kilitten_sonra_defter_degismez(fw: &signer, yayinci: &signer, arb: &signer) {
        let (h, _k, _usdc, _varlik, _p) = kur(fw, yayinci, arb, true, 2 * Q64);
        haberci::defter_degistir(yayinci, h, @0x44);
        haberci::kilitle(yayinci, h);
        haberci::defter_degistir(yayinci, h, @0x55);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, arb = @0xa2b)]
    #[expected_failure(abort_code = 1, location = sepet::haberci)]
    fun yabanci_defteri_degistiremez(fw: &signer, yayinci: &signer, arb: &signer) {
        let (h, _k, _usdc, _varlik, _p) = kur(fw, yayinci, arb, true, 2 * Q64);
        haberci::defter_degistir(arb, h, @0x44);
    }
}
