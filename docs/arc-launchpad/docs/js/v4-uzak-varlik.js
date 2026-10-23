/* ===========================================================================
 * v4-uzak-varlik.js — can a basket line on Solana, Sui or Aptos be bought?
 *
 * v4 (23 Oct 2026): the Solana, Sui and Aptos vaults buy and sell a line's
 * asset only through the pool their own list names for it (written by the
 * deployer before the lock, never after; docs/veri/v4-uzak-liste.json is the
 * plan, the chain is the truth). The launch form should accept a line on
 * these chains only when this says `uygun`.
 *
 *   import { uzakVarlikUygunMu } from "./v4-uzak-varlik.js";
 *   const r = await uzakVarlikUygunMu("sui", "0x2::sui::SUI", V2.uzak);
 *   // { uygun: true, havuz, dex, tavan } | { uygun: false, neden, aday? }
 *
 * `zincir`: "solana" (varlik = mint, base58) | "sui" (varlik = coin type) |
 * "aptos" (varlik = fungible asset metadata address). `uzak`: the `uzak`
 * section of docs/veri/sepet-v2.json (or v4's), naming the vaults. Reads the
 * chains directly from the browser; nothing of ours runs anywhere.
 * Not wired into the launch form here (gorunum/merkez.js decides how).
 * =========================================================================== */

const SOLANA_RPC = "https://solana-rpc.publicnode.com";
const SUI_GQL = "https://graphql.mainnet.sui.io/graphql";
const APTOS_API = "https://api.mainnet.aptoslabs.com/v1";
const SOLANA_SEPET = "9VyBC6ygFQrEP6V212maFci9du6R32BbKHxKmF9Wecto";

let _liste = null;
async function plan() {
  if (!_liste) _liste = fetch(new URL("../veri/v4-uzak-liste.json", import.meta.url)).then((r) => (r.ok ? r.json() : { solana: [], sui: [], aptos: [] })).catch(() => ({ solana: [], sui: [], aptos: [] }));
  return _liste;
}

const pad64 = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
/** A Sui coin type as Move's TypeName prints it (with_defining_ids): 64 hex, no 0x. */
export function suiTipAdi(t) {
  const [adr, ...kalan] = t.trim().split("::");
  return pad64(adr) + "::" + kalan.join("::");
}

async function solanaListede(mint, uzak) {
  const { PublicKey } = await import("../vendor/solana.mjs");
  const program = new PublicKey((uzak && uzak.solana && uzak.solana.sepetProgram) || SOLANA_SEPET);
  const [liste] = PublicKey.findProgramAddressSync([new TextEncoder().encode("liste"), new PublicKey(mint).toBytes()], program);
  const r = await fetch(SOLANA_RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [liste.toBase58(), { encoding: "base64" }] }) }).then((x) => x.json());
  const v = r.result && r.result.value;
  if (!v || v.owner !== program.toBase58()) return null;
  const d = Uint8Array.from(atob(v.data[0]), (c) => c.charCodeAt(0));
  if (d.length !== 34 || d[0] !== 1) return null;
  return new PublicKey(d.slice(1, 33)).toBase58();
}

async function suiListede(tip, uzak) {
  const s = uzak && uzak.sui;
  if (!s || !s.kasa || !s.v4Paket) return null;
  /* ListeKey { varlik: TypeName { name: String } }: BCS = ULEB128 length + the name's bytes */
  const ad = new TextEncoder().encode(suiTipAdi(tip));
  const uleb = []; let n = ad.length;
  do { let b = n & 0x7f; n >>= 7; if (n) b |= 0x80; uleb.push(b); } while (n);
  const bcs = btoa(String.fromCharCode(...uleb, ...ad));
  const q = `{ object(address:"${s.kasa}"){ dynamicField(name:{ type:"${s.v4Paket}::kasa::ListeKey", bcs:"${bcs}" }){ value { ... on MoveValue { json } } } } }`;
  const r = await fetch(SUI_GQL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) }).then((x) => x.json());
  const f = r.data && r.data.object && r.data.object.dynamicField;
  return f ? f.value.json : null;
}

async function aptosListede(varlik, uzak) {
  const a = uzak && uzak.aptos;
  if (!a || !a.hesap || !a.kasa) return null;
  const r = await fetch(APTOS_API + "/view", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ function: a.hesap + "::kasa::liste", type_arguments: [], arguments: [a.kasa, "0x" + pad64(varlik)] }) });
  if (!r.ok) return null;
  const v = await r.json();
  return Array.isArray(v) ? { havuz: v[0], dolar_a: v[1], tavan: Number(v[4]) } : null;
}

/** Whether a line on `zincir` naming `varlik` will be bought by the vault there (v4). */
export async function uzakVarlikUygunMu(zincir, varlik, uzak) {
  const p = await plan();
  const aday = (p[zincir] || []).find((x) => (zincir === "sui" ? suiTipAdi(x.varlik) === suiTipAdi(varlik)
    : zincir === "aptos" ? pad64(x.varlik) === pad64(varlik) : x.varlik === varlik));
  let zincirde = null;
  try {
    if (zincir === "solana") zincirde = await solanaListede(varlik, uzak).then((h) => (h ? { havuz: h } : null));
    else if (zincir === "sui") zincirde = await suiListede(varlik, uzak);
    else if (zincir === "aptos") zincirde = await aptosListede(varlik, uzak);
    else return { uygun: false, neden: "Not a Solana, Sui or Aptos line." };
  } catch (e) {
    return { uygun: false, neden: "Could not read the " + zincir + " vault's list (" + (e.message || e) + ").", aday };
  }
  if (zincirde) return { uygun: true, havuz: zincirde.havuz, dex: aday ? aday.dex : null, tavan: zincirde.tavan || (aday && aday.tavan) || null };
  if (aday) return { uygun: false, neden: "Listed for v4 (" + aday.dex + "), not on the chain yet: the vault does not buy it until the v4 setup runs.", aday };
  return { uygun: false, neden: "The " + zincir + " vault has no pool for this asset; only listed assets can back a line there." };
}
