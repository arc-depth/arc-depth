/* gorunum/daos.js — the product page for TurKaydi type 5 (see urun.js)
 *
 * 1 Nov 2026: an honest "Coming" note. Per-token DAO contracts are being
 * built; until they exist the page says what works today.
 */
import { el, panel, not } from "../ui.js";
import { urunSayfasi } from "../urun.js";

function gelecekBolumu() {
  return panel("Coming: per-token DAOs", el("div", { sinif: "yigin" }, [
    not("Per-token DAO contracts (holder voting and a shared treasury for each token) are being built. They are not live yet: a DAO token on this page has no on-chain vote of its own today.", "uyari"),
    el("p", { yazi: "What works today: a DAO token launches with the same rules as every other (one pool on Arc, a redeemable collateral basket, the same fees), and its holders organise around it. The founder slot can be any Arc address, including a wallet the group controls together; launching from code (see the AI agents page) lets you set it, and that address then receives the founder's 0.30% of every trade in USDC." }),
    el("p", {}, [el("span", { yazi: "On-chain voting is already live for the platform itself: ARCP stakers govern the platform's funds on the " }),
      el("a", { attr: { href: "#/dao" }, yazi: "Platform DAO" }), el("span", { yazi: " page." })]),
  ]));
}

export function ciz() {
  return urunSayfasi(5, { sonrasi: [gelecekBolumu()] });
}
