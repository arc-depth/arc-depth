/* ===========================================================================
 * designs/js/app.js — ARC PULSE Designs, the standalone site (docs/designs/)
 *
 * A social home for designer NFTs (TasarimNFT2 on Arc): a feed of
 * the profiles you follow, Explore, profiles, design pages, messages and
 * publishing. It reuses the main app's modules (docs/js/designs/*,
 * cuzdan.js, ui.js) read-only; the main app keeps its own #/designs pages.
 *
 * Routes (hash):
 *   #/                 feed (followed profiles first; Explore without a wallet)
 *   #/explore          every design: newest, popular, for sale, by price; search
 *   #/d/<id>           a design
 *   #/u/<address>      a profile (#/@handle resolves the handle)
 *   #/me               the connected wallet's profile
 *   #/messages[/<a>]   inbox / one conversation
 *   #/publish          publish a design (the main app's flow, wrapped)
 *   #/license          the license every design carries
 * The main app's own Designs links (#/designs/...) are understood too, and
 * any other route (a token's trade page, Create) opens in the main app.
 *
 * No backend, no analytics, nothing about the visitor stored. Public pages
 * need no wallet; one is asked for only when the visitor acts.
 * =========================================================================== */

/* Modules of the main app fetch their site config relative to the page ("veri/…"); this page
   lives one folder down, so those requests are pointed at the main app's folder. */
