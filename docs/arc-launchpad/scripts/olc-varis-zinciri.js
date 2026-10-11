"use strict";
/* ===========================================================================
 * olc-varis-zinciri.js — STAGES 5-10: the arrival side, ON EVERY VERIFIED
 *                        CHAIN
 *
 *   anvil --fork-url https://ethereum-rpc.publicnode.com   --port 8546 --silent
 *   anvil --fork-url https://base-rpc.publicnode.com       --port 8547 --silent
 *   node scripts/olc-varis-zinciri.js
 *
 * WHY ONE SCRIPT AND NOT ONE PER CHAIN
 *   The first version was for Ethereum only and every address was a
 *   constant. Moving to a second chain by copying would have produced two
 *   files exercising the same contract paths — a test copied and never
 *   compared is exactly how a fee table agrees with itself for weeks while
 *   the arithmetic overflows on every sale.
 *
 *   So the chain is a parameter. The same stack runs against Ethereum and
 *   Base, and what it proves is stronger than before: not "the design works
 *   on Ethereum" but "the design does not know which chain it is on". If a
 *   third chain needs a line of code here, that is a finding.
 *
 * WHAT WAS MEASURED PER CHAIN
 *   CCTP v2's three contracts are at the SAME addresses on Arc, Ethereum
 *   and Base, with the same byte sizes. `localDomain()` answers 26, 0 and 6
 *   respectively. SwapRouter02 and UniswapV3Factory are 24,497 and 24,535
 *   bytes on both chains.
 *
 *   Feed age, on the other hand, differs by a chasm between chains: ETH/USD
 *   had gone 3,552 seconds without an update on Ethereum and 4 seconds on
 *   Base. A single freshness constant would reject Ethereum. The window is
 *   per feed, and that is the result of these two independent measurements.
 * =========================================================================== */
const { Interface, keccak256, AbiCoder } = require("ethers");
const fs = require("fs");
const path = require("path");

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const { kisaIsim: hataAdi, yaz: revertYaz } = require("./revert-coz");

const T = B("TestVarisZinciri");
const iface = new Interface(T.abi);
const coder = AbiCoder.defaultAbiCoder();

const H = "0x00000000000000000000000000000000000000E9";
const USDC_BAKIYE_SLOT = 9n;   /* FiatToken on both chains */

/* CCTP v2 is at the same deterministic address on every chain it is
   deployed to. Measured, not assumed — on Arc, Ethereum and Base. */
const TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const SWAP_ROUTER_02 = {
  1: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  8453: "0x2626664c2603336E57B271c5C0b26F421741e481"
};

const ZINCIRLER = [
  {
    ad: "Ethereum",
    zincirId: 1,
    cctpDomain: 0,
    /* The LIVE endpoint. See the transport note above: the harness is
       injected by state override, nothing writes, and the local fork's
       upstream has pruned the state it needs. */
    rpc: process.env.ETH_RPC || "https://ethereum-rpc.publicnode.com",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    hedefVarlik: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",   // WETH
    besleyici: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",     // ETH/USD proxy
    varlikOndalik: 18,
    besleyiciOndalik: 8,
    /* Heartbeat one hour, measured 3,552 s old at block 26,162,278 — a
       one-hour window would have rejected it at that very block. */
    azamiYas: 7200,
    kademe: 500,
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    /* WBTC: no feed in THIS factory's table (which holds only WETH), a
       real USDC pool, and deep enough for the amount this harness moves.

       PEPE was here first and the run refused the honest route with
       TabanAltinda. That was not a bug — it was measured: PEPE's $2,000
       trade pushes its own pool far past the floor's 3% tolerance, so a
       floor derived from the marginal price is genuinely unreachable.
       Picking a thin asset made the test assert "the floor is broken"
       when what it had found was "this pool is too thin".

       WBTC also has EIGHT decimals, which exercises something the 18-
       decimal assets cannot: the removed decimal adjustment. If anyone
       puts a 10^(asset-quote) factor back into the price derivation, this
       asset is where it shows up as a 10^2 error rather than nowhere.

       Measured at $20,000: push 1.0033 against a 1.031 ceiling. */
    besleyicisizVarlik: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    besleyicisizKademe: 3000
  },
  {
    ad: "Base",
    zincirId: 8453,
    cctpDomain: 6,
    rpc: process.env.BASE_RPC || "https://base-rpc.publicnode.com",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    hedefVarlik: "0x4200000000000000000000000000000000000006",   // WETH
    besleyici: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",     // ETH/USD proxy
    varlikOndalik: 18,
    besleyiciOndalik: 8,
    /* Base's feed was 4 seconds old when measured. The window is still
       generous rather than tight: a tight one turns a brief sequencer
       hiccup into a frozen conversion, and the floor does not get safer
       by being brittle. */
    azamiYas: 7200,
    kademe: 500,
    v3Fabrika: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    /* VIRTUAL: a Base token with NO Chainlink feed anywhere — not just
       absent from this factory's table — so it is the honest form of the
       claim "any working token can be collateral".

       DEGEN was here first and failed for the same reason PEPE did on
       Ethereum: four tiers measured 0 / 26.9 trillion / 4.3 quadrillion /
       501 trillion, and even the deepest pushes a $2,000 trade 16.1x.

       Measured at $20,000: push 1.0088 against a 1.031 ceiling. */
    besleyicisizVarlik: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
    besleyicisizKademe: 3000
  }
];

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const W = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 6 }) + " WETH";
const V = (v) => BigInt(v.toString());

