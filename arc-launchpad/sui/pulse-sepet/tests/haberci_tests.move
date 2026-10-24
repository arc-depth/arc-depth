#[test_only]
module sepet::haberci_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock;
    use sui::coin::{Self, Coin};
    use sui::bcs;
    use message_transmitter_v2::state::{Self as mts, State};
    use message_transmitter_v2::receive_message as rm;
    use token_messenger_minter_v2::deposit_for_burn as dfb;
    use sepet::haberci::{Self, Haberci};
    use sepet::kasa::{Self, Kasa};

    public struct USDC has drop {}
    public struct WSUI has drop {}
    public struct MEME has drop {}

    const SUI_D: u32 = 8;
    const ARC: u32 = 26;
    const BASE: u32 = 6;
    const ARC_HABERCI: address = @0xa7c1;
    const DEFTER: address = @0xa7c2;
    const KURUCU: address = @0xc0;
    const ARB: address = @0xa2b;

    fun be32(v: u32): vector<u8> { let mut b = vector[]; let mut i: u64 = 4; while (i > 0) { i = i - 1; b.push_back((((v >> ((i * 8) as u8)) & 0xff) as u8)); }; b }
    fun w(v: u256): vector<u8> { let mut b = vector[]; let mut i: u64 = 32; while (i > 0) { i = i - 1; b.push_back((((v >> ((i * 8) as u8)) & 0xff) as u8)); }; b }
    fun wa(a: address): vector<u8> { bcs::to_bytes(&a) }

    fun mesaj(nonce: u256, gonderen: address, yuk: vector<u8>): vector<u8> {
        let y = haberci::yetki_kimligi();
        let mut m = be32(1);
        m.append(be32(ARC)); m.append(be32(SUI_D)); m.append(w(nonce));
        m.append(wa(gonderen)); m.append(wa(y)); m.append(wa(y));
        m.append(be32(2000)); m.append(be32(2000));
        m.append(yuk);
        m
    }

    /// abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri, uint256 dolar)
    fun yuk(kaynak: address, hedef: address, veri: vector<u8>, dolar: u256): vector<u8> {
        let mut y = wa(kaynak);
        y.append(wa(hedef)); y.append(w(128)); y.append(w(dolar)); y.append(w((veri.length() as u256)));
        let mut n = veri.length();
        y.append(veri);
        while (n % 32 != 0) { y.push_back(0); n = n + 1; };
        y
    }

    fun al_verisi(id: u64, varlik: address, refv: u256): vector<u8> {
        let mut v = w(2); v.append(w((id as u256))); v.append(wa(varlik)); v.append(w(refv)); v
    }

    fun sat_verisi(id: u64, varlik: address, miktar: u256, arz: u256, hz: u32, alici: address): vector<u8> {
        let mut v = w(3); v.append(w((id as u256))); v.append(w(224)); v.append(w(miktar)); v.append(w(arz));
        v.append(w((hz as u256))); v.append(wa(alici)); v.append(w(1)); v.append(wa(varlik)); v
    }

    fun kur(sc: &mut Scenario) {
        mts::yeni_paylasilan(SUI_D, sc.ctx());
        haberci::kur<USDC>(SUI_D, ARC, DEFTER, sc.ctx());
        sc.next_tx(KURUCU);
        let mut h = sc.take_shared<Haberci>();
        haberci::ikiz_ekle(&mut h, ARC, ARC_HABERCI, sc.ctx());
        haberci::kilitle(&mut h, sc.ctx());
        ts::return_shared(h);
    }

    /// A twin is written once: the second ikiz_ekle for a chain aborts.
    #[test]
    #[expected_failure(abort_code = sepet::haberci::EZatenBagli)]
    fun ikiz_bir_kez_yazilir() {
        let mut sc = ts::begin(KURUCU);
        mts::yeni_paylasilan(SUI_D, sc.ctx());
        haberci::kur<USDC>(SUI_D, ARC, DEFTER, sc.ctx());
        sc.next_tx(KURUCU);
        let mut h = sc.take_shared<Haberci>();
        haberci::ikiz_ekle(&mut h, ARC, ARC_HABERCI, sc.ctx());
        haberci::ikiz_ekle(&mut h, ARC, @0xbad, sc.ctx());
        ts::return_shared(h);
        sc.end();
    }

    /// The PTB, end to end, for one message.
    fun teslim(sc: &mut Scenario, m: vector<u8>) {
        let mut st = sc.take_shared<State>();
        let h = sc.take_shared<Haberci>();
        let mut k = sc.take_shared<Kasa<USDC>>();
        let r = rm::receive_message_with_package_auth(haberci::bilet(m, vector[]), &mut st);
        let s = haberci::isle(&h, &mut k, r);
        let z = rm::stamp_receipt(s, &st);
        rm::complete_receive_message(z, &st);
        ts::return_shared(st);
        ts::return_shared(h);
        ts::return_shared(k);
    }

    #[test]
    fun emir_iki_adimda_dolar_gelince_alim_acar() {
        let mut sc = ts::begin(KURUCU);
        kur(&mut sc);
        sc.next_tx(ARB);
        let k0 = sc.take_shared<Kasa<USDC>>();
        let kasa_adr = kasa::kimlik(&k0);
        ts::return_shared(k0);
        sc.next_tx(ARB);
        teslim(&mut sc, mesaj(1, ARC_HABERCI, yuk(DEFTER, kasa_adr, al_verisi(1, kasa::tip_kimligi<WSUI>(), 4_000_000), 4_000_000)));
        // the plain burn: CCTP mints the dollars to the vault object
        transfer::public_transfer(coin::mint_for_testing<USDC>(4_000_000, sc.ctx()), kasa_adr);
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        let c = clock::create_for_testing(sc.ctx());
        let bilet = ts::most_recent_receiving_ticket<Coin<USDC>>(&object::id_from_address(kasa_adr));
        kasa::kabul(&mut k, bilet);
        assert!(kasa::havuz(&k) == 4_000_000, 0);
        assert!(kasa::emir_sayisi(&k) == 1, 1);
        kasa::uygula_al<USDC, WSUI>(&mut k, 0, &c);
        assert!(kasa::dolar_bakiye(&k, 1) == 4_000_000 && kasa::havuz(&k) == 0, 2);
        assert!(kasa::istenen(&k, 0, &c) == 8_000_000, 3);
        ts::return_shared(k);
        c.destroy_for_testing();
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = sepet::kasa::EYanlisCoin)]
    fun yanlis_tiple_uygulanamaz() {
        let mut sc = ts::begin(KURUCU);
        kur(&mut sc);
        sc.next_tx(ARB);
        let k0 = sc.take_shared<Kasa<USDC>>();
        let kasa_adr = kasa::kimlik(&k0);
        ts::return_shared(k0);
        sc.next_tx(ARB);
        teslim(&mut sc, mesaj(1, ARC_HABERCI, yuk(DEFTER, kasa_adr, al_verisi(1, kasa::tip_kimligi<WSUI>(), 4_000_000), 4_000_000)));
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        let c = clock::create_for_testing(sc.ctx());
        kasa::uygula_al<USDC, MEME>(&mut k, 0, &c);
        ts::return_shared(k);
        c.destroy_for_testing();
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = sepet::kasa::EHavuzYetersiz)]
    fun dolar_gelmeden_alim_acilmaz() {
        let mut sc = ts::begin(KURUCU);
        kur(&mut sc);
        sc.next_tx(ARB);
        let k0 = sc.take_shared<Kasa<USDC>>();
        let kasa_adr = kasa::kimlik(&k0);
        ts::return_shared(k0);
        sc.next_tx(ARB);
        teslim(&mut sc, mesaj(1, ARC_HABERCI, yuk(DEFTER, kasa_adr, al_verisi(1, kasa::tip_kimligi<WSUI>(), 4_000_000), 4_000_000)));
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        let c = clock::create_for_testing(sc.ctx());
        kasa::uygula_al<USDC, WSUI>(&mut k, 0, &c);
        ts::return_shared(k);
        c.destroy_for_testing();
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = sepet::haberci::EKotuMesaj)]
    fun ikiz_olmayanin_mesaji_reddedilir() {
        let mut sc = ts::begin(KURUCU);
        kur(&mut sc);
        sc.next_tx(ARB);
        teslim(&mut sc, mesaj(1, @0xbad, yuk(DEFTER, @0x1, al_verisi(1, @0x2, 1), 1)));
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = sepet::haberci::ESadeceDefter)]
    fun defter_disindan_emir_reddedilir() {
        let mut sc = ts::begin(KURUCU);
        kur(&mut sc);
        sc.next_tx(ARB);
        teslim(&mut sc, mesaj(1, ARC_HABERCI, yuk(@0xbad, @0x1, al_verisi(1, @0x2, 1), 1)));
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = 4, location = message_transmitter_v2::state)]
    fun ayni_mesaj_iki_kez_teslim_edilemez() {
        let mut sc = ts::begin(KURUCU);
        kur(&mut sc);
        sc.next_tx(ARB);
        let k0 = sc.take_shared<Kasa<USDC>>();
        let kasa_adr = kasa::kimlik(&k0);
        ts::return_shared(k0);
        sc.next_tx(ARB);
        let m = mesaj(1, ARC_HABERCI, yuk(DEFTER, kasa_adr, al_verisi(1, kasa::tip_kimligi<WSUI>(), 4_000_000), 4_000_000));
        teslim(&mut sc, m);
        sc.next_tx(ARB);
        teslim(&mut sc, m);
        sc.end();
    }

    #[test]
    fun itfa_emri_satar_ve_odemeyi_kilitli_yakim_biletiyle_yollar() {
        let mut sc = ts::begin(KURUCU);
        kur(&mut sc);
        sc.next_tx(ARB);
        let k0 = sc.take_shared<Kasa<USDC>>();
        let kasa_adr = kasa::kimlik(&k0);
        ts::return_shared(k0);
        sc.next_tx(ARB);
        teslim(&mut sc, mesaj(1, ARC_HABERCI, yuk(DEFTER, kasa_adr, al_verisi(1, kasa::tip_kimligi<WSUI>(), 4_000_000), 4_000_000)));
        transfer::public_transfer(coin::mint_for_testing<USDC>(4_000_000, sc.ctx()), kasa_adr);
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        let mut c = clock::create_for_testing(sc.ctx());
        kasa::kabul(&mut k, ts::most_recent_receiving_ticket<Coin<USDC>>(&object::id_from_address(kasa_adr)));
        kasa::uygula_al<USDC, WSUI>(&mut k, 0, &c);
        c.increment_for_testing(1_800_000);
        let d = kasa::doldur_alim<USDC, WSUI>(&mut k, 0, coin::mint_for_testing(4_000_000, sc.ctx()), &c, sc.ctx());
        coin::burn_for_testing(d);
        ts::return_shared(k);
        c.destroy_for_testing();
        sc.next_tx(ARB);
        // 10% of a 1e27 supply, paid on Base
        teslim(&mut sc, mesaj(2, ARC_HABERCI, yuk(DEFTER, kasa_adr,
            sat_verisi(1, kasa::tip_kimligi<WSUI>(), 100_000_000_000_000_000_000_000_000, 1_000_000_000_000_000_000_000_000_000, BASE, @0xb0b), 0)));
        sc.next_tx(ARB);
        let mut k = sc.take_shared<Kasa<USDC>>();
        let mut c = clock::create_for_testing(sc.ctx());
        kasa::uygula_sat<USDC, WSUI>(&mut k, 1, &c, sc.ctx());
        assert!(kasa::bakiye<USDC, WSUI>(&k, 1) == 3_600_000, 0);
        c.increment_for_testing(3_600_000);
        let ist = kasa::istenen(&k, 1, &c);
        let u = kasa::doldur_satim<USDC, WSUI>(&mut k, 1, coin::mint_for_testing(ist, sc.ctx()), &c, sc.ctx());
        coin::burn_for_testing(u);
        assert!(kasa::giden_sayisi(&k) == 1, 1);
        let bilet = haberci::gideni_gonder(&mut k, 0, sc.ctx());
        let (domain, alici, miktar) = dfb::deposit_for_burn_with_package_auth(bilet);
        assert!(domain == BASE && alici == @0xb0b && miktar == ist, 2);
        ts::return_shared(k);
        c.destroy_for_testing();
        sc.end();
    }
}
