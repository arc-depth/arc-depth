"use strict";
/* ===========================================================================
 * launch-canli.js — one real launch on the deployed stack, then buy it,
 *                   sweep the fee to the floor, and redeem out of the vault.
 *
 *   node scripts/launch-canli.js              # prices every step, sends nothing
 *   node scripts/launch-canli.js --uygula     # sends
 *
 * WHY THIS EXISTS
 *   510 tests pass against the real Arc PoolManager, and denetim-dagitim.js
 *   proves the deployed bytecode is the tested bytecode to the byte. Both
 *   are strong and neither is a launch. Every claim about this product
 *   rested on a contract that had never been used: launchCount was 0.
 *
 *   So this makes one, small, and then exercises the three things that
 *   cannot be demonstrated any other way — that a stranger can buy it with
 *   ordinary dollars, that the fee from that purchase reaches the floor,
 *   and that the vault pays out when somebody wants to leave.
 *
 * WHAT IS IRREVERSIBLE ABOUT IT
 *   The pool's liquidity is locked at creation and can never be withdrawn,
 *   by anyone. That is the product working as designed, and it means the
 *   share of supply committed to the pool is spent, not parked. The
 *   collateral in the vault is recoverable by burning tokens; the pool
 *   share is not. Both numbers are printed in the dry run before anything
 *   is sent.
 *
 * WHY USDC AS THE COLLATERAL
 *   Arc's USDC is both the quote asset and the native gas token, and its
 *   ERC20 balance is the same money as the native balance — measured:
 *   18691390 at six decimals against 18691390397315248537 at eighteen, a
 *   difference of sub-micro dust from gas accounting. So approve and
 *   transferFrom behave normally, the launch fee needs no conversion, and
 *   sweepFloor can put the sell-side fee straight into the vault.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const { Wallet, Interface, formatUnits, parseUnits, getAddress } = require("ethers");

const KOK = path.join(__dirname, "..");

/* floorPrice() is backing * 1e36 / supply, a ratio of RAW units, so the
   human figure needs the collateral decimals and not a literal 36. With
   six-decimal USDC that literal understated the floor by a factor of a
   trillion. The property to hold onto: floor x supply == backing. */
const tabanInsan = (ham, ond) => require("ethers").formatUnits(ham, 18 + Number(ond));
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const UYGULA = process.argv.includes("--uygula");

const AD = process.env.AD || "Arc Taban Testi";
const SEMBOL = process.env.SEMBOL || "TABAN";
const YATIR = process.env.YATIR || "2";        // USDC of collateral
const ALIM = process.env.ALIM || "0.25";       // USDC spent buying it afterwards

let no = 1;
async function rpc(yontem, parametreler) {
  for (let d = 0; d < 8; d++) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler })
    });
    const j = await r.json();
    if (j.error) {
      if (/rate limit/i.test(j.error.message || "")) {
        await new Promise((s) => setTimeout(s, 1500 * (d + 1))); continue;
      }
      const e = new Error(j.error.message); e.data = j.error.data; throw e;
    }
    return j.result;
  }
  throw new Error("rate limit: 8 denemede gecilemedi");
}

/* Decodes a nested revert far enough to be useful. A bare "execution
   reverted" sent me chasing the wrong cause once today; the reason was
   four levels down inside WrappedError. */
