/* ===========================================================================
 * ui.js — element helpers and the three honest states
 *
 * Nothing here knows about the chain. It exists so a view is a description
 * of a screen rather than three hundred lines of createElement, and so that
 * "no data", "not deployed" and "not built" are rendered by one function
 * each — which is what stops them from quietly becoming the same screen.
 * =========================================================================== */

import { ikon } from "./ikon.js";
import { yolBul, GRUPLAR } from "./yol.js";

/* each rail group has its colour; a page's cover takes the colour of its group */
const GRUP_RENK = { piyasa: "var(--renk-piyasa)", urunler: "var(--renk-urunler)", varlik: "var(--renk-varlik)", yonetisim: "var(--renk-yonetisim)", guven: "var(--renk-guven)" };

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
    return el("div", { sinif: "sayfa-ust sayfa-ust--kapak", attr: { style: "--kr:" + (GRUP_RENK[kayit.grup] || GRUP_RENK.piyasa) } }, [
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
export function bos(baslik, yazi, eylem = null) {
  return el("div", { sinif: "bos" }, [
    el("img", { sinif: "bos__pulsy", attr: { src: new URL("../img/pulsy.svg", import.meta.url).href, alt: "", width: "84", height: "84", loading: "lazy" } }),
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
    el("div", { sinif: "etiket etiket--uyari", yazi: "AWAITING DEPLOYMENT" }),
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
    el("div", { sinif: "etiket", yazi: "NOT BUILT YET" }),
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
