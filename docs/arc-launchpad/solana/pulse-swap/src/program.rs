//! PulseSwap on-chain program (SPL Token pools against the chain's dollar),
//! written on pinocchio: no build scripts, no proc macros, a few KB on chain.
//!
//! Same rules as the Move pools: x*y=k, 0.30% to liquidity providers, 0.10%
//! protocol fee on the dollar side of every swap, 5% of which waits in the
//! bucket and can only become FTHM (BuyFthm, anyone may send it), the rest to
//! the platform's dollar account. No owner after Initialize.
//!
//! PDAs (seeds -> data)
//!   ["config"]               Config
//!   ["bucket"]               token account (dollar), authority = config PDA
//!   ["pool", token_mint]     Pool
//!   ["tv", pool]             token vault, authority = pool PDA
//!   ["dv", pool]             dollar vault, authority = pool PDA
//!   ["shares", pool, user]   Shares
//!
//! Instructions (first byte)
//!   0 Initialize   [admin s w, config w, bucket w, dollar_mint, system, token]
//!                  data: platform_dollar_account 32, fthm_mint 32, fthm_sink_account 32
//!   1 OpenPool     [opener s w, config, pool w, token_mint, tv w, dv w,
//!                   opener_token w, opener_dollar w, shares w, system, token, dollar_mint]
//!                  data: token_amount u64, dollar_amount u64
//!   2 AddLiquidity [user s w, config, pool w, tv w, dv w, user_token w, user_dollar w, shares w, system, token]
//!                  data: token_amount u64, dollar_amount u64
//!   3 Remove       [user s, pool w, tv w, dv w, user_token w, user_dollar w, shares w, token]
//!                  data: shares u64
//!   4 Swap         [trader s, config, pool, tv w, dv w, trader_in w, trader_out w, bucket w, platform w, token]
//!                  data: dollars_to_token u8, amount_in u64, min_out u64
//!   5 BuyFthm      [config, bucket w, fthm_pool, fthm_tv w, fthm_dv w, sink w, token]
use crate::math;
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    sysvars::{clock::Clock, rent::Rent, Sysvar},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::CreateAccount;
use pinocchio_token::{
    instructions::{InitializeAccount3, Transfer},

};

/// the deployer key allowed to send Initialize, once
#[cfg(not(feature = "local-test"))]
pub const INITIALIZER: Address = Address::from_str_const("5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh");
/// local-validator builds only (e2e/test-admin.json, never on any network)
#[cfg(feature = "local-test")]
pub const INITIALIZER: Address = Address::from_str_const("21cwJQt3XrXk861zDhUzUvAq6PTzradj9ujhf9A3euZA");
pub const TOKEN_PROGRAM: Address = Address::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const TOKEN_ACCOUNT_LEN: usize = 165;
const CONFIG_LEN: usize = 1 + 32 * 5 + 1;
const POOL_LEN: usize = 1 + 32 * 3 + 8 + 8 + 1;
const SHARES_LEN: usize = 8;

const E_ALREADY_INITIALIZED: u32 = 1;
const E_NOT_INITIALIZER: u32 = 2;
const E_BAD_ACCOUNT: u32 = 3;
const E_BAD_DATA: u32 = 4;
const E_SLIPPAGE: u32 = 5;
const E_NO_SHARES: u32 = 6;
const E_MATH: u32 = 7;

fn err(code: u32) -> ProgramError { ProgramError::Custom(code) }
fn ensure(c: bool, code: u32) -> ProgramResult { if c { Ok(()) } else { Err(err(code)) } }
fn m<T>(r: Result<T, math::MathError>) -> Result<T, ProgramError> {
    r.map_err(|e| match e { math::MathError::NotEnoughShares => err(E_NO_SHARES), _ => err(E_MATH) })
}

