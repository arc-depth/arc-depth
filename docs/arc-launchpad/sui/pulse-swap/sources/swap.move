/// PulseSwap on Sui: the same design as aptos/pulse-swap.
///
/// One shared Pool<K, C> per token K against the chain's dollar C. x*y=k,
/// 0.30% left with liquidity providers, shares tracked per address. Anyone
/// trades; any contract composes through swap_coin (a Coin in, a Coin out).
///
/// A swap vouches for collateral (convert -> launchpad Converted receipt)
/// only in a pool at least 24 hours old whose dollar side holds at least ten
/// times the dollars swapped, so a thin pool opened for a worthless token
/// cannot pass as 20 dollars of backing.
///
/// Protocol fee: 0.10% of every swap's dollar side. 5% of it can only become
/// FTHM: it waits in Fees.bucket until buy_fthm (anyone may call) swaps it
/// through the FTHM pool and sends the FTHM to the sink fixed at initialize.
/// The rest goes to the platform address. No owner after initialize.
module pulse_swap::swap {
    use std::type_name::{Self, TypeName};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use sui::event;
    use pulse::launchpad::{Self, Config, Converted};

    const ESameAsset: u64 = 1;
    const EZero: u64 = 2;
    const ESlippage: u64 = 3;
    const EPoolTooYoung: u64 = 5;
    const EPoolTooShallow: u64 = 6;
    const ENoShares: u64 = 7;
    const EPoolExists: u64 = 8;
    const EWrongFthm: u64 = 9;

    const PPM: u128 = 1_000_000;
    const LP_FEE_PPM: u128 = 3_000;
    const PROTOCOL_FEE_PPM: u128 = 1_000;
    const FTHM_SHARE_PPM: u128 = 50_000;
    const MIN_POOL_AGE_MS: u64 = 86_400_000;
    const DEPTH_MULTIPLE: u64 = 10;
    const MIN_SHARES_LOCKED: u64 = 1_000;

    public struct Pool<phantom K, phantom C> has key {
        id: UID,
        token: Balance<K>,
        dollars: Balance<C>,
        shares: Table<address, u64>,
        total_shares: u64,
        created_ms: u64,
    }

    /// One pool per token type.
    public struct Registry has key { id: UID, pools: Table<TypeName, ID> }

    /// Consumed by initialize, once.
    public struct FeeCap has key { id: UID }

    public struct Fees<phantom C> has key {
        id: UID,
        platform: address,
        fthm: TypeName,
        fthm_sink: address,
        bucket: Balance<C>,
    }

    public struct Witness has drop {}

