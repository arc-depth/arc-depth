"use strict";
/* ===========================================================================
 * dagit-fathom.js — Fathom (FTHM): the second attempt, without the curve.
 *
 *   node scripts/dagit-fathom.js             plan, mine the hook, verify gas
 *   node scripts/dagit-fathom.js --dagit     deploy the six contracts
 *   node scripts/dagit-fathom.js --merdiven  place the three rungs
 *   node scripts/dagit-fathom.js --dogrula   read the whole thing back
 *
 * WHAT CHANGED FROM DEPTH, AND WHY
 *   DEPTH is the same design and it works; what failed was where the
 *   liquidity went. The market's 500,000,000 sat inside a bonding curve
 *   that no wallet can reach, and to get a listing I built a $6 second
 *   curve, bought it out myself, and graduated it. So the venue every
 *   buyer actually lands on held $6, and MetaMask quoted -76.96% on $20.
 *   Measured against Arc's own launchpad tokens, the median graduated pool
 *   holds about $5,500. We were nine hundred times below the chain's floor
 *   because we listed before raising anything.
 *
 *   Fathom removes the step that failed. There is no curve. The market
 *   allocation goes straight into Uniswap as a three-rung, one-sided,
 *   permanently locked ladder, so the pool is the venue from the first
 *   block and a wallet swap is the intended path rather than an accident.
 *
 * WHY IT STILL COSTS NOTHING
 *   v4 asks for the quote asset only for the part of a range below the
 *   price. A range entirely above it is paid for in tokens alone — the
 *   side we have. Buyers' own dollars become the pool's money as they walk
 *   up through the rungs. Measured on the real Arc PoolManager, a $20 buy
 *   quotes -0.04% before fees against Arc's -0.36% median, and a $1,000
 *   buy -1.89% against -15.4%.
 *
 * WHAT IS BEING TRADED AWAY, SAID PLAINLY
 *   Until somebody buys, the pool holds no dollars and therefore cannot
 *   pay a seller. The first dollar of exit liquidity comes from the first
 *   buyer, not from us. At the opening nobody outside holds the token, so
 *   this strands no one — but it belongs on the page, not in a footnote.
 *
 *   And the ladder's reach is bounded by what the tokens are worth. At a
 *   $15,000 opening the whole market allocation is worth about $7,400, so
 *   buys past roughly $5,000 move the price a long way. No arrangement of
 *   ranges invents value that is not there; only growth does.
 *
 * ANTI-SNIPE, AND WHY THERE IS NO TAX
 *   The curve had a decaying snipe tax. The ladder does the same job by
 *   construction: the inner rung is deep enough that the first $4,887 of
 *   buying moves the price only 20%, so the first transaction in the block
 *   cannot get a price the tenth one could not. A tax would add an untested
 *   path to a contract that can never be changed, to buy something the
 *   shape already provides. If that turns out to be wrong it is visible in
 *   the price chart on day one.
 *
 * ORDER
 *   Deploying code commits nothing but gas. Placing a rung is permanent —
 *   the opener has no withdraw and the hook refuses every removal. So the
 *   rungs are behind their own flag, after the plan has been printed and
 *   read.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, Interface, getCreateAddress, getCreate2Address,
        keccak256, id } = require("ethers");
const TM = require("./tickmath.js");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDC = "0x3600000000000000000000000000000000000000";
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const GEREKEN_BITLER = (1 << 11) | (1 << 9) | (1 << 6) | (1 << 2);   // 0xa44
const BIT_MASKE = (1 << 14) - 1;

const DAGIT = process.argv.includes("--dagit");
const MERDIVEN = process.argv.includes("--merdiven");
const DOGRULA = process.argv.includes("--dogrula");

const coder = AbiCoder.defaultAbiCoder();
const KOK = path.join(__dirname, "..");
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const sel = (s) => id(s).slice(0, 10);
const DOSYA = path.join(KOK, "dagitim-fathom.json");

/* ---- the plan ----------------------------------------------------- */
const AD = "Fathom";
const SEMBOL = "FTHM";
const E = 10n ** 18n;
const U6 = 10n ** 6n;

