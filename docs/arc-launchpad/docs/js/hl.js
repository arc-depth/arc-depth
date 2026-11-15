/* ===========================================================================
 * hl.js — Hyperliquid perps: public reads, and actions signed by the visitor's own wallet
 *
 * 15 Nov 2026 (owner approved). Used by gorunum/hl-trade.js (#/perps/trade).
 *
 * WHAT IS SIGNED, AND BY WHOM
 *   Every action is signed by the connected wallet with eth_signTypedData_v4 (cuzdan.imzalaTipli).
 *   The page never creates, receives or stores a private key. Two kinds, per Hyperliquid's docs and
 *   the reference SDKs (hyperliquid-python-sdk; @nktkas/hyperliquid 0.33.3, whose signing this file
 *   was checked against byte for byte, see scripts/hl-imza-dene.js):
 *     - L1 actions (order, cancel, updateLeverage): msgpack(action) + nonce (uint64 BE) + 0x00 (no
 *       vault) -> keccak256 = connectionId, signed as the "phantom agent"
 *       EIP-712 { name "Exchange", version "1", chainId 1337, verifyingContract 0x0 },
 *       Agent { source "a" (mainnet), connectionId bytes32 }.
 *     - user-signed actions (approveBuilderFee): EIP-712 { name "HyperliquidSignTransaction",
 *       version "1", chainId = signatureChainId = the chain the wallet is on, verifyingContract 0x0 },
 *       primary type "HyperliquidTransaction:ApproveBuilderFee".
 *   Some wallets (MetaMask among them) refuse an EIP-712 signature whose chainId is not the chain they
 *   are on, so they refuse the L1 (chainId 1337) signature; that refusal is reported plainly
 *   (code "IMZA_ZINCIR") and nothing is sent.
 *
 * BUILDER FEE
 *   Every order placed here carries builder { b: project wallet, f: 50 } = 0.05% of the order's
 *   notional, on top of Hyperliquid's own fee, charged in USDC by Hyperliquid and credited to the
 *   project wallet's referral rewards. The visitor approves it once ("0.05%") and can revoke it.
 *   Fee policy (ARC PULSE product rule): builder fee income is split 40% ARCP burn / 30% development /
 *   20% marketing / 10% founder. Accounting is manual for now; no payout code exists or is built here.
 * =========================================================================== */

import { keccak256, Signature } from "../vendor/ethers.min.js";
import { cuzdan } from "./cuzdan.js";

export const API = "https://api.hyperliquid.xyz";
export const BUILDER = "0x89189c84dc95d0520aeec9c8cf3ba5b9d42611d0";   // lowercase, as the API wants it
export const BUILDER_F = 50;                 // tenths of a basis point: 50 = 0.05% (perps maximum is 100)
export const BUILDER_YUZDE = "0.05%";        // the string the visitor approves
export const BUILDER_ORAN = 0.0005;
export const KAYMA = 0.01;                   // market order = IOC limit 1% through the mark price
export const EN_AZ_USD = 10;                 // Hyperliquid's minimum order value
const SIFIR = "0x0000000000000000000000000000000000000000";

/* ---- reads ---------------------------------------------------------- */

