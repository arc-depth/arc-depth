/* ===========================================================================
 * takas-varlik.js — what a visitor can PAY with and RECEIVE in the Trade box (17 Nov 2026)
 *
 * Owner: "USDC ile ödeyeceğiz, USDC ile alacağız, ama isteyen istediği gas tokeniyle alıp satacak … yollar doğru olmalı".
 * Every chain's dollar (USDC / USDG) and its gas token (ETH, BNB, AVAX, MON, HYPE, SOL). Arc's gas IS USDC, so Arc has
 * one entry; Elysium is payment-only (no native route). Every route is relay.link's own quote (tested 17 Nov for
 * ETH/SOL/BNB/AVAX/MON/HYPE -> Solana and Base tokens, token -> ETH/BNB/SOL/USDC).
 * Balances are read from the chains for the connected addresses only; nothing is stored anywhere but this browser
 * (the last pick, a convenience). Prices: USDC = $1, gas tokens from relay.link's price API (cached a minute).
 * =========================================================================== */
import { el } from "./ui.js";
import { rpcPost } from "./ag-okur.js";

export const YEREL = "0x0000000000000000000000000000000000000000";
export const SOL_YEREL = "11111111111111111111111111111111";
export const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOL_AG = { anahtar: "solana", ad: "Solana", id: 792703809, dolar: SOL_USDC, dolarSembol: "USDC" };
const RENK = { arc: "#7c5cff", base: "#0052ff", arbitrum: "#28a0f0", ethereum: "#627eea", bsc: "#f0b90b", avalanche: "#e84142", monad: "#836ef9",
  hyperevm: "#50e3c2", robinhood: "#ccff00", elysium: "#c6f86b", solana: "#14f195" };
/* gas left untouched by "Max" so the visitor can still pay the network fee */
const YEDEK = { ethereum: 0.003, base: 0.0002, arbitrum: 0.0002, robinhood: 0.0002, bsc: 0.002, avalanche: 0.05, monad: 0.3, hyperevm: 0.01, solana: 0.01 };

/** every payable / receivable asset, dollars first */
export function varliklar(evmler) {
  const l = [];
  for (const ag of evmler) {
    l.push({ k: ag.anahtar + ":dolar", ag, adres: ag.dolar, sembol: ag.dolarSembol || "USDC", ondalik: ag.anahtar === "bsc" ? 18 : 6, dolar: true });
    if (ag.anahtar !== "arc" && !ag.sadeceOdeme && ag.gaz) l.push({ k: ag.anahtar + ":gaz", ag, adres: YEREL, sembol: ag.gaz, ondalik: 18, yerel: true });
  }
  l.push({ k: "solana:dolar", ag: SOL_AG, adres: SOL_USDC, sembol: "USDC", ondalik: 6, dolar: true });
  l.push({ k: "solana:gaz", ag: SOL_AG, adres: SOL_YEREL, sembol: "SOL", ondalik: 9, yerel: true });
  return l;
}
export const yedek = (v) => (v.yerel ? YEDEK[v.ag.anahtar] || 0 : 0);
export const renk = (v) => RENK[v.ag.anahtar] || "#7c5cff";

/** decimal string -> raw BigInt with `d` decimals (no float rounding) */
export function hamYap(s, d) {
  const m = String(s || "").trim().replace(",", ".").match(/^(\d*)(?:\.(\d*))?$/); if (!m) return 0n;
  return BigInt((m[1] || "0") + ((m[2] || "") + "0".repeat(d)).slice(0, d));
}
export function sayiYaz(ham, d, en = 6) {
  const n = Number(ham) / 10 ** d;
  return n === 0 ? "0" : n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : n >= 1 ? 4 : en, useGrouping: false });
}

const _fiyat = {};
export async function fiyat(v) {
  if (v.dolar) return 1;
  const c = _fiyat[v.k]; if (c && Date.now() - c.t < 60000) return c.p;
  try {
    const j = await fetch("https://api.relay.link/currencies/token/price/v2?chainId=" + v.ag.id + "&address=" + v.adres).then((r) => r.json());
    const p = Number(j.price); if (p > 0) { _fiyat[v.k] = { p, t: Date.now() }; return p; }
  } catch (e) { /* offline */ }
  return c ? c.p : null;
}

const SOL_RPC = "https://solana-rpc.publicnode.com";
const solRpc = (method, params) => fetch(SOL_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((r) => r.json());
const zaman = (p, ms = 8000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("t")), ms))]);

/** raw balance (BigInt) of one asset, or null when unknown / no address for that chain */
export async function bakiye(v, evmAdr, solAdr) {
  try {
    if (v.ag === SOL_AG) {
      if (!solAdr) return null;
      if (v.yerel) { const r = await zaman(solRpc("getBalance", [solAdr])); return BigInt((r.result && r.result.value) || 0); }
      /* 17 Nov 2026: the free RPC now refuses "all token accounts of an owner" (needs a paid token) and the swap card showed
         0 USDC; read the token's own account address instead, like the rest of the site (solana-ikiz.js splBakiye) */
      const m = await import("./solana-ikiz.js");
      return BigInt(await zaman(m.splBakiye(solAdr, v.adres), 12000));
    }
    if (!evmAdr) return null;
    const r = v.yerel
      ? await zaman(rpcPost(v.ag, { jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [evmAdr, "latest"] }))
      : await zaman(rpcPost(v.ag, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: v.adres, data: "0x70a08231" + evmAdr.toLowerCase().slice(2).padStart(64, "0") }, "latest"] }));
    return r && r.result && r.result !== "0x" ? BigInt(r.result) : 0n;
  } catch (e) { return null; }
}

