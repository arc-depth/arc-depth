"use strict";
/* ===========================================================================
 * merkez-v2-teklif.js — what a founder pays, item by item (nothing is sent)
 *
 *   node scripts/merkez-v2-teklif.js [zincir] [--uzak]
 *
 * Builds the v2 launch exactly as the site does (docs/js/gorunum/merkez.js):
 * $100 first buy, $20 basket in 5 lines on 5 chains, twins on the 8 EVM
 * chains (+ Solana/Sui/Aptos with --uzak), the founder's tokens to their
 * chain. Reads each LayerZero fee live, then asks relay.link for the route;
 * relay simulates the whole Arc side (the launch itself) before it quotes.
 * Prints the bill the site shows before the founder pays.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Contract, Interface, AbiCoder, zeroPadValue, solidityPacked } = require("ethers");

const KOK = path.join(__dirname, "..");
const V2 = JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "sepet-v2.json"), "utf8"));
const ZINCIR = { robinhood: [4663, 30416, "ETH"], base: [8453, 30184, "ETH"], arbitrum: [42161, 30110, "ETH"], bsc: [56, 30102, "BNB"], arc: [5042, 0, "USDC"] };
const ad = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "robinhood";
const UZAK = process.argv.includes("--uzak");
const [chainId, kurucuEid] = ZINCIR[ad];
const ORNEK = "0x000000000000000000000000000000000000dEaD";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const FTHM = "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const sec = (g) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, g]);
const b32 = (a) => zeroPadValue(a, 32);
const arc = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });
const usd = (x) => "$" + (Number(x) / 1e18).toFixed(2);

(async () => {
  /* five lines on five chains: $4 each (real tokens; the starting quotes are rough, they only seed the auctions) */
  const sepet = [
    [26, b32(FTHM), 4_000_000n], [6, b32("0x4200000000000000000000000000000000000006"), 4_000_000n],
    [17, b32("0xbb4CdB9CBd36B01bD8cBaEBF46B375b0F0dC4b9F"), 4_000_000n], [1, b32("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"), 4_000_000n],
    [3, b32("0x912CE59144191C1204E64559FE8253a0e49E6548"), 4_000_000n]];
  const teklif = [260_000n * 10n ** 18n, 12n * 10n ** 14n, 6n * 10n ** 15n, 18n * 10n ** 16n, 13n * 10n ** 18n];
  const alim = 100_000_000n, teminat = 20_000_000n, toplam = alim + teminat;
  const evm = [30416, 30184, 30110, 30101, 30102, 30106, 30390, 30367];
  const ikizSec = sec(3_500_000n);
  const evmGercek = await new Contract(YAYICI, ["function ucret(address,uint32[],bytes) view returns (uint256)"], arc).ucret(FTHM, evm, ikizSec);
  const hub = new Contract(V2.hub, ["function ucret(uint32,bytes) view returns (uint256)"], arc);
  const ornek = AbiCoder.defaultAbiCoder().encode(["uint8", "address", "string", "string"], [1, FTHM, "Teklif Prova", "TKLF"]);
  const uzak = [];
  let uzakGercek = 0n;
  if (UZAK) for (const e of [30168, 30378, 30108]) { const u = await hub.ucret(e, ornek).catch(() => null); if (u != null) { uzak.push(e); uzakGercek += u; } }
  let teslimGercek = 0n;
  if (kurucuEid) {
    const a = new Contract("0xe204C0762F749183530a945B161b54D8454d80Be", ["function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))"], arc);
    [teslimGercek] = await a.quoteSend([kurucuEid, b32(ORNEK), 10n ** 24n, 10n ** 24n, sec(100_000n), "0x", "0x"], false);
  }
  const pay = (x) => (x * 11n) / 10n;
  const deger = pay(evmGercek) + pay(uzakGercek) + pay(teslimGercek);
  /* the founder is paid on Arc here (a relay deposit address for Robinhood in the site: same shape) */
  const K = new Interface(["function launch((string,string,(uint32,bytes32,uint256)[],uint256[],uint256,uint256,bytes32,uint32,uint32,uint32[],bytes,uint256,bytes,address,string[],uint32[],uint256)) payable returns (address)"]);
  const istek = ["Teklif Prova", "TKLF", sepet, teklif, 20_000n, alim, b32(ORNEK), 26, kurucuEid, evm, ikizSec, pay(evmGercek), sec(100_000n), ORNEK,
    ["", "", "", "", ""], uzak, pay(uzakGercek)];
  const txs = [
    { to: ARC_USDC, data: new Interface(["function approve(address,uint256) returns (bool)"]).encodeFunctionData("approve", [V2.kapi, toplam]), value: "0" },
    { to: V2.kapi, data: K.encodeFunctionData("launch", [istek]), value: deger.toString() }];
  console.log("LAUNCH FATURASI  kurucu zinciri " + ad + (UZAK ? "  (+ Solana/Sui/Aptos ikizleri)" : "") + "  (canli ucretler, gonderim yok)");
  console.log("  ilk alim                      $100.00");
  console.log("  teminat (5 satir x $4)        $20.00");
  console.log("  8 EVM ikizi (LayerZero)       " + usd(evmGercek));
  if (UZAK) console.log("  Solana/Sui/Aptos ikizleri     " + usd(uzakGercek) + "  (" + uzak.length + " zincir)");
  console.log("  kurucu tokenleri -> " + ad.padEnd(10) + " " + usd(teslimGercek));
  console.log("  %10 pay (kullanilmazsa Arc'ta iade) " + usd(deger - evmGercek - uzakGercek - teslimGercek));
  const net = Number(toplam) / 1e6 + Number(deger) / 1e18;
  console.log("  Arc'a varmasi gereken toplam  $" + net.toFixed(2));
  if (chainId === 5042) return;
  const q = await fetch("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    user: ORNEK, recipient: ORNEK, originChainId: chainId, destinationChainId: 5042, originCurrency: "0x0000000000000000000000000000000000000000",
    destinationCurrency: "0x0000000000000000000000000000000000000000", amount: (toplam * 10n ** 12n + deger).toString(), tradeType: "EXACT_OUTPUT",
    txsGasLimit: 9_000_000, txs }) }).then((x) => x.json());
  if (!q.details) { console.log("  RELAY HATA " + (q.errorCode || "") + " " + String(q.message || "").slice(0, 200)); process.exitCode = 1; return; }
  const odenen = Number(q.details.currencyIn.amountUsd);
  console.log("  relay (Arc tarafini simule etti, launch gecti): " + Number(q.details.currencyIn.amountFormatted).toPrecision(5) + " " + q.details.currencyIn.currency.symbol +
    " = $" + odenen.toFixed(2) + "  (relay'in kendi payi ~$" + Math.max(0, odenen - net).toFixed(2) + ")");
  console.log("  KURUCUNUN ODEYECEGI: ~$" + odenen.toFixed(2));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exitCode = 1; });
