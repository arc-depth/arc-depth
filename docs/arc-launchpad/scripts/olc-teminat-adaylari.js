"use strict";
/* ===========================================================================
 * olc-teminat-adaylari.js — teminat olabilecek token ve coinlerin TAM listesi
 *
 *   node scripts/olc-teminat-adaylari.js
 *   node scripts/olc-teminat-adaylari.js --zincir base
 *
 * TEMİNAT NE
 *   Kullanıcının kuralı: *"teminat olarak token yada coini kullanmalıyız"*,
 *   *"doge link avax bilmem ne tüm tokenler"*, *"BTC'ye özel bir durum yok,
 *   teminat coin ya da tokenlerinin özellikleri hepsi aynı"*. Hisseyle
 *   eşleştirilmiş tokenler İPTAL.
 *
 *   Bunlar Arc'ta yerel olarak bulunmadığı için teminat başka zincirde
 *   tutuluyor ve dönüşüm orada yapılıyor. Yani aday kümesi "o zincirde
 *   alınıp satılabilen ve fiyatı doğrulanabilen her token".
 *
 * BİR ADAYIN GEÇMESİ İÇİN İKİ ŞEY GEREKİYOR, İKİSİ DE ÖLÇÜLÜYOR
 *
 *   1. DOĞRULANMIŞ FİYAT — Chainlink PROXY'si okunabilir olmalı.
 *      Aggregator değil proxy: aggregator proxy'sinin altından emekliye
 *      ayrılır ve sonra hiç hata vermeden eski bir fiyat cevaplar. Arc'ta
 *      34/34 besleyici ancak proxy'ye çevrildikten sonra okunabilir oldu.
 *
 *   2. ALINIP SATILABİLİRLİK — gerçek bir USDC havuzu olmalı.
 *      Fiyatı olan ama havuzu olmayan bir varlık, dönüşümün içine
 *      girilebilen ama çıkılamayan bir varlıktır.
 *
 *   Bunun dışında bir kalite kapısı YOK. Likidite tabanı, piyasa değeri
 *   eşiği gibi vekil ölçütler kullanıcı tarafından açıkça reddedildi:
 *   ölçüt "alınıp satılabiliyor mu" artı bir sürtünme tavanıdır.
 *
 * NABIZ TAHMİN EDİLMİYOR, DİZİNDEN OKUNUYOR
 *   Her besleyicinin tazelik penceresi kendi nabzına göre verilmek zorunda.
 *   Ölçüldü: Ethereum'da ETH/USD 3.552 saniye, Base'de DAI/USD 7.244 saniye
 *   güncellenmemişti — tek bir "1 saat" sabiti birincisini reddederdi,
 *   2 saatlik olan ikincisini. Chainlink'in dizini her besleyicinin
 *   `heartbeat` değerini veriyor, o yüzden pencere = nabız × 2.
 *
 * HİSSELER NEDEN LİSTEDE YOK
 *   Dizin her besleyiciye bir `feedType` veriyor: Crypto, Forex, Equities.
 *   Yalnızca Crypto alınıyor. Bu bir tercih değil, iptal edilmiş bir modelin
 *   dışarıda bırakılması.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK_DIZIN = "https://reference-data-directory.vercel.app/";

/* Chainlink's directory names a file after the chain it SETTLES to, not
   after the chain itself: Base is feeds-ethereum-mainnet-base-1.json and
   feeds-base-mainnet.json 404s. Each one below was probed, not guessed. */
const DIZIN = {
  ethereum: KOK_DIZIN + "feeds-mainnet.json",
  base: KOK_DIZIN + "feeds-ethereum-mainnet-base-1.json",
  arbitrum: KOK_DIZIN + "feeds-ethereum-mainnet-arbitrum-1.json",
  optimism: KOK_DIZIN + "feeds-ethereum-mainnet-optimism-1.json",
  polygon: KOK_DIZIN + "feeds-matic-mainnet.json",
  avalanche: KOK_DIZIN + "feeds-avalanche-mainnet.json",
  unichain: KOK_DIZIN + "feeds-ethereum-mainnet-unichain-1.json",
  linea: KOK_DIZIN + "feeds-ethereum-mainnet-linea-1.json"
};

