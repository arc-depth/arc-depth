#[test_only]
module oft::kapi_tests {
    use std::option;
    use std::signer;
    use std::string::utf8;
    use std::vector;
    use aptos_framework::account;
    use aptos_framework::fungible_asset::{Self, Metadata};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;
    use oft::kapi;

    /* the vectors are encoded by ethers (EVM AbiCoder), not by this module */
    const M: vector<u8> = x"0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000000000000000000000000000a11ce00000000000000000000000000000000000000000000000000000000000b0b0100000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000002625a00000000000000000000000000000000000000000000000000000000000000000";
    const TASI: vector<u8> = x"000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000000000000000000000000000a11ce00000000000000000000000000000000000000000000000000000000000b0b0100000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000002625a00000000000000000000000000000000000000000000000000000000000000000";
    const ODENDI: vector<u8> = x"0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000000000000001abababababababababababababababababababababababababababababababab";
    const BNB: u32 = 30102;

    fun usdc(yayinci: &signer, doldurucu: address): Object<Metadata> {
        let c = object::create_named_object(yayinci, b"USDC");
        primary_fungible_store::create_primary_store_enabled_fungible_asset(&c, option::none(), utf8(b"USDC"), utf8(b"USDC"), 6, utf8(b""), utf8(b""));
        let mint = fungible_asset::generate_mint_ref(&c);
        primary_fungible_store::mint(&mint, doldurucu, 10_000_000);
        object::object_from_constructor_ref<Metadata>(&c)
    }

    #[test(oft = @oft, dold = @0xd01d)]
    fun bnb_emri_bekler_doldurulur_tutucu_odenir(oft: &signer, dold: &signer) {
        account::create_account_for_test(signer::address_of(dold));
        let d = usdc(oft, signer::address_of(dold));
        kapi::kur(oft, d);
        kapi::al_test(BNB, TASI);
        assert!(kapi::bekliyor_mu(BNB, 7), 0);
        let alacakli = vector[]; let i = 0; while (i < 32) { vector::push_back(&mut alacakli, 0xab); i = i + 1; };
        kapi::doldur(dold, BNB, M, alacakli);
        assert!(!kapi::bekliyor_mu(BNB, 7), 1);
        assert!(primary_fungible_store::balance(@0xb0b01, d) == 2_500_000, 2);
        assert!(primary_fungible_store::balance(signer::address_of(dold), d) == 7_500_000, 3);
    }

    #[test(oft = @oft, dold = @0xd01d)]
    #[expected_failure(abort_code = 2, location = oft::kapi)]
    fun ikinci_dolum_reddedilir(oft: &signer, dold: &signer) {
        account::create_account_for_test(signer::address_of(dold));
        let d = usdc(oft, signer::address_of(dold));
        kapi::kur(oft, d);
        kapi::al_test(BNB, TASI);
        let alacakli = vector[]; let i = 0; while (i < 32) { vector::push_back(&mut alacakli, 0xab); i = i + 1; };
        kapi::doldur(dold, BNB, M, alacakli);
        kapi::doldur(dold, BNB, M, alacakli);
    }

    #[test(oft = @oft, dold = @0xd01d)]
    #[expected_failure(abort_code = 2, location = oft::kapi)]
    fun gelmemis_emir_doldurulamaz(oft: &signer, dold: &signer) {
        account::create_account_for_test(signer::address_of(dold));
        let d = usdc(oft, signer::address_of(dold));
        kapi::kur(oft, d);
        let alacakli = vector[]; let i = 0; while (i < 32) { vector::push_back(&mut alacakli, 0xab); i = i + 1; };
        kapi::doldur(dold, BNB, M, alacakli);
    }

    #[test]
    fun makbuz_evm_kodlamasiyla_ayni() {
        let a = vector[]; let i = 0; while (i < 32) { vector::push_back(&mut a, 0xab); i = i + 1; };
        assert!(kapi::odendi_mesaji(&vector[7u64], &vector[a]) == ODENDI, 0);
    }
}
