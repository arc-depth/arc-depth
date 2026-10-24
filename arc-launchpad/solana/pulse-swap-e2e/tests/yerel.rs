//! PulseSwap end to end inside LiteSVM: the program built by cargo-build-sbf
//! (`--features local-test`), the real SPL Token program LiteSVM ships, every
//! number read back from the accounts. No validator, no network, no SOL.
//!
//!   cd solana/pulse-swap && cargo-build-sbf --features local-test
//!   cd solana/pulse-swap-e2e && cargo test

use litesvm::LiteSVM;
use litesvm_token::{get_spl_account, spl_token::state::Account as TokenAccount, CreateAccount, CreateMint, MintTo};
use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const USD: u64 = 1_000_000;
const SYSTEM: Address = Address::from_str_const("11111111111111111111111111111111");
const TOKEN: Address = Address::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

fn quote(rin: u64, rout: u64, a: u64) -> u64 {
    let after = a as u128 * 997_000 / 1_000_000;
    (rout as u128 * after / (rin as u128 + after)) as u64
}

struct Env {
    svm: LiteSVM,
    pid: Address,
    admin: Keypair,
    usdc: Address,
}

impl Env {
    fn pda(&self, seeds: &[&[u8]]) -> Address { Address::find_program_address(seeds, &self.pid).0 }
    fn bal(&self, a: &Address) -> u64 { get_spl_account::<TokenAccount>(&self.svm, a).unwrap().amount }
    fn send(&mut self, keys: Vec<AccountMeta>, data: Vec<u8>, signers: &[&Keypair]) -> Result<(), String> {
        self.svm.expire_blockhash();
        let ix = Instruction { program_id: self.pid, accounts: keys, data };
        let tx = Transaction::new_signed_with_payer(&[ix], Some(&signers[0].pubkey()), signers, self.svm.latest_blockhash());
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
    }
    fn mint(&mut self) -> Address { CreateMint::new(&mut self.svm, &self.admin).decimals(6).send().unwrap() }
    fn account(&mut self, mint: &Address, owner: &Address, amount: u64) -> Address {
        let a = CreateAccount::new(&mut self.svm, &self.admin, mint).owner(owner).send().unwrap();
        if amount > 0 { MintTo::new(&mut self.svm, &self.admin, mint, &a, amount).send().unwrap(); }
        a
    }
    fn user(&mut self) -> Keypair { let k = Keypair::new(); self.svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap(); k }
}

fn w(a: Address) -> AccountMeta { AccountMeta::new(a, false) }
fn r(a: Address) -> AccountMeta { AccountMeta::new_readonly(a, false) }
fn s(a: Address) -> AccountMeta { AccountMeta::new(a, true) }
fn u64s(v: &[u64]) -> Vec<u8> { v.iter().flat_map(|x| x.to_le_bytes()).collect() }

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let pid = Keypair::new().pubkey();
    svm.add_program_from_file(pid, concat!(env!("CARGO_MANIFEST_DIR"), "/../pulse-swap/target/deploy/pulse_swap.so")).unwrap();
    let bytes: Vec<u8> = serde_bytes(include_str!("../../pulse-swap/e2e/test-admin.json"));
    let admin = Keypair::try_from(&bytes[..]).unwrap();
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();
    let mut e = Env { svm, pid, admin, usdc: Address::default() };
    e.usdc = e.mint();
    e
}

/// the keypair file is a JSON array of 64 numbers
fn serde_bytes(json: &str) -> Vec<u8> {
    json.trim().trim_start_matches('[').trim_end_matches(']').split(',').map(|x| x.trim().parse::<u8>().unwrap()).collect()
}

struct Ctx { config: Address, bucket: Address, platform: Address, sink: Address, fthm: Address }

fn init(e: &mut Env) -> Ctx {
    let fthm = e.mint();
    let platform_owner = Keypair::new().pubkey(); let sink_owner = Keypair::new().pubkey();
    let platform = e.account(&e.usdc.clone(), &platform_owner, 0);
    let sink = e.account(&fthm, &sink_owner, 0);
    let config = e.pda(&[b"config"]); let bucket = e.pda(&[b"bucket"]);
    let mut data = vec![0u8]; data.extend_from_slice(platform.as_ref()); data.extend_from_slice(fthm.as_ref()); data.extend_from_slice(sink.as_ref());
    let admin = e.admin.insecure_clone();
    let keys = vec![s(admin.pubkey()), w(config), w(bucket), r(e.usdc), r(SYSTEM), r(TOKEN)];
    e.send(keys, data, &[&admin]).unwrap();
    Ctx { config, bucket, platform, sink, fthm }
}

