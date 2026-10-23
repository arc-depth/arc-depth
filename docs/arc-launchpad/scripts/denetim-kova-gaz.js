"use strict";
/* ===========================================================================
 * denetim-kova-gaz.js — how many basket lines may cross $50 in one trade
 *
 *   node scripts/denetim-kova-gaz.js
 *
 * PulseHook5 passes each trade's collateral tax on through the launch's
 * bucket with VergiKovasi.gonder{gas: KOVA_GAZ = 1.5M}; when the tax pushes
 * basket lines over $50 the Defter sends them to their vaults inside that
 * call. This measures, on the live v4 set in eth_simulateV1 (nothing sent):
 *
 *   A  per combination of lines (equal weights, so they cross together):
 *        - the real trade: did the bucket empty (hook's 1.5M was enough)?
 *        - VergiKovasi.gonder alone, called with ample gas on the same
 *          crossing: the gas it uses (minus the 21,000 intrinsic)
 *   B  unequal weights 40/25/15/12/8: a run of $2,500 buys ($50 tax each)
 *      and one $40,000 buy — how many lines cross in a single trade.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface, AbiCoder, keccak256, zeroPadValue, solidityPacked, toUtf8Bytes, toBeHex, decodeBase58, getAddress } = require("ethers");

const KOK = path.join(__dirname, "..");
/* CANLI_KAYIT: the record of the live set to test (default v4) */
const V4 = JSON.parse(fs.readFileSync(process.env.CANLI_KAYIT || path.join(KOK, "dagitim-v4.json"), "utf8"));
const A4 = V4.zincir.arc;
const art = (n) => new Interface(JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8")).abi);
const IK = art("MerkezKapi"), ID = art("SepetDefteri");
const IE = new Interface(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"]);
const IKOVA = new Interface(["function gonder()"]);
const LPI = new Interface(["function launchCount() view returns (uint256)",
  "function launchAt(uint256) view returns ((address token,address acici,address kasa,uint256 teminat,address kurucu,uint256 kurucuToken,uint256 teklif,uint256 vergiPpm,uint64 zaman))"]);
const c = AbiCoder.defaultAbiCoder();
const USDC = "0x3600000000000000000000000000000000000000";
const K = "0x00000000000000000000000000000000000f00d1", A = "0x00000000000000000000000000000000000a11ce";
const BOL = "0x" + (10n ** 24n).toString(16);
const SUI_TIP = "0".repeat(63) + "2::sui::SUI";
const KOVA_GAZ = 1_500_000;
const b32 = (a) => zeroPadValue(a, 32);
const sec = (g) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, g]);
const d6 = (x) => (Number(BigInt(x)) / 1e6).toFixed(2);

