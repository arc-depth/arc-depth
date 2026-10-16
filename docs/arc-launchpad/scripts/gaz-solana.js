"use strict";
/* ===========================================================================
 * gaz-solana.js — SOL for the Solana deployment, from Arc USDC through
 * relay.link (the route used for the first SOL on 14 Oct)
 *
 *   NODE_PATH=C:/Users/omen/araclar/sol/node_modules node scripts/gaz-solana.js            # quote only
 *   NODE_PATH=C:/Users/omen/araclar/sol/node_modules node scripts/gaz-solana.js --uygula   # executes
 *
 * Tops the Solana deployer (SOLANA_PRIVATE_KEY's address) up to HEDEF_SOL:
 * enough for dagit-solana-pulse.js (both programs' rent, the temporary
 * deploy buffer at its peak, two token accounts and fees; measured on
 * yerel-ag 16 Oct: 0.49 SOL net, ~0.8 SOL peak). Pays from the bot wallet's
 * Arc USDC (the user: "Para bot cüzdanında"); the bot's own operation is
 * untouched, only dollars move.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract } = require("ethers");
const { Connection, Keypair } = require("@solana/web3.js");
const { EVM, saglayici } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const RELAY = "https://api.relay.link";
const HEDEF_SOL = 0.9;
const SOLANA_ZINCIR = 792703809;
const SOL = "11111111111111111111111111111111";
const ARC_USDC = EVM.arc.dolar.adres;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function anahtar(dosya, ad) {
  const m = fs.readFileSync(dosya, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(\\S+)\\s*$", "m"));
  if (!m) throw new Error(ad + " yok");
  return m[1];
}

(async () => {
  const sol = Keypair.fromSeed(Buffer.from(anahtar(path.join(KOK, ".env"), "SOLANA_PRIVATE_KEY"), "hex")).publicKey.toBase58();
  const simdi = (await new Connection("https://api.mainnet-beta.solana.com").getBalance(new (require("@solana/web3.js").PublicKey)(sol))) / 1e9;
  const eksik = HEDEF_SOL - simdi;
  const w = new Wallet(anahtar("C:/bot/.env", "TRADER_PRIVATE_KEY"), saglayici("arc"));
  const usdc = new Contract(ARC_USDC, ["function balanceOf(address) view returns (uint256)"], w.provider);
  console.log("GAZ SOLANA  " + (UYGULA ? "UYGULA" : "KURU") + "   Solana dagitici " + sol + "  " + simdi + " SOL (hedef " + HEDEF_SOL + ")");
  console.log("  kaynak: bot cuzdani Arc USDC " + (Number(await usdc.balanceOf(w.address)) / 1e6).toFixed(2));
  if (eksik <= 0.01) return console.log("  yeterli, bir sey gerekmiyor");

  const govde = { user: w.address, recipient: sol, originChainId: EVM.arc.chainId, destinationChainId: SOLANA_ZINCIR,
    originCurrency: ARC_USDC, destinationCurrency: SOL, amount: String(Math.ceil(eksik * 1e9)), tradeType: "EXACT_OUTPUT" };
  const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
  if (!q.steps) throw new Error("teklif yok: " + JSON.stringify(q).slice(0, 200));
  const g = q.details.currencyIn, c = q.details.currencyOut;
  console.log("  teklif: " + (Number(g.amount) / 10 ** g.currency.decimals).toFixed(2) + " " + g.currency.symbol + " -> " + (Number(c.amount) / 1e9).toFixed(4) + " SOL ($" + Number(c.amountUsd).toFixed(2) + ")"
    + "   relay ucreti $" + (q.fees && q.fees.relayer ? Number(q.fees.relayer.amountUsd).toFixed(3) : "?") + "   adim: " + q.steps.map((s) => s.id).join(", "));
  if (!UYGULA) return console.log("  kuru: hicbir sey gonderilmedi");

  for (const adim of q.steps) {
    for (const it of adim.items || []) {
      if (adim.kind !== "transaction") continue;
      const d = it.data;
      const tx = await w.sendTransaction({ to: d.to, data: d.data, value: BigInt(d.value || 0), chainId: Number(d.chainId), ...(d.gas ? { gasLimit: BigInt(d.gas) } : {}) });
      const m = await tx.wait();
      console.log("  " + adim.id + " " + tx.hash + " durum " + m.status);
      const kontrol = it.check && it.check.endpoint;
      if (!kontrol) continue;
      for (let i = 0; i < 80; i++) {
        await bekle(3000);
        const s = await fetch(RELAY + kontrol).then((x) => x.json()).catch(() => ({}));
        if (s.status === "success") { console.log("  vardi"); break; }
        if (s.status === "failure" || s.status === "refund") throw new Error("relay " + s.status);
      }
    }
  }
  await bekle(5000);
  console.log("  Solana dagitici simdi " + (await new Connection("https://api.mainnet-beta.solana.com").getBalance(new (require("@solana/web3.js").PublicKey)(sol))) / 1e9 + " SOL");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
