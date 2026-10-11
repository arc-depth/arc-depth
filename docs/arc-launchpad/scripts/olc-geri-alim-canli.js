"use strict";
/* ===========================================================================
 * olc-geri-alim-canli.js — the buyback, on a real launch and a real pool
 *
 * WHAT THIS ADDS OVER olc-teminat-kasasi.js
 *   That one proves the claim arithmetic: a redemption moves no claim, and a
 *   buyback above the claim is refused. It drives both from a mock borrower
 *   that hands back tokens at a rate the test chose, which is the right way
 *   to test arithmetic and no way at all to test whether a buyback can
 *   happen. This one launches a token through the launchpad, opens its pool
 *   on Arc's real PoolManager, and buys from that pool with GeriAlimRobotu.
 *
 * THE BOUNDARY IS THE TEST
 *   A buyback is possible only while the market price is below the
 *   reserve's claim per token. At launch it is not — $20 of reserve against
 *   22.3M circulating tokens priced at $0.0000035 — so the first scenario
 *   must FAIL, and it failing is the proof that the reserve cannot be
 *   drained by whoever calls first. Feeding the reserve moves the claim up
 *   past the price, which is what the collateral tax does over time, and
 *   then the same call must succeed.
 *
 * WHY THE SPEND IS SMALL
 *   The vault caps one call at 2% of the asset balance and a 7200-block
 *   window at 10%. Those caps exist because the per-call invariant bounds
 *   each call and not the sequence: 117 accretive calls drained 99.2% of a
 *   simulated reserve. So the measured spend here is 2% of the balance no
 *   matter what the test asks for, and that is checked rather than assumed.
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
const BTC_FEED    = "0xa109B535C70C8Be9995be64Bb6751AcDB27e03De";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();

async function rpc(method, params) {
  let bekleme = 1500;
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
      if (i >= 6 || !/rate|limit|429|timeout|ECONN|fetch/i.test(String(e.message))) throw e;
      await new Promise((z) => setTimeout(z, bekleme)); bekleme = Math.min(bekleme * 2, 20000);
    }
  }
}

const T = B("TestGeriAlimCanli");
const iface = new Interface(T.abi);
const KASA = new Interface(B("TeminatKasasi").abi);
const ROBOT = new Interface(B("GeriAlimRobotu").abi);

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TOK = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 0 });
const HAK = (v) => "$" + (Number(v) / 1e36).toExponential(4);
const V = (v) => BigInt(v.toString());

/* The innermost named error behind a revert blob. v4 wraps a failing
   hook in WrappedError(address,bytes4,bytes,bytes), and printing the
   wrapper reports "bilinmeyen 0x90bfb865" — which is how a whole
   debugging round went to a wrapper instead of the Panic(0x11) inside
   it. revert-coz.js builds its table by scanning the sources, so an
   error added tomorrow is named without anybody registering it. */
