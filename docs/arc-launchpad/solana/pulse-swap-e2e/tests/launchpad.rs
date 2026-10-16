//! The launchpad end to end inside LiteSVM: the program built by
//! cargo-build-sbf (`--features local-test`), the real SPL Token program,
//! every number read back from the accounts. The main flow repeats the Aptos
//! and Sui devnet runs step by step; their numbers are in
//! arastirma/cok-zincir.md (F9/F10, 2026-10-16) and must come out identical.
//!
//!   cd solana/pulse-launchpad && cargo-build-sbf --features local-test
//!   cd solana/pulse-swap-e2e && cargo test

use litesvm::LiteSVM;
use litesvm_token::{get_spl_account, spl_token::state::Account as TokenAccount, CreateAccount, CreateMint, MintTo};
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const USD: u64 = 1_000_000;
const SUPPLY: u64 = 1_000_000_000_000_000; // 1e9 tokens, 6 decimals
const SYSTEM: Address = Address::from_str_const("11111111111111111111111111111111");
const TOKEN: Address = Address::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const MPL: Address = Address::from_str_const("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

fn metadata_pda(mint: &Address) -> Address { Address::find_program_address(&[b"metadata", MPL.as_ref(), mint.as_ref()], &MPL).0 }
/// name, symbol, uri as the launchpad reads them: u8 length + bytes each
fn names(name: &str, symbol: &str, uri: &str) -> Vec<u8> {
    [name, symbol, uri].iter().flat_map(|x| { let mut v = vec![x.len() as u8]; v.extend(x.as_bytes()); v }).collect()
}

fn w(a: Address) -> AccountMeta { AccountMeta::new(a, false) }
fn r(a: Address) -> AccountMeta { AccountMeta::new_readonly(a, false) }
fn s(a: Address) -> AccountMeta { AccountMeta::new(a, true) }
fn u64s(v: &[u64]) -> Vec<u8> { v.iter().flat_map(|x| x.to_le_bytes()).collect() }

fn keypair_file(json: &str) -> Keypair {
    let b: Vec<u8> = json.trim().trim_start_matches('[').trim_end_matches(']').split(',').map(|x| x.trim().parse::<u8>().unwrap()).collect();
    Keypair::try_from(&b[..]).unwrap()
}

struct Env { svm: LiteSVM, pid: Address, swap: Address, admin: Keypair, usdc: Address, config: Address, platform: Address }

struct Launch { mint: Address, launch: Address, pt: Address, pd: Address, vault: Address, f_d: Address, f_t: Address }

impl Env {
    fn pda(&self, seeds: &[&[u8]]) -> Address { Address::find_program_address(seeds, &self.pid).0 }
    fn bal(&self, a: &Address) -> u64 { get_spl_account::<TokenAccount>(&self.svm, a).unwrap().amount }
    fn send(&mut self, keys: Vec<AccountMeta>, data: Vec<u8>, signers: &[&Keypair]) -> Result<(), String> {
        self.svm.expire_blockhash();
        let ix = Instruction { program_id: self.pid, accounts: keys, data };
        let tx = Transaction::new_signed_with_payer(&[ix], Some(&signers[0].pubkey()), signers, self.svm.latest_blockhash());
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
    }
    fn account(&mut self, mint: &Address, owner: &Address, amount: u64) -> Address {
        let a = CreateAccount::new(&mut self.svm, &self.admin, mint).owner(owner).send().unwrap();
        if amount > 0 { MintTo::new(&mut self.svm, &self.admin, mint, &a, amount).send().unwrap(); }
        a
    }
    fn user(&mut self) -> Keypair { let k = Keypair::new(); self.svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap(); k }
    fn later(&mut self, secs: i64) {
        let mut c: Clock = self.svm.get_sysvar();
        c.unix_timestamp += secs;
        self.svm.set_sysvar(&c);
    }
    fn next_slot(&mut self) {
        let c: Clock = self.svm.get_sysvar();
        self.svm.warp_to_slot(c.slot + 1);
    }
    fn supply(&self, mint: &Address) -> u64 { u64::from_le_bytes(self.svm.get_account(mint).unwrap().data[36..44].try_into().unwrap()) }
    fn mint_authority_gone(&self, mint: &Address) -> bool { self.svm.get_account(mint).unwrap().data[0] == 0 }

}

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let pid = Keypair::new().pubkey();
    svm.add_program_from_file(pid, concat!(env!("CARGO_MANIFEST_DIR"), "/../pulse-launchpad/target/deploy/pulse_launchpad.so")).unwrap();
    // PulseSwap beside it: the swap program a pasted token is bought through
    let swap = Keypair::new().pubkey();
    svm.add_program_from_file(swap, concat!(env!("CARGO_MANIFEST_DIR"), "/../pulse-swap/target/deploy/pulse_swap.so")).unwrap();
    // Metaplex Token Metadata as deployed on mainnet (solana program dump, see calistir.sh)
    svm.add_program_from_file(MPL, concat!(env!("CARGO_MANIFEST_DIR"), "/programs/mpl_token_metadata.so")).unwrap();
    let admin = keypair_file(include_str!("../../pulse-swap/e2e/test-admin.json"));
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();
    let usdc = CreateMint::new(&mut svm, &admin).decimals(6).send().unwrap();
    let mut e = Env { svm, pid, swap, admin, usdc, config: Address::default(), platform: Address::default() };
    e.config = e.pda(&[b"config"]);
    let po = Keypair::new().pubkey();
    e.platform = e.account(&usdc, &po, 0);
    e
}