/** the last asset picked for a role ("ode" / "al"), kept in this browser only */
export function sonSecim(rol) { try { return localStorage.getItem("arcpulse-takas-" + rol); } catch (e) { return null; } }
export function secimKaydet(rol, k) { try { localStorage.setItem("arcpulse-takas-" + rol, k); } catch (e) { /* blocked */ } }

const STIL = `
.tk-perde{position:fixed;inset:0;z-index:140;background:rgba(5,5,9,.62);display:flex;align-items:flex-end;justify-content:center}
@media (min-width:861px){.tk-perde{align-items:center}}
.tk-pencere{width:min(440px,100%);max-height:80vh;display:flex;flex-direction:column;background:var(--yuzey-1,#14141b);border:1px solid var(--cizgi-guclu);border-radius:20px;overflow:hidden}
@media (max-width:860px){.tk-pencere{border-radius:22px 22px 0 0;padding-bottom:env(safe-area-inset-bottom,0px)}}
.tk-pbas{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 6px}.tk-pbas b{font-size:16px}
.tk-pbas button{background:none;border:0;color:var(--yazi-2);font-size:22px;cursor:pointer;line-height:1}
.tk-ara{margin:6px 14px 8px;height:40px;border-radius:12px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-0);color:var(--yazi-1);padding:0 12px;font:14px var(--yazi-tipi)}
.tk-liste{overflow:auto;padding:0 6px 10px}
.tk-oge{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:12px;width:100%;padding:10px 10px;border-radius:12px;cursor:pointer}
.tk-oge:hover,.tk-oge[aria-current=true]{background:var(--yuzey-2)}
.tk-oge .tk-ad{flex:1;min-width:0}.tk-oge .tk-ad b{display:block;font-size:14.5px}.tk-oge .tk-ad small{font-size:12px;color:var(--yazi-3)}
.tk-oge .tk-bk{text-align:right;font-size:13px;font-variant-numeric:tabular-nums}.tk-oge .tk-bk small{display:block;color:var(--yazi-3);font-size:11.5px}
.tk-ikon{position:relative;width:34px;height:34px;flex:none;border-radius:50%;display:grid;place-items:center;font:800 12px var(--yazi-tipi);color:#0b0b10}
.tk-ikon i{position:absolute;right:-3px;bottom:-3px;width:15px;height:15px;border-radius:50%;border:2px solid var(--yuzey-1,#14141b);font-style:normal;font-size:7px;display:grid;place-items:center;color:#0b0b10;font-weight:800}
`;
const stilTak = () => { if (!document.getElementById("tk-stil")) document.head.append(el("style", { attr: { id: "tk-stil" }, yazi: STIL })); };
export function ikon(v, boy = 34) {
  stilTak();
  const r = renk(v);
  return el("span", { sinif: "tk-ikon", attr: { style: "width:" + boy + "px;height:" + boy + "px;background:" + (v.dolar ? "#2775ca" : r) + ";color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35)" } },
    [el("span", { attr: { style: "font-size:" + (v.dolar ? 15 : 10) + "px;position:relative;z-index:1" }, yazi: v.dolar ? "$" : v.sembol.slice(0, 4) }), el("i", { attr: { style: "background:" + r }, yazi: v.ag.ad.slice(0, 1) })]);
}

/** the picker: a sheet listing every asset with the visitor's balance, biggest first */
export function secici({ baslik, liste, bakiyeler, fiyatlar, secili, sec }) {
  stilTak();
  const ara = el("input", { sinif: "tk-ara", attr: { type: "search", placeholder: "Search: USDC, ETH, SOL, Base…", "aria-label": "Search tokens" } });
  const kutu = el("div", { sinif: "tk-liste" });
  const usd = (v) => { const b = bakiyeler[v.k], p = fiyatlar[v.k]; return b != null && p != null ? Number(b) / 10 ** v.ondalik * p : null; };
  const ciz = () => {
    const q = ara.value.trim().toLowerCase();
    const l = liste.filter((v) => !q || (v.sembol + " " + v.ag.ad).toLowerCase().includes(q))
      .sort((a, b) => (usd(b) || 0) - (usd(a) || 0) || (a.dolar === b.dolar ? 0 : a.dolar ? -1 : 1));
    kutu.replaceChildren(...l.map((v) => {
      const b = bakiyeler[v.k], u = usd(v);
      return el("button", { sinif: "tk-oge", attr: { type: "button", "aria-current": String(!!secili && secili.k === v.k) }, on: { click: () => { perde.remove(); sec(v); } } }, [
        ikon(v), el("span", { sinif: "tk-ad" }, [el("b", { yazi: v.sembol }), el("small", { yazi: "on " + v.ag.ad + (v.yerel ? " · gas token" : "") })]),
        el("span", { sinif: "tk-bk" }, b == null ? [] : [el("span", { yazi: sayiYaz(b, v.ondalik) }), el("small", { yazi: u != null ? "$" + u.toFixed(2) : "" })])]);
    }));
  };
  ara.addEventListener("input", ciz);
  const perde = el("div", { sinif: "tk-perde", attr: { role: "dialog", "aria-label": baslik } }, [el("div", { sinif: "tk-pencere" }, [
    el("div", { sinif: "tk-pbas" }, [el("b", { yazi: baslik }), el("button", { attr: { type: "button", "aria-label": "Close" }, yazi: "×", on: { click: () => perde.remove() } })]), ara, kutu])]);
  perde.addEventListener("click", (e) => { if (e.target === perde) perde.remove(); });
  ciz(); document.body.append(perde);
  return { yenile: ciz };
}
