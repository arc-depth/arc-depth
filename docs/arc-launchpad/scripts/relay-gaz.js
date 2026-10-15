"use strict";
/* ===========================================================================
 * relay-gaz.js — move native gas between two of our chains through relay.link
 *
 *   node scripts/relay-gaz.js <from> <to> <amount in from-native> [--uygula]
 *   e.g. node scripts/relay-gaz.js arc ethereum 12 --uygula
 *
 * gaz-dagit.js tops every chain up from Robinhood ETH on a schedule of
 * targets; this is the single hop for when one deploy runs short. Arc's
 * native gas is USDC, so "arc ethereum 12" spends 12 USDC of the vault's
 * Arc balance for ETH on Ethereum. Same wallet both ends.
 * =========================================================================== */
const fs = require("fs");
const { JsonRpcProvider, Wallet, parseEther } = require("ethers");
const { EVM } = require("./zincirler");

const RELAY = "https://api.relay.link";
const SIFIR = "0x0000000000000000000000000000000000000000";
const [kaynakAd, hedefAd, miktar] = process.argv.slice(2);
const UYGULA = process.argv.includes("--uygula");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const k = EVM[kaynakAd], h = EVM[hedefAd];
  if (!k || !h || !miktar) throw new Error("kullanim: relay-gaz.js <kaynak> <hedef> <miktar> [--uygula]");
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const w = new Wallet(pk, new JsonRpcProvider(k.rpc, k.chainId, { staticNetwork: true }));
  const govde = { user: w.address, recipient: w.address, originChainId: k.chainId, destinationChainId: h.chainId,
    originCurrency: SIFIR, destinationCurrency: SIFIR, amount: parseEther(miktar).toString(), tradeType: "EXACT_INPUT" };
  const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
  if (!q.steps) throw new Error("teklif yok: " + JSON.stringify(q).slice(0, 200));
  const c = q.details.currencyOut;
  console.log("RELAY  " + k.ad + " " + miktar + " -> " + h.ad + " " + (Number(c.amount) / 10 ** c.currency.decimals).toPrecision(5) + " " + c.currency.symbol + " ($" + Number(c.amountUsd).toFixed(2) + ")" + (UYGULA ? "" : "  (kuru)"));
  if (!UYGULA) return;
  for (const adim of q.steps) for (const it of adim.items || []) {
    if (adim.kind !== "transaction") continue;
    const d = it.data;
    const tx = await w.sendTransaction({ to: d.to, data: d.data, value: BigInt(d.value || 0), ...(d.gas ? { gasLimit: BigInt(d.gas) } : {}) });
    let m = null; while (!m) { await bekle(1500); m = await w.provider.getTransactionReceipt(tx.hash).catch(() => null); }
    console.log("  gonderildi " + tx.hash + "  durum " + m.status);
    if (it.check && it.check.endpoint) for (let i = 0; i < 80; i++) {
      await bekle(3000);
      const s = await fetch(RELAY + it.check.endpoint).then((x) => x.json()).catch(() => ({}));
      if (s.status === "success") { console.log("  vardi"); break; }
      if (s.status === "failure" || s.status === "refund") { console.log("  BASARISIZ: " + s.status); break; }
    }
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
