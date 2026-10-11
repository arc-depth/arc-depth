"use strict";
/* ===========================================================================
 * olc-mezuniyet.js — what happens when the curve fills up
 *
 * WHY IT NEEDED ITS OWN SUITE
 *   Graduation is the one path nothing had ever run. Reading it, I expected
 *   it to be dead code: mezunEt() calls havuzAcici.ac(), the opener only
 *   accepts the launchpad as caller, and the pool is already open from the
 *   launch. All three readings were wrong — EgriLaunch's `havuzAcici` IS
 *   the launchpad, and the launchpad's ac() forwards to the real opener and
 *   calls biriktir(), deepening the pool the launch already made. Running
 *   it was the only way to find that out, and running it also found what
 *   reading had not:
 *
 *   mezunEt sends `toplanan + vergi` onward. `vergi` is the anti-snipe tax,
 *   bounded by nothing the token side can pair with. The opener adds
 *   two-sided liquidity and has no withdraw, and biriktir() returns
 *   immediately when either side is zero — so quote with no tokens beside
 *   it was unreachable forever. Measured: $698,671.30 of it.
 *
 *   The launchpad now asks the opener what the tokens can pair with, sends
 *   exactly that, and routes the surplus to the collateral vault. This
 *   suite is what keeps that true.
 *
 * WHY THE GROSS BUY IS SO LARGE
 *   SNIPE_PPM is 990_000 and the harness necessarily buys in the launch
 *   block, so 99% of the input becomes tax before the curve sees it. About
 *   $620,000 gross is needed to collect the $6,000 threshold. That is not a
 *   realistic trade — it is the worst case, which is the one worth pinning.
 *
 *   node scripts/olc-mezuniyet.js
 * =========================================================================== */
const { Interface, AbiCoder, getCreateAddress } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDC = "0x3600000000000000000000000000000000000000";
const HARNESS = "0x00000000000000000000000000000000000000E8";
const CAGIRAN = "0x2222222222222222222222222222222222222222";
const HOOK = "0x0000000000000000000000000000000000000A44";
const GELISTIRICI = "0x00000000000000000000000000000000000000D1";
const LIKIDITE    = "0x00000000000000000000000000000000000000D2";
const ISLETME     = "0x00000000000000000000000000000000000000D3";
const CIRBTC      = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
/* Chainlink PROXY, not the aggregator a log scan finds. */
const BTC_FEED    = "0xa109B535C70C8Be9995be64Bb6751AcDB27e03De";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const { kisaIsim: hataAdi } = require("./revert-coz");

