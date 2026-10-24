/// The launch tokens' twins on Aptos (arastirma/sepet-v2-tasarim.md, "2. nesil ikizler").
///
/// On Arc every launch token is locked in one place, the IkizHub, while its
/// twins exist here; LayerZero does not connect Arc to Aptos, so the hub's
/// messages come through the AktarmaLZ hop on Base, this OApp's only peer.
/// From the hub (passed on by the hop as they are):
///   YARAT  abi.encode(uint8 1, address token, string ad, string sembol)
///          -> the twin, a fungible asset with 6 decimals, at an address
///             anyone can compute from the token (`ikiz_adresi`)
///   TASI   abi.encode(uint8 2, address token, bytes32 alici, uint256 miktar)
///          -> `miktar` twins minted to `alici`
/// Back to Arc (anyone, paying LayerZero in APT): the holder's twins are
/// burned and the hub releases the same amount from the lock, either to an
/// Arc address or, with an order (`istek`), to the one-pool gate that sells
/// or redeems them in the same call:
///   abi.encode(uint8 2, address token, bytes32 alici, uint256 miktar, bytes istek)
/// Amounts are in the hub's 6 shared decimals, one to one with the twin.
/// A transfer that arrives before its twin exists stays with the endpoint and
/// anyone may deliver it again later (`oapp_receive::lz_receive`).
module oft::kapi {
    use std::option::{Self, Option};
    use std::signer::address_of;
    use std::string::{Self, String};
    use std::vector;
    use aptos_std::from_bcs;
    use aptos_std::table::{Self, Table};
    use aptos_framework::bcs;
    use aptos_framework::event;
    use aptos_framework::fungible_asset::{Self, BurnRef, FungibleAsset, Metadata, MintRef};
    use aptos_framework::object::{Self, ExtendRef, Object};
    use aptos_framework::primary_fungible_store;
    use endpoint_v2_common::bytes32::Bytes32;
    use oft::oapp_core;
    use oft::oapp_store::OAPP_ADDRESS;

    friend oft::oapp_receive;

    const YARAT: u8 = 1;
    const TASI: u8 = 2;
    const ONDALIK: u8 = 6;
    const GONDER_TIPI: u16 = 1;

    const EKurulu: u64 = 1;
    const ESadeceYonetici: u64 = 2;
    const EDeger: u64 = 3;
    const EKotuMesaj: u64 = 4;
    const EIkizYok: u64 = 5;
    const EAz: u64 = 6;
    const EKotuAlici: u64 = 7;
    const ECok: u64 = 8;

    struct Kapi has key {
        yapici: ExtendRef,          // the object the twins are created under
        aktarma_eid: u32,           // Base, where the hop is (the peer)
        ikizler: Table<address, Ikiz>,
    }

    struct Ikiz has store { meta: Object<Metadata>, basim: MintRef, yakim: BurnRef }

    #[event] struct Yaratildi has drop, store { token: address, ikiz: address }
    #[event] struct Geldi has drop, store { token: address, alici: address, miktar: u64 }
    #[event] struct Gitti has drop, store { token: address, gonderen: address, alici: address, miktar: u64, istekli: bool }

    /// Once, by the publisher: the eid of the hop's chain (Base, 30184).
    public entry fun kur(yayinci: &signer, aktarma_eid: u32) {
        assert!(address_of(yayinci) == OAPP_ADDRESS(), ESadeceYonetici);
        assert!(!exists<Kapi>(OAPP_ADDRESS()), EKurulu);
        let c = object::create_object(OAPP_ADDRESS());
        move_to(yayinci, Kapi { yapici: object::generate_extend_ref(&c), aktarma_eid, ikizler: table::new() });
    }