export async function bilgi(govde) {
  const r = await fetch(API + "/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("Hyperliquid answered HTTP " + r.status);
  return r.json();
}

/** Every listed perp on the main order book (delisted ones dropped), with its live context. */
export async function piyasalar() {
  const [meta, ctx] = await bilgi({ type: "metaAndAssetCtxs" });
  return meta.universe.map((u, i) => {
    const c = ctx[i] || {};
    return {
      ad: u.name, i, szDec: u.szDecimals, maxKal: u.maxLeverage,
      yalnizIzole: !!(u.onlyIsolated || u.marginMode === "strictIsolated" || u.marginMode === "noCross"),
      silindi: !!u.isDelisted,
      mark: Number(c.markPx), mid: c.midPx != null ? Number(c.midPx) : null, dun: Number(c.prevDayPx),
      hacim: Number(c.dayNtlVlm), fon: Number(c.funding), oi: Number(c.openInterest) * Number(c.markPx),
    };
  }).filter((p) => !p.silindi && p.mark > 0);
}

export function mumlar(coin, aralik, sureMs) {
  const bitis = Date.now();
  return bilgi({ type: "candleSnapshot", req: { coin, interval: aralik, startTime: bitis - sureMs, endTime: bitis } });
}

/** Everything the account panel shows for `user`, in one round of parallel reads. */
export async function hesapOku(user) {
  const u = user.toLowerCase();
  const [ch, emirler, spot, onay, ucret, mod] = await Promise.all([
    bilgi({ type: "clearinghouseState", user: u }),
    bilgi({ type: "frontendOpenOrders", user: u }),
    bilgi({ type: "spotClearinghouseState", user: u }).catch(() => null),
    bilgi({ type: "maxBuilderFee", user: u, builder: BUILDER }).catch(() => null),
    bilgi({ type: "userFees", user: u }).catch(() => null),
    bilgi({ type: "userAbstraction", user: u }).catch(() => null),
  ]);
  const usdc = spot && (spot.balances || []).find((b) => b.coin === "USDC");
  return {
    deger: Number(ch.marginSummary.accountValue), cekilebilir: Number(ch.withdrawable), teminat: Number(ch.marginSummary.totalMarginUsed),
    pozisyonlar: (ch.assetPositions || []).map((x) => x.position).filter((p) => Number(p.szi) !== 0),
    emirler: emirler || [],
    spotUsdc: usdc ? Number(usdc.total) - Number(usdc.hold || 0) : 0,
    onay: onay == null ? null : Number(onay),            // tenths of a bp the visitor has approved for us
    alici: ucret ? Number(ucret.userCrossRate) : 0.00045, // the visitor's own taker rate
    yapici: ucret ? Number(ucret.userAddRate) : 0.00015,  // and maker rate
    /* "unifiedAccount" / "portfolioMargin": spot balances back perps too, so the perps figures alone
       do not say what the visitor can trade with; the page then leaves that check to Hyperliquid */
    birlesik: mod === "unifiedAccount" || mod === "portfolioMargin",
  };
}

/** Mid prices of every perp, fresh, just before an order is priced. */
export const ortaFiyatlar = () => bilgi({ type: "allMids" });

export const kaldiracOku = (user, coin) => bilgi({ type: "activeAssetData", user: user.toLowerCase(), coin }).catch(() => null);

/* ---- number rules (tick and lot size) ------------------------------- */

const yalin = (s) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s) || "0";

/** A price as Hyperliquid accepts it: at most 5 significant figures and 6 - szDecimals decimals
    (whole numbers always allowed), trailing zeros removed. */
export function fiyatYaz(px, szDec) {
  if (!(px > 0) || !isFinite(px)) throw new Error("Price must be above zero");
  const ond = Math.max(0, 6 - szDec);
  let p = Number(px.toPrecision(5));
  p = Number(p.toFixed(ond));
  if (!(p > 0)) throw new Error("Price is too small for this market");
  return yalin(p.toFixed(ond));
}

/** A size rounded DOWN to the market's szDecimals (never more than asked), trailing zeros removed. */
export function boyutYaz(sz, szDec) {
  const k = 10 ** szDec;
  const s = Math.floor(sz * k + 1e-9) / k;
  return yalin(s.toFixed(szDec));
}

/* ---- msgpack (the subset Hyperliquid actions use) -------------------- */
/* Same encoding as @std/msgpack 1.0.3 as used by @nktkas/hyperliquid: smallest int form, integers at or
   above 2^32 as uint64, map keys in insertion order, undefined keys dropped. */
