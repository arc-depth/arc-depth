"use strict";
/* ===========================================================================
 * bekci-fonla.js — a little gas for the keeper's own wallet on every chain
 *
 *   node scripts/bekci-fonla.js            dry: the routes and what arrives
 *   node scripts/bekci-fonla.js --uygula   send
 *
 * From the deployer's Arc USDC: a plain transfer on Arc, and one relay.link
 * order per other chain with the keeper (BEKCI_PRIVATE_KEY's address) as the
 * recipient, in that chain's gas token. The keeper only pays gas for
 * deliveries (Haberci.teslim) and, later, auction fills; it never holds the
 * basket's dollars. Robinhood is left out until Circle opens CCTP into it.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, parseEther, parseUnits } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const RELAY = "https://api.relay.link";
const SIFIR = "0x0000000000000000000000000000000000000000";
const UYGULA = process.argv.includes("--uygula");
const SECILEN = process.argv.slice(2).filter((a) => !a.startsWith("--"));   // only these chains (a stopped run resumes)
const ARC_PAY = "3";                                       // USDC kept on Arc
const PAY = { base: "1", arbitrum: "1", avalanche: "1", monad: "0.5", hyperevm: "1", bsc: "1", ethereum: "2" };   // USDC each
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
/* --sermaye: working USDC for auction fills (bekci-doldur.js), returned with every fill.
   Arc native USDC directly; Base from the deployer's Base USDC; others through relay into that chain's USDC. */
const SERMAYE = { arc: "6", base: "5", arbitrum: "5" };
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" };

(async () => {
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const bk = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(/^BEKCI_PRIVATE_KEY\s*=\s*(0x[0-9a-fA-F]{64})/m)[1];
  const bekci = new Wallet(bk).address;
  const w = new Wallet(pk, new JsonRpcProvider(EVM.arc.rpc, EVM.arc.chainId, { staticNetwork: true }));
  if (process.argv.includes("--sermaye")) return sermaye(w, bekci);
  console.log("BEKCI FONLA  " + (UYGULA ? "UYGULA" : "KURU") + "  bekci " + bekci + "  toplam " +
    (Number(ARC_PAY) + Object.values(PAY).reduce((a, b) => a + Number(b), 0)) + " USDC");
  if (SECILEN.length && !SECILEN.includes("arc")) { /* Arc skipped */ }
  else if (UYGULA) {
    const t = await w.sendTransaction({ to: bekci, value: parseEther(ARC_PAY) });
    await t.wait();
    console.log("  Arc       " + ARC_PAY + " USDC  " + t.hash);
  } else console.log("  (kuru) Arc       " + ARC_PAY + " USDC dogrudan");
  for (const [ad, miktar] of Object.entries(PAY)) {
    if (SECILEN.length && !SECILEN.includes(ad)) continue;
    const h = EVM[ad];
    const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      user: w.address, recipient: bekci, originChainId: EVM.arc.chainId, destinationChainId: h.chainId,
      originCurrency: SIFIR, destinationCurrency: SIFIR, amount: parseEther(miktar).toString(), tradeType: "EXACT_INPUT" }) }).then((x) => x.json());
    if (!q.steps) { console.log("  HATA " + h.ad + " teklif yok: " + JSON.stringify(q).slice(0, 120)); continue; }
    const c = q.details.currencyOut;
    const gelen = (Number(c.amount) / 10 ** c.currency.decimals).toPrecision(4) + " " + c.currency.symbol + " ($" + Number(c.amountUsd).toFixed(2) + ")";
    if (!UYGULA) { console.log("  (kuru) " + h.ad.padEnd(9) + miktar + " USDC -> " + gelen); continue; }
    for (const adim of q.steps) for (const it of adim.items || []) {
      if (adim.kind !== "transaction") continue;
      const d = it.data;
      const tx = await w.sendTransaction({ to: d.to, data: d.data, value: BigInt(d.value || 0), ...(d.gas ? { gasLimit: BigInt(d.gas) } : {}) });
      for (let i = 0; i < 40; i++) { const m = await w.provider.getTransactionReceipt(tx.hash).catch(() => null); if (m) break; await bekle(1500); }   // an RPC hiccup must not stop the run
      let durum = "gonderildi";
      if (it.check && it.check.endpoint) for (let i = 0; i < 60; i++) {
        await bekle(3000);
        const s = await fetch(RELAY + it.check.endpoint).then((x) => x.json()).catch(() => ({}));
        if (["success", "failure", "refund"].includes(s.status)) { durum = s.status; break; }
      }
      console.log("  " + h.ad.padEnd(9) + miktar + " USDC -> " + gelen + "  " + durum + "  " + tx.hash);
    }
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });

async function sermaye(w, bekci) {
  const { Contract } = require("ethers");
  console.log("BEKCI SERMAYE  " + (UYGULA ? "UYGULA" : "KURU") + "  bekci " + bekci + "  " + JSON.stringify(SERMAYE) + " USDC");
  for (const [ad, miktar] of Object.entries(SERMAYE)) {
    if (SECILEN.length && !SECILEN.includes(ad)) continue;
    if (ad === "arc") {
      if (!UYGULA) { console.log("  (kuru) Arc " + miktar + " USDC dogrudan"); continue; }
      const t = await w.sendTransaction({ to: bekci, value: parseEther(miktar) }); await t.wait();
      console.log("  Arc " + miktar + " USDC  " + t.hash); continue;
    }
    if (ad === "base") {
      const bw = w.connect(new JsonRpcProvider(EVM.base.rpc, EVM.base.chainId, { staticNetwork: true }));
      const u = new Contract(USDC.base, ["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"], bw);
      const bak = await u.balanceOf(w.address);
      if (!UYGULA) { console.log("  (kuru) Base " + miktar + " USDC dagiticinin Base USDC'sinden (bakiye " + Number(bak) / 1e6 + ")"); continue; }
      const t = await u.transfer(bekci, parseUnits(miktar, 6)); await t.wait();
      console.log("  Base " + miktar + " USDC  " + t.hash); continue;
    }
    const h = EVM[ad];
    const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      user: w.address, recipient: bekci, originChainId: EVM.arc.chainId, destinationChainId: h.chainId,
      originCurrency: SIFIR, destinationCurrency: USDC[ad], amount: parseEther(miktar).toString(), tradeType: "EXACT_INPUT" }) }).then((x) => x.json());
    if (!q.steps) { console.log("  HATA " + h.ad + " teklif yok"); continue; }
    const c = q.details.currencyOut;
    if (!UYGULA) { console.log("  (kuru) " + h.ad + " " + miktar + " USDC -> " + (Number(c.amount) / 1e6).toFixed(3) + " USDC"); continue; }
    for (const adim of q.steps) for (const it of adim.items || []) {
      if (adim.kind !== "transaction") continue;
      const d = it.data;
      const tx = await w.sendTransaction({ to: d.to, data: d.data, value: BigInt(d.value || 0), ...(d.gas ? { gasLimit: BigInt(d.gas) } : {}) });
      for (let i = 0; i < 40; i++) { const m = await w.provider.getTransactionReceipt(tx.hash).catch(() => null); if (m) break; await bekle(1500); }
      console.log("  " + h.ad + " " + miktar + " USDC -> " + (Number(c.amount) / 1e6).toFixed(3) + " USDC  " + tx.hash);
    }
  }
}
