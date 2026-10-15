/// ARC PULSE launchpad on Aptos: a fixed-supply token born with its own
/// collateral vault. The Move counterpart of contracts/CollateralVault.sol.
///
/// THE ONE RULE (same as the EVM vault)
///   Collateral leaves only by burning tokens, and only in proportion:
///       payout = backing * amount / supply
///   The burn and the payout shrink supply and backing by the same share, so
///   collateral-per-token is unchanged for everyone who stayed.
///
/// WHAT IS NOT HERE, ON PURPOSE
///   No owner, no admin, no pause, no upgrade path in the module's own
///   logic, no withdraw, no sweep, no recipient parameter. The vault's
///   ExtendRef is used in exactly one place: redeem(). The MintRef is
///   dropped right after the initial mint, so no more tokens can ever exist.
///
/// NOT YET HERE (kept out, not faked)
///   A trading pool. On EVM the launch opens a locked Uniswap v4 pool; on
///   Aptos that needs a DEX integration (Hyperion / Thala) and is a separate
///   step. Collateral is the chain's USDC fixed at initialize(); "paste any
///   token as collateral" needs a price source and is also a separate step.
module pulse::launchpad {
    use std::signer;
    use std::string::String;
    use std::option;
    use aptos_framework::event;
    use aptos_framework::object::{Self, Object, ExtendRef};
    use aptos_framework::fungible_asset::{Self, Metadata, BurnRef, FungibleStore};
    use aptos_framework::primary_fungible_store;

    /// only the publishing account may initialize, once
    const E_NOT_PUBLISHER: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_NOT_INITIALIZED: u64 = 3;
    /// opening collateral below the minimum (20 dollars)
    const E_COLLATERAL_TOO_LOW: u64 = 4;
    const E_ZERO_SUPPLY: u64 = 5;
    const E_ZERO_AMOUNT: u64 = 6;
    const E_NOT_A_LAUNCH: u64 = 7;

    /// whole dollars a founder must put in to open a launch
    const MIN_COLLATERAL_DOLLARS: u64 = 20;
    /// floor is collateral-per-token scaled by 1e36, as on EVM
    const FLOOR_SCALE: u256 = 1000000000000000000000000000000000000;

    struct Config has key {
        collateral: Object<Metadata>,
        min_collateral: u64,
    }

    /// Lives at the token's metadata object address.
    struct Launch has key {
        founder: address,
        collateral: Object<Metadata>,
        vault: Object<FungibleStore>,
        vault_ref: ExtendRef,
        burn_ref: BurnRef,
    }

    #[event]
    struct Launched has drop, store {
        token: address, founder: address, supply: u64, collateral: u64,
    }

    #[event]
    struct Redeemed has drop, store {
        token: address, holder: address, burned: u64, payout: u64,
    }

    #[event]
    struct Funded has drop, store {
        token: address, from: address, amount: u64,
    }

    /// Fixes the chain's dollar. Callable once, by the publishing account;
    /// after that there is nothing left for any account to configure.
    public entry fun initialize(publisher: &signer, collateral: Object<Metadata>) {
        assert!(signer::address_of(publisher) == @pulse, E_NOT_PUBLISHER);
        assert!(!exists<Config>(@pulse), E_ALREADY_INITIALIZED);
        let dec = fungible_asset::decimals(collateral);
        let unit = 1u64;
        let i = 0u8;
        while (i < dec) { unit = unit * 10; i = i + 1; };
        move_to(publisher, Config { collateral, min_collateral: MIN_COLLATERAL_DOLLARS * unit });
    }

    /// Create the token, mint the whole supply to the founder, and lock the
    /// founder's collateral in the token's vault. The mint capability does
    /// not survive this call.
    public entry fun launch(
        founder: &signer, name: String, symbol: String, decimals: u8, supply: u64, collateral_amount: u64,
    ) acquires Config {
        launch_token(founder, name, symbol, decimals, supply, collateral_amount);
    }

