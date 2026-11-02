/* ===========================================================================
 * designs/benzer.js — near-copy warning before publishing
 *
 * TasarimNFT refuses an EXACT fingerprint that is already on chain (the same
 * file, or the same 64-bit image dHash). A slightly edited copy has a dHash a
 * few bits away, which the contract cannot see. Before publishing, the page
 * compares the new image's dHash with the algiHash of every published design
 * (from the Yayinlandi events, already loaded for Discover) and warns, with a
 * link, when the Hamming distance is small. It is a warning only: publishing
 * stays allowed (the contract decides exact copies, the challenge window
 * handles near copies). Plain images (flat colours, simple gradients) can sit
 * close by chance, so the wording says "looks similar", never "copy".
 * Pure functions, no DOM; nothing is sent anywhere.
 * =========================================================================== */

/** Distance at or under which two image dHashes are reported as similar (of 64 bits). */
export const BENZER_ESIK = 10;

/** The 64-bit image dHash inside an algiHash (kind byte 0x01), or null for other kinds. */
export function gorselDHash(algiHash) {
  const h = String(algiHash || "").toLowerCase();
  if (!/^0x01[0-9a-f]{62}$/.test(h)) return null;
  return BigInt("0x" + h.slice(-16));
}

/** Number of differing bits between two 64-bit values. */
export function hamming(a, b) {
  let x = BigInt.asUintN(64, a ^ b), n = 0;
  while (x) { x &= x - 1n; n++; }
  return n;
}

/**
 * Published designs whose image fingerprint is within `esik` bits of `algiHash`,
 * closest first: [{ id, mesafe, tasarimci, uri }]. `liste` is sozlesme.js yayinlar().
 * Exact matches (distance 0) are included: the contract will refuse those.
 */
export function benzerler(algiHash, liste, esik = BENZER_ESIK) {
  const h = gorselDHash(algiHash);
  if (h == null) return [];
  const out = [];
  for (const t of liste || []) {
    const o = gorselDHash(t.algiHash);
    if (o == null) continue;
    const mesafe = hamming(h, o);
    if (mesafe <= esik) out.push({ id: t.id, mesafe, tasarimci: t.tasarimci, uri: t.uri });
  }
  return out.sort((a, b) => a.mesafe - b.mesafe || a.id - b.id);
}
