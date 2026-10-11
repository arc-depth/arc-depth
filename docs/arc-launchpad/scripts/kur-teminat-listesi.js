"use strict";
/* ===========================================================================
 * kur-teminat-listesi.js — build the suggested 50 FROM MEASUREMENT
 *
 *   node scripts/kur-teminat-listesi.js
 *
 * THE SOURCE CHANGED — AND WHY
 *   This script used to build from `teminat-adaylari.json`. That file
 *   derives its candidates FROM CHAINLINK FEEDS: pull the feed list, then
 *   look for each feed's asset on chain. So the gate the user removed was
 *   still deciding the suggestion list.
 *
 *   The result was measured and it was bad: of the 50 suggestions built
 *   that way, only 21 could carry a $2,000 conversion. The rest either had
 *   no USDC pool or a pool so thin that the trade pushed the price 9–58x.
 *   The page said "works" where the chain would have refused.
 *
 *   The source is now `teminat-derinlik.json`: the universe is Uniswap's
 *   public token list (free, no key), and the criterion is the job itself
 *   — can this amount be converted in this pool.
 *
 * THE ORDER: WHAT SIZE IT CARRIES
 *   Measured at four sizes ($20 / $200 / $2,000 / $20,000) and each asset
 *   is recorded with the LARGEST it carried. That is the ranking.
 *
 *   A single threshold would have been the wrong answer: the minimum
 *   collateral is $20, but collateral grows with the tax on every trade
 *   and has no ceiling. "Does it work" has no answer without "at what
 *   size".
 *
 * THE LIST IS NOT A GATE
 *   The user's rule: *"we suggest 50, and whoever launches can paste a
 *   contract address and do it however they want."* These 50 are a
 *   shortcut. Not being on the list is not being banned — the contract
 *   address field on the page runs the same measurement and accepts on
 *   the same terms.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const KAYNAK = path.join(KOK, "teminat-derinlik.json");
const HEDEF = path.join(KOK, "docs", "js", "teminat-listesi.js");
const ADET = 50;

if (!fs.existsSync(KAYNAK)) {
  console.log("teminat-derinlik.json yok. Once: node scripts/olc-teminat-derinlik.js");
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(KAYNAK, "utf8"));

/* One row per symbol, carrying every chain it converts on. The address
   differs per chain — the same symbol is usually a different contract, and
   sometimes (OP-Stack predeploys, CREATE2 vanity deployments) genuinely
   the same one — so the interface needs the whole map. */
const varliklar = new Map();
for (const z of j.zincirler) {
  for (const a of z.adaylar) {
    if (!a.donusturulebilir) continue;
    if (!varliklar.has(a.simge)) {
      varliklar.set(a.simge, {
        simge: a.simge,
        ad: a.ad || a.simge,
        ondalik: a.ondalik,
        zincirler: {},
        havuzToplam: 0,
        azamiTutar: "0"
      });
    }
    const v = varliklar.get(a.simge);
    v.zincirler[z.zincir] = {
      token: a.token,
      kademe: a.kademe,
      havuz: a.havuzSayisi,
      azamiTutar: a.azamiTutar,
      ittirme: a.ittirme
    };
    v.havuzToplam += a.havuzSayisi;
    if (BigInt(a.azamiTutar || 0) > BigInt(v.azamiTutar)) v.azamiTutar = a.azamiTutar;
    /* Decimals should agree across chains and usually do; if they ever
       disagree the smaller is kept, because treating an 8-decimal asset as
       18 overstates every amount by 10^10. */
    if (a.ondalik < v.ondalik) v.ondalik = a.ondalik;
  }
}

const hepsi = [...varliklar.values()].sort((x, y) => {
  const d = Number(BigInt(y.azamiTutar) - BigInt(x.azamiTutar));
  if (d) return d > 0 ? 1 : -1;
  const zx = Object.keys(x.zincirler).length, zy = Object.keys(y.zincirler).length;
  return zy - zx || y.havuzToplam - x.havuzToplam || x.simge.localeCompare(y.simge);
});

const elli = hepsi.slice(0, ADET);
const kalan = hepsi.slice(ADET);

const U = (t) => "$" + (Number(t) / 1e6).toLocaleString("en");

const satirlar = elli.map((v) => {
  const z = Object.entries(v.zincirler)
    .map(([ad, d]) => "      " + ad + ": { token: \"" + d.token +
      "\", kademe: " + d.kademe + ", havuz: " + d.havuz +
      ", azamiTutar: \"" + d.azamiTutar + "\", ittirme: " + d.ittirme + " }")
    .join(",\n");
  return [
    "  {",
    "    simge: \"" + v.simge + "\",",
    "    ad: " + JSON.stringify(v.ad) + ",",
    "    ondalik: " + v.ondalik + ",",
    "    havuz: " + v.havuzToplam + ",",
    "    /* The largest measured conversion this asset clears the floor at. */",
    "    azamiTutar: \"" + v.azamiTutar + "\",",
    "    zincirler: {",
    z,
    "    }",
    "  }"
  ].join("\n");
});

/* How many clear each size, for the page to state plainly. */
const basamaklar = [...new Set(hepsi.map((v) => v.azamiTutar))]
  .sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : -1));
const dagilim = basamaklar.map((t) => ({
  tutar: t,
  adet: hepsi.filter((v) => BigInt(v.azamiTutar) >= BigInt(t)).length
}));

