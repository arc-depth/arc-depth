"use strict";
/* Does the DEPLOYED Pazar work — not the compiled copy, the mainnet
 * address.
 *
 * WHY A SECOND MEASUREMENT
 *   `olc-pazar.js` measures a copy the harness deploys itself: "is the
 *   compiled code correct". This script calls the mainnet address: "is the
 *   code ON CHAIN correct". They are not the same question. In this project
 *   a deployed hook once pointed at the wrong vault while the compiled code
 *   was flawless — nothing reverted, and the money would have accumulated
 *   somewhere unreachable.
 *
 * ONE CALL, ZERO SPEND
 *   The registration, the product publishing, the purchase, the closing and
 *   the rating all happen inside a single `eth_call`. The state changes are
 *   discarded when the call ends: nothing is written to the chain, not a
 *   cent is spent, and the mainnet product count does not change.
 *
 * THE EXPECTED SHARE COMES FROM THE SPEC
 *   Reading the 20% from the contract's own constant and verifying against
 *   it would amount to saying "the contract does what it says" — a sentence
 *   that holds for any rate. The rate is written here once and the payment
 *   is measured against it.
 */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000E2";
const USDC = "0x3600000000000000000000000000000000000000";

/* 20% — the agreed rate. Not read from the contract, measured AGAINST it. */

const SARTNAME_PLATFORM_PPM = 200_000n;

const B = (n) => JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8"));

async function rpc(m, p) {
  let b = 2500;
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(RPC, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p })
      });
      const j = await r.json();
      if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
      return j.result;
    } catch (e) {
      if (k >= 6 || !/rate|limit|429|timeout|ECONN|fetch/i.test(String(e.message))) throw e;
      await new Promise((r2) => setTimeout(r2, b)); b = Math.min(b * 2, 20000);
    }
  }
}

