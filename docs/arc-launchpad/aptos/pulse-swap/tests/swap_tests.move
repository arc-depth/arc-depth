#[test_only]
module pulse_swap::swap_tests {
    use std::signer;
    use std::string::utf8;
    use std::option;
    use aptos_framework::account;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::fungible_asset::{Self, Metadata, MintRef};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;
    use pulse::launchpad;
    use pulse_swap::swap;

    const USD: u64 = 1000000;
    const SUPPLY: u64 = 1000000000000000;
    const DAY: u64 = 86400;

    struct Mints has key { usdc: MintRef, tok: MintRef }

    fun fa(issuer: &signer, seed: vector<u8>, sym: vector<u8>): (Object<Metadata>, MintRef) {
        let ctor = object::create_named_object(issuer, seed);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(&ctor, option::none(), utf8(sym), utf8(sym), 6, utf8(b""), utf8(b""));
        (object::object_from_constructor_ref<Metadata>(&ctor), fungible_asset::generate_mint_ref(&ctor))
    }

    /// launchpad on USDC, PulseSwap registered as its adapter, TOK minted
    fun setup(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer): (Object<Metadata>, Object<Metadata>) acquires Mints {
        timestamp::set_time_has_started_for_testing(&account::create_signer_for_test(@aptos_framework));
        account::create_account_for_test(signer::address_of(lp));
        account::create_account_for_test(signer::address_of(founder));
        let (usdc, mu) = fa(issuer, b"USDC", b"USDC");
        let (tok, mt) = fa(issuer, b"TOK", b"TOK");
        move_to(issuer, Mints { usdc: mu, tok: mt });
        launchpad::initialize(pulse, usdc, @0x9a7f);
        launchpad::register_adapter<swap::Witness>(pulse);
        swap::init_for_testing(swp);
        give(issuer, signer::address_of(lp), 10000 * USD, 10000 * USD);
        give(issuer, signer::address_of(founder), 1000 * USD, 0);
        (usdc, tok)
    }

    fun give(issuer: &signer, to: address, usdc: u64, tok: u64) acquires Mints {
        let m = borrow_global<Mints>(signer::address_of(issuer));
        if (usdc > 0) primary_fungible_store::mint(&m.usdc, to, usdc);
        if (tok > 0) primary_fungible_store::mint(&m.tok, to, tok);
    }

