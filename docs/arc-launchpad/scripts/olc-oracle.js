"use strict";
/* Does the oracle adapter's decimal arithmetic survive the real feeds?
 *
 * Four scales meet in one expression: cirBTC is 8 decimals, WETH is 18,
 * USDC is 6, the feeds answer at 8. Every decimal mistake this project has
 * made read correctly in the source and was off by a power of ten on the
 * chain, so this runs against Arc mainnet with the live feeds.
 *
 * The assertions are bounds and ratios, not fixed figures. Pinning $83,009
 * would make the test start failing tomorrow for a reason that has nothing
 * to do with the code.
 */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000Eb";
const CAGIRAN = "0x2222222222222222222222222222222222222222";

const USDC = "0x3600000000000000000000000000000000000000";
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
const WETH = "0x128cc466b61f542da60c70e3aa11c10e19b84edb";
/* Chainlink PROXY addresses, from Chainlink's own reference data
   directory. NOT the aggregators an AnswerUpdated log scan finds: an
   aggregator gets retired under its proxy and then answers a stale
   price with no error, and some are access-controlled so that no
   contract can read them at all. All 34 Arc proxies were measured
   readable from a contract — see olc-besleyiciler.js. */
const BTC_FEED = "0xa109B535C70C8Be9995be64Bb6751AcDB27e03De";
const ETH_FEED = "0x50FCDD99D6762D1C170DC6A9111db944AEE6D364";
const BILINMEYEN = "0x00000000000000000000000000000000000000AB";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(m, p) {
  let b = 2500;
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

const T = B("TestChainlinkOracle");
const iface = new Interface(T.abi);
const usd = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("ORACLE ADAPTORU — GERCEK Chainlink besleyicileri, Arc mainnet");
  console.log("");

  const r = await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x2000000",
      data: iface.encodeFunctionData("run", [USDC, CIRBTC, WETH, BTC_FEED, ETH_FEED, BILINMEYEN]) },
    "latest", { [H]: { code: T.deployedBytecode } }
  ]);
  const [s] = iface.decodeFunctionResult("run", r);
  const V = (x) => BigInt(x);

  console.log("  1 cirBTC   = " + usd(s.birBtc));
  console.log("  1 WETH     = " + usd(s.birEth));
  console.log("  10 cirBTC  = " + usd(s.onBtc));
  console.log("  0,001 cirBTC = " + usd(s.bindeBirBtc));
  console.log("");

  /* Bounds wide enough to be about the arithmetic, not the market. */
  ok(V(s.birBtc) > 1_000_000_000n && V(s.birBtc) < 10_000_000_000_000n,
     "1 cirBTC makul bir USDC degeri veriyor", usd(s.birBtc) + "  (1.000 - 10.000.000 arasi)");
  ok(V(s.birEth) > 100_000_000n && V(s.birEth) < 1_000_000_000_000n,
     "1 WETH makul bir USDC degeri veriyor", usd(s.birEth));

  /* Linearity catches a scale error that happens to cancel at one unit. */
  /* TAM ESITLIK DEGIL — KIRPMA PAYIYLA
   *
   * Bu sav "V(10) === V(1) * 10" diyordu ve bugun kirmizi yandi: 1 cirBTC
   * $83.049,99 iken 10 cirBTC okumasi, 1 birimin on katindan YEDI ham
   * birim FAZLA cikti.
   *
   * Sebep olcek hatasi degil, tam sayi kirpmasi. Birim basina gercek
   * deger x ise:
   *
   *   V(1)  = floor(x)
   *   V(10) = floor(10x)
   *   floor(10x) - 10*floor(x) = floor(10 * frac(x))  ->  0..9
   *
   * Yani V(10) her zaman 10*V(1) ye ESIT YA DA ONDAN BUYUK, farki en fazla
   * dokuz ham birim. Esitlik ancak fiyatin birim alti kalani sifira denk
   * geldiginde olur; sav bugune kadar o sansla geciyordu ve fiyat
   * degisince dustu — sozlesme degismedigi halde.
   *
   * ILK DUZELTMEM YONU TERS KURDU. "V(10) <= 10*V(1)" yazip kirpmanin
   * asagi dogru biriktigini varsaydim; olcum -7 verdi ve varsayimi
   * curuttu. Dogrusu yukarida.
   *
   * Ikisi de gercek degerin ALTINDA kaliyor (floor), yani fazla degerleme
   * hicbir yonde yok — teminat icin tehlikeli olan tek yon o. On birimlik
   * okuma sadece daha az kayipli. */
  const birOn = V(s.birBtc) * 10n;
  const fark = V(s.onBtc) - birOn;
  ok(fark >= 0n && fark <= 9n,
     "10 cirBTC = 1 cirBTC x 10, kirpma payiyla",
     "fark " + fark + " ham birim (0..9 arasi olmali); ikisi de floor, " +
       "yani hicbiri gercek degerin uzerinde degil");

  /* AYNI SINIF, AYNI DUZELTME — ustteki sav bugun bu yuzden kirmizi
     yandi ve bu da ayni tuzagi tasiyordu. Burada floor IKI KEZ
     uygulaniyor: V(0,001) = floor(x/1000), V(1)/1000 = floor(floor(x)/1000).
     Ikisi en fazla bir ham birim ayrilir ve V(0,001) asla kucuk olamaz.
     Tam esitlik istemek, bugun gecip baska bir fiyatta dusmek demekti —
     sozlesme hic degismeden. */
  const binde = V(s.birBtc) / 1000n;
  const kucukFark = V(s.bindeBirBtc) - binde;
  ok(kucukFark >= 0n && kucukFark <= 1n,
     "0,001 cirBTC = 1/1000, kirpma payiyla",
     "fark " + kucukFark + " ham birim (0 ya da 1); kucuk uclarda deger " +
       "kaybolmuyor ve fazla degerleme yok");

  /* And the two assets must not be valued on the same scale by accident:
     BTC is worth far more than ETH, so a wrong decimal would show here. */
  ok(V(s.birBtc) > V(s.birEth) * 5n, "cirBTC degeri WETH'ten belirgin yuksek",
     "ayni olcege dusurulmemis");

  ok(s.btcDegerlenebilir === true, "cirBTC degerlenebilir", "besleyici taze");
  ok(s.ethDegerlenebilir === true, "WETH degerlenebilir");
  ok(s.bilinmeyenDegerlenebilir === false, "KAYITSIZ VARLIK degerlenemez",
     "oracle'i olmayan varlik deger uretmiyor");

  console.log("");
  await bekle(1500);
  const [oldu] = iface.decodeFunctionResult("oluDagitim", await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x2000000",
      data: iface.encodeFunctionData("oluDagitim", [USDC, CIRBTC, BILINMEYEN]) },
    "latest", { [H]: { code: T.deployedBytecode } }
  ]));
  ok(oldu === true, "CEVAP VERMEYEN BESLEYICI ILE DAGITIM REVERT EDIYOR",
     "olu besleyici sonradan kesfedilmiyor");

  console.log("");
  console.log("  oracle " + s.oracle);
  console.log("");
  console.log(kotu === 0 ? "  GECTI — ondalik aritmetigi gercek besleyicilerde dogru, olcek dogrusal."
                         : "  BASARISIZ — " + kotu + " sorun.");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => { console.log("HATA: " + e.message); if (e.data) console.log("data: " + String(e.data).slice(0, 200)); process.exit(1); });
