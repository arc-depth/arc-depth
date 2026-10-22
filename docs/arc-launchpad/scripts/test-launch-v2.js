"use strict";
/* ===========================================================================
 * test-launch-v2.js — the joint test launch on the second generation
 *
 *   node scripts/test-launch-v2.js            dry: live quotes, the bill, and the
 *                                             launch simulated on Arc mainnet state
 *                                             (eth_simulateV1, the deployer's balance
 *                                             raised in the simulation only)
 *   node scripts/test-launch-v2.js --uygula   approve + launch (user command only)
 *
 * A real token, named as a test, launched on Arc through the v2 MerkezKapi
 * by the deployer (founder of record, paid on Arc): $100 first buy and a
 * $20 basket over five chains so each delivery path runs with real money —
 * FTHM on Arc (local), WETH on Base (LayerZero + Circle forwarding), SOL on
 * Solana, SUI on Sui, APT on Aptos ($4 each) — and twins on seven EVM
 * chains (Ethereum and Solana / Sui / Aptos twins on demand, "Move from Arc").
 * Each line's starting quote is units per its dollars at today's price (FTHM
 * from the Arc pool, the rest from CoinGecko); it only seeds the auctions.
 * Record: dagitim-test-launch-v2.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, Interface, AbiCoder, zeroPadValue, keccak256, toUtf8Bytes, toBeHex, decodeBase58,
  solidityPacked } = require("ethers");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const V2 = JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "sepet-v2.json"), "utf8"));
const USDC = "0x3600000000000000000000000000000000000000";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const FTHM = "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE";
const ARC_PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
/* the EVM twins except Ethereum (its twin alone was ~$22 of LayerZero fee on 20 Oct; on demand later) */
const IKIZ_EID = [30416, 30184, 30110, 30102, 30106, 30390, 30367];
const sec = (g) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, g]);
const coder = AbiCoder.defaultAbiCoder();
const SATIR = 4_000_000n, ALIM = 100_000_000n;
const SUI_TIP = "0".repeat(63) + "2::sui::SUI";
const SEPET = [
  { ad: "FTHM on Arc", zincir: 26, varlik: zeroPadValue(FTHM, 32), dec: 18, fiyat: "fthm" },
  { ad: "WETH on Base", zincir: 6, varlik: zeroPadValue("0x4200000000000000000000000000000000000006", 32), dec: 18, fiyat: "ethereum" },
  { ad: "SOL on Solana", zincir: 5, varlik: toBeHex(decodeBase58("So11111111111111111111111111111111111111112"), 32), dec: 9, fiyat: "solana" },
  { ad: "SUI on Sui", zincir: 8, varlik: keccak256(toUtf8Bytes(SUI_TIP)), dec: 9, fiyat: "sui", tip: SUI_TIP },
  { ad: "APT on Aptos", zincir: 9, varlik: zeroPadValue("0x0a", 32), dec: 8, fiyat: "aptos" },
];
const K = new Interface(["function launch((string,string,(uint32,bytes32,uint256)[],uint256[],uint256,uint256,bytes32,uint32,uint32,uint32[],bytes,uint256,bytes,address,string[],uint32[],uint256)) payable returns (address)",
  "event MerkezLaunch(address indexed token, address vekil, bytes32 kurucu, uint32 kurucuZincir, uint256 kurucuToken)"]);
const E = new Interface(["function approve(address,uint256) returns (bool)"]);

async function fthmBirim(arc) {
  const id = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8")).havuzId;
  const w = await new Contract(ARC_PM, ["function extsload(bytes32) view returns (bytes32)"], arc).extsload(keccak256(coder.encode(["bytes32", "uint256"], [id, 6])));
  const sqrt = BigInt(w) & ((1n << 160n) - 1n);
  return (sqrt * sqrt) >> 192n;   // FTHM raw per USDC raw
}

