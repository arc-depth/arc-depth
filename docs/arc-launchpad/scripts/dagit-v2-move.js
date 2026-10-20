"use strict";
/* ===========================================================================
 * dagit-v2-move.js — Sui and Aptos for the second basket generation
 *
 *   set NODE_PATH=C:/Users/omen/araclar/aptossdk/node_modules;C:/Users/omen/araclar/suisdk/node_modules;C:/arc-launchpad/node_modules
 *   node scripts/dagit-v2-move.js [sui|aptos] [--uygula]
 *
 * Needs the EVM set first (dagit-v2.js kur): the Defter and HaberciLZ on Arc,
 * AktarmaLZ on Base. Writes what the EVM wiring needs into dagitim-v2.json
 * (uzak.sui, uzak.aptos); then `dagit-v2.js bagla` binds both sides.
 *
 * BASKET VAULTS. LayerZero does not connect Arc to Sui or Aptos, so the Arc
 * HaberciLZ sends their orders over CCTP in the v1 wire format; the v1
 * packages take exactly that (proven on mainnet with PTEST1). They are
 * published again, bound to the new Defter and the Arc HaberciLZ:
 *   Sui    publish sui/pulse-sepet; haberci::kur<USDC>(8, 26, Defter);
 *          ikiz_ekle(26, Arc HaberciLZ). The EVM twin is the package's CCTP
 *          auth identity (yetki).
 *   Aptos  a new account (APTOS_SEPET2_PRIVATE_KEY; module names cannot be
 *          published twice on one account); publish aptos/pulse-sepet;
 *          haberci::kur(9, USDC, 26, Defter); ikiz_ekle(26, Arc HaberciLZ).
 * TWIN GATES (the launch tokens' twins, through the Base hop):
 *   Sui    publish sui/ikiz; kapi::kur(30184); kapi::kaydol (endpoint);
 *          peer Base = AktarmaLZ; enforced options toward Base; ULN configs
 *          (LayerZero Labs + Nethermind, Sui sends with 5, Base with 10).
 *          The peer Base sees is the package address (a package CallCap).
 *   Aptos  a new account (APTOS_IKIZ_PRIVATE_KEY) holds pulse_ikiz; kur;
 *          delegate; peer; enforced options; ULN configs (Aptos sends with
 *          260, Base with 10).
 * Nothing here is locked: the UpgradeCaps, AdminCap and account keys are
 * closed with the rest of the set after the joint test launch.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const SECILEN = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const KAYIT = process.env.V2_KAYIT || path.join(KOK, "dagitim-v2.json");   // V2_KAYIT: a dry run against predicted addresses
const ENV = path.join(KOK, ".env");
const SUI_CLI = "C:/Users/omen/araclar/sui/sui.exe";
const APTOS_CLI = "C:/Users/omen/araclar/aptos/aptos.exe";
const SUI_RPC = "https://sui-rpc.publicnode.com";
const SUI_USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const APTOS_USDC = "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b";
const ARC = 26, SUI = 8, APTOS = 9, BASE_EID = 30184, FONLAMA_APT = 0.6;
const ONAY_BASE = 10, ONAY_SUI = 5, ONAY_APTOS = 260;
/* LayerZero Labs + Nethermind on Sui and Aptos (LayerZero metadata, 18 Oct) */
const SUI_DVN = ["0x0c12321ebe562b8fb8a74e6d29f144ea199a8f31a4cea3a417ce72477f6dfebb", "0x52aa129049de845353484868d1be6e2df6878b0ed2213d94d3c827309aeae685"];
const APTOS_DVN = ["0x07ad47ea4f858e7189d2c6e7327f166993e8f884386db9564d732bcff63fe4ff", "0xf3f0a412626edba5ddd3613d91109b241893873ac5479ade231cf0b3130572b5"];
const APTOS_ULN = "0xc33752e0220faf79e45385dd73fb28d681dcd9f1569a1480725507c1f3c3aba9";
/* executor options toward Base: lzReceive gas for the hop, and the native value
   its second hop to Arc costs (measured 0.000108 ETH, 18 Oct; the rest stays
   in the hop for later hops) */
const BASE_SECENEK = { gaz: 250_000, deger: 200_000_000_000_000n };
/* what the hop needs to deliver on Sui / Aptos (gas units there, no value) */
const UZAK_GAZ = 10_000;
/* the value IkizHub sends with a message to the hop: Base -> Sui 0.000525 ETH, -> Aptos 0.000142 (18 Oct), with headroom */
const IKINCI_ADIM = { sui: 800_000_000_000_000n, aptos: 250_000_000_000_000n };

