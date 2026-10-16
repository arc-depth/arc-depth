/// ARC PULSE launchpad on Aptos: a fixed-supply token born with its own
/// collateral vault and its own locked trading pool. The Move counterpart of
/// contracts/nesil3/PulseLaunchpad3.sol + PulseHook.sol + CollateralVault.sol.
///
/// THE VAULT RULE (same as EVM)
///   Collateral leaves only by burning tokens, and only in proportion to the
///   CIRCULATING supply (tokens held by the pool are not circulating, as
///   dolasim() excludes the pool on EVM):
///       payout = backing * amount / (supply - pool tokens)
///
/// THE POOL
///   The whole supply is minted into the pool; nobody gets free tokens, the
///   founder buys their share with the first buy like everyone else. The pool
///   prices on x*y=k with a virtual dollar reserve equal to the opening market
///   cap (3,500 dollars, as ACILIS_MCAP), so every launch opens at the same
///   price. The virtual reserve can never be paid out: a sell can only take
///   real dollars that buys put in, and the pool has no withdraw function.
///
/// FEES (constants, as on EVM)
///   launch fee 2% of the first buy -> platform; the rest of the first buy
///                 is pool bid (no trade fee, tax or snipe on it, as on EVM)
///   trade fee 2%: 0.30% founder, 0.70% stays in the pool as depth,
///                 1.00% platform (EVM splits this 1% across developer fund,
///                 liquidity vault and operations; those DAO funds do not
///                 exist on Aptos yet, so it goes to the platform address
///                 fixed at initialize)
///   collateral tax 1-5%, chosen at launch, never changeable -> the vault
///   anti-snipe on buys: 99% in the opening second, quartering every second,
///                 zero after 5 s; stays in the pool as depth (the founder's
///                 opening buy is exempt, as on EVM)
///   volume shield on sells: more than 0.50% of circulating sold in one block
///                 pays the excess (up to 3%) as extra tax to the vault
///
/// NOT HERE (kept out, not faked)
///   bridging to the other chains. "Paste any token as collateral" is
///   launch_backed: the registered DEX adapter swaps the founder's dollars
///   into the token in the same transaction and vouches for the dollars in.
module pulse::launchpad {
    use std::signer;
    use std::string::String;
    use std::option::{Self, Option};
    use std::string;
    use aptos_std::type_info;
    use aptos_framework::event;
    use aptos_framework::object::{Self, Object, ExtendRef};
    use aptos_framework::fungible_asset::{Self, Metadata, BurnRef, FungibleStore, FungibleAsset};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;

    const E_NOT_PUBLISHER: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_NOT_INITIALIZED: u64 = 3;
    const E_COLLATERAL_TOO_LOW: u64 = 4;
    const E_ZERO_SUPPLY: u64 = 5;
    const E_ZERO_AMOUNT: u64 = 6;
    const E_NOT_A_LAUNCH: u64 = 7;
    const E_FIRST_BUY_RANGE: u64 = 8;
    const E_TAX_RANGE: u64 = 9;
    const E_SLIPPAGE: u64 = 10;
    const E_NOT_CIRCULATING: u64 = 11;
    const E_TARGET_BACKED: u64 = 12;
    const E_NOT_TARGET_BACKED: u64 = 13;
    const E_SAME_ASSET: u64 = 14;
    const E_NOT_ADAPTER: u64 = 15;
    const E_ADAPTER_SET: u64 = 16;

    const MIN_COLLATERAL_DOLLARS: u64 = 20;
    const OPENING_MCAP_DOLLARS: u64 = 3500;
    const MIN_FIRST_BUY_DOLLARS: u64 = 100;
    const MAX_FIRST_BUY_DOLLARS: u64 = 500;
    const PPM: u64 = 1000000;
    const LAUNCH_FEE_PPM: u64 = 20000;     // 2.00% of the first buy
    const FOUNDER_PPM: u64 = 3000;         // 0.30% of every trade
    const DEPTH_PPM: u64 = 7000;           // 0.70%, stays in the pool
    const PLATFORM_PPM: u64 = 10000;       // 1.00%
    const TAX_MIN_PPM: u64 = 10000;        // 1%
    const TAX_MAX_PPM: u64 = 50000;        // 5%
    /// anti-snipe: 99% in the pool's opening second, quartering every second,
    /// zero from SNIPE_SECONDS on (PulseHook SNIPE_PPM / SNIPE_SURESI)
    const SNIPE_PPM: u64 = 990000;
    const SNIPE_SECONDS: u64 = 5;
    /// volume shield: selling more than 0.50% of circulating in one block
    /// pays the excess as extra tax to the vault, capped at 3.00%
    const SHIELD_THRESHOLD_PPM: u64 = 5000;
    const SHIELD_CAP_PPM: u64 = 30000;
    const FLOOR_SCALE: u256 = 1000000000000000000000000000000000000;

