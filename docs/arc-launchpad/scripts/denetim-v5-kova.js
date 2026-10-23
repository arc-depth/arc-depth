"use strict";
/* ===========================================================================
 * denetim-v5-kova.js — v5: the tax always reaches the basket, 1 to 5 lines
 *
 *   node scripts/denetim-v5-kova.js
 *
 * The v5 set (Defter sends at most two lines per call, the fullest first;
 * the hook asks the bucket whether this tax sends lines and then requires
 * the gas for it, KOVA_GAZ, or for booking only, KOVA_KUCUK) is deployed in
 * eth_simulateV1 on Arc mainnet state exactly as contracts/test/TestV4Arc
 * deploys a set, bound to the live v4 vaults' addresses on Base, Arbitrum,
 * Solana, Sui and Aptos. Nothing is sent. For every mix of lines measured on
 * v4 (scripts/denetim-kova-gaz.js), equal weights so they cross together:
 *
 *   1  one $40,000 buy ($800 of tax): the bucket is empty after it, at most
 *      two lines left, the rest wait on their accounts
 *   2  the next trades ($100 buys) send the waiting lines two by two until
 *      none is left at $50 or more
 *   3  the gas: the least gas a crossing trade succeeds with (what a wallet's
 *      estimate finds) still empties the bucket; 1% less reverts
 *      (KovaGazi) instead of leaving the tax behind; the bucket's own cost
 *      with two worst-case lines, against KOVA_GAZ
 *   4  a redemption while three lines wait above $50: paid their share
 * and unequal weights 40/25/15/12/8 with one $40,000 buy.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface, AbiCoder, keccak256, getCreateAddress, getCreate2Address, zeroPadValue, toUtf8Bytes, toBeHex, decodeBase58, id: selektor } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://arc-rpc.publicnode.com";
const H = "0x00000000000000000000000000000000000c0de4";
const GONDEREN = "0x00000000000000000000000000000000000F00d1";
const TUCCAR = "0x00000000000000000000000000000000000a11ce";
const art = (n) => JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8"));
const T = art("TestV5Kova"), I = new Interface(T.abi), IK = new Interface(art("MerkezKapi").abi);
const IKOVA = new Interface(["function gonder()"]);
const IE = new Interface(["function approve(address,uint256) returns (bool)", "function transfer(address,uint256) returns (bool)"]);
const V2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-v2.json"), "utf8")).zincir.arc;
const V4 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-v4.json"), "utf8"));
const HOOK = art("PulseHook5");
const c = AbiCoder.defaultAbiCoder();
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951", TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const EP = "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B", C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const DEVPOOL = "0xA110b71c3f0748536f10C9e71A6E9F96999F6CD0", ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9", USDC = "0x3600000000000000000000000000000000000000";
const HOOK_BIT = 0x2ECC, HOOK_MASKE = (1 << 14) - 1;
const BOL = "0x" + (10n ** 26n).toString(16);
const b32 = (a) => zeroPadValue(a, 32);
const d6 = (x) => (Number(BigInt(x)) / 1e6).toFixed(2);
const KOVA_GAZ = 2_000_000n;
const KOVA_GAZI = selektor("KovaGazi(uint256)").slice(0, 10);

const SUI_TIP = "0".repeat(63) + "2::sui::SUI";
const SATIR = {
  arc: { ad: "Arc FTHM", z: 26, v: b32("0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE"), birim: 266_000n * 10n ** 18n },
  base: { ad: "Base WETH", z: 6, v: b32("0x4200000000000000000000000000000000000006"), birim: 1_600_000_000_000_000n },
  arb: { ad: "Arbitrum WETH", z: 3, v: b32("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"), birim: 1_600_000_000_000_000n },
  sol: { ad: "Solana SOL", z: 5, v: toBeHex(decodeBase58("So11111111111111111111111111111111111111112"), 32), birim: 30_000_000n },
  sui: { ad: "Sui SUI", z: 8, v: keccak256(toUtf8Bytes(SUI_TIP)), birim: 4_000_000_000n, tip: SUI_TIP },
  apt: { ad: "Aptos APT", z: 9, v: b32("0x0a"), birim: 500_000_000n },
};
const KOMBO = [
  ["arc"], ["base"], ["sol"], ["sui"], ["apt"],
  ["arc", "base"], ["base", "arb"], ["sol", "sui"],
  ["arc", "base", "sol"], ["base", "arb", "sol"], ["sol", "sui", "apt"],
  ["arc", "base", "sol", "sui"], ["base", "arb", "sol", "sui"], ["base", "sol", "sui", "apt"],
  ["arc", "base", "sol", "sui", "apt"], ["base", "arb", "sol", "sui", "apt"],
];

const rpc = async (m, p) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
      if (r.error) throw new Error(m + ": " + JSON.stringify(r.error).slice(0, 500));
      return r.result;
    } catch (e) { if (i >= 3 || /execution|revert|timestamps/i.test(e.message)) throw e; await new Promise((ok) => setTimeout(ok, 2000)); }
  }
};
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { if (k) gecti++; else kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };

/* the set: H's nonces as in TestV4Arc (kur1 creates at 1..5, kur2 the launchpad at 6, the gate at 7) */
const n = (i) => getCreateAddress({ from: H, nonce: i });
const LP = n(6), LIKIDITE = n(4);
const hookInit = HOOK.bytecode + c.encode(["address", "address", "address", "address", "address", "address", "address"],
  [PM, LP, USDC, DEVPOOL, LIKIDITE, ISLETME, V2.FthmYakici]).slice(2);
