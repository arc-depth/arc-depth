/* ===========================================================================
 * gorunum/kesfet.js — discovery: the five lists the brief asks for
 *
 * Trending, newest, highest volume, biggest gainers, newly graduated.
 *
 * WHAT IS HONEST HERE AND WHAT WOULD NOT BE
 *   Four of those five rankings are time-windowed aggregates: volume over
 *   24h, change over 24h, "trending" however it is defined. None of them
 *   can be read from the chain in a call — they are sums over past Swap
 *   events, and summing them live would mean thousands of getLogs calls per
 *   page view.
 *
 *   So this view shows what it can read now — the launches that exist, with
 *   their live price, reserve and claim — and says plainly that the ranked
 *   tabs need the indexer that does not exist yet. The alternative was a
 *   row of plausible-looking numbers, which is the one thing the brief
 *   forbids outright.
 *
 *   Before the launchpad is deployed there is nothing at all, and the
 *   screen says THAT rather than "no tokens found": an empty registry and
 *   an absent registry are different facts.
 * =========================================================================== */

import { el, panel, sayfaUst, bos, not, olcum, temizle } from "../ui.js";
import { ikon } from "../ikon.js";
import { launchListesi, jetonBilgileri, besleyiciFiyat, oku, ABI } from "../zincir.js";
import { PULSE, EKONOMI, TEMINAT_EVRENI, launchpadCanli } from "../adresler.js";
import { para, kisaBuyuk, jetonMiktar, tamSayidanSayi } from "../bicim.js";
import { ozetOku, dolar } from "./analitik.js";
import { zincirLaunchPaneli } from "./tum-zincirler.js";

/* The other eight chains, from the same chain-read snapshot the analytics
   page uses (scripts/analitik-ozet.js, refreshed every two hours). Arc's
   list below is read live; these are as of the snapshot, and say so. */
async function digerZincirler() {
  let o;
  try { o = await ozetOku(); } catch (e) { return panel("Other chains", bos("Not available", "The snapshot could not be loaded: " + e.message)); }
  const tokenler = (o.zincirler || []).filter((z) => z.ad !== "arc").flatMap((z) => (z.tokenler || []).map((t) => ({ ...t, etiket: z.etiket })));
  const zincirler = (o.zincirler || []).filter((z) => z.ad !== "arc").map((z) => z.etiket).join(" · ");
  if (!tokenler.length) {
    /* Ethereum and HyperEVM carry twins and FTHM but no launchpad
       (dagitim-nesil3.json); the list is what the snapshot scanned. */
    return panel("Other chains", bos("No launches on the other eight chains yet",
      zincirler + " scanned, nothing launched yet. Launchpads run on Robinhood, Base, Arbitrum, BNB Chain, Avalanche and Monad; " +
      "Ethereum and HyperEVM carry token twins and FTHM only. Snapshot " + new Date(o.olusturuldu).toUTCString() + "."));
  }
  const t = el("table", { sinif: "tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["Token", "Chain", "In vault", "Volume", ""].map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  for (const x of tokenler) {
    g.append(el("tr", {}, [
      el("td", { yazi: (x.sembol || "?") + " · " + (x.ad || "") }),
      el("td", { yazi: x.etiket }),
      el("td", { sinif: "sayi", yazi: para(dolar(x.kasadaki)) }),
      el("td", { sinif: "sayi", yazi: para(dolar(x.hacim)) }),
      el("td", { yazi: x.token })
    ]));
  }
  t.append(g);
  return panel("Other chains", el("div", { sinif: "tablo-sarmal" }, [t]),
    el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "snapshot " + new Date(o.olusturuldu).toUTCString() }));
}

/* The five lists. `canliSiralama` marks the ones that can be ordered from a
   single read; the rest need the indexer and say so instead of guessing. */
const LISTELER = [
  { anahtar: "trend", ad: "Trend", canliSiralama: false,
    neden: "A trending rank needs 24 hours of trades and volume summed up, and that sum cannot be read with one chain call." },
  { anahtar: "yeni", ad: "Newly launched", canliSiralama: true },
  { anahtar: "hacim", ad: "Highest volume", canliSiralama: false,
    neden: "Volume is the sum of Swap events over a time window. Without an indexer that means thousands of log queries on every page load." },
  { anahtar: "yukselen", ad: "Biggest gainers", canliSiralama: false,
    neden: "A percentage change needs the price from 24 hours ago, and a past price only comes out of indexed events." },
  { anahtar: "mezun", ad: "Yeni mezunlar", canliSiralama: true }
];

