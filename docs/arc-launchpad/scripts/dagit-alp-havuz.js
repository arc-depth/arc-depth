"use strict";
/* ===========================================================================
 * dagit-alp-havuz.js — lock ALP's liquidity share into a pool nobody can
 * withdraw from.
 *
 *   node scripts/dagit-alp-havuz.js            # prices it, sends nothing
 *   node scripts/dagit-alp-havuz.js --uygula
 *
 * WHAT THIS IS FOR NOW
 *   The 30% set aside for liquidity is gone: 300,000,000 ALP sits in a pool
 *   this script opened at a million and a half dollars a token, because it
 *   computed the price as though USDC counted in eighteen decimals. Nobody
 *   will ever trade there, which is why ALP appears nowhere — DexScreener
 *   indexes a pair when it sees a swap, and that pair cannot have one.
 *
 *   So this opens a second pool, correctly priced, out of the free share,
 *   with a different tick spacing so it is a different PoolKey and the
 *   stranded position is left undisturbed. The amount is an argument,
 *   because it comes out of a share that was promised to stay sellable.
 *
 * WHAT GETS DEPLOYED
 *   AlpLocker, and nothing else. It opens the pool, places the ALP, and has
 *   no way to take it back.
 *
 * THE POSITION COSTS NO USDC
 *   It is one-sided — all ALP, in a band wholly on the ALP side of the
 *   opening price — which v4 accepts without asking for the other currency.
 *   Measured against the real Arc PoolManager in both address orderings
 *   before any of this was sent (test/calistir.js, section 15).
 *
 *   So the pool opens with nothing in it but ALP, and every purchase leaves
 *   USDC behind that is as locked as the ALP — it becomes the bid for
 *   whoever sells next. The liquidity accumulates by being used, and nobody
 *   has to fund it.
 *
 * WHY THERE IS NO HOOK
 *   The launch hook would have been the obvious thing to reuse: it takes
 *   0.50% and reverts every liquidity removal. It cannot serve ALP.
 *
 *   ALP is already deployed and immutable, and it has neither of the two
 *   functions that hook requires. There is no `burn`, so the hook's floor
 *   slice arriving in ALP would revert on every sweep and sit in the hook
 *   forever. And there is no `lastBalanceChange`, so a HolderRewards built
 *   over ALP would accept the holder slice and then revert on every
 *   eligibility check — a contract that takes money and can never pay it
 *   out. Deploying that would have been worse than deploying nothing.
 *
 *   The lock does not depend on the hook anyway. It is in the locker: no
 *   withdraw, no sweep, no owner, no upgrade, and `kilitle` runs once.
 *   Uniswap only lets a position's owner remove it, and this owner has no
 *   code that can. The hook was the second lock on a launch, never the
 *   first one.
 *
 *   The consequence is that ALP trades with no protocol fee. That fee was
 *   specified for the coins customers launch, not for the governance token,
 *   and a zero-fee pool is the one people will actually use.
 *
 * WHICH SIDE THE BAND GOES ON
 *   USDC's address sorts below ALP's, so USDC is currency0 and ALP is
 *   currency1, and the pool's price is ALP per USDC. A higher ALP price
 *   means FEWER ALP per USDC, so the band runs DOWNWARD from the opening
 *   tick. Getting this backwards does not fail loudly — it asks for USDC.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, getCreateAddress, keccak256, Interface } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDC = "0x3600000000000000000000000000000000000000";
const SIFIR = "0x0000000000000000000000000000000000000000";
const UYGULA = process.argv.includes("--uygula");

/* Opening market cap, in USDC, for the whole 1,000,000,000 supply. */
const ACILIS_MCAP = Number(process.env.ACILIS_MCAP || 1500);
/* How far above the opening price the band reaches. */
const TAVAN_KAT = Number(process.env.TAVAN_KAT || 60);
const TUTAR = process.env.TUTAR || "10000000";
/* A different PoolKey from the stranded one, which used spacing 60. Same
   pair, same fee and same hook would be the same pool, and initialize would
   revert against a pool that already exists. */
const FEE = 0;
const SPACING = Number(process.env.SPACING || 10);
const ARZ_HAM = 10n ** 9n * 10n ** 18n;   // ALP's whole supply, 18 decimals

