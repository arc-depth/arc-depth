/* ===========================================================================
 * yerel-prova.mjs — the site's Aptos code (docs/js/aptos.js, move-hesap.js)
 * end to end on a local Aptos network, against a dollar shaped like Circle's
 * USDC (dispatch hooks on deposit and withdraw: the case the first mainnet
 * packages failed on).
 *
 *   aptos node run-localnet --test-dir C:/Users/omen/araclar/aptos/yerel --force-restart --assume-yes --no-txn-stream
 *   node aptos/yerel-prova.mjs
 *
 * Publishes the hooked dollar (aptos/yerel-usdc) and the launchpad +
 * PulseSwap, initializes them, points aptos.js at them, then runs the site's
 * own calls: launch, read the token page, buy, sell, redeem. Only the wallet
 * prompt is replaced by a local key.
 * =========================================================================== */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = "C:/Users/omen/araclar/aptos/aptos.exe";
const req = createRequire("C:/Users/omen/araclar/aptossdk/node_modules/");
const { Aptos, AptosConfig, Network, Account, MoveVector } = req("@aptos-labs/ts-sdk");
const A = await import("../docs/js/aptos.js");
const H = await import("../docs/js/move-hesap.js");
const ag = new Aptos(new AptosConfig({ network: Network.LOCAL }));
const USD = 1_000_000n;
let gecti = 0, kaldi = 0;
const kontrol = (ad, ok, ek = "") => { ok ? gecti++ : kaldi++; console.log((ok ? "  PASS  " : "  FAIL  ") + ad + (ek ? "   " + ek : "")); };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function gonder(hesap, data) {
  const tx = await ag.transaction.build.simple({ sender: hesap.accountAddress, data, options: { maxGasAmount: 400000 } });
  const g = await ag.signAndSubmitTransaction({ signer: hesap, transaction: tx });
  const r = await ag.waitForTransaction({ transactionHash: g.hash });
  if (!r.success) throw new Error(data.function + ": " + r.vm_status);
  return g.hash;
}
async function yayinla(hesap, dizin, adlar) {
  const out = path.join(KOK, "ozel", "yerel-" + path.basename(dizin) + ".json");
  execFileSync(CLI, ["move", "build-publish-payload", "--package-dir", dizin, "--named-addresses", adlar, "--json-output-file", out, "--assume-yes", "--skip-fetch-latest-git-deps"], { stdio: "ignore" });
  const [meta, kod] = JSON.parse(fs.readFileSync(out, "utf8")).args.map((a) => a.value);
  await gonder(hesap, { function: "0x1::code::publish_package_txn", functionArguments: [MoveVector.U8(Buffer.from(meta.slice(2), "hex")), new MoveVector(kod.map((c) => MoveVector.U8(Buffer.from(c.slice(2), "hex"))))] });
}

/* ---- setup ------------------------------------------------------------ */
const usdcHesap = Account.generate(), pulse = Account.generate(), founder = Account.generate(), buyer = Account.generate(), platform = Account.generate();
/* the local faucet directly: the SDK's fundAccount waits for an indexer this network does not run */
for (const h of [usdcHesap, pulse, founder, buyer]) {
  const hashler = await fetch("http://127.0.0.1:8081/mint?amount=1000000000&address=" + h.accountAddress.toString(), { method: "POST" }).then((r) => r.json());
  for (const x of hashler) await ag.waitForTransaction({ transactionHash: x });
}
const U = usdcHesap.accountAddress.toString(), P = pulse.accountAddress.toString();
await yayinla(usdcHesap, path.join(KOK, "aptos", "yerel-usdc"), "yerel_usdc=" + U);
const [usdcMeta] = await ag.view({ payload: { function: U + "::usdc::metadata" } });
const USDC = usdcMeta.inner;
const disp = await fetch("http://127.0.0.1:8080/v1/accounts/" + USDC + "/resource/0x1::fungible_asset::DispatchFunctionStore").then((r) => r.ok);
kontrol("yerel dolar Circle USDC gibi kancali (DispatchFunctionStore var)", disp);
await yayinla(pulse, path.join(KOK, "aptos", "pulse-launchpad"), "pulse=" + P);
await yayinla(pulse, path.join(KOK, "aptos", "pulse-swap"), "pulse=" + P + ",pulse_swap=" + P);
await gonder(pulse, { function: P + "::launchpad::initialize", functionArguments: [USDC, platform.accountAddress.toString()] });
await gonder(pulse, { function: P + "::launchpad::register_adapter", typeArguments: [P + "::swap::Witness"], functionArguments: [] });
await gonder(pulse, { function: P + "::swap::initialize", functionArguments: [platform.accountAddress.toString(), "0x" + "a".padStart(64, "0"), "0x" + "dead".padStart(64, "0")] });
kontrol("launchpad + PulseSwap (v2 kodu) yerel agda kuruldu", true, P.slice(0, 12) + "…");

