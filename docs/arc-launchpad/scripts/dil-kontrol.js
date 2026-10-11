"use strict";
/* ===========================================================================
 * dil-kontrol.js — is any Turkish text left in the interface?
 *
 * KURAL
 *   Every public surface is English: the site, the X account, the
 *   banner, the posts. Conversation with the user stays Turkish — what
 *   changed is the product's language, not ours.
 *
 * WHY A SEPARATE MODULE
 *   This check needs several regular expressions, and writing them into
 *   the audit file through a generator script backfired three times in
 *   one day: the shell eats a backslash, sed eats a backslash, and a JS
 *   string eats a backslash. Written directly here, escaping stops being
 *   a problem at all.
 *
 * ONLY STRINGS ARE COUNTED
 *   Comments are written for whoever reads the code; a user never sees
 *   them. They are tracked separately, because what this assertion is
 *   for is the product surface.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

/* Letters that only Turkish has. Shared letters ("a", "i") tell nothing
   apart.

   â, î and û were added after the fact: the module name "Kâr / Zarar"
   survived three separate sweeps because the circumflex vowels were not
   on this list, and it was a label the user could see. */
const TR = /[çğıöşüâîûÇĞİÖŞÜÂÎÛ]/;

/* SPECIAL LETTERS ARE NOT ENOUGH — A LEAK SHOWED THIS LIMIT
 *
 * A string on the marketplace screen starting "Sayfadaki oran (" survived
 * the translation and this check never saw it: it contains no ç, ğ, ı, ö,
 * ş or ü. Most of Turkish can be written in plain ASCII, so "look for a
 * special letter" is quietly incomplete.
 *
 * Hence a second test: words that occur only in Turkish and could not
 * stand alone in an English sentence. The list is deliberately narrow —
 * the goal is not to catch every Turkish sentence but to catch the ones
 * without special letters too.
 *
 * What is NOT on the list, and why:
 *   "yok"     a CSS class ("yok", "yok__baslik") — false alarm
 *   "en"      appears in the "en-GB" locale code
 *   "var"     also a JS keyword, and it shows up inside strings
 *   "toplam"  part of ABI names such as "toplamHasilat"
 *   "daha"    a route id ("#/daha", "gorunum/daha.js")
 *
 * Contract and ABI names are Turkish ("urunler", "okunamadi") and they
 * are NOT TRANSLATED: they have to match the signature on chain. The list
 * leaves them alone. */
const TR_KELIME =
  /\b(ve|bir|bu|ile|ama|veya|olarak|kadar|sonra|gibi|ancak|yalnizca|oran|sayfada|sayfadaki|kurucusu|kilitli|likiditesi|teklifi|bekleniyor|yetersiz|basarisiz|secildi|gerekiyor|olmali|edilen|verildi)\b/i;

/* Three kinds of quote. A single- or double-quoted string has to close
   on the same line; a template literal does not. */
const DIZGE = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

/* Blanks out comments while keeping the line count, so a reported line
   number still matches the file. */
const ACIK = String.fromCharCode(47, 42);        /* a block comment opening */
const KAPAT = String.fromCharCode(42, 47);       /* and its terminator */
const SATIR_YORUM = String.fromCharCode(47, 47); /* a line comment */
function yorumsuz(s) {
  /* ONLY A COMMENT THAT STARTS A LINE IS BLANKED — THE FOURTH BLIND SPOT
   *
   * This used to be two regular expressions, and a comment opener inside a
   * STRING fooled them. The token creation screen carries a file input
   * whose accept attribute is an image wildcard, and that value contains
   * the two characters that open a block comment. The stripper read it as
   * the start of a comment and ran to the next real terminator eighteen
   * lines later. Four strings the user can see — a logo hint, the token
   * name label, the description label and a placeholder — sat inside that
   * span, and this check reported zero while they were live in the form.
   *
   * The fix stays deliberately conservative: a comment is recognised only
   * where it OPENS A LINE, which no string literal can do. A trailing
   * comment is left in, so this scan can over-report but can no longer
   * hide a string. Over-reporting is a sentence to read; a miss is a
   * Turkish label in production. */
  const cikti = [];
  let yorumda = false;
  for (const satir of s.split(String.fromCharCode(10))) {
    const kirpik = satir.trimStart();
    if (yorumda) {
      const kapanis = satir.indexOf(KAPAT);
      if (kapanis < 0) { cikti.push(""); continue; }
      yorumda = false;
      cikti.push(" ".repeat(kapanis + 2) + satir.slice(kapanis + 2));
      continue;
    }
    if (kirpik.startsWith(SATIR_YORUM)) { cikti.push(""); continue; }
    if (kirpik.startsWith(ACIK)) {
      const kapanis = satir.indexOf(KAPAT, satir.indexOf(ACIK) + 2);
      if (kapanis < 0) { yorumda = true; cikti.push(""); continue; }
      cikti.push(" ".repeat(kapanis + 2) + satir.slice(kapanis + 2));
      continue;
    }
    cikti.push(satir);
  }
  return cikti.join(String.fromCharCode(10));
}

