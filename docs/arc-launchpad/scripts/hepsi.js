"use strict";
/* ===========================================================================
 * hepsi.js — run every audit and every suite, in order, and say what broke
 *
 *   node scripts/hepsi.js            # everything
 *   node scripts/hepsi.js --hizli    # only the offline audits
 *
 * WHY THIS HAD TO EXIST
 *   There are fourteen suites and no entry point, so running "the tests"
 *   meant remembering fourteen filenames. The predictable thing happened:
 *   the fee audit compared the fee TABLE between two contracts and passed
 *   for weeks while the hook's fee ARITHMETIC underflowed on every sell,
 *   because no suite had ever put a swap through the hook and nothing
 *   pointed that out. A suite nobody runs is not a test, and a suite nobody
 *   can run in one command is a suite nobody runs.
 *
 * ORDER IS DELIBERATE
 *   The offline audits go first because they are instant and they fail on
 *   the things that make everything downstream meaningless — a fork that
 *   drifted, a fee table that disagrees with itself, a contract that gained
 *   a DELEGATECALL, a vault that gained a way to send collateral somewhere.
 *   No point measuring prices against a vault that can be emptied.
 *
 *   The chain suites then run one at a time. Not for tidiness: the public
 *   RPC rate-limits, and a suite that fails because the one before it used
 *   up the quota reports a problem that is not there.
 * =========================================================================== */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const KOK = path.join(__dirname, "..");

/* Each entry is one script. `ag` marks the ones that need the chain, so
   --hizli can skip them; `sure` is a generous timeout, because a hung
   suite that never returns is worse than one that fails. */
