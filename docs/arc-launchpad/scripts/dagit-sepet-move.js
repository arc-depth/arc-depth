"use strict";
/* ===========================================================================
 * dagit-sepet-move.js — the basket's Sui and Aptos vaults, wired to the EVM set
 *
 *   NODE_PATH="C:/Users/omen/araclar/aptossdk/node_modules;C:/Users/omen/araclar/suisdk/node_modules;C:/arc-launchpad/node_modules" \
 *     node scripts/dagit-sepet-move.js [--uygula]
 *
 * SUI (deployer SUI_PRIVATE_KEY)
 *   1 publish sui/pulse-sepet (links to Circle's mainnet CCTP V2 and its own
 *     dependencies through the interface packages; dry-run passed 17 Oct).
 *     The UpgradeCap stays with the deployer until the whole set is locked
 *     (a launch entry on Sui must keep the HaberciYetki identity the Defter
 *     binds below); made immutable then.
 *   2 haberci::kur<USDC>(8, 26, Defter)   shared Kasa + Haberci
 *   3 ikiz_ekle(26, Arc HaberciCctp)
 * APTOS (a new account, APTOS_SEPET_PRIVATE_KEY, created in .env if absent,
 *   funded from the deployer 0xc331…)
 *   1 publish aptos/pulse-sepet ("compatible": Circle's packages are; the
 *     account's key is closed when the set is locked)
 *   2 haberci::kur(9, USDC, 26, Defter)   the Kuruldu event names both objects
 *   3 ikiz_ekle(26, Arc HaberciCctp)
 * EVM (deployer; the HaberciCctp and the Defter are not locked yet)
 *   every CCTP chain: ikizEkle(8, Sui identity) + ayriYap(8), ikizEkle(9, Aptos Haberci)
 *   Arc Defter: bagla(8, Sui identity, Sui Kasa), bagla(9, Aptos Haberci, Aptos Kasa)
 * Bindings are write-once. Record: dagitim-sepet.json (sui, aptos).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const KAYIT = path.join(KOK, "dagitim-sepet.json");
const ENV = path.join(KOK, ".env");
const SUI_CLI = "C:/Users/omen/araclar/sui/sui.exe";
const APTOS_CLI = "C:/Users/omen/araclar/aptos/aptos.exe";
const SUI_RPC = "https://sui-rpc.publicnode.com";
const SUI_USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const APTOS_USDC = "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b";
const ARC = 26, SUI = 8, APTOS = 9, FONLAMA_APT = 1.0;
const kayit = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };
const ozel = (ad) => { const m = fs.readFileSync(ENV, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m")); return m ? m[1].trim() : null; };
const pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const DEFTER = pad(kayit.zincir.arc.SepetDefteri);
const ARC_HABERCI = pad(kayit.zincir.arc.HaberciCctp);

async function sui() {
  const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
  const { Transaction } = require("@mysten/sui/transactions");
  const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
  const client = new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" });
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(ozel("SUI_PRIVATE_KEY"), "hex"));
  const ben = imzaci.getPublicKey().toSuiAddress();
  const k = (kayit.sui ||= {});
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
  console.log("SUI  " + ben + "  bakiye " + Number((await client.getBalance({ owner: ben })).totalBalance) / 1e9 + " SUI");
  if (!k.paket) {
    const cikti = cp.execFileSync(SUI_CLI, ["move", "build", "--dump-bytecode-as-base64", "-e", "mainnet", "--path", path.join(KOK, "sui", "pulse-sepet")],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20,
        /* a config whose only network is mainnet (no keys): the CLI fetches dependencies from the active network */
        env: { ...process.env, SUI_CONFIG_DIR: path.join(KOK, "ozel", "sui-ana-cfg") } });
    const { modules, dependencies } = JSON.parse(cikti.slice(cikti.indexOf("{")));
    const tx = new Transaction();
    const cap = tx.publish({ modules, dependencies });
    tx.transferObjects([cap], ben);
    const r = await calistir("publish pulse-sepet", tx);
    if (!r) { console.log("  (kuru) Sui kur / ikiz_ekle paket yayinlaninca simule edilir"); return; }
    k.paket = r.objectChanges.find((o) => o.type === "published").packageId;
    k.upgradeCap = r.objectChanges.find((o) => o.type === "created" && o.objectType.endsWith("::package::UpgradeCap")).objectId;
    yaz();
  }
  if (!k.haberci) {
    const tx = new Transaction();
    tx.moveCall({ target: k.paket + "::haberci::kur", typeArguments: [SUI_USDC], arguments: [tx.pure.u32(SUI), tx.pure.u32(ARC), tx.pure.address(DEFTER)] });
    const r = await calistir("haberci::kur<USDC>", tx);
    if (!r) return;
    k.haberci = r.objectChanges.find((o) => o.type === "created" && o.objectType.endsWith("::haberci::Haberci")).objectId;
    k.kasa = r.objectChanges.find((o) => o.type === "created" && o.objectType.includes("::kasa::Kasa<")).objectId;
    yaz();
  }
  if (!k.ikizArc) {
    const tx = new Transaction();
    tx.moveCall({ target: k.paket + "::haberci::ikiz_ekle", arguments: [tx.object(k.haberci), tx.pure.u32(ARC), tx.pure.address(ARC_HABERCI)] });
    const r = await calistir("ikiz_ekle(Arc)", tx);
    if (r) { k.ikizArc = r.digest; yaz(); }
  }
  if (!k.yetki) {
    const tx = new Transaction();
    tx.moveCall({ target: k.paket + "::haberci::yetki_kimligi" });
    const d = await client.devInspectTransactionBlock({ sender: ben, transactionBlock: tx });
    k.yetki = "0x" + Buffer.from(d.results[0].returnValues[0][0]).toString("hex");
    yaz();
  }
  console.log("  Sui paket " + k.paket + "\n  Sui Haberci " + k.haberci + "  Kasa " + k.kasa + "\n  Sui CCTP kimligi (yetki) " + k.yetki);
}

