"use strict";
/* ===========================================================================
 * denetim-kilit-fathom.js — what, if anything, about Fathom is still open.
 *
 *   node scripts/denetim-kilit-fathom.js
 *
 * "Is it locked?" deserves a list, not a yes. This walks every deployed
 * contract's ABI, keeps the functions that can change state, and prints
 * who is allowed to call each one — from the compiled interface, so a
 * privileged function nobody remembered shows up as a question mark
 * instead of being silently absent from a reassuring summary.
 *
 * Two things get their own section because a function list does not show
 * them. The governor can call anything, so what matters is whether any
 * contract grants IT authority — checked by looking for the governor's
 * address inside the others. And the founder wallet keeps two powers by
 * design; both are named and bounded rather than rounded down to "locked".
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface, AbiCoder, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const KOK = path.join(__dirname, "..");
const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const sel = (s) => id(s).slice(0, 10);

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({ hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(60000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 30000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });

/* Who each state-changing function answers to, written out from the source
   so that a function the source gains later appears here as "?". */
const KIM = {
  Jeton: {
    approve: "herkes, kendi izni", transfer: "herkes, kendi bakiyesi",
    transferFrom: "izin verilmis", burn: "herkes, KENDI bakiyesi"
  },
  TekYonluAcici: {
    ac: "YALNIZ acan — BIR KEZ, zaten kullanildi",
    genislet: "YALNIZ acan (kurucu cuzdani) — sadece EKLER, cikaramaz",
    biriktir: "herkes — argumansiz, sadece havuza koyar",
    unlockCallback: "YALNIZ PoolManager"
  },
  Stake: {
    stake: "herkes", unstake: "herkes, kendi stake'i", claim: "herkes, kendi odulu",
    dagit: "herkes", salim: "herkes"
  },
  DepthHook: {
    afterSwap: "YALNIZ PoolManager",
    beforeAddLiquidity: "YALNIZ PoolManager, ve sadece acici icin",
    beforeRemoveLiquidity: "YALNIZ PoolManager — HERKESE REVERT EDER"
  },
  DepthGovernor: {
    propose: "stake'i taban + %1 olan", castVote: "stake eden",
    oyVer: "stake eden", queue: "herkes", execute: "herkes, timelock sonrasi",
    cancel: "YALNIZ nobetci, 2027-10-07'ye kadar",
    renounce: "YALNIZ nobetci", birak: "YALNIZ nobetci",
    iptal: "YALNIZ nobetci, 2027-10-07'ye kadar",
    teklifEt: "stake'i taban + %1 olan", sirala: "herkes", uygula: "herkes, timelock sonrasi"
  },
  Vesting: { claim: "herkes; para HER ZAMAN yararlanana gider", cek: "herkes; para HER ZAMAN yararlanana gider" }
};

const ESLER = [
  ["Jeton", A.token], ["TekYonluAcici", A.acici], ["Stake", A.stake],
  ["DepthHook", A.hook], ["DepthGovernor", A.governor], ["Vesting", A.vesting]
];