async function rpc(m, p) {
  let b = 2000;
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
      return j.result;
    } catch (e) {
      if (k >= 6 || !/rate|limit|429|timeout|ECONN|fetch/i.test(String(e.message))) throw e;
      await bekle(b); b = Math.min(b * 2, 20000);
    }
  }
}

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TOK = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 0 });
const HAK = (v) => "$" + (Number(v) / 1e36).toExponential(4);
const V = (v) => BigInt(v.toString());

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("MEZUNIYET — egri dolunca, gercek Arc havuzunda");
  console.log("");

    /* nonce 6, not 3: the launch vault became cross-chain capable and the
     harness now deploys a registry and two factories before the launchpad.
     Off by one here reverts as WrappedError(hook, beforeAddLiquidity,
     <empty>) — v4 calling a hook whose launchpad address holds no code.
     The assertion that follows is what catches it. */
  const LP_TAHMIN = getCreateAddress({ from: HARNESS, nonce: 6 });
  const hookKod = await rpc("eth_call", [{
    data: B("EgriHook").bytecode + coder.encode(
      ["address", "address", "address", "address", "address", "address"],
      [PM, LP_TAHMIN, USDC, GELISTIRICI, LIKIDITE, ISLETME]).slice(2)
  }, "latest"]);

  const T = B("TestGeriAlimCanli");
  const iface = new Interface(T.abi);

  async function dene(brut) {
    await bekle(900);
    const r = await rpc("eth_call", [
      { from: CAGIRAN, to: HARNESS, gas: "0x10000000",
        data: iface.encodeFunctionData("mezuniyetTesti",
          [PM, USDC, HOOK, GELISTIRICI, LIKIDITE, ISLETME, CIRBTC, BTC_FEED, brut]) },
      "latest",
      { [HARNESS]: { code: T.deployedBytecode, balance: "0x" + (10n ** 27n).toString(16) },
        [HOOK]: { code: hookKod } }
    ]);
    return iface.decodeFunctionResult("mezuniyetTesti", r)[0];
  }

  /* ---- 1. below the threshold nothing happens ---------------------- */
  console.log("1) ESIGIN ALTINDA — mezuniyet olmamali");
  {
    const m = await dene(20_000_000_000n);      // $20.000 gross, ~$194 collected
    console.log("     toplanan " + U(m.toplanan) + " / esik " + U(m.esik));
    ok(V(m.esik) === 6_000_000_000n, "esik $6.000", U(m.esik));
    ok(m.esikGecildi === false, "esik gecilmedi");
    ok(m.mezunOldu === false, "mezun OLMADI", hataAdi(m.sebep));
    ok(hataAdi(m.sebep) === "HenuzDegil", "red sebebi HenuzDegil", hataAdi(m.sebep));
  }

  /* ---- 2. past it, the SAME pool deepens -------------------------- */
  console.log("");
  console.log("2) ESIK GECILINCE — ikinci havuz acilmaz, AYNI havuz derinlesir");
  let m;
  {
    m = await dene(700_000_000_000n);
    console.log("     toplanan " + U(m.toplanan) + "   snipe vergisi " + U(m.egriVergi));
    ok(m.esikGecildi === true, "esik gecildi", U(m.toplanan));
    /* No reason to print when nothing reverted — a PASS line carrying a
       revert message reads as a contradiction. */
    ok(m.mezunOldu === true, "MEZUN OLDU", m.revertEtti ? hataAdi(m.sebep) : "");

    const kat = Number(V(m.likiditeSonra) * 100n / V(m.likiditeOnce)) / 100;
    console.log("     likidite " + m.likiditeOnce + " -> " + m.likiditeSonra + "   " + kat.toFixed(2) + "x");
    ok(V(m.likiditeSonra) > V(m.likiditeOnce), "LAUNCH HAVUZUNUN LIKIDITESI ARTTI", kat.toFixed(2) + "x");
    /* The opener can only ever hold one pool, and `acildi` was already true
       before graduation — so a deepened pool is the only thing graduation
       can mean here. Asserting it is what rules out "a second pool opened
       somewhere and nobody noticed". */
    ok(m.havuzZatenAcik === true, "havuz launch'ta ACILMIS durumdaydi",
      "yani mezuniyet yeni havuz acmadi, var olani besledi");
    ok(m.aciciYetkilisi.toLowerCase() === m.launchpad.toLowerCase(),
      "acicinin ac() yetkisi launchpad'de", m.aciciYetkilisi);
  }

  /* ---- 3. the surplus, which used to be unreachable --------------- */
  console.log("");
  console.log("3) FAZLA — eskiden acicida sonsuza kadar sikisiyordu");
  {
    const havuza = V(m.havuzdaUsdcSonra) - V(m.havuzdaUsdcOnce);
    const kasaya = V(m.kasaUsdcSonra) - V(m.kasaUsdcOnce);
    console.log("     havuza giren   " + U(havuza));
    console.log("     KASAYA giren   " + U(kasaya));
    console.log("     acicida kalan  " + U(m.aciciUsdcSonra) + "   (duzeltmeden once: $698.671,30)");
    console.log("     launchpadda    " + U(m.launchpadUsdcSonra));
    console.log("     kasa " + U(m.kasaUsdcOnce) + " -> " + U(m.kasaUsdcSonra));
    console.log("     hak  " + HAK(m.hakOnceM) + " -> " + HAK(m.hakSonraM));

    ok(V(m.aciciUsdcSonra) === 0n, "ACICIDA HIC USDC KALMADI", U(m.aciciUsdcSonra));
    ok(V(m.launchpadUsdcSonra) === 0n, "launchpad USDC tutmuyor", U(m.launchpadUsdcSonra));
    ok(kasaya > 0n, "FAZLA TEMINAT KASASINA ULASTI", U(kasaya));
    ok(V(m.hakSonraM) > V(m.hakOnceM), "hak/token yukari cikti",
      (Number(V(m.hakSonraM) * 100n / V(m.hakOnceM)) / 100).toFixed(0) + "x");

    /* Conservation. Everything the curve held — what it collected plus what
       it taxed — has to be in exactly one of four places afterwards. A
       penny that closes nowhere is a penny somebody can be surprised by. */
    const girdi = V(m.toplanan) + V(m.egriVergi);
    const cikti = havuza + V(m.aciciUsdcSonra) + kasaya + V(m.launchpadUsdcSonra);
    console.log("");
    console.log("     muhasebe: toplanan+vergi " + U(girdi) + "  =  havuz+acici+kasa+launchpad " + U(cikti));
    ok(girdi === cikti, "MUHASEBE KURUSA KADAR KAPANIYOR",
      girdi === cikti ? "fark $0,00" : "fark " + U(girdi > cikti ? girdi - cikti : cikti - girdi));

    /* And the pool is not worse off for the cap: it received what the
       tokens could pair, which is all it could ever have used. */
    ok(havuza > 0n, "havuz gercekten USDC aldi — tavan havuzu ac birakmiyor", U(havuza));
  }

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) console.error("  sebep: " + hataAdi(e.data));
  process.exit(1);
});
