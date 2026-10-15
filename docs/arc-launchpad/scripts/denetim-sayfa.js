"use strict";
/* ===========================================================================
 * denetim-sayfa.js — the interface, checked without a browser
 *
 *   node scripts/denetim-sayfa.js
 *
 * WHAT GOES WRONG IN A STATIC ES-MODULE APP
 *   A mistyped import path is a 404 at runtime and a blank dark rectangle
 *   with one line in a console nobody has open. A named import that the
 *   target does not export is `undefined` called as a function. Neither is
 *   caught by `node --check`, because both are resolution errors rather
 *   than syntax errors. So they are caught here instead.
 *
 * AND THE ONE THAT MATTERS MOST
 *   The page quotes the launch fee, the tax range, the vault's rate limits
 *   and the shield's threshold. Those are `constant`s in the contracts, and
 *   a page that quotes a number the contract does not charge is worse than
 *   a page that quotes nothing — the reader cannot tell the difference and
 *   will act on it. This compares every figure in docs/js/adresler.js
 *   against the Solidity source and fails if any one of them drifts.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const JS = path.join(KOK, "docs", "js");
const SOZ = path.join(KOK, "contracts");

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

/* ---- collect the module graph --------------------------------------- */

function dosyalar(dizin, liste = []) {
  for (const e of fs.readdirSync(dizin, { withFileTypes: true })) {
    const p = path.join(dizin, e.name);
    if (e.isDirectory()) dosyalar(p, liste);
    else if (e.name.endsWith(".js")) liste.push(p);
  }
  return liste;
}

const hepsi = dosyalar(JS);

/* `export function x`, `export const x`, `export { a, b }`. Enough for this
   codebase, and a pattern that misses an export would produce a false
   failure rather than a false pass — which is the right way round. */
function ihracatlar(kaynak) {
  const set = new Set();
  for (const m of kaynak.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) set.add(m[1]);
  for (const m of kaynak.matchAll(/export\s+(?:const|let|var|class)\s+(\w+)/g)) set.add(m[1]);
  for (const m of kaynak.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const parca of m[1].split(",")) {
      const ad = parca.trim().split(/\s+as\s+/).pop().trim();
      if (ad) set.add(ad);
    }
  }
  return set;
}

function ithalatlar(kaynak) {
  const liste = [];
  for (const m of kaynak.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    liste.push({
      adlar: m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean),
      yol: m[2]
    });
  }
  for (const m of kaynak.matchAll(/import\s*["']([^"']+)["']/g)) {
    liste.push({ adlar: [], yol: m[1] });
  }
  return liste;
}

console.log("ARAYUZ DENETIMI — tarayici olmadan");
console.log("");
console.log("1) ITHALATLAR COZULUYOR MU");

const ihracatOnbellek = new Map();
function ihracatAl(p) {
  if (!ihracatOnbellek.has(p)) {
    ihracatOnbellek.set(p, ihracatlar(fs.readFileSync(p, "utf8")));
  }
  return ihracatOnbellek.get(p);
}

let cozulmeyen = 0, eksikIhracat = 0, toplamIthalat = 0;
for (const f of hepsi) {
  const kaynak = fs.readFileSync(f, "utf8");
  for (const i of ithalatlar(kaynak)) {
    toplamIthalat++;
    if (!i.yol.startsWith(".")) continue;             // bare specifier: none here
    const hedef = path.resolve(path.dirname(f), i.yol);
    if (!fs.existsSync(hedef)) {
      console.log("     COZULMEDI  " + path.relative(KOK, f) + "  ->  " + i.yol);
      cozulmeyen++;
      continue;
    }
    /* The vendored bundles are minified single-line files; scanning them
       for exports would be slow and pointless, and a missing export there
       would be a packaging bug upstream rather than ours. */
    if (hedef.includes(path.sep + "vendor" + path.sep)) continue;
    const ih = ihracatAl(hedef);
    for (const ad of i.adlar) {
      if (!ih.has(ad)) {
        console.log("     IHRACAT YOK  " + path.relative(KOK, hedef) +
          " icinde '" + ad + "' yok (" + path.relative(KOK, f) + " istiyor)");
        eksikIhracat++;
      }
    }
  }
}
ok(cozulmeyen === 0, "her ithalat yolu bir dosyaya cozuluyor", toplamIthalat + " ithalat");
ok(eksikIhracat === 0, "her adlandirilmis ithalat gercekten ihrac ediliyor");

/* ---- routes and views ------------------------------------------------ */

console.log("");
console.log("2) YOLLAR VE GORUNUMLER ESLESIYOR MU");

const yolKaynak = fs.readFileSync(path.join(JS, "yol.js"), "utf8");
const anaKaynak = fs.readFileSync(path.join(JS, "ana.js"), "utf8");

