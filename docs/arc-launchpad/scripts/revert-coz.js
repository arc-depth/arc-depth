"use strict";
/* ===========================================================================
 * revert-coz.js — name a revert instead of reporting that one happened
 *
 * WHY THIS IS A MODULE AND NOT A SNIPPET
 *   Uniswap v4 wraps any failing hook or callback in
 *   WrappedError(address target, bytes4 selector, bytes reason, bytes details)
 *   and the wrapping nests. Printing the outer blob reports
 *   "bilinmeyen 0x90bfb865", which is how a debugging round gets spent on a
 *   wrapper instead of a cause. It has already happened twice in this
 *   project: once as WrappedError(hook, beforeAddLiquidity, <empty>), which
 *   was a nonce off by one, and once here.
 *
 *   The selector table is built by SCANNING the sources — this repository
 *   and @uniswap — rather than listing errors by hand, so an error added to
 *   a contract tomorrow is named without anybody remembering to register
 *   it. A hand-kept table silently goes stale and then lies.
 *
 * USE
 *   const { coz, yaz, isim } = require("./revert-coz");
 *   yaz(e.data);            // prints the whole tree
 *   isim(e.data);           // one short name, for a PASS/KOTU line
 *
 *   node scripts/revert-coz.js 0x90bfb865...     // from the shell
 * =========================================================================== */
const { AbiCoder, id } = require("ethers");
const fs = require("fs");
const path = require("path");

const coder = AbiCoder.defaultAbiCoder();
const KOK = path.join(__dirname, "..");

const SOZLUK = {};
/* Errors can be declared at file scope or inside a contract, with or
   without arguments, over one line or several. */
const DESEN = /error\s+(\w+)\s*\(([^)]*)\)/g;

function tara(d) {
  let girdiler;
  try { girdiler = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
  for (const e of girdiler) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) tara(p);
    else if (e.name.endsWith(".sol")) {
      let s;
      try { s = fs.readFileSync(p, "utf8"); } catch (err) { continue; }
      let m;
      while ((m = DESEN.exec(s))) {
        /* Only the TYPES go into a selector, so each parameter is reduced
           to its first word. A signature built with names in it hashes to
           something no chain will ever send. */
        const tipler = m[2].split(",")
          .map((x) => x.trim().split(/\s+/)[0])
          .filter(Boolean)
          .join(",");
        const sig = m[1] + "(" + tipler + ")";
        SOZLUK[id(sig).slice(0, 10)] = sig;
      }
    }
  }
}
tara(path.join(KOK, "contracts"));
tara(path.join(KOK, "node_modules", "@uniswap"));

const SARMAL = id("WrappedError(address,bytes4,bytes,bytes)").slice(0, 10);

/* The selector table covers errors. A wrapped error also carries the
   FUNCTION that failed, so the common hook entry points are named too —
   otherwise the most useful field in the whole blob prints as hex. */
const FONKSIYONLAR = {};
for (const sig of [
  "beforeInitialize(address,(address,address,uint24,int24,address),uint160)",
  "afterInitialize(address,(address,address,uint24,int24,address),uint160,int24)",
  "beforeAddLiquidity(address,(address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)",
  "afterAddLiquidity(address,(address,address,uint24,int24,address),(int24,int24,int256,bytes32),int256,int256,bytes)",
  "beforeRemoveLiquidity(address,(address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)",
  "afterRemoveLiquidity(address,(address,address,uint24,int24,address),(int24,int24,int256,bytes32),int256,int256,bytes)",
  "beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)",
  "afterSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),int256,bytes)",
  "beforeDonate(address,(address,address,uint24,int24,address),uint256,uint256,bytes)",
  "afterDonate(address,(address,address,uint24,int24,address),uint256,uint256,bytes)",
  "unlockCallback(bytes)"
]) {
  FONKSIYONLAR[id(sig).slice(0, 10)] = sig.split("(")[0];
}

/* A decoded tree: { tur, isim, hedef?, cagrilan?, alt: [...] }. Returned
   as data rather than printed, so a caller can assert on it. */
