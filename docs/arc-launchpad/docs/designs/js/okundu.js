/* ===========================================================================
 * designs/js/okundu.js — this browser's "seen up to" marks, per wallet
 *
 * Convenience only, kept in this browser's localStorage (never sent
 * anywhere, never needed): the last Arc block whose notifications the
 * wallet has seen, and per conversation the last message block it has
 * read. A private window, cleared site data or a blocked storage simply
 * means everything recent shows as new again. Every access is wrapped in
 * try/catch.
 * =========================================================================== */
const k = (tur, ben) => "dz-" + tur + ":" + String(ben || "").toLowerCase();

function oku(anahtar) {
  try { const v = localStorage.getItem(anahtar); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function yaz(anahtar, v) {
  try { localStorage.setItem(anahtar, JSON.stringify(v)); } catch (e) { /* storage blocked: fine */ }
}

/** Last block whose notifications `ben` has seen in this browser (null = never). */
export function bildirimGoruldu(ben) {
  const v = oku(k("bildirim", ben));
  return v && Number.isInteger(v.blok) ? v.blok : null;
}
export function bildirimGorulduYaz(ben, blok) {
  if (Number.isInteger(blok)) yaz(k("bildirim", ben), { blok });
}

/** Per conversation partner (lowercase address): the last message block read. */
export function okunanlar(ben) {
  const v = oku(k("okundu", ben));
  return v && typeof v === "object" ? v : {};
}
export function okunduYaz(ben, kim, blok) {
  if (!Number.isInteger(blok)) return;
  const v = okunanlar(ben);
  const a = String(kim).toLowerCase();
  if ((v[a] || 0) >= blok) return;
  v[a] = blok;
  yaz(k("okundu", ben), v);
}

/** Whether browser notifications were switched on here (permission itself is the browser's). */
export function bildirimIzni(ben) { return !!(oku(k("bildirim-acik", ben)) || {}).acik; }
export function bildirimIzniYaz(ben, acik) { yaz(k("bildirim-acik", ben), { acik: !!acik }); }

/* ---- the private box (MesajKutusu2): choices kept in this browser only ----
   MesajKutusu2 hides recipients, so there is no on-chain block list: a block
   hides that wallet's messages in this browser. "Hide" is a local hide of one
   message; the disappearing-message choice is remembered per conversation.
   Lost with cleared site data (then simply set again). */
const kume = (tur, ben) => { const v = oku(k(tur, ben)); return new Set(Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : []); };
const kumeYaz = (tur, ben, s) => yaz(k(tur, ben), [...s].slice(-2000));

/** Wallets `ben` blocked here (lowercase). */
export const engelliler = (ben) => kume("engel2", ben);
export function engelYaz(ben, kim, evet) { const s = engelliler(ben); const a = String(kim).toLowerCase(); if (evet) s.add(a); else s.delete(a); kumeYaz("engel2", ben, s); }

/** Message ids `ben` hid for themselves here (lowercase). */
export const gizlenenler = (ben) => kume("gizle2", ben);
export function gizle(ben, id) { const s = gizlenenler(ben); s.add(String(id).toLowerCase()); kumeYaz("gizle2", ben, s); }

/** Disappearing time (seconds, 0 = off) `ben` chose for messages to `kim`. */
export function kaybolma(ben, kim) { const v = oku(k("kaybol2", ben)) || {}; const n = Number(v[String(kim).toLowerCase()]); return Number.isFinite(n) && n > 0 ? n : 0; }
export function kaybolmaYaz(ben, kim, sn) { const v = oku(k("kaybol2", ben)) || {}; const a = String(kim).toLowerCase(); if (sn > 0) v[a] = Number(sn); else delete v[a]; yaz(k("kaybol2", ben), v); }
