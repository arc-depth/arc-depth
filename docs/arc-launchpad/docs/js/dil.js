/* ===========================================================================
 * dil.js — interface language (English by default, Turkish, room for more)
 *
 * HOW IT WORKS
 *   The pages and views keep writing English, as they always have. When the
 *   visitor picks another language this module translates what is on screen
 *   from a dictionary (js/dil/<code>.js) keyed by the English text itself:
 *     metin   exact strings: a text node, or a placeholder / title /
 *             aria-label, whose trimmed text equals the key is replaced;
 *     kalip   [RegExp, replacement] for strings built around a value
 *             ("Trade on Base"); the replacement may be a function;
 *     html    for an element marked data-i18n="key" in a static page (a
 *             paragraph with inline <b> or links), its whole inner HTML.
 *   A MutationObserver translates whatever the views render later, so a
 *   view module needs no change to be translated, and a string missing from
 *   the dictionary simply stays English.
 *
 * ADDING A LANGUAGE
 *   Add its code to DILLER and a js/dil/<code>.js exporting the same shape
 *   as js/dil/tr.js. Nothing else changes.
 *
 * The choice is kept in localStorage on this device only (wrapped: storage
 * may be blocked), and switching reloads the page so every view is drawn
 * once, in one language. Nothing is sent anywhere.
 * =========================================================================== */

export const DILLER = { en: "English", tr: "Türkçe" };
const ANAHTAR = "arcpulse-dil";

export function dilAl() {
  let d = null;
  try { d = localStorage.getItem(ANAHTAR); } catch (e) { /* storage blocked */ }
  return d && DILLER[d] ? d : "en";
}

export function dilSec(kod) {
  if (!DILLER[kod]) return;
  try { localStorage.setItem(ANAHTAR, kod); } catch (e) { /* storage blocked: the choice lasts this page only */ }
  location.reload();
}

let SOZ = null;            // the active dictionary (null in English)
const _yazilan = new WeakMap();   // text nodes we wrote, so the observer skips them
const ATLA = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
const OZNITELIK = ["placeholder", "title", "aria-label"];
const bosluk = (s) => s.replace(/\s+/g, " ").trim();

/** Translate one string; returns it unchanged when there is no entry. */
export function t(s) {
  if (!SOZ || s == null) return s;
  const k = bosluk(String(s));
  if (!k) return s;
  const m = SOZ.metin[k];
  if (m != null) return m;
  if (k.length > 400) return s;
  for (const [re, yeni] of SOZ.kalip) {
    const r = k.match(re);
    if (r) return typeof yeni === "function" ? yeni(...r, t) : k.replace(re, yeni);
  }
  return s;
}

function metinCevir(n) {
  const eski = n.data;
  if (_yazilan.get(n) === eski) return;
  if (!/[A-Za-z]/.test(eski)) return;
  const yeni = t(eski);
  if (yeni === eski) return;
  const bas = eski.match(/^\s*/)[0], son = eski.match(/\s*$/)[0];
  const v = bas + yeni + son;
  _yazilan.set(n, v);
  n.data = v;
}

function ogeCevir(e) {
  if (e.hasAttribute("data-i18n") && SOZ.html) {
    const h = SOZ.html[e.getAttribute("data-i18n")];
    if (h != null && e.getAttribute("data-i18n-ok") !== "1") { e.innerHTML = h; e.setAttribute("data-i18n-ok", "1"); }
  }
  for (const a of OZNITELIK) {
    const v = e.getAttribute(a);
    if (v && /[A-Za-z]/.test(v)) { const y = t(v); if (y !== v) e.setAttribute(a, y); }
  }
  if (e.tagName === "INPUT" && (e.type === "button" || e.type === "submit") && e.value) e.value = t(e.value);
}

function agacCevir(kok) {
  if (!SOZ || !kok) return;
  if (kok.nodeType === 3) { if (!atlanir(kok.parentNode)) metinCevir(kok); return; }
  if (kok.nodeType !== 1 && kok.nodeType !== 9) return;
  if (kok.nodeType === 1) { if (atlanir(kok)) return; ogeCevir(kok); }
  const w = document.createTreeWalker(kok, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && (ATLA.has(n.tagName) || n.hasAttribute("data-i18n-yok") || n.isContentEditable) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) metinCevir(n); else ogeCevir(n); }
}
function atlanir(e) {
  for (let x = e; x && x.nodeType === 1; x = x.parentNode) if (ATLA.has(x.tagName) || x.hasAttribute("data-i18n-yok")) return true;
  return false;
}

/** Load the chosen language and translate the page, now and as it changes. Safe to call twice. */
let _basladi = null;
export function dilBaslat() {
  if (_basladi) return _basladi;
  const kod = dilAl();
  if (kod === "en") return (_basladi = Promise.resolve("en"));
  _basladi = import("./dil/" + kod + ".js").then((m) => {
    const d = m.default || {};
    SOZ = { metin: d.metin || {}, kalip: d.kalip || [], html: d.html || {} };
    document.documentElement.lang = kod;
    agacCevir(document.documentElement);
    new MutationObserver((kayitlar) => {
      for (const k of kayitlar) {
        if (k.type === "characterData") agacCevir(k.target);
        else if (k.type === "attributes") { if (k.target.nodeType === 1 && !atlanir(k.target)) ogeCevir(k.target); }
        else for (const n of k.addedNodes) agacCevir(n);
      }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: OZNITELIK });
    return kod;
  }).catch(() => "en");
  return _basladi;
}

/** The language picker: a small <select>; `sinif` is the page's own class for it. */
export function dilSecici(sinif = "") {
  const s = document.createElement("select");
  s.className = sinif;
  s.setAttribute("aria-label", "Language / Dil");
  s.setAttribute("data-dil-secici", "");
  s.setAttribute("data-i18n-yok", "");
  const su = dilAl();
  for (const [kod, ad] of Object.entries(DILLER)) {
    const o = document.createElement("option");
    o.value = kod;
    o.textContent = kod.toUpperCase();
    o.title = ad;
    if (kod === su) o.selected = true;
    s.append(o);
  }
  s.addEventListener("change", () => dilSec(s.value));
  return s;
}
