//! Test stand-in for Circle's MessageTransmitter V2 on Solana, loaded at its
//! real program id in LiteSVM. It does the one thing a receiver ever sees:
//! a CPI into the receiver, signed by the authority PDA
//! ["message_transmitter_authority", receiver], with the data given. The
//! attestation, nonce and header checks of the real program are not here;
//! the receiver's own checks are what the tests measure.
//!
//! accounts: [authority w, receiver program, ...forwarded]; data: the CPI data
#![cfg_attr(target_os = "solana", no_std)]

#[cfg(target_os = "solana")]
mod program {
    use pinocchio::{
        cpi::{invoke_signed_with_bounds, Seed, Signer},
        error::ProgramError,
        instruction::{InstructionAccount, InstructionView},
        AccountView, Address, ProgramResult,
    };

    pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
        if accounts.len() < 2 || accounts.len() > 16 { return Err(ProgramError::NotEnoughAccountKeys); }
        let receiver = *accounts[1].address();
        let (yetki, bump) = Address::find_program_address(&[b"message_transmitter_authority", receiver.as_ref()], program_id);
        if *accounts[0].address() != yetki { return Err(ProgramError::InvalidSeeds); }
        let mut metas: [InstructionAccount; 16] = core::array::from_fn(|_| InstructionAccount::readonly(&yetki));
        let mut views: [&AccountView; 16] = [&accounts[0]; 16];
        metas[0] = InstructionAccount::readonly_signer(&yetki);
        let mut n = 1;
        for i in 2..accounts.len() {
            let a = &accounts[i];
            metas[n] = match (a.is_writable(), a.is_signer()) {
                (true, true) => InstructionAccount::writable_signer(a.address()),
                (true, false) => InstructionAccount::writable(a.address()),
                (false, true) => InstructionAccount::readonly_signer(a.address()),
                (false, false) => InstructionAccount::readonly(a.address()),
            };
            views[n] = a;
            n += 1;
        }
        let ix = InstructionView { program_id: &receiver, accounts: &metas[..n], data };
        let b = [bump];
        let seeds = [Seed::from(b"message_transmitter_authority"), Seed::from(receiver.as_ref()), Seed::from(&b)];
        invoke_signed_with_bounds::<16, &AccountView>(&ix, &views[..n], &[Signer::from(&seeds)])
    }
}

#[cfg(target_os = "solana")]
mod entry {
    pinocchio::program_entrypoint!(crate::program::process);
    pinocchio::no_allocator!();
    pinocchio::nostd_panic_handler!();
}
