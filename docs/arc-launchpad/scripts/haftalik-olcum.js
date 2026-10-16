"use strict";
/* ===========================================================================
 * haftalik-olcum.js — the weekly growth measurement (plan item E5)
 *
 *   node scripts/haftalik-olcum.js [--gun 7] [--yaz]
 *
 * Reads only what is already recorded, invents nothing:
 *   X        rapor/x-is-defteri.jsonl — follower count at the start and end
 *            of the window, replies / posts / follows made in it
 *   on chain docs/veri/analitik.json (scripts/analitik-ozet.js) — launches,
 *            trades and volume per chain, summed
 *   site     no visitor counter exists on the site yet; reported as
 *            unmeasured instead of guessed
 * --yaz appends one line to rapor/haftalik-olcum.jsonl.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const ARGS = process.argv.slice(2);
const GI = ARGS.indexOf("--gun");
const GUN = GI >= 0 ? Number(ARGS[GI + 1]) : 7;
const SON = Date.now();
const BAS = SON - GUN * 86400e3;

const defter = fs.readFileSync(path.join(KOK, "rapor", "x-is-defteri.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  .map((s) => ({ ...s, t: Date.parse(s.zaman) })).filter((s) => !isNaN(s.t)).sort((a, b) => a.t - b.t);
const pencere = defter.filter((s) => s.t >= BAS && s.t <= SON);
const say = (is) => pencere.filter((s) => s.is === is).length;
const olcumler = defter.filter((s) => typeof s.takipci === "number");
const once = olcumler.filter((s) => s.t < BAS).pop() || olcumler.find((s) => s.t >= BAS);
const sonra = olcumler.filter((s) => s.t <= SON).pop();

const a = JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "analitik.json"), "utf8"));
let launch = 0, islem = 0, hacim = 0;
for (const z of a.zincirler) { launch += z.launch; islem += z.islem; hacim += Number(z.hacim) / 10 ** z.ondalik; }

const sonuc = {
  zaman: new Date(SON).toISOString(),
  pencereGun: GUN,
  x: {
    takipciBas: once ? once.takipci : null,
    takipciSon: sonra ? sonra.takipci : null,
    takipEdilen: sonra && sonra.takip != null ? sonra.takip : null,
    cevap: say("cevap"), gonderi: say("gonderi"), takip: say("takip"),
  },
  zincir: { kaynakZamani: a.olusturuldu, launch, islem, hacimDolar: Math.round(hacim * 100) / 100 },
  site: { ziyaretci: null, not: "sitede ziyaretci sayaci yok — olculmedi" },
};

console.log("HAFTALIK OLCUM (son " + GUN + " gun)");
console.log("  X takipci   " + sonuc.x.takipciBas + " -> " + sonuc.x.takipciSon + "   takip edilen " + sonuc.x.takipEdilen);
console.log("  X is        " + sonuc.x.cevap + " cevap, " + sonuc.x.gonderi + " gonderi, " + sonuc.x.takip + " takip");
console.log("  zincir      " + launch + " launch, " + islem + " islem, " + sonuc.zincir.hacimDolar + " $ hacim  (analitik " + a.olusturuldu + ")");
console.log("  site        olculmedi (sayac yok)");
if (ARGS.includes("--yaz")) {
  fs.appendFileSync(path.join(KOK, "rapor", "haftalik-olcum.jsonl"), JSON.stringify(sonuc) + "\n");
  console.log("  -> rapor/haftalik-olcum.jsonl");
}
