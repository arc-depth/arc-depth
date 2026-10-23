/* ===========================================================================
 * sui-gql.js — Sui's JSON-RPC answered from Sui's GraphQL
 *
 * Sui switched JSON-RPC off on every public node in October 2026 (publicnode,
 * fullnode.mainnet.sui.io and BlockVision answer "deprecated, use gRPC or
 * GraphQL"; measured 24 Oct). Everything the site does on Sui was written
 * against JSON-RPC: @mysten/sui's SuiJsonRpcClient (reads, devInspect, the
 * transaction builder's object and gas resolution) and a few direct calls.
 * Rather than rewrite each, this module answers the JSON-RPC methods the
 * site and the builder use, in JSON-RPC's own shapes, from the public GraphQL
 * service (graphql.mainnet.sui.io, which allows any origin):
 *
 *   new SuiJsonRpcClient({ transport: gqlTransport })   the client, unchanged
 *   await suiJsonRpc("suix_getCoinMetadata", [type])     a direct call
 *
 * Move values are converted with the type layout GraphQL returns next to
 * them, so object `content.fields` keep JSON-RPC's nesting ({ type, fields },
 * UID as { id }, Balance and u64 as strings, vector<u8> as numbers).
 * =========================================================================== */
import { bcs, fromBase64, toBase64, normalizeSuiAddress } from "../vendor/sui.mjs";

export const SUI_GQL = "https://graphql.mainnet.sui.io/graphql";

async function gq(query, variables) {
  let son;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(SUI_GQL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
      const j = await r.json();
      if (j.errors && j.errors.length) throw new Error("Sui GraphQL: " + j.errors.map((e) => e.message).join("; "));
      return j.data;
    } catch (e) { son = e; if (/Sui GraphQL:/.test(e.message)) throw e; await new Promise((ok) => setTimeout(ok, 600 * (i + 1))); }
  }
  throw son;
}

/* ---- Move values: GraphQL's flat JSON back to JSON-RPC's shapes ---- */
const uzun = (t) => String(t).replace(/0x[0-9a-fA-F]+/g, (a) => normalizeSuiAddress(a));
const tipMi = (t, modul, ad) => { const m = uzun(t).match(/^0x0+([12])::(\w+)::(\w+)/); return !!m && m[2] === modul && m[3] === ad; };
const b64Dizi = (s) => Array.from(fromBase64(s));

function cevir(v, d) {
  if (v === undefined) return undefined;
  if (typeof d === "string") {
    if (d === "u8" || d === "u16" || d === "u32") return Number(v);
    if (d === "u64" || d === "u128" || d === "u256") return String(v);
    return v;                                    // address, bool, signer
  }
  if (d.vector !== undefined) {
    if (d.vector === "u8" && typeof v === "string") return b64Dizi(v);
    return Array.isArray(v) ? v.map((x) => cevir(x, d.vector)) : v;
  }
  if (d.struct) {
    const t = d.struct.type;
    if (tipMi(t, "object", "UID")) return { id: typeof v === "string" ? v : v && v.id };
    if (tipMi(t, "object", "ID")) return typeof v === "string" ? v : v && v.bytes;
    if (tipMi(t, "balance", "Balance")) return String(v && typeof v === "object" ? v.value : v);
    if (tipMi(t, "string", "String") || tipMi(t, "ascii", "String")) return v;
    if (tipMi(t, "url", "Url")) return v && typeof v === "object" ? v.url : v;
    if (tipMi(t, "option", "Option")) {
      if (v == null) return null;
      const ic = d.struct.fields[0].layout.vector;
      return cevir(Array.isArray(v) ? v[0] : v, ic);
    }
    const alanlar = {};
    for (const f of d.struct.fields) alanlar[f.name] = cevir(v == null ? undefined : v[f.name], f.layout);
    return { type: t, fields: alanlar };
  }
  return v;                                      // enums and anything else: as GraphQL gives it
}

