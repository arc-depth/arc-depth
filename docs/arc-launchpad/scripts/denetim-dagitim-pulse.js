"use strict";
/* ===========================================================================
 * denetim-dagitim-pulse.js — is the stack deployed today really wired up
 *
 *   node scripts/denetim-dagitim-pulse.js
 *
 * WHY A SEPARATE AUDIT
 *   `denetim-dagitim.js` audits the stack deployed on 8 October:
 *   ArcLaunchHook, Launchpad, TeminatKarnesi. This script audits the
 *   EgriLaunchpad stack — nine Arc contracts plus four on two remote
 *   chains. They are separate deployments at separate addresses; auditing
 *   one in place of the other audits nothing.
 *
 * THE COMPARISON CODE IS SHARED, NOT COPIED
 *   `karsilastir` and `degismezPencereler` come from degismezlik.js. Every
 *   hardening comment inside those functions records a WRONG GREEN that
 *   happened once: an empty buffer compared against an empty buffer and
 *   called "identical code", a fractional immutable window excusing a real
 *   differing byte, the metadata mask looking only at the side it trusted.
 *   A second copy would be a second place for all three to come back.
 *
 * WHAT IS ASKED
 *   A contract that landed at the right address may be looking at the
 *   WRONG one. That is exactly what happened in this project: the hook once
 *   went live with the launchpad's address where `quote` belonged, and the
 *   deployment looked successful while it happened. So there is no
 *   comparison against a prediction here — every link is asked of the
 *   contract ITSELF on chain and closed as a ring.
 *
 * THE DEPLOYMENT RECORD IS WRITTEN HERE TOO
 *   The deployment script died to a rate limit before it could write the
 *   record. The record is built from the chain if this audit passes —
 *   building it from an unverified file would be recording the case where
 *   that file is wrong.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { id, Interface } = require("ethers");
const { karsilastir, degismezPencereler, denetle } = require("./degismezlik.js");

const KOK = path.join(__dirname, "..");
const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PLAN = path.join(KOK, "dagitim-pulse-plan.json");
const UZAK_PLAN = path.join(KOK, "dagitim-uzak-plan.json");
const KAYIT = path.join(KOK, "dagitim-pulse.json");

const USDC_ARC = "0x3600000000000000000000000000000000000000";
const SIFIR = "0x0000000000000000000000000000000000000000";

const B = (ad) => JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/* Arc's public endpoint rate-limits hard, and a throttled read is not a
   failed assertion — it is no assertion at all. Every call retries; what
   still cannot be read is reported as UNREAD, which counts as a failure.
   An audit that gets shorter when the network is slow is not an audit. */
let no = 1;
function uc(rpc) {
  return async function (yontem, parametreler) {
    for (let d = 0; d < 8; d++) {
      if (d > 0) await bekle(1200 * d);
      const r = await fetch(rpc, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler }),
        signal: AbortSignal.timeout(30_000)
      }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
      if (r.result !== undefined) return r.result;
      const m = (r.error && r.error.message) || "";
      if (!/rate limit|too many|timeout|503|502|ECONNRESET|fetch failed/i.test(m)) {
        throw new Error(m || "bilinmeyen RPC hatasi");
      }
    }
    return undefined;
  };
}

const sel = (imza) => id(imza).slice(0, 10);
const adresCoz = (h) => (h && h.length >= 66 ? "0x" + h.slice(26, 66) : null);
const sayiCoz = (h) => (h && h !== "0x" ? BigInt(h) : null);
const esit = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

let gecti = 0, kaldi = 0;
const ok = (kosul, ad, not) => {
  if (kosul) { gecti++; console.log("  OK    " + ad + (not ? "   " + not : "")); }
  else { kaldi++; console.log("  KALDI " + ad + (not ? "   " + not : "")); }
};

/* Function-name shapes that would mean somebody can still reach in. Taken
   from the older audit, because the question does not change with the
   stack: a system described as immutable has to have no door, and the ABI
   is where a door shows up by name. */
