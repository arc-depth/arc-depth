"use strict";
/* ===========================================================================
 * denetim-dagitim-robinhood.js — is what landed on Robinhood what we built?
 *
 *   node scripts/denetim-dagitim-robinhood.js
 *
 * Reads dagitim-robinhood-plan.json and checks the chain, not the plan:
 * every contract has code of the compiled length, the hook sits on the 0xACC
 * permission bits, and the ring closes both ways — the launchpad knows the
 * hook, the hook knows the launchpad, both know the same dev pool and
 * liquidity vault, the dev pool answers to UzakYurutucu, the quote is USDG
 * and the registry is KapaliKayit. Only then is dagitim-robinhood.json
 * written, which is what the site is allowed to read.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Contract } = require("ethers");

const KOK = path.join(__dirname, "..");
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const plan = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-robinhood-plan.json"), "utf8"));
const p = new JsonRpcProvider("https://rpc.mainnet.chain.robinhood.com", { chainId: 4663, name: "robinhood" }, { staticNetwork: true });

let kotu = 0;
const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };
const esit = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

(async () => {
  if (!plan.uygulandiMi) { console.log("Plan henuz uygulanmadi."); process.exit(1); }
  const D = plan.dagitilan;
  console.log("ROBINHOOD DAGITIM DENETIMI");
  for (const [ad, a] of Object.entries(D)) {
    const k = await p.getCode(a);
    ok((k.length - 2) / 2 === (B(ad).deployedBytecode.length - 2) / 2, ad + " kodu derlenenle ayni boyda", a);
  }
  ok((parseInt(D.PulseHook.slice(-4), 16) & 0x3fff) === 0xacc, "hook 0xACC izin bitlerinde");

  const lp = new Contract(D.PulseLaunchpad, B("PulseLaunchpad").abi, p);
  const hk = new Contract(D.PulseHook, B("PulseHook").abi, p);
  const dp = new Contract(D.DevPool, B("DevPool").abi, p);
  ok(esit(await lp.hook(), D.PulseHook), "launchpad -> hook");
  ok(esit(await hk.launchpad(), D.PulseLaunchpad), "hook -> launchpad");
  ok(esit(await lp.quote(), plan.quote) && esit(await hk.quote(), plan.quote), "iki taraf da USDG");
  ok(esit(await lp.gelistiriciFonu(), D.DevPool) && esit(await hk.gelistiriciFonu(), D.DevPool), "ayni gelistirici havuzu");
  ok(esit(await lp.likiditeKasasi(), D.PulseLikiditeKasasi) && esit(await hk.likiditeKasasi(), D.PulseLikiditeKasasi), "ayni likidite kasasi");
  ok(esit(await lp.kayit(), D.KapaliKayit), "kayit KapaliKayit (CCTP yok)");
  ok(esit(await dp.governor(), D.UzakYurutucu), "gelistirici havuzunun yoneticisi UzakYurutucu (Arc DAO)");
  ok(Number(await lp.launchCount()) === 0, "henuz launch yok");

  if (kotu === 0) {
    fs.writeFileSync(path.join(KOK, "dagitim-robinhood.json"), JSON.stringify({
      olculdu: new Date().toISOString(), zincir: 4663, kaynak: "zincirden dogrulandi",
      robinhood: { launchpad: D.PulseLaunchpad, hook: D.PulseHook, devPool: D.DevPool, likiditeKasasi: D.PulseLikiditeKasasi,
        fabrika: D.PulseFabrika, kasaFabrika: D.KasaFabrika, yoneticiFabrika: D.YoneticiFabrika, kayit: D.KapaliKayit,
        uzakYurutucu: D.UzakYurutucu, poolManager: plan.poolManager, quote: plan.quote },
      acik: "UzakYurutucu sahibi gecici olarak dagitici: Arc'ta DaoElcisi kurulup peer ayarlaninca sahiplik yakilacak.",
    }, null, 1));
    console.log("\n  dagitim-robinhood.json yazildi.");
  }
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu ? 1 : 0);
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
