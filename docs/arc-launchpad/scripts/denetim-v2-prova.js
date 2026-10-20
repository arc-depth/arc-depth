"use strict";
/* ===========================================================================
 * denetim-v2-prova.js — the joint test launch, rehearsed (nothing is sent)
 *
 *   node scripts/denetim-v2-prova.js
 *
 * contracts/test/TestV2Prova.sol in two simulated blocks on Arc mainnet
 * (eth_simulateV1): the site's v2 launch request against the wired second
 * generation, with LayerZero's real fees; then buys delivered on Arc, on
 * Base and on Sui. What it cannot show: the deliveries on the other chains
 * (LayerZero's DVNs and executor, Circle) — the real joint launch does.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://arc-rpc.publicnode.com";
const H = "0x00000000000000000000000000000000000c0de3";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestV2Prova.json"), "utf8"));
const I = new Interface(T.abi);
const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-v2.json"), "utf8")).zincir.arc;
const rpc = async (m, p) => {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
  if (r.error) throw new Error(m + ": " + JSON.stringify(r.error).slice(0, 600));
  return r.result;
};
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { if (k) gecti++; else kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const u = (x) => (Number(BigInt(x)) / 1e18).toFixed(4);

(async () => {
  console.log("V2 PROVA  sitenin v2 launch istegi, bagli kontratlar, gercek LayerZero ucretleri (Arc ana ag, iki blok simulasyonu, gonderim yok)");
  /* the twin chains as the site picks them: those whose gate is wired and that LayerZero quotes for this message */
  const { Contract, JsonRpcProvider, AbiCoder } = require("ethers");
  const arc = new JsonRpcProvider(RPC, 5042, { staticNetwork: true });
  const hub = new Contract(A.IkizHub, ["function ucret(uint32,bytes) view returns (uint256)"], arc);
  const ornek = AbiCoder.defaultAbiCoder().encode(["uint8", "address", "string", "string"], [1, "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE", "Prova Ortak", "PROVA"]);
  const uzak = [];
  for (const [ad, e] of [["Solana", 30168], ["Sui", 30378], ["Aptos", 30108]]) {
    const u = await hub.ucret(e, ornek).catch(() => null);
    console.log("  " + ad.padEnd(7) + (u == null ? "LayerZero teklif vermedi: launch onsuz gider (sonra IkizHub.yarat)" : "teklif " + (Number(u) / 1e18).toFixed(3) + " USDC"));
    if (u != null && process.env.HEPSI) uzak.push(e);   // the site's default: twins there on demand (HEPSI=1: all at launch)
  }
  const simdi = Math.floor(Date.now() / 1000);
  const blok = (zaman, data, ez) => ({ ...(ez ? { stateOverrides: ez } : {}), blockOverrides: { time: "0x" + zaman.toString(16) },
    calls: [{ from: H, to: H, data, gas: "0x1c9c380" }] });
  const sim = await rpc("eth_simulateV1", [{ blockStateCalls: [
    blok(simdi + 5, I.encodeFunctionData("kur", [A.MerkezKapi, YAYICI, A.IkizHub, uzak]), { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 23n).toString(16) } }),
    blok(simdi + 75, I.encodeFunctionData("isle", [A.MerkezKapi, YAYICI, A.IkizHub])),
    /* on demand: the first holder to move the token to Solana creates its twin there, then moves 1M tokens */
    blok(simdi + 90, I.encodeFunctionData("talepUzerine", [A.IkizHub, 30168, "0x" + "5a".repeat(32), 10n ** 24n])),
  ] }, "latest"]);
  for (const [i, x] of sim.entries()) if (x.calls[0].status !== "0x1") throw new Error("blok " + (i + 1) + " basarisiz: " + JSON.stringify(x.calls[0].error || x.calls[0]).slice(0, 400));
  const [s] = I.decodeFunctionResult("isle", sim[1].calls[0].returnData);
  const b = (x) => BigInt(x);
  ok(s.token !== "0x0000000000000000000000000000000000000000", process.env.HEPSI ? "launch: 8 EVM ikizi + Solana/Sui/Aptos ikizleriyle tek islemde" : "launch: 8 EVM ikiziyle (Solana/Sui/Aptos talep uzerine)", s.token);
  ok(b(s.ikizUcret) > 0n, "EVM ikizlerinin LayerZero ucreti (x1,3)", u(s.ikizUcret) + " USDC");
  ok(process.env.HEPSI ? b(s.uzakUcret) > 0n : b(s.uzakUcret) === 0n, process.env.HEPSI ? "Solana/Sui/Aptos ikizlerinin ucreti (x1,3; Sui/Aptos Base aktarmasiyla)" : "varsayilan: Solana/Sui/Aptos ikizi launch'ta yaratilmaz, ucret 0", u(s.uzakUcret) + " USDC");
  const bek = { 30168: s.solana, 30378: s.sui, 30108: s.aptos };
  ok(uzak.every((e) => bek[e]) && [30168, 30378, 30108].filter((e) => !uzak.includes(e)).every((e) => !bek[e]), "ikiz merkezi teklif alinan zincirlere YARAT gonderdi, digerlerine gondermedi", uzak.join(", "));
  ok(b(s.arcAlim) > 0n, "50 $ alim Arc'ta teslim", (Number(b(s.arcAlim) / 10n ** 18n)).toLocaleString("en-US") + " token");
  ok(b(s.baseAlimKilit) > 0n, "50 $ alim Base'e: tokenler Arc adaptorunde kilitlendi, LayerZero ile gitti", (Number(b(s.baseAlimKilit) / 10n ** 18n)).toLocaleString("en-US") + " token");
  if (s.sui) ok(b(s.suiKilit) > 0n && b(s.suiKilit) % 10n ** 12n === 0n, "50 $ alim Sui'ye: ikiz merkezinde kilitlendi (6 ondalik tam birim)", (Number(b(s.suiKilit) / 10n ** 18n)).toLocaleString("en-US") + " token");
  ok(b(s.kapiDolar) === 0n, "kapida dolar kalmadi");
  const [once, sonra, kilit] = I.decodeFunctionResult("talepUzerine", sim[2].calls[0].returnData);
  ok(process.env.HEPSI || (!once && sonra), "talep uzerine: Solana ikizi launch'ta yoktu, ilk tasiyan yaratti", "once " + once + ", sonra " + sonra);
  ok(b(kilit) >= 10n ** 24n, "1M token Solana'ya: ikiz merkezinde kilitlendi", (Number(b(kilit) / 10n ** 18n)).toLocaleString("en-US") + " token");
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
