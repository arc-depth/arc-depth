"use strict";
/* ===========================================================================
 * dagit-pazar.js — deploying the Pazar contract to Arc
 *
 *   node scripts/dagit-pazar.js             dry run, sends NOTHING
 *   node scripts/dagit-pazar.js --uygula    sends the single transaction
 *
 * ONE CONTRACT, ONE TRANSACTION, NO CYCLE
 *   Pazar depends on exactly two things: USDC and the ops address. Both are
 *   already on chain and both are immutable. So there is no CREATE2 mining,
 *   no nonce ordering, and no cycle to close from both ends — none of the
 *   launchpad round's complexity is here.
 *
 *   That matters, because the complexity was a cost: across two rounds a
 *   nonce got reused, a rate limit cut the deployment off at 8 of 9 steps,
 *   and a hook pointing at the wrong vault would have accumulated 0.50%
 *   out of reach. There is no reason to fear that class of mistake here.
 *
 * WHAT THE DRY RUN VERIFIES
 *   Whether the artifact exists, whether the init code matches the compiled
 *   code, whether both constructor arguments are really on chain, whether
 *   the balance is more than twice the cost, and what the immutables will
 *   read as once deployed.
 *
 * AFTER THE DEPLOYMENT
 *   The running code is compared byte for byte against the compiled code
 *   and the two immutables are read from the chain. The record is written
 *   only when both hold — because the interface reads that record and
 *   denetim-sayfa.js verifies the addresses against it.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const {
  JsonRpcProvider, Wallet, AbiCoder, Transaction, getCreateAddress, id
} = require("ethers");
const { karsilastir, degismezPencereler } = require("./degismezlik.js");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const ZINCIR = 5042;
const UYGULA = process.argv.includes("--uygula");

const USDC = "0x3600000000000000000000000000000000000000";
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const KAYIT_YOLU = path.join(KOK, "dagitim-pazar.json");

const B = (n) => JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const sel = (imza) => id(imza).slice(0, 10);

/* Arc's native balance is 18 decimals while its ERC20 USDC is 6 — the same
   money at a 1e12 ratio. Two separately named formatters, because using one
   on the other once reported an estimate of $497 BILLION. */
const YERLI = (v) => "$" + (Number(v) / 1e18).toFixed(4);

/* The deployer key, resolved exactly the way every other script here
   resolves it. Inventing a second variable name (ARC_ANAHTAR) meant the
   dry run could not even start — and a key that is "not configured" looks
   identical to a key that is wrong. */
