"use strict";
/* ===========================================================================
 * kur-teminat-listesi.js — önerilen 50'yi ÖLÇÜMDEN üret
 *
 *   node scripts/kur-teminat-listesi.js
 *
 * KAYNAK DEĞİŞTİ — VE NEDEN DEĞİŞTİ
 *   Bu betik önce `teminat-adaylari.json`'dan üretiyordu. O dosya adayları
 *   CHAINLINK BESLEYİCİLERİNDEN türetiyor: feed listesi çekiliyor, sonra o
 *   feed'in varlığı zincirde aranıyor. Yani kullanıcının kaldırdığı kapı,
 *   öneri listesini hâlâ belirliyordu.
 *
 *   Sonucu ölçüldü ve kötüydü: o yolla üretilen 50 önerinin yalnızca 21'i
 *   $2.000'lık bir dönüşümü kaldırıyordu. Geri kalanın ya USDC havuzu
 *   yoktu ya da havuz o kadar inceydi ki işlem fiyatı 9–58 kat ittiriyordu.
 *   Sayfa "çalışıyor" diyordu, zincir reddedecekti.
 *
 *   Artık kaynak `teminat-derinlik.json`: evren Uniswap'in açık token
 *   listesi (ücretsiz, anahtarsız), ölçüt ise doğrudan yapılacak işin
 *   kendisi — bu tutar bu havuzda dönüştürülebiliyor mu.
 *
 * SIRALAMA: HANGİ BÜYÜKLÜĞÜ KALDIRDIĞI
 *   Dört tutarda ölçüldü ($20 / $200 / $2.000 / $20.000) ve her varlık
 *   kaldırdığı EN BÜYÜK tutarla kaydedildi. Sıralama buna göre.
 *
 *   Tek bir eşik yanlış cevap olurdu: asgari teminat $20 ama teminat her
 *   işlemin vergisiyle büyüyor ve tavanı yok. "Çalışıyor mu" sorusunun
 *   "hangi büyüklükte" olmadan cevabı yok.
 *
 * LİSTE BİR KAPI DEĞİL
 *   Kullanıcının kuralı: *"biz 50 tane önerelim, launch yapan isterse CA
 *   yapıştırarak istediği şekilde yapar."* Bu 50 bir kısayol. Listede
 *   olmamak yasak olmak değil — sayfadaki CA alanı aynı ölçümü yapıyor ve
 *   aynı şekilde kabul ediyor.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const KAYNAK = path.join(KOK, "teminat-derinlik.json");
const HEDEF = path.join(KOK, "docs", "js", "teminat-listesi.js");
const ADET = 50;

if (!fs.existsSync(KAYNAK)) {
  console.log("teminat-derinlik.json yok. Once: node scripts/olc-teminat-derinlik.js");
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(KAYNAK, "utf8"));

/* One row per symbol, carrying every chain it converts on. The address
   differs per chain — the same symbol is usually a different contract, and
   sometimes (OP-Stack predeploys, CREATE2 vanity deployments) genuinely
   the same one — so the interface needs the whole map. */
const varliklar = new Map();
for (const z of j.zincirler) {
  for (const a of z.adaylar) {
    if (!a.donusturulebilir) continue;
    if (!varliklar.has(a.simge)) {
      varliklar.set(a.simge, {
        simge: a.simge,
        ad: a.ad || a.simge,
        ondalik: a.ondalik,
        zincirler: {},
        havuzToplam: 0,
        azamiTutar: "0"
      });
    }
    const v = varliklar.get(a.simge);
    v.zincirler[z.zincir] = {
      token: a.token,
      kademe: a.kademe,
      havuz: a.havuzSayisi,
      azamiTutar: a.azamiTutar,
      ittirme: a.ittirme
    };
    v.havuzToplam += a.havuzSayisi;
    if (BigInt(a.azamiTutar || 0) > BigInt(v.azamiTutar)) v.azamiTutar = a.azamiTutar;
    /* Decimals should agree across chains and usually do; if they ever
       disagree the smaller is kept, because treating an 8-decimal asset as
       18 overstates every amount by 10^10. */
    if (a.ondalik < v.ondalik) v.ondalik = a.ondalik;
  }
}