    struct Config has key {
        collateral: Object<Metadata>,
        unit: u64,
        platform: address,
        /// the one DEX adapter allowed to issue Converted receipts: the type
        /// name of its witness, which only the adapter's module can construct
        adapter: Option<string::String>,
    }

    /// Set when a launch is backed by a pasted token: the vault holds that
    /// token in this second store, beside the tax dollars in Launch.vault.
    struct Backed has key {
        target: Object<Metadata>,
        store: Object<FungibleStore>,
        store_ref: ExtendRef,
    }

    /// Proof that `dollars_in` of the chain's dollar were swapped into `fa`
    /// in this transaction. No abilities: it can only be consumed by
    /// launch_backed, and only the registered adapter can make one.
    struct Converted { fa: FungibleAsset, dollars_in: u64 }

    /// Lives at the token's metadata object address.
    struct Launch has key {
        founder: address,
        collateral: Object<Metadata>,
        tax_ppm: u64,
        vault: Object<FungibleStore>,
        vault_ref: ExtendRef,
        burn_ref: BurnRef,
        pool_tokens: Object<FungibleStore>,
        pool_dollars: Object<FungibleStore>,
        pool_ref: ExtendRef,       // owner of pool_tokens
        pool_dref: ExtendRef,      // owner of pool_dollars (one store per object on Aptos)
        virtual_dollars: u64,
        opened_at: u64,            // seconds; the anti-snipe clock
        shield_at: u64,            // microseconds of the block the window belongs to
        shield_ppm: u64,           // share of circulating sold in that block
    }

    #[event] struct Launched has drop, store { token: address, founder: address, supply: u64, collateral: u64, first_buy: u64, tax_ppm: u64 }
    #[event] struct Traded has drop, store { token: address, trader: address, buy: bool, dollars: u64, tokens: u64, fee: u64, tax: u64 }
    #[event] struct Redeemed has drop, store { token: address, holder: address, burned: u64, payout: u64 }
    #[event] struct Funded has drop, store { token: address, from: address, amount: u64 }

    /// Fixes the chain's dollar and the platform fee address. Once, by the
    /// publishing account; nothing is configurable afterwards.
    public entry fun initialize(publisher: &signer, collateral: Object<Metadata>, platform: address) {
        assert!(signer::address_of(publisher) == @pulse, E_NOT_PUBLISHER);
        assert!(!exists<Config>(@pulse), E_ALREADY_INITIALIZED);
        let dec = fungible_asset::decimals(collateral);
        let unit = 1u64;
        let i = 0u8;
        while (i < dec) { unit = unit * 10; i = i + 1; };
        move_to(publisher, Config { collateral, unit, platform, adapter: option::none() });
    }

    /// Fix the adapter's witness type, once, by the publishing account.
    public entry fun register_adapter<W: drop>(publisher: &signer) acquires Config {
        assert!(signer::address_of(publisher) == @pulse, E_NOT_PUBLISHER);
        let cfg = borrow_global_mut<Config>(@pulse);
        assert!(option::is_none(&cfg.adapter), E_ADAPTER_SET);
        cfg.adapter = option::some(type_info::type_name<W>());
    }

    /// Called by the registered adapter after swapping `dollars_in` of the
    /// chain's dollar into `fa` in this transaction.
    public fun converted<W: drop>(_w: W, fa: FungibleAsset, dollars_in: u64): Converted acquires Config {
        let cfg = borrow_global<Config>(@pulse);
        assert!(option::is_some(&cfg.adapter) && *option::borrow(&cfg.adapter) == type_info::type_name<W>(), E_NOT_ADAPTER);
        Converted { fa, dollars_in }
    }

    public entry fun launch(
        founder: &signer, name: String, symbol: String, decimals: u8, supply: u64,
        collateral_amount: u64, first_buy: u64, tax_ppm: u64, min_tokens: u64,
    ) acquires Config, Launch {
        launch_token(founder, name, symbol, decimals, supply, collateral_amount, first_buy, tax_ppm, min_tokens);
    }

