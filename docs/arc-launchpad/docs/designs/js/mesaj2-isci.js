/* ===========================================================================
 * designs/js/mesaj2-isci.js — view-tag checks for the private box, off the
 *                             page's main thread (a module Web Worker)
 *
 * Gets the reader's unlock private key (memory only, from the page that
 * spawned it, same origin; nothing is stored or sent anywhere) and a batch of
 * (ephemeral public key 33 || view tag 2) slices; answers which ones match:
 * one secp256k1 ECDH + SHA-256 each. See mesaj2.js for the envelope.
 * =========================================================================== */
import { SigningKey, getBytes, concat, sha256, toUtf8Bytes } from "../../vendor/ethers.min.js";

const ETIKET = toUtf8Bytes("arcpulse-viewtag-v2");
let sk = null;

self.onmessage = (e) => {
  const { tur, anahtar, parcalar, no } = e.data || {};
  if (tur === "anahtar") { sk = new SigningKey(anahtar); return; }
  if (tur !== "tara" || !sk) return;
  const uyan = [];
  for (let i = 0; i < parcalar.length; i++) {
    const p = parcalar[i];
    try {
      const x = getBytes(sk.computeSharedSecret(p.subarray(0, 33))).slice(1, 33);
      const t = getBytes(sha256(concat([ETIKET, x])));
      if (t[0] === p[33] && t[1] === p[34]) uyan.push(i);
    } catch (x) { /* not a curve point: not mine */ }
  }
  self.postMessage({ no, uyan });
};
