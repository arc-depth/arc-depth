"use strict";
/* ===========================================================================
 * takas.js — buy or sell a launched token for USDC, on Arc mainnet.
 *
 *   node scripts/takas.js --token 0x… --al  0.20      # spend 0.20 USDC
 *   node scripts/takas.js --token 0x… --sat 173500000 # sell 173.5M tokens
 *   add --uygula to actually send
 *
 * The launch script could buy, as the last step of a launch, and there was
 * no way to sell. That is half a market: the whole point of pricing the
 * pool in USDC is that money goes both ways, and a leg nobody has run is a
 * leg nobody knows works.
 *
 * It prints what the pool holds before and after, because the interesting
 * quantity is not the receipt — it is whether the token came back out of
 * circulation and the dollars came back in.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, Interface, keccak256, formatUnits } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const USDC = "0x3600000000000000000000000000000000000000";
const UYGULA = process.argv.includes("--uygula");

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(ad);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : varsayilan;
};
const TOKEN = arg("--token", null);
const AL = arg("--al", null);     // USDC to spend
const SAT = arg("--sat", null);   // tokens to sell into the pool
const KASA = arg("--kasa", null); // tokens to redeem at the vault, for collateral
/* A PoolKey is the pair, the fee, the tick spacing and the hook. Launch
   pools all share one shape; anything else — the governance token's pool,
   for one — has to be named. */
const SPACING = Number(arg("--spacing", "60"));
const POOL_FEE = Number(arg("--fee", "0"));
const HOOK = arg("--hook", null);

const erc = new Interface([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)"
]);
const routerI = new Interface([
  "function swap((address,address,uint24,int24,address),bool,uint256,uint256) payable returns (uint256)"
]);
const lpI = new Interface([
  "function launchIdOf(address) view returns (uint256)",
  "function launches(uint256) view returns (address token,address vault,address rewards,address founder,uint256 collateral,uint256 liquidity)"
]);
const vaultI = new Interface([
  "function floorPrice() view returns (uint256)",
  "function backing() view returns (uint256)"
]);
const vaultIKas = new Interface([
  "function redeem(uint256) returns (uint256)",
  "function collateral() view returns (address)"
]);

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
  let bekle = 2000;
  for (let i = 0; ; i++) {
    try { return await ham(m, p); }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 30000);
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

