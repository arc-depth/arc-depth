#[test_only]
module sepet::haberci_tests {
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
    use message_transmitter_v2::message_transmitter;
    use token_messenger_minter_v2::token_messenger_minter;
    use stablecoin_handler::handler;
    use sepet::haberci;
    use sepet::kasa;

    const APTOS: u32 = 9;
    const ARC: u32 = 26;
    const BASE: u32 = 6;
    const ARC_TMM: address = @0xa7c0;       // Arc's TokenMessengerV2, as a 32-byte address
    const ARC_HABERCI: address = @0xa7c1;   // the twin Haberci on Arc
    const DEFTER: address = @0xa7c2;        // the Defter on Arc

    struct Basim has key { wapt: MintRef }

    /* ---- bytes, the way CCTP and the EVM write them ---- */

    fun be32(v: u32): vector<u8> {
        let b = vector::empty<u8>();
        let i = 4;
        while (i > 0) { i = i - 1; vector::push_back(&mut b, (((v >> ((i * 8) as u8)) & 0xff) as u8)); };
        b
    }
    fun w(v: u256): vector<u8> {
        let b = vector::empty<u8>();
        let i = 32;
        while (i > 0) { i = i - 1; vector::push_back(&mut b, (((v >> ((i * 8) as u8)) & 0xff) as u8)); };
        b
    }
    fun wa(a: address): vector<u8> { bcs::to_bytes(&a) }

    fun baslik(nonce: u256, gonderen: address, alici: address, cagiran: address): vector<u8> {
        let m = be32(1);
        vector::append(&mut m, be32(ARC));
        vector::append(&mut m, be32(APTOS));
        vector::append(&mut m, w(nonce));
        vector::append(&mut m, wa(gonderen));
        vector::append(&mut m, wa(alici));
        vector::append(&mut m, wa(cagiran));
        vector::append(&mut m, be32(2000));
        vector::append(&mut m, be32(2000));
        m
    }

    /// abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri)
    fun yuk(kaynak: address, hedef: address, veri: vector<u8>): vector<u8> {
        let y = wa(kaynak);
        vector::append(&mut y, wa(hedef));
        vector::append(&mut y, w(96));
        vector::append(&mut y, w((vector::length(&veri) as u256)));
        let n = vector::length(&veri);
        vector::append(&mut y, veri);
        while (n % 32 != 0) { vector::push_back(&mut y, 0); n = n + 1; };
        y
    }

    fun al_verisi(id: u64, varlik: address, refv: u256): vector<u8> {
        let v = w(2);
        vector::append(&mut v, w((id as u256)));
        vector::append(&mut v, wa(varlik));
        vector::append(&mut v, w(refv));
        v
    }

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

    /// A burn on Arc minted to the Haberci, with `kanca` as hook.
    fun yakim(nonce: u256, haberci_adr: address, tmm: address, miktar: u256, gonderen: address, kanca: vector<u8>): vector<u8> {
        let m = baslik(nonce, ARC_TMM, tmm, haberci_adr);
        vector::append(&mut m, be32(1));
        vector::append(&mut m, w(0xdc));                 // the burn token on Arc
        vector::append(&mut m, wa(haberci_adr));         // mint recipient
        vector::append(&mut m, w(miktar));
        vector::append(&mut m, wa(gonderen));            // message sender
        vector::append(&mut m, w(0));
        vector::append(&mut m, w(0));
        vector::append(&mut m, w(0));
        vector::append(&mut m, kanca);
        m
    }

    fun yalniz(nonce: u256, haberci_adr: address, gonderen: address, govde: vector<u8>): vector<u8> {
        let m = baslik(nonce, gonderen, haberci_adr, haberci_adr);
        vector::append(&mut m, govde);
        m
    }

