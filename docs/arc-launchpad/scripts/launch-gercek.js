"use strict";
/* ===========================================================================
 * launch-gercek.js — one real stock-backed launch on the new stack, then buy
 *                    it with ordinary dollars.
 *
 *   node scripts/launch-gercek.js                 # prices it, sends nothing
 *   node scripts/launch-gercek.js --uygula
 *
 * WHY THIS EXISTS
 *   The launchpad was redeployed so that pools are priced in USDC instead of
 *   in the collateral that backs them. That left the product with no tokens
 *   at all: the one launch on the old launchpad stayed there, and the trade
 *   screen had nothing to offer. A launchpad with nothing launched on it is
 *   not a demonstration of anything.
 *
 *   So this makes one, with the wrapped NVIDIA actually held in the wallet —
 *   small, because that is what there is, and real for the same reason.
 *
 * AND THEN IT BUYS IT
 *   The second half is the part that could not be done before this week: pay
 *   USDC, receive the token. No wrapped share to find first, no bridge for
 *   the buyer to cross. If that leg works here it works for anybody.
 *
 * THE VALUATION
 *   `quoteValue` is what the collateral is worth, and it decides only where
 *   the market opens — the floor, the vault and everything recoverable are
 *   measured in collateral and do not depend on it. There is no NVDA price
 *   feed on Arc, so it is derived from the bridge run that produced this
 *   wNVDA in the first place: 3 USDC bought 0.012705395 NVDA, i.e. about
 *   $236 a share. A customer launch does not need this estimate at all —
 *   the queue knows exactly what was paid.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, Interface, AbiCoder, keccak256, formatUnits } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const UYGULA = process.argv.includes("--uygula");

const WNVDA = process.env.WNVDA || "0xA3cd6fD4316DB70C06931A233FDddC48c2879DC4";
const USDC = "0x3600000000000000000000000000000000000000";
const HISSE_FIYAT = Number(process.env.HISSE_FIYAT || 236);  // dollars per NVDA
const AD = process.env.AD || "Nvidia Teminatli";
const SEMBOL = process.env.SEMBOL || "wNVD";
const HAVUZ_BPS = Number(process.env.HAVUZ_BPS || 3000);     // 30% to the locked pool
const ALIM = process.env.ALIM || "0.25";                      // USDC to spend buying it
/* Which launch to buy. Empty means "the one just created"; set it to buy an
   existing one without launching anything. */
const SIRA = process.env.SIRA === undefined || process.env.SIRA === "" ? null : Number(process.env.SIRA);

