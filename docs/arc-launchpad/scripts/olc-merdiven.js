"use strict";
/* ===========================================================================
 * olc-merdiven.js — what the buyer's wallet will actually say.
 *
 *   node scripts/olc-merdiven.js
 *   node scripts/olc-merdiven.js --ic 300 --orta 100 --dis 100
 *
 * One table, one question: a person opens their wallet, types an amount,
 * and taps swap. What number comes up?
 *
 * Every row is the full three-rung ladder built inside the real Arc
 * PoolManager through the same ac() and genislet() calls production would
 * make, with one buy of that size pushed through it. Nothing is sent and
 * no pool is created.
 *
 * Two things are kept visible rather than folded in. The pool's own number
 * and the number after the 0.5% hook fee are both printed, because the
 * buyer pays both and only one of them is the pool's doing. And the rung
 * the trade ends in is named, because a quote that looks fine only until
 * the inner rung runs out is not a quote, it is an advertisement.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, Interface, keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const coder = AbiCoder.defaultAbiCoder();
const KOK = path.join(__dirname, "..");
const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-depth.json"), "utf8"));
const H = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-havuz.json"), "utf8"));
const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestMerdiven.json"), "utf8"));

const val = (a, d) => { const i = process.argv.indexOf(a); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const T_IC = Number(val("--ic", "300"));        // million tokens, inner rung
const T_ORTA = Number(val("--orta", "100"));
const T_DIS = Number(val("--dis", "100"));
const UST_IC = Number(val("--bant-ic", "20"));    // % above opening
const UST_ORTA = Number(val("--bant-orta", "100"));

const KOSUM = "0x00000000000000000000000000000000000d3b7a";
const SPACING = 60;
const EN_ALT = -887220;                            // MIN_TICK on the 60 grid
const Q96 = 2 ** 96;
const HOOK_PPM = 5000;                             // 0.50%, as deployed
const sel = (s) => id(s).slice(0, 10);
const TUTARLAR = [20, 100, 500, 1000, 5000, 20000, 100000];

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(e); }
      });
    });
    r.on("error", rej);
    r.setTimeout(120000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 600)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 30000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const usd = (x) => x >= 1000 ? "$" + nf(x / 1000, x % 1000 ? 1 : 0) + "k" : "$" + nf(x);
const cuzdan = (ort, spot) => (1 - spot / ort) * 100;

const iface = new Interface([
  "function run(address pm,int24 acilisTick,int24 ic,int24 orta,int24 dis," +
  "uint256 tIc,uint256 tOrta,uint256 tDis,uint256 swapTutari) returns (" +
  "(uint160 acilisSqrt,uint128 likiditeIc,uint128 likiditeOrta,uint128 likiditeDis," +
  "uint256 quoteTalep,uint256 odenen,uint256 alinan,uint160 sqrtSonra,uint256 aciciArtan))"
]);

(async function main() {
  /* Open where the live token sits, snapped onto the tick grid. */
  const slot = keccak256(coder.encode(["bytes32", "uint256"], [H.havuzId, 6]));
  const raw = BigInt(await rpc("eth_call", [
    { to: D.poolManager, data: sel("extsload(bytes32)") + slot.slice(2) }, "latest"]));
  const sqrtCanli = Number(raw & ((1n << 160n) - 1n));
  const tickCanli = Math.floor(Math.log((sqrtCanli / Q96) ** 2) / Math.log(1.0001));
  /* --fdv names a different opening valuation. It is the only lever
     that moves the big-trade end of the table: a buyer handing over
     $20.000 receives $20.000 of tokens, and that much token value has to
     be standing at the price. No arrangement of rungs invents it. */
  const FDV = Number(val("--fdv", "0"));
  const T = FDV > 0
    ? Math.round(Math.log(1e12 / (FDV / 1e9)) / Math.log(1.0001) / SPACING) * SPACING
    : Math.round(tickCanli / SPACING) * SPACING;

  const tikAdet = (yuzde) => Math.round(Math.log(1 + yuzde / 100) / Math.log(1.0001) / SPACING) * SPACING;
  const ic = T - tikAdet(UST_IC);
  const orta = T - tikAdet(UST_ORTA);
  const dis = EN_ALT;
  const fiyatOrani = (tik) => 1.0001 ** (T - tik);

  console.log("MERDIVEN — alicinin cuzdaninda cikacak rakam");
  console.log("  GERCEK Arc PoolManager, eth_call, zincire hicbir sey gitmiyor");
  console.log("");
  console.log("  kademe   token        aralik                     ticks");
  console.log("    ic     " + (nf(T_IC) + "M").padEnd(8) + ("acilis -> +%" + nf((fiyatOrani(ic) - 1) * 100, 0)).padEnd(26) + "[" + ic + ", " + T + "]");
  console.log("    orta   " + (nf(T_ORTA) + "M").padEnd(8) + ("+%" + nf((fiyatOrani(ic) - 1) * 100, 0) + " -> +%" + nf((fiyatOrani(orta) - 1) * 100, 0)).padEnd(26) + "[" + orta + ", " + ic + "]");
  console.log("    dis    " + (nf(T_DIS) + "M").padEnd(8) + ("+%" + nf((fiyatOrani(orta) - 1) * 100, 0) + " -> sonsuz").padEnd(26) + "[" + dis + ", " + orta + "]");
  console.log("");

  const milyon = (m) => BigInt(m) * 10n ** 24n;
  let acilisFiyat = 0;
  const satirlar = [];

  for (const d of TUTARLAR) {
    let r;
    try {
      r = await rpc("eth_call", [
        { from: KOSUM, to: KOSUM, gas: "0x8000000",
          data: iface.encodeFunctionData("run", [D.poolManager, T, ic, orta, dis,
            milyon(T_IC), milyon(T_ORTA), milyon(T_DIS), BigInt(Math.round(d * 1e6))]) },
        "latest", { [KOSUM]: { code: B.deployedBytecode, nonce: "0x0" } }
      ]);
    } catch (e) { satirlar.push({ d, hata: true }); continue; }

    const s = iface.decodeFunctionResult("run", r)[0];
    const quoteTalep = BigInt(s[4]);
    const odenen = Number(BigInt(s[5])) / 1e6;
    const alinan = Number(BigInt(s[6])) / 1e18;
    const sqrtSonra = Number(BigInt(s[7]));
    if (!acilisFiyat) acilisFiyat = (1 / ((Number(BigInt(s[0])) / Q96) ** 2)) * 1e12;
    const tikSonra = Math.floor(Math.log((sqrtSonra / Q96) ** 2) / Math.log(1.0001));
    satirlar.push({
      d, quoteTalep, odenen, alinan, tikSonra,
      eksik: odenen < d * 0.999,
      etki: cuzdan(odenen / alinan, acilisFiyat)
    });
  }

  console.log("  acilis fiyati  $" + acilisFiyat.toExponential(4) + " / token    (FDV " +
    usd(acilisFiyat * 1e9) + ")");
  console.log("");
  console.log("    alim        havuzun kaymasi   +%0,50 hook   ALICININ GORDUGU   biter kademe   fiyat");
  console.log("    " + "-".repeat(94));
  for (const x of satirlar) {
    if (x.hata) { console.log("    " + usd(x.d).padStart(8) + "   CAGRI REVERT ETTI"); continue; }
    const toplam = x.etki + HOOK_PPM / 10000;
    const kademe = x.tikSonra > ic ? "ic" : x.tikSonra > orta ? "orta" : "dis";
    const yukselis = (1.0001 ** (T - x.tikSonra) - 1) * 100;
    console.log("    " + usd(x.d).padStart(8) + "   " +
      ("-%" + nf(x.etki, 2)).padStart(15) + "   " +
      ("-%" + nf(toplam, 2)).padStart(11) + "   " +
      ("-%" + nf(toplam, 2)).padStart(16) + "   " +
      kademe.padStart(12) + "   +%" + nf(yukselis, 1) +
      (x.eksik ? "   KISMEN DOLDU" : ""));
  }

  const kirli = satirlar.find((x) => !x.hata && x.quoteTalep !== 0n);
  console.log("");
  console.log("  " + (kirli
    ? "UYARI: havuz USDC istedi — merdiven tek yonlu degil, onerme gecersiz."
    : "Havuz hicbir satirda USDC istemedi: merdivenin tamami sadece tokenle kuruldu, sifir dolar."));

  console.log("");
  console.log("  KIYAS — ayni alim, bugunku gercek havuzlarda");
  const kiyas = [["bizim simdiki DEPTH havuzu", 6.03], ["Arc launchpad ortancasi", 5500],
                 ["Arc'in en iyi launchpad tokeni (SAFEMOON)", 17900], ["ARGUS ($12,7M token)", 1250000]];
  const basit = (R, d) => (1 - R / (R + d)) * 100;
  console.log("    " + "havuz".padEnd(42) + "$20".padStart(9) + "$1k".padStart(9) + "$100k".padStart(9));
  for (const [ad, R] of kiyas)
    console.log("    " + ad.padEnd(42) + ("-%" + nf(basit(R, 20), 2)).padStart(9) +
      ("-%" + nf(basit(R, 1000), 1)).padStart(9) + ("-%" + nf(basit(R, 100000), 1)).padStart(9));
  const b20 = satirlar.find((x) => x.d === 20), b1k = satirlar.find((x) => x.d === 1000),
        b100k = satirlar.find((x) => x.d === 100000);
  if (b20 && b1k && b100k && !b20.hata)
    console.log("    " + "BIZ (merdiven, hook dahil)".padEnd(42) +
      ("-%" + nf(b20.etki + 0.5, 2)).padStart(9) +
      ("-%" + nf(b1k.etki + 0.5, 1)).padStart(9) +
      ("-%" + nf(b100k.hata ? 100 : b100k.etki + 0.5, 1)).padStart(9));
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