function mp(x, o) {
  if (x === null) { o.push(0xc0); return; }
  if (x === false) { o.push(0xc2); return; }
  if (x === true) { o.push(0xc3); return; }
  if (typeof x === "number") {
    if (!Number.isInteger(x)) throw new Error("msgpack: non-integer number in an action");
    if (x < 0) {
      if (x >= -32) { o.push(x & 0xff); return; }
      if (x >= -128) { o.push(0xd0, x & 0xff); return; }
      if (x >= -32768) { o.push(0xd1, (x >> 8) & 0xff, x & 0xff); return; }
      if (x >= -2147483648) { o.push(0xd2, (x >> 24) & 0xff, (x >> 16) & 0xff, (x >> 8) & 0xff, x & 0xff); return; }
      throw new Error("msgpack: integer out of range");
    }
    if (x <= 0x7f) { o.push(x); return; }
    if (x < 0x100) { o.push(0xcc, x); return; }
    if (x < 0x10000) { o.push(0xcd, x >> 8, x & 0xff); return; }
    if (x < 0x100000000) { o.push(0xce, (x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff); return; }
    if (!Number.isSafeInteger(x)) throw new Error("msgpack: integer out of range");
    o.push(0xcf); u64(BigInt(x), o); return;
  }
  if (typeof x === "string") {
    const b = new TextEncoder().encode(x); const n = b.length;
    if (n < 32) o.push(0xa0 | n); else if (n < 0x100) o.push(0xd9, n); else if (n < 0x10000) o.push(0xda, n >> 8, n & 0xff); else throw new Error("msgpack: string too long");
    for (const c of b) o.push(c); return;
  }
  if (Array.isArray(x)) {
    const n = x.length;
    if (n < 16) o.push(0x90 | n); else if (n < 0x10000) o.push(0xdc, n >> 8, n & 0xff); else throw new Error("msgpack: array too long");
    for (const y of x) mp(y, o); return;
  }
  if (typeof x === "object") {
    const k = Object.keys(x).filter((a) => x[a] !== undefined); const n = k.length;
    if (n < 16) o.push(0x80 | n); else if (n < 0x10000) o.push(0xde, n >> 8, n & 0xff); else throw new Error("msgpack: map too large");
    for (const a of k) { mp(a, o); mp(x[a], o); } return;
  }
  throw new Error("msgpack: cannot encode " + typeof x);
}
function u64(b, o) { for (let i = 7; i >= 0; i--) o.push(Number((b >> BigInt(i * 8)) & 0xffn)); }
export function msgpack(x) { const o = []; mp(x, o); return Uint8Array.from(o); }

/** connectionId of an L1 action: keccak256(msgpack(action) ‖ nonce u64 BE ‖ 0x00 [no vault]). */
export function l1Ozet(action, nonce) {
  const o = Array.from(msgpack(action)); u64(BigInt(nonce), o); o.push(0);
  return keccak256(Uint8Array.from(o));
}

/* ---- typed data ------------------------------------------------------ */

export function l1Tipli(action, nonce) {
  return {
    domain: { name: "Exchange", version: "1", chainId: 1337, verifyingContract: SIFIR },
    types: { Agent: [{ name: "source", type: "string" }, { name: "connectionId", type: "bytes32" }] },
    primaryType: "Agent",
    message: { source: "a", connectionId: l1Ozet(action, nonce) },
  };
}

const ONAY_TIP = { "HyperliquidTransaction:ApproveBuilderFee": [
  { name: "hyperliquidChain", type: "string" }, { name: "maxFeeRate", type: "string" }, { name: "builder", type: "address" }, { name: "nonce", type: "uint64" }] };

export function onayEylemi(signatureChainId, nonce, oran = BUILDER_YUZDE) {
  return { type: "approveBuilderFee", signatureChainId, hyperliquidChain: "Mainnet", maxFeeRate: oran, builder: BUILDER, nonce };
}
export function onayTipli(action) {
  return {
    domain: { name: "HyperliquidSignTransaction", version: "1", chainId: parseInt(action.signatureChainId, 16), verifyingContract: SIFIR },
    types: ONAY_TIP, primaryType: "HyperliquidTransaction:ApproveBuilderFee",
    message: { hyperliquidChain: action.hyperliquidChain, maxFeeRate: action.maxFeeRate, builder: action.builder, nonce: action.nonce },
  };
}

/* ---- actions (key order matters: it is hashed) ----------------------- */

export function emirEylemi({ a, alis, px, sz, azalt, tif }) {
  return { type: "order", orders: [{ a, b: !!alis, p: px, s: sz, r: !!azalt, t: { limit: { tif } } }], grouping: "na", builder: { b: BUILDER, f: BUILDER_F } };
}
export const iptalEylemi = (a, oid) => ({ type: "cancel", cancels: [{ a, o: oid }] });
export const kaldiracEylemi = (asset, capraz, kaldirac) => ({ type: "updateLeverage", asset, isCross: !!capraz, leverage: kaldirac });

/* ---- signing and sending -------------------------------------------- */

/** The last action handed to the wallet (memory only, this tab): lets a dry-run test check the signed
    payload against the action. Never stored or sent anywhere. */
export let sonEylem = null;

let _sonNonce = 0;
const nonceAl = () => { let n = Date.now(); if (n <= _sonNonce) n = _sonNonce + 1; _sonNonce = n; return n; };

/** Turn a wallet refusal into one plain sentence, and tag the two cases the page explains. */
function imzaHatasi(e) {
  const m = String((e && (e.message || (e.data && e.data.message))) || e || "");
  if (e && (e.code === 4001 || /user (rejected|denied)|rejected the request|cancel/i.test(m))) return Object.assign(new Error("You declined the signature in your wallet. Nothing was sent."), { code: "RED" });
  if (/chain ?id/i.test(m) && /(match|active|current|mismatch)/i.test(m)) return Object.assign(new Error("Your wallet refused the signature because it only signs for the network it is on. Nothing was sent."), { code: "IMZA_ZINCIR", ham: m });
  return Object.assign(new Error(m || "The wallet could not sign"), { code: e && e.code });
}

async function gonder(action, nonce, sig) {
  const s = Signature.from(sig);
  const r = await fetch(API + "/exchange", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, nonce, signature: { r: s.r, s: s.s, v: s.v } }), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => null);
  if (!j) throw new Error("Hyperliquid answered HTTP " + r.status);
  if (j.status !== "ok") throw new Error("Hyperliquid: " + (typeof j.response === "string" ? j.response : JSON.stringify(j.response || j)));
  return j.response;
}

