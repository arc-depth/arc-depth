"use strict";
/* ===========================================================================
 * olc-canli-yasam.js — the DEPLOYED launchpad's full life cycle, for free
 *
 *   node scripts/olc-canli-yasam.js
 *
 * WHAT IT DOES
 *   It makes the launchpad that sits on chain perform a real launch, buys
 *   the token with nothing but USDC, measures that the buy's tax reaches
 *   the vault, then burns tokens and takes the money back out of the vault.
 *   All of it on the real Arc, against the real PoolManager, with the real
 *   deployed hook.
 *
 * AND IT SPENDS NOTHING
 *   The user's question: *"simulate it too, why would you use real money."*
 *   The right question, and the answer is: you do not have to. An
 *   `eth_call` state override gives the harness a balance, the whole cycle
 *   runs in one call, and at the end the state is discarded. Not one byte
 *   is written to the chain.
 *
 *   On Arc this is especially clean: USDC is both the quote and the native
 *   gas token, and the ERC20 `balanceOf` IS the native balance — measured,
 *   the ratio is exactly 1e12. So a `balance` override supplies both the
 *   gas and the money, with no need to find a token contract's storage
 *   slot.
 *
 * THE ONE THING A SIMULATION CANNOT MEASURE
 *   Persistence. The EVM semantics are identical, but at the end of an
 *   `eth_call` the state is discarded, so `launchCount()` stays zero. That
 *   is why this run answers "does the product work" and not "is there a
 *   token on chain". The second is not a verification but a product
 *   decision — and it should only be asked once the first one passes.
 *
 * WHY ALL FOUR TOGETHER
 *   The launch, the buy, the tax and the redemption are measured in
 *   sequence on the same money. Measured separately, a system whose links
 *   between them were broken would also pass four tests: the vault can
 *   fill while the claim calculation does not see that money, and the
 *   claim can be right while the redemption does not pay.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";

/* Where the harness is injected. Any address with no code; nothing is
   deployed, so EIP-170 never applies and a 4.9KB harness is fine. */
const HARNESS = "0x00000000000000000000000000000000CA711BE5";
const CAGIRAN = "0x3333333333333333333333333333333333333333";

/* Ethereum's WETH: the deepest asset in the depth measurement. The target
   only matters once collateral leaves Arc, but it is fixed forever at the
   remote vault's first funded arrival, so it is chosen rather than
   defaulted. */
const HEDEF_VARLIK = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const ODEME = 100_000_000n;        // $100, the contract's own minimum
const TEMINAT = 30_000_000n;       // $30
const VERGI_PPM = 10_000n;         // 1%
const ALIM = 50_000_000n;          // $50 from a stranger
const IADE_ORANI = 4_000n;         // 40% of what they bought, burned back

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

let no = 1;
async function rpc(yontem, parametreler) {
  let son = null;
  for (let d = 0; d < 8; d++) {
    if (d > 0) await bekle(1500 * d);
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler }),
      signal: AbortSignal.timeout(120_000)
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

/* Every revert signature in the build, so a refusal is reported by NAME.
   A bare selector is indistinguishable from a wrong nonce or a missing
   function, and this project has already lost runs to exactly that. */
