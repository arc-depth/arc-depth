/* ===========================================================================
 * gorunum/teminat-sec.js — choosing collateral: the suggested 50, or your
 *                          own CA
 *
 * WHAT IT SHOWS
 *   What the launcher can pick as collateral. There are two paths and they
 *   are equal:
 *
 *     1. Pick from the suggested 50   — a shortcut
 *     2. Paste a contract address     — everything else
 *
 *   The list is not a gate. Not being on it is not being forbidden; the CA
 *   field runs the EXACT SAME check as a listed asset.
 *
 * EVERY NUMBER WAS MEASURED
 *   The suggested 50 were generated from `teminat-adaylari.json`, which was
 *   itself read off the chains. The CA check is live: the moment an address
 *   is pasted, the deepest USDC pool is searched for on seven chains and
 *   its liquidity and observation history are examined. No service is
 *   asked and nothing is shown from a cache.
 *
 * THE PAGE AND THE CHAIN CANNOT DRIFT APART
 *   The derivation here is exactly what `contracts/HavuzFiyat.sol` does on
 *   chain: scan the tiers, find the most liquid pool, read the price from
 *   that pool's history. If they drifted, the page would say "it works",
 *   the launch would be sent, the contract would refuse and the gas would
 *   be gone.
 *
 * "DOES NOT WORK" IS TWO DIFFERENT THINGS
 *   A pool with no liquidity is one this system cannot fill — that is a no.
 *   A pool whose observation history has not been extended can be extended
 *   by ANYONE, for a one-off bit of gas. Putting both in the same bucket
 *   would present a fixable condition as a permanent refusal.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres, hata } from "../ui.js";
import { ONERILEN, ZINCIRLER, TEMINAT_OLCUMU, DAGILIM} from "../teminat-listesi.js";
import { tumZincirleriTara, adresMi, ASGARI_KARDINALITE } from "../teminat.js";

/* Liquidity is a Q128 number with no unit anybody reads; what matters is
   relative depth between tiers of the same asset. Shown in short form so a
   column of them can be compared at a glance. */
/* The measured size, written the way a person reads money. */
export function tutarYaz(t) {
  if (!t || t === "0") return "not measurable";
  const n = Number(t) / 1e6;
  return "$" + n.toLocaleString("tr", { maximumFractionDigits: 0 });
}

function derinlik(L) {
  const n = Number(L);
  if (!isFinite(n) || n === 0) return "0";
  const birim = [["e21", 1e21], ["e18", 1e18], ["e15", 1e15], ["e12", 1e12], ["e9", 1e9]];
  for (const [ad, b] of birim) if (n >= b) return (n / b).toFixed(2) + ad;
  return n.toLocaleString("en");
}

export function zincirEtiketi(anahtar) {
  const Z = ZINCIRLER[anahtar];
  return Z ? Z.ad : anahtar;
}

/* ---- the recommended list ------------------------------------------- */

export function oneriTablosu(secildi) {
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "#" }),
    el("th", { yazi: "Asset" }),
    el("th", { yazi: "Zincir" }),
    el("th", { yazi: "Havuz" }),
    el("th", { yazi: "Up to" }),
    el("th", { yazi: "" })
  ])]));
  const govde = el("tbody");

  ONERILEN.forEach((v, i) => {
    const zincirler = Object.keys(v.zincirler);
    govde.append(el("tr", {}, [
      el("td", { yazi: String(i + 1) }),
      el("td", {}, [
        el("div", {}, [
          el("strong", { yazi: v.simge }),
          el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "  " + v.ad })
        ]),
        el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: v.ondalik + " decimals" })
      ]),
      el("td", {}, [
        el("div", { yazi: String(zincirler.length) }),
        el("div", {
          sinif: "yazi yazi--kucuk yazi--sessiz",
          yazi: zincirler.map(zincirEtiketi).join(", ")
        })
      ]),
      el("td", { yazi: String(v.havuz) }),
      el("td", {}, [
        el("div", { yazi: tutarYaz(v.azamiTutar) }),
        el("div", { sinif: "yazi yazi--kucuk yazi--sessiz",
          yazi: "largest measured" })
      ]),
      el("td", {}, [
        el("button", {
          sinif: "dugme dugme--sessiz",
          attr: { type: "button" },
          yazi: "Choose",
          on: { click: () => secildi(v) }
        })
      ])
    ]));
  });

  tablo.append(govde);
  return tablo;
}

/* ---- the CA field, which checks live -------------------------------- */

export function caAlani(secildi) {
  const girdi = el("input", {
    sinif: "girdi",
    attr: { type: "text", placeholder: "0x… kontrat adresi", spellcheck: "false" }
  });
  const dugme = el("button", {
    sinif: "dugme dugme--marka",
    attr: { type: "button" },
    yazi: "Kontrol et"
  });
  const sonuc = el("div", { sinif: "yigin yigin--sik" });

  async function kontrol() {
    const ca = girdi.value.trim();
    sonuc.replaceChildren();

    if (!adresMi(ca)) {
      sonuc.append(not(
        "That is not a contract address. It has to be forty hex digits " +
        "starting with 0x.",
        "uyari"
      ));
      return;
    }

    dugme.disabled = true;
    dugme.textContent = "Scanning chains…";
    sonuc.append(el("div", {
      sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: "Looking for the deepest USDC pool across " +
        Object.keys(ZINCIRLER).length + " chains…"
    }));

    let r;
    try {
      r = await tumZincirleriTara(ca);
    } catch (e) {
      sonuc.replaceChildren(hata("The scan failed", (e && e.message) || String(e)));
      dugme.disabled = false;
      dugme.textContent = "Kontrol et";
      return;
    }

    dugme.disabled = false;
    dugme.textContent = "Kontrol et";
    sonuc.replaceChildren();

    /* Identity first: twenty bytes look like any other twenty bytes, and
       the symbol is the only way somebody can tell they pasted what they
       meant to paste. */
    sonuc.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Symbol", r.kimlik.simge || "unreadable",
        r.kimlik.simge ? null : "this address does not answer like an ERC20"),
      olcum("Decimals", r.kimlik.ondalik == null ? "—" : String(r.kimlik.ondalik), null),
      olcum("Result", r.calisiyor ? "Works" : "Does not work", r.ozet)
    ]));

    /* Every chain, including the ones that said no — a result that only
       lists the chains that worked cannot be checked by the reader. */
    const tablo = el("table", { sinif: "tablo tablo--kart" });
    tablo.append(el("thead", {}, [el("tr", {}, [
      el("th", { yazi: "Zincir" }),
      el("th", { yazi: "Durum" }),
      el("th", { yazi: "Kademe" }),
      el("th", { yazi: "Derinlik" }),
      el("th", { yazi: "Observations" }),
      el("th", { yazi: "Havuz" })
    ])]));
    const govde = el("tbody");

    for (const s of r.sonuclar) {
      if (s.hata) {
        govde.append(el("tr", {}, [
          el("td", { yazi: s.ad || s.zincir }),
          el("td", { attr: { colspan: 5 } }, [
            el("span", {
              sinif: "yazi yazi--kucuk yazi--sessiz",
              yazi: "unreadable: " + s.hata
            })
          ])
        ]));
        continue;
      }
      const d = s.enDerin;
      govde.append(el("tr", {}, [
        el("td", { yazi: s.ad }),
        el("td", {}, [
          s.calisiyor
            ? el("span", { sinif: "etiket etiket--kabul", yazi: "Works" })
            : el("span", {
              sinif: "etiket " + (s.duzeltilebilir ? "etiket--bekle" : "etiket--red"),
              yazi: s.duzeltilebilir ? "Not yet" : "No"
            }),
          s.sebep
            ? el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: s.sebep })
            : null
        ]),
        el("td", { yazi: d ? String(d.kademe) : "—" }),
        el("td", { yazi: d ? derinlik(d.likidite) : "—" }),
        el("td", { yazi: d ? String(d.kardinalite) : "—" }),
        el("td", {}, [d ? adres(d.havuz) : el("span", { yazi: "—" })])
      ]));
    }
    tablo.append(govde);
    sonuc.append(tablo);

    if (r.duzeltilebilir.length) {
      sonuc.append(not(
        "\"Not yet\" is not a permanent refusal: that pool's " +
        "observation history has not been opened. ANYONE can open it on " +
        "Uniswap — one transaction's gas, no permission needed. Once it " +
        "is open the asset can be used as collateral. (Observations " +
        "needed: " + ASGARI_KARDINALITE + ")",
        "bilgi"
      ));
    }
    if (!r.calisiyor && !r.duzeltilebilir.length) {
      sonuc.append(not(
        "This address has no USDC pool with liquidity on any chain. " +
        "Collateral has to be able to move in and out, so this is a gap " +
        "the system cannot fill. An address with a pool is needed.",
        "uyari"
      ));
    }

    if (r.calisiyor) {
      sonuc.append(el("div", { sinif: "satir satir--arali" }, [
        el("button", {
          sinif: "dugme dugme--marka",
          attr: { type: "button" },
          yazi: r.kimlik.simge
            ? "Use " + r.kimlik.simge + " as collateral"
            : "Use this address as collateral",
          on: {
            click: () => secildi({
              simge: r.kimlik.simge || ca.slice(0, 10),
              ad: r.kimlik.simge || "kontrat adresi",
              ondalik: r.kimlik.ondalik ?? 18,
              havuz: r.calisan.reduce((a, s) => a + s.havuzSayisi, 0),
              zincirler: Object.fromEntries(r.calisan.map((s) => [
                s.zincir, { token: ca, havuz: s.havuzSayisi }
              ])),
              caIle: true
            })
          }
        })
      ]));
    }
  }

  dugme.addEventListener("click", kontrol);
  girdi.addEventListener("keydown", (ev) => { if (ev.key === "Enter") kontrol(); });

  return el("div", { sinif: "yigin yigin--sik" }, [
    el("p", {
      sinif: "yazi yazi--sessiz",
      yazi: "To use a token that is not listed, paste its contract " +
        "address. The same check runs: the deepest USDC pool across " +
        "seven chains is found, and its liquidity and observation " +
        "history are read. You do not pick the fee tier — the most " +
        "liquid one is found for you."
    }),
    el("div", { sinif: "satir satir--arali" }, [girdi, dugme]),
    sonuc
  ]);
}

