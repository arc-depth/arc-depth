/* ===========================================================================
 * denetim-v4-uzak.mjs — v4 Sui and Aptos vaults against mainnet state,
 * simulation only (nothing is signed or sent)
 *
 *   node scripts/denetim-v4-uzak.mjs
 *
 *   1 Sui: the vault package's compatible upgrade (its build, the deployer's
 *     UpgradeCap) — proves the new code links to Cetus v15 on chain
 *   2 Sui: the Cetus leg exactly as kasa::takas_al_a makes it (flash_swap
 *     a2b, exact input, the price limit 1.5% below in sqrt; repay) through
 *     the listed USDC/SUI pool, from the deployer's own 1 USDC
 *   3 Aptos: pulse_sepet's compatible upgrade (adds the dex dependency)
 *   4 Aptos: the Hyperion leg as kasa::takas_al makes it (pool_v3::swap b->a,
 *     limit 1.5% above), a script, from the deployer's own 1 USDC
 * The vaults' own code is tested locally (sui move test, aptos move test),
 * against stand-ins with the same signatures; Solana's against Raydium's real
 * program (solana/pulse-swap-e2e tests/sepet_v4.rs).
 * =========================================================================== */
import fs from "fs";
import path from "path";
import cp from "child_process";
import { createRequire } from "module";

const KOK = "C:/arc-launchpad";
const suiReq = createRequire("C:/Users/omen/araclar/suisdk/x.js");
const aptReq = createRequire("C:/Users/omen/araclar/aptossdk/x.js");
const { Transaction, Inputs } = suiReq("@mysten/sui/transactions");
const { Ed25519Keypair } = suiReq("@mysten/sui/keypairs/ed25519");
const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey, MoveVector, U64, U128, Bool, AccountAddress } = aptReq("@aptos-labs/ts-sdk");
const ENV = fs.readFileSync(path.join(KOK, ".env"), "utf8");
const ozel = (ad) => ENV.match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m"))[1].trim();
const V2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-v2.json"), "utf8"));
const LISTE = JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "v4-uzak-liste.json"), "utf8"));
let gecti = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti) => { toplam++; if (ok) gecti++; console.log("  " + (ok ? "PASS" : "FAIL") + "  " + ad + (ayrinti ? "   " + ayrinti : "")); };

