"use strict";
/* ===========================================================================
 * gaz-sui.js — SUI for the Sui deployer, from Base USDC through LI.FI
 *
 *   node scripts/gaz-sui.js <usdc> [--uygula]
 *
 * relay.link does not route to Sui or Aptos (its chain list, 14 Oct 2026).
 * LI.FI does, through Mayan's CCTP route: Base USDC in, native SUI out.
 * Measured: 6 USDC -> 5.02 SUI, ~0.88 $ fee. The Base USDC came from Arc
 * through relay. Same owner end to end; only the chain changes.
 * =========================================================================== */
const fs = require("fs");
const { JsonRpcProvider, Wallet, Contract } = require("ethers");

const SUI_ADRES = "0x9d547e639e4dad7b98f1ec9a6e8d684f42dd289fb0875f08a2ed8fc77fe7f078";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SUI_COIN = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const UYGULA = process.argv.includes("--uygula");
const miktar = BigInt(Math.round(Number(process.argv[2] || "7") * 1e6));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const w = new Wallet(pk, new JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true }));
  const url = "https://li.quest/v1/quote?fromChain=8453&toChain=9270000000000000&fromToken=" + BASE_USDC +
    "&toToken=" + encodeURIComponent(SUI_COIN) + "&fromAddress=" + w.address + "&toAddress=" + SUI_ADRES + "&fromAmount=" + miktar;
  const q = await fetch(url).then((x) => x.json());
  if (!q.transactionRequest) { console.log("TEKLIF YOK: " + JSON.stringify(q).slice(0, 300)); process.exit(1); }
  console.log("arac " + q.tool + "  giren " + Number(miktar) / 1e6 + " USDC  cikan " + Number(q.estimate.toAmount) / 1e9 + " SUI ($" + q.estimate.toAmountUSD + ")");
  if (!UYGULA) return;
  const usdc = new Contract(BASE_USDC, ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], w);
  const harcayan = q.estimate.approvalAddress;
  if ((await usdc.allowance(w.address, harcayan)) < miktar) {
    const t = await usdc.approve(harcayan, miktar);
    await t.wait();
    console.log("onay " + t.hash);
  }
  const tr = q.transactionRequest;
  const t = await w.sendTransaction({ to: tr.to, data: tr.data, value: BigInt(tr.value || 0), gasLimit: tr.gasLimit ? BigInt(tr.gasLimit) : undefined });
  await t.wait();
  console.log("gonderildi " + t.hash);
  for (let i = 0; i < 120; i++) {
    await bekle(10000);
    const s = await fetch("https://li.quest/v1/status?txHash=" + t.hash + "&fromChain=8453&toChain=9270000000000000").then((x) => x.json()).catch(() => ({}));
    if (s.status === "DONE") { console.log("vardi: " + (s.substatus || "")); break; }
    if (s.status === "FAILED") { console.log("BASARISIZ: " + JSON.stringify(s).slice(0, 200)); break; }
  }
  const b = await fetch("https://graphql.mainnet.sui.io/graphql", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ address(address: "' + SUI_ADRES + '") { balance(coinType: "0x2::sui::SUI") { totalBalance } } }' }) }).then((x) => x.json());
  console.log("Sui bakiyesi " + Number(b.data.address.balance.totalBalance) / 1e9 + " SUI");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
