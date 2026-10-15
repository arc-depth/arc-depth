"use strict";
/* ===========================================================================
 * cuzdan-evm-disi.js — the deployer's wallets on Solana, Aptos and Sui
 *
 *   node scripts/cuzdan-evm-disi.js     # creates missing keys, prints addresses
 *
 * The EVM deployer key cannot sign on these chains: all three use ed25519.
 * One key per chain, written to .env (gitignored) only if absent — an
 * existing key is never replaced, because replacing it would orphan
 * whatever that address holds. Only addresses are printed.
 *   Solana  address = base58(public key)
 *   Aptos   address = sha3-256(public key || 0x00)        (single-key ed25519 scheme)
 *   Sui     address = blake2b-256(0x00 || public key)      (ed25519 flag 0x00)
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { ed25519 } = require("@noble/curves/ed25519");
const { sha3_256 } = require("@noble/hashes/sha3");
const { blake2b } = require("@noble/hashes/blake2b");
const { randomBytes } = require("crypto");

const ENV = path.join(__dirname, "..", ".env");
const hex = (b) => Buffer.from(b).toString("hex");
const ALF = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(buf) {
  let n = BigInt("0x" + (hex(buf) || "0")), s = "";
  while (n > 0n) { s = ALF[Number(n % 58n)] + s; n /= 58n; }
  for (const x of buf) { if (x === 0) s = "1" + s; else break; }
  return s;
}

let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";
const oku = (ad) => { const m = env.match(new RegExp("^" + ad + "\s*=\s*([0-9a-fA-F]{64})\s*$", "m")); return m && m[1]; };
const adres = {
  SOLANA: (pub) => b58(pub),
  APTOS: (pub) => "0x" + hex(sha3_256(Uint8Array.from([...pub, 0x00]))),
  SUI: (pub) => "0x" + hex(blake2b(Uint8Array.from([0x00, ...pub]), { dkLen: 32 })),
};
for (const ad of Object.keys(adres)) {
  let sk = oku(ad + "_PRIVATE_KEY");
  if (!sk) {
    sk = hex(randomBytes(32));
    env += (env.endsWith("\n") || !env ? "" : "\n") + ad + "_PRIVATE_KEY=" + sk + "\n";
    fs.writeFileSync(ENV, env);
    console.log(ad.padEnd(7) + "yeni anahtar uretildi");
  }
  const pub = ed25519.getPublicKey(Buffer.from(sk, "hex"));
  console.log(ad.padEnd(7) + adres[ad](pub));
}
