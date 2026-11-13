/* ===========================================================================
 * gorunum/squad.js — #/squad: the Pulse Squad as a chain guide
 *
 * Twelve mascots, one per chain (data: docs/js/squad.js, the personality
 * lines from video/squad/squad.json copied below). Each card: the mascot,
 * its chain and launchpad, a line about it, its quote and its status:
 * "Live" with a link to its token page once it is launched, otherwise the
 * date it will not come before. No price is shown next to a mascot.
 *
 * This file also holds the few small display helpers the secondary pages
 * share (a mascot empty state, an example card, CSS bars, an archive
 * disclosure, a contract-details disclosure). They only draw; they read
 * nothing and send nothing.
 * =========================================================================== */

import { el, sayfaUst, panel, not } from "../ui.js";
import { SQUAD, squadResim } from "../squad.js";

/* the personality line and quote of each mascot (video/squad/squad.json) */
const KISILIK = {
  halo: ["Kind, brave and always first. The squad's guardian angel.", "Every chain deserves a guardian."],
  zappy: ["Quick, cheeky, impossible to catch.", "Blink and I'm already live."],
  blu: ["Builds first, talks later. Cap always backwards.", "Ship it, then smile."],
  feather: ["Light as a feather, never misses a shot.", "Aim small, fly high."],
  goldie: ["Sweet, golden and stubborn about it.", "Sweet heart. Strong spirit."],
  vio: ["Eight arms, zero lag. Does everything at once.", "Why do one thing when I can do eight?"],
  pulsy: ["The heartbeat that keeps the squad together.", "One pool. One pulse."],
  turbo: ["A turtle who heard 'slow' was a myth.", "Goggles on. Full send."],
  drip: ["Cool, calm and always flowing.", "Stay liquid."],
  yeti: ["Big fluff, bigger heart, comes down the mountain fast.", "Snow problem."],
  pebble: ["Solid as a rock, soft as a bunny.", "Small, steady, unbreakable."],
  bolt: ["Runs on pure logic and a little bit of vibes.", "A little logic. A lot of personality."],
};
const RENK = { halo: "#c6f86b", zappy: "#14f195", blu: "#3d7bff", feather: "#c3f53c", goldie: "#f0b90b", vio: "#a08cff", pulsy: "#8b6cff", turbo: "#50e3c2", drip: "#4da2ff", yeti: "#e84142", pebble: "#2ed8a7", bolt: "#28a0f0" };
const X_HESAP = "https://x.com/ArcPulseApp";