let tuz;
for (let i = 0; ; i++) {
  const t = "0x" + i.toString(16).padStart(64, "0");
  if ((parseInt(getCreate2Address(C2, t, keccak256(hookInit)).slice(-4), 16) & HOOK_MASKE) === HOOK_BIT) { tuz = t; break; }
}
const adr = { haberci: V2.HaberciLZ, yayici: YAYICI, fabrika4: V2.PulseFabrika4, fthmYakici: V2.FthmYakici, pm: PM, tm: TM, ep: EP,
  devpool: DEVPOOL, isletme: ISLETME, kasaBase: V4.zincir.base.SepetKasasi };
const KAPI = n(7);
const ekZincir = [3, 5, 8, 9];
const ekKasa = [b32(V4.zincir.arbitrum.SepetKasasi), V4.uzak.solana.kasa, V4.uzak.sui.kasa, V4.uzak.aptos.kasa];

let simdi = 0;
const cagri = (from, to, data, gaz = 27_000_000n) => ({ from, to, data, gas: "0x" + BigInt(gaz).toString(16) });
/* blocks keep their offset; each simulation places them after the chain's latest block at that moment */
const blok = (dt, calls, ez) => ({ dt, calls, ez });
const sim = async (bloklar) => {
  simdi = Number(BigInt((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp)) + 2;
  return rpc("eth_simulateV1", [{ blockStateCalls: bloklar.map(({ dt, calls, ez }) => ({ ...(ez ? { stateOverrides: ez } : {}),
    blockOverrides: { time: "0x" + (simdi + dt).toString(16) }, calls })), validation: false }, "latest"]);
};

function kurulum(satirlar, dolarlar) {
  return [
    blok(2, [cagri(GONDEREN, H, I.encodeFunctionData("kur1", [adr]))],
      { [H]: { code: T.deployedBytecode, balance: BOL, nonce: "0x1" }, [TUCCAR]: { balance: BOL }, [EP]: { balance: BOL } }),
    blok(3, [cagri(GONDEREN, H, I.encodeFunctionData("kur2", [adr, hookInit, tuz]))]),
    blok(4, [cagri(GONDEREN, H, I.encodeFunctionData("baglaEk", [ekZincir, ekKasa]))]),
    blok(5, [cagri(GONDEREN, H, I.encodeFunctionData("launchSatir", [satirlar.map((s, i) => [s.z, s.v, dolarlar[i]]), satirlar.map((s) => s.birim), satirlar.map((s) => s.tip || "")]))]),
    blok(80, [cagri(TUCCAR, USDC, IE.encodeFunctionData("approve", [KAPI, 10n ** 30n]), 200_000n)]),
  ];
}
const al = (token, dolar6, gaz) => cagri(TUCCAR, KAPI, IK.encodeFunctionData("al", [token, dolar6, 0n, 0, b32(TUCCAR), "0x", TUCCAR]), gaz);
const durumCagri = (z) => cagri(GONDEREN, H, I.encodeFunctionData("durum", [z]), 2_000_000n);
const durumOku = (x, ) => { const [kova, satir, dolu] = I.decodeFunctionResult("durum", x.returnData); return { kova: BigInt(kova), satir: satir.map(BigInt), dolu: [...dolu] }; };
const kontrol = (r, i, ad) => { for (const [j, x] of r.slice(0, i).entries()) for (const cc of x.calls) if (cc.status !== "0x1") throw new Error(ad + ": blok " + (j + 1) + " basarisiz " + JSON.stringify(cc.error || "").slice(0, 300)); };

async function kombo(anahtarlar) {
  const satirlar = anahtarlar.map((k) => SATIR[k]);
  const dolar = satirlar.length === 1 ? [20_000_000n] : satirlar.map(() => (satirlar.length >= 5 ? 4_000_000n : BigInt(Math.ceil(20 / satirlar.length * 1e6))));
  const z = satirlar.map((s) => s.z);
  const kur = kurulum(satirlar, dolar);
  let r = await sim(kur);
  kontrol(r, kur.length, "kurulum");
  const token = I.decodeFunctionResult("launchSatir", r[3].calls[0].returnData)[0];
  /* 1-2: the $40k buy, then $100 buys until nothing waits at $50 */
  const bloklar = [...kur, blok(90, [al(token, 40_000_000_000n), durumCagri(z)])];
  for (let i = 0; i < 3; i++) bloklar.push(blok(100 + i, [al(token, 100_000_000n), durumCagri(z)]));
  r = await sim(bloklar);
  kontrol(r, bloklar.length, "islemler");
  const s1 = durumOku(r[kur.length].calls[1]);
  const giden1 = s1.dolu.filter(Boolean).length;
  const bekleyen1 = s1.satir.filter((x) => x >= 50_000_000n).length;
  const sonlar = r.slice(kur.length + 1).map((x) => durumOku(x.calls[1]));
  const kac = sonlar.findIndex((s) => s.satir.every((x) => x < 50_000_000n) && s.dolu.every(Boolean));
  return { ad: satirlar.map((s) => s.ad).join(" + "), n: satirlar.length, kova1: s1.kova, giden1, bekleyen1, kac, sonKova: sonlar[sonlar.length - 1].kova, token, kur, z };
}

(async () => {
  simdi = Number(BigInt((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp)) + 2;
  console.log("V5 KOVA  1-5 satir, her karisim; vergi her islemde sepete (Arc ana ag durumu, eth_simulateV1, gonderim yok)\n");
  console.log("1-2) tek $40.000 alim ($800 vergi), sonra $100'lik alimlar");
  const sonuclar = [];
  for (const k of KOMBO) {
    try {
      const s = await kombo(k);
      sonuclar.push(s);
      ok(s.kova1 === 0n && s.giden1 <= 2 && s.giden1 === Math.min(2, s.n) && s.kac >= 0 && s.sonKova === 0n,
        s.ad.padEnd(48) + " kova bos; ilk islemde " + s.giden1 + " satir, sonraki " + (s.kac + 1) + " islemde hepsi kasada");
    } catch (e) { ok(false, k.join("+") + " " + e.message.slice(0, 200)); }
  }

  /* 3: the least gas a crossing trade succeeds with, on the worst five-line mix */
  console.log("\n3) cuzdanin gaz tahmini: gecen en az gaz kovayi yine bosaltiyor mu");
  const en = sonuclar.find((s) => s.ad === "Base WETH + Arbitrum WETH + Solana SOL + Sui SUI + Aptos APT");
  const deneme = async (gaz) => {
    const r = await sim([...en.kur, blok(90, [al(en.token, 40_000_000_000n, gaz), durumCagri(en.z)])]);
    return { c: r[en.kur.length].calls[0], d: durumOku(r[en.kur.length].calls[1]) };
  };
  let alt = 300_000n, ust = 27_000_000n;
  while (ust - alt > 20_000n) { const orta = (alt + ust) / 2n; if ((await deneme(orta)).c.status === "0x1") ust = orta; else alt = orta; }
  const enAz = await deneme(ust), az = await deneme((ust * 99n) / 100n);
  ok(enAz.c.status === "0x1" && enAz.d.kova === 0n && enAz.d.dolu.filter(Boolean).length === 2,
    "en az gazla (" + ust.toLocaleString("en-US") + ") gecen islem kovayi bosaltti ve 2 satiri gonderdi");
  ok(az.c.status !== "0x1" && String(az.c.returnData || az.c.error?.data || "").includes(KOVA_GAZI.slice(2)),
    "%1 az gazla islem kovayi atlamadi, KovaGazi ile geri dondu (cuzdan tahmini kovayi icermek zorunda)");
  /* a trade that crosses nothing: booking only */
  const kucuk = async (gaz) => {
    const r = await sim([...en.kur, blok(90, [al(en.token, 100_000_000n, gaz), durumCagri(en.z)])]);
    return { c: r[en.kur.length].calls[0], d: durumOku(r[en.kur.length].calls[1]) };
  };
  let a2 = 200_000n, u2 = 5_000_000n;
  while (u2 - a2 > 10_000n) { const o = (a2 + u2) / 2n; if ((await kucuk(o)).c.status === "0x1") u2 = o; else a2 = o; }
  const k2 = await kucuk(u2);
  ok(k2.c.status === "0x1" && k2.d.kova === 0n, "esik gecmeyen islem: en az gazla (" + u2.toLocaleString("en-US") + ") vergi yine Defter'e islendi, kova bos");
  /* the bucket's own cost: two worst-case lines (Base + Arbitrum) due, called with ample gas */
  const iki = sonuclar.find((s) => s.ad === "Base WETH + Arbitrum WETH");
  const kova = I.decodeFunctionResult("durum", (await sim([...iki.kur, blok(85, [durumCagri(iki.z)])]))[iki.kur.length].calls[0].returnData);
  const lpKasa = await (async () => {
    const LPI = new Interface(["function launchAt(uint256) view returns ((address token,address acici,address kasa,uint256 teminat,address kurucu,uint256 kurucuToken,uint256 teklif,uint256 vergiPpm,uint64 zaman))"]);
    const r = await sim([...iki.kur, blok(85, [cagri(GONDEREN, LP, LPI.encodeFunctionData("launchAt", [0]), 1_000_000n)])]);
    return LPI.decodeFunctionResult("launchAt", r[iki.kur.length].calls[0].returnData)[0].kasa;
  })();
  kova;
  const rg = await sim([...iki.kur, blok(85, [cagri(TUCCAR, USDC, IE.encodeFunctionData("transfer", [lpKasa, 800_000_000n]), 200_000n),
    cagri(TUCCAR, lpKasa, IKOVA.encodeFunctionData("gonder", []), 20_000_000n), durumCagri(iki.z)])]);
  const gk = BigInt(rg[iki.kur.length].calls[1].gasUsed) - 21_000n;
  const dk = durumOku(rg[iki.kur.length].calls[2]);
  ok(dk.dolu.every(Boolean) && gk * 3n < KOVA_GAZ * 2n, "kova 2 en pahali satiri (Base + Arbitrum) gonderirken " + gk.toLocaleString("en-US") +
    " gaz harcadi; KOVA_GAZ " + KOVA_GAZ.toLocaleString("en-US") + " (en az 1,5 kat pay)");

  /* 4: a redemption while lines wait above $50 */
  console.log("\n4) satirlar $50 ustunde beklerken itfa");
  const bes = sonuclar.find((s) => s.ad === "Arc FTHM + Base WETH + Solana SOL + Sui SUI + Aptos APT");
  const rI = await sim([...bes.kur, blok(90, [al(bes.token, 40_000_000_000n), durumCagri(bes.z)]),
    blok(120, [cagri(GONDEREN, H, I.encodeFunctionData("itfa", []), 27_000_000n), durumCagri(bes.z)])]);
  const once = durumOku(rI[bes.kur.length].calls[1]);
  const itfa = rI[bes.kur.length + 1].calls[0];
  const [f] = itfa.status === "0x1" ? I.decodeFunctionResult("itfa", itfa.returnData) : [null];
  ok(itfa.status === "0x1" && once.satir.filter((x) => x >= 50_000_000n).length === 3 && BigInt(f.arcPay) > 0n,
    "3 satir $50 ustunde beklerken itfa gecti, bekleyen dolarin payi aninda odendi", f ? d6(f.arcPay) + " $" : JSON.stringify(itfa.error || "").slice(0, 200));

  /* 5: a twin holder's sale arriving as the gate's compose while lines are due: 3.5M (the site's compose gas) sells
        and sends the tax on; 900k (the v4 site's) cannot, and the tokens go back to the seller's fallback on Arc */
  console.log("\n5) baska zincirden satis (compose) satirlar esikteyken");
  {
    const YEDEK = "0x000000000000000000000000000000000000bEEF";
    const ITE = new Interface(["function balanceOf(address) view returns (uint256)"]);
    const istek = c.encode(["uint8", "uint32", "bytes32", "uint256", "address", "uint256"], [0, 26, b32(YEDEK), 0n, YEDEK, 0n]);
    const m = 1_000_000n * 10n ** 18n;
    const mesaj = require("ethers").solidityPacked(["uint64", "uint32", "uint256", "bytes32", "bytes"], [1, 30184, m, b32(YEDEK), istek]);
    const dene = async (gaz) => {
      const r0 = await sim([...en.kur, blok(90, [al(en.token, 40_000_000_000n), durumCagri(en.z)]),
        blok(95, [cagri(GONDEREN, H, I.encodeFunctionData("uzakHazirla", [m]), 2_000_000n)])]);
      const adapter = I.decodeFunctionResult("uzakHazirla", r0[en.kur.length + 1].calls[0].returnData)[0];
      const r = await sim([...en.kur, blok(90, [al(en.token, 40_000_000_000n), durumCagri(en.z)]),
        blok(95, [cagri(GONDEREN, H, I.encodeFunctionData("uzakHazirla", [m]), 2_000_000n)]),
        blok(100, [cagri(EP, KAPI, IK.encodeFunctionData("lzCompose", [adapter, "0x" + "11".repeat(32), mesaj, EP, "0x"]), gaz), durumCagri(en.z),
          cagri(GONDEREN, USDC, ITE.encodeFunctionData("balanceOf", [YEDEK]), 100_000n), cagri(GONDEREN, en.token, ITE.encodeFunctionData("balanceOf", [YEDEK]), 100_000n)])]);
      const x = r[en.kur.length + 2].calls;
      const once = durumOku(r[en.kur.length].calls[1]);
      return { ok: x[0].status === "0x1", once, sonra: durumOku(x[1]), usdc: BigInt(x[2].returnData), tok: BigInt(x[3].returnData) };
    };
    const a = await dene(3_500_000n), b = await dene(900_000n);
    ok(a.ok && a.usdc > 0n && a.tok === 0n && a.sonra.kova === 0n && a.sonra.dolu.filter(Boolean).length > a.once.dolu.filter(Boolean).length,
      "3,5M gazla compose satisi gecti (" + d6(a.usdc) + " $ Arc'ta), vergisi sepete, bekleyen satirlar gonderildi");
    console.log("       900k gazla (v4 sitesinin compose gazi): cagri " + (b.ok ? "gecti" : "geri dondu") + ", yedekte " + d6(b.usdc) + " $ ve " +
      (b.tok / 10n ** 18n).toString() + " token");
    ok(b.usdc < 100_000n && (b.tok === m || !b.ok), "900k gazla satis olmuyor (tokenler yedege doner ya da mesaj uc noktada bekler, kayip yok): site artik 3,5M veriyor");
  }

  /* unequal weights */
  console.log("\nB) esit olmayan agirliklar 40/25/15/12/8, tek $40.000 alim");
  {
    const satirlar = ["base", "arb", "sol", "sui", "apt"].map((k) => SATIR[k]);
    const kur = kurulum(satirlar, [40_000_000n, 25_000_000n, 15_000_000n, 12_000_000n, 8_000_000n]);
    let r = await sim(kur);
    const token = I.decodeFunctionResult("launchSatir", r[3].calls[0].returnData)[0];
    const z = satirlar.map((s) => s.z);
    const bl = [...kur, blok(90, [al(token, 40_000_000_000n), durumCagri(z)])];
    for (let i = 0; i < 3; i++) bl.push(blok(100 + i, [al(token, 100_000_000n), durumCagri(z)]));
    r = await sim(bl);
    const s1 = durumOku(r[kur.length].calls[1]);
    const son = durumOku(r[r.length - 1].calls[1]);
    ok(s1.kova === 0n && s1.dolu.filter(Boolean).length === 2 && s1.dolu[0] && s1.dolu[1] && son.dolu.every(Boolean) && son.kova === 0n,
      "kova bos; ilk islemde en dolu iki satir (Base $40, Arbitrum $25 agirlik) gitti, sonrakilerde hepsi kasada");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
