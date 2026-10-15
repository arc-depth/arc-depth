"use strict";
/* ===========================================================================
 * dagit-nesil3.js — local-collateral launch stack (paste a token, back with it)
 *
 *   node scripts/dagit-nesil3.js [zincir,...] [--uygula]
 *
 * Per chain: PulseFabrika  YerelKasaFabrika  PulseLikiditeKasasi
 *            YerelCevirici(SwapRouter02, PoolManager)  PulseLaunchpad3
 *            PulseHook (Arachnid CREATE2, 0xACC bits)
 * Chains: arc, robinhood, base, arbitrum, avalanche, monad.
 *   Not hyperevm (a launch is ~7.3M gas, blocks hold 3M), not bsc (its
 *   dollar is 18-decimal; the 6-decimal wrapper has no pools to convert
 *   from — handled separately), not ethereum (gas).
 * Router and PoolManager addresses: Uniswap's deployments.json (22 Sep
 * 2026); every v3 factory was read back with code on 14 Oct.
 * Tested first: nesil2-test/test/Nesil3.t.sol on Base and Arbitrum forks
 * ($20 -> WETH through the real v3 pool, taxes in dollars, redemption pays
 * both). Record: dagitim-nesil3.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, AbiCoder, keccak256, getCreateAddress, getCreate2Address, getAddress } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-nesil3.json");
const N2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-nesil2.json"), "utf8"));
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const A = (x) => getAddress(String(x).toLowerCase());
const ic = (n, t, d) => B(n).bytecode + (t.length ? coder.encode(t, d).slice(2) : "");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const UYGULA = process.argv.includes("--uygula");
const SECIM = (process.argv[2] && !process.argv[2].startsWith("--")) ? process.argv[2].split(",") : null;
const ROUTER = {
  arc: "0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77", robinhood: "0xCaf681a66D020601342297493863E78C959E5cb2",
  base: "0x2626664c2603336E57B271c5C0b26F421741e481", arbitrum: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  avalanche: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE", monad: "0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900",
  bsc: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",
};
/* BNB Chain: USDC there has 18 decimals, so the launch dollar is the
   deployed Dolar6 wrapper (pUSDC) and the launchpad's converter is
   SarmalCevirici (unwrap, then the unchanged YerelCevirici). Fork test:
   nesil2-test/test/NesilBnb.t.sol. No nesil-2 record on BNB; its DevPool
   and PoolManager come from the first-generation record. */
const AG1 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ag.json"), "utf8"));
const ZINCIRLER = Object.keys(ROUTER);
const HOOK_BITLERI = 0xACC, MASKE = (1 << 14) - 1;

async function israr(f) {
  for (let d = 0; ; d++) {
    try { return await f(); }
    catch (e) { const m = (e.shortMessage || e.message || "") + JSON.stringify(e.info || {}); if (d > 7 || !/rate|limit|timeout|503|502|429|ECONNRESET|fetch failed|coalesce/i.test(m)) throw e; await bekle(2500 * (d + 1)); }
  }
}

