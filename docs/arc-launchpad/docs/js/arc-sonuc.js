/* ===========================================================================
 * arc-sonuc.js — what actually happened on Arc after a payment
 *
 * A launch page must not say "launched" because a transaction succeeded:
 * LaunchEmaneti refunds inside a successful transaction when the launch
 * itself fails, and relay's own transaction on Arc is the one that holds
 * the new token. These helpers read the receipt (through the spare Arc
 * RPCs) and pull out the token address or the refund.
 * =========================================================================== */
import { Interface } from "../vendor/ethers.min.js";
import { YedekliOkur } from "./yedekli-okur.js";

const OLAY = new Interface([
  "event MerkezLaunch(address indexed token, address vekil, bytes32 kurucu, uint32 kurucuZincir, uint256 kurucuToken)",
  "event Islendi(uint32 kaynakZincir, bytes32 gonderen, address token, uint256 net, uint256 iade)",
]);
const SIFIR = "0x0000000000000000000000000000000000000000";
let okur = null;
const arc = () => (okur ||= new YedekliOkur());

/// The receipt of `hash` on Arc, waiting up to ~`sn` seconds; null if it has not landed by then.
export async function arcMakbuz(hash, sn = 300) {
  for (let i = 0; i < Math.ceil(sn / 2.5); i++) {
    const m = await arc().getTransactionReceipt(hash).catch(() => null);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}

/// The token a MerkezKapi launch made, from its receipt's logs (null if none).
export function launchTokeni(makbuz) {
  for (const l of (makbuz && makbuz.logs) || []) {
    try { const o = OLAY.parseLog(l); if (o && o.name === "MerkezLaunch") return o.args.token; } catch (_) { /* another contract's log */ }
  }
  return null;
}

/// LaunchEmaneti.isle's outcome: { token, net, iade } (token null when the launch failed and was refunded).
export function emanetSonucu(makbuz) {
  for (const l of (makbuz && makbuz.logs) || []) {
    try {
      const o = OLAY.parseLog(l);
      if (o && o.name === "Islendi") return { token: o.args.token === SIFIR ? null : o.args.token, net: o.args.net, iade: o.args.iade };
    } catch (_) { /* another contract's log */ }
  }
  return null;
}

/// relay's transaction(s) on Arc for a finished request, newest last.
export async function relayArcHashleri(requestId) {
  const d = await fetch("https://api.relay.link/intents/status/v2?requestId=" + requestId, { signal: AbortSignal.timeout(15_000) }).then((x) => x.json()).catch(() => ({}));
  return Array.isArray(d.txHashes) ? d.txHashes : [];
}

/// The new token from a finished relay request, or null when it cannot be read.
export async function relayLaunchTokeni(requestId) {
  for (const h of (await relayArcHashleri(requestId)).reverse()) {
    const t = launchTokeni(await arcMakbuz(h, 60));
    if (t) return t;
  }
  return null;
}

/// A short "where is my token" line with links: trade on this site, Arc explorer.
export function tokenBaglantilari(token) {
  return "Token: " + token + "  ·  trade: " + location.origin + location.pathname + "#merkez?t=" + token + "  ·  explorer: https://explorer.arc.io/address/" + token;
}