/// Initialize data: tag 0, then the one swap program allowed to buy a pasted token
fn init_data(e: &Env) -> Vec<u8> { let mut d = vec![0u8]; d.extend(e.swap.as_ref()); d }

fn init(e: &mut Env) {
    let admin = e.admin.insecure_clone();
    let d = init_data(e);
    e.send(vec![s(admin.pubkey()), w(e.config), r(e.usdc), r(e.platform), r(SYSTEM)], d, &[&admin]).unwrap();
}

/// create the token mint with `authority` (normally the launch PDA)
fn mint_with(e: &mut Env, authority: impl Fn(&Address) -> Address, freeze: bool) -> Address {
    // the launch PDA depends on the mint address, so the mint keypair comes first
    let k = Keypair::new();
    let auth = authority(&k.pubkey());
    let rent = e.svm.minimum_balance_for_rent_exemption(82);
    let create = solana_instruction::Instruction {
        program_id: SYSTEM,
        accounts: vec![AccountMeta::new(e.admin.pubkey(), true), AccountMeta::new(k.pubkey(), true)],
        data: {
            let mut d = vec![0u8, 0, 0, 0];
            d.extend(rent.to_le_bytes());
            d.extend(82u64.to_le_bytes());
            d.extend(TOKEN.as_ref());
            d
        },
    };
    // InitializeMint2: tag 20, decimals, mint authority, freeze COption
    let mut init = vec![20u8, 6];
    init.extend(auth.as_ref());
    if freeze { init.push(1); init.extend(auth.as_ref()); } else { init.push(0); init.extend([0u8; 32]); }
    let initialize = Instruction { program_id: TOKEN, accounts: vec![AccountMeta::new(k.pubkey(), false)], data: init };
    e.svm.expire_blockhash();
    let admin = e.admin.insecure_clone();
    let tx = Transaction::new_signed_with_payer(&[create, initialize], Some(&admin.pubkey()), &[&admin, &k], e.svm.latest_blockhash());
    e.svm.send_transaction(tx).unwrap();
    k.pubkey()
}

fn launch_keys(e: &Env, f: &Keypair, l: &Launch) -> Vec<AccountMeta> {
    vec![s(f.pubkey()), r(e.config), w(l.mint), w(l.launch), w(l.pt), w(l.pd), w(l.vault), w(l.f_d), w(l.f_t), w(e.platform), r(SYSTEM), r(TOKEN), r(e.usdc), w(metadata_pda(&l.mint)), r(MPL)]
}

fn accounts_for(e: &mut Env, f: &Keypair, mint: Address, dollars: u64) -> Launch {
    let launch = e.pda(&[b"launch", mint.as_ref()]);
    let usdc = e.usdc;
    let f_d = e.account(&usdc, &f.pubkey(), dollars);
    let f_t = e.account(&mint, &f.pubkey(), 0);
    Launch { mint, launch, pt: e.pda(&[b"pt", launch.as_ref()]), pd: e.pda(&[b"pd", launch.as_ref()]), vault: e.pda(&[b"vault", launch.as_ref()]), f_d, f_t }
}

