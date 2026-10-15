"use strict";
/* ===========================================================================
 * denetim-iki-zincir.js — every two-chain audit, in one run
 *
 *   node scripts/denetim-iki-zincir.js
 *
 * The Arc + Robinhood work (12-13 Oct 2026) added seven audits, each its own
 * script. Run separately, one forgotten script is a regression nobody sees.
 * This runs all of them in sequence, prints each one's last line and fails
 * if any fails. The --robinhood launch measurement runs against Robinhood
 * mainnet state; the rest run against Arc mainnet state. Nothing is sent.
 * =========================================================================== */
const { spawnSync } = require("child_process");
const path = require("path");

const ISLER = [
  ["FTHM kopru (OFT)", ["denetim-fthm-kopru.js"]],
  ["fark ucreti kutuphanesi", ["denetim-fark-ucreti.js"]],
  ["fark ucreti hook + fiyat elcisi", ["denetim-fthm-fark.js"]],
  ["launch, Robinhood ana ag (USDG)", ["olc-pulse-launch.js", "--robinhood"]],
  ["ikiz token", ["denetim-ikiz.js"]],
  ["ikiz havuzu, Robinhood ana ag", ["denetim-ikiz-havuz.js"]],
  ["ev fiyati koprusu", ["denetim-ev-fiyat.js"]],
  ["DAO koprusu", ["denetim-dao-koprusu.js"]],
  ["FTHM tek piyasa: kapilar + tek fiyat", ["denetim-fthm-kapi.js"]],
  ["ag: ikiz nesli, 9 zincir gercek durum", ["denetim-ikiz-ag.js"]],
  ["ag: fiyat agi + DAO, 9 zincir gercek durum", ["denetim-ag-cekirdek.js"]],
  ["ag: mesaj mantigi (uc nokta duzenegi)", ["denetim-ag-mantik.js"]],
];

let kaldi = 0;
for (const [ad, arg] of ISLER) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, arg[0]), ...arg.slice(1)], { encoding: "utf8", timeout: 600000 });
  const satirlar = (r.stdout || "").trim().split("\n").filter(Boolean);
  const son = satirlar[satirlar.length - 1] || (r.stderr || "").trim().split("\n").pop() || "cikti yok";
  const iyi = r.status === 0;
  if (!iyi) kaldi++;
  console.log((iyi ? "  ok   " : "  HATA ") + ad.padEnd(34) + son.trim() + "  (" + ((Date.now() - t0) / 1000).toFixed(0) + " sn)");
}
console.log("\n" + (ISLER.length - kaldi) + "/" + ISLER.length + " denetim gecti");
process.exit(kaldi ? 1 : 0);
