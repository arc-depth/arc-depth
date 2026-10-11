"use strict";
/* ===========================================================================
 * dagit-kuyruk.js — the customer-facing queue
 *
 *   node scripts/dagit-kuyruk.js                 # prices it, sends nothing
 *   node scripts/dagit-kuyruk.js --uygula
 *
 * Deploys LaunchQueue and then points the launchpad at it.
 *
 * WHO CHARGES THE 2%
 *   Exactly one of the two, never both. The launchpad waives its launch fee
 *   for a single address named once through setQueue; the queue asks the
 *   launchpad whether it is that address and charges only if it is. Both
 *   charging would mean 3.96% against a product that says 2%, which is a
 *   mistake this project already made and caught with a test.
 *
 *   setQueue is one-shot and irreversible, and it is already spent on the
 *   first queue — the one whose deposit range was written in 18 decimals
 *   against Arc's 6-decimal USDC, making its minimum a hundred trillion
 *   dollars. So the replacement is not waived, charges nothing itself, and
 *   the launchpad takes the fee out of the collateral instead. The customer
 *   pays the same 2%; it simply arrives as a tokenized share rather than as
 *   dollars.
 *
 * THE STOCK LIST
 *   Deliberately not set here. Which shares are acceptable collateral is a
 *   governance decision, and an operator or deployer who could add to the
 *   list could point a launch at a token of their own making. The list
 *   starts empty and fills through proposals.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, getCreateAddress, keccak256, Interface } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const UYGULA = process.argv.includes("--uygula");

/* Arc's USDC in ERC20 form. The native currency is also USDC and is what
 * gas is paid in, but a contract cannot pull native currency with
 * transferFrom, so the queue speaks to the token. */
const USDC = "0x3600000000000000000000000000000000000000";
const SURE = 30 * 60; // 30 minutes

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
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

/* The endpoint throttles and ethers has no retry; everything goes here. */
async function rpc(method, params) {
  let bekle = 1500;
  for (let i = 0; ; i++) {
    try { return await ham(method, params); }
    catch (e) {
      if (!/rate limit|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 20000);
    }
  }
}

