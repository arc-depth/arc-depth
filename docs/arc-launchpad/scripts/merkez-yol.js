"use strict";
/* ===========================================================================
 * merkez-yol.js — the routes into the one Arc pool, priced (quotes only)
 *
 *   node scripts/merkez-yol.js
 *
 * What the site will send, built here and priced by relay.link without
 * sending anything: a buy paid with each chain's own gas token (one
 * signature on that chain; relay brings Arc USDC and, in the same order,
 * calls MerkezKapi.al, which delivers the token back to the buyer's chain),
 * and a launch paid from Base (the same with MerkezKapi.launch).
 * A sale goes the other way and needs no relay to start: the twin is sent
 * from the seller's chain to the token's Arc adapter with a compose for the
 * gate (OFT send, the seller's gas); the gate pays USDC on the seller's
 * chain, which the site then swaps there into whatever the seller wants.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface, zeroPadValue, AbiCoder, solidityPacked } = require("ethers");

const KOK = path.join(__dirname, "..");
const KAPI = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sepet.json"), "utf8")).merkez.MerkezKapi;
const USDC_ARC = "0x3600000000000000000000000000000000000000";
const SIFIR = "0x0000000000000000000000000000000000000000";
const SOL_NATIVE = "11111111111111111111111111111111";
const ORNEK = "0x000000000000000000000000000000000000dEaD";   // a stand-in user; nothing is signed
const K = require("./merkez-abi-v1");   // the deployed gate, not build/ (which is the next version)
const E = new Interface(["function approve(address,uint256) returns (bool)"]);
const sec = (gaz) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, gaz]);

const ZINCIR = [
  { ad: "Base", id: 8453, para: SIFIR, sembol: "ETH", eid: 30184 },
  { ad: "Arbitrum", id: 42161, para: SIFIR, sembol: "ETH", eid: 30110 },
  { ad: "BNB", id: 56, para: SIFIR, sembol: "BNB", eid: 30102 },
  { ad: "Avalanche", id: 43114, para: SIFIR, sembol: "AVAX", eid: 30106 },
  { ad: "Ethereum", id: 1, para: SIFIR, sembol: "ETH", eid: 30101 },
  { ad: "Solana", id: 792703809, para: SOL_NATIVE, sembol: "SOL", eid: 30168, kullanici: "5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh" },
];

async function teklif(govde) {
  const r = await fetch("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
  if (!r.details) throw new Error(JSON.stringify(r).slice(0, 200));
  return r;
}

(async () => {
  console.log("MERKEZ YOL  kapi " + KAPI + "  (yalniz teklif, gonderim yok)");
  /* a $20 buy with each chain's gas token, the token delivered back there */
  const usdc = 20_000_000n, lzDeger = 2n * 10n ** 18n;      // LayerZero fee in Arc native USDC, generous; excess refunded
  const ornekToken = "0x44DDc45C7a3a8f2A4C2433c19e31b05261778A23"; // shape only: the call is built, relay prices the route
  for (const z of ZINCIR) {
    const txs = [
      { to: USDC_ARC, data: E.encodeFunctionData("approve", [KAPI, usdc]), value: "0" },
      { to: KAPI, data: K.encodeFunctionData("al", [ornekToken, usdc, 1n, z.eid, zeroPadValue(ORNEK, 32), sec(100_000n), ORNEK]), value: lzDeger.toString() },
    ];
    try {
      const q = await teklif({ user: z.kullanici || ORNEK, recipient: ORNEK, originChainId: z.id, destinationChainId: 5042,
        originCurrency: z.para, destinationCurrency: SIFIR, amount: ((usdc + 2_000_000n) * 10n ** 12n).toString(), tradeType: "EXACT_OUTPUT",
        txsGasLimit: 1_500_000, txs });
      const d = q.details;
      console.log("  " + z.ad.padEnd(10) + "22 $ Arc'ta (20 $ alim + LZ), giren " + Number(d.currencyIn.amountFormatted).toPrecision(5) + " " + d.currencyIn.currency.symbol +
        "  relay $" + Number(q.fees.relayer.amountUsd).toFixed(3) + "  ~" + d.timeEstimate + " sn  adimlar " + q.steps.map((s) => s.id).join(","));
    } catch (e) { console.log("  " + z.ad.padEnd(10) + "RELAY: " + e.message.slice(0, 160)); }
  }
})();
