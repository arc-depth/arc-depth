"use strict";
/* ===========================================================================
 * olc-pulse-canli.js — DAĞITILMIŞ launchpad işe yarıyor mu
 *
 *   node scripts/olc-pulse-canli.js
 *
 * NEDEN BU KOŞUM AYRI
 *   `olc-pulse-launch.js` launchpad'i harness içinde kuruyor ve bu, hiçbir
 *   şey dağıtılmamışken doğru olan şeydi: ölçülen KODdu. Artık zincirde bir
 *   tane var ve üç iddia farklı:
 *
 *     "bu kod doğru"                     601 sav + launch ölçümü
 *     "zincirdeki bu adres doğru"        denetim-dagitim-pulse2, 34 sav
 *     "zincirdeki bu adres İŞE YARIYOR"  ← burası
 *
 *   Hiçbir şey dağıtmıyor. Dağıtılmış launchpad'i çağırıyor, DAĞITILMIŞ
 *   kancayla, gerçek PoolManager'a karşı. Enjekte edilen tek şey harness'ın
 *   kendisi ve bakiyesi — kanca zincirde, yani ölçülen kanca gerçekten
 *   kullanıcıların karşılaşacağı kanca.
 *
 * VE HİÇBİR ŞEY HARCAMIYOR
 *   Tek bir `eth_call`. Sonunda durum atılıyor, zincire tek bayt
 *   yazılmıyor. Ölçemediği tek şey kalıcılık.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";

const HARNESS = "0x000000000000000000000000000000000CA17171";
const CAGIRAN = "0x3333333333333333333333333333333333333333";

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

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en",
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const U6 = (v) => "$" + (Number(v) / 1e6).toLocaleString("en",
  { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const T = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
const V = (v) => BigInt(v.toString());

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse2.json"), "utf8"));
  const LP = D.arc.launchpad;
  const HOOK = D.arc.hook;
  const USDC = D.arc.quote;
  const LIKIDITE = D.arc.likiditeKasasi;

  const Y = B("TestPulseCanli");
  const iface = new Interface(Y.abi);

  console.log("PULSE CANLI — DAGITILMIS launchpad, harcanan $0");
  console.log("  launchpad  " + LP + "   (ZINCIRDEKI)");
  console.log("  hook       " + HOOK + "   (ZINCIRDEKI)");
  console.log("  likidite   " + LIKIDITE + "   (ZINCIRDEKI)");
  console.log("  harness    " + HARNESS + "   (tek enjekte edilen sey)");
  console.log("");

  /* The hook has to be the one at the deployed address, not an injected
     copy. Checked by code length: an override here would make the whole
     run measure something nobody will ever use. */
  const hookKod = await rpc("eth_getCode", [HOOK, "latest"]);
  const beklenenHook = (B("PulseHook").deployedBytecode.length - 2) / 2;
  ok(((String(hookKod).length - 2) / 2) === beklenenHook,
    "ZINCIRDEKI KANCA DERLENENLE AYNI BOYDA",
    ((String(hookKod).length - 2) / 2) + " bayt — enjekte edilmedi, " +
      "kullanicilarin karsilasacagi kanca bu");

  const veri = iface.encodeFunctionData("kos",
    [LP, USDC, LIKIDITE, ALIM, TEMINAT, VERGI_PPM, HEDEF]);

  let s;
  try {
    const ham = await rpc("eth_call", [
      { from: CAGIRAN, to: HARNESS, gas: "0x30000000", data: veri }, "latest",
      { [HARNESS]: {
        code: Y.deployedBytecode,
        /* Native balance IS the USDC balance on Arc — the same money, 18
           decimals natively and 6 through the ERC20 view, measured at a
           ratio of exactly 1e12. */
        balance: "0x" + (1_000_000n * 10n ** 18n).toString(16)
      } }]);
    [s] = iface.decodeFunctionResult("kos", ham);
  } catch (e) {
    console.log("");
    console.log("  KOSUM REVERT ETTI: " + e.message.slice(0, 140));
    if (e.data) console.log("  revert: " + hataAdi(e.data));
    process.exit(1);
  }

  /* ---- 1. the launch -------------------------------------------- */
  console.log("");
  console.log("1) LAUNCH — DAGITILMIS launchpad");
  if (!s.launchGecti) {
    console.log("     revert: " + hataAdi(s.launchSebep));
    ok(false, "LAUNCH GECTI", hataAdi(s.launchSebep));
    console.log("");
    console.log(kotu + " KOTU");
    process.exit(1);
  }
  console.log("     token      " + s.token +
    (s.tokenSifirinci ? "  (currency0)" : "  (currency1)"));
  console.log("     kasa       " + s.kasa);
  console.log("     kurucu     " + s.kurucu);
  console.log("     odeme      " + U(s.alim) + "   ucret " + U(s.ucret) +
    "   net " + U(s.net));
  console.log("     kurucuya   " + T(s.kurucuToken) + " token   (%" +
    (Number(V(s.kurucuToken) * 10_000n / V(s.arz)) / 100).toFixed(2) + " arz)");
  console.log("     teminat    " + U(s.kasadakiUsdc) + " kasada");

  ok(s.launchGecti === true, "LAUNCH GECTI");
  const beklenenKurucu = (V(s.net) * (10n ** 27n)) / 3_500_000_000n;
  ok(V(s.kurucuToken) === beklenenKurucu,
    "KURUCUNUN PAYI ACILIS FIYATINDAN NET ODEMESININ TAM KARSILIGI",
    T(s.kurucuToken) + " = " + U(s.net) + " / $0,0000035 — bedava token yok");
  ok(V(s.kasadakiUsdc) >= TEMINAT, "KASA TEMINATI TUTUYOR",
    U(s.kasadakiUsdc) + " — defterden degil USDC sozlesmesinden okundu");
  ok(V(s.havuzSqrtP) === V(s.beklenenSqrtP),
    "HAVUZ ACILIS FIYATINDA ACILDI", "tick " + s.havuzTick);
  console.log("     acicida kalan   " + V(s.aciciKalanToken) + " ham token, " +
    V(s.aciciKalanQuote) + " ham quote");
  const kalanOran = Number(V(s.aciciKalanToken)) / Number(V(s.merdiven));
  ok(kalanOran < 1e-9 && V(s.aciciKalanQuote) < 1_000n,
    "IKI TARAF DA HAVUZA GIRDI",
    "token kalani merdivenin %" + (kalanOran * 100).toExponential(2) + "'i");
  ok(V(s.bildirilenTeklif) > 0n,
    "BILDIRILEN GERCEK TEKLIF SIFIR DEGIL",
    U(s.bildirilenTeklif) + " — arayuz bu sayiyi gosterecek, sanal bir " +
      "seyi gercek gibi gosteremesin");

  /* ---- 2. circulating supply ----------------------------------- */
  console.log("");
  console.log("2) dolasim() HAVUZU DISLIYOR MU — hic revert etmeyen hata");
  console.log("     arz " + T(s.arz) + "   havuzda " + T(s.havuzdakiToken) +
    "   cuzdanlarda " + T(s.cuzdandaki) + "   dolasim() " + T(s.dolasim));
  ok(V(s.dolasim) === V(s.cuzdandaki),
    "DOLASIM, GERCEKTEN CUZDANDA DURANLA AYNI",
    T(s.dolasim) + " — havuz dislanmasa hak kimsenin sahip olmadigi %" +
      (Number(V(s.havuzdakiToken) * 10_000n / V(s.arz)) / 100).toFixed(2) +
      " arzla sulanirdi ve hicbir bakiyede gorunmezdi");
  ok(V(s.hak) > 0n, "KASA TOKEN BASINA BIR HAK HESAPLIYOR");

  /* ---- 3. exact-input buy: the beforeSwap leg ------------------ */
  console.log("");
  console.log("3) EXACT-INPUT ALIM — beforeSwap bacagi");
  if (!s.giristenGecti) console.log("     revert: " + hataAdi(s.giristenSebep));
  console.log("     odenen " + U(s.giristenOdenen) + "   alinan " +
    T(s.giristenAlinan) + " token");
  console.log("     kurucu " + U6(s.giristenKurucuArtti) +
    "   kasa " + U6(s.giristenKasaArtti) +
    "   derinlik " + U6(s.giristenDerinlikArtti) +
    "   likidite " + U6(s.giristenLikiditeArtti));
  ok(s.giristenGecti === true, "exact-input alim gecti",
    s.giristenGecti ? T(s.giristenAlinan) + " token" : hataAdi(s.giristenSebep));
  ok(V(s.giristenKasaArtti) > 0n,
    "ALIMIN TEMINAT VERGISI KASAYA USDC OLARAK ULASTI",
    U6(s.giristenKasaArtti) + " — beforeSwap olmadan $0,000000'di: ucret " +
      "token olarak alinip derinlige gidiyordu ve kasa hacmin yarisini " +
      "kaciriyordu");
  ok(V(s.giristenKurucuArtti) > 0n, "kurucu dilimi ulasti",
    U6(s.giristenKurucuArtti));
  ok(V(s.giristenLikiditeArtti) > 0n,
    "KILITLI PROTOKOL LIKIDITESI DILIMI YENI KASAYA ULASTI",
    U6(s.giristenLikiditeArtti) + " — ilk turda ESKI kasaya gidiyordu ve " +
      "orada mahsur kalirdi, hicbir takas revert etmeden");

  /* ---- 4. exact-output buy: the old hole ----------------------- */
  console.log("");
  console.log("4) EXACT-OUTPUT ALIM — eski kancada sifir ucret oduyordu");
  if (!s.ciktidanGecti) console.log("     revert: " + hataAdi(s.ciktidanSebep));
  console.log("     istenen " + T(s.ciktidanIstenen) + " token (tam)   odenen " +
    U6(s.ciktidanOdenen));
  console.log("     kasa " + U6(s.ciktidanKasaArtti) + "   derinlik " +
    U6(s.ciktidanDerinlikArtti));
  ok(s.ciktidanGecti === true, "exact-output alim gecti",
    s.ciktidanGecti ? U6(s.ciktidanOdenen) + " odedi" : hataAdi(s.ciktidanSebep));
  const ciktiUcret = V(s.ciktidanKurucuArtti) + V(s.ciktidanKasaArtti) +
                     V(s.ciktidanDerinlikArtti);
  ok(ciktiUcret > 0n,
    "EXACT-OUTPUT TAKAS DA UCRET ODEDI",
    U6(ciktiUcret) + " — sifir olsa 'bana tam N token ver' diyen bir " +
      "aggregator vergisiz islem yapardi");

  /* ---- 5. a sale ---------------------------------------------- */
  console.log("");
  console.log("5) SATIS");
  if (!s.satisGecti) console.log("     revert: " + hataAdi(s.satisSebep));
  console.log("     satilan " + T(s.satilanToken) + " token   alinan " +
    U6(s.satistanAlinan) + "   kasa " + U6(s.satistanKasaArtti));
  ok(s.satisGecti === true, "satis gecti",
    s.satisGecti ? U6(s.satistanAlinan) : hataAdi(s.satisSebep));
  ok(V(s.satistanKasaArtti) > 0n,
    "SATISTAN DA TEMINAT VERGISI KESILDI",
    U6(s.satistanKasaArtti) + " — alim ve satim ayri yonler ve ikisi de " +
      "odemek zorunda");

  /* ---- 6. and out of the vault -------------------------------- */
  console.log("");
  console.log("6) TOKEN YAKAN BIRI PARASINI ALABILIYOR MU");
  if (!s.iadeGecti && V(s.iadeYakilan) > 0n) {
    console.log("     revert: " + hataAdi(s.iadeSebep));
  }
  console.log("     yakilan " + T(s.iadeYakilan) + " token   beklenen " +
    U6(s.iadeBeklenen) + "   alinan " + U6(s.iadeAlinan));
  console.log("     hak " + V(s.hakIadeOncesi) + " -> " + V(s.hakIadeSonrasi));
  ok(s.iadeGecti === true, "IADE GECTI — kasa odeme yapti",
    s.iadeGecti ? U6(s.iadeAlinan) : hataAdi(s.iadeSebep));
  const bek = V(s.iadeBeklenen), alin = V(s.iadeAlinan);
  const eksik = bek > alin ? bek - alin : 0n;
  ok(bek > 0n && eksik * 10_000n <= bek,
    "ODENEN, YAYINLANAN HAKTAN AZ DEGIL",
    U6(alin) + " vs " + U6(bek) + "   eksik " + eksik + " ham birim");

  /* w = d*E/D booked at burn gives (E-w)/(D-d) = E/D, so the claim per
     remaining token must not move. Bounded RELATIVELY and checked for
     DIRECTION: integer division should leave the remainder with the
     vault, never with the redeemer. Bounded at two raw units once, which
     is meaningless against a figure scaled by 1e36. */
  const once = V(s.hakIadeOncesi), sonra = V(s.hakIadeSonrasi);
  const fark = sonra > once ? sonra - once : once - sonra;
  const oranFark = once > 0n ? Number(fark) / Number(once) : 0;
  ok(once > 0n && oranFark < 1e-6 && sonra >= once,
    "IADE DIGER SAHIPLERI SULANDIRMADI",
    "fark %" + (oranFark * 100).toExponential(2) + ", yon " +
      (sonra >= once ? "yukari (kalanlar lehine)" : "ASAGI (aleyhine)") +
      " — asagi olsa iade sahipler arasinda deger tasimis olurdu ve bu " +
      "hicbir tek bakiyede gorunmez");

  console.log("");
  console.log("================================================================");
  console.log("  Hepsi ZINCIRDEKI launchpad, kanca ve kasa fabrikasina karsi");
  console.log("  olculdu ve $0 harcandi. Olculemeyen tek sey kaliciliktir:");
  console.log("  eth_call sonunda durum atiliyor, yani launchCount zincirde");
  console.log("  0 kaliyor. 'Urun calisiyor mu' cevaplandi; 'zincirde bir");
  console.log("  token var mi' bir dogrulama degil, urun karari.");
  console.log("================================================================");
  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) console.error("  revert: " + hataAdi(e.data));
  process.exit(1);
});