const _fetch = window.fetch.bind(window);
window.fetch = (girdi, ayar) => _fetch(typeof girdi === "string" && /^veri\//.test(girdi) ? "../" + girdi : girdi, ayar);

const { el, temizle, cuzdan, S, kisa, ikon, avatar, isim, cuzdanSec, ANA, yukleniyor } = await import("./ortak.js");
const SO = await import("./sosyal.js");
const { geriDugmesi } = await import("../../js/geri.js");

const icerik = document.getElementById("dz-icerik");
const SEKMELER = [
  ["", "Pulse", "ev"], ["explore", "Discover", "kesfet"], ["messages", "Inbox", "mesaj"], ["publish", "Publish", "arti"], ["me", "Studio", "kisi"]
];

/* ---- the shell: side rail (desktop), bottom bar (phone), top bar ---- */
function kabukCiz() {
  const yan = document.getElementById("dz-yan");
  const alt = document.getElementById("dz-alt");
  temizle(yan); temizle(alt);
  yan.append(el("a", { sinif: "dz-marka", attr: { href: "#/" } }, [markaIkon(), el("span", { yazi: "ARC PULSE Designs" })]));
  for (const [k, ad, ik] of SEKMELER) {
    yan.append(el("a", { sinif: "dz-yan__oge", attr: { href: "#/" + k, "data-sekme": k } }, [ik === "kisi" && cuzdan.hesap() ? avatar(cuzdan.hesap(), 24) : ikon(ik), el("span", { yazi: ad })]));
    alt.append(el("a", { sinif: "dz-alt__oge", attr: { href: "#/" + k, "data-sekme": k } }, [ik === "kisi" && cuzdan.hesap() ? avatar(cuzdan.hesap(), 24) : ikon(ik, 24), el("span", { sinif: "dz-alt__ad", yazi: ad })]));
  }
  yan.append(el("div", { sinif: "dz-yan__bosluk" }),
    el("a", { sinif: "dz-yan__oge dz-yan__ana", attr: { href: ANA + "#/kesfet" } }, [ikon("geri"), el("span", { yazi: "ARC PULSE app" })]),
    el("a", { sinif: "dz-yan__kucuk", attr: { href: "#/license" }, yazi: "License" }));
  cuzdanDugme();
  aktifIsaretle();
}
function markaIkon() {
  return el("span", { sinif: "dz-marka__ikon", attr: { "aria-hidden": "true" }, html: '<svg viewBox="0 0 32 32" width="28" height="28"><rect width="32" height="32" rx="8" fill="#7c5cff"/><path d="M6 17h5l3-7 4 14 3-7h5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
}
function cuzdanDugme() {
  const yer = document.getElementById("dz-cuzdan");
  temizle(yer);
  const h = cuzdan.hesap();
  if (!h) { yer.append(el("button", { sinif: "dugme dugme--marka dugme--kucuk", attr: { type: "button" }, yazi: "Connect", on: { click: () => cuzdanSec() } })); return; }
  const menu = el("div", { sinif: "dz-menu", attr: { hidden: "" } }, [
    el("a", { attr: { href: "#/me" }, yazi: "My profile" }),
    el("a", { attr: { href: ANA + "#/portfoy" }, yazi: "Portfolio (main app)" }),
    el("button", { attr: { type: "button" }, yazi: "Disconnect", on: { click: async () => { menu.hidden = true; await cuzdan.kes(); } } }),
    el("button", { attr: { type: "button" }, yazi: "Disconnect and forget this device", on: { click: async () => { menu.hidden = true; await cuzdan.unut(); } } })
  ]);
  const b = el("button", { sinif: "dz-hesap", attr: { type: "button", "aria-haspopup": "menu" }, on: { click: (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; } } }, [avatar(h, 24), isim(h)]);
  document.addEventListener("click", () => { menu.hidden = true; });
  yer.append(el("div", { sinif: "dz-menu-kap" }, [b, menu]));
}
function aktifIsaretle() {
  const y = yolAl().yol;
  const k = y === "" ? "" : y.split("/")[0];
  const sek = k === "u" && cuzdan.hesap() && S.TASARIM && y.slice(2).toLowerCase() === String(cuzdan.hesap()).toLowerCase() ? "me" : k;
  for (const a of document.querySelectorAll("[data-sekme]")) {
    if (a.getAttribute("data-sekme") === sek) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
}

/* ---- routing ---- */
function yolAl() {
  let h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const [yol, sorgu] = h.split("?");
  return { yol: yol.replace(/\/+$/, ""), param: new URLSearchParams(sorgu || "") };
}
let _sira = 0;
async function git() {
  let { yol, param } = yolAl();
  /* the main app's Designs links, as the wrapped publish page and old bookmarks write them */
  if (yol === "designs" || yol.startsWith("designs/")) {
    const alt = yol.slice(8);
    location.replace("#/" + (alt === "feed" ? "" : alt) + (param.toString() ? "?" + param : ""));
    return;
  }
  const BIZIM = /^(|explore|me|publish|license|messages(\/0x[0-9a-fA-F]{40})?|d\/\d+|u\/0x[0-9a-fA-F]{40}|@[a-z0-9_]{3,20})$/;
  if (!BIZIM.test(yol)) { location.href = ANA + location.hash; return; }
  const sira = ++_sira;
  aktifIsaretle();
  temizle(icerik);
  icerik.append(yukleniyor());
  window.scrollTo(0, 0);
  const ctx = { cuzdan, param };
  let sayfa;
  try {
    if (yol === "" ) sayfa = await (await import("./kesfet.js")).akis(ctx);
    else if (yol === "explore") sayfa = await (await import("./kesfet.js")).kesfet(ctx);
    else if (yol.startsWith("d/")) sayfa = await (await import("./tasarim.js")).tasarimSayfasi(ctx, Number(yol.slice(2)));
    else if (yol.startsWith("u/")) sayfa = await (await import("./profil.js")).profilSayfasi(ctx, yol.slice(2));
    else if (yol.startsWith("@")) {
      const a = await SO.sahibi(yol.slice(1)).catch(() => null);
      if (a) { location.replace("#/u/" + a); return; }
      sayfa = el("div", { sinif: "bos" }, [el("div", { sinif: "bos__baslik", yazi: SO.PROFIL_VAR ? "No profile has the handle " + yol : "Profiles open soon" })]);
    }
    else if (yol === "me") {
      if (cuzdan.hesap()) { location.replace("#/u/" + cuzdan.hesap()); return; }
      sayfa = (await import("./profil.js")).benimBos(ctx);
    }
    else if (yol.startsWith("messages")) sayfa = await (await import("./mesajlar.js")).mesajSayfasi(ctx, yol.split("/")[1] || null);
    else if (yol === "publish") sayfa = await (await import("./yayinla.js")).yayinlaSayfasi(ctx);
    else if (yol === "license") sayfa = await (await import("./yayinla.js")).lisansSayfasi(ctx);
  } catch (e) {
    sayfa = el("div", { sinif: "hata" }, [el("div", { sinif: "hata__baslik", yazi: "Could not read Designs from Arc" }), el("div", { yazi: (e && e.message) || String(e) })]);
  }
  if (sira !== _sira) return;   // a newer navigation won
  temizle(icerik);
  /* every page but the feed opens with a Back button (back within the site, else the feed) */
  if (yol !== "") icerik.append(el("div", { sinif: "geri-satir" }, [geriDugmesi("#/", "geri-dugme dz-geri-dugme")]));
  icerik.append(sayfa);
  /* a seller with sales waiting for the file key sees them on every page */
  if (cuzdan.hesap() && S.SURUM === 2) {
    import("../../js/designs/teslim.js").then((T) => T.teslimBandi(cuzdan)).then((b) => { if (b && sira === _sira) { const g = icerik.querySelector(":scope > .geri-satir"); if (g) g.after(b); else icerik.prepend(b); } }).catch(() => {});
  }
}

let _sonHesap = cuzdan.hesap();
cuzdan.dinle(({ hesap } = {}) => {
  const h = hesap !== undefined ? hesap : cuzdan.hesap();
  if (String(h || "").toLowerCase() === String(_sonHesap || "").toLowerCase()) { cuzdanDugme(); return; }
  _sonHesap = h;
  kabukCiz();
  git();
});
window.addEventListener("hashchange", git);
window.addEventListener("cuzdan-yok", () => { cuzdanSec(); });
kabukCiz();
git();
