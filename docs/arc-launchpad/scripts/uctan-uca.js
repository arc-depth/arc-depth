"use strict";
/* ===========================================================================
 * uctan-uca.js — the whole product, once, on Arc mainnet
 *
 *   node scripts/uctan-uca.js            # dry run
 *   node scripts/uctan-uca.js --uygula
 *
 * faucet -> launch -> swap -> redeem, with real transactions.
 *
 * WHY RUN THIS AT ALL WHEN THE SUITE PASSES
 *   Every test so far runs through eth_call: the real EVM, the real
 *   PoolManager, but no state kept and no gas paid. That proves the logic
 *   and cannot prove the things only a transaction has — that approvals
 *   survive, that the launch's writes persist, that a second transaction
 *   sees what the first one wrote, and that the gas limits are real.
 *
 *   It is also the first time anything in this product is used the way a
 *   person would use it, which is the only way to find out whether the
 *   steps are in a usable order.
 *
 *   The collateral is the worthless test token on purpose. The mechanism is
 *   identical; only the thing behind it is valueless, so a mistake here
 *   costs gas and nothing else.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, Contract, JsonRpcProvider, parseUnits, formatUnits, MaxUint256 } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const UYGULA = process.argv.includes("--uygula");
/* --yatir=100  — anywhere in the allowed range. Defaults to the bottom of
 * the range, because the bottom is the case worth re-checking. */
const YATIR = (() => {
  const a = process.argv.find((x) => x.startsWith("--yatir="));
  const v = a ? Number(a.split("=")[1]) : 100;
  if (!Number.isFinite(v) || v <= 0) {
    console.log("yatirim pozitif olmali (--yatir=0.01)");
    process.exit(1);
  }
  return v;
})();

/* The collateral. Defaults to the worthless test token; point it at a
 * wrapped share to run the thing the product is actually for. The
 * launchpad has no opinion about what a unit is worth, which is the
 * whole reason the deposit range moved to the queue. */
const TEMINAT = (() => {
  const a = process.argv.find((x) => x.startsWith("--teminat="));
  return a ? a.split("=")[1] : TEMINAT;
})();

/* How much of the launch to buy back out of the pool, as a share of the
 * deposit. A fixed number of units made no sense once a unit could be a
 * share of NVIDIA. */
const ALIM_ORAN = (() => {
  const a = process.argv.find((x) => x.startsWith("--alim-oran="));
  const v = a ? Number(a.split("=")[1]) : 0.1;
  return Number.isFinite(v) && v > 0 ? v : 0.1;
})();
/* Buy size scales with the launch so the printed slippage is comparable
 * between a small launch and a large one. */

/* Share of the supply the founder commits to the locked pool. The whole
 * trade-off of the design lives in this number, so the run prints what it
 * cost rather than leaving it implied. */
const HAVUZ_BPS = (() => {
  const a = process.argv.find((x) => x.startsWith("--havuz="));
  const v = a ? Number(a.split("=")[1]) : 30;
  if (!Number.isFinite(v) || v < 5 || v > 70) {
    console.log("havuz payi %5 ile %70 arasinda olmali (--havuz=30)");
    process.exit(1);
  }
  return Math.round(v * 100);
})();

const A = {
  launchpad: "0x82EF07d08CEBD8990da0573A695030666D9A19f3",
  hook: "0x5a0B30489d5876aEe088E9a12805A2D189254a44",
  router: "0x7550058C3F4D8839eBc8AcCB96959Fe69C109581",
  testCol: "0x018ce43Bf0241b7A1fb0433FE13b22A761969Ee9"
};

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function symbol() view returns (string)"
];
const FAUCET = ["function faucetDefault()"];
const LP = [
  "function launch(string,string,address,uint256,uint256) returns (address,address,address)",
  "function launchCount() view returns (uint256)",
  "function launches(uint256) view returns (address token,address vault,address rewards,address founder,uint256 collateral,uint256 liquidity)",
  "function quoteLaunch(uint256,uint256) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256)"
];
const VAULT = [
  "function floorPrice() view returns (uint256)",
  "function backing() view returns (uint256)",
  "function redeem(uint256) returns (uint256)"
];
const ROUTER = ["function swap((address,address,uint24,int24,address),bool,uint256,uint256) returns (uint256)"];

