/* ===========================================================================
 * gorunum/puan.js — Pulse Points (#/points)
 *
 * The leaderboard from veri/puan.json, written hourly by scripts/puan-hesapla.js
 * from public on-chain data only. The page reads one static file: no wallet
 * connection is needed, nothing is sent, nothing is stored. A connected wallet
 * (if there already is one) is only highlighted.
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum, ayrinti } from "../ui.js";
import { maskotBos, dugmeLink } from "./squad.js";

const ODUL = "Points are tracked from public on-chain activity. A future ARCP airdrop is planned from the 10% airdrop share; size and date are not set yet.";
const ZINCIR_AD = { arc: "Arc", elysium: "Elysium" };
const SAYFA = 50;

const STIL =
  ".pp-ara{display:flex;gap:8px;flex-wrap:wrap}.pp-ara .girdi{flex:1 1 260px;min-width:0;font-size:16px}" +
  ".pp-sonuc{margin-top:12px}.pp-sonuc:empty{display:none}" +
  ".pp-kart{padding:14px 16px;border-radius:16px;border:1px solid var(--cizgi);background:var(--yuzey-1);display:grid;gap:6px;font-size:14px}" +
  ".pp-kart b{font-size:22px}.pp-ben td{background:var(--marka-zemin,rgba(124,92,255,.12))}" +
  ".pp-adr{font-family:var(--yazi-tipi-mono);font-size:13px;overflow-wrap:anywhere;word-break:break-all}" +
  ".pp-formul{margin:0;padding-left:20px;display:grid;gap:8px;font-size:14px;line-height:1.5}" +
  ".pp-liste-haric{font-family:var(--yazi-tipi-mono);font-size:12px;display:grid;gap:4px;overflow-wrap:anywhere;word-break:break-all;max-height:320px;overflow:auto}" +
  ".pp-tablo td,.pp-tablo th{font-size:14px}";

const kucuk = (a) => (/^0x[0-9a-fA-F]{40}$/.test(String(a).trim()) ? String(a).trim().toLowerCase() : String(a).trim());
const kisa = (a) => (a.length > 16 ? a.slice(0, 8) + "…" + a.slice(-6) : a);
const zamanYaz = (iso) => { const d = new Date(iso); return d.getUTCDate() + " " + d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) + ", " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + " UTC"; };
const sayi = (n) => Number(n || 0).toLocaleString("en-US");

async function veriOku() {
  const url = new URL("../../veri/puan.json", import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000);
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function formul(f) {
  const z = (f.zincirler || []).join(" and ");
  return el("ol", { sinif: "pp-formul" }, [
    el("li", {}, [el("strong", { yazi: "Create a token: " + f.launch + " points. " }),
      "For each token your wallet creates through ARC PULSE (the Arc launchpad or Warp). At most " + f.launchGun + " launches per wallet per UTC day count."]),
    el("li", {}, [el("strong", { yazi: "Real traction: +" + f.bonus + " points. " }),
      "When " + f.aliciN + " different wallets (not you, not ARC PULSE) have bought your token within " + f.bonusGun + " days of its launch. This is what makes a launch worth points; spam launches earn little."]),
    el("li", {}, [el("strong", { yazi: "Early supporter: " + f.erken + " points per token. " }),
      "For buying a token launched through ARC PULSE within its first " + f.pencereSaat + " hours, once per token, if your wallet still holds at least " + Math.round(f.tutOran * 100) +
      "% of what it bought when the " + f.pencereSaat + " hours end (shown as pending until then). At most " + f.erkenGun + " tokens per wallet per UTC day."]),
    el("li", {}, "Trading volume earns nothing. Points never grow with the size of a trade, so trading back and forth with yourself gets you nowhere."),
    el("li", {}, "A buy counts when the token arrives in the wallet that signed the transaction. Buys in the same block as the launch are ignored (bots that snipe the opening)."),
    el("li", {}, "Buyer-based points (traction and early supporter) are counted on " + z + ". Launches on other chains earn the launch points."),
  ]);
}

function sonucKarti(veri, adr) {
  const a = kucuk(adr);
  if (!a) return null;
  if ((veri.haric || []).includes(a)) return el("div", { sinif: "pp-kart" }, [el("span", { sinif: "pp-adr", yazi: a }), el("span", { yazi: "This is an ARC PULSE contract or team wallet. It is excluded from points." })]);
  const i = (veri.liste || []).findIndex((x) => x.a === a);
  if (i < 0) return el("div", { sinif: "pp-kart" }, [el("span", { sinif: "pp-adr", yazi: a }),
    el("span", { yazi: (veri.liste || []).length >= 500 ? "Not in the top 500 yet, or no points so far." : "No points yet for this address." }),
    el("span", { sinif: "ucuncul", yazi: "Create a token, or support a new launch in its first 24 hours. The list updates every hour." })]);
  const x = veri.liste[i];
  return el("div", { sinif: "pp-kart" }, [
    el("span", { sinif: "pp-adr", yazi: a }),
    el("span", {}, ["Rank ", el("strong", { yazi: "#" + (i + 1) })]),
    el("b", { yazi: sayi(x.p) + " points" }),
    x.b ? el("span", { yazi: "+" + sayi(x.b) + " pending (confirmed when the 24-hour window closes)" }) : null,
    el("span", { sinif: "ucuncul", yazi: x.l + " launch" + (x.l === 1 ? "" : "es") + " counted · " + x.n + " with real traction · " + (x.e + x.eb) + " early support" + (x.e + x.eb === 1 ? "" : "s") }),
  ]);
}

function tablo(liste, ben) {
  const t = el("table", { sinif: "tablo tablo--kart pp-tablo" });
  const bas = ["Rank · wallet", "Points", "Pending", "Launches", "Early support"];
  t.append(el("thead", {}, [el("tr", {}, bas.map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  const satir = (x, i) => el("tr", { sinif: x.a === ben ? "pp-ben" : "", attr: x.a === ben ? { "aria-current": "true" } : {} }, [
    el("td", {}, [el("strong", { yazi: "#" + (i + 1) + " " }), el("span", { sinif: "pp-adr", yazi: kisa(x.a), attr: { title: x.a } }),
      x.a === ben ? el("span", { sinif: "etiket etiket--alis", attr: { style: "margin-left:6px" }, yazi: "You" }) : null]),
    el("td", { sinif: "sayi", attr: { "data-et": "Points" }, yazi: sayi(x.p) }),
    el("td", { sinif: "sayi", attr: { "data-et": "Pending" }, yazi: x.b ? "+" + sayi(x.b) : "–" }),
    el("td", { sinif: "sayi", attr: { "data-et": "Launches" }, yazi: x.l ? x.l + (x.n ? " (" + x.n + " with traction)" : "") : "–" }),
    el("td", { sinif: "sayi", attr: { "data-et": "Early support" }, yazi: x.e + x.eb ? String(x.e + x.eb) : "–" }),
  ]);
  let gosterilen = 0;
  const dugme = el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Show more" });
  const ekle = () => {
    liste.slice(gosterilen, gosterilen + SAYFA).forEach((x, k) => g.append(satir(x, gosterilen + k)));
    gosterilen = Math.min(liste.length, gosterilen + SAYFA);
    dugme.style.display = gosterilen >= liste.length ? "none" : "";
  };
  /* the connected wallet's row is shown even if it is further down */
  ekle();
  const bi = ben ? liste.findIndex((x) => x.a === ben) : -1;
  while (bi >= gosterilen && gosterilen < liste.length) ekle();
  dugme.addEventListener("click", ekle);
  t.append(g);
  return el("div", { sinif: "yigin yigin--sik" }, [el("div", { sinif: "tablo-sarmal" }, [t]), dugme]);
}

