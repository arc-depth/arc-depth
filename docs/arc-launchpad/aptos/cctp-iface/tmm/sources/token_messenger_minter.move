/// Stand-in for token_messenger_minter_v2::token_messenger_minter (see Move.toml).
module token_messenger_minter_v2::token_messenger_minter {
    use std::vector;
    use aptos_framework::fungible_asset::{Self, FungibleAsset, Metadata};
    use aptos_framework::object::{Self, Object};
    use message_transmitter_v2::message_transmitter::{Self, Receipt};

    struct MintReceipt {
        receipt: Receipt,
        local_token: address,
        mint_recipient: address,
        amount: u64,
        fee: u64,
    }

    struct BurnReceipt {
        caller: address,
        burn_token: address,
        amount: u64,
        destination_domain: u32,
        mint_recipient: address,
        destination_caller: address,
        hook_data: vector<u8>,
    }

    /// The local dollar and, per remote domain, the token messenger whose
    /// burns this chain accepts.
    struct Durum has key { dolar: address, uzak: vector<address> }

    public fun kur(s: &signer, dolar: Object<Metadata>, uzak: vector<address>) {
        move_to(s, Durum { dolar: object::object_address(&dolar), uzak });
    }

    fun u256_be(b: &vector<u8>, i: u64): u256 {
        let v: u256 = 0;
        let j = 0;
        while (j < 32) { v = (v << 8) | (*vector::borrow(b, i + j) as u256); j = j + 1; };
        v
    }

    /* ---- Circle's API (signatures verbatim) ---- */

    public fun deposit_for_burn(
        caller: &signer,
        asset: FungibleAsset,
        destination_domain: u32,
        mint_recipient: address,
        destination_caller: address,
        max_fee: u64,
        min_finality_threshold: u32,
        hook_data: vector<u8>,
    ): (BurnReceipt, FungibleAsset) {
        let _ = max_fee;
        let _ = min_finality_threshold;
        let amount = fungible_asset::amount(&asset);
        let burn_token = object::object_address(&fungible_asset::metadata_from_asset(&asset));
        (BurnReceipt { caller: std::signer::address_of(caller), burn_token, amount, destination_domain, mint_recipient, destination_caller, hook_data }, asset)
    }

    /// Burn body (V2, big endian): version 0..4, burn token 4..36, mint
    /// recipient 36..68, amount 68..100, message sender 100..132, max fee
    /// 132..164, fee executed 164..196, expiration 196..228, hook 228..
    public fun prepare_mint(receipt: Receipt): MintReceipt acquires Durum {
        let (sender, _recipient, kaynak, _caller, fin, govde) = message_transmitter::get_receipt_details(&receipt);
        assert!(fin >= 1000, 10);
        let d = borrow_global<Durum>(@token_messenger_minter_v2);
        assert!(vector::contains(&d.uzak, &sender), 11);
        let _ = kaynak;
        let amount = (u256_be(&govde, 68) as u64);
        let fee = (u256_be(&govde, 164) as u64);
        MintReceipt { receipt, local_token: d.dolar, mint_recipient: message_transmitter::adres(&govde, 36), amount: amount - fee, fee }
    }

    public fun get_mint_details(mint_receipt: &MintReceipt): (address, address, u64, u64) {
        (mint_receipt.local_token, mint_receipt.mint_recipient, mint_receipt.amount, mint_receipt.fee)
    }

    public fun get_burn_details(burn_receipt: &BurnReceipt): (address, u64, address) {
        (burn_receipt.burn_token, burn_receipt.amount, burn_receipt.mint_recipient)
    }

    /* ---- the stand-in's consumers (Circle's complete_mint / complete_burn) ---- */

    public fun tuket_mint(m: MintReceipt): (address, u64) {
        let MintReceipt { receipt, local_token: _, mint_recipient, amount, fee: _ } = m;
        message_transmitter::yok_et(receipt);
        (mint_recipient, amount)
    }

    public fun tuket_burn(b: BurnReceipt): (u32, address, address, u64, vector<u8>) {
        let BurnReceipt { caller: _, burn_token: _, amount, destination_domain, mint_recipient, destination_caller, hook_data } = b;
        (destination_domain, mint_recipient, destination_caller, amount, hook_data)
    }
}