fn u64_at(d: &[u8], o: usize) -> Result<u64, ProgramError> {
    let b: [u8; 8] = d.get(o..o + 8).ok_or(err(E_BAD_DATA))?.try_into().map_err(|_| err(E_BAD_DATA))?;
    Ok(u64::from_le_bytes(b))
}
fn addr_at(d: &[u8], o: usize) -> Result<Address, ProgramError> {
    let b: [u8; 32] = d.get(o..o + 32).ok_or(err(E_BAD_DATA))?.try_into().map_err(|_| err(E_BAD_DATA))?;
    Ok(Address::new_from_array(b))
}

/// (mint, amount) of an SPL token account
fn token_account(a: &AccountView) -> Result<(Address, u64), ProgramError> {
    ensure(a.owned_by(&TOKEN_PROGRAM), E_BAD_ACCOUNT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == TOKEN_ACCOUNT_LEN, E_BAD_ACCOUNT)?;
    Ok((addr_at(&d, 0)?, u64_at(&d, 64)?))
}

fn transfer(from: &AccountView, to: &AccountView, auth: &AccountView, amount: u64, signer: Option<&[Seed]>) -> ProgramResult {
    if amount == 0 { return Ok(()); }
    let t = Transfer::<&AccountView>::new(from, to, auth, amount);
    match signer { None => t.invoke(), Some(s) => t.invoke_signed(&[Signer::from(s)]) }
}

fn create_pda(payer: &AccountView, new: &AccountView, space: usize, owner: &Address, seeds: &[Seed]) -> ProgramResult {
    let lamports = Rent::get()?.try_minimum_balance(space)?;
    CreateAccount { from: payer, to: new, lamports, space: space as u64, owner }.invoke_signed(&[Signer::from(seeds)])
}

fn create_token_pda(payer: &AccountView, new: &AccountView, mint: &AccountView, authority: &Address, seeds: &[Seed]) -> ProgramResult {
    create_pda(payer, new, TOKEN_ACCOUNT_LEN, &TOKEN_PROGRAM, seeds)?;
    InitializeAccount3::new(new, mint, authority).invoke()
}

fn pda(seeds: &[&[u8]], program_id: &Address) -> (Address, u8) { Address::find_program_address(seeds, program_id) }

/* ---- state ----------------------------------------------------------- */

struct Config { dollar_mint: Address, platform: Address, fthm_mint: Address, fthm_sink: Address, bucket: Address, bump: u8 }

fn read_config(program_id: &Address, a: &AccountView) -> Result<Config, ProgramError> {
    let (p, _) = pda(&[b"config"], program_id);
    ensure(*a.address() == p && a.owned_by(program_id), E_BAD_ACCOUNT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == CONFIG_LEN && d[0] == 1, E_BAD_ACCOUNT)?;
    Ok(Config { dollar_mint: addr_at(&d, 1)?, platform: addr_at(&d, 33)?, fthm_mint: addr_at(&d, 65)?, fthm_sink: addr_at(&d, 97)?, bucket: addr_at(&d, 129)?, bump: d[161] })
}

#[allow(dead_code)] // created_at: read by the launchpad adapter (seasoned-pool rule), next step
struct Pool { token_mint: Address, tv: Address, dv: Address, total_shares: u64, created_at: i64, bump: u8 }

fn read_pool(program_id: &Address, a: &AccountView) -> Result<Pool, ProgramError> {
    ensure(a.owned_by(program_id), E_BAD_ACCOUNT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == POOL_LEN && d[0] == 2, E_BAD_ACCOUNT)?;
    let p = Pool { token_mint: addr_at(&d, 1)?, tv: addr_at(&d, 33)?, dv: addr_at(&d, 65)?, total_shares: u64_at(&d, 97)?, created_at: u64_at(&d, 105)? as i64, bump: d[113] };
    let (x, _) = pda(&[b"pool", p.token_mint.as_ref()], program_id);
    ensure(*a.address() == x, E_BAD_ACCOUNT)?;
    Ok(p)
}

