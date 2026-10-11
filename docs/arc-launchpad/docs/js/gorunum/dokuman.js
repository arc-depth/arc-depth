/* ===========================================================================
 * gorunum/dokuman.js — how the system works, with the measured numbers
 *
 * Every figure is read from adresler.js, which mirrors the contracts'
 * constants — so a documentation page cannot quote a fee the contract does
 * not charge. The prose explains the mechanism; the tables carry the
 * numbers; nothing here is aspirational.
 *
 * THIS PAGE DOCUMENTED A PRODUCT THAT NO LONGER EXISTS
 *   It described a bonding curve, a virtual reserve tuned to match the
 *   pool's price, an anti-snipe that applied "when buying from the curve",
 *   and a section headed "when the curve fills ($6,000)" about graduating
 *   into a second market.
 *
 *   The second generation has none of that. There is no curve, no
 *   graduation and no second venue: a launch opens one Uniswap v4 pool at
 *   a fixed price and every trade happens there. The only places the word
 *   "egri" still appears in the live contracts are comments explaining a
 *   legacy parameter name.
 *
 *   Translating that text into English would have produced a
 *   better-presented false document, which is worse than a rough true
 *   one. So the page was rewritten against what is deployed.
 *
 * WHAT THE REWRITE DROPPED AND WHY
 *   - the curve, the virtual reserve and the arbitrage note: no curve
 *   - graduation at $6.000: nothing graduates
 *   - "seven targets" in the fee table: the live hook has five
 *   - the launch breakdown that split a single payment: the rule now has
 *     TWO amounts, a capped founder buy and a separate collateral deposit
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum } from "../ui.js";
import { EKONOMI, PULSE_KURAL, TEMINAT_EVRENI } from "../adresler.js";
import { para, ppmYuzde, bloktanSure } from "../bicim.js";

const D = EKONOMI.dilimler;

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Documentation", "Exactly what the system does"));

  /* ---- 1. launch ---------------------------------------------------- */
  /* The founder's buy and the collateral are separate numbers. The buy is
     capped, becomes tokens at the opening price, and its net funds the
     pool's bid; the collateral has no ceiling and belongs to the holders. */
  const ucret = PULSE_KURAL.asgariAlim * PULSE_KURAL.launchUcretPpm / 1e6;
  const net = PULSE_KURAL.asgariAlim - ucret;
  const kurucuToken = Math.round(net * PULSE_KURAL.arz / PULSE_KURAL.acilisMcap);

  kap.append(panel("1 — Launching: the two amounts", [
    tablo(["Where it goes", "At the minimum buy"], [
      ["Founder's buy", para(PULSE_KURAL.asgariAlim) +
        " – " + para(PULSE_KURAL.azamiAlim)],
      ["— protocol fee (" + ppmYuzde(PULSE_KURAL.launchUcretPpm) + ")",
        "−" + para(ucret)],
      ["— becomes tokens for the founder", para(net)],
      ["— and the same amount becomes the pool's bid", para(net)],
      ["Collateral vault", "at least " + para(PULSE_KURAL.asgariTeminat)]
    ]),
    el("div", { sinif: "izgara izgara--olcum", attr: { style: "margin-top:16px" } }, [
      olcum("Supply", (PULSE_KURAL.arz / 1e9) + " billion", "fixed"),
      olcum("Opening market cap", para(PULSE_KURAL.acilisMcap), "the same every launch"),
      olcum("Founder's tokens", kurucuToken.toLocaleString("en"),
        "bought at the opening price"),
      olcum("Free tokens", "0", "none, ever")
    ]),
    el("div", { sinif: "ikincil", attr: { style: "margin-top:16px" }, yazi:
      "One market, not two. A launch opens a single Uniswap v4 pool at a " +
      "fixed opening price and every trade happens there — there is no " +
      "bonding curve to arbitrage against and nothing to graduate into. " +
      "Paying more does not buy a higher price; it buys a deeper bid." }),
    not("Anti-snipe: a buy in the pool's opening second pays " +
        ppmYuzde(PULSE_KURAL.snipeBasPpm) + ", and the rate quarters every " +
        "second until it reaches zero after " + PULSE_KURAL.snipeSuresi +
        ". It applies to BUYS only, and never to the founder's own first " +
        "buy — which is not a swap at all, so there is nothing to exempt.",
        "uyari")
  ]));

  /* ---- 2. trading fees ---------------------------------------------- */
  kap.append(panel("2 — Who gets what on every trade", [
    tablo(["Target", "Share"], [
      ["the token's founder", ppmYuzde(D.kurucu)],
      /* The "token holders (stake)" row is GONE: the live hook has no such
         slice. Leaving the row at zero would have been wrong too — the
         slice does not exist, it is not zero. */
      ["developer pool (the DAO)", ppmYuzde(D.gelistirici)],
      ["protocol liquidity", ppmYuzde(D.likidite)],
      ["operations", ppmYuzde(D.isletme)],
      ["collateral vault", ppmYuzde(EKONOMI.vergiAsgariPpm) + " – " +
        ppmYuzde(EKONOMI.vergiAzamiPpm)],
      ["pool depth", ppmYuzde(D.derinlik)]
    ]),
    el("div", { sinif: "ikincil", attr: { style: "margin-top:12px" }, yazi:
      "Two percent in total, plus the tax the founder chose once and can " +
      "never change. The five slices above are constants in the hook and " +
      "the depth share is what is left after the other four, so it cannot " +
      "drift. On a buy, the whole fee on the token side goes to depth: " +
      "nobody is paid in something they would have to sell." }),
    not("FTHM stakers do NOT take a cut of trades. Staking earns the " +
        "stake contract's own FTHM emission; that is a different thing " +
        "and only one of the two exists here.", "bilgi")
  ]));

  /* ---- 3. the floor -------------------------------------------------- */
  kap.append(panel("3 — How the floor works", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "Claim per token = vault balance ÷ circulating supply. A ratio, " +
        "not a price — no oracle, nothing to manipulate." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "A buyback is only possible while the market price is below the " +
        "claim; above it the contract refuses by itself. There is no " +
        "separate sell-pressure detector: the invariant is the trigger. " +
        "The caller keeps " + ppmYuzde(EKONOMI.odulPayiBps * 100) +
        " of the discount captured, and the rest is written into " +
        "everyone's claim." })
    ]),
    el("div", { sinif: "izgara izgara--olcum", attr: { style: "margin-top:16px" } }, [
      olcum("Per call", EKONOMI.islemTavaniBps / 100 + "%", "spendable in one call"),
      olcum("Per window", EKONOMI.donemTavaniBps / 100 + "%", "total out, spend plus reward"),
      olcum("Window", bloktanSure(EKONOMI.donemBlok), EKONOMI.donemBlok + " blocks"),
      olcum("Caller's share", EKONOMI.odulPayiBps / 100 + "%", "of the discount captured")
    ]),
    not("Measured: with nothing added to the reserve and only the price " +
        "pushed down, the buyback triggered at −94.9%. By then the sell " +
        "tax had taken the reserve from $20.00 to $23.60 — the pressure " +
        "feeds the floor.")
  ]));

  /* ---- 4. whale shield ----------------------------------------------- */
  kap.append(panel("4 — Whale shield", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "It rides on sells only, per pool and cumulative per block. The " +
        "threshold is " + ppmYuzde(EKONOMI.kalkanEsikPpm) + " of the " +
        "circulating supply; above it the extra rate equals the amount " +
        "that went over, capped at " + ppmYuzde(EKONOMI.kalkanTavanPpm) +
        " — and all of it goes to the vault." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Splitting a sale into eight pieces inside one transaction was " +
        "measured: every piece was under the threshold on its own and the " +
        "rate still climbed from 1.03% to 3.08%. Splitting does not help." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "What cannot be done: forcing order splitting is impossible. The " +
        "pool is permissionless, anyone can route through any contract " +
        "and any number of addresses, and Uniswap v4 does not tell a hook " +
        "that ten swaps came from one person. The shield does not forbid " +
        "size, it prices it. Splitting across blocks still works, and " +
        "that is deliberate: leaving is free, leaving instantly is not." })
    ])
  ]));

  /* ---- 5. collateral ------------------------------------------------- */
  kap.append(panel("5 — What can back a token", [
    el("div", { sinif: "ikincil", attr: { style: "margin-bottom:16px" }, yazi:
      "These are suggestions, not a gate. Any contract address can be " +
      "pasted instead, and both paths go through the same check: the " +
      "asset has to be tradable on Arc and the route has to cost less " +
      "than the ceiling. Nothing here needs our approval." }),
    tablo(["Asset", "Decimals", "Feed"],
      TEMINAT_EVRENI.map((t) => [t.sembol + " — " + t.ad, String(t.ondalik),
        t.besleyiciAdi])),
    not("The feeds are PROXY addresses. The aggregator underneath a proxy " +
        "can be replaced, and an oracle pinned to one keeps reading a " +
        "stale price without erroring — valuing the reserve at last " +
        "month's rate while every test stays green.", "uyari")
  ]));

  return kap;
}

function tablo(basliklar, satirlar) {
  const t = el("table", { sinif: "tablo tablo--kart" });
  t.append(el("thead", {}, [el("tr", {}, basliklar.map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  for (const s of satirlar) {
    g.append(el("tr", {}, s.map((h, i) => el("td", {
      sinif: i > 0 ? "sayi" : "",
      attr: { "data-et": basliklar[i] },
      yazi: h
    }))));
  }
  t.append(g);
  return el("div", { sinif: "tablo-sarmal" }, [t]);
}
