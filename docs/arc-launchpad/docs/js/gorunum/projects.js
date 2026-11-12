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
  /* the lock factory address comes from veri/urun-kilit-dao.json; the note follows what is deployed */
  const durumNotu = el("div", {}, [el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Checking the founder lock factory on Arc…" })]);
  sozlesmeler().then((c) => {
    durumNotu.replaceChildren(c.kilit
      ? not("The founder lock is live on Arc: choose it in \"Lock my founder share\" above before launching, and your founder tokens and trading income vest in a lock contract instead of arriving in your wallet.", "bilgi")
      : not("The founder lock factory is not readable right now, so the panel above cannot create a lock. Reload in a minute.", "uyari"));
  }).catch(() => {});
  return panel("Founder lock", el("div", { sinif: "yigin" }, [
    durumNotu,
    el("p", { yazi: "Every project token launches through the same gate as every other: one pool on Arc whose liquidity is locked from the first block, a collateral basket holders can redeem their share of, and a fixed supply with no mint function." }),
    el("p", { yazi: "A token launched without the lock has its founder tokens from the first buy in the founder's wallet, unlocked; the founder's address is public on chain, so anyone can follow what it holds. A team that launched before choosing a lock can still show commitment: say so in the token's public description and keep its tokens in a wallet it names there." }),
  ]));
}

export function ciz({ cuzdan } = {}) {
  return urunSayfasi(4, { oncesi: [kilitPaneli({ cuzdan })], sonrasi: [gelecekBolumu()] });
}