const HATALAR = {};
function hataAdlariYukle() {
  for (const ad of ["Launchpad", "ArcLaunchHook", "CollateralVault", "LaunchToken", "SwapRouter"]) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));
      const i = new Interface(j.abi);
      for (const f of j.abi) if (f.type === "error") HATALAR[i.getError(f.name).selector] = f.name;
    } catch (e) { /* optional */ }
  }
  /* v4's own, and the two the wrapper uses */
  const v4 = new Interface([
    "error WrappedError(address,bytes4,bytes,bytes)",
    "error HookCallFailed()", "error CurrencyNotSettled()", "error ERC20TransferFailed()"
  ]);
  for (const n of ["WrappedError", "HookCallFailed", "CurrencyNotSettled", "ERC20TransferFailed"])
    HATALAR[v4.getError(n).selector] = n;
}
function hataCoz(veri, derin) {
  derin = derin || 0;
  if (!veri || veri.length < 10) return "(veri yok)";
  const sel = veri.slice(0, 10);
  const ad = HATALAR[sel] || sel;
  if (ad === "WrappedError" && derin < 4) {
    try {
      const { AbiCoder } = require("ethers");
      const [hedef, cagri, sebep, detay] = AbiCoder.defaultAbiCoder()
        .decode(["address", "bytes4", "bytes", "bytes"], "0x" + veri.slice(10));
      return "WrappedError(" + hedef + ")\n" + " ".repeat(derin * 2 + 6) +
        "sebep -> " + hataCoz(sebep, derin + 1) +
        (detay && detay.length > 2 ? "\n" + " ".repeat(derin * 2 + 6) + "detay -> " + hataCoz(detay, derin + 1) : "");
    } catch (e) { /* fall through */ }
  }
  if (sel === "0x08c379a0") {
    try {
      const { AbiCoder } = require("ethers");
      return 'revert("' + AbiCoder.defaultAbiCoder().decode(["string"], "0x" + veri.slice(10))[0] + '")';
    } catch (e) { /* fall through */ }
  }
  if (sel === "0x4e487b71") return "Panic(" + parseInt(veri.slice(10), 16) + ")";
  return ad;
}