const ISLER = [
  /* ---- offline: source and bytecode, no network ------------------- */
  { ad: "derle",                   dosya: "derle.js",                   ag: false, sure: 900_000,
    neden: "her sey derleniyor mu" },
  { ad: "egri-catal-denetimi",     dosya: "egri-catal-denetimi.js",     ag: false, sure: 60_000,
    neden: "EgriLaunch'in aritmetigi Egri ile birebir ayni mi" },
  { ad: "egri-ucret-denetimi",     dosya: "egri-ucret-denetimi.js",     ag: false, sure: 60_000,
    neden: "ucret tablosu iki kontratta ayni mi" },
  { ad: "denetim-kasa-cikislari",  dosya: "denetim-kasa-cikislari.js",  ag: false, sure: 60_000,
    neden: "kasadan varlik kac yoldan ve nereye cikabilir" },
  { ad: "degismezlik",             dosya: "degismezlik.js",             ag: false, sure: 120_000,
    neden: "DELEGATECALL/SELFDESTRUCT yok, kod degistirilemez" },
  { ad: "denetim-geri-alim-esligi", dosya: "denetim-geri-alim-esligi.js", ag: false, sure: 60_000,
    neden: "iki kasanin geri alim sabitleri ve aritmetigi hala ayni mi" },
  { ad: "denetim-boyut",            dosya: "denetim-boyut.js",            ag: false, sure: 60_000,
    neden: "her uretim sozlesmesi EIP-170 ve EIP-3860 icinde mi — on bir boyut uyarisi gozle ayiklanmaz" },
  /* ag: true, cunku bu denetimin DOGASI DEGISTI. Eskiden yalnizca
     kaynak okuyordu ve yazdirdigi "YAPABILIR" listesi hic dogrulanmiyordu;
     simdi her iddiayi zincire soruyor. Kayitta ag: false kalmasi, --hizli
     modunda calisip hiz sinirina takilmasina ve okunamayan yetkiyi
     BASARISIZLIK olarak bildirmesine yol aciyordu — dogru davranis, yanlis
     yerde. */
  { ad: "denetim-dao-erisimi",      dosya: "denetim-dao-erisimi.js",      ag: true,  sure: 180_000,
    neden: "DAO neye dokunabiliyor — her iddia ZINCIRDEN soruluyor" },
  { ad: "denetim-sayfa",           dosya: "denetim-sayfa.js",           ag: false, sure: 60_000,
    neden: "arayuzun ithalatlari cozuluyor ve alintiladigi sabitler sozlesmeyle ayni" },

  /* ---- on chain: real Arc, eth_call with state override ----------- */
  { ad: "olc-besleyiciler",        dosya: "olc-besleyiciler.js",        ag: true,  sure: 900_000,
    neden: "34 Chainlink proxy'si sozlesmeden okunabiliyor mu" },
  { ad: "olc-evren",               dosya: "olc-evren.js",               ag: true,  sure: 600_000,
    neden: "bes varlikli teminat menusu kuruluyor mu" },
  { ad: "olc-zincirler-arasi",     dosya: "olc-zincirler-arasi.js",     ag: true,  sure: 900_000,
    neden: "CCTP yalnizca USDC tasiyor, davetsiz transfer tabani buyutuyor" },
  { ad: "olc-zincir-engeli",       dosya: "olc-zincir-engeli.js",       ag: true,  sure: 600_000,
    neden: "ASAMA 1: eski kasanin muhasebe acigi, sayiyla" },
  { ad: "olc-zincir-muhasebe",     dosya: "olc-zincir-muhasebe.js",     ag: true,  sure: 600_000,
    neden: "ASAMA 2: uc kovali defter acigi kapatiyor mu" },
  { ad: "olc-zincir-yonetici",     dosya: "olc-zincir-yonetici.js",     ag: true,  sure: 900_000,
    neden: "ASAMA 2: hedef turetiliyor, yedi kontrol, durum makinesi, tam tur" },
  { ad: "olc-uzak-kasa",           dosya: "olc-uzak-kasa.js",           ag: true,  sure: 900_000,
    neden: "ASAMA 3: fabrika/kayit/dagitim adresleri ayni, uzak kasanin tek cikisi Arc" },
  { ad: "olc-gercek-cctp",         dosya: "olc-gercek-cctp.js",         ag: true,  sure: 600_000,
    neden: "ASAMA 4: gercek CCTP cagrimizi kabul ediyor, bakiye tam dustu" },
  { ad: "olc-kopru-uctan-uca",     dosya: "olc-kopru-uctan-uca.js",     ag: true,  sure: 600_000,
    neden: "ASAMA 4: yonetici->kasa->gercek CCTP, hak oynamiyor" },
  { ad: "olc-asenkron-iade",       dosya: "olc-asenkron-iade.js",       ag: true,  sure: 600_000,
    neden: "ASAMA 8: kuyruklu iade hakki oynatmiyor, sira atlanamiyor, borc harcanamiyor" },
  /* One suite, two chains. It replaced olc-ethereum-varis.js and
     olc-yurutucu-soygunu.js, whose assertions were carried into it
     first — the balance accounting and the floor-gap bound. Two files
     testing the same contract paths is how a copied check agrees with
     itself while the thing it checks is broken. */
  { ad: "olc-varis-zinciri",       dosya: "olc-varis-zinciri.js",       ag: true,  sure: 900_000,
    neden: "ASAMA 5-10: varis tarafi Ethereum VE Base uzerinde; taban kasanin, dusman yurutucu reddediliyor" },
  /* The indexer compares its OWN derived numbers against the chain.
     It reports ATLANDI (75) when the scan has not reached the tip, because
     an unfinished backfill is not a broken indexer — and conflating the
     two in either direction would make this suite useless. */
  { ad: "denetim-indeks",           dosya: "denetim-indeks.js",           ag: true,  sure: 900_000,
    neden: "indekslenen sahip bakiyeleri zincirdeki balanceOf ile tutuyor mu, her mumun arkasinda gercek takas var mi" },
  { ad: "olc-oracle",              dosya: "olc-oracle.js",              ag: true,  sure: 600_000,
    neden: "deger adaptoru dort olcegi dogru cevirir mi" },
  { ad: "olc-varlik-kayit",        dosya: "olc-varlik-kayit.js",        ag: true,  sure: 600_000,
    neden: "kayit yanlis varligi reddediyor mu" },
  { ad: "olc-teminat-kasasi",      dosya: "olc-teminat-kasasi.js",      ag: true,  sure: 600_000,
    neden: "iade hakki korur, geri alim sulandirmaz" },
  { ad: "olc-egri",                dosya: "olc-egri.js",                ag: true, emekli: true,  sure: 600_000,
    neden: "egri aritmetigi" },
  { ad: "olc-egri-launch",         dosya: "olc-egri-launch.js",         ag: true, emekli: true,  sure: 900_000,
    neden: "launch gercekten oluyor, havuz aciliyor" },
  { ad: "olc-egri-ucret",          dosya: "olc-egri-ucret.js",          ag: true, emekli: true,  sure: 900_000,
    neden: "egrinin ucreti bes adrese dagiliyor" },
  { ad: "olc-cevirme",             dosya: "olc-cevirme.js",             ag: true,  sure: 1_200_000,
    neden: "cevir() gercek cirBTC havuzunda, yedi red dogru hatayla" },
  { ad: "olc-mezuniyet",           dosya: "olc-mezuniyet.js",           ag: true, emekli: true,  sure: 900_000,
    neden: "egri dolunca ayni havuz derinlesir, fazla kasaya gider" },
  { ad: "olc-havuz-fiyat",         dosya: "olc-havuz-fiyat.js",         ag: true,  sure: 900_000,
    neden: "CA'dan turetilen fiyat havuzun kendi fiyatiyla ayni, ve islem bu buyuklukte gecer mi" },
  { ad: "olc-teminat-secimi",      dosya: "olc-teminat-secimi.js",      ag: true,  sure: 900_000,
    neden: "teminat ekraninin kendi kodu gercek zincirlere karsi: gecmesi gerekenler VE reddedilmesi gerekenler" },
  { ad: "olc-teminat-derinlik",    dosya: "olc-teminat-derinlik.js",    ag: true,  sure: 1_800_000,
    neden: "hangi varlik hangi buyuklukte gercekten donusturulebiliyor — oneri listesinin kaynagi" },
  { ad: "olc-kurucu-ilk-alim",     dosya: "olc-kurucu-ilk-alim.js",     ag: true,  sure: 600_000,
    neden: "kurucunun payi acilis fiyatindan net odemesinin tam karsiligi mi — bedava token yok" },
  { ad: "olc-pulse-acici",         dosya: "olc-pulse-acici.js",         ag: true,  sure: 900_000,
    neden: "havuz acilis fiyatinda aciliyor ve IKI TARAF da iniyor; tek yonlu yerlestirme bir kez $0,00 dondurup basarili gorunmustu" },
  { ad: "olc-pulse-launch",        dosya: "olc-pulse-launch.js",        ag: true,  sure: 900_000,
    neden: "yeni launch KODU uctan uca: kurucu payi, teminat, dolasim havuzu disliyor mu" },
  { ad: "denetim-dagitim-pulse2",  dosya: "denetim-dagitim-pulse2.js",  ag: true,  sure: 900_000,
    neden: "ZINCIRDEKI kod derlenen kod mu, ve uc halka iki uctan kapali mi" },
  { ad: "olc-pulse-canli",         dosya: "olc-pulse-canli.js",         ag: true,  sure: 900_000,
    neden: "DAGITILMIS launchpad ISE YARIYOR mu — alti sey sirayla ve ayni para uzerinde" },
  { ad: "olc-pazar",               dosya: "olc-pazar.js",               ag: true,  sure: 600_000,
    neden: "%80/%20 bolunuyor mu, SOZLESMEDE PARA KALIYOR MU, kapilar reddediyor mu" },
  { ad: "olc-pazar-canli",         dosya: "olc-pazar-canli.js",         ag: true,  sure: 600_000,
    neden: "ANA AGDAKI pazar ise yariyor mu — kayit, yayin, satis ve bolusme ucdan uca" },
  { ad: "olc-geri-alim-canli",     dosya: "olc-geri-alim-canli.js",     ag: true,  sure: 2_400_000,
    neden: "geri alim, cokus, kalkan, bosaltma — gercek havuzda" }
];

