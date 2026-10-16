#[test_only]
module pulse::launchpad_tests {
    use std::signer;
    use std::string::utf8;
    use std::option;
    use aptos_framework::account;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::fungible_asset::{Self, Metadata, MintRef};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;
    use pulse::launchpad;

    const USD: u64 = 1000000;              // 6 decimals
    const SUPPLY: u64 = 1000000000000000;  // 1e9 tokens, 6 decimals
    const PLATFORM: address = @0x9A7F;

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
        timestamp::set_time_has_started_for_testing(&account::create_signer_for_test(@aptos_framework));
        account::create_account_for_test(signer::address_of(founder));
        let usdc = make_usdc(issuer);
        launchpad::initialize(pulse, usdc, PLATFORM);
        give(issuer, signer::address_of(founder), 1000 * USD);
        usdc
    }

    /// 20 USDC collateral, 100 USDC first buy, 1% collateral tax; then the
    /// clock moves past the anti-snipe window
    fun open(founder: &signer): Object<Metadata> {
        let t = open_now(founder);
        timestamp::fast_forward_seconds(10);
        t
    }

    fun open_now(founder: &signer): Object<Metadata> {
        launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 20 * USD, 100 * USD, 10000, 0)
    }

    fun buyer_with(issuer: &signer, buyer: &signer, amount: u64): address acquires Usdc {
        let b = signer::address_of(buyer);
        account::create_account_for_test(b);
        give(issuer, b, amount);
        b
    }

    #[test]
    fun snipe_rate_quarters_every_second_and_ends_at_five() {
        assert!(launchpad::snipe_ppm_at(0) == 990000, 0);
        assert!(launchpad::snipe_ppm_at(1) == 247500, 1);
        assert!(launchpad::snipe_ppm_at(2) == 61875, 2);
        assert!(launchpad::snipe_ppm_at(3) == 15468, 3);
        assert!(launchpad::snipe_ppm_at(4) == 3867, 4);
        assert!(launchpad::snipe_ppm_at(5) == 0, 5);
        assert!(launchpad::snipe_ppm_at(60) == 0, 6);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0, sniper = @0x5A, buyer = @0xB0)]
    fun a_sniper_in_the_opening_second_pays_99_percent_into_the_pool(pulse: &signer, issuer: &signer, founder: &signer, sniper: &signer, buyer: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        let t = open_now(founder);
        let s = buyer_with(issuer, sniper, 100 * USD);
        let (_, d0, _) = launchpad::pool_reserves(t);
        launchpad::buy(sniper, t, 100 * USD, 0);
        let (_, d1, _) = launchpad::pool_reserves(t);
        assert!(d1 - d0 >= 99 * USD, 1);                               // the 99 stayed in the pool
        let sniped = bal(s, t);
        // the same 100 dollars ten seconds later buys ~100x more
        timestamp::fast_forward_seconds(10);
        let b = buyer_with(issuer, buyer, 100 * USD);
        launchpad::buy(buyer, t, 100 * USD, 0);
        assert!(bal(b, t) > sniped * 90, 2);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0, whale = @0xEE)]
    fun a_large_sale_pays_the_shield_into_the_vault(pulse: &signer, issuer: &signer, founder: &signer, whale: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        let t = open(founder);
        let w = buyer_with(issuer, whale, 500 * USD);
        launchpad::buy(whale, t, 500 * USD, 0);
        timestamp::fast_forward_seconds(1);
        // a small sale (< 0.5% of circulating) pays only the 1% tax
        let small = launchpad::circulating(t) / 1000;
        let v0 = launchpad::backing(t);
        let usdc0 = launchpad::pool_reserves_dollars(t);
        launchpad::sell(whale, t, small, 0);
        let gross_small = usdc0 - launchpad::pool_reserves_dollars(t);
        let tax_small = launchpad::backing(t) - v0;
        timestamp::fast_forward_seconds(1);
        // the whale dumps everything in one block: > 3.5% of circulating, so +3% capped
        let v1 = launchpad::backing(t);
        let usdc1 = launchpad::pool_reserves_dollars(t);
        launchpad::sell(whale, t, bal(w, t), 0);
        let gross_big = usdc1 - launchpad::pool_reserves_dollars(t);
        let tax_big = launchpad::backing(t) - v1;
        // pool dollars fall by gross minus the 0.70% depth that stays
        assert!(tax_small * 1000 <= gross_small * 11 + 1000, 1);        // ~1% of the sale
        assert!(tax_big * 1000 >= gross_big * 38, 2);                   // ~1% + 3% shield of the sale
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0, whale = @0xEE)]
    fun the_shield_window_is_one_block(pulse: &signer, issuer: &signer, founder: &signer, whale: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        let t = open(founder);
        let w = buyer_with(issuer, whale, 500 * USD);
        launchpad::buy(whale, t, 500 * USD, 0);
        let part = bal(w, t) / 20;          // each ~0.4% of circulating: under the threshold alone
        timestamp::fast_forward_seconds(1);
        let v0 = launchpad::backing(t);
        launchpad::sell(whale, t, part, 0);
        launchpad::sell(whale, t, part, 0);  // same block: the window adds up and crosses 0.5%
        let same_block = launchpad::backing(t) - v0;
        timestamp::fast_forward_seconds(1);
        let v1 = launchpad::backing(t);
        launchpad::sell(whale, t, part, 0);
        timestamp::fast_forward_seconds(1);
        launchpad::sell(whale, t, part, 0);  // separate blocks: no shield
        let split_blocks = launchpad::backing(t) - v1;
        assert!(same_block > split_blocks, 1);
    }

    fun bal(a: address, m: Object<Metadata>): u64 { primary_fungible_store::balance(a, m) }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    fun launch_puts_all_supply_in_the_pool_and_founder_buys_at_the_opening_price(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        let t = open(founder);
        let f = signer::address_of(founder);
        let got = bal(f, t);
        let (pool_t, pool_d, virt) = launchpad::pool_reserves(t);
        assert!(pool_t + got == SUPPLY, 1);                          // nothing minted outside the pool
        assert!(virt == 3500 * USD, 2);
        // 100 first buy: 2 launch fee, the other 98 is pool bid (as on EVM: "real bid in the pool 98")
        assert!(got == (((SUPPLY as u128) * 98000000 / (3500000000 + 98000000)) as u64), 3);
        assert!(got * 100 / SUPPLY == 2, 4);                          // ~2.7% of supply (EVM ladder: 2.8%)
        assert!(pool_d == 98 * USD, 5);
        assert!(launchpad::backing(t) == 20 * USD, 6);                // the collateral; no tax on the opening buy
        assert!(bal(PLATFORM, usdc) == 2 * USD, 7);                   // the launch fee
        assert!(bal(f, usdc) == 1000 * USD - 120 * USD, 8);           // 20 collateral + 100 first buy
        assert!(launchpad::circulating(t) == got, 9);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0, buyer = @0xB0)]
    fun every_trade_pays_tax_into_the_vault_and_the_floor_only_rises(pulse: &signer, issuer: &signer, founder: &signer, buyer: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        let t = open(founder);
        let b = signer::address_of(buyer);
        account::create_account_for_test(b);
        give(issuer, b, 500 * USD);
        let back0 = launchpad::backing(t);
        let floor0 = launchpad::floor_price(t);
        launchpad::buy(buyer, t, 200 * USD, 0);
        assert!(launchpad::backing(t) == back0 + 2 * USD, 1);         // 1% of 200
        let mid = launchpad::backing(t);
        launchpad::sell(buyer, t, bal(b, t), 0);
        assert!(launchpad::backing(t) > mid, 2);                      // the sell paid tax too
        assert!(launchpad::floor_price(t) > floor0, 3);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0, buyer = @0xB0)]
    fun a_round_trip_never_returns_more_than_was_paid(pulse: &signer, issuer: &signer, founder: &signer, buyer: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        let t = open(founder);
        let b = signer::address_of(buyer);
        account::create_account_for_test(b);
        give(issuer, b, 300 * USD);
        launchpad::buy(buyer, t, 300 * USD, 0);
        launchpad::sell(buyer, t, bal(b, t), 0);
        let back = bal(b, usdc);
        assert!(back < 300 * USD, 1);
        // buy: 2% fee + 1% tax; sell: 2% + 1% + the 3% shield (the whole
        // position is > 3.5% of circulating, sold in one block) -> ~273
        assert!(back > 270 * USD, 2);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0, buyer = @0xB0)]
    fun the_virtual_reserve_is_never_paid_out(pulse: &signer, issuer: &signer, founder: &signer, buyer: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        let t = open(founder);
        let b = signer::address_of(buyer);
        account::create_account_for_test(b);
        give(issuer, b, 400 * USD);
        launchpad::buy(buyer, t, 400 * USD, 0);
        // everyone sells everything, buyer first, then the founder
        launchpad::sell(buyer, t, bal(b, t), 0);
        let f = signer::address_of(founder);
        launchpad::sell(founder, t, bal(f, t), 0);
        let (pool_t, pool_d, _) = launchpad::pool_reserves(t);
        assert!(pool_t == SUPPLY, 1);                                  // every token back in the pool
        assert!(launchpad::circulating(t) == 0, 2);
        // dollars paid out never exceeded real dollars paid in: the pool keeps
        // only what fees left behind, and the total of all balances is conserved
        let total = bal(f, usdc) + bal(b, usdc) + bal(PLATFORM, usdc) + pool_d + launchpad::backing(t);
        assert!(total == 1400 * USD, 3);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    fun redeem_pays_by_circulating_supply_not_total(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        let t = open(founder);
        let f = signer::address_of(founder);
        let held = bal(f, t);
        let back = launchpad::backing(t);
        let before = bal(f, usdc);
        let floor0 = launchpad::floor_price(t);
        launchpad::redeem(founder, t, held / 10);
        let paid = bal(f, usdc) - before;
        assert!(paid == (((back as u128) * ((held / 10) as u128) / (held as u128)) as u64), 1);
        assert!(paid * 100 > back * 9, 2);                             // ~10% of the vault: circulating, not total supply
        let f1 = launchpad::floor_price(t);
        // the payout rounds down by at most one micro-dollar, so the floor can only
        // tick up, by less than one part in a million
        assert!(f1 >= floor0 && (f1 - floor0) * 1000000 <= floor0, 3);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 11, location = pulse::launchpad)]
    fun pool_tokens_cannot_be_redeemed(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        let t = open(founder);
        launchpad::redeem(founder, t, launchpad::circulating(t) + 1);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 10, location = pulse::launchpad)]
    fun slippage_limit_is_enforced(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 20 * USD, 100 * USD, 10000, SUPPLY / 10);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 8, location = pulse::launchpad)]
    fun first_buy_above_500_is_refused(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 20 * USD, 501 * USD, 10000, 0);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 8, location = pulse::launchpad)]
    fun first_buy_below_100_is_refused(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 20 * USD, 99 * USD, 10000, 0);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 9, location = pulse::launchpad)]
    fun tax_above_5_percent_is_refused(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 20 * USD, 100 * USD, 50001, 0);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 4, location = pulse::launchpad)]
    fun collateral_below_twenty_dollars_is_refused(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        launchpad::launch_token(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, 20 * USD - 1, 100 * USD, 10000, 0);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 2, location = pulse::launchpad)]
    fun initialize_only_once(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        let usdc = setup(pulse, issuer, founder);
        launchpad::initialize(pulse, usdc, PLATFORM);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 1, location = pulse::launchpad)]
    fun initialize_only_by_publisher(pulse: &signer, issuer: &signer, founder: &signer) {
        let _ = pulse;
        account::create_account_for_test(signer::address_of(founder));
        let usdc = make_usdc(issuer);
        launchpad::initialize(founder, usdc, PLATFORM);
    }

    /* ---- paste a token as collateral (launch_backed) ------------------ */

    struct Other has key { mint: MintRef }
    struct GoodWitness has drop {}
    struct BadWitness has drop {}

    fun make_other(issuer: &signer): Object<Metadata> {
        let ctor = object::create_named_object(issuer, b"OTHER");
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &ctor, option::none(), utf8(b"Other"), utf8(b"OTH"), 6, utf8(b""), utf8(b""));
        move_to(issuer, Other { mint: fungible_asset::generate_mint_ref(&ctor) });
        object::object_from_constructor_ref<Metadata>(&ctor)
    }

    fun other_fa(issuer: &signer, amount: u64): fungible_asset::FungibleAsset acquires Other {
        fungible_asset::mint(&borrow_global<Other>(signer::address_of(issuer)).mint, amount)
    }

    fun open_backed(founder: &signer, issuer: &signer, dollars_in: u64): Object<Metadata> acquires Other {
        let conv = launchpad::converted_for_testing(other_fa(issuer, 1000), dollars_in);
        let t = launchpad::launch_backed(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, conv, 100 * USD, 10000, 0);
        timestamp::fast_forward_seconds(10);
        t
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0, buyer = @0xB0)]
    fun a_backed_vault_holds_the_token_and_gathers_tax_dollars(pulse: &signer, issuer: &signer, founder: &signer, buyer: &signer) acquires Usdc, Other {
        let usdc = setup(pulse, issuer, founder);
        let oth = make_other(issuer);
        let t = open_backed(founder, issuer, 20 * USD);
        let (k, kb) = launchpad::target_backing(t);
        assert!(k == object::object_address(&oth) && kb == 1000, 1);
        assert!(launchpad::backing(t) == 0, 2);
        // founder paid only the first buy (the collateral came as the token)
        assert!(bal(signer::address_of(founder), usdc) == 1000 * USD - 100 * USD, 3);
        buyer_with(issuer, buyer, 200 * USD);
        launchpad::buy(buyer, t, 200 * USD, 0);
        assert!(launchpad::backing(t) == 2 * USD, 4);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0, buyer = @0xB0)]
    fun redeem_backed_pays_both_holdings_and_empties_both(pulse: &signer, issuer: &signer, founder: &signer, buyer: &signer) acquires Usdc, Other {
        let usdc = setup(pulse, issuer, founder);
        let oth = make_other(issuer);
        let t = open_backed(founder, issuer, 20 * USD);
        let b = buyer_with(issuer, buyer, 200 * USD);
        launchpad::buy(buyer, t, 200 * USD, 0);
        let f = signer::address_of(founder);
        let circ = launchpad::circulating(t);
        let held = bal(f, t);
        let d0 = bal(f, usdc);
        launchpad::redeem_backed(founder, t, held);
        assert!(bal(f, usdc) - d0 == (((2 * USD) as u128) * (held as u128) / (circ as u128) as u64), 1);
        assert!(bal(f, oth) == ((1000u128) * (held as u128) / (circ as u128) as u64), 2);
        launchpad::redeem_backed(buyer, t, bal(b, t));
        let (_, kb) = launchpad::target_backing(t);
        assert!(kb == 0 && launchpad::backing(t) == 0, 3);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 12, location = pulse::launchpad)]
    fun a_backed_vault_refuses_the_dollar_only_redeem(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc, Other {
        setup(pulse, issuer, founder);
        make_other(issuer);
        let t = open_backed(founder, issuer, 20 * USD);
        launchpad::redeem(founder, t, 1);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 13, location = pulse::launchpad)]
    fun redeem_backed_on_a_dollar_vault_is_refused(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        let t = open(founder);
        launchpad::redeem_backed(founder, t, 1);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 4, location = pulse::launchpad)]
    fun a_conversion_under_twenty_dollars_is_refused(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc, Other {
        setup(pulse, issuer, founder);
        make_other(issuer);
        open_backed(founder, issuer, 20 * USD - 1);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 14, location = pulse::launchpad)]
    fun the_dollar_itself_is_not_a_pasted_token(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        let fa = fungible_asset::mint(&borrow_global<Usdc>(signer::address_of(issuer)).mint, 20 * USD);
        let conv = launchpad::converted_for_testing(fa, 20 * USD);
        launchpad::launch_backed(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, conv, 100 * USD, 10000, 0);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    fun the_registered_adapter_can_issue_a_receipt(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc, Other {
        setup(pulse, issuer, founder);
        make_other(issuer);
        launchpad::register_adapter<GoodWitness>(pulse);
        let conv = launchpad::converted(GoodWitness {}, other_fa(issuer, 1000), 20 * USD);
        launchpad::launch_backed(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, conv, 100 * USD, 10000, 0);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 15, location = pulse::launchpad)]
    fun another_witness_cannot_issue_a_receipt(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc, Other {
        setup(pulse, issuer, founder);
        make_other(issuer);
        launchpad::register_adapter<GoodWitness>(pulse);
        let conv = launchpad::converted(BadWitness {}, other_fa(issuer, 1000), 20 * USD);
        launchpad::launch_backed(founder, utf8(b"Pulse Test"), utf8(b"PTST"), 6, SUPPLY, conv, 100 * USD, 10000, 0);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 16, location = pulse::launchpad)]
    fun the_adapter_is_registered_only_once(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        launchpad::register_adapter<GoodWitness>(pulse);
        launchpad::register_adapter<BadWitness>(pulse);
    }

    #[test(pulse = @pulse, issuer = @0xC1, founder = @0xF0)]
    #[expected_failure(abort_code = 1, location = pulse::launchpad)]
    fun only_the_publisher_registers_the_adapter(pulse: &signer, issuer: &signer, founder: &signer) acquires Usdc {
        setup(pulse, issuer, founder);
        launchpad::register_adapter<GoodWitness>(founder);
    }
}