const cikti = [
  "/* ===========================================================================",
  " * teminat-listesi.js — THE " + ADET + " SUGGESTED COLLATERAL ASSETS",
  " *",
  " * THIS FILE IS GENERATED — do not edit it by hand.",
  " *   Source:    teminat-derinlik.json",
  " *   Generator: scripts/kur-teminat-listesi.js",
  " *   Measured:  " + j.olculdu,
  " *",
  " * HOW IT WAS MEASURED — THE CRITERION IS THE JOB ITSELF",
  " *   Behind every row are four on-chain measurements: the deepest USDC",
  " *   pool was found, its liquidity read, its observation history",
  " *   checked, and Uniswap's own quoter was asked whether four separate",
  " *   amounts GENUINELY convert.",
  " *",
  " *   No proxy quality gates such as a liquidity floor or a market-cap",
  " *   threshold were used. The question asked is not a threshold: can",
  " *   this amount be converted in this pool.",
  " *",
  " * WHY THERE IS NO SINGLE \"IT WORKS\"",
  " *   Being able to read a price does not mean you can TRADE in that",
  " *   pool. Measured: SHIB reads a 0.00% price error and still pushes",
  " *   17.5x on a $2,000 trade, because SHIB's liquidity is in SHIB/WETH,",
  " *   not SHIB/USDC. The floor is derived from the marginal price, so a",
  " *   conversion like that is REFUSED.",
  " *",
  " *   So each asset is recorded with the LARGEST amount it carried:",
  ...dagilim.map((d) => " *     up to " + U(d.tutar).padStart(8) + ": " + d.adet + " assets"),
  " *",
  " *   The minimum collateral is $20 (ASGARI_TEMINAT = 20e6), but",
  " *   collateral grows with the tax on every trade and has no ceiling —",
  " *   which is why a single threshold would be the wrong answer.",
  " *",
  " * THIS LIST IS NOT A GATE",
  " *   Whoever launches can pick one of these " + ADET + ", or paste a",
  " *   CONTRACT ADDRESS and pick something else. Not being on the list is",
  " *   not being banned — the page runs the same measurement for a pasted",
  " *   address.",
  " *",
  " *   Of the " + hepsi.length + " assets measured as convertible, " +
    kalan.length + " did not make the list,",
  " *   and every one of them can still be chosen by address:",
  " *   " + kalan.map((v) => v.simge).join(" "),
  " * =========================================================================== */",
  "",
  "export const TEMINAT_OLCUMU = " + JSON.stringify(j.olculdu) + ";",
  "",
  "/* The sizes the measurement asked about, smallest first. */",
  "export const OLCULEN_TUTARLAR = [" +
    [...new Set(j.zincirler.flatMap((z) => z.adaylar.flatMap((a) =>
      Object.keys(a.boyutlar || {}))))]
      .sort((a, b) => (BigInt(a) > BigInt(b) ? 1 : -1))
      .map((t) => "\"" + t + "\"").join(", ") + "];",
  "",
  "/* How many of the measured assets clear each size. Stated so the page can",
  "   say what it found instead of a bare yes. */",
  "export const DAGILIM = [",
  dagilim.map((d) => "  { tutar: \"" + d.tutar + "\", adet: " + d.adet + " }").join(",\n"),
  "];",
  "",
  "export const ONERILEN = [",
  satirlar.join(",\n"),
  "];",
  "",
  "/* Which chains the measurement covered, with what a conversion needs to",
  "   reach them: the CCTP domain, the chain's own USDC, the canonical",
  "   Uniswap v3 factory and the quoter that answered there. The page reads",
  "   all of it directly — the same derivation the contract does, so what the",
  "   page shows and what the chain would accept cannot drift. */",
  "export const ZINCIRLER = {",
  j.zincirler.map((z) => [
    "  " + z.zincir + ": {",
    "    ad: " + JSON.stringify(z.ad) + ", id: " + (({
      ethereum: 1, base: 8453, arbitrum: 42161, optimism: 10,
      polygon: 137, avalanche: 43114, unichain: 130
    })[z.zincir]) + ", domain: " + z.domain + ",",
    "    rpc: " + JSON.stringify((({
      ethereum: "https://ethereum-rpc.publicnode.com",
      base: "https://base-rpc.publicnode.com",
      arbitrum: "https://arbitrum-one-rpc.publicnode.com",
      optimism: "https://optimism-rpc.publicnode.com",
      polygon: "https://polygon-bor-rpc.publicnode.com",
      avalanche: "https://avalanche-c-chain-rpc.publicnode.com",
      unichain: "https://unichain-rpc.publicnode.com"
    })[z.zincir])) + ",",
    "    usdc: \"" + z.usdc + "\",",
    "    v3Fabrika: \"" + z.v3Fabrika + "\",",
    "    quoter: " + (z.quoter ? "\"" + z.quoter + "\"" : "null") +
      (z.quoter ? "" : "   /* none answered here — depth reads as unmeasured */"),
    "  }"
  ].join("\n")).join(",\n"),
  "};",
  "",
  "/* Uniswap v3's canonical fee tiers. A pool cannot exist outside these, so",
  "   scanning all four is exhaustive rather than a heuristic. */",
  "export const KADEMELER = [100, 500, 3000, 10000];",
  ""
].join("\n");

fs.writeFileSync(HEDEF, cikti);

console.log("TEMINAT LISTESI URETILDI");
console.log("  kaynak   " + path.relative(KOK, KAYNAK) + "   (olculdu " + j.olculdu + ")");
console.log("  hedef    " + path.relative(KOK, HEDEF));
console.log("  donusturulebilen " + hepsi.length + " varlik");
console.log("  onerilen " + elli.length);
console.log("  listede olmayan (CA ile secilebilir): " + kalan.length);
console.log("");
for (const d of dagilim) {
  console.log("  " + U(d.tutar).padStart(8) + " kadar: " + String(d.adet).padStart(3) + " varlik");
}
console.log("");
console.log("  ilk on: " + elli.slice(0, 10).map((v) =>
  v.simge + "(" + U(v.azamiTutar) + ")").join(" "));
