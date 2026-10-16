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
import { cuzdan } from "./cuzdan.js";

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
const BIRINCIL = ["kesfet", "olustur", "terminal", "portfoy", "dao"];

const kIcerik = document.getElementById("icerik");
const kRay = document.getElementById("ray");
const kUstYol = document.getElementById("ust-yol");
const kSekme = document.getElementById("sekmebar");
const kAra = document.getElementById("ust-ara");
const kCuzdanDugme = document.getElementById("cuzdan-dugme");

/* ---- navigation ------------------------------------------------------ */

function yolLinki(y, sinifEk = "") {
  return el("a", {
    sinif: "yol-oge" + (y.durum === "yapim" ? " yol-oge--yapim" : "") + sinifEk,
    attr: { href: "#/" + y.yol, title: y.ozet || y.ad },
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

function rayiCiz() {
  temizle(kRay);
  for (const g of GRUPLAR) {
    const ogeler = grubunYollari(g.anahtar);
    if (!ogeler.length) continue;
    kRay.append(el("div", { sinif: "ray__grup" }, [
      el("div", { sinif: "ray__baslik", yazi: g.ad }),
      ...ogeler.map((y) => yolLinki(y))
    ]));
  }
}

function ustYoluCiz() {
  temizle(kUstYol);
  for (const ad of BIRINCIL) {
    const y = yolBul(ad);
    if (!y) continue;
    kUstYol.append(el("a", {
      sinif: "yol-oge",
      attr: { href: "#/" + y.yol },
      veri: { yol: y.yol },
      yazi: y.kisa || y.ad
    }));
  }
}

function sekmeleriCiz() {
  temizle(kSekme);
  for (const ad of BIRINCIL.slice(0, 4)) {
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
    el("span", { yazi: "Daha" })
  ]));
}

function aramayiCiz() {
  temizle(kAra);
  const girdi = el("input", {
    sinif: "girdi",
    attr: {
      type: "search",
      placeholder: "Token name, symbol or address",
      "aria-label": "Token ara",
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
  const [yol, sorgu] = h.split("?");
  return {
    yol: yol || VARSAYILAN,
    param: new URLSearchParams(sorgu || "")
  };
}

/* One module per route. Listed rather than built from the route name so a
   missing file is a clear error instead of a silent 404 import. */
const GORUNUMLER = {
  kesfet: () => import("./gorunum/kesfet.js"),
  olustur: () => import("./gorunum/olustur.js"),
  fthm: () => import("./gorunum/fthm-al-sat.js"),
  genesis: () => import("./gorunum/genesis.js"),
  terminal: () => import("./gorunum/terminal.js"),
  "move-token": () => import("./gorunum/move-token.js"),
  kasalar: () => import("./gorunum/kasalar.js"),
  teminat: () => import("./gorunum/teminat-sec.js"),
  portfoy: () => import("./gorunum/portfoy.js"),
  kalkan: () => import("./gorunum/kalkan.js"),
  zincirler: () => import("./gorunum/zincirler.js"),
  analitik: () => import("./gorunum/analitik.js"),
  liderlik: () => import("./gorunum/liderlik.js"),
  guvenlik: () => import("./gorunum/guvenlik.js"),
  /* Governance. These two read and WRITE to the live Governor, which is
     the one contract in this product that is already deployed. */
  dao: () => import("./gorunum/dao.js"),
  pazar: () => import("./gorunum/pazar.js"),
  gelistirici: () => import("./gorunum/gelistirici.js"),
  teklifler: () => import("./gorunum/teklifler.js"),
  dokuman: () => import("./gorunum/dokuman.js"),
  daha: () => import("./gorunum/daha.js")
};

let sonCizim = 0;

async function ciz() {
  const { yol, param } = hashiCoz();
  const kayit = yol === "daha"
    ? { yol: "daha", ad: "All modules", durum: "canli", ikon: "daha" }
    : yolBul(yol);

  etkinIsaretle(yol);
  document.body.classList.toggle("terminal-acik", yol === "terminal");

  if (!kayit) {
    temizle(kIcerik).append(hata("No such page", "You asked for: /" + yol));
    kIcerik.dataset.cizildi = "1";
    return;
  }

  document.title = kayit.ad === "Discover" ? "ARC PULSE" : kayit.ad + " — ARC PULSE";

  /* The router, not the view, decides whether a module may render. */
  if (kayit.durum === "yapim") {
    temizle(kIcerik).append(yapimda(kayit));
    kIcerik.dataset.cizildi = "1";
    kIcerik.focus({ preventScroll: true });
    return;
  }

  const yukle = GORUNUMLER[yol];
  if (!yukle) {
    temizle(kIcerik).append(yapimda(kayit));
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
    temizle(kIcerik).append(parca);
  } catch (e) {
    if (bu !== sonCizim) return;
    temizle(kIcerik).append(
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

kCuzdanDugme.addEventListener("click", async () => {
  if (cuzdan.hesap()) { location.hash = "#/portfoy"; return; }
  kCuzdanDugme.disabled = true;
  try {
    await cuzdan.bagla();
  } catch (e) {
    /* A refused connection is a normal outcome and not an error state —
       the button simply goes back to offering. */
    if (e && e.code !== 4001) alert("Could not connect the wallet: " + ((e && e.message) || e));
  } finally {
    kCuzdanDugme.disabled = false;
    cuzdanDugmesiniTazele();
  }
});

cuzdan.dinle(() => { cuzdanDugmesiniTazele(); ciz(); });

/* ---- boot ----------------------------------------------------------- */

rayiCiz();
ustYoluCiz();
sekmeleriCiz();
aramayiCiz();
cuzdanDugmesiniTazele();

window.addEventListener("hashchange", ciz);
if (!location.hash) location.replace("#/" + VARSAYILAN);
ciz();
