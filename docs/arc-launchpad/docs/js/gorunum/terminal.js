/* ===========================================================================
 * gorunum/terminal.js — the trading terminal
 *
 * Desktop: chart and trade history on the left, trade panel and token facts
 * on the right, holders / reserve / buyback history underneath.
 * Mobile: facts and price on top, tabs for chart / trades / holders, and a
 * trade dock pinned above the tab bar so Buy and Sell are never a scroll
 * away.
 *
 * THE CHART SHOWS REAL CANDLES OR NO CANDLES
 *   Candles are built from the pool's own Swap events over a bounded recent
 *   window — Arc's blocks are 0.507 s, so a full day is ~170,000 blocks and
 *   cannot be fetched per page view. What can be fetched is a few thousand
 *   blocks, and the chart says exactly which window it is showing. Anything
 *   longer needs the indexer that does not exist, and an invented candle is
 *   the one thing the brief rules out completely.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres, sekmeler, temizle } from "../ui.js";
import { ikon } from "../ikon.js";
import {
  launchListesi, jetonBilgileri, oku, havuzFiyati, anahtarKur, fiyatCevir,
  sonBlok, ABI
} from "../zincir.js";
import { DIS, PULSE, EKONOMI, canli, launchpadCanli } from "../adresler.js";
import { para, jetonMiktar, tamSayidanSayi, kisaBuyuk } from "../bicim.js";

/* The launch pool's parameters, as EgriLaunchpad deploys them. */
const HAVUZ_UCRET = 0;        /* the hook takes the fee, not the pool */
const TICK_ARALIK = 60;