    fun bal(a: address, m: Object<Metadata>): u64 { primary_fungible_store::balance(a, m) }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    fun a_pool_quotes_x_times_y_and_keeps_the_fee(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (usdc, tok) = setup(pulse, swp, issuer, lp, founder);
        swap::open_pool(lp, tok, 1000 * USD, 500 * USD);              // 1 TOK = 0.50 USDC
        let f = signer::address_of(founder);
        swap::swap(founder, tok, true, 50 * USD, 0);
        let got = bal(f, tok);
        assert!(got == swap::quote(500 * USD, 1000 * USD, 50 * USD), 1);
        // 49.85 after fee against 500: 1000 * 49.85 / 549.85
        assert!(got > 90 * USD && got < 91 * USD, 2);
        let (t, d, _) = swap::reserves(tok);
        assert!(d == 550 * USD && t == 1000 * USD - got, 3);
        // and back: less than 50 returns (fee both ways, price impact)
        swap::swap(founder, tok, false, got, 0);
        assert!(bal(f, usdc) < 1000 * USD && bal(f, usdc) > 999 * USD, 4);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    fun liquidity_providers_get_their_share_back_with_fees(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (usdc, tok) = setup(pulse, swp, issuer, lp, founder);
        swap::open_pool(lp, tok, 1000 * USD, 1000 * USD);
        let l = signer::address_of(lp);
        let s = swap::shares_of(tok, l);
        assert!(s == 1000 * USD - 1000, 1);                            // minus the locked dust
        swap::swap(founder, tok, true, 100 * USD, 0);
        swap::remove_liquidity(lp, tok, s);
        // the provider leaves with more value than it put in: the 0.30% stayed
        let back = bal(l, usdc) - (10000 * USD - 1000 * USD) + (bal(l, tok) - (10000 * USD - 1000 * USD));
        assert!(back > 2000 * USD - 2000, 2);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    fun paste_a_token_end_to_end_in_a_seasoned_deep_pool(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (usdc, tok) = setup(pulse, swp, issuer, lp, founder);
        swap::open_pool(lp, tok, 2000 * USD, 1000 * USD);
        timestamp::fast_forward_seconds(DAY);
        let expected = swap::quote(1000 * USD, 2000 * USD, 25 * USD);
        let conv = swap::convert(founder, tok, 25 * USD, 1);
        let t = launchpad::launch_backed(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, conv, 100 * USD, 10000, 0);
        let (k, kb) = launchpad::target_backing(t);
        assert!(k == object::object_address(&tok) && kb == expected, 1);
        let f = signer::address_of(founder);
        assert!(bal(f, usdc) == 1000 * USD - 25 * USD - 100 * USD, 2);
        // the founder redeems all: gets the whole vault back in TOK
        timestamp::fast_forward_seconds(10);
        launchpad::redeem_backed(founder, t, bal(f, t));
        assert!(bal(f, tok) == expected, 3);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    fun the_one_entry_launch_works(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (usdc, tok) = setup(pulse, swp, issuer, lp, founder);
        swap::open_pool(lp, tok, 2000 * USD, 1000 * USD);
        timestamp::fast_forward_seconds(DAY);
        swap::launch_with_token(founder, tok, 25 * USD, 1, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 100 * USD, 10000, 0);
        assert!(bal(signer::address_of(founder), usdc) == 875 * USD, 1);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    #[expected_failure(abort_code = 5, location = pulse_swap::swap)]
    fun a_young_pool_does_not_count_as_collateral(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (_, tok) = setup(pulse, swp, issuer, lp, founder);
        swap::open_pool(lp, tok, 2000 * USD, 1000 * USD);
        timestamp::fast_forward_seconds(DAY - 1);
        swap::launch_with_token(founder, tok, 25 * USD, 1, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 100 * USD, 10000, 0);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    #[expected_failure(abort_code = 6, location = pulse_swap::swap)]
    fun a_shallow_pool_does_not_count_as_collateral(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (_, tok) = setup(pulse, swp, issuer, lp, founder);
        swap::open_pool(lp, tok, 2000 * USD, 249 * USD);              // < 10 x 25
        timestamp::fast_forward_seconds(DAY);
        swap::launch_with_token(founder, tok, 25 * USD, 1, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 100 * USD, 10000, 0);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    #[expected_failure(abort_code = 8, location = pulse_swap::swap)]
    fun one_pool_per_token(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (_, tok) = setup(pulse, swp, issuer, lp, founder);
        swap::open_pool(lp, tok, 100 * USD, 100 * USD);
        swap::open_pool(lp, tok, 100 * USD, 100 * USD);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    #[expected_failure(abort_code = 1, location = pulse_swap::swap)]
    fun the_dollar_cannot_be_paired_with_itself(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (usdc, _) = setup(pulse, swp, issuer, lp, founder);
        swap::open_pool(lp, usdc, 100 * USD, 100 * USD);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    #[expected_failure(abort_code = 7, location = pulse_swap::swap)]
    fun nobody_withdraws_shares_they_do_not_hold(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (_, tok) = setup(pulse, swp, issuer, lp, founder);
        swap::open_pool(lp, tok, 100 * USD, 100 * USD);
        swap::remove_liquidity(founder, tok, 1);
    }

    /* ---- protocol fee: 0.10%, 5% of it always becomes FTHM -------------- */

    struct FthmMint has key { m: MintRef }

    fun with_fees(issuer: &signer, swp: &signer, lp: &signer): Object<Metadata> {
        let (fthm, mf) = fa(issuer, b"FTHM", b"FTHM");
        primary_fungible_store::mint(&mf, signer::address_of(lp), 100000 * USD);
        move_to(issuer, FthmMint { m: mf });
        swap::initialize(swp, @0x9a7f, fthm, @0xF7);
        swap::open_pool(lp, fthm, 100000 * USD, 1000 * USD);        // 1 FTHM = 0.01 USDC
        fthm
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    fun every_swap_pays_the_fee_and_five_percent_waits_to_buy_fthm(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (usdc, tok) = setup(pulse, swp, issuer, lp, founder);
        with_fees(issuer, swp, lp);
        swap::open_pool(lp, tok, 1000 * USD, 1000 * USD);
        let p0 = bal(@0x9a7f, usdc);
        swap::swap(founder, tok, true, 100 * USD, 0);               // fee 0.10 USDC
        assert!(swap::fthm_bucket() == 5000, 1);                     // 5% of 0.10 = 0.005
        assert!(bal(@0x9a7f, usdc) - p0 == 95000, 2);                // the other 95%
        let got = bal(signer::address_of(founder), tok);
        swap::swap(founder, tok, false, got, 0);                     // selling pays on the dollars out too
        assert!(swap::fthm_bucket() > 5000, 3);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    fun anyone_can_turn_the_bucket_into_fthm_for_the_sink(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (_, tok) = setup(pulse, swp, issuer, lp, founder);
        let fthm = with_fees(issuer, swp, lp);
        swap::open_pool(lp, tok, 1000 * USD, 1000 * USD);
        swap::swap(founder, tok, true, 500 * USD, 0);
        let b = swap::fthm_bucket();
        assert!(b > 0, 1);
        swap::buy_fthm();
        assert!(bal(@0xF7, fthm) > 0, 2);                            // FTHM landed at the sink
        assert!(bal(@0xF7, fthm) > b * 90, 3);                       // ~100 FTHM per dollar in this pool
        assert!(swap::fthm_bucket() < b, 4);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    fun other_contracts_compose_a_swap_without_a_signer(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        let (usdc, tok) = setup(pulse, swp, issuer, lp, founder);
        swap::open_pool(lp, tok, 1000 * USD, 1000 * USD);
        let d = primary_fungible_store::withdraw(founder, usdc, 10 * USD);
        let out = swap::swap_fa(d, tok, true, 1);
        assert!(fungible_asset::amount(&out) > 9 * USD, 1);
        primary_fungible_store::deposit(signer::address_of(founder), out);
    }

    #[test(pulse = @pulse, swp = @pulse_swap, issuer = @0xC1, lp = @0x11, founder = @0xF0)]
    #[expected_failure(abort_code = 10, location = pulse_swap::swap)]
    fun fees_are_set_once(pulse: &signer, swp: &signer, issuer: &signer, lp: &signer, founder: &signer) acquires Mints {
        setup(pulse, swp, issuer, lp, founder);
        let fthm = with_fees(issuer, swp, lp);
        swap::initialize(swp, @0xBAD, fthm, @0xBAD);
    }
}
