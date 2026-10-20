/* denetim-sui-ikiz.mjs: docs/js/sui-ikiz.js's pieces on Sui mainnet, nothing sent.
   The twin template rewritten for a token's name and symbol is dry-run published
   from the deployer's address; the live gate's views decode. */
import fs from "fs";
const V = await import("file:///C:/arc-launchpad/docs/vendor/sui.mjs");
const { Transaction, bcs, fromBase64, toBase64, update_identifiers, update_constants, sablonYukle, SuiJsonRpcClient } = V;
let g = 0, k = 0;
const ok = (c, ad, d) => { c ? g++ : k++; console.log((c ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const kayit = JSON.parse(fs.readFileSync("C:/arc-launchpad/dagitim-v2.json", "utf8")).uzak.sui;
const istemci = new SuiJsonRpcClient({ url: "https://sui-rpc.publicnode.com", network: "mainnet" });
const SAHIP = "0x9d547e639e4dad7b98f1ec9a6e8d684f42dd289fb0875f08a2ed8fc77fe7f078";   // the Sui deployer (read only)
console.log("SUI IKIZ  coin tipi kaydi parcalari (Sui ana ag, gonderim yok)");

await sablonYukle({ module_or_path: fs.readFileSync("C:/arc-launchpad/docs/vendor/move_bytecode_template_bg.wasm") });
const j = JSON.parse(fs.readFileSync("C:/arc-launchpad/docs/veri/sui-ikiz-sablon.json", "utf8"));
const vekU8 = (s) => bcs.vector(bcs.u8()).serialize(Array.from(new TextEncoder().encode(s))).toBytes();
const ad = "Prova Ortak", sembol = "PROVA", OTW = "PROVA";
let b = fromBase64(j.modules[0]);
b = update_identifiers(b, { IKIZ: OTW, ikiz: OTW.toLowerCase() });
b = update_constants(b, vekU8(sembol), vekU8("IKIZSABLON"), "Vector(U8)");
b = update_constants(b, vekU8(ad), vekU8("Ikiz Token Name Placeholder 0000"), "Vector(U8)");
const metin = Buffer.from(b).toString("latin1");
ok(metin.includes(ad) && metin.includes(sembol) && !metin.includes("IKIZSABLON"), "sablon tokenin ad ve sembolune yeniden yazildi");

const tx = new Transaction();
const cap = tx.publish({ modules: [toBase64(b)], dependencies: j.dependencies });
tx.moveCall({ target: "0x2::package::make_immutable", arguments: [cap] });
tx.setSender(SAHIP);
const sim = await istemci.dryRunTransactionBlock({ transactionBlock: await tx.build({ client: istemci }) });
const durum = sim.effects.status.status;
const cur = (sim.objectChanges || []).find((o) => o.type === "created" && /::coin_registry::Currency</.test(o.objectType || ""));
const tc = (sim.objectChanges || []).find((o) => o.type === "created" && /::coin::TreasuryCap</.test(o.objectType || ""));
ok(durum === "success" && cur && tc, "yeniden yazilmis coin Sui ana aginda yayinlanabiliyor: Currency kutuge, TreasuryCap gonderene", durum);
ok(cur && cur.owner && cur.owner.AddressOwner === "0x000000000000000000000000000000000000000000000000000000000000000c", "Currency coin kutugune (0xc) gidiyor (finalize_registration bunu paylasir)");

const pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const oku = async (fn) => {
  const t = new Transaction();
  t.moveCall({ target: kayit.ikizPaket + "::kapi::" + fn, arguments: [t.object(kayit.kapiNesne), t.pure.address(pad("0x1234"))] });
  const r = await istemci.devInspectTransactionBlock({ sender: pad("0x0"), transactionBlock: t });
  return Uint8Array.from(r.results[0].returnValues[0][0]);
};
const bek = bcs.option(bcs.struct("Ad", { ad: bcs.string(), sembol: bcs.string() })).parse(await oku("beklenen"));
const tip = bcs.option(bcs.struct("TypeName", { name: bcs.string() })).parse(await oku("tip"));
ok(bek === null && tip === null, "canli Sui kapisi okunuyor: bilinmeyen token icin beklenen ve tip bos");
console.log("\n" + g + " gecti, " + k + " kaldi");
process.exit(k ? 1 : 0);
