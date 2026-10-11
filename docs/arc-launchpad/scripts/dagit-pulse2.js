"use strict";
/* ===========================================================================
 * dagit-pulse2.js — yeni nesli Arc'a dağıt
 *
 *   node scripts/dagit-pulse2.js              # fiyatlar, hiçbir şey göndermez
 *   node scripts/dagit-pulse2.js --uygula
 *
 * ÜÇ SÖZLEŞME, VE PAYLAŞILAN ALTYAPI YENİDEN DAĞITILMIYOR
 *   PulseFabrika, PulseLaunchpad, PulseHook. Bunlar yeni.
 *
 *   KasaFabrika, CrossChainAssetRegistry, YoneticiFabrika, GelistiriciFonu
 *   ve LikiditeKasasi zincirde duruyor ve yeniden dağıtılmıyor. Kayıt
 *   zincir kümesini KURUCUDA sabitliyor ve zincirdeki olan Ethereum ile
 *   Base'deki gerçek fabrikalara bakıyor, bayt bayt doğrulanmış. İkinci
 *   bir kayıt, bir tokenin teminatının nereye gittiğine dair ikinci bir
 *   cevap olurdu.
 *
 * ADRES DÖNGÜSÜ: LAUNCHPAD KANCAYI, KANCA LAUNCHPAD'İ BİLMEK ZORUNDA
 *   İkisi de immutable, yani biri önce dağıtılamaz. Kırılma noktası
 *   şurası: launchpad CREATE ile gidiyor, yani adresi dağıtıcının
 *   nonce'undan ÖNCEDEN hesaplanabiliyor. O adresle kancanın init kodu
 *   kurulup salt'ı madenleniyor, sonra launchpad madenlenmiş kanca
 *   adresiyle dağıtılıyor.
 *
 *   Tahmin doğrulanıyor, varsayılmıyor: her adım DÜŞTÜĞÜ adresle
 *   karşılaştırılıyor. Bu projede kanca bir kez `quote` yerine launchpad
 *   adresiyle canlıya çıktı ve dağıtım o sırada başarılı göründü.
 *
 * KANCA ADRESİ 0xACC İLE BİTMEK ZORUNDA — VE 0xA44 DEĞİL
 *   v4 bir kancanın alt bitlerini okuyup hangi callback'leri alacağına
 *   karar veriyor. Önceki nesil 0xa44'teydi. Yeni kanca `beforeSwap` ve
 *   `beforeSwapReturnsDelta` ekliyor:
 *
 *     beforeAddLiquidity      1 << 11   0x800
 *     beforeRemoveLiquidity   1 <<  9   0x200
 *     beforeSwap              1 <<  7   0x080   <- yeni
 *     afterSwap               1 <<  6   0x040
 *     beforeSwapReturnsDelta  1 <<  3   0x008   <- yeni
 *     afterSwapReturnsDelta   1 <<  2   0x004
 *                                       -----
 *                                       0xacc
 *
 *   Eski son ekte dağıtılsa `beforeSwap` hiç çağrılmaz ve alım bacağının
 *   vergisi sessizce token olarak derinliğe giderdi — ölçülen hata tam
 *   buydu: kasaya $0,000000.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const {
  JsonRpcProvider, Wallet, AbiCoder, keccak256, getCreateAddress,
  getCreate2Address, Transaction, Interface
} = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const ZINCIR = 5042;
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

const UYGULA = process.argv.includes("--uygula");
const coder = AbiCoder.defaultAbiCoder();
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));

/* Hook capability bits for THIS generation. */
const GEREKEN = (1 << 11) | (1 << 9) | (1 << 7) | (1 << 6) | (1 << 3) | (1 << 2);  // 0xacc
const MASKE = (1 << 14) - 1;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

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

function madenle(initCodeHash) {
  const t0 = Date.now();
  for (let i = 0; i < 20_000_000; i++) {
    const salt = "0x" + i.toString(16).padStart(64, "0");
    const a = getCreate2Address(CREATE2_FACTORY, salt, initCodeHash);
    if ((parseInt(a.slice(-4), 16) & MASKE) === GEREKEN) {
      return { salt, adres: a, deneme: i + 1, ms: Date.now() - t0 };
    }
  }
  return null;
}