const SAHIP = "owner { __typename ... on AddressOwner { address { address } } ... on ObjectOwner { address { address } } ... on Shared { initialSharedVersion } ... on ConsensusAddressOwner { startVersion address { address } } }";
const NESNE = `address version digest ${SAHIP} previousTransaction { digest } storageRebate
  asMoveObject { hasPublicTransfer contents { type { repr layout } json bcs } } asMovePackage { address }`;

function sahip(o) {
  if (!o) return null;
  switch (o.__typename) {
    case "AddressOwner": return { AddressOwner: o.address.address };
    case "ObjectOwner": return { ObjectOwner: o.address.address };
    case "Shared": return { Shared: { initial_shared_version: Number(o.initialSharedVersion) } };
    case "ConsensusAddressOwner": return { ConsensusAddressOwner: { owner: o.address.address, start_version: Number(o.startVersion) } };
    default: return "Immutable";
  }
}

function nesneCevabi(n, opt = {}) {
  if (!n) return null;
  const mo = n.asMoveObject;
  const tip = mo ? mo.contents.type.repr : "package";
  const data = { objectId: n.address, version: String(n.version), digest: n.digest, type: tip };
  data.owner = sahip(n.owner);
  if (n.previousTransaction) data.previousTransaction = n.previousTransaction.digest;
  if (n.storageRebate != null) data.storageRebate = String(n.storageRebate);
  if (mo) {
    data.content = { dataType: "moveObject", type: tip, hasPublicTransfer: !!mo.hasPublicTransfer, fields: (cevir(mo.contents.json, mo.contents.type.layout) || {}).fields || {} };
    data.bcs = { dataType: "moveObject", type: tip, hasPublicTransfer: !!mo.hasPublicTransfer, version: Number(n.version), bcsBytes: mo.contents.bcs };
  } else {
    data.content = { dataType: "package", disassembled: {} };
  }
  if (!opt.showContent) delete data.content;
  if (!opt.showBcs) delete data.bcs;
  return { data };
}

async function nesneler(ids, opt) {
  const sonuc = [];
  for (let i = 0; i < ids.length; i += 50) {
    const parca = ids.slice(i, i + 50);
    const d = await gq(`query($k: [ObjectKey!]!) { multiGetObjects(keys: $k) { ${NESNE} } }`, { k: parca.map((a) => ({ address: a })) });
    d.multiGetObjects.forEach((n, j) => sonuc.push(n ? nesneCevabi(n, opt || {}) : { error: { code: "notExists", object_id: parca[j] } }));
  }
  return sonuc;
}

/* ---- types: GraphQL's signatures to JSON-RPC's normalized Move types ---- */
const ILKEL = { address: "Address", bool: "Bool", signer: "Signer", u8: "U8", u16: "U16", u32: "U32", u64: "U64", u128: "U128", u256: "U256" };
function normalTip(s) {
  if (typeof s === "string") return ILKEL[s] || s;
  if (s.vector !== undefined) return { Vector: normalTip(s.vector) };
  if (s.typeParameter !== undefined) return { TypeParameter: s.typeParameter };
  if (s.datatype) return { Struct: { address: s.datatype.package, module: s.datatype.module, name: s.datatype.type, typeArguments: (s.datatype.typeParameters || []).map(normalTip) } };
  return s;
}
function imza(sig) {
  const ic = normalTip(sig.body);
  return sig.ref === "&" ? { Reference: ic } : sig.ref === "&mut" ? { MutableReference: ic } : ic;
}
const yetenek = (a) => a.charAt(0) + a.slice(1).toLowerCase();

/* ---- simulations ---- */
const ETKI = `effects { status executionError { message } gasEffects { gasSummary { computationCost storageCost storageRebate nonRefundableStorageFee } }
  events { nodes { contents { json type { repr } } sender { address } transactionModule { name package { address } } } } }`;
/* GraphQL words a Move abort as "Error in 3rd command, from '0x…::m::f' (instruction 29), abort code: 13";
   JSON-RPC (which callers match) as "MoveAbort(MoveLocation { … function_name: Some("f") }, 13) in command 2" */
