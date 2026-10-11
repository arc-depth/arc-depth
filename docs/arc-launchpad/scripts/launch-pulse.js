"use strict";
/* ===========================================================================
 * launch-pulse.js — dağıtılan yığında GERÇEK bir launch, sonra onu satın al
 *
 *   node scripts/launch-pulse.js              # her adımı fiyatlar, hiçbir şey göndermez
 *   node scripts/launch-pulse.js --uygula     # gönderir
 *
 * NEDEN BU BETİK VAR
 *   601 sav gerçek Arc PoolManager'ına karşı geçiyor ve
 *   `denetim-dagitim-pulse.js` çalışan kodun derlenen kodla bayt bayt aynı
 *   olduğunu 84 savla gösteriyor. İkisi de güçlü ve ikisi de bir launch
 *   değil: `launchCount()` sıfır, yani ürün hakkındaki her iddia hiç
 *   kullanılmamış bir sözleşmeye dayanıyor.
 *
 *   Dağıtılmış bir adres "çalışıyor" demek değil. Bu betik o farkı kapatıyor.
 *
 * NE ÖLÇÜYOR — VE BAŞKA HİÇBİR YERDE ÖLÇÜLEMEYEN ÜÇ ŞEY
 *   1. Bir yabancı sıradan dolarla bu tokeni satın alabiliyor mu
 *   2. O alım satımın vergisi teminat kasasına GERÇEKTEN ulaşıyor mu
 *   3. Biri çıkmak istediğinde kasa ödeme yapıyor mu
 *
 *   Enjekte edilmiş harness'larda üçü de ölçüldü. Burada zincirin kendisinde
 *   ölçülüyor ve fark şu: harness'ta kasayı ben kuruyorum, burada launchpad
 *   kuruyor ve kurduğu şeyin doğru olup olmadığı başka hiçbir yerde
 *   görünmüyor.
 *
 * GERİ ALINAMAYAN NE VAR
 *   Havuzun likiditesi kurulurken kilitleniyor ve hiç kimse tarafından geri
 *   çekilemez — tasarım bu. Yani havuza giden pay harcanmış, park edilmiş
 *   değil. Kasadaki teminat token yakarak geri alınabilir; havuz payı
 *   alınamaz. İki sayı da kuru çalışmada, hiçbir şey gönderilmeden yazılıyor.
 *
 * TEMİNAT NEDEN WETH
 *   Ölçüldü: WETH, ölçülen 73 varlığın en derini — Ethereum'da $20.000'lık
 *   dönüşümü 1,00 kat ittirmeyle kaldırıyor. Teminat hedefi yalnızca
 *   teminat uzak bir zincire taşındığında devreye giriyor; o güne kadar
 *   kasa quote tutuyor ve hak "quote / dolaşım" olarak hesaplanıyor.
 *
 *   Yani bu seçim bugün hiçbir şeyi değiştirmiyor ama yanlış seçilirse
 *   gelecekte düzeltilemez: hedef varlık uzak kasanın ilk fonlanmasında
 *   sabitleniyor ve bir daha değişmiyor.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const { Wallet, Interface, Transaction } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const ZINCIR = 5042;
const UYGULA = process.argv.includes("--uygula");

/* Ethereum's WETH. The deepest asset in the depth measurement, and the
   target only matters if collateral is ever moved off Arc. */
const HEDEF_VARLIK = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const HEDEF_ADI = "WETH (Ethereum)";

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf("--" + ad);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : varsayilan;
};

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/* Arc's public endpoint rate-limits hard and it already cost this project a
   half-finished deployment: the run died at step 8 of 9 with seven
   contracts live. Every call retries; a throttle costs seconds. */
let no = 1;
async function rpc(yontem, parametreler) {
  let son = null;
  for (let d = 0; d < 8; d++) {
    if (d > 0) await bekle(1200 * d);
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler }),
      signal: AbortSignal.timeout(45_000)
    }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
    if (r.result !== undefined) return r.result;
    son = (r.error && r.error.message) || "bilinmeyen";
    if (!/rate limit|too many|timeout|503|502|ECONNRESET|fetch failed/i.test(son)) {
      const e = new Error(son);
      e.data = r.error && r.error.data;
      throw e;
    }
  }
  throw new Error("uc nokta cevap vermedi: " + son);
}

const B = (ad) => JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));

/* Every revert signature in the build, so a refusal is reported by NAME.
   A bare 4-byte selector is indistinguishable from a wrong nonce or a
   missing function, and this project has already spent runs on that. */
