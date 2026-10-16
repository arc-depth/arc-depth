/// PulseSwap: ARC PULSE's own constant-product pools on Aptos, and the
/// adapter that turns a founder's collateral dollars into a pasted token for
/// pulse::launchpad::launch_backed. No outside DEX is involved.
///
/// POOLS
///   One pool per token K against the chain's dollar (the launchpad's
///   collateral). Anyone may open one with both sides; anyone may add or
///   remove liquidity for shares. x*y=k, 0.30% fee left in the pool for the
///   liquidity providers. No owner, no admin, no fee switch.
///
/// WHY A SWAP COUNTS AS COLLATERAL ONLY IN A SEASONED, DEEP POOL
///   On any DEX a founder can open a thin pool for a worthless token, swap 20
///   dollars into it and pull the dollars back out as liquidity: the swap is
///   real, the collateral is not. A receipt from this adapter therefore
///   requires the pool to be at least MIN_POOL_AGE old and to hold at least
///   DEPTH_MULTIPLE times the swapped dollars on its dollar side before the
///   swap. Faking 20 dollars of collateral then means locking 200 dollars a
///   day ahead, in a pool anyone can trade against.
///
/// OPEN TO EVERYONE, FOR A SMALL FEE THAT BUYS FTHM
///   Any wallet or contract may trade, and any contract may compose a swap
///   through swap_fa (a FungibleAsset in, a FungibleAsset out, no signer).
///   Every swap pays a protocol fee of PROTOCOL_FEE_PPM (0.10%) on its dollar
///   side, beside the 0.30% that stays with liquidity providers. FTHM_SHARE_PPM
///   (5%) of that fee can only ever become FTHM: it accrues in a bucket that
///   buy_fthm (anyone may call it) swaps through the FTHM pool and sends to
///   the FTHM sink fixed at initialize. The rest goes to the platform address.
module pulse_swap::swap {
    use std::signer;
    use std::string::String;
    use aptos_std::smart_table::{Self, SmartTable};
    use aptos_framework::event;
    use aptos_framework::object::{Self, Object, ExtendRef};
    use aptos_framework::fungible_asset::{Self, Metadata, FungibleStore, FungibleAsset};
    // stores move value only through the dispatch-aware calls: Circle's USDC on
    // Aptos runs deposit/withdraw hooks (blocklist, pause), and the plain
    // fungible_asset calls abort on any asset that has them
    use aptos_framework::dispatchable_fungible_asset;
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;
    use pulse::launchpad::{Self, Converted};

    const E_SAME_ASSET: u64 = 1;
    const E_ZERO: u64 = 2;
    const E_SLIPPAGE: u64 = 3;
    const E_NOT_A_POOL: u64 = 4;
    const E_POOL_TOO_YOUNG: u64 = 5;
    const E_POOL_TOO_SHALLOW: u64 = 6;
    const E_NO_SHARES: u64 = 7;
    const E_POOL_EXISTS: u64 = 8;
    const E_NOT_PUBLISHER: u64 = 9;
    const E_ALREADY_INITIALIZED: u64 = 10;

    const FEE_PPM: u128 = 3000;                 // 0.30%, stays in the pool
    const PPM: u128 = 1000000;
    const MIN_POOL_AGE: u64 = 86400;            // seconds
    const DEPTH_MULTIPLE: u64 = 10;
    const MIN_SHARES_LOCKED: u64 = 1000;        // first deposit's dust, never withdrawable
    const PROTOCOL_FEE_PPM: u128 = 1000;        // 0.10% of the dollar side of every swap
    const FTHM_SHARE_PPM: u128 = 50000;         // 5% of the protocol fee, always buys FTHM

    struct Pool has key {
        token: Object<Metadata>,
        dollar: Object<Metadata>,
        token_store: Object<FungibleStore>,
        dollar_store: Object<FungibleStore>,
        token_ref: ExtendRef,
        dollar_ref: ExtendRef,
        shares: SmartTable<address, u64>,
        total_shares: u64,
        created_at: u64,
    }

    /// One pool per token, found from the token's address.
    struct Registry has key { pools: SmartTable<address, address> }

    /// Where the protocol fee goes; set once by the publisher.
    struct Fees has key {
        platform: address,
        fthm: Object<Metadata>,
        fthm_sink: address,
        bucket: Object<FungibleStore>,      // dollars waiting to become FTHM
        bucket_ref: ExtendRef,
    }

    /// Only this module can make one; the launchpad is registered to accept it.
    struct Witness has drop {}

