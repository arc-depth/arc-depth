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

import { YOLLAR, GRUPLAR, yolBul, grubunYollari } from "./yol.js";
import { ikon } from "./ikon.js";
import { el, temizle, dagitimBekliyor, yapimda, hata, iskelet } from "./ui.js";
import { geriDugmesi } from "./geri.js";
import { cuzdan, cuzdanUygulamalari, mobilMi, tarayiciCuzdani, WC_ACIK } from "./cuzdan.js";
import { davetYakala } from "./davet.js";

const VARSAYILAN = "kesfet";

/* The four things somebody opens the app to do. Everything else is one tap
   further, behind "Daha" — a bar with eight targets on a phone is a bar
   nobody hits accurately. */
/* The top-level tabs, in the order they are read.
   DAO IS ONE OF THEM NOW
     It was reachable only through the overflow menu, which put live
     governance — propose, vote, queue, execute, all on chain — behind the
     same door as the unbuilt screens. A product whose rules can only be
     changed by a vote should not hide the vote.

   WHY THE PHONE BAR STILL SHOWS FOUR
     The bar is four icons plus "Daha"; five plus one does not fit a phone
     without shrinking the labels past reading. So on a phone the DAO sits
     under "Daha" and on a desktop it is a tab. Stated rather than
     silently truncated, because a tab that exists on one screen size and
     not the other is the kind of thing nobody notices until somebody
     cannot find it. */
/* "designs" (1 Nov 2026): the owner wants the designer NFT section behind its
   own button. It is the sixth entry, so the phone bar (first four) is unchanged. */
/* "presale" (9 Nov 2026): the ARCP presale behind its own tab, likewise after the phone bar four */
/* "vitrin" (Market, 9 Nov 2026): every token on ten chains, bought from any of them; second, after Discover */
const BIRINCIL = ["kesfet", "vitrin", "warp", "launches", "olustur", "terminal", "portfoy", "dao", "presale", "designs"];
/* the top bar (9 Nov 2026 redesign): six tabs read at a glance; every other module, DAO and
   NFT designs included, is one click away under "More", grouped as the rail groups them */
/* "warp" (11 Nov 2026): launch on the hottest launchpad of thirteen chains */
const UST = ["kesfet", "vitrin", "warp", "olustur", "terminal", "portfoy", "presale"];
const UST_DAHA = BIRINCIL.filter((y) => !UST.includes(y));

const kIcerik = document.getElementById("icerik");
const kRay = document.getElementById("ray");
const kUstYol = document.getElementById("ust-yol");
const kSekme = document.getElementById("sekmebar");
const kAra = document.getElementById("ust-ara");
const kCuzdanDugme = document.getElementById("cuzdan-dugme");

/* ---- phone layout ---------------------------------------------------------
   Phones open the phone layout (12 Nov 2026, user: phone first; app.html's viewport is width=device-width).
   A button next to the wallet offers the full desktop layout instead; the choice is kept on this device and the
   button switches back. */
const GORUNUM = "arcpulse-gorunum";
const gorunumOku = () => { try { return localStorage.getItem(GORUNUM); } catch (e) { return null; } };
if (gorunumOku() === "masaustu") {
  const m = document.querySelector('meta[name="viewport"]');
  if (m) m.setAttribute("content", "width=1280, viewport-fit=cover");
}
if (mobilMi() && kCuzdanDugme) {
  const masaustunde = gorunumOku() === "masaustu";
  kCuzdanDugme.before(el("button", { sinif: "dugme dugme--sade", attr: { type: "button", title: masaustunde ? "Show the phone layout" : "Show the full desktop layout",
    "aria-label": masaustunde ? "Phone layout" : "Desktop layout", style: "flex:none;padding:6px 8px;min-width:0" },
    yazi: masaustunde ? "\u{1F4F1}" : "\u{1F5A5}",
    on: { click: () => { try { localStorage.setItem(GORUNUM, masaustunde ? "mobil" : "masaustu"); } catch (e) { /* storage may be blocked */ } location.reload(); } } }));
}

/* ---- navigation ------------------------------------------------------ */

