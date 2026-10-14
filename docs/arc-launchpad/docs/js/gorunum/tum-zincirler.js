/* ===========================================================================
 * gorunum/tum-zincirler.js — every local-collateral launch, on every chain,
 *                            as one table
 *
 * Shared by Discover, Vaults and Portfolio. One batched read per chain:
 * the launchpad's records (ag-okur.js), then each vault's two holdings and,
 * when a wallet is given, the wallet's balance of each token. Rows link to
 * the chain-aware terminal (#/terminal?ag=&t=), where the token is traded
 * and redeemed on its own chain.
 *
 * A chain that does not answer is named under the table — a shorter list
 * is never presented as the whole list.
 * =========================================================================== */
import { el, panel, bos, not } from "../ui.js";
import { tumLaunchlar, agBul, cokluOku, ABI3, launchAglari } from "../ag-okur.js";
import { formatUnits } from "../../vendor/ethers.min.js";

const say = (x, o) => Number(x).toLocaleString("en-US", { maximumFractionDigits: o });

/**
 * @param baslik  panel title
 * @param hesap   wallet address, or null; with an address only the tokens
 *                the wallet holds are listed, with the amount
 */
export async function zincirLaunchPaneli(baslik, hesap = null) {
  let sonuc;
  try { sonuc = await tumLaunchlar(); }
  catch (e) { return panel(baslik, bos("Could not read the chains", e.message)); }
  const { liste, hatalar } = sonuc;

  /* the per-launch reads, grouped by chain so each chain is one request */
  const gruplar = {};
  for (const l of liste) (gruplar[l.ag] = gruplar[l.ag] || []).push(l);
  await Promise.all(Object.entries(gruplar).map(async ([a, ls]) => {
    const ag = agBul(a);
    const c = await cokluOku(ag, ls.flatMap((l) => [
      [l.kasa, ABI3.kasa, "bakiye", [ag.quote]],
      [l.kasa, ABI3.kasa, "bakiye", [l.hedefVarlik]],
      hesap ? [l.token, ABI3.erc20, "balanceOf", [hesap]] : [l.kasa, ABI3.kasa, "dolasim"]
    ])).catch(() => []);
    ls.forEach((l, i) => { l._dolar = c[i * 3]; l._teminat = c[i * 3 + 1]; l._ucuncu = c[i * 3 + 2]; });
  }));

  const satirlar = hesap ? liste.filter((l) => l._ucuncu != null && l._ucuncu > 0n) : liste;
  const ek = hatalar.length ? not("Not answering right now: " + hatalar.join(", ") + ". Their launches are missing from this list.", "uyari") : null;
  if (!satirlar.length) {
    return panel(baslik, el("div", { sinif: "yigin" }, [
      bos(hesap ? "No launch tokens in this wallet" : "No launches yet",
        hesap ? "No local-collateral launch token on " + launchAglari().map((a) => a.ad).join(", ") + " is held by this address."
          : "The launchpad is live on " + launchAglari().map((a) => a.ad).join(", ") + "; nothing has been launched on it yet."),
      ek
    ]));
  }

  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Token" }), el("th", { yazi: "Chain" }),
    el("th", { yazi: "Vault dollars" }), el("th", { yazi: "Vault collateral" }),
    el("th", { yazi: hesap ? "You hold" : "Circulating" }), el("th", { yazi: "" })
  ])]));
  const govde = el("tbody");
  for (const l of satirlar) {
    const ag = agBul(l.ag);
    const ayni = l.hedefVarlik.toLowerCase() === ag.quote.toLowerCase();
    const link = "#/terminal?ag=" + l.ag + "&t=" + l.token;
    govde.append(el("tr", {}, [
      el("td", { attr: { "data-etiket": "Token" } }, [el("a", { attr: { href: link } }, [
        el("strong", { yazi: l.sembol }), el("span", { sinif: "ucuncul", yazi: " " + l.ad })])]),
      el("td", { attr: { "data-etiket": "Chain" }, yazi: ag.ad }),
      el("td", { sinif: "mono", attr: { "data-etiket": "Vault dollars" },
        yazi: l._dolar == null ? "—" : "$" + say(formatUnits(l._dolar, 6), 2) }),
      el("td", { sinif: "mono", attr: { "data-etiket": "Vault collateral" },
        yazi: ayni ? "dollars" : l._teminat == null ? "—" : say(formatUnits(l._teminat, l.teminatOndalik), 6) + " " + l.teminatSembol }),
      el("td", { sinif: "mono", attr: { "data-etiket": hesap ? "You hold" : "Circulating" },
        yazi: l._ucuncu == null ? "—" : say(formatUnits(l._ucuncu, 18), 0) }),
      el("td", {}, [el("a", { sinif: "dugme dugme--kucuk", attr: { href: link }, yazi: hesap ? "Trade / redeem" : "Trade" })])
    ]));
  }
  tablo.append(govde);
  return panel(baslik, el("div", { sinif: "yigin" }, [tablo, ek]));
}