const hizli = process.argv.includes("--hizli");
/* The full compile is five minutes and is the right default — a stale
   build/ is exactly how a fixed contract appeared to change nothing
   once already, because the vault is embedded in the launchpad which is
   embedded in the harness. Skippable, not optional by accident. */
const derlemeden = process.argv.includes("--derlemeden");

/* TWO VOCABULARIES, AND ONE OF THEM WAS INVISIBLE
     Most runs print PASS and KOTU. The two deployment audits print OK and
     KALDI — written earlier, against a different habit — and the counter
     only looked for the first pair.

     So every total reported here silently omitted 61 assertions: 27 from
     denetim-dagitim and 34 from denetim-dagitim-pulse2. The headline said
     674 when the figure was 735, and the two audits missing were the ones
     that compare DEPLOYED bytecode against compiled bytecode.

     Failures were never lost: the exit code decides whether a run counts
     as broken, and a KALDI exits 1. What was lost is the evidence of work
     that WAS done — the other half of being honest about a number. */
/* SATIRA BAGLI, KELIMEYE DEGIL
     Bu desenler kelimeyi ciktinin HER YERINDE ariyordu, yani bir savin
     ADI ya da bir notun icindeki kelime sayaci kirletiyordu. Bugun ikisi
     de oldu: "KOTU BIR ODEME SESSIZ DEGIL" adli gecen bir sav her kosumda
     bir fazla BASARISIZLIK olarak raporlandi, ve bir yorumdaki "prints
     PASS" bir fazla gecen sav olarak sayildi.

     Savlar satir basinda basiliyor ("  PASS  ad   not"), o yuzden desen
     satira baglandi. Bes denetim uzerinde olculdu: toplamlar aynen ayni
     kaldi, yalnizca metinden gelen yanlis sayim dustu.

     Yon onemli: eski desen yalnizca fazla sayiyordu, yani is daha kotu
     gorunuyordu. Ama ayni tuzak bir notun icinde "PASS" yazarak ters
     yone de calisabilirdi — ve o yon sessizce iyi gosterir. */
