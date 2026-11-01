/* ===========================================================================
 * designs/irys.js — permanent storage paid by the designer's own wallet
 *
 * WHY IRYS (checked 1 Nov 2026)
 *   The Irys uploader (uploader.irys.xyz) takes ANS-104 data items signed by
 *   an Ethereum wallet and charges a balance the wallet funded itself by
 *   sending tokens to the uploader's deposit address. No API key, no account,
 *   no server of ours: the wallet that signs is the account. Files are served
 *   at gateway.irys.xyz/<id>. Arc is not a funding chain on Irys, so uploads
 *   are paid in ETH on Base (token "base-eth"); a designer needs a little ETH
 *   on Base (an upload of a few MB costs fractions of a cent to cents —
 *   the page shows the uploader's own quote before anything is paid).
 *   IPFS pinning services (Pinata, Storacha, Lighthouse…) need an account,
 *   an API key or an email, so they are offered only as "I uploaded it
 *   myself" (paste the URI).
 *
 * WHAT THIS FILE DOES (no SDK: ~150 lines instead of a 1 MB bundle)
 *   - ANS-104 data item, Ethereum signature type 3: the signed message is the
 *     SHA-384 deep hash of the item's fields, signed with personal_sign; the
 *     owner is the wallet's 65-byte public key, recovered from one signature.
 *     (Same bytes as @irys/bundles' InjectedEthereumSigner; checked against
 *     that library by scripts/designs-site-sim.mjs.)
 *   - price, balance, funding (a Base transfer from the wallet, then the
 *     uploader is told the transaction id) — paid either with ETH the wallet
 *     already has on Base, or from Arc USDC through relay.link (fonlaArcUsdc) —,
 *     upload, GraphQL lookup.
 * =========================================================================== */
import { SigningKey, hashMessage, getBytes, hexlify, computeAddress } from "../../vendor/ethers.min.js";

export const IRYS = {
  uploader: "https://uploader.irys.xyz",
  gateway: "https://gateway.irys.xyz",
  token: "base-eth",
  uygulama: "ARC-PULSE-Designs"
};

export const irysUrl = (id) => IRYS.gateway + "/" + id;

/* ---- ANS-104 ---- */
const enc = new TextEncoder();
const birlestir = (parcalar) => {
  const n = parcalar.reduce((s, p) => s + p.length, 0);
  const o = new Uint8Array(n);
  let i = 0;
  for (const p of parcalar) { o.set(p, i); i += p.length; }
  return o;
};
const sha384 = async (u8) => new Uint8Array(await crypto.subtle.digest("SHA-384", u8));

export async function derinHash(veri) {
  if (Array.isArray(veri)) {
    let acc = await sha384(birlestir([enc.encode("list"), enc.encode(String(veri.length))]));
    for (const p of veri) acc = await sha384(birlestir([acc, await derinHash(p)]));
    return acc;
  }
  const etiket = birlestir([enc.encode("blob"), enc.encode(String(veri.byteLength))]);
  return sha384(birlestir([await sha384(etiket), await sha384(veri)]));
}

/* Avro: zigzag varint longs, strings as length + utf8 */
function avroUzun(n, out) {
  let z = n >= 0 ? n * 2 : -n * 2 - 1;
  do { let b = z & 0x7f; z = Math.floor(z / 128); if (z) b |= 0x80; out.push(b); } while (z);
}
export function etiketBayt(etiketler) {
  if (!etiketler.length) return new Uint8Array(0);
  const out = [];
  avroUzun(etiketler.length, out);
  for (const { name, value } of etiketler) {
    for (const s of [name, value]) { const b = enc.encode(s); avroUzun(b.length, out); out.push(...b); }
  }
  avroUzun(0, out);
  return new Uint8Array(out);
}
const le = (n, boy) => { const o = new Uint8Array(boy); let v = BigInt(n); for (let i = 0; i < boy; i++) { o[i] = Number(v & 0xffn); v >>= 8n; } return o; };

/**
 * Build and sign a data item. `imzaci` = { sahip: Uint8Array(65), imzala: async (Uint8Array) => hex sig }.
 */
export async function veriOgesi(veri, etiketler, imzaci) {
  const sahip = imzaci.sahip;
  const capa = crypto.getRandomValues(new Uint8Array(32));
  const tb = etiketBayt(etiketler);
  const imzaVerisi = await derinHash([enc.encode("dataitem"), enc.encode("1"), enc.encode("3"), sahip, new Uint8Array(0), capa, tb, veri]);
  const sig = getBytes(await imzaci.imzala(imzaVerisi));
  if (sig.length !== 65) throw new Error("Unexpected signature length " + sig.length);
  return birlestir([le(3, 2), sig, sahip, new Uint8Array([0]), new Uint8Array([1]), capa, le(etiketler.length, 8), le(tb.length, 8), tb, veri]);
}

