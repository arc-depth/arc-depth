/* ===========================================================================
 * solana-ikiz.js — a Solana wallet on the one-pool platform
 *
 *   TWINS     a launch token's twin on Solana (solana/pulse-kapi, mint PDA
 *             ["ikiz", token]) is burned by `Gonder` and LayerZero carries
 *             the message to the Arc IkizHub: the tokens are released there
 *             to an Arc address, or handed with an order (sell / redeem) to
 *             the one-pool gate, which pays the dollars where the order says.
 *             The endpoint's `send` accounts are derived from the chain
 *             (docs/js/lz-solana-hesap.js); the fee is the endpoint's
 *             `quote`, simulated, never guessed.
 *   RELAY     launch and buy are paid from Solana through relay.link, which
 *             returns Solana instructions + lookup tables; the wallet signs
 *             one versioned transaction.
 * Wallets: the Wallet Standard (Phantom, Solflare, Backpack…) or the injected
 * `window.phantom.solana` / `window.solana`.
 * =========================================================================== */
import { lzHesaplari } from "./lz-solana-hesap.js";

const SOL = {
  rpc: "https://solana-rpc.publicnode.com",   // answers browsers (the public mainnet-beta RPC refuses them)
  zincir: "solana:mainnet",
  kapiProgram: "G91zXh4LCEzY7UgE3JWic3Kt5ckBsnibkgdAXABatWJQ",
  endpoint: "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6",
  arcEid: 30417,
  hub: "0xF1C0DfC647908808dACC7c64Eed1f75FEA67D2e2",   // IkizHub on Arc (dagitim-v2.json)
  /* LayerZero type 3, lzReceive 800k on Arc: the options the gate sends with (pulse-kapi Store, dagit-v2-solana.js) */
  secenek: "0x000301001101000000000000000000000000000c3500",
  /* the gate's lookup table (dagitim-v2.json solana.alt): the endpoint's accounts fit one transaction only through it */
  alt: "4Ny1wjXhrmDRnqP2rRwyZjYqePGpgVYfitGy9cwYqcTD",
  usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};
export function ayarla(d) { Object.assign(SOL, d); }

let _v = null;
const vendor = async () => (_v ||= await import("../vendor/solana.mjs"));
const hexB = (h) => Uint8Array.from((h.replace(/^0x/, "").match(/../g) || []).map((x) => parseInt(x, 16)));
const pad32 = (h) => hexB(h.replace(/^0x/, "").toLowerCase().padStart(64, "0"));

/* ---- the wallet ---- */
const _cuzdanlar = [];
function kaydet(...ws) { for (const w of ws) if (w && !_cuzdanlar.includes(w)) _cuzdanlar.push(w); return () => {}; }
if (typeof window !== "undefined") {
  window.addEventListener("wallet-standard:register-wallet", (e) => { try { e.detail({ register: kaydet }); } catch (x) { /* ignore */ } });
  try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: { register: kaydet } })); } catch (x) { /* old browser */ }
}
function solCuzdani() {
  const w = _cuzdanlar.find((x) => x.features && x.features["standard:connect"] && (x.features["solana:signAndSendTransaction"] || x.features["solana:signTransaction"]) &&
    (x.chains || []).some((c) => String(c).startsWith("solana:")));
  if (w) return { ad: w.name, standart: w };
  const eski = typeof window !== "undefined" && ((window.phantom && window.phantom.solana) || window.solana);
  if (eski) return { ad: "Phantom", eski };
  return null;
}
let _hesap = null;
export const solanaCuzdan = {
  varMi: () => !!solCuzdani(),
  hesap: () => _hesap && _hesap.address,
  async baglan() {
    const c = solCuzdani();
    if (!c) throw new Error("No Solana wallet found. Install Phantom (or any Solana wallet) and reload.");
    if (c.standart) {
      const r = await c.standart.features["standard:connect"].connect();
      _hesap = (r.accounts || c.standart.accounts)[0];
      if (!_hesap) throw new Error("The wallet shared no account.");
      return _hesap.address;
    }
    const r = await c.eski.connect();
    _hesap = { address: r.publicKey.toString(), eski: true };
    return _hesap.address;
  },
  /* sign and send a versioned transaction; returns the signature */
  async gonder(vtx) {
    const c = solCuzdani();
    if (!_hesap) await this.baglan();
    const { Connection, bs58 } = await vendor();
    const conn = new Connection(SOL.rpc, "confirmed");
    if (c.standart && c.standart.features["solana:signAndSendTransaction"]) {
      const [r] = await c.standart.features["solana:signAndSendTransaction"].signAndSendTransaction({ account: _hesap, chain: SOL.zincir, transaction: vtx.serialize() });
      return bs58.encode(r.signature);
    }
    if (c.standart) {
      const [r] = await c.standart.features["solana:signTransaction"].signTransaction({ account: _hesap, chain: SOL.zincir, transaction: vtx.serialize() });
      return conn.sendRawTransaction(r.signedTransaction, { skipPreflight: false });
    }
    const r = await c.eski.signAndSendTransaction(vtx);
    return r.signature;
  },
};

