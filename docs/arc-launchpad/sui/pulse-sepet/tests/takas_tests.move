/// v4: an auction filled from a Cetus pool (the stand-in in ../cetus-iface:
/// one range, constant liquidity, Cetus's price-limit semantics), bounded by
/// the vault's own reference price.
#[test_only]
module sepet::takas_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::balance;
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use cetus_clmm::config::{Self as cconfig, GlobalConfig};
    use cetus_clmm::pool::{Self as cpool, Pool};
    use sepet::haberci::{Self, Haberci};
    use sepet::kasa::{Self, Kasa};

    public struct USDC has drop {}
    public struct VARLIK has drop {}

    const KURUCU: address = @0xA;
    const DOLDURAN: address = @0xB;
    const SAHIP: address = @0xC;
    const Q64: u128 = 18446744073709551616;
    const SUI: u32 = 8;

    /// sqrt price 2^64 * 2: 4 VARLIK per USDC in pool<USDC, VARLIK> (B per A),
    /// 0.25 VARLIK per USDC in pool<VARLIK, USDC>. Liquidity deep enough that
    /// $50 moves it little; the fee 0.25%.
    fun kur(s: &mut Scenario): Clock {
        s.next_tx(KURUCU);
        haberci::kur<USDC>(SUI, 26, @0xDE, s.ctx());
        let c = clock::create_for_testing(s.ctx());
        transfer::public_share_object(cconfig::yeni_test(s.ctx()));
        c
    }

    fun havuz_ab(s: &mut Scenario, sqrt: u128, likidite: u128) {
        s.next_tx(KURUCU);
        let p = cpool::yeni_test<USDC, VARLIK>(balance::create_for_testing(1_000_000_000_000), balance::create_for_testing(1_000_000_000_000_000), sqrt, likidite, 2500, s.ctx());
        transfer::public_share_object(p);
    }
    fun havuz_ba(s: &mut Scenario, sqrt: u128, likidite: u128) {
        s.next_tx(KURUCU);
        let p = cpool::yeni_test<VARLIK, USDC>(balance::create_for_testing(1_000_000_000_000_000), balance::create_for_testing(1_000_000_000_000), sqrt, likidite, 2500, s.ctx());
        transfer::public_share_object(p);
    }

    /// A buy order of `dolar` for launch 1 straight into the vault (as the receiver would), opening auction `id`.
    fun alim(s: &mut Scenario, c: &Clock, dolar: u64) {
        s.next_tx(KURUCU);
        let mut k = s.take_shared<Kasa<USDC>>();
        kasa::al_emri<USDC, VARLIK>(&mut k, 1, balance::create_for_testing(dolar), 1, c);
        ts::return_shared(k);
    }

    fun liste_a(s: &mut Scenario, c: &Clock, tavan: u64) {
        s.next_tx(KURUCU);
        let h = s.take_shared<Haberci>();
        let mut k = s.take_shared<Kasa<USDC>>();
        let p = s.take_shared<Pool<USDC, VARLIK>>();
        haberci::liste_ekle_a<USDC, VARLIK>(&h, &mut k, &p, tavan, c, s.ctx());
        ts::return_shared(p); ts::return_shared(k); ts::return_shared(h);
    }
    fun liste_b(s: &mut Scenario, c: &Clock, tavan: u64) {
        s.next_tx(KURUCU);
        let h = s.take_shared<Haberci>();
        let mut k = s.take_shared<Kasa<USDC>>();
        let p = s.take_shared<Pool<VARLIK, USDC>>();
        haberci::liste_ekle_b<USDC, VARLIK>(&h, &mut k, &p, tavan, c, s.ctx());
        ts::return_shared(p); ts::return_shared(k); ts::return_shared(h);
    }

    fun al_a(s: &mut Scenario, c: &Clock, id: u64): u64 {
        s.next_tx(DOLDURAN);
        let mut k = s.take_shared<Kasa<USDC>>();
        let g = s.take_shared<GlobalConfig>();
        let mut p = s.take_shared<Pool<USDC, VARLIK>>();
        let tip = kasa::takas_al_a<USDC, VARLIK>(&mut k, id, &g, &mut p, c, s.ctx());
        let n = tip.value();
        transfer::public_transfer(tip, DOLDURAN);
        ts::return_shared(p); ts::return_shared(g); ts::return_shared(k);
        n
    }
    fun al_b(s: &mut Scenario, c: &Clock, id: u64): u64 {
        s.next_tx(DOLDURAN);
        let mut k = s.take_shared<Kasa<USDC>>();
        let g = s.take_shared<GlobalConfig>();
        let mut p = s.take_shared<Pool<VARLIK, USDC>>();
        let tip = kasa::takas_al_b<USDC, VARLIK>(&mut k, id, &g, &mut p, c, s.ctx());
        let n = tip.value();
        transfer::public_transfer(tip, DOLDURAN);
        ts::return_shared(p); ts::return_shared(g); ts::return_shared(k);
        n
    }
    fun sat_a(s: &mut Scenario, c: &Clock, id: u64): u64 {
        s.next_tx(DOLDURAN);
        let mut k = s.take_shared<Kasa<USDC>>();
        let g = s.take_shared<GlobalConfig>();
        let mut p = s.take_shared<Pool<USDC, VARLIK>>();
        let tip = kasa::takas_sat_a<USDC, VARLIK>(&mut k, id, &g, &mut p, c, s.ctx());
        let n = tip.value();
        transfer::public_transfer(tip, DOLDURAN);
        ts::return_shared(p); ts::return_shared(g); ts::return_shared(k);
        n
    }
    fun sat_b(s: &mut Scenario, c: &Clock, id: u64): u64 {
        s.next_tx(DOLDURAN);
        let mut k = s.take_shared<Kasa<USDC>>();
        let g = s.take_shared<GlobalConfig>();
        let mut p = s.take_shared<Pool<VARLIK, USDC>>();
        let tip = kasa::takas_sat_b<USDC, VARLIK>(&mut k, id, &g, &mut p, c, s.ctx());
        let n = tip.value();
        transfer::public_transfer(tip, DOLDURAN);
        ts::return_shared(p); ts::return_shared(g); ts::return_shared(k);
        n
    }
    fun bakiye(s: &mut Scenario): (u64, u64) {
        s.next_tx(KURUCU);
        let k = s.take_shared<Kasa<USDC>>();
        let (b, d) = (kasa::bakiye<USDC, VARLIK>(&k, 1), kasa::dolar_bakiye(&k, 1));
        ts::return_shared(k);
        (b, d)
    }
    fun sat_emri(s: &mut Scenario, c: &Clock, miktar: u64, arz: u64) {
        s.next_tx(KURUCU);
        let mut k = s.take_shared<Kasa<USDC>>();
        kasa::sat_emri<USDC, VARLIK>(&mut k, 1, miktar, arz, true, SUI, SAHIP, c, s.ctx());
        ts::return_shared(k);
    }

    #[test]
    fun havuzdan_alim_dolar_a_bahsisle() {
        let mut s = ts::begin(KURUCU);
        let c = kur(&mut s);
        havuz_ab(&mut s, 2 * Q64, 1_000_000_000_000_000);
        alim(&mut s, &c, 50_000_000);
        liste_a(&mut s, &c, 1_000_000_000);
        let tip = al_a(&mut s, &c, 0);
        assert!(tip == 50_000, 0);
        let (birim, dolar) = bakiye(&mut s);
        /* $49.95 at 4 per dollar, less the 0.25% fee and a sliver of impact */
        assert!(birim > 199_000_000 && birim <= 199_300_500, birim);
        assert!(dolar == 0, dolar);
        clock::destroy_for_testing(c);
        s.end();
    }

    #[test]
    fun havuzdan_alim_dolar_b() {
        let mut s = ts::begin(KURUCU);
        let c = kur(&mut s);
        havuz_ba(&mut s, 2 * Q64, 1_000_000_000_000_000);
        alim(&mut s, &c, 50_000_000);
        liste_b(&mut s, &c, 1_000_000_000);
        assert!(al_b(&mut s, &c, 0) == 50_000, 0);
        let (birim, _) = bakiye(&mut s);
        /* pool<VARLIK, USDC> at sqrt 2: 4 USDC per VARLIK, so $49.95 buys ~12.45 */
        assert!(birim > 12_440_000 && birim <= 12_490_000, birim);
        clock::destroy_for_testing(c);
        s.end();
    }

    #[test, expected_failure(abort_code = sepet::kasa::EFiyat)]
    fun referanstan_uzak_fiyatta_takas_yok() {
        let mut s = ts::begin(KURUCU);
        let c = kur(&mut s);
        havuz_ab(&mut s, 2 * Q64, 1_000_000_000_000_000);
        alim(&mut s, &c, 50_000_000);
        liste_a(&mut s, &c, 1_000_000_000);
        /* the pool pushed 4% (2% in sqrt) inside the same transaction as the fill would be */
        s.next_tx(KURUCU);
        let mut p = s.take_shared<Pool<USDC, VARLIK>>();
        cpool::fiyat_test(&mut p, 2 * Q64 / 100 * 102);
        ts::return_shared(p);
        al_a(&mut s, &c, 0);
        clock::destroy_for_testing(c);
        s.end();
    }

    #[test]
    fun referans_dakikada_ancak_biraz_yuruyebilir() {
        let mut s = ts::begin(KURUCU);
        let mut c = kur(&mut s);
        havuz_ab(&mut s, 2 * Q64, 1_000_000_000_000_000);
        alim(&mut s, &c, 50_000_000);
        liste_a(&mut s, &c, 1_000_000_000);
        /* the price really moves 10% (sqrt +5%) and stays */
        s.next_tx(KURUCU);
        let mut p = s.take_shared<Pool<USDC, VARLIK>>();
        cpool::fiyat_test(&mut p, 2 * Q64 / 100 * 105);
        ts::return_shared(p);
        /* one minute later the reference has moved 0.5% in sqrt; ten minutes, 5% at most per step */
        clock::increment_for_testing(&mut c, 60_000);
        s.next_tx(DOLDURAN);
        let mut k = s.take_shared<Kasa<USDC>>();
        let p = s.take_shared<Pool<USDC, VARLIK>>();
        kasa::izle_a<USDC, VARLIK>(&mut k, &p, &c);
        let (_, _, r1, _, _) = kasa::liste<USDC, VARLIK>(&k);
        assert!(r1 == 2 * Q64 / 10_000 * 10_050 || r1 == (((2 * Q64 as u256) * 10_050 / 10_000) as u128), 1);
        clock::increment_for_testing(&mut c, 600_000);
        kasa::izle_a<USDC, VARLIK>(&mut k, &p, &c);
        let (_, _, r2, _, _) = kasa::liste<USDC, VARLIK>(&k);
        assert!(r2 == 2 * Q64 / 100 * 105, 2);
        ts::return_shared(p); ts::return_shared(k);
        /* now the fill runs, at the new price */
        al_a(&mut s, &c, 0);
        let (birim, _) = bakiye(&mut s);
        assert!(birim > 219_000_000 && birim < 220_500_000, birim);
        clock::destroy_for_testing(c);
        s.end();
    }

    #[test]
    fun tavan_kismi_doldurur_kalan_bekler() {
        let mut s = ts::begin(KURUCU);
        let c = kur(&mut s);
        havuz_ab(&mut s, 2 * Q64, 1_000_000_000_000_000);
        alim(&mut s, &c, 50_000_000);
        liste_a(&mut s, &c, 20_000_000);
        assert!(al_a(&mut s, &c, 0) == 50_000, 0);
        let (birim, dolar) = bakiye(&mut s);
        assert!(birim > 79_000_000 && birim < 80_000_000, birim);
        assert!(dolar == 29_950_000, dolar);
        al_a(&mut s, &c, 0);
        al_a(&mut s, &c, 0);
        let (_, dolar2) = bakiye(&mut s);
        /* $50 = 3 calls x (up to $20 + 5c tip): the cents under a dollar stay with the launch */
        assert!(dolar2 < 1_000_000, dolar2);
        clock::destroy_for_testing(c);
        s.end();
    }

    #[test]
    fun itfada_pay_havuza_satilir_sahibe_odenir() {
        let mut s = ts::begin(KURUCU);
        let c = kur(&mut s);
        havuz_ab(&mut s, 2 * Q64, 1_000_000_000_000_000);
        alim(&mut s, &c, 50_000_000);
        liste_a(&mut s, &c, 1_000_000_000);
        al_a(&mut s, &c, 0);
        let (birim, _) = bakiye(&mut s);
        sat_emri(&mut s, &c, 1, 2);          // half
        let tip = sat_a(&mut s, &c, 1);
        assert!(tip == 50_000, 0);
        s.next_tx(SAHIP);
        let odeme = s.take_from_address<Coin<USDC>>(SAHIP);
        /* half of ~$49.8 back, less the fee both ways and the tip */
        assert!(odeme.value() > 24_600_000 && odeme.value() < 24_900_000, odeme.value());
        transfer::public_transfer(odeme, SAHIP);
        let (kalan, _) = bakiye(&mut s);
        assert!(kalan == birim - birim / 2, kalan);
        clock::destroy_for_testing(c);
        s.end();
    }

    #[test]
    fun itfa_dolar_b_havuzunda() {
        let mut s = ts::begin(KURUCU);
        let c = kur(&mut s);
        havuz_ba(&mut s, 2 * Q64, 1_000_000_000_000_000);
        alim(&mut s, &c, 50_000_000);
        liste_b(&mut s, &c, 1_000_000_000);
        al_b(&mut s, &c, 0);
        sat_emri(&mut s, &c, 1, 1);
        sat_b(&mut s, &c, 1);
        s.next_tx(SAHIP);
        let odeme = s.take_from_address<Coin<USDC>>(SAHIP);
        assert!(odeme.value() > 49_400_000 && odeme.value() < 49_800_000, odeme.value());
        transfer::public_transfer(odeme, SAHIP);
        clock::destroy_for_testing(c);
        s.end();
    }

    #[test, expected_failure(abort_code = sepet::haberci::ESadeceKurucu)]
    fun kilitten_sonra_liste_yok() {
        let mut s = ts::begin(KURUCU);
        let c = kur(&mut s);
        havuz_ab(&mut s, 2 * Q64, 1_000_000_000_000_000);
        s.next_tx(KURUCU);
        let mut h = s.take_shared<Haberci>();
        haberci::kilitle(&mut h, s.ctx());
        ts::return_shared(h);
        liste_a(&mut s, &c, 1_000_000_000);
        clock::destroy_for_testing(c);
        s.end();
    }

    #[test, expected_failure(abort_code = sepet::kasa::EListede)]
    fun listede_olmayan_coin_takas_edilmez() {
        let mut s = ts::begin(KURUCU);
        let c = kur(&mut s);
        havuz_ab(&mut s, 2 * Q64, 1_000_000_000_000_000);
        alim(&mut s, &c, 50_000_000);
        al_a(&mut s, &c, 0);
        clock::destroy_for_testing(c);
        s.end();
    }
}
