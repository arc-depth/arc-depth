"use strict";
/* Where does the fee actually land?
 *
 * The fee table is published in EgriLaunchpad, charged in EgriLaunch and
 * EgriHook, and pinned between them by egri-ucret-denetimi.js. All of that
 * proves the NUMBERS agree. None of it proves the money moves — a slice
 * can be computed correctly and transferred to the wrong address, or not
 * transferred at all, and every static check would still pass.
 *
 * So this buys on a real curve, against the real Arc chain, and reads the
 * five destination balances before and after. It was written after a
 * revenue gap went unnoticed through several rounds of "everything passes":
 * the ladder's fee went entirely to the floor and the protocol earned
 * nothing, which no test was looking for because no test followed the money.
 *
 * THE SNIPE TAX IS NOT WORKED AROUND
 *   block.timestamp cannot be moved inside an eth_call, so the buy always
 *   lands in the curve's opening second and pays the full 99%. That is
 *   reported rather than avoided, and the deposit is sized so the 2% taken
 *   from what survives is still large enough to divide six ways exactly.
 *   Avoiding it would have meant passing snipeSuresi = 0, which the
 *   launchpad refuses — correctly, because in production that would turn
 *   the anti-snipe off.
 *
 * No transaction is sent. eth_call with a state override only.
 */
const { Interface, AbiCoder, getCreateAddress } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDC = "0x3600000000000000000000000000000000000000";
const HARNESS = "0x00000000000000000000000000000000000000E8";
/* beforeAddLiquidity | beforeRemoveLiquidity | afterSwap |
   afterSwapReturnDelta = 0xA44, the same three digits the live hook's
   address ends in. */
const HOOK = "0x0000000000000000000000000000000000000A44";
const GELISTIRICI = "0x00000000000000000000000000000000000000D1";
const LIKIDITE = "0x00000000000000000000000000000000000000D2";
const ISLETME     = "0x00000000000000000000000000000000000000D3";
/* USDC/USD on Arc, found by scanning AnswerUpdated logs rather than
   read from documentation that disagreed with itself. */
const CIRBTC      = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
const BTC_FEED    = "0xa109B535C70C8Be9995be64Bb6751AcDB27e03De";

const B = (x) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", x + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

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
      if (k >= 7 || !/rate|limit|429|timeout|ECONN|fetch/i.test(String(e.message))) throw e;
      await bekle(b); b = Math.min(b * 2, 20000);
    }
  }
}

const usd = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

async function kosul() {
  /* The launchpad is the harness's third deployment but its nonce is 2: an
     account whose code arrives through a state override was never created,
     so its nonce is still 0 and its first CREATE uses 0. */
    /* nonce 6, not 3: the launch vault became cross-chain capable and the
     harness now deploys a registry and two factories before the launchpad.
     Off by one here reverts as WrappedError(hook, beforeAddLiquidity,
     <empty>) — v4 calling a hook whose launchpad address holds no code.
     The assertion that follows is what catches it. */
  const LP = getCreateAddress({ from: HARNESS, nonce: 6 });
  const hookKod = await rpc("eth_call", [{
    data: B("EgriHook").bytecode + coder.encode(
      ["address", "address", "address", "address", "address", "address"],
      [PM, LP, USDC, GELISTIRICI, LIKIDITE, ISLETME]).slice(2)
  }, "latest"]);
  await bekle(1200);

  const T = B("TestEgriLaunchpad");
  const iface = new Interface(T.abi);
  const ALIM = 100_000n * 10n ** 6n;
  /* On Arc the quote asset IS the gas token, so its ERC20 balance is the
     native balance — which a state override can set. Measured, not assumed:
     1000 ether of override reads back as 1,000.00 USDC at six decimals. */
  /* The harness now pays for the launch too: 100,000 for the buy plus 100
     for the launch. Funded at exactly the buy amount it came up 100 short
     and reverted with "transfer amount exceeds balance". */
  const NATIVE = "0x" + (200_000n * 10n ** 18n).toString(16);

  const r = await rpc("eth_call", [
    { from: "0x2222222222222222222222222222222222222222", to: HARNESS, gas: "0x8000000",
      data: iface.encodeFunctionData("ucretTesti", [PM, USDC, HOOK, GELISTIRICI, LIKIDITE, ISLETME, ALIM, CIRBTC, BTC_FEED]) },
    "latest",
    { [HARNESS]: { code: T.deployedBytecode, balance: NATIVE }, [HOOK]: { code: hookKod } }
  ]);
  const [u] = iface.decodeFunctionResult("ucretTesti", r);
  return { u, ALIM };
}