/* A PRUNED NODE IS NOT A FAILED MEASUREMENT
     Measured, and it took a run to tell apart from a contract fault:

       failed to get account for 0x448dDD...: historical state ... is not
       available

     The local Ethereum fork lazily fetches accounts from its upstream, and
     publicnode is load-balanced across nodes that have pruned the state
     "latest" refers to. Nothing here writes — the harness is injected by
     state override on eth_call — so the live endpoint does the same job
     and does not need the fork at all.

     The retry lives on the TRANSPORT, not around each assertion: wrapped
     per assertion, a dead endpoint would be reported as a contract that
     misbehaved. A revert is still thrown straight through, because a
     revert is the contract's answer. */
const YEDEK = {
  "https://ethereum-rpc.publicnode.com": [
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth"
  ],
  "https://base-rpc.publicnode.com": [
    "https://base.llamarpc.com",
    "https://mainnet.base.org"
  ]
};

const GECICI = /historical state|not available|header not found|missing trie node|rate limit|too many requests|50[23]/i;

async function birRpc(url, m, p) {
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }),
    signal: AbortSignal.timeout(60_000)
  });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
  return j.result;
}

async function rpc(url, m, p) {
  const adaylar = [url, url, ...(YEDEK[url] || [])];
  let son = null;
  for (const u of adaylar) {
    try {
      return await birRpc(u, m, p);
    } catch (e) {
      son = e;
      if (!GECICI.test(e.message || "")) throw e;
      if (u !== adaylar[adaylar.length - 1]) {
        console.log("     (uc nokta cevap vermedi, yedege geciliyor: " +
          (e.message || "").slice(0, 60) + ")");
      }
    }
  }
  throw son;
}

const FON_SLOT = 500_000_000_000n;   // three vaults are built per chain

