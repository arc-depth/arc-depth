/* ===========================================================================
 * ui.js — element helpers and the three honest states
 *
 * Nothing here knows about the chain. It exists so a view is a description
 * of a screen rather than three hundred lines of createElement, and so that
 * "no data", "not deployed" and "not built" are rendered by one function
 * each — which is what stops them from quietly becoming the same screen.
 * =========================================================================== */

import { ikon as ikonTemel, ikonVarMi } from "./ikon.js";
import { yolBul, GRUPLAR } from "./yol.js";
import { SQUAD } from "./squad.js";

/* each rail group has its colour; a page's cover takes the colour of its group */
export const GRUP_RENK = { kesif: "var(--renk-piyasa)", baslat: "var(--renk-urunler)", urunler: "var(--renk-urunler)", sen: "var(--renk-varlik)",
  arcp: "var(--renk-yonetisim)", insa: "var(--renk-insa)", guven: "var(--renk-guven)" };

/* 12 Nov 2026: more icons for the navigation, so neighbours in the rail do not share one. Same geometry as
   ikon.js (24 grid, 1.8 stroke, round caps); a name ikon.js has wins. */
const EK_IKON = {
  dukkan: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v1.5a3 3 0 01-5.3 1.9A3 3 0 0112 13.5a3 3 0 01-2.7-1.1A3 3 0 014 10.5z"/><path d="M5 13.5V20h14v-6.5"/><path d="M10 20v-4h4v4"/>',
  liste: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  simsek: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  megafon: '<path d="M4 10v4a1 1 0 001 1h2l7 4V5L7 9H5a1 1 0 00-1 1z"/><path d="M17.5 9a4 4 0 010 6"/>',
  roket: '<path d="M12 3c3 2 5 5.5 5 9.5L15 16H9l-2-3.5C7 8.5 9 5 12 3z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1.5M15 16l2 4-3-1.5"/>',
  kure: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
  katman: '<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/>',
  damla: '<path d="M12 3c3.5 4.5 6 7.8 6 11a6 6 0 01-12 0c0-3.2 2.5-6.5 6-11z"/>',
  yildiz: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/>',
  ampul: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>',
  oyun: '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M7.5 12.5h3M9 11v3"/><circle cx="15.5" cy="11.5" r=".9"/><circle cx="17.5" cy="13.5" r=".9"/>',
  jeton: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><path d="M12 9.5v5"/>',
  saat: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  bayrak: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  kivilcim: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  canta: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  kod: '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
  sepet: '<path d="M3 9h18l-2 10H5z"/><path d="M8 9l3-5M16 9l-3-5M9 13v3M15 13v3M12 13v3"/>',
  firca: '<path d="M14.5 4.5l5 5-7.5 7.5-5-5z"/><path d="M7 12c-2 0-3.5 1.6-3.5 3.5 0 1.5-.5 2.5-1 3 3 .5 6.5-.5 7.5-3.5"/>'
};
/** an icon from ikon.js, or one of the navigation's extra icons */
export function ikon(ad, sinif = "") {
  if (ikonVarMi(ad) || !EK_IKON[ad]) return ikonTemel(ad, sinif);
  return '<svg class="' + sinif + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + EK_IKON[ad] + "</svg>";
}

/** The cover art: an orb that breathes, two orbits, three sparks and the module's icon in the middle. */
export function kapakSanati(ikonAdi) {
  const sanat = `<svg viewBox="0 0 92 92" aria-hidden="true">
    <defs><radialGradient id="ksG" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="currentColor" stop-opacity=".9"/><stop offset="1" stop-color="currentColor" stop-opacity=".15"/></radialGradient></defs>
    <circle class="ks-orb" cx="46" cy="46" r="27" fill="url(#ksG)"/>
    <g class="ks-yorunge"><ellipse cx="46" cy="46" rx="42" ry="15" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1"/><circle cx="88" cy="46" r="3" fill="currentColor"/></g>
    <g class="ks-yorunge2"><ellipse cx="46" cy="46" rx="15" ry="42" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="1"/><circle cx="46" cy="4" r="2.2" fill="#fff"/></g>
    <circle class="ks-kivilcim" cx="12" cy="20" r="1.6" fill="#fff"/><circle class="ks-kivilcim" cx="80" cy="14" r="1.2" fill="#fff"/><circle class="ks-kivilcim" cx="74" cy="80" r="1.5" fill="#fff"/>
  </svg>`;
  return el("div", { sinif: "kapak-sanat" }, [el("div", { sinif: "kapak-sanat__arka", html: sanat }), el("div", { sinif: "kapak-sanat__ikon", html: ikon(ikonAdi || "pusula") })]);
}

