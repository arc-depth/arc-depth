/* gorunum/projects.js — the product page for TurKaydi type 4 (see urun.js)
 *
 * 1 Nov 2026: an honest "Coming" note. A founder lock (vesting) for project
 * tokens is being built; until it exists the page says what works today.
 */
import { el, panel, not } from "../ui.js";
import { urunSayfasi } from "../urun.js";

function gelecekBolumu() {
  return panel("Coming: founder lock", el("div", { sinif: "yigin" }, [
    not("A founder lock (vesting) for project tokens is being built. It is not live yet, and no project token on this page is locked by it.", "uyari"),
    el("p", { yazi: "What works today: the token launches through the same gate as every other, with one pool on Arc whose liquidity is locked from the first block, a collateral basket holders can redeem their share of, and a fixed supply with no mint function. The founder's tokens from the first buy arrive in the founder's wallet unlocked, and the founder's address is public on chain, so anyone can follow what it holds." }),
    el("p", { yazi: "A team that wants to show commitment before the lock exists can say so in the token's public description and keep its tokens in a wallet it names there." }),
  ]));
}

export function ciz() {
  return urunSayfasi(4, { sonrasi: [gelecekBolumu()] });
}
