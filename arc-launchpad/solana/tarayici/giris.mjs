// Build (the shims beside this file copied next to it, in C:/Users/omen/araclar/sol where
// @solana/web3.js, @solana/spl-token, buffer and bs58 are installed):
//   esbuild giris.mjs --bundle --format=esm --minify --platform=browser --target=es2020 --define:global=globalThis
//     --alias:http=./tarayici-bos.cjs --alias:https=./tarayici-bos.cjs --alias:path=./tarayici-bos.cjs --alias:fs=./tarayici-bos.cjs
//     --alias:os=./tarayici-bos.cjs --alias:crypto=./tarayici-bos.cjs --alias:stream=./tarayici-stream.cjs --inject:./tarayici-ortam.js
//     --outfile=C:/arc-launchpad/docs/vendor/solana.mjs
// ARC PULSE: the parts of @solana/web3.js and @solana/spl-token
// the site uses, bundled once into docs/vendor/solana.mjs (no CDN at runtime).
export { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
export { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
export { Buffer } from "buffer";
export { default as bs58 } from "bs58";
