Circle CCTP V2 on Aptos: the functions ARC PULSE's basket receiver calls,
with the signatures of circlefin/aptos-cctp (packages/*_v2, master, read
17 Oct 2026) at the mainnet package addresses. NEVER PUBLISHED: Circle's
packages build against a different framework revision, so ours compiles
against these instead and links to the real modules on chain. The bodies
are a working stand-in for local tests (header parsing, destination and
caller checks, single-use nonces, minting to the mint recipient); the
attestation is not verified here.

One package per Circle package, with Circle's exact package name: an Aptos
publish names each dependency as (address, package name) and
0x1::code::check_dependencies looks that pair up in the PackageRegistry
(mainnet registry read 17 Oct 2026: MessageTransmitterV2 @0x1b3f…,
TokenMessengerMinterV2 @0x551e…, StablecoinHandler @0x2b96…, all
"compatible"). A single package spanning the three addresses would abort
the publish with EPACKAGE_DEP_MISSING.