/* ---- shared styles (injected once; reuses the CSS variables of docs/css) ---- */
const CSS = `
.d4-sq-izgara{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.d4-sq-kart{position:relative;display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:18px;background:var(--yuzey-1);border:1px solid var(--cizgi);overflow:hidden;min-width:0}
.d4-sq-kart::before{content:"";position:absolute;inset:-40% -20% auto auto;width:180px;height:180px;border-radius:50%;background:var(--mk);opacity:.12;filter:blur(30px);pointer-events:none}
.d4-sq-ust{display:flex;align-items:center;gap:12px}
.d4-sq-resim{width:84px;height:84px;flex:none;filter:drop-shadow(0 8px 16px rgba(0,0,0,.35));transition:transform .25s}
.d4-sq-kart:hover .d4-sq-resim{transform:translateY(-4px) rotate(-3deg)}
.d4-sq-ad{font-size:20px;font-weight:700;color:var(--yazi-1);line-height:1.1}
.d4-sq-cip{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--yazi-2);margin-top:4px}
.d4-sq-cip i{width:8px;height:8px;border-radius:50%;background:var(--mk);display:inline-block}
.d4-sq-yazi{font-size:14px;color:var(--yazi-2);line-height:1.45}
.d4-sq-soz{font-size:14px;color:var(--yazi-1);font-style:italic;border-left:3px solid var(--mk);padding-left:10px}
.d4-sq-alt{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:auto;padding-top:6px}
.d4-durum{font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px;background:var(--yuzey-2);color:var(--yazi-2)}
.d4-durum--canli{background:rgba(155,232,189,.14);color:#9be8bd}
.d4-bos{display:flex;align-items:center;gap:16px;padding:18px;border-radius:16px;border:1px dashed var(--cizgi-guclu);background:var(--yuzey-1);flex-wrap:wrap}
.d4-bos img{width:72px;height:72px;flex:none}
.d4-bos__metin{flex:1 1 220px;min-width:0}
.d4-bos__baslik{font-size:16px;font-weight:650;color:var(--yazi-1)}
.d4-bos__yazi{font-size:14px;color:var(--yazi-2);margin-top:4px;line-height:1.45}
.d4-bos__eylem{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.d4-ornek{position:relative;opacity:.55;pointer-events:none;user-select:none;border-radius:16px;border:1px solid var(--cizgi);background:var(--yuzey-1);padding:14px}
.d4-ornek__et{position:absolute;top:10px;right:10px;font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:999px;background:var(--yuzey-3);color:var(--yazi-2)}
.d4-cubuklar{display:flex;flex-direction:column;gap:8px}
.d4-cubuk{display:grid;grid-template-columns:minmax(90px,30%) 1fr auto;gap:10px;align-items:center;font-size:13px;min-width:0}
.d4-cubuk__ad{color:var(--yazi-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.d4-cubuk__iz{height:10px;border-radius:999px;background:var(--yuzey-2);overflow:hidden}
.d4-cubuk__dolu{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--marka),#9be8bd);min-width:2px}
.d4-cubuk__deger{font-family:var(--yazi-tipi-mono);color:var(--yazi-1);font-size:12.5px;white-space:nowrap}
.d4-arsiv{display:block;min-width:0;max-width:100%;overflow:hidden;border:1px solid var(--cizgi);border-radius:16px;background:var(--yuzey-1);padding:4px 14px}
.d4-arsiv>summary{cursor:pointer;padding:12px 0;font-weight:650;color:var(--yazi-1);list-style:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.d4-arsiv>summary::-webkit-details-marker{display:none}
.d4-arsiv>summary::before{content:"▸";color:var(--yazi-3);transition:transform .15s}
.d4-arsiv[open]>summary::before{transform:rotate(90deg)}
.d4-arsiv>summary small{font-weight:450;color:var(--yazi-3);font-size:12.5px}
.d4-arsiv__govde{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding:4px 0 14px}
.d4-sozlesme{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;font-size:13px}
.d4-sozlesme__satir{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--cizgi);min-width:0}
.d4-sozlesme__et{color:var(--yazi-1);flex:1 1 180px}
.d4-sozlesme__ad{font-family:var(--yazi-tipi-mono);color:var(--yazi-3);font-size:12px}
.d4-sozlesme__adres{font-family:var(--yazi-tipi-mono);font-size:12px;word-break:break-all;color:var(--yazi-2)}
.d4-ilerleme{height:6px;border-radius:999px;background:var(--yuzey-2);overflow:hidden;margin-top:6px}
.d4-ilerleme>div{height:100%;width:0;background:var(--marka);transition:width .3s}
.d4-ornek-hesap{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
@media (max-width:560px){.d4-sq-resim{width:72px;height:72px}.d4-cubuk{grid-template-columns:minmax(70px,34%) 1fr auto}}
@media (prefers-reduced-motion:reduce){.d4-sq-resim,.d4-ilerleme>div{transition:none}.d4-sq-kart:hover .d4-sq-resim{transform:none}}
`;
export function stil() {
  if (document.getElementById("d4-stil")) return;
  document.head.append(el("style", { attr: { id: "d4-stil" }, yazi: CSS }));
}

/* ---- helpers shared by the secondary pages ---- */

/** A mascot by key, for chain-or-action empty states. Ethereum has no mascot: Pulsy stands in. */
export const MASKOTLAR = SQUAD.map((m) => m.k);
export const maskotResmi = (k) => "img/squad/" + (MASKOTLAR.includes(k) ? k : "pulsy") + ".svg";
export const maskotAdi = (k) => (SQUAD.find((m) => m.k === k) || { ad: "Pulsy" }).ad;

/**
 * A friendly empty state with a Pulse Squad mascot: what will appear, and how to get on it.
 * `maskot` is a key ("goldie") or a number (picks a different mascot per section).
 */
