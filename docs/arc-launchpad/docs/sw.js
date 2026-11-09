/* ===========================================================================
 * sw.js — the service worker that makes the app and Designs installable
 *
 * Scope: docs/ (the landing page, app.html and designs/). Registered by
 * js/pwa.js. It keeps a copy of the site's own static files so the shell
 * opens on a flaky phone connection, and nothing else:
 *
 *   - only same-origin GET requests are handled. Chain RPCs, relay, Irys,
 *     WalletConnect and every other host go straight to the network: the
 *     worker never sees them in its cache and never answers for them;
 *   - pages (HTML), scripts, styles and the manifests: network first, the
 *     cached copy only when the network fails. A deploy is picked up on the
 *     next load, and old scripts are never mixed with a new page;
 *   - docs/veri/ (prices, archives, settings JSON): never cached here. It is
 *     chain data and must be fresh; the browser's own HTTP cache rules apply;
 *   - vendored libraries, icons, images, fonts, wasm: served from the cache
 *     and refreshed in the background (stale-while-revalidate).
 *
 * Nothing about the visitor is stored or sent: the cache holds the site's
 * public files only, and the worker makes no request the page did not make.
 * =========================================================================== */
const SURUM = "arcpulse-v2";   // v2 (9 Nov 2026): pages and scripts revalidate with the server on every load
const KABUK = ["./", "./index.html", "./app.html", "./designs/", "./app.webmanifest", "./designs/manifest.webmanifest",
  "./ikon/app-192.png", "./ikon/designs-192.png"];

self.addEventListener("install", (e) => {
  /* best effort: one missing file must not stop the worker from installing */
  e.waitUntil(caches.open(SURUM).then((c) => Promise.all(KABUK.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith("arcpulse-") && x !== SURUM).map((x) => caches.delete(x)))));
});

const KOK = new URL("./", self.location).pathname;
const kalici = (yol) => /\.(png|webp|jpg|jpeg|svg|ico|woff2?|ttf|wasm|mv)$/i.test(yol) || yol.startsWith(KOK + "vendor/") || yol.startsWith(KOK + "ikon/");

async function agOnce(istek) {
  const c = await caches.open(SURUM);
  try {
    /* "no-cache": always ask the server (an unchanged file costs a 304), so a phone never runs scripts the HTTP cache kept from before a deploy */
    const y = await fetch(istek, { cache: "no-cache" });
    if (y && y.ok && y.type === "basic") c.put(istek, y.clone()).catch(() => {});
    return y;
  } catch (hata) {
    const eski = await c.match(istek, { ignoreSearch: istek.mode === "navigate" });
    if (eski) return eski;
    if (istek.mode === "navigate") {
      const kabuk = await c.match(new URL("./app.html", self.location).href);
      if (kabuk) return kabuk;
    }
    throw hata;
  }
}

async function onbellekOnce(istek, olay) {
  const c = await caches.open(SURUM);
  const eski = await c.match(istek);
  const tazele = fetch(istek).then((y) => { if (y && y.ok && y.type === "basic") c.put(istek, y.clone()).catch(() => {}); return y; });
  if (eski) { olay.waitUntil(tazele.catch(() => {})); return eski; }
  return tazele;
}

self.addEventListener("fetch", (e) => {
  const q = e.request;
  if (q.method !== "GET") return;
  const u = new URL(q.url);
  if (u.origin !== self.location.origin) return;          // RPCs and every other host: not ours to answer
  if (!u.pathname.startsWith(KOK)) return;
  if (u.pathname.startsWith(KOK + "veri/")) return;        // chain data: always from the network
  if (q.headers.has("range")) return;
  e.respondWith(kalici(u.pathname) ? onbellekOnce(q, e) : agOnce(q));
});