function coz(d) {
  if (!d || d === "0x" || String(d).length < 10) {
    return { tur: "bos", isim: "(bos — kodsuz adrese cagri ya da ciplak revert)", alt: [] };
  }
  const h = String(d);
  const sel = h.slice(0, 10);

  if (sel === SARMAL) {
    let hedef, iSel, sebep, detay;
    try {
      [hedef, iSel, sebep, detay] = coder.decode(["address", "bytes4", "bytes", "bytes"], "0x" + h.slice(10));
    } catch (e) {
      return { tur: "bozuk", isim: "WrappedError (cozulemedi)", alt: [] };
    }
    const alt = [];
    if (sebep && sebep !== "0x") alt.push(coz(sebep));
    if (detay && detay !== "0x") alt.push(coz(detay));
    return {
      tur: "sarmal",
      isim: "WrappedError",
      hedef,
      cagrilan: (FONKSIYONLAR[iSel] || SOZLUK[iSel] || iSel),
      alt
    };
  }

  if (sel === "0x08c379a0") {
    try { return { tur: "metin", isim: 'Error("' + coder.decode(["string"], "0x" + h.slice(10))[0] + '")', alt: [] }; }
    catch (e) { /* fall through */ }
  }
  if (sel === "0x4e487b71") {
    try {
      const kod = coder.decode(["uint256"], "0x" + h.slice(10))[0];
      const ACIKLAMA = {
        1: "assert", 17: "tasma/aritmetik", 18: "sifira bolme",
        33: "gecersiz enum", 49: "bos diziden pop", 50: "dizi sinirlari disi",
        65: "asiri bellek", 81: "sifir fonksiyon isaretcisi"
      };
      return { tur: "panic", isim: "Panic(" + kod + " — " + (ACIKLAMA[Number(kod)] || "?") + ")", alt: [] };
    } catch (e) { /* fall through */ }
  }

  return {
    tur: SOZLUK[sel] ? "hata" : "bilinmeyen",
    isim: SOZLUK[sel] || ("bilinmeyen " + sel),
    alt: []
  };
}

/// The innermost name — what actually failed, with the wrappers stripped.
/// This is what belongs on a one-line PASS/KOTU, because "WrappedError" is
/// never the answer to "why".
function isim(d) {
  let n = coz(d);
  while (n.tur === "sarmal" && n.alt.length > 0) {
    /* Follow the deepest non-empty branch: v4 puts the cause in `reason`
       and extra context in `details`, and an empty reason with a full
       details field is common. */
    const dolu = n.alt.filter((a) => a.tur !== "bos");
    if (dolu.length === 0) return n.cagrilan ? "WrappedError@" + n.cagrilan : n.isim;
    n = dolu[dolu.length - 1];
  }
  return n.isim;
}

function yaz(d, derinlik) {
  const n = typeof d === "object" && d && d.tur ? d : coz(d);
  const g = "    ".repeat(derinlik || 0);
  if (n.tur === "sarmal") {
    console.log(g + "WrappedError   hedef " + n.hedef + "   cagrilan " + n.cagrilan);
  } else {
    console.log(g + n.isim);
  }
  for (const a of n.alt) yaz(a, (derinlik || 0) + 1);
}

/// The same thing without the argument list. A test asserting on WHICH
/// error fired compares names, and making every call site strip the
/// parentheses is how one of them forgets to.
function kisaIsim(d) {
  const i = String(isim(d));
  const p = i.indexOf("(");
  return p > 0 ? i.slice(0, p) : i;
}

module.exports = { coz, yaz, isim, kisaIsim, SOZLUK };

if (require.main === module) {
  const d = process.argv[2];
  if (!d) {
    console.log("kullanim: node scripts/revert-coz.js 0x<revert verisi>");
    console.log("  sozlukte " + Object.keys(SOZLUK).length + " hata imzasi var");
    process.exit(0);
  }
  yaz(d, 1);
  console.log("");
  console.log("  en ictekisi: " + isim(d));
}
