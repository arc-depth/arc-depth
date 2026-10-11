"use strict";
/* ===========================================================================
 * dene-fathom-alim.js — buy Fathom from the pool, for real, with the
 *                       smallest amount that proves it.
 *
 *   node scripts/dene-fathom-alim.js --tutar 1
 *   node scripts/dene-fathom-alim.js --tutar 1 --uygula
 *
 * WHY A REAL BUY AND NOT ONE MORE SIMULATION
 *   Three things can only be settled by paying:
 *
 *   1. That a wallet can fill against a pool whose active liquidity reads
 *      zero. A token-only rung sits at its own opening tick and v4 counts a
 *      position live over [lower, upper), so slot0 shows no liquidity until
 *      the first swap crosses into the range. Simulation says it crosses.
 *      A receipt says it crossed.
 *
 *   2. That the hook's split actually pays. 0.50% leaves the trade: 0.15%
 *      to the founder wallet, 0.15% to the staking vault, 0.20% back into
 *      depth. Those are three real USDC transfers and they either appear
 *      in the logs or they do not.
 *
 *   3. That the pool now holds money. Before this, exit liquidity is zero
 *      by construction — the first dollar a seller could ever receive is
 *      the first dollar a buyer puts in. This is that dollar.
 *
 *   And a pool with no trades is a pool the price sites have no reason to
 *   index. This is the volume.
 *
 * The buy goes through the SwapRouter already deployed for this chain,
 * because a v4 swap happens inside an unlock callback and a wallet cannot
 * provide one. Slippage is bounded by minOut, computed from the simulation
 * and printed before anything is signed.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, Interface, keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const ROUTER = "0x7550058C3F4D8839eBc8AcCB96959Fe69C109581";
const UYGULA = process.argv.includes("--uygula");
const val = (a, d) => { const i = process.argv.indexOf(a); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TUTAR = Number(val("--tutar", "1"));
const TOLERANS = Number(val("--tolerans", "3"));     // % below the quote we accept

const coder = AbiCoder.defaultAbiCoder();
const KOK = path.join(__dirname, "..");
const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const sel = (s) => id(s).slice(0, 10);

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
    r.setTimeout(90000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 3000;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 900)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 30000);
    }
  }
}
function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const p of [path.join("C:", "bot", ".env"), path.join(KOK, ".env")]) {
    try {
      const m = fs.readFileSync(p, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const usd = (x, d = 6) => "$" + nf(x, d);

/* The key, in the order v4 sorts it. FTHM is currency1 against USDC. */
const tokenSifirinci = A.token.toLowerCase() < A.usdc.toLowerCase();
const KEY = [
  tokenSifirinci ? A.token : A.usdc,
  tokenSifirinci ? A.usdc : A.token,
  A.fee, A.spacing, A.hook
];
const ZERO_FOR_ONE = !tokenSifirinci;      // paying the quote in

const routerIface = new Interface([
  "function swap((address,address,uint24,int24,address) key,bool zeroForOne,uint256 amountIn,uint256 minOut) payable returns (uint256)"
]);

