/// LOCAL NETWORK ONLY. A 6-decimal dollar with dispatch hooks on deposit and
/// withdraw, as Circle's USDC on Aptos has; anyone may mint.
module yerel_usdc::usdc {
    use std::option;
    use std::signer;
    use std::string;
    use aptos_framework::dispatchable_fungible_asset;
    use aptos_framework::function_info;
    use aptos_framework::fungible_asset::{Self, FungibleAsset, TransferRef, MintRef, Metadata};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;

    struct Yetki has key { mint: MintRef }

    public fun override_withdraw<T: key>(store: Object<T>, amount: u64, transfer_ref: &TransferRef): FungibleAsset {
        fungible_asset::withdraw_with_ref(transfer_ref, store, amount)
    }
    public fun override_deposit<T: key>(store: Object<T>, fa: FungibleAsset, transfer_ref: &TransferRef) {
        fungible_asset::deposit_with_ref(transfer_ref, store, fa)
    }

    fun init_module(publisher: &signer) {
        let ctor = object::create_named_object(publisher, b"USDC");
        primary_fungible_store::create_primary_store_enabled_fungible_asset(&ctor, option::none(), string::utf8(b"USD Coin (local)"), string::utf8(b"USDC"), 6, string::utf8(b""), string::utf8(b""));
        let w = function_info::new_function_info(publisher, string::utf8(b"usdc"), string::utf8(b"override_withdraw"));
        let d = function_info::new_function_info(publisher, string::utf8(b"usdc"), string::utf8(b"override_deposit"));
        dispatchable_fungible_asset::register_dispatch_functions(&ctor, option::some(w), option::some(d), option::none());
        move_to(publisher, Yetki { mint: fungible_asset::generate_mint_ref(&ctor) });
    }

    public entry fun mint(to: &signer, amount: u64) acquires Yetki {
        primary_fungible_store::mint(&borrow_global<Yetki>(@yerel_usdc).mint, signer::address_of(to), amount);
    }

    #[view] public fun metadata(): Object<Metadata> { object::address_to_object(object::create_object_address(&@yerel_usdc, b"USDC")) }
}
