/* gorunum/daos.js — the product page for TurKaydi type 5 (see urun.js)
 *
 * 1 Nov 2026: an honest "Coming" note while per-token DAOs were built. Token
 * DAOs (TokenDAOFabrikasi / TokenDAO, urun-kurucu.js) are offered above it
 * once veri/urun-kilit-dao.json names the deployed factory; until then the
 * DAO panels say "Not deployed yet" and this note stays as it was.
 * #/daos?dao=0x… opens one DAO (deposits, proposals, votes, execution).
 */
import { el, panel, not } from "../ui.js";
import { urunSayfasi } from "../urun.js";
import { daoPaneli, daoSayfasi, sozlesmeler } from "../urun-kurucu.js";

function gelecekBolumu() {
  const durumNotu = el("div", {}, [not("Per-token DAO contracts (holder voting and a shared treasury for each token) are being built. They are not live yet: a DAO token on this page has no on-chain vote of its own today.", "uyari")]);
  sozlesmeler().then((c) => {
    if (c.dao) durumNotu.replaceChildren(not("Token DAOs are live: create one in \"Create a DAO for my token\" above, before or after the launch.", "bilgi"));
  }).catch(() => {});
  return panel("Coming: per-token DAOs", el("div", { sinif: "yigin" }, [
    durumNotu,
    el("p", { yazi: "What works today: a DAO token launches with the same rules as every other (one pool on Arc, a redeemable collateral basket, the same fees), and its holders organise around it. The founder slot can be any Arc address, including a wallet the group controls together; launching from code (see the AI agents page) lets you set it, and that address then receives the founder's 0.30% of every trade in USDC." }),
    el("p", {}, [el("span", { yazi: "On-chain voting is already live for the platform itself: ARCP stakers govern the platform's funds on the " }),
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
