/* ===========================================================================
 * vitrin.js — Market (9 Nov 2026): every token on the chains relay.link
 * reaches, trending and new, and a buy box that pays from any of our EVM chains.
 *
 *   data   GeckoTerminal's public API, read by the visitor's browser (trending
 *          pools, new pools; one chain or all of them). Nothing is stored.
 *   trade  relay.link /quote: the visitor's chain dollar -> the token on its own
 *          chain, delivered to the visitor's address there (Solana: the address
 *          typed in). appFees carries the ARC PULSE fee (0.5%) to the fee wallet;
 *          scripts/pazar-ucret.js collects it daily and splits it on Arc:
 *          0.20% ARCP burn, 0.15% developer pool, 0.10% marketing, 0.05% founder.
 *   launchpads  DefiLlama's public DEX overview: every protocol in its Launchpad
 *          category, 24 h and 30 d volume on our twelve chains, ranked; ARC PULSE
 *          among them with the 24 h volume of its own pools (GeckoTerminal).
 * A top tab (ana.js BIRINCIL) and on the rail.
 * =========================================================================== */
import { el, temizle, bos } from "../ui.js";
import { AGLAR } from "../aglar.js";
import { ELYSIUM } from "../elysium.js";
import { cuzdan } from "../cuzdan.js";
import { rpcPost } from "../ag-okur.js";
import { Contract } from "../../vendor/ethers.min.js";
import { YedekliOkur } from "../yedekli-okur.js";

const GECKO = "https://api.geckoterminal.com/api/v2";
const RELAY = "https://api.relay.link";
const UCRET_BPS = "50";   // 0.5%
const UCRET_ALICI = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";   // the fee wallet: relay accrues here, pazar-ucret.js splits it

/* the chains shown: GeckoTerminal's network id, relay's chain id */
const ZINCIRLER = [
  { k: "arc", ad: "Arc", gecko: "arc", relay: 5042, llama: "arc" },
  { k: "base", ad: "Base", gecko: "base", relay: 8453, llama: "base" },
  { k: "solana", ad: "Solana", gecko: "solana", relay: 792703809, llama: "solana" },
  { k: "bsc", ad: "BNB", gecko: "bsc", relay: 56, llama: "bsc" },
  { k: "ethereum", ad: "Ethereum", gecko: "eth", relay: 1, llama: "ethereum" },
  { k: "arbitrum", ad: "Arbitrum", gecko: "arbitrum", relay: 42161, llama: "arbitrum" },
  { k: "avalanche", ad: "Avalanche", gecko: "avax", relay: 43114, llama: "avax" },
  { k: "monad", ad: "Monad", gecko: "monad", relay: 143, llama: "monad" },
  { k: "hyperevm", ad: "HyperEVM", gecko: "hyperevm", relay: 999, llama: "hyperliquid" },
  { k: "robinhood", ad: "Robinhood", gecko: "robinhood", relay: 4663, llama: "robinhood" },
  /* Elysium (9 Nov 2026): listed from GeckoTerminal; relay routes to it (chain 99901, native HYPE) though its chain list does not show it */
  { k: "elysium", ad: "Elysium", gecko: "elysium", relay: 99901, llama: null },
];
/* the other two of our twelve: in the launchpad ranking only (relay does not reach them, so no token buying) */
const LP_EK = [{ k: "sui", ad: "Sui", llama: "sui" }, { k: "aptos", ad: "Aptos", llama: "aptos" }];
const LLAMA_AD = Object.fromEntries([...ZINCIRLER, ...LP_EK].map((z) => [z.llama, z.ad]));
const geckodan = (id) => ZINCIRLER.find((z) => z.gecko === id);

/* what is shown: a pool needs this much liquidity (USD) to be listed; fresh pools a little less */
const ESIK = 10_000, ESIK_YENI = 3_000;
const YENILE_MS = 45_000;   // the page reads the market again every 45 s while it is open

/* our own launches, first on the page: every launchpad generation on Arc */
const BIZIM_LP = ["0x52e600c8259ca44D9837B7b9E6BA1faee4bC040d"];   // PulseLaunchpad5 (first generation)
const LP_ABI = ["function launchCount() view returns (uint256)", "function launchAt(uint256) view returns ((address token, address acici, address kasa, uint256 teminat, address kurucu, uint256 kurucuToken, uint256 teklif, uint256 vergiPpm, uint64 zaman))"];
const arcOkur = new YedekliOkur();
let bizimOnbellek = null;
export async function bizimTokenler() {
  if (bizimOnbellek && Date.now() - bizimOnbellek.t < 300_000) return bizimOnbellek.v;
  const lpler = [...BIZIM_LP];
  for (const d of ["sepet-v2", "sepet-v9"]) {
    const j = await fetch("veri/" + d + ".json").then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (j && j.launchpad) lpler.push(j.launchpad);
  }
  const out = [];
  for (const a of lpler) {
    try {
      const lp = new Contract(a, LP_ABI, arcOkur);
      const n = Number(await lp.launchCount());
      for (let i = n - 1; i >= Math.max(0, n - 12); i--) {
        const k = await lp.launchAt(i);
        const c = new Contract(k.token, ["function name() view returns (string)", "function symbol() view returns (string)"], arcOkur);
        const [ad, sembol] = await Promise.all([c.name().catch(() => "?"), c.symbol().catch(() => "?")]);
        out.push({ adres: k.token, ad, sembol, zaman: Number(k.zaman) });
      }
    } catch (e) { /* a launchpad that does not answer is skipped */ }
  }
  out.sort((a, b) => b.zaman - a.zaman);
  bizimOnbellek = { t: Date.now(), v: out };
  return out;
}

