/* ===========================================================================
 * gorunum/advertise.js — Advertise (#/advertise), 12 Nov 2026
 *
 * The sponsor menu: what can be bought, where it shows and what it looks like,
 * the trial prices, the rules, how the money is split and how to book.
 * Booking is a DM on X and payment is arranged by hand: there is no payment
 * flow here on purpose. The live slots are docs/veri/sponsorlar.json
 * (js/sponsor.js renders them).
 * =========================================================================== */
import { el, sayfaUst, panel, not } from "../ui.js";
import { sponsorKarti } from "../sponsor.js";

const X_URL = "https://x.com/ArcPulseApp";

const STIL = `
.adv-izgara{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.adv-kart{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:16px;border:1px solid var(--cizgi);background:var(--yuzey-1);min-width:0}
.adv-kart h3{margin:0;font-size:16px}
.adv-kart p{margin:0;font-size:14px;line-height:1.5;color:var(--yazi-2)}
.adv-fiyat{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
.adv-fiyat span{font-size:14px;font-weight:700;padding:5px 11px;border-radius:999px;border:1px solid var(--marka-cizgi);background:var(--marka-zemin);color:var(--yazi-1)}
.adv-fiyat small{font-weight:500;color:var(--yazi-3);margin-left:4px}
.adv-on{position:relative;height:96px;border-radius:12px;border:1px solid var(--cizgi);background:var(--yuzey-0);overflow:hidden;display:grid;gap:5px;padding:8px}
.adv-on i{display:block;border-radius:5px;background:var(--yuzey-2)}
.adv-on b{display:grid;place-items:center;border-radius:5px;border:1.5px dashed var(--marka-parlak,#9a80ff);color:var(--marka-parlak,#9a80ff);font-size:10px;font-weight:700;letter-spacing:.04em;background:rgba(124,92,255,.08)}
.adv-on--izgara{grid-template-columns:repeat(4,1fr);grid-template-rows:1fr 1fr 18px}.adv-on--izgara b{grid-column:1/-1}
.adv-on--slayt{grid-template-columns:1fr 1fr 1fr;grid-template-rows:2fr 1fr}.adv-on--slayt b{grid-column:1/-1}
.adv-on--ray b{font-size:7px;letter-spacing:0}
.adv-on--ray{grid-template-columns:64px 1fr;grid-template-rows:repeat(4,1fr)}.adv-on--ray i:first-child{grid-row:1/4}.adv-on--ray i.g{grid-row:1/5;grid-column:2}.adv-on--ray b{grid-column:1;grid-row:4}
.adv-on--token{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr 18px}.adv-on--token b{grid-column:1/-1}
.adv-on--x{grid-template-rows:repeat(5,1fr)}
.adv-on--lp{grid-template-rows:18px repeat(4,1fr)}
.adv-liste{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.5;color:var(--yazi-1)}
.adv-pay{display:flex;height:40px;border-radius:12px;overflow:hidden;border:1px solid var(--cizgi)}
.adv-pay div{display:grid;place-items:center;font-size:13px;font-weight:700;color:#fff;min-width:0;white-space:nowrap;overflow:hidden}
.adv-pay-et{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-top:10px}
.adv-pay-et div{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;color:var(--yazi-2);line-height:1.4}
.adv-pay-et i{width:10px;height:10px;border-radius:3px;flex:none;margin-top:4px}
.adv-adim{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;counter-reset:a}
.adv-adim div{padding:14px;border-radius:14px;border:1px solid var(--cizgi);font-size:14px;line-height:1.45;color:var(--yazi-2)}
.adv-adim div::before{counter-increment:a;content:"Step " counter(a);display:block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--yazi-3);margin-bottom:4px}
.adv-adim b{color:var(--yazi-1)}
.adv-ornek{max-width:560px}
.adv-ornek-et{font-size:12px;color:var(--yazi-3);margin-bottom:6px}
@media (max-width:480px){.adv-pay div{font-size:11.5px}}
`;

/* the formats, their trial prices (USD) and where each one shows */
const URUNLER = [
  { ad: "Launch boost", on: "izgara", fiyat: [["$15", "24 hours"], ["$35", "72 hours"]],
    yazi: "Your token in the Sponsored row on Trade and on Discover, kept apart from the organic launch grid (never inside it, never first)." },
  { ad: "Market carousel slide", on: "slayt", fiyat: [["$60", "per week"]],
    yazi: "One labelled slide at the end of the hero carousel on Market. The organic slides keep their order; yours never comes first." },
  { ad: "Sidebar and More tile", on: "ray", fiyat: [["$40", "per week"]],
    yazi: "A tile at the foot of the desktop menu on browsing pages, and under the quick-access row in the phone's More page." },
  { ad: "Token-page cross-promo", on: "token", fiyat: [["$25", "per week"]],
    yazi: "A card below the About section on ARC PULSE token pages, away from the buy box. Not shown on Pulse Squad pages." },
  { ad: "Weekly X digest mention", on: "x", fiyat: [["$20", "per post"]],
    yazi: "One line, marked #ad, in the weekly launch digest on @ArcPulseApp, a post that lists every launch for free." },
  { ad: "Featured launchpad", on: "lp", fiyat: [["$150", "per month"]],
    yazi: "For launchpads and ecosystems: a Sponsored row above the ranking on Market › Launchpads. The ranking itself stays by volume." },
];