/* ---- the wallet as an Irys signer ---- */
const _sahipler = new Map();
/** {sahip, imzala} for the connected wallet. The public key comes from one signature (once per page load). */
export async function cuzdanImzacisi(cuzdan, imzalaFn) {
  const ben = cuzdan.hesap().toLowerCase();
  let sahip = _sahipler.get(ben);
  if (!sahip) {
    const m = "ARC PULSE Designs\nConnect this wallet to Irys storage (reads your public key; sends nothing)\nWallet: " + ben;
    const sig = await imzalaFn(m);
    sahip = getBytes(SigningKey.recoverPublicKey(hashMessage(m), sig));
    if (computeAddress(hexlify(sahip)).toLowerCase() !== ben) throw new Error("Could not read this wallet's public key.");
    _sahipler.set(ben, sahip);
  }
  return { sahip, imzala: (u8) => imzalaFn(u8) };
}

/* ---- uploader API ---- */
async function jsonAl(url, secenek) {
  const r = await fetch(url, secenek);
  if (!r.ok) throw new Error("Irys " + r.status + ": " + (await r.text().catch(() => "")).slice(0, 200));
  return r.json();
}
export async function fiyat(bayt) {
  const r = await fetch(IRYS.uploader + "/price/" + IRYS.token + "/" + Math.max(1, bayt));
  if (!r.ok) throw new Error("Irys price " + r.status);
  return BigInt((await r.text()).trim());
}
export async function bakiye(adres) {
  const j = await jsonAl(IRYS.uploader + "/account/balance/" + IRYS.token + "?address=" + adres);
  return BigInt(j.balance || 0);
}
export async function yatirmaAdresi() {
  const j = await jsonAl(IRYS.uploader + "/info");
  const a = j && j.addresses && j.addresses[IRYS.token];
  if (!/^0x[0-9a-fA-F]{40}$/.test(a || "")) throw new Error("Irys did not report a deposit address for " + IRYS.token + ".");
  return a;
}

/** Fund the Irys balance with `wei` ETH on Base from the wallet; returns the Base tx hash. */
export async function fonla(cuzdan, wei, durum) {
  const { AGLAR } = await import("../aglar.js");
  const base = AGLAR.find((a) => a.anahtar === "base");
  const hedef = await yatirmaAdresi();
  durum("Confirm in your wallet: " + (Number(wei) / 1e18).toFixed(8) + " ETH on Base to the Irys deposit address " + hedef.slice(0, 8) + "…");
  const h = await cuzdan.agdaGonder(base, { to: hedef, value: "0x" + wei.toString(16) });
  durum("Sent on Base. Waiting for it to confirm…");
  for (let i = 0; i < 60; i++) {
    const r = await fetch(base.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [h] }) }).then((x) => x.json()).catch(() => null);
    if (r && r.result) { if (r.result.status !== "0x1") throw new Error("The Base transfer failed: " + h); break; }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  durum("Telling Irys about the deposit…");
  for (let i = 0; i < 20; i++) {
    const r = await fetch(IRYS.uploader + "/account/balance/" + IRYS.token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx_id: h }) }).catch(() => null);
    if (r && (r.ok || r.status === 202)) break;
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  return h;
}

/* ---- paying from Arc USDC (owner, 1 Nov 2026: no ETH on Base needed) ----
   Irys credits a deposit to the address that SENT it (the balance belongs to the signer of
   the uploads), so relay cannot pay the deposit address directly: relay's solver would be the
   sender. Instead relay.link turns the designer's Arc USDC into ETH delivered to the designer's
   OWN address on Base (EXACT_OUTPUT: the deposit plus a little Base gas), and the designer's
   wallet then sends that ETH to the Irys deposit address and the uploader is told the tx id
   (POST /account/balance/base-eth {tx_id}). One flow on the page: approve + deposit on Arc
   (relay), then one Base transfer. */
const RELAY = "https://api.relay.link";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const BASE_GAZ = 10_000_000_000_000n;   // 0.00001 ETH kept for the Base transfer's gas (a Base transfer costs far less)

async function baseAg() { const { AGLAR } = await import("../aglar.js"); return AGLAR.find((a) => a.anahtar === "base"); }
async function baseBakiye(adres) {
  const b = await baseAg();
  const r = await fetch(b.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [adres, "latest"] }) }).then((x) => x.json()).catch(() => null);
  return r && r.result ? BigInt(r.result) : 0n;
}