    /// Create the token, mint the whole supply into the locked pool, lock the
    /// collateral in the vault, and make the founder's first buy.
    public fun launch_token(
        founder: &signer, name: String, symbol: String, decimals: u8, supply: u64,
        collateral_amount: u64, first_buy: u64, tax_ppm: u64, min_tokens: u64,
    ): Object<Metadata> acquires Config, Launch {
        assert!(exists<Config>(@pulse), E_NOT_INITIALIZED);
        let cfg = borrow_global<Config>(@pulse);
        assert!(collateral_amount >= MIN_COLLATERAL_DOLLARS * cfg.unit, E_COLLATERAL_TOO_LOW);
        let dollars = primary_fungible_store::withdraw(founder, cfg.collateral, collateral_amount);
        open(founder, name, symbol, decimals, supply, dollars, option::none(), first_buy, tax_ppm, min_tokens)
    }

    /// The same launch backed by a pasted token: the founder's collateral
    /// dollars were swapped into it by the registered adapter in this
    /// transaction; the Converted receipt says how many dollars went in.
    public fun launch_backed(
        founder: &signer, name: String, symbol: String, decimals: u8, supply: u64,
        conv: Converted, first_buy: u64, tax_ppm: u64, min_tokens: u64,
    ): Object<Metadata> acquires Config, Launch {
        assert!(exists<Config>(@pulse), E_NOT_INITIALIZED);
        let Converted { fa, dollars_in } = conv;
        let cfg = borrow_global<Config>(@pulse);
        assert!(fungible_asset::metadata_from_asset(&fa) != cfg.collateral, E_SAME_ASSET);
        assert!(dollars_in >= MIN_COLLATERAL_DOLLARS * cfg.unit && fungible_asset::amount(&fa) > 0, E_COLLATERAL_TOO_LOW);
        let none = fungible_asset::zero(cfg.collateral);
        open(founder, name, symbol, decimals, supply, none, option::some(fa), first_buy, tax_ppm, min_tokens)
    }

    fun open(
        founder: &signer, name: String, symbol: String, decimals: u8, supply: u64,
        dollars: FungibleAsset, target: Option<FungibleAsset>, first_buy: u64, tax_ppm: u64, min_tokens: u64,
    ): Object<Metadata> acquires Config, Launch {
        let cfg = borrow_global<Config>(@pulse);
        let unit = cfg.unit;
        let collateral = cfg.collateral;
        let platform = cfg.platform;
        assert!(supply > 0, E_ZERO_SUPPLY);
        assert!(first_buy >= MIN_FIRST_BUY_DOLLARS * unit && first_buy <= MAX_FIRST_BUY_DOLLARS * unit, E_FIRST_BUY_RANGE);
        assert!(tax_ppm >= TAX_MIN_PPM && tax_ppm <= TAX_MAX_PPM, E_TAX_RANGE);
        let founder_addr = signer::address_of(founder);

        let token_ctor = object::create_sticky_object(@pulse);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &token_ctor, option::some((supply as u128)), name, symbol, decimals,
            std::string::utf8(b""), std::string::utf8(b""),
        );
        let mint_ref = fungible_asset::generate_mint_ref(&token_ctor);
        let burn_ref = fungible_asset::generate_burn_ref(&token_ctor);
        let token_signer = object::generate_signer(&token_ctor);
        let token = object::object_from_constructor_ref<Metadata>(&token_ctor);

        let vault_ctor = object::create_sticky_object(@pulse);
        let vault = fungible_asset::create_store(&vault_ctor, collateral);
        let vault_ref = object::generate_extend_ref(&vault_ctor);

        // the pool: two stores on two sticky objects, no withdraw path
        let pool_ctor = object::create_sticky_object(@pulse);
        let pool_tokens = fungible_asset::create_store(&pool_ctor, token);
        let pool_ref = object::generate_extend_ref(&pool_ctor);
        let pool_dctor = object::create_sticky_object(@pulse);
        let pool_dollars = fungible_asset::create_store(&pool_dctor, collateral);
        let pool_dref = object::generate_extend_ref(&pool_dctor);

        fungible_asset::deposit(pool_tokens, fungible_asset::mint(&mint_ref, supply));
        // mint_ref is dropped here: supply is final, and all of it is in the pool

