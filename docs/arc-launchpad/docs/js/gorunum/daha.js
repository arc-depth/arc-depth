/* ===========================================================================
 * gorunum/daha.js — every module, with its real state
 *
 * This is the mobile overflow for the rail, and it doubles as the honest
 * index of the platform: three states, counted, with nothing dressed up.
 * A visitor can see in one screen what works, what is waiting on a
 * deployment and what is not built — which is information a roadmap page
 * usually hides.
 * =========================================================================== */

import { el, sayfaUst, panel, not } from "../ui.js";
import { ikon } from "../ikon.js";
import { YOLLAR, GRUPLAR, durumSayimi } from "../yol.js";

const DURUM_YAZI = {
  canli: { ad: "working", sinif: "etiket--alis" },
  dagitim: { ad: "awaiting deployment", sinif: "etiket--uyari" },
  yapim: { ad: "not built", sinif: "" }
};

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  const s = durumSayimi();

  kap.append(sayfaUst("All modules",
    s.canli + " working · " + s.dagitim + " awaiting deployment · " +
    s.yapim + " not built"));

  /* quick access (12 Nov 2026): the pages people open most, one tap from the phone's More tab */
  if (!document.getElementById("hizli-stil")) document.head.append(el("style", { attr: { id: "hizli-stil" }, yazi:
    ".hizli{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}" +
    ".hizli a{display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:16px;background:var(--yuzey-1,#12141b);border:1px solid var(--cizgi,#2a2f3a);color:inherit;text-decoration:none}" +
    ".hizli a:hover{border-color:var(--marka,#7c5cff)}.hizli b{font-size:15px}.hizli small{opacity:.7;font-size:12px;line-height:1.35}" +
    "@media (max-width:480px){.hizli{grid-template-columns:1fr 1fr}}" }));
  const HIZLI = [["vitrin", "Every token on 13 chains"], ["warp", "Launch on any launchpad"], ["launches", "Every launch from ARC PULSE"], ["presale", "ARCP presale"],
    ["fthm", "Buy ARCP from any chain"], ["liderlik", "Top creators and traders"], ["davet", "Invite and earn"], ["dokuman", "How it works"]];
  kap.append(panel("Quick access", el("div", { sinif: "hizli" }, HIZLI.map(([k, alt]) => {
    const y = YOLLAR.find((x) => x.yol === k);
    if (!y) return null;
    return el("a", { attr: { href: y.site || "#/" + y.yol } }, [el("span", { sinif: "ucuncul", html: ikon(y.ikon, "yol-oge__ikon") }), el("b", { yazi: y.kisa || y.ad }), el("small", { yazi: alt })]);
  }))));

  kap.append(not(
    "Unfinished modules are not hidden: the whole architecture is " +
    "visible, and every line says whether there is something behind it. " +
    "A module that does not work is not offered as an active button.",
    "bilgi"
  ));

  for (const g of GRUPLAR) {
    const ogeler = YOLLAR.filter((y) => y.grup === g.anahtar);
    if (!ogeler.length) continue;

    const liste = el("div", { sinif: "yigin yigin--sik" });
    for (const y of ogeler) {
      const d = DURUM_YAZI[y.durum];
      const satir = el(y.durum === "yapim" ? "div" : "a", {
        sinif: "jeton-kart",
        attr: y.durum === "yapim" ? {} : { href: "#/" + y.yol }
      }, [
        el("div", { sinif: "satir satir--arasi" }, [
          el("div", { sinif: "satir" }, [
            el("span", { sinif: "ucuncul", html: ikon(y.ikon, "yol-oge__ikon") }),
            el("strong", { yazi: y.ad })
          ]),
          el("span", { sinif: "etiket " + d.sinif, yazi: d.ad })
        ]),
        y.ozet ? el("div", { sinif: "ikincil", yazi: y.ozet }) : null,
        y.durum === "canli" && y.kaynak
          ? el("div", { sinif: "ucuncul", yazi: "Source: " + y.kaynak })
          : null,
        y.durum !== "canli" && y.gerekli
          ? el("div", { sinif: "ucuncul", yazi: "Needs: " + y.gerekli })
          : null
      ]);
      liste.append(satir);
    }
    kap.append(panel(g.ad, liste));
  }

  return kap;
}
