"use strict";
/* ===========================================================================
 * denetim-fthm-fark.js — Arc price over LayerZero, gap fee on Robinhood
 *
 *   node scripts/denetim-fthm-fark.js
 *
 * Runs contracts/test/TestFTHMFark.sol in one eth_call: FiyatElcisi reads
 * the Arc FTHM pool price and sends it, FTHMFarkHook on Robinhood stores it
 * and charges swaps that capture the gap. Checked: no reference means no
 * fee; the price arrives and is stored; a cheap-side buy pays 2% of the
 * output, to the vault, with the matching hook delta; a cheap-side sell
 * pays nothing; exact-output pays on the input; an older message cannot
 * roll the price back; a forged sender, a foreign pool and a caller other
 * than the PoolManager are refused; and an Arc pool with the opposite token
 * order is inverted into the same 2%.
 *
 * Not covered here: real v4 settlement and the real LayerZero endpoint —
 * that is the testnet step.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestFTHMFark.json"), "utf8"));
const I = new Interface(T.abi);
const H = "0x00000000000000000000000000000000000000F9";
const KASA = "0x000000000000000000000000000000000000CA5A";
const FTHM = "0x0000000000000000000000000000000000001000";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

function rpc(m, p) {
  return new Promise((r, j) => {
    const b = JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p });
    const q = https.request({ hostname: "rpc.mainnet.arc.io", path: "/", method: "POST",
      headers: { "content-type": "application/json" } }, (s) => {
      let d = ""; s.on("data", (c) => (d += c));
      s.on("end", () => { const x = JSON.parse(d); x.error ? j(new Error(JSON.stringify(x.error))) : r(x.result); });
    });
    q.on("error", j); q.write(b); q.end();
  });
}
let gecti = 0, kaldi = 0;
function ok(k, ad, v) { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (v !== undefined ? "  (" + v + ")" : "")); }
const esit = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const yakin = (a, hedef, tol) => { const x = BigInt(a), h = BigInt(hedef); return (x > h ? x - h : h - x) <= BigInt(tol); };

(async () => {
  let out;
  for (let i = 1; ; i++) {
    try { out = await rpc("eth_call", [{ to: H, data: I.encodeFunctionData("run", []), gas: "0x8000000" }, "latest", { [H]: { code: T.deployedBytecode } }]); break; }
    catch (e) { if (!/rate limit/.test(e.message) || i > 6) throw e; await new Promise((r) => setTimeout(r, i * 8000)); }
  }
  const [s] = I.decodeFunctionResult("run", out);
  const E18 = 10n ** 18n, E6 = 10n ** 6n;

  console.log("FTHM FARK UCRETI  Arc fiyati -> LayerZero -> Robinhood hook");
  ok(BigInt(s.refsizAlim) === 0n, "referans yokken ucret alinmadi");
  ok(BigInt(s.ref) > 0n && BigInt(s.refZaman) > 0n, "Arc fiyati LayerZero ile geldi ve saklandi", "zaman " + s.refZaman);
  ok(yakin(s.alimUcret, 20n * E18, 10n ** 15n), "ucuz tarafta exact-input ALIM: FTHM ciktisinin %2'si", (Number(BigInt(s.alimUcret)) / 1e18).toFixed(4) + " FTHM");
  ok(esit(s.alimPara, FTHM), "ucret ciktidan, FTHM cinsinden alindi");
  ok(esit(s.alimKasa, KASA), "ucret kasaya gitti");
  ok(BigInt(s.alimDelta) === BigInt(s.alimUcret), "hook delta'si alinan ucrete esit", s.alimDelta.toString());
  ok(BigInt(s.satimAlimSayisiFark) === 0n, "ucuz tarafta SATIM fiyatlari yaklastirir: ucret yok");
  ok(yakin(s.exactOutUcret, 245n * E6 / 10n, 1225n * E6 * 2n / 1000000n) && esit(s.exactOutPara, USDG), "exact-output alim: USDG girdisinin %2'si", (Number(BigInt(s.exactOutUcret)) / 1e6).toFixed(4) + " USDG");
  ok(s.eskiMesajYokSayildi, "daha eski tarihli mesaj fiyati geri saramadi");
  ok(s.sahteReddedildi, "peer disi gonderen reddedildi");
  ok(s.yabanciHavuzReddedildi, "FTHM/USDG olmayan havuz reddedildi");
  ok(s.pmDisiReddedildi, "PoolManager disindan cagri reddedildi");
  ok(yakin(s.terstenUcret, 20n * E18, 10n ** 15n), "Arc'ta token sirasi ters: fiyat cevrildi, yine %2", (Number(BigInt(s.terstenUcret)) / 1e18).toFixed(4) + " FTHM");

  for (const ad of ["FiyatElcisi", "FTHMFarkHook"]) {
    const boy = (JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8")).deployedBytecode.length - 2) / 2;
    ok(boy < 24576, ad + " dagitilabilir boyutta", boy + " bayt");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
