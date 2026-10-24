//! The ARC PULSE basket vault on Solana: the counterpart of
//! contracts/sepet/SepetKasasi.sol, sui/pulse-sepet and aptos/pulse-sepet.
#![cfg_attr(target_os = "solana", no_std)]
pub mod egri;
pub mod fiyat;

#[cfg(target_os = "solana")]
pub mod program;

#[cfg(all(target_os = "solana", not(feature = "no-entrypoint")))]
mod entry {
    pinocchio::program_entrypoint!(crate::program::process);
    pinocchio::no_allocator!();
    pinocchio::nostd_panic_handler!();
}