/** relay's quote for `wei` of ETH on the wallet's Base address, paid in Arc USDC. Returns {q, usdc (number), eksik} or null when Base already holds enough. */
export async function usdcTeklifi(ben, wei) {
  const var_ = await baseBakiye(ben);
  const eksik = wei + BASE_GAZ - var_;
  if (eksik <= 0n) return null;
  const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    user: ben, recipient: ben, originChainId: 5042, destinationChainId: 8453, originCurrency: ARC_USDC,
    destinationCurrency: "0x0000000000000000000000000000000000000000", amount: eksik.toString(), tradeType: "EXACT_OUTPUT", refundTo: ben }) }).then((x) => x.json());
  if (!q.steps) throw new Error("relay.link has no route from Arc USDC to Base ETH right now: " + (q.message || "try again"));
  return { q, usdc: Number(q.details.currencyIn.amountFormatted), eksik };
}

/** Fund the Irys balance with `wei` from Arc USDC (relay) and one Base transfer. `beklenenUsdc`: the cost shown; a quote 3% above it is not paid. */
export async function fonlaArcUsdc(cuzdan, wei, durum, beklenenUsdc) {
  const ben = cuzdan.hesap();
  const t = await usdcTeklifi(ben, wei);
  if (t) {
    if (beklenenUsdc && t.usdc > beklenenUsdc * 1.03) throw new Error("The storage price moved: now " + t.usdc.toFixed(4) + " USDC instead of " + beklenenUsdc.toFixed(4) + ". Nothing was paid; press again to see the new total.");
    const { AGLAR } = await import("../aglar.js");
    const arc = AGLAR.find((a) => a.anahtar === "arc");
    durum("Storage: " + t.usdc.toFixed(4) + " USDC from Arc → " + (Number(t.eksik) / 1e18).toFixed(6) + " ETH on your Base address (relay.link). Confirm in your wallet…");
    for (const adim of t.q.steps) for (const it of adim.items || []) {
      if (adim.kind !== "transaction" || !it.data) continue;
      if (Number(it.data.chainId || 5042) !== 5042) throw new Error("Unexpected relay step on chain " + it.data.chainId + ".");
      const h = await cuzdan.agdaGonder(arc, { to: it.data.to, data: it.data.data, value: "0x" + BigInt(it.data.value || 0).toString(16) });
      durum("Sent on Arc (" + adim.id + "). Waiting…");
      const { makbuz } = await import("./sozlesme.js");
      await makbuz(h, durum);
    }
    const id = (t.q.steps || []).map((x) => x.requestId).find(Boolean);
    for (let i = 0; i < 72; i++) {
      const d = id ? await fetch(RELAY + "/intents/status/v2?requestId=" + id).then((x) => x.json()).catch(() => ({})) : {};
      if (d.status === "failure" || d.status === "refund" || d.status === "refunded") throw new Error("relay could not deliver the ETH on Base (" + d.status + "); it refunds to your address. relay.link/transaction/" + id);
      if ((await baseBakiye(ben)) >= wei + BASE_GAZ / 2n) break;
      durum("Waiting for relay to deliver the ETH on Base… (relay.link/transaction/" + id + ")");
      await new Promise((r) => setTimeout(r, 5000));
      if (i === 71) throw new Error("The ETH has not arrived on Base yet. Nothing is lost: follow relay.link/transaction/" + id + " and press again when it has.");
    }
  }
  return fonla(cuzdan, wei, durum);
}

/** Upload bytes as a signed data item. Returns {id, url}. */
export async function yukle(veri, etiketler, imzaci) {
  const ogeler = [{ name: "App-Name", value: IRYS.uygulama }, { name: "App-Version", value: "1" }, ...etiketler];
  const oge = await veriOgesi(veri, ogeler, imzaci);
  const j = await jsonAl(IRYS.uploader + "/tx/" + IRYS.token, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: oge });
  if (!j || !j.id) throw new Error("Irys did not return an id.");
  return { id: j.id, url: irysUrl(j.id) };
}

/** Irys GraphQL: items of this app with the given tags, newest first. */
export async function ara(etiketler, { sahipler, adet = 20 } = {}) {
  const t = [{ name: "App-Name", values: [IRYS.uygulama] }, ...etiketler.map((x) => ({ name: x.name, values: [x.value] }))];
  const q = "query($t:[TagFilter!],$o:[String!],$n:Int){transactions(tags:$t,owners:$o,limit:$n,order:DESC){edges{node{id address timestamp tags{name value}}}}}";
  const j = await jsonAl(IRYS.uploader + "/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q, variables: { t, o: sahipler || null, n: adet } }) });
  if (j.errors) throw new Error("Irys search: " + JSON.stringify(j.errors).slice(0, 200));
  return ((j.data && j.data.transactions && j.data.transactions.edges) || []).map((e) => e.node);
}
