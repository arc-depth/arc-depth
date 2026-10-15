"use strict";
/* ===========================================================================
 * olc-pulse-launch.js — the new launch end to end, with two critical
 *                       unknowns
 *
 *   node scripts/olc-pulse-launch.js
 *
 * TWO THINGS ARE VISIBLE NOWHERE ELSE
 *
 *   1. DOES AN EXACT-OUTPUT SWAP PAY THE FEE
 *      The old hook returned zero on exact-output, so an aggregator could
 *      trade tax-free by saying "give me exactly N tokens". The new hook
 *      takes the fee out of the INPUT. Only measurement can say that v4
 *      applies a positive `afterSwap` delta to what the trader OWES.
 *
 *   2. DOES dolasim() EXCLUDE THE POOL
 *      The curve is gone, unsold supply now sits in the pool, and the
 *      PoolManager was put in the vault's `egri` slot. If that were wrong
 *      it WOULD NOT REVERT — the claim would be diluted by the ~97% of
 *      supply nobody owns and every redemption would pay a small fraction
 *      of the collateral. So circulating is compared against a calculation
 *      that shares none of its code.
 *
 * ADDRESSES BY CREATE2
 *   The hook has to carry the launchpad's address and the launchpad the
 *   hook's. The project used to resolve that cycle by predicting a nonce,
 *   and the prediction cost four runs. Here both are CREATE2 with a fixed
 *   salt and this script computes the addresses independently.
 *
 * THE REAL ARC, ZERO SPEND
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface, AbiCoder, keccak256, getCreate2Address } = require("ethers");

const KOK = path.join(__dirname, "..");
/* --robinhood runs the same launch against Robinhood Chain mainnet state:
 * the same PulseLaunchpad/PulseHook bytecode with USDG as the quote. Three
 * things differ and nothing else:
 *   - the quote is USDG, an ordinary ERC-20, so the harness is funded by
 *     writing its balance slot (slot 1, located by matching a real holder's
 *     balanceOf against storage) instead of by native balance
 *   - there is no CCTP on Robinhood, so the registry is KapaliKayit, which
 *     answers "no chain" to everything, and the two CCTP addresses are
 *     non-zero placeholders the vault's send path never reaches
 *   - the vault factories are not deployed there yet, so their Arc runtime
 *     code is copied to the same addresses for the call */
/* --zincir <ad> generalises --robinhood to every chain in zincirler.js:
 * the chain's own PoolManager and dollar, KapaliKayit, the factories' Arc
 * code at their Arc addresses, and the harness funded by writing the
 * dollar's balance slot (found by probing, not assumed). On BNB the dollar
 * is 18-decimal USDC, so the launchpad's quote is Dolar6 over it — the
 * 6-decimal 1:1 wrapper — and the wrapper is given exactly the underlying
 * that backs the units the harness holds. */
const { EVM } = require("./zincirler");
const zi = process.argv.indexOf("--zincir");
const ZAD = zi > 0 ? process.argv[zi + 1] : (process.argv.includes("--robinhood") ? "robinhood" : "arc");
const Z = EVM[ZAD];
if (!Z) { console.log("bilinmeyen zincir: " + ZAD); process.exit(1); }
const RH = ZAD !== "arc";
const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const RPC = RH ? Z.rpc : ARC_RPC;
const SARMAL = "0x00000000000000000000000000000000D0146A06";
const coder = AbiCoder.defaultAbiCoder();

const HARNESS = "0x00000000000000000000000000000000000B1A5E";
const CAGIRAN = "0x3333333333333333333333333333333333333333";
/* The hook's address IS its permission set in v4: the low bits say which
   callbacks it may receive. 0xa44 = beforeAddLiquidity,
   beforeRemoveLiquidity, afterSwap, afterSwapReturnDelta — the same four
   the previous hook used, because the same four are needed. */