export async function ciz({ param }) {
  const kap = el("div", { sinif: "yigin" });
  const arama = (param.get("q") || "").trim().toLowerCase();

  kap.append(sayfaUst(
    "Discover",
    "Collateral-backed tokens on nine chains",
    [
      el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur" } }, [
        el("span", { html: ikon("arti", "yol-oge__ikon") }),
        el("span", { yazi: "Create a token" })
      ])
    ]
  ));

  /* ---- platform-level facts that ARE readable now ------------------ */
  kap.append(await ozetSeridi());

  /* ---- the other eight chains, from the snapshot ------------------- */
  kap.append(await digerZincirler());

  /* ---- launches on every local-collateral chain ------------------- */
  kap.append(await zincirLaunchPaneli("Launches on every chain"));

  /* ---- the launch list -------------------------------------------- */
  const { dagitildiMi, liste } = await launchListesi();

  if (!dagitildiMi) {
    kap.append(panel("Tokens on Arc", bos(
      "No tokens on chain yet",
      "The launchpad contracts are written and measured against Arc " +
      "mainnet, but not deployed — so there is no record to read. We do " +
      "not show a fake list here.",
      el("a", { sinif: "dugme", attr: { href: "#/guvenlik" }, yazi: "Deployment status" })
    )));
    kap.append(listeSekmeleri([]));
    return kap;
  }

  if (!liste.length) {
    kap.append(panel("Tokens on Arc", bos(
      "The record is empty",
      "The launchpad is deployed but nothing has been launched yet."
    )));
    return kap;
  }

  /* Names and supplies in one batch, then the per-token live reads. */
  const bilgiler = await jetonBilgileri(liste.map((l) => l.token));
  const satirlar = [];
  for (let i = 0; i < liste.length; i++) {
    const l = liste[i], b = bilgiler[i] || {};
    if (arama) {
      const havuz = [b.ad, b.sembol, l.token].join(" ").toLowerCase();
      if (!havuz.includes(arama)) continue;
    }
    satirlar.push({ ...l, ...b });
  }

  if (arama && !satirlar.length) {
    kap.append(panel("Search", bos("No matches", 'Nothing found for "' + arama + '".')));
    return kap;
  }

  kap.append(listeSekmeleri(satirlar));
  return kap;
}

/* ---- the summary strip ----------------------------------------------- */

/**
 * Facts that need no indexer: the collateral universe and its live prices,
 * plus the economic constants the contracts enforce.
 */
async function ozetSeridi() {
  const izgara = el("div", { sinif: "izgara izgara--olcum" });

  /* Live collateral prices. These are real reads of Chainlink proxies on
     Arc — the one market number on this page that needs no history. */
  const fiyatlar = await Promise.all(
    TEMINAT_EVRENI.map((t) => besleyiciFiyat(t.besleyici, 8))
  );

  izgara.append(olcum(
    "Collateral asset",
    String(TEMINAT_EVRENI.length),
    "price and token both verified on Arc"
  ));

  const btc = fiyatlar[TEMINAT_EVRENI.findIndex((t) => t.anahtar === "cirbtc")];
  izgara.append(olcum("cirBTC", btc ? para(btc.fiyat, { kisalt: true }) : "—",
    btc ? "Chainlink proxy" : "feed could not be read"));

  const eth = fiyatlar[TEMINAT_EVRENI.findIndex((t) => t.anahtar === "weth")];
  izgara.append(olcum("WETH", eth ? para(eth.fiyat, { kisalt: true }) : "—",
    eth ? "Chainlink proxy" : "feed could not be read"));

  izgara.append(olcum("Opening market cap", para(EKONOMI.acilisMcap, { kisalt: true }),
    "the same price every launch"));
  /* No curve and no graduation since the third generation: the pool is
     the market from the first block, so the card shows the fee instead. */
  izgara.append(olcum("Trading fee", "2%",
    "on every buy and sell, aggregators included"));

  return izgara;
}

/* ---- the five lists -------------------------------------------------- */

function listeSekmeleri(satirlar) {
  let secili = "yeni";
  const govde = el("div", { sinif: "panel__govde panel__govde--sifir" });

  const sekmeKap = el("div", { sinif: "sekmeler", attr: { role: "tablist" } });
  for (const L of LISTELER) {
    sekmeKap.append(el("button", {
      sinif: "sekmeler__oge",
      yazi: L.ad,
      attr: { type: "button", role: "tab", "aria-selected": String(L.anahtar === secili) },
      on: {
        click: (ev) => {
          secili = L.anahtar;
          for (const b of sekmeKap.children) b.setAttribute("aria-selected", "false");
          ev.currentTarget.setAttribute("aria-selected", "true");
          ciziver();
        }
      }
    }));
  }

  function ciziver() {
    temizle(govde);
    const L = LISTELER.find((x) => x.anahtar === secili);

    if (!L.canliSiralama) {
      /* The honest version of a ranking we cannot compute. */
      govde.append(el("div", { sinif: "panel__govde" }, [
        el("div", { sinif: "yok" }, [
          el("div", { sinif: "etiket", yazi: "SIRALAMA YOK" }),
          el("div", { sinif: "yok__baslik", yazi: "The " + L.ad + " ranking cannot be computed yet" }),
          el("div", { sinif: "yok__yazi", yazi: L.neden }),
          el("div", { sinif: "yok__yazi", yazi:
            "Left empty rather than showing an invented ranking. The " +
            "list below is every token that can actually be read right " +
            "now." })
        ])
      ]));
      if (satirlar.length) govde.append(jetonTablosu(satirlar, "yeni"));
      return;
    }

    if (!satirlar.length) {
      govde.append(el("div", { sinif: "panel__govde" }, [
        bos("Empty list", "No token matches this filter.")
      ]));
      return;
    }
    govde.append(jetonTablosu(satirlar, secili));
  }

  ciziver();

  return el("section", { sinif: "panel" }, [
    el("div", { sinif: "panel__ust" }, [
      el("div", { sinif: "panel__baslik" }, [
        el("span", { html: ikon("pusula", "yol-oge__ikon") }),
        el("span", { yazi: "Tokens" })
      ]),
      el("div", { sinif: "ucuncul", yazi: satirlar.length + " token" })
    ]),
    el("div", { sinif: "panel__govde" }, [sekmeKap]),
    govde
  ]);
}