const hepsi = [...varliklar.values()].sort((x, y) => {
  const d = Number(BigInt(y.azamiTutar) - BigInt(x.azamiTutar));
  if (d) return d > 0 ? 1 : -1;
  const zx = Object.keys(x.zincirler).length, zy = Object.keys(y.zincirler).length;
  return zy - zx || y.havuzToplam - x.havuzToplam || x.simge.localeCompare(y.simge);
});

const elli = hepsi.slice(0, ADET);
const kalan = hepsi.slice(ADET);

const U = (t) => "$" + (Number(t) / 1e6).toLocaleString("en");

const satirlar = elli.map((v) => {
  const z = Object.entries(v.zincirler)
    .map(([ad, d]) => "      " + ad + ": { token: \"" + d.token +
      "\", kademe: " + d.kademe + ", havuz: " + d.havuz +
      ", azamiTutar: \"" + d.azamiTutar + "\", ittirme: " + d.ittirme + " }")
    .join(",\n");
  return [
    "  {",
    "    simge: \"" + v.simge + "\",",
    "    ad: " + JSON.stringify(v.ad) + ",",
    "    ondalik: " + v.ondalik + ",",
    "    havuz: " + v.havuzToplam + ",",
    "    /* The largest measured conversion this asset clears the floor at. */",
    "    azamiTutar: \"" + v.azamiTutar + "\",",
    "    zincirler: {",
    z,
    "    }",
    "  }"
  ].join("\n");
});

/* How many clear each size, for the page to state plainly. */
const basamaklar = [...new Set(hepsi.map((v) => v.azamiTutar))]
  .sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : -1));
const dagilim = basamaklar.map((t) => ({
  tutar: t,
  adet: hepsi.filter((v) => BigInt(v.azamiTutar) >= BigInt(t)).length
}));