(async () => {
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
  const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1)); };
  console.log("NESIL 3 (yerel teminat)  " + (UYGULA ? "UYGULA" : "KURU"));
  for (const ad of (SECIM || ZINCIRLER).filter((x) => ROUTER[x])) {
    const z = EVM[ad];
    const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
    const w = new Wallet(pk, p);
    const r = (k[ad] = k[ad] || {});
    const kod = async (a) => !!a && (await israr(() => p.getCode(a))).length > 2;
    /* Robinhood: pools trade against USDG (Circle USDC there has ~$3 of supply,
       measured 14 Oct 2026), so the local-collateral launchpad takes USDG */
    const kay = ad === "bsc" ? AG1.bsc : N2.ev[ad];
    const quote = ad === "robinhood" ? A("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168") : ad === "bsc" ? A(AG1.bsc.Dolar6) : A(kay.quote),
      PM = A(kay.poolManager), DP = A(kay.DevPool);
    console.log("\n" + z.ad + "  dolar " + quote + "  router " + ROUTER[ad]);
    const n0 = r.nonce != null ? r.nonce : await israr(() => p.getTransactionCount(w.address, "pending"));
    if (r.nonce == null) { r.nonce = n0; yaz(); }
    const sira = ["PulseFabrika", "YerelKasaFabrika", "PulseLikiditeKasasi", "YerelCevirici", ...(ad === "bsc" ? ["SarmalCevirici"] : []), "PulseLaunchpad3"];
    const T = {}; sira.forEach((n, i) => { T[n] = getCreateAddress({ from: w.address, nonce: n0 + i }); });
    const hookInit = ic("PulseHook", ["address", "address", "address", "address", "address", "address"], [PM, T.PulseLaunchpad3, quote, DP, T.PulseLikiditeKasasi, ISLETME]);
    const hh = keccak256(hookInit);
    if (!r.hookSalt || r.hookInitHash !== hh) {
      for (let i = 0; ; i++) {
        const s = "0x" + i.toString(16).padStart(64, "0");
        const a = getCreate2Address(C2, s, hh);
        if ((parseInt(a.slice(-4), 16) & MASKE) === HOOK_BITLERI) { r.hookSalt = s; r.PulseHook = a; break; }
      }
      r.hookInitHash = hh; yaz();
    }
    const init = {
      PulseFabrika: () => ic("PulseFabrika", [], []),
      YerelKasaFabrika: () => ic("YerelKasaFabrika", ["address"], [T.PulseLaunchpad3]),
      PulseLikiditeKasasi: () => ic("PulseLikiditeKasasi", ["address", "address"], [quote, T.PulseLaunchpad3]),
      YerelCevirici: () => ic("YerelCevirici", ["address", "address"], [ROUTER[ad], PM]),
      SarmalCevirici: () => ic("SarmalCevirici", ["address", "address"], [quote, T.YerelCevirici]),
      PulseLaunchpad3: () => ic("PulseLaunchpad3", ["address", "address", "address", "address", "address", "address", "address", "address", "address"],
        [quote, PM, r.PulseHook, T.PulseFabrika, T.YerelKasaFabrika, DP, T.PulseLikiditeKasasi, ISLETME, T.SarmalCevirici || T.YerelCevirici]),
    };
    const gonder = async (etiket, tx) => {
      if (!UYGULA) {
        let g; try { g = "gaz " + (await israr(() => p.estimateGas({ from: w.address, ...tx }))); } catch (e) { g = "olculemedi (" + (e.shortMessage || e.message).slice(0, 50) + ")"; }
        console.log("   (kuru) " + etiket.padEnd(22) + g); return null;
      }
      const t = await israr(() => w.sendTransaction(tx));
      let m = null; while (!m) { await bekle(1500); m = await israr(() => p.getTransactionReceipt(t.hash)); }
      if (m.status !== 1) throw new Error(etiket + " basarisiz " + t.hash);
      console.log("   " + etiket.padEnd(22) + t.hash + "  gaz " + m.gasUsed);
      return m;
    };
    for (const [i, n] of sira.entries()) {
      if (await kod(T[n])) { console.log("   " + n.padEnd(22) + T[n] + "  (zincirde)"); r[n] = T[n]; continue; }
      const tx = { data: init[n]() };
      if (UYGULA) {
        const simdi = await israr(() => p.getTransactionCount(w.address, "pending"));
        if (simdi !== n0 + i) throw new Error(ad + " " + n + ": nonce " + simdi + ", beklenen " + (n0 + i));
        tx.nonce = n0 + i;
      }
      const m = await gonder(n, tx);
      if (m) { if (m.contractAddress.toLowerCase() !== T[n].toLowerCase()) throw new Error(n + " sapti"); r[n] = T[n]; yaz(); }
      else if (!UYGULA && i === 0) { console.log("   (kuru: kalan adimlar sirali nonce ister)"); break; }
    }
    if (UYGULA) {
      if (!(await kod(r.PulseHook))) await gonder("PulseHook", { to: C2, data: r.hookSalt + hookInit.slice(2) });
      Object.assign(r, { quote, poolManager: PM, DevPool: DP, router: ROUTER[ad], zaman: new Date().toISOString() });
      yaz();
    }
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
