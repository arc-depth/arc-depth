/* ===========================================================================
 * denetim-lz-istemci.mjs — our LayerZero clients against LayerZero's SDKs
 * (mainnet reads and simulations only; nothing is sent)
 *
 *   node scripts/denetim-lz-istemci.mjs
 *
 * The site ships its own code for the two places it talks to LayerZero's
 * endpoints outside EVM (docs/js/lz-solana-hesap.js, docs/js/lz-sui-ptb.js);
 * LayerZero's SDKs are only used HERE, locally, as the reference:
 *   Solana  the endpoint `quote` and `send` CPI accounts for the gate's store
 *           -> the hub on Arc: same accounts, same order, same flags
 *   Sui     the quote of the gate's kapi::teklif Call: same fee, same Move
 *           calls with the same arguments and inputs
 *   Sui     a send routed through the endpoint: captured where the SDK
 *           routes a real Call (LayerZero's own OFT send of our FTHM OFT on
 *           Sui, zero coins), then routed by our code from the same point;
 *           same Move calls, arguments and inputs
 * =========================================================================== */
import { createRequire } from "module";
const solReq = createRequire("C:/Users/omen/araclar/sol/node_modules/x.js");
const suiReq = createRequire("C:/Users/omen/araclar/suisdk/node_modules/x.js");
const { Connection, PublicKey } = solReq("@solana/web3.js");
const lzSol = solReq("@layerzerolabs/lz-solana-sdk-v2");
const { SuiJsonRpcClient } = suiReq("@mysten/sui/jsonRpc");
const { Transaction } = suiReq("@mysten/sui/transactions");
const { SDK } = suiReq("@layerzerolabs/lz-sui-sdk-v2");
const { OFT } = suiReq("@layerzerolabs/lz-sui-oft-sdk-v2");
const K = "file:///C:/arc-launchpad/docs/js/";
const H = await import(K + "lz-solana-hesap.js");
const P = await import(K + "lz-sui-ptb.js");
const fs = await import("fs");

