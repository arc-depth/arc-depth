"use strict";
/* ===========================================================================
 * dagit-depth.js — deploy Arc Depth, in one pass, with nothing guessed.
 *
 *   node scripts/dagit-depth.js                 dry run, prints the plan
 *   node scripts/dagit-depth.js --uygula        send it
 *
 * THE ORDERING PROBLEM, AND WHY CREATE2 IS NOT NEEDED
 *   Three of these contracts need each other's addresses at construction.
 *   The token credits 900,000,000 to the curve, the curve has to know where
 *   it will graduate to, and the pool opener has to know which curve is
 *   allowed to call it. None of them can be deployed first.
 *
 *   But an address from CREATE is just keccak(sender, nonce), so all of
 *   them can be computed before any of them exists. The deployment is a
 *   plain sequence of six transactions from one account at known nonces,
 *   and every cross-reference is filled in from the prediction. No salt
 *   mining, no factory, no placeholder to patch afterwards.
 *
 *   The token crediting an address that has no code yet is fine: a balance
 *   is storage, and the curve's bytecode arrives in the next transaction.
 *
 * WHAT IS CHECKED AFTER EACH STEP
 *   That code landed at the predicted address, and that the immutables
 *   point where the plan said. A deployment that silently went somewhere
 *   else is how 300,000,000 tokens ended up unreachable, so the script
 *   refuses to continue rather than carrying on and writing a manifest
 *   that reads correctly.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, getCreateAddress, getCreate2Address, keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const USDC = "0x3600000000000000000000000000000000000000";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
/* Deterministic CREATE2 factory, the same address on most chains. */
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
/* The callbacks this hook declares, in the low bits of its own address:
   beforeAddLiquidity | beforeRemoveLiquidity | afterSwap |
   afterSwapReturnDelta. v4 reads the address to know what to call. */
const GEREKEN_BITLER = (1 << 11) | (1 << 9) | (1 << 6) | (1 << 2);   // 0xa44
const BIT_MASKE = (1 << 14) - 1;

function hookSaltAra(initCodeHash) {
  const t0 = Date.now();
  for (let i = 0; i < 5_000_000; i++) {
    const salt = "0x" + i.toString(16).padStart(64, "0");
    const a = getCreate2Address(CREATE2_FACTORY, salt, initCodeHash);
    if ((parseInt(a.slice(-4), 16) & BIT_MASKE) === GEREKEN_BITLER) {
      return { salt, adres: a, deneme: i + 1, ms: Date.now() - t0 };
    }
  }
  return null;
}
const UYGULA = process.argv.includes("--uygula");

const coder = AbiCoder.defaultAbiCoder();
const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));
const E = 10n ** 18n;
const U6 = 10n ** 6n;

/* ---- the plan ------------------------------------------------------
 * The allocation was decided; the rest is arithmetic.
 *
 *   500,000,000  the market: sold on the curve, then the locked pool
 *   400,000,000  staking rewards, thirty years, ten-year half-life
 *   100,000,000  founder, 50 free and 50 vesting, both to the founder wallet
 *
 *   fantom = acilisFiyat * egriToken
 *   esik   = fantom * (egriToken - ayrilan) / ayrilan
 *
 * WHY THE OPENING CAP IS $15,000 AND NOT $1,500
 *   The money the curve can collect is proportional to what it has to
 *   sell, and the staking allocation and the market's depth come out of
 *   the same billion. With 500,000,000 on the curve a $1,500 cap collects
 *   $1,500 — a book that cannot fill the first serious buyer, which is the
 *   wall the previous token died against. $15,000 collects $15,000.
 */
const ARZ = 1_000_000_000n * E;
const KURUCU_SERBEST = 50_000_000n * E;
const KURUCU_VEST = 50_000_000n * E;
const STAKE_EMISYON = 400_000_000n * E;
const EGRI_TOKEN = 500_000_000n * E;                      // the market slice
const AYRILAN = EGRI_TOKEN / 3n;                          // reserved for the pool

/* Opening price as a raw-amount ratio: $1,500 over a billion tokens is
   1,500,000,000 USDC units over 1e27 token units. Never a scaled float —
   that assumption is what cost this project 300,000,000 tokens. */
const ACILIS_MCAP_USDC = 15_000n * U6;
const FANTOM = (ACILIS_MCAP_USDC * EGRI_TOKEN) / ARZ;                  // $1,350
const ESIK = (FANTOM * (EGRI_TOKEN - AYRILAN)) / AYRILAN;              // $2,700

