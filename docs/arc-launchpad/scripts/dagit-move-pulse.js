"use strict";
/* ===========================================================================
 * dagit-move-pulse.js — the ARC PULSE launchpad + PulseSwap on Aptos and Sui
 * mainnet, published immutable and initialized once.
 *
 *   NODE_PATH="C:/Users/omen/araclar/aptossdk/node_modules;C:/Users/omen/araclar/suisdk/node_modules" \
 *     node scripts/dagit-move-pulse.js <aptos|aptos2|sui> [--uygula]
 *
 * Without --uygula every step is built and simulated against mainnet and
 * nothing is sent. Each step is skipped when the chain already shows it
 * done, so a run that stops halfway is simply run again.
 *
 * APTOS (at the deployer account, which also holds the FTHM OFT package)
 *   1 publish pulse_launchpad   upgrade_policy = immutable (Move.toml)
 *   2 publish PulseSwap         immutable; init_module creates the pool registry
 *   3 launchpad::initialize     collateral = native USDC, platform = deployer
 *   4 launchpad::register_adapter<swap::Witness>   PulseSwap is the only adapter
 *   5 swap::initialize          platform = deployer, FTHM, sink = SINK
 * APTOS2 (16 Oct, the fix): the 'aptos' packages move USDC with plain
 *   fungible_asset::deposit/withdraw, which Aptos refuses for Circle's USDC
 *   (it has dispatch hooks); they are immutable, so the dispatch-aware
 *   version goes to a fresh account (APTOS_PULSE2_PRIVATE_KEY, created in
 *   .env if absent, funded with FONLAMA_APT from the deployer). Same steps;
 *   the platform address stays the deployer's.
 * SUI
 *   1 publish one package holding pulse::launchpad and pulse_swap::swap
 *     (--with-unpublished-dependencies); init creates InitCap, AdapterCap,
 *     FeeCap, the shared Config and Registry
 *   2 one transaction: launchpad::initialize<USDC>, register_adapter<Witness>,
 *     swap::initialize<USDC, FTHM>, package::make_immutable(UpgradeCap):
 *     every capability is consumed, no one can change code or settings
 *
 * FTHM SINK: the FTHM that 5% of the protocol fee buys goes to SINK, an
 * address no one holds a key to: it leaves circulation for good.
 * Record: dagitim-move-pulse.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-move-pulse.json");
const UYGULA = process.argv.includes("--uygula");
const ZINCIR = process.argv[2];
const APTOS_CLI = "C:/Users/omen/araclar/aptos/aptos.exe";
const SUI_CLI = "C:/Users/omen/araclar/sui/sui.exe";
const SINK = "0x000000000000000000000000000000000000000000000000000000000000dead";

const APTOS_USDC = "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b";
const APTOS_FTHM = "0x9fe5db67c6631d9ef87e0e61ea2ff56027bcb19480b0aeba707e16411eb3fb71";
const SUI_USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const SUI_FTHM = "0x6181e2aabffb4fe6f495a53167591e526a18efa458b6b94c7922a899366877ea::fthm::FTHM";
// the official fullnode closed JSON-RPC; publicnode still serves it (as in sui-fthm-bagla.js)
const SUI_RPC = "https://sui-rpc.publicnode.com";

function anahtar(ad) {
  const m = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(new RegExp("^" + ad + "\\s*=\\s*([0-9a-fA-F]{64})\\s*$", "m"));
  if (!m) throw new Error(ad + " yok");
  return m[1];
}
const kayit = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };

/* ---- Aptos ------------------------------------------------------------ */
const FONLAMA_APT = 0.5;
async function aptos(ikinci = false) {
  const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey, MoveVector } = require("@aptos-labs/ts-sdk");
  const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const dagitici = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(anahtar("APTOS_PRIVATE_KEY")) });
  if (ikinci && !/^APTOS_PULSE2_PRIVATE_KEY\s*=/m.test(fs.readFileSync(path.join(KOK, ".env"), "utf8"))) {
    // a fresh key, written only if absent: replacing one would orphan its account
    fs.appendFileSync(path.join(KOK, ".env"), "\n# ARC PULSE launchpad v2 on Aptos (dispatch-aware), 16 Oct 2026\nAPTOS_PULSE2_PRIVATE_KEY=" + require("crypto").randomBytes(32).toString("hex") + "\n");
  }
  const hesap = ikinci ? Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(anahtar("APTOS_PULSE2_PRIVATE_KEY")) }) : dagitici;
  const P = hesap.accountAddress.toString();
  const PLATFORM = dagitici.accountAddress.toString();
  const ad = ikinci ? "aptos2" : "aptos";
  const k = (kayit[ad] = kayit[ad] || { adres: P, tx: {} });
  const bakiye = async (a) => (await ag.getAccountAPTAmount({ accountAddress: a }).catch(() => 0)) / 1e8;
  console.log(ad.toUpperCase() + "  " + (UYGULA ? "UYGULA" : "KURU") + "   hesap " + P + "   bakiye " + (await bakiye(P)) + " APT");
  if (ikinci && (await bakiye(P)) < FONLAMA_APT / 2) {
    const tx = await ag.transaction.build.simple({ sender: dagitici.accountAddress, data: { function: "0x1::aptos_account::transfer", functionArguments: [P, Math.round(FONLAMA_APT * 1e8)] } });
    const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: dagitici.publicKey, transaction: tx });
    if (!sim.success) throw new Error("fonlama simulasyon: " + sim.vm_status);
    if (!UYGULA) { console.log("  (kuru) fonlama " + FONLAMA_APT + " APT dagiticidan".padEnd(34) + "simulasyon tamam; sonraki adimlar fonlamadan sonra simule edilir"); return; }
    const g = await ag.signAndSubmitTransaction({ signer: dagitici, transaction: tx });
    const r = await ag.waitForTransaction({ transactionHash: g.hash });
    console.log("  fonlama " + FONLAMA_APT + " APT".padEnd(30) + g.hash + " " + r.vm_status);
    k.tx.fonlama = g.hash; yaz();
  }

  const moduller = async () => (await ag.getAccountModules({ accountAddress: P })).map((m) => m.abi.name);
  const kaynakVar = async (t) => ag.getAccountResource({ accountAddress: P, resourceType: t }).then(() => true).catch(() => false);
  const gonder = async (etiket, data) => {
    const tx = await ag.transaction.build.simple({ sender: hesap.accountAddress, data, options: { maxGasAmount: 400000 } });
    const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: hesap.publicKey, transaction: tx });
    if (!sim.success) throw new Error(etiket + " simulasyon: " + sim.vm_status);
    const ucret = Number(sim.gas_used) * Number(sim.gas_unit_price) / 1e8;
    if (!UYGULA) { console.log("  (kuru) " + etiket.padEnd(40) + "simulasyon tamam, ~" + ucret.toFixed(4) + " APT"); return false; }
    const g = await ag.signAndSubmitTransaction({ signer: hesap, transaction: tx });
    const r = await ag.waitForTransaction({ transactionHash: g.hash });
    console.log("  " + etiket.padEnd(40) + g.hash + " " + r.vm_status);
    if (!r.success) throw new Error(etiket);
    k.tx[etiket] = g.hash; yaz();
    return true;
  };
  const yukle = async (etiket, dizin) => {
    const cikti = path.join(KOK, "ozel", "yayin-" + path.basename(dizin) + ".json");
    fs.mkdirSync(path.dirname(cikti), { recursive: true });
    cp.execFileSync(APTOS_CLI, ["move", "build-publish-payload", "--package-dir", dizin, "--named-addresses", "pulse=" + P + ",pulse_swap=" + P,
      "--json-output-file", cikti, "--assume-yes", "--skip-fetch-latest-git-deps"], { stdio: ["ignore", "ignore", "inherit"] });
    const y = JSON.parse(fs.readFileSync(cikti, "utf8"));
    const [meta, kod] = y.args.map((a) => a.value);
    return gonder(etiket, { function: "0x1::code::publish_package_txn", functionArguments: [MoveVector.U8(Buffer.from(meta.slice(2), "hex")), new MoveVector(kod.map((c) => MoveVector.U8(Buffer.from(c.slice(2), "hex"))))] });
  };

  let m = await moduller();
  if (!m.includes("launchpad")) await yukle("publish pulse_launchpad", path.join(KOK, "aptos", "pulse-launchpad"));
  else console.log("  publish pulse_launchpad".padEnd(42) + "tamam");
  m = await moduller();
  if (!m.includes("launchpad")) { console.log("  (kuru) sonraki adimlar launchpad yayinlaninca simule edilebilir"); return; }
  if (!m.includes("swap")) await yukle("publish PulseSwap", path.join(KOK, "aptos", "pulse-swap"));
  else console.log("  publish PulseSwap".padEnd(42) + "tamam");
  if (!(await moduller()).includes("swap")) { console.log("  (kuru) sonraki adimlar PulseSwap yayinlaninca simule edilebilir"); return; }

  if (!(await kaynakVar(P + "::launchpad::Config"))) await gonder("launchpad::initialize", { function: P + "::launchpad::initialize", functionArguments: [APTOS_USDC, PLATFORM] });
  else console.log("  launchpad::initialize".padEnd(42) + "tamam");
  const cfg = await ag.getAccountResource({ accountAddress: P, resourceType: P + "::launchpad::Config" }).catch(() => null);
  if (cfg && !(cfg.adapter && cfg.adapter.vec && cfg.adapter.vec.length)) await gonder("launchpad::register_adapter<swap::Witness>", { function: P + "::launchpad::register_adapter", typeArguments: [P + "::swap::Witness"], functionArguments: [] });
  else if (cfg) console.log("  launchpad::register_adapter".padEnd(42) + "tamam");
  if (!(await kaynakVar(P + "::swap::Fees"))) await gonder("swap::initialize", { function: P + "::swap::initialize", functionArguments: [PLATFORM, APTOS_FTHM, SINK] });
  else console.log("  swap::initialize".padEnd(42) + "tamam");

  if (UYGULA) {
    const c = await ag.getAccountResource({ accountAddress: P, resourceType: P + "::launchpad::Config" });
    const f = await ag.getAccountResource({ accountAddress: P, resourceType: P + "::swap::Fees" });
    const pk = await ag.getAccountResource({ accountAddress: P, resourceType: "0x1::code::PackageRegistry" });
    Object.assign(k, { launchpad: P + "::launchpad", swap: P + "::swap", usdc: APTOS_USDC, fthm: APTOS_FTHM, sink: SINK, platform: PLATFORM,
      paketler: pk.packages.map((x) => ({ ad: x.name, politika: x.upgrade_policy.policy })) });
    yaz();
    console.log("  dogrulama: teminat " + c.collateral.inner + ", adaptor " + JSON.stringify(c.adapter.vec) + ", FTHM " + f.fthm.inner + ", sink " + f.fthm_sink);
    console.log("  paket politikalari: " + pk.packages.map((x) => x.name + "=" + (x.upgrade_policy.policy === 2 ? "immutable" : x.upgrade_policy.policy)).join(", "));
  }
}

