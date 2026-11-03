/* ===========================================================================
 * designs/js/yayinla.js — Publish and License, wrapped from the main app
 *
 * The publish flow (fingerprints, encryption in the browser, Irys paid from
 * Arc USDC, the two-step commit-reveal on TasarimNFT2) lives in the main
 * app's docs/js/gorunum/designs.js and is not duplicated: its own router
 * `ciz` renders the page and this site shows it. Its links (#/designs/…)
 * are understood by this site's router; its in-page tab bar is hidden by
 * app.css because this site has its own navigation.
 * =========================================================================== */
import { el } from "./ortak.js";

async function sarili(ctx, alt) {
  const D = await import("../../js/gorunum/designs.js");
  const param = new URLSearchParams(ctx.param);
  param.set("alt", alt);
  const sayfa = await D.ciz({ ...ctx, param });
  return el("div", { sinif: "dz-sarili" }, [sayfa]);
}
/* below the wrapped flow: the co-designer split for a published design (market v3, js/pazar.js) */
export const yayinlaSayfasi = async (ctx) => {
  const sayfa = await sarili(ctx, "publish");
  sayfa.append(await (await import("./pazar.js")).yayinBolusu(ctx).catch(() => el("span")));
  return sayfa;
};
export const lisansSayfasi = (ctx) => sarili(ctx, "license");
