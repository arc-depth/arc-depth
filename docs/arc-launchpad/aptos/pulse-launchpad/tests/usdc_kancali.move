/// A dollar shaped like Circle's USDC on Aptos mainnet: deposit and withdraw
/// go through dispatch hooks (Circle's run the blocklist and pause checks).
/// Every test uses it, so a plain fungible_asset::deposit/withdraw on a
/// store, which Aptos refuses for such an asset, fails here first, not on
/// mainnet as it did on 16 Oct 2026.
#[test_only]
module pulse::usdc_kancali {
    use std::option;
    use std::string;
    use aptos_framework::dispatchable_fungible_asset;
    use aptos_framework::function_info;
    use aptos_framework::fungible_asset::{Self, FungibleAsset, TransferRef};
    use aptos_framework::object::{ConstructorRef, Object};

    public fun override_withdraw<T: key>(store: Object<T>, amount: u64, transfer_ref: &TransferRef): FungibleAsset {
        fungible_asset::withdraw_with_ref(transfer_ref, store, amount)
    }

    public fun override_deposit<T: key>(store: Object<T>, fa: FungibleAsset, transfer_ref: &TransferRef) {
        fungible_asset::deposit_with_ref(transfer_ref, store, fa)
    }

    /// register the hooks on a freshly created asset, as Circle's stablecoin does
    public fun kancala(ctor: &ConstructorRef) {
        let w = function_info::new_function_info_from_address(@pulse, string::utf8(b"usdc_kancali"), string::utf8(b"override_withdraw"));
        let d = function_info::new_function_info_from_address(@pulse, string::utf8(b"usdc_kancali"), string::utf8(b"override_deposit"));
        dispatchable_fungible_asset::register_dispatch_functions(ctor, option::some(w), option::some(d), option::none());
    }
}
