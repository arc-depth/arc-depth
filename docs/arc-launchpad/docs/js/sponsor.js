/* ===========================================================================
 * sponsor.js — the "Sponsored" unit (12 Nov 2026)
 *
 * One component for every paid placement, so every placement looks and reads
 * the same: a dashed frame (organic cards are solid), the word "Sponsored"
 * first in real text, aria-label "Sponsored: <name>", a "Learn more" link that
 * opens the advertiser's https page in a new tab with rel="sponsored", and an
 * optional https image. No mascot, no price, no animation.
 *
 * WHAT IS SOLD
 *   Flat-fee time slots (see #/advertise). The active slots are a plain file,
 *   docs/veri/sponsorlar.json: an array, empty by default, so every placement
 *   renders nothing at all. An entry is live from `start` (inclusive) to `end`
 *   (exclusive), both ISO dates, and only on the placements it lists.
 *   docs/veri/sponsorlar.ornek.json shows the shape.
 *
 * WHAT IS NOT DONE
 *   Nothing is counted or sent anywhere: no impression pixel, no click
 *   tracking, no cookie. A placement never goes inside an organic ranked list,
 *   never as its first item, and never on money or trust pages.
 * =========================================================================== */
import { el } from "./ui.js";

/** where a sponsor can appear; the key is what an entry lists in `placements` */
export const YERLER = {
  "discover": "Discover: a Sponsored row below the organic lists",
  "market-slide": "Market: one labelled slide at the end of the hero carousel",
  "market-launchpads": "Market › Launchpads: a Sponsored row above the ranking (never inside it)",
  "rail": "Desktop: a tile at the foot of the left menu",
  "more": "Phone: a tile under the quick-access row in More",
  "trade": "Trade: a Sponsored row below the launch grid",
  "token": "Token pages: a cross-promo card below About",
};

const https = (u) => { try { const x = new URL(String(u)); return x.protocol === "https:" ? x.href : null; } catch (e) { return null; } };
const kisalt = (t, n) => { t = String(t || "").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };

let _yukleme = null;
/** the valid entries of veri/sponsorlar.json (cached for this page view) */
export function sponsorlariYukle() {
  if (!_yukleme) {
    const url = new URL("../veri/sponsorlar.json", import.meta.url).href + "?t=" + Math.floor(Date.now() / 600000);
    _yukleme = fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : [])).catch(() => [])
      .then((liste) => (Array.isArray(liste) ? liste : []).map(temizle).filter(Boolean));
  }
  return _yukleme;
}

function temizle(x) {
  if (!x || typeof x !== "object") return null;
  const url = https(x.url);
  const bas = Date.parse(x.start), son = Date.parse(x.end);
  const yerler = Array.isArray(x.placements) ? x.placements.filter((y) => y in YERLER) : [];
  if (!url || !x.name || !x.title || !isFinite(bas) || !isFinite(son) || son <= bas || !yerler.length) return null;
  return { id: String(x.id || x.name), ad: kisalt(x.name, 40), baslik: kisalt(x.title, 40), metin: kisalt(x.text, 90), url,
    resim: x.image ? https(x.image) : null, bas, son, yerler };
}

/** the sponsor live now on `yer`, or null. Several on one placement take turns by the hour. */
export async function aktifSponsor(yer, simdi = Date.now()) {
  const liste = (await sponsorlariYukle()).filter((s) => s.yerler.includes(yer) && s.bas <= simdi && simdi < s.son);
  if (!liste.length) return null;
  return liste[Math.floor(simdi / 3600000) % liste.length];
}

/** the unit itself. varyant: "row" (full width), "tile", "rail" (narrow), "slide" (Market hero) */
export function sponsorKarti(s, varyant = "row") {
  let alan;
  try { alan = new URL(s.url).hostname.replace(/^www\./, ""); } catch (e) { alan = ""; }
  const neden = el("details", { sinif: "sponsor__neden" }, [
    el("summary", { attr: { "aria-label": "Why am I seeing this?", title: "Why am I seeing this?" }, yazi: "i" }),
    el("div", { sinif: "sponsor__neden-govde" }, [
      "A paid placement for a fixed time. It does not change any ranking, and ARC PULSE does not track who sees it. ",
      el("a", { attr: { href: "#/advertise" }, yazi: "Advertise →" })]),
  ]);
  return el("aside", { sinif: "sponsor sponsor--" + varyant, attr: { role: "complementary", "aria-label": "Sponsored: " + s.ad }, veri: { sponsor: s.id } }, [
    el("div", { sinif: "sponsor__ust" }, [el("span", { sinif: "sponsor__et", yazi: "Sponsored" }), el("span", { sinif: "sponsor__ad", yazi: "· " + s.ad }), neden]),
    el("div", { sinif: "sponsor__govde" }, [
      s.resim ? el("img", { sinif: "sponsor__resim", attr: { src: s.resim, alt: "", loading: "lazy", referrerpolicy: "no-referrer", width: "40", height: "40" }, on: { error: (e) => e.target.remove() } }) : null,
      el("div", { sinif: "sponsor__yazi" }, [el("b", { yazi: s.baslik }), s.metin ? el("p", { yazi: s.metin }) : null]),
    ]),
    el("a", { sinif: "dugme dugme--sade dugme--kucuk sponsor__git", attr: { href: s.url, target: "_blank", rel: "sponsored noopener noreferrer" } },
      ["Learn more ↗", alan ? el("small", { yazi: alan }) : null]),
  ]);
}

/**
 * A placeholder that becomes the live sponsor for `yer`, or removes itself when there is none.
 * `sar(kart)` may wrap the card (a section title, a slide); it is called only when a sponsor is live.
 */
export function sponsorYeri(yer, varyant = "row", sar = null) {
  const yerTutucu = el("div", { sinif: "sponsor-yer", attr: { hidden: true } });
  aktifSponsor(yer).then((s) => {
    if (!s) { yerTutucu.remove(); return; }
    const kart = sponsorKarti(s, varyant);
    yerTutucu.replaceWith(sar ? sar(kart) : kart);
  }).catch(() => yerTutucu.remove());
  return yerTutucu;
}