const kayit = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
kayit.uzak ||= {};
const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };
const ozel = (ad) => { const m = fs.readFileSync(ENV, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m")); return m ? m[1].trim() : null; };
const pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const A = kayit.zincir.arc || {}, B = kayit.zincir.base || {};
if (!A.SepetDefteri || !A.HaberciLZ || !B.AktarmaLZ) { console.error("once EVM seti: dagit-v2.js kur --uygula"); process.exit(1); }
const DEFTER = pad(A.SepetDefteri), ARC_HABERCI = pad(A.HaberciLZ), AKTARMA = pad(B.AktarmaLZ);
const hex = (b) => "0x" + Buffer.from(b).toString("hex");
/* LayerZero type 3 options: executor lzReceive (gas[, value]) */
const secenek = (gaz, deger) => deger
  ? "0x0003010021" + "01" + BigInt(gaz).toString(16).padStart(32, "0") + BigInt(deger).toString(16).padStart(32, "0")
  : "0x0003010011" + "01" + BigInt(gaz).toString(16).padStart(32, "0");

/* ---- Sui ------------------------------------------------------------------ */
async function sui() {
  const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
  const { Transaction } = require("@mysten/sui/transactions");
  const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
  const { SDK, OAppUlnConfigBcs } = require("@layerzerolabs/lz-sui-sdk-v2");
  const client = new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" });
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(ozel("SUI_PRIVATE_KEY"), "hex"));
  const ben = imzaci.getPublicKey().toSuiAddress();
  const k = (kayit.uzak.sui ||= {});
  const calistir = async (etiket, tx) => {
    tx.setSender(ben);
    const sim = await client.dryRunTransactionBlock({ transactionBlock: await tx.build({ client }) });
    if (sim.effects.status.status !== "success") throw new Error("Sui " + etiket + " simulasyon: " + JSON.stringify(sim.effects.status));
    const g = sim.effects.gasUsed, ucret = (Number(g.computationCost) + Number(g.storageCost) - Number(g.storageRebate)) / 1e9;
    if (!UYGULA) { console.log("  (kuru) Sui " + etiket.padEnd(34) + "simulasyon tamam, ~" + ucret.toFixed(4) + " SUI"); return null; }
    const r = await client.signAndExecuteTransaction({ signer: imzaci, transaction: tx, options: { showEffects: true, showObjectChanges: true, showEvents: true } });
    await client.waitForTransaction({ digest: r.digest });
    if (r.effects.status.status !== "success") throw new Error("Sui " + etiket);
    console.log("  Sui " + etiket.padEnd(38) + r.digest);
    return r;
  };
  const yayinla = async (dizin, etiket) => {
    const cikti = cp.execFileSync(SUI_CLI, ["move", "build", "--dump-bytecode-as-base64", "-e", "mainnet", "--path", path.join(KOK, "sui", dizin)],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20, env: { ...process.env, SUI_CONFIG_DIR: path.join(KOK, "ozel", "sui-ana-cfg") } });
    const { modules, dependencies } = JSON.parse(cikti.slice(cikti.indexOf("{")));
    const tx = new Transaction();
    const cap = tx.publish({ modules, dependencies });
    tx.transferObjects([cap], ben);
    return calistir(etiket, tx);
  };
  const yeni = (r, son) => r.objectChanges.find((o) => o.type === "created" && o.objectType.endsWith(son));
  console.log("SUI  " + ben + "  bakiye " + Number((await client.getBalance({ owner: ben })).totalBalance) / 1e9 + " SUI");

  /* A: the basket vault, bound to the new Defter */
  if (!k.paket) {
    const r = await yayinla("pulse-sepet", "publish pulse-sepet");
    if (!r) { console.log("  (kuru) kur / ikiz_ekle paket yayinlaninca simule edilir"); }
    else { k.paket = r.objectChanges.find((o) => o.type === "published").packageId; k.upgradeCap = yeni(r, "::package::UpgradeCap").objectId; yaz(); }
  }
  if (k.paket && !k.haberci) {
    const tx = new Transaction();
    tx.moveCall({ target: k.paket + "::haberci::kur", typeArguments: [SUI_USDC], arguments: [tx.pure.u32(SUI), tx.pure.u32(ARC), tx.pure.address(DEFTER)] });
    const r = await calistir("haberci::kur<USDC>", tx);
    if (r) { k.haberci = yeni(r, "::haberci::Haberci").objectId; k.kasa = pad(r.objectChanges.find((o) => o.type === "created" && o.objectType.includes("::kasa::Kasa<")).objectId); yaz(); }
  }
  if (k.haberci && !k.ikizArc) {
    const tx = new Transaction();
    tx.moveCall({ target: k.paket + "::haberci::ikiz_ekle", arguments: [tx.object(k.haberci), tx.pure.u32(ARC), tx.pure.address(ARC_HABERCI)] });
    const r = await calistir("ikiz_ekle(Arc HaberciLZ)", tx);
    if (r) { k.ikizArc = r.digest; yaz(); }
  }
  if (k.paket && !k.karsi) {
    const tx = new Transaction();
    tx.moveCall({ target: k.paket + "::haberci::yetki_kimligi" });
    const d = await client.devInspectTransactionBlock({ sender: ben, transactionBlock: tx });
    k.karsi = pad("0x" + Buffer.from(d.results[0].returnValues[0][0]).toString("hex")); yaz();
  }

  /* B: the twin gate */
  const sdk = new SDK({ client });
  if (!k.ikizPaket) {
    const r = await yayinla("ikiz", "publish PulseIkiz");
    if (!r) { console.log("  (kuru) ikiz kapisi ayarlari paket yayinlaninca simule edilir"); return; }
    k.ikizPaket = r.objectChanges.find((o) => o.type === "published").packageId;
    k.ikizUpgradeCap = yeni(r, "::package::UpgradeCap").objectId;
    k.kapiNesne = yeni(r, "::kapi::Kapi").objectId;
    k.oapp = yeni(r, "::oapp::OApp").objectId;
    k.adminCap = yeni(r, "::oapp::AdminCap").objectId;
    k.ikizKapi = pad(k.ikizPaket);
    yaz();
  }
  if (!k.kuruldu) {
    const tx = new Transaction();
    tx.moveCall({ target: k.ikizPaket + "::kapi::kur", arguments: [tx.object(k.kapiNesne), tx.pure.u32(BASE_EID)] });
    tx.moveCall({ target: k.ikizPaket + "::kapi::kaydol", arguments: [tx.object(k.kapiNesne), tx.object(k.oapp), tx.object(k.adminCap), tx.object(sdk.objects.endpointV2)] });
    const r = await calistir("kapi::kur + kaydol", tx);
    if (!r) return;
    k.kuruldu = r.digest; yaz();
  }
  if (!k.lzAyar) {
    const oapp = sdk.getOApp(k.ikizPaket);
    const tx = new Transaction();
    await oapp.setPeerMoveCall(tx, BASE_EID, Uint8Array.from(Buffer.from(AKTARMA.slice(2), "hex")));
    await oapp.setEnforcedOptionsMoveCall(tx, BASE_EID, 1, Uint8Array.from(Buffer.from(secenek(BASE_SECENEK.gaz, BASE_SECENEK.deger).slice(2), "hex")));
    const ulnLib = await sdk.getEndpoint().getDefaultSendLibrary(BASE_EID);
    const u = (n) => OAppUlnConfigBcs.serialize({ use_default_confirmations: false, use_default_required_dvns: false, use_default_optional_dvns: false,
      uln_config: { confirmations: n, required_dvns: SUI_DVN, optional_dvns: [], optional_dvn_threshold: 0 } }).toBytes();
    for (const [tur, onay] of [[2, ONAY_SUI], [3, ONAY_BASE]]) sdk.getUln302().setConfigMoveCall(tx, await oapp.setConfigMoveCall(tx, ulnLib, BASE_EID, tur, u(onay)));
    const r = await calistir("peer Base + secenek + ULN", tx);
    if (!r) return;
    k.lzAyar = r.digest; yaz();
  }
  k.secenek = secenek(UZAK_GAZ); k.ikinciAdim = IKINCI_ADIM.sui.toString(); yaz();
  console.log("  Sui kasa " + k.kasa + "  CCTP kimligi " + k.karsi + "\n  Sui ikiz kapisi (paket) " + k.ikizPaket);
}

