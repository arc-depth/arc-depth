#[test_only]
module oft::emir_tests {
    use std::option;
    use std::string;
    use std::signer;
    use std::vector;
    use std::bcs;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::fungible_asset::{Self, Metadata, MintRef};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use oft::emir;
    use oft::kasa;
    use message_transmitter_v2::message_transmitter;
    use token_messenger_minter_v2::token_messenger_minter;
    use stablecoin_handler::handler;

    const APTOS: u32 = 9;
    const DEFTER: address = @0xa7c2;   // the Defter on Arc
    const ARC: u32 = 26;
    const ARC_TMM: address = @0xa7c0;   // Arc's TokenMessengerV2, as a 32-byte address
    const ARC_HABERCI: address = @0xa7c1;

    struct Basim has key { usdc: MintRef }

    fun w(v: u256): vector<u8> {
        let b = vector::empty<u8>();
        let i = 32;
        while (i > 0) { i = i - 1; vector::push_back(&mut b, (((v >> ((i * 8) as u8)) & 0xff) as u8)); };
        b
    }
    fun wa(a: address): vector<u8> { bcs::to_bytes(&a) }

    /// What the Arc HaberciLZ sends: abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri, uint256 miktar, uint256 beklenen)
    fun mesaj(kaynak: address, hedef: address, veri: vector<u8>, miktar: u256, beklenen: u256): vector<u8> {
        let m = wa(kaynak);
        vector::append(&mut m, wa(hedef));
        vector::append(&mut m, w(160));
        vector::append(&mut m, w(miktar));
        vector::append(&mut m, w(beklenen));
        let n = vector::length(&veri);
        vector::append(&mut m, w((n as u256)));
        vector::append(&mut m, veri);
        while (vector::length(&m) % 32 != 0) vector::push_back(&mut m, 0);
        m
    }
    /// abi.encode(uint8 AL, uint64 id, bytes32 varlik, uint256 ref)
    fun al_verisi(id: u64, varlik: address, refv: u256): vector<u8> {
        let v = w(2);
        vector::append(&mut v, w((id as u256)));
        vector::append(&mut v, wa(varlik));
        vector::append(&mut v, w(refv));
        v
    }
    /// abi.encode(uint8 SAT, uint64 id, bytes32[] varliklar, uint256 miktar, uint256 arz, uint32 hz, bytes32 alici)
    fun sat_verisi(id: u64, varlik: address, miktar: u256, arz: u256, hz: u32, alici: address): vector<u8> {
        let v = w(3);
        vector::append(&mut v, w((id as u256)));
        vector::append(&mut v, w(224));
        vector::append(&mut v, w(miktar));
        vector::append(&mut v, w(arz));
        vector::append(&mut v, w((hz as u256)));
        vector::append(&mut v, wa(alici));
        vector::append(&mut v, w(1));
        vector::append(&mut v, wa(varlik));
        v
    }

