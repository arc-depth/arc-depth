"use strict";
/* ===========================================================================
 * olc-asenkron-iade.js — STAGE 8: asynchronous redemption and buyback
 *                        accounting
 *
 *   node scripts/olc-asenkron-iade.js
 *
 * THREE THINGS MEASURED, ALL AT ONCE
 *   Somebody claims their share while part of the reserve is on another
 *   chain. Three things have to be true together, and any protocol can get
 *   two of them right:
 *
 *     1. the redeemer is not underpaid — the whole amount is earned, and
 *        the unpaid part becomes a CLAIM, not a loss;
 *     2. the REMAINING holders' claim does not move — the redeemer leaving
 *        must not raise it either, and the generous direction is the one
 *        where the mistake is easy;
 *     3. the buyback cannot spend money that is owed.
 *
 *   The old vault clearly lost the first: measured, with 60% on the bridge
 *   the redeemer received $2.00 instead of $5.00 — not late, SHORT, and
 *   permanently.
 *
 * WHY EQUAL CLAIMS ARE NOT A HOPE
 *   w = d*E/D is written at the moment the debt is burned, so afterwards
 *   (E-w)/(D-d) = E/D — exactly. Integer truncation rounds w down, so the
 *   remainder goes to the remaining holders, which is the safe direction.
 *   Below, this stands as an ASSERTION and not as a comment.
 * =========================================================================== */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000A8";
const CAGIRAN = "0x2222222222222222222222222222222222222222";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const { kisaIsim: hataAdi, yaz: revertYaz } = require("./revert-coz");

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

const T = B("TestAsenkronIade");
const iface = new Interface(T.abi);

async function cagir(ad, args) {
  await bekle(300);
  const r = await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x8000000", data: iface.encodeFunctionData(ad, args) },
    "latest",
    { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 23n).toString(16) } }
  ]);
  return iface.decodeFunctionResult(ad, r);
}

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const V = (v) => BigInt(v.toString());
/* The claim is scaled by 1e36 and the token has 18 decimals, so a claim of
   1e19 means 1e19/1e36 quote-units per 1e-18 token = $1e-5 per whole token.
   Printed as dollars per million tokens, which is the only scale at which a
   memecoin's claim is legible. */
const HM = (v) => "$" + (Number(BigInt(v.toString()) * 10n ** 24n / 10n ** 36n) / 1e6)
  .toLocaleString("en", { maximumFractionDigits: 4 }) + " / 1M jeton";