const HOOK = "0x0000000000000000000000000000000000000ACC";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const USDG_BAKIYE_YUVASI = 1;
const KAPALI_KAYIT = "0x000000000000000000000000000000000000CA7A";
const YER_TUTUCU = "0x000000000000000000000000000000000000dEaD";
/* Named USDC for the Arc run it was written for; on --robinhood it is USDG. */
const ALTTAKI = require("ethers").getAddress(Z.dolar.adres.toLowerCase());
let USDC = RH ? ALTTAKI : "0x3600000000000000000000000000000000000000";
/* The harness's own sink constants. Must match TestPulseLaunch exactly or
   the launchpad's CREATE2 address comes out different and the hook ends up
   pointing at nothing. */
const GELISTIRICI = "0x000000000000000000000000000000000000DEF1";
const LIKIDITE = "0x00000000000000000000000000000000000011F0";
const ISLETME = "0x00000000000000000000000000000000000015E7";

const ALIM = 100_000_000n;        // $100, the rule's minimum
const TEMINAT = 30_000_000n;      // $30
const VERGI_PPM = 10_000n;        // 1%
const HEDEF = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";   // WETH on Ethereum

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let no = 1;
async function rpc(yontem, parametreler) {
  let son = null;
  for (let d = 0; d < 8; d++) {
    if (d > 0) await bekle(1500 * d);
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler }),
      signal: AbortSignal.timeout(180_000)
    }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
    if (r.result !== undefined) return r.result;
    son = (r.error && r.error.message) || "bilinmeyen";
    if (!/rate limit|too many|timeout|503|502|ECONNRESET|fetch failed/i.test(son)) {
      const e = new Error(son);
      e.data = r.error && r.error.data;
      throw e;
    }
  }
  throw new Error("uc nokta cevap vermedi: " + son);
}

const B = (ad) => JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));

