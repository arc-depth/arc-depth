/// ARC PULSE basket receiver on Aptos: the Aptos counterpart of
/// contracts/sepet/HaberciCctp.sol, over Circle CCTP V2.
///
/// A message from the Defter (Arc) arrives as one CCTP message: dollars
/// with a hook (a burn) or a payload alone. This module is the message's
/// destinationCaller, so only it can submit it; it accepts only messages
/// whose sender on the source chain is the twin Haberci there, and passes
/// to the vault only orders whose original sender is the Defter. The
/// payload is the EVM Haberci's own encoding, abi.encode(bytes32 kaynak,
/// bytes32 hedef, bytes veri), decoded here word by word.
///
/// Like the vault, the Haberci object belongs to 0xdead from birth: the
/// dollars CCTP mints to it can leave only through this module.
module sepet::haberci {
    use std::signer;
    use std::vector;
    use std::option::{Self, Option};
    use aptos_std::table::{Self, Table};
    use aptos_std::from_bcs;
    use aptos_framework::object::{Self, ExtendRef};
    use aptos_framework::fungible_asset::Metadata;
    use aptos_framework::primary_fungible_store;
    use message_transmitter_v2::message_transmitter;
    use token_messenger_minter_v2::token_messenger_minter;
    use stablecoin_handler::handler;
    use sepet::kasa;
    use dex::pool_v3::{Self, LiquidityPoolV3};

    const AL: u8 = 2;
    const SAT: u8 = 3;
    const KESINLIK: u32 = 2000;

    const ESadeceKurucu: u64 = 1;
    const EIkizYok: u64 = 2;
    const EKotuMesaj: u64 = 3;
    const ESadeceDefter: u64 = 4;
    const EKesinlik: u64 = 5;
    const EZatenBagli: u64 = 7;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct Haberci has key {
        ref: ExtendRef,
        domain: u32,
        dolar: object::Object<Metadata>,
        kasa: address,
        defter_zincir: u32,
        defter: address,
        ikiz: Table<u32, address>,
        kurucu: Option<address>,
    }

    /// The vault and its Haberci, wired together. The publisher may name the
    /// twins (`ikiz_ekle`) and then locks it for good (`kilitle`).
    public entry fun kur(yayinci: &signer, domain: u32, dolar: object::Object<Metadata>, defter_zincir: u32, defter: address) {
        kur_ic(yayinci, domain, dolar, defter_zincir, defter);
    }

    public(package) fun kur_ic(yayinci: &signer, domain: u32, dolar: object::Object<Metadata>, defter_zincir: u32, defter: address): address {
        let kasa_adr = kasa::kur(yayinci, domain, dolar);
        let ctor = object::create_object(signer::address_of(yayinci));
        let s = object::generate_signer(&ctor);
        object::disable_ungated_transfer(&object::generate_transfer_ref(&ctor));
        move_to(&s, Haberci {
            ref: object::generate_extend_ref(&ctor), domain, dolar, kasa: kasa_adr, defter_zincir, defter,
            ikiz: table::new(), kurucu: option::some(signer::address_of(yayinci)),
        });
        let lt = object::generate_linear_transfer_ref(&object::generate_transfer_ref(&ctor));
        object::transfer_with_ref(lt, @0xdead);
        aptos_framework::event::emit(Kuruldu { haberci: signer::address_of(&s), kasa: kasa_adr });
        signer::address_of(&s)
    }

    #[event] struct Kuruldu has drop, store { haberci: address, kasa: address }
    #[event] struct Teslim has drop, store { kaynak_zincir: u32, dolar: u64, tur: u8 }

    public entry fun ikiz_ekle(k: &signer, haberci: address, domain: u32, karsi: address) acquires Haberci {
        let h = borrow_global_mut<Haberci>(haberci);
        assert!(h.kurucu == option::some(signer::address_of(k)), ESadeceKurucu);
        /* once per chain, never changed */
        assert!(!table::contains(&h.ikiz, domain), EZatenBagli);
        table::add(&mut h.ikiz, domain, karsi);
    }

