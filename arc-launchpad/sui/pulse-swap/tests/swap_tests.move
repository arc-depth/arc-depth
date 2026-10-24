#[test_only]
module pulse_swap::swap_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use pulse::launchpad::{Self, Config, InitCap, AdapterCap, Vault};
    use pulse_swap::swap::{Self, Pool, Registry, FeeCap, Fees, Witness};

    public struct USDC has drop {}
    public struct TOK has drop {}
    public struct FTHM has drop {}
    public struct PTST has drop {}

    const PUB: address = @0xA11CE;
    const LP: address = @0x11;
    const FOUNDER: address = @0xF0;
    const PLATFORM: address = @0x9A7F;
    const SINK: address = @0xF7;
    const USD: u64 = 1_000_000;
    const SUPPLY: u64 = 1_000_000_000_000_000;
    const DAY_MS: u64 = 86_400_000;

    fun usdc(s: &mut Scenario, a: u64): Coin<USDC> { coin::mint_for_testing<USDC>(a, s.ctx()) }
    fun tok(s: &mut Scenario, a: u64): Coin<TOK> { coin::mint_for_testing<TOK>(a, s.ctx()) }

    /// launchpad on USDC with PulseSwap as its adapter, fees initialized
    fun setup(): (Scenario, Clock) {
        let mut s = ts::begin(PUB);
        launchpad::init_for_testing(s.ctx());
        swap::init_for_testing(s.ctx());
        let c = clock::create_for_testing(s.ctx());
        s.next_tx(PUB);
        {
            let mut cfg = s.take_shared<Config>();
            launchpad::initialize<USDC>(s.take_from_sender<InitCap>(), &mut cfg, 6, PLATFORM);
            launchpad::register_adapter<Witness>(s.take_from_sender<AdapterCap>(), &mut cfg);
            ts::return_shared(cfg);
            swap::initialize<USDC, FTHM>(s.take_from_sender<FeeCap>(), PLATFORM, SINK, s.ctx());
        };
        (s, c)
    }

    fun open_tok(s: &mut Scenario, c: &Clock, t: u64, d: u64) {
        s.next_tx(LP);
        let mut reg = s.take_shared<Registry>();
        let a = tok(s, t); let b = usdc(s, d);
        swap::open_pool<TOK, USDC>(&mut reg, a, b, c, s.ctx());
        ts::return_shared(reg);
        s.next_tx(LP);
    }

    fun coins<T>(s: &Scenario, who: address): u64 {
        let ids = ts::ids_for_address<Coin<T>>(who);
        let mut total = 0; let mut i = 0;
        while (i < ids.length()) {
            let k = ts::take_from_address_by_id<Coin<T>>(s, who, ids[i]);
            total = total + k.value(); ts::return_to_address(who, k); i = i + 1;
        };
        total
    }

    #[test]
    fun a_pool_quotes_x_times_y_and_pays_the_fees() {
        let (mut s, c) = setup();
        open_tok(&mut s, &c, 1000 * USD, 1000 * USD);
        s.next_tx(FOUNDER);
        let mut p = s.take_shared<Pool<TOK, USDC>>();
        let mut f = s.take_shared<Fees<USDC>>();
        let pay = usdc(&mut s, 100 * USD);
        let out = swap::buy(&mut p, &mut f, pay, 0, s.ctx());
        assert!(out.value() == swap::quote(1000 * USD, 1000 * USD, 100 * USD - 100_000), 1);
        assert!(swap::fthm_bucket(&f) == 5_000, 2);                 // 5% of the 0.10 fee
        let back = swap::sell(&mut p, &mut f, out, 0, s.ctx());
        assert!(back.value() < 100 * USD && back.value() > 99 * USD, 3);
        transfer::public_transfer(back, FOUNDER);
        ts::return_shared(p); ts::return_shared(f);
        s.next_tx(FOUNDER);
        assert!(coins<USDC>(&s, PLATFORM) > 95_000, 4);              // the other 95%, both legs
        c.destroy_for_testing(); s.end();
    }

    #[test]
    fun liquidity_comes_back_with_the_fees_it_earned() {
        let (mut s, c) = setup();
        open_tok(&mut s, &c, 1000 * USD, 1000 * USD);
        s.next_tx(FOUNDER);
        {
            let mut p = s.take_shared<Pool<TOK, USDC>>(); let mut f = s.take_shared<Fees<USDC>>();
            let pay = usdc(&mut s, 100 * USD);
            let out = swap::buy(&mut p, &mut f, pay, 0, s.ctx());
            transfer::public_transfer(out, FOUNDER);
            ts::return_shared(p); ts::return_shared(f);
        };
        s.next_tx(LP);
        let mut p = s.take_shared<Pool<TOK, USDC>>();
        let sh = swap::shares_of(&p, LP);
        let (a, b) = swap::remove_liquidity(&mut p, sh, s.ctx());
        assert!(a.value() + b.value() > 2000 * USD - 2000, 1);
        transfer::public_transfer(a, LP); transfer::public_transfer(b, LP);
        ts::return_shared(p);
        c.destroy_for_testing(); s.end();
    }

    fun try_launch(s: &mut Scenario, c: &Clock, dollars: u64) {
        s.next_tx(FOUNDER);
        let mut p = s.take_shared<Pool<TOK, USDC>>(); let mut f = s.take_shared<Fees<USDC>>();
        let cfg = s.take_shared<Config>();
        let pay = usdc(s, dollars);
        let conv = swap::convert(&mut p, &mut f, &cfg, pay, 1, c, s.ctx());
        let cap = coin::create_treasury_cap_for_testing<PTST>(s.ctx());
        let first = usdc(s, 100 * USD);
        let t = launchpad::launch_backed<PTST, USDC, TOK>(&cfg, cap, SUPPLY, conv, first, 10_000, 0, c, s.ctx());
        transfer::public_transfer(t, FOUNDER);
        ts::return_shared(p); ts::return_shared(f); ts::return_shared(cfg);
        s.next_tx(FOUNDER);
    }

    #[test]
    fun paste_a_token_end_to_end_in_a_seasoned_deep_pool() {
        let (mut s, mut c) = setup();
        open_tok(&mut s, &c, 2000 * USD, 1000 * USD);
        c.increment_for_testing(DAY_MS);
        let expected = swap::quote(1000 * USD, 2000 * USD, 25 * USD - 25_000);
        try_launch(&mut s, &c, 25 * USD);
        let mut v = s.take_shared<Vault<PTST, USDC>>();
        assert!(launchpad::target_backing<PTST, USDC, TOK>(&v) == expected, 1);
        let all = s.take_from_address<Coin<PTST>>(FOUNDER);
        let (d, k) = launchpad::redeem_backed<PTST, USDC, TOK>(&mut v, all, s.ctx());
        assert!(k.value() == expected && d.value() == 0, 2);
        transfer::public_transfer(d, FOUNDER); transfer::public_transfer(k, FOUNDER);
        ts::return_shared(v);
        c.destroy_for_testing(); s.end();
    }

    #[test, expected_failure(abort_code = swap::EPoolTooYoung)]
    fun a_young_pool_does_not_count_as_collateral() {
        let (mut s, mut c) = setup();
        open_tok(&mut s, &c, 2000 * USD, 1000 * USD);
        c.increment_for_testing(DAY_MS - 1);
        try_launch(&mut s, &c, 25 * USD);
        c.destroy_for_testing(); s.end();
    }

    #[test, expected_failure(abort_code = swap::EPoolTooShallow)]
    fun a_shallow_pool_does_not_count_as_collateral() {
        let (mut s, mut c) = setup();
        open_tok(&mut s, &c, 2000 * USD, 249 * USD);
        c.increment_for_testing(DAY_MS);
        try_launch(&mut s, &c, 25 * USD);
        c.destroy_for_testing(); s.end();
    }

    #[test, expected_failure(abort_code = swap::EPoolExists)]
    fun one_pool_per_token() {
        let (mut s, c) = setup();
        open_tok(&mut s, &c, 100 * USD, 100 * USD);
        open_tok(&mut s, &c, 100 * USD, 100 * USD);
        c.destroy_for_testing(); s.end();
    }

    #[test]
    fun anyone_turns_the_bucket_into_fthm_for_the_sink() {
        let (mut s, c) = setup();
        open_tok(&mut s, &c, 1000 * USD, 1000 * USD);
        s.next_tx(LP);
        {
            let mut reg = s.take_shared<Registry>();
            let a = coin::mint_for_testing<FTHM>(100_000 * USD, s.ctx()); let b = usdc(&mut s, 1000 * USD);
            swap::open_pool<FTHM, USDC>(&mut reg, a, b, &c, s.ctx());
            ts::return_shared(reg);
        };
        s.next_tx(FOUNDER);
        {
            let mut p = s.take_shared<Pool<TOK, USDC>>(); let mut f = s.take_shared<Fees<USDC>>();
            let pay = usdc(&mut s, 500 * USD);
            let out = swap::buy(&mut p, &mut f, pay, 0, s.ctx());
            transfer::public_transfer(out, FOUNDER);
            ts::return_shared(p); ts::return_shared(f);
        };
        s.next_tx(@0x5EE);                                           // a stranger triggers it
        let mut fp = s.take_shared<Pool<FTHM, USDC>>(); let mut f = s.take_shared<Fees<USDC>>();
        let b = swap::fthm_bucket(&f);
        swap::buy_fthm<FTHM, USDC>(&mut fp, &mut f, s.ctx());
        ts::return_shared(fp); ts::return_shared(f);
        s.next_tx(SINK);
        assert!(coins<FTHM>(&s, SINK) > b * 90, 1);                   // ~100 FTHM per dollar
        c.destroy_for_testing(); s.end();
    }

    #[test, expected_failure(abort_code = swap::EWrongFthm)]
    fun the_bucket_cannot_buy_anything_but_fthm() {
        let (mut s, c) = setup();
        open_tok(&mut s, &c, 1000 * USD, 1000 * USD);
        s.next_tx(FOUNDER);
        let mut p = s.take_shared<Pool<TOK, USDC>>(); let mut f = s.take_shared<Fees<USDC>>();
        let pay = usdc(&mut s, 500 * USD);
        let out = swap::buy(&mut p, &mut f, pay, 0, s.ctx());
        transfer::public_transfer(out, FOUNDER);
        swap::buy_fthm<TOK, USDC>(&mut p, &mut f, s.ctx());
        ts::return_shared(p); ts::return_shared(f);
        c.destroy_for_testing(); s.end();
    }
}
