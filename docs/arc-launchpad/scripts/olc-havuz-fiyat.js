"use strict";
/* ===========================================================================
 * olc-havuz-fiyat.js — CA'dan türetilen fiyat, gerçek havuzlara karşı
 *
 *   anvil --fork-url https://base-rpc.publicnode.com     --port 8547 --silent
 *   anvil --fork-url https://ethereum-rpc.publicnode.com --port 8546 --silent
 *   node scripts/olc-havuz-fiyat.js
 *
 * ÖLÇÜLEN ŞEY
 *   Teminat listesi yok. Kullanıcı yalnızca kontrat adresini veriyor ve
 *   sözleşme havuzu, kademeyi ve fiyatı kendi türetiyor. Bu koşum o
 *   türetmenin doğru olduğunu gösteriyor — ve "doğru"nun ölçütü sözleşmenin
 *   kendi iddiası değil, UNISWAP'IN KENDİ KOTASI.
 *
 * NEDEN KOTAYLA KARŞILAŞTIRILIYOR
 *   Tick aritmetiğini yanlış yazmak sessiz bir hata: sözleşme bir sayı
 *   döndürür, sayı makul görünür ve taban kayar. Yürütücü de o kaymayı
 *   cebe atar. O yüzden türetilen fiyat, aynı miktar için Uniswap'in
 *   Quoter'ına sorulan gerçek çıktıyla karşılaştırılıyor. TWAP ile anlık
 *   kota birebir tutmaz — tutmaması gerekir, biri ortalama diğeri o an —
 *   ama aynı büyüklükte olmak zorundalar.
 *
 * NEDEN MEME COIN
 *   Kullanıcının kuralı meme coinler dahil çalışan her şeyin girmesi. O
 *   yüzden test kümesi WETH ve WBTC değil: DEGEN, SHIB, MOG, VIRTUAL gibi
 *   şeyler de var — ve boş havuzu olan PEPE, reddedilmesi gerektiği için.
 * =========================================================================== */
const { Interface, AbiCoder } = require("ethers");
const fs = require("fs");
const path = require("path");

const H = "0x00000000000000000000000000000000000000F7";
const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const { kisaIsim: hataAdi, yaz: revertYaz } = require("./revert-coz");

const T = B("HavuzFiyat");
const iface = new Interface(T.abi);
const coder = AbiCoder.defaultAbiCoder();

/* Uniswap's own QuoterV2 — the number a trader would actually get. */
const QUOTER = {
  1: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  8453: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"
};
const quoterIface = new Interface([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)"
]);

