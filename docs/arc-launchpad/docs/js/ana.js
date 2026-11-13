/* ===========================================================================
 * ana.js — boot, navigation and routing
 *
 * The rail, the top nav and the mobile tab bar are all rendered from
 * yol.js. None of them is written in markup, which is why the navigation
 * cannot list a module that does not exist or miss one that does — the old
 * page kept its sections in HTML and the two had already drifted apart.
 *
 * ROUTING IS BY HASH
 *   Deliberate. This is served as static files from docs/, including on
 *   GitHub Pages, where a path-based router returns 404 on refresh for
 *   every route but the index. A hash route survives a refresh, a bookmark
 *   and a shared link, which is the whole point of having routes.
 *
 * VIEWS LOAD LAZILY
 *   `import()` per module, so opening the terminal does not pay for the
 *   chart library and opening a documentation page pays for almost nothing.
 *
 * A MODULE'S STATE IS ENFORCED HERE, NOT TRUSTED TO THE VIEW
 *   A route marked "yapim" or "dagitim" renders the honest state from
 *   ui.js and its view module is never even imported. That way a module
 *   cannot accidentally ship a live-looking screen: the router will not let
 *   it, and the only way to make a screen live is to change its `durum`
 *   and mean it.
 * =========================================================================== */

import { YOLLAR, GRUPLAR, yolBul, grubunYollari, ustSayfa } from "./yol.js";
import { el, temizle, dagitimBekliyor, yapimda, hata, iskelet, ikon, GRUP_RENK } from "./ui.js";
import { sponsorYeri } from "./sponsor.js";
import { cuzdan, cuzdanUygulamalari, mobilMi, tarayiciCuzdani, WC_ACIK } from "./cuzdan.js";
import { davetYakala } from "./davet.js";

const VARSAYILAN = "kesfet";

/* ---- the shell (12 Nov 2026 redesign) ---------------------------------------
   ONE NAVIGATION PER SCREEN SIZE
     Desktop: the left rail is the navigation, grouped by what a visitor came to do
     (Explore, Launch, Launch for…, You, ARCP & DAO, Build, Trust & data; yol.js GRUPLAR).
     The top bar holds only search, the presale chip, Create and the wallet: it used to
     list seven routes and a "More" menu of twenty-five, the same list as the rail in a
     different order.
     Phone: a bottom bar of five equal columns (Discover, Trade, Create, Portfolio, More);
     More (#/daha) is quick access plus every group. Every route has a home in both, which
     scripts/ray-kapsami.js checks. */
const ALT_BAR = ["kesfet", "terminal", "olustur", "portfoy"];

const kIcerik = document.getElementById("icerik");
const kRay = document.getElementById("ray");
const kUstYol = document.getElementById("ust-yol");
const kSekme = document.getElementById("sekmebar");
const kAra = document.getElementById("ust-ara");
const kCuzdanDugme = document.getElementById("cuzdan-dugme");

/* ---- phone layout ---------------------------------------------------------
   Phones open the phone layout (12 Nov 2026, user: phone first; app.html's viewport is width=device-width).
   The switch to the full desktop layout lives in More (#/daha) and in the wallet menu; in the desktop
   layout on a phone, the foot of the rail switches back. The choice is kept on this device only. */
const GORUNUM = "arcpulse-gorunum";
const gorunumOku = () => { try { return localStorage.getItem(GORUNUM); } catch (e) { return null; } };
if (gorunumOku() === "masaustu") {
  const m = document.querySelector('meta[name="viewport"]');
  if (m) m.setAttribute("content", "width=1280, viewport-fit=cover");
}
function gorunumDegistir() {
  try { localStorage.setItem(GORUNUM, gorunumOku() === "masaustu" ? "mobil" : "masaustu"); } catch (e) { /* storage may be blocked */ }
  location.reload();
}
window.addEventListener("arcpulse-gorunum", gorunumDegistir);

/* ---- navigation ------------------------------------------------------ */