const KAPI = /^(owner|admin|transferOwnership|renounceOwnership|pause|unpause|upgradeTo|upgradeToAndCall|setImplementation|withdraw|sweep|rescue|emergency|kill|selfdestruct|setOwner|changeAdmin|mint|burnFrom)$/i;

async function kodDenetle(cag, ad, adres, blok) {
  const y = B(ad);
  let zincirdeki;
  try {
    zincirdeki = await cag("eth_getCode", [adres, blok]);
  } catch (e) {
    ok(false, ad + ": kod OKUNAMADI", e.message.slice(0, 60));
    return false;
  }
  if (zincirdeki === undefined) {
    ok(false, ad + ": kod OKUNAMADI (uc nokta cevap vermedi)",
      "okunamamak temiz demek degil");
    return false;
  }

  let s;
  try {
    s = karsilastir(y.deployedBytecode, zincirdeki, degismezPencereler(y));
  } catch (e) {
    ok(false, ad + ": karsilastirma yapilamadi", e.message.slice(0, 80));
    return false;
  }

  if (s.uzunlukFarki) {
    ok(false, ad + ": CALISAN KOD UZUNLUGU DERLENENLE AYNI DEGIL",
      "derlenen " + s.uzunlukFarki[0] + " bayt, zincirde " + s.uzunlukFarki[1]);
    return false;
  }

  const degismezBayt = s.hesapli.length;
  ok(s.hesapsiz.length === 0,
    ad + ": CALISAN KOD = DERLENEN KOD",
    s.uzunluk.toLocaleString("en") + " bayt, " + degismezBayt +
      " bayt degismez degeri (" + s.pencereSayisi + " pencere)" +
      (s.hesapsiz.length ? ", HESAPSIZ FARK " + s.hesapsiz.length + " bayt @ " +
        s.hesapsiz.slice(0, 6).join(",") : ", hesapsiz fark yok"));

  if (s.metaFark.length > 0) {
    console.log("          not: " + s.metaFark.length +
      " bayt metadata farki — CALISAN KOD AYNI, kaynak revizyonu farkli");
  }

  /* An immutable contract has to be immutable on chain too: no opcode
     that can replace the code behind it. */
  try {
    const d = denetle(zincirdeki);
    const kotu = Object.entries(d.sayim || {}).filter(([, n]) => n > 0);
    ok(kotu.length === 0,
      ad + ": ZINCIRDE DE DEGISTIRILEMEZ",
      (d.komut || 0).toLocaleString("en") + " komut tarandi" +
        (kotu.length ? ", BULUNAN: " + kotu.map(([k, n]) => k + "x" + n).join(" ")
                     : ", yukseltme komutu yok"));
  } catch (e) {
    ok(false, ad + ": opcode taramasi yapilamadi", e.message.slice(0, 60));
  }

  /* And no door by name. */
  const kapilar = (y.abi || [])
    .filter((f) => f.type === "function" && KAPI.test(f.name || ""))
    .map((f) => f.name);
  ok(kapilar.length === 0,
    ad + ": ABI'sinde sahip/duraklatma/yukseltme/cekme YOK",
    kapilar.length ? "BULUNAN: " + kapilar.join(", ")
      : (y.abi || []).filter((f) => f.type === "function").length + " fonksiyon tarandi");

  return s.hesapsiz.length === 0;
}

