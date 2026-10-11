"use strict";
/* ===========================================================================
 * olc-arc-gercek-para.js — how much real money is actually in Arc's pools?
 *
 *   node scripts/olc-arc-gercek-para.js
 *   node scripts/olc-arc-gercek-para.js --kac 40
 *
 * THE QUESTION
 *   Before arguing about what our token's slippage ought to be, find out
 *   what everyone else's actually is. Arc has about 24,000 launchpad pools
 *   — one hook per token, pump.fun shaped — and 20,390 of them use exactly
 *   the capability bits our own hook uses. If those pools are also empty,
 *   then a thin pool is simply what a new token on this chain looks like.
 *   If they hold real money, we are the outlier and I need to know it.
 *
 * HOW IT IS MEASURED, WITHOUT SENDING ANYTHING
 *   v4 keeps every token in one PoolManager, so a pool has no reserves to
 *   read. But active liquidity and price give the virtual reserves, and the
 *   quote-side one is the money a trade is priced against:
 *
 *       sqrtP = sqrtPriceX96 / 2^96
 *       USDC tarafi = L / sqrtP      (USDC is currency0 here)
 *       token tarafi = L * sqrtP
 *
 *   Checked against our own pool before being used on anyone else's: it
 *   returns $6.03, and $6.03 is what produces the -76.96% MetaMask showed
 *   on $20. So the number means what it says.
 *
 *   Both slots come from the PoolManager with extsload: pools live at slot
 *   6, slot0 holds sqrtPriceX96 and the tick, and slot0 + 3 holds the
 *   active liquidity.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const coder = AbiCoder.defaultAbiCoder();
const KOK = path.join(__dirname, "..");
const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-depth.json"), "utf8"));
const H = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-havuz.json"), "utf8"));
const A = JSON.parse(fs.readFileSync(path.join(KOK, "arc-havuz-durum.json"), "utf8"));

const USDC = "0x3600000000000000000000000000000000000000";
const ARGUS = "0xece5ca8bf9220718e5727754026757512212cb3c";
const PM = D.poolManager;
const Q96 = 2 ** 96;
const sel = (s) => id(s).slice(0, 10);
const val = (ad, d) => { const i = process.argv.indexOf(ad); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const KAC = Number(val("--kac", "30"));

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
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 450)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 30000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const usd = (x) => x >= 1e6 ? "$" + nf(x / 1e6, 2) + "M"
  : x >= 1e3 ? "$" + nf(x / 1e3, 1) + "k"
  : "$" + nf(x, 2);
/* What the wallet prints, for a constant-product move against R. */
const etki = (R, d) => R <= 0 ? 100 : (1 - R / (R + d)) * 100;

const isim = (a) => {
  const i = A.isimler[a] || A.isimler[(a || "").toLowerCase()];
  return i && i.sembol ? i.sembol : (a.slice(0, 8) + "…");
};

async function havuzOku(h) {
  const slot = keccak256(coder.encode(["bytes32", "uint256"], [h.id, 6]));
  const raw = BigInt(await rpc("eth_call", [{ to: PM, data: sel("extsload(bytes32)") + slot.slice(2) }, "latest"]));
  const sqrtX96 = raw & ((1n << 160n) - 1n);
  if (sqrtX96 === 0n) return null;                       // never initialised
  const likSlot = "0x" + (BigInt(slot) + 3n).toString(16).padStart(64, "0");
  const lik = BigInt(await rpc("eth_call", [{ to: PM, data: sel("extsload(bytes32)") + likSlot.slice(2) }, "latest"]));
  const sqrtP = Number(sqrtX96) / Q96;
  const usdcSifirinci = h.c0.toLowerCase() === USDC;
  /* L/sqrtP is the currency0 side, L*sqrtP the currency1 side; take
     whichever one is the USDC leg, in its own 6-decimal units. */
  const para = usdcSifirinci ? (Number(lik) / sqrtP) / 1e6 : (Number(lik) * sqrtP) / 1e6;
  /* The token side of the same liquidity, valued at the same price. For a
     pool seeded with real money at graduation the two sides are close; a
     one-sided or sharply concentrated position is lopsided, and that is
     what tells "money is in there" apart from "the range is narrow". */
  const tokenHam = usdcSifirinci ? Number(lik) * sqrtP : Number(lik) / sqrtP;
  const fiyat = usdcSifirinci ? 1 / (sqrtP * sqrtP) * 1e12 : (sqrtP * sqrtP) * 1e12;
  const tokenDeger = (tokenHam / 1e18) * fiyat;
  return { para, tokenDeger, fiyat, lik, sqrtX96 };
}

