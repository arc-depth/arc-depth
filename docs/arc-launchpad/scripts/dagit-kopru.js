"use strict";
/* ===========================================================================
 * dagit-kopru.js — deploy the two bridge legs, one per chain
 *
 *   node scripts/dagit-kopru.js                  # dry run
 *   node scripts/dagit-kopru.js --uygula
 *
 *   --stock 0x...    Stock Token to wrap (default: AAPL on Robinhood Chain)
 *   --ad "Wrapped AAPL"  --sembol wAAPL
 *
 * The vault goes on Robinhood Chain next to the stock it locks; the wrapped
 * claim goes on Arc next to the pools that will use it. Neither can be
 * deployed to the other chain — the vault must be able to hold the stock,
 * and the claim must be tradeable where the launchpad is.
 *
 * Both take the relayer address at construction and it cannot be changed
 * afterwards. That is deliberate: a changeable relayer is a changeable
 * trust assumption, and the whole bridge already rests on one. Rotating it
 * means deploying a new pair and migrating, which is loud.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, JsonRpcProvider, ContractFactory } = require("ethers");

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const RHC_RPC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";

/* Apple • Robinhood Token, read off Robinhood Chain earlier: standard
 * ERC-20, 18 decimals, transfers unrestricted (simulated from a real
 * holder), beacon proxy with a split multiplier behind it. */
const VARSAYILAN_STOCK = "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9";

const arg = process.argv.slice(2);
const has = (f) => arg.includes(f);
const val = (f, d) => { const i = arg.indexOf(f); return i >= 0 ? arg[i + 1] : d; };

const UYGULA = has("--uygula");
/* An address here means that leg is already on chain: skip it. A multi-
 * transaction script must be safe to run twice, or an interruption leaves
 * paid-for contracts orphaned. */
const MEVCUT_KASA = val("--kasa", "");
const MEVCUT_SARMAL = val("--sarmal", "");
const STOCK = val("--stock", VARSAYILAN_STOCK);
const AD = val("--ad", "Wrapped AAPL");
const SEMBOL = val("--sembol", "wAAPL");

const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));

function rpcHam(url, method, params) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(new Error("HTTP " + s.statusCode)); }
      });
    });
    r.on("error", rej);
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

async function rpc(url, method, params) {
  let bekle = 1500;
  for (let i = 0; ; i++) {
    try { return await rpcHam(url, method, params); }
    catch (e) {
      if (!/rate limit|429|503|timeout/i.test(String(e.message)) || i >= 6) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 15000);
    }
  }
}