fn try_launch(e: &mut Env, f: &Keypair, l: &Launch, supply: u64, collateral: u64, first_buy: u64, tax_ppm: u64) -> Result<(), String> {
    let mut d = vec![1u8];
    d.extend(u64s(&[supply, collateral, first_buy, tax_ppm, 0]));
    d.extend(names("Pulse Test", "PTST", "https://arc-depth.github.io/arc-depth/t.json"));
    e.send(launch_keys(e, f, l), d, &[f])
}

fn launched(e: &mut Env, f: &Keypair, tax_ppm: u64) -> Launch {
    let pid = e.pid;
    let mint = mint_with(e, |m| Address::find_program_address(&[b"launch", m.as_ref()], &pid).0, false);
    let l = accounts_for(e, f, mint, 1000 * USD);
    try_launch(e, f, &l, SUPPLY, 20 * USD, 100 * USD, tax_ppm).unwrap();
    l
}

fn buy(e: &mut Env, who: &Keypair, l: &Launch, b_d: Address, b_t: Address, dollars: u64) -> Result<(), String> {
    let mut d = vec![2u8];
    d.extend(u64s(&[dollars, 0]));
    let keys = vec![AccountMeta::new_readonly(who.pubkey(), true), r(e.config), r(l.launch), w(l.pt), w(l.pd), w(l.vault), w(b_d), w(b_t), w(l.f_d), w(e.platform), r(TOKEN)];
    e.send(keys, d, &[who])
}

fn sell(e: &mut Env, who: &Keypair, l: &Launch, s_t: Address, s_d: Address, tokens: u64, min: u64) -> Result<(), String> {
    let mut d = vec![3u8];
    d.extend(u64s(&[tokens, min]));
    let keys = vec![AccountMeta::new_readonly(who.pubkey(), true), r(e.config), r(l.mint), w(l.launch), w(l.pt), w(l.pd), w(l.vault), w(s_t), w(s_d), w(l.f_d), w(e.platform), r(TOKEN)];
    e.send(keys, d, &[who])
}

fn redeem(e: &mut Env, who: &Keypair, l: &Launch, h_t: Address, h_d: Address, amount: u64) -> Result<(), String> {
    let mut d = vec![4u8];
    d.extend(u64s(&[amount]));
    let keys = vec![AccountMeta::new_readonly(who.pubkey(), true), w(l.mint), r(l.launch), r(l.pt), w(l.vault), w(h_t), w(h_d), r(TOKEN)];
    e.send(keys, d, &[who])
}

