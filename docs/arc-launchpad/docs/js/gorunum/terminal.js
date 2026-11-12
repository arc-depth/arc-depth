/* ===========================================================================
 * gorunum/terminal.js — Trade (#/terminal)
 *
 * Every launch made from ARC PULSE in one place (12 Nov 2026): on top, one chip per launch, through Warp onto
 * another launchpad or on our own launchpad (Arc, Sui, Aptos); below, the picked token's trading view: its card,
 * live market facts, its chart and a way to trade it (gorunum/warp-token.js tokenDetay). ?t=<token> picks one;
 * without it the newest launch opens. The launch list is the one All launches shows (launchlar.js tumLaunchlar).
 * #/terminal?ag=&t= (a token on a named chain) still opens the chain-aware view in terminal-ag.js.
 * =========================================================================== */
import { el, sayfaUst, bos, not } from "../ui.js";

export async function ciz({ param } = {}) {
  if (param && param.get("ag")) return (await import("./terminal-ag.js")).ciz({ param });
  const [{ tumLaunchlar }, { launchCipleri, tokenDetay }] = await Promise.all([import("./launchlar.js"), import("./warp-token.js")]);
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Trade", "Every token launched from ARC PULSE, through Warp or on our own launchpad: pick one for its chart and trade it"));
  const { satirlar, hatalar } = await tumLaunchlar();
  if (hatalar.length) kap.append(not("Could not read every launch source right now (" + hatalar.join(", ") + "); the rest is shown.", "uyari"));
  if (!satirlar.length) {
    kap.append(bos("No launches yet", "The first token launched from ARC PULSE appears here with its chart.", el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur" }, yazi: "Create a token" })));
    return kap;
  }
  const istenen = decodeURIComponent((param && param.get("t")) || "").trim().toLowerCase();
  const secili = (istenen && satirlar.find((s) => String(s.token).toLowerCase() === istenen)) || satirlar[0];
  kap.append(el("div", { sinif: "satir", attr: { style: "justify-content:space-between;gap:10px;flex-wrap:wrap" } }, [
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: satirlar.length + " launches · tap one to switch" }),
    el("a", { sinif: "dugme dugme--sade dugme--kucuk", attr: { href: "#/launches" }, yazi: "All launches as a list →" })]));
  kap.append(launchCipleri(satirlar, secili.token));
  if (istenen && String(secili.token).toLowerCase() !== istenen) kap.append(not("That token is not one of ARC PULSE's launches; showing the newest instead. Any other token is in Market.", "uyari"));
  kap.append(tokenDetay(secili));
  return kap;
}