const STIL = `
.vt{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px}
@media (max-width:1100px){.vt{grid-template-columns:1fr}}
.vt-cipler{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 18px}
.vt-cip{border:1px solid var(--cizgi,#2a2f3a);background:transparent;color:inherit;border-radius:999px;padding:7px 14px;font-weight:600;font-size:13px;line-height:1;cursor:pointer}
.vt-cip[aria-pressed="true"]{background:var(--marka,#7c5cff);border-color:var(--marka,#7c5cff);color:#fff}
.vt-h2{font-weight:700;font-size:20px;line-height:1.2;margin:22px 0 4px}.vt-alt{opacity:.6;font-size:13px;margin:0 0 12px}
.vt-one{position:relative;border-radius:18px;overflow:hidden;min-height:230px;padding:24px;display:flex;flex-direction:column;justify-content:flex-end;cursor:pointer;background:#111}
.vt-one img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(28px) saturate(1.4);opacity:.45;transform:scale(1.2)}
.vt-one>*:not(.bg){position:relative}
.vt-one-ust{display:flex;gap:14px;align-items:center}.vt-one-ust img{width:64px;height:64px;border-radius:14px;object-fit:cover}
.vt-one-ad{font-weight:800;font-size:34px;line-height:1.05}.vt-one-stat{display:flex;gap:26px;margin-top:18px;flex-wrap:wrap}
.vt-one-stat div{font-size:11px;letter-spacing:.06em;opacity:.7;text-transform:uppercase}.vt-one-stat b{display:block;font-size:18px;opacity:1;letter-spacing:0;text-transform:none;margin-top:4px}
.vt-trend{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.vt-sat{display:flex;gap:10px;align-items:center;padding:12px;border:1px solid var(--cizgi,#2a2f3a);border-radius:14px;cursor:pointer;background:rgba(255,255,255,.02)}
.vt-sat:hover,.vt-kart:hover,.vt-sira:hover{border-color:var(--marka,#7c5cff)}
.vt-sat img,.vt-sira img,.vt-ikon{width:40px;height:40px;border-radius:10px;object-fit:cover;flex:none}
.vt-ikon{display:grid;place-items:center;font-weight:700;font-size:11px;color:#fff}
.vt-ad{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vt-k{font-size:12px;opacity:.65}
.vt-yesil{color:#3ddc97}.vt-kirmizi{color:#ff6b6b}
.vt-kartlar{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.vt-kart{position:relative;aspect-ratio:4/5;border-radius:16px;overflow:hidden;border:1px solid var(--cizgi,#2a2f3a);cursor:pointer;background:#15171c}
.vt-kart img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(16px);transform:scale(1.1);transition:filter .25s}
.vt-kart:hover img,.vt-kart:focus-within img{filter:none}
.vt-uyari{margin-top:12px;border:1px solid #ffb02066;background:#ffb02014;color:#ffcf70;border-radius:10px;padding:9px 11px;font-size:12.5px}
.vt-bizim{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;margin-bottom:18px}
.vt-bizim a{flex:none;display:flex;gap:10px;align-items:center;padding:10px 14px;border:1px solid #7c5cff66;background:#7c5cff14;border-radius:14px;color:inherit;text-decoration:none}
.vt-bizim a:hover{border-color:#7c5cff}
.vt-teminat{font-size:10.5px;font-weight:700;color:#3ddc97;border:1px solid #3ddc9766;border-radius:999px;padding:1px 7px;margin-left:8px;vertical-align:middle}
.vt-canli{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;opacity:.7;margin-left:10px;vertical-align:middle}
.vt-canli i{width:7px;height:7px;border-radius:50%;background:#3ddc97;animation:vtNabiz 1.6s infinite}
@keyframes vtNabiz{50%{opacity:.25}}
.vt-kart .vt-ikon{position:absolute;inset:0;width:100%;height:100%;border-radius:0;font-size:20px}
.vt-kart-alt{position:absolute;left:0;right:0;bottom:0;padding:40px 12px 12px;background:linear-gradient(transparent,rgba(0,0,0,.85))}
.vt-rozet{position:absolute;top:10px;left:10px;background:rgba(0,0,0,.6);border-radius:999px;padding:4px 9px;font-size:11px;font-weight:600}
.vt-zincir{display:inline-block;border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:2px 8px;font-size:11px;margin-left:6px}
.vt-yan{border:1px solid var(--cizgi,#2a2f3a);border-radius:16px;padding:14px;align-self:start;position:sticky;top:12px}
.vt-sira{display:grid;grid-template-columns:22px 40px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px;border:1px solid transparent;border-radius:12px;cursor:pointer}
.vt-sira .r{text-align:right;font-size:13px}
.vt-mod{display:inline-flex;border:1px solid var(--cizgi,#2a2f3a);border-radius:12px;padding:3px;margin:6px 0 12px}
.vt-mod button{border:0;background:transparent;color:inherit;padding:8px 16px;border-radius:9px;font-weight:600;font-size:14px;cursor:pointer;opacity:.7}
.vt-mod button[aria-pressed="true"]{background:rgba(124,92,255,.25);opacity:1}
.vt-lp{border:1px solid var(--cizgi,#2a2f3a);border-radius:16px;overflow:hidden}
.vt-lp-sat{display:grid;grid-template-columns:44px 40px minmax(0,1.4fr) minmax(0,1.6fr) 130px 130px 90px;gap:12px;align-items:center;padding:10px 14px;border-top:1px solid var(--cizgi,#2a2f3a)}
.vt-lp-sat:first-child{border-top:0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.6}
.vt-lp-sat .r{text-align:right}
.vt-lp-sat img{width:36px;height:36px;border-radius:10px;object-fit:cover;background:#222}
.vt-lp-sat.biz{background:rgba(124,92,255,.12);box-shadow:inset 3px 0 0 #7c5cff}
.vt-lp-z{display:flex;gap:4px;flex-wrap:wrap}.vt-lp-z span{font-size:11px;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:1px 7px}
@media (max-width:900px){.vt-lp-sat{grid-template-columns:34px 36px minmax(0,1fr) 100px}.vt-lp-sat>:nth-child(4),.vt-lp-sat>:nth-child(6),.vt-lp-sat>:nth-child(7){display:none}}
.vt-lp-ozet{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.vt-lp-ozet div{border:1px solid var(--cizgi,#2a2f3a);border-radius:14px;padding:12px 16px;min-width:150px}
.vt-lp-ozet b{display:block;font-size:20px;margin-top:4px}
.vt-vitrin{position:relative;border-radius:18px;overflow:hidden;min-height:310px;background:#111}
.vt-slayt{position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity .6s}
.vt-slayt.acik{opacity:1;pointer-events:auto}
.vt-vitrin .vt-one{position:absolute;inset:0;min-height:0;border-radius:0}
.vt-noktalar{position:absolute;right:24px;bottom:18px;display:flex;gap:6px;z-index:2}
.vt-noktalar button{width:18px;height:4px;border-radius:2px;border:0;background:rgba(255,255,255,.3);cursor:pointer;padding:0}
.vt-noktalar button.acik{width:32px;background:#fff}
.vt-os{align-items:flex-start;background:radial-gradient(120% 140% at 0% 0%,rgba(61,220,151,.28),transparent 55%),radial-gradient(120% 140% at 100% 100%,rgba(124,92,255,.35),transparent 55%),#101218}
.vt-os-et{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#3ddc97;border:1px solid #3ddc9766;border-radius:999px;padding:4px 10px;margin-bottom:12px}
.vt-os-et i{width:7px;height:7px;border-radius:50%;background:#3ddc97;animation:vtNabiz 1.6s infinite}
.vt-os-cubuk{height:8px;border-radius:4px;background:rgba(255,255,255,.1);margin-top:16px;max-width:520px;overflow:hidden}
.vt-os-cubuk i{display:block;height:100%;background:linear-gradient(90deg,#3ddc97,#7c5cff)}
.vt-os-dugme{display:inline-block;margin-top:16px;background:#3ddc97;color:#05130c;font-weight:800;border-radius:10px;padding:9px 16px;text-decoration:none}
.vt-perde{position:fixed;inset:0;background:rgba(0,0,0,.6);display:grid;place-items:center;z-index:50;padding:16px}
.vt-modal{width:min(440px,100%);background:#14161b;border:1px solid var(--cizgi,#2a2f3a);border-radius:18px;padding:20px;max-height:92vh;overflow:auto}
.vt-modal label{display:block;font-size:12px;opacity:.7;margin:14px 0 6px}
.vt-modal select,.vt-modal input{width:100%;box-sizing:border-box;background:#0d0f13;border:1px solid var(--cizgi,#2a2f3a);color:inherit;border-radius:10px;padding:10px;font:inherit}
.vt-hizli{display:flex;gap:6px;margin-top:8px}.vt-hizli button{flex:1}
.vt-ozet{margin-top:14px;border:1px solid var(--cizgi,#2a2f3a);border-radius:12px;padding:12px;font-size:13px}
.vt-ozet div{display:flex;justify-content:space-between;padding:3px 0}
.vt-durum{font-size:13px;opacity:.8;margin-top:10px;min-height:18px}
.vt-demo{display:inline-block;background:#ffb02033;color:#ffcf70;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;margin-left:8px;vertical-align:middle}
`;