    fun jeton(yaratan: &signer, ad: vector<u8>): (Object<Metadata>, MintRef) {
        let c = object::create_named_object(yaratan, ad);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &c, option::none(), string::utf8(ad), string::utf8(ad), 6, string::utf8(b""), string::utf8(b""));
        (object::object_from_constructor_ref<Metadata>(&c), fungible_asset::generate_mint_ref(&c))
    }

    fun kur(fw: &signer, oft: &signer): (address, Object<Metadata>) {
        timestamp::set_time_has_started_for_testing(fw);
        timestamp::update_global_time_for_test_secs(1_800_000_000);
        account::create_account_for_test(signer::address_of(oft));
        let (usdc, mu) = jeton(oft, b"USDC");
        let (wapt, _mw) = jeton(oft, b"WAPT");
        emir::kur(oft, APTOS, usdc, DEFTER);
        move_to(oft, Basim { usdc: mu });
        (emir::kasa_adresi(), wapt)
    }

    fun dolar_gelir(miktar: u64) acquires Basim {
        let b = borrow_global<Basim>(@oft);
        primary_fungible_store::deposit(emir::dolar_adresi(), fungible_asset::mint(&b.usdc, miktar));
    }

    #[test(fw = @aptos_framework, oft = @oft)]
    fun dolarsiz_gelen_emir_bekler_dolar_gelince_isle_ihaleyi_acar(fw: &signer, oft: &signer) acquires Basim {
        let (k, wapt) = kur(fw, oft);
        emir::al_test(mesaj(DEFTER, k, al_verisi(1, object::object_address(&wapt), 4_000_000), 4_000_000, 3_900_000));
        assert!(emir::bekleyen() == 1, 0);
        assert!(kasa::ihale_sayisi(k) == 0, 1);
        dolar_gelir(3_800_000);           // under the least it may be: still waits
        emir::isle();
        assert!(emir::bekleyen() == 1, 2);
        dolar_gelir(150_000);             // 3.95: Circle's fee taken on the way
        emir::isle();
        assert!(emir::bekleyen() == 0, 3);
        assert!(kasa::ihale_sayisi(k) == 1, 4);
        assert!(kasa::dolar_bakiye(k, 1) == 3_950_000, 5);
    }

    #[test(fw = @aptos_framework, oft = @oft)]
    fun dolar_once_gelmisse_emir_hemen_islenir(fw: &signer, oft: &signer) acquires Basim {
        let (k, wapt) = kur(fw, oft);
        dolar_gelir(50_000_000);
        emir::al_test(mesaj(DEFTER, k, al_verisi(1, object::object_address(&wapt), 4_000_000), 50_000_000, 49_000_000));
        assert!(emir::bekleyen() == 0, 0);
        assert!(kasa::ihale_sayisi(k) == 1, 1);
        assert!(kasa::dolar_bakiye(k, 1) == 50_000_000, 2);
    }

    #[test(fw = @aptos_framework, oft = @oft)]
    fun itfa_emri_bekleyen_alimin_arkasinda_kalmaz(fw: &signer, oft: &signer) acquires Basim {
        let (k, wapt) = kur(fw, oft);
        let v = object::object_address(&wapt);
        dolar_gelir(50_000_000);
        emir::al_test(mesaj(DEFTER, k, al_verisi(1, v, 4_000_000), 50_000_000, 49_000_000));
        /* a second buy whose dollars are not here yet waits ... */
        emir::al_test(mesaj(DEFTER, k, al_verisi(1, v, 4_000_000), 50_000_000, 49_000_000));
        assert!(emir::bekleyen() == 1, 0);
        /* ... and a redemption still runs at once: a tenth of the launch's dollars here is paid out */
        emir::al_test(mesaj(DEFTER, k, sat_verisi(1, v, 1, 10, 26, @0xa11ce), 0, 0));
        assert!(kasa::dolar_bakiye(k, 1) < 50_000_000, 1);
        assert!(emir::bekleyen() == 1, 2);
    }

    #[test(fw = @aptos_framework, oft = @oft)]
    #[expected_failure(abort_code = 4, location = oft::emir)]
    fun yalniz_defter_emir_verir(fw: &signer, oft: &signer) {
        let (k, wapt) = kur(fw, oft);
        emir::al_test(mesaj(@0xbad, k, al_verisi(1, object::object_address(&wapt), 1), 0, 0));
    }

    #[test(fw = @aptos_framework, oft = @oft)]
    #[expected_failure(abort_code = 5, location = oft::emir)]
    fun yalniz_bu_kasa(fw: &signer, oft: &signer) {
        let (_k, wapt) = kur(fw, oft);
        emir::al_test(mesaj(DEFTER, @0xbad, al_verisi(1, object::object_address(&wapt), 1), 0, 0));
    }

    #[test(fw = @aptos_framework, oft = @oft)]
    #[expected_failure(abort_code = 1, location = oft::emir)]
    fun kurulum_bir_kez(fw: &signer, oft: &signer) {
        let (_k, wapt) = kur(fw, oft);
        emir::kur(oft, APTOS, wapt, DEFTER);
    }

    /* ---- CCTP: the order's dollars delivered by anyone, payouts burned out ---- */

    fun be32(v: u32): vector<u8> {
        let b = vector::empty<u8>();
        let i = 4;
        while (i > 0) { i = i - 1; vector::push_back(&mut b, (((v >> ((i * 8) as u8)) & 0xff) as u8)); };
        b
    }

    /// A plain burn on Arc (no destination caller) minted to `alici`.
    fun duz_yakim(nonce: u256, alici: address, miktar: u256): vector<u8> {
        let m = be32(1);
        vector::append(&mut m, be32(ARC));
        vector::append(&mut m, be32(APTOS));
        vector::append(&mut m, w(nonce));
        vector::append(&mut m, wa(ARC_TMM));
        vector::append(&mut m, wa(@token_messenger_minter_v2));
        vector::append(&mut m, wa(@0x0));
        vector::append(&mut m, be32(2000));
        vector::append(&mut m, be32(2000));
        vector::append(&mut m, be32(1));
        vector::append(&mut m, w(0xdc));
        vector::append(&mut m, wa(alici));
        vector::append(&mut m, w(miktar));
        vector::append(&mut m, wa(ARC_HABERCI));
        vector::append(&mut m, w(0));
        vector::append(&mut m, w(0));
        vector::append(&mut m, w(0));
        m
    }

    fun kur_cctp(fw: &signer, oft: &signer, mt: &signer, tmm: &signer, hnd: &signer): (address, Object<Metadata>) {
        timestamp::set_time_has_started_for_testing(fw);
        timestamp::update_global_time_for_test_secs(1_800_000_000);
        account::create_account_for_test(signer::address_of(oft));
        let c = object::create_named_object(oft, b"USDC");
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &c, option::none(), string::utf8(b"USDC"), string::utf8(b"USDC"), 6, string::utf8(b""), string::utf8(b""));
        let usdc = object::object_from_constructor_ref<Metadata>(&c);
        let (wapt, _mw) = jeton(oft, b"WAPT");
        message_transmitter::kur(mt, APTOS);
        token_messenger_minter::kur(tmm, usdc, vector[ARC_TMM]);
        handler::kur(hnd, fungible_asset::generate_mint_ref(&c));
        emir::kur(oft, APTOS, usdc, DEFTER);
        (emir::kasa_adresi(), wapt)
    }

    #[test(fw = @aptos_framework, oft = @oft, mt = @message_transmitter_v2, tmm = @token_messenger_minter_v2, hnd = @stablecoin_handler, arb = @0xa2b)]
    fun herkes_dolari_teslim_eder_ayni_islemde_ihale_acilir(fw: &signer, oft: &signer, mt: &signer, tmm: &signer, hnd: &signer, arb: &signer) {
        let (k, wapt) = kur_cctp(fw, oft, mt, tmm, hnd);
        emir::al_test(mesaj(DEFTER, k, al_verisi(1, object::object_address(&wapt), 4_000_000), 50_000_000, 49_000_000));
        assert!(emir::bekleyen() == 1, 0);
        emir::teslim(arb, duz_yakim(1, emir::dolar_adresi(), 50_000_000), vector[]);
        assert!(emir::bekleyen() == 0, 1);
        assert!(kasa::ihale_sayisi(k) == 1, 2);
        assert!(kasa::dolar_bakiye(k, 1) == 50_000_000, 3);
    }

    #[test(fw = @aptos_framework, oft = @oft, mt = @message_transmitter_v2, tmm = @token_messenger_minter_v2, hnd = @stablecoin_handler, arb = @0xa2b)]
    #[expected_failure(abort_code = 4, location = message_transmitter_v2::message_transmitter)]
    fun ayni_dolar_iki_kez_teslim_edilmez(fw: &signer, oft: &signer, mt: &signer, tmm: &signer, hnd: &signer, arb: &signer) {
        let (_k, _wapt) = kur_cctp(fw, oft, mt, tmm, hnd);
        emir::teslim(arb, duz_yakim(7, emir::dolar_adresi(), 1_000_000), vector[]);
        emir::teslim(arb, duz_yakim(7, emir::dolar_adresi(), 1_000_000), vector[]);
    }

    #[test(fw = @aptos_framework, oft = @oft, mt = @message_transmitter_v2, tmm = @token_messenger_minter_v2, hnd = @stablecoin_handler, arb = @0xa2b)]
    fun itfa_payi_baska_zincire_cctp_ile_yakilir(fw: &signer, oft: &signer, mt: &signer, tmm: &signer, hnd: &signer, arb: &signer) {
        let (k, wapt) = kur_cctp(fw, oft, mt, tmm, hnd);
        let v = object::object_address(&wapt);
        emir::teslim(arb, duz_yakim(2, emir::dolar_adresi(), 50_000_000), vector[]);
        emir::al_test(mesaj(DEFTER, k, al_verisi(1, v, 4_000_000), 50_000_000, 49_000_000));
        /* a tenth redeemed by a holder paid on Arc: the vault queues the dollar share as a payout */
        emir::al_test(mesaj(DEFTER, k, sat_verisi(1, v, 1, 10, ARC, @0xa11ce), 0, 0));
        assert!(handler::giden_sayisi() == 0, 0);
        emir::gideni_gonder(0);
        assert!(handler::giden_sayisi() == 1, 1);
        let (zincir, alici, _, miktar, _) = handler::giden_at(0);
        assert!(zincir == ARC && alici == @0xa11ce && miktar == 5_000_000, 2);
    }
}
