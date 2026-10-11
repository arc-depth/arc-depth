"use strict";
/* ===========================================================================
 * olc-depth-sayim.js — every DEPTH token, read from the chain, and whether
 *                      anyone can still move it.
 *
 *   node scripts/olc-depth-sayim.js
 *
 * WHY THIS EXISTS
 *   I was asked where the tokens in the other pool went and why liquidity
 *   has to come out of the founder's share, and I was about to answer from
 *   memory. Memory is how the previous token lost 9.37 million without
 *   anyone noticing. So this reads every holder's balance, adds them up,
 *   and checks the total against totalSupply — if the sum does not close,
 *   the accounting is wrong and that is the first thing anyone should see.
 *
 *   The second column is the one that actually answers the question: not
 *   how much a holder has, but whether there is any code path that moves
 *   it. A balance behind a threshold nobody has paid is not available, no
 *   matter how large it looks.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, id, keccak256 } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const coder = AbiCoder.defaultAbiCoder();
const KOK = path.join(__dirname, "..");
const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-depth.json"), "utf8"));
const H = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-havuz.json"), "utf8"));
let DR = null;
try { DR = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-derinlik.json"), "utf8")); } catch (e) { /* yok */ }
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
    r.setTimeout(60000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 900)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 30000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const E = 10n ** 18n;
const adet = (v) => nf(Number(v) / 1e18);

(async function main() {
  const bak = async (who) => BigInt(await rpc("eth_call", [{ to: D.token,
    data: sel("balanceOf(address)") + coder.encode(["address"], [who]).slice(2) }, "latest"]));

  const arz = BigInt(await rpc("eth_call", [{ to: D.token, data: sel("totalSupply()") }, "latest"]));

  const yerler = [
    ["ana egri",            D.egri,          "satiliyor — $15.000 esigine kadar alicilara, sonra mezuniyet havuzuna"],
    ["stake kasasi",        D.stake,         "30 yillik emisyon — sadece takvim salar, kimse erken alamaz"],
    ["vesting",             D.vesting,       "kurucu vesting — takvimle kurucu cuzdanina"],
    ["KURUCU CUZDANI (senin)", D.kurucu,        "SERBEST — her an satilabilir, tasinabilir"],
    ["ikinci egri",         H.egri2,         "tukendi mi diye bakiliyor"],
    ["eski acici",          H.havuzAcici2,   "havuza koydu, elinde kalan varsa erisilemez"],
    ["PoolManager (havuz)", D.poolManager,   "iki havuzun tokenleri — kilitli, cikarilamaz"]
  ];
  if (DR && DR.acici) yerler.push(["yeni acici", DR.acici, "derinlik havuzu — henuz acilmadiysa token yok"]);
  if (DR && DR.terkEdilen) yerler.push(["terk edilen acici", DR.terkEdilen.acici, "hic kullanilmadi"]);

  console.log("DEPTH SAYIMI — zincirden, " + new Date().toISOString().slice(0, 16).replace("T", " "));
  console.log("");
  console.log("  totalSupply   " + adet(arz) + " DEPTH");
  console.log("");

  let toplam = 0n;
  const satirlar = [];
  for (const [ad, adres, not] of yerler) {
    const v = await bak(adres);
    toplam += v;
    satirlar.push([ad, adres, v, not]);
  }

  for (const [ad, adres, v, not] of satirlar) {
    console.log("  " + ad.padEnd(20) + adet(v).padStart(17) + "   " + adres);
    console.log("  " + " ".repeat(20) + " ".repeat(17) + "   " + not);
  }

  const yakilan = arz - toplam;
  console.log("");
  console.log("  " + "sayilanlarin toplami".padEnd(20) + adet(toplam).padStart(17));
  console.log("  " + "fark".padEnd(20) + adet(yakilan).padStart(17) +
    "   yakilan + listede olmayan cuzdanlar");

  /* The original plan, so a drift from it is visible rather than inferred. */
  console.log("");
  console.log("  PLANA GORE NEREDE OLMALIYDI");
  const plan = [
    ["ana egri", BigInt(D.egriToken)],
    ["stake kasasi", BigInt(D.stakeEmisyon)],
    ["kurucu cuzdani (serbest)", BigInt(D.kurucuSerbest)],
    ["vesting", BigInt(D.kurucuVesting)]
  ];
  for (const [ad, v] of plan) console.log("    " + ad.padEnd(24) + adet(v).padStart(17));
  console.log("    " + "toplam".padEnd(24) + adet(plan.reduce((a, [, v]) => a + v, 0n)).padStart(17));

  /* ---- the question that was actually asked ----------------------- */
  const kurucuSimdi = satirlar.find(([a]) => a.startsWith("KURUCU"))[2];
  const eksilen = BigInt(D.kurucuSerbest) - kurucuSimdi;
  console.log("");
  console.log("  KURUCU CUZDANINDAN NE EKSILDI");
  console.log("    basta          " + adet(BigInt(D.kurucuSerbest)) + " DEPTH");
  console.log("    simdi          " + adet(kurucuSimdi) + " DEPTH");
  console.log("    eksilen        " + adet(eksilen) + " DEPTH");
  console.log("    ikinci egriye verilen (dagit-havuz.js)   " + adet(BigInt(H.egriToken)));
  console.log("    o egriden havuza giren                   " + adet(BigInt(H.havuzToken)));
  console.log("    o egride yakilan                         " + adet(BigInt(H.yakilan)));
  console.log("    geri alinan (alim karsiligi)             " +
    adet(BigInt(H.egriToken) - BigInt(H.havuzToken) - BigInt(H.yakilan)));

  console.log("");
  console.log("  HANGI TOKENLER BUGUN HAREKET ETTIRILEBILIR");
  console.log("    Sadece kurucu cuzdanindakiler. Digerleri bir mekanizmanin");
  console.log("    arkasinda: egrideki 500M icin para odenmesi, stake'teki");
  console.log("    400M icin takvimin gecmesi, havuzdakiler icin kilidin");
  console.log("    acilmasi gerekir — ve kilit hic acilmiyor, tasarim o.");
  console.log("    Bu, likiditenin kurucu payindan gelmesi GEREKTIGI anlamina");
  console.log("    gelmiyor; gelmezse havuz derinlesmez ve alicilar egriyi");
  console.log("    kullanmak zorunda kalir. Secim bu ikisi arasinda.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
