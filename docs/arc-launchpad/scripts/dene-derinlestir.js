"use strict";
/* ===========================================================================
 * dene-derinlestir.js — is the pool really growable after it is opened?
 *
 *   node scripts/dene-derinlestir.js
 *   node scripts/dene-derinlestir.js --token 15 --bant 50
 *
 * The band is being opened with 15,000,000 DEPTH instead of 45,000,000, and
 * the only thing that makes that a careful first step rather than a cap I
 * talked myself into is `biriktir`: send more DEPTH to the opener, call it,
 * and the same position gets deeper. If that does not work the number has
 * to be decided once, now, with no second chance.
 *
 * So it is run against the real Arc PoolManager in all three states — open
 * and untouched, part way through the band, and emptied — before the
 * irreversible transaction rather than after. Nothing is sent; this is an
 * eth_call.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, Interface, keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const coder = AbiCoder.defaultAbiCoder();
const KOK = path.join(__dirname, "..");
const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-depth.json"), "utf8"));
const H = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-havuz.json"), "utf8"));
const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestDerinlestir.json"), "utf8"));

const val = (ad, d) => { const i = process.argv.indexOf(ad); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TOKEN_M = Number(val("--token", "15"));
const BANT = Number(val("--bant", "50"));
const OLCUM = Number(val("--swap", "20"));

const KOSUM = "0x00000000000000000000000000000000000d3b7a";
const SPACING = 60n;
const Q96 = 2n ** 96n;
const sel = (s) => id(s).slice(0, 10);

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(e); }
      });
    });
    r.on("error", rej);
    r.setTimeout(120000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 600)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 6) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);
const cuzdan = (ort, spot) => (1 - spot / ort) * 100;

(async function main() {
  const slot = keccak256(coder.encode(["bytes32", "uint256"], [H.havuzId, 6]));
  const raw = BigInt(await rpc("eth_call", [
    { to: D.poolManager, data: sel("extsload(bytes32)") + slot.slice(2) }, "latest"]));
  const sqrtCanli = raw & ((1n << 160n) - 1n);
  const pV4 = (Number(sqrtCanli) / Number(Q96)) ** 2;
  const fiyat = (1 / pV4) * 1e12;
  const tickCanli = Math.floor(Math.log(pV4) / Math.log(1.0001));
  const ust = BigInt(Math.floor((tickCanli - 1) / 60)) * SPACING;
  const adim = BigInt(Math.round(Math.log(1 + BANT / 100) / Math.log(1.0001) / 60)) * SPACING;
  const alt = ust - adim;

  const iface = new Interface([
    "function run(address pm,uint160 acilisSqrt,int24 alt,int24 ust,uint256 tokenMiktari,uint256 olcumSwap,uint8 durak) returns (" +
    "(uint128 ilkLikidite,uint128 ekTokenSadece,uint128 likiditeSonra," +
    "uint256 alimOdenen,uint256 alimAlinan,uint128 ekKarisik," +
    "uint256 bosaltOdenen,uint128 ekBosalmis,bool bosalmisRevert," +
    "uint128 ekGenislet,bool genisletRevert,uint256 genisletSonrasiAlinan," +
    "uint256 oncesiAlinan,uint256 sonrasiAlinan,uint256 ortaAlinan))"
  ]);

  console.log("DERINLESTIRME — GERCEK Arc PoolManager, eth_call, hicbir sey gonderilmiyor");
  console.log("");
  console.log("  bant        [" + alt + ", " + ust + "]   +%" +
    nf(1.0001 ** Number(adim) * 100 - 100, 1));
  console.log("  ilk konan   " + nf(TOKEN_M) + ".000.000 DEPTH");
  console.log("  olcum swap  " + usd(OLCUM, 2));
  console.log("");

  let r;
  try {
    r = await rpc("eth_call", [
      { from: KOSUM, to: KOSUM, gas: "0x8000000",
        data: iface.encodeFunctionData("run",
          [D.poolManager, sqrtCanli, alt, ust,
           BigInt(TOKEN_M) * 10n ** 24n, BigInt(Math.round(OLCUM * 1e6)),
           Number(val("--durak", "0"))]) },
      "latest", { [KOSUM]: { code: B.deployedBytecode, nonce: "0x0" } }
    ]);
  } catch (e) {
    console.log("  REVERT: " + e.message);
    console.log("  Zincire hicbir sey gitmedi.");
    process.exit(1);
  }

  const s = iface.decodeFunctionResult("run", r)[0];
  const ilk = BigInt(s[0]), ek1 = BigInt(s[1]), sonra = BigInt(s[2]);
  const alimOdenen = Number(BigInt(s[3])) / 1e6, alimAlinan = Number(BigInt(s[4])) / 1e18;
  const ek2 = BigInt(s[5]);
  const bosaltOdenen = Number(BigInt(s[6])) / 1e6, ek3 = BigInt(s[7]), rev = s[8];
  const ek4 = BigInt(s[9]), gRev = s[10], gSonra = Number(BigInt(s[11])) / 1e18;
  const oncesi = Number(BigInt(s[12])) / 1e18, sonrasi = Number(BigInt(s[13])) / 1e18;
  const orta = Number(BigInt(s[14])) / 1e18;

  console.log("  1. DOKUNULMAMIS HAVUZ, SADECE TOKEN GONDERILDI");
  console.log("     ilk likidite      " + ilk);
  console.log("     biriktir() ekledi " + ek1);
  console.log("     yeni likidite     " + sonra +
    "   (" + nf(Number(sonra) / Number(ilk), 3) + " kat)");
  console.log("     " + (ek1 > 0n
    ? "CALISIYOR — havuz USDC olmadan, sadece token gonderilerek derinlesti."
    : "CALISMADI — o zaman miktar bastan secilmek zorunda."));
  console.log("");
  console.log("     ayni " + usd(OLCUM, 2) + " swap'in getirisi");
  console.log("       once   " + nf(oncesi) + " DEPTH   -%" + nf(cuzdan(OLCUM / oncesi, fiyat), 2));
  console.log("       sonra  " + nf(sonrasi) + " DEPTH   -%" + nf(cuzdan(OLCUM / sonrasi, fiyat), 2));
  console.log("");
  console.log("  2. ALIM BANDIN ICINE GIRDIKTEN SONRA, YINE SADECE TOKEN");
  console.log("     " + usd(alimOdenen, 2) + " alim -> " + nf(alimAlinan) + " DEPTH");
  console.log("     biriktir() ekledi " + ek2 + (ek2 > 0n ? "   calisiyor" : "   EKLEMEDI"));
  console.log("     ONCEKI SURUMDE BU SIFIRDI. Fiyatin uzerinden gecen bir");
  console.log("     pozisyon iki varlik istiyor, bizde USDC yok; simdi her varlik");
  console.log("     bandin kendi tarafindaki parcasina konuyor.");
  console.log("     " + usd(OLCUM, 2) + " swap bu noktada  " + nf(orta) + " DEPTH   -%" +
    nf(cuzdan(OLCUM / orta, fiyat), 2));
  console.log("");
  console.log("  3. BANT BOSALDIKTAN SONRA — tavanin kendisi");
  console.log("     bandi bosaltan alim havuzun kabul ettigi  " + usd(bosaltOdenen, 2));
  console.log("     sonra sadece token ile biriktir() ekledi  " + ek3);
  console.log("     revert etti mi                            " + (rev ? "EVET" : "hayir"));
  console.log("");
  if (rev) {
    console.log("     REVERT ETMEMELIYDI. Bosalmis bir bantta biriktir()'in");
    console.log("     patlamasi, sonraki her derinlestirmeyi de kilitler.");
  } else if (ek3 === 0n) {
    console.log("     Dogru davranis: bosalmis bandin icine token eklemek ise");
    console.log("     yaramiyor — fiyat bandin disinda, o tarafta token istenmiyor.");
    console.log("     Onemli olan sessizce donmesi: revert etseydi sonraki her");
    console.log("     derinlestirme de kilitlenirdi. Cikis yolu 4. adimda.");
  } else {
    console.log("     Bosalmis bantta bile ekledi — beklenmiyordu, incelenmeli.");
  }
  console.log("");
  console.log("  4. TAVANI KALDIRMAK — bandi token tarafina genisletmek");
  console.log("     genislet() ekledi " + ek4 +
    (gRev ? "   REVERT ETTI" : ek4 > 0n ? "   calisiyor" : "   EKLEMEDI"));
  console.log("     sonrasinda " + usd(OLCUM, 2) + " swap  " + nf(gSonra) + " DEPTH" +
    (gSonra > 0 ? "   -%" + nf(cuzdan(OLCUM / gSonra, fiyat), 2) : "   (havuz alim vermiyor)"));
  console.log("     Bu cagri sadece acan'a acik, cunku tick aliyor; ama acan icin");
  console.log("     bile yaptigi tek sey kilitli likidite EKLEMEK. Cikaramaz.");
  console.log("");
  console.log("  SONUC");
  console.log("    " + (ek2 > 0n && !rev && !gRev && ek4 > 0n
    ? nf(TOKEN_M) + "M ile baslamak guvenli. Alim basladiktan sonra bile sadece\n" +
      "    token gonderip biriktir() cagirarak ayni havuz derinlesiyor, ve bant\n" +
      "    dolarsa genislet() onu token tarafina uzatiyor. Ikisi de kilitli ekler,\n" +
      "    hicbiri cikarmaz."
    : "Buyume yolu dogrulanmadi — miktar bastan secilmeli."));
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
