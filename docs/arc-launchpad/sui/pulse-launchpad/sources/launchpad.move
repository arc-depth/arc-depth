/// ARC PULSE launchpad on Sui: a fixed-supply token born with its own
/// collateral vault and its own locked trading pool. The Sui counterpart of
/// contracts/nesil3/PulseLaunchpad3.sol + PulseHook.sol + CollateralVault.sol
/// and of aptos/pulse-launchpad (same constants, same tests).
///
/// FIXED SUPPLY ON SUI
///   Every coin type is published in its own package, whose init hands out
///   the TreasuryCap. launch() takes that cap by value, refuses it if anything
///   was minted already, mints the whole supply INTO THE POOL once and locks
///   the cap inside the shared Vault. The module never mints again; the cap
///   is used only by redeem() to burn.
///
/// THE VAULT RULE
///   Collateral leaves only by burning tokens, in proportion to the
///   CIRCULATING supply (tokens in the pool do not count):
///       payout = backing * amount / (supply - pool tokens)
///
/// THE POOL
///   x*y=k with a virtual dollar reserve equal to the opening market cap
///   (3,500 dollars), so every launch opens at the same price. Nobody gets
///   free tokens: the founder buys with the first buy (100-500 dollars). The
///   virtual reserve is never paid out and the pool has no withdraw.
///
/// FEES (constants)
///   launch fee 2% of the first buy -> platform; the rest of the first buy
///                 is pool bid (no trade fee, tax or snipe on it, as on EVM)
///   trade fee 2%: 0.30% founder, 0.70% stays as pool depth, 1.00% platform
///                 (EVM splits that 1% across DAO funds not on Sui yet)
///   collateral tax 1-5%, fixed at launch -> vault
///   anti-snipe on buys: 99% in the opening second, quartering every second,
///                 zero after 5 s; stays as depth; the founder's opening buy
///                 is exempt
///   volume shield on sells: more than 0.50% of circulating sold within one
///                 clock tick (one checkpoint) pays the excess, up to 3%, as
///                 extra tax to the vault
///
/// NOT HERE (kept out, not faked)
///   "Paste any token as collateral" (needs a price source); bridging.
module pulse::launchpad {
    use std::type_name::{Self, TypeName};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::clock::Clock;
    use sui::event;

    const ENotInitialized: u64 = 3;
    const ECollateralTooLow: u64 = 4;
    const EZeroSupply: u64 = 5;
    const EZeroAmount: u64 = 6;
    const EWrongCollateral: u64 = 7;
    const EAlreadyMinted: u64 = 8;
    const EFirstBuyRange: u64 = 9;
    const ETaxRange: u64 = 10;
    const ESlippage: u64 = 11;
    const ENotCirculating: u64 = 12;

    const MIN_COLLATERAL_DOLLARS: u64 = 20;
    const OPENING_MCAP_DOLLARS: u64 = 3500;
    const MIN_FIRST_BUY_DOLLARS: u64 = 100;
    const MAX_FIRST_BUY_DOLLARS: u64 = 500;
    const PPM: u64 = 1_000_000;
    const LAUNCH_FEE_PPM: u64 = 20_000;
    const FOUNDER_PPM: u64 = 3_000;
    const DEPTH_PPM: u64 = 7_000;
    const PLATFORM_PPM: u64 = 10_000;
    const TAX_MIN_PPM: u64 = 10_000;
    const TAX_MAX_PPM: u64 = 50_000;
    const SNIPE_PPM: u64 = 990_000;
    const SNIPE_SECONDS: u64 = 5;
    const SHIELD_THRESHOLD_PPM: u64 = 5_000;
    const SHIELD_CAP_PPM: u64 = 30_000;
    const FLOOR_SCALE: u256 = 1_000_000_000_000_000_000_000_000_000_000_000_000;

    /// Given to the publisher by init; consumed by initialize().
    public struct InitCap has key { id: UID }

    /// Shared, written once.
    public struct Config has key {
        id: UID,
        collateral: Option<TypeName>,
        unit: u64,
        platform: address,
    }

    /// Shared, one per launch.
    public struct Vault<phantom T, phantom C> has key {
        id: UID,
        founder: address,
        tax_ppm: u64,
        backing: Balance<C>,
        cap: TreasuryCap<T>,
        pool_tokens: Balance<T>,
        pool_dollars: Balance<C>,
        virtual_dollars: u64,
        opened_ms: u64,
        shield_ms: u64,
        shield_ppm: u64,
    }

    public struct Launched has copy, drop { vault: ID, token: TypeName, founder: address, supply: u64, collateral: u64, first_buy: u64, tax_ppm: u64 }
    public struct Traded has copy, drop { vault: ID, trader: address, buy: bool, dollars: u64, tokens: u64, fee: u64, tax: u64 }
    public struct Redeemed has copy, drop { vault: ID, holder: address, burned: u64, payout: u64 }
    public struct Funded has copy, drop { vault: ID, from: address, amount: u64 }

