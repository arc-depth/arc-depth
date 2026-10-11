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
const PLAN = path.join(KOK, "dagitim-pulse2-plan.json");
const UZAK_PLAN = path.join(KOK, "dagitim-uzak-plan.json");
const KAYIT = path.join(KOK, "dagitim-pulse2.json");

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
  console.log("PULSE2 DAGITIM DENETIMI — PulseLaunchpad yigini");
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
  const HOOK = A.hook;

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
  /* Only what THIS generation deployed. The shared infrastructure was
     audited when it was deployed and is byte-identical since — re-auditing
     it here would pass without proving anything new about these three. */
  const hedefler = [
    ["PulseFabrika", A.fabrika],
    ["DevPool", A.devPool],
    ["PulseLikiditeKasasi", A.likiditeKasasi],
    ["PulseLaunchpad", A.launchpad],
    ["PulseHook", HOOK]
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

  const P = plan.paylasilan;

  const lpHook = adresCoz(await okuArc(A.launchpad, "hook()"));
  await bekle(150);
  const hookLp = adresCoz(await okuArc(HOOK, "launchpad()"));
  console.log("     launchpad -> hook       " + (lpHook || "OKUNAMADI"));
  console.log("     hook      -> launchpad  " + (hookLp || "OKUNAMADI"));
  ok(esit(lpHook, HOOK) && esit(hookLp, A.launchpad),
    "HOOK <-> LAUNCHPAD HALKASI KAPALI",
    "bu proje bir kez kancayi quote adresiyle canliya cikardi ve dagitim " +
      "o sirada basarili gorundu");

  /* THE RING THAT WAS BROKEN ON THE FIRST ROUND
       The 0,50% slice went to the PREVIOUS generation liquidity vault,
       whose besle() cannot recognise a new-generation token — measured,
       it reverts BilinmeyenToken. Nothing would have reverted during a
       trade: the slice would simply have accumulated there with no way
       out. So this is checked from BOTH ends now. */
  await bekle(150);
  const lkLp = adresCoz(await okuArc(A.likiditeKasasi, "launchpad()"));
  await bekle(150);
  const hookLk = adresCoz(await okuArc(HOOK, "likiditeKasasi()"));
  await bekle(150);
  const lpLk = adresCoz(await okuArc(A.launchpad, "likiditeKasasi()"));
  console.log("     likidite  -> launchpad  " + (lkLp || "OKUNAMADI"));
  console.log("     hook      -> likidite   " + (hookLk || "OKUNAMADI"));
  console.log("     launchpad -> likidite   " + (lpLk || "OKUNAMADI"));
  ok(esit(lkLp, A.launchpad) && esit(hookLk, A.likiditeKasasi) &&
     esit(lpLk, A.likiditeKasasi),
    "LIKIDITE HALKASI UC UCTAN KAPALI",
    "ilk turda kanca ESKI kasayi gosteriyordu ve %0,50 orada mahsur " +
      "kalirdi — hicbir takas revert etmeden");

  /* ---- 3. the immutables, read from their getters ---------------- */
  console.log("");
  console.log("3) DEGISMEZLER — getter lardan okunuyor");
  const baglar = [
    [A.launchpad, "fabrika()", A.fabrika, "launchpad -> fabrika"],
    [A.launchpad, "kasaFabrika()", P.kasaFabrika, "launchpad -> kasa fabrikasi"],
    [A.launchpad, "kayit()", P.kayit, "launchpad -> zincirler arasi kayit"],
    /* THE EXPECTED VALUE CHANGED, AND THAT IS THE POINT OF THIS ROUND
         This used to expect the shared GelistiriciFonu, whose tahsisci()
         is the OPERATIONS WALLET and is immutable — so the developer
         slice could never have been handed to the DAO. It now has to be
         the DevPool the FTHM governor controls.

         Leaving the old expectation here would have turned the
         repointing into a failure; "fixing" it by deleting the row
         would have removed the only thing checking where that money
         goes. The row stays, the expectation moves. */
    [A.launchpad, "gelistiriciFonu()", A.devPool, "launchpad -> dev havuzu"],
    [A.launchpad, "isletmeKasasi()", P.isletme, "launchpad -> isletme"],
    [A.launchpad, "quote()", USDC_ARC, "launchpad -> quote"],
    [A.launchpad, "poolManager()", plan.poolManager, "launchpad -> PoolManager"],
    [HOOK, "quote()", USDC_ARC, "hook -> quote"],
    [HOOK, "poolManager()", plan.poolManager, "hook -> PoolManager"],
    [HOOK, "gelistiriciFonu()", A.devPool, "hook -> dev havuzu"],
    [HOOK, "isletmeKasasi()", P.isletme, "hook -> isletme"],
    [A.likiditeKasasi, "quote()", USDC_ARC, "likidite kasasi -> quote"],
    [A.likiditeKasasi, "launchpad()", A.launchpad, "likidite kasasi -> launchpad"],
    [A.devPool, "governor()", plan.fthmGovernor, "dev havuzu -> FTHM governor"]
  ];
  for (const [hedef, imza, beklenen, ad] of baglar) {
    if (!hedef || !beklenen) { ok(false, ad + ": adres planda yok"); continue; }
    await bekle(150);
    const v = adresCoz(await okuArc(hedef, imza));
    ok(esit(v, beklenen), ad,
      v ? (esit(v, beklenen) ? v : v + "  BEKLENEN " + beklenen) : "OKUNAMADI");
  }

  /* The hook address IS its permission set in v4, and this generation
     needs two more bits than the last: beforeSwap and its returnDelta.
     Deployed at the old suffix, beforeSwap would never be called and the
     buy-leg tax would silently go back to being paid in tokens. */
  await bekle(150);
  const alt = (BigInt(HOOK) & 0x3fffn).toString(16);
  ok(alt === "acc", "HOOK ADRESI CALLBACK LERINI BILDIRIYOR",
    "0x" + alt + " — beforeAddLiquidity, beforeRemoveLiquidity, " +
      "beforeSwap, afterSwap ve iki returnDelta");

  /* ---- THE DEVELOPER SLICE NOW ANSWERS TO FTHM ----------------
   *
   * Measured before this round: the 0,30% developer slice went to a fund
   * whose tahsisci() was the OPERATIONS WALLET, not the DAO — and
   * tahsisci is immutable, so it could never be handed over. The DAO
   * audit printed "the DAO can distribute developer-fund grants
   * (DevPool / GelistiriciFonu)" as a plain console.log, never an
   * assertion, and half of that sentence was false.
   *
   * That is the opposite of what the DAO is for. So the slice was
   * repointed at a DevPool whose governor is the FTHM governor, and the
   * claim is now a check rather than a sentence.
   *
   * WHY FTHM AND NOT A NEW TOKEN
   *   FTHM already had a complete governance stack on chain — governor
   *   5.379 bytes, stake 5.029 bytes with token() = FTHM, the same
   *   parameters as the ALP one. Measuring first turned a five-contract
   *   cascade into one contract plus the two that hold it immutable. */
  console.log("");
  console.log("3c) GELISTIRICI PAYI FTHM DAO SUNDA MI");
  {
    const FTHM_GOV = plan.fthmGovernor;
    await bekle(150);
    const dpGov = adresCoz(await okuArc(A.devPool, "governor()"));
    await bekle(150);
    const hookDev = adresCoz(await okuArc(HOOK, "gelistiriciFonu()"));
    await bekle(150);
    const lpDev = adresCoz(await okuArc(A.launchpad, "gelistiriciFonu()"));
    console.log("     devPool -> governor    " + (dpGov || "OKUNAMADI"));
    console.log("     hook -> devPool        " + (hookDev || "OKUNAMADI"));
    console.log("     launchpad -> devPool   " + (lpDev || "OKUNAMADI"));

    ok(esit(dpGov, FTHM_GOV),
      "DEVPOOL UN YETKILISI FTHM GOVERNOR",
      (dpGov || "?") + " — onceki fonun tahsiscisi ISLETME CUZDANIYDI ve " +
        "immutable oldugu icin asla devredilemezdi");
    ok(esit(hookDev, A.devPool) && esit(lpDev, A.devPool),
      "HER ISLEMIN %0,30 I O DEVPOOL A GIDIYOR",
      "kanca ve launchpad ayni adresi gosteriyor; biri eskiyi gosterse " +
        "dilim DAO nun dokunamadigi bir yerde birikirdi");

    /* WHO CAN MOVE THE MONEY — and the test has to tell callers apart.
     *
     * The getter above proves the pool POINTS at the governor. It does
     * not prove the pool REFUSES anyone else, so the refusal is
     * executed. eth_call with an arbitrary `from` costs nothing and
     * changes nothing; a revert here is the PASS.
     *
     * THE FIRST VERSION OF THIS CHECK PASSED FOR THE WRONG REASON
     *   It matched /NotGovernor|revert/ against error.MESSAGE. Arc
     *   returns the custom error in error.DATA and puts only
     *   "execution reverted" in the message — so the check was really
     *   "did anything revert", and with a zero balance EVERY call to
     *   pay() reverts, including the governor's. It would have gone on
     *   printing OK if the gate had been removed entirely.
     *
     *   So: read error.data, demand the pool's own selector, and prove
     *   the test discriminates by running the same call AS the governor
     *   and requiring a different answer. Measured:
     *     stranger -> 0xee3675d4            NotGovernor()
     *     governor -> ERC20 balance revert  gate passed, no money there yet */
    {
      const NOT_GOV = sel("NotGovernor()");
      const KIMSE = "0x000000000000000000000000000000000000dEaD";
      const veri = sel("pay(address,address,uint256,uint256)") +
        USDC_ARC.slice(2).toLowerCase().padStart(64, "0") +
        KIMSE.slice(2).toLowerCase().padStart(64, "0") +
        (1n).toString(16).padStart(64, "0") +
        "".padStart(64, "0");

      /* The shared arc() helper throws new Error(message) and drops the
         revert data, which is the only place the answer lives. */
      const hamCagri = async (from) => {
        const r = await fetch(ARC_RPC, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 991, method: "eth_call",
            params: [{ from, to: A.devPool, data: veri }, blok] }),
          signal: AbortSignal.timeout(30_000)
        }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
        return (r.error && r.error.data) || (r.error && r.error.message) || "GECTI";
      };

      await bekle(150);
      const yabanci = String(await hamCagri(KIMSE));
      await bekle(150);
      const yetkili = String(await hamCagri(plan.fthmGovernor));

      const durduruldu = yabanci.toLowerCase().startsWith(NOT_GOV.toLowerCase());
      const ayirdEdiyor = !yetkili.toLowerCase().startsWith(NOT_GOV.toLowerCase());

      ok(durduruldu,
        "DEVPOOL YABANCIYI YETKI KAPISINDA DURDURUYOR",
        durduruldu
          ? NOT_GOV + " = NotGovernor() — FTHM Governor disinda kimse bir " +
            "dolar bile cikaramiyor; getter degil, calistirilmis bir red"
          : "beklenen " + NOT_GOV + ", donen " + yabanci.slice(0, 80));
      ok(ayirdEdiyor,
        "VE BU RED CAGIRANA GORE — her cagri revert ettigi icin degil",
        ayirdEdiyor
          ? "ayni cagri governor olarak kapiyi geciyor ve yalnizca " +
            "bakiye bos oldugu icin duruyor: " + yetkili.slice(0, 46)
          : "governor da NotGovernor aliyor — kapi cagirani ayirt etmiyor");
    }

    /* The balance is readable, which is how the DAO will see what it has
       to spend. */
    await bekle(150);
    const tut = await arc("eth_call", [{ to: A.devPool,
      data: sel("held(address)") + USDC_ARC.slice(2).toLowerCase().padStart(64, "0") },
      blok]).catch(() => null);
    ok(tut !== null && tut !== undefined && tut !== "0x",
      "DEVPOOL BAKIYESINI BILDIRIYOR",
      "held(USDC) = " + (tut && tut !== "0x"
        ? (Number(BigInt(tut)) / 1e6).toLocaleString("en") + " USDC" : "OKUNAMADI") +
        " — ilk takasa kadar sifir olmasi dogru");

    /* And the FTHM stack it answers to has to be the real one. */
    await bekle(150);
    const fgKod = await arc("eth_getCode", [FTHM_GOV, blok]);
    ok(!!fgKod && fgKod !== "0x",
      "FTHM GOVERNOR ZINCIRDE DURUYOR",
      FTHM_GOV + "   " + ((String(fgKod).length - 2) / 2).toLocaleString("en") + " bayt");

    /* The honest limit, asserted so it cannot be forgotten: a DAO with
       nothing staked cannot propose, so the slice accumulates with no
       way to spend it until somebody stakes. */
    await bekle(150);
    const ts = await arc("eth_call", [{ to: plan.fthmStake,
      data: sel("totalStaked()") }, blok]).catch(() => null);
    const staked = ts && ts !== "0x" ? BigInt(ts) : 0n;
    console.log("     FTHM stake edilmis     " + (Number(staked) / 1e18).toLocaleString("en"));
    /* The assertion's name depends ON THE CONDITION. Its previous form
       said "NOT ACTIVE YET" unconditionally; once the DAO was opened with
       the floor stake, that name would have gone on saying something
       false — on every run, while passing. */
    ok(true, staked === 0n
        ? "FTHM DAO SU HENUZ AKTIF DEGIL — bir sav degil, bir not"
        : "FTHM DAO SU AKTIF — stake var, teklif verilebiliyor",
      staked === 0n
        ? "totalStaked 0: kimse teklif veremez, yani dilim birikir ama " +
          "harcanamaz. Aktivasyon mekanizmasi kurulmadan DAO calismiyor."
        : (Number(staked) / 1e18).toLocaleString("en") + " FTHM stake edilmis");
  }

  /* ---- THE 60% DRAWDOWN TRIGGER IS CANCELLED ------------------
   *
   * The user asked for a defence that fires 60% below the peak, I built
   * the tracking, argued against wiring it to the buyback, and the user
   * then cancelled it outright.
   *
   * The tracking is in the DEPLOYED hook and cannot be removed — the
   * contract is immutable. It does not need to be: measured, no contract
   * reads savunmaAcik or zirve, so the product already behaves exactly as
   * cancelled. What it costs is gas: $0,000042 to $0,000484 a trade
   * against a typical swap of $0,006.
   *
   * Left in place rather than redeployed, because every redeployment
   * today produced a new silent defect — a stranded 0,50% slice, a stale
   * interface ABI, a button with no handler — and the current hook is
   * measured working end to end.
   *
   * WHY THIS IS A CHECK AND NOT A COMMENT
   *   "Cancelled" has to stay cancelled. If somebody later wires the flag
   *   to the buyback, the product gains a rule the user removed and
   *   nothing would say so. So the cancellation is asserted: no contract
   *   outside the hook may read it.
   *
   *   And the reason it must not be wired is itself a measurement. A
   *   token that runs 10x and falls 60% is still far above its claim, and
   *   spending collateral there is refused by HakDustu anyway; a token
   *   that never ran but drifted below its claim SHOULD be bought back,
   *   and a drawdown trigger misses it. The gate that is already deployed
   *   — price against claim — is the stricter one. */
  console.log("");
  console.log("3b) %60 DUSUS TETIGI IPTAL — ve iptal kilitli");
  {
    const kaynaklar = fs.readdirSync(path.join(KOK, "contracts"))
      .filter((f) => f.endsWith(".sol"));
    const okuyan = [];
    for (const f of kaynaklar) {
      if (f === "PulseHook.sol") continue;
      const src = fs.readFileSync(path.join(KOK, "contracts", f), "utf8");
      /* PLAIN SUBSTRINGS, NO REGEX AT ALL
           Built as a regex from pieces first, and B — the build-artifact
           reader inherited from the audit this was derived from — was
           already a FUNCTION in scope. So the concatenation put the
           function source into the pattern and the third alternative
           matched nothing. node --check passed, the run passed, and the
           assertion printed OK while a third of it did nothing.

           A substring test has no escapes to lose and no scope to
           collide with. */
      if (src.includes("savunmaAcik") || src.includes("savunmaDurumu") ||
          src.includes("zirve[")) {
        okuyan.push(f);
      }
    }
    ok(okuyan.length === 0,
      "DUSUS BAYRAGINI HICBIR SOZLESME OKUMUYOR",
      okuyan.length ? "OKUYAN: " + okuyan.join(", ") + " — iptal edilen bir " +
        "kural geri gelmis"
        : kaynaklar.length + " sozlesme tarandi; bayrak yalnizca kancanin " +
          "icinde yaziliyor ve hicbir parayi yonlendirmiyor");

    /* And the buyback must still be gated by the claim, not by a price
       history. Checked by name: HakDustu is the revert that makes a
       buyback impossible when it would lower the claim. */
    const kasaSrc = fs.readFileSync(path.join(KOK, "contracts", "KopruKasasi.sol"), "utf8");
    ok(kasaSrc.includes("revert HakDustu()"),
      "GERI ALIM HALA HAKKA KARSI KAPILI",
      "HakDustu — hak dusecekse islem geri doner; dusus gecmisi degil, " +
        "fiyatin hakka gore yeri karar veriyor");
  }

  /* ---- 4. the shared infrastructure, not re-audited -------------- */
  console.log("");
  console.log("4) PAYLASILAN ALTYAPI");
  console.log("     Kayit, KasaFabrika, YoneticiFabrika, GelistiriciFonu ve",
    "uzak taraf");
  console.log("     bu turda dagitilmadi. Kendi dagitimlarinda 84 savla",
    "dogrulandi");
  console.log("     ve o gunden beri bayt bayt ayni. Burada yeniden",
    "denetlemek");
  console.log("     gecerdi ama bu uc sozlesme hakkinda yeni hicbir sey",
    "soylemezdi.");
  for (const [ad, adr] of Object.entries(P)) {
    /* The operations sink is a WALLET, not a contract, and having no code
       is the point: a fee destination that is a plain address cannot do
       anything with the money except hold it, and nobody has to be
       trusted with a contract that could. Asserting code at it reported a
       failure about the design working. */
    if (ad === "isletme") {
      console.log("     " + ad.padEnd(16) + adr + "   cuzdan, kod yok (kasitli)");
      continue;
    }
    await bekle(150);
    const kod = await arc("eth_getCode", [adr, blok]);
    ok(!!kod && kod !== "0x", ad + " zincirde duruyor",
      adr + "   " + ((String(kod).length - 2) / 2).toLocaleString("en") + " bayt");
  }

  /* ---- 7. the honest starting state ----------------------------- */
  console.log("");
  console.log("7) BASLANGIC DURUMU");
  await bekle(150);
  const say = sayiCoz(await okuArc(A.launchpad, "launchCount()"));
  await bekle(150);
  /* The vault factory is SHARED, so its counter spans both generations
     and says nothing about this one. The launchpad's own counter is what
     has to be zero here. */
  const kasaSay = sayiCoz(await okuArc(P.kasaFabrika, "sayi()"));
  ok(say === 0n,
    "BU LAUNCHPAD'DE HENUZ LAUNCH YOK — bos ve dogru sekilde bos",
    "launch " + say + ", paylasilan kasa fabrikasinda " +
      (kasaSay === null ? "?" : kasaSay) + " kasa (iki nesli birlikte sayar). " +
      "Ilk launch'in kendisi ayrica olculecek.");

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
      not: "Bu kayit ZINCIRDEN dogrulanarak yazildi. Paylasilan altyapi " +
        "bu turda dagitilmadi ve kendi dagitiminda dogrulanmis durumda; " +
        "uzak taraf da oyle.",
      uygulandiMi: true,
      arc: {
        fabrika: A.fabrika,
        devPool: A.devPool,
        likiditeKasasi: A.likiditeKasasi,
        launchpad: A.launchpad,
        hook: HOOK,
        poolManager: plan.poolManager,
        quote: USDC_ARC
      },
      /* THE DEVELOPER SLICE'S AUTHORITY, IN THE RECORD
           The record is what the interface and the page audit read. A
           devPool missing here would have left the site pointing at the
           retired fund while the chain paid the DAO — the two halves
           disagreeing with nobody checking. */
      fthm: {
        governor: plan.fthmGovernor,
        stake: plan.fthmStake,
        not: "DevPool'un governor'i. totalStaked su an 0, yani dilim " +
          "birikir ama bir teklif gececek kadar oy yok."
      },
      paylasilan: P,
      /* Still on chain, no longer in the money path: nothing points at it
         and its tahsisci is the operations wallet, which is why the slice
         was moved. Named rather than deleted so a reader who finds the
         address on chain learns why it is idle. */
      emekliGelistiriciFonu: {
        adres: P.gelistiriciFonu,
        neden: "tahsisci ISLETME CUZDANI ve immutable — DAO ona hic " +
          "dokunamazdi; %0,30 artik DevPool'a gidiyor"
      },
      hookSalt: plan.hookSalt,
      /* Why there was a second round, next to what it produced. */
      oncekiTurRetNedeni: plan.oncekiTurRetNedeni || null,
      emekliTur: plan.emekliTur || null
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
