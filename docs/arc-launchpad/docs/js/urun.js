/* ===========================================================================
 * urun.js — the nine products, told apart by one on-chain record
 *
 * Owner, 1 Nov 2026: every product launches through the same engine
 * (MerkezKapi on Arc, the same rules, the same 2.2% fee, one pool). The
 * only thing that separates a community token from a game token is the
 * type its founder writes into TurKaydi (adresler.js → TUR_KAYDI).
 *
 * This module holds:
 *   TURLER         the types, their route and the plain description
 *   secilenTur     the type the Create page should open with (a product
 *                  page's "Create a ... token" button sets it; kept in a
 *                  module variable and sessionStorage, nothing else)
 *   turTokenlari   the tokens whose latest TurKaydi entry has a given type
 *   turYaz         TurKaydi.yaz from the connected wallet, on Arc
 *   urunSayfasi    the shared product page the route views render
 *
 * Nothing about the visitor is stored: the selected type is a number, and
 * it is cleared as soon as the Create page reads it.
 * =========================================================================== */
import { el, sayfaUst, panel, bos, not } from "./ui.js";
import { ikon } from "./ikon.js";
import { TUR_KAYDI } from "./adresler.js";
import { YedekliOkur } from "./yedekli-okur.js";
import { Contract, Interface } from "../vendor/ethers.min.js";

export const TUR_ABI = [
  "function yaz(address token, uint8 tur, string bilgi)",
  "function turOf(address) view returns (uint8)",
  "function bilgiOf(address) view returns (string)",
  "function yazildi(address) view returns (bool)",
  "function kurucuOf(address token) view returns (address)",
  "event TurYazildi(address indexed token, uint8 indexed tur, string bilgi, address yazan)"
];

/* tur number → product. `yol` is the route in yol.js. */
export const TURLER = [
  { tur: 0, ad: "Meme", cogul: "meme", yol: null },
  { tur: 1, ad: "Community", cogul: "community", yol: "communities",
    metin: [
      "A token for a group that already exists: a Discord server, a Telegram group or an X community builds shared value in one token instead of scattered ones.",
      "The founder can open token-holder-only channels, so holding the token is the membership.",
      "For community leaders and the members who want a stake in what they are building together."
    ] },
  { tur: 2, ad: "Creator", cogul: "creator", yol: "creators",
    metin: [
      "A creator's own token: fans support the people they follow by holding it.",
      "The creator, as founder, earns 0.30% of every trade in USDC, paid from the token's own trading fee.",
      "For writers, artists, streamers and anyone with an audience who wants to be supported directly."
    ] },
  { tur: 3, ad: "AI agent", cogul: "AI agent", yol: "agents",
    metin: [
      "A token that belongs to an AI agent. When the agent's own wallet is the founder, the founder's 0.30% of every trade goes to that wallet, so the agent can pay for its own running costs.",
      "Agents can also launch through the contracts directly, without this page.",
      "For agent builders who want their agent to have its own economy. Publish the agent's wallet in the description so holders can check it."
    ] },
  { tur: 4, ad: "Project", cogul: "project", yol: "projects",
    metin: [
      "A token for a small team gathering support for something it is building.",
      "An optional founder lock is planned for later. A project token is not a share and promises no profit; holders support the work and hold collateral-backed tokens.",
      "For early teams that want a community behind them from day one."
    ] },
  { tur: 5, ad: "DAO", cogul: "DAO", yol: "daos",
    metin: [
      "A token for a group that decides together: holders vote and run a shared treasury.",
      "Per-token governance contracts (Token DAOs) are coming; today a DAO token launches with the same rules and its holders organise around it.",
      "For collectives, clubs and groups that want their decisions on chain."
    ] },
  { tur: 6, ad: "Game", cogul: "game", yol: "games",
    metin: [
      "A token used inside a game: an in-game currency or a reward players earn and trade.",
      "A developer guide for wiring the token into a game is coming.",
      "For game developers and the players of their games."
    ] },
  { tur: 7, ad: "Basket", cogul: "basket", yol: "baskets",
    metin: [
      "A token where the collateral basket is the point: it holds up to five assets chosen by the founder, from any of twelve chains.",
      "Holders can redeem their share of the basket without selling in the pool.",
      "For people who want one token that is backed by a set of assets they can see and redeem. It is not an index fund or an investment product."
    ] },
  { tur: 8, ad: "Designer", cogul: "designer", yol: "designs" }
];

export const turBul = (n) => TURLER.find((t) => t.tur === Number(n)) || TURLER[0];