struct Pool { p: Address, tv: Address, dv: Address }

fn open(e: &mut Env, c: &Ctx, lp: &Keypair, mint: Address, t: u64, d: u64) -> (Pool, Address, Address) {
    let lt = e.account(&mint, &lp.pubkey(), 10 * t);
    let ld = e.account(&e.usdc.clone(), &lp.pubkey(), 10 * d);
    let p = e.pda(&[b"pool", mint.as_ref()]);
    let pool = Pool { p, tv: e.pda(&[b"tv", p.as_ref()]), dv: e.pda(&[b"dv", p.as_ref()]) };
    let shares = e.pda(&[b"shares", p.as_ref(), lp.pubkey().as_ref()]);
    let keys = vec![s(lp.pubkey()), r(c.config), w(pool.p), r(mint), w(pool.tv), w(pool.dv), w(lt), w(ld), w(shares), r(SYSTEM), r(TOKEN), r(e.usdc)];
    let mut data = vec![1u8]; data.extend(u64s(&[t, d]));
    e.send(keys, data, &[lp]).unwrap();
    (pool, lt, ld)
}

fn swap_keys(c: &Ctx, who: &Keypair, p: &Pool, tin: Address, tout: Address) -> Vec<AccountMeta> {
    vec![AccountMeta::new_readonly(who.pubkey(), true), r(c.config), r(p.p), w(p.tv), w(p.dv), w(tin), w(tout), w(c.bucket), w(c.platform), r(TOKEN)]
}
fn swap_data(buy: bool, amount: u64, min: u64) -> Vec<u8> { let mut d = vec![4u8, buy as u8]; d.extend(u64s(&[amount, min])); d }

#[test]
fn initialize_once_and_only_by_the_initializer() {
    let mut e = setup();
    let stranger = e.user();
    let (config, bucket) = (e.pda(&[b"config"]), e.pda(&[b"bucket"]));
    let mut data = vec![0u8]; data.extend([0u8; 96]);
    let keys = vec![s(stranger.pubkey()), w(config), w(bucket), r(e.usdc), r(SYSTEM), r(TOKEN)];
    assert!(e.send(keys, data, &[&stranger]).is_err(), "a stranger initialized");
    let c = init(&mut e);
    assert_eq!(e.bal(&c.bucket), 0);
    let mut data = vec![0u8]; data.extend([0u8; 96]);
    let admin = e.admin.insecure_clone();
    let keys = vec![s(admin.pubkey()), w(c.config), w(c.bucket), r(e.usdc), r(SYSTEM), r(TOKEN)];
    assert!(e.send(keys, data, &[&admin]).is_err(), "initialized twice");
}

#[test]
fn a_swap_pays_x_times_y_and_the_fee_splits_five_percent_to_fthm() {
    let mut e = setup();
    let c = init(&mut e);
    let lp = e.user();
    let tok = e.mint();
    let (p, _, _) = open(&mut e, &c, &lp, tok, 1000 * USD, 1000 * USD);
    assert_eq!(e.bal(&p.tv), 1000 * USD);
    let user = e.user();
    let uu = e.account(&e.usdc.clone(), &user.pubkey(), 1000 * USD);
    let ut = e.account(&tok, &user.pubkey(), 0);
    e.send(swap_keys(&c, &user, &p, uu, ut), swap_data(true, 100 * USD, 0), &[&user]).unwrap();
    assert_eq!(e.bal(&ut), quote(1000 * USD, 1000 * USD, 100 * USD - 100_000), "out == x*y quote");
    assert_eq!(e.bal(&c.bucket), 5_000, "5% of the 0.10 fee");
    assert_eq!(e.bal(&c.platform), 95_000, "95% of the fee");
    // slippage limit
    assert!(e.send(swap_keys(&c, &user, &p, uu, ut), swap_data(true, USD, 10 * USD), &[&user]).is_err());
    // sell back: fee on the dollars out
    let got = e.bal(&ut);
    let u0 = e.bal(&uu);
    e.send(swap_keys(&c, &user, &p, ut, uu), swap_data(false, got, 0), &[&user]).unwrap();
    let back = e.bal(&uu) - u0;
    assert!(back < 100 * USD && back > 99 * USD, "back {}", back);
    assert!(e.bal(&c.bucket) > 5_000);
}