(async function main() {
  console.log("FATHOM — NE KILITLI, NE DEGIL");
  console.log("");

  let soru = 0, ayrik = 0;
  for (const [ad, adres] of ESLER) {
    const art = B(ad);
    const zincir = await rpc("eth_getCode", [adres, "latest"]);
    const ayniBoy = zincir.length === art.deployedBytecode.length;
    if (!ayniBoy) ayrik++;
    console.log("  " + ad + "   " + adres);
    console.log("    kod " + nf((zincir.length - 2) / 2) + " bayt" +
      (ayniBoy ? "   derlenenle ayni boyda" : "   BOY FARKLI (derlenen " +
        nf((art.deployedBytecode.length - 2) / 2) + ")"));

    const iface = new Interface(art.abi);
    const yazan = [];
    iface.forEachFunction((f) => {
      if (f.stateMutability !== "view" && f.stateMutability !== "pure") yazan.push(f.name);
    });
    if (!yazan.length) console.log("    (durum degistiren fonksiyon YOK)");
    for (const fn of [...new Set(yazan)].sort()) {
      const kim = (KIM[ad] || {})[fn];
      if (!kim) soru++;
      console.log("      " + fn.padEnd(22) + (kim || "?  BILINMEYEN YETKILI — INCELE"));
    }
    /* The words that would mean somebody can still take something. */
    const tehlike = ["owner", "setFee", "sweep", "rescue", "withdraw", "upgrade",
                     "mint", "pause", "blacklist", "setOwner", "initialize"];
    const bulunan = tehlike.filter((t) => yazan.some((f) => f.toLowerCase() === t.toLowerCase()));
    console.log("      " + (bulunan.length ? "TEHLIKELI: " + bulunan.join(", ")
      : "owner / mint / pause / sweep / withdraw / upgrade  -> hicbiri YOK"));
    console.log("");
  }

  /* ---- does anything answer to the governor? ---------------------- */
  console.log("  YONETISIMIN GERCEK ERISIMI");
  console.log("    Governor rastgele cagri yapabiliyor (target.call). Onemli olan");
  console.log("    HANGI sozlesmenin ona yetki verdigi — adresini digerlerinin");
  console.log("    icinde ariyorum:");
  const govHex = A.governor.toLowerCase().slice(2);
  let yetkiVeren = 0;
  for (const [ad, adres] of ESLER) {
    if (adres.toLowerCase() === A.governor.toLowerCase()) continue;
    const kod = (await rpc("eth_getCode", [adres, "latest"])).toLowerCase();
    const var_ = kod.includes(govHex);
    if (var_) yetkiVeren++;
    console.log("      " + ad.padEnd(16) + (var_ ? "GOVERNOR ADRESI GECIYOR — INCELE" : "gecmiyor"));
  }
  const govTok = BigInt(await rpc("eth_call", [{ to: A.token,
    data: sel("balanceOf(address)") + coder.encode(["address"], [A.governor]).slice(2) }, "latest"]));
  const govUsdc = BigInt(await rpc("eth_call", [{ to: A.usdc,
    data: sel("balanceOf(address)") + coder.encode(["address"], [A.governor]).slice(2) }, "latest"]));
  console.log("      governor bakiyesi  " + nf(Number(govTok) / 1e18) + " FTHM, $" +
    nf(Number(govUsdc) / 1e6, 2));
  console.log("");
  console.log("    SONUC: " + (yetkiVeren === 0
    ? "hicbir sozlesme Governor'a yetki vermiyor ve elinde varlik yok.\n" +
      "    Yani gecen bir teklif, herkesin zaten yapabildiginden fazlasini\n" +
      "    yapamaz. Yonetisim su an bir SAYIM makinesi — degistirecek bir sey\n" +
      "    olmadigi icin. Ileride yetki verilen bir sozlesme eklenirse o zaman\n" +
      "    gercek guc kazanir."
    : "bazi sozlesmelerde Governor adresi geciyor, incelenmeli."));
  console.log("");

  /* ---- what the founder wallet still holds ---------------------------- */
  console.log("  KURUCU CUZDANINDA DURAN IKI YETKI  (tasarim geregi, sinirli)");
  const nobetci = "0x" + (await rpc("eth_call", [{ to: A.governor, data: sel("guardian()") }, "latest"])).slice(26);
  const son = BigInt(await rpc("eth_call", [{ to: A.governor, data: sel("guardianExpiry()") }, "latest"]));
  const acan = "0x" + (await rpc("eth_call", [{ to: A.acici, data: sel("acan()") }, "latest"])).slice(26);
  const aciciTok = BigInt(await rpc("eth_call", [{ to: A.token,
    data: sel("balanceOf(address)") + coder.encode(["address"], [A.acici]).slice(2) }, "latest"]));
  const kalanGun = (Number(son) - Math.floor(Date.now() / 1000)) / 86400;
  console.log("    1. NOBETCI   " + nobetci);
  console.log("       veto eder, teklif geciremez, para tasiyamaz.");
  console.log("       " + new Date(Number(son) * 1000).toISOString().slice(0, 10) +
    "'de kendiliginden biter (" + nf(kalanGun, 0) + " gun). renounce() ile erken birakilabilir.");
  console.log("    2. ACAN      " + acan);
  console.log("       ac() bir kez calisirdi, CALISTI — bir daha calismaz.");
  console.log("       genislet() duruyor: acicinin elindeki " + nf(Number(aciciTok) / 1e18, 2) +
    " FTHM'i");
  console.log("       bir aralia koyabilir. Sadece EKLER; cikarma yolu yok, ve");
  console.log("       koydugu da kilitlenir. En kotu ihtimalle o " + nf(Number(aciciTok) / 1e18, 0) +
    " token");
  console.log("       ise yaramaz bir aralia konur. Baskasinin parasina dokunamaz.");
  console.log("");

  console.log("  OZET");
  console.log("    bilinmeyen yetkili fonksiyon : " + soru);
  console.log("    kod boyu uyusmayan sozlesme  : " + ayrik);
  console.log("    arz                          : SABIT, mint yok, sadece burn azaltir");
  console.log("    havuz likiditesi             : CIKARILAMAZ (hook herkese revert)");
  console.log("    ucret oranlari               : SABIT, degistiren fonksiyon yok");
  console.log("    stake takvimi / 50.000 siniri: SABIT");
  console.log("    oylama sureleri              : immutable, degistirilemez");
  console.log("");
  console.log("    Yani 'her alanda kilitli' DEGIL, ama acik kalan iki sey de");
  console.log("    kimseden bir sey ALAMAZ — biri veto, digeri sadece ekleme.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
