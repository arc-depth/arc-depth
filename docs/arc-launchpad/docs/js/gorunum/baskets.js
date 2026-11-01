/* gorunum/baskets.js — the product page for TurKaydi type 7 (see urun.js)
 *
 * Extras for basket tokens (1 Nov 2026): each card lists the token's basket
 * lines, read the way Discover reads them (teminat-izle.js → teminatDurumu):
 * the asset, its chain, the dollars the founder put on the line and what the
 * vault holds for it now at market price.
 */
import { el } from "../ui.js";
import { urunSayfasi } from "../urun.js";
import { para } from "../bicim.js";

const kisa = (s) => (s && s.length > 20 ? s.slice(0, 10) + "…" + s.slice(-6) : s || "—");

export function kartEk(x) {
  const kutu = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Reading the basket…" });
  import("../teminat-izle.js").then(async (m) => {
    const cfg = await m.tokenAyari(x.token);   // v8, or the v9 Defter and vaults for a v9 launch
    const t = await m.teminatDurumu(x.token, cfg);
    if (!t) { kutu.textContent = "No basket recorded for this token."; return; }
    const tablo = el("table", { sinif: "tablo" });
    tablo.append(el("thead", {}, [el("tr", {}, ["Asset", "Chain", "Put in", "Now"].map((b) => el("th", { yazi: b })))]));
    tablo.append(el("tbody", {}, t.kalemler.map((k) => el("tr", {}, [
      el("td", { sinif: "mono", attr: { title: k.adres || k.varlik }, yazi: kisa(k.adres || k.varlik) }),
      el("td", { yazi: k.zincirAd }),
      el("td", { sinif: "sayi", yazi: para(k.ilk) }),
      el("td", { sinif: "sayi", yazi: k.deger == null ? "price n/a" : para(k.deger) + (k.kaynak === "last auction" ? " (last auction)" : k.kaynak === "on its way" ? " (on its way)" : "") }),
    ]))));
    kutu.className = "yigin";
    kutu.replaceChildren(el("div", { sinif: "yazi yazi--kucuk", yazi: "Basket: " + t.kalemler.length + " line" + (t.kalemler.length === 1 ? "" : "s") }),
      el("div", { sinif: "tablo-sarmal" }, [tablo]),
      t.bekleyen > 0.000001 ? el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Waiting to be bought: " + para(t.bekleyen) }) : el("span"),
      t.hatalar.length ? el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Unreadable: " + t.hatalar.join("; ") }) : el("span"));
  }).catch((e) => { kutu.textContent = "The vaults could not be read now: " + ((e && e.message) || e); });
  return kutu;
}

export function ciz() {
  return urunSayfasi(7, { kartEk });
}