#[test]
fn the_devnet_flow_comes_out_to_the_same_cent_as_aptos_and_sui() {
    let mut e = setup();
    init(&mut e);
    let founder = e.user();
    let l = launched(&mut e, &founder, 10_000);
    // launch: 98 USD bid against 3,500 virtual, fee 2 USD, collateral 20 USD
    assert_eq!(e.bal(&l.f_t), 27_237_354_085_603, "founder tokens = 1e9*98/3598");
    assert_eq!(e.bal(&l.vault), 20 * USD);
    assert_eq!(e.bal(&l.pd), 98 * USD);
    assert_eq!(e.bal(&e.platform.clone()), 2 * USD);
    assert_eq!(e.supply(&l.mint), SUPPLY);
    assert!(e.mint_authority_gone(&l.mint), "supply must be final");

    // a separate buyer, after the anti-snipe window: 50 USD
    e.later(10);
    let buyer = e.user();
    let usdc = e.usdc;
    let b_d = e.account(&usdc, &buyer.pubkey(), 100 * USD);
    let b_t = e.account(&l.mint.clone(), &buyer.pubkey(), 0);
    let p0 = e.bal(&e.platform.clone());
    buy(&mut e, &buyer, &l, b_d, b_t, 50 * USD).unwrap();
    assert_eq!(e.bal(&b_t), 12_938_156_678_142, "same as the Sui devnet buy");
    assert_eq!(e.bal(&l.vault), 20_500_000, "1% tax");
    assert_eq!(e.bal(&e.platform.clone()) - p0, 500_000, "1% platform");

    // the buyer sells everything in one go (~32% of circulating): shield at its 3% cap
    let d0 = e.bal(&b_d);
    let v0 = e.bal(&l.vault);
    let all = e.bal(&b_t);
    sell(&mut e, &buyer, &l, b_t, b_d, all, 0).unwrap();
    assert_eq!(e.bal(&b_d) - d0, 45_594_378, "net, same as both devnets");
    assert_eq!(e.bal(&l.vault) - v0, 1_940_186, "1% tax + 3% shield");

    // the founder redeems 10% of their tokens: paid by circulating supply
    let h_d = l.f_d;
    let fd0 = e.bal(&h_d);
    let tenth = e.bal(&l.f_t) / 10;
    assert_eq!(tenth, 2_723_735_408_560);
    redeem(&mut e, &founder, &l, l.f_t, h_d, tenth).unwrap();
    assert_eq!(e.bal(&h_d) - fd0, 2_244_018, "same payout as both devnets");

    // final state, identical to the Aptos devnet read-back
    assert_eq!(e.bal(&l.vault), 20_196_168);
    assert_eq!(e.bal(&l.pd), 98_684_877);
    assert_eq!(e.bal(&l.pt), 972_762_645_914_397);
    assert_eq!(e.supply(&l.mint) + tenth, SUPPLY, "burned tokens leave the supply");
}

#[test]
fn the_opening_seconds_cost_a_sniper_almost_everything() {
    let mut e = setup();
    init(&mut e);
    let founder = e.user();
    let l = launched(&mut e, &founder, 10_000);
    let sniper = e.user();
    let usdc = e.usdc;
    let b_d = e.account(&usdc, &sniper.pubkey(), 100 * USD);
    let b_t = e.account(&l.mint.clone(), &sniper.pubkey(), 0);
    let pd0 = e.bal(&l.pd);
    buy(&mut e, &sniper, &l, b_d, b_t, 100 * USD).unwrap();
    // 99% stays in the pool; fees and tax on the remaining 1 USD
    assert_eq!(e.bal(&l.vault), 20 * USD + 10_000);
    assert!(e.bal(&l.pd) - pd0 > 99 * USD);
    e.later(5);
    let late = e.user();
    let b2 = e.account(&usdc, &late.pubkey(), 100 * USD);
    let t2 = e.account(&l.mint.clone(), &late.pubkey(), 0);
    buy(&mut e, &late, &l, b2, t2, 100 * USD).unwrap();
    assert!(e.bal(&t2) > 50 * e.bal(&b_t), "no snipe from the fifth second");
}

#[test]
fn the_shield_counts_one_slot_and_resets_on_the_next() {
    let mut e = setup();
    init(&mut e);
    let founder = e.user();
    let l = launched(&mut e, &founder, 10_000);
    e.later(10);
    let usdc = e.usdc;
    let f_d = l.f_d;
    // 0.4% of circulating twice in one slot: the second sale pays 0.3% extra
    let circ = e.bal(&l.f_t);
    let piece = circ / 250;
    let v0 = e.bal(&l.vault);
    sell(&mut e, &founder, &l, l.f_t, f_d, piece, 0).unwrap();
    let tax1 = e.bal(&l.vault) - v0;
    let v1 = e.bal(&l.vault);
    sell(&mut e, &founder, &l, l.f_t, f_d, piece, 0).unwrap();
    let tax2 = e.bal(&l.vault) - v1;
    assert!(tax2 * 100 > tax1 * 125, "second sale in the slot pays the shield: {} vs {}", tax2, tax1);
    // next slot: no shield on the same size
    e.next_slot();
    let v2 = e.bal(&l.vault);
    sell(&mut e, &founder, &l, l.f_t, f_d, piece, 0).unwrap();
    let tax3 = e.bal(&l.vault) - v2;
    assert!(tax3 < tax1 + tax1 / 50, "shield reset: {} vs {}", tax3, tax1);
    let _ = usdc;
}

