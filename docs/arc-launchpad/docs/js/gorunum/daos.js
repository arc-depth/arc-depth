/* gorunum/daos.js — the product page for TurKaydi type 5 (see urun.js)
 *
 * Token DAOs (TokenDAOFabrikasi / TokenDAO, urun-kurucu.js) are offered at
 * the top once veri/urun-kilit-dao.json names the deployed factory (it does,
 * since 1 Nov 2026). The note below says how a DAO token works.
 * #/daos?dao=0x… opens one DAO (deposits, proposals, votes, execution).
 */
import { el, panel, not } from "../ui.js";
import { urunSayfasi } from "../urun.js";
import { daoPaneli, daoSayfasi, sozlesmeler } from "../urun-kurucu.js";

function gelecekBolumu() {
  /* the factory address comes from veri/urun-kilit-dao.json; the note follows what is deployed */
  const durumNotu = el("div", {}, [el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Checking the Token DAO factory on Arc…" })]);
  sozlesmeler().then((c) => {
    durumNotu.replaceChildren(c.dao
      ? not("Token DAOs are live on Arc: create one in \"Create a DAO for my token\" above, before or after the launch. Its founder tokens and trading income then go to the token's own DAO treasury, spent only by holder vote.", "bilgi")
      : not("The Token DAO factory is not readable right now, so the panel above cannot create a DAO. Reload in a minute.", "uyari"));
  }).catch(() => {});
  return panel("How a DAO token works", el("div", { sinif: "yigin" }, [
    durumNotu,
    el("p", { yazi: "A DAO token launches with the same rules as every other: one pool on Arc, a redeemable collateral basket and the same fees. With a Token DAO, the founder's share goes to a treasury its holders control by vote." }),
    el("p", { yazi: "Without a Token DAO, the founder slot can still be any Arc address, including a wallet the group controls together; launching from code (see the AI agents page) lets you set it, and that address then receives the founder's 0.30% of every trade in USDC." }),
    el("p", {}, [el("span", { yazi: "The platform itself is governed the same way: ARCP stakers decide the platform's developer pool on the " }),
      el("a", { attr: { href: "#/dao" }, yazi: "Platform DAO" }), el("span", { yazi: " page." })]),
  ]));
}

export async function ciz({ param, cuzdan } = {}) {
  const dao = param && param.get("dao");
  if (dao) {
    const kap = el("div", { sinif: "yigin" }, [el("a", { sinif: "dugme dugme--sessiz dugme--kucuk", attr: { href: "#/daos" }, yazi: "All DAO tokens" })]);
    try { kap.append(await daoSayfasi({ dao, cuzdan })); } catch (x) { kap.append(panel("Token DAO", not("Could not read the DAO: " + ((x && x.message) || x), "uyari"))); }
    return kap;
  }
  return urunSayfasi(5, { oncesi: [daoPaneli({ cuzdan })], sonrasi: [gelecekBolumu()] });
}
