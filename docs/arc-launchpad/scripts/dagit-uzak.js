"use strict";
/* ===========================================================================
 * dagit-uzak.js — the factories on the remote chains: dry first, then real
 *
 *   node scripts/dagit-uzak.js                    # DRY, both chains
 *   node scripts/dagit-uzak.js --zincir ethereum  # a single chain
 *   node scripts/dagit-uzak.js --uygula           # a real transaction, real ETH
 *
 * WHY THIS COMES BEFORE ARC
 *   Arc's `CrossChainAssetRegistry` fixes the set of chains IN ITS
 *   CONSTRUCTOR — there is no `addChain`, because a key that can add a
 *   chain can add a chain whose "factory" it holds itself. So the remote
 *   factory addresses have to be known already when Arc is deployed.
 *
 *   There are two ways to do that and one of them is dangerous:
 *
 *     PREDICT     factory = CREATE(deployer, nonce). Measured: the nonce is
 *                 0 on Ethereum and 1 on Base. But if that wallet sends
 *                 ANY other transaction on that chain in between, the nonce
 *                 shifts, the prediction breaks, and Arc's immutable record
 *                 points permanently at an empty address.
 *
 *     DEPLOY FIRST  the factories are really deployed, their addresses are
 *                 read, and Arc is built with those addresses. Zero
 *                 prediction risk.
 *
 *   The second was chosen. Walking past a prediction without verifying it
 *   is what put the hook live with the wrong address once in this project;
 *   here the mistake would be permanent.
 *
 * WHAT THE FACTORY CARRIES
 *   Arc's domain (26), the address of the bridge vault on the Arc side,
 *   that chain's CCTP contracts, that chain's USDC, and the FEED TABLE. The
 *   table is fixed in the constructor: the asset, its Chainlink PROXY, its
 *   decimals and its own freshness window. Measured — ETH/USD was 3,552
 *   seconds stale on Ethereum and 4 seconds on Base; a single freshness
 *   constant would reject the first.
 *
 * THE ARC VAULT ADDRESS DOES NOT EXIST YET — AND THAT IS FINE
 *   The factory holds `arcKasasi` immutable and every remote vault inherits
 *   it. But on the Arc side a vault is created PER TOKEN, so there is no
 *   single address. That is why the factory is given KasaFabrika's address:
 *   that is the sender the remote vault accepts, and that address is known
 *   at Arc deployment time.
 * =========================================================================== */
const {JsonRpcProvider, Wallet, AbiCoder, keccak256, getCreateAddress, formatEther, id } = require("ethers");
const fs = require("fs");
const path = require("path");

const UYGULA = process.argv.includes("--uygula");
const coder = AbiCoder.defaultAbiCoder();
const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));

const arg = (ad) => {
  const i = process.argv.indexOf("--" + ad);
  return i < 0 ? null : process.argv[i + 1];
};

/* CCTP v2, measured at the same deterministic addresses on Arc, Ethereum
   and Base — same byte lengths too. */
const TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const MESAJ_TASIYICI = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const ARC_DOMAIN = 26;

const ZINCIRLER = [
  {
    ad: "ethereum",
    gosterim: "Ethereum",
    zincirId: 1,
    cctpDomain: 0,
    rpc: process.env.ETH_RPC_CANLI || "https://ethereum-rpc.publicnode.com",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    besleyiciler: [{
      ad: "ETH / USD",
      varlik: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",   // WETH
      besleyici: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // PROXY
      varlikOndalik: 18,
      besleyiciOndalik: 8,
      /* Heartbeat one hour; measured 3,552 s old at block 26,162,278, so a
         one-hour window would have rejected it at that very block. */
      azamiYas: 7200
    }]
  },
  {
    ad: "base",
    gosterim: "Base",
    zincirId: 8453,
    cctpDomain: 6,
    /* Base's official endpoint, not publicnode. Measured: publicnode
       answered the gas estimate and then refused the send with

         403  Archive requests require a personal token

       The write path needs calls it classifies as archival, so the
       deployment died between the pool source and the factory. */
    rpc: process.env.BASE_RPC_CANLI || "https://mainnet.base.org",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    v3Fabrika: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    besleyiciler: [{
      ad: "ETH / USD",
      varlik: "0x4200000000000000000000000000000000000006",   // WETH
      besleyici: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", // PROXY
      varlikOndalik: 18,
      besleyiciOndalik: 8,
      /* Measured 4 seconds old. The window stays generous rather than
         tight: a tight one turns a brief sequencer hiccup into a frozen
         conversion, and the floor does not get safer by being brittle. */
      azamiYas: 7200
    }]
  }
];

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