(async () => {
  const arc = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });
  const w = new Wallet(fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim(), arc);
  const cg = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana,sui,aptos&vs_currencies=usd").then((x) => x.json());
  const fthmPerUsdc = await fthmBirim(arc);
  const teklif = SEPET.map((s) => s.fiyat === "fthm" ? fthmPerUsdc * SATIR : BigInt(Math.floor((Number(SATIR) / 1e6 / cg[s.fiyat].usd) * 10 ** s.dec)));
  /* creating a twin measured 4.54–4.78M gas on 22 Oct (Monad the most); 3.5M ran out on every chain */
  const ikizSec = sec(6_300_000n);
  const ikizGercek = await new Contract(YAYICI, ["function ucret(address,uint32[],bytes) view returns (uint256)"], arc).ucret(FTHM, IKIZ_EID, ikizSec);
  const ikizUcret = (ikizGercek * 11n) / 10n;     // as the site: +10%, the unused part comes back on Arc
  const sepet = SEPET.map((s) => [s.zincir, s.varlik, SATIR]);
  const tipler = SEPET.map((s) => s.tip || "");
  const toplam = ALIM + SATIR * BigInt(SEPET.length);
  const istek = ["ARC PULSE Test Two", "PTEST2", sepet, teklif, 20_000n, ALIM, zeroPadValue(w.address, 32), 26, 0, IKIZ_EID, ikizSec, ikizUcret,
    sec(100_000n), w.address, tipler, [], 0n];
  const bakiye = await arc.getBalance(w.address);
  const gerek = toplam * 10n ** 12n + ikizUcret;
  console.log("TEST LAUNCH v2  " + (UYGULA ? "UYGULA" : "KURU") + "  kapi " + V2.kapi + "  kurucu " + w.address + " (Arc)");
  console.log("  ARC PULSE Test Two (PTEST2)  ilk alim $100, sepet $20, vergi %2, EVM ikizleri 7 zincir (Ethereum talep uzerine)");
  SEPET.forEach((s, i) => console.log("    " + s.ad.padEnd(15) + "$4  baslangic teklifi " + (Number(teklif[i]) / 10 ** s.dec).toPrecision(6) + " birim"));
  console.log("  gereken " + (Number(gerek) / 1e18).toFixed(2) + " USDC (ikiz LZ " + (Number(ikizGercek) / 1e18).toFixed(2) + " + %10 pay, artani iade)  bakiye " +
    (Number(bakiye) / 1e18).toFixed(2) + (bakiye < gerek ? "  EKSIK " + (Number(gerek - bakiye) / 1e18).toFixed(2) + " USDC" : "  yeterli"));

  /* the two transactions on Arc mainnet state, one per block (30M gas each); the balance raised only here */
  const txs = [{ to: USDC, data: E.encodeFunctionData("approve", [V2.kapi, toplam]) },
    { to: V2.kapi, data: K.encodeFunctionData("launch", [istek]), value: "0x" + ikizUcret.toString(16) }];
  const sim = await arc.send("eth_simulateV1", [{ blockStateCalls: txs.map((t, i) => ({
    ...(i === 0 ? { stateOverrides: { [w.address]: { balance: "0x" + (gerek + 10n ** 19n).toString(16) } } } : {}),
    calls: [{ from: w.address, gas: "0x" + (30_000_000).toString(16), ...t }] })), validation: false }, "latest"]);
  const son = sim[1].calls[0];
  if (son.status !== "0x1") { console.log("  SIMULASYON GERI DONDU: " + JSON.stringify(son.error || son.returnData).slice(0, 300)); process.exitCode = 1; return; }
  const token = coder.decode(["address"], son.returnData)[0];
  console.log("  simulasyon tamam: token " + token + ", gaz " + BigInt(son.gasUsed) + ", " + son.logs.length + " olay");
  if (!UYGULA) { console.log(bakiye < gerek ? "  (kuru) once dagiticiya " + (Number(gerek - bakiye) / 1e18 + 1).toFixed(0) + " USDC eklenmeli" : "  (kuru) --uygula ile gonderilir"); return; }

  if (bakiye < gerek) throw new Error("bakiye yetmiyor");
  const usdc = new Contract(USDC, ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"], w);
  if ((await usdc.allowance(w.address, V2.kapi)) < toplam) { const t = await usdc.approve(V2.kapi, toplam); await t.wait(); console.log("  onay " + t.hash); }
  const gaz = (BigInt(son.gasUsed) * 13n) / 10n;
  const t = await w.sendTransaction({ to: V2.kapi, data: txs[1].data, value: ikizUcret, gasLimit: gaz < 29_000_000n ? gaz : 29_000_000n });
  const m = await t.wait();
  if (m.status !== 1) throw new Error("launch geri dondu " + t.hash);
  const e = m.logs.map((l) => { try { return K.parseLog(l); } catch (x) { return null; } }).find((x) => x && x.name === "MerkezLaunch");
  console.log("  LAUNCH " + t.hash + "  token " + (e ? e.args.token : token));
  fs.writeFileSync(path.join(KOK, "dagitim-test-launch-v2.json"), JSON.stringify({ zaman: new Date().toISOString(), tx: t.hash, token: e ? e.args.token : token,
    vekil: e ? e.args.vekil : null, sepet: SEPET.map((s, i) => ({ ad: s.ad, zincir: s.zincir, varlik: s.varlik, tip: s.tip || null, teklif: teklif[i].toString() })) }, null, 1));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