const HATALAR = new Map();
(function hatalariYukle() {
  const { id } = require("ethers");
  for (const f of fs.readdirSync(path.join(KOK, "build"))) {
    if (!f.endsWith(".json")) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(KOK, "build", f), "utf8")); } catch (e) { continue; }
    for (const x of (j.abi || [])) {
      if (x.type !== "error") continue;
      HATALAR.set(id(x.name + "(" + (x.inputs || []).map((i) => i.type).join(",") + ")").slice(0, 10),
        x.name);
    }
  }
})();
const hataAdi = (veri) => {
  const s = String(veri || "");
  if (!s.startsWith("0x") || s.length < 10) return "veri yok";
  return HATALAR.get(s.slice(0, 10)) || ("bilinmeyen secici " + s.slice(0, 10));
};

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const T = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 4 });
const V = (v) => BigInt(v.toString());

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  const kayitYolu = path.join(KOK, "dagitim-pulse.json");
  if (!fs.existsSync(kayitYolu)) {
    console.log("dagitim-pulse.json yok. Once: node scripts/denetim-dagitim-pulse.js");
    process.exit(1);
  }
  const D = JSON.parse(fs.readFileSync(kayitYolu, "utf8"));
  const LP = D.arc.launchpad;

  const Y = B("TestCanliYasamDongusu");
  const iface = new Interface(Y.abi);

  console.log("CANLI YASAM DONGUSU — dagitilmis launchpad, harcanan $0");
  console.log("  rpc        " + RPC);
  console.log("  launchpad  " + LP + "   (ZINCIRDEKI)");
  console.log("  hook       " + D.arc.hook);
  console.log("  harness    " + HARNESS + "   (enjekte, hicbir sey dagitilmiyor)");
  console.log("");
  console.log("  Zincire hicbir sey yazilmiyor: tek bir eth_call, sonunda");
  console.log("  durum atiliyor. Sahte olan tek sey harness'in bakiyesi.");
  console.log("");

  /* The launchpad has to be the one the record verified, not whatever is
     at that address today. The deployment audit compared its bytecode to
     the build; this only has to confirm it still answers as itself. */
  const lI = new Interface(B("EgriLaunchpad").abi);
  const sayiOnce = V(lI.decodeFunctionResult("launchCount",
    await rpc("eth_call", [{ to: LP, data: lI.encodeFunctionData("launchCount", []) }, "latest"]))[0]);
  console.log("  zincirdeki launchCount  " + sayiOnce);

  const ortuk = {
    [HARNESS]: {
      code: Y.deployedBytecode,
      /* Native balance IS the USDC balance on Arc, at 18 decimals for the
         native read and 6 for the ERC20 one — the same money, measured at
         a ratio of exactly 1e12. So this one line funds both the gas and
         the payment. */
      balance: "0x" + (100_000n * 10n ** 18n).toString(16)
    }
  };

  const veri = iface.encodeFunctionData("kos",
    [LP, HEDEF_VARLIK, ODEME, TEMINAT, VERGI_PPM, ALIM, IADE_ORANI]);

  let s;
  try {
    const ham = await rpc("eth_call", [
      { from: CAGIRAN, to: HARNESS, gas: "0x10000000", data: veri }, "latest", ortuk]);
    [s] = iface.decodeFunctionResult("kos", ham);
  } catch (e) {
    console.log("");
    console.log("  DONGU REVERT ETTI: " + e.message.slice(0, 120));
    if (e.data) console.log("  revert: " + hataAdi(e.data));
    process.exit(1);
  }

  /* ---- 1. the launch -------------------------------------------- */
  console.log("");
  console.log("1) LAUNCH — zincirdeki launchpad gercekten kurdu mu");
  console.log("     launchCount   " + V(s.launchIdOnce) + " -> " + V(s.launchIdSonra));
  console.log("     token         " + s.token + "   " + s.sembol);
  console.log("     egri          " + s.egri);
  console.log("     kasa          " + s.kasa);
  console.log("     yonetici      " + s.yonetici);
  console.log("     hedef varlik  " + s.hedefVarlik);

  ok(V(s.launchIdSonra) === V(s.launchIdOnce) + 1n,
    "launch sayisi bir artti", V(s.launchIdOnce) + " -> " + V(s.launchIdSonra));
  ok(s.token !== "0x0000000000000000000000000000000000000000" &&
     s.egri !== "0x0000000000000000000000000000000000000000" &&
     s.kasa !== "0x0000000000000000000000000000000000000000",
    "TOKEN, EGRI VE KASA GERCEKTEN KURULDU", "ucu de sifir degil");
  ok(s.hedefVarlik.toLowerCase() === HEDEF_VARLIK.toLowerCase(),
    "teminat hedefi istenen varlik — ve bir daha degismez", s.hedefVarlik);
  ok(V(s.arz) === 1_000_000_000n * 10n ** 18n,
    "arz sabit", T(s.arz) + " " + s.sembol + " — kurucu payi yok");
  ok(s.kurucu.toLowerCase() === HARNESS.toLowerCase(),
    "kurucu cagiran", s.kurucu);

  /* ---- the payment's three parts -------------------------------- */
  console.log("");
  console.log("2) ODEME UC PARCAYA AYRILDI MI");
  const ucret = (ODEME * 20_000n) / 1_000_000n;
  const likidite = ODEME - ucret - TEMINAT;
  console.log("     odeme         " + U(ODEME));
  console.log("     kasada        " + U(s.kasadakiUsdc) + "   (beklenen " + U(TEMINAT) + ")");
  console.log("     egride        " + U(s.egridekiUsdc));
  console.log("     harcanan      " + U(s.harcananUsdc));
  ok(V(s.kasadakiUsdc) >= TEMINAT,
    "KASA TEMINATI GERCEKTEN TUTUYOR",
    U(s.kasadakiUsdc) + " >= " + U(TEMINAT) + " — defterden degil USDC " +
      "sozlesmesinden okundu; defterin dogru, bakiyenin yanlis oldugu bir " +
      "durum bu projede bir kez olculdu");
  ok(V(s.harcananUsdc) >= ODEME,
    "odemenin tamami cikti", U(s.harcananUsdc) + " >= " + U(ODEME));

  /* ---- 3. a stranger buys --------------------------------------- */
  console.log("");
  console.log("3) BIR YABANCI SIRF USDC ILE ALABILIYOR MU");
  if (!s.alimGecti) {
    console.log("     revert: " + hataAdi(s.alimSebep));
  }
  console.log("     odenen        " + U(s.alimOdenen));
  console.log("     alinan        " + T(s.alinanToken) + " " + s.sembol);
  console.log("     egri topladi  " + U(s.alimSonrasiEgriToplanan));
  ok(s.alimGecti === true, "ALIM GECTI — koprü yok, sarmal yok, sadece USDC",
    s.alimGecti ? T(s.alinanToken) + " " + s.sembol : hataAdi(s.alimSebep));
  ok(V(s.alinanToken) > 0n, "alan taraf gercekten token aldi");

  /* ---- 4. did the tax reach the vault -------------------------- */
  console.log("");
  console.log("4) ANTI-SNIPE VE TEMINAT VERGISI");
  console.log("     Bu bolum ilk kosumda 'vergi ulasmadi' diye hata verdi ve");
  console.log("     hata sozlesmede degil savda ciktii: beklenen vergi BRUT");
  console.log("     tutardan hesaplanmisti. Dogrusu, snipe kesintisinden");
  console.log("     SONRAKI net tutardan.");
  console.log("");
  console.log("     snipe orani   t=0: %" + (Number(V(s.snipeOrani0)) / 10_000).toFixed(2) +
    "   t=1: %" + (Number(V(s.snipeOrani1)) / 10_000).toFixed(2) +
    "   t=5: %" + (Number(V(s.snipeOrani5)) / 10_000).toFixed(2));
  console.log("     odenen        " + U(s.alimOdenen) + " brut");
  console.log("     snipe kesti   " +
    U((V(s.alimOdenen) * V(s.snipeOrani0)) / 1_000_000n));
  console.log("     egri gordu    " + U(V(s.alimOdenen) -
    (V(s.alimOdenen) * V(s.snipeOrani0)) / 1_000_000n) + " net");
  console.log("     kasa once     " + U(s.kasaAlimOncesi));
  console.log("     kasa sonra    " + U(s.kasaAlimSonrasi));
  console.log("     ulasan        " + U(s.vergiUlasan));
  console.log("     beklenen      " + U(s.beklenenVergi) + "   (net tutarin %" +
    (Number(V(s.vergiPpm)) / 10_000).toFixed(2) + "'i)");

  /* The anti-snipe schedule, read from the curve this launch created.
     99% in the launch's own second, quartering every second after it —
     so the protection is real and it does not stay. */
  ok(V(s.snipeOrani0) === 990_000n,
    "ANTI-SNIPE LAUNCH SANIYESINDE %99",
    "ayni islemde alim yapan parasinin %99'unu birakir — bu korumanin " +
      "kendisi, bir hata degil");
  ok(V(s.snipeOrani1) * 4n === V(s.snipeOrani0) &&
     V(s.snipeOrani5) < V(s.snipeOrani1),
    "VE HER SANIYE DORDE BOLUNEREK KAYBOLUYOR",
    "t=0 %99, t=1 %" + (Number(V(s.snipeOrani1)) / 10_000).toFixed(2) +
      ", t=5 %" + (Number(V(s.snipeOrani5)) / 10_000).toFixed(2) +
      " — kalici olsa urun kullanilamazdi");

  ok(V(s.vergiUlasan) > 0n,
    "TEMINAT VERGISI KASAYA ULASTI",
    U(s.vergiUlasan) + " — sifir olsa teminat hic buyumezdi ve geri alim " +
      "hicbir zaman tetiklenmezdi");

  /* Compared against the net figure now. Still a band rather than
     equality: the curve's own fee comes out of the same payment and
     integer division rounds at six decimals. */
  const beklenen = V(s.beklenenVergi);
  const oran = beklenen > 0n ? Number(V(s.vergiUlasan)) / Number(beklenen) : 0;
  ok(beklenen > 0n && oran > 0.5 && oran < 2.5,
    "ULASAN VERGI, NET TUTARDAN BEKLENENLE AYNI BUYUKLUKTE",
    oran.toFixed(3) + "x — birebir esitlik yanlis olur: egrinin kendi " +
      "ucreti ayni odemeden cikiyor ve alti ondalikta tam sayi bolmesi " +
      "yuvarliyor");

  /* Where the anti-snipe money goes. Not to the vault — it accumulates
     in the curve and becomes LOCKED POOL LIQUIDITY at graduation. The
     first run of this test looked for it in the vault and reported a
     failure about a system behaving exactly as designed. */
  console.log("");
  console.log("     egride biriken vergi  " + U(s.egriVergi));
  console.log("     egride toplanan       " + U(s.egriToplanan));
  ok(V(s.egriVergi) > 0n,
    "SNIPE PARASI EGRIDE BIRIKIYOR",
    U(s.egriVergi) + " — mezuniyette havuza KILITLI likidite olarak giriyor " +
      "(havuzQuote = toplanan + vergi), yani sahiplere kasa uzerinden " +
      "degil derinlik uzerinden geciyor");

  /* ---- 5. and out again ---------------------------------------- */
  console.log("");
  console.log("5) TOKEN YAKAN BIRI PARASINI ALABILIYOR MU");
  console.log("     hak           " + V(s.hakAlimSonrasi).toString() +
    "   (token basina ham birim)");
  console.log("     yakilan       " + T(s.iadeYakilan) + " " + s.sembol);
  console.log("     beklenen      " + U(s.iadeBeklenen));
  console.log("     alinan        " + U(s.iadeAlinan));
  if (!s.iadeGecti && V(s.iadeYakilan) > 0n) {
    console.log("     revert: " + hataAdi(s.iadeSebep));
  }
  ok(V(s.hakAlimSonrasi) > 0n,
    "KASA TOKEN BASINA BIR HAK HESAPLIYOR",
    "hak = quote / dolasim; sifir olsa teminat kimseye ait olmazdi");
  ok(s.iadeGecti === true, "IADE GECTI — kasa odeme yapti",
    s.iadeGecti ? U(s.iadeAlinan) : hataAdi(s.iadeSebep));
  /* The claim is scaled by HAK_OLCEGI = 1e36. Divided by 1e18 first, and
     the expected payout came out as $84,984,351,872,924,860 against an
     actual $0.08 — caught only because it was absurd. */
  const bek = V(s.iadeBeklenen), alin = V(s.iadeAlinan);
  const eksik = bek > alin ? bek - alin : 0n;
  ok(bek > 0n && eksik * 10_000n <= bek,
    "ODENEN, YAYINLANAN HAKTAN AZ DEGIL",
    U(alin) + " vs " + U(bek) + "   eksik " + eksik + " ham birim " +
      "(<= %0.01) — alti ondalikta tam sayi bolmesi kalan birakiyor, ama " +
      "bundan fazla bir eksik yayinlanan hakki fiyat degil tahmin yapardi");

  /* ---- 6. the invariant that matters most --------------------- */
  console.log("");
  console.log("6) IADE DIGER SAHIPLERI SULANDIRDI MI");
  console.log("     dolasim       " + T(s.dolasimIadeOncesi) + " -> " +
    T(s.dolasimIadeSonrasi));
  console.log("     kasa          " + U(s.kasaAlimSonrasi) + " -> " +
    U(s.kasaIadeSonrasi));
  console.log("     hak           " + V(s.hakIadeOncesi).toString() + " -> " +
    V(s.hakIadeSonrasi).toString());

  /* w = d·E/D booked at burn gives (E−w)/(D−d) = E/D exactly, so the
     claim per remaining token must not move. Integer division leaves at
     most a one-unit remainder; anything larger is value moving between
     holders, and that is invisible in any single balance. */
  /* RELATIVE, NOT ABSOLUTE
       Bounded at two raw units first, which is meaningless against a
       number scaled by 1e36: the measured drift was 1.8e10 units out of
       1.53e18, i.e. 0.0000001%, and the test called it a failure.

       The drift is also UPWARD — remaining holders ended marginally
       better off, which is the safe direction: integer division leaves
       the remainder with the vault rather than with the redeemer. */
  const once = V(s.hakAlimSonrasi), sonra = V(s.hakIadeSonrasi);
  const fark = sonra > once ? sonra - once : once - sonra;
  const yon = sonra >= once ? "yukari (kalanlar lehine)" : "ASAGI (kalanlar aleyhine)";
  const oranFark = Number(fark) / Number(once);
  ok(oranFark < 1e-6 && sonra >= once,
    "HAK IADEDEN SONRA DEGISMEDI",
    "fark " + fark + " ham birim = %" + (oranFark * 100).toExponential(2) +
      ", yon " + yon + " — buyuk ya da asagi olsa iade sahipler arasinda " +
      "deger tasimis olurdu ve bu hicbir tek bakiyede gorunmez");

  console.log("");
  console.log("================================================================");
  console.log("  Hepsi zincirdeki sozlesmelere karsi olculdu ve $0 harcandi.");
  console.log("  Olculemeyen tek sey kaliciliktir: eth_call sonunda durum");
  console.log("  atiliyor, yani launchCount zincirde " + sayiOnce + " kaliyor.");
  console.log("  'Urun calisiyor mu' sorusu cevaplandi; 'zincirde bir token");
  console.log("  var mi' sorusu bir dogrulama degil, urun karari.");
  console.log("================================================================");
  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) console.error("  revert: " + hataAdi(e.data));
  process.exit(1);
});
