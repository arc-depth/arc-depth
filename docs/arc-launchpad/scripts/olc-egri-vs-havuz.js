"use strict";
/* ===========================================================================
 * olc-egri-vs-havuz.js — the curve already solves the slippage, for free.
 *
 *   node scripts/olc-egri-vs-havuz.js
 *
 * THE POINT
 *   Slippage is trade size over the money the venue prices against. A pool
 *   prices against the money actually in it, which is $6. A curve prices
 *   against its phantom reserve plus what it has collected, and the
 *   phantom part is $7,500 that nobody deposited.
 *
 *   Same formula, 1,250 times the denominator. That is what the phantom
 *   reserve was for and it is already deployed; nothing needs funding.
 *
 * THE PART IT DOES NOT SOLVE, AND WHY NOTHING CAN
 *   What a seller receives is bounded by money that was actually put in —
 *   in the pool by its reserves, in the curve by what it collected. No
 *   venue can pay out money that was never deposited. That is conservation
 *   rather than a design flaw, and it is the same for both.
 *
 *   So: buying is cheap on the curve and ruinous in the pool. Selling is
 *   bounded in both. Whoever wants to buy should be sent to the curve, and
 *   the $6 pool should be a footnote.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const coder = AbiCoder.defaultAbiCoder();
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-depth.json"), "utf8"));
const H = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-havuz.json"), "utf8"));
const sel = (s) => id(s).slice(0, 10);

function hamIstek(method, params) {
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
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await hamIstek(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);

(async function main() {
  const oku = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);

  /* ---- the curve, read from chain ------------------------------- */
  const x = BigInt(await oku(D.egri, sel("x()")));
  const fantom = BigInt(await oku(D.egri, sel("FANTOM()")));
  const toplanan = BigInt(await oku(D.egri, sel("toplanan()")));
  const esik = BigInt(await oku(D.egri, sel("ESIK()")));
  const ucretPpm = BigInt(await oku(D.egri, sel("UCRET_PPM()")));

  const X = Number(x) / 1e6;                 // the curve prices against this
  const FANT = Number(fantom) / 1e6;
  const TOP = Number(toplanan) / 1e6;

  /* ---- the pool ------------------------------------------------- */
  const U = Number(BigInt(H.esik)) / 1e6;
  const T = Number(BigInt(H.havuzToken)) / 1e18;

  console.log("AYNI FORMUL, FARKLI BOLEN");
  console.log("");
  console.log("  Kayma = islem / fiyatlamaya esas olan para.");
  console.log("");
  console.log("  HAVUZ      bolen = icindeki gercek para        " + usd(U));
  console.log("  EGRI       bolen = fantom + toplanan           " + usd(X));
  console.log("             bunun " + usd(FANT) + "'i FANTOM — kimse yatirmadi");
  console.log("             " + usd(TOP) + "'i gercek, alicilardan");
  console.log("");
  console.log("  Oran: egri havuzdan " + nf(X / U) + " KAT derin. Bedeli sifir.");
  console.log("");

  /* Both venues move price by ((d+denominator)/denominator)^2, so the
     average price paid follows from the same two lines. */
  const kayma = (bolen, d) => (Math.pow(1 + d / bolen, 1) - 1) * 100;

  console.log("  ALIM KAYMASI — gerceklesen fiyat / anlik fiyat");
  console.log("");
  console.log("    odenen       HAVUZDA        EGRIDE");
  for (const d of [1, 10, 100, 500, 1000, 5000]) {
    const h = kayma(U, d), e = kayma(X, d);
    console.log("    " + usd(d, 0).padStart(8) + "   %" + nf(h, 1).padStart(11) +
      "   %" + nf(e, 2).padStart(10) + (d >= 100 && e < 20 ? "   <- calisir" : ""));
  }
  console.log("");
  console.log("  Egride $100'luk alim %" + nf(kayma(X, 100), 2) +
    " kayma. Havuzda %" + nf(kayma(U, 100), 0) + ".");
  console.log("  Para yatirmadan, hatasiz, tek havuzla: egri bunu zaten yapiyor.");

  /* ---- what the curve actually delivers ------------------------- */
  console.log("");
  console.log("  EGRIDEN GERCEK KOTALAR  (zincirden, ucret dusulmus)");
  console.log("    odenen      alinan DEPTH      ortalama fiyat");
  const anlik = X / (Number(BigInt(await oku(D.egri, sel("y()")))) / 1e18);
  for (const d of [1, 10, 100, 1000]) {
    const giris = BigInt(d) * 10n ** 6n;
    const net = giris - (giris * ucretPpm) / 1_000_000n;
    const q = BigInt(await oku(D.egri,
      sel("alimKotasi(uint256)") + coder.encode(["uint256"], [net]).slice(2)));
    const adet = Number(q) / 1e18;
    console.log("    " + usd(d, 0).padStart(8) + "   " + nf(adet).padStart(14) +
      "   $" + (d / adet).toExponential(3).padStart(12) +
      "   anlik $" + anlik.toExponential(3));
  }

  console.log("");
  console.log("COZEMEDIGI SEY, VE NEDEN HICBIR SEY COZEMEZ");
  console.log("");
  console.log("  Bir satici ancak gercekten yatirilmis parayi alabilir.");
  console.log("    havuzun odeyebilecegi     " + usd(U));
  console.log("    egrinin odeyebilecegi     " + usd(TOP) + "   (fantom cikmaz)");
  console.log("    toplam                    " + usd(U + TOP));
  console.log("");
  console.log("  Fantom rezerv fiyati dusuk kaymayla tutuyor ama CEKILEMEZ —");
  console.log("  cekilebilseydi var olmayan para odenmis olurdu. Yani:");
  console.log("");
  console.log("    ALIM   egride ucuz, bedava, bugun hazir");
  console.log("    SATIS  her iki yerde de yatirilan parayla sinirli");
  console.log("");
  console.log("  Ikincisi korunum yasasi, tasarim hatasi degil. Hicbir mekanizma");
  console.log("  hic yatirilmamis parayi odeyemez.");

  console.log("");
  console.log("SONUC");
  console.log("  Alici egriye yonlendirilmeli, " + usd(U) + "'lik havuza degil.");
  console.log("  Egri " + usd(Number(esik) / 1e6, 0) + " topladiginda kendi havuzunu");
  console.log("  o derinlikte aciyor ve mesele tamamen kapaniyor — o parayi da");
  console.log("  biz degil alicilar koyuyor.");
  console.log("");
  console.log("  Yani: para yatirmaya gerek yok, ikinci bir havuza gerek yok,");
  console.log("  yapilacak tek sey alimi dogru yere gondermek.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
