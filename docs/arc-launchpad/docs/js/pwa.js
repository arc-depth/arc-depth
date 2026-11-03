/* ===========================================================================
 * pwa.js — install to the home screen
 *
 *   swKaydet(kok)   registers the service worker (docs/sw.js); `kok` is the
 *                   path from the page to docs/ ("" or "../")
 *   kurDugmesi()    an "Install app" button, hidden until the browser says the
 *                   page can be installed (beforeinstallprompt: Chrome, Edge,
 *                   Samsung Internet, Android). Where there is no such event
 *                   (iOS Safari: Share, then Add to Home Screen; Firefox) the
 *                   button never shows, so it never promises what it cannot do.
 *
 * No analytics: whether somebody installs is not recorded anywhere.
 * =========================================================================== */

let _istem = null;
const _dugmeler = new Set();
const tazele = () => { for (const b of _dugmeler) b.style.display = _istem ? "" : "none"; };

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); _istem = e; tazele(); });
  window.addEventListener("appinstalled", () => { _istem = null; tazele(); });
}

/** Register docs/sw.js. Skipped where service workers are unavailable (file://, some in-app browsers). */
export function swKaydet(kok = "") {
  try {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register(kok + "sw.js", { scope: kok || "./" }).catch(() => {});
  } catch (e) { /* a blocked registration only means no offline shell */ }
}

/** The install button; `sinif` is the page's own button class. */
export function kurDugmesi(sinif = "", yazi = "Install app") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = sinif;
  b.textContent = yazi;
  b.style.display = _istem ? "" : "none";
  b.setAttribute("data-pwa-kur", "");
  b.title = "Add ARC PULSE to your home screen";
  b.addEventListener("click", async () => {
    if (!_istem) return;
    const e = _istem;
    _istem = null; tazele();
    try { await e.prompt(); await e.userChoice; } catch (x) { /* the dialog was dismissed */ }
  });
  _dugmeler.add(b);
  return b;
}