const cikti = [
  "/* ===========================================================================",
  " * teminat-listesi.js — ÖNERİLEN " + ADET + " TEMİNAT VARLIĞI",
  " *",
  " * BU DOSYA ÜRETİLDİ — elle düzenlenmemeli.",
  " *   Kaynak: teminat-derinlik.json",
  " *   Üreten: scripts/kur-teminat-listesi.js",
  " *   Ölçüm:  " + j.olculdu,
  " *",
  " * NASIL ÖLÇÜLDÜ — ÖLÇÜT DOĞRUDAN YAPILACAK İŞİN KENDİSİ",
  " *   Her satırın arkasında dört zincir ölçümü var: en derin USDC havuzu",
  " *   bulundu, likiditesi okundu, gözlem geçmişi kontrol edildi ve dört",
  " *   ayrı tutarda GERÇEKTEN dönüştürülebilir mi diye Uniswap'in kendi",
  " *   kotasına soruldu.",
  " *",
  " *   Likidite tabanı, piyasa değeri eşiği gibi vekil kalite kapıları",
  " *   kullanılmadı. Sorulan şey bir eşik değil: bu tutar bu havuzda",
  " *   dönüştürülebiliyor mu.",
  " *",
  " * NEDEN TEK BİR \"ÇALIŞIYOR\" YOK",
  " *   Fiyatın ölçülebilmesi, o havuzda İŞLEM yapılabileceği anlamına",
  " *   gelmiyor. Ölçüldü: SHIB'in fiyatı %0,00 tutarlı okunuyor ama",
  " *   $2.000'lık işlem fiyatı 17,5 kat ittiriyor, çünkü SHIB'in likiditesi",
  " *   SHIB/USDC'de değil SHIB/WETH'te. Taban marjinal fiyattan türetildiği",
  " *   için böyle bir dönüşüm REDDEDİLİR.",
  " *",
  " *   O yüzden her varlık kaldırdığı EN BÜYÜK tutarla kayıtlı:",
  ...dagilim.map((d) => " *     " + U(d.tutar).padStart(8) + " kadar: " + d.adet + " varlık"),
  " *",
  " *   Asgari teminat $20 (ASGARI_TEMINAT = 20e6) ama teminat her işlemin",
  " *   vergisiyle büyüyor ve tavanı yok — bu yüzden tek bir eşik yanlış",
  " *   cevap olurdu.",
  " *",
  " * BU LİSTE BİR KAPI DEĞİL",
  " *   Launch yapan bu " + ADET + " taneden birini seçebilir ya da KONTRAT ADRESİ",
  " *   yapıştırıp başka bir token seçebilir. Listede olmamak yasak olmak",
  " *   değil — sayfa CA için de aynı ölçümü yapıyor.",
  " *",
  " *   Dönüştürülebildiği ölçülen " + hepsi.length + " varlığın " + kalan.length +
    " tanesi listeye girmedi ve",
  " *   hepsi CA ile seçilebilir:",
  " *   " + kalan.map((v) => v.simge).join(" "),
  " * =========================================================================== */",
  "",
  "export const TEMINAT_OLCUMU = " + JSON.stringify(j.olculdu) + ";",
  "",
  "/* The sizes the measurement asked about, smallest first. */",
  "export const OLCULEN_TUTARLAR = [" +
    [...new Set(j.zincirler.flatMap((z) => z.adaylar.flatMap((a) =>
      Object.keys(a.boyutlar || {}))))]
      .sort((a, b) => (BigInt(a) > BigInt(b) ? 1 : -1))
      .map((t) => "\"" + t + "\"").join(", ") + "];",
  "",
  "/* How many of the measured assets clear each size. Stated so the page can",
  "   say what it found instead of a bare yes. */",
  "export const DAGILIM = [",
  dagilim.map((d) => "  { tutar: \"" + d.tutar + "\", adet: " + d.adet + " }").join(",\n"),
  "];",
  "",
  "export const ONERILEN = [",
  satirlar.join(",\n"),
  "];",
  "",
  "/* Which chains the measurement covered, with what a conversion needs to",
  "   reach them: the CCTP domain, the chain's own USDC, the canonical",
  "   Uniswap v3 factory and the quoter that answered there. The page reads",
  "   all of it directly — the same derivation the contract does, so what the",
  "   page shows and what the chain would accept cannot drift. */",
  "export const ZINCIRLER = {",
  j.zincirler.map((z) => [
    "  " + z.zincir + ": {",
    "    ad: " + JSON.stringify(z.ad) + ", id: " + (({
      ethereum: 1, base: 8453, arbitrum: 42161, optimism: 10,
      polygon: 137, avalanche: 43114, unichain: 130
    })[z.zincir]) + ", domain: " + z.domain + ",",
    "    rpc: " + JSON.stringify((({
      ethereum: "https://ethereum-rpc.publicnode.com",
      base: "https://base-rpc.publicnode.com",
      arbitrum: "https://arbitrum-one-rpc.publicnode.com",
      optimism: "https://optimism-rpc.publicnode.com",
      polygon: "https://polygon-bor-rpc.publicnode.com",
      avalanche: "https://avalanche-c-chain-rpc.publicnode.com",
      unichain: "https://unichain-rpc.publicnode.com"
    })[z.zincir])) + ",",
    "    usdc: \"" + z.usdc + "\",",
    "    v3Fabrika: \"" + z.v3Fabrika + "\",",
    "    quoter: " + (z.quoter ? "\"" + z.quoter + "\"" : "null") +
      (z.quoter ? "" : "   /* none answered here — depth reads as unmeasured */"),
    "  }"
  ].join("\n")).join(",\n"),
  "};",
  "",
  "/* Uniswap v3's canonical fee tiers. A pool cannot exist outside these, so",
  "   scanning all four is exhaustive rather than a heuristic. */",
  "export const KADEMELER = [100, 500, 3000, 10000];",
  ""
].join("\n");

fs.writeFileSync(HEDEF, cikti);

console.log("TEMINAT LISTESI URETILDI");
console.log("  kaynak   " + path.relative(KOK, KAYNAK) + "   (olculdu " + j.olculdu + ")");
console.log("  hedef    " + path.relative(KOK, HEDEF));
console.log("  donusturulebilen " + hepsi.length + " varlik");
console.log("  onerilen " + elli.length);
console.log("  listede olmayan (CA ile secilebilir): " + kalan.length);
console.log("");
for (const d of dagilim) {
  console.log("  " + U(d.tutar).padStart(8) + " kadar: " + String(d.adet).padStart(3) + " varlik");
}
console.log("");
console.log("  ilk on: " + elli.slice(0, 10).map((v) =>
  v.simge + "(" + U(v.azamiTutar) + ")").join(" "));
