/// The basket's order intake on Aptos, over LayerZero (arastirma/sepet-v2-tasarim.md).
///
/// Orders come from the Arc HaberciLZ (the LayerZero peer, checked by
/// oapp_receive), ABI-encoded as
///   abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri, uint256 miktar, uint256 beklenen)
/// where `kaynak` must be the Defter and `hedef` this package's vault.
/// LayerZero's executor delivers them by itself.
///
/// An order's dollars come separately, as a plain CCTP burn minted to this
/// module's wallet object (`dolar_adresi`). Circle does not forward to
/// Aptos, so whoever wants the order carried out (the auction's filler)
/// completes that burn with Circle's own entry functions. An order whose
/// dollars are here runs at once; one whose dollars are not waits in line
/// until anyone calls `isle`. `beklenen` is the least that may arrive (the
/// sender's route took its fee on the way); what arrived is what is used.
/// An order without dollars (a redemption) runs at once.
module oft::emir {
    use std::option::{Self, Option};
    use std::signer::address_of;
    use std::vector;
    use aptos_std::from_bcs;
    use aptos_framework::event;
    use aptos_framework::fungible_asset::{FungibleAsset, Metadata};
    use aptos_framework::object::{Self, ExtendRef, Object};
    use aptos_framework::primary_fungible_store;
    use endpoint_v2_common::bytes32::Bytes32;
    use oft::oapp_store::OAPP_ADDRESS;
    use oft::kasa;
    use message_transmitter_v2::message_transmitter;
    use token_messenger_minter_v2::token_messenger_minter;
    use stablecoin_handler::handler;

    friend oft::oapp_receive;

    const KESINLIK: u32 = 2000;
    const AL: u8 = 2;
    const SAT: u8 = 3;

    const EKurulu: u64 = 1;
    const ESadeceYonetici: u64 = 2;
    const EDeger: u64 = 3;
    const ESadeceDefter: u64 = 4;
    const EYanlisKasa: u64 = 5;
    const EKotuMesaj: u64 = 6;

    struct Emir has key {
        cuzdan: ExtendRef,          // the object the dollars are minted to
        kasa: address,
        dolar: Object<Metadata>,
        defter: address,            // the Defter on Arc, 32 bytes as an address
        sira: vector<Bekleyen>,
        ilk: u64,                   // the oldest order not yet carried out
    }

    struct Bekleyen has store, drop { veri: vector<u8>, miktar: u64, beklenen: u64 }

    #[event] struct Bekliyor has drop, store { sira: u64, miktar: u64, beklenen: u64 }
    #[event] struct Islendi has drop, store { sira: u64, tur: u8, dolar: u64 }

    /// Once, by the publisher: the vault, its dollar (Circle's USDC on mainnet) and the Defter.
    public entry fun kur(yayinci: &signer, domain: u32, dolar: Object<Metadata>, defter: address) {
        assert!(address_of(yayinci) == OAPP_ADDRESS(), ESadeceYonetici);
        assert!(!exists<Emir>(OAPP_ADDRESS()), EKurulu);
        let c = object::create_object(OAPP_ADDRESS());
        let cuzdan = object::generate_extend_ref(&c);
        let kasa_adr = kasa::kur(yayinci, domain, dolar);
        move_to(yayinci, Emir { cuzdan, kasa: kasa_adr, dolar, defter, sira: vector[], ilk: 0 });
    }

