//! The launchpad program on pinocchio, the Solana counterpart of
//! aptos/pulse-launchpad and sui/pulse-launchpad.
//!
//! THE VAULT RULE: collateral leaves only by burning tokens, in proportion to
//! the circulating supply (mint supply minus the pool's tokens).
//! THE POOL: the whole supply is minted into the pool and the mint authority
//! is removed in the same instruction; x*y=k against real dollars plus a
//! virtual reserve of 3,500 dollars that is never paid out; no withdraw path.
//! FEES: see math.rs. No owner after Initialize.
//!
//! The client creates the token mint in the same transaction, before Launch,
//! with mint authority = the launch PDA and no freeze authority; Launch
//! refuses any mint that has supply, another authority or a freeze authority.
//!
//! PASTE A TOKEN AS COLLATERAL (LaunchBacked): the founder's collateral
//! dollars are swapped, in the same instruction, into a token K through
//! PulseSwap, the one swap program fixed at Initialize. The vault then holds
//! K (beside the tax dollars) and Redeem pays both, by circulating supply.
//! The swap vouches for its dollars only in a PulseSwap pool that is a day
//! old and holds ten times the dollars swapped, and only the K the swap
//! actually delivered into the vault counts.
//!
//! PDAs (seeds -> data)
//!   ["config"]          Config
//!   ["launch", mint]    Launch; authority of the token accounts below
//!   ["pt", launch]      pool tokens
//!   ["pd", launch]      pool dollars (real; the virtual reserve is a number)
//!   ["vault", launch]   collateral vault (dollars)
//!   ["kv", launch]      pasted-token vault (LaunchBacked only)
//!
//! Instructions (first byte)
//!   0 Initialize [admin s w, config w, dollar_mint, platform, system]
//!                data: swap_program 32
//!   1 Launch     [founder s w, config, mint w, launch w, pt w, pd w, vault w,
//!                 founder_dollar w, founder_token w, platform w, system, token, dollar_mint,
//!                 metadata w, token_metadata_program]
//!                data: supply, collateral, first_buy, tax_ppm, min_tokens (u64 each),
//!                then name, symbol, uri (each u8 length + UTF-8 bytes; Metaplex,
//!                immutable, no royalty)
//!   6 LaunchBacked  the 15 Launch accounts, then
//!                [k_mint, kv w, swap_program, swap_config, swap_pool, swap_tv w,
//!                 swap_dv w, swap_bucket w, swap_platform w]
//!                data: the five Launch u64s (collateral = dollars to swap), min_k u64,
//!                then name, symbol, uri as Launch
//!   2 Buy        [buyer s, config, launch, pt w, pd w, vault w, buyer_dollar w,
//!                 buyer_token w, founder_dollar w, platform w, token]
//!                data: dollars_in u64, min_tokens u64
//!   3 Sell       [seller s, config, mint, launch w, pt w, pd w, vault w, seller_token w,
//!                 seller_dollar w, founder_dollar w, platform w, token]
//!                data: tokens_in u64, min_dollars u64
//!   4 Redeem     [holder s, mint w, launch, pt, vault w, holder_token w, holder_dollar w, token]
//!                a backed launch adds [kv w, holder_k w]
//!                data: amount u64
//!   5 Fund       [from s, launch, vault w, from_dollar w, token]
//!                data: amount u64
use crate::math;
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    instruction::{InstructionAccount, InstructionView},
    sysvars::{clock::Clock, rent::Rent, Sysvar},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::CreateAccount;
use pinocchio_token::instructions::{AuthorityType, Burn, InitializeAccount3, MintTo, SetAuthority, Transfer};

