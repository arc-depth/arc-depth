/* gorunum/projects.js — the product page for TurKaydi type 4 (see urun.js)
 *
 * 1 Nov 2026: an honest "Coming" note while the founder lock was built. The
 * lock (KilitFabrikasi / KurucuKilidi, urun-kurucu.js) is offered above it
 * once veri/urun-kilit-dao.json names the deployed factory; until then the
 * lock panel says "Not deployed yet" and this note stays as it was.
 */
import { el, panel, not } from "../ui.js";
import { urunSayfasi } from "../urun.js";
import { kilitPaneli, sozlesmeler } from "../urun-kurucu.js";

function gelecekBolumu() {
  const durumNotu = el("div", {}, [not("A founder lock (vesting) for project tokens is being built. It is not live yet, and no project token on this page is locked by it.", "uyari")]);
  sozlesmeler().then((c) => {
    if (c.kilit) durumNotu.replaceChildren(not("The founder lock is live: choose it in \"Lock my founder share\" above before launching. A project token launched without it has its founder tokens in the founder's wallet, unlocked.", "bilgi"));
  }).catch(() => {});
  return panel("Founder lock", el("div", { sinif: "yigin" }, [
    durumNotu,
    el("p", { yazi: "What works today: the token launches through the same gate as every other, with one pool on Arc whose liquidity is locked from the first block, a collateral basket holders can redeem their share of, and a fixed supply with no mint function. The founder's tokens from the first buy arrive in the founder's wallet unlocked, and the founder's address is public on chain, so anyone can follow what it holds." }),
    el("p", { yazi: "A team that launched before choosing a lock can still show commitment: say so in the token's public description and keep its tokens in a wallet it names there." }),
  ]));
}

export function ciz({ cuzdan } = {}) {
  return urunSayfasi(4, { oncesi: [kilitPaneli({ cuzdan })], sonrasi: [gelecekBolumu()] });
}
