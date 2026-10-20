//! ARC PULSE gate on Solana: one LayerZero OApp (pinocchio).
//!
//! The OApp is the store PDA ["Store"], registered with the LayerZero
//! endpoint at Initialize. It listens to exactly two senders on Arc, both
//! fixed at Initialize:
//!   - the IkizHub (launch-token twins), arastirma/sepet-v2-tasarim.md:
//!       YARAT abi.encode(uint8 1, address token, string ad, string sembol)
//!             -> the twin mint PDA ["ikiz", token], 6 decimals, mint
//!                authority the store, no freeze authority, Metaplex
//!                metadata (immutable); a second YARAT changes nothing
//!       TASI  abi.encode(uint8 2, address token, bytes32 alici, uint256 miktar)
//!             -> `miktar` twins minted to the recipient's associated account
//!   - the HaberciLZ (basket orders): the body goes as it is to the basket
//!     vault (solana/pulse-sepet `LzEmir`), this store signing as its emirci.
//! Back to Arc, anyone (`Gonder`): the holder's twins are burned and the hub
//! releases as many, or carries out the order `istek` with them:
//!       abi.encode(uint8 2, address token, bytes32 alici, uint256 miktar, bytes istek)
//! Amounts are the hub's 6 shared decimals, one to one with the twin.
//!
//! LayerZero's executor finds what to pass to `lz_receive` by simulating
//! `lz_receive_types` with the accounts listed in the PDA
//! ["LzReceiveTypes", store] (the store and the basket vault's config), as
//! LayerZero's OFT does. `lz_receive` clears the message at the endpoint
//! first (the store signs), so a message is carried out once; one that
//! fails (a TASI before its YARAT) stays at the endpoint and anyone retries it.
//!
//! PDAs
//!   ["Store"]                   tag, bump, admin, arc_eid u32, hub, haberci, sepet program, sepet config,
//!                               options_len u16, options [64], kilitli u8
//!   ["LzReceiveTypes", store]   8-byte discriminator, store, sepet config
//!   ["ikiz", token 20]          the twin mint
//!   ["Alt"]                     tag, the address lookup table of the fixed accounts, bump (AltKur, once)
//!
//! Instructions
//!   0 Initialize [admin s w, store w, lz_receive_types w, system, endpoint, oapp_registry w, endpoint_event_authority]
//!                data: arc_eid u32, hub 32, haberci 32, sepet program 32, options_len u16, options
//!   1 Kilitle    [admin s, store w, endpoint, oapp_registry w, endpoint_event_authority]
//!                the endpoint delegate becomes the incinerator and the admin is cleared: nothing can be changed again
//!   2 Gonder     [user s w, store, mint w, user_token w, token, then the endpoint's `send` accounts as LayerZero's
//!                 OFT takes them: endpoint program, store, send library program, ... (from LayerZero's SDK)]
//!                data: token 20, alici 32, miktar u64, native_fee u64, istek_len u32, istek
//!   3 AltKur     [admin s w, store, alt PDA w, the lookup table, system]: once, before Kilitle; the table must
//!                hold `sabitler` in order and be frozen
//!   lz_receive_types (v1) / lz_receive_types_info + lz_receive_types_v2 (v2, with the lookup table) /
//!   lz_receive (Anchor discriminators), lz_receive accounts:
//!     0 payer (the executor) s w, 1 store, 2..10 the endpoint's `clear` accounts
//!     (endpoint, store, oapp_registry, nonce w, payload_hash w, endpoint settings w, event_authority, endpoint),
//!     then by message:
//!       YARAT  mint w, metadata w, token metadata program, system, token
//!       TASI   mint w, owner, owner's ATA w, token, associated token program, system
//!       order  sepet program, sepet config w, emir w, system
use crate::abi::{self, Alis};
use alloc::vec::Vec;
use pinocchio::{
    cpi::{invoke_signed_with_slice, set_return_data, Seed, Signer},
    error::ProgramError,
    instruction::{InstructionAccount, InstructionView},
    sysvars::{rent::Rent, Sysvar},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::CreateAccount;
use pinocchio_token::instructions::{Burn, InitializeMint2, MintTo};

/// the deployer key allowed to send Initialize, once
#[cfg(not(feature = "local-test"))]
pub const INITIALIZER: Address = Address::from_str_const("5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh");
/// local tests only (pulse-swap/e2e/test-admin.json, never on any network)
#[cfg(feature = "local-test")]
pub const INITIALIZER: Address = Address::from_str_const("21cwJQt3XrXk861zDhUzUvAq6PTzradj9ujhf9A3euZA");
pub const ENDPOINT: Address = Address::from_str_const("76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6");
pub const TOKEN_PROGRAM: Address = Address::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const ATA_PROGRAM: Address = Address::from_str_const("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const SYSTEM_PROGRAM: Address = Address::from_str_const("11111111111111111111111111111111");
pub const TOKEN_METADATA_PROGRAM: Address = Address::from_str_const("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
/// where the endpoint delegate goes at Kilitle: a key nobody holds
pub const INSTRUCTIONS_SYSVAR: Address = Address::from_str_const("Sysvar1nstructions1111111111111111111111111");
pub const ALT_PROGRAM: Address = Address::from_str_const("AddressLookupTab1e1111111111111111111111111");
pub const INCINERATOR: Address = Address::from_str_const("1nc1nerator11111111111111111111111111111111");

const LZ_RECEIVE: [u8; 8] = [8, 179, 120, 109, 33, 118, 189, 80];
const LZ_RECEIVE_TYPES: [u8; 8] = [221, 17, 246, 159, 248, 128, 31, 96];
const LZ_RECEIVE_TYPES_ACCOUNTS: [u8; 8] = [248, 87, 167, 117, 5, 251, 21, 126];
const LZ_RECEIVE_TYPES_INFO: [u8; 8] = [43, 148, 213, 93, 101, 127, 37, 170];
const LZ_RECEIVE_TYPES_V2: [u8; 8] = [109, 157, 200, 142, 138, 223, 159, 164];
/// the executor's execution context version (lz-solana-sdk-v2 3.0.168 uses 1)
const CONTEXT_VERSION: u8 = 1;
const CLEAR: [u8; 8] = [250, 39, 28, 213, 123, 163, 133, 5];
const SEND: [u8; 8] = [102, 251, 20, 187, 65, 75, 12, 69];
const REGISTER_OAPP: [u8; 8] = [129, 89, 71, 68, 11, 82, 210, 125];
const SET_DELEGATE: [u8; 8] = [242, 30, 46, 76, 108, 235, 128, 181];
/// pulse-sepet's instruction for an order from this gate
const SEPET_LZ_EMIR: u8 = 9;

const STORE_LEN: usize = 1 + 1 + 32 + 4 + 32 * 4 + 2 + 64 + 1;
const LRT_LEN: usize = 8 + 32 + 32;
const MINT_LEN: usize = 82;
const MAX_OPTIONS: usize = 64;
const ALT_LEN: usize = 1 + 32 + 1;
const ALT_SAYI: usize = 14;

const E_ALREADY: u32 = 1;
const E_NOT_INITIALIZER: u32 = 2;
const E_BAD_ACCOUNT: u32 = 3;
const E_BAD_DATA: u32 = 4;
const E_NOT_PEER: u32 = 5;
const E_NOT_ADMIN: u32 = 6;
const E_ZERO: u32 = 7;
const E_KILITLI: u32 = 8;

fn err(c: u32) -> ProgramError { ProgramError::Custom(c) }
fn ensure(c: bool, code: u32) -> ProgramResult { if c { Ok(()) } else { Err(err(code)) } }
fn pda(seeds: &[&[u8]], program_id: &Address) -> (Address, u8) { Address::find_program_address(seeds, program_id) }
fn adr(b: &[u8]) -> Result<Address, ProgramError> {
    let a: [u8; 32] = b.get(..32).ok_or(err(E_BAD_DATA))?.try_into().map_err(|_| err(E_BAD_DATA))?;
    Ok(Address::new_from_array(a))
}
fn ata(owner: &Address, mint: &Address) -> Address {
    Address::find_program_address(&[owner.as_ref(), TOKEN_PROGRAM.as_ref(), mint.as_ref()], &ATA_PROGRAM).0
}
fn write(a: &AccountView, at: usize, bytes: &[u8]) -> ProgramResult {
    let mut a2 = *a;
    a2.try_borrow_mut()?[at..at + bytes.len()].copy_from_slice(bytes);
    Ok(())
}
fn create_pda(payer: &AccountView, new: &AccountView, space: usize, owner: &Address, seeds: &[Seed]) -> ProgramResult {
    let need = Rent::get()?.try_minimum_balance(space)?;
    ensure(new.lamports() == 0, E_BAD_ACCOUNT)?;
    CreateAccount { from: payer, to: new, lamports: need, space: space as u64, owner }.invoke_signed(&[Signer::from(seeds)])
}
fn endpoint_pda(seeds: &[&[u8]]) -> Address { pda(seeds, &ENDPOINT).0 }

struct Store { bump: u8, admin: Address, arc_eid: u32, hub: [u8; 32], haberci: [u8; 32], sepet: Address, sepet_config: Address,
    options: Vec<u8>, kilitli: bool }

fn read_store(program_id: &Address, a: &AccountView) -> Result<Store, ProgramError> {
    ensure(a.owned_by(program_id) && *a.address() == pda(&[b"Store"], program_id).0, E_BAD_ACCOUNT)?;
    let d = a.try_borrow()?;
    ensure(d.len() == STORE_LEN && d[0] == 1, E_BAD_ACCOUNT)?;
    let n = u16::from_le_bytes([d[166], d[167]]) as usize;
    Ok(Store { bump: d[1], admin: adr(&d[2..])?, arc_eid: u32::from_le_bytes(d[34..38].try_into().unwrap()),
        hub: d[38..70].try_into().unwrap(), haberci: d[70..102].try_into().unwrap(), sepet: adr(&d[102..])?, sepet_config: adr(&d[134..])?,
        options: d[168..168 + n.min(MAX_OPTIONS)].to_vec(), kilitli: d[232] != 0 })
}

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() >= 8 && data[..8] == LZ_RECEIVE_TYPES { return lz_receive_types(program_id, accounts, &data[8..]); }
    if data.len() >= 8 && data[..8] == LZ_RECEIVE { return lz_receive(program_id, accounts, &data[8..]); }
    if data.len() >= 8 && data[..8] == LZ_RECEIVE_TYPES_INFO { return lz_receive_types_info(program_id, accounts); }
    if data.len() >= 8 && data[..8] == LZ_RECEIVE_TYPES_V2 { return lz_receive_types_v2(program_id, accounts, &data[8..]); }
    let (tag, rest) = data.split_first().ok_or(err(E_BAD_DATA))?;
    match tag {
        0 => initialize(program_id, accounts, rest),
        1 => kilitle(program_id, accounts),
        2 => gonder(program_id, accounts, rest),
        3 => alt_kur(program_id, accounts),
        _ => Err(err(E_BAD_DATA)),
    }
}

/* ---- set once ------------------------------------------------------------ */

fn initialize(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [admin, store, lrt, system, endpoint, registry, ep_events, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(admin.is_signer() && *admin.address() == INITIALIZER, E_NOT_INITIALIZER)?;
    ensure(store.data_len() == 0, E_ALREADY)?;
    ensure(*endpoint.address() == ENDPOINT, E_BAD_ACCOUNT)?;
    let (sp, sb) = pda(&[b"Store"], program_id);
    ensure(*store.address() == sp, E_BAD_ACCOUNT)?;
    let (lp, lb) = pda(&[b"LzReceiveTypes", sp.as_ref()], program_id);
    ensure(*lrt.address() == lp, E_BAD_ACCOUNT)?;
    let arc_eid = u32::from_le_bytes(data.get(0..4).ok_or(err(E_BAD_DATA))?.try_into().unwrap());
    let peers = data.get(4..100).ok_or(err(E_BAD_DATA))?;
    let sepet = adr(&data[68..])?;
    let n = u16::from_le_bytes(data.get(100..102).ok_or(err(E_BAD_DATA))?.try_into().unwrap()) as usize;
    let options = data.get(102..102 + n).ok_or(err(E_BAD_DATA))?;
    ensure(n <= MAX_OPTIONS && n >= 2 && options[..2] == [0, 3], E_BAD_DATA)?;   // type 3 options
    let sepet_config = pda(&[b"config"], &sepet).0;

    let sbs = [sb];
    let sseeds = [Seed::from(b"Store"), Seed::from(&sbs)];
    create_pda(&admin, &store, STORE_LEN, program_id, &sseeds)?;
    let mut d = [0u8; STORE_LEN];
    d[0] = 1;
    d[1] = sb;
    d[2..34].copy_from_slice(admin.address().as_ref());
    d[34..38].copy_from_slice(&arc_eid.to_le_bytes());
    d[38..134].copy_from_slice(peers);
    d[134..166].copy_from_slice(sepet_config.as_ref());
    d[166..168].copy_from_slice(&(n as u16).to_le_bytes());
    d[168..168 + n].copy_from_slice(options);
    write(&store, 0, &d)?;

    let lbs = [lb];
    create_pda(&admin, &lrt, LRT_LEN, program_id, &[Seed::from(b"LzReceiveTypes"), Seed::from(sp.as_ref()), Seed::from(&lbs)])?;
    let mut l = [0u8; LRT_LEN];
    l[..8].copy_from_slice(&LZ_RECEIVE_TYPES_ACCOUNTS);
    l[8..40].copy_from_slice(sp.as_ref());
    l[40..72].copy_from_slice(sepet_config.as_ref());
    write(&lrt, 0, &l)?;

    /* the store becomes an OApp at the endpoint; the admin is its delegate until Kilitle */
    ensure(*registry.address() == endpoint_pda(&[b"OApp", sp.as_ref()]) && *ep_events.address() == endpoint_pda(&[b"__event_authority"]), E_BAD_ACCOUNT)?;
    let mut v = REGISTER_OAPP.to_vec();
    v.extend_from_slice(admin.address().as_ref());
    let metas = [
        InstructionAccount::writable_signer(admin.address()), InstructionAccount::readonly_signer(store.address()),
        InstructionAccount::writable(registry.address()), InstructionAccount::readonly(system.address()),
        InstructionAccount::readonly(ep_events.address()), InstructionAccount::readonly(endpoint.address()),
    ];
    let ix = InstructionView { program_id: &ENDPOINT, data: &v, accounts: &metas };
    invoke_signed_with_slice(&ix, &[admin, store, registry, system, ep_events, endpoint], &[Signer::from(&sseeds)])
}

fn kilitle(program_id: &Address, accounts: &mut [AccountView]) -> ProgramResult {
    let [admin, store, endpoint, registry, ep_events, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let s = read_store(program_id, &store)?;
    ensure(!s.kilitli, E_KILITLI)?;
    ensure(admin.is_signer() && *admin.address() == s.admin, E_NOT_ADMIN)?;
    ensure(*endpoint.address() == ENDPOINT, E_BAD_ACCOUNT)?;
    let bs = [s.bump];
    let sseeds = [Seed::from(b"Store"), Seed::from(&bs)];
    let mut v = SET_DELEGATE.to_vec();
    v.extend_from_slice(INCINERATOR.as_ref());
    let metas = [
        InstructionAccount::readonly_signer(store.address()), InstructionAccount::writable(registry.address()),
        InstructionAccount::readonly(ep_events.address()), InstructionAccount::readonly(endpoint.address()),
    ];
    let ix = InstructionView { program_id: &ENDPOINT, data: &v, accounts: &metas };
    invoke_signed_with_slice(&ix, &[store, registry, ep_events, endpoint], &[Signer::from(&sseeds)])?;
    write(&store, 2, &[0u8; 32])?;
    write(&store, 232, &[1])
}

/* ---- in: from Arc -------------------------------------------------------- */

#[derive(PartialEq)]
enum Tur { Yarat([u8; 20]), Tasi([u8; 20], [u8; 32], u64), Emir, Yabanci }

fn tur(s: &Store, a: &Alis) -> Tur {
    if a.src_eid != s.arc_eid { return Tur::Yabanci; }
    if a.sender == s.hub {
        if let Some((t, _, _)) = abi::yarat(a.message) { return Tur::Yarat(t); }
        if let Some((t, al, m)) = abi::tasi(a.message) { return Tur::Tasi(t, al, m); }
        return Tur::Yabanci;
    }
    if a.sender == s.haberci { return Tur::Emir; }
    Tur::Yabanci
}

fn ikiz_pda(program_id: &Address, token: &[u8; 20]) -> (Address, u8) { pda(&[b"ikiz", token], program_id) }

/// The accounts `lz_receive` needs for this message, in its order:
/// (address, signer, writable); the zero key as signer is the executor (payer).
fn alis_hesaplari(program_id: &Address, s: &Store, store: &Address, sepet_config: &AccountView, a: &Alis) -> Result<Vec<(Address, bool, bool)>, ProgramError> {
    let src = a.src_eid.to_be_bytes();
    let nonce = a.nonce.to_be_bytes();
    let mut v: Vec<(Address, bool, bool)> = Vec::with_capacity(20);
    v.push((Address::default(), true, true));
    v.push((*store, false, false));
    /* the endpoint's clear */
    v.push((ENDPOINT, false, false));
    v.push((*store, false, false));
    v.push((endpoint_pda(&[b"OApp", store.as_ref()]), false, false));
    v.push((endpoint_pda(&[b"Nonce", store.as_ref(), &src, &a.sender]), false, true));
    v.push((endpoint_pda(&[b"PayloadHash", store.as_ref(), &src, &a.sender, &nonce]), false, true));
    v.push((endpoint_pda(&[b"Endpoint"]), false, true));
    v.push((endpoint_pda(&[b"__event_authority"]), false, false));
    v.push((ENDPOINT, false, false));
    match tur(s, a) {
        Tur::Yarat(t) => {
            let m = ikiz_pda(program_id, &t).0;
            v.push((m, false, true));
            v.push((pda(&[b"metadata", TOKEN_METADATA_PROGRAM.as_ref(), m.as_ref()], &TOKEN_METADATA_PROGRAM).0, false, true));
            v.push((TOKEN_METADATA_PROGRAM, false, false));
            v.push((SYSTEM_PROGRAM, false, false));
            v.push((TOKEN_PROGRAM, false, false));
        }
        Tur::Tasi(t, al, _) => {
            let m = ikiz_pda(program_id, &t).0;
            let sahip = Address::new_from_array(al);
            v.push((m, false, true));
            v.push((sahip, false, false));
            v.push((ata(&sahip, &m), false, true));
            v.push((TOKEN_PROGRAM, false, false));
            v.push((ATA_PROGRAM, false, false));
            v.push((SYSTEM_PROGRAM, false, false));
        }
        Tur::Emir => {
            let d = sepet_config.try_borrow()?;
            let id = u64::from_le_bytes(d.get(186..194).ok_or(err(E_BAD_ACCOUNT))?.try_into().unwrap());
            drop(d);
            v.push((s.sepet, false, false));
            v.push((s.sepet_config, false, true));
            v.push((pda(&[b"emir", &id.to_le_bytes()], &s.sepet).0, false, true));
            v.push((SYSTEM_PROGRAM, false, false));
        }
        Tur::Yabanci => {}
    }
    Ok(v)
}

/// The fixed accounts of every delivery, in the order the gate's address
/// lookup table must hold them (checked at AltKur): with the table, a
/// delivery fits Solana's 1232-byte transaction whatever the message.
fn sabitler(s: &Store, store: &Address) -> [Address; ALT_SAYI] {
    let arc = s.arc_eid.to_be_bytes();
    [ENDPOINT, *store, endpoint_pda(&[b"OApp", store.as_ref()]), endpoint_pda(&[b"Endpoint"]), endpoint_pda(&[b"__event_authority"]),
        endpoint_pda(&[b"Nonce", store.as_ref(), &arc, &s.hub]), endpoint_pda(&[b"Nonce", store.as_ref(), &arc, &s.haberci]),
        TOKEN_PROGRAM, ATA_PROGRAM, SYSTEM_PROGRAM, TOKEN_METADATA_PROGRAM, s.sepet, s.sepet_config,
        /* not ours: the instructions sysvar the executor's pre/post_execute take, so it loads from the table too */
        INSTRUCTIONS_SYSVAR]
}

/// v1, the executor's simulation: Vec<LzAccount> (pubkey, is_signer, is_writable).
fn lz_receive_types(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [store, sepet_config, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let s = read_store(program_id, &store)?;
    ensure(*sepet_config.address() == s.sepet_config, E_BAD_ACCOUNT)?;
    let a = abi::alis(data).ok_or(err(E_BAD_DATA))?;
    let h = alis_hesaplari(program_id, &s, store.address(), &sepet_config, &a)?;
    let mut v: Vec<u8> = Vec::with_capacity(4 + h.len() * 34);
    v.extend_from_slice(&(h.len() as u32).to_le_bytes());
    for (x, sg, wr) in h.iter() { abi::hesap(&mut v, x.as_array(), *sg, *wr); }
    set_return_data(&v);
    Ok(())
}

/// v2, step 1 (accounts: store, the LzReceiveTypes PDA): version 2 and the
/// accounts lz_receive_types_v2 takes: the store, the basket vault's config,
/// the PDA that names the lookup table.
fn lz_receive_types_info(program_id: &Address, accounts: &mut [AccountView]) -> ProgramResult {
    let [store, lrt, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let s = read_store(program_id, &store)?;
    ensure(*lrt.address() == pda(&[b"LzReceiveTypes", store.address().as_ref()], program_id).0, E_BAD_ACCOUNT)?;
    let mut v: Vec<u8> = Vec::with_capacity(1 + 4 + 3 * 32);
    v.push(2);
    v.extend_from_slice(&3u32.to_le_bytes());
    v.extend_from_slice(store.address().as_ref());
    v.extend_from_slice(s.sepet_config.as_ref());
    v.extend_from_slice(pda(&[b"Alt"], program_id).0.as_ref());
    set_return_data(&v);
    Ok(())
}

/// v2, step 2: LzReceiveTypesV2Result (borsh): context_version u8, alts
/// Vec<Pubkey>, instructions Vec<Instruction>; one LzReceive instruction with
/// the same accounts as v1, each an AccountMetaRef (AddressLocator, is_writable):
/// the payer as Payer (2), the table's accounts as AltIndex (1, table, index),
/// the rest as Address (0, pubkey).
fn lz_receive_types_v2(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [store, sepet_config, alt, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let s = read_store(program_id, &store)?;
    ensure(*sepet_config.address() == s.sepet_config && *alt.address() == pda(&[b"Alt"], program_id).0, E_BAD_ACCOUNT)?;
    let a = abi::alis(data).ok_or(err(E_BAD_DATA))?;
    let h = alis_hesaplari(program_id, &s, store.address(), &sepet_config, &a)?;
    let tablo = if alt.data_len() == ALT_LEN && alt.owned_by(program_id) { Some(adr(&alt.try_borrow()?[1..])?) } else { None };
    let sabit = sabitler(&s, store.address());
    let mut v: Vec<u8> = Vec::with_capacity(16 + h.len() * 34);
    v.push(CONTEXT_VERSION);
    match tablo {
        Some(t) => { v.extend_from_slice(&1u32.to_le_bytes()); v.extend_from_slice(t.as_ref()); }
        None => v.extend_from_slice(&0u32.to_le_bytes()),
    }
    v.extend_from_slice(&1u32.to_le_bytes());
    v.push(0);   // Instruction::LzReceive
    v.extend_from_slice(&(h.len() as u32).to_le_bytes());
    for (x, sg, wr) in h.iter() {
        if *sg && *x == Address::default() {
            v.push(2);
        } else if let (Some(_), Some(i)) = (tablo, sabit.iter().position(|y| y == x)) {
            v.push(1); v.push(0); v.push(i as u8);
        } else {
            v.push(0); v.extend_from_slice(x.as_ref());
        }
        v.push(*wr as u8);
    }
    set_return_data(&v);
    Ok(())
}

/// Once, by the admin before Kilitle: the lookup table. It must hold exactly
/// `sabitler`, in order, and be frozen (no authority: no one can change or close it).
fn alt_kur(program_id: &Address, accounts: &mut [AccountView]) -> ProgramResult {
    let [admin, store, alt, tablo, _system, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let s = read_store(program_id, &store)?;
    ensure(!s.kilitli, E_KILITLI)?;
    ensure(admin.is_signer() && *admin.address() == s.admin, E_NOT_ADMIN)?;
    let (ap, ab) = pda(&[b"Alt"], program_id);
    ensure(*alt.address() == ap && alt.data_len() == 0, E_ALREADY)?;
    ensure(tablo.owned_by(&ALT_PROGRAM), E_BAD_ACCOUNT)?;
    {
        let d = tablo.try_borrow()?;
        let sabit = sabitler(&s, store.address());
        /* LookupTableMeta: type u32 = 1, deactivation_slot u64 = MAX (active), ..., authority Option at 21 = None (frozen) */
        ensure(d.len() == 56 + 32 * ALT_SAYI && d[0..4] == [1, 0, 0, 0] && d[4..12] == [0xff; 8] && d[21] == 0, E_BAD_ACCOUNT)?;
        for (i, x) in sabit.iter().enumerate() { ensure(d[56 + 32 * i..88 + 32 * i] == *x.as_ref(), E_BAD_ACCOUNT)?; }
    }
    let abs = [ab];
    create_pda(&admin, &alt, ALT_LEN, program_id, &[Seed::from(b"Alt"), Seed::from(&abs)])?;
    let mut d = [0u8; ALT_LEN];
    d[0] = 1;
    d[1..33].copy_from_slice(tablo.address().as_ref());
    d[33] = ab;
    write(&alt, 0, &d)
}

/// The executor's call (or anyone's): clear the message at the endpoint, then carry it out.
fn lz_receive(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    ensure(accounts.len() >= 10, E_BAD_ACCOUNT)?;
    let payer = accounts[0];
    let store = accounts[1];
    let s = read_store(program_id, &store)?;
    let a = abi::alis(data).ok_or(err(E_BAD_DATA))?;
    let t = tur(&s, &a);
    ensure(t != Tur::Yabanci, E_NOT_PEER)?;
    ensure(*accounts[2].address() == ENDPOINT && *accounts[3].address() == *store.address(), E_BAD_ACCOUNT)?;
    let bs = [s.bump];
    let sseeds = [Seed::from(b"Store"), Seed::from(&bs)];

    /* clear: [signer = store, oapp_registry, nonce w, payload_hash w, endpoint w, event_authority, program] */
    let c = &accounts[3..10];
    let cd = abi::clear_verisi(&CLEAR, store.address().as_array(), &a);
    let metas = [
        InstructionAccount::readonly_signer(c[0].address()), InstructionAccount::readonly(c[1].address()),
        InstructionAccount::writable(c[2].address()), InstructionAccount::writable(c[3].address()),
        InstructionAccount::writable(c[4].address()), InstructionAccount::readonly(c[5].address()),
        InstructionAccount::readonly(c[6].address()),
    ];
    let ix = InstructionView { program_id: &ENDPOINT, data: &cd, accounts: &metas };
    invoke_signed_with_slice(&ix, c, &[Signer::from(&sseeds)])?;

    let r = &accounts[10..];
    match t {
        Tur::Yarat(tk) => yarat(program_id, &payer, &store, &sseeds, r, &tk, a.message),
        Tur::Tasi(tk, al, m) => tasi(program_id, &payer, &store, &sseeds, r, &tk, &al, m),
        Tur::Emir => emir(&s, &payer, &store, &sseeds, r, a.message),
        Tur::Yabanci => Err(err(E_NOT_PEER)),
    }
}

/// The twin mint (once) and its Metaplex metadata, immutable.
fn yarat(program_id: &Address, payer: &AccountView, store: &AccountView, sseeds: &[Seed], r: &[AccountView], tk: &[u8; 20], m: &[u8]) -> ProgramResult {
    let [mint, md, mpl, system, _token, ..] = *r else { return Err(ProgramError::NotEnoughAccountKeys) };
    let (mp, mb) = ikiz_pda(program_id, tk);
    ensure(*mint.address() == mp && *mpl.address() == TOKEN_METADATA_PROGRAM, E_BAD_ACCOUNT)?;
    if mint.data_len() > 0 { return Ok(()); }   // a repeat changes nothing
    let (_, ad, sembol) = abi::yarat(m).ok_or(err(E_BAD_DATA))?;
    let mbs = [mb];
    create_pda(payer, &mint, MINT_LEN, &TOKEN_PROGRAM, &[Seed::from(b"ikiz"), Seed::from(tk), Seed::from(&mbs)])?;
    InitializeMint2::new(&mint, 6, store.address(), None).invoke()?;
    ensure(*md.address() == pda(&[b"metadata", TOKEN_METADATA_PROGRAM.as_ref(), mp.as_ref()], &TOKEN_METADATA_PROGRAM).0, E_BAD_ACCOUNT)?;
    // CreateMetadataAccountV3 (33): DataV2 { name, symbol, uri "", 0 bps, no creators/collection/uses }, immutable, no details
    let mut v = Vec::with_capacity(64);
    v.push(33);
    for s in [&ad[..], &sembol[..], &[][..]] { v.extend_from_slice(&(s.len() as u32).to_le_bytes()); v.extend_from_slice(s); }
    v.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0]);
    let metas = [
        InstructionAccount::writable(md.address()), InstructionAccount::readonly(mint.address()),
        InstructionAccount::readonly_signer(store.address()), InstructionAccount::writable_signer(payer.address()),
        InstructionAccount::readonly_signer(store.address()), InstructionAccount::readonly(system.address()),
    ];
    let ix = InstructionView { program_id: &TOKEN_METADATA_PROGRAM, data: &v, accounts: &metas };
    invoke_signed_with_slice(&ix, &[md, mint, *store, *payer, *store, system], &[Signer::from(sseeds)])
}

/// `miktar` twins to the recipient's associated account (created if missing).
fn tasi(program_id: &Address, payer: &AccountView, store: &AccountView, sseeds: &[Seed], r: &[AccountView], tk: &[u8; 20], al: &[u8; 32], miktar: u64) -> ProgramResult {
    let [mint, sahip, hesap, token, ata_prog, system, ..] = *r else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(*mint.address() == ikiz_pda(program_id, tk).0 && mint.owned_by(&TOKEN_PROGRAM), E_BAD_ACCOUNT)?;
    ensure(*sahip.address().as_array() == *al && *hesap.address() == ata(sahip.address(), mint.address()), E_BAD_ACCOUNT)?;
    ensure(*ata_prog.address() == ATA_PROGRAM && *token.address() == TOKEN_PROGRAM, E_BAD_ACCOUNT)?;
    if hesap.data_len() == 0 {
        let metas = [
            InstructionAccount::writable_signer(payer.address()), InstructionAccount::writable(hesap.address()),
            InstructionAccount::readonly(sahip.address()), InstructionAccount::readonly(mint.address()),
            InstructionAccount::readonly(system.address()), InstructionAccount::readonly(token.address()),
        ];
        let ix = InstructionView { program_id: &ATA_PROGRAM, data: &[1], accounts: &metas };   // CreateIdempotent
        invoke_signed_with_slice(&ix, &[*payer, hesap, sahip, mint, system, token], &[])?;
    }
    MintTo::<&AccountView>::new(&mint, &hesap, store, miktar).invoke_signed(&[Signer::from(sseeds)])
}

/// A basket order, handed to the vault as it came; the store signs as its emirci.
fn emir(s: &Store, payer: &AccountView, store: &AccountView, sseeds: &[Seed], r: &[AccountView], m: &[u8]) -> ProgramResult {
    let [sepet, config, emir, system, ..] = *r else { return Err(ProgramError::NotEnoughAccountKeys) };
    ensure(*sepet.address() == s.sepet && *config.address() == s.sepet_config, E_BAD_ACCOUNT)?;
    let mut v = Vec::with_capacity(1 + m.len());
    v.push(SEPET_LZ_EMIR);
    v.extend_from_slice(m);
    let metas = [
        InstructionAccount::readonly_signer(store.address()), InstructionAccount::writable(config.address()),
        InstructionAccount::writable(emir.address()), InstructionAccount::writable_signer(payer.address()),
        InstructionAccount::readonly(system.address()),
    ];
    let ix = InstructionView { program_id: &s.sepet, data: &v, accounts: &metas };
    invoke_signed_with_slice(&ix, &[*store, config, emir, *payer, system], &[Signer::from(sseeds)])
}

/* ---- out: back to Arc ------------------------------------------------------ */

/// Anyone: burn `miktar` twins of `token` and send them to the Arc hub.
fn gonder(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    ensure(accounts.len() >= 7, E_BAD_ACCOUNT)?;
    let [user, store, mint, user_token, _token, ..] = *accounts else { return Err(ProgramError::NotEnoughAccountKeys) };
    let s = read_store(program_id, &store)?;
    ensure(user.is_signer(), E_BAD_ACCOUNT)?;
    let tk: [u8; 20] = data.get(0..20).ok_or(err(E_BAD_DATA))?.try_into().unwrap();
    let al: [u8; 32] = data.get(20..52).ok_or(err(E_BAD_DATA))?.try_into().unwrap();
    let miktar = u64::from_le_bytes(data.get(52..60).ok_or(err(E_BAD_DATA))?.try_into().unwrap());
    let ucret = u64::from_le_bytes(data.get(60..68).ok_or(err(E_BAD_DATA))?.try_into().unwrap());
    let n = u32::from_le_bytes(data.get(68..72).ok_or(err(E_BAD_DATA))?.try_into().unwrap()) as usize;
    let istek = data.get(72..72 + n).ok_or(err(E_BAD_DATA))?;
    ensure(miktar > 0 && al != [0u8; 32], E_ZERO)?;
    ensure(*mint.address() == ikiz_pda(program_id, &tk).0, E_BAD_ACCOUNT)?;
    Burn::<&AccountView>::new(&user_token, &mint, &user, miktar).invoke()?;

    /* the endpoint's send, accounts from the client: [endpoint program, store (sender), ...] */
    let rest = &accounts[5..];
    ensure(*rest[0].address() == ENDPOINT && *rest[1].address() == *store.address(), E_BAD_ACCOUNT)?;
    let mesaj = abi::giden(&tk, &al, miktar, istek);
    let v = abi::send_verisi(&SEND, s.arc_eid, &s.hub, &mesaj, &s.options, ucret);
    let hesaplar = &rest[1..];
    let metas: Vec<InstructionAccount> = hesaplar.iter()
        .map(|x| InstructionAccount::new(x.address(), x.is_writable(), x.is_signer() || x.address() == store.address()))
        .collect();
    let ix = InstructionView { program_id: &ENDPOINT, data: &v, accounts: &metas };
    let bs = [s.bump];
    invoke_signed_with_slice(&ix, hesaplar, &[Signer::from(&[Seed::from(b"Store"), Seed::from(&bs)])])
}