const Q96 = 2n ** 96n;
const coder = AbiCoder.defaultAbiCoder();
const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));

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
    r.setTimeout(40000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(method, params) {
  let bekle = 1500;
  for (let i = 0; ; i++) {
    try { return await ham(method, params); }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 25000);
    }
  }
}
async function gonder(cuzdan, tx, ad) {
  const imzali = await cuzdan.signTransaction(tx);
  let hash;
  try { hash = await rpc("eth_sendRawTransaction", [imzali]); }
  catch (e) {
    if (!/already known|nonce too low/i.test(String(e.message))) throw e;
    hash = keccak256(imzali);
    console.log("    (zaten dugumde)");
  }
  console.log("    " + ad + " -> " + hash);
  for (let i = 0; i < 80; i++) {
    let rc = null;
    try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
    if (rc) {
      if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz: " + hash);
      console.log("    blok " + parseInt(rc.blockNumber, 16));
      return hash;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("makbuz gelmedi: " + hash);
}
function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const p of [path.join("C:", "bot", ".env"), path.join(__dirname, "..", ".env")]) {
    try {
      const m = fs.readFileSync(p, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}

/* Integer square root, and sqrt(num/den) in Q64.96 from RAW amounts.
 *
 * The version this replaces took a float price and scaled it by 1e12, which
 * silently assumed both sides of the pair counted in the same decimals. It
 * is the reason 300,000,000 ALP is locked in a pool quoting $1,500,000 a
 * token. A ratio has no scale to be wrong about.
 *
 * The shift is split across the root so no intermediate approaches the
 * uint256 ceiling, matching Launchpad._sqrtRatioX96 exactly. */
function bsqrt(x) {
  if (x === 0n) return 0n;
  let z = (x + 1n) / 2n, y = x;
  while (z < y) { y = z; z = (x / z + z) / 2n; }
  return y;
}
function sqrtOran(num, den) {
  return (bsqrt(num << 96n) << 96n) / bsqrt(den << 96n);
}
const tickAt = (f) => Math.floor(Math.log(f) / Math.log(1.0001));
const snapDown = (t, s) => Math.floor(t / s) * s;

(async function main() {
  const YOL = path.join(__dirname, "..", "dagitim-yonetisim.json");
  const G = JSON.parse(fs.readFileSync(YOL, "utf8"));
  const ALP = G.govToken;

  console.log("ALP LIKIDITE KILIDI");
  console.log("  ALP        " + ALP);
  console.log("  USDC       " + USDC);
  console.log("  hook       yok (adres sifir) — kilit kilitleyicide, hook'ta degil");
  console.log("  kip        " + (UYGULA ? "UYGULA (gercek islem)" : "KURU CALISMA"));
  console.log("");

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);
  const nonce = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
  const bakiye = BigInt(await rpc("eth_getBalance", [cuzdan.address, "latest"]));

  const erc = new Interface([
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)"
  ]);
  const alpBak = BigInt(await rpc("eth_call", [
    { to: ALP, data: erc.encodeFunctionData("balanceOf", [cuzdan.address]) }, "latest"]));

  console.log("  cuzdan  " + cuzdan.address);
  console.log("  gaz     " + (Number(bakiye) / 1e18).toFixed(6) + " USDC");
  console.log("  ALP     " + (Number(alpBak) / 1e18).toLocaleString("en-US"));
  console.log("  nonce   " + nonce);
  console.log("");

  const miktar = BigInt(TUTAR) * 10n ** 18n;
  if (alpBak < miktar) { console.log("  cuzdanda yeterli ALP yok."); process.exit(1); }
  const serbest = alpBak - miktar;
  console.log("  kilitlenecek   " + Number(TUTAR).toLocaleString("en-US") + " ALP   (arzin %" +
    (100 * Number(TUTAR) / 1e9).toFixed(2) + "'i, serbest paydan)");
  console.log("  cuzdanda kalan " + (Number(serbest) / 1e18).toLocaleString("en-US") +
    " ALP   (arzin %" + (100 * Number(serbest) / 1e18 / 1e9).toFixed(2) +
    "'i — her zaman satilabilir)");
  console.log("");

  /* ---- the band ------------------------------------------------------ */
  const alpSifirinci = ALP.toLowerCase() < USDC.toLowerCase();

  /* Raw units on both sides: the market cap in six-decimal USDC over the
     supply in eighteen-decimal ALP. */
  const mcapHam = BigInt(Math.round(ACILIS_MCAP * 1e6));
  const hamFiyat = Number(mcapHam) / Number(ARZ_HAM);     // quote raw per token raw
  const havuzFiyat = alpSifirinci ? hamFiyat : 1 / hamFiyat;
  const sqrtP = alpSifirinci ? sqrtOran(mcapHam, ARZ_HAM) : sqrtOran(ARZ_HAM, mcapHam);
  const simdiki = tickAt(havuzFiyat);

  let altTick, ustTick;
  if (alpSifirinci) {
    altTick = snapDown(simdiki, SPACING) + SPACING;
    ustTick = snapDown(tickAt(hamFiyat * TAVAN_KAT), SPACING);
  } else {
    /* ALP is currency1: its band is below the opening tick, and the ceiling
       in USDC terms is the LOWEST pool price. */
    ustTick = snapDown(simdiki, SPACING);
    if (ustTick >= simdiki) ustTick -= SPACING;
    altTick = snapDown(tickAt(1 / (hamFiyat * TAVAN_KAT)), SPACING);
  }

  /* What a dollar buys, which is the only form of this number a person can
     check. The deployment that went wrong printed sqrtPriceX96 and a market
     cap derived from the same bad assumption, so both agreed and both were
     wrong. */
  const alpBasinaUsd = ACILIS_MCAP / 1e9;
  console.log("  acilis piyasa degeri   $" + ACILIS_MCAP.toLocaleString("en-US"));
  console.log("  acilis ALP fiyati      $" + alpBasinaUsd.toExponential(3));
  console.log("  >> 1 DOLAR ILE          " +
    Math.round(1 / alpBasinaUsd).toLocaleString("en-US") + " ALP alinir");
  console.log("  >> " + Number(TUTAR).toLocaleString("en-US") + " ALP'nin degeri  $" +
    (Number(TUTAR) * alpBasinaUsd).toFixed(2) + "   (DexScreener\'da gorunecek likidite)");
  console.log("  bant tavani            $" + (alpBasinaUsd * TAVAN_KAT).toExponential(3) +
    "   (piyasa degeri $" + (ACILIS_MCAP * TAVAN_KAT).toLocaleString("en-US") + ")");
  console.log("  ALP currency" + (alpSifirinci ? "0" : "1") + "   acilis tick " + simdiki +
    "   bant [" + altTick + ", " + ustTick + "]");
  console.log("  ucret " + FEE + "   tick araligi " + SPACING);
  console.log("");

  if (ustTick <= altTick) { console.log("  BANT GECERSIZ"); process.exit(1); }
  if (alpSifirinci ? altTick <= simdiki : ustTick >= simdiki) {
    console.log("  BANT YANLIS TARAFTA — boyle gonderilse USDC isterdi");
    process.exit(1);
  }

  /* ---- what it costs ------------------------------------------------- */
  const LOCK = B("AlpLocker");
  const kilitAdres = getCreateAddress({ from: cuzdan.address, nonce });
  const kilitInit = LOCK.bytecode + coder.encode(
    ["address", "address", "address", "address", "address"],
    [POOL_MANAGER, SIFIR, ALP, USDC, SIFIR]).slice(2);

  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const usd = (g) => (Number(g * gasPrice) / 1e18).toFixed(5);
  const tahmin = async (data, to) => {
    try {
      return BigInt(await rpc("eth_estimateGas",
        [to ? { from: cuzdan.address, to, data } : { from: cuzdan.address, data }]));
    } catch (e) { return { hata: String(e.message) }; }
  };

  const g1 = await tahmin(kilitInit);
  if (typeof g1 !== "bigint") { console.log("  AlpLocker gaz tahmini: " + g1.hata); process.exit(1); }
  console.log("  kilitleyici    " + kilitAdres + "   (nonce " + nonce + ")");
  console.log("  dagitim        " + Number(g1).toLocaleString("en-US") + " gas   " + usd(g1) + " USDC");
  console.log("  + ALP transferi (~70k) ve kilitle() cagrisi");
  console.log("");

  if (!UYGULA) {
    console.log("  kuru calisma: hicbir sey gonderilmedi.");
    console.log("  dagitmak icin: node scripts/dagit-alp-havuz.js --uygula");
    return;
  }

  const kodVar = async (a) => { const k = await rpc("eth_getCode", [a, "latest"]); return !!k && k !== "0x"; };

  if (!(await kodVar(kilitAdres))) {
    console.log("  AlpLocker gonderiliyor...");
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce, data: kilitInit,
      gasLimit: (g1 * 13n) / 10n, gasPrice, value: 0n
    }, "kilitleyici");
    if (!(await kodVar(kilitAdres))) { console.log("    ADRESTE KOD YOK"); process.exit(1); }
  } else console.log("  AlpLocker yerinde");

  /* ---- move the ALP and lock it -------------------------------------- */
  const lockIface = new Interface([
    "function kilitle(uint160,int24,int24,uint24,int24) returns (uint256)",
    "function kilitlendi() view returns (bool)",
    "function havuzId() view returns (bytes32)"
  ]);
  const zaten = await rpc("eth_call",
    [{ to: kilitAdres, data: lockIface.encodeFunctionData("kilitlendi") }, "latest"]);

  if (BigInt(zaten) === 0n) {
    const kilitBak = BigInt(await rpc("eth_call", [
      { to: ALP, data: erc.encodeFunctionData("balanceOf", [kilitAdres]) }, "latest"]));
    if (kilitBak < miktar) {
      console.log("  ALP kilitleyiciye gonderiliyor...");
      const n2 = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
      await gonder(cuzdan, {
        chainId: CHAIN_ID, nonce: n2, to: ALP,
        data: erc.encodeFunctionData("transfer", [kilitAdres, miktar - kilitBak]),
        gasLimit: 120000n, gasPrice, value: 0n
      }, "ALP transferi");
    } else console.log("  ALP zaten kilitleyicide");

    /* The locker places what it HOLDS, so the transfer is the point of no
       return: afterwards the ALP is already unreachable, and kilitle() only
       decides whether it becomes liquidity or sits there. */
    const data = lockIface.encodeFunctionData("kilitle", [sqrtP, altTick, ustTick, FEE, SPACING]);
    const g2 = await tahmin(data, kilitAdres);
    if (typeof g2 !== "bigint") { console.log("  kilitle() reddedildi: " + g2.hata); process.exit(1); }
    console.log("  kilitle() gonderiliyor...   " + Number(g2).toLocaleString("en-US") +
      " gas   " + usd(g2) + " USDC");
    const n3 = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce: n3, to: kilitAdres, data,
      gasLimit: (g2 * 13n) / 10n, gasPrice, value: 0n
    }, "kilitle");
  } else console.log("  zaten kilitlenmis");

  /* ---- read it back from the chain, not from this script -------------- */
  const havuzId = await rpc("eth_call",
    [{ to: kilitAdres, data: lockIface.encodeFunctionData("havuzId") }, "latest"]);
  const havuzdaki = BigInt(await rpc("eth_call", [
    { to: ALP, data: erc.encodeFunctionData("balanceOf", [POOL_MANAGER]) }, "latest"]));
  const kalan = BigInt(await rpc("eth_call", [
    { to: ALP, data: erc.encodeFunctionData("balanceOf", [kilitAdres]) }, "latest"]));
  const cuzdanda = BigInt(await rpc("eth_call", [
    { to: ALP, data: erc.encodeFunctionData("balanceOf", [cuzdan.address]) }, "latest"]));

  console.log("");
  console.log("SONUC");
  console.log("  havuz id               " + havuzId);
  console.log("  PoolManager'daki ALP   " + (Number(havuzdaki) / 1e18).toLocaleString("en-US"));
  console.log("  kilitleyicide kalan    " + kalan.toString() + " wei   (tamsayi tozu, cikisi yok)");
  console.log("  cuzdanda serbest       " + (Number(cuzdanda) / 1e18).toLocaleString("en-US") + " ALP");

  G.alpLocker = kilitAdres;
  G.alpPoolId = havuzId;
  G.alpPoolFee = FEE;
  G.alpPoolSpacing = SPACING;
  G.alpPoolHook = SIFIR;
  G.alpAcilisMcap = ACILIS_MCAP;
  G.alpBantAlt = altTick;
  G.alpBantUst = ustTick;
  G.alpKilitli = TUTAR;
  fs.writeFileSync(YOL, JSON.stringify(G, null, 1));
  console.log("  dagitim-yonetisim.json guncellendi");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