const DURUM_ROZET = { dagitim: "Soon", yapim: "Soon" };
function yolLinki(y, sinifEk = "") {
  return el("a", {
    sinif: "yol-oge" + (y.durum === "yapim" ? " yol-oge--yapim" : "") + (y.ebeveyn ? " yol-oge--alt" : "") + sinifEk,
    /* a route with its own site (y.site, e.g. Designs -> designs/) opens it; its #/ route stays */
    attr: { href: y.site || "#/" + y.yol, title: y.ozet || y.ad },
    veri: { yol: y.yol }
  }, [
    el("span", { sinif: "yol-oge__ikon", html: ikon(y.ikon, "yol-oge__ikon") }),
    el("span", { sinif: "yol-oge__etiket", yazi: y.ad + (y.site && y.site !== "presale.html" ? " ↗" : "") }),
    /* the rail marks state before anybody clicks, in the two words used everywhere: Live (no badge) and Coming soon */
    DURUM_ROZET[y.durum] ? el("span", { sinif: "etiket etiket--uyari", yazi: DURUM_ROZET[y.durum], attr: { title: "Coming soon" } }) : null
  ]);
}

/* The rail folds: thirty-seven modules at once read as a wall. Explore and the group of the open page
   stay open; the others fold to their heading and open with a click. A visitor's own folding is kept on
   this device only (a convenience, nothing else is stored). */
const RAY_ANAHTAR = "arcpulse-ray2";
const rayOku = () => { try { return JSON.parse(localStorage.getItem(RAY_ANAHTAR) || "{}"); } catch (e) { return {}; } };
const OK_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* the rail's sponsor tile shows only on browsing pages: never on money or trust pages, and not where the page has its own slot */
const RAY_SPONSOR_YOLLARI = ["launches", "liderlik", "analitik", "genesis", "pazar", "gelistirici",
  "communities", "creators", "agents", "projects", "daos", "games", "baskets"];
let kRaySponsor = null;
function rayiCiz() {
  temizle(kRay);
  const secim = rayOku();
  const aktif = yolBul(hashiCoz().yol);
  const nav = el("nav", { sinif: "ray__nav", attr: { "aria-label": "Main navigation" } });
  for (const g of GRUPLAR) {
    const ogeler = grubunYollari(g.anahtar);
    if (!ogeler.length) continue;
    const acik = g.anahtar in secim ? secim[g.anahtar] : (g.anahtar === "kesif" || (aktif && aktif.grup === g.anahtar));
    const grup = el("div", { sinif: "ray__grup", veri: { grup: g.anahtar, kapali: acik ? "0" : "1" } });
    const baslik = el("button", { sinif: "ray__baslik ray__baslik--dugme", attr: { type: "button", "aria-expanded": String(acik), style: "--gr:" + (GRUP_RENK[g.anahtar] || "") } }, [
      el("b", {}, [el("i"), g.ad]), el("span", { sinif: "ray__sayi", yazi: String(ogeler.length) }), el("span", { html: OK_SVG })]);
    baslik.addEventListener("click", () => {
      const kapali = grup.dataset.kapali !== "1";
      grup.dataset.kapali = kapali ? "1" : "0";
      baslik.setAttribute("aria-expanded", String(!kapali));
      const yeni = rayOku(); yeni[g.anahtar] = !kapali;
      try { localStorage.setItem(RAY_ANAHTAR, JSON.stringify(yeni)); } catch (e) { /* storage may be blocked */ }
    });
    grup.append(baslik, ...ogeler.map((y) => yolLinki(y)));
    nav.append(grup);
  }
  /* the foot: every module, a sponsor tile when one is booked, and the way back to the phone layout */
  kRaySponsor = el("div", { sinif: "ray__sponsor" }, [sponsorYeri("rail", "rail")]);
  const ayak = el("div", { sinif: "ray__ayak" }, [
    yolLinki({ yol: "daha", ad: "All modules", ikon: "daha", durum: "canli", ozet: "Every module, its state and what each one is for." }),
    kRaySponsor,
    mobilMi() && gorunumOku() === "masaustu"
      ? el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Phone layout", on: { click: gorunumDegistir } }) : null,
  ]);
  kRay.append(nav, ayak);
}

