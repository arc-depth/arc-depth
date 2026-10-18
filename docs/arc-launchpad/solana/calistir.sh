#!/usr/bin/env bash
# Builds the Solana programs (PulseSwap, launchpad) and runs their tests on
# this Windows machine, no validator, no network (LiteSVM). Tools live
# outside the repo:
#   rustup GNU toolchain (~/.cargo), Agave 4.3 (cargo-build-sbf, platform
#   tools v1.57), llvm-mingw only for dlltool and as blst's C compiler.
# The windows build of solana-test-validator needs symlink privilege
# (Developer Mode), hence LiteSVM.
set -e
T=C:/Users/omen/araclar/sol-tool
L=$T/llvm-mingw-20261006-ucrt-x86_64/bin
# /c/ form: a "C:" in PATH would be split at its colon
export PATH="/c/Users/omen/.cargo/bin:$PATH:/c/Users/omen/araclar/sol-tool/dlltool"
export CC_x86_64_pc_windows_gnu=$L/x86_64-w64-mingw32-clang.exe AR_x86_64_pc_windows_gnu=$L/llvm-ar.exe
cd "$(dirname "$0")"
for p in pulse-swap pulse-launchpad pulse-sepet; do
  (cd $p && cargo test --lib && $T/solana-release/bin/cargo-build-sbf.exe --features local-test)
done
# the test stand-in for CCTP V2 MessageTransmitter (LiteSVM loads it at its real id)
(cd sahte-mt && $T/solana-release/bin/cargo-build-sbf.exe)
(cd sahte-tmm && $T/solana-release/bin/cargo-build-sbf.exe)
# the real Metaplex Token Metadata program, read from mainnet once (no transaction)
M=pulse-swap-e2e/programs/mpl_token_metadata.so
[ -f $M ] || { mkdir -p pulse-swap-e2e/programs; $T/solana-release/bin/solana.exe program dump -u mainnet-beta metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s $M; }
cd pulse-swap-e2e && cargo test                      # both .so files end to end in LiteSVM