const f = (x, d = 4) => Number(formatUnits(x, 18)).toLocaleString("en-US", { maximumFractionDigits: d });
const log = (...a) => console.log(...a);

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

/* ethers' provider has no retry and this endpoint throttles; every send
 * goes through here so a rate limit costs a wait rather than a transaction. */
async function gonder(fn, ad) {
  let bekle = 2500;
  for (let i = 0; ; i++) {
    try {
      const tx = await fn();
      log("    " + ad + " -> " + tx.hash);
      const rc = await bekleMakbuz(tx.hash);
      log("    blok " + rc.blockNumber + (rc.status === 1 ? "" : "  BASARISIZ"));
      return rc;
    } catch (e) {
      const s = String(e && (e.message || e));
      if (/already known|nonce too low/i.test(s)) { log("    (zaten gonderilmis)"); return null; }
      if (!/rate limit|429|503|timeout|coalesce/i.test(s) || i >= 6) throw e;
      log("    hiz siniri, " + (bekle / 1000) + " sn bekleniyor…");
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 25000);
    }
  }
}

/* Reads throttle too. Same treatment: wait it out rather than abandon a
 * run that may already have sent transactions. */
async function R(fn, ad) {
  let bekle = 2000;
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      const t = String(e && (e.message || e));
      if (!/rate limit|429|503|timeout|coalesce/i.test(t) || i >= 8) throw e;
      if (ad && i === 0) log("    (" + ad + " hiz sinirina takildi, bekleniyor)");
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 20000);
    }
  }
}

function hamRpc(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } });
    });
    r.on("error", rej);
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

