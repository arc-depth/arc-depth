"use strict";
/* ===========================================================================
 * denetim-dao-erisimi.js — DAO gerçekte neye dokunabiliyor
 *
 *   node scripts/denetim-dao-erisimi.js
 *
 * SORU
 *   Canlı Governor'ın teklif imzası `propose(string, address, bytes)`. Yani
 *   bir teklif HERHANGİ bir adrese HERHANGİ bir çağrı yapabilir. "DAO
 *   yalnızca izin verilen konularda karar alır" kuralı sözleşmenin
 *   imzasında yazılı DEĞİL.
 *
 *   O zaman kuralı ne tutuyor? Hedef sözleşmelerin kendisi. Bir DAO,
 *   yetkisi olmayan bir fonksiyonu çağırabilir — ama o çağrı döner. Dolayı-
 *   sıyla gerçek soru şu: hangi sözleşme Governor'ı yetkili sayıyor ve bu
 *   hangi fonksiyonları açıyor?
 *
 * NEDEN "ÇAĞIRABİLİR AMA DÖNER" YETERLİ BİR CEVAP
 *   Yetki beyaz listesini Governor'ın içine koymak daha gösterişli
 *   görünürdü ve daha zayıf olurdu: o liste değiştirilebilir bir durum
 *   olur ve onu değiştiren teklif de bir tekliftir. Teminat kasasının hiç
 *   sahibi ve hiç ayarlayıcısı olmaması ise değiştirilemez. Kısıt, DAO'nun
 *   nazik davranmasına değil, karşı tarafta dokunulacak bir kol
 *   olmamasına dayanıyor.
 *
 * BU DENETİM NE ZAMAN KIRMIZI YANAR
 *   Birisi kasalardan birine bir ayarlayıcı eklerse ya da bir sözleşme
 *   Governor'ı yetkili saymaya başlarsa. İkisi de sessiz değişiklikler ve
 *   ikisi de kullanıcının koyduğu kuralı geçersiz kılar: *"Kilitli
 *   likidite, teminat rezervleri, değiştirilemez ücretler ve kullanıcı
 *   varlıkları DAO tarafından değiştirilemesin."*
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const SRC = path.join(KOK, "contracts");

/* The things the user's rule says must stay out of reach, each mapped to
   the contract that holds it. */
const DOKUNULMAZ = [
  { ne: "teminat rezervleri", dosya: "TeminatKasasi.sol" },
  { ne: "zincirler arasi teminat", dosya: "KopruKasasi.sol" },
  { ne: "uzak teminat", dosya: "RemoteCollateralVault.sol" },
  { ne: "defter (hak hesabi)", dosya: "CrossChainAccounting.sol" },
  { ne: "zincir kaydi", dosya: "CrossChainAssetRegistry.sol" },
  { ne: "ucret tablosu ve kanca", dosya: "EgriHook.sol" },
  { ne: "egri aritmetigi", dosya: "Egri.sol" },
  { ne: "kilitli likidite", dosya: "LikiditeKasasi.sol" }
];

/* Patterns that would mean a privileged role exists at all. A contract with
   none of these has nothing for a DAO to reach. */
const YETKI = [
  { ad: "onlyOwner", kalip: /\bonlyOwner\b/ },
  { ad: "Ownable", kalip: /\bOwnable\b/ },
  { ad: "owner degiskeni", kalip: /\b(address\s+(public|internal|private)?\s*(immutable\s+)?owner\b)/ },
  { ad: "governor degiskeni", kalip: /\b(address\s+(public|internal|private)?\s*(immutable\s+)?(governor|yonetisim)\b)/i },
  { ad: "AccessControl", kalip: /AccessControl|hasRole|_grantRole/ },
  { ad: "pause", kalip: /\bpause\b|\b_pause\b|whenNotPaused/ },
  { ad: "upgrade", kalip: /upgradeTo|_authorizeUpgrade|UUPS|Proxy\b/ }
];