/* Nothing is excluded any more.

   eski-app.html used to be skipped here, on the grounds that it was the
   retired build and the router never served it. That reasoning covered
   navigation and not the web: the file sat in docs/, so GitHub Pages served
   it to anyone who typed its address, in Turkish, 2,123 lines of it. An
   exclusion that hides a public page is the same defect as a check that
   passes for the wrong reason.

   The file has been deleted from the published tree instead. It is still in
   the history if it is ever wanted back. */
const HARIC = new Set();

/* Third-party libraries. Not our text and not translated: changing a
   string inside ethers would be forking the library. The scan found one
   match in there — a fragment resembling a Turkish word inside a minified
   template literal — and that match is not a finding but the scan looking
   in the wrong place. */
const HARIC_DIZIN = new Set(["vendor"]);

function dosyalar(kok) {
  const o = [];
  (function gez(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const t = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!HARIC_DIZIN.has(e.name)) gez(t);
      } else if (/\.(js|html)$/.test(e.name) && !HARIC.has(e.name)) {
        o.push(t);
      }
    }
  })(kok);
  return o;
}

/* PLAIN TEXT IN THE HTML BODY — THE STRING SCAN'S BLIND SPOT
 *
 * This check only looked at strings inside quotes. On an HTML page most of
 * the text shown to the user is NOT inside quotes: it sits straight in the
 * body. A three-line paragraph and a button label were found by hand for
 * exactly this reason; the scan never saw them.
 *
 * So the assertion could go green while the page's most visible text
 * stayed Turkish.
 *
 * script and style blocks are stripped: the text in them is already
 * covered by the string scan and counting it twice is pointless. HTML
 * comments are stripped too, for the same reason as code comments. */
function htmlMetinleri(kaynak) {
  const govde = kaynak
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, "\n");
  return govde.split("\n").map((x) => x.trim()).filter(Boolean);
}

/** @returns {{kalan:number, dosyalar:string[], ornek:string[]}} */
function tara(kok) {
  let kalan = 0;
  const liste = [];
  const ornek = [];
  for (const f of dosyalar(kok)) {
    const ham = fs.readFileSync(f, "utf8");
    const bulunan = (String(yorumsuz(ham)).match(DIZGE) || [])
      .filter((x) => TR.test(x) || TR_KELIME.test(x));

    /* For an HTML file, the plain text in the body counts as well. */
    if (f.endsWith(".html")) {
      for (const parca of htmlMetinleri(ham)) {
        if (TR.test(parca) || TR_KELIME.test(parca)) bulunan.push(parca);
      }
    }
    if (!bulunan.length) continue;
    kalan += bulunan.length;
    liste.push(path.basename(f) + ":" + bulunan.length);
    if (ornek.length < 3) ornek.push(bulunan[0].slice(0, 60));
  }
  return { kalan, dosyalar: liste, ornek };
}

module.exports = { tara, TR, TR_KELIME };

if (require.main === module) {
  const kok = process.argv[2] || path.join(__dirname, "..", "docs");
  const r = tara(kok);
  console.log(r.kalan + " Turkce dizge, " + r.dosyalar.length + " dosyada");
  for (const d of r.dosyalar) console.log("  " + d);
}
