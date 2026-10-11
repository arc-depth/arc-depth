"use strict";
/* Does a curve launch actually happen against the real Arc PoolManager?
 *
 * Compiling and simulating said yes twice and both were wrong: the first
 * architecture used ArcLaunchHook, whose beforeAddLiquidity refuses any
 * caller but one fixed address, and the ladder is a new contract per
 * launch. Every launch would have reverted. Only v4 can answer this.
 *
 * The hook cannot be `new`ed, because v4 reads a hook's permissions out of
 * the low bits of its address. So its runtime code is built here with its
 * immutables already baked (an eth_call to no address runs a constructor
 * and returns exactly that), then injected at an address carrying the
 * right bits. The launchpad is the harness's third deployment, so its
 * address is predictable before it exists.
 */
const { Interface, AbiCoder, getCreateAddress } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";   // Arc PoolManager
const USDC = "0x3600000000000000000000000000000000000000"; // Arc USDC, 6 dec
const HARNESS = "0x00000000000000000000000000000000000000E8";
const CAGIRAN = "0x2222222222222222222222222222222222222222";

/* beforeAddLiquidity 1<<11, beforeRemoveLiquidity 1<<9, afterSwap 1<<6,
   afterSwapReturnDelta 1<<2  =  0xA44. The live ArcLaunchHook ends in the
   same three digits, which is the cross-check that the set is right. */
const HOOK = "0x0000000000000000000000000000000000000A44";
const BEKLENEN_BITLER = 0xa44;

const GELISTIRICI = "0x00000000000000000000000000000000000000D1";
const LIKIDITE    = "0x00000000000000000000000000000000000000D2";
const ISLETME     = "0x00000000000000000000000000000000000000D3";
/* USDC/USD on Arc, found by scanning AnswerUpdated logs rather than
   read from documentation that disagreed with itself. */
const CIRBTC      = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
const BTC_FEED    = "0xa109B535C70C8Be9995be64Bb6751AcDB27e03De";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();

async function rpc(method, params) {
  let bekleme = 1200;
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(RPC, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
      });
      const j = await r.json();
      if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
      return j.result;
    } catch (e) {
      if (i >= 5 || !/rate|limit|429|timeout|ECONN/i.test(String(e.message))) throw e;
      await new Promise((z) => setTimeout(z, bekleme)); bekleme = Math.min(bekleme * 2, 15000);
    }
  }
}

