/* ===========================================================================
 * designs/js/mesaj2.js — the message envelope v2 for the private box
 *                        (MesajKutusu2: recipient hidden)
 *
 * MesajKutusu2 has no recipient: every message lands in one shared stream
 * and each reader finds theirs here, in the browser, by trial decryption.
 * Version 0x01 (mesaj.js) is untouched and still opens the old box.
 *
 *   0x02                       1
 *   epk                       33   ephemeral public key E = e·G (compressed)
 *   viewTag                    2   first 2 bytes of SHA-256("arcpulse-viewtag-v2" || S)
 *   recipient wrap: iv 12 || AES-GCM(Kr, message key 32 + tag 16) = 60
 *   sender wrap:   93   sifre.js ECIES to the sender's own unlock key
 *                       (epk' 33 || iv 12 || ct 48), context "arcpulse-message-v2-self"
 *   iv                        12
 *   AES-256-GCM(message key, inner, AAD = the 189 header bytes above)
 *
 *   S  = x-coordinate of ECDH(e, recipient's unlock public key)  (= ECDH(recipient key, E))
 *   Kr = HKDF-SHA256(S, salt = epk, info = "arcpulse-message-v2|" + recipient address)
 *
 *   inner = 0x02 || from (20) || to (20) || expiry (uint40 seconds, 0 = never)
 *           || text length (uint16) || text (UTF-8) || zero padding
 *   The inner part is padded to a multiple of 64 bytes, so the size on chain
 *   says little about the text.
 *
 * Reading: for each message not sent by me, one ECDH with my unlock key and
 * a 2-byte compare; only a match (~1 in 65,536 for others' messages) costs
 * the HKDF and the AES opens. My own sent messages (the sender is public)
 * open with the sender wrap. `from` inside must equal the wallet that sent
 * the transaction, so a copied ciphertext re-posted by another wallet never
 * opens as theirs; `to` must be me.
 * The recipient's registered key is TasarimNFT2.anahtarOf, as for v1. Keys
 * are re-derived from a wallet signature and kept in memory (sifre.js).
 * =========================================================================== */
import { SigningKey, getBytes, hexlify, concat, sha256, toUtf8Bytes } from "../../vendor/ethers.min.js";

export const SURUM = 2;
export const AZAMI = 2000;
const ETIKET = toUtf8Bytes("arcpulse-viewtag-v2");
const BAGLAM_KENDI = "arcpulse-message-v2-self";
const BILGI = (alici) => "arcpulse-message-v2|" + String(alici).toLowerCase();
export const BASLIK = 1 + 33 + 2 + 60 + 93;            // 189
const IC_BASLIK = 1 + 20 + 20 + 5 + 2;                 // 48
const IC_AZAMI = AZAMI - BASLIK - 12 - 16;             // 1783
export const ACIK_AZAMI = IC_AZAMI - IC_BASLIK;        // 1735 bytes of text
export const DOLGU = 64;
/* disappearing messages, chosen by the sender per conversation */
export const SURELER = [[0, "Off"], [86400, "1 day"], [604800, "7 days"], [2592000, "30 days"]];

const b64 = (u8) => btoa(String.fromCharCode(...u8));
const b64Coz = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const kucuk = (a) => String(a || "").toLowerCase();

/** x-coordinate of the ECDH point of key `sk` (SigningKey) and public key `pub` (hex or bytes). */
const ecdh = (sk, pub) => getBytes(sk.computeSharedSecret(pub)).slice(1, 33);
/** The 2-byte view tag of a shared secret. */
export const gorusEtiketi = (x) => getBytes(sha256(concat([ETIKET, x]))).slice(0, 2);