const para = (x) => {
  const n = Number(x);
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  if (n >= 1) return "$" + n.toFixed(2);
  if (n >= 0.0001) return "$" + n.toPrecision(3);
  /* $0.0₈312: the zeros after the point counted, as charts show tiny prices */
  let sifir = Math.floor(-Math.log10(n));
  if (Math.round(n * 10 ** (sifir + 3)) >= 1000) sifir--;   // 0.00009999 rounds up a place
  const alt = String(sifir).split("").map((c) => "₀₁₂₃₄₅₆₇₈₉"[c]).join("");
  return "$0.0" + alt + Math.round(n * 10 ** (sifir + 3)).toString().slice(0, 3);
};
const yuzde = (x) => {
  const n = Number(x);
  if (!isFinite(n)) return el("span", { yazi: "—" });
  return el("span", { sinif: n >= 0 ? "vt-yesil" : "vt-kirmizi", yazi: (n >= 0 ? "+" : "") + (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1)) + "%" });
};
const once = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return Math.round(s) + "s ago";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
};
/* a token with no image gets a colour from its address */
function ikonYok(t) {
  let h = 0; for (const c of t.adres) h = (h * 31 + c.charCodeAt(0)) % 360;
  return el("div", { sinif: "vt-ikon", attr: { style: "background:linear-gradient(135deg,hsl(" + h + " 70% 45%),hsl(" + ((h + 70) % 360) + " 70% 30%))" }, yazi: t.sembol.slice(0, 4) });
}
const resim = (t) => t.resim ? el("img", { attr: { src: t.resim, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }, on: { error: (e) => e.target.replaceWith(ikonYok(t)) } }) : ikonYok(t);

/* GeckoTerminal pools -> one row per token, only on chains relay reaches */
function cozumle(j) {
  const tok = new Map((j.included || []).filter((x) => x.type === "token").map((x) => [x.id, x.attributes]));
  const out = [];
  for (const p of j.data || []) {
    const z = geckodan(p.relationships.network ? p.relationships.network.data.id : p.id.split("_")[0]);
    const b = tok.get(p.relationships.base_token.data.id);
    if (!z || !b) continue;
    const a = p.attributes;
    out.push({
      zincir: z, adres: b.address, sembol: b.symbol || "?", ad: b.name || b.symbol, karar: b.decimals,
      resim: b.image_url && !/missing/.test(b.image_url) ? b.image_url : null,
      fiyat: a.base_token_price_usd, fdv: a.market_cap_usd || a.fdv_usd, hacim: a.volume_usd ? a.volume_usd.h24 : 0,
      degisim: a.price_change_percentage ? a.price_change_percentage.h24 : null, islem: a.transactions && a.transactions.h24 ? a.transactions.h24.buys + a.transactions.h24.sells : 0,
      kuruldu: a.pool_created_at, havuz: a.address, likidite: Number(a.reserve_in_usd || 0), dex: p.relationships.dex ? p.relationships.dex.data.id : "",
    });
  }
  /* one row per token: the pool with the most volume */
  const tek = new Map();
  for (const t of out) { const k = t.zincir.k + ":" + t.adres.toLowerCase(); if (!tek.has(k) || Number(tek.get(k).hacim) < Number(t.hacim)) tek.set(k, t); }
  return [...tek.values()];
}

const onbellek = new Map();
async function gecko(yol) {
  const o = onbellek.get(yol);
  if (o && Date.now() - o.t < 60000) return o.v;
  /* a busy service answers 429 without CORS headers, so the browser sees a failed fetch: wait and ask again */
  for (let i = 0; ; i++) {
    const r = await fetch(GECKO + yol, { headers: { accept: "application/json" } }).catch(() => null);
    if (r && r.ok) {
      const v = cozumle(await r.json());
      onbellek.set(yol, { t: Date.now(), v });
      return v;
    }
    if (o) return o.v;   // an older copy beats nothing
    if (i >= 2) throw new Error("The market data service is busy, try again in a minute.");
    await new Promise((x) => setTimeout(x, 2500 * (i + 1)));
  }
}
async function veri(z) {
  const on = z ? "/networks/" + z.gecko : "/networks";
  const [trend, yeni] = await Promise.allSettled([
    gecko(on + "/trending_pools?include=base_token,network&page=1"),
    gecko(on + "/new_pools?include=base_token,network&page=1"),
  ]);
  if (trend.status === "rejected" && yeni.status === "rejected") throw trend.reason;
  return { trend: trend.value || [], yeni: yeni.value || [] };
}

/* ---- launchpads: DefiLlama's Launchpad category, volume on our twelve chains ---- */
const LLAMA = "https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
let lpOnbellek = null;
async function lpVeri() {
  if (lpOnbellek && Date.now() - lpOnbellek.t < 600_000) return lpOnbellek.v;
  const r = await fetch(LLAMA).catch(() => null);
  if (!r || !r.ok) { if (lpOnbellek) return lpOnbellek.v; throw new Error("Launchpad volumes are unavailable right now, try again in a minute."); }
  const j = await r.json();
  const v = (j.protocols || []).filter((p) => p.category === "Launchpad").map((p) => ({
    ad: p.displayName || p.name, logo: p.logo, slug: p.slug, degisim: p.change_1d,
    g24: p.breakdown24h || {}, g30: p.breakdown30d || {},
  }));
  lpOnbellek = { t: Date.now(), v };
  return v;
}
/* the sum of a breakdown ({chain: {protocol: usd}}) over the chains asked */
const topla = (b, anahtarlar) => anahtarlar.reduce((s, k) => s + Object.values(b[k] || {}).reduce((x, y) => x + Number(y || 0), 0), 0);
/* ARC PULSE's own 24 h volume: its launches' pools on Arc, as GeckoTerminal counts them */
async function bizimHacim() {
  const b = await bizimTokenler().catch(() => []);
  if (!b.length) return 0;
  const r = await fetch(GECKO + "/networks/arc/tokens/multi/" + b.map((x) => x.adres).join(","), { headers: { accept: "application/json" } }).catch(() => null);
  if (!r || !r.ok) return 0;
  const j = await r.json();
  return (j.data || []).reduce((s, t) => s + Number((t.attributes.volume_usd && t.attributes.volume_usd.h24) || 0), 0);
}