    fun init(ctx: &mut TxContext) {
        transfer::transfer(InitCap { id: object::new(ctx) }, ctx.sender());
        transfer::share_object(Config { id: object::new(ctx), collateral: option::none(), unit: 0, platform: @0x0 });
    }

    /// Fix the chain's dollar type, its decimals and the platform fee
    /// address, once; the capability is destroyed.
    public fun initialize<C>(cap: InitCap, cfg: &mut Config, decimals: u8, platform: address) {
        let InitCap { id } = cap;
        id.delete();
        let mut unit = 1u64;
        let mut i = 0u8;
        while (i < decimals) { unit = unit * 10; i = i + 1; };
        cfg.collateral = option::some(type_name::with_defining_ids<C>());
        cfg.unit = unit;
        cfg.platform = platform;
    }

    fun mul_ppm(x: u64, ppm: u64): u64 { (((x as u128) * (ppm as u128) / (PPM as u128)) as u64) }

    /// Open a launch: whole supply into the pool, collateral into the vault,
    /// launch fee to the platform, then the founder's first buy. Returns the
    /// founder's tokens.
    public fun launch<T, C>(
        cfg: &Config, mut cap: TreasuryCap<T>, supply: u64, collateral: Coin<C>, mut first_buy: Coin<C>,
        tax_ppm: u64, min_tokens: u64, clock: &Clock, ctx: &mut TxContext,
    ): Coin<T> {
        assert!(cfg.collateral.is_some(), ENotInitialized);
        assert!(*cfg.collateral.borrow() == type_name::with_defining_ids<C>(), EWrongCollateral);
        assert!(coin::total_supply(&cap) == 0, EAlreadyMinted);
        assert!(supply > 0, EZeroSupply);
        let u = cfg.unit;
        let col = collateral.value();
        let buy_total = first_buy.value();
        assert!(col >= MIN_COLLATERAL_DOLLARS * u, ECollateralTooLow);
        assert!(buy_total >= MIN_FIRST_BUY_DOLLARS * u && buy_total <= MAX_FIRST_BUY_DOLLARS * u, EFirstBuyRange);
        assert!(tax_ppm >= TAX_MIN_PPM && tax_ppm <= TAX_MAX_PPM, ETaxRange);

        transfer::public_transfer(first_buy.split(mul_ppm(buy_total, LAUNCH_FEE_PPM), ctx), cfg.platform);
        let pool_tokens = coin::mint_balance(&mut cap, supply);
        let mut vault = Vault<T, C> {
            id: object::new(ctx), founder: ctx.sender(), tax_ppm, backing: collateral.into_balance(), cap,
            pool_tokens, pool_dollars: balance::zero(), virtual_dollars: OPENING_MCAP_DOLLARS * u,
            opened_ms: clock.timestamp_ms(), shield_ms: 0, shield_ppm: 0,
        };
        event::emit(Launched { vault: object::id(&vault), token: type_name::with_defining_ids<T>(), founder: ctx.sender(), supply, collateral: col, first_buy: buy_total, tax_ppm });
        // the founder's first buy opens the pool and is not sniping it
        let tokens = buy_inner(&mut vault, first_buy, min_tokens, true, cfg, clock, ctx);
        transfer::share_object(vault);
        tokens
    }

    /// 990000 >> (2 * seconds since open), zero from SNIPE_SECONDS on
    public fun snipe_ppm_at(elapsed: u64): u64 {
        if (elapsed >= SNIPE_SECONDS) 0 else SNIPE_PPM >> ((2 * elapsed) as u8)
    }

    /// fee and tax out of `dollars`; returns (rest, fee, tax)
    fun route<T, C>(v: &mut Vault<T, C>, cfg: &Config, extra_tax_ppm: u64, mut dollars: Balance<C>, ctx: &mut TxContext): (Balance<C>, u64, u64) {
        let amount = dollars.value();
        let to_founder = mul_ppm(amount, FOUNDER_PPM);
        let to_platform = mul_ppm(amount, PLATFORM_PPM);
        let to_depth = mul_ppm(amount, DEPTH_PPM);
        let tax = mul_ppm(amount, v.tax_ppm + extra_tax_ppm);
        transfer::public_transfer(coin::from_balance(dollars.split(to_founder), ctx), v.founder);
        transfer::public_transfer(coin::from_balance(dollars.split(to_platform), ctx), cfg.platform);
        v.pool_dollars.join(dollars.split(to_depth));
        v.backing.join(dollars.split(tax));
        (dollars, to_founder + to_platform + to_depth, tax)
    }

    public fun buy<T, C>(v: &mut Vault<T, C>, cfg: &Config, payment: Coin<C>, min_tokens: u64, clock: &Clock, ctx: &mut TxContext): Coin<T> {
        buy_inner(v, payment, min_tokens, false, cfg, clock, ctx)
    }