    #[event] struct PoolOpened has drop, store { pool: address, token: address, token_in: u64, dollars_in: u64 }
    #[event] struct Swapped has drop, store { pool: address, trader: address, dollars_to_token: bool, amount_in: u64, amount_out: u64 }
    #[event] struct Converted_ has drop, store { pool: address, founder: address, dollars_in: u64, token_out: u64 }

    fun init_module(publisher: &signer) {
        move_to(publisher, Registry { pools: smart_table::new() });
    }

    #[event] struct FthmBought has drop, store { dollars_in: u64, fthm_out: u64, sink: address }

    /// Fix the platform address, the FTHM asset and the FTHM sink, once.
    public entry fun initialize(publisher: &signer, platform: address, fthm: Object<Metadata>, fthm_sink: address) {
        assert!(signer::address_of(publisher) == @pulse_swap, E_NOT_PUBLISHER);
        assert!(!exists<Fees>(@pulse_swap), E_ALREADY_INITIALIZED);
        let ctor = object::create_sticky_object(@pulse_swap);
        let bucket = fungible_asset::create_store(&ctor, launchpad::dollar());
        move_to(publisher, Fees { platform, fthm, fthm_sink, bucket, bucket_ref: object::generate_extend_ref(&ctor) });
    }

    /// Take the protocol fee out of a dollar asset: 5% to the FTHM bucket,
    /// the rest to the platform. Before initialize there is no fee.
    fun take_fee(d: &mut FungibleAsset) acquires Fees {
        if (!exists<Fees>(@pulse_swap)) return;
        let f = borrow_global<Fees>(@pulse_swap);
        let fee = (((fungible_asset::amount(d) as u128) * PROTOCOL_FEE_PPM / PPM) as u64);
        if (fee == 0) return;
        let to_fthm = (((fee as u128) * FTHM_SHARE_PPM / PPM) as u64);
        dispatchable_fungible_asset::deposit(f.bucket, fungible_asset::extract(d, to_fthm));
        primary_fungible_store::deposit(f.platform, fungible_asset::extract(d, fee - to_fthm));
    }

    /// Anyone may call: the FTHM bucket is swapped through the FTHM pool and
    /// the FTHM sent to the sink. The bucket has no other way out.
    public entry fun buy_fthm() acquires Fees, Registry, Pool {
        let f = borrow_global<Fees>(@pulse_swap);
        let amount = fungible_asset::balance(f.bucket);
        assert!(amount > 0, E_ZERO);
        let d = dispatchable_fungible_asset::withdraw(&object::generate_signer_for_extending(&f.bucket_ref), f.bucket, amount);
        let sink = f.fthm_sink;
        let out = swap_fa(d, f.fthm, true, 1);
        let got = fungible_asset::amount(&out);
        primary_fungible_store::deposit(sink, out);
        event::emit(FthmBought { dollars_in: amount, fthm_out: got, sink });
    }

    #[view] public fun fthm_bucket(): u64 acquires Fees { fungible_asset::balance(borrow_global<Fees>(@pulse_swap).bucket) }

