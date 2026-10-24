//! The ARC PULSE launchpad on Solana. `math` holds the rules shared with the Move pools and
//! is tested on the host; the program is compiled only for the SBF target.
#![cfg_attr(target_os = "solana", no_std)]
pub mod math;

#[cfg(target_os = "solana")]
pub mod program;

#[cfg(all(target_os = "solana", not(feature = "no-entrypoint")))]
mod entry {
    pinocchio::program_entrypoint!(crate::program::process);
    pinocchio::no_allocator!();
    pinocchio::nostd_panic_handler!();
}