async function bekleMakbuz(hash) {
  for (let i = 0; i < 60; i++) {
    try {
      const rc = await hamRpc("eth_getTransactionReceipt", [hash]);
      if (rc) return { blockNumber: parseInt(rc.blockNumber, 16), status: rc.status === "0x1" ? 1 : 0 };
    } catch (e) { /* keep polling */ }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("makbuz gelmedi: " + hash);
}

(async function main() {
  const pk = ozelAnahtar();
  if (!pk) { log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }

  const p = new JsonRpcProvider(RPC, { chainId: 5042, name: "arc" }, { staticNetwork: true });
  const w = new Wallet(pk, p);
  const col = new Contract(TEMINAT, [...ERC20, ...FAUCET], w);
  let teminatSembol = "tCOL";
  try { teminatSembol = await R(() => col.symbol(), "sembol"); } catch (e) { /* keep */ }
  const lp = new Contract(A.launchpad, LP, w);

  log("UCTAN UCA  (Arc ana agi)");
  log("  cuzdan " + w.address);
  log("  kip    " + (UYGULA ? "UYGULA — gercek islem" : "KURU CALISMA"));
  log("  teminat " + TEMINAT);
  log("  yatirim " + YATIR + " birim   (tamami kasaya, havuza arzin %" + (HAVUZ_BPS / 100) + "i)");
  log("");

  const gas0 = BigInt(await R(() => hamRpc("eth_getBalance", [w.address, "latest"]), "gas"));
  let bal = await R(() => col.balanceOf(w.address), "bakiye");
  log("  gas bakiyesi  " + f(gas0) + " USDC");
  log("  tCOL bakiyesi " + f(bal, 0));

  if (!UYGULA) { log("\n  kuru calisma: --uygula ile gercekten calisir"); return; }

  /* 1 ---- faucet ------------------------------------------------------ */
  if (TEMINAT.toLowerCase() === A.testCol.toLowerCase() && bal < parseUnits(String(YATIR), 18)) {
    log("\n[1] test teminati aliniyor");
    await gonder(() => col.faucetDefault(), "faucet");
    bal = await R(() => col.balanceOf(w.address), "bakiye");
    log("    tCOL " + f(bal, 0));
  } else {
    log("\n[1] test teminati zaten var, atlandi");
  }

  /* 2 ---- launch ------------------------------------------------------ */
  log("\n[2] launch");
  const izin = await R(() => col.allowance(w.address, A.launchpad), "izin");
  if (izin < parseUnits(String(YATIR), 18)) {
    await gonder(() => col.approve(A.launchpad, MaxUint256), "onay");
  }
  const oncekiSay = Number(await R(() => lp.launchCount(), "sayac"));
  await gonder(() => lp.launch("Teminatli Deneme", "TDN", TEMINAT, parseUnits(String(YATIR), 18), HAVUZ_BPS), "launch");
  const say = Number(await R(() => lp.launchCount(), "sayac"));
  if (say <= oncekiSay) { log("    launch kaydi artmadi — durduruldu"); process.exit(1); }

  const L = await R(() => lp.launches(say - 1), "kayit");
  log("    token " + L.token);
  log("    kasa  " + L.vault);

  const vault = new Contract(L.vault, VAULT, w);
  const token = new Contract(L.token, ERC20, w);
  const taban0 = await R(() => vault.floorPrice(), "taban");
  const kurucuToken = await R(() => token.balanceOf(w.address), "bakiye");
  log("    taban " + taban0.toString() + "   kurucudaki token " + f(kurucuToken, 0));

  /* 3 ---- swap -------------------------------------------------------- */
  const alimTutar = YATIR * ALIM_ORAN;
  log("\n[3] takas: " + alimTutar + " " + teminatSembol + " ile havuzdan token al");
  const tokenIsZero = L.token.toLowerCase() < TEMINAT.toLowerCase();
  const key = [
    tokenIsZero ? L.token : TEMINAT,
    tokenIsZero ? TEMINAT : L.token,
    0, 60, A.hook
  ];
  await gonder(() => col.approve(A.router, MaxUint256), "router onayi");
  const tokenOnce = await R(() => token.balanceOf(w.address), "bakiye");
  const router = new Contract(A.router, ROUTER, w);
  await gonder(() => router.swap(key, !tokenIsZero, parseUnits(String(alimTutar), 18), 0), "takas");
  const tokenSonra = await R(() => token.balanceOf(w.address), "bakiye");
  const taban1 = await R(() => vault.floorPrice(), "taban");
  log("    alinan token " + f(tokenSonra - tokenOnce, 0));
  log("    taban " + taban1.toString() + (taban1 === taban0 ? "   DEGISMEDI" : "   DEGISTI"));

  /* 4 ---- redeem ------------------------------------------------------ */
  log("\n[4] geri alim: 1.000.000 token yak");
  await gonder(() => token.approve(L.vault, MaxUint256), "kasa onayi");
  const colOnce = await R(() => col.balanceOf(w.address), "bakiye");
  await gonder(() => vault.redeem(parseUnits("1000000", 18)), "geri alim");
  const colSonra = await R(() => col.balanceOf(w.address), "bakiye");
  const taban2 = await R(() => vault.floorPrice(), "taban");
  log("    alinan teminat " + f(colSonra - colOnce, 6));
  log("    taban " + taban2.toString() + (taban2 === taban1 ? "   DEGISMEDI" : "   DEGISTI"));

  /* ---- summary ------------------------------------------------------- */
  const gas1 = BigInt(await R(() => hamRpc("eth_getBalance", [w.address, "latest"]), "gas"));
  log("");
  log("SONUC");
  log("  token        " + L.token);
  log("  kasa         " + L.vault);
  log("  taban        baslangic " + taban0.toString());
  log("               takas sonrasi " + taban1.toString());
  log("               geri alim sonrasi " + taban2.toString());
  log("  kasadaki teminat " + f(await R(() => vault.backing(), "kasa"), 4));
  log("  harcanan gas " + f(gas0 - gas1, 5) + " USDC");

  fs.writeFileSync(path.join(__dirname, "..", "son-launch.json"), JSON.stringify({
    token: L.token, vault: L.vault, rewards: L.rewards,
    floorStart: taban0.toString(), floorAfterSwap: taban1.toString(), floorAfterRedeem: taban2.toString(),
    teminat: TEMINAT, yatirim: YATIR, zaman: new Date().toISOString()
  }, null, 1));
  log("  son-launch.json yazildi");
})().catch((e) => { console.log("\nHATA: " + String(e && e.message).slice(0, 220)); process.exit(1); });
