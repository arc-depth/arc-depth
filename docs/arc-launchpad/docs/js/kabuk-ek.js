/* ===========================================================================
 * kabuk-ek.js — the language picker, the "Install app" button and the
 * service worker, for every page (landing, app.html, designs/)
 *
 * Loaded as its own <script type="module"> so no page's existing code needs
 * to know about it. The page names where the controls go with an element
 * carrying data-kabuk-ek; its value is the path back to docs/ ("" or "../").
 * Pages without that element still get the translation and the worker.
 * =========================================================================== */
import { dilBaslat, dilSecici } from "./dil.js";
import { swKaydet, kurDugmesi } from "./pwa.js";

const yer = document.querySelector("[data-kabuk-ek]");
const kok = yer ? yer.getAttribute("data-kabuk-ek") || "" : (location.pathname.includes("/designs/") ? "../" : "");

/* product names stay as they are in every language */
for (const e of document.querySelectorAll(".dz-ust__marka, .ustbar__marka span, .brand b")) e.setAttribute("data-i18n-yok", "");
dilBaslat();
swKaydet(kok);

if (yer) {
  const tur = yer.getAttribute("data-kabuk-tur") || "";   // "landing" | "app" | "designs": picks the button classes
  const dugmeSinif = tur === "landing" ? "cta ghost kabuk-ek__kur" : "dugme dugme--sade dugme--kucuk kabuk-ek__kur";
  const seciciSinif = tur === "landing" ? "kabuk-ek__dil kabuk-ek__dil--landing" : "girdi kabuk-ek__dil";
  yer.style.cssText += ";display:flex;align-items:center;gap:6px;flex:none";
  const secici = dilSecici(seciciSinif);
  /* compact on every page: the top bars are already full on a phone */
  secici.style.cssText = tur === "landing"
    ? "width:auto;padding:7px 8px;border-radius:10px;border:1px solid var(--line2);background:rgba(255,255,255,.03);color:var(--tx);font:600 12.5px Inter,sans-serif;cursor:pointer"
    : "width:auto;min-width:0;padding:4px 6px;height:auto;font-size:12px;cursor:pointer";
  /* the install button: an icon plus a label; on a phone only the icon, so the wallet button keeps its place */
  const kur = kurDugmesi(dugmeSinif);
  const etiket = kur.textContent;
  kur.textContent = "";
  kur.setAttribute("aria-label", etiket);
  kur.append(Object.assign(document.createElement("span"), { innerHTML: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="display:block"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
    Object.assign(document.createElement("span"), { className: "kabuk-ek__yazi", textContent: etiket }));
  kur.style.gap = "6px";
  kur.style.alignItems = "center";
  yer.append(kur, secici);
  /* one small rule set, injected once (the pages allow inline styles, not inline scripts) */
  const stil = document.createElement("style");
  stil.textContent = "@media (max-width:640px){.kabuk-ek__yazi{display:none}.kabuk-ek__kur{padding:6px 8px!important;min-width:0}}" +
    "@media (max-width:480px){.ustbar__ara{min-width:0}.ustbar__ara .girdi{min-width:0;width:100%}.kabuk-ek__dil{padding:3px 2px!important}.kabuk-ek__kur{padding:5px 6px!important}" +
    ".dz-ust{gap:8px}.dz-ust__marka{font-size:var(--boy-m)}.dz-ust__ana{font-size:var(--boy-xs)}}";
  document.head.append(stil);
}