/* the top bar: the presale chip (the one persistent ARCP entry) and Create, beside search and the wallet */
function ustYoluCiz() {
  temizle(kUstYol);
  kUstYol.append(
    el("a", { sinif: "ust-cip", attr: { href: "presale.html", title: "ARCP 2 presale on Arc" }, veri: { yol: "presale" } }, [el("i", { attr: { "aria-hidden": "true" } }), el("span", { sinif: "ust-cip__uzun", yazi: "ARCP presale" }), el("span", { sinif: "ust-cip__kisa", yazi: "Presale" })]),
    el("a", { sinif: "dugme dugme--marka ust-olustur", attr: { href: "#/olustur" }, veri: { yol: "olustur" } }, [el("span", { html: ikon("arti", "yol-oge__ikon") }), el("span", { yazi: "Create" })]));
}

function sekmeleriCiz() {
  temizle(kSekme);
  for (const ad of ALT_BAR) {   // the phone bar: Discover, Trade, Create (raised, centre), Portfolio, then More
    const y = yolBul(ad);
    if (!y) continue;
    kSekme.append(el("a", {
      sinif: "sekme-oge" + (ad === "olustur" ? " sekme-oge--olustur" : ""),
      attr: { href: "#/" + y.yol },
      veri: { yol: y.yol }
    }, [
      el("span", { sinif: "sekme-oge__kap", html: ikon(ad === "olustur" ? "arti" : y.ikon, "sekme-oge__ikon") }),
      el("span", { yazi: ad === "olustur" ? "Create" : y.kisa || y.ad })
    ]));
  }
  kSekme.append(el("a", {
    sinif: "sekme-oge",
    attr: { href: "#/daha" },
    veri: { yol: "daha" }
  }, [
    el("span", { sinif: "sekme-oge__kap", html: ikon("daha", "sekme-oge__ikon") }),
    el("span", { yazi: "More" })
  ]));
}

/* Search: tokens by name, symbol or address (Enter), and pages by name (the list under the box).
   On a phone the box is an icon that opens a full-width row under the bar. */
function sayfaAra(q) {
  q = q.toLowerCase();
  if (q.length < 2) return [];
  const puan = (y) => {
    const ad = (y.ad + " " + (y.kisa || "")).toLowerCase();
    if (ad.startsWith(q)) return 3;
    if (ad.split(/[\s/&…·-]+/).some((w) => w.startsWith(q))) return 2;
    return (y.ozet || "").toLowerCase().includes(q) && q.length >= 4 ? 1 : 0;
  };
  return YOLLAR.map((y) => ({ y, p: puan(y) })).filter((x) => x.p).sort((a, b) => b.p - a.p).slice(0, 6).map((x) => x.y);
}
function aramayiCiz() {
  temizle(kAra);
  const oneri = el("div", { sinif: "ust-ara__oneri", attr: { role: "listbox", hidden: true } });
  const kapat = () => { oneri.hidden = true; };
  const girdi = el("input", {
    sinif: "girdi",
    attr: {
      type: "search",
      placeholder: "Search tokens, launches or pages",
      "aria-label": "Search tokens and pages",
      autocomplete: "off",
      spellcheck: "false"
    },
    on: {
      input: () => {
        const bul = sayfaAra(girdi.value.trim());
        temizle(oneri);
        if (!bul.length) { kapat(); return; }
        oneri.append(el("div", { sinif: "ust-ara__et", yazi: "Pages" }), ...bul.map((y) => el("a", { attr: { href: y.site || "#/" + y.yol, role: "option" },
          on: { click: () => { kapat(); aramaKapat(); } } }, [el("span", { html: ikon(y.ikon) }), el("span", { yazi: y.ad })])),
          el("div", { sinif: "ust-ara__et", yazi: "Enter: search tokens for “" + girdi.value.trim() + "”" }));
        oneri.hidden = false;
      },
      blur: () => setTimeout(kapat, 200),
      keydown: (ev) => {
        if (ev.key === "Escape") { kapat(); aramaKapat(); return; }
        if (ev.key !== "Enter") return;
        const q = girdi.value.trim();
        if (!q) return;
        kapat(); aramaKapat();
        /* An address goes straight to its terminal; anything else filters
           the discovery list. Guessing which one the user meant is worse
           than deciding by shape. */
        location.hash = /^0x[0-9a-fA-F]{40}$/.test(q)
          ? "#/terminal?t=" + q
          : "#/kesfet?q=" + encodeURIComponent(q);
      }
    }
  });
  const ustbar = kAra.closest(".ustbar");
  const aramaKapat = () => { if (ustbar) ustbar.dataset.ara = "0"; acDugme.setAttribute("aria-expanded", "false"); };
  const acDugme = el("button", { sinif: "ust-ara__ac", attr: { type: "button", "aria-label": "Search", "aria-expanded": "false" }, html: ikon("ara"),
    on: { click: () => {
      const acik = ustbar && ustbar.dataset.ara === "1";
      if (ustbar) ustbar.dataset.ara = acik ? "0" : "1";
      acDugme.setAttribute("aria-expanded", String(!acik));
      if (!acik) setTimeout(() => girdi.focus(), 0);
    } } });
  kAra.before(acDugme);
  kAra.append(girdi, oneri);
  window.addEventListener("hashchange", aramaKapat);
}

