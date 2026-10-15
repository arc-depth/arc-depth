"use strict";
/* ===========================================================================
 * dagit-ikiz-havuz-ag.js — a twin can get a pool on any of the nine chains
 *
 *   node scripts/dagit-ikiz-havuz-ag.js [zincir,...|hepsi] [--uygula]
 *
 * A spread token's twin exists on every chain at one address but has no
 * pool, so it cannot be traded there. IkizHavuzFabrika (written for
 * Robinhood, 14/14 on Robinhood mainnet state) is generic over its dollar
 * and its price reference; here it is deployed on every chain with
 *   pool manager  the chain's Uniswap v4
 *   dollar        the chain's launchpad dollar (USDC, USDG, pUSDC on BNB)
 *   reference     FiyatAgi — one address on nine chains, implements
 *                 IEvFiyati, files the home price under the twin's address
 * and its IkizKilitHook (0xA00: only the pool's own opener adds, nothing is
 * ever removed) placed by CREATE2 at a mined address, then bound once.
 * Opening stays what it was: at least $50 of the chain's dollar, at a price
 * within 5% of the home price no older than an hour, liquidity locked.
 * Record: dagitim-ikiz-havuz-ag.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, ContractFactory, AbiCoder, keccak256, getCreate2Address, getAddress } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-ikiz-havuz-ag.json");
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const AG = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ag.json"), "utf8"));
const P2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse2.json"), "utf8")).arc;
const RH = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-robinhood.json"), "utf8")).robinhood;
const coder = AbiCoder.defaultAbiCoder();
const A = (x) => getAddress(String(x).toLowerCase());
const C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const UYGULA = process.argv.includes("--uygula");
const secim = (process.argv[2] && !process.argv[2].startsWith("--")) ? process.argv[2] : "hepsi";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const zincirler = secim === "hepsi" ? Object.keys(EVM) : secim.split(",");
  console.log("IKIZ HAVUZ AGI  " + (UYGULA ? "UYGULA" : "KURU") + "   referans FiyatAgi " + AG.arc.FiyatAgi);

  for (const ad of zincirler) {
    const z = EVM[ad];
    const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
    const w = new Wallet(pk, p);
    const r = (k[ad] = k[ad] || {});
    const dolar = A(ad === "arc" ? P2.quote : ad === "robinhood" ? RH.quote : AG[ad].quote);
    const pm = A(z.poolManager);
    const kod = async (a) => !!a && (await israr(() => p.getCode(a))).length > 2;
    console.log("\n" + z.ad + "  dolar " + dolar);
    const gonder = async (etiket, tx) => {
      if (!UYGULA) {
        let g; try { g = "gaz " + (await israr(() => p.estimateGas({ from: w.address, ...tx }))); } catch (e) { g = "olculemedi (" + (e.shortMessage || e.message).slice(0, 60) + ")"; }
        console.log("     (kuru) " + etiket.padEnd(18) + g); return null;
      }
      if (z.chainId === 999) {
        tx.gasPrice = BigInt(await israr(() => p.send("eth_bigBlockGasPrice", []))) * 12n / 10n; tx.type = 0;
        try { tx.gasLimit = (await israr(() => p.estimateGas({ from: w.address, ...tx }))) * 13n / 10n; } catch (e) { tx.gasLimit = 6_000_000n; }
      }
      if (z.chainId === 1) {
        /* ethers' default max fee is 2x base: on a thin balance that alone fails "insufficient funds" */
        const blok = await israr(() => p.getBlock("latest"));
        tx.maxPriorityFeePerGas = 20_000_000n;
        tx.maxFeePerGas = blok.baseFeePerGas * 13n / 10n + tx.maxPriorityFeePerGas;
        tx.gasLimit = (await israr(() => p.estimateGas({ from: w.address, ...tx }))) * 115n / 100n;
      }
      const t = await israr(() => w.sendTransaction(tx));
      let m = null; while (!m) { await bekle(1500); m = await israr(() => p.getTransactionReceipt(t.hash)); }
      if (m.status !== 1) throw new Error(etiket + " basarisiz " + t.hash);
      console.log("     " + etiket.padEnd(18) + t.hash + "  gaz " + m.gasUsed);
      return m;
    };

    /* the factory */
    if (!(await kod(r.fabrika))) {
      const f = new ContractFactory(B("IkizHavuzFabrika").abi, B("IkizHavuzFabrika").bytecode, w);
      const tx = await f.getDeployTransaction(pm, dolar, AG.arc.FiyatAgi);
      const m = await gonder("IkizHavuzFabrika", tx);
      if (!m) { console.log("     (kuru: hook adresi fabrika olmadan madenlenemez)"); continue; }
      r.fabrika = m.contractAddress; yaz();
      for (let i = 0; i < 20 && !(await kod(r.fabrika)); i++) await bekle(3000);
    } else console.log("     IkizHavuzFabrika  " + r.fabrika + "  (zincirde)");

    /* the hook, mined for 0xA00 with this factory baked in */
    const init = B("IkizKilitHook").bytecode + coder.encode(["address", "address"], [pm, r.fabrika]).slice(2);
    const h = keccak256(init);
    if (!r.hookSalt || r.hookInit !== h) {
      for (let i = 0; ; i++) {
        const s = "0x" + i.toString(16).padStart(64, "0");
        const a = getCreate2Address(C2, s, h);
        if ((parseInt(a.slice(-4), 16) & 0x3FFF) === 0xA00) { r.hookSalt = s; r.hook = a; r.hookInit = h; break; }
      }
      yaz();
    }
    if (!(await kod(r.hook))) {
      await gonder("IkizKilitHook", { to: C2, data: r.hookSalt + init.slice(2) });
      for (let i = 0; i < 20 && !(await kod(r.hook)); i++) await bekle(3000);
    } else console.log("     IkizKilitHook     " + r.hook + "  (zincirde)");

    /* bind once */
    const f = new Contract(r.fabrika, ["function hook() view returns (address)", "function hookuBagla(address)"], w);
    if ((await israr(() => f.hook())).toLowerCase() !== r.hook.toLowerCase()) await gonder("hookuBagla", await f.hookuBagla.populateTransaction(r.hook));
    else console.log("     hook bagli");
    yaz();
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