export function maskotBos(maskot, baslik, yazi, eylemler = []) {
  stil();
  const k = typeof maskot === "number" ? MASKOTLAR[((maskot % MASKOTLAR.length) + MASKOTLAR.length) % MASKOTLAR.length] : maskot;
  return el("div", { sinif: "d4-bos" }, [
    el("img", { attr: { src: maskotResmi(k), alt: "", width: "72", height: "72", loading: "lazy" } }),
    el("div", { sinif: "d4-bos__metin" }, [
      el("div", { sinif: "d4-bos__baslik", yazi: baslik }),
      yazi ? el("div", { sinif: "d4-bos__yazi", yazi }) : null,
      eylemler.length ? el("div", { sinif: "d4-bos__eylem" }, eylemler) : null,
    ]),
  ]);
}

/** A link styled as a button. */
export const dugmeLink = (yazi, href, marka = false) => el("a", { sinif: "dugme" + (marka ? " dugme--marka" : ""), attr: { href }, yazi });

/** A faded card that shows what a listing will look like. It is labelled "Example" and cannot be clicked. */
export function ornekKart(icerik) {
  stil();
  return el("div", { sinif: "d4-ornek", attr: { "aria-label": "Example of a listing" } }, [el("span", { sinif: "d4-ornek__et", yazi: "EXAMPLE" }), ...[].concat(icerik)]);
}

/** Horizontal CSS bars: [{ad, deger, metin}] (no chart library). */
export function cubuklar(liste) {
  stil();
  const enCok = Math.max(0, ...liste.map((x) => Number(x.deger) || 0));
  return el("div", { sinif: "d4-cubuklar", attr: { role: "list" } }, liste.map((x) => el("div", { sinif: "d4-cubuk", attr: { role: "listitem" } }, [
    el("span", { sinif: "d4-cubuk__ad", yazi: x.ad, attr: { title: x.ad } }),
    el("span", { sinif: "d4-cubuk__iz", attr: { "aria-hidden": "true" } }, [el("span", { sinif: "d4-cubuk__dolu", attr: { style: "display:block;width:" + (enCok > 0 ? Math.max(0.5, (100 * (Number(x.deger) || 0)) / enCok) : 0) + "%" } })]),
    el("span", { sinif: "d4-cubuk__deger", yazi: x.metin }),
  ])));
}

/** A closed disclosure for archived or detailed material. */
export function arsiv(baslik, govde, alt = null, acik = false) {
  stil();
  return el("details", { sinif: "d4-arsiv", attr: acik ? { open: true } : {} }, [
    el("summary", {}, [baslik, alt ? el("small", { yazi: alt }) : null]),
    el("div", { sinif: "d4-arsiv__govde" }, [].concat(govde)),
  ]);
}

/** "Contract details": plain label first, the contract's code name and address second. Rows: [label, name, address?]. */
export function sozlesmeAyrinti(satirlar, baslik = "Contract details") {
  stil();
  return arsiv(baslik, el("div", { sinif: "d4-sozlesme" }, satirlar.map(([et, ad, adr]) => el("div", { sinif: "d4-sozlesme__satir" }, [
    el("span", { sinif: "d4-sozlesme__et", yazi: et }),
    ad ? el("span", { sinif: "d4-sozlesme__ad", yazi: ad }) : null,
    adr ? el("span", { sinif: "d4-sozlesme__adres", yazi: adr }) : null,
  ]))));
}