#[test]
fn funding_raises_the_floor_and_redeeming_everything_empties_the_vault() {
    let mut e = setup();
    init(&mut e);
    let founder = e.user();
    let l = launched(&mut e, &founder, 10_000);
    let friend = e.user();
    let usdc = e.usdc;
    let fr = e.account(&usdc, &friend.pubkey(), 10 * USD);
    let mut d = vec![5u8];
    d.extend(u64s(&[10 * USD]));
    e.send(vec![AccountMeta::new_readonly(friend.pubkey(), true), r(l.launch), w(l.vault), w(fr), r(TOKEN)], d, &[&friend]).unwrap();
    assert_eq!(e.bal(&l.vault), 30 * USD, "floor x1.5");
    // the founder holds all circulating tokens: burning them takes the whole vault
    let all = e.bal(&l.f_t);
    let d0 = e.bal(&l.f_d);
    let f_d = l.f_d;
    assert!(redeem(&mut e, &founder, &l, l.f_t, f_d, all + 1).is_err(), "more than circulating");
    redeem(&mut e, &founder, &l, l.f_t, f_d, all).unwrap();
    assert_eq!(e.bal(&l.f_d) - d0, 30 * USD);
    assert_eq!(e.bal(&l.vault), 0);
}

#[test]
fn what_must_be_refused_is_refused() {
    let mut e = setup();
    let stranger = e.user();
    let (config, usdc, platform) = (e.config, e.usdc, e.platform);
    let d = init_data(&e);
    assert!(e.send(vec![s(stranger.pubkey()), w(config), r(usdc), r(platform), r(SYSTEM)], d.clone(), &[&stranger]).is_err(), "stranger initialize");
    init(&mut e);
    let admin = e.admin.insecure_clone();
    assert!(e.send(vec![s(admin.pubkey()), w(config), r(usdc), r(platform), r(SYSTEM)], d, &[&admin]).is_err(), "second initialize");

    let f = e.user();
    let pid = e.pid;
    let ok_mint = |e: &mut Env| mint_with(e, |m| Address::find_program_address(&[b"launch", m.as_ref()], &pid).0, false);

    let m = ok_mint(&mut e);
    let l = accounts_for(&mut e, &f, m, 1000 * USD);
    assert!(try_launch(&mut e, &f, &l, SUPPLY, 20 * USD - 1, 100 * USD, 10_000).is_err(), "collateral under 20 USD");
    assert!(try_launch(&mut e, &f, &l, SUPPLY, 20 * USD, 100 * USD - 1, 10_000).is_err(), "first buy under 100");
    assert!(try_launch(&mut e, &f, &l, SUPPLY, 20 * USD, 501 * USD, 10_000).is_err(), "first buy over 500");
    assert!(try_launch(&mut e, &f, &l, SUPPLY, 20 * USD, 100 * USD, 50_001).is_err(), "tax over 5%");
    assert!(try_launch(&mut e, &f, &l, SUPPLY, 20 * USD, 100 * USD, 9_999).is_err(), "tax under 1%");
    try_launch(&mut e, &f, &l, SUPPLY, 20 * USD, 100 * USD, 10_000).unwrap();
    assert!(try_launch(&mut e, &f, &l, SUPPLY, 20 * USD, 100 * USD, 10_000).is_err(), "launch twice");

    // a mint someone else can still mint, or freeze, is not launched
    let other = Keypair::new().pubkey();
    let m2 = mint_with(&mut e, |_| other, false);
    let l2 = accounts_for(&mut e, &f, m2, 1000 * USD);
    assert!(try_launch(&mut e, &f, &l2, SUPPLY, 20 * USD, 100 * USD, 10_000).is_err(), "foreign mint authority");
    let m3 = mint_with(&mut e, |m| Address::find_program_address(&[b"launch", m.as_ref()], &pid).0, true);
    let l3 = accounts_for(&mut e, &f, m3, 1000 * USD);
    assert!(try_launch(&mut e, &f, &l3, SUPPLY, 20 * USD, 100 * USD, 10_000).is_err(), "freeze authority");

    // fees cannot be sent anywhere else
    let m4 = ok_mint(&mut e);
    let l4 = accounts_for(&mut e, &f, m4, 1000 * USD);
    let mut keys = launch_keys(&e, &f, &l4);
    let fake = e.account(&usdc, &f.pubkey(), 0);
    keys[9] = w(fake);
    let mut d = vec![1u8];
    d.extend(u64s(&[SUPPLY, 20 * USD, 100 * USD, 10_000, 0]));
    d.extend(names("Pulse Test", "PTST", ""));
    assert!(e.send(keys, d, &[&f]).is_err(), "platform swapped");

    // nobody can take pool tokens or redeem without burning
    let thief = e.user();
    let t_t = e.account(&l.mint.clone(), &thief.pubkey(), 0);
    let t_d = e.account(&usdc, &thief.pubkey(), 0);
    assert!(redeem(&mut e, &thief, &l, t_t, t_d, 1).is_err(), "redeem with no tokens");
    assert!(redeem(&mut e, &thief, &l, l.f_t, t_d, 1).is_err(), "redeem someone else's tokens");
    assert_eq!(e.bal(&l.vault), 20 * USD);
}