const ARZ = 1_000_000_000n * E;
const PIYASA = 500_000_000n * E;        // straight into the ladder, locked
const STAKE_EMISYON = 400_000_000n * E; // thirty years, ten-year half-life
const KURUCU_SERBEST = 50_000_000n * E;
const KURUCU_VEST = 50_000_000n * E;

/* The three rungs. Inner is deep and narrow for the trades that actually
   happen; outer reaches to the end of the tick range so the price has no
   ceiling. Sizes measured in olc-merdiven.js before being written here. */
const RUNG_IC = 300_000_000n * E;
const RUNG_ORTA = 100_000_000n * E;
const RUNG_DIS = 100_000_000n * E;
const UST_IC = 20;                      // % above the opening
const UST_ORTA = 100;
const SPACING = 60;
const EN_ALT_TICK = -887220;            // MIN_TICK on the 60 grid
const HAVUZ_FEE = 0;                    // the hook charges 0.50% and splits it

/* Opening valuation. Arc's launchpad tokens live between $10k and $100k;
   opening far above that would mean no buyers, and with no capital there
   is no bid below the opening to discover a lower price with. So we open
   where the chain's peers are. */
const ACILIS_FDV = 15_000;

const ANLIK_GERI = 1n;
const OYLAMA = 5n * 86400n;
const TIMELOCK = 2n * 86400n;
const MUHLET = 14n * 86400n;
const NOBETCI_GUN = 365n;

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
    r.setTimeout(90000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 600)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}