(async function main() {
  console.log("ARC'TA GERCEKTEN NE KADAR PARA VAR — zincirden okundu, hicbir sey gonderilmedi");
  console.log("");

  /* ---- first, prove the method on a pool whose answer we know ------ */
  const bizim = await havuzOku({ id: H.havuzId, c0: USDC, c1: D.token });
  console.log("  YONTEM DOGRULAMASI — kendi havuzumuz, cevabini biliyoruz");
  console.log("    L/sqrtP  " + usd(bizim.para) + "    manifestteki esik $6,00");
  console.log("    $20 alim icin verdigi etki  -%" + nf(etki(bizim.para, 20), 2) +
    "    ekranda gorulen -%76,96");
  console.log("    Tutuyor. Asagidaki rakamlar ayni olcumun baskalarina uygulanmis hali.");
  console.log("");

  /* ---- collect USDC-paired pools ---------------------------------- */
  const adaylar = [];
  for (const h of Object.values(A.havuzlar)) {
    const c0 = h.c0.toLowerCase(), c1 = h.c1.toLowerCase();
    const usdcVar = c0 === USDC || c1 === USDC;
    if (!usdcVar) continue;
    const other = c0 === USDC ? c1 : c0;
    if (other === "0x0000000000000000000000000000000000000000") continue;
    const hookSon = (h.hooks || "").toLowerCase().slice(-2);
    adaylar.push({ ...h, other, hookSon, launchpad: hookSon === "44" || hookSon === "cc" });
  }
  console.log("  USDC esli havuz: " + nf(adaylar.length) +
    "   bunlarin " + nf(adaylar.filter((x) => x.launchpad).length) + " tanesi launchpad hookuyla");
  console.log("");

  /* The snapshot carries a liquidity figure for some pools; use it only
     to choose which ones are worth an RPC call, never as the answer. */
  const skorlu = adaylar.map((x) => ({ ...x, skor: Number(BigInt(A.likidite[x.id] || "0")) }))
    .filter((x) => x.skor > 0)
    .sort((a, b) => b.skor - a.skor);

  const argusHavuzlari = adaylar.filter((x) => x.other === ARGUS);
  const launchpadler = skorlu.filter((x) => x.launchpad).slice(0, KAC);
  const digerleri = skorlu.filter((x) => !x.launchpad).slice(0, 10);

  async function tablo(baslik, liste, notu) {
    console.log("  " + baslik);
    if (notu) console.log("    " + notu);
    console.log("    " + "token".padEnd(12) + "derinlik".padStart(11) + "token tarafi".padStart(13) +
      "  denge".padStart(7) + "     FDV".padStart(9) +
      "   $20".padStart(8) + "   $1.000".padStart(10) + "   hook");
    const okunan = [];
    for (const h of liste) {
      const o = await havuzOku(h);
      if (!o || o.para < 0.01) continue;
      okunan.push(o.para);
      const denge = o.tokenDeger > 0 ? o.para / o.tokenDeger : 0;
      console.log("    " + isim(h.other).padEnd(12) + usd(o.para).padStart(11) +
        usd(o.tokenDeger).padStart(13) +
        (denge > 0.5 && denge < 2 ? "  esit" : denge >= 2 ? "  para" : " token").padStart(7) +
        usd(o.fiyat * 1e9).padStart(9) +
        "   -%" + nf(etki(o.para, 20), 2).padStart(5) +
        "    -%" + nf(etki(o.para, 1000), 1).padStart(5) +
        "   " + (h.launchpad ? "…" + h.hookSon + " lp" : h.hookSon === "00" ? "yok" : "…" + h.hookSon));
    }
    if (okunan.length) {
      const sirali = [...okunan].sort((a, b) => a - b);
      const ortanca = sirali[Math.floor(sirali.length / 2)];
      console.log("    " + "-".repeat(60));
      console.log("    " + ("ortanca (" + okunan.length + ")").padEnd(12) + usd(ortanca).padStart(11) +
        " ".repeat(29) +
        "   -%" + nf(etki(ortanca, 20), 2).padStart(5) +
        "    -%" + nf(etki(ortanca, 1000), 1).padStart(5));
    }
    console.log("");
    return okunan;
  }

  await tablo("ARGUS / USDC havuzlari", argusHavuzlari,
    "sordugun token — launchpad degil, Arc'ta islem goren bir coin");
  const lp = await tablo("LAUNCHPAD TOKENLERI (…44 ve …cc hooklu, en likit " + KAC + ")", launchpadler,
    "bizim hookumuzla ayni yetki bitleri — yani ayni yapi");
  await tablo("LAUNCHPAD OLMAYAN USDC HAVUZLARI (en likit 10)", digerleri,
    "koprulenmis/kurumsal tokenler, kiyas icin");

  /* ---- the bar ----------------------------------------------------- */
  console.log("  SUTUNLAR");
  console.log("    'derinlik'    L/sqrtP — kaymayi belirleyen etkin rezerv. Tam");
  console.log("                  aralikli havuzda gercek paraya esit, yogunlastirilmista");
  console.log("                  daha buyuk olabilir.");
  console.log("    'denge'       iki tarafin degeri yakinsa 'esit' — mezuniyette");
  console.log("                  gercek parayla kurulmus havuzun imzasi. 'token' ise");
  console.log("                  icinde para yok, sadece token var.");
  console.log("");
  console.log("  CITA");
  if (lp.length) {
    const sirali = [...lp].sort((a, b) => a - b);
    const ortanca = sirali[Math.floor(sirali.length / 2)];
    const ustCeyrek = sirali[Math.floor(sirali.length * 0.75)];
    console.log("    Arc'in EN LIKIT launchpad tokenlerinde ortanca gercek para  " + usd(ortanca));
    console.log("    ust ceyrek                                                  " + usd(ustCeyrek));
    console.log("    bizim havuz                                                 " + usd(bizim.para));
    console.log("");
    console.log("    Bunlar en likit olanlar; 20.390 tokenin cogu bunlarin cok altinda.");
    console.log("    Yani Arc'ta 'normal' token da derin degil — ama bizim kadar");
    console.log("    sig olmasi da sart degil, ve cita artik tahmin degil.");
  }
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