function onizleme(tur) {
  const i = (n, sinif = "") => Array.from({ length: n }, () => el("i", { sinif }));
  const b = el("b", { yazi: "SPONSORED" });
  const ic = {
    izgara: [...i(8), b], slayt: [b, ...i(3)], ray: [el("i"), el("i", { sinif: "g" }), b],
    token: [...i(4), b], x: [...i(2), b, ...i(2)], lp: [b, ...i(4)],
  }[tur];
  return el("div", { sinif: "adv-on adv-on--" + tur, attr: { "aria-hidden": "true" } }, ic);
}

export async function ciz() {
  if (!document.getElementById("adv-stil")) document.head.append(el("style", { attr: { id: "adv-stil" }, yazi: STIL }));
  const kap = el("div", { sinif: "yigin" });
  const dm = (sinif = "dugme dugme--marka") => el("a", { sinif, attr: { href: X_URL, target: "_blank", rel: "noopener noreferrer" }, yazi: "DM @ArcPulseApp on X ↗" });

  kap.append(sayfaUst("Advertise", "Clearly labelled Sponsored slots, sold as flat-fee time slots", [dm()]));
  kap.append(not("ARC PULSE is new, so these are trial prices for short tests. We do not track visitors: there are no impression or click counts, no cookies and no pixels. Slots are sold by time, and you get dated screenshots of your placement on desktop and on a phone.", "bilgi"));

  kap.append(panel("Formats and trial prices", el("div", { sinif: "adv-izgara" }, URUNLER.map((u) => el("div", { sinif: "adv-kart" }, [
    onizleme(u.on),
    el("h3", { yazi: u.ad }),
    el("p", { yazi: u.yazi }),
    el("div", { sinif: "adv-fiyat" }, u.fiyat.map(([f, s]) => el("span", {}, [f, el("small", { yazi: s })]))),
  ]))), el("span", { sinif: "ucuncul", yazi: "USD, paid up front" })));

  /* the real component, with made-up content, so a buyer sees exactly what goes live */
  const ornek = sponsorKarti({ id: "ornek", ad: "Your project", baslik: "Your title, up to 40 characters", metin: "One line about what you offer, up to 90 characters. No promises of price or profit.", url: X_URL, resim: null }, "row");
  kap.append(panel("What it looks like", el("div", { sinif: "adv-ornek" }, [el("div", { sinif: "adv-ornek-et", yazi: "Example (this is how every placement renders):" }), ornek,
    el("p", { sinif: "ucuncul", attr: { style: "margin-top:10px" }, yazi: "A dashed frame (our own cards are solid), the word Sponsored first, your name, a title, one line, an optional square logo and a Learn more link to your https page. No animation, no price, no mascot." })])));

  kap.append(panel("Rules", el("ul", { sinif: "adv-liste" }, [
    "Every unit is labelled Sponsored, first and in plain text, and screen readers announce it as Sponsored.",
    "Never inside buy, sell, sign or presale flows, and never on the wallet, Portfolio, ARCP, DAO and proposals, Security, Docs, vaults or proofs pages.",
    "Never inside an organic list, never as its first item, and it never changes any ranking. At most one sponsor unit per screen.",
    "No Pulse Squad mascot appears in or next to a sponsor unit; the mascots never endorse a token.",
    "We can refuse or remove any booking, for example scams, impersonation of a brand, a project or a person, copies of other tokens, or misleading claims.",
    "No guarantees: a placement does not promise price, volume, holders or traffic, and ad copy cannot promise profit either.",
    "If a problem on our side keeps your slot from showing, the missed time is added at the end.",
  ].map((t) => el("li", { yazi: t })))));

  const PAY = [["40%", "#ff7a59", "ARCP burn", "Buys ARCP and burns it"], ["30%", "#7c5cff", "Developer pool", "Funds building the platform"],
    ["20%", "#2dd4bf", "Marketing", "Pays for reaching new users"], ["10%", "#ffb020", "Founder", "The founder's share"]];
  kap.append(panel("Where the money goes", el("div", {}, [
    el("div", { sinif: "adv-pay", attr: { role: "img", "aria-label": "Sponsor revenue split: 40% ARCP burn, 30% developer pool, 20% marketing, 10% founder" } },
      PAY.map(([p, r, a]) => el("div", { attr: { style: "flex:" + parseInt(p) + ";background:" + r }, yazi: p + " " + (parseInt(p) >= 20 ? a : "") }))),
    el("div", { sinif: "adv-pay-et" }, PAY.map(([p, r, a, alt]) => el("div", {}, [el("i", { attr: { style: "background:" + r } }), el("span", {}, [el("b", { attr: { style: "color:var(--yazi-1)" }, yazi: p + " " + a }), " · " + alt])]))),
    el("p", { sinif: "ucuncul", attr: { style: "margin-top:10px" }, yazi: "The same split as the Market buy fee." }),
  ])));

  kap.append(panel("How to book", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "adv-adim" }, [
      el("div", {}, [el("b", { yazi: "Send a DM to @ArcPulseApp on X" }), " with what you want to promote, the format, the dates, your link and your logo."]),
      el("div", {}, [el("b", { yazi: "We check it." }), " We look at the project and the link, and say yes or no. We can refuse without giving a reason."]),
      el("div", {}, [el("b", { yazi: "We agree the price and the payment" }), " by hand, in the DM. Nothing is paid on this site."]),
      el("div", {}, [el("b", { yazi: "Your slot goes live" }), " at the agreed start time and ends by itself at the agreed end time."]),
    ]),
    el("div", {}, [dm()]),
  ])));
  return kap;
}
