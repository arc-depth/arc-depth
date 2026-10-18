#[test_only]
module sepet::kasa_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::balance;
    use sui::coin;
    use sepet::kasa::{Self, Kasa};

    public struct USDC has drop {}
    public struct WSUI has drop {}
    public struct MEME has drop {}

    const SUI_DOMAIN: u32 = 8;
    const BASE: u32 = 6;
    const ARB: address = @0xA2B;
    const TUTUCU: address = @0xB0B;

    fun kur(sc: &mut ts::Scenario): clock::Clock {
        let k = kasa::yeni<USDC>(SUI_DOMAIN, sc.ctx());
        kasa::paylas(k);
        clock::create_for_testing(sc.ctx())
    }

    #[test]
    fun alim_acik_artirmayla_dolar_ve_egri_duser() {
        let mut sc = ts::begin(ARB);
        let mut c = kur(&mut sc);
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        // $4 for launch 1, quote 4 units
        kasa::al_emri<USDC, WSUI>(&mut k, 1, balance::create_for_testing(4_000_000), 4_000_000_000, &c);
        assert!(kasa::istenen(&k, 0, &c) == 8_000_000_000, 0);
        c.increment_for_testing(900_000);
        assert!(kasa::istenen(&k, 0, &c) == 6_000_000_000, 1);
        c.increment_for_testing(900_000);
        assert!(kasa::istenen(&k, 0, &c) == 4_000_000_000, 2);
        let dolar = kasa::doldur_alim<USDC, WSUI>(&mut k, 0, coin::mint_for_testing(4_000_000_000, sc.ctx()), &c, sc.ctx());
        assert!(dolar.value() == 4_000_000, 3);
        assert!(kasa::bakiye<USDC, WSUI>(&k, 1) == 4_000_000_000, 4);
        assert!(kasa::dolar_bakiye(&k, 1) == 0, 5);
        coin::burn_for_testing(dolar);
        // the floor: 1/16 of the start, then a restart from it after a day
        kasa::al_emri<USDC, MEME>(&mut k, 1, balance::create_for_testing(4_000_000), 4_000_000_000, &c);
        c.increment_for_testing(10 * 86_400_000);
        assert!(kasa::istenen(&k, 1, &c) == 500_000_000, 6);
        kasa::yeniden_baslat(&mut k, 1, &c);
        c.increment_for_testing(1_800_000);
        assert!(kasa::istenen(&k, 1, &c) == 250_000_000, 7);
        ts::return_shared(k);
        c.destroy_for_testing();
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = kasa::EAz)]
    fun az_teslim_reddedilir() {
        let mut sc = ts::begin(ARB);
        let c = kur(&mut sc);
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        kasa::al_emri<USDC, WSUI>(&mut k, 1, balance::create_for_testing(4_000_000), 4_000_000_000, &c);
        let d = kasa::doldur_alim<USDC, WSUI>(&mut k, 0, coin::mint_for_testing(7_999_999_999, sc.ctx()), &c, sc.ctx());
        coin::burn_for_testing(d);
        ts::return_shared(k);
        c.destroy_for_testing();
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = kasa::EYanlisCoin)]
    fun yanlis_coin_reddedilir() {
        let mut sc = ts::begin(ARB);
        let c = kur(&mut sc);
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        kasa::al_emri<USDC, WSUI>(&mut k, 1, balance::create_for_testing(4_000_000), 4_000_000_000, &c);
        let d = kasa::doldur_alim<USDC, MEME>(&mut k, 0, coin::mint_for_testing(9_000_000_000, sc.ctx()), &c, sc.ctx());
        coin::burn_for_testing(d);
        ts::return_shared(k);
        c.destroy_for_testing();
        sc.end();
    }

    #[test]
    fun itfa_payi_satilir_ve_burada_ya_da_kuyrukta_odenir() {
        let mut sc = ts::begin(ARB);
        let mut c = kur(&mut sc);
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        kasa::al_emri<USDC, WSUI>(&mut k, 1, balance::create_for_testing(4_000_000), 4_000_000_000, &c);
        c.increment_for_testing(1_800_000);
        let d = kasa::doldur_alim<USDC, WSUI>(&mut k, 0, coin::mint_for_testing(4_000_000_000, sc.ctx()), &c, sc.ctx());
        coin::burn_for_testing(d);
        // 10% redeemed, paid on Sui: 0.4 units for sale, starting at 2x ($0.80)
        kasa::sat_emri<USDC, WSUI>(&mut k, 1, 10, 100, true, SUI_DOMAIN, TUTUCU, &c, sc.ctx());
        assert!(kasa::bakiye<USDC, WSUI>(&k, 1) == 3_600_000_000, 0);
        // a second redemption before the first fills counts only what is left
        kasa::sat_emri<USDC, WSUI>(&mut k, 1, 10, 90, true, BASE, TUTUCU, &c, sc.ctx());
        assert!(kasa::bakiye<USDC, WSUI>(&k, 1) == 3_200_000_000, 1);
        c.increment_for_testing(1_800_000);
        let u1 = kasa::doldur_satim<USDC, WSUI>(&mut k, 1, coin::mint_for_testing(400_000, sc.ctx()), &c, sc.ctx());
        assert!(u1.value() == 400_000_000, 2);
        coin::burn_for_testing(u1);
        let u2 = kasa::doldur_satim<USDC, WSUI>(&mut k, 2, coin::mint_for_testing(400_000, sc.ctx()), &c, sc.ctx());
        coin::burn_for_testing(u2);
        // the Base payout waits for the CCTP sender
        assert!(kasa::giden_sayisi(&k) == 1, 3);
        ts::return_shared(k);
        sc.next_tx(TUTUCU);
        let odeme = sc.take_from_sender<coin::Coin<USDC>>();
        assert!(odeme.value() == 400_000, 4);
        coin::burn_for_testing(odeme);
        c.destroy_for_testing();
        sc.end();
    }

    #[test]
    fun itfa_acik_alimlari_esit_kucultur_ve_launchlar_karismaz() {
        let mut sc = ts::begin(ARB);
        let mut c = kur(&mut sc);
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        kasa::al_emri<USDC, WSUI>(&mut k, 1, balance::create_for_testing(4_000_000), 4_000_000_000, &c);
        kasa::al_emri<USDC, WSUI>(&mut k, 1, balance::create_for_testing(12_000_000), 12_000_000_000, &c);
        kasa::al_emri<USDC, WSUI>(&mut k, 2, balance::create_for_testing(4_000_000), 4_000_000_000, &c);
        // half of launch 1 redeemed: $8 of its $16 paid now
        kasa::sat_emri<USDC, WSUI>(&mut k, 1, 50, 100, true, SUI_DOMAIN, TUTUCU, &c, sc.ctx());
        assert!(kasa::dolar_bakiye(&k, 1) == 8_000_000, 0);
        assert!(kasa::dolar_bakiye(&k, 2) == 4_000_000, 1);
        c.increment_for_testing(1_800_000);
        let q1 = kasa::istenen(&k, 1, &c);
        let d1 = kasa::doldur_alim<USDC, WSUI>(&mut k, 1, coin::mint_for_testing(q1 / 2, sc.ctx()), &c, sc.ctx());
        assert!(d1.value() == 6_000_000, 2);   // the $12 auction spends $6
        let q0 = kasa::istenen(&k, 0, &c);
        let d0 = kasa::doldur_alim<USDC, WSUI>(&mut k, 0, coin::mint_for_testing(q0 / 2, sc.ctx()), &c, sc.ctx());
        assert!(d0.value() == 2_000_000, 3);   // the $4 auction spends $2
        assert!(kasa::dolar_bakiye(&k, 1) == 0, 4);
        assert!(kasa::dolar_bakiye(&k, 2) == 4_000_000, 5);   // launch 2 untouched
        coin::burn_for_testing(d1);
        coin::burn_for_testing(d0);
        ts::return_shared(k);
        c.destroy_for_testing();
        sc.end();
    }
}
