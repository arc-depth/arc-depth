//! The ARC PULSE gate on Solana (LayerZero OApp). `abi` holds the EVM ABI
//! encoding and decoding shared with the tests and is built on the host too;
//! the program is compiled only for the SBF target.

extern crate alloc;
pub mod abi;

#[cfg(target_os = "solana")]
pub mod program;

#[cfg(all(target_os = "solana", not(feature = "no-entrypoint")))]
mod entry {
    pinocchio::program_entrypoint!(crate::program::process);
    pinocchio::default_allocator!();
    pinocchio::default_panic_handler!();
}