const KELIME_GECTI = /^\s*(PASS|OK)\b/gm;
const KELIME_KALDI = /^\s*(KOTU|KALDI)\b/gm;

function kosa(is) {
  const yol = path.join(__dirname, is.dosya);
  if (!fs.existsSync(yol)) return { durum: "YOK", pass: 0, kotu: 0, cikti: "" };
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [yol], {
    cwd: KOK, timeout: is.sure, encoding: "utf8", maxBuffer: 64 * 1024 * 1024
  });
  const sn = ((Date.now() - t0) / 1000).toFixed(0);
  const cikti = (r.stdout || "") + (r.stderr || "");
  if (r.error && r.error.code === "ETIMEDOUT") return { durum: "ASTI", pass: 0, kotu: 1, cikti, sn };
  const pass = (cikti.match(KELIME_GECTI) || []).length;
  const kotu = (cikti.match(KELIME_KALDI) || []).length;
  /* The exit code decides, not the word count. A suite that prints nothing
     and exits 0 is fine; a suite that prints PASS lines and exits 1 is
     not, and counting words would call that one green. */
  /* 75 means the suite found its prerequisite missing and said so. A
     local fork that is not running is not a defect, and marking it KOTU
     would train us to ignore a red line. It is counted separately and
     printed, because a suite that quietly never runs is not a suite. */
  if (r.status === 75) return { durum: "ATLANDI", pass, kotu: 0, cikti, sn };
  return { durum: r.status === 0 ? "GECTI" : "KOTU", pass, kotu, cikti, sn };
}