export async function ciz({ cuzdan, param } = {}) {
  if (!document.getElementById("pp-stil")) document.head.append(el("style", { attr: { id: "pp-stil" }, yazi: STIL }));
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Pulse Points", "Points for creating tokens and backing new launches, counted from public on-chain activity"));
  kap.append(not(ODUL, "bilgi"));

  let veri;
  try { veri = await veriOku(); }
  catch (e) {
    kap.append(panel("Leaderboard", maskotBos("pulsy", "Points are not published yet", "The points file is written every hour. Please check back soon.", [dugmeLink("Create a token", "#/olustur", true)])));
    kap.append(panel("How points work", el("div", { sinif: "ikincil", yazi: "The formula appears here with the first published points file." })));
    return kap;
  }

  const ben = (() => { try { const h = cuzdan && cuzdan.hesap && cuzdan.hesap(); return h ? kucuk(h) : null; } catch (e) { return null; } })();
  const T = veri.toplam || {};
  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Wallets with points", sayi(T.cuzdan)),
    olcum("Points confirmed", sayi(T.puan)),
    olcum("Points pending", sayi(T.bekleyen), "early support inside an open 24-hour window"),
    olcum("Last updated", veri.guncellendi ? zamanYaz(veri.guncellendi) : "–", "every hour · formula " + (veri.surum || "v1")),
  ]));

  /* check any address: no wallet needed */
  const girdi = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "text", autocomplete: "off", spellcheck: "false", placeholder: "0x… or a Solana address", "aria-label": "Address to check" } });
  const sonuc = el("div", { sinif: "pp-sonuc", attr: { "aria-live": "polite" } });
  const bak = () => { sonuc.replaceChildren(...[sonucKarti(veri, girdi.value)].filter(Boolean)); };
  girdi.addEventListener("keydown", (e) => { if (e.key === "Enter") bak(); });
  const ilk = (param && param.get("a")) || ben;
  if (ilk) { girdi.value = ilk; bak(); }
  kap.append(panel("Check an address", el("div", {}, [
    el("div", { sinif: "pp-ara" }, [girdi, el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Check", on: { click: bak } })]),
    el("div", { sinif: "ucuncul", attr: { style: "margin-top:8px" }, yazi: ben ? "Your connected wallet is filled in and highlighted below. Nothing is sent." : "No wallet connection needed: paste any address. Nothing is sent or stored." }),
    sonuc,
  ])));

  const liste = veri.liste || [];
  kap.append(panel("Leaderboard" + (liste.length ? " · top " + liste.length : ""), liste.length ? tablo(liste, ben)
    : maskotBos("pulsy", "No points yet", "Be the first: create a token through ARC PULSE and get " + (veri.formul ? veri.formul.aliciN : 5) + " real buyers.",
      [dugmeLink("Create a token", "#/olustur", true), dugmeLink("All launches", "#/launches")])));

  if (veri.formul) kap.append(panel("How points work", el("div", { sinif: "yigin yigin--sik" }, [formul(veri.formul)])));

  const haric = veri.haric || [];
  kap.append(panel("What is excluded", el("div", { sinif: "yigin yigin--sik" }, [
    el("ul", { sinif: "pp-formul" }, [
      el("li", { yazi: "ARC PULSE's own contracts and team wallets (" + sayi(T.haric || haric.length) + " addresses). Tokens the team launches earn no launch points." }),
      el("li", { yazi: "A token's creator, on their own token." }),
      el("li", { yazi: "Buys in the launch block, and wallets that sold more than half before the first 24 hours ended." }),
      el("li", { yazi: "Transfers that the receiving wallet did not sign itself (gifts, airdrops, transfers between wallets)." }),
    ]),
    haric.length ? ayrinti("Show the excluded public addresses", el("div", { sinif: "pp-liste-haric" }, haric.map((a) => el("span", { yazi: a })))) : null,
  ])));

  const J = veri.jetonlar || [];
  if (J.length) {
    const jt = el("table", { sinif: "tablo tablo--kart pp-tablo" });
    jt.append(el("thead", {}, [el("tr", {}, ["Token", "Chain", "Buyers counted", "Early supporters", "Window"].map((b) => el("th", { yazi: b })))]));
    jt.append(el("tbody", {}, J.map((j) => el("tr", {}, [
      el("td", {}, [el("strong", { yazi: j.s || kisa(j.t) }), j.ekip ? el("span", { sinif: "etiket", attr: { style: "margin-left:6px" }, yazi: "ARC PULSE team" }) : null]),
      el("td", { attr: { "data-et": "Chain" }, yazi: ZINCIR_AD[j.zk] || j.zk }),
      el("td", { sinif: "sayi", attr: { "data-et": "Buyers counted" }, yazi: j.ekip ? "–" : String(j.alici) + (j.nitelikli ? " · traction" : "") }),
      el("td", { sinif: "sayi", attr: { "data-et": "Early supporters" }, yazi: String(j.erken) }),
      el("td", { attr: { "data-et": "Window" }, yazi: j.acik ? "First 24 h open" : "Closed" }),
    ]))));
    kap.append(panel("Tokens being tracked", ayrinti("Show the " + J.length + " newest tracked tokens", el("div", { sinif: "tablo-sarmal" }, [jt]))));
  }

  kap.append(el("div", { sinif: "satir", attr: { style: "gap:8px;flex-wrap:wrap" } }, [dugmeLink("Create a token", "#/olustur", true), dugmeLink("Launch with Warp", "#/warp"), dugmeLink("Portfolio", "#/portfoy")]));
  return kap;
}
