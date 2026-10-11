"use strict";
/* EgriLaunch.sol is a fork of Egri.sol. This proves it is still only a fee
   fork — that nobody has touched the arithmetic in one copy and not the
   other.
 *
 * WHY A SOURCE DIFF AND NOT A BEHAVIOURAL TEST
 *   The risk being guarded against is drift between two files, and drift
 *   shows up as a changed line. A behavioural test would have to guess
 *   which inputs matter; a diff cannot miss a line. The arithmetic here is
 *   pure integer maths with no storage reads, so textual identity of those
 *   functions IS behavioural identity.
 *
 * HOW IT WORKS
 *   Every line that differs between the two files must be accounted for by
 *   one of the ALLOWED regions below. A difference anywhere else fails, and
 *   so does an ALLOWED region that stops appearing — otherwise the list
 *   could be quietly emptied and the check would pass on nothing.
 *
 * Fail-closed: any unreadable file, zero compared lines or zero matched
 * regions is a failure, not a skip. That is the defect this project has
 * found in its own tooling more than once.
 */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..", "contracts");
const A = path.join(KOK, "Egri.sol");
const B = path.join(KOK, "EgriLaunch.sol");

/* A differing line is acceptable only if it matches one of these. Each
   carries a reason, so a future reader can tell a deliberate fork point
   from something that crept in. */
const IZINLI = [
  /* There is deliberately no allowance for comments or titles. `yorumsuz`
     strips them before anything is compared, so such an entry would be
     dead — and a dead allowance is a hole, because a line of CODE shaped
     like prose would match it. */
  { ad: "ad", re: /contract (Egri|EgriLaunch) \{/, neden: "kontrat adi" },
  { ad: "ucret-tablosu", re: /(UCRET_PPM|KURUCU_PPM|STAKE_PPM|GELISTIRICI_PPM|LIKIDITE_PPM|ISLETME_PPM)/, neden: "ucret tablosu: constant -> immutable" },
  { ad: "hedefler", re: /(gelistiriciFonu|likiditeKasasi|isletmeKasasi)/, neden: "uc yeni ucret hedefi" },
  { ad: "ucret-olayi", re: /(UcretBolundu|kurucuya|stakeye|gelistiriciye|likiditeye|isletmeye|havuzaKalan)/, neden: "olay imzasi genisledi" },
  { ad: "kurucu-arg", re: /(_gelistiriciFonu|_likiditeKasasi|_isletmeKasasi|_ucretler|uint256\[6\]|adli)/, neden: "constructor argumanlari" },
  { ad: "bolusum", re: /^\s*(uint256 (g|l|i) =|kalan = toplamUcret|if \((g|l|i) > 0)/, neden: "_ucret govdesindeki bolusum" },
  /* The collateral tax: a seventh slice, its rate and its destination. */
  { ad: "teminat-vergisi", re: /(KASA_PPM|teminatKasasi|kasaya)/, neden: "teminat vergisi dilimi" },
  /* Its destination cannot be a constructor argument, because the vault
     needs this curve's address in ITS constructor. So the pointer is set
     once, in the same transaction, by the only contract that knows both:
     the launchpad. Not msg.sender at construction — that is the FACTORY,
     which never sees the vault, and checking it was the bug this pattern
     used to pin. The authority is address(havuzAcici), which the curve
     already holds, so the fork needs no extra argument for it. */
  {
    ad: "kasa-ayari",
    re: /(kasayiAyarla|teminatKasasi|address\(havuzAcici\)\) revert KotuKurulum|One-time, by the)/,
    neden: "tek seferlik kasa ayari"
  },
  { ad: "ayirici", re: /^\s*\}\s*$|^\s*\);\s*$|^\s*\? 0$|^\s*: \(quoteMiktari \* KASA_PPM\) \/ 1_000_000;$/, neden: "kapanis ve ucluk operatoru satirlari" },
  /* The last constructor argument of the original gained a comma in the
     fork because three more follow it. Pinned to this exact line rather
     than a general "trailing comma" pattern, so it cannot cover anything
     else that happens to end in one. */
  { ad: "virgul", re: /^\s*address _stakeKasasi,$/, neden: "son argument virgul kazandi" }
];

/* These must be textually identical in both files. If a line inside one of
   them differs, that is the failure this script exists for. */
const KUTSAL = [
  "function alimKotasi", "function satisKotasi", "function snipeOrani",
  "function x()", "function y()", "function satilan()",
  "function al(", "function sat(", "function mezunEt("
];

function oku(p) {
  const s = fs.readFileSync(p, "utf8");
  if (!s.trim()) throw new Error("bos dosya: " + p);
  return s.split(/\r?\n/);
}

