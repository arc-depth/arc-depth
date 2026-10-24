/// AdaKapisi on Aptos: the far end of an island's gate (BNB, Robinhood).
///
/// An island's vault paying a holder on Aptos cannot use CCTP (Circle mints
/// no USDC on the island). Its gate locks the dollars on the island and
/// sends the order over LayerZero; here the order waits until someone pays
/// the holder in Aptos USDC (`doldur`), and the receipt (`bildir`) goes back
/// so the locked dollars on the island are released to that payer, one for
/// one. No one holds anyone's dollars: the payer pays first, the island's
/// gate releases only on this gate's receipt, and this gate sends one only
/// for an order that arrived from the island and was paid.
///
/// Messages are the EVM AdaKapisi's, ABI-encoded:
///   TASI   abi.encode(uint8 1, bytes[] ms), each m =
///          abi.encode(uint8 1, uint64 id, bytes32 kaynak, bytes32 hedef, bytes veri, uint256 miktar)
///   ODENDI abi.encode(uint8 2, uint64[] ids, bytes32[] alacaklilar)
/// Only payouts reach Aptos (veri empty): the holder `hedef` is paid directly.
module oft::kapi {
    use std::option::{Self, Option};
    use std::signer::address_of;
    use std::vector;
    use aptos_std::aptos_hash::keccak256;
    use aptos_std::from_bcs;
    use aptos_std::table::{Self, Table};
    use aptos_framework::event;
    use aptos_framework::fungible_asset::{FungibleAsset, Metadata};
    use aptos_framework::object::Object;
    use aptos_framework::primary_fungible_store;
    use endpoint_v2_common::bytes32::Bytes32;
    use oft::oapp_core::{lz_send, withdraw_lz_fees, refund_fees};
    use oft::oapp_store::OAPP_ADDRESS;

    friend oft::oapp_receive;

    const TASI: u8 = 1;
    const ODENDI: u8 = 2;

    const EKurulu: u64 = 1;
    const EYanlisMesaj: u64 = 2;
    const ESadeceYonetici: u64 = 3;
    const EDeger: u64 = 4;

    struct Kapi has key {
        dolar: Object<Metadata>,
        /// (source eid << 64 | id) -> keccak256 of the order, while it waits for a payer
        bekleyen: Table<u128, vector<u8>>,
        /// paid orders whose receipt is not sent yet -> the payer on the source chain (32 bytes)
        odeyen: Table<u128, vector<u8>>,
    }

    #[event] struct Bekliyor has drop, store { kaynak_eid: u32, id: u64, hedef: address, miktar: u64, mesaj: vector<u8> }
    #[event] struct Dolduruldu has drop, store { kaynak_eid: u32, id: u64, doldurucu: address, hedef: address, miktar: u64 }
    #[event] struct Bildirildi has drop, store { kaynak_eid: u32, sayi: u64 }

    /// Once, by the publisher: the dollar paid out here (Circle's USDC on mainnet).
    public entry fun kur(yayinci: &signer, dolar: Object<Metadata>) {
        assert!(address_of(yayinci) == OAPP_ADDRESS(), ESadeceYonetici);
        assert!(!exists<Kapi>(OAPP_ADDRESS()), EKurulu);
        move_to(yayinci, Kapi { dolar, bekleyen: table::new(), odeyen: table::new() });
    }

    fun anahtar(eid: u32, id: u64): u128 { ((eid as u128) << 64) | (id as u128) }

    /* ---- the EVM ABI, a word at a time ------------------------------- */

    fun kelime(b: &vector<u8>, o: u64): u256 {
        let v = 0u256;
        let j = 0;
        while (j < 32) { v = (v << 8) | (*vector::borrow(b, o + j) as u256); j = j + 1; };
        v
    }
    fun dilim(b: &vector<u8>, o: u64, n: u64): vector<u8> {
        let s = vector[];
        let j = 0;
        while (j < n) { vector::push_back(&mut s, *vector::borrow(b, o + j)); j = j + 1; };
        s
    }
    fun yaz(s: &mut vector<u8>, v: u256) {
        let b = vector[];
        let j = 0;
        while (j < 32) {
            let kaydir = ((8 * (31 - j)) as u8);
            vector::push_back(&mut b, (((v >> kaydir) & 0xff) as u8));
            j = j + 1;
        };
        vector::append(s, b);
    }

    /// The fields of one order: (id, hedef, veri length, miktar).
    fun coz(m: &vector<u8>): (u64, address, u64, u64) {
        assert!(vector::length(m) >= 224 && (kelime(m, 0) as u8) == TASI, EYanlisMesaj);
        let id = (kelime(m, 32) as u64);
        let hedef = from_bcs::to_address(dilim(m, 96, 32));
        let ofs = (kelime(m, 128) as u64);
        let veri = (kelime(m, ofs) as u64);
        let miktar = kelime(m, 160);
        assert!(miktar <= 18446744073709551615, EYanlisMesaj);
        (id, hedef, veri, (miktar as u64))
    }

    /* ---- LayerZero ---------------------------------------------------- */

