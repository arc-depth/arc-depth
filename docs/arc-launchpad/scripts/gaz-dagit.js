"use strict";
/* ===========================================================================
 * gaz-dagit.js — move deployment gas from Robinhood ETH to the other chains
 *
 *   node scripts/gaz-dagit.js            # quotes only, sends nothing
 *   node scripts/gaz-dagit.js --uygula   # executes through relay.link
 *
 * The deployer holds ETH on Robinhood and nothing on Arbitrum, BNB,
 * Avalanche, Monad and HyperEVM. relay.link (the route the user trades
 * through) bridges native to native; every target amount is in dollars and
 * sized from rapor/zincir-envanteri.json: 1.5x the full stack, plus margin
 * for LayerZero wiring, minus what is already there. Same wallet on every
 * chain — money changes chain, not owner.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const RELAY = "https://api.relay.link";
const KAYNAK = EVM.robinhood;
const SIFIR = "0x0000000000000000000000000000000000000000";
/* target balance in dollars per chain (stack x1.5 measured 14 Oct + wiring) */
const HEDEF_USD = { arbitrum: 4, bsc: 3, avalanche: 4, monad: 1, hyperevm: 2, base: 2, ethereum: 8 };

function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const f of [path.join("C:", "bot", ".env"), path.join(KOK, ".env")]) {
    try { const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m); if (m) return m[1].trim(); } catch (e) { /* next */ }
  }
  return null;
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const env = JSON.parse(fs.readFileSync(path.join(KOK, "rapor", "zincir-envanteri.json"), "utf8"));
  const w = new Wallet(ozelAnahtar(), new JsonRpcProvider(KAYNAK.rpc, KAYNAK.chainId, { staticNetwork: true }));
  const ethUsd = env.evm.robinhood.bakiyeUsd / env.evm.robinhood.bakiye;
  const kaynakBakiye = Number(await w.provider.getBalance(w.address)) / 1e18;
  console.log("GAZ DAGITIMI  " + (UYGULA ? "UYGULA" : "KURU") + "  kaynak Robinhood " + kaynakBakiye.toFixed(6) + " ETH (~$" + (kaynakBakiye * ethUsd).toFixed(2) + ")");

  let toplamEth = 0;
  for (const [ad, hedefUsd] of Object.entries(HEDEF_USD)) {
    const z = EVM[ad], e = env.evm[ad];
    const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
    const simdi = Number(await p.getBalance(w.address)) / 1e18;
    const fiyat = e.bakiye > 0 ? e.bakiyeUsd / e.bakiye : e.yiginUsd / e.yiginYerel;
    const eksikUsd = hedefUsd - simdi * fiyat;
    if (eksikUsd < 0.5) { console.log("  " + z.ad.padEnd(10) + "yeterli ($" + (simdi * fiyat).toFixed(2) + ")"); continue; }
    const wei = BigInt(Math.ceil((eksikUsd / ethUsd) * 1e18));
    const govde = { user: w.address, recipient: w.address, originChainId: KAYNAK.chainId, destinationChainId: z.chainId,
      originCurrency: SIFIR, destinationCurrency: SIFIR, amount: wei.toString(), tradeType: "EXACT_INPUT" };
    const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
    if (!q.steps) { console.log("  " + z.ad.padEnd(10) + "TEKLIF YOK: " + JSON.stringify(q).slice(0, 160)); continue; }
    const cikis = q.details && q.details.currencyOut;
    console.log("  " + z.ad.padEnd(10) + (Number(wei) / 1e18).toFixed(6) + " ETH -> " +
      (cikis ? (Number(cikis.amount) / 10 ** cikis.currency.decimals).toPrecision(4) + " " + cikis.currency.symbol + " ($" + Number(cikis.amountUsd).toFixed(2) + ")" : "?") +
      "  ucret $" + (q.fees && q.fees.relayer ? Number(q.fees.relayer.amountUsd).toFixed(3) : "?"));
    toplamEth += Number(wei) / 1e18;
    if (!UYGULA) continue;

    for (const adim of q.steps) {
      for (const it of adim.items || []) {
        if (adim.kind !== "transaction") continue;
        const d = it.data;
        const tx = await w.sendTransaction({ to: d.to, data: d.data, value: BigInt(d.value || 0), chainId: Number(d.chainId),
          ...(d.gas ? { gasLimit: BigInt(d.gas) } : {}) });
        let m = null;
        while (!m) { await bekle(1500); m = await w.provider.getTransactionReceipt(tx.hash).catch(() => null); }
        console.log("       gonderildi " + tx.hash + "  durum " + m.status);
        const kontrol = it.check && it.check.endpoint;
        if (kontrol) {
          for (let i = 0; i < 60; i++) {
            await bekle(3000);
            const s = await fetch(RELAY + kontrol).then((x) => x.json()).catch(() => ({}));
            if (s.status === "success") { console.log("       vardi"); break; }
            if (s.status === "failure" || s.status === "refund") { console.log("       BASARISIZ: " + s.status); break; }
          }
        }
      }
    }
  }
  console.log("  toplam " + toplamEth.toFixed(6) + " ETH (~$" + (toplamEth * ethUsd).toFixed(2) + ")" + (UYGULA ? "" : " — kuru, hicbir sey gonderilmedi"));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