/* ---- the ARCP presale, first slide of the showcase: read from Arc, a minute at most old ---- */
let osOnbellek = null;
async function onSatis() {
  if (osOnbellek && Date.now() - osOnbellek.t < 60_000) return osOnbellek.v;
  const k = await fetch("veri/arcp2.json").then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (!k || !k.canli || !k.onSatis) return null;
  const o = new Contract(k.onSatis, ["function tur() view returns (uint256)", "function turToplam(uint256) view returns (uint256)", "function turBitis(uint256) view returns (uint256)",
    "function katilimciSayisi(uint256) view returns (uint256)", "function kuruldu() view returns (bool)", "function dolu() view returns (bool)"], arcOkur);
  const tur = await o.tur();
  const [toplam, bitis, kisi, kuruldu, dolu] = await Promise.all([o.turToplam(tur), o.turBitis(tur), o.katilimciSayisi(tur), o.kuruldu(), o.dolu()]);
  const v = { tur: Number(tur) + 1, toplam: Number(toplam) / 1e6, bitis: Number(bitis), kisi: Number(kisi), kuruldu, dolu };
  osOnbellek = { t: Date.now(), v };
  return v;
}
function kalan(sn) {
  const s = Math.max(0, sn - Date.now() / 1000), g = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return g > 0 ? g + "d " + h + "h" : h + "h " + m + "m";
}
function osSlayt(o) {
  const hedef = 15000, y = Math.min(100, (o.toplam / hedef) * 100);
  const baslik = o.kuruldu ? "ARCP is trading" : o.dolu ? "The presale is full" : "Round " + o.tur + " is live";
  return el("a", { sinif: "vt-one vt-os", attr: { href: "presale.html", style: "text-decoration:none;color:inherit" } }, [
    el("div", { sinif: "vt-os-et" }, [el("i"), o.kuruldu ? "ARCP · LIVE ON ARC" : "ARCP PRESALE · " + baslik.toUpperCase()]),
    el("div", { sinif: "vt-one-ad", yazi: o.kuruldu ? "ARCP is trading on Arc" : "250,000,000 ARCP for $15,000" }),
    el("div", { sinif: "vt-k", attr: { style: "margin-top:6px;font-size:14px" }, yazi: o.kuruldu ? "The token every ARC PULSE trade buys and burns. Stake it for USDC." :
      "$10 to $250 per wallet. Every dollar goes into the pool as locked liquidity. Not filled in 30 days: everyone is refunded." }),
    o.kuruldu ? null : el("div", { sinif: "vt-os-cubuk" }, [el("i", { attr: { style: "width:" + Math.max(1.5, y) + "%" } })]),
    o.kuruldu ? null : el("div", { sinif: "vt-one-stat" }, [
      el("div", {}, ["Raised", el("b", { yazi: (o.toplam > 0 ? para(o.toplam) : "$0") + " of $15K" })]),
      el("div", {}, ["Buyers", el("b", { yazi: String(o.kisi) })]),
      el("div", {}, ["Ends in", el("b", { veri: { bitis: o.bitis }, yazi: kalan(o.bitis) })]),
      el("div", {}, ["Presale price", el("b", { yazi: "$0.00006" })]),
    ]),
    el("span", { sinif: "vt-os-dugme", yazi: o.kuruldu ? "Buy ARCP" : "Join the presale" }),
  ]);
}

/* ---- Elysium launchpads, measured here: the busiest v4 pools (GeckoTerminal), each pool's hook from its
   Initialize record on Elysium's PoolManager, volume summed per hook. Hook names are the ones identified
   from the launchpads' own tokens (e/acc on Ascend, TESTICLES on Montra, VOLTA on Volta). ---- */
const ELY_PM = "0xe2e105d3f7209a9da11f83ccf3e7398a753823f1";
const ELY_INIT = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";   // Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)
const ELY_HOOK = { "0xe0def4221b9840a610d4e7d55812a79a6431a8ec": "Ascend", "0x6b1216a40b65c83e9c9e18a562c446697b8cf8ec": "Montra", "0x3ab88ddc3cf2a012af88b60828edb4553697e5dc": "Volta" };
let elyOnbellek = null;
async function elysiumLaunchpadlari() {
  if (elyOnbellek && Date.now() - elyOnbellek.t < 300_000) return elyOnbellek.v;
  const havuz = [];
  for (let s = 1; s <= 3; s++) {
    const r = await fetch(GECKO + "/networks/elysium/pools?sort=h24_volume_usd_desc&page=" + s, { headers: { accept: "application/json" } }).catch(() => null);
    if (!r || !r.ok) { if (havuz.length) break; throw new Error("The market data service is busy, try again in a minute."); }
    const j = await r.json();
    for (const p of j.data || []) if (p.relationships.dex.data.id === "uniswap-v4-elysium")
      havuz.push({ id: p.attributes.address.toLowerCase(), ad: p.attributes.name.split(" / ")[0], hacim: Number((p.attributes.volume_usd || {}).h24 || 0) });
  }
  const r = await fetch(ELYSIUM.rpc, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ address: ELY_PM, fromBlock: "0x0", toBlock: "latest", topics: [ELY_INIT, havuz.map((h) => h.id)] }] }) }).then((x) => x.json());
  if (!r.result) throw new Error("Elysium's chain record did not answer, try again in a minute.");
  const hook = new Map(r.result.map((l) => [l.topics[1].toLowerCase(), ("0x" + l.data.slice(2 + 152, 2 + 192)).toLowerCase()]));
  const g = new Map();
  for (const h of havuz) {
    const k = hook.get(h.id) || "?";
    if (!g.has(k)) g.set(k, { hook: k, ad: /^0x0+$/.test(k) ? "Plain Uniswap v4 pools" : ELY_HOOK[k] || "Unnamed launchpad", hacim: 0, n: 0, ornek: [] });
    const x = g.get(k); x.hacim += h.hacim; x.n++; if (x.ornek.length < 3 && !x.ornek.includes(h.ad)) x.ornek.push(h.ad);
  }
  const v = { havuz: havuz.length, satirlar: [...g.values()].filter((x) => x.hook !== "?").sort((a, b) => b.hacim - a.hacim) };
  elyOnbellek = { t: Date.now(), v };
  return v;
}

