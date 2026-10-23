//! ARC PULSE basket vault on Solana (pinocchio).
//!
//! One vault per chain. For every launch whose basket names a mint on
//! Solana it keeps that launch's units in a ledger PDA; the units sit in one
//! token account per mint (the "depo"), whose authority is the config PDA.
//! A launch's money can never pay another launch: every fill and payout is
//! booked against the launch's own ledger.
//!
//! No oracle, no pool: reverse Dutch auctions (see `egri`). A buy offers
//! dollars for at least Q(t) units, a sell offers units for at least P(t)
//! dollars; the filler delivers.
//!
//! Orders come two ways:
//!   - over CCTP V2 (split mode, as on Sui): the dollars arrive as a plain
//!     burn minted to the dollar depo (anyone completes it), the order as a
//!     message whose recipient is this program. Circle's MessageTransmitter
//!     CPIs `handle_receive_finalized_message` here, signed by its authority
//!     PDA for this program; if this handler fails the whole receive fails
//!     and the nonce stays unused, so the order cannot be skipped, only
//!     retried. The order is recorded (an Emir PDA) and anyone carries it out
//!     (`UygulaAl`, `UygulaSat`) once, for a buy, the depo holds its dollars
//!     beyond what is already booked to launches (`atanmis`).
//!   - from the `emirci` fixed at Initialize (a direct path kept for local
//!     use).
//! A payout to another chain stays in the dollar depo, booked to a Giden
//! PDA, until anyone calls `GidenGonder`: this program then burns it to the
//! holder's chain through Circle's TokenMessengerMinter V2, signing as the
//! depo's owner (the config PDA). No key ever holds a payout.
//!
//! PDAs
//!   ["config"]                       tag, domain u32, dollar_mint, emirci, emirci_dolar, ihale_sayisi u64, bump,
//!                                    defter_zincir u32, defter, ikiz, atanmis u64, emir_sayisi u64, giden_sayisi u64
//!   ["giden", id]                    tag, zincir u32, alici, miktar u64, gonderildi u8, bump
//!   ["olay", id]                     the MessageSent event account a GidenGonder pays for
//!   ["emir", id]                     tag, tur, launch, dolar, ref, miktar, arz, hz u32, alici, n u8,
//!                                    5 mints, yapildi bits u8, bump
//!   ["depo", mint]                   token account, authority = config
//!   ["dolar", launch]                tag, bakiye u64, taahhut u64, bump
//!   ["bakiye", launch, mint]         tag, units u64, bump
//!   ["fiyat", mint]                  tag, dolar u64, varlik u64, bump
//!   ["ihale", id]                    tag, tur, bitti, launch u64, mint, verilen u64, baslangic u64,
//!                                    baslama i64, hedef_zincir u32, alici, bump
//!
//! Instructions (first byte)
//!   0 Initialize  [admin s w, config w, dollar_mint, dollar_depo w, system, token]
//!                 data: domain u32, emirci 32, emirci_dolar 32, defter_zincir u32, defter 32, ikiz 32
//!   CCTP handler  [authority s, config w, emir w, payer s w, system]   (Anchor discriminator)
//!   6 UygulaAl    [payer s w, config w, emir w, dolar w, mint, fiyat, ihale w, dollar_depo, system]  data: emir u64
//!   7 UygulaSat   [payer s w, config w, emir w, dolar w, bakiye w, mint, fiyat, ihale w, dollar_depo w, payee w, giden w, system, token]
//!                 data: emir u64, index u8
//!   8 GidenGonder [payer s w, config w, giden w, dollar_depo w, olay w, then Circle's deposit_for_burn accounts from
//!                  sender_authority on: sender_authority, denylist, message_transmitter w, token_messenger,
//!                  remote_token_messenger, token_minter, local_token w, dollar_mint w, mt_program, tmm_program,
//!                  token_program, system_program, event_authority, tmm_program]   data: giden u64
//!   1 AlEmri      [emirci s w, config w, dolar w, mint, fiyat, ihale w, emirci_dolar w, dollar_depo w, system, token]
//!                 data: launch u64, dolar u64, ref u64
//!   2 SatEmri     [emirci s w, config w, dolar w, bakiye w, mint, fiyat, ihale w, dollar_depo w, payee w, giden w, system, token]
//!                 data: launch u64, miktar u64, arz u64, ilk u8, hedef_zincir u32, alici 32
//!   3 DoldurAlim  [filler s w, config w, dolar w, bakiye w, fiyat w, ihale w, mint, asset_depo w,
//!                  filler_asset w, filler_dollar w, dollar_depo w, system, token]
//!                 data: id u64, teklif u64
//!   4 DoldurSatim [filler s w, config w, fiyat w, ihale w, mint, asset_depo w, filler_asset w,
//!                  filler_dollar w, payee w, giden w, system, token]
//!                 data: id u64, teklif u64
//!   5 Yeniden     [config, ihale w]   data: id u64
//!   9 LzEmir      [emirci s, config w, emir w, payer s w, system]   data: the Arc HaberciLZ body
//!                 (the emirci is the LayerZero gate's store PDA, signing by CPI)
//!
//!  10 TakasAl   [caller s w, config w, dolar w, bakiye w, fiyat w, ihale w, mint, asset_depo w, dollar_depo w,
//!                 caller_dollar w, liste, system, token, then Raydium CLMM's swap: raydium program, amm_config,
//!                 pool w, input_vault w, output_vault w, observation w, tick_array w, [bitmap extension, tick arrays]]
//!                 data: ihale u64
//!  11 TakasSat  [caller s w, config w, fiyat w, ihale w, mint, asset_depo w, dollar_depo w, payee w, giden w,
//!                 caller_dollar w, liste, system, token, then the same Raydium accounts]   data: ihale u64
//!  12 ListeEkle [admin s w, config, liste w, mint, pool, muhur, system]   (before Muhurle)
//!  13 DefterDegistir [admin s w, config w, degisti w, muhur, system]   data: defter 32, ikiz 32   (once, before Muhurle)
//!  14 Muhurle   [admin s w, muhur w, system]: the list and the Defter are fixed from here on
//!
//! `payee` is the holder's dollar ATA when they are paid on Solana, else the
//! dollar depo (the payout is then booked to the `giden` PDA).
//!
//! v4 — THE DEX PATH (23 Oct 2026, arastirma/v4-tasarim.md)
//!   An open auction can also be filled by the pool: anyone calls TakasAl /
//!   TakasSat and the vault itself swaps through the Raydium CLMM pool the
//!   list names for that mint (["liste", mint], set by the admin before the
//!   seal, never after). The price bound is the pool's own time-weighted
//!   average tick (its observation ring, at least 10 and up to 30 minutes):
//!   the current tick must be within KAYMA_TICK of it, the swap's price limit
//!   is that average +- KAYMA_TICK, and what comes out must be worth at
//!   least the input at the average less TOLERANS_BPS. A price pushed and
//!   pulled back inside one transaction moves the average by nothing; moving
//!   it takes holding the pool off its price for minutes. A partial fill
//!   (the limit reached) shrinks the auction and books what was bought; the
//!   rest waits for the next call or for an auction filler. The caller gets
//!   BAHSIS from the dollars once at least BAHSIS_ESIGI changed hands.
//!   Nothing else changed: orders, ledger, payouts and the auctions as before.
use crate::egri::{self, BASLANGIC_KAT, BEKLEME, TABAN_KAT, YARILANMA};
use crate::fiyat;
use pinocchio::{
    cpi::{invoke_signed_with_bounds, Seed, Signer},
    instruction::{InstructionAccount, InstructionView},
    error::ProgramError,
    sysvars::{clock::Clock, rent::Rent, Sysvar},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer as SystemTransfer};
use pinocchio_token::instructions::{InitializeAccount3, Transfer};