async function hkdfAes(x, tuz, bilgi) {
  const ham = await crypto.subtle.importKey("raw", x, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: tuz, info: new TextEncoder().encode(bilgi) }, ham, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const aesAnahtar = (k, kul) => crypto.subtle.importKey("raw", k, "AES-GCM", false, [kul]);

function icYap(metin, ben, alici, bitis) {
  const acik = new TextEncoder().encode(metin);
  if (!acik.length) throw new Error("Write a message first.");
  if (acik.length > ACIK_AZAMI) throw new Error("The message is " + acik.length + " bytes; at most " + ACIK_AZAMI + " fit in one message. Shorten it or send two.");
  const n = Math.min(IC_AZAMI, Math.ceil((IC_BASLIK + acik.length) / DOLGU) * DOLGU);
  const ic = new Uint8Array(n);
  ic[0] = SURUM;
  ic.set(getBytes(ben), 1);
  ic.set(getBytes(alici), 21);
  let b = BigInt(Math.max(0, Math.floor(bitis || 0)));
  for (let i = 45; i >= 41; i--) { ic[i] = Number(b & 0xffn); b >>= 8n; }
  ic[46] = acik.length >> 8; ic[47] = acik.length & 0xff;
  ic.set(acik, IC_BASLIK);
  return ic;
}
function icCoz(ic) {
  if (ic.length < IC_BASLIK || ic[0] !== SURUM) throw new Error("Not an ARC PULSE message.");
  let bitis = 0;
  for (let i = 41; i <= 45; i++) bitis = bitis * 256 + ic[i];
  const n = (ic[46] << 8) | ic[47];
  if (IC_BASLIK + n > ic.length) throw new Error("Not an ARC PULSE message.");
  return { kimden: hexlify(ic.slice(1, 21)), kime: hexlify(ic.slice(21, 41)), bitis, metin: new TextDecoder().decode(ic.slice(IC_BASLIK, IC_BASLIK + n)) };
}

/**
 * Encrypt `metin` for `alici` (its registered key `aliciPub`) and for the sender
 * (`ben`, own unlock public key `benPub`). `sure` = seconds until it disappears (0 = never).
 * Returns hex bytes for MesajKutusu2.gonder.
 */
export async function sifrele(metin, { alici, aliciPub, ben, benPub, sure = 0, simdi }) {
  if (!/^0x0[23][0-9a-fA-F]{64}$/.test(aliciPub || "")) throw new Error("This wallet has not registered an unlock key yet, so it cannot receive encrypted messages.");
  if (kucuk(alici) === kucuk(ben)) throw new Error("You cannot message yourself.");
  const Sf = await import("../../js/designs/sifre.js");
  const t = Math.floor((simdi ?? Date.now()) / 1000);
  const ic = icYap(metin, ben, alici, sure > 0 ? t + Number(sure) : 0);
  const mk = crypto.getRandomValues(new Uint8Array(32));

  const e = new SigningKey(hexlify(crypto.getRandomValues(new Uint8Array(32))));
  const epk = getBytes(e.compressedPublicKey);
  const x = ecdh(e, aliciPub);
  const kr = await hkdfAes(x, epk, BILGI(alici));
  const rIv = crypto.getRandomValues(new Uint8Array(12));
  const rCt = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: rIv }, kr, mk));

  const z = await Sf.sar(mk, benPub, ben, BAGLAM_KENDI);
  const sw = concat([getBytes(z.epk), b64Coz(z.iv), b64Coz(z.ct)]);

  const baslik = getBytes(concat([new Uint8Array([SURUM]), epk, gorusEtiketi(x), rIv, rCt, sw]));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: baslik }, await aesAnahtar(mk, "encrypt"), ic));
  return hexlify(concat([baslik, iv, ct]));
}

/** Quick check: does this v2 envelope carry my view tag? (one ECDH + 2-byte compare) */
export function etiketUyar(b, sk) {
  if (b.length < BASLIK + 12 + 16 + IC_BASLIK || b[0] !== SURUM) return false;
  const t = gorusEtiketi(ecdh(sk, b.slice(1, 34)));
  return t[0] === b[34] && t[1] === b[35];
}

/**
 * Open a v2 message with my unlock key `sk` (SigningKey). `ben` = my address,
 * `gonderen` = the wallet that sent the transaction. Returns
 * { kimden, kime, bitis (s), metin } or throws (not mine / forged / not v2).
 */
export async function coz(hex, { sk, ben, gonderen }) {
  const b = typeof hex === "string" ? getBytes(hex) : hex;
  if (b.length < BASLIK + 12 + 16 + IC_BASLIK || b[0] !== SURUM) throw new Error("Not an ARC PULSE message (v2).");
  const baslik = b.slice(0, BASLIK);
  let mk;
  if (kucuk(gonderen) === kucuk(ben)) {
    const Sf = await import("../../js/designs/sifre.js");
    const w = b.slice(96, 189);
    mk = await Sf.ac({ epk: hexlify(w.slice(0, 33)), iv: b64(w.slice(33, 45)), ct: b64(w.slice(45)), to: kucuk(ben) }, sk, BAGLAM_KENDI);
  } else {
    const epk = b.slice(1, 34);
    const x = ecdh(sk, epk);
    const t = gorusEtiketi(x);
    if (t[0] !== b[34] || t[1] !== b[35]) throw new Error("Not for this wallet.");
    const kr = await hkdfAes(x, epk, BILGI(ben));
    mk = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(36, 48) }, kr, b.slice(48, 96)));
  }
  const ic = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(189, 201), additionalData: baslik }, await aesAnahtar(mk, "decrypt"), b.slice(201)));
  const m = icCoz(ic);
  if (gonderen && kucuk(m.kimden) !== kucuk(gonderen)) throw new Error("The sender inside does not match the wallet that posted it.");
  if (kucuk(gonderen) !== kucuk(ben) && kucuk(m.kime) !== kucuk(ben)) throw new Error("Not for this wallet.");
  return m;
}

/* opened results, per reader and message (memory only: forgotten when the page closes) */
const _acilan = new Map();
const _anahtar = (ben, m) => kucuk(ben) + "|" + (m.id || m.tx + ":" + m.sira);

/* ---- view-tag checks on a small pool of Web Workers (mesaj2-isci.js) ----
   One ECDH per message is the whole cost of a scan; spread over the cores it
   stays off the main thread. Without workers (or for a few messages) the
   checks run here, a slice at a time. */
