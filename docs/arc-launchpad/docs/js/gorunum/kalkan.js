/* ===========================================================================
 * gorunum/kalkan.js — the whale shield, and what it can and cannot do
 *
 * The honest part matters more than the numbers: mandatory order splitting
 * is impossible on a permissionless pool, so the shield prices size rather
 * than forbidding it. A page that implies otherwise would be selling a
 * protection that does not exist.
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum, bos } from "../ui.js";
import { ikon } from "../ikon.js";
import { EKONOMI, PULSE, canli } from "../adresler.js";
import { ppmYuzde } from "../bicim.js";
import { oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";

/* Measured: eight slices in one transaction, each individually under the
   threshold, and the rate climbed anyway. */
const OLCUM = [
  { dilim: 1, birikmis: 0.303, oran: 1.030 },
  { dilim: 2, birikmis: 0.606, oran: 1.141 },
  { dilim: 3, birikmis: 0.910, oran: 1.459 },
  { dilim: 4, birikmis: 1.213, oran: 1.778 },
  { dilim: 5, birikmis: 1.516, oran: 2.100 },
  { dilim: 6, birikmis: 1.819, oran: 2.423 },
  { dilim: 7, birikmis: 2.122, oran: 2.749 },
  { dilim: 8, birikmis: 2.426, oran: 3.077 }
];

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Whale shield", "What a large sell costs, written into the floor"));

  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Threshold", ppmYuzde(EKONOMI.kalkanEsikPpm), "share of circulating, per block"),
    olcum("Extra rate cap", ppmYuzde(EKONOMI.kalkanTavanPpm), "at most"),
    olcum("Where it goes", "the collateral vault", "no share to the protocol"),
    olcum("Direction", "sells only", "buys are exempt")
  ]));

  kap.append(panel("How it works", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi:
        "The amount sold is measured as a percentage of circulating supply " +
        "and accumulates per pool, per block. Below the threshold the " +
        "shield is invisible; above it the extra rate equals the amount " +
        "that went over, and stops at the cap." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "The measure is circulating supply, not pool depth. Depth is a " +
        "number an attacker can inflate by adding liquidity in the same " +
        "block — a shield keyed to it could be switched off by the very " +
        "size it is meant to catch." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi:
        "Buys are exempt because a buy raises the price and puts money into " +
        "the pool; it does not threaten the floor. Taxing buys as well " +
        "caught the buyback that defends the floor at the cap, and sent " +
        "the money to depth instead of to the floor." })
    ])
  ]));

  /* ---- the split-trade measurement ---------------------------------- */
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Dilim" }),
    el("th", { yazi: "Cumulative size" }),
    el("th", { yazi: "Rate paid" })
  ])]));
  const govde = el("tbody");
  for (const o of OLCUM) {
    govde.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Dilim" }, yazi: String(o.dilim) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Cumulative size" },
        yazi: o.birikmis.toFixed(3) + "%" }),
      el("td", { sinif: "sayi", attr: { "data-et": "Rate paid" },
        yazi: o.oran.toFixed(3) + "%" })
    ]));
  }
  tablo.append(govde);

  kap.append(panel([
    el("span", { html: ikon("kalkan-artis", "yol-oge__ikon") }),
    el("span", { yazi: "The splitting attack was tried" })
  ], [
    el("div", { sinif: "ikincil", attr: { style: "margin-bottom:12px" }, yazi:
      "Eight sells inside one transaction, each one below the threshold " +
      "on its own. A per-transaction threshold would have caught none of " +
      "them." }),
    el("div", { sinif: "tablo-sarmal" }, [tablo]),
    el("div", { sinif: "ikincil", attr: { style: "margin-top:12px" }, yazi:
      "The rate climbed from 1.03% to 3.08% and never fell back. The " +
      "window really does accumulate." })
  ]));

  kap.append(not(
    "What cannot be done: forcing order splitting is impossible. The " +
    "pool is permissionless — anyone can route through any contract and " +
    "any number of addresses, and Uniswap v4 does not tell a hook that " +
    "ten swaps came from one person. A hard per-transaction cap is not a " +
    "cap, it is a loop. The shield does not forbid size, it prices it. " +
    "Splitting across blocks still works, and that is deliberate: " +
    "leaving is free, leaving instantly is not.",
    "uyari"
  ));

  /* ---- live window state --------------------------------------------
   *
   * THIS PANEL DISAPPEARED THE DAY THE HOOK WENT LIVE
   *   It had one branch — "the hook is not on chain" — and nothing else.
   *   So once PULSE.hook became a real address the condition went false
   *   and the section rendered NOTHING: a screen that had promised a
   *   live window silently stopped having one, and no audit noticed
   *   because the page still passed every check it had.
   *
   *   A "not deployed yet" placeholder is honest while it is true and
   *   becomes a hole the moment it stops being true.
   *
   * WHAT IS ACTUALLY READABLE
   *   The shield's numbers are constants on the hook, so they can be
   *   read and shown as the deployed contract's own values rather than
   *   copies. The per-pool window needs a pool, and `pencere()` is keyed
   *   by PoolId — so with no launches yet there is genuinely no window
   *   to read, and that is stated instead of being left blank. */
  {
    const govde = el("div", { sinif: "yigin yigin--sik" });

    if (!canli(PULSE.hook)) {
      govde.append(bos(
        "The hook is not on chain",
        "The shield's current window is read from the hook. With no hook " +
        "deployed there is no window to read."
      ));
    } else {
      const adlar = ["KALKAN_ESIK_PPM", "KALKAN_TAVAN_PPM",
        "SNIPE_PPM", "SNIPE_SURESI"];
      const ham = await cokluCagri(adlar.map((ad) => ({
        method: "eth_call",
        params: [{ to: PULSE.hook, data: cagriVerisi(ABI.kanca, ad) }, "latest"]
      })));
      /* sonucCoz hands back the whole decode Result; a one-value Result
         is not a number, so Number() on it is NaN. Unwrapped here —
         zincir.js exports no single-value helper and inventing an import
         for one is how a module stops resolving. */
      const v = {};
      adlar.forEach((ad, i) => {
        const c = ham[i] == null ? null : sonucCoz(ABI.kanca, ad, ham[i]);
        v[ad] = c && c.length === 1 ? c[0] : c;
      });

      const okunamayan = adlar.filter((ad) => v[ad] == null);
      if (okunamayan.length) {
        /* Not silently blank, and not a fabricated number either. */
        govde.append(not(
          "The hook's shield constants could not be read (" +
          okunamayan.join(", ") + "). The screen is not showing an " +
          "invented value here.", "uyari"));
      } else {
        const pct = (x) => (Number(x) / 10_000).toFixed(2) + "%";
        govde.append(el("div", { sinif: "izgara izgara--olcum" }, [
          olcum("Shield threshold", pct(v.KALKAN_ESIK_PPM),
            "sells below this rate do not enter the shield"),
          olcum("Shield cap", pct(v.KALKAN_TAVAN_PPM),
            "the most that can be taken"),
          olcum("Snipe rate", pct(v.SNIPE_PPM),
            "at the opening, quartering every block"),
          olcum("Snipe window", String(Number(v.SNIPE_SURESI)) + " blocks",
            "after which it is zero")
        ]));
        govde.append(not(
          "These four numbers are not copies kept on the page — they were " +
          "kancadan, " + PULSE.hook + " adresinden okundu.", "bilgi"));
      }

      /* The per-pool window needs a pool. */
      const sayi = await oku(PULSE.launchpad, ABI.launchpad, "launchCount");
      if (sayi == null) {
        govde.append(not(
          "The launch count could not be read, so which pool's window to " +
          "read is unknown too.", "uyari"));
      } else if (Number(sayi) === 0) {
        govde.append(not(
          "There are no launches yet, so there is no pool window to read. " +
          "The window is kept per pool id (pencere(poolId)); printing an " +
          "empty table without a pool would be showing a state that does " +
          "not exist.", "bilgi"));
      } else {
        govde.append(not(
          Number(sayi) + " launches. The window is kept separately for each " +
          "pool and is read from that token's own page.", "bilgi"));
      }
    }

    kap.append(panel("Live window", govde));
  }

  return kap;
}
