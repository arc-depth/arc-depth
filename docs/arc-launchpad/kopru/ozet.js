"use strict";
/* ===========================================================================
 * ozet.js — the one place the signed digest is built.
 *
 * The signer and the submitter both need it, and they must agree to the
 * byte. If each built its own, a change to one would produce signatures
 * the other collects happily and the contract rejects — or worse,
 * signatures over something nobody checked. So it lives here, and
 * dene-ozet.js compares this function against KopruKanit.ozet() running
 * on the real chain rather than against a second copy of the arithmetic.
 *
 * The EIP-191 prefix is applied by the caller's signMessage over these
 * bytes, which is what the contract expects: it hashes
 * "\x19Ethereum Signed Message:\n32" over the same 32 bytes.
 * =========================================================================== */

const { AbiCoder, keccak256, getBytes } = require("ethers");

const coder = AbiCoder.defaultAbiCoder();
const ALAN = keccak256(Buffer.from("ArcDepth.KopruKanit.v1"));

/// The 32 bytes a signer signs. Everything that identifies WHICH bridge,
/// WHICH direction and WHICH notice is inside them, so a signature cannot
/// be carried anywhere else.
function ham(hedefZincir, hedefKontrat, kaynakZincir, olayId, alici, miktar) {
  return keccak256(coder.encode(
    ["bytes32", "uint256", "address", "uint256", "bytes32", "address", "uint256"],
    [ALAN, hedefZincir, hedefKontrat, kaynakZincir, olayId, alici, miktar]));
}

function imzalanacak(hedefZincir, hedefKontrat, kaynakZincir, olayId, alici, miktar) {
  return getBytes(ham(hedefZincir, hedefKontrat, kaynakZincir, olayId, alici, miktar));
}

/// What the contract's `ozet` returns: the prefixed hash. Only needed for
/// comparing against the chain; signers never hash this themselves.
function onEkli(h) {
  return keccak256(Buffer.concat([
    Buffer.from("\x19Ethereum Signed Message:\n32", "binary"),
    Buffer.from(h.slice(2), "hex")
  ]));
}

module.exports = { ALAN, ham, imzalanacak, onEkli };
