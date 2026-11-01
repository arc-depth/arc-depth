/* ===========================================================================
 * designs/js/mesaj.js — the message envelope (encrypted in the browser)
 *
 * A message is encrypted once with a fresh AES-256-GCM key; that key is
 * wrapped twice with the main app's ECIES (docs/js/designs/sifre.js `sar`):
 * to the recipient's unlock key registered on TasarimNFT2 (anahtarOf), and
 * to the sender's own unlock key, so the sender can reread what they sent.
 *
 *   0x01 || wrapRecipient(93) || wrapSender(93) || iv(12) || AES-GCM(text)
 *   wrap = ephemeral public key (33) || iv (12) || AES-GCM(key 32 + tag 16)
 *
 * The ECIES context binds each wrap to its reader's address. MesajKutusu
 * carries at most 2,000 bytes, so a message has about 1,780 bytes of text.
 * Nothing is stored: the unlock key is re-derived from a wallet signature
 * and kept in memory for this page load (sifre.js).
 * =========================================================================== */
import { getBytes, hexlify, concat } from "../../vendor/ethers.min.js";

const BAGLAM = "arcpulse-message-v1";
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const b64Coz = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const AZAMI = 2000;
export const ACIK_AZAMI = AZAMI - 1 - 93 * 2 - 12 - 16;

async function sarKisa(Sf, k, pub, kime) {
  const z = await Sf.sar(k, pub, kime, BAGLAM);
  return concat([getBytes(z.epk), b64Coz(z.iv), b64Coz(z.ct)]);
}

/** Encrypt `metin` for `alici` (registered key `aliciPub`) and for the sender (`ben`, key `benPub`). Returns hex bytes. */
export async function sifrele(metin, { alici, aliciPub, ben, benPub }) {
  const Sf = await import("../../js/designs/sifre.js");
  const acik = new TextEncoder().encode(metin);
  if (!acik.length) throw new Error("Write a message first.");
  if (acik.length > ACIK_AZAMI) throw new Error("The message is " + acik.length + " bytes; at most " + ACIK_AZAMI + " fit in one message. Shorten it or send two.");
  const k = crypto.getRandomValues(new Uint8Array(32));
  const ak = await crypto.subtle.importKey("raw", k, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, ak, acik));
  return hexlify(concat([new Uint8Array([1]), await sarKisa(Sf, k, aliciPub, alici), await sarKisa(Sf, k, benPub, ben), iv, ct]));
}

/** Open a message with the connected wallet's unlock key `sk`; `ben` is the reader (recipient or sender). */
export async function coz(hex, { sk, ben, gonderen }) {
  const Sf = await import("../../js/designs/sifre.js");
  const b = getBytes(hex);
  if (b.length < 1 + 186 + 12 + 16 || b[0] !== 1) throw new Error("Not an ARC PULSE message.");
  const wrap = String(gonderen).toLowerCase() === String(ben).toLowerCase() ? b.slice(94, 187) : b.slice(1, 94);
  const k = await Sf.ac({ epk: hexlify(wrap.slice(0, 33)), iv: b64(wrap.slice(33, 45)), ct: b64(wrap.slice(45)), to: String(ben).toLowerCase() }, sk, BAGLAM);
  const ak = await crypto.subtle.importKey("raw", k, "AES-GCM", false, ["decrypt"]);
  const acik = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(187, 199) }, ak, b.slice(199));
  return new TextDecoder().decode(acik);
}
