/* ===========================================================================
 * lz-sui-ptb.js — routing an OApp's LayerZero Call through the endpoint on
 * Sui, in the same transaction, from what the chain itself describes
 *
 * On Sui an OApp's send / quote returns a `Call` object; the endpoint and its
 * message library then run as a chain of Move calls in the same programmable
 * transaction. LayerZero keeps that chain ON CHAIN: the endpoint PTB builder
 * object answers `build_quote_ptb_by_call` / `build_send_ptb_by_call` with a
 * vector of MoveCall descriptions (package, module, function, arguments,
 * type arguments, whether it is itself a builder, the ids of its results).
 * This file asks the chain for that vector (devInspect), and:
 *   - a plain call is added to the transaction, its arguments mapped:
 *       Object(address)      -> the shared object
 *       Pure(bytes)          -> the bytes as a pure input
 *       NestedResult(i, j)   -> result j of call i of the same list
 *       ID(bytes32)          -> the result registered under that id (the
 *                               OApp's Call, or a result_ids entry of an
 *                               earlier call)
 *   - a builder call is run in a devInspect of the transaction so far, and
 *     the vector it returns is processed in its place (recursively).
 * Before the calls are trusted, two checks the chain also answers: every
 * package they call is in LayerZero's on-chain package whitelist
 * (package_whitelist_validator::validate), and every object they touch is
 * shared (a builder can never reach an object the wallet owns).
 * Nothing here comes from LayerZero's SDK: the layout of MoveCall and its
 * BCS encoding are read off the on-chain types (ptb_move_call::move_call,
 * ::argument, ::function, utils::bytes32, std::type_name).
 * =========================================================================== */

/* LayerZero's Sui mainnet deployment (public objects; the Call type of the gate's
   kapi::teklif / kapi::gonder names the endpoint and call packages) */
export const LZ_SUI = {
  endpoint: "0xd45b6890fa030bcb43347c0c69a9e5a1a288d1ca7b86b428014752b472f6bf91",
  endpointPaket: "0x31beaef889b08b9c3b37d19280fc1f8b75bae5b2de2410fc3120f403e9a36dac",
  ptbPaket: "0x28417daea895a3dc2e70b5765ec67b99973e612107d56382e399cc75e666f2ba",
  ptbNesne: "0xe64fe6d281abb481de8d49953c564c9ea952bd0a1ce62f4f1a6de8812ec427d4",
  callPaket: "0x28de9e8e087a6347001907fb698fdf8ab0467b342229b74b19264067aebc4ae9",
  beyazPaket: "0xe7358e7dd22bb2ff7d8e8f9f583186af6fb88100b51c5575bc38aeeeff3a8bfa",
  beyazNesne: "0x3ebd427d6237383d163b6d5595889793d52b0171ae908ab6f7159ccfa55b4d94",
};

const hex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/* ---- BCS reader for vector<MoveCall> ---- */
function okuyucu(b) {
  let o = 0;
  const r = {
    u8: () => b[o++],
    u16: () => { const v = b[o] | (b[o + 1] << 8); o += 2; return v; },
    uleb: () => { let v = 0, s = 0; for (;;) { const x = b[o++]; v |= (x & 0x7f) << s; if (!(x & 0x80)) return v; s += 7; } },
    baytlar: (n) => { const v = b.slice(o, o + n); o += n; return v; },
    vektor: () => r.baytlar(r.uleb()),
    adres: () => hex(r.baytlar(32)),
    ascii: () => new TextDecoder().decode(r.vektor()),
    dizi: (f) => { const n = r.uleb(); const a = []; for (let i = 0; i < n; i++) a.push(f()); return a; },
  };
  return r;
}
export function moveCallCoz(bayt) {
  const r = okuyucu(bayt instanceof Uint8Array ? bayt : Uint8Array.from(bayt));
  return r.dizi(() => {
    const paket = r.adres(), modul = r.ascii(), fonk = r.ascii();
    const arguman = r.dizi(() => {
      const t = r.uleb();
      if (t === 0) return { id: hex(r.vektor()) };            // ID(Bytes32 { bytes })
      if (t === 1) return { nesne: r.adres() };               // Object(address)
      if (t === 2) return { saf: r.vektor() };                // Pure(vector<u8>)
      if (t === 3) return { ic: [r.u16(), r.u16()] };         // NestedResult(u16, u16)
      throw new Error("Unknown PTB argument kind " + t);
    });
    const tipler = r.dizi(() => r.ascii());                   // TypeName { name }
    const insaci = r.u8() === 1;
    const sonucIdleri = r.dizi(() => hex(r.vektor()));
    return { paket, modul, fonk, arguman, tipler, insaci, sonucIdleri };
  });
}

const SIFIR32 = "0x" + "00".repeat(32);
const komutSayisi = (tx) => tx.getData().commands.length;
const ic = (k, j) => ({ $kind: "NestedResult", NestedResult: [k, j] });
const tipAdi = (t) => (/^0x/.test(t) ? t : "0x" + t);

async function incele(client, tx, gonderen) {
  const r = await client.devInspectTransactionBlock({ sender: gonderen, transactionBlock: tx });
  if (r.effects.status.status !== "success") throw new Error("LayerZero routing on Sui failed: " + (r.error || JSON.stringify(r.effects.status)));
  return r.results;
}

/* the ids the endpoint gives the OApp's Call (read once from the builder module) */
let _idler = null;
async function idler(client, Transaction, gonderen) {
  if (_idler) return _idler;
  const tx = new Transaction();
  tx.moveCall({ target: LZ_SUI.ptbPaket + "::endpoint_ptb_builder::endpoint_quote_call_id" });
  tx.moveCall({ target: LZ_SUI.ptbPaket + "::endpoint_ptb_builder::endpoint_send_call_id" });
  const s = await incele(client, tx, gonderen);
  /* Bytes32 { bytes: vector<u8> }: a length byte, then 32 bytes */
  const b = (i) => hex(Uint8Array.from(s[i].returnValues[0][0]).slice(1));
  return (_idler = { quote: b(0), send: b(1) });
}

