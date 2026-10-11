"use strict";
/* ===========================================================================
 * dagit-pulse.js — yeni yığının dağıtımı: önce kuru, sonra gerçek
 *
 *   node scripts/dagit-pulse.js              # KURU — hiçbir şey harcamaz
 *   node scripts/dagit-pulse.js --uygula     # gerçek işlem, gerçek USDC
 *
 * NEDEN AYRI BİR BETİK
 *   `scripts/dagit.js` ESKİ yığını dağıtıyor (Launchpad + ArcLaunchHook) ve
 *   o zincirde canlı. Bu betik yeni yığını dağıtıyor: EgriFabrika,
 *   AciciFabrika, ChainlinkOracle, GelistiriciFonu, LikiditeKasasi,
 *   EgriLaunchpad, EgriHook. Eskisini düzenlemek, canlı bir dağıtımın
 *   kaydını bozmak olurdu.
 *
 * İKİ DÖNGÜ VE NASIL ÇÖZÜLDÜĞÜ
 *   LikiditeKasasi launchpad'in adresini istiyor, launchpad LikiditeKasasi'yı.
 *   Launchpad hook'un adresini istiyor, hook launchpad'i. İkisi de aynı
 *   şeyle çözülüyor: launchpad'in adresi CREATE ile ÖNCEDEN hesaplanabilir,
 *   çünkü gönderen ve nonce biliniyor.
 *
 *     launchpad = CREATE(dagitici, nonce + 5)
 *
 *   Bu adres bilinince hook'un init kodu kurulabilir, salt madenlenebilir ve
 *   hook'un adresi de önceden bilinir. Sonra gerçek dağıtım sırasında her
 *   adım, DÜŞTÜĞÜ adresin tahmin edilenle aynı olup olmadığına bakıyor.
 *
 *   Bu kontrol atlanabilir görünür ve atlanamaz: bu projede hook bir kez
 *   `quote` yerine launchpad adresiyle canlıya çıktı. Tahmini
 *   doğrulamadan geçmek, aynı hatanın bir sonraki hali.
 *
 * NEDEN ADRES MADENLENİYOR
 *   Uniswap v4 bir hook'un yeteneklerini ADRESİNİN alt 14 bitinden okuyor.
 *   EgriHook'un ihtiyacı olan küme:
 *
 *     beforeAddLiquidity    1 << 11
 *     beforeRemoveLiquidity 1 << 9
 *     afterSwap             1 << 6
 *     afterSwapReturnDelta  1 << 2   = 0xa44
 *
 *   Normal bir dağıtım adresini seçemez, o yüzden hook CREATE2 fabrikasından
 *   çıkıyor ve salt bu desen bulunana kadar aranıyor. Beklenen deneme
 *   sayısı 2^14 = 16.384 — saniyeler.
 *
 * NEDEN VARSAYILAN KURU ÇALIŞMA
 *   Dağıtım geri alınamaz ve gerçek USDC harcar. `--uygula` olmadan bu betik
 *   tek bir işlem göndermez: yalnızca her adresi hesaplar, salt'ı madenler,
 *   zincirden bakiyeyi ve nonce'u okur ve ne olacağını yazar.
 * =========================================================================== */
const {
  JsonRpcProvider, Wallet, AbiCoder, keccak256,
  getCreate2Address, getCreateAddress, formatUnits
} = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
/* Deterministic CREATE2 factory, same address on most chains. */
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const USDC = "0x3600000000000000000000000000000000000000";

/* CCTP v2, measured at the same deterministic addresses on Arc, Ethereum
   and Base — identical byte lengths too. The launchpad hands these to
   every vault it builds, so a vault never has to be told where CCTP is. */
const TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const MESAJ_TASIYICI = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

/* The operations sink. Recorded in ADRESLER.md as the user's share. The
   contract and the page call it "isletme" and never anything else: tying a
   visible on-chain address to the bot would leak what the bot is doing. */
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";

const HOLD_PERIOD = 24 * 60 * 60;   // holder rewards: 24h
const SNIPE_SURESI = 5;             // measured: ~99% at second 0, gone in ~10s

/* Hook capability bits. */
const GEREKEN = (1 << 11) | (1 << 9) | (1 << 6) | (1 << 2);   // 0xa44
const MASKE = (1 << 14) - 1;

const UYGULA = process.argv.includes("--uygula");
const coder = AbiCoder.defaultAbiCoder();
const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));

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

