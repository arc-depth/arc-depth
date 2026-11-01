/* ===========================================================================
 * designs/sifre.js — the full file is encrypted in the browser and opens
 *                    only for the wallet that holds the NFT
 *
 * WHY NOT LIT PROTOCOL (checked 1 Nov 2026)
 *   Lit's nodes evaluate access conditions only for the chains in their SDK
 *   list (@lit-protocol/constants 9.0.1, LIT_CHAINS): Arc (5042) is not in
 *   it, so an "ownerOf on TasarimNFT" condition cannot be checked by Lit.
 *   No other threshold-key network we found evaluates Arc state either.
 *
 * WHAT WE DO INSTEAD (no server, no key of ours)
 *   1. The file gets a fresh random AES-256-GCM key; only the ciphertext is
 *      uploaded. The key never leaves the browser in clear.
 *   2. Every wallet has an "unlock key": a secp256k1 key derived from the
 *      wallet's signature of a fixed message (wallets sign deterministically,
 *      RFC 6979, so the same wallet always gets the same key; nothing is
 *      stored — it is re-derived when needed and kept in memory only).
 *   3. The file key is wrapped to a wallet's unlock PUBLIC key with ECIES
 *      (ephemeral ECDH on secp256k1 → HKDF-SHA256 → AES-256-GCM). At publish
 *      the designer wraps it to their own key (inside the metadata JSON).
 *   4. After a sale, whoever can open the file (the designer, or the seller
 *      on a resale) wraps the file key to the buyer's unlock public key and
 *      hands the buyer that small "key envelope" — uploaded to Irys tagged
 *      with the design and the buyer, or copied as text.
 *   5. The buyer publishes their unlock public key once ("key card": the key
 *      plus a wallet signature over it, so nobody can substitute theirs).
 *   The decrypted file is checked against the exact hash on chain
 *   (dosyaHash), so a wrong or forged envelope can never pass as the design.
 *
 * HONEST LIMITS
 *   - Delivery needs the seller's browser after the sale (not automatic).
 *   - A previous holder who once opened the file keeps the bytes and the key
 *     (no encryption scheme can take back what was decrypted); the license
 *     (usage rights) moves on chain regardless.
 *   - Anyone who gets a wallet to sign the unlock message gets that wallet's
 *     unlock key: the message names arcpulse.app; sign it nowhere else.
 * =========================================================================== */
import { SigningKey, keccak256, getBytes, hexlify, verifyMessage, toUtf8Bytes, concat, computeAddress } from "../../vendor/ethers.min.js";
import { imzala } from "./imza.js";

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SIHIR = new TextEncoder().encode("APD1");   // encrypted file header

export const anahtarMesaji = (adres) =>
  "ARC PULSE Designs\nUnlock key v1\nWallet: " + String(adres).toLowerCase() +
  "\n\nSigning this creates the private key that opens design files you hold. Sign it only on arcpulse.app. It sends nothing and costs nothing.";
export const kartMesaji = (adres, pub) =>
  "ARC PULSE Designs\nMy unlock public key v1\nWallet: " + String(adres).toLowerCase() + "\nKey: " + pub;

/* derived keys live in memory for this page load only */
const _anahtarlar = new Map();

/** The connected wallet's unlock key (asks for one signature per page load). */
export async function acmaAnahtari(cuzdan) {
  const ben = String(cuzdan.hesap() || "").toLowerCase();
  if (_anahtarlar.has(ben)) return _anahtarlar.get(ben);
  const sig = await imzala(cuzdan, anahtarMesaji(ben));
  let h = keccak256(sig);
  while (BigInt(h) === 0n || BigInt(h) >= N) h = keccak256(h);
  const sk = new SigningKey(h);
  _anahtarlar.set(ben, sk);
  return sk;
}

/** A key card: unlock public key + the wallet's signature over it. One signature. */
export async function kartYap(cuzdan) {
  const sk = await acmaAnahtari(cuzdan);
  const ben = cuzdan.hesap().toLowerCase();
  const pub = sk.compressedPublicKey;
  const s = await imzala(cuzdan, kartMesaji(ben, pub));
  return { v: 1, w: ben, k: pub, s };
}