function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const f of [path.join("C:", "bot", ".env"), path.join(__dirname, "..", ".env")]) {
    try {
      const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}

(async function main() {
  const VAULT = B("StockVault");
  const WRAPPED = B("WrappedStock");

  console.log("KOPRU DAGITIMI");
  console.log("  kip     " + (UYGULA ? "UYGULA" : "KURU CALISMA"));
  console.log("  stock   " + STOCK + "   (Robinhood Chain)");
  console.log("  sarmal  " + AD + " / " + SEMBOL + "   (Arc)");
  console.log("");

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }

  const arcP = new JsonRpcProvider(ARC_RPC, { chainId: 5042, name: "arc" }, { staticNetwork: true });
  const rhcP = new JsonRpcProvider(RHC_RPC, { chainId: 4663, name: "rhc" }, { staticNetwork: true });
  const arcW = new Wallet(pk, arcP);
  const rhcW = new Wallet(pk, rhcP);
  const RELAYER = arcW.address;

  const arcBal = BigInt(await rpc(ARC_RPC, "eth_getBalance", [arcW.address, "latest"]));
  const rhcBal = BigInt(await rpc(RHC_RPC, "eth_getBalance", [rhcW.address, "latest"]));
  console.log("  cuzdan / relayer " + RELAYER);
  console.log("  Arc bakiye       " + (Number(arcBal) / 1e18).toFixed(6) + " USDC");
  console.log("  RHC bakiye       " + (Number(rhcBal) / 1e18).toFixed(8) + " ETH");
  console.log("");

  /* Sanity: the thing being wrapped must actually be a token on that chain.
   * Deploying a vault around an address with no code would produce a vault
   * that can never be funded and never be diagnosed. */
  const stockKod = await rpc(RHC_RPC, "eth_getCode", [STOCK, "latest"]);
  if (!stockKod || stockKod === "0x") {
    console.log("  STOCK adresinde kod yok — durduruldu.");
    process.exit(1);
  }
  console.log("  stock kodu dogrulandi: " + ((stockKod.length - 2) / 2) + " bayt");

  const arcGas = BigInt(await rpc(ARC_RPC, "eth_gasPrice", []));
  const rhcGas = BigInt(await rpc(RHC_RPC, "eth_gasPrice", []));

  const vaultFab = new ContractFactory(VAULT.abi, VAULT.bytecode, rhcW);
  const wrapFab = new ContractFactory(WRAPPED.abi, WRAPPED.bytecode, arcW);

  const vaultTx = await vaultFab.getDeployTransaction(STOCK, RELAYER);
  const wrapTx = await wrapFab.getDeployTransaction(AD, SEMBOL, RELAYER);

  const vaultGas = BigInt(await rpc(RHC_RPC, "eth_estimateGas", [{ from: rhcW.address, data: vaultTx.data }]));
  const wrapGas = BigInt(await rpc(ARC_RPC, "eth_estimateGas", [{ from: arcW.address, data: wrapTx.data }]));

  console.log("");
  console.log("  kasa   (RHC) " + Number(vaultGas).toLocaleString("en-US").padStart(9) + " gas   " +
    (Number(vaultGas * rhcGas) / 1e18).toFixed(8) + " ETH");
  console.log("  sarmal (Arc) " + Number(wrapGas).toLocaleString("en-US").padStart(9) + " gas   " +
    (Number(wrapGas * arcGas) / 1e18).toFixed(5) + " USDC");
  console.log("");

  if (!UYGULA) {
    console.log("  kuru calisma: hicbir sey gonderilmedi.");
    return;
  }

  let vaultAdr = MEVCUT_KASA;
  if (vaultAdr) {
    const k = await rpc(RHC_RPC, "eth_getCode", [vaultAdr, "latest"]);
    if (!k || k === "0x") { console.log("  verilen kasa adresinde kod yok — durduruldu."); process.exit(1); }
    console.log("  kasa zaten dagitilmis, atlandi: " + vaultAdr);
  } else {
    console.log("  kasa gonderiliyor (Robinhood Chain)...");
    const vault = await vaultFab.deploy(STOCK, RELAYER, { gasLimit: (vaultGas * 13n) / 10n });
    await vault.waitForDeployment();
    vaultAdr = await vault.getAddress();
    console.log("    " + vaultAdr);
  }

  let wrapAdr = MEVCUT_SARMAL;
  if (wrapAdr) {
    console.log("  sarmal zaten dagitilmis, atlandi: " + wrapAdr);
  } else {
    console.log("  sarmal gonderiliyor (Arc)...");
    const wrap = await wrapFab.deploy(AD, SEMBOL, RELAYER, { gasLimit: (wrapGas * 13n) / 10n });
    await wrap.waitForDeployment();
    wrapAdr = await wrap.getAddress();
    console.log("    " + wrapAdr);
  }

  const rhcHead = parseInt(await rpc(RHC_RPC, "eth_blockNumber", []), 16);
  const arcHead = parseInt(await rpc(ARC_RPC, "eth_blockNumber", []), 16);

  const ayar = {
    vault: vaultAdr,
    wrapped: wrapAdr,
    stock: STOCK,
    relayer: RELAYER,
    vaultStartBlock: rhcHead,
    wrappedStartBlock: arcHead,
    zaman: new Date().toISOString()
  };
  fs.mkdirSync(path.join(__dirname, "..", "relayer"), { recursive: true });

  /* Merge into the existing file, never replace it.
   *
   * Writing it wholesale erased the AAPL bridge when the NVDA one was
   * deployed. Both addresses were live on chain and only one was named
   * anywhere, so the file was the record and the record was gone. A
   * config that holds exactly one of a thing the product offers twenty-
   * eight of is not a config, it is a variable. */
  const AYAR_YOLU = path.join(__dirname, "..", "relayer", "ayar.json");
  let hepsi = { relayer: RELAYER, hisseler: {} };
  try {
    const g = JSON.parse(fs.readFileSync(AYAR_YOLU, "utf8"));
    if (g && g.hisseler) hepsi = g;
  } catch (e) { /* the first stock */ }
  hepsi.relayer = RELAYER;
  const anahtar = SEMBOL.replace(/^w/, "").toUpperCase();
  hepsi.hisseler[anahtar] = Object.assign({ sembol: anahtar }, ayar);
  hepsi.zaman = new Date().toISOString();
  fs.writeFileSync(AYAR_YOLU, JSON.stringify(hepsi, null, 1));
  console.log("");
  console.log("  relayer/ayar.json guncellendi: " + Object.keys(hepsi.hisseler).join(", "));
  console.log("  denetim: node scripts/denetim.js " + vaultAdr + " " + wrapAdr);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
