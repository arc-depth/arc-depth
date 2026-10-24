//! Test stand-in for Circle's TokenMessengerMinter V2 on Solana, loaded at its
//! real program id in LiteSVM: deposit_for_burn as a caller sees it. It
//! checks what the real program checks of its caller (the discriminator, the
//! owner and the event account signing, the burn account belonging to the
//! owner) and burns the amount. The message to the other chain is not made.
#![cfg_attr(target_os = "solana", no_std)]

#[cfg(target_os = "solana")]
mod program {
    use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};
    use pinocchio_token::instructions::Burn;

    const DEPOSIT_FOR_BURN: [u8; 8] = [215, 60, 61, 46, 114, 55, 128, 176];

    pub fn process(_program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
        if data.len() < 96 || data[..8] != DEPOSIT_FOR_BURN { return Err(ProgramError::InvalidInstructionData); }
        if accounts.len() < 18 { return Err(ProgramError::NotEnoughAccountKeys); }
        let owner = &accounts[0];
        let event = &accounts[11];
        if !owner.is_signer() || !accounts[1].is_signer() || !event.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
        {
            let d = accounts[3].try_borrow()?;
            if d.len() != 165 || d[32..64] != *owner.address().as_ref() { return Err(ProgramError::IllegalOwner); }
        }
        let amount = u64::from_le_bytes(data[8..16].try_into().unwrap());
        Burn::<&AccountView>::new(&accounts[3], &accounts[10], owner, amount).invoke()
    }
}

#[cfg(target_os = "solana")]
mod entry {
    pinocchio::program_entrypoint!(crate::program::process);
    pinocchio::no_allocator!();
    pinocchio::nostd_panic_handler!();
}