    /* v4: marks the one Defter change (moved to the Haberci object) */
    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct DefterDegisti has key {}

    const EHavuz: u64 = 8;

    /// v4: the founder, once and before the lock: the Defter this receiver
    /// obeys (the v4 Defter on Arc). The Arc Haberci keeps naming this
    /// object as the twin (that binding is write-once there).
    public entry fun defter_degistir(k: &signer, haberci: address, defter: address) acquires Haberci {
        let h = borrow_global_mut<Haberci>(haberci);
        assert!(h.kurucu == option::some(signer::address_of(k)), ESadeceKurucu);
        assert!(!exists<DefterDegisti>(haberci), EZatenBagli);
        let hs = object::generate_signer_for_extending(&h.ref);
        move_to(&hs, DefterDegisti {});
        h.defter = defter;
    }

    /// v4: the founder, before the lock: asset `varlik` is bought and sold
    /// through Hyperion pool `havuz` (its two tokens the dollar and the
    /// asset), at most `tavan` dollars per call; the pool's price now is the
    /// vault's first reference.
    public entry fun liste_ekle(k: &signer, haberci: address, varlik: address, havuz: address, tavan: u64) acquires Haberci {
        let h = borrow_global<Haberci>(haberci);
        assert!(h.kurucu == option::some(signer::address_of(k)), ESadeceKurucu);
        let v = pool_v3::supported_inner_assets(object::address_to_object<LiquidityPoolV3>(havuz));
        let a = object::object_address(vector::borrow(&v, 0));
        let b = object::object_address(vector::borrow(&v, 1));
        let d = object::object_address(&h.dolar);
        let dolar_a = a == d && b == varlik;
        assert!(dolar_a || (b == d && a == varlik), EHavuz);
        let (_, sqrt) = pool_v3::current_tick_and_price(havuz);
        kasa::liste_yaz(h.kasa, varlik, havuz, dolar_a, sqrt, tavan);
    }

    public entry fun kilitle(k: &signer, haberci: address) acquires Haberci {
        let h = borrow_global_mut<Haberci>(haberci);
        assert!(h.kurucu == option::some(signer::address_of(k)), ESadeceKurucu);
        h.kurucu = option::none();
    }

    #[view] public fun kasa_adresi(haberci: address): address acquires Haberci { borrow_global<Haberci>(haberci).kasa }

    /* ---- the EVM ABI, one 32-byte word at a time ---- */

    fun kelime_u256(b: &vector<u8>, o: u64): u256 {
        let v: u256 = 0;
        let j = 0;
        while (j < 32) { v = (v << 8) | (*vector::borrow(b, o + j) as u256); j = j + 1; };
        v
    }
    fun kelime_adres(b: &vector<u8>, o: u64): address { from_bcs::to_address(vector::slice(b, o, o + 32)) }
    fun u32_be(b: &vector<u8>, i: u64): u32 {
        let v: u32 = 0;
        let j = 0;
        while (j < 4) { v = (v << 8) | (*vector::borrow(b, i + j) as u32); j = j + 1; };
        v
    }

    /* ---- delivery ---- */

    /// Deliver a CCTP message addressed to this Haberci, with its attestation.
    public entry fun teslim(_kim: &signer, haberci: address, mesaj: vector<u8>, imza: vector<u8>) acquires Haberci {
        let h = borrow_global<Haberci>(haberci);
        let hs = object::generate_signer_for_extending(&h.ref);
        let receipt = message_transmitter::receive_message(&hs, &mesaj, &imza);
        let (gonderen, alici, kaynak, _cagiran, kesinlik, govde) = message_transmitter::get_receipt_details(&receipt);
        assert!(kesinlik >= KESINLIK, EKesinlik);
        assert!(table::contains(&h.ikiz, kaynak), EIkizYok);
        let karsi = *table::borrow(&h.ikiz, kaynak);
        if (alici == haberci) {
            /* a payload alone, sent by the twin itself */
            assert!(gonderen == karsi, EKotuMesaj);
            message_transmitter::complete_receive_message(&hs, receipt);
            ilet(haberci, kaynak, govde, 0);
        } else {
            /* dollars with a payload: our twin's burn, minted to us */
            assert!(kelime_adres(&govde, 36) == haberci && kelime_adres(&govde, 100) == karsi, EKotuMesaj);
            let kanca = vector::slice(&govde, 228, vector::length(&govde));
            let dolar = h.dolar;
            let once = primary_fungible_store::balance(haberci, dolar);
            handler::mint(token_messenger_minter::prepare_mint(receipt));
            let gelen = primary_fungible_store::balance(haberci, dolar) - once;
            assert!(gelen > 0, EKotuMesaj);
            ilet(haberci, kaynak, kanca, gelen);
        }
    }