/* ---- the table ------------------------------------------------------- */

function jetonTablosu(satirlar, sira) {
  const sirali = [...satirlar];
  if (sira === "yeni") sirali.sort((a, b) => b.id - a.id);
  if (sira === "mezun") sirali.sort((a, b) => b.id - a.id);

  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [
    el("tr", {}, [
      el("th", { yazi: "Token" }),
      el("th", { yazi: "Fiyat" }),
      el("th", { yazi: "Reserve" }),
      el("th", { yazi: "Claim / token" }),
      el("th", { yazi: "Vergi" }),
      el("th", { yazi: "" })
    ])
  ]));

  const govde = el("tbody");
  for (const s of sirali) {
    govde.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Token" } }, [
        el("a", { sinif: "jeton", attr: { href: "#/terminal?t=" + s.token } }, [
          el("div", { sinif: "jeton__logo jeton__logo--bos",
            yazi: (s.sembol || "?").slice(0, 3).toUpperCase() }),
          el("div", { sinif: "jeton__yazi" }, [
            el("div", { sinif: "jeton__sembol", yazi: s.sembol || "?" }),
            el("div", { sinif: "jeton__ad", yazi: s.ad || "" })
          ])
        ])
      ]),
      /* Price, reserve and claim are filled in asynchronously per row:
         they are real reads and a row shows "—" until its read returns,
         never a placeholder number. */
      hucre("Fiyat", "—", "fiyat-" + s.id),
      hucre("Reserve", "—", "rezerv-" + s.id),
      hucre("Claim / token", "—", "hak-" + s.id),
      el("td", { sinif: "sayi", attr: { "data-et": "Vergi" },
        yazi: (s.vergiPpm / 10_000).toFixed(2).replace(".", ",") + "%" }),
      el("td", { attr: { "data-et": "" } }, [
        el("a", { sinif: "dugme dugme--kucuk",
          attr: { href: "#/terminal?t=" + s.token }, yazi: "Trade" })
      ])
    ]));
  }
  tablo.append(govde);

  /* Fire the live reads after the table is in the DOM. */
  for (const s of sirali) satirDoldur(s, tablo);

  return el("div", { sinif: "tablo-sarmal" }, [tablo]);
}

function hucre(etiket, yazi, id) {
  return el("td", { sinif: "sayi", attr: { "data-et": etiket }, veri: { hucre: id }, yazi });
}

async function satirDoldur(s, kok) {
  const yaz = (id, deger) => {
    const h = kok.querySelector('[data-hucre="' + id + '"]');
    if (h) h.textContent = deger;
  };
  try {
    const [bakiye, hak, dolasim] = await Promise.all([
      oku(s.kasa, ABI.kasa, "bakiye", [
        TEMINAT_EVRENI[0].token /* quote */
      ]),
      oku(s.kasa, ABI.kasa, "hak", [TEMINAT_EVRENI[0].token]),
      oku(s.kasa, ABI.kasa, "dolasim")
    ]);
    if (bakiye != null) yaz("rezerv-" + s.id, para(tamSayidanSayi(bakiye, 6)));
    if (hak != null) {
      /* hak is scaled by 1e36 and is quote-per-token. */
      const h = Number(hak) / 1e36;
      yaz("hak-" + s.id, h > 0 ? para(h) : "—");
    }
    if (dolasim != null && bakiye != null) {
      /* The price at which the floor engages equals reserve / circulating —
         the one price on this page that needs no history. */
      const d = tamSayidanSayi(dolasim, 18);
      const b = tamSayidanSayi(bakiye, 6);
      if (d > 0) yaz("fiyat-" + s.id, para(b / d) + " taban");
    }
  } catch (e) {
    /* A row that cannot be read keeps its dashes. */
  }
}
