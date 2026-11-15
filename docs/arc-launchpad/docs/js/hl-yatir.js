/* ===========================================================================
 * hl-yatir.js — deposit into the visitor's OWN Hyperliquid perps account from any EVM chain, via relay.link
 *
 * 15 Nov 2026 (owner approved, #/perps/trade v2). Same pattern as designs/uzak-alim.js:
 *   quote (POST api.relay.link/quote) -> checked here -> the visitor's wallet sends relay's steps on the
 *   paying chain (approve of the exact amount, then the deposit) -> follow /intents/status/v2 until done.
 * Destination: Hyperliquid (relay chain id 1337), currency 0x000…0 (32 hex zeros) = USDC in the perps
 * balance, recipient = the paying address itself. The quote is refused when relay names any other
 * recipient, another destination, a step on another chain, or an approval larger than the amount.
 * Nothing about the visitor is kept; ARC PULSE takes no fee on deposits.
 * =========================================================================== */

import { AGLAR, ELYSIUM } from "./aglar.js";

export const RELAY = "https://api.relay.link";
export const HL_ZINCIR = 1337;
export const HL_USDC = "0x00000000000000000000000000000000";
const SIFIR = "0x0000000000000000000000000000000000000000";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/* paying chains: the site's EVM chains, each with its dollar token; `yerel` = the gas token is also offered */
export const KAYNAKLAR = [
  { id: 5042, ad: "Arc", para: "0x3600000000000000000000000000000000000000", sembol: "USDC", ond: 6, yerel: null },   // Arc's gas token IS USDC
  { id: 42161, ad: "Arbitrum", para: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", sembol: "USDC", ond: 6, yerel: "ETH" },
  { id: 8453, ad: "Base", para: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", sembol: "USDC", ond: 6, yerel: "ETH" },
  { id: 1, ad: "Ethereum", para: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", sembol: "USDC", ond: 6, yerel: "ETH" },
  { id: 56, ad: "BNB Chain", para: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", sembol: "USDC", ond: 18, yerel: "BNB" },
  { id: 43114, ad: "Avalanche", para: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", sembol: "USDC", ond: 6, yerel: "AVAX" },
  { id: 143, ad: "Monad", para: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", sembol: "USDC", ond: 6, yerel: "MON" },
  { id: 999, ad: "HyperEVM", para: "0xb88339CB7199b77E23DB6E890353E22632Ba630f", sembol: "USDC", ond: 6, yerel: "HYPE" },
  { id: 4663, ad: "Robinhood", para: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", sembol: "USDG", ond: 6, yerel: "ETH" },
  { id: 99901, ad: "Elysium", para: "0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65", sembol: "USDCe", ond: 6, yerel: "HYPE" },
];
export const kaynakBul = (id) => KAYNAKLAR.find((k) => k.id === Number(id)) || null;
const agBul = (id) => AGLAR.find((a) => a.id === id) || (id === ELYSIUM.id ? ELYSIUM : null);

/** amount as a decimal string -> base units (BigInt), never through floating point */
export function birime(miktar, ond) {
  const m = String(miktar).trim();
  if (!/^\d+(\.\d+)?$/.test(m)) throw new Error("Enter an amount like 25 or 25.5");
  const [t, k = ""] = m.split(".");
  return BigInt(t) * 10n ** BigInt(ond) + BigInt((k + "0".repeat(ond)).slice(0, ond) || "0");
}

/** A checked relay quote: `miktar` (decimal string) of the chain's dollar token, or its gas token when `yerel`. */
export async function teklif(k, kullanici, miktar, yerel = false) {
  const ond = yerel ? 18 : k.ond;
  const tutar = birime(miktar, ond);
  if (tutar <= 0n) throw new Error("Enter an amount above zero");
  const govde = { user: kullanici, recipient: kullanici, originChainId: k.id, destinationChainId: HL_ZINCIR,
    originCurrency: yerel ? SIFIR : k.para, destinationCurrency: HL_USDC, amount: tutar.toString(), tradeType: "EXACT_INPUT", refundTo: kullanici };
  const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde), signal: AbortSignal.timeout(20000) }).then((x) => x.json()).catch(() => null);
  if (!q || !q.steps) throw new Error("relay.link has no route from " + (yerel ? k.yerel : k.sembol) + " on " + k.ad + " to Hyperliquid right now: " + ((q && q.message) || "try again in a minute") + ".");
  const d = q.details || {};
  if (!d.recipient || d.recipient.toLowerCase() !== kullanici.toLowerCase()) throw new Error("relay's quote names another recipient. Nothing was sent.");
  const giris = d.currencyIn && d.currencyIn.currency;
  if (giris && giris.decimals != null && Number(giris.decimals) !== ond) throw new Error("relay reports a different token precision than expected. Nothing was sent.");
  const cur = d.currencyOut && d.currencyOut.currency;
  if (!cur || Number(cur.chainId) !== HL_ZINCIR || String(cur.address).toLowerCase() !== HL_USDC) throw new Error("relay's quote does not deliver Hyperliquid perps USDC. Nothing was sent.");
  for (const s of q.steps) {
    if (s.kind !== "transaction") throw new Error("relay asked for a step this page does not run (" + s.kind + "). Nothing was sent.");
    for (const it of s.items || []) {
      if (!it.data) continue;
      if (Number(it.data.chainId) !== k.id) throw new Error("relay returned a step on chain " + it.data.chainId + " instead of " + k.ad + ". Nothing was sent.");
      if (s.id === "approve") {
        const veri = String(it.data.data || "");
        const izin = veri.startsWith("0x095ea7b3") && veri.length >= 138 ? BigInt("0x" + veri.slice(74, 138)) : null;
        if (izin == null || izin > tutar) throw new Error("relay asked for a larger token approval than the amount. Nothing was sent.");
      }
    }
  }
  const f = q.fees || {};
  const usd = (x) => Number((x && x.amountUsd) || 0);
  const ond8 = Number(cur.decimals || 8);
  return {
    q, k, yerel,
    odenen: (d.currencyIn && d.currencyIn.amountFormatted) || miktar,
    odenenUsd: Number((d.currencyIn && d.currencyIn.amountUsd) || 0),
    alinan: Number(d.currencyOut.amountFormatted || 0),
    enAz: Number(d.currencyOut.minimumAmount || 0) / 10 ** ond8,
    ucret: usd(f.relayer) + usd(f.app) + usd(f.gas),
    sure: Number(d.timeEstimate || 0),
    bakiye: d.userBalance != null ? Number(d.userBalance) / 10 ** ond : null,
    istekId: q.steps.map((s) => s.requestId).find(Boolean) || null,
  };
}

async function makbuz(ag, h, durum) {
  for (let i = 0; i < 120; i++) {
    const r = await fetch(ag.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [h] }) }).then((x) => x.json()).catch(() => null);
    if (r && r.result) { if (r.result.status !== "0x1") throw new Error("The transaction failed on " + ag.ad + ": " + h); return r.result; }
    if (i === 10 && durum) durum("Still waiting for " + ag.ad + " to confirm " + h.slice(0, 12) + "…");
    await bekle(2500);
  }
  throw new Error("No receipt yet for " + h + " on " + ag.ad + ". It may still go through: do NOT send again. Check it in an explorer first, then reload.");
}

/** Send relay's steps from the visitor's wallet (switching it to the paying chain), then follow the
    request until Hyperliquid has the USDC. Returns the relay.link tracking address. */
export async function ode(t, { cuzdan, durum }) {
  const ag = agBul(t.k.id);
  if (!ag) throw new Error("Unknown chain " + t.k.ad + ".");
  const ad = t.yerel ? t.k.yerel : t.k.sembol;
  for (const s of t.q.steps) for (const it of s.items || []) {
    if (!it.data || it.status === "complete") continue;
    durum((s.id === "approve" ? "Approve " + t.odenen + " " + ad + " for relay.link" : "Send " + t.odenen + " " + ad + " (≈ $" + t.odenenUsd.toFixed(2) + ")") + " on " + t.k.ad + " in your wallet…");
    const h = await cuzdan.agdaGonder(ag, { to: it.data.to, data: it.data.data, value: "0x" + BigInt(it.data.value || 0).toString(16) });
    durum("Sent on " + t.k.ad + ". Waiting for it to confirm…");
    await makbuz(ag, h, durum);
  }
  const id = t.istekId;
  if (!id) return null;
  const izle = "https://relay.link/transaction/" + id;
  for (let i = 0; i < 120; i++) {
    const d = await fetch(RELAY + "/intents/status/v2?requestId=" + id, { signal: AbortSignal.timeout(15000) }).then((x) => x.json()).catch(() => ({}));
    if (d.status === "success") return izle;
    if (d.status === "failure" || d.status === "refund" || d.status === "refunded")
      throw new Error("relay.link could not deliver to Hyperliquid (" + d.status + "); it refunds to your wallet on " + t.k.ad + ". Details: " + izle);
    durum("Sent on " + t.k.ad + ". relay.link is delivering the USDC to your Hyperliquid account… (" + izle + ")…");
    await bekle(5000);
  }
  return izle;
}