async function aptos() {
  const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey, MoveVector } = require("@aptos-labs/ts-sdk");
  const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const dagitici = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_PRIVATE_KEY")) });
  let pk = ozel("APTOS_SEPET_PRIVATE_KEY");
  let hesap;
  if (pk) hesap = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(pk) });
  else {
    hesap = Account.generate();
    if (UYGULA) fs.appendFileSync(ENV, "\n# Aptos account for the basket (pulse_sepet), 18 Oct 2026; its key is closed when the set is locked\nAPTOS_SEPET_PRIVATE_KEY=" + Buffer.from(hesap.privateKey.toUint8Array()).toString("hex") + "\n");
  }
  const P = hesap.accountAddress.toString();
  const k = (kayit.aptos ||= { hesap: P, tx: {} });
  const bakiye = async (a) => (await ag.getAccountAPTAmount({ accountAddress: a }).catch(() => 0)) / 1e8;
  console.log("APTOS  hesap " + P + "  bakiye " + (await bakiye(P)) + " APT  (dagitici " + (await bakiye(dagitici.accountAddress.toString())) + ")");
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
  if ((await bakiye(P)) < FONLAMA_APT / 2) {
    const r = await gonder(dagitici, "fonlama " + FONLAMA_APT + " APT", { function: "0x1::aptos_account::transfer", functionArguments: [P, Math.round(FONLAMA_APT * 1e8)] });
    if (!r) { console.log("  (kuru) Aptos yayin / kur fonlamadan sonra simule edilir"); return; }
  }
  const moduller = (await ag.getAccountModules({ accountAddress: P }).catch(() => [])).map((m) => m.abi.name);
  if (!moduller.includes("haberci")) {
    const cikti = path.join(KOK, "ozel", "yayin-pulse-sepet.json");
    cp.execFileSync(APTOS_CLI, ["move", "build-publish-payload", "--package-dir", path.join(KOK, "aptos", "pulse-sepet"), "--named-addresses", "sepet=" + P,
      "--json-output-file", cikti, "--assume-yes", "--skip-fetch-latest-git-deps"], { stdio: ["ignore", "ignore", "inherit"] });
    const y = JSON.parse(fs.readFileSync(cikti, "utf8"));
    const [meta, kod] = y.args.map((a) => a.value);
    const r = await gonder(hesap, "publish pulse_sepet", { function: "0x1::code::publish_package_txn",
      functionArguments: [MoveVector.U8(Buffer.from(meta.slice(2), "hex")), new MoveVector(kod.map((c) => MoveVector.U8(Buffer.from(c.slice(2), "hex"))))] }, true);
    if (!r) { console.log("  (kuru) Aptos kur / ikiz_ekle yayindan sonra simule edilir"); return; }
  }
  if (!k.haberci) {
    const r = await gonder(hesap, "haberci::kur", { function: P + "::haberci::kur", functionArguments: [APTOS, APTOS_USDC, ARC, DEFTER] });
    if (!r) return;
    const e = r.events.find((x) => x.type.endsWith("::haberci::Kuruldu"));
    k.haberci = e.data.haberci; k.kasa = e.data.kasa; yaz();
  }
  if (!k.tx["ikiz_ekle(Arc)"]) await gonder(hesap, "ikiz_ekle(Arc)", { function: P + "::haberci::ikiz_ekle", functionArguments: [k.haberci, ARC, ARC_HABERCI] });
  console.log("  Aptos Haberci " + k.haberci + "  Kasa " + k.kasa);
}