const HATALAR = new Map();
function hatalariYukle() {
  const { id } = require("ethers");
  for (const f of fs.readdirSync(path.join(KOK, "build"))) {
    if (!f.endsWith(".json")) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(KOK, "build", f), "utf8")); } catch (e) { continue; }
    for (const x of (j.abi || [])) {
      if (x.type !== "error") continue;
      const imza = x.name + "(" + (x.inputs || []).map((i) => i.type).join(",") + ")";
      HATALAR.set(id(imza).slice(0, 10), imza);
    }
  }
}
const hataAdi = (veri) => {
  const s = String(veri || "");
  if (!s.startsWith("0x") || s.length < 10) return "veri yok";
  return HATALAR.get(s.slice(0, 10)) || ("bilinmeyen secici " + s.slice(0, 10));
};

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const T = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 4 });

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  hatalariYukle();

  const kayitYolu = path.join(KOK, "dagitim-pulse.json");
  if (!fs.existsSync(kayitYolu)) {
    console.log("dagitim-pulse.json yok. Once: node scripts/denetim-dagitim-pulse.js");
    process.exit(1);
  }
  const D = JSON.parse(fs.readFileSync(kayitYolu, "utf8"));
  const LP = D.arc.launchpad;
  const USDC = D.arc.quote;

  const lI = new Interface(B("EgriLaunchpad").abi);
  const kI = new Interface(B("KopruKasasi").abi);
  const eI = new Interface([
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
  ]);

  const anahtar = process.env.TRADER_PRIVATE_KEY || (() => {
    /* Read, never printed, never written anywhere. */
    const t = fs.readFileSync("C:/bot/.env", "utf8");
    const m = t.match(/^\s*TRADER_PRIVATE_KEY\s*=\s*(.+)\s*$/m);
    if (!m) throw new Error("TRADER_PRIVATE_KEY bulunamadi");
    return m[1].trim();
  })();
  const cuzdan = new Wallet(anahtar);

  const cagir = async (ifc, adres, fn, args) => {
    const ham = await rpc("eth_call", [
      { to: adres, data: ifc.encodeFunctionData(fn, args || []) }, "latest"]);
    return ifc.decodeFunctionResult(fn, ham);
  };
  const sabit = async (fn) => BigInt((await cagir(lI, LP, fn))[0]);

  console.log("CANLI LAUNCH — EgriLaunchpad yigini");
  console.log("  rpc        " + RPC);
  console.log("  launchpad  " + LP);
  console.log("  hook       " + D.arc.hook);
  console.log("  cuzdan     " + cuzdan.address);
  console.log("  kip        " + (UYGULA ? "UYGULA — GERCEK ISLEM, GERI ALINAMAZ" : "KURU CALISMA"));
  console.log("");

  /* ---- 1. the rules, from the contract itself -------------------- */
  console.log("1) SOZLESMENIN KENDI KURALLARI");
  const ASGARI_ODEME = await sabit("ASGARI_ODEME");
  await bekle(200);
  const ASGARI_TEMINAT = await sabit("ASGARI_TEMINAT");
  await bekle(200);
  const UCRET_PPM = await sabit("LAUNCH_UCRET_PPM");
  await bekle(200);
  const ARZ = await sabit("SUPPLY");
  await bekle(200);
  const ACILIS = await sabit("ACILIS_MCAP");
  await bekle(200);
  const ESIK = await sabit("ESIK");
  await bekle(200);
  const VERGI_VAR = await sabit("VERGI_VARSAYILAN_PPM");
  await bekle(200);
  const VERGI_MIN = await sabit("VERGI_ASGARI_PPM");
  await bekle(200);
  const VERGI_MAX = await sabit("VERGI_AZAMI_PPM");
  await bekle(200);
  const sayiOnce = await sabit("launchCount");

  console.log("     asgari odeme     " + U(ASGARI_ODEME));
  console.log("     asgari teminat   " + U(ASGARI_TEMINAT));
  console.log("     launch ucreti    " + (Number(UCRET_PPM) / 10_000).toFixed(2) + "%");
  console.log("     arz              " + T(ARZ) + " token (sabit, kurucu payi yok)");
  console.log("     acilis mcap      " + U(ACILIS));
  console.log("     mezuniyet esigi  " + U(ESIK));
  console.log("     vergi araligi    " + (Number(VERGI_MIN) / 10_000).toFixed(0) + "% - " +
    (Number(VERGI_MAX) / 10_000).toFixed(0) + "%   varsayilan " +
    (Number(VERGI_VAR) / 10_000).toFixed(0) + "%");
  console.log("     bugune kadar     " + sayiOnce + " launch");

  /* ---- 2. what this launch would be ----------------------------- */
  console.log("");
  console.log("2) BU LAUNCH");
  const ODEME = BigInt(Math.round(Number(arg("odeme", "100")) * 1e6));
  const TEMINAT = BigInt(Math.round(Number(arg("teminat", "30")) * 1e6));
  const VERGI = BigInt(arg("vergi", String(VERGI_VAR)));
  const ILK_ALIM = BigInt(Math.round(Number(arg("ilkalim", "0")) * 1e6));
  const AD = arg("ad", "Arc Pulse");
  const SEMBOL = arg("sembol", "PULSE");

  const ucret = (ODEME * UCRET_PPM) / 1_000_000n;
  const likidite = ODEME - ucret - TEMINAT;

  console.log("     ad / sembol      " + AD + " / " + SEMBOL);
  console.log("     odeme            " + U(ODEME));
  console.log("       - ucret        " + U(ucret) + "   (isletmeye)");
  console.log("       - teminat      " + U(TEMINAT) + "   (kasaya, token yakarak GERI ALINABILIR)");
  console.log("       - likidite     " + U(likidite) + "   (havuza, KILITLI — hic kimse cekemez)");
  console.log("     vergi            " + (Number(VERGI) / 10_000).toFixed(2) +
    "%   (her islemden kasaya)");
  console.log("     ilk alim         " + U(ILK_ALIM) +
    (ILK_ALIM > 0n ? "   (ayni fiyat, ayni snipe vergisi)" : ""));
  console.log("     teminat hedefi   " + HEDEF_ADI);
  console.log("                      " + HEDEF_VARLIK);

  ok(ODEME >= ASGARI_ODEME, "odeme asgarinin uzerinde",
    U(ODEME) + " >= " + U(ASGARI_ODEME));
  ok(TEMINAT >= ASGARI_TEMINAT, "teminat asgarinin uzerinde",
    U(TEMINAT) + " >= " + U(ASGARI_TEMINAT));
  ok(ODEME > ucret + TEMINAT, "havuza birakacak kadar kaliyor",
    U(likidite) + " likidite");
  ok(VERGI >= VERGI_MIN && VERGI <= VERGI_MAX, "vergi araligin icinde");

  /* ---- 3. can this wallet pay for it --------------------------- */
  console.log("");
  console.log("3) BU CUZDAN ODEYEBILIR MI");
  /* TWO READS OF ONE BALANCE, ON PURPOSE
     Arc's native balance is 18 decimals and its ERC20 USDC is 6, for the
     SAME money. Measured: 16473110094122734642 native = 16473110 ERC20 =
     $16.47, a ratio of exactly 1e12. Reading one with the other's
     formatter once produced a $497 BILLION deployment estimate. */
  const yerli = BigInt(await rpc("eth_getBalance", [cuzdan.address, "latest"]));
  await bekle(200);
  const erc = BigInt((await cagir(eI, USDC, "balanceOf", [cuzdan.address]))[0]);
  console.log("     yerli (18 ond)   " + U(yerli / 1_000_000_000_000n));
  console.log("     ERC20 (6 ond)    " + U(erc));
  ok(yerli / 1_000_000_000_000n === erc,
    "iki okuma ayni parayi soyluyor",
    "oran tam 1e12 — biri digerinin bicimleyicisiyle okunursa 1e12 kat sapar");

  const gerekli = ODEME + ILK_ALIM;
  const yeterli = erc >= gerekli;
  ok(yeterli, "BAKIYE BU LAUNCH ICIN YETERLI",
    yeterli ? U(erc) + " >= " + U(gerekli)
      : "EKSIK " + U(gerekli - erc) + " — " + U(erc) + " var, " + U(gerekli) +
        " gerekiyor. Launchpad'in ASGARI_ODEME'si bir sozlesme sabiti, " +
        "pazarlik yok.");

  /* ---- 4. would the call actually succeed ---------------------- */
  console.log("");
  console.log("4) CAGRI GERCEKTEN GECER MI");
  const sepet = [[HEDEF_VARLIK, 10_000]];
  const veri = lI.encodeFunctionData("launch",
    [AD, SEMBOL, sepet, VERGI, ODEME, TEMINAT, ILK_ALIM]);

  /* The allowance has to exist before the call can be simulated at all:
     launch() pulls the payment with transferFrom, so a dry run without it
     fails on the allowance and says nothing about the launch itself. */
  const izin = BigInt((await cagir(eI, USDC, "allowance", [cuzdan.address, LP]))[0]);
  console.log("     mevcut izin      " + U(izin));
  const izinGerek = izin < gerekli;

  if (!yeterli || izinGerek) {
    console.log("     simulasyon atlandi: " +
      (!yeterli ? "bakiye yetersiz" : "izin verilmemis") +
      " — bu durumda cagri launch'a hic gelmeden transferFrom'da doner, ");
    console.log("     yani 'gecer mi' sorusuna cevap vermez.");
    ok(false, "LAUNCH SIMULASYONU YAPILAMADI",
      !yeterli ? "once bakiye" : "once izin");
  } else {
    try {
      const ham = await rpc("eth_call", [
        { from: cuzdan.address, to: LP, data: veri, gas: "0x1c9c380" }, "latest"]);
      const [token, egri] = lI.decodeFunctionResult("launch", ham);
      console.log("     token olacak     " + token);
      console.log("     egri olacak      " + egri);
      ok(true, "LAUNCH SIMULASYONDA GECTI", "zincir kabul ediyor");
    } catch (e) {
      console.log("     revert: " + hataAdi(e.data));
      ok(false, "LAUNCH SIMULASYONDA REDDEDILDI", hataAdi(e.data));
    }
  }

  /* ---- 5. what cannot be undone ------------------------------- */
  console.log("");
  console.log("5) GERI ALINAMAYANLAR — gonderilmeden once yaziliyor");
  console.log("     " + U(likidite) + " havuza kilitlenir ve HIC KIMSE cekemez.");
  console.log("     " + U(ucret) + " isletmeye gider, geri gelmez.");
  console.log("     " + U(TEMINAT) + " kasaya gider ve token yakarak GERI ALINABILIR.");
  console.log("     Teminat hedefi (" + HEDEF_ADI + ") uzak kasanin ilk");
  console.log("     fonlanmasinda sabitlenir ve bir daha DEGISMEZ.");

  if (!UYGULA) {
    console.log("");
    console.log("  KURU CALISMA BITTI — hicbir islem gonderilmedi.");
    if (!yeterli) {
      console.log("");
      console.log("  FONLAMA GEREKIYOR:");
      console.log("    " + cuzdan.address + "   Arc uzerinde " +
        U(gerekli - erc) + " USDC");
      console.log("  Arc'ta USDC hem quote hem gaz tokeni, yani ayrica gaz");
      console.log("  gondermek gerekmiyor.");
    } else {
      console.log("");
      console.log("  Hazir:  node scripts/launch-pulse.js --uygula");
    }
    console.log("");
    console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
    process.exit(kotu === 0 ? 0 : 1);
  }

  if (kotu > 0) {
    console.log("");
    console.log("DURDURULDU — kuru calismada " + kotu + " sav gecmedi.");
    console.log("Gecmeyen bir savla gercek islem gondermek, savi hic");
    console.log("yazmamakla ayni sey.");
    process.exit(1);
  }

  /* ---- 6. send it -------------------------------------------- */
  console.log("");
  console.log("=== UYGULA ===");
  console.log("");

  const gonder = async (ad, to, data) => {
    const nonce = Number(BigInt(await rpc("eth_getTransactionCount",
      [cuzdan.address, "latest"])));
    let gaz;
    try {
      gaz = BigInt(await rpc("eth_estimateGas",
        [{ from: cuzdan.address, to, data }]));
    } catch (e) {
      console.log("  " + ad + ": gaz tahmini basarisiz — " + hataAdi(e.data));
      throw e;
    }
    const ucretVerisi = BigInt(await rpc("eth_gasPrice", []));
    const islem = Transaction.from({
      to, data, nonce, chainId: ZINCIR,
      gasLimit: (gaz * 13n) / 10n,
      maxFeePerGas: ucretVerisi * 2n,
      maxPriorityFeePerGas: 0n,
      type: 2
    });
    islem.signature = cuzdan.signingKey.sign(islem.unsignedHash);
    const hash = await rpc("eth_sendRawTransaction", [islem.serialized]);
    for (let i = 0; i < 60; i++) {
      await bekle(2000);
      const mk = await rpc("eth_getTransactionReceipt", [hash]);
      if (mk) {
        if (BigInt(mk.status) !== 1n) throw new Error(ad + ": islem BASARISIZ " + hash);
        console.log("  " + ad.padEnd(22) + "blok " + Number(BigInt(mk.blockNumber)) +
          "   gaz " + Number(BigInt(mk.gasUsed)).toLocaleString("en"));
        return mk;
      }
    }
    throw new Error(ad + ": makbuz gelmedi " + hash);
  };

  if (izinGerek) {
    await gonder("izin", USDC, eI.encodeFunctionData("approve", [LP, gerekli]));
  }
  const mk = await gonder("launch", LP, veri);

  /* ---- 7. did it actually do what it said -------------------- */
  console.log("");
  console.log("7) ZINCIRDEN DOGRULAMA — betigin dedigi degil, zincirin dedigi");
  await bekle(1500);
  const sayiSonra = await sabit("launchCount");
  ok(sayiSonra === sayiOnce + 1n, "launch sayisi bir artti",
    sayiOnce + " -> " + sayiSonra);

  await bekle(300);
  const k = (await cagir(lI, LP, "launchAt", [sayiSonra - 1n]))[0];
  console.log("     token     " + k.token);
  console.log("     egri      " + k.egri);
  console.log("     kasa      " + k.kasa);
  console.log("     yonetici  " + k.yonetici);
  console.log("     hedef     " + k.hedefVarlik);
  console.log("     kurucu    " + k.kurucu);

  ok(k.kurucu.toLowerCase() === cuzdan.address.toLowerCase(),
    "kurucu bu cuzdan", k.kurucu);
  ok(k.hedefVarlik.toLowerCase() === HEDEF_VARLIK.toLowerCase(),
    "teminat hedefi istenen varlik", k.hedefVarlik);
  ok(BigInt(k.vergiPpm) === VERGI, "vergi istenen oran",
    (Number(k.vergiPpm) / 10_000).toFixed(2) + "%");

  /* The vault must hold the collateral, read from the token contract and
     not from the ledger: a ledger that says the right number while the
     balance says another is exactly the drift this project measured once,
     $25.42 real against $20.00 booked. */
  await bekle(300);
  const kasaBakiye = BigInt((await cagir(eI, USDC, "balanceOf", [k.kasa]))[0]);
  console.log("     kasada    " + U(kasaBakiye));
  ok(kasaBakiye >= TEMINAT, "KASA TEMINATI GERCEKTEN TUTUYOR",
    U(kasaBakiye) + " >= " + U(TEMINAT) + " — defterden degil USDC " +
      "sozlesmesinden okundu");

  await bekle(300);
  const arz = BigInt((await cagir(eI, k.token, "totalSupply"))[0]);
  const sembol = (await cagir(eI, k.token, "symbol"))[0];
  ok(arz === ARZ, "arz sozlesmenin sabitiyle ayni", T(arz) + " " + sembol);

  /* And the claim: quote over circulating. The one number a holder's
     money depends on. */
  try {
    await bekle(300);
    const hak = BigInt((await cagir(kI, k.kasa, "hak", [USDC]))[0]);
    console.log("     hak       " + hak.toString() + " (token basina ham birim)");
    ok(hak > 0n, "KASA TOKEN BASINA BIR HAK HESAPLIYOR",
      "hak = quote / dolasim; sifir olsa teminat kimseye ait olmazdi");
  } catch (e) {
    ok(false, "hak okunamadi", hataAdi(e.data));
  }

  const kayit = {
    olculdu: new Date().toISOString(),
    launchId: Number(sayiSonra - 1n),
    blok: Number(BigInt(mk.blockNumber)),
    token: k.token, egri: k.egri, kasa: k.kasa, yonetici: k.yonetici,
    hedefVarlik: k.hedefVarlik, kurucu: k.kurucu,
    sembol, ad: AD,
    odeme: ODEME.toString(), ucret: ucret.toString(),
    teminat: TEMINAT.toString(), likidite: likidite.toString(),
    vergiPpm: Number(VERGI),
    not: "Havuza giden " + U(likidite) + " KILITLI ve hic kimse cekemez. " +
      "Kasadaki " + U(TEMINAT) + " token yakarak geri alinabilir."
  };
  fs.writeFileSync(path.join(KOK, "launch-pulse.json"), JSON.stringify(kayit, null, 1));

  console.log("");
  console.log("  kayit: launch-pulse.json");
  console.log("");
  console.log("  SIRADAKI — ve bunlar olculmeden urun calisiyor sayilmaz:");
  console.log("    1. Bir yabanci bu tokeni sirf USDC ile alabiliyor mu");
  console.log("    2. O alimin vergisi kasaya ulasiyor mu");
  console.log("    3. Token yakan biri kasadan parasini alabiliyor mu");
  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) console.error("  revert: " + hataAdi(e.data));
  process.exit(1);
});
