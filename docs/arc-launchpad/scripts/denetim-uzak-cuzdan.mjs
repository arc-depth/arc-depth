/* ===========================================================================
 * denetim-uzak-cuzdan.mjs — the Solana / Sui / Aptos wallet pieces on mainnet,
 * nothing sent (quotes, simulations and dry runs only)
 *
 *   NODE_PATH=C:/Users/omen/araclar/aptossdk/node_modules node scripts/denetim-uzak-cuzdan.mjs
 *   (NODE_PATH must reach @aptos-labs/ts-sdk, as for scripts/bekci-aptos.js)
 *
 * Solana  docs/js/solana-ikiz.js: the endpoint's quote for the gate's message
 *         (0 and 192-byte orders), the Gonder transaction built with
 *         our endpoint accounts (lz-solana-hesap.js) and simulated (it must reach the twin burn, and fit
 *         one transaction); relay.link's route for a launch paid from Solana.
 * Sui     docs/js/uzak-ikiz.js: kapi::teklif routed through the chain's own PTB
 *         description (lz-sui-ptb.js); kapi::gonder's arguments (inspected: refused only for the twin
 *         that does not exist); the CCTP v2 launch burn toward LaunchEmaneti
 *         dry-run from an address holding USDC.
 * Aptos   kapi::ucret; kapi::gonder simulated (refused only for the missing
 *         twin); Circle's deposit_for_burn_with_hook script simulated from an
 *         address holding USDC.
 * The checks that need a twin someone holds report what they can and say so.
 * =========================================================================== */
import fs from "fs";
import crypto from "crypto";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { AbiCoder } = require("ethers");

const K = "C:/arc-launchpad";
const sol = await import("file:///" + K + "/docs/vendor/solana.mjs");
const SI = await import("file:///" + K + "/docs/js/solana-ikiz.js");
const U = await import("file:///" + K + "/docs/js/uzak-ikiz.js");
const lz = await import("file:///" + K + "/docs/vendor/sui.mjs");
const { Aptos, AptosConfig, Network } = require("@aptos-labs/ts-sdk");

let g = 0, k = 0;
const ok = (c, ad, d) => { c ? g++ : k++; console.log((c ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const FTHM = "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE";
const ARC_ALICI = new Uint8Array(32).fill(0); ARC_ALICI[31] = 0xad; ARC_ALICI[30] = 0xde;
const istek = Uint8Array.from(Buffer.from(AbiCoder.defaultAbiCoder().encode(["uint8", "uint32", "bytes32", "uint256", "address", "uint256"],
  [0, 26, "0x" + Buffer.from(ARC_ALICI).toString("hex"), 1n, "0x000000000000000000000000000000000000dEaD", 0n]).slice(2), "hex"));
const EMANET = "0x000000000000000000000000000000000000e0a1";   // a stand-in until LaunchEmaneti is deployed
/* a launch as the site encodes it (the basket measured by scripts/denetim-launch-emaneti.js) */
const b32 = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const istekL = ["Uzak Prova", "UZAK", [[26, b32(FTHM), 10_000_000n], [6, b32("0x4200000000000000000000000000000000000006"), 10_000_000n]],
  [650_000n * 10n ** 18n, 3n * 10n ** 15n], 20_000n, 100_000_000n, b32("0xF00D"), 26, 0, [], "0x", 0n, "0x", EMANET, ["", ""], [], 0n];
const kanca = U.launchKancasi(AbiCoder, istekL, "0x0000000000000000000000000000000000001ADE");

console.log("UZAK CUZDANLAR  Solana / Sui / Aptos (ana ag, gonderim yok)");

/* ---- Solana ---- */
console.log("Solana");
const env = fs.readFileSync(K + "/.env", "utf8");
const tohum = Buffer.from(env.match(/^SOLANA_PRIVATE_KEY\s*=\s*([0-9a-fA-F]{64})\s*$/m)[1], "hex");
const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), tohum]);
const solBen = sol.bs58.encode(crypto.createPublicKey(crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" })).export({ format: "der", type: "spki" }).subarray(-32));
const u0 = await SI.teklif(solBen, 0), u192 = await SI.teklif(solBen, 192);
ok(u0 > 0n && u192 >= u0, "LayerZero ucreti (uc noktanin kendi quote'u, simule)", (Number(u0) / 1e9).toFixed(6) + " / " + (Number(u192) / 1e9).toFixed(6) + " SOL");
const { tx: solTx } = await SI.gonderIslemi(solBen, { token20: FTHM, alici32: ARC_ALICI, miktar: 1_000_000n, istek });
const bayt = solTx.serialize().length;
ok(bayt <= 1232, "Gonder islemi tek Solana islemine sigiyor (192 baytlik emirle)", bayt + " bayt");
const conn = new sol.Connection("https://api.mainnet-beta.solana.com", "confirmed");
const sim = await conn.simulateTransaction(solTx, { sigVerify: false, replaceRecentBlockhash: true });
const kayit = (sim.value.logs || []).join("\n");
ok(/G91zXh4LCEzY7UgE3JWic3Kt5ckBsnibkgdAXABatWJQ invoke \[1\]/.test(kayit) && /Tokenkeg\w+ invoke \[2\]/.test(kayit),
  "kapi programi hesaplari ve veriyi kabul etti, ikiz yakimina geldi (ikizi olan bir cuzdan yok: yakim ikizsiz duruyor)", JSON.stringify(sim.value.err));
const q = await fetch("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
  user: solBen, recipient: "0x000000000000000000000000000000000000dEaD", originChainId: 792703809, destinationChainId: 5042,
  originCurrency: "11111111111111111111111111111111", destinationCurrency: "0x0000000000000000000000000000000000000000",
  amount: (10n ** 18n).toString(), tradeType: "EXACT_OUTPUT" }) }).then((x) => x.json());