    #[view] public fun pool_of(token: Object<Metadata>): address acquires Registry {
        let r = borrow_global<Registry>(@pulse_swap);
        let k = object::object_address(&token);
        assert!(smart_table::contains(&r.pools, k), E_NOT_A_POOL);
        *smart_table::borrow(&r.pools, k)
    }

    /// Open the pool for `token` with both sides. The opener gets the shares
    /// minus a small locked amount, so the pool can never be emptied to zero.
    public entry fun open_pool(opener: &signer, token: Object<Metadata>, token_amount: u64, dollar_amount: u64) acquires Registry, Pool {
        let dollar = launchpad::dollar();
        assert!(token != dollar, E_SAME_ASSET);
        assert!(token_amount > 0 && dollar_amount > 0, E_ZERO);
        let reg = borrow_global_mut<Registry>(@pulse_swap);
        let k = object::object_address(&token);
        assert!(!smart_table::contains(&reg.pools, k), E_POOL_EXISTS);
        let ctor = object::create_sticky_object(@pulse_swap);
        let pool_signer = object::generate_signer(&ctor);
        let tctor = object::create_sticky_object(@pulse_swap);
        let dctor = object::create_sticky_object(@pulse_swap);
        let pool = Pool {
            token, dollar,
            token_store: fungible_asset::create_store(&tctor, token),
            dollar_store: fungible_asset::create_store(&dctor, dollar),
            token_ref: object::generate_extend_ref(&tctor),
            dollar_ref: object::generate_extend_ref(&dctor),
            shares: smart_table::new(), total_shares: 0, created_at: timestamp::now_seconds(),
        };
        move_to(&pool_signer, pool);
        let addr = object::address_from_constructor_ref(&ctor);
        smart_table::add(&mut reg.pools, k, addr);
        event::emit(PoolOpened { pool: addr, token: k, token_in: token_amount, dollars_in: dollar_amount });
        add_liquidity_inner(opener, addr, token_amount, dollar_amount, true);
    }

    fun isqrt(x: u128): u128 {
        if (x == 0) return 0;
        let z = x; let y = (x + 1) / 2;
        while (y < z) { z = y; y = (x / y + y) / 2; };
        z
    }

    fun add_liquidity_inner(who: &signer, pool_addr: address, token_amount: u64, dollar_amount: u64, first: bool) acquires Pool {
        let p = borrow_global_mut<Pool>(pool_addr);
        let tr = fungible_asset::balance(p.token_store);
        let dr = fungible_asset::balance(p.dollar_store);
        let minted = if (first) {
            let s = (isqrt((token_amount as u128) * (dollar_amount as u128)) as u64);
            assert!(s > MIN_SHARES_LOCKED, E_ZERO);
            p.total_shares = MIN_SHARES_LOCKED;      // locked forever, owned by no one
            s - MIN_SHARES_LOCKED
        } else {
            let a = ((token_amount as u128) * (p.total_shares as u128) / (tr as u128));
            let b = ((dollar_amount as u128) * (p.total_shares as u128) / (dr as u128));
            ((if (a < b) a else b) as u64)
        };
        assert!(minted > 0, E_ZERO);
        dispatchable_fungible_asset::deposit(p.token_store, primary_fungible_store::withdraw(who, p.token, token_amount));
        dispatchable_fungible_asset::deposit(p.dollar_store, primary_fungible_store::withdraw(who, p.dollar, dollar_amount));
        let w = signer::address_of(who);
        let cur = if (smart_table::contains(&p.shares, w)) smart_table::remove(&mut p.shares, w) else 0;
        smart_table::add(&mut p.shares, w, cur + minted);
        p.total_shares = p.total_shares + minted;
    }

    public entry fun add_liquidity(who: &signer, token: Object<Metadata>, token_amount: u64, dollar_amount: u64) acquires Registry, Pool {
        add_liquidity_inner(who, pool_of(token), token_amount, dollar_amount, false);
    }

    public entry fun remove_liquidity(who: &signer, token: Object<Metadata>, shares: u64) acquires Registry, Pool {
        let p = borrow_global_mut<Pool>(pool_of(token));
        let w = signer::address_of(who);
        assert!(shares > 0 && smart_table::contains(&p.shares, w) && *smart_table::borrow(&p.shares, w) >= shares, E_NO_SHARES);
        let held = smart_table::remove(&mut p.shares, w);
        if (held > shares) smart_table::add(&mut p.shares, w, held - shares);
        let t_out = (((fungible_asset::balance(p.token_store) as u128) * (shares as u128) / (p.total_shares as u128)) as u64);
        let d_out = (((fungible_asset::balance(p.dollar_store) as u128) * (shares as u128) / (p.total_shares as u128)) as u64);
        p.total_shares = p.total_shares - shares;
        let ts = object::generate_signer_for_extending(&p.token_ref);
        let ds = object::generate_signer_for_extending(&p.dollar_ref);
        primary_fungible_store::deposit(w, dispatchable_fungible_asset::withdraw(&ts, p.token_store, t_out));
        primary_fungible_store::deposit(w, dispatchable_fungible_asset::withdraw(&ds, p.dollar_store, d_out));
    }

    /// amount out of x*y=k after the 0.30% fee stays in the pool
    public fun quote(reserve_in: u64, reserve_out: u64, amount_in: u64): u64 {
        let in_after_fee = (amount_in as u128) * (PPM - FEE_PPM) / PPM;
        ((reserve_out as u128) * in_after_fee / ((reserve_in as u128) + in_after_fee) as u64)
    }

    /// Swap inside the pool; returns the asset out.
    fun swap_inner(pool_addr: address, fa_in: FungibleAsset, dollars_to_token: bool, min_out: u64): FungibleAsset acquires Pool, Fees {
        if (dollars_to_token) take_fee(&mut fa_in);
        let out = swap_raw(pool_addr, fa_in, dollars_to_token);
        if (!dollars_to_token) take_fee(&mut out);
        assert!(fungible_asset::amount(&out) >= min_out && fungible_asset::amount(&out) > 0, E_SLIPPAGE);
        out
    }

    fun swap_raw(pool_addr: address, fa_in: FungibleAsset, dollars_to_token: bool): FungibleAsset acquires Pool {
        let p = borrow_global<Pool>(pool_addr);
        let amount_in = fungible_asset::amount(&fa_in);
        assert!(amount_in > 0, E_ZERO);
        let (rin, rout) = if (dollars_to_token) (fungible_asset::balance(p.dollar_store), fungible_asset::balance(p.token_store))
                          else (fungible_asset::balance(p.token_store), fungible_asset::balance(p.dollar_store));
        let out = quote(rin, rout, amount_in);
        assert!(out > 0, E_SLIPPAGE);
        if (dollars_to_token) {
            dispatchable_fungible_asset::deposit(p.dollar_store, fa_in);
            dispatchable_fungible_asset::withdraw(&object::generate_signer_for_extending(&p.token_ref), p.token_store, out)
        } else {
            dispatchable_fungible_asset::deposit(p.token_store, fa_in);
            dispatchable_fungible_asset::withdraw(&object::generate_signer_for_extending(&p.dollar_ref), p.dollar_store, out)
        }
    }

    /// For other contracts: swap an asset already in hand, no signer needed.
    /// `token` names the pool; `fa_in` must be that pool's dollar (when
    /// dollars_to_token) or its token.
    public fun swap_fa(fa_in: FungibleAsset, token: Object<Metadata>, dollars_to_token: bool, min_out: u64): FungibleAsset acquires Registry, Pool, Fees {
        let addr = pool_of(token);
        let p = borrow_global<Pool>(addr);
        assert!(fungible_asset::metadata_from_asset(&fa_in) == (if (dollars_to_token) p.dollar else p.token), E_SAME_ASSET);
        swap_inner(addr, fa_in, dollars_to_token, min_out)
    }

    /// Anyone's trade, either direction.
    public entry fun swap(trader: &signer, token: Object<Metadata>, dollars_to_token: bool, amount_in: u64, min_out: u64) acquires Registry, Pool, Fees {
        let addr = pool_of(token);
        let p = borrow_global<Pool>(addr);
        let asset_in = if (dollars_to_token) p.dollar else p.token;
        let fa_in = primary_fungible_store::withdraw(trader, asset_in, amount_in);
        let out = swap_inner(addr, fa_in, dollars_to_token, min_out);
        let amount_out = fungible_asset::amount(&out);
        primary_fungible_store::deposit(signer::address_of(trader), out);
        event::emit(Swapped { pool: addr, trader: signer::address_of(trader), dollars_to_token, amount_in, amount_out });
    }

    /// The adapter: swap the founder's dollars into `token` in a seasoned,
    /// deep pool and vouch for the dollars in.
    public fun convert(founder: &signer, token: Object<Metadata>, dollars: u64, min_out: u64): Converted acquires Registry, Pool, Fees {
        let addr = pool_of(token);
        {
            let p = borrow_global<Pool>(addr);
            assert!(timestamp::now_seconds() >= p.created_at + MIN_POOL_AGE, E_POOL_TOO_YOUNG);
            assert!(fungible_asset::balance(p.dollar_store) >= dollars * DEPTH_MULTIPLE, E_POOL_TOO_SHALLOW);
        };
        let fa_in = primary_fungible_store::withdraw(founder, launchpad::dollar(), dollars);
        let out = swap_inner(addr, fa_in, true, min_out);
        event::emit(Converted_ { pool: addr, founder: signer::address_of(founder), dollars_in: dollars, token_out: fungible_asset::amount(&out) });
        launchpad::converted(Witness {}, out, dollars)
    }

    /// One entry: swap and open the token-backed launch.
    public entry fun launch_with_token(
        founder: &signer, token: Object<Metadata>, dollars: u64, min_out: u64,
        name: String, symbol: String, decimals: u8, supply: u64, first_buy: u64, tax_ppm: u64, min_tokens: u64,
    ) acquires Registry, Pool, Fees {
        let conv = convert(founder, token, dollars, min_out);
        launchpad::launch_backed(founder, name, symbol, decimals, supply, conv, first_buy, tax_ppm, min_tokens);
    }

    #[view] public fun reserves(token: Object<Metadata>): (u64, u64, u64) acquires Registry, Pool {
        let p = borrow_global<Pool>(pool_of(token));
        (fungible_asset::balance(p.token_store), fungible_asset::balance(p.dollar_store), p.created_at)
    }

    #[view] public fun shares_of(token: Object<Metadata>, who: address): u64 acquires Registry, Pool {
        let p = borrow_global<Pool>(pool_of(token));
        if (smart_table::contains(&p.shares, who)) *smart_table::borrow(&p.shares, who) else 0
    }

    #[test_only] public fun init_for_testing(publisher: &signer) { init_module(publisher) }
}
