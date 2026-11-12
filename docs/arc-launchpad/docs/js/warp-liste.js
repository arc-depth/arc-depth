/* warp-liste.js — "Launched with Warp": every token launched through Warp on another launchpad, and the Pulse Squad's own.
 * The list (veri/warp-launches.json) is written by scripts/warp-izle.js from each launch's own on-chain mark and published
 * with the analytics; this module only reads and draws it. Shown on Warp and on Discover. */
import { el, panel, bos } from "./ui.js";
import { squadOf, squadResim } from "./squad.js";

const ZINCIR = { solana: "Solana", elysium: "Elysium", bsc: "BNB Chain", robinhood: "Robinhood", monad: "Monad", base: "Base", arc: "Arc" };

export async function warpLaunchlari() {
  const r = await fetch(new URL("../veri/warp-launches.json", import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000), { cache: "no-cache" }).catch(() => null);
  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => null);
  return (j && j.launchlar) || [];
}

const STIL = `
.wl{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.wl a{display:flex;gap:12px;align-items:center;border-radius:14px;padding:12px;background:var(--yuzey-1,#12141b);border:1px solid var(--cizgi,#2a2f3a);text-decoration:none;color:inherit}
.wl a:hover{border-color:var(--marka,#7c5cff)}
.wl img,.wl .wl-bos{width:44px;height:44px;border-radius:12px;object-fit:cover;flex:none;background:#241c48}
.wl b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wl small{display:block;opacity:.7;font-size:12px}
.wl .wl-sq{display:inline-block;margin-left:6px;font-size:10px;font-weight:800;text-transform:uppercase;padding:2px 6px;border-radius:999px;background:linear-gradient(90deg,#7c5cff,#14b8a6);color:#fff;vertical-align:2px}
`;

/* a panel of the list; `bosYazi` is what an empty list says */
export function warpPaneli(launchlar, { baslik = "Launched with Warp", bosYazi, enFazla = 24 } = {}) {
  if (!document.getElementById("wl-stil")) document.head.append(el("style", { attr: { id: "wl-stil" }, yazi: STIL }));
  if (!launchlar.length) return panel(baslik, bos("No Warp launches yet", bosYazi || "The first is Halo, the Pulse Squad's Elysium mascot, on Montra. Every token launched through Warp on any connected launchpad appears here."));
  return panel(baslik + " · " + launchlar.length, el("div", { sinif: "wl" }, launchlar.slice(0, enFazla).map((x) => el("a", { attr: { href: "#/warp?t=" + x.token } }, [
    (x.gorsel || squadOf(x.token)) ? el("img", { attr: { src: x.gorsel || squadResim(squadOf(x.token)), alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : el("span", { sinif: "wl-bos" }),
    el("span", { attr: { style: "min-width:0" } }, [
      el("b", {}, [(x.ad || x.sembol || x.token.slice(0, 8) + "…"), x.biz ? el("span", { sinif: "wl-sq", yazi: "Pulse Squad" }) : null]),
      el("small", { yazi: (x.sembol ? "$" + x.sembol + " · " : "") + x.lp + " · " + (ZINCIR[x.zincir] || x.zincir) }),
      el("small", { yazi: new Date(x.zaman).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " · chart & buy →" }),
    ]),
  ]))));
}
