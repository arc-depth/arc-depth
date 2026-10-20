/* ===========================================================================
 * sui-ikiz.js — a launch token's twin on Sui: its coin type, registered once
 *
 * On Sui a coin is a type, so the twin gate (sui/ikiz, ikiz::kapi) cannot
 * create it. When the hub's YARAT reaches Sui, the gate records the name and
 * symbol; then anyone publishes the twin template (sui/coin-sablon-ikiz,
 * docs/veri/sui-ikiz-sablon.json) under exactly that name and symbol and hands
 * its TreasuryCap to the gate. The gate checks it can't be told apart from any
 * other such coin (6 decimals, nothing minted, not regulated, metadata fixed).
 * From then on transfers to Sui are minted at once; those that arrived before
 * wait in the gate and anyone delivers them (`bas`).
 *
 * Four wallet prompts, all from the same Sui wallet:
 *   1 publish the coin (its package made immutable)
 *   2 coin_registry::finalize_registration (the Currency becomes shared)
 *   3 kapi::kaydet<T> (the TreasuryCap goes to the gate)
 *   4 kapi::bas<T> for each transfer that waited
 * =========================================================================== */
import { Transaction, bcs, fromBase64, toBase64, update_identifiers, update_constants } from "../vendor/sui.mjs";
import { SUI, istemci, suiCuzdan, tanimlayici, islemBekle } from "./sui.js";

const KAYIT = "0x000000000000000000000000000000000000000000000000000000000000000c";   // Sui's coin registry
const vekU8 = (s) => bcs.vector(bcs.u8()).serialize(Array.from(new TextEncoder().encode(s))).toBytes();
const pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/// What the gate recorded for `token` (an Arc address): its name and symbol, or null.
export async function beklenen(paket, kapi, token) {
  const tx = new Transaction();
  tx.moveCall({ target: paket + "::kapi::beklenen", arguments: [tx.object(kapi), tx.pure.address(pad(token))] });
  const r = await istemci().devInspectTransactionBlock({ sender: pad("0x0"), transactionBlock: tx });
  const ham = r.results && r.results[0] && r.results[0].returnValues && r.results[0].returnValues[0];
  if (!ham) throw new Error("Could not read the Sui gate.");
  const v = bcs.option(bcs.struct("Ad", { ad: bcs.string(), sembol: bcs.string() })).parse(Uint8Array.from(ham[0]));
  return v ? { ad: v.ad, sembol: v.sembol } : null;
}

/// The coin type the gate holds for `token`, or null.
export async function kayitliTip(paket, kapi, token) {
  const tx = new Transaction();
  tx.moveCall({ target: paket + "::kapi::tip", arguments: [tx.object(kapi), tx.pure.address(pad(token))] });
  const r = await istemci().devInspectTransactionBlock({ sender: pad("0x0"), transactionBlock: tx });
  const ham = r.results && r.results[0] && r.results[0].returnValues && r.results[0].returnValues[0];
  if (!ham) throw new Error("Could not read the Sui gate.");
  const v = bcs.option(bcs.struct("TypeName", { name: bcs.string() })).parse(Uint8Array.from(ham[0]));
  return v ? "0x" + v.name : null;
}

/// The template with this token's name and symbol in it.
export async function ikizSablonu(ad, sembol) {
  const { sablonYukle } = await import("../vendor/sui.mjs");
  await sablonYukle({ module_or_path: SUI.wasmUrl || new URL("../vendor/move_bytecode_template_bg.wasm", import.meta.url).href });
  const j = await fetch(new URL("../veri/sui-ikiz-sablon.json", import.meta.url).href).then((r) => r.json());
  const OTW = tanimlayici(sembol || "IKIZ");
  let b = fromBase64(j.modules[0]);
  b = update_identifiers(b, { IKIZ: OTW, ikiz: OTW.toLowerCase() });
  b = update_constants(b, vekU8(sembol), vekU8("IKIZSABLON"), "Vector(U8)");
  b = update_constants(b, vekU8(ad), vekU8("Ikiz Token Name Placeholder 0000"), "Vector(U8)");
  return { modules: [toBase64(b)], dependencies: j.dependencies, modul: OTW.toLowerCase(), otw: OTW };
}