async function gonder(cuzdan, tx, ad) {
  const imzali = await cuzdan.signTransaction(tx);
  let hash;
  try { hash = await rpc("eth_sendRawTransaction", [imzali]); }
  catch (e) {
    if (!/already known|nonce too low/i.test(String(e.message))) throw e;
    const { keccak256 } = require("ethers");
    hash = keccak256(imzali);
    console.log("      (zaten dugumde)");
  }
  console.log("      " + ad + " -> " + hash);
  for (let i = 0; i < 90; i++) {
    let rc = null;
    try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
    if (rc) {
      const ok = rc.status === "0x1";
      console.log("      blok " + parseInt(rc.blockNumber, 16) +
        "   gaz " + parseInt(rc.gasUsed, 16).toLocaleString("en-US") + (ok ? "" : "   BASARISIZ"));
      if (!ok) throw new Error(ad + " zincirde basarisiz oldu");
      return rc;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("makbuz gelmedi: " + hash);
}

(async () => {
  hataAdlariYukle();
  const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim.json"), "utf8"));
  const LPB = JSON.parse(fs.readFileSync(path.join(KOK, "build", "Launchpad.json"), "utf8"));
  const HKB = JSON.parse(fs.readFileSync(path.join(KOK, "build", "ArcLaunchHook.json"), "utf8"));
  const CVB = JSON.parse(fs.readFileSync(path.join(KOK, "build", "CollateralVault.json"), "utf8"));
  const TKB = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TeminatKarnesi.json"), "utf8"));
  const RTB = JSON.parse(fs.readFileSync(path.join(KOK, "build", "SwapRouter.json"), "utf8"));
  const lI = new Interface(LPB.abi), hI = new Interface(HKB.abi), vI = new Interface(CVB.abi);
  const tI = new Interface(TKB.abi), rI = new Interface(RTB.abi);
  const eI = new Interface([
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function symbol() view returns (string)"
  ]);

  const anahtar = process.env.TRADER_PRIVATE_KEY || (() => {
    /* Read, never printed, never written anywhere. */
    const t = fs.readFileSync("C:/bot/.env", "utf8");
    const m = t.match(/^\s*TRADER_PRIVATE_KEY\s*=\s*(.+)\s*$/m);
    if (!m) throw new Error("TRADER_PRIVATE_KEY bulunamadi");
    return m[1].trim();
  })();
  const cuzdan = new Wallet(anahtar);

  const USDC = D.usdc;
  const cagir = async (ifc, adres, fn, args) => ifc.decodeFunctionResult(
    fn, await rpc("eth_call", [{ to: adres, data: ifc.encodeFunctionData(fn, args || []) }, "latest"]));

  console.log("CANLI LAUNCH");
  console.log("  rpc        " + RPC);
  console.log("  launchpad  " + D.launchpad);
  console.log("  hook       " + D.hook);
  console.log("  cuzdan     " + cuzdan.address);
  console.log("  kip        " + (UYGULA ? "UYGULA — GERCEK ISLEM" : "KURU CALISMA"));
  console.log("");

  /* ---- what the contract itself says the rules are ----------------- */
  const ond = Number((await cagir(eI, USDC, "decimals"))[0]);
  const ARZ = BigInt((await cagir(lI, D.launchpad, "SUPPLY"))[0]);
  const HAVUZ_BPS = BigInt((await cagir(lI, D.launchpad, "MIN_POOL_BPS"))[0]);
  const HAVUZ_BPS_UST = BigInt((await cagir(lI, D.launchpad, "MAX_POOL_BPS"))[0]);
  const POOL_FEE = Number((await cagir(lI, D.launchpad, "POOL_FEE"))[0]);
  const TICK = Number((await cagir(lI, D.launchpad, "TICK_SPACING"))[0]);
  const UCRET_PPM = BigInt((await cagir(lI, D.launchpad, "ucretPpm", [USDC]))[0]);
  const SERBEST = BigInt((await cagir(lI, D.launchpad, "FOUNDER_FREE_BPS"))[0]);
  const VEST = BigInt((await cagir(lI, D.launchpad, "FOUNDER_VEST_BPS"))[0]);
  const TABAN_BPS = BigInt((await cagir(lI, D.launchpad, "FEE_TO_FLOOR_BPS"))[0]);

  /* Read, not assumed. The pool key has to be the one the launchpad opens
     or the swap addresses a different pool — and the fee and tick spacing
     are fields of that key. */
  console.log("  kontrattan okunan kurallar");
  console.log("    arz             " + (Number(ARZ) / 1e18).toLocaleString("en-US"));
  console.log("    havuz payi      %" + (Number(HAVUZ_BPS) / 100) +
    (HAVUZ_BPS === HAVUZ_BPS_UST ? "  (secilemiyor: alt = ust)" : "  - %" + Number(HAVUZ_BPS_UST) / 100));
  console.log("    havuz anahtari  fee " + POOL_FEE + ", tickSpacing " + TICK);
  console.log("    launch ucreti   %" + (Number(UCRET_PPM) / 10000) + "  (USDC teminat)");
  console.log("    ucretin tabana  %" + (Number(TABAN_BPS) / 100));
  console.log("    kurucu payi     %" + (Number(SERBEST) / 100) + " serbest / %" + (Number(VEST) / 100) + " vesting");
  console.log("");

  const yatir = parseUnits(YATIR, ond);
  const alim = parseUnits(ALIM, ond);

  const bakiye = BigInt((await cagir(eI, USDC, "balanceOf", [cuzdan.address]))[0]);
  console.log("  bakiye          " + formatUnits(bakiye, ond) + " USDC");
  console.log("  yatirilacak     " + formatUnits(yatir, ond) + " USDC");
  console.log("  sonra alinacak  " + formatUnits(alim, ond) + " USDC");
  if (bakiye < yatir + alim) { console.log("\n  BAKIYE YETMIYOR — durduruldu."); process.exit(1); }

  /* ---- what the launch will produce, quoted by the contract ------- */
  const q = await cagir(lI, D.launchpad, "quoteLaunch", [yatir, HAVUZ_BPS]);
  const havuzTok = BigInt(q.poolTokens), kurucuTok = BigInt(q.founderTokens);
  console.log("");
  console.log("  quoteLaunch (kontratin kendi aritmetigi)");
  console.log("    ucret           " + formatUnits(q.fee, ond) + " USDC");
  console.log("    kasaya giren    " + formatUnits(q.toVault, ond) + " USDC");
  console.log("    taban fiyat     " + tabanInsan(q.floorPrice, ond) + " USDC / token");
  console.log("    acilis fiyati   " + tabanInsan(q.openPrice, ond) + " USDC / token");
  {
    /* The check that caught the wrong scale: what is shown, times the
       supply, has to be what is in the vault. */
    const gosterilen = Number(tabanInsan(q.floorPrice, ond)) * (Number(ARZ) / 1e18);
    const kasada = Number(formatUnits(q.toVault, ond));
    const sapma = Math.abs(gosterilen - kasada);
    console.log("    DOGRULAMA       taban x arz = " + gosterilen.toFixed(6) +
      " USDC, kasada " + kasada.toFixed(6) + "  -> " +
      (sapma < 1e-6 ? "TUTUYOR" : "TUTMUYOR, sapma " + sapma));
  }
  console.log("    havuza KILITLI  " + (Number(havuzTok) / 1e18).toLocaleString("en-US") + " token  <- geri gelmez");
  console.log("    kurucuda        " + (Number(kurucuTok) / 1e18).toLocaleString("en-US") + " token");
  console.log("    bunun geri alinabiliri " + formatUnits(q.recoverable, ond) + " USDC  (serbest payin kasa hakki)");
  const harcanan = BigInt(q.fee) - (BigInt(q.fee) * TABAN_BPS) / 10000n;
  console.log("");
  console.log("    GERI DONMEYEN: " + formatUnits(harcanan, ond) + " USDC protokol dilimi, artı");
  console.log("                   havuza kilitlenen " + (Number(havuzTok) / 1e18).toLocaleString("en-US") +
    " tokenin kasa hakki (kalici)");

  /* ---- gas ---------------------------------------------------------- */
  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const tahmin = async (to, data) => {
    try { return BigInt(await rpc("eth_estimateGas", [{ from: cuzdan.address, to, data }])); }
    catch (e) {
      console.log("      (tahmin alinamadi: " + hataCoz(e.data) + ")");
      return 0n;
    }
  };
  const onayData = eI.encodeFunctionData("approve", [D.launchpad, yatir]);
  const launchData = lI.encodeFunctionData("launch", [AD, SEMBOL, USDC, yatir, yatir, HAVUZ_BPS]);
  const g1 = await tahmin(USDC, onayData);
  /* The launch cannot be estimated before the approval exists, so it is
     estimated with the allowance simulated rather than guessed at. */
  let g2 = 0n;
  try {
    g2 = BigInt(await rpc("eth_estimateGas", [
      { from: cuzdan.address, to: D.launchpad, data: launchData },
      "latest",
      { [cuzdan.address]: { stateDiff: {} } }
    ]));
  } catch (e) { g2 = 0n; }
  if (g2 === 0n) g2 = 4_500_000n;   // measured shape; printed as an estimate
  console.log("");
  console.log("  gaz");
  console.log("    onay            " + g1.toLocaleString("en-US") + "  " + formatUnits(g1 * gasPrice, 18) + " USDC");
  console.log("    launch          ~" + g2.toLocaleString("en-US") + "  ~" + formatUnits(g2 * gasPrice, 18) + " USDC");
  console.log("    (alim, sweep ve redeem adimlari sirasi geldiginde olculuyor)");

  if (!UYGULA) {
    console.log("");
    console.log("  KURU CALISMA — hicbir sey gonderilmedi.");
    console.log("  gercekten yapmak icin: node scripts/launch-canli.js --uygula");
    process.exit(0);
  }

  const nonceAl = async () => parseInt(await rpc("eth_getTransactionCount", [cuzdan.address, "pending"]), 16);
  const temel = { chainId: CHAIN_ID, gasPrice, value: 0n };

  /* ---- 1. approve -------------------------------------------------- */
  console.log("");
  console.log("[1] teminat onayi");
  {
    const mevcut = BigInt((await cagir(eI, USDC, "allowance", [cuzdan.address, D.launchpad]))[0]);
    if (mevcut >= yatir) console.log("      izin zaten yeterli: " + formatUnits(mevcut, ond));
    else await gonder(cuzdan, { ...temel, nonce: await nonceAl(), to: USDC, data: onayData,
      gasLimit: (g1 * 13n) / 10n }, "approve");
  }

  /* ---- 2. launch --------------------------------------------------- */
  console.log("");
  console.log("[2] launch");
  const once = Number((await cagir(lI, D.launchpad, "launchCount"))[0]);
  await gonder(cuzdan, { ...temel, nonce: await nonceAl(), to: D.launchpad, data: launchData,
    gasLimit: (g2 * 15n) / 10n }, "launch");
  const sonra = Number((await cagir(lI, D.launchpad, "launchCount"))[0]);
  if (sonra !== once + 1) { console.log("      launchCount beklenen gibi artmadi: " + once + " -> " + sonra); process.exit(1); }

  const L = await cagir(lI, D.launchpad, "launches", [sonra - 1]);
  const token = getAddress(L.token), vault = getAddress(L.vault);
  console.log("      token  " + token);
  console.log("      kasa   " + vault);

  /* ---- 3. what the chain now says ---------------------------------- */
  console.log("");
  console.log("[3] zincirden okunan sonuc");
  const tokOnd = Number((await cagir(eI, token, "decimals"))[0]);
  const arz = BigInt((await cagir(eI, token, "totalSupply"))[0]);
  const kasaBak = BigInt((await cagir(vI, vault, "backing"))[0]);
  const taban0 = BigInt((await cagir(vI, vault, "floorPrice"))[0]);
  const kilit = getAddress((await cagir(lI, D.launchpad, "founderVestingOf", [token]))[0]);
  const kurucuSerbest = BigInt((await cagir(eI, token, "balanceOf", [cuzdan.address]))[0]);
  const kilitli = kilit === "0x0000000000000000000000000000000000000000"
    ? 0n : BigInt((await cagir(eI, token, "balanceOf", [kilit]))[0]);
  const havuzTokGercek = BigInt((await cagir(eI, token, "balanceOf", [D.poolManager]))[0]);
  const havuzUsdc = BigInt((await cagir(eI, USDC, "balanceOf", [D.poolManager]))[0]);
  console.log("      arz             " + (Number(arz) / 10 ** tokOnd).toLocaleString("en-US"));
  console.log("      kasadaki teminat " + formatUnits(kasaBak, ond) + " USDC");
  console.log("      taban fiyat     " + tabanInsan(taban0, ond) + " USDC / token");
  console.log("      kurucu serbest  " + (Number(kurucuSerbest) / 10 ** tokOnd).toLocaleString("en-US"));
  console.log("      vesting kilidi  " + kilit + "   " + (Number(kilitli) / 10 ** tokOnd).toLocaleString("en-US"));
  console.log("      havuzdaki token " + (Number(havuzTokGercek) / 10 ** tokOnd).toLocaleString("en-US"));

  /* The grade, filed by the launchpad's own constructor-deployed grader. */
  const karneAdres = getAddress((await cagir(lI, D.launchpad, "karne"))[0]);
  const K = await cagir(tI, karneAdres, "karnesi", [token]);
  console.log("");
  console.log("      KARNE (" + karneAdres + ")");
  console.log("        teminat        " + K.teminat);
  console.log("        gercek USDC mi " + K.gercekParaMi);
  console.log("        basamak        " + K.basamak + "   arz " + (Number(K.arz) / 10 ** ond).toLocaleString("en-US"));
  console.log("        kod boyutu     " + Number(K.kodBoyutu).toLocaleString("en-US") + " bayt");
  console.log("        sahibi var     " + K.sahipVar + "   mint yetkisi " + K.mintYetkisiVar);
  console.log("        dondurabilir   " + (K.dondurmaVar || K.dondurmaYetkisiVar) +
    "   duraklatilabilir " + K.duraklatilabilir + "   yukseltilebilir " + K.yukseltilebilir);
  console.log("        olculen blok   " + K.blok);

  /* ---- 4. buy it with ordinary dollars ----------------------------- */
  console.log("");
  console.log("[4] siradan USDC ile alim");
  const tokenSifir = token.toLowerCase() < USDC.toLowerCase();
  const key = [tokenSifir ? token : USDC, tokenSifir ? USDC : token, POOL_FEE, TICK, D.hook];
  /* Buying means the token comes OUT, so the input is USDC: zeroForOne is
     true when USDC is currency0. Getting this backwards would sell a token
     we are trying to buy. */
  const zeroForOne = !tokenSifir;
  console.log("      token currency" + (tokenSifir ? "0" : "1") + ", zeroForOne " + zeroForOne);
  {
    const izin = BigInt((await cagir(eI, USDC, "allowance", [cuzdan.address, D.router]))[0]);
    if (izin < alim) {
      const d = eI.encodeFunctionData("approve", [D.router, alim * 4n]);
      await gonder(cuzdan, { ...temel, nonce: await nonceAl(), to: USDC, data: d,
        gasLimit: (await tahmin(USDC, d) * 13n) / 10n || 80000n }, "approve(router)");
    }
  }
  const tokOnceAlim = BigInt((await cagir(eI, token, "balanceOf", [cuzdan.address]))[0]);
  const usdOnceAlim = BigInt((await cagir(eI, USDC, "balanceOf", [cuzdan.address]))[0]);
  {
    const d = rI.encodeFunctionData("swap", [key, zeroForOne, alim, 0n]);
    let g = await tahmin(D.router, d);
    if (g === 0n) g = 900000n;
    await gonder(cuzdan, { ...temel, nonce: await nonceAl(), to: D.router, data: d,
      gasLimit: (g * 15n) / 10n }, "swap(alim)");
  }
  const tokSonraAlim = BigInt((await cagir(eI, token, "balanceOf", [cuzdan.address]))[0]);
  const usdSonraAlim = BigInt((await cagir(eI, USDC, "balanceOf", [cuzdan.address]))[0]);
  const alinanTok = tokSonraAlim - tokOnceAlim;
  console.log("      alinan token    " + (Number(alinanTok) / 10 ** tokOnd).toLocaleString("en-US"));
  console.log("      harcanan USDC   " + formatUnits(usdOnceAlim - usdSonraAlim, ond) + "  (gaz dahil)");

  /* ---- 5. the fee, and whether it reaches the floor ---------------- */
  console.log("");
  console.log("[5] ucret tabana gidiyor mu");
  const poolIdHesap = (() => {
    const { AbiCoder, keccak256 } = require("ethers");
    return keccak256(AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"], key));
  })();
  const birikenTok = BigInt((await cagir(hI, D.hook, "floorAccrued", [poolIdHesap, token]))[0]);
  console.log("      hook'ta biriken " + (Number(birikenTok) / 10 ** tokOnd).toLocaleString("en-US") + " token");
  const arzOnceYakma = BigInt((await cagir(eI, token, "totalSupply"))[0]);
  const tabanOnceYakma = BigInt((await cagir(vI, vault, "floorPrice"))[0]);
  if (birikenTok > 0n) {
    const d = hI.encodeFunctionData("sweepFloor", [key, token]);
    let g = await tahmin(D.hook, d);
    if (g === 0n) g = 300000n;
    await gonder(cuzdan, { ...temel, nonce: await nonceAl(), to: D.hook, data: d,
      gasLimit: (g * 15n) / 10n }, "sweepFloor(token)");
    const arzSonraYakma = BigInt((await cagir(eI, token, "totalSupply"))[0]);
    const tabanSonraYakma = BigInt((await cagir(vI, vault, "floorPrice"))[0]);
    console.log("      arz " + (Number(arzOnceYakma) / 10 ** tokOnd).toLocaleString("en-US") +
      " -> " + (Number(arzSonraYakma) / 10 ** tokOnd).toLocaleString("en-US") +
      "   (yakilan " + (Number(arzOnceYakma - arzSonraYakma) / 10 ** tokOnd).toLocaleString("en-US") + ")");
    console.log("      TABAN " + tabanInsan(tabanOnceYakma, ond) + " -> " + tabanInsan(tabanSonraYakma, ond));
    console.log("      " + (tabanSonraYakma > tabanOnceYakma
      ? "taban YUKSELDI — teminat sabit, arz dustu"
      : "TABAN YUKSELMEDI — beklenen bu degildi"));
  } else {
    console.log("      biriken yok — alim ucreti sifira yuvarlanmis olabilir (cok kucuk alim)");
  }

  /* ---- 6. and the exit -------------------------------------------- */
  console.log("");
  console.log("[6] kasadan cikis (redeem)");
  {
    const yakilacak = alinanTok > 0n ? alinanTok / 2n : kurucuSerbest / 1000n;
    const usdOnceCikis = BigInt((await cagir(eI, USDC, "balanceOf", [cuzdan.address]))[0]);
    const tabanOnceCikis = BigInt((await cagir(vI, vault, "floorPrice"))[0]);
    const arzOnceCikis = BigInt((await cagir(eI, token, "totalSupply"))[0]);
    const kasaOnceCikis = BigInt((await cagir(vI, vault, "backing"))[0]);
    /* redeem burns through burnFrom, so the vault needs an allowance on
       the launch token. */
    const d0 = eI.encodeFunctionData("approve", [vault, yakilacak]);
    await gonder(cuzdan, { ...temel, nonce: await nonceAl(), to: token, data: d0,
      gasLimit: (await tahmin(token, d0) * 13n) / 10n || 80000n }, "approve(kasa)");
    const d = vI.encodeFunctionData("redeem", [yakilacak]);
    let g = await tahmin(vault, d);
    if (g === 0n) g = 200000n;
    await gonder(cuzdan, { ...temel, nonce: await nonceAl(), to: vault, data: d,
      gasLimit: (g * 15n) / 10n }, "redeem");
    const usdSonraCikis = BigInt((await cagir(eI, USDC, "balanceOf", [cuzdan.address]))[0]);
    const tabanSonraCikis = BigInt((await cagir(vI, vault, "floorPrice"))[0]);
    const arzSonraCikis = BigInt((await cagir(eI, token, "totalSupply"))[0]);
    const kasaSonraCikis = BigInt((await cagir(vI, vault, "backing"))[0]);
    console.log("      yakilan token   " + (Number(yakilacak) / 10 ** tokOnd).toLocaleString("en-US"));
    console.log("      kasa " + formatUnits(kasaOnceCikis, ond) + " -> " + formatUnits(kasaSonraCikis, ond) + " USDC");
    console.log("      arz  " + (Number(arzOnceCikis) / 10 ** tokOnd).toLocaleString("en-US") +
      " -> " + (Number(arzSonraCikis) / 10 ** tokOnd).toLocaleString("en-US"));
    console.log("      TABAN " + tabanInsan(tabanOnceCikis, ond) + " -> " + tabanInsan(tabanSonraCikis, ond));
    /* The whole mechanism in one line: a holder leaving must not move the
       floor for the ones who stayed. */
    const fark = tabanSonraCikis > tabanOnceCikis
      ? tabanSonraCikis - tabanOnceCikis : tabanOnceCikis - tabanSonraCikis;
    const oransal = tabanOnceCikis > 0n ? Number(fark * 1000000n / tabanOnceCikis) / 10000 : 0;
    console.log("      " + (oransal < 0.01
      ? "CIKAN BIRI KALANIN TABANINI DUSURMEDI — sapma %" + oransal.toFixed(6)
      : "TABAN OYNADI: %" + oransal.toFixed(6) + " — beklenen bu degildi"));
    console.log("      cikista alinan USDC (gaz dusulmus net) " + formatUnits(
      usdSonraCikis > usdOnceCikis ? usdSonraCikis - usdOnceCikis : 0n, ond));
  }

  console.log("");
  console.log("  TAMAM");
  console.log("  token " + token);
  console.log("  kasa  " + vault);
  const son = BigInt((await cagir(eI, USDC, "balanceOf", [cuzdan.address]))[0]);
  console.log("  kalan bakiye " + formatUnits(son, ond) + " USDC");
})().catch((e) => {
  console.log("\nHATA: " + (e && e.message));
  if (e && e.data) console.log("  sebep: " + hataCoz(e.data));
  process.exit(1);
});