/** A thin progress bar; returns {kap, ayarla(0..1)}. */
export function ilerleme() {
  stil();
  const ic = el("div");
  return { kap: el("div", { sinif: "d4-ilerleme", attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100" } }, [ic]),
    ayarla: (o) => { const y = Math.round(Math.max(0, Math.min(1, o)) * 100); ic.style.width = y + "%"; ic.parentElement.setAttribute("aria-valuenow", String(y)); } };
}

/* ---- the page ---- */

function kart(m) {
  const [kisilik, soz] = KISILIK[m.k] || [m.kisilik || "", m.soz || ""];
  const canli = !!m.token;
  return el("article", { sinif: "d4-sq-kart", attr: { style: "--mk:" + (RENK[m.k] || "var(--marka)") } }, [
    el("div", { sinif: "d4-sq-ust" }, [
      el("img", { sinif: "d4-sq-resim", attr: { src: squadResim(m), alt: m.ad + ", the " + m.zincir + " mascot", width: "84", height: "84", loading: "lazy" } }),
      el("div", {}, [
        el("div", { sinif: "d4-sq-ad", yazi: m.ad }),
        el("div", { sinif: "d4-sq-cip" }, [el("i"), m.zincir]),
        el("div", { sinif: "d4-sq-cip", yazi: "Launchpad: " + m.lp }),
      ]),
    ]),
    el("div", { sinif: "d4-sq-yazi", yazi: kisilik }),
    soz ? el("div", { sinif: "d4-sq-soz", yazi: "“" + soz + "”" }) : null,
    el("div", { sinif: "d4-sq-alt" }, canli
      ? [el("span", { sinif: "d4-durum d4-durum--canli", yazi: "Live" }),
         el("a", { sinif: "dugme dugme--kucuk", attr: { href: "#/terminal?t=" + m.token }, yazi: "Open " + m.ad + "'s page" }),
         m.x ? el("a", { sinif: "dugme dugme--sade dugme--kucuk", attr: { href: m.x, target: "_blank", rel: "noopener" }, yazi: "Launch post ↗" }) : null]
      : [el("span", { sinif: "d4-durum", yazi: "Not before " + m.tarih }),
         el("a", { sinif: "dugme dugme--sade dugme--kucuk", attr: { href: X_HESAP, target: "_blank", rel: "noopener", "aria-label": "Notify me: follow @ArcPulseApp on X" }, yazi: "Notify me ↗" })]),
  ]);
}

export async function ciz() {
  stil();
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Pulse Squad", "Twelve mascots, one for each chain they call home"));
  kap.append(not("Each mascot is a guide to its chain and its launchpad, and each is also a small memecoin ARC PULSE launches itself, one every five days. " +
    "A date is the earliest day, not a promise. Ethereum has no mascot of its own; Pulsy, ARC PULSE's own mascot, stands in there.", "bilgi"));
  const canli = SQUAD.filter((m) => m.token);
  const sonraki = SQUAD.find((m) => !m.token);
  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    el("div", { sinif: "olcum" }, [el("div", { sinif: "olcum__etiket", yazi: "Live" }), el("div", { sinif: "olcum__deger", yazi: canli.length + " of " + SQUAD.length }), el("div", { sinif: "olcum__alt", yazi: canli.map((m) => m.ad).join(", ") || "none yet" })]),
    sonraki ? el("div", { sinif: "olcum" }, [el("div", { sinif: "olcum__etiket", yazi: "Next" }), el("div", { sinif: "olcum__deger", yazi: sonraki.ad }), el("div", { sinif: "olcum__alt", yazi: sonraki.zincir + " · not before " + sonraki.tarih })]) : null,
    el("div", { sinif: "olcum" }, [el("div", { sinif: "olcum__etiket", yazi: "Chains" }), el("div", { sinif: "olcum__deger", yazi: String(new Set(SQUAD.map((m) => m.zincir)).size) }), el("div", { sinif: "olcum__alt", yazi: "one mascot each" })]),
  ]));
  kap.append(panel("Meet the Squad", el("div", { sinif: "d4-sq-izgara" }, SQUAD.map(kart)),
    el("a", { sinif: "ucuncul", attr: { href: X_HESAP, target: "_blank", rel: "noopener" }, yazi: "Follow @ArcPulseApp for each launch ↗" }), el("a", { sinif: "ucuncul", attr: { href: "https://t.me/arcpulse", target: "_blank", rel: "noopener" }, yazi: "Join the Pulse Squad Telegram ↗" })));
  kap.append(panel("Launch your own", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "yazi", yazi: "The Squad shows what a launch looks like on each chain. Your token can start the same way: on ARC PULSE's own launchpad, or on another launchpad through Warp." }),
    el("div", { sinif: "d4-bos__eylem" }, [dugmeLink("Create a token", "#/olustur", true), dugmeLink("Launch through Warp", "#/warp"), dugmeLink("All launches", "#/launches")]),
  ])));
  return kap;
}
