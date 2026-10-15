/// ARC PULSE launchpad on Sui: a fixed-supply token born with its own
/// collateral vault. The Sui counterpart of contracts/CollateralVault.sol
/// and aptos/pulse-launchpad.
///
/// THE ONE RULE (same as EVM and Aptos)
///   Collateral leaves only by burning tokens, and only in proportion:
///       payout = backing * amount / supply
///
/// HOW A FIXED SUPPLY IS GUARANTEED ON SUI
///   On Sui every coin type is published in its own package, whose init
///   hands out the TreasuryCap. launch() takes that cap by value, refuses it
///   if anything was minted already, mints the whole supply once and locks
///   the cap inside the shared Vault. This module never calls mint again:
///   the cap is used only by redeem() to burn. Nobody holds it.
///
/// WHAT IS NOT HERE, ON PURPOSE
///   No owner, no admin, no pause, no withdraw, no sweep. initialize() fixes
///   the collateral type once and destroys its capability.
///
/// NOT YET HERE (kept out, not faked)
///   A trading pool (Cetus/DeepBook integration is a separate step), and
///   "paste any token as collateral", which needs a price source.
module pulse::launchpad {
    use std::type_name::{Self, TypeName};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::event;

    const ENotInitialized: u64 = 3;
    const ECollateralTooLow: u64 = 4;
    const EZeroSupply: u64 = 5;
    const EZeroAmount: u64 = 6;
    const EWrongCollateral: u64 = 7;
    const EAlreadyMinted: u64 = 8;

    /// whole dollars a founder must put in to open a launch
    const MIN_COLLATERAL_DOLLARS: u64 = 20;
    /// floor is collateral-per-token scaled by 1e36, as on EVM
    const FLOOR_SCALE: u256 = 1000000000000000000000000000000000000;

    /// Given to the publisher by init; consumed by initialize().
    public struct InitCap has key { id: UID }

    /// Shared, written once.
    public struct Config has key {
        id: UID,
        collateral: Option<TypeName>,
        min_collateral: u64,
    }

    /// Shared, one per launch.
    public struct Vault<phantom T, phantom C> has key {
        id: UID,
        founder: address,
        backing: Balance<C>,
        cap: TreasuryCap<T>,
    }

    public struct Launched has copy, drop { vault: ID, token: TypeName, founder: address, supply: u64, collateral: u64 }
    public struct Redeemed has copy, drop { vault: ID, holder: address, burned: u64, payout: u64 }
    public struct Funded has copy, drop { vault: ID, from: address, amount: u64 }

    fun init(ctx: &mut TxContext) {
        transfer::transfer(InitCap { id: object::new(ctx) }, ctx.sender());
        transfer::share_object(Config { id: object::new(ctx), collateral: option::none(), min_collateral: 0 });
    }

    /// Fix the chain's dollar type and its decimals, once. The capability is
    /// destroyed, so nothing about the config can change afterwards.
    public fun initialize<C>(cap: InitCap, cfg: &mut Config, decimals: u8) {
        let InitCap { id } = cap;
        id.delete();
        let mut unit = 1u64;
        let mut i = 0u8;
        while (i < decimals) { unit = unit * 10; i = i + 1; };
        cfg.collateral = option::some(type_name::with_defining_ids<C>());
        cfg.min_collateral = MIN_COLLATERAL_DOLLARS * unit;
    }

    /// Mint the whole supply to the founder, lock the cap and the collateral
    /// in a new shared vault. Returns the founder's tokens.
    public fun launch<T, C>(
        cfg: &Config, mut cap: TreasuryCap<T>, supply: u64, collateral: Coin<C>, ctx: &mut TxContext,
    ): Coin<T> {
        assert!(cfg.collateral.is_some(), ENotInitialized);
        assert!(*cfg.collateral.borrow() == type_name::with_defining_ids<C>(), EWrongCollateral);
        assert!(coin::total_supply(&cap) == 0, EAlreadyMinted);
        assert!(supply > 0, EZeroSupply);
        let paid = collateral.value();
        assert!(paid >= cfg.min_collateral, ECollateralTooLow);

        let tokens = coin::mint(&mut cap, supply, ctx);
        let vault = Vault<T, C> { id: object::new(ctx), founder: ctx.sender(), backing: collateral.into_balance(), cap };
        event::emit(Launched { vault: object::id(&vault), token: type_name::with_defining_ids<T>(), founder: ctx.sender(), supply, collateral: paid });
        transfer::share_object(vault);
        tokens
    }

    /// Burn tokens, receive the matching share of collateral. No fee.
    public fun redeem<T, C>(vault: &mut Vault<T, C>, tokens: Coin<T>, ctx: &mut TxContext): Coin<C> {
        let amount = tokens.value();
        assert!(amount > 0, EZeroAmount);
        let supply = coin::total_supply(&vault.cap);
        let backing = vault.backing.value();
        let payout = (((backing as u128) * (amount as u128) / (supply as u128)) as u64);
        coin::burn(&mut vault.cap, tokens);
        event::emit(Redeemed { vault: object::id(vault), holder: ctx.sender(), burned: amount, payout });
        coin::from_balance(vault.backing.split(payout), ctx)
    }

    /// Anyone may add collateral; it only raises the floor for every holder.
    public fun fund<T, C>(vault: &mut Vault<T, C>, more: Coin<C>, ctx: &TxContext) {
        let amount = more.value();
        assert!(amount > 0, EZeroAmount);
        vault.backing.join(more.into_balance());
        event::emit(Funded { vault: object::id(vault), from: ctx.sender(), amount });
    }

    public fun backing<T, C>(vault: &Vault<T, C>): u64 { vault.backing.value() }
    public fun supply<T, C>(vault: &Vault<T, C>): u64 { coin::total_supply(&vault.cap) }
    public fun founder<T, C>(vault: &Vault<T, C>): address { vault.founder }
    public fun min_collateral(cfg: &Config): u64 { cfg.min_collateral }

    /// collateral per token, scaled by 1e36 (divide by 1e36 when reading)
    public fun floor_price<T, C>(vault: &Vault<T, C>): u256 {
        let s = coin::total_supply(&vault.cap);
        if (s == 0) return 0;
        (vault.backing.value() as u256) * FLOOR_SCALE / (s as u256)
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }
}
