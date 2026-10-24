#[test_only]
module oft::kapi_tests {
    use std::account::create_signer_for_test;
    use std::bcs;
    use std::signer;
    use std::string;
    use std::vector;
    use aptos_framework::account;
    use aptos_framework::fungible_asset;
    use aptos_framework::object;
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;
    use oft::kapi;
    use oft::oapp_core;

    const APTOS_EID: u32 = 30108;
    const BASE_EID: u32 = 30184;
    const TOKEN: address = @0x44ddc45c7a3a8f2a4c2433c19e31b05261778a23;   // a launch token on Arc
    const HOP: address = @0xba5e;

    fun w(v: u256): vector<u8> {
        let b = vector::empty<u8>();
        let i = 32;
        while (i > 0) { i = i - 1; vector::push_back(&mut b, (((v >> ((i * 8) as u8)) & 0xff) as u8)); };
        b
    }
    fun pad(m: &mut vector<u8>) { while (vector::length(m) % 32 != 0) vector::push_back(m, 0); }

    /// abi.encode(uint8 1, address token, string ad, string sembol)
    fun yarat(token: address, ad: vector<u8>, sembol: vector<u8>): vector<u8> {
        let m = w(1);
        vector::append(&mut m, bcs::to_bytes(&token));
        vector::append(&mut m, w(128));
        let a = w((vector::length(&ad) as u256));
        vector::append(&mut a, ad);
        pad(&mut a);
        vector::append(&mut m, w(128 + (vector::length(&a) as u256)));
        vector::append(&mut m, a);
        vector::append(&mut m, w((vector::length(&sembol) as u256)));
        vector::append(&mut m, sembol);
        pad(&mut m);
        m
    }
    /// abi.encode(uint8 2, address token, bytes32 alici, uint256 miktar)
    fun tasi(token: address, alici: address, miktar: u256): vector<u8> {
        let m = w(2);
        vector::append(&mut m, bcs::to_bytes(&token));
        vector::append(&mut m, bcs::to_bytes(&alici));
        vector::append(&mut m, w(miktar));
        m
    }

    fun kur(oft: &signer) {
        let lz = &create_signer_for_test(@layerzero_admin);
        timestamp::set_time_has_started_for_testing(&create_signer_for_test(@std));
        endpoint_v2_common::native_token_test_helpers::initialize_native_token_for_test();
        endpoint_v2_common::universal_config::init_module_for_test(APTOS_EID);
        endpoint_v2::admin::initialize_endpoint_for_test();
        simple_msglib::msglib::initialize_for_test();
        endpoint_v2::admin::register_library(lz, @simple_msglib);
        endpoint_v2::admin::set_default_send_library(lz, BASE_EID, @simple_msglib);
        endpoint_v2::admin::set_default_receive_library(lz, BASE_EID, @simple_msglib, 0);
        oft::oapp_store::init_module_for_test();
        oft::oapp_receive::init_module_for_test();
        account::create_account_for_test(signer::address_of(oft));
        let yon = &create_signer_for_test(@oft_admin);
        oapp_core::set_peer(yon, BASE_EID, bcs::to_bytes(&HOP));
        /* type 3, executor lzReceive: 200k gas */
        oapp_core::set_enforced_options(yon, BASE_EID, 1, x"0003010011010000000000000000000000000000030d40");
        kapi::kur(oft, BASE_EID);
    }

    #[test(oft = @oft)]
    fun yarat_ikizi_bilinen_adreste_kurar_tasi_basar(oft: &signer) {
        kur(oft);
        let beklenen = kapi::ikiz_adresi(TOKEN);
        assert!(!kapi::ikiz_var(TOKEN), 0);
        kapi::al_test(yarat(TOKEN, b"Pulse Test", b"PTEST1"));
        assert!(kapi::ikiz_var(TOKEN), 1);
        let meta = kapi::ikiz_meta(TOKEN);
        assert!(object::object_address(&meta) == beklenen, 2);
        assert!(fungible_asset::name(meta) == string::utf8(b"Pulse Test"), 3);
        assert!(fungible_asset::symbol(meta) == string::utf8(b"PTEST1"), 4);
        assert!(fungible_asset::decimals(meta) == 6, 5);
        kapi::al_test(tasi(TOKEN, @0xa11ce, 4_000_000));
        assert!(primary_fungible_store::balance(@0xa11ce, meta) == 4_000_000, 6);
        assert!(option_supply(meta) == 4_000_000, 7);
    }

    fun option_supply(meta: object::Object<fungible_asset::Metadata>): u128 {
        let s = fungible_asset::supply(meta);
        std::option::extract(&mut s)
    }