/* ---- paste a token as collateral, through PulseSwap ------------------- */

fn spda(e: &Env, seeds: &[&[u8]]) -> Address { Address::find_program_address(seeds, &e.swap).0 }

struct Swap { config: Address, bucket: Address, platform: Address, pool: Address, tv: Address, dv: Address, k: Address }

/// PulseSwap initialized, and a K/USDC pool opened with `k_amt` / `d_amt`
fn swap_with_pool(e: &mut Env, k_amt: u64, d_amt: u64) -> Swap {
    let admin = e.admin.insecure_clone();
    let fthm = CreateMint::new(&mut e.svm, &admin).decimals(6).send().unwrap();
    let usdc = e.usdc;
    let po = Keypair::new().pubkey();
    let so = Keypair::new().pubkey();
    let platform = e.account(&usdc, &po, 0);
    let sink = e.account(&fthm, &so, 0);
    let (config, bucket) = (spda(e, &[b"config"]), spda(e, &[b"bucket"]));
    let mut d = vec![0u8];
    d.extend(platform.as_ref()); d.extend(fthm.as_ref()); d.extend(sink.as_ref());
    let swap = e.swap;
    send_to(e, swap, vec![s(admin.pubkey()), w(config), w(bucket), r(usdc), r(SYSTEM), r(TOKEN)], d, &[&admin]).unwrap();
    let k = CreateMint::new(&mut e.svm, &admin).decimals(6).send().unwrap();
    let lp = e.user();
    let lk = e.account(&k, &lp.pubkey(), k_amt);
    let ld = e.account(&usdc, &lp.pubkey(), d_amt);
    let pool = spda(e, &[b"pool", k.as_ref()]);
    let (tv, dv) = (spda(e, &[b"tv", pool.as_ref()]), spda(e, &[b"dv", pool.as_ref()]));
    let shares = spda(e, &[b"shares", pool.as_ref(), lp.pubkey().as_ref()]);
    let mut d = vec![1u8];
    d.extend(u64s(&[k_amt, d_amt]));
    send_to(e, swap, vec![s(lp.pubkey()), r(config), w(pool), r(k), w(tv), w(dv), w(lk), w(ld), w(shares), r(SYSTEM), r(TOKEN), r(usdc)], d, &[&lp]).unwrap();
    Swap { config, bucket, platform, pool, tv, dv, k }
}

fn send_to(e: &mut Env, program: Address, keys: Vec<AccountMeta>, data: Vec<u8>, signers: &[&Keypair]) -> Result<(), String> {
    e.svm.expire_blockhash();
    let ix = Instruction { program_id: program, accounts: keys, data };
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&signers[0].pubkey()), signers, e.svm.latest_blockhash());
    e.svm.send_transaction(tx).map(|_| ()).map_err(|x| format!("{:?}", x.err))
}

fn backed_keys(e: &Env, f: &Keypair, l: &Launch, sw: &Swap, swap_program: Address) -> Vec<AccountMeta> {
    let mut k = launch_keys(e, f, l);
    let kv = e.pda(&[b"kv", l.launch.as_ref()]);
    k.extend([r(sw.k), w(kv), r(swap_program), r(sw.config), r(sw.pool), w(sw.tv), w(sw.dv), w(sw.bucket), w(sw.platform)]);
    k
}