function tablo(ad, s) {
  console.log("     " + ad.padEnd(22) +
    " musait " + U(s.musait).padStart(12) +
    "  yolda " + U(s.yolda).padStart(12) +
    "  borc " + U(s.borc).padStart(11) +
    "  EKONOMIK " + U(s.ekonomik).padStart(12));
}

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  const ARZ = 10n ** 27n;          // 1 milyar jeton, 18 ondalik
  const FON = 10_000_000_000n;     // $10.000 teminat
  const ABROAD = 6_000_000_000n;   // $6.000 baska zincire
  const YAK = 5n * 10n ** 26n;     // arzin %50'si

  console.log("ASAMA 8 — ASENKRON IADE VE GERI ALIM MUHASEBESI");
  console.log("");

  /* ================================================================== */
  console.log("1) KUYRUKLU IADE — para kismen baska zincirde");
  {
    const [s] = await cagir("kuyrukRun", [ARZ, FON, ABROAD, YAK]);

    tablo("baslangic", s.baslangic);
    tablo("yollandiktan sonra", s.yollandiktanSonra);
    console.log("");
    console.log("     hak edilen   " + U(s.hakEdilen));
    console.log("     hemen odenen " + U(s.hemenOdenen) + "   kuyruga " + U(s.kuyruga));
    tablo("iade sonrasi", s.iadeSonrasi);
    console.log("");
    console.log("     HAK  " + HM(s.yollandiktanSonra.hak) + "  ->  " + HM(s.iadeSonrasi.hak));

    /* The entitlement is the full share of the economic reserve, not of
       the local balance. That difference IS the old bug. */
    const beklenenHak = (V(s.yollandiktanSonra.ekonomik) * YAK) / ARZ;
    ok(V(s.hakEdilen) === beklenenHak,
      "IADECI EKONOMIK REZERVIN TAM PAYINI HAK ETTI",
      U(s.hakEdilen) + " — yerel bakiyenin degil");

    const eskiKasaOderdi = (V(s.yollandiktanSonra.musait) * YAK) / ARZ;
    console.log("       (eski kasa bu anda " + U(eskiKasaOderdi) + " oderdi ve gerisi yanardi)");

    ok(V(s.hemenOdenen) === V(s.yollandiktanSonra.harcanabilir),
      "ARC'TA OLAN NE VARSA HEMEN ODENDI", U(s.hemenOdenen));
    ok(V(s.iadeciAldi) === V(s.hemenOdenen),
      "ODENEN GERCEKTEN IADECININ CUZDANINA GITTI", U(s.iadeciAldi));
    ok(V(s.kuyruga) === V(s.hakEdilen) - V(s.hemenOdenen),
      "GERIYE KALAN KAYIP DEGIL ALACAK", U(s.kuyruga));
    ok(Number(s.bekleyenAdet) === 1 && V(s.bekleyenToplam) === V(s.kuyruga),
      "kuyrukta tam bir talep, tam o tutarda", U(s.bekleyenToplam));

    /* The headline. */
    ok(V(s.iadeSonrasi.hak) === V(s.yollandiktanSonra.hak),
      "KALANLARIN HAKKI BIREBIR AYNI KALDI",
      "ne dustu ne de iadecinin cikisiyla sisti");

    ok(V(s.iadeSonrasi.borc) === V(s.kuyruga),
      "borc defterde bekleyen talep kadar", U(s.iadeSonrasi.borc));
    ok(V(s.iadeSonrasi.harcanabilir) === 0n,
      "HARCANABILIR SIFIR — ortada borc varken hicbir sey serbest degil");

    ok(s.geriAlimReddedildi === true,
      "GERI ALIM BORCLU PARAYI HARCAYAMADI",
      s.geriAlimReddedildi ? hataAdi(s.geriAlimSebep) : "GECTI — bu bir delik");

    console.log("");
    tablo("eve donduken", s.eveDonduktenSonra);
    console.log("     kuyrukta odenen " + U(s.kuyruktaOdenen));
    tablo("kuyruk odendikten", s.kuyrukOdendikten);
    console.log("     HAK  " + HM(s.eveDonduktenSonra.hak) + "  ->  " + HM(s.kuyrukOdendikten.hak));

    ok(V(s.kuyruktaOdenen) === V(s.kuyruga),
      "PARA DONUNCE TALEP TAM KAPANDI", U(s.kuyruktaOdenen));
    ok(V(s.iadeciToplam) === V(s.hakEdilen),
      "IADECI SONUNDA TAM HAKKINI ALDI",
      U(s.iadeciToplam) + " = " + U(s.hakEdilen) + " — eksik odeme yok, sadece gecikme");
    ok(V(s.kuyrukOdendikten.borc) === 0n, "borc kapandi");
    ok(V(s.kuyrukOdendikten.hak) === V(s.yollandiktanSonra.hak),
      "HAK BASTAN SONA HIC OYNAMADI",
      "dort durum degisikligi boyunca ayni sayi");
  }

  /* ================================================================== */
  console.log("");
  console.log("2) SIRA — onceki iadeci atlanamiyor");
  {
    const YAK2 = 2n * 10n ** 26n;   // her biri arzin %20'si
    const [s] = await cagir("fifoRun", [ARZ, FON, FON, YAK2]);

    console.log("     birinci  hemen " + U(s.birinciHemen) + "  kuyruk " + U(s.birinciKuyruk));
    console.log("     ikinci   hemen " + U(s.ikinciHemen) + "  kuyruk " + U(s.ikinciKuyruk));
    console.log("     kuyruk   " + s.adet + " talep, toplam " + U(s.toplam));
    console.log("");
    console.log("     birinci talep kadar para dondu: " + U(s.kismiOdenen) + " odendi");
    console.log("     bastaki talep kalan  " + U(s.basTalepKalan));
    console.log("     ikinci talep kalan   " + U(s.ikinciTalepKalan));
    console.log("     sira basi            " + s.siraBasi);

    ok(V(s.birinciHemen) === 0n && V(s.ikinciHemen) === 0n,
      "Arc'ta hic para yokken ikisi de tamamen kuyruga dustu");
    ok(Number(s.adet) === 2, "iki talep acildi", s.adet + " talep");
    ok(V(s.kismiOdenen) === V(s.birinciKuyruk),
      "GELEN PARAYI BASTAKI TALEP ALDI", U(s.kismiOdenen));
    ok(V(s.basTalepKalan) === 0n, "birinci talep tamamen kapandi");
    ok(V(s.ikinciTalepKalan) === V(s.ikinciKuyruk),
      "IKINCI TALEP HALA TAM TUTARDA BEKLIYOR",
      "kimlik ile odeme olsaydi sonraki iadeci bu parayi alabilirdi");
    ok(Number(s.siraBasi) === 1, "sira bir adim ilerledi", "sira basi " + s.siraBasi);
  }

  /* ================================================================== */
  console.log("");
  console.log("3) OLAGAN HAL — para tamamen Arc'ta, kuyruk hic olusmuyor");
  {
    const [s] = await cagir("yerelRun", [ARZ, FON, 10n ** 26n]);
    console.log("     hemen " + U(s.hemen) + "   kuyruga " + U(s.kuyruga) +
                "   bekleyen talep " + s.adet);
    console.log("     HAK  " + HM(s.hakOnce) + "  ->  " + HM(s.hakSonra));
    ok(V(s.kuyruga) === 0n && Number(s.adet) === 0,
      "HIC TALEP ACILMADI — kuyruk gerektiginde var, her zaman degil");
    ok(V(s.hemen) === (FON * 10n ** 26n) / ARZ, "tam payi aninda odendi", U(s.hemen));
    ok(V(s.hakSonra) === V(s.hakOnce), "hak burada da oynamadi");
  }

  /* ================================================================== */
  console.log("");
  console.log("4) GERI ALIM — borc yokken, tabani savunmak");
  {
    const BIRAK = 4n * 10n ** 25n;  // arzin %4'u geri getiriliyor
    const [s] = await cagir("geriAlimRun", [ARZ, FON, ABROAD, BIRAK]);

    console.log("     serbest       " + U(s.serbest) + "   (ekonomik degil — " +
                U(FON) + "'in yerel kismi)");
    console.log("     islem tavani  " + U(s.islemTavani) + "   (%2)");
    console.log("     donem tavani  " + U(s.donemTavani) + "   (%10)");
    console.log("");
    if (!s.gecti) { console.log("     revert:"); revertYaz(s.sebep, 3); }
    console.log("     harcama " + U(s.harcama) + "   yakilan " +
                (Number(V(s.yakilan)) / 1e18).toLocaleString("en") + " jeton   odul " + U(s.odul));
    console.log("     HAK  " + HM(s.hakOnce) + "  ->  " + HM(s.hakSonra));

    ok(V(s.serbest) === FON - ABROAD,
      "TAVANLAR HARCANABILIR UZERINDEN — uzaktaki para yerel tavani sismiyor",
      U(s.serbest));
    ok(s.tavanAsimiReddedildi === true,
      "ISLEM TAVANININ BIR BIRIM USTU REDDEDILDI");
    ok(s.gecti === true, "geri alim gecti", s.gecti ? "" : hataAdi(s.sebep));
    ok(V(s.odul) > 0n,
      "ODUL SIFIR DEGIL — her zaman sifir odul, hic calismayan bir bekci agidir",
      U(s.odul));
    ok(V(s.hakSonra) > V(s.hakOnce),
      "GERI ALIM HAKKI YUKSELTTI — sulandirmadi");

    console.log("");
    console.log("     dizide " + s.pencereCagriSayisi + " cagri daha gecti");
    console.log("     pencerede harcanan " + U(s.pencereHarcanan) +
                " / tavan " + U(s.donemTavani));
    console.log("     diziyi durduran     " + hataAdi(s.pencereSebep));
    ok(s.pencereAsimiReddedildi === true,
      "dizi durduruldu — tek cagri sinirli olsa da dizi sinirsiz olamaz");
    /* WHICH limit stopped it, not merely that something did. The first
       version of this suite called with a fixed size while the per-call
       ceiling shrank with the reserve, so the loop ended on IslemTavani
       after one call and this line reported the window holding — green,
       and about the wrong limit. */
    ok(hataAdi(s.pencereSebep) === "DonemTavani",
      "DIZIYI DURDURAN GERCEKTEN PENCERE TAVANI",
      hataAdi(s.pencereSebep) + " — islem tavani olsaydi bu sav yanlis seyi" +
        " olcuyor olurdu");
    ok(V(s.pencereHarcanan) <= V(s.donemTavani),
      "PENCEREDEN CIKAN TOPLAM TAVANI ASMADI",
      U(s.pencereHarcanan) + " <= " + U(s.donemTavani) +
        " — odul dahil, ki eski kasada %10 vaadine karsi %17,07 cikmisti");
  }

  console.log("");
  console.log("  ASENKRON IADE TAMAM: iadeci tam hakkini aliyor, kalanlarin");
  console.log("  hakki birebir sabit, sira atlanamiyor ve savunma borclu");
  console.log("  parayi harcayamiyor.");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) revertYaz(String(e.data), 1);
  process.exit(1);
});