function hataMetni(m) {
  const x = /Error in (\d+)\w* command, from '(0x[0-9a-fA-F]+)::(\w+)::(\w+)' \(instruction (\d+)\), abort code: (\d+)/.exec(m || "");
  if (!x) return m || "failed";
  return "MoveAbort(MoveLocation { module: ModuleId { address: " + x[2].replace(/^0x/, "") + ", name: Identifier(\"" + x[3] + "\") }, function: 0, instruction: " + x[5] +
    ", function_name: Some(\"" + x[4] + "\") }, " + x[6] + ") in command " + (Number(x[1]) - 1) + "  [" + m + "]";
}
const durum = (e) => (e && e.status === "SUCCESS" ? { status: "success" } : { status: "failure", error: hataMetni(e && e.executionError && e.executionError.message) });
const olaylar = (e) => ((e && e.events && e.events.nodes) || []).map((x, i) => ({ id: { txDigest: "", eventSeq: String(i) },
  packageId: x.transactionModule && x.transactionModule.package.address, transactionModule: x.transactionModule && x.transactionModule.name,
  sender: x.sender && x.sender.address, type: x.contents.type.repr, parsedJson: x.contents.json }));

async function dryRun(b64) {
  const d = await gq(`query($t: JSON!) { simulateTransaction(transaction: $t) { ${ETKI} } }`, { t: { bcs: { value: b64 } } });
  const e = d.simulateTransaction.effects;
  const g = (e.gasEffects && e.gasEffects.gasSummary) || {};
  return { effects: { messageVersion: "v1", status: durum(e), gasUsed: { computationCost: String(g.computationCost || 0), storageCost: String(g.storageCost || 0),
    storageRebate: String(g.storageRebate || 0), nonRefundableStorageFee: String(g.nonRefundableStorageFee || 0) } }, balanceChanges: [], objectChanges: [], events: olaylar(e), input: null };
}

async function devInspect(sender, kindB64) {
  const kind = bcs.TransactionKind.parse(fromBase64(kindB64));
  const veri = bcs.TransactionData.serialize({ V1: { kind, sender, gasData: { payment: [], owner: sender, price: "1000", budget: "50000000000" }, expiration: { None: true } } }).toBytes();
  const d = await gq(`query($t: JSON!) { simulateTransaction(transaction: $t, checksEnabled: false) { ${ETKI} outputs { returnValues { value { bcs type { repr } } } } } }`,
    { t: { bcs: { value: toBase64(veri) } } });
  const s = d.simulateTransaction;
  const st = durum(s.effects);
  return { effects: { status: st }, error: st.error, events: olaylar(s.effects),
    results: (s.outputs || []).map((o) => ({ returnValues: (o.returnValues || []).map((r) => [b64Dizi(r.value.bcs), r.value.type.repr]), mutableReferenceOutputs: [] })) };
}

async function islem(digest) {
  const d = await gq(`query($d: String!) { transaction(digest: $d) { digest effects { status executionError { message } timestamp
    objectChanges(first: 50) { nodes { address idCreated idDeleted outputState { address version digest ${SAHIP} asMoveObject { contents { type { repr } } } asMovePackage { address } } } } } } }`, { d: digest });
  const t = d.transaction;
  if (!t || !t.effects) throw new Error("Could not find the referenced transaction [" + digest + "]");
  const degisim = t.effects.objectChanges.nodes.map((c) => {
    const o = c.outputState;
    if (o && o.asMovePackage) return { type: "published", packageId: o.address, version: String(o.version), digest: o.digest, modules: [] };
    if (c.idDeleted) return { type: "deleted", objectId: c.address };
    const ortak = { objectId: c.address, objectType: o && o.asMoveObject ? o.asMoveObject.contents.type.repr : null, version: o ? String(o.version) : null, digest: o ? o.digest : null, owner: o ? sahip(o.owner) : null };
    return { type: c.idCreated ? "created" : "mutated", ...ortak };
  });
  return { digest: t.digest, effects: { status: durum(t.effects) }, objectChanges: degisim, timestampMs: t.effects.timestamp ? String(Date.parse(t.effects.timestamp)) : null };
}

