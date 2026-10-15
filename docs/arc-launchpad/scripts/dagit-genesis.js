"use strict";
/* ===========================================================================
 * dagit-genesis.js — PULSE GENESIS on every EVM chain it can afford
 *
 *   node scripts/dagit-genesis.js [zincir,...] [--uygula]
 *
 * GenesisCekirdek and GenesisDil go through the deterministic CREATE2
 * deployer with one salt, so they land at ONE address on every chain (the
 * core's chain table is in its bytecode, its only argument is the agent).
 * GenesisHesap takes the chain's own dollar, so it is a plain deployment
 * per chain. Contracts: contracts/genesis/, tests: genesis-test/.
 * Record: dagitim-genesis.json. Idempotent: a contract with code at its
 * address is not deployed again.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, ContractFactory, AbiCoder, keccak256, getCreate2Address, concat, zeroPadValue, toBeHex } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-genesis.json");
const N3 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-nesil3.json"), "utf8"));
const UYGULA = process.argv.includes("--uygula");
const SECIM = (process.argv.slice(2).find((a) => !a.startsWith("--")) || "").split(",").filter(Boolean);
const KURUCU = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";   // the platform operations address
const GOVERNOR = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8")).governor;   // the Arc DAO
const C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const TUZ = zeroPadValue(toBeHex(BigInt(keccak256(Buffer.from("PULSE GENESIS v1")))), 32);
const ZINCIRLER = ["arc", "robinhood", "base", "arbitrum", "avalanche", "monad", "bsc"];
const B = (n) => JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const anahtar = (dosya, ad) => fs.readFileSync(dosya, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m"))[1].trim();

(async () => {
  const pk = anahtar("C:/bot/.env", "TRADER_PRIVATE_KEY");
  const ajan = new Wallet(anahtar(path.join(KOK, ".env"), "GENESIS_AJAN_KEY")).address;
  const cInit = B("GenesisCekirdek").bytecode + coder.encode(["address"], [ajan]).slice(2);
  const cekirdek = getCreate2Address(C2, TUZ, keccak256(cInit));
  const dInit = B("GenesisDil").bytecode + coder.encode(["address"], [cekirdek]).slice(2);
  const dil = getCreate2Address(C2, TUZ, keccak256(dInit));
  const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
  Object.assign(k, { ajan, GenesisCekirdek: cekirdek, GenesisDil: dil, tuz: TUZ });
  const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1)); };
  console.log("GENESIS  ajan " + ajan + "\n  cekirdek " + cekirdek + "\n  dil      " + dil + (UYGULA ? "" : "\n  (kuru)"));

  for (const ad of SECIM.length ? SECIM : ZINCIRLER) {
    const z = EVM[ad];
    const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
    const w = new Wallet(pk, p);
    const r = (k[ad] = k[ad] || {});
    const kod = async (a) => (await p.getCode(a)).length > 2;
    const fd = await p.getFeeData();
    const fiyat = fd.maxFeePerGas || fd.gasPrice;
    const bakiye = await p.getBalance(w.address);
    console.log("\n" + z.ad + "  bakiye " + (Number(bakiye) / 1e18).toPrecision(4) + " " + z.gaz);

    const gonder = async (etiket, tx) => {
      let gaz;
      try { gaz = await p.estimateGas({ from: w.address, ...tx }); }
      catch (e) { console.log("   " + etiket.padEnd(16) + "olculemedi: " + (e.shortMessage || e.message).slice(0, 80)); return null; }
      console.log("   " + etiket.padEnd(16) + "gaz " + gaz + "  ~" + (Number(gaz * fiyat) / 1e18).toPrecision(3) + " " + z.gaz);
      if (!UYGULA) return null;
      const t = await w.sendTransaction({ ...tx, gasLimit: (gaz * 12n) / 10n });
      let m = null; while (!m) { await bekle(2000); m = await p.getTransactionReceipt(t.hash).catch(() => null); }
      if (m.status !== 1) throw new Error(ad + " " + etiket + " basarisiz " + t.hash);
      console.log("   " + "".padEnd(16) + "tx " + t.hash);
      return m;
    };

    for (const [ad2, adres, init] of [["GenesisCekirdek", cekirdek, cInit], ["GenesisDil", dil, dInit]]) {
      if (await kod(adres)) { console.log("   " + ad2.padEnd(16) + "zincirde"); r[ad2] = adres; continue; }
      const m = await gonder(ad2, { to: C2, data: concat([TUZ, init]) });
      if (m) { if (!(await kod(adres))) throw new Error(ad2 + " kod yok"); r[ad2] = adres; yaz(); }
    }

    const dolar = N3[ad] && N3[ad].quote;
    /* ATLAS API sales live on Arc only: prices answer to the Arc DAO */
    if (ad === "arc" && !(r.AtlasAbonelik && (await kod(r.AtlasAbonelik)))) {
      const fa = new ContractFactory(B("AtlasAbonelik").abi, B("AtlasAbonelik").bytecode, w);
      const ma = await gonder("AtlasAbonelik", await fa.getDeployTransaction(dolar, KURUCU, N3.arc.DevPool, GOVERNOR));
      if (ma) { r.AtlasAbonelik = ma.contractAddress; yaz(); console.log("   " + "".padEnd(16) + "AtlasAbonelik " + ma.contractAddress); }
    }
    if (r.GenesisHesap && (await kod(r.GenesisHesap))) { console.log("   GenesisHesap    zincirde " + r.GenesisHesap); continue; }
    const f = new ContractFactory(B("GenesisHesap").abi, B("GenesisHesap").bytecode, w);
    /* the fee split the founder set (15 Oct 2026): 70% founder, 30% growth
       = this chain's DAO-governed developer fund */
    const tx = await f.getDeployTransaction(dolar, KURUCU, N3[ad].DevPool);
    const m = await gonder("GenesisHesap", tx);
    if (m) { r.GenesisHesap = m.contractAddress; r.dolar = dolar; yaz(); console.log("   " + "".padEnd(16) + "GenesisHesap " + m.contractAddress); }
  }
  /* the app reads these (docs/js/genesis-adres.js); written on every run,
     dry or not, because the CREATE2 addresses are known before deployment
     and the page checks for code itself */
  const hesap = {};
  for (const ad of ZINCIRLER) if (k[ad] && k[ad].GenesisHesap) hesap[ad] = k[ad].GenesisHesap;
  fs.writeFileSync(path.join(KOK, "docs", "js", "genesis-adres.js"),
    "/* GENERATED by scripts/dagit-genesis.js — do not edit. CREATE2 addresses,\n" +
    "   identical on every chain; the page checks each chain for code. */\n" +
    "export const GENESIS = " + JSON.stringify({ ajan, cekirdek, dil, zincirler: ZINCIRLER, hesap, atlasAbonelik: (k.arc && k.arc.AtlasAbonelik) || null }, null, 2) + ";\n");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