/* ---- Aptos ---------------------------------------------------------------- */
async function aptos() {
  const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey, MoveVector } = require("@aptos-labs/ts-sdk");
  const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const dagitici = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_PRIVATE_KEY")) });
  const hesapAl = (ad, not) => {
    const pk = ozel(ad);
    if (pk) return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(pk) });
    const h = Account.generate();
    if (UYGULA) fs.appendFileSync(ENV, "\n# " + not + " (18 Oct 2026); its key is closed when the set is locked\n" + ad + "=" + Buffer.from(h.privateKey.toUint8Array()).toString("hex") + "\n");
    return h;
  };
  const sepet = hesapAl("APTOS_SEPET2_PRIVATE_KEY", "Aptos account for the second basket generation (pulse_sepet)");
  const ikiz = hesapAl("APTOS_IKIZ_PRIVATE_KEY", "Aptos account for the twin gate (pulse_ikiz)");
  const k = (kayit.uzak.aptos ||= { tx: {} });
  k.hesap = sepet.accountAddress.toString(); k.ikizHesap = ikiz.accountAddress.toString();
  const bakiye = async (a) => (await ag.getAccountAPTAmount({ accountAddress: a }).catch(() => 0)) / 1e8;
  console.log("APTOS  sepet " + k.hesap + " (" + (await bakiye(k.hesap)) + " APT)  ikiz " + k.ikizHesap + " (" + (await bakiye(k.ikizHesap)) + " APT)  dagitici " + (await bakiye(dagitici.accountAddress.toString())) + " APT");
  const gonder = async (imzaci, etiket, data, yayin) => {
    const tx = await ag.transaction.build.simple({ sender: imzaci.accountAddress, data, options: { maxGasAmount: yayin ? 400000 : 20000 } });
    const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: imzaci.publicKey, transaction: tx });
    if (!sim.success) throw new Error("Aptos " + etiket + " simulasyon: " + sim.vm_status);
    if (!UYGULA) { console.log("  (kuru) Aptos " + etiket.padEnd(32) + "simulasyon tamam, ~" + (Number(sim.gas_used) * Number(sim.gas_unit_price) / 1e8).toFixed(4) + " APT"); return null; }
    const g = await ag.signAndSubmitTransaction({ signer: imzaci, transaction: tx });
    const r = await ag.waitForTransaction({ transactionHash: g.hash });
    if (!r.success) throw new Error("Aptos " + etiket + ": " + r.vm_status);
    console.log("  Aptos " + etiket.padEnd(36) + g.hash);
    k.tx[etiket] = g.hash; yaz();
    return r;
  };
  const yayin = async (hesap, dizin, adlar, etiket) => {
    const cikti = path.join(KOK, "ozel", "yayin-" + dizin + ".json");
    cp.execFileSync(APTOS_CLI, ["move", "build-publish-payload", "--package-dir", path.join(KOK, "aptos", dizin), "--named-addresses", adlar,
      "--json-output-file", cikti, "--assume-yes", "--skip-fetch-latest-git-deps"], { stdio: ["ignore", "ignore", "inherit"] });
    const y = JSON.parse(fs.readFileSync(cikti, "utf8"));
    const [meta, kod] = y.args.map((a) => a.value);
    return gonder(hesap, etiket, { function: "0x1::code::publish_package_txn",
      functionArguments: [MoveVector.U8(Buffer.from(meta.slice(2), "hex")), new MoveVector(kod.map((c) => MoveVector.U8(Buffer.from(c.slice(2), "hex"))))] }, true);
  };
  for (const h of [sepet, ikiz]) {
    if ((await bakiye(h.accountAddress.toString())) >= FONLAMA_APT / 2) continue;
    const r = await gonder(dagitici, "fonlama " + h.accountAddress.toString().slice(0, 10), { function: "0x1::aptos_account::transfer",
      functionArguments: [h.accountAddress.toString(), Math.round(FONLAMA_APT * 1e8)] });
    if (!r) { console.log("  (kuru) yayin ve ayarlar fonlamadan sonra simule edilir"); return; }
  }
  const moduller = async (a) => (await ag.getAccountModules({ accountAddress: a }).catch(() => [])).map((m) => m.abi.name);

  /* A: the basket vault */
  const P = k.hesap;
  if (!(await moduller(P)).includes("haberci")) {
    const r = await yayin(sepet, "pulse-sepet", "sepet=" + P, "publish pulse_sepet");
    if (!r) { console.log("  (kuru) kur / ikiz_ekle yayindan sonra simule edilir"); return; }
  }
  if (!k.haberci) {
    const r = await gonder(sepet, "haberci::kur", { function: P + "::haberci::kur", functionArguments: [APTOS, APTOS_USDC, ARC, DEFTER] });
    if (!r) return;
    const e = r.events.find((x) => x.type.endsWith("::haberci::Kuruldu"));
    k.haberci = e.data.haberci; k.kasa = pad(e.data.kasa); k.karsi = pad(e.data.haberci); yaz();
  }
  if (!k.tx["ikiz_ekle(Arc)"]) await gonder(sepet, "ikiz_ekle(Arc)", { function: P + "::haberci::ikiz_ekle", functionArguments: [k.haberci, ARC, ARC_HABERCI] });

  /* B: the twin gate */
  const I = k.ikizHesap;
  if (!(await moduller(I)).includes("kapi")) {
    const lz = Object.fromEntries(fs.readdirSync(path.join("C:/Users/omen/araclar/aptossdk/node_modules/@layerzerolabs/lz-aptos-sdk-v2/deployments/aptos-mainnet"))
      .map((f) => [f.replace(/\.json$/, ""), require(path.join("C:/Users/omen/araclar/aptossdk/node_modules/@layerzerolabs/lz-aptos-sdk-v2/deployments/aptos-mainnet", f)).address]));
    const adlar = { oft: I, oft_admin: I, oft_common: lz.oft_common, router_node_0: lz.router_node_0, simple_msglib: lz.simple_msglib,
      blocked_msglib: lz.blocked_msglib, uln_302: lz.uln_302, router_node_1: lz.router_node_1, endpoint_v2_common: lz.endpoint_v2_common,
      endpoint_v2: lz.endpoint_v2, layerzero_admin: lz.deployer, layerzero_treasury_admin: lz.deployer, msglib_types: lz.msglib_types,
      treasury: lz.treasury, worker_peripherals: lz.deployer, price_feed_router_0: lz.price_feed_router_0, price_feed_router_1: lz.price_feed_router_1,
      price_feed_module_0: lz.price_feed_module_0, worker_common: lz.worker_common, executor_fee_lib_router_0: lz.executor_fee_lib_router_0,
      executor_fee_lib_router_1: lz.executor_fee_lib_router_1, dvn_fee_lib_router_0: lz.dvn_fee_lib_router_0, dvn_fee_lib_router_1: lz.dvn_fee_lib_router_1,
      executor_fee_lib_0: lz.executor_fee_lib_0, dvn_fee_lib_0: lz.dvn_fee_lib_0, dvn: lz.dvn };
    const r = await yayin(ikiz, "ikiz", Object.entries(adlar).map(([a, v]) => a + "=" + v).join(","), "publish pulse_ikiz");
    if (!r) { console.log("  (kuru) ikiz kapisi ayarlari yayindan sonra simule edilir"); return; }
  }
  const adim = async (etiket, fn, args) => { if (!k.tx[etiket]) await gonder(ikiz, etiket, { function: I + "::" + fn, functionArguments: args }); };
  /* LayerZero's Move serde: u64 big-endian, counts as u8, addresses 32 bytes, three default flags */
  const uln = (onay, dvn) => "0x" + BigInt(onay).toString(16).padStart(16, "0") + "00" + dvn.length.toString(16).padStart(2, "0") +
    dvn.map((a) => a.slice(2).padStart(64, "0")).join("") + "00" + "000000";
  await adim("kapi::kur", "kapi::kur", [BASE_EID]);
  await adim("set_delegate", "oapp_core::set_delegate", [I]);
  /* vector<u8> arguments as bytes: a hex string would be taken as its text */
  const b = (h) => MoveVector.U8(Buffer.from(h.slice(2), "hex"));
  await adim("set_peer Base", "oapp_core::set_peer", [BASE_EID, b(AKTARMA)]);
  await adim("enforced Base", "oapp_core::set_enforced_options", [BASE_EID, 1, b(secenek(BASE_SECENEK.gaz, BASE_SECENEK.deger))]);
  await adim("ULN gonderim Base", "oapp_core::set_config", [APTOS_ULN, BASE_EID, 2, b(uln(ONAY_APTOS, APTOS_DVN))]);
  await adim("ULN alim Base", "oapp_core::set_config", [APTOS_ULN, BASE_EID, 3, b(uln(ONAY_BASE, APTOS_DVN))]);
  k.ikizKapi = pad(I); k.secenek = secenek(UZAK_GAZ); k.ikinciAdim = IKINCI_ADIM.aptos.toString(); yaz();
  console.log("  Aptos kasa " + k.kasa + "  Haberci " + k.haberci + "\n  Aptos ikiz kapisi " + I);
}

(async () => {
  console.log("SEPET V2 SUI + APTOS  " + (UYGULA ? "UYGULA" : "KURU") + "   Defter " + DEFTER + "  Arc HaberciLZ " + ARC_HABERCI + "  Base aktarma " + AKTARMA);
  for (const [ad, f] of [["sui", sui], ["aptos", aptos]]) {
    if (SECILEN.length && !SECILEN.includes(ad)) continue;
    try { await f(); } catch (e) { console.log("  " + ad + " HATA " + (e.shortMessage || e.message).slice(0, 400)); process.exitCode = 1; return; }
  }
  console.log(UYGULA ? "TAMAM" : "KURU TAMAM");
})();