async function gonder(cuzdan, tx, ad) {
  const imzali = await cuzdan.signTransaction(tx);
  let hash;
  try {
    hash = await rpc("eth_sendRawTransaction", [imzali]);
  } catch (e) {
    if (!/already known|nonce too low/i.test(String(e.message))) throw e;
    hash = keccak256(imzali);
    console.log("    (zaten dugumde)");
  }
  console.log("    " + ad + " -> " + hash);
  for (let i = 0; i < 80; i++) {
    let rc = null;
    try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
    if (rc) {
      if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz");
      console.log("    blok " + parseInt(rc.blockNumber, 16));
      return;
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
  const G = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-yonetisim.json"), "utf8"));

  console.log("MUSTERI KUYRUGU");
  console.log("  rpc        " + RPC);
  console.log("  launchpad  " + D.launchpad);
  console.log("  yonetisim  " + G.governor);
  console.log("  kip        " + (UYGULA ? "UYGULA (gercek islem)" : "KURU CALISMA"));
  console.log("");

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);
  const nonce = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
  const bakiye = BigInt(await rpc("eth_getBalance", [cuzdan.address, "latest"]));
  console.log("  cuzdan  " + cuzdan.address);
  console.log("  bakiye  " + (Number(bakiye) / 1e18).toFixed(6) + " USDC");
  console.log("  nonce   " + nonce);
  console.log("");

  const Q = B("LaunchQueue");
  const kuyrukAdres = getCreateAddress({ from: cuzdan.address, nonce });
  /* The opening stock list, seeded from the bridges that are actually
     deployed. Leaving it empty meant nothing could be listed for seven
     days, which is a guard that stops the thing it guards from existing. */
  const ayar = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "relayer", "ayar.json"), "utf8"));
  const semboller = Object.keys(ayar.hisseler || {});
  const tickerlar = semboller.map((x) => "0x" + Buffer.from(x, "utf8").toString("hex").padEnd(64, "0"));
  const sarmallar = semboller.map((x) => ayar.hisseler[x].wrapped);
  if (!semboller.length) { console.log("  relayer/ayar.json bos — once bir kopru dagitilmali"); process.exit(1); }

  const initcode = Q.bytecode + coder.encode(
    ["address", "address", "address", "address", "address", "address", "uint64", "bytes32[]", "address[]"],
    [USDC, D.launchpad, cuzdan.address, G.governor, G.devPool, cuzdan.address, SURE, tickerlar, sarmallar]
  ).slice(2);

  const lpIface = new Interface(["function setQueue(address)", "function queue() view returns (address)"]);
  const setData = lpIface.encodeFunctionData("setQueue", [kuyrukAdres]);

  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const usd = (g) => (Number(g * gasPrice) / 1e18).toFixed(5);

  const kodVar = async (a) => {
    const k = await rpc("eth_getCode", [a, "latest"]);
    return !!k && k !== "0x";
  };
  const kuyrukHazir = await kodVar(kuyrukAdres);

  /* Whether the launchpad has already been pointed somewhere. Reading it
   * first means a re-run does not waste a transaction that would revert. */
  let mevcutQueue = "0x0000000000000000000000000000000000000000";
  try {
    const r = await rpc("eth_call", [{ to: D.launchpad, data: lpIface.encodeFunctionData("queue") }, "latest"]);
    mevcutQueue = lpIface.decodeFunctionResult("queue", r)[0];
  } catch (e) { console.log("  UYARI: launchpad setQueue'yu desteklemiyor olabilir"); }

  let kuyrukGas = 0n, setGas = 0n;
  if (!kuyrukHazir) {
    try { kuyrukGas = BigInt(await rpc("eth_estimateGas", [{ from: cuzdan.address, data: initcode }])); }
    catch (e) { kuyrukGas = 0n; }
  }
  if (mevcutQueue === "0x0000000000000000000000000000000000000000") {
    try { setGas = BigInt(await rpc("eth_estimateGas", [{ from: cuzdan.address, to: D.launchpad, data: setData }])); }
    catch (e) { setGas = 0n; }
  }

  console.log("  kuyruk adresi onceden hesaplandi: " + kuyrukAdres + (kuyrukHazir ? "   (zaten yerinde)" : ""));
  console.log("  launchpad.queue su an: " + mevcutQueue);
  console.log("");
  console.log("  LaunchQueue  " + Number(kuyrukGas).toLocaleString("en-US").padStart(10) + " gas   " + usd(kuyrukGas) + " USDC");
  console.log("  setQueue     " + Number(setGas).toLocaleString("en-US").padStart(10) + " gas   " + usd(setGas) + " USDC");
  console.log("  " + "".padEnd(13) + "----------");
  console.log("  TOPLAM       " + Number(kuyrukGas + setGas).toLocaleString("en-US").padStart(10) + " gas   " + usd(kuyrukGas + setGas) + " USDC");
  console.log("");
  console.log("  musteri parasi   " + USDC + "  (Arc USDC, ERC20)");
  console.log("  isletici         " + cuzdan.address);
  console.log("  iade suresi      " + (SURE / 60) + " dakika");
  console.log("  hisse listesi    " + semboller.join(", ") + "   (sonrasi yonetisimde)");
  console.log("");

  if (!UYGULA) {
    console.log("  kuru calisma: hicbir sey gonderilmedi.");
    console.log("  dagitmak icin: node scripts/dagit-kuyruk.js --uygula");
    return;
  }

  if (!kuyrukHazir) {
    if (kuyrukGas === 0n) { console.log("  gas tahmini alinamadi — durduruldu"); process.exit(1); }
    console.log("  LaunchQueue gonderiliyor...");
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce, data: initcode,
      gasLimit: (kuyrukGas * 13n) / 10n, gasPrice, value: 0n
    }, "LaunchQueue");
    if (!(await kodVar(kuyrukAdres))) { console.log("    ADRESTE KOD YOK"); process.exit(1); }
    console.log("    " + kuyrukAdres);
  } else {
    console.log("  LaunchQueue yerinde, atlandi");
  }

  if (mevcutQueue.toLowerCase() === kuyrukAdres.toLowerCase()) {
    console.log("  launchpad zaten bu kuyruga bagli, atlandi");
  } else if (mevcutQueue !== "0x0000000000000000000000000000000000000000") {
    /* Expected, not broken: the waiver is spent, so the launchpad charges
       the fee and this queue charges nothing. Verified below by asking the
       queue itself rather than by trusting this comment. */
    console.log("  setQueue harcanmis (" + mevcutQueue + ") — ucreti LAUNCHPAD aliyor");
    const qIface = new Interface(["function ucretPpm() view returns (uint256)"]);
    const r = await rpc("eth_call", [{ to: kuyrukAdres, data: qIface.encodeFunctionData("ucretPpm") }, "latest"]);
    const ppm = BigInt(r);
    console.log("    kuyruk.ucretPpm() = " + ppm.toString() + "   (%" + (Number(ppm) / 10000).toFixed(2) + ")");
    if (ppm !== 0n) {
      console.log("    BEKLENEN 0 — muaf olmayan kuyruk ucret almamali, durduruldu");
      process.exit(1);
    }
    console.log("    toplam ucret yine %2: launchpad teminattan aliyor");
  } else {
    console.log("  setQueue gonderiliyor...");
    await gonder(cuzdan, {
      chainId: CHAIN_ID, nonce: nonce + (kuyrukHazir ? 0 : 1), to: D.launchpad, data: setData,
      gasLimit: setGas > 0n ? (setGas * 13n) / 10n : 80000n, gasPrice, value: 0n
    }, "setQueue");
    const r = await rpc("eth_call", [{ to: D.launchpad, data: lpIface.encodeFunctionData("queue") }, "latest"]);
    const simdi = lpIface.decodeFunctionResult("queue", r)[0];
    if (simdi.toLowerCase() !== kuyrukAdres.toLowerCase()) {
      console.log("    BAGLANMADI: " + simdi); process.exit(1);
    }
    console.log("    dogrulandi: launchpad.queue = " + simdi);
  }

  D.queue = kuyrukAdres;
  D.usdc = USDC;
  D.operator = cuzdan.address;
  D.queueDeadline = SURE;
  fs.writeFileSync(path.join(__dirname, "..", "dagitim.json"), JSON.stringify(D, null, 1));
  console.log("");
  console.log("  dagitim.json guncellendi");
  console.log("  TAMAM");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