const sonuclar = [];
let basarisiz = 0;

console.log("ARC PULSE — BUTUN DENETIMLER VE KOSUMLAR");
console.log(hizli ? "  --hizli: yalnizca zincire cikmayanlar"
                  : "  tamami (zincir kosumlari sirayla, RPC kotasi icin)");
if (derlemeden) console.log("  --derlemeden: build/ oldugu gibi kullanilacak");
console.log("");

for (const is of ISLER) {
  if (hizli && is.ag) continue;
  if (derlemeden && is.ad === "derle") continue;
  process.stdout.write("  " + is.ad.padEnd(26) + " ... ");
  const s = kosa(is);
  sonuclar.push({ is, s });
  if (s.durum !== "GECTI" && s.durum !== "ATLANDI") basarisiz++;
  console.log(s.durum.padEnd(6) +
    (s.pass ? "  " + s.pass + " PASS" : "") +
    (s.kotu ? "  " + s.kotu + " KOTU" : "") +
    (s.sn ? "   " + s.sn + "s" : ""));
}

console.log("");
console.log("  ------------------------------------------------------------");
let toplamPass = 0;
for (const { is, s } of sonuclar) toplamPass += s.pass;
const atlanan = sonuclar.filter((x) => x.s.durum === "ATLANDI");
/* TWO TOTALS, AND THE HEADLINE IS THE LIVE ONE
     The retired generation runs still pass and still run — deleting them
     would throw away a measurement history that cost real money. But
     counting them in one number would report assertions about a stack
     nobody will ever use, which is the same dishonesty as a vacuous
     check: confidence that was not earned about the thing that matters.

     They are kept because a regression in them would mean something
     changed in shared code that was not supposed to. */
const emekliler = sonuclar.filter((x) => x.is.emekli);
const canlilar = sonuclar.filter((x) => !x.is.emekli);
let canliPass = 0, emekliPass = 0;
for (const { s: r } of canlilar) canliPass += r.pass;
for (const { s: r } of emekliler) emekliPass += r.pass;
if (emekliler.length > 0) {
  console.log("  CANLI NESIL   " + canlilar.length + " kosum, " +
    canliPass + " sav");
  console.log("  EMEKLI NESIL  " + emekliler.length + " kosum, " +
    emekliPass + " sav   (egri ve mezuniyet — artik kullanilmayan yigin)");
  console.log("  ------------------------------------------------------------");
}
console.log("  " + sonuclar.length + " kosum, " + toplamPass + " sav gecti, " +
  basarisiz + " kosum basarisiz" +
  (atlanan.length ? ", " + atlanan.length + " kosum ONKOSULSUZ ATLANDI" : ""));
for (const { is, s } of atlanan) {
  console.log("    ATLANDI  " + is.ad + "  —  " + is.neden);
  for (const l of s.cikti.split(/\r?\n/).filter((l) => /ATLANDI|anvil/.test(l)))
    console.log("      " + l.trim());
}
console.log("");

/* Only the failures get their output printed. A wall of green scrolls the
   one thing worth reading off the screen. */
for (const { is, s } of sonuclar) {
  if (s.durum === "GECTI" || s.durum === "ATLANDI") continue;
  console.log("  ============================================================");
  console.log("  " + is.ad + "  —  " + is.neden);
  console.log("  ============================================================");
  const satirlar = s.cikti.split(/\r?\n/);
  const ilgili = satirlar.filter((l) => /KOTU|HATA|Error|revert|asti/i.test(l));
  for (const l of (ilgili.length ? ilgili : satirlar.slice(-25))) console.log("   " + l);
  console.log("");
}

if (basarisiz === 0) {
  console.log("  HEPSI GECTI");
} else {
  console.log("  " + basarisiz + " KOSUM BASARISIZ");
}
process.exit(basarisiz === 0 ? 0 : 1);
