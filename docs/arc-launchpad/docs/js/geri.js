/* ===========================================================================
 * geri.js — the Back button for hash-routed pages (main app and Designs)
 *
 * Owner, 2 Nov 2026: a page had no way back; you stayed where you landed.
 * The button goes back within this site when there is somewhere to go
 * (the visitor came here by a link inside the site), and otherwise opens
 * the site's home, so a page opened from an outside link never sends the
 * visitor off the site. Nothing is stored; the trail lives in memory.
 * =========================================================================== */
import { el } from "./ui.js";

const iz = [location.hash || "#/"];
window.addEventListener("hashchange", () => {
  const h = location.hash || "#/";
  if (iz.length > 1 && iz[iz.length - 2] === h) iz.pop();   // the browser's or our Back
  else if (iz[iz.length - 1] !== h) iz.push(h);
});

/** A Back button; `ev` is the hash of the site's home, used when there is no trail. */
export function geriDugmesi(ev, sinif = "geri-dugme") {
  return el("button", {
    sinif, attr: { type: "button", "aria-label": "Back" },
    html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg><span>Back</span>',
    on: { click: () => { if (iz.length > 1) history.back(); else location.hash = ev; } }
  });
}
