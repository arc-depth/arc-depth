//! Test stand-in for the LayerZero endpoint on Solana, loaded at its real
//! program id in LiteSVM, for what the real one cannot do here: `send`
//! needs a message library, an executor and DVNs. It checks what an OApp
//! must get right and records what it sends:
//!   send   (Anchor discriminator): the sender (account 0) must sign; the
//!          whole instruction data is copied into the nonce account
//!          (account 6), which the test created owned by this program
//!   anything else (register_oapp, set_delegate, ...): accepted as it is
//! The receive side (`clear`) is tested against the real endpoint program.
#![cfg_attr(target_os = "solana", no_std)]

#[cfg(target_os = "solana")]
mod program {
    use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};

    const SEND: [u8; 8] = [102, 251, 20, 187, 65, 75, 12, 69];

    pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
        if data.len() < 8 || data[..8] != SEND { return Ok(()); }
        if accounts.len() < 7 || !accounts[0].is_signer() { return Err(ProgramError::MissingRequiredSignature); }
        let kayit = &mut accounts[6];
        if !kayit.owned_by(program_id) || kayit.data_len() < 4 + data.len() { return Err(ProgramError::InvalidAccountData); }
        let mut d = kayit.try_borrow_mut()?;
        d[..4].copy_from_slice(&(data.len() as u32).to_le_bytes());
        d[4..4 + data.len()].copy_from_slice(data);
        Ok(())
    }
}

#[cfg(target_os = "solana")]
mod entry {
    pinocchio::program_entrypoint!(crate::program::process);
    pinocchio::no_allocator!();
    pinocchio::nostd_panic_handler!();
}