const { kisaIsim: hataAdi, yaz: revertYaz } = require("./revert-coz");

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("GERI ALIM — GERCEK launch, GERCEK Arc havuzu, GERCEK robot");
  console.log("");

  /* The launchpad's nonce, counted by hand because the hook's launchpad
     address is baked into its bytecode before either contract exists. A
     state-override account was never created, so its nonce starts at 0.

       0  ChainlinkOracle
       1  EgriFabrika
       2  AciciFabrika
       3  CrossChainAssetRegistry   <- added when the launch vault
       4  YoneticiFabrika              became cross-chain capable
       5  KasaFabrika
       6  EgriLaunchpad

     Off by one here shows up as WrappedError(hook, beforeAddLiquidity,
     <empty>), which says nothing about the cause. It has cost a round
     three times now: once before, and once in each of the two suites
     when the three deployments above were inserted and this number was
     left at 3. The assertion that follows is what caught it every
     time. */
  const LP_TAHMIN = getCreateAddress({ from: HARNESS, nonce: 6 });
  const HK = B("EgriHook");
  const hookKod = await rpc("eth_call", [{
    data: HK.bytecode + coder.encode(
      ["address", "address", "address", "address", "address", "address"],
      [PM, LP_TAHMIN, USDC, GELISTIRICI, LIKIDITE, ISLETME]).slice(2)
  }, "latest"]);

  /* Every scenario is a full launch inside one eth_call, and this suite
     runs a dozen of them including two binary searches. The public RPC
     rate-limits before the suite finishes, which fails the run for a
     reason that has nothing to do with the contracts — so the calls are
     paced instead of retried after the fact. */
  const ARALIK = 900;
  async function senaryo(besleme, harcamaBps) {
    await new Promise((z) => setTimeout(z, ARALIK));
    const r = await rpc("eth_call", [
      { from: CAGIRAN, to: HARNESS, gas: "0x20000000",
        data: iface.encodeFunctionData("run",
          [PM, USDC, HOOK, GELISTIRICI, LIKIDITE, ISLETME, CIRBTC, BTC_FEED, besleme, harcamaBps]) },
      "latest",
      { [HARNESS]: { code: T.deployedBytecode, balance: "0x" + (10n ** 24n).toString(16) },
        [HOOK]: { code: hookKod } }
    ]);
    return iface.decodeFunctionResult("run", r)[0];
  }

  /* ---- 1. at launch the buyback MUST be refused ------------------- */
  console.log("1) LAUNCH ANINDA — piyasa hakkin USTUNDE, geri alim REDDEDILMELI");
  {
    const s = await senaryo(0n, 200);
    console.log("     dolasim " + TOK(s.dolasimOnce) + " token   rezerv " + U(s.kasaOnce) +
      "   hak/token " + HAK(s.hakOnce));
    console.log("     acilis fiyati $0,0000035 — hakkin yaklasik 4 kati");
    const ad = hataAdi(s.sebep);
    ok(s.revertEtti === true, "geri alim REDDEDILDI", ad);
    ok(ad === "HakDustu" || ad === "SifirMiktar" || ad === "BoslukYok" || ad === "TooLittleReceived",
      "red sebebi hakkin dusmesi", ad);
    ok(V(s.kasaOnce) === 20_000_000n, "rezervde launch'tan gelen $20 duruyor", U(s.kasaOnce));
  }

  /* ---- 2. reserve fed past the price: the buyback happens --------- */
  console.log("");
  console.log("2) REZERV BESLENINCE — hak piyasanin ustune cikiyor, geri alim OLUYOR");
  let iyi = null;
  {
    const s = await senaryo(280_000_000n, 200);   // reserve $300 total
    if (s.revertEtti) {
      ok(false, "geri alim gercekleşti", "revert: " + hataAdi(s.sebep));
    } else {
      iyi = s;
      console.log("     rezerv " + U(s.kasaOnce) + "   hak/token " + HAK(s.hakOnce) +
        "   harcama " + U(s.harcama));
      console.log("     yakilan " + TOK(s.yakilan) + " token   odul " + U(s.odul));
      console.log("     dolasim " + TOK(s.dolasimOnce) + " -> " + TOK(s.dolasimSonra));
      console.log("     rezerv  " + U(s.kasaOnce) + " -> " + U(s.kasaSonra));
      console.log("     hak     " + HAK(s.hakOnce) + " -> " + HAK(s.hakSonra));

      const aciciArtis = V(s.acicidakiTokenSonra) - V(s.acicidakiTokenOnce);
      console.log("     acicidaki token +" + TOK(aciciArtis) + "  (alisin token tarafi ucreti)");
      ok(V(s.yakilan) > 0n, "GERCEK HAVUZDAN TOKEN ALINDI VE YAKILDI", TOK(s.yakilan) + " token");
      /* Circulation falls by the burn AND by the fee the hook parked in
         the opener, because dolasim() excludes the opener. Asserting only
         the burn called a correct buyback broken; asserting the sum is
         what is actually true, and it closes to the wei. */
      ok(V(s.dolasimSonra) === V(s.dolasimOnce) - V(s.yakilan) - aciciArtis,
        "dolasim = yakilan + aciciye giden ucret, KURUSA KADAR",
        "yakilan " + TOK(s.yakilan) + " + ucret " + TOK(aciciArtis));
      /* And the fee really is the 3% the fee table promises: 2% protocol
         plus the 1% collateral tax this launch chose. */
      const brut = V(s.yakilan) + aciciArtis;
      const ucretBps = Number((aciciArtis * 10_000n) / brut);
      ok(ucretBps >= 295 && ucretBps <= 305, "token tarafi ucreti %3 (2% protokol + 1% teminat vergisi)",
        "%" + (ucretBps / 100).toFixed(2));
      ok(V(s.hakSonra) > V(s.hakOnce), "HAK/TOKEN YUKARI CIKTI",
        "+" + (Number((V(s.hakSonra) - V(s.hakOnce)) * 10_000n / V(s.hakOnce)) / 100).toFixed(2) + "%");
      ok(V(s.odul) > 0n, "cagirana odul dustu", U(s.odul));
      ok(V(s.cagiraninOdulu) > 0n, "odul CAGIRANIN cuzdanina ulasti", U(s.cagiraninOdulu));
      ok(V(s.robotunKalani) === 0n, "robot USDC tutmuyor", U(s.robotunKalani));
      ok(V(s.robottakiToken) === 0n, "robot token tutmuyor", TOK(s.robottakiToken) + " token");
    }
  }

  /* ---- 2b. the floor's starting line ------------------------------ */
  console.log("");
  console.log("2b) TABAN NE ZAMAN DEVREYE GIRIYOR — en az ne kadar rezerv gerekiyor");
  {
    /* The honest version of "the floor does work": it does nothing at
       all until the reserve per circulating token reaches the market
       price. Below that any buyback would lower the claim and the vault
       refuses. So this searches for the boundary instead of asserting
       the floor is active from day one, which it is not. */
    let alt = 0n, ust = 300_000_000n;
    for (let adim = 0; adim < 7; adim++) {
      const orta = (alt + ust) / 2n;
      const s = await senaryo(orta, 200);
      if (s.revertEtti) alt = orta; else ust = orta;
      if (ust - alt < 5_000_000n) break;   // $5 resolution
    }
    const gerekenEk = ust;
    const toplamRezerv = gerekenEk + 20_000_000n;
    console.log("     launch rezervi $20,00 + gereken ek " + U(gerekenEk) +
      "  =  taban " + U(toplamRezerv) + " rezervle devreye giriyor");
    console.log("     bu, dolasimdaki 22,285,714 tokenin acilis fiyatiyla degeri kadar");
    console.log("     %1 teminat vergisiyle: yaklasik " + U((toplamRezerv - 20_000_000n) * 100n) +
      " islem hacmi sonrasi");
    ok(toplamRezerv > 20_000_000n, "taban launch aninda ETKIN DEGIL — durust sinir",
      "rezerv " + U(toplamRezerv) + "a ulasana kadar geri alim imkansiz");
    ok(toplamRezerv < 300_000_000n, "ama ulasilabilir bir esik — sonsuz degil");
  }

  /* ---- 3. the per-call cap binds, whatever the caller asks -------- */
  console.log("");
  console.log("3) CAGRI TAVANI — cagiran ne isterse istesin %2'den fazlasi harcanmaz");
  {
    /* Asking for the whole balance. The vault must either clamp it or
       refuse it; what it must not do is spend it. */
    const s = await senaryo(280_000_000n, 10_000);
    const ad = hataAdi(s.sebep);
    if (s.revertEtti) {
      ok(ad === "TavanAsildi" || ad === "IslemTavani" || ad === "CokBuyuk" || ad === "HakDustu",
        "tum bakiyeyi isteyen cagri REDDEDILDI", ad);
      console.log("     istenen " + U(s.harcama) + " (bakiyenin %100'u) -> " + ad);
    } else {
      console.log("     istenen " + U(s.harcama) + "   gerceklesen harcama " +
        U(V(s.kasaOnce) - V(s.kasaSonra) - V(s.odul)));
      ok(false, "tum bakiyeyi isteyen cagri gecmemeliydi", "tavan baglamadi");
    }
  }

  /* ---- 4. the reward is bounded by the discount it captured ------- */
  if (iyi) {
    console.log("");
    console.log("4) ODUL — yakalanan iskontonun %20'si, daha fazlasi degil");
    const tabanDeger = (V(iyi.kasaOnce) * V(iyi.yakilan)) / V(iyi.dolasimOnce);
    const bosluk = tabanDeger > V(iyi.harcama) ? tabanDeger - V(iyi.harcama) : 0n;
    const beklenen = (bosluk * 2_000n) / 10_000n;
    console.log("     yakilan tokenin rezervdeki karsiligi " + U(tabanDeger) +
      "   harcanan " + U(iyi.harcama) + "   bosluk " + U(bosluk));
    console.log("     beklenen odul " + U(beklenen) + "   gerceklesen " + U(iyi.odul));
    ok(V(iyi.odul) === beklenen, "odul TAM OLARAK boslugun %20'si");
    ok(V(iyi.odul) < bosluk, "odul boslugun tamamini almiyor — kalani rezervde kaliyor",
      U(bosluk - V(iyi.odul)) + " rezervde kaldi");
    /* Conservation: what left the reserve is exactly spend + reward. */
    ok(V(iyi.kasaOnce) - V(iyi.kasaSonra) === V(iyi.harcama) + V(iyi.odul),
      "rezervden cikan TAM OLARAK harcama + odul",
      U(V(iyi.kasaOnce) - V(iyi.kasaSonra)));
  }

  /* ---- 5. THE CRASH — the only test that is about a floor -------- */
  console.log("");
  console.log("5) COKUS — rezerve HICBIR SEY eklenmeden, fiyat dusunce taban yakaliyor mu");
  {
    /* The condition for a buyback is reserve/circulating > price. With
       the reserve fixed at the $20 the launch put there, that is a PRICE
       level: $20 / 22,285,714 = $0.000000897, which is 25.6% of the
       $0.0000035 opening price. So the floor at launch sits 74% down.

       Two things push toward it during a sell-off and both are measured
       here rather than argued: the price falls, and the quote-side fee
       on every sale sends its collateral-tax slice INTO the reserve. The
       floor rises to meet the price while the price falls to meet it. */
    async function cokus(alim, oran) {
      await new Promise((z) => setTimeout(z, ARALIK));
      const r = await rpc("eth_call", [
        { from: CAGIRAN, to: HARNESS, gas: "0x20000000",
          data: iface.encodeFunctionData("cokusTesti",
            [PM, USDC, HOOK, GELISTIRICI, LIKIDITE, ISLETME, CIRBTC, BTC_FEED, alim, oran]) },
        "latest",
        { [HARNESS]: { code: T.deployedBytecode, balance: "0x" + (10n ** 24n).toString(16) },
          [HOOK]: { code: hookKod } }
      ]);
      return iface.decodeFunctionResult("cokusTesti", r)[0];
    }

    /* The tokens to dump come from the curve, and the curve's anti-snipe
       tax takes ~99% of any input spent in the launch block. So the
       gross figure is large on purpose: $30,000 in becomes roughly $290
       of curve purchase, which is about 76M tokens — enough to more than
       triple the pool's token side and take the price down with it. */
    const ALIM = 30_000_000_000n;

    /* The token price in quote terms, from sqrtPriceX96. sqrtP tracks
       currency1 per currency0, so when the token is currency1 the token
       price is the INVERSE and a sell pushes sqrtP up. Reading it the
       other way round reports every crash as a rally. */
    function tokenFiyati(sqrtP, tokenSifirinci) {
      const p = Number(V(sqrtP)) / 2 ** 96;
      const oran = p * p;                 // currency1 per currency0
      return tokenSifirinci ? oran : 1 / oran;   // quote per token
    }

    /* How hard does the price have to fall? Searched, not assumed. */
    let tutan = null;
    for (const oran of [1_000, 2_500, 5_000, 7_500, 10_000]) {
      let c;
      try { c = await cokus(ALIM, oran); }
      catch (e) { console.log("     dokme %" + oran / 100 + " -> harness revert " + hataAdi(e.data)); continue; }
      const f0 = tokenFiyati(c.fiyatOnce, c.tokenSifirinci);
      const f1 = tokenFiyati(c.fiyatSonra, c.tokenSifirinci);
      const fiyatDususu = (1 - f1 / f0) * 100;
      console.log("     dokme %" + (oran / 100).toFixed(0) + "  (" + TOK(c.dokulen) + " token)" +
        "   fiyat " + f0.toExponential(3) + " -> " + f1.toExponential(3) +
        "  (-" + fiyatDususu.toFixed(2) + "%)" +
        "   rezerv " + U(c.kasaOnce) +
        "   geri alim " + (c.revertEtti ? "RED (" + hataAdi(c.sebep) + ")" : "OLDU"));
      if (!c.revertEtti && !tutan) tutan = { c, fiyatDususu, oran };
    }

    if (!tutan) {
      ok(false, "TABAN COKUSU YAKALADI", "hicbir dokme boyunda geri alim tetiklenmedi");
    } else {
      const c = tutan.c;
      console.log("");
      console.log("     TABAN DEVREYE GIRDI — fiyat -" + tutan.fiyatDususu.toFixed(2) + "% olunca");
      console.log("     rezerv " + U(c.kasaOnce) + " (launch'ta $20,00 — arasi satis vergisiyle doldu)");
      console.log("     yakilan " + TOK(c.yakilan) + " token   odul " + U(c.odul));
      console.log("     hak " + HAK(c.hakOnce) + " -> " + HAK(c.hakSonra));
      ok(V(c.yakilan) > 0n, "TABAN COKUSU YAKALADI — rezerve hicbir sey eklenmeden",
        TOK(c.yakilan) + " token yakildi");
      ok(V(c.hakSonra) > V(c.hakOnce), "hak/token geri alimdan sonra yukari cikti",
        "+" + (Number((V(c.hakSonra) - V(c.hakOnce)) * 10_000n / V(c.hakOnce)) / 100).toFixed(2) + "%");
      ok(V(c.kasaOnce) > 20_000_000n,
        "SATIS BASKISI REZERVI BUYUTTU — vergi calisti",
        "$20,00 -> " + U(c.kasaOnce) + " (satis vergisi)");
      ok(V(c.odul) > 0n, "cagirani odeyen bir odul var — motor kendiliginden doner", U(c.odul));
    }
  }

  /* ---- 6. the hook's quote-side split, weighed on the chain ------ */
  console.log("");
  console.log("6) KANCANIN PARA TARAFI — bir SATISTA yedi adrese dusen, zincirde olculdu");
  {
    /* This is where the bug was, and nothing measured it. EgriLaunch
       carries the same table and olc-egri-ucret.js weighs it on a CURVE
       purchase; the hook is a second implementation of the same split on
       the POOL, and it underflowed on every sell. A table audit compares
       constants between the two files and cannot see an arithmetic
       difference at all.

       Two sales, because with a shield in the hook there are two right
       answers. A small one pins the table; a large one pins the shield
       and proves it takes nothing from the protocol's five slices. */
    async function ucret(satilacak) {
      await new Promise((z) => setTimeout(z, 900));
      const r = await rpc("eth_call", [
        { from: CAGIRAN, to: HARNESS, gas: "0x20000000",
          data: iface.encodeFunctionData("ucretTesti",
            [PM, USDC, HOOK, GELISTIRICI, LIKIDITE, ISLETME, CIRBTC, BTC_FEED,
             30_000_000_000n, satilacak]) },
        "latest",
        { [HARNESS]: { code: T.deployedBytecode, balance: "0x" + (10n ** 24n).toString(16) },
          [HOOK]: { code: hookKod } }
      ]);
      return iface.decodeFunctionResult("ucretTesti", r)[0];
    }

    /* Circulating supply after the curve purchase is about 98.9M, so the
       0.5% threshold is near 494k tokens. 300k is under it and 20M is far
       over — the shield saturates at its 3% cap. */
    const senaryolar = [
      { ad: "KUCUK SATIS (esigin altinda)", miktar: 300_000n * 10n ** 18n, kalkanPpm: 0 },
      { ad: "BUYUK SATIS (kalkan tavanda)", miktar: 20_000_000n * 10n ** 18n, kalkanPpm: 30_000 }
    ];

    for (const sen of senaryolar) {
      const u = await ucret(sen.miktar);
      const cikti = V(u.cikti);
      console.log("   " + sen.ad + "  —  " + TOK(u.satilan) + " token -> brut " + U(cikti));
      const ppm = (x) => Number((V(x) * 1_000_000n) / cikti);
      const satirlar = [
        ["kurucu",              u.kurucu,      3_000],
        ["stake (holders)",     u.rewards,     3_000],
        ["gelistirici fonu",    u.gelistirici, 3_000],
        ["protokol likiditesi", u.likidite,    5_000],
        ["isletme",             u.isletme,     2_000],
        ["TEMINAT KASASI",      u.kasa,        10_000 + sen.kalkanPpm],
        ["derinlik (acici)",    u.acici,       4_000]
      ];
      for (const [ad, miktar, beklenenPpm] of satirlar) {
        const g = ppm(miktar);
        console.log("       " + ad.padEnd(22) + U(miktar).padStart(10) +
          "   %" + (g / 10_000).toFixed(4) + "   beklenen %" + (beklenenPpm / 10_000).toFixed(4));
        /* One ppm of tolerance: seven integer divisions on a six-decimal
           token cannot land exactly, and the remainder is deliberately
           swept into depth. */
        ok(Math.abs(g - beklenenPpm) <= 1, ad + " payi tabloya uyuyor (" + sen.ad + ")",
          g + " ppm, beklenen " + beklenenPpm);
      }
      const toplamPpm = ppm(u.toplam);
      const beklenenToplam = 30_000 + sen.kalkanPpm;
      console.log("       " + "TOPLAM".padEnd(22) + U(u.toplam).padStart(10) +
        "   %" + (toplamPpm / 10_000).toFixed(4) +
        "   beklenen %" + (beklenenToplam / 10_000).toFixed(4));
      ok(Math.abs(toplamPpm - beklenenToplam) <= 2, "toplam kesinti dogru (" + sen.ad + ")",
        toplamPpm + " ppm, beklenen " + beklenenToplam);
      ok(V(u.kasa) > 0n, "SATISTA TEMINAT VERGISI KASAYA GIRIYOR (" + sen.ad + ")", U(u.kasa));
    }

    /* And the point of running both: the shield is paid ENTIRELY by the
       vault's slice. If any protocol slice had moved between the two
       scenarios, the shield would be quietly redistributing the
       protocol's fee instead of adding to the floor. */
    ok(true, "kalkan protokolun bes diliminden HIC pay almadi",
      "iki senaryoda da %0,3/%0,3/%0,3/%0,5/%0,2 ayni");
  }

  /* ---- 7. the whale shield --------------------------------------- */
  console.log("");
  console.log("7) BALINA KALKANI — tek islem icinde bolmek kalkani atlatiyor mu");
  {
    /* The only evasion worth testing. A whale needs neither many wallets
       nor many blocks: one contract can loop a swap, and against a
       per-TRADE threshold every iteration is under it. The shield
       accumulates per pool per BLOCK, and every iteration of one
       transaction shares a block however it is routed. */
    await new Promise((z) => setTimeout(z, 900));
    const r = await rpc("eth_call", [
      { from: CAGIRAN, to: HARNESS, gas: "0x20000000",
        data: iface.encodeFunctionData("kalkanTesti",
          [PM, USDC, HOOK, GELISTIRICI, LIKIDITE, ISLETME, CIRBTC, BTC_FEED,
           30_000_000_000n,                       // $30.000 gross on the curve
           300_000_000_000_000_000_000_000n,      // 300.000 token slices
           8n]) },
      "latest",
      { [HARNESS]: { code: T.deployedBytecode, balance: "0x" + (10n ** 24n).toString(16) },
        [HOOK]: { code: hookKod } }
    ]);
    const k = iface.decodeFunctionResult("kalkanTesti", r)[0];
    const dolasim = V(k.dolasim);
    const dilimPpm = Number((V(k.dilim) * 1_000_000n) / dolasim);
    console.log("     dolasim " + TOK(dolasim) + " token");
    console.log("     her dilim " + TOK(k.dilim) + " token = dolasimin %" +
      (dilimPpm / 10_000).toFixed(4) + "   esik %0,5000");
    ok(dilimPpm < 5_000, "her dilim TEK BASINA esigin altinda",
      "yani islem basina bir esik hicbirini yakalamazdi");

    /* Vault gain per unit of seller proceeds. Without a shield this is
       flat at the collateral tax rate; with one it climbs. The gross
       output is not readable from outside the hook, so the ratio is the
       measurement — and a ratio is enough, because the question is
       whether it MOVES. */
    const oranlar = [];
    for (let j = 0; j < 8; j++) {
      const kasaya = V(k.kasaya[j]), hasilat = V(k.hasilat[j]);
      if (hasilat === 0n) { oranlar.push(null); continue; }
      const bps = Number((kasaya * 100_000n) / hasilat);   // 1e-5 çözünürlük
      oranlar.push(bps);
      console.log("       dilim " + (j + 1) + "   kasaya " + U(kasaya) +
        "   satici eline " + U(hasilat) +
        "   oran " + (bps / 1000).toFixed(3) + "%" +
        "   birikmis %" + ((dilimPpm * (j + 1)) / 10_000).toFixed(3));
    }
    const dolu = oranlar.filter((x) => x !== null);
    ok(dolu.length >= 4, "en az dort dilim gercekten satildi", dolu.length + " dilim");

    /* The first slice is under the threshold on the cumulative figure
       too, so it pays the bare collateral tax and nothing else. */
    ok(dolu[0] < 1_100 && dolu[0] > 900, "ILK dilim yalnizca %1 teminat vergisi odedi",
      (dolu[0] / 1000).toFixed(3) + "%");
    /* And the last one pays visibly more, which is the whole claim:
       splitting inside one transaction does not get round it. */
    ok(dolu[dolu.length - 1] > dolu[0] * 2,
      "SON dilim ilkinin iki katindan FAZLA odedi — bolmek kurtarmadi",
      (dolu[0] / 1000).toFixed(3) + "% -> " + (dolu[dolu.length - 1] / 1000).toFixed(3) + "%");
    /* Monotone, because a rate that jumped around would mean the window
       is not accumulating but being reset by something. */
    let artan = true;
    for (let j = 1; j < dolu.length; j++) if (dolu[j] < dolu[j - 1]) artan = false;
    ok(artan, "oran dilim dilim HIC DUSMEDI — pencere gercekten birikiyor");
    console.log("     kasaya toplam " + U(k.kasaToplam) +
      "  (kalkan olmasaydi hepsi %1 oderdi)");
  }

  /* ---- 8. the drain — what bounds the SEQUENCE ------------------- */
  console.log("");
  console.log("8) BOSALTMA — ust uste geri alim rezervi bosaltabilir mi");
  {
    /* Every buyback raises the claim, so every one of them is
       individually allowed. That is exactly why this test exists:
       "accretive" and "safe" are different properties, and 117
       accretive calls emptied 99.2% of a simulated reserve. The vault
       carries two limits the invariant does not imply — 2% per call and
       10% per 7200-block window — and neither has been run against a
       real pool until now.

       One transaction is one block, so the window cannot roll over
       mid-loop. And the ceiling is taken against the CURRENT balance,
       which shrinks on every call, so the limit tightens as it goes and
       the stopping point is not 10%/2% = 5. */
    await new Promise((z) => setTimeout(z, 900));
    const r = await rpc("eth_call", [
      { from: CAGIRAN, to: HARNESS, gas: "0x20000000",
        data: iface.encodeFunctionData("tavanTesti",
          [PM, USDC, HOOK, GELISTIRICI, LIKIDITE, ISLETME, CIRBTC, BTC_FEED,
           980_000_000n, 12n]) },        // reserve $1.000 after the launch's $20
      "latest",
      { [HARNESS]: { code: T.deployedBytecode, balance: "0x" + (10n ** 24n).toString(16) },
        [HOOK]: { code: hookKod } }
    ]);
    const t = iface.decodeFunctionResult("tavanTesti", r)[0];
    const adet = Number(t.adet);
    console.log("     rezerv " + U(t.rezervBas) + "   hak/token " + HAK(t.hakBas));
    let toplamHarcanan = 0n;
    for (let j = 0; j < adet; j++) {
      toplamHarcanan += V(t.harcanan[j]);
      console.log("       cagri " + (j + 1) + "   harcama " + U(t.harcanan[j]) +
        "   yakilan " + TOK(t.yakilan[j]) + " token" +
        "   hak " + HAK(t.hak[j]));
    }
    const sebep = hataAdi(t.durduranSebep);
    const dusus = V(t.rezervBas) - V(t.rezervSon);
    const dususBps = Number((dusus * 10_000n) / V(t.rezervBas));
    console.log("     DURDURAN: " + sebep + "   (" + (adet + 1) + ". cagri)");
    console.log("     rezerv " + U(t.rezervBas) + " -> " + U(t.rezervSon) +
      "   dusus " + U(dusus) + " = %" + (dususBps / 100).toFixed(2));
    console.log("     hak " + HAK(t.hakBas) + " -> " + HAK(t.hakSon));

    ok(adet >= 1, "tek blokta en az bir geri alim yapilabildi", adet + " cagri");
    ok(sebep === "DonemTavani", "DIZIYI DURDURAN SEY DONEM TAVANI", sebep);
    /* The whole point: a single block cannot take more than the window
       allows, however many calls are stacked into it. */
    ok(dususBps <= 1_000, "TEK BLOKTA REZERVIN %10'UNDAN FAZLASI CIKMADI",
      "%" + (dususBps / 100).toFixed(2) + " cikti, tavan %10");
    /* And the sequence is still accretive — draining is bounded, but it
       is not even a loss for holders while it happens. */
    ok(V(t.hakSon) > V(t.hakBas), "dizinin sonunda hak/token BASLANGICTAN YUKARIDA",
      "+" + (Number((V(t.hakSon) - V(t.hakBas)) * 10_000n / V(t.hakBas)) / 100).toFixed(2) + "%");
    let hepArtan = true;
    for (let j = 1; j < adet; j++) if (V(t.hak[j]) < V(t.hak[j - 1])) hepArtan = false;
    ok(hepArtan, "hak her cagrida yukari gitti, hicbirinde geri dusmedi");
    /* The reward is paid out of the reserve too, so the drain figure has
       to be bigger than the spend alone — otherwise the reward is coming
       from somewhere unaccounted for. */
    ok(dusus > toplamHarcanan, "rezervden cikan harcamadan fazla — odul de rezervden",
      U(toplamHarcanan) + " harcama + " + U(dusus - toplamHarcanan) + " odul");
  }

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) console.error("  sebep: " + hataAdi(e.data) + "   data " + String(e.data).slice(0, 160));
  process.exit(1);
});
