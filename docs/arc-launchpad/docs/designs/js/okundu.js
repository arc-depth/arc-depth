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