if (require.main === module) {
  (async () => {
    let kotu = 0;
    const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

    const { u, ALIM } = await kosul();
    const V = (x) => BigInt(x);
    const kesilen = (ALIM * V(u.snipeOrani)) / 1_000_000n;
    const net = ALIM - kesilen;
    /* The charge is the protocol's 2% PLUS this launch's 3% tax. Sizing
       it at 2% alone would understate it and every slice below would
       look wrong by the ratio. */
    const ucret = (net * 20_000n) / 1_000_000n;
    const vergi = (net * 30_000n) / 1_000_000n;
    const bek = (ppm) => (net * ppm) / 1_000_000n;

    console.log("UCRET TESTI — GERCEK Arc, egri uzerinden alim");
    console.log("");
    console.log("  yatirilan            " + usd(ALIM));
    console.log("  snipe vergisi        %" + (Number(V(u.snipeOrani)) / 10000).toFixed(2) + "  -> " + usd(kesilen));
    console.log("  egrinin gordugu net  " + usd(net));
    console.log("  %2 protokol ucreti   " + usd(ucret));
    console.log("  %3 teminat vergisi   " + usd(vergi) + "   -> kasaya");
    console.log("");
    ok(V(u.kurucuAldi) === bek(3_000n), "tokenin kurucusu %0,30 aldi", usd(u.kurucuAldi));
    ok(V(u.rewardsAldi) === bek(3_000n), "holder odulleri %0,30 aldi", usd(u.rewardsAldi));
    ok(V(u.gelistiriciAldi) === bek(3_000n), "GELISTIRICI FONU %0,30 aldi", usd(u.gelistiriciAldi));
    ok(V(u.likiditeAldi) === bek(5_000n), "PROTOKOL LIKIDITESI %0,50 aldi", usd(u.likiditeAldi));
    ok(V(u.isletmeAldi) === bek(2_000n), "ISLETME %0,20 aldi", usd(u.isletmeAldi));

    const bize = V(u.gelistiriciAldi) + V(u.likiditeAldi) + V(u.isletmeAldi);
    ok(bize === bek(10_000n), "BIZE TOPLAM %1,00", usd(bize));

    const dagitilan = V(u.kurucuAldi) + V(u.rewardsAldi) + bize;
    ok(dagitilan <= ucret, "dagitilan toplam ucreti asmiyor", usd(dagitilan) + " <= " + usd(ucret));
    /* The curve charges BOTH now: the protocol's 2% and the launch's 3%.
       Subtracting only the protocol fee left this 30 dollars high and
       reported a correct reserve as wrong. */
    ok(V(u.toplanan) === net - ucret - vergi,
       "egrinin rezervi = net eksi ucret eksi vergi", usd(u.toplanan));
    ok(V(u.vergi) === kesilen + (ucret - dagitilan),
       "vergi = snipe + derinlik dilimi, ikisi de havuza gidecek", usd(u.vergi));
    /* The tax. 3% of the net, into this launch's own vault — and the
       rate came from the registry, not from a constant in the hook. */
    ok(V(u.vergiPpm) === 30_000n, "kayittaki vergi orani %3", "ppm " + u.vergiPpm);
    ok(V(u.kasayaGiden) === bek(30_000n), "TEMINAT VERGISI KASAYA ULASTI",
       usd(u.kasayaGiden) + "  bekl. " + usd(bek(30_000n)));
    ok(V(u.kasayaGiden) > 0n, "kasa bos degil", u.kasa);

    ok(V(u.alinanToken) > 0n, "alici token aldi",
       (Number(V(u.alinanToken)) / 1e18).toLocaleString("en", { maximumFractionDigits: 0 }) + " token");

    console.log("");
    console.log(kotu === 0 ? "  GECTI — ucret gercekten bes adrese dagildi, zincirde olculdu."
                           : "  BASARISIZ — " + kotu + " sorun.");
    process.exit(kotu === 0 ? 0 : 1);
  })().catch((e) => { console.log("HATA: " + e.message); process.exit(1); });
}

module.exports = { kosul };
