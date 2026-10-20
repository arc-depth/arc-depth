"use strict";
/* ===========================================================================
 * bekci-sui.js — keeper task 2a: deliveries into the Sui vault
 *
 *   node scripts/bekci-sui.js --tx <arc|base|…> <hash>            dry
 *   node scripts/bekci-sui.js --tx <arc|base|…> <hash> --uygula   send
 *   (NODE_PATH must reach @mysten/sui, e.g. C:/Users/omen/araclar/suisdk/node_modules)
 *
 * For Sui the EVM Haberci sends TWO CCTP messages (sui/pulse-sepet haberci.move):
 *   a plain burn minted to the Kasa object — anyone completes it with
 *     Circle's standard flow: receive_message -> prepare_mint<USDC> ->
 *     the USDC mint handler's mint -> complete_mint; then kasa::kabul takes
 *     the coin the Kasa object received into its pool;
 *   a payload to this package's auth identifier — only our module stamps it:
 *     haberci::bilet -> receive_message_with_package_auth -> haberci::isle
 *     -> stamp_receipt -> complete_receive_message; isle records the order.
 * Then each new buy order is opened as an auction: kasa::uygula_al<USDC,T>,
 * where T is the coin the order names. A coin is named on chain only by the
 * hash of its type; the type itself comes from the gate's SepetTipleri event
 * (next gate version) or, for the test launch, its record. The vault checks
 * tip_kimligi<T>() against the order, so a wrong T only fails.
 * Every transaction is dry-run first. Circle's objects are mainnet's,
 * read from chain (a recent Circle mint transaction's inputs) on 18 Oct.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
const { Transaction } = require("@mysten/sui/transactions");
const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
const { keccak256, toUtf8Bytes } = require("ethers");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const TX = process.argv.includes("--tx") ? { zincir: process.argv[process.argv.indexOf("--tx") + 1], hash: process.argv[process.argv.indexOf("--tx") + 2] } : null;
const RPC = "https://sui-rpc.publicnode.com";
const IRIS = "https://iris-api.circle.com/v2/messages/";
const DOMAIN = { arc: 26, base: 6, arbitrum: 3, avalanche: 1, monad: 15, hyperevm: 19, bsc: 17, ethereum: 0, robinhood: 35, aptos: 9 };
const C = {
  MT: "0x16bcfcfc465f96281663a344641c017de84529370e11aa3879d0dce43ad6db87",
  TMM: "0xeb14978abfe93a37c5d5bf86a0623b923553a5f0e794daac7724f1e2fdbfb830",
  HANDLER: "0x185ed207c4d64fc594882ab927f9f3c6ff957aad03df8a731ba64378faeeb2bf",
  MT_STATE: "0x0c067f7d325e5b60e3179712e7783534ba1556cbb3d359d8161497e37689230c",
  TMM_STATE: "0x06fb166941cd7bc095edc019d054a753ec3f1e4c25f28f2ecc4a6cfa0a9b1167",
  HANDLER_STATE: "0xa32de8a6dd0178fb05f662929d55cddb69a25c26bde4b83f89e36d17ead94c41",
  TREASURY: "0x57d6725e7a8b49a7b2a612f6bd66ab5f39fc95332ca48be421c3229d514a6de7",
  DENY: "0x0000000000000000000000000000000000000000000000000000000000000403",
  CLOCK: "0x0000000000000000000000000000000000000000000000000000000000000006",
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
};
const kayit = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sepet.json"), "utf8")).sui;
const PKG = kayit.paket, HABERCI = kayit.haberci, KASA = kayit.kasa, YETKI = kayit.yetki;

/* coin types this keeper can name, keyed by the hash the vault stores */
function tipler() {
  const t = {};
  const ekle = (tip) => { if (tip) t[keccak256(toUtf8Bytes(tip.replace(/^0x/, "")))] = "0x" + tip.replace(/^0x/, ""); };
  const f = path.join(KOK, "dagitim-test-launch.json");
  if (fs.existsSync(f)) for (const s of JSON.parse(fs.readFileSync(f, "utf8")).sepet) ekle(s.tip);
  const g = path.join(KOK, "rapor", "sui-tipler.json");          // filled from SepetTipleri by the next gate version
  if (fs.existsSync(g)) for (const tip of JSON.parse(fs.readFileSync(g, "utf8"))) ekle(tip);
  return t;
}
const hex = (s) => Array.from(Buffer.from(s.replace(/^0x/, ""), "hex"));