/** Is this card really signed by its wallet? Returns the card or throws. */
export function kartDogrula(kart, beklenen) {
  if (!kart || kart.v !== 1 || !/^0x0[23][0-9a-f]{64}$/i.test(kart.k || "")) throw new Error("Not an ARC PULSE unlock key card.");
  const kim = verifyMessage(kartMesaji(kart.w, kart.k), kart.s);
  if (kim.toLowerCase() !== String(kart.w).toLowerCase()) throw new Error("The key card's signature does not match its wallet.");
  if (beklenen && kim.toLowerCase() !== String(beklenen).toLowerCase()) throw new Error("This key card belongs to " + kim + ", not " + beklenen + ".");
  return kart;
}
export const kartMetni = (kart) => "apd-key:" + btoa(JSON.stringify(kart));
export function kartCoz(metin) {
  const m = String(metin || "").trim().replace(/^apd-key:/, "");
  return JSON.parse(atob(m));
}

/* ---- AES / HKDF helpers ---- */
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const b64Coz = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hkdfAes(paylasilan, tuz, bilgi) {
  const ham = await crypto.subtle.importKey("raw", paylasilan, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: tuz, info: new TextEncoder().encode(bilgi) }, ham, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const baglam = (dosyaHash, alici) => "arcpulse-designs-v1|" + String(dosyaHash).toLowerCase() + "|" + String(alici).toLowerCase();

/** Wrap a 32-byte file key to `aliciPub` (unlock public key) for `alici` (address). */
export async function sar(dosyaAnahtari, aliciPub, alici, dosyaHash) {
  const gecici = new SigningKey(hexlify(crypto.getRandomValues(new Uint8Array(32))));
  const nokta = getBytes(gecici.computeSharedSecret(aliciPub));   // 0x04 || x || y
  const epk = getBytes(gecici.compressedPublicKey);
  const k = await hkdfAes(nokta.slice(1, 33), epk, baglam(dosyaHash, alici));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, dosyaAnahtari));
  return { v: 1, alg: "ECIES-secp256k1-HKDF-SHA256-AES256GCM", to: String(alici).toLowerCase(), toKey: SigningKey.computePublicKey(aliciPub, true), epk: hexlify(epk), iv: b64(iv), ct: b64(ct), file: String(dosyaHash).toLowerCase() };
}

/** Unwrap an envelope with the connected wallet's unlock key. */
export async function ac(zarf, sk, dosyaHash) {
  const nokta = getBytes(sk.computeSharedSecret(zarf.epk));
  const k = await hkdfAes(nokta.slice(1, 33), getBytes(zarf.epk), baglam(dosyaHash, zarf.to));
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64Coz(zarf.iv) }, k, b64Coz(zarf.ct)));
}

/** Encrypt the file: "APD1" || iv(12) || AES-256-GCM(ciphertext+tag). Returns {blob, anahtar}. */
export async function dosyaSifrele(bayt) {
  const anahtar = crypto.getRandomValues(new Uint8Array(32));
  const k = await crypto.subtle.importKey("raw", anahtar, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, bayt));
  return { blob: new Blob([SIHIR, iv, ct], { type: "application/octet-stream" }), anahtar };
}

export async function dosyaCoz(sifreli, anahtar) {
  const u8 = new Uint8Array(sifreli);
  if (String.fromCharCode(...u8.slice(0, 4)) !== "APD1") throw new Error("Not an ARC PULSE encrypted design file.");
  const k = await crypto.subtle.importKey("raw", anahtar, "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u8.slice(4, 16) }, k, u8.slice(16)));
}

export const zarfMetni = (z) => "apd-envelope:" + btoa(JSON.stringify(z));
export const zarfCoz = (metin) => JSON.parse(atob(String(metin || "").trim().replace(/^apd-envelope:/, "")));

/* used by the Node simulation test */
export const _ic = { keccak256, concat, toUtf8Bytes, computeAddress };
