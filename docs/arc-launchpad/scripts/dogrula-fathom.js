"use strict";
/* ===========================================================================
 * dogrula-fathom.js — read the live thing back and check it against what
 *                     was promised.
 *
 *   node scripts/dogrula-fathom.js
 *
 * Every number in the plan was measured in simulation before anything was
 * sent. Simulation is not the chain. This reads the deployed contracts and
 * the live pool and compares, so a gap between what was predicted and what
 * exists shows up here rather than in somebody's wallet.
 *
 * Depth is read as L/sqrtP, the quote-side virtual reserve — the same
 * formula checked against the old DEPTH pool, where it returned $6.03 for
 * a pool known to hold $6 and reproduced the -76.96% on the screenshots.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, keccak256, id } = require("ethers");
const TM = require("./tickmath.js");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const coder = AbiCoder.defaultAbiCoder();
const KOK = path.join(__dirname, "..");
const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const sel = (s) => id(s).slice(0, 10);
const Q96 = 2 ** 96;

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(e); }
      });
    });
    r.on("error", rej);
    r.setTimeout(60000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 600)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 30000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);
const adet = (v) => nf(Number(v) / 1e18);
const cuzdanEtki = (R, d) => (1 - R / (R + d)) * 100;

(async function main() {
  const oku = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
  const bak = async (who) => BigInt(await oku(A.token,
    sel("balanceOf(address)") + coder.encode(["address"], [who]).slice(2)));
  const adres = async (to, fn) => "0x" + (await oku(to, sel(fn))).slice(26);

  const kontrol = [];
  const ok = (ad, kosul, gorulen) => kontrol.push([ad, !!kosul, gorulen]);

  /* ---- supply ------------------------------------------------------ */
  const arz = BigInt(await oku(A.token, sel("totalSupply()")));
  const bAcici = await bak(A.acici), bStake = await bak(A.stake);
  const bKurucu = await bak(A.kurucu), bVest = await bak(A.vesting);
  const bPM = await bak(A.poolManager);

  console.log("FATHOM — FTHM   zincirden okundu");
  console.log("");
  console.log("  token      " + A.token);
  console.log("  havuzId    " + A.havuzId);
  console.log("");
  console.log("  ARZ VE DAGILIM");
  console.log("    toplam arz       " + adet(arz));
  console.log("    havuzda (kilitli)" + adet(bPM).padStart(14) + "   cikarilamaz");
  console.log("    acicida kalan    " + adet(bAcici).padStart(14) + "   0 olmali");
  console.log("    stake kasasi     " + adet(bStake).padStart(14));
  console.log("    kurucu cuzdani      " + adet(bKurucu).padStart(14) + "   senin serbest payin");
  console.log("    vesting          " + adet(bVest).padStart(14));
  const toplam = bAcici + bStake + bKurucu + bVest + bPM;
  console.log("    sayim toplami    " + adet(toplam).padStart(14) +
    (toplam === arz ? "   KAPANIYOR" : "   ACIK: " + adet(arz - toplam)));

  ok("arz 1.000.000.000", arz === 1_000_000_000n * 10n ** 18n, adet(arz));
  ok("sayim arzi kapatiyor", toplam === arz, adet(toplam));
  /* v4 sizes a position from the amount offered and takes slightly less,
     so a few hundred million wei — a ten-billionth of a token — stays in
     the opener. The invariant is that the two sum back to the allocation,
     which proves the remainder is rounding and not a leak. */
  /* Every market token is in the pool, in the opener as fee income, or in
     a buyer's hands. Written as a sum so a buy does not read as a leak —
     the first version compared the pool against the whole allocation and
     flagged the $1 test purchase as a failure. */
  const satilan = bKurucu > BigInt(A.kurucuSerbest) ? bKurucu - BigInt(A.kurucuSerbest) : 0n;
  const piyasaFark = BigInt(A.piyasa) - bPM - bAcici - satilan;
  ok("piyasa payinin tamami hesapli", piyasaFark >= 0n && piyasaFark < 10n ** 12n,
     "havuz " + adet(bPM) + " + acici " + adet(bAcici) + " + satilan " + adet(satilan) +
     "   artan " + piyasaFark + " wei");
  /* The opener keeps the hook's fee income until biriktir() turns it into
     depth, so "empty" is the wrong invariant. What must be true is that no
     part of the market allocation is still sitting here unplaced. */
  ok("acicida dagitilmamis piyasa payi yok", bAcici < 10n ** 24n,
     adet(bAcici) + "  (hook ucreti, biriktir() derinlige cevirir)");
  /* Not equality: the founder wallet made the $1 test buy, so it holds its
     share PLUS what it bought. What must never happen is the share going
     down, which is the rule this project is under. */
  ok("kurucu payi harcanmamis", bKurucu >= BigInt(A.kurucuSerbest),
     adet(bKurucu) + "  (pay " + adet(BigInt(A.kurucuSerbest)) +
     " + test alimi " + adet(satilan) + ")");
  ok("stake payi yerinde", bStake === BigInt(A.stakeEmisyon), adet(bStake));

  /* ---- wiring ------------------------------------------------------ */
  const aciciHook = await adres(A.acici, "hook()");
  const hookAcici = await adres(A.hook, "havuzAcici()");
  const hookKurucu = await adres(A.hook, "kurucu()");
  const hookStake = await adres(A.hook, "stakeKasasi()");
  ok("acici -> hook", aciciHook.toLowerCase() === A.hook.toLowerCase(), aciciHook);
  ok("hook -> acici", hookAcici.toLowerCase() === A.acici.toLowerCase(), hookAcici);
  ok("hook ucreti -> kurucu cuzdani", hookKurucu.toLowerCase() === A.kurucu.toLowerCase(), hookKurucu);
  ok("hook ucreti -> stake", hookStake.toLowerCase() === A.stake.toLowerCase(), hookStake);

  /* ---- the pool ---------------------------------------------------- */
  const slot = keccak256(coder.encode(["bytes32", "uint256"], [A.havuzId, 6]));
  const raw = BigInt(await oku(A.poolManager, sel("extsload(bytes32)") + slot.slice(2)));
  const sqrt = raw & ((1n << 160n) - 1n);
  const likSlot = "0x" + (BigInt(slot) + 3n).toString(16).padStart(64, "0");
  const lik = BigInt(await oku(A.poolManager, sel("extsload(bytes32)") + likSlot.slice(2)));
  const tick = TM.tickAt(sqrt);
  const sqrtP = Number(sqrt) / Q96;
  const fiyat = (1 / (sqrtP * sqrtP)) * 1e12;
  /* USDC is currency0, so its virtual reserve is L/sqrtP — NOT L*sqrtP,
     which is the token side and which I wrote first. The wrong one gives
     quadrillions and prints -%0 slippage at every size, a wrong answer
     that looks like a win. Checked against a measurement instead: $1,000
     against this reserve is 1,88% and the ladder simulation measured
     -1,89%. Before the first trade slot0 liquidity is zero and so is this;
     that is the band sitting at its own opening tick, not an empty pool. */
  const derinlik = lik === 0n ? 0 : (Number(lik) / sqrtP) / 1e6;

  console.log("");
  console.log("  HAVUZ");
  console.log("    sqrtPriceX96     " + sqrt);
  console.log("    tick             " + tick + (tick === A.acilisTick ? "   planlanan tick" : "   SAPTI, plan " + A.acilisTick));
  console.log("    fiyat            $" + fiyat.toExponential(4) + " / FTHM");
  console.log("    FDV              " + usd(fiyat * 1e9, 0));
  console.log("    aktif likidite   " + lik);
  console.log("    DERINLIK         " + usd(derinlik, 0) + "   (L/sqrtP — kaymayi belirleyen)");

  ok("havuz acildi", sqrt > 0n, sqrt.toString());
  /* Only until the first buy: the pool walks down from the opening tick as
     it fills, so after trading has started this is a record of where it
     opened, not where it is. */
  ok("acilis tickinde veya altinda", tick <= A.acilisTick, String(tick));
  /* Not "slot0 liquidity > 0": a position is live over [lower, upper) and
     the inner rung sits at upper, so slot0 reads zero until a swap crosses
     in. What has to be true is that the opener placed liquidity. */
  const yerlesen = BigInt(await oku(A.acici, sel("likidite()")));
  ok("acici likidite yerlestirdi", yerlesen > 0n, yerlesen.toString());
  if (lik === 0n)
    console.log("    (slot0 likiditesi 0 — bant acilis tickinin ALTINDA, ilk alim icine girer)");

  /* ---- what a wallet will print ------------------------------------ */
  console.log("");
  console.log("  CUZDANIN GOSTERECEGI  (havuz + %0,50 hook ucreti)");
  console.log("    " + "alim".padEnd(10) + "havuz".padStart(9) + "toplam".padStart(10) +
    "      olculen beklenti");
  const beklenen = { 20: 0.54, 100: 0.69, 500: 1.45, 1000: 2.39 };
  for (const d of [20, 100, 500, 1000]) {
    const e = cuzdanEtki(derinlik, d);
    console.log("    " + usd(d, 0).padEnd(10) +
      (derinlik === 0 ? "henuz yok".padStart(9) : ("-%" + nf(e, 2)).padStart(9)) +
      (derinlik === 0 ? "".padStart(10) : ("-%" + nf(e + 0.5, 2)).padStart(10)) +
      "      -%" + nf(beklenen[d], 2));
  }

  console.log("");
  console.log("  KIYAS — Arc'in gercek havuzlari");
  for (const [ad, R] of [["Arc launchpad ortancasi", 5500], ["Arc'in en iyisi (SAFEMOON)", 17900],
                         ["olu DEPTH havuzu", 6.03]])
    console.log("    " + ad.padEnd(28) + "$20 -%" + nf(cuzdanEtki(R, 20), 2).padStart(6) +
      "    $1.000 -%" + nf(cuzdanEtki(R, 1000), 1));
  console.log("    " + "FATHOM".padEnd(28) + "$20 -%" + nf(cuzdanEtki(derinlik, 20), 2).padStart(6) +
    "    $1.000 -%" + nf(cuzdanEtki(derinlik, 1000), 1));

  /* ---- the honest line --------------------------------------------- */
  const usdcHavuz = BigInt(await oku(A.usdc,
    sel("balanceOf(address)") + coder.encode(["address"], [A.poolManager]).slice(2)));
  console.log("");
  console.log("  CIKIS — susmadan");
  console.log("    Bu havuza bugune kadar konan dolar: SIFIR. Satis karsiligi");
  console.log("    alicilar aldikca olusuyor; ilk alim oluncaya kadar satilamaz.");
  console.log("    (PoolManager'daki USDC " + usd(Number(usdcHavuz) / 1e6, 2) +
    " — Arc'taki TUM havuzlarin toplami, bizim degil.)");

  console.log("");
  let hata = 0;
  for (const [ad, gecti, g] of kontrol) {
    if (!gecti) hata++;
    console.log("  " + (gecti ? "TAMAM" : "HATA ") + "  " + ad.padEnd(32) + g);
  }
  console.log("");
  console.log("  " + (hata === 0 ? kontrol.length + " kontrolun hepsi gecti."
    : hata + " KONTROL GECMEDI."));
  if (hata) process.exit(1);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
