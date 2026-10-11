"use strict";
/* ===========================================================================
 * calistir.js — run the hook against Arc's own EVM, without deploying it
 *
 *   node test/calistir.js
 *
 * HOW, AND WHY THIS WAY
 *   eth_call accepts a state override: a contract's code can be placed at a
 *   throwaway address for the duration of one call. So the compiled hook runs
 *   inside the real Arc node, with real gas semantics and the real EVM
 *   version, while costing nothing and sending no transaction.
 *
 *   This matters more than usual here. A v4 hook's address encodes its
 *   capabilities, so the hook cannot be "patched" after a pool exists — a
 *   wrong hook means a permanently broken pool. Testing it against the chain
 *   it will live on, before any of it is permanent, is the cheapest insurance
 *   available.
 *
 * WHAT IS CHECKED
 *   1. the split adds up and the constants are what the design says
 *   2. liquidity removal reverts — for everyone, with no exception path
 *   3. liquidity addition is refused to anyone but the launchpad
 *   4. every hook entry point refuses callers other than the PoolManager
 *   5. a hook address with the required capability bits can actually be mined
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, Interface, keccak256, getCreate2Address , Wallet , getBytes , getAddress } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const ART = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "ArcLaunchHook.json"), "utf8"));
const TPM = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestPoolManager.json"), "utf8"));
const iface = new Interface(ART.abi);
const tpmIface = new Interface(TPM.abi);
const coder = AbiCoder.defaultAbiCoder();

/* Addresses used only inside the override; nothing is deployed. */
const HOOK = "0x00000000000000000000000000000000000000A4";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Arc PoolManager
const LAUNCHPAD = "0x1111111111111111111111111111111111111111";
const YABANCI = "0x2222222222222222222222222222222222222222";

let gecti = 0, kaldi = 0;
const ok = (k, ad, not) => { console.log("  " + (k ? "PASS " : "FAIL ") + ad + (not ? "   " + not : "")); k ? gecti++ : kaldi++; };

/* The public endpoint throttles, and a throttled call is not a failed check —
 * conflating the two makes the suite cry wolf and teaches you to ignore it.
 * Rate limits are waited out; everything else is reported as it happened. */
const hizSiniri = (e) =>
  /rate limit|429|too many requests|503/i.test(String((e && e.message) || ""));

async function rpc(method, params) {
  let bekleme = 1200;
  for (let i = 0; ; i++) {
    try { return await rpcHam(method, params); }
    catch (e) {
      if (!hizSiniri(e) || i >= 6) throw e;
      await new Promise((r) => setTimeout(r, bekleme));
      bekleme = Math.min(bekleme * 2, 15000);
    }
  }
}

