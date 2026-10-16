module dex::pool_v3 {
    use aptos_framework::object::Object;
    use aptos_framework::fungible_asset::FungibleAsset;

    struct LiquidityPoolV3 has key { dummy: bool }

    /// pool, a_to_b, by_amount_in, amount, asset in, sqrt price limit
    public fun swap(_pool: Object<LiquidityPoolV3>, _a2b: bool, _by_amount_in: bool, _amount: u64, _fa_in: FungibleAsset, _sqrt_price_limit: u128): (u64, FungibleAsset, FungibleAsset) { abort 0 }
}