function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const p of [path.join("C:", "bot", ".env"), path.join(KOK, ".env")]) {
    try {
      const m = fs.readFileSync(p, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);
const adet = (v) => nf(Number(v) / 1e18);

function hookSaltAra(initCodeHash) {
  const t0 = Date.now();
  for (let i = 0; i < 5_000_000; i++) {
    const salt = "0x" + i.toString(16).padStart(64, "0");
    const a = getCreate2Address(CREATE2_FACTORY, salt, initCodeHash);
    if ((parseInt(a.slice(-4), 16) & BIT_MASKE) === GEREKEN_BITLER)
      return { salt, adres: a, deneme: i + 1, ms: Date.now() - t0 };
  }
  return null;
}

async function gonder(cuzdan, nonce, tx, gasPrice, ad) {
  const g = BigInt(await rpc("eth_estimateGas", [{ from: cuzdan.address, ...tx, value: "0x0" }]));
  const imzali = await cuzdan.signTransaction({
    chainId: CHAIN_ID, nonce, gasPrice, gasLimit: (g * 13n) / 10n, value: 0n, ...tx });
  let hash;
  try { hash = await rpc("eth_sendRawTransaction", [imzali]); }
  catch (e) {
    if (!/already known|nonce too low/i.test(String(e.message))) throw e;
    hash = keccak256(imzali);
  }
  for (let i = 0; i < 120; i++) {
    let rc = null;
    try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* poll */ }
    if (rc) {
      if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz: " + hash);
      console.log("    " + ad.padEnd(18) + hash + "   gaz " + nf(parseInt(rc.gasUsed, 16)));
      return rc;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(ad + " makbuz gelmedi: " + hash);
}

(async function main() {
  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);
  const KURUCU = cuzdan.address;

  let kayit = null;
  try { kayit = JSON.parse(fs.readFileSync(DOSYA, "utf8")); } catch (e) { /* first run */ }

  const nonce = Number(await rpc("eth_getTransactionCount", [KURUCU, "latest"]));
  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const gaz = BigInt(await rpc("eth_getBalance", [KURUCU, "latest"]));

  /* ---- addresses, predicted before any initcode is built ----------- */
  const A = kayit && kayit.token ? kayit : {
    token: getCreateAddress({ from: KURUCU, nonce: nonce + 0 }),
    stake: getCreateAddress({ from: KURUCU, nonce: nonce + 1 }),
    acici: getCreateAddress({ from: KURUCU, nonce: nonce + 2 }),
    /* nonce + 3 is the factory call that places the hook */
    governor: getCreateAddress({ from: KURUCU, nonce: nonce + 4 }),
    vesting: getCreateAddress({ from: KURUCU, nonce: nonce + 5 })
  };

  const hookInit = B("DepthHook").bytecode + coder.encode(
    ["address", "address", "address", "address", "address"],
    [POOL_MANAGER, A.acici, KURUCU, A.stake, USDC]).slice(2);
  const maden = (kayit && kayit.hook)
    ? { salt: kayit.hookSalt, adres: kayit.hook, deneme: 0, ms: 0 }
    : hookSaltAra(keccak256(hookInit));
  if (!maden) { console.log("hook adresi bulunamadi"); process.exit(1); }
  A.hook = maden.adres;
  A.hookSalt = maden.salt;

  /* ---- the ladder's ticks ------------------------------------------ */
  /* FTHM sorts above USDC or below it depending on its address, and that
     decides which side of the price its band lives on. The token is
     deployed at a predicted address, so this is known before anything is
     sent rather than discovered at the opening. */
  const tokenSifirinci = A.token.toLowerCase() < USDC.toLowerCase();
  const fiyat = ACILIS_FDV / 1e9;                       // dollars per token
  /* currency1 price is token-wei per USDC unit; a higher dollar price is a
     lower tick. Snapped onto the grid so the inner rung's top can sit on
     the opening tick itself, with no free gap above it. */
  const hamTick = Math.log(1e12 / fiyat) / Math.log(1.0001);
  const T = Math.round(hamTick / SPACING) * SPACING;
  const tik = (yuzde) => Math.round(Math.log(1 + yuzde / 100) / Math.log(1.0001) / SPACING) * SPACING;
  const IC = T - tik(UST_IC);
  const ORTA = T - tik(UST_ORTA);
  const DIS = EN_ALT_TICK;
  const acilisSqrt = TM.sqrtPriceX96(T);
  const gercekFiyat = (1 / ((Number(acilisSqrt) / 2 ** 96) ** 2)) * 1e12;
  const oran = (t) => 1.0001 ** (T - t);

  console.log("FATHOM — FTHM");
  console.log("");
  console.log("  CUZDAN      " + KURUCU);
  console.log("    gaz       " + usd(Number(gaz) / 1e18, 6) + "   (" + nf(Number(gasPrice) / 1e9, 1) + " gwei)");
  console.log("    nonce     " + nonce);
  console.log("");
  console.log("  DAGILIM     " + adet(ARZ) + " FTHM, mint yok");
  console.log("    piyasa    " + adet(PIYASA).padStart(13) + "   dogrudan Uniswap merdivenine, kalici kilitli");
  console.log("    stake     " + adet(STAKE_EMISYON).padStart(13) + "   30 yil, 10 yillik yarilanma");
  console.log("    kurucu    " + adet(KURUCU_SERBEST).padStart(13) + "   serbest, kurucu cuzdanina");
  console.log("    vesting   " + adet(KURUCU_VEST).padStart(13) + "   12 ay, kurucu cuzdanina");
  console.log("");
  console.log("  ACILIS      " + usd(ACILIS_FDV, 0) + " FDV   ->  $" + gercekFiyat.toExponential(4) + " / FTHM");
  console.log("    tick      " + T + "   (izgaraya oturtuldu; gercek FDV " +
    usd(gercekFiyat * 1e9, 0) + ")");
  console.log("    FTHM currency" + (tokenSifirinci ? "0" : "1") + ", bant fiyatin " +
    (tokenSifirinci ? "USTUNDE" : "ALTINDA") + " (tick olarak)");
  console.log("");
  console.log("  MERDIVEN    hepsi tek yonlu — sifir dolar");
  console.log("    ic        " + adet(RUNG_IC).padStart(13) + "   acilis -> +%" + nf(oran(IC) * 100 - 100, 0) +
    "      [" + IC + ", " + T + "]");
  console.log("    orta      " + adet(RUNG_ORTA).padStart(13) + "   +%" + nf(oran(IC) * 100 - 100, 0) +
    " -> +%" + nf(oran(ORTA) * 100 - 100, 0) + "   [" + ORTA + ", " + IC + "]");
  console.log("    dis       " + adet(RUNG_DIS).padStart(13) + "   +%" + nf(oran(ORTA) * 100 - 100, 0) +
    " -> sonsuz  [" + DIS + ", " + ORTA + "]");
  console.log("");
  console.log("  ADRESLER");
  for (const [k, v] of [["token", A.token], ["stake", A.stake], ["acici", A.acici],
                        ["hook", A.hook], ["governor", A.governor], ["vesting", A.vesting]])
    console.log("    " + k.padEnd(10) + v + (k === "hook"
      ? "   bitler 0x" + (parseInt(A.hook.slice(-4), 16) & BIT_MASKE).toString(16) +
        (maden.deneme ? ", " + nf(maden.deneme) + " denemede" : "")
      : ""));
  console.log("");

  if (PIYASA !== RUNG_IC + RUNG_ORTA + RUNG_DIS) {
    console.log("  HATA: merdiven kademeleri piyasa payini tutmuyor.");
    process.exit(1);
  }
  if (ARZ !== PIYASA + STAKE_EMISYON + KURUCU_SERBEST + KURUCU_VEST) {
    console.log("  HATA: dagilim arzi tutmuyor.");
    process.exit(1);
  }

  /* ================= deploy ======================================== */
  if (DAGIT) {
    if (kayit && kayit.token) { console.log("  Zaten dagitilmis. --merdiven veya --dogrula."); return; }
    const tahmin = Number(gasPrice) * 11_000_000 / 1e18;
    console.log("  DAGITIM — alti sozlesme, token kilitlenmiyor, tahmini " + usd(tahmin, 4));
    if (Number(gaz) / 1e18 < tahmin * 1.4) { console.log("  GAZ YETMEZ."); process.exit(1); }

    const adimlar = [
      ["Jeton", A.token, B("Jeton").bytecode + coder.encode(
        ["string", "string", "uint256", "address", "uint256", "address", "uint256",
         "address", "uint256", "address", "uint256"],
        [AD, SEMBOL, ARZ, A.acici, PIYASA, A.stake, STAKE_EMISYON,
         KURUCU, KURUCU_SERBEST, A.vesting, KURUCU_VEST]).slice(2)],
      ["Stake", A.stake, B("Stake").bytecode + coder.encode(
        ["address", "address", "uint256", "uint256"],
        [A.token, USDC, STAKE_EMISYON, 0]).slice(2)],
      ["TekYonluAcici", A.acici, B("TekYonluAcici").bytecode + coder.encode(
        ["address", "address", "address", "address", "uint24", "int24", "address"],
        [POOL_MANAGER, A.token, USDC, A.hook, HAVUZ_FEE, SPACING, KURUCU]).slice(2)],
      ["DepthHook", A.hook, maden.salt + hookInit.slice(2), CREATE2_FACTORY],
      ["DepthGovernor", A.governor, B("DepthGovernor").bytecode + coder.encode(
        ["address", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],
        [A.stake, KURUCU, NOBETCI_GUN, OYLAMA, TIMELOCK, MUHLET, ANLIK_GERI]).slice(2)],
      ["Vesting", A.vesting, B("Vesting").bytecode + coder.encode(
        ["address", "address", "uint256", "uint256"],
        [A.token, KURUCU, KURUCU_VEST, 0]).slice(2)]
    ];

    let n = nonce;
    for (const [ad, beklenen, data, hedef] of adimlar) {
      const rc = await gonder(cuzdan, n++, hedef ? { to: hedef, data } : { data }, gasPrice, ad);
      const kod = await rpc("eth_getCode", [beklenen, "latest"]);
      if (kod.length <= 2) throw new Error(ad + " tahmin edilen adreste yok: " + beklenen);
      if (!hedef && rc.contractAddress &&
          rc.contractAddress.toLowerCase() !== beklenen.toLowerCase())
        throw new Error(ad + " adres sapti: " + rc.contractAddress + " != " + beklenen);
    }

    A.zincir = "arc"; A.chainId = CHAIN_ID; A.ad = AD; A.sembol = SEMBOL;
    A.usdc = USDC; A.poolManager = POOL_MANAGER; A.kurucu = KURUCU;
    A.arz = ARZ.toString(); A.piyasa = PIYASA.toString();
    A.stakeEmisyon = STAKE_EMISYON.toString();
    A.kurucuSerbest = KURUCU_SERBEST.toString(); A.kurucuVesting = KURUCU_VEST.toString();
    A.acilisTick = T; A.acilisFdv = ACILIS_FDV; A.fee = HAVUZ_FEE; A.spacing = SPACING;
    A.merdiven = [{ ad: "ic", tick: IC, token: RUNG_IC.toString() },
                  { ad: "orta", tick: ORTA, token: RUNG_ORTA.toString() },
                  { ad: "dis", tick: DIS, token: RUNG_DIS.toString() }];
    A.not = "Egri yok: piyasa payi dogrudan Uniswap v4'te uc kademeli, tek yonlu, " +
            "kalici kilitli merdiven olarak duruyor. Havuza hicbir dolar konmadi.";
    A.zaman = new Date().toISOString();
    fs.writeFileSync(DOSYA, JSON.stringify(A, null, 1) + "\n");
    console.log("");
    console.log("  dagitim-fathom.json yazildi. Siradaki: --merdiven");
    return;
  }

  if (!kayit || !kayit.token) {
    console.log("  Henuz dagitilmadi. --dagit ile basla.");
    return;
  }

  /* ================= the ladder ==================================== */
  const aciciIface = new Interface([
    "function ac(uint160 sqrtPriceX96,int24 alt,int24 ust,uint256 miktar) returns (uint256)",
    "function genislet(int24 yeniKenar,uint256 miktar) returns (uint128)"
  ]);

  if (MERDIVEN) {
    if (kayit.havuzId) { console.log("  Merdiven zaten kuruldu. --dogrula."); return; }
    const bakiye = BigInt(await rpc("eth_call", [{ to: A.token,
      data: sel("balanceOf(address)") + coder.encode(["address"], [A.acici]).slice(2) }, "latest"]));
    console.log("  acicidaki FTHM  " + adet(bakiye));
    if (bakiye < PIYASA) { console.log("  Piyasa payi acicida degil."); process.exit(1); }

    /* The opening price is named as a tick and converted on chain, so the
       band's top and the price land on the same tick exactly. */
    /* Exact, because the inner rung's top IS this tick. The float form
       lands on 387419 instead of 387420 and ac() would revert on a band
       top sitting above the price; tickmath.js checks the conversion both
       directions before it is trusted. */
    const sqrt = TM.sqrtPriceX96(T);
    if (TM.tickAt(sqrt) !== T) { console.log("  HATA: tick donusumu tutmadi."); process.exit(1); }

    console.log("");
    console.log("  MERDIVEN KURULUYOR — buradan sonrasi KALICI");
    let n = nonce;
    await gonder(cuzdan, n++, { to: A.acici,
      data: aciciIface.encodeFunctionData("ac", [sqrt, IC, T, RUNG_IC]) }, gasPrice, "ic kademe");
    await gonder(cuzdan, n++, { to: A.acici,
      data: aciciIface.encodeFunctionData("genislet", [ORTA, RUNG_ORTA]) }, gasPrice, "orta kademe");
    await gonder(cuzdan, n++, { to: A.acici,
      data: aciciIface.encodeFunctionData("genislet", [DIS, RUNG_DIS]) }, gasPrice, "dis kademe");

    kayit.havuzId = await rpc("eth_call", [{ to: A.acici, data: sel("havuzId()") }, "latest"]);
    kayit.likidite = BigInt(await rpc("eth_call",
      [{ to: A.acici, data: sel("likidite()") }, "latest"])).toString();
    kayit.acilisSqrtPriceX96 = sqrt.toString();
    kayit.merdivenZamani = new Date().toISOString();
    fs.writeFileSync(DOSYA, JSON.stringify(kayit, null, 1) + "\n");
    console.log("");
    console.log("    havuzId   " + kayit.havuzId);
    console.log("    likidite  " + kayit.likidite);
    console.log("");
    console.log("  Siradaki: --dogrula, sonra cuzdandan gercek bir alim.");
    return;
  }

  console.log("  Komutlar:  --dagit   --merdiven   --dogrula");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });

