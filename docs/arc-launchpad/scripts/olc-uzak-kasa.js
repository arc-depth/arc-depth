"use strict";
/* ===========================================================================
 * olc-uzak-kasa.js — AŞAMA 3: Ethereum tarafı
 *
 *   node scripts/olc-uzak-kasa.js
 *
 * THE MEASUREMENT THAT HAD TO COME FIRST
 *   Arc derives a remote vault's address from (factory, salt, initCodeHash)
 *   and sends a CCTP mint straight to it. If the factory deploys to a
 *   different address, the mint lands where nobody holds and the money is
 *   simply gone — and nothing before the first real transfer would reveal
 *   it. So the first thing checked is that three independently computed
 *   addresses agree: the factory's own view, Arc's registry, and where the
 *   contract actually ended up.
 *
 *   That constraint is also why RemoteCollateralVault takes NO constructor
 *   arguments. One argument would change the creation code per deployment,
 *   the single initCodeHash in the registry would stop matching, and the
 *   derivation would point at nothing.
 *
 * WHAT ELSE IS PROVEN HERE
 *   Four forgeries are rejected (a direct call, another chain, another Arc
 *   contract, another token), replay is rejected, the target asset cannot
 *   be rewritten, a swap is bounded by the caller's minimum AND measured by
 *   the vault, a sale is bounded by what Arc authorised, and the single
 *   exit sends to Arc and takes no recipient.
 * =========================================================================== */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000F1";
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

const T = B("TestRemoteVault");
const iface = new Interface(T.abi);