(async function main() {
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim.json"), "utf8"));
  if (!TOKEN) { console.log("--token gerekli"); process.exit(1); }
  const secilen = [AL, SAT, KASA].filter((x) => x !== null).length;
  if (secilen !== 1) { console.log("--al, --sat VEYA --kasa: tam olarak biri"); process.exit(1); }

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);

  const oku = async (to, ifc, fn, args = []) => {
    const r = await rpc("eth_call", [{ to, data: ifc.encodeFunctionData(fn, args) }, "latest"]);
    return ifc.decodeFunctionResult(fn, r);
  };
  const bak = async (t, w) => BigInt((await oku(t, erc, "balanceOf", [w]))[0]);

  const sembol = (await oku(TOKEN, erc, "symbol"))[0];
  const PM = D.poolManager;

  /* The launch this token belongs to, so the floor can be shown next to the
     price somebody is actually paying. */
  let vault = null;
  let sahipLp = null;
  /* Every launchpad this project has deployed, newest first. A token on an
     older one keeps working forever — its pool, hook and vault are
     independent and permanent — so looking in only the current one would
     report a live token as unknown. */
  for (const lp of [D.launchpad].concat(D.gecmisLaunchpadlar || [])) {
    try {
      const id = Number(BigInt((await oku(lp, lpI, "launchIdOf", [TOKEN]))[0]));
      if (id > 0) { vault = (await oku(lp, lpI, "launches", [id - 1])).vault; sahipLp = lp; break; }
    } catch (e) { /* not this one */ }
  }
  if (sahipLp && sahipLp.toLowerCase() !== D.launchpad.toLowerCase()) {
    console.log("  not: bu token eski bir launchpad'de (" + sahipLp + ") — havuzu ve kasasi calisiyor");
  }

  const havuzTokenOnce = await bak(TOKEN, PM);
  const bendeOnce = await bak(TOKEN, cuzdan.address);
  const usdcOnce = await bak(USDC, cuzdan.address);
  const arz = BigInt((await oku(TOKEN, erc, "totalSupply"))[0]);

  console.log("TAKAS  " + sembol + "  " + TOKEN);
  console.log("  yon            " + (
    AL !== null ? "AL  (" + AL + " USDC harcanacak)" :
    SAT !== null ? "SAT (" + Number(SAT).toLocaleString("en-US") + " token havuza satilacak)" :
                   "KASA (" + Number(KASA).toLocaleString("en-US") + " token yakilip teminat alinacak)"));
  console.log("  kip            " + (UYGULA ? "UYGULA (gercek islem)" : "KURU CALISMA"));
  console.log("");
  console.log("  havuzdaki token " + Number(formatUnits(havuzTokenOnce, 18)).toLocaleString("en-US") +
    "   (arzin %" + (100 * Number(havuzTokenOnce) / Number(arz)).toFixed(2) + "'i)");
  console.log("  bendeki token   " + Number(formatUnits(bendeOnce, 18)).toLocaleString("en-US"));
  console.log("  bendeki USDC    " + (Number(usdcOnce) / 1e6).toFixed(6));
  if (vault) {
    const taban = BigInt((await oku(vault, vaultI, "floorPrice"))[0]);
    const kasa = BigInt((await oku(vault, vaultI, "backing"))[0]);
    console.log("  kasadaki teminat " + formatUnits(kasa, 18) + "   taban " + taban.toString());
  }
  console.log("");

  /* ---- redeeming at the vault ---------------------------------------- */
  if (KASA !== null) {
    if (!vault) { console.log("  bu token bu launchpad'de bulunamadi, kasa adresi yok"); process.exit(1); }
    const miktarK = BigInt(Math.round(Number(KASA))) * 10n ** 18n;
    if (bendeOnce < miktarK) {
      console.log("  yetersiz token: " + miktarK + " gerekli, " + bendeOnce + " var");
      process.exit(1);
    }
    const teminatAdres = (await oku(vault, vaultIKas, "collateral"))[0];
    const teminatOnce = await bak(teminatAdres, cuzdan.address);
    const tabanOnce = BigInt((await oku(vault, vaultI, "floorPrice"))[0]);

    const gasPriceK = BigInt(await rpc("eth_gasPrice", []));
    const redeemData = vaultIKas.encodeFunctionData("redeem", [miktarK]);

    if (!UYGULA) {
      console.log("  kasaya satilacak  " + Number(KASA).toLocaleString("en-US") + " token");
      console.log("  karsiliginda      ~" + formatUnits((miktarK * tabanOnce) / 10n ** 18n, 18) + " teminat");
      console.log("  kuru calisma: hicbir sey gonderilmedi.");
      return;
    }

    const izinK = BigInt((await oku(TOKEN, erc, "allowance", [cuzdan.address, vault]))[0]);
    if (izinK < miktarK) {
      console.log("  onay gonderiliyor...");
      const nn = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
      await gonder(cuzdan, {
        chainId: CHAIN_ID, nonce: nn, to: TOKEN,
        data: erc.encodeFunctionData("approve", [vault, miktarK]),
        gasLimit: 120000n, gasPrice: gasPriceK, value: 0n
      }, "onay");
    }

    let gk;
    try { gk = BigInt(await rpc("eth_estimateGas", [{ from: cuzdan.address, to: vault, data: redeemData }])); }
    catch (e) { console.log("  REDDEDILDI: " + e.message); process.exit(1); }

    console.log("  kasaya satiliyor...   " + Number(gk).toLocaleString("en-US") + " gas");
    const nn2 = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce: nn2, to: vault, data: redeemData,
      gasLimit: (gk * 13n) / 10n, gasPrice: gasPriceK, value: 0n
    }, "kasaya satis");

    const teminatSonra = await bak(teminatAdres, cuzdan.address);
    const tabanSonra = BigInt((await oku(vault, vaultI, "floorPrice"))[0]);
    console.log("");
    console.log("SONUC  (zincirden okundu)");
    console.log("  alinan teminat  " + formatUnits(teminatSonra - teminatOnce, 18));
    console.log("  taban fiyat     " + tabanOnce.toString() + "  ->  " + tabanSonra.toString() +
      (tabanOnce === tabanSonra ? "   DEGISMEDI" : "   DEGISTI"));
    console.log("  bendeki token   " + Number(formatUnits(bendeOnce, 18)).toLocaleString("en-US") +
      "  ->  " + Number(formatUnits(await bak(TOKEN, cuzdan.address), 18)).toLocaleString("en-US"));
    return;
  }

  const tokenIsZero = TOKEN.toLowerCase() < USDC.toLowerCase();
  const key = [tokenIsZero ? TOKEN : USDC, tokenIsZero ? USDC : TOKEN,
               POOL_FEE, SPACING, HOOK || D.hook];

  /* zeroForOne means "spending currency0". Buying spends USDC, which is
     currency0 exactly when the token is not; selling is the other way. */
  const alim = AL !== null;
  const veren = alim ? USDC : TOKEN;
  const miktar = alim
    ? BigInt(Math.round(Number(AL) * 1e6))
    : BigInt(Math.round(Number(SAT))) * 10n ** 18n;
  const zeroForOne = alim ? !tokenIsZero : tokenIsZero;

  const elde = alim ? usdcOnce : bendeOnce;
  if (elde < miktar) {
    console.log("  yetersiz bakiye: " + miktar.toString() + " gerekli, " + elde.toString() + " var");
    process.exit(1);
  }

  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const swapData = routerI.encodeFunctionData("swap", [key, zeroForOne, miktar, 0]);

  const izin = BigInt((await oku(veren, erc, "allowance", [cuzdan.address, D.router]))[0]);

  if (!UYGULA) {
    console.log("  onay " + (izin >= miktar ? "var" : "gerekiyor"));
    if (izin >= miktar) {
      try {
        const sim = await rpc("eth_call", [
          { from: cuzdan.address, to: D.router, data: swapData, gas: "0x2000000" }, "latest"]);
        const cikan = BigInt(sim);
        const ond = alim ? 18 : 6;
        console.log("  SIMULASYON: " + formatUnits(cikan, ond) + (alim ? " token" : " USDC") + " alinir");
      } catch (e) {
        console.log("  SIMULASYON REDDEDILDI: " + String(e.message).slice(0, 90));
      }
    } else {
      console.log("  (simulasyon icin once onay gerekiyor)");
    }
    console.log("  kuru calisma: hicbir sey gonderilmedi.");
    console.log("  gondermek icin sona --uygula ekle");
    return;
  }

  if (izin < miktar) {
    console.log("  onay gonderiliyor...");
    const n = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce: n, to: veren,
      data: erc.encodeFunctionData("approve", [D.router, miktar]),
      gasLimit: 120000n, gasPrice, value: 0n
    }, "onay");
  }

  let g;
  try { g = BigInt(await rpc("eth_estimateGas", [{ from: cuzdan.address, to: D.router, data: swapData }])); }
  catch (e) { console.log("  REDDEDILDI: " + e.message); process.exit(1); }

  console.log("  takas gonderiliyor...   " + Number(g).toLocaleString("en-US") + " gas");
  {
    const n = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce: n, to: D.router, data: swapData,
      gasLimit: (g * 13n) / 10n, gasPrice, value: 0n
    }, "takas");
  }

  const havuzTokenSonra = await bak(TOKEN, PM);
  const bendeSonra = await bak(TOKEN, cuzdan.address);
  const usdcSonra = await bak(USDC, cuzdan.address);

  console.log("");
  console.log("SONUC  (zincirden okundu)");
  console.log("  havuzdaki token " + Number(formatUnits(havuzTokenOnce, 18)).toLocaleString("en-US") +
    "  ->  " + Number(formatUnits(havuzTokenSonra, 18)).toLocaleString("en-US") +
    "   (arzin %" + (100 * Number(havuzTokenSonra) / Number(arz)).toFixed(2) + "'i)");
  console.log("  bendeki token   " + Number(formatUnits(bendeOnce, 18)).toLocaleString("en-US") +
    "  ->  " + Number(formatUnits(bendeSonra, 18)).toLocaleString("en-US"));
  console.log("  bendeki USDC    " + (Number(usdcOnce) / 1e6).toFixed(6) +
    "  ->  " + (Number(usdcSonra) / 1e6).toFixed(6));
  const fark = Number(usdcSonra - usdcOnce) / 1e6;
  console.log("  USDC degisimi   " + (fark >= 0 ? "+" : "") + fark.toFixed(6));
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
