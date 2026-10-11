"use strict";
/* Pazar — %80/%20 bölüşmesi ve sözleşmede para KALMAMASI.
 *
 * Bölüşmeyi doğrulamak bir çarpma işlemi. Bu ölçümün asıl sorusu şu: işlem
 * bittiğinde pazar sözleşmesinin bakiyesi sıfır mı? Çünkü bir aracı bakiye
 * olsaydı onu çekecek bir fonksiyon gerekirdi ve o fonksiyonun bir sahibi
 * olurdu — kullanıcının "protokol fonları kendi cüzdanına çekilemez" kuralı
 * ancak çekilecek bir şey yoksa yapısal olarak sağlanır.
 *
 * Kapıların hepsi REDDETME tarafından sürülüyor: kayıtsız ürün ekleyemez,
 * yabancı başkasının ürününü güncelleyemez, kapalı ürün satılamaz, lisansı
 * olmayan puanlayamaz, puanlayan ikinci kez puanlayamaz. Yalnızca geçerli
 * yolu deneyen bir test, hiçbir kapının var olduğunu göstermez.
 *
 * Arc'ın gerçek USDC'si ile, gerçek zincir durumunda, eth_call içinde:
 * hiçbir işlem gönderilmiyor ve tek kuruş harcanmıyor.
 */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000E1";
const USDC = "0x3600000000000000000000000000000000000000";
/* A wallet that holds USDC on Arc, used only as the eth_call `from` so the
   harness has a balance to pay with. Nothing is sent. */
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";

const B = (n) => JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "build", n + ".json"), "utf8"));

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