/* TWO formatters, named apart on purpose.
   On Arc the gas token IS USDC, which makes one tempting. They are not
   interchangeable: the native balance is 18 decimals and the ERC20 view
   of the same money is 6, measured at a ratio of exactly 1e12. Using the
   6-decimal one on a native balance once produced a $497 BILLION
   deployment estimate. */
const YERLI = (v) => "$" + (Number(v) / 1e18).toLocaleString("en",
  { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const ERC = (v) => "$" + (Number(v) / 1e6).toLocaleString("en",
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  const eski = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse.json"), "utf8"));
  const PM = eski.arc.poolManager;
  const USDC = eski.arc.quote;
  const KASA_FABRIKA = eski.arc.kasaFabrika;
  const KAYIT = eski.arc.kayit;
  const GELISTIRICI = eski.arc.gelistiriciFonu;
  const LIKIDITE = eski.arc.likiditeKasasi;
  const TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
  const MESAJ_TASIYICI = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
  /* The operations sink. Called "isletme" here and on screen and nowhere
     anything else: a visible on-chain address tied to anything else would
     leak what that thing is doing. */
  const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";

  /* THE FTHM GOVERNOR, WHICH WAS ALREADY DEPLOYED
       The instruction was "ALP goes, FTHM becomes the only governance
       token", and the obvious reading was a five-contract cascade: new
       staking, new governor, new devpool, new hook, new launchpad.
       Measuring first showed FTHM already has its own complete stack —
       governor 5.379 bytes, stake 5.029 bytes with token() = FTHM, and
       the same parameters as the ALP one: 5 days of voting, 2 days of
       timelock, 10% quorum, 1% threshold, guardian active.

       So nothing about FTHM needs deploying. What needs deploying is a
       developer pool the FTHM governor controls, because DevPool holds
       its governor as an immutable and the deployed one points at the ALP
       governor. */
  const FTHM_GOVERNOR = "0x1084AD3162afC8A62736D604598377D8e6Be8D95";

  console.log("PULSE NESIL 2 — Arc dagitimi");
  console.log("  kip  " + (UYGULA ? "UYGULA — GERCEK ISLEM, GERI ALINAMAZ" : "KURU CALISMA"));
  console.log("  rpc  " + RPC);
  console.log("");
  console.log("0) YENIDEN DAGITILMAYANLAR — zincirde duruyor, dogrulanmis");
  console.log("     poolManager   " + PM);
  console.log("     kasaFabrika   " + KASA_FABRIKA);
  console.log("     kayit         " + KAYIT);
  console.log("     gelistirici   " + GELISTIRICI);
  console.log("     likidite      " + LIKIDITE);
  console.log("     isletme       " + ISLETME);

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const saglayici = new JsonRpcProvider(RPC, { chainId: ZINCIR, name: "arc" },
    { staticNetwork: true });
  const cuzdan = new Wallet(pk, saglayici);
  const dagitici = await cuzdan.getAddress();
  const zincirNonce = await saglayici.getTransactionCount(dagitici);
  const bakiye = await saglayici.getBalance(dagitici);

  /* ---- resume, from the chain -------------------------------------- */
  /* The previous generation's deployment died twice mid-run — a stale
     nonce and a rate limit — and recovering both times depended on being
     able to tell what had already landed. That has to be asked of the
     chain: the plan file was not written when the process exited. */
  const planYolu = path.join(KOK, "dagitim-pulse2-plan.json");
  const onceki = fs.existsSync(planYolu)
    ? JSON.parse(fs.readFileSync(planYolu, "utf8"))
    : null;

  let nonce = zincirNonce;
  let devam = false;
  /* Only an INCOMPLETE run resumes. The first round of this generation
     finished and was recorded, and resuming it would have skipped every
     step as "already on chain" — redeploying nothing while reporting
     success. */
  if (onceki && !onceki.uygulandiMi &&
      typeof onceki.nonce === "number" && zincirNonce > onceki.nonce) {
    const kod = await saglayici.getCode(onceki.tahminler.likiditeKasasi);
    if (kod && kod !== "0x") {
      nonce = onceki.nonce;
      devam = true;
    }
  }

  console.log("");
  console.log("1) DAGITICI");
  console.log("     adres   " + dagitici);
  console.log("     nonce   " + zincirNonce + (devam ? "   (DEVAM: plan nonce " + nonce + ")" : ""));
  console.log("     bakiye  " + YERLI(bakiye) + "   (Arc'ta gaz USDC)");

  /* ---- the address ring ------------------------------------------- */
  const FB = B("PulseFabrika");
  const LPB = B("PulseLaunchpad");
  const HKB = B("PulseHook");

  /* PULSEFABRIKA YENIDEN DAGITILMIYOR
       It carries no immutable at all — everything it needs arrives as a
       parameter, including which launchpad the supply goes to. So the one
       already on chain serves this round too, and redeploying it would
       spend gas to produce a byte-identical contract at a new address.
       Verified below by reading its code, not by assuming. */
  const fabrikaAdres = (onceki && onceki.dagitilan && onceki.dagitilan.PulseFabrika)
    || "0x065B318A624275bFF6833d0408DC572482BBF227";

  /* THE RING IS NOW THREE DEEP
       launchpad needs the liquidity vault, the vault needs the launchpad,
       and the hook needs both. All three are CREATE or CREATE2, so all
       three are derivable from one nonce — which is the only reason this
       can be deployed at all. */
  /* THE LIQUIDITY VAULT HAS TO MOVE TOO, AND THIS IS THE DEFECT THAT
     ALREADY BIT ONCE
       PulseLikiditeKasasi holds the launchpad as an immutable. Redeploy
       the launchpad and leave the vault behind, and besle() reads the
       wrong register — the 0,50% slice accumulates in a vault that cannot
       forward it. That is exactly what happened in round one with the
       previous generation's vault, measured as BilinmeyenToken, and
       nothing reverted during a trade.

       So every contract that holds the launchpad or the dev pool as an
       immutable moves with them. Four, not three. */
  const devPoolAdres = getCreateAddress({ from: dagitici, nonce });
  const likiditeAdres = getCreateAddress({ from: dagitici, nonce: nonce + 1 });
  const lpAdres = getCreateAddress({ from: dagitici, nonce: nonce + 2 });

  const fabKod = await saglayici.getCode(fabrikaAdres);
  ok(!!fabKod && fabKod !== "0x" &&
     (fabKod.length - 2) / 2 === (B("PulseFabrika").deployedBytecode.length - 2) / 2,
    "MEVCUT PulseFabrika YENIDEN KULLANILABILIR",
    fabrikaAdres + "   " + ((fabKod.length - 2) / 2) + " bayt, derlenenle ayni boyda");

  console.log("");
  console.log("2) ADRESLER — CREATE nonce'tan onceden");
  console.log("     fabrika     " + fabrikaAdres + "   (ZINCIRDE, yeniden kullaniliyor)");
  console.log("     devPool     " + devPoolAdres + "   nonce " + nonce +
    "   (governor = FTHM)");
  console.log("     likidite    " + likiditeAdres + "   nonce " + (nonce + 1));
  console.log("     launchpad   " + lpAdres + "   nonce " + (nonce + 2));

  /* The hook's init code embeds the PREDICTED launchpad, so the salt can
     only be mined after that address is known — and the launchpad can
     only be deployed after the salt gives the hook's address. The loop
     breaks here and nowhere else. */
  const hookInit = HKB.bytecode + coder.encode(
    ["address", "address", "address", "address", "address", "address"],
    [PM, lpAdres, USDC, devPoolAdres, likiditeAdres, ISLETME]).slice(2);
  const hookHash = keccak256(hookInit);

  console.log("");
  console.log("3) KANCA ADRESI MADENCILIGI — alt 14 bit 0x" +
    GEREKEN.toString(16) + " olmali");
  const m = madenle(hookHash);
  if (!m) { console.log("     salt bulunamadi"); process.exit(1); }
  console.log("     salt      " + m.salt);
  console.log("     adres     " + m.adres);
  console.log("     deneme    " + m.deneme.toLocaleString("en") + "   " + m.ms + " ms");
  ok((parseInt(m.adres.slice(-4), 16) & MASKE) === GEREKEN,
    "HOOK ADRESI DOGRU IZIN BITLERIYLE BITIYOR",
    "0x" + (parseInt(m.adres.slice(-4), 16) & MASKE).toString(16) +
      " — beforeAddLiquidity, beforeRemoveLiquidity, beforeSwap, " +
      "afterSwap ve iki returnDelta");

  /* ---- the launchpad's constructor, with the mined hook ----------- */
  const lpArg = coder.encode(
    ["address", "address", "address", "address", "address",
     "address", "address", "address", "address", "address", "address"],
    [USDC, PM, m.adres, fabrikaAdres, KASA_FABRIKA,
     devPoolAdres, likiditeAdres, ISLETME, KAYIT, TOKEN_MESSENGER, MESAJ_TASIYICI]);
  const lpInit = LPB.bytecode + lpArg.slice(2);

  /* THE RING, CHECKED BOTH WAYS BEFORE ANYTHING IS SENT
     The hook's immutable holds lpAdres; the launchpad's holds m.adres.
     Both are derivations, so both can be recomputed here — and a
     deployment that passes its own prediction check while the two point
     at each other's wrong address is exactly what shipped once. */
  console.log("");
  console.log("4) HALKA KAPANIYOR MU");
  console.log("     launchpad'e verilen hook      " + m.adres);
  console.log("     hook'un bildigi launchpad     " + lpAdres);
  console.log("     ikisinin bildigi likidite     " + likiditeAdres);
  console.log("     likiditenin bildigi launchpad " + lpAdres);
  ok(getCreateAddress({ from: dagitici, nonce: nonce + 2 }).toLowerCase() === lpAdres.toLowerCase(),
    "HOOK <-> LAUNCHPAD DONGUSU KAPALI",
    "kanca, nonce+2'den hesaplanan launchpad adresine gore madenlendi");
  console.log("     ikisinin bildigi devPool      " + devPoolAdres);
  console.log("     devPool'un bildigi governor   " + FTHM_GOVERNOR + "   (FTHM)");

  const DPB = B("DevPool");
  const dpInit = DPB.bytecode + coder.encode(["address"], [FTHM_GOVERNOR]).slice(2);

  const LKB = B("PulseLikiditeKasasi");
  const lkInit = LKB.bytecode + coder.encode(["address", "address"],
    [USDC, lpAdres]).slice(2);

  const adimlar = [
    { ad: "DevPool", init: dpInit, tip: "CREATE", beklenen: devPoolAdres },
    { ad: "PulseLikiditeKasasi", init: lkInit, tip: "CREATE", beklenen: likiditeAdres },
    { ad: "PulseLaunchpad", init: lpInit, tip: "CREATE", beklenen: lpAdres },
    { ad: "PulseHook", init: hookInit, tip: "CREATE2", beklenen: m.adres }
  ];

  /* ---- cost ------------------------------------------------------- */
  console.log("");
  console.log("5) MALIYET");
  let toplamGaz = 0n;
  for (const a of adimlar) {
    let gaz = null;
    try {
      gaz = a.tip === "CREATE2"
        ? await saglayici.estimateGas({ from: dagitici, to: CREATE2_FACTORY,
                                        data: m.salt + a.init.slice(2) })
        : await saglayici.estimateGas({ from: dagitici, data: a.init });
    } catch (e) {
      console.log("     " + a.ad.padEnd(16) + "gaz tahmini basarisiz: " +
        e.message.slice(0, 60));
    }
    if (gaz !== null) {
      toplamGaz += gaz;
      console.log("     " + a.ad.padEnd(16) +
        (((a.init.length - 2) / 2)).toLocaleString("en").padStart(7) + " bayt  " +
        gaz.toString().padStart(9) + " gaz   " + a.tip);
    }
  }
  const ucret = await saglayici.getFeeData();
  const birim = ucret.maxFeePerGas || ucret.gasPrice || 0n;
  const maliyet = toplamGaz * birim;
  console.log("");
  console.log("     toplam gaz  " + toplamGaz.toString());
  console.log("     MALIYET     " + YERLI(maliyet));
  ok(bakiye > maliyet * 2n, "bakiye maliyetin en az iki kati",
    YERLI(bakiye) + " > " + YERLI(maliyet * 2n));

  const kayit = {
    olculdu: new Date().toISOString(),
    zincir: ZINCIR, dagitici, nonce,
    poolManager: PM, quote: USDC,
    paylasilan: {
      kasaFabrika: KASA_FABRIKA, kayit: KAYIT,
      gelistiriciFonu: GELISTIRICI, likiditeKasasi: LIKIDITE, isletme: ISLETME
    },
    tahminler: {
      fabrika: fabrikaAdres, devPool: devPoolAdres,
      likiditeKasasi: likiditeAdres, launchpad: lpAdres, hook: m.adres
    },
    fthmGovernor: FTHM_GOVERNOR,
    /* Why this round exists at all, recorded next to what it produced:
       the first round pointed the 0,50% slice at the previous
       generation's liquidity vault, whose besle() cannot recognise a
       new-generation token. Measured — it reverts BilinmeyenToken — so
       the slice would have accumulated there unreachable. */
    oncekiTurRetNedeni: "Gelistirici payinin %0,30'u tahsiscisi ISLETME " +
      "CUZDANI olan bir fona gidiyordu; DAO ona dokunamiyordu ve tahsisci " +
      "immutable. Yeni DevPool'un governor'i FTHM DAO'su.",
    emekliTur: onceki && onceki.uygulandiMi ? onceki.dagitilan : null,
    hookSalt: m.salt,
    gaz: toplamGaz.toString(), maliyet: maliyet.toString(),
    uygulandiMi: false
  };
  fs.writeFileSync(planYolu, JSON.stringify(kayit, null, 1));
  console.log("");
  console.log("6) PLAN KAYDEDILDI");
  console.log("     " + path.relative(KOK, planYolu));

  if (!UYGULA) {
    console.log("");
    console.log("  KURU CALISMA BITTI — hicbir islem gonderilmedi.");
    console.log("");
    console.log("  Gercek dagitim " + YERLI(maliyet) + " harcar ve GERI ALINAMAZ.");
    console.log("  Nonce " + nonce + "'ten baslayan sira BOZULMAMALI: arada baska");
    console.log("  bir islem gonderilirse launchpad adresi kayar ve madenlenmis");
    console.log("  kanca yanlis bir launchpad'e bakar.");
    console.log("");
    console.log("  Hazir oldugunda:  node scripts/dagit-pulse2.js --uygula");
    console.log("");
    console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
    process.exit(kotu === 0 ? 0 : 1);
  }

  if (kotu > 0) {
    console.log("");
    console.log("DURDURULDU — kuru calismada " + kotu + " sav gecmedi.");
    process.exit(1);
  }

  /* ---- send ------------------------------------------------------- */
  console.log("");
  console.log("=== UYGULA — GERCEK ISLEMLER ===");
  console.log("");

  /* How many already landed, asked of the chain rather than of the plan.
     The nonce says how many transactions this deployer sent; it does not
     say that each of them was one of THESE. */
  let atlanan = 0;
  for (const a of adimlar) {
    const kod = await saglayici.getCode(a.beklenen);
    if (kod && kod !== "0x") atlanan++;
    else break;
  }
  if (zincirNonce !== nonce + atlanan) {
    console.log("DURDURULDU — nonce beklenenle tutmuyor.");
    console.log("  plan nonce " + nonce + ", zincirde dusen " + atlanan +
      ", beklenen " + (nonce + atlanan) + ", gercek " + zincirNonce);
    console.log("  Aradaki fark bu cuzdanin baska bir islem gonderdigi");
    console.log("  anlamina gelir; o zaman kalan tahminler kayar.");
    process.exit(1);
  }
  if (atlanan > 0) console.log("  " + atlanan + " adim zincirde, atlaniyor.");

  const dagitilan = {};
  for (let i = 0; i < adimlar.length; i++) {
    const a = adimlar[i];
    process.stdout.write("  " + (i + 1) + ". " + a.ad.padEnd(16));

    if (i < atlanan) {
      dagitilan[a.ad] = a.beklenen;
      console.log(a.beklenen + "   (zincirde)");
      continue;
    }

    const to = a.tip === "CREATE2" ? CREATE2_FACTORY : null;
    const data = a.tip === "CREATE2" ? m.salt + a.init.slice(2) : a.init;

    /* Explicit nonce, and retries on throttling. Both were learned the
       expensive way: a stale node count made one deployment reuse a
       nonce, and a rate limit killed another at step 8 of 9. */
    let gaz;
    try {
      gaz = await saglayici.estimateGas(to ? { from: dagitici, to, data }
                                          : { from: dagitici, data });
    } catch (e) {
      console.log("GAZ TAHMINI BASARISIZ: " + e.message.slice(0, 80));
      process.exit(1);
    }

    let islem = null, sonHata = null;
    for (let d = 0; d < 6 && !islem; d++) {
      if (d > 0) await bekle(4000 * d);
      try {
        const t = Transaction.from({
          to, data, nonce: nonce + i, chainId: ZINCIR,
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
      console.log("GONDERILEMEDI: " + ((sonHata && sonHata.message) || "?").slice(0, 100));
      console.log("");
      console.log("  Zincirde " + i + " sozlesme var. Ayni komut kaldigi");
      console.log("  yerden devam eder.");
      process.exit(1);
    }

    const makbuz = await islem.wait();
    const dustu = a.tip === "CREATE2" ? a.beklenen : makbuz.contractAddress;
    if (!dustu || dustu.toLowerCase() !== a.beklenen.toLowerCase()) {
      console.log("SAPMA — beklenen " + a.beklenen + ", dustu " + dustu);
      process.exit(1);
    }

    /* Read after write needs retries: a node can have the block and not
       yet the state behind it, and that once reported a correct
       deployment as a mismatch. */
    let kod = "0x";
    for (let d = 0; d < 6 && (!kod || kod === "0x"); d++) {
      if (d > 0) await bekle(2000);
      try { kod = await saglayici.getCode(dustu); } catch (e) { kod = "0x"; }
    }
    const boy = (kod.length - 2) / 2;
    const beklenenBoy = (B(a.ad).deployedBytecode.length - 2) / 2;
    if (boy !== beklenenBoy) {
      console.log("KOD UYUSMUYOR — beklenen " + beklenenBoy + ", zincirde " + boy);
      process.exit(1);
    }

    dagitilan[a.ad] = dustu;
    console.log(dustu + "   " + boy.toLocaleString("en") + " bayt   gaz " +
      makbuz.gasUsed.toString());
  }

  const sonBakiye = await saglayici.getBalance(dagitici);
  console.log("");
  console.log("  harcanan " + YERLI(bakiye - sonBakiye) + "   kalan " + YERLI(sonBakiye));

  kayit.uygulandiMi = true;
  kayit.dagitilan = dagitilan;
  kayit.dagitimZamani = new Date().toISOString();
  fs.writeFileSync(planYolu, JSON.stringify(kayit, null, 1));

  console.log("");
  console.log("  DAGITILDI.");
  console.log("");
  console.log("  SIRADAKI — ve bunlar yapilmadan arayuz baglanmamali:");
  console.log("    1. node scripts/denetim-dagitim-pulse2.js");
  console.log("       calisan kodun derlenen kod oldugunu ve halkanin iki");
  console.log("       uctan kapandigini zincirden dogrular, kaydi o yazar");
  console.log("    2. docs/js/adresler.js icindeki PULSE blogunu doldur");
  console.log("    3. node scripts/denetim-sayfa.js");
  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