async function kosZincir(z, ok) {
  const slot = keccak256(coder.encode(["address", "uint256"], [H, USDC_BAKIYE_SLOT]));
  const ortuk = {
    [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 20n).toString(16) },
    [z.usdc]: { stateDiff: { [slot]: "0x" + FON_SLOT.toString(16).padStart(64, "0") } }
  };

  const FON = 20_000_000_000n;      // $20.000 per vault
  const HARCAMA = 2_000_000_000n;   // $2.000 converted
  const ORAN = 40n;                 // 40% of the holding sold back

  const zincirArg = {
    usdc: z.usdc,
    hedefVarlik: z.hedefVarlik,
    besleyici: z.besleyici,
    varlikOndalik: z.varlikOndalik,
    besleyiciOndalik: z.besleyiciOndalik,
    azamiYas: z.azamiYas,
    router: SWAP_ROUTER_02[z.zincirId],
    kademe: z.kademe,
    tokenMessenger: TOKEN_MESSENGER,
    besleyicisizVarlik: z.besleyicisizVarlik,
    besleyicisizKademe: z.besleyicisizKademe,
    v3Fabrika: z.v3Fabrika
  };

  const ham = await rpc(z.rpc, "eth_call", [
    { from: "0x3333333333333333333333333333333333333333", to: H,
      gas: "0x2faf080",
      data: iface.encodeFunctionData("run", [zincirArg, FON, HARCAMA, ORAN]) },
    "latest", ortuk
  ]);
  const [s] = iface.decodeFunctionResult("run", ham);

  /* ---- the slot write is proven, not assumed ---------------------- */
  const bakiye = BigInt(await rpc(z.rpc, "eth_call", [
    { to: z.usdc, data: "0x70a08231" + H.slice(2).toLowerCase().padStart(64, "0") },
    "latest", ortuk
  ]));
  ok(bakiye === FON_SLOT,
    "gercek USDC yazdigimiz degeri geri okudu",
    "slot " + USDC_BAKIYE_SLOT + " dogru");

  console.log("");
  console.log("  1) ADRES TURETME");
  console.log("     initKodHash " + s.initKodHash);
  console.log("     turetilen   " + s.turetilen);
  ok(s.adresAyni === true,
    "FABRIKANIN ONCEDEN SOYLEDIGI ADRESE DAGITILDI",
    "Arc bu adresi kimse soylemeden hesaplayabilir");

  console.log("");
  console.log("  2) FONLAMA VE KANCA");
  console.log("     kasa USDC " + U(s.kasaUsdc) + "   bekleyenQuote " + U(s.bekleyenQuote));
  ok(V(s.kasaUsdc) === FON && V(s.bekleyenQuote) === FON,
    "gercek USDC ulasti ve kanca tam o kadar kredi yazdi");
  ok(s.hedefVarlik.toLowerCase() === z.hedefVarlik.toLowerCase(),
    "hedef varlik Arc'in soyledigi token", "WETH");

  console.log("");
  console.log("  3) KASANIN KENDI TURETTIGI TABAN");
  console.log("     besleyici fiyati  $" +
    (Number(s.besleyiciFiyati) / 10 ** z.besleyiciOndalik).toLocaleString("en", { maximumFractionDigits: 2 }));
  console.log("     taban             " + W(s.taban));
  ok(V(s.besleyiciFiyati) > 0n, "besleyici pozitif bir fiyat verdi");
  ok(V(s.taban) > 0n, "taban sifir degil — besleyici okundu ve taze");

  console.log("");
  console.log("  4) DURUST ALIM — " + U(HARCAMA) + " -> WETH");
  if (!s.alisGecti) { console.log("     revert:"); revertYaz(s.alisSebep, 5); }
  console.log("     alinan " + W(s.alinan) + "   tutulan " + W(s.tutulan) +
              "   cagirana odul " + U(s.alisOdulu));
  ok(s.alisGecti === true, "ALIM GERCEK UNISWAP HAVUZUNDA GERCEKLESTI",
    s.alisGecti ? W(s.alinan) : hataAdi(s.alisSebep));
  ok(V(s.alinan) > V(s.taban),
    "CIKTI TABANIN USTUNDE — taban durust rotayi engellemiyor",
    W(s.alinan) + " > " + W(s.taban));
  ok(V(s.tutulan) === V(s.alinan), "alinanin tamami kasada");
  /* How much room the floor leaves against what the pool actually paid.
     A floor far below the pool is still a floor a hostile route can skim
     under, so the gap is bounded here and not merely printed. */
  const bosluk = (V(s.alinan) - V(s.taban)) * 10_000n / V(s.alinan);
  ok(bosluk < 400n,
    "TABAN BOSLUGU SINIRLI",
    "%" + (Number(bosluk) / 100).toFixed(2) + " < %4,00 — tolerans DEX " +
      "ucretini, gercek kaymayi ve besleyici gecikmesini karsilamak " +
      "zorunda, ama fazlasi siyrilabilir pay demek");
  ok(V(s.alisOdulu) === (HARCAMA * 5n) / 10_000n,
    "ODUL CAGIRANA ULASTI", U(s.alisOdulu) + " (%0,05)");

  console.log("");
  console.log("  5) DUSMAN YURUTUCU — " + U(HARCAMA) + " odunc, $1,00 harcama, sinir 1");
  if (!s.soygunGecti) { console.log("     revert:"); revertYaz(s.soygunSebep, 5); }
  ok(s.soygunGecti === false, "SOYGUN REDDEDILDI", hataAdi(s.soygunSebep));
  ok(V(s.soyguncudaKalan) === 0n,
    "SALDIRGANDA TEK KURUS KALMADI",
    U(s.soyguncudaKalan) + " — taban cagiranin parametresiyken " +
      U(HARCAMA - 1_000_000n) + " gidiyordu");

  console.log("");
  console.log("  6) BESLEYICISI OLMAYAN VARLIK — ARTIK CALISMASI GEREKIYOR");
  console.log("     Bu bolum tersine cevrildi. Eskiden besleyicisi olmayan bir");
  console.log("     varliga hic donusulemedigini olcuyordu; kullanici o kurali");
  console.log("     kaldirdi. Simdi iki sey birlikte olculuyor, cunku yalniz");
  console.log("     birincisi olculse 'artik calisiyor' ile 'artik hicbir sey");
  console.log("     kontrol etmiyor' ayni gorunurdu.");
  console.log("");
  console.log("     taban      " + (V(s.besleyicisizTaban) === 0n ? "SIFIR" :
    V(s.besleyicisizTaban).toLocaleString("en") + " birim"));
  ok(V(s.besleyicisizTaban) > 0n,
    "TABAN HAVUZDAN GELDI",
    "fabrikanin besleyici tablosunda bu varlik YOK, yani sifir olmayan bir " +
      "taban yalnizca havuzun 30 dakikalik ortalamasindan gelebilir");

  if (!s.besleyicisizGecti) { console.log("     dogru rota reddedildi:"); revertYaz(s.besleyicisizSebep, 5); }
  ok(s.besleyicisizGecti === true,
    "BESLEYICISIZ VARLIGA DOGRU ROTAYLA DONUSULEBILIYOR",
    s.besleyicisizGecti
      ? V(s.besleyicisizAlinan).toLocaleString("en") + " birim alindi"
      : hataAdi(s.besleyicisizSebep));

  if (!s.besleyicisizSoygunGecti) { console.log("     soygun reddedildi:"); revertYaz(s.besleyicisizSoygunSebep, 5); }
  ok(s.besleyicisizSoygunGecti === false,
    "AYNI VARLIKTA DUSMANCA ROTA YINE REDDEDILIYOR",
    s.besleyicisizSoygunGecti
      ? "GECTI — kapi kaldirildi ve yerine KONAN SEY CALISMIYOR"
      : hataAdi(s.besleyicisizSoygunSebep) + " — taban besleyiciden degil " +
        "havuzdan gelmesine ragmen tutuyor");

  console.log("");
  console.log("  7) SATIS BASKISI — Arc'in verdigi izin kadar");
  console.log("     izin " + W(s.izin) + "   satilan " + W(s.satilanTutar) +
              "   gelen " + U(s.gelenQuote));
  if (!s.satisGecti) { console.log("     revert:"); revertYaz(s.satisSebep, 5); }
  ok(V(s.izin) === V(s.satilanTutar), "izin emirdeki miktar kadar");
  ok(s.fazlaReddedildi === true,
    "IZINDEN BIR BIRIM FAZLASI REDDEDILDI",
    "kasa varliga sahip ama satma yetkisi Arc'in verdigi kadar");
  ok(s.satisGecti === true, "SATIS GERCEK HAVUZDA GERCEKLESTI",
    s.satisGecti ? U(s.gelenQuote) : hataAdi(s.satisSebep));
  ok(V(s.izinSonra) === 0n, "izin tukendi — ayni emirle ikinci satis yok");

  console.log("");
  console.log("  8) DONUS BACAGI — bu zincirin GERCEK CCTP'si, hedef domain 26");
  if (!s.arcaGectiMi) { console.log("     revert:"); revertYaz(s.arcaSebep, 5); }
  console.log("     Arc'a giden " + U(s.arcaGiden) + "   kasada kalan " + U(s.kasadaKalan));
  ok(s.arcaGectiMi === true,
    "GERCEK depositForBurnWithHook CAGRIMIZI KABUL ETTI",
    s.arcaGectiMi ? "domain 26" : hataAdi(s.arcaSebep));
  ok(V(s.kasadaKalan) === 0n, "defterde bekleyen quote kalmadi");
  console.log("     kasanin GERCEK USDC bakiyesi " + U(s.kasaUsdcSonra));
  ok(V(s.kasaUsdcSonra) === 0n,
    "ZINCIRDEKI BAKIYE DE SIFIR — defter ile gercek ayni seyi soyluyor",
    "defterin sifir demesi yetmez; eski kasada bakiye ile defter " +
      "ayrismasi tam olarak boyle gorunmezdi");

  /* The cost of holding collateral elsewhere, priced on THIS chain. */
  const girdi = (HARCAMA * ORAN) / 100n;
  const geri = V(s.gelenQuote);
  const fark = girdi > geri ? girdi - geri : 0n;
  console.log("");
  console.log("     TUR BASINA SURTUNME: " + U(girdi) + " girdi, " + U(geri) +
              " geri geldi — fark " + U(fark) + " (%" +
              (Number(fark) * 100 / Number(girdi)).toFixed(2) + ")");
  return Number(fark) * 100 / Number(girdi);
}

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => {
    if (!iyi) kotu++;
    console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
  };

  console.log("ASAMA 5-10 — VARIS TARAFI, DOGRULANMIS HER ZINCIRDE");

  const calisan = [];
  for (const z of ZINCIRLER) {
    try {
      const id = BigInt(await rpc(z.rpc, "eth_chainId", []));
      if (id !== BigInt(z.zincirId)) {
        console.log("");
        console.log("  " + z.ad + " ATLANDI — " + z.rpc + " zincir " + id +
                    ", beklenen " + z.zincirId);
        continue;
      }
      z.blok = BigInt(await rpc(z.rpc, "eth_blockNumber", []));
      calisan.push(z);
    } catch (e) {
      console.log("");
      console.log("  " + z.ad + " ATLANDI — " + z.rpc + " cevap vermiyor");
    }
  }

  if (calisan.length === 0) {
    console.log("");
    console.log("ATLANDI — hicbir fork ayakta degil. Bu kosum sunlari istiyor:");
    console.log("  anvil --fork-url https://ethereum-rpc.publicnode.com --port 8546 --silent");
    console.log("  anvil --fork-url https://base-rpc.publicnode.com     --port 8547 --silent");
    process.exit(75);
  }

  const surtunme = {};
  for (const z of calisan) {
    console.log("");
    console.log("================================================================");
    console.log(" " + z.ad.toUpperCase() + "  (zincir " + z.zincirId +
                ", CCTP domain " + z.cctpDomain + ", blok " + z.blok.toLocaleString("en") + ")");
    console.log("================================================================");
    surtunme[z.ad] = await kosZincir(z, ok);
  }

  console.log("");
  console.log("================================================================");
  console.log(" ZINCIRLER ARASI KARSILASTIRMA");
  console.log("================================================================");
  for (const [ad, s] of Object.entries(surtunme)) {
    console.log("  " + ad.padEnd(10) + " tur basina surtunme %" + s.toFixed(2));
  }
  /* The point of running two chains: not that both pass, but that nothing
     in the contracts had to change between them. */
  ok(calisan.length >= 2,
    "AYNI YIGIN IKI ZINCIRDE DE KOSTU — hicbir sozlesmede satir degismedi",
    calisan.map((z) => z.ad).join(" + ") +
      (calisan.length < 2 ? "  (ikinci fork ayakta degil)" : ""));

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) revertYaz(String(e.data), 1);
  process.exit(1);
});