async function cagir(ad, args = []) {
  await bekle(250);
  const r = await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x10000000", data: iface.encodeFunctionData(ad, args) },
    "latest", { [H]: { code: T.deployedBytecode } }
  ]);
  return iface.decodeFunctionResult(ad, r);
}

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TOK = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
const V = (v) => BigInt(v.toString());

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("ASAMA 3 — UZAK KASA, FABRIKA, TAKAS YURUTUCUSU");
  console.log("");

  /* ---- 1 ---------------------------------------------------------- */
  console.log("1) ADRESLER UYUSUYOR MU (once bu, cunku yanlissa para kaybolur)");
  {
    const [s] = await cagir("adresTesti");
    console.log("     initKodHash          " + s.initKodHash);
    console.log("     fabrikanin hesabi    " + s.fabrikaninHesabi);
    console.log("     ARC kayittan turetim " + s.kayittanTuretilen);
    console.log("     gercekten dagitilan  " + s.gercektenDagitilan);
    ok(s.ucuBirden === true,
      "UC ADRES DE AYNI — fabrika, Arc kaydi, gercek dagitim",
      "biri ayri olsa CCTP minti bos adrese duserdi");
    console.log("     kasanin kimligi: tokenId " + s.kasaTokenId +
      "   arcDomain " + s.kasaArcDomain);
    ok(s.kimlikDogru === true,
      "kasa kendi kimligini CONSTRUCTOR ARGUMANI OLMADAN ogrendi",
      "argüman olsaydi init kodu her dagitimda degisir ve turetim bozulurdu");
  }

  /* ---- 2 ---------------------------------------------------------- */
  console.log("");
  console.log("2) GELEN MESAJ — dort ayri taklit reddedilmeli");
  {
    const [s] = await cagir("girisTesti");
    ok(s.tasiyiciOlmayanRed === true, "CCTP tasiyicisi olmayan cagri reddedildi", "dogrudan cagri");
    ok(s.yanlisDomainRed === true, "baska zincirden gelen mesaj reddedildi", "yanlis domain");
    ok(s.yanlisGonderenRed === true, "Arc'taki baska bir sozlesme reddedildi", "yanlis gonderen");
    ok(s.yanlisTokenIdRed === true, "baska bir tokenin mesaji reddedildi", "yanlis tokenId");
    ok(s.dogruGecti === true, "dogru mesaj kabul edildi",
      "bekleyen quote " + U(s.bekleyenQuote) + ", hedef varlik " + s.hedefVarlik);
    ok(s.tekrarRed === true, "AYNI MESAJ IKINCI KEZ ISLENEMEDI");
    ok(s.hedefDegistirilemedi === true,
      "HEDEF VARLIK BIR KEZ BELIRLENIYOR, SONRA DEGISMIYOR",
      "yoksa teminat kimsenin secmedigi bir seye donustururdu");
  }

  /* ---- 3 ---------------------------------------------------------- */
  console.log("");
  console.log("3) ALIS — gercek bir rota uzerinden, sinir kasada denetleniyor");
  {
    const FON = 1_000_000_000n;       // $1.000
    const HARCAMA = 400_000_000n;     // $400
    const [s] = await cagir("alisTesti", [FON, HARCAMA]);
    console.log("     bekleyen " + U(s.bekleyenOnce) + " -> " + U(s.bekleyenSonra));
    console.log("     alinan   " + TOK(s.alinan) + " PEPE   tutulan " + TOK(s.tutulanSonra));
    ok(s.azCiktiRed === true,
      "ULASILAMAZ ASGARI CIKTI REDDEDILDI",
      "sinir cagiranin, denetimi kasanin");
    ok(V(s.alinan) > 0n, "rota gercekten takas yapti", TOK(s.alinan) + " PEPE");
    ok(V(s.tutulanSonra) === V(s.alinan), "tutulan miktar alinan kadar kaydedildi");
    ok(V(s.bekleyenSonra) === V(s.bekleyenOnce) - HARCAMA,
      "bekleyen quote tam harcama kadar dustu");
    ok(s.yurutucuBosKaldi === true,
      "YURUTUCU HICBIR SEY TUTMADI",
      "ne USDC ne PEPE — odunc tek islem icinde kapandi");
  }

  /* ---- 4 ---------------------------------------------------------- */
  console.log("");
  console.log("4) SATIS — Arc'in izni kadar, bir birim fazlasi degil");
  {
    const FON = 1_000_000_000n;
    const HARCAMA = 400_000_000n;
    const SATILACAK = 6_200_000_000_000_000_000_000n;   // 6.200 PEPE
    const [s] = await cagir("satisTesti", [FON, HARCAMA, SATILACAK]);
    ok(s.izinsizRed === true,
      "IZIN YOKKEN SATIS REDDEDILDI",
      "yoksa cagiran tum uzak rezervi istedigi anda likide ederdi");
    console.log("     Arc'in verdigi izin " + TOK(s.izin) + " PEPE");
    console.log("     satistan gelen      " + U(s.quoteAlinan));
    console.log("     tutulan sonra       " + TOK(s.tutulanSonra) +
      "   kalan izin " + TOK(s.izinSonra));
    ok(V(s.quoteAlinan) > 0n, "satis gercekten quote getirdi", U(s.quoteAlinan));
    ok(V(s.izinSonra) === 0n, "kullanilan izin tuketildi");
    ok(s.izindenFazlaRed === true, "izinden bir birim fazlasi reddedildi");
  }

  /* ---- 5 ---------------------------------------------------------- */
  /* ================================================================ */
  console.log("");
  console.log("4b) TABAN — ve neden kapanarak hata veriyor");
  {
    const FON = 1_000_000_000n;       // $1.000
    const HARCAMA = 400_000_000n;     // $400
    const [s] = await cagir("besleyiciTesti", [FON, HARCAMA]);

    console.log("     taze besleyici tabani " + TOK(s.tazeTaban)+" PEPE");
    console.log("     ayni rota verdi       " + TOK(s.tazeAlinan)+" PEPE");
    ok(s.tazeGecti === true, "TAZE BESLEYICI DURUST ROTAYI GECIRDI",
      TOK(s.tazeAlinan)+" PEPE" + " >= " + TOK(s.tazeTaban)+" PEPE");

    ok(s.eskimisRed === true,
      "ESKIMIS BESLEYICI DONUSUMU DURDURDU",
      hataAdi(s.eskimisSebep) + " — emekliye ayrilmis bir aggregator tam " +
        "boyle gorunur: cevap verir ve cevabi eskidir");
    ok(s.sifirRed === true,
      "SIFIR CEVAP REDDEDILDI", hataAdi(s.sifirSebep));
    ok(s.negatifRed === true,
      "NEGATIF CEVAP REDDEDILDI",
      hataAdi(s.negatifSebep) + " — latestRoundData int256 donuyor, yani " +
        "negatif ifade edilebilir");

    console.log("");
    console.log("     fiyat iki katina cikti, mekanin orani ayni:");
     console.log("     yeni taban " + TOK(s.yuksekTaban)+" PEPE" + "   (eski " + TOK(s.tazeTaban)+" PEPE" + ")");
    ok(V(s.yuksekTaban) > V(s.tazeTaban),
      "taban fiyatla birlikte yukseldi", TOK(s.yuksekTaban)+" PEPE");
    ok(s.yuksekRed === true,
      "AYNI ROTA SIMDI REDDEDILIYOR — TABAN GERCEKTEN BAGLAYICI",
      hataAdi(s.yuksekSebep) + " — bir dekoratif taban bunu gecirirdi");
  }

  console.log("");
  console.log("5) TEK CIKIS — hedef ARC, ve alici parametresi YOK");
  {
    const FON = 1_000_000_000n;
    const GONDER = 600_000_000n;
    const [s] = await cagir("cikisTesti", [FON, GONDER]);
    console.log("     giden: domain " + s.gidenDomain + "  alici " + s.gidenAlici);
    console.log("     beklenen alici      " + s.beklenenAlici);
    console.log("     miktar " + U(s.gidenMiktar) + "   bekleyen sonra " + U(s.bekleyenSonra));
    ok(s.hedefArc === true,
      "CIKIS ARC'A VE SADECE ARC'A GITTI",
      "domain ve alici construction'dan beri degistirilemez");
    ok(V(s.gidenMiktar) === GONDER, "giden miktar istenen kadar");
    ok(s.cagiranSerbest === true,
      "destinationCaller sifir — attestation'i herkes gonderebilir",
      "bir adres belirlemek donusu tek bir adresin ayakta olmasina baglardi");
    ok(V(s.bekleyenSonra) === FON - GONDER, "bekleyen quote dustu");
    ok(s.fazlasiRed === true, "bekleyenden fazlasi gonderilemedi");
  }

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) console.error("  sebep: " + hataAdi(e.data));
  process.exit(1);
});
