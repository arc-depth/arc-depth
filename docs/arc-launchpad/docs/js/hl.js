/* ===========================================================================
 * hl.js — Hyperliquid perps: public reads, and actions signed by the visitor's own wallet
 *
 * 15 Nov 2026 (owner approved). Used by gorunum/hl-trade.js (#/perps/trade).
 *
 * WHAT IS SIGNED, AND BY WHOM
 *   Fee approval and trading-key approval are signed by the connected wallet with eth_signTypedData_v4
 *   (cuzdan.imzalaTipli); the wallet's own key never reaches the page. Two kinds, per Hyperliquid's docs and
 *   the reference SDKs (hyperliquid-python-sdk; @nktkas/hyperliquid 0.33.3, whose signing this file
 *   was checked against byte for byte, see scripts/hl-imza-dene.js):
 *     - L1 actions (order, cancel, updateLeverage): msgpack(action) + nonce (uint64 BE) + 0x00 (no
 *       vault) -> keccak256 = connectionId, signed as the "phantom agent"
 *       EIP-712 { name "Exchange", version "1", chainId 1337, verifyingContract 0x0 },
 *       Agent { source "a" (mainnet), connectionId bytes32 }.
 *     - user-signed actions (approveBuilderFee): EIP-712 { name "HyperliquidSignTransaction",
 *       version "1", chainId = signatureChainId = the chain the wallet is on, verifyingContract 0x0 },
 *       primary type "HyperliquidTransaction:ApproveBuilderFee" / "HyperliquidTransaction:ApproveAgent".
 *
 * TRADING KEY ("agent wallet", owner approved 15 Nov 2026, the way Hyperliquid's own app works)
 *   L1 actions must be signed with chainId 1337, which wallets such as MetaMask refuse. So, like
 *   app.hyperliquid.xyz, the page can create a fresh random key in this browser (ethers Wallet.createRandom),
 *   have the main wallet approve it once (approveAgent, named "ARC PULSE"), and then sign orders,
 *   cancels and leverage changes locally with it: no wallet popup per order. Hyperliquid lets an agent
 *   trade but never withdraw or transfer. The key is kept ONLY in this browser's localStorage, under the
 *   main address (hl-ajan-v1:<address>); it is never sent anywhere. "Forget this device" deletes it.
 *   Approving a new "ARC PULSE" agent replaces the previous one of that name (another device's key stops).
 *   If the visitor declines the trading key, every L1 action is signed by the main wallet instead.
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

import { keccak256, Signature, Wallet } from "../vendor/ethers.min.js";
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

/* fee tier and account mode change rarely: read them at most every 5 minutes (the account refreshes every 10 s) */
const _yavas = new Map();
function yavas(u, type) {
  const k = type + ":" + u, x = _yavas.get(k);
  if (x && Date.now() - x.t < 300000) return x.p;
  const p = bilgi({ type, user: u }).catch(() => null);
  _yavas.set(k, { t: Date.now(), p });
  return p;
}