async function evm() {
  const { JsonRpcProvider, Wallet, Contract, NonceManager } = require("ethers");
  const s = kayit.sui || {}, a = kayit.aptos || {};
  if (!s.yetki || !s.kasa || !a.haberci) { console.log("EVM  (kuru) Sui ve Aptos kurulmadan baglanamaz"); return; }
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const R = { arc: ["https://arc-rpc.publicnode.com", 5042], base: ["https://mainnet.base.org", 8453], arbitrum: ["https://arb1.arbitrum.io/rpc", 42161],
    avalanche: ["https://api.avax.network/ext/bc/C/rpc", 43114], monad: ["https://rpc.monad.xyz", 143], hyperevm: ["https://rpc.hyperliquid.xyz/evm", 999] };
  const HAB = ["function ikiz(uint32) view returns (bytes32)", "function ayri(uint32) view returns (bool)", "function ikizEkle(uint32,bytes32)", "function ayriYap(uint32)"];
  const is = async (z, w, etiket, c, f, args) => {
    await c[f].staticCall(...args);
    if (!UYGULA) { console.log("  (kuru) " + z.padEnd(9) + etiket + ": simulasyon tamam"); return; }
    const m = await (await c.connect(w)[f](...args)).wait();
    console.log("  " + z.padEnd(9) + etiket.padEnd(28) + m.hash);
    if (z === "base") await new Promise((r) => setTimeout(r, 6000));
  };
  for (const [z, [rpc, id]] of Object.entries(R)) {
    const p = new JsonRpcProvider(rpc, id, { staticNetwork: true });
    const w = new NonceManager(new Wallet(pk, p));
    const h = new Contract(kayit.zincir[z].HaberciCctp, HAB, w);
    if ((await h.ikiz(SUI)) === pad("0x0")) await is(z, w, "ikizEkle(Sui)", h, "ikizEkle", [SUI, pad(s.yetki)]);
    if (!(await h.ayri(SUI))) await is(z, w, "ayriYap(Sui)", h, "ayriYap", [SUI]);
    if ((await h.ikiz(APTOS)) === pad("0x0")) await is(z, w, "ikizEkle(Aptos)", h, "ikizEkle", [APTOS, pad(a.haberci)]);
    if (z === "arc") {
      const d = new Contract(kayit.zincir.arc.SepetDefteri, ["function kasa(uint32) view returns (bytes32)", "function bagla(uint32,bytes32,bytes32)"], w);
      if ((await d.kasa(SUI)) === pad("0x0")) await is(z, w, "Defter bagla(Sui)", d, "bagla", [SUI, pad(s.yetki), pad(s.kasa)]);
      if ((await d.kasa(APTOS)) === pad("0x0")) await is(z, w, "Defter bagla(Aptos)", d, "bagla", [APTOS, pad(a.haberci), pad(a.kasa)]);
    }
  }
}

(async () => {
  console.log("SEPET SUI + APTOS  " + (UYGULA ? "UYGULA" : "KURU") + "   Defter " + DEFTER);
  for (const [ad, f] of [["Sui", sui], ["Aptos", aptos], ["EVM", evm]]) {
    try { await f(); } catch (e) { console.log("  " + ad + " HATA " + (e.shortMessage || e.message).slice(0, 400)); process.exitCode = 1; return; }
  }
  console.log(UYGULA ? "TAMAM" : "KURU TAMAM");
})();
