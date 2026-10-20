"use strict";
/* ===========================================================================
 * bekci-dongu.js — the keeper, running: every task, every few minutes
 *
 *   node scripts/bekci-dongu.js              loop, sends (the keeper's own wallet)
 *   node scripts/bekci-dongu.js --bir        one round and exit
 *
 * Each round runs the keeper's tasks one after another as separate
 * processes, so one task's failure (an RPC refusing, a chain rate-limited)
 * never stops the others or the loop:
 *   bekci.js --uygula          CCTP delivery between the EVM Habercis
 *   bekci-doldur.js --uygula   auctions that pay
 * Rounds are ARALIK apart. Output goes to rapor/bekci-gunluk.txt as well.
 * This is the local runner; the same tasks move to a cloud runner later.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const KOK = path.join(__dirname, "..");
const ARALIK = 3 * 60 * 1000;
const GUNLUK = path.join(KOK, "rapor", "bekci-gunluk.txt");
const GOREVLER = [["bekci.js", "--uygula"], ["bekci-sui.js", "--uygula"], ["bekci-aptos.js", "--uygula"],
  ["bekci-doldur.js", "--uygula"], ["bekci-move-doldur.js", "--uygula"]];
/* the Move tasks load the Sui and Aptos SDKs from here */
const NODE_PATH = ["C:/Users/omen/araclar/suisdk/node_modules", "C:/Users/omen/araclar/aptossdk/node_modules", path.join(KOK, "node_modules")].join(path.delimiter);
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const yaz = (s) => { process.stdout.write(s); fs.appendFileSync(GUNLUK, s); };

(async () => {
  fs.mkdirSync(path.dirname(GUNLUK), { recursive: true });
  for (let tur = 1; ; tur++) {
    yaz("\n=== TUR " + tur + "  " + new Date().toISOString() + "\n");
    for (const [dosya, ...arg] of GOREVLER) {
      const r = cp.spawnSync(process.execPath, [path.join(__dirname, dosya), ...arg], { cwd: KOK, encoding: "utf8", timeout: 10 * 60 * 1000, env: { ...process.env, NODE_PATH } });
      yaz((r.stdout || "") + (r.stderr ? r.stderr.split("\n").filter((l) => /HATA|Error/.test(l)).join("\n") + "\n" : ""));
    }
    if (process.argv.includes("--bir")) break;
    await bekle(ARALIK);
  }
})();