(async () => {
  console.log("PULSE DAGITIM DENETIMI — EgriLaunchpad yigini");
  console.log("");

  for (const f of [PLAN, UZAK_PLAN]) {
    if (!fs.existsSync(f)) {
      console.log(path.basename(f) + " yok. Dagitim calistirilmadi mi?");
      process.exit(1);
    }
  }
  const plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
  const uzak = JSON.parse(fs.readFileSync(UZAK_PLAN, "utf8"));
  const A = plan.tahminler;
  const HOOK = typeof plan.hook === "string" ? plan.hook : (plan.hook && plan.hook.adres);

  const arc = uc(ARC_RPC);
  const zincirId = Number(BigInt(await arc("eth_chainId", [])));
  ok(zincirId === 5042, "zincir 5042 (Arc)", "okunan " + zincirId);

  /* Every read is pinned to one block, and the block's hash is read again
     at the end. Reads either side of a change describe two different
     chain states and must not be reported as one. */
  const blok = await arc("eth_blockNumber", []);
  const blokBasi = (await arc("eth_getBlockByNumber", [blok, false]) || {}).hash;
  console.log("  blok " + parseInt(blok, 16) + " (okumalar buraya sabitlendi)");
  console.log("  hash " + String(blokBasi).slice(0, 18) + "...");
  console.log("");

  /* ---- 1. deployed code vs compiled code ------------------------- */
  console.log("1) CALISAN KOD DERLENEN KOD MU");
  const hedefler = [
    ["EgriFabrika", A.egriFabrika], ["AciciFabrika", A.aciciFabrika],
    ["YoneticiFabrika", A.yoneticiFabrika], ["KasaFabrika", A.kasaFabrika],
    ["CrossChainAssetRegistry", A.kayit], ["GelistiriciFonu", A.gelistiriciFonu],
    ["LikiditeKasasi", A.likiditeKasasi], ["EgriLaunchpad", A.launchpad],
    ["EgriHook", HOOK]
  ];
  for (const [ad, adres] of hedefler) {
    if (!adres) { ok(false, ad + ": adres planda yok"); continue; }
    await bekle(150);
    await kodDenetle(arc, ad, adres, blok);
  }

  /* ---- 2. the rings, closed from both ends ----------------------- */
  console.log("");
  console.log("2) HALKALAR — her biri IKI UCTAN kapanmali");
  const okuArc = async (hedef, imza) => {
    try { return await arc("eth_call", [{ to: hedef, data: sel(imza) }, blok]); }
    catch (e) { return undefined; }
  };

  const lpHook = adresCoz(await okuArc(A.launchpad, "hook()"));
  await bekle(150);
  const hookLp = adresCoz(await okuArc(HOOK, "launchpad()"));
  console.log("     launchpad -> hook       " + (lpHook || "OKUNAMADI"));
  console.log("     hook      -> launchpad  " + (hookLp || "OKUNAMADI"));
  ok(esit(lpHook, HOOK) && esit(hookLp, A.launchpad),
    "HOOK <-> LAUNCHPAD HALKASI KAPALI",
    "bu proje bir kez kancayi `quote` adresiyle canliya cikardi ve " +
      "dagitim o sirada basarili gorundu");

  await bekle(150);
  const kasaLp = adresCoz(await okuArc(A.likiditeKasasi, "launchpad()"));
  ok(esit(kasaLp, A.launchpad), "LIKIDITE KASASI LAUNCHPAD'I GOSTERIYOR",
    kasaLp || "OKUNAMADI");

  /* ---- 3. what each contract was wired with ---------------------- */
  console.log("");
  console.log("3) DEGISMEZLER — getter'larindan okunuyor");
  const baglar = [
    [A.launchpad, "fabrika()", A.egriFabrika, "launchpad -> egri fabrikasi"],
    [A.launchpad, "aciciFabrika()", A.aciciFabrika, "launchpad -> acici fabrikasi"],
    [A.launchpad, "kasaFabrika()", A.kasaFabrika, "launchpad -> kasa fabrikasi"],
    [A.launchpad, "kayit()", A.kayit, "launchpad -> zincirler arasi kayit"],
    [A.launchpad, "gelistiriciFonu()", A.gelistiriciFonu, "launchpad -> gelistirici fonu"],
    [A.launchpad, "likiditeKasasi()", A.likiditeKasasi, "launchpad -> likidite kasasi"],
    [A.launchpad, "quote()", USDC_ARC, "launchpad -> quote (Arc'ta gaz tokeni USDC)"],
    [A.launchpad, "poolManager()", plan.poolManager, "launchpad -> PoolManager"],
    [HOOK, "quote()", USDC_ARC, "hook -> quote"],
    [HOOK, "poolManager()", plan.poolManager, "hook -> PoolManager"],
    [HOOK, "likiditeKasasi()", A.likiditeKasasi, "hook -> likidite kasasi"],
    [HOOK, "gelistiriciFonu()", A.gelistiriciFonu, "hook -> gelistirici fonu"],
    [A.likiditeKasasi, "quote()", USDC_ARC, "likidite kasasi -> quote"],
    [A.gelistiriciFonu, "quote()", USDC_ARC, "gelistirici fonu -> quote"],
    [A.kasaFabrika, "yoneticiFabrika()", A.yoneticiFabrika, "kasa fabrikasi -> yonetici fabrikasi"]
  ];
  for (const [hedef, imza, beklenen, ad] of baglar) {
    if (!hedef || !beklenen) { ok(false, ad + ": adres planda yok"); continue; }
    await bekle(150);
    const v = adresCoz(await okuArc(hedef, imza));
    ok(esit(v, beklenen), ad, v ? (esit(v, beklenen) ? v : v + "  BEKLENEN " + beklenen) : "OKUNAMADI");
  }

  /* The hook's address IS its permission set in Uniswap v4: the low bits
     say which callbacks it is allowed to receive, and an address with the
     wrong bits is a hook the pool will never call. */
  await bekle(150);
  const alt = (BigInt(HOOK) & 0x3fffn).toString(16);
  ok(alt === "a44", "HOOK ADRESI CALLBACK'LERINI BILDIRIYOR",
    "0x" + alt + " — beforeAddLiquidity, beforeRemoveLiquidity, afterSwap, " +
      "afterSwapReturnDelta");

  /* ---- 4. the registry's chain set, fixed at construction -------- */
  console.log("");
  console.log("4) KAYIT — zincir kumesi kurucuda sabitlendi, bir daha degismez");
  await bekle(150);
  const zSayi = sayiCoz(await okuArc(A.kayit, "zincirSayisi()"));
  await bekle(150);
  const arcDom = sayiCoz(await okuArc(A.kayit, "ARC_DOMAIN()"));
  ok(arcDom === 26n, "Arc CCTP domaini 26",
    (arcDom === null ? "OKUNAMADI" : String(arcDom)) +
      " — MessageTransmitterV2.localDomain() olculdu");

  const uzakAdlar = Object.keys(uzak.zincirler);
  ok(zSayi === BigInt(uzakAdlar.length),
    "kayitta uzak zincir sayisi kadar zincir var",
    (zSayi === null ? "OKUNAMADI" : String(zSayi)) + " / " + uzakAdlar.length);

  /* zincirAt(i) IS DECODED, NOT READ BY OFFSET
     It was read by word offset first and the offsets were wrong by one
     word, because the struct carries a `string ad` — which makes the
     whole return DYNAMIC, so word 0 is the ABI offset (0x20) and the
     struct starts at word 1.

     The failure was legible only because the numbers were absurd: it
     reported "domain 32" (the offset itself) and factory
     0x...0001 / 0x...2105, which are Ethereum's and Base's CHAIN IDS
     sitting one field over. Had the shift landed two fields apart on
     two same-typed fields, the audit would have compared the wrong
     pair and passed.

     So the contract's own ABI decodes it. Hand-written offsets are only
     safe for a fixed-layout return, and "fixed layout" is not a property
     this struct has. */
  const kayitI = new Interface(B("CrossChainAssetRegistry").abi);
  let i = 0;
  for (const ad of uzakAdlar) {
    const z = uzak.zincirler[ad];
    await bekle(150);
    let cozulen = null;
    try {
      const ham = await arc("eth_call", [{
        to: A.kayit, data: kayitI.encodeFunctionData("zincirAt", [i])
      }, blok]);
      cozulen = kayitI.decodeFunctionResult("zincirAt", ham)[0];
    } catch (e) { cozulen = null; }
    i++;
    if (!cozulen) { ok(false, ad + ": kayittan OKUNAMADI"); continue; }

    const domain = BigInt(cozulen.cctpDomain);
    const fabrika = cozulen.uzakFabrika;
    const initHash = cozulen.initKodHash;
    const uzakQuote = cozulen.uzakQuote;
    const gercekFab = z.dagitildi || z.fabrika;

    console.log("     " + ad.padEnd(10) + "domain " + String(domain).padStart(2) +
      "   zincir " + cozulen.zincirId + "   fabrika " + fabrika);
    ok(domain === BigInt(z.cctpDomain), ad + ": CCTP domaini dogru",
      domain + " / " + z.cctpDomain);
    ok(BigInt(cozulen.zincirId) === BigInt(z.zincirId), ad + ": EVM zincir kimligi dogru",
      cozulen.zincirId + " / " + z.zincirId);
    ok(esit(fabrika, gercekFab), ad + ": KAYIT GERCEK FABRIKAYI GOSTERIYOR",
      esit(fabrika, gercekFab) ? fabrika : "BEKLENEN " + gercekFab);
    ok(esit(initHash, uzak.initKodHash), ad + ": init kod hash dogru",
      String(initHash).slice(0, 18) + "...");
    ok(esit(uzakQuote, z.usdc), ad + ": o zincirin USDC adresi dogru",
      uzakQuote);
  }

  /* ---- 5. the derivation nothing can override -------------------- */
  console.log("");
  console.log("5) UZAK KASA ADRESI — turetiliyor, saklanmiyor");
  const uzakKasaSel = sel("uzakKasa(uint32,uint256)");
  for (const ad of uzakAdlar) {
    const z = uzak.zincirler[ad];
    await bekle(150);
    let ham;
    try {
      ham = await arc("eth_call", [{
        to: A.kayit,
        data: uzakKasaSel + z.cctpDomain.toString(16).padStart(64, "0") +
          (1).toString(16).padStart(64, "0")
      }, blok]);
    } catch (e) { ham = null; }
    const turetilen = adresCoz(ham);
    console.log("     " + ad.padEnd(10) + "token 1 -> " + (turetilen || "OKUNAMADI"));
    ok(!!turetilen && !esit(turetilen, SIFIR),
      ad + ": kayit token 1 icin bir kasa adresi turetiyor",
      "saklanan bir adres degil: CREATE2(fabrika, keccak(tokenId), initHash)");
  }

  /* ---- 6. the remote side, on its own chains --------------------- */
  console.log("");
  console.log("6) UZAK ZINCIRLER — kendi zincirlerinde");
  const UZAK_RPC = {
    ethereum: "https://ethereum-rpc.publicnode.com",
    base: "https://mainnet.base.org"
  };
  for (const ad of uzakAdlar) {
    const z = uzak.zincirler[ad];
    const rpc = UZAK_RPC[ad];
    if (!rpc) { ok(false, ad + ": uc nokta bilinmiyor"); continue; }
    const cag = uc(rpc);
    const fab = z.dagitildi || z.fabrika;
    const hf = z.havuzDagitildi || z.havuzFiyat;

    console.log("     --- " + ad + " ---");
    const uzakBlok = await cag("eth_blockNumber", []);
    await kodDenetle(cag, "RemoteVaultFactory", fab, uzakBlok);
    await bekle(150);
    await kodDenetle(cag, "HavuzFiyat", hf, uzakBlok);

    const okuUzak = async (hedef, imza) => {
      try { return await cag("eth_call", [{ to: hedef, data: sel(imza) }, uzakBlok]); }
      catch (e) { return undefined; }
    };

    await bekle(150);
    const fabHf = adresCoz(await okuUzak(fab, "havuzFiyat()"));
    ok(esit(fabHf, hf), ad + ": fabrika havuz kaynagini gosteriyor",
      fabHf || "OKUNAMADI");

    await bekle(150);
    const fabUsdc = adresCoz(await okuUzak(fab, "usdc()"));
    ok(esit(fabUsdc, z.usdc), ad + ": fabrika o zincirin USDC'sini biliyor",
      fabUsdc || "OKUNAMADI");

    await bekle(150);
    const fabDom = sayiCoz(await okuUzak(fab, "arcDomain()"));
    ok(fabDom === 26n, ad + ": fabrika Arc domainini 26 biliyor",
      fabDom === null ? "OKUNAMADI" : String(fabDom));

    await bekle(150);
    const fabHash = await okuUzak(fab, "initKodHash()");
    ok(esit(fabHash, uzak.initKodHash),
      ad + ": FABRIKANIN YAYINLADIGI INIT HASH ARC'IN TUTTUGUYLA AYNI",
      "ayrismasi, ilk transferin hicbir yere inmesi demek");

    await bekle(150);
    const hfPencere = sayiCoz(await okuUzak(hf, "TWAP_PENCERE()"));
    ok(hfPencere === 1800n, ad + ": havuz kaynaginin TWAP penceresi 1800s",
      hfPencere === null ? "OKUNAMADI" : String(hfPencere) +
        " — 30 dakikalik ortalama, fiyati o sure boyunca piyasa disinda " +
        "tutmayi gerektirir");
  }

  /* ---- 7. the honest starting state ----------------------------- */
  console.log("");
  console.log("7) BASLANGIC DURUMU");
  await bekle(150);
  const say = sayiCoz(await okuArc(A.launchpad, "launchCount()"));
  await bekle(150);
  const kasaSay = sayiCoz(await okuArc(A.kasaFabrika, "sayi()"));
  ok(say === 0n && kasaSay === 0n,
    "henuz launch yok — sistem bos ve dogru sekilde bos",
    "launch " + say + ", kasa " + kasaSay + ". Ilk launch'in kendisi ayrica olculecek.");

  /* ---- the pinned block must not have moved -------------------- */
  const blokSonu = (await arc("eth_getBlockByNumber", [blok, false]) || {}).hash;
  ok(blokSonu === blokBasi, "sabitlenen blok denetim boyunca DEGISMEDI",
    String(blokSonu).slice(0, 18) + "...");

  /* ---- the record, written only if everything held ------------- */
  if (kaldi === 0) {
    fs.writeFileSync(KAYIT, JSON.stringify({
      olculdu: new Date().toISOString(),
      zincir: 5042,
      dagitici: plan.dagitici,
      nonce: plan.nonce,
      not: "Bu kayit ZINCIRDEN dogrulanarak yazildi. Dagitim betigi hiz " +
        "siniri yuzunden kaydi yazamadan cokmustu, ve dogrulanmamis bir " +
        "dosyadan kurmak o dosyanin yanlis olabilecegi durumu kaydetmek " +
        "olurdu.",
      uygulandiMi: true,
      arc: { ...A, hook: HOOK, poolManager: plan.poolManager, quote: USDC_ARC },
      uzak: Object.fromEntries(uzakAdlar.map((ad) => {
        const z = uzak.zincirler[ad];
        return [ad, {
          zincirId: z.zincirId, cctpDomain: z.cctpDomain,
          fabrika: z.dagitildi || z.fabrika,
          havuzFiyat: z.havuzDagitildi || z.havuzFiyat,
          usdc: z.usdc, v3Fabrika: z.v3Fabrika
        }];
      })),
      initKodHash: uzak.initKodHash
    }, null, 1));
    console.log("");
    console.log("  kayit yazildi: " + path.relative(KOK, KAYIT));
  }

  console.log("");
  console.log("  " + (no - 1) + " RPC istegi");
  console.log("  " + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