const veri = q.steps && q.steps[0] && q.steps[0].items[0].data;
ok(veri && Array.isArray(veri.instructions) && veri.instructions.length > 0, "relay Solana'dan Arc'a rota veriyor: Solana talimatlari + adres tablolari", veri ? veri.instructions.length + " talimat" : q.message);

/* ---- Sui ---- */
console.log("Sui");
const suiBen = "0x9d547e639e4dad7b98f1ec9a6e8d684f42dd289fb0875f08a2ed8fc77fe7f078";   // the Sui deployer: holds a little USDC (read only)
const s0 = await U.suiTeklif(suiBen, FTHM, ARC_ALICI, 1_000_000n), s192 = await U.suiTeklif(suiBen, FTHM, ARC_ALICI, 1_000_000n, istek);
ok(s0 > 0n && s192 >= s0, "kapi::teklif zincirin PTB tarifiyle uc noktadan gecti (kendi kodumuz)", (Number(s0) / 1e9).toFixed(4) + " / " + (Number(s192) / 1e9).toFixed(4) + " SUI");
const c = new lz.SuiJsonRpcClient({ url: "https://sui-rpc.publicnode.com" });
{
  const tx = new lz.Transaction();
  const [para] = tx.splitCoins(tx.gas, [tx.pure.u64(1000)]);
  const [ucret] = tx.splitCoins(tx.gas, [tx.pure.u64(1000)]);
  tx.moveCall({ target: U.UZAK.sui.ikizPaket + "::kapi::gonder", typeArguments: ["0x2::sui::SUI"], arguments: [tx.object(U.UZAK.sui.kapiNesne), tx.object(U.UZAK.sui.oapp),
    tx.pure.address(b32(FTHM)), para, tx.pure.vector("u8", Array.from(ARC_ALICI)), tx.pure.vector("u8", Array.from(istek)), ucret] });
  const r = await c.devInspectTransactionBlock({ sender: suiBen, transactionBlock: tx });
  ok(r.effects.status.status === "failure" && /function_name: Some\("gonder"\) \}, 13\)/.test(r.effects.status.error || ""),
    "kapi::gonder argumanlari dogru: yalniz kayitsiz ikiz icin durdu (EIkizYok)", (r.effects.status.error || "").replace(/.*function_name: Some\("(\w+)"\).*\}, (\d+)\).*/, "$1, abort $2"));
}
{
  const tx = await U.suiLaunchIslemi(suiBen, { emanet: EMANET, miktar6: 1_000_000n, kanca });
  const r = await c.dryRunTransactionBlock({ transactionBlock: await tx.build({ client: c }) });
  const yakim = (r.events || []).find((e) => /DepositForBurn/.test(e.type));
  ok(r.effects.status.status === "success" && yakim, "CCTP v2 launch yakimi (deposit_for_burn -> handler::burn -> complete_burn) basarili",
    r.effects.status.status + (yakim ? ", DepositForBurn: alici " + String(yakim.parsedJson.mint_recipient).slice(0, 12) + "…, kanca " + kanca.length + " bayt" : ""));
  ok(yakim && b32(yakim.parsedJson.mint_recipient) === b32(EMANET) && b32(yakim.parsedJson.destination_caller) === b32(EMANET) &&
    Number(yakim.parsedJson.destination_domain) === 26, "yakim Arc'a, aliciyi ve tek cagirani emanet olarak tasiyor");
}