    fun buy_inner<T, C>(v: &mut Vault<T, C>, payment: Coin<C>, min_tokens: u64, opening: bool, cfg: &Config, clock: &Clock, ctx: &mut TxContext): Coin<T> {
        let dollars_in = payment.value();
        assert!(dollars_in > 0, EZeroAmount);
        let y = (v.pool_dollars.value() + v.virtual_dollars as u128);
        let mut paid = payment.into_balance();
        // the opening buy pays only the launch fee (taken before), as on EVM:
        // no trade fee, no tax, no snipe; every remaining dollar is pool bid
        let (rest, fee, tax, snipe) = if (opening) (paid, 0, 0, 0) else {
            let snipe = mul_ppm(dollars_in, snipe_ppm_at((clock.timestamp_ms() - v.opened_ms) / 1000));
            v.pool_dollars.join(paid.split(snipe));
            let (r, f, t) = route(v, cfg, 0, paid, ctx);
            (r, f, t, snipe)
        };
        let x = rest.value();
        let t = (v.pool_tokens.value() as u128);
        let out = ((t * (x as u128) / (y + (x as u128))) as u64);
        assert!(out >= min_tokens && out > 0, ESlippage);
        v.pool_dollars.join(rest);
        event::emit(Traded { vault: object::id(v), trader: ctx.sender(), buy: true, dollars: dollars_in, tokens: out, fee: fee + snipe, tax });
        coin::from_balance(v.pool_tokens.split(out), ctx)
    }

    public fun sell<T, C>(v: &mut Vault<T, C>, cfg: &Config, tokens: Coin<T>, min_dollars: u64, clock: &Clock, ctx: &mut TxContext): Coin<C> {
        let tokens_in = tokens.value();
        assert!(tokens_in > 0, EZeroAmount);
        let circ = circulating(v);
        let share = if (circ == 0) 0 else (((tokens_in as u128) * (PPM as u128) / (circ as u128)) as u64);
        let now = clock.timestamp_ms();
        let block_ppm = if (v.shield_ms == now) v.shield_ppm + share else share;
        v.shield_ms = now;
        v.shield_ppm = block_ppm;
        let mut extra = if (block_ppm <= SHIELD_THRESHOLD_PPM) 0 else block_ppm - SHIELD_THRESHOLD_PPM;
        if (extra > SHIELD_CAP_PPM) extra = SHIELD_CAP_PPM;

        let real = v.pool_dollars.value();
        let y = (real + v.virtual_dollars as u128);
        let t = (v.pool_tokens.value() as u128);
        let mut gross = ((y * (tokens_in as u128) / (t + (tokens_in as u128))) as u64);
        if (gross > real) gross = real;          // the virtual reserve is never paid out
        v.pool_tokens.join(tokens.into_balance());
        let dollars = v.pool_dollars.split(gross);
        let (rest, fee, tax) = route(v, cfg, extra, dollars, ctx);
        let net = rest.value();
        assert!(net >= min_dollars, ESlippage);
        event::emit(Traded { vault: object::id(v), trader: ctx.sender(), buy: false, dollars: net, tokens: tokens_in, fee, tax });
        coin::from_balance(rest, ctx)
    }

    /// Burn tokens, receive the matching share of collateral. No fee.
    public fun redeem<T, C>(v: &mut Vault<T, C>, tokens: Coin<T>, ctx: &mut TxContext): Coin<C> {
        let amount = tokens.value();
        assert!(amount > 0, EZeroAmount);
        let circ = circulating(v);
        assert!(amount <= circ, ENotCirculating);
        let payout = (((v.backing.value() as u128) * (amount as u128) / (circ as u128)) as u64);
        coin::burn(&mut v.cap, tokens);
        event::emit(Redeemed { vault: object::id(v), holder: ctx.sender(), burned: amount, payout });
        coin::from_balance(v.backing.split(payout), ctx)
    }

    /// Anyone may add collateral; it only raises the floor for every holder.
    public fun fund<T, C>(v: &mut Vault<T, C>, more: Coin<C>, ctx: &TxContext) {
        let amount = more.value();
        assert!(amount > 0, EZeroAmount);
        v.backing.join(more.into_balance());
        event::emit(Funded { vault: object::id(v), from: ctx.sender(), amount });
    }

    public fun circulating<T, C>(v: &Vault<T, C>): u64 { coin::total_supply(&v.cap) - v.pool_tokens.value() }
    public fun backing<T, C>(v: &Vault<T, C>): u64 { v.backing.value() }
    public fun supply<T, C>(v: &Vault<T, C>): u64 { coin::total_supply(&v.cap) }
    public fun pool_tokens<T, C>(v: &Vault<T, C>): u64 { v.pool_tokens.value() }
    public fun pool_dollars<T, C>(v: &Vault<T, C>): u64 { v.pool_dollars.value() }
    public fun virtual_dollars<T, C>(v: &Vault<T, C>): u64 { v.virtual_dollars }
    public fun founder<T, C>(v: &Vault<T, C>): address { v.founder }

    /// collateral per circulating token, scaled by 1e36
    public fun floor_price<T, C>(v: &Vault<T, C>): u256 {
        let c = circulating(v);
        if (c == 0) return 0;
        (v.backing.value() as u256) * FLOOR_SCALE / (c as u256)
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }
}