const HATALAR = new Map();
(function yukle() {
  const { id } = require("ethers");
  for (const f of fs.readdirSync(path.join(KOK, "build"))) {
    if (!f.endsWith(".json")) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(KOK, "build", f), "utf8")); } catch (e) { continue; }
    for (const x of (j.abi || [])) {
      if (x.type !== "error") continue;
      HATALAR.set(id(x.name + "(" + (x.inputs || []).map((i) => i.type).join(",") + ")").slice(0, 10), x.name);
    }
  }
})();
const hataAdi = (v) => {
  const s = String(v || "");
  if (!s.startsWith("0x") || s.length < 10) return "veri yok";
  return HATALAR.get(s.slice(0, 10)) || ("bilinmeyen secici " + s.slice(0, 10));
};

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const U6 = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", {
  minimumFractionDigits: 6, maximumFractionDigits: 6
});
const T = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
const V = (v) => BigInt(v.toString());

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse.json"), "utf8"));
  /* Uniswap lists the same PoolManager address on Robinhood as on Arc. */
  const PM = RH ? require("ethers").getAddress(Z.poolManager.toLowerCase()) : D.arc.poolManager;
  const KASA_FABRIKA = D.arc.kasaFabrika;
  const KAYIT = RH ? KAPALI_KAYIT : D.arc.kayit;
  const TOKEN_MESSENGER = RH ? YER_TUTUCU : "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
  const MESAJ_TASIYICI = RH ? YER_TUTUCU : "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

  /* On Robinhood: the factories' Arc runtime code at the same addresses,
     KapaliKayit at its address, and the harness's USDG balance. */
  const ekOverride = {};
  if (RH) {
    /* Arc's RPC rate-limits; an error answer is not "no code", so retry */
    const arcKod = async (a) => {
      for (let d = 0; d < 8; d++) {
        const r = await fetch(ARC_RPC, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [a, "latest"] }) }).then((x) => x.json()).catch(() => ({}));
        if (r.result && r.result !== "0x") return r.result;
        if (r.result === "0x") break;
        await bekle(3000 * (d + 1));
      }
      throw new Error("Arc'ta kod yok: " + a);
    };
    const kfKod = await arcKod(KASA_FABRIKA);
    /* KasaFabrika's only immutable is yoneticiFabrika, the first word of
       its first immutable slot; read it from the deployed contract. */
    const yfAdres = "0x" + (await fetch(ARC_RPC, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: KASA_FABRIKA, data: new Interface(["function yoneticiFabrika() view returns (address)"]).encodeFunctionData("yoneticiFabrika") }, "latest"] }) })
      .then((x) => x.json())).result.slice(26);
    ekOverride[KASA_FABRIKA] = { code: kfKod };
    ekOverride[yfAdres] = { code: await arcKod(yfAdres) };
    ekOverride[KAPALI_KAYIT] = { code: B("KapaliKayit").deployedBytecode };
    /* the dollar's balance slot, found by writing a marker and reading it back */
    const bakIf = new Interface(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"]);
    const ondalik = Number(BigInt(await rpc("eth_call", [{ to: ALTTAKI, data: bakIf.encodeFunctionData("decimals") }, "latest"])));
    let yuvaNo = -1;
    for (let i = 0; i < 60 && yuvaNo < 0; i++) {
      const y = keccak256(coder.encode(["address", "uint256"], [HARNESS, i]));
      const v = await rpc("eth_call", [{ to: ALTTAKI, data: bakIf.encodeFunctionData("balanceOf", [HARNESS]) }, "latest",
        { [ALTTAKI]: { stateDiff: { [y]: "0x" + (12345n).toString(16).padStart(64, "0") } } }]);
      if (BigInt(v) === 12345n) yuvaNo = i;
    }
    if (yuvaNo < 0) { console.log("bakiye yuvasi bulunamadi: " + ALTTAKI); process.exit(1); }
    const yaz = (adres, miktar) => ({ [keccak256(coder.encode(["address", "uint256"], [adres, yuvaNo]))]: "0x" + miktar.toString(16).padStart(64, "0") });
    if (ondalik === 6) {
      ekOverride[ALTTAKI] = { stateDiff: yaz(HARNESS, 1_000_000n * 10n ** 6n) };
    } else {
      /* Dolar6 over the 18-decimal dollar: its runtime with immutables
         filled, the harness's units and totalSupply in its storage, and the
         underlying that backs them in the wrapper's balance. */
      const D6 = B("Dolar6");
      const d6Kod = await rpc("eth_call", [{ data: D6.bytecode + coder.encode(["address", "string", "string"], [ALTTAKI, "pUSDC", "pUSDC"]).slice(2) }, "latest"]);
      const birim = 1_000_000n * 10n ** 6n;
      const olcek = 10n ** BigInt(ondalik - 6);
      ekOverride[SARMAL] = { code: d6Kod, stateDiff: {
        ["0x" + (2).toString(16).padStart(64, "0")]: "0x" + birim.toString(16).padStart(64, "0"),
        [keccak256(coder.encode(["address", "uint256"], [HARNESS, 3]))]: "0x" + birim.toString(16).padStart(64, "0") } };
      ekOverride[ALTTAKI] = { stateDiff: yaz(SARMAL, birim * olcek) };
      USDC = SARMAL;
      console.log("  dolar " + ondalik + " ondalik: launchpad'in teklif varligi Dolar6 (" + SARMAL + ")");
    }
    console.log(Z.ad.toUpperCase() + " — " + Z.dolar.sembol + " (yuva " + yuvaNo + "), KapaliKayit, fabrikalar Arc kodundan (yoneticiFabrika " + yfAdres + ")");
  }

  const FB = B("PulseFabrika");
  const LPB = B("PulseLaunchpad");
  const HKB = B("PulseHook");
  const Y = B("TestPulseLaunch");
  const iface = new Interface(Y.abi);

  /* ---- the two CREATE2 addresses, derived not guessed -------------- */
  const fabrikaAdres = getCreate2Address(
    HARNESS, "0x" + "00".repeat(32), keccak256(FB.bytecode));

  const lpInit = LPB.bytecode + coder.encode(
    ["address", "address", "address", "address", "address",
     "address", "address", "address", "address", "address", "address"],
    [USDC, PM, HOOK, fabrikaAdres, KASA_FABRIKA,
     GELISTIRICI, LIKIDITE, ISLETME, KAYIT, TOKEN_MESSENGER, MESAJ_TASIYICI]).slice(2);
  const lpAdres = getCreate2Address(
    HARNESS, "0x" + "00".repeat(32), keccak256(lpInit));

  console.log("PULSE LAUNCH — uctan uca, gercek Arc, harcanan $0");
  console.log("  poolManager   " + PM);
  console.log("  kasaFabrika   " + KASA_FABRIKA + "   (DAGITILMIS olani)");
  console.log("  kayit         " + KAYIT + "   (DAGITILMIS olani)");
  console.log("  harness       " + HARNESS);
  console.log("  hook          " + HOOK + "   (0xacc izin bitleri: +beforeSwap)");
  console.log("");
  console.log("  CREATE2 ile turetilen adresler, tahmin degil:");
  console.log("     fabrika     " + fabrikaAdres);
  console.log("     launchpad   " + lpAdres);
  console.log("");

  /* The hook's runtime code with its immutables filled in: run the init
     code through eth_call with no `to`, which returns exactly what a
     deployment would have left at the address. */
  const hookKod = await rpc("eth_call", [{
    data: HKB.bytecode + coder.encode(
      ["address", "address", "address", "address", "address", "address"],
      [PM, lpAdres, USDC, GELISTIRICI, LIKIDITE, ISLETME]).slice(2)
  }, "latest"]);
  ok(!!hookKod && hookKod !== "0x", "hook kodu kuruldu (immutable'lar dolu)",
    ((hookKod.length - 2) / 2) + " bayt, launchpad " + lpAdres.slice(0, 10) + "...");

  const veri = iface.encodeFunctionData("kos",
    [PM, USDC, HOOK, KASA_FABRIKA, KAYIT, TOKEN_MESSENGER, MESAJ_TASIYICI,
     ALIM, TEMINAT, VERGI_PPM, HEDEF]);

  let s;
  try {
    /* Some RPCs (Monad) cap eth_call gas below what others accept; step down. */
    let ham;
    for (const gaz of ["0x30000000", "0x10000000", "0x8000000", "0x5F5E100"]) {
      try { ham = await rpc("eth_call", [
      { from: CAGIRAN, to: HARNESS, gas: gaz, data: veri }, "latest",
      { [HARNESS]: {
          code: Y.deployedBytecode,
          balance: "0x" + (1_000_000n * 10n ** 18n).toString(16)
        },
        [HOOK]: { code: hookKod }, ...ekOverride }]); break; }
      catch (e) { if (!/gas limit too high|gas.*cap|exceeds/i.test(e.message)) throw e; }
    }
    [s] = iface.decodeFunctionResult("kos", ham);
  } catch (e) {
    console.log("");
    console.log("  KOSUM REVERT ETTI: " + e.message.slice(0, 140));
    if (e.data) console.log("  revert: " + hataAdi(e.data));
    process.exit(1);
  }

  /* ---- 0. the addresses matched ---------------------------------- */
  console.log("");
  console.log("0) ADRES DONGUSU KAPANDI MI");
  ok(s.fabrika.toLowerCase() === fabrikaAdres.toLowerCase(),
    "fabrika turetilen adrese dustu", s.fabrika);
  ok(s.launchpad.toLowerCase() === lpAdres.toLowerCase(),
    "LAUNCHPAD TURETILEN ADRESE DUSTU",
    s.launchpad + " — kancanin immutable'i bu adresi tasiyor, ayrisirsa " +
      "kanca her takasta BilinmeyenHavuz atardi");

  /* ---- 1. the launch -------------------------------------------- */
  console.log("");
  console.log("1) LAUNCH");
  if (!s.launchGecti) {
    console.log("     revert: " + hataAdi(s.launchSebep));
    ok(false, "LAUNCH GECTI", hataAdi(s.launchSebep));
    console.log("");
    console.log(kotu + " KOTU");
    process.exit(1);
  }
  console.log("     token      " + s.token + (s.tokenSifirinci ? "  (currency0)" : "  (currency1)"));
  console.log("     acici      " + s.acici);
  console.log("     kasa       " + s.kasa);
  console.log("     odeme      " + U(s.alim) + "   ucret " + U(s.ucret) +
    "   net " + U(s.net));
  console.log("     kurucuya   " + T(s.kurucuToken) + " token   (%" +
    (Number(V(s.kurucuToken) * 10_000n / V(s.arz)) / 100).toFixed(2) + " arz)");
  console.log("     merdivene  " + T(s.merdiven) + " token");
  console.log("     teminat    " + U(s.kasadakiUsdc) + " kasada");

  ok(s.launchGecti === true, "LAUNCH GECTI");
  /* The founder's share must be worth exactly the net payment at the
     opening price. Nobody was given anything. */
  const beklenenKurucu = (V(s.net) * (10n ** 27n)) / 3_500_000_000n;
  ok(V(s.kurucuToken) === beklenenKurucu,
    "KURUCUNUN PAYI ACILIS FIYATINDAN NET ODEMESININ TAM KARSILIGI",
    T(s.kurucuToken) + " = " + U(s.net) + " / $0,0000035 — bedava token yok");
  ok(V(s.kasadakiUsdc) >= TEMINAT,
    "KASA TEMINATI TUTUYOR",
    U(s.kasadakiUsdc) + " — defterden degil USDC sozlesmesinden okundu");
  ok(V(s.havuzSqrtP) === V(s.beklenenSqrtP),
    "HAVUZ ACILIS FIYATINDA ACILDI",
    "tick " + s.havuzTick + " — miktarlarin oranindan turetilmedi");
  /* NOT EXACTLY ZERO, AND THE FORMATTER WAS HIDING IT
       Asserted == 0 first and the run failed while PRINTING "0 token,
       $0.00" — the display rounds to two decimals and the real remainder
       is a few raw units. v4 liquidity is an integer, so a one-sided
       amount can rarely be consumed to the last wei.

       The remainder is not lost: biriktir() sweeps it into the pool
       later, which is what that function is for. So the bound is
       NEGLIGIBLE rather than zero — and printed raw, because a formatter
       that rounds a failure into a pass is worse than no formatter. */
  console.log("     acicida kalan   " + V(s.aciciKalanToken) + " ham token, " +
    V(s.aciciKalanQuote) + " ham quote");
  const kalanOran = Number(V(s.aciciKalanToken)) / Number(V(s.merdiven));
  ok(kalanOran < 1e-9 && V(s.aciciKalanQuote) < 1_000n,
    "ACICIDA KAYDA DEGER HICBIR SEY KALMADI — iki taraf da havuza girdi",
    "token kalani merdivenin %" + (kalanOran * 100).toExponential(2) +
      "'i, quote kalani " + V(s.aciciKalanQuote) + " ham birim (<$0,001)");
  ok(V(s.bildirilenTeklif) > 0n,
    "BILDIRILEN GERCEK TEKLIF SIFIR DEGIL",
    U(s.bildirilenTeklif) + " vs net " + U(s.net) +
      " — arayuz bu sayiyi gosterecek");

  /* ---- 2. the circulating-supply question ----------------------- */
  console.log("");
  console.log("2) dolasim() HAVUZU DISLIYOR MU — hic revert etmeyen hata");
  console.log("     toplam arz        " + T(s.arz));
  console.log("     havuzda (satilmamis) " + T(s.havuzdakiToken));
  console.log("     cuzdanlarda       " + T(s.cuzdandaki));
  console.log("     kasa dolasim()    " + T(s.dolasim));
  console.log("     hak               " + V(s.hak).toString());

  ok(V(s.dolasim) === V(s.cuzdandaki),
    "DOLASIM, GERCEKTEN CUZDANDA DURANLA AYNI",
    T(s.dolasim) + " = " + T(s.cuzdandaki) + " — havuz dislanmasa hak " +
      "kimsenin sahip olmadigi %" +
      (Number(V(s.havuzdakiToken) * 10_000n / V(s.arz)) / 100).toFixed(2) +
      " arzla sulanirdi ve hicbir bakiyede gorunmezdi");
  ok(V(s.dolasim) > 0n && V(s.dolasim) < V(s.arz),
    "dolasim arzdan kucuk ve sifir degil");
  ok(V(s.hak) > 0n, "KASA TOKEN BASINA BIR HAK HESAPLIYOR",
    "hak = ekonomik * 1e36 / dolasim");

  /* ---- 3. exact-input buy ------------------------------------- */
  console.log("");
  console.log("3) EXACT-INPUT ALIM");
  if (!s.giristenGecti) console.log("     revert: " + hataAdi(s.giristenSebep));
  console.log("     odenen     " + U(s.giristenOdenen));
  console.log("     alinan     " + T(s.giristenAlinan) + " token");
  console.log("     kurucuya   " + U6(s.giristenKurucuArtti));
  console.log("     kasaya     " + U6(s.giristenKasaArtti));
  console.log("     derinlige  " + U6(s.giristenDerinlikArtti));
  ok(s.giristenGecti === true, "exact-input alim gecti",
    s.giristenGecti ? T(s.giristenAlinan) + " token" : hataAdi(s.giristenSebep));
  ok(V(s.giristenKurucuArtti) > 0n, "kurucu dilimi ulasti");
  ok(V(s.giristenKasaArtti) > 0n, "TEMINAT VERGISI KASAYA ULASTI");
  ok(V(s.giristenDerinlikArtti) > 0n,
    "DERINLIK DILIMI ULASTI",
    "holder odulu kaldirildi ve payi buraya geldi: %0,40 -> %0,70");

  /* ---- 4. exact-OUTPUT buy: the hole --------------------------- */
  console.log("");
  console.log("4) EXACT-OUTPUT ALIM — ESKI KANCADA SIFIR UCRET ODUYORDU");
  if (!s.ciktidanGecti) console.log("     revert: " + hataAdi(s.ciktidanSebep));
  console.log("     istenen    " + T(s.ciktidanIstenen) + " token (tam)");
  console.log("     odenen     " + U6(s.ciktidanOdenen));
  console.log("     kurucuya   " + U6(s.ciktidanKurucuArtti));
  console.log("     kasaya     " + U6(s.ciktidanKasaArtti));
  console.log("     derinlige  " + U6(s.ciktidanDerinlikArtti));
  ok(s.ciktidanGecti === true, "exact-output alim gecti",
    s.ciktidanGecti ? U6(s.ciktidanOdenen) + " odedi" : hataAdi(s.ciktidanSebep));
  /* THE assertion. Zero here means an aggregator asking for an exact
     output trades tax free, which is the hole the whole hook rewrite
     exists to close. */
  const ciktiUcret = V(s.ciktidanKurucuArtti) + V(s.ciktidanKasaArtti) +
                     V(s.ciktidanDerinlikArtti);
  ok(ciktiUcret > 0n,
    "EXACT-OUTPUT TAKAS DA UCRET ODEDI",
    U6(ciktiUcret) + " — sifir olsa 'bana tam N token ver' diyen bir " +
      "aggregator vergisiz islem yapardi, ve madde 7 tam bunu kapatiyor");
  ok(V(s.ciktidanKasaArtti) > 0n,
    "exact-output'ta teminat vergisi de kasaya ulasti");

  /* ---- 5. a sale ---------------------------------------------- */
  console.log("");
  console.log("5) SATIS");
  if (!s.satisGecti) console.log("     revert: " + hataAdi(s.satisSebep));
  console.log("     satilan    " + T(s.satilanToken) + " token");
  console.log("     alinan     " + U6(s.satistanAlinan));
  console.log("     kasaya     " + U6(s.satistanKasaArtti));
  ok(s.satisGecti === true, "satis gecti",
    s.satisGecti ? U6(s.satistanAlinan) : hataAdi(s.satisSebep));
  ok(V(s.satistanKasaArtti) > 0n,
    "SATISTAN DA TEMINAT VERGISI KESILDI",
    U6(s.satistanKasaArtti) + " — alim ve satim ayri yonler ve ikisi de " +
      "odemek zorunda");

  console.log("");
  console.log("================================================================");
  console.log("  Hepsi zincirdeki PoolManager, KasaFabrika ve kayda karsi");
  console.log("  olculdu ve $0 harcandi.");
  console.log("================================================================");
  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) console.error("  revert: " + hataAdi(e.data));
  process.exit(1);
});
