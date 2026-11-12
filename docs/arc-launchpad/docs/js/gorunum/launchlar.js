/* ===========================================================================
 * gorunum/launchlar.js — every launch made from ARC PULSE, in one list (#/launches)
 *
 *   Through Warp      launched from our Warp page onto another launchpad (Montra, pump.fun, Flap…); each one
 *                     found on chain by its own Warp mark (scripts/warp-izle.js -> veri/warp-launches.json)
 *   ARC PULSE pool    launched on our own launchpad: the one pool on Arc (first generation, v8 and the v9
 *                     designer set) and the Move launchpads on Sui and Aptos; read from their registries
 * Each row says where the token lives (launchpad · chain) and where its launch was paid from:
 *   Warp: the creator's wallet on that launchpad's chain; one pool: the chain the founder paid from, read
 *   from the launch's own transaction (filled in row by row, "…" until it answers, never guessed).
 * =========================================================================== */
import { el, sayfaUst, panel, bos, not, temizle, sekmeler } from "../ui.js";
import { YedekliOkur } from "../yedekli-okur.js";
import { Contract } from "../../vendor/ethers.min.js";
import { warpLaunchlari } from "../warp-liste.js";
import { squadOf, squadResim } from "../squad.js";
import { islemZincirleri, cikisZinciri, sepetV2, sepetV9, SEPET } from "../teminat-izle.js";

const arc = new YedekliOkur();
const LP_ABI = [
  "function launchCount() view returns (uint256)",
  "function launchAt(uint256) view returns ((address token, address acici, address kasa, uint256 teminat, address kurucu, uint256 kurucuToken, uint256 teklif, uint256 vergiPpm, uint64 zaman))",
];
const ZINCIR = { solana: "Solana", elysium: "Elysium", bsc: "BNB Chain", robinhood: "Robinhood", monad: "Monad", base: "Base", arc: "Arc" };
const RENK = { Arc: "#7c5cff", Base: "#0052ff", Arbitrum: "#28a0f0", Ethereum: "#627eea", BNB: "#f0b90b", "BNB Chain": "#f0b90b", Avalanche: "#e84142",
  Monad: "#836ef9", HyperEVM: "#50e3c2", Robinhood: "#ccff00", Elysium: "#c6f86b", Solana: "#14f195", Sui: "#4da2ff", Aptos: "#2ed8a7" };
const AZAMI = 60;   // newest launches read per Arc registry

const STIL = `
.ll-ozet{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.ll-ozet div{border-radius:14px;padding:12px 14px;background:var(--yuzey-1,#12141b);border:1px solid var(--cizgi,#2a2f3a)}
.ll-ozet span{display:block;font-size:12px;opacity:.7}.ll-ozet b{font-size:22px}
.ll-ara{width:100%;max-width:340px}
.ll-tablo{width:100%;border-collapse:collapse;font-size:14px}
.ll-tablo th{text-align:left;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.6;padding:8px 10px;border-bottom:1px solid var(--cizgi,#2a2f3a)}
.ll-tablo td{padding:10px;border-bottom:1px solid var(--cizgi,#2a2f3a);vertical-align:middle}
.ll-tablo tr:hover td{background:rgba(127,127,127,.06)}
.ll-tok{display:flex;gap:10px;align-items:center;min-width:0}
.ll-tok img,.ll-tok .b{width:34px;height:34px;border-radius:10px;object-fit:cover;flex:none;background:#241c48;display:grid;place-items:center;font-size:10px;font-weight:800}
.ll-tok b{display:block}.ll-tok small{opacity:.7}
.ll-z{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--z) 55%,transparent);background:color-mix(in srgb,var(--z) 14%,transparent)}
.ll-yol{display:inline-block;font-size:11px;font-weight:800;text-transform:uppercase;padding:3px 8px;border-radius:999px}
.ll-yol.warp{background:linear-gradient(90deg,#7c5cff,#14b8a6);color:#fff}.ll-yol.biz{background:rgba(124,92,255,.18);color:#b9a8ff;border:1px solid rgba(124,92,255,.5)}
.ll-sq{margin-left:6px;font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:#c6f86b;color:#10140a;vertical-align:2px}
@media (max-width:760px){.ll-tablo thead{display:none}.ll-tablo tr{display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:10px 0;border-bottom:1px solid var(--cizgi,#2a2f3a)}
  .ll-tablo td{border:0;padding:2px 0}.ll-tablo td[data-e]::before{content:attr(data-e) ": ";opacity:.6;font-size:12px}.ll-tablo tr{position:relative;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.ll-tablo td:first-child{grid-column:1/-1;padding-right:70px}.ll-tablo td.ll-ac{position:absolute;right:0;top:12px}}
`;

