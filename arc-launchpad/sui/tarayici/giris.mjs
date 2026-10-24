// Build: cd C:/Users/omen/araclar/sui-tarayici && npm i @mysten/sui@1.45.2 @mysten/move-bytecode-template esbuild
//   node node_modules/esbuild/bin/esbuild giris.mjs --bundle --format=esm --minify --platform=browser --target=es2020 --outfile=C:/arc-launchpad/docs/vendor/sui.mjs
//   and copy node_modules/@mysten/move-bytecode-template/web/move_bytecode_template_bg.wasm to docs/vendor/
// ARC PULSE: the pieces of @mysten/sui and move-bytecode-template the site
// uses on Sui, bundled once into docs/vendor/sui.mjs (no CDN at runtime).
export { Transaction } from "@mysten/sui/transactions";
export { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
export { normalizeSuiAddress, normalizeStructTag, fromBase64, toBase64 } from "@mysten/sui/utils";
export { bcs } from "@mysten/sui/bcs";
export { default as sablonYukle, update_identifiers, update_constants, get_constants } from "@mysten/move-bytecode-template";