/* The chains CCTP v2 can carry USDC to, with each one's own USDC, its
   Uniswap v3 factory and a public RPC. Every address here is CHECKED on
   chain before it is used: symbol() must answer USDC and the factory must
   have code. A wrong USDC address would silently report "no pool" for
   every asset on that chain, which reads as "nothing works there" rather
   than "we looked in the wrong place".

   CCTP domains are noted because collateral travels by CCTP; a chain with
   feeds and pools but no CCTP route cannot hold collateral at all. */
const ZINCIR = {
  ethereum: {
    id: 1, domain: 0,
    rpc: process.env.ETH_RPC_CANLI || "https://ethereum-rpc.publicnode.com",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984"
  },
  base: {
    id: 8453, domain: 6,
    rpc: process.env.BASE_RPC_CANLI || "https://base-rpc.publicnode.com",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    v3Fabrika: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD"
  },
  arbitrum: {
    id: 42161, domain: 3,
    rpc: process.env.ARB_RPC || "https://arbitrum-one-rpc.publicnode.com",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984"
  },
  optimism: {
    id: 10, domain: 2,
    rpc: process.env.OP_RPC || "https://optimism-rpc.publicnode.com",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984"
  },
  polygon: {
    id: 137, domain: 7,
    rpc: process.env.POLYGON_RPC || "https://polygon-bor-rpc.publicnode.com",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984"
  },
  avalanche: {
    id: 43114, domain: 1,
    rpc: process.env.AVAX_RPC || "https://avalanche-c-chain-rpc.publicnode.com",
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    v3Fabrika: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD"
  },
  unichain: {
    id: 130, domain: 10,
    rpc: process.env.UNI_RPC || "https://unichain-rpc.publicnode.com",
    usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
    v3Fabrika: "0x1F98400000000000000000000000000000000003"
  },
  linea: {
    id: 59144, domain: 11,
    rpc: process.env.LINEA_RPC || "https://linea-rpc.publicnode.com",
    usdc: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
    v3Fabrika: "0x31FAfd4889FA1269F7a13A66eE0fB458f27D72A9"
  }
};

/* One token list covers every chain: Uniswap's list is multi-chain and
   each entry carries its own chainId. */
const JETON_LISTESI = "https://tokens.uniswap.org";

/* The fee tiers a USDC pair realistically lives in. Checked in this order
   so the deepest-by-convention tier is reported first. */
const KADEMELER = [500, 3000, 100, 10000];

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (ad) => {
  const i = process.argv.indexOf("--" + ad);
  return i < 0 ? null : process.argv[i + 1];
};

async function rpc(url, m, p) {
  let g = 800;
  for (let k = 0; k < 6; k++) {
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }),
        signal: AbortSignal.timeout(30_000)
      });
      const j = await r.json();
      if (!j.error) return j.result;
      if (!/rate|limit|429/i.test(j.error.message)) return null;
    } catch (e) { /* retry */ }
    await bekle(g); g = Math.min(g * 2, 8_000);
  }
  return null;
}

/* Batched eth_call, because one request per candidate per tier would be
   thousands of requests against a public endpoint. */
async function toplu(url, istekler) {
  if (!istekler.length) return [];
  let g = 800;
  for (let k = 0; k < 6; k++) {
    try {
      const govde = istekler.map((x, i) => ({
        jsonrpc: "2.0", id: i + 1, method: "eth_call", params: x
      }));
      const r = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(govde), signal: AbortSignal.timeout(60_000)
      });
      const j = await r.json();
      if (Array.isArray(j)) {
        const m = new Map(j.map((x) => [x.id, x]));
        return istekler.map((_, i) => {
          const c = m.get(i + 1);
          return c && !c.error ? c.result : null;
        });
      }
      if (j && j.error && !/rate|limit|429/i.test(j.error.message)) return istekler.map(() => null);
    } catch (e) { /* retry */ }
    await bekle(g); g = Math.min(g * 2, 8_000);
  }
  return istekler.map(() => null);
}

const pad = (a) => a.slice(2).toLowerCase().padStart(64, "0");
const say = (n) => Number(n).toLocaleString("en");

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

