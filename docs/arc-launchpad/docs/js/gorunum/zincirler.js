/* ===========================================================================
 * gorunum/zincirler.js — multi-chain collateral, as measured
 *
 * This module is marked live, and that needs explaining: nothing
 * cross-chain is BUILT. What is live is the measurement — which routes
 * exist out of Arc, which carry value, which carry only messages, and why
 * the collateral therefore stays on Arc.
 *
 * That is the opposite of the usual "multi-chain" page, and it is the only
 * version that is true. The brief's rule is explicit: a route that is not
 * supported must not be shown as though it works.
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum } from "../ui.js";
import { ikon } from "../ikon.js";
import { TEMINAT_EVRENI } from "../adresler.js";
import { besleyiciFiyat } from "../zincir.js";
import { para } from "../bicim.js";

/* Measured 2026-10-09 from Chainlink's CCIP directory API and by reading
   the contracts on Arc. Each row says what it carries, because "there is a
   lane" and "the lane moves your money" are different claims. */
const CCIP_HATLAR = [
  { ad: "Ethereum", tasir: "LINK, syrupUSDC" },
  { ad: "Base", tasir: "VIRTUAL" },
  { ad: "Polygon", tasir: "messages only" },
  { ad: "Solana", tasir: "PST" },
  { ad: "0G", tasir: "messages only" },
  { ad: "Tempo", tasir: "messages only" }
];

const CCTP_DOMAINLER = [
  "Ethereum", "Avalanche", "OP", "Arbitrum", "Solana", "Base", "Polygon",
  "Sui", "Aptos", "Unichain", "Linea", "Codex", "Sonic", "World", "Sei",
  "XDC", "Ink", "Plume"
];

/* Measured from Circle's fee service, 2026-10-10. `minimumFee` is in
   basis points: 0.325 bps is 0.00325%. Outbound from Arc is free in both
   finality modes, which is unusual and worth showing rather than
   rounding away. */
const HIZ = [
  { yol: "Base → Arc", hizli: "0.325 bps", standart: "free" },
  { yol: "Ethereum → Arc", hizli: "0.25 bps", standart: "free" },
  { yol: "Solana → Arc", hizli: "0.25 bps", standart: "free" },
  { yol: "Polygon → Arc", hizli: "free", standart: "free" },
  { yol: "Arc → Base", hizli: "free", standart: "free" },
  { yol: "Arc → Ethereum", hizli: "free", standart: "free" }
];

