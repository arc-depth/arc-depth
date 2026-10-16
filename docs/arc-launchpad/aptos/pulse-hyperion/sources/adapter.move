/// Hyperion adapter for ARC PULSE "paste any token as collateral" on Aptos.
///
/// The founder's collateral dollars are swapped into the pasted token through
/// a Hyperion CLMM pool (pool_v3::swap) in the same transaction as the
/// launch. Hyperion returns two assets; the adapter sorts them by metadata,
/// sends unspent dollars back to the founder, and records the dollars the
/// pool actually took in the receipt, so the launchpad's 20-dollar minimum is
/// checked against a real swap. Registered once in the launchpad's Config.
module pulse_hyperion::adapter {
    use std::signer;
    use std::string::String;
    use aptos_framework::object::Object;
    use aptos_framework::fungible_asset::{Self, Metadata, FungibleAsset};
    use aptos_framework::primary_fungible_store;
    use dex::pool_v3::{Self, LiquidityPoolV3};
    use dex::tick_math;
    use pulse::launchpad::{Self, Converted};

    const ESlippage: u64 = 1;
    const EZeroIn: u64 = 2;
    const EWrongPool: u64 = 3;

    /// Only this module can make one; the launchpad accepts receipts only
    /// from the type registered in its Config.
    struct Witness has drop {}

    /// Swap `dollars` of the chain's dollar into `target` through `pool`.
    /// `a2b` is true when the dollar is the pool's token A.
    public fun convert(
        founder: &signer, pool: Object<LiquidityPoolV3>, a2b: bool, target: Object<Metadata>, dollars: u64, min_out: u64,
    ): Converted {
        assert!(dollars > 0, EZeroIn);
        let dollar = launchpad::dollar();
        let fa_in = primary_fungible_store::withdraw(founder, dollar, dollars);
        let limit = if (a2b) tick_math::min_sqrt_price() + 1 else tick_math::max_sqrt_price() - 1;
        let (_, o1, o2) = pool_v3::swap(pool, a2b, true, dollars, fa_in, limit);
        let (out, left) = sort(o1, o2, target, dollar);
        let unspent = fungible_asset::amount(&left);
        primary_fungible_store::deposit(signer::address_of(founder), left);
        assert!(fungible_asset::amount(&out) >= min_out && fungible_asset::amount(&out) > 0, ESlippage);
        launchpad::converted(Witness {}, out, dollars - unspent)
    }

    /// Hyperion's two returned assets: (target out, dollars left)
    fun sort(a: FungibleAsset, b: FungibleAsset, target: Object<Metadata>, dollar: Object<Metadata>): (FungibleAsset, FungibleAsset) {
        let ma = fungible_asset::metadata_from_asset(&a);
        let mb = fungible_asset::metadata_from_asset(&b);
        if (ma == target && mb == dollar) (a, b)
        else {
            assert!(mb == target && ma == dollar, EWrongPool);
            (b, a)
        }
    }

    /// One entry: swap and open the token-backed launch.
    public entry fun launch_with_token(
        founder: &signer, pool: Object<LiquidityPoolV3>, a2b: bool, target: Object<Metadata>, dollars: u64, min_out: u64,
        name: String, symbol: String, decimals: u8, supply: u64, first_buy: u64, tax_ppm: u64, min_tokens: u64,
    ) {
        let conv = convert(founder, pool, a2b, target, dollars, min_out);
        launchpad::launch_backed(founder, name, symbol, decimals, supply, conv, first_buy, tax_ppm, min_tokens);
    }
}