function yolLinki(y, sinifEk = "") {
  return el("a", {
    sinif: "yol-oge" + (y.durum === "yapim" ? " yol-oge--yapim" : "") + sinifEk,
    /* a route with its own site (y.site, e.g. Designs -> designs/) opens it; its #/ route stays */
    attr: { href: y.site || "#/" + y.yol, title: y.ozet || y.ad },
    veri: { yol: y.yol }
  }, [
    el("span", { sinif: "yol-oge__ikon", html: ikon(y.ikon, "yol-oge__ikon") }),
    el("span", { sinif: "yol-oge__etiket", yazi: y.ad }),
    /* The rail marks state before anybody clicks. A dot is enough: a word
       on every row would turn the rail into a changelog. */
    y.durum === "canli" ? null
      : el("span", {
          sinif: "etiket" + (y.durum === "dagitim" ? " etiket--uyari" : ""),
          yazi: y.durum === "dagitim" ? "soon" : "—",
          attr: { title: y.durum === "dagitim" ? "Awaiting deployment" : "Not built" }
        })
  ]);
}

/* The rail folds: thirty modules at once read as a wall. The group of the open page and
   Market stay open; the others fold to their heading and open with a click. A visitor's own
   folding is kept on this device only (a convenience, nothing else is stored). */
const RAY_GRUP_RENK = { piyasa: "var(--renk-piyasa)", urunler: "var(--renk-urunler)", varlik: "var(--renk-varlik)", yonetisim: "var(--renk-yonetisim)", guven: "var(--renk-guven)" };
const RAY_ANAHTAR = "arcpulse-ray";
const rayOku = () => { try { return JSON.parse(localStorage.getItem(RAY_ANAHTAR) || "{}"); } catch (e) { return {}; } };
const OK_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function rayiCiz() {
  temizle(kRay);
  const secim = rayOku();
  const aktif = yolBul(hashiCoz().yol);
  for (const g of GRUPLAR) {
    const ogeler = grubunYollari(g.anahtar);
    if (!ogeler.length) continue;
    const acik = g.anahtar in secim ? secim[g.anahtar] : (g.anahtar === "piyasa" || (aktif && aktif.grup === g.anahtar));
    const grup = el("div", { sinif: "ray__grup", veri: { grup: g.anahtar, kapali: acik ? "0" : "1" } });
    const baslik = el("button", { sinif: "ray__baslik ray__baslik--dugme", attr: { type: "button", "aria-expanded": String(acik), style: "--gr:" + (RAY_GRUP_RENK[g.anahtar] || "") } }, [
      el("b", {}, [el("i"), g.ad]), el("span", { sinif: "ray__sayi", yazi: String(ogeler.length) }), el("span", { html: OK_SVG })]);
    baslik.addEventListener("click", () => {
      const kapali = grup.dataset.kapali !== "1";
      grup.dataset.kapali = kapali ? "1" : "0";
      baslik.setAttribute("aria-expanded", String(!kapali));
      const yeni = rayOku(); yeni[g.anahtar] = !kapali;
      try { localStorage.setItem(RAY_ANAHTAR, JSON.stringify(yeni)); } catch (e) { /* storage may be blocked */ }
    });
    grup.append(baslik, ...ogeler.map((y) => yolLinki(y)));
    kRay.append(grup);
  }
}