const usd = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { maximumFractionDigits: 6 });

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => {
    if (!iyi) kotu++;
    console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
  };

  const kayitYolu = path.join(KOK, "dagitim-pazar.json");
  if (!fs.existsSync(kayitYolu)) {
    console.log("Pazar kaydi yok (dagitim-pazar.json) — once dagitilmali.");
    process.exit(75);
  }
  const K = JSON.parse(fs.readFileSync(kayitYolu, "utf8"));
  const PAZAR = K.arc.pazar;

  console.log("PAZAR — ANA AGDAKI adres, eth_call icinde, harcama yok");
  console.log("");
  console.log("  pazar  " + PAZAR);

  /* Is there really code on chain — without it everything else is
     meaningless. */

  const kod = await rpc("eth_getCode", [PAZAR, "latest"]);
  ok(!!kod && kod !== "0x", "ADRESTE KOD VAR",
    ((String(kod).length - 2) / 2).toLocaleString("en") + " bayt");
  if (!kod || kod === "0x") { process.exit(1); }

  const T = B("TestPazarCanli");
  const iface = new Interface(T.abi);

  /* The harness needs USDC to pay with. On Arc, USDC IS the gas token, so a
     native balance override reads back as the ERC20 balanceOf — measured,
     the ratio is exactly 1e12. */
  const YERLI = (10n ** 6n) * (10n ** 18n);          // 1.000.000 USDC

  const r = await rpc("eth_call", [
    { from: K.arc.isletme, to: H, gas: "0x3000000",
      data: iface.encodeFunctionData("run", [PAZAR, USDC]) },
    "latest", {
      [H]: { code: T.deployedBytecode, balance: "0x" + YERLI.toString(16) }
    }
  ]);
  const [s] = iface.decodeFunctionResult("run", r);

  console.log("  alici  " + s.alici);
  console.log("");

  console.log("  1) KAYIT VE YAYIN — dagitilmis sozlesme uzerinde");
  ok(s.kayitOldu === true, "izinsiz kaydolundu",
    "ana agdaki sozlesme onay kapisi istemiyor");
  ok(BigInt(s.sonrakiUrunSayisi) === BigInt(s.oncekiUrunSayisi) + 1n,
    "URUN EKLENDI",
    "sayi " + s.oncekiUrunSayisi + " -> " + s.sonrakiUrunSayisi +
      " (cagri icinde; zincirde " + s.oncekiUrunSayisi + " olarak kaliyor)");
  ok(s.yabanciGuncelleRed === true,
    "YABANCI baskasinin urununu GUNCELLEYEMEDI",
    "fiyati degistirebilen biri baskasinin musterisini fiyatlandirabilirdi");

  console.log("");
  console.log("  2) BOLUSME — sartnameye gore");
  const beklenenPlatform = (BigInt(s.fiyat) * SARTNAME_PLATFORM_PPM) / 1_000_000n;
  const beklenenDev = BigInt(s.fiyat) - beklenenPlatform;
  console.log("     fiyat            " + usd(s.fiyat) + "   (tam bolunmuyor)");
  console.log("     gelistirici aldi " + usd(s.devArtis) + "   beklenen " + usd(beklenenDev));
  console.log("     isletme aldi     " + usd(s.isletmeArtis) + "   beklenen " + usd(beklenenPlatform));
  console.log("     alicidan cikan   " + usd(s.aliciDusus));

  ok(BigInt(s.devArtis) === beklenenDev, "GELISTIRICI PAYI %80", usd(s.devArtis));
  ok(BigInt(s.isletmeArtis) === beklenenPlatform, "PLATFORM PAYI %20", usd(s.isletmeArtis));
  ok(BigInt(s.zincirPpm) === SARTNAME_PLATFORM_PPM,
    "ZINCIRDEKI SABIT DE %20",
    "PLATFORM_PPM = " + s.zincirPpm + "; bu sav olmasa ustteki ikisi her " +
      "oran icin gecerdi");
  ok(BigInt(s.aliciDusus) === BigInt(s.fiyat),
    "ALICIDAN CIKAN = FIYAT",
    "arada kaybolan ya da eklenen bir kurus yok");
  ok(BigInt(s.devArtis) + BigInt(s.isletmeArtis) === BigInt(s.fiyat),
    "IKI PAYIN TOPLAMI FIYATA ESIT", "yuvarlama kalanini kimse yutmuyor");
  /* CROSS-MULTIPLY, DO NOT DIVIDE
       The first form said dev * 1e6 / fiyat > 800_000. Integer division
       truncates the ratio downward: at a price of 77,000,007 the developer
       receives ABOVE the exact 80% of 61,600,005.6 (that is, 61,600,006),
       but the division yields 800,000 and "> 800,000" comes out false. The
       assertion went red while the contract behaved correctly.

       Cross-multiplication does not truncate: dev * 1e6 >= fiyat * 800,000. */
  ok(beklenenDev * 1_000_000n >= BigInt(s.fiyat) * 800_000n,
    "YUVARLAMA GELISTIRICININ LEHINE",
    "gelistirici tam %80 ya da uzeri aliyor — bolunmeyen kurus platforma " +
      "degil ona kaliyor");

  console.log("");
  console.log("  3) SOZLESMEDE PARA KALMADI");
  ok(BigInt(s.pazardaKalan) === 0n,
    "ANA AGDAKI SOZLESMENIN BAKIYESI SIFIR",
    "odeme ve bolusme ayni islemde; cekilecek bir bakiye olmadigi icin " +
      "withdraw/sweep/rescue de yok");

  console.log("");
  console.log("  4) LISANS VE KAPATMA");
  ok(s.lisansli === true, "odeyen lisans aldi");
  ok(BigInt(s.bitis) === (2n ** 64n - 1n),
    "BIR DEFALIK ALIM SURESIZ", "bitis uint64 tavani");
  ok(s.kapaliSatisRed === true, "KAPALI urun SATILAMADI");
  ok(s.kapandiktanSonraLisansDuruyor === true,
    "KAPATMAK SATILMIS LISANSI IPTAL ETMIYOR",
    "parasini odemis birinin urununu geri almak olurdu");

  console.log("");
  console.log("  5) ITIBAR");
  ok(s.lisanssizPuanRed === true, "LISANSI OLMAYAN PUANLAYAMADI",
    "itibar ucretsiz bir oy sandigi degil");

  console.log("");
  console.log("  6) DEFTER");
  console.log("     gelistirici kazanci +" + usd(s.devKazanciArtis));
  console.log("     platform kazanci    +" + usd(s.platformKazanciArtis));
  ok(BigInt(s.devKazanciArtis) === beklenenDev &&
     BigInt(s.platformKazanciArtis) === beklenenPlatform,
    "DEFTER GERCEKTEN TRANSFER EDILENLE AYNI",
    "defterin transferden farkli sayması, panolarin yanlis rakam " +
      "gostermesi demek olurdu");

  console.log("");
  console.log(kotu === 0
    ? "  GECTI — ANA AGDAKI sozlesme para boluyor, tutmuyor ve REDDEDIYOR."
    : "  BASARISIZ — " + kotu + " sorun.");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.log("HATA: " + e.message);
  if (e.data) console.log("data: " + String(e.data).slice(0, 200));
  process.exit(1);
});
