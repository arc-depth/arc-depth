"use strict";
/* ===========================================================================
 * merkez-launch-her-zincir.js — a launch from every chain, simulated by relay
 *
 *   node scripts/merkez-launch-her-zincir.js
 *
 * Exactly what the site sends (docs/js/gorunum/merkez.js): one signature on
 * the founder's chain in its gas token; relay brings Arc USDC and calls
 * MerkezKapi.launch with twins on all eight other EVM chains and the
 * founder's tokens sent to the founder's own chain. relay simulates those
 * Arc calls against real state before it quotes, so a quote means the
 * launch, the basket, the twins and the founder's delivery all ran.
 * Solana is included to show what happens there today. Nothing is sent.
 * =========================================================================== */
const fs = require("fs");
const { Interface, JsonRpcProvider, Contract, zeroPadValue, solidityPacked } = require("ethers");
const KOK = "C:/arc-launchpad";
const KAPI = JSON.parse(fs.readFileSync(KOK + "/dagitim-sepet.json", "utf8")).merkez.MerkezKapi;
const K = new Interface(JSON.parse(fs.readFileSync(KOK + "/build/MerkezKapi.json", "utf8")).abi);
const E = new Interface(["function approve(address,uint256) returns (bool)"]);
const sec = (g) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, g]);
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const FTHM_ARC = "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE";
const IKIZ_EID = [30416, 30184, 30110, 30101, 30102, 30106, 30390, 30367];
const ODEME = new Set([26, 6, 3, 1, 15, 19, 17]);     // where the Arc Haberci can pay a sale
const ORNEK = "0x000000000000000000000000000000000000dEaD";
const SIFIR = "0x0000000000000000000000000000000000000000";
const ZINCIR = [
  ["Robinhood", 4663, 30416, 35], ["Base", 8453, 30184, 6], ["Arbitrum", 42161, 30110, 3], ["Ethereum", 1, 30101, 0],
  ["BNB", 56, 30102, 17], ["Avalanche", 43114, 30106, 1], ["Monad", 143, 30390, 15], ["HyperEVM", 999, 30367, 19],
  ["Solana", 792703809, 30168, 5, "11111111111111111111111111111111", "5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh"],
];

(async () => {
  const arc = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });
  const ikizSec = sec(3_500_000n);
  const ikizUcret = ((await new Contract(YAYICI, ["function ucret(address,uint32[],bytes) view returns (uint256)"], arc).ucret(FTHM_ARC, IKIZ_EID, ikizSec)) * 13n) / 10n;
  const deger = ikizUcret + 2n * 10n ** 18n;
  console.log("LAUNCH HER ZINCIRDEN  kapi " + KAPI + "  ikiz ucreti (8 zincir, x1.3) " + (Number(ikizUcret) / 1e18).toFixed(3) + " USDC  (yalniz teklif)");
  let gecti = 0, kaldi = 0;
  for (const [ad, id, eid, domain, para = SIFIR, kullanici = ORNEK] of ZINCIR) {
    const istek = {
      ad: "Her Zincir Prova", sembol: "HZP",
      sepet: [{ zincir: 26, varlik: zeroPadValue(FTHM_ARC, 32), dolar: 10_000_000n },
              { zincir: 6, varlik: zeroPadValue("0x4200000000000000000000000000000000000006", 32), dolar: 10_000_000n }],
      teklif: [600_000n * 10n ** 18n, 4n * 10n ** 15n], vergiPpm: 20_000n, alim: 100_000_000n,
      kurucu: zeroPadValue(ORNEK, 32), kurucuZincir: ODEME.has(domain) ? domain : 26, kurucuEid: eid,
      ikizler: IKIZ_EID, ikizSecenek: ikizSec, ikizUcret, gonderSecenek: sec(100_000n), iade: ORNEK,
    };
    const toplam = 120_000_000n;
    const txs = [
      { to: "0x3600000000000000000000000000000000000000", data: E.encodeFunctionData("approve", [KAPI, toplam]), value: "0" },
      { to: KAPI, data: K.encodeFunctionData("launch", [istek]), value: deger.toString() },
    ];
    const r = await fetch("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      user: kullanici, recipient: ORNEK, originChainId: id, destinationChainId: 5042, originCurrency: para,
      destinationCurrency: SIFIR, amount: (toplam * 10n ** 12n + deger).toString(), tradeType: "EXACT_OUTPUT", txsGasLimit: 12_000_000, txs }) })
      .then((x) => x.json()).catch((e) => ({ message: e.message }));
    const odeme = ODEME.has(domain) ? "satis burada odenir" : "satis Arc'ta odenir";
    if (!r.details) { kaldi++; console.log("  HATA " + ad.padEnd(10) + (r.errorCode || "") + " " + String(r.errorData || r.message || "").slice(0, 90)); continue; }
    gecti++;
    const d = r.details;
    console.log("  ok   " + ad.padEnd(10) + Number(d.currencyIn.amountFormatted).toPrecision(5) + " " + d.currencyIn.currency.symbol + " = $" + Number(d.currencyIn.amountUsd).toFixed(2) +
      "  relay $" + Number(r.fees.relayer.amountUsd).toFixed(2) + "  ~" + d.timeEstimate + " sn  (" + odeme + ")");
  }
  console.log("\n" + gecti + " zincirden launch simule edildi, " + kaldi + " zincirde olmadi");
})();
