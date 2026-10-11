/* ===========================================================================
 * ui.js — element helpers and the three honest states
 *
 * Nothing here knows about the chain. It exists so a view is a description
 * of a screen rather than three hundred lines of createElement, and so that
 * "no data", "not deployed" and "not built" are rendered by one function
 * each — which is what stops them from quietly becoming the same screen.
 * =========================================================================== */

import { ikon } from "./ikon.js";

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
  return el("div", { sinif: "sayfa-ust" }, [
    el("div", { sinif: "sayfa-ust__yazi" }, [
      el("h1", { yazi: baslik }),
      alt ? el("div", { sinif: "sayfa-ust__alt", yazi: alt }) : null
    ]),
    eylemler.length ? el("div", { sinif: "sayfa-ust__eylem" }, eylemler) : null
  ]);
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
    el("div", { sinif: "olcum__deger " + sinif, yazi: deger }),
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
    el("div", { sinif: "etiket etiket--uyari", yazi: "DAĞITIM BEKLİYOR" }),
    el("div", { sinif: "yok__baslik", yazi: yolKaydi.ad + " henüz zincirde değil" }),
    el("div", {
      sinif: "yok__yazi",
      yazi:
        "Sözleşmeler yazıldı ve Arc mainnet'e karşı ölçüldü, ama dağıtılmadı. " +
        "Bu ekranı çalışıyormuş gibi göstermiyoruz: işlem gönderecek bir " +
        "düğme, gönderebileceği bir adres olmadan sunulmaz."
    }),
    yolKaydi.gerekli
      ? el("div", { sinif: "not not--uyari" }, [
          el("span", { html: ikon("uyari", "not__ikon") }),
          el("span", { yazi: "Gereken: " + yolKaydi.gerekli })
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
    el("div", { sinif: "etiket", yazi: "YAPILMADI" }),
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
      yazi: "kopyala",
      attr: { type: "button" },
      on: {
        click: async (ev) => {
          try {
            await navigator.clipboard.writeText(deger);
            ev.target.textContent = "kopyalandı";
            setTimeout(() => { ev.target.textContent = "kopyala"; }, 1200);
          } catch (e) {
            ev.target.textContent = "kopyalanamadı";
          }
        }
      }
    })
  ]);
}
