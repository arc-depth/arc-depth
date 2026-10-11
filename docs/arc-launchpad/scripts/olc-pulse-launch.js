"use strict";
/* ===========================================================================
 * olc-pulse-launch.js — yeni launch uçtan uca, iki kritik bilinmeyenle
 *
 *   node scripts/olc-pulse-launch.js
 *
 * İKİ ŞEY BAŞKA HİÇBİR YERDE GÖRÜNMÜYOR
 *
 *   1. EXACT-OUTPUT TAKAS ÜCRET ÖDÜYOR MU
 *      Eski kanca exact-output'ta sıfır döndürüyordu, yani bir aggregator
 *      "bana tam N token ver" diyerek vergisiz işlem yapabiliyordu. Yeni
 *      kanca ücreti GİRDİden alıyor. v4'ün pozitif `afterSwap` deltasını
 *      trader'ın BORCUNA uyguladığını yalnızca ölçüm söyler.
 *
 *   2. dolasim() HAVUZU DIŞLIYOR MU
 *      Eğri kalktı, satılmamış arz artık havuzda ve kasanın `egri`
 *      yuvasına PoolManager verildi. Yanlış olsa REVERT ETMEZDİ — hak
 *      kimsenin sahip olmadığı ~%97 arzla sulanır ve her iade teminatın
 *      küçük bir kesrini öder. O yüzden dolaşım, kodu paylaşmayan bir
 *      hesapla karşılaştırılıyor.
 *
 * ADRESLER CREATE2 İLE
 *   Kanca launchpad'in adresini, launchpad de kancanın adresini taşımak
 *   zorunda. Proje bu döngüyü nonce tahminiyle çözüyordu ve o tahmin dört
 *   koşum kaybettirdi. Burada ikisi de sabit tuzlu CREATE2 ve bu betik
 *   adresleri bağımsız olarak hesaplıyor.
 *
 * GERÇEK ARC, SIFIR HARCAMA
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface, AbiCoder, keccak256, getCreate2Address } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const coder = AbiCoder.defaultAbiCoder();

const HARNESS = "0x00000000000000000000000000000000000B1A5E";
const CAGIRAN = "0x3333333333333333333333333333333333333333";
/* The hook's address IS its permission set in v4: the low bits say which
   callbacks it may receive. 0xa44 = beforeAddLiquidity,
   beforeRemoveLiquidity, afterSwap, afterSwapReturnDelta — the same four
   the previous hook used, because the same four are needed. */
const HOOK = "0x0000000000000000000000000000000000000ACC";

const USDC = "0x3600000000000000000000000000000000000000";
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
  const PM = D.arc.poolManager;
  const KASA_FABRIKA = D.arc.kasaFabrika;
  const KAYIT = D.arc.kayit;
  const TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
  const MESAJ_TASIYICI = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

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
    const ham = await rpc("eth_call", [
      { from: CAGIRAN, to: HARNESS, gas: "0x30000000", data: veri }, "latest",
      { [HARNESS]: {
          code: Y.deployedBytecode,
          balance: "0x" + (1_000_000n * 10n ** 18n).toString(16)
        },
        [HOOK]: { code: hookKod } }]);
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
