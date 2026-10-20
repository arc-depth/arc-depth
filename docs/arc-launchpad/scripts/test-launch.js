"use strict";
/* ===========================================================================
 * test-launch.js — the first real launch through the gate, end to end
 *
 *   node scripts/test-launch.js            dry: the plan, live quotes, cost
 *   node scripts/test-launch.js --uygula   approve, simulate, launch
 *
 * A real token, named as a test, launched from Arc through the deployed
 * MerkezKapi by the deployer (the founder of record, paid on Arc): $100
 * first buy and a $20 basket spread over five chains so every delivery path
 * runs with real money — FTHM on Arc, WETH on Base, ARB on Arbitrum, SUI on
 * Sui, APT on Aptos ($4 each) — and twins on all eight other EVM chains.
 * Each line's starting quote is units per its dollars at today's price
 * (FTHM from the Arc pool, the rest from CoinGecko). Then bekci.js carries
 * the basket to the vaults; the auctions buy the assets.
 * Record: dagitim-test-launch.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, Interface, AbiCoder, zeroPadValue, keccak256, toUtf8Bytes, solidityPacked } = require("ethers");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const K = require("./merkez-abi-v1");
const KAPI = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sepet.json"), "utf8")).merkez.MerkezKapi;
const USDC = "0x3600000000000000000000000000000000000000";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const FTHM = "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE";
const ARC_PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const IKIZ_EID = [30416, 30184, 30110, 30101, 30102, 30106, 30390, 30367];
const sec = (g) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, g]);
const coder = AbiCoder.defaultAbiCoder();
const SUI_TIP = "0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const SATIR = 4_000_000n;   // $4 a line
const SEPET = [
  { ad: "FTHM on Arc", zincir: 26, varlik: zeroPadValue(FTHM, 32), dec: 18, fiyat: "fthm" },
  { ad: "WETH on Base", zincir: 6, varlik: zeroPadValue("0x4200000000000000000000000000000000000006", 32), dec: 18, fiyat: "ethereum" },
  { ad: "ARB on Arbitrum", zincir: 3, varlik: zeroPadValue("0x912CE59144191C1204E64559FE8253a0e49E6548", 32), dec: 18, fiyat: "arbitrum" },
  { ad: "SUI on Sui", zincir: 8, varlik: keccak256(toUtf8Bytes(SUI_TIP)), dec: 9, fiyat: "sui", tip: SUI_TIP },
  { ad: "APT on Aptos", zincir: 9, varlik: zeroPadValue("0x0a", 32), dec: 8, fiyat: "aptos" },
];

async function fthmBirim(arc) {
  /* the Arc FTHM/USDC pool's slot0 (pool id from dagitim-fathom.json): FTHM raw per USDC raw */
  const id = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8")).havuzId;
  const w = await new Contract(ARC_PM, ["function extsload(bytes32) view returns (bytes32)"], arc).extsload(keccak256(coder.encode(["bytes32", "uint256"], [id, 6])));
  const sqrt = BigInt(w) & ((1n << 160n) - 1n);
  return (sqrt * sqrt) >> 192n;   // FTHM raw per USDC raw (6 dp)
}

(async () => {
  const arc = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const w = new Wallet(pk, arc);
  const cg = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,arbitrum,sui,aptos&vs_currencies=usd").then((x) => x.json());
  const fthmPerUsdc = await fthmBirim(arc);
  const teklif = SEPET.map((s) => s.fiyat === "fthm" ? fthmPerUsdc * SATIR
    : BigInt(Math.floor((Number(SATIR) / 1e6 / cg[s.fiyat].usd) * 10 ** s.dec)));
  const ikizSec = sec(3_500_000n);
  const ikizUcret = ((await new Contract(YAYICI, ["function ucret(address,uint32[],bytes) view returns (uint256)"], arc).ucret(FTHM, IKIZ_EID, ikizSec)) * 13n) / 10n;
  const istek = {
    ad: "ARC PULSE Test One", sembol: "PTEST1",
    sepet: SEPET.map((s) => ({ zincir: s.zincir, varlik: s.varlik, dolar: SATIR })), teklif,
    vergiPpm: 20_000n, alim: 100_000_000n,
    kurucu: zeroPadValue(w.address, 32), kurucuZincir: 26, kurucuEid: 0,
    ikizler: IKIZ_EID, ikizSecenek: ikizSec, ikizUcret, gonderSecenek: "0x", iade: w.address,
  };
  const toplam = istek.alim + SATIR * BigInt(SEPET.length);
  const bakiye = await arc.getBalance(w.address);
  console.log("TEST LAUNCH  " + (UYGULA ? "UYGULA" : "KURU") + "  kapi " + KAPI + "  kurucu " + w.address);
  console.log("  " + istek.ad + " (" + istek.sembol + ")  alim $100, sepet $" + Number(toplam - istek.alim) / 1e6 + ", vergi %2, ikiz 8 zincir");
  SEPET.forEach((s, i) => console.log("    " + s.ad.padEnd(16) + "$4  teklif " + (Number(teklif[i]) / 10 ** s.dec).toPrecision(6) + " birim"));
  console.log("  dolar " + Number(toplam) / 1e6 + " USDC + ikiz ucreti " + (Number(ikizUcret) / 1e18).toFixed(3) + " USDC (fazlasi geri doner)  bakiye " + (Number(bakiye) / 1e18).toFixed(2));
  if (!UYGULA) { console.log("  (kuru) --uygula: onay, simulasyon, launch"); return; }

  const usdc = new Contract(USDC, ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"], w);
  if ((await usdc.allowance(w.address, KAPI)) < toplam) { const t = await usdc.approve(KAPI, toplam); await t.wait(); console.log("  onay " + t.hash); }
  const kapi = new Contract(KAPI, K, w);
  const token = await kapi.launch.staticCall(istek, { value: ikizUcret });
  console.log("  simulasyon tamam, token " + token);
  /* measured, with room: 5 lines and 8 twins took 11.9M on 18 Oct (a fixed 12M ran out) */
  const gaz = ((await kapi.launch.estimateGas(istek, { value: ikizUcret })) * 13n) / 10n;
  console.log("  gaz " + gaz);
  const t = await kapi.launch(istek, { value: ikizUcret, gasLimit: gaz < 28_000_000n ? gaz : 28_000_000n });
  const m = await t.wait();
  if (m.status !== 1) throw new Error("launch geri dondu " + t.hash);
  const e = m.logs.map((l) => { try { return K.parseLog(l); } catch (x) { return null; } }).find((x) => x && x.name === "MerkezLaunch");
  console.log("  LAUNCH " + t.hash + "  token " + e.args.token + "  vekil " + e.args.vekil + "  kurucu tokeni " + (Number(e.args.kurucuToken / 10n ** 12n) / 1e6).toLocaleString("en-US"));
  fs.writeFileSync(path.join(KOK, "dagitim-test-launch.json"), JSON.stringify({ zaman: new Date().toISOString(), tx: t.hash, token: e.args.token, vekil: e.args.vekil,
    sepet: SEPET.map((s, i) => ({ ad: s.ad, zincir: s.zincir, varlik: s.varlik, tip: s.tip || null, teklif: teklif[i].toString() })) }, null, 1));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
