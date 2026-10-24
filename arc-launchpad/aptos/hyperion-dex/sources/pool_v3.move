module dex::pool_v3 {
    use std::signer;
    use std::vector;
    use aptos_framework::object::{Self, Object, ExtendRef};
    use aptos_framework::fungible_asset::{Self, Metadata, FungibleStore, FungibleAsset};
    use aptos_framework::dispatchable_fungible_asset;

    const Q64: u256 = 18446744073709551616;
    const MILYON: u256 = 1000000;

    struct LiquidityPoolV3 has key {
        a: Object<Metadata>,
        b: Object<Metadata>,
        sa: Object<FungibleStore>,
        sb: Object<FungibleStore>,
        sqrt: u128,
        likidite: u128,
        ucret_ppm: u64,
        ref: ExtendRef,
    }

    /// Exact input only in this stand-in. a2b: token A in, the price (sqrt of
    /// B per A, Q64) falls to at most `sqrt_price_limit`; else B in, it rises.
    /// Returns (input used, the output, what was not used).
    public fun swap(pool: Object<LiquidityPoolV3>, a2b: bool, by_amount_in: bool, amount: u64, fa_in: FungibleAsset, sqrt_price_limit: u128): (u64, FungibleAsset, FungibleAsset) acquires LiquidityPoolV3 {
        assert!(by_amount_in, 1);
        let p = borrow_global_mut<LiquidityPoolV3>(object::object_address(&pool));
        let l = (p.likidite as u256);
        let s = (p.sqrt as u256);
        let sl = (sqrt_price_limit as u256);
        let f = (p.ucret_ppm as u256);
        let istek = (amount as u256) * (MILYON - f) / MILYON;
        let ps = object::generate_signer_for_extending(&p.ref);
        let (net, yeni, cikan) = if (a2b) {
            assert!(sl < s, 2);
            let tavan = l * Q64 * (s - sl) / (s * sl);
            let (net, yeni) = if (istek >= tavan) (tavan, sl) else (istek, l * Q64 * s / (l * Q64 + istek * s));
            (net, yeni, l * (s - yeni) / Q64)
        } else {
            assert!(sl > s, 2);
            let tavan = l * (sl - s) / Q64;
            let (net, yeni) = if (istek >= tavan) (tavan, sl) else (istek, s + istek * Q64 / l);
            (net, yeni, l * Q64 * (yeni - s) / (s * yeni))
        };
        let odenen = if (net == istek) amount else (((net * MILYON + MILYON - f - 1) / (MILYON - f)) as u64);
        p.sqrt = (yeni as u128);
        let giren = fungible_asset::extract(&mut fa_in, odenen);
        let out = if (a2b) {
            dispatchable_fungible_asset::deposit(p.sa, giren);
            dispatchable_fungible_asset::withdraw(&ps, p.sb, (cikan as u64))
        } else {
            dispatchable_fungible_asset::deposit(p.sb, giren);
            dispatchable_fungible_asset::withdraw(&ps, p.sa, (cikan as u64))
        };
        (odenen, out, fa_in)
    }

    #[view] public fun current_tick_and_price(pool: address): (u32, u128) acquires LiquidityPoolV3 { (0, borrow_global<LiquidityPoolV3>(pool).sqrt) }

    #[view] public fun supported_inner_assets(pool: Object<LiquidityPoolV3>): vector<Object<Metadata>> acquires LiquidityPoolV3 {
        let p = borrow_global<LiquidityPoolV3>(object::object_address(&pool));
        let v = vector::empty();
        vector::push_back(&mut v, p.a);
        vector::push_back(&mut v, p.b);
        v
    }

    /// stand-in only: a pool of `a`/`b` at `sqrt`, liquidity `likidite`.
    public fun yeni_test(yaratan: &signer, a: Object<Metadata>, b: Object<Metadata>, sqrt: u128, likidite: u128, ucret_ppm: u64): Object<LiquidityPoolV3> {
        let c = object::create_object(signer::address_of(yaratan));
        let ref = object::generate_extend_ref(&c);
        let ps = object::generate_signer(&c);
        let ca = object::create_object(signer::address_of(&ps));
        let cb = object::create_object(signer::address_of(&ps));
        let sa = fungible_asset::create_store(&ca, a);
        let sb = fungible_asset::create_store(&cb, b);
        move_to(&ps, LiquidityPoolV3 { a, b, sa, sb, sqrt, likidite, ucret_ppm, ref });
        object::object_from_constructor_ref<LiquidityPoolV3>(&c)
    }
    /// stand-in only
    public fun yatir_test(pool: Object<LiquidityPoolV3>, fa: FungibleAsset) acquires LiquidityPoolV3 {
        let p = borrow_global<LiquidityPoolV3>(object::object_address(&pool));
        let st = if (fungible_asset::metadata_from_asset(&fa) == p.a) p.sa else p.sb;
        dispatchable_fungible_asset::deposit(st, fa);
    }
    /// stand-in only: the price pushed, as a large swap would leave it.
    public fun fiyat_test(pool: Object<LiquidityPoolV3>, sqrt: u128) acquires LiquidityPoolV3 {
        borrow_global_mut<LiquidityPoolV3>(object::object_address(&pool)).sqrt = sqrt;
    }
}