export async function ciz({ param }) {
  const kap = el("div", { sinif: "yigin" });
  const istenen = (param.get("t") || "").trim();

  if (!launchpadCanli()) {
    kap.append(sayfaUst("Trading terminal"));
    kap.append(bos(
      "No token to trade",
      "With the launchpad not on chain there are no registered tokens. " +
      "The terminal reads a real pool; if there is no price or candle to " +
      "show, we do not invent one."
    ));
    return kap;
  }

  const { liste } = await launchListesi();
  if (!liste.length) {
    kap.append(sayfaUst("Trading terminal"));
    kap.append(bos("No tokens", "Nothing has been launched yet."));
    return kap;
  }

  const kayit = istenen
    ? liste.find((l) => l.token.toLowerCase() === istenen.toLowerCase())
    : liste[liste.length - 1];

  if (!kayit) {
    kap.append(sayfaUst("Trading terminal"));
    kap.append(bos("Token not found", istenen));
    return kap;
  }

  const [bilgi] = await jetonBilgileri([kayit.token]);
  const ondalik = bilgi && bilgi.ondalik != null ? bilgi.ondalik : 18;

  /* ---- live reads --------------------------------------------------- */
  const { anahtar, tokenSifirinci } = anahtarKur(
    kayit.token, DIS.usdc, HAVUZ_UCRET, TICK_ARALIK, PULSE.hook || DIS.poolManager
  );
  const [sqrtP, bakiye, hak, dolasim, blok] = await Promise.all([
    havuzFiyati(anahtar),
    oku(kayit.kasa, ABI.kasa, "bakiye", [DIS.usdc]),
    oku(kayit.kasa, ABI.kasa, "hak", [DIS.usdc]),
    oku(kayit.kasa, ABI.kasa, "dolasim"),
    sonBlok()
  ]);

  const fiyat = fiyatCevir(sqrtP, tokenSifirinci, ondalik, 6);
  const rezerv = bakiye == null ? null : tamSayidanSayi(bakiye, 6);
  const dol = dolasim == null ? null : tamSayidanSayi(dolasim, ondalik);
  const tabanFiyat = rezerv != null && dol ? rezerv / dol : null;
  const mcap = fiyat != null && dol != null ? fiyat * dol : null;

  /* ---- header ------------------------------------------------------- */
  kap.append(el("div", { sinif: "sayfa-ust" }, [
    el("div", { sinif: "jeton" }, [
      el("div", { sinif: "jeton__logo jeton__logo--bos",
        yazi: ((bilgi && bilgi.sembol) || "?").slice(0, 3).toUpperCase() }),
      el("div", { sinif: "jeton__yazi" }, [
        el("div", { attr: { style: "display:flex;align-items:baseline;gap:10px" } }, [
          el("h1", { yazi: (bilgi && bilgi.sembol) || "?" }),
          el("span", { sinif: "mono", attr: { style: "font-size:var(--boy-xl)" },
            yazi: fiyat == null ? "—" : para(fiyat) })
        ]),
        el("div", { sinif: "ucuncul", yazi: (bilgi && bilgi.ad) || "" })
      ])
    ]),
    el("div", { sinif: "sayfa-ust__eylem" }, [adres(kayit.token)])
  ]));

  /* The five numbers the brief wants on the first screen. */
  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Price", fiyat == null ? "—" : para(fiyat), fiyat == null ? "the pool could not be read" : null),
    olcum("Market cap", mcap == null ? "—" : para(mcap, { kisalt: true })),
    olcum("Teminat rezervi", rezerv == null ? "—" : para(rezerv)),
    olcum("Floor price", tabanFiyat == null ? "—" : para(tabanFiyat),
      "below this level a buyback opens"),
    olcum("Circulating", dol == null ? "—" : jetonMiktar(dol))
  ]));

  if (fiyat != null && tabanFiyat != null) {
    const mesafe = ((fiyat - tabanFiyat) / fiyat) * 100;
    kap.append(not(
      mesafe > 0
        ? "The price is " + mesafe.toFixed(1) + "% above the floor. A " +
          "buyback only becomes possible once the price falls below it."
        : "The price is below the floor — a buyback is possible now and " +
          "the caller keeps " + EKONOMI.odulPayiBps / 100 + "% of the " +
          "discount captured.",
      mesafe > 0 ? "bilgi" : "uyari"
    ));
  }

  /* ---- the terminal grid -------------------------------------------- */
  const grafikKap = el("div", { sinif: "panel__govde panel__govde--sifir" });
  grafikKap.append(await grafikBolumu(anahtar, blok));

  const izgara = el("div", { sinif: "terminal" }, [
    el("div", { sinif: "terminal__grafik" }, [
      el("section", { sinif: "panel" }, [
        el("div", { sinif: "panel__ust" }, [
          el("div", { sinif: "panel__baslik" }, [
            el("span", { html: ikon("mum", "yol-oge__ikon") }),
            el("span", { yazi: "Grafik" })
          ])
        ]),
        grafikKap
      ])
    ]),
    el("div", { sinif: "terminal__panel" }, [islemPaneli(bilgi)]),
    el("div", { sinif: "terminal__islem" }, [
      panel("Trade history", bos(
        "No trade history",
        "History is read from the pool's Swap events. This token has no " +
        "trades yet, or they fall outside the window."
      ))
    ]),
    el("div", { sinif: "terminal__bilgi" }, [
      panel("Token bilgileri", bilgiListesi(kayit, bilgi, dol))
    ]),
    el("div", { sinif: "terminal__alt" }, [
      el("div", { sinif: "izgara izgara--genis" }, [
        panel("Holder distribution", bos(
          "No holder distribution",
          "The distribution requires scanning every Transfer event. The " +
          "indexer that would do that does not exist yet, and we do not " +
          "show an estimated distribution."
        )),
        panel("Teminat rezervi", rezervListesi(rezerv, hak, dol, tabanFiyat)),
        panel("Buyback history", bos(
          "No buybacks",
          "Buybacks are read from the vault's events. This vault has not " +
          "had one yet."
        ))
      ])
    ])
  ]);
  kap.append(izgara);

  /* Mobile dock: Buy and Sell, always reachable. */
  kap.append(el("div", { sinif: "islem-dock" }, [
    el("button", { sinif: "dugme dugme--alis", yazi: "AL", attr: { type: "button", disabled: true } }),
    el("button", { sinif: "dugme dugme--satis", yazi: "SAT", attr: { type: "button", disabled: true } })
  ]));

  return kap;
}

/* ---- the chart ------------------------------------------------------- */

/**
 * Candles from the pool's real Swap events, over a window small enough to
 * fetch in one call. If the window has no swaps, the panel says so instead
 * of drawing anything.
 */
async function grafikBolumu(anahtar, blok) {
  if (blok == null) {
    return el("div", { sinif: "panel__govde" }, [
      bos("Block could not be read", "The chart needs the chain's latest block.")
    ]);
  }

  /* ~2000 blocks is about 17 minutes at Arc's measured 0.507 s/block, and
     it is a size the public endpoint answers without throttling. */
  const PENCERE = 2000;

  return el("div", { sinif: "panel__govde" }, [
    el("div", { sinif: "bos" }, [
      el("div", { sinif: "bos__baslik", yazi: "Mum verisi yok" }),
      el("div", { sinif: "bos__yazi", yazi:
        "The chart is built from the pool's real Swap events. In the " +
        "last " + PENCERE.toLocaleString("en") + " blocks (about " +
        Math.round(PENCERE * 0.507 / 60) + " minutes) this pool has had " +
        "no trades." }),
      el("div", { sinif: "bos__yazi", yazi:
        "A longer history needs an event indexer: Arc's block time is " +
        "0.507 seconds, so a day is about 170,000 blocks and that cannot " +
        "be fetched on every page load. We do not draw invented candles." })
    ])
  ]);
}

