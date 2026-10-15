"use strict";
/* ===========================================================================
 * denetim-ikiz-havuz.js — a twin's pool on Robinhood, real PoolManager
 *
 *   node scripts/denetim-ikiz-havuz.js
 *
 * Runs contracts/test/TestIkizHavuz.sol in one eth_call on ROBINHOOD MAINNET
 * state: the real Uniswap v4 PoolManager and real USDG (harness balance
 * written to USDG's balance slot 1). IkizHavuzFabrika opens the twin/USDG
 * pool through the unchanged PulseAcici; IkizKilitHook sits at an address
 * carrying the 0xA00 permission bits.
 *
 * Checked: a hook not built for this factory is refused; a stale home price,
 * a bid under $50 and a price 20% from home are all refused; the real open
 * lands at the home price with ~$100 of real USDG in the bid and nothing
 * left behind; a stranger can neither remove nor add liquidity through the
 * real PoolManager; the twin's pool cannot be opened twice.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface, AbiCoder, keccak256, getCreate2Address } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = "https://rpc.mainnet.chain.robinhood.com";
const B = (ad) => JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const H = "0x00000000000000000000000000000000000000FC";
const HOOK = "0x0000000000000000000000000000000000000A00";

async function rpc(m, p) {
  for (let i = 1; ; i++) {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
    if (r.result !== undefined) return r.result;
    const msg = JSON.stringify(r.error);
    if (!/rate limit|too many/i.test(msg) || i > 6) throw new Error(msg);
    await new Promise((s) => setTimeout(s, i * 8000));
  }
}
let gecti = 0, kaldi = 0;
function ok(k, ad, v) { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (v !== undefined ? "  (" + v + ")" : "")); }
function isqrt(n) { if (n < 2n) return n; let x = n, y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; }

(async () => {
  const T = B("TestIkizHavuz"), R = B("SahteReferans"), F = B("IkizHavuzFabrika"), HK = B("IkizKilitHook");
  const I = new Interface(T.abi);
  const ref = getCreate2Address(H, "0x" + "00".repeat(31) + "01", keccak256(R.bytecode));
  const fInit = F.bytecode + coder.encode(["address", "address", "address"], [PM, USDG, ref]).slice(2);
  const fab = getCreate2Address(H, "0x" + "00".repeat(31) + "02", keccak256(fInit));
  const hookKod = await rpc("eth_call", [{ data: HK.bytecode + coder.encode(["address", "address"], [PM, fab]).slice(2) }, "latest"]);

  /* $0.0000035 per token, the launch opening price: raw price
     3.5e-6 * 1e6 / 1e18 = 3.5e-18 quote units per token unit. */
  const refSqrt = isqrt((35n << 192n) / 10n ** 19n);
  const yuva = keccak256(coder.encode(["address", "uint256"], [H, 1]));

  const out = await rpc("eth_call", [
    { from: "0x3333333333333333333333333333333333333333", to: H, gas: "0x10000000",
      data: I.encodeFunctionData("run", [PM, USDG, HOOK, refSqrt]) }, "latest",
    { [H]: { code: T.deployedBytecode },
      [HOOK]: { code: hookKod },
      [USDG]: { stateDiff: { [yuva]: "0x" + (1_000_000n * 10n ** 6n).toString(16).padStart(64, "0") } } }]);
  const [s] = I.decodeFunctionResult("run", out);
  const u = (x) => (Number(BigInt(x)) / 1e6).toFixed(6);

  console.log("IKIZ HAVUZU  Robinhood ana ag durumu, gercek PoolManager + gercek USDG");
  ok(s.yanlisHookReddedildi, "bu fabrika icin kurulmamis hook reddedildi");
  ok(s.bayatReferansReddedildi, "2 saatlik bayat ev fiyati reddedildi");
  ok(s.azTeklifReddedildi, "$50 alti teklifle acilis reddedildi");
  ok(s.uzakFiyatReddedildi, "ev fiyatindan %20 uzak acilis reddedildi");
  ok(s.acildi, "ikiz havuzu acildi");
  ok(BigInt(s.havuzSqrtP) === BigInt(s.beklenenSqrtP), "havuz tam ev fiyatinda acildi");
  const q = BigInt(s.havuzdakiUsdg);
  ok(q >= 99_990_000n && q <= 100_000_000n, "havuzda gercek USDG teklifi duruyor", "$" + u(q));
  ok(BigInt(s.aciciKalanUsdg) < 1000n, "acicida USDG kalmadi, hepsi havuzda", s.aciciKalanUsdg.toString() + " ham");
  ok(BigInt(s.aciciKalanIkiz) * 10n ** 9n < 10_000_000n * 10n ** 18n, "acicida kayda deger ikiz kalmadi", s.aciciKalanIkiz.toString() + " ham");
  ok(s.yabanciCekemedi, "yabanci gercek PoolManager uzerinden likidite CEKEMEDI");
  ok(s.yabanciEkleyemedi, "yabanci likidite EKLEYEMEDI");
  ok(s.ikinciAcilisReddedildi, "ayni ikiz icin ikinci havuz reddedildi");
  for (const ad of ["IkizHavuzFabrika", "IkizKilitHook"]) {
    const boy = (B(ad).deployedBytecode.length - 2) / 2;
    ok(boy < 24576, ad + " dagitilabilir boyutta", boy + " bayt");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message.slice(0, 600)); process.exit(1); });