#[cfg(not(feature = "local-test"))]
pub const INITIALIZER: Address = Address::from_str_const("5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh");
#[cfg(feature = "local-test")]
pub const INITIALIZER: Address = Address::from_str_const("21cwJQt3XrXk861zDhUzUvAq6PTzradj9ujhf9A3euZA");
pub const TOKEN_PROGRAM: Address = Address::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const ATA_PROGRAM: Address = Address::from_str_const("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const TOKEN_ACCOUNT_LEN: usize = 165;
const CONFIG_LEN: usize = 1 + 4 + 32 * 3 + 8 + 1 + 4 + 32 + 32 + 8 + 8 + 8;
const GIDEN_LEN: usize = 1 + 4 + 32 + 8 + 1 + 1;
pub const TOKEN_MESSENGER_MINTER: Address = Address::from_str_const("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe");
/// sha256("global:deposit_for_burn")[..8]
const DEPOSIT_FOR_BURN: [u8; 8] = [215, 60, 61, 46, 114, 55, 128, 176];
const EMIR_LEN: usize = 1 + 1 + 8 * 5 + 4 + 32 + 1 + 32 * 5 + 1 + 1;
pub const MESSAGE_TRANSMITTER: Address = Address::from_str_const("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC");
/// sha256("global:handle_receive_finalized_message")[..8]
const HANDLE_FINALIZED: [u8; 8] = [186, 252, 239, 70, 86, 180, 110, 95];
const KESINLIK: u32 = 2000;
const AL: u8 = 2;
const SAT: u8 = 3;
const DOLAR_LEN: usize = 1 + 8 + 8 + 1;
const BAKIYE_LEN: usize = 1 + 8 + 1;
const FIYAT_LEN: usize = 1 + 8 + 8 + 1;
const IHALE_LEN: usize = 1 + 1 + 1 + 8 + 32 + 8 + 8 + 8 + 4 + 32 + 1;

const ALIM: u8 = 1;
const SATIM: u8 = 2;

/* ---- v4: the DEX path -------------------------------------------------- */
pub const RAYDIUM_CLMM: Address = Address::from_str_const("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
/// sha256("global:swap")[..8], Raydium CLMM's swap (v1, SPL Token)
const RAYDIUM_SWAP: [u8; 8] = [248, 198, 158, 145, 225, 117, 135, 200];
/// the average spans 30 minutes when the ring reaches that far, never less than 10
pub const PENCERE: u32 = 1800;
pub const EN_AZ_PENCERE: u32 = 600;
/// ~3%: how far the current price may sit from the average, and how far a swap may move it
pub const KAYMA_TICK: i32 = 300;
/// what comes out is worth at least the input at the average less 4% (the 3% band and the pool's fee)
pub const TOLERANS_BPS: u128 = 400;
/// $0.05 to whoever fills from the pool, once at least $1 changed hands
pub const BAHSIS: u64 = 50_000;
pub const BAHSIS_ESIGI: u64 = 1_000_000;
const LISTE_LEN: usize = 1 + 32 + 1;

const E_ALREADY: u32 = 1;
const E_NOT_INITIALIZER: u32 = 2;
const E_BAD_ACCOUNT: u32 = 3;
const E_BAD_DATA: u32 = 4;
const E_NOT_EMIRCI: u32 = 5;
const E_AZ: u32 = 6;
const E_BITTI: u32 = 7;
const E_TUR: u32 = 8;
const E_ERKEN: u32 = 9;
const E_SIFIR: u32 = 10;
const E_NOT_CCTP: u32 = 11;
const E_NOT_DEFTER: u32 = 12;
const E_HAVUZ: u32 = 13;
const E_YAPILDI: u32 = 14;
const E_FIYAT: u32 = 15;
const E_LISTE: u32 = 16;
const E_MUHUR: u32 = 17;
const E_TWAP: u32 = 18;
const E_HAVUZ_HESAP: u32 = 19;

fn err(c: u32) -> ProgramError { ProgramError::Custom(c) }
fn ensure(c: bool, code: u32) -> ProgramResult { if c { Ok(()) } else { Err(err(code)) } }

fn u64_at(d: &[u8], o: usize) -> Result<u64, ProgramError> {
    Ok(u64::from_le_bytes(d.get(o..o + 8).ok_or(err(E_BAD_DATA))?.try_into().map_err(|_| err(E_BAD_DATA))?))
}
fn u32_at(d: &[u8], o: usize) -> Result<u32, ProgramError> {
    Ok(u32::from_le_bytes(d.get(o..o + 4).ok_or(err(E_BAD_DATA))?.try_into().map_err(|_| err(E_BAD_DATA))?))
}
fn addr_at(d: &[u8], o: usize) -> Result<Address, ProgramError> {
    let b: [u8; 32] = d.get(o..o + 32).ok_or(err(E_BAD_DATA))?.try_into().map_err(|_| err(E_BAD_DATA))?;
    Ok(Address::new_from_array(b))
}

fn pda(seeds: &[&[u8]], program_id: &Address) -> (Address, u8) { Address::find_program_address(seeds, program_id) }

fn ata(owner: &Address, mint: &Address) -> Address {
    Address::find_program_address(&[owner.as_ref(), TOKEN_PROGRAM.as_ref(), mint.as_ref()], &ATA_PROGRAM).0
}

/// (mint, owner, amount) of an SPL token account
fn token_account(a: &AccountView) -> Result<(Address, Address, u64), ProgramError> {
    ensure(a.owned_by(&TOKEN_PROGRAM), E_BAD_ACCOUNT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == TOKEN_ACCOUNT_LEN, E_BAD_ACCOUNT)?;
    Ok((addr_at(&d, 0)?, addr_at(&d, 32)?, u64_at(&d, 64)?))
}

fn create_pda(payer: &AccountView, new: &AccountView, space: usize, owner: &Address, seeds: &[Seed]) -> ProgramResult {
    let need = Rent::get()?.try_minimum_balance(space)?;
    let have = new.lamports();
    if have == 0 {
        return CreateAccount { from: payer, to: new, lamports: need, space: space as u64, owner }.invoke_signed(&[Signer::from(seeds)]);
    }
    if have < need {
        SystemTransfer { from: payer, to: new, lamports: need - have }.invoke()?;
    }
    Allocate { account: new, space: space as u64 }.invoke_signed(&[Signer::from(seeds)])?;
    Assign { account: new, owner }.invoke_signed(&[Signer::from(seeds)])
}

fn write(a: &mut AccountView, at: usize, bytes: &[u8]) -> ProgramResult {
    a.try_borrow_mut()?[at..at + bytes.len()].copy_from_slice(bytes);
    Ok(())
}

fn transfer(from: &AccountView, to: &AccountView, auth: &AccountView, amount: u64, signer: Option<&[Seed]>) -> ProgramResult {
    if amount == 0 { return Ok(()); }
    let t = Transfer::<&AccountView>::new(from, to, auth, amount);
    match signer { None => t.invoke(), Some(s) => t.invoke_signed(&[Signer::from(s)]) }
}

/* ---- state ------------------------------------------------------------- */

#[allow(dead_code)]
struct Config { domain: u32, dollar_mint: Address, emirci: Address, emirci_dolar: Address, ihale_sayisi: u64, bump: u8,
    defter_zincir: u32, defter: Address, ikiz: Address, atanmis: u64, emir_sayisi: u64, giden_sayisi: u64 }

fn read_config(program_id: &Address, a: &AccountView) -> Result<Config, ProgramError> {
    ensure(a.owned_by(program_id) && *a.address() == pda(&[b"config"], program_id).0, E_BAD_ACCOUNT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == CONFIG_LEN && d[0] == 1, E_BAD_ACCOUNT)?;
    Ok(Config { domain: u32_at(&d, 1)?, dollar_mint: addr_at(&d, 5)?, emirci: addr_at(&d, 37)?, emirci_dolar: addr_at(&d, 69)?,
        ihale_sayisi: u64_at(&d, 101)?, bump: d[109], defter_zincir: u32_at(&d, 110)?, defter: addr_at(&d, 114)?, ikiz: addr_at(&d, 146)?,
        atanmis: u64_at(&d, 178)?, emir_sayisi: u64_at(&d, 186)?, giden_sayisi: u64_at(&d, 194)? })
}

/// A small PDA record: read it if it exists, or create it zeroed.
fn kayit(program_id: &Address, payer: &AccountView, a: &AccountView, len: usize, seeds: &[&[u8]]) -> ProgramResult {
    let (adr, bump) = pda(seeds, program_id);
    ensure(*a.address() == adr, E_BAD_ACCOUNT)?;
    if a.data_len() == 0 {
        let b = [bump];
        let mut s: [Seed; 4] = [Seed::from(b""), Seed::from(b""), Seed::from(b""), Seed::from(b"")];
        let n = seeds.len();
        for i in 0..n { s[i] = Seed::from(seeds[i]); }
        s[n] = Seed::from(&b);
        create_pda(payer, a, len, program_id, &s[..n + 1])?;
        let mut t = [0u8; 1];
        t[0] = 1;
        let mut a2 = *a;
        write(&mut a2, 0, &t)?;
        write(&mut a2, len - 1, &b)?;
    }
    ensure(a.owned_by(program_id) && a.data_len() == len, E_BAD_ACCOUNT)
}

fn oku64(a: &AccountView, o: usize) -> Result<u64, ProgramError> { u64_at(&a.try_borrow()?, o) }
fn yaz64(a: &AccountView, o: usize, v: u64) -> ProgramResult { let mut a2 = *a; write(&mut a2, o, &v.to_le_bytes()) }

/// The depo for `mint`: created on first use, authority the config PDA.
fn depo(program_id: &Address, payer: &AccountView, a: &AccountView, mint: &AccountView, config: &Address) -> ProgramResult {
    let (adr, bump) = pda(&[b"depo", mint.address().as_ref()], program_id);
    ensure(*a.address() == adr, E_BAD_ACCOUNT)?;
    if a.data_len() == 0 {
        let b = [bump];
        create_pda(payer, a, TOKEN_ACCOUNT_LEN, &TOKEN_PROGRAM, &[Seed::from(b"depo"), Seed::from(mint.address().as_ref()), Seed::from(&b)])?;
        InitializeAccount3::new(a, mint, config).invoke()?;
    }
    let (m, owner, _) = token_account(a)?;
    ensure(m == *mint.address() && owner == *config, E_BAD_ACCOUNT)
}

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() >= 8 && data[..8] == HANDLE_FINALIZED {
        return cctp_mesaji(program_id, accounts, &data[8..]);
    }
    let (tag, rest) = data.split_first().ok_or(err(E_BAD_DATA))?;
    match tag {
        0 => initialize(program_id, accounts, rest),
        1 => al_emri(program_id, accounts, rest),
        2 => sat_emri(program_id, accounts, rest),
        3 => doldur_alim(program_id, accounts, rest),
        4 => doldur_satim(program_id, accounts, rest),
        5 => yeniden(program_id, accounts, rest),
        6 => uygula_al(program_id, accounts, rest),
        7 => uygula_sat(program_id, accounts, rest),
        8 => giden_gonder(program_id, accounts, rest),
        9 => lz_emir(program_id, accounts, rest),
        10 => takas_al(program_id, accounts, rest),
        11 => takas_sat(program_id, accounts, rest),
        12 => liste_ekle(program_id, accounts),
        13 => defter_degistir(program_id, accounts, rest),
        14 => muhurle(program_id, accounts),
        _ => Err(err(E_BAD_DATA)),
    }
}

fn initialize(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [admin, mut config, dollar_mint, dollar_depo, _system, _token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(admin.is_signer() && *admin.address() == INITIALIZER, E_NOT_INITIALIZER)?;
    ensure(config.data_len() == 0, E_ALREADY)?;
    let (cp, cb) = pda(&[b"config"], program_id);
    ensure(*config.address() == cp, E_BAD_ACCOUNT)?;
    let cbs = [cb];
    create_pda(&admin, &config, CONFIG_LEN, program_id, &[Seed::from(b"config"), Seed::from(&cbs)])?;
    let mut d = [0u8; CONFIG_LEN];
    d[0] = 1;
    d[1..5].copy_from_slice(&u32_at(data, 0)?.to_le_bytes());
    d[5..37].copy_from_slice(dollar_mint.address().as_ref());
    d[37..69].copy_from_slice(addr_at(data, 4)?.as_ref());
    d[69..101].copy_from_slice(addr_at(data, 36)?.as_ref());
    d[109] = cb;
    d[110..114].copy_from_slice(&u32_at(data, 68)?.to_le_bytes());
    d[114..146].copy_from_slice(addr_at(data, 72)?.as_ref());
    d[146..178].copy_from_slice(addr_at(data, 104)?.as_ref());
    write(&mut config, 0, &d)?;
    depo(program_id, &admin, &dollar_depo, &dollar_mint, &cp)
}

fn yeni_ihale(program_id: &Address, payer: &AccountView, config: &mut AccountView, ihale: &mut AccountView,
              cfg: &Config, tur: u8, launch: u64, mint: &Address, verilen: u64, baslangic: u64, hz: u32, alici: &Address) -> ProgramResult {
    let id = cfg.ihale_sayisi;
    let idb = id.to_le_bytes();
    let (adr, bump) = pda(&[b"ihale", &idb], program_id);
    ensure(*ihale.address() == adr && ihale.data_len() == 0, E_BAD_ACCOUNT)?;
    let b = [bump];
    create_pda(payer, ihale, IHALE_LEN, program_id, &[Seed::from(b"ihale"), Seed::from(&idb), Seed::from(&b)])?;
    let mut d = [0u8; IHALE_LEN];
    d[0] = 1;
    d[1] = tur;
    d[3..11].copy_from_slice(&launch.to_le_bytes());
    d[11..43].copy_from_slice(mint.as_ref());
    d[43..51].copy_from_slice(&verilen.to_le_bytes());
    d[51..59].copy_from_slice(&baslangic.to_le_bytes());
    d[59..67].copy_from_slice(&Clock::get()?.unix_timestamp.to_le_bytes());
    d[67..71].copy_from_slice(&hz.to_le_bytes());
    d[71..103].copy_from_slice(alici.as_ref());
    d[103] = bump;
    write(ihale, 0, &d)?;
    write(config, 101, &(id + 1).to_le_bytes())
}

fn son_fiyat(program_id: &Address, fiyat: &AccountView, mint: &Address) -> Result<(u64, u64), ProgramError> {
    ensure(*fiyat.address() == pda(&[b"fiyat", mint.as_ref()], program_id).0, E_BAD_ACCOUNT)?;
    if fiyat.data_len() == 0 { return Ok((0, 0)); }
    ensure(fiyat.owned_by(program_id), E_BAD_ACCOUNT)?;
    Ok((oku64(fiyat, 1)?, oku64(fiyat, 9)?))
}

/// Buy `mint` with `dolar` from the emirci's account for `launch`.
fn al_emri(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [emirci, mut config, dolar, mint, fiyat, mut ihale, emirci_dolar, dollar_depo, _system, _token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let cfg = read_config(program_id, &config)?;
    ensure(emirci.is_signer() && *emirci.address() == cfg.emirci, E_NOT_EMIRCI)?;
    let launch = u64_at(data, 0)?;
    let miktar = u64_at(data, 8)?;
    let refv = u64_at(data, 16)?;
    ensure(miktar > 0, E_SIFIR)?;
    ensure(*dollar_depo.address() == pda(&[b"depo", cfg.dollar_mint.as_ref()], program_id).0, E_BAD_ACCOUNT)?;
    /* credit what arrived */
    let once = token_account(&dollar_depo)?.2;
    transfer(&emirci_dolar, &dollar_depo, &emirci, miktar, None)?;
    let gelen = token_account(&dollar_depo)?.2 - once;
    write(&mut config, 178, &(cfg.atanmis + gelen).to_le_bytes())?;
    alim_ac(program_id, &emirci, &mut config, &cfg, &dolar, &mint, &fiyat, &mut ihale, launch, gelen, refv)
}

/// Book `gelen` dollars to `launch` and open its buy auction for `mint`.
fn alim_ac(program_id: &Address, payer: &AccountView, config: &mut AccountView, cfg: &Config, dolar: &AccountView, mint: &AccountView,
           fiyat: &AccountView, ihale: &mut AccountView, launch: u64, gelen: u64, refv: u64) -> ProgramResult {
    let lb = launch.to_le_bytes();
    kayit(program_id, payer, dolar, DOLAR_LEN, &[b"dolar", &lb])?;
    yaz64(dolar, 1, oku64(dolar, 1)? + gelen)?;
    yaz64(dolar, 9, oku64(dolar, 9)? + gelen)?;
    let (fd, fv) = son_fiyat(program_id, fiyat, mint.address())?;
    let mut beklenen = if fd > 0 { egri::oran(gelen, fv, fd) } else { refv };
    if beklenen == 0 { beklenen = 1; }
    yeni_ihale(program_id, payer, config, ihale, cfg, ALIM, launch, mint.address(), gelen, beklenen * BASLANGIC_KAT, 0, &Address::new_from_array([0u8; 32]))
}

/// A holder burned `miktar` of `arz`: their share of `mint` goes up for sale
/// (out of the ledger at once); with `ilk`, their share of the launch's
/// unspent dollars is paid now.
fn sat_emri(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [emirci, mut config, dolar, bakiye, mint, fiyat, mut ihale, dollar_depo, payee, mut giden, _system, _token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let cfg = read_config(program_id, &config)?;
    ensure(emirci.is_signer() && *emirci.address() == cfg.emirci, E_NOT_EMIRCI)?;
    let launch = u64_at(data, 0)?;
    let miktar = u64_at(data, 8)?;
    let arz = u64_at(data, 16)?;
    let ilk = *data.get(24).ok_or(err(E_BAD_DATA))? == 1;
    let hz = u32_at(data, 25)?;
    let alici = addr_at(data, 29)?;
    satis_ac(program_id, &emirci, &mut config, &cfg, &dolar, &bakiye, &mint, &fiyat, &mut ihale, &dollar_depo, &payee, &mut giden, launch, miktar, arz, ilk, hz, &alici)
}

/// A holder burned `miktar` of `arz`: their share of `mint` goes up for
/// sale, and with `ilk` their share of the launch's dollars is paid now.
fn satis_ac(program_id: &Address, payer: &AccountView, config: &mut AccountView, cfg: &Config, dolar: &AccountView, bakiye: &AccountView,
            mint: &AccountView, fiyat: &AccountView, ihale: &mut AccountView, dollar_depo: &AccountView, payee: &AccountView,
            giden: &mut AccountView, launch: u64, miktar: u64, arz: u64, ilk: bool, hz: u32, alici: &Address) -> ProgramResult {
    ensure(arz > 0 && miktar > 0 && miktar <= arz, E_BAD_DATA)?;
    let lb = launch.to_le_bytes();
    let cb = [cfg.bump];
    let cseeds = [Seed::from(b"config"), Seed::from(&cb)];
    if ilk {
        kayit(program_id, payer, dolar, DOLAR_LEN, &[b"dolar", &lb])?;
        let d = egri::oran(oku64(dolar, 1)?, miktar, arz);
        if d > 0 {
            yaz64(dolar, 1, oku64(dolar, 1)? - d)?;
            /* still booked: either it leaves now (ode lowers the total) or it
               waits in a Giden PDA as an owed payout */
            ode(program_id, payer, config, dollar_depo, payee, giden, hz, alici, d, &cseeds)?;
        }
    }
    kayit(program_id, payer, bakiye, BAKIYE_LEN, &[b"bakiye", &lb, mint.address().as_ref()])?;
    let b = oku64(bakiye, 1)?;
    let pay = egri::oran(b, miktar, arz);
    if pay == 0 { return Ok(()); }
    yaz64(bakiye, 1, b - pay)?;
    let (fd, fv) = son_fiyat(program_id, fiyat, mint.address())?;
    let mut beklenen = egri::oran(pay, fd, fv);
    if beklenen == 0 { beklenen = 1; }
    let cfg2 = read_config(program_id, config)?;
    yeni_ihale(program_id, payer, config, ihale, &cfg2, SATIM, launch, mint.address(), pay, beklenen * BASLANGIC_KAT, hz, alici)
}

/// Pay `miktar` dollars from the depo: to the holder's dollar ATA on this
/// chain, or book it to a new Giden PDA (the dollars stay in the depo,
/// counted as booked) for GidenGonder to burn to their chain.
fn ode(program_id: &Address, payer: &AccountView, config: &mut AccountView, dollar_depo: &AccountView, payee: &AccountView,
       giden: &mut AccountView, hz: u32, alici: &Address, miktar: u64, cseeds: &[Seed]) -> ProgramResult {
    let cfg = read_config(program_id, config)?;
    if hz == cfg.domain {
        ensure(*payee.address() == ata(alici, &cfg.dollar_mint), E_BAD_ACCOUNT)?;
        write(config, 178, &(cfg.atanmis - miktar).to_le_bytes())?;
        return transfer(dollar_depo, payee, config, miktar, Some(cseeds));
    }
    giden_kaydet(program_id, payer, config, giden, hz, alici, miktar)
}

fn giden_kaydet(program_id: &Address, payer: &AccountView, config: &mut AccountView, giden: &mut AccountView, hz: u32, alici: &Address, miktar: u64) -> ProgramResult {
    let cfg = read_config(program_id, config)?;
    let id = cfg.giden_sayisi;
    let idb = id.to_le_bytes();
    let (adr, bump) = pda(&[b"giden", &idb], program_id);
    ensure(*giden.address() == adr && giden.data_len() == 0, E_BAD_ACCOUNT)?;
    let b = [bump];
    create_pda(payer, giden, GIDEN_LEN, program_id, &[Seed::from(b"giden"), Seed::from(&idb), Seed::from(&b)])?;
    let mut d = [0u8; GIDEN_LEN];
    d[0] = 1;
    d[1..5].copy_from_slice(&hz.to_le_bytes());
    d[5..37].copy_from_slice(alici.as_ref());
    d[37..45].copy_from_slice(&miktar.to_le_bytes());
    d[46] = bump;
    write(giden, 0, &d)?;
    write(config, 194, &(id + 1).to_le_bytes())
}

struct Ihale { tur: u8, bitti: bool, launch: u64, mint: Address, verilen: u64, baslangic: u64, baslama: i64, hz: u32, alici: Address }

fn read_ihale(program_id: &Address, a: &AccountView, id: u64) -> Result<Ihale, ProgramError> {
    ensure(*a.address() == pda(&[b"ihale", &id.to_le_bytes()], program_id).0 && a.owned_by(program_id), E_BAD_ACCOUNT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == IHALE_LEN && d[0] == 1, E_BAD_ACCOUNT)?;
    Ok(Ihale { tur: d[1], bitti: d[2] == 1, launch: u64_at(&d, 3)?, mint: addr_at(&d, 11)?, verilen: u64_at(&d, 43)?,
        baslangic: u64_at(&d, 51)?, baslama: u64_at(&d, 59)? as i64, hz: u32_at(&d, 67)?, alici: addr_at(&d, 71)? })
}

fn istenen(h: &Ihale) -> Result<u64, ProgramError> {
    let now = Clock::get()?.unix_timestamp;
    let gecen = if now > h.baslama { (now - h.baslama) as u64 } else { 0 };
    Ok(egri::istenen(h.baslangic, gecen))
}

fn doldur_alim(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [filler, config, dolar, bakiye, mut fiyat, mut ihale, mint, asset_depo, filler_asset, filler_dollar, dollar_depo, _system, _token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(filler.is_signer(), E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let id = u64_at(data, 0)?;
    let teklif = u64_at(data, 8)?;
    let h = read_ihale(program_id, &ihale, id)?;
    ensure(!h.bitti, E_BITTI)?;
    ensure(h.tur == ALIM && *mint.address() == h.mint, E_TUR)?;
    let ist = istenen(&h)?;
    let lb = h.launch.to_le_bytes();
    kayit(program_id, &filler, &dolar, DOLAR_LEN, &[b"dolar", &lb])?;
    /* this auction's proportional part of what a redemption left */
    let t = oku64(&dolar, 9)?;
    let harca = egri::oran(h.verilen, oku64(&dolar, 1)?, t);
    ensure(harca > 0, E_SIFIR)?;
    let gerek = egri::oran(ist, harca, h.verilen);
    depo(program_id, &filler, &asset_depo, &mint, config.address())?;
    ensure(*dollar_depo.address() == pda(&[b"depo", cfg.dollar_mint.as_ref()], program_id).0, E_BAD_ACCOUNT)?;
    let once = token_account(&asset_depo)?.2;
    transfer(&filler_asset, &asset_depo, &filler, teklif, None)?;
    let gelen = token_account(&asset_depo)?.2 - once;
    ensure(gelen > 0 && gelen >= gerek, E_AZ)?;
    write(&mut ihale, 2, &[1])?;
    yaz64(&dolar, 9, t - h.verilen)?;
    yaz64(&dolar, 1, oku64(&dolar, 1)? - harca)?;
    let mut cfgm = config;
    write(&mut cfgm, 178, &(cfg.atanmis - harca).to_le_bytes())?;
    kayit(program_id, &filler, &bakiye, BAKIYE_LEN, &[b"bakiye", &lb, mint.address().as_ref()])?;
    yaz64(&bakiye, 1, oku64(&bakiye, 1)? + gelen)?;
    kayit(program_id, &filler, &fiyat, FIYAT_LEN, &[b"fiyat", mint.address().as_ref()])?;
    yaz64(&fiyat, 1, harca)?;
    yaz64(&fiyat, 9, gelen)?;
    let _ = &mut fiyat;
    let cb = [cfg.bump];
    transfer(&dollar_depo, &filler_dollar, &config, harca, Some(&[Seed::from(b"config"), Seed::from(&cb)]))
}

fn doldur_satim(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [filler, mut config, fiyat, mut ihale, mint, asset_depo, filler_asset, filler_dollar, payee, mut giden, _system, _token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(filler.is_signer(), E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let id = u64_at(data, 0)?;
    let teklif = u64_at(data, 8)?;
    let h = read_ihale(program_id, &ihale, id)?;
    ensure(!h.bitti, E_BITTI)?;
    ensure(h.tur == SATIM && *mint.address() == h.mint, E_TUR)?;
    ensure(teklif > 0 && teklif >= istenen(&h)?, E_AZ)?;
    ensure(*asset_depo.address() == pda(&[b"depo", mint.address().as_ref()], program_id).0, E_BAD_ACCOUNT)?;
    write(&mut ihale, 2, &[1])?;
    kayit(program_id, &filler, &fiyat, FIYAT_LEN, &[b"fiyat", mint.address().as_ref()])?;
    yaz64(&fiyat, 1, teklif)?;
    yaz64(&fiyat, 9, h.verilen)?;
    /* the filler pays the holder directly, or, for another chain, the depo,
       where the dollars are booked to a Giden PDA for GidenGonder */
    if h.hz == cfg.domain {
        ensure(*payee.address() == ata(&h.alici, &cfg.dollar_mint), E_BAD_ACCOUNT)?;
    } else {
        ensure(*payee.address() == pda(&[b"depo", cfg.dollar_mint.as_ref()], program_id).0, E_BAD_ACCOUNT)?;
    }
    let once = token_account(&payee)?.2;
    transfer(&filler_dollar, &payee, &filler, teklif, None)?;
    let gelen = token_account(&payee)?.2 - once;
    ensure(gelen >= teklif, E_AZ)?;
    if h.hz != cfg.domain {
        write(&mut config, 178, &(cfg.atanmis + gelen).to_le_bytes())?;
        giden_kaydet(program_id, &filler, &mut config, &mut giden, h.hz, &h.alici, gelen)?;
    }
    let cb = [cfg.bump];
    transfer(&asset_depo, &filler_asset, &config, h.verilen, Some(&[Seed::from(b"config"), Seed::from(&cb)]))
}

fn yeniden(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [_config, mut ihale, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let id = u64_at(data, 0)?;
    let h = read_ihale(program_id, &ihale, id)?;
    ensure(!h.bitti, E_BITTI)?;
    let now = Clock::get()?.unix_timestamp;
    ensure(now >= h.baslama + (4 * YARILANMA + BEKLEME) as i64, E_ERKEN)?;
    let mut yeni = h.baslangic / TABAN_KAT;
    if yeni == 0 { yeni = 1; }
    write(&mut ihale, 51, &yeni.to_le_bytes())?;
    write(&mut ihale, 59, &now.to_le_bytes())
}

/* ---- CCTP V2 (split mode) ----------------------------------------------- */

fn u256_lo64(b: &[u8], o: usize) -> Result<u64, ProgramError> {
    let w = b.get(o..o + 32).ok_or(err(E_BAD_DATA))?;
    ensure(w[..24].iter().all(|x| *x == 0), E_BAD_DATA)?;
    Ok(u64::from_be_bytes(w[24..32].try_into().map_err(|_| err(E_BAD_DATA))?))
}
fn u256_u128(b: &[u8], o: usize) -> Result<u128, ProgramError> {
    let w = b.get(o..o + 32).ok_or(err(E_BAD_DATA))?;
    ensure(w[..16].iter().all(|x| *x == 0), E_BAD_DATA)?;
    Ok(u128::from_be_bytes(w[16..32].try_into().map_err(|_| err(E_BAD_DATA))?))
}

/// MessageTransmitter V2's CPI for a finalized message whose recipient is
/// this program: (remote_domain u32, sender, finality u32, body vec, bump),
/// borsh. The body is the EVM Haberci's abi.encode(kaynak, hedef, veri, dolar).
fn cctp_mesaji(program_id: &Address, accounts: &mut [AccountView], p: &[u8]) -> ProgramResult {
    let [yetki, mut config, mut emir, payer, _system, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let (beklenen_yetki, _) = Address::find_program_address(&[b"message_transmitter_authority", program_id.as_ref()], &MESSAGE_TRANSMITTER);
    ensure(yetki.is_signer() && *yetki.address() == beklenen_yetki, E_NOT_CCTP)?;
    let cfg = read_config(program_id, &config)?;
    let uzak = u32_at(p, 0)?;
    let gonderen = addr_at(p, 4)?;
    let kesinlik = u32_at(p, 36)?;
    let n = u32_at(p, 40)? as usize;
    let govde = p.get(44..44 + n).ok_or(err(E_BAD_DATA))?;
    ensure(kesinlik >= KESINLIK, E_NOT_CCTP)?;
    ensure(uzak == cfg.defter_zincir && gonderen == cfg.ikiz, E_NOT_DEFTER)?;
    /* only the Defter orders, and only this vault */
    ensure(addr_at(govde, 0)? == cfg.defter && addr_at(govde, 32)? == *config.address(), E_NOT_DEFTER)?;
    let dolar = u256_lo64(govde, 96)?;
    let vl = u256_lo64(govde, 128)? as usize;
    let veri = govde.get(160..160 + vl).ok_or(err(E_BAD_DATA))?;
    emir_kaydet(program_id, &mut config, &mut emir, &payer, &cfg, veri, dolar)
}

/// From the LayerZero gate (the `emirci`, a PDA of the gate program that
/// signs this CPI): the Arc HaberciLZ body
///   abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri, uint256 miktar, uint256 beklenen)
/// recorded like a CCTP order. Its dollars come by Circle forwarding, which
/// takes its fee on the way: the order is booked with `beklenen`, the least
/// that arrives.
fn lz_emir(program_id: &Address, accounts: &mut [AccountView], govde: &[u8]) -> ProgramResult {
    let [emirci, mut config, mut emir, payer, _system, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let cfg = read_config(program_id, &config)?;
    ensure(emirci.is_signer() && *emirci.address() == cfg.emirci, E_NOT_EMIRCI)?;
    ensure(addr_at(govde, 0)? == cfg.defter && addr_at(govde, 32)? == *config.address(), E_NOT_DEFTER)?;
    let ofs = u256_lo64(govde, 64)? as usize;
    let dolar = u256_lo64(govde, 128)?;
    let vl = u256_lo64(govde, ofs)? as usize;
    let veri = govde.get(ofs + 32..ofs + 32 + vl).ok_or(err(E_BAD_DATA))?;
    emir_kaydet(program_id, &mut config, &mut emir, &payer, &cfg, veri, dolar)
}

/// An order's `veri` (AL or SAT, the Defter's encoding) into a new Emir PDA.
fn emir_kaydet(program_id: &Address, config: &mut AccountView, emir: &mut AccountView, payer: &AccountView, cfg: &Config,
    veri: &[u8], dolar: u64) -> ProgramResult {
    let tur = u256_lo64(veri, 0)? as u8;
    let launch = u256_lo64(veri, 32)?;
    let mut d = [0u8; EMIR_LEN];
    d[0] = 1;
    d[1] = tur;
    d[2..10].copy_from_slice(&launch.to_le_bytes());
    if tur == AL {
        d[10..18].copy_from_slice(&dolar.to_le_bytes());
        let r = u256_u128(veri, 96)?;
        d[18..26].copy_from_slice(&(if r > u64::MAX as u128 { u64::MAX } else { r as u64 }).to_le_bytes());
        d[78] = 1;
        d[79..111].copy_from_slice(&veri[64..96]);
    } else if tur == SAT {
        let ofs = u256_lo64(veri, 64)? as usize;
        let mut miktar = u256_u128(veri, 96)?;
        let mut arz = u256_u128(veri, 128)?;
        /* the share is a ratio: scaled together to fit u64 */
        while arz > u64::MAX as u128 { arz >>= 1; miktar >>= 1; }
        d[26..34].copy_from_slice(&(miktar as u64).to_le_bytes());
        d[34..42].copy_from_slice(&(arz as u64).to_le_bytes());
        d[42..46].copy_from_slice(&(u256_lo64(veri, 160)? as u32).to_le_bytes());
        d[46..78].copy_from_slice(&veri[192..224]);
        let k = u256_lo64(veri, ofs)? as usize;
        ensure(k >= 1 && k <= 5, E_BAD_DATA)?;
        d[78] = k as u8;
        for i in 0..k {
            let o = ofs + 32 + 32 * i;
            d[79 + 32 * i..111 + 32 * i].copy_from_slice(veri.get(o..o + 32).ok_or(err(E_BAD_DATA))?);
        }
    } else {
        return Err(err(E_BAD_DATA));
    }
    let id = cfg.emir_sayisi;
    let idb = id.to_le_bytes();
    let (adr, bump) = pda(&[b"emir", &idb], program_id);
    ensure(*emir.address() == adr && emir.data_len() == 0, E_BAD_ACCOUNT)?;
    let b = [bump];
    create_pda(payer, emir, EMIR_LEN, program_id, &[Seed::from(b"emir"), Seed::from(&idb), Seed::from(&b)])?;
    d[EMIR_LEN - 1] = bump;
    write(emir, 0, &d)?;
    write(config, 186, &(id + 1).to_le_bytes())
}

struct Emir { tur: u8, launch: u64, dolar: u64, refv: u64, miktar: u64, arz: u64, hz: u32, alici: Address, n: u8, yapildi: u8 }

fn read_emir(program_id: &Address, a: &AccountView, id: u64) -> Result<Emir, ProgramError> {
    ensure(*a.address() == pda(&[b"emir", &id.to_le_bytes()], program_id).0 && a.owned_by(program_id), E_BAD_ACCOUNT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == EMIR_LEN && d[0] == 1, E_BAD_ACCOUNT)?;
    Ok(Emir { tur: d[1], launch: u64_at(&d, 2)?, dolar: u64_at(&d, 10)?, refv: u64_at(&d, 18)?, miktar: u64_at(&d, 26)?,
        arz: u64_at(&d, 34)?, hz: u32_at(&d, 42)?, alici: addr_at(&d, 46)?, n: d[78], yapildi: d[239] })
}
fn emir_mint(a: &AccountView, i: usize) -> Result<Address, ProgramError> { addr_at(&a.try_borrow()?, 79 + 32 * i) }

/// Anyone: open the buy the order names, once the depo holds its dollars
/// beyond what is already booked to launches.
fn uygula_al(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [payer, mut config, mut emir, dolar, mint, fiyat, mut ihale, dollar_depo, _system, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(payer.is_signer(), E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let id = u64_at(data, 0)?;
    let e = read_emir(program_id, &emir, id)?;
    ensure(e.tur == AL && e.yapildi == 0, E_YAPILDI)?;
    ensure(*mint.address() == emir_mint(&emir, 0)?, E_TUR)?;
    ensure(*dollar_depo.address() == pda(&[b"depo", cfg.dollar_mint.as_ref()], program_id).0, E_BAD_ACCOUNT)?;
    let havuz = token_account(&dollar_depo)?.2.saturating_sub(cfg.atanmis);
    ensure(havuz >= e.dolar && e.dolar > 0, E_HAVUZ)?;
    write(&mut emir, 239, &[1])?;
    write(&mut config, 178, &(cfg.atanmis + e.dolar).to_le_bytes())?;
    let cfg2 = read_config(program_id, &config)?;
    alim_ac(program_id, &payer, &mut config, &cfg2, &dolar, &mint, &fiyat, &mut ihale, e.launch, e.dolar, e.refv)
}

/// Anyone: carry out the redemption the order names, for its `index`-th mint.
fn uygula_sat(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [payer, mut config, mut emir, dolar, bakiye, mint, fiyat, mut ihale, dollar_depo, payee, mut giden, _system, _token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(payer.is_signer(), E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let id = u64_at(data, 0)?;
    let i = *data.get(8).ok_or(err(E_BAD_DATA))? as usize;
    let e = read_emir(program_id, &emir, id)?;
    ensure(e.tur == SAT && i < e.n as usize && e.yapildi & (1u8 << i) == 0, E_YAPILDI)?;
    ensure(*mint.address() == emir_mint(&emir, i)?, E_TUR)?;
    write(&mut emir, 239, &[e.yapildi | (1u8 << i)])?;
    satis_ac(program_id, &payer, &mut config, &cfg, &dolar, &bakiye, &mint, &fiyat, &mut ihale, &dollar_depo, &payee, &mut giden,
        e.launch, e.miktar, e.arz, i == 0, e.hz, &e.alici)
}

/* ---- payouts to another chain, burned through CCTP V2 ----------------- */

fn giden_gonder(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if accounts.len() < 19 { return Err(ProgramError::NotEnoughAccountKeys); }
    let id = u64_at(data, 0)?;
    let cfg = read_config(program_id, &accounts[1])?;
    let idb = id.to_le_bytes();
    {
        let g = &accounts[2];
        ensure(*g.address() == pda(&[b"giden", &idb], program_id).0 && g.owned_by(program_id), E_BAD_ACCOUNT)?;
        ensure(accounts[0].is_signer(), E_BAD_ACCOUNT)?;
        ensure(*accounts[3].address() == pda(&[b"depo", cfg.dollar_mint.as_ref()], program_id).0, E_BAD_ACCOUNT)?;
        ensure(*accounts[12].address() == cfg.dollar_mint && *accounts[14].address() == TOKEN_MESSENGER_MINTER, E_BAD_ACCOUNT)?;
    }
    let (hz, alici, miktar, gonderildi) = {
        let d = accounts[2].try_borrow()?;
        ensure(d.len() == GIDEN_LEN && d[0] == 1, E_BAD_ACCOUNT)?;
        (u32_at(&d, 1)?, addr_at(&d, 5)?, u64_at(&d, 37)?, d[45])
    };
    ensure(gonderildi == 0, E_YAPILDI)?;
    let (olay, ob) = pda(&[b"olay", &idb], program_id);
    ensure(*accounts[4].address() == olay, E_BAD_ACCOUNT)?;
    let mut g = accounts[2];
    write(&mut g, 45, &[1])?;
    let mut c = accounts[1];
    write(&mut c, 178, &(cfg.atanmis - miktar).to_le_bytes())?;

    /* deposit_for_burn(amount, destination_domain, mint_recipient,
       destination_caller = any, max_fee = 0, standard finality) */
    let mut ix_data = [0u8; 8 + 8 + 4 + 32 + 32 + 8 + 4];
    ix_data[..8].copy_from_slice(&DEPOSIT_FOR_BURN);
    ix_data[8..16].copy_from_slice(&miktar.to_le_bytes());
    ix_data[16..20].copy_from_slice(&hz.to_le_bytes());
    ix_data[20..52].copy_from_slice(alici.as_ref());
    ix_data[84..92].copy_from_slice(&0u64.to_le_bytes());
    ix_data[92..96].copy_from_slice(&KESINLIK.to_le_bytes());
    let config_adr = *accounts[1].address();
    /* owner (config PDA, signs), event_rent_payer (the caller), then Circle's list */
    let metas = [
        InstructionAccount::readonly_signer(&config_adr),
        InstructionAccount::writable_signer(accounts[0].address()),
        InstructionAccount::readonly(accounts[5].address()),
        InstructionAccount::writable(accounts[3].address()),
        InstructionAccount::readonly(accounts[6].address()),
        InstructionAccount::writable(accounts[7].address()),
        InstructionAccount::readonly(accounts[8].address()),
        InstructionAccount::readonly(accounts[9].address()),
        InstructionAccount::readonly(accounts[10].address()),
        InstructionAccount::writable(accounts[11].address()),
        InstructionAccount::writable(accounts[12].address()),
        InstructionAccount::writable_signer(&olay),
        InstructionAccount::readonly(accounts[13].address()),
        InstructionAccount::readonly(accounts[14].address()),
        InstructionAccount::readonly(accounts[15].address()),
        InstructionAccount::readonly(accounts[16].address()),
        InstructionAccount::readonly(accounts[17].address()),
        InstructionAccount::readonly(accounts[18].address()),
    ];
    let views = [&accounts[1], &accounts[0], &accounts[5], &accounts[3], &accounts[6], &accounts[7], &accounts[8], &accounts[9],
        &accounts[10], &accounts[11], &accounts[12], &accounts[4], &accounts[13], &accounts[14], &accounts[15], &accounts[16],
        &accounts[17], &accounts[18]];
    let ix = InstructionView { program_id: &TOKEN_MESSENGER_MINTER, accounts: &metas, data: &ix_data };
    let cb = [cfg.bump];
    let obb = [ob];
    let cs = [Seed::from(b"config"), Seed::from(&cb)];
    let os = [Seed::from(b"olay"), Seed::from(&idb), Seed::from(&obb)];
    invoke_signed_with_bounds::<18, &AccountView>(&ix, &views, &[Signer::from(&cs), Signer::from(&os)])
}

/* ---- v4: the list, the seal, the Defter re-pointed once ------------------ */

/// The seal PDA ["muhur"]: once it exists the list and the Defter are fixed.
fn muhurlu(program_id: &Address, muhur: &AccountView) -> Result<bool, ProgramError> {
    ensure(*muhur.address() == pda(&[b"muhur"], program_id).0, E_BAD_ACCOUNT)?;
    Ok(muhur.data_len() > 0 && muhur.owned_by(program_id))
}

fn yonetici(admin: &AccountView) -> ProgramResult { ensure(admin.is_signer() && *admin.address() == INITIALIZER, E_NOT_INITIALIZER) }

/// A one-byte marker PDA ["tohum"], created by `payer`; fails if it exists.
fn isaret(program_id: &Address, payer: &AccountView, a: &AccountView, tohum: &[u8]) -> ProgramResult {
    let (adr, bump) = pda(&[tohum], program_id);
    ensure(*a.address() == adr && a.data_len() == 0, E_MUHUR)?;
    let b = [bump];
    create_pda(payer, a, 1, program_id, &[Seed::from(tohum), Seed::from(&b)])?;
    let mut a2 = *a;
    write(&mut a2, 0, &[1])
}

/// Admin, before the seal: `mint` is bought and sold through Raydium CLMM
/// pool `pool` (its two tokens must be the vault's dollar and `mint`).
fn liste_ekle(program_id: &Address, accounts: &mut [AccountView]) -> ProgramResult {
    let [admin, config, liste, mint, havuz, muhur, _system, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    yonetici(&admin)?;
    ensure(!muhurlu(program_id, &muhur)?, E_MUHUR)?;
    let cfg = read_config(program_id, &config)?;
    ensure(havuz.owned_by(&RAYDIUM_CLMM), E_HAVUZ_HESAP)?;
    let h = fiyat::havuz_oku(&havuz.try_borrow()?).ok_or(err(E_HAVUZ_HESAP))?;
    let (d, m) = (*cfg.dollar_mint.as_array(), *mint.address().as_array());
    ensure((h.mint0 == d && h.mint1 == m) || (h.mint1 == d && h.mint0 == m), E_LISTE)?;
    kayit(program_id, &admin, &liste, LISTE_LEN, &[b"liste", mint.address().as_ref()])?;
    let mut l = liste;
    write(&mut l, 1, havuz.address().as_ref())
}

/// Admin, once, before the seal: the Defter (and the Arc messenger its
/// orders come through) this vault obeys. For the v4 Defter on Arc.
fn defter_degistir(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [admin, mut config, degisti, muhur, _system, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    yonetici(&admin)?;
    ensure(!muhurlu(program_id, &muhur)?, E_MUHUR)?;
    read_config(program_id, &config)?;
    isaret(program_id, &admin, &degisti, b"defter-degisti")?;
    write(&mut config, 114, addr_at(data, 0)?.as_ref())?;
    write(&mut config, 146, addr_at(data, 32)?.as_ref())
}

/// Admin: seal. After this nobody can list a pool or move the Defter.
fn muhurle(program_id: &Address, accounts: &mut [AccountView]) -> ProgramResult {
    let [admin, muhur, _system, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    yonetici(&admin)?;
    if muhurlu(program_id, &muhur)? { return Ok(()); }
    isaret(program_id, &admin, &muhur, b"muhur")
}

/* ---- v4: filling an auction from the pool ------------------------------- */

/// What the pool and its average allow now, for a swap whose input is the
/// dollar (`dolar_girer`) or the asset.
struct Sinir { havuz: fiyat::Havuz, dolar_sifir: bool, s_ort: u128, limit: u128 }

fn sinir(program_id: &Address, cfg: &Config, liste: &AccountView, mint: &Address, havuz: &AccountView, gozlem: &AccountView,
         dolar_girer: bool) -> Result<Sinir, ProgramError> {
    ensure(*liste.address() == pda(&[b"liste", mint.as_ref()], program_id).0 && liste.owned_by(program_id), E_LISTE)?;
    {
        let l = liste.try_borrow()?;
        ensure(l.len() == LISTE_LEN && l[0] == 1 && l[1..33] == *havuz.address().as_array(), E_LISTE)?;
    }
    ensure(havuz.owned_by(&RAYDIUM_CLMM) && gozlem.owned_by(&RAYDIUM_CLMM), E_HAVUZ_HESAP)?;
    let h = fiyat::havuz_oku(&havuz.try_borrow()?).ok_or(err(E_HAVUZ_HESAP))?;
    ensure(h.gozlem == *gozlem.address().as_array(), E_HAVUZ_HESAP)?;
    let (d, m) = (*cfg.dollar_mint.as_array(), *mint.as_array());
    let dolar_sifir = h.mint0 == d && h.mint1 == m;
    ensure(dolar_sifir || (h.mint1 == d && h.mint0 == m), E_LISTE)?;
    let (ort, _, _) = fiyat::twap(&gozlem.try_borrow()?, havuz.address().as_array(), PENCERE, EN_AZ_PENCERE).ok_or(err(E_TWAP))?;
    let fark = ort - h.tick;
    ensure(fark.abs() <= KAYMA_TICK, E_FIYAT)?;
    let s_ort = fiyat::tick_kaydir(h.sqrt, fark).ok_or(err(E_FIYAT))?;
    /* token0 in moves the price down, token1 in moves it up */
    let sifir_girer = dolar_girer == dolar_sifir;
    let limit = fiyat::tick_kaydir(s_ort, if sifir_girer { -KAYMA_TICK } else { KAYMA_TICK }).ok_or(err(E_FIYAT))?;
    ensure(if sifir_girer { limit < h.sqrt } else { limit > h.sqrt }, E_FIYAT)?;
    Ok(Sinir { havuz: h, dolar_sifir, s_ort, limit })
}

/// The swap's vaults, config and observation must be the pool's.
fn havuz_hesaplari(accounts: &[AccountView], s: &Sinir, dolar_girer: bool) -> ProgramResult {
    let h = &s.havuz;
    let (vd, vv) = if s.dolar_sifir { (h.vault0, h.vault1) } else { (h.vault1, h.vault0) };
    let (giris, cikis) = if dolar_girer { (vd, vv) } else { (vv, vd) };
    ensure(*accounts[13].address() == RAYDIUM_CLMM && *accounts[14].address().as_array() == h.amm_config
        && *accounts[16].address().as_array() == giris && *accounts[17].address().as_array() == cikis
        && *accounts[18].address().as_array() == h.gozlem, E_HAVUZ_HESAP)
}

/// Raydium CLMM swap, exact input, the vault's config PDA signing for its
/// depo. accounts[13..]: raydium program, amm_config, pool, input_vault,
/// output_vault, observation, tick_array, then any bitmap extension / tick
/// arrays, passed on as given.
fn raydium(accounts: &[AccountView], config: &AccountView, giris: &AccountView, cikis: &AccountView, token: &AccountView,
           miktar: u64, limit: u128, cseeds: &[Seed]) -> ProgramResult {
    const EN_COK: usize = 16;
    let a = &accounts[13..];
    if a.len() < 7 || a.len() - 7 > EN_COK - 10 { return Err(ProgramError::NotEnoughAccountKeys); }
    let ek = a.len() - 7;
    let mut veri = [0u8; 8 + 8 + 8 + 16 + 1];
    veri[..8].copy_from_slice(&RAYDIUM_SWAP);
    veri[8..16].copy_from_slice(&miktar.to_le_bytes());
    veri[24..40].copy_from_slice(&limit.to_le_bytes());
    veri[40] = 1;
    let mut metas: [InstructionAccount; EN_COK] = core::array::from_fn(|_| InstructionAccount::readonly_signer(config.address()));
    let mut views = [config; EN_COK];
    metas[1] = InstructionAccount::readonly(a[1].address()); views[1] = &a[1];
    metas[2] = InstructionAccount::writable(a[2].address()); views[2] = &a[2];
    metas[3] = InstructionAccount::writable(giris.address()); views[3] = giris;
    metas[4] = InstructionAccount::writable(cikis.address()); views[4] = cikis;
    metas[5] = InstructionAccount::writable(a[3].address()); views[5] = &a[3];
    metas[6] = InstructionAccount::writable(a[4].address()); views[6] = &a[4];
    metas[7] = InstructionAccount::writable(a[5].address()); views[7] = &a[5];
    metas[8] = InstructionAccount::readonly(token.address()); views[8] = token;
    metas[9] = InstructionAccount::writable(a[6].address()); views[9] = &a[6];
    let mut i = 0;
    while i < ek {
        let x = &a[7 + i];
        metas[10 + i] = InstructionAccount::new(x.address(), x.is_writable(), false);
        views[10 + i] = x;
        i += 1;
    }
    let ix = InstructionView { program_id: &RAYDIUM_CLMM, accounts: &metas[..10 + ek], data: &veri };
    invoke_signed_with_bounds::<EN_COK, &AccountView>(&ix, &views[..10 + ek], &[Signer::from(cseeds)])
}

/// `deger` less TOLERANS_BPS, without overflowing
fn en_az(deger: u128) -> u128 { deger / 10_000 * (10_000 - TOLERANS_BPS) + (deger % 10_000) * (10_000 - TOLERANS_BPS) / 10_000 }

/// Anyone: fill buy auction `id` (or part of it) from the listed pool.
fn takas_al(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if accounts.len() < 20 { return Err(ProgramError::NotEnoughAccountKeys); }
    let (caller, mut config, dolar, bakiye, fiyat_h, mut ihale, mint, asset_depo, dollar_depo, caller_dollar, liste, token) =
        (accounts[0], accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7], accounts[8], accounts[9], accounts[10], accounts[12]);
    ensure(caller.is_signer(), E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let id = u64_at(data, 0)?;
    let h = read_ihale(program_id, &ihale, id)?;
    ensure(!h.bitti, E_BITTI)?;
    ensure(h.tur == ALIM && *mint.address() == h.mint, E_TUR)?;
    ensure(*dollar_depo.address() == pda(&[b"depo", cfg.dollar_mint.as_ref()], program_id).0, E_BAD_ACCOUNT)?;
    ensure(*token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    ensure(token_account(&caller_dollar)?.0 == cfg.dollar_mint, E_BAD_ACCOUNT)?;
    depo(program_id, &caller, &asset_depo, &mint, config.address())?;
    let s = sinir(program_id, &cfg, &liste, mint.address(), &accounts[15], &accounts[18], true)?;
    havuz_hesaplari(accounts, &s, true)?;
    let lb = h.launch.to_le_bytes();
    kayit(program_id, &caller, &dolar, DOLAR_LEN, &[b"dolar", &lb])?;
    let t = oku64(&dolar, 9)?;
    let b = oku64(&dolar, 1)?;
    /* this auction's proportional part of what a redemption left, as an auction fill would spend */
    let harca = egri::oran(h.verilen, b, t);
    ensure(harca > BAHSIS, E_SIFIR)?;
    let cb = [cfg.bump];
    let cseeds = [Seed::from(b"config"), Seed::from(&cb)];
    let (d0, a0) = (token_account(&dollar_depo)?.2, token_account(&asset_depo)?.2);
    raydium(accounts, &config, &dollar_depo, &asset_depo, &token, harca - BAHSIS, s.limit, &cseeds)?;
    let c = d0 - token_account(&dollar_depo)?.2;
    let gelen = token_account(&asset_depo)?.2 - a0;
    ensure(c > 0 && gelen > 0, E_SIFIR)?;
    let deger = fiyat::karsilik(c, s.s_ort, s.dolar_sifir).ok_or(err(E_FIYAT))?;
    ensure(gelen as u128 >= en_az(deger), E_AZ)?;
    let bahsis = if c >= BAHSIS_ESIGI { BAHSIS } else { 0 };
    let harcanan = c + bahsis;
    /* a fill within a dollar of the whole closes the auction; the cents left stay with the launch (paid on redemption) */
    let v = if harca - harcanan < BAHSIS_ESIGI { h.verilen } else { egri::oran(harcanan, h.verilen, harca).max(1).min(h.verilen) };
    yaz64(&dolar, 9, t - v)?;
    yaz64(&dolar, 1, b - harcanan)?;
    write(&mut config, 178, &(cfg.atanmis - harcanan).to_le_bytes())?;
    if v == h.verilen {
        write(&mut ihale, 2, &[1])?;
    } else {
        write(&mut ihale, 43, &(h.verilen - v).to_le_bytes())?;
        write(&mut ihale, 51, &egri::oran(h.baslangic, h.verilen - v, h.verilen).max(1).to_le_bytes())?;
    }
    kayit(program_id, &caller, &bakiye, BAKIYE_LEN, &[b"bakiye", &lb, mint.address().as_ref()])?;
    yaz64(&bakiye, 1, oku64(&bakiye, 1)? + gelen)?;
    kayit(program_id, &caller, &fiyat_h, FIYAT_LEN, &[b"fiyat", mint.address().as_ref()])?;
    yaz64(&fiyat_h, 1, c)?;
    yaz64(&fiyat_h, 9, gelen)?;
    transfer(&dollar_depo, &caller_dollar, &config, bahsis, Some(&cseeds))
}

/// Anyone: fill sell auction `id` (or part of it) through the listed pool;
/// the dollars go to the holder as an auction fill would pay them.
fn takas_sat(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if accounts.len() < 20 { return Err(ProgramError::NotEnoughAccountKeys); }
    let (caller, mut config, fiyat_h, mut ihale, mint, asset_depo, dollar_depo, payee, mut giden, caller_dollar, liste, token) =
        (accounts[0], accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7], accounts[8], accounts[9], accounts[10], accounts[12]);
    ensure(caller.is_signer(), E_BAD_ACCOUNT)?;
    let cfg = read_config(program_id, &config)?;
    let id = u64_at(data, 0)?;
    let h = read_ihale(program_id, &ihale, id)?;
    ensure(!h.bitti, E_BITTI)?;
    ensure(h.tur == SATIM && *mint.address() == h.mint, E_TUR)?;
    ensure(*dollar_depo.address() == pda(&[b"depo", cfg.dollar_mint.as_ref()], program_id).0, E_BAD_ACCOUNT)?;
    ensure(*asset_depo.address() == pda(&[b"depo", mint.address().as_ref()], program_id).0, E_BAD_ACCOUNT)?;
    ensure(*token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    ensure(token_account(&caller_dollar)?.0 == cfg.dollar_mint, E_BAD_ACCOUNT)?;
    if h.hz == cfg.domain { ensure(*payee.address() == ata(&h.alici, &cfg.dollar_mint), E_BAD_ACCOUNT)?; }
    let s = sinir(program_id, &cfg, &liste, mint.address(), &accounts[15], &accounts[18], false)?;
    havuz_hesaplari(accounts, &s, false)?;
    let cb = [cfg.bump];
    let cseeds = [Seed::from(b"config"), Seed::from(&cb)];
    let (a0, d0) = (token_account(&asset_depo)?.2, token_account(&dollar_depo)?.2);
    raydium(accounts, &config, &asset_depo, &dollar_depo, &token, h.verilen, s.limit, &cseeds)?;
    let c = a0 - token_account(&asset_depo)?.2;
    let gelen = token_account(&dollar_depo)?.2 - d0;
    ensure(c > 0 && gelen > 0 && c <= h.verilen, E_SIFIR)?;
    let deger = fiyat::karsilik(c, s.s_ort, !s.dolar_sifir).ok_or(err(E_FIYAT))?;
    ensure(gelen as u128 >= en_az(deger), E_AZ)?;
    let bahsis = if gelen >= BAHSIS_ESIGI + BAHSIS { BAHSIS } else { 0 };
    let pay = gelen - bahsis;
    if c == h.verilen {
        write(&mut ihale, 2, &[1])?;
    } else {
        write(&mut ihale, 43, &(h.verilen - c).to_le_bytes())?;
        write(&mut ihale, 51, &egri::oran(h.baslangic, h.verilen - c, h.verilen).max(1).to_le_bytes())?;
    }
    kayit(program_id, &caller, &fiyat_h, FIYAT_LEN, &[b"fiyat", mint.address().as_ref()])?;
    yaz64(&fiyat_h, 1, gelen)?;
    yaz64(&fiyat_h, 9, c)?;
    transfer(&dollar_depo, &caller_dollar, &config, bahsis, Some(&cseeds))?;
    if h.hz == cfg.domain {
        return transfer(&dollar_depo, &payee, &config, pay, Some(&cseeds));
    }
    /* another chain: booked to a Giden PDA, burned there by GidenGonder */
    write(&mut config, 178, &(cfg.atanmis + pay).to_le_bytes())?;
    giden_kaydet(program_id, &caller, &mut config, &mut giden, h.hz, &h.alici, pay)
}