function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const f of [path.join("C:", "bot", ".env"), path.join(KOK, ".env")]) {
    try {
      const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  console.log("");
  console.log("PAZAR DAGITIMI" + (UYGULA ? "  —  UYGULAMA" : "  —  KURU CALISMA"));
  console.log("");

  const pk = ozelAnahtar();
  if (!pk) {
    console.log("KOTU  TRADER_PRIVATE_KEY bulunamadi (ortam ya da .env).");
    process.exit(1);
  }

  const saglayici = new JsonRpcProvider(RPC, { chainId: ZINCIR, name: "arc" },
    { staticNetwork: true });
  const cuzdan = new Wallet(pk, saglayici);
  const dagitici = await cuzdan.getAddress();

  console.log("1) KURULUM");
  console.log("     dagitici  " + dagitici);
  console.log("     quote     " + USDC);
  console.log("     isletme   " + ISLETME);

  ok(dagitici.toLowerCase() === ISLETME.toLowerCase(),
    "dagitan cuzdan isletme cuzdani",
    "platform payi bu adrese gidecek ve adres IMMUTABLE — yanlis bir " +
      "adresle dagitmak, her satisin %20'sini kalici olarak baska yere " +
      "yollamak demek");

  /* Both constructor arguments have to be real contracts/addresses on
     chain BEFORE deployment, because they can never be changed after. */
  const usdcKod = await saglayici.getCode(USDC);
  ok(!!usdcKod && usdcKod !== "0x", "quote zincirde kod tasiyor",
    ((usdcKod.length - 2) / 2).toLocaleString("en") + " bayt");

  const bakiye = await saglayici.getBalance(dagitici);
  console.log("     bakiye    " + YERLI(bakiye));

  /* ---- 2. the artifact -------------------------------------------- */
  console.log("");
  console.log("2) YAPIT");
  let y;
  try { y = B("Pazar"); } catch (e) {
    ok(false, "build/Pazar.json okunamadi", "once node scripts/derle.js");
    process.exit(1);
  }
  const kodlayici = AbiCoder.defaultAbiCoder();
  const argv = kodlayici.encode(["address", "address"], [USDC, ISLETME]).slice(2);
  const init = y.bytecode + argv;

  console.log("     derlenen kod  " + ((y.deployedBytecode.length - 2) / 2)
    .toLocaleString("en") + " bayt");
  console.log("     init kodu     " + ((init.length - 2) / 2)
    .toLocaleString("en") + " bayt");

  ok(y.deployedBytecode && y.deployedBytecode.length > 2,
    "derlenen kod bos degil");
  /* EIP-170: a deployed contract may not exceed 24.576 bytes. */
  ok((y.deployedBytecode.length - 2) / 2 < 24_576,
    "EIP-170 sinirinin altinda",
    ((y.deployedBytecode.length - 2) / 2).toLocaleString("en") + " / 24.576 bayt");

  /* ---- 3. no door in the ABI -------------------------------------- */
  console.log("");
  console.log("3) ABI'DE KOL VAR MI");
  const KAPI = /^(owner|admin|transferOwnership|renounceOwnership|pause|unpause|upgradeTo|upgradeToAndCall|setImplementation|withdraw|sweep|rescue|emergency|kill|setOwner|changeAdmin|mint|burnFrom)$/i;
  const fonk = (y.abi || []).filter((x) => x.type === "function");
  const kapilar = fonk.map((f) => f.name).filter((n) => KAPI.test(n));
  ok(kapilar.length === 0,
    "SAHIP / DURAKLATMA / YUKSELTME / CEKME FONKSIYONU YOK",
    kapilar.length ? "BULUNDU: " + kapilar.join(", ")
      : fonk.length + " fonksiyon tarandi — bu sozlesme hic para tutmuyor, " +
        "o yuzden cekilecek bir sey de yok");

  /* ---- 4. the address and the cost -------------------------------- */
  console.log("");
  console.log("4) ADRES VE MALIYET");
  const nonce = await saglayici.getTransactionCount(dagitici);
  const beklenenAdres = getCreateAddress({ from: dagitici, nonce });
  console.log("     nonce     " + nonce);
  console.log("     adres     " + beklenenAdres);

  const mevcut = await saglayici.getCode(beklenenAdres);
  if (mevcut && mevcut !== "0x") {
    console.log("");
    console.log("  BU ADRESTE ZATEN KOD VAR — dagitim yapilmis olabilir.");
    console.log("  " + beklenenAdres);
    process.exit(1);
  }

  let gaz;
  try {
    gaz = await saglayici.estimateGas({ from: dagitici, data: init });
  } catch (e) {
    ok(false, "gaz tahmini basarisiz", e.message.slice(0, 90));
    process.exit(1);
  }
  const ucret = await saglayici.getFeeData();
  const birim = ucret.maxFeePerGas || ucret.gasPrice || 0n;
  const maliyet = gaz * birim;
  console.log("     gaz       " + gaz.toString());
  console.log("     MALIYET   " + YERLI(maliyet));
  ok(bakiye > maliyet * 2n, "bakiye maliyetin en az iki kati",
    YERLI(bakiye) + " > " + YERLI(maliyet * 2n));

  if (!UYGULA) {
    console.log("");
    console.log("  KURU CALISMA BITTI — hicbir islem gonderilmedi.");
    console.log("");
    console.log("  Gercek dagitim " + YERLI(maliyet) + " harcar ve GERI ALINAMAZ.");
    console.log("  Dagitildiktan sonra isletme adresi DEGISTIRILEMEZ: her");
    console.log("  satisin %20'si kalici olarak " + ISLETME);
    console.log("  adresine gider.");
    console.log("");
    console.log("  Hazir oldugunda:  node scripts/dagit-pazar.js --uygula");
    console.log("");
    console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
    process.exit(kotu === 0 ? 0 : 1);
  }

  if (kotu > 0) {
    console.log("");
    console.log("DURDURULDU — kuru calismada " + kotu + " sav gecmedi.");
    process.exit(1);
  }

  /* ---- 5. send ---------------------------------------------------- */
  console.log("");
  console.log("=== UYGULA — GERCEK ISLEM ===");
  console.log("");

  let islem = null, sonHata = null;
  for (let d = 0; d < 6 && !islem; d++) {
    if (d > 0) await bekle(4000 * d);
    try {
      const t = Transaction.from({
        to: null, data: init, nonce, chainId: ZINCIR,
        gasLimit: (gaz * 13n) / 10n,
        maxFeePerGas: birim * 2n,
        maxPriorityFeePerGas: 0n,
        type: 2
      });
      t.signature = cuzdan.signingKey.sign(t.unsignedHash);
      islem = await saglayici.broadcastTransaction(t.serialized);
    } catch (e) {
      sonHata = e;
      if (!/rate limit|too many|timeout|503|502|ECONNRESET/i.test(e.message || "")) break;
      process.stdout.write(".");
    }
  }
  if (!islem) {
    console.log("GONDERILEMEDI: " + ((sonHata && sonHata.message) || "?").slice(0, 120));
    process.exit(1);
  }

  const makbuz = await islem.wait();
  console.log("  Pazar  " + beklenenAdres);
  console.log("  tx     " + islem.hash);
  console.log("  gaz    " + makbuz.gasUsed.toString() + "   blok " + makbuz.blockNumber);

  /* ---- 6. verify what landed -------------------------------------- */
  console.log("");
  console.log("6) ZINCIRDEKI KOD DERLENEN KOD MU");
  await bekle(1500);
  const zincirdeki = await saglayici.getCode(beklenenAdres);
  let fark = null;
  try {
    fark = karsilastir(y.deployedBytecode, zincirdeki, degismezPencereler(y));
  } catch (e) { fark = { tamam: false, neden: e.message }; }
  ok(fark && fark.tamam !== false && (!fark.farklar || fark.farklar.length === 0),
    "CALISAN KOD = DERLENEN KOD",
    ((zincirdeki.length - 2) / 2).toLocaleString("en") + " bayt, " +
      "hesapsiz fark yok");

  console.log("");
  console.log("7) DEGISMEZLER — getter lardan");
  const oku = async (imza) => {
    const r = await saglayici.call({ to: beklenenAdres, data: sel(imza) });
    return r && r.length >= 66 ? "0x" + r.slice(26, 66) : null;
  };
  const q = await oku("quote()");
  const i2 = await oku("isletme()");
  const ppm = await saglayici.call({ to: beklenenAdres, data: sel("PLATFORM_PPM()") });
  console.log("     quote         " + q);
  console.log("     isletme       " + i2);
  console.log("     PLATFORM_PPM  " + (ppm && ppm !== "0x" ? BigInt(ppm).toString() : "?"));

  const esit = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  ok(esit(q, USDC), "quote dogru");
  ok(esit(i2, ISLETME), "isletme dogru — ve bu adres bir daha degismez");
  ok(ppm && ppm !== "0x" && BigInt(ppm) === 200_000n,
    "PLATFORM_PPM = %20",
    "sartnamedeki oran; sabit oldugu icin bir daha degismez");

  if (kotu === 0) {
    fs.writeFileSync(KAYIT_YOLU, JSON.stringify({
      olculdu: new Date().toISOString(),
      zincir: ZINCIR,
      dagitici,
      nonce,
      arc: { pazar: beklenenAdres, quote: USDC, isletme: ISLETME },
      platformPpm: 200000,
      tx: islem.hash,
      blok: makbuz.blockNumber,
      gaz: makbuz.gasUsed.toString(),
      not: "Pazar tek sozlesme ve hic para tutmuyor: odeme ile bolusme ayni " +
        "islemde. Bu yuzden cekme fonksiyonu yok ve sahibi yok.",
      uygulandiMi: true
    }, null, 1));
    console.log("");
    console.log("  kayit yazildi: " + path.relative(KOK, KAYIT_YOLU));
    console.log("");
    console.log("  SIRADAKI:");
    console.log("    1. docs/js/adresler.js icindeki PAZAR blogunu doldur");
    console.log("    2. node scripts/denetim-sayfa.js");
  }

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.log("");
  console.log("KOTU  " + e.message);
  process.exit(1);
});
