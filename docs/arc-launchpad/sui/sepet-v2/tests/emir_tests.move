#[test_only]
module sepet::emir_tests {
    use std::bcs;
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin::{Self, Coin};
    use sepet::kasa::{Self, Kasa};
    use sepet::emir::{Self, Emir};

    public struct USDC has drop {}
    public struct WSUI has drop {}

    const KURUCU: address = @0xa;
    const ARB: address = @0xa2b;
    const DEFTER: address = @0xa7c2;
    const SUI_DOMAIN: u32 = 8;

    fun w(v: u256): vector<u8> {
        let mut b = vector[];
        let mut i = 32;
        while (i > 0) { i = i - 1; b.push_back((((v >> ((i * 8) as u8)) & 0xff) as u8)); };
        b
    }
    fun wa(a: address): vector<u8> { bcs::to_bytes(&a) }

    /// What the Arc HaberciLZ sends: abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri, uint256 miktar, uint256 beklenen)
    fun mesaj(kaynak: address, hedef: address, veri: vector<u8>, miktar: u256): vector<u8> {
        let mut m = wa(kaynak);
        m.append(wa(hedef));
        m.append(w(160));
        m.append(w(miktar));
        m.append(w(miktar));
        m.append(w((veri.length() as u256)));
        m.append(veri);
        while (m.length() % 32 != 0) m.push_back(0);
        m
    }
    fun al_verisi(id: u64, varlik: address, refv: u256): vector<u8> {
        let mut v = w(2);
        v.append(w((id as u256)));
        v.append(wa(varlik));
        v.append(w(refv));
        v
    }
    fun sat_verisi(id: u64, varlik: address, miktar: u256, arz: u256, hz: u32, alici: address): vector<u8> {
        let mut v = w(3);
        v.append(w((id as u256)));
        v.append(w(224));
        v.append(w(miktar));
        v.append(w(arz));
        v.append(w((hz as u256)));
        v.append(wa(alici));
        v.append(w(1));
        v.append(wa(varlik));
        v
    }

    fun kur(sc: &mut ts::Scenario): address {
        let mut e = emir::yeni_test(sc.ctx());
        emir::kur<USDC>(&mut e, SUI_DOMAIN, DEFTER, sc.ctx());
        let k = e.kasa_adresi();
        emir::paylas_test(e);
        k
    }

    #[test]
    fun layerzero_emri_kaydedilir_dolar_gelince_alim_acilir() {
        let mut sc = ts::begin(KURUCU);
        let kasa_adr = kur(&mut sc);
        sc.next_tx(ARB);
        let e = sc.take_shared<Emir>();
        let mut k = sc.take_shared<Kasa<USDC>>();
        emir::isle(&e, &mut k, &mesaj(DEFTER, kasa_adr, al_verisi(1, kasa::tip_kimligi<WSUI>(), 4_000_000), 50_000_000));
        assert!(kasa::emir_sayisi(&k) == 1, 0);
        ts::return_shared(k);
        ts::return_shared(e);
        /* the plain burn: CCTP mints the dollars to the vault object */
        transfer::public_transfer(coin::mint_for_testing<USDC>(50_000_000, sc.ctx()), kasa_adr);
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        let c = clock::create_for_testing(sc.ctx());
        let bilet = ts::most_recent_receiving_ticket<Coin<USDC>>(&object::id_from_address(kasa_adr));
        kasa::kabul(&mut k, bilet);
        kasa::uygula_al<USDC, WSUI>(&mut k, 0, &c);
        assert!(kasa::dolar_bakiye(&k, 1) == 50_000_000 && kasa::havuz(&k) == 0, 1);
        assert!(kasa::ihale_sayisi(&k) == 1, 2);
        ts::return_shared(k);
        c.destroy_for_testing();
        sc.end();
    }

    #[test]
    fun itfa_emri_kaydedilir() {
        let mut sc = ts::begin(KURUCU);
        let kasa_adr = kur(&mut sc);
        sc.next_tx(ARB);
        let e = sc.take_shared<Emir>();
        let mut k = sc.take_shared<Kasa<USDC>>();
        emir::isle(&e, &mut k, &mesaj(DEFTER, kasa_adr, sat_verisi(1, kasa::tip_kimligi<WSUI>(), 1, 10, 26, @0xa11ce), 0));
        assert!(kasa::emir_sayisi(&k) == 1, 0);
        ts::return_shared(k);
        ts::return_shared(e);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = emir::ESadeceDefter)]
    fun yalniz_defter_emir_verir() {
        let mut sc = ts::begin(KURUCU);
        let kasa_adr = kur(&mut sc);
        sc.next_tx(ARB);
        let e = sc.take_shared<Emir>();
        let mut k = sc.take_shared<Kasa<USDC>>();
        emir::isle(&e, &mut k, &mesaj(@0xbad, kasa_adr, al_verisi(1, kasa::tip_kimligi<WSUI>(), 1), 1));
        ts::return_shared(k);
        ts::return_shared(e);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = emir::EYanlisKasa)]
    fun yalniz_bu_kasa() {
        let mut sc = ts::begin(KURUCU);
        let _kasa_adr = kur(&mut sc);
        sc.next_tx(ARB);
        let e = sc.take_shared<Emir>();
        let mut k = sc.take_shared<Kasa<USDC>>();
        emir::isle(&e, &mut k, &mesaj(DEFTER, @0xbad, al_verisi(1, kasa::tip_kimligi<WSUI>(), 1), 1));
        ts::return_shared(k);
        ts::return_shared(e);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = emir::EKurulu)]
    fun kasa_bir_kez_kurulur() {
        let mut sc = ts::begin(KURUCU);
        let mut e = emir::yeni_test(sc.ctx());
        emir::kur<USDC>(&mut e, SUI_DOMAIN, DEFTER, sc.ctx());
        emir::kur<USDC>(&mut e, SUI_DOMAIN, DEFTER, sc.ctx());
        emir::paylas_test(e);
        sc.end();
    }
}
