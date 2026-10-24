/// Stand-ins for message_transmitter_v2::{auth, receive_message, send_message}
/// (see Move.toml). Signatures and ticket shapes as in Circle's sources.
module message_transmitter_v2::auth {
    use std::type_name;
    use sui::address;
    use sui::hash;

    public fun auth_caller_identifier<Auth: drop>(): address {
        let t = type_name::with_defining_ids<Auth>();
        address::from_bytes(hash::keccak256(t.into_string().as_bytes()))
    }
}

module message_transmitter_v2::state {
    use sui::table::{Self, Table};

    /// Circle's shared State, reduced to what the stand-in checks.
    public struct State has key { id: UID, yerel: u32, kullanilan: Table<u256, bool>, giden: vector<vector<u8>> }

    public fun yeni_paylasilan(yerel: u32, ctx: &mut TxContext) {
        transfer::share_object(State { id: object::new(ctx), yerel, kullanilan: table::new(ctx), giden: vector[] })
    }
    public fun yerel(s: &State): u32 { s.yerel }
    public fun kullan(s: &mut State, n: u256) { assert!(!s.kullanilan.contains(n), 4); s.kullanilan.add(n, true) }
    public fun kaydet(s: &mut State, m: vector<u8>) { s.giden.push_back(m) }
    public fun giden(s: &State): &vector<vector<u8>> { &s.giden }
}

module message_transmitter_v2::receive_message {
    use sui::address;
    use message_transmitter_v2::auth::auth_caller_identifier;
    use message_transmitter_v2::state::State;

    public struct Receipt {
        caller: address,
        recipient: address,
        source_domain: u32,
        sender: address,
        nonce: u256,
        finality_threshold_executed: u32,
        message_body: vector<u8>,
        current_version: u64,
    }
    public struct StampedReceipt { receipt: Receipt }

    public struct ReceiveMessageTicket<Auth: drop> { auth: Auth, message: vector<u8>, attestation: vector<u8> }
    public struct StampReceiptTicket<Auth: drop> { auth: Auth, receipt: Receipt }

    public fun create_receive_message_ticket<Auth: drop>(auth: Auth, message: vector<u8>, attestation: vector<u8>): ReceiveMessageTicket<Auth> {
        ReceiveMessageTicket { auth, message, attestation }
    }
    public fun create_stamp_receipt_ticket<Auth: drop>(auth: Auth, receipt: Receipt): StampReceiptTicket<Auth> {
        StampReceiptTicket { auth, receipt }
    }

    fun u32_be(b: &vector<u8>, i: u64): u32 { let mut v = 0u32; let mut j = 0; while (j < 4) { v = (v << 8) | (b[i + j] as u32); j = j + 1; }; v }
    fun u256_be(b: &vector<u8>, i: u64): u256 { let mut v = 0u256; let mut j = 0; while (j < 32) { v = (v << 8) | (b[i + j] as u256); j = j + 1; }; v }
    public fun adres(b: &vector<u8>, i: u64): address {
        let mut s = vector[];
        let mut j = 0;
        while (j < 32) { s.push_back(b[i + j]); j = j + 1; };
        address::from_bytes(s)
    }

    /// version-gated in Circle's package; the PTB calls it. Header as CCTP
    /// writes it (big endian): see the EVM CctpMesaj library.
    public fun receive_message_with_package_auth<Auth: drop>(t: ReceiveMessageTicket<Auth>, state: &mut State): Receipt {
        let ReceiveMessageTicket { auth: _, message: m, attestation: _ } = t;
        assert!(m.length() >= 148, 1);
        assert!(u32_be(&m, 8) == state.yerel(), 2);
        let dc = adres(&m, 108);
        assert!(dc == @0x0 || dc == auth_caller_identifier<Auth>(), 3);
        let nonce = u256_be(&m, 12);
        state.kullan(nonce);
        let mut body = vector[];
        let mut i = 148;
        while (i < m.length()) { body.push_back(m[i]); i = i + 1; };
        Receipt { caller: auth_caller_identifier<Auth>(), recipient: adres(&m, 76), source_domain: u32_be(&m, 4), sender: adres(&m, 44),
            nonce, finality_threshold_executed: u32_be(&m, 144), message_body: body, current_version: 1 }
    }

    public fun stamp_receipt<Auth: drop>(t: StampReceiptTicket<Auth>, _state: &State): StampedReceipt {
        let StampReceiptTicket { auth: _, receipt } = t;
        assert!(receipt.recipient == auth_caller_identifier<Auth>(), 5);
        StampedReceipt { receipt }
    }

    public fun complete_receive_message(stamped_receipt: StampedReceipt, _state: &State) {
        let StampedReceipt { receipt } = stamped_receipt;
        let Receipt { caller: _, recipient: _, source_domain: _, sender: _, nonce: _, finality_threshold_executed: _, message_body: _, current_version: _ } = receipt;
    }

    public fun sender(receipt: &Receipt): address { receipt.sender }
    public fun source_domain(receipt: &Receipt): u32 { receipt.source_domain }
    public fun message_body(receipt: &Receipt): &vector<u8> { &receipt.message_body }
    public fun finality_threshold_executed(receipt: &Receipt): u32 { receipt.finality_threshold_executed }
    public fun recipient(receipt: &Receipt): address { receipt.recipient }
}

module message_transmitter_v2::send_message {
    use message_transmitter_v2::state::State;

    public struct SendMessageTicket<Auth: drop> {
        auth: Auth, destination_domain: u32, recipient: address, destination_caller: address, min_finality_threshold: u32, message_body: vector<u8>,
    }

    public fun create_send_message_ticket<Auth: drop>(
        auth: Auth, destination_domain: u32, recipient: address, destination_caller: address, min_finality_threshold: u32, message_body: vector<u8>,
    ): SendMessageTicket<Auth> {
        SendMessageTicket { auth, destination_domain, recipient, destination_caller, min_finality_threshold, message_body }
    }

    /// version-gated in Circle's package; the stand-in records the body
    public fun send_message<Auth: drop>(t: SendMessageTicket<Auth>, state: &mut State) {
        let SendMessageTicket { auth: _, destination_domain: _, recipient: _, destination_caller: _, min_finality_threshold: _, message_body } = t;
        state.kaydet(message_body);
    }
}
