"use strict";
/* ===========================================================================
 * denetim-aktarma-lz.js — the Base hop between Arc and the Sui/Aptos twin gates
 *
 *   node scripts/denetim-aktarma-lz.js
 *
 * Runs contracts/test/TestAktarmaLZ.sol in one eth_call on Base mainnet state
 * (the hop's logic with the test as its endpoint; the second-hop fees from
 * Base's real LayerZero endpoint). Nothing is sent.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");
const KOK = path.join(__dirname, "..");
const H = "0x00000000000000000000000000000000000c0de4";
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestAktarmaLZ.json"), "utf8"));
const I = new Interface(T.abi);
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
(async () => {
  const eth = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd").then((x) => x.json()).then((j) => j.ethereum.usd).catch(() => 0);
  const r = await fetch("https://base-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: H, to: H, data: I.encodeFunctionData("run", []), gas: "0x10000000" }, "latest",
      { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 20n).toString(16) } }] }) }).then((x) => x.json());
  if (r.error) { console.log("HATA eth_call: " + JSON.stringify(r.error).slice(0, 400)); process.exit(1); }
  const [s] = I.decodeFunctionResult("run", r.result);
  const u = (x) => (Number(x) / 1e18).toFixed(6) + " ETH ($" + ((Number(x) / 1e18) * eth).toFixed(3) + ")";
  console.log("AKTARMA LZ  Base ana ag durumu");
  ok(s.ucretsizRed, "bakiye yokken ikinci adim odenemedi, mesaj yeniden denenmek uzere kaldi");
  ok(s.arcdanSuiye, "Arc merkezinden gelen mesaj Sui kapisina aynen gitti");
  ok(s.suidenArca, "Sui kapisindan gelen mesaj kaynak zincir eklenerek Arc merkezine gitti");
  ok(s.yabanciRed, "Sui'den yabanci gonderen reddedildi");
  ok(s.arcYabanciRed, "Arc'tan merkez olmayan gonderen reddedildi");
  ok(s.kapisizRed, "kapisi baglanmamis zincire aktarma reddedildi");
  ok(s.suiDestek && s.aptosDestek, "Base uc noktasi Sui ve Aptos'u destekliyor");
  ok(s.ucretSui > 0n, "Base -> Sui ikinci adim ucreti", u(s.ucretSui));
  ok(s.ucretAptos > 0n, "Base -> Aptos ikinci adim ucreti", u(s.ucretAptos));
  ok(s.ucretArc > 0n, "Base -> Arc ikinci adim ucreti", u(s.ucretArc));
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