async function zinciriOlc(ad) {
  const Z = ZINCIR[ad];
  console.log("");
  console.log("================================================================");
  console.log(" " + ad.toUpperCase() + "  (zincir " + Z.id + ")");
  console.log("================================================================");

  /* ---- 0. is this chain's own configuration right? ---------------
     A wrong USDC address reports "no pool" for every asset, which reads
     as "nothing works here" instead of "we looked in the wrong place". */
  const usdcSimge = await rpc(Z.rpc, "eth_call",
    [{ to: Z.usdc, data: "0x95d89b41" }, "latest"]);
  const fabKod = await rpc(Z.rpc, "eth_getCode", [Z.v3Fabrika, "latest"]);
  let simge = "";
  try {
    const off = Number(BigInt("0x" + usdcSimge.slice(2, 66)));
    const len = Number(BigInt("0x" + usdcSimge.slice(2 + off * 2, 2 + off * 2 + 64)));
    simge = Buffer.from(usdcSimge.slice(2 + off * 2 + 64, 2 + off * 2 + 64 + len * 2), "hex").toString();
  } catch (e) { /* stays empty */ }
  const fabVar = fabKod && fabKod !== "0x";
  console.log("  USDC " + Z.usdc + "  symbol() -> " + (simge || "OKUNAMADI"));
  console.log("  v3 fabrika " + Z.v3Fabrika + "  " +
    (fabVar ? ((fabKod.length - 2) / 2).toLocaleString("en") + " bayt" : "KOD YOK"));
  if (!/USDC/i.test(simge) || !fabVar) {
    ok(false, ad + ": zincir yapilandirmasi dogrulanamadi",
      "USDC simgesi \"" + simge + "\", fabrika " + (fabVar ? "var" : "YOK") +
      " — bu zincir atlandi, cunku yanlis adresle olculen \"havuz yok\" " +
      "sonucu bir bulgu degil bir hata olurdu");
    return null;
  }

  /* ---- 1. the feed directory ------------------------------------- */
  const r = await fetch(DIZIN[ad], { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) { ok(false, ad + ": besleyici dizini okunamadi", "HTTP " + r.status); return null; }
  const hepsi = await r.json();

  /* Only crypto, only against USD, only with a proxy. Equities are the
     cancelled model and Forex is not a token anybody can hold. */
  const kripto = hepsi.filter((f) =>
    f.proxyAddress &&
    /\/ USD$/.test(f.name || "") &&
    (f.feedType === "Crypto" || (f.docs && f.docs.assetClass === "Crypto")) &&
    f.docs && f.docs.baseAsset
  );

  console.log("  dizinde " + say(hepsi.length) + " besleyici");
  console.log("  bunlardan " + say(kripto.length) + " tanesi KRIPTO + \"X / USD\" + proxy'li");
  const hisse = hepsi.filter((f) => /Equit|Stock/i.test(f.feedType || "") ||
    (f.docs && /Equit/i.test(f.docs.assetClass || ""))).length;
  console.log("  (hariç tutulan: " + say(hisse) + " hisse besleyicisi — iptal edilmiş model)");
  ok(kripto.length > 0, ad + ": kripto besleyici kumesi bos degil", say(kripto.length));

  /* ---- 2. token addresses, by symbol ----------------------------- */
  const tl = await fetch(JETON_LISTESI, { signal: AbortSignal.timeout(30_000) });
  const jetonlar = tl.ok ? (await tl.json()).tokens.filter((t) => t.chainId === Z.id) : [];
  console.log("  Uniswap jeton listesinde bu zincir icin " + say(jetonlar.length) + " jeton");

  const simgeye = new Map();
  for (const t of jetonlar) {
    const s = (t.symbol || "").toUpperCase();
    /* First wins: the canonical list is ordered, and a later duplicate is
       usually a bridged or wrapped variant of the same symbol. */
    if (!simgeye.has(s)) simgeye.set(s, t);
  }

  const adaylar = [];
  for (const f of kripto) {
    const taban = (f.docs.baseAsset || "").toUpperCase();
    /* A feed's base asset and the token's symbol differ for wrapped
       assets: BTC/USD prices WBTC, ETH/USD prices WETH. Tried in order. */
    const denemeler = [taban, "W" + taban, taban === "BTC" ? "CBBTC" : null].filter(Boolean);
    let t = null;
    for (const d of denemeler) { if (simgeye.has(d)) { t = simgeye.get(d); break; } }
    if (!t) continue;
    adaylar.push({
      simge: t.symbol,
      ad: f.docs.assetName || f.assetName || t.name,
      token: t.address,
      ondalik: t.decimals,
      besleyici: f.proxyAddress,
      besleyiciAdi: f.name,
      nabiz: f.heartbeat || null,
      sapma: f.threshold || null,
      kategori: f.feedCategory || null
    });
  }
  console.log("  besleyicisi VE jeton adresi eslesen: " + say(adaylar.length));

  /* ---- 3. does a USDC pool exist, and is the feed readable? ------ */
  /* getPool(tokenA, tokenB, fee) + decimals() + latestRoundData(), all in
     one batch per field. */
  const havuzIstek = [];
  for (const a of adaylar) {
    for (const k of KADEMELER) {
      havuzIstek.push([{
        to: Z.v3Fabrika,
        data: "0x1698ee82" + pad(a.token) + pad(Z.usdc) + k.toString(16).padStart(64, "0")
      }, "latest"]);
    }
  }
  const havuzlar = await toplu(Z.rpc, havuzIstek);

  adaylar.forEach((a, i) => {
    a.havuzlar = [];
    KADEMELER.forEach((k, j) => {
      const h = havuzlar[i * KADEMELER.length + j];
      if (!h || h === "0x") return;
      const adres = "0x" + h.slice(26);
      if (/^0x0{40}$/.test(adres)) return;
      a.havuzlar.push({ kademe: k, havuz: adres });
    });
  });

  const besIstek = adaylar.map((a) => [{ to: a.besleyici, data: "0xfeaf968c" }, "latest"]);
  const besOnd = adaylar.map((a) => [{ to: a.besleyici, data: "0x313ce567" }, "latest"]);
  const [cevaplar, ondaliklar] = await Promise.all([
    toplu(Z.rpc, besIstek), toplu(Z.rpc, besOnd)
  ]);

  const blok = await rpc(Z.rpc, "eth_getBlockByNumber", ["latest", false]);
  const simdi = blok ? Number(BigInt(blok.timestamp)) : Math.floor(Date.now() / 1000);

  adaylar.forEach((a, i) => {
    const c = cevaplar[i], d = ondaliklar[i];
    a.okunabilir = false;
    if (!c || c === "0x" || !d || d === "0x") return;
    try {
      const w = c.slice(2).match(/.{64}/g);
      const fiyat = BigInt("0x" + w[1]);
      const guncel = Number(BigInt("0x" + w[3]));
      if (fiyat <= 0n) return;
      a.okunabilir = true;
      a.besleyiciOndalik = Number(BigInt(d));
      a.fiyat = Number(fiyat) / 10 ** a.besleyiciOndalik;
      a.yas = simdi - guncel;
    } catch (e) { /* unreadable stays false */ }
  });

  /* One row per ASSET, not per feed. The directory lists several proxies
     for the same asset — a canonical one, an SVR variant, a secondary —
     and LINK came back three times, WETH twice. Keeping the FRESHEST
     reading of each: a stale duplicate would be chosen as often as not and
     the window is sized from the heartbeat either way. */
  const enIyi = new Map();
  for (const a of adaylar) {
    if (!a.okunabilir || a.havuzlar.length === 0) continue;
    const k = a.token.toLowerCase();
    const v = enIyi.get(k);
    if (!v || a.yas < v.yas) enIyi.set(k, a);
  }
  const gecen = [...enIyi.values()];
  const mukerrer = adaylar.filter((a) => a.okunabilir && a.havuzlar.length > 0).length - gecen.length;
  if (mukerrer > 0) {
    console.log("  (" + mukerrer + " mukerrer besleyici tekillestirildi — ayni varlik, " +
      "farkli proxy; en tazesi alindi)");
  }
  const besleyicisiz = adaylar.filter((a) => !a.okunabilir);
  const havuzsuz = adaylar.filter((a) => a.okunabilir && a.havuzlar.length === 0);

  console.log("");
  console.log("  ADAYLAR — besleyicisi okunabilir VE USDC havuzu olan: " + gecen.length);
  console.log("");
  console.log("  SIMGE      FIYAT              HAVUZ  NABIZ    PENCERE  YAS      BESLEYICI");
  gecen.sort((a, b) => b.havuzlar.length - a.havuzlar.length || a.simge.localeCompare(b.simge));
  for (const a of gecen) {
    const pencere = a.nabiz ? a.nabiz * 2 : null;
    /* A feed already older than the window it would get is a feed that
       would refuse every conversion the moment it was registered. */
    const bayrak = pencere && a.yas > pencere ? "  <<< YAS PENCEREYI ASIYOR" : "";
    console.log("  " + a.simge.padEnd(10) +
      ("$" + a.fiyat.toLocaleString("en", { maximumFractionDigits: a.fiyat < 1 ? 6 : 2 })).padEnd(18) +
      String(a.havuzlar.length).padStart(5) + "  " +
      (a.nabiz ? a.nabiz + "s" : "—").padStart(7) + "  " +
      (pencere ? pencere + "s" : "—").padStart(7) + "  " +
      (a.yas + "s").padStart(7) + "  " + a.besleyici + bayrak);
  }

  if (havuzsuz.length) {
    console.log("");
    console.log("  FIYATI VAR AMA USDC HAVUZU YOK (" + havuzsuz.length + ") — donusumun");
    console.log("  icine girilip cikilamayacagi varliklar:");
    console.log("   " + havuzsuz.map((a) => a.simge).join(", "));
  }
  if (besleyicisiz.length) {
    console.log("");
    console.log("  BESLEYICISI OKUNAMADI (" + besleyicisiz.length + "):");
    console.log("   " + besleyicisiz.map((a) => a.simge).join(", "));
  }

  ok(gecen.length > 0, ad + ": en az bir aday iki kosulu da gecti", gecen.length + " aday");
  return { zincir: ad, zincirId: Z.id, usdc: Z.usdc, adaylar: gecen };
}

(async () => {
  console.log("TEMINAT ADAYLARI — token ve coinler, hisse DEGIL");
  console.log("");
  console.log("  Kural: teminat bir token ya da coin. Hepsinin ozellikleri ayni,");
  console.log("  hicbirinin ozel durumu yok. Hisseyle eslestirilmis tokenler");
  console.log("  IPTAL ve bu listede yok.");
  console.log("");
  console.log("  Gecmek icin iki sart: Chainlink PROXY'si okunabilir olmali ve");
  console.log("  gercek bir USDC havuzu olmali. Baska kalite kapisi yok —");
  console.log("  likidite tabani gibi vekil olcutler kasitli olarak kullanilmiyor.");

  const secilen = arg("zincir");
  const liste = secilen ? [secilen] : Object.keys(ZINCIR);
  const sonuc = [];
  for (const z of liste) {
    if (!ZINCIR[z]) { console.log("Bilinmeyen zincir: " + z); continue; }
    const s = await zinciriOlc(z);
    if (s) sonuc.push(s);
  }

  if (sonuc.length > 1) {
    console.log("");
    console.log("================================================================");
    console.log(" COKLU ZINCIR — bir varlik kac zincirde calisiyor");
    console.log("================================================================");

    const nerede = new Map();
    for (const s of sonuc) {
      for (const a of s.adaylar) {
        if (!nerede.has(a.simge)) nerede.set(a.simge, []);
        nerede.get(a.simge).push(s.zincir);
      }
    }
    const sirali = [...nerede.entries()].sort((x, y) =>
      y[1].length - x[1].length || x[0].localeCompare(y[0]));

    console.log("  toplam " + sirali.length + " farkli varlik, " + sonuc.length + " zincirde");
    console.log("");
    for (const [z] of [[0]]) { /* header */ }
    console.log("  SIMGE      ZINCIR  NEREDE");
    for (const [simge, zincirler] of sirali) {
      console.log("  " + simge.padEnd(10) + String(zincirler.length).padStart(5) +
        "   " + zincirler.join(", "));
    }

    /* Why the count matters: collateral lives on ONE remote chain at a
       time, but a conversion that can only happen in one place is a
       conversion that stops when that chain gets expensive. An asset
       present on several chains can be entered wherever it is cheapest
       at that moment. */
    const cok = sirali.filter(([, z]) => z.length >= 3);
    console.log("");
    console.log("  UC VE DAHA FAZLA ZINCIRDE CALISANLAR (" + cok.length + "):");
    console.log("   " + cok.map(([s]) => s).join(", "));
  }

  const yol = path.join(__dirname, "..", "teminat-adaylari.json");
  fs.writeFileSync(yol, JSON.stringify({
    olculdu: new Date().toISOString(),
    not: "proxy adresleri; aggregator DEGIL. pencere = nabiz x 2. hisse besleyicileri haric.",
    zincirler: sonuc
  }, null, 1));
  console.log("");
  console.log("  kayit: " + yol);

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  process.exit(1);
});