    public fun launch_token(
        founder: &signer, name: String, symbol: String, decimals: u8, supply: u64, collateral_amount: u64,
    ): Object<Metadata> acquires Config {
        assert!(exists<Config>(@pulse), E_NOT_INITIALIZED);
        let cfg = borrow_global<Config>(@pulse);
        assert!(supply > 0, E_ZERO_SUPPLY);
        assert!(collateral_amount >= cfg.min_collateral, E_COLLATERAL_TOO_LOW);
        let founder_addr = signer::address_of(founder);

        // token metadata on a sticky object: it can never be deleted
        let token_ctor = object::create_sticky_object(@pulse);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &token_ctor, option::some((supply as u128)), name, symbol, decimals,
            std::string::utf8(b""), std::string::utf8(b""),
        );
        let mint_ref = fungible_asset::generate_mint_ref(&token_ctor);
        let burn_ref = fungible_asset::generate_burn_ref(&token_ctor);
        let token_signer = object::generate_signer(&token_ctor);
        let token = object::object_from_constructor_ref<Metadata>(&token_ctor);

        // the vault: a store owned by its own sticky object
        let vault_ctor = object::create_sticky_object(@pulse);
        let vault = fungible_asset::create_store(&vault_ctor, cfg.collateral);
        let vault_ref = object::generate_extend_ref(&vault_ctor);

        primary_fungible_store::mint(&mint_ref, founder_addr, supply);
        // mint_ref is dropped here: supply is final

        let paid = primary_fungible_store::withdraw(founder, cfg.collateral, collateral_amount);
        fungible_asset::deposit(vault, paid);

        move_to(&token_signer, Launch { founder: founder_addr, collateral: cfg.collateral, vault, vault_ref, burn_ref });
        event::emit(Launched { token: object::object_address(&token), founder: founder_addr, supply, collateral: collateral_amount });
        token
    }

    /// Burn `amount` tokens, receive the matching share of collateral. The
    /// burn happens before the payout. No fee: a fee on the exit would let
    /// the price sit below the floor by the size of the fee.
    public entry fun redeem(holder: &signer, token: Object<Metadata>, amount: u64) acquires Launch {
        let addr = object::object_address(&token);
        assert!(exists<Launch>(addr), E_NOT_A_LAUNCH);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let l = borrow_global<Launch>(addr);
        let supply = current_supply(token);
        let backing = fungible_asset::balance(l.vault);
        let payout = (((backing as u128) * (amount as u128) / (supply as u128)) as u64);

        let holder_addr = signer::address_of(holder);
        let burned = primary_fungible_store::withdraw(holder, token, amount);
        fungible_asset::burn(&l.burn_ref, burned);

        if (payout > 0) {
            let vault_signer = object::generate_signer_for_extending(&l.vault_ref);
            let out = fungible_asset::withdraw(&vault_signer, l.vault, payout);
            primary_fungible_store::deposit(holder_addr, out);
        };
        event::emit(Redeemed { token: addr, holder: holder_addr, burned: amount, payout });
    }

    /// Anyone may add collateral; it only raises the floor for every holder.
    public entry fun fund(from: &signer, token: Object<Metadata>, amount: u64) acquires Launch {
        let addr = object::object_address(&token);
        assert!(exists<Launch>(addr), E_NOT_A_LAUNCH);
        assert!(amount > 0, E_ZERO_AMOUNT);
        let l = borrow_global<Launch>(addr);
        let paid = primary_fungible_store::withdraw(from, l.collateral, amount);
        fungible_asset::deposit(l.vault, paid);
        event::emit(Funded { token: addr, from: signer::address_of(from), amount });
    }

    fun current_supply(token: Object<Metadata>): u64 {
        (option::extract(&mut fungible_asset::supply(token)) as u64)
    }

    #[view]
    public fun backing(token: Object<Metadata>): u64 acquires Launch {
        fungible_asset::balance(borrow_global<Launch>(object::object_address(&token)).vault)
    }

    #[view]
    public fun supply(token: Object<Metadata>): u64 { current_supply(token) }

    #[view]
    /// collateral per token, scaled by 1e36 (divide by 1e36 when reading)
    public fun floor_price(token: Object<Metadata>): u256 acquires Launch {
        let s = current_supply(token);
        if (s == 0) return 0;
        (backing(token) as u256) * FLOOR_SCALE / (s as u256)
    }

    #[view]
    public fun founder(token: Object<Metadata>): address acquires Launch {
        borrow_global<Launch>(object::object_address(&token)).founder
    }

    #[view]
    public fun min_collateral(): u64 acquires Config { borrow_global<Config>(@pulse).min_collateral }
}
