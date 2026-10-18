"use strict";
/* merkez-launch-teklif.js — a launch from Base / BNB into MerkezKapi through relay.link, priced and
 * simulated by relay (quote only, nothing sent). relay simulates the destination calls: the real
 * PulseLaunchpad5 launch, the basket to the Defter and the twins on Base, Arbitrum and BNB. */
const fs = require("fs");
const { Interface, zeroPadValue, solidityPacked } = require("ethers");
const KOK = "C:/arc-launchpad";
const KAPI = JSON.parse(fs.readFileSync(KOK + "/dagitim-sepet.json", "utf8")).merkez.MerkezKapi;
const K = new Interface(JSON.parse(fs.readFileSync(KOK + "/build/MerkezKapi.json", "utf8")).abi);
const E = new Interface(["function approve(address,uint256) returns (bool)"]);
const sec = (g) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, g]);
const KURUCU = "0x000000000000000000000000000000000000dEaD";
const istek = {
  ad: "Relay Prova", sembol: "RPROVA",
  sepet: [{ zincir: 26, varlik: zeroPadValue("0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE", 32), dolar: 10_000_000n },
          { zincir: 6, varlik: zeroPadValue("0x4200000000000000000000000000000000000006", 32), dolar: 10_000_000n }],
  teklif: [600_000n * 10n ** 18n, 4n * 10n ** 15n], vergiPpm: 20_000n, alim: 100_000_000n,
  kurucu: zeroPadValue(KURUCU, 32), kurucuZincir: 6, kurucuEid: 30184,
  ikizler: [30184, 30110, 30102], ikizSecenek: sec(3_500_000n), ikizUcret: 12n * 10n ** 18n,
  gonderSecenek: sec(100_000n), iade: KURUCU,
};
const toplam = 120_000_000n, deger = 15n * 10n ** 18n;
const txs = [
  { to: "0x3600000000000000000000000000000000000000", data: E.encodeFunctionData("approve", [KAPI, toplam]), value: "0" },
  { to: KAPI, data: K.encodeFunctionData("launch", [istek]), value: deger.toString() },
];
(async () => {
  for (const [ad, id, para] of [["Base ETH", 8453, "0x0000000000000000000000000000000000000000"], ["BNB", 56, "0x0000000000000000000000000000000000000000"]]) {
    const r = await fetch("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      user: KURUCU, recipient: KURUCU, originChainId: id, destinationChainId: 5042, originCurrency: para,
      destinationCurrency: "0x0000000000000000000000000000000000000000", amount: (toplam * 10n ** 12n + deger).toString(), tradeType: "EXACT_OUTPUT",
      txsGasLimit: 9_000_000, txs }) }).then((x) => x.json());
    if (!r.details) { console.log(ad, "RELAY:", JSON.stringify(r).slice(0, 300)); continue; }
    const d = r.details;
    console.log(ad.padEnd(9), "launch (100 $ alim + 20 $ sepet + ~15 $ ikiz/LZ) giren", Number(d.currencyIn.amountFormatted).toPrecision(5), d.currencyIn.currency.symbol, "=", "$" + Number(d.currencyIn.amountUsd).toFixed(2), " relay $" + Number(r.fees.relayer.amountUsd).toFixed(3), " ~" + d.timeEstimate + " sn  adimlar", r.steps.map((s) => s.id).join(","));
  }
})();