    fun jeton(yaratan: &signer, ad: vector<u8>): (Object<Metadata>, MintRef) {
        let c = object::create_named_object(yaratan, ad);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &c, option::none(), string::utf8(ad), string::utf8(ad), 6, string::utf8(b""), string::utf8(b""));
        (object::object_from_constructor_ref<Metadata>(&c), fungible_asset::generate_mint_ref(&c))
    }

    fun kur(fw: &signer, yayinci: &signer, mt: &signer, tmm: &signer, hnd: &signer, arb: &signer): (address, address, Object<Metadata>, Object<Metadata>) {
        timestamp::set_time_has_started_for_testing(fw);
        timestamp::update_global_time_for_test_secs(1_800_000_000);
        account::create_account_for_test(signer::address_of(yayinci));
        account::create_account_for_test(signer::address_of(arb));
        let (usdc, mu) = jeton(yayinci, b"USDC");
        let (wapt, mw) = jeton(yayinci, b"WAPT");
        primary_fungible_store::deposit(signer::address_of(arb), fungible_asset::mint(&mw, 1_000_000_000_000));
        primary_fungible_store::deposit(signer::address_of(arb), fungible_asset::mint(&mu, 1_000_000_000_000));
        message_transmitter::kur(mt, APTOS);
        token_messenger_minter::kur(tmm, usdc, vector[ARC_TMM]);
        handler::kur(hnd, mu);
        let h = haberci::kur_ic(yayinci, APTOS, usdc, ARC, DEFTER);
        haberci::ikiz_ekle(yayinci, h, ARC, ARC_HABERCI);
        haberci::kilitle(yayinci, h);
        move_to(yayinci, Basim { wapt: mw });
        (h, haberci::kasa_adresi(h), usdc, wapt)
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, mt = @message_transmitter_v2, tmm = @token_messenger_minter_v2, hnd = @stablecoin_handler, arb = @0xa2b)]
    fun arcdan_dolarli_emir_kasada_alim_acar(fw: &signer, yayinci: &signer, mt: &signer, tmm: &signer, hnd: &signer, arb: &signer) {
        let (h, k, _usdc, wapt) = kur(fw, yayinci, mt, tmm, hnd, arb);
        let veri = al_verisi(1, object::object_address(&wapt), 4_000_000);
        let m = yakim(1, h, @token_messenger_minter_v2, 4_000_000, ARC_HABERCI, yuk(DEFTER, k, veri));
        haberci::teslim(arb, h, m, vector::empty());
        assert!(kasa::dolar_bakiye(k, 1) == 4_000_000, 0);
        assert!(kasa::ihale_sayisi(k) == 1, 1);
        assert!(kasa::istenen(k, 0) == 8_000_000, 2);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, mt = @message_transmitter_v2, tmm = @token_messenger_minter_v2, hnd = @stablecoin_handler, arb = @0xa2b)]
    #[expected_failure(abort_code = 7, location = sepet::haberci)]
    fun ikiz_bir_kez_yazilir(fw: &signer, yayinci: &signer, mt: &signer, tmm: &signer, hnd: &signer, arb: &signer) {
        timestamp::set_time_has_started_for_testing(fw);
        let _ = mt; let _ = tmm; let _ = hnd; let _ = arb;
        account::create_account_for_test(signer::address_of(yayinci));
        let (usdc, _mu) = jeton(yayinci, b"USDC");
        let h = haberci::kur_ic(yayinci, APTOS, usdc, ARC, DEFTER);
        haberci::ikiz_ekle(yayinci, h, ARC, ARC_HABERCI);
        haberci::ikiz_ekle(yayinci, h, ARC, @0xbad);
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, mt = @message_transmitter_v2, tmm = @token_messenger_minter_v2, hnd = @stablecoin_handler, arb = @0xa2b)]
    #[expected_failure(abort_code = 3, location = sepet::haberci)]
    fun ikiz_olmayanin_yakimi_reddedilir(fw: &signer, yayinci: &signer, mt: &signer, tmm: &signer, hnd: &signer, arb: &signer) {
        let (h, k, _usdc, wapt) = kur(fw, yayinci, mt, tmm, hnd, arb);
        let veri = al_verisi(1, object::object_address(&wapt), 4_000_000);
        let m = yakim(1, h, @token_messenger_minter_v2, 4_000_000, @0xbad, yuk(DEFTER, k, veri));
        haberci::teslim(arb, h, m, vector::empty());
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, mt = @message_transmitter_v2, tmm = @token_messenger_minter_v2, hnd = @stablecoin_handler, arb = @0xa2b)]
    #[expected_failure(abort_code = 4, location = sepet::haberci)]
    fun defter_disindan_emir_reddedilir(fw: &signer, yayinci: &signer, mt: &signer, tmm: &signer, hnd: &signer, arb: &signer) {
        let (h, k, _usdc, wapt) = kur(fw, yayinci, mt, tmm, hnd, arb);
        let veri = al_verisi(1, object::object_address(&wapt), 4_000_000);
        // the twin's burn, but the payload names a stranger as the original sender
        let m = yakim(1, h, @token_messenger_minter_v2, 4_000_000, ARC_HABERCI, yuk(@0xbad, k, veri));
        haberci::teslim(arb, h, m, vector::empty());
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, mt = @message_transmitter_v2, tmm = @token_messenger_minter_v2, hnd = @stablecoin_handler, arb = @0xa2b)]
    #[expected_failure(abort_code = 4, location = message_transmitter_v2::message_transmitter)]
    fun ayni_mesaj_iki_kez_teslim_edilemez(fw: &signer, yayinci: &signer, mt: &signer, tmm: &signer, hnd: &signer, arb: &signer) {
        let (h, k, _usdc, wapt) = kur(fw, yayinci, mt, tmm, hnd, arb);
        let veri = al_verisi(1, object::object_address(&wapt), 4_000_000);
        let m = yakim(1, h, @token_messenger_minter_v2, 4_000_000, ARC_HABERCI, yuk(DEFTER, k, veri));
        haberci::teslim(arb, h, copy m, vector::empty());
        haberci::teslim(arb, h, m, vector::empty());
    }

    #[test(fw = @aptos_framework, yayinci = @sepet, mt = @message_transmitter_v2, tmm = @token_messenger_minter_v2, hnd = @stablecoin_handler, arb = @0xa2b)]
    fun itfa_emri_satar_ve_baska_zincire_odemeyi_cctp_ile_yollar(fw: &signer, yayinci: &signer, mt: &signer, tmm: &signer, hnd: &signer, arb: &signer) {
        let (h, k, _usdc, wapt) = kur(fw, yayinci, mt, tmm, hnd, arb);
        let wa_adr = object::object_address(&wapt);
        haberci::teslim(arb, h, yakim(1, h, @token_messenger_minter_v2, 4_000_000, ARC_HABERCI, yuk(DEFTER, k, al_verisi(1, wa_adr, 4_000_000))), vector::empty());
        timestamp::update_global_time_for_test_secs(timestamp::now_seconds() + 1800);
        kasa::doldur_alim(arb, k, 0, 4_000_000);
        // a payload alone from the twin: 10% of a 1e27 supply, paid on Base
        let sat = sat_verisi(1, wa_adr, 100_000_000_000_000_000_000_000_000, 1_000_000_000_000_000_000_000_000_000, BASE, @0xb0b);
        haberci::teslim(arb, h, yalniz(2, h, ARC_HABERCI, yuk(DEFTER, k, sat)), vector::empty());
        assert!(kasa::bakiye(k, 1, wa_adr) == 3_600_000, 0);
        timestamp::update_global_time_for_test_secs(timestamp::now_seconds() + 1800);
        kasa::doldur_satim(arb, k, 1, kasa::istenen(k, 1));
        assert!(kasa::giden_sayisi(k) == 1, 1);
        haberci::gideni_gonder(h, 0);
        assert!(handler::giden_sayisi() == 1, 2);
        let (domain, alici, cagiran, miktar, kanca) = handler::giden_at(0);
        assert!(domain == BASE && alici == @0xb0b && cagiran == @0x0, 3);
        assert!(miktar == 400_000 && vector::length(&kanca) == 0, 4);
    }
}