const SNIPE_SURESI = 5n;
const ANLIK_GERI = 1n;          // weights read one block back
const OYLAMA = 5n * 86400n;
const TIMELOCK = 2n * 86400n;
const MUHLET = 14n * 86400n;
const NOBETCI_GUN = 365n;

/* The graduated pool's key. Fee and hook are 0 by deliberate choice — see
   the note printed by the script. */
/* The pool's own fee is zero because the hook charges 0.50% itself and
   splits it. Leaving a native fee on as well would tax the trade twice and
   send the second half to the locked position, where only biriktir() could
   reach it. */
const HAVUZ_FEE = 0;
const HAVUZ_SPACING = Number(process.env.DEPTH_SPACING || 60);

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
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
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
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });

(async function main() {
  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);
  const KURUCU = cuzdan.address;          // the founder wallet: founder share and vesting both land here
  const nonce = Number(await rpc("eth_getTransactionCount", [KURUCU, "latest"]));

  /* ---- predict every address before building any initcode ---------- */
  const A = {
    token: getCreateAddress({ from: KURUCU, nonce: nonce + 0 }),
    stake: getCreateAddress({ from: KURUCU, nonce: nonce + 1 }),
    egri: getCreateAddress({ from: KURUCU, nonce: nonce + 2 }),
    acici: getCreateAddress({ from: KURUCU, nonce: nonce + 3 }),
    /* nonce + 4 is the factory call that places the hook */
    governor: getCreateAddress({ from: KURUCU, nonce: nonce + 5 }),
    vesting: getCreateAddress({ from: KURUCU, nonce: nonce + 6 })
  };

  /* The hook is built around the opener's predicted address, then mined
     until its own address declares the right callbacks. */
  const hookInit = B("DepthHook").bytecode + coder.encode(
    ["address", "address", "address", "address", "address"],
    [POOL_MANAGER, A.acici, KURUCU, A.stake, USDC]).slice(2);
  process.stdout.write("  hook adresi araniyor... ");
  const maden = hookSaltAra(keccak256(hookInit));
  if (!maden) { console.log("bulunamadi"); process.exit(1); }
  console.log(maden.deneme.toLocaleString("en-US") + " denemede, " + maden.ms + " ms");
  A.hook = maden.adres;
  const HAVUZ_HOOK = maden.adres;

  const adimlar = [
    ["DepthToken", A.token, B("DepthToken").bytecode + coder.encode(
      ["uint256", "address", "uint256", "address", "uint256", "address", "uint256", "address", "uint256"],
      [ARZ, A.egri, EGRI_TOKEN, A.stake, STAKE_EMISYON,
       KURUCU, KURUCU_SERBEST, A.vesting, KURUCU_VEST]).slice(2)],
    /* The emission figure has to match what the token credits here, or the
       schedule would promise tokens the contract does not hold. The
       verification below reads both back. Start time zero means now. */
    ["Stake", A.stake, B("Stake").bytecode + coder.encode(
      ["address", "address", "uint256", "uint256"], [A.token, USDC, STAKE_EMISYON, 0]).slice(2)],
    ["Egri", A.egri, B("Egri").bytecode + coder.encode(
      ["address", "address", "uint256", "uint256", "uint256", "address", "uint64", "address", "address"],
      [A.token, USDC, FANTOM, EGRI_TOKEN, ESIK, A.acici, SNIPE_SURESI, KURUCU, A.stake]).slice(2)],
    ["HavuzAcici", A.acici, B("HavuzAcici").bytecode + coder.encode(
      ["address", "address", "address", "address", "uint24", "int24", "address"],
      [POOL_MANAGER, A.token, USDC, HAVUZ_HOOK, HAVUZ_FEE, HAVUZ_SPACING, A.egri]).slice(2)],
    /* Through the factory: salt first, then the initcode. The address comes
       from CREATE2 and not from this transaction's nonce, so the predicted
       value is checked against the receipt rather than assumed. */
    ["DepthHook", A.hook, maden.salt + hookInit.slice(2), CREATE2_FACTORY],
    ["DepthGovernor", A.governor, B("DepthGovernor").bytecode + coder.encode(
      ["address", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],
      [A.stake, KURUCU, NOBETCI_GUN, OYLAMA, TIMELOCK, MUHLET, ANLIK_GERI]).slice(2)],
    ["Vesting", A.vesting, B("Vesting").bytecode + coder.encode(
      ["address", "address", "uint256", "uint256"], [A.token, KURUCU, KURUCU_VEST, 0]).slice(2)]
  ];

  console.log("ARC DEPTH  —  DEPTH");
  console.log("");
  console.log("  TURETILEN PARAMETRELER  (secilen iki hedeften)");
  console.log("    acilis mcap        $" + nf(Number(ACILIS_MCAP_USDC) / 1e6, 2) + "   <- secildi");
  console.log("    havuza ayrilan     " + nf(Number(AYRILAN) / 1e18) + "   <- secildi");
  console.log("    fantom rezerv      $" + nf(Number(FANTOM) / 1e6, 2) + "   sanal, kimse yatirmiyor");
  console.log("    mezuniyet esigi    $" + nf(Number(ESIK) / 1e6, 2) + "   tamami alici parasi");
  console.log("");
  console.log("  ARZ");
  console.log("    piyasa dilimi (egri)   " + nf(Number(EGRI_TOKEN) / 1e18).padStart(13));
  console.log("    stake emisyonu         " + nf(Number(STAKE_EMISYON) / 1e18).padStart(13) +
    "   30 yil, 10 yilda yarilanir");
  console.log("    kurucu serbest         " + nf(Number(KURUCU_SERBEST) / 1e18).padStart(13) + "   " + KURUCU);
  console.log("    kurucu vesting 12 ay   " + nf(Number(KURUCU_VEST) / 1e18).padStart(13) + "   ayni cuzdana akar");
  console.log("    " + "-".repeat(44));
  console.log("    toplam                 " + nf(Number(ARZ) / 1e18).padStart(13) + "   mint yok, bir daha basilamaz");
  console.log("");
  console.log("  EMISYON — ilk yil, ve neye karsi");
  {
    const r = 1 - Math.pow(0.5, 1 / 520);
    let kalan = Number(STAKE_EMISYON) / 1e18, y1 = 0;
    for (let w = 0; w < 52; w++) { const c = kalan * r; kalan -= c; y1 += c; }
    const satilan = Number(EGRI_TOKEN - AYRILAN) / 1e18;
    const float0 = satilan + Number(KURUCU_SERBEST) / 1e18;
    console.log("    haftalik oran        %" + (r * 100).toFixed(4) + "   (10 yil yarilanma)");
    console.log("    1. yil               " + nf(y1) + "   mezuniyet float'ina gore +%" +
      ((y1 / float0) * 100).toFixed(0));
    console.log("    ALP ayni havuzla     " + nf(y1 * 123.8 / 40.2) + "   (3 yillik yarilanma)");
  }
  console.log("");
  console.log("  TAHMIN EDILEN ADRESLER  (nonce " + nonce + " .. " + (nonce + adimlar.length - 1) + ")");
  for (const [ad, adres] of adimlar.map((x) => [x[0], x[1]])) {
    console.log("    " + ad.padEnd(15) + adres);
  }
  console.log("");
  console.log("  HER ISLEMDEN KIM NE ALIYOR  —  egri, %1 toplam");
  console.log("    kurucu    %0,30   dogrudan " + KURUCU);
  console.log("              her alimda ve her satimda, o anda. Cagrilacak bir");
  console.log("              claim yok, birikecek bir bakiye yok. Adres kontratta");
  console.log("              immutable: sonradan kimse, kurucu dahil, yonlendiremez.");
  console.log("    stake     %0,30   " + A.stake + "   oranla dagitiliyor");
  console.log("    havuza    %0,40   kalir ve mezuniyette derinlik olur");
  console.log("");
  console.log("  MEZUNIYET HAVUZU");
  console.log("    fee " + HAVUZ_FEE + "   spacing " + HAVUZ_SPACING + "   hook " + HAVUZ_HOOK);
  console.log("");
  console.log("  MEZUNIYETTEN SONRA  —  hook, %0,50 toplam");
  console.log("    kurucu    %0,15   satista, takasin icinde, dogrudan cuzdana");
  console.log("    stake     %0,15   satista");
  console.log("    derinlik  %0,20   satista; ALIMDA ucretin TAMAMI buraya");
  console.log("              Alimin ucreti token cinsinden gelir ve kimseye");
  console.log("              satmak zorunda kalacagi bir seyle odeme yapmak");
  console.log("              dogru olmaz — o yuzden hepsi derinlige gider.");
  console.log("    Havuzun kendi ucreti 0: hook zaten kesiyor, ikisi birlikte");
  console.log("    olsa islem iki kere vergilenirdi.");
  console.log("");

  /* ---- gas ---------------------------------------------------------- */
  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  let toplamGas = 0n;
  const tahminler = [];
  for (const [ad, , init, hedef] of adimlar) {
    let g = 0n;
    try {
      g = BigInt(await rpc("eth_estimateGas",
        [{ from: KURUCU, data: init, ...(hedef ? { to: hedef } : {}) }]));
    }
    catch (e) { g = 0n; }
    tahminler.push(g);
    toplamGas += g;
    console.log("    " + ad.padEnd(15) + nf(Number(g)).padStart(10) + " gas   " +
      (Number(g * gasPrice) / 1e18).toFixed(5));
  }
  console.log("    " + "".padEnd(15) + "".padStart(10, "-"));
  console.log("    " + "TOPLAM".padEnd(15) + nf(Number(toplamGas)).padStart(10) + " gas   " +
    (Number(toplamGas * gasPrice) / 1e18).toFixed(5));
  console.log("");

  if (!UYGULA) {
    console.log("  kuru calisma: hicbir sey gonderilmedi.");
    console.log("  dagitmak icin --uygula ekle");
    return;
  }

  /* The bits are what v4 reads to know which callbacks exist; a hook at the
     wrong address is a pool the PoolManager will refuse to create. Checked
     here as well as during mining, because this is the last moment it is
     still free. */
  if ((parseInt(A.hook.slice(-4), 16) & BIT_MASKE) !== GEREKEN_BITLER) {
    console.log("  DURDURULDU: hook adresinin bitleri yanlis — " + A.hook);
    process.exit(1);
  }

  const kodVar = async (a) => { const k = await rpc("eth_getCode", [a, "latest"]); return !!k && k !== "0x"; };
  const gonder = async (tx, ad) => {
    const imzali = await cuzdan.signTransaction(tx);
    let hash;
    try { hash = await rpc("eth_sendRawTransaction", [imzali]); }
    catch (e) {
      if (!/already known|nonce too low/i.test(String(e.message))) throw e;
      hash = keccak256(imzali);
    }
    console.log("      " + ad + " -> " + hash);
    for (let i = 0; i < 90; i++) {
      let rc = null;
      try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
      if (rc) {
        if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz: " + hash);
        console.log("      blok " + parseInt(rc.blockNumber, 16));
        return hash;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error("makbuz gelmedi: " + hash);
  };

  for (let i = 0; i < adimlar.length; i++) {
    const [ad, adres, init, hedef] = adimlar[i];
    if (await kodVar(adres)) { console.log("    " + ad + " yerinde, atlandi"); continue; }
    console.log("    " + ad + " gonderiliyor...");
    await gonder({
      chainId: CHAIN_ID, nonce: nonce + i, data: init,
      ...(hedef ? { to: hedef } : {}),
      gasLimit: tahminler[i] > 0n ? (tahminler[i] * 13n) / 10n : 4_000_000n,
      gasPrice, value: 0n
    }, ad);
    /* A deployment that silently landed elsewhere is how tokens become
       unreachable. Stop rather than continue. */
    if (!(await kodVar(adres))) throw new Error(ad + ": tahmin edilen adreste kod yok — " + adres);
  }

  /* ---- verify the wiring, not just the bytecode -------------------- */
  console.log("");
  console.log("  BAGLAR DOGRULANIYOR");
  const sel = (s) => id(s).slice(0, 10);
  const oku = async (to, sig) => rpc("eth_call", [{ to, data: sel(sig) }, "latest"]);
  const adr = (h) => "0x" + String(h).slice(26);
  const bakiye = async (who) => BigInt(await rpc("eth_call", [{
    to: A.token, data: sel("balanceOf(address)") + coder.encode(["address"], [who]).slice(2) }, "latest"]));

  const kontroller = [
    ["token.totalSupply", BigInt(await oku(A.token, "totalSupply()")) === ARZ, nf(Number(ARZ) / 1e18)],
    ["egri bakiyesi", (await bakiye(A.egri)) === EGRI_TOKEN, nf(Number(EGRI_TOKEN) / 1e18)],
    ["kurucu bakiyesi", (await bakiye(KURUCU)) >= KURUCU_SERBEST, nf(Number(KURUCU_SERBEST) / 1e18)],
    ["stake bakiyesi", (await bakiye(A.stake)) === STAKE_EMISYON, nf(Number(STAKE_EMISYON) / 1e18)],
    /* The schedule must not promise more than the contract holds. */
    ["stake.emisyonKalan", BigInt(await oku(A.stake, "emisyonKalan()")) === STAKE_EMISYON,
      "token bakiyesiyle ayni"],
    ["stake.SALIM_PPM", BigInt(await oku(A.stake, "SALIM_PPM()")) === 1332n, "1332 = 10 yil yarilanma"],
    ["vesting bakiyesi", (await bakiye(A.vesting)) === KURUCU_VEST, nf(Number(KURUCU_VEST) / 1e18)],
    ["tokende artik yok", (await bakiye(A.token)) === 0n, "0"],
    ["egri.FANTOM", BigInt(await oku(A.egri, "FANTOM()")) === FANTOM, "$" + nf(Number(FANTOM) / 1e6, 2)],
    ["egri.ESIK", BigInt(await oku(A.egri, "ESIK()")) === ESIK, "$" + nf(Number(ESIK) / 1e6, 2)],
    ["egri.havuzAcici", adr(await oku(A.egri, "havuzAcici()")).toLowerCase() === A.acici.toLowerCase(), A.acici],
    ["acici.egri", adr(await oku(A.acici, "egri()")).toLowerCase() === A.egri.toLowerCase(), A.egri],
    ["stake.token", adr(await oku(A.stake, "token()")).toLowerCase() === A.token.toLowerCase(), A.token],
    ["stake.MIN_OY_GUCU", BigInt(await oku(A.stake, "MIN_OY_GUCU()")) === 50_000n * E, "50.000"],
    ["governor.stake", adr(await oku(A.governor, "stake()")).toLowerCase() === A.stake.toLowerCase(), A.stake],
    ["hook.kurucu", adr(await oku(A.hook, "kurucu()")).toLowerCase() === KURUCU.toLowerCase(), KURUCU],
    ["hook.stakeKasasi", adr(await oku(A.hook, "stakeKasasi()")).toLowerCase() === A.stake.toLowerCase(), A.stake],
    ["hook.havuzAcici", adr(await oku(A.hook, "havuzAcici()")).toLowerCase() === A.acici.toLowerCase(), A.acici],
    ["acici.hook", adr(await oku(A.acici, "hook()")).toLowerCase() === A.hook.toLowerCase(), A.hook],
    ["egri.kurucu", adr(await oku(A.egri, "kurucu()")).toLowerCase() === KURUCU.toLowerCase(), KURUCU],
    ["egri.stakeKasasi", adr(await oku(A.egri, "stakeKasasi()")).toLowerCase() === A.stake.toLowerCase(), A.stake]
  ];
  let kotu = 0;
  for (const [ad, tamam, not] of kontroller) {
    console.log("    " + (tamam ? "OK   " : "HATA ") + ad.padEnd(20) + not);
    if (!tamam) kotu++;
  }
  if (kotu) throw new Error(kotu + " bag dogrulanamadi");

  const M = {
    zincir: "arc", chainId: CHAIN_ID, ad: "Arc Depth", sembol: "DEPTH",
    token: A.token, egri: A.egri, havuzAcici: A.acici, hook: A.hook, hookSalt: maden.salt,
    stake: A.stake, governor: A.governor, vesting: A.vesting,
    usdc: USDC, poolManager: POOL_MANAGER,
    kurucu: KURUCU,
    arz: ARZ.toString(), egriToken: EGRI_TOKEN.toString(),
    stakeEmisyon: STAKE_EMISYON.toString(),
    kurucuSerbest: KURUCU_SERBEST.toString(), kurucuVesting: KURUCU_VEST.toString(),
    fantom: FANTOM.toString(), esik: ESIK.toString(), ayrilan: AYRILAN.toString(),
    acilisMcapUsdc: ACILIS_MCAP_USDC.toString(),
    havuzFee: HAVUZ_FEE, havuzSpacing: HAVUZ_SPACING, havuzHook: HAVUZ_HOOK,
    snipeSuresi: Number(SNIPE_SURESI), anlikGeri: Number(ANLIK_GERI),
    oylama: Number(OYLAMA), timelock: Number(TIMELOCK), muhlet: Number(MUHLET),
    zaman: new Date().toISOString()
  };
  fs.writeFileSync(path.join(__dirname, "..", "dagitim-depth.json"), JSON.stringify(M, null, 1));
  console.log("");
  console.log("  dagitim-depth.json yazildi");
  console.log("  TAMAM — egri acik, alim bekliyor. Mezuniyet $" + nf(Number(ESIK) / 1e6, 2) + "'da.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