/* ---- the screen ------------------------------------------------------ */

export async function ciz({ param }) {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst(
    "Collateral picker",
    ONERILEN.length + " suggested assets, or any contract address you paste"
  ));

  const secim = el("div");
  const secildi = (v) => {
    secim.replaceChildren(panel("Chosen collateral", el("div", { sinif: "yigin yigin--sik" }, [
      el("div", { sinif: "izgara izgara--olcum" }, [
        olcum("Asset", v.simge, v.ad),
        olcum("Decimals", String(v.ondalik), null),
        olcum("Zincir", String(Object.keys(v.zincirler).length),
          Object.keys(v.zincirler).map(zincirEtiketi).join(", ")),
        olcum("Pools", String(v.havuz), "all fee tiers"),
        olcum("Convertible", tutarYaz(v.azamiTutar), "the largest amount measured")
      ]),
      v.caIle
        ? not("This asset is not from the suggested list — it was " +
          "chosen by contract address and passed the same check.", "bilgi")
        : null,
      el("a", {
        sinif: "dugme dugme--marka",
        attr: { href: "#/olustur?teminat=" + encodeURIComponent(Object.values(v.zincirler)[0].token) },
        yazi: "Create a token with this collateral"
      })
    ].filter(Boolean))));
    secim.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  kap.append(not(
    "Collateral is a token or a coin. They all work the same way — " +
    "none of them gets special treatment, meme coins included. The " +
    ONERILEN.length + " assets below are a SHORTCUT, not a gate: any " +
    "working token that is not listed can be chosen by its contract " +
    "address.",
    "bilgi"
  ));

  kap.append(secim);

  kap.append(panel("Kendi tokenini kullan", caAlani(secildi)));

  kap.append(panel(
    ONERILEN.length + " suggested",
    oneriTablosu(secildi),
    el("span", {
      sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: "measured " + String(TEMINAT_OLCUMU).slice(0, 10)
    }),
    true
  ));

  kap.append(not(
    "The order comes from measurement: each asset was put to Uniswap's " +
    "own quoter at four sizes ($20 / $200 / $2,000 / $20,000) to see " +
    "whether it genuinely converts, and ranked by the LARGEST size it " +
    "carried. " +
    DAGILIM.map((d) => d.adet + " at " + tutarYaz(d.tutar)).join(", ") +
    ". No proxy criteria like market cap or a liquidity floor were " +
    "used — the question asked is not a threshold but the job itself.",
    ""
  ));

  kap.append(not(
    "Why there is no single \"it works\": being able to read a price " +
    "does not mean you can trade in that pool. SHIB reads a 0.00% price " +
    "error and still pushes 17.5x on a $2,000 trade, because its " +
    "liquidity is in SHIB/WETH, not SHIB/USDC. The floor is derived " +
    "from the marginal price, so a conversion like that is refused — no " +
    "money is lost, the trade simply does not happen. The minimum " +
    "collateral is $20, but collateral grows with the tax on every " +
    "trade, which is why \"up to what size\" is written out in the list.",
    "uyari"
  ));

  return kap;
}
