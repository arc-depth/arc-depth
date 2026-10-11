"use strict";
/* ===========================================================================
 * dagit-derinlik.js — open a DEPTH pool a wallet can actually trade.
 *
 *   node scripts/dagit-derinlik.js                  plan + mine the hook
 *   node scripts/dagit-derinlik.js --dagit          deploy opener + hook
 *   node scripts/dagit-derinlik.js --dene           dry-run ac() on chain
 *   node scripts/dagit-derinlik.js --ac --token 30  send tokens and open
 *
 * WHY THERE IS A SECOND POOL
 *   The live pool is full range with $6 in it and MetaMask quotes -76.96%
 *   on a $20 buy. It cannot be fixed: its liquidity is locked by design,
 *   its hook accepts liquidity only from its own opener, and that opener
 *   places full-range positions and has already run once. Those locks are
 *   the point of the project, so the honest move is not to pick at them but
 *   to open a pool that is right from the start.
 *
 * WHY IT COSTS NO MONEY
 *   The new position is tokens only, concentrated into a band just above
 *   the live price. v4 asks for the quote asset only for the part of a
 *   range that sits below the price, so a range entirely above it is paid
 *   for in tokens alone — the side we have. Buyers' own dollars become the
 *   depth as they walk up through it. Measured against the real Arc
 *   PoolManager by dene-tekyonlu.js: a $20 buy quotes -1.39% instead of
 *   -76.92%.
 *
 * WHAT IT COSTS INSTEAD
 *   Tokens from the founder wallet, locked permanently, and so is every dollar
 *   that arrives for them. And the band is finite: capacity is printed
 *   before anything is sent, and once buying passes the top this pool stops
 *   quoting buys. Both are stated at every step rather than buried.
 *
 * THE ORDER IS DELIBERATE
 *   Deploying code costs only gas and commits nothing. Sending tokens to
 *   the opener is irreversible the moment it lands — there is no sweep and
 *   no withdraw, by design. So the token transfer is the last step, behind
 *   its own flag, after a dry run of the opening against the real deployed
 *   contracts.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, Interface, getCreateAddress, getCreate2Address,
        keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const GEREKEN_BITLER = (1 << 11) | (1 << 9) | (1 << 6) | (1 << 2);   // 0xa44
const BIT_MASKE = (1 << 14) - 1;
const SPACING = 60;
const Q96 = 2n ** 96n;

const DAGIT = process.argv.includes("--dagit");
const DENE = process.argv.includes("--dene");
const AC = process.argv.includes("--ac");
const val = (ad, d) => { const i = process.argv.indexOf(ad); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TOKEN_M = Number(val("--token", "30"));
const BANT = Number(val("--bant", "100"));

const coder = AbiCoder.defaultAbiCoder();
const KOK = path.join(__dirname, "..");
const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-depth.json"), "utf8"));
const H = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-havuz.json"), "utf8"));
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const sel = (s) => id(s).slice(0, 10);
const DERINLIK_DOSYA = path.join(KOK, "dagitim-derinlik.json");

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
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 6) throw e;
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
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);

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

async function gonder(cuzdan, nonce, tx, gasPrice, ad) {
  const g = BigInt(await rpc("eth_estimateGas",
    [{ from: cuzdan.address, ...tx, value: "0x0" }]));
  const imzali = await cuzdan.signTransaction({
    chainId: CHAIN_ID, nonce, gasPrice, gasLimit: (g * 13n) / 10n, value: 0n, ...tx
  });
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
      console.log("    " + ad.padEnd(22) + hash + "   gaz " + nf(parseInt(rc.gasUsed, 16)));
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
  const BEN = cuzdan.address;
  if (BEN.toLowerCase() !== D.kurucu.toLowerCase())
    console.log("UYARI: cuzdan " + BEN + " manifestteki kurucu " + D.kurucu + " degil.\n");

  /* ---- the live price, which the new pool must match ---------------- */
  const slot0 = keccak256(coder.encode(["bytes32", "uint256"], [H.havuzId, 6]));
  const rawSlot = BigInt(await rpc("eth_call", [
    { to: D.poolManager, data: sel("extsload(bytes32)") + slot0.slice(2) }, "latest"]));
  const sqrtCanli = rawSlot & ((1n << 160n) - 1n);
  const pV4 = (Number(sqrtCanli) / Number(Q96)) ** 2;
  const fiyat = (1 / pV4) * 1e12;
  const tickCanli = Math.floor(Math.log(pV4) / Math.log(1.0001));

  /* DEPTH is currency1, so its side of the price is below the tick and a
     higher dollar price is a lower tick: the band's dollar ceiling is its
     lower tick. Getting this backwards would quietly ask for USDC. */
  const ust = Math.floor((tickCanli - 1) / SPACING) * SPACING;
  const adim = Math.round(Math.log(1 + BANT / 100) / Math.log(1.0001) / SPACING) * SPACING;
  const alt = ust - adim;
  const bantUstFiyat = fiyat * 1.0001 ** adim;

  const nonce = Number(await rpc("eth_getTransactionCount", [BEN, "latest"]));
  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const gazBakiye = BigInt(await rpc("eth_getBalance", [BEN, "latest"]));
  const tokenBakiye = BigInt(await rpc("eth_call", [{ to: D.token,
    data: sel("balanceOf(address)") + coder.encode(["address"], [BEN]).slice(2) }, "latest"]));

  /* The opener goes in by CREATE, so its address depends only on this
     wallet and the nonce — not on its constructor arguments. That is what
     breaks the circle: the hook can be mined around an address that does
     not exist yet. */
  /* The file also holds the abandoned pair from the first attempt, so
     "already deployed" has to mean an address is actually in it rather
     than just that the file exists. */
  let eski = null, kayit = null;
  try { eski = JSON.parse(fs.readFileSync(DERINLIK_DOSYA, "utf8")); } catch (e) { /* first run */ }
  if (eski && eski.acici) kayit = eski;
  const aciciAdres = kayit ? kayit.acici : getCreateAddress({ from: BEN, nonce });

  const hookInit = B("DepthHook").bytecode + coder.encode(
    ["address", "address", "address", "address", "address"],
    [D.poolManager, aciciAdres, D.kurucu, D.stake, D.usdc]).slice(2);
  const maden = kayit
    ? { salt: kayit.hookSalt, adres: kayit.hook, deneme: 0, ms: 0 }
    : hookSaltAra(keccak256(hookInit));
  if (!maden) { console.log("hook adresi bulunamadi"); process.exit(1); }

  const tokenHam = BigInt(Math.round(TOKEN_M * 1e6)) * 10n ** 18n;

  console.log("DERINLIK HAVUZU — tek yonlu, yogunlasmis, kalici kilitli");
  console.log("");
  console.log("  CUZDAN");
  console.log("    adres        " + BEN);
  console.log("    gaz          " + usd(Number(gazBakiye) / 1e18, 6) +
    "   (" + nf(Number(gasPrice) / 1e9, 1) + " gwei)");
  console.log("    DEPTH        " + nf(Number(tokenBakiye) / 1e18));
  console.log("    nonce        " + nonce);
  console.log("");
  console.log("  CANLI FIYAT — yeni havuz buna esit aciliyor");
  console.log("    sqrtPriceX96 " + sqrtCanli);
  console.log("    tick         " + tickCanli);
  console.log("    fiyat        $" + fiyat.toExponential(5) + " / DEPTH");
  console.log("    mcap         " + usd(fiyat * 1e9, 0));
  console.log("    (ayri fiyat acmak, savunacak parasi olmayan bir tarafa");
  console.log("     arbitraj daveti olurdu. O yuzden secilmiyor, okunuyor.)");
  console.log("");
  console.log("  ADRESLER");
  console.log("    acici        " + aciciAdres + (kayit ? "   (dagitildi)" : "   (CREATE, nonce " + nonce + ")"));
  console.log("    hook         " + maden.adres +
    "   bitler 0x" + (parseInt(maden.adres.slice(-4), 16) & BIT_MASKE).toString(16) +
    (maden.deneme ? "   " + nf(maden.deneme) + " denemede, " + maden.ms + "ms" : "   (dagitildi)"));
  console.log("    hookSalt     " + maden.salt);
  console.log("");
  console.log("  BANT");
  console.log("    token        " + nf(Number(tokenHam) / 1e18) + " DEPTH   (payin %" +
    nf((Number(tokenHam) / Number(tokenBakiye)) * 100, 0) + "'i, KALICI kilitli)");
  console.log("    ticks        [" + alt + ", " + ust + "]");
  console.log("    fiyat        $" + fiyat.toExponential(4) + "  ->  $" + bantUstFiyat.toExponential(4) +
    "   (+%" + nf((bantUstFiyat / fiyat - 1) * 100, 0) + ")");
  console.log("    fee / spacing  0 / " + SPACING + "   (ucret hook'ta: %0,50 — " +
    "%0,15 kurucu, %0,15 stake, %0,20 derinlik)");
  console.log("");

  /* ---------------------------------------------------------------- */
  if (DAGIT) {
    if (kayit) { console.log("  Zaten dagitilmis. --dene veya --ac kullan."); return; }
    const maliyet = Number(gasPrice) * 2_900_000 / 1e18;
    if (Number(gazBakiye) / 1e18 < maliyet * 1.5) {
      console.log("  GAZ YETMEZ: ~" + usd(maliyet, 4) + " gerekiyor."); process.exit(1);
    }
    console.log("  DAGITIM — iki islem, token gonderilmiyor, hicbir sey kilitlenmiyor");
    const aciciInit = B("TekYonluAcici").bytecode + coder.encode(
      ["address", "address", "address", "address", "uint24", "int24", "address"],
      [D.poolManager, D.token, D.usdc, maden.adres, 0, SPACING, BEN]).slice(2);

    await gonder(cuzdan, nonce, { data: aciciInit }, gasPrice, "TekYonluAcici");
    await gonder(cuzdan, nonce + 1,
      { to: CREATE2_FACTORY, data: maden.salt + hookInit.slice(2) }, gasPrice, "DepthHook3");

    /* Both must exist and the opener must point at the mined hook; a
       mismatch here would only show up as a revert at opening time. */
    const kodA = await rpc("eth_getCode", [aciciAdres, "latest"]);
    const kodH = await rpc("eth_getCode", [maden.adres, "latest"]);
    const bagli = "0x" + (await rpc("eth_call", [{ to: aciciAdres, data: sel("hook()") }, "latest"])).slice(26);
    const aciciH = "0x" + (await rpc("eth_call", [{ to: maden.adres, data: sel("havuzAcici()") }, "latest"])).slice(26);
    const ok = [
      ["acici kodu var", kodA.length > 2],
      ["hook kodu var", kodH.length > 2],
      ["acici -> hook", bagli.toLowerCase() === maden.adres.toLowerCase()],
      ["hook -> acici", aciciH.toLowerCase() === aciciAdres.toLowerCase()],
      ["hook bitleri 0xa44", (parseInt(maden.adres.slice(-4), 16) & BIT_MASKE) === GEREKEN_BITLER]
    ];
    console.log("");
    for (const [ad, v] of ok) console.log("    " + (v ? "TAMAM" : "HATA ") + "  " + ad);
    if (ok.some(([, v]) => !v)) process.exit(1);

    fs.writeFileSync(DERINLIK_DOSYA, JSON.stringify({
      zincir: "arc", chainId: CHAIN_ID,
      terkEdilen: eski && eski.terkEdilen ? eski.terkEdilen : undefined,
      not: "Tek yonlu yogunlasmis DEPTH havuzu. Ilk havuz tam aralik ve $6 oldugu " +
           "icin cuzdan swap'i -%76,96 gosteriyordu; bu havuz ayni fiyattan, " +
           "sadece token konarak, sifir dolarla aciliyor.",
      acici: aciciAdres, hook: maden.adres, hookSalt: maden.salt,
      token: D.token, usdc: D.usdc, poolManager: D.poolManager,
      fee: 0, spacing: SPACING,
      zaman: new Date().toISOString()
    }, null, 1) + "\n");
    console.log("");
    console.log("  dagitim-derinlik.json yazildi. Siradaki: --dene");
    return;
  }

  if (!kayit) {
    console.log("  Henuz dagitilmadi. --dagit ile basla (sadece gaz, ~" +
      usd(Number(gasPrice) * 2_900_000 / 1e18, 4) + ").");
    return;
  }

  /* ---- dry run against the real deployed contracts ----------------- */
  const acIface = new Interface(["function ac(uint160 sqrtPriceX96,int24 alt,int24 ust) returns (uint256)"]);
  const acData = acIface.encodeFunctionData("ac", [sqrtCanli, alt, ust]);

  if (DENE) {
    console.log("  KURU CALISMA — gercek acici, gercek hook, gercek PoolManager");
    console.log("    Token transferi yapilmadi; bakiye eth_call icinde taklit ediliyor,");
    console.log("    cunku transfer geri alinamaz ama bu cagri zincire hic gitmiyor.");
    /* balanceOf is slot 1 in DepthToken (totalSupply is slot 0), so the
       opener's balance can be granted for the length of one call. */
    const bakiyeSlot = keccak256(coder.encode(["address", "uint256"], [aciciAdres, 1]));
    try {
      const r = await rpc("eth_call", [
        { from: BEN, to: aciciAdres, data: acData, gas: "0x3000000" },
        "latest",
        { [D.token]: { stateDiff: { [bakiyeSlot]: "0x" + tokenHam.toString(16).padStart(64, "0") } } }
      ]);
      console.log("");
      console.log("    ac() DONDU — bantta yerlesen token " + nf(Number(BigInt(r)) / 1e18) + " DEPTH");
      console.log("    Yani acilis gercek zincirde calisiyor. USDC istenmedi;");
      console.log("    istenseydi cagri bakiyesizlikten revert ederdi.");
      console.log("");
      console.log("    Siradaki ve GERI DONUSU OLMAYAN adim:");
      console.log("      node scripts/dagit-derinlik.js --ac --token " + TOKEN_M + " --bant " + BANT);
    } catch (e) {
      console.log("");
      console.log("    REVERT: " + e.message);
      console.log("    Zincire hicbir sey gitmedi. Once bu cozulmeli.");
      process.exit(1);
    }
    return;
  }

  if (AC) {
    if (tokenHam > tokenBakiye) { console.log("  DEPTH yetmiyor."); process.exit(1); }
    console.log("  ACILIS — buradan sonrasi geri alinamaz");
    console.log("    " + nf(Number(tokenHam) / 1e18) + " DEPTH aciciya gidiyor ve orada kaliyor;");
    console.log("    acicinin cekme fonksiyonu yok. Karsiliginda gelen para da");
    console.log("    havuzda kaliyor.");
    console.log("");
    await gonder(cuzdan, nonce, { to: D.token,
      data: sel("transfer(address,uint256)") +
        coder.encode(["address", "uint256"], [aciciAdres, tokenHam]).slice(2)
    }, gasPrice, "DEPTH transferi");
    await gonder(cuzdan, nonce + 1, { to: aciciAdres, data: acData }, gasPrice, "ac()");

    const havuzId = await rpc("eth_call", [{ to: aciciAdres, data: sel("havuzId()") }, "latest"]);
    const lik = BigInt(await rpc("eth_call", [{ to: aciciAdres, data: sel("likidite()") }, "latest"]));
    console.log("");
    console.log("    havuzId      " + havuzId);
    console.log("    likidite     " + lik);
    kayit.havuzId = havuzId;
    kayit.likidite = lik.toString();
    kayit.bantToken = tokenHam.toString();
    kayit.altTick = alt; kayit.ustTick = ust;
    kayit.acilisSqrtPriceX96 = sqrtCanli.toString();
    kayit.acilisZamani = new Date().toISOString();
    fs.writeFileSync(DERINLIK_DOSYA, JSON.stringify(kayit, null, 1) + "\n");
    console.log("");
    console.log("    Simdi cuzdandan dene. Olcum -%1,39 diyordu; ekranda ne");
    console.log("    goruyorsan dogru olan o, ve farkliysa duymam gerek.");
    return;
  }

  console.log("  Komutlar");
  console.log("    --dagit   acici + hook (sadece gaz)");
  console.log("    --dene    gercek sozlesmelere karsi kuru acilis");
  console.log("    --ac      token gonder ve ac  (GERI DONUSU YOK)");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
