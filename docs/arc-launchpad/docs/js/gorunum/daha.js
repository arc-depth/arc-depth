/* ===========================================================================
 * gorunum/daha.js — More / All modules (#/daha)
 *
 * The phone's "More" tab and the desktop's "All modules": quick access, the
 * same groups as the rail (every route in yol.js, each one tap away), and the
 * honest index of the platform: every module with its real state, counted,
 * with nothing dressed up.
 *
 * 12 Nov 2026 redesign: a search box that filters the tiles, the quick row,
 * at most one Sponsored tile under it (never first), the groups as tiles,
 * the layout switch, and the state list folded under a disclosure.
 * =========================================================================== */

import { el, sayfaUst, panel, not, ayrinti, ikon, GRUP_RENK } from "../ui.js";
import { YOLLAR, GRUPLAR, grubunYollari, durumSayimi } from "../yol.js";
import { sponsorYeri } from "../sponsor.js";
import { mobilMi } from "../cuzdan.js";

const DURUM_YAZI = {
  canli: { ad: "Live", sinif: "etiket--alis" },
  dagitim: { ad: "Coming soon", sinif: "etiket--uyari" },
  yapim: { ad: "Coming soon", sinif: "etiket--uyari" }
};

const STIL =
  ".hizli{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}" +
  ".hizli a{display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:16px;background:var(--yuzey-1,#12141b);border:1px solid var(--cizgi,#2a2f3a);color:inherit;text-decoration:none;min-width:0}" +
  ".hizli a:hover{border-color:var(--marka,#7c5cff)}.hizli b{font-size:15px}.hizli small{color:var(--yazi-3);font-size:12.5px;line-height:1.35}" +
  ".dh-grup{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}" +
  ".dh-oge{display:flex;align-items:center;gap:10px;min-height:48px;padding:10px 12px;border-radius:12px;border:1px solid var(--cizgi);background:var(--yuzey-1);color:var(--yazi-1);font-size:14px;font-weight:500;min-width:0}" +
  ".dh-oge:hover{border-color:var(--marka-cizgi);color:var(--yazi-1)}" +
  ".dh-oge svg{width:18px;height:18px;flex:none;color:var(--gr,var(--yazi-2))}" +
  ".dh-oge span{min-width:0;overflow:hidden;text-overflow:ellipsis}" +
  ".dh-oge .etiket{margin-left:auto;flex:none}" +
  ".dh-oge--alt{border-style:dashed}" +
  ".dh-ara{width:100%;height:44px;font-size:16px}" +
  ".dh-ayar{display:flex;gap:8px;flex-wrap:wrap}" +
  ".dh-bas{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--yazi-3);margin:0 0 8px}" +
  ".dh-bas i{width:8px;height:8px;border-radius:50%;background:var(--gr)}" +
  "@media (max-width:480px){.hizli{grid-template-columns:1fr 1fr;gap:8px}.hizli a{display:grid;grid-template-columns:auto 1fr;column-gap:8px;row-gap:2px;padding:10px 12px;align-items:center}.hizli a small{grid-column:1/-1;font-size:12px}.hizli b{font-size:14px}.dh-grup{grid-template-columns:repeat(3,minmax(0,1fr))}" +
  ".dh-oge{flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:10px 6px;font-size:12.5px;min-height:76px}" +
  ".dh-oge span{white-space:normal;overflow-wrap:anywhere;line-height:1.25}.dh-oge .etiket{margin:0;font-size:10.5px}}";

const HIZLI = [["vitrin", "Tokens on 11 chains"], ["launches", "Every launch from ARC PULSE"], ["warp", "Launch on any launchpad"], ["presale", "ARCP presale"],
  ["fthm", "The platform token"], ["liderlik", "Top creators and traders"], ["davet", "Invite and earn"], ["points", "Points for real activity"], ["dokuman", "How it works"]];

