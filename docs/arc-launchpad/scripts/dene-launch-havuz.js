"use strict";
/* ===========================================================================
 * dene-launch-havuz.js — if somebody launches today, can people buy it with
 *                        USDC on Uniswap?
 *
 *   node scripts/dene-launch-havuz.js
 *
 * The source opens the pool against USDC and says so in its comments. But
 * the last token this project launched has no pool at any fee or spacing,
 * because it came out of an older launchpad with a different hook. "The
 * code says so" and "the last one worked" are two different claims and
 * neither answers the question.
 *
 * So the real deployed launchpad is run inside one eth_call with the
 * collateral the founder wallet actually holds, and then the pool it opened is
 * read and a USDC buy pushed through it. The harness is placed at the founder
 * wallet's own address by state override, so the collateral and the USDC
 * are real balances and nothing is invented. Nothing is sent, no gas.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, Interface, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const KOK = path.join(__dirname, "..");
const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim.json"), "utf8"));
const S = JSON.parse(fs.readFileSync(path.join(KOK, "son-launch.json"), "utf8"));
const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestLaunchHavuz.json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const sel = (s) => id(s).slice(0, 10);
const val = (a, d) => { const i = process.argv.indexOf(a); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const POOL_BPS = Number(val("--pay", "3000"));
const ALIM = Number(val("--alim", "1"));

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({ hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(120000, () => r.destroy(new Error("timeout")));
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
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);

const iface = new Interface([
  "function run(address launchpad,address teminat,uint256 yatirim,uint256 quoteValue," +
  "uint256 poolBps,address pm,uint256 alimTutari) returns (" +
  "(address token,address vault,bytes32 havuzId,bool havuzAcildi,uint160 sqrtAcilis," +
  "uint128 likidite,uint256 kurucuTokeni,uint256 kasadakiTeminat," +
  "uint256 alimOdenen,uint256 alimAlinan,bool alimOldu,uint256 pmTokeni,int24 tickOnce,int24 tickSonra))"
]);

(async function main() {
  const KURUCU = D.operator;
  const TEMINAT = S.teminat;

  const bal = async (t, w) => BigInt(await rpc("eth_call", [{ to: t,
    data: sel("balanceOf(address)") + coder.encode(["address"], [w]).slice(2) }, "latest"]));
  const teminatBakiye = await bal(TEMINAT, KURUCU);
  const usdcBakiye = await bal(D.usdc, KURUCU);

  console.log("LAUNCH -> USDC HAVUZU — gercek launchpad, eth_call, hicbir sey gonderilmiyor");
  console.log("");
  console.log("  launchpad   " + D.launchpad);
  console.log("  teminat     " + TEMINAT + "   (wNVDA)");
  console.log("  kurucu bakiye  " + nf(Number(teminatBakiye) / 1e18, 9) + " wNVDA, " +
    usd(Number(usdcBakiye) / 1e6, 4) + " USDC");
  if (teminatBakiye === 0n) { console.log("\n  Teminat yok, deneme yapilamaz."); process.exit(1); }

  /* Spend a fraction, so the simulation looks like a small real launch
     rather than everything the wallet has. */
  const yatirim = teminatBakiye / 2n;
  /* What the queue would pass: what the customer paid for this collateral.
     Not measured here — priced at the last launch's own ratio so the
     opening is in a realistic place. */
  /* What the customer paid for this collateral. The wallet only holds
     dust, so --deger lets the run model a realistic launch size: the
     collateral amount is whatever is there, and the opening price is set
     by the payment, which is exactly how the real path works. */
  const DEGER = Number(val("--deger", "0"));
  const quoteValue = DEGER > 0
    ? BigInt(Math.round(DEGER * 1e6))
    : BigInt(Math.round(Number(yatirim) / 1e18 * 1000 * 1e6));

  console.log("  yatirim     " + nf(Number(yatirim) / 1e18, 9) + " wNVDA" +
    "   (~" + usd(Number(quoteValue) / 1e6) + " degerinde varsayildi)");
  console.log("  havuz payi  %" + (POOL_BPS / 100));
  console.log("");

  let r;
  try {
    r = await rpc("eth_call", [
      { from: KURUCU, to: KURUCU, gas: "0x8000000",
        data: iface.encodeFunctionData("run", [D.launchpad, TEMINAT, yatirim, quoteValue,
          POOL_BPS, D.poolManager, BigInt(Math.round(ALIM * 1e6))]) },
      "latest", { [KURUCU]: { code: B.deployedBytecode } }
    ]);
  } catch (e) {
    console.log("  LAUNCH REVERT ETTI: " + e.message);
    console.log("");
    console.log("  Yani bugun biri launch etmeye kalksa bu hatayi alir.");
    process.exit(1);
  }

  const s = iface.decodeFunctionResult("run", r)[0];
  const tokenAdr = s[0], kasa = s[1], havuzId = s[2], acildi = s[3];
  const sqrt = Number(BigInt(s[4])), lik = BigInt(s[5]);
  const kurucuTok = Number(BigInt(s[6])) / 1e18;
  const kasaTeminat = Number(BigInt(s[7])) / 1e18;
  const odenen = Number(BigInt(s[8])) / 1e6, alinan = Number(BigInt(s[9])) / 1e18;
  const alimOldu = s[10];

  console.log("  LAUNCH GECTI");
  console.log("    token            " + tokenAdr);
  console.log("    kasa             " + kasa);
  console.log("    kurucuda kalan   " + nf(kurucuTok) + " token");
  console.log("    kasadaki teminat " + nf(kasaTeminat, 9) + " wNVDA");
  console.log("");
  console.log("  USDC HAVUZU");
  console.log("    havuzId          " + havuzId);
  console.log("    acildi mi        " + (acildi ? "EVET" : "HAYIR"));
  if (!acildi) { console.log("\n  Havuz acilmadi — insanlar Uniswap'tan alamaz."); process.exit(1); }

  const tokenIsZero = tokenAdr.toLowerCase() < D.usdc.toLowerCase();
  const sp = sqrt / 2 ** 96;
  const fiyat = tokenIsZero ? (sp * sp) * 1e12 : (1 / (sp * sp)) * 1e12;
  const derinlik = tokenIsZero ? (Number(lik) * sp) / 1e6 : (Number(lik) / sp) / 1e6;
  console.log("    esi              USDC   (token currency" + (tokenIsZero ? "0" : "1") + ")");
  console.log("    acilis fiyati    $" + fiyat.toExponential(4) + "   FDV " + usd(fiyat * 1e9));
  console.log("    likidite         " + lik + (lik === 0n
    ? "   (bant acilis tickinin otesinde — ilk alim icine girer)" : ""));
  if (derinlik > 0) console.log("    derinlik         " + usd(derinlik));

  console.log("");
  console.log("  GERCEK USDC ALIMI — " + usd(ALIM));
  if (!alimOldu) {
    console.log("    OLMADI. Havuz acik ama alim gecmedi; sebebi arastirilmali.");
    process.exit(1);
  }
  console.log("    odenen           " + usd(odenen, 6));
  console.log("    gelen token      " + nf(alinan));
  console.log("    ortalama fiyat   $" + (odenen / alinan).toExponential(4));
  console.log("    CUZDANIN GORECEGI  -%" + nf((1 - fiyat / (odenen / alinan)) * 100, 2));
  console.log("");
  console.log("");
  console.log("  TANI");
  console.log("    PoolManager'daki token  " + nf(Number(BigInt(s[11])) / 1e18) +
    "   (havuza giden " + nf(1e9 - kurucuTok) + " olmali)");
  console.log("    tick once / sonra       " + s[12] + " -> " + s[13] +
    "   fark " + (Number(s[13]) - Number(s[12])));
  console.log("");
  console.log("  Yani evet: launch'tan sonra token USDC karsiligi Uniswap v4'te");
  console.log("  alinip satilabiliyor, ve alim gercek havuzda kosuldu.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