function hizTablosu() {
  const t = el("table", { sinif: "tablo tablo--kart" });
  t.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Yol" }),
    el("th", { yazi: "Fast (~seconds)" }),
    el("th", { yazi: "Standart" })
  ])]));
  const g = el("tbody");
  for (const h of HIZ) {
    g.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Yol" }, yazi: h.yol }),
      el("td", { sinif: "sayi", attr: { "data-et": "Fast" }, yazi: h.hizli }),
      el("td", { sinif: "sayi", attr: { "data-et": "Standart" }, yazi: h.standart })
    ]));
  }
  t.append(g);
  return t;
}

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Cross-chain collateral",
    "Which routes are genuinely open, and which are not"));

  kap.append(not(
    "Collateral can COME IN from 25 chains and that works today. There " +
    "is no way OUT and there will not be: all four ways an asset leaves " +
    "the vault pay msg.sender, and none of them takes a destination. " +
    "Sending collateral to another chain would need a function where the " +
    "caller names the destination, and whatever that function is called, " +
    "it is a withdraw. On top of that CCTP burns at the source and mints " +
    "at the target, so the vault's balance would be short in between — " +
    "Fast Transfer shrinks that window to seconds but not to zero, and " +
    "the claim has to be whole at every moment.",
    "uyari"
  ));

  /* ---- what can be collateral, with live prices -------------------- */
  const fiyatlar = await Promise.all(TEMINAT_EVRENI.map((t) => besleyiciFiyat(t.besleyici, 8)));
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Asset" }), el("th", { yazi: "Price" }),
    el("th", { yazi: "Decimals" }), el("th", { yazi: "Feed" })
  ])]));
  const govde = el("tbody");
  for (let i = 0; i < TEMINAT_EVRENI.length; i++) {
    const t = TEMINAT_EVRENI[i], f = fiyatlar[i];
    govde.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Asset" } }, [
        el("strong", { yazi: t.sembol }),
        el("div", { sinif: "ucuncul", yazi: t.ad })
      ]),
      el("td", { sinif: "sayi", attr: { "data-et": "Fiyat" },
        yazi: f ? para(f.fiyat, { kisalt: f.fiyat > 1000 }) : "unreadable" }),
      el("td", { sinif: "sayi", attr: { "data-et": "Decimals" }, yazi: String(t.ondalik) }),
      el("td", { attr: { "data-et": "Besleyici" } },
        [el("span", { sinif: "mono ucuncul", yazi: t.besleyiciAdi })])
    ]));
  }
  tablo.append(govde);
  kap.append(panel([
    el("span", { html: ikon("kalkan", "yol-oge__ikon") }),
    el("span", { yazi: "Assets that can back a token" })
  ], el("div", { sinif: "tablo-sarmal" }, [tablo])));

  kap.append(panel("Proof of reserve", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "Whether a wrapped collateral asset is actually backed is a " +
        "separate question. cirBTC has a Chainlink Proof-of-Reserve feed " +
        "on Arc and it was measured: 6,170.82 BTC in reserve against a " +
        "5,297.68 cirBTC supply — 16.48% over-collateralised, so no gap." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Of the five collateral assets only cirBTC has such a feed. It " +
        "was not made a requirement in the contract: a rule written for " +
        "one asset would break the design where every collateral asset " +
        "runs by the same rules. It stands here as information." })
    ])
  ]));

  kap.append(not(
    "DOGE, XLM, HBAR, ADA and DOT are not priced on Arc — no Chainlink " +
    "feed, so they cannot be collateral. Assets that have a price but no " +
    "verified token on Arc are not listed either: a price is not an asset.",
    "bilgi"
  ));

  /* ---- the routes --------------------------------------------------- */
  const izgara = el("div", { sinif: "izgara izgara--olcum" });
  izgara.append(olcum("CCIP lanes", String(CCIP_HATLAR.length), "out of Arc, both directions"));
  izgara.append(olcum("CCIP + USDC", "none", "no lane carries USDC"));
  izgara.append(olcum("CCTP domain", "26", "Arc's own domain id"));
  izgara.append(olcum("CCTP links", "~" + CCTP_DOMAINLER.length, "native USDC burn and mint"));
  kap.append(izgara);

  const hatlar = el("div", { sinif: "yigin yigin--sik" });
  for (const h of CCIP_HATLAR) {
    const mesajMi = h.tasir === "messages only";
    hatlar.append(el("div", { sinif: "satir satir--arasi" }, [
      el("strong", { yazi: "Arc ↔ " + h.ad }),
      el("span", { sinif: "etiket " + (mesajMi ? "" : "etiket--bilgi"), yazi: h.tasir })
    ]));
  }
  kap.append(panel("CCIP — a message lane, not a value lane", [
    hatlar,
    el("div", { sinif: "ikincil", attr: { style: "margin-top:12px" }, yazi:
      "Router 0xB797…3A18, 10,761 bytes of code on chain. The fee can " +
      "be paid in LINK or in USDC. But the token list each lane carries " +
      "was measured and USDC is on none of them — so CCIP cannot carry " +
      "collateral in this project." })
  ]));

  kap.append(panel("CCTP v2 — the only real path for USDC", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "TokenMessengerV2, MessageTransmitterV2 and TokenMinterV2 are " +
        "deployed on Arc and localDomain() answers 26. Circle's own burn " +
        "and mint path — no third-party bridge risk." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Arc's token-pairing events were scanned: CCTP can mint exactly " +
        "ONE token here, USDC, from 25 separate chains. No other asset is " +
        "paired. Circle has a \"CCTP for non-USDC\" product but it needs " +
        "the issuer to grant mint authority, and it is not set up on Arc." })
    ]),
    el("div", { sinif: "satir", attr: { style: "margin-top:12px" } },
      CCTP_DOMAINLER.map((d) => el("span", { sinif: "etiket", yazi: d }))),
    el("div", { sinif: "tablo-sarmal", attr: { style: "margin-top:16px" } }, [hizTablosu()])
  ]));

  /* The finding the whole design rests on, and the one that reverses the
     usual conclusion: inflow is already live. */
  kap.append(panel("Collateral COMING IN across chains — working today", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "A CCTP mint calls nothing — it mints the money straight to the " +
        "recipient. And the vault does not track deposits, it counts its " +
        "BALANCE. Put together: USDC sent to a vault's address from any " +
        "of 25 chains is added to that token's floor with zero new code." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Measured: $250 sent without besle() ever being called raised " +
        "the vault's balance, the claim per token and the basket value by " +
        "exactly $250. There is no new trust assumption either, because " +
        "on this path the vault sends nobody anything." })
    ]),
    el("div", { sinif: "not not--uyari", attr: { style: "margin-top:12px" }, yazi:
      "This holds only for an asset that is IN that vault's basket. An " +
      "asset outside the basket that is sent to the vault is not " +
      "distributed by a redemption and is not counted in the basket " +
      "value — it stays there and cannot be taken out." })
  ]));

  kap.append(panel("Arc ↔ Robinhood Chain", [
    el("div", { sinif: "ikincil", yazi:
      "Both are on CCIP (Arc 5042, RHC 4663) but there is no direct " +
      "lane between them. All four legs through Ethereum and all four " +
      "through Base were measured as configured, so a trustless " +
      "two-hop message path exists today." }),
    el("div", { sinif: "not", attr: { style: "margin-top:12px" }, yazi:
      "Not built. A route we have not run is not shown as working." })
  ]));

  return kap;
}