/* ---- Sui ---- */
const gql = (q, v) => fetch("https://graphql.mainnet.sui.io/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q, variables: v }) }).then((r) => r.json());
const suiBen = Ed25519Keypair.fromSecretKey(Buffer.from(ozel("SUI_PRIVATE_KEY"), "hex")).getPublicKey().toSuiAddress();
async function suiSim(kur) {
  const tx = new Transaction();
  tx.setSender(suiBen);
  tx.setGasPrice(BigInt((await gql(`{ epoch { referenceGasPrice } }`)).data.epoch.referenceGasPrice));
  tx.setGasBudget(600_000_000n);
  const gaz = (await gql(`{ address(address:"${suiBen}"){ objects(filter:{type:"0x2::coin::Coin<0x2::sui::SUI>"}, first: 5){ nodes { address version digest } } } }`)).data.address.objects.nodes;
  tx.setGasPayment(gaz.map((g) => ({ objectId: g.address, version: g.version, digest: g.digest })));
  await kur(tx);
  const r = await gql(`query($t: JSON!){ simulateTransaction(transaction: $t) { effects { status executionError { message } balanceChangesJson gasEffects { gasSummary { computationCost storageCost storageRebate } } } } }`,
    { t: { bcs: { value: Buffer.from(await tx.build()).toString("base64") } } });
  return r.data ? r.data.simulateTransaction.effects : { status: "HATA", executionError: r.errors };
}
const sahipli = async (id) => { const o = (await gql(`{ object(address:"${id}"){ version digest } }`)).data.object; return Inputs.ObjectRef({ objectId: id, version: o.version, digest: o.digest }); };
const paylasilan = async (id, mutable) => { const o = (await gql(`{ object(address:"${id}"){ owner { ... on Shared { initialSharedVersion } } } }`)).data.object; return Inputs.SharedObjectRef({ objectId: id, initialSharedVersion: o.owner.initialSharedVersion, mutable }); };

console.log("SUI (" + suiBen + ")");
{
  const cikti = cp.execFileSync("C:/Users/omen/araclar/sui/sui.exe", ["move", "build", "-e", "mainnet", "--dump-bytecode-as-base64", "--path", path.join(KOK, "sui", "pulse-sepet")],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20, env: { ...process.env, SUI_CONFIG_DIR: path.join(KOK, "ozel", "sui-ana-cfg") } });
  const { modules, dependencies, digest } = JSON.parse(cikti.slice(cikti.indexOf("{")));
  const k = V2.uzak.sui;
  const e = await suiSim(async (tx) => {
    const cap = tx.object(await sahipli(k.upgradeCap));
    const bilet = tx.moveCall({ target: "0x2::package::authorize_upgrade", arguments: [cap, tx.pure.u8(0), tx.pure.vector("u8", digest)] });
    const makbuz = tx.upgrade({ modules, dependencies, package: k.paket, ticket: bilet });
    tx.moveCall({ target: "0x2::package::commit_upgrade", arguments: [cap, makbuz] });
  });
  const g = e.gasEffects ? e.gasEffects.gasSummary : null;
  sonuc("paket yukseltmesi (compatible, Cetus v15 baglantisi)", e.status === "SUCCESS", g ? "~" + ((Number(g.computationCost) + Number(g.storageCost) - Number(g.storageRebate)) / 1e9).toFixed(4) + " SUI" : JSON.stringify(e.executionError));
}
{
  const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
  const CETUS = "0x260693ec785a6e6c9d81d58c7d2ff72f1288ae0fa6a9725abe05a6478b11f084";
  const CONFIG = "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f";
  const x = LISTE.sui[0];
  const c = (await gql(`{ address(address:"${suiBen}"){ objects(filter:{type:"0x2::coin::Coin<${USDC}>"}, first: 5){ nodes { address version digest } } } }`)).data.address.objects.nodes[0];
  const sqrt = BigInt((await gql(`{ object(address:"${x.havuz}"){ asMoveObject { contents { json } } } }`)).data.object.asMoveObject.contents.json.current_sqrt_price);
  const e = await suiSim(async (tx) => {
    const cfg = tx.object(await paylasilan(CONFIG, false));
    const pool = tx.object(await paylasilan(x.havuz, true));
    const saat = tx.object(Inputs.SharedObjectRef({ objectId: "0x6", initialSharedVersion: 1, mutable: false }));
    const [para] = tx.splitCoins(tx.object(Inputs.ObjectRef({ objectId: c.address, version: c.version, digest: c.digest })), [1_000_000]);
    const bal = tx.moveCall({ target: "0x2::coin::into_balance", typeArguments: [USDC], arguments: [para] });
    const [a0, b, makbuz] = tx.moveCall({ target: CETUS + "::pool::flash_swap", typeArguments: [USDC, x.varlik], arguments: [cfg, pool, tx.pure.bool(true), tx.pure.bool(true), tx.pure.u64(1_000_000), tx.pure.u128(sqrt * 9850n / 10000n), saat] });
    const odenecek = tx.moveCall({ target: CETUS + "::pool::swap_pay_amount", typeArguments: [USDC, x.varlik], arguments: [makbuz] });
    const ode = tx.moveCall({ target: "0x2::balance::split", typeArguments: [USDC], arguments: [bal, odenecek] });
    tx.moveCall({ target: CETUS + "::pool::repay_flash_swap", typeArguments: [USDC, x.varlik], arguments: [cfg, pool, ode, tx.moveCall({ target: "0x2::balance::zero", typeArguments: [x.varlik] }), makbuz] });
    tx.moveCall({ target: "0x2::balance::destroy_zero", typeArguments: [USDC], arguments: [a0] });
    tx.transferObjects([tx.moveCall({ target: "0x2::coin::from_balance", typeArguments: [x.varlik], arguments: [b] }), tx.moveCall({ target: "0x2::coin::from_balance", typeArguments: [USDC], arguments: [bal] })], tx.pure.address(suiBen));
  });
  const fark = (e.balanceChangesJson || []).map((z) => z.coinType.split("::").pop() + " " + z.amount).join(", ");
  sonuc("Cetus bacagi: 1 USDC -> " + x.ad + " (" + x.havuz.slice(0, 10) + "…, sinir -%1,5 sqrt)", e.status === "SUCCESS", fark || JSON.stringify(e.executionError));
}

