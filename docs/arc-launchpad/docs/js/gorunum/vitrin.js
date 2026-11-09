/* ===========================================================================
 * vitrin.js — Market (DEMO, 9 Nov 2026): every token on the chains relay.link
 * reaches, trending and new, and a buy box that pays from any of our EVM chains.
 *
 *   data   GeckoTerminal's public API, read by the visitor's browser (trending
 *          pools, new pools; one chain or all of them). Nothing is stored.
 *   trade  relay.link /quote: the visitor's chain dollar -> the token on its own
 *          chain, delivered to the visitor's address there (Solana: the address
 *          typed in). appFees carries the ARC PULSE fee; the split is not decided
 *          yet, so in the demo it goes to one wallet.
 * Reached at #/vitrin; not in the menus while it is a demo.
 * =========================================================================== */
import { el, temizle } from "../ui.js";
import { AGLAR } from "../aglar.js";
import { cuzdan } from "../cuzdan.js";
import { rpcPost } from "../ag-okur.js";

const GECKO = "https://api.geckoterminal.com/api/v2";
const RELAY = "https://api.relay.link";
const UCRET_BPS = "50";   // 0.5%
const UCRET_ALICI = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";   // demo: one wallet until the split is decided

/* the chains shown: GeckoTerminal's network id, relay's chain id */
const ZINCIRLER = [
  { k: "arc", ad: "Arc", gecko: "arc", relay: 5042 },
  { k: "base", ad: "Base", gecko: "base", relay: 8453 },
  { k: "solana", ad: "Solana", gecko: "solana", relay: 792703809 },
  { k: "bsc", ad: "BNB", gecko: "bsc", relay: 56 },
  { k: "ethereum", ad: "Ethereum", gecko: "eth", relay: 1 },
  { k: "arbitrum", ad: "Arbitrum", gecko: "arbitrum", relay: 42161 },
  { k: "avalanche", ad: "Avalanche", gecko: "avax", relay: 43114 },
  { k: "monad", ad: "Monad", gecko: "monad", relay: 143 },
  { k: "hyperevm", ad: "HyperEVM", gecko: "hyperevm", relay: 999 },
  { k: "robinhood", ad: "Robinhood", gecko: "robinhood", relay: 4663 },
];
const geckodan = (id) => ZINCIRLER.find((z) => z.gecko === id);

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
.vt-kart img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.vt-kart .vt-ikon{position:absolute;inset:0;width:100%;height:100%;border-radius:0;font-size:20px}
.vt-kart-alt{position:absolute;left:0;right:0;bottom:0;padding:40px 12px 12px;background:linear-gradient(transparent,rgba(0,0,0,.85))}
.vt-rozet{position:absolute;top:10px;left:10px;background:rgba(0,0,0,.6);border-radius:999px;padding:4px 9px;font-size:11px;font-weight:600}
.vt-zincir{display:inline-block;border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:2px 8px;font-size:11px;margin-left:6px}
.vt-yan{border:1px solid var(--cizgi,#2a2f3a);border-radius:16px;padding:14px;align-self:start;position:sticky;top:12px}
.vt-sira{display:grid;grid-template-columns:22px 40px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px;border:1px solid transparent;border-radius:12px;cursor:pointer}
.vt-sira .r{text-align:right;font-size:13px}
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
      kuruldu: a.pool_created_at, havuz: a.address, dex: p.relationships.dex ? p.relationships.dex.data.id : "",
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

/* ---- buy box -------------------------------------------------------- */
const evmler = () => AGLAR.filter((a) => /^0x/.test(a.dolar || ""));
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
  const ben = cuzdan.hesap();
  const kaynak = el("select", {}, evmler().map((a) => el("option", { attr: { value: a.anahtar, selected: a.anahtar === (t.zincir.k === "solana" ? "base" : t.zincir.k) ? true : null }, yazi: a.ad + " · " + (a.dolarSembol || "USDC") })));
  if (!evmler().some((a) => a.anahtar === kaynak.value)) kaynak.value = "base";
  const tutar = el("input", { attr: { type: "number", min: "1", step: "1", value: "20" } });
  const solAlici = el("input", { attr: { placeholder: "Your Solana address", autocomplete: "off" } });
  const ozet = el("div", { sinif: "vt-ozet" }, [el("div", {}, ["Enter an amount"])]);
  const durum = el("div", { sinif: "vt-durum" });
  const dugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button", style: "width:100%;margin-top:14px" }, yazi: ben ? "Buy " + t.sembol : "Connect wallet" });
  let sonTeklif = null, sayac = 0;

  const ag = () => AGLAR.find((a) => a.anahtar === kaynak.value);
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
    ]),
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
export async function ciz() {
  if (!document.getElementById("vt-stil")) document.head.append(el("style", { attr: { id: "vt-stil" }, yazi: STIL }));
  const kap = el("div", {});
  const govde = el("div", {});
  let secili = null;

  const cipler = el("div", { sinif: "vt-cipler" });
  const cipCiz = () => {
    temizle(cipler);
    for (const z of [null, ...ZINCIRLER]) cipler.append(el("button", { sinif: "vt-cip", attr: { type: "button", "aria-pressed": String(z === secili) }, yazi: z ? z.ad : "All chains",
      on: { click: () => { secili = z; cipCiz(); yukle(); } } }));
  };

  async function yukle() {
    temizle(govde).append(el("div", { sinif: "vt-alt", yazi: "Loading live markets…" }));
    let d;
    try { d = await veri(secili); } catch (e) { temizle(govde).append(el("div", { sinif: "vt-alt", yazi: e.message })); return; }
    const trend = d.trend.slice(), yeni = d.yeni.slice().sort((a, b) => Date.parse(b.kuruldu) - Date.parse(a.kuruldu));
    if (!trend.length && !yeni.length) { temizle(govde).append(el("div", { sinif: "vt-alt", yazi: "No markets on this chain right now." })); return; }
    const one = trend[0] || yeni[0];
    const ac = (t) => () => alKutusu(t);

    const hero = el("div", { sinif: "vt-one", on: { click: ac(one) } }, [
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
    const trendIzgara = el("div", { sinif: "vt-trend" }, trend.slice(1, 13).map((t) => el("div", { sinif: "vt-sat", on: { click: ac(t) } }, [
      resim(t), el("div", { attr: { style: "min-width:0" } }, [el("div", { sinif: "vt-ad" }, [t.ad, el("span", { sinif: "vt-zincir", yazi: t.zincir.ad })]),
        el("div", { sinif: "vt-k" }, [para(t.fdv) + " ", yuzde(t.degisim)])])])));
    const kartlar = el("div", { sinif: "vt-kartlar" }, yeni.slice(0, 16).map((t) => el("div", { sinif: "vt-kart", on: { click: ac(t) } }, [
      resim(t), el("span", { sinif: "vt-rozet", yazi: once(t.kuruldu) }),
      el("div", { sinif: "vt-kart-alt" }, [el("div", { sinif: "vt-ad", yazi: t.ad }), el("div", { sinif: "vt-k" }, [para(t.fdv), el("span", { sinif: "vt-zincir", yazi: t.zincir.ad })])])])));
    const hacimSira = [...trend, ...yeni].sort((a, b) => Number(b.hacim) - Number(a.hacim)).filter((t, i, a) => a.findIndex((x) => x.adres === t.adres) === i).slice(0, 15);
    const yan = el("aside", { sinif: "vt-yan" }, [el("div", { sinif: "vt-ad", attr: { style: "margin:0 0 8px 8px" }, yazi: "Top volume · 24h" }),
      ...hacimSira.map((t, i) => el("div", { sinif: "vt-sira", on: { click: ac(t) } }, [el("span", { sinif: "vt-k", yazi: String(i + 1) }), resim(t),
        el("div", { attr: { style: "min-width:0" } }, [el("div", { sinif: "vt-ad", yazi: t.ad }), el("div", { sinif: "vt-k", yazi: t.zincir.ad })]),
        el("div", { sinif: "r" }, [el("b", { yazi: para(t.hacim) }), el("div", {}, [yuzde(t.degisim)])])]))]);

    temizle(govde).append(el("div", { sinif: "vt" }, [
      el("div", { attr: { style: "min-width:0" } }, [hero,
        el("h2", { sinif: "vt-h2", yazi: "Trending" }), el("p", { sinif: "vt-alt", yazi: "Moving on real volume in the last 24 hours. Tap any token to buy it from any chain." }), trendIzgara,
        el("h2", { sinif: "vt-h2", yazi: "New launches" }), el("p", { sinif: "vt-alt", yazi: secili ? "Fresh pools on " + secili.ad : "Fresh pools on every chain we reach" }), kartlar]),
      yan]));
  }

  kap.append(
    el("h1", { attr: { style: "margin:0;font-size:26px" } }, ["Market", el("span", { sinif: "vt-demo", yazi: "DEMO" })]),
    el("p", { sinif: "vt-alt", yazi: "Every token on 10 chains in one place. Buy any of them with the dollars you hold on any chain, in one tap." }),
    cipler, govde);
  cipCiz();
  yukle();
  return kap;
}
