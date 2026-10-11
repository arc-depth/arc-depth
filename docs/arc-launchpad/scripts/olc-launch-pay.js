"use strict";
/* ===========================================================================
 * olc-launch-pay.js — what the pool share actually costs the founder, and
 *                     what it actually buys.
 *
 *   node scripts/olc-launch-pay.js
 *   node scripts/olc-launch-pay.js --yatirim 1500
 *
 * THE COMPLAINT, WHICH IS FAIR
 *   The create screen says: deposit $100, recover $69.02. That reads like a
 *   31% fee and nobody would launch against it.
 *
 * WHAT IS ACTUALLY HAPPENING
 *   Not a fee, and no money goes into the pool — the liquidity is
 *   one-sided and v4 asks for tokens only, which was measured before it
 *   was built. Every cent of the deposit, less the 2% fee, reaches the
 *   vault.
 *
 *   What the founder gives up is a CLAIM. The vault backs every token, so
 *   the 30% of supply committed to the pool carries 30% of the vault with
 *   it. Recoverable = vault * (supply the founder keeps / total supply).
 *   At 30% that is 70% of the deposit; at the 5% floor it is 95%.
 *
 *   So the lever already exists and the default was simply set badly. This
 *   prices every setting of it, and prints what the resulting market looks
 *   like next to the cost, because a cheaper pool is also a thinner one
 *   and the founder should see both numbers at once.
 *
 * THE PART NO SETTING FIXES
 *   A $100 launch is a $100 token. Depth is bounded by what the tokens are
 *   worth, so no share of a hundred dollars makes a market that absorbs a
 *   thousand. That is printed too rather than left for the founder to
 *   discover after paying.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, Interface, keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const KOK = path.join(__dirname, "..");
const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-depth.json"), "utf8"));
const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestTekYonluAcici.json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const val = (a, d) => { const i = process.argv.indexOf(a); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const YATIRIM = Number(val("--yatirim", "100"));
const UCRET_PPM = 20000;                 // 2.00%, as deployed
const ARZ = 1_000_000_000;
const SPACING = 60;
const KOSUM = "0x00000000000000000000000000000000000d3b7a";
const Q96 = 2 ** 96;
const SWAPLAR = [5, 20, 100];

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({ hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
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
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 30000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);
const cuzdan = (ort, spot) => (1 - spot / ort) * 100;

const iface = new Interface([
  "function runTick(address pm,int24 acilisTick,int24 alt,int24 ust,uint256 tokenMiktari,uint256 swapTutari) returns (" +
  "(int256 quoteTalep,int256 tokenTalep,uint128 likidite,uint256 artan,uint160 sqrtAcilis," +
  "uint256 odenen,uint256 alinan,uint160 sqrtSonra,uint128 biriktirEklenen))"
]);

(async function main() {
  const ucret = YATIRIM * UCRET_PPM / 1_000_000;
  const kasa = YATIRIM - ucret;
  const taban = kasa / ARZ;                       // dollars per token at the floor
  const tick0 = Math.round(Math.log(1e12 / taban) / Math.log(1.0001) / SPACING) * SPACING;

  console.log("LAUNCH PAYI — havuza verilen arz payi neye mal oluyor, ne aliyor");
  console.log("");
  console.log("  yatirim        " + usd(YATIRIM));
  console.log("  ucret (%2)     -" + usd(ucret));
  console.log("  kasaya giren   " + usd(kasa) + "   <- hepsi. Havuza TEK KURUS gitmiyor;");
  console.log("                 likidite tek yonlu, v4 sadece token istiyor.");
  console.log("  acilis         $" + taban.toExponential(4) + " / token   FDV " + usd(kasa));
  console.log("");
  console.log("  Verilen sey para degil, KASA TALEP HAKKI: kasa her tokeni destekliyor,");
  console.log("  yani havuza konan arz payi kasanin o kadarini da goturuyor.");
  console.log("");
  console.log("  pay    kurucuda kalan    geri alabilecegi    piyasadaki deger   " +
    SWAPLAR.map((d) => (usd(d, 0) + " alim").padStart(10)).join(""));
  console.log("  " + "-".repeat(94));

  for (const bps of [500, 1000, 2000, 3000, 5000, 7000]) {
    const havuzToken = ARZ * bps / 10000;
    const kurucuda = ARZ - havuzToken;
    const geri = kasa * (kurucuda / ARZ);
    const havuzDeger = havuzToken * taban;

    /* The way the launchpad ACTUALLY places it: from the opening price to
       the end of the tick range, token only, no ceiling. An earlier
       version of this used a +100% band, which is denser and made every
       row in the table about four times better than the real thing. */
    const ust = tick0;
    const alt = -887220;                       // MIN_TICK on the 60 grid

    const hucre = [];
    for (const d of SWAPLAR) {
      let r;
      try {
        r = await rpc("eth_call", [
          { from: KOSUM, to: KOSUM, gas: "0x5000000",
            data: iface.encodeFunctionData("runTick", [D.poolManager, tick0, alt, ust,
              BigInt(Math.round(havuzToken)) * 10n ** 18n, BigInt(Math.round(d * 1e6))]) },
          "latest", { [KOSUM]: { code: B.deployedBytecode, nonce: "0x0" } }
        ]);
      } catch (e) { hucre.push("—".padStart(10)); continue; }
      const s = iface.decodeFunctionResult("runTick", r)[0];
      if (BigInt(s[0]) !== 0n) { hucre.push("PARA!".padStart(10)); continue; }
      const odenen = Number(BigInt(s[5])) / 1e6, alinan = Number(BigInt(s[6])) / 1e18;
      if (alinan === 0) { hucre.push("—".padStart(10)); continue; }
      const eksik = odenen < d * 0.999;
      hucre.push(((eksik ? "*" : "") + "-%" + nf(cuzdan(odenen / alinan, taban), 1)).padStart(10));
    }

    console.log("  %" + String(bps / 100).padEnd(5) + nf(kurucuda / 1e6) + "M".padEnd(12) +
      usd(geri).padStart(14) + "   " + usd(havuzDeger).padStart(14) + "     " + hucre.join(""));
  }

  console.log("");
  console.log("  * emir havuzu tasirdi, kismen doldu.");
  console.log("");
  console.log("  OKUMA");
  console.log("    Sol taraf ucuzladikca sag taraf inceliyor — ayni tokenin iki yuzu.");
  console.log("    %5'te kurucu " + usd(kasa * 0.95) + " geri alabiliyor, %30'da " +
    usd(kasa * 0.70) + ".");
  console.log("    Arayuzdeki varsayilan %30'du; bu bir tasarim karari degil, secim");
  console.log("    yapilmamis olmasiydi.");
  console.log("");
  console.log("  HICBIR AYARIN COZMEDIGI SEY");
  console.log("    " + usd(YATIRIM) + "'lik bir launch, " + usd(kasa) + "'lik bir token uretir.");
  console.log("    Derinlik tokenin degeriyle sinirli, yani " + usd(kasa) + "'in hicbir");
  console.log("    yuzdesi " + usd(100) + "'lik emri duzgun karsilayamaz. Bu urunun cazibesi");
  console.log("    derinlik degil, TABAN: kurucunun kendi parasi kasada duruyor ve");
  console.log("    her token onu talep edebiliyor.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