const T = B("TestPazar");
const iface = new Interface(T.abi);
const usd = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { maximumFractionDigits: 6 });

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => {
    if (!iyi) kotu++;
    console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
  };

  console.log("PAZAR — gercek Arc USDC'si, eth_call icinde, harcama yok");
  console.log("");

  /* THE HARNESS HAS TO HOLD USDC, AND ON ARC THAT IS THE NATIVE BALANCE
       First attempt reverted with "ERC20: transfer amount exceeds balance":
       the injected harness owns nothing, and it is the harness that pays
       the buyer. Overriding an ERC20 balance normally means knowing the
       token s storage slot — but Arc s USDC IS the gas token, and the two
       views of it are the same money at a 1e12 ratio (native 18 decimals,
       ERC20 6). Measured before relying on it: a native balance override
       of 1e6 * 1e18 reads back from balanceOf() as exactly 1.000.000 USDC.

       So the override is one line and needs no slot archaeology. */
  const YERLI = (10n ** 6n) * (10n ** 18n);          // 1.000.000 USDC
  const r = await rpc("eth_call", [
    { from: ISLETME, to: H, gas: "0x3000000",
      data: iface.encodeFunctionData("run", [USDC, ISLETME]) },
    "latest", {
      [H]: { code: T.deployedBytecode, balance: "0x" + YERLI.toString(16) }
    }
  ]);
  const [s] = iface.decodeFunctionResult("run", r);

  console.log("  pazar  " + s.pazar);
  console.log("  alici  " + s.alici);
  console.log("");

  console.log("  1) KAYIT");
  ok(s.kayitOldu === true, "gelistirici izinsiz kaydolabiliyor",
    "onay kapisi yok: onaylayacak biri gerekmiyor, kalite kapisi itibar");
  ok(s.mukerrerRed === true, "MUKERRER kayit reddedildi");
  ok(s.kayitsizUrunRed === true, "KAYITSIZ adres urun EKLEYEMEDI",
    "kayit bir formalite degil, urun eklemenin onkosulu");

  console.log("");
  console.log("  2) URUN SAHIPLIGI");
  ok(s.yabanciGuncelleRed === true, "YABANCI baskasinin urununu GUNCELLEYEMEDI",
    "fiyati degistirebilen biri, baskasinin musterisini fiyatlandirabilirdi");

  console.log("");
  console.log("  3) ODEME VE BOLUSME");
  const devArtis = BigInt(s.devSonrasi) - BigInt(s.devOncesi);
  const isArtis = BigInt(s.isletmeSonrasi) - BigInt(s.isletmeOncesi);
  const aliciDusus = BigInt(s.aliciOncesi) - BigInt(s.aliciSonrasi);
  console.log("     fiyat               " + usd(s.tekFiyat) + "   (kasitli olarak tam bolunmuyor)");
  console.log("     geliştirici aldi    " + usd(devArtis) + "   beklenen " + usd(s.tekDev));
  console.log("     isletme aldi        " + usd(isArtis) + "   beklenen " + usd(s.tekPlatform));
  console.log("     alicidan cikan      " + usd(aliciDusus));

  /* The harness IS the developer, so its own balance also paid out the
     1.000 USDC it handed the buyer earlier; the delta measured here is
     taken after that transfer, so it is the sale alone. */
  /* THE EXPECTED SHARE COMES FROM THE SPEC, NOT FROM THE CONTRACT
       First version compared the payout against (fiyat * p.PLATFORM_PPM())
       / 1e6 — a number the harness read out of the contract being tested.
       So it asserted "the contract pays what the contract says it pays",
       which is true for ANY constant: set PLATFORM_PPM to 900.000 and both
       sides move together and the test still reports green. (Written
       without the bare word, because hepsi.js counts assertions by
       scanning output text and a comment would be counted as one.)

       The agreed split is 20/80. That number is written here, once, and
       the payout is measured against it. */
  const SARTNAME_PLATFORM_PPM = 200_000n;             // %20, kararlastirilan
  const beklenenPlatform = (BigInt(s.tekFiyat) * SARTNAME_PLATFORM_PPM) / 1_000_000n;
  const beklenenDev = BigInt(s.tekFiyat) - beklenenPlatform;

  ok(devArtis === beklenenDev, "GELISTIRICI PAYI %80 — sartnameye gore",
    usd(devArtis) + ", beklenen " + usd(beklenenDev));
  ok(isArtis === beklenenPlatform, "PLATFORM PAYI %20 — sartnameye gore",
    usd(isArtis) + ", beklenen " + usd(beklenenPlatform));
  ok(BigInt(s.tekPlatform) === beklenenPlatform,
    "SOZLESMENIN SABITI DE %20",
    "sozlesmedeki PLATFORM_PPM ile sartnamedeki oran ayni — bu sav olmasa " +
      "ustteki ikisi her oran icin gecerdi");
  ok(aliciDusus === BigInt(s.tekFiyat),
    "ALICIDAN CIKAN = FIYAT, ne fazla ne eksik",
    "arada kaybolan ya da eklenen bir kurus yok");
  ok(devArtis + isArtis === BigInt(s.tekFiyat),
    "IKI PAYIN TOPLAMI FIYATA ESIT",
    "yuvarlama kalanini kimse yutmuyor");
  /* %79,9 degil TAM %80 ve uzeri. Onceki hali bir tolerans savıydi ve
     bolusme bozulsa bile gecebilirdi; carpraz carpim tam esigi soyluyor. */
  ok(BigInt(s.tekDev) * 1_000_000n >= BigInt(s.tekFiyat) * 800_000n,
    "YUVARLAMA GELISTIRICININ LEHINE",
    "gelistirici tam %80 ya da uzeri aliyor — bolunmeyen kurus platforma " +
      "degil ona kaliyor");

  console.log("");
  console.log("  4) SOZLESMEDE PARA KALMADI — bu testin asil sorusu");
  ok(BigInt(s.pazardaKalan) === 0n,
    "PAZARIN BAKIYESI SIFIR",
    "aracı bakiye olmadigi icin cekecek bir fonksiyon da gerekmiyor; " +
      "withdraw/sweep/rescue yok, yani kimse kullanamaz");

  console.log("");
  console.log("  5) LISANS");
  ok(s.lisansli === true, "alici lisansli", "odeyen erisim kazandi");
  ok(s.suresizMi === true, "BIR DEFALIK ALIM SURESIZ LISANS",
    "periyot 0 ise bitis uint64 tavani");

  const b1 = BigInt(s.aboneBitis1);
  const b2 = BigInt(s.aboneBitis2);
  const periyot = BigInt(s.periyot);
  console.log("     abonelik 1. alim    bitis " + b1);
  console.log("     abonelik 2. alim    bitis " + b2 + "   fark " + (b2 - b1));
  ok(b2 - b1 === periyot,
    "ERKEN YENILEME SURE KAYBETTIRMIYOR",
    "ikinci alim mevcut bitisin UZERINE eklendi (" + periyot + " sn); " +
      "simdiden baslatmak kalan sureyi silerdi");

  console.log("");
  console.log("  6) KAPATMA");
  ok(s.kapaliSatisRed === true, "KAPALI urun SATILAMADI");
  ok(s.kapandiktanSonraLisansDuruyor === true,
    "KAPATMAK SATILMIS LISANSI IPTAL ETMIYOR",
    "parasini odemis birinin urununu geri almak olurdu");

  console.log("");
  console.log("  7) ITIBAR — yalnizca odeyenden, bir kez");
  ok(s.lisanssizPuanRed === true, "LISANSI OLMAYAN PUANLAYAMADI",
    "itibar ucretsiz bir oy sandigi degil");
  ok(s.mukerrerPuanRed === true, "AYNI ADRES IKINCI KEZ PUANLAYAMADI",
    "degistirilebilir puan, 'puanini duzelt' baskisina acik kapi olurdu");
  ok(Number(s.puanAdedi) === 1 && Number(s.ortalamaYuzlu) === 400,
    "ortalama puan hesabi dogru",
    Number(s.ortalamaYuzlu) / 100 + " / 5, " + s.puanAdedi + " oy");

  console.log("");
  console.log("  8) DEFTER — panolarin okudugu yer");
  console.log("     gelistirici kazanci " + usd(s.devKazanci));
  console.log("     platform kazanci    " + usd(s.platformKazanci));
  console.log("     toplam hasilat      " + usd(s.toplamHasilat));
  const ucSatis = BigInt(s.tekFiyat) + 10_000_000n + 10_000_000n;
  ok(BigInt(s.toplamHasilat) === ucSatis,
    "TOPLAM HASILAT UC SATISIN TOPLAMI",
    usd(s.toplamHasilat) + " = " + usd(s.tekFiyat) + " + $10 + $10");
  ok(BigInt(s.devKazanci) + BigInt(s.platformKazanci) === BigInt(s.toplamHasilat),
    "DEFTER KAPANIYOR: gelistirici + platform = toplam",
    "iki defterin toplami hasilattan farkli olsa, biri yanlis sayiyor demektir");

  console.log("");
  console.log(kotu === 0
    ? "  GECTI — para bolunuyor, sozlesmede kalmiyor ve kapilar REDDEDIYOR."
    : "  BASARISIZ — " + kotu + " sorun.");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.log("HATA: " + e.message);
  if (e.data) console.log("data: " + String(e.data).slice(0, 200));
  process.exit(1);
});
