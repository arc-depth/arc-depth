/* ===========================================================================
 * gorunum/kasalar.js — the collateral vaults
 *
 * One row per launch: reserve, claim per token, and the price at which the
 * floor engages. That last number is the point of the whole product and it
 * needs no history — reserve ÷ circulating IS the level below which a
 * buyback becomes possible, readable in two calls.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres } from "../ui.js";
import { ikon } from "../ikon.js";
import { launchListesi, jetonBilgileri, oku, ABI } from "../zincir.js";
import { TEMINAT_EVRENI, EKONOMI, DIS } from "../adresler.js";
import { para, jetonMiktar, tamSayidanSayi, bloktanSure } from "../bicim.js";

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Collateral vaults", "Each token's reserve and the price where the floor engages"));

  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Per call", EKONOMI.islemTavaniBps / 100 + "%", "spendable in one buyback"),
    olcum("Per window", EKONOMI.donemTavaniBps / 100 + "%", "spend plus reward"),
    olcum("Pencere", bloktanSure(EKONOMI.donemBlok), EKONOMI.donemBlok + " blok"),
    olcum("Caller's share", EKONOMI.odulPayiBps / 100 + "%", "of the discount captured")
  ]));

  kap.append(not(
    "A buyback is only possible while the market price is below the " +
    "claim. Above it the contract refuses by itself — the trigger is not " +
    "a separate detector but the invariant itself.",
    "bilgi"
  ));

  const { dagitildiMi, liste } = await launchListesi();

  if (!dagitildiMi) {
    kap.append(panel("Kasalar", bos(
      "No vaults yet",
      "Every launch creates its own collateral vault. With the launchpad " +
      "not deployed there is no vault to read."
    )));
    return kap;
  }
  if (!liste.length) {
    kap.append(panel("Vaults", bos("No vaults", "Nothing has been launched yet.")));
    return kap;
  }

  const bilgiler = await jetonBilgileri(liste.map((l) => l.token));
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Token" }),
    el("th", { yazi: "Rezerv" }),
    el("th", { yazi: "Circulating" }),
    el("th", { yazi: "Hak / token" }),
    el("th", { yazi: "Floor price" }),
    el("th", { yazi: "Kasa" })
  ])]));
  const govde = el("tbody");

  for (let i = 0; i < liste.length; i++) {
    const l = liste[i], b = bilgiler[i] || {};
    const [bakiye, hak, dolasim] = await Promise.all([
      oku(l.kasa, ABI.kasa, "bakiye", [DIS.usdc]),
      oku(l.kasa, ABI.kasa, "hak", [DIS.usdc]),
      oku(l.kasa, ABI.kasa, "dolasim")
    ]);

    const rez = bakiye == null ? null : tamSayidanSayi(bakiye, 6);
    const dol = dolasim == null ? null : tamSayidanSayi(dolasim, 18);
    /* reserve / circulating — the level the floor engages at. */
    const taban = rez != null && dol ? rez / dol : null;

    govde.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Token" } }, [
        el("a", { sinif: "jeton", attr: { href: "#/terminal?t=" + l.token } }, [
          el("div", { sinif: "jeton__logo jeton__logo--bos",
            yazi: (b.sembol || "?").slice(0, 3).toUpperCase() }),
          el("div", { sinif: "jeton__yazi" }, [
            el("div", { sinif: "jeton__sembol", yazi: b.sembol || "?" }),
            el("div", { sinif: "jeton__ad", yazi: b.ad || "" })
          ])
        ])
      ]),
      el("td", { sinif: "sayi", attr: { "data-et": "Rezerv" },
        yazi: rez == null ? "—" : para(rez) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Circulating" },
        yazi: dol == null ? "—" : jetonMiktar(dol) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Hak / token" },
        yazi: hak == null ? "—" : para(Number(hak) / 1e36) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Floor price" },
        yazi: taban == null ? "—" : para(taban) }),
      el("td", { attr: { "data-et": "Kasa" } }, [adres(l.kasa)])
    ]));
  }
  tablo.append(govde);

  kap.append(panel([
    el("span", { html: ikon("kalkan", "yol-oge__ikon") }),
    el("span", { yazi: "Kasalar" })
  ], el("div", { sinif: "tablo-sarmal" }, [tablo])));

  kap.append(not(
    "The reserve is shown in USDC only. If the basket holds other " +
    "assets their value is not added here — adding it would mean reading " +
    "every asset's feed, and that page does not exist yet. Rather than " +
    "show an incomplete total we show the one line that was read.",
    "uyari"
  ));

  return kap;
}