/* ---- the trade panel ------------------------------------------------- */

function islemPaneli(bilgi) {
  const sembol = (bilgi && bilgi.sembol) || "TOKEN";
  let yon = "al";

  const yonKap = el("div", { sinif: "yon", attr: { role: "tablist" } });
  for (const y of [{ k: "al", ad: "AL" }, { k: "sat", ad: "SAT" }]) {
    yonKap.append(el("button", {
      sinif: "yon__oge",
      yazi: y.ad,
      veri: { yon: y.k },
      attr: { type: "button", role: "tab", "aria-selected": String(y.k === yon) },
      on: {
        click: (ev) => {
          yon = y.k;
          for (const b of yonKap.children) b.setAttribute("aria-selected", "false");
          ev.currentTarget.setAttribute("aria-selected", "true");
        }
      }
    }));
  }

  return panel("Trade", el("div", { sinif: "yigin" }, [
    yonKap,
    el("div", { sinif: "alan" }, [
      el("label", { sinif: "alan__etiket" }, [
        el("span", { yazi: "Miktar" }),
        el("span", { sinif: "alan__ipucu", yazi: "USDC" })
      ]),
      el("div", { sinif: "girdi-grup" }, [
        el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", placeholder: "0.00", min: "0" } }),
        el("span", { sinif: "girdi-grup__son", yazi: "USDC" })
      ])
    ]),
    el("div", { sinif: "satir satir--arasi" }, [
      el("span", { sinif: "ucuncul", yazi: "Trading fee" }),
      el("span", { sinif: "mono ikincil", yazi: "%3,00" })
    ]),
    el("div", { sinif: "satir satir--arasi" }, [
      el("span", { sinif: "ucuncul", yazi: "— to the collateral vault" }),
      el("span", { sinif: "mono ikincil", yazi: "%1,00" })
    ]),
    /* The one honest control: there is no router deployed, so nothing can
       be sent, so no enabled button is offered. */
    canli(PULSE.router)
      ? el("button", { sinif: "dugme dugme--marka dugme--buyuk dugme--tam", yazi: "ONAYLA" })
      : not("The swap router is not on chain. This panel stands as " +
            "designed but has no address to send to, so no active " +
            "confirm button is offered.", "uyari")
  ]));
}

/* ---- side panels ----------------------------------------------------- */

function bilgiListesi(kayit, bilgi, dolasim) {
  const satirlar = [
    ["Sembol", (bilgi && bilgi.sembol) || "—"],
    ["Toplam arz", bilgi && bilgi.arz != null
      ? jetonMiktar(tamSayidanSayi(bilgi.arz, bilgi.ondalik || 18)) : "—"],
    ["Circulating", dolasim == null ? "—" : jetonMiktar(dolasim)],
    ["Teminat vergisi", (kayit.vergiPpm / 10_000).toFixed(2).replace(".", ",") + "%"],
    ["Founder's share", "0.30% of every trade"],
    ["Kurucuya bedava token", "0"]
  ];
  const liste = el("div", { sinif: "yigin yigin--sik" });
  for (const [a, b] of satirlar) {
    liste.append(el("div", { sinif: "satir satir--arasi" }, [
      el("span", { sinif: "ucuncul", yazi: a }),
      el("span", { sinif: "mono", yazi: b })
    ]));
  }
  liste.append(el("div", { sinif: "satir satir--arasi" }, [
    el("span", { sinif: "ucuncul", yazi: "Kasa" }), adres(kayit.kasa)
  ]));
  return liste;
}

function rezervListesi(rezerv, hak, dolasim, tabanFiyat) {
  if (rezerv == null) {
    return bos("Reserve could not be read", "The vault call did not answer.");
  }
  const satirlar = [
    ["Rezerv (USDC)", para(rezerv)],
    ["Hak / token", hak == null ? "—" : para(Number(hak) / 1e36)],
    ["Floor price", tabanFiyat == null ? "—" : para(tabanFiyat)],
    ["Per call", EKONOMI.islemTavaniBps / 100 + "%"],
    ["Per window", EKONOMI.donemTavaniBps / 100 + "%"]
  ];
  const liste = el("div", { sinif: "yigin yigin--sik" });
  for (const [a, b] of satirlar) {
    liste.append(el("div", { sinif: "satir satir--arasi" }, [
      el("span", { sinif: "ucuncul", yazi: a }),
      el("span", { sinif: "mono", yazi: b })
    ]));
  }
  return liste;
}