const zc = (z) => el("span", { sinif: "ll-z", attr: { style: "--z:" + (RENK[z] || "#888") }, yazi: z });
const tarih = (sn) => sn ? new Date(sn * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

async function arcKaydi(lpAdres, nesil, cfg) {
  const lp = new Contract(lpAdres, LP_ABI, arc);
  const n = Number(await lp.launchCount());
  const sira = [];
  for (let i = n - 1; i >= Math.max(0, n - AZAMI); i--) sira.push(i);
  const kayit = await Promise.all(sira.map((i) => lp.launchAt(i)));
  return Promise.all(kayit.map(async (k) => {
    const c = new Contract(k.token, ["function name() view returns (string)", "function symbol() view returns (string)"], arc);
    const [ad, sembol] = await Promise.all([c.name().catch(() => null), c.symbol().catch(() => null)]);
    return { tur: "biz", token: k.token, ad, sembol, zaman: Number(k.zaman), lp: "ARC PULSE one pool" + nesil, zincir: "Arc", link: "#/merkez?t=" + k.token, cfg };
  }));
}

export async function ciz({ param } = {}) {
  if (!document.getElementById("ll-stil")) document.head.append(el("style", { attr: { id: "ll-stil" }, yazi: STIL }));
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("All launches", "Every token launched from ARC PULSE: through Warp onto another launchpad, or on our own launchpad"));

  const [v2, v9] = await Promise.all([sepetV2(), sepetV9()]);
  const kaynaklar = await Promise.allSettled([
    warpLaunchlari(),
    v2 ? arcKaydi(v2.lp5, "", v2) : Promise.resolve([]),
    arcKaydi(SEPET.lp5, v2 ? " · first generation" : "", SEPET),
    v9 ? arcKaydi(v9.lp5, " · designer set", v9) : Promise.resolve([]),
    import("../sui.js").then((m) => m.launchListesi()),
    import("../aptos.js").then((m) => m.launchListesi()),
  ]);
  const hatalar = [];
  const al = (i, ad) => { const s = kaynaklar[i]; if (s.status === "fulfilled") return s.value || []; hatalar.push(ad); return []; };

  const satirlar = [];
  for (const x of al(0, "Warp list")) satirlar.push({ tur: "warp", token: x.token, ad: x.ad, sembol: x.sembol, zaman: Math.floor(Date.parse(x.zaman) / 1000),
    lp: x.lp, zincir: ZINCIR[x.zincir] || x.zincir, nereden: ZINCIR[x.zincir] || x.zincir, link: "#/warp?t=" + x.token, gorsel: x.gorsel, biz: x.biz });
  for (const i of [1, 2, 3]) satirlar.push(...al(i, ["", "Arc launchpad", "Arc first generation", "Arc designer set"][i]));
  for (const x of al(4, "Sui launchpad")) satirlar.push({ tur: "biz", token: x.token, ad: String(x.token).split("::")[2] || "Sui token", sembol: String(x.token).split("::")[2] || "", zaman: 0, lp: "ARC PULSE Move launchpad", zincir: "Sui", nereden: "Sui", link: "#/move-token?zincir=sui&kasa=" + x.kasa });
  for (const x of al(5, "Aptos launchpad")) satirlar.push({ tur: "biz", token: x.token, ad: x.ad, sembol: x.simge, zaman: 0, lp: "ARC PULSE Move launchpad", zincir: "Aptos", nereden: "Aptos", link: "#/move-token?zincir=aptos&token=" + x.token });
  satirlar.sort((a, b) => b.zaman - a.zaman);

  if (hatalar.length) kap.append(not("Could not read every source right now (" + hatalar.join(", ") + "); the rest is shown.", "uyari"));
  const nWarp = satirlar.filter((s) => s.tur === "warp").length, nBiz = satirlar.length - nWarp;
  const lpSay = new Set(satirlar.map((s) => s.lp + "|" + s.zincir)).size;
  kap.append(el("div", { sinif: "ll-ozet" }, [
    el("div", {}, [el("span", { yazi: "All launches" }), el("b", { yazi: String(satirlar.length) })]),
    el("div", {}, [el("span", { yazi: "Through Warp" }), el("b", { yazi: String(nWarp) })]),
    el("div", {}, [el("span", { yazi: "On ARC PULSE's launchpad" }), el("b", { yazi: String(nBiz) })]),
    el("div", {}, [el("span", { yazi: "Launchpads · chains used" }), el("b", { yazi: String(lpSay) })]),
  ]));

  /* tabs + a search box: however many launches there are, one tap to the set you want */
  let secili = (param && param.get("tur")) || "hepsi";
  const ara = el("input", { sinif: "girdi ll-ara", attr: { placeholder: "Search name, ticker, chain or launchpad", autocomplete: "off" } });
  const govde = el("div");
  const ciz2 = () => {
    const q = ara.value.trim().toLowerCase();
    const liste = satirlar.filter((s) => (secili === "hepsi" || s.tur === secili) &&
      (!q || [s.ad, s.sembol, s.zincir, s.lp, s.token].some((v) => String(v || "").toLowerCase().includes(q))));
    if (!liste.length) { temizle(govde).append(bos("Nothing here yet", secili === "warp" ? "Tokens launched through Warp appear here as soon as their launch is on chain." : "No launch matches.")); return; }
    const tablo = el("table", { sinif: "ll-tablo" }, [
      el("thead", {}, [el("tr", {}, ["Token", "Route", "Launchpad", "Lives on", "Paid from", "Date", ""].map((b) => el("th", { yazi: b })))]),
      el("tbody", {}, liste.map((s) => {
        const m = squadOf(s.token);
        const res = s.gorsel || (m ? squadResim(m) : null);
        const nereden = el("td", { attr: { "data-e": "Paid from" } }, [s.nereden ? zc(s.nereden) : el("span", { attr: { style: "opacity:.6" }, yazi: "…" })]);
        if (!s.nereden && s.cfg) islemZincirleri(s.token, s.cfg).then((t) => cikisZinciri(s.token, t.adapter, s.zaman, s.cfg))
          .then((c) => temizle(nereden).append(zc(c || "Arc"))).catch(() => temizle(nereden).append(el("span", { attr: { style: "opacity:.6" }, yazi: "unknown" })));
        return el("tr", {}, [
          el("td", {}, [el("a", { sinif: "ll-tok", attr: { href: s.link, style: "color:inherit;text-decoration:none" } }, [
            res ? el("img", { attr: { src: res, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : el("span", { sinif: "b", yazi: String(s.sembol || "?").slice(0, 4).toUpperCase() }),
            el("span", { attr: { style: "min-width:0" } }, [el("b", {}, [s.ad || s.sembol || "?", m ? el("span", { sinif: "ll-sq", yazi: "Pulse Squad" }) : null]), el("small", { yazi: s.sembol ? "$" + s.sembol : "" })])])]),
          el("td", { attr: { "data-e": "Route" } }, [el("span", { sinif: "ll-yol " + s.tur, yazi: s.tur === "warp" ? "Warp ⚡" : "ARC PULSE" })]),
          el("td", { attr: { "data-e": "Launchpad" }, yazi: s.lp }),
          el("td", { attr: { "data-e": "Lives on" } }, [zc(s.zincir)]),
          nereden,
          el("td", { attr: { "data-e": "Date" }, yazi: tarih(s.zaman) }),
          el("td", { sinif: "ll-ac" }, [el("a", { attr: { href: s.link }, yazi: "Open →" })]),
        ]);
      })),
    ]);
    temizle(govde).append(tablo);
  };
  ara.addEventListener("input", ciz2);
  kap.append(panel("Launches", el("div", { sinif: "yigin" }, [
    sekmeler([{ anahtar: "hepsi", ad: "All · " + satirlar.length }, { anahtar: "warp", ad: "Through Warp · " + nWarp }, { anahtar: "biz", ad: "ARC PULSE launchpad · " + nBiz }], secili, (k) => { secili = k; ciz2(); }),
    ara, govde,
  ])));
  ciz2();
  kap.append(not("Route: Warp ⚡ means the token was launched from ARC PULSE's Warp page onto another launchpad, signed in the creator's own wallet; ARC PULSE means it was launched on our own launchpad (the one pool on Arc, or the Move launchpads on Sui and Aptos). Paid from: the chain the launch was paid on. Read from the chains each time the page opens; nothing is stored about who launched."));
  return kap;
}
