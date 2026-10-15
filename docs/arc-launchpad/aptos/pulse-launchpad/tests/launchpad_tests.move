#[test_only]
module pulse::launchpad_tests {
    use std::signer;
    use std::string::utf8;
    use std::option;
    use aptos_framework::account;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::fungible_asset::{Self, Metadata, MintRef};
    use aptos_framework::primary_fungible_store;
    use pulse::launchpad;

    const USDC: u64 = 1000000;            // 6 decimals
    const SUPPLY: u64 = 1000000000000000; // 1e9 tokens, 6 decimals

    struct Usdc has key { mint: MintRef }

    fun make_usdc(issuer: &signer): Object<Metadata> {
        let ctor = object::create_named_object(issuer, b"USDC");
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &ctor, option::none(), utf8(b"USD Coin"), utf8(b"USDC"), 6, utf8(b""), utf8(b""));
        move_to(issuer, Usdc { mint: fungible_asset::generate_mint_ref(&ctor) });
        object::object_from_constructor_ref<Metadata>(&ctor)
    }

    fun give(issuer: &signer, to: address, amount: u64) acquires Usdc {
        primary_fungible_store::mint(&borrow_global<Usdc>(signer::address_of(issuer)).mint, to, amount);
    }

    fun setup(pulse: &signer, issuer: &signer, founder: &signer): Object<Metadata> acquires Usdc {
        account::create_account_for_test(signer::address_of(founder));
        let usdc = make_usdc(issuer);
        launchpad::initialize(pulse, usdc);
        give(issuer, signer::address_of(founder), 1000 * USDC);
        usdc
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    fun launch_locks_collateral_and_mints_fixed_supply(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        assert!(launchpad::min_collateral() == 20 * USDC, 0);
        let t = launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 100 * USDC);
        let f = signer::address_of(founder);
        assert!(primary_fungible_store::balance(f, t) == SUPPLY, 1);
        assert!(primary_fungible_store::balance(f, usdc) == 900 * USDC, 2);
        assert!(launchpad::backing(t) == 100 * USDC, 3);
        assert!(launchpad::supply(t) == SUPPLY, 4);
        assert!(launchpad::founder(t) == f, 5);
        // supply is capped at the minted amount: max supply == supply
        assert!(fungible_asset::maximum(t) == option::some((SUPPLY as u128)), 6);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    fun redeem_pays_exact_share_and_floor_does_not_move(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        let t = launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 100 * USDC);
        let floor0 = launchpad::floor_price(t);
        // 10% of supply -> exactly 10 USDC of the 100 (same number as the Arc test)
        launchpad::redeem(founder, t, SUPPLY / 10);
        let f = signer::address_of(founder);
        assert!(primary_fungible_store::balance(f, usdc) == 910 * USDC, 1);
        assert!(launchpad::backing(t) == 90 * USDC, 2);
        assert!(launchpad::supply(t) == SUPPLY - SUPPLY / 10, 3);
        assert!(launchpad::floor_price(t) == floor0, 4);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0, holder = @0xB0)]
    fun third_party_holder_redeems_after_transfer(pulse: &signer, issuer: &signer, founder: &signer, holder: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        let t = launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 100 * USDC);
        let h = signer::address_of(holder);
        account::create_account_for_test(h);
        primary_fungible_store::transfer(founder, t, h, SUPPLY / 4);
        launchpad::redeem(holder, t, SUPPLY / 4);
        assert!(primary_fungible_store::balance(h, usdc) == 25 * USDC, 1);
        assert!(primary_fungible_store::balance(h, t) == 0, 2);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0, donor = @0xD0)]
    fun anyone_can_fund_and_it_raises_the_floor(pulse: &signer, issuer: &signer, founder: &signer, donor: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        let t = launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 100 * USDC);
        let floor0 = launchpad::floor_price(t);
        give(issuer, signer::address_of(donor), 50 * USDC);
        launchpad::fund(donor, t, 50 * USDC);
        assert!(launchpad::backing(t) == 150 * USDC, 1);
        assert!(launchpad::floor_price(t) == floor0 * 3 / 2, 2);
        launchpad::redeem(founder, t, SUPPLY / 2);
        assert!(primary_fungible_store::balance(signer::address_of(founder), usdc) == 900 * USDC + 75 * USDC, 3);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    fun redeeming_everything_empties_the_vault_exactly(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        let t = launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 37 * USDC + 3);
        launchpad::redeem(founder, t, 333333);
        launchpad::redeem(founder, t, SUPPLY - 333333);
        assert!(launchpad::backing(t) == 0, 1);
        assert!(launchpad::supply(t) == 0, 2);
        assert!(primary_fungible_store::balance(signer::address_of(founder), usdc) == 1000 * USDC, 3);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 4, location = pulse::launchpad)]
    fun launch_below_twenty_dollars_is_refused(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 20 * USDC - 1);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure]
    fun cannot_redeem_more_than_held(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        let t = launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 100 * USDC);
        launchpad::redeem(founder, t, SUPPLY + 1);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 2, location = pulse::launchpad)]
    fun initialize_only_once(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        launchpad::initialize(pulse, usdc);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 1, location = pulse::launchpad)]
    fun initialize_only_by_publisher(pulse: &signer, issuer: &signer, founder: &signer) {
        let _ = pulse;
        account::create_account_for_test(signer::address_of(founder));
        let usdc = make_usdc(issuer);
        launchpad::initialize(founder, usdc);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 7, location = pulse::launchpad)]
    fun redeem_of_a_foreign_token_is_refused(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        launchpad::redeem(founder, usdc, 1);
    }
}