(async () => {
  const istemci = new SuiJsonRpcClient({ url: RPC, network: "mainnet" });
  const anahtar = (fs.readFileSync(path.join(KOK, ".env"), "utf8").match(/^SUI_PRIVATE_KEY\s*=\s*([0-9a-fA-F]{64})\s*$/m) || [])[1];
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(anahtar, "hex"));
  const ben = imzaci.getPublicKey().toSuiAddress();
  let acik = 0;   // messages neither delivered now nor already delivered
  const calistir = async (etiket, tx, mesaj) => {
    tx.setSender(ben);
    let yapi;
    try { yapi = await tx.build({ client: istemci }); }
    catch (e) {
      /* receive_message aborts with 4 when CCTP has used the nonce: delivered before */
      if (mesaj && e.message.includes("receive_message") && e.message.includes("}, 4)")) { console.log("  " + etiket + ": zaten teslim"); return {}; }
      if (mesaj) acik++;
      console.log("  " + etiket + ": " + e.message.slice(0, 160)); return null;
    }
    const sim = await istemci.dryRunTransactionBlock({ transactionBlock: yapi });
    if (sim.effects.status.status !== "success" && mesaj) acik++;
    if (sim.effects.status.status !== "success") { console.log("  " + etiket + ": simulasyon " + sim.effects.status.error); return null; }
    if (!UYGULA) { console.log("  (kuru) " + etiket + ": simulasyon tamam"); return {}; }
    const r = await istemci.signAndExecuteTransaction({ signer: imzaci, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
    await istemci.waitForTransaction({ digest: r.digest });
    console.log("  " + etiket.padEnd(30) + r.digest + "  " + r.effects.status.status);
    return r;
  };
  console.log("BEKCI SUI  " + (UYGULA ? "UYGULA" : "KURU") + "  kasa " + KASA.slice(0, 10) + "…  imzaci " + ben.slice(0, 10) + "…");
  /* without --tx: every send bekci.js queued for Sui */
  const KUYRUK = path.join(KOK, "rapor", "bekci-move-kuyruk.json");
  const kuyruk = fs.existsSync(KUYRUK) ? JSON.parse(fs.readFileSync(KUYRUK, "utf8")) : [];
  const isler = TX ? [{ kaynak: TX.zincir, hash: TX.hash }] : kuyruk.filter((x) => x.hedef === 8);
  if (!isler.length) console.log("  kuyrukta Sui gonderimi yok");
  for (const is of isler) {
  acik = 0;
  const r = await fetch(IRIS + DOMAIN[is.kaynak] + "?transactionHash=" + is.hash).then((x) => x.json());
  const mesajlar = (r.messages || []).filter((m) => Number(m.decodedMessage && m.decodedMessage.destinationDomain) === 8);
  console.log("  " + mesajlar.length + " Sui mesaji, " + mesajlar.filter((m) => m.status === "complete").length + " onayli");
  const yuk = mesajlar.filter((m) => m.decodedMessage.recipient && m.decodedMessage.recipient.toLowerCase() === YETKI.toLowerCase());
  const yakim = mesajlar.filter((m) => !yuk.includes(m));

  /* 2. the dollars: Circle's standard mint to the Kasa object, then into its pool */
  for (const m of yakim) {
    if (m.status !== "complete") { console.log("  dolar mesaji onay bekliyor"); continue; }
    const tx = new Transaction();
    const [rcp] = tx.moveCall({ target: C.MT + "::receive_message::receive_message", arguments: [tx.pure.vector("u8", hex(m.message)), tx.pure.vector("u8", hex(m.attestation)), tx.object(C.MT_STATE)] });
    const [mr] = tx.moveCall({ target: C.TMM + "::handle_receive_message::prepare_mint", typeArguments: [C.USDC], arguments: [rcp, tx.object(C.TMM_STATE), tx.object(C.CLOCK)] });
    const [bilet] = tx.moveCall({ target: C.HANDLER + "::handler::mint", arguments: [tx.object(C.HANDLER_STATE), mr, tx.object(C.TMM_STATE), tx.object(C.TREASURY), tx.object(C.DENY)] });
    tx.moveCall({ target: C.TMM + "::handle_receive_message::complete_mint", typeArguments: [C.USDC, C.HANDLER + "::handler::Auth"], arguments: [bilet, tx.object(C.TMM_STATE), tx.object(C.MT_STATE)] });
    await calistir("dolar basimi ($" + Number(m.decodedMessage.decodedMessageBody.amount) / 1e6 + ")", tx, true);
  }
  const coinler = await istemci.getOwnedObjects({ owner: KASA, filter: { StructType: "0x2::coin::Coin<" + C.USDC + ">" } });
  for (const c of coinler.data) {
    const tx = new Transaction();
    tx.moveCall({ target: PKG + "::kasa::kabul", typeArguments: [C.USDC], arguments: [tx.object(KASA), tx.receivingRef({ objectId: c.data.objectId, version: c.data.version, digest: c.data.digest })] });
    await calistir("kabul (kasaya giren coin)", tx);
  }

  /* 3. the order: only our package can stamp it */
  for (const m of yuk) {
    if (m.status !== "complete") { console.log("  emir mesaji onay bekliyor"); continue; }
    const tx = new Transaction();
    const [bilet] = tx.moveCall({ target: PKG + "::haberci::bilet", arguments: [tx.pure.vector("u8", hex(m.message)), tx.pure.vector("u8", hex(m.attestation))] });
    const [rcp] = tx.moveCall({ target: C.MT + "::receive_message::receive_message_with_package_auth", typeArguments: [PKG + "::haberci::HaberciYetki"], arguments: [bilet, tx.object(C.MT_STATE)] });
    const [s] = tx.moveCall({ target: PKG + "::haberci::isle", typeArguments: [C.USDC], arguments: [tx.object(HABERCI), tx.object(KASA), rcp] });
    const [z] = tx.moveCall({ target: C.MT + "::receive_message::stamp_receipt", typeArguments: [PKG + "::haberci::HaberciYetki"], arguments: [s, tx.object(C.MT_STATE)] });
    tx.moveCall({ target: C.MT + "::receive_message::complete_receive_message", arguments: [z, tx.object(C.MT_STATE)] });
    await calistir("emir (isle)", tx, true);
  }
  if (mesajlar.some((m) => m.status !== "complete")) acik++;
  if (!TX && UYGULA && acik === 0 && mesajlar.length) {
    const k2 = JSON.parse(fs.readFileSync(KUYRUK, "utf8")).filter((x) => !(x.hash === is.hash && x.hedef === 8));
    fs.writeFileSync(KUYRUK, JSON.stringify(k2, null, 1));
    console.log("  " + is.hash.slice(0, 12) + "… tamam, kuyruktan cikti");
  }
  }

  /* 4. open every recorded buy order whose coin this keeper can name */
  const k = await istemci.getObject({ id: KASA, options: { showContent: true } });
  const tablo = k.data.content.fields.emirler.fields.id.id;
  const alanlar = await istemci.getDynamicFields({ parentId: tablo });
  const T = tipler();
  for (const a of alanlar.data) {
    const o = await istemci.getObject({ id: a.objectId, options: { showContent: true } });
    const e = o.data.content.fields.value.fields;
    if (e.yapildi || Number(e.tur) !== 2) continue;
    const tip = T[e.varlik.startsWith("0x") ? e.varlik : "0x" + e.varlik];
    if (!tip) { console.log("  emir #" + a.name.value + ": coin tipi bilinmiyor (" + e.varlik.slice(0, 12) + "…), bekliyor"); continue; }
    const tx = new Transaction();
    tx.moveCall({ target: PKG + "::kasa::uygula_al", typeArguments: [C.USDC, tip], arguments: [tx.object(KASA), tx.pure.u64(a.name.value), tx.object(C.CLOCK)] });
    await calistir("ihale ac #" + a.name.value + " (" + tip.split("::").slice(1).join("::") + ", $" + Number(e.dolar) / 1e6 + ")", tx);
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