export async function onayBekle(imza) {
  const { Connection } = await vendor();
  const conn = new Connection(SOL.rpc, "confirmed");
  for (let i = 0; i < 90; i++) {
    const s = (await conn.getSignatureStatuses([imza])).value[0];
    if (s && s.err) throw new Error("Failed on Solana: " + JSON.stringify(s.err));
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return s;
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  throw new Error("No confirmation yet for " + imza);
}

async function v0(conn, odeyen, ixs, altAdresleri = []) {
  const { TransactionMessage, VersionedTransaction, PublicKey } = await vendor();
  const tablolar = [];
  for (const a of altAdresleri) { const t = (await conn.getAddressLookupTable(new PublicKey(a))).value; if (t) tablolar.push(t); }
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  return new VersionedTransaction(new TransactionMessage({ payerKey: odeyen, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(tablolar));
}

/* ---- the EVM ABI of the message the hub decodes (contracts/lz/IkizHub.sol) ---- */
export function gidenMesaj(token20, alici32, miktar, istek) {
  const w = (v) => hexB(BigInt(v).toString(16).padStart(64, "0"));
  const parcalar = [w(2), pad32(token20), alici32, w(miktar), w(160), w(istek.length), istek];
  const ham = new Uint8Array(parcalar.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parcalar) { ham.set(p, o); o += p.length; }
  const n = Math.ceil(ham.length / 32) * 32;
  const out = new Uint8Array(n); out.set(ham);
  return out;
}

async function yollar(conn, kullanici) {
  const { PublicKey } = await vendor();
  const kapi = new PublicKey(SOL.kapiProgram);
  const [store] = PublicKey.findProgramAddressSync([new TextEncoder().encode("Store")], kapi);
  const ben = new PublicKey(kullanici);
  /* the endpoint's accounts for a message from the gate's store to the hub on Arc */
  const hesaplar = (tur) => lzHesaplari({ conn, PublicKey, endpoint: SOL.endpoint, gonderen: store.toBase58(), hedefEid: SOL.arcEid,
    alici32: pad32(SOL.hub), odeyen: ben.toBase58(), tur });
  return { kapi, store, hesaplar, kullanici: ben };
}

/// The endpoint's own `quote` for a message of `boyut` bytes to the hub, simulated (lamports).
/// LayerZero prices a message by its size, not its bytes, so zeros stand in for the content.
async function olcuTeklif(conn, y, boyut) {
  const { TransactionInstruction, PublicKey, ComputeBudgetProgram, Buffer } = await vendor();
  const metas = await y.hesaplar("quote");
  const sec = hexB(SOL.secenek);
  /* anchor sighash("global:quote") + QuoteParams { sender, dst_eid u32, receiver [32], message vec, options vec, pay_in_lz_token bool } */
  const disc = hexB("952a6df78692d57b");
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
  const veri = Buffer.concat([disc, y.store.toBytes(), u32(SOL.arcEid), pad32(SOL.hub), u32(boyut), new Uint8Array(boyut), u32(sec.length), sec, Uint8Array.from([0])]);
  const ix = new TransactionInstruction({ programId: new PublicKey(SOL.endpoint), keys: metas.slice(1), data: Buffer.from(veri) });
  const tx = await v0(conn, y.kullanici, [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix], [SOL.alt]);
  const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  if (sim.value.err) throw new Error("LayerZero quote failed on Solana: " + JSON.stringify(sim.value.err));
  const rd = sim.value.returnData && Buffer.from(sim.value.returnData.data[0], "base64");
  if (!rd || rd.length < 16) throw new Error("LayerZero gave no quote.");
  return new DataView(rd.buffer, rd.byteOffset).getBigUint64(0, true);
}

/// LayerZero's fee (lamports) for sending `istek` (0 or 192 bytes) with the twins to Arc.
/// A transaction holds a quote for at most ~300 message bytes (the gate's lookup table lacks the
/// library's accounts), so a longer message is priced from two quotes on the line through them:
/// the executor charges per byte, the verifiers a flat fee.
export async function teklif(kullanici, istekBoyu = 0) {
  const { Connection } = await vendor();
  const conn = new Connection(SOL.rpc, "confirmed");
  const y = await yollar(conn, kullanici);
  const boyut = 192 + Math.ceil(istekBoyu / 32) * 32;
  if (boyut <= 288) return olcuTeklif(conn, y, boyut);
  const [a, b] = [await olcuTeklif(conn, y, 192), await olcuTeklif(conn, y, 288)];
  return b + (((b > a ? b - a : 0n) * BigInt(boyut - 288) + 95n) / 96n);
}

/// Burn `miktar` twins (6 decimals) of `token20` and send them to Arc: to `alici32`, or with an order `istek`.
export async function gonder({ token20, alici32, miktar, istek = new Uint8Array(0), onEk = [], durum = () => {} }) {
  const ben = await solanaCuzdan.baglan();
  durum("Reading LayerZero's fee on Solana…");
  const { tx, ucret } = await gonderIslemi(ben, { token20, alici32, miktar, istek, onEk });
  durum("LayerZero fee " + (Number(ucret) / 1e9).toFixed(5) + " SOL (+10% margin, only the real fee is taken). Approve in your wallet…");
  const imza = await solanaCuzdan.gonder(tx);
  await onayBekle(imza);
  return { imza, ucret };
}

/// The unsigned transaction for `gonder` (also simulated by the checks in scripts/).
export async function gonderIslemi(ben, { token20, alici32, miktar, istek = new Uint8Array(0), onEk = [] }) {
  const { Connection, TransactionInstruction, PublicKey, ComputeBudgetProgram, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, Buffer } = await vendor();
  const conn = new Connection(SOL.rpc, "confirmed");
  const y = await yollar(conn, ben);
  const tk = hexB(token20.replace(/^0x/, "").toLowerCase().padStart(40, "0"));
  const [mint] = PublicKey.findProgramAddressSync([new TextEncoder().encode("ikiz"), tk], y.kapi);
  const ata = getAssociatedTokenAddressSync(mint, y.kullanici, false, TOKEN_PROGRAM_ID);
  const ucret = await teklif(ben, istek.length);
  const ucretPay = (ucret * 11n) / 10n;
  const metas = await y.hesaplar("send");
  const u64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
  const veri = Buffer.concat([Uint8Array.from([2]), tk, alici32, u64(miktar), u64(ucretPay), u32(istek.length), istek]);
  const ix = new TransactionInstruction({ programId: y.kapi, data: Buffer.from(veri), keys: [
    { pubkey: y.kullanici, isSigner: true, isWritable: true },
    { pubkey: y.store, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    /* the endpoint's accounts; only the user signs (the store signs inside, by its seeds) */
    ...metas.map((m) => ({ pubkey: m.pubkey, isSigner: m.pubkey.equals(y.kullanici), isWritable: m.isWritable })),
  ] });
  const tx = await v0(conn, y.kullanici, [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...onEk, ix], [SOL.alt]);
  return { tx, ucret };
}

/// Sign and send plain instructions with the connected wallet (e.g. opening the USDC account a payout needs).
export async function talimatGonder(ixs) {
  const { Connection, PublicKey } = await vendor();
  const ben = await solanaCuzdan.baglan();
  const conn = new Connection(SOL.rpc, "confirmed");
  const imza = await solanaCuzdan.gonder(await v0(conn, new PublicKey(ben), ixs));
  await onayBekle(imza);
  return imza;
}

/// Run relay's Solana step (instructions + lookup tables) with the connected wallet.
export async function relayAdimi(data) {
  const { Connection, TransactionInstruction, PublicKey, Buffer } = await vendor();
  const ben = await solanaCuzdan.baglan();
  const conn = new Connection(SOL.rpc, "confirmed");
  const ixs = data.instructions.map((i) => new TransactionInstruction({ programId: new PublicKey(i.programId), data: Buffer.from(i.data, "hex"),
    keys: i.keys.map((k) => ({ pubkey: new PublicKey(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable })) }));
  const tx = await v0(conn, new PublicKey(ben), ixs, data.addressLookupTableAddresses || []);
  const imza = await solanaCuzdan.gonder(tx);
  await onayBekle(imza);
  return imza;
}

/// Twins this Solana wallet holds for `token20` (6 decimals).
export async function ikizBakiye(sahip, token20) {
  const { Connection, PublicKey, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = await vendor();
  const conn = new Connection(SOL.rpc, "confirmed");
  const kapi = new PublicKey(SOL.kapiProgram);
  const tk = hexB(token20.replace(/^0x/, "").toLowerCase().padStart(40, "0"));
  const [mint] = PublicKey.findProgramAddressSync([new TextEncoder().encode("ikiz"), tk], kapi);
  const ata = getAssociatedTokenAddressSync(mint, new PublicKey(sahip), false, TOKEN_PROGRAM_ID);
  /* the token account itself (amount: u64 at byte 64); publicnode refuses getTokenAccountBalance
     ("indexed requests require a personal token"), which read as 0 here before 24 Oct */
  const h = await conn.getAccountInfo(ata);
  if (!h || h.data.length < 72) return 0n;
  return new DataView(h.data.buffer, h.data.byteOffset).getBigUint64(64, true);
}

/// Where Circle pays USDC to this wallet on Solana: its USDC token account (CCTP mints to the
/// account, not the owner), and the instruction that opens it when it does not exist yet.
export async function usdcHesabi(sahip) {
  const { Connection, PublicKey, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } = await vendor();
  const conn = new Connection(SOL.rpc, "confirmed");
  const ben = new PublicKey(sahip), mint = new PublicKey(SOL.usdc);
  const ata = getAssociatedTokenAddressSync(mint, ben, false, TOKEN_PROGRAM_ID);
  const var_ = !!(await conn.getAccountInfo(ata));
  return { ata32: ata.toBytes(), ac: var_ ? [] : [createAssociatedTokenAccountIdempotentInstruction(ben, ata, ben, mint, TOKEN_PROGRAM_ID)] };
}

/// A Solana address as the 32 bytes LayerZero and the hub use.
export async function adresBaytlari(adres) {
  const { PublicKey } = await vendor();
  return new PublicKey(adres).toBytes();
}