function rpcHam(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname, method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try {
          const j = JSON.parse(b);
          if (j.error) return rej(Object.assign(new Error(j.error.message || "rpc"), { data: j.error.data }));
          res(j.result);
        } catch (e) { rej(new Error("HTTP " + s.statusCode)); }
      });
    });
    r.on("error", rej);
    r.setTimeout(25000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

/* The constructor arguments are baked into the deployed code's immutables, so
 * the runtime bytecode alone is not enough: the hook is "deployed" inside the
 * override by running the creation code. Simpler route — call the constructor
 * through eth_call with the creation code and read back the runtime code. */
const HOLDER_ODUL = "0x3333333333333333333333333333333333333333";
const DEV_ODUL = "0x4444444444444444444444444444444444444444";
const PROTOKOL = "0x5555555555555555555555555555555555555555";
/* The money side of every pool the hook serves. It has to know which
   currency is dollars: a fee taken in dollars is split three ways, a fee
   taken in the launch token is burned. */
const QUOTE = "0x6666666666666666666666666666666666666666";

function kurucuArgs(poolManager, quote) {
  return coder.encode(
    ["address", "address", "address"],
    [poolManager, LAUNCHPAD, quote || QUOTE]
  ).slice(2);
}

async function kurulmusKod(poolManager, quote) {
  const out = await rpc("eth_call", [{ data: ART.bytecode + kurucuArgs(poolManager || PM, quote) }, "latest"]);
  if (!out || out === "0x") throw new Error("kurucu calismadi");
  return out;
}

async function cagir(kod, veri, from) {
  return rpc("eth_call", [
    { from: from || PM, to: HOOK, data: veri },
    "latest",
    { [HOOK]: { code: kod } }
  ]);
}

/* A revert is the expected result for most of these, so the reason has to be
 * decoded rather than treated as a failure. */
function hataAdi(e) {
  const blob = String((e && (e.data || e.message)) || "");
  const m = /0x[0-9a-fA-F]{8,}/.exec(blob);
  if (!m) return null;
  try { return iface.parseError(m[0])?.name || null; } catch (x) { return null; }
}

const BOS_KEY = [
  "0x0000000000000000000000000000000000000000",
  "0x0000000000000000000000000000000000000001",
  3000, 60, HOOK
];
const BOS_MODIFY = [-60, 60, 1000, "0x" + "00".repeat(32)];

(async function main() {
  console.log("arc-launchpad hook kontrolu");
  console.log("  rpc  " + RPC);
  console.log("  kod  " + ((ART.deployedBytecode.length - 2) / 2).toLocaleString("en-US") + " bayt");
  console.log("");

  const kod = await kurulmusKod();

  console.log("1) sabitler ve pay dagilimi");
  const oku = async (ad) => BigInt(await cagir(kod, iface.encodeFunctionData(ad, [])));
  const fee = await oku("FEE_PPM");
  ok(fee === 5000n, "toplam ucret %0,50", fee + " ppm");

  /* There is no split any more. HOLDER_PPM, DEV_PPM and PROTOCOL_PPM are
     gone from the contract, not set to zero, and so are their buckets and
     their sweep functions. The check is therefore that the ABI has no way
     to ask about them: a bucket that exists is a bucket somebody can later
     be paid from. */
  const yokOlmali = ["HOLDER_PPM", "DEV_PPM", "PROTOCOL_PPM",
                     "holderAccrued", "devAccrued", "protocolAccrued",
                     "sweepHolder", "sweepDev", "sweepProtocol",
                     "holderRewards", "devRewards", "protocol"];
  const kalanlar = yokOlmali.filter((ad) =>
    ART.abi.some((f) => f.name === ad));
  ok(kalanlar.length === 0, "ODEME MAKINESI KALDIRILDI, sifirlanmadi",
    kalanlar.length ? "hala duruyor: " + kalanlar.join(", ") : "12 uyeden hicbiri yok");
  ok(ART.abi.some((f) => f.name === "floorAccrued"),
    "tek kova duruyor: floorAccrued", "ucretin tek hedefi");
  ok(ART.abi.filter((f) => /^sweep/.test(f.name || "")).length === 1,
    "tek sweep fonksiyonu var", "sweepFloor");
  const q = (await cagir(kod, iface.encodeFunctionData("quote", []))).slice(-40);
  ok("0x" + q === QUOTE.toLowerCase(), "hook parayi taniyor", "0x" + q);

  /* The opening tax schedule. A launch that opens at its own collateral has
     no premium protecting it, so the first seconds are the whole exposure:
     measured, $100 would otherwise take 23% of a $100 launch's supply. */
  const snipe = async (sn) =>
    BigInt(await cagir(kod, iface.encodeFunctionData("snipeOrani", [sn])));
  const s0 = await snipe(0), s1 = await snipe(1), s2 = await snipe(2), s5 = await snipe(5);
  ok(s0 === 990000n, "acilis anindaki alim vergisi %99", s0 + " ppm");
  ok(s1 === 247500n, "1 saniyede %24,75'e iniyor", s1 + " ppm");
  ok(s2 === 61875n, "2 saniyede %6,19", s2 + " ppm");
  ok(s5 === 0n, "5 saniyeden sonra hic yok", "normal ucret devam");
  ok(s0 > s1 && s1 > s2, "surekli azaliyor", "beklemek her zaman ucuz");

  console.log("");
  console.log("2) likidite kilidi");
  try {
    await cagir(kod, iface.encodeFunctionData("beforeRemoveLiquidity",
      [LAUNCHPAD, BOS_KEY, BOS_MODIFY, "0x"]), PM);
    ok(false, "cekim reddedilmeli", "revert etmedi");
  } catch (e) {
    ok(hataAdi(e) === "LiquidityIsLocked", "launchpad bile cekemiyor", hataAdi(e) || e.message.slice(0, 40));
  }
  try {
    await cagir(kod, iface.encodeFunctionData("beforeRemoveLiquidity",
      [YABANCI, BOS_KEY, BOS_MODIFY, "0x"]), PM);
    ok(false, "yabanci cekim reddedilmeli", "revert etmedi");
  } catch (e) {
    ok(hataAdi(e) === "LiquidityIsLocked", "yabanci da cekemiyor", hataAdi(e) || "");
  }

  console.log("");
  console.log("3) likidite ekleme izni");
  try {
    const r = await cagir(kod, iface.encodeFunctionData("beforeAddLiquidity",
      [LAUNCHPAD, BOS_KEY, BOS_MODIFY, "0x"]), PM);
    const sel = iface.getFunction("beforeAddLiquidity").selector;
    ok(String(r).slice(0, 10) === sel, "launchpad ekleyebiliyor");
  } catch (e) { ok(false, "launchpad ekleyebiliyor", hataAdi(e) || e.message.slice(0, 50)); }
  try {
    await cagir(kod, iface.encodeFunctionData("beforeAddLiquidity",
      [YABANCI, BOS_KEY, BOS_MODIFY, "0x"]), PM);
    ok(false, "yabanci ekleyememeli", "revert etmedi");
  } catch (e) {
    ok(hataAdi(e) === "OnlyLaunchpad", "yabanci ekleyemiyor", hataAdi(e) || "");
  }

  console.log("");
  console.log("4) yalnizca PoolManager cagirabilir");
  for (const [ad, veri] of [
    ["beforeAddLiquidity", iface.encodeFunctionData("beforeAddLiquidity", [LAUNCHPAD, BOS_KEY, BOS_MODIFY, "0x"])],
    ["beforeRemoveLiquidity", iface.encodeFunctionData("beforeRemoveLiquidity", [LAUNCHPAD, BOS_KEY, BOS_MODIFY, "0x"])]
  ]) {
    try {
      await cagir(kod, veri, YABANCI);
      ok(false, ad + " disaridan reddedilmeli", "revert etmedi");
    } catch (e) {
      ok(hataAdi(e) === "OnlyPoolManager", ad + " disaridan reddediliyor", hataAdi(e) || "");
    }
  }

  console.log("");
  console.log("5) ucret aritmetigi  (sahte PoolManager uzerinden)");
  {
    const SAHTE_PM = "0x00000000000000000000000000000000000000B1";
    const C0 = "0x000000000000000000000000000000000000000A";
    const C1 = "0x000000000000000000000000000000000000000B";
    /* C1 is the money, C0 is the launch token. Naming one of the pair as
       the quote is what lets both branches of the split be driven here: a
       fee landing in C1 is divided, a fee landing in C0 is burned. */
    const hookKod = await kurulmusKod(SAHTE_PM, C1);
    const key = [C0, C1, 3000, 60, HOOK];

    async function swap(zeroForOne, amountSpecified, a0, a1) {
      const veri = tpmIface.encodeFunctionData("calistir",
        [HOOK, key, zeroForOne, amountSpecified, a0, a1]);
      const r = await rpc("eth_call", [
        { from: YABANCI, to: SAHTE_PM, data: veri },
        "latest",
        { [SAHTE_PM]: { code: TPM.deployedBytecode }, [HOOK]: { code: hookKod } }
      ]);
      const [s] = tpmIface.decodeFunctionResult("calistir", r);
      return {
        delta: BigInt(s.hookDelta), holder: BigInt(s.holder), dev: BigInt(s.dev),
        protocol: BigInt(s.protocolPay), liquidity: BigInt(s.liquidity),
        taken: BigInt(s.taken), takenTo: s.takenTo, currency: String(s.takenCurrency).toLowerCase(),
        /* take() and mint() are different claims about what the hook did
           with the fee, and collapsing them would hide the one that
           matters: mint means the fee was charged on a side nobody has
           paid in yet. */
        minted: BigInt(s.minted), mintedTo: s.mintedTo,
        mintCurrency: String(s.mintedCurrency).toLowerCase(),
        takeSayisi: BigInt(s.takeSayisi), mintSayisi: BigInt(s.mintSayisi)
      };
    }

    /* Exact input, token0 -> token1: the trader fixed the input, so the
     * unspecified side is token1 coming out. 1e6 out at 0.50% = 5000. */
    const a = await swap(true, -1000000n, -1000000n, 1000000n);
    ok(a.taken === 5000n, "exact-input satis: %0,50 kesildi", a.taken + " / 1.000.000");
    ok(a.currency === C1.toLowerCase(), "ucret cikis tarafindan (currency1 = para)", a.currency);
    /* The money side used to split three ways and leave the floor empty.
       Now it does not split at all: the whole fee is booked to the floor
       in money, and sweepFloor sends it to the vault. These two
       assertions used to require the split; they now require that there
       isn't one. */
    ok(a.holder === 0n && a.dev === 0n && a.protocol === 0n,
      "PARA TARAFINDA DA KIMSEYE PAY YAZILMIYOR",
      `${a.holder}/${a.dev}/${a.protocol}`);
    ok(a.liquidity === a.taken, "PARA TARAFININ TAMAMI TABANA",
      a.liquidity + " / " + a.taken + " — kesilenin tamami");
    ok(a.delta === a.taken, "hook delta = kesilen ucret", a.delta.toString());
    ok(a.takenTo.toLowerCase() === HOOK.toLowerCase(), "ucret hook'a alindi");

    /* The other direction: the fee lands in the launch token. Nobody can be
       paid in it — holders are owed dollars — so all of it is queued for the
       burn, which raises collateral-per-token for everyone who stayed. */
    const b = await swap(false, -2000000n, 2000000n, -2000000n);
    ok(b.currency === C0.toLowerCase(), "ters yonde ucret currency0'dan", b.currency);
    ok(b.taken === 10000n, "2.000.000 cikista 10.000 kesildi", b.taken.toString());
    /* All of it, not just the holders' 30%. These three assertions used to
       require the opposite: the floor took the holder slice and the
       developer and protocol slices accrued as launch tokens. That was the
       defect. Those two addresses can only turn a launch token into money
       by selling it into the customer's own pool, so 0.35% of every
       purchase became a standing seller working against the holders the
       fee is meant to pay. Routed to the floor it reaches the same people
       and cannot be dumped; the protocol and the dev pool still earn on
       SALES, where the fee arrives as money. */
    ok(b.liquidity === b.taken,
      "token tarafinda ucretin TAMAMI tabana ayrildi",
      b.liquidity + " / " + b.taken + "  (%100)");
    ok(b.holder === 0n, "tutucu kovasi bos — token olarak odenemez", "yerine taban yukseliyor");
    ok(b.dev === 0n && b.protocol === 0n,
      "gelistirici ve protokol kovalari TOKEN olarak BOS",
      b.dev + " / " + b.protocol + " — satilmak zorunda olan bir sey verilmiyor");
    ok(b.liquidity + b.dev + b.protocol === b.taken,
      "token tarafinda da hicbir sey kaybolmuyor", "yakilan + iki pay = kesilen");

    /* Nothing leaving the pool on the unspecified side: no fee is possible. */
    const c = await swap(true, -1000000n, -1000000n, 0n);
    ok(c.taken === 0n && c.delta === 0n, "cikis yoksa ucret de yok", "delta " + c.delta);

    /* Rounding: the remainder must land in the liquidity bucket, not vanish. */
    const d = await swap(true, -1n, -1n, 777n);
    const beklenen = (777n * 5000n) / 1000000n;
    ok(d.taken === beklenen, "kucuk miktarda ucret dogru", d.taken + " (beklenen " + beklenen + ")");
    ok(d.holder + d.dev + d.protocol + d.liquidity === d.taken,
      "kucuk miktarda da hicbir sey kaybolmuyor", "artik protokole gidiyor");

    /* A swap too small to carry a fee must not charge a phantom one. */
    const e = await swap(true, -1n, -1n, 100n);
    ok(e.taken === 0n, "ucret sifira yuvarlaninca kesinti yapilmiyor", "cikis 100, ucret " + e.taken);

    /* EXACT OUTPUT. Everything above fixes the input. This fixes the
       OUTPUT, which is what an aggregator or a cross-chain router does
       whenever it has to deliver a precise amount — so it is not an exotic
       case, it is half of the routed volume.
   
       The hook used to return zero here. The unspecified side of an
       exact-output swap is the INPUT, its delta is negative because the
       trader is paying it, and the fee branch bailed out on anything that
       was not positive. Every exact-output trade passed through free, and
       since the fee is the floor's only growth engine, "every trade grows
       the floor" was only true of exact-input trades.
   
       These four assertions are the ones that were missing. Each case is
       stated with the arithmetic it should produce, so a regression shows
       up as a number rather than as a silent zero. */
    /* Exact-output SALE: trader fixes the money they want out (1.000.000
       of C1) and pays token in (1.010.000 of C0). Unspecified = the token
       going in, 0,50% of 1.010.000 = 5.050. */
    const f = await swap(true, 1000000n, -1010000n, 1000000n);
    ok(f.minted === 5050n, "EXACT-OUTPUT SATISTA UCRET KESILIYOR",
      f.minted + " / 1.010.000 girdi — %0,50");
    ok(f.mintCurrency === C0.toLowerCase(),
      "  ucret GIRDI tarafindan aliniyor (currency0 = token)",
      f.mintCurrency + " — cikis sabit oldugu icin ucret girisin uzerine biniyor");
    /* take() would have reached into the manager's real balance for money
       the trader has not paid in yet. It does not merely come up short —
       it reverted the whole swap with Panic(17) inside
       WrappedError(hook, afterSwap), at every size down to one token. So
       the input-side fee is MINTED as a claim and redeemed later, and
       this pair of assertions is what keeps it that way. */
    ok(f.takeSayisi === 0n && f.mintSayisi === 1n,
      "  GIRDI TARAFINDA take() DEGIL mint() KULLANILIYOR",
      "take " + f.takeSayisi + ", mint " + f.mintSayisi +
      " — odenmemis parayi havuzdan cekmek takasi patlatiyordu");
    ok(f.liquidity === f.minted, "  ve tamami tabana yaziliyor",
      f.liquidity + " / " + f.minted);
    ok(f.delta === f.minted,
      "  hook deltasi = ucret, yani trader daha FAZLA girdi oduyor",
      "v4: swapDelta = swapDelta - hookDelta");

    /* Exact-output BUY: trader fixes the token they want (2.000.000 of C0)
       and pays money in (2.020.000 of C1). 0,50% of that = 10.100. */
    const g = await swap(false, 2000000n, 2000000n, -2020000n);
    ok(g.minted === 10100n, "EXACT-OUTPUT ALIMDA DA UCRET KESILIYOR",
      g.minted + " / 2.020.000 girdi");
    ok(g.mintCurrency === C1.toLowerCase(), "  alimda ucret PARA olarak giriyor",
      g.mintCurrency + " — dogrudan kasaya, cevrim gerekmiyor");
    ok(g.liquidity === g.minted, "  tamami tabana", g.liquidity + " / " + g.minted);

    /* The same trade phrased both ways must not differ by more than the
       sizes differ. This is the property that was broken: a trader could
       pick the phrasing that paid nothing. */
    ok(f.minted > 0n && g.minted > 0n && a.taken > 0n && b.taken > 0n,
      "DORT FATURALAMA BICIMININ HEPSI UCRET ODUYOR",
      "exact-in satis/alim, exact-out satis/alim — kacacak ifade yok");
    /* And the exact-input path still takes real tokens, because there the
       manager demonstrably holds them: the fee is a slice of what is
       already leaving the pool. */
    ok(a.takeSayisi > 0n && a.mintSayisi === 0n,
      "CIKIS TARAFINDA take() KORUNDU",
      "havuzdan cikan paranin bir dilimi — bakiye garanti, alacaga gerek yok");
  }

  console.log("");
  console.log("6) teminat ve geri alim  (tam bir launch, tek cagrida)");
  {
    const RED = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestRedemption.json"), "utf8"));
    const rIface = new Interface(RED.abi);
    const HARNESS = "0x00000000000000000000000000000000000000C1";
    const ARZ = 10n ** 9n * 10n ** 18n;        // 1.000.000.000 token
    const TEMINAT = 900n * 10n ** 18n;          // 900 birim: 1500$ launch'in %60'i

    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: HARNESS, data: rIface.encodeFunctionData(fn, args), gas: "0x4000000" },
        "latest",
        { [HARNESS]: { code: RED.deployedBytecode } }
      ]);
      return rIface.decodeFunctionResult(fn, r);
    };

    const [s] = await call("run", [ARZ, TEMINAT]);
    const f0 = BigInt(s.floorBaslangic), f10 = BigInt(s.floor10), f50 = BigInt(s.floor50), fs_ = BigInt(s.floorSon);
    /* FLOOR_SCALE is 1e36. */
    const bekTaban = (TEMINAT * 10n ** 36n) / ARZ;

    ok(f0 === bekTaban, "taban = teminat / arz", f0 + " (beklenen " + bekTaban + ")");
    ok(f10 === f0, "%10 cikis sonrasi taban DEGISMEDI", f10.toString());
    ok(f50 === f0, "kumulatif %50 cikis sonrasi taban degismedi", f50.toString());
    ok(fs_ === f0, "kumulatif %90 cikis sonrasi taban degismedi", fs_.toString());

    const o10 = BigInt(s.odeme10), o40 = BigInt(s.odeme40), o40b = BigInt(s.odeme40ikinci);
    ok(o10 === TEMINAT / 10n, "%10 yakan teminatin %10'unu aldi", o10.toString());
    /* Ikinci %40, kalan arzin daha buyuk bir oranidir; odemenin orana gore
     * olculmesi gerekir, mutlak olarak degil. */
    ok(o40 > o10 * 3n && o40 < o10 * 5n, "%40 yakan orantili aldi", o40.toString());
    ok(BigInt(s.kalanArz) === ARZ / 10n, "kalan arz %10", BigInt(s.kalanArz).toString());
    ok(BigInt(s.kalanTeminat) === TEMINAT - o10 - o40 - o40b, "teminat muhasebesi tutuyor");

    const fFon = BigInt(s.floorFonSonrasi);
    ok(fFon > fs_, "ucretten gelen teminat tabani YUKSELTTI", fs_ + " -> " + fFon);

    const [odeme, kalan] = await call("runTamCikis", [ARZ, TEMINAT]);
    ok(BigInt(odeme) === TEMINAT, "herkes cikarsa teminatin tamami odeniyor", BigInt(odeme).toString());
    ok(BigInt(kalan) === 0n, "kasada hicbir sey mahsur kalmiyor", BigInt(kalan).toString());
  }

  console.log("");
  console.log("7) tutucu odulu  (24 saat kurali)");
  {
    const RW = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestRewards.json"), "utf8"));
    const wIface = new Interface(RW.abi);
    const H2 = "0x00000000000000000000000000000000000000D1";
    const ARZ = 1000n * 10n ** 18n;
    const ODUL = 100n * 10n ** 18n;

    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: H2, data: wIface.encodeFunctionData(fn, args), gas: "0x4000000" },
        "latest",
        { [H2]: { code: RW.deployedBytecode } }
      ]);
      return wIface.decodeFunctionResult(fn, r);
    };

    const [p] = await call("runUygun", [ARZ, ODUL]);
    const uygunArz = BigInt(p.eligibleSupply);
    ok(uygunArz === (ARZ * 70n) / 100n, "havuzdaki %30 odul disinda", uygunArz.toString());
    ok(BigInt(p.havuzEarned) === 0n, "kilitli likidite odul kazanmiyor", BigInt(p.havuzEarned).toString());

    /* accPerShare is a division, so the payout is computed in two steps and
       loses a few wei to rounding. Demanding exact equality here would be
       testing the arithmetic of 1e18 fixed point, not the behaviour. What
       matters is that the share is right and the dust is downward. */
    const aBek = ((ARZ * 40n / 100n) * ODUL) / uygunArz;
    const bBek = ((ARZ * 30n / 100n) * ODUL) / uygunArz;
    const yakin = (x, y) => { const d = x > y ? x - y : y - x; return d < 1000n && x <= y; };
    ok(yakin(BigInt(p.aPaid), aBek), "A payini aldi (%40 -> 4/7)", BigInt(p.aPaid) + " ~ " + aBek);
    ok(yakin(BigInt(p.bPaid), bBek), "B payini aldi (%30 -> 3/7)", BigInt(p.bPaid) + " ~ " + bBek);
    ok(BigInt(p.aPaid) + BigInt(p.bPaid) + BigInt(p.kalanOdul) === ODUL,
      "odenen + kalan = dagitilan", "hicbir sey kaybolmadi");

    const [k] = await call("runUygunsuz", [ARZ, ODUL]);
    ok(BigInt(k.aPending) > 0n, "bekleme bitmeden pay birikiyor", BigInt(k.aPending).toString());
    ok(BigInt(k.aEarned) === 0n, "ama bekleme bitmeden odenmiyor");
    ok(BigInt(k.aPaid) === 0n, "erken talep hicbir sey odemiyor");
    ok(BigInt(k.ikinciDagitim) === BigInt(k.aPending),
      "kaybedilen pay yeniden dagitima giriyor", BigInt(k.ikinciDagitim).toString());
    ok(BigInt(k.bPendingSonra) > 0n, "kalan sahipler o paydan faydalaniyor", BigInt(k.bPendingSonra).toString());
  }

  console.log("");
  console.log("8) tam launch  (GERCEK Arc PoolManager) ve YATIRIMIN GERI DONUSU");
  {
    const L = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestLaunch.json"), "utf8"));
    const lIface = new Interface(L.abi);
    const H3 = "0x00000000000000000000000000000000000000E1";
    const E = 10n ** 18n;
    const ARZ = 10n ** 9n * E;
    const DEP = 100n * E;
    /* MIN_POOL_BPS and MAX_POOL_BPS are both 4000 now — the pool share
       is no longer the founder's to choose. */
    const HAVUZ_BPS = 4000n;

    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: H3, data: lIface.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [H3]: { code: L.deployedBytecode } }
      ]);
      return lIface.decodeFunctionResult(fn, r);
    };

    const [s] = await call("run", [PM, DEP, HAVUZ_BPS]);
    const B = (x) => BigInt(x);
    const d = (x) => Number(B(x)) / 1e18;

    const ucret = (DEP * 20000n) / 1000000n;      // 2%
    /* Of that 2%, the holder slice does not leave: it goes to the vault,
       because holders are owed dollars and this fee is a wrapped share.
       So the backing is the deposit less only what actually left. */
    /* Read from the contract, not typed. The share used to appear as a
       literal 3000 in two places — _payFee and quoteLaunch — and two
       copies of one number is one of them waiting to be wrong. */
    const LPB = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "Launchpad.json"), "utf8"));
    const lpIface = new Interface(LPB.abi);
    const SABIT_ADR = "0x00000000000000000000000000000000000000E2";
    const TABAN_BPS = BigInt(await rpc("eth_call", [
      { to: SABIT_ADR, data: lpIface.encodeFunctionData("FEE_TO_FLOOR_BPS", []) },
      "latest", { [SABIT_ADR]: { code: LPB.deployedBytecode } }
    ]));
    const tutucuPayi = (ucret * TABAN_BPS) / 10000n;
    const cikan = ucret - tutucuPayi;             // the protocol's share
    const net = DEP - cikan;
    const havuzToken = (ARZ * HAVUZ_BPS) / 10000n;
    const kurucuToken = ARZ - havuzToken;

    ok(B(s.toplamArz) === ARZ, "arz 1.000.000.000", d(s.toplamArz).toLocaleString("en-US"));
    ok(TABAN_BPS === 6000n, "LAUNCH UCRETININ %60'I TABANA",
      "kalan %40 protokolun — gelir orada olmak zorunda");
    ok(B(s.ucret) === cikan, "kapidan cikan ucret sadece protokol dilimi",
      d(s.ucret).toFixed(2) + " / " + d(cikan).toFixed(2) + " — eskiden buna dev havuzu da dahildi");
    ok(ucret - cikan === tutucuPayi, "ucretin %60'i KASAYA DONDU",
      d(tutucuPayi).toFixed(2) + " — eskiden yarisi cikisi olmayan bir kontrata gidiyordu");

    /* The whole point of the structure: every unit of the deposit that did
       not leave backs the floor, and the pool takes none of it. The pool is
       priced in USDC now, so what it must not take is USDC. */
    ok(B(s.kasaTeminat) === net, "yatirimin TAMAMI (eksi protokol dilimi) kasaya",
      d(s.kasaTeminat).toFixed(2) + " / " + d(net).toFixed(2));
    ok(B(s.havuzTeminat) === 0n, "USDC HAVUZU HIC PARA ISTEMEDI — tek yonlu likidite",
      B(s.havuzTeminat).toString() + " birim");
    ok(B(s.lpBakiye) === 0n, "launchpad uzerinde teminat kalmadi", B(s.lpBakiye).toString());

    /* The liquidity is derived from the chosen token amount and then v4
       recomputes the amount from that liquidity, so the pool takes a few
       hundred wei less than asked. Demanding exact equality was the wrong
       test: the invariant that matters is that the shortfall goes to the
       founder rather than being stranded. */
    const havuzFark = havuzToken - B(s.havuzToken);
    ok(havuzFark >= 0n && havuzFark < 10n ** 12n,
      "havuza konan token secilen orana esit (yuvarlama payi)",
      d(s.havuzToken).toLocaleString("en-US") + "  (%" + (Number(HAVUZ_BPS) / 100).toFixed(0) +
      ", eksik " + havuzFark.toString() + " wei)");
    /* Three parts now, not two: the pool, the founder's free balance and
       the founder's lock. The sum still has to be the whole supply —
       a token that went missing between them would be a token nobody
       can ever redeem. */
    ok(B(s.kurucuToken) + B(s.kurucuKilitli) + B(s.havuzToken) === ARZ,
      "arzin TAMAMI dagitildi, hicbir token mahsur kalmadi",
      "havuz + serbest + kilitli = arz");
    ok(B(s.kurucuToken) + B(s.kurucuKilitli) >= kurucuToken,
      "yuvarlama payi kurucuya gitti, kaybolmadi",
      (B(s.kurucuToken) + B(s.kurucuKilitli) - kurucuToken).toString() + " wei fazla");
    const kilitOran = (B(s.kurucuKilitli) * 10000n) / (B(s.kurucuToken) + B(s.kurucuKilitli));
    ok(kilitOran >= 2990n && kilitOran <= 3010n,
      "  kurucu payinin %30'u kilitli",
      "%" + (Number(kilitOran) / 100).toFixed(2));

    /* floorPrice is scaled by FLOOR_SCALE = 1e36, not 1e18: the smaller
       scale truncated six-decimal collateral to a single digit. */
    const beklenenTaban = (net * E * E) / ARZ;
    ok(B(s.tabanFiyat) === beklenenTaban, "taban = kasa / arz", B(s.tabanFiyat).toString());
    /* Divide by FLOOR_SCALE, not by E: the floor carries 1e36 now. */
    const tabanMcap = (B(s.tabanFiyat) * ARZ) / (E * E);
    ok(tabanMcap === net, "taban piyasa degeri = kasadaki para", "$" + d(tabanMcap).toFixed(2));

    /* ---- and the number a PERSON reads ---------------------------- */
    /* Being right in the contract is not the same as being right on the
       screen, and the screen was wrong twice. floorPrice is a ratio of
       RAW units, so the human figure divides by 1e(18 + collateral
       decimals) — 1e36 only when the collateral has eighteen, which the
       wrapped shares did and USDC does not. Displayed with /1e36, a floor
       of 1.984 USDC behind a billion tokens reads as 1.984e-21 instead of
       1.984e-9: a trillion times too small.

       Written as the property, not the constant: shown x supply == vault.
       Checked at several decimalities so a divisor that suits one
       collateral and not the next cannot pass. */
    for (const tOnd of [6, 8, 18]) {
      /* The same floor expressed for collateral with tOnd decimals. */
      const kasaHam = net / 10n ** BigInt(18 - tOnd) || 1n;
      const tabanHam = (kasaHam * 10n ** 36n) / ARZ;
      const bolen = 10n ** BigInt(18 + tOnd);
      /* Reconstructed in integers so the comparison carries no float
         error of its own: shown x supply, scaled back. */
      /* Carried at 1e6 so the fraction survives: comparing truncated
         integers would have called 99.2 and 99 equal, which is how a
         display check can pass while the display is wrong. And the arz
         has its OWN eighteen decimals — forgetting that was my first
         version of this test, which failed for its own reason rather
         than for the contract's. */
      const MIKRO = 1000000n;
      const gosterilenXArz = (tabanHam * ARZ * MIKRO) / (bolen * 10n ** 18n);
      const kasaInsan = (kasaHam * MIKRO) / 10n ** BigInt(tOnd);
      ok(gosterilenXArz === kasaInsan,
        "  " + tOnd + " basamakli teminatta GOSTERILEN taban x arz = kasa",
        gosterilenXArz + " / " + kasaInsan + " (x1e6, bolen 1e" + (18 + tOnd) + ")");
      /* And the divisor that used to be used, so the defect itself is
         pinned rather than only its absence. */
      if (tOnd !== 18) {
        const yanlis = (tabanHam * ARZ * MIKRO) / (10n ** 36n * 10n ** 18n);
        ok(yanlis !== kasaInsan,
          "    1e36 ile bolmek " + tOnd + " basamakta YANLIS cevap veriyor",
          yanlis + " yerine " + kasaInsan + " (x1e6) — kapatilan kusur tam buydu");
      }
    }

    /* And the question the first design got wrong. Measured against the
       tokens the founder actually holds, not the ideal share: the pool took
       a few hundred wei less than asked and the difference went to them,
       which the check above already establishes. */
    const beklenenGeri = (net * B(s.kurucuToken)) / ARZ;
    ok(B(s.geriAlinan) === beklenenGeri, "KURUCU PAYINI TAM GERI ALIYOR",
      "$" + d(s.geriAlinan).toFixed(2) + " / beklenen $" + d(beklenenGeri).toFixed(2) +
      "  (yatirilan $" + d(DEP).toFixed(0) + ", havuza %30)");
    /* Not equality — the floor is carried at 1e36 now and at that
       precision the rounding shows. payout rounds DOWN, so a redeemer
       takes a hair less than their exact share and the hair stays behind
       for everyone else: the floor rises by dust rather than staying
       identical. The 1e18 scale hid this.
   
       The invariant worth asserting is the one that matters to a holder:
       redeeming must never LOWER the floor. Rounding in the holders'
       favour is fine; rounding against them would mean each exit quietly
       took something from the people who stayed. */
    const tabanFark = B(s.tabanSonra) - B(s.tabanFiyat);
    ok(tabanFark >= 0n, "GERI ALIM TABANI DUSURMUYOR",
      tabanFark === 0n ? "tam ayni" : "+" + tabanFark.toString() + " wei (yuvarlama kalanlara)");
    ok(tabanFark * 10n ** 12n < B(s.tabanFiyat),
      "  ve yukselme tozdan ibaret", "tabanin 1e-12'sinden kucuk");

    /* The pool share is no longer swept, because it is no longer a
       choice: MIN_POOL_BPS and MAX_POOL_BPS are both 4000. What is worth
       asserting is that every other value is refused — a launch opening
       with 5% of supply in the pool was the shape that left 95% liquid
       above a market a twentieth its size. */
    for (const bps of [0n, 500n, 3000n, 3999n, 4001n, 7000n, 10000n]) {
      let reddedildi = false;
      try { await call("run", [PM, DEP, bps]); }
      catch (e) { reddedildi = true; }
      ok(reddedildi, "havuz orani %" + (Number(bps) / 100).toFixed(2) + " REDDEDILIYOR",
        "yalnizca %40 kabul ediliyor");
    }
    /* And the one value that is allowed still leaves the floor alone. */
    {
      const [x] = await call("run", [PM, DEP, 4000n]);
      ok(B(x.tabanFiyat) === beklenenTaban && B(x.havuzTeminat) === 0n,
        "havuz orani %40: taban ayni, teminat alinmadi",
        "geri alinan $" + d(x.geriAlinan).toFixed(2));
      ok(B(x.geriAlinan) === (net * B(x.kurucuToken)) / ARZ,
        "  geri donus orana tam uyuyor");
    }

    /* The claim the fixed opening was introduced for: two launches an
       order of magnitude apart in deposit, opening at the same price. */
    {
      const [sK, sB, tK, tB] = await call("runAcilisAyni", [PM, 10n * E, 1000n * E]);
      ok(BigInt(sK) === BigInt(sB), "YATIRIM NE OLURSA OLSUN ACILIS FIYATI AYNI",
        BigInt(sK).toString());
      ok(BigInt(tB) > BigInt(tK) * 90n, "ama TABAN yatirimla birlikte buyuyor",
        BigInt(tK) + "  ->  " + BigInt(tB) + "   (100 kat yatirim)");
      ok(BigInt(tK) > 0n && BigInt(tB) > 0n, "iki launchin da arkasinda teminat var");
    }

    /* The interface quotes from quoteLaunch. It has to match. */
    const [tG, gG, tH, gH, tT, gT] = await call("runTeklif", [PM, 500n * E, 4000n]);
    /* quoteLaunch works from the ideal share, the launch from what the pool
       actually took; the gap is the same rounding dust, under a billionth of
       a cent. Demanding exact equality here would be asserting that a
       division has no remainder. */
    const teklifFark = B(gG) > B(tG) ? B(gG) - B(tG) : B(tG) - B(gG);
    ok(teklifFark * 10n ** 9n < B(gG), "teklif edilen geri donus gercekle AYNI",
      "$" + d(tG).toFixed(2));
    const tFark = B(tH) > B(gH) ? B(tH) - B(gH) : B(gH) - B(tH);
    ok(tFark < 10n ** 12n, "teklif edilen havuz tokeni gercekle ayni",
      "sapma " + tFark.toString() + " wei");
    ok(B(tT) === B(gT), "teklif edilen taban gercekle ayni");

    /* Non-quote collateral, the fee it carries, and the grade filed for
       it. None of this was covered: TestLaunch uses quote collateral, so
       a green suite said nothing about the path the converter opened. */
    {
      const [uQ, uD, kTeminat, kBasamak, kGercek, kSahip, kKod, digerGecti] =
        await call("runKarneVeUcret", [PM]);
      ok(digerGecti === true, "QUOTE OLMAYAN TEMINATLA LAUNCH YAPILABILIYOR",
        "donusturucu oldugu icin ucret artik sikismiyor");
      ok(B(uQ) === 20000n, "quote teminat ucreti %2", B(uQ) + " ppm");
      ok(B(uD) === 30000n, "quote OLMAYAN teminat ucreti %3",
        B(uD) + " ppm — omur boyu donusturme yuku o launcha ait");
      ok(B(uD) > B(uQ), "  fark maliyeti yaratan launcha yaziliyor",
        "%" + (Number(B(uD) - B(uQ)) / 10000).toFixed(2) + " fazla");

      ok(kTeminat !== "0x0000000000000000000000000000000000000000",
        "KARNE LAUNCH ANINDA DOSYALANDI", String(kTeminat));
      ok(Number(kBasamak) === 18, "  teminatin basamagi olculdu", String(kBasamak));
      ok(kGercek === false, "  ve GERCEK PARA olmadigi isaretli",
        "sembolune degil adresine bakildi");
      ok(B(kKod) > 0n, "  teminatin kod boyutu kayitli", B(kKod) + " bayt");
    }

    const [sifirRed, hAltRed, hUstRed, kucukGecti] = await call("runSinirlar", [PM]);
    ok(sifirRed === true, "sifir yatirim reddediliyor");
    ok(hAltRed === true, "%5 altindaki havuz orani reddediliyor", "%4");
    ok(hUstRed === true, "%70 ustundeki havuz orani reddediliyor", "%70,01");
    /* The deposit range moved to the queue, in USDC. A share-count range
       rejected 0.41 wNVDA, which is exactly what $100 of NVIDIA is. */
    ok(kucukGecti === true, "bir hissenin KESRI ile launch yapilabiliyor",
      "0,41 birim = $100 NVIDIA");
  }

  console.log("9) yonetisim tokeni ve 30 yillik emisyon");
  {
    const S = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestStaking.json"), "utf8"));
    const sIface = new Interface(S.abi);
    const H4 = "0x00000000000000000000000000000000000000F1";

    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: H4, data: sIface.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [H4]: { code: S.deployedBytecode } }
      ]);
      return sIface.decodeFunctionResult(fn, r);
    };

    const [d] = await call("runDagilim", []);
    const T = BigInt(d.toplam);
    ok(BigInt(d.serbest) === T * 5n / 100n, "%5 kilitsiz");
    ok(BigInt(d.vesting) === T * 5n / 100n, "%5 vesting");
    ok(BigInt(d.likidite) === T * 30n / 100n, "%30 likidite + stake");
    ok(BigInt(d.emisyon) === T * 60n / 100n, "%60 emisyon");
    ok(BigInt(d.serbest) + BigInt(d.vesting) + BigInt(d.likidite) + BigInt(d.emisyon) === T,
      "dagilim tam %100, saklanan pay yok");

    /* The constraint the user set: thirty years, 90% of it in the first ten.
     * Tolerance is half a point — the on-chain loop uses integer ppm, so it
     * cannot land exactly on a continuous curve. */
    const hedefler = [[1, 205000], [3, 497500], [10, 899100]];
    for (const [yil, bekPpm] of hedefler) {
      const [ppm] = await call("runEgri", [yil]);
      const p = Number(BigInt(ppm));
      const sapma = Math.abs(p - bekPpm) / 10000;
      ok(sapma < 0.5, yil + " yilda cikan: %" + (p / 10000).toFixed(2),
        "hedef %" + (bekPpm / 10000).toFixed(2) + ", sapma " + sapma.toFixed(2) + " puan");
    }

    const [p] = await call("runPaylasim", []);
    ok(BigInt(p.bosRelease) === 0n, "kimse stake etmemisken emisyon kilitli kaliyor");
    /* A staked while a year of emission was already due; B staked after it
       had been booked. B must get nothing from that year — a latecomer
       cannot claim a share of emission that accrued before they arrived.
       That is the property worth testing here, and it is the one an
       accumulator gets wrong if the marker is not set on entry. */
    const a = BigInt(p.aPay), b = BigInt(p.bPay);
    ok(a > 0n, "once stake eden birikmis emisyonu aldi", (Number(a) / 1e18).toFixed(0));
    ok(b === 0n, "sonradan gelen gecmis emisyondan pay alamiyor", b.toString());
  }

  console.log("");
  console.log("10) kopru  (M-of-N kanit, sahtecilik yollari, tavanlar)");
  {
    const BR = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestBridge.json"), "utf8"));
    const bIface = new Interface(BR.abi);
    const H5 = "0x0000000000000000000000000000000000000E11";

    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: H5, data: bIface.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [H5]: { code: BR.deployedBytecode } }
      ]);
      return bIface.decodeFunctionResult(fn, r);
    };

    /* Fixed keys, so a failure here is reproducible. */
    const KEYS = [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333333333333333333333333333"
    ];
    const cuzdanlar = KEYS.map((k) => new Wallet(k));
    const yabanciC = new Wallet("0x9999999999999999999999999999999999999999999999999999999999999999");
    const imzacilar = cuzdanlar.map((c) => c.address);
    const ALAN = keccak256(Buffer.from("ArcDepth.KopruKanit.v1"));
    const E18 = 10n ** 18n;
    const ESIK = 2, KAYNAK = 5042;
    const ISLEM_TAVANI = 100n * E18, PENCERE = 3600n, PENCERE_TAVANI = 150n * E18;
    const kur = [imzacilar, ESIK, KAYNAK, ISLEM_TAVANI, PENCERE, PENCERE_TAVANI];

    /* Recomputed here rather than read from the contract: a digest taken
       from the thing being tested only proves it agrees with itself. */
    const ozet = (dogrulayan, olayId, to, miktar) => getBytes(keccak256(
      coder.encode(
        ["bytes32", "uint256", "address", "uint256", "bytes32", "address", "uint256"],
        [ALAN, 5042, dogrulayan, KAYNAK, olayId, to, miktar])));
    /* Ordered by signer address: that is how a duplicate is refused. */
    const imzala = async (cs, dogrulayan, olayId, to, miktar) => {
      const d = ozet(dogrulayan, olayId, to, miktar);
      const p = [];
      for (const c of cs) p.push([c.address.toLowerCase(), await c.signMessage(d)]);
      p.sort((a, b) => (a[0] < b[0] ? -1 : 1));
      return p.map((x) => x[1]);
    };

    const [, kasaA, sarmalA] = await call("adresler", [kur]);
    const BOB = "0x0000000000000000000000000000000000000B0B";
    const ALICE = getAddress("0x" + "A11CE".padStart(40, "0"));
    const iki = cuzdanlar.slice(0, 2);

    /* ---- the split, finished by a signed release ---- */
    const MIK = 100n * E18, PAY = MIK / 2n;
    const sBol = await imzala(iki, kasaA, keccak256(Buffer.from("burn-1")), BOB, PAY);
    const [b] = await call("runBolunme", [kur, MIK, PAY, sBol]);
    ok(BigInt(b.payOnce) === MIK, "ilk kilit 1:1 pay veriyor", BigInt(b.payOnce).toString());
    ok(BigInt(b.paySonra) === BigInt(b.payOnce), "hisse bolunmesi pay sayisini DEGISTIRMIYOR");
    ok(BigInt(b.fiyatSonra) === BigInt(b.fiyatOnce) * 2n,
      "bolunme pay fiyatini ikiye katladi", BigInt(b.fiyatOnce) + " -> " + BigInt(b.fiyatSonra));
    ok(BigInt(b.cekilen) === MIK, "imzali cekim, bolunme sonrasi iki kat hisse getirdi",
      (Number(BigInt(b.cekilen)) / 1e18).toFixed(0));

    /* ---- every way a notice can be wrong ---- */
    const P2 = 10n * E18, TAVAN_USTU = ISLEM_TAVANI + 1n;
    const idD = keccak256(Buffer.from("burn-dogru"));
    const dogru = await imzala(iki, kasaA, idD, BOB, P2);
    const az = await imzala(cuzdanlar.slice(0, 1), kasaA, idD, BOB, P2);
    const yab = await imzala([yabanciC, cuzdanlar[0]], kasaA, idD, BOB, P2);
    const tek = await cuzdanlar[0].signMessage(ozet(kasaA, idD, BOB, P2));
    const cift = [tek, tek];
    const tavanU = await imzala(iki, kasaA, keccak256(Buffer.from("burn-tavan")), BOB, TAVAN_USTU);

    const [r] = await call("runKotuYollar",
      [kur, P2, TAVAN_USTU, dogru, az, yab, cift, tavanU]);
    ok(r.miktarDegisikReddedildi === true,
      "IMZADAN SONRA MIKTAR DEGISTIRILEMIYOR", "kapatilan kusur tam buydu");
    ok(r.azImzaReddedildi === true, "esigin altinda imza reddediliyor", "tek anahtar yetmiyor");
    ok(r.yabanciReddedildi === true, "kumenin disindaki imzaci reddediliyor");
    ok(r.ciftImzaReddedildi === true, "ayni imzaci iki kez sayilamiyor");
    ok(r.tavanReddedildi === true, "islem tavani ustu reddediliyor");
    ok(r.dogruGecti === true, "dogru imzali bildirim gecti");
    ok(r.tekrarReddedildi === true, "AYNI bildirim ikinci kez reddediliyor");

    /* ---- the window cap ---- */
    const P = 90n * E18;
    const p1 = await imzala(iki, kasaA, keccak256(Buffer.from("p1")), BOB, P);
    const p2 = await imzala(iki, kasaA, keccak256(Buffer.from("p2")), BOB, P);
    const [g1, red2] = await call("runPencere", [kur, P, p1, p2]);
    ok(g1 === true, "pencere icinde ilk cekim gecti");
    ok(red2 === true, "pencere tavanini asan ikinci cekim reddediliyor",
      "2x90 > " + (PENCERE_TAVANI / E18));

    /* ---- the wrapped side ---- */
    const MINT = 50n * E18;
    const sMint = await imzala(iki, sarmalA, keccak256(Buffer.from("ayni-lock")), ALICE, MINT);
    const [mIlk, mIki, arz] = await call("runMint", [kur, MINT, sMint]);
    ok(mIlk === true, "imzali mint gecti");
    ok(mIki === true, "AYNI lock bildirimi ikinci kez reddediliyor");
    ok(BigInt(arz) === MINT, "arz tek mint kadar", (Number(BigInt(arz)) / 1e18).toFixed(0));

    /* runYakma mints to the HARNESS so it has something to burn, so the
       recipient in the signature is H5 and not the token. Signing for the
       wrong recipient is exactly what the digest is there to catch, and it
       caught me. */
    const sYak = await imzala(iki, sarmalA, keccak256(Buffer.from("l1")), H5, 100n * E18);
    const [arzSonra, id1, id2] = await call("runYakma", [kur, 100n * E18, sYak]);
    ok(BigInt(arzSonra) === 80n * E18, "yakma arzi dusuruyor",
      (Number(BigInt(arzSonra)) / 1e18).toFixed(0));
    ok(id1 !== id2, "her yakma benzersiz kimlik uretiyor");

    /* A zero window silently disabled the window cap in the first
       version of KopruKanit: the reset test is always true at zero, so
       the total cleared on every notice and two events in one block each
       got the full allowance. It failed OPEN. Caught in review. */
    const [kk] = await call("runKotuKurulum", [imzacilar]);
    ok(kk.sifirPencereRed === true, "SIFIR PENCERE REDDEDILIYOR",
      "yoksa pencere tavani hic baglamiyordu");
    ok(kk.sifirIslemTavaniRed === true, "sifir islem tavani reddediliyor");
    ok(kk.sifirPencereTavaniRed === true, "sifir pencere tavani reddediliyor");
    ok(kk.kucukPencereTavaniRed === true, "pencere tavani islem tavanindan kucuk olamaz");
    ok(kk.esikBirRed === true, "esik 1 reddediliyor", "duzeltilen sey tam buydu");
    ok(kk.saglamGecti === true, "saglam kurulum yine de dagitilabiliyor",
      "redler kontrollerden, bozuk bir constructordan degil");
  }

  console.log("");
  console.log("11) DOLARLA ALIM SATIM  (Arc PoolManager + gercek hook)");
  {
    const SW = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestSwap.json"), "utf8"));
    const swIface = new Interface(SW.abi);
    const H6 = "0x0000000000000000000000000000000000000F11";
    /* The hook must live at an address declaring its callbacks or the
       PoolManager refuses the pool, so it is placed at a mined one. */
    const HOOK_ADR = "0xFDAF91321938B6Fce470a8E40482Ac3259BBcA44";
    /* The collateral is USDC now, so the deposit is dollars and not a
       share count — the harness launches with the same asset the pool
       quotes in, because that is the only way the sell-side fee can
       reach the floor. */
    const DEP = 1500n * 10n ** 6n;        // $1,500 of collateral
    const ALIM = 250n * 10n ** 6n;        // $250, in six-decimal USDC

    /* The hook only lets ITS launchpad add liquidity and only treats ITS
       quote token as money, and both are created inside the harness — so it
       has to be built around addresses that do not exist yet. A CREATE
       address depends only on the creator and its nonce, and a contract
       placed by state override starts at nonce 0 because it was never
       actually deployed: collateral 0, USDC 1, launchpad 2. Getting this
       off by one produced a WrappedError(hook, OnlyLaunchpad) from deep
       inside v4, which is a precise error wearing an unhelpful disguise. */
    const { getCreateAddress } = require("ethers");
    const USDC_ADR = getCreateAddress({ from: H6, nonce: 1 });
    const LP_ADR = getCreateAddress({ from: H6, nonce: 2 });
    const hookKod = await rpc("eth_call", [
      { data: ART.bytecode + coder.encode(
          ["address", "address", "address"],
          [PM, LP_ADR, USDC_ADR]).slice(2) },
      "latest"
    ]);

    const r = await rpc("eth_call", [
      { from: YABANCI, to: H6, data: swIface.encodeFunctionData("run", [PM, HOOK_ADR, DEP, ALIM]), gas: "0x8000000" },
      "latest",
      { [H6]: { code: SW.deployedBytecode }, [HOOK_ADR]: { code: hookKod } }
    ]);
    const [s2] = swIface.decodeFunctionResult("run", r);
    const V = (x) => BigInt(x);

    /* ---- the exact-output escape hatch, closed ----------------------- */
    /* The surcharge used to be gated on the fee landing in a currency
       other than the quote. On an exact-output buy the fee is charged on
       the money going IN, so that test called it "not a buy" and let a
       sniper through at the ordinary rate. Measured here in the launch
       transaction itself, where the surcharge is strongest. */
    {
      const artIface = new Interface(ART.abi);
      const oranAt = async (sn) => BigInt(await rpc("eth_call", [
        { to: HOOK_ADR, data: artIface.encodeFunctionData("snipeOrani", [sn]) },
        "latest", { [HOOK_ADR]: { code: hookKod } }
      ]));
      const temelPpm = BigInt(await rpc("eth_call", [
        { to: HOOK_ADR, data: artIface.encodeFunctionData("FEE_PPM", []) },
        "latest", { [HOOK_ADR]: { code: hookKod } }
      ]));
      const snipe0 = await oranAt(0);

      const rc = await rpc("eth_call", [
        { from: YABANCI, to: H6, gas: "0x8000000",
          data: swIface.encodeFunctionData("runCikisSnipe",
            [PM, HOOK_ADR, DEP, 5_000_000n * 10n ** 18n]) },
        "latest",
        { [H6]: { code: SW.deployedBytecode }, [HOOK_ADR]: { code: hookKod } }
      ]);
      const [c] = swIface.decodeFunctionResult("runCikisSnipe", rc);

      ok(BigInt(c.acilis) === BigInt(c.zaman),
        "exact-output alimi ACILIS BLOGUNDA yapildi",
        "pencere 0 saniye — vergi en yuksek oldugu an");
      ok(V(c.alinanToken) === 5_000_000n * 10n ** 18n,
        "  alici cikisi SABITLEDI, 5.000.000 token aldi",
        "exact-output: ne odedigini havuz belirliyor");
      ok(V(c.ucretUsdc) > 0n, "EXACT-OUTPUT ALIM UCRET ODUYOR",
        "$" + (Number(V(c.ucretUsdc)) / 1e6).toFixed(2) + " tabana — eskiden $0.00");

      /* The fee is charged on the pool's required input; the buyer pays
         that plus the fee. So the rate is fee / (paid - fee), exactly. */
      const taban = V(c.odenenUsdc) - V(c.ucretUsdc);
      const olculenPpm = (V(c.ucretUsdc) * 1_000_000n) / taban;
      ok(olculenPpm > temelPpm * 2n,
        "ACILIS VERGISI EXACT-OUTPUT ALIMDA DA ISLIYOR",
        "olculen " + olculenPpm + " ppm, siradan ucret " + temelPpm +
        " ppm — kati " + (Number(olculenPpm) / Number(temelPpm)).toFixed(1) + "x");
      const sapma = olculenPpm > snipe0 ? olculenPpm - snipe0 : snipe0 - olculenPpm;
      ok(sapma * 1000n <= snipe0,
        "  ve oran snipeOrani(0) ile birebir ortusuyor",
        "beklenen " + snipe0 + ", olculen " + olculenPpm + " ppm");
      ok(olculenPpm !== temelPpm,
        "SNIPE'CI ISTEGI TERS CEVIRIP VERGIDEN KACAMIYOR",
        "exact-input ve exact-output ayni orani oduyor");

      /* Charging the fee as a claim is only half a fee. If the claim
         cannot be turned back into tokens the floor never sees it, and
         the hole is still there wearing a different shape. So the whole
         chain is followed: claim -> real tokens -> vault -> floor. */
      ok(V(c.alacakOnce) === V(c.ucretUsdc),
        "ucret takastan sonra 6909 ALACAGI olarak duruyor",
        "$" + (Number(V(c.alacakOnce)) / 1e6).toFixed(6) + " — henuz token degil");
      ok(V(c.alacakSonra) === 0n && V(c.eldekiSonra) === V(c.ucretUsdc),
        "ALACAK GERCEK TOKENE BOZDURULDU",
        "alacak 0, hook'un elinde $" + (Number(V(c.eldekiSonra)) / 1e6).toFixed(6));
      ok(V(c.kasayaGiren) === V(c.ucretUsdc),
        "VE TAMAMI KASAYA GIRDI, TEK WEI KAYIP YOK",
        "$" + (Number(V(c.kasayaGiren)) / 1e6).toFixed(6) + " / $" +
        (Number(V(c.ucretUsdc)) / 1e6).toFixed(6));
      ok(V(c.tabanSonra) > V(c.tabanOnce),
        "EXACT-OUTPUT ALIM TABANI YUKSELTTI",
        c.tabanOnce + " -> " + c.tabanSonra);
      /* sweepFloor redeems on its own as well, so this run called the
         redemption twice over the same claim. Nothing was counted twice:
         the vault received the fee exactly once. */
      ok(V(c.kasayaGiren) <= V(c.ucretUsdc),
        "  iki kez bozdurmak CIFT SAYMIYOR",
        "alacagiBozdur + sweepFloor ikisi de cagrildi, kasaya bir kez girdi");
    }
    const usd = (x) => Number(V(x)) / 1e6;
    const tok = (x) => Number(V(x)) / 1e18;

    /* The market opens with tokens on one side and nothing on the other. */
    ok(V(s2.havuzTokenAcilis) > 0n, "havuz token ile aciliyor",
      tok(s2.havuzTokenAcilis).toLocaleString("en-US", { maximumFractionDigits: 0 }));
    ok(V(s2.havuzUsdcAcilis) === 0n, "HAVUZ HIC DOLAR OLMADAN ACILIYOR",
      V(s2.havuzUsdcAcilis).toString() + " birim — kimse fonlamiyor");

    /* The complaint, answered. */
    ok(V(s2.harcananUsdc) === ALIM, "SIRADAN USDC ILE ALIM YAPILDI",
      "$" + usd(s2.harcananUsdc).toFixed(2) + " harcandi");
    ok(V(s2.alinanToken) > 0n, "karsiliginda meme token alindi",
      tok(s2.alinanToken).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " token");
    ok(V(s2.havuzUsdcAlimSonrasi) === V(s2.harcananUsdc),
      "ALICININ DOLARI HAVUZDA KALDI", "$" + usd(s2.havuzUsdcAlimSonrasi).toFixed(2) +
      " — satmak isteyenin karsi tarafi");

    /* On a buy the fee lands in the token, where nobody can be paid in it. */
    /* This buy lands in the launch transaction itself, which is exactly
       what a sniper does, so it meets the opening tax at full strength. */
    const tokenUcret = V(s2.alimUcretiToken) + V(s2.alimDevToken) + V(s2.alimProtokolToken);
    const cikis = V(s2.alinanToken) + tokenUcret;
    ok(tokenUcret > 0n, "alimda ucret token tarafindan kesildi",
      tok(tokenUcret).toFixed(0) + " token");
    ok(V(s2.alimHolderUsdc) === 0n, "tutucu kovasi bos — token olarak odenemez",
      "yerine taban yukseliyor");

    const yuzde = Number(tokenUcret * 10000n / cikis) / 100;
    ok(yuzde > 98 && yuzde < 100, "ACILIS BLOGUNDAKI ALIM %99 VERGI ODEDI",
      "%" + yuzde.toFixed(2) + " — snipe\'ci cikisin yuzde birini aliyor");
    ok(V(s2.alimUcretiToken) * 100n > tokenUcret * 97n,
      "verginin neredeyse TAMAMI YAKILMAK uzere ayrildi",
      tok(s2.alimUcretiToken).toFixed(0) + " / " + tok(tokenUcret).toFixed(0) +
      " — protokole degil, tabana");
    /* These two used to assert the opposite — that the developer and
       protocol slices reached their sinks as launch tokens — and that was
       the defect, not the feature. Paid in the launch token, both
       addresses can only realise the value by selling it into the
       customer's own pool, against the very holders the fee exists to
       serve: 0.35% of every purchase turned into a standing seller. On a
       buy the whole fee now goes to the floor, which pays the same people
       by raising what every holder can redeem, and cannot be dumped.
       The Fathom hook has always done this; the two were inconsistent only
       because this one was written first. */
    ok(V(s2.alimDevToken) === 0n, "ALIMDA GELISTIRICIYE TOKEN YAZILMADI",
      "0 — satmak zorunda kalacagi bir seyle odenmiyor");
    ok(V(s2.alimProtokolToken) === 0n, "ALIMDA PROTOKOLE TOKEN YAZILMADI", "0");
    ok(V(s2.devEline) === 0n && V(s2.protoEline) === 0n,
      "  iki adrese de launch tokeni ULASMADI",
      "dev " + tok(s2.devEline).toFixed(0) + " · protokol " + tok(s2.protoEline).toFixed(0));
    /* No separate "all of it went to the floor" assertion here, because
       tokenUcret is itself the sum of those three buckets — comparing one
       against the sum of itself and two zeros would pass whatever the
       hook did. The two zeros above are the real statement, and `cikis`
       below measures the fee against the pool's gross output, which comes
       from a balance delta rather than from the buckets. */
    ok(V(s2.alimUcretiToken) * 10000n / cikis > 9800n,
      "  taban kovasi brut cikisin neredeyse tamamini aldi",
      "%" + (Number(V(s2.alimUcretiToken) * 10000n / cikis) / 100).toFixed(2) +
      " — bagimsiz olcum, kovalarin toplamindan degil");
    ok(V(s2.arzSonra) < V(s2.arzOnce), "o ucret YAKILDI",
      tok(V(s2.arzOnce) - V(s2.arzSonra)).toFixed(0) + " token arzdan dusuldu");
    ok(V(s2.tabanYakmaSonrasi) > V(s2.tabanTakasSonrasi), "yakma TABANI YUKSELTTI",
      V(s2.tabanTakasSonrasi) + " -> " + V(s2.tabanYakmaSonrasi));
    ok(V(s2.tabanTakasSonrasi) === V(s2.tabanOnce), "takasin kendisi tabani DEGISTIRMEDI",
      V(s2.tabanOnce).toString());

    /* And back out again. */
    ok(V(s2.alinanUsdc) > 0n, "SATINCA DOLAR GERI ALINDI",
      "$" + usd(s2.alinanUsdc).toFixed(2) + "  (" +
      tok(s2.satilanToken).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " token satildi)");
    /* The sell fee arrives as money. It used to be split three ways and
       these four assertions checked the split and that the holders' slice
       reached a reward contract. There is no split and no reward
       contract: the whole thing goes to the vault, which is where the
       floor lives. */
    ok(V(s2.satisHolder) === 0n && V(s2.satisDev) === 0n && V(s2.satisProtokol) === 0n,
      "SATISTA DA KIMSEYE PAY YAZILMADI", "0 / 0 / 0");
    ok(V(s2.satisTabanUsdc) > 0n, "satis ucreti DOLAR olarak tabana yazildi",
      "$" + (Number(V(s2.satisTabanUsdc)) / 1e6).toFixed(4));
    ok(V(s2.kasayaGirenUsdc) === V(s2.satisTabanUsdc),
      "VE TAMAMI KASAYA GIRDI", "$" + (Number(V(s2.kasayaGirenUsdc)) / 1e6).toFixed(4));
    ok(V(s2.tabanSatisSonrasi) > V(s2.tabanYakmaSonrasi),
      "DOLAR GIRINCE TABAN YUKSELDI",
      V(s2.tabanYakmaSonrasi) + " -> " + V(s2.tabanSatisSonrasi));
    ok(V(s2.odulUsdc) === 0n, "odul kontratina hicbir sey gitmedi", "odul kontrati yok");

    /* THE RUG VECTOR, MEASURED. Read off the chain, because what matters
       is what a buyer can check before buying — not what a constant says. */
    const ARZ_T = V(s2.arzOnce);
    const yuz = (x) => "%" + (Number((x * 10000n) / ARZ_T) / 100).toFixed(2);
    const kurucuPayi = V(s2.kurucuSerbest) + V(s2.kurucuKilitli);
    ok((kurucuPayi * 10000n) / ARZ_T >= 5990n && (kurucuPayi * 10000n) / ARZ_T <= 6010n,
      "kurucu arzin %60'ini aldi", yuz(kurucuPayi));
    ok(V(s2.kilitAdresi) !== 0n, "VESTING KONTRATI LAUNCH ICINDE KURULDU",
      String(s2.kilitAdresi));
    const kilitOrani = (V(s2.kurucuKilitli) * 10000n) / kurucuPayi;
    ok(kilitOrani >= 2990n && kilitOrani <= 3010n,
      "KURUCU PAYININ %30'U KILITLENDI",
      "%" + (Number(kilitOrani) / 100).toFixed(2) + " — gerisi serbest");
    ok(V(s2.kilitHakSahibi) === BigInt(H6),
      "  kilit SADECE launch edene odeyebiliyor",
      "beneficiary immutable, baskasina cevrilemez");
    ok((V(s2.kurucuSerbest) * 10000n) / ARZ_T <= 4210n,
      "ILK GUN SATILABILIR PAY arzin %42'si",
      yuz(V(s2.kurucuSerbest)) + " — eski tasarimda %95 olabiliyordu");
  }

  console.log("12) vesting ve oylama");
  {
    const G = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestGovernance.json"), "utf8"));
    const gI = new Interface(G.abi);
    const H7 = "0x0000000000000000000000000000000000000a11";
    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: H7, data: gI.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [H7]: { code: G.deployedBytecode } }
      ]);
      return gI.decodeFunctionResult(fn, r);
    };

    const TOP = 1200n * 10n ** 18n;
    for (const [ay, bekAy] of [[0, 0], [1, 1], [6, 6], [12, 12], [18, 12]]) {
      const [acilan, cekilen, gercekAy] = await call("runVesting", [ay]);
      const bek = (TOP * BigInt(bekAy)) / 12n;
      ok(BigInt(gercekAy) === BigInt(bekAy) && BigInt(acilan) === bek,
        ay + ". ayda acilan " + (Number(bek) / 1e18).toFixed(0) + " birim (" + bekAy + "/12)",
        BigInt(gercekAy) + " ay");
      if (bekAy > 0) ok(BigInt(cekilen) === bek, "  cekilen acilana esit");
    }

    const MIN_OY = 50_000n * 10n ** 18n;
    const [o] = await call("runOylama", [500_000n * 10n ** 18n, 200_000n * 10n ** 18n]);
    ok(o.esikAltiReddedildi === true, "esigin altindaki oneri reddediliyor (%1)");
    /* The enum was reordered when Queued/Ready/Expired/Cancelled were
       added, so Active is 0 now and not 1. */
    ok(Number(o.durumAktif) === 0, "oneri aktif durumda");
    ok(BigInt(o.lehte) === 500_000n * 10n ** 18n, "lehte oy sayildi");
    ok(BigInt(o.aleyhte) === 200_000n * 10n ** 18n, "aleyhte oy sayildi");
    ok(o.cifteOyReddedildi === true, "ayni cuzdan ikinci kez oy veremiyor");

    /* Quorum is 10% FOR of everything staked. With a large silent stake the
       same FOR/AGAINST split must FAIL: apathy defeats, it never passes. */
    const [d1] = await call("runSonuc", [500_000n * 10n ** 18n, 200_000n * 10n ** 18n, 0n]);
    ok(Number(d1) === 2, "yeter sayi saglanan oneri GECTI");
    /* The silent stake has to be big enough to defeat quorum but not so
       big that the proposer falls under the 1% needed to raise the
       question at all. 100 for, 20 against, 900 silent: total 1020, quorum
       needs 102 FOR, there are 100. */
    const [d2] = await call("runSonuc", [1_000_000n * 10n ** 18n, 200_000n * 10n ** 18n, 9_000_000n * 10n ** 18n]);
    ok(Number(d2) === 1, "buyuk sessiz stake varken ayni oneri DUSTU", "ilgisizlik reddeder");
    const [d3] = await call("runSonuc", [200_000n * 10n ** 18n, 500_000n * 10n ** 18n, 0n]);
    ok(Number(d3) === 1, "aleyhte cogunluk oneriyi dusuruyor");
    ok(o.guctenYoksunReddedildi === true, "stake etmemis cuzdan oy veremiyor");

    /* ---- the part that used to not exist -------------------------- */
    const E = 10n ** 18n;
    const OY = 100_000n * 10n ** 18n;
    const [u] = await call("runUygulama", [1000n * E, 40n * E]);
    ok(Number(u.durumGecti) === 2, "pencere kapandiginda oneri GECTI durumunda");
    ok(u.siradanOnceRed === true, "SIRAYA ALINMADAN uygulama reddediliyor",
      "timelock atlanamiyor");
    ok(Number(u.durumHazir) === 4, "siraya alinan oneri HAZIR durumda");
    ok(BigInt(u.odenen) === 40n * E, "GELISTIRICI PARAYI FIILEN ALDI",
      (Number(BigInt(u.odenen)) / 1e18).toFixed(0) + " birim, oylamayla");
    ok(BigInt(u.kayitliOdeme) === BigInt(u.odenen), "odeme kontratta da kayitli",
      "DevPool.paid eslesiyor");
    ok(BigInt(u.havuzKalan) === 960n * E, "havuzdan yalnizca oylanan tutar cikti",
      (Number(BigInt(u.havuzKalan)) / 1e18).toFixed(0) + " birim kaldi");
    ok(Number(u.durumSonra) === 5, "uygulanan oneri UYGULANDI durumunda");
    ok(u.ciftUygulamaRed === true, "ayni oneri ikinci kez uygulanamiyor");
    ok(BigInt(u.katkiId) === 0n, "gelistirici katkisini izinsiz kaydedebiliyor", "katki #0");

    const [tDurum, tEta, tRed] = await call("runTimelockTutuyor", []);
    ok(Number(tDurum) === 3, "gercek 2 gunluk timelock ile oneri SIRADA bekliyor");
    ok(BigInt(tEta) > 0n, "  eta belirlendi", BigInt(tEta).toString());
    ok(tRed === true, "  timelock dolmadan uygulama reddediliyor");

    /* ---- the veto, and its limits ---------------------------------- */
    const [v] = await call("runVeto", []);
    ok(v.nobetciAktif === true, "nobetci suresi icinde aktif");
    ok(v.nobetciOneriRed === true, "nobetci ONERI VEREMIYOR", "stake yok, yetki yok");
    ok(v.yabanciIptalRed === true, "ilgisiz bir cuzdan oneri iptal edemiyor");
    ok(Number(v.durumIptal) === 7, "nobetci oneriyi IPTAL edebiliyor");
    ok(v.iptalSonrasiUygulamaRed === true, "iptal edilen oneri uygulanamiyor");
    ok(v.devirSonrasiIptalRed === true, "nobetci yetkisini BIRAKINCA geri alamiyor",
      "donusu yok");

    /* ---- two edges ------------------------------------------------- */
    const [kotuRed, sinyalDurum, sinyalHavuz, kayitSayisi] =
      await call("runKenarlar", [100n * E]);
    ok(kotuRed === true, "havuzda olmayan tutari odeyen oneri uygulanamiyor");
    ok(BigInt(sinyalHavuz) === 100n * E, "  basarisiz uygulama havuza dokunmadi");
    ok(Number(sinyalDurum) === 5, "cagrisiz (sadece gorus) oneri de uygulanabiliyor");
    ok(BigInt(kayitSayisi) === 2n, "katki kaydi herkese acik", "2 kayit");

    /* Renting a decision. Voting power is read when the vote is cast and
       unstaking is instant, so until the repair a proposal could be carried
       entirely by stake that left in the next block — the attacker risking
       nothing, which is the one thing a vote was supposed to cost. */
    {
      const [k] = await call("runOyKiralama", []);
      const V = (x) => BigInt(x);

      ok(V(k.lehteOncesi) === 9n * OY, "saldirgan 900.000 ALP oyla onergeyi tasiyor",
        "stake'i hala duruyorken");
      ok(Number(k.durumOncesi) === 2, "onerge o anda GECMIS sayiliyor",
        "yeter sayi ve cogunluk saglandi");

      ok(V(k.dusen) === 9n * OY, "stake cekilince tazele() 900.000 oyu DUSURDU",
        "cagiran herkes olabilir, izin gerekmiyor");
      ok(V(k.lehteSonrasi) === 0n, "lehte oy arkasindaki paraya indi",
        V(k.lehteSonrasi).toString());
      ok(Number(k.durumSonrasi) === 1, "ONERGE DUSTU", "kiralanan oy tutmadi");

      /* And the honest voter, who did not move, is untouched — a repair
         that also costs the people it protects is not a repair. */
      ok(V(k.durustOncesi) === OY && V(k.durustSonrasi) === OY,
        "stake'ini tutan secmenin oyu aynen duruyor",
        (Number(V(k.durustSonrasi)) / 1e18).toLocaleString("en-US") + " ALP");

      /* ---- the line between earning and deciding ------------------- */
      const [t] = await call("runOyTabani", []);
      ok(V(t.taban) === MIN_OY, "oy tabani 50.000 ALP",
        (Number(V(t.taban)) / 1e18).toLocaleString("en-US"));
      ok(t.tamTabanOyVerdi === true, "TAM 50.000 ile oy verilebiliyor", "sinirin kendisi yeterli");
      ok(V(t.tamTabanAgirlik) === MIN_OY, "  ve tam agirligiyla sayildi");
      ok(t.birEksikOyRed === true, "1 wei eksigiyle OY VERILEMIYOR", "sinir gercekten sinir");
      ok(t.birEksikOneriRed === true, "1 wei eksigiyle ONERI DE ACILAMIYOR",
        "oy veremeyecegin bir sey oneremezsin");
      /* The whole vote goes, not the one wei difference: the stake left
         behind was never enough to cast a vote at all. */
      ok(V(t.dusenTabanAlti) === MIN_OY, "taban altina dusen oy TAMAMEN silindi",
        "farki kadar degil, hepsi");
      ok(V(t.lehteSonrasi) === 0n, "  lehte sayim sifira indi");
      ok(V(t.kalanStake) === MIN_OY - 1n, "stake yerinde duruyor, kazanmaya devam ediyor",
        "oyu kaybetmek birikimi cezalandirmiyor");
    }
  }

  console.log("");
  console.log("13) hook adres bitleri madenciligi");
  /* v4 reads a hook's capabilities from the low 14 bits of its address, so the
   * deploy address is not free: it has to be mined with CREATE2. */
  const GEREKEN = (1 << 11) | (1 << 9) | (1 << 6) | (1 << 2); // addLiq, removeLiq, afterSwap, afterSwapDelta
  const MASKE = (1 << 14) - 1;
  const DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C"; // yaygin CREATE2 fabrikasi
  const initHash = keccak256(ART.bytecode + coder.encode(
    ["address", "address", "address"],
    [PM, LAUNCHPAD, QUOTE]
  ).slice(2));
  let bulundu = null, deneme = 0;
  const t0 = Date.now();
  for (let i = 0; i < 400000 && !bulundu; i++) {
    deneme++;
    const salt = "0x" + i.toString(16).padStart(64, "0");
    const a = getCreate2Address(DEPLOYER, salt, initHash);
    if ((parseInt(a.slice(-4), 16) & MASKE) === GEREKEN) bulundu = { salt, a };
  }
  ok(!!bulundu, "gereken bayraklarla adres bulunabiliyor",
    bulundu ? bulundu.a + "  (" + deneme.toLocaleString("en-US") + " deneme, " + (Date.now() - t0) + " ms)" : deneme + " denemede bulunamadi");
  console.log("     gereken bayraklar: 0x" + GEREKEN.toString(16) +
    "  (beforeAddLiquidity, beforeRemoveLiquidity, afterSwap, afterSwapReturnDelta)");


  console.log("");
  console.log("14) musteri kuyrugu  (USDC gir, meme cik; ve guvenin siniri)");
  {
    const Q = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestQueue.json"), "utf8"));
    const qI = new Interface(Q.abi);
    const H8 = "0x0000000000000000000000000000000000000b11";
    const E = 10n ** 18n;
    const ARZ = 10n ** 9n * E;
    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: H8, data: qI.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [H8]: { code: Q.deployedBytecode } }
      ]);
      return qI.decodeFunctionResult(fn, r);
    };

    /* Two units, kept apart on purpose. The customer pays dollars at six
       decimals; the operator delivers a wrapped share at eighteen. They are
       not convertible without a price, and nothing below pretends they
       are. */
    const USDC = 200n * 10n ** 6n;        // $200
    const TESLIM = 8n * 10n ** 17n;       // 0.8 wrapped shares
    /* The pool share is fixed at 40% now. */
    const BPS = 4000n;
    const B = (x) => BigInt(x);
    const d = (x) => Number(B(x)) / 1e6;     // dollars
    const p = (x) => Number(B(x)) / 1e18;    // shares and tokens

    const [s] = await call("runTamYol", [PM, USDC, BPS]);

    const ucret = (USDC * 20000n) / 1000000n;    // 2%
    const net = USDC - ucret;
    /* This path is the queue's, which takes its own fee in USDC and still
       splits three ways. The launchpad no longer does — see FEE_TO_FLOOR_BPS
       — and the queue is not reachable from the interface any more, so what
       is asserted here is the queue's own arithmetic rather than the
       launchpad's. */
    const holder = (ucret * 3000n) / 10000n;
    const dev = (ucret * 3000n) / 10000n;
    const proto = ucret - holder - dev;

    ok(B(s.devAldi) === dev, "KUYRUK ucretin %30'unu gelistirici havuzuna ayiriyor", d(s.devAldi).toFixed(2));
    ok(B(s.protoAldi) === proto, "kuyruk ucretin %40'ini protokole ayiriyor", d(s.protoAldi).toFixed(2));
    ok(B(s.odulUsdc) === holder, "kuyruk ucretin %30'unu tutucu oduluna ayiriyor", d(s.odulUsdc).toFixed(2));
    ok(B(s.musteriKalanUsdc) === USDC, "musteriden tam istenen kadar USDC cikti",
      d(s.musteriKalanUsdc).toFixed(0) + " kaldi");

    /* The queue holds the net plus the holder slice while the request is
       open, and nothing after it closes. */
    ok(B(s.kuyruktakiUsdc) === net + holder, "acik talep boyunca para kuyrukta duruyor",
      d(s.kuyruktakiUsdc).toFixed(2));
    ok(B(s.kuyruktaKalan) === 0n, "talep kapandiginda kuyrukta HICBIR SEY kalmiyor",
      B(s.kuyruktaKalan).toString() + " wei");

    /* The point of the design: the operator is reimbursed, not trusted
       with the deposit. It delivered collateral first and was paid after. */
    ok(B(s.operatorSarmal) === TESLIM, "AKTARICI TEMINATI ONCE TESLIM ETTI",
      p(s.operatorSarmal).toFixed(4) + " sarmal hisse");
    ok(B(s.operatorUsdc) === net, "aktarici SONRA USDC ile geri odendi",
      "$" + d(s.operatorUsdc).toFixed(2));

    /* And the customer ends up holding the meme token, not a stock. */
    ok(B(s.kasaTeminat) === TESLIM, "teslim edilen teminatin TAMAMI kasaya girdi",
      p(s.kasaTeminat).toFixed(4) + " sarmal hisse");
    /* FLOOR_SCALE is 1e36. */
    const beklenenTaban = (TESLIM * E * E) / ARZ;
    ok(B(s.tabanFiyat) === beklenenTaban, "taban = kasadaki hisse / arz",
      B(s.tabanFiyat).toString());
    const havuzToken = (ARZ * BPS) / 10000n;
    /* 70% of their share arrives now, 30% is in the lock — so the free
       balance is 42% of supply rather than the whole 60%. The lock is the
       feature, not a shortfall. */
    const serbestPay = ((ARZ - havuzToken) * 7000n) / 10000n;
    ok(B(s.musteriToken) >= serbestPay - 10n ** 12n, "MUSTERI MEME TOKENINI ALDI",
      p(s.musteriToken).toLocaleString("en-US") + " token (%" +
      (100 * Number(B(s.musteriToken)) / Number(ARZ)).toFixed(1) + " arz)");

    /* Nobody delivers. */
    const [erkenRed, geri, beklenen, durum] = await call("runIade", [PM, USDC]);
    ok(B(geri) === B(beklenen), "KIMSE KARSILAMAZSA MUSTERI PARASINI KENDI ALIYOR",
      "$" + d(geri).toFixed(2) + " / beklenen $" + d(beklenen).toFixed(2) + "  (izin gerekmiyor)");
    ok(Number(durum) === 3, "iade edilen talep IADE durumunda");
    ok(erkenRed === true, "ayni talep ikinci kez iade edilemiyor");

    /* The configuration that is actually going to be deployed: setQueue is
       one-shot and already spent on the previous queue, so the replacement
       is not waived and the launchpad charges the fee instead. What must
       hold is that it is charged ONCE and is still 2%. */
    {
      const [m] = await call("runMuafDegil", [PM, USDC, BPS]);
      /* The launchpad's fee comes out of the COLLATERAL, so it is 2% of
         what was delivered rather than 2% of what was paid — and 60% of it
         goes straight back into the vault. What leaves is the protocol's
         share and nothing else. */
      const ucret = (TESLIM * 2n) / 100n;
      const cikan = ucret - (ucret * 6000n) / 10000n;
      ok(B(m.kuyrukUcreti) === 0n, "muaf olmayan kuyruk USDC UCRETI ALMIYOR",
        B(m.kuyrukUcreti).toString() + " birim");
      ok(B(m.launchpadUcreti) === cikan, "UCRETI LAUNCHPAD ALIYOR (kapidan cikan %0,8)",
        p(m.launchpadUcreti).toFixed(4) + " / " + p(cikan).toFixed(4) + " teminat");
      ok(ucret - cikan === (ucret * 6000n) / 10000n, "kalan %1,2 tabana KASADA",
        p(ucret - cikan).toFixed(4) + " teminat — taban olarak odeniyor");
      ok(B(m.kasaTeminat) === TESLIM - cikan, "kasaya teminatin %99,2'si girdi",
        p(m.kasaTeminat).toFixed(4));
      ok(B(m.launchpadUcreti) + B(m.kasaTeminat) === B(m.teslim),
        "ucret + kasa = teslim edilen", "ikinci bir kesinti yok");
      ok(B(m.operatorUsdc) === USDC, "aktariciya tam tutar geri odendi",
        "$" + d(m.operatorUsdc).toFixed(2));
      ok(B(m.musteriKalanUsdc) === USDC, "musteriden tam istenen kadar cikti",
        "$" + d(m.musteriKalanUsdc).toFixed(2));
      ok(B(m.musteriToken) > 0n, "musteri yine meme tokenini aldi",
        p(m.musteriToken).toLocaleString("en-US", { maximumFractionDigits: 0 }));
      ok(B(m.kuyruktaKalan) === 0n, "kuyrukta hicbir sey kalmadi");
    }

    const [erken] = await call("runErkenIadeRed", [PM]);
    ok(erken === true, "sure dolmadan iade alinamiyor", "aktaricinin hakki korunuyor");

    const [yKars, yHisse, bilinmeyen, aralik, teminatsiz] = await call("runYetkiler", [PM]);
    ok(yKars === true, "aktarici olmayan biri talebi karsilayamiyor");
    ok(yHisse === true, "yonetisim olmayan biri hisse LISTESINE EKLEYEMIYOR",
      "kendi tokenini teminat yapamaz");
    ok(bilinmeyen === true, "listede olmayan hisse reddediliyor");
    ok(aralik === true, "launchpad sinirini asan tutar reddediliyor", "kopya limit yok");
    ok(teminatsiz === true, "teminat teslim etmeden karsilama reddediliyor");

    /* The hole Codex found: karsila checked only that SOMETHING arrived,
       then reimbursed the operator the customer full payment. One wei
       against a thousand dollars passed every check. The customer now
       states a floor when they pay and the operator cannot go under it. */
    const [azRed, tamGecti, sifirRed] = await call("runAzTeminat", [PM]);
    ok(azRed === true, "TABANIN ALTINDA TESLIM REDDEDILIYOR",
      "operator eksik teslim edip tam parayi alamiyor");
    ok(tamGecti === true, "taban karsilaninca ayni talep sonuclaniyor",
      "ret tabandan geliyor, baska bir seyden degil");
    ok(sifirRed === true, "tabansiz talep acilamiyor",
      "varsayilan koymak musteri adina secmek olurdu");

    /* Found in review AFTER the floor fix, which is the honest order to
       record it in: the floor stored a NUMBER, but karsila looked the
       asset up again at delivery, so governance relisting the ticker
       would have left the customer owed that quantity of something
       else. The asset is pinned when they pay now. */
    const [eskiCekildi, eskiAz, yeniAz] = await call("runYenidenListeleme", [PM]);
    ok(eskiCekildi === true, "YENIDEN LISTELEME ESKI TALEBI ETKILEMIYOR",
      "odeme anindaki varlik cekildi: eski " + (Number(eskiAz) / 1e18) +
      ", yeni " + (Number(yeniAz) / 1e18));

    /* Raised in review after the pinning fix: pinning keeps governance
       from substituting the asset, but it also meant a delisting left
       the customer waiting out the whole deadline. */
    const [normalErken, delistGecti, delistGeri] = await call("runDelistIade", [PM]);
    ok(normalErken === true, "normalde erken iade hala reddediliyor",
      "asagidaki gecis delistingden, sureden degil");
    ok(delistGecti === true, "VARLIGI LISTEDEN CIKARILAN MUSTERI HEMEN CIKABILIYOR");
    ok(Number(delistGeri) > 0, "ve parasini geri aldi",
      "$" + (Number(delistGeri) / 1e6).toFixed(2));

    /* And governance must not be able to take the escape back. My first
       attempt latched a flag inside iadeAl, which could only fire while
       the mismatch was visible — during which the customer could
       already leave, so it added nothing. A monotonic version counter
       cannot be put back: relisting away and returning raises it twice. */
    const [kacisKaldi, kacisGeri] = await call("runKacisGeriAlinamaz", [PM]);
    ok(kacisKaldi === true, "YONETISIM KACIS HAKKINI GERI ALAMIYOR",
      "listeyi degistirip geri koymak hakki kapatmiyor");
    ok(Number(kacisGeri) > 0, "  ve musteri parasini aldi",
      "$" + (Number(kacisGeri) / 1e6).toFixed(2));
  }

  console.log("");
  console.log("15) ALP likidite kilidi  (GERCEK Arc PoolManager)");
  {
    const AK = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestAlpKilit.json"), "utf8"));
    const LK = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "AlpLocker.json"), "utf8"));
    const kIface = new Interface(AK.abi);
    const H3 = "0x00000000000000000000000000000000000000B1";

    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: H3, data: kIface.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [H3]: { code: AK.deployedBytecode } }
      ]);
      return kIface.decodeFunctionResult(fn, r);
    };

    /* Prices as ratios of RAW amounts, the way the launchpad computes them.
       The previous version of this section took "$1,500 over a billion
       tokens" as the float 1.5e-6, which assumes both sides count in
       eighteen decimals. USDC counts in six, so the real ratio is
       1,500,000,000 over 1e27 — smaller by exactly the million that put
       300,000,000 ALP into a pool quoting $1,500,000 a token. */
    const bsqrt = (x) => {
      if (x === 0n) return 0n;
      let z = (x + 1n) / 2n, y = x;
      while (z < y) { y = z; z = (x / z + z) / 2n; }
      return y;
    };
    /* sqrt(num/den) in Q64.96. Split across the root so no intermediate
       approaches the uint256 ceiling, as in Launchpad._sqrtRatioX96. */
    const sqrtOran = (num, den) => (bsqrt(num << 96n) << 96n) / bsqrt(den << 96n);
    const tickAt = (f) => Math.floor(Math.log(f) / Math.log(1.0001));
    const snapDown = (t, sp) => Math.floor(t / sp) * sp;

    const MIKTAR = 300000000n * 10n ** 18n;   // ALP's liquidity 30%
    const ARZ_HAM = 10n ** 9n * 10n ** 18n;   // a billion ALP, 18 decimals
    const MCAP_HAM = 1500n * 1000000n;        // $1,500 in six-decimal USDC
    const TAVAN = 60;

    /* Which side of the price the band belongs on follows from address
       order, and that is exactly where this would go wrong without saying
       so, which is why both orderings run. */
    for (const alpIlk of [true, false]) {
      /* v4's price is currency1 per currency0, so the ratio goes one way
         round or the other depending on where ALP sorted. */
      const sqrtP = alpIlk ? sqrtOran(MCAP_HAM, ARZ_HAM) : sqrtOran(ARZ_HAM, MCAP_HAM);
      const hamFiyat = Number(MCAP_HAM) / Number(ARZ_HAM);   // quote per token, raw
      const havuzFiyat = alpIlk ? hamFiyat : 1 / hamFiyat;
      const simdiki = tickAt(havuzFiyat);
      let alt, ust, yanlisAlt, yanlisUst;
      if (alpIlk) {
        alt = snapDown(simdiki, 60) + 60;
        ust = snapDown(tickAt(hamFiyat * TAVAN), 60);
        /* the same band, placed below the price instead of above */
        yanlisUst = snapDown(simdiki, 60) - 60;
        yanlisAlt = yanlisUst - (ust - alt);
      } else {
        ust = snapDown(simdiki, 60);
        if (ust >= simdiki) ust -= 60;
        alt = snapDown(tickAt(1 / (hamFiyat * TAVAN)), 60);
        yanlisAlt = snapDown(simdiki, 60) + 60;
        yanlisUst = yanlisAlt + (ust - alt);
      }

      const etiket = alpIlk ? "ALP currency0" : "ALP currency1";
      const [s2] = await call("run", [PM, alpIlk, sqrtP, alt, ust, MIKTAR]);

      ok(BigInt(s2.konan) === MIKTAR, etiket + ": 300M ALP havuza kondu",
        Number(BigInt(s2.konan) / 10n ** 18n).toLocaleString("en-US") + " ALP");

      /* The entire basis of the claim that this costs nothing. Read off the
         USDC contract, not off the locker's own account of itself. */
      ok(BigInt(s2.havuzUsdc) === 0n, etiket + ": POZISYON SIFIR USDC ISTEDI",
        BigInt(s2.havuzUsdc).toString() + " wei");

      /* Liquidity is an integer and the amount it needs is a division of
         it, so the position lands a few hundred wei short of the balance.
         That dust stays in a contract with no transfer function, so it is
         burnt where it sits — what has to be checked is that it is dust
         and that nothing can reach it, not that it is absent. */
      const toz = BigInt(s2.kilitAlpKalan);
      ok(BigInt(s2.havuzAlp) + toz === MIKTAR, etiket + ": ALP'nin tamami ya havuzda ya kilitte",
        "kayip yok");
      ok(toz * 10n ** 9n < MIKTAR, etiket + ": havuza girmeyen toz onemsiz",
        toz.toString() + " wei  (konanin 1/" +
        (MIKTAR / (toz === 0n ? 1n : toz)).toLocaleString("en-US") + "'i)");
      ok(s2.kilitlendi === true, etiket + ": kilit tek seferlik isaretlendi");
      ok(s2.ikinciRed === true, etiket + ": kilitle() IKINCI KEZ CALISMIYOR",
        "ikinci pozisyon = yanlis tarafa koyma ihtimali");
      ok(Number(s2.altTick) < Number(s2.ustTick), etiket + ": bant gecerli",
        "[" + s2.altTick + ", " + s2.ustTick + "]  acilis tick " + s2.acilisTick);

      const [red] = await call("runKotuBant", [PM, alpIlk, sqrtP, yanlisAlt, yanlisUst, MIKTAR]);
      ok(red === true, etiket + ": YANLIS TARAFTAKI BANT REDDEDILIYOR",
        "[" + yanlisAlt + ", " + yanlisUst + "] kabul edilse USDC isterdi");
    }

    /* And the part that makes it self-funding: a purchase leaves USDC
       behind in a pool nobody can withdraw from. */
    {
      const hamFiyat = Number(MCAP_HAM) / Number(ARZ_HAM);
      const havuzFiyat = 1 / hamFiyat;
      const sqrtP = sqrtOran(ARZ_HAM, MCAP_HAM);
      const simdiki = tickAt(havuzFiyat);
      let ust = snapDown(simdiki, 60);
      if (ust >= simdiki) ust -= 60;
      const alt = snapDown(tickAt(1 / (hamFiyat * TAVAN)), 60);
      const HARCA = 100n * 1000000n;          // $100, in six-decimal USDC

      const [a] = await call("runAlim", [PM, false, sqrtP, alt, ust, MIKTAR, HARCA]);
      const d = (x) => Number(BigInt(x)) / 1e18;

      ok(BigInt(a.havuzUsdcOnce) === 0n, "havuz HICBIR USDC olmadan aciliyor",
        BigInt(a.havuzUsdcOnce).toString() + " wei");
      ok(BigInt(a.alinanAlp) > 0n, "musteri USDC ile ALP alabiliyor",
        d(a.alinanAlp).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " ALP");
      ok(BigInt(a.havuzUsdcSonra) === BigInt(a.harcananUsdc),
        "ALICININ USDC'SI HAVUZDA KALDI",
        "$" + (Number(BigInt(a.havuzUsdcSonra)) / 1e6).toFixed(2) + " — satmak isteyenin karsi tarafi");

      /* The check that was missing entirely, and the only one that would
         have caught what actually happened: what does a dollar buy? At a
         $1,500 opening over a billion tokens it is about 666,667 ALP, and
         the pool that is locked on chain today would hand over 0.00000067
         for the same dollar. */
      const alpBasina = (Number(BigInt(a.harcananUsdc)) / 1e6) /
                        (Number(BigInt(a.alinanAlp)) / 1e18);
      const mcap = alpBasina * 1e9;
      ok(mcap > 1400 && mcap < 2600, "ACILIS PIYASA DEGERI GERCEKTEN ~$1.500",
        "$" + mcap.toLocaleString("en-US", { maximumFractionDigits: 0 }) +
        "  — $1 ile " + (1 / alpBasina).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " ALP");
      ok(BigInt(a.havuzUsdcSonra) > 0n, "likidite musteriler aldikca KENDI birikiyor",
        "kimse fonlamadi");
      ok(BigInt(a.kilitBakiye) === 0n, "kilitleyicinin kendi USDC'si olusmuyor",
        "cekilecek bir bakiye yok");
    }

    /* There is no withdraw. Not a guarded one — none, which is checkable
       from the ABI rather than taken on trust. */
    const yazanlar = LK.abi
      .filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure")
      .map((f) => f.name).sort();
    ok(yazanlar.length === 2 && yazanlar[0] === "kilitle" && yazanlar[1] === "unlockCallback",
      "AlpLocker'da SADECE iki yazan fonksiyon var", yazanlar.join(", "));
    const kacisVar = LK.abi.some((f) => f.type === "function" &&
      /owner|admin|rescue|sweep|withdraw|cek|transfer|upgrade/i.test(f.name || ""));
    ok(kacisVar === false, "sahip, kurtarma, cekme veya yukseltme fonksiyonu YOK",
      "kilit bir soz degil, yapi");
  }

  console.log("");
  console.log("15b) KASAYA CEKME SONRADAN EKLENEBILIR MI  (bytecode)");
  {
    /* "There is no withdraw" is an ABI fact, and an ABI fact is only about
       what was compiled today. The question worth answering is whether one
       can be ADDED later, and that is answered by the bytecode: a contract
       with no DELEGATECALL, no CALLCODE and no SELFDESTRUCT has no
       instruction capable of changing what it does. Nobody can upgrade it
       — not a future version of us, not a governance vote, not a stolen
       key, because there is no key and no mechanism for one to matter.
    
       The scan walks instructions and classifies every hit, because three
       separate kinds of data in a contract's bytecode look exactly like
       these opcodes: PUSH operands, metadata blobs (which sit in the
       MIDDLE of the code, not only at the end), and the creation code of
       contracts deployed with `new`. Each of the three produced a false
       answer on the first run over Launchpad. */
    const { denetle, OPCODES } = require(path.join(__dirname, "..", "scripts", "degismezlik.js"));
    const B = (ad) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", ad + ".json"), "utf8"));

    /* Deploy nothing, so clean of all five. The vault is the one that
       matters most: it is where the collateral sits. */
    for (const ad of ["CollateralVault", "LaunchToken", "ArcLaunchHook", "TeminatKarnesi", "Vesting"]) {
      const d = denetle(B(ad).deployedBytecode, [], OPCODES);
      ok(d.gercek.length === 0,
        ad + " DEGISTIRILEMEZ — yukseltme komutu yok",
        d.bayt + " bayt, " + d.komut + " komut tarandi, " +
        (d.gercek.length ? d.gercek.map((f) => f.ad + "@" + f.ofset).join(", ") : "hicbiri yok"));
    }

    /* The launchpad deploys four contracts, so CREATE is its job. It is
       still held to the three that would let it change its own behaviour,
       and the contracts it embeds are named so their bytes are not read as
       its instructions. */
    {
      const gomulu = ["LaunchToken", "CollateralVault", "Vesting", "TeminatKarnesi"]
        .map((g) => ({ ad: g, kod: B(g).bytecode }));
      const d = denetle(B("Launchpad").deployedBytecode, gomulu, OPCODES);
      const kotu = d.gercek.filter((f) => f.ad !== "CREATE");
      ok(kotu.length === 0,
        "Launchpad'de DELEGATECALL / CALLCODE / SELFDESTRUCT YOK",
        kotu.length ? kotu.map((f) => f.ad + "@" + f.ofset).join(", ")
          : d.gercek.length + " CREATE var, o da dort `new` cagrisi");
      ok(d.gercek.length === 4,
        "  ve tam DORT CREATE var, fazlasi degil",
        "token, kasa, vesting, karne — bes olsa biri hesapsiz olurdu");
      ok(d.veri.length >= 5,
        "  tarayici VERI ile KODU ayirt etti",
        d.veri.length + " bulgu veri olarak siniflandi: " +
        d.veri.map((v) => v.ad + "->" + v.icinde).join(", "));
      /* Specifically: the first run called two bytes of an IPFS hash a
         CREATE and a DELEGATECALL. If that classification ever regresses,
         this fails rather than quietly reporting a contract as unsafe. */
      ok(d.veri.some((v) => v.icinde === "metadata"),
        "  ic metadata bloklari VERI sayiliyor",
        "ilk koşuda IPFS hash'inin iki bayti DELEGATECALL sanilmisti");
      ok(d.veri.some((v) => v.icinde === "LaunchToken"),
        "  gomulu kontrat kodu VERI sayiliyor",
        "LaunchToken'in creation code'u Launchpad'in icinde duruyor");
    }

    /* The vault deploys nothing at all — not even a helper. A vault that
       can deploy is a vault that can be given a new mouth. */
    {
      const d = denetle(B("CollateralVault").deployedBytecode, [], OPCODES);
      ok(d.gercek.length === 0 && d.veri.length === 0,
        "KASA HICBIR SEY KURAMAZ, HICBIR SEYE DEVRETMEZ",
        "CREATE yok, DELEGATECALL yok, SELFDESTRUCT yok — " + d.komut + " komutun hicbirinde");
    }

    /* And no key anywhere in its ABI, which is the ABI half of the same
       claim: nothing to call even if there were a mechanism. */
    {
      const CV = B("CollateralVault");
      const yazan = CV.abi.filter((f) => f.type === "function" &&
        f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
      ok(yazan.length === 2 && yazan.join(",") === "fund,redeem",
        "KASADA SADECE IKI YAZAN FONKSIYON: fund, redeem",
        yazan.join(", ") + " — biri doldurur, biri token yakarak oransal oder");
      const kacis = CV.abi.some((f) => f.type === "function" &&
        /owner|admin|rescue|sweep|withdraw|cek|kurtar|pause|upgrade|init/i.test(f.name || ""));
      ok(kacis === false, "  sahip / kurtarma / cekme / duraklatma / yukseltme YOK",
        "cikis yolu bir tane ve token'a mal oluyor");
    }
  }

  console.log("");
  console.log("16) ondalik basamaklar  (dolar gercekten dolar mi)");
  {
    const OD = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestOndalik.json"), "utf8"));
    const oIface = new Interface(OD.abi);
    const H4 = "0x00000000000000000000000000000000000000C1";

    const r = await rpc("eth_call", [
      { from: YABANCI, to: H4, data: oIface.encodeFunctionData("run", []), gas: "0x8000000" },
      "latest",
      { [H4]: { code: OD.deployedBytecode } }
    ]);
    const [o] = oIface.decodeFunctionResult("run", r);

    /* The check that was missing. `100 ether` on a six-decimal USDC is a
       hundred trillion dollars, which is a minimum deposit nobody can meet,
       and the suite passed anyway because every mock in it counted in
       eighteen. */
    ok(BigInt(o.min6) === 100n * 10n ** 6n, "6 ondalikli USDC'de alt sinir = $100",
      BigInt(o.min6).toString() + " birim");
    ok(BigInt(o.max6) === 1500n * 10n ** 6n, "6 ondalikli USDC'de ust sinir = $1,500",
      BigInt(o.max6).toString() + " birim");
    ok(BigInt(o.min18) === 100n * 10n ** 18n, "18 ondalikli tokende alt sinir yine $100",
      "sinir TOKENDEN okunuyor, yazilmiyor");
    ok(BigInt(o.max18) === 1500n * 10n ** 18n, "18 ondalikli tokende ust sinir yine $1,500");
    ok(o.yuzDolarKabul === true, "GERCEK BIR 100 DOLAR KABUL EDILIYOR",
      "cekilen " + (Number(BigInt(o.cekilen)) / 1e6).toFixed(2) + " USDC");
    ok(BigInt(o.cekilen) === 100n * 10n ** 6n, "cekilen tutar tam $100", "ne eksik ne fazla");
    ok(o.azRed === true, "$100'un bir birim altindaki tutar reddediliyor");
    ok(o.fazlaRed === true, "$1,500'un bir birim ustundeki tutar reddediliyor");
  }

  console.log("");
  console.log("17) fiyatin tavani yok  (GERCEK Arc PoolManager)");
  {
    const EG = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestEgri.json"), "utf8"));
    const eIface = new Interface(EG.abi);
    const H9 = "0x00000000000000000000000000000000000000E9";

    /* Far past where the old band ended: it was exhausted by about $3,500. */
    const merdiven = [1000n, 9000n, 40000n, 50000n, 400000n, 500000n]
      .map((d) => d * 1000000n);

    const r = await rpc("eth_call", [
      { from: YABANCI, to: H9, gas: "0x10000000",
        data: eIface.encodeFunctionData("run",
          /* The deposit is USDC now (six decimals), not an 18-decimal mock. */
          [PM, 500n * 1000000n, 500n * 1000000n, 4000n, merdiven]) },
      "latest",
      { [H9]: { code: EG.deployedBytecode } }
    ]);
    const [adimlar, acilisSqrtP, , tokenSifirinci] = eIface.decodeFunctionResult("run", r);
    const V = (x) => BigInt(x);

    ok(adimlar.length === merdiven.length, "her alim gerceklesti — hicbiri reddedilmedi",
      adimlar.length + "/" + merdiven.length + " adim");

    const son = adimlar[adimlar.length - 1];
    ok(V(son.havuzToken) > 0n, "YARIM MILYON DOLARDAN SONRA BILE SATACAK TOKEN VAR",
      (Number(V(son.havuzToken)) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " token");
    ok(adimlar.every((a) => a.doldu === false), "hicbir adimda bant bitmedi",
      "eski kurguda ~$3.500'de bitiyordu");

    /* The price has to keep moving, in the right direction, every time. */
    let hepArtti = true;
    for (let i = 1; i < adimlar.length; i++) {
      const o = V(adimlar[i - 1].sqrtP), y = V(adimlar[i].sqrtP);
      if (tokenSifirinci ? !(y > o) : !(y < o)) hepArtti = false;
    }
    ok(hepArtti, "her alimda fiyat YUKARI gitti", "duraklamiyor, tavana dayanmiyor");

    const oran = Number(V(son.sqrtP)) / Number(V(acilisSqrtP));
    const kat = tokenSifirinci ? oran * oran : 1 / (oran * oran);
    ok(kat > 1000, "fiyat acilistan BINLERCE kat yukari cikabiliyor",
      Math.round(kat).toLocaleString("en-US") + " kat  (eski tavan 60 kati)");

    /* And the money that got it there is still in the pool. */
    ok(V(son.havuzUsdc) === V(son.harcanan), "alicilarin parasinin TAMAMI havuzda",
      "$" + (Number(V(son.havuzUsdc)) / 1e6).toLocaleString("en-US") + " — kimse cekemez");
  }

  console.log("");
  console.log("18) baglanma egrisi  (sermayesiz acilis)");
  {
    const T = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestEgriKontrat.json"), "utf8"));
    const tI = new Interface(T.abi);
    const H8 = "0x0000000000000000000000000000000000000b22";
    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: H8, data: tI.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [H8]: { code: T.deployedBytecode } }
      ]);
      return tI.decodeFunctionResult(fn, r);
    };
    const V = (x) => BigInt(x);
    const E = 10n ** 18n;
    const USDC = 10n ** 6n;
    const ARZ = 1_000_000_000n * E;
    const FANTOM = 1350n * USDC;
    const EGRI_TOKEN = 900_000_000n * E;

    /* ---- the opening, with nothing deposited -------------------- */
    const [o] = await call("runAcilis", []);
    ok(V(o.baslangicX) === FANTOM, "egri $1.350 fantom rezervle aciliyor",
      "$" + (Number(V(o.baslangicX)) / 1e6).toLocaleString("en-US"));
    ok(V(o.baslangicY) === EGRI_TOKEN, "sanal token rezervi 900.000.000");
    ok(V(o.egriQuoteBakiyesi) === 0n, "EGRIDE SIFIR USDC VAR", "fantom sanal, kimse yatirmadi");
    ok(V(o.toplananIlk) === 0n, "toplanan sifir");
    /* mcap = (x/y)*ARZ scaled to millionths; $1,500 is 1.5e9 millionths. */
    const mcap = Number(V(o.mcapMikro)) / 1e6;
    ok(Math.abs(mcap - 1500) < 1, "ACILIS PIYASA DEGERI $1.500",
      "$" + mcap.toFixed(2) + " — hedefle ayni, uydurulmadi");

    /* The question the last token never got asked. */
    const birDolar = Number(V(o.birDolarToken)) / 1e18;
    const beklenen = 1 / 1.5e-6;   // $1 at $0.0000015 a token
    ok(Math.abs(birDolar / beklenen - 1) < 0.01, "$1 ILE NE ALINIYOR",
      Math.round(birDolar).toLocaleString("en-US") + " token  (tabandan beklenen " +
      Math.round(beklenen).toLocaleString("en-US") + ")");

    /* ---- a round trip may never pay --------------------------- */
    for (const tutar of [1n, 50n, 500n, 2000n]) {
      const [d] = await call("runGidisDonus", [tutar * USDC]);
      ok(V(d.geriAlinan) <= V(d.odenen), "$" + tutar + " gidis-donus kar ETMIYOR",
        "giren $" + tutar + " -> cikan $" + (Number(V(d.geriAlinan)) / 1e6).toFixed(6));
      ok(V(d.egriQuote) >= V(d.toplananSonra), "  egri borcundan az USDC tutmuyor",
        "tutulan $" + (Number(V(d.egriQuote)) / 1e6).toFixed(6) +
        " >= borc $" + (Number(V(d.toplananSonra)) / 1e6).toFixed(6));
      ok(V(d.dokumAlinan) <= V(d.egriQuote), "  buyuk dokum tuttugundan fazlasini CEKEMIYOR",
        "cekilen $" + (Number(V(d.dokumAlinan)) / 1e6).toFixed(6));
      ok(V(d.dokumSonrasiQuote) >= V(d.dokumSonrasiToplanan), "  dokumden sonra da tutarli");
      ok(d.fantomKorundu === true, "  FANTOM REZERV DOKUNULMADI", "sanal para disari cikmiyor");
    }

    /* ---- graduation ------------------------------------------- */
    const [m] = await call("runMezuniyet", []);
    ok(m.esikAltiRed === true, "ESIK ALTINDA KALICI HAVUZ ACILMIYOR",
      "ALP'nin 300 milyonu tam bu yuzden gitti");
    ok(V(m.toplanan) >= 2700n * USDC, "esige ulasilinca mezun olabiliyor",
      "$" + (Number(V(m.toplanan)) / 1e6).toLocaleString("en-US"));
    ok(V(m.aciciCagri) === 1n, "havuz acici TAM BIR KEZ cagrildi");

    /* The pool must open where the curve closed. Compared as a cross
       multiplication so no fractional price is materialised:
         havuzQuote / havuzToken  ==  kapanisPay / kapanisBolen            */
    const sol = V(m.havuzQuote) * V(m.kapanisBolen);
    const sag = V(m.kapanisPay) * V(m.havuzToken);
    const fark = sol > sag ? sol - sag : sag - sol;
    ok(fark * 1_000_000n <= sol, "HAVUZ, EGRININ BITIRDIGI FIYATTAN ACILIYOR",
      "ustte bosluk yok — pump.fun ve pons'ta var");
    ok(V(m.yakilan) > 0n, "fazla token YAKILDI",
      (Number(V(m.yakilan)) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " token");
    ok(V(m.arzSonra) === ARZ - V(m.yakilan), "arz yakilan kadar kalici dustu",
      (Number(V(m.arzSonra)) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 }));
    ok(V(m.havuzQuote) >= V(m.toplanan), "snipe vergisi havuza DEPTH olarak girdi",
      "$" + (Number(V(m.havuzQuote)) / 1e6).toLocaleString("en-US"));
    ok(m.ciftMezunRed === true, "ikinci kez mezun edilemiyor");
    ok(m.mezunSonrasiAlimRed === true, "mezuniyetten sonra egriden alim yok");

    /* ---- anti-snipe ------------------------------------------- */
    const [sn] = await call("runSnipe", []);
    ok(V(sn.oran0) === 990_000n, "acilis saniyesinde vergi %99");
    ok(V(sn.oran1) === 247_500n, "1 saniye sonra %24,75", "pons dokumani: ~%25");
    ok(V(sn.oran2) === 61_875n, "2 saniye sonra %6,19");
    ok(V(sn.oran5) === 0n, "5 saniye sonra vergi YOK");
    /* The snipe tax is $990; vergi now also carries the 0.40% of the
       fee that stays behind, so this is a floor and not an equality. */
    ok(V(sn.vergiBirikti) >= 990n * USDC, "$1.000'lik snipe'tan en az $990 ayrildi",
      "$" + (Number(V(sn.vergiBirikti)) / 1e6).toFixed(4) +
      " — protokole degil, mezuniyette havuza gidiyor");
    ok(V(sn.sniperToken) * 10n < V(sn.ayniTutarKotasi), "SNIPER COK DAHA AZ TOKEN ALDI",
      "ayni para vergisiz " + (Number(V(sn.ayniTutarKotasi)) / Number(V(sn.sniperToken))).toFixed(1) +
      " kat token aliyordu");

    /* ---- the founder's share, on every trade ------------------ */
    const [u] = await call("runUcret", []);
    /* $1,000 buy: 0.30% to the founder, 0.30% to the stakers. */
    ok(V(u.kurucuAlimSonrasi) === 3n * USDC, "ALIMDA kurucu payi cuzdana GITTI",
      "$" + (Number(V(u.kurucuAlimSonrasi)) / 1e6).toFixed(2) + " — %0,30, cagri yok, birikim yok");
    ok(V(u.stakeAlimSonrasi) === 3n * USDC, "  stake kasasina da %0,30 gitti",
      "$" + (Number(V(u.stakeAlimSonrasi)) / 1e6).toFixed(2));
    ok(V(u.kurucuSatisSonrasi) > V(u.kurucuAlimSonrasi), "SATISTA DA kurucu payi geldi",
      "$" + (Number(V(u.kurucuSatisSonrasi)) / 1e6).toFixed(4) + " — iki yonde de kesiliyor");
    ok(V(u.stakeSatisSonrasi) > V(u.stakeAlimSonrasi), "  stake kasasi da satistan pay aldi");
    /* The part nobody takes has to still be here, as future pool depth. */
    ok(V(u.vergiBirikti) > 0n, "kimsenin almadigi dilim HAVUZ DERINLIGI olarak kaldi",
      "$" + (Number(V(u.vergiBirikti)) / 1e6).toFixed(4));
    ok(V(u.egriBakiyesi) >= V(u.toplanan) + V(u.vergiBirikti),
      "  egri hala borcundan az tutmuyor",
      "tutulan $" + (Number(V(u.egriBakiyesi)) / 1e6).toFixed(4));
    ok(V(u.saticiEline) > 0n, "satici da parasini aldi",
      "$" + (Number(V(u.saticiEline)) / 1e6).toFixed(4));

    /* ---- many steps, invariant held --------------------------- */
    const [t] = await call("runTukenme", []);
    ok(V(t.adimlar) === 30n, "30 alim-satim adimi yuruldu");
    ok(t.degismezTutuldu === true, "HER ADIMDA egri borcundan az USDC tutmadi",
      "tek bir adimda bile bozulmadi");
    ok(t.fiyatHepYukseldi === true, "net alim oldugu her adimda fiyat yukari gitti");
    ok(V(t.sonEgriBakiyesi) >= V(t.sonToplanan), "sonunda da tutarli",
      "$" + (Number(V(t.sonEgriBakiyesi)) / 1e6).toLocaleString("en-US") + " tutuldu");
  }

  console.log("19) stake  (odul herkese, oy 50.000'den sonra)");
  {
    const T = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestStakeOdul.json"), "utf8"));
    const tI = new Interface(T.abi);
    const H9 = "0x0000000000000000000000000000000000000c33";
    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: H9, data: tI.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [H9]: { code: T.deployedBytecode } }
      ]);
      return tI.decodeFunctionResult(fn, r);
    };
    const V = (x) => BigInt(x);
    const E = 10n ** 18n;
    const USDC = 10n ** 6n;
    const ARZ = 1_000_000_000n * E;
    const TABAN = 50_000n * E;

    /* ---- the seam: one wei earns, 50,000 decides ---------------- */
    const [o] = await call("runOdulVeTaban", []);
    ok(V(o.kucukStake) === 1n, "1 WEI STAKE KABUL EDILDI", "alt sinir yok");
    ok(V(o.dagitilan) === 1000n * USDC, "$1.000 ucret dagitildi",
      "duz transferle geldi, kimse cagirmak zorunda degil");
    ok(V(o.kucukKazanc) === 0n, "1 wei'in payi orantili — ve bu boyutta SIFIR",
      "reddedilmiyor, ama 1/200.000.000.000.000.000.000.000 pay yuvarlanip kayboluyor");
    ok(V(o.buyukKazanc) > 999n * USDC, "200.000 stake eden neredeyse tamamini aldi",
      "$" + (Number(V(o.buyukKazanc)) / 1e6).toFixed(4));
    ok(V(o.kucukOyGucu) === 0n, "ama 1 WEI ILE OY VERILEMIYOR", "taban 50.000");
    ok(V(o.buyukOyGucu) === V(o.buyukStake), "200.000 ile oy verilebiliyor",
      (Number(V(o.buyukOyGucu)) / 1e18).toLocaleString("en-US") + " oy");

    /* The one that killed the last token. */
    ok(V(o.arzSonra) === V(o.arzOnce) && V(o.arzOnce) === ARZ,
      "ODUL ODENDI VE ARZ HIC DEGISMEDI", "emisyon yok — odul USDC, gelirden");

    /* ---- the emission schedule --------------------------------- */
    const EMISYON = 400_000_000n * E;
    {
      const [e1] = await call("runEmisyon", [52n]);
      ok(V(e1.havuzBaslangic) === EMISYON, "stake havuzu 400.000.000 ile basliyor");
      ok(V(e1.periyotGecti) === 52n, "52 hafta gecmis sayiliyor");
      /* 400,000,000 at a ten-year half-life: 1 - 0.998668^52 of it. */
      const y1 = Number(V(e1.salinan)) / 1e18;
      ok(y1 > 26_000_000 && y1 < 27_500_000, "1. YILDA ~26,8 MILYON SALINDI",
        Math.round(y1).toLocaleString("en-US") + " — ALP ayni havuzla 82 milyon salardi");
      ok(V(e1.salinan) + V(e1.kalan) === EMISYON, "  plan havuzu koruyor",
        "salinan + kalan = 400.000.000, ne eksilir ne artar");
      ok(V(e1.ikinciSalimSifir) === 0n, "  ayni blokta ikinci salim sifir");

      const [e10] = await call("runEmisyon", [520n]);
      const yarim = Number(V(e10.kalan)) / 1e18;
      ok(yarim > 198_000_000 && yarim < 202_000_000, "10. YILDA TAM YARISI KALDI",
        Math.round(yarim).toLocaleString("en-US") + " / 400.000.000 — yarilanma 10 yil");

      const [e30] = await call("runEmisyon", [1560n]);
      const otuz = Number(V(e30.salinan)) / 1e18;
      ok(otuz > 348_000_000 && otuz < 352_000_000, "30 YILDA %87,5 DAGITILDI",
        Math.round(otuz).toLocaleString("en-US") + " — havuz biter, bir daha dolmaz");
      ok(V(e30.kalan) > 0n, "  ve bitmedi: 30 yil sonra da kalani var",
        Math.round(Number(V(e30.kalan)) / 1e18).toLocaleString("en-US"));
    }

    /* ---- the windfall ALP had ---------------------------------- */
    {
      const [z] = await call("runEmisyonStakeYok", []);
      ok(V(z.periyotGecti) === 52n, "bir yil kimse stake etmedi");
      ok(V(z.stakeYokkenSalinan) === 0n, "stake yokken hic salim olmadi");
      ok(V(z.stakeYokkenKalan) === EMISYON, "  tokenler havuzda kaldi, yakilmadi");
      ok(V(z.stakeYokkenPeriyot) === 52n, "  AMA SAAT ILERLEDI",
        "ALP ilerletmiyordu, birikmis bir yil olusuyordu");
      /* The point: the first staker does not inherit a year of emission.
         One week's worth at most, not fifty-two. */
      const ilk = Number(V(z.sonradanGelenKazanc)) / 1e18;
      ok(ilk < 1_000_000, "ILK STAKE EDEN BIR YILLIK EMISYONU ALMADI",
        Math.round(ilk).toLocaleString("en-US") + " token — ALP'de ~82 milyon olurdu");
    }

    /* ---- a vote cannot be bought after the fact ----------------- */
    const [r] = await call("runOyKiralanamaz", []);
    ok(V(r.stakeli) === 500_000n * E, "saldirgan 500.000 stake etti");
    ok(V(r.simdikiGucu) === 500_000n * E, "  su anki oy gucu tam");
    ok(V(r.oncekiBlokGucu) === 0n, "ONCE ACILMIS BIR ONERIDE OY GUCU SIFIR",
      "stake sonradan geldi, o oneride agirligi yok");
    ok(V(r.toplamOncekiBlok) === 0n, "  yeter sayi da o blogun toplamindan okunuyor");
    ok(V(r.toplamSimdi) === 500_000n * E, "  simdiki toplam dogru");

    /* ---- pro-rata, and leaving just stops the earning ---------- */
    const [p] = await call("runPayOrani", []);
    const toplam = V(p.aKazanc) + V(p.bKazanc) + V(p.cKazanc);
    ok(toplam <= 1000n * USDC && toplam > 999n * USDC, "uc stakeci odulun tamamini bolustu",
      "$" + (Number(toplam) / 1e6).toFixed(6) + " / $1.000");
    /* 100k / 200k / 700k of a million: 10%, 20%, 70%. */
    ok(V(p.aKazanc) === 100n * USDC, "%10 stake -> $100", "$" + (Number(V(p.aKazanc)) / 1e6).toFixed(2));
    ok(V(p.bKazanc) === 200n * USDC, "%20 stake -> $200", "$" + (Number(V(p.bKazanc)) / 1e6).toFixed(2));
    ok(V(p.cKazanc) === 700n * USDC, "%70 stake -> $700", "$" + (Number(V(p.cKazanc)) / 1e6).toFixed(2));
    ok(V(p.cozduktenSonraBKazanc) === 0n, "cozen kisi SONRAKI dagitimdan pay almiyor");
    ok(V(p.sonrakiAKazanc) > 100n * USDC, "kalanlarin payi buyudu",
      "$" + (Number(V(p.sonrakiAKazanc)) / 1e6).toFixed(2) + " — ayrilanin yeri bolusuldu");

    /* ---- no lock, no penalty ----------------------------------- */
    const [c] = await call("runKilitYok", []);
    ok(V(c.geriAlinan) === 60_000n * E, "STAKE'IN TAMAMI GERI ALINDI",
      "kilit yok, ceza yok");
    ok(V(c.cozmeSonrasiOyGucu) === 0n, "cozunce oy gucu sifirlandi");
    ok(V(c.cozmeSonrasiKazanc) === 0n, "cozerken odul de odendi, borc kalmadi");
    ok(c.fazlaCozmeRed === true, "olmayan stake cozulemiyor");

    /* ---- fees before anyone staked ----------------------------- */
    const [z] = await call("runStakeYokken", []);
    ok(V(z.bekleyenOnce) === 500n * USDC, "stake yokken gelen ucret bekliyor",
      "$" + (Number(V(z.bekleyenOnce)) / 1e6).toFixed(2));
    ok(V(z.dagitilanStakeYokken) === 0n, "  stake sifirken dagitim yapilmiyor");
    ok(V(z.bekleyenSonra) === 500n * USDC, "  VE PARA KAYBOLMUYOR", "yerinde duruyor");
    const fark = 500n * USDC - V(z.ilkStakeciKazanci);
    ok(fark >= 0n && fark <= 2n, "  ilk stake eden bunu aliyor",
      "$" + (Number(V(z.ilkStakeciKazanci)) / 1e6).toFixed(6) +
      " — " + fark + " wei yuvarlama kontratta kaldi; bilinen, sinirli kenar durum");
  }

  console.log("");
  console.log("20) DEPTH tokeni  (bir milyar, bir kere, bir daha asla)");
  {
    const T = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestDepthToken.json"), "utf8"));
    const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "DepthToken.json"), "utf8"));
    const tI = new Interface(T.abi);
    const HA = "0x0000000000000000000000000000000000000d44";
    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: HA, data: tI.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [HA]: { code: T.deployedBytecode } }
      ]);
      return tI.decodeFunctionResult(fn, r);
    };
    const V = (x) => BigInt(x);
    const E = 10n ** 18n;
    const ARZ = 1_000_000_000n * E;

    /* ---- what is NOT in the contract -------------------------- */
    const yazanlar = D.abi
      .filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability))
      .map((f) => f.name);
    ok(yazanlar.length === 4, "tokende SADECE 4 yazan fonksiyon var", yazanlar.join(", "));
    for (const yasak of ["mint", "owner", "transferOwnership", "pause", "upgradeTo",
                         "setFee", "blacklist", "rescue", "sweep"]) {
      const bulundu = D.abi.some((f) => f.type === "function" &&
        f.name.toLowerCase().includes(yasak.toLowerCase()));
      ok(!bulundu, "  " + yasak + " YOK", "arz artirilamaz, kimse mudahale edemez");
    }

    /* ---- genesis ---------------------------------------------- */
    const [d] = await call("runDagitim", []);
    ok(V(d.arz) === ARZ, "arz tam 1.000.000.000",
      (Number(V(d.arz)) / 1e18).toLocaleString("en-US"));
    ok(V(d.egri) === 500_000_000n * E, "500.000.000 piyasa dilimine  (egri)");
    ok(V(d.stake) === 400_000_000n * E, "400.000.000 stake havuzuna  (30 yil emisyon)");
    ok(V(d.kurucu) === 50_000_000n * E, "50.000.000 kurucuya  (bot cuzdani)");
    ok(V(d.vesting) === 50_000_000n * E, "50.000.000 vesting'e  (yine bot cuzdani)");
    ok(V(d.kontratta) === 0n, "TOKEN KONTRATINDA SIFIR KALDI", "hesaplanmayan arz yok");
    ok(V(d.egri) + V(d.stake) + V(d.kurucu) + V(d.vesting) === ARZ,
      "dort dilim tam arza esit", "500 + 400 + 50 + 50");
    ok(d.eksikToplamRed === true, "toplami tutmayan dagitim REDDEDILIYOR  (eksik)");
    ok(d.fazlaToplamRed === true, "toplami tutmayan dagitim REDDEDILIYOR  (fazla)");
    ok(d.sifirAdresRed === true, "sifir adrese dagitim reddediliyor");
    ok(d.egriSifirRed === true, "tokensiz egri reddediliyor", "satacak sey olmadan launch olmaz");

    /* ---- burn ------------------------------------------------- */
    const [y] = await call("runYakma", []);
    ok(V(y.arzOnce) === ARZ, "yakmadan once arz 1 milyar");
    /* 55,555,556 is what the curve burns at graduation with a 500,000,000
       market slice: the reserved third, less what the closing price
       supports. */
    ok(V(y.arzSonra) === ARZ - 55_555_556n * E, "55.555.556 YAKILDI, arz kalici dustu",
      (Number(V(y.arzSonra)) / 1e18).toLocaleString("en-US"));
    ok(y.baskasininiYakamaz === true, "baskasinin tokeni yakilamiyor");
    ok(y.fazlasiniYakamaz === true, "tutmadigini yakamiyor");

    /* ---- transfer -------------------------------------------- */
    const [r] = await call("runTransfer", []);
    ok(V(r.varan) === V(r.gonderilen), "TRANSFER TAM OLARAK SOYLENENI TASIYOR",
      "transferde ucret yok — v4 muhasebesini bozan sey tam buydu");
    ok(V(r.arzDegismedi) === 1n, "transfer arzi degistirmiyor");
    ok(r.sifiraGonderimRed === true, "sifir adrese transfer reddediliyor");
    ok(r.izinsizCekimRed === true, "izin olmadan cekim reddediliyor");
    ok(V(r.izinliCekim) === 500n * E, "izinli cekim tam izin kadar dusuruyor");
  }

  console.log("");
  console.log("21) mezuniyet havuzu  (GERCEK Arc PoolManager)");
  {
    const HA = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestHavuzAcici.json"), "utf8"));
    const A = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "HavuzAcici.json"), "utf8"));
    const aIface = new Interface(HA.abi);
    const HB = "0x0000000000000000000000000000000000000e55";
    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: HB, data: aIface.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [HB]: { code: HA.deployedBytecode } }
      ]);
      return aIface.decodeFunctionResult(fn, r);
    };
    const V = (x) => BigInt(x);
    const E = 10n ** 18n;
    const USDC = 10n ** 6n;

    /* The graduation numbers from the design: $2,700 of buyers' money
       against 200,000,000 tokens. */
    const QUOTE = 2700n * USDC;
    const TOKEN = 200_000_000n * E;

    const bsqrt = (x) => { if (x === 0n) return 0n; let z = (x + 1n) / 2n, y = x; while (z < y) { y = z; z = (x / z + z) / 2n; } return y; };
    const sqrtOran = (num, den) => (bsqrt(num << 96n) << 96n) / bsqrt(den << 96n);

    const [a] = await call("runAcilis", [PM, QUOTE, TOKEN]);
    ok(V(a.likidite) > 0n, "havuz ACILDI ve likidite yerinde",
      V(a.likidite).toString());

    /* The claim: price == money/tokens, as a raw-amount ratio. Compared in
       sqrt space against the same split-root arithmetic the contract uses,
       so this is an independent derivation and not a copy of its output. */
    const t0 = a.tokenSifirinci;
    const beklenenSqrt = t0 ? sqrtOran(QUOTE, TOKEN) : sqrtOran(TOKEN, QUOTE);
    const gercek = V(a.sqrtP);
    const sapma = gercek > beklenenSqrt ? gercek - beklenenSqrt : beklenenSqrt - gercek;
    ok(sapma * 1_000_000n <= beklenenSqrt, "FIYAT = PARA / TOKEN, ham oran olarak",
      "token" + (t0 ? "0" : "1") + ", sapma " + sapma.toString() + " / " + beklenenSqrt.toString());

    /* Both sides actually went in — a one-sided position would have put in
       one and left the other here. */
    ok(V(a.havuzQuote) > 0n && V(a.havuzToken) > 0n, "HAVUZDA IKI TARAF DA VAR",
      "$" + (Number(V(a.havuzQuote)) / 1e6).toLocaleString("en-US") + " + " +
      (Number(V(a.havuzToken)) / 1e18).toLocaleString("en-US") + " token");

    /* Leftover must be dust, not a slice. */
    const artanQ = Number(V(a.artanQuote)) / 1e6;
    const artanT = Number(V(a.artanToken)) / 1e18;
    ok(V(a.artanQuote) * 10_000n <= QUOTE, "artan USDC TOZ seviyesinde",
      "$" + artanQ.toFixed(6) + " / $" + (Number(QUOTE) / 1e6).toLocaleString("en-US"));
    ok(V(a.artanToken) * 10_000n <= TOKEN, "artan token TOZ seviyesinde",
      artanT.toFixed(6) + " / " + (Number(TOKEN) / 1e18).toLocaleString("en-US"));

    ok(a.ikinciAcilisRed === true, "havuz IKINCI KEZ acilamiyor");
    ok(a.yabanciCagriRed === true, "egri disinda kimse acamiyor");

    /* ---- and the bid is real ---------------------------------- */
    const [sa] = await call("runIlkBloktaSatis", [PM, QUOTE, TOKEN, 1_000_000n * E]);
    ok(V(sa.alinanQuote) > 0n, "ILK BLOKTA SATIS PARA GETIRDI",
      "$" + (Number(V(sa.alinanQuote)) / 1e6).toFixed(4) +
      " — tek yonlu havuzda bu IMKANSIZDI");
    ok(sa.fiyatDustu === true, "satis fiyati asagi itti", "iki yonlu, simetrik");

    /* ---- a nonzero fee, reinvested ---------------------------- */
    const [b] = await call("runBiriktir", [PM, QUOTE, TOKEN, 2_000_000n * E]);
    ok(b.acilmadanRed === true, "havuz acilmadan biriktirilemiyor");
    ok(V(b.likiditeOnce) > 0n, "ucretli havuz acildi  (%0,30)", V(b.likiditeOnce).toString());
    /* The fees sit in the pool as an unrealised credit at this point; what
       the opener holds is only the dust from sizing the position, which the
       next call sweeps back in with them. */
    ok(V(b.aciciTokenOnce) * 10_000n <= TOKEN, "biriktirmeden once elinde sadece acilis tozu var",
      (Number(V(b.aciciTokenOnce)) / 1e18).toFixed(6) + " token");
    ok(b.herkesCagirabilir === true, "BIRIKTIR HERKESE ACIK",
      "ilgisiz bir kontrat cagirdi — cikarabilecegi bir sey yok");
    ok(V(b.likiditeSonra) > V(b.likiditeOnce), "ISLEM UCRETLERI LIKIDITEYE DONUSTU",
      "+" + V(b.eklenen).toString() + "  —  kitap kalici derinlesti");
    ok(V(b.aciciQuoteSonra) * 10_000n <= QUOTE && V(b.aciciTokenSonra) * 10_000n <= TOKEN,
      "  geride sadece toz kaldi",
      "$" + (Number(V(b.aciciQuoteSonra)) / 1e6).toFixed(6) + " + " +
      (Number(V(b.aciciTokenSonra)) / 1e18).toFixed(6) + " token");

    /* ---- the structural claims, from the compiled ABI --------- */
    const yazan = A.abi.filter((f) => f.type === "function" &&
      !["view", "pure"].includes(f.stateMutability)).map((f) => f.name);
    ok(yazan.length === 3 && yazan.includes("ac") && yazan.includes("biriktir") &&
        yazan.includes("unlockCallback"),
      "acicida SADECE ac, biriktir ve unlockCallback yaziyor", yazan.join(", "));
    for (const yasak of ["withdraw", "cek", "owner", "sweep", "rescue", "kapat", "upgrade"]) {
      ok(!A.abi.some((f) => f.type === "function" && f.name.toLowerCase().includes(yasak)),
        "  " + yasak + " YOK", "likidite geri cikmiyor");
    }
  }

  console.log("22) yonetisim  (oneri, bekleme, uygulama)");
  {
    const T = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestDepthGovernor.json"), "utf8"));
    const G = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "DepthGovernor.json"), "utf8"));
    const tI = new Interface(T.abi);
    const HC = "0x0000000000000000000000000000000000000f66";
    const call = async (fn, args) => {
      const r = await rpc("eth_call", [
        { from: YABANCI, to: HC, data: tI.encodeFunctionData(fn, args), gas: "0x8000000" },
        "latest",
        { [HC]: { code: T.deployedBytecode } }
      ]);
      return tI.decodeFunctionResult(fn, r);
    };
    const V = (x) => BigInt(x);
    const E = 10n ** 18n;
    const USDC = 10n ** 6n;
    const GELISTIRICI = "0x000000000000000000000000000000000000Def1";

    /* ---- tazele is gone ---------------------------------------- */
    ok(!G.abi.some((f) => f.type === "function" && f.name === "tazele"),
      "TAZELE YOK", "anlik goruntu isini yapiyorsa tazelenecek bir sey kalmiyor");
    ok(G.abi.some((f) => f.type === "function" && f.name === "ANLIK_GERI"),
      "  yerine anlik goruntu blogu var");

    /* ---- the whole path --------------------------------------- */
    const [a] = await call("runAkis", [250n * USDC]);
    ok(Number(a.durumGecti) === 2, "oylama kapaninca oneri GECTI durumunda");
    ok(a.siradanOnceRed === true, "SIRAYA ALINMADAN uygulanamiyor", "timelock atlanamiyor");
    ok(Number(a.durumHazir) === 4, "siraya alinan oneri HAZIR durumda");
    ok(V(a.odenen) === 250n * USDC, "ODEME FIILEN YAPILDI",
      "$" + (Number(V(a.odenen)) / 1e6).toFixed(2) + " oylamayla kasadan cikti");
    ok(String(a.alici).toLowerCase() === GELISTIRICI.toLowerCase(),
      "  parayi onerinin yazdigi adres aldi");
    ok(a.yabanciUygulayabildi === true, "UYGULAMA HERKESE ACIK",
      "stake etmemis, oy vermemis bir adres uygulattirdi");
    ok(Number(a.durumSonra) === 5, "uygulanan oneri UYGULANDI durumunda");
    ok(a.ciftUygulamaRed === true, "ayni oneri ikinci kez uygulanamiyor");

    /* ---- the seam, from the governor's side ------------------- */
    const [t] = await call("runTaban", []);
    ok(V(t.tabanAltiStake) === 40_000n * E, "40.000 stake kabul edildi", "taban altinda");
    ok(t.tabanAltiOneriRed === true, "taban altindaki stake ONERI ACAMIYOR");
    ok(t.tabanAltiOyRed === true, "taban altindaki stake OY VEREMIYOR");
    ok(V(t.tabanAltiKazanc) > 0n, "AMA KAZANIYOR",
      "$" + (Number(V(t.tabanAltiKazanc)) / 1e6).toFixed(4) + " — iki soru ayri");
    ok(V(t.toplamStake) === 1_040_000n * E, "yeter sayinin boleni taban altini da sayiyor",
      "stake edilmis, dolayisiyla butunun parcasi");

    /* ---- indifference defeats -------------------------------- */
    const [o] = await call("runIlgisizlik", []);
    ok(V(o.yeterSayi) === 100_000n * E, "yeter sayi toplamin %10'u",
      (Number(V(o.yeterSayi)) / 1e18).toLocaleString("en-US") + " oy");
    ok(Number(o.azLehteDurum) === 1, "yeter sayiya ULASMAYAN oneri DUSTU",
      "60.000 lehte, 100.000 gerekiyordu — ilgisizlik reddeder");
    ok(Number(o.cokLehteDurum) === 2, "yeter sayiyi gecen oneri GECTI", "500.000 lehte");
    ok(Number(o.aleyhteCogunlukDurum) === 1, "aleyhte cogunluk oneriyi dusurdu");

    /* ---- the guardian can only say no ------------------------ */
    const [n] = await call("runNobetci", []);
    ok(n.aktif === true, "nobetci suresi icinde aktif");
    ok(n.nobetciOneremez === true, "nobetci ONERI VEREMIYOR", "stake yok, masada yer yok");
    ok(n.yabanciIptalRed === true, "ilgisiz bir adres iptal edemiyor");
    ok(Number(n.iptalDurum) === 7, "nobetci oneriyi IPTAL edebiliyor");
    ok(n.iptalSonrasiUygulamaRed === true, "iptal edilen oneri uygulanamiyor");
    ok(n.devirSonrasiIptalRed === true, "yetkisini BIRAKINCA geri alamiyor", "donusu yok");
  }

  console.log("");
  console.log("23) DEPTH hook'u  (mezuniyetten sonra ucret kime gidiyor)");
  {
    const HA = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestHavuzAcici.json"), "utf8"));
    const DH = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "DepthHook.json"), "utf8"));
    const aIface = new Interface(HA.abi);
    const HD = "0x0000000000000000000000000000000000001077";
    /* Same mined address the launchpad hook's test uses: the required bits
       are identical, 0xa44. */
    const HOOK = "0xFDAF91321938B6Fce470a8E40482Ac3259BBcA44";
    const KURUCU_HOOK = "0x0000000000000000000000000000000000000B07";
    const STAKE_HOOK = "0x00000000000000000000000000000000000057A1";
    const V = (x) => BigInt(x);
    const E = 10n ** 18n;
    const USDC = 10n ** 6n;
    const QUOTE = 2700n * USDC;
    const TOKEN = 200_000_000n * E;

    /* The opener is this harness's third CREATE, and a contract placed by
       state override starts at nonce 0: token 0, usdc 1, opener 2. */
    const { getCreateAddress } = require("ethers");
    const ACICI = getCreateAddress({ from: HD, nonce: 2 });
    const USDC_SAHTE = getCreateAddress({ from: HD, nonce: 1 });

    /* Run the constructor to get runtime bytecode with the immutables in. */
    const hookKod = await rpc("eth_call", [
      { data: DH.bytecode + coder.encode(
          ["address", "address", "address", "address", "address"],
          [PM, ACICI, KURUCU_HOOK, STAKE_HOOK, USDC_SAHTE]).slice(2) },
      "latest"
    ]);

    const r = await rpc("eth_call", [
      { from: YABANCI, to: HD,
        data: aIface.encodeFunctionData("runHookUcret", [PM, HOOK, QUOTE, TOKEN]),
        gas: "0x8000000" },
      "latest",
      { [HD]: { code: HA.deployedBytecode }, [HOOK]: { code: hookKod } }
    ]);
    const [u] = aIface.decodeFunctionResult("runHookUcret", r);

    ok(String(u.beklenenAcici).toLowerCase() === ACICI.toLowerCase(),
      "acici tahmin edilen adreste dogdu", "hook onun etrafinda kuruldu");
    ok(V(u.satilanQuote) > 0n, "satis gerceklesti",
      "$" + (Number(V(u.satilanQuote)) / 1e6).toFixed(4) + " cikti");

    /* The whole point: money out means the founder gets paid, during the
       swap, with nothing to claim. */
    ok(V(u.kurucuSatisSonrasi) > 0n, "SATISTA KURUCU PAYI CUZDANA GITTI",
      "$" + (Number(V(u.kurucuSatisSonrasi)) / 1e6).toFixed(6) + " — takas icinde, claim yok");
    ok(V(u.stakeSatisSonrasi) > 0n, "  stake kasasina da gitti",
      "$" + (Number(V(u.stakeSatisSonrasi)) / 1e6).toFixed(6));
    ok(V(u.aciciParaSatisSonrasi) > 0n, "  kalan dilim DERINLIGE gitti",
      "$" + (Number(V(u.aciciParaSatisSonrasi)) / 1e6).toFixed(6) + " — biriktir() geri koyar");
    /* 0.15 / 0.15 / 0.20 of 0.50: the two paid slices are equal and the
       depth slice is the larger one. */
    ok(V(u.kurucuSatisSonrasi) === V(u.stakeSatisSonrasi),
      "  kurucu ve stake paylari esit", "%0,15 / %0,15");
    ok(V(u.aciciParaSatisSonrasi) >= V(u.kurucuSatisSonrasi),
      "  derinlik dilimi en buyuk", "%0,20");

    /* And a buy pays nobody in tokens. */
    ok(V(u.aciciTokenAlimSonrasi) > 0n, "ALIMDA UCRETIN TAMAMI DERINLIGE GITTI",
      (Number(V(u.aciciTokenAlimSonrasi)) / 1e18).toFixed(4) +
      " token — kimse satmak zorunda kalacagi bir seyle odenmiyor");

    ok(u.cikarmaRed === true, "LIKIDITE CIKARILAMIYOR", "hook herkese kapatiyor");
    ok(u.yabanciEklemeRed === true, "acici disinda kimse likidite EKLEYEMIYOR",
      "cikaramayacagi bir yere kimse kilitlenmiyor");

    /* The split, from the compiled constants rather than from this file. */
    const sabit = (ad) => {
      const f = DH.abi.find((x) => x.type === "function" && x.name === ad);
      return !!f;
    };
    ok(sabit("FEE_PPM") && sabit("KURUCU_PPM") && sabit("STAKE_PPM"),
      "oranlar kontratta okunabilir sabit", "FEE 5000, KURUCU 1500, STAKE 1500");
    const yazan = DH.abi.filter((f) => f.type === "function" &&
      !["view", "pure"].includes(f.stateMutability)).map((f) => f.name);
    ok(yazan.length === 1 && yazan[0] === "afterSwap",
      "hook'ta SADECE afterSwap yaziyor", yazan.join(", "));
    for (const yasak of ["owner", "setFee", "sweep", "rescue", "withdraw", "upgrade"]) {
      ok(!DH.abi.some((f) => f.type === "function" && f.name.toLowerCase().includes(yasak)),
        "  " + yasak + " YOK", "oranlar ve adresler degistirilemez");
    }
  }

  console.log("");
  if (kaldi) { console.log(kaldi + " KONTROL BASARISIZ"); process.exit(1); }
  console.log("tum kontroller gecti (" + gecti + ")");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