        fungible_asset::deposit(vault, dollars);
        if (option::is_some(&target)) {
            let fa = option::extract(&mut target);
            let k = fungible_asset::metadata_from_asset(&fa);
            let kctor = object::create_sticky_object(@pulse);
            let kstore = fungible_asset::create_store(&kctor, k);
            fungible_asset::deposit(kstore, fa);
            move_to(&token_signer, Backed { target: k, store: kstore, store_ref: object::generate_extend_ref(&kctor) });
        };
        option::destroy_none(target);
        let launch_fee = mul_ppm(first_buy, LAUNCH_FEE_PPM);
        primary_fungible_store::transfer(founder, collateral, platform, launch_fee);

        move_to(&token_signer, Launch {
            founder: founder_addr, collateral, tax_ppm, vault, vault_ref, burn_ref,
            pool_tokens, pool_dollars, pool_ref, pool_dref, virtual_dollars: OPENING_MCAP_DOLLARS * unit,
            opened_at: timestamp::now_seconds(), shield_at: 0, shield_ppm: 0,
        });
        event::emit(Launched { token: object::object_address(&token), founder: founder_addr, supply, collateral: fungible_asset::balance(vault), first_buy, tax_ppm });
        // the founder's first buy opens the pool and is not sniping it
        buy_inner(founder, token, first_buy - launch_fee, min_tokens, true);
        token
    }

    fun mul_ppm(x: u64, ppm: u64): u64 { (((x as u128) * (ppm as u128) / (PPM as u128)) as u64) }

    /// Take the trade fee and the collateral tax out of `dollars` (held by
    /// `from_store_owner` as a FungibleAsset already withdrawn) and route
    /// them; returns what is left for the pool or the seller.
    fun route(l: &Launch, extra_tax_ppm: u64, dollars: fungible_asset::FungibleAsset): (fungible_asset::FungibleAsset, u64, u64) acquires Config {
        let amount = fungible_asset::amount(&dollars);
        let to_founder = mul_ppm(amount, FOUNDER_PPM);
        let to_platform = mul_ppm(amount, PLATFORM_PPM);
        let to_depth = mul_ppm(amount, DEPTH_PPM);
        // the shield rides with the vault's share: what a large sale pays
        // goes to the floor, not to the protocol
        let tax = mul_ppm(amount, l.tax_ppm + extra_tax_ppm);
        primary_fungible_store::deposit(l.founder, fungible_asset::extract(&mut dollars, to_founder));
        primary_fungible_store::deposit(borrow_global<Config>(@pulse).platform, fungible_asset::extract(&mut dollars, to_platform));
        fungible_asset::deposit(l.pool_dollars, fungible_asset::extract(&mut dollars, to_depth));
        fungible_asset::deposit(l.vault, fungible_asset::extract(&mut dollars, tax));
        (dollars, to_founder + to_platform + to_depth, tax)
    }

    /// 990000 >> (2 * seconds since open), zero from SNIPE_SECONDS on
    public fun snipe_ppm_at(elapsed: u64): u64 {
        if (elapsed >= SNIPE_SECONDS) 0 else SNIPE_PPM >> ((2 * elapsed) as u8)
    }

    /// Buy with `dollars_in` USDC; at least `min_tokens` or abort.
    public entry fun buy(buyer: &signer, token: Object<Metadata>, dollars_in: u64, min_tokens: u64) acquires Config, Launch {
        buy_inner(buyer, token, dollars_in, min_tokens, false);
    }

    fun buy_inner(buyer: &signer, token: Object<Metadata>, dollars_in: u64, min_tokens: u64, opening: bool) acquires Config, Launch {
        let addr = object::object_address(&token);
        assert!(exists<Launch>(addr), E_NOT_A_LAUNCH);
        assert!(dollars_in > 0, E_ZERO_AMOUNT);
        let l = borrow_global<Launch>(addr);
        // price on the reserves as they were before this trade
        let y = (fungible_asset::balance(l.pool_dollars) + l.virtual_dollars as u128);
        let paid = primary_fungible_store::withdraw(buyer, l.collateral, dollars_in);
        // the opening buy pays only the launch fee (taken before), as on EVM:
        // no trade fee, no tax, no snipe; every remaining dollar is pool bid
        let (rest, fee, tax, snipe) = if (opening) (paid, 0, 0, 0) else {
            let snipe = mul_ppm(dollars_in, snipe_ppm_at(timestamp::now_seconds() - l.opened_at));
            fungible_asset::deposit(l.pool_dollars, fungible_asset::extract(&mut paid, snipe));
            let (r, f, t) = route(l, 0, paid);
            (r, f, t, snipe)
        };
        let x = fungible_asset::amount(&rest);
        let t = (fungible_asset::balance(l.pool_tokens) as u128);
        let out = ((t * (x as u128) / (y + (x as u128))) as u64);
        assert!(out >= min_tokens && out > 0, E_SLIPPAGE);
        fungible_asset::deposit(l.pool_dollars, rest);
        let pool_signer = object::generate_signer_for_extending(&l.pool_ref);
        primary_fungible_store::deposit(signer::address_of(buyer), fungible_asset::withdraw(&pool_signer, l.pool_tokens, out));
        event::emit(Traded { token: addr, trader: signer::address_of(buyer), buy: true, dollars: dollars_in, tokens: out, fee: fee + snipe, tax });
    }

    /// Sell `tokens_in`; at least `min_dollars` (after fee and tax) or abort.
    public entry fun sell(seller: &signer, token: Object<Metadata>, tokens_in: u64, min_dollars: u64) acquires Config, Launch {
        let addr = object::object_address(&token);
        assert!(exists<Launch>(addr), E_NOT_A_LAUNCH);
        assert!(tokens_in > 0, E_ZERO_AMOUNT);
        let l = borrow_global_mut<Launch>(addr);
        // volume shield: share of circulating sold within this block
        let circ = circulating_of(l, token);
        let share = if (circ == 0) 0 else (((tokens_in as u128) * (PPM as u128) / (circ as u128)) as u64);
        let now = timestamp::now_microseconds();
        let block_ppm = if (l.shield_at == now) l.shield_ppm + share else share;
        l.shield_at = now;
        l.shield_ppm = block_ppm;
        let extra = if (block_ppm <= SHIELD_THRESHOLD_PPM) 0 else block_ppm - SHIELD_THRESHOLD_PPM;
        if (extra > SHIELD_CAP_PPM) extra = SHIELD_CAP_PPM;
        let real = fungible_asset::balance(l.pool_dollars);
        let y = (real + l.virtual_dollars as u128);
        let t = (fungible_asset::balance(l.pool_tokens) as u128);
        let gross = ((y * (tokens_in as u128) / (t + (tokens_in as u128))) as u64);
        // the virtual reserve is never paid out
        if (gross > real) gross = real;
        fungible_asset::deposit(l.pool_tokens, primary_fungible_store::withdraw(seller, token, tokens_in));
        let pool_signer = object::generate_signer_for_extending(&l.pool_dref);
        let dollars = fungible_asset::withdraw(&pool_signer, l.pool_dollars, gross);
        let (rest, fee, tax) = route(l, extra, dollars);
        let net = fungible_asset::amount(&rest);
        assert!(net >= min_dollars, E_SLIPPAGE);
        primary_fungible_store::deposit(signer::address_of(seller), rest);
        event::emit(Traded { token: addr, trader: signer::address_of(seller), buy: false, dollars: net, tokens: tokens_in, fee, tax });
    }

    /// Burn `amount` tokens, receive the matching share of collateral. No fee:
    /// a fee on the exit would let the price sit below the floor.
    public entry fun redeem(holder: &signer, token: Object<Metadata>, amount: u64) acquires Launch {
        let addr = object::object_address(&token);
        assert!(exists<Launch>(addr), E_NOT_A_LAUNCH);
        // a target-backed vault pays both holdings: redeem_backed
        assert!(!exists<Backed>(addr), E_TARGET_BACKED);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let l = borrow_global<Launch>(addr);
        let circ = circulating_of(l, token);
        assert!(amount <= circ, E_NOT_CIRCULATING);
        let backing = fungible_asset::balance(l.vault);
        let payout = (((backing as u128) * (amount as u128) / (circ as u128)) as u64);
        let holder_addr = signer::address_of(holder);
        fungible_asset::burn(&l.burn_ref, primary_fungible_store::withdraw(holder, token, amount));
        if (payout > 0) {
            let vault_signer = object::generate_signer_for_extending(&l.vault_ref);
            primary_fungible_store::deposit(holder_addr, fungible_asset::withdraw(&vault_signer, l.vault, payout));
        };
        event::emit(Redeemed { token: addr, holder: holder_addr, burned: amount, payout });
    }

    /// Burn tokens from a target-backed vault: a share of the pasted token
    /// and of the tax dollars, both in proportion to circulating supply.
    public entry fun redeem_backed(holder: &signer, token: Object<Metadata>, amount: u64) acquires Launch, Backed {
        let addr = object::object_address(&token);
        assert!(exists<Launch>(addr) && exists<Backed>(addr), E_NOT_TARGET_BACKED);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let l = borrow_global<Launch>(addr);
        let b = borrow_global<Backed>(addr);
        let circ = circulating_of(l, token);
        assert!(amount <= circ, E_NOT_CIRCULATING);
        let pay_d = (((fungible_asset::balance(l.vault) as u128) * (amount as u128) / (circ as u128)) as u64);
        let pay_k = (((fungible_asset::balance(b.store) as u128) * (amount as u128) / (circ as u128)) as u64);
        let holder_addr = signer::address_of(holder);
        fungible_asset::burn(&l.burn_ref, primary_fungible_store::withdraw(holder, token, amount));
        if (pay_d > 0) {
            let vs = object::generate_signer_for_extending(&l.vault_ref);
            primary_fungible_store::deposit(holder_addr, fungible_asset::withdraw(&vs, l.vault, pay_d));
        };
        if (pay_k > 0) {
            let ks = object::generate_signer_for_extending(&b.store_ref);
            primary_fungible_store::deposit(holder_addr, fungible_asset::withdraw(&ks, b.store, pay_k));
        };
        event::emit(Redeemed { token: addr, holder: holder_addr, burned: amount, payout: pay_d });
    }

    /// the chain's dollar fixed at initialize (for adapters)
    public fun dollar(): Object<Metadata> acquires Config { borrow_global<Config>(@pulse).collateral }

    #[view] public fun target_backing(token: Object<Metadata>): (address, u64) acquires Backed {
        let b = borrow_global<Backed>(object::object_address(&token));
        (object::object_address(&b.target), fungible_asset::balance(b.store))
    }

    #[test_only]
    public fun converted_for_testing(fa: FungibleAsset, dollars_in: u64): Converted { Converted { fa, dollars_in } }

    /// Anyone may add collateral; it only raises the floor for every holder.
    public entry fun fund(from: &signer, token: Object<Metadata>, amount: u64) acquires Launch {
        let addr = object::object_address(&token);
        assert!(exists<Launch>(addr), E_NOT_A_LAUNCH);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let l = borrow_global<Launch>(addr);
        fungible_asset::deposit(l.vault, primary_fungible_store::withdraw(from, l.collateral, amount));
        event::emit(Funded { token: addr, from: signer::address_of(from), amount });
    }

    fun current_supply(token: Object<Metadata>): u64 { (option::extract(&mut fungible_asset::supply(token)) as u64) }
    fun circulating_of(l: &Launch, token: Object<Metadata>): u64 { current_supply(token) - fungible_asset::balance(l.pool_tokens) }

    #[view] public fun backing(token: Object<Metadata>): u64 acquires Launch { fungible_asset::balance(borrow_global<Launch>(object::object_address(&token)).vault) }
    #[view] public fun supply(token: Object<Metadata>): u64 { current_supply(token) }
    #[view] public fun circulating(token: Object<Metadata>): u64 acquires Launch { circulating_of(borrow_global<Launch>(object::object_address(&token)), token) }
    #[view] public fun pool_reserves(token: Object<Metadata>): (u64, u64, u64) acquires Launch {
        let l = borrow_global<Launch>(object::object_address(&token));
        (fungible_asset::balance(l.pool_tokens), fungible_asset::balance(l.pool_dollars), l.virtual_dollars)
    }
    #[view] public fun pool_reserves_dollars(token: Object<Metadata>): u64 acquires Launch { fungible_asset::balance(borrow_global<Launch>(object::object_address(&token)).pool_dollars) }
    #[view] public fun founder(token: Object<Metadata>): address acquires Launch { borrow_global<Launch>(object::object_address(&token)).founder }
    #[view] public fun tax_ppm(token: Object<Metadata>): u64 acquires Launch { borrow_global<Launch>(object::object_address(&token)).tax_ppm }

    #[view]
    /// collateral per circulating token, scaled by 1e36
    public fun floor_price(token: Object<Metadata>): u256 acquires Launch {
        let l = borrow_global<Launch>(object::object_address(&token));
        let c = circulating_of(l, token);
        if (c == 0) return 0;
        (fungible_asset::balance(l.vault) as u256) * FLOOR_SCALE / (c as u256)
    }
}
