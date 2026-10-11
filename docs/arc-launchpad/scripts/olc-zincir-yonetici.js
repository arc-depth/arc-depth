"use strict";
/* ===========================================================================
 * olc-zincir-yonetici.js — AŞAMA 2 testi: kim taşıyabilir, nereye, ne kadar
 *
 *   node scripts/olc-zincir-yonetici.js
 *
 * WHAT IS BEING PROVED
 *   The design's whole safety claim is that a permissionless trigger cannot
 *   become a permissionless drain. Three independent things have to hold:
 *
 *     1. The destination is DERIVED, identically by the manager and again
 *        by the contract that holds the money. Nobody supplies it.
 *     2. Seven checks reject everything outside the limits, and let a
 *        legitimate transfer through — a wall is not a limit.
 *     3. An inbound report is believed only from the derived remote vault,
 *        delivered by CCTP itself, and only once.
 *
 *   Plus the thing the whole phase exists for: the claim per token must not
 *   dip at any point in a round trip that spans two chains.
 *
 * NO BRIDGE IS NEEDED TO TEST THIS
 *   The harness is both the vault and the message transmitter, so one
 *   contract drives a sequence that in production spans two chains and
 *   several minutes. The CCTP call itself is Phase 4; what is tested here
 *   is every decision made around it.
 * =========================================================================== */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000Ef";
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

const T = B("TestCrossChainManager");
const iface = new Interface(T.abi);

async function cagir(ad, args = []) {
  await bekle(250);
  const r = await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x8000000", data: iface.encodeFunctionData(ad, args) },
    "latest", { [H]: { code: T.deployedBytecode } }
  ]);
  return iface.decodeFunctionResult(ad, r);
}

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HAK = (v) => (Number(v) / 1e36).toExponential(6);
const TOK = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 0 });
const V = (v) => BigInt(v.toString());

/* The state machine's numbering, so a failure names a state instead of an
   integer. */