/// the deployer key allowed to send Initialize, once
#[cfg(not(feature = "local-test"))]
pub const INITIALIZER: Address = Address::from_str_const("5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh");
/// local tests only (pulse-swap/e2e/test-admin.json, never on any network)
#[cfg(feature = "local-test")]
pub const INITIALIZER: Address = Address::from_str_const("21cwJQt3XrXk861zDhUzUvAq6PTzradj9ujhf9A3euZA");
pub const TOKEN_PROGRAM: Address = Address::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_METADATA_PROGRAM: Address = Address::from_str_const("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const TOKEN_ACCOUNT_LEN: usize = 165;
const MINT_LEN: usize = 82;
const CONFIG_LEN: usize = 1 + 32 * 3 + 8 + 1;
const LAUNCH_LEN: usize = 1 + 32 * 5 + 8 * 5 + 1 + 32;
/// PulseSwap's Pool account: tag 2, token mint, tv, dv, total shares, created_at, bump
const SWAP_POOL_LEN: usize = 1 + 32 * 3 + 8 + 8 + 1;

const E_ALREADY_INITIALIZED: u32 = 1;
const E_NOT_INITIALIZER: u32 = 2;
const E_BAD_ACCOUNT: u32 = 3;
const E_BAD_DATA: u32 = 4;
const E_SLIPPAGE: u32 = 5;
const E_LIMITS: u32 = 6;
const E_BAD_MINT: u32 = 7;
const E_ZERO: u32 = 8;
const E_NOT_CIRCULATING: u32 = 9;
const E_POOL_NOT_SEASONED: u32 = 10;
const E_BACKED: u32 = 11;

fn err(code: u32) -> ProgramError { ProgramError::Custom(code) }
fn ensure(c: bool, code: u32) -> ProgramResult { if c { Ok(()) } else { Err(err(code)) } }

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

struct Mint { authority: Option<Address>, supply: u64, decimals: u8, freeze: bool }

fn mint_info(a: &AccountView) -> Result<Mint, ProgramError> {
    ensure(a.owned_by(&TOKEN_PROGRAM), E_BAD_MINT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == MINT_LEN && d[45] == 1, E_BAD_MINT)?;
    let authority = if d[0] == 1 { Some(addr_at(&d, 4)?) } else { None };
    Ok(Mint { authority, supply: u64_at(&d, 36)?, decimals: d[44], freeze: d[46] == 1 })
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

fn write(a: &mut AccountView, at: usize, bytes: &[u8]) -> ProgramResult {
    a.try_borrow_mut()?[at..at + bytes.len()].copy_from_slice(bytes);
    Ok(())
}

/* ---- state ----------------------------------------------------------- */

struct Config { dollar_mint: Address, platform: Address, swap_program: Address, unit: u64 }

fn read_config(program_id: &Address, a: &AccountView) -> Result<Config, ProgramError> {
    let (p, _) = pda(&[b"config"], program_id);
    ensure(*a.address() == p && a.owned_by(program_id), E_BAD_ACCOUNT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == CONFIG_LEN && d[0] == 1, E_BAD_ACCOUNT)?;
    Ok(Config { dollar_mint: addr_at(&d, 1)?, platform: addr_at(&d, 33)?, swap_program: addr_at(&d, 65)?, unit: u64_at(&d, 97)? })
}

struct Launch {
    mint: Address, founder_dollar: Address, pt: Address, pd: Address, vault: Address,
    tax_ppm: u64, virt: u64, opened_at: i64, shield_slot: u64, shield_ppm: u64, bump: u8,
    /// the pasted-token vault; all zero for a dollar-backed launch
    kv: Address,
}
const NOT_BACKED: Address = Address::new_from_array([0u8; 32]);

fn read_launch(program_id: &Address, a: &AccountView) -> Result<Launch, ProgramError> {
    ensure(a.owned_by(program_id), E_BAD_ACCOUNT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == LAUNCH_LEN && d[0] == 2, E_BAD_ACCOUNT)?;
    let l = Launch {
        mint: addr_at(&d, 1)?, founder_dollar: addr_at(&d, 33)?, pt: addr_at(&d, 65)?, pd: addr_at(&d, 97)?, vault: addr_at(&d, 129)?,
        tax_ppm: u64_at(&d, 161)?, virt: u64_at(&d, 169)?, opened_at: u64_at(&d, 177)? as i64,
        shield_slot: u64_at(&d, 185)?, shield_ppm: u64_at(&d, 193)?, bump: d[201], kv: addr_at(&d, 202)?,
    };
    // the account is the PDA of its own mint, so no launch can stand in for another
    let x = Address::create_program_address(&[b"launch", l.mint.as_ref(), &[l.bump]], program_id).map_err(|_| err(E_BAD_ACCOUNT))?;
    ensure(*a.address() == x, E_BAD_ACCOUNT)?;
    Ok(l)
}

/* ---- instructions ---------------------------------------------------- */

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let (tag, rest) = data.split_first().ok_or(err(E_BAD_DATA))?;
    match tag {
        0 => initialize(program_id, accounts, rest),
        1 => launch(program_id, accounts, rest, false),
        6 => launch(program_id, accounts, rest, true),
        2 => buy(program_id, accounts, rest),
        3 => sell(program_id, accounts, rest),
        4 => redeem(program_id, accounts, rest),
        5 => fund(program_id, accounts, rest),
        _ => Err(err(E_BAD_DATA)),
    }
}

/// Fixes the chain's dollar, the platform's dollar account and the one swap
/// program allowed to turn collateral dollars into a pasted token. Once, by
/// the initializer key; nothing is configurable afterwards.
fn initialize(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [admin, mut config, dollar_mint, platform, _system, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(admin.is_signer() && *admin.address() == INITIALIZER, E_NOT_INITIALIZER)?;
    ensure(config.data_len() == 0, E_ALREADY_INITIALIZED)?;
    let dm = mint_info(&dollar_mint)?;
    ensure(token_account(&platform)?.0 == *dollar_mint.address(), E_BAD_ACCOUNT)?;
    let (cp, cb) = pda(&[b"config"], program_id);
    ensure(*config.address() == cp, E_BAD_ACCOUNT)?;
    let cbs = [cb];
    create_pda(&admin, &config, CONFIG_LEN, program_id, &[Seed::from(b"config"), Seed::from(&cbs)])?;
    let mut d = [0u8; CONFIG_LEN];
    d[0] = 1;
    d[1..33].copy_from_slice(dollar_mint.address().as_ref());
    d[33..65].copy_from_slice(platform.address().as_ref());
    d[65..97].copy_from_slice(addr_at(data, 0)?.as_ref());
    d[97..105].copy_from_slice(&10u64.pow(dm.decimals as u32).to_le_bytes());
    d[105] = cb;
    write(&mut config, 0, &d)
}

/// Mint the whole supply into the pool, drop the mint authority, lock the
/// collateral (dollars, or the pasted token bought with them), and make the
/// founder's opening buy (launch fee only: no trade fee, tax or snipe on it,
/// as on EVM).
fn launch(program_id: &Address, accounts: &mut [AccountView], data: &[u8], backed: bool) -> ProgramResult {
    let [founder, config, mint, mut launch, pt, pd, vault, f_d, f_t, platform, system, token, dollar_mint, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(founder.is_signer() && *token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let supply = u64_at(data, 0)?; let collateral = u64_at(data, 8)?; let first_buy = u64_at(data, 16)?;
    let tax_ppm = u64_at(data, 24)?; let min_tokens = u64_at(data, 32)?;
    ensure(supply > 0 && math::launch_ok(cfg.unit, collateral, first_buy, tax_ppm), E_LIMITS)?;
    let _ = system;

    let (lp, lb) = pda(&[b"launch", mint.address().as_ref()], program_id);
    let (ptp, ptb) = pda(&[b"pt", lp.as_ref()], program_id);
    let (pdp, pdb) = pda(&[b"pd", lp.as_ref()], program_id);
    let (vp, vb) = pda(&[b"vault", lp.as_ref()], program_id);
    ensure(*launch.address() == lp && *pt.address() == ptp && *pd.address() == pdp && *vault.address() == vp, E_BAD_ACCOUNT)?;
    ensure(launch.data_len() == 0, E_ALREADY_INITIALIZED)?;
    // a fresh mint only this launch can mint, that nobody can freeze
    let mi = mint_info(&mint)?;
    ensure(mi.supply == 0 && mi.authority == Some(lp) && !mi.freeze && *mint.address() != cfg.dollar_mint, E_BAD_MINT)?;
    ensure(token_account(&f_d)?.0 == cfg.dollar_mint && token_account(&f_t)?.0 == *mint.address(), E_BAD_ACCOUNT)?;
    ensure(*platform.address() == cfg.platform && *dollar_mint.address() == cfg.dollar_mint, E_BAD_ACCOUNT)?;

    let (lbs, ptbs, pdbs, vbs) = ([lb], [ptb], [pdb], [vb]);
    let lseeds = [Seed::from(b"launch"), Seed::from(mint.address().as_ref()), Seed::from(&lbs)];
    create_pda(&founder, &launch, LAUNCH_LEN, program_id, &lseeds)?;
    create_token_pda(&founder, &pt, &mint, &lp, &[Seed::from(b"pt"), Seed::from(lp.as_ref()), Seed::from(&ptbs)])?;
    create_token_pda(&founder, &pd, &dollar_mint, &lp, &[Seed::from(b"pd"), Seed::from(lp.as_ref()), Seed::from(&pdbs)])?;
    create_token_pda(&founder, &vault, &dollar_mint, &lp, &[Seed::from(b"vault"), Seed::from(lp.as_ref()), Seed::from(&vbs)])?;

    MintTo::<&AccountView>::new(&mint, &pt, &launch, supply).invoke_signed(&[Signer::from(&lseeds)])?;
    // name, symbol and URI, written while the launch still holds the mint
    // authority, and immutable from the start
    let fixed = if backed { 48 } else { 40 };
    metadata(accounts, &launch, &lseeds, data.get(fixed..).ok_or(err(E_BAD_DATA))?)?;
    // supply is final: nobody, this program included, can mint again
    SetAuthority::<&AccountView>::new(&mint, &launch, AuthorityType::MintTokens, None).invoke_signed(&[Signer::from(&lseeds)])?;

    let kv_addr = if backed {
        paste_collateral(program_id, accounts, &cfg, &lp, &lseeds, collateral, u64_at(data, 40)?)?
    } else {
        transfer(&f_d, &vault, &founder, collateral, None)?;
        NOT_BACKED
    };
    let fee = math::mul_ppm(first_buy, math::LAUNCH_FEE_PPM);
    transfer(&f_d, &platform, &founder, fee, None)?;
    let virt = math::OPENING_MCAP_DOLLARS * cfg.unit;
    let x = first_buy - fee;
    let out = math::buy_out(supply, virt, x);
    ensure(out >= min_tokens && out > 0, E_SLIPPAGE)?;
    transfer(&f_d, &pd, &founder, x, None)?;
    transfer(&pt, &f_t, &launch, out, Some(&lseeds))?;

    let now = Clock::get()?.unix_timestamp;
    let mut d = [0u8; LAUNCH_LEN];
    d[0] = 2;
    d[1..33].copy_from_slice(mint.address().as_ref());
    d[33..65].copy_from_slice(f_d.address().as_ref());
    d[65..97].copy_from_slice(ptp.as_ref());
    d[97..129].copy_from_slice(pdp.as_ref());
    d[129..161].copy_from_slice(vp.as_ref());
    d[161..169].copy_from_slice(&tax_ppm.to_le_bytes());
    d[169..177].copy_from_slice(&virt.to_le_bytes());
    d[177..185].copy_from_slice(&(now as u64).to_le_bytes());
    d[201] = lb;
    d[202..234].copy_from_slice(kv_addr.as_ref());
    write(&mut launch, 0, &d)
}

/// Metaplex CreateMetadataAccountV3 for the new mint: the launch PDA signs as
/// mint and update authority, is_mutable = false, no creators, no royalty.
/// `rest` = name_len u8, name, symbol_len u8, symbol, uri_len u8, uri.
fn metadata(accounts: &[AccountView], launch: &AccountView, lseeds: &[Seed], rest: &[u8]) -> ProgramResult {
    let [founder, _config, mint, _launch, _pt, _pd, _vault, _f_d, _f_t, _platform, system, _token, _dollar_mint, md, mpl, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(*mpl.address() == TOKEN_METADATA_PROGRAM, E_BAD_ACCOUNT)?;
    let (mdp, _) = Address::find_program_address(&[b"metadata", TOKEN_METADATA_PROGRAM.as_ref(), mint.address().as_ref()], &TOKEN_METADATA_PROGRAM);
    ensure(*md.address() == mdp, E_BAD_ACCOUNT)?;
    // three length-prefixed strings, within Metaplex's limits
    let mut parts: [&[u8]; 3] = [&[]; 3];
    let mut at = 0usize;
    for (i, max) in [32usize, 10, 200].into_iter().enumerate() {
        let n = *rest.get(at).ok_or(err(E_BAD_DATA))? as usize;
        let s = rest.get(at + 1..at + 1 + n).ok_or(err(E_BAD_DATA))?;
        ensure(n <= max && (i == 2 || n > 0) && core::str::from_utf8(s).is_ok(), E_BAD_DATA)?;
        parts[i] = s;
        at += 1 + n;
    }
    // discriminator 33, DataV2 { name, symbol, uri, seller_fee_basis_points 0,
    // creators None, collection None, uses None }, is_mutable false, collection_details None
    let mut buf = [0u8; 1 + 3 * 4 + 32 + 10 + 200 + 2 + 3 + 1 + 1];
    let mut n = 0usize;
    let mut put = |b: &[u8]| { buf[n..n + b.len()].copy_from_slice(b); n += b.len(); };
    put(&[33]);
    for s in parts { put(&(s.len() as u32).to_le_bytes()); put(s); }
    put(&[0, 0, 0, 0, 0, 0, 0]);
    let metas = [
        InstructionAccount::writable(md.address()), InstructionAccount::readonly(mint.address()),
        InstructionAccount::readonly_signer(launch.address()), InstructionAccount::writable_signer(founder.address()),
        InstructionAccount::readonly_signer(launch.address()), InstructionAccount::readonly(system.address()),
    ];
    let ix = InstructionView { program_id: &TOKEN_METADATA_PROGRAM, data: &buf[..n], accounts: &metas };
    pinocchio::cpi::invoke_signed(&ix, &[&md, &mint, launch, &founder, launch, &system], &[Signer::from(lseeds)])
}

/// The founder's `dollars` become token K through PulseSwap, delivered
/// straight into the launch's K vault. Returns the vault's address. Only a
/// pool of the swap program fixed at Initialize counts, only if it is a day
/// old and holds ten times `dollars`, and only the K that actually arrived.
fn paste_collateral(program_id: &Address, accounts: &[AccountView], cfg: &Config, lp: &Address, lseeds: &[Seed], dollars: u64, min_k: u64) -> Result<Address, ProgramError> {
    let [founder, _config, mint, _launch, _pt, _pd, _vault, f_d, _f_t, _platform, _system, token, dollar_mint, _md, _mpl,
         k_mint, kv, swap, s_config, s_pool, s_tv, s_dv, s_bucket, s_platform, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(*swap.address() == cfg.swap_program && swap.executable(), E_BAD_ACCOUNT)?;
    ensure(*k_mint.address() != *mint.address() && *k_mint.address() != cfg.dollar_mint && k_mint.owned_by(&TOKEN_PROGRAM), E_BAD_MINT)?;
    // the pool must be the swap program's pool for K, and seasoned
    ensure(s_pool.owned_by(&cfg.swap_program), E_BAD_ACCOUNT)?;
    let (pool_mint, created_at) = {
        let d = s_pool.try_borrow()?;
        ensure(d.len() == SWAP_POOL_LEN && d[0] == 2, E_BAD_ACCOUNT)?;
        ensure(addr_at(&d, 33)? == *s_tv.address() && addr_at(&d, 65)? == *s_dv.address(), E_BAD_ACCOUNT)?;
        (addr_at(&d, 1)?, u64_at(&d, 105)? as i64)
    };
    ensure(pool_mint == *k_mint.address(), E_BAD_ACCOUNT)?;
    let (dv_mint, dv_bal) = token_account(&s_dv)?;
    ensure(dv_mint == cfg.dollar_mint, E_BAD_ACCOUNT)?;
    ensure(math::seasoned(Clock::get()?.unix_timestamp, created_at, dv_bal, dollars), E_POOL_NOT_SEASONED)?;

    let (kvp, kvb) = pda(&[b"kv", lp.as_ref()], program_id);
    ensure(*kv.address() == kvp, E_BAD_ACCOUNT)?;
    let kvbs = [kvb];
    create_token_pda(&founder, &kv, &k_mint, lp, &[Seed::from(b"kv"), Seed::from(lp.as_ref()), Seed::from(&kvbs)])?;
    let _ = (lseeds, dollar_mint);

    // PulseSwap Swap (tag 4), dollars -> K, the founder signing as trader
    let paid0 = token_account(&f_d)?.1;
    let mut ix_data = [0u8; 18];
    ix_data[0] = 4;
    ix_data[1] = 1;
    ix_data[2..10].copy_from_slice(&dollars.to_le_bytes());
    ix_data[10..18].copy_from_slice(&min_k.to_le_bytes());
    let metas = [
        InstructionAccount::readonly_signer(founder.address()), InstructionAccount::readonly(s_config.address()),
        InstructionAccount::readonly(s_pool.address()), InstructionAccount::writable(s_tv.address()),
        InstructionAccount::writable(s_dv.address()), InstructionAccount::writable(f_d.address()),
        InstructionAccount::writable(kv.address()), InstructionAccount::writable(s_bucket.address()),
        InstructionAccount::writable(s_platform.address()), InstructionAccount::readonly(token.address()),
    ];
    let ix = InstructionView { program_id: &cfg.swap_program, data: &ix_data, accounts: &metas };
    pinocchio::cpi::invoke(&ix, &[&founder, &s_config, &s_pool, &s_tv, &s_dv, &f_d, &kv, &s_bucket, &s_platform, &token])?;

    let spent = paid0 - token_account(&f_d)?.1;
    let got = token_account(&kv)?.1;
    ensure(spent >= math::MIN_COLLATERAL_DOLLARS * cfg.unit && spent == dollars && got > 0 && got >= min_k, E_LIMITS)?;
    Ok(kvp)
}

fn launch_seeds<'a>(l: &'a Launch, bump: &'a [u8; 1]) -> [Seed<'a>; 3] {
    [Seed::from(b"launch"), Seed::from(l.mint.as_ref()), Seed::from(bump)]
}

/// Buy with `dollars_in`; at least `min_tokens` or fail.
fn buy(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [buyer, config, launch, pt, pd, vault, b_d, b_t, f_d, platform, token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(buyer.is_signer() && *token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let l = read_launch(program_id, &launch)?;
    ensure(*pt.address() == l.pt && *pd.address() == l.pd && *vault.address() == l.vault, E_BAD_ACCOUNT)?;
    ensure(*f_d.address() == l.founder_dollar && *platform.address() == cfg.platform, E_BAD_ACCOUNT)?;
    let dollars_in = u64_at(data, 0)?; let min_tokens = u64_at(data, 8)?;
    ensure(dollars_in > 0, E_ZERO)?;
    // price on the reserves as they were before this trade
    let y = token_account(&pd)?.1 + l.virt;
    let snipe = math::mul_ppm(dollars_in, math::snipe_ppm_at(Clock::get()?.unix_timestamp - l.opened_at));
    let s = math::route(dollars_in - snipe, l.tax_ppm);
    let out = math::buy_out(token_account(&pt)?.1, y, s.rest);
    ensure(out >= min_tokens && out > 0, E_SLIPPAGE)?;
    // snipe and depth stay in the pool with the bid
    transfer(&b_d, &pd, &buyer, snipe + s.depth + s.rest, None)?;
    transfer(&b_d, &f_d, &buyer, s.founder, None)?;
    transfer(&b_d, &platform, &buyer, s.platform, None)?;
    transfer(&b_d, &vault, &buyer, s.tax, None)?;
    let bump = [l.bump];
    transfer(&pt, &b_t, &launch, out, Some(&launch_seeds(&l, &bump)))
}

/// Sell `tokens_in`; at least `min_dollars` after fee and tax or fail.
fn sell(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [seller, config, mint, mut launch, pt, pd, vault, s_t, s_d, f_d, platform, token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(seller.is_signer() && *token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let l = read_launch(program_id, &launch)?;
    ensure(*mint.address() == l.mint && *pt.address() == l.pt && *pd.address() == l.pd && *vault.address() == l.vault, E_BAD_ACCOUNT)?;
    ensure(*f_d.address() == l.founder_dollar && *platform.address() == cfg.platform, E_BAD_ACCOUNT)?;
    let tokens_in = u64_at(data, 0)?; let min_dollars = u64_at(data, 8)?;
    ensure(tokens_in > 0, E_ZERO)?;
    let t = token_account(&pt)?.1;
    let real = token_account(&pd)?.1;
    // volume shield: share of circulating sold within this slot
    let circ = mint_info(&mint)?.supply - t;
    let slot = Clock::get()?.slot;
    let (block_ppm, extra) = math::shield(l.shield_slot, l.shield_ppm, slot, tokens_in, circ);
    write(&mut launch, 185, &slot.to_le_bytes())?;
    write(&mut launch, 193, &block_ppm.to_le_bytes())?;
    let gross = math::sell_gross(t, real, l.virt, tokens_in);
    // the shield rides with the vault's share: a large sale pays the floor
    let s = math::route(gross, l.tax_ppm + extra);
    ensure(s.rest >= min_dollars, E_SLIPPAGE)?;
    transfer(&s_t, &pt, &seller, tokens_in, None)?;
    let bump = [l.bump];
    let seeds = launch_seeds(&l, &bump);
    // depth is simply not paid out: it stays in the pool
    transfer(&pd, &f_d, &launch, s.founder, Some(&seeds))?;
    transfer(&pd, &platform, &launch, s.platform, Some(&seeds))?;
    transfer(&pd, &vault, &launch, s.tax, Some(&seeds))?;
    transfer(&pd, &s_d, &launch, s.rest, Some(&seeds))
}

/// Burn `amount`, receive the same share of the vault. No fee: a fee on the
/// exit would let the price sit below the floor.
fn redeem(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [holder, mint, launch, pt, vault, h_t, h_d, token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(holder.is_signer() && *token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    let l = read_launch(program_id, &launch)?;
    ensure(*mint.address() == l.mint && *pt.address() == l.pt && *vault.address() == l.vault, E_BAD_ACCOUNT)?;
    let amount = u64_at(data, 0)?;
    ensure(amount > 0, E_ZERO)?;
    let circ = mint_info(&mint)?.supply - token_account(&pt)?.1;
    ensure(amount <= circ, E_NOT_CIRCULATING)?;
    let payout = math::pro_rata(token_account(&vault)?.1, amount, circ);
    // a backed vault pays its pasted token too, in the same proportion; it
    // cannot be redeemed without it
    let k_payout = if l.kv != NOT_BACKED {
        let kv = accounts.get(8).ok_or(err(E_BACKED))?;
        ensure(*kv.address() == l.kv, E_BACKED)?;
        accounts.get(9).ok_or(err(E_BACKED))?;
        math::pro_rata(token_account(kv)?.1, amount, circ)
    } else { 0 };
    Burn::<&AccountView>::new(&h_t, &mint, &holder, amount).invoke()?;
    let bump = [l.bump];
    let seeds = launch_seeds(&l, &bump);
    transfer(&vault, &h_d, &launch, payout, Some(&seeds))?;
    if l.kv != NOT_BACKED {
        transfer(&accounts[8], &accounts[9], &launch, k_payout, Some(&seeds))?;
    }
    Ok(())
}

/// Anyone may add collateral; it only raises the floor for every holder.
fn fund(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [from, launch, vault, from_d, token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(from.is_signer() && *token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    let l = read_launch(program_id, &launch)?;
    ensure(*vault.address() == l.vault, E_BAD_ACCOUNT)?;
    let amount = u64_at(data, 0)?;
    ensure(amount > 0, E_ZERO)?;
    transfer(&from_d, &vault, &from, amount, None)
}