    /// abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri): only the
    /// Defter, on its chain, gives orders, and only to this chain's vault.
    fun ilet(haberci: address, kaynak_zincir: u32, yuk: vector<u8>, dolar: u64) acquires Haberci {
        let h = borrow_global<Haberci>(haberci);
        assert!(kaynak_zincir == h.defter_zincir && kelime_adres(&yuk, 0) == h.defter, ESadeceDefter);
        assert!(kelime_adres(&yuk, 32) == h.kasa, EKotuMesaj);
        let uzunluk = (kelime_u256(&yuk, 96) as u64);
        let veri = vector::slice(&yuk, 128, 128 + uzunluk);
        let tur = (kelime_u256(&veri, 0) as u8);
        let id = (kelime_u256(&veri, 32) as u64);
        let kasa_adr = h.kasa;
        if (tur == AL) {
            let varlik = object::address_to_object<Metadata>(kelime_adres(&veri, 64));
            let refv = kelime_u256(&veri, 96);
            let refv = if (refv > 18446744073709551615) 18446744073709551615 else (refv as u64);
            let hs = object::generate_signer_for_extending(&h.ref);
            let fa = primary_fungible_store::withdraw(&hs, h.dolar, dolar);
            kasa::al_emri(kasa_adr, id, fa, varlik, refv);
        } else if (tur == SAT) {
            let ofs = (kelime_u256(&veri, 64) as u64);
            let miktar = kelime_u256(&veri, 96);
            let arz = kelime_u256(&veri, 128);
            let hz = (kelime_u256(&veri, 160) as u32);
            let alici = kelime_adres(&veri, 192);
            /* the share is a ratio; scaled to fit u64 together */
            while (arz > 18446744073709551615) { arz = arz >> 1; miktar = miktar >> 1; };
            let n = (kelime_u256(&veri, ofs) as u64);
            let i = 0;
            while (i < n) {
                let v = object::address_to_object<Metadata>(kelime_adres(&veri, ofs + 32 + 32 * i));
                kasa::sat_emri(kasa_adr, id, v, (miktar as u64), (arz as u64), i == 0, hz, alici);
                i = i + 1;
            };
        } else abort EKotuMesaj;
        aptos_framework::event::emit(Teslim { kaynak_zincir, dolar, tur });
    }

    /// Anyone: send the vault's queued payout `id` to its chain over CCTP,
    /// straight to the holder (no hook, any relayer may deliver).
    public entry fun gideni_gonder(haberci: address, id: u64) acquires Haberci {
        let h = borrow_global<Haberci>(haberci);
        let hs = object::generate_signer_for_extending(&h.ref);
        let (zincir, alici, fa) = kasa::gideni_al(h.kasa, id);
        let (br, fa2) = token_messenger_minter::deposit_for_burn(&hs, fa, zincir, alici, @0x0, 0, KESINLIK, vector::empty());
        handler::burn(br, fa2);
    }

    #[test_only] public fun u32_be_test(b: &vector<u8>, i: u64): u32 { u32_be(b, i) }
    #[test_only] public fun dolar_mi(h: address): object::Object<Metadata> acquires Haberci { borrow_global<Haberci>(h).dolar }
}
