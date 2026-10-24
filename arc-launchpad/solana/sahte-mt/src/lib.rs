//! Test stand-in for Circle's MessageTransmitter V2 on Solana, loaded at its
//! real program id in LiteSVM. It does the one thing a receiver ever sees:
//! a CPI into the receiver, signed by the authority PDA
//! ["message_transmitter_authority", receiver], with the data given. The
//! attestation, nonce and header checks of the real program are not here;
//! the receiver's own checks are what the tests measure. One check of the
//! real program IS here, because a sender can get it wrong: the caller must
//! sign, and when the message names a destination caller it must be that
//! caller (circlefin/solana-cctp-contracts v2 receive_message.rs). An Arc
//! Haberci order to Solana names the recipient program itself, which can
//! never sign (found 18 Oct; Solana goes through LayerZero instead).
//!
//! accounts: [caller s, authority w, receiver program, ...forwarded];
//! data: destination_caller (32 bytes, zero = anyone) then the CPI data
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
        if accounts.len() < 3 || accounts.len() > 17 || data.len() < 32 { return Err(ProgramError::NotEnoughAccountKeys); }
        let (hedef_cagiran, data) = data.split_at(32);
        if hedef_cagiran != [0u8; 32] && !(accounts[0].is_signer() && accounts[0].address().as_ref() == hedef_cagiran) {
            return Err(ProgramError::MissingRequiredSignature);   // InvalidDestinationCaller in the real program
        }
        let accounts = &mut accounts[1..];
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