/* ---- the type the Create page opens with ---- */
const ANAHTAR = "arcpulse-secilen-tur";
let _secilen = null;
export function turSec(n) {
  _secilen = Number(n);
  try { sessionStorage.setItem(ANAHTAR, String(_secilen)); } catch (e) { /* storage may be blocked */ }
}
/** Read once and cleared, so the next plain visit to Create opens as Meme. */
export function secilenTuruAl() {
  let n = _secilen;
  try { if (n == null) { const s = sessionStorage.getItem(ANAHTAR); if (s != null) n = Number(s); } sessionStorage.removeItem(ANAHTAR); } catch (e) { /* storage may be blocked */ }
  _secilen = null;
  return Number.isInteger(n) && n >= 0 && n < TURLER.length ? n : 0;
}

/* ---- the description a founder publishes ---- */
/** Builds the small JSON written as `bilgi`: {"text":..., "links":[...], "agentWallet":...}. */
export function bilgiYap(metin, ajanCuzdan) {
  const yazi = String(metin || "").trim();
  const links = [...new Set(yazi.match(/https:\/\/[^\s"'<>]+/g) || [])].slice(0, 8);
  const text = links.reduce((s, l) => s.replace(l, ""), yazi).replace(/\s+/g, " ").trim();
  const o = {};
  if (text) o.text = text;
  if (links.length) o.links = links;
  if (ajanCuzdan && /^0x[0-9a-fA-F]{40}$/.test(ajanCuzdan.trim())) o.agentWallet = ajanCuzdan.trim();
  return Object.keys(o).length ? JSON.stringify(o) : "";
}
export const baytBoyu = (s) => new TextEncoder().encode(s || "").length;

function bilgiCoz(s) {
  try { const o = JSON.parse(s); if (o && typeof o === "object") return o; } catch (e) { /* plain text */ }
  return s ? { text: String(s) } : {};
}

/* ---- reading the record ---- */
const arc = new YedekliOkur();
const kayit = () => new Contract(TUR_KAYDI.adres, TUR_ABI, arc);
const LP_ABI = [
  "function launchCount() view returns (uint256)",
  "function launchAt(uint256) view returns ((address token, address acici, address kasa, uint256 teminat, address kurucu, uint256 kurucuToken, uint256 teklif, uint256 vergiPpm, uint64 zaman))"
];

/* Every TurYazildi since deployment, latest per token. One getLogs over the
   whole range; an RPC that refuses a long range falls to the next one
   (YedekliOkur) and, if every one refuses, the launch registry is walked
   and turOf is read per token instead. */
async function sonKayitlar() {
  const ifc = new Interface(TUR_ABI);
  try {
    const loglar = await arc.getLogs({ address: TUR_KAYDI.adres, topics: [ifc.getEvent("TurYazildi").topicHash],
      fromBlock: TUR_KAYDI.baslangicBloku, toBlock: "latest" });
    const son = new Map();
    for (const l of loglar) {
      const p = ifc.parseLog(l);
      son.set(p.args.token.toLowerCase(), { token: p.args.token, tur: Number(p.args.tur), bilgi: p.args.bilgi });
    }
    return [...son.values()];
  } catch (e) {
    const { sepetV2, SEPET } = await import("./teminat-izle.js");
    const cfg = (await sepetV2()) || SEPET;
    const lp = new Contract(cfg.lp5, LP_ABI, arc);
    const n = Number(await lp.launchCount());
    const k = kayit();
    const sonuc = [];
    for (let i = n - 1; i >= Math.max(0, n - 300); i--) {
      const t = (await lp.launchAt(i)).token;
      if (!(await k.yazildi(t))) continue;
      const [tur, bilgi] = await Promise.all([k.turOf(t), k.bilgiOf(t)]);
      sonuc.push({ token: t, tur: Number(tur), bilgi });
    }
    return sonuc;
  }
}

export async function turTokenlari(tur) {
  const liste = (await sonKayitlar()).filter((x) => x.tur === Number(tur)).reverse();   // newest first
  return Promise.all(liste.map(async (x) => {
    const c = new Contract(x.token, ["function name() view returns (string)", "function symbol() view returns (string)"], arc);
    const [ad, sembol] = await Promise.all([c.name().catch(() => null), c.symbol().catch(() => null)]);
    return { ...x, ad, sembol, bilgi: bilgiCoz(x.bilgi) };
  }));
}

/* ---- writing the record: from the founder's wallet, on Arc ---- */
export async function turYaz({ token, tur, bilgi, cuzdan, durum }) {
  const ben = cuzdan.hesap() || (await cuzdan.bagla());
  if (!ben) throw new Error("Connect a wallet first.");
  if (baytBoyu(bilgi) > TUR_KAYDI.bilgiAzami) throw new Error("The description is " + baytBoyu(bilgi) + " bytes; the record keeps at most " + TUR_KAYDI.bilgiAzami + ". Shorten it.");
  const kurucu = await kayit().kurucuOf(token);
  if (/^0x0{40}$/i.test(kurucu)) throw new Error("This token's founder is not an EVM address (or the launch record is not readable yet), so it cannot be saved from this wallet.");
  if (kurucu.toLowerCase() !== ben.toLowerCase()) throw new Error("Only the founder (" + kurucu.slice(0, 8) + "…" + kurucu.slice(-6) + ") can save this token's product type. Connect that wallet.");
  const { AGLAR } = await import("./aglar.js");
  const arcAg = AGLAR.find((a) => a.anahtar === "arc");
  durum("Confirm in your wallet (on Arc, a few cents of gas)…");
  const h = await cuzdan.agdaGonder(arcAg, { to: TUR_KAYDI.adres, data: new Interface(TUR_ABI).encodeFunctionData("yaz", [token, Number(tur), bilgi || ""]), value: "0x0" });
  durum("Sent. Waiting for Arc to confirm…");
  for (let i = 0; i < 40; i++) {
    const m = await arc.getTransactionReceipt(h).catch(() => null);
    if (m) { if (m.status !== 1) throw new Error("Reverted: " + h); return h; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("No receipt yet for " + h + ". It may still go through: check it in an explorer before sending again.");
}

/* ---- the shared product page ---- */
function tokenKarti(x) {
  const b = x.bilgi || {};
  const linkler = (Array.isArray(b.links) ? b.links : []).filter((l) => typeof l === "string" && /^https:\/\//.test(l)).slice(0, 8);
  return el("div", { sinif: "jeton-kart" }, [
    el("div", { sinif: "jeton" }, [
      el("div", { sinif: "jeton__logo jeton__logo--bos", yazi: (x.sembol || "?").slice(0, 3).toUpperCase() }),
      el("div", { sinif: "jeton__yazi" }, [el("div", { sinif: "jeton__sembol", yazi: x.sembol || "?" }), el("div", { sinif: "jeton__ad", yazi: x.ad || "" })]),
    ]),
    b.text ? el("div", { sinif: "yazi yazi--kucuk", yazi: String(b.text).slice(0, 600) }) : null,
    linkler.length ? el("div", { sinif: "yazi yazi--kucuk" }, linkler.map((l) =>
      el("div", {}, [el("a", { attr: { href: l, target: "_blank", rel: "noopener noreferrer nofollow" }, yazi: l.replace(/^https:\/\//, "").slice(0, 60) })]))) : null,
    typeof b.agentWallet === "string" && /^0x[0-9a-fA-F]{40}$/.test(b.agentWallet)
      ? el("div", { sinif: "yazi yazi--kucuk yazi--sessiz mono", yazi: "Agent wallet: " + b.agentWallet }) : null,
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz mono", yazi: x.token }),
    el("a", { sinif: "dugme dugme--kucuk", attr: { href: "#/merkez?t=" + x.token }, yazi: "Trade" }),
  ]);
}

export async function urunSayfasi(n) {
  const t = turBul(n);
  const kap = el("div", { sinif: "yigin" });
  const olusturDugme = el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur" }, on: { click: () => turSec(t.tur) } }, [
    el("span", { html: ikon("arti", "yol-oge__ikon") }), el("span", { yazi: "Create " + (/^[AEIOU]/i.test(t.cogul) ? "an " : "a ") + t.cogul + " token" })]);
  kap.append(sayfaUst(t.ad + " tokens", "Same launch engine, same rules: one pool on Arc, collateral basket, tradable from twelve chains", [olusturDugme]));
  kap.append(panel("What it is for", el("div", { sinif: "yigin" }, (t.metin || []).map((s) => el("p", { yazi: s })))));
  kap.append(not("Every " + t.cogul + " token launches through the same MerkezKapi as every other: first buy $20–500, a collateral basket the founder chooses (each line at least 5% of the first buy), a 1–5% collateral tax and the same 2.2% trading fee. What makes it a " + t.cogul + " token is the type its founder writes into the TurKaydi record on Arc.", "bilgi"));

  const BASLIK = t.ad + " tokens on Arc";
  try {
    const liste = await turTokenlari(t.tur);
    kap.append(panel(BASLIK, liste.length
      ? el("div", { sinif: "izgara izgara--kart" }, liste.map(tokenKarti))
      : bos("No " + t.cogul + " tokens yet — be the first", "Launch a token and save its type as " + t.ad + "; it appears here as soon as the record on Arc has it.",
          el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur" }, on: { click: () => turSec(t.tur) }, yazi: "Create " + (/^[AEIOU]/i.test(t.cogul) ? "an " : "a ") + t.cogul + " token" }))));
  } catch (e) {
    kap.append(panel(BASLIK, bos("Could not read the type record", String((e && e.message) || e))));
  }
  return kap;
}