fn read_shares(program_id: &Address, a: &AccountView) -> Result<u64, ProgramError> {
    if a.data_len() == 0 { return Ok(0); }
    ensure(a.owned_by(program_id) && a.data_len() == SHARES_LEN, E_BAD_ACCOUNT)?;
    u64_at(&a.try_borrow()?, 0)
}

fn write(a: &mut AccountView, at: usize, bytes: &[u8]) -> ProgramResult {
    a.try_borrow_mut()?[at..at + bytes.len()].copy_from_slice(bytes);
    Ok(())
}

/* ---- instructions ---------------------------------------------------- */

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let (tag, rest) = data.split_first().ok_or(err(E_BAD_DATA))?;
    match tag {
        0 => initialize(program_id, accounts, rest),
        1 => open_pool(program_id, accounts, rest),
        2 => add_liquidity(program_id, accounts, rest),
        3 => remove_liquidity(program_id, accounts, rest),
        4 => swap(program_id, accounts, rest),
        5 => buy_fthm(program_id, accounts),
        _ => Err(err(E_BAD_DATA)),
    }
}

fn initialize(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [admin, mut config, bucket, dollar_mint, _system, token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(admin.is_signer() && *admin.address() == INITIALIZER, E_NOT_INITIALIZER)?;
    ensure(config.data_len() == 0, E_ALREADY_INITIALIZED)?;
    ensure(*token.address() == TOKEN_PROGRAM && dollar_mint.owned_by(&TOKEN_PROGRAM), E_BAD_ACCOUNT)?;
    let (cp, cb) = pda(&[b"config"], program_id);
    let (bp, bb) = pda(&[b"bucket"], program_id);
    ensure(*config.address() == cp && *bucket.address() == bp, E_BAD_ACCOUNT)?;
    let platform = addr_at(data, 0)?; let fthm_mint = addr_at(data, 32)?; let fthm_sink = addr_at(data, 64)?;
    let cbs = [cb];
    create_pda(&admin, &config, CONFIG_LEN, program_id, &[Seed::from(b"config"), Seed::from(&cbs)])?;
    let bbs = [bb];
    create_token_pda(&admin, &bucket, &dollar_mint, &cp, &[Seed::from(b"bucket"), Seed::from(&bbs)])?;
    let mut d = [0u8; CONFIG_LEN];
    d[0] = 1;
    d[1..33].copy_from_slice(dollar_mint.address().as_ref());
    d[33..65].copy_from_slice(platform.as_ref());
    d[65..97].copy_from_slice(fthm_mint.as_ref());
    d[97..129].copy_from_slice(fthm_sink.as_ref());
    d[129..161].copy_from_slice(bp.as_ref());
    d[161] = cb;
    write(&mut config, 0, &d)
}

fn open_pool(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [opener, config, mut pool, token_mint, tv, dv, op_t, op_d, mut shares, _system, token, dollar_mint, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let cfg = read_config(program_id, &config)?;
    ensure(opener.is_signer() && *token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    ensure(*token_mint.address() != cfg.dollar_mint && token_mint.owned_by(&TOKEN_PROGRAM), E_BAD_ACCOUNT)?;
    ensure(*dollar_mint.address() == cfg.dollar_mint, E_BAD_ACCOUNT)?;
    ensure(pool.data_len() == 0, E_ALREADY_INITIALIZED)?;
    let t_amt = u64_at(data, 0)?; let d_amt = u64_at(data, 8)?;
    let (pp, pb) = pda(&[b"pool", token_mint.address().as_ref()], program_id);
    let (tvp, tvb) = pda(&[b"tv", pp.as_ref()], program_id);
    let (dvp, dvb) = pda(&[b"dv", pp.as_ref()], program_id);
    let (sp, sb) = pda(&[b"shares", pp.as_ref(), opener.address().as_ref()], program_id);
    ensure(*pool.address() == pp && *tv.address() == tvp && *dv.address() == dvp && *shares.address() == sp, E_BAD_ACCOUNT)?;
    let (mine, total) = m(math::first_shares(t_amt, d_amt))?;
    ensure(token_account(&op_d)?.0 == cfg.dollar_mint && token_account(&op_t)?.0 == *token_mint.address(), E_BAD_ACCOUNT)?;

    let (pbs, tvbs, dvbs, sbs) = ([pb], [tvb], [dvb], [sb]);
    create_pda(&opener, &pool, POOL_LEN, program_id, &[Seed::from(b"pool"), Seed::from(token_mint.address().as_ref()), Seed::from(&pbs)])?;
    create_token_pda(&opener, &tv, &token_mint, &pp, &[Seed::from(b"tv"), Seed::from(pp.as_ref()), Seed::from(&tvbs)])?;
    create_token_pda(&opener, &dv, &dollar_mint, &pp, &[Seed::from(b"dv"), Seed::from(pp.as_ref()), Seed::from(&dvbs)])?;
    transfer(&op_t, &tv, &opener, t_amt, None)?;
    transfer(&op_d, &dv, &opener, d_amt, None)?;

    let now = Clock::get()?.unix_timestamp;
    let mut d = [0u8; POOL_LEN];
    d[0] = 2;
    d[1..33].copy_from_slice(token_mint.address().as_ref());
    d[33..65].copy_from_slice(tvp.as_ref());
    d[65..97].copy_from_slice(dvp.as_ref());
    d[97..105].copy_from_slice(&total.to_le_bytes());
    d[105..113].copy_from_slice(&(now as u64).to_le_bytes());
    d[113] = pb;
    write(&mut pool, 0, &d)?;
    create_pda(&opener, &shares, SHARES_LEN, program_id, &[Seed::from(b"shares"), Seed::from(pp.as_ref()), Seed::from(opener.address().as_ref()), Seed::from(&sbs)])?;
    write(&mut shares, 0, &mine.to_le_bytes())
}

fn add_liquidity(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [user, _config, mut pool, tv, dv, u_t, u_d, mut shares, _system, token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(user.is_signer() && *token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    let p = read_pool(program_id, &pool)?;
    ensure(*tv.address() == p.tv && *dv.address() == p.dv, E_BAD_ACCOUNT)?;
    let (sp, sb) = pda(&[b"shares", pool.address().as_ref(), user.address().as_ref()], program_id);
    ensure(*shares.address() == sp, E_BAD_ACCOUNT)?;
    let t_amt = u64_at(data, 0)?; let d_amt = u64_at(data, 8)?;
    let minted = m(math::added_shares(t_amt, d_amt, token_account(&tv)?.1, token_account(&dv)?.1, p.total_shares))?;
    transfer(&u_t, &tv, &user, t_amt, None)?;
    transfer(&u_d, &dv, &user, d_amt, None)?;
    let held = read_shares(program_id, &shares)?;
    if shares.data_len() == 0 {
        let sbs = [sb];
        create_pda(&user, &shares, SHARES_LEN, program_id, &[Seed::from(b"shares"), Seed::from(pool.address().as_ref()), Seed::from(user.address().as_ref()), Seed::from(&sbs)])?;
    }
    write(&mut shares, 0, &(held + minted).to_le_bytes())?;
    write(&mut pool, 97, &(p.total_shares + minted).to_le_bytes())
}

fn remove_liquidity(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [user, mut pool, tv, dv, u_t, u_d, mut shares, token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(user.is_signer() && *token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    let p = read_pool(program_id, &pool)?;
    ensure(*tv.address() == p.tv && *dv.address() == p.dv, E_BAD_ACCOUNT)?;
    let (sp, _) = pda(&[b"shares", pool.address().as_ref(), user.address().as_ref()], program_id);
    ensure(*shares.address() == sp, E_BAD_ACCOUNT)?;
    let n = u64_at(data, 0)?;
    let held = read_shares(program_id, &shares)?;
    let (t_out, d_out) = m(math::removed(n, held, token_account(&tv)?.1, token_account(&dv)?.1, p.total_shares))?;
    write(&mut shares, 0, &(held - n).to_le_bytes())?;
    write(&mut pool, 97, &(p.total_shares - n).to_le_bytes())?;
    let pbs = [p.bump];
    let seeds = [Seed::from(b"pool"), Seed::from(p.token_mint.as_ref()), Seed::from(&pbs)];
    transfer(&tv, &u_t, &pool, t_out, Some(&seeds))?;
    transfer(&dv, &u_d, &pool, d_out, Some(&seeds))
}

fn swap(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [trader, config, pool, tv, dv, t_in, t_out, bucket, platform, token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(trader.is_signer() && *token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let p = read_pool(program_id, &pool)?;
    ensure(*tv.address() == p.tv && *dv.address() == p.dv && *bucket.address() == cfg.bucket && *platform.address() == cfg.platform, E_BAD_ACCOUNT)?;
    let dollars_to_token = *data.first().ok_or(err(E_BAD_DATA))? == 1;
    let amount_in = u64_at(data, 1)?; let min_out = u64_at(data, 9)?;
    let (rt, rd) = (token_account(&tv)?.1, token_account(&dv)?.1);
    let pbs = [p.bump];
    let seeds = [Seed::from(b"pool"), Seed::from(p.token_mint.as_ref()), Seed::from(&pbs)];
    if dollars_to_token {
        let (fthm, plat) = math::protocol_fee(amount_in);
        let net = amount_in - fthm - plat;
        let out = m(math::quote(rd, rt, net))?;
        ensure(out >= min_out, E_SLIPPAGE)?;
        transfer(&t_in, &bucket, &trader, fthm, None)?;
        transfer(&t_in, &platform, &trader, plat, None)?;
        transfer(&t_in, &dv, &trader, net, None)?;
        transfer(&tv, &t_out, &pool, out, Some(&seeds))
    } else {
        let gross = m(math::quote(rt, rd, amount_in))?;
        let (fthm, plat) = math::protocol_fee(gross);
        let net = gross - fthm - plat;
        ensure(net >= min_out && net > 0, E_SLIPPAGE)?;
        transfer(&t_in, &tv, &trader, amount_in, None)?;
        transfer(&dv, &bucket, &pool, fthm, Some(&seeds))?;
        transfer(&dv, &platform, &pool, plat, Some(&seeds))?;
        transfer(&dv, &t_out, &pool, net, Some(&seeds))
    }
}

/// The bucket's dollars become FTHM at the sink; anyone may send this. No
/// protocol fee on it: it is the protocol's own money.
fn buy_fthm(program_id: &Address, accounts: &mut [AccountView]) -> ProgramResult {
    let [config, bucket, pool, tv, dv, sink, token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(*token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let p = read_pool(program_id, &pool)?;
    ensure(p.token_mint == cfg.fthm_mint && *tv.address() == p.tv && *dv.address() == p.dv, E_BAD_ACCOUNT)?;
    ensure(*bucket.address() == cfg.bucket && *sink.address() == cfg.fthm_sink, E_BAD_ACCOUNT)?;
    let amount = token_account(&bucket)?.1;
    ensure(amount > 0, E_MATH)?;
    let out = m(math::quote(token_account(&dv)?.1, token_account(&tv)?.1, amount))?;
    let cbs = [cfg.bump];
    transfer(&bucket, &dv, &config, amount, Some(&[Seed::from(b"config"), Seed::from(&cbs)]))?;
    let pbs = [p.bump];
    transfer(&tv, &sink, &pool, out, Some(&[Seed::from(b"pool"), Seed::from(p.token_mint.as_ref()), Seed::from(&pbs)]))
}
