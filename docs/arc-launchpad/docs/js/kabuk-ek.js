/* ===========================================================================
 * kabuk-ek.js — the "Install app" button and the service worker, for every
 * page (landing, app.html, designs/). The site is English only.
 *
 * Loaded as its own <script type="module"> so no page's existing code needs
 * to know about it. The page names where the controls go with an element
 * carrying data-kabuk-ek; its value is the path back to docs/ ("" or "../").
 * Pages without that element still get the worker.
 * =========================================================================== */
import { swKaydet, kurDugmesi } from "./pwa.js";

const yer = document.querySelector("[data-kabuk-ek]");
const kok = yer ? yer.getAttribute("data-kabuk-ek") || "" : (location.pathname.includes("/designs/") ? "../" : "");

/* the site had a Turkish option once; forget a choice a visitor stored then */
try { localStorage.removeItem("arcpulse-dil"); } catch (e) { /* storage blocked */ }
swKaydet(kok);

if (yer) {
  const tur = yer.getAttribute("data-kabuk-tur") || "";   // "landing" | "app" | "designs": picks the button classes
  const dugmeSinif = tur === "landing" ? "cta ghost kabuk-ek__kur" : "dugme dugme--sade dugme--kucuk kabuk-ek__kur";
  yer.style.cssText += ";display:flex;align-items:center;gap:6px;flex:none";
  /* the install button: an icon plus a label; on a phone only the icon, so the wallet button keeps its place */
  const kur = kurDugmesi(dugmeSinif);
  const etiket = kur.textContent;
  kur.textContent = "";
  kur.setAttribute("aria-label", etiket);
  kur.append(Object.assign(document.createElement("span"), { innerHTML: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="display:block"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
    Object.assign(document.createElement("span"), { className: "kabuk-ek__yazi", textContent: etiket }));
  kur.style.gap = "6px";
  kur.style.alignItems = "center";
  yer.append(kur);
  /* one small rule set, injected once (the pages allow inline styles, not inline scripts) */
  const stil = document.createElement("style");
  stil.textContent = "@media (max-width:640px){.kabuk-ek__yazi{display:none}.kabuk-ek__kur{padding:6px 8px!important;min-width:0}}" +
    "@media (max-width:480px){.ustbar__ara{min-width:0}.ustbar__ara .girdi{min-width:0;width:100%}.kabuk-ek__kur{padding:5px 6px!important}" +
    ".dz-ust{gap:8px}.dz-ust__marka{font-size:var(--boy-m)}.dz-ust__ana{font-size:var(--boy-xs)}}";
  document.head.append(stil);
}
