/* gorunum/creators.js — the product page for TurKaydi type 2 (see urun.js)
 *
 * Extras for creator tokens (1 Nov 2026):
 *   - the founder's trading income waiting on Arc: every trade pays the founder
 *     0.30% in USDC into the token's KurucuVekili; anyone sends it on to the
 *     founder (the token page has the button). What was already sent is not
 *     summed here: that needs the full event history, which public Arc RPCs
 *     do not return cheaply.
 *   - the creator's profiles: the links in the token's TurKaydi description,
 *     opened with rel="noopener nofollow".
 */
import { el, not } from "../ui.js";
import { urunSayfasi, kurucuBekleyen, dolarYaz } from "../urun.js";

const PROFIL = [[/(^|\.)x\.com$|(^|\.)twitter\.com$/, "X"], [/youtube\.com$|youtu\.be$/, "YouTube"], [/twitch\.tv$/, "Twitch"],
  [/instagram\.com$/, "Instagram"], [/tiktok\.com$/, "TikTok"], [/discord\.(gg|com)$/, "Discord"], [/t\.me$|telegram\.(me|org)$/, "Telegram"],
  [/github\.com$/, "GitHub"], [/farcaster\.xyz$|warpcast\.com$/, "Farcaster"], [/substack\.com$/, "Substack"], [/medium\.com$/, "Medium"]];
function profilAdi(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    const p = PROFIL.find(([r]) => r.test(h));
    return p ? p[1] : h;
  } catch (e) { return null; }
}

export function kartEk(x) {
  const b = x.bilgi || {};
  const linkler = (Array.isArray(b.links) ? b.links : []).filter((l) => typeof l === "string" && /^https:\/\//.test(l)).slice(0, 8);
  const gelir = el("div", { sinif: "yazi yazi--kucuk", yazi: "Founder income waiting on Arc: reading…" });
  kurucuBekleyen(x.token).then((k) => {
    gelir.textContent = k == null
      ? "Founder income: paid in USDC, 0.30% of every trade."
      : "Founder income waiting on Arc: " + dolarYaz(k.dolar) + " USDC (0.30% of every trade; anyone can send it on to the creator from the token's page).";
  }).catch(() => { gelir.textContent = "Founder income: paid in USDC, 0.30% of every trade (could not read the amount waiting now)."; });
  return el("div", { sinif: "yigin" }, [
    linkler.length ? el("div", { sinif: "yazi yazi--kucuk" }, [el("span", { sinif: "yazi--sessiz", yazi: "Profiles: " }),
      ...linkler.flatMap((l, i) => [i ? el("span", { yazi: " · " }) : null,
        el("a", { attr: { href: l, target: "_blank", rel: "noopener nofollow" }, yazi: profilAdi(l) || l })]).filter(Boolean)]) : null,
    gelir,
  ]);
}

export function ciz() {
  return urunSayfasi(2, {
    kartEk,
    sonrasi: [not("A creator's earnings are paid in USDC on every trade: 0.30% of each buy and sell collects for the token on Arc and can only go to the creator, on the creator's chain. The amount shown is what is waiting now; what was already sent is in the creator's wallet. Profile links are written by the creator in the token's public description and are not verified by ARC PULSE.", "bilgi")]
  });
}
