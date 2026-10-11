"use strict";
/* ===========================================================================
 * dagit.js — deploy the launchpad to Arc
 *
 *   node scripts/dagit.js                 # dry run: plans and prices it
 *   node scripts/dagit.js --uygula        # actually deploys
 *
 * THE CIRCULAR DEPENDENCY, AND HOW IT IS BROKEN
 *   The hook needs the launchpad's address (only the launchpad may add
 *   liquidity) and the launchpad needs the hook's address (it goes into every
 *   PoolKey). Neither can be deployed first in the obvious way.
 *
 *   It is broken with plain CREATE. A contract deployed by an EOA lands at
 *   keccak(rlp(deployer, nonce)), which depends on nothing but the sender and
 *   their transaction count — not on the code, and not on the hook. So the
 *   launchpad's address is computed BEFORE anything is sent, the hook is
 *   built around it, and the launchpad is then deployed into the slot that
 *   was reserved for it.
 *
 * WHY THE HOOK ADDRESS HAS TO BE MINED
 *   Uniswap v4 reads a hook's permissions from the low 14 bits of its own
 *   address and refuses a pool whose hook does not declare the callbacks it
 *   implements. This hook needs four: beforeAddLiquidity,
 *   beforeRemoveLiquidity, afterSwap and afterSwapReturnDelta — bit pattern
 *   0xa44. A normal deployment cannot choose its address, so the hook goes
 *   out through a CREATE2 factory with a salt searched until the resulting
 *   address ends in those bits. Measured: a few thousand tries, well under a
 *   second.
 *
 * SAFETY
 *   Dry run by default. The plan is printed with real gas estimates taken
 *   from the chain, and nothing is sent without --uygula.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const {
  Wallet, JsonRpcProvider, ContractFactory, AbiCoder,
  keccak256, getCreate2Address, getCreateAddress
} = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
/* Deterministic CREATE2 factory, same address on most chains. */
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

const HOLD_PERIOD = 24 * 60 * 60;

const UYGULA = process.argv.includes("--uygula");
const coder = AbiCoder.defaultAbiCoder();
const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));

/* Required hook capability bits — see the note above. */
const GEREKEN = (1 << 11) | (1 << 9) | (1 << 6) | (1 << 2); // 0xa44

/* Arc's USDC in ERC20 form — six decimals, which is the fact this project
 * learned the hard way. Every launch pool is priced in it, so a buyer needs
 * nothing but the dollars they already hold. Pairing a launch against its
 * own collateral instead meant a buyer first had to obtain a wrapped share,
 * of which 0.0127 existed. */
const USDC = process.env.USDC || "0x3600000000000000000000000000000000000000";

/* What every launch opens at, for the whole supply, in USDC's own units.
 * Six decimals, so $1,500 is 1_500_000_000 — the figure this project got
 * wrong once already by assuming eighteen. */
const ACILIS_MCAP = BigInt(process.env.ACILIS_MCAP || 1500) * 1000000n;
const MASKE = (1 << 14) - 1;

/* Sign here, submit through rpc() so the retry applies to the send as
 * well as to the reads. "already known" means the node took it on an
 * earlier attempt and answered late — that is success, not failure. */
async function gonderHam(cuzdan, tx, ad) {
  const imzali = await cuzdan.signTransaction(tx);
  let hash;
  try {
    hash = await rpc("eth_sendRawTransaction", [imzali]);
  } catch (e) {
    if (!/already known|nonce too low/i.test(String(e.message))) throw e;
    const { keccak256: kk } = require("ethers");
    hash = kk(imzali);
    console.log("    (zaten dugumde)");
  }
  console.log("    " + ad + " -> " + hash);
  for (let i = 0; i < 80; i++) {
    let rc = null;
    try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
    if (rc) {
      const ok = rc.status === "0x1";
      console.log("    blok " + parseInt(rc.blockNumber, 16) + (ok ? "" : "   BASARISIZ"));
      if (!ok) throw new Error(ad + " zincirde basarisiz oldu");
      return rc;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("makbuz gelmedi: " + hash);
}

/* The public endpoint throttles. A throttled estimate is not a reason to
 * abandon a deployment plan, so it is waited out. */
async function rpc(method, params) {
  let bekle = 1200;
  for (let i = 0; ; i++) {
    try { return await rpcHam(method, params); }
    catch (e) {
      if (!/rate limit|429|503|timeout/i.test(String(e.message)) || i >= 6) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 15000);
    }
  }
}

function rpcHam(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname, method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try {
          const j = JSON.parse(b);
          if (j.error) return rej(new Error(j.error.message));
          res(j.result);
        } catch (e) { rej(new Error("HTTP " + s.statusCode)); }
      });
    });
    r.on("error", rej);
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
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