async function dinamikAlanlar(parent, imlec, limit) {
  const d = await gq(`query($p: SuiAddress!, $n: Int, $c: String) { object(address: $p) { dynamicFields(first: $n, after: $c) {
    nodes { address version digest name { type { repr } json bcs } value { __typename ... on MoveObject { address version digest contents { type { repr } } } ... on MoveValue { type { repr } } } }
    pageInfo { hasNextPage endCursor } } } }`, { p: parent, n: Math.min(limit || 50, 50), c: imlec || null });
  const df = d.object && d.object.dynamicFields;
  if (!df) return { data: [], nextCursor: null, hasNextPage: false };
  return {
    data: df.nodes.map((n) => {
      const nesne = n.value && n.value.__typename === "MoveObject";
      return { name: { type: n.name.type.repr, value: n.name.json }, bcsName: n.name.bcs, type: nesne ? "DynamicObject" : "DynamicField",
        objectType: nesne ? n.value.contents.type.repr : n.value && n.value.type ? n.value.type.repr : null,
        objectId: nesne ? n.value.address : n.address, version: Number(nesne ? n.value.version : n.version), digest: nesne ? n.value.digest : n.digest, fieldId: n.address };
    }),
    nextCursor: df.pageInfo.endCursor, hasNextPage: df.pageInfo.hasNextPage };
}
const esit = (a, b) => JSON.stringify(a, Object.keys(a || {}).sort()) === JSON.stringify(b, Object.keys(b || {}).sort()) || JSON.stringify(a) === JSON.stringify(b);