function ustYoluCiz() {
  temizle(kUstYol);
  for (const ad of UST) {
    const y = yolBul(ad);
    if (!y) continue;
    kUstYol.append(el("a", {
      sinif: "yol-oge",
      attr: { href: y.site || "#/" + y.yol },
      veri: { yol: y.yol },
      yazi: y.kisa || y.ad
    }));
  }
  /* "More": the tabs that left the bar first, then every module by group, each with its one-line purpose */
  const menu = el("div", { sinif: "ust-daha__menu", attr: { role: "menu" } });
  const satir = (y) => el("a", { attr: { href: y.site || "#/" + y.yol, role: "menuitem" }, veri: { yol: y.yol } },
    [el("span", { html: ikon(y.ikon) }), el("span", {}, [y.ad, y.ozet ? el("small", { yazi: y.ozet.length > 90 ? y.ozet.slice(0, 88) + "…" : y.ozet }) : null])]);
  menu.append(el("div", { sinif: "ust-daha__baslik", yazi: "Popular" }), ...UST_DAHA.map(yolBul).filter(Boolean).map(satir));
  for (const g of GRUPLAR) {
    const ogeler = grubunYollari(g.anahtar).filter((y) => !UST.includes(y.yol) && !UST_DAHA.includes(y.yol));
    if (!ogeler.length) continue;
    menu.append(el("div", { sinif: "ust-daha__baslik", yazi: g.ad }), ...ogeler.map(satir));
  }
  menu.append(el("div", { sinif: "ust-daha__baslik", yazi: "Everything" }), satir({ yol: "daha", ad: "All modules", ikon: "daha", ozet: "Every module, its state and what each one is for." }));
  const kutu = el("div", { sinif: "ust-daha yol-oge", veri: { acik: "0" } });
  const dugme = el("button", { sinif: "ust-daha__dugme", attr: { type: "button", "aria-haspopup": "menu", "aria-expanded": "false" } }, ["More", el("span", { html: OK_SVG })]);
  const ac = (v) => { kutu.dataset.acik = v ? "1" : "0"; dugme.setAttribute("aria-expanded", String(v)); };
  dugme.addEventListener("click", (e) => { e.stopPropagation(); ac(kutu.dataset.acik !== "1"); });
  menu.addEventListener("click", () => ac(false));
  document.addEventListener("click", (e) => { if (!kutu.contains(e.target)) ac(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") ac(false); });
  kutu.append(dugme, menu);
  kUstYol.append(kutu);
}

function sekmeleriCiz() {
  temizle(kSekme);
  for (const ad of ["kesfet", "terminal", "olustur", "portfoy"]) {   // the phone bar (12 Nov 2026): every launch in Trade; Market and the rest under More
    const y = yolBul(ad);
    if (!y) continue;
    kSekme.append(el("a", {
      sinif: "sekme-oge",
      attr: { href: "#/" + y.yol },
      veri: { yol: y.yol }
    }, [
      el("span", { html: ikon(y.ikon, "sekme-oge__ikon") }),
      el("span", { yazi: y.kisa || y.ad })
    ]));
  }
  kSekme.append(el("a", {
    sinif: "sekme-oge",
    attr: { href: "#/daha" },
    veri: { yol: "daha" }
  }, [
    el("span", { html: ikon("daha", "sekme-oge__ikon") }),
    el("span", { yazi: "More" })
  ]));
}

function aramayiCiz() {
  temizle(kAra);
  const girdi = el("input", {
    sinif: "girdi",
    attr: {
      type: "search",
      placeholder: "Token name, symbol or address",
      "aria-label": "Search tokens",
      autocomplete: "off",
      spellcheck: "false"
    },
    on: {
      keydown: (ev) => {
        if (ev.key !== "Enter") return;
        const q = girdi.value.trim();
        if (!q) return;
        /* An address goes straight to its terminal; anything else filters
           the discovery list. Guessing which one the user meant is worse
           than deciding by shape. */
        location.hash = /^0x[0-9a-fA-F]{40}$/.test(q)
          ? "#/terminal?t=" + q
          : "#/kesfet?q=" + encodeURIComponent(q);
      }
    }
  });
  kAra.append(girdi);
}

function etkinIsaretle(aktif) {
  for (const a of document.querySelectorAll("[data-yol]")) {
    if (a.dataset.yol === aktif) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
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
  guvenlik: () => import("./gorunum/guvenlik.js"),
  /* Governance. These two read and WRITE to the live Governor, which is
     the one contract in this product that is already deployed. */
  dao: () => import("./gorunum/dao.js"),
  pazar: () => import("./gorunum/pazar.js"),
  gelistirici: () => import("./gorunum/gelistirici.js"),
  teklifler: () => import("./gorunum/teklifler.js"),
  dokuman: () => import("./gorunum/dokuman.js"),
  daha: () => import("./gorunum/daha.js"),
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
    const yazi = (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48);
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
  /* every page but the home and the full-screen terminal opens with a Back button */
  const geri = () => yol === "kesfet" || yol === "terminal" ? [] : [el("div", { sinif: "geri-satir" }, [geriDugmesi("#/kesfet")])];

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
    sayfaIcindekiler(parca);
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
    kCuzdanDugme.textContent = "Connect wallet";
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