/* ---- Aptos ---- */
const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
console.log("APTOS");
{
  const k = V2.uzak.aptos;
  const sepet = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_SEPET2_PRIVATE_KEY")) });
  const cikti = path.join(KOK, "ozel", "yukseltme-pulse-sepet.json");
  cp.execFileSync("C:/Users/omen/araclar/aptos/aptos.exe", ["move", "build-publish-payload", "--package-dir", path.join(KOK, "aptos", "pulse-sepet"), "--named-addresses", "sepet=" + k.hesap,
    "--json-output-file", cikti, "--assume-yes", "--skip-fetch-latest-git-deps"], { stdio: "ignore" });
  const [meta, kod] = JSON.parse(fs.readFileSync(cikti, "utf8")).args.map((a) => a.value);
  const tx = await ag.transaction.build.simple({ sender: sepet.accountAddress, data: { function: "0x1::code::publish_package_txn",
    functionArguments: [MoveVector.U8(Buffer.from(meta.slice(2), "hex")), new MoveVector(kod.map((c) => MoveVector.U8(Buffer.from(c.slice(2), "hex"))))] }, options: { maxGasAmount: 400000 } });
  const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: sepet.publicKey, transaction: tx });
  sonuc("pulse_sepet yukseltmesi (compatible, dex bagimliligi)", sim.success, sim.vm_status + ", ~" + (Number(sim.gas_used) * Number(sim.gas_unit_price) / 1e8).toFixed(4) + " APT");
}
{
  const D = "0x8b4a2c4bb53857c718a04c020b98f8c2e1f99a68b0f57389a8bf5434cd22e05c";
  const USDC = "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b";
  const x = LISTE.aptos[0];
  const d = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_PRIVATE_KEY")) });
  const betik = path.join(KOK, "ozel", "hyperion-prova.mv");
  cp.execFileSync("C:/Users/omen/araclar/aptos/aptos.exe", ["move", "compile-script", "--package-dir", path.join(KOK, "aptos", "hyperion-prova"), "--output-file", betik, "--skip-fetch-latest-git-deps"], { stdio: "ignore" });
  const [, sqrt] = await ag.view({ payload: { function: D + "::pool_v3::current_tick_and_price", functionArguments: [x.havuz] } });
  const v = await ag.view({ payload: { function: D + "::pool_v3::supported_inner_assets", functionArguments: [x.havuz] } });
  const dolarA = v[0][0].inner === USDC;
  const tx = await ag.transaction.build.simple({ sender: d.accountAddress, data: { bytecode: fs.readFileSync(betik),
    functionArguments: [AccountAddress.from(x.havuz), AccountAddress.from(USDC), new U64(1_000_000), new Bool(dolarA), new U128(dolarA ? BigInt(sqrt) * 9850n / 10000n : BigInt(sqrt) * 10150n / 10000n)] } });
  const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: d.publicKey, transaction: tx });
  const ev = sim.events.find((e) => /SwapEventV3/.test(e.type));
  sonuc("Hyperion bacagi: 1 USDC -> " + x.ad + " (" + x.havuz.slice(0, 10) + "…, " + (dolarA ? "a->b" : "b->a") + ", sinir %1,5 sqrt)", sim.success,
    ev ? "girdi " + ev.data.amount_in + " cikti " + ev.data.amount_out : sim.vm_status);
}
console.log(gecti + "/" + toplam + " gecti");
process.exitCode = gecti === toplam ? 0 : 1;