/* the site's module, pointed at the local network; the wallet is a local key */
Object.assign(A.APTOS, { api: "http://127.0.0.1:8080/v1", paket: P, usdc: USDC });
let imzalayan = founder;
A.aptosCuzdan.gonder = (fn, typeArgs, args) => gonder(imzalayan, { function: fn, typeArguments: typeArgs, functionArguments: args });
A.aptosCuzdan.baglan = async () => imzalayan.accountAddress.toString();
await gonder(founder, { function: U + "::usdc::mint", functionArguments: [1000n * USD] });
await gonder(buyer, { function: U + "::usdc::mint", functionArguments: [100n * USD] });
kontrol("usdcBakiye: kurucuda 1000", (await A.usdcBakiye(founder.accountAddress.toString())) === 1000n * USD);

/* ---- the launch, exactly as the site sends it ------------------------- */
const hash = await A.launchDolar({ ad: "Yerel Aptos Test", sembol: "YAT", teminat: 20n * USD, ilkAlim: 100n * USD, vergiPpm: 10000 });
const tx = await A.islemBekle(hash);
const token = A.launchTokeni(tx);
kontrol("launch kancali dolarla GECTI ve token adresi olaydan okundu", tx.success && !!token, token);
let d = await A.tokenDurumu(token);
const kur = await A.faBakiye(founder.accountAddress.toString(), token);
kontrol("kurucu 27.237.354,085603 token = sitenin onizlemesi", kur === 27237354085603n && A.acilisTokeni(100n * USD) === kur, kur.toString());
kontrol("tokenDurumu: ad/sembol, kasa 20, havuz 98, dolasim = kurucunun tokeni", d.ad === "Yerel Aptos Test" && d.simge === "YAT" && d.kasa === 20n * USD && d.havuz.gercekDolar === 98n * USD && d.dolasim === kur);

/* ---- the token page's trades ------------------------------------------ */
await bekle(6000);   // past the anti-snipe window, so the quote is exact
imzalayan = buyer;
const q = H.alimTeklifi(d.havuz, 50n * USD);
await A.islemBekle(await A.al(token, 50n * USD, H.asgari(q.token)));
const aldi = await A.faBakiye(buyer.accountAddress.toString(), token);
kontrol("alim: zincirin verdigi = sayfanin teklifi", aldi === q.token, aldi + " = " + q.token);
d = await A.tokenDurumu(token);
const sq = H.satimTeklifi(d.havuz, aldi);
const u0 = await A.usdcBakiye(buyer.accountAddress.toString());
await A.islemBekle(await A.sat(token, aldi, H.asgari(sq.dolar, 600)));
const geri = (await A.usdcBakiye(buyer.accountAddress.toString())) - u0;
kontrol("satis: kalkan dahil teklifin %6 icinde", geri <= sq.dolar && geri >= H.asgari(sq.dolar, 600), geri + " / teklif " + sq.dolar);
d = await A.tokenDurumu(token);
imzalayan = founder;
const onda = kur / 10n;
const beklenen = H.itfaPayi(d.kasa, onda, d.dolasim);
const f0 = await A.usdcBakiye(founder.accountAddress.toString());
await A.islemBekle(await A.itfa(token, onda, false));
kontrol("itfa %10: odenen = sayfanin hesabi", (await A.usdcBakiye(founder.accountAddress.toString())) - f0 === beklenen, String(beklenen));

console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
process.exit(kaldi ? 1 : 0);
