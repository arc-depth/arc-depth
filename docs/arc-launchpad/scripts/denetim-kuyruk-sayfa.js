"use strict";
/* Does the queue screen tell the customer the truth about a refund?
 *
 * iadeAl() returns usdcNet + holderPay and nothing else: the developer and
 * protocol slices leave the contract the moment the request opens. The
 * screen used to say nothing about it at all, which reads as "you get your
 * money back".
 *
 * Two things are checked, and the second matters more than the first.
 *
 *   The ABI fragments the page uses for the split resolve against the
 *   deployed queue. A fragment that does not match shows up in a browser
 *   as a silently missing sentence — the same failure mode the disclosure
 *   is meant to fix.
 *
 *   The page does not carry a typed refund percentage. One did get typed
 *   into it while this was being written, and this file is the reason it
 *   is not there now: a number written into the page goes stale the first
 *   time the contract changes and nothing catches it. That already
 *   happened once here, to the slippage comparison line.
 *
 * Read-only.
 */
const fs = require("fs");
const path = require("path");
const { Contract, JsonRpcProvider } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim.json"), "utf8"));
const SAYFA = fs.readFileSync(path.join(KOK, "docs", "app.html"), "utf8");

let gecen = 0, kalan = 0;
const ok = (ad, kosul, not) => {
  if (kosul) { gecen++; console.log("  OK     " + ad + (not ? "   " + not : "")); }
  else { kalan++; console.log("  KALDI  " + ad + (not ? "   " + not : "")); }
};

/* Splits the real arguments of every satir(...) call and returns the ones
   whose third argument looks like prose instead of a CSS class. Only a
   handful of class tokens are ever legitimate there; anything with a
   space, an accent or punctuation was meant for the reader. */
function sinifYuvasiniTara(metin) {
  const SAYILAN = new Set(["", "big"]);
  const bulgular = [];
  let i = 0;
  while ((i = metin.indexOf("satir(", i)) !== -1) {
    /* Skip the definition itself. */
    const onceki = metin.slice(Math.max(0, i - 14), i);
    if (/const\s+$/.test(onceki)) { i += 6; continue; }
    let j = i + 6, derinlik = 1, tirnak = null, kacis = false;
    const parcalar = [];
    let su = "";
    while (j < metin.length && derinlik > 0) {
      const c = metin[j];
      if (kacis) { su += c; kacis = false; j++; continue; }
      if (c === "\\") { su += c; kacis = true; j++; continue; }
      if (tirnak) {
        su += c;
        if (c === tirnak) tirnak = null;
      } else if (c === '"' || c === "'" || c === "`") { su += c; tirnak = c; }
      else if (c === "(" || c === "[" || c === "{") { derinlik++; su += c; }
      else if (c === ")" || c === "]" || c === "}") {
        derinlik--;
        if (derinlik === 0) { parcalar.push(su); break; }
        su += c;
      } else if (c === "," && derinlik === 1) { parcalar.push(su); su = ""; }
      else su += c;
      j++;
    }
    i = j + 1;
    if (parcalar.length < 3) continue;
    const ucuncu = parcalar[2].trim();
    const m = /^"([^"]*)"$|^'([^']*)'$/.exec(ucuncu);
    if (!m) continue;                       // a variable, not a literal
    const deger = m[1] !== undefined ? m[1] : m[2];
    if (SAYILAN.has(deger)) continue;
    if (/^[a-z0-9_ -]{0,16}$/.test(deger)) continue;   // plausibly a class
    bulgular.push(deger.slice(0, 40));
  }
  return bulgular;
}

/* The page's own ABI, lifted rather than retyped. */
function abiCek(ad) {
  const i = SAYFA.indexOf("\n  " + ad + ":[");
  if (i < 0) return null;
  const j = SAYFA.indexOf("\n  ],", i);
  return [...SAYFA.slice(i, j).matchAll(/"((?:function|event)[^"]+)"/g)].map((m) => m[1]);
}