const yolAdlari = [...yolKaynak.matchAll(/^\s*yol:\s*["']([\w-]+)["']/gm)].map((m) => m[1]);
ok(yolAdlari.length >= 16, "en az 16 modul tanimli", yolAdlari.length + " modul");

const durumlar = {};
for (const m of yolKaynak.matchAll(/yol:\s*["']([\w-]+)["'][\s\S]*?durum:\s*["'](\w+)["']/g)) {
  if (durumlar[m[1]] === undefined) durumlar[m[1]] = m[2];
}
ok(Object.keys(durumlar).length === yolAdlari.length, "her modulun bir durumu var");

const gecerliDurum = ["canli", "dagitim", "yapim"];
const kotuDurum = Object.entries(durumlar).filter(([, d]) => !gecerliDurum.includes(d));
ok(kotuDurum.length === 0, "her durum uc gecerli degerden biri",
  kotuDurum.length ? kotuDurum.map(([k, d]) => k + ":" + d).join(" ") : gecerliDurum.join("/"));

/* Every route the router maps must have a file, and every non-"yapim"
   route must be mapped — a live module with no view is a blank screen. */
const eslenen = [...anaKaynak.matchAll(/^\s*(\w[\w-]*):\s*\(\)\s*=>\s*import\(["']\.\/gorunum\/([\w-]+)\.js["']\)/gm)]
  .map((m) => ({ yol: m[1], dosya: m[2] }));

let dosyaYok = 0;
for (const e of eslenen) {
  const p = path.join(JS, "gorunum", e.dosya + ".js");
  if (!fs.existsSync(p)) { console.log("     DOSYA YOK  gorunum/" + e.dosya + ".js"); dosyaYok++; }
}
ok(dosyaYok === 0, "yonlendiricinin esledigi her gorunum dosyasi var", eslenen.length + " gorunum");

const eslenenAdlar = new Set(eslenen.map((e) => e.yol));
const eslenmeyenCanli = Object.entries(durumlar)
  .filter(([ad, d]) => d !== "yapim" && !eslenenAdlar.has(ad));
ok(eslenmeyenCanli.length === 0,
  "yapim olmayan her modulun bir gorunumu var",
  eslenmeyenCanli.length ? eslenmeyenCanli.map(([a]) => a).join(", ") : "");

/* Every view must export `ciz`, or the router awaits undefined. */
let cizYok = 0;
for (const e of eslenen) {
  const p = path.join(JS, "gorunum", e.dosya + ".js");
  if (!fs.existsSync(p)) continue;
  if (!ihracatAl(p).has("ciz")) { console.log("     ciz() YOK  gorunum/" + e.dosya + ".js"); cizYok++; }
}
ok(cizYok === 0, "her gorunum ciz() ihrac ediyor");

/* ---- icons ----------------------------------------------------------- */

console.log("");
/* ---- EVERY NAMED IMPORT HAS TO RESOLVE --------------------------
 *
 * A module that imports a name nothing exports throws at load time and
 * takes the whole screen with it. `node --check` does not catch it:
 * resolution is not syntax. Caught by hand after kalkan.js was given
 * `import { tekli } from "../zincir.js"` — tekli is a LOCAL helper
 * inside teklifler.js and zincir.js exports no such thing. The file
 * parsed cleanly and every audit passed.
 *
 * So each relative import is opened and its names checked against what
 * the target actually exports. Cheap, and it closes a class rather than
 * one instance. */
console.log("");
/* ---- EVERY ABI.<name> HAS TO BE A REAL TABLE ---------------------
 *
 * Caught by hand: gelistirici.js called cagriVerisi(ABI.erc, ...) and
 * the table is called erc20. ABI.erc is undefined, so the call would
 * have thrown the moment the panel rendered — and nothing flagged it.
 * The import check above cannot: ABI resolves fine, it is the PROPERTY
 * that does not exist.
 *
 * Same family as the four ABI drifts found in the governance tables
 * today, one level up: there the function was missing from the
 * contract, here the table is missing from ABI. */
console.log("");
/* ---- WHAT MUST NOT APPEAR ON A PUBLIC SURFACE --------------------
 *
 * Two rules, both set by the user:
 *
 *   1. The operations address is called "isletme" and given no other
 *      name. Tying an address visible on chain to another activity leaks
 *      information about that activity.
 *   2. The PATH of the local key file is not written down. A path does
 *      not give the key, but it says where to look.
 *
 * ADRESLER.md broke both — and the same file EXPLAINED the first rule:
 * it wrote "in the contract and on the page its name is isletme, not
 * bot" and then said bot in five separate places, and gave the path in
 * one. Writing a rule down and then violating it is worse than never
 * writing it: it tells the reader the rule is being enforced.
 *
 * This repository is going to GitHub, so this is not a matter of
 * style. */
console.log("");
/* ---- DOES ADRESLER.md MATCH THE RECORD TOO ----------------------
 *
 * This file is written by hand and it is public. An address typed into
 * it by hand is no less dangerous than one typed into the interface by
 * hand: one points the screen at the wrong contract, the other points
 * the READER at the wrong contract — and the second lives longer,
 * because nobody runs it and gets an error.
 *
 * When this audit was written, ADRESLER.md's "DEPLOYED, LIVE" table did
 * not contain A SINGLE address from the second generation, and another
 * section of the same file directed the reader to that table.
 *
 * Rows whose name contains "emekli", "1. tur" or "eski" are excluded:
 * those deliberately show the past. */
console.log("");
/* ---- READING A FUNCTION AS IF IT WERE A PROPERTY -----------------
 *
 * cuzdan.hesap() is a function. A new view read it as
 * "cuzdan.hesap ? cuzdan.hesap : null": the function ITSELF was
 * assigned, and a function is always truthy. The result is the screen
 * behaving as if a wallet were connected when it is not — rendering a
 * form it cannot submit and trying to read the earnings of an account
 * that does not exist.
 *
 * Neither node --check nor the import audit sees this: the name exists,
 * the module resolves, the syntax is valid. Only the BEHAVIOUR is wrong,
 * and it falls on the wrong side — an unconnected wallet treated as
 * connected.
 *
 * This is a narrow check, and narrow on purpose: the wallet's accessors
 * are the one place that decides who sees what in this interface. */
console.log("");
console.log("2f) CUZDAN ERISIMCILERI CAGRILIYOR MU");
{
  const T = String.fromCharCode(92);
  /* The ones defined as functions inside cuzdan.js. */
  const cKaynak = fs.readFileSync(path.join(JS, "cuzdan.js"), "utf8");
  const reErisimci = new RegExp("^" + T + "s{2}(" + T + "w+)" +
    T + "s*" + T + "(" + T + ")" + T + "s*{", "gm");
  const erisimciler = [...cKaynak.matchAll(reErisimci)].map((m) => m[1]);

  const gez = (d, cikti) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const tam = path.join(d, e.name);
      if (e.isDirectory()) gez(tam, cikti);
      else if (e.name.endsWith(".js")) cikti.push(tam);
    }
    return cikti;
  };

  const kotuKullanim = [];
  for (const dosya of gez(JS, [])) {
    if (path.basename(dosya) === "cuzdan.js") continue;
    const k = fs.readFileSync(dosya, "utf8");
    /* YORUMLAR BOSALTILIYOR, SATIR SAYISI KORUNUYOR
         Ilk hali yalnizca "*" ya da "//" ile BASLAYAN satirlari
         atliyordu. Bu projede blok yorumlarinin devam satirlari "*" ile
         baslamiyor, o yuzden bu denetimin ilk kosumunda yakaladigi tek
         sey, ayni kusuru ANLATAN yorumumun kendisi oldu — yani kusurun
         tarifini kusur sandi.

         Yorum govdesi bosaltiliyor ama satir sonlari birakiliyor, boylece
         bildirilen satir numarasi dosyadaki satirla ayni kaliyor. */
    const yorumsuz = k
      .replace(/\/\*[^]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
    const satirlar = yorumsuz.split(String.fromCharCode(10));
    satirlar.forEach((satir, i) => {
      for (const ad of erisimciler) {
        const re = new RegExp("cuzdan" + T + "." + ad + "(?!" + T + "s*" +
          T + "()", "g");
        if (re.test(satir)) {
          kotuKullanim.push(path.relative(KOK, dosya) + ":" + (i + 1) +
            "  cuzdan." + ad);
        }
      }
    });
  }

  ok(erisimciler.length > 0 && kotuKullanim.length === 0,
    "CUZDANIN HER ERISIMCISI FONKSIYON OLARAK CAGRILIYOR",
    kotuKullanim.length
      ? "OZELLIK GIBI OKUNMUS: " + kotuKullanim.slice(0, 6).join(", ")
      : erisimciler.length + " erisimci (" + erisimciler.join(", ") +
        ") — biri parantezsiz okunsa her zaman truthy olur ve ekran " +
        "baglanmamis cuzdani bagli sanar");
}

console.log("2e) ADRESLER.md KAYITLA AYNI MI");
{
  const T = String.fromCharCode(92);
  const mdYolu = path.join(KOK, "ADRESLER.md");
  if (!fs.existsSync(mdYolu)) {
    ok(false, "ADRESLER.md bulunamadi");
  } else {
    const md = fs.readFileSync(mdYolu, "utf8");
    const kayit = JSON.parse(fs.readFileSync(
      path.join(KOK, "dagitim-pulse2.json"), "utf8"));

    /* Markdown satirlari: | ad | `0x...` | ... */
    /* SATIRA KAPATILDI
         [^x60]* satir sonunu da yiyordu, o yuzden her tablonun BASLIK
         satiri ("| ne | adres |") bir sonraki satirin adresiyle eslesti
         ve her tablonun ILK gercek satiri kendi adresini hic gormedi.
         Olculdu: PulseLaunchpad "belgede yok" diye raporlandi, oysa
         satiri oracikta duruyordu. */
    const reSatir = new RegExp(
      "^" + T + "|([^|" + T + "n]+)" + T + "|[^" + T + "x60" + T + "n]*" +
      T + "x60(0x[0-9a-fA-F]{40})" + T + "x60", "gm");
    const satirlar = [...md.matchAll(reSatir)].map((m) => ({
      ad: m[1].trim(),
      adres: m[2].toLowerCase()
    }));

    const GECMIS = /emekli|1\. *tur|1\. *nesil|eski/i;
    /* Pazar kendi kaydinda duruyor, o yuzden ayri okunuyor. Eklemeyi
       atlamak, belgeye elle yazilmis bir adresi hic kontrol etmemek
       olurdu — ve bu dosyanin ilk hali tam oyle bir adres yuzunden
       yazildi. */
    const pazarYolu = path.join(KOK, "dagitim-pazar.json");
    const pazarKayit = fs.existsSync(pazarYolu)
      ? JSON.parse(fs.readFileSync(pazarYolu, "utf8")) : null;

    const hedefler = [
      ["PulseLaunchpad", kayit.arc.launchpad],
      ["PulseHook", kayit.arc.hook],
      ["PulseLikiditeKasasi", kayit.arc.likiditeKasasi],
      ["DevPool", kayit.arc.devPool],
      ["PulseFabrika", kayit.arc.fabrika]
    ];
    if (pazarKayit) hedefler.push(["Pazar", pazarKayit.arc.pazar]);

    const kotuSatir = [], bulunmayan = [];
    for (const [ad, beklenen] of hedefler) {
      /* ADIN KENDISI, ICINDE GECMESI DEGIL
           includes() ile arayinca "FTHM Governor *(DevPool un
           yetkilisi)*" satiri DevPool sayildi ve Governor adresi DevPool
           adresinden farkli diye iki kez hata verdi. Aciklama metninde
           gecen bir ad, o satirin konusu degil. */
      const notAyir = new RegExp(T + "s*" + T + "*" + T + "(.*$");
      const sadeAd = (x) => x.replace(notAyir, "").trim();
      const uyan = satirlar.filter((x) =>
        sadeAd(x.ad) === ad && !GECMIS.test(x.ad));
      if (uyan.length === 0) { bulunmayan.push(ad); continue; }
      for (const u of uyan) {
        if (u.adres !== String(beklenen).toLowerCase()) {
          kotuSatir.push(ad + ": belgede " + u.adres.slice(0, 12) +
            "..., kayitta " + String(beklenen).slice(0, 12) + "...");
        }
      }
    }

    ok(bulunmayan.length === 0 && kotuSatir.length === 0,
      "ADRESLER.md ICINDEKI CANLI ADRESLER KAYITLA AYNI",
      bulunmayan.length || kotuSatir.length
        ? [bulunmayan.length ? "BELGEDE YOK: " + bulunmayan.join(", ") : null,
           kotuSatir.length ? "FARKLI: " + kotuSatir.join("  |  ") : null]
          .filter(Boolean).join("   ")
        : hedefler.length + " sozlesme, " + satirlar.length +
          " adres satiri tarandi — belge kayittan sapmiyor");
  }
}

/* ---- IS THE INTERFACE IN ENGLISH --------------------------------
 *
 * The user's rule: every public surface is English — the site, the X
 * account, the banner, the posts. Conversation stays Turkish, the
 * product does not.
 *
 * This assertion stayed RED until the translation was finished and that
 * was right: it counts how many strings are left. The moment it turns
 * green the rule is locked in — if a Turkish string is added later the
 * set says so immediately.
 *
 * The scan lives in scripts/dil-kontrol.js: trying to write its regular
 * expressions in here through a generator script backfired three times
 * in one day (the shell, sed and a JS string each eat a backslash
 * separately), so the check sits directly in its own file. */
console.log("");
console.log("2g) ARAYUZ INGILIZCE MI");
{
  const { tara, dilEtiketleri } = require("./dil-kontrol.js");
  const r = tara(path.join(KOK, "docs"));
  ok(r.kalan === 0,
    "ARAYUZDE TURKCE DIZGE YOK — kamuya acik her sey Ingilizce",
    r.kalan === 0
      ? "taranan her dizge Ingilizce; sonradan Turkce eklenirse bu sav " +
        "hemen soyler"
      : r.kalan + " Turkce dizge kaldi — " + r.dosyalar.slice(0, 8).join(", ") +
        (r.dosyalar.length > 8 ? "  (+" + (r.dosyalar.length - 8) + " dosya)" : ""));

  /* WHAT THE PAGE SAYS, AND WHAT IT DECLARES ITSELF TO BE
   *
   * All four served pages carried lang="tr" after every word on them had
   * been translated, and the assertion above was green the whole time: it
   * reads strings and body text, and an attribute is neither.
   *
   * It is not cosmetic. A screen reader picks its voice from that
   * attribute, and a browser offers to translate a page that claims to be
   * in a language it is not. Proved to discriminate: flipping one page
   * back to "tr" makes this fail with that page named. */
  const yanlisDil = dilEtiketleri(path.join(KOK, "docs"));
  ok(yanlisDil.length === 0,
    "HER SAYFA KENDINI INGILIZCE ILAN EDIYOR",
    yanlisDil.length === 0
      ? "servis edilen her .html dosyasinda lang=\"en\""
      : yanlisDil.map(([f, v]) => path.basename(f) + " -> " + v).join(", "));
}

console.log("2d) KAMUYA ACIK YUZEY TEMIZ MI");
{
  const T = String.fromCharCode(92);
  const yuzeyler = [];
  const gez = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const tam = path.join(d, e.name);
      if (e.isDirectory()) gez(tam);
      else if (/\.(js|html|md|css)$/.test(e.name)) yuzeyler.push(tam);
    }
  };
  gez(path.join(KOK, "docs"));
  for (const f of fs.readdirSync(KOK)) {
    if (f.endsWith(".md")) yuzeyler.push(path.join(KOK, f));
  }

  /* Turkce ekleriyle birlikte, ama yalnizca TAM kelime olarak: "both",
     "Robotu" ve "bottom" bu desene takilmaz. */
  const AD = new RegExp(T + "b" + "bot(?:u|a|un|tan|la|unun|uyla|undan)?" +
    T + "b", "i");
  /* Yerel anahtar dosyasinin yolu. */
  const YOL = new RegExp("[A-Za-z]:" + T + T + "?" + T + T + "?bot" +
    T + T + "?" + T + T + "?" + T + ".?env", "i");

  const kirli = [];
  for (const f of yuzeyler) {
    const k = fs.readFileSync(f, "utf8");
    const satirlar = k.split(String.fromCharCode(10));
    satirlar.forEach((satir, i) => {
      if (AD.test(satir) || YOL.test(satir)) {
        kirli.push(path.relative(KOK, f) + ":" + (i + 1));
      }
    });
  }

  ok(yuzeyler.length > 0 && kirli.length === 0,
    "KAMUYA ACIK HICBIR DOSYADA O AD VE O YOL YOK",
    kirli.length
      ? "GECTIGI YERLER: " + kirli.slice(0, 8).join(", ") +
        (kirli.length > 8 ? "  (+" + (kirli.length - 8) + ")" : "")
      : yuzeyler.length + " dosya tarandi (docs/ + kok .md) — adres her " +
        "yerde yalnizca isletme");
}

console.log("2c) HER ABI TABLOSU VAR MI");
{
  const T = String.fromCharCode(92);
  const zincirKaynak = fs.readFileSync(path.join(JS, "zincir.js"), "utf8");
  /* The table names, taken from the ABI object literal itself. */
  const abiBas = zincirKaynak.indexOf("export const ABI = {");
  const abiSon = (() => {
    let d = 0;
    for (let j = zincirKaynak.indexOf("{", abiBas); j < zincirKaynak.length; j++) {
      const c = zincirKaynak[j];
      if (c === "{") d++;
      else if (c === "}" && --d === 0) return j;
    }
    return zincirKaynak.length;
  })();
  const abiGovde = zincirKaynak.slice(abiBas, abiSon);
  const reTablo = new RegExp("^" + T + "s{2}(" + T + "w+):" + T + "s*[" +
    String.fromCharCode(91) + "]", "gm");
  const tablolar = new Set([...abiGovde.matchAll(reTablo)].map((m) => m[1]));

  /* Every ABI.<name> written anywhere under docs/js. */
  const gez = (d, cikti) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const tam = path.join(d, e.name);
      if (e.isDirectory()) gez(tam, cikti);
      else if (e.name.endsWith(".js")) cikti.push(tam);
    }
    return cikti;
  };
  const reKullanim = new RegExp("ABI" + T + ".(" + T + "w+)", "g");
  const eksik = [];
  let kullanim = 0;
  for (const dosya of gez(JS, [])) {
    const k = fs.readFileSync(dosya, "utf8");
    for (const m of k.matchAll(reKullanim)) {
      kullanim++;
      if (!tablolar.has(m[1])) {
        eksik.push(path.basename(dosya) + " -> ABI." + m[1]);
      }
    }
  }

  ok(tablolar.size > 0 && kullanim > 0 && eksik.length === 0,
    "KULLANILAN HER ABI TABLOSU ZINCIR.JS ICINDE TANIMLI",
    eksik.length
      ? "YOK: " + [...new Set(eksik)].join(", ")
      : tablolar.size + " tablo tanimli, " + kullanim + " kullanim — " +
        "tanimsiz bir tablo cagriVerisi icinde aninda patlar");
}

console.log("2b) HER ICE AKTARMA COZULUYOR MU");
{
  /* A literal backslash, built rather than written: a heredoc and sed
     each ate one on the way into this file earlier today. */
  const T = String.fromCharCode(92);
  const jsDosyalari = [];
  const gez = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const tam = path.join(d, e.name);
      if (e.isDirectory()) gez(tam);
      else if (e.name.endsWith(".js")) jsDosyalari.push(tam);
    }
  };
  gez(JS);

  const ihracAl = (dosya) => {
    let k;
    try { k = fs.readFileSync(dosya, "utf8"); } catch (e) { return null; }
    const ad = new Set();
    /* export function f / export async function f / export const x */
    const re1 = new RegExp("export" + T + "s+(?:async" + T + "s+)?function" +
      T + "s+(" + T + "w+)", "g");
    const re2 = new RegExp("export" + T + "s+(?:const|let|var|class)" +
      T + "s+(" + T + "w+)", "g");
    for (const m of k.matchAll(re1)) ad.add(m[1]);
    for (const m of k.matchAll(re2)) ad.add(m[1]);
    /* export { a, b as c } */
    const re3 = new RegExp("export" + T + "s*{([^}]*)}", "g");
    for (const m of k.matchAll(re3)) {
      for (const parca of m[1].split(",")) {
        const t = parca.trim().split(/\s+as\s+/);
        const son = (t[1] || t[0] || "").trim();
        if (son) ad.add(son);
      }
    }
    return ad;
  };

  const onbellek = new Map();
  const kirik = [];
  let sayilan = 0;
  const reIm = new RegExp("import" + T + "s*{([^}]*)}" + T + "s*from" +
    T + "s*[" + String.fromCharCode(34) + String.fromCharCode(39) +
    "]([^" + String.fromCharCode(34) + String.fromCharCode(39) + "]+)[" +
    String.fromCharCode(34) + String.fromCharCode(39) + "]", "g");

  for (const dosya of jsDosyalari) {
    const kaynak = fs.readFileSync(dosya, "utf8");
    for (const m of kaynak.matchAll(reIm)) {
      const yol = m[2];
      if (!yol.startsWith(".")) continue;   // paket degil, bu proje degil
      const hedef = path.resolve(path.dirname(dosya), yol);
      if (!fs.existsSync(hedef)) {
        kirik.push(path.basename(dosya) + " -> " + yol + " (dosya yok)");
        continue;
      }
      if (!onbellek.has(hedef)) onbellek.set(hedef, ihracAl(hedef));
      const ihrac = onbellek.get(hedef);
      if (!ihrac) continue;
      for (const parca of m[1].split(",")) {
        const t = parca.trim().split(/\s+as\s+/);
        const istenen = (t[0] || "").trim();
        if (!istenen) continue;
        sayilan++;
        if (!ihrac.has(istenen)) {
          kirik.push(path.basename(dosya) + " -> " + istenen +
            " (" + path.basename(hedef) + " ihrac etmiyor)");
        }
      }
    }
  }

  ok(sayilan > 0 && kirik.length === 0,
    "HER ICE AKTARILAN AD HEDEFINDE IHRAC EDILMIS",
    kirik.length ? "COZULMEYEN: " + kirik.join("  |  ")
      : sayilan + " ice aktarma " + onbellek.size + " modulde cozuldu — " +
        "cozulmeyen bir ad ekranin tamamini yukleme aninda dusurur");
}

console.log("3) KULLANILAN HER IKON TANIMLI MI");
const ikonKaynak = fs.readFileSync(path.join(JS, "ikon.js"), "utf8");
const ikonGovde = ikonKaynak.slice(ikonKaynak.indexOf("const P = {"), ikonKaynak.indexOf("};"));
const tanimli = new Set([...ikonGovde.matchAll(/^\s*"?([\w-]+)"?:\s*'/gm)].map((m) => m[1]));

const kullanilan = new Set();
for (const f of hepsi) {
  const kaynak = fs.readFileSync(f, "utf8");
  for (const m of kaynak.matchAll(/ikon\(\s*["']([\w-]+)["']/g)) kullanilan.add(m[1]);
}
for (const m of yolKaynak.matchAll(/ikon:\s*["']([\w-]+)["']/g)) kullanilan.add(m[1]);

const eksikIkon = [...kullanilan].filter((i) => !tanimli.has(i));
ok(eksikIkon.length === 0, "kullanilan her ikon ikon.js'te var",
  eksikIkon.length ? "eksik: " + eksikIkon.join(", ") : tanimli.size + " ikon tanimli, " + kullanilan.size + " kullaniliyor");

/* ---- the figures the page quotes ------------------------------------- */

console.log("");
console.log("4) SAYFANIN ALINTILADIGI SABITLER SOZLESMEYLE AYNI MI");

const adreslerKaynak = fs.readFileSync(path.join(JS, "adresler.js"), "utf8");
function sayfaSabiti(ad) {
  const m = adreslerKaynak.match(new RegExp(ad + "\\s*:\\s*([0-9_]+)"));
  return m ? Number(m[1].replace(/_/g, "")) : null;
}

function solSabiti(dosya, ad) {
  const s = fs.readFileSync(path.join(SOZ, dosya), "utf8");
  /* `uint256 public constant X = 1_000;` and `... = 1_000 ether;` */
  const m = s.match(new RegExp("constant\\s+" + ad + "\\s*=\\s*([0-9_]+)"));
  return m ? Number(m[1].replace(/_/g, "")) : null;
}

const ESLER = [
  { sayfa: "ucretPpm",          dosya: "EgriLaunchpad.sol", sol: "LAUNCH_UCRET_PPM", ad: "launch ucreti" },
  { sayfa: "vergiAsgariPpm",    dosya: "EgriLaunchpad.sol", sol: "VERGI_ASGARI_PPM", ad: "asgari teminat vergisi" },
  { sayfa: "vergiAzamiPpm",     dosya: "EgriLaunchpad.sol", sol: "VERGI_AZAMI_PPM", ad: "azami teminat vergisi" },
  { sayfa: "vergiVarsayilanPpm", dosya: "EgriLaunchpad.sol", sol: "VERGI_VARSAYILAN_PPM", ad: "varsayilan vergi" },
  { sayfa: "kalkanEsikPpm",     dosya: "EgriHook.sol", sol: "KALKAN_ESIK_PPM", ad: "kalkan esigi" },
  { sayfa: "kalkanTavanPpm",    dosya: "EgriHook.sol", sol: "KALKAN_TAVAN_PPM", ad: "kalkan tavani" },
  { sayfa: "islemTavaniBps",    dosya: "TeminatKasasi.sol", sol: "ISLEM_TAVANI_BPS", ad: "cagri tavani" },
  { sayfa: "donemTavaniBps",    dosya: "TeminatKasasi.sol", sol: "DONEM_TAVANI_BPS", ad: "pencere tavani" },
  { sayfa: "donemBlok",         dosya: "TeminatKasasi.sol", sol: "DONEM_BLOK", ad: "pencere uzunlugu" },
  { sayfa: "odulPayiBps",       dosya: "TeminatKasasi.sol", sol: "ODUL_PAYI_BPS", ad: "cagiran odulu" }
];

for (const e of ESLER) {
  const a = sayfaSabiti(e.sayfa);
  const b = solSabiti(e.dosya, e.sol);
  ok(a != null && b != null && a === b, e.ad + " ayni",
    "sayfa " + a + " / sozlesme " + b);
}

/* The fee table slices, which the page prints one by one. */
/* PulseHook'un dilimleri — EgriHook'un DEGIL.
 *
 * Bu liste "stake" dilimini de iceriyordu ve karsilastirmayi
 * EgriHook.sol'a yapiyordu. O emekli kanca gercekten STAKE_PPM = 3.000
 * tasiyor, bu yuzden sav her kosumda geciyordu — ama sayfanin anlattigi
 * ucret tablosu artik CALISAN kanca tarafindan odenmiyordu.
 *
 * Yani denetim yesil yanarken site, FTHM stake edenlere her islemden
 * %0,30 aldiklarini soyluyordu ve canli kanca onlara hicbir sey
 * gondermiyordu. Emekli bir sozlesmeye karsi dogrulamak, dogrulamamakla
 * ayni sey degil — daha kotusu: dogrulanmis gibi gorunuyor. */
const DILIM_KANCA = "PulseHook.sol";
const DILIM = [
  ["kurucu", "KURUCU_PPM"],
  ["gelistirici", "GELISTIRICI_PPM"], ["likidite", "LIKIDITE_PPM"],
  ["isletme", "ISLETME_PPM"]
];
/* DEGERLER EKONOMI.dilimler NESNESINDEN, DOSYA GENELINDEN DEGIL
 *
 * Bu savlar "ad: sayi" desenini dosyanin TAMAMINDA ariyordu ve ilk
 * eslesmeyi aliyordu. Sonuc: bu tabloyu duzeltirken yazdigim YORUM —
 * icinde "derinlik: 4_000" gecen, neyin yanlis oldugunu anlatan cumle —
 * ilk eslesme oldu ve sav dogru duzeltilmis bir degeri yanlis diye
 * raporladi.
 *
 * Bugun ucuncu kez ayni sekil: bir savin okudugu metin, o savi anlatan
 * metinle karisti (sayac kelimeleri, markdown baslik satirlari, ve bu).
 * Cozum her seferinde ayni: gevsek bir desen yerine YAPIYI oku. */
const ekonomiDilim = (() => {
  const bas = adreslerKaynak.indexOf("export const EKONOMI");
  if (bas < 0) return "";
  const i = adreslerKaynak.indexOf("dilimler: {", bas);
  if (i < 0) return "";
  let d = 0;
  for (let j = adreslerKaynak.indexOf("{", i); j < adreslerKaynak.length; j++) {
    const c = adreslerKaynak[j];
    if (c === "{") d++;
    else if (c === "}" && --d === 0) return adreslerKaynak.slice(i, j);
  }
  return "";
})();
ok(ekonomiDilim.length > 0, "EKONOMI.dilimler nesnesi bulundu",
  "bulunamazsa asagidaki dilim savlari hicbir sey okumaz");

const dilimOku = (ad) => {
  const m = ekonomiDilim.match(new RegExp("\\b" + ad + "\\s*:\\s*([0-9_]+)"));
  return m ? Number(m[1].replace(/_/g, "")) : null;
};

for (const [sayfaAd, solAd] of DILIM) {
  const a = dilimOku(sayfaAd);
  const b = solSabiti(DILIM_KANCA, solAd);
  ok(a != null && b != null && a === b, "dilim " + sayfaAd + " ayni",
    "sayfa " + a + " / kanca " + b);
}

/* And `derinlik` is not a constant anywhere — it is what the five named
   slices leave behind, so it is checked as arithmetic rather than looked
   up. A page that printed it as an independent number could disagree with
   the table while every individual slice matched. */
{
  const sayfa = dilimOku("derinlik");
  /* VE STAKE DILIMI OLMADIGI DA BIR SAV
       Satiri listeden cikarmak, "artik bakmiyorum" demekti. Calisan
       kancada boyle bir sabit OLMAMALI; biri geri eklerse sayfa yine
       sessizce eksik anlatmaya baslar. */
  ok(solSabiti(DILIM_KANCA, "STAKE_PPM") == null &&
     dilimOku("stake") == null,
    "CALISAN KANCADA STAKE DILIMI YOK — sayfada da yok",
    "FTHM stake edenler islemlerden pay almiyor; kazanclari stake " +
      "sozlesmesinin FTHM emisyonu. Ikisini karistirmak, odenmeyen bir " +
      "payi odeniyor gibi gostermekti");

  const toplam = solSabiti(DILIM_KANCA, "FEE_PPM");
  let dilimToplam = 0;
  for (const [, solAd] of DILIM) dilimToplam += solSabiti(DILIM_KANCA, solAd) || 0;
  ok(sayfa === toplam - dilimToplam, "derinlik payi = toplam eksi bes dilim",
    "sayfa " + sayfa + " / hesap " + (toplam - dilimToplam));
}

/* ---- the honesty rule ------------------------------------------------ */

console.log("");
console.log("5) CALISMAYAN HICBIR SEY CALISIYOR GIBI DURMUYOR MU");

/* THIS CHECK'S PREMISE CHANGED, SO THE CHECK CHANGED
   It used to assert that every PULSE address is null, because nothing was
   deployed. The stack is now live, so the same rule — the interface must
   never offer a control that cannot act — needs the opposite question:
   does the interface point at the contracts that were actually VERIFIED?

   Comparing against dagitim-pulse.json rather than against "not null",
   because that record was written from the CHAIN after the deployment
   audit passed, and a hand-edited address in adresler.js would otherwise
   make the whole interface read a contract nobody checked. */
/* THE SLICE ENDS AT THE NEXT EXPORT — NOT AT A NAME
     This has now been wrong twice for the same reason. First it ran to
     HEDEFLER and swallowed a retired-generation block, reading every
     dead address as a live PULSE entry; the fix was to stop at EMEKLI,
     which is another hardcoded name. Then PULSE_EMEKLI was added
     between PULSE and EMEKLI and the same thing happened again: the
     superseded launchpad, hook and liquidity vault were read as PULSE's
     own, and the check reported the interface still pointing at round
     one.

     A name-based boundary breaks every time a block is inserted, and it
     breaks SILENTLY in the direction of reading too much. So the
     boundary is now structural: the PULSE object ends where the next
     top-level export begins, whatever it is called.

     Also anchored on "export const PULSE = {" rather than the prefix,
     because indexOf("export const PULSE") would equally match
     PULSE_KURAL or PULSE_EMEKLI if the order ever changed. */
const pulseBas = adreslerKaynak.indexOf("export const PULSE = {");
if (pulseBas < 0) {
  ok(false, "adresler.js icinde PULSE blogu bulunamadi",
    "blok adi degistiyse bu denetim sessizce bos bir dilim okur");
}
const pulseSon = (() => {
  const sonraki = adreslerKaynak.indexOf("\nexport const ", pulseBas + 10);
  return sonraki > 0 ? sonraki : adreslerKaynak.length;
})();
const pulseGovde = adreslerKaynak.slice(pulseBas, pulseSon);
const pulseAdres = [...pulseGovde.matchAll(/(\w+):\s*(null|"0x[0-9a-fA-F]{40}")/g)];
const dolu = pulseAdres.filter((m) => m[2] !== "null");
ok(pulseAdres.length >= 8, "PULSE adres listesi okunabildi", pulseAdres.length + " giris");
console.log("     dagitilmis: " + dolu.length + " / " + pulseAdres.length);

{
  /* THE SECOND GENERATION'S RECORD, NOT THE FIRST
       The first generation is retired and its addresses live in EMEKLI.
       Checking the page against ITS record would validate exactly the
       addresses the interface is supposed to have stopped pointing at —
       and it would pass, because they still match that record. */
  const kayitYolu = path.join(KOK, "dagitim-pulse2.json");
  if (!fs.existsSync(kayitYolu)) {
    /* Addresses filled in with no verified record behind them is the
       failure this check exists for, not a reason to skip it. */
    ok(dolu.length === 0,
      "ikinci nesil kaydi yok, o yuzden hicbir adres dolu olmamali",
      dolu.length + " adres dolu — dagitim-pulse.json yok, yani bu " +
        "adresleri dogrulayan bir sey yok");
  } else {
    const kayit = JSON.parse(fs.readFileSync(kayitYolu, "utf8"));
    let uzakInitHash = null;
    const dogru = { ...(kayit.arc || {}) };
    for (const [ad, z] of Object.entries(kayit.uzak || {})) {
      dogru[ad + ":fabrika"] = z.fabrika;
      dogru[ad + ":havuzFiyat"] = z.havuzFiyat;
    }

    /* Only the Arc keys live in PULSE; the remote ones live in UZAK and
       are matched separately so a mismatch names which side drifted. */
    const sapan = [];
    for (const m of dolu) {
      const ad = m[1], deger = m[2].replace(/"/g, "");
      const dogru = (kayit.arc || {})[ad] || (kayit.paylasilan || {})[ad];
      if (!dogru) continue;
      if (String(dogru).toLowerCase() !== deger.toLowerCase()) {
        sapan.push(ad + ": sayfa " + deger + ", kayit " + dogru);
      }
    }
    ok(sapan.length === 0,
      "PULSE ADRESLERI IKINCI NESIL KAYDIYLA AYNI",
      sapan.length ? sapan.join("  |  ")
        : dolu.length + " adres, " + String(kayit.olculdu).slice(0, 10) +
          " tarihinde zincirden dogrulandi");

    /* Every Arc contract the record holds has to be reachable from the
       interface. A record entry with no PULSE key is a contract the
       interface cannot read, and it would go unnoticed. */
    const sayfaAdlari = new Set(pulseAdres.map((m) => m[1]));
    /* Both halves of the record: what this generation deployed and the
       shared infrastructure it is wired to. A contract in either that has
       no page entry is a contract the interface cannot read, and it would
       go unnoticed. */
    const kayitAdlari = {
      ...(kayit.arc || {}),
      ...(kayit.paylasilan || {})
    };
    /* A RETIRED CONTRACT MUST NOT HAVE A PULSE ENTRY — THE OPPOSITE RULE
         This demanded a PULSE key for every address in the record,
         including paylasilan.gelistiriciFonu. That fund is now out of
         the money path: its allocator is the operations wallet and the
         allocator is immutable, which is the whole reason the developer
         slice was repointed at the DAO's DevPool.

         So for that one address the two checks here pulled in opposite
         directions — this one wanted it present, the leak check below
         wanted it gone. Resolved by reading the record instead of
         guessing: whatever the record itself marks as retired is
         EXPECTED to be absent, and the leak check enforces that.

         Derived from the record rather than listed here, so retiring
         the next contract needs no edit to this file. */
    const emekliKayit = new Set(
      Object.entries(kayit)
        .filter(([k]) => /^emekli/i.test(k))
        .flatMap(([, v]) => (v && typeof v === "object" ? Object.values(v) : [v]))
        .filter((v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v))
        .map((v) => v.toLowerCase())
    );
    const eksik = Object.keys(kayitAdlari)
      /* Not contracts of ours: the quote token and Uniswap's manager are
         upstream, and isletme is a wallet. */
      .filter((k) => !["poolManager", "quote", "isletme"].includes(k))
      .filter((k) => !emekliKayit.has(String(kayitAdlari[k]).toLowerCase()))
      .filter((k) => !sayfaAdlari.has(k));
    ok(eksik.length === 0,
      "kayittaki her Arc sozlesmesinin sayfada bir girisi var",
      eksik.length ? "EKSIK: " + eksik.join(", ") : Object.keys(kayit.arc).length + " giris");

    /* THE REMOTE SIDE HAS ITS OWN RECORD, AND READING IT FROM THE
       GENERATION RECORD MADE THIS CHECK VACUOUS
         The second generation never touched the remote chains, so its
         record has no uzak key — the loop iterated nothing and PASSED,
         printing "0 zincir". A check that checks nothing is worse than
         one that fails: it reports confidence it did not earn.

         The authoritative source is the remote deployment's own plan,
         where those addresses were verified against the chains. */
    const uzakYolu = path.join(KOK, "dagitim-uzak-plan.json");
    if (!fs.existsSync(uzakYolu)) {
      ok(false, "uzak dagitim plani yok — uzak adresler dogrulanamadi");
    } else {
      const uzakPlan = JSON.parse(fs.readFileSync(uzakYolu, "utf8"));
      const uzakGovde = adreslerKaynak.slice(
        adreslerKaynak.indexOf("export const UZAK ="),
        adreslerKaynak.indexOf("export const UZAK_INIT_HASH"));
      const uzakSapan = [];
      const zincirler = Object.entries(uzakPlan.zincirler || {});
      for (const [ad, z] of zincirler) {
        const alanlar = [
          ["fabrika", z.dagitildi || z.fabrika],
          ["havuzFiyat", z.havuzDagitildi || z.havuzFiyat],
          ["usdc", z.usdc]
        ];
        for (const [alan, deger] of alanlar) {
          if (!deger || !uzakGovde.toLowerCase().includes(String(deger).toLowerCase())) {
            uzakSapan.push(ad + "." + alan);
          }
        }
      }
      ok(zincirler.length > 0 && uzakSapan.length === 0,
        "UZAK ADRESLERI PLANLA AYNI",
        uzakSapan.length ? "EKSIK/FARKLI: " + uzakSapan.join(", ")
          : zincirler.length + " zincir, " + (zincirler.length * 3) + " adres");
      uzakInitHash = uzakPlan.initKodHash;
    }

    /* A retired address inside PULSE is a pointer the interface can
       still follow. Checked by name rather than by eye: the four were
       removed once and a copy-paste would put them back silently. */
    const emekliGovde = adreslerKaynak.indexOf("export const EMEKLI") > 0
      ? adreslerKaynak.slice(adreslerKaynak.indexOf("export const EMEKLI"),
                             adreslerKaynak.indexOf("export const HEDEFLER"))
      : "";
    const emekliAdresler = [...emekliGovde.matchAll(/"(0x[0-9a-fA-F]{40})"/g)].map((m) => m[1]);
    const sizan = emekliAdresler.filter((a) =>
      pulseGovde.toLowerCase().includes(a.toLowerCase()));
    ok(emekliAdresler.length > 0 && sizan.length === 0,
      "EMEKLI ADRESLER PULSE'A SIZMAMIS",
      sizan.length ? "SIZAN: " + sizan.join(", ")
        : emekliAdresler.length + " emekli adres, hicbiri arayuzun " +
          "okudugu yerde degil — zincirden silinemiyorlar, tek " +
          "yapilabilen her isaretciyi kesmek");

    /* ---- THE ABI, NOT JUST THE ADDRESS ----------------------------
     *
     * This audit checked that the interface points at the VERIFIED
     * contracts and passed — while the interface was calling three
     * functions that do not exist on them:
     *
     *     launchSayisi()   renamed to launchCount()
     *     launchAt()       became a struct with ten fields
     *     ESIK()           removed with graduation
     *
     * Nothing would have reverted visibly. A call to a missing function
     * returns empty, the decoder gives null, and the screen says "could
     * not read" — which looks like a network problem. The launch list
     * would have been empty forever and the address check would have
     * kept passing.
     *
     * So the names the interface declares are compared against the
     * deployed ABI. A right address with a wrong ABI is a screen that
     * shows nothing and blames the network. */
    {
      const zincirKaynak = fs.readFileSync(path.join(JS, "zincir.js"), "utf8");
      /* NAMES WERE NOT ENOUGH, AND THE GOVERNANCE TABLES WERE NOT CHECKED
       *
       * Two gaps, both found by hand after this check had already
       * passed:
       *
       *   1. It compared NAMES only. ABI.governor declared
       *      proposals(uint256) with eleven return fields; DepthGovernor
       *      returns twelve, because a snapshotTotal was added before
       *      forVotes. The name matched, so this said OK — while every
       *      proposal on screen would have shown the staked supply as
       *      the FOR count and a block number as the deadline. A wrong
       *      shape is worse than a missing function: a missing one says
       *      "could not read", a wrong one says something false.
       *
       *   2. Only launchpad and kasa were in the table, so the five
       *      drifts in ABI.governor and ABI.staking — oyYonu, staking,
       *      MIN_OY_GUCU, votingPower, stakeOf, none of which exist on
       *      the FTHM stack — were outside the audit entirely.
       *
       * Now every table is listed and the whole signature is compared:
       * inputs and outputs, in order. */
      /* ALL FOURTEEN TABLES, INCLUDING THE WRITE ONES
           The list had five entries while zincir.js had fourteen tables,
           and the nine outside it included every WRITE table — the ones
           that build transactions and spend money. launchpadYaz drives
           the TOKEN OLUSTUR button; a drifted signature there is a
           founder paying into a reverting call.

           A check that covers the read path and skips the write path is
           pointed at the half that cannot lose anything. */
      const tablo = [
        ["launchpad", "PulseLaunchpad"],
        ["launchpadYaz", "PulseLaunchpad"],
        ["kasa", "KopruKasasi"],
        ["governor", "DepthGovernor"],
        ["staking", "Stake"],
        ["stakingYaz", "Stake"],
        ["kanca", "PulseHook"],
        ["acici", "PulseAcici"],
        ["devPool", "DevPool"],
        ["devPoolYaz", "DevPool"],
        ["devPoolTeklif", "DevPool"],
        ["erc20", "LaunchToken"],
        ["erc20Yaz", "LaunchToken"],
        ["pazar", "Pazar"],
        ["pazarYaz", "Pazar"],
        ["egri", "Egri"],
        /* besleyici is NOT in this list and that is deliberate: it
           describes Chainlink's aggregator, an external contract with no
           artifact in build/. Comparing it against our ChainlinkOracle
           wrapper asked the wrong contract and reported latestRoundData
           and decimals as missing — they are missing from the wrapper and
           present on the feed. It gets its own check below. */
      ];

      /* "function ad(a,b) view returns (x,y)" -> {ad, girdi:[a,b], cikti:[x,y]} */
      const parcala = (satir) => {
        const m = satir.match(/function\s+(\w+)\s*\(([^)]*)\)/);
        if (!m) return null;
        const d = satir.match(/returns\s*\(([^)]*)\)/);
        /* TUPLE BIR ALANDIR, ICINDEKI ALANLAR DEGIL
             Bu ayirici virgulden boluyordu, yani "((address,uint256))"
             gibi bir struct donusu alti parcaya ayriliyor ve yapittaki
             tek "tuple" cikisiyla hicbir zaman eslesmiyordu — dogru
             yazilmis bir tanim bile hata verirdi.

             Parantez icindeki her grup tek bir "tuple" sayiliyor; ethers
             de ayni sekilde cozuyor. */
        const bol = (x) => {
          const ham = (x || "").trim();
          if (!ham) return [];
          const parcalar = [];
          let derinlik = 0, suanki = "";
          for (const c of ham) {
            if (c === "(") { derinlik++; suanki += c; continue; }
            if (c === ")") { derinlik--; suanki += c; continue; }
            if (c === "," && derinlik === 0) { parcalar.push(suanki); suanki = ""; continue; }
            suanki += c;
          }
          if (suanki.trim()) parcalar.push(suanki);
          return parcalar
            .map((y) => y.trim())
            .filter(Boolean)
            .map((y) => y.startsWith("(") ? "tuple" : y.split(/\s+/)[0]);
        };
        return { ad: m[1], girdi: bol(m[2]), cikti: bol(d && d[1]) };
      };

      for (const [anahtar, yapitAdi] of tablo) {
        const i = zincirKaynak.indexOf("  " + anahtar + ": [");
        if (i < 0) { ok(false, "ABI." + anahtar + " bulunamadi"); continue; }
        /* THE SLICE ENDS AT THE MATCHING BRACKET — NOT AT "]," 
             The last table in the object closes with "]" and no comma,
             so indexOf("],") ran past it into the following tables and
             reported their functions as missing from this contract. The
             third boundary bug of this shape today, and like the others
             it failed by reading TOO MUCH while looking confident.

             Counting brackets cannot overshoot. */
        const govde = (() => {
          let d = 0;
          for (let j = zincirKaynak.indexOf("[", i); j < zincirKaynak.length; j++) {
            const c = zincirKaynak[j];
            if (c === "[") d++;
            else if (c === "]" && --d === 0) return zincirKaynak.slice(i, j);
          }
          return "";
        })();
        const satirlar = govde.split("\n")
          .filter((x) => x.includes("function "));
        const beyan = satirlar.map(parcala).filter(Boolean);

        let yapit;
        try {
          yapit = JSON.parse(fs.readFileSync(
            path.join(KOK, "build", yapitAdi + ".json"), "utf8"));
        } catch (e) {
          ok(false, yapitAdi + " yapiti okunamadi"); continue;
        }
        const fonk = (yapit.abi || []).filter((x) => x.type === "function");
        const tip = (liste) => (liste || []).map((x) => x.type);
        const harita = new Map(fonk.map((f) => [f.name, f]));

        const eksikFn = [], kotuSekil = [];
        for (const b of beyan) {
          const f = harita.get(b.ad);
          if (!f) { eksikFn.push(b.ad); continue; }
          const g = tip(f.inputs).join(",");
          const c = tip(f.outputs).join(",");
          if (g !== b.girdi.join(",")) {
            kotuSekil.push(b.ad + " girdi: sayfa (" + b.girdi.join(",") +
              ") / sozlesme (" + g + ")");
            continue;
          }
          /* An interface may legitimately declare no return for a write
             it does not read back; a DIFFERENT return is the drift. */
          if (b.cikti.length > 0 && c !== b.cikti.join(",")) {
            kotuSekil.push(b.ad + " donus: sayfa " + b.cikti.length +
              " alan / sozlesme " + tip(f.outputs).length + " alan");
          }
        }

        ok(beyan.length > 0 && eksikFn.length === 0 && kotuSekil.length === 0,
          "ABI." + anahtar + " TAM IMZASIYLA " + yapitAdi + " ILE AYNI",
          eksikFn.length || kotuSekil.length
            ? [eksikFn.length ? "YOK: " + eksikFn.join(", ") : null,
               kotuSekil.length ? "SEKIL: " + kotuSekil.join("  |  ") : null]
              .filter(Boolean).join("   ")
            : beyan.length + " fonksiyon, girdi ve donus alanlariyla birlikte");
      }

      /* ---- THE FEED IS SOMEBODY ELSE'S CONTRACT ------------------
       *
       * ABI.besleyici describes Chainlink's AggregatorV3Interface, so
       * there is no artifact of ours to diff it against. Excluding it
       * and saying nothing would leave the one table nobody checks —
       * and a wrong return shape here does not fail loudly: it decodes
       * garbage into a PRICE, which is the worst place in this system
       * to be quietly wrong.
       *
       * So the published interface is written out once, here, and the
       * table is held to it exactly. Chainlink's shape is fixed and
       * public; if our table ever stops matching it, that is a change
       * somebody made on our side.
       */
      {
        const BEKLENEN = [
          "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
          "function decimals() view returns (uint8)"
        ];
        const i = zincirKaynak.indexOf("  besleyici: [");
        const govde = i < 0 ? "" : (() => {
          let d = 0;
          for (let j = zincirKaynak.indexOf("[", i); j < zincirKaynak.length; j++) {
            const c = zincirKaynak[j];
            if (c === "[") d++;
            else if (c === "]" && --d === 0) return zincirKaynak.slice(i, j);
          }
          return "";
        })();
        const satirlar = govde.split(String.fromCharCode(10))
          .map((x) => x.trim())
          .filter((x) => x.startsWith(String.fromCharCode(34) + "function"))
          .map((x) => x.replace(/^"|",?$/g, ""));
        const ayni = satirlar.length === BEKLENEN.length &&
          BEKLENEN.every((b, k) => satirlar[k] === b);
        ok(ayni,
          "ABI.besleyici CHAINLINK IN YAYIMLANMIS ARAYUZU ILE AYNI",
          ayni
            ? "latestRoundData + decimals, donus alanlari dahil — yanlis " +
              "bir donus sekli burada sessizce bir FIYATI bozar"
            : "FARKLI: " + satirlar.join("  |  "));
      }

      /* The launch list decodes launchAt inline rather than from the ABI
         table, so its shape is checked separately — a field read from
         the wrong position is worse than one that cannot be read. */
      const lpYapit = JSON.parse(fs.readFileSync(
        path.join(KOK, "build", "PulseLaunchpad.json"), "utf8"));
      const launchAt = (lpYapit.abi || []).find((x) => x.name === "launchAt");
      const alanlar = ((launchAt && launchAt.outputs[0].components) || [])
        .map((c) => c.name);
      const eksikAlan = alanlar.filter((a) =>
        !zincirKaynak.includes(a + ":") && !zincirKaynak.includes(a + " "));
      ok(alanlar.length === 10 && eksikAlan.length === 0,
        "launchAt STRUCT ALANLARI ARAYUZDE TAM",
        eksikAlan.length ? "EKSIK: " + eksikAlan.join(", ")
          : alanlar.length + " alan: " + alanlar.join(", "));
    }

    /* ---- A BUTTON THAT DOES NOTHING IS STILL A BUTTON -------------
     *
     * The check above asks whether a view CONSULTS canli(). The creation
     * form did — and the moment launchpadCanli() became true it rendered
     * a large brand button with no click handler at all. The audit that
     * exists to enforce "calismayan ozellikleri aktif buton olarak
     * sunma" passed while that rule was broken.
     *
     * Consulting the gate and acting are different things. A large brand
     * button has to carry a handler, or be an anchor with somewhere to
     * go. */
    {
      const sorunlu = [];
      for (const dosya of fs.readdirSync(path.join(JS, "gorunum"))) {
        if (!dosya.endsWith(".js")) continue;
        const kaynak = fs.readFileSync(path.join(JS, "gorunum", dosya), "utf8");
        if (!kaynak.includes("dugme--buyuk")) continue;
        /* A handler anywhere in the view is enough: the button is built
           in one place and wired in another often enough that requiring
           them adjacent would be a style rule, not a safety one. */
        const eylem = kaynak.includes("addEventListener") ||
                      kaynak.includes("on: {") ||
                      kaynak.includes("attr: { href");
        if (!eylem) sorunlu.push(dosya);
      }
      ok(sorunlu.length === 0,
        "BUYUK MARKA DUGMESI OLAN HER GORUNUM BIR SEY YAPIYOR",
        sorunlu.length ? "ISLEVSIZ: " + sorunlu.join(", ")
          : "her birinde ya bir isleyici ya bir href var — kapiyi sormak " +
            "yetmez, dugmenin is yapmasi gerekir");
    }

    ok(!!uzakInitHash && adreslerKaynak.includes(uzakInitHash),
      "uzak kasa init hash'i sayfada planla ayni",
      (uzakInitHash || "plan okunamadi") +
        " — ayrismasi, ilk teminat transferinin hicbir yere inmesi demek");
  }
}

/* A view must not render an enabled control for something that cannot
   happen. Two checks, because the first one's premise turned out to be
   incomplete.

   CHECK ONE — the button's SHAPE
     A brand-coloured LARGE button is the shape a launch-or-trade control
     takes here, and those act on PULSE contracts that are all null. So
     any view drawing one must reference canli().

   CHECK TWO — what the view actually DOES
     The shape check passed for dao.js and teklifler.js by never looking
     at them: those send transactions from `dugme dugme--marka` without
     `--buyuk`, so they were skipped, and the audit reported that every
     transaction-sending button was guarded while two screens full of
     them had just been added.

     A green statement about code it did not read is worse than a red
     one. So the second check keys on the call that actually sends —
     cuzdan.gonder( — and requires the view to verify SOMETHING first:
     canli() for a contract that may not exist, or zincirdeMi() for a
     wallet that may be on another chain. A view that sends without
     either is a view that spends somebody's gas to find out. */
let korumasiz = 0;
for (const f of dosyalar(path.join(JS, "gorunum"))) {
  const kaynak = fs.readFileSync(f, "utf8");
  if (!/dugme--marka dugme--buyuk/.test(kaynak)) continue;
  if (/launchpadCanli\(\)|canli\(/.test(kaynak)) continue;
  console.log("     KORUMASIZ  " + path.relative(KOK, f) +
    " buyuk marka dugmesi var ama canli() korumasi yok");
  korumasiz++;
}
ok(korumasiz === 0, "buyuk marka dugmesi olan her gorunum canli() kontrol ediyor");

let gonderenKorumasiz = 0;
let gonderen = 0;
for (const f of dosyalar(path.join(JS, "gorunum"))) {
  const kaynak = fs.readFileSync(f, "utf8");
  if (!/cuzdan\.gonder\(/.test(kaynak)) continue;
  gonderen++;
  if (/canli\(|zincirdeMi\(/.test(kaynak)) continue;
  console.log("     KORUMASIZ  " + path.relative(KOK, f) +
    " cuzdan.gonder() cagiriyor ama ne canli() ne zincirdeMi() var");
  gonderenKorumasiz++;
}
ok(gonderenKorumasiz === 0,
  "ISLEM GONDEREN HER GORUNUM ONCE BIR SEY DOGRULUYOR",
  gonderen + " gorunum islem gonderiyor");

/* THE LANDING PAGE'S OWN ADDRESS BLOCK
     Everything above checks the app's adresler.js. The landing page keeps
     its own `const A = {...}` for its live numbers, and nothing checked
     it: until 13 Oct 2026 it read the launchpad deployed on 8 Oct, two
     generations back. Both had zero launches, so the page printed the
     right number from the wrong contract. Every address there must now
     match a deployment record, and the Robinhood row must not carry an
     address that no record backs. */
{
  console.log("");
  console.log("6) ANA SAYFANIN ADRESLERI DAGITIM KAYDIYLA AYNI MI");
  const sayfa = fs.readFileSync(path.join(KOK, "docs", "index.html"), "utf8");
  const blok = (bas) => {
    const i = sayfa.indexOf(bas);
    return i < 0 ? null : sayfa.slice(i, sayfa.indexOf("};", i) + 2);
  };
  const aBlok = blok("const A = {");
  const rhBlok = blok("const RH = {");
  ok(aBlok != null, "index.html'de A adres blogu bulundu");
  const p2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse2.json"), "utf8")).arc;
  const pz = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pazar.json"), "utf8")).arc;
  const ft = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
  const beklenen = {
    launchpad: p2.launchpad, hook: p2.hook, devPool: p2.devPool, likidite: p2.likiditeKasasi,
    pazar: pz.pazar, fthm: ft.token, poolManager: p2.poolManager, usdc: p2.quote,
  };
  const sayfadaki = Object.fromEntries([...(aBlok || "").matchAll(/(\w+):\s*"(0x[0-9a-fA-F]{40})"/g)].map((m) => [m[1], m[2]]));
  const yanlis = Object.entries(beklenen).filter(([k, v]) => String(sayfadaki[k] || "").toLowerCase() !== String(v).toLowerCase());
  for (const [k, v] of yanlis) console.log("     YANLIS  " + k + " sayfada " + (sayfadaki[k] || "yok") + ", kayitta " + v);
  ok(yanlis.length === 0, "ANA SAYFA GUNCEL NESLI OKUYOR", Object.keys(beklenen).length + " adres kayitla karsilastirildi");
  const fazla = Object.keys(sayfadaki).filter((k) => !(k in beklenen));
  ok(fazla.length === 0, "ana sayfada kaydi olmayan adres yok", fazla.join(", ") || "yok");
  const rhLp = rhBlok && rhBlok.match(/launchpad:\s*(null|"0x[0-9a-fA-F]{40}")/);
  const rhKayit = fs.existsSync(path.join(KOK, "dagitim-robinhood.json"));
  ok(rhLp != null && (rhLp[1] === "null") === !rhKayit,
    "Robinhood satiri kayitla tutarli (kayit yoksa launchpad null)",
    "launchpad " + (rhLp ? rhLp[1] : "?") + ", kayit " + (rhKayit ? "var" : "yok"));

  /* FTHM on two chains: the seven addresses the page lists must be the
     ones in the deployment record, or the page links to the wrong code. */
  const f2Yol = path.join(KOK, "dagitim-fthm-iki-zincir.json");
  const f2Blok = blok("const F2 = {");
  if (fs.existsSync(f2Yol)) {
    const f2 = JSON.parse(fs.readFileSync(f2Yol, "utf8"));
    const f2Beklenen = {
      adapter: f2.arc.FTHMOFTAdapter, elci: f2.arc.FiyatElcisi, kapiArc: f2.arc.FTHMKapi,
      oft: f2.rh.FTHMOFT, hook: f2.rh.FTHMFarkHook, acici: f2.rh.TekYonluAcici, kapiRh: f2.rh.FTHMKapi,
    };
    const f2Sayfa = Object.fromEntries([...(f2Blok || "").matchAll(/(\w+):"(0x[0-9a-fA-F]{40})"/g)].map((m) => [m[1], m[2]]));
    const f2Yanlis = Object.entries(f2Beklenen).filter(([kk, v]) => String(f2Sayfa[kk] || "").toLowerCase() !== String(v).toLowerCase());
    for (const [kk, v] of f2Yanlis) console.log("     YANLIS  F2." + kk + " sayfada " + (f2Sayfa[kk] || "yok") + ", kayitta " + v);
    ok(f2Blok != null && f2Yanlis.length === 0, "FTHM iki zincir adresleri kayitla ayni", Object.keys(f2Beklenen).length + " adres");
  }
}

console.log("");
console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
process.exit(kotu === 0 ? 0 : 1);
