"use strict";
/* ===========================================================================
 * dene-ozet.js — does the signer sign what the contract checks?
 *
 *   node scripts/dene-ozet.js
 *
 * The signer builds the digest in JavaScript and the contract rebuilds it
 * in Solidity. If those two ever disagree by a byte, every signature the
 * signers produce is worthless and nothing says so until a withdrawal
 * fails — or, worse, until a digest that nobody intended turns out to be
 * signable.
 *
 * So the comparison is against KopruKanit.ozet() running on the real
 * chain, not against a second copy of the arithmetic. A test where both
 * sides are mine proves only that I am consistent.
 *
 * Several deliberately awkward cases are included: a zero recipient, the
 * maximum amount, an event id of all ones. Those are where an encoding
 * that works for ordinary values stops working.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface, keccak256, getAddress } = require("ethers");
const OZET = require("../kopru/ozet.js");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const KOK = path.join(__dirname, "..");
const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-depth.json"), "utf8"));
const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestBridge.json"), "utf8"));
const KOSUM = "0x0000000000000000000000000000000000000E11";

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({ hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(90000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 30000);
    }
  }
}

const bIface = new Interface(B.abi);


(async function main() {
  const KEYS = [
    "0x1111111111111111111111111111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333333333333333333333333333"
  ];
  const { Wallet } = require("ethers");
  const imzacilar = KEYS.map((k) => new Wallet(k).address);
  const KAYNAK = 5042;
  const E = 10n ** 18n;
  const kur = [imzacilar, 2, KAYNAK, 100n * E, 3600n, 150n * E];

  const durumlar = [
    ["siradan", keccak256(Buffer.from("burn-1")),
      getAddress("0x" + "B0B".padStart(40, "0")), 10n * E],
    ["sifir alici", keccak256(Buffer.from("x")),
      "0x0000000000000000000000000000000000000000", 1n],
    ["bir wei", keccak256(Buffer.from("y")),
      getAddress("0x" + "A11CE".padStart(40, "0")), 1n],
    ["uint256 max", "0x" + "ff".repeat(32),
      getAddress("0x" + "f".repeat(40)), (1n << 256n) - 1n],
    ["buyuk miktar", keccak256(Buffer.from("z")),
      getAddress("0x" + "1".repeat(40)), (1n << 200n)]
  ];

  /* One call: the vault exists only while the eth_call that deploys it is
     running, so it has to answer from inside. Asking it afterwards reaches
     an address with no code and returns empty — which reads as a mismatch
     and is not one. */
  const r = await rpc("eth_call", [
    { from: "0x000000000000000000000000000000000000dEaD", to: KOSUM, gas: "0x8000000",
      data: bIface.encodeFunctionData("ozetler", [kur,
        durumlar.map((d) => d[1]), durumlar.map((d) => d[2]), durumlar.map((d) => d[3])]) },
    "latest", { [KOSUM]: { code: B.deployedBytecode } }]);
  const [kasa, zincirler] = bIface.decodeFunctionResult("ozetler", r);

  console.log("OZET DENETIMI — kopru/ozet.js ile zincirdeki KopruKanit.ozet()");
  console.log("");
  console.log("  dogrulayan kontrat  " + kasa);
  console.log("  hedef zincir        " + CHAIN_ID + "   kaynak zincir " + KAYNAK);
  console.log("");

  let gecti = 0, kaldi = 0;
  for (let i = 0; i < durumlar.length; i++) {
    const [ad, olayId, alici, miktar] = durumlar[i];
    /* The contract returns the prefixed hash, so the local raw hash is
       prefixed the same way before comparing. */
    const yerel = OZET.onEkli(OZET.ham(CHAIN_ID, kasa, KAYNAK, olayId, alici, miktar));
    const esit = zincirler[i].toLowerCase() === yerel.toLowerCase();
    if (esit) gecti++; else kaldi++;
    console.log("  " + (esit ? "TAMAM" : "HATA ") + " " + ad.padEnd(14) +
      yerel.slice(0, 20) + "…" +
      (esit ? "" : "  BEKLENEN YUKARIDA, ZINCIR " + zincirler[i]));
  }

  console.log("");
  console.log("  " + gecti + " gecti, " + kaldi + " kaldi");
  if (kaldi) {
    console.log("");
    console.log("  Imzacilar sozlesmenin kontrol ettiginden BASKA bir sey imzaliyor.");
    console.log("  Bu haliyle kopru calismaz; duzelmeden imzaci calistirilmamali.");
    process.exit(1);
  }
  console.log("");
  console.log("  Imzacinin imzaladigi bayt, sozlesmenin dogruladigi bayt ile ayni.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
