"use strict";
/* ===========================================================================
 * olc-zincir-muhasebe.js — STAGE 2: does the three-bucket ledger close the
 *                          gap that was measured?
 *
 *   node scripts/olc-zincir-muhasebe.js
 *
 * THE NUMBER TO BEAT
 *   olc-zincir-engeli.js measured the old vault: $100 reserve, $60 moved
 *   toward another chain, and a holder redeeming at that moment was paid
 *   $2.00 instead of $5.00. The loss tracked the bridged fraction exactly,
 *   which is what proved it was an accounting gap and not a market effect.
 *
 * WHAT HAS TO BE TRUE NOW
 *   Two things that pull against each other, so passing one is not enough:
 *
 *     - the claim must not move when funds go into flight;
 *     - a redeemer during flight must get their FULL entitlement, part in
 *       cash and the rest as a recorded debt, AND the holders who stayed
 *       must see their claim unchanged.
 *
 *   The second is the subtle one: if the debt were not subtracted from the
 *   claim, the stayers' claim would be inflated by money already promised
 *   to somebody who left — the same dollar paid twice.
 *
 * NO CHAIN STATE IS NEEDED
 *   The ledger touches no token and makes no transfer, so this runs against
 *   a real EVM through eth_call with nothing but injected code. That is the
 *   point of keeping the accounting separate from the money.
 * =========================================================================== */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000Ee";
const CAGIRAN = "0x2222222222222222222222222222222222222222";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const { kisaIsim: hataAdi } = require("./revert-coz");

async function rpc(m, p) {
  let b = 2500;
  for (let k = 0; ; k++) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p })
    });
    const j = await r.json();
    if (!j.error) return j.result;
    if (k < 6 && /rate|limit|429/i.test(j.error.message)) { await bekle(b); b *= 2; continue; }
    const e = new Error(j.error.message); e.data = j.error.data; throw e;
  }
}

const T = B("TestCrossChainAccounting");
const iface = new Interface(T.abi);

async function cagir(ad, args) {
  const r = await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x4000000", data: iface.encodeFunctionData(ad, args) },
    "latest", { [H]: { code: T.deployedBytecode } }
  ]);
  return iface.decodeFunctionResult(ad, r);
}

/* The ledger is asset-agnostic, so the figures are plain integers. Six
   decimals is used only so the numbers read as the dollars they stand in
   for and can be compared with the earlier measurement. */
const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HAK = (v) => (Number(v) / 1e36).toExponential(6);
const V = (v) => BigInt(v.toString());

