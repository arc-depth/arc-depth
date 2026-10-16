"use strict";
/* ===========================================================================
 * dogrula.js — every public claim, checked against the chain
 *
 *   node scripts/dogrula.js            run every claim, exit 1 if one fails
 *
 * Step 3 of the truth ledger. Each claim is a sentence we say in public (site,
 * thread) next to the call that proves or breaks it. READ ONLY.
 *
 *   GECTI   the chain agrees with the sentence
 *   KALDI   the chain disagrees: the sentence or the system must change
 *   UYARI   true, but needs a person (a state we chose to keep for now)
 *
 * Reads hakikat.json (scripts/hakikat.js) for who owns what, and
 * docs/js/aglar.js for what the site points at; reads the chain itself for
 * every number.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const RPC = Object.fromEntries(Object.entries(EVM).map(([k, z]) => [k, z.rpc]));
RPC.base = "https://base-rpc.publicnode.com";
RPC.arbitrum = "https://arbitrum-one-rpc.publicnode.com";
RPC.bsc = "https://bsc-rpc.publicnode.com";
const SIFIR = "0x" + "0".repeat(40);
const OLU = new Set([SIFIR, "0x000000000000000000000000000000000000dead"]);
const { id: secici } = require("ethers");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function cagir(zincir, to, imza) {
  const data = "0x" + secici(imza).slice(2, 10);
  for (let d = 0; ; d++) {
    try {
      const r = await fetch(RPC[zincir], { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) });
      const j = await r.json();
      if (j.result !== undefined) return j.result;
      if (/revert|execution/i.test(String(j.error && j.error.message))) return null;
      throw new Error(JSON.stringify(j.error));
    } catch (e) {
      if (d >= 5) throw new Error(zincir + " " + imza + ": " + e.message);
      await bekle(1500 * (d + 1));
    }
  }
}
const sayi = (h) => (h && h !== "0x" ? BigInt(h) : null);

function aglar() {
  const m = fs.readFileSync(path.join(KOK, "docs", "js", "aglar.js"), "utf8");
  return JSON.parse(m.slice(m.indexOf("["), m.lastIndexOf("]") + 1));
}

/* What we say, where we say it. */
const CANLI = ["arc", "robinhood", "base", "arbitrum", "bsc", "avalanche", "monad"];
const SAHIPLI_BILINEN = new Map([
  ["0x6e591afaf47a0ff6ab26a4f5c077de7715c34bf0", "Arc FTHMOFTAdapter"],
  ["0x971326596420b07bac4e48d08ffa238bb6268465", "Arc FiyatElcisi"],
  ["0x19c9c61dc70cd52ab98a562e62df369ec300855a", "Robinhood FTHMOFT (two-chain)"],
  ["0x8cb46b8a501ec646b72a2dfde97aef02371580c4", "Robinhood FTHMFarkHook"],
]);