    #[view] public fun ikiz_var(token: address): bool acquires Kapi {
        table::contains(&borrow_global<Kapi>(OAPP_ADDRESS()).ikizler, token)
    }
    // The twin's address (its metadata object), known before it exists.
    #[view] public fun ikiz_adresi(token: address): address acquires Kapi {
        let k = borrow_global<Kapi>(OAPP_ADDRESS());
        object::create_object_address(&object::address_from_extend_ref(&k.yapici), bcs::to_bytes(&token))
    }

    /* ---- the EVM ABI, a word at a time ------------------------------- */

    fun kelime(b: &vector<u8>, o: u64): u256 {
        let v: u256 = 0;
        let j = 0;
        while (j < 32) { v = (v << 8) | (*vector::borrow(b, o + j) as u256); j = j + 1; };
        v
    }
    fun adres(b: &vector<u8>, o: u64): address { from_bcs::to_address(vector::slice(b, o, o + 32)) }
    fun w(v: u256): vector<u8> {
        let b = vector::empty<u8>();
        let i = 32;
        while (i > 0) { i = i - 1; vector::push_back(&mut b, (((v >> ((i * 8) as u8)) & 0xff) as u8)); };
        b
    }

    /// A string field of the message, cut to `en` bytes on a character
    /// boundary; one that is not UTF-8 becomes empty (the twin must be created).
    fun metin(m: &vector<u8>, alan: u64, en: u64): String {
        let ofs = (kelime(m, alan) as u64);
        let n = (kelime(m, ofs) as u64);
        if (n > en) {
            n = en;
            while (n > 0 && (*vector::borrow(m, ofs + 32 + n) & 0xc0) == 0x80) n = n - 1;
        };
        let s = string::try_utf8(vector::slice(m, ofs + 32, ofs + 32 + n));
        if (option::is_some(&s)) option::extract(&mut s) else string::utf8(b"")
    }

    /* ---- in: from the hub, through the hop ---------------------------- */

    public(friend) fun lz_receive_impl(
        _src_eid: u32, _sender: Bytes32, _nonce: u64, _guid: Bytes32, message: vector<u8>, _extra_data: vector<u8>,
        value: Option<FungibleAsset>,
    ) acquires Kapi {
        /* the peer (the hop on Base) is checked by oapp_receive; a native value is not expected */
        assert!(option::is_none(&value), EDeger);
        option::destroy_none(value);
        assert!(vector::length(&message) >= 128, EKotuMesaj);
        let k = borrow_global_mut<Kapi>(OAPP_ADDRESS());
        let tur = kelime(&message, 0);
        let token = adres(&message, 32);
        if (tur == (YARAT as u256)) {
            if (table::contains(&k.ikizler, token)) return;   // once; a repeat changes nothing
            let s = object::generate_signer_for_extending(&k.yapici);
            let c = object::create_named_object(&s, bcs::to_bytes(&token));
            primary_fungible_store::create_primary_store_enabled_fungible_asset(
                &c, option::none(), metin(&message, 64, 32), metin(&message, 96, 10), ONDALIK,
                string::utf8(b""), string::utf8(b""));
            let meta = object::object_from_constructor_ref<Metadata>(&c);
            table::add(&mut k.ikizler, token, Ikiz {
                meta, basim: fungible_asset::generate_mint_ref(&c), yakim: fungible_asset::generate_burn_ref(&c),
            });
            event::emit(Yaratildi { token, ikiz: object::object_address(&meta) });
        } else if (tur == (TASI as u256)) {
            assert!(table::contains(&k.ikizler, token), EIkizYok);
            let alici = adres(&message, 64);
            let m = kelime(&message, 96);
            assert!(m <= 18446744073709551615, ECok);
            let miktar = (m as u64);
            let i = table::borrow(&k.ikizler, token);
            primary_fungible_store::mint(&i.basim, alici, miktar);
            event::emit(Geldi { token, alici, miktar });
        } else abort EKotuMesaj;
    }

    public(friend) fun next_nonce_impl(_src_eid: u32, _sender: Bytes32): u64 { 0 }

    /* ---- out: back to Arc --------------------------------------------- */

    fun giden(token: address, alici: vector<u8>, miktar: u64, istek: vector<u8>): vector<u8> {
        let m = w((TASI as u256));
        vector::append(&mut m, bcs::to_bytes(&token));
        vector::append(&mut m, alici);
        vector::append(&mut m, w((miktar as u256)));
        vector::append(&mut m, w(160));
        vector::append(&mut m, w((vector::length(&istek) as u256)));
        vector::append(&mut m, istek);
        while (vector::length(&m) % 32 != 0) vector::push_back(&mut m, 0);
        m
    }

    // What LayerZero asks, in APT, for `gonder` with these arguments.
    #[view] public fun ucret(token: address, alici: vector<u8>, miktar: u64, istek: vector<u8>): u64 acquires Kapi {
        let k = borrow_global<Kapi>(OAPP_ADDRESS());
        let (u, _) = oapp_core::lz_quote(k.aktarma_eid, giden(token, alici, miktar, istek),
            oapp_core::combine_options(k.aktarma_eid, GONDER_TIPI, vector[]), false);
        u
    }

    /// Anyone: burn `miktar` of the caller's twins of `token` and have the hub
    /// on Arc release as many to `alici` (32 bytes, an Arc address), or carry
    /// out the order `istek` with them. `ucret` APT (at most) pays LayerZero;
    /// what is not used comes back.
    public entry fun gonder(
        kullanici: &signer, token: address, alici: vector<u8>, miktar: u64, istek: vector<u8>, ucret: u64,
    ) acquires Kapi {
        assert!(miktar > 0, EAz);
        assert!(vector::length(&alici) == 32 && alici != w(0), EKotuAlici);
        let k = borrow_global<Kapi>(OAPP_ADDRESS());
        assert!(table::contains(&k.ikizler, token), EIkizYok);
        let i = table::borrow(&k.ikizler, token);
        let ben = address_of(kullanici);
        primary_fungible_store::burn(&i.yakim, ben, miktar);
        let istekli = !vector::is_empty(&istek);
        let m = giden(token, alici, miktar, istek);
        let (yerel, zro) = oapp_core::withdraw_lz_fees(kullanici, ucret, 0);
        oapp_core::lz_send(k.aktarma_eid, m, oapp_core::combine_options(k.aktarma_eid, GONDER_TIPI, vector[]), &mut yerel, &mut zro);
        oapp_core::refund_fees(ben, yerel, zro);
        event::emit(Gitti { token, gonderen: ben, alici: from_bcs::to_address(alici), miktar, istekli });
    }

    #[test_only] public fun al_test(message: vector<u8>) acquires Kapi {
        lz_receive_impl(30184, endpoint_v2_common::bytes32::zero_bytes32(), 1, endpoint_v2_common::bytes32::zero_bytes32(),
            message, vector[], option::none());
    }
    #[test_only] public fun giden_test(token: address, alici: vector<u8>, miktar: u64, istek: vector<u8>): vector<u8> {
        giden(token, alici, miktar, istek)
    }
    #[test_only] public fun ikiz_meta(token: address): Object<Metadata> acquires Kapi {
        table::borrow(&borrow_global<Kapi>(OAPP_ADDRESS()).ikizler, token).meta
    }
}