/* Setters. A pointer that can be repointed is the lever a DAO would pull. */
const AYARLAYICI_IZNI = {
  "KopruKasasi.sol": ["yoneticiyiAyarla"],
  "CrossChainAccounting.sol": ["yoneticiyiAyarla"]
};
const AYARLAYICI = /function\s+(set\w+|ayarla\w*|\w*Ayarla|update\w+|change\w+)\s*\(/g;

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

const temiz = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

console.log("DAO ERISIMI — teklif herhangi bir cagriyi yapabilir, peki ne TUTAR?");
console.log("");

console.log("1) DOKUNULMAZ OLMASI GEREKEN SOZLESMELERDE KOL VAR MI");
for (const d of DOKUNULMAZ) {
  const yol = path.join(SRC, d.dosya);
  if (!fs.existsSync(yol)) { ok(false, d.dosya + " bulunamadi"); continue; }
  const s = temiz(fs.readFileSync(yol, "utf8"));

  const bulunan = YETKI.filter((y) => y.kalip.test(s)).map((y) => y.ad);
  const ayarlar = (s.match(AYARLAYICI) || [])
    .map((x) => x.replace(/function\s+/, "").replace(/\s*\($/, ""));

  /* Two contracts have exactly one setter each, and both are the same
     pattern: the vault-manager circularity, settable ONCE by a caller
     that is not the DAO.

       KopruKasasi.yoneticiyiAyarla         onlyDeployer, while empty
       CrossChainAccounting.yoneticiyiAyarla  onlyVault, while empty

     Neither is reachable by a proposal: the first requires being the
     deployer, the second requires being the vault. They are named here
     rather than silently tolerated, because the pointer they set CAN
     write cross-chain transitions — a manager that could be swapped
     later could claim money is REMOTE when it is not, which would
     inflate the claim. Settable once is what makes that impossible. */
  const izinli = AYARLAYICI_IZNI[d.dosya] || [];
  const izinsizAyar = ayarlar.filter((a) => !izinli.includes(a));

  const sonuc = bulunan.length === 0 && izinsizAyar.length === 0;
  ok(sonuc, d.ne + " (" + d.dosya + ")",
    sonuc
      ? "yetkili rol yok, ayarlayici yok" +
        (izinli.length ? " (yalniz " + izinli.join(",") + ", bir kez)" : "")
      : [bulunan.length ? "ROL: " + bulunan.join(",") : "",
         izinsizAyar.length ? "AYARLAYICI: " + izinsizAyar.join(",") : ""]
        .filter(Boolean).join("  |  "));
}

console.log("");
console.log("2) GOVERNOR'IN ADI GECTIGI SOZLESMELER");
/* Every contract that names the governor, with what that authority
   actually unlocks. The list exists so that a NEW name shows up as a
   finding — a contract quietly starting to treat the DAO as privileged
   is how a permitted set grows without anybody deciding to grow it. */
const BEKLENEN = {
  "Governor.sol": "DAO'nun kendisi",
  "DevPool.sol": "gelistirici fonu dagitimi — DAO'nun ASIL isi",
  "GelistiriciFonu.sol": "gelistirici payinin biriktigi yer",
  "DepthGovernor.sol": "arc-depth'in ayri yonetisimi",
  "AlpLocker.sol": "ALP likiditesinin kilidi",
  "Hazine.sol": "hazine",
  /* The second permitted topic, and it was already built: hisseEkle /
     hisseKaldir curate WHICH stock may be launched and which wrapper
     backs it. `governor` there is immutable, so this authority can
     neither be revoked nor moved, and neither function touches money. */
  "LaunchQueue.sol": "launch menusu kuratorlugu — ikinci izinli konu"
};
const hepsi = fs.readdirSync(SRC).filter((f) => f.endsWith(".sol"));
const gecen = [];
for (const f of hepsi) {
  const s = temiz(fs.readFileSync(path.join(SRC, f), "utf8"));
  if (/\bgovernor\b|\byonetisim\b/i.test(s)) gecen.push(f);
}
for (const f of gecen) {
  console.log("   " + f.padEnd(26) + (BEKLENEN[f] || "<<< BEKLENMEYEN >>>"));
}
const beklenmeyen = gecen.filter((f) => !BEKLENEN[f]);
ok(beklenmeyen.length === 0,
  "GOVERNOR'I TANIYAN SOZLESME KUMESI BEKLENDIGI GIBI",
  beklenmeyen.length ? beklenmeyen.join(", ") : gecen.length + " sozlesme, hepsi listede");

console.log("");
console.log("3) DAO NUN GERCEK IZIN KUMESI — YAZDIRILAN DEGIL, SORULAN");
/* THIS SECTION USED TO BE FOUR console.log LINES
 *
 *   It printed a "YAPABILIR" list — developer fund, treasury, ALP lock,
 *   launch menu — as plain text. None of it was checked, and when it was
 *   finally measured, three of the four were false and the first was
 *   half false:
 *
 *     "gelistirici fonundan hibe dagitmak (DevPool / GelistiriciFonu)"
 *        GelistiriciFonu.tahsisci is the OPERATIONS WALLET and it is
 *        immutable. The DAO could never spend from it. That printed
 *        sentence is why the slice was repointed at a new DevPool.
 *
 *   Governance has since moved from ALP to FTHM, which changes the
 *   answer again: Hazine.governor and LaunchQueue.governor are the ALP
 *   governor and immutable, so the FTHM DAO cannot reach either.
 *
 * A printed claim cannot go red. Each one is now a question put to the
 * chain: read the target s own authority getter and compare it against
 * the governance that is actually in charge.
 *
 * Needs the network, so failing to reach it is reported as a failure.
 * An authority that could not be read is not an authority known to be
 * safe. */
(async () => {
  const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
  const { id } = require("ethers");
  const sel = (imza) => id(imza).slice(0, 10);
  const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

  const ham = async (to, imza) => {
    /* Arc hiz sinirini sert uyguluyor ve okunamayan bir yetki burada
       BASARISIZLIK sayiliyor — dogru karar, ama o zaman geri cekilme de
       digerleri kadar sabirli olmali. 900ms x 4 toplam 5 saniye ediyordu
       ve set icinde yetmedi. */
    for (let d = 0; d < 6; d++) {
      if (d > 0) await bekle(Math.min(2500 * Math.pow(2, d - 1), 20000));
      const r = await fetch(ARC_RPC, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to, data: sel(imza) }, "latest"] }),
        signal: AbortSignal.timeout(20000)
      }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
      if (r.result !== undefined) return { sonuc: r.result };
      const m = (r.error && r.error.message) || "";
      if (!/rate limit|too many|timeout|503|502|ECONNRESET|fetch failed/i.test(m)) {
        return { hata: m };
      }
    }
    return { hata: "okunamadi" };
  };
  const adresOku = async (to, imza) => {
    const r = await ham(to, imza);
    if (r.hata) return { hata: r.hata };
    return { adres: r.sonuc && r.sonuc.length >= 66
      ? "0x" + r.sonuc.slice(26, 66) : null };
  };
  const sayiOku = async (to, imza) => {
    const r = await ham(to, imza);
    return r.hata || !r.sonuc || r.sonuc === "0x" ? null : BigInt(r.sonuc);
  };

  const F = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
  const K = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse2.json"), "utf8"));
  const Y = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-yonetisim.json"), "utf8"));
  const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim.json"), "utf8"));

  const FTHM_GOV = F.governor;
  const ALP_GOV = Y.governor;
  const ISLETME = K.paylasilan.isletme;
  const esit = (x, y) => !!x && !!y && x.toLowerCase() === y.toLowerCase();
  const kim = (x) => !x ? "OKUNAMADI"
    : esit(x, FTHM_GOV) ? "FTHM GOVERNOR"
    : esit(x, ALP_GOV) ? "ALP GOVERNOR (emekli yonetisim)"
    : esit(x, ISLETME) ? "ISLETME CUZDANI"
    : x;

  /* Each claim, the contract that would have to agree, and whether the
     FTHM DAO is expected to hold it. */
  const IDDIA = [
    { ne: "gelistirici havuzundan odeme", hedef: K.arc.devPool,
      imza: "governor()", dao: true,
      neden: "her islemin %0,30 i buraya akiyor; DAO nun tek gercek yetkisi" },
    { ne: "eski gelistirici fonu", hedef: K.paylasilan.gelistiriciFonu,
      imza: "tahsisci()", dao: false,
      neden: "tahsisci isletme cuzdani ve immutable — yeni havuz bu yuzden kuruldu" },
    { ne: "hazineyi yonlendirmek", hedef: D.hazine,
      imza: "governor()", dao: false,
      neden: "Hazine.governor ALP governor i ve immutable; FTHM ona ulasamaz" },
    { ne: "launch menusu kuratorlugu",
      hedef: "0x98C2760E4514430b00325B4eeD92543aB80a0860",
      imza: "governor()", dao: false,
      neden: "LaunchQueue.governor ALP governor i; hisse kuyrugu da iptal edildi" },
    { ne: "ALP likiditesinin kilidi", hedef: Y.alpLocker,
      imza: "governor()", dao: false,
      neden: "AlpLocker da governor() diye bir sey yok — cagri doner" }
  ];

  console.log("   Yetkili yonetisim: FTHM " + FTHM_GOV);
  console.log("");
  let ulasildi = false;
  for (const i of IDDIA) {
    if (!i.hedef) { ok(false, i.ne + ": adres kaydi bulunamadi"); continue; }
    const r = await adresOku(i.hedef, i.imza);
    const okundu = !r.hata;
    if (okundu) ulasildi = true;
    const tutuyor = esit(r.adres, FTHM_GOV);
    console.log("   " + i.ne.padEnd(30) + i.imza.padEnd(13) +
      (okundu ? kim(r.adres) : "cagri doner / okunamadi"));
    /* A reverting getter proves the authority is absent, which is a
       valid way for a CANNOT to hold — but it can never prove a CAN. */
    ok(okundu ? tutuyor === i.dao : i.dao === false,
      (i.dao ? "DAO YAPABILIR: " : "DAO YAPAMAZ: ") + i.ne, i.neden);
    await bekle(200);
  }
  ok(ulasildi, "AGA ULASILDI — bu savlar zincirden okundu",
    ulasildi ? ARC_RPC
      : "hicbir yetki okunamadi; bu bolum hicbir sey dogrulamadi");

  console.log("");
  console.log("4) IZINLI KUMENIN ICINDEKI GERCEK RISK — saklanmiyor");
  console.log("   DAO nun bugun tek yetkisi DevPool dan odeme yapmak, ve");
  console.log("   DevPool un hedefi cagiranin verdigi bir adres. Yani gecen");
  console.log("   bir teklif parayi istedigi adrese odeyebilir. Bunu tutan");
  console.log("   sey sozlesme degil, surecin maliyeti.");
  console.log("");

  /* That cost, read rather than remembered: this script used to state
     "oy 2,54 gun, timelock 1,01 gun", which came from reading seconds as
     blocks and converting at Arc s block time. state() compares against
     block.timestamp, so the periods are seconds and the real figures are
     5 days and 2 days. */
  const gun = (v) => v == null ? "okunamadi" : (Number(v) / 86400).toFixed(2) + " gun";
  const oySure = await sayiOku(FTHM_GOV, "VOTING_PERIOD()");
  const kilit = await sayiOku(FTHM_GOV, "TIMELOCK()");
  const esikBps = await sayiOku(FTHM_GOV, "PROPOSAL_THRESHOLD_BPS()");
  const kotaBps = await sayiOku(FTHM_GOV, "QUORUM_BPS()");
  const stakeli = await sayiOku(F.stake, "totalStaked()");

  console.log("   oy suresi    " + gun(oySure) + "   (SANIYE, blok degil)");
  console.log("   timelock     " + gun(kilit));
  console.log("   teklif esigi %" + (esikBps == null ? "?" : Number(esikBps) / 100));
  console.log("   kota         %" + (kotaBps == null ? "?" : Number(kotaBps) / 100));

  ok(oySure != null && kilit != null && oySure > 0n && kilit > 0n,
    /* Adinda "KOTU" gecmiyor, ve bu bir uslup tercihi degil: hepsi.js
       sav sayilarini metinden /(KOTU|KALDI)/ ile cikariyor, yani
       savin ADI sayaci kirletiyordu — bu kosum her seferinde bir fazla
       basarisizlikla raporlaniyordu. */
    "SESSIZ BIR ODEME MUMKUN DEGIL — oy ve timelock sifir degil",
    "oy " + gun(oySure) + " + timelock " + gun(kilit) +
      ": bir teklif gecse bile parayi ayni gun hareket ettiremez");

  /* The state that makes all of the above moot today. Stated, not
     asserted: it is the current condition of the DAO, not a rule that
     must hold — the point of the activation work is to change it. */
  console.log("");
  ok(stakeli != null, "STAKE TOPLAMI OKUNABILDI",
    stakeli === null ? "okunamadi"
      : stakeli === 0n
        ? "totalStaked 0 — kimsenin oy gucu yok, teklif esigi gecilemez. " +
          "Dilim birikiyor ve kimse cekemiyor: ne DAO ne biz."
        : (Number(stakeli) / 1e18).toLocaleString("en") + " FTHM stake edilmis");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.log("");
  console.log("KOTU  denetim tamamlanamadi: " + e.message);
  process.exit(1);
});