function etkinIsaretle(aktif) {
  for (const a of document.querySelectorAll("[data-yol]")) {
    if (a.dataset.yol === aktif) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

/* ---- Back --------------------------------------------------------------
   Context-aware: back through this visit's own trail when there is one (the visitor came here by
   a link inside the app), otherwise to the page's parent: its group's home (Proposals → Platform DAO,
   Collateral vaults → Security, a launch form → Create …), never always to Discover. The trail lives
   in memory only. */
const iz = [location.hash || "#/"];
window.addEventListener("hashchange", () => {
  const h = location.hash || "#/";
  if (iz.length > 1 && iz[iz.length - 2] === h) iz.pop();   // the browser's or our Back
  else if (iz[iz.length - 1] !== h) iz.push(h);
});
function geriSatiri(yol) {
  const ust = ustSayfa(yol);
  const gecmis = iz.length > 1;
  if (!gecmis && !ust) return [];
  const dugme = el("button", {
    sinif: "geri-dugme", attr: { type: "button", "aria-label": gecmis ? "Back" : "Back to " + ust.ad },
    html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    on: { click: () => { if (iz.length > 1) history.back(); else location.hash = ust.site && !GORUNUMLER[ust.yol] ? ust.site : "#/" + ust.yol; } }
  });
  dugme.append(el("span", { yazi: gecmis ? "Back" : ust.ad }));
  return [el("div", { sinif: "geri-satir" }, [dugme])];
}

/* ---- routing -------------------------------------------------------- */

function hashiCoz() {
  const h = (location.hash || "").replace(/^#\/?/, "");
  let [yol, sorgu] = h.split("?");
  const param = new URLSearchParams(sorgu || "");
  /* #/designs/<sub> (the on-chain license URI is #/designs/license): the
     "designs" route with the rest in param "alt" */
  if (yol && yol.startsWith("designs/")) { param.set("alt", yol.slice(8)); yol = "designs"; }
  return {
    yol: yol || VARSAYILAN,
    param
  };
}

/* One module per route. Listed rather than built from the route name so a
   missing file is a clear error instead of a silent 404 import. */
const GORUNUMLER = {
  kesfet: () => import("./gorunum/kesfet.js"),
  olustur: () => import("./gorunum/merkez.js"),   // the one-pool launch: 5 collateral slots, any chain
  merkez: () => import("./gorunum/merkez.js"),
  "olustur-move": () => import("./gorunum/olustur.js"),   // paying from a Sui or Aptos wallet
  fthm: () => import("./gorunum/fthm-al-sat.js"),
  genesis: () => import("./gorunum/genesis.js"),
  terminal: () => import("./gorunum/terminal.js"),
  "move-token": () => import("./gorunum/move-token.js"),
  kasalar: () => import("./gorunum/kasalar.js"),
  portfoy: () => import("./gorunum/portfoy.js"),
  kalkan: () => import("./gorunum/kalkan.js"),
  zincirler: () => import("./gorunum/zincirler.js"),
  analitik: () => import("./gorunum/analitik.js"),
  liderlik: () => import("./gorunum/liderlik.js"),
  davet: () => import("./gorunum/davet.js"),   // referrals (DavetKaydi + DavetOdemesi)
  points: () => import("./gorunum/puan.js"),   // Pulse Points (13 Nov 2026)
  guvenlik: () => import("./gorunum/guvenlik.js"),
  /* Governance. These two read and WRITE to the live Governor, which is
     the one contract in this product that is already deployed. */
  dao: () => import("./gorunum/dao.js"),
  pazar: () => import("./gorunum/pazar.js"),
  gelistirici: () => import("./gorunum/gelistirici.js"),
  teklifler: () => import("./gorunum/teklifler.js"),
  dokuman: () => import("./gorunum/dokuman.js"),
  daha: () => import("./gorunum/daha.js"),
  advertise: () => import("./gorunum/advertise.js"),   // the sponsor menu (12 Nov 2026)
  squad: () => import("./gorunum/squad.js"),   // the Pulse Squad (12 Nov 2026)
  /* products (1 Nov 2026): one page per TurKaydi type, shared code in urun.js.
     "designs" (TasarimNFT, live 1 Nov 2026) has its own view, below. */
  communities: () => import("./gorunum/communities.js"),
  creators: () => import("./gorunum/creators.js"),
  agents: () => import("./gorunum/agents.js"),
  projects: () => import("./gorunum/projects.js"),
  daos: () => import("./gorunum/daos.js"),
  games: () => import("./gorunum/games.js"),
  baskets: () => import("./gorunum/baskets.js"),
  designs: () => import("./gorunum/designs.js"),
  vitrin: () => import("./gorunum/vitrin.js"),   // Market, demo (9 Nov 2026)
launches: () => import("./gorunum/launchlar.js"),   // every launch from ARC PULSE (12 Nov 2026)
    warp: () => import("./gorunum/warp.js")   // Warp (11 Nov 2026)
};

let sonCizim = 0;

/* A long page (four sections or more) gets "On this page": its section titles as chips under the
   cover, each one a jump to its section. Built from what the page already shows; nothing new is read. */
function sayfaIcindekiler(parca) {
  const basliklar = [...parca.querySelectorAll(":scope > .panel > .panel__baslik, :scope > .panel .panel__baslik")].filter((b, i, a) => a.indexOf(b) === i);
  if (basliklar.length < 4) return;
  const serit = el("nav", { sinif: "icindekiler", attr: { "aria-label": "On this page" } }, [el("span", { sinif: "icindekiler__et", yazi: "On this page" })]);
  basliklar.forEach((b, i) => {
    const bolum = b.closest(".panel");
    if (!bolum.id) bolum.id = "bolum-" + (i + 1);
    const tam = (b.textContent || "").trim().replace(/\s+/g, " ").split(" · ")[0];   // the short title, cut at a word, never mid-word
    const yazi = tam.length > 40 ? tam.slice(0, 40).replace(/\s+\S*$/, "") + "…" : tam;
    serit.append(el("button", { attr: { type: "button" }, yazi, on: { click: () => bolum.scrollIntoView({ behavior: "smooth", block: "start" }) } }));
  });
  const kapak = parca.querySelector(".sayfa-ust");
  if (kapak) kapak.after(serit); else parca.prepend(serit);
}

async function ciz() {
  const { yol, param } = hashiCoz();
  const kayit = yol === "daha"
    ? { yol: "daha", ad: "All modules", durum: "canli", ikon: "daha" }
    : yolBul(yol);

  etkinIsaretle(yol);
  document.body.classList.toggle("terminal-acik", yol === "terminal");
  document.body.dataset.yol = yol;
  /* the rail's sponsor tile: browsing pages only (never money or trust pages) */
  if (kRaySponsor) kRaySponsor.hidden = !RAY_SPONSOR_YOLLARI.includes(yol);
  /* every page but the home and Trade (a bottom-bar tab; a token page has its own way back) opens with Back */
  const geri = () => yol === "kesfet" || yol === "terminal" ? [] : geriSatiri(yol);

  if (!kayit) {
    temizle(kIcerik).append(...geri(), hata("No such page", "You asked for: /" + yol));
    kIcerik.dataset.cizildi = "1";
    return;
  }

  document.title = kayit.ad === "Discover" ? "ARC PULSE" : kayit.ad + " — ARC PULSE";

  /* The router, not the view, decides whether a module may render. */
  if (kayit.durum === "yapim") {
    temizle(kIcerik).append(...geri(), yapimda(kayit));
    kIcerik.dataset.cizildi = "1";
    kIcerik.focus({ preventScroll: true });
    return;
  }

  /* a route that is its own page (presale.html) with no view here: go there */
  if (kayit.site && !GORUNUMLER[yol]) { location.replace(kayit.site); return; }

  const yukle = GORUNUMLER[yol];
  if (!yukle) {
    temizle(kIcerik).append(...geri(), yapimda(kayit));
    kIcerik.dataset.cizildi = "1";
    return;
  }

  /* A render in flight must not overwrite a newer one — the user can
     change route faster than an RPC round trip returns. */
  const bu = ++sonCizim;
  temizle(kIcerik).append(iskelet(4));

  try {
    const mod = await yukle();
    if (bu !== sonCizim) return;
    const parca = await mod.ciz({ kayit, param, cuzdan });
    if (bu !== sonCizim) return;
    temizle(kIcerik).append(...geri(), parca);
    if (yol !== "kesfet") sayfaIcindekiler(parca);   // Discover leads with its live board
  } catch (e) {
    if (bu !== sonCizim) return;
    temizle(kIcerik).append(...geri(),
      hata("This section failed to load", (e && e.message) || String(e))
    );
  }
  kIcerik.dataset.cizildi = "1";
  kIcerik.focus({ preventScroll: true });
}

/* ---- wallet button -------------------------------------------------- */

function cuzdanDugmesiniTazele() {
  const h = cuzdan.hesap();
  if (h) {
    kCuzdanDugme.textContent = h.slice(0, 6) + "…" + h.slice(-4);
    kCuzdanDugme.classList.remove("dugme--marka");
    kCuzdanDugme.classList.add("mono");
  } else {
    kCuzdanDugme.replaceChildren("Connect", el("span", { sinif: "cuzdan-uzun", yazi: "wallet" }));   // the button's own gap spaces the two words
    kCuzdanDugme.classList.add("dugme--marka");
    kCuzdanDugme.classList.remove("mono");
  }
}

kCuzdanDugme.addEventListener("click", () => {
  if (cuzdan.hesap()) { hesapMenusu(); return; }
  cuzdanSec();
});

/* Connected: the address button opens a small menu — portfolio, copy, disconnect. */
function hesapMenusu() {
  const eski = document.querySelector(".hesap-menu");
  if (eski) { eski.remove(); return; }
  const h = cuzdan.hesap();
  const kapat = () => { menu.remove(); document.removeEventListener("click", disari, true); };
  const disari = (e) => { if (!menu.contains(e.target) && e.target !== kCuzdanDugme) kapat(); };
  const satir = (yazi, f) => el("button", { sinif: "dugme dugme--sade", attr: { type: "button", style: "width:100%;text-align:left" }, yazi, on: { click: async () => { await f(); } } });
  const r = kCuzdanDugme.getBoundingClientRect();
  const menu = el("div", { sinif: "hesap-menu kart", attr: { role: "menu", style:
    "position:fixed;z-index:60;min-width:220px;padding:6px;top:" + Math.round(r.bottom + 6) + "px;right:" + Math.max(8, Math.round(innerWidth - r.right)) + "px" } }, [
    el("div", { sinif: "mono yazi--kucuk yazi--sessiz", attr: { style: "padding:6px 10px" }, yazi: h.slice(0, 10) + "…" + h.slice(-8) }),
    satir("Portfolio", () => { kapat(); location.hash = "#/portfoy"; }),
    satir("Copy address", async () => { try { await navigator.clipboard.writeText(h); } catch (e) { /* clipboard blocked */ } kapat(); }),
    satir("Disconnect", async () => { kapat(); await cuzdan.kes(); }),
    satir("Disconnect and forget this device", async () => { kapat(); await cuzdan.unut(); }),
    mobilMi() ? satir(gorunumOku() === "masaustu" ? "Phone layout" : "Desktop layout", () => { kapat(); gorunumDegistir(); }) : null,
  ]);
  document.body.append(menu);
  setTimeout(() => document.addEventListener("click", disari, true), 0);
}

/* Only a new account redraws the view. A chain switch is often the page's
   own doing in the middle of a send (a launch asks the wallet to move to
   its chain); redrawing then threw away the form and the send's progress. */
let _sonHesap = cuzdan.hesap();
cuzdan.dinle(({ hesap }) => {
  cuzdanDugmesiniTazele();
  if ((hesap || "").toLowerCase() === (_sonHesap || "").toLowerCase()) return;
  _sonHesap = hesap;
  ciz();
});

/* The connect dialog. Every way in, in one place: the wallet already in
   this browser, WalletConnect (any wallet, QR on a computer, a link on a
   phone), and when the browser has no wallet, the wallet apps' own links
   that open this page inside them, or where to install one. Views that
   need a wallet and find none land here too ("cuzdan-yok"). */
let _secimAcik = false;
function cuzdanSec() {
  if (_secimAcik) return;
  _secimAcik = true;
  const kapat = () => { _secimAcik = false; document.removeEventListener("keydown", esc); perde.remove(); };
  const esc = (e) => { if (e.key === "Escape") kapat(); };
  const RENK = { "MetaMask": "#f6851b", "Coinbase Wallet": "#0052ff", "Trust Wallet": "#3375bb", "Rabby": "#7084ff", "WalletConnect": "#3b99fc" };
  const durum = el("p", { sinif: "cuzdan-kutu__metin", attr: { role: "status", "aria-live": "polite" } });
  const rozet = (ad, ikonUrl) => ikonUrl
    ? el("img", { sinif: "cuzdan-secenek__harf", attr: { src: ikonUrl, alt: "", style: "background:#fff;padding:3px" } })
    : el("span", { sinif: "cuzdan-secenek__harf", attr: { style: "background:" + (RENK[ad] || "var(--marka)"), "aria-hidden": "true" }, yazi: ad[0] });
  const govde = (ad, alt, etiket, ikonUrl) => [
    rozet(ad, ikonUrl),
    el("span", {}, [el("span", { sinif: "cuzdan-secenek__ad", yazi: ad }), el("span", { sinif: "cuzdan-secenek__alt", yazi: alt })]),
    etiket ? el("span", { sinif: "cuzdan-secenek__etiket", yazi: etiket }) : null,
  ];
  const baglanti = (ad, alt, url, etiket, yeniSekme) => el("a", {
    sinif: "cuzdan-secenek", attr: { href: url, rel: "noopener", target: yeniSekme ? "_blank" : null } }, govde(ad, alt, etiket));
  const eylem = (ad, alt, etiket, ikonUrl, f) => el("button", {
    sinif: "cuzdan-secenek", attr: { type: "button", style: "width:100%;text-align:left;font:inherit;cursor:pointer" },
    on: { click: async () => {
      durum.textContent = "Waiting for the wallet…";
      try { await f(); kapat(); }
      catch (e) { durum.textContent = e && (e.code === 4001 || /reject|closed|cancel/i.test(e.message || "")) ? "Connection cancelled." : "Could not connect: " + ((e && e.message) || e); }
    } } }, govde(ad, alt, etiket, ikonUrl));

  const mobil = mobilMi();
  const tarayici = tarayiciCuzdani();
  const liste = [];
  if (tarayici) liste.push(eylem(tarayici.ad, "Connect the wallet in this browser", "Detected", tarayici.ikon, () => cuzdan.bagla()));
  if (WC_ACIK) liste.push(eylem("WalletConnect", mobil ? "Any wallet app on this phone" : "Scan a QR code with any wallet app", tarayici ? null : "Any wallet", null,
    /* hidden, not closed, while the WalletConnect modal is up: if pairing
       fails the error still has a dialog to land in */
    async () => {
      perde.style.display = "none";
      try { await cuzdan.walletConnect(); } finally { perde.style.display = ""; }
    }));
  /* on a phone the wallet apps open this page in their own browser, where the wallet is built in */
  if (mobil) for (const u of cuzdanUygulamalari()) liste.push(baglanti(u.ad, "Open this page in the " + u.ad + " app", u.url, tarayici ? null : "App", false));
  if (!tarayici && !mobil) {
    liste.push(baglanti("MetaMask", "Install the browser extension", "https://metamask.io/download/", null, true));
    liste.push(baglanti("Rabby", "Install the browser extension", "https://rabby.io/", null, true));
    liste.push(el("p", { sinif: "cuzdan-kutu__metin", yazi: "On your phone: open " + location.host + " in your wallet app's browser (MetaMask, Trust, Coinbase, OKX)." }));
  }

  const kutu = el("div", { sinif: "cuzdan-kutu", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "cuzdan-baslik" } }, [
    el("div", { sinif: "cuzdan-kutu__ust" }, [
      el("h2", { sinif: "cuzdan-kutu__baslik", attr: { id: "cuzdan-baslik" }, yazi: "Connect a wallet" }),
      el("button", { sinif: "dugme dugme--sade", attr: { type: "button", "aria-label": "Close" }, yazi: "✕", on: { click: kapat } }),
    ]),
    el("div", { sinif: "cuzdan-liste" }, liste),
    durum,
    el("p", { sinif: "cuzdan-kutu__guven", yazi:
      "ARC PULSE never asks for a seed phrase or a private key. Your wallet only connects and signs transactions you can read in the wallet before you approve them." }),
    el("p", { sinif: "cuzdan-kutu__guven", yazi:
      "Private by design: no accounts, no cookies, no analytics, no server of ours. We cannot see who connects. See Documentation → Privacy." }),
    el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Disconnect and forget this device",
      on: { click: async () => { await cuzdan.unut(); durum.textContent = "Disconnected. Nothing about you is stored in this browser now."; } } }),
    el("p", { sinif: "cuzdan-kutu__guven", attr: { style: "opacity:.7" }, yazi: "WalletConnect: Portions © 2025 Reown, Inc. All Rights Reserved." }),
  ]);
  const perde = el("div", { sinif: "cuzdan-perde", on: { click: (e) => { if (e.target === perde) kapat(); } } }, [kutu]);
  document.addEventListener("keydown", esc);
  document.body.append(perde);
  const ilk = kutu.querySelector(".cuzdan-secenek");
  if (ilk) ilk.focus();
}
window.addEventListener("cuzdan-yok", cuzdanSec);

/* ---- boot ----------------------------------------------------------- */

rayiCiz();
ustYoluCiz();
sekmeleriCiz();
aramayiCiz();
cuzdanDugmesiniTazele();

/* an invite link (?ref=<address or code>): remembered in this browser until the visitor links it on Arc */
try { davetYakala({ cuzdan }); } catch (e) { /* never block the app on an invite */ }
window.addEventListener("hashchange", ciz);
if (!location.hash) location.replace("#/" + VARSAYILAN);
ciz();
