"use strict";
/* ===========================================================================
 * olc-kurucu-ilk-alim.js — the founder's first buy, from the contract's own
 *                          constants
 *
 *   node scripts/olc-kurucu-ilk-alim.js
 *
 * WHAT IT COMPUTES
 *   Under the new rule the founder pays in 100-500 USDC, a 2% protocol fee
 *   is taken, and THE WHOLE REMAINDER buys tokens at the opening price.
 *   This script works out that token amount and the pool's real state after
 *   the launch.
 *
 * WHERE THE NUMBERS COME FROM
 *   None of them was written by hand: ACILIS_MCAP, SUPPLY and
 *   LAUNCH_UCRET_PPM are read from the launchpad on chain. Written by hand,
 *   the calculation would go silently wrong the moment a constant changed.
 *
 * THE FORMULA IS ALREADY IN THE CONTRACT
 *   The founder's tokens = net x SUPPLY / ACILIS_MCAP, which is exactly the
 *   existing `havuzToken(likidite)` function. There is no need to write a
 *   new price formula, and writing one would be wrong: a second formula
 *   means a second price that can drift from the first.
 *
 * WHY THERE IS NO SLIPPAGE
 *   The buy is not a swap. The founder's tokens go straight to their
 *   wallet, the net USDC is placed in the pool as a real bid, and the pool
 *   is started at the opening price. Since the price never moves there is
 *   no slippage — and the rule that "the price will not be reset to the
 *   start" holds by itself, because there is no movement to reset.
 *
 * NO VALUE IS CREATED
 *   At the opening price the whole supply is worth ACILIS_MCAP. The founder
 *   gets exactly what they paid net: pay 98 USDC and you get 2.8% of the
 *   supply, which at the opening price is worth exactly 98 USDC. There are
 *   no free tokens, and this script's last assertion measures that.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let no = 1;
async function rpc(yontem, parametreler) {
  for (let d = 0; d < 8; d++) {
    if (d > 0) await bekle(1200 * d);
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler }),
      signal: AbortSignal.timeout(45_000)
    }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
    if (r.result !== undefined) return r.result;
    const m = (r.error && r.error.message) || "";
    if (!/rate limit|too many|timeout|503|502|ECONNRESET|fetch failed/i.test(m)) {
      throw new Error(m);
    }
  }
  throw new Error("uc nokta cevap vermedi");
}

const B = (ad) => JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));
const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const T = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 0 });

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

/* The new rule's own bounds, which are the only numbers in this file that
   are not read from the chain — because they are the change being made. */
const ASGARI_ILK_ALIM = 100_000_000n;     // 100 USDC
const AZAMI_ILK_ALIM = 500_000_000n;      // 500 USDC
const ASGARI_TEMINAT_YENI = 20_000_000n;  // 20 USDC, separate from the buy