const DURUM = ["YOK", "OLUSTURULDU", "GONDERILDI", "ULASTI", "TAKAS_EDILDI",
               "DONUYOR", "TAMAMLANDI", "IADE_BEKLIYOR", "IADE_EDILDI",
               "KURTARILABILIR_HATA"];

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("ASAMA 2 TESTI — YONETICI, KAYIT, DURUM MAKINESI");
  console.log("");

  /* ---- 1 ---------------------------------------------------------- */
  console.log("1) HEDEF TURETILIYOR, VERILMIYOR");
  {
    const [s] = await cagir("turetmeTesti");
    console.log("     kayittan turetilen  " + s.turetilen);
    console.log("     bagimsiz hesap      " + s.bagimsizHesap);
    ok(s.ayni === true,
      "KAYIT VE BAGIMSIZ CREATE2 HESABI AYNI ADRESI VERIYOR",
      "tuz keccak(tokenId), onek 0xff, initKodHash — hepsi birebir");
    ok(s.ustBitlerTemiz === true,
      "bytes32 hali dogru dolguluyor",
      "CCTP bytes32 aliyor; yanlis dolgu minti kimsenin olmayan adrese gonderir");
    ok(s.yanlisAdresReddedildi === true,
      "ust 12 bayti kirli bir bytes32 gonderen REDDEDILIYOR",
      "32 baytlik bir adres 20 baytlikla cakisamiyor");
  }

  /* ---- 2 ---------------------------------------------------------- */
  console.log("");
  console.log("2) YEDI KONTROL — hepsi reddetmeli, gecerli olan GECMELI");
  {
    const [s] = await cagir("redTesti");
    ok(s.bilinmeyenZincir === true, "desteklenmeyen zincir reddedildi");
    ok(s.asgariAlti === true, "asgari transferin ($100) altinda reddedildi",
      "kucuk tutar koprude ucretten fazlasini goturur");
    ok(s.teminattanFazla === true, "teminattan fazlasi reddedildi");
    ok(s.islemTavaniUstu === true, "islem tavaninin (%20) ustu reddedildi");
    ok(s.gecerliGecti === true, "GECERLI TRANSFER GECTI — limit duvar degil",
      U(s.gecerliMiktar) + " kasaya ulasti");
    ok(s.pencereTavaniUstu === true,
      "pencere tavani (%40) diziyi durdurdu",
      "her biri tek tek islem tavanindan kucuk olsa da toplam asti");
    ok(s.borcluParaGonderilemez === true,
      "IADE EDENE BORCLU PARA KOPRUYE GONDERILEMEZ",
      "borc hem haktan hem harcanabilirden dusuldugu icin");
  }

  /* ---- 3 ---------------------------------------------------------- */
  console.log("");
  console.log("3) GELEN MESAJ — kim, nereden, kac kez");
  {
    const [s] = await cagir("girisTesti");
    ok(s.tasiyiciOlmayanReddedildi === true,
      "CCTP tasiyicisi OLMAYAN bir cagri reddedildi",
      "yoksa defter uydurma mesajla yazilirdi");
    ok(s.yanlisGonderenReddedildi === true,
      "turetilen uzak kasa OLMAYAN bir gonderen reddedildi",
      "izin listesi degil, turetme — sahte gonderen ifade edilemiyor");
    ok(s.dogruMesajGecti === true, "dogru gonderenden gelen mesaj kabul edildi");
    ok(s.tekrarReddedildi === true,
      "AYNI MESAJ IKINCI KEZ ISLENEMEDI",
      "tekrar oynatma bir krediyi ikiye katlardi");
  }

  /* ---- 4 ---------------------------------------------------------- */
  console.log("");
  console.log("4) TAM TUR — Arc USDC -> Ethereum -> PEPE -> USDC -> Arc");
  {
    const REZERV = 10_000_000_000n;   // $10.000
    const TRANSFER = 2_000_000_000n;  // $2.000, tam islem tavani
    const [s] = await cagir("turTesti", [REZERV, TRANSFER]);

    console.log("     durum dizisi: " + [...s.durumlar].slice(0, 5)
      .map((d) => DURUM[Number(d)]).join(" -> "));
    console.log("     ortada: quote yolda " + U(s.yoldaOrtada) +
      "   uzak PEPE " + TOK(s.uzakPepeOrtada));
    console.log("     bitis:  musait " + U(s.bitisMusait) +
      "   yolda " + U(s.bitisYolda) + "   uzak PEPE " + TOK(s.bitisUzakPepe));
    console.log("     hak     " + HAK(s.baslangicHak) + "  ->  " + HAK(s.bitisHak));

    const d = [...s.durumlar].map(Number);
    ok(d[0] === 2, "transfer GONDERILDI durumunda basladi", DURUM[d[0]]);
    ok(d[1] === 3, "rapor sonrasi ULASTI", DURUM[d[1]]);
    ok(d[2] === 4, "takas sonrasi TAKAS_EDILDI", DURUM[d[2]]);
    ok(d[3] === 5, "geri takas sonrasi DONUYOR", DURUM[d[3]]);
    ok(d[4] === 6, "donus sonrasi TAMAMLANDI", DURUM[d[4]]);

    ok(V(s.uzakPepeOrtada) > 0n,
      "ortada uzak PEPE tutuldu — varliklar arasi gecis calisti",
      TOK(s.uzakPepeOrtada) + " PEPE");
    ok(V(s.yoldaOrtada) === 0n,
      "takas sonrasi quote YOLDA'da kalmadi",
      "ayni miktar iki kovada birden sayilmiyor");

    ok(s.hakHicDusmedi === true,
      "HAK, YAKMADAN HEMEN SONRA DA DUSMEDI",
      "eski kasada tam bu anda %60 dusuyordu");
    ok(s.kapandi === true,
      "TUR KAPANDI — musait basa dondu, yolda ve uzak sifir, hak ayni");
  }

  /* ---- 5 ---------------------------------------------------------- */
  console.log("");
  console.log("5) PARAYI TUTAN SOZLESME HEDEFI YENIDEN TURETIYOR");
  {
    const [reddedildi] = await cagir("yanlisHedefTesti");
    ok(reddedildi === true,
      "KASA, YONETICININ VERDIGI YANLIS HEDEFI REDDETTI",
      "ele gecirilmis bir yonetici bile parayi yonlendiremez");
  }

  /* ---- 6 ---------------------------------------------------------- */
  console.log("");
  console.log("6) KANCA — uzak kasa neyin geldigini atomik ogreniyor");
  {
    const [s] = await cagir("kancaTesti");
    console.log("     kancadaki tokenId " + s.kancadakiTokenId +
      "   transferId " + String(s.kancadakiId).slice(0, 18) + "...");
    console.log("     azami ucret " + U(s.azamiUcret) + "   kesinlik esigi " + s.kesinlik);
    ok(s.tokenIdDogru === true,
      "kanca tokenId ve transferId tasiyor",
      "ayri bir mesaj gec, iki kez ya da hic gelebilirdi");
    ok(Number(s.kesinlik) === 1000,
      "hizli mod kesinlik esigi 1000 gonderdi",
      "Circle'in olculen hizli esigi; standart 2000");
    /* kancaTesti $1.000 tasiyor, $2.000 degil — ilk halinde yanlis
       transfer boyuna gore beklemisim. */
    const KANCA_TRANSFER = 1_000_000_000n;
    ok(V(s.azamiUcret) === (KANCA_TRANSFER * 50n) / 10_000n,
      "azami kopru ucreti transferin yuzde 0,50si",
      U(s.azamiUcret) + " / " + U(KANCA_TRANSFER) + " transferde");
  }

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) console.error("  sebep: " + hataAdi(e.data));
  process.exit(1);
});