    public struct PoolOpened has copy, drop { pool: ID, token: TypeName }
    public struct Swapped has copy, drop { pool: ID, dollars_to_token: bool, amount_in: u64, amount_out: u64 }
    public struct FthmBought has copy, drop { dollars_in: u64, fthm_out: u64, sink: address }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(Registry { id: object::new(ctx), pools: table::new(ctx) });
        transfer::transfer(FeeCap { id: object::new(ctx) }, ctx.sender());
    }

    /// Fix platform, FTHM type and FTHM sink, once; the capability is destroyed.
    public fun initialize<C, F>(cap: FeeCap, platform: address, fthm_sink: address, ctx: &mut TxContext) {
        let FeeCap { id } = cap;
        id.delete();
        transfer::share_object(Fees<C> { id: object::new(ctx), platform, fthm: type_name::with_defining_ids<F>(), fthm_sink, bucket: balance::zero() });
    }

    fun isqrt(x: u128): u128 {
        if (x == 0) return 0;
        let mut z = x; let mut y = (x + 1) / 2;
        while (y < z) { z = y; y = (x / y + y) / 2; };
        z
    }

    public fun open_pool<K, C>(reg: &mut Registry, token: Coin<K>, dollars: Coin<C>, clock: &Clock, ctx: &mut TxContext) {
        assert!(type_name::with_defining_ids<K>() != type_name::with_defining_ids<C>(), ESameAsset);
        let k = type_name::with_defining_ids<K>();
        assert!(!reg.pools.contains(k), EPoolExists);
        let t = token.value(); let d = dollars.value();
        assert!(t > 0 && d > 0, EZero);
        let s = (isqrt((t as u128) * (d as u128)) as u64);
        assert!(s > MIN_SHARES_LOCKED, EZero);
        let mut shares = table::new(ctx);
        shares.add(ctx.sender(), s - MIN_SHARES_LOCKED);
        let pool = Pool<K, C> { id: object::new(ctx), token: token.into_balance(), dollars: dollars.into_balance(), shares, total_shares: s, created_ms: clock.timestamp_ms() };
        reg.pools.add(k, object::id(&pool));
        event::emit(PoolOpened { pool: object::id(&pool), token: k });
        transfer::share_object(pool);
    }

    public fun add_liquidity<K, C>(p: &mut Pool<K, C>, token: Coin<K>, dollars: Coin<C>, ctx: &TxContext) {
        let a = ((token.value() as u128) * (p.total_shares as u128) / (p.token.value() as u128));
        let b = ((dollars.value() as u128) * (p.total_shares as u128) / (p.dollars.value() as u128));
        let minted = ((if (a < b) a else b) as u64);
        assert!(minted > 0, EZero);
        p.token.join(token.into_balance());
        p.dollars.join(dollars.into_balance());
        let w = ctx.sender();
        let cur = if (p.shares.contains(w)) p.shares.remove(w) else 0;
        p.shares.add(w, cur + minted);
        p.total_shares = p.total_shares + minted;
    }

    public fun remove_liquidity<K, C>(p: &mut Pool<K, C>, shares: u64, ctx: &mut TxContext): (Coin<K>, Coin<C>) {
        let w = ctx.sender();
        assert!(shares > 0 && p.shares.contains(w) && *p.shares.borrow(w) >= shares, ENoShares);
        let held = p.shares.remove(w);
        if (held > shares) p.shares.add(w, held - shares);
        let t = (((p.token.value() as u128) * (shares as u128) / (p.total_shares as u128)) as u64);
        let d = (((p.dollars.value() as u128) * (shares as u128) / (p.total_shares as u128)) as u64);
        p.total_shares = p.total_shares - shares;
        (coin::from_balance(p.token.split(t), ctx), coin::from_balance(p.dollars.split(d), ctx))
    }

    public fun quote(reserve_in: u64, reserve_out: u64, amount_in: u64): u64 {
        let in_after = (amount_in as u128) * (PPM - LP_FEE_PPM) / PPM;
        ((reserve_out as u128) * in_after / ((reserve_in as u128) + in_after) as u64)
    }

    fun take_fee<C>(fees: &mut Fees<C>, d: &mut Balance<C>, ctx: &mut TxContext) {
        let fee = (((d.value() as u128) * PROTOCOL_FEE_PPM / PPM) as u64);
        if (fee == 0) return;
        let to_fthm = (((fee as u128) * FTHM_SHARE_PPM / PPM) as u64);
        fees.bucket.join(d.split(to_fthm));
        transfer::public_transfer(coin::from_balance(d.split(fee - to_fthm), ctx), fees.platform);
    }

    /// dollars -> token
    public fun buy<K, C>(p: &mut Pool<K, C>, fees: &mut Fees<C>, dollars: Coin<C>, min_out: u64, ctx: &mut TxContext): Coin<K> {
        let mut d = dollars.into_balance();
        let amount_in = d.value();
        assert!(amount_in > 0, EZero);
        take_fee(fees, &mut d, ctx);
        let out = quote(p.dollars.value(), p.token.value(), d.value());
        assert!(out >= min_out && out > 0, ESlippage);
        p.dollars.join(d);
        event::emit(Swapped { pool: object::id(p), dollars_to_token: true, amount_in, amount_out: out });
        coin::from_balance(p.token.split(out), ctx)
    }

    /// token -> dollars
    public fun sell<K, C>(p: &mut Pool<K, C>, fees: &mut Fees<C>, token: Coin<K>, min_out: u64, ctx: &mut TxContext): Coin<C> {
        let amount_in = token.value();
        assert!(amount_in > 0, EZero);
        let gross = quote(p.token.value(), p.dollars.value(), amount_in);
        p.token.join(token.into_balance());
        let mut d = p.dollars.split(gross);
        take_fee(fees, &mut d, ctx);
        assert!(d.value() >= min_out && d.value() > 0, ESlippage);
        event::emit(Swapped { pool: object::id(p), dollars_to_token: false, amount_in, amount_out: d.value() });
        coin::from_balance(d, ctx)
    }

    /// The adapter: swap the founder's dollars into K in a seasoned, deep
    /// pool and vouch for the dollars in.
    public fun convert<K, C>(p: &mut Pool<K, C>, fees: &mut Fees<C>, cfg: &Config, dollars: Coin<C>, min_out: u64, clock: &Clock, ctx: &mut TxContext): Converted<C, K> {
        let amount = dollars.value();
        assert!(clock.timestamp_ms() >= p.created_ms + MIN_POOL_AGE_MS, EPoolTooYoung);
        assert!(p.dollars.value() >= amount * DEPTH_MULTIPLE, EPoolTooShallow);
        let out = buy(p, fees, dollars, min_out, ctx);
        launchpad::converted<C, K, Witness>(cfg, Witness {}, out, amount)
    }

    /// Anyone may call: the bucket becomes FTHM at the sink, nowhere else.
    public fun buy_fthm<F, C>(fthm_pool: &mut Pool<F, C>, fees: &mut Fees<C>, ctx: &mut TxContext) {
        assert!(type_name::with_defining_ids<F>() == fees.fthm, EWrongFthm);
        let amount = fees.bucket.value();
        assert!(amount > 0, EZero);
        let d = coin::from_balance(fees.bucket.split(amount), ctx);
        let sink = fees.fthm_sink;
        let out = buy(fthm_pool, fees, d, 1, ctx);
        event::emit(FthmBought { dollars_in: amount, fthm_out: out.value(), sink });
        transfer::public_transfer(out, sink);
    }

    public fun reserves<K, C>(p: &Pool<K, C>): (u64, u64, u64) { (p.token.value(), p.dollars.value(), p.created_ms) }
    public fun shares_of<K, C>(p: &Pool<K, C>, who: address): u64 { if (p.shares.contains(who)) *p.shares.borrow(who) else 0 }
    public fun fthm_bucket<C>(fees: &Fees<C>): u64 { fees.bucket.value() }

    #[test_only] public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }
}