(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse.json"), "utf8"));
  const LP = D.arc.launchpad;
  const lI = new Interface(B("EgriLaunchpad").abi);
  const oku = async (fn) => {
    const ham = await rpc("eth_call", [
      { to: LP, data: lI.encodeFunctionData(fn, []) }, "latest"]);
    return BigInt(lI.decodeFunctionResult(fn, ham)[0]);
  };

  console.log("KURUCUNUN ILK ALIMI — sabitler zincirden");
  console.log("  launchpad  " + LP);
  console.log("");

  const ACILIS = await oku("ACILIS_MCAP");
  await bekle(200);
  const SUPPLY = await oku("SUPPLY");
  await bekle(200);
  const UCRET = await oku("LAUNCH_UCRET_PPM");
  await bekle(200);
  const ESKI_ASGARI = await oku("ASGARI_ODEME");
  await bekle(200);
  const ESKI_TEMINAT = await oku("ASGARI_TEMINAT");

  console.log("  ACILIS_MCAP        " + U(ACILIS));
  console.log("  SUPPLY             " + T(SUPPLY) + " token");
  console.log("  LAUNCH_UCRET_PPM   %" + (Number(UCRET) / 10_000).toFixed(2));
  console.log("  (mevcut) ASGARI_ODEME   " + U(ESKI_ASGARI));
  console.log("  (mevcut) ASGARI_TEMINAT " + U(ESKI_TEMINAT));
  console.log("");

  /* The opening price, in raw units on both sides. Kept raw on purpose:
     the quote has six decimals and the token eighteen, and every scaling
     constant written between them is a place for a 10^12 error — this
     project has already paid for that one twice. */
  console.log("  ACILIS FIYATI");
  console.log("     " + U(ACILIS) + " / " + T(SUPPLY) + " token");
  console.log("     = $" + (Number(ACILIS) / 1e6 / (Number(SUPPLY) / 1e18)).toFixed(9) + " / token");
  console.log("");

  /* tokens = net * SUPPLY / ACILIS_MCAP — the contract's own havuzToken(). */
  const jetonlar = (net) => (net * SUPPLY) / ACILIS;

  console.log("  KURUCUNUN ALACAGI TOKEN  (net = odeme - %" +
    (Number(UCRET) / 10_000).toFixed(0) + ")");
  console.log("");
  console.log("     odeme      ucret     net        alinan token          arz payi   merdivene kalan");
  console.log("     " + "-".repeat(86));

  const satirlar = [];
  for (const odeme of [ASGARI_ILK_ALIM, 200_000_000n, 300_000_000n, 400_000_000n, AZAMI_ILK_ALIM]) {
    const ucret = (odeme * UCRET) / 1_000_000n;
    const net = odeme - ucret;
    const jeton = jetonlar(net);
    const kalan = SUPPLY - jeton;
    const payBps = (jeton * 10_000n) / SUPPLY;
    satirlar.push({ odeme, ucret, net, jeton, kalan, payBps });
    console.log("     " + U(odeme).padStart(8) + U(ucret).padStart(10) +
      U(net).padStart(10) + "   " + T(jeton).padStart(13) +
      "  %" + (Number(payBps) / 100).toFixed(2).padStart(6) +
      "   " + T(kalan).padStart(13));
  }

  /* ---- the invariant that says nobody was given anything ---------- */
  console.log("");
  console.log("  BEDAVA TOKEN VERILMEDI MI");
  for (const r of satirlar) {
    /* What the founder's share is worth AT THE OPENING PRICE must equal
       what they paid net of the fee. Checked per row rather than once:
       integer division rounds, and a rounding that always favoured the
       founder would be a slow leak rather than a visible gift. */
    const degeri = (r.jeton * ACILIS) / SUPPLY;
    const fark = degeri > r.net ? degeri - r.net : r.net - degeri;
    ok(fark <= 1n,
      U(r.odeme) + " odeyen, acilis fiyatinda tam net odedigi kadar aliyor",
      U(degeri) + " vs " + U(r.net) + "   fark " + fark + " ham birim");
  }

  /* ---- what the pool looks like the moment the launch ends -------- */
  console.log("");
  console.log("  LAUNCH BITTIGINDE HAVUZ");
  console.log("");
  for (const r of [satirlar[0], satirlar[satirlar.length - 1]]) {
    console.log("     " + U(r.odeme) + " odeme:");
    console.log("       gercek USDC teklifi   " + U(r.net) +
      "   (kurucunun neti, fiyatin ALTINA konuyor)");
    console.log("       token merdiveni       " + T(r.kalan) +
      " token   (fiyatin USTUNE konuyor)");
    console.log("       kurucunun cuzdaninda  " + T(r.jeton) + " token");
    console.log("       baslangic fiyati      $" +
      (Number(ACILIS) / 1e6 / (Number(SUPPLY) / 1e18)).toFixed(9) +
      "   (hareket etmedi, o yuzden kayma yok)");
    console.log("       baslangic mcap        " + U(ACILIS));
    console.log("");
  }

  /* The ladder must still hold most of the supply at the maximum
     payment, or the maximum is doing something other than funding a
     bid: it is handing the market to one wallet. */
  const enBuyuk = satirlar[satirlar.length - 1];
  ok(enBuyuk.payBps < 2_000n,
    "AZAMI ODEMEDE BILE KURUCU ARZIN BESTE BIRINDEN AZINI ALIYOR",
    "%" + (Number(enBuyuk.payBps) / 100).toFixed(2) + " — ustune cikarsa " +
      "azami odeme bir teklif fonlamaktan cikip piyasayi tek cuzdana " +
      "vermeye donusur");

  /* Total cost to launch, which is the number a creator actually feels. */
  console.log("  LAUNCH YAPANIN TOPLAM MALIYETI");
  console.log("     asgari   " + U(ASGARI_ILK_ALIM) + " alim + " +
    U(ASGARI_TEMINAT_YENI) + " teminat = " +
    U(ASGARI_ILK_ALIM + ASGARI_TEMINAT_YENI));
  console.log("     azami    " + U(AZAMI_ILK_ALIM) + " alim + " +
    U(ASGARI_TEMINAT_YENI) + " teminat = " +
    U(AZAMI_ILK_ALIM + ASGARI_TEMINAT_YENI) + "   (teminat ustu serbest)");
  console.log("");
  console.log("     Bunun " + U((ASGARI_ILK_ALIM * UCRET) / 1_000_000n) +
    "-" + U((AZAMI_ILK_ALIM * UCRET) / 1_000_000n) + " kadari ucret ve geri gelmez.");
  console.log("     Geri kalan alim tutari TOKENE donuyor, yani kurucuda kaliyor.");
  console.log("     Teminat kasaya gidiyor ve TOKEN SAHIPLERININ olur, kurucunun degil.");

  /* ---- what changed against the deployed rule ------------------- */
  console.log("");
  console.log("  MEVCUT KURALDAN FARKI");
  console.log("     mevcut: odeme " + U(ESKI_ASGARI) + "+, ucret sonrasi KALAN HAVUZA");
  console.log("             likidite olur, kurucuya SIFIR token, ilk alim istege bagli");
  console.log("             ve snipe vergisine tabi");
  console.log("     yeni:   alim " + U(ASGARI_ILK_ALIM) + "-" + U(AZAMI_ILK_ALIM) +
    ", ucret sonrasi KALANIN TAMAMI");
  console.log("             kurucuya TOKEN olur, teminat AYRI, ilk alim snipe'tan MUAF");
  console.log("");
  console.log("     Degisen sey kurucunun ne aldigi: sifir token yerine arzin");
  console.log("     %" + (Number(satirlar[0].payBps) / 100).toFixed(2) + "-%" +
    (Number(enBuyuk.payBps) / 100).toFixed(2) + " kadari. Bedava degil — acilis");
  console.log("     fiyatindan tam parasinin karsiligi.");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