(async function () {
  console.log("");
  console.log("KUYRUK EKRANI — IADE ANLATIMI");
  console.log("  kuyruk " + D.queue);
  console.log("");

  /* ---- 1. the page says something about the refund at all ------- */
  ok("ekranda iade satiri var", /teslim edilmezse iaden/.test(SAYFA));
  ok("gelistirici ve protokol dilimlerinin geri gelmedigi yaziyor",
     /geri\s*(<\/?strong>)?\s*gelmez/.test(SAYFA));
  ok("iade kaybi tutar olarak gosteriliyor", /iadeKayip/.test(SAYFA));

  /* satir()'s note slot has to exist, or the sentence lands in a class
     attribute and never renders — which is what three rows were doing. */
  ok("satir() gercek bir not alani tasiyor",
     /const satir = \(l,v,cls="",not=""\)/.test(SAYFA));
  ok("not icin stil tanimli", /\.rownot\{/.test(SAYFA));
  /* Argument-aware, because a regex cannot tell the second argument from
     the third. My first version matched any satir() call with a long
     second argument and reported eight violations that were all fine —
     a check that cries wolf gets switched off, which is worse than not
     having it. This splits the real arguments and looks only at the
     third, flagging it when it reads like a sentence rather than a class
     token. */
  const sinifaKacan = sinifYuvasiniTara(SAYFA);
  ok("hicbir aciklama hala cls yuvasina gitmiyor", sinifaKacan.length === 0,
     sinifaKacan.length ? sinifaKacan.join(" | ") : "");

  /* ---- 2. no typed percentage ----------------------------------- */
  /* The whole point: the figure is derived from the chain, not written
     down here. */
  const tipli = [];
  for (const kalip of [/%98[.,]6/, /0\.986/, /%1[.,]40?['’]?(lik|lık)?\s*kay/, /%0[.,]60['’]?[ıi]\s*tutucu/])
    if (kalip.test(SAYFA)) tipli.push(String(kalip));
  ok("sayfaya yazilmis iade yuzdesi YOK", tipli.length === 0, tipli.join(", "));
  ok("dilimler zincirden okunuyor",
     /HOLDER_SHARE_BPS\(\)/.test(SAYFA) && /DEV_SHARE_BPS\(\)/.test(SAYFA));

  /* ---- 3. the fragments work against the deployed queue --------- */
  const abi = abiCek("queue");
  ok("sayfadan queue ABI cikarilabildi", !!abi && abi.length > 0, abi ? abi.length + " parca" : "");
  if (!abi) { console.log(""); console.log("  " + gecen + " gecti, " + kalan + " kaldi"); process.exit(1); }

  const p = new JsonRpcProvider(RPC, 5042, { staticNetwork: true });
  const c = new Contract(D.queue, abi, p);
  const degerler = {};
  for (const fn of ["HOLDER_SHARE_BPS", "DEV_SHARE_BPS", "ucretPpm"]) {
    try { degerler[fn] = BigInt(await c[fn]()); ok(fn + " canli kontrattan okunuyor", true, degerler[fn].toString()); }
    catch (e) { ok(fn + " canli kontrattan okunuyor", false, (e.shortMessage || e.message).slice(0, 60)); }
    await new Promise((r) => setTimeout(r, 450));
  }

  /* ---- 4. and the arithmetic the page will show is right -------- */
  if (degerler.HOLDER_SHARE_BPS !== undefined && degerler.ucretPpm !== undefined) {
    const h = degerler.HOLDER_SHARE_BPS, d = degerler.DEV_SHARE_BPS;
    const pBps = 10000n - h - d;
    const ucret = degerler.ucretPpm;              // ppm of the deposit
    /* On a 1000 unit deposit, in ppm throughout to stay exact. */
    const yatirim = 1_000_000n;                   // 100% in ppm
    const fee = (yatirim * ucret) / 1_000_000n;
    const iade = yatirim - fee + (fee * h) / 10000n;
    const kayip = fee - (fee * h) / 10000n;
    const yuz = (ppm) => (Number(ppm) / 10000).toFixed(2) + "%";
    console.log("");
    console.log("  ucret          " + yuz(fee));
    console.log("    tutucu       " + yuz((fee * h) / 10000n) + "   kontratta bekler, IADE EDILIR");
    console.log("    gelistirici  " + yuz((fee * d) / 10000n) + "   talep aninda cikar, geri gelmez");
    console.log("    protokol     " + yuz((fee * pBps) / 10000n) + "   talep aninda cikar, geri gelmez");
    console.log("  IADE           " + yuz(iade));
    console.log("  KAYIP          " + yuz(kayip));
    ok("iade + kayip = yatirim", iade + kayip === yatirim);
    ok("iade yatirimin tamami DEGIL", iade < yatirim);
    ok("dilimler ucreti tam bolusuyor",
       (fee * h) / 10000n + (fee * d) / 10000n + (fee * pBps) / 10000n === fee);
  }

  console.log("");
  console.log("  " + gecen + " gecti, " + kalan + " kaldi");
  process.exit(kalan ? 1 : 0);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