fn try_backed(e: &mut Env, f: &Keypair, sw: &Swap, dollars: u64, swap_program: Address) -> Result<Launch, String> {
    let pid = e.pid;
    let mint = mint_with(e, |m| Address::find_program_address(&[b"launch", m.as_ref()], &pid).0, false);
    let l = accounts_for(e, f, mint, 1000 * USD);
    let mut d = vec![6u8];
    d.extend(u64s(&[SUPPLY, dollars, 100 * USD, 10_000, 0, 0]));
    d.extend(names("Backed", "BKD", ""));
    let keys = backed_keys(e, f, &l, sw, swap_program);
    e.send(keys, d, &[f]).map(|_| l)
}

#[test]
fn a_pasted_token_becomes_the_vault_and_redeems_by_circulating_supply() {
    let mut e = setup();
    init(&mut e);
    let sw = swap_with_pool(&mut e, 2000 * USD, 1000 * USD);
    e.later(86_400);
    let founder = e.user();
    let swap = e.swap;
    let l = try_backed(&mut e, &founder, &sw, 25 * USD, swap).unwrap();
    let kv = e.pda(&[b"kv", l.launch.as_ref()]);
    // 25 USD in: 0.10% protocol fee, then x*y with the 0.30% LP fee
    let net = 25 * USD - 25_000;
    let after = net as u128 * 997_000 / 1_000_000;
    let expected = (2000 * USD as u128 * after / (1000 * USD as u128 + after)) as u64;
    assert_eq!(e.bal(&kv), expected, "the vault holds exactly what the swap delivered");
    assert_eq!(e.bal(&l.vault), 0, "no dollars locked: the collateral is the pasted token");
    assert_eq!(e.bal(&l.f_t), 27_237_354_085_603, "the opening buy is unchanged");
    assert_eq!(e.bal(&sw.bucket), 1_250, "PulseSwap's fee: 5% of 0.025 to the FTHM bucket");

    // a trade adds tax dollars beside the pasted token
    e.later(10);
    let buyer = e.user();
    let usdc = e.usdc;
    let b_d = e.account(&usdc, &buyer.pubkey(), 300 * USD);
    let b_t = e.account(&l.mint.clone(), &buyer.pubkey(), 0);
    buy(&mut e, &buyer, &l, b_d, b_t, 200 * USD).unwrap();
    assert_eq!(e.bal(&l.vault), 2 * USD, "1% tax");

    // a backed vault cannot be redeemed without paying the pasted token
    let half = e.bal(&l.f_t) / 2;
    let f_d = l.f_d;
    assert!(redeem(&mut e, &founder, &l, l.f_t, f_d, half).is_err(), "redeem left the pasted token behind");
    let f_k = e.account(&sw.k.clone(), &founder.pubkey(), 0);
    let circ = e.supply(&l.mint) - e.bal(&l.pt);
    let (k0, v0, d0) = (e.bal(&kv), e.bal(&l.vault), e.bal(&f_d));
    let mut keys = vec![AccountMeta::new_readonly(founder.pubkey(), true), w(l.mint), r(l.launch), r(l.pt), w(l.vault), w(l.f_t), w(f_d), r(TOKEN), w(kv), w(f_k)];
    let mut d = vec![4u8];
    d.extend(u64s(&[half]));
    e.send(keys.clone(), d.clone(), &[&founder]).unwrap();
    let share = |bal: u64| (bal as u128 * half as u128 / circ as u128) as u64;
    assert_eq!(e.bal(&f_k), share(k0), "pasted token paid by circulating supply");
    assert_eq!(e.bal(&f_d) - d0, share(v0), "tax dollars paid in the same proportion");
    // someone else's token vault cannot be substituted
    keys[8] = w(sw.tv);
    assert!(e.send(keys, d, &[&founder]).is_err(), "a foreign vault was accepted");
}