const REZERV = 100_000_000n;                 // $100
const KOPRU = 60_000_000n;                   // $60 goes cross-chain
const DOLASIM = 1_000_000_000n * 10n ** 18n; // 1B tokens

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("ASAMA 2 — UC KOVALI MUHASEBE");
  console.log("  rezerv " + U(REZERV) + ", kopruye giden " + U(KOPRU) + ", dolasim 1 milyar token");
  console.log("");

  /* ---- 1 ---------------------------------------------------------- */
  console.log("1) TRANSFER HAKKI OYNATMAMALI");
  {
    const [s] = await cagir("transferTesti", [REZERV, KOPRU, DOLASIM]);
    const yaz = (ad, d) => console.log("     " + ad.padEnd(12) +
      " musait " + U(d.musait).padStart(9) +
      "  yolda " + U(d.yolda).padStart(9) +
      "  uzak " + U(d.uzak).padStart(9) +
      "   ekonomik " + U(d.ekonomik).padStart(9) +
      "   hak " + HAK(d.hak));
    yaz("once", s.once);
    yaz("yoldayken", s.yoldayken);
    yaz("uzaktayken", s.uzaktayken);

    ok(V(s.yoldayken.musait) === REZERV - KOPRU, "musait tam kopru payi kadar dustu");
    ok(V(s.yoldayken.yolda) === KOPRU, "yolda tam o kadar arttı");
    ok(V(s.yoldayken.ekonomik) === REZERV, "ekonomik rezerv DEGISMEDI", U(s.yoldayken.ekonomik));
    ok(s.hakSabitKaldi === true,
      "HAK UC DURUMDA DA BIREBIR AYNI",
      "eski kasada bu %60 dusuyordu");
    /* And the thing a transfer must not do: make owed-but-unmoved money
       spendable. Only MUSAIT is spendable, so it has to have fallen. */
    ok(V(s.yoldayken.harcanabilir) === REZERV - KOPRU,
      "harcanabilir tutar dustu — yoldaki para odenebilir sayilmiyor",
      U(s.yoldayken.harcanabilir));
  }

  /* ---- 2 ---------------------------------------------------------- */
  console.log("");
  console.log("2) FONLAR YOLDAYKEN IADE");
  {
    /* 80% of supply redeems while 60% of the reserve is in flight, so the
       entitlement ($80) is larger than what is payable ($40). That is the
       case the old vault got wrong. */
    const YAKILAN = (DOLASIM * 80n) / 100n;
    const [s] = await cagir("iadeTesti", [REZERV, KOPRU, DOLASIM, YAKILAN]);

    console.log("     iade eden arzin %80'ini yakiyor, rezervin %60'i yolda");
    console.log("     hak ettigi      " + U(s.hakEttigi));
    console.log("     hemen odenen    " + U(s.hemenOdenen));
    console.log("     borca yazilan   " + U(s.borcaYazilan));
    console.log("     kalanlarin hakki " + HAK(s.once.hak) + "  ->  " + HAK(s.sonra.hak));
    console.log("     sonra: musait " + U(s.sonra.musait) + "  yolda " + U(s.sonra.yolda) +
      "  borc " + U(s.sonra.borc) + "  ekonomik " + U(s.sonra.ekonomik));

    ok(V(s.hakEttigi) === (REZERV * 80n) / 100n,
      "hak ettigi, EKONOMIK rezervin payi — yoldaki dahil", U(s.hakEttigi));
    ok(s.tamOdendi === true,
      "ODENEN + BORC = HAK ETTIGI, kurusu kurusuna",
      U(s.hemenOdenen) + " + " + U(s.borcaYazilan) + " = " + U(s.hakEttigi));
    ok(V(s.borcaYazilan) > 0n, "odenemeyen kisim BORC olarak kayda gecti", U(s.borcaYazilan));
    ok(s.kalanlarinHakkiSabit === true,
      "KALAN SAHIPLERIN HAKKI DEGISMEDI",
      "borc hakdan dusuldugu icin, giden birine vaat edilen para kalanlarin hakkini sismiyor");

    /* The comparison that makes the whole phase worth it. */
    const eskiOdeme = ((REZERV - KOPRU) * 80n) / 100n;   // old vault: share of PRESENT balance
    console.log("");
    console.log("     ESKI KASA bu durumda " + U(eskiOdeme) + " oderdi (yalnizca mevcut bakiyeden pay)");
    console.log("     YENI DEFTER " + U(s.hemenOdenen) + " odiyor + " + U(s.borcaYazilan) + " borclaniyor");
    ok(V(s.hemenOdenen) + V(s.borcaYazilan) > eskiOdeme,
      "iade eden eski kasaya gore kayip yasamiyor",
      "fark " + U(V(s.hemenOdenen) + V(s.borcaYazilan) - eskiOdeme));
  }

  /* ---- 3 ---------------------------------------------------------- */
  console.log("");
  console.log("3) KORUMALAR");
  {
    const [s] = await cagir("korumaTesti", [REZERV, 30_000_000n]);
    ok(s.borcluParaYolaCikamaz === true, "borclu para kopruye GONDERILEMEZ");
    ok(s.borcluParaHarcanamaz === true, "borclu para HARCANAMAZ — geri alim ona dokunamaz");
    ok(s.yoldanFazlaOnaylanamaz === true, "yolda olmayan miktar uzakta onaylanamaz");
    ok(s.uzaktanFazlaDonemez === true, "uzakta olmayan miktar donuse cikamaz");
    ok(s.borctanFazlaKapanamaz === true, "borctan fazlasi kapatilamaz");
  }

  /* ---- 4 ---------------------------------------------------------- */
  console.log("");
  console.log("4) YETKI");
  {
    const [reddedildi] = await cagir("yabanciTesti", [REZERV]);
    ok(reddedildi === true, "defteri sahibi olmayan bir sozlesme YAZAMIYOR");
  }

  /* ---- 5 ---------------------------------------------------------- */
  console.log("");
  console.log("5) TAM TUR — cikti, onaylandi, satildi, dondu");
  {
    const [s] = await cagir("turTesti", [REZERV, KOPRU, DOLASIM]);
    console.log("     bitis: musait " + U(s.bitisMusait) + "  yolda " + U(s.bitisYolda) +
      "  uzak " + U(s.bitisUzak));
    console.log("     hak   " + HAK(s.baslangicHak) + "  ->  " + HAK(s.bitisHak));
    ok(s.kapandi === true,
      "TUR KAPANDI — baslangic durumuna birebir donuldu",
      "yolda ya da uzakta kalan hicbir miktar yok");
  }

  console.log("");
  console.log("  OLCULEN SONUC: eski kasada " + U(KOPRU * 80n / 100n) +
    " kalici kayip olan durumda, yeni defter iade edeni tam odiyor ve");
  console.log("  kalan sahiplerin hakkini oynatmiyor.");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) console.error("  sebep: " + hataAdi(e.data));
  process.exit(1);
});
