/// DEVNET ONLY test dollar: 6 decimals, anyone may mint. It exists so the
/// launchpad can be exercised end to end on a test network; it has no value
/// and is never published on mainnet.
module tusdc::tusdc {
    use std::option;
    use std::string::utf8;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::fungible_asset::{Self, Metadata, MintRef};
    use aptos_framework::primary_fungible_store;

    const SEED: vector<u8> = b"TUSDC";

    struct Refs has key { mint: MintRef }

    fun init_module(admin: &signer) {
        let ctor = object::create_named_object(admin, SEED);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &ctor, option::none(), utf8(b"Test USD (devnet)"), utf8(b"tUSDC"), 6, utf8(b""), utf8(b""));
        move_to(&object::generate_signer(&ctor), Refs { mint: fungible_asset::generate_mint_ref(&ctor) });
    }

    #[view]
    public fun metadata(): Object<Metadata> {
        object::address_to_object<Metadata>(object::create_object_address(&@tusdc, SEED))
    }

    public entry fun mint(to: address, amount: u64) acquires Refs {
        let m = metadata();
        primary_fungible_store::mint(&borrow_global<Refs>(object::object_address(&m)).mint, to, amount);
    }
}