let g = 0, k = 0;
const ok = (c, ad, d) => { c ? g++ : k++; console.log((c ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
console.log("LZ ISTEMCILERI  bizim kod / LayerZero SDK (ana ag, gonderim yok)");

/* ---- Solana ---- */
console.log("Solana");
const conn = new Connection("https://solana-rpc.publicnode.com", "confirmed");
const EP = "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6";
const kapi = new PublicKey("G91zXh4LCEzY7UgE3JWic3Kt5ckBsnibkgdAXABatWJQ");
const [store] = PublicKey.findProgramAddressSync([Buffer.from("Store")], kapi);
const hub = "F1C0DfC647908808dACC7c64Eed1f75FEA67D2e2".toLowerCase().padStart(64, "0");
const user = new PublicKey("5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh");
const ep = new lzSol.EndpointProgram.Endpoint(new PublicKey(EP));
const uln = new lzSol.UlnProgram.Uln(new PublicKey("7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH"));
const yaz = (l) => l.map((x) => x.pubkey.toBase58() + (x.isSigner ? "S" : "-") + (x.isWritable ? "W" : "-"));
for (const [tur, f] of [["quote", "getQuoteIXAccountMetaForCPI"], ["send", "getSendIXAccountMetaForCPI"]]) {
  const a = yaz(await ep[f](conn, user, { sender: store.toBytes(), dstEid: 30417, receiver: "0x" + hub }, uln));
  const b = yaz(await H.lzHesaplari({ conn, PublicKey, endpoint: EP, gonderen: store.toBase58(), hedefEid: 30417, alici32: Buffer.from(hub, "hex"), odeyen: user.toBase58(), tur }));
  ok(JSON.stringify(a) === JSON.stringify(b), "uc nokta " + tur + " hesaplari SDK ile ayni (sira ve bayraklar)", a.length + " / " + b.length);
}

/* ---- Sui ---- */
console.log("Sui");
const client = new SuiJsonRpcClient({ url: "https://sui-rpc.publicnode.com", network: "mainnet" });
const sdk = new SDK({ client });
const ben = "0x9d547e639e4dad7b98f1ec9a6e8d684f42dd289fb0875f08a2ed8fc77fe7f078";
const G = { paket: "0xe397f5cf0c1382cfff29068d73a60aa186436bcdfe3b0fdd8d46ba02a4446bfb", kapi: "0x05611ea5fa7f6b91d3cf9e934bd198d29c8898683b23995a6578706af5183dad",
  oapp: "0xfddd7363e4a8fc4fee42c47952beece8fdae712b4d3ff231b7cdb6588ba5fe46" };
const kur = (tx) => tx.moveCall({ target: G.paket + "::kapi::teklif", arguments: [tx.object(G.kapi), tx.object(G.oapp),
  tx.pure.address("0x" + "8c2016b8dbb9034c2fe173000639a9a1380b26ae".padStart(64, "0")), tx.pure.vector("u8", Array(32).fill(1)), tx.pure.u64(1_000_000), tx.pure.vector("u8", [])] });
/* commands and inputs, addresses normalised (the SDK and we may spell a package with or without leading zeros) */
const n = (a) => String(a).replace(/^0x0*/, "0x");
const ozet = (tx, bas, son) => {
  const d = tx.getData();
  const girdi = (i) => { const x = d.inputs[i]; return x.Pure ? "pure:" + x.Pure.bytes : "obj:" + n((x.UnresolvedObject || x.Object?.SharedObject || x.Object?.ImmOrOwnedObject || {}).objectId); };
  const argY = (a) => (a.$kind === "Input" ? girdi(a.Input) : JSON.stringify(a.NestedResult || a.Result || a.$kind));
  return JSON.stringify(d.commands.slice(bas, son).map((c) => c.MoveCall
    ? [n(c.MoveCall.package), c.MoveCall.module, c.MoveCall.function, c.MoveCall.typeArguments.map((t) => t.replace(/^0x0*/, "")), c.MoveCall.arguments.map(argY)]
    : c.$kind));
};
{
  const t1 = new Transaction(); const c1 = kur(t1); const f1 = await sdk.getEndpoint().quote(t1, c1, ben);
  const f2 = await P.lzSuiTeklif({ client, Transaction, kur, gonderen: ben });
  ok(f1.nativeFee === f2.nativeFee && f1.zroFee === f2.zroFee, "kapi::teklif ucreti SDK ile ayni", f1.nativeFee + " / " + f2.nativeFee + " MIST");
  const t2 = new Transaction(); const c2 = kur(t2); await P.lzYonlendir({ client, Transaction, tx: t2, call: c2, gonderen: ben, tur: "quote" });
  const say = t2.getData().commands.length;
  ok(ozet(t1, 0, say) === ozet(t2, 0, say), "quote yonlendirmesi: Move cagrilari, argumanlar ve girdiler SDK ile ayni", (say - 1) + " cagri");
}
{
  /* a send Call as LayerZero's own OFT makes it: catch it where the SDK routes it, route it with ours from the same point */
  const F = JSON.parse(fs.readFileSync("C:/arc-launchpad/dagitim-sui-fthm.json", "utf8"));
  const oft = new OFT(sdk, F.paket, F.oft, F.coinTipi, F.oapp, F.adminCap);
  const endp = sdk.getEndpoint();
  const asil = endp.populateSendTransaction.bind(endp);
  let bizim = null, bas = 0;
  endp.populateSendTransaction = async (tx, call, sender, ...r) => {
    const kopya = Transaction.from(tx);
    bas = tx.getData().commands.length;
    await P.lzYonlendir({ client, Transaction, tx: kopya, call, gonderen: sender, tur: "send" });
    bizim = kopya;
    return asil(tx, call, sender, ...r);
  };
  const sp = { dstEid: 30184, to: new Uint8Array(32).fill(7), amountLd: 0n, minAmountLd: 0n, extraOptions: new Uint8Array(), composeMsg: new Uint8Array(), oftCmd: new Uint8Array() };
  const t = new Transaction(); t.setSender(ben);
  const sifir = t.moveCall({ target: "0x2::coin::zero", typeArguments: [F.coinTipi] });
  let hata = null;
  const ucret = (await oft.quoteSend(ben, sp, false)).nativeFee;
  try { await oft.sendMoveCall(t, ben, sp, sifir, ucret, 0n, ben); } catch (e) { hata = e.message; }
  if (!bizim) ok(false, "send yonlendirmesi karsilastirilamadi", hata);
  else {
    const son = bizim.getData().commands.length;
    ok(!hata && ozet(t, bas, son) === ozet(bizim, bas, son), "send yonlendirmesi: Move cagrilari, argumanlar ve girdiler SDK ile ayni", (son - bas) + " cagri" + (hata ? "; SDK: " + hata : ""));
    const r = await client.devInspectTransactionBlock({ sender: ben, transactionBlock: bizim });
    ok(r.effects.status.status === "success", "bizim yonlendirdigimiz send islemi devInspect'te calisti", r.effects.status.error || "success");
  }
}
console.log("\n" + g + "/" + (g + k) + " gecti");
process.exitCode = k ? 1 : 0;