    #[view] public fun dolar_adresi(): address acquires Emir {
        object::address_from_extend_ref(&borrow_global<Emir>(OAPP_ADDRESS()).cuzdan)
    }
    #[view] public fun kasa_adresi(): address acquires Emir { borrow_global<Emir>(OAPP_ADDRESS()).kasa }
    #[view] public fun bekleyen(): u64 acquires Emir {
        let e = borrow_global<Emir>(OAPP_ADDRESS());
        vector::length(&e.sira) - e.ilk
    }

    /* ---- the EVM ABI, a word at a time ------------------------------- */

    fun kelime(b: &vector<u8>, o: u64): u256 {
        let v: u256 = 0;
        let j = 0;
        while (j < 32) { v = (v << 8) | (*vector::borrow(b, o + j) as u256); j = j + 1; };
        v
    }
    fun adres(b: &vector<u8>, o: u64): address { from_bcs::to_address(vector::slice(b, o, o + 32)) }
    fun u64e(v: u256): u64 { if (v > 18446744073709551615) 18446744073709551615 else (v as u64) }

    /* ---- LayerZero ---------------------------------------------------- */

    public(friend) fun lz_receive_impl(
        _src_eid: u32, _sender: Bytes32, _nonce: u64, _guid: Bytes32, message: vector<u8>, _extra_data: vector<u8>,
        value: Option<FungibleAsset>,
    ) acquires Emir {
        assert!(option::is_none(&value), EDeger);
        option::destroy_none(value);
        let e = borrow_global_mut<Emir>(OAPP_ADDRESS());
        assert!(vector::length(&message) >= 192, EKotuMesaj);
        /* the peer (the Arc HaberciLZ) is checked by oapp_receive; inside it, only the Defter orders, only this vault */
        assert!(adres(&message, 0) == e.defter, ESadeceDefter);
        assert!(adres(&message, 32) == e.kasa, EYanlisKasa);
        let ofs = (kelime(&message, 64) as u64);
        let n = (kelime(&message, ofs) as u64);
        let veri = vector::slice(&message, ofs + 32, ofs + 32 + n);
        let miktar = u64e(kelime(&message, 96));
        let beklenen = u64e(kelime(&message, 128));
        let id = vector::length(&e.sira);
        if (miktar == 0) {
            /* no dollars to wait for (a redemption): it never queues behind a buy */
            yurut(e, &veri, 0);
            event::emit(Islendi { sira: id, tur: (kelime(&veri, 0) as u8), dolar: 0 });
            return
        };
        vector::push_back(&mut e.sira, Bekleyen { veri, miktar, beklenen });
        event::emit(Bekliyor { sira: id, miktar, beklenen });
        isle_ic(e);
    }

    public(friend) fun next_nonce_impl(_src_eid: u32, _sender: Bytes32): u64 { 0 }

    /* ---- the dollars, by CCTP ------------------------------------------ */

    /// Anyone: deliver a plain CCTP burn (an order's dollars, minted to this
    /// module's wallet) and carry out, in the same call, every order that can
    /// now run. Circle does not forward to Aptos; the auction's filler, or
    /// anyone who wants the order carried out, calls this.
    public entry fun teslim(arayan: &signer, mesaj: vector<u8>, imza: vector<u8>) acquires Emir {
        let receipt = message_transmitter::receive_message(arayan, &mesaj, &imza);
        handler::mint(token_messenger_minter::prepare_mint(receipt));
        isle_ic(borrow_global_mut<Emir>(OAPP_ADDRESS()));
    }

    /// Anyone: the vault's queued payout `id` (a holder's share paid on another
    /// chain), burned over CCTP straight to the holder there. No forwarding
    /// can be asked from Aptos: the holder (or anyone) completes it there.
    public entry fun gideni_gonder(id: u64) acquires Emir {
        let e = borrow_global<Emir>(OAPP_ADDRESS());
        let s = object::generate_signer_for_extending(&e.cuzdan);
        let (zincir, alici, fa) = kasa::gideni_al(e.kasa, id);
        let (br, fa2) = token_messenger_minter::deposit_for_burn(&s, fa, zincir, alici, @0x0, 0, KESINLIK, vector::empty());
        handler::burn(br, fa2);
    }

    /// Anyone: carry out the waiting orders whose dollars have arrived, in order.
    public entry fun isle() acquires Emir { isle_ic(borrow_global_mut<Emir>(OAPP_ADDRESS())) }

    fun isle_ic(e: &mut Emir) {
        let cuzdan = object::address_from_extend_ref(&e.cuzdan);
        let i = e.ilk;
        let n = vector::length(&e.sira);
        while (i < n) {
            let q = vector::borrow(&e.sira, i);
            if (q.miktar > 0) {
                let bakiye = primary_fungible_store::balance(cuzdan, e.dolar);
                if (bakiye < q.beklenen) break;   // its dollars are still on their way
                let v = if (q.miktar < bakiye) q.miktar else bakiye;
                let veri = q.veri;
                yurut(e, &veri, v);
                event::emit(Islendi { sira: i, tur: (kelime(&veri, 0) as u8), dolar: v });
            };
            i = i + 1;
        };
        e.ilk = i;
    }

    /// One order: a buy opens the vault's auction with `v` dollars, a redemption opens its sales.
    fun yurut(e: &Emir, veri: &vector<u8>, v: u64) {
            let veri = *veri;
            let tur = (kelime(&veri, 0) as u8);
            let lid = (kelime(&veri, 32) as u64);
            if (tur == AL) {
                let varlik = object::address_to_object<Metadata>(adres(&veri, 64));
                let refv = u64e(kelime(&veri, 96));
                let s = object::generate_signer_for_extending(&e.cuzdan);
                let fa = primary_fungible_store::withdraw(&s, e.dolar, v);
                kasa::al_emri(e.kasa, lid, fa, varlik, refv);
            } else if (tur == SAT) {
                let ofs = (kelime(&veri, 64) as u64);
                let miktar = kelime(&veri, 96);
                let arz = kelime(&veri, 128);
                let hz = (kelime(&veri, 160) as u32);
                let alici = adres(&veri, 192);
                /* the share is a ratio; scaled to fit u64 together */
                while (arz > 18446744073709551615) { arz = arz >> 1; miktar = miktar >> 1; };
                let k = (kelime(&veri, ofs) as u64);
                let j = 0;
                while (j < k) {
                    let va = object::address_to_object<Metadata>(adres(&veri, ofs + 32 + 32 * j));
                    kasa::sat_emri(e.kasa, lid, va, (miktar as u64), (arz as u64), j == 0, hz, alici);
                    j = j + 1;
                };
            } else abort EKotuMesaj;
    }

    #[test_only] public fun al_test(message: vector<u8>) acquires Emir {
        lz_receive_impl(30417, endpoint_v2_common::bytes32::zero_bytes32(), 1, endpoint_v2_common::bytes32::zero_bytes32(),
            message, vector[], option::none());
    }
}