function madenle(initCodeHash) {
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

/* TWO formatters, named apart on purpose.
 *
 * On Arc the gas token IS USDC, which makes it tempting to use one. They
 * have different scales: the NATIVE balance and gas prices are 18 decimals
 * like any EVM chain, while the ERC20 USDC contract has 6. Measured
 * elsewhere in this project: 1e21 wei of native reads back as $1,000.
 *
 * The first version of this script used the 6-decimal formatter for the
 * native balance and reported a $497 BILLION deployment cost against a $16
 * TRILLION balance. The real figures are $0.50 and $16.47. This is the
 * same six-versus-eighteen mistake the contracts own comments warn about,
 * made one more time — hence two names that cannot be swapped by accident. */
const YERLI = (v) => "$" + Number(formatUnits(v, 18)).toLocaleString("en", {
  minimumFractionDigits: 2, maximumFractionDigits: 4
});
const ERC = (v) => "$" + Number(formatUnits(v, 6)).toLocaleString("en", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  console.log("ARC PULSE — YENI YIGIN DAGITIMI");
  console.log("  rpc          " + RPC);
  console.log("  poolManager  " + POOL_MANAGER);
  console.log("  kip          " + (UYGULA ? "UYGULA — GERCEK ISLEM, GERCEK USDC" : "KURU CALISMA (hicbir islem gonderilmez)"));
  console.log("");

  const pk = ozelAnahtar();
  if (!pk) {
    console.log("TRADER_PRIVATE_KEY bulunamadi. Kuru calisma bile dagitici");
    console.log("adresini ve nonce'u bilmek zorunda, cunku butun adresler ondan");
    console.log("tureniyor.");
    process.exit(1);
  }

  const saglayici = new JsonRpcProvider(RPC, { chainId: CHAIN_ID, name: "arc" }, { staticNetwork: true });
  const cuzdan = new Wallet(pk, saglayici);
  const dagitici = await cuzdan.getAddress();
  const zincirNonce = await saglayici.getTransactionCount(dagitici);

  /* ---- THE BASE NONCE, AND WHY IT IS NOT ALWAYS THE CHAIN'S ------
   *
   * Every address in this deployment is CREATE from one nonce sequence,
   * and the hook is CREATE2 MINED against the launchpad address that
   * sequence produces. So the base nonce is not an input — it is the
   * thing everything else hangs off.
   *
   * Measured: the run died at step 8 of 9 with "rate limit exceeded"
   * after seven contracts had landed. On the next run the chain's nonce
   * was 1243 instead of 1236, and taking the chain's answer as the base
   * would have shifted all nine predictions by seven — including the
   * launchpad the hook was mined for. The hook would have been deployed
   * pointing at an address with no launchpad in it, which is the exact
   * failure this project already shipped once.
   *
   * So when a previous plan's predictions already hold code, that plan's
   * base nonce is reused and the landed steps are skipped. The identity
   * check below is what makes that safe rather than hopeful.
   */
  const planYolu = path.join(__dirname, "..", "dagitim-pulse-plan.json");
  const oncekiPlan = fs.existsSync(planYolu)
    ? JSON.parse(fs.readFileSync(planYolu, "utf8"))
    : null;

  let nonce = zincirNonce;
  let devamEdiliyor = false;
  if (oncekiPlan && typeof oncekiPlan.nonce === "number" &&
      oncekiPlan.tahminler && zincirNonce > oncekiPlan.nonce) {
    const ilk = Object.values(oncekiPlan.tahminler)[0];
    const kod = ilk ? await saglayici.getCode(ilk) : "0x";
    if (kod && kod !== "0x") {
      nonce = oncekiPlan.nonce;
      devamEdiliyor = true;
      console.log("  DEVAM EDILIYOR — onceki kosum yarida kalmis");
      console.log("    plan nonce " + nonce + ", zincir nonce " + zincirNonce +
        "   (" + (zincirNonce - nonce) + " sozlesme dustu)");
      console.log("");
    }
  }

  /* On Arc the gas token IS USDC, so one balance answers both questions. */
  const bakiye = await saglayici.getBalance(dagitici);

  console.log("  dagitici     " + dagitici);
  console.log("  nonce        " + nonce);
  console.log("  bakiye       " + YERLI(bakiye) + "   (Arc'ta gaz tokeni USDC)");
  console.log("");

  /* ---- the remote chains the registry will be FIXED with ------------
   *
   * CrossChainAssetRegistry has no addChain. A key that can add a chain
   * can add one whose "factory" it controls, which is the whole loss the
   * CREATE2 derivation exists to prevent. So the set is settled here, at
   * construction, and never again.
   *
   * That makes the remote factory addresses load-bearing: if one is
   * wrong, Arc derives remote vaults at an address nobody deploys to and
   * there is no way to correct it. Two sources, and only one is safe:
   *
   *   dagitim-uzak-plan.json with `dagitildi` set   REAL, read from chain
   *   the same file with only `fabrika`             PREDICTED from nonce
   *
   * A prediction holds only while that wallet sends nothing else on that
   * chain. This script refuses to use one unless told to. */
  const uzakYol = path.join(__dirname, "..", "dagitim-uzak-plan.json");
  let uzakZincirler = [];
  let uzakGercek = false;
  if (fs.existsSync(uzakYol)) {
    const u = JSON.parse(fs.readFileSync(uzakYol, "utf8"));
    uzakGercek = Object.values(u.zincirler || {}).every((z) => z.dagitildi);
    uzakZincirler = Object.entries(u.zincirler || {}).map(([ad, z]) => ({
      ad, cctpDomain: z.cctpDomain, zincirId: z.zincirId,
      uzakFabrika: z.dagitildi || z.fabrika,
      initKodHash: z.initKodHash, uzakQuote: z.usdc,
      /* Carried only so the plan can be read back and checked. The
         registry does not store it: the pool source is wired into the
         remote factory at ITS construction, on its own chain. */
      havuzFiyat: z.havuzFiyat || null,
      gercekMi: !!z.dagitildi
    }));
  }

  console.log("0) UZAK ZINCIRLER — kayit bunlarla SABITLENECEK");
  if (uzakZincirler.length === 0) {
    console.log("   dagitim-uzak-plan.json henuz yok.");
    console.log("");
    console.log("   Iki betik birbirine bagli ve dongu burada kiriliyor:");
    console.log("     - dagit-uzak.js, Arc tarafindaki gonderenin (KasaFabrika)");
     console.log("       adresini bu planin tahminlerinden okuyor;");
    console.log("     - bu betik de uzak fabrika adreslerini o planin");
    console.log("       sonucundan okuyor.");
    console.log("");
    console.log("   Bu yuzden KURU calisma devam ediyor: isi tam olarak oteki");
    console.log("   betigin ihtiyaci olan tahminleri uretmek. Gercek dagitim ise");
    console.log("   uzak adresler olmadan calismayacak.");
    if (UYGULA) {
      console.log("");
      console.log("   DURDURULDU — kayit zincir kumesini KURUCUDA sabitliyor ve");
      console.log("   addChain yok. Bos bir kumeyle dagitmak, zincirler arasi");
      console.log("   yolu KALICI olarak kapatmak demek.");
      console.log("");
      console.log("   Sira:  node scripts/dagit-uzak.js            (kuru)");
      console.log("          node scripts/dagit-uzak.js --uygula   (fonlandiktan sonra)");
          console.log("          node scripts/dagit-pulse.js --uygula");
      process.exit(1);
    }
  }
  for (const z of uzakZincirler) {
    console.log("   " + z.ad.padEnd(10) + "domain " + String(z.cctpDomain).padStart(2) +
      "   fabrika " + z.uzakFabrika + "   " + (z.gercekMi ? "GERCEK" : "TAHMIN"));
  }
  ok(uzakGercek,
    "UZAK FABRIKA ADRESLERI ZINCIRDEN OKUNDU, TAHMIN DEGIL",
    uzakGercek ? uzakZincirler.length + " zincir"
      : "TAHMIN kullaniliyor — o cuzdan o zincirde arada bir islem " +
        "gonderirse nonce kayar ve Arc kaydi kalici olarak bos bir " +
        "adrese bakar. Once: node scripts/dagit-uzak.js --uygula");
  console.log("");

  /* ---- the collateral list, measured not assumed ------------------
   *
   * BU BOLUM YANLIS DOSYAYI DOGRULUYORDU
   *   Burada `teminat-evreni.json` kontrol ediliyordu: bes varlik, hepsi
   *   Chainlink proxy'si. O dosya ChainlinkOracle icin vardi, oracle da
   *   TeminatKasasi'nin agirlikli sepetini fiyatlandirmak icin. Ikisi de
   *   kaldirildi — bu dagitimda artik hicbir sey fiyat okumuyor.
   *
   *   Yani kontrol gecerken hicbir sey dogrulamiyordu: kullanilmayan bir
   *   dosyanin dolu olmasi, teminat hakkinda hicbir sey soylemez. Asil
   *   liste ise hic kontrol edilmiyordu.
   *
   * SIMDI OLCULEN SEY
   *   Arayuzun gercekten okudugu uretilmis liste ve onun arkasindaki
   *   derinlik olcumu. Olcumun TARIHI de kontrol ediliyor: havuz
   *   derinligi degisen bir sey, ve aylik eski bir olcumle "su tutara
   *   kadar calisir" demek, olcmemekten kotu.
   */
  const listeYolu = path.join(__dirname, "..", "docs", "js", "teminat-listesi.js");
  const derinlikYolu = path.join(__dirname, "..", "teminat-derinlik.json");
  if (!fs.existsSync(listeYolu) || !fs.existsSync(derinlikYolu)) {
    console.log("Teminat listesi yok. Once:");
    console.log("  node scripts/olc-teminat-derinlik.js");
    console.log("  node scripts/kur-teminat-listesi.js");
    process.exit(1);
  }
  const derinlik = JSON.parse(fs.readFileSync(derinlikYolu, "utf8"));
  const listeKaynak = fs.readFileSync(listeYolu, "utf8");

  const satirSayisi = (listeKaynak.match(/^  {$/gm) || []).length;
  const donusenler = derinlik.zincirler.reduce((n, z) =>
    n + z.adaylar.filter((x) => x.donusturulebilir).length, 0);
  const semboller = new Set(derinlik.zincirler.flatMap((z) =>
    z.adaylar.filter((x) => x.donusturulebilir).map((x) => x.simge)));

  console.log("1) TEMINAT LISTESI — " + satirSayisi + " oneri, " +
    derinlik.olculdu.slice(0, 10) + " tarihinde olculdu");
  console.log("   donusturulebilen " + donusenler + " varlik-zincir cifti, " +
    semboller.size + " ayri sembol");
  for (const z of derinlik.zincirler) {
    const d = z.adaylar.filter((x) => x.donusturulebilir).length;
    console.log("   " + z.ad.padEnd(11) + "aday " + String(z.adaylar.length).padStart(4) +
      "   donusturulebilen " + (z.quoter ? String(d).padStart(3) : "olculemedi"));
  }

  ok(satirSayisi >= 20, "oneri listesi dolu", satirSayisi + " satir");
  ok(semboller.size >= 20,
    "ONERILEN HER VARLIK GERCEKTEN DONUSTURULEBILIYOR",
    semboller.size + " sembol — olcut havuz derinligi degil dogrudan " +
      "yapilacak isin kendisi: bu tutar bu havuzda donusturulebiliyor mu");

  /* Pool depth moves. A stale measurement promising "works up to $20,000"
     is worse than no promise, because it reads as a measurement. */
  const yasGun = (Date.now() - Date.parse(derinlik.olculdu)) / 86_400_000;
  ok(yasGun < 14,
    "DERINLIK OLCUMU TAZE",
    yasGun.toFixed(1) + " gun < 14 — havuz derinligi degisen bir sey, " +
      "eski olcumle tutar vaat etmek olcmemekten kotu");

  ok(/BU DOSYA URETILDI|BU DOSYA ÜRETİLDİ/.test(listeKaynak),
    "liste uretilmis oldugunu soyluyor",
    "elle duzenlenirse olcumle baginti kopar ve kopmasi gorunmez");

  /* Nothing in this deployment reads a price. If that ever stops being
     true, the removed oracle has come back and this check is where it
     shows up. */
  ok(!/ChainlinkOracle/.test(listeKaynak) &&
     !fs.readFileSync(path.join(__dirname, "..", "contracts", "EgriLaunchpad.sol"), "utf8")
       .includes("ChainlinkOracle"),
    "LAUNCHPAD HIC FIYAT OKUMUYOR",
    "hak = quote / dolasim; fiyatlandirilacak agirlikli sepet yok");

  /* ---- predicted addresses ----------------------------------------- */
  console.log("");
  console.log("2) ADRESLER — CREATE nonce'tan onceden hesapliyor");

  /* The order is forced by the dependencies, not chosen:
   *
   *   YoneticiFabrika  before  KasaFabrika      (constructor argument)
   *   KasaFabrika      before  EgriLaunchpad    (constructor argument)
   *   registry         before  EgriLaunchpad    (constructor argument)
   *   LikiditeKasasi   before  EgriLaunchpad    (constructor argument)
   *   ...and LikiditeKasasi needs the launchpad, which is why the
   *      launchpad's address is predicted rather than waited for.
   *
   * ChainlinkOracle is gone. It existed to be handed to TeminatKasasi,
   * whose claim was a weighted basket that had to be priced. The new
   * vault computes its claim as the quote over circulating supply, so
   * nothing in this deployment reads a price any more. */
  const n = (k) => getCreateAddress({ from: dagitici, nonce: nonce + k });
  const A = {
    egriFabrika: n(0),
    aciciFabrika: n(1),
    yoneticiFabrika: n(2),
    kasaFabrika: n(3),
    kayit: n(4),
    gelistiriciFonu: n(5),
    likiditeKasasi: n(6),
    launchpad: n(7)
  };

  for (const [ad, a] of Object.entries(A)) {
    console.log("   " + String(Object.keys(A).indexOf(ad) + 1) + ". " + ad.padEnd(18) + a + "   nonce " + (nonce + Object.keys(A).indexOf(ad)));
  }

  /* ---- mine the hook ------------------------------------------------ */
  console.log("");
  console.log("3) HOOK ADRESI MADENCILIGI — alt 14 bit 0x" + GEREKEN.toString(16) + " olmali");
  console.log("   (launchpad nonce+7'de, cunku kasa fabrikasi ve kayit araya girdi)");

  const HOOK = B("EgriHook");
  const hookArg = coder.encode(
    ["address", "address", "address", "address", "address", "address"],
    [POOL_MANAGER, A.launchpad, USDC, A.gelistiriciFonu, A.likiditeKasasi, ISLETME]
  );
  const hookInit = HOOK.bytecode + hookArg.slice(2);
  const hookInitHash = keccak256(hookInit);

  console.log("   hook init kodu " + ((hookInit.length - 2) / 2).toLocaleString("en") + " bayt");
  console.log("   init kod hash  " + hookInitHash);
  console.log("   madencilik...");

  const m = madenle(hookInitHash);
  if (!m) { console.log("   5.000.000 denemede bulunamadi."); process.exit(1); }
  console.log("   salt           " + m.salt);
  console.log("   HOOK           " + m.adres);
  console.log("   " + m.deneme.toLocaleString("en") + " denemede, " + m.ms + " ms");

  const bitler = parseInt(m.adres.slice(-4), 16) & MASKE;
  ok(bitler === GEREKEN,
    "HOOK ADRESI DOGRU IZIN BITLERIYLE BITIYOR",
    "0x" + bitler.toString(16) + " — beklenen 0x" + GEREKEN.toString(16));
  ok(m.adres.toLowerCase().endsWith("a44"),
    "adres a44 ile bitiyor", m.adres.slice(-6));

  /* ---- the two circles, closed ------------------------------------- */
  console.log("");
  console.log("4) IKI DONGU KAPANDI MI");

  const LP = B("EgriLaunchpad");
  const lpArg = coder.encode(
    ["address", "address", "address", "address", "address",
     "uint64", "uint64", "address", "address", "address",
     "address", "address", "address", "address"],
    [A.egriFabrika, A.aciciFabrika, USDC, POOL_MANAGER, m.adres,
     HOLD_PERIOD, SNIPE_SURESI, A.gelistiriciFonu, A.likiditeKasasi, ISLETME,
     A.kasaFabrika, A.kayit, TOKEN_MESSENGER, MESAJ_TASIYICI]
  );
  const lpInit = LP.bytecode + lpArg.slice(2);

  const KASA = B("LikiditeKasasi");
  const kasaArg = coder.encode(["address", "address"], [USDC, A.launchpad]);
  const kasaInit = KASA.bytecode + kasaArg.slice(2);

  /* The launchpad is given the mined hook; the hook was mined against the
     predicted launchpad. If those two do not agree, one of them is
     pointing at an address nobody will deploy to. */
  console.log("   launchpad'e verilen hook   " + m.adres);
  console.log("   hook'un bildigi launchpad  " + A.launchpad);
  console.log("   kasaya verilen launchpad   " + A.launchpad);
  ok(true, "HOOK <-> LAUNCHPAD dongusu kapali",
    "hook, tahmin edilen launchpad adresine gore madenlendi");
  ok(true, "KASA <-> LAUNCHPAD dongusu kapali",
    "kasa, nonce+5'ten hesaplanan launchpad adresini aliyor");

  /* ---- cost ---------------------------------------------------------- */
  console.log("");
  console.log("5) MALIYET TAHMINI");
  /* No oracle in this deployment. The measured collateral universe is
     still read and checked above, because the REMOTE factories are built
     from the same measurements — the feed table lives there now, per
     chain, with each feed's own staleness window. */
  const FON = B("GelistiriciFonu");
  const fonArg = coder.encode(["address", "address"], [USDC, ISLETME]);

  const YF = B("YoneticiFabrika");
  const KF = B("KasaFabrika");
  const kfArg = coder.encode(["address"], [A.yoneticiFabrika]);

  const KAYIT = B("CrossChainAssetRegistry");
  /* IZINLI HEDEF LISTESI KALDIRILDI
     Kayit defteri artik yalnizca ZINCIR kumesini tasiyor. Hangi varligin
     teminat olabilecegine bir liste karar vermiyor; donusumun sonucu uzak
     kasada bir tabana karsi olculuyor ve taban tutmazsa islem geri doner.
     Her zincirin havuz kaynagi (HavuzFiyat) dagit-uzak.js tarafindan o
     zincire kuruluyor ve fabrikaya bagli geliyor. */
  const kayitArg = coder.encode(
    ["(uint32,uint64,address,bytes32,address,string)[]"],
    [uzakZincirler.map((z) => [
      z.cctpDomain, z.zincirId, z.uzakFabrika, z.initKodHash, z.uzakQuote, z.ad
    ])]
  );
  for (const z of uzakZincirler) {
    console.log("   " + String(z.ad).padEnd(10) + "fabrika " + z.uzakFabrika +
      "   havuz kaynagi " + (z.havuzFiyat || "PLANDA YOK"));
  }

  const adimlar = [
    { ad: "EgriFabrika", init: B("EgriFabrika").bytecode, tip: "CREATE" },
    { ad: "AciciFabrika", init: B("AciciFabrika").bytecode, tip: "CREATE" },
    { ad: "YoneticiFabrika", init: YF.bytecode, tip: "CREATE" },
    { ad: "KasaFabrika", init: KF.bytecode + kfArg.slice(2), tip: "CREATE" },
    { ad: "CrossChainAssetRegistry", init: KAYIT.bytecode + kayitArg.slice(2), tip: "CREATE" },
    { ad: "GelistiriciFonu", init: FON.bytecode + fonArg.slice(2), tip: "CREATE" },
    { ad: "LikiditeKasasi", init: kasaInit, tip: "CREATE" },
    { ad: "EgriLaunchpad", init: lpInit, tip: "CREATE" },
    { ad: "EgriHook", init: hookInit, tip: "CREATE2" }
  ];

  let toplamGaz = 0n;
  for (const a of adimlar) {
    let gaz;
    try {
      if (a.tip === "CREATE2") {
        gaz = await saglayici.estimateGas({
          from: dagitici, to: CREATE2_FACTORY, data: m.salt + a.init.slice(2)
        });
      } else {
        gaz = await saglayici.estimateGas({ from: dagitici, data: a.init });
      }
    } catch (e) {
      gaz = null;
      console.log("   " + a.ad.padEnd(18) + "gaz tahmini basarisiz: " + e.message.slice(0, 60));
    }
    if (gaz !== null) {
      toplamGaz += gaz;
      console.log("   " + a.ad.padEnd(18) +
        ((a.init.length - 2) / 2).toLocaleString("en").padStart(7) + " bayt  " +
        gaz.toString().padStart(9) + " gaz   " + a.tip);
    }
  }

  const ucret = await saglayici.getFeeData();
  const birim = ucret.maxFeePerGas || ucret.gasPrice || 0n;
  const maliyet = toplamGaz * birim;
  console.log("");
  console.log("   toplam gaz   " + toplamGaz.toString());
  console.log("   gaz fiyati   " + birim.toString() + " wei");
  console.log("   MALIYET      " + YERLI(maliyet) + "   (Arc'ta gaz USDC)");
  ok(bakiye > maliyet * 2n,
    "bakiye maliyetin en az iki kati",
    YERLI(bakiye) + " > " + YERLI(maliyet * 2n));

  /* ---- record, so the real run can verify against it --------------- */
  const kayit = {
    olculdu: new Date().toISOString(),
    zincir: CHAIN_ID,
    dagitici, nonce,
    poolManager: POOL_MANAGER,
    usdc: USDC,
    isletme: ISLETME,
    holdPeriod: HOLD_PERIOD,
    snipeSuresi: SNIPE_SURESI,
    tahminler: A,
    hook: { adres: m.adres, salt: m.salt, initKodHash: hookInitHash, deneme: m.deneme },
    /* The collateral list, from the depth measurement rather than the
       removed Chainlink universe. Recorded so a deployment can be traced
       back to the measurement it was made against. */
    teminatOlcumu: derinlik.olculdu,
    teminatSembol: [...semboller].sort(),
    gaz: toplamGaz.toString(),
    maliyet: maliyet.toString(),
    uygulandiMi: false
  };
  const kayitYolu = path.join(__dirname, "..", "dagitim-pulse-plan.json");
  fs.writeFileSync(kayitYolu, JSON.stringify(kayit, null, 1));

  console.log("");
  console.log("6) PLAN KAYDEDILDI");
  console.log("   " + kayitYolu);
  console.log("   Gercek dagitim bu dosyayi okuyup her adimin DUSTUGU adresi");
  console.log("   tahminle karsilastirmak zorunda. Bu projede hook bir kez");
  console.log("   `quote` yerine launchpad adresiyle canliya cikti; tahmini");
  console.log("   dogrulamadan gecmek ayni hatanin bir sonraki hali.");

  /* ==================================================================
   * GERCEK DAGITIM
   *
   * HER ADIM DUSTUGU ADRESI PLANA KARSI DOGRULUYOR
   *   Tahmin, gondericinin nonce'una dayaniyor. Arada baska bir islem
   *   gonderilirse butun sira kayar ve madenlenmis hook adresi YANLIS
   *   bir launchpad'e bakar — ama her sey basariyla dagitilmis gorunur.
   *   Bu projede hook bir kez `quote` yerine launchpad adresiyle canliya
   *   cikti; o hata sessizdi ve bu kontrol onun icin var.
   *
   * BIR SAPMADA DURUYOR, DEVAM ETMIYOR
   *   Yarim dagitilmis bir yigin, yanlis dagitilmis bir yigindan daha
   *   iyidir: ilki yeniden denenebilir, ikincisi zincirde kalir.
   *
   * DAGITILMIS KOD DERLEME CIKTISIYLA KARSILASTIRILIYOR
   *   Immutable degerler calisma zamani kodunun icine gomuldugu icin
   *   birebir esitlik beklenmiyor; UZUNLUK esitligi bekleniyor. Farkli
   *   uzunluk, zincire baska bir sozlesmenin gittigi anlamina gelir.
   */
  if (UYGULA) {
    console.log("=== UYGULA — GERCEK ISLEMLER BASLIYOR ===");
    console.log("");

    /* The nonce is re-read immediately before the first send. If it moved
       between the dry run and now, every prediction is stale. */
    /* HOW MANY STEPS ALREADY LANDED — ASKED OF THE CHAIN
       Counted by code presence at each predicted address, not by the
       nonce. The nonce says how many transactions this deployer sent;
       it does not say that each of them was one of THESE. */
    let atlanan = 0;
    for (let i = 0; i < adimlar.length; i++) {
      const adr = adimlar[i].tip === "CREATE2" ? m.adres : Object.values(A)[i];
      const kod = await saglayici.getCode(adr);
      if (kod && kod !== "0x") atlanan = i + 1;
      else break;
    }

    const simdikiNonce = await saglayici.getTransactionCount(dagitici);
    /* The original check, with resume allowed for exactly the steps whose
       code is on chain. A nonce higher than that means this deployer sent
       something else in between, and then every remaining prediction is
       stale — including the launchpad the hook was mined against. */
    if (simdikiNonce !== nonce + atlanan) {
      console.log("DURDURULDU — nonce beklenenle tutmuyor.");
      console.log("  plan nonce        " + nonce);
      console.log("  zincirde dusen    " + atlanan + " sozlesme");
      console.log("  beklenen nonce    " + (nonce + atlanan));
      console.log("  gercek nonce      " + simdikiNonce);
      console.log("");
      console.log("  Aradaki fark, bu cuzdanin bu dagitimdan BASKA bir islem");
      console.log("  gonderdigi anlamina gelir. O zaman kalan her tahmin kayar");
      console.log("  ve madenlenmis hook adresi yanlis bir launchpad'e bakar.");
      console.log("  Yeni bir kuru calisma gerekiyor.");
      process.exit(1);
    }
    if (atlanan > 0) {
      console.log("  " + atlanan + " adim zincirde, atlaniyor.");
      console.log("");
    }

    const dagitilan = {};
    for (let i = 0; i < adimlar.length; i++) {
      const a = adimlar[i];
      const beklenen = a.tip === "CREATE2" ? m.adres : Object.values(A)[i];

      process.stdout.write("  " + String(i + 1) + ". " + a.ad.padEnd(18));

      if (i < atlanan) {
        dagitilan[a.ad] = beklenen;
        console.log(beklenen + "   (zincirde)");
        continue;
      }

      /* An explicit nonce, because the node's answer is not reliable
         enough to derive one from: measured on the remote side, a
         load-balanced endpoint answered a stale count and the second
         deployment reused the first one's nonce. */
      const gonder = () => a.tip === "CREATE2"
        ? cuzdan.sendTransaction({
            to: CREATE2_FACTORY, data: m.salt + a.init.slice(2), nonce: nonce + i
          })
        : cuzdan.sendTransaction({ data: a.init, nonce: nonce + i });

      /* A rate limit is the endpoint refusing to take the transaction,
         not the transaction being wrong. Measured: this deployment died
         at step 8 of 9 on "rate limit exceeded" with seven contracts
         already live. Retried here so a throttle costs seconds instead
         of a half-finished deployment. */
      let islem = null, sonHata = null;
      for (let d = 0; d < 6 && !islem; d++) {
        if (d > 0) await new Promise((r) => setTimeout(r, 4000 * d));
        try {
          islem = await gonder();
        } catch (e) {
          sonHata = e;
          const msj = (e && e.message) || "";
          /* Anything that is not throttling is a real refusal and must
             stop the deployment rather than be retried blindly. */
          if (!/rate limit|too many requests|timeout|503|502|ECONNRESET/i.test(msj)) break;
          process.stdout.write(".");
        }
      }
      if (!islem) {
        console.log("GONDERILEMEDI");
        console.log("     " + ((sonHata && sonHata.message) || "bilinmeyen").slice(0, 160));
        console.log("");
        console.log("  Zincirde " + i + " sozlesme var. Bu betik kaldigi yerden");
        console.log("  devam edebilir: ayni komutu tekrar kosun.");
        process.exit(1);
      }
      const makbuz = await islem.wait();

      /* CREATE reports the address in the receipt; CREATE2 through the
         factory does not, so it is the derived one — and the code check
         below is what proves something actually landed there. */
      const dustu = a.tip === "CREATE2" ? m.adres : makbuz.contractAddress;

      if (!dustu || dustu.toLowerCase() !== beklenen.toLowerCase()) {
        console.log("SAPMA");
        console.log("     beklenen " + beklenen);
        console.log("     dustu    " + dustu);
        console.log("");
        console.log("  DURDURULDU. Bundan sonraki her adim yanlis adrese");
        console.log("  bakacakti. Zincirde " + i + " sozlesme var ve plan");
        console.log("  gecersiz — yeni bir kuru calisma gerekiyor.");
        process.exit(1);
      }

      const kod = await saglayici.getCode(dustu);
      const beklenenBoy = (B(a.ad).deployedBytecode.length - 2) / 2;
      const gercekBoy = (kod.length - 2) / 2;
      if (gercekBoy !== beklenenBoy) {
        console.log("KOD UYUSMUYOR");
        console.log("     beklenen " + beklenenBoy + " bayt, zincirde " + gercekBoy);
        process.exit(1);
      }

      dagitilan[a.ad] = dustu;
      console.log(dustu + "   " + gercekBoy.toLocaleString("en") + " bayt   gaz " +
        makbuz.gasUsed.toString());
    }

    const sonBakiye = await saglayici.getBalance(dagitici);
    console.log("");
    console.log("  harcanan " + YERLI(bakiye - sonBakiye) + "   kalan " + YERLI(sonBakiye));

    kayit.uygulandiMi = true;
    kayit.dagitilan = dagitilan;
    kayit.dagitimZamani = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, "..", "dagitim-pulse.json"),
      JSON.stringify(kayit, null, 1));

    console.log("");
    console.log("  DAGITILDI. Kayit: dagitim-pulse.json");
    console.log("");
    console.log("  SIRADAKI — ve bunlar yapilmadan arayuz baglanmamali:");
    console.log("    1. docs/js/adresler.js icindeki PULSE blogunu doldur");
    console.log("    2. node scripts/denetim-dagitim.js — zincirdeki kod derleme");
    console.log("       ciktisiyla ayni mi, immutable degerler dogru mu");
    console.log("    3. node indeksleyici/indeksle.js — artik indekslenecek");
    console.log("       bir sey var");
    console.log("");
    console.log("  Hicbir launch ACILMADI: bu adim yalnizca altyapiyi kurdu.");
  }

  console.log("");
  if (!UYGULA) {
    console.log("  KURU CALISMA BITTI — hicbir islem gonderilmedi.");
    console.log("");
    console.log("  Gercek dagitim " + YERLI(maliyet) + " gaz harcar ve GERI ALINAMAZ.");
    console.log("  Nonce " + nonce + "'ten baslayan sira BOZULMAMALI: arada baska");
    console.log("  bir islem gonderilirse butun tahminler kayar ve madenlenmis");
    console.log("  hook adresi yanlis bir launchpad'e bakar.");
    console.log("");
    console.log("  Hazir oldugunda:  node scripts/dagit-pulse.js --uygula");
  }

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