function madenciligeBasla(initCodeHash) {
  const t0 = Date.now();
  for (let i = 0; i < 5_000_000; i++) {
    const salt = "0x" + i.toString(16).padStart(64, "0");
    const a = getCreate2Address(CREATE2_FACTORY, salt, initCodeHash);
    if ((parseInt(a.slice(-4), 16) & MASKE) === GEREKEN) {
      return { salt, adres: a, deneme: i + 1, ms: Date.now() - t0 };
    }
  }
  return null;
}

(async function main() {
  const HOOK = B("ArcLaunchHook");
  const LP = B("Launchpad");

  console.log("ARC LAUNCHPAD DAGITIMI");
  console.log("  rpc          " + RPC);
  console.log("  poolManager  " + POOL_MANAGER);
  console.log("  kip          " + (UYGULA ? "UYGULA (gercek islem)" : "KURU CALISMA"));
  console.log("");

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }

  const saglayici = new JsonRpcProvider(RPC, { chainId: CHAIN_ID, name: "arc" }, { staticNetwork: true });
  const cuzdan = new Wallet(pk, saglayici);
  const nonce = Number(await rpc("eth_getTransactionCount", [cuzdan.address, "latest"]));
  const bakiye = BigInt(await rpc("eth_getBalance", [cuzdan.address, "latest"]));

  console.log("  cuzdan  " + cuzdan.address);
  console.log("  bakiye  " + (Number(bakiye) / 1e18).toFixed(6) + " USDC");
  console.log("  nonce   " + nonce);
  console.log("");

  /* The hook goes out through the factory, which does not consume the EOA's
   * nonce for the deployed contract — but the transaction to the factory
   * does. So the launchpad, sent next, lands on nonce + 1. */
  const hookVarMi = async (a) => {
    const k = await rpc("eth_getCode", [a, "latest"]);
    return !!k && k !== "0x";
  };
  const kodVarMi = async (a) => {
    const k = await rpc("eth_getCode", [a, "latest"]);
    return !!k && k !== "0x";
  };

  /* The treasury goes first: the hook needs its address, and the hook has
     to be mined before anything is sent. */
  const HZ = B("Hazine");
  const G = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-yonetisim.json"), "utf8"));
  const ROUTER = process.env.ROUTER || "0x7550058C3F4D8839eBc8AcCB96959Fe69C109581";
  /* Reused if one already exists. One treasury, however many times the
     hook and the launchpad are replaced: it holds assets and is governed by
     a contract that does not change, so a second one would only scatter the
     fees. */
  const D0 = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim.json"), "utf8")); }
    catch (e) { return {}; }
  })();
  let hazineAdres = D0.hazine || null;
  let hazineVar = false;
  if (hazineAdres) {
    const k = await rpc("eth_getCode", [hazineAdres, "latest"]);
    hazineVar = !!k && k !== "0x";
  }
  const hazineNonce = nonce;
  if (!hazineVar) hazineAdres = getCreateAddress({ from: cuzdan.address, nonce: hazineNonce });
  const hazineInit = HZ.bytecode + coder.encode(
    ["address", "address", "address"], [G.governor, USDC, ROUTER]).slice(2);

  let lpNonce = nonce + (hazineVar ? 1 : 2);
  let lpAdres = getCreateAddress({ from: cuzdan.address, nonce: lpNonce });
  console.log("  hazine" + (hazineVar ? " (mevcut, yeniden kullaniliyor): " : " adresi onceden hesaplandi:    ") +
    hazineAdres + (hazineVar ? "" : "  (nonce " + hazineNonce + ")"));
  console.log("  launchpad adresi onceden hesaplandi: " + lpAdres + "  (nonce " + lpNonce + ")");

  /* Reward sinks. The holder and dev pools are per-launch contracts created
   * by the launchpad, so the hook's global sinks point at the launchpad
   * itself for liquidity and at our address for the protocol share. */
  /* Built from the ABI by argument NAME, never from a positional list.

     A positional list is what put the launchpad's address into the hook's
     `quote` slot: the constructor had shrunk from six arguments to three
     and the list had not, so the third word of a stale list became the
     quote asset. Nothing complained — extra constructor calldata is
     ignored — and the hook went live mis-wired.

     Now a name this map does not know, or a name the constructor stops
     asking for, stops the deployment. */
  const kurucuArgs = (yapit, deger, ad) => {
    const c = (yapit.abi || []).find((x) => x.type === "constructor");
    const girdiler = c ? c.inputs : [];
    const eksik = girdiler.map((g) => g.name).filter((k) => !(k in deger));
    if (eksik.length) {
      console.log("");
      console.log("  DURDURULDU: " + ad + " kurucusu bilmedigim argüman istiyor: " + eksik.join(", "));
      console.log("  dagit.js guncellenmeden dagitim yapilamaz.");
      process.exit(1);
    }
    const fazla = Object.keys(deger).filter((k) => !girdiler.some((g) => g.name === k));
    if (fazla.length) {
      console.log("  not: " + ad + " kurucusu artik bunlari istemiyor, atlandi: " + fazla.join(", "));
    }
    console.log("  " + ad + " kurucusu (" + girdiler.length + " arg): " +
      girdiler.map((g) => g.name + "=" + String(deger[g.name]).slice(0, 10)).join("  "));
    return coder.encode(girdiler.map((g) => g.type), girdiler.map((g) => deger[g.name])).slice(2);
  };

  const hookDegerleri = (lp) => ({
    _poolManager: POOL_MANAGER,
    _launchpad: lp,
    _quote: USDC
  });

  const hookArgs = kurucuArgs(HOOK, hookDegerleri(lpAdres), "hook");
  const hookInit = HOOK.bytecode + hookArgs;
  let madencilik = madenciligeBasla(keccak256(hookInit));
  if (!madencilik) { console.log("hook adresi bulunamadi"); process.exit(1); }

  let hookHazir = await hookVarMi(madencilik.adres);
  if (!hookHazir) {
    const altAdres = getCreateAddress({ from: cuzdan.address, nonce: nonce + (hazineVar ? 0 : 1) });
    const altArgs = kurucuArgs(HOOK, hookDegerleri(altAdres), "hook (alternatif nonce)");
    const alt = madenciligeBasla(keccak256(HOOK.bytecode + altArgs));
    if (alt && (await hookVarMi(alt.adres))) {
      console.log("  DEVAM: hook zaten dagitilmis, yalnizca launchpad eksik");
      madencilik = alt;
      hookHazir = true;
      lpNonce = nonce + (hazineVar ? 0 : 1);
      lpAdres = altAdres;
    }
  } else {
    console.log("  hook zaten bu adreste, yeniden dagitilmayacak");
  }

  console.log("  hook adresi madencilikle bulundu:    " + madencilik.adres);
  console.log("    salt      " + madencilik.salt);
  console.log("    deneme    " + madencilik.deneme.toLocaleString("en-US") + "   (" + madencilik.ms + " ms)");
  console.log("    bitler    0x" + (parseInt(madencilik.adres.slice(-4), 16) & MASKE).toString(16) +
    "   gereken 0x" + GEREKEN.toString(16));
  console.log("");

  /* The two fee sinks. The protocol share is ours. The outside-developer
     share has no contract of its own yet, so for this deployment it goes
     to the same address and is reported as such rather than hidden — the
     collateral in play is the worthless test token, and pointing it at a
     contract that does not exist would silently burn the slice. */
  /* devSink RECEIVES NOTHING, and that is the point of passing zero.

     The launch fee used to split three ways: 30% to the floor, 30% to an
     outside developer pool, 40% to the protocol. The developer slice was
     not spent, it was stranded — DevPool.pay requires
     msg.sender == governor, that governor votes with a token that was
     abandoned, and nothing is staked, so nothing can ever be proposed and
     nothing can ever come out. Thirty per cent of every launch fee would
     have been burned into a contract nobody can open.

     So Launchpad._payFee sends 60% to the floor and 40% to the protocol,
     and devSink is no longer on the money path. It stays as a published
     immutable precisely so anyone can check it is empty. Pointing it at
     the dead pool would suggest it still gets paid; zero cannot be
     misread. */
  const DEV_SINK = process.env.DEV_SINK || "0x0000000000000000000000000000000000000000";
  /* Not the deploying wallet. A protocol fee that lands in a personal
     address is a withdrawal wearing a protocol's name. */
  const PROTO_SINK = hazineAdres;

  const lpArgs = kurucuArgs(LP, {
    _poolManager: POOL_MANAGER,
    _hook: madencilik.adres,
    _quote: USDC,
    _holdPeriod: HOLD_PERIOD,
    _devSink: DEV_SINK,
    _protocolSink: PROTO_SINK
  }, "launchpad");
  const lpInit = LP.bytecode + lpArgs;

  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const tahmin = async (data, to) => {
    try {
      return BigInt(await rpc("eth_estimateGas", [to ? { from: cuzdan.address, to, data } : { from: cuzdan.address, data }]));
    } catch (e) { return 0n; }
  };

  /* The factory takes salt ++ initcode as raw calldata. */
  const factoryData = madencilik.salt + hookInit.slice(2);
  const hookGas = await tahmin(factoryData, CREATE2_FACTORY);
  const lpGas = await tahmin(lpInit);
  const usd = (g) => (Number(g * gasPrice) / 1e18).toFixed(5);

  console.log("  hook (CREATE2)   " + Number(hookGas).toLocaleString("en-US").padStart(10) + " gas   " + usd(hookGas) + " USDC");
  console.log("  launchpad        " + Number(lpGas).toLocaleString("en-US").padStart(10) + " gas   " + usd(lpGas) + " USDC");
  console.log("  " + "".padEnd(17) + "----------");
  console.log("  TOPLAM           " + Number(hookGas + lpGas).toLocaleString("en-US").padStart(10) + " gas   " + usd(hookGas + lpGas) + " USDC");
  console.log("");
  console.log("  acilis fiyati         musterinin odedigi para / arz — secilmiyor");
  console.log("  ucret adresleri");
  console.log("    gelistirici  " + DEV_SINK + "   (ODEME ALMIYOR: ucretin %60 tabana, %40 protokole)");
  console.log("    protokol     " + PROTO_SINK);
  console.log("");

  if (!UYGULA) {
    console.log("  kuru calisma: hicbir sey gonderilmedi.");
    console.log("  gercekten dagitmak icin: node scripts/dagit.js --uygula");
    return;
  }

  if ((!hookHazir && hookGas === 0n) || lpGas === 0n) {
    console.log("  gas tahmini alinamadi — dagitim durduruldu.");
    process.exit(1);
  }

  /* First, because the hook's protocol sink is its address and the hook is
     already mined around it. */
  const hazineKodu = await rpc("eth_getCode", [hazineAdres, "latest"]);
  if (!hazineKodu || hazineKodu === "0x") {
    console.log("  hazine gonderiliyor...");
    await gonderHam(cuzdan, {
      chainId: CHAIN_ID, nonce: hazineNonce, data: hazineInit,
      gasLimit: 900000n, gasPrice, value: 0n
    }, "hazine");
    const k = await rpc("eth_getCode", [hazineAdres, "latest"]);
    if (!k || k === "0x") { console.log("    HAZINE ADRESINDE KOD YOK — durduruldu"); process.exit(1); }
    console.log("    " + hazineAdres + "   " + ((k.length - 2) / 2).toLocaleString("en-US") + " bayt");
  } else {
    console.log("  hazine yerinde, dagitim atlandi");
  }

  if (!hookHazir) {
    console.log("  hook gonderiliyor...");
    await gonderHam(cuzdan, {
      chainId: CHAIN_ID, nonce: lpNonce - 1, to: CREATE2_FACTORY, data: factoryData,
      gasLimit: (hookGas * 13n) / 10n, gasPrice, value: 0n
    }, "hook");
  } else {
    console.log("  hook yerinde, dagitim atlandi");
  }

  const hookKod = await rpc("eth_getCode", [madencilik.adres, "latest"]);
  if (!hookKod || hookKod === "0x") { console.log("    HOOK ADRESINDE KOD YOK — durduruldu"); process.exit(1); }
  console.log("    hook kodu dogrulandi: " + ((hookKod.length - 2) / 2).toLocaleString("en-US") + " bayt");

  console.log("  launchpad gonderiliyor...");
  await gonderHam(cuzdan, {
    chainId: CHAIN_ID, nonce: lpNonce, data: lpInit,
    gasLimit: (lpGas * 13n) / 10n, gasPrice, value: 0n
  }, "launchpad");
  const gercekLp = lpAdres;
  const lpKod = await rpc("eth_getCode", [gercekLp, "latest"]);
  if (!lpKod || lpKod === "0x") { console.log("    LAUNCHPAD ADRESINDE KOD YOK — durduruldu"); process.exit(1); }
  console.log("    " + gercekLp + "   " + ((lpKod.length - 2) / 2).toLocaleString("en-US") + " bayt");

  if (gercekLp.toLowerCase() !== lpAdres.toLowerCase()) {
    console.log("");
    console.log("  UYARI: launchpad onceden hesaplanan adrese inmedi.");
    console.log("  hook yanlis bir launchpad adresine bagli — bu dagitim KULLANILAMAZ.");
    process.exit(1);
  }

  /* ---- burn the only privileged function that is left -------------

     setQueue is write-once and callable only by the deploying wallet, and
     all it can do is name an address whose launches pay no fee. It cannot
     touch a vault. But it is the last function in this system that anybody
     holds a key to, and a one-shot key that is never fired is still a key
     somebody can be pressured over or can lose control of.

     So it is fired here, at a dead address. queue != address(0) from that
     moment on, so setQueue reverts with QueueAlreadySet forever, and the
     address it names has no private key so it can never launch. After this
     transaction there is no privileged call left anywhere: no owner, no
     setter, no pause, no upgrade.

     The dead address is Ethereum's conventional burn marker rather than
     0x0, because `queue != address(0)` is exactly the test that locks the
     function — naming zero would leave it open. */
  /* READ THE WIRING BACK. The mis-wired hook passed every check this
     script had — the code was at the mined address, the bits were right,
     the launchpad landed where it was reserved — because none of them
     asked what the immutables actually say. Now they are read from the
     chain, by selector taken from the ABI rather than guessed. A guessed
     selector is how the first run of the setQueue check reverted on a
     successful transaction. */
  {
    const { Interface } = require("ethers");
    const hIface = new Interface(HOOK.abi);
    const lIface = new Interface(LP.abi);
    const cagir = async (ifc, adr, fn) => ifc.decodeFunctionResult(
      fn, await rpc("eth_call", [{ to: adr, data: ifc.encodeFunctionData(fn, []) }, "latest"]))[0];

    const beklenen = [
      ["hook.poolManager", () => cagir(hIface, madencilik.adres, "poolManager"), POOL_MANAGER],
      ["hook.launchpad",   () => cagir(hIface, madencilik.adres, "launchpad"),   gercekLp],
      ["hook.quote",       () => cagir(hIface, madencilik.adres, "quote"),       USDC],
      ["lp.hook",          () => cagir(lIface, gercekLp, "hook"),                madencilik.adres],
      ["lp.quote",         () => cagir(lIface, gercekLp, "quote"),               USDC],
      ["lp.protocolSink",  () => cagir(lIface, gercekLp, "protocolSink"),        PROTO_SINK]
    ];
    console.log("  zincirdeki baglanti okunuyor...");
    let bozuk = 0;
    for (const [ad, al, bekle] of beklenen) {
      let v;
      try { v = String(await al()); } catch (e) { v = "OKUNAMADI: " + e.message.slice(0, 40); }
      const tamam = v.toLowerCase() === String(bekle).toLowerCase();
      if (!tamam) bozuk++;
      console.log("    " + (tamam ? "ok  " : "YANLIS  ") + ad.padEnd(16) + v +
        (tamam ? "" : "   beklenen " + bekle));
    }
    if (bozuk) {
      console.log("");
      console.log("  DAGITIM KULLANILAMAZ: " + bozuk + " baglanti yanlis. dagitim.json yazilmadi.");
      process.exit(1);
    }
  }

  const OLU_KUYRUK = "0x000000000000000000000000000000000000dEaD";
  {
    const { Interface: If2 } = require("ethers");
    const lpI = new If2(LP.abi);
    /* Taken from the ABI. The first version of this hardcoded 0xd33219b4
       for queue(), which is some other function's selector entirely — the
       real one is 0xe10d29ee — so the pre-check reverted, was swallowed by
       the catch, and the post-check reverted the whole script AFTER the
       transaction had already succeeded. */
    const mevcut = await rpc("eth_call", [
      { to: gercekLp, data: lpI.encodeFunctionData("queue", []) }, "latest"
    ]).catch(() => null);
    const bos = !mevcut || /^0x0*$/.test(mevcut);
    if (bos) {
      console.log("  setQueue yakiliyor (son ayricalikli fonksiyon)...");
      const iface = new (require("ethers").Interface)(["function setQueue(address)"]);
      const sqGas = await tahmin(iface.encodeFunctionData("setQueue", [OLU_KUYRUK]), gercekLp);
      await gonderHam(cuzdan, {
        chainId: CHAIN_ID, nonce: await rpc("eth_getTransactionCount", [cuzdan.address, "pending"]).then((x) => parseInt(x, 16)),
        to: gercekLp, data: iface.encodeFunctionData("setQueue", [OLU_KUYRUK]),
        gasLimit: ((sqGas || 60000n) * 13n) / 10n, gasPrice, value: 0n
      }, "setQueue(0x..dEaD)");
      const sonra = await rpc("eth_call", [
        { to: gercekLp, data: lpI.encodeFunctionData("queue", []) }, "latest"]);
      const yazdi = sonra && sonra.toLowerCase().endsWith("dead");
      console.log(yazdi
        ? "    yakildi: setQueue bir daha cagrilamaz, anahtar kalmadi"
        : "    UYARI: queue() beklenen adresi dondurmedi -> " + sonra);
      if (!yazdi) process.exit(1);
    } else {
      console.log("  setQueue zaten yazilmis: " + mevcut.slice(-40));
    }
  }

  /* Merged, not replaced. Everything this script does not know about —
     the router, the bridge wiring, anything added later — has to survive a
     redeploy, and relying on remembering to re-add it is how the router
     address was lost twice. */
  const yol = path.join(__dirname, "..", "dagitim.json");
  let cikti = {};
  try { cikti = JSON.parse(fs.readFileSync(yol, "utf8")); } catch (e) { /* first run */ }

  /* The launchpad being replaced is not retired: its launches keep trading
     on their own pools forever. Recording it is what keeps them findable. */
  const gecmis = Array.isArray(cikti.gecmisLaunchpadlar) ? cikti.gecmisLaunchpadlar : [];
  if (cikti.launchpad && cikti.launchpad.toLowerCase() !== gercekLp.toLowerCase() &&
      !gecmis.some((x) => x.toLowerCase() === cikti.launchpad.toLowerCase())) {
    gecmis.unshift(cikti.launchpad);
  }

  Object.assign(cikti, {
    zincir: "arc", chainId: CHAIN_ID,
    hook: madencilik.adres, salt: madencilik.salt, usdc: USDC,
    hazine: hazineAdres,
    launchpad: gercekLp, poolManager: POOL_MANAGER,
    devSink: DEV_SINK, protocolSink: PROTO_SINK,
    holdPeriod: HOLD_PERIOD, gecmisLaunchpadlar: gecmis,
    zaman: new Date().toISOString()
  });
  fs.writeFileSync(yol, JSON.stringify(cikti, null, 1));
  console.log("");
  console.log("  dagitim.json yazildi");
  console.log("  TAMAM");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