/// Transfers to Sui for `token` that wait for its coin type (from the gate's events).
export async function bekleyenTransferler(paket, token) {
  const out = [];
  let cursor = null;
  do {
    const r = await istemci().queryEvents({ query: { MoveEventType: paket + "::kapi::Bekliyor" }, cursor, limit: 50 });
    for (const e of r.data) if (pad(e.parsedJson.token) === pad(token)) out.push(String(e.parsedJson.sira));
    cursor = r.hasNextPage ? r.nextCursor : null;
  } while (cursor);
  return out;
}

/// The whole registration from the browser.
export async function tipiKaydet({ paket, kapi, token, durum = () => {} }) {
  const sahip = await suiCuzdan.baglan();
  if (await kayitliTip(paket, kapi, token)) throw new Error("This token's Sui coin is already registered.");
  const a = await beklenen(paket, kapi, token);
  if (!a) throw new Error("The twin has not been created on Sui yet (create it first: move tokens there from Arc).");
  durum("Preparing the coin “" + a.ad + "” (" + a.sembol + ")…");
  const s = await ikizSablonu(a.ad, a.sembol);
  /* 1 publish */
  durum("1/4 Approve publishing the coin in your wallet…");
  const tx1 = new Transaction();
  const cap = tx1.publish({ modules: s.modules, dependencies: s.dependencies });
  tx1.moveCall({ target: "0x2::package::make_immutable", arguments: [cap] });
  const r1 = await suiCuzdan.gonder(tx1);
  const yayin = r1.objectChanges.find((o) => o.type === "published");
  const tc = r1.objectChanges.find((o) => o.type === "created" && /::coin::TreasuryCap</.test(o.objectType || ""));
  const cur = r1.objectChanges.find((o) => o.type === "created" && /::coin_registry::Currency</.test(o.objectType || ""));
  if (!yayin || !tc || !cur) throw new Error("The coin package was not published as expected.");
  const tip = yayin.packageId + "::" + s.modul + "::" + s.otw;
  /* 2 the Currency, received by the registry and shared */
  durum("2/4 Approve registering the coin with Sui's coin registry…");
  const tx2 = new Transaction();
  tx2.moveCall({ target: "0x2::coin_registry::finalize_registration", typeArguments: [tip], arguments: [tx2.object(KAYIT), tx2.object(cur.objectId)] });
  const r2 = await suiCuzdan.gonder(tx2);
  const pay = r2.objectChanges.find((o) => o.type === "created" && /::coin_registry::Currency</.test(o.objectType || ""));
  if (!pay) throw new Error("The coin registry did not share the currency.");
  /* 3 hand the TreasuryCap to the gate */
  durum("3/4 Approve handing the coin to the twin gate…");
  const tx3 = new Transaction();
  tx3.moveCall({ target: paket + "::kapi::kaydet", typeArguments: [tip], arguments: [tx3.object(kapi), tx3.pure.address(pad(token)), tx3.object(pay.objectId), tx3.object(tc.objectId)] });
  await suiCuzdan.gonder(tx3);
  /* 4 deliver what waited */
  const bek = await bekleyenTransferler(paket, token);
  let teslim = 0;
  if (bek.length) {
    durum("4/4 Approve delivering " + bek.length + " waiting transfer(s)…");
    const tx4 = new Transaction();
    for (const sira of bek) tx4.moveCall({ target: paket + "::kapi::bas", typeArguments: [tip], arguments: [tx4.object(kapi), tx4.pure.u64(sira)] });
    try { await suiCuzdan.gonder(tx4); teslim = bek.length; } catch (e) { durum("Registered. The waiting transfers could not all be delivered in one go (" + e.message + "); anyone can deliver them later."); }
  }
  return { tip, sahip, teslim };
}