export async function ciz({ param } = {}) {
  if (!document.getElementById("hizli-stil")) document.head.append(el("style", { attr: { id: "hizli-stil" }, yazi: STIL }));
  const kap = el("div", { sinif: "yigin" });
  const s = durumSayimi();
  kap.append(sayfaUst("All modules", "Every page of ARC PULSE, grouped by what you came to do"));

  /* search: filters the tiles below as you type (page names and their one-line purpose) */
  const ara = el("input", { sinif: "girdi dh-ara", attr: { type: "search", placeholder: "Find a page: vaults, referrals, Warp…", "aria-label": "Find a page", autocomplete: "off" } });
  kap.append(ara);

  /* quick access: the pages people open most */
  const hizli = el("div", { sinif: "hizli" }, HIZLI.map(([k, alt]) => {
    const y = YOLLAR.find((x) => x.yol === k);
    if (!y) return null;
    return el("a", { attr: { href: y.site || "#/" + y.yol }, veri: { ara: (y.ad + " " + (y.kisa || "") + " " + alt).toLowerCase() } },
      [el("span", { sinif: "ucuncul", html: ikon(y.ikon, "yol-oge__ikon") }), el("b", { yazi: y.kisa || y.ad }), el("small", { yazi: alt })]);
  }));
  kap.append(panel("Quick access", hizli));
  /* at most one Sponsored tile, under the quick row (never first); nothing at all when none is booked */
  kap.append(sponsorYeri("more", "tile"));

  /* the same groups as the desktop rail: every route, each one tap away */
  const tumOgeler = [];
  for (const g of GRUPLAR) {
    const ogeler = grubunYollari(g.anahtar);
    if (!ogeler.length) continue;
    const izgara = el("div", { sinif: "dh-grup" }, ogeler.map((y) => {
      const d = DURUM_YAZI[y.durum];
      const a = el("a", { sinif: "dh-oge" + (y.ebeveyn ? " dh-oge--alt" : ""), attr: { href: y.site || "#/" + y.yol, title: y.ozet || y.ad, style: "--gr:" + (GRUP_RENK[g.anahtar] || "") },
        veri: { yol: y.yol, ara: (y.ad + " " + (y.kisa || "") + " " + (y.ozet || "") + " " + g.ad).toLowerCase() } },
        [el("span", { html: ikon(y.ikon) }), el("span", { yazi: y.ad + (y.site && y.site !== "presale.html" ? " ↗" : "") }),
          y.durum !== "canli" ? el("span", { sinif: "etiket " + d.sinif, yazi: d.ad }) : null]);
      tumOgeler.push(a);
      return a;
    }));
    kap.append(el("section", { sinif: "dh-bolum", attr: { id: "grup-" + g.anahtar } }, [
      el("h2", { sinif: "dh-bas", attr: { style: "--gr:" + (GRUP_RENK[g.anahtar] || "") } }, [el("i"), g.ad]), izgara]));
  }
  const yok = el("p", { sinif: "ucuncul", attr: { hidden: true }, yazi: "No page matches. For tokens, use the search in the top bar." });
  kap.append(yok);
  ara.addEventListener("input", () => {
    const q = ara.value.trim().toLowerCase();
    let gorunen = 0;
    for (const a of [...tumOgeler, ...hizli.children]) { const v = !q || a.dataset.ara.includes(q); a.hidden = !v; if (v && tumOgeler.includes(a)) gorunen++; }
    for (const b of kap.querySelectorAll(".dh-bolum")) b.hidden = ![...b.querySelectorAll(".dh-oge")].some((a) => !a.hidden);
    yok.hidden = gorunen > 0;
  });

  /* the layout switch (phones open the phone layout; the full desktop layout is one tap away) */
  const masaustu = (() => { try { return localStorage.getItem("arcpulse-gorunum") === "masaustu"; } catch (e) { return false; } })();
  if (mobilMi() || masaustu) kap.append(panel("Display", el("div", { sinif: "dh-ayar" }, [
    el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: masaustu ? "Switch to the phone layout" : "Switch to the desktop layout",
      on: { click: () => window.dispatchEvent(new Event("arcpulse-gorunum")) } }),
  ])));

  /* the honest index: every module, its state and purpose; folded so the tiles come first
     (the registry's `kaynak` names contracts and functions, which stay out of visible text) */
  const liste = el("div", { sinif: "yigin yigin--sik" });
  for (const g of GRUPLAR) {
    for (const y of grubunYollari(g.anahtar)) {
      const d = DURUM_YAZI[y.durum];
      liste.append(el("a", { sinif: "jeton-kart", attr: { href: y.site || "#/" + y.yol } }, [
        el("div", { sinif: "satir satir--arasi" }, [
          el("div", { sinif: "satir" }, [el("span", { sinif: "ucuncul", html: ikon(y.ikon, "yol-oge__ikon") }), el("strong", { yazi: y.ad })]),
          el("span", { sinif: "etiket " + d.sinif, yazi: d.ad })
        ]),
        y.ozet ? el("div", { sinif: "ikincil", yazi: y.ozet }) : null,
        y.durum !== "canli" && y.gerekli ? el("div", { sinif: "ucuncul", yazi: "Needs: " + y.gerekli }) : null
      ]));
    }
  }
  kap.append(panel("Every module and its state", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "ikincil", yazi: s.canli + " live · " + (s.dagitim + s.yapim) + " coming soon" }),
    not("Unfinished modules are not hidden: the whole architecture is visible, and every line says whether there is something behind it. A module that does not work is not offered as an active button.", "bilgi"),
    ayrinti("Show every module with what it does", liste),
  ])));

  /* #/daha?g=<group>: open at that group */
  const g = param && param.get("g");
  if (g) setTimeout(() => { const b = document.getElementById("grup-" + g); if (b) b.scrollIntoView({ block: "start" }); }, 50);
  return kap;
}
