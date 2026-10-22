// Build (in C:/Users/omen/araclar/aptossdk, @aptos-labs/ts-sdk 7.5.0 installed):
//   esbuild giris.mjs --bundle --format=esm --minify --platform=browser --target=es2020 --define:global=globalThis
//     --outfile=C:/arc-launchpad/docs/vendor/aptos-betik.mjs
// docs/vendor/cctp-aptos-v2-deposit_for_burn_with_hook.mv is Circle's precompiled mainnet script, copied unchanged from
// github.com/circlefin/aptos-cctp (440599d) typescript/example/precompiled-move-scripts/mainnet/v2/ (Apache-2.0).
// ARC PULSE: the typed argument classes an Aptos wallet needs for a Move script
// (Circle's CCTP v2 deposit_for_burn_with_hook), bundled into docs/vendor/aptos-betik.mjs.
// Imported from the files that define them: the package barrel's circular
// imports leave them uninitialised when bundled.
export { U64, U32 } from "./node_modules/@aptos-labs/ts-sdk/dist/bcs/serializable/movePrimitives.js";
export { MoveVector } from "./node_modules/@aptos-labs/ts-sdk/dist/bcs/serializable/moveStructs.js";
export { AccountAddress } from "./node_modules/@aptos-labs/ts-sdk/dist/core/accountAddress.js";