/** Create an element. `ozellik` takes class/text/html/attrs/on. */
export function el(etiket, ozellik = {}, cocuklar = []) {
  const e = document.createElement(etiket);
  if (ozellik.sinif) e.className = ozellik.sinif;
  if (ozellik.yazi != null) e.textContent = String(ozellik.yazi);
  if (ozellik.html != null) e.innerHTML = ozellik.html;
  for (const [k, v] of Object.entries(ozellik.attr || {})) {
    if (v != null && v !== false) e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const [k, v] of Object.entries(ozellik.veri || {})) {
    if (v != null) e.dataset[k] = String(v);
  }
  for (const [k, v] of Object.entries(ozellik.on || {})) e.addEventListener(k, v);
  for (const c of [].concat(cocuklar)) {
    if (c == null || c === false) continue;
    e.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

/** Text that came from outside this codebase is never written as HTML. */
export function kacir(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

export function temizle(kap) {
  while (kap.firstChild) kap.removeChild(kap.firstChild);
  return kap;
}

/* ---- page header ---------------------------------------------------- */

export function sayfaUst(baslik, alt, eylemler = []) {
  /* the page's own route gives the cover its group, colour, icon and a plain sentence on what the page is for */
  const yol = (location.hash || "").replace(/^#\/?/, "").split(/[?/]/)[0];
  const kayit = yol ? yolBul(yol) : yolBul("kesfet");
  if (kayit) {
    const grup = GRUPLAR.find((g) => g.anahtar === kayit.grup);
    /* the plain sentence only when it says something the subtitle does not */
    const yalin = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const aciklama = kayit.ozet && !yalin(kayit.ozet).startsWith(yalin(alt).slice(0, 24)) && !yalin(alt).includes(yalin(kayit.ozet).slice(0, 40)) ? kayit.ozet : null;
    return el("div", { sinif: "sayfa-ust sayfa-ust--kapak", attr: { style: "--kr:" + (GRUP_RENK[kayit.grup] || GRUP_RENK.kesif) } }, [
      el("div", { sinif: "sayfa-ust__ic" }, [
        kapakSanati(kayit.ikon),
        el("div", { sinif: "sayfa-ust__yazi" }, [
          grup ? el("div", { sinif: "sayfa-ust__ust", yazi: grup.ad }) : null,
          el("h1", { yazi: baslik }),
          alt ? el("div", { sinif: "sayfa-ust__alt", yazi: alt }) : null,
          aciklama ? el("div", { sinif: "sayfa-ust__aciklama", yazi: aciklama }) : null
        ])
      ]),
      eylemler.length ? el("div", { sinif: "sayfa-ust__eylem" }, eylemler) : null
    ]);
  }
  return el("div", { sinif: "sayfa-ust" }, [
    el("div", { sinif: "sayfa-ust__yazi" }, [
      el("h1", { yazi: baslik }),
      alt ? el("div", { sinif: "sayfa-ust__alt", yazi: alt }) : null
    ]),
    eylemler.length ? el("div", { sinif: "sayfa-ust__eylem" }, eylemler) : null
  ]);
}

/** Three (or more) steps in plain words, each with an icon that moves a little: how a page's thing works, at a glance. */
export function adimlar(liste) {
  return el("div", { sinif: "adimlar" }, liste.map((a, i) => el("div", { sinif: "adim" }, [
    el("div", { sinif: "adim__ikon", html: ikon(a.ikon || "pusula") }),
    el("div", {}, [el("div", { sinif: "adim__no", yazi: "Step " + (i + 1) }), el("div", { sinif: "adim__baslik", yazi: a.baslik }), el("div", { sinif: "adim__yazi", yazi: a.yazi })]),
  ])));
}

/** Detail most visitors do not need, folded behind a plain question. */
export function ayrinti(soru, govde) {
  return el("details", { sinif: "ayrinti" }, [el("summary", { yazi: soru }), typeof govde === "string" ? el("div", { sinif: "ayrinti__govde", yazi: govde }) : govde]);
}

/* ---- panel ---------------------------------------------------------- */

export function panel(baslik, govde, sagUst = null, sifirDolgu = false) {
  return el("section", { sinif: "panel" }, [
    baslik
      ? el("div", { sinif: "panel__ust" }, [
          el("div", { sinif: "panel__baslik" }, [].concat(baslik)),
          sagUst
        ])
      : null,
    el("div", { sinif: "panel__govde" + (sifirDolgu ? " panel__govde--sifir" : "") },
      [].concat(govde))
  ]);
}

/* ---- metric --------------------------------------------------------- */

export function olcum(etiket, deger, alt = null, sinif = "") {
  return el("div", { sinif: "olcum" }, [
    el("div", { sinif: "olcum__etiket", yazi: etiket }),
    /* a value may be an element (an address with its copy link): put it in, do not print it as text */
    deger instanceof Node ? el("div", { sinif: "olcum__deger " + sinif }, [deger]) : el("div", { sinif: "olcum__deger " + sinif, yazi: deger }),
    alt ? el("div", { sinif: "olcum__alt", yazi: alt }) : null
  ]);
}

/* ---- the three states ----------------------------------------------- */

/**
 * This works; there is nothing in it right now.
 * Used for a real but empty list — and it says WHY it is empty, because
 * "no tokens" and "no tokens yet because nothing is deployed" are
 * different facts and a reader deserves the second one.
 */
/* ---- empty states: a Pulse Squad guide per page -----------------------
   Mascots stand for a chain or an action, never for a token. Each route has its
   own guide (Sui: Drip, Aptos: Pebble, Leaderboards: Goldie, developer pages:
   Bolt, numbers: Turbo, DAO: Pulsy …); the second and later empty states on the
   same page take the next mascots, smaller, so one screen is not a row of the
   same face. Ethereum has no mascot: Pulsy stands in. */
const ZINCIR_MASKOT = { ...Object.fromEntries(SQUAD.map((m) => [m.zincir.toLowerCase().replace(/ chain$/, ""), m.k])), bsc: "goldie", ethereum: "pulsy" };
const YOL_MASKOT = { kesfet: "pulsy", terminal: "zappy", vitrin: "blu", launches: "feather", warp: "halo", liderlik: "goldie", advertise: "vio",
  olustur: "pulsy", merkez: "pulsy", "olustur-move": "pebble", "move-token": "drip", portfoy: "turbo", "kar-zarar": "turbo", davet: "feather",
  fthm: "pulsy", dao: "pulsy", teklifler: "pulsy", "topluluk-dao": "vio", topluluk: "vio", genesis: "bolt", pazar: "bolt", gelistirici: "bolt",
  kasalar: "yeti", analitik: "turbo", kalkan: "yeti", zincirler: "vio", guvenlik: "pebble", dokuman: "drip", daha: "zappy",
  squad: "pulsy", communities: "blu", creators: "goldie", agents: "bolt", projects: "turbo", daos: "pulsy", games: "zappy", baskets: "yeti", designs: "vio" };
let _bosSayfa = "", _bosSayi = 0;
/** the mascot key for an empty state: explicit, then the chain named in the URL, then the route's own */
export function maskotSec(istenen) {
  if (istenen && SQUAD.some((m) => m.k === istenen)) return istenen;
  const h = (location.hash || "").replace(/^#\/?/, "");
  const [yol, sorgu] = h.split("?");
  const p = new URLSearchParams(sorgu || "");
  const z = String(p.get("zincir") || p.get("ag") || "").toLowerCase();
  if (z && ZINCIR_MASKOT[z]) return ZINCIR_MASKOT[z];
  const ad = (yol || "kesfet").split("/")[0];
  if (YOL_MASKOT[ad]) return YOL_MASKOT[ad];
  let t = 0; for (const c of ad) t = (t * 31 + c.charCodeAt(0)) % SQUAD.length;
  return SQUAD[t].k;
}
function bosMaskot(istenen) {
  const sayfa = location.hash || "";
  if (sayfa !== _bosSayfa) { _bosSayfa = sayfa; _bosSayi = 0; }
  const ilk = maskotSec(istenen);
  const i = SQUAD.findIndex((m) => m.k === ilk);
  const kucuk = _bosSayi > 0 && !istenen;
  const k = kucuk ? SQUAD[(i + _bosSayi) % SQUAD.length].k : ilk;
  _bosSayi++;
  const boy = kucuk ? "48" : "84";
  return el("img", { sinif: "bos__pulsy" + (kucuk ? " bos__pulsy--kucuk" : ""), attr: { src: new URL("../img/squad/" + k + ".svg", import.meta.url).href, alt: "", width: boy, height: boy, loading: "lazy", "data-maskot": k } });
}

/** `maskot` (optional): a Squad key (squad.js) to use instead of the page's own guide */
export function bos(baslik, yazi, eylem = null, maskot = null) {
  return el("div", { sinif: "bos" }, [
    bosMaskot(maskot),
    el("div", { sinif: "bos__baslik", yazi: baslik }),
    yazi ? el("div", { sinif: "bos__yazi", yazi }) : null,
    eylem
  ]);
}

/**
 * The code exists and is tested; the contract is not deployed.
 * No control that cannot act is rendered alongside this.
 */
export function dagitimBekliyor(yolKaydi) {
  return el("div", { sinif: "yok" }, [
    bosMaskot(),
    el("div", { sinif: "etiket etiket--uyari", yazi: "Coming soon" }),
    el("div", { sinif: "yok__baslik", yazi: yolKaydi.ad + " is not on chain yet" }),
    el("div", {
      sinif: "yok__yazi",
      yazi:
        "The contracts are written and measured against Arc mainnet, but " +
        "not deployed. This screen is not dressed up as working: a button " +
        "that sends a transaction is not offered without an address to " +
        "send it to."
    }),
    yolKaydi.gerekli
      ? el("div", { sinif: "not not--uyari" }, [
          el("span", { html: ikon("uyari", "not__ikon") }),
          el("span", { yazi: "Needs: " + yolKaydi.gerekli })
        ])
      : null
  ]);
}

/**
 * Not built. States what is missing, concretely.
 * A module that says "coming soon" and nothing else is a module nobody can
 * plan around; these list the actual blockers.
 */
export function yapimda(yolKaydi) {
  return el("div", { sinif: "yok" }, [
    bosMaskot(),
    el("div", { sinif: "etiket etiket--uyari", yazi: "Coming soon" }),
    el("div", { sinif: "yok__baslik", yazi: yolKaydi.ad }),
    yolKaydi.ozet ? el("div", { sinif: "yok__yazi", yazi: yolKaydi.ozet }) : null,
    yolKaydi.gerekli ? el("div", { sinif: "yok__yazi", yazi: yolKaydi.gerekli }) : null,
    Array.isArray(yolKaydi.eksik) && yolKaydi.eksik.length
      ? el("ul", { sinif: "yok__liste" },
          yolKaydi.eksik.map((x) => el("li", {}, [el("span", { yazi: x })])))
      : null
  ]);
}

/** It should have worked and did not. */
export function hata(baslik, yazi) {
  return el("div", { sinif: "hata" }, [
    el("div", { sinif: "hata__baslik", yazi: baslik }),
    yazi ? el("div", { sinif: "bos__yazi", yazi: String(yazi) }) : null
  ]);
}

/** Data is on its way. Never used for data that does not exist. */
export function iskelet(satir = 3) {
  const s = [];
  for (let i = 0; i < satir; i++) {
    s.push(el("div", {
      sinif: "iskelet iskelet--satir",
      attr: { style: "width:" + (60 + ((i * 37) % 40)) + "%" }
    }));
  }
  return el("div", { sinif: "yigin yigin--sik" }, s);
}

/* ---- notice --------------------------------------------------------- */

export function not(yazi, tur = "") {
  return el("div", { sinif: "not" + (tur ? " not--" + tur : "") }, [
    el("span", { html: ikon(tur === "uyari" ? "uyari" : "bilgi", "not__ikon") }),
    el("span", { yazi })
  ]);
}

/* ---- tabs ----------------------------------------------------------- */

/**
 * @param {{anahtar:string,ad:string}[]} ogeler
 * @param {string} secili
 * @param {(anahtar:string)=>void} degisti
 */
export function sekmeler(ogeler, secili, degisti) {
  const kap = el("div", { sinif: "sekmeler", attr: { role: "tablist" } });
  for (const o of ogeler) {
    kap.append(el("button", {
      sinif: "sekmeler__oge",
      yazi: o.ad,
      attr: { type: "button", role: "tab", "aria-selected": String(o.anahtar === secili) },
      on: {
        /* The clicked element, not a text match. Two tabs with the same
           label would have selected the wrong one. */
        click: (ev) => {
          for (const b of kap.children) b.setAttribute("aria-selected", "false");
          ev.currentTarget.setAttribute("aria-selected", "true");
          degisti(o.anahtar);
        }
      }
    }));
  }
  return kap;
}

/* ---- address -------------------------------------------------------- */

/** Full value stays selectable; the ellipsis is CSS, not a sliced string. */
export function adres(deger, kisaltMi = true) {
  return el("span", { sinif: "adres" }, [
    el("span", {
      sinif: "adres__deger",
      yazi: deger,
      attr: kisaltMi ? { style: "max-width:14ch" } : {}
    }),
    el("button", {
      sinif: "dugme dugme--sade dugme--kucuk",
      yazi: "copy",
      attr: { type: "button" },
      on: {
        click: async (ev) => {
          try {
            await navigator.clipboard.writeText(deger);
            ev.target.textContent = "copied";
            setTimeout(() => { ev.target.textContent = "copy"; }, 1200);
          } catch (e) {
            ev.target.textContent = "copy failed";
          }
        }
      }
    })
  ]);
}