const ZINCIRLER = [
  {
    ad: "Base", id: 8453, rpc: process.env.BASE_RPC || "https://base-rpc.publicnode.com",
    fabrika: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", quoteOndalik: 6,
    varliklar: [
      { s: "WETH", a: "0x4200000000000000000000000000000000000006", d: 18 },
      { s: "DEGEN", a: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", d: 18 },
      { s: "VIRTUAL", a: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b", d: 18 },
      { s: "AERO", a: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", d: 18 },
      /* Measured: both of PEPE's Base pools have zero liquidity, and
         observe() still answers. It is here to be REFUSED. */
      { s: "PEPE", a: "0xB4fDe59a779991bfB6a52253B51947828b982be3", d: 18, beklenenRet: true }
    ]
  },
  {
    ad: "Ethereum", id: 1, /* The LIVE endpoint, not a local fork. Measured: publicnode accepts
       state overrides on eth_call, and the local Ethereum fork does not —
       its upstream has pruned the state "latest" refers to and lazily
       fetching an account fails with "historical state is not available".
       Nothing here writes, so a fork buys nothing. */
    rpc: process.env.ETH_RPC || "https://ethereum-rpc.publicnode.com",
    fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", quoteOndalik: 6,
    varliklar: [
      { s: "WETH", a: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", d: 18 },
      { s: "WBTC", a: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", d: 8 },
      { s: "SHIB", a: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", d: 18 },
      { s: "LINK", a: "0x514910771AF9Ca656af840dff83E8264EcF986CA", d: 18 },
      { s: "UNI", a: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", d: 18 }
    ]
  }
];

const HARCAMA = 2_000_000_000n;   // $2.000

/* A pruned node is not a failed measurement, it is a failed node.
   Measured on publicnode's Ethereum endpoint:

     failed to get account for 0xBd77...: historical state ... is not
     available

   It is load-balanced across nodes and some of them have pruned the state
   that "latest" refers to. Retrying reaches a different node, and the
   retry is on the TRANSPORT rather than around each assertion — otherwise
   a pruned node would be reported as a contract that misbehaved. */
const YEDEK = {
  "https://ethereum-rpc.publicnode.com": [
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
    "https://eth-pokt.nodies.app"
  ],
  "https://base-rpc.publicnode.com": [
    "https://base.llamarpc.com",
    "https://mainnet.base.org"
  ]
};

const GECICI = /historical state|not available|header not found|missing trie node|rate limit|too many requests|503|502/i;

async function birRpc(url, m, p) {
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }),
    signal: AbortSignal.timeout(60_000)
  });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
  return j.result;
}

async function rpc(url, m, p, ortuk) {
  const adaylar = [url, url, ...(YEDEK[url] || [])];
  let son = null;
  for (const u of adaylar) {
    try {
      return await birRpc(u, m, p);
    } catch (e) {
      son = e;
      /* A revert is the contract's answer and must be reported, not
         retried somewhere else — retrying it would turn a real refusal
         into a wild goose chase across endpoints. */
      if (!GECICI.test(e.message || "")) throw e;
      if (u !== adaylar[adaylar.length - 1]) {
        console.log("     (uc nokta cevap vermedi, yedege geciliyor: " +
          e.message.slice(0, 60) + ")");
      }
    }
  }
  throw son;
}

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const V = (v) => BigInt(v.toString());

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => {
    if (!iyi) kotu++;
    console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
  };

  console.log("CA'DAN TURETILEN FIYAT — gercek havuzlara karsi");
  console.log("");
  console.log("  Teminat listesi yok. Verilen tek sey kontrat adresi; havuz,");
  console.log("  kademe ve fiyat sozlesme tarafindan TURETILIYOR.");

  let calisan = 0;
  const yeterliDerinlik = [];
  const yetersizDerinlik = [];
  for (const z of ZINCIRLER) {
    let id;
    try { id = BigInt(await rpc(z.rpc, "eth_chainId", [])); }
    catch (e) {
      console.log("");
      console.log("  " + z.ad + " ATLANDI — " + z.rpc + " cevap vermiyor");
      continue;
    }
    if (id !== BigInt(z.id)) {
      console.log("");
      console.log("  " + z.ad + " ATLANDI — zincir " + id + ", beklenen " + z.id);
      continue;
    }
    calisan++;

    const blok = BigInt(await rpc(z.rpc, "eth_blockNumber", []));
    console.log("");
    console.log("================================================================");
    console.log(" " + z.ad.toUpperCase() + "  (blok " + blok.toLocaleString("en") + ")");
    console.log("================================================================");

    /* The price source, injected at a fixed address with its constructor
       arguments baked in — the same code that would be deployed. */
    const kurulum = T.bytecode + coder.encode(
      ["address", "address"], [z.fabrika, z.usdc]
    ).slice(2);
    const kod = await rpc(z.rpc, "eth_call", [{ data: kurulum }, "latest"]);
    const ortuk = { [H]: { code: kod } };
    ok(kod && kod !== "0x", z.ad + ": fiyat kaynagi kuruldu",
      kod ? ((kod.length - 2) / 2).toLocaleString("en") + " bayt" : "kod yok");

    for (const v of z.varliklar) {
      console.log("");
      console.log("  --- " + v.s + "  " + v.a + " ---");

      /* 1. is it measurable, and if not, is that fixable? */
      let olc;
      try {
        const r = await rpc(z.rpc, "eth_call", [
          { to: H, data: iface.encodeFunctionData("olculebilirMi", [v.a]) }, "latest", ortuk
        ]);
        olc = iface.decodeFunctionResult("olculebilirMi", r);
      } catch (e) {
        ok(false, v.s + ": olculebilirMi cagrisi dondu", e.message.slice(0, 60));
        continue;
      }
      console.log("     olculebilir " + olc[0] + (olc[1] ? "   sebep: " + olc[1] : "") +
        (olc[2] ? "   (duzeltilebilir)" : ""));

      if (v.beklenenRet) {
        /* The point of including this asset. */
        ok(olc[0] === false,
          v.s + ": BOS HAVUZ REDDEDILDI",
          olc[0] === false
            ? olc[1] + " — observe() bir fiyat donduruyordu ama o fiyattan " +
              "kimse islem yapamaz"
            : "GECTI, ki gecmemeliydi");
        continue;
      }
      ok(olc[0] === true, v.s + ": olculebilir", olc[1] || "");
      if (!olc[0]) continue;

      /* 2. the deepest pool — and that the choice is not arbitrary */
      const dr = await rpc(z.rpc, "eth_call", [
        { to: H, data: iface.encodeFunctionData("enDerinHavuz", [v.a]) }, "latest", ortuk
      ]);
      const d = iface.decodeFunctionResult("enDerinHavuz", dr);
      console.log("     en derin havuz " + d[0] + "  kademe " + d[1] +
        "  likidite " + V(d[2]).toLocaleString("en") + "  kardinalite " + d[3]);
      ok(V(d[2]) > 0n, v.s + ": en derin havuzun likiditesi var");
      ok(Number(d[3]) >= 2, v.s + ": gozlem gecmisi yeterli", "kardinalite " + d[3]);

      /* 3. the derived amount, against Uniswap's own quote */
      const ar = await rpc(z.rpc, "eth_call", [
        { to: H, data: iface.encodeFunctionData("quoteIleAlinabilir", [v.a, HARCAMA]) },
        "latest", ortuk
      ]);
      const a = iface.decodeFunctionResult("quoteIleAlinabilir", ar);
      const turetilen = V(a[0]);

      let kota = null;
      try {
        const qr = await rpc(z.rpc, "eth_call", [{
          to: QUOTER[z.id],
          data: quoterIface.encodeFunctionData("quoteExactInputSingle", [[
            z.usdc, v.a, HARCAMA, Number(d[1]), 0
          ]])
        }, "latest"]);
        kota = V(quoterIface.decodeFunctionResult("quoteExactInputSingle", qr)[0]);
      } catch (e) { /* reported below */ }

      const bicim = (x) => (Number(x) / 10 ** v.d).toLocaleString("en", { maximumFractionDigits: 6 });
      console.log("     " + U(HARCAMA) + " icin:");
      console.log("       TWAP'tan turetilen  " + bicim(turetilen) + " " + v.s);
      console.log("       Uniswap kotasi      " + (kota == null ? "okunamadi" : bicim(kota) + " " + v.s));

      if (kota == null) {
        ok(false, v.s + ": Uniswap kotasi okunamadi",
          "karsilastirma yapilamadi — turetilen sayi dogrulanmadi sayilir");
        continue;
      }
      ok(turetilen > 0n, v.s + ": turetilen miktar sifir degil");

      /* ---- 3a. the tick arithmetic, against the pool's own SPOT ----
       *
       * NEDEN KOTAYA DEGIL SLOT0'A KARSI
       *   Bu sav tick aritmetiginin dogrulugunu olcuyor ve ilk yazildiginda
       *   Quoter'in kotasiyla karsilastiriliyordu. O karsilastirma yanlisti
       *   ve yanlisligi olculdu: DEGEN'de %93 sapma cikti, ama ikisi de
       *   DOGRUYDU — farkli seyleri olcuyorlardi.
       *
       *     TWAP           havuzun MARJINAL fiyati    $0.000998
       *     Quoter         $2.000'lik islemin         $0.016096
       *                    GERCEKLESEN fiyati
       *
       *   Ayni havuzun dort kademesinin hepsi $0.000998 diyor; fark
       *   aritmetikte degil, islemin havuza gore buyuklugunde. O yuzden
       *   aritmetik slot0'a karsi olculuyor — ikisi de marjinal fiyat —
       *   ve islem buyuklugu asagida AYRI bir olcum olarak duruyor.
       */
      const s0 = await rpc(z.rpc, "eth_call", [{ to: d[0], data: "0x3850c7bd" }, "latest"]);
      const sqrtX96 = BigInt("0x" + s0.slice(2, 66));
      /* The asset's own marginal price, in the same raw-unit terms the
         contract works in, so the two numbers are directly comparable
         without a decimals step that could itself be the bug. */
      const t0ham = await rpc(z.rpc, "eth_call", [{ to: d[0], data: "0x0dfe1681" }, "latest"]);
      const varlikSifirinci = ("0x" + t0ham.slice(26)).toLowerCase() === v.a.toLowerCase();
      const oran = (Number(sqrtX96) / 2 ** 96) ** 2;              // token1/token0, raw
      const hamFiyat = varlikSifirinci ? oran : 1 / oran;         // quote per asset, raw
      const anlikBeklenen = Number(HARCAMA) / hamFiyat;           // asset raw units

      console.log("       slot0'dan ayni hesap " + bicim(BigInt(Math.round(anlikBeklenen))) + " " + v.s);
      const sapmaSpot = Math.abs(Number(turetilen) - anlikBeklenen) / Number(turetilen);
      console.log("       TWAP vs slot0 sapma  %" + (sapmaSpot * 100).toFixed(2));
      ok(sapmaSpot < 0.10,
        v.s + ": TICK ARITMETIGI HAVUZUN KENDI FIYATIYLA AYNI",
        "%" + (sapmaSpot * 100).toFixed(2) + " < %10 — ikisi de marjinal fiyat, " +
          "fark yalnizca 30 dakikalik ortalamanin anlik fiyattan uzakligi");

      /* ---- 3b. the depth this trade needs, which is a LIMIT ---------
       *
       * BU BIR SAV DEGIL, OLCUM — VE DURUST BIR SINIR
       *   Taban TWAP'tan turetiliyor, yani MARJINAL fiyattan. Islem
       *   havuzu ittiriyorsa gerceklesen fiyat daha kotu olur ve taban
       *   ulasilamaz hale gelir: donusum reddedilir.
       *
       *   Guvenli yonde kapaniyor — para kaybedilmiyor, islem olmuyor.
       *   Ama "calisan her token teminat olabilir" vaadinin gercek
       *   siniri bu: havuz, islem buyuklugune gore yeterince derin
       *   olmak zorunda. Olculdu: $2.000 icin DEGEN'in en derin
       *   kademesi bile 16 kat ittiyor.
       */
      const ittirme = Number(turetilen) / Number(kota);
      const tolerans = 1 / (1 - 300 / 10_000);      // AZAMI_KAYMA_BPS = 300
      console.log("       $" + (Number(HARCAMA) / 1e6).toLocaleString("en") +
        " islem fiyati " + ittirme.toFixed(2) + " kat ittiriyor" +
        "   (taban %3 tolerans tasiyor, yani " + tolerans.toFixed(3) + " kata kadar gecer)");
      if (ittirme > tolerans) {
        console.log("       -> BU BUYUKLUKTE DONUSUM REDDEDILIR. Havuz bu islem " +
          "icin yeterince derin degil.");
        console.log("          Taban " + bicim(turetilen) + " istiyor, havuz " +
          bicim(kota) + " verebiliyor.");
        yetersizDerinlik.push(v.s + " ($" + (Number(HARCAMA) / 1e6).toLocaleString("en") +
          " icin " + ittirme.toFixed(1) + " kat)");
      } else {
        console.log("       -> bu buyuklukte donusum gecer");
        yeterliDerinlik.push(v.s);
      }
    }
  }

  console.log("");
  console.log("================================================================");
  console.log(" ISLEM BUYUKLUGU: HANGI VARLIK BU TUTARDA DONUSTURULEBILIR");
  console.log("================================================================");
  console.log("  gecer      " + (yeterliDerinlik.join(", ") || "yok"));
  console.log("  reddedilir " + (yetersizDerinlik.join(", ") || "yok"));
  console.log("");
  console.log("  Reddedilmek bir hata degil, tabanin isini yapmasi: marjinal");
  console.log("  fiyattan turetilen taban, havuzu ittiren bir islemle");
  console.log("  karsilanamaz. Para kaybedilmiyor, islem olmuyor.");
  ok(yeterliDerinlik.length > 0,
    "EN AZ BIR VARLIK BU BUYUKLUKTE DONUSTURULEBILIYOR",
    yeterliDerinlik.length + " varlik — hepsi reddedilirse taban degil " +
      "tabanin turetmesi yanlis demektir");

  if (calisan === 0) {
    console.log("");
    console.log("ATLANDI — hicbir fork ayakta degil:");
    console.log("  anvil --fork-url https://base-rpc.publicnode.com     --port 8547 --silent");
    console.log("  anvil --fork-url https://ethereum-rpc.publicnode.com --port 8546 --silent");
    process.exit(75);
  }

  console.log("");
  console.log("  Hicbir adres kullanicidan alinmadi: CA'dan havuz turetildi,");
  console.log("  kademe taranarak bulundu, fiyat o havuzun kendi gecmisinden");
  console.log("  okundu. Besleyici adresi diye bir girdi yok — olsa, kendi");
  console.log("  sozlesmesini gosteren biri her fiyati uydurabilirdi.");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) revertYaz(String(e.data), 1);
  process.exit(1);
});