(async function main() {
  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);
  const BEN = cuzdan.address;
  const oku = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
  const bal = async (t, w) => BigInt(await oku(t,
    sel("balanceOf(address)") + coder.encode(["address"], [w]).slice(2)));

  const giris = BigInt(Math.round(TUTAR * 1e6));
  const usdc0 = await bal(A.usdc, BEN);
  const tok0 = await bal(A.token, BEN);
  const stake0 = await bal(A.usdc, A.stake);
  const acici0 = await bal(A.usdc, A.acici);
  const aciciTok0 = await bal(A.token, A.acici);

  console.log("FATHOM — GERCEK ALIM");
  console.log("");
  console.log("  alici      " + BEN);
  console.log("  tutar      " + usd(TUTAR, 2));
  console.log("  havuz      " + A.havuzId);
  console.log("  yonlendirici " + ROUTER);
  console.log("");
  console.log("  ONCE");
  console.log("    USDC          " + usd(Number(usdc0) / 1e6));
  console.log("    FTHM          " + nf(Number(tok0) / 1e18));
  console.log("    stake kasasi  " + usd(Number(stake0) / 1e6) + " USDC");
  console.log("    acici         " + usd(Number(acici0) / 1e6) + " USDC");
  if (usdc0 < giris) { console.log("\n  USDC yetmiyor."); process.exit(1); }

  /* ---- quote it first ---------------------------------------------- */
  const kuruData = routerIface.encodeFunctionData("swap", [KEY, ZERO_FOR_ONE, giris, 0]);
  let kota;
  try {
    const r = await rpc("eth_call", [{ from: BEN, to: ROUTER, data: kuruData, gas: "0x2000000" }, "latest"]);
    kota = BigInt(routerIface.decodeFunctionResult("swap", r)[0]);
  } catch (e) {
    console.log("");
    console.log("  KOTA ALINAMADI: " + e.message);
    console.log("  Zincire hicbir sey gitmedi. Once bu cozulmeli.");
    process.exit(1);
  }

  const minOut = (kota * BigInt(Math.round((100 - TOLERANS) * 100))) / 10000n;
  const spotSlot = keccak256(coder.encode(["bytes32", "uint256"], [A.havuzId, 6]));
  const spotRaw = BigInt(await oku(A.poolManager, sel("extsload(bytes32)") + spotSlot.slice(2)));
  const sqrtP = Number(spotRaw & ((1n << 160n) - 1n)) / 2 ** 96;
  const spot = (1 / (sqrtP * sqrtP)) * 1e12;
  const ortalama = TUTAR / (Number(kota) / 1e18);

  console.log("");
  console.log("  KOTA");
  console.log("    gelecek FTHM  " + nf(Number(kota) / 1e18));
  console.log("    ortalama      $" + ortalama.toExponential(4) + "   spot $" + spot.toExponential(4));
  console.log("    kayma         -%" + nf((1 - spot / ortalama) * 100, 2) + "   (hook ucreti dahil)");
  console.log("    minOut        " + nf(Number(minOut) / 1e18) + "   (%" + TOLERANS + " tolerans)");

  if (!UYGULA) {
    console.log("");
    console.log("  kuru calisma. Gondermek icin --uygula ekle.");
    return;
  }

  /* ---- send -------------------------------------------------------- */
  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  let nonce = Number(await rpc("eth_getTransactionCount", [BEN, "latest"]));

  const izin = BigInt(await oku(A.usdc, sel("allowance(address,address)") +
    coder.encode(["address", "address"], [BEN, ROUTER]).slice(2)));
  console.log("");
  console.log("  GONDERILIYOR");
  if (izin < giris) {
    const d = sel("approve(address,uint256)") +
      coder.encode(["address", "uint256"], [ROUTER, giris * 100n]).slice(2);
    const g = BigInt(await rpc("eth_estimateGas", [{ from: BEN, to: A.usdc, data: d }]));
    const raw = await cuzdan.signTransaction({ chainId: CHAIN_ID, nonce: nonce++, to: A.usdc,
      data: d, gasLimit: (g * 13n) / 10n, gasPrice, value: 0n });
    const h = await rpc("eth_sendRawTransaction", [raw]);
    console.log("    approve        " + h);
    for (let i = 0; i < 60; i++) {
      const rc = await rpc("eth_getTransactionReceipt", [h]).catch(() => null);
      if (rc) { if (rc.status !== "0x1") throw new Error("approve basarisiz"); break; }
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  const swapData = routerIface.encodeFunctionData("swap", [KEY, ZERO_FOR_ONE, giris, minOut]);
  const g2 = BigInt(await rpc("eth_estimateGas", [{ from: BEN, to: ROUTER, data: swapData }]));
  const raw2 = await cuzdan.signTransaction({ chainId: CHAIN_ID, nonce: nonce++, to: ROUTER,
    data: swapData, gasLimit: (g2 * 13n) / 10n, gasPrice, value: 0n });
  const hash = await rpc("eth_sendRawTransaction", [raw2]);
  console.log("    alim           " + hash);
  let makbuz = null;
  for (let i = 0; i < 90; i++) {
    makbuz = await rpc("eth_getTransactionReceipt", [hash]).catch(() => null);
    if (makbuz) break;
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!makbuz) throw new Error("makbuz gelmedi: " + hash);
  if (makbuz.status !== "0x1") throw new Error("zincirde basarisiz: " + hash);
  console.log("    blok " + parseInt(makbuz.blockNumber, 16) + ", gaz " + nf(parseInt(makbuz.gasUsed, 16)));

  /* ---- what actually moved ----------------------------------------- */
  const usdc1 = await bal(A.usdc, BEN);
  const tok1 = await bal(A.token, BEN);
  const stake1 = await bal(A.usdc, A.stake);
  const acici1 = await bal(A.usdc, A.acici);
  const alinan = Number(tok1 - tok0) / 1e18;
  const odenen = Number(usdc0 - usdc1) / 1e6;

  console.log("");
  console.log("  SONRA — zincirden");
  console.log("    GELEN FTHM     " + nf(alinan) +
    (Math.abs(alinan - Number(kota) / 1e18) < 1 ? "   kota TUTTU" : "   kotadan sapti"));
  console.log("    odenen USDC    " + usd(odenen) + "   (gaz dahil)");
  console.log("    odenen ortalama $" + (TUTAR / alinan).toExponential(4));
  /* On a BUY the output is the token, so the hook takes its 0.50% in
     tokens and sends the whole of it to the opener. Reading USDC balances
     here reports "no fee" on a fee that was paid — which is what the first
     version of this did. The split into three happens on a SELL, where the
     output is money. */
  const aciciTok1 = await bal(A.token, A.acici);
  console.log("");
  console.log("  HOOK UCRETI — %0,50");
  console.log("    aciciya FTHM   " + nf(Number(aciciTok1 - aciciTok0) / 1e18, 4) +
    ((aciciTok1 - aciciTok0) > 0n ? "   GELDI" : "   GELMEDI"));
  console.log("    beklenen       " + nf((alinan / (1 - 0.005)) * 0.005, 4) + "   (brutun %0,50'si)");
  console.log("    Alista cikti TOKEN oldugu icin ucret de token olarak aliniyor ve");
  console.log("    tamami aciciya gidiyor; biriktir() onu kalici derinlige cevirir.");
  console.log("    Ucun bolunmesi SATIS yonunde olur (cikti para oldugunda):");
  console.log("    %0,15 kurucu cuzdani, %0,15 stake, %0,20 derinlik. Satis testi ayri.");
  console.log("    stake USDC degisimi " + usd(Number(stake1 - stake0) / 1e6) +
    "   (alista beklenmez)");

  const likSlot = "0x" + (BigInt(spotSlot) + 3n).toString(16).padStart(64, "0");
  const lik = BigInt(await oku(A.poolManager, sel("extsload(bytes32)") + likSlot.slice(2)));
  console.log("");
  console.log("  HAVUZ SIMDI");
  console.log("    aktif likidite " + lik + (lik > 0n ? "   ARTIK SIFIR DEGIL" : ""));
  const yeniRaw = BigInt(await oku(A.poolManager, sel("extsload(bytes32)") + spotSlot.slice(2)));
  const yeniSqrt = Number(yeniRaw & ((1n << 160n) - 1n)) / 2 ** 96;
  const yeniFiyat = (1 / (yeniSqrt * yeniSqrt)) * 1e12;
  console.log("    fiyat          $" + yeniFiyat.toExponential(4) + "   FDV " + usd(yeniFiyat * 1e9, 0));
  console.log("");
  console.log("  Bu havuzdaki ilk gercek para artik duruyor; satis karsiligi o kadar.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