(async () => {
  const A = aglar();
  const H = JSON.parse(fs.readFileSync(path.join(KOK, "hakikat.json"), "utf8"));
  const sonuc = [];
  const yaz = (durum, iddia, kanit) => { sonuc.push({ durum, iddia, kanit }); };

  /* 1. Launchpad live on 7 chains */
  const n3 = A.filter((z) => z.nesil === 3).map((z) => z.anahtar);
  yaz(JSON.stringify(n3.slice().sort()) === JSON.stringify(CANLI.slice().sort()) ? "GECTI" : "KALDI",
    "The launchpad is live on 7 chains: Arc, Robinhood, Base, Arbitrum, BNB, Avalanche, Monad",
    "aglar.js nesil 3: " + n3.join(", "));

  /* 2. Ethereum and HyperEVM carry twins and FTHM only */
  /* The create page offers every chain in aglar.js except those in its
     LAUNCH_YOK table; a chain we say has no launchpad must be in it. */
  const olustur = fs.readFileSync(path.join(KOK, "docs", "js", "gorunum", "olustur.js"), "utf8");
  const yokSatir = (olustur.match(/const LAUNCH_YOK = \{([^\n]*)\};/) || [])[1] || "";
  const engelli = new Set([...yokSatir.matchAll(/(\w+):\s*"/g)].map((m) => m[1]));
  for (const z of A.filter((x) => x.nesil !== 3 && x.launchpad)) {
    const kod = H.zincirler[z.anahtar] && H.zincirler[z.anahtar].kontratlar[z.launchpad.toLowerCase()];
    yaz(engelli.has(z.anahtar) ? "GECTI" : "KALDI", "Ethereum and HyperEVM carry token twins and FTHM only (no launchpad)",
      z.ad + ": launchpad nesil " + z.nesil + " " + z.launchpad + (kod ? " has code" : " no code") +
      (engelli.has(z.anahtar) ? "; the create page blocks it (LAUNCH_YOK)" : "; the create page OFFERS it"));
  }

  /* 3. Fixed numbers, read from every live launchpad */
  for (const k of CANLI) {
    const z = A.find((x) => x.anahtar === k);
    const lp = z.launchpad;
    const oku = async (f) => sayi(await cagir(k, lp, f + "()"));
    const v = {
      SUPPLY: await oku("SUPPLY"), ACILIS_MCAP: await oku("ACILIS_MCAP"), UCRET_PPM: await oku("UCRET_PPM"),
      DERINLIK_PPM: await oku("DERINLIK_PPM"), LIKIDITE_PPM: await oku("LIKIDITE_PPM"),
      KURUCU_PPM: await oku("KURUCU_PPM"), GELISTIRICI_PPM: await oku("GELISTIRICI_PPM"), ISLETME_PPM: await oku("ISLETME_PPM"),
      launchCount: await oku("launchCount"),
    };
    const ok = (a, b) => a === b;
    yaz(ok(v.SUPPLY, 10n ** 27n) && ok(v.ACILIS_MCAP, 3500n * 10n ** 6n) ? "GECTI" : "KALDI",
      "1B fixed supply, every launch opens at $3,500 market cap", z.ad + " " + lp + ": SUPPLY " + v.SUPPLY + ", ACILIS_MCAP " + v.ACILIS_MCAP);
    yaz(ok(v.UCRET_PPM, 20000n) && ok(v.DERINLIK_PPM, 7000n) && ok(v.LIKIDITE_PPM, 5000n) && ok(v.KURUCU_PPM, 3000n) &&
      ok(v.GELISTIRICI_PPM, 3000n) && ok(v.ISLETME_PPM, 2000n) ? "GECTI" : "KALDI",
      "2% fee: 0.70 depth / 0.50 protocol liquidity / 0.30 founder / 0.30 dev fund / 0.20 ops",
      z.ad + ": " + [v.UCRET_PPM, v.DERINLIK_PPM, v.LIKIDITE_PPM, v.KURUCU_PPM, v.GELISTIRICI_PPM, v.ISLETME_PPM].join("/") + " ppm");
    yaz(v.launchCount === 0n ? "GECTI" : "KALDI", "0 launches so far", z.ad + ": launchCount " + v.launchCount);
  }

  /* 4. No admin key on any launchpad contract */
  for (const k of CANLI) {
    const z = A.find((x) => x.anahtar === k);
    for (const alan of ["launchpad", "takasRouter", "ikizHavuzFabrika", "ikizHook"]) {
      if (!z[alan]) continue;
      const sahip = sayi(await cagir(k, z[alan], "owner()"));
      const a = sahip == null ? null : "0x" + sahip.toString(16).padStart(40, "0");
      yaz(a == null || OLU.has(a) ? "GECTI" : "KALDI", "No admin key on any launchpad contract",
        z.ad + " " + alan + " " + z[alan] + ": owner() " + (a == null ? "none" : a));
    }
  }

  /* 5. Owned contracts: exactly the four the correction names, all burn-scheduled */
  const sahipli = [];
  for (const [k, c] of Object.entries(H.zincirler))
    for (const [a, x] of Object.entries(c.kontratlar))
      if (!x.dis && x.sahip && x.sahip.owner && !OLU.has(x.sahip.owner)) sahipli.push(a);
  const beklenmeyen = sahipli.filter((a) => !SAHIPLI_BILINEN.has(a));
  yaz(beklenmeyen.length ? "KALDI" : "UYARI",
    "Owned contracts are only the four FTHM-side ones, burned after the test week",
    beklenmeyen.length ? "unexpected owner on " + beklenmeyen.join(", ")
      : sahipli.length + " owned: " + sahipli.map((a) => SAHIPLI_BILINEN.get(a)).join(", ") + " — burn pending (~23 Oct)");

  /* 6. FTHM: 1B, fixed */
  const fthm = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8")).token;
  const arz = sayi(await cagir("arc", fthm, "totalSupply()"));
  yaz(arz === 10n ** 27n ? "GECTI" : "KALDI", "FTHM total supply is 1,000,000,000 and never changes", "Arc FTHM " + fthm + ": totalSupply " + arz);

  /* 7. The registry's own facts */
  yaz(EVM.bsc.cctp == null ? "GECTI" : "KALDI", "BNB has no USDC CCTP (Circle, 16 Oct 2026)",
    "scripts/zincirler.js bsc.cctp = " + EVM.bsc.cctp);

  /* report */
  const say = (d) => sonuc.filter((x) => x.durum === d).length;
  for (const x of sonuc) console.log(x.durum.padEnd(6) + " " + x.iddia + "\n         " + x.kanit);
  console.log("\nGECTI " + say("GECTI") + "  KALDI " + say("KALDI") + "  UYARI " + say("UYARI"));
  fs.writeFileSync(path.join(KOK, "dogrulama", "iddialar.json"),
    JSON.stringify({ zaman: new Date().toISOString(), sonuc }, null, 1) + "\n");
  process.exit(say("KALDI") ? 1 : 0);
})().catch((e) => { console.error("HATA: " + e.message); process.exit(2); });