/* ---- buy box -------------------------------------------------------- */
const evmler = () => [...AGLAR, ELYSIUM].filter((a) => /^0x/.test(a.dolar || ""));
const dolarHam = (ag, usd) => BigInt(Math.round(usd * 1e6)) * 10n ** BigInt(ag.anahtar === "bsc" ? 12 : 0);
async function makbuz(ag, hash) {
  for (let i = 0; i < 160; i++) {
    const r = await rpcPost(ag, { jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null);
    if (r && r.result) return Number(r.result.status);
    await new Promise((x) => setTimeout(x, 2500));
  }
  throw new Error("No receipt yet for " + hash + " on " + ag.ad + ". Do NOT pay again; check it in an explorer first.");
}

function alKutusu(t) {
  const perde = el("div", { sinif: "vt-perde", on: { click: (e) => { if (e.target === perde) perde.remove(); } } });
  /* a chain relay cannot route to: the token's facts and its chart on its own chain, no payment form */
  if (!t.zincir.relay) {
    perde.append(el("div", { sinif: "vt-modal" }, [
      el("button", { sinif: "dugme dugme--sade", attr: { type: "button", style: "float:right" }, yazi: "✕", on: { click: () => perde.remove() } }),
      el("div", { sinif: "vt-one-ust" }, [resim(t), el("div", {}, [el("div", { sinif: "vt-ad", attr: { style: "font-size:20px" }, yazi: t.ad }),
        el("div", { sinif: "vt-k" }, ["$" + t.sembol, el("span", { sinif: "vt-zincir", yazi: t.zincir.ad })])])]),
      el("div", { sinif: "vt-ozet" }, [
        el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: "Price" }), el("b", { yazi: para(t.fiyat) })]),
        el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: "Market cap" }), el("b", { yazi: para(t.fdv) })]),
        el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: "24h" }), yuzde(t.degisim)]),
        el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: "24h volume" }), el("b", { yazi: para(t.hacim) })]),
        el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: "Liquidity" }), el("b", { yazi: para(t.likidite) })]),
      ]),
      el("div", { sinif: "vt-uyari", yazi: "Buying " + t.zincir.ad + " tokens from another chain is not available yet: no cross-chain route reaches " + t.zincir.ad + " today. Trade it on " + t.zincir.ad + " itself; we add the route as soon as one exists." }),
      el("a", { sinif: "dugme dugme--marka", attr: { href: "https://www.geckoterminal.com/" + t.zincir.gecko + "/pools/" + t.havuz, target: "_blank", rel: "noopener noreferrer", style: "width:100%;margin-top:14px;justify-content:center" }, yazi: "Open the chart on " + t.zincir.ad + " ↗" }),
    ]));
    document.body.append(perde);
    return;
  }
  const ben = cuzdan.hesap();
  const kaynak = el("select", {}, evmler().map((a) => el("option", { attr: { value: a.anahtar, selected: a.anahtar === (t.zincir.k === "solana" ? "base" : t.zincir.k) ? true : null }, yazi: a.ad + " · " + (a.dolarSembol || "USDC") })));
  if (!evmler().some((a) => a.anahtar === kaynak.value)) kaynak.value = "base";
  const tutar = el("input", { attr: { type: "number", min: "1", step: "1", value: "20" } });
  const solAlici = el("input", { attr: { placeholder: "Your Solana address", autocomplete: "off" } });
  const ozet = el("div", { sinif: "vt-ozet" }, [el("div", {}, ["Enter an amount"])]);
  const durum = el("div", { sinif: "vt-durum" });
  const dugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button", style: "width:100%;margin-top:14px" }, yazi: ben ? "Buy " + t.sembol : "Connect wallet" });
  let sonTeklif = null, sayac = 0;

  const ag = () => evmler().find((a) => a.anahtar === kaynak.value);
  const alici = () => t.zincir.k === "solana" ? solAlici.value.trim() : (cuzdan.hesap() || UCRET_ALICI);
  async function teklif() {
    const bu = ++sayac;
    const usd = Number(tutar.value);
    sonTeklif = null;
    if (!(usd >= 1)) { temizle(ozet).append(el("div", {}, ["At least $1"])); return; }
    if (t.zincir.k === "solana" && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solAlici.value.trim())) { temizle(ozet).append(el("div", {}, ["Enter the Solana address that receives the token"])); return; }
    temizle(ozet).append(el("div", {}, ["Finding the route…"]));
    const kim = cuzdan.hesap() || UCRET_ALICI;
    try {
      const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        user: kim, recipient: alici(), originChainId: ag().id, destinationChainId: t.zincir.relay, originCurrency: ag().dolar,
        destinationCurrency: t.adres, amount: dolarHam(ag(), usd).toString(), tradeType: "EXACT_INPUT", refundTo: kim,
        appFees: [{ recipient: UCRET_ALICI, fee: UCRET_BPS }] }) }).then((x) => x.json());
      if (bu !== sayac) return;
      if (!q.details) { temizle(ozet).append(el("div", {}, ["No route right now: " + (q.message || "try another amount")])); return; }
      sonTeklif = q;
      const d = q.details, f = q.fees || {};
      const satir = (a, b) => el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: a }), el("b", { yazi: b })]);
      temizle(ozet).append(
        satir("You pay", d.currencyIn.amountFormatted + " " + d.currencyIn.currency.symbol + " on " + ag().ad),
        satir("You get", "~" + Number(d.currencyOut.amountFormatted).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + t.sembol + " on " + t.zincir.ad),
        satir("Worth", para(d.currencyOut.amountUsd)),
        satir("ARC PULSE fee (0.5%)", para(f.app && f.app.amountUsd)),
        el("div", { sinif: "vt-k", attr: { style: "display:block;padding-top:2px" }, yazi: "0.20% buys and burns ARCP · 0.15% developer pool · 0.10% marketing · 0.05% founder" }),
        satir("Network + route", para(Number((f.relayer && f.relayer.amountUsd) || 0) + Number((f.gas && f.gas.amountUsd) || 0))),
        satir("Time", "~" + (d.timeEstimate || 1) + "s"));
    } catch (e) { if (bu === sayac) temizle(ozet).append(el("div", {}, ["Route service unavailable"])); }
  }
  let zaman = null;
  const yeniden = () => { clearTimeout(zaman); zaman = setTimeout(teklif, 400); };
  for (const x of [kaynak, tutar, solAlici]) x.addEventListener("input", yeniden);
  kaynak.addEventListener("change", yeniden);

  dugme.addEventListener("click", async () => {
    if (dugme._mesgul) return;
    dugme._mesgul = true; dugme.disabled = true;
    try {
      if (!cuzdan.hesap()) { await cuzdan.bagla(); dugme.textContent = "Buy " + t.sembol; await teklif(); return; }
      await teklif();
      const q = sonTeklif;
      if (!q) { durum.textContent = "No route to send."; return; }
      for (const adim of q.steps) for (const it of adim.items || []) {
        if (adim.kind !== "transaction") continue;
        durum.textContent = (adim.id === "approve" ? "Approve " : "Pay ") + q.details.currencyIn.amountFormatted + " " + q.details.currencyIn.currency.symbol + " in your wallet…";
        const d = it.data;
        const h = await cuzdan.agdaGonder(ag(), { to: d.to, data: d.data, value: "0x" + BigInt(d.value || 0).toString(16) });
        if ((await makbuz(ag(), h)) !== 1) throw new Error("Reverted: " + h);
      }
      durum.textContent = "Paid. relay.link buys " + t.sembol + " on " + t.zincir.ad + " and delivers it, usually within a minute.";
    } catch (e) { durum.textContent = (e && (e.shortMessage || e.message)) || "Could not send."; }
    finally { dugme._mesgul = false; dugme.disabled = false; }
  });

  const kapat = el("button", { sinif: "dugme dugme--sade", attr: { type: "button", style: "float:right" }, yazi: "✕", on: { click: () => perde.remove() } });
  perde.append(el("div", { sinif: "vt-modal" }, [
    kapat,
    el("div", { sinif: "vt-one-ust" }, [resim(t), el("div", {}, [el("div", { sinif: "vt-ad", attr: { style: "font-size:20px" }, yazi: t.ad }),
      el("div", { sinif: "vt-k" }, ["$" + t.sembol, el("span", { sinif: "vt-zincir", yazi: t.zincir.ad })])])]),
    el("div", { sinif: "vt-ozet" }, [
      el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: "Price" }), el("b", { yazi: para(t.fiyat) })]),
      el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: "Market cap" }), el("b", { yazi: para(t.fdv) })]),
      el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: "24h" }), yuzde(t.degisim)]),
      el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: "24h volume" }), el("b", { yazi: para(t.hacim) })]),
      el("div", {}, [el("span", { attr: { style: "opacity:.7" }, yazi: "Liquidity" }), el("b", { yazi: para(t.likidite) })]),
    ]),
    Date.now() - Date.parse(t.kuruldu) < 86_400_000
      ? el("div", { sinif: "vt-uyari", yazi: "New pool, opened " + once(t.kuruldu) + ". New tokens are risky: check the chart and who holds the supply before you buy." }) : null,
    el("label", { yazi: "Pay from" }), kaynak,
    el("label", { yazi: "Amount (USD)" }), tutar,
    el("div", { sinif: "vt-hizli" }, [10, 20, 50, 100].map((v) => el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "$" + v, on: { click: () => { tutar.value = v; teklif(); } } }))),
    t.zincir.k === "solana" ? el("label", { yazi: "Deliver to (Solana)" }) : null, t.zincir.k === "solana" ? solAlici : null,
    ozet, dugme, durum,
    el("div", { sinif: "vt-k", attr: { style: "margin-top:12px" } }, [
      "Routed by relay.link. ", el("a", { attr: { href: "https://www.geckoterminal.com/" + t.zincir.gecko + "/pools/" + t.havuz, target: "_blank", rel: "noopener noreferrer" }, yazi: "Chart ↗" })]),
  ]));
  document.body.append(perde);
  teklif();
}