    #[test(oft = @oft)]
    fun ikinci_yarat_hicbir_seyi_degistirmez(oft: &signer) {
        kur(oft);
        kapi::al_test(yarat(TOKEN, b"Pulse Test", b"PTEST1"));
        kapi::al_test(tasi(TOKEN, @0xa11ce, 7));
        kapi::al_test(yarat(TOKEN, b"Other", b"OTH"));
        let meta = kapi::ikiz_meta(TOKEN);
        assert!(fungible_asset::symbol(meta) == string::utf8(b"PTEST1"), 0);
        assert!(primary_fungible_store::balance(@0xa11ce, meta) == 7, 1);
    }

    #[test(oft = @oft)]
    fun uzun_ad_karakter_sinirinda_kesilir(oft: &signer) {
        kur(oft);
        /* 31 ASCII bytes then a 2-byte character: the cut at 32 falls inside it */
        let ad = b"abcdefghijklmnopqrstuvwxyz01234";
        vector::append(&mut ad, x"c3bc");
        let sembol = b"SEMBOLSEMBOL";
        kapi::al_test(yarat(TOKEN, ad, sembol));
        let meta = kapi::ikiz_meta(TOKEN);
        assert!(fungible_asset::name(meta) == string::utf8(b"abcdefghijklmnopqrstuvwxyz01234"), 0);
        assert!(fungible_asset::symbol(meta) == string::utf8(b"SEMBOLSEMB"), 1);
    }

    #[test(oft = @oft)]
    fun utf8_olmayan_ad_bos_olur_ikiz_yine_kurulur(oft: &signer) {
        kur(oft);
        kapi::al_test(yarat(TOKEN, x"ff", b"X"));
        assert!(fungible_asset::name(kapi::ikiz_meta(TOKEN)) == string::utf8(b""), 0);
    }

    #[test(oft = @oft)]
    #[expected_failure(abort_code = 5, location = oft::kapi)]
    fun ikizden_once_gelen_tasi_bekler(oft: &signer) {
        kur(oft);
        kapi::al_test(tasi(TOKEN, @0xa11ce, 1));
    }

    #[test(oft = @oft)]
    fun gonder_yakar_ve_merkeze_tam_mesaji_yollar(oft: &signer) {
        kur(oft);
        kapi::al_test(yarat(TOKEN, b"Pulse Test", b"PTEST1"));
        let u = &create_signer_for_test(@0xa11ce);
        account::create_account_for_test(@0xa11ce);
        kapi::al_test(tasi(TOKEN, @0xa11ce, 10_000_000));
        let meta = kapi::ikiz_meta(TOKEN);
        let arc_alici = bcs::to_bytes(&@0xa7c0);
        let istek = x"0102030405";
        assert!(kapi::ucret(TOKEN, arc_alici, 3_000_000, istek) == 0, 0);   // simple msglib: free
        kapi::gonder(u, TOKEN, arc_alici, 3_000_000, istek, 0);
        assert!(primary_fungible_store::balance(@0xa11ce, meta) == 7_000_000, 1);
        assert!(option_supply(meta) == 7_000_000, 2);
        /* what IkizHub decodes: (uint8, address, bytes32, uint256, bytes) */
        let m = kapi::giden_test(TOKEN, arc_alici, 3_000_000, istek);
        let beklenen = w(2);
        vector::append(&mut beklenen, bcs::to_bytes(&TOKEN));
        vector::append(&mut beklenen, arc_alici);
        vector::append(&mut beklenen, w(3_000_000));
        vector::append(&mut beklenen, w(160));
        vector::append(&mut beklenen, w(5));
        vector::append(&mut beklenen, istek);
        pad(&mut beklenen);
        assert!(m == beklenen, 3);
    }

    #[test(oft = @oft)]
    #[expected_failure]
    fun sahip_olmadigi_ikizi_gonderemez(oft: &signer) {
        kur(oft);
        kapi::al_test(yarat(TOKEN, b"Pulse Test", b"PTEST1"));
        kapi::al_test(tasi(TOKEN, @0xa11ce, 10));
        let b = &create_signer_for_test(@0xb0b);
        account::create_account_for_test(@0xb0b);
        kapi::gonder(b, TOKEN, bcs::to_bytes(&@0xa7c0), 5, vector[], 0);
    }

    #[test(oft = @oft)]
    #[expected_failure(abort_code = 7, location = oft::kapi)]
    fun bos_aliciya_gonderilemez(oft: &signer) {
        kur(oft);
        kapi::al_test(yarat(TOKEN, b"Pulse Test", b"PTEST1"));
        let u = &create_signer_for_test(@0xa11ce);
        account::create_account_for_test(@0xa11ce);
        kapi::al_test(tasi(TOKEN, @0xa11ce, 10));
        kapi::gonder(u, TOKEN, w(0), 5, vector[], 0);
    }
}