/** Sign an L1 action with the connected wallet and send it. */
export async function l1Gonder(action) {
  const nonce = nonceAl();
  sonEylem = { action, nonce };
  let sig;
  try { sig = await cuzdan.imzalaTipli(l1Tipli(action, nonce)); } catch (e) { throw imzaHatasi(e); }
  return gonder(action, nonce, sig);
}

/** The one-time approval of the 0.05% builder fee, signed on the chain the wallet is on.
    oran "0%" withdraws the approval (revoke). */
export async function builderOnayla(oran = BUILDER_YUZDE) {
  let zincir = cuzdan.zincirId();
  if (!zincir) throw new Error("The wallet did not say which network it is on");
  zincir = "0x" + parseInt(zincir, 16).toString(16);
  const action = onayEylemi(zincir, nonceAl(), oran);
  sonEylem = { action, nonce: action.nonce };
  let sig;
  try { sig = await cuzdan.imzalaTipli(onayTipli(action)); } catch (e) { throw imzaHatasi(e); }
  return gonder(action, action.nonce, sig);
}

/** The first status of an order response, as one plain sentence (errors thrown). */
export function emirSonucu(yanit, coin) {
  const st = yanit && yanit.data && yanit.data.statuses && yanit.data.statuses[0];
  if (!st) throw new Error("Hyperliquid returned no order status");
  if (st.error) throw new Error("Hyperliquid: " + st.error);
  if (st.filled) return "Filled " + st.filled.totalSz + " " + coin + " at $" + Number(st.filled.avgPx).toLocaleString("en-US", { maximumSignificantDigits: 6 }) + ".";
  if (st.resting) return "Order placed on the book (order " + st.resting.oid + ").";
  return "Hyperliquid accepted the order.";
}