#[test]
fn the_bucket_only_becomes_fthm_at_the_sink() {
    let mut e = setup();
    let c = init(&mut e);
    let lp = e.user();
    let tok = e.mint();
    let (p, _, _) = open(&mut e, &c, &lp, tok, 1000 * USD, 1000 * USD);
    let (fp, _, _) = open(&mut e, &c, &lp, c.fthm, 100_000 * USD, 1000 * USD);
    let user = e.user();
    let uu = e.account(&e.usdc.clone(), &user.pubkey(), 1000 * USD);
    let ut = e.account(&tok, &user.pubkey(), 0);
    e.send(swap_keys(&c, &user, &p, uu, ut), swap_data(true, 500 * USD, 0), &[&user]).unwrap();
    let bucket = e.bal(&c.bucket);
    let stranger = e.user();
    let wrong = e.account(&c.fthm.clone(), &stranger.pubkey(), 0);
    let fk = |sink: Address| vec![r(c.config), w(c.bucket), r(fp.p), w(fp.tv), w(fp.dv), w(sink), r(TOKEN), AccountMeta::new(stranger.pubkey(), true)];
    assert!(e.send(fk(wrong), vec![5u8], &[&stranger]).is_err(), "bucket paid a wrong sink");
    e.send(fk(c.sink), vec![5u8], &[&stranger]).unwrap();
    assert_eq!(e.bal(&c.sink), quote(1000 * USD, 100_000 * USD, bucket));
    assert_eq!(e.bal(&c.bucket), 0);
}

#[test]
fn liquidity_in_and_out_and_never_more_than_held() {
    let mut e = setup();
    let c = init(&mut e);
    let lp = e.user();
    let tok = e.mint();
    let (p, lt, ld) = open(&mut e, &c, &lp, tok, 1000 * USD, 1000 * USD);
    let shares = e.pda(&[b"shares", p.p.as_ref(), lp.pubkey().as_ref()]);
    let held = |e: &Env| u64::from_le_bytes(e.svm.get_account(&shares).unwrap().data[..8].try_into().unwrap());
    assert_eq!(held(&e), 1000 * USD - 1000, "sqrt(t*d) minus the locked dust");
    let mut d = vec![2u8]; d.extend(u64s(&[100 * USD, 100 * USD]));
    e.send(vec![s(lp.pubkey()), r(c.config), w(p.p), w(p.tv), w(p.dv), w(lt), w(ld), w(shares), r(SYSTEM), r(TOKEN)], d, &[&lp]).unwrap();
    let all = held(&e);
    assert_eq!(all, 1100 * USD - 1000);
    let rm = |n: u64| { let mut d = vec![3u8]; d.extend(u64s(&[n])); d };
    let keys = vec![AccountMeta::new_readonly(lp.pubkey(), true), w(p.p), w(p.tv), w(p.dv), w(lt), w(ld), w(shares), r(TOKEN)];
    assert!(e.send(keys.clone(), rm(all + 1), &[&lp]).is_err(), "removed more than held");
    e.send(keys, rm(all), &[&lp]).unwrap();
    assert_eq!(held(&e), 0);
    assert_eq!(e.bal(&p.tv), 1000, "only the locked dust stays");
    assert_eq!(e.bal(&p.dv), 1000);
}

#[test]
fn a_pool_address_that_already_holds_lamports_still_opens() {
    // anyone can send SOL to a deterministic PDA before it exists; creation must still work
    let mut e = setup();
    let c = init(&mut e);
    let lp = e.user();
    let tok = e.mint();
    let p = e.pda(&[b"pool", tok.as_ref()]);
    e.svm.airdrop(&p, 890_880).unwrap();
    let (pool, _, _) = open(&mut e, &c, &lp, tok, 1000 * USD, 1000 * USD);
    assert_eq!(e.bal(&pool.tv), 1000 * USD);
    assert!(e.svm.get_account(&pool.p).unwrap().owner == e.pid, "the pool account belongs to the program");
}