const E = (v) => Number(formatEther(v)).toFixed(6) + " ETH";

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  console.log("UZAK ZINCIR FABRIKALARI");
  console.log("  kip  " + (UYGULA ? "UYGULA — GERCEK ISLEM, GERCEK ETH" : "KURU CALISMA"));
  console.log("");

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }

  /* The Arc-side sender every remote vault will accept. It is KasaFabrika,
     not a vault: the vault is per-token on Arc, so there is no single vault
     address — but every one of them is built by the same factory, and that
     is what the far side can be told once. */
  const arcPlan = path.join(__dirname, "..", "dagitim-pulse-plan.json");
  if (!fs.existsSync(arcPlan)) {
    console.log("dagitim-pulse-plan.json yok. Once: node scripts/dagit-pulse.js");
    console.log("Uzak fabrika, Arc tarafindaki gonderenin adresini bilmek zorunda.");
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(arcPlan, "utf8"));

  /* THIS SCRIPT'S OWN PREVIOUS RUN
     Read so a rerun can tell what already landed. A deployment that
     cannot be resumed has to be restarted, and restarting shifts every
     CREATE address by the nonces already spent — which on Arc's side
     means an immutable registry pointing at empty addresses. */
  const uzakPlanYolu = path.join(__dirname, "..", "dagitim-uzak-plan.json");
  const onceki = fs.existsSync(uzakPlanYolu)
    ? JSON.parse(fs.readFileSync(uzakPlanYolu, "utf8"))
    : null;
  const arcGonderen = plan.tahminler && plan.tahminler.kasaFabrika;
  if (!arcGonderen) {
    console.log("Plan dosyasinda kasaFabrika adresi yok. dagit-pulse.js guncel mi?");
    process.exit(1);
  }
  console.log("  Arc tarafindaki gonderen (KasaFabrika)  " + arcGonderen);
  console.log("");

  const FAB = B("RemoteVaultFactory");
  const HF = B("HavuzFiyat");
  const RV = B("RemoteCollateralVault");
  const initHash = keccak256(RV.bytecode);
  console.log("  RemoteCollateralVault init kod hash (her zincirde ayni)");
  console.log("  " + initHash);
  console.log("");

  const secilen = arg("zincir");
  const liste = secilen ? ZINCIRLER.filter((z) => z.ad === secilen) : ZINCIRLER;
  if (liste.length === 0) {
    console.log("Bilinmeyen zincir: " + secilen + "   (ethereum | base)");
    process.exit(1);
  }

  const sonuc = {};
  for (const z of liste) {
    console.log("=== " + z.gosterim + "  (zincir " + z.zincirId +
      ", CCTP domain " + z.cctpDomain + ") ===");

    const saglayici = new JsonRpcProvider(z.rpc, { chainId: z.zincirId, name: z.ad }, { staticNetwork: true });
    const cuzdan = new Wallet(pk, saglayici);
    const dagitici = await cuzdan.getAddress();
    const nonce = await saglayici.getTransactionCount(dagitici);
    const bakiye = await saglayici.getBalance(dagitici);

    /* TWO DEPLOYMENTS, AND THE SECOND RUN MUST NOT REDO THE FIRST
       Measured the hard way: the pool source landed on Ethereum, the
       factory was then sent WITHOUT an explicit nonce and the node
       answered a stale count, so it reused nonce 0 —

         nonce too low: next nonce 1, tx nonce 0

       Two fixes, both needed. Every send now carries an explicit nonce,
       because asking the node for one is asking a load-balanced endpoint
       whose answer can lag. And anything already on chain is REUSED
       rather than redeployed: a rerun that redeployed the pool source
       would shift the factory to the next nonce, and the factory address
       is what Arc's registry derives every remote vault from. */
    /* ---- WHAT IS ALREADY ON CHAIN, ASKED OF THE CHAIN ------------
     *
     * This was read from this script's own plan file first, and the plan
     * file turned out to be the wrong source. Measured: Ethereum's
     * factory deployed successfully, then Base failed with a 403 and the
     * process exited BEFORE writing the plan. The file said nothing was
     * deployed while two contracts were live. A rerun trusting it would
     * have deployed a second factory at a fresh nonce, and Arc's
     * registry — fixed at construction — would keep pointing at the
     * first one.
     *
     * So resume state is derived from the chain. Every nonce this
     * deployer has spent maps to one CREATE address; each is asked what
     * it is, by calling a function only that contract has:
     *
     *   TWAP_PENCERE()  -> 1800        only HavuzFiyat answers this
     *   initKodHash()   -> known hash  only the factory answers this
     *
     * Byte length would have been easier and wrong: two contracts can
     * be the same size, and "4718 bytes" is not an identity.
     */
    const bulunan = { havuz: null, fabrika: null };
    for (let i = 0; i < nonce; i++) {
      const aday = getCreateAddress({ from: dagitici, nonce: i });
      const kod = await saglayici.getCode(aday);
      if (!kod || kod === "0x") continue;
      try {
        const pencere = await saglayici.call({ to: aday, data: "0x" +
          id("TWAP_PENCERE()").slice(2, 10) });
        if (pencere && BigInt(pencere) === 1800n) { bulunan.havuz = aday; continue; }
      } catch (e) { /* not the pool source */ }
      try {
        const h = await saglayici.call({ to: aday, data: "0x" +
          id("initKodHash()").slice(2, 10) });
        if (h && h.toLowerCase() === initHash.toLowerCase()) {
          bulunan.fabrika = aday;
        }
      } catch (e) { /* neither */ }
    }

    if (bulunan.fabrika) {
      console.log("  havuz     " + (bulunan.havuz || "bulunamadi") + "   (zincirde)");
      console.log("  fabrika   " + bulunan.fabrika + "   (zincirde)");
      ok(true, z.gosterim + ": ZATEN DAGITILMIS — ATLANIYOR",
        "ikinci bir fabrika dagitmak Arc kaydini birincisine bakmaya " +
          "devam ettirirdi ve ikincisi gorunmez olurdu");
      sonuc[z.ad] = {
        zincirId: z.zincirId, cctpDomain: z.cctpDomain, dagitici, nonce,
        fabrika: bulunan.fabrika, havuzFiyat: bulunan.havuz,
        havuzDagitildi: bulunan.havuz, v3Fabrika: z.v3Fabrika,
        initKodHash: initHash, usdc: z.usdc, besleyiciler: z.besleyiciler,
        gaz: null, maliyet: "0", yeterliBakiye: true,
        dagitildi: bulunan.fabrika
      };
      console.log("");
      continue;
    }

    const hfArg = coder.encode(["address", "address"], [z.v3Fabrika, z.usdc]);
    const hfInit = HF.bytecode + hfArg.slice(2);

    const hfVar = !!bulunan.havuz;
    const hfBeklenen = hfVar ? bulunan.havuz : getCreateAddress({ from: dagitici, nonce });
    const hfNonce = hfVar ? null : nonce;
    const fabNonce = hfVar ? nonce : nonce + 1;

    const arg2 = coder.encode(
      ["uint32", "bytes32", "address", "address", "address", "address",
       "(address,address,uint8,uint8,uint32)[]"],
      [ARC_DOMAIN,
       "0x" + arcGonderen.slice(2).toLowerCase().padStart(64, "0"),
       TOKEN_MESSENGER, MESAJ_TASIYICI, z.usdc, hfBeklenen,
       z.besleyiciler.map((b) => [
         b.varlik, b.besleyici, b.varlikOndalik, b.besleyiciOndalik, b.azamiYas
       ])]
    );
    const init = FAB.bytecode + arg2.slice(2);
    const beklenen = getCreateAddress({ from: dagitici, nonce: fabNonce });

    console.log("  dagitici  " + dagitici + "   nonce " + nonce);
    console.log("  bakiye    " + E(bakiye));
    console.log("  havuz     " + hfBeklenen +
      (hfVar ? "   (ZINCIRDE VAR — yeniden dagitilmiyor)" : "   (CREATE, nonce " + hfNonce + ")"));
    console.log("  fabrika   " + beklenen + "   (CREATE, nonce " + fabNonce + ")");
    console.log("  v3 fab    " + z.v3Fabrika + "   (bu zincirin Uniswap v3 fabrikasi)");
    for (const b of z.besleyiciler) {
      console.log("  besleyici " + b.ad.padEnd(12) + b.varlik + " -> " + b.besleyici +
        "   " + b.besleyiciOndalik + " ond   azami yas " + b.azamiYas + "s");
    }

    let gaz = null;
    try {
      const g1 = hfVar ? 0n : await saglayici.estimateGas({ from: dagitici, data: hfInit });
      const g2 = await saglayici.estimateGas({ from: dagitici, data: init });
      gaz = g1 + g2;
    } catch (e) {
      console.log("  gaz tahmini basarisiz: " + e.message.slice(0, 70));
    }
    const ucret = await saglayici.getFeeData();
    const birim = ucret.maxFeePerGas || ucret.gasPrice || 0n;
    const maliyet = gaz ? gaz * birim : 0n;
    if (gaz) {
      console.log("  gaz       " + gaz.toString() + " x " +
        (Number(birim) / 1e9).toFixed(3) + " gwei  =  " + E(maliyet));
    }

    const yeterli = gaz !== null && bakiye >= maliyet * 2n;
    ok(yeterli,
      z.gosterim + ": bakiye dagitimin en az iki kati",
      yeterli ? E(bakiye) + " >= " + E(maliyet * 2n)
        : "EKSIK — " + E(bakiye) + " var, " + E(maliyet * 2n) + " gerekiyor." +
          "  Adrese ETH gonderilmesi gerekiyor: " + dagitici);

    sonuc[z.ad] = {
      zincirId: z.zincirId, cctpDomain: z.cctpDomain, dagitici, nonce,
      fabrika: beklenen, havuzFiyat: hfBeklenen,
      /* Set once the address actually holds code, which is what a rerun
         checks. Filled in after the apply block below. */
      havuzDagitildi: hfVar ? hfBeklenen : null,
      v3Fabrika: z.v3Fabrika,
      initKodHash: initHash, usdc: z.usdc,
      besleyiciler: z.besleyiciler, gaz: gaz ? gaz.toString() : null,
      maliyet: maliyet.toString(), yeterliBakiye: yeterli, dagitildi: null
    };

    if (UYGULA && yeterli) {
      /* The pool source first. If this lands and the factory does not,
         the factory is retried at the right nonce on the next run; the
         reverse order would leave the factory holding an address with no
         code in it. */
      if (!hfVar) {
        const hfIslem = await cuzdan.sendTransaction({ data: hfInit, nonce: hfNonce });
        const hfMakbuz = await hfIslem.wait();
        if (!hfMakbuz.contractAddress ||
            hfMakbuz.contractAddress.toLowerCase() !== hfBeklenen.toLowerCase()) {
          console.log("  SAPMA (havuz): beklenen " + hfBeklenen +
            ", dustu " + hfMakbuz.contractAddress);
          process.exit(1);
        }
        console.log("  havuz dagitildi  " + hfMakbuz.contractAddress);
      } else {
        console.log("  havuz zaten zincirde  " + hfBeklenen);
      }

      const islem = await cuzdan.sendTransaction({ data: init, nonce: fabNonce });
      const makbuz = await islem.wait();
      const dustu = makbuz.contractAddress;
      if (!dustu || dustu.toLowerCase() !== beklenen.toLowerCase()) {
        console.log("  SAPMA: beklenen " + beklenen + ", dustu " + dustu);
        console.log("  DURDURULDU — Arc kaydi bu adrese gore kurulacakti.");
        process.exit(1);
      }
      /* The factory publishes the hash Arc must hold. Comparing it here is
         the check that catches the two sides drifting — and a mismatch is
         invisible until the first transfer lands nowhere. */
      /* READ AFTER WRITE NEEDS RETRIES
         Measured on mainnet.base.org: the factory deployed, the receipt
         confirmed, and this call came back "0x" — the node had the block
         but not yet the state behind it. Reported as "the published hash
         does not match ours", which is the one thing this check exists to
         catch, about a deployment that was in fact correct.

         A false alarm on this check is expensive: it says the two sides
         have drifted, and drift here means collateral transfers landing
         nowhere. So it retries until the node answers something, and
         only then compares. */
      let yayinlanan = "0x";
      for (let d = 0; d < 6 && (!yayinlanan || yayinlanan === "0x"); d++) {
        if (d > 0) await new Promise((r) => setTimeout(r, 2000));
        try {
          yayinlanan = await saglayici.call({
            to: dustu, data: "0x" + keccak256(Buffer.from("initKodHash()")).slice(2, 10)
          });
        } catch (e) { yayinlanan = "0x"; }
      }
      console.log("  DAGITILDI " + dustu + "   gaz " + makbuz.gasUsed.toString());
      ok(yayinlanan !== "0x" && yayinlanan.toLowerCase() === initHash.toLowerCase(),
        z.gosterim + ": fabrikanin yayinladigi init hash bizimkiyle ayni",
        yayinlanan.slice(0, 18) + " vs " + initHash.slice(0, 18));
      sonuc[z.ad].dagitildi = dustu;
      sonuc[z.ad].havuzDagitildi = hfBeklenen;
    }
    console.log("");
  }

  const yol = path.join(__dirname, "..", "dagitim-uzak-plan.json");
  fs.writeFileSync(yol, JSON.stringify({
    olculdu: new Date().toISOString(),
    arcDomain: ARC_DOMAIN, arcGonderen,
    tokenMessenger: TOKEN_MESSENGER, mesajTasiyici: MESAJ_TASIYICI,
    initKodHash: initHash, zincirler: sonuc, uygulandiMi: UYGULA
  }, null, 1));
  console.log("  plan: " + yol);

  const eksik = Object.entries(sonuc).filter(([, v]) => !v.yeterliBakiye);
  if (eksik.length) {
    console.log("");
    console.log("  FONLAMA GEREKIYOR — ve bu tek adim, gerisi otomatik:");
    for (const [ad, v] of eksik) {
      console.log("    " + ad.padEnd(10) + v.dagitici + "   >= " +
        E(BigInt(v.maliyet) * 2n));
    }
    console.log("");
    console.log("  Fonlandiktan sonra:  node scripts/dagit-uzak.js --uygula");
    console.log("  Sonra Arc:           node scripts/dagit-pulse.js --uygula");
    console.log("");
    console.log("  SIRA ONEMLI: Arc'in kaydi zincir kumesini KURUCUDA sabitliyor,");
    console.log("  yani uzak fabrikalarin GERCEK adresleri Arc dagitilirken");
    console.log("  bilinmek zorunda. Tahmin etmek de mumkun ama o cuzdan o");
    console.log("  zincirde arada baska bir islem gonderirse nonce kayar ve");
    console.log("  Arc'in degistirilemez kaydi kalici olarak bos bir adrese");
    console.log("  bakar.");
  }

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