function arg(t, a, yerel, idMap) {
  if (a.nesne) return t.object(a.nesne);
  if (a.saf) return t.pure(Uint8Array.from(a.saf));
  if (a.ic) { const k = yerel[a.ic[0]]; if (k == null) throw new Error("PTB: result of a builder call used by index"); return ic(k, a.ic[1]); }
  const v = idMap.get(a.id);
  if (!v) throw new Error("PTB: no result registered for id " + a.id);
  return v;
}

async function isle(client, Transaction, tx, liste, idMap, gonderen, kayit, derinlik = 0) {
  if (derinlik > 8) throw new Error("PTB: builder calls nested too deep");
  const yerel = [];
  for (const mc of liste) {
    const hedef = mc.paket + "::" + mc.modul + "::" + mc.fonk;
    if (mc.insaci) {
      /* a builder: run it after what the transaction holds so far, and process what it returns */
      const deneme = Transaction.from(tx);
      deneme.moveCall({ target: hedef, typeArguments: mc.tipler.map(tipAdi), arguments: mc.arguman.map((a) => arg(deneme, a, yerel, idMap)) });
      const s = await incele(client, deneme, gonderen);
      const icListe = moveCallCoz(s[s.length - 1].returnValues[0][0]);
      await isle(client, Transaction, tx, icListe, idMap, gonderen, kayit, derinlik + 1);
      yerel.push(null);
      continue;
    }
    tx.moveCall({ target: hedef, typeArguments: mc.tipler.map(tipAdi), arguments: mc.arguman.map((a) => arg(tx, a, yerel, idMap)) });
    kayit.paketler.add(mc.paket);
    mc.arguman.forEach((a) => a.nesne && kayit.nesneler.add(a.nesne));
    const k = komutSayisi(tx) - 1;
    yerel.push(k);
    mc.sonucIdleri.forEach((id, j) => { if (id !== SIFIR32) idMap.set(id, ic(k, j)); });
  }
}

/// Route `call` (the OApp's Call<EndpointQuoteParam | EndpointSendParam, …>, a result of `tx`)
/// through the endpoint: `tur` "quote" or "send". The calls are added to `tx`.
export async function lzYonlendir({ client, Transaction, tx, call, gonderen, tur }) {
  const id = await idler(client, Transaction, gonderen);
  const deneme = Transaction.from(tx);
  deneme.moveCall({ target: LZ_SUI.ptbPaket + "::endpoint_ptb_builder::build_" + tur + "_ptb_by_call",
    arguments: [deneme.object(LZ_SUI.ptbNesne), deneme.object(LZ_SUI.endpoint), call] });
  const s = await incele(client, deneme, gonderen);
  const liste = moveCallCoz(s[s.length - 1].returnValues[0][0]);
  const kayit = { paketler: new Set(), nesneler: new Set() };
  await isle(client, Transaction, tx, liste, new Map([[id[tur], call]]), gonderen, kayit);
  await denetle(client, Transaction, kayit, gonderen);
}

/* the whitelist (on chain) and the shared-objects rule over everything the routing added */
async function denetle(client, Transaction, kayit, gonderen) {
  const paketler = [...kayit.paketler].filter((p) => !/^0x0*[12]$/.test(p));
  const tx = new Transaction();
  tx.moveCall({ target: LZ_SUI.beyazPaket + "::package_whitelist_validator::validate",
    arguments: [tx.object(LZ_SUI.beyazNesne), tx.pure.vector("address", paketler)] });
  const s = await incele(client, tx, gonderen);
  if (s[0].returnValues[0][0][0] !== 1) throw new Error("LayerZero routing on Sui called a package outside LayerZero's whitelist; refused.");
  const nesneler = [...kayit.nesneler];
  for (let i = 0; i < nesneler.length; i += 50) {
    const o = await client.multiGetObjects({ ids: nesneler.slice(i, i + 50), options: { showOwner: true } });
    for (const x of o) {
      const sahip = x.data && x.data.owner;
      if (!sahip || !(sahip.Shared || sahip === "Immutable")) throw new Error("LayerZero routing on Sui touched an object that is not shared (" + (x.data ? x.data.objectId : "?") + "); refused.");
    }
  }
}

/// The endpoint's quote for the Call `kur(tx)` returns: { nativeFee, zroFee } (MIST).
export async function lzSuiTeklif({ client, Transaction, kur, gonderen }) {
  const tx = new Transaction();
  const call = kur(tx);
  await lzYonlendir({ client, Transaction, tx, call, gonderen, tur: "quote" });
  /* the fee the endpoint wrote into the Call: call::result(&call) -> &Option<MessagingFee>, then borrow */
  const P = LZ_SUI.endpointPaket;
  const [sonuc] = tx.moveCall({ target: LZ_SUI.callPaket + "::call::result", typeArguments: [P + "::endpoint_quote::QuoteParam", P + "::messaging_fee::MessagingFee"], arguments: [call] });
  tx.moveCall({ target: "0x1::option::borrow", typeArguments: [P + "::messaging_fee::MessagingFee"], arguments: [sonuc] });
  const s = await incele(client, tx, gonderen);
  const b = Uint8Array.from(s[s.length - 1].returnValues[0][0]);
  const dv = new DataView(b.buffer);
  return { nativeFee: dv.getBigUint64(0, true), zroFee: dv.getBigUint64(8, true) };
}
