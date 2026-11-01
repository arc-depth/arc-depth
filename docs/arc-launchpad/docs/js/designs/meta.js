/* ===========================================================================
 * designs/meta.js — the metadata JSON behind each design's tokenURI
 *
 * tokenURI points at an ERC-721 metadata JSON (on Irys, IPFS or Arweave):
 *   name, description, image (the public, watermarked preview),
 *   license / license_text (TasarimNFT.LISANS_URI / LISANS),
 *   arcpulse: { v, designer, token, file: {uri, name, mime, size, sha256,
 *               encryption}, fingerprint: {algiHash, method}, keys: [envelope
 *               to the designer's unlock key] }
 * Only gateways the page's Content-Security-Policy allows are fetched.
 * =========================================================================== */

export const GECITLER = {
  ipfs: "https://ipfs.io/ipfs/",
  ar: "https://arweave.net/"
};

/** ipfs:// / ar:// / https → a fetchable https URL (or null). */
export function cozUrl(uri) {
  const u = String(uri || "").trim();
  if (/^ipfs:\/\//i.test(u)) return GECITLER.ipfs + u.replace(/^ipfs:\/\/(ipfs\/)?/i, "");
  if (/^ar:\/\//i.test(u)) return GECITLER.ar + u.replace(/^ar:\/\//i, "");
  if (/^https:\/\//i.test(u)) return u;
  return null;
}

/** Content URIs the publish form accepts. */
export const uriGecerli = (u) => /^(ipfs:\/\/[a-zA-Z0-9]{20,}|ar:\/\/[a-zA-Z0-9_-]{20,}|https:\/\/[^\s]{8,})/.test(String(u || "").trim()) && new TextEncoder().encode(u.trim()).length <= 512;

const _meta = new Map();
export function metaOku(uri) {
  if (!_meta.has(uri)) {
    const url = cozUrl(uri);
    const p = url ? fetch(url, { signal: AbortSignal.timeout(15_000) }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      : Promise.reject(new Error("Unsupported URI"));
    p.catch(() => setTimeout(() => _meta.delete(uri), 30_000));
    _meta.set(uri, p);
  }
  return _meta.get(uri);
}

export async function baytAl(uri) {
  const url = cozUrl(uri);
  if (!url) throw new Error("Unsupported URI: " + uri);
  const r = await fetch(url);
  if (!r.ok) throw new Error("Could not fetch " + url + " (HTTP " + r.status + ")");
  return new Uint8Array(await r.arrayBuffer());
}

export function metaYap({ ad, aciklama, onizleme, lisans, lisansUri, tasarimci, token, dosya, parmak, anahtarlar, tur }) {
  return {
    name: ad,
    description: aciklama,
    image: onizleme || undefined,
    license: lisansUri,
    license_text: lisans,
    attributes: [{ trait_type: "Kind", value: tur }, { trait_type: "Designer token", value: token }],
    arcpulse: { v: 1, designer: tasarimci, token, file: dosya, fingerprint: parmak, keys: anahtarlar }
  };
}