/* ---- page ----------------------------------------------------------- */
/** The hottest tokens on our chains as a strip of cards (Discover shows it); a tap opens the buy box. */
export async function trendSeridi(adet = 6) {
  if (!document.getElementById("vt-stil")) document.head.append(el("style", { attr: { id: "vt-stil" }, yazi: STIL }));
  const d = await veri(null);
  const trend = d.trend.filter((t) => t.likidite >= ESIK).slice(0, adet);
  if (!trend.length) return null;
  return el("div", { sinif: "vt-trend" }, trend.map((t) => el("div", { sinif: "vt-sat", on: { click: () => alKutusu(t) } }, [
    resim(t), el("div", { attr: { style: "min-width:0" } }, [el("div", { sinif: "vt-ad" }, [t.ad, el("span", { sinif: "vt-zincir", yazi: t.zincir.ad })]),
      el("div", { sinif: "vt-k" }, [para(t.fdv) + " ", yuzde(t.degisim)])])])));
}

export async function ciz() {
  if (!document.getElementById("vt-stil")) document.head.append(el("style", { attr: { id: "vt-stil" }, yazi: STIL }));
  const kap = el("div", {});
  const govde = el("div", {});
  let secili = null, mod = "token";
  /* the showcase's slide survives the 45 s refresh; hovering holds it */
  let heroNo = 0, heroDur = false;
  const heroGoster = (i) => {
    const s = govde.querySelectorAll(".vt-slayt"), n = govde.querySelectorAll(".vt-noktalar button");
    if (!s.length) return;
    heroNo = ((i % s.length) + s.length) % s.length;
    s.forEach((x, j) => x.classList.toggle("acik", j === heroNo));
    n.forEach((x, j) => x.classList.toggle("acik", j === heroNo));
  };

  const modlar = el("div", { sinif: "vt-mod", attr: { role: "tablist" } });
  const modCiz = () => {
    temizle(modlar);
    for (const [m, ad] of [["token", "Tokens"], ["lp", "Launchpads"]]) modlar.append(el("button", { attr: { type: "button", "aria-pressed": String(mod === m) }, yazi: ad,
      on: { click: () => { if (mod === m) return; mod = m; if (mod === "token" && secili && !secili.gecko) secili = null; modCiz(); cipCiz(); yukle(); } } }));
  };
  const cipler = el("div", { sinif: "vt-cipler" });
  const cipCiz = () => {
    temizle(cipler);
    for (const z of [null, ...ZINCIRLER, ...(mod === "lp" ? LP_EK : [])]) cipler.append(el("button", { sinif: "vt-cip", attr: { type: "button", "aria-pressed": String(z === secili) }, yazi: z ? z.ad : "All chains",
      on: { click: () => { secili = z; cipCiz(); yukle(); } } }));
  };

  /* one draw at a time; a chain or tab picked while one runs is drawn right after it (not dropped),
     and a draw for a choice that changed meanwhile is discarded (sira) */
  let yukleniyor = false, bekleyen = null, sira = 0;
  async function yukle(sessiz = false) {
    if (yukleniyor) { if (!sessiz || bekleyen === null) bekleyen = sessiz; return; }
    yukleniyor = true;
    const bu = ++sira;
    try { await (mod === "lp" ? lpCiz(sessiz, bu) : ciz2(sessiz, bu)); } finally {
      yukleniyor = false;
      if (bekleyen !== null) { const s = bekleyen; bekleyen = null; yukle(s); }
    }
  }
  const eski = (bu) => bu !== sira || bekleyen !== null;
  async function elysiumLpCiz(sessiz, bu) {
    if (!sessiz) temizle(govde).append(el("div", { sinif: "vt-alt", yazi: "Measuring Elysium launchpads from the chain…" }));
    let v;
    try { v = await elysiumLaunchpadlari(); } catch (e) { if (!sessiz && !eski(bu)) temizle(govde).append(el("div", { sinif: "vt-alt", yazi: e.message })); return; }
    if (eski(bu)) return;
    const toplam = v.satirlar.reduce((s, p) => s + p.hacim, 0);
    const bas = el("div", { sinif: "vt-lp-sat" }, [el("span", { yazi: "#" }), el("span"), el("span", { yazi: "Launchpad" }), el("span", { yazi: "Example tokens" }),
      el("span", { sinif: "r", yazi: "Volume 24h" }), el("span", { sinif: "r", yazi: "Pools" }), el("span", { sinif: "r", yazi: "Share" })]);
    const satir = (p, i) => el("div", { sinif: "vt-lp-sat" }, [el("span", { sinif: "vt-k", yazi: String(i + 1) }),
      ikonYok({ adres: p.hook, sembol: p.ad.replace(/[^A-Za-z]/g, "").slice(0, 3) || "?" }),
      el("div", { attr: { style: "min-width:0" } }, [el("div", { sinif: "vt-ad", yazi: p.ad }), el("div", { sinif: "vt-k", yazi: /^0x0+$/.test(p.hook) ? "no launchpad hook" : p.hook.slice(0, 8) + "…" + p.hook.slice(-4) })]),
      el("div", { sinif: "vt-lp-z" }, p.ornek.map((x) => el("span", { yazi: x }))),
      el("b", { sinif: "r", yazi: para(p.hacim) }), el("span", { sinif: "r", yazi: String(p.n) }), el("span", { sinif: "r", yazi: toplam ? (p.hacim / toplam * 100).toFixed(1) + "%" : "—" })]);
    temizle(govde).append(
      el("div", { sinif: "vt-lp-ozet" }, [
        el("div", {}, [el("span", { sinif: "vt-k", yazi: "24h volume, top pools" }), el("b", { yazi: para(toplam) })]),
        el("div", {}, [el("span", { sinif: "vt-k", yazi: "Pools measured" }), el("b", { yazi: String(v.havuz) })]),
        v.satirlar[0] ? el("div", {}, [el("span", { sinif: "vt-k", yazi: "#1 on Elysium" }), el("b", { yazi: v.satirlar[0].ad })]) : null,
      ]),
      el("div", { sinif: "vt-lp" }, [bas, ...v.satirlar.slice(0, 30).map(satir)]),
      el("p", { sinif: "vt-k", attr: { style: "margin-top:10px" }, yazi: "Measured by ARC PULSE: the busiest Uniswap v4 pools on Elysium (GeckoTerminal), each traced on chain to the launchpad hook that created it (the pool's Initialize record). Named where the hook is known; a launchpad that deploys one hook per token shows up as several rows. DefiLlama does not track Elysium launchpads yet." }));
  }
  async function lpCiz(sessiz, bu) {
    if (secili && secili.k === "elysium") return elysiumLpCiz(sessiz, bu);   // measured here: DefiLlama has no Elysium launchpads
    if (secili && !secili.llama) {
      temizle(govde).append(bos(secili.ad + " launchpads are not tracked yet", "DefiLlama does not publish launchpad volumes for " + secili.ad + " yet, so they cannot be ranked here honestly. Its tokens are live in the Tokens tab, buyable from any chain."));
      return;
    }
    if (!sessiz) temizle(govde).append(el("div", { sinif: "vt-alt", yazi: "Loading launchpad volumes…" }));
    let lp, biz;
    try { [lp, biz] = await Promise.all([lpVeri(), (!secili || secili.k === "arc") ? bizimHacim() : Promise.resolve(0)]); }
    catch (e) { if (!sessiz && !eski(bu)) temizle(govde).append(el("div", { sinif: "vt-alt", yazi: e.message })); return; }
    if (eski(bu)) return;
    const anahtar = secili ? [secili.llama] : [...ZINCIRLER, ...LP_EK].map((z) => z.llama);
    const satirlar = lp.map((p) => ({ ...p, v24: topla(p.g24, anahtar), v30: topla(p.g30, anahtar),
      zincirler: Object.keys(p.g24).filter((k) => LLAMA_AD[k] && topla(p.g24, [k]) > 0).map((k) => LLAMA_AD[k]) }))
      .filter((p) => p.v24 > 0 || p.v30 > 0);
    if (!secili || secili.k === "arc") satirlar.push({ ad: "ARC PULSE", biz: true, v24: biz, v30: null, degisim: null, zincirler: ["13 chains"] });
    /* all chains: Elysium's launchpads join the ranking from our own measurement (24 h only; plain pools are not a launchpad) */
    if (!secili) {
      const ely = await elysiumLaunchpadlari().catch(() => null);
      if (ely) for (const x of ely.satirlar) if (!/^0x0+$/.test(x.hook) && x.hacim > 0)
        satirlar.push({ ad: x.ad === "Unnamed launchpad" ? "Unnamed (" + x.hook.slice(0, 6) + "…" + x.hook.slice(-4) + ")" : x.ad, v24: x.hacim, v30: null, degisim: null, zincirler: ["Elysium"] });
      if (eski(bu)) return;
    }
    satirlar.sort((a, b) => b.v24 - a.v24 || (b.v30 || 0) - (a.v30 || 0));
    const sira = satirlar.findIndex((p) => p.biz) + 1;
    const toplam = satirlar.reduce((s, p) => s + p.v24, 0);
    const lider = satirlar[0];
    const ozet = el("div", { sinif: "vt-lp-ozet" }, [
      el("div", {}, [el("span", { sinif: "vt-k", yazi: "Launchpads with volume" }), el("b", { yazi: String(satirlar.filter((p) => p.v24 > 0).length) })]),
      el("div", {}, [el("span", { sinif: "vt-k", yazi: "24h launchpad volume" }), el("b", { yazi: para(toplam) })]),
      lider ? el("div", {}, [el("span", { sinif: "vt-k", yazi: "#1 on " + (secili ? secili.ad : "our chains") }), el("b", { yazi: lider.ad })]) : null,
      sira ? el("div", {}, [el("span", { sinif: "vt-k", yazi: "ARC PULSE rank" }), el("b", { yazi: "#" + sira + " of " + satirlar.length })]) : null,
    ]);
    const bas = el("div", { sinif: "vt-lp-sat" }, [el("span", { yazi: "#" }), el("span"), el("span", { yazi: "Launchpad" }), el("span", { yazi: "Chains" }),
      el("span", { sinif: "r", yazi: "Volume 24h" }), el("span", { sinif: "r", yazi: "Volume 30d" }), el("span", { sinif: "r", yazi: "24h" })]);
    /* the top 60, and ARC PULSE always, at its real rank */
    const gosterilen = satirlar.map((p, i) => ({ ...p, no: i + 1 })).filter((p) => p.no <= 60 || p.biz);
    const govdeSat = gosterilen.map((p) => el("div", { sinif: "vt-lp-sat" + (p.biz ? " biz" : "") }, [
      el("span", { sinif: "vt-k", yazi: String(p.no) }),
      p.biz ? el("div", { sinif: "vt-ikon", attr: { style: "background:#7c5cff;width:36px;height:36px" }, yazi: "AP" })
        : (p.logo ? el("img", { attr: { src: p.logo, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : el("span")),
      el("div", { attr: { style: "min-width:0" } }, [el("div", { sinif: "vt-ad" }, [p.ad, p.biz ? el("span", { sinif: "vt-teminat", yazi: "OURS · COLLATERAL-BACKED" }) : null])]),
      el("div", { sinif: "vt-lp-z" }, p.zincirler.slice(0, 5).map((z) => el("span", { yazi: z })).concat(p.zincirler.length > 5 ? [el("span", { yazi: "+" + (p.zincirler.length - 5) })] : [])),
      el("b", { sinif: "r", yazi: p.v24 > 0 ? para(p.v24) : "$0" }),
      el("span", { sinif: "r", yazi: p.v30 == null ? "—" : para(p.v30) }),
      el("span", { sinif: "r" }, [p.degisim == null ? "—" : yuzde(p.degisim)]),
    ]));
    temizle(govde).append(ozet, el("div", { sinif: "vt-lp" }, [bas, ...govdeSat]),
      el("p", { sinif: "vt-k", attr: { style: "margin-top:10px" }, yazi: "Volumes from DefiLlama (Launchpad category), counted on " + (secili ? secili.ad : "Arc, Base, Solana, BNB, Ethereum, Arbitrum, Avalanche, Monad, HyperEVM, Robinhood, Sui and Aptos") + ". Elysium launchpads (24 h): measured by ARC PULSE from Elysium's chain records. ARC PULSE: the 24 h volume of its own pools on Arc. 24h change is the launchpad's total across all its chains." }));
  }
  async function ciz2(sessiz, bu) {
    if (!sessiz) temizle(govde).append(el("div", { sinif: "vt-alt", yazi: "Loading live markets…" }));
    let d;
    try { d = await veri(secili); } catch (e) { if (!sessiz && !eski(bu)) temizle(govde).append(el("div", { sinif: "vt-alt", yazi: e.message })); return; }
    if (eski(bu)) return;
    const trend = d.trend.filter((t) => t.likidite >= ESIK);
    const yeni = d.yeni.filter((t) => t.likidite >= ESIK_YENI).sort((a, b) => Date.parse(b.kuruldu) - Date.parse(a.kuruldu));
    if (!trend.length && !yeni.length) { temizle(govde).append(el("div", { sinif: "vt-alt", yazi: "No markets on this chain right now." })); return; }
    const ac = (t) => () => alKutusu(t);
    const tokenSlayt = (one) => el("div", { sinif: "vt-one", on: { click: ac(one) } }, [
      one.resim ? el("img", { sinif: "bg", attr: { src: one.resim, alt: "", referrerpolicy: "no-referrer" } }) : null,
      el("div", { sinif: "vt-one-ust" }, [resim(one), el("div", {}, [el("div", { sinif: "vt-one-ad", yazi: one.ad }),
        el("div", { sinif: "vt-k" }, ["$" + one.sembol, el("span", { sinif: "vt-zincir", yazi: one.zincir.ad })])])]),
      el("div", { sinif: "vt-one-stat" }, [
        el("div", {}, ["Market cap", el("b", { yazi: para(one.fdv) })]),
        el("div", {}, ["24h volume", el("b", { yazi: para(one.hacim) })]),
        el("div", {}, ["24h change", el("b", {}, [yuzde(one.degisim)])]),
        el("div", {}, ["Trades 24h", el("b", { yazi: Number(one.islem).toLocaleString("en-US") })]),
      ]),
    ]);
    /* the showcase: our presale first, then the five hottest tokens, turning every 6 s */
    const os = await onSatis().catch(() => null);
    const slaytlar = [...(os ? [osSlayt(os)] : []), ...(trend.length ? trend : yeni).slice(0, 5).map(tokenSlayt)];
    heroNo = heroNo % slaytlar.length;
    const noktalar = el("div", { sinif: "vt-noktalar" });
    const hero = el("div", { sinif: "vt-vitrin", on: { mouseenter: () => { heroDur = true; }, mouseleave: () => { heroDur = false; } } },
      [...slaytlar.map((x, i) => el("div", { sinif: "vt-slayt" + (i === heroNo ? " acik" : "") }, [x])), noktalar]);
    slaytlar.forEach((x, i) => noktalar.append(el("button", { sinif: i === heroNo ? "acik" : "", attr: { type: "button", "aria-label": "Slide " + (i + 1) },
      on: { click: (e) => { e.stopPropagation(); heroGoster(i); } } })));
    const trendIzgara = el("div", { sinif: "vt-trend" }, trend.slice(0, 12).map((t) => el("div", { sinif: "vt-sat", on: { click: ac(t) } }, [
      resim(t), el("div", { attr: { style: "min-width:0" } }, [el("div", { sinif: "vt-ad" }, [t.ad, el("span", { sinif: "vt-zincir", yazi: t.zincir.ad })]),
        el("div", { sinif: "vt-k" }, [para(t.fdv) + " ", yuzde(t.degisim)])])])));
    const kartlar = el("div", { sinif: "vt-kartlar" }, yeni.slice(0, 16).map((t) => el("div", { sinif: "vt-kart", on: { click: ac(t) } }, [
      resim(t), el("span", { sinif: "vt-rozet", veri: { zaman: t.kuruldu }, yazi: once(t.kuruldu) }),
      el("div", { sinif: "vt-kart-alt" }, [el("div", { sinif: "vt-ad", yazi: t.ad }), el("div", { sinif: "vt-k" }, [para(t.fdv), el("span", { sinif: "vt-zincir", yazi: t.zincir.ad })])])])));
    const hacimSira = [...trend, ...yeni].sort((a, b) => Number(b.hacim) - Number(a.hacim)).filter((t, i, a) => a.findIndex((x) => x.adres === t.adres) === i).slice(0, 15);
    const yan = el("aside", { sinif: "vt-yan" }, [el("div", { sinif: "vt-ad", attr: { style: "margin:0 0 8px 8px" }, yazi: "Top volume · 24h" }),
      ...hacimSira.map((t, i) => el("div", { sinif: "vt-sira", on: { click: ac(t) } }, [el("span", { sinif: "vt-k", yazi: String(i + 1) }), resim(t),
        el("div", { attr: { style: "min-width:0" } }, [el("div", { sinif: "vt-ad", yazi: t.ad }), el("div", { sinif: "vt-k", yazi: t.zincir.ad })]),
        el("div", { sinif: "r" }, [el("b", { yazi: para(t.hacim) }), el("div", {}, [yuzde(t.degisim)])])]))]);

    const bizim = (!secili || secili.k === "arc") ? await bizimTokenler().catch(() => []) : [];
    const serit = bizim.length ? [el("h2", { sinif: "vt-h2", attr: { style: "margin-top:0" } }, ["ARC PULSE launches", el("span", { sinif: "vt-teminat", yazi: "COLLATERAL-BACKED" })]),
      el("p", { sinif: "vt-alt", yazi: "One pool on Arc, a collateral basket behind every token, tradable from thirteen chains." }),
      el("div", { sinif: "vt-bizim" }, bizim.map((b) => el("a", { attr: { href: "#/merkez?t=" + b.adres } }, [ikonYok({ adres: b.adres, sembol: b.sembol || "?" }),
        el("div", {}, [el("div", { sinif: "vt-ad", yazi: b.ad }), el("div", { sinif: "vt-k", yazi: "$" + b.sembol + " · " + once(new Date(b.zaman * 1000).toISOString()) })])])))] : [];
    if (eski(bu)) return;
    temizle(govde).append(el("div", { sinif: "vt" }, [
      el("div", { attr: { style: "min-width:0" } }, [...serit, hero,
        el("h2", { sinif: "vt-h2", yazi: "Trending" }), el("p", { sinif: "vt-alt", yazi: "Moving on real volume in the last 24 hours. Tap any token to buy it from any chain." }), trendIzgara,
        el("h2", { sinif: "vt-h2", yazi: "New launches" }), el("p", { sinif: "vt-alt", yazi: secili ? "Fresh pools on " + secili.ad : "Fresh pools on every chain we reach" }), kartlar]),
      yan]));
  }

  kap.append(
    el("h1", { attr: { style: "margin:0;font-size:26px" } }, ["Market", el("span", { sinif: "vt-canli" }, [el("i"), "live"])]),
    el("p", { sinif: "vt-alt", yazi: "Every token on 11 chains in one place. Buy any of them with the dollars you hold on any chain, in one tap." }),
    modlar, cipler, govde);
  modCiz();
  cipCiz();
  yukle();
  /* live while the page is open: the market every 45 s (not while a buy box is open or the tab is hidden), the ages every second */
  const zamanlayici = setInterval(() => {
    if (!document.body.contains(kap)) { clearInterval(zamanlayici); clearInterval(saat); return; }
    if (document.hidden || document.querySelector(".vt-perde")) return;
    onbellek.clear();
    yukle(true);
  }, YENILE_MS);
  const saat = setInterval(() => {
    if (!document.body.contains(kap)) return;
    for (const r of kap.querySelectorAll(".vt-rozet[data-zaman]")) r.textContent = once(r.dataset.zaman);
    for (const r of kap.querySelectorAll("[data-bitis]")) r.textContent = kalan(Number(r.dataset.bitis));
  }, 1000);
  const donme = setInterval(() => {
    if (!document.body.contains(kap)) { clearInterval(donme); return; }
    if (!heroDur && !document.hidden) heroGoster(heroNo + 1);
  }, 6000);
  return kap;
}
