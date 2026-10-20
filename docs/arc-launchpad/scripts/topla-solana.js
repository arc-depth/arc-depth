"use strict";
/* ===========================================================================
 * topla-solana.js — gather what lies around into SOL on the Solana deployer
 *
 *   node scripts/topla-solana.js            dry: every leg quoted
 *   node scripts/topla-solana.js --uygula   send, one leg after another
 *
 * Every leg is one relay.link order delivering native SOL to the Solana
 * deployer (5H9J…r5gh), paid on its own chain:
 *   20M PTEST1 (the test launch's founder tokens, sold into its Arc pool)
 *   30 USDC of the deployer's Arc balance (~5 stays for gas)
 *   9 USDC of the keeper's Arc balance (6 stays for gas and fills)
 *   Robinhood ETH above a gas reserve, Base USDC above a reserve
 * Nothing the basket holds is touched: collateral stays in its vaults.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, parseEther, parseUnits } = require("ethers");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const SECILEN = process.argv.slice(2).filter((a) => !a.startsWith("--"));   // e.g. "1/5": only legs whose name contains it
const RELAY = "https://api.relay.link";
const SOL = { id: 792703809, para: "11111111111111111111111111111111", alici: "5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh" };
const SIFIR = "0x0000000000000000000000000000000000000000";
const PTEST1 = "0x44DDc45C7a3a8f2A4C2433c19e31b05261778A23";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const bk = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(/^BEKCI_PRIVATE_KEY\s*=\s*(0x[0-9a-fA-F]{64})/m)[1];
  const p = (rpc, id) => new JsonRpcProvider(rpc, id, { staticNetwork: true });
  const arc = p("https://arc-rpc.publicnode.com", 5042), rh = p("https://rpc.mainnet.chain.robinhood.com", 4663), base = p("https://base-rpc.publicnode.com", 8453);
  const dArc = new Wallet(dk, arc), bArc = new Wallet(bk, arc), dRh = new Wallet(dk, rh), dBase = new Wallet(dk, base);
  const rhEth = await rh.getBalance(dRh.address);
  const baseUsdc = await new Contract(BASE_USDC, ["function balanceOf(address) view returns (uint256)"], base).balanceOf(dBase.address);
  const ayak = [
    /* in 4M pieces: the pool's sell shield charges up to 3% more on a block's sale above 0.5% of circulating,
       which relay's quote does not see (one 20M sale reverted "Return amount is not enough") */
    ...[1, 2, 3, 4, 5].map((i) => ({ ad: "4M PTEST1 (Arc) " + i + "/5", w: dArc, zincir: 5042, para: PTEST1, miktar: parseUnits("4000000", 18), kayma: "300" })),
    { ad: "30 USDC (Arc, dagitici)", w: dArc, zincir: 5042, para: SIFIR, miktar: parseEther("30") },
    { ad: "9 USDC (Arc, bekci)", w: bArc, zincir: 5042, para: SIFIR, miktar: parseEther("9") },
    { ad: "Robinhood ETH", w: dRh, zincir: 4663, para: SIFIR, miktar: rhEth > parseEther("0.0008") ? rhEth - parseEther("0.0008") : 0n },
    { ad: "Base USDC", w: dBase, zincir: 8453, para: BASE_USDC, miktar: baseUsdc > parseUnits("0.5", 6) ? baseUsdc - parseUnits("0.5", 6) : 0n },
  ];
  console.log("TOPLA -> SOLANA  " + (UYGULA ? "UYGULA" : "KURU") + "  alici " + SOL.alici);
  let toplam = 0, toplamUsd = 0;
  for (const a of ayak) {
    if (SECILEN.length && !SECILEN.some((x) => a.ad.includes(x))) continue;
    if (a.miktar <= 0n) { console.log("  " + a.ad.padEnd(26) + "bos, atlandi"); continue; }
    const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      user: a.w.address, recipient: SOL.alici, originChainId: a.zincir, destinationChainId: SOL.id, originCurrency: a.para,
      destinationCurrency: SOL.para, amount: a.miktar.toString(), tradeType: "EXACT_INPUT", ...(a.kayma ? { slippageTolerance: a.kayma } : {}) }) }).then((x) => x.json());
    if (!q.steps) { console.log("  HATA " + a.ad + ": " + (q.message || JSON.stringify(q).slice(0, 120))); continue; }
    const c = q.details.currencyOut;
    const sol = Number(c.amount) / 1e9;
    console.log("  " + a.ad.padEnd(26) + "-> " + sol.toFixed(4) + " SOL ($" + Number(c.amountUsd).toFixed(2) + ")" + (UYGULA ? "" : "  (kuru)"));
    if (!UYGULA) { toplam += sol; toplamUsd += Number(c.amountUsd); continue; }
    let durum = "?";
    for (const adim of q.steps) for (const it of adim.items || []) {
      if (adim.kind !== "transaction") continue;
      const d = it.data;
      const t = await a.w.sendTransaction({ to: d.to, data: d.data, value: BigInt(d.value || 0), ...(d.gas ? { gasLimit: BigInt(d.gas) } : {}) });
      for (let i = 0; i < 40; i++) { const m = await a.w.provider.getTransactionReceipt(t.hash).catch(() => null); if (m) { if (m.status !== 1) throw new Error(a.ad + " geri dondu " + t.hash); break; } await bekle(1500); }
      if (it.check && it.check.endpoint) for (let i = 0; i < 60; i++) {
        await bekle(3000);
        const s = await fetch(RELAY + it.check.endpoint).then((x) => x.json()).catch(() => ({}));
        if (["success", "failure", "refund"].includes(s.status)) { durum = s.status; break; }
      }
      console.log("    " + t.hash + "  " + durum);
    }
    if (durum === "success") { toplam += sol; toplamUsd += Number(c.amountUsd); }
  }
  const sb = await fetch("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [SOL.alici] }) }).then((x) => x.json());
  console.log("\n  " + (UYGULA ? "gonderilen" : "gidecek") + " ~" + toplam.toFixed(4) + " SOL ($" + toplamUsd.toFixed(2) + ")   Solana bakiyesi simdi " + (sb.result.value / 1e9).toFixed(4) + " SOL");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
