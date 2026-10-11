"use strict";
/* ===========================================================================
 * dene-sira.js — three buyers in, three buyers out, nobody deposited a cent.
 *
 *   node scripts/dene-sira.js
 *   node scripts/dene-sira.js --token 500 --bant 50 --tutar 100
 *
 * THE QUESTION
 *   "We lock the liquidity. The first buyer sells and gets their money
 *   back. Others buy and the price rises. Whoever sells after the first one
 *   gets less. Is that possible without putting liquidity in?"
 *
 *   Yes, and this proves it instead of asserting it: three buyers go
 *   through the real Arc PoolManager in order, against a band holding
 *   tokens and zero dollars, then come back out in the same order. Each
 *   one's profit and loss is what the chain returned.
 *
 *   The step before them is the one I would rather not have to print: a
 *   sell attempted before anybody has bought. A pool with no quote asset
 *   cannot pay a seller, and a holder deserves to learn that from us
 *   rather than from their own wallet.
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
const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestSira.json"), "utf8"));

const val = (ad, d) => { const i = process.argv.indexOf(ad); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TOKEN_M = Number(val("--token", "500"));
const BANT = Number(val("--bant", "50"));
const TUTAR = Number(val("--tutar", "100"));

const KOSUM = "0x00000000000000000000000000000000000d3b7a";
const SPACING = 60n;
const Q96 = 2 ** 96;
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
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 600)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 30000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);

const iface = new Interface([
  "function run(address pm,uint160 acilisSqrt,int24 alt,int24 ust,uint256 tokenMiktari,uint256 tutar) returns (" +
  "(uint128 likidite,uint256 ilkSatisDenemesi,bool ilkSatisRevert," +
  "(uint256 odedi,uint256 aldi,uint256 geriAldi) a," +
  "(uint256 odedi,uint256 aldi,uint256 geriAldi) b," +
  "(uint256 odedi,uint256 aldi,uint256 geriAldi) c," +
  "uint256 havuzParaAlimlardanSonra,uint256 havuzParaHepsiCikinca))"
]);

(async function main() {
  const slot = keccak256(coder.encode(["bytes32", "uint256"], [H.havuzId, 6]));
  const raw = BigInt(await rpc("eth_call", [
    { to: D.poolManager, data: sel("extsload(bytes32)") + slot.slice(2) }, "latest"]));
  const sqrtCanli = raw & ((1n << 160n) - 1n);
  const pV4 = (Number(sqrtCanli) / Q96) ** 2;
  const fiyat = (1 / pV4) * 1e12;
  const tick = Math.floor(Math.log(pV4) / Math.log(1.0001));
  const ust = BigInt(Math.floor((tick - 1) / 60)) * SPACING;
  const adim = BigInt(Math.round(Math.log(1 + BANT / 100) / Math.log(1.0001) / 60)) * SPACING;
  const alt = ust - adim;

  console.log("SIRAYLA — ucu girer, ucu cikar. Havuza kimse para koymadi.");
  console.log("  GERCEK Arc PoolManager, eth_call, zincire hicbir sey gitmiyor");
  console.log("");
  console.log("  bant       " + nf(TOKEN_M) + "M token, +%" + nf(BANT) + ", sadece token");
  console.log("  acilis     $" + fiyat.toExponential(4) + " / token");
  console.log("  her alici  " + usd(TUTAR) + "");
  console.log("");

  let r;
  try {
    r = await rpc("eth_call", [
      { from: KOSUM, to: KOSUM, gas: "0x8000000",
        data: iface.encodeFunctionData("run", [D.poolManager, sqrtCanli, alt, ust,
          BigInt(TOKEN_M) * 10n ** 24n, BigInt(Math.round(TUTAR * 1e6))]) },
      "latest", { [KOSUM]: { code: B.deployedBytecode, nonce: "0x0" } }
    ]);
  } catch (e) { console.log("  REVERT: " + e.message); process.exit(1); }

  const s = iface.decodeFunctionResult("run", r)[0];
  const ilkSatis = Number(BigInt(s[1])) / 1e6, ilkRevert = s[2];
  const kisi = (k) => ({
    odedi: Number(BigInt(k[0])) / 1e6,
    aldi: Number(BigInt(k[1])) / 1e18,
    geri: Number(BigInt(k[2])) / 1e6
  });
  const A = kisi(s[3]), Bk = kisi(s[4]), C = kisi(s[5]);
  const havuzSonra = Number(BigInt(s[6])) / 1e6;
  const havuzBos = Number(BigInt(s[7])) / 1e6;

  console.log("  0. HENUZ KIMSE ALMADAN BIRI SATMAYA CALISIRSA");
  console.log("     eline gecen  " + (ilkRevert ? "ISLEM REDDEDILDI" : usd(ilkSatis, 6)));
  console.log("     Havuzda dolar yok, odeyecek bir sey yok. Bu, para koymadan");
  console.log("     acmanin tek gercek bedeli — ve sayfada yazmamiz gereken sey.");
  console.log("");

  console.log("  ALIMLAR — sirayla");
  console.log("     " + "kim".padEnd(5) + "odedi".padStart(10) + "aldigi token".padStart(16) +
    "ortalama fiyat".padStart(17));
  for (const [ad, k] of [["A", A], ["B", Bk], ["C", C]]) {
    console.log("     " + ad.padEnd(5) + usd(k.odedi).padStart(10) + nf(k.aldi).padStart(16) +
      ("$" + (k.odedi / k.aldi).toExponential(3)).padStart(17));
  }
  console.log("     havuzda biriken gercek para  " + usd(havuzSonra));
  console.log("     (ucu de ayni " + usd(TUTAR) + "'i verdi ama C daha az token aldi —");
  console.log("      fiyat her alimda yukseldi, istedigin davranis bu.)");
  console.log("");

  console.log("  SATISLAR — ayni sirayla cikiyorlar");
  console.log("     " + "kim".padEnd(5) + "odedigi".padStart(10) + "geri aldigi".padStart(14) +
    "sonuc".padStart(12) + "   ");
  let topOdenen = 0, topGeri = 0;
  for (const [ad, k] of [["A", A], ["B", Bk], ["C", C]]) {
    const kar = k.geri - k.odedi;
    topOdenen += k.odedi; topGeri += k.geri;
    console.log("     " + ad.padEnd(5) + usd(k.odedi).padStart(10) + usd(k.geri).padStart(14) +
      ((kar >= 0 ? "+" : "") + usd(kar)).padStart(12) +
      "   %" + nf((kar / k.odedi) * 100, 1));
  }
  console.log("     " + "-".repeat(46));
  console.log("     " + "toplam".padEnd(5) + usd(topOdenen).padStart(10) + usd(topGeri).padStart(14) +
    ((topGeri - topOdenen >= 0 ? "+" : "") + usd(topGeri - topOdenen)).padStart(12));
  console.log("     hepsi ciktiktan sonra havuzda kalan  " + usd(havuzBos, 6));
  console.log("");

  console.log("  OKUMA");
  console.log("    Sordugun tam olarak bu ve EVET, para koymadan mumkun:");
  console.log("      - A tek basina girip ciksaydi parasini aynen alirdi");
  console.log("      - B ve C alinca fiyat yukseldi");
  console.log("      - A o yukselise satti, " + ((A.geri - A.odedi) >= 0 ? "KARLI" : "zararli") + " cikti");
  console.log("      - en son cikan C, " + ((C.geri - C.odedi) >= 0 ? "karli" : "ZARARLI") + " cikti");
  console.log("");
  console.log("    Toplam " + usd(topGeri - topOdenen) + " — yani havuz kimseden para");
  console.log("    almiyor, sadece aktariyor. Kazanan erken girip gec satan,");
  console.log("    kaybeden gec girip en son satan. Her AMM boyle calisir;");
  console.log("    mezun olmus " + usd(5500) + "'lik Arc havuzlari da dahil.");
  console.log("");
  console.log("    TEK FARK: oradaki havuzda bastan " + usd(5500) + " duruyor, yani");
  console.log("    ilk satici bile parasini bulur. Bizde ilk dolar ALICIDAN gelir.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