#[test]
fn a_young_or_shallow_pool_or_another_program_does_not_count() {
    let mut e = setup();
    init(&mut e);
    let founder = e.user();
    let swap = e.swap;
    // a day minus one second
    let sw = swap_with_pool(&mut e, 2000 * USD, 1000 * USD);
    e.later(86_399);
    assert!(try_backed(&mut e, &founder, &sw, 25 * USD, swap).is_err(), "a young pool counted");
    e.later(1);
    // under 20 USD of collateral
    assert!(try_backed(&mut e, &founder, &sw, 20 * USD - 1, swap).is_err(), "under 20 USD counted");
    // another swap program: the launchpad trusts only the one fixed at Initialize
    let pid = e.pid;
    assert!(try_backed(&mut e, &founder, &sw, 25 * USD, pid).is_err(), "another program was trusted");
    // the seasoned pool works
    assert!(try_backed(&mut e, &founder, &sw, 25 * USD, swap).is_ok());
}

#[test]
fn a_pool_must_hold_ten_times_the_dollars() {
    let mut e = setup();
    init(&mut e);
    let founder = e.user();
    let swap = e.swap;
    let sw = swap_with_pool(&mut e, 2000 * USD, 249 * USD);
    e.later(86_400);
    assert!(try_backed(&mut e, &founder, &sw, 25 * USD, swap).is_err(), "a shallow pool counted");
    assert!(try_backed(&mut e, &founder, &sw, 24 * USD, swap).is_ok(), "249 >= 10 x 24");
}

/* ---- token metadata --------------------------------------------------- */

/// (update authority, name, symbol, uri, is_mutable) from a Metaplex metadata account
fn read_metadata(e: &Env, mint: &Address) -> (Address, String, String, String, bool) {
    let d = e.svm.get_account(&metadata_pda(mint)).unwrap().data;
    let s = |o: usize| { let n = u32::from_le_bytes(d[o..o + 4].try_into().unwrap()) as usize; (String::from_utf8_lossy(&d[o + 4..o + 4 + n]).trim_end_matches('\0').to_string(), o + 4 + n) };
    let (name, o) = s(65);
    let (symbol, o) = s(o);
    let (uri, o) = s(o);
    // seller fee u16, creators None (0), primary_sale_happened, is_mutable
    assert_eq!(d[o + 2], 0, "no creators");
    (Address::try_from(&d[1..33]).unwrap(), name, symbol, uri, d[o + 4] == 1)
}

#[test]
fn every_launch_gets_a_name_and_symbol_that_no_one_can_change() {
    let mut e = setup();
    init(&mut e);
    let founder = e.user();
    let l = launched(&mut e, &founder, 10_000);
    let (auth, name, symbol, uri, mutable) = read_metadata(&e, &l.mint);
    assert_eq!((name.as_str(), symbol.as_str(), uri.as_str()), ("Pulse Test", "PTST", "https://arc-depth.github.io/arc-depth/t.json"));
    assert_eq!(auth, l.launch, "update authority is the launch PDA, which never signs an update");
    assert!(!mutable, "metadata is immutable");
    assert!(e.mint_authority_gone(&l.mint), "and supply is still final");

    // an empty name, a symbol over 10 bytes and a wrong metadata account are refused
    let pid = e.pid;
    for (n, sy) in [("", "X"), ("Name", "ELEVENCHARS")] {
        let m = mint_with(&mut e, |x| Address::find_program_address(&[b"launch", x.as_ref()], &pid).0, false);
        let l2 = accounts_for(&mut e, &founder, m, 1000 * USD);
        let mut d = vec![1u8];
        d.extend(u64s(&[SUPPLY, 20 * USD, 100 * USD, 10_000, 0]));
        d.extend(names(n, sy, ""));
        let k = launch_keys(&e, &founder, &l2);
        assert!(e.send(k, d, &[&founder]).is_err(), "bad name/symbol accepted: {:?}", (n, sy));
    }
    let m = mint_with(&mut e, |x| Address::find_program_address(&[b"launch", x.as_ref()], &pid).0, false);
    let l3 = accounts_for(&mut e, &founder, m, 1000 * USD);
    let mut k = launch_keys(&e, &founder, &l3);
    k[13] = w(metadata_pda(&l.mint));
    let mut d = vec![1u8];
    d.extend(u64s(&[SUPPLY, 20 * USD, 100 * USD, 10_000, 0]));
    d.extend(names("Pulse Test", "PTST", ""));
    assert!(e.send(k, d, &[&founder]).is_err(), "another mint's metadata account accepted");
}
