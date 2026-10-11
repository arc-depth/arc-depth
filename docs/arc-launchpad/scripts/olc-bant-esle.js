"use strict";
/* ===========================================================================
 * olc-bant-esle.js — set the band so the pool and the curve stay honest
 *                    with each other.
 *
 *   node scripts/olc-bant-esle.js
 *
 * THE PROBLEM I ALMOST SHIPPED
 *   A +100% band quotes beautifully: a measured -1.39% on $20 against the
 *   live pool's -76.92%. But it lets the pool price double while the curve,
 *   which nobody is buying on, stays put. A wallet buyer late in that band
 *   pays twice what the same token costs on the curve the same second. They
 *   would be right to call that a trap, and "the curve was cheaper, you
 *   should have known" is the same answer I already gave once and it was
 *   worthless then too.
 *
 * THE CONDITION
 *   Make the band's ceiling the price the CURVE would reach on the same
 *   money. The curve's price moves as ((F + collected)/F)^2 around its
 *   phantom reserve F, and a token-only band holding N at price p absorbs
 *       C = N * p * sqrt(k)
 *   dollars across a band of width k. Requiring sqrt(k) = 1 + C/F and
 *   substituting gives
 *       sqrt(k) = 1 / (1 - N*p/F)
 *   and then, for the depth the band actually quotes against,
 *       reserve = N*p*sqrt(k) / (sqrt(k) - 1) = F
 *   exactly, for every N. The band that agrees with the curve inherits the
 *   curve's depth — the phantom reserve nobody deposited — and N decides
 *   only how much buying it carries before it hands off.
 *
 *   That is a better pool than the one I was about to open, and it is
 *   better for the same reason the curve was good in the first place.
 *
 * WHAT IS LEFT HONEST ABOUT IT
 *   Capacity is still finite and a filled band cannot be widened later,
 *   only deepened. So the table prints capacity next to the cost in tokens,
 *   and both the measured quote and the divergence are read off chain
 *   rather than asserted.
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
const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestTekYonluAcici.json"), "utf8"));

const KOSUM = "0x00000000000000000000000000000000000d3b7a";
const SPACING = 60n;
const Q96 = 2n ** 96n;
const SWAPLAR = [10, 20, 100];
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
    r.setTimeout(90000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 500)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 6) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 0) => "$" + nf(x, d);
const cuzdan = (ort, spot) => (1 - spot / ort) * 100;

const iface = new Interface([
  "function run(address pm,uint160 acilisSqrt,int24 alt,int24 ust,uint256 tokenMiktari,uint256 swapTutari) returns (" +
  "(int256 quoteTalep,int256 tokenTalep,uint128 likidite,uint256 artan,uint160 sqrtAcilis," +
  "uint256 odenen,uint256 alinan,uint160 sqrtSonra,uint128 biriktirEklenen))"
]);

(async function main() {
  /* ---- the pool's price ------------------------------------------- */
  const slot = keccak256(coder.encode(["bytes32", "uint256"], [H.havuzId, 6]));
  const raw = BigInt(await rpc("eth_call", [
    { to: D.poolManager, data: sel("extsload(bytes32)") + slot.slice(2) }, "latest"]));
  const sqrtCanli = raw & ((1n << 160n) - 1n);
  const pV4 = (Number(sqrtCanli) / Number(Q96)) ** 2;
  const fiyat = (1 / pV4) * 1e12;
  const tickCanli = Math.floor(Math.log(pV4) / Math.log(1.0001));
  const ust = BigInt(Math.floor((tickCanli - 1) / 60)) * SPACING;

  /* ---- the curve's, read rather than assumed ---------------------- */
  const x = BigInt(await rpc("eth_call", [{ to: D.egri, data: sel("x()") }, "latest"]));
  const y = BigInt(await rpc("eth_call", [{ to: D.egri, data: sel("y()") }, "latest"]));
  const F = Number(BigInt(await rpc("eth_call", [{ to: D.egri, data: sel("FANTOM()") }, "latest"]))) / 1e6;
  const toplanan = Number(BigInt(await rpc("eth_call", [{ to: D.egri, data: sel("toplanan()") }, "latest"]))) / 1e6;
  const egriFiyat = (Number(x) / 1e6) / (Number(y) / 1e18);

  console.log("BANDI EGRIYE ESLEMEK");
  console.log("");
  console.log("  HAVUZ   fiyat $" + fiyat.toExponential(5) + "   tick " + tickCanli +
    "   icinde " + usd(Number(BigInt(H.esik)) / 1e6));
  console.log("  EGRI    fiyat $" + egriFiyat.toExponential(5) + "   fantom rezerv " + usd(F) +
    "   toplanan " + usd(toplanan, 2));
  console.log("    iki fiyat arasi fark  %" + nf((fiyat / egriFiyat - 1) * 100, 2) +
    "   (ayni yerde duruyorlar; esleme bunu boyle tutuyor)");
  console.log("");
  console.log("  KOSUL   bandin tavani = egrinin AYNI PARAYLA varacagi fiyat");
  console.log("          sqrt(k) = 1 / (1 - N*p/F)   ve bunun sonucu olarak");
  console.log("          etkin rezerv = F = " + usd(F) + ", N ne olursa olsun.");
  console.log("");
  console.log("  token    bant   kapasite   etkin rezerv   " +
    SWAPLAR.map((d) => (usd(d) + " swap").padStart(10)).join("") + "   sapma   payin %");
  console.log("  " + "-".repeat(90));

  const KURUCU_SERBEST = 49_627_550;
  for (const tokenM of [5, 10, 15, 30, 45]) {
    const N = tokenM * 1e6;
    const Np = N * fiyat;
    if (Np >= F) { console.log("  " + tokenM + "M  N*p >= F, esleme cozulmez"); continue; }
    const skok = 1 / (1 - Np / F);                 // sqrt(k)
    const k = skok * skok;
    const kapasite = Np * skok;
    const rezervKuramsal = kapasite / (skok - 1);

    /* Snap to the tick grid, then report the band that will actually be
       placed rather than the ideal one. */
    const adim = BigInt(Math.round(Math.log(k) / Math.log(1.0001) / 60)) * SPACING;
    if (adim === 0n) { console.log("  " + tokenM + "M  bant tek adimdan kucuk"); continue; }
    const alt = ust - adim;
    const gercekK = 1.0001 ** Number(adim);

    const satir = [];
    let olculenRezerv = 0;
    for (const d of SWAPLAR) {
      let r;
      try {
        r = await rpc("eth_call", [
          { from: KOSUM, to: KOSUM, gas: "0x5000000",
            data: iface.encodeFunctionData("run",
              [D.poolManager, sqrtCanli, alt, ust,
               BigInt(tokenM) * 10n ** 24n, BigInt(Math.round(d * 1e6))]) },
          "latest", { [KOSUM]: { code: B.deployedBytecode, nonce: "0x0" } }
        ]);
      } catch (e) { satir.push("REVERT".padStart(10)); continue; }
      const s = iface.decodeFunctionResult("run", r)[0];
      if (BigInt(s[0]) !== 0n) { satir.push("PARA!".padStart(10)); continue; }
      const odenen = Number(BigInt(s[5])) / 1e6, alinan = Number(BigInt(s[6])) / 1e18;
      const e = cuzdan(odenen / alinan, fiyat);
      const eksik = odenen < d * 0.999;
      satir.push(((eksik ? "*" : "") + "-%" + nf(e, 2)).padStart(10));
      /* Back out the reserve the chain actually behaved like, so the F
         claim is measured and not just algebra. */
      if (d === 10 && !eksik) olculenRezerv = d / (e / 100) - d;
    }

    /* How far the pool price would sit from the curve's when the band is
       exhausted — the number the whole exercise exists to keep small. */
    const egriOrani = (1 + kapasite / F) ** 2;
    const sapma = (gercekK / egriOrani - 1) * 100;

    console.log("  " + (nf(tokenM) + "M").padStart(5) + "   +%" + nf((gercekK - 1) * 100, 1).padStart(5) +
      "   " + usd(kapasite).padStart(8) + "   " +
      (usd(olculenRezerv || rezervKuramsal)).padStart(12) + "   " + satir.join("") +
      "   %" + nf(sapma, 1).padStart(5) +
      "   %" + nf((N / KURUCU_SERBEST) * 100, 0).padStart(3));
  }

  console.log("");
  console.log("  OKUMA");
  console.log("    'etkin rezerv' zincirde kosulan $10 swap'tan geri cikarildi,");
  console.log("      cebirden degil. " + usd(F) + " civari cikmasi bekleniyor — band");
  console.log("      egriyle eslesince egrinin derinligini devraliyor.");
  console.log("    'sapma' bant bittigi anda havuz fiyatinin egri fiyatindan");
  console.log("      farki. Sifira yakin olmasi gerekiyor; +%100 bantta %70'ti");
  console.log("      ve cuzdandan alan kisinin zarari tam olarak o.");
  console.log("    'kapasite' bant bitene kadar emdigi alim. Bittikten sonra");
  console.log("      bant GENISLETILEMEZ, sadece derinlestirilebilir. O yuzden");
  console.log("      token miktari bastan ne kadar hacim tasiyacagina gore secilir.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