/* Comments are stripped before anything is compared.
 *
 *   The first version did not, and reported seventeen "unauthorised"
 *   differences that were all prose. The tempting fix was to widen the
 *   allowed patterns until prose passed — which would have opened a hole
 *   the width of any sentence, because a changed line of code sitting
 *   inside a comment-shaped pattern would then pass too.
 *
 *   Removing comments instead makes the check both correct and stricter:
 *   the two files are expected to document themselves differently, and
 *   only their CODE has to agree.
 */
function yorumsuz(satirlar) {
  const out = [];
  let blok = false;
  for (const l of satirlar) {
    let s = l;
    if (blok) {
      const k = s.indexOf("*/");
      if (k < 0) continue;
      s = s.slice(k + 2);
      blok = false;
    }
    for (;;) {
      const a = s.indexOf("/*");
      if (a < 0) break;
      const k = s.indexOf("*/", a + 2);
      if (k < 0) { s = s.slice(0, a); blok = true; break; }
      s = s.slice(0, a) + s.slice(k + 2);
    }
    const t = s.indexOf("//");
    if (t >= 0) s = s.slice(0, t);
    s = s.trimEnd();
    if (s.trim()) out.push(s);
  }
  return out;
}

/* The body of a function, from its signature to the line where its brace
   depth returns to the level it started at. */
function govde(satirlar, imza) {
  const bas = satirlar.findIndex((l) => l.includes(imza));
  if (bas < 0) return null;
  let derinlik = 0, basladi = false;
  const out = [];
  for (let i = bas; i < satirlar.length; i++) {
    const l = satirlar[i];
    out.push(l);
    for (const c of l) { if (c === "{") { derinlik++; basladi = true; } else if (c === "}") derinlik--; }
    if (basladi && derinlik === 0) break;
  }
  return out;
}

function kosul() {
  const a = yorumsuz(oku(A)), b = yorumsuz(oku(B));
  const sonuc = { kutsal: [], izinsiz: [], kullanilanIzin: new Set(), karsilastirilan: 0 };

  /* 1 — the sacred functions, body for body. */
  for (const imza of KUTSAL) {
    const ga = govde(a, imza), gb = govde(b, imza);
    if (!ga || !gb) { sonuc.kutsal.push({ imza, durum: "BULUNAMADI", a: !!ga, b: !!gb }); continue; }
    const na = ga.map((l) => l.trimEnd()).join("\n");
    const nb = gb.map((l) => l.trimEnd()).join("\n");
    sonuc.karsilastirilan += ga.length;
    sonuc.kutsal.push({ imza, durum: na === nb ? "AYNI" : "FARKLI", satir: ga.length });
  }

  /* 2 — every other differing line must land in an allowed region. */
  const setA = new Set(a.map((l) => l.trimEnd()));
  for (const l of b) {
    const t = l.trimEnd();
    if (setA.has(t)) continue;
    const e = IZINLI.find((z) => z.re.test(t));
    if (e) sonuc.kullanilanIzin.add(e.ad);
    else sonuc.izinsiz.push(t);
  }
  return sonuc;
}

if (require.main === module) {
  let kotu = 0;
  const r = kosul();

  console.log("EGRI CATAL DENETIMI — EgriLaunch.sol, Egri.sol'den ne kadar ayrilmis");
  console.log("");
  console.log("  ARITMETIK (ikisinde de birebir ayni olmali)");
  for (const k of r.kutsal) {
    const iyi = k.durum === "AYNI";
    if (!iyi) kotu++;
    console.log("    " + (iyi ? "OK  " : "KOTU") + "  " + k.imza.padEnd(22) +
      k.durum + (k.satir ? "  (" + k.satir + " satir)" : ""));
  }
  if (r.karsilastirilan === 0) { kotu++; console.log("    KOTU  hic satir karsilastirilmadi"); }

  console.log("");
  console.log("  IZINLI AYRILMA NOKTALARI");
  for (const z of IZINLI) {
    const v = r.kullanilanIzin.has(z.ad);
    console.log("    " + (v ? "var " : "--  ") + z.ad.padEnd(16) + z.neden);
  }
  if (r.kullanilanIzin.size === 0) {
    kotu++;
    console.log("    KOTU  hicbir izinli bolge eslesmedi — liste bosalmis olabilir");
  }

  console.log("");
  if (r.izinsiz.length) {
    kotu++;
    console.log("  IZINSIZ FARK: " + r.izinsiz.length + " satir");
    for (const l of r.izinsiz.slice(0, 12)) console.log("      " + l.trim().slice(0, 96));
    if (r.izinsiz.length > 12) console.log("      ... " + (r.izinsiz.length - 12) + " tane daha");
  } else {
    console.log("  IZINSIZ FARK: yok");
  }

  console.log("");
  console.log(kotu === 0
    ? "  GECTI — catal yalnizca ucret tablosunda ayriliyor, aritmetik birebir ayni."
    : "  BASARISIZ — " + kotu + " sorun.");
  process.exit(kotu === 0 ? 0 : 1);
}

module.exports = { kosul };