/* the six kinds of line (starting quotes are rough: they only seed auctions) */
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
      const r = await fetch(process.env.ARC_RPC || "https://arc-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
      if (r.error) throw new Error(m + ": " + JSON.stringify(r.error).slice(0, 400));
      return r.result;
    } catch (e) { if (i >= 2 || /execution|revert|gas limit|timestamps/i.test(e.message)) throw e; await new Promise((ok) => setTimeout(ok, 1500)); }
  }
};
const cagri = (from, to, data, gaz = 300_000) => ({ from, to, data, gas: "0x" + gaz.toString(16) });
const sim = async (bloklar) => {
  const t = Number(BigInt((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp)) + 5;
  return rpc("eth_simulateV1", [{ blockStateCalls: bloklar.map(({ dt, calls, ez }) => ({ ...(ez ? { stateOverrides: ez } : {}),
    blockOverrides: { time: "0x" + (t + dt).toString(16) }, calls })), validation: false }, "latest"]);
};
const gonderildi = (logs) => logs.filter((l) => l.address.toLowerCase() === A4.SepetDefteri.toLowerCase()).map((l) => { try { return ID.parseLog(l); } catch (e) { return null; } })
  .filter((x) => x && x.name === "Gonderildi");

/* a launch with these lines at these dollars (6 decimals); returns the blocks up to the launch and the bucket */
async function launchBloklari(satirlar, dolarlar) {
  const toplam = 100_000_000n + dolarlar.reduce((n, d) => n + d, 0n);
  const istek = ["Kova Olcum", "KOVA", satirlar.map((s, i) => [s.z, s.v, dolarlar[i]]), satirlar.map((s) => s.birim), 20_000n, 100_000_000n,
    b32(K), 26, 0, [], sec(6_300_000n), 0n, sec(100_000n), K, satirlar.map((s) => s.tip || ""), [], 0n];
  const n0 = BigInt(await rpc("eth_call", [{ to: A4.PulseLaunchpad5, data: LPI.encodeFunctionData("launchCount", []) }, "latest"]));
  const b = [
    { dt: 0, ez: { [K]: { balance: BOL }, [A]: { balance: BOL } }, calls: [cagri(K, USDC, IE.encodeFunctionData("approve", [A4.MerkezKapi, toplam])),
      cagri(K, A4.MerkezKapi, IK.encodeFunctionData("launch", [istek]), 27_000_000)] },
    { dt: 30, calls: [cagri(A, A4.PulseLaunchpad5, LPI.encodeFunctionData("launchAt", [n0]), 1_000_000), cagri(A, USDC, IE.encodeFunctionData("approve", [A4.MerkezKapi, 10n ** 15n]))] },
  ];
  const r = await sim(b);
  if (r[0].calls[1].status !== "0x1") throw new Error("launch geri dondu: " + JSON.stringify(r[0].calls[1].error).slice(0, 300));
  const token = getAddress(c.decode(["address"], r[0].calls[1].returnData)[0]);
  const kova = getAddress(LPI.decodeFunctionResult("launchAt", r[1].calls[0].returnData)[0].kasa);
  return { b, token, kova };
}
const al = (token, dolar6) => cagri(A, A4.MerkezKapi, IK.encodeFunctionData("al", [token, dolar6, 0n, 0, b32(A), "0x", A]), 27_000_000);

(async () => {
  console.log("KOVA GAZI  ayni islemde $50'yi gecen satir sayisi ve VergiKovasi.gonder gazi (canli v4, eth_simulateV1, gonderim yok)");
  console.log("  hook kovaya " + KOVA_GAZ.toLocaleString("en-US") + " gaz veriyor\n");
  console.log("  satirlar".padEnd(52) + "gecen  islemde (hook 1,5M)   gonder gazi (bol gazla)");
  const sonuc = [];
  for (const kombo of KOMBO) {
    const satirlar = kombo.map((k) => SATIR[k]);
    /* equal weights: $4 each (total at least $20: one line alone carries $20) */
    const d = satirlar.length === 1 ? [20_000_000n] : satirlar.map(() => (satirlar.length >= 5 ? 4_000_000n : BigInt(Math.ceil(20 / satirlar.length * 1e6))));
    try {
      const { b, token, kova } = await launchBloklari(satirlar, d);
      /* one $40,000 buy: $800 of tax, every line crosses */
      const r = await sim([...b, { dt: 40, calls: [al(token, 40_000_000_000n)] }, { dt: 41, calls: [cagri(A, USDC, IE.encodeFunctionData("balanceOf", [kova]))] }]);
      const islem = r[2].calls[0], kalan = BigInt(r[3].calls[0].returnData);
      const gecenIslemde = gonderildi(islem.logs).length;
      /* the same crossing, the bucket's call alone with ample gas: the trade's tax left in the bucket by a hook that got no gas
         is reproduced by moving that tax to the bucket directly */
      const vergi = 800_000_000n;
      const r2 = await sim([...b, { dt: 40, calls: [cagri(A, USDC, IE.encodeFunctionData("transfer", [kova, vergi])), cagri(A, kova, IKOVA.encodeFunctionData("gonder", []), 20_000_000)] }]);
      const g = r2[2].calls[1], gaz = BigInt(g.gasUsed) - 21_000n, gecen = gonderildi(g.logs).length;
      const gecti = kalan === 0n;
      sonuc.push({ ad: satirlar.map((s) => s.ad).join(" + "), n: satirlar.length, gecen, gecti, gaz, kalan, uzak: kombo.every((k) => k !== "arc") });
      console.log("  " + satirlar.map((s) => s.ad).join(" + ").padEnd(50) + String(gecen).padStart(4) + "   " +
        (gecti ? "GECTI (kova bos)       " : "KALDI (kovada $" + d6(kalan) + ")").padEnd(24) + gaz.toLocaleString("en-US").padStart(11) + (gaz > BigInt(KOVA_GAZ) ? "  > 1,5M" : ""));
    } catch (e) { console.log("  " + kombo.join("+").padEnd(50) + " HATA " + e.message.slice(0, 200)); }
  }

  /* B: unequal weights 40/25/15/12/8 */
  console.log("\nB) esit olmayan agirliklar 40/25/15/12/8 (Base, Arbitrum, Solana, Sui, Aptos; $40/$25/$15/$12/$8)");
  const sB = ["base", "arb", "sol", "sui", "apt"].map((k) => SATIR[k]);
  const dB = [40_000_000n, 25_000_000n, 15_000_000n, 12_000_000n, 8_000_000n];
  const { b, token, kova } = await launchBloklari(sB, dB);
  /* a run of $2,500 buys: $50 of tax each */
  const dizi = [...b];
  for (let i = 0; i < 12; i++) dizi.push({ dt: 40 + i, calls: [al(token, 2_500_000_000n)] });
  const r = await sim(dizi);
  let enCok = 0;
  r.slice(2).forEach((x, i) => {
    const gs = gonderildi(x.calls[0].logs);
    enCok = Math.max(enCok, gs.length);
    if (gs.length) console.log("  $2.500 alim #" + (i + 1) + ": " + gs.length + " satir gecti (" + gs.map((g) => g.args.zincir + ":$" + d6(g.args.dolar)).join(" ") + ")");
  });
  console.log("  $2.500'lik alimlarda tek islemde en fazla " + enCok + " satir gecti");
  const rb = await sim([...b, { dt: 40, calls: [al(token, 40_000_000_000n)] }, { dt: 41, calls: [cagri(A, USDC, IE.encodeFunctionData("balanceOf", [kova]))] }]);
  const gb = gonderildi(rb[2].calls[0].logs), kb = BigInt(rb[3].calls[0].returnData);
  console.log("  tek $40.000 alim ($800 vergi): islemde " + gb.length + " satir gecti, kovada $" + d6(kb) + (kb ? " KALDI" : " (bos)"));

  const guvenli = [1, 2, 3, 4, 5].filter((n) => sonuc.filter((s) => s.n === n).length && sonuc.filter((s) => s.n === n).every((s) => s.gecti));
  console.log("\nGUVENLI EN BUYUK SATIR SAYISI (hepsi ayni islemde gecince, en kotu kombinasyon dahil): " + (guvenli.length ? Math.max(...guvenli.filter((n, i) => guvenli[i] === i + 1)) : 0));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