const n = (v, d) => (Number(v) / 10 ** d).toLocaleString("en", { maximumFractionDigits: d === 18 ? 0 : 2 });

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => {
    if (!iyi) kotu++;
    console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
  };

  console.log("EGRI LAUNCH — GERCEK Arc PoolManager");
  console.log("");

  ok((parseInt(HOOK.slice(-4), 16) & 0x3fff) === BEKLENEN_BITLER,
     "hook adresi dogru izin bitlerini tasiyor",
     "0x" + (parseInt(HOOK.slice(-4), 16) & 0x3fff).toString(16));

  /* The launchpad's nonce, counted by hand because the hook's launchpad
     address is baked into its bytecode before either exists.

     An account whose code arrives through a state override was never
     created, so its nonce starts at 0 and its first CREATE uses 0 — not
     1 as a normally deployed contract would.

     The harness deploys, in order:

       0  EgriFabrika
       1  AciciFabrika
       2  ChainlinkOracle
       3  CrossChainAssetRegistry   <- added when the vault became
       4  YoneticiFabrika              cross-chain
       5  KasaFabrika
       6  EgriLaunchpad

     Off by one here produces WrappedError(hook, beforeAddLiquidity,
     <empty>): v4 calling a hook whose launchpad address holds no code,
     so havuzKaydi returns nothing and the decode reverts with no reason
     to show. That exact signature has now been paid for three times —
     once in test/calistir.js, once here, and once more when the three
     deployments above were inserted and this number was left at 3.

     The assertion below is what caught it each time, which is why it
     exists at all: a predicted address nobody verifies is a guess. */
  const LP_TAHMIN = getCreateAddress({ from: HARNESS, nonce: 6 });

  const HK = B("EgriHook");
  const hookKod = await rpc("eth_call", [{
    data: HK.bytecode + coder.encode(
      ["address", "address", "address", "address", "address", "address"],
      [PM, LP_TAHMIN, USDC, GELISTIRICI, LIKIDITE, ISLETME]).slice(2)
  }, "latest"]);
  ok(!!hookKod && hookKod !== "0x", "hook kodu kuruldu (immutable'lar dolu)",
     ((hookKod.length - 2) / 2) + " bayt");

  const T = B("TestEgriLaunchpad");
  const iface = new Interface(T.abi);

  let s;
  try {
    const r = await rpc("eth_call", [
      { from: CAGIRAN, to: HARNESS, gas: "0x10000000",
        data: iface.encodeFunctionData("run", [PM, USDC, HOOK, GELISTIRICI, LIKIDITE, ISLETME, CIRBTC, BTC_FEED]) },
      "latest",
      { [HARNESS]: { code: T.deployedBytecode, balance: "0x" + (1000n * 10n ** 18n).toString(16) },
        [HOOK]: { code: hookKod } }
    ]);
    [s] = iface.decodeFunctionResult("run", r);
  } catch (e) {
    console.log("");
    console.log("  LAUNCH REVERT ETTI: " + e.message);
    if (e.data) console.log("  data: " + String(e.data).slice(0, 200));
    process.exit(1);
  }

  console.log("");
  ok(s.launchpad.toLowerCase() === LP_TAHMIN.toLowerCase(),
     "launchpad adresi tahmin edildigi yerde", LP_TAHMIN);
  ok(s.merdivenAcildi === true, "MERDIVEN ACILDI — v4 likiditeyi kabul etti",
     "eski hook'ta burasi OnlyLaunchpad ile revert ediyordu");
  ok(BigInt(s.merdivenLikidite) > 0n, "merdivende likidite var", String(s.merdivenLikidite));
  /* Conservation first, then the remainder — in that order, because the
     order is what makes the claim honest.

     The first version of this asserted the ladder still HELD half the
     supply, which describes a ladder that placed nothing, and called a
     working launch broken. The second asserted it held exactly zero,
     which is also wrong: liquidity is an integer, so the placement cannot
     always consume the amount exactly and a remainder stays behind.
     Measured, that remainder is 223,090,978 wei — 2.2e-10 of one token.

     So what is actually true is that nothing was lost: ladder plus pool
     is exactly half the supply, and what the ladder kept is dust. Both
     are asserted, and the dust is bounded rather than ignored, because an
     unbounded 'close enough' would hide a real leak behind a tolerance. */
  /* The identity, not a remembered figure. */
  const ARZ = 1_000_000_000n * 10n ** 18n;
  const ACILIS_MCAP = 3_500n * 10n ** 6n;
  const LIKIDITE_USDC = 78n * 10n ** 6n;   // the real liquidity, not the sink address
  const HAVUZ_TOKEN = (LIKIDITE_USDC * ARZ) / ACILIS_MCAP;
  const EGRI_TOKEN = ARZ - HAVUZ_TOKEN;

  const toz = BigInt(s.merdivendekiToken);
  ok(toz + BigInt(s.havuzdakiToken) === HAVUZ_TOKEN,
     "HIC TOKEN KAYBOLMADI — acici + havuz = eslesen miktar",
     String(toz + BigInt(s.havuzdakiToken)) + " = 78 USDC / 0,0000035");
  ok(toz < 10n ** 18n,
     "acicida kalan yalnizca toz (1 tokenden az)",
     toz + " wei = " + (Number(toz) / 1e18).toExponential(2) + " token");
  ok(BigInt(s.havuzdakiToken) > HAVUZ_TOKEN - 10n ** 18n,
     "HAVUZA 22.285.714 token KONDU, 78 USDC ile IKI TARAFLI",
     n(s.havuzdakiToken, 18) + " token");
  ok(BigInt(s.egridekiToken) === EGRI_TOKEN,
     "egride kalan arz", n(s.egridekiToken, 18) + " token");
  ok(BigInt(s.havuzdakiToken) + toz + BigInt(s.egridekiToken) === ARZ,
     "HAVUZ + ACICI + EGRI = TAM ARZ", "hicbir token kaybolmadi");
  ok(BigInt(s.kurucununTokeni) === 0n, "KURUCUYA BEDAVA TOKEN VERILMEDI",
     n(s.kurucununTokeni, 18) + " token");
  ok(BigInt(s.launchpadinTokeni) === 0n, "launchpad hic token tutmuyor",
     n(s.launchpadinTokeni, 18) + " token");
  ok(BigInt(s.egriFantom) === ACILIS_MCAP - LIKIDITE_USDC,
     "FANTOM = acilis mcap EKSI gercek likidite",
     "$" + n(s.egriFantom, 6) + " = 3.500 - 78");
  /* Both venues must price the same or the launch is born arbitrageable. */
  const egriFiyat = Number(BigInt(s.egriFantom)) / 1e6 / (Number(BigInt(s.egriSanalToken)) / 1e18);
  const havuzFiyat = Number(ACILIS_MCAP) / 1e6 / (Number(ARZ) / 1e18);
  ok(Math.abs(egriFiyat - havuzFiyat) / havuzFiyat < 1e-12,
     "EGRI ile HAVUZ ayni fiyattan aciliyor",
     egriFiyat.toExponential(6) + " = " + havuzFiyat.toExponential(6));
  ok(BigInt(s.egriSanalToken) === BigInt(s.egridekiToken),
     "SANAL_TOKEN egrinin gercekten tuttugu kadar",
     "fiyat tutmadigi tokeni tarif etmiyor");
  ok(BigInt(s.egriEsik) === 6000n * 10n ** 6n, "esik $6.000", "$" + n(s.egriEsik, 6));

  console.log("");
  console.log("  ODEMENIN UC PARCASI");
  const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  ok(BigInt(s.gelistiriciAldi) === 600_000n, "gelistirici fonu $0,60 aldi", U(s.gelistiriciAldi));
  ok(BigInt(s.likiditeAldi) === 1_000_000n, "protokol likiditesi $1,00 aldi", U(s.likiditeAldi));
  ok(BigInt(s.isletmeAldi) === 400_000n, "isletme $0,40 aldi", U(s.isletmeAldi));
  ok(BigInt(s.gelistiriciAldi) + BigInt(s.likiditeAldi) + BigInt(s.isletmeAldi) === 2_000_000n,
     "protokol ucreti TAM $2,00", "odemenin %2'si");
  ok(BigInt(s.kasadakiUsdc) === 20_000_000n, "TOKENIN KASASINDA $20,00 USDC var",
     U(s.kasadakiUsdc) + " — launch bittiginde orada");
  ok(BigInt(s.havuzdakiUsdc) >= 77_000_000n,
     "HAVUZDA GERCEK ALIS TARAFI var", U(s.havuzdakiUsdc) + " (beklenen ~$78)");
  ok(BigInt(s.launchpadinUsdcKalani) === 0n, "launchpad USDC TUTMUYOR",
     U(s.launchpadinUsdcKalani));
  const toplam = BigInt(s.gelistiriciAldi) + BigInt(s.likiditeAldi) + BigInt(s.isletmeAldi) +
                 BigInt(s.kasadakiUsdc) + BigInt(s.havuzdakiUsdc) + BigInt(s.launchpadinUsdcKalani);
  ok(toplam === 100_000_000n, "MUHASEBE TAM KAPANIYOR", U(toplam) + " / $100,00");
  ok(s.kasa !== "0x0000000000000000000000000000000000000000", "kasa dagitildi", s.kasa);

  console.log("");
  console.log("  token     " + s.token);
  console.log("  egri      " + s.egri);
  console.log("  merdiven  " + s.acici);
  console.log("  oduller   " + s.rewards);
  console.log("  kasa      " + s.kasa);
  console.log("  havuz id  " + s.havuzId);
  console.log("  acilis sqrtP " + s.acilisSqrtP);

  console.log("");
  console.log(kotu === 0 ? "  GECTI — launch gercekten oluyor, merdiven gercekten aciliyor."
                         : "  BASARISIZ — " + kotu + " sorun.");
  process.exit(kotu === 0 ? 0 : 1);
})();