const coder = AbiCoder.defaultAbiCoder();

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
async function rpc(m, p) {
  let bekle = 1500;
  for (let i = 0; ; i++) {
    try { return await ham(m, p); }
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
  }
  console.log("    " + ad + " -> " + hash);
  for (let i = 0; i < 80; i++) {
    let rc = null;
    try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
    if (rc) {
      if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz: " + hash);
      console.log("    blok " + parseInt(rc.blockNumber, 16));
      return rc;
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

const erc = new Interface([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
]);
const lpI = new Interface([
  "function launch(string,string,address,uint256,uint256) returns (address,address,address)",
  "function launchCount() view returns (uint256)",
  "function launches(uint256) view returns (address token,address vault,address rewards,address founder,uint256 collateral,uint256 liquidity)",
  "function quote() view returns (address)",
  "function acilisMcap() view returns (uint256)",
  "function hook() view returns (address)"
]);
const vaultI = new Interface([
  "function floorPrice() view returns (uint256)",
  "function backing() view returns (uint256)"
]);
const routerI = new Interface([
  "function swap((address,address,uint24,int24,address),bool,uint256,uint256) payable returns (uint256)"
]);

(async function main() {
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim.json"), "utf8"));

  console.log("GERCEK LAUNCH  (yeni, USDC fiyatli yigin)");
  console.log("  launchpad  " + D.launchpad);
  console.log("  hook       " + D.hook);
  console.log("  teminat    " + WNVDA);
  console.log("  kip        " + (UYGULA ? "UYGULA (gercek islem)" : "KURU CALISMA"));
  console.log("");

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);

  const oku = async (to, iface, fn, args = []) => {
    const r = await rpc("eth_call", [{ to, data: iface.encodeFunctionData(fn, args) }, "latest"]);
    return iface.decodeFunctionResult(fn, r);
  };
  const bak = async (t, w) => BigInt((await oku(t, erc, "balanceOf", [w]))[0]);

  const gaz = BigInt(await rpc("eth_getBalance", [cuzdan.address, "latest"]));
  const usdcBak = await bak(USDC, cuzdan.address);
  const colBak = await bak(WNVDA, cuzdan.address);

  console.log("  cuzdan  " + cuzdan.address);
  console.log("  gaz     " + (Number(gaz) / 1e18).toFixed(6) + " USDC");
  console.log("  USDC    " + (Number(usdcBak) / 1e6).toFixed(6));
  console.log("  wNVDA   " + formatUnits(colBak, 18));

  /* Resumable on purpose. The collateral is gone the moment the launch
     lands, so a rerun after a failure further down would otherwise report
     "no collateral" and leave the launch half finished — which is exactly
     what happened the first time this ran. */
  const mevcut = Number(BigInt((await oku(D.launchpad, lpI, "launchCount"))[0]));
  const yalnizAlim = SIRA !== null || (colBak === 0n && mevcut > 0);
  if (colBak === 0n && !yalnizAlim) {
    console.log("");
    console.log("  teminat yok — launch yapilamaz.");
    process.exit(1);
  }
  if (yalnizAlim) console.log("  teminat harcanmis; son launch zaten var, alim adimina geciliyor");

  /* The deposit sets the floor. Where the market opens is the launchpad's
     business and is the same for every launch. */
  const deger = Number(formatUnits(colBak, 18)) * HISSE_FIYAT;
  const acilis = BigInt((await oku(D.launchpad, lpI, "acilisMcap"))[0]);
  console.log("");
  console.log("  yatirilacak teminat   " + formatUnits(colBak, 18) + " wNVDA");
  console.log("  tahmini degeri        $" + deger.toFixed(4) + "   ($" + HISSE_FIYAT + "/hisse)  -> TABAN");
  console.log("  acilis piyasa degeri  $" + (Number(acilis) / 1e6).toLocaleString("en-US") +
    "   (her launch ayni, teminattan bagimsiz)");
  console.log("  havuza giden arz      %" + (HAVUZ_BPS / 100).toFixed(0));
  console.log("");

  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const usd = (g) => (Number(g * gasPrice) / 1e18).toFixed(5);
  const tahmin = async (to, data) => {
    try { return BigInt(await rpc("eth_estimateGas", [{ from: cuzdan.address, to, data }])); }
    catch (e) { return { hata: String(e.message) }; }
  };

  /* No valuation is passed any more: every launch opens at the same market
     cap, which the launchpad holds. The deposit decides the floor and
     nothing else. */
  const launchData = lpI.encodeFunctionData("launch",
    [AD, SEMBOL, WNVDA, colBak, HAVUZ_BPS]);

  /* The estimate only works once the launchpad may pull the collateral, so
     the approval is checked first and the estimate skipped when it is
     missing rather than reported as a failure. */
  const izin = BigInt((await oku(WNVDA, erc, "allowance", [cuzdan.address, D.launchpad]))[0]);
  if (yalnizAlim) {
    console.log("  launch   atlandi (zaten var)");
  } else if (izin >= colBak) {
    const g = await tahmin(D.launchpad, launchData);
    if (typeof g === "bigint") console.log("  launch   " + Number(g).toLocaleString("en-US") + " gas   " + usd(g) + " USDC");
    else { console.log("  launch REDDEDILDI: " + g.hata); process.exit(1); }
  } else {
    console.log("  launch   (once onay gerekiyor, tahmin sonra)");
  }

  if (!UYGULA) {
    console.log("");
    console.log("  kuru calisma: hicbir sey gonderilmedi.");
    console.log("  calistirmak icin: node scripts/launch-gercek.js --uygula");
    return;
  }

  /* ---- 1. approve ---------------------------------------------------- */
  if (!yalnizAlim && izin < colBak) {
    console.log("");
    console.log("[1] teminat onayi");
    const n = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce: n, to: WNVDA,
      data: erc.encodeFunctionData("approve", [D.launchpad, colBak]),
      gasLimit: 120000n, gasPrice, value: 0n
    }, "onay");
  }

  /* ---- 2. launch ------------------------------------------------------ */
  if (!yalnizAlim) {
    console.log("");
    console.log("[2] launch");
    const g2 = await tahmin(D.launchpad, launchData);
    if (typeof g2 !== "bigint") { console.log("  REDDEDILDI: " + g2.hata); process.exit(1); }
    const n = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce: n, to: D.launchpad, data: launchData,
      gasLimit: (g2 * 13n) / 10n, gasPrice, value: 0n
    }, "launch");
  }

  const sayi = Number(BigInt((await oku(D.launchpad, lpI, "launchCount"))[0]));
  const hedefSira = SIRA !== null ? SIRA : sayi - 1;
  if (hedefSira < 0 || hedefSira >= sayi) {
    console.log("  SIRA=" + hedefSira + " diye bir launch yok (toplam " + sayi + ")");
    process.exit(1);
  }
  const L = await oku(D.launchpad, lpI, "launches", [hedefSira]);
  console.log("");
  console.log("  launch #" + hedefSira);
  console.log("    token  " + L.token);
  console.log("    kasa   " + L.vault);
  console.log("    odul   " + L.rewards);

  /* ---- 3. buy it with ordinary dollars -------------------------------- */
  console.log("");
  console.log("[3] USDC ile alim  —  " + ALIM + " USDC");
  if (!D.router) {
    console.log("    dagitim.json icinde router adresi yok — alim yapilamiyor.");
    process.exit(1);
  }
  const alimTutar = BigInt(Math.round(Number(ALIM) * 1e6));
  if (usdcBak < alimTutar) {
    console.log("    cuzdanda yeterli USDC yok, alim atlandi.");
  } else {
    const rIzin = BigInt((await oku(USDC, erc, "allowance", [cuzdan.address, D.router]))[0]);
    if (rIzin < alimTutar) {
      const n = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
      await gonder(cuzdan, {
        chainId: CHAIN_ID, nonce: n, to: USDC,
        data: erc.encodeFunctionData("approve", [D.router, alimTutar * 10n]),
        gasLimit: 120000n, gasPrice, value: 0n
      }, "router onayi");
    }

    const tokenIsZero = L.token.toLowerCase() < USDC.toLowerCase();
    const key = [
      tokenIsZero ? L.token : USDC,
      tokenIsZero ? USDC : L.token,
      0, 60, D.hook
    ];
    /* Spending USDC: it is currency0 exactly when the token is not. */
    const swapData = routerI.encodeFunctionData("swap", [key, !tokenIsZero, alimTutar, 0]);
    const g3 = await tahmin(D.router, swapData);
    if (typeof g3 !== "bigint") {
      console.log("    alim REDDEDILDI: " + g3.hata);
    } else {
      const n = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
      await gonder(cuzdan, {
        chainId: CHAIN_ID, nonce: n, to: D.router, data: swapData,
        gasLimit: (g3 * 13n) / 10n, gasPrice, value: 0n
      }, "alim");
    }
  }

  /* ---- 4. read it all back from the chain ----------------------------- */
  console.log("");
  console.log("SONUC  (zincirden okundu)");
  const PM = D.poolManager;
  const taban = BigInt((await oku(L.vault, vaultI, "floorPrice"))[0]);
  const kasa = BigInt((await oku(L.vault, vaultI, "backing"))[0]);
  const havuzToken = await bak(L.token, PM);
  const havuzUsdc = await bak(USDC, PM);
  const bendeki = await bak(L.token, cuzdan.address);

  console.log("  token            " + L.token);
  console.log("  adi              " + (await oku(L.token, erc, "name"))[0] +
    " (" + (await oku(L.token, erc, "symbol"))[0] + ")");
  console.log("  kasadaki teminat " + formatUnits(kasa, 18) + " wNVDA");
  console.log("  taban fiyat      " + taban.toString() + "   (token basina wNVDA, 1e18 olcekli)");
  console.log("  havuzdaki token  " + Number(formatUnits(havuzToken, 18)).toLocaleString("en-US"));
  console.log("  bendeki token    " + Number(formatUnits(bendeki, 18)).toLocaleString("en-US"));
  console.log("  PoolManager USDC " + (Number(havuzUsdc) / 1e6).toFixed(6) + "   (tum havuzlarin toplami)");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