const ISCI_ESIGI = 64;
let _havuz = null;   // { anahtar, isciler: [Worker], sira }
function havuz(sk) {
  if (typeof Worker === "undefined") return null;
  if (_havuz && _havuz.anahtar === sk.privateKey) return _havuz;
  if (_havuz) _havuz.isciler.forEach((w) => w.terminate());
  try {
    const n = Math.max(1, Math.min(8, ((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4) - 1));
    const url = new URL("./mesaj2-isci.js", import.meta.url);
    const isciler = Array.from({ length: n }, () => { const w = new Worker(url, { type: "module" }); w.postMessage({ tur: "anahtar", anahtar: sk.privateKey }); return w; });
    _havuz = { anahtar: sk.privateKey, isciler, no: 0 };
  } catch (e) { _havuz = null; }
  return _havuz;
}
/** Indices (into `parcalar`, each epk 33 || tag 2) whose view tag is mine. */
async function etiketleriTara(parcalar, sk, dilim, isci) {
  const h = isci && parcalar.length >= ISCI_ESIGI ? havuz(sk) : null;
  if (h) {
    try {
      const n = h.isciler.length, boy = Math.ceil(parcalar.length / n);
      const sonuc = await Promise.all(h.isciler.map((w, j) => new Promise((coz_, red) => {
        const bas = j * boy, dilimP = parcalar.slice(bas, bas + boy), no = ++h.no;
        if (!dilimP.length) return coz_([]);
        const dinle = (e) => { if (e.data && e.data.no === no) { w.removeEventListener("message", dinle); w.removeEventListener("error", hata); coz_(e.data.uyan.map((i) => i + bas)); } };
        const hata = (e) => { w.removeEventListener("message", dinle); w.removeEventListener("error", hata); red(e); };
        w.addEventListener("message", dinle); w.addEventListener("error", hata);
        w.postMessage({ tur: "tara", parcalar: dilimP, no });
      })));
      return sonuc.flat();
    } catch (e) { /* a worker failed to load: check here instead */ _havuz = null; }
  }
  const uyan = [];
  for (let i = 0; i < parcalar.length; i++) {
    if (i && i % dilim === 0) await new Promise((r) => setTimeout(r, 0));
    try { const t = gorusEtiketi(ecdh(sk, parcalar[i].subarray(0, 33))); if (t[0] === parcalar[i][33] && t[1] === parcalar[i][34]) uyan.push(i); } catch (e) { /* not a point */ }
  }
  return uyan;
}

/**
 * Find my messages in a list of MesajKutusu2 events ({gonderen, id, sifreli, ...}).
 * Returns the ones I can open, oldest first as given, each with
 * { ...event, kimden, kime, bitis, metin, kiminle }. Results are remembered
 * for this page load, so later scans only look at new events.
 */
export async function tara(olaylar, { sk, ben, dilim = 200, isci = true }) {
  const yeni = [], adaylar = [], parcalar = [];
  for (const m of olaylar) {
    const k = _anahtar(ben, m);
    if (_acilan.has(k)) continue;
    let b;
    try { b = getBytes(m.sifreli); } catch (e) { _acilan.set(k, null); continue; }
    if (b.length < BASLIK + 12 + 16 + IC_BASLIK || b[0] !== SURUM) { _acilan.set(k, null); continue; }
    if (kucuk(m.gonderen) === kucuk(ben)) adaylar.push([m, b, k]);
    else { yeni.push([m, b, k]); parcalar.push(b.slice(1, 36)); }
  }
  for (const i of await etiketleriTara(parcalar, sk, dilim, isci)) adaylar.push(yeni[i]);
  for (const [, , k] of yeni) _acilan.set(k, null);
  for (const [m, b, k] of adaylar) {
    let v = null;
    try {
      const a = await coz(b, { sk, ben, gonderen: m.gonderen });
      v = { ...m, ...a, kiminle: kucuk(m.gonderen) === kucuk(ben) ? a.kime : m.gonderen };
    } catch (e) { v = null; }
    _acilan.set(k, v);
  }
  return olaylar.map((m) => _acilan.get(_anahtar(ben, m))).filter(Boolean);
}
export const unut = () => _acilan.clear();

/** Has this message passed its disappearing time? (`simdi` in ms) */
export const suresiDoldu = (m, simdi = Date.now()) => !!m.bitis && m.bitis * 1000 <= simdi;

/**
 * Is an opened message shown? Not when its sender deleted it (`silinen`: ids),
 * I hid it here (`gizli`: ids), it disappeared, or I blocked its sender here (`engel`).
 * Deleted / disappeared = removed from the app for both sides; the encrypted copy stays on Arc.
 */
export function gorunurMu(m, { ben, silinen, gizli, engel, simdi = Date.now() }) {
  const id = kucuk(m.id);
  if (silinen && silinen.has(id)) return false;
  if (gizli && gizli.has(id)) return false;
  if (suresiDoldu(m, simdi)) return false;
  if (engel && kucuk(m.gonderen) !== kucuk(ben) && engel.has(kucuk(m.gonderen))) return false;
  return true;
}
