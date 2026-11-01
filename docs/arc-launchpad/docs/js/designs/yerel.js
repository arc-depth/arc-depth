/* ===========================================================================
 * designs/yerel.js — likes and follows, saved on this device only
 *
 * The owner's rule: the platform stores nothing about anyone. So a like or a
 * follow is a message the viewer's wallet signs, kept in THIS browser's
 * localStorage and nowhere else. Other people do not see it, and clearing
 * the browser (or "Disconnect and forget this device") removes it. Every
 * read and write is in try/catch: private windows and blocked storage just
 * mean nothing is remembered.
 *
 * FUTURE (not built): the same signed messages could be published to a
 * decentralized store (e.g. Irys items tagged Type=like / Type=follow, or an
 * on-chain registry) so counts become public — the signatures are already
 * in a form anyone can verify, so nothing here would have to change shape.
 * =========================================================================== */
import { verifyMessage } from "../../vendor/ethers.min.js";
import { imzala } from "./imza.js";
import { TASARIM } from "./sozlesme.js";

const ANAHTAR = "arcpulse-designs-yerel";

function oku() {
  try { const j = JSON.parse(localStorage.getItem(ANAHTAR) || "null"); if (j && typeof j === "object") return { begeni: j.begeni || {}, takip: j.takip || {} }; } catch (e) { /* storage blocked or broken */ }
  return { begeni: {}, takip: {} };
}
function yaz(d) { try { localStorage.setItem(ANAHTAR, JSON.stringify(d)); return true; } catch (e) { return false; } }

export const begeniMesaji = (ben, id, zaman) => "ARC PULSE Designs\nI like design #" + id + "\nContract: " + TASARIM.adres.toLowerCase() + " (Arc)\nWallet: " + ben + "\nAt: " + new Date(zaman).toISOString();
export const takipMesaji = (ben, kim, zaman) => "ARC PULSE Designs\nI follow designer " + String(kim).toLowerCase() + "\nWallet: " + ben + "\nAt: " + new Date(zaman).toISOString();

const gecerli = (k, mesaj, ben) => { try { return verifyMessage(mesaj, k.s).toLowerCase() === ben; } catch (e) { return false; } };

/** Did the connected wallet like `id` on this device? (signature checked) */
export function begendiMi(cuzdan, id) {
  const ben = String(cuzdan.hesap() || "").toLowerCase();
  const k = ben && oku().begeni[ben + ":" + id];
  return !!(k && gecerli(k, begeniMesaji(ben, id, k.t), ben));
}
export function takipMi(cuzdan, kim) {
  const ben = String(cuzdan.hesap() || "").toLowerCase();
  const k = ben && oku().takip[ben + ":" + String(kim).toLowerCase()];
  return !!(k && gecerli(k, takipMesaji(ben, kim, k.t), ben));
}
/** Designers the connected wallet follows on this device. */
export function takipEdilenler(cuzdan) {
  const ben = String(cuzdan.hesap() || "").toLowerCase();
  if (!ben) return [];
  const d = oku().takip;
  return Object.keys(d).filter((k) => k.startsWith(ben + ":")).map((k) => k.split(":")[1])
    .filter((kim) => gecerli(d[ben + ":" + kim], takipMesaji(ben, kim, d[ben + ":" + kim].t), ben));
}

/** Like / unlike. Liking asks for a signature; unliking only deletes the local entry. */
export async function begeniDegistir(cuzdan, id) {
  const ben = String(cuzdan.hesap() || (await cuzdan.bagla()) || "").toLowerCase();
  const d = oku();
  const k = ben + ":" + id;
  if (d.begeni[k]) { delete d.begeni[k]; yaz(d); return false; }
  const t = Date.now();
  d.begeni[k] = { t, s: await imzala(cuzdan, begeniMesaji(ben, id, t)) };
  if (!yaz(d)) throw new Error("This browser does not allow saving (private window or blocked storage).");
  return true;
}
export async function takipDegistir(cuzdan, kim) {
  const ben = String(cuzdan.hesap() || (await cuzdan.bagla()) || "").toLowerCase();
  const d = oku();
  const k = ben + ":" + String(kim).toLowerCase();
  if (d.takip[k]) { delete d.takip[k]; yaz(d); return false; }
  const t = Date.now();
  d.takip[k] = { t, s: await imzala(cuzdan, takipMesaji(ben, kim, t)) };
  if (!yaz(d)) throw new Error("This browser does not allow saving (private window or blocked storage).");
  return true;
}