/* ---- Sui -------------------------------------------------------------- */
async function sui() {
  const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
  const { Transaction } = require("@mysten/sui/transactions");
  const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
  const client = new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" });
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(anahtar("SUI_PRIVATE_KEY"), "hex"));
  const ben = imzaci.toSuiAddress();
  const k = (kayit.sui = kayit.sui || { adres: ben, tx: {} });
  const bakiye = Number((await client.getBalance({ owner: ben })).totalBalance) / 1e9;
  console.log("SUI  " + (UYGULA ? "UYGULA" : "KURU") + "   hesap " + ben + "   bakiye " + bakiye + " SUI");

  const calistir = async (etiket, tx) => {
    tx.setSender(ben);
    tx.setGasBudget(500_000_000);
    const sim = await client.dryRunTransactionBlock({ transactionBlock: await tx.build({ client }) });
    if (sim.effects.status.status !== "success") throw new Error(etiket + " simulasyon: " + sim.effects.status.error);
    const g = sim.effects.gasUsed, ucret = (Number(g.computationCost) + Number(g.storageCost) - Number(g.storageRebate)) / 1e9;
    if (!UYGULA) { console.log("  (kuru) " + etiket.padEnd(40) + "simulasyon tamam, ~" + ucret.toFixed(4) + " SUI"); return null; }
    const r = await client.signAndExecuteTransaction({ signer: imzaci, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
    await client.waitForTransaction({ digest: r.digest });
    console.log("  " + etiket.padEnd(40) + r.digest + " " + r.effects.status.status);
    if (r.effects.status.status !== "success") throw new Error(etiket);
    k.tx[etiket] = r.digest; yaz();
    return r;
  };

  if (!k.paket) {
    const cikti = cp.execFileSync(SUI_CLI, ["move", "build", "--dump-bytecode-as-base64", "--with-unpublished-dependencies", "-e", "mainnet", "--path", path.join(KOK, "sui", "pulse-swap")], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 << 20 });
    const { modules, dependencies } = JSON.parse(cikti.slice(cikti.indexOf("{")));
    const tx = new Transaction();
    const cap = tx.publish({ modules, dependencies });
    tx.transferObjects([cap], ben);
    const r = await calistir("publish launchpad + PulseSwap", tx);
    if (!r) { console.log("  (kuru) baslatma adimi paket yayinlaninca simule edilebilir"); return; }
    const deg = r.objectChanges;
    const tip = (s) => (deg.find((o) => o.type === "created" && o.objectType && o.objectType.endsWith(s)) || {}).objectId;
    k.paket = deg.find((o) => o.type === "published").packageId;
    Object.assign(k, { upgradeCap: tip("::package::UpgradeCap"), initCap: tip("::launchpad::InitCap"), adapterCap: tip("::launchpad::AdapterCap"),
      feeCap: tip("::swap::FeeCap"), config: tip("::launchpad::Config"), registry: tip("::swap::Registry") });
    yaz();
  } else console.log("  publish".padEnd(42) + "tamam  " + k.paket);

  const caps = [k.initCap, k.adapterCap, k.feeCap, k.upgradeCap];
  const duran = await client.multiGetObjects({ ids: caps, options: { showOwner: true } });
  if (duran.some((o) => o.data)) {
    const tx = new Transaction();
    tx.moveCall({ target: k.paket + "::launchpad::initialize", typeArguments: [SUI_USDC], arguments: [tx.object(k.initCap), tx.object(k.config), tx.pure.u8(6), tx.pure.address(ben)] });
    tx.moveCall({ target: k.paket + "::launchpad::register_adapter", typeArguments: [k.paket + "::swap::Witness"], arguments: [tx.object(k.adapterCap), tx.object(k.config)] });
    tx.moveCall({ target: k.paket + "::swap::initialize", typeArguments: [SUI_USDC, SUI_FTHM], arguments: [tx.object(k.feeCap), tx.pure.address(ben), tx.pure.address(SINK)] });
    tx.moveCall({ target: "0x2::package::make_immutable", arguments: [tx.object(k.upgradeCap)] });
    const r = await calistir("initialize + adapter + fees + immutable", tx);
    if (r) {
      k.fees = (r.objectChanges.find((o) => o.type === "created" && o.objectType && o.objectType.includes("::swap::Fees<")) || {}).objectId;
      Object.assign(k, { usdc: SUI_USDC, fthm: SUI_FTHM, sink: SINK, platform: ben });
      yaz();
    }
  } else console.log("  initialize + immutable".padEnd(42) + "tamam (butun yetkiler tuketildi)");

  if (UYGULA) {
    const c = await client.getObject({ id: k.config, options: { showContent: true } });
    const f = c.data.content.fields;
    console.log("  dogrulama: teminat " + JSON.stringify(f.collateral) + ", adaptor " + JSON.stringify(f.adapter) + ", platform " + f.platform);
    const kalan = (await client.multiGetObjects({ ids: caps })).filter((o) => o.data).length;
    console.log("  kalan yetki nesnesi: " + kalan + " (0 olmali)");
  }
}

({ aptos: () => aptos(false), aptos2: () => aptos(true), sui }[ZINCIR] || (() => Promise.reject(new Error("kullanim: dagit-move-pulse.js <aptos|aptos2|sui> [--uygula]"))))()
  .catch((e) => { console.error("HATA " + (e.message || e)); process.exit(1); });