/* ---- Aptos ---- */
console.log("Aptos");
const a0 = await U.aptosTeklif(FTHM, ARC_ALICI, 1_000_000n), a192 = await U.aptosTeklif(FTHM, ARC_ALICI, 1_000_000n, istek);
ok(a0 > 0n && a192 >= a0, "kapi::ucret", (Number(a0) / 1e8).toFixed(4) + " / " + (Number(a192) / 1e8).toFixed(4) + " APT");
const aptos = new Aptos(new AptosConfig({ network: Network.MAINNET }));
const aptosBen = "0xd6fd2a6165ef79b11265ed046f7c615af93afb8d3089a0d2b12dabecc85c20ea";   // an address holding USDC and APT on Aptos (read only)
{
  const tx = await aptos.transaction.build.simple({ sender: aptosBen, data: { function: U.UZAK.aptos.ikizHesap + "::kapi::gonder",
    functionArguments: [b32(FTHM), ARC_ALICI, "1000000", istek, "100000000"] } });
  const [r] = await aptos.transaction.simulate.simple({ transaction: tx });
  ok(!r.success && /EIkizYok|kapi: 0x5|0x5$|code 5/i.test(r.vm_status), "kapi::gonder argumanlari dogru: yalniz ikizi olmayan token icin durdu (EIkizYok)", r.vm_status.slice(0, 120));
}
{
  const bytecode = new Uint8Array(fs.readFileSync(K + "/docs/vendor/cctp-aptos-v2-deposit_for_burn_with_hook.mv"));
  const yuk = await U.aptosLaunchYuku({ emanet: EMANET, miktar6: 1_000_000n, kanca, bytecode });
  const tx = await aptos.transaction.build.simple({ sender: aptosBen, data: yuk });
  const [r] = await aptos.transaction.simulate.simple({ transaction: tx });
  const yakim = (r.events || []).find((e) => /DepositForBurn/.test(e.type));
  ok(r.success && yakim, "Circle'in deposit_for_burn_with_hook betigi (ana ag v2) launch yakimini yapiyor", r.vm_status + (yakim ? ", kanca " + kanca.length + " bayt" : ""));
  ok(yakim && b32(yakim.data.mint_recipient) === b32(EMANET) && b32(yakim.data.destination_caller) === b32(EMANET) && Number(yakim.data.destination_domain) === 26,
    "yakim Arc'a, aliciyi ve tek cagirani emanet olarak tasiyor");
}

/* ---- Arc: the hook the wallets burn with is what LaunchEmaneti reads ---- */
console.log("Arc");
{
  const { Interface } = require("ethers");
  const A = JSON.parse(fs.readFileSync(K + "/build/LaunchEmaneti.json", "utf8"));
  const I = new Interface(A.abi);
  const r = await fetch("https://arc-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1,
    method: "eth_call", params: [{ from: EMANET, to: EMANET, data: I.encodeFunctionData("coz", ["0x" + Buffer.from(kanca).toString("hex")]) }, "latest", { [EMANET]: { code: A.deployedBytecode } }] }) }).then((x) => x.json());
  const [q, iade] = r.result ? I.decodeFunctionResult("coz", r.result) : [null, null];
  ok(q && q[0] === "Uzak Prova" && q[2].length === 2 && q[5] === 100_000_000n && String(iade).toLowerCase() === "0x0000000000000000000000000000000000001ade",
    "cuzdanlarin yaktigi kanca LaunchEmaneti.coz ile okunuyor", q ? q[0] + ", " + q[2].length + " satir, alim " + Number(q[5]) / 1e6 + " $" : JSON.stringify(r.error));
}
console.log("\n" + g + "/" + (g + k) + " gecti");
if (k) process.exitCode = 1;