/* ---- the methods ---- */
const YONTEM = {
  async sui_getObject([id, opt]) { return (await nesneler([id], opt))[0]; },
  async sui_multiGetObjects([ids, opt]) { return nesneler(ids, opt); },
  async suix_getReferenceGasPrice() { return String((await gq("{ epoch { referenceGasPrice } }")).epoch.referenceGasPrice); },
  async suix_getBalance([owner, coinType]) {
    const t = coinType || "0x2::sui::SUI";
    const d = await gq(`query($a: SuiAddress!, $t: String!) { address(address: $a) { balance(coinType: $t) { totalBalance } } }`, { a: owner, t });
    return { coinType: t, coinObjectCount: 0, totalBalance: String((d.address && d.address.balance && d.address.balance.totalBalance) || "0"), lockedBalance: {} };
  },
  async suix_getCoins([owner, coinType, imlec, limit]) {
    const t = coinType || "0x2::sui::SUI";
    const d = await gq(`query($a: SuiAddress!, $f: String!, $n: Int, $c: String) { address(address: $a) { objects(filter: { type: $f }, first: $n, after: $c) {
      nodes { address version digest previousTransaction { digest } contents { json } } pageInfo { hasNextPage endCursor } } } }`,
      { a: owner, f: "0x2::coin::Coin<" + t + ">", n: Math.min(limit || 50, 50), c: imlec || null });
    const o = d.address && d.address.objects;
    if (!o) return { data: [], nextCursor: null, hasNextPage: false };
    return { data: o.nodes.map((n) => ({ coinType: t, coinObjectId: n.address, version: String(n.version), digest: n.digest,
      balance: String(typeof n.contents.json.balance === "object" ? n.contents.json.balance.value : n.contents.json.balance), previousTransaction: n.previousTransaction && n.previousTransaction.digest })),
      nextCursor: o.pageInfo.endCursor, hasNextPage: o.pageInfo.hasNextPage };
  },
  async suix_getCoinMetadata([coinType]) {
    const d = await gq(`query($t: String!) { coinMetadata(coinType: $t) { decimals name symbol description iconUrl address } }`, { t: coinType });
    const m = d.coinMetadata;
    return m ? { decimals: m.decimals, name: m.name, symbol: m.symbol, description: m.description || "", iconUrl: m.iconUrl || null, id: m.address } : null;
  },
  async sui_getNormalizedMoveFunction([pkg, mod, fn]) {
    const d = await gq(`query($p: SuiAddress!, $m: String!, $f: String!) { package(address: $p) { module(name: $m) { function(name: $f) {
      isEntry visibility typeParameters { constraints } parameters { signature } return { signature } } } } }`, { p: pkg, m: mod, f: fn });
    const f = d.package && d.package.module && d.package.module.function;
    if (!f) throw new Error("No function " + pkg + "::" + mod + "::" + fn);
    return { visibility: yetenek(f.visibility), isEntry: f.isEntry, typeParameters: f.typeParameters.map((t) => ({ abilities: (t.constraints || []).map(yetenek) })),
      parameters: f.parameters.map((p) => imza(p.signature)), return: (f.return || []).map((p) => imza(p.signature)) };
  },
  async sui_dryRunTransactionBlock([b64]) { return dryRun(b64); },
  async sui_devInspectTransactionBlock([sender, b64]) { return devInspect(sender, b64); },
  async sui_getTransactionBlock([digest]) { return islem(digest); },
  async suix_getDynamicFields([parent, imlec, limit]) { return dinamikAlanlar(parent, imlec, limit); },
  async suix_getDynamicFieldObject([parent, ad]) {
    let imlec = null;
    do {
      const s = await dinamikAlanlar(parent, imlec, 50);
      for (const a of s.data) {
        if (uzun(a.name.type) !== uzun(ad.type) || !esit(a.name.value, ad.value)) continue;
        return (await nesneler([a.type === "DynamicObject" ? a.objectId : a.fieldId], { showContent: true, showType: true, showOwner: true }))[0];
      }
      imlec = s.hasNextPage ? s.nextCursor : null;
    } while (imlec);
    return { error: { code: "dynamicFieldNotFound", parent_object_id: parent } };
  },
  async suix_queryEvents([sorgu, imlec, limit, azalan]) {
    const t = sorgu && (sorgu.MoveEventType || sorgu.MoveEventModule && (sorgu.MoveEventModule.package + "::" + sorgu.MoveEventModule.module));
    if (!t) throw new Error("Only MoveEventType / MoveEventModule queries are answered here.");
    const n = Math.min(limit || 50, 50);
    const sec = azalan ? `last: ${n}, before: $c` : `first: ${n}, after: $c`;
    const d = await gq(`query($t: String!, $c: String) { events(${sec}, filter: { type: $t }) { nodes { contents { json type { repr } } sender { address }
      timestamp sequenceNumber transaction { digest } transactionModule { name package { address } } } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } } }`,
      { t: sorgu.MoveEventType || t, c: imlec || null });
    const e = d.events;
    const dugum = azalan ? [...e.nodes].reverse() : e.nodes;
    return { data: dugum.map((x) => ({ id: { txDigest: x.transaction && x.transaction.digest, eventSeq: String(x.sequenceNumber) },
      packageId: x.transactionModule && x.transactionModule.package.address, transactionModule: x.transactionModule && x.transactionModule.name,
      sender: x.sender && x.sender.address, type: x.contents.type.repr, parsedJson: x.contents.json, timestampMs: x.timestamp ? String(Date.parse(x.timestamp)) : null })),
      nextCursor: azalan ? e.pageInfo.startCursor : e.pageInfo.endCursor, hasNextPage: azalan ? e.pageInfo.hasPreviousPage : e.pageInfo.hasNextPage };
  },
  async sui_getChainIdentifier() { return (await gq("{ chainIdentifier }")).chainIdentifier; },
};

/** One JSON-RPC call, answered from GraphQL. */
export async function suiJsonRpc(method, params = []) {
  const f = YONTEM[method];
  if (!f) throw new Error("Sui " + method + " is not available (JSON-RPC is switched off on Sui; this site answers a subset from GraphQL).");
  return f(params);
}

/** A transport for @mysten/sui's SuiJsonRpcClient. */
export const gqlTransport = {
  request: ({ method, params }) => suiJsonRpc(method, params),
  subscribe: () => { throw new Error("Sui subscriptions are not available."); },
};
