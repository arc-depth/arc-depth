/// Stand-in for message_transmitter_v2::message_transmitter (see Move.toml).
module message_transmitter_v2::message_transmitter {
    use std::signer;
    use std::vector;
    use aptos_std::table::{Self, Table};
    use aptos_std::from_bcs;

    struct Receipt {
        caller: address,
        recipient: address,
        source_domain: u32,
        sender: address,
        nonce: u256,
        finality_threshold_executed: u32,
        message_body: vector<u8>
    }

    struct Durum has key {
        yerel: u32,
        kullanilan: Table<u256, bool>,
        giden: vector<vector<u8>>,
    }

    /* ---- the stand-in's own setup (not part of Circle's API) ---- */

    public fun kur(s: &signer, yerel: u32) {
        move_to(s, Durum { yerel, kullanilan: table::new(), giden: vector::empty() });
    }

    public fun giden(): vector<vector<u8>> acquires Durum { borrow_global<Durum>(@message_transmitter_v2).giden }

    public fun yok_et(r: Receipt) {
        let Receipt { caller: _, recipient: _, source_domain: _, sender: _, nonce: _, finality_threshold_executed: _, message_body: _ } = r;
    }

    fun u32_be(b: &vector<u8>, i: u64): u32 {
        let v: u32 = 0;
        let j = 0;
        while (j < 4) { v = (v << 8) | (*vector::borrow(b, i + j) as u32); j = j + 1; };
        v
    }

    fun u256_be(b: &vector<u8>, i: u64): u256 {
        let v: u256 = 0;
        let j = 0;
        while (j < 32) { v = (v << 8) | (*vector::borrow(b, i + j) as u256); j = j + 1; };
        v
    }

    public fun adres(b: &vector<u8>, i: u64): address { from_bcs::to_address(vector::slice(b, i, i + 32)) }

    /* ---- Circle's API (signatures verbatim) ---- */

    public fun send_message(
        caller: &signer,
        destination_domain: u32,
        recipient: address,
        destination_caller: address,
        min_finality_threshold: u32,
        message_body: &vector<u8>
    ) acquires Durum {
        let d = borrow_global_mut<Durum>(@message_transmitter_v2);
        let m = vector::empty<u8>();
        let i = 0;
        while (i < 4) { vector::push_back(&mut m, 0); i = i + 1; };
        vector::append(&mut m, std::bcs::to_bytes(&d.yerel));
        vector::append(&mut m, std::bcs::to_bytes(&destination_domain));
        vector::append(&mut m, std::bcs::to_bytes(&signer::address_of(caller)));
        vector::append(&mut m, std::bcs::to_bytes(&recipient));
        vector::append(&mut m, std::bcs::to_bytes(&destination_caller));
        vector::append(&mut m, std::bcs::to_bytes(&min_finality_threshold));
        vector::append(&mut m, *message_body);
        vector::push_back(&mut d.giden, m);
    }

    /// Header (big endian, as CCTP writes it): version 0..4, source 4..8,
    /// destination 8..12, nonce 12..44, sender 44..76, recipient 76..108,
    /// destination caller 108..140, min finality 140..144, finality
    /// executed 144..148, body 148..
    public fun receive_message(caller: &signer, message_bytes: &vector<u8>, attestation: &vector<u8>): Receipt acquires Durum {
        let _ = attestation;
        let d = borrow_global_mut<Durum>(@message_transmitter_v2);
        let m = message_bytes;
        assert!(vector::length(m) >= 148, 1);
        assert!(u32_be(m, 8) == d.yerel, 2);
        let dc = adres(m, 108);
        assert!(dc == @0x0 || dc == signer::address_of(caller), 3);
        let nonce = u256_be(m, 12);
        assert!(!table::contains(&d.kullanilan, nonce), 4);
        table::add(&mut d.kullanilan, nonce, true);
        Receipt {
            caller: signer::address_of(caller),
            recipient: adres(m, 76),
            source_domain: u32_be(m, 4),
            sender: adres(m, 44),
            nonce,
            finality_threshold_executed: u32_be(m, 144),
            message_body: vector::slice(m, 148, vector::length(m)),
        }
    }

    public fun complete_receive_message(caller: &signer, receipt: Receipt) {
        assert!(receipt.recipient == signer::address_of(caller), 5);
        yok_et(receipt);
    }

    public fun get_receipt_details(receipt: &Receipt): (address, address, u32, address, u32, vector<u8>) {
        (receipt.sender, receipt.recipient, receipt.source_domain, receipt.caller, receipt.finality_threshold_executed, receipt.message_body)
    }
}