    public(friend) fun lz_receive_impl(
        src_eid: u32, _sender: Bytes32, _nonce: u64, _guid: Bytes32, message: vector<u8>, _extra_data: vector<u8>,
        value: Option<FungibleAsset>,
    ) acquires Kapi {
        assert!(option::is_none(&value), EDeger);
        option::destroy_none(value);
        /* only orders come in; the peer check is oapp_receive's */
        assert!((kelime(&message, 0) as u8) == TASI, EYanlisMesaj);
        let dizi = (kelime(&message, 32) as u64);
        let n = (kelime(&message, dizi) as u64);
        let k = borrow_global_mut<Kapi>(OAPP_ADDRESS());
        let i = 0;
        while (i < n) {
            let bas = dizi + 32 + (kelime(&message, dizi + 32 + 32 * i) as u64);
            let uzun = (kelime(&message, bas) as u64);
            let m = dilim(&message, bas + 32, uzun);
            let (id, hedef, _, miktar) = coz(&m);
            table::upsert(&mut k.bekleyen, anahtar(src_eid, id), keccak256(m));
            event::emit(Bekliyor { kaynak_eid: src_eid, id, hedef, miktar, mesaj: m });
            i = i + 1;
        };
    }

    public(friend) fun next_nonce_impl(_src_eid: u32, _sender: Bytes32): u64 { 0 }

    /* ---- paying and the receipt -------------------------------------- */

    /// Anyone: pay order `m` from `kaynak_eid` to its holder in this chain's
    /// dollar; `alacakli` (32 bytes) is repaid on the source chain.
    public entry fun doldur(doldurucu: &signer, kaynak_eid: u32, m: vector<u8>, alacakli: vector<u8>) acquires Kapi {
        assert!(vector::length(&alacakli) == 32 && alacakli != vector[0u8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], EYanlisMesaj);
        let (id, hedef, veri, miktar) = coz(&m);
        assert!(veri == 0, EYanlisMesaj);   // only payouts reach Aptos
        let k = borrow_global_mut<Kapi>(OAPP_ADDRESS());
        let a = anahtar(kaynak_eid, id);
        assert!(table::contains(&k.bekleyen, a) && *table::borrow(&k.bekleyen, a) == keccak256(m), EYanlisMesaj);
        table::remove(&mut k.bekleyen, a);
        if (miktar > 0) {
            primary_fungible_store::transfer(doldurucu, k.dolar, hedef, miktar);
            table::add(&mut k.odeyen, a, alacakli);
        };
        event::emit(Dolduruldu { kaynak_eid, id, doldurucu: address_of(doldurucu), hedef, miktar });
    }

    /// Anyone (the payer, usually): the receipts for paid orders `ids` of
    /// `kaynak_eid` in one LayerZero message; LayerZero's fee from the caller.
    public entry fun bildir(odeyici: &signer, kaynak_eid: u32, ids: vector<u64>, secenekler: vector<u8>, ucret: u64) acquires Kapi {
        let n = vector::length(&ids);
        assert!(n > 0, EYanlisMesaj);
        let k = borrow_global_mut<Kapi>(OAPP_ADDRESS());
        let alacakli = vector[];
        let i = 0;
        while (i < n) {
            let a = anahtar(kaynak_eid, *vector::borrow(&ids, i));
            assert!(table::contains(&k.odeyen, a), EYanlisMesaj);
            vector::push_back(&mut alacakli, table::remove(&mut k.odeyen, a));
            i = i + 1;
        };
        let m = odendi_mesaji(&ids, &alacakli);
        let (yerel, zro) = withdraw_lz_fees(odeyici, ucret, 0);
        lz_send(kaynak_eid, m, secenekler, &mut yerel, &mut zro);
        refund_fees(address_of(odeyici), yerel, zro);
        event::emit(Bildirildi { kaynak_eid, sayi: n });
    }

    /// abi.encode(uint8 2, uint64[] ids, bytes32[] alacaklilar)
    public fun odendi_mesaji(ids: &vector<u64>, alacakli: &vector<vector<u8>>): vector<u8> {
        let n = vector::length(ids);
        let s = vector[];
        yaz(&mut s, (ODENDI as u256));
        yaz(&mut s, 96);
        yaz(&mut s, ((96 + 32 + 32 * n) as u256));
        yaz(&mut s, (n as u256));
        let i = 0;
        while (i < n) { yaz(&mut s, (*vector::borrow(ids, i) as u256)); i = i + 1; };
        yaz(&mut s, (n as u256));
        i = 0;
        while (i < n) { vector::append(&mut s, *vector::borrow(alacakli, i)); i = i + 1; };
        s
    }

    #[view] public fun bekliyor_mu(kaynak_eid: u32, id: u64): bool acquires Kapi {
        table::contains(&borrow_global<Kapi>(OAPP_ADDRESS()).bekleyen, anahtar(kaynak_eid, id))
    }

    #[test_only] public fun al_test(src_eid: u32, message: vector<u8>) acquires Kapi {
        lz_receive_impl(src_eid, endpoint_v2_common::bytes32::zero_bytes32(), 0, endpoint_v2_common::bytes32::zero_bytes32(), message, vector[], option::none());
    }
}
