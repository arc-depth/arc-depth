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
          ? el("div", { sinif: "ucuncul", yazi: "Kaynak: " + y.kaynak })
          : null,
        y.durum !== "canli" && y.gerekli
          ? el("div", { sinif: "ucuncul", yazi: "Gereken: " + y.gerekli })
          : null
      ]);
      liste.append(satir);
    }
    kap.append(panel(g.ad, liste));
  }

  return kap;
}