/** Everything the account panel shows for `user`, in one round of parallel reads. */
export async function hesapOku(user) {
  const u = user.toLowerCase();
  const [ch, emirler, spot, onay, ucret, mod] = await Promise.all([
    bilgi({ type: "clearinghouseState", user: u }),
    bilgi({ type: "frontendOpenOrders", user: u }),
    bilgi({ type: "spotClearinghouseState", user: u }).catch(() => null),
    bilgi({ type: "maxBuilderFee", user: u, builder: BUILDER }).catch(() => null),
    yavas(u, "userFees"), yavas(u, "userAbstraction"),
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

/** 16 Nov 2026 (owner: "coinler nerde nasıl takip etcem"): everything an address holds on Hyperliquid, for the
 *  Portfolio page: perp positions on the main list AND on every builder-deployed (HIP-3) perp DEX, plus every spot
 *  token priced at its USDC market. Public reads only; nothing is stored. */
export async function tumVarliklar(user) {
  const u = user.toLowerCase();
  const [ch, spot, sm, dexler, mids, gecmis, emirler] = await Promise.all([
    bilgi({ type: "clearinghouseState", user: u }),
    bilgi({ type: "spotClearinghouseState", user: u }).catch(() => null),
    bilgi({ type: "spotMetaAndAssetCtxs" }).catch(() => null),
    bilgi({ type: "perpDexs" }).catch(() => []),
    bilgi({ type: "allMids" }).catch(() => ({})),
    bilgi({ type: "portfolio", user: u }).catch(() => null),
    bilgi({ type: "frontendOpenOrders", user: u }).catch(() => []),
  ]);
  /* profit and loss over 24 h / 7 d / 30 d / all time: Hyperliquid's own pnlHistory (last minus first point) */
  const kz = {};
  for (const [ad, v] of gecmis || []) { const l = (v && v.pnlHistory) || []; if (l.length) kz[ad] = Number(l[l.length - 1][1]) - Number(l[0][1]); }
  const poz = (c, dex) => (c && c.assetPositions || []).map((x) => x.position).filter((p) => Number(p.szi) !== 0).map((p) => ({ ...p, dex }));
  let pozisyonlar = poz(ch, "");
  let perpDeger = Number(ch.marginSummary.accountValue) || 0;
  const ekDex = (dexler || []).filter((d) => d && d.name);
  const ek = await Promise.all(ekDex.map((d) => bilgi({ type: "clearinghouseState", user: u, dex: d.name }).catch(() => null)));
  ek.forEach((c, i) => { if (!c) return; pozisyonlar = pozisyonlar.concat(poz(c, ekDex[i].name)); perpDeger += Number(c.marginSummary.accountValue) || 0; });
  /* spot price of each token: its pair against USDC (token 0) */
  const fiyat = new Map([[0, 1]]);
  if (sm) {
    const [meta, ctx] = sm;
    for (const p of meta.universe || []) if (p.tokens[1] === 0 && ctx[p.index] && !fiyat.has(p.tokens[0])) fiyat.set(p.tokens[0], Number(ctx[p.index].markPx) || Number(ctx[p.index].midPx) || null);
  }
  const spotlar = ((spot && spot.balances) || []).filter((b) => Number(b.total) > 0).map((b) => {
    const f = fiyat.get(b.token);
    const miktar = Number(b.total);
    return { coin: b.coin, miktar, kilitli: Number(b.hold || 0), fiyat: f == null ? null : f, deger: f == null ? null : miktar * f, maliyet: Number(b.entryNtl || 0) };
  }).sort((a, b) => (b.deger || 0) - (a.deger || 0));
  for (const p of pozisyonlar) { const m = Number(mids[p.coin]); p.mark = m || Math.abs(Number(p.positionValue) / Number(p.szi)); }
  return { perpDeger, cekilebilir: Number(ch.withdrawable) || 0, pozisyonlar, spotlar, kz, emirler: emirler || [], spotDeger: spotlar.reduce((t, x) => t + (x.deger || 0), 0) };
}

/** Mid prices of every perp, fresh, just before an order is priced. */
export const ortaFiyatlar = () => bilgi({ type: "allMids" });
/** Best bid and ask of a market (for checking that a changed limit price would not fill at once). */
export const enIyiFiyatlar = (coin) => bilgi({ type: "l2Book", coin }).then((k) => ({ alis: Number(k.levels[0][0] && k.levels[0][0].px), satis: Number(k.levels[1][0] && k.levels[1][0].px) }));

export const kaldiracOku = (user, coin) => bilgi({ type: "activeAssetData", user: user.toLowerCase(), coin }).catch(() => null);

/** Recent fills (Hyperliquid keeps the latest 2000 here), newest first. */
export const dolgularOku = (user) => bilgi({ type: "userFills", user: user.toLowerCase() }).then((x) => (x || []).sort((a, b) => b.time - a.time));
/** Funding payments between two times (ms), newest first. */
export const fonlamaOku = (user, bas, bit) => bilgi({ type: "userFunding", user: user.toLowerCase(), startTime: bas, endTime: bit }).then((x) => (x || []).sort((a, b) => b.time - a.time));

/** APPROXIMATE liquidation price of a new position, Hyperliquid's formula
      liq = price - side * margin_available / size / (1 - l * side),  l = 1 / (2 * maxLeverage)
    margin_available: isolated = the margin put up minus maintenance; cross = account value minus the
    maintenance of this position (other positions ignored, so it is rough with other cross positions).
    Returns null when the position cannot be liquidated at this size (long: <= 0). */
export function liqTahmin({ px, boyut, alis, kal, capraz, hesapDegeri, maxKal }) {
  const side = alis ? 1 : -1, l = 1 / (2 * maxKal), notional = px * boyut;
  const bakim = notional * l;
  const marj = (capraz ? hesapDegeri : notional / kal) - bakim;
  const liq = px - side * marj / boyut / (1 - l * side);
  return liq > 0 && isFinite(liq) ? liq : null;
}

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

const CEK_TIP = { "HyperliquidTransaction:Withdraw": [
  { name: "hyperliquidChain", type: "string" }, { name: "destination", type: "string" }, { name: "amount", type: "string" }, { name: "time", type: "uint64" }] };
/** Withdraw `amount` USDC to `destination` on Arbitrum (Hyperliquid's bridge; Hyperliquid keeps $1). */
export function cekEylemi(signatureChainId, destination, amount, time) {
  return { type: "withdraw3", signatureChainId, hyperliquidChain: "Mainnet", destination: destination.toLowerCase(), amount, time };
}
export function cekTipli(action) {
  return {
    domain: { name: "HyperliquidSignTransaction", version: "1", chainId: parseInt(action.signatureChainId, 16), verifyingContract: SIFIR },
    types: CEK_TIP, primaryType: "HyperliquidTransaction:Withdraw",
    message: { hyperliquidChain: action.hyperliquidChain, destination: action.destination, amount: action.amount, time: action.time },
  };
}
export const CEK_UCRETI = 1;   // Hyperliquid's withdrawal fee, USD

const AJAN_TIP = { "HyperliquidTransaction:ApproveAgent": [
  { name: "hyperliquidChain", type: "string" }, { name: "agentAddress", type: "address" }, { name: "agentName", type: "string" }, { name: "nonce", type: "uint64" }] };
export const AJAN_ADI = "ARC PULSE";

export function ajanEylemi(signatureChainId, nonce, agentAddress) {
  return { type: "approveAgent", signatureChainId, hyperliquidChain: "Mainnet", agentAddress: agentAddress.toLowerCase(), agentName: AJAN_ADI, nonce };
}
export function ajanTipli(action) {
  return {
    domain: { name: "HyperliquidSignTransaction", version: "1", chainId: parseInt(action.signatureChainId, 16), verifyingContract: SIFIR },
    types: AJAN_TIP, primaryType: "HyperliquidTransaction:ApproveAgent",
    message: { hyperliquidChain: action.hyperliquidChain, agentAddress: action.agentAddress, agentName: action.agentName, nonce: action.nonce },
  };
}

/* ---- the trading key on this device --------------------------------- */
const ajanYeri = (user) => "hl-ajan-v1:" + user.toLowerCase();
/** This device's trading key for `user` (an ethers Wallet), or null. */
export function ajanOku(user) {
  try { const j = JSON.parse(localStorage.getItem(ajanYeri(user)) || "null"); if (j && j.anahtar) return new Wallet(j.anahtar); } catch (e) { /* storage blocked or bad entry */ }
  return null;
}
export function ajanSil(user) { try { localStorage.removeItem(ajanYeri(user)); } catch (e) { /* storage blocked */ } }
/** Is `ajan` an approved, unexpired agent of `user` on Hyperliquid right now? (extraAgents) */
export async function ajanGecerliMi(user, ajan) {
  const liste = await bilgi({ type: "extraAgents", user: user.toLowerCase() });
  const a = (liste || []).find((x) => (x.address || "").toLowerCase() === ajan.address.toLowerCase());
  return !!a && (a.validUntil == null || a.validUntil > Date.now());
}

/* ---- actions (key order matters: it is hashed) ----------------------- */

/** One order line. tif "Gtc"/"Ioc" = limit; tetik { px, tpsl: "tp"|"sl" } = a market trigger (TP/SL). */
export function emirSatiri({ a, alis, px, sz, azalt, tif, tetik }) {
  const t = tetik ? { trigger: { isMarket: true, triggerPx: tetik.px, tpsl: tetik.tpsl } } : { limit: { tif } };
  return { a, b: !!alis, p: px, s: sz, r: !!azalt, t };
}
/** An order action: lines in Hyperliquid's order (parent first, then TP, then SL), every one with the builder fee. */
export function emirlerEylemi(satirlar, grouping = "na") {
  return { type: "order", orders: satirlar.map(emirSatiri), grouping, builder: { b: BUILDER, f: BUILDER_F } };
}
export function emirEylemi(e) { return emirlerEylemi([e], "na"); }
/** Change an open limit order's price / size (the builder fee of the original applies: checked on a real fill 15 Nov 2026).
    Hyperliquid refuses a modify whose new price would fill at once (it is placed post-only) and the original
    order is then gone, so the page checks the book first. */
export const duzenleEylemi = (oid, e) => ({ type: "modify", oid, order: emirSatiri(e) });
/** Trigger (TP/SL market) limit price: 10% through the trigger in the closing direction, like Hyperliquid's app,
    so the market order it becomes can fill. */
export const tetikLimit = (tetikPx, alis, szDec) => fiyatYaz(tetikPx * (alis ? 1.1 : 0.9), szDec);
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
  let r;
  try {
    r = await fetch(API + "/exchange", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, nonce, signature: { r: s.r, s: s.s, v: s.v } }), signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    /* the request may or may not have arrived: never say "nothing happened" here */
    throw new Error("Could not reach Hyperliquid (" + ((e && e.message) || e) + "). It may or may not have been received: check your open orders and positions below before trying again.");
  }
  const j = await r.json().catch(() => null);
  if (!j) throw new Error("Hyperliquid answered HTTP " + r.status);
  if (j.status !== "ok") throw new Error("Hyperliquid: " + (typeof j.response === "string" ? j.response : JSON.stringify(j.response || j)));
  return j.response;
}

/** Sign an L1 action and send it: with this device's trading key `ajan` when given (no popup),
    otherwise with the connected wallet. A trading key Hyperliquid no longer knows -> code "AJAN_YOK". */
export async function l1Gonder(action, ajan = null) {
  const nonce = nonceAl();
  sonEylem = { action, nonce, ajan: ajan ? ajan.address : null };
  const t = l1Tipli(action, nonce);
  let sig;
  if (ajan) sig = await ajan.signTypedData(t.domain, t.types, t.message);
  else { try { sig = await cuzdan.imzalaTipli(t); } catch (e) { throw imzaHatasi(e); } }
  try { return await gonder(action, nonce, sig); }
  catch (e) {
    if (ajan && /does not exist|not.{0,20}(agent|api wallet)|agent.{0,20}(expired|not found)/i.test(e.message)) throw Object.assign(new Error("This device's trading key is no longer approved on Hyperliquid. Enable trading again to create a new one. Nothing was placed."), { code: "AJAN_YOK" });
    throw e;
  }
}

const zincirHex = () => {
  const z = cuzdan.zincirId();
  if (!z) throw new Error("The wallet did not say which network it is on");
  return "0x" + parseInt(z, 16).toString(16);
};

/** Create a trading key on this device and have the main wallet approve it (approveAgent). The key is
    stored (localStorage, under the main address) only after Hyperliquid accepted the approval. */
export async function ajanOnayla(user) {
  const yeni = Wallet.createRandom();
  const action = ajanEylemi(zincirHex(), nonceAl(), yeni.address);
  sonEylem = { action, nonce: action.nonce };
  let sig;
  try { sig = await cuzdan.imzalaTipli(ajanTipli(action)); } catch (e) { throw imzaHatasi(e); }
  await gonder(action, action.nonce, sig);
  try { localStorage.setItem(ajanYeri(user), JSON.stringify({ anahtar: yeni.privateKey, adres: yeni.address, t: Date.now() })); }
  catch (e) { /* storage blocked: the key lives only in this tab */ }
  return new Wallet(yeni.privateKey);
}

/** Withdraw `miktar` (decimal string) from the perps balance to the SAME address on Arbitrum. Main wallet signs. */
export async function cekGonder(user, miktar) {
  const action = cekEylemi(zincirHex(), user, miktar, nonceAl());
  sonEylem = { action, nonce: action.time };
  let sig;
  try { sig = await cuzdan.imzalaTipli(cekTipli(action)); } catch (e) { throw imzaHatasi(e); }
  return gonder(action, action.time, sig);
}

/** The one-time approval of the 0.05% builder fee, signed on the chain the wallet is on.
    oran "0%" withdraws the approval (revoke). */
export async function builderOnayla(oran = BUILDER_YUZDE) {
  const action = onayEylemi(zincirHex(), nonceAl(), oran);
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
  /* TP / SL lines after the parent (normalTpsl): their own status, never hidden */
  const ek = yanit.data.statuses.slice(1);
  const ekHata = ek.find((x) => x && x.error);
  const ekYazi = !ek.length ? "" : ekHata ? " TP/SL NOT set: " + ekHata.error + " (set it from the Positions table)." : " TP/SL set (" + ek.length + ").";
  if (st.filled) return "Filled " + st.filled.totalSz + " " + coin + " at $" + Number(st.filled.avgPx).toLocaleString("en-US", { maximumSignificantDigits: 6 }) + "." + ekYazi;
  if (st.resting) return "Order placed on the book (order " + st.resting.oid + ")." + ekYazi;
  return "Hyperliquid accepted the order." + ekYazi;
}
