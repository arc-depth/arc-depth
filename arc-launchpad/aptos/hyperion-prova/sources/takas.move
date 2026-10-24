script {
    use std::signer;
    use aptos_framework::object;
    use aptos_framework::fungible_asset::Metadata;
    use aptos_framework::primary_fungible_store;
    use dex::pool_v3::{Self, LiquidityPoolV3};

    /// `miktar` of `girdi` into Hyperion pool `havuz` (exact input, price limit), both returned assets back to the sender.
    fun takas(s: &signer, havuz: address, girdi: address, miktar: u64, a2b: bool, limit: u128) {
        let fa = primary_fungible_store::withdraw(s, object::address_to_object<Metadata>(girdi), miktar);
        let (_, a, b) = pool_v3::swap(object::address_to_object<LiquidityPoolV3>(havuz), a2b, true, miktar, fa, limit);
        primary_fungible_store::deposit(signer::address_of(s), a);
        primary_fungible_store::deposit(signer::address_of(s), b);
    }
}
