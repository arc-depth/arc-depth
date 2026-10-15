#[test_only]
module pulse::launchpad_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use pulse::launchpad::{Self, Config, InitCap, Vault};

    public struct PTST has drop {}
    public struct USDC has drop {}
    public struct OTHER has drop {}

    const PUB: address = @0xA11CE;
    const FOUNDER: address = @0xF0;
    const HOLDER: address = @0xB0;
    const DONOR: address = @0xD0;
    const USD: u64 = 1_000_000;                  // 6 decimals
    const SUPPLY: u64 = 1_000_000_000_000_000;   // 1e9 tokens, 6 decimals

    fun setup(): Scenario {
        let mut s = ts::begin(PUB);
        launchpad::init_for_testing(s.ctx());
        s.next_tx(PUB);
        {
            let cap = s.take_from_sender<InitCap>();
            let mut cfg = s.take_shared<Config>();
            launchpad::initialize<USDC>(cap, &mut cfg, 6);
            ts::return_shared(cfg);
        };
        s
    }

    fun usdc(s: &mut Scenario, amount: u64): Coin<USDC> { coin::mint_for_testing<USDC>(amount, s.ctx()) }

    /// founder launches with `col` collateral; returns the scenario at the next tx
    fun launch_with(s: &mut Scenario, col: u64) {
        s.next_tx(FOUNDER);
        let cfg = s.take_shared<Config>();
        let cap = coin::create_treasury_cap_for_testing<PTST>(s.ctx());
        let c = usdc(s, col);
        let tokens = launchpad::launch<PTST, USDC>(&cfg, cap, SUPPLY, c, s.ctx());
        transfer::public_transfer(tokens, FOUNDER);
        ts::return_shared(cfg);
        s.next_tx(FOUNDER);
    }

    #[test]
    fun launch_locks_collateral_and_mints_fixed_supply() {
        let mut s = setup();
        launch_with(&mut s, 100 * USD);
        let v = s.take_shared<Vault<PTST, USDC>>();
        let t = s.take_from_sender<Coin<PTST>>();
        assert!(t.value() == SUPPLY, 1);
        assert!(launchpad::backing(&v) == 100 * USD, 2);
        assert!(launchpad::supply(&v) == SUPPLY, 3);
        assert!(launchpad::founder(&v) == FOUNDER, 4);
        s.return_to_sender(t);
        ts::return_shared(v);
        s.end();
    }

    #[test]
    fun redeem_pays_exact_share_and_floor_does_not_move() {
        let mut s = setup();
        launch_with(&mut s, 100 * USD);
        let mut v = s.take_shared<Vault<PTST, USDC>>();
        let mut t = s.take_from_sender<Coin<PTST>>();
        let floor0 = launchpad::floor_price(&v);
        let part = t.split(SUPPLY / 10, s.ctx());
        let out = launchpad::redeem(&mut v, part, s.ctx());
        assert!(out.value() == 10 * USD, 1);          // same number as the Arc and Aptos tests
        assert!(launchpad::backing(&v) == 90 * USD, 2);
        assert!(launchpad::supply(&v) == SUPPLY - SUPPLY / 10, 3);
        assert!(launchpad::floor_price(&v) == floor0, 4);
        transfer::public_transfer(out, FOUNDER);
        s.return_to_sender(t);
        ts::return_shared(v);
        s.end();
    }

    #[test]
    fun third_party_holder_redeems_after_transfer() {
        let mut s = setup();
        launch_with(&mut s, 100 * USD);
        let mut t = s.take_from_sender<Coin<PTST>>();
        transfer::public_transfer(t.split(SUPPLY / 4, s.ctx()), HOLDER);
        s.return_to_sender(t);
        s.next_tx(HOLDER);
        let mut v = s.take_shared<Vault<PTST, USDC>>();
        let h = s.take_from_sender<Coin<PTST>>();
        let out = launchpad::redeem(&mut v, h, s.ctx());
        assert!(out.value() == 25 * USD, 1);
        transfer::public_transfer(out, HOLDER);
        ts::return_shared(v);
        s.end();
    }

    #[test]
    fun anyone_can_fund_and_it_raises_the_floor() {
        let mut s = setup();
        launch_with(&mut s, 100 * USD);
        s.next_tx(DONOR);
        let mut v = s.take_shared<Vault<PTST, USDC>>();
        let floor0 = launchpad::floor_price(&v);
        let gift = usdc(&mut s, 50 * USD);
        launchpad::fund(&mut v, gift, s.ctx());
        assert!(launchpad::backing(&v) == 150 * USD, 1);
        assert!(launchpad::floor_price(&v) == floor0 * 3 / 2, 2);
        ts::return_shared(v);
        s.next_tx(FOUNDER);
        let mut v = s.take_shared<Vault<PTST, USDC>>();
        let mut t = s.take_from_sender<Coin<PTST>>();
        let out = launchpad::redeem(&mut v, t.split(SUPPLY / 2, s.ctx()), s.ctx());
        assert!(out.value() == 75 * USD, 3);
        transfer::public_transfer(out, FOUNDER);
        s.return_to_sender(t);
        ts::return_shared(v);
        s.end();
    }

    #[test]
    fun redeeming_everything_empties_the_vault_exactly() {
        let mut s = setup();
        launch_with(&mut s, 37 * USD + 3);
        let mut v = s.take_shared<Vault<PTST, USDC>>();
        let mut t = s.take_from_sender<Coin<PTST>>();
        let a = launchpad::redeem(&mut v, t.split(333333, s.ctx()), s.ctx());
        let b = launchpad::redeem(&mut v, t, s.ctx());
        assert!(a.value() + b.value() == 37 * USD + 3, 1);
        assert!(launchpad::backing(&v) == 0, 2);
        assert!(launchpad::supply(&v) == 0, 3);
        transfer::public_transfer(a, FOUNDER);
        transfer::public_transfer(b, FOUNDER);
        ts::return_shared(v);
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::ECollateralTooLow)]
    fun launch_below_twenty_dollars_is_refused() {
        let mut s = setup();
        launch_with(&mut s, 20 * USD - 1);
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::EWrongCollateral)]
    fun launch_with_another_coin_as_collateral_is_refused() {
        let mut s = setup();
        s.next_tx(FOUNDER);
        let cfg = s.take_shared<Config>();
        let cap = coin::create_treasury_cap_for_testing<PTST>(s.ctx());
        let c = coin::mint_for_testing<OTHER>(100 * USD, s.ctx());
        let tokens = launchpad::launch<PTST, OTHER>(&cfg, cap, SUPPLY, c, s.ctx());
        transfer::public_transfer(tokens, FOUNDER);
        ts::return_shared(cfg);
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::EAlreadyMinted)]
    fun a_premined_token_cannot_launch() {
        let mut s = setup();
        s.next_tx(FOUNDER);
        let cfg = s.take_shared<Config>();
        let mut cap = coin::create_treasury_cap_for_testing<PTST>(s.ctx());
        let hidden = coin::mint(&mut cap, 1, s.ctx());
        transfer::public_transfer(hidden, FOUNDER);
        let c = usdc(&mut s, 100 * USD);
        let tokens = launchpad::launch<PTST, USDC>(&cfg, cap, SUPPLY, c, s.ctx());
        transfer::public_transfer(tokens, FOUNDER);
        ts::return_shared(cfg);
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::ENotInitialized)]
    fun launch_before_initialize_is_refused() {
        let mut s = ts::begin(PUB);
        launchpad::init_for_testing(s.ctx());
        launch_with(&mut s, 100 * USD);
        s.end();
    }

    #[test, expected_failure(abort_code = launchpad::EZeroAmount)]
    fun redeeming_zero_is_refused() {
        let mut s = setup();
        launch_with(&mut s, 100 * USD);
        let mut v = s.take_shared<Vault<PTST, USDC>>();
        let out = launchpad::redeem(&mut v, coin::zero<PTST>(s.ctx()), s.ctx());
        transfer::public_transfer(out, FOUNDER);
        ts::return_shared(v);
        s.end();
    }
}
