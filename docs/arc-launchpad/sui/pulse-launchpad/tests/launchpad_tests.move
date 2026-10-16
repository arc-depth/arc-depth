#[test_only]
module pulse::launchpad_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use pulse::launchpad::{Self, Config, InitCap, Vault};

    public struct PTST has drop {}
    public struct USDC has drop {}
    public struct OTHER has drop {}

    const PUB: address = @0xA11CE;
    const FOUNDER: address = @0xF0;
    const BUYER: address = @0xB0;
    const PLATFORM: address = @0x9A7F;
    const USD: u64 = 1_000_000;
    const SUPPLY: u64 = 1_000_000_000_000_000;

    fun setup(): (Scenario, Clock) {
        let mut s = ts::begin(PUB);
        launchpad::init_for_testing(s.ctx());
        let c = clock::create_for_testing(s.ctx());
        s.next_tx(PUB);
        {
            let cap = s.take_from_sender<InitCap>();
            let mut cfg = s.take_shared<Config>();
            launchpad::initialize<USDC>(cap, &mut cfg, 6, PLATFORM);
            ts::return_shared(cfg);
        };
        (s, c)
    }

    fun usdc(s: &mut Scenario, amount: u64): Coin<USDC> { coin::mint_for_testing<USDC>(amount, s.ctx()) }

    /// 20 collateral, 100 first buy, 1% tax; founder's tokens go to FOUNDER
    fun open_with(s: &mut Scenario, c: &Clock, col: u64, first: u64, tax: u64, min: u64) {
        s.next_tx(FOUNDER);
        let cfg = s.take_shared<Config>();
        let cap = coin::create_treasury_cap_for_testing<PTST>(s.ctx());
        let a = usdc(s, col);
        let b = usdc(s, first);
        let tokens = launchpad::launch<PTST, USDC>(&cfg, cap, SUPPLY, a, b, tax, min, c, s.ctx());
        transfer::public_transfer(tokens, FOUNDER);
        ts::return_shared(cfg);
        s.next_tx(FOUNDER);
    }

    fun open(s: &mut Scenario, c: &mut Clock) {
        open_with(s, c, 20 * USD, 100 * USD, 10_000, 0);
        c.increment_for_testing(10_000);
    }

    /// total USDC held in coins by an address
    fun coins_of(s: &Scenario, who: address): u64 {
        let ids = ts::ids_for_address<Coin<USDC>>(who);
        let mut total = 0;
        let mut i = 0;
        while (i < ids.length()) {
            let k = ts::take_from_address_by_id<Coin<USDC>>(s, who, ids[i]);
            total = total + k.value();
            ts::return_to_address(who, k);
            i = i + 1;
        };
        total
    }

    fun buy_as(s: &mut Scenario, c: &Clock, who: address, amount: u64): Coin<PTST> {
        s.next_tx(who);
        let mut v = s.take_shared<Vault<PTST, USDC>>();
        let cfg = s.take_shared<Config>();
        let pay = usdc(s, amount);
        let t = launchpad::buy(&mut v, &cfg, pay, 0, c, s.ctx());
        ts::return_shared(v);
        ts::return_shared(cfg);
        t
    }

    fun sell_as(s: &mut Scenario, c: &Clock, who: address, t: Coin<PTST>): Coin<USDC> {
        s.next_tx(who);
        let mut v = s.take_shared<Vault<PTST, USDC>>();
        let cfg = s.take_shared<Config>();
        let out = launchpad::sell(&mut v, &cfg, t, 0, c, s.ctx());
        ts::return_shared(v);
        ts::return_shared(cfg);
        out
    }

    /// (backing, pool dollars, circulating) read in a fresh transaction
    fun state(s: &mut Scenario): (u64, u64, u64) {
        s.next_tx(BUYER);
        let v = s.take_shared<Vault<PTST, USDC>>();
        let r1 = launchpad::backing(&v);
        let r2 = launchpad::pool_dollars(&v);
        let r3 = launchpad::circulating(&v);
        ts::return_shared(v);
        (r1, r2, r3)
    }

    #[test]
    fun snipe_rate_quarters_every_second_and_ends_at_five() {
        assert!(launchpad::snipe_ppm_at(0) == 990_000, 0);
        assert!(launchpad::snipe_ppm_at(1) == 247_500, 1);
        assert!(launchpad::snipe_ppm_at(4) == 3_867, 2);
        assert!(launchpad::snipe_ppm_at(5) == 0, 3);
    }

    #[test]
    fun launch_puts_all_supply_in_the_pool_and_founder_buys_at_the_opening_price() {
        let (mut s, mut c) = setup();
        open(&mut s, &mut c);
        let got = s.take_from_address<Coin<PTST>>(FOUNDER);
        let v = s.take_shared<Vault<PTST, USDC>>();
        assert!(launchpad::pool_tokens(&v) + got.value() == SUPPLY, 1);
        // 100 first buy: 2 launch fee, the other 98 is pool bid (as on EVM)
        assert!(got.value() == (((SUPPLY as u128) * 98_000_000 / (3_500_000_000 + 98_000_000)) as u64), 2);
        assert!(launchpad::pool_dollars(&v) == 98 * USD, 3);
        assert!(launchpad::backing(&v) == 20 * USD, 4);          // no tax on the opening buy
        assert!(coins_of(&s, PLATFORM) == 2 * USD, 5);           // the launch fee
        assert!(coins_of(&s, FOUNDER) == 0, 6);
        assert!(launchpad::circulating(&v) == got.value(), 7);
        ts::return_to_address(FOUNDER, got);
        ts::return_shared(v);
        c.destroy_for_testing();
        s.end();
    }

    #[test]
    fun a_sniper_in_the_opening_second_pays_99_percent_into_the_pool() {
        let (mut s, c0) = setup();
        let mut c = c0;
        open_with(&mut s, &c, 20 * USD, 100 * USD, 10_000, 0);    // no time passes
        let (_, d0, _) = state(&mut s);
        let sniped = buy_as(&mut s, &c, BUYER, 100 * USD);
        let (_, d1, _) = state(&mut s);
        assert!(d1 - d0 >= 99 * USD, 1);
        c.increment_for_testing(10_000);
        let later = buy_as(&mut s, &c, BUYER, 100 * USD);
        assert!(later.value() > sniped.value() * 90, 2);
        transfer::public_transfer(sniped, BUYER);
        transfer::public_transfer(later, BUYER);
        c.destroy_for_testing();
        s.end();
    }

    #[test]
    fun every_trade_pays_tax_and_a_large_sale_pays_the_shield() {
        let (mut s, mut c) = setup();
        open(&mut s, &mut c);
        let mut t = buy_as(&mut s, &c, BUYER, 500 * USD);
        c.increment_for_testing(1_000);
        let (b0, d0, circ) = state(&mut s);
        let small = t.split(circ / 1000, s.ctx());
        let o1 = sell_as(&mut s, &c, BUYER, small);
        let (b1, d1, _) = state(&mut s);
        c.increment_for_testing(1_000);
        let o2 = sell_as(&mut s, &c, BUYER, t);
        let (b2, d2, _) = state(&mut s);
        let tax_small = b1 - b0;
        let tax_big = b2 - b1;
        // pool dollars fall by gross minus the 0.70% depth that stays
        let gross_small = d0 - d1;
        let gross_big = d1 - d2;
        assert!(tax_small * 1000 <= gross_small * 11 + 1000, 1);   // ~1%
        assert!(tax_big * 1000 >= gross_big * 38, 2);              // ~1% + 3% shield
        transfer::public_transfer(o1, BUYER);
        transfer::public_transfer(o2, BUYER);
        c.destroy_for_testing();
        s.end();
    }

    #[test]
    fun a_round_trip_never_returns_more_than_was_paid() {
        let (mut s, mut c) = setup();
        open(&mut s, &mut c);
        let t = buy_as(&mut s, &c, BUYER, 300 * USD);
        let back = sell_as(&mut s, &c, BUYER, t);
        assert!(back.value() < 300 * USD, 1);
        assert!(back.value() > 270 * USD, 2);                       // fees, tax, 3% shield
        transfer::public_transfer(back, BUYER);
        c.destroy_for_testing();
        s.end();
    }

    #[test]
    fun the_virtual_reserve_is_never_paid_out() {
        let (mut s, mut c) = setup();
        open(&mut s, &mut c);
        let t = buy_as(&mut s, &c, BUYER, 400 * USD);
        let o1 = sell_as(&mut s, &c, BUYER, t);
        s.next_tx(FOUNDER);
        let ft = s.take_from_address<Coin<PTST>>(FOUNDER);
        let o2 = sell_as(&mut s, &c, FOUNDER, ft);
        transfer::public_transfer(o1, BUYER);
        transfer::public_transfer(o2, FOUNDER);
        s.next_tx(FOUNDER);
        let v = s.take_shared<Vault<PTST, USDC>>();
        assert!(launchpad::pool_tokens(&v) == SUPPLY, 1);
        assert!(launchpad::circulating(&v) == 0, 2);
        // every dollar is somewhere: nothing came out of the virtual reserve
        let total = coins_of(&s, BUYER) + coins_of(&s, FOUNDER) + coins_of(&s, PLATFORM) + launchpad::pool_dollars(&v) + launchpad::backing(&v);
        assert!(total == 520 * USD, 3);                             // 20 + 100 + 400 put in
        ts::return_shared(v);
        c.destroy_for_testing();
        s.end();
    }

    #[test]
    fun redeem_pays_by_circulating_supply_and_empties_exactly() {
        let (mut s, mut c) = setup();
        open(&mut s, &mut c);
        let mut ft = s.take_from_address<Coin<PTST>>(FOUNDER);
        let mut v = s.take_shared<Vault<PTST, USDC>>();
        let held = ft.value();
        let back = launchpad::backing(&v);
        let part = ft.split(held / 10, s.ctx());
        let p1 = launchpad::redeem(&mut v, part, s.ctx());
        assert!(p1.value() == (((back as u128) * ((held / 10) as u128) / (held as u128)) as u64), 1);
        let p2 = launchpad::redeem(&mut v, ft, s.ctx());
        assert!(p1.value() + p2.value() == back, 2);                // all circulating redeemed = whole vault
        assert!(launchpad::backing(&v) == 0, 3);
        transfer::public_transfer(p1, FOUNDER);
        transfer::public_transfer(p2, FOUNDER);
        ts::return_shared(v);
        c.destroy_for_testing();
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::EFirstBuyRange)]
    fun first_buy_above_500_is_refused() {
        let (mut s, c) = setup();
        open_with(&mut s, &c, 20 * USD, 501 * USD, 10_000, 0);
        c.destroy_for_testing();
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::EFirstBuyRange)]
    fun first_buy_below_100_is_refused() {
        let (mut s, c) = setup();
        open_with(&mut s, &c, 20 * USD, 99 * USD, 10_000, 0);
        c.destroy_for_testing();
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::ETaxRange)]
    fun tax_above_5_percent_is_refused() {
        let (mut s, c) = setup();
        open_with(&mut s, &c, 20 * USD, 100 * USD, 50_001, 0);
        c.destroy_for_testing();
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::ECollateralTooLow)]
    fun collateral_below_twenty_dollars_is_refused() {
        let (mut s, c) = setup();
        open_with(&mut s, &c, 20 * USD - 1, 100 * USD, 10_000, 0);
        c.destroy_for_testing();
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::ESlippage)]
    fun slippage_limit_is_enforced() {
        let (mut s, c) = setup();
        open_with(&mut s, &c, 20 * USD, 100 * USD, 10_000, SUPPLY / 10);
        c.destroy_for_testing();
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::EWrongCollateral)]
    fun another_coin_as_collateral_is_refused() {
        let (mut s, c) = setup();
        s.next_tx(FOUNDER);
        let cfg = s.take_shared<Config>();
        let cap = coin::create_treasury_cap_for_testing<PTST>(s.ctx());
        let a = coin::mint_for_testing<OTHER>(20 * USD, s.ctx());
        let b = coin::mint_for_testing<OTHER>(100 * USD, s.ctx());
        let t = launchpad::launch<PTST, OTHER>(&cfg, cap, SUPPLY, a, b, 10_000, 0, &c, s.ctx());
        transfer::public_transfer(t, FOUNDER);
        ts::return_shared(cfg);
        c.destroy_for_testing();
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::EAlreadyMinted)]
    fun a_premined_token_cannot_launch() {
        let (mut s, c) = setup();
        s.next_tx(FOUNDER);
        let cfg = s.take_shared<Config>();
        let mut cap = coin::create_treasury_cap_for_testing<PTST>(s.ctx());
        transfer::public_transfer(coin::mint(&mut cap, 1, s.ctx()), FOUNDER);
        let a = usdc(&mut s, 20 * USD);
        let b = usdc(&mut s, 100 * USD);
        let t = launchpad::launch<PTST, USDC>(&cfg, cap, SUPPLY, a, b, 10_000, 0, &c, s.ctx());
        transfer::public_transfer(t, FOUNDER);
        ts::return_shared(cfg);
        c.destroy_for_testing();
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::ENotInitialized)]
    fun launch_before_initialize_is_refused() {
        let mut s = ts::begin(PUB);
        launchpad::init_for_testing(s.ctx());
        let c = clock::create_for_testing(s.ctx());
        open_with(&mut s, &c, 20 * USD, 100 * USD, 10_000, 0);
        c.destroy_for_testing();
        s.end();
    }
}
